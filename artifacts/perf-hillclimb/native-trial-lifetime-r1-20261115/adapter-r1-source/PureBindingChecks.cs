using System;
using System.Collections.Generic;
using NativeCapturePrototype;
using NativeCaptureController;
using NativeCaptureRepair;

namespace NativeTrialLifetime {
  public static class PureBindingChecks {
    static readonly List<string> checks=new List<string>();static string image;static readonly string sha=new string('a',64);
    static void Yes(string name,bool value) { if(!value)throw new Exception("FAIL:"+name);checks.Add(name); }
    static void Reject(string name,Action action) { bool rejected=false;try { action(); }catch { rejected=true; }Yes(name,rejected); }
    sealed class Fake : ITrialProcessCalls {
      public readonly List<string> Log=new List<string>();public bool ThreadOk=true;public UInt64 Produced=64;public int probes;
      public Action<TrialProcessProbe,int> MutateProbe;public Action<TrialDuplicate> MutateDuplicate;public Action<ProcessWaitReceipt> MutateWait;public Action<TrialRelease> MutateRelease;
      public void RequireCreatingThread() { Guard.Require(ThreadOk,"Wrong OS thread"); }
      public TrialProcessProbe Probe(UInt64 process,UInt64 thread) {
        Log.Add("probe:"+process);probes++;
        var p=new TrialProcessProbe { Pid=1,Tid=101,ThreadPid=1,CreatedFileTime=1001,Image=image,ImageSha256=sha,ProcessMachine=0,NativeMachine=0x8664,
          Times=BoolNativeReceipt.From("times",true,121),ImageQuery=BoolNativeReceipt.From("image",true,2),Architecture=BoolNativeReceipt.From("arch",true,6),
          Membership=new TrialMembership { Call=BoolNativeReceipt.From("member",true,5),Member=true,OwnerHeld=true,OwnerHandle=Policy.Hex(128) } };
        if(MutateProbe!=null)MutateProbe(p,probes);return p;
      }
      public TrialDuplicate Duplicate(UInt64 source,UInt64[] live) { Log.Add("duplicate:"+source);var d=new TrialDuplicate { Source=source,Produced=Produced,Call=BoolNativeReceipt.From("duplicate",true,121),SameAccess=true };if(MutateDuplicate!=null)MutateDuplicate(d);return d; }
      public ProcessWaitReceipt Wait(UInt64 owned,WaitSource source,CleanupBudget budget,int maximum) {
        Log.Add("wait:"+owned);var r=ProcessWaitLogic.Observe(budget,maximum,"post-continued-EXIT",source,ms=>new NativeWaitOutcome { Status=0,RawLastError=121 });if(MutateWait!=null)MutateWait(r);return r;
      }
      public TrialRelease Release(UInt64 owned) { Log.Add("release:"+owned);var r=new TrialRelease { Origin="CREATE_EVENT.wait-duplicate",Handle=Policy.Hex(owned),State="NATIVE_CLOSE_SUCCEEDED",Confirmed=true };if(MutateRelease!=null)MutateRelease(r);return r; }
    }
    static TrialProcessBinding Binding(Fake f) { return new TrialProcessBinding(f,1,101,image,sha); }
    static CleanupBudget Budget() { return CleanupBudget.PureFixture(0,10000,1000); }
    static TrialProcessBinding Bind(Fake f) { var b=Binding(f);b.Bind(16,32,new UInt64[]{128});return b; }
    static void Finish(TrialProcessBinding b) { b.ConfirmContinuedExit(1);b.ObserveExit(Budget(),50);b.Release(); }
    static TrialJobRaw Raw(bool ok=true,int error=121,UInt32 active=0) { return new TrialJobRaw { Call=BoolNativeReceipt.From("job",ok,error),OwnerHeld=true,OwnerHandle=Policy.Hex(128),ActiveProcesses=active }; }
    public static string[] Run(string existingImage) {
      checks.Clear();image=Guard.Absolute(existingImage);
      var f=new Fake();var b=Bind(f);Yes("binding-probes-original-then-duplicates-then-reprobes",String.Join(",",f.Log.ToArray())=="probe:16,duplicate:16,probe:64"&&b.Identity.CreatedFileTime==1001);
      Reject("binding-wait-before-continued-EXIT-rejected",()=>b.ObserveExit(Budget(),50));
      Finish(b);Yes("binding-owned-post-EXIT-wait-release-sequence",b.Closed&&String.Join(",",f.Log.ToArray())=="probe:16,duplicate:16,probe:64,wait:64,release:64");
      Reject("binding-second-release-rejected",()=>b.Release());Reject("binding-second-wait-rejected",()=>b.ObserveExit(Budget(),50));
      f=new Fake();f.ThreadOk=false;b=Binding(f);Reject("binding-wrong-OS-thread-rejected-before-probe",()=>b.Bind(16,32,new UInt64[0]));Yes("binding-no-native-after-wrong-thread",f.Log.Count==0);
      foreach(string field in new[]{"pid","tid","threadpid","generation","image","sha","wow64","nativearch","times","imagequery","archquery","member","owner","ownerhandle"}) {
        f=new Fake();f.MutateProbe=(p,n)=> { switch(field) {
          case "pid":p.Pid=2;break;case "tid":p.Tid=102;break;case "threadpid":p.ThreadPid=2;break;case "generation":p.CreatedFileTime=0;break;
          case "image":p.Image=System.IO.Path.Combine(System.IO.Path.GetDirectoryName(image),"wrong.exe");break;case "sha":p.ImageSha256=new string('b',64);break;
          case "wow64":p.ProcessMachine=0x14c;break;case "nativearch":p.NativeMachine=0xaa64;break;case "times":p.Times=BoolNativeReceipt.From("times",false,6);break;
          case "imagequery":p.ImageQuery=BoolNativeReceipt.From("image",false,6);break;case "archquery":p.Architecture=BoolNativeReceipt.From("arch",false,6);break;
          case "member":p.Membership.Member=false;break;case "owner":p.Membership.OwnerHeld=false;break;case "ownerhandle":p.Membership.OwnerHandle=Policy.Hex(0);break;
        } };b=Binding(f);Reject("binding-invalid-original-"+field,()=>b.Bind(16,32,new UInt64[0]));Yes("binding-no-duplicate-after-invalid-"+field,f.Log.Count==1);
      }
      f=new Fake();f.MutateProbe=(p,n)=>{if(n==2)p.CreatedFileTime++;};b=Binding(f);Reject("binding-duplicate-generation-mismatch-retained",()=>b.Bind(16,32,new UInt64[0]));Yes("binding-incomplete-probe-retains-owned-wait",b.Identity==null&&b.LiveOwned==64);b.Release();Yes("binding-recovery-release-not-complete",!b.Closed&&f.Log.Contains("release:64"));
      f=new Fake();b=Binding(f);Reject("binding-system-handle-alias-rejected-before-probe",()=>b.Bind(16,32,new UInt64[]{16}));Yes("binding-system-alias-no-call",f.Log.Count==0);
      foreach(UInt64 alias in new UInt64[]{0,UInt64.MaxValue,16,32,128}) { f=new Fake { Produced=alias };b=Binding(f);Reject("binding-produced-alias-rejected-"+alias,()=>b.Bind(16,32,new UInt64[]{128}));Yes("binding-ambiguous-output-not-owned-"+alias,b.LiveOwned==0); }
      f=new Fake();f.MutateDuplicate=d=>d.Call=BoolNativeReceipt.From("duplicate",false,6);b=Binding(f);Reject("binding-failed-duplicate-no-proof",()=>b.Bind(16,32,new UInt64[0]));Yes("binding-failed-duplicate-no-reprobe",f.Log.Count==2);
      foreach(string field in new[]{"generation","handle","pid","origin","timeout","error","remaining","release-handle","release-state","release-false"}) {
        f=new Fake();f.MutateWait=r=> { switch(field) {
          case "generation":r.Source.CreatedFileTimeHex=Policy.Hex(999);break;case "handle":r.Source.Handle=Policy.Hex(999);break;case "pid":r.Source.Pid=2;break;case "origin":r.Source.Origin="unowned";break;
          case "timeout":r.RawStatus=258;break;case "error":r.ErrorValid=true;r.Error=5;break;case "remaining":r.RemainingAfterMs=0;break;
        } };f.MutateRelease=r=> { if(field=="release-handle")r.Handle=Policy.Hex(999);if(field=="release-state")r.State="AMBIGUOUS_ALIAS_NOT_CLOSED";if(field=="release-false")r.Confirmed=false; };
        b=Bind(f);Finish(b);Yes("binding-closed-rejects-"+field,!b.Closed);
      }
      var budget=Budget();var q=TrialJobLogic.Query(budget,()=>Raw());Yes("typed-job-zero-retains-stale-success-error",q.ZeroConfirmed&&q.RawLastError==121&&!q.ErrorValid&&!q.Error.HasValue);
      q=TrialJobLogic.Query(budget,()=>Raw(false,6));Yes("typed-job-query-failure-is-not-zero",!q.ZeroConfirmed&&q.ErrorValid&&q.Error==6);
      q=TrialJobLogic.Query(budget,()=>Raw(true,121,1));Yes("typed-job-active-daemon-is-not-zero",!q.ZeroConfirmed&&q.ActiveProcesses==1);
      bool called=false;budget.AdvancePureTicks(10000);q=TrialJobLogic.Query(budget,()=>{called=true;return Raw();});Yes("typed-job-expired-query-calls-nothing",q.DeadlineExpired&&!called&&!q.NativeCalled&&!q.ZeroConfirmed);
      budget=Budget();q=TrialJobLogic.Query(budget,()=>{budget.AdvancePureTicks(10000);return Raw();});Yes("typed-job-zero-at-deadline-not-confirmed",q.NativeCalled&&q.DeadlineExpired&&!q.ZeroConfirmed);
      var kill=TrialJobLogic.Terminate(Budget(),()=>Raw());Yes("typed-job-termination-owned-control-code",kill.Requested&&kill.ExitCode==0xe0000001&&kill.Call.RawLastError==121&&!kill.Call.ErrorValid);
      kill=TrialJobLogic.Terminate(Budget(),()=>Raw(false,5));Yes("typed-job-termination-failure-retained",!kill.Requested&&kill.Call.Error==5);
      budget=Budget();budget.AdvancePureTicks(10000);called=false;kill=TrialJobLogic.Terminate(budget,()=>{called=true;return Raw();});Yes("typed-job-expired-termination-calls-nothing",!kill.NativeCalled&&!called&&!kill.Requested);
      var phase=new StartupPhaseReceipt { Pid=1,CreateSeen=true,ModuleSeen=true,FirstException=true,MarkerProbed=true,EntryMarkerAbsent=true,ProbeCertain=true,Path=System.IO.Path.Combine(System.IO.Path.GetDirectoryName(image),"identity-1.json"),ProbeException="FileNotFoundException",ProbeError=2,ProbeHResult=unchecked((int)0x80070002) };
      Yes("per-PID-startup-marker-accepted",phase.Succeeded);phase.Pid=2;Yes("another-PID-marker-rejected",!phase.Succeeded);phase.Pid=1;phase.ProbeError=3;Yes("path-not-found-is-not-marker-absence",!phase.Succeeded);
      return checks.ToArray();
    }
  }
}
