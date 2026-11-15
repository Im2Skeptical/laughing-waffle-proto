using System;
using System.IO;
using System.Text;
using NativeCapturePrototype;
using NativeCaptureController;

namespace NativeTrialLifetime {
  public sealed class TrialHostLaunch {
    public readonly FrozenTrial Config;public readonly string ConfigFile,ConfigFileSha256,AdmissionFile,AdmissionSha256;
    readonly string[] arguments;
    static string Hash(string value) { Guard.Require(value!=null&&System.Text.RegularExpressions.Regex.IsMatch(value,@"^[0-9a-f]{64}$"),"Pinned launch SHA256 required");return value; }
    static string Pin(FrozenTrial c,string file) { foreach(var p in c.InputPins)if(String.Equals(p.Path,file,StringComparison.OrdinalIgnoreCase))return p.Sha256;throw new InvalidOperationException("Launch input absent from pins"); }
    public TrialHostLaunch(FrozenTrial c,string configFile,string configBytesSha,string admissionFile,string admissionSha) {
      Guard.Require(c!=null,"Frozen launch config required");Config=c;ConfigFile=Guard.Absolute(configFile);AdmissionFile=Guard.Absolute(admissionFile);ConfigFileSha256=Hash(configBytesSha);AdmissionSha256=Hash(admissionSha);
      string artifact=System.IO.Path.GetDirectoryName(System.IO.Path.GetDirectoryName(c.Root));Guard.Require(Guard.Inside(ConfigFile,artifact)&&Guard.Inside(AdmissionFile,artifact)&&!String.Equals(ConfigFile,AdmissionFile,StringComparison.OrdinalIgnoreCase),"Config/admission paths must be distinct and inside artifact family");
      arguments=new[]{"-NoLogo","-NoProfile","-NonInteractive","-ExecutionPolicy","Bypass","-File",c.HostScript,"-ConfigFile",ConfigFile,"-ConfigFileSha256",ConfigFileSha256,"-ConfigFingerprint",c.ConfigSha256,"-ObserverLibrary",c.ObserverLibrary,"-ObserverSha256",Pin(c,c.ObserverLibrary),"-AdmissionFile",AdmissionFile,"-AdmissionSha256",AdmissionSha256};
    }
    public string[] Arguments { get { return (string[])arguments.Clone(); } }
    public string CommandLine { get { return Wire.CommandLine(Config.HostExecutable,arguments); } }
    public void VerifyFiles() { Config.VerifyInputs(new TrialDiskPins());foreach(var p in new[]{new TrialFilePin { Path=ConfigFile,Sha256=ConfigFileSha256,Bytes=new FileInfo(ConfigFile).Length },new TrialFilePin { Path=AdmissionFile,Sha256=AdmissionSha256,Bytes=new FileInfo(AdmissionFile).Length }}) { Guard.Require(p.Bytes>0&&p.Bytes<=262144,"Bounded config/admission files");new TrialDiskPins().Verify(p); } }
  }
  public interface ITrialRootPublisher { void Publish(TrialStartup suspendedRoot); }
  public sealed class TrialRootPublicationGate {
    bool attempted,published,resumeAttempted,resumed;
    public void Publish(TrialStartup root,ITrialRootPublisher output) { Guard.Require(!attempted&&!resumed&&root!=null&&root.Created&&root.IdentityVerified&&root.AssignedBeforeResume&&!root.Resumed&&output!=null,"One verified suspended-root publication required");attempted=true;output.Publish(root);published=true; }
    public void Resume(Action resume) { Guard.Require(published&&!resumeAttempted&&resume!=null,"Root journal must complete before one Resume");resumeAttempted=true;resume();resumed=true; }
    public bool Published { get { return published; } } public bool Resumed { get { return resumed; } }
  }
  public sealed class TrialDiskRootPublisher : ITrialRootPublisher {
    readonly FrozenTrial c;readonly TrialHostIdentity host;
    public TrialDiskRootPublisher(FrozenTrial config,TrialHostIdentity identity) { c=config;host=identity; }
    public void Publish(TrialStartup root) { TrialProvenance.SaveRootJournal(c,root,host); }
  }
}
