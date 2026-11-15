using System;
using System.IO;
using System.Text;
using System.Threading;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
using NativeCapturePrototype;
using NativeCaptureRepair;

namespace NativeCaptureController {
  public static class CaptureController {
    static void Error(List<string> errors,CaptureFacts facts,string message) {
      facts.ObserverError=true;if(errors.Count<32)errors.Add((message??"error").Substring(0,Math.Min(4096,(message??"error").Length)));
    }
    static byte[] Json(object value) {
      var serializer=new JavaScriptSerializer { MaxJsonLength=4194304,RecursionLimit=32 };
      return new UTF8Encoding(false,true).GetBytes(serializer.Serialize(value));
    }
    // Source-only until runner/complete manifest has independent affected admission.
    public static string Run(CaptureConfig requested,string[] allowedExecutables,string admittedConfigHash,string admittedNtdllHash) {
      var c=new FrozenControl(requested,allowedExecutables,admittedConfigHash);
      Guard.Require(DateTime.UtcNow<DateTime.Parse("2026-11-16T01:45:00Z",System.Globalization.CultureInfo.InvariantCulture,System.Globalization.DateTimeStyles.AdjustToUniversal),"Native leaf cutoff reached");
      Guard.Reserve(c.Root,"attempt.marker"); // Consumes even pre-creation failures; no repeat.
      var facts=new CaptureFacts();var errors=new List<string>();
      RepairedJob job=null;RepairedPipe stdout=null,stderr=null;OwnedResource stdin=null;OwnedTarget target=null;
      EventSession session=null;CleanupDebugDrain drain=null;DescendantWitness descendant=null;
      RepairedPipeResult output=null,errorOutput=null;JobCleanup closure=null;bool initComplete=false,descendantExited=false;
      Dictionary<string,object> identity=null;string started=DateTime.UtcNow.ToString("o");
      ReaderStartupReceipt outputStartup=null,errorStartup=null;var rollbackReceipts=new List<RollbackResourceReceipt>();
      try {
        job=new RepairedJob();stdout=new RepairedPipe(1048576);stderr=new RepairedPipe(1048576);
        var attributes=new SecurityAttributes { bytes=(UInt32)Marshal.SizeOf(typeof(SecurityAttributes)),inherit=true,descriptor=IntPtr.Zero };
        stdin=new OwnedResource(IntPtr.Zero,"stdin.NUL");IntPtr nul=Native.CreateFileW("NUL",0x80000000,3,ref attributes,3,0x80,IntPtr.Zero);int nulError=Marshal.GetLastWin32Error();
        if(nul==new IntPtr(-1))throw SetupRollback.Release(new InvalidOperationException("Create NUL stdin:"+nulError),stdin);stdin.Adopt(nul);
        target=new OwnedTarget();target.Create(c,job,stdout,stderr,stdin);facts.Identity=true;facts.AssignedBeforeResume=target.Assigned;
        identity=new Dictionary<string,object>{{"pid",target.Pid},{"primaryTid",target.Tid},{"creatingOsThread",target.CreatingThread},{"image",target.Image},{"createdFileTimeHex",Policy.Hex(target.CreatedFileTime)},{"configSha256",c.Fingerprint}};
        Policy.SaveExclusive(c.Root,"launch.json",Json(identity),8192);
        var startupBudget=new CleanupBudget(10000);outputStartup=stdout.StartReader(startupBudget);errorStartup=stderr.StartReader(startupBudget);
        session=new EventSession(target,facts,errors,admittedNtdllHash);descendant=new DescendantWitness(c,target,job);
        outputStartup=stdout.StartupStatus(startupBudget);errorStartup=stderr.StartupStatus(startupBudget);
        var resumeGate=new ResumeGate();resumeGate.Commit(outputStartup,errorStartup,target.Resume);initComplete=true;session.Observe(c,descendant);
      }catch(Exception error) {
        var setup=error as SetupFailureException;if(setup!=null)rollbackReceipts.AddRange(setup.Rollback);
        Error(errors,facts,"Controller:"+error.GetType().Name+":"+error.Message);
      }
      finally {
        var budget=new CleanupBudget(10000);
        try {
          if(target!=null&&target.Created) {
            if(target.Assigned) {
              drain=new CleanupDebugDrain(target.Pid,target.CreatingThread);drain.TransferContinuedExit(facts.ExitContinued);
              closure=job.TerminateAndConfirm(drain,budget);facts.JobEmpty=closure.EmptyConfirmed;facts.ExitContinued|=drain.ExitContinued;
              foreach(var exited in drain.Ledger)if((UInt32)exited["eventCode"]==5&&exited.ContainsKey("continued")&&(bool)exited["continued"])facts.ExitCode=(UInt32)exited["exitCode"];
              foreach(string item in closure.Errors)Error(errors,facts,item);facts.UnsafeRecovery|=closure.UnsafeRecoveryRequired;
            }
            if(!facts.JobEmpty||!target.ExitObserved()) {
              facts.UnsafeRecovery=true;bool exited=target.OwnedStopAndDetach(budget,errors);
              while(job!=null&&budget.RemainingMs>0&&!job.QueryEmpty())Thread.Sleep(budget.WaitCap(5));
              facts.JobEmpty=job!=null&&job.QueryEmpty()&&exited; // Failsafe fact never clears error/INCOMPLETE.
            }
            if(descendant!=null)descendantExited=descendant.ExitObserved;
          }
          if(stdout!=null)output=stdout.Finish(budget);if(stderr!=null)errorOutput=stderr.Finish(budget);
        }catch(Exception cleanupError) { Error(errors,facts,"Cleanup:"+cleanupError.GetType().Name+":"+cleanupError.Message); }
        finally {
          foreach(IDisposable resource in new IDisposable[]{drain,session,descendant,stdout,stderr,stdin,target,job}) {
            if(resource==null)continue;try { resource.Dispose(); }catch(Exception disposalError) { Error(errors,facts,"Dispose:"+disposalError.Message); }
          }
        }
      }
      facts.StreamsComplete=output!=null&&errorOutput!=null&&output.Complete&&errorOutput.Complete;
      facts.Overflow|=(output!=null&&output.Overflow)||(errorOutput!=null&&errorOutput.Overflow);
      facts.HandlesClosed=initComplete&&target!=null&&target.Closed&&job!=null&&job.CloseConfirmed&&stdin!=null&&stdin.CloseSucceeded==true&&descendant!=null&&descendant.Closed;
      try { facts.SourceStable=Guard.Sha256(c.Executable)==c.ExecutableHash; }catch(Exception error) { Error(errors,facts,"Final identity:"+error.Message); }
      if(descendant!=null&&descendant.Required&&(!descendant.Verified||!descendantExited))Error(errors,facts,"Descendant existence/exit unconfirmed");
      if(descendant!=null&&descendant.PollingIncomplete)Error(errors,facts,"Witness background IO completion unconfirmed");
      var ledger=new List<object>();if(session!=null)foreach(var item in session.Ledger)ledger.Add(Wire.Lossless(item));if(drain!=null)foreach(var item in drain.Ledger)ledger.Add(Wire.Lossless(item));
      if(ledger.Count>2048) { facts.Overflow=true;ledger=ledger.GetRange(0,2048); }
      try {
        if(output!=null)Policy.SaveExclusive(c.Root,"stdout.raw",output.Retained,1048576);
        if(errorOutput!=null)Policy.SaveExclusive(c.Root,"stderr.raw",errorOutput.Retained,1048576);
        var report=new Dictionary<string,object>{{"started",started},{"finished",DateTime.UtcNow.ToString("o")},{"controlId",c.Id},{"configSha256",c.Fingerprint},{"classification",Policy.Classify(facts)},{"facts",facts},{"identity",identity},{"errors",errors},{"events",ledger},
          {"stdoutAvailable",output!=null},{"stderrAvailable",errorOutput!=null},{"stdoutTotalBytes",output==null?null:output.Total.ToString(System.Globalization.CultureInfo.InvariantCulture)},{"stderrTotalBytes",errorOutput==null?null:errorOutput.Total.ToString(System.Globalization.CultureInfo.InvariantCulture)},
          {"stdoutStartup",outputStartup},{"stderrStartup",errorStartup},{"rollbackReceipts",rollbackReceipts},
          {"loaderIdentity",session==null?null:session.LoaderIdentity},{"phaseWitness",session==null?null:session.PhaseWitness},{"descendantObservation",descendant==null?null:descendant.Observation},
          {"stdoutEof",output!=null&&output.Eof},{"stderrEof",errorOutput!=null&&errorOutput.Eof},{"stdoutErrors",output==null?null:output.Errors},{"stderrErrors",errorOutput==null?null:errorOutput.Errors},
          {"stdoutDroppedErrors",output==null?0:output.DroppedErrors},{"stderrDroppedErrors",errorOutput==null?0:errorOutput.DroppedErrors},{"stdoutResourcesReleased",output!=null&&output.ResourcesReleased},{"stderrResourcesReleased",errorOutput!=null&&errorOutput.ResourcesReleased},
          {"descendantVerified",descendant!=null&&descendant.Verified},{"descendantExitObserved",descendantExited},
          {"scope","Distinct synthetic diagnostic population. Not product timing, preview-test pass, cause/fix, neutrality or SOUND."}};
        Policy.SaveExclusive(c.Root,"result.json",Json(report),4194304);return Policy.Classify(facts);
      }catch(Exception evidenceError) {
        // Retain bounded failure text when a complete JSON report cannot be written.
        string text="INCOMPLETE evidence write:"+evidenceError.GetType().Name+":"+evidenceError.Message;
        try { Policy.SaveExclusive(c.Root,"evidence-error.txt",Encoding.UTF8.GetBytes(text.Substring(0,Math.Min(text.Length,4096))),8192); }catch { }
        return "INCOMPLETE";
      }
    }
  }
}
