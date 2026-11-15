using System;
using System.IO;
using System.Text;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Collections.Generic;
using NativeCapturePrototype;
using NativeCaptureController;
using NativeCaptureRepair;

namespace NativeTrialLifetime {
  internal static class TrialHostApi {
    [DllImport("kernel32.dll",ExactSpelling=true)]internal static extern UInt32 GetCurrentProcessId();
  }
  // Source only: construction/Create/Resume/Wait/Terminate MUST NOT be invoked
  // before complete independent source admission. No PID/name reopen/attach.
  internal sealed class TrialRetainedHost : ITrialHostCalls {
    readonly OwnedResource originalProcess=new OwnedResource(IntPtr.Zero,"host.CreateProcess.returned.process"),originalThread=new OwnedResource(IntPtr.Zero,"host.CreateProcess.returned.thread"),wait=new OwnedResource(IntPtr.Zero,"host.CreateProcess.independent-wait-duplicate");
    readonly Stopwatch clock=new Stopwatch();readonly List<Dictionary<string,object>> calls=new List<Dictionary<string,object>>();
    TrialHostIdentity identity;FrozenTrial config;UInt32 primaryTid;bool created,verified,resumed,released;UInt64 processRaw,threadRaw,waitRaw;public TrialRelease FinalRelease;
    static UInt64 Raw(IntPtr p) { return unchecked((UInt64)p.ToInt64()); }
    public TrialHostIdentity Identity { get { Guard.Require(verified,"Host identity not verified");return new TrialHostIdentity { Pid=identity.Pid,HandleOwnerPid=identity.HandleOwnerPid,CreatedFileTimeHex=identity.CreatedFileTimeHex,Image=identity.Image,ImageSha256=identity.ImageSha256,OwnedHandle=identity.OwnedHandle }; } }
    public long MonotonicMilliseconds { get { return clock.ElapsedMilliseconds; } }
    static OwnedResource Null(bool input) {
      var r=new OwnedResource(IntPtr.Zero,input?"host.stdin.NUL":"host.output.NUL");var attributes=new SecurityAttributes { bytes=(UInt32)Marshal.SizeOf(typeof(SecurityAttributes)),inherit=true,descriptor=IntPtr.Zero };
      IntPtr h=Native.CreateFileW("NUL",input?0x80000000u:0x40000000u,3,ref attributes,3,0x80,IntPtr.Zero);int error=Marshal.GetLastWin32Error();if(h==new IntPtr(-1))throw SetupRollback.Release(new InvalidOperationException("Host NUL:"+error),r);r.Adopt(h);return r;
    }
    internal void CreateSuspended(TrialHostLaunch launch,string admittedConfigFingerprint) {
      Guard.Require(!created&&launch!=null,"One source-admitted host creation required");config=launch.Config;config.VerifyFingerprint(admittedConfigFingerprint);config.RequireLeafTime(DateTime.UtcNow);launch.VerifyFiles();
      // Parent MUST already have consumed the empty-slot reservation. Consume a
      // separate host marker once; never repeat even if setup fails afterward.
      string marker=Path.Combine(config.Root,"attempt.marker");Guard.Require(File.Exists(marker)&&new FileInfo(marker).Length<=128,"Parent reservation absent");Guard.Reserve(config.Root,"host-attempt.marker");
      clock.Start();OwnedResource input=null,output=null,errorOutput=null;
      try {
        input=Null(true);output=Null(false);errorOutput=Null(false);
        using(var i=new HandleLease(input))using(var o=new HandleLease(output))using(var e=new HandleLease(errorOutput))using(var attributes=new AttributeHandles(i.Value,o.Value,e.Value)) {
          var startup=new StartupInfoEx64();startup.startup.cb=(UInt32)Marshal.SizeOf(typeof(StartupInfoEx64));startup.startup.flags=0x100;startup.startup.stdInput=i.Value;startup.startup.stdOutput=o.Value;startup.startup.stdError=e.Value;startup.attributes=attributes.Pointer;
          ProcessInformation64 result;bool ok=Native.CreateProcessW(config.HostExecutable,new StringBuilder(launch.CommandLine),IntPtr.Zero,IntPtr.Zero,true,Native.CreateSuspended|Native.CreateNoWindow|Native.ExtendedStartupInfo,IntPtr.Zero,config.Root,ref startup,out result);int last=Marshal.GetLastWin32Error();
          if(ok){originalProcess.Adopt(result.process);originalThread.Adopt(result.thread);created=true;processRaw=Raw(result.process);threadRaw=Raw(result.thread);primaryTid=result.threadId;}
          calls.Add(new Dictionary<string,object>{{"phase","host.CreateProcessW"},{"result",ok},{"rawLastError",last},{"errorValid",!ok},{"error",ok?null:(object)last},{"debugFlags",false},{"suspended",true},{"hidden",true},{"handleWhitelist",3},{"commandLine",launch.CommandLine},{"cwd",config.Root}});
          if(!ok)throw new InvalidOperationException("Host CreateProcessW:"+last);
          identity=new TrialHostIdentity { Pid=result.processId,HandleOwnerPid=TrialHostApi.GetCurrentProcessId(),Image=config.HostExecutable,ImageSha256=FindHostHash(config) };
        }
        using(var source=new HandleLease(originalProcess)) {
          IntPtr duplicate;bool ok=ExtraNative.DuplicateHandle(ExtraNative.GetCurrentProcess(),source.Value,ExtraNative.GetCurrentProcess(),out duplicate,0,false,2);int last=Marshal.GetLastWin32Error();
          bool alias=ok&&!HandleIndependence.CanOwn(processRaw,Raw(duplicate),new[]{threadRaw,Raw(input.DangerousGetHandle()),Raw(output.DangerousGetHandle()),Raw(errorOutput.DangerousGetHandle())});
          if(ok) { wait.Adopt(duplicate);if(alias)wait.AbandonAmbiguousAlias(); }
          calls.Add(new Dictionary<string,object>{{"phase","host.DuplicateHandle"},{"source",Policy.Hex(processRaw)},{"produced",Policy.Hex(Raw(duplicate))},{"result",ok},{"rawLastError",last},{"errorValid",!ok},{"error",ok?null:(object)last},{"activeAlias",alias},{"inherit",false},{"sameAccess",true}});
          Guard.Require(ok&&!alias,"Independent host wait duplicate unavailable");waitRaw=Raw(duplicate);identity.OwnedHandle=Policy.Hex(waitRaw);
        }
        using(var h=new HandleLease(wait)) { identity.CreatedFileTimeHex=ReadIdentity(h.Value,false); }
        using(var t=new HandleLease(originalThread))Guard.Require(primaryTid>0&&Api.GetThreadId(t.Value)==primaryTid&&Api.GetProcessIdOfThread(t.Value)==identity.Pid,"Host primary thread identity differs");
        originalProcess.Dispose();Guard.Require(originalProcess.CloseSucceeded==true,"Host creation process original close unconfirmed");verified=true;
      }finally { foreach(var r in new[]{input,output,errorOutput})if(r!=null){r.Dispose();calls.Add(r.Evidence());} }
    }
    static string FindHostHash(FrozenTrial c) { foreach(var p in c.InputPins)if(String.Equals(p.Path,c.HostExecutable,StringComparison.OrdinalIgnoreCase))return p.Sha256;throw new InvalidOperationException("Pinned host executable absent"); }
    string ReadIdentity(IntPtr handle,bool compare) {
      UInt32 pid=Api.GetProcessId(handle);int pidError=Marshal.GetLastWin32Error();Guard.Require(pid==identity.Pid&&pid>0,"Retained host PID differs:"+pidError);
      FileTimePair made,exited,kernel,user;bool timed=Native.GetProcessTimes(handle,out made,out exited,out kernel,out user);int timeError=Marshal.GetLastWin32Error();Guard.Require(timed,"Retained host FILETIME unavailable:"+timeError);string createdTime=Policy.Hex(((UInt64)made.high<<32)|made.low);
      var image=new StringBuilder(32768);UInt32 count=(UInt32)image.Capacity;bool named=Native.QueryFullProcessImageNameW(handle,0,image,ref count);int imageError=Marshal.GetLastWin32Error();Guard.Require(named&&String.Equals(Policy.CanonicalImage(image.ToString()),Policy.CanonicalImage(identity.Image),StringComparison.OrdinalIgnoreCase),"Retained host image differs:"+imageError);
      if(compare)Guard.Require(createdTime==identity.CreatedFileTimeHex,"Retained host generation differs");
      calls.Add(new Dictionary<string,object>{{"phase","host.identity"},{"pid",pid},{"createdFileTimeHex",createdTime},{"image",Policy.CanonicalImage(image.ToString())},{"times",BoolNativeReceipt.From("GetProcessTimes",timed,timeError)},{"imageQuery",BoolNativeReceipt.From("QueryFullProcessImageNameW",named,imageError)},{"pidRawLastError",pidError}});return createdTime;
    }
    internal void ResumeAfterJournal(Action<TrialHostIdentity> publish) {
      Guard.Require(created&&verified&&!resumed&&!released&&publish!=null,"Verified suspended host/journal required");publish(Identity);
      using(var t=new HandleLease(originalThread)){UInt32 previous=Native.ResumeThread(t.Value);int error=Marshal.GetLastWin32Error();calls.Add(new Dictionary<string,object>{{"phase","host.ResumeThread"},{"previous",previous},{"rawLastError",error},{"errorValid",previous==UInt32.MaxValue}});Guard.Require(previous==1,"Host resume count differs");}
      resumed=true;originalThread.Dispose();Guard.Require(originalThread.CloseSucceeded==true,"Host original thread close unconfirmed");
    }
    public TrialHostWait WaitOwned(int maximumMs) {
      Guard.Require(verified&&resumed&&!released&&maximumMs>0&&maximumMs<=100,"Retained host finite wait ownership");
      using(var h=new HandleLease(wait)) { ReadIdentity(h.Value,true);UInt32 status=Native.WaitForSingleObject(h.Value,(UInt32)maximumMs);int last=Marshal.GetLastWin32Error();var r=new TrialHostWait { NativeCalled=true,OwnerHeld=true,IdentityVerified=true,Handle=identity.OwnedHandle,HandleOwnerPid=identity.HandleOwnerPid,Pid=identity.Pid,CreatedFileTimeHex=identity.CreatedFileTimeHex,Image=identity.Image,Status=status,RequestedMs=maximumMs,RawLastError=last,ErrorValid=status==UInt32.MaxValue,Error=status==UInt32.MaxValue?(int?)last:null };
        if(status==0){UInt32 code;bool ok=Api.GetExitCodeProcess(h.Value,out code);int error=Marshal.GetLastWin32Error();r.ExitCodeCall=BoolNativeReceipt.From("host.GetExitCodeProcess",ok,error);if(ok)r.ExitCode=code;}return r; }
    }
    public BoolNativeReceipt TerminateOwned(TrialHostIdentity expected) {
      Guard.Require(verified&&!released&&expected!=null&&expected.Pid==identity.Pid&&expected.CreatedFileTimeHex==identity.CreatedFileTimeHex&&expected.OwnedHandle==identity.OwnedHandle&&expected.HandleOwnerPid==identity.HandleOwnerPid,"No foreign host termination");
      using(var h=new HandleLease(wait)){ReadIdentity(h.Value,true);bool ok=Native.TerminateProcess(h.Value,0xe0000003);int error=Marshal.GetLastWin32Error();return BoolNativeReceipt.From("host.TerminateProcess.exact-owned",ok,error);}
    }
    public TrialRelease ReleaseOwned() {
      Guard.Require(!released,"Host released twice");released=true;wait.Dispose();originalThread.Dispose();originalProcess.Dispose();
      FinalRelease=new TrialRelease { Origin=wait.ResourceLabel,Handle=Policy.Hex(waitRaw),State=wait.CloseState,Detail=wait.CloseDetail,NativeCalled=wait.CloseSucceeded.HasValue,Confirmed=wait.CloseSucceeded==true&&originalThread.CloseSucceeded==true&&originalProcess.CloseSucceeded==true,RawLastError=wait.CloseRawLastError,ErrorValid=wait.CloseSucceeded==false,Error=wait.CloseSucceeded==false?wait.CloseRawLastError:null };return FinalRelease;
    }
    internal Dictionary<string,object> Evidence { get { return new Dictionary<string,object>{{"identity",identity},{"primaryTid",primaryTid},{"creationProcess",Policy.Hex(processRaw)},{"creationThread",Policy.Hex(threadRaw)},{"waitDuplicate",Policy.Hex(waitRaw)},{"created",created},{"verified",verified},{"resumed",resumed},{"released",released},{"calls",calls},{"processOriginalClose",originalProcess.Evidence()},{"threadOriginalClose",originalThread.Evidence()},{"waitDuplicateClose",wait.Evidence()}}; } }
  }
}
