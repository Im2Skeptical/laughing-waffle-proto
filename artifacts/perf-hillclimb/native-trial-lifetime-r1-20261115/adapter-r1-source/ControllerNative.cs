using System;
using System.Text;
using System.IO;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Collections.Generic;
using NativeCapturePrototype;
using NativeCaptureRepair;

namespace NativeCaptureController {
  public static class SupervisorFailsafe {
    public static bool StopExactHost(UInt32 pid,UInt64 expectedCreated,string expectedImage) {
      IntPtr raw=Api.OpenProcess(0x00101001,false,pid);int openError=Marshal.GetLastWin32Error();
      if(raw==IntPtr.Zero)throw new InvalidOperationException("Open owned supervisor host:"+openError);
      using(var process=new OwnedResource(raw))using(var lease=new HandleLease(process)) {
        Guard.Require(Api.GetProcessId(lease.Value)==pid,"Failsafe PID mismatch");
        FileTimePair created,exited,kernel,user;bool timed=Native.GetProcessTimes(lease.Value,out created,out exited,out kernel,out user);int timeError=Marshal.GetLastWin32Error();
        if(!timed)throw new InvalidOperationException("Failsafe process times:"+timeError);
        Guard.Require((((UInt64)created.high<<32)|created.low)==expectedCreated,"Failsafe creation mismatch; no termination");
        var image=new StringBuilder(32768);UInt32 size=(UInt32)image.Capacity;bool named=Native.QueryFullProcessImageNameW(lease.Value,0,image,ref size);int imageError=Marshal.GetLastWin32Error();
        if(!named)throw new InvalidOperationException("Failsafe image:"+imageError);
        Guard.Require(String.Equals(Policy.CanonicalImage(image.ToString()),Policy.CanonicalImage(expectedImage),StringComparison.OrdinalIgnoreCase),"Failsafe image mismatch; no termination");
        if(Native.WaitForSingleObject(lease.Value,0)==0)return true;
        bool killed=Native.TerminateProcess(lease.Value,0xe0000003);int killError=Marshal.GetLastWin32Error();if(!killed)throw new InvalidOperationException("Exact host termination:"+killError);
        return Native.WaitForSingleObject(lease.Value,5000)==0;
      }
    }
  }
  internal static class Api {
    [DllImport("kernel32.dll",ExactSpelling=true,SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)]internal static extern bool GetExitCodeProcess(IntPtr process,out UInt32 code);
    [DllImport("kernel32.dll",ExactSpelling=true,SetLastError=true)]internal static extern UInt32 GetProcessId(IntPtr process);
    [DllImport("kernel32.dll",ExactSpelling=true,SetLastError=true)]internal static extern UInt32 GetThreadId(IntPtr thread);
    [DllImport("kernel32.dll",ExactSpelling=true,SetLastError=true)]internal static extern UInt32 GetProcessIdOfThread(IntPtr thread);
    [DllImport("kernel32.dll",ExactSpelling=true,SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)]internal static extern bool IsWow64Process2(IntPtr process,out UInt16 processMachine,out UInt16 nativeMachine);
    [DllImport("kernel32.dll",ExactSpelling=true,SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)]internal static extern bool IsProcessInJob(IntPtr process,IntPtr job,[MarshalAs(UnmanagedType.Bool)]out bool member);
    [DllImport("kernel32.dll",ExactSpelling=true,SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)]internal static extern bool DebugActiveProcessStop(UInt32 pid);
    [DllImport("kernel32.dll",ExactSpelling=true,SetLastError=true)]internal static extern IntPtr OpenProcess(UInt32 access,[MarshalAs(UnmanagedType.Bool)]bool inherit,UInt32 pid);
  }
  internal sealed class AttributeHandles : IDisposable {
    IntPtr list,values;bool initialized,disposed;
    internal IntPtr Pointer { get { Guard.Require(!disposed&&initialized,"Attribute list unavailable");return list; } }
    internal AttributeHandles(IntPtr stdin,IntPtr stdout,IntPtr stderr) {
      UIntPtr size=UIntPtr.Zero;
      bool first=Native.InitializeProcThreadAttributeList(IntPtr.Zero,1,0,ref size);int firstError=Marshal.GetLastWin32Error();
      Guard.Require(!first&&firstError==122&&size.ToUInt64()>0&&size.ToUInt64()<=65536,"Unexpected attribute allocation query");
      try {
        list=Marshal.AllocHGlobal((int)size.ToUInt64());
        bool second=Native.InitializeProcThreadAttributeList(list,1,0,ref size);int secondError=Marshal.GetLastWin32Error();
        if(!second)throw new InvalidOperationException("InitializeProcThreadAttributeList:"+secondError);initialized=true;
        values=Marshal.AllocHGlobal(3*IntPtr.Size);Marshal.WriteIntPtr(values,0,stdin);Marshal.WriteIntPtr(values,IntPtr.Size,stdout);Marshal.WriteIntPtr(values,2*IntPtr.Size,stderr);
        bool updated=Native.UpdateProcThreadAttribute(list,0,Native.HandleListAttribute,values,new UIntPtr((uint)(3*IntPtr.Size)),IntPtr.Zero,IntPtr.Zero);int updateError=Marshal.GetLastWin32Error();
        if(!updated)throw new InvalidOperationException("UpdateProcThreadAttribute:"+updateError);
      }catch { Dispose();throw; }
    }
    public void Dispose() {
      if(disposed)return;disposed=true;
      try { if(initialized)Native.DeleteProcThreadAttributeList(list); }
      finally { if(values!=IntPtr.Zero)Marshal.FreeHGlobal(values);if(list!=IntPtr.Zero)Marshal.FreeHGlobal(list); }
    }
  }
  internal sealed class OwnedTarget : IDisposable {
    internal readonly OwnedResource Process,Thread;
    readonly OwnedResource originalProcess,originalThread,waitDuplicate;
    internal UInt32 Pid,Tid,CreatingThread;internal UInt64 CreatedFileTime;internal string Image;
    internal bool Created,Assigned,Resumed;
    UInt64 originalProcessRaw,originalThreadRaw,processRaw,threadRaw,debugProcessRaw,debugThreadRaw,waitRaw;
    bool creationIdentityVerified,waitIdentityVerified,debugCreateBound,debugExitContinued,activeAlias,originalsClosedBeforeDebugCreate;
    internal readonly List<Dictionary<string,object>> Duplications=new List<Dictionary<string,object>>();
    internal readonly List<ProcessWaitReceipt> Waits=new List<ProcessWaitReceipt>();
    internal readonly List<BoolNativeReceipt> RecoveryCalls=new List<BoolNativeReceipt>();
    internal OwnedTarget() { Process=new OwnedResource(IntPtr.Zero,"creation.process.independent-duplicate");Thread=new OwnedResource(IntPtr.Zero,"creation.thread.independent-duplicate");originalProcess=new OwnedResource(IntPtr.Zero,"CreateProcess.returned.process");originalThread=new OwnedResource(IntPtr.Zero,"CreateProcess.returned.thread");waitDuplicate=new OwnedResource(IntPtr.Zero,"CREATE_EVENT.process.wait-duplicate"); }
    static UInt64 Raw(IntPtr p) { return unchecked((UInt64)p.ToInt64()); }
    UInt64[] OtherLive(OwnedResource candidate) {
      var raw=new List<UInt64>();foreach(var item in new[]{originalProcess,originalThread,Process,Thread,waitDuplicate})if(!Object.ReferenceEquals(item,candidate)&&!item.IsClosed&&!item.IsInvalid)raw.Add(Raw(item.DangerousGetHandle()));
      if(debugProcessRaw!=0)raw.Add(debugProcessRaw);if(debugThreadRaw!=0)raw.Add(debugThreadRaw);return raw.ToArray();
    }
    void Duplicate(IntPtr source,OwnedResource destination,string origin) {
      IntPtr made;bool ok=ExtraNative.DuplicateHandle(ExtraNative.GetCurrentProcess(),source,ExtraNative.GetCurrentProcess(),out made,0,false,2);int error=Marshal.GetLastWin32Error();
      bool alias=false;if(ok) { destination.Adopt(made);alias=!HandleIndependence.CanOwn(Raw(source),Raw(made),OtherLive(destination));if(alias) { activeAlias=true;destination.AbandonAmbiguousAlias(); } }
      Duplications.Add(new Dictionary<string,object>{{"origin",origin},{"source",Policy.Hex(Raw(source))},{"produced",Policy.Hex(Raw(made))},{"result",ok},{"errorValid",!ok},{"error",ok?null:(object)error},{"rawLastError",error},{"activeAlias",alias},{"inherit",false},{"sameAccess",true}});
      if(!ok)throw new InvalidOperationException("Duplicate owned handle:"+origin+":"+error);Guard.Require(!alias,"Duplicate handle is not independent");
    }
    internal void Create(IProcessLaunch c,RepairedJob job,RepairedPipe output,RepairedPipe error,OwnedResource stdin) {
      CreatingThread=Native.GetCurrentThreadId();
      using(var inLease=new HandleLease(stdin))using(var outLease=output.LeaseWriter())using(var errorLease=error.LeaseWriter())
      using(var attributes=new AttributeHandles(inLease.Value,outLease.Value,errorLease.Value)) {
        var startup=new StartupInfoEx64();startup.startup.cb=(UInt32)Marshal.SizeOf(typeof(StartupInfoEx64));startup.startup.flags=0x100;
        startup.startup.stdInput=inLease.Value;startup.startup.stdOutput=outLease.Value;startup.startup.stdError=errorLease.Value;startup.attributes=attributes.Pointer;
        ProcessInformation64 info;
        bool made=Native.CreateProcessW(c.Executable,new StringBuilder(c.CommandLine),IntPtr.Zero,IntPtr.Zero,true,
          Native.DebugProcess|Native.CreateSuspended|Native.ExtendedStartupInfo|Native.CreateNoWindow,IntPtr.Zero,c.Cwd,ref startup,out info);
        int createError=Marshal.GetLastWin32Error();if(!made)throw new InvalidOperationException("CreateProcessW:"+createError);
        // Wrappers are preallocated, so no managed wrapper allocation can orphan these outputs.
        originalProcess.Adopt(info.process);originalProcessRaw=Raw(info.process);Pid=info.processId;Tid=info.threadId;Created=true;originalThread.Adopt(info.thread);originalThreadRaw=Raw(info.thread);
      }
      // These independent duplicates remain caller-owned across all debug-event exits.
      using(var process=new HandleLease(originalProcess))Duplicate(process.Value,Process,"CreateProcess.returned.process");
      processRaw=Raw(Process.DangerousGetHandle());
      using(var thread=new HandleLease(originalThread))Duplicate(thread.Value,Thread,"CreateProcess.returned.thread");
      threadRaw=Raw(Thread.DangerousGetHandle());
      originalThread.Dispose();originalProcess.Dispose();
      Guard.Require(originalThread.CloseSucceeded==true&&originalProcess.CloseSucceeded==true,"Creation originals close unconfirmed before debug CREATE delivery");
      originalsClosedBeforeDebugCreate=true;
      output.CloseObserverWriter();error.CloseObserverWriter();stdin.Dispose();
      using(var process=new HandleLease(Process)) {
        Guard.Require(Pid>0&&Tid>0&&Api.GetProcessId(process.Value)==Pid,"Creation PID mismatch");
        var image=new StringBuilder(32768);UInt32 count=(UInt32)image.Capacity;
        bool named=Native.QueryFullProcessImageNameW(process.Value,0,image,ref count);int imageError=Marshal.GetLastWin32Error();
        if(!named)throw new InvalidOperationException("QueryFullProcessImageName:"+imageError);
        Image=Policy.CanonicalImage(image.ToString());Guard.Require(String.Equals(Image,Policy.CanonicalImage(c.Executable),StringComparison.OrdinalIgnoreCase),"Actual executable differs");
        FileTimePair created,exited,kernel,user;bool timed=Native.GetProcessTimes(process.Value,out created,out exited,out kernel,out user);int timeError=Marshal.GetLastWin32Error();
        if(!timed)throw new InvalidOperationException("GetProcessTimes:"+timeError);CreatedFileTime=((UInt64)created.high<<32)|created.low;
      }
      using(var thread=new HandleLease(Thread))Guard.Require(Api.GetThreadId(thread.Value)==Tid,"Independent creation thread identity mismatch");
      creationIdentityVerified=true;
      Guard.Require(Guard.Sha256(c.Executable)==c.ExecutableHash,"Executable changed during creation");
      job.AssignSuspended(Process);Assigned=true;
      bool killPolicy=Native.DebugSetProcessKillOnExit(true);int policyError=Marshal.GetLastWin32Error();if(!killPolicy)throw new InvalidOperationException("DebugSetProcessKillOnExit:"+policyError);
    }
    internal void Resume() {
      Guard.Require(Created&&Assigned&&!Resumed&&Native.GetCurrentThreadId()==CreatingThread,"Resume ownership/state mismatch");
      using(var thread=new HandleLease(Thread)) { UInt32 previous=Native.ResumeThread(thread.Value);int error=Marshal.GetLastWin32Error();if(previous!=1)throw new InvalidOperationException("ResumeThread previous="+previous+":error="+error); }
      Resumed=true;
    }
    internal void BindDebugCreate(Dictionary<string,object> record) {
      Guard.Require(!debugCreateBound&&Created&&creationIdentityVerified&&originalsClosedBeforeDebugCreate&&(UInt32)record["pid"]==Pid&&(UInt32)record["tid"]==Tid,"CREATE debug identity/order mismatch");
      debugProcessRaw=(UInt64)record["processHandle"];debugThreadRaw=(UInt64)record["threadHandle"];
      Guard.Require(debugProcessRaw!=0&&debugProcessRaw!=UInt64.MaxValue&&debugThreadRaw!=0&&debugThreadRaw!=UInt64.MaxValue,"CREATE event handles unavailable");
      if(processRaw==debugProcessRaw||processRaw==debugThreadRaw) { activeAlias=true;Process.AbandonAmbiguousAlias(); }
      if(threadRaw==debugProcessRaw||threadRaw==debugThreadRaw) { activeAlias=true;Thread.AbandonAmbiguousAlias(); }
      Guard.Require(!activeAlias,"Live creation duplicate aliases system-owned debug handle");
      Duplicate(new IntPtr(unchecked((long)debugProcessRaw)),waitDuplicate,"CREATE_PROCESS_DEBUG_EVENT.process");waitRaw=Raw(waitDuplicate.DangerousGetHandle());
      using(var process=new HandleLease(waitDuplicate)) {
        Guard.Require(Api.GetProcessId(process.Value)==Pid,"Wait duplicate PID mismatch");
        FileTimePair created,exited,kernel,user;bool timed=Native.GetProcessTimes(process.Value,out created,out exited,out kernel,out user);int timeError=Marshal.GetLastWin32Error();
        if(!timed)throw new InvalidOperationException("Wait duplicate GetProcessTimes:"+timeError);
        Guard.Require((((UInt64)created.high<<32)|created.low)==CreatedFileTime,"Wait duplicate creation mismatch");
        var image=new StringBuilder(32768);UInt32 size=(UInt32)image.Capacity;bool named=Native.QueryFullProcessImageNameW(process.Value,0,image,ref size);int imageError=Marshal.GetLastWin32Error();
        if(!named)throw new InvalidOperationException("Wait duplicate image:"+imageError);
        Guard.Require(String.Equals(Policy.CanonicalImage(image.ToString()),Image,StringComparison.OrdinalIgnoreCase),"Wait duplicate image mismatch");
      }
      waitIdentityVerified=true;debugCreateBound=true;
    }
    internal void ConfirmDebugExit() { debugExitContinued=true; }
    internal UInt64[] LiveOwnedRaw() {
      var live=new List<UInt64>();foreach(var item in new[]{originalProcess,originalThread,Process,Thread,waitDuplicate})if(!item.IsInvalid&&!item.IsClosed)live.Add(Raw(item.DangerousGetHandle()));return live.ToArray();
    }
    WaitSource Source(bool fallback,out OwnedResource resource) {
      if(waitIdentityVerified&&!waitDuplicate.IsInvalid&&!waitDuplicate.IsClosed) { resource=waitDuplicate;return new WaitSource { Origin="CREATE_PROCESS_DEBUG_EVENT.independent-duplicate",Handle=Policy.Hex(waitRaw),CreatedFileTimeHex=Policy.Hex(CreatedFileTime),Image=Image,Pid=Pid,Independent=true,IdentityVerified=true }; }
      if(fallback&&creationIdentityVerified&&!Process.IsInvalid&&!Process.IsClosed) { resource=Process;return new WaitSource { Origin="CreateProcess.independent-duplicate.RECOVERY_ONLY",Handle=Policy.Hex(processRaw),CreatedFileTimeHex=Policy.Hex(CreatedFileTime),Image=Image,Pid=Pid,Independent=true,IdentityVerified=true }; }
      resource=null;return null;
    }
    internal ProcessWaitReceipt ObserveExit(CleanupBudget budget,int maximum,string phase,bool recoveryFallback=false) {
      budget.RequireNativeBudget();OwnedResource resource;WaitSource source=Source(recoveryFallback,out resource);ProcessWaitReceipt receipt;
      if(resource==null)receipt=ProcessWaitLogic.Observe(budget,maximum,phase,null,ms=>{throw new InvalidOperationException("Unavailable wait source must not invoke native code");});
      else using(var lease=new HandleLease(resource))receipt=ProcessWaitLogic.Observe(budget,maximum,phase,source,ms=> { UInt32 status=Native.WaitForSingleObject(lease.Value,ms);int error=Marshal.GetLastWin32Error();return new NativeWaitOutcome { Status=status,RawLastError=error }; });
      Waits.Add(receipt);return receipt;
    }
    internal bool OwnedStopAndDetach(CleanupBudget budget,List<string> errors) {
      budget.RequireNativeBudget();if(!Created)return true;
      ProcessWaitReceipt probe=ObserveExit(budget,0,"pre-failsafe-probe",true);if(probe.Complete)return true;
      if(!creationIdentityVerified||Process.IsInvalid||Process.IsClosed) { errors.Add("Failsafe creation duplicate identity unavailable; no destructive call");return false; }
      using(var process=new HandleLease(Process)) {
        Guard.Require(Api.GetProcessId(process.Value)==Pid,"Failsafe retained PID changed");
        FileTimePair created,exited,kernel,user;bool timed=Native.GetProcessTimes(process.Value,out created,out exited,out kernel,out user);int timeError=Marshal.GetLastWin32Error();
        if(!timed)throw new InvalidOperationException("Failsafe retained identity:"+timeError);Guard.Require((((UInt64)created.high<<32)|created.low)==CreatedFileTime,"Failsafe retained generation changed");
        budget.RequireNativeBudget();if(budget.RemainingMs==0)return false;
        bool killed=Native.TerminateProcess(process.Value,0xe0000002);int killError=Marshal.GetLastWin32Error();RecoveryCalls.Add(BoolNativeReceipt.From("owned-failsafe-termination",killed,killError));if(!killed)errors.Add("Owned failsafe termination failed:"+killError);
        // Only this debugger's creation PID is detached; no attach/image-name operation.
        if(budget.RemainingMs==0)return false;
        bool detached=Api.DebugActiveProcessStop(Pid);int detachError=Marshal.GetLastWin32Error();RecoveryCalls.Add(BoolNativeReceipt.From("owned-debug-detach",detached,detachError));if(!detached)errors.Add("Owned debug detach failed:"+detachError);
      }
      return ObserveExit(budget,1000,"post-owned-failsafe",true).Complete;
    }
    public void Dispose() { waitDuplicate.Dispose();Thread.Dispose();Process.Dispose();originalThread.Dispose();originalProcess.Dispose(); }
    internal Dictionary<string,object> HandleEvidence {
      get {
        var releases=new List<Dictionary<string,object>>();foreach(var item in new[]{originalProcess,originalThread,Process,Thread,waitDuplicate})releases.Add(new Dictionary<string,object>{{"origin",item.ResourceLabel},{"state",item.CloseState},{"detail",item.CloseDetail}});
        return new Dictionary<string,object>{{"createdPid",Pid},{"createdFileTimeHex",Policy.Hex(CreatedFileTime)},{"image",Image},{"creationReturnedProcess",Policy.Hex(originalProcessRaw)},{"creationReturnedThread",Policy.Hex(originalThreadRaw)},{"creationProcessDuplicate",Policy.Hex(processRaw)},{"creationThreadDuplicate",Policy.Hex(threadRaw)},{"originalsClosedBeforeDebugCreate",originalsClosedBeforeDebugCreate},{"debugProcessSystemOwned",Policy.Hex(debugProcessRaw)},{"debugThreadSystemOwned",Policy.Hex(debugThreadRaw)},{"debugCreateBound",debugCreateBound},{"debugExitContinued",debugExitContinued},{"waitDuplicate",Policy.Hex(waitRaw)},{"waitIdentityVerified",waitIdentityVerified},{"activeAlias",activeAlias},{"duplications",Duplications},{"releases",releases}};
      }
    }
    internal bool Closed { get { return (!Created)||(!activeAlias&&debugCreateBound&&debugExitContinued&&waitIdentityVerified&&originalProcess.CloseSucceeded==true&&originalThread.CloseSucceeded==true&&Thread.CloseSucceeded==true&&Process.CloseSucceeded==true&&waitDuplicate.CloseSucceeded==true); } }
  }
}
