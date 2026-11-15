using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.Security.Cryptography;
using System.Text.RegularExpressions;
using NativeCapturePrototype;

namespace NativeTrialLifetime {
  public static class TrialPinnedBytes {
    public static byte[] Read(string path,string expectedSha,int maximum){
      Guard.Require(Regex.IsMatch(expectedSha??"",@"^[0-9a-f]{64}$")&&maximum>0&&maximum<=262144,"Bounded pinned byte input required");Guard.NoReparseParents(path);
      using(var file=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.Read)){Guard.Require(file.Length>0&&file.Length<=maximum,"Pinned byte length exceeded");var bytes=new byte[(int)file.Length];int at=0,n;while(at<bytes.Length&&(n=file.Read(bytes,at,bytes.Length-at))>0)at+=n;Guard.Require(at==bytes.Length,"Pinned input truncated");using(var sha=SHA256.Create())Guard.Require(BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-","").ToLowerInvariant()==expectedSha,"Pinned input bytes changed");return bytes;}
    }
  }
  // This validates a separately issued, hash-pinned source admission receipt.
  // Auditor/Builder strings are crosslinks, not proof of independence. The
  // independent full-source review must issue/own these exact admission bytes.
  public sealed class TrialAdmission {
    public readonly string Auditor,Builder,ReviewFile,ReviewSha256,ManifestFile,ManifestSha256;
    TrialAdmission(string auditor,string builder,string review,string reviewSha,string manifest,string manifestSha){Auditor=auditor;Builder=builder;ReviewFile=review;ReviewSha256=reviewSha;ManifestFile=manifest;ManifestSha256=manifestSha;}
    static string Text(Dictionary<string,object> d,string key){object value;Guard.Require(d.TryGetValue(key,out value)&&value is string,"Admission string required:"+key);return (string)value;}
    static string Hash(Dictionary<string,object> d,string key){string value=Text(d,key);Guard.Require(Regex.IsMatch(value,@"^[0-9a-f]{64}$"),"Admission SHA256 required");return value;}
    public static TrialAdmission Parse(FrozenTrial c,byte[] bytes){
      Guard.Require(c!=null,"Admission config absent");var d=TrialFlatJson.Parse(bytes);var names=new HashSet<string>(new[]{"schema","kind","verdict","auditor","builder","slotId","mode","configSha256","observerSha256","targetSha256","reviewFile","reviewSha256","manifestFile","manifestSha256","notAfterUtc"},StringComparer.Ordinal);
      Guard.Require(d.Count==names.Count,"Admission exact schema required");foreach(string key in d.Keys)Guard.Require(names.Contains(key),"Unknown admission key");Guard.Require(d["schema"] is UInt32&&(UInt32)d["schema"]==1,"Admission schema differs");
      Guard.Require(Text(d,"kind")=="SOURCE_ONLY_TWO_SYNTHETIC_CELLS"&&Text(d,"verdict")=="SOURCE_ACCEPTED","No partial/runtime/SOUND admission substitution");
      Guard.Require(Text(d,"slotId")==c.Id&&Text(d,"mode")==c.Mode&&Hash(d,"configSha256")==c.ConfigSha256&&Hash(d,"targetSha256")==c.ExecutableHash,"Admission slot/mode/config/self differs");
      string observer=null;foreach(var p in c.InputPins)if(String.Equals(p.Path,c.ObserverLibrary,StringComparison.OrdinalIgnoreCase))observer=p.Sha256;Guard.Require(Hash(d,"observerSha256")==observer,"Admission observer binary differs");
      Guard.Require(Text(d,"notAfterUtc")=="2026-11-16T01:45:00Z","Admission cannot extend leaf cutoff");string auditor=Text(d,"auditor"),builder=Text(d,"builder");Guard.Require(!String.IsNullOrWhiteSpace(auditor)&&auditor.Length<=128&&!String.IsNullOrWhiteSpace(builder)&&builder.Length<=128&&!String.Equals(auditor,builder,StringComparison.OrdinalIgnoreCase),"Distinct bounded reviewer/builder crosslinks required");
      string review=Guard.Absolute(Text(d,"reviewFile")),manifest=Guard.Absolute(Text(d,"manifestFile")),artifact=Path.GetDirectoryName(Path.GetDirectoryName(c.Root));Guard.Require(review.Length<=1024&&manifest.Length<=1024&&Guard.Inside(review,artifact)&&Guard.Inside(manifest,artifact)&&!String.Equals(review,manifest,StringComparison.OrdinalIgnoreCase),"Admission proof files must be distinct inside family");
      return new TrialAdmission(auditor,builder,review,Hash(d,"reviewSha256"),manifest,Hash(d,"manifestSha256"));
    }
    public void VerifyProofFiles(){TrialPinnedBytes.Read(ReviewFile,ReviewSha256,32768);TrialPinnedBytes.Read(ManifestFile,ManifestSha256,262144);}
  }
  public static class TrialReservation {
    public static void Validate(byte[] bytes){var expected=Encoding.UTF8.GetBytes("exclusive-control-reservation\n");Guard.Require(bytes!=null&&bytes.Length==expected.Length,"Exact exclusive reservation length required");for(int i=0;i<expected.Length;i++)Guard.Require(bytes[i]==expected[i],"Exclusive reservation bytes differ");}
    public static void VerifyExisting(string root,bool host){Guard.NoReparseParents(root);int size=Encoding.UTF8.GetByteCount("exclusive-control-reservation\n");foreach(string name in host?new[]{"attempt.marker","host-attempt.marker"}:new[]{"attempt.marker"}){string path=Path.Combine(root,name);Guard.NoReparseParents(path);using(var file=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.Read)){Guard.Require(file.Length==size,"Exclusive reservation length differs");var bytes=new byte[size];int at=0,n;while(at<bytes.Length&&(n=file.Read(bytes,at,bytes.Length-at))>0)at+=n;Guard.Require(at==bytes.Length,"Reservation truncated");Validate(bytes);}}}
  }
}
