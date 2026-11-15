using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using NativeCapturePrototype;
using NativeCaptureController;
using NativeCaptureRepair;

namespace NativeTrialLifetime {
  public sealed class TrialImageReceipt {
    public string Handle,Path,Sha256,Error;public UInt32 PathResult;public int PathRawLastError;public bool PathErrorValid,PathAvailable;
    public BoolNativeReceipt Close;
    public bool Closed { get { return Close!=null&&Close.Result&&!Close.ErrorValid&&!Close.Error.HasValue; } }
  }
  public sealed class TrialDebugWait {
    public int RequestedMs;public BoolNativeReceipt Call;public byte[] Bytes;
    public bool TimedPoll { get { return Call!=null&&!Call.Result&&Call.ErrorValid&&Call.Error==121&&Bytes==null; } }
    public bool Event { get { return Call!=null&&Call.Result&&!Call.ErrorValid&&!Call.Error.HasValue&&Bytes!=null&&Bytes.Length==Abi.DebugEventBytes; } }
  }
  public interface ITrialEventCalls {
    void RequireCreatingThread();
    UInt64[] RootLiveOwned();
    void BindRootCreate(Dictionary<string,object> record);
    void ConfirmRootExit();
    TrialImageReceipt ReadAndCloseImage(UInt64 handle);
    StartupPhaseReceipt ProbeStartup(string root,UInt32 pid,bool created,bool module,bool first);
    BoolNativeReceipt Continue(UInt32 pid,UInt32 tid,UInt32 disposition);
    TrialDebugWait Wait(int milliseconds);
  }
  public sealed class TrialThreadState { public UInt64 Handle;public bool Primary,Exited; }
  public sealed class TrialProcessPhase {
    public bool Created,Exited,LoaderHandled;public int Exceptions;public UInt64 LoaderBase,RemoteLoader;
    public readonly Dictionary<UInt32,TrialThreadState> Threads=new Dictionary<UInt32,TrialThreadState>();
  }
  // Connected raw-byte dispatcher. Real and pure fake event sources use this class.
  // Trial controller/cleanup and evidence oracle remain separate, mandatory work.
  public sealed class TrialTreeEvents {
    readonly ITrialProcessCalls processCalls;readonly ITrialEventCalls calls;readonly UInt32 rootPid;
    readonly string root,image,sha,ntdll,ntdllSha;readonly UInt64 trapRva;
    readonly Dictionary<UInt32,TrialProcessBinding> bindings=new Dictionary<UInt32,TrialProcessBinding>();
    readonly Dictionary<UInt32,TrialProcessPhase> phases=new Dictionary<UInt32,TrialProcessPhase>();
    readonly List<UInt32> processOrder=new List<UInt32>();
    int exceptions,createdThreads;long ledgerBytes;bool inCall;Dictionary<string,object> pending;
    public const int EventLimit=4096,ProcessLimit=16,ThreadLimit=256,TotalExceptionLimit=256,PerProcessExceptionLimit=128,WaitLimit=8192,LedgerByteLimit=8388608;
    public readonly TrialBook Book;
    public readonly List<Dictionary<string,object>> Ledger=new List<Dictionary<string,object>>();
    public readonly List<TrialDebugWait> Waits=new List<TrialDebugWait>();
    public bool UnsafePending { get;private set; }
    public Dictionary<string,object> PendingRecord { get { return pending; } }
    public TrialTreeEvents(UInt32 rootProcess,string ownedRoot,string allowedImage,string allowedSha,string loaderImage,string loaderSha,UInt64 derivedTrapRva,ITrialProcessCalls processAdapter,ITrialEventCalls eventAdapter) {
      Guard.Require(rootProcess>0&&processAdapter!=null&&eventAdapter!=null&&allowedSha!=null&&allowedSha.Length==64&&loaderSha!=null&&loaderSha.Length==64&&derivedTrapRva>0,"Frozen trial/tree identity required");
      rootPid=rootProcess;root=Guard.Absolute(ownedRoot);image=Policy.CanonicalImage(allowedImage);sha=allowedSha;ntdll=Policy.CanonicalImage(loaderImage);ntdllSha=loaderSha;trapRva=derivedTrapRva;processCalls=processAdapter;calls=eventAdapter;
      Book=new TrialBook(rootPid,image,sha,ProcessLimit,EventLimit);
    }
    public UInt32[] ProcessOrder { get { return processOrder.ToArray(); } }
    public TrialProcessBinding Binding(UInt32 pid) { Guard.Require(bindings.ContainsKey(pid),"Unknown process binding");return bindings[pid]; }
    public TrialProcessPhase Phase(UInt32 pid) { Guard.Require(phases.ContainsKey(pid),"Unknown process phase");return phases[pid]; }
    void Failure(string detail,bool unsafePending) { UnsafePending|=unsafePending;Book.Error(detail.Substring(0,Math.Min(4096,detail.Length))); }
    UInt64[] LiveRaw() {
      var live=new List<UInt64>(calls.RootLiveOwned());
      foreach(UInt32 pid in processOrder) {
        var b=bindings[pid];if(b.LiveOwned!=0)live.Add(b.LiveOwned);
        var p=phases[pid];if(p.Exited)continue;
        if(RawValid(b.SystemProcess))live.Add(b.SystemProcess);foreach(var t in p.Threads.Values)if(t.Primary||!t.Exited)live.Add(t.Handle);
      }
      Guard.Require(live.Count<=512,"Live handle inventory cap");return live.ToArray();
    }
    static bool RawValid(UInt64 raw) { return raw!=0&&raw!=UInt64.MaxValue; }
    void Image(Dictionary<string,object> record,TrialProcessPhase phase) {
      if(!record.ContainsKey("fileHandle"))return;UInt64 raw=(UInt64)record["fileHandle"];
      if(!RawValid(raw)) { record["imageHandleUnavailable"]=true;return; }
      foreach(UInt64 live in LiveRaw())Guard.Require(live!=raw,"Image hFile aliases live process/thread ownership; no CloseHandle");
      if(record.ContainsKey("processHandle"))Guard.Require((UInt64)record["processHandle"]!=raw&&(UInt64)record["threadHandle"]!=raw,"CREATE image hFile aliases current system handles; no CloseHandle");
      var result=calls.ReadAndCloseImage(raw);record["image"]=result;
      Guard.Require(result!=null&&result.Handle==Policy.Hex(raw)&&result.Closed&&result.Error==null,"Debug image operation/close unconfirmed");
      if(result.PathAvailable&&result.Path!=null&&String.Equals(Policy.CanonicalImage(result.Path),ntdll,StringComparison.OrdinalIgnoreCase)) {
        Guard.Require(result.Sha256==ntdllSha&&record.ContainsKey("imageBase")&&(UInt64)record["imageBase"]>0,"Loader module identity differs");
        phase.LoaderBase=(UInt64)record["imageBase"];phase.RemoteLoader=checked(phase.LoaderBase+trapRva);record["loaderAddress"]=Policy.Hex(phase.RemoteLoader);
      }
    }
    void SaveRecord(Dictionary<string,object> record) {
      var json=new JavaScriptSerializer { MaxJsonLength=LedgerByteLimit,RecursionLimit=24 }.Serialize(Wire.Lossless(record));
      ledgerBytes=checked(ledgerBytes+Encoding.UTF8.GetByteCount(json));Ledger.Add(record);
      if(ledgerBytes>LedgerByteLimit)Failure("Event ledger byte cap exceeded",pending!=null);
    }
    public bool Pump(int waitMs) {
      calls.RequireCreatingThread();Guard.Require(waitMs>0&&waitMs<=25&&!inCall,"Bounded same-thread tree poll required");
      if(pending!=null||UnsafePending)return false;
      if(Waits.Count>=WaitLimit||Ledger.Count>=EventLimit||ledgerBytes>=LedgerByteLimit) { Failure("Tree wait/event/byte cap before poll",false);return false; }
      var r=calls.Wait(waitMs);Waits.Add(r);
      if(r==null||r.RequestedMs!=waitMs) { Failure("Typed debug wait unavailable/mismatched",true);return false; }
      if(r.TimedPoll)return true;
      if(!r.Event) { Failure("Debug wait failed or returned invalid native bytes",true);return false; }
      return Accept(r.Bytes);
    }
    public bool Accept(byte[] raw) {
      calls.RequireCreatingThread();Guard.Require(!inCall&&pending==null&&!UnsafePending,"Pending/reentrant tree event cannot be replaced");inCall=true;
      Dictionary<string,object> record=new Dictionary<string,object>();bool saved=false;
      try {
        Guard.Require(raw!=null&&raw.Length==Abi.DebugEventBytes,"Exact raw event bytes required");
        record["rawHex"]=BitConverter.ToString(raw).Replace("-","").ToLowerInvariant();
        UInt32 tag=BitConverter.ToUInt32(raw,0),pid=BitConverter.ToUInt32(raw,4),tid=BitConverter.ToUInt32(raw,8);
        record["eventCode"]=tag;record["pid"]=pid;record["tid"]=tid;record["index"]=Ledger.Count;record["continued"]=false;pending=record;
        Guard.Require(Ledger.Count<EventLimit&&ledgerBytes<LedgerByteLimit&&tag>=1&&tag<=9&&pid>0&&tid>0,"Unknown/capped raw header");
        if(tag==3)Guard.Require(!bindings.ContainsKey(pid)&&bindings.Count<ProcessLimit&&createdThreads<ThreadLimit&&(bindings.Count>0||pid==rootPid),"Duplicate/capped/non-root first CREATE");
        else Guard.Require(bindings.ContainsKey(pid)&&phases[pid].Created&&!phases[pid].Exited,"Unknown PID/event outside live CREATE/EXIT");
        foreach(var field in Abi.Decode(raw,pid))record[field.Key]=field.Value;
        TrialProcessPhase phase;
        if(tag==3) {
          phase=new TrialProcessPhase();Image(record,phase);
          if(pid==rootPid)calls.BindRootCreate(record);
          var binding=new TrialProcessBinding(processCalls,pid,tid,image,sha);
          bindings.Add(pid,binding);phases.Add(pid,phase);processOrder.Add(pid);
          binding.Bind((UInt64)record["processHandle"],(UInt64)record["threadHandle"],LiveRaw());
          Book.Register(binding.Identity);phase.Threads.Add(tid,new TrialThreadState { Handle=(UInt64)record["threadHandle"],Primary=true });createdThreads++;
        }else phase=phases[pid];
        Book.Header(tag,pid,tid);
        if(tag==2) {
          Guard.Require(createdThreads<ThreadLimit&&!phase.Threads.ContainsKey(tid),"Thread generation/count cap");
          UInt64 handle=(UInt64)record["threadHandle"];Guard.Require(RawValid(handle),"New system thread handle absent");foreach(UInt64 live in LiveRaw())Guard.Require(live!=handle,"New system thread handle aliases live ownership");
          var identity=processCalls.Probe(bindings[pid].SystemProcess,handle);record["threadIdentity"]=identity;
          Guard.Require(identity!=null&&identity.Matches(pid,tid,image,sha)&&identity.CreatedFileTime==bindings[pid].Identity.CreatedFileTime,"Created thread PID/image/generation/job differs");
          phase.Threads.Add(tid,new TrialThreadState { Handle=handle });createdThreads++;
        }
        if(tag==4)Guard.Require(phase.Threads.ContainsKey(tid)&&!phase.Threads[tid].Exited,"Unknown/already exited thread");
        if(tag!=3)Image(record,phase);
        if(tag==7&&(UInt64)record["imageBase"]==phase.LoaderBase) { phase.LoaderBase=0;phase.RemoteLoader=0;record["loaderUnloaded"]=true; }
        UInt32 disposition=Native.Continue;
        if(tag==1) {
          bool first=phase.Exceptions==0;phase.Exceptions++;exceptions++;
          Guard.Require(phase.Exceptions<=PerProcessExceptionLimit&&exceptions<=TotalExceptionLimit,"Exception cap");
          var startup=calls.ProbeStartup(root,pid,phase.Created,phase.RemoteLoader!=0,first);record["startupPhase"]=startup;
          bool bound=startup!=null&&startup.Pid==pid&&String.Equals(startup.Path,Path.Combine(root,"identity-"+pid.ToString(System.Globalization.CultureInfo.InvariantCulture)+".json"),StringComparison.OrdinalIgnoreCase);
          disposition=Policy.Continuation(tag,(UInt32)record["exceptionCode"],(UInt32)record["firstChance"],(UInt64)record["exceptionAddress"],phase.RemoteLoader,phase.Created,phase.LoaderHandled,tid,bindings[pid].Identity.PrimaryTid,bound?startup:null);
        }
        record["continuation"]=disposition;
        var continuation=calls.Continue(pid,tid,disposition);record["continueCall"]=continuation;
        bool ok=continuation!=null&&continuation.Result&&!continuation.ErrorValid&&!continuation.Error.HasValue;record["continued"]=ok;
        Book.Continued(tag,pid,tid,ok,tag==5?(UInt32)record["exitCode"]:0);
        if(!ok) { Failure("Native continuation unconfirmed; exact pending retained",true);return false; }
        pending=null;
        if(tag==9)Failure("RIP debugger error event retained",false);
        if(tag==3)phase.Created=true;
        if(tag==1&&disposition==Native.Continue)phase.LoaderHandled=true;
        if(tag==4) { var t=phase.Threads[tid];t.Exited=true;if(!t.Primary)phase.Threads.Remove(tid); }
        if(tag==5) { phase.Exited=true;bindings[pid].ConfirmContinuedExit(pid);if(pid==rootPid)calls.ConfirmRootExit(); }
        SaveRecord(record);saved=true;return !UnsafePending&&Book.Errors.Count==0;
      }catch(Exception error) {
        record["dispatchError"]=error.GetType().Name+":"+error.Message;Failure("Tree event dispatch:"+error.Message,pending!=null);return false;
      }finally {
        try { if(!saved)SaveRecord(record); }finally { inCall=false; }
      }
    }
  }
}
