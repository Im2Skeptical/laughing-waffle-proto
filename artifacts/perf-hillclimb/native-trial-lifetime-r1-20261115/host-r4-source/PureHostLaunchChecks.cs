using System;
using System.IO;
using System.Collections.Generic;
using NativeCapturePrototype;
using NativeCaptureController;

namespace NativeTrialLifetime {
  public static class PureHostLaunchChecks {
    static readonly List<string> checks=new List<string>();
    static void Yes(string name,bool value){if(!value)throw new Exception("FAIL:"+name);checks.Add(name);}
    static void Reject(string name,Action action){bool rejected=false;try{action();}catch{rejected=true;}Yes(name,rejected);}
    sealed class Publisher:ITrialRootPublisher { internal Action Action;internal int Calls;public void Publish(TrialStartup root){Calls++;if(Action!=null)Action();} }
    static TrialStartup Root(){return new TrialStartup {Created=true,IdentityVerified=true,AssignedBeforeResume=true};}
    internal static FrozenTrial Config(){
      string path=@"C:\virtual\trial",sha=new string('a',64);var c=new TrialConfig {Schema=1,ArtifactRoot=path,RunRoot=Path.Combine(path,"controls","lifetime-0-reuse"),Id="lifetime-0-reuse",Mode="reuse",Executable=Path.Combine(path,"target.exe"),ExecutableSha256=sha,ExecutableBytes=4096,ObserverLibrary=Path.Combine(path,"observer.dll"),ObserverSha256=sha,HostExecutable=@"C:\virtual\powershell.exe",HostSha256=sha,HostScript=Path.Combine(path,"host.ps1"),HostScriptSha256=sha,LoaderContractFile=Path.Combine(path,"loader.json"),LoaderContractSha256=sha,NtdllSha256=sha,StartupMs=10000,WorkMs=10000,CleanupMs=10000,HostWorkMs=45000,HostStopMs=5000,BatchMs=110000,RawBytes=1048576,ReportBytes=16777216};
      var pins=new List<TrialFilePin>();foreach(string p in new[]{c.Executable,c.ObserverLibrary,c.HostExecutable,c.HostScript,c.LoaderContractFile})pins.Add(new TrialFilePin {Path=p,Sha256=sha,Bytes=p==c.Executable?4096:1024});c.Inputs=pins.ToArray();return new FrozenTrial(c);
    }
    public static string[] Run(){
      checks.Clear();var c=Config();string sha=new string('b',64),config=@"C:\virtual\trial\config.json",admission=@"C:\virtual\trial\admission.json";var launch=new TrialHostLaunch(c,config,sha,admission,sha);
      var expected=new[]{"-NoLogo","-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass","-File",c.HostScript,"-ConfigFile",config,"-ConfigFileSha256",sha,"-ConfigFingerprint",c.ConfigSha256,"-ObserverLibrary",c.ObserverLibrary,"-ObserverSha256",new string('a',64),"-AdmissionFile",admission,"-AdmissionSha256",sha};
      Yes("host-launch-exact-argv-and-wire",launch.CommandLine==Wire.CommandLine(c.HostExecutable,expected));var exposed=launch.Arguments;exposed[0]="changed";Yes("host-arguments-copy-immutable",launch.Arguments[0]=="-NoLogo");
      Reject("host-launch-null-config",()=>new TrialHostLaunch(null,config,sha,admission,sha));Reject("host-launch-invalid-config-hash",()=>new TrialHostLaunch(c,config,"bad",admission,sha));Reject("host-launch-invalid-admission-hash",()=>new TrialHostLaunch(c,config,sha,admission,"bad"));Reject("host-launch-config-outside",()=>new TrialHostLaunch(c,@"C:\other.json",sha,admission,sha));Reject("host-launch-admission-outside",()=>new TrialHostLaunch(c,config,sha,@"C:\other.json",sha));Reject("host-launch-alias-inputs",()=>new TrialHostLaunch(c,config,sha,config,sha));
      var gate=new TrialRootPublicationGate();var output=new Publisher();int resumes=0;Reject("root-no-resume-before-journal",()=>gate.Resume(()=>resumes++));gate.Publish(Root(),output);gate.Resume(()=>{Yes("root-journal-completed-before-action",gate.Published&&output.Calls==1);resumes++;});Yes("root-one-publication-one-resume",gate.Published&&gate.Resumed&&resumes==1);Reject("root-no-second-publication",()=>gate.Publish(Root(),output));Reject("root-no-second-resume",()=>gate.Resume(()=>resumes++));
      foreach(string fault in new[]{"created","identity","assigned","resumed","null"}){var root=Root();if(fault=="created")root.Created=false;if(fault=="identity")root.IdentityVerified=false;if(fault=="assigned")root.AssignedBeforeResume=false;if(fault=="resumed")root.Resumed=true;if(fault=="null")root=null;var bad=new TrialRootPublicationGate();Reject("root-publication-rejects-"+fault,()=>bad.Publish(root,output));}
      gate=new TrialRootPublicationGate();var failed=new Publisher {Action=()=>{throw new Exception("journal write failed");}};Reject("root-journal-write-failure",()=>gate.Publish(Root(),failed));Yes("root-failed-write-never-published",!gate.Published&&!gate.Resumed);Reject("root-failed-write-blocks-resume",()=>gate.Resume(()=>resumes++));Reject("root-failed-write-cannot-retry",()=>gate.Publish(Root(),output));
      gate=new TrialRootPublicationGate();gate.Publish(Root(),output);Reject("root-native-resume-failure",()=>gate.Resume(()=>{throw new Exception("resume failed");}));Yes("root-failed-resume-not-complete",!gate.Resumed);Reject("root-failed-resume-cannot-retry",()=>gate.Resume(()=>resumes++));
      gate=new TrialRootPublicationGate();var reentrant=new Publisher();reentrant.Action=()=>Reject("root-reentrant-publication-rejected",()=>gate.Publish(Root(),output));gate.Publish(Root(),reentrant);gate.Resume(()=>Reject("root-reentrant-resume-rejected",()=>gate.Resume(()=>resumes++)));Yes("root-reentrant-guard-keeps-complete-order",gate.Published&&gate.Resumed);
      return checks.ToArray();
    }
  }
}
