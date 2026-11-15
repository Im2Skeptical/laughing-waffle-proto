using System;
using System.Text;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using NativeCapturePrototype;
using NativeCaptureController;
using NativeCaptureRepair;

namespace NativeTrialLifetime {
  internal sealed class TrialHostSelf {
    readonly OwnedResource handle=new OwnedResource(IntPtr.Zero,"host.self.GetCurrentProcess.independent-duplicate");
    readonly List<Dictionary<string,object>> calls=new List<Dictionary<string,object>>();UInt64 raw;TrialHostIdentity identity;bool attempted,closed;
    static UInt64 Raw(IntPtr p){return unchecked((UInt64)p.ToInt64());}
    internal TrialHostIdentity Identity {get{Guard.Require(identity!=null,"Host self identity absent");return new TrialHostIdentity {Pid=identity.Pid,HandleOwnerPid=identity.HandleOwnerPid,CreatedFileTimeHex=identity.CreatedFileTimeHex,Image=identity.Image,ImageSha256=identity.ImageSha256,OwnedHandle=identity.OwnedHandle};}}
    internal void Capture(FrozenTrial config){
      Guard.Require(!attempted&&!closed&&config!=null&&IntPtr.Size==8,"One admitted x64 host self capture required");attempted=true;
      IntPtr duplicate;bool copied=ExtraNative.DuplicateHandle(ExtraNative.GetCurrentProcess(),ExtraNative.GetCurrentProcess(),ExtraNative.GetCurrentProcess(),out duplicate,0,false,2);int duplicateError=Marshal.GetLastWin32Error();
      if(copied){handle.Adopt(duplicate);raw=Raw(duplicate);}calls.Add(new Dictionary<string,object>{{"phase","host.self.DuplicateHandle"},{"sourcePseudoHandle",Policy.Hex(UInt64.MaxValue)},{"produced",Policy.Hex(Raw(duplicate))},{"call",BoolNativeReceipt.From("DuplicateHandle",copied,duplicateError)},{"inherit",false},{"sameAccess",true}});Guard.Require(copied&&HandleIndependence.ValidHex(Policy.Hex(raw),true),"Host self duplicate unavailable");
      using(var h=new HandleLease(handle)){
        UInt32 self=TrialHostApi.GetCurrentProcessId(),pid=Api.GetProcessId(h.Value);int pidError=Marshal.GetLastWin32Error();calls.Add(new Dictionary<string,object>{{"phase","host.self.GetProcessId"},{"pid",pid},{"currentPid",self},{"rawLastError",pidError},{"errorValid",pid==0}});Guard.Require(pid>0&&pid==self,"Host self PID differs");
        FileTimePair made,exited,kernel,user;bool timed=Native.GetProcessTimes(h.Value,out made,out exited,out kernel,out user);int timeError=Marshal.GetLastWin32Error();string time=Policy.Hex(((UInt64)made.high<<32)|made.low);calls.Add(new Dictionary<string,object>{{"phase","host.self.GetProcessTimes"},{"createdFileTimeHex",time},{"call",BoolNativeReceipt.From("GetProcessTimes",timed,timeError)}});Guard.Require(timed&&HandleIndependence.ValidHex(time,true),"Host self FILETIME absent");
        var image=new StringBuilder(32768);UInt32 size=(UInt32)image.Capacity;bool named=Native.QueryFullProcessImageNameW(h.Value,0,image,ref size);int imageError=Marshal.GetLastWin32Error();calls.Add(new Dictionary<string,object>{{"phase","host.self.QueryFullProcessImageNameW"},{"image",image.ToString()},{"returnedChars",size},{"call",BoolNativeReceipt.From("QueryFullProcessImageNameW",named,imageError)}});Guard.Require(named&&String.Equals(Policy.CanonicalImage(image.ToString()),Policy.CanonicalImage(config.HostExecutable),StringComparison.OrdinalIgnoreCase),"Host self image differs");
        string sha=null;foreach(var pin in config.InputPins)if(String.Equals(pin.Path,config.HostExecutable,StringComparison.OrdinalIgnoreCase)){new TrialDiskPins().Verify(pin);sha=pin.Sha256;calls.Add(new Dictionary<string,object>{{"phase","host.self.image-file-pin"},{"path",pin.Path},{"sha256",pin.Sha256},{"bytes",pin.Bytes.ToString(System.Globalization.CultureInfo.InvariantCulture)}});}Guard.Require(sha!=null,"Host self image pin absent");
        identity=new TrialHostIdentity {Pid=pid,HandleOwnerPid=pid,CreatedFileTimeHex=time,Image=Policy.CanonicalImage(image.ToString()),ImageSha256=sha,OwnedHandle=Policy.Hex(raw)};
      }
    }
    internal TrialRelease Close(){Guard.Require(!closed,"Host self close repeated");closed=true;handle.Dispose();return new TrialRelease {Origin=handle.ResourceLabel,Handle=Policy.Hex(raw),State=handle.CloseState,NativeCalled=handle.CloseSucceeded.HasValue,Confirmed=raw==0||handle.CloseSucceeded==true,RawLastError=handle.CloseRawLastError,ErrorValid=handle.CloseSucceeded==false,Error=handle.CloseSucceeded==false?handle.CloseRawLastError:null,Detail=handle.CloseDetail};}
    internal Dictionary<string,object> Evidence {get{return new Dictionary<string,object>{{"identity",identity},{"calls",calls},{"close",handle.Evidence()},{"raw",Policy.Hex(raw)}};}}
  }
}
