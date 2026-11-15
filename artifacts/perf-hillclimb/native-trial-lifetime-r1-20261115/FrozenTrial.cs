using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using NativeCapturePrototype;
using NativeCaptureController;

namespace NativeTrialLifetime {
  public sealed class TrialFilePin { public string Path,Sha256;public long Bytes; }
  public interface ITrialPinProbe { void Verify(TrialFilePin pin); }
  public sealed class TrialDiskPins : ITrialPinProbe {
    public void Verify(TrialFilePin pin) {
      Guard.NoReparseParents(pin.Path);using(var file=new FileStream(pin.Path,FileMode.Open,FileAccess.Read,FileShare.Read)) {
        Guard.Require(file.Length==pin.Bytes,"Pinned file byte size changed:"+pin.Path);using(var sha=SHA256.Create())Guard.Require(BitConverter.ToString(sha.ComputeHash(file)).Replace("-","").ToLowerInvariant()==pin.Sha256,"Pinned file hash changed:"+pin.Path);
      }
    }
  }
  public sealed class TrialConfig {
    public int Schema;public string ArtifactRoot,RunRoot,Id,Mode,Executable,ExecutableSha256,ObserverLibrary,ObserverSha256,HostExecutable,HostSha256,HostScript,HostScriptSha256,LoaderContractFile,LoaderContractSha256,NtdllSha256;
    public long ExecutableBytes;public TrialFilePin[] Inputs;
    public int StartupMs,WorkMs,CleanupMs,HostWorkMs,HostStopMs,BatchMs,RawBytes,ReportBytes;
  }
  // Pure construction/fingerprint/validation: no native constructor/API. The
  // actual source admission + exclusive reservation gate is still mandatory.
  public sealed class FrozenTrial : IProcessLaunch {
    readonly TrialConfig c;readonly TrialFilePin[] pins;readonly string fingerprint;
    static string PathValue(string s) { string p=Guard.Absolute(s);Guard.Require(p.Length<=1024&&p.IndexOf('\0')<0,"Bounded absolute config path");return p; }
    static string HashValue(string s) { Guard.Require(Regex.IsMatch(s??"",@"^[0-9a-f]{64}$"),"SHA256 required");return s; }
    public FrozenTrial(TrialConfig input) {
      Guard.Require(input!=null&&input.Schema==1&&input.Inputs!=null&&input.Inputs.Length>0&&input.Inputs.Length<=128,"Trial schema/input inventory");
      Guard.Require((input.Id=="lifetime-0-reuse"&&input.Mode=="reuse")||(input.Id=="lifetime-1-fail-after-first"&&input.Mode=="fail-after-first"),"Only two fixed fresh synthetic modes/IDs");
      c=new TrialConfig { Schema=1,ArtifactRoot=PathValue(input.ArtifactRoot),RunRoot=PathValue(input.RunRoot),Id=input.Id,Mode=input.Mode,Executable=PathValue(input.Executable),ExecutableSha256=HashValue(input.ExecutableSha256),ExecutableBytes=input.ExecutableBytes,
        ObserverLibrary=PathValue(input.ObserverLibrary),ObserverSha256=HashValue(input.ObserverSha256),HostExecutable=PathValue(input.HostExecutable),HostSha256=HashValue(input.HostSha256),HostScript=PathValue(input.HostScript),HostScriptSha256=HashValue(input.HostScriptSha256),LoaderContractFile=PathValue(input.LoaderContractFile),LoaderContractSha256=HashValue(input.LoaderContractSha256),NtdllSha256=HashValue(input.NtdllSha256),
        StartupMs=input.StartupMs,WorkMs=input.WorkMs,CleanupMs=input.CleanupMs,HostWorkMs=input.HostWorkMs,HostStopMs=input.HostStopMs,BatchMs=input.BatchMs,RawBytes=input.RawBytes,ReportBytes=input.ReportBytes };
      Guard.Require(String.Equals(c.RunRoot,Path.Combine(c.ArtifactRoot,"controls",c.Id),StringComparison.OrdinalIgnoreCase)&&Guard.Inside(c.Executable,c.ArtifactRoot)&&Guard.Inside(c.ObserverLibrary,c.ArtifactRoot)&&Guard.Inside(c.HostScript,c.ArtifactRoot)&&Guard.Inside(c.LoaderContractFile,c.ArtifactRoot),"Frozen path/cell containment differs");
      Guard.Require(c.ExecutableBytes>0&&c.ExecutableBytes<=16777216&&c.StartupMs==10000&&c.WorkMs==10000&&c.CleanupMs==10000&&c.HostWorkMs==45000&&c.HostStopMs==5000&&c.BatchMs==110000&&c.RawBytes==1048576&&c.ReportBytes==16777216,"Unadmitted synthetic caps");
      var list=new List<TrialFilePin>();var names=new HashSet<string>(StringComparer.OrdinalIgnoreCase);long total=0;
      foreach(var pin in input.Inputs) { Guard.Require(pin!=null&&pin.Bytes>0&&pin.Bytes<=268435456,"Bounded pinned file size");var copy=new TrialFilePin { Path=PathValue(pin.Path),Sha256=HashValue(pin.Sha256),Bytes=pin.Bytes };Guard.Require(names.Add(copy.Path),"Duplicate/aliased input path");total=checked(total+copy.Bytes);Guard.Require(total<=536870912,"Pinned input total byte cap");list.Add(copy); }
      list.Sort((a,b)=>StringComparer.OrdinalIgnoreCase.Compare(a.Path,b.Path));pins=list.ToArray();
      NeedPin(c.Executable,c.ExecutableSha256,c.ExecutableBytes);NeedPin(c.ObserverLibrary,c.ObserverSha256,null);NeedPin(c.HostExecutable,c.HostSha256,null);NeedPin(c.HostScript,c.HostScriptSha256,null);NeedPin(c.LoaderContractFile,c.LoaderContractSha256,null);
      fingerprint=Fingerprint();
    }
    void NeedPin(string path,string sha,long? size) { bool found=false;foreach(var p in pins)if(String.Equals(p.Path,path,StringComparison.OrdinalIgnoreCase))found=p.Sha256==sha&&(!size.HasValue||p.Bytes==size.Value);Guard.Require(found,"Required launch/runtime/loader pin absent/different"); }
    string Fingerprint() {
      var text=new StringBuilder("synthetic-trial-config-v1;");var utf8=new UTF8Encoding(false,true);Action<string> put=s=>text.Append(utf8.GetByteCount(s)).Append(':').Append(s);
      foreach(string s in new[]{c.ArtifactRoot,c.RunRoot,c.Id,c.Mode,c.Executable,c.ExecutableSha256,c.ExecutableBytes.ToString(System.Globalization.CultureInfo.InvariantCulture),c.ObserverLibrary,c.ObserverSha256,c.HostExecutable,c.HostSha256,c.HostScript,c.HostScriptSha256,c.LoaderContractFile,c.LoaderContractSha256,c.NtdllSha256})put(s);
      foreach(int n in new[]{c.StartupMs,c.WorkMs,c.CleanupMs,c.HostWorkMs,c.HostStopMs,c.BatchMs,c.RawBytes,c.ReportBytes,pins.Length})put(n.ToString(System.Globalization.CultureInfo.InvariantCulture));
      foreach(var p in pins) { put(p.Path);put(p.Sha256);put(p.Bytes.ToString(System.Globalization.CultureInfo.InvariantCulture)); }
      using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(utf8.GetBytes(text.ToString()))).Replace("-","").ToLowerInvariant();
    }
    public void VerifyInputs(ITrialPinProbe probe) { Guard.Require(probe!=null,"Concrete input probe required");foreach(var p in pins)probe.Verify(new TrialFilePin { Path=p.Path,Sha256=p.Sha256,Bytes=p.Bytes }); }
    public void VerifyFingerprint(string admitted) { Guard.Require(HashValue(admitted)==fingerprint,"Config differs from independent source admission"); }
    public void RequireLeafTime(DateTime nowUtc) { Guard.Require(nowUtc.Kind==DateTimeKind.Utc&&nowUtc<LeafCutoffUtc,"Native leaf cutoff reached/clock not UTC"); }
    public void ReserveAttempt(string admitted,DateTime nowUtc) {
      VerifyFingerprint(admitted);RequireLeafTime(nowUtc);VerifyInputs(new TrialDiskPins());Guard.Require(Directory.Exists(c.RunRoot),"Source-admitted fresh slot directory required");Guard.NoReparseParents(c.RunRoot);
      Guard.Require(Directory.GetFileSystemEntries(c.RunRoot).Length==0,"Never repeat/nonempty slot");Guard.Reserve(c.RunRoot,"attempt.marker");
    }
    public static DateTime LeafCutoffUtc { get { return new DateTime(2026,11,16,1,45,0,DateTimeKind.Utc); } }
    public static DateTime HardDeadlineUtc { get { return new DateTime(2026,11,16,2,40,0,DateTimeKind.Utc); } }
    public string ConfigSha256 { get { return fingerprint; } } public string Id { get { return c.Id; } } public string Mode { get { return c.Mode; } } public string Root { get { return c.RunRoot; } }
    public string Executable { get { return c.Executable; } } public string ExecutableHash { get { return c.ExecutableSha256; } } public long ExecutableBytes { get { return c.ExecutableBytes; } }
    public string Cwd { get { return c.RunRoot; } } public string CommandLine { get { return Wire.CommandLine(c.Executable,new[]{c.Mode,c.RunRoot}); } }
    public string ObserverLibrary { get { return c.ObserverLibrary; } } public string HostExecutable { get { return c.HostExecutable; } } public string HostScript { get { return c.HostScript; } }
    public string LoaderContractFile { get { return c.LoaderContractFile; } } public string LoaderContractHash { get { return c.LoaderContractSha256; } } public string NtdllHash { get { return c.NtdllSha256; } }
    public TrialFilePin[] InputPins { get { var copy=new List<TrialFilePin>();foreach(var p in pins)copy.Add(new TrialFilePin { Path=p.Path,Sha256=p.Sha256,Bytes=p.Bytes });return copy.ToArray(); } }
  }
}
