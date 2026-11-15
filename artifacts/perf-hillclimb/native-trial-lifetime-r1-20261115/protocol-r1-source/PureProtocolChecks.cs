using System;
using System.IO;
using System.Collections.Generic;
using NativeCapturePrototype;
using NativeCaptureController;

namespace NativeTrialLifetime {
  public static class PureProtocolChecks {
    static readonly List<string> checks=new List<string>();static readonly string sha=new string('a',64);
    static void Yes(string name,bool value) { if(!value)throw new Exception("FAIL:"+name);checks.Add(name); }
    static void Reject(string name,Action action) { bool rejected=false;try { action(); }catch { rejected=true; }Yes(name,rejected); }
    static TrialConfig Config() {
      string root=@"C:\virtual\trial";var c=new TrialConfig { Schema=1,ArtifactRoot=root,RunRoot=Path.Combine(root,"controls","lifetime-0-reuse"),Id="lifetime-0-reuse",Mode="reuse",Executable=Path.Combine(root,"target.exe"),ExecutableSha256=sha,ExecutableBytes=4096,ObserverLibrary=Path.Combine(root,"observer.dll"),ObserverSha256=sha,HostExecutable=@"C:\virtual\powershell.exe",HostSha256=sha,HostScript=Path.Combine(root,"host.ps1"),HostScriptSha256=sha,LoaderContractFile=Path.Combine(root,"loader.json"),LoaderContractSha256=sha,NtdllSha256=sha,StartupMs=10000,WorkMs=10000,CleanupMs=10000,HostWorkMs=45000,HostStopMs=5000,BatchMs=110000,RawBytes=1048576,ReportBytes=16777216 };
      var pins=new List<TrialFilePin>();foreach(string p in new[]{c.Executable,c.ObserverLibrary,c.HostExecutable,c.HostScript,c.LoaderContractFile})pins.Add(new TrialFilePin { Path=p,Sha256=sha,Bytes=p==c.Executable?4096:1024 });c.Inputs=pins.ToArray();return c;
    }
    sealed class Probe:ITrialPinProbe { internal int Calls;internal bool Fail;public void Verify(TrialFilePin p) { Calls++;if(Fail)throw new Exception("fixture pin mismatch");p.Sha256=new string('b',64); } }
    static TrialHostIdentity Host(UInt32 context=42) { return new TrialHostIdentity { Pid=42,HandleOwnerPid=context,CreatedFileTimeHex=Policy.Hex(123456),Image=@"C:\virtual\powershell.exe",ImageSha256=sha,OwnedHandle=Policy.Hex(4096) }; }
    sealed class FakeHost:ITrialHostCalls {
      internal readonly TrialHostIdentity Identity=Host(99);internal string Fault;internal long Clock;internal int Calls,Kills;internal bool Terminated;
      public long MonotonicMilliseconds { get { return Fault=="backward"&&Calls>0?Clock-10000:Clock; } }
      public TrialHostWait WaitOwned(int cap) {
        Calls++;Clock+=cap;bool timeout=Fault=="timeout"||Fault=="no-exit"||Fault=="kill-fail"||Fault=="backward";UInt32 status=timeout&&!Terminated?258u:0u;if(Fault=="no-exit")status=258;if(Fault=="wait-failed")status=UInt32.MaxValue;
        return new TrialHostWait { NativeCalled=true,OwnerHeld=Fault!="unheld",IdentityVerified=true,Handle=Identity.OwnedHandle,HandleOwnerPid=Fault=="wrong-context"?100u:Identity.HandleOwnerPid,Pid=Fault=="wrong-pid"?43u:42u,CreatedFileTimeHex=Fault=="wrong-generation"?Policy.Hex(9):Identity.CreatedFileTimeHex,Image=Identity.Image,Status=status,RequestedMs=cap,RawLastError=status==UInt32.MaxValue?6:121,ErrorValid=status==UInt32.MaxValue,Error=status==UInt32.MaxValue?(int?)6:null,ExitCodeCall=BoolNativeReceipt.From("GetExitCodeProcess",true,121),ExitCode=Fault=="exit2"?2u:0u };
      }
      public BoolNativeReceipt TerminateOwned(TrialHostIdentity expected) {
        bool verified=expected.Pid==Identity.Pid&&expected.CreatedFileTimeHex==Identity.CreatedFileTimeHex&&expected.OwnedHandle==Identity.OwnedHandle&&Fault!="wrong-pid"&&Fault!="wrong-generation"&&Fault!="wrong-context"&&Fault!="unheld"&&Fault!="wait-failed";
        if(verified)Kills++;Terminated=true;return BoolNativeReceipt.From("TerminateProcess exact owned host",verified&&Fault!="kill-fail",5);
      }
      public TrialRelease ReleaseOwned() { return new TrialRelease { Origin="host.process.wait-duplicate",Handle=Identity.OwnedHandle,NativeCalled=true,Confirmed=Fault!="release",State=Fault=="release"?"NATIVE_CLOSE_FAILED":"NATIVE_CLOSE_SUCCEEDED",RawLastError=Fault=="release"?6:121,ErrorValid=Fault=="release",Error=Fault=="release"?(int?)6:null }; }
    }
    public static string[] Run() {
      checks.Clear();var input=Config();var frozen=new FrozenTrial(input);string original=frozen.ConfigSha256;input.Mode="tampered";input.Inputs[0].Sha256=new string('b',64);Yes("config-deep-copy-input-immutable",frozen.Mode=="reuse"&&frozen.ConfigSha256==original);
      var exposed=frozen.InputPins;exposed[0].Sha256="tampered";Yes("config-exposed-pin-copy-immutable",frozen.InputPins[0].Sha256==sha);
      var probe=new Probe();frozen.VerifyInputs(probe);Yes("config-probe-cannot-mutate-frozen-pins",probe.Calls==5&&frozen.InputPins[0].Sha256==sha);Reject("config-live-pin-mismatch-rejected",()=>frozen.VerifyInputs(new Probe { Fail=true }));
      var order=Config();Array.Reverse(order.Inputs);Yes("config-pin-order-stable-fingerprint",new FrozenTrial(order).ConfigSha256==original);frozen.VerifyFingerprint(original);Reject("config-wrong-admitted-fingerprint",()=>frozen.VerifyFingerprint(new string('b',64)));
      Yes("config-original-root-argv-only",frozen.CommandLine==Wire.CommandLine(frozen.Executable,new[]{"reuse",frozen.Root}));
      frozen.RequireLeafTime(FrozenTrial.LeafCutoffUtc.AddTicks(-1));Reject("config-leaf-cutoff-exact-stops",()=>frozen.RequireLeafTime(FrozenTrial.LeafCutoffUtc));Reject("config-nonUTC-clock-rejected",()=>frozen.RequireLeafTime(DateTime.SpecifyKind(FrozenTrial.LeafCutoffUtc.AddHours(-1),DateTimeKind.Local)));Yes("config-extended-hard-deadline",FrozenTrial.HardDeadlineUtc==new DateTime(2026,11,16,2,40,0,DateTimeKind.Utc));
      foreach(string fault in new[]{"schema","id","mode","root","exe-outside","caps","bytes","hash","duplicate","missing","size"}) { var c=Config();switch(fault) { case "schema":c.Schema=2;break;case "id":c.Id="control-0-normal";break;case "mode":c.Mode="normal";break;case "root":c.RunRoot=@"C:\other\slot";break;case "exe-outside":c.Executable=@"C:\other.exe";break;case "caps":c.CleanupMs++;break;case "bytes":c.ExecutableBytes=0;break;case "hash":c.ObserverSha256="bad";break;case "duplicate":c.Inputs[1].Path=c.Inputs[0].Path;break;case "missing":c.Inputs=new[]{c.Inputs[0]};break;case "size":c.Inputs[0].Bytes++;break; }Reject("config-rejects-"+fault,()=>new FrozenTrial(c)); }
      var root=new TrialStartup { RootPid=100,PrimaryTid=101,CreatingThread=102,Created=true,IdentityVerified=true,AssignedBeforeResume=true,Resumed=false,Image=frozen.Executable,CreatedFileTimeHex=Policy.Hex(1000) };var host=Host();var journal=TrialProvenance.RootJournal(frozen,root,host);host.Pid=99;Yes("journal-copies-host-before-resume",journal.Host.Pid==42&&journal.Resumed==false&&journal.ConfigSha256==frozen.ConfigSha256);
      root.Resumed=true;Reject("journal-cannot-be-published-after-resume",()=>TrialProvenance.RootJournal(frozen,root,Host()));root.Resumed=false;Reject("journal-host-supervisor-handle-context-not-host-local",()=>TrialProvenance.RootJournal(frozen,root,Host(99)));root.AssignedBeforeResume=false;Reject("journal-before-job-assignment-rejected",()=>TrialProvenance.RootJournal(frozen,root,Host()));
      var fake=new FakeHost();var result=TrialHostPolicy.Supervise(fake.Identity,fake);Yes("host-natural-kernel-exit0-and-release",result.SuccessfulHostRun&&result.ExitConfirmed&&!result.ForcedStop&&fake.Kills==0);
      foreach(string fault in new[]{"exit2","timeout","no-exit","kill-fail","backward","wait-failed","wrong-pid","wrong-generation","wrong-context","unheld","release"}) { fake=new FakeHost { Fault=fault };result=TrialHostPolicy.Supervise(fake.Identity,fake);Yes("host-policy-rejects-"+fault,!result.SuccessfulHostRun);Yes("host-policy-bounded-and-owned-release-"+fault,fake.Calls<=576&&result.Release!=null);if(fault=="wrong-pid"||fault=="wrong-generation"||fault=="wrong-context"||fault=="unheld"||fault=="wait-failed")Yes("host-policy-no-foreign-destruction-"+fault,fake.Kills==0); }
      return checks.ToArray();
    }
  }
}
