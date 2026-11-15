using System;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;
using NativeCapturePrototype;
using NativeCaptureController;

namespace NativeTrialLifetime {
  public sealed class TrialHostIdentity { public UInt32 Pid,HandleOwnerPid;public string CreatedFileTimeHex,Image,ImageSha256,OwnedHandle; }
  public sealed class TrialLaunchJournal {
    public int Schema;public string SlotId,Mode,ConfigSha256,ExecutableSha256,RootImage,RootCreatedFileTimeHex;
    public long ExecutableBytes;public UInt32 RootPid,PrimaryTid,CreatingThread;
    public bool AssignedBeforeResume,Resumed;public TrialHostIdentity Host;
  }
  public static class TrialProvenance {
    public static void ValidateHost(TrialHostIdentity host,string expectedImage,string expectedHash) {
      Guard.Require(host!=null&&host.Pid>0&&host.HandleOwnerPid>0&&HandleIndependence.ValidHex(host.CreatedFileTimeHex,true)&&HandleIndependence.ValidHex(host.OwnedHandle,true)&&String.Equals(Policy.CanonicalImage(host.Image),Policy.CanonicalImage(expectedImage),StringComparison.OrdinalIgnoreCase)&&host.ImageSha256==expectedHash,"Owned host generation/image/hash/handle context mismatch");
    }
    public static TrialLaunchJournal RootJournal(FrozenTrial c,TrialStartup root,TrialHostIdentity host) {
      Guard.Require(c!=null&&root!=null&&root.Created&&root.IdentityVerified&&root.AssignedBeforeResume&&!root.Resumed&&root.RootPid>0&&root.PrimaryTid>0&&root.CreatingThread>0&&HandleIndependence.ValidHex(root.CreatedFileTimeHex,true)&&String.Equals(Policy.CanonicalImage(root.Image),Policy.CanonicalImage(c.Executable),StringComparison.OrdinalIgnoreCase),"Immutable root journal requires verified suspended assigned root BEFORE resume");
      ValidateHost(host,c.HostExecutable,FindHash(c,c.HostExecutable));
      Guard.Require(host.HandleOwnerPid==host.Pid,"Host journal records HOST-LOCAL self handle, not supervisor handle context");
      return new TrialLaunchJournal { Schema=1,SlotId=c.Id,Mode=c.Mode,ConfigSha256=c.ConfigSha256,ExecutableSha256=c.ExecutableHash,ExecutableBytes=c.ExecutableBytes,RootPid=root.RootPid,PrimaryTid=root.PrimaryTid,CreatingThread=root.CreatingThread,RootImage=root.Image,RootCreatedFileTimeHex=root.CreatedFileTimeHex,AssignedBeforeResume=true,Resumed=false,
        Host=new TrialHostIdentity { Pid=host.Pid,HandleOwnerPid=host.HandleOwnerPid,CreatedFileTimeHex=host.CreatedFileTimeHex,Image=host.Image,ImageSha256=host.ImageSha256,OwnedHandle=host.OwnedHandle } };
    }
    static string FindHash(FrozenTrial c,string file) { foreach(var pin in c.InputPins)if(String.Equals(pin.Path,file,StringComparison.OrdinalIgnoreCase))return pin.Sha256;throw new InvalidOperationException("Required host pin absent"); }
    public static void SaveRootJournal(FrozenTrial c,TrialStartup root,TrialHostIdentity host) {
      // Managed file output only. Actual native root/host identity capture is a
      // separate uninvoked entry/supervisor responsibility before admission.
      var journal=RootJournal(c,root,host);var bytes=new UTF8Encoding(false,true).GetBytes(new JavaScriptSerializer { MaxJsonLength=8192,RecursionLimit=8 }.Serialize(journal));Policy.SaveExclusive(c.Root,"launch.json",bytes,8192);
    }
  }
}
