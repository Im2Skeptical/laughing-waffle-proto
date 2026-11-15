using System;
using System.Collections.Generic;
using NativeCapturePrototype;
using NativeCaptureController;
using NativeCaptureRepair;

namespace NativeTrialLifetime {
  public sealed class TrialStartup {
    public UInt32 RootPid,PrimaryTid,CreatingThread;public bool Created,AssignedBeforeResume,IdentityVerified,Resumed;
    public string Image,CreatedFileTimeHex;public ReaderStartupReceipt Stdout,Stderr;
    public bool Succeeded { get { return RootPid>0&&PrimaryTid>0&&CreatingThread>0&&Created&&AssignedBeforeResume&&IdentityVerified&&Resumed&&Stdout!=null&&Stderr!=null&&Stdout.Succeeded&&Stderr.Succeeded; } }
  }
  public sealed class TrialStreams {
    public RepairedPipeResult Stdout,Stderr;
    public bool Complete { get { return Stdout!=null&&Stderr!=null&&Stdout.Complete&&Stderr.Complete; } }
  }
  public sealed class TrialOwnerRelease { public bool Confirmed;public Dictionary<string,object> Evidence; }
  public sealed class TrialBudgetStep { public string Phase;public int BeforeMs,AfterMs,WaitIndex; }
  public interface ITrialOwner {
    void RequireCreatingThread();void Initialize();TrialStartup Startup { get; } TrialTreeEvents Tree { get; }
    long WorkElapsedMs { get; } bool Pump(int milliseconds);CleanupBudget BeginCleanup();
    TrialTermination Terminate(CleanupBudget budget);TrialJobQuery Query(CleanupBudget budget);
    ProcessWaitReceipt ExtraRootWait(CleanupBudget budget);TrialStreams FinishStreams(CleanupBudget budget);
    void AbortStreams();TrialOwnerRelease ReleaseRoot(CleanupBudget budget);bool ReleaseEventBuffer();TrialOwnerRelease CloseJob();
    bool SourceStable();bool HostExitRequired { get; } Dictionary<string,object> Evidence { get; }
  }
  public sealed class TrialControlResult {
    public TrialStartup Startup;public TrialTermination Termination;public ProcessWaitReceipt ExtraRootWait;public TrialStreams Streams;
    public TrialOwnerRelease RootRelease,JobClose;public bool BufferReleased,TimedOut,CleanupExpired,HostExitRequired,SourceUnchanged,LoaderPhasesComplete;
    public int FinalRemainingMs;public string WorkStop;public TrialTreeEvents Tree;
    public readonly List<TrialJobQuery> Queries=new List<TrialJobQuery>();
    public readonly List<TrialBudgetStep> BudgetSteps=new List<TrialBudgetStep>();
    public readonly List<string> Errors=new List<string>();public int DroppedErrors;
    public Dictionary<string,object> OwnerEvidence;
    public bool ContainmentComplete { get { return Errors.Count==0&&DroppedErrors==0&&Startup!=null&&Startup.Succeeded&&Tree!=null&&Tree.Book.Complete&&Termination!=null&&Termination.Requested&&ExtraRootWait!=null&&ExtraRootWait.Complete&&!ExtraRootWait.ErrorValid&&!ExtraRootWait.Error.HasValue&&Streams!=null&&Streams.Complete&&RootRelease!=null&&RootRelease.Confirmed&&JobClose!=null&&JobClose.Confirmed&&BufferReleased&&!TimedOut&&!CleanupExpired&&FinalRemainingMs>0&&!HostExitRequired&&SourceUnchanged&&LoaderPhasesComplete; } }
  }
  // No native entry or self-admission. This SAME controller is used with the
  // concrete owner and connected fake ownership/clock/event controls.
  public static class TrialController {
    const int WorkLimitMs=10000,MaximumSteps=16640;
    static void Error(TrialControlResult r,string text) { if(r.Errors.Count<32)r.Errors.Add(text.Substring(0,Math.Min(4096,text.Length)));else r.DroppedErrors++; }
    static void Step(TrialControlResult r,CleanupBudget budget,string phase,Action call) {
      int before=budget.RemainingMs;Guard.Require(r.BudgetSteps.Count<MaximumSteps,"Cleanup receipt cap");
      try { call(); }
      finally {
        int after=budget.RemainingMs;r.BudgetSteps.Add(new TrialBudgetStep { Phase=phase,BeforeMs=before,AfterMs=after,WaitIndex=r.Tree==null?-1:r.Tree.Waits.Count });
        if(after>before||before<0||after<0)Error(r,"Cleanup clock reset:"+phase);
      }
    }
    static bool ExtraWaitBound(TrialControlResult r) {
      var w=r.ExtraRootWait;if(w==null||!w.Complete||w.ErrorValid||w.Error.HasValue||w.Source==null||!w.Source.Usable||w.RequestedMs<=0||w.RequestedMs>1000||r.Startup==null||w.Source.Pid!=r.Startup.RootPid||w.Source.CreatedFileTimeHex!=r.Startup.CreatedFileTimeHex||!String.Equals(w.Source.Image,r.Startup.Image,StringComparison.OrdinalIgnoreCase)||w.Source.Origin!="CREATE_PROCESS_DEBUG_EVENT.independent-duplicate")return false;
      var b=r.Tree.Binding(r.Startup.RootPid);return b.Duplication!=null&&w.Source.Handle!=Policy.Hex(b.Duplication.Produced);
    }
    static bool WithinLastStep(TrialControlResult r,int before,int after) {
      var step=r.BudgetSteps[r.BudgetSteps.Count-1];return before>0&&after>0&&before<=step.BeforeMs&&after<=before&&after>=step.AfterMs;
    }
    public static TrialControlResult Execute(ITrialOwner owner) {
      Guard.Require(owner!=null,"Concrete trial owner required");var r=new TrialControlResult();CleanupBudget budget=null;
      try {
        owner.RequireCreatingThread();owner.Initialize();r.Startup=owner.Startup;r.Tree=owner.Tree;
        Guard.Require(r.Startup!=null&&r.Startup.Succeeded&&r.Tree!=null,"Root startup/resume/readers unproved");
        long last=0;
        while(!r.Tree.Book.CleanupRequested) {
          owner.RequireCreatingThread();long elapsed=owner.WorkElapsedMs;Guard.Require(elapsed>=last,"Work clock moved backward");last=elapsed;
          if(elapsed>=WorkLimitMs) { r.TimedOut=true;r.WorkStop="WORK_DEADLINE";Error(r,"Root work deadline");break; }
          if(!owner.Pump((int)Math.Min(25,WorkLimitMs-elapsed))) { r.WorkStop="EVENT_FAILURE";Error(r,"Work tree event dispatch incomplete");break; }
        }
        if(r.WorkStop==null)r.WorkStop=r.Tree.Book.Errors.Count==0?"ROOT_EXIT":"OBSERVER_ERROR";
      }catch(Exception error) { Error(r,"Work:"+error.GetType().Name+":"+error.Message); }
      finally {
        r.Startup=owner.Startup;r.Tree=owner.Tree;
        try {
          owner.RequireCreatingThread();budget=owner.BeginCleanup();Guard.Require(budget!=null&&budget.RemainingMs>0&&budget.RemainingMs<=10000,"ONE bounded cleanup budget required");
          Step(r,budget,"terminate-job",()=>r.Termination=owner.Terminate(budget));
          if(r.Termination==null||!r.Termination.Requested||!WithinLastStep(r,r.Termination.RemainingBeforeMs,r.Termination.RemainingAfterMs))Error(r,"Owned job termination unconfirmed/reset budget");
          if(r.Tree!=null) {
            while(!r.Tree.Book.AllExitsContinued&&!r.Tree.UnsafePending&&budget.RemainingMs>0) {
              TrialJobQuery query=null;Step(r,budget,"drain-job-query",()=>query=owner.Query(budget));r.Queries.Add(query);
              if(query==null||!query.NativeCalled||!query.Success||query.ErrorValid||query.Error.HasValue||!query.OwnerHandleHeld||!HandleIndependence.ValidHex(query.OwnerHandle,true)||!WithinLastStep(r,query.RemainingBeforeMs,query.RemainingMs)) { Error(r,"Drain job query unavailable/failed/reset budget");break; }
              int cap=budget.WaitCap(25);if(cap==0)break;bool ok=false;Step(r,budget,"drain-event",()=>ok=owner.Pump(cap));
              if(!ok) { Error(r,"Cleanup tree event dispatch incomplete");break; }
            }
            if(r.Tree.Book.AllExitsContinued&&!r.Tree.UnsafePending) {
              foreach(UInt32 pid in r.Tree.ProcessOrder) {
                var binding=r.Tree.Binding(pid);if(binding.Identity==null) { Error(r,"Unbound process retained:"+pid);continue; }
                ProcessWaitReceipt wait=null;Step(r,budget,"process-wait:"+pid,()=>wait=binding.ObserveExit(budget,1000));if(wait==null||!WithinLastStep(r,wait.RemainingBeforeMs,wait.RemainingAfterMs))Error(r,"Process wait budget differs:"+pid);r.Tree.Book.RecordWait(pid,wait);
              }
              Step(r,budget,"extra-root-wait",()=>r.ExtraRootWait=owner.ExtraRootWait(budget));if(!ExtraWaitBound(r)||!WithinLastStep(r,r.ExtraRootWait.RemainingBeforeMs,r.ExtraRootWait.RemainingAfterMs))Error(r,"Additional root wait identity/independence/budget unavailable");
              Step(r,budget,"streams-after-continued-EXITs",()=>r.Streams=owner.FinishStreams(budget));r.Tree.Book.RecordStreams(r.Streams!=null&&r.Streams.Complete);
            }else { Error(r,"Owned EXITs/pending state incomplete; no EOF wait");owner.AbortStreams(); }
          }else { Error(r,"Tree unavailable during cleanup; no EOF wait");owner.AbortStreams(); }
        }catch(Exception error) { Error(r,"Cleanup:"+error.GetType().Name+":"+error.Message);try { owner.AbortStreams(); }catch(Exception abort) { Error(r,"Abort streams:"+abort.Message); } }
        finally {
          // Each independent release is attempted even after another failed;
          // failures remain sticky and cannot manufacture final closure.
          if(budget!=null) {
            if(r.Tree!=null)foreach(UInt32 pid in r.Tree.ProcessOrder) {
              try { TrialRelease released=null;Step(r,budget,"binding-release:"+pid,()=>released=r.Tree.Binding(pid).Release());if(r.Tree.Binding(pid).Identity!=null)r.Tree.Book.RecordRelease(pid,released!=null&&released.Confirmed&&r.Tree.Binding(pid).Closed); }
              catch(Exception error) { Error(r,"Binding release:"+pid+":"+error.Message); }
            }
            try { Step(r,budget,"root-release",()=>r.RootRelease=owner.ReleaseRoot(budget));if(r.RootRelease==null||!r.RootRelease.Confirmed)Error(r,"Root ownership release incomplete"); }catch(Exception error) { Error(r,"Root release:"+error.Message); }
            try { TrialJobQuery final=null;Step(r,budget,"final-owner-held-job-query",()=>final=owner.Query(budget));r.Queries.Add(final);if(r.Tree!=null)r.Tree.Book.RecordJobZero(final);if(final==null||!final.ZeroConfirmed||!WithinLastStep(r,final.RemainingBeforeMs,final.RemainingMs))Error(r,"Final owned job zero unconfirmed/reset budget"); }catch(Exception error) { Error(r,"Final job query:"+error.Message); }
          }
          try { r.BufferReleased=owner.ReleaseEventBuffer();if(!r.BufferReleased)Error(r,"Event buffer release unavailable"); }catch(Exception error) { Error(r,"Event buffer release:"+error.Message); }
          try { r.JobClose=owner.CloseJob();if(r.Tree!=null)r.Tree.Book.RecordJobClose(r.JobClose!=null&&r.JobClose.Confirmed);if(r.JobClose==null||!r.JobClose.Confirmed)Error(r,"Job owner close unconfirmed"); }catch(Exception error) { Error(r,"Job close:"+error.Message); }
          r.FinalRemainingMs=budget==null?0:budget.RemainingMs;r.CleanupExpired=r.FinalRemainingMs==0;if(r.CleanupExpired)Error(r,"Shared cleanup deadline exhausted");
          try { r.SourceUnchanged=owner.SourceStable();if(!r.SourceUnchanged)Error(r,"Final selected source identity changed"); }catch(Exception error) { Error(r,"Final identity:"+error.Message); }
          try { r.HostExitRequired=owner.HostExitRequired;r.OwnerEvidence=owner.Evidence;if(r.HostExitRequired)Error(r,"Incomplete owner requires supervised host exit"); }catch(Exception error) { Error(r,"Owner final evidence:"+error.Message);r.HostExitRequired=true; }
          if(r.Tree!=null) { r.LoaderPhasesComplete=r.Tree.Book.ProcessCount>0;foreach(UInt32 pid in r.Tree.ProcessOrder)r.LoaderPhasesComplete&=r.Tree.Phase(pid).LoaderHandled;if(!r.LoaderPhasesComplete)Error(r,"Per-process initial loader phases unproved"); }
        }
      }
      return r;
    }
  }
}
