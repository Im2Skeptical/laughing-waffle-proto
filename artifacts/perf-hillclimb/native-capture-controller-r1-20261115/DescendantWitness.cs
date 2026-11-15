using System;
using System.IO;
using System.Text;
using System.Globalization;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
using NativeCapturePrototype;
using NativeCaptureRepair;

namespace NativeCaptureController {
  internal sealed class DescendantWitness : IDisposable {
    readonly FrozenControl control;readonly OwnedTarget root;readonly RepairedJob job;
    internal OwnedResource Handle;internal bool Verified;internal UInt32 Pid;internal UInt64 Created;
    internal DescendantWitness(FrozenControl c,OwnedTarget target,RepairedJob ownedJob) { control=c;root=target;job=ownedJob; }
    static Dictionary<string,object> Read(string file) {
      var info=new FileInfo(file);Guard.Require(info.Length<=8192,"Target witness exceeded cap");
      var parser=new JavaScriptSerializer { MaxJsonLength=8192,RecursionLimit=8 };
      return parser.Deserialize<Dictionary<string,object>>(File.ReadAllText(file,Encoding.UTF8));
    }
    internal bool Required { get { return control.Mode=="descendant"||control.Mode=="timeout"||control.Mode=="observer-failure"; } }
    internal void Poll() {
      if(!Required||Verified)return;
      string registration=Path.Combine(control.Root,"descendant-registration.json"),identity=Path.Combine(control.Root,"descendant-identity.json");
      if(!File.Exists(registration)||!File.Exists(identity))return;
      Dictionary<string,object> r,i;try { r=Read(registration);i=Read(identity); }catch(ArgumentException) { return; }
      UInt32 parent=Convert.ToUInt32(r["parentPid"],CultureInfo.InvariantCulture),child=Convert.ToUInt32(r["childPid"],CultureInfo.InvariantCulture);
      Guard.Require(parent==root.Pid&&child>0&&child!=root.Pid&&Convert.ToUInt32(i["pid"],CultureInfo.InvariantCulture)==child,"Descendant identity mismatch");
      Guard.Require(i["debuggerPresent"] is bool&&!(bool)i["debuggerPresent"],"Descendant must not be debugged");
      UInt64 expected=UInt64.Parse((string)r["createdFileTimeUtc"],CultureInfo.InvariantCulture);
      Guard.Require(expected==UInt64.Parse((string)i["createdFileTimeUtc"],CultureInfo.InvariantCulture),"Descendant witness creation mismatch");
      IntPtr raw=Api.OpenProcess(0x00101000,false,child);int openError=Marshal.GetLastWin32Error();
      if(raw==IntPtr.Zero)throw new InvalidOperationException("Open reported descendant:"+openError);var candidate=new OwnedResource(raw);
      try {
        Guard.Require(job.Contains(candidate),"Reported descendant is outside owned job");
        using(var lease=new HandleLease(candidate)) {
          Guard.Require(Api.GetProcessId(lease.Value)==child,"Actual descendant PID mismatch");
          FileTimePair created,exited,kernel,user;bool timed=Native.GetProcessTimes(lease.Value,out created,out exited,out kernel,out user);int timeError=Marshal.GetLastWin32Error();
          if(!timed)throw new InvalidOperationException("Descendant GetProcessTimes:"+timeError);UInt64 actual=((UInt64)created.high<<32)|created.low;
          Guard.Require(actual==expected,"Actual descendant creation mismatch");
          var image=new StringBuilder(32768);UInt32 size=(UInt32)image.Capacity;bool named=Native.QueryFullProcessImageNameW(lease.Value,0,image,ref size);int imageError=Marshal.GetLastWin32Error();
          if(!named)throw new InvalidOperationException("Descendant image:"+imageError);
          Guard.Require(String.Equals(Policy.CanonicalImage(image.ToString()),Policy.CanonicalImage(control.Executable),StringComparison.OrdinalIgnoreCase),"Descendant binary mismatch");
        }
        Handle=candidate;candidate=null;Pid=child;Created=expected;Verified=true;
        Policy.SaveExclusive(control.Root,"descendant-verified.signal",new byte[]{49},16);
      }finally { if(candidate!=null)candidate.Dispose(); }
    }
    internal bool ExitObserved { get { if(!Required)return true;if(!Verified)return false;using(var lease=new HandleLease(Handle))return Native.WaitForSingleObject(lease.Value,0)==0; } }
    public void Dispose() { if(Handle!=null)Handle.Dispose(); }
    internal bool Closed { get { return Handle==null||Handle.CloseSucceeded==true; } }
  }
}
