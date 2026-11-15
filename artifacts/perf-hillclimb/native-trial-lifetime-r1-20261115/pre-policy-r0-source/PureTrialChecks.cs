using System;
using System.Collections.Generic;
using NativeCaptureController;
using NativeCaptureRepair;
using NativeCapturePrototype;

namespace NativeTrialLifetime {
  public static class PureTrialChecks {
    static readonly List<string> checks=new List<string>();static string image;static readonly string sha=new string('a',64);
    static void Yes(string name,bool value) { if(!value)throw new Exception("FAIL:"+name);checks.Add(name); }
    static void Reject(string name,Action action) { bool failed=false;try { action(); }catch { failed=true; }Yes(name,failed); }
    static TrialBook Book(int processes=16,int events=4096) { return new TrialBook(1,image,sha,processes,events); }
    static TrialIdentity Id(UInt32 pid,UInt32 tid=0,bool verified=true,bool member=true) { return new TrialIdentity(pid,tid==0?pid+100:tid,pid+1000,image,sha,verified,member); }
    static void Create(TrialBook b,UInt32 pid) { b.Register(Id(pid));b.Header(3,pid,pid+100);b.Continued(3,pid,pid+100,true,0); }
    static void Exit(TrialBook b,UInt32 pid,UInt32 code=0) { b.Header(5,pid,pid+100);b.Continued(5,pid,pid+100,true,code); }
    static ProcessWaitReceipt Wait(UInt32 pid,UInt32 status=0) {
      var source=new WaitSource { Origin="CREATE_PROCESS_DEBUG_EVENT.independent-duplicate",Handle=Policy.Hex(pid+2000),CreatedFileTimeHex=Policy.Hex(pid+1000),Image=image,Pid=pid,Independent=true,IdentityVerified=true };
      return ProcessWaitLogic.Observe(CleanupBudget.PureFixture(0,10000,1000),50,"trial-post-continued-EXIT",source,ms=>new NativeWaitOutcome { Status=status,RawLastError=status==UInt32.MaxValue?6:121 });
    }
    static TrialJobQuery Zero() { return new TrialJobQuery { NativeCalled=true,Success=true,OwnerHandleHeld=true,RemainingMs=9000,ActiveProcesses=0 }; }
    static void Finish(TrialBook b,params UInt32[] pids) { foreach(UInt32 pid in pids)b.RecordWait(pid,Wait(pid));foreach(UInt32 pid in pids)b.RecordRelease(pid,true);b.RecordJobZero(Zero());b.RecordStreams(true);b.RecordJobClose(true); }
    public static string[] Run(string existingImage) {
      image=Guard.Absolute(existingImage);
      var b=Book();Create(b,1);Create(b,2);Create(b,3);Exit(b,2);
      Yes("helper-exit-does-not-request-trial-cleanup",!b.CleanupRequested);Yes("daemon-live-after-first-helper",!b.Life(3).ExitContinued&&b.ProcessCount==3);
      Create(b,4);Yes("second-helper-admitted-while-same-daemon-live",!b.CleanupRequested&&!b.Life(3).ExitContinued);Exit(b,4);Yes("second-helper-exit-keeps-daemon",!b.CleanupRequested&&!b.Life(3).ExitContinued);
      Exit(b,1);Yes("root-exit-requests-trial-cleanup",b.CleanupRequested);Yes("root-exit-not-all-exits",!b.AllExitsContinued);Exit(b,3,0xe0000001);Finish(b,1,2,3,4);Yes("complete-trial-only-after-all-owned-closure",b.Complete);
      b=Book();Create(b,1);Create(b,2);Create(b,3);Exit(b,2);Exit(b,1,23);Yes("failure-after-first-return-triggers-final-cleanup",b.CleanupRequested&&!b.Life(3).ExitContinued);Exit(b,3,0xe0000001);Finish(b,1,2,3);Yes("controlled-failure-retains-root23-and-closed-lifetime",b.Complete&&b.Life(1).ExitCode==23);
      var unknown=Book();Create(unknown,1);Reject("unknown-event-PID-rejected",()=>unknown.Header(2,99,199));
      var wrong=Book();wrong.Register(Id(1));Reject("wrong-primary-create-rejected",()=>wrong.Header(3,1,999));
      var identity=Book();Reject("missing-native-identity-rejected",()=>identity.Register(Id(1,0,false,true)));Reject("wrong-job-membership-rejected",()=>identity.Register(Id(1,0,true,false)));
      Reject("wrong-image-rejected",()=>identity.Register(new TrialIdentity(1,101,1001,System.IO.Path.Combine(System.IO.Path.GetDirectoryName(image),"wrong.exe"),sha,true,true)));
      Reject("wrong-image-hash-rejected",()=>identity.Register(new TrialIdentity(1,101,1001,image,new string('b',64),true,true)));
      Create(identity,1);Reject("PID-generation-reuse-rejected",()=>identity.Register(new TrialIdentity(1,101,2001,image,sha,true,true)));
      var cap=Book(2);Create(cap,1);Create(cap,2);Reject("process-cap-rejected",()=>cap.Register(Id(3)));
      var eventCap=Book(16,1);Create(eventCap,1);Reject("event-cap-rejected",()=>eventCap.Header(6,1,101));
      var pending=Book();pending.Register(Id(1));pending.Header(3,1,101);Reject("second-header-before-continue-rejected",()=>pending.Header(6,1,101));Reject("mismatched-continue-rejected",()=>pending.Continued(3,1,102,true,0));pending.Continued(3,1,101,false,0);Yes("failed-continue-retains-pending-and-error",pending.Pending&&pending.CleanupRequested&&pending.Errors.Count==1);
      var terminal=Book();Create(terminal,1);Exit(terminal,1);Reject("event-after-continued-exit-rejected",()=>terminal.Header(2,1,102));
      var early=Book();Create(early,1);early.RecordRelease(1,true);Yes("early-release-latches-error",early.Errors.Count==1);Reject("wait-after-early-release-rejected",()=>early.RecordWait(1,Wait(1)));
      var waits=Book();Create(waits,1);Exit(waits,1);var bad=Wait(1);bad.Source.CreatedFileTimeHex=Policy.Hex(9999);waits.RecordWait(1,bad);Yes("wrong-wait-generation-latches-error",waits.Errors.Count==1);Reject("failed-wait-cannot-be-replaced",()=>waits.RecordWait(1,Wait(1)));
      waits=Book();Create(waits,1);Exit(waits,1);waits.RecordWait(1,Wait(1,258));Yes("timeout-not-owned-exit-proof",waits.Errors.Count==1&&!waits.Complete);
      waits=Book();Create(waits,1);Exit(waits,1);waits.RecordWait(1,Wait(1,UInt32.MaxValue));Yes("WAIT_FAILED-not-owned-exit-proof",waits.Errors.Count==1&&!waits.Complete);
      var job=Book();Create(job,1);Exit(job,1);job.RecordWait(1,Wait(1));job.RecordRelease(1,true);var q=Zero();q.OwnerHandleHeld=false;job.RecordJobZero(q);Yes("job-zero-needs-live-owned-handle",job.Errors.Count==1);
      job=Book();Create(job,1);var active=Zero();active.ActiveProcesses=1;job.RecordJobZero(active);Yes("nonzero-job-not-closure",job.Errors.Count==1);
      job=Book();Create(job,1);var expired=Zero();expired.DeadlineExpired=true;expired.RemainingMs=0;job.RecordJobZero(expired);Yes("expired-job-query-not-complete",job.Errors.Count==1);
      job=Book();Create(job,1);job.RecordJobClose(true);Yes("close-before-zero-latches-error",job.Errors.Count==1);Reject("query-after-close-rejected",()=>job.RecordJobZero(Zero()));
      var eof=Book();Create(eof,1);Exit(eof,1);eof.RecordWait(1,Wait(1));eof.RecordRelease(1,true);eof.RecordJobZero(Zero());eof.RecordStreams(false);eof.RecordJobClose(true);Yes("missing-raw-EOF-blocks-completion",!eof.Complete);
      b=Book();Create(b,1);Exit(b,1);b.RecordWait(1,Wait(1));b.RecordRelease(1,false);b.RecordJobZero(Zero());b.RecordStreams(true);b.RecordJobClose(true);Yes("unconfirmed-native-release-blocks-completion",!b.Complete);
      var nativeSuccess=Wait(1);Yes("successful-signal-stale-error-not-failure",nativeSuccess.Complete&&nativeSuccess.RawLastError==121&&!nativeSuccess.ErrorValid&&!nativeSuccess.Error.HasValue);
      var reset=Book();Create(reset,1);Create(reset,2);Exit(reset,1);Exit(reset,2);var earlier=Wait(1);earlier.RemainingAfterMs=9900;reset.RecordWait(1,earlier);reset.RecordWait(2,Wait(2));Yes("cross-process-cleanup-budget-reset-rejected",reset.Errors.Count==1);
      var contradiction=Book();Create(contradiction,1);Exit(contradiction,1);var badError=Wait(1);badError.ErrorValid=true;badError.Error=5;contradiction.RecordWait(1,badError);Yes("valid-error-cannot-hide-behind-signal-property",contradiction.Errors.Count==1);
      return checks.ToArray();
    }
  }
}
