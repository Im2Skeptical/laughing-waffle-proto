using System;
using System.IO;
using System.Threading;
using System.Runtime.InteropServices;
using System.Collections.Generic;
using Microsoft.Win32.SafeHandles;
using NativeCapturePrototype;

namespace NativeCaptureRepair {
  internal sealed class OwnedResource : SafeHandleZeroOrMinusOneIsInvalid,IReturnedCloseOutcome {
    public bool? CloseSucceeded;public string CloseError;public bool AmbiguousAliasAbandoned;public int? CloseRawLastError;
    readonly string label;
    internal OwnedResource(IntPtr value,string resourceLabel="native-handle"):base(true) { label=resourceLabel;SetHandle(value); }
    public string ResourceLabel { get { return label; } }
    public string CloseState { get { return AmbiguousAliasAbandoned?"AMBIGUOUS_ALIAS_NOT_CLOSED":CloseSucceeded==true?"NATIVE_CLOSE_SUCCEEDED":CloseSucceeded==false?"NATIVE_CLOSE_FAILED":IsInvalid?"NOT_OWNED":"NATIVE_CLOSE_PENDING"; } }
    public string CloseDetail { get { return CloseError; } }
    internal Dictionary<string,object> Evidence() { return new Dictionary<string,object>{{"origin",label},{"state",CloseState},{"detail",CloseDetail},{"nativeCalled",CloseSucceeded.HasValue},{"result",CloseSucceeded},{"rawLastError",CloseRawLastError},{"errorValid",CloseSucceeded==false},{"error",CloseSucceeded==false?(object)CloseRawLastError:null}}; }
    internal void Adopt(IntPtr value) { Guard.Require(IsInvalid&&!IsClosed&&value!=IntPtr.Zero&&value!=new IntPtr(-1),"Invalid/duplicate raw handle adoption");SetHandle(value); }
    internal void AbandonAmbiguousAlias() { Guard.Require(!IsClosed,"Cannot abandon closed alias");AmbiguousAliasAbandoned=true;CloseError="Duplicate output aliases another live ownership; no second CloseHandle";SetHandleAsInvalid(); }
    protected override bool ReleaseHandle() {
      try { bool ok=Native.CloseHandle(handle);int error=Marshal.GetLastWin32Error();CloseRawLastError=error;CloseSucceeded=ok;if(!ok)CloseError="CloseHandle:"+error;return ok; }
      catch(Exception error) { CloseSucceeded=false;CloseError=error.GetType().Name;return false; }
    }
  }
  internal static class ExtraNative {
    [DllImport("kernel32.dll")] internal static extern IntPtr GetCurrentProcess();
    [DllImport("kernel32.dll")] internal static extern IntPtr GetCurrentThread();
    [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)]
    internal static extern bool DuplicateHandle(IntPtr sourceProcess,IntPtr source,IntPtr targetProcess,out IntPtr target,UInt32 access,[MarshalAs(UnmanagedType.Bool)]bool inherit,UInt32 options);
    [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)]internal static extern bool CancelSynchronousIo(IntPtr thread);
    [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)]internal static extern bool ReadFile(IntPtr file,[Out]byte[] buffer,UInt32 count,out UInt32 read,IntPtr overlapped);
  }
  public sealed class JobCleanup {
    public bool TerminationRequested,EmptyConfirmed,DeadlineExpired,UnsafeRecoveryRequired;public UInt32 LastActive;
    public bool EvidenceComplete { get { return EmptyConfirmed&&!DeadlineExpired&&!UnsafeRecoveryRequired&&Errors.Count==0; } }
    public readonly List<string> Errors=new List<string>();
  }
  public sealed class RepairedJob : IDisposable {
    readonly object gate=new object();readonly OwnedResource job;bool closeRequested;
    public RepairedJob() {
      job=new OwnedResource(IntPtr.Zero,"job");
      IntPtr value=Native.CreateJobObjectW(IntPtr.Zero,null);int createError=Marshal.GetLastWin32Error();
      if(value==IntPtr.Zero)throw SetupRollback.Release(new InvalidOperationException("CreateJobObject:"+createError),job);
      job.Adopt(value);var limits=new JobExtendedLimits();limits.basic.flags=Native.KillOnJobClose;
      bool configured;int error;
      using(var lease=new HandleLease(job)) {
        configured=Native.SetInformationJobObject(lease.Value,9,ref limits,(UInt32)Marshal.SizeOf(typeof(JobExtendedLimits)));error=Marshal.GetLastWin32Error();
      }
      if(!configured)throw SetupRollback.Release(new InvalidOperationException("SetInformationJobObject:"+error),job);
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
          if(!drain.ExitContinued) {
            DrainStep step=drain.Pump(budget);
            if(!step.Ok&&result.Errors.Count<32)result.Errors.Add(step.Error??"Cleanup drain failed");
            if(!step.MayKeepDraining) { result.UnsafeRecoveryRequired=true;break; }
          }
          JobAccounting accounting;bool queried=Native.QueryInformationJobObject(lease.Value,1,out accounting,(UInt32)Marshal.SizeOf(typeof(JobAccounting)),IntPtr.Zero);int queryError=Marshal.GetLastWin32Error();
          if(!queried) { result.Errors.Add("QueryInformationJobObject:"+queryError);break; }
          result.LastActive=accounting.activeProcesses;
          if(accounting.activeProcesses==0&&drain.ExitContinued) { result.EmptyConfirmed=terminated&&budget.RemainingMs>0;break; }
          int pause=budget.WaitCap(5);if(pause>0)Thread.Sleep(pause);
        }
        result.DeadlineExpired=budget.RemainingMs==0;if(!result.EmptyConfirmed)result.Errors.Add("Owned target exit/job zero unconfirmed");
      }
      return result;
    }
    public void Dispose() { lock(gate) { if(closeRequested)return;closeRequested=true;job.Dispose(); } }
    public bool CloseConfirmed { get { lock(gate)return closeRequested&&job.CloseSucceeded==true; } }
    internal Dictionary<string,object> CloseEvidence { get { lock(gate)return job.Evidence(); } }
    internal bool Contains(SafeHandle process) {
      using(var j=Lease())using(var p=new HandleLease(process)) {
        bool member;bool ok=NativeCaptureController.Api.IsProcessInJob(p.Value,j.Value,out member);int error=Marshal.GetLastWin32Error();
        if(!ok)throw new InvalidOperationException("IsProcessInJob:"+error);return member;
      }
    }
    internal bool QueryEmpty() {
      using(var j=Lease()) { JobAccounting info;bool ok=Native.QueryInformationJobObject(j.Value,1,out info,(UInt32)Marshal.SizeOf(typeof(JobAccounting)),IntPtr.Zero);int error=Marshal.GetLastWin32Error();if(!ok)throw new InvalidOperationException("Query job:"+error);return info.activeProcesses==0; }
    }
    // Borrowed debug-event hProcess stays system-owned while its event is pending.
    internal NativeTrialLifetime.TrialMembership ProbeBorrowedMembership(IntPtr process) {
      using(var j=Lease()) {
        bool member;bool ok=NativeCaptureController.Api.IsProcessInJob(process,j.Value,out member);int error=Marshal.GetLastWin32Error();
        return new NativeTrialLifetime.TrialMembership { Call=NativeCaptureController.BoolNativeReceipt.From("trial.job.membership",ok,error),Member=member,OwnerHeld=true,OwnerHandle=NativeCaptureController.Policy.Hex(unchecked((UInt64)j.Value.ToInt64())) };
      }
    }
    public NativeTrialLifetime.TrialJobQuery QueryTrial(CleanupBudget budget) {
      budget.RequireNativeBudget();return NativeTrialLifetime.TrialJobLogic.Query(budget,()=> {
        using(var j=Lease()) { JobAccounting info;bool ok=Native.QueryInformationJobObject(j.Value,1,out info,(UInt32)Marshal.SizeOf(typeof(JobAccounting)),IntPtr.Zero);int error=Marshal.GetLastWin32Error();
          return new NativeTrialLifetime.TrialJobRaw { Call=NativeCaptureController.BoolNativeReceipt.From("trial.job.active-count",ok,error),OwnerHeld=true,OwnerHandle=NativeCaptureController.Policy.Hex(unchecked((UInt64)j.Value.ToInt64())),ActiveProcesses=info.activeProcesses };
        }
      });
    }
    public NativeTrialLifetime.TrialTermination TerminateTrial(CleanupBudget budget) {
      budget.RequireNativeBudget();return NativeTrialLifetime.TrialJobLogic.Terminate(budget,()=> {
        using(var j=Lease()) { bool ok=Native.TerminateJobObject(j.Value,0xe0000001);int error=Marshal.GetLastWin32Error();
          return new NativeTrialLifetime.TrialJobRaw { Call=NativeCaptureController.BoolNativeReceipt.From("trial.job.terminate",ok,error),OwnerHeld=true,OwnerHandle=NativeCaptureController.Policy.Hex(unchecked((UInt64)j.Value.ToInt64())) };
        }
      });
    }
  }
  public sealed class RepairedPipeResult {
    public byte[] Retained;public long Total;public bool Overflow,Eof,Stopped,ResourcesReleased,DeadlineExpired;
    public string[] Errors;public int DroppedErrors;
    public Dictionary<string,object>[] Releases;
    public bool Complete { get { return Stopped&&ResourcesReleased&&Eof&&!Overflow&&!DeadlineExpired&&Errors.Length==0&&DroppedErrors==0; } }
  }
  public sealed class RepairedPipe : IDisposable {
    readonly object gate=new object();readonly ReaderState life=new ReaderState();
    readonly OwnedResource read,write;readonly BoundedBytes bytes;readonly OwnedWorker worker;
    readonly ManualResetEvent ready;
    OwnedResource readerThread;bool eof;
    public RepairedPipe(int maximum) {
      bytes=new BoundedBytes(maximum);var attributes=new SecurityAttributes { bytes=(UInt32)Marshal.SizeOf(typeof(SecurityAttributes)),descriptor=IntPtr.Zero,inherit=true };
      read=new OwnedResource(IntPtr.Zero,"pipe.read");write=new OwnedResource(IntPtr.Zero,"pipe.write");
      IntPtr r,w;bool made=Native.CreatePipe(out r,out w,ref attributes,4096);int makeError=Marshal.GetLastWin32Error();
      if(!made)throw SetupRollback.Release(new InvalidOperationException("CreatePipe:"+makeError),read,write);
      try {
        read.Adopt(r);write.Adopt(w);
        using(var lease=new HandleLease(read)) {
          bool changed=Native.SetHandleInformation(lease.Value,1,0);int changeError=Marshal.GetLastWin32Error();
          if(!changed)throw new InvalidOperationException("SetHandleInformation:"+changeError);
        }
        ready=new ManualResetEvent(false);worker=new OwnedWorker(ReadLoop);
      }catch(Exception error) {
        throw SetupRollback.Release(error,read,write,ready);
      }
    }
    // The caller must retain this lease until whitelist creation/CreateProcess return.
    public HandleLease LeaseWriter() { lock(gate) { Guard.Require(!life.CloseRequested,"Pipe closing");return new HandleLease(write); } }
    void Error(Exception error) { life.RecordError(error.GetType().Name+":"+error.Message); }
    void SafeSignal() { try { ready.Set(); }catch(Exception error) { Error(error); } }
    public void CloseObserverWriter() { try { write.Dispose(); }catch(Exception error) { Error(error); } }
    public ReaderStartupReceipt StartReader(CleanupBudget budget) {
      budget.RequireNativeBudget();bool operation=false;
      try {
        lock(gate) { life.BeginOperation(true);operation=true;life.Start();worker.Start(); }
        int wait=budget.WaitCap(1000);
        if(wait==0||!ready.WaitOne(wait)) { life.RecordError("Reader startup deadline expired");life.RequestClose();return StartupStatus(budget); }
        if(!life.Ready) { life.RecordError("Reader failed before ready");life.RequestClose(); }
      }catch(Exception error) {
        Error(error);lock(gate) { life.RequestClose();worker.RequestClose();if(worker.NeverStarted) { life.PublishStopped();life.ConfirmJoin(); } }
      }
      finally { if(operation)life.EndOperation();TryFinalize(); }
      return StartupStatus(budget);
    }
    public ReaderStartupReceipt StartupStatus(CleanupBudget budget) {
      lock(gate)return new ReaderStartupReceipt { Ready=life.Ready,WorkerLive=worker.LiveStarted,
        ThreadHandleOwned=readerThread!=null&&!readerThread.IsClosed&&!readerThread.IsInvalid,Closing=life.CloseRequested,
        DeadlineExpired=budget.RemainingMs==0,Errors=life.Errors,DroppedErrors=life.DroppedErrors };
    }
    void ReadLoop() {
      try {
        IntPtr process=ExtraNative.GetCurrentProcess(),thread;
        bool copied=ExtraNative.DuplicateHandle(process,ExtraNative.GetCurrentThread(),process,out thread,0,false,2);int copyError=Marshal.GetLastWin32Error();
        if(!copied)throw new InvalidOperationException("Duplicate reader thread:"+copyError);
        lock(gate)readerThread=new OwnedResource(thread);
        if(life.CloseRequested)return;
        using(var lease=new HandleLease(read)) {
          life.PublishReady();SafeSignal();var buffer=new byte[4096];
          while(true) {
            UInt32 count;bool ok=ExtraNative.ReadFile(lease.Value,buffer,(UInt32)buffer.Length,out count,IntPtr.Zero);int readError=Marshal.GetLastWin32Error();
            PipeReadAction action=PipeReadPolicy.Classify(ok,count,readError);
            if(action==PipeReadAction.Eof) { lock(gate)eof=true;break; }
            if(action==PipeReadAction.Failure)throw new InvalidOperationException("ReadFile:"+readError+":count="+count);
            if(action==PipeReadAction.NoData)continue;bytes.Append(buffer,checked((int)count));
          }
        }
      }catch(Exception error) { Error(error); }
      finally {
        try { read.Dispose();if(read.CloseSucceeded==false)life.RecordError(read.CloseError??"Read handle release failed"); }catch(Exception error) { Error(error); }
        try { SafeSignal(); }catch(Exception error) { Error(error); }
        life.PublishStopped(); // Owner must still prove actual Join before finalization.
      }
    }
    bool JoinWithin(CleanupBudget budget,int cap) {
      if(worker.NeverStarted) { life.PublishStopped();life.ConfirmJoin();return true; }
      int wait=budget.WaitCap(cap);if(wait==0)return false;
      if(!worker.Join(wait))return false;life.ConfirmJoin();return true;
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
        lock(gate) { life.RequestClose();worker.RequestClose(); }CloseObserverWriter();
        if(!JoinWithin(budget,100)) { if(budget.RemainingMs>0)CancelOwnedReader();if(!JoinWithin(budget,10000))life.RecordError("Reader join not confirmed by shared deadline"); }
      }finally { life.EndOperation();TryFinalize(); }
      lock(gate)return new RepairedPipeResult { Retained=bytes.Snapshot(),Total=bytes.Total,Overflow=bytes.Overflow,Eof=eof,
        Stopped=worker.TerminalProved,ResourcesReleased=life.ResourcesReleased,DeadlineExpired=budget.RemainingMs==0,Errors=life.Errors,DroppedErrors=life.DroppedErrors,Releases=new[]{read.Evidence(),write.Evidence(),readerThread==null?new Dictionary<string,object>{{"origin","reader-thread"},{"state","NOT_OWNED"}}:readerThread.Evidence()} };
    }
    void TryFinalize() {
      lock(gate) {
        if(!life.ClaimFinalization())return;bool success=true;
        try { write.Dispose();if(write.CloseSucceeded!=true) { if(write.CloseSucceeded==false)life.RecordError(write.CloseError??"Writer release failed");success=false; } }catch(Exception error) { Error(error);success=false; }
        try { read.Dispose();if(read.CloseSucceeded!=true) { if(read.CloseSucceeded==false)life.RecordError(read.CloseError??"Read release failed");success=false; } }catch(Exception error) { Error(error);success=false; }
        try { if(readerThread!=null) { readerThread.Dispose();if(readerThread.CloseSucceeded!=true) { if(readerThread.CloseSucceeded==false)life.RecordError(readerThread.CloseError??"Thread release failed");success=false; } } }catch(Exception error) { Error(error);success=false; }
        try { ready.Dispose(); }catch(Exception error) { Error(error);success=false; }
        if(success)life.ConfirmResourcesReleased();
      }
    }
    public void Dispose() {
      lock(gate) { life.RequestClose();worker.RequestClose();CloseObserverWriter();if(worker.Join(0)) { life.PublishStopped();life.ConfirmJoin(); } }
      TryFinalize(); // Repeated Dispose can finish a previously running reader.
    }
  }
}
