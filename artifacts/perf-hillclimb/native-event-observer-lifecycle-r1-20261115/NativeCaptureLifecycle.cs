// Draft source only. No static initialization or runnable entry. Not admitted.
using System;
using System.IO;
using System.Threading;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Collections.Generic;
using Microsoft.Win32.SafeHandles;

namespace NativeCapturePrototype {
  public sealed class NativeCallFailure : Exception {
    public readonly string Operation;public readonly int NativeError;
    public NativeCallFailure(string operation,int error):base(operation+" Win32 error "+error) { Operation=operation;NativeError=error; }
  }
  internal sealed class OwnedHandle : SafeHandleZeroOrMinusOneIsInvalid {
    internal OwnedHandle(IntPtr value):base(true) { SetHandle(value); }
    protected override bool ReleaseHandle() { return Native.CloseHandle(handle); }
  }
  internal static class LifecycleNative {
    [DllImport("kernel32.dll")] internal static extern IntPtr GetCurrentProcess();
    [DllImport("kernel32.dll")] internal static extern IntPtr GetCurrentThread();
    [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)]
    internal static extern bool DuplicateHandle(IntPtr sourceProcess,IntPtr source,IntPtr targetProcess,out IntPtr target,UInt32 access,[MarshalAs(UnmanagedType.Bool)]bool inherit,UInt32 options);
    [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)]internal static extern bool CancelSynchronousIo(IntPtr thread);
  }
  public sealed class JobClosure {
    public bool TerminationRequested,EmptyConfirmed;public UInt32 LastActive;
    public readonly List<string> Errors=new List<string>();
  }
  public sealed class OwnedJob : IDisposable {
    readonly OwnedHandle job;bool disposed;
    public OwnedJob() {
      IntPtr handle=Native.CreateJobObjectW(IntPtr.Zero,null);int error=Marshal.GetLastWin32Error();
      if(handle==IntPtr.Zero)throw new NativeCallFailure("CreateJobObject",error);
      job=new OwnedHandle(handle);
      var limits=new JobExtendedLimits();limits.basic.flags=Native.KillOnJobClose;
      if(!Native.SetInformationJobObject(handle,9,ref limits,(UInt32)Marshal.SizeOf(typeof(JobExtendedLimits)))) {
        error=Marshal.GetLastWin32Error();job.Dispose();throw new NativeCallFailure("SetInformationJobObject",error);
      }
    }
    void Open() { if(disposed||job.IsClosed||job.IsInvalid)throw new ObjectDisposedException("OwnedJob"); }
    // Call only with the retained creation handle while its primary thread is suspended.
    public void AssignSuspended(IntPtr ownedProcess) {
      Open();Guard.Require(ownedProcess!=IntPtr.Zero&&ownedProcess!=new IntPtr(-1),"Missing owned creation handle");
      if(!Native.AssignProcessToJobObject(job.DangerousGetHandle(),ownedProcess))throw new NativeCallFailure("AssignProcessToJobObject",Marshal.GetLastWin32Error());
    }
    public JobClosure TerminateAndConfirm(Func<bool> servicePendingDebugEvents,int limitMs) {
      Open();Guard.Require(servicePendingDebugEvents!=null&&limitMs>0&&limitMs<=10000,"Bounded debug-drain callback required");
      var result=new JobClosure();var watch=Stopwatch.StartNew();
      bool killed=Native.TerminateJobObject(job.DangerousGetHandle(),0xe0000001);int killError=Marshal.GetLastWin32Error();
      result.TerminationRequested=killed;if(!killed)result.Errors.Add("TerminateJobObject:"+killError);
      while(watch.ElapsedMilliseconds<limitMs) {
        if(!servicePendingDebugEvents())result.Errors.Add("Debug cleanup drain failed");
        JobAccounting info;bool queried=Native.QueryInformationJobObject(job.DangerousGetHandle(),1,out info,(UInt32)Marshal.SizeOf(typeof(JobAccounting)),IntPtr.Zero);
        int queryError=Marshal.GetLastWin32Error();
        if(!queried) { result.Errors.Add("QueryInformationJobObject:"+queryError);break; }
        result.LastActive=info.activeProcesses;
        if(info.activeProcesses==0) { result.EmptyConfirmed=killed&&result.Errors.Count==0;break; }
        Thread.Sleep(10);
      }
      if(!result.EmptyConfirmed)result.Errors.Add("Job emptiness unconfirmed before bounded cleanup deadline");
      return result; // Handle intentionally remains valid until caller closes after proof.
    }
    public void Dispose() { if(disposed)return;disposed=true;job.Dispose(); }
  }

  public sealed class PipeCollection {
    public byte[] Retained;public long Total;public bool Overflow,Eof,ReaderStopped;public string Error;
    public bool Complete { get { return ReaderStopped&&Eof&&!Overflow&&Error==null; } }
  }
  public sealed class BoundedPipe : IDisposable {
    readonly SafeFileHandle read;readonly OwnedHandle write;readonly BoundedBytes bytes;
    readonly ManualResetEvent ready=new ManualResetEvent(false);readonly object state=new object();
    Thread reader;OwnedHandle readerThread;FileStream stream;bool eof,disposed;string error;
    public BoundedPipe(int maximum) {
      bytes=new BoundedBytes(maximum);
      var attributes=new SecurityAttributes { bytes=(UInt32)Marshal.SizeOf(typeof(SecurityAttributes)),inherit=true,descriptor=IntPtr.Zero };
      IntPtr r,w;bool created=Native.CreatePipe(out r,out w,ref attributes,4096);int createError=Marshal.GetLastWin32Error();
      if(!created)throw new NativeCallFailure("CreatePipe",createError);
      read=new SafeFileHandle(r,true);write=new OwnedHandle(w);
      if(!Native.SetHandleInformation(r,1,0)) {
        int setError=Marshal.GetLastWin32Error();read.Dispose();write.Dispose();throw new NativeCallFailure("SetHandleInformation",setError);
      }
    }
    public IntPtr InheritableWriter { get { Guard.Require(!disposed&&!write.IsClosed,"Pipe writer closed");return write.DangerousGetHandle(); } }
    public bool Overflow { get { return bytes.Overflow; } }
    public void CloseObserverWriter() { write.Dispose(); }
    public void StartReader() {
      Guard.Require(reader==null&&!disposed,"Reader already started/closed");
      reader=new Thread(ReadLoop);reader.IsBackground=true;reader.Start();
      if(!ready.WaitOne(1000))throw new InvalidOperationException("Reader identity unavailable within bound");
      lock(state)Guard.Require(readerThread!=null&&error==null,"Reader initialization failed: "+error);
    }
    void ReadLoop() {
      try {
        IntPtr duplicate;IntPtr process=LifecycleNative.GetCurrentProcess();
        bool copied=LifecycleNative.DuplicateHandle(process,LifecycleNative.GetCurrentThread(),process,out duplicate,0,false,2);int duplicateError=Marshal.GetLastWin32Error();
        if(!copied)throw new NativeCallFailure("Duplicate owned reader thread",duplicateError);
        lock(state)readerThread=new OwnedHandle(duplicate);
        stream=new FileStream(read,FileAccess.Read,4096,false);ready.Set();
        var buffer=new byte[4096];int count;
        while((count=stream.Read(buffer,0,buffer.Length))>0)bytes.Append(buffer,count);
        lock(state)eof=true;
      }catch(Exception problem) { lock(state)error=problem.GetType().Name+":"+problem.Message; }
      finally { ready.Set();if(stream!=null)stream.Dispose();else read.Dispose(); }
    }
    public PipeCollection Finish(int waitMs) {
      Guard.Require(reader!=null&&waitMs>0&&waitMs<=10000,"Started reader and bounded EOF wait required");
      CloseObserverWriter();bool stopped=reader.Join(waitMs);
      if(!stopped) {
        OwnedHandle retained;lock(state)retained=readerThread;
        if(retained!=null&&!retained.IsClosed) {
          bool cancelled=LifecycleNative.CancelSynchronousIo(retained.DangerousGetHandle());int cancelError=Marshal.GetLastWin32Error();
          lock(state)error=(error??"")+";bounded EOF wait expired;cancel="+cancelled+":"+cancelError;
        }else lock(state)error=(error??"")+";bounded EOF wait expired;reader handle unavailable";
        stopped=reader.Join(500);
      }
      lock(state)return new PipeCollection { Retained=bytes.Snapshot(),Total=bytes.Total,Overflow=bytes.Overflow,Eof=eof,ReaderStopped=stopped,Error=error };
    }
    public void Dispose() {
      if(disposed)return;disposed=true;write.Dispose();
      // Never block the debug-loop thread by disposing a stream with a live read.
      if(reader==null) { read.Dispose();ready.Dispose(); }
      else if(!reader.IsAlive) { lock(state)if(readerThread!=null)readerThread.Dispose();ready.Dispose(); }
      // Live-reader/EOF failure stays INCOMPLETE; the bounded outer host owns final exit.
    }
  }
}
