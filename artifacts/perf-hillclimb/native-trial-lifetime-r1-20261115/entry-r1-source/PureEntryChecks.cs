using System;
using System.Text;
using System.Collections.Generic;
using NativeCapturePrototype;
using NativeCaptureController;

namespace NativeTrialLifetime {
  public static class PureEntryChecks {
    static readonly List<string> checks=new List<string>();
    static void Yes(string n,bool v){if(!v)throw new Exception("FAIL:"+n);checks.Add(n);}static void Reject(string n,Action a){bool caught=false;try{a();}catch{caught=true;}Yes(n,caught);}
    sealed class Fake:ITrialHostEntryCalls {
      internal string Fault;internal readonly List<string> Order=new List<string>();internal int Intended=-1;
      void Call(string phase){Order.Add(phase);if(Fault==phase)throw new Exception("fixture failure "+phase);}
      public void VerifyBeforeNative(){Call("verify");}public void CaptureSelfAndStartJournal(){Call("start");}
      public bool ExecuteControllerAndSave(){Call("controller");return Fault!="incomplete";}
      public bool ReleaseSelf(){Call("release");return Fault!="close-false";}
      public bool FinishJournal(int code,string[] errors){Intended=code;Call("end");return Fault!="end-false";}
    }
    static TrialHostIdentity Host(UInt32 context){return new TrialHostIdentity {Pid=42,HandleOwnerPid=context,CreatedFileTimeHex=Policy.Hex(134087812345678901UL),Image=@"C:\virtual\powershell.exe",ImageSha256=new string('a',64),OwnedHandle=Policy.Hex(4096)};}
    public static string[] Run(){
      checks.Clear();var fake=new Fake();var r=TrialEntryPolicy.Execute(fake);Yes("entry-validation-start-controller-release-end-order",String.Join(",",fake.Order.ToArray())=="verify,start,controller,release,end");Yes("entry-zero-only-after-complete-evidence-and-close",r.ExitCode==0&&fake.Intended==0&&r.EndJournalSaved&&r.Errors.Count==0);
      foreach(string fault in new[]{"verify","start","controller","incomplete","release","close-false","end","end-false"}){fake=new Fake {Fault=fault};r=TrialEntryPolicy.Execute(fake);Yes("entry-all-faults-request-exit2-"+fault,r.ExitCode==2&&r.Errors.Count>0);Yes("entry-always-release-and-attempt-end-"+fault,fake.Order.Contains("release")&&fake.Order.Contains("end"));if(fault=="verify")Yes("entry-failed-validation-no-native-start",!fake.Order.Contains("start")&&!fake.Order.Contains("controller"));if(fault=="start")Yes("entry-failed-start-no-controller",!fake.Order.Contains("controller"));}
      var c=PureHostLaunchChecks.Config();var launch=new TrialHostLaunch(c,@"C:\virtual\trial\config.json",new string('b',64),@"C:\virtual\trial\admission.json",new string('c',64));var parent=Host(99);var local=Host(42);var journal=TrialHostJournals.Launch(launch,parent);var bytes=TrialHostJournals.Json(journal,8192);var parsed=TrialHostJournals.VerifyLaunch(bytes,launch,local);Yes("entry-cross-process-same-numeric-handle-allowed",(string)parsed["hostOwnedHandle"]==local.OwnedHandle&&parent.HandleOwnerPid!=local.HandleOwnerPid);Yes("entry-FILETIME-above-2pow53-lossless",(string)parsed["hostCreatedFileTimeHex"]==Policy.Hex(134087812345678901UL));
      foreach(string key in new[]{"schema","slotId","mode","configSha256","hostPid","hostCreatedFileTimeHex","hostImage","hostImageSha256","hostHandleOwnerPid","hostOwnedHandle","commandLine","cwd","configFileSha256","admissionSha256","resumed"}){var d=TrialHostJournals.Launch(launch,parent);if(key=="schema")d[key]=2;else if(key=="hostPid")d[key]=(UInt32)43;else if(key=="hostHandleOwnerPid")d[key]=(UInt32)42;else if(key=="resumed")d[key]=true;else d[key]="wrong";Reject("entry-launch-crosslink-rejects-"+key,()=>TrialHostJournals.VerifyLaunch(TrialHostJournals.Json(d,8192),launch,local));}
      Reject("entry-launch-cannot-use-host-local-supervisor-handle",()=>TrialHostJournals.Launch(launch,local));var duplicate=Encoding.UTF8.GetString(bytes);Reject("entry-launch-duplicate-key",()=>TrialHostJournals.VerifyLaunch(Encoding.UTF8.GetBytes(duplicate.Substring(0,duplicate.Length-1)+",\"hostPid\":42}"),launch,local));
      var projected=(Dictionary<string,object>)TrialProjection.Lossless(new TrialHostSetupResult {StartedMs=9007199254740993L,Creation=new TrialCreatedHost {Created=true,RetainedHandle=Policy.Hex(9007199254740993UL)}});Yes("entry-host-setup-projection-int64-lossless",(string)projected["StartedMs"]=="9007199254740993"&&(string)projected["Classification"]=="INCOMPLETE_HOST_SETUP");
      var projection=(Dictionary<string,object>)TrialProjection.Lossless(local);Yes("entry-host-identity-record-registered",(UInt32)projection["HandleOwnerPid"]==42&&(string)projection["CreatedFileTimeHex"]==local.CreatedFileTimeHex);Reject("entry-journal-raw-bytes-never-implicit",()=>TrialHostJournals.Json(new Dictionary<string,object>{{"raw",new byte[1]}},8192));
      return checks.ToArray();
    }
  }
}
