using System;
using System.IO;
using System.Diagnostics;
using System.Collections.Generic;
using NativeCapturePrototype;
using NativeCaptureRepair;

namespace NativeCaptureControllerProof {
  public static class PureControllerChecks {
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
      Yes("exact-loader-breakpoint",NativeCaptureController.Policy.Continuation(1,0x80000003,1,123,123,true,false,77,77)==0x10002);
      Yes("arbitrary-breakpoint-not-swallowed",NativeCaptureController.Policy.Continuation(1,0x80000003,1,124,123,true,false,77,77)==0x80010001);
      Yes("repeat-breakpoint-not-swallowed",NativeCaptureController.Policy.Continuation(1,0x80000003,1,123,123,true,true,77,77)==0x80010001);
      Yes("wrong-loader-thread-rejected",NativeCaptureController.Policy.Continuation(1,0x80000003,1,123,123,true,false,78,77)==0x80010001);
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
      return checks.ToArray();
    }
  }
}
