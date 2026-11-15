using System;
using System.Collections.Generic;
using NativeCapturePrototype;

namespace NativeTrialLifetime {
  public interface ITrialHostEntryCalls {
    void VerifyBeforeNative();
    void CaptureSelfAndStartJournal();
    bool ExecuteControllerAndSave();
    bool ReleaseSelf();
    bool FinishJournal(int intendedExitCode,string[] errors);
  }
  public sealed class TrialEntryResult {
    public int ExitCode=2;public bool ValidationComplete,Started,ControllerAndEvidenceComplete,SelfReleased,EndJournalSaved;
    public readonly List<string> Errors=new List<string>();
  }
  public static class TrialEntryPolicy {
    static void Error(TrialEntryResult r,string phase,Exception e){if(r.Errors.Count<16){string detail=phase+":"+e.GetType().Name+":"+e.Message;r.Errors.Add(detail.Substring(0,Math.Min(2048,detail.Length)));}}
    // SAME ordering for concrete entry and fake controls. Return code is only an
    // exit intention; supervisor kernel wait/exitcode proves physical host exit.
    public static TrialEntryResult Execute(ITrialHostEntryCalls calls){
      Guard.Require(calls!=null,"Entry calls required");var r=new TrialEntryResult();
      try{calls.VerifyBeforeNative();r.ValidationComplete=true;calls.CaptureSelfAndStartJournal();r.Started=true;r.ControllerAndEvidenceComplete=calls.ExecuteControllerAndSave();if(!r.ControllerAndEvidenceComplete)r.Errors.Add("Controller/report incomplete");}
      catch(Exception e){Error(r,"Entry",e);}
      finally{
        try{r.SelfReleased=calls.ReleaseSelf();if(!r.SelfReleased)r.Errors.Add("Host self handle release incomplete");}catch(Exception e){Error(r,"Self release",e);}
        r.ExitCode=r.ValidationComplete&&r.Started&&r.ControllerAndEvidenceComplete&&r.SelfReleased&&r.Errors.Count==0?0:2;
        try{r.EndJournalSaved=calls.FinishJournal(r.ExitCode,r.Errors.ToArray());if(!r.EndJournalSaved){r.Errors.Add("Host end journal incomplete");r.ExitCode=2;}}catch(Exception e){Error(r,"Host end",e);r.ExitCode=2;}
      }
      return r;
    }
  }
}
