using System;
using System.IO;
using System.Text;
using System.Globalization;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;
using System.Threading.Tasks;
using NativeCapturePrototype;
using NativeCaptureRepair;

namespace NativeCaptureController {
  internal sealed class DescendantWitness : IDisposable {
    readonly FrozenControl control;readonly OwnedTarget root;readonly RepairedJob job;
    internal OwnedResource Handle;internal bool Verified;internal UInt32 Pid;internal UInt64 Created;
    internal readonly Dictionary<string,object> Observation=new Dictionary<string,object>();
    Task<Dictionary<string,object>[]> pending;int transientReads;
    internal DescendantWitness(FrozenControl c,OwnedTarget target,RepairedJob ownedJob) { control=c;root=target;job=ownedJob; }
    static Dictionary<string,object> Read(string file) {
      var bytes=new byte[8193];int total=0;
      using(var stream=new FileStream(file,FileMode.Open,FileAccess.Read,FileShare.ReadWrite)) {
        while(total<bytes.Length) { int count=stream.Read(bytes,total,bytes.Length-total);if(count==0)break;total+=count; }
      }
      Guard.Require(total<=8192,"Target witness exceeded cap");
      var parser=new JavaScriptSerializer { MaxJsonLength=8192,RecursionLimit=8 };
      return parser.Deserialize<Dictionary<string,object>>(new UTF8Encoding(false,true).GetString(bytes,0,total));
    }
    internal bool Required { get { return control.Mode=="descendant"||control.Mode=="timeout"||control.Mode=="observer-failure"; } }
    internal void Poll() {
      if(!Required||Verified)return;
      string registration=Path.Combine(control.Root,"descendant-registration.json"),identity=Path.Combine(control.Root,"descendant-identity.json");
      if(!File.Exists(registration)||!File.Exists(identity))return;
      if(pending==null)pending=Task.Factory.StartNew(()=>new[]{Read(registration),Read(identity)});
      if(!pending.IsCompleted)return;
      Dictionary<string,object> r,i;
      try { var data=pending.Result;r=data[0];i=data[1]; }
      catch(AggregateException error) {
        Exception reason=error.InnerException;
        if((reason is IOException||reason is ArgumentException||reason is UnauthorizedAccessException)&&++transientReads<=32) { pending=null;return; }
        throw new InvalidOperationException("Witness read failed after bounded retries",reason);
      }
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
        Observation["pid"]=child;Observation["createdFileTimeHex"]=Policy.Hex(expected);Observation["image"]=Policy.CanonicalImage(control.Executable);
        Observation["jobMember"]=true;Observation["reportedParentPid"]=parent;Observation["debuggerPresent"]=false;
        Observation["registrationSha256"]=Guard.Sha256(registration);Observation["identitySha256"]=Guard.Sha256(identity);Observation["transientReadCount"]=transientReads;
        Policy.SaveExclusive(control.Root,"descendant-verified.signal",new byte[]{49},16);
      }finally { if(candidate!=null)candidate.Dispose(); }
    }
    internal bool ExitObserved {
      get {
        if(!Required)return true;if(!Verified)return false;
        using(var lease=new HandleLease(Handle)) {
          UInt32 wait=Native.WaitForSingleObject(lease.Value,0);Observation["exitWaitResult"]=wait;
          if(wait!=0)return false;UInt32 code;bool read=Api.GetExitCodeProcess(lease.Value,out code);int error=Marshal.GetLastWin32Error();
          Observation["exitCodeRead"]=read;Observation["exitCodeError"]=read?0:error;if(read)Observation["exitCode"]=code;return read;
        }
      }
    }
    internal bool PollingIncomplete { get { return pending!=null&&!pending.IsCompleted; } }
    public void Dispose() { if(Handle!=null)Handle.Dispose(); }
    internal bool Closed { get { return Handle==null||Handle.CloseSucceeded==true; } }
  }
}
