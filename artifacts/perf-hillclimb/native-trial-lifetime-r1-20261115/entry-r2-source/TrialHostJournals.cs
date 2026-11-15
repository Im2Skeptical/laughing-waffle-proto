using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using NativeCapturePrototype;
using NativeCaptureController;

namespace NativeTrialLifetime {
  public static class TrialHostJournals {
    public const int JournalLimit=65536;
    static object Value(Dictionary<string,object> d,string key){object v;Guard.Require(d.TryGetValue(key,out v),"Host launch key absent:"+key);return v;}
    public static Dictionary<string,object> Launch(TrialHostLaunch launch,TrialHostIdentity host){
      Guard.Require(launch!=null,"Frozen launch absent");string hash=null;foreach(var p in launch.Config.InputPins)if(String.Equals(p.Path,launch.Config.HostExecutable,StringComparison.OrdinalIgnoreCase))hash=p.Sha256;
      TrialProvenance.ValidateHost(host,launch.Config.HostExecutable,hash);Guard.Require(host.HandleOwnerPid!=host.Pid,"Supervisor launch must record SUPERVISOR-local handle context");
      return new Dictionary<string,object>{{"schema",1},{"slotId",launch.Config.Id},{"mode",launch.Config.Mode},{"configSha256",launch.Config.ConfigSha256},{"hostPid",host.Pid},{"hostCreatedFileTimeHex",host.CreatedFileTimeHex},{"hostImage",host.Image},{"hostImageSha256",host.ImageSha256},{"hostHandleOwnerPid",host.HandleOwnerPid},{"hostOwnedHandle",host.OwnedHandle},{"commandLine",launch.CommandLine},{"cwd",launch.Config.Root},{"configFileSha256",launch.ConfigFileSha256},{"admissionSha256",launch.AdmissionSha256},{"resumed",false}};
    }
    public static Dictionary<string,object> VerifyLaunch(byte[] bytes,TrialHostLaunch launch,TrialHostIdentity self){
      var d=TrialFlatJson.Parse(bytes);Guard.Require(d.Count==15&&Value(d,"schema") is UInt32&&(UInt32)d["schema"]==1,"Host launch exact schema differs");
      Guard.Require(self!=null&&self.Pid>0&&self.HandleOwnerPid==self.Pid,"Host-local verified self context required");var expected=Launch(launch,new TrialHostIdentity {Pid=self.Pid,HandleOwnerPid=(UInt32)Value(d,"hostHandleOwnerPid"),CreatedFileTimeHex=self.CreatedFileTimeHex,Image=self.Image,ImageSha256=self.ImageSha256,OwnedHandle=(string)Value(d,"hostOwnedHandle")});
      foreach(var p in expected){object actual=Value(d,p.Key);if(p.Value is int)Guard.Require(actual is UInt32&&(UInt32)actual==(UInt32)(int)p.Value,"Host launch integer differs");else Guard.Require(Object.Equals(actual,p.Value),"Host launch crosslink differs:"+p.Key);}
      // Numeric handles may coincidentally be equal across these DIFFERENT
      // processes. Link PID/FILETIME/image, never require pointer equality.
      return d;
    }
    public static byte[] Json(object value,int maximum){var projected=TrialProjection.Lossless(value);byte[] bytes=new UTF8Encoding(false,true).GetBytes(new JavaScriptSerializer {MaxJsonLength=maximum,RecursionLimit=48}.Serialize(projected));Guard.Require(bytes.Length<=maximum,"Host journal byte cap");return bytes;}
    public static string Hash(byte[] bytes){using(var sha=System.Security.Cryptography.SHA256.Create())return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();}
    public static void Save(string root,string name,object value){Policy.SaveExclusive(root,name,Json(value,JournalLimit),JournalLimit);}
    public static void SaveLaunch(TrialHostLaunch launch,TrialHostIdentity host){Policy.SaveExclusive(launch.Config.Root,"host-launch.json",Json(Launch(launch,host),8192),8192);}
    public static byte[] ReadLaunch(string root){string path=Path.Combine(root,"host-launch.json");Guard.NoReparseParents(path);using(var file=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.Read)){Guard.Require(file.Length>0&&file.Length<=8192,"Host launch byte cap");var bytes=new byte[(int)file.Length];int at=0,n;while(at<bytes.Length&&(n=file.Read(bytes,at,bytes.Length-at))>0)at+=n;Guard.Require(at==bytes.Length,"Host launch truncated");return bytes;}}
  }
}
