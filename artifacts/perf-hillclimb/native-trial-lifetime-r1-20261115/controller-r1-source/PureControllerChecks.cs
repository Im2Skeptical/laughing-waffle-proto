using System;
using System.Collections.Generic;
using NativeCapturePrototype;
using NativeCaptureController;
using NativeCaptureRepair;

namespace NativeTrialLifetime {
  public static class PureControllerChecks {
    static readonly List<string> checks=new List<string>();static string image;
    static void Yes(string name,bool value) { if(!value)throw new Exception("FAIL:"+name);checks.Add(name); }
    sealed class FakeOwner : ITrialOwner {
      internal readonly PureTreeChecks.Fake raw;readonly TrialTreeEvents tree;readonly TrialStartup startup;
      internal readonly List<string> Log=new List<string>();internal string Fault;internal bool FailureMode;internal int BudgetBegins,SharedCalls;
      CleanupBudget budget;bool eof,aborted,rootReleased,jobClosed,bufferReleased;long work;
      internal FakeOwner() { raw=PureTreeChecks.NewFake(image);tree=PureTreeChecks.Tree(raw);startup=new TrialStartup { RootPid=1,PrimaryTid=101,CreatingThread=77,Created=true,AssignedBeforeResume=true,IdentityVerified=true,Image=image,CreatedFileTimeHex=Policy.Hex(1001) }; }
      public void RequireCreatingThread() { }
      static ReaderStartupReceipt Reader(bool ready) { return new ReaderStartupReceipt { Ready=ready,WorkerLive=ready,ThreadHandleOwned=ready,Errors=new string[0] }; }
      void StartEvents(UInt32 pid) { raw.Input.Enqueue(PureTreeChecks.Event(3,pid));raw.Input.Enqueue(PureTreeChecks.Event(6,pid));raw.Input.Enqueue(PureTreeChecks.Event(1,pid)); }
      public void Initialize() {
        Log.Add("readers-ready");startup.Stdout=Reader(Fault!="reader");startup.Stderr=Reader(true);
        StartEvents(1);StartEvents(2);StartEvents(3);raw.Input.Enqueue(PureTreeChecks.Event(5,2));
        if(!FailureMode) { StartEvents(4);raw.Input.Enqueue(PureTreeChecks.Event(5,4)); }
        raw.Input.Enqueue(PureTreeChecks.Event(5,1,0,FailureMode?23u:0u));
        if(Fault=="continue")raw.ContinueOk=false;if(Fault=="phase")raw.MarkerAbsent=false;
        if(Fault=="assigned")startup.AssignedBeforeResume=false;
        new ResumeGate().Commit(startup.Stdout,startup.Stderr,()=>{Log.Add("resume");startup.Resumed=true;});
      }
      public TrialStartup Startup { get { return startup; } } public TrialTreeEvents Tree { get { return tree; } }
      public long WorkElapsedMs { get { return Fault=="work-timeout"?10000:work; } }
      public bool Pump(int ms) {
        int count=tree.Ledger.Count;if(budget!=null) { Shared(budget);budget.AdvancePureTicks(1); }else work++;
        bool ok=tree.Pump(ms);if(tree.Ledger.Count>count) { var last=tree.Ledger[tree.Ledger.Count-1];if(last.ContainsKey("eventCode")&&(UInt32)last["eventCode"]==5)Log.Add("EXIT:"+last["pid"]); }return ok;
      }
      public CleanupBudget BeginCleanup() { Log.Add("begin-cleanup");BudgetBegins++;Guard.Require(budget==null,"Budget reset");budget=CleanupBudget.PureFixture(0,10000,1000);return budget; }
      void Shared(CleanupBudget b) { Guard.Require(Object.ReferenceEquals(budget,b),"Shared budget replaced");SharedCalls++; }
      static TrialJobRaw JobRaw(bool ok,UInt32 active) { return new TrialJobRaw { Call=BoolNativeReceipt.From("job",ok,ok?121:6),OwnerHeld=true,OwnerHandle=Policy.Hex(500000),ActiveProcesses=active }; }
      public TrialTermination Terminate(CleanupBudget b) {
        Shared(b);Log.Add("terminate");budget.AdvancePureTicks(1);var r=TrialJobLogic.Terminate(b,()=>JobRaw(Fault!="terminate",1));
        raw.Input.Enqueue(PureTreeChecks.Event(5,3,0,0xe0000001));if(Fault=="expire")budget.AdvancePureTicks(10000);return r;
      }
      public TrialJobQuery Query(CleanupBudget b) {
        Shared(b);Log.Add("query");if(Fault=="query-throw")throw new Exception("fixture query failure");budget.AdvancePureTicks(1);
        var r=TrialJobLogic.Query(b,()=>JobRaw(Fault!="query-fail",tree.Book.AllExitsContinued&&Fault!="nonzero-job"?0u:1u));
        if(Fault=="query-reset"){r.RemainingBeforeMs=10000;r.RemainingMs=10000;}if(Fault=="query-owner")r.OwnerHandleHeld=false;return r;
      }
      public ProcessWaitReceipt ExtraRootWait(CleanupBudget b) {
        Shared(b);Log.Add("extra-root-wait");budget.AdvancePureTicks(1);
        var source=new WaitSource { Origin="CREATE_PROCESS_DEBUG_EVENT.independent-duplicate",Pid=Fault=="extra-pid"?2u:1u,CreatedFileTimeHex=Policy.Hex(Fault=="extra-generation"?999u:1001u),Handle=Policy.Hex(Fault=="extra-alias"?1088u:1000008u),Image=image,Independent=true,IdentityVerified=true };
        var r=ProcessWaitLogic.Observe(b,1000,"additional-root-post-continued-EXIT",source,ms=>new NativeWaitOutcome { Status=Fault=="extra-wait"?258u:0u,RawLastError=121 });
        if(Fault=="extra-reset"){r.RemainingBeforeMs=10000;r.RemainingAfterMs=10000;}return r;
      }
      static RepairedPipeResult Pipe(bool complete) { return new RepairedPipeResult { Retained=new byte[0],Total=0,Eof=complete,Stopped=complete,ResourcesReleased=complete,Errors=new string[0] }; }
      public TrialStreams FinishStreams(CleanupBudget b) {
        Shared(b);Log.Add("EOF");Guard.Require(tree.Book.AllExitsContinued&&!tree.UnsafePending,"EOF attempted before owned EXIT continuation");if(Fault=="streams-throw")throw new Exception("fixture EOF failure");budget.AdvancePureTicks(1);eof=Fault!="EOF";return new TrialStreams { Stdout=Pipe(eof),Stderr=Pipe(eof) };
      }
      public void AbortStreams() { Log.Add("abort-no-EOF");aborted=true; }
      public TrialOwnerRelease ReleaseRoot(CleanupBudget b) { Shared(b);Log.Add("root-release");rootReleased=true;if(Fault=="root-release-throw")throw new Exception("fixture root release failure");return new TrialOwnerRelease { Confirmed=Fault!="root-release" }; }
      public bool ReleaseEventBuffer() { Log.Add("buffer-release");bufferReleased=Fault!="buffer";return bufferReleased; }
      public TrialOwnerRelease CloseJob() { Log.Add("job-close");jobClosed=true;return new TrialOwnerRelease { Confirmed=Fault!="job-close" }; }
      public bool SourceStable() { return Fault!="source"; }
      public bool HostExitRequired { get { return Fault=="host-exit"||aborted||!eof||!rootReleased||!bufferReleased||!jobClosed||tree.UnsafePending||!tree.Book.AllExitsContinued; } }
      public Dictionary<string,object> Evidence { get { return new Dictionary<string,object>{{"fake",true},{"budgetBegins",BudgetBegins},{"sharedCalls",SharedCalls}}; } }
    }
    public static string[] Run(string existingImage) {
      checks.Clear();image=Guard.Absolute(existingImage);
      var f=new FakeOwner();var r=TrialController.Execute(f);Yes("controller-connected-reuse-containment-state-completes",r.ContainmentComplete&&r.Tree.Book.ProcessCount==4);
      Yes("controller-one-cleanup-budget-instance",f.BudgetBegins==1&&f.SharedCalls>=7&&r.BudgetSteps.Count>0);
      Yes("controller-readers-before-resume-before-events",f.Log.IndexOf("readers-ready")<f.Log.IndexOf("resume")&&f.Log.IndexOf("resume")<f.Log.IndexOf("EXIT:2"));
      Yes("controller-helper-EXIT-before-trial-termination",f.Log.IndexOf("EXIT:2")<f.Log.IndexOf("EXIT:4")&&f.Log.IndexOf("EXIT:4")<f.Log.IndexOf("terminate"));
      Yes("controller-daemon-EXIT-after-owned-termination",f.Log.IndexOf("terminate")<f.Log.IndexOf("EXIT:3"));
      Yes("controller-extra-root-wait-before-EOF-before-root-release-job-close",f.Log.IndexOf("EXIT:3")<f.Log.IndexOf("extra-root-wait")&&f.Log.IndexOf("extra-root-wait")<f.Log.IndexOf("EOF")&&f.Log.IndexOf("EOF")<f.Log.IndexOf("root-release")&&f.Log.IndexOf("root-release")<f.Log.LastIndexOf("query")&&f.Log.LastIndexOf("query")<f.Log.IndexOf("job-close"));
      Yes("controller-two-independent-root-event-waits-retained",r.ExtraRootWait.Source.Handle!=r.Tree.Binding(1).Waits[0].Source.Handle&&r.Tree.Binding(1).Waits[0].Source.Pid==r.ExtraRootWait.Source.Pid);
      bool monotonic=true;int prior=10000;foreach(var step in r.BudgetSteps){monotonic&=step.BeforeMs<=prior&&step.AfterMs<=step.BeforeMs;prior=step.AfterMs;}Yes("controller-shared-budget-records-monotonic",monotonic&&r.FinalRemainingMs==prior);
      f=new FakeOwner { FailureMode=true };r=TrialController.Execute(f);Yes("controller-failure-after-first-return-root23-retained",r.ContainmentComplete&&r.Tree.Book.ProcessCount==3&&r.Tree.Book.Life(1).ExitCode==23&&!f.Log.Contains("EXIT:4"));
      foreach(string fault in new[]{"reader","assigned","continue","phase","work-timeout","terminate","expire","query-throw","query-fail","query-reset","query-owner","nonzero-job","extra-pid","extra-generation","extra-alias","extra-wait","extra-reset","EOF","streams-throw","root-release","root-release-throw","buffer","job-close","source","host-exit"}) {
        f=new FakeOwner { Fault=fault };r=TrialController.Execute(f);Yes("controller-rejects-"+fault,!r.ContainmentComplete&&(r.Errors.Count>0||!r.Tree.Book.Complete));
        Yes("controller-attempts-job-close-after-"+fault,f.Log.Contains("job-close"));
        if(fault=="continue"||fault=="expire"||fault=="query-throw"||fault=="query-fail"||fault=="query-owner"||fault=="query-reset")Yes("controller-no-EOF-wait-after-unsafe-"+fault,!f.Log.Contains("EOF")&&f.Log.Contains("abort-no-EOF"));
      }
      return checks.ToArray();
    }
  }
}
