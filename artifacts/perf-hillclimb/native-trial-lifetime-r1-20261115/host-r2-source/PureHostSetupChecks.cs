using System;
using System.Collections.Generic;
using NativeCaptureController;

namespace NativeTrialLifetime {
  public static class PureHostSetupChecks {
    static readonly List<string> checks=new List<string>();
    static void Yes(string name,bool value){if(!value)throw new Exception("FAIL:"+name);checks.Add(name);}
    sealed class Fake:ITrialHostSetupCalls {
      internal string Fault;internal bool Made=true,Terminated;internal int Kills,Waits,ReleaseCalls;internal long Clock;
      public long MonotonicMilliseconds {get{return Fault=="backward"&&Kills>0?-1:Clock;}}
      public TrialCreatedHost Creation {get{return new TrialCreatedHost {Created=Made,Pid=42,HandleOwnerPid=99,RetainedHandle=Policy.Hex(4096),Origin=Fault=="foreign"?"OpenProcess.byPid":"CreateProcessW.returned-retained"};}}
      public BoolNativeReceipt TerminateCreated(){Kills++;Terminated=true;if(Fault=="slow-kill")Clock+=5000;return BoolNativeReceipt.From("TerminateProcess.creation-owned",Fault!="kill-fail",5);}
      public TrialHostWait WaitCreated(int cap){
        Waits++;Clock+=cap;if(Fault=="late")Clock+=5000;UInt32 status=Fault=="never-exit"?258u:Fault=="wait-failed"?UInt32.MaxValue:0u;
        return new TrialHostWait {NativeCalled=true,OwnerHeld=Fault!="unheld",IdentityVerified=false,Handle=Policy.Hex(Fault=="wrong-handle"?8192u:4096u),Pid=Fault=="wrong-pid"?43u:42u,HandleOwnerPid=Fault=="wrong-context"?100u:99u,Status=status,RequestedMs=cap,RawLastError=status==UInt32.MaxValue?6:121,ErrorValid=status==UInt32.MaxValue,Error=status==UInt32.MaxValue?(int?)6:null,ExitCodeCall=BoolNativeReceipt.From("GetExitCodeProcess",Fault!="exit-code",121),ExitCode=0xe0000003};
      }
      public TrialRelease[] ReleaseCreated(){
        ReleaseCalls++;var a=new List<TrialRelease>();for(int i=0;i<3;i++){bool absent=!Made,fail=Fault=="close-fail"&&i==1;a.Add(new TrialRelease {Origin="fixture.creation.handle-"+i,Handle=Policy.Hex(absent?0u:(UInt64)(4096+i)),State=absent?"NOT_OWNED":fail?"NATIVE_CLOSE_FAILED":"NATIVE_CLOSE_SUCCEEDED",NativeCalled=!absent,Confirmed=!fail,RawLastError=absent?(int?)null:fail?6:121,ErrorValid=fail,Error=fail?(int?)6:null});}return Fault=="missing-close"?new[]{a[0]}:a.ToArray();
      }
    }
    public static string[] Run(){
      checks.Clear();var fake=new Fake();var r=TrialHostSetup.StopAndRelease(fake);Yes("setup-pre-resume-owned-stop-and-signal",r.ExitConfirmed&&r.HandlesReleased&&r.Errors.Count==0&&fake.Kills==1&&fake.Waits==1);Yes("setup-clean-rollback-remains-incomplete",r.Classification=="INCOMPLETE_HOST_SETUP"&&r.ExitCode==0xe0000003);Yes("setup-does-not-require-successful-generation-probe",r.Waits[0].IdentityVerified==false&&r.Creation.Origin=="CreateProcessW.returned-retained");
      fake=new Fake {Made=false};r=TrialHostSetup.StopAndRelease(fake);Yes("setup-before-creation-no-kill-or-wait",fake.Kills==0&&fake.Waits==0&&r.HandlesReleased&&r.Errors.Count==0);Yes("setup-uncreated-always-releases-three-slots",fake.ReleaseCalls==1&&r.Releases.Length==3);
      foreach(string fault in new[]{"foreign","slow-kill","kill-fail","backward","never-exit","late","wait-failed","wrong-handle","wrong-pid","wrong-context","unheld","exit-code","close-fail","missing-close"}){
        fake=new Fake {Fault=fault};r=TrialHostSetup.StopAndRelease(fake);Yes("setup-rejects-"+fault,r.Errors.Count>0);Yes("setup-bounded-always-release-"+fault,fake.Waits<=64&&fake.ReleaseCalls==1);if(fault=="foreign")Yes("setup-no-PID-opened-process-termination",fake.Kills==0);if(fault=="slow-kill")Yes("setup-termination-consumes-same-stop-budget",fake.Waits==0&&!r.ExitConfirmed&&r.StoppedMs-r.StartedMs==5000);if(fault=="never-exit")Yes("setup-wait-capped-at-single-five-seconds",fake.Waits==50&&!r.ExitConfirmed&&r.StoppedMs-r.StartedMs==5000);if(fault=="late")Yes("setup-late-signal-does-not-confirm-exit",!r.ExitConfirmed);if(fault=="close-fail"||fault=="missing-close")Yes("setup-close-failure-never-released",!r.HandlesReleased);
      }
      return checks.ToArray();
    }
  }
}
