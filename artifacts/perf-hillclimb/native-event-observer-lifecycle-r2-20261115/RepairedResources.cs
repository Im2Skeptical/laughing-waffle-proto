using System;
using System.IO;
using System.Threading;
using System.Runtime.InteropServices;
using System.Collections.Generic;
using Microsoft.Win32.SafeHandles;
using NativeCapturePrototype;

namespace NativeCaptureRepair {
  internal sealed class OwnedResource : SafeHandleZeroOrMinusOneIsInvalid {
    public bool? CloseSucceeded;public string CloseError;
    internal OwnedResource(IntPtr value):base(true) { SetHandle(value); }
    protected override bool ReleaseHandle() {
      try { bool ok=Native.CloseHandle(handle);int error=Marshal.GetLastWin32Error();CloseSucceeded=ok;if(!ok)CloseError="CloseHandle:"+error;return ok; }
      catch(Exception error) { CloseSucceeded=false;CloseError=error.GetType().Name;return false; }
    }
  }
  internal static class ExtraNative {
    [DllImport("kernel32.dll")] internal static extern IntPtr GetCurrentProcess();
    [DllImport("kernel32.dll")] internal static extern IntPtr GetCurrentThread();
    [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)]
    internal static extern bool DuplicateHandle(IntPtr sourceProcess,IntPtr source,IntPtr targetProcess,out IntPtr target,UInt32 access,[MarshalAs(UnmanagedType.Bool)]bool inherit,UInt32 options);
    [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)]internal static extern bool CancelSynchronousIo(IntPtr thread);
  }
  public sealed class JobCleanup {
    public bool TerminationRequested,EmptyConfirmed,DeadlineExpired;public UInt32 LastActive;
    public readonly List<string> Errors=new List<string>();
  }
  public sealed class RepairedJob : IDisposable {
    readonly object gate=new object();readonly OwnedResource job;bool closeRequested;
    public RepairedJob() {
      IntPtr value=Native.CreateJobObjectW(IntPtr.Zero,null);int createError=Marshal.GetLastWin32Error();
      if(value==IntPtr.Zero)throw new InvalidOperationException("CreateJobObject:"+createError);
      job=new OwnedResource(value);var limits=new JobExtendedLimits();limits.basic.flags=Native.KillOnJobClose;
      using(var lease=new HandleLease(job)) {
        bool configured=Native.SetInformationJobObject(lease.Value,9,ref limits,(UInt32)Marshal.SizeOf(typeof(JobExtendedLimits)));int error=Marshal.GetLastWin32Error();
        if(!configured) { job.Dispose();throw new InvalidOperationException("SetInformationJobObject:"+error); }
      }
    }
    HandleLease Lease() { lock(gate) { Guard.Require(!closeRequested,"Job closing");return new HandleLease(job); } }
    // Caller supplies a retained SafeHandle for the newly created suspended target.
    public void AssignSuspended(SafeHandle ownedProcess) {
      using(var j=Lease())using(var p=new HandleLease(ownedProcess)) {
        bool ok=Native.AssignProcessToJobObject(j.Value,p.Value);int error=Marshal.GetLastWin32Error();
        if(!ok)throw new InvalidOperationException("AssignProcessToJobObject:"+error);
      }
    }
    public JobCleanup TerminateAndConfirm(CleanupDebugDrain drain,CleanupBudget budget) {
      Guard.Require(drain!=null&&budget!=null,"Concrete drain/shared cleanup budget required");budget.RequireNativeBudget();
      var result=new JobCleanup();using(var lease=Lease()) {
        if(budget.RemainingMs==0) { result.DeadlineExpired=true;result.Errors.Add("Deadline expired before job termination");return result; }
        bool terminated=Native.TerminateJobObject(lease.Value,0xe0000001);int terminateError=Marshal.GetLastWin32Error();
        result.TerminationRequested=terminated;if(!terminated)result.Errors.Add("TerminateJobObject:"+terminateError);
        while(budget.RemainingMs>0) {
          if(!drain.ExitContinued) { DrainStep step=drain.Pump(budget);if(!step.Ok) { result.Errors.Add(step.Error??"Cleanup drain failed");break; } }
          JobAccounting accounting;bool queried=Native.QueryInformationJobObject(lease.Value,1,out accounting,(UInt32)Marshal.SizeOf(typeof(JobAccounting)),IntPtr.Zero);int queryError=Marshal.GetLastWin32Error();
          if(!queried) { result.Errors.Add("QueryInformationJobObject:"+queryError);break; }
          result.LastActive=accounting.activeProcesses;
          if(accounting.activeProcesses==0&&drain.ExitContinued) { result.EmptyConfirmed=terminated&&result.Errors.Count==0&&budget.RemainingMs>0;break; }
          int pause=budget.WaitCap(5);if(pause>0)Thread.Sleep(pause);
        }
        result.DeadlineExpired=budget.RemainingMs==0;if(!result.EmptyConfirmed)result.Errors.Add("Owned target exit/job zero unconfirmed");
      }
      return result;
    }
    public void Dispose() { lock(gate) { if(closeRequested)return;closeRequested=true;job.Dispose(); } }
    public bool CloseConfirmed { get { lock(gate)return closeRequested&&job.CloseSucceeded==true; } }
  }
  public sealed class RepairedPipeResult {
    public byte[] Retained;public long Total;public bool Overflow,Eof,Stopped,ResourcesReleased,DeadlineExpired;
    public string[] Errors;public int DroppedErrors;
    public bool Complete { get { return Stopped&&ResourcesReleased&&Eof&&!Overflow&&!DeadlineExpired&&Errors.Length==0&&DroppedErrors==0; } }
  }
  public sealed class RepairedPipe : IDisposable {
    readonly object gate=new object();readonly ReaderState life=new ReaderState();
    readonly SafeFileHandle read;readonly OwnedResource write;readonly BoundedBytes bytes;
    readonly ManualResetEvent ready=new ManualResetEvent(false);
    Thread reader;OwnedResource readerThread;FileStream stream;bool eof;
    public RepairedPipe(int maximum) {
      bytes=new BoundedBytes(maximum);var attributes=new SecurityAttributes { bytes=(UInt32)Marshal.SizeOf(typeof(SecurityAttributes)),descriptor=IntPtr.Zero,inherit=true };
      IntPtr r,w;bool made=Native.CreatePipe(out r,out w,ref attributes,4096);int makeError=Marshal.GetLastWin32Error();
      if(!made)throw new InvalidOperationException("CreatePipe:"+makeError);
      read=new SafeFileHandle(r,true);write=new OwnedResource(w);
      using(var lease=new HandleLease(read)) {
        bool changed=Native.SetHandleInformation(lease.Value,1,0);int changeError=Marshal.GetLastWin32Error();
        if(!changed) { read.Dispose();write.Dispose();ready.Dispose();throw new InvalidOperationException("SetHandleInformation:"+changeError); }
      }
    }
    // The caller must retain this lease until whitelist creation/CreateProcess return.
    public HandleLease LeaseWriter() { lock(gate) { Guard.Require(!life.CloseRequested,"Pipe closing");return new HandleLease(write); } }
    void Error(Exception error) { life.RecordError(error.GetType().Name+":"+error.Message); }
    void SafeSignal() { try { ready.Set(); }catch(Exception error) { Error(error); } }
    public void CloseObserverWriter() { try { write.Dispose(); }catch(Exception error) { Error(error); } }
    public void StartReader(CleanupBudget budget) {
      budget.RequireNativeBudget();bool operation=false;
      try {
        lock(gate) { Guard.Require(reader==null,"Reader already initialized");life.BeginOperation(true);operation=true;life.Start();reader=new Thread(ReadLoop);reader.IsBackground=true; }
        reader.Start();int wait=budget.WaitCap(1000);
        if(wait==0||!ready.WaitOne(wait)) { life.RecordError("Reader startup deadline expired");life.RequestClose();return; }
        if(!life.Ready) { life.RecordError("Reader failed before ready");life.RequestClose(); }
      }catch(Exception error) {
        Error(error);life.RequestClose();Thread current;lock(gate)current=reader;
        if(current==null||(current.ThreadState&ThreadState.Unstarted)!=0) { life.PublishStopped();life.ConfirmJoin(); }
      }
      finally { if(operation)life.EndOperation();TryFinalize(); }
    }
    void ReadLoop() {
      try {
        IntPtr process=ExtraNative.GetCurrentProcess(),thread;
        bool copied=ExtraNative.DuplicateHandle(process,ExtraNative.GetCurrentThread(),process,out thread,0,false,2);int copyError=Marshal.GetLastWin32Error();
        if(!copied)throw new InvalidOperationException("Duplicate reader thread:"+copyError);
        lock(gate)readerThread=new OwnedResource(thread);
        if(life.CloseRequested)return;
        stream=new FileStream(read,FileAccess.Read,4096,false);life.PublishReady();SafeSignal();
        var buffer=new byte[4096];int count;while((count=stream.Read(buffer,0,buffer.Length))>0)bytes.Append(buffer,count);
        lock(gate)eof=true;
      }catch(Exception error) { Error(error); }
      finally {
        try { if(stream!=null)stream.Dispose();else read.Dispose(); }catch(Exception error) { Error(error); }
        try { SafeSignal(); }catch(Exception error) { Error(error); }
        life.PublishStopped(); // Owner must still prove actual Join before finalization.
      }
    }
    bool JoinWithin(CleanupBudget budget,int cap) {
      Thread current;lock(gate)current=reader;
      if(current==null)return true;
      if((current.ThreadState&ThreadState.Unstarted)!=0) { life.PublishStopped();life.ConfirmJoin();return true; }
      int wait=budget.WaitCap(cap);if(wait==0)return false;
      if(!current.Join(wait))return false;life.ConfirmJoin();return true;
    }
    void CancelOwnedReader() {
      HandleLease lease=null;
      try {
        lock(gate)if(readerThread!=null)lease=new HandleLease(readerThread);
        if(lease==null) { life.RecordError("Reader thread identity unavailable for cancel");return; }
        bool requested=ExtraNative.CancelSynchronousIo(lease.Value);int cancelError=Marshal.GetLastWin32Error();
        life.RecordError("Bounded EOF wait expired; cancellation request="+requested+":"+cancelError);
      }catch(Exception error) { Error(error); }
      finally { if(lease!=null)lease.Dispose(); }
    }
    public RepairedPipeResult Finish(CleanupBudget budget) {
      budget.RequireNativeBudget();life.BeginOperation(false);
      try {
        life.RequestClose();CloseObserverWriter();
        if(!JoinWithin(budget,100)) { if(budget.RemainingMs>0)CancelOwnedReader();if(!JoinWithin(budget,10000))life.RecordError("Reader join not confirmed by shared deadline"); }
      }finally { life.EndOperation();TryFinalize(); }
      lock(gate)return new RepairedPipeResult { Retained=bytes.Snapshot(),Total=bytes.Total,Overflow=bytes.Overflow,Eof=eof,
        Stopped=reader==null||!reader.IsAlive,ResourcesReleased=life.ResourcesReleased,DeadlineExpired=budget.RemainingMs==0,Errors=life.Errors,DroppedErrors=life.DroppedErrors };
    }
    void TryFinalize() {
      lock(gate) {
        if(!life.ClaimFinalization())return;bool success=true;
        try { write.Dispose();if(write.CloseSucceeded!=true) { life.RecordError(write.CloseError??"Writer release unconfirmed");success=false; } }catch(Exception error) { Error(error);success=false; }
        try { if(reader==null)read.Dispose(); }catch(Exception error) { Error(error);success=false; }
        try { if(readerThread!=null) { readerThread.Dispose();if(readerThread.CloseSucceeded!=true) { life.RecordError(readerThread.CloseError??"Thread release unconfirmed");success=false; } } }catch(Exception error) { Error(error);success=false; }
        try { ready.Dispose(); }catch(Exception error) { Error(error);success=false; }
        if(success)life.ConfirmResourcesReleased();
      }
    }
    public void Dispose() {
      lock(gate) { life.RequestClose();CloseObserverWriter();if(reader!=null&&!reader.IsAlive) { life.PublishStopped();life.ConfirmJoin(); } }
      TryFinalize(); // Repeated Dispose can finish a previously running reader.
    }
  }
}
