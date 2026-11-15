using System;
using System.IO;
using System.Text;
using System.Reflection;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using NativeCapturePrototype;
using NativeCaptureController;

namespace NativeTrialLifetime {
  public static class TrialHostEntry {
    // Declared only until COMPLETE independent source admission. Never invoke
    // from build/pure controls. Environment.Exit is unconditional on all paths.
    public static void ExecuteAndExit(string configFile,string configFileSha256,string configFingerprint,string observerLibrary,string observerSha256,string admissionFile,string admissionSha256){
      int code=2;try{var entry=new Concrete(configFile,configFileSha256,configFingerprint,observerLibrary,observerSha256,admissionFile,admissionSha256);code=TrialEntryPolicy.Execute(entry).ExitCode;}finally{Environment.Exit(code);}
    }
    sealed class Concrete:ITrialHostEntryCalls {
      readonly string configFile,configBytesSha,fingerprint,library,librarySha,admissionFile,admissionSha;FrozenTrial c;TrialHostLaunch launch;TrialAdmission admission;FrozenLoader loader;TrialHostSelf self;TrialRelease selfRelease;TrialControlResult result;bool validated;
      Dictionary<string,object> parentLaunch,provenance;readonly List<string> errors=new List<string>();
      internal Concrete(string config,string bytesSha,string fp,string dll,string dllSha,string receipt,string receiptSha){configFile=config;configBytesSha=bytesSha;fingerprint=fp;library=dll;librarySha=dllSha;admissionFile=receipt;admissionSha=receiptSha;}
      public void VerifyBeforeNative(){
        byte[] bytes=TrialPinnedBytes.Read(Guard.Absolute(configFile),configBytesSha,262144);var input=new JavaScriptSerializer {MaxJsonLength=262144,RecursionLimit=16}.Deserialize<TrialConfig>(new UTF8Encoding(false,true).GetString(bytes));c=new FrozenTrial(input);c.VerifyFingerprint(fingerprint);c.RequireLeafTime(DateTime.UtcNow);
        Guard.Require(String.Equals(Guard.Absolute(library),c.ObserverLibrary,StringComparison.OrdinalIgnoreCase)&&String.Equals(Guard.Absolute(Assembly.GetExecutingAssembly().Location),c.ObserverLibrary,StringComparison.OrdinalIgnoreCase),"Loaded observer path differs");bool pinned=false;foreach(var p in c.InputPins)if(String.Equals(p.Path,c.ObserverLibrary,StringComparison.OrdinalIgnoreCase))pinned=p.Sha256==librarySha;Guard.Require(pinned,"Loaded observer SHA differs");
        launch=new TrialHostLaunch(c,configFile,configBytesSha,admissionFile,admissionSha);admission=launch.VerifyFiles();TrialReservation.VerifyExisting(c.Root,true);
        Guard.Require(String.Equals(Guard.Absolute(Environment.CurrentDirectory),c.Root,StringComparison.OrdinalIgnoreCase)&&Environment.CommandLine==launch.CommandLine,"Actual host cwd/command line differs");
        var expected=new HashSet<string>(new[]{"attempt.marker","host-attempt.marker","host-launch.json"},StringComparer.Ordinal);int count=0;foreach(string path in Directory.EnumerateFileSystemEntries(c.Root)){Guard.Require(++count<=3&&expected.Remove(Path.GetFileName(path)),"Host entry stale/nonfresh prefix");}Guard.Require(expected.Count==0,"Host entry prefix incomplete");
        loader=new FrozenLoader(c.LoaderContractFile,c.LoaderContractHash,c.NtdllHash);Guard.Reserve(c.Root,"host-entry.marker");validated=true;
      }
      public void CaptureSelfAndStartJournal(){
        Guard.Require(validated,"Host entry validation before native capture");c.RequireLeafTime(DateTime.UtcNow);self=new TrialHostSelf();self.Capture(c);byte[] original=TrialHostJournals.ReadLaunch(c.Root);parentLaunch=TrialHostJournals.VerifyLaunch(original,launch,self.Identity);
        provenance=new Dictionary<string,object>{{"configSha256",c.ConfigSha256},{"configFile",launch.ConfigFile},{"configFileSha256",launch.ConfigFileSha256},{"admissionFile",launch.AdmissionFile},{"admissionSha256",launch.AdmissionSha256},{"reviewFile",admission.ReviewFile},{"reviewSha256",admission.ReviewSha256},{"manifestFile",admission.ManifestFile},{"manifestSha256",admission.ManifestSha256},{"inputPins",c.InputPins},{"loader",loader.Evidence()},{"selfHost",self.Identity},{"supervisorHostLaunch",parentLaunch},{"supervisorHostLaunchSha256",TrialHostJournals.Hash(original)},{"actualHostCommandLine",Environment.CommandLine},{"actualHostCwd",Environment.CurrentDirectory},{"observerLibrary",c.ObserverLibrary},{"observerSha256",librarySha},{"creatingOSThread",Native.GetCurrentThreadId()},{"selfCapture",self.Evidence}};
        TrialHostJournals.Save(c.Root,"host-start.json",new Dictionary<string,object>{{"schema",1},{"slotId",c.Id},{"mode",c.Mode},{"provenance",provenance}});
      }
      public bool ExecuteControllerAndSave(){
        Guard.Require(self!=null&&provenance!=null,"Host start journal before controller required");c.RequireLeafTime(DateTime.UtcNow);var owner=new TrialNativeOwner(c,loader,new TrialDiskRootPublisher(c,self.Identity));result=TrialController.Execute(owner);
        Dictionary<string,TrialOriginalFile> originals=null;try{originals=TrialOriginalFiles.Capture(c.Root);}catch(Exception e){errors.Add("Original capture:"+e.GetType().Name+":"+e.Message);}
        bool saved=TrialReport.Save(c.Root,c.Mode,result,originals,provenance);var outcome=TrialTargetOutcome.Classify(c.Mode,result,originals);return saved&&result.ContainmentComplete&&!result.HostExitRequired&&outcome.LinkedExpectedOutcome&&errors.Count==0;
      }
      public bool ReleaseSelf(){if(self==null)return true;selfRelease=self.Close();return selfRelease.Confirmed;}
      public bool FinishJournal(int intendedExitCode,string[] entryErrors){
        if(!validated)return false;TrialHostJournals.Save(c.Root,"host-end.json",new Dictionary<string,object>{{"schema",1},{"slotId",c.Id},{"mode",c.Mode},{"configSha256",c.ConfigSha256},{"intendedExitCode",intendedExitCode},{"hostExitRequired",result==null||result.HostExitRequired},{"self",self==null?null:self.Evidence},{"selfRelease",selfRelease},{"entryErrors",entryErrors},{"captureErrors",errors.ToArray()},{"scope","Exit intention only; independent supervisor kernel wait/exit code must confirm physical host exit."}});return true;
      }
    }
  }
}
