using System;
using System.IO;
using System.Diagnostics;
using System.Collections.Generic;
using NativeCapturePrototype;
using NativeCaptureRepair;
using NativeCaptureController;

namespace NativeCaptureControllerProof {
  public static class PureControllerChecks {
    static StartupPhaseReceipt StartupGood() { return new StartupPhaseReceipt { CreateSeen=true,ModuleSeen=true,FirstException=true,MarkerProbed=true,EntryMarkerAbsent=true,ProbeCertain=true,Path=Path.Combine(Path.GetTempPath(),"target-identity.json"),ProbeException="FileNotFoundException",ProbeError=2,ProbeHResult=unchecked((int)0x80070002) }; }
    static void NewMechanisms(string root,string image) {
      foreach(string field in new[]{"CreateSeen","ModuleSeen","FirstException","MarkerProbed","EntryMarkerAbsent","ProbeCertain"}) { var phase=StartupGood();typeof(StartupPhaseReceipt).GetField(field).SetValue(phase,false);Yes("startup-missing-"+field,Policy.Continuation(1,0x80000003,1,123,123,true,false,77,77,phase)==0x80010001); }
      var wrong=StartupGood();wrong.ProbeError=5;Yes("startup-access-error-is-not-absence",!wrong.Succeeded);wrong=StartupGood();wrong.ProbeException="DirectoryNotFoundException";Yes("startup-directory-error-is-not-absence",!wrong.Succeeded);
      Yes("startup-missing-phase-rejected",Policy.Continuation(1,0x80000003,1,123,123,true,false,77,77,null)==0x80010001);
      Yes("startup-second-chance-rejected",Policy.Continuation(1,0x80000003,0,123,123,true,false,77,77,StartupGood())==0x80010001);
      var missing=StartupPhaseReceipt.Probe(root,true,true,true);Yes("actual-marker-absence-probe",missing.Succeeded&&missing.ProbeError==2);
      string entered=Path.Combine(root,"pure-main-present");Directory.CreateDirectory(entered);File.WriteAllText(Path.Combine(entered,"target-identity.json"),"present");Yes("actual-main-marker-prevents-loader",!StartupPhaseReceipt.Probe(entered,true,true,true).Succeeded);
      Yes("actual-unavailable-root-not-absence",!StartupPhaseReceipt.Probe(Path.Combine(root,"never-created-phase-root"),true,true,true).Succeeded);
      Yes("not-first-exception-never-probes-marker",!StartupPhaseReceipt.Probe(root,true,true,false).MarkerProbed);
      Yes("independent-handle-accepted",HandleIndependence.CanOwn(10,11,new UInt64[]{12,13}));
      Yes("same-source-handle-rejected",!HandleIndependence.CanOwn(10,10,new UInt64[0]));
      Yes("other-live-handle-alias-rejected",!HandleIndependence.CanOwn(10,11,new UInt64[]{11}));
      Yes("invalid-produced-handle-rejected",!HandleIndependence.CanOwn(10,UInt64.MaxValue,new UInt64[0]));
      Yes("missing-source-handle-rejected",!HandleIndependence.CanOwn(0,11,new UInt64[0]));
      Yes("closed-number-not-in-live-ownership-set",HandleIndependence.CanOwn(10,11,new UInt64[]{12}));
      var source=new WaitSource { Origin="fixture.independent-duplicate",Handle="0x0000000000000010",CreatedFileTimeHex="0x0000000000000020",Image=image,Pid=7,Independent=true,IdentityVerified=true };
      var budget=CleanupBudget.PureFixture(0,100,1000);int calls=0;
      var signaled=ProcessWaitLogic.Observe(budget,50,"fixture-signaled",source,ms=>{calls++;return new NativeWaitOutcome { Status=0,RawLastError=5 };});
      Yes("signaled-wait-complete",signaled.Complete&&signaled.RequestedMs==50&&calls==1);Yes("successful-wait-stale-error-invalid",!signaled.ErrorValid&&!signaled.Error.HasValue&&signaled.RawLastError==5);
      var delayed=ProcessWaitLogic.Observe(budget,100,"fixture-delayed",source,ms=>{budget.AdvancePureTicks(10);return new NativeWaitOutcome { Status=0 };});Yes("delayed-signal-within-shared-budget",delayed.Complete&&delayed.RemainingAfterMs==90);
      var timeout=ProcessWaitLogic.Observe(budget,20,"fixture-timeout",source,ms=>new NativeWaitOutcome { Status=258,RawLastError=5 });Yes("timeout-not-signal-or-native-error",!timeout.Complete&&!timeout.ErrorValid&&!timeout.Error.HasValue&&timeout.RawStatus==258);
      var failed=ProcessWaitLogic.Observe(budget,20,"fixture-failed",source,ms=>new NativeWaitOutcome { Status=UInt32.MaxValue,RawLastError=6 });Yes("wait-failed-native-error-valid",!failed.Complete&&failed.ErrorValid&&failed.Error==6);
      var unknown=ProcessWaitLogic.Observe(budget,20,"fixture-unexpected",source,ms=>new NativeWaitOutcome { Status=128 });Yes("unexpected-status-not-complete",!unknown.Complete);
      calls=0;var absent=ProcessWaitLogic.Observe(budget,20,"fixture-no-source",null,ms=>{calls++;return new NativeWaitOutcome();});Yes("missing-ownership-never-calls-native",absent.OwnershipUnavailable&&!absent.NativeCalled&&calls==0);
      source.Independent=false;var alias=ProcessWaitLogic.Observe(budget,20,"fixture-auto-closed-source",source,ms=>{calls++;return new NativeWaitOutcome();});Yes("nonindependent-event-handle-never-waits",alias.OwnershipUnavailable&&calls==0);source.Independent=true;
      var expired=CleanupBudget.PureFixture(0,0,1000);var noTime=ProcessWaitLogic.Observe(expired,20,"fixture-expired",source,ms=>{calls++;return new NativeWaitOutcome();});Yes("expired-budget-never-calls-native",noTime.DeadlineExpired&&!noTime.NativeCalled&&calls==0);
      var late=ProcessWaitLogic.Observe(budget,100,"fixture-late-signal",source,ms=>{budget.AdvancePureTicks(90);return new NativeWaitOutcome { Status=0 };});Yes("deadline-signal-retained-but-incomplete",late.Signaled&&!late.Complete&&late.DeadlineExpired);
      var goodBool=BoolNativeReceipt.From("fixture-detach",true,5);Yes("successful-bool-stale-error-invalid",goodBool.Result&&!goodBool.ErrorValid&&!goodBool.Error.HasValue&&goodBool.RawLastError==5);
      var badBool=BoolNativeReceipt.From("fixture-terminate",false,5);Yes("failed-bool-error-valid",!badBool.Result&&badBool.ErrorValid&&badBool.Error==5);
      string contract=Path.Combine(root,"loader-contract.json"),hash=Guard.Sha256(contract);var data=new System.Web.Script.Serialization.JavaScriptSerializer().Deserialize<LoaderContract>(File.ReadAllText(contract));var loader=new FrozenLoader(contract,hash,data.ImageSha256);Yes("actual-frozen-loader-data-only",loader.TrapRva>0&&loader.Evidence()["symbol"].Equals("LdrpDoDebuggerBreak"));Reject("wrong-loader-contract-hash",()=>new FrozenLoader(contract,new string('0',64),data.ImageSha256));
    }
    sealed class ReturnedClose : IDisposable,IReturnedCloseOutcome {
      readonly string outcome;public int Calls;public ReturnedClose(string state) { outcome=state; }
      public void Dispose() { Calls++; }
      public string ResourceLabel { get { return "fake-native-resource"; } }
      public string CloseState { get { return outcome; } }
      public string CloseDetail { get { return outcome=="NATIVE_CLOSE_FAILED"?"CloseHandle:6":null; } }
    }
    static readonly List<string> checks=new List<string>();
    static void Yes(string name,bool ok) { if(!ok)throw new Exception("Controller pure check:"+name);checks.Add(name); }
    static void Reject(string name,Action action) { bool failed=false;try { action(); }catch { failed=true; }Yes(name,failed); }
    static NativeCaptureController.CaptureFacts Complete() {
      return new NativeCaptureController.CaptureFacts { Identity=true,AssignedBeforeResume=true,LoaderBreakpoint=true,ExitContinued=true,JobEmpty=true,StreamsComplete=true,HandlesClosed=true,SourceStable=true };
    }
    public static string[] Run(string artifactRoot,string existingExe) {
      var f=Complete();Yes("complete-normal",NativeCaptureController.Policy.Classify(f)=="NORMAL_EXIT");
      f.ExitCode=23;Yes("ordinary-nonzero",NativeCaptureController.Policy.Classify(f)=="NONZERO_EXIT_WITHOUT_MATCHED_EXCEPTION");
      f.ExitCode=0xc0000409;Yes("exit-status-alone-not-exception",NativeCaptureController.Policy.Classify(f)=="NONZERO_EXIT_WITHOUT_MATCHED_EXCEPTION");
      f.MatchingFatalRecords=1;Yes("bound-fatal-record",NativeCaptureController.Policy.Classify(f)=="NATIVE_EXCEPTION_CAPTURED");
      foreach(string field in new[]{"Identity","AssignedBeforeResume","LoaderBreakpoint","ExitContinued","JobEmpty","StreamsComplete","HandlesClosed","SourceStable"}) {
        var bad=Complete();typeof(NativeCaptureController.CaptureFacts).GetField(field).SetValue(bad,false);Yes("missing-"+field,NativeCaptureController.Policy.Classify(bad)=="INCOMPLETE");
      }
      foreach(string field in new[]{"TimedOut","Overflow","ObserverError","UnsafeRecovery"}) {
        var bad=Complete();bad.ExitCode=0xc0000409;bad.MatchingFatalRecords=1;typeof(NativeCaptureController.CaptureFacts).GetField(field).SetValue(bad,true);Yes("failure-outranks-native-"+field,NativeCaptureController.Policy.Classify(bad)=="INCOMPLETE");
      }
      var phase=StartupGood();
      Yes("exact-loader-breakpoint",NativeCaptureController.Policy.Continuation(1,0x80000003,1,123,123,true,false,77,77,phase)==0x10002);
      Yes("arbitrary-breakpoint-not-swallowed",NativeCaptureController.Policy.Continuation(1,0x80000003,1,124,123,true,false,77,77,phase)==0x80010001);
      Yes("repeat-breakpoint-not-swallowed",NativeCaptureController.Policy.Continuation(1,0x80000003,1,123,123,true,true,77,77,phase)==0x80010001);
      Yes("wrong-loader-thread-rejected",NativeCaptureController.Policy.Continuation(1,0x80000003,1,123,123,true,false,78,77,phase)==0x80010001);
      Yes("fatal-event-matched",NativeCaptureController.Policy.IsFatalNative(0xc0000409,1,0,2));
      Yes("first-chance-not-fatal",!NativeCaptureController.Policy.IsFatalNative(0xc0000409,1,1,2));
      Yes("no-parameter-not-fastfail-proof",!NativeCaptureController.Policy.IsFatalNative(0xc0000409,1,0,0));
      string owned=Path.Combine(artifactRoot,"pure-only"),run=Path.Combine(owned,"control-0-normal");Directory.CreateDirectory(run);
      var c=new CaptureConfig { ArtifactRoot=owned,RunRoot=run,Cwd=run,Id="control-0-normal",Mode="normal",Executable=existingExe,ExecutableSha256=Guard.Sha256(existingExe),Arguments=new[]{"original"},WorkLimitMs=10000,RawByteLimit=1048576,EventLimit=2048,ExceptionLimit=128,ReceiptByteLimit=4194304 };
      string hash=Guard.Fingerprint(c);var frozen=new NativeCaptureController.FrozenControl(c,new[]{existingExe},hash);
      c.Arguments[0]="mutated";Yes("config-input-deep-copy",frozen.Arguments[0]=="original");
      var a=frozen.Arguments;a[0]="mutated-return";Yes("config-output-deep-copy",frozen.Arguments[0]=="original");
      Reject("wrong-config-hash",()=>new NativeCaptureController.FrozenControl(c,new[]{existingExe},hash));
      Yes("filetime-lossless",NativeCaptureController.Policy.Hex(UInt64.MaxValue)=="0xffffffffffffffff");
      var ready=new ReaderStartupReceipt { Ready=true,WorkerLive=true,ThreadHandleOwned=true,Errors=new string[0] };
      int resumes=0;var gate=new ResumeGate();gate.Commit(ready,ready,()=>resumes++);Yes("two-ready-readers-resume-once",resumes==1);
      Reject("second-resume-rejected",()=>gate.Commit(ready,ready,()=>resumes++));Yes("still-exactly-one-resume",resumes==1);
      foreach(string field in new[]{"Ready","WorkerLive","ThreadHandleOwned"}) {
        var bad=new ReaderStartupReceipt { Ready=true,WorkerLive=true,ThreadHandleOwned=true,Errors=new string[0] };typeof(ReaderStartupReceipt).GetField(field).SetValue(bad,false);
        int attempts=0;Reject("bad-output-startup-"+field,()=>new ResumeGate().Commit(bad,ready,()=>attempts++));
        Reject("bad-error-startup-"+field,()=>new ResumeGate().Commit(ready,bad,()=>attempts++));Yes("failed-startup-never-resumes-"+field,attempts==0);
      }
      var late=new ReaderStartupReceipt { Ready=true,WorkerLive=true,ThreadHandleOwned=true,Errors=new string[0],DeadlineExpired=true };
      Reject("late-reader-prevents-resume",()=>new ResumeGate().Commit(late,ready,()=>resumes++));
      Reject("missing-reader-prevents-resume",()=>new ResumeGate().Commit(null,ready,()=>resumes++));
      Yes("idle-verification-injects-without-event",NativeCaptureController.Policy.InjectAfterPoll("observer-failure",true));
      Yes("unverified-child-cannot-inject",!NativeCaptureController.Policy.InjectAfterPoll("observer-failure",false));
      var primary=new Exception("setup");var returnedFalse=new ReturnedClose("NATIVE_CLOSE_FAILED");var pending=new ReturnedClose("NATIVE_CLOSE_PENDING");
      var setup=SetupRollback.Release(primary,returnedFalse,null,pending) as SetupFailureException;
      Yes("rollback-primary-survives-constructor",setup!=null&&Object.ReferenceEquals(setup.Primary,primary));
      Yes("rollback-return-only-false-retained",setup.Rollback[2].State=="NATIVE_CLOSE_FAILED"&&setup.Rollback[2].Detail=="CloseHandle:6");
      Yes("rollback-pending-retained",setup.Rollback[0].State=="NATIVE_CLOSE_PENDING");
      Yes("rollback-partial-adoption-retained",setup.Rollback[1].State=="NOT_ALLOCATED"&&returnedFalse.Calls==1&&pending.Calls==1);
      NewMechanisms(artifactRoot,existingExe);return checks.ToArray();
    }
  }
}
