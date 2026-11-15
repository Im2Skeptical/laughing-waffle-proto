using System;
using System.IO;
using System.Collections.Generic;
using NativeCapturePrototype;
using NativeCaptureController;
using NativeCaptureRepair;

namespace NativeTrialLifetime {
  public static class PureTreeChecks {
    static readonly List<string> checks=new List<string>();static string image,root,ntdll;static readonly string sha=new string('a',64),loaderSha=new string('b',64);
    static void Yes(string name,bool value) { if(!value)throw new Exception("FAIL:"+name);checks.Add(name); }
    static void Reject(string name,Action action) { bool rejected=false;try { action(); }catch { rejected=true; }Yes(name,rejected); }
    internal sealed class Fake : ITrialEventCalls,ITrialProcessCalls {
      public bool ThreadOk=true,RootBound,RootExited,ContinueOk=true,ImageCloseOk=true,MarkerAbsent=true,WrongMarkerPid,WrongModuleHash,WrongModulePath,WrongProbeJob,ImageError,WrongThreadPid;
      public string WaitFault;public readonly Dictionary<UInt64,UInt32> ExtraThreadTids=new Dictionary<UInt64,UInt32>();
      public readonly List<string> Log=new List<string>();public readonly Queue<byte[]> Input=new Queue<byte[]>();public int ContinueCalls,ImageCalls;public UInt32 LastDisposition;
      public void RequireCreatingThread() { Guard.Require(ThreadOk,"Wrong creating thread"); }
      public UInt64[] RootLiveOwned() { return RootBound?new UInt64[]{1000000,1000004,1000008}:new UInt64[]{1000000,1000004}; }
      public void BindRootCreate(Dictionary<string,object> record) { Log.Add("root-bind");RootBound=true; }
      public void ConfirmRootExit() { Log.Add("root-exit");RootExited=true; }
      public TrialImageReceipt ReadAndCloseImage(UInt64 handle) { ImageCalls++;Log.Add("image:"+handle);bool main=handle%1024==96;return new TrialImageReceipt { Handle=Policy.Hex(handle),Path=main?image:(WrongModulePath?image:ntdll),PathAvailable=true,PathResult=64,PathRawLastError=121,Sha256=WrongModuleHash?sha:loaderSha,Error=ImageError?"IOException:fixture":null,Close=BoolNativeReceipt.From("close",ImageCloseOk,ImageCloseOk?121:6) }; }
      public StartupPhaseReceipt ProbeStartup(string owned,UInt32 pid,bool created,bool module,bool first) { return new StartupPhaseReceipt { Pid=WrongMarkerPid?pid+1:pid,Path=Path.Combine(owned,"identity-"+pid+".json"),CreateSeen=created,ModuleSeen=module,FirstException=first,MarkerProbed=true,EntryMarkerAbsent=MarkerAbsent,ProbeCertain=true,ProbeException=MarkerAbsent?"FileNotFoundException":null,ProbeError=MarkerAbsent?(int?)2:null,ProbeHResult=MarkerAbsent?(int?)unchecked((int)0x80070002):null }; }
      public BoolNativeReceipt Continue(UInt32 pid,UInt32 tid,UInt32 disposition) { Log.Add("continue:"+pid+":"+disposition);ContinueCalls++;LastDisposition=disposition;return BoolNativeReceipt.From("continue",ContinueOk,ContinueOk?121:6); }
      public TrialDebugWait Wait(int ms) {
        var r=Input.Count==0?new TrialDebugWait { RequestedMs=ms,Call=BoolNativeReceipt.From("wait",false,121) }:new TrialDebugWait { RequestedMs=ms,Call=BoolNativeReceipt.From("wait",true,121),Bytes=Input.Dequeue() };
        if(WaitFault=="failure")r.Call=BoolNativeReceipt.From("wait",false,6);if(WaitFault=="no-bytes"){r.Call=BoolNativeReceipt.From("wait",true,121);r.Bytes=null;}if(WaitFault=="short-bytes"){r.Call=BoolNativeReceipt.From("wait",true,121);r.Bytes=new byte[175];}if(WaitFault=="wrong-request")r.RequestedMs=ms+1;if(WaitFault=="contradiction"){r.Call=BoolNativeReceipt.From("wait",true,121);r.Call.ErrorValid=true;r.Call.Error=6;}return r;
      }
      public TrialProcessProbe Probe(UInt64 process,UInt64 thread) {
        UInt32 pid=(UInt32)(process/1024),threadPid=(UInt32)(thread/1024),tid=thread%1024==36?threadPid+200:threadPid+100;Log.Add("probe:"+pid);
        if(ExtraThreadTids.ContainsKey(thread)){threadPid=pid;tid=ExtraThreadTids[thread];}if(WrongThreadPid)threadPid++;
        return new TrialProcessProbe { Pid=pid,Tid=tid,ThreadPid=threadPid,CreatedFileTime=pid+1000,Image=image,ImageSha256=sha,ImageBytes=4096,ProcessMachine=0,NativeMachine=0x8664,Times=BoolNativeReceipt.From("times",true,121),ImageQuery=BoolNativeReceipt.From("image",true,2),Architecture=BoolNativeReceipt.From("arch",true,6),Membership=new TrialMembership { OwnerHeld=true,OwnerHandle=Policy.Hex(500000),Member=!WrongProbeJob,Call=BoolNativeReceipt.From("member",true,121) } };
      }
      public TrialDuplicate Duplicate(UInt64 source,UInt64[] live) { Log.Add("duplicate:"+source);return new TrialDuplicate { Source=source,Produced=source+48,SameAccess=true,Call=BoolNativeReceipt.From("dup",true,121) }; }
      public ProcessWaitReceipt Wait(UInt64 owned,WaitSource source,CleanupBudget budget,int max) { Log.Add("owned-wait:"+source.Pid);return ProcessWaitLogic.Observe(budget,max,"post-continued-EXIT",source,ms=>new NativeWaitOutcome { Status=0,RawLastError=121 }); }
      public TrialRelease Release(UInt64 owned) { return new TrialRelease { Handle=Policy.Hex(owned),Origin="CREATE_EVENT.wait-duplicate",State="NATIVE_CLOSE_SUCCEEDED",Confirmed=true,NativeCalled=true,RawLastError=121 }; }
    }
    static void U32(byte[] b,int at,UInt32 value) { Buffer.BlockCopy(BitConverter.GetBytes(value),0,b,at,4); }
    static void U64(byte[] b,int at,UInt64 value) { Buffer.BlockCopy(BitConverter.GetBytes(value),0,b,at,8); }
    static UInt64 Base(UInt32 pid) { return (UInt64)pid*1048576; }
    internal static byte[] Event(UInt32 tag,UInt32 pid,UInt32 tid=0,UInt32 value=0) {
      var b=new byte[176];U32(b,0,tag);U32(b,4,pid);U32(b,8,tid==0?pid+100:tid);
      if(tag==3) { U64(b,16,(UInt64)pid*1024+96);U64(b,24,(UInt64)pid*1024+16);U64(b,32,(UInt64)pid*1024+32);U64(b,40,Base(pid)+65536); }
      if(tag==6) { U64(b,16,(UInt64)pid*1024+100);U64(b,24,Base(pid)); }
      if(tag==7)U64(b,16,Base(pid));
      if(tag==2)U64(b,16,(UInt64)pid*1024+36);
      if(tag==1) { U32(b,16,value==0?0x80000003:value);U64(b,32,Base(pid)+53);U32(b,168,1); }
      if(tag==5)U32(b,16,value);return b;
    }
    internal static Fake NewFake(string existingImage) { image=Guard.Absolute(existingImage);root=Path.Combine(Path.GetDirectoryName(image),"pure-owned-trial");ntdll=Path.Combine(Path.GetDirectoryName(image),"pure-ntdll.dll");return new Fake(); }
    internal static TrialTreeEvents Tree(Fake f) { return new TrialTreeEvents(1,root,image,sha,ntdll,loaderSha,53,f,f); }
    static void Start(TrialTreeEvents t,UInt32 pid) { Guard.Require(t.Accept(Event(3,pid))&&t.Accept(Event(6,pid))&&t.Accept(Event(1,pid)),"Positive startup fixture failed"); }
    public static string[] Run(string existingImage) {
      checks.Clear();image=Guard.Absolute(existingImage);root=Path.Combine(Path.GetDirectoryName(image),"pure-owned-trial");ntdll=Path.Combine(Path.GetDirectoryName(image),"pure-ntdll.dll");
      var f=new Fake();var t=Tree(f);Start(t,1);Yes("tree-root-CREATE-bind-before-process-probes",f.Log.IndexOf("root-bind")<f.Log.IndexOf("probe:1")&&t.Phase(1).LoaderHandled);
      Start(t,2);Start(t,3);Yes("tree-child-startup-independently-handled",t.Phase(2).LoaderHandled&&t.Phase(3).LoaderHandled&&t.Book.ProcessCount==3);
      Yes("tree-helper-first-EXIT-continued",t.Accept(Event(5,2)));Yes("tree-helper-EXIT-preserves-same-daemon-job-lifetime",!t.Book.CleanupRequested&&!t.Phase(3).Exited&&t.Binding(3).Identity.CreatedFileTime==1003);
      Start(t,4);Yes("tree-second-helper-CREATE-after-first-return-with-same-daemon",t.Book.ProcessCount==4&&!t.Phase(3).Exited);Yes("tree-second-helper-EXIT-preserves-daemon",t.Accept(Event(5,4))&&!t.Book.CleanupRequested&&!t.Phase(3).Exited);
      Yes("tree-root-EXIT-starts-cleanup-not-all-exits",t.Accept(Event(5,1))&&t.Book.CleanupRequested&&!t.Book.AllExitsContinued&&f.RootExited);Yes("tree-owned-daemon-controlled-EXIT-drained",t.Accept(Event(5,3,0,0xe0000001))&&t.Book.AllExitsContinued);
      var budget=CleanupBudget.PureFixture(0,10000,1000);foreach(UInt32 pid in t.ProcessOrder) { var b=t.Binding(pid);var w=b.ObserveExit(budget,50);t.Book.RecordWait(pid,w);t.Book.RecordRelease(pid,b.Release().Confirmed);Yes("tree-retained-independent-wait-after-helper-return-"+pid,b.Closed); }
      Yes("tree-not-complete-without-controller-extra-root-wait-job-EOF",!t.Book.Complete);
      f=new Fake();t=Tree(f);Start(t,1);Start(t,2);Start(t,3);t.Accept(Event(5,2));t.Accept(Event(5,1,0,23));Yes("tree-failure-after-first-return-keeps-root23-no-second",t.Book.CleanupRequested&&t.Book.ProcessCount==3&&t.Book.Life(1).ExitCode==23&&!t.Phase(3).Exited);
      f=new Fake();t=Tree(f);Start(t,1);int previous=f.ContinueCalls;Yes("tree-unknown-PID-header-fails-closed",!t.Accept(Event(8,99))&&t.UnsafePending&&t.PendingRecord!=null&&f.ContinueCalls==previous);Reject("tree-pending-cannot-be-replaced",()=>t.Accept(Event(8,1)));
      f=new Fake();t=Tree(f);Yes("tree-non-root-first-CREATE-rejected-no-control",!t.Accept(Event(3,2))&&f.ContinueCalls==0&&!f.RootBound);
      f=new Fake();t=Tree(f);Start(t,1);previous=f.ContinueCalls;Yes("tree-duplicate-PID-CREATE-rejected",!t.Accept(Event(3,1))&&f.ContinueCalls==previous);
      f=new Fake();t=Tree(f);var wrong=Event(3,1);U64(wrong,16,1040);Yes("tree-image-hFile-system-process-alias-not-closed",!t.Accept(wrong)&&f.ImageCalls==0&&f.ContinueCalls==0);
      f=new Fake { ImageCloseOk=false };t=Tree(f);Yes("tree-failed-image-close-blocks-CREATE-continue",!t.Accept(Event(3,1))&&f.ContinueCalls==0&&t.PendingRecord!=null);
      f=new Fake { WrongProbeJob=true };t=Tree(f);Yes("tree-wrong-membership-rejected-after-owned-image-close",!t.Accept(Event(3,1))&&f.ImageCalls==1&&f.ContinueCalls==0);
      f=new Fake { ImageError=true };t=Tree(f);Yes("tree-image-IO-error-not-hidden-by-successful-close",!t.Accept(Event(3,1))&&f.ImageCalls==1&&f.ContinueCalls==0);
      f=new Fake();t=Tree(f);t.Accept(Event(3,1));f.ContinueOk=false;previous=f.ContinueCalls;Yes("tree-failed-continue-retains-exact-pending",!t.Accept(Event(6,1))&&t.Book.Pending&&t.PendingRecord!=null&&f.ContinueCalls==previous+1&&!t.Phase(1).LoaderHandled);
      foreach(string fault in new[]{"marker-present","marker-other-pid","wrong-module-path","wrong-thread","wrong-chance","wrong-address","wrong-code"}) {
        f=new Fake();t=Tree(f);t.Accept(Event(3,1));if(fault=="wrong-module-path")f.WrongModulePath=true;t.Accept(Event(6,1));if(fault=="marker-present")f.MarkerAbsent=false;if(fault=="marker-other-pid")f.WrongMarkerPid=true;
        var ex=Event(1,1);if(fault=="wrong-thread")U32(ex,8,999);if(fault=="wrong-chance")U32(ex,168,0);if(fault=="wrong-address")U64(ex,32,Base(1)+54);if(fault=="wrong-code")U32(ex,16,0xc0000409);
        t.Accept(ex);Yes("tree-startup-rejects-"+fault,!t.Phase(1).LoaderHandled&&f.LastDisposition==Native.NotHandled);
      }
      f=new Fake { WrongModuleHash=true };t=Tree(f);t.Accept(Event(3,1));previous=f.ContinueCalls;Yes("tree-wrong-loader-hash-blocks-module-continue",!t.Accept(Event(6,1))&&f.ContinueCalls==previous&&t.PendingRecord!=null);
      f=new Fake();t=Tree(f);Start(t,1);Yes("tree-second-breakpoint-not-swallowed",t.Accept(Event(1,1))&&f.LastDisposition==Native.NotHandled);
      f=new Fake();t=Tree(f);t.Accept(Event(3,1));t.Accept(Event(1,1,0,0xe0434352));t.Accept(Event(6,1));t.Accept(Event(1,1));Yes("tree-late-initial-address-not-first-exception-is-not-handled",!t.Phase(1).LoaderHandled&&f.LastDisposition==Native.NotHandled);
      f=new Fake();t=Tree(f);t.Accept(Event(3,1));t.Accept(Event(6,1));t.Accept(Event(7,1));t.Accept(Event(1,1));Yes("tree-unloaded-loader-address-not-handled",!t.Phase(1).LoaderHandled&&f.LastDisposition==Native.NotHandled);
      f=new Fake();t=Tree(f);Start(t,1);
      var fatal=Event(1,1,0,0xc0000409);U32(fatal,20,1);U32(fatal,40,1);U64(fatal,48,7);U32(fatal,168,0);Yes("tree-second-chance-native-record-preserved-not-handled",t.Accept(fatal)&&f.LastDisposition==Native.NotHandled&&(UInt32)t.Ledger[t.Ledger.Count-1]["exceptionCode"]==0xc0000409);
      f=new Fake();t=Tree(f);t.Accept(Event(3,1));t.Accept(Event(2,1,201));Yes("tree-created-thread-system-identity-registered",t.Phase(1).Threads.ContainsKey(201));t.Accept(Event(4,1,201));Yes("tree-thread-EXIT-system-handle-retired-without-close",!t.Phase(1).Threads.ContainsKey(201)&&f.ImageCalls==1);
      var reuse=Event(6,1);U64(reuse,16,1060);Yes("tree-closed-secondary-thread-number-reuse-as-image-allowed",t.Accept(reuse)&&f.ImageCalls==2);
      f=new Fake();t=Tree(f);t.Accept(Event(3,1));f.WrongThreadPid=true;previous=f.ContinueCalls;Yes("tree-new-thread-wrong-process-rejected-before-continue",!t.Accept(Event(2,1,201))&&f.ContinueCalls==previous);
      f=new Fake();t=Tree(f);t.Accept(Event(3,1));t.Accept(Event(4,1,101));Yes("tree-primary-thread-system-handle-retained-until-process-EXIT",t.Phase(1).Threads[101].Exited&&t.Phase(1).Threads[101].Primary);
      var primaryAlias=Event(6,1);U64(primaryAlias,16,1056);previous=f.ImageCalls;Yes("tree-exited-primary-system-handle-not-manually-closed",!t.Accept(primaryAlias)&&f.ImageCalls==previous);
      f=new Fake();t=Tree(f);t.Accept(Event(3,1));t.Accept(Event(3,2));t.Accept(Event(5,1));var reuseProcess=Event(6,2);U64(reuseProcess,16,1040);Yes("tree-continued-root-EXIT-retires-system-process-number",t.Accept(reuseProcess)&&!t.Phase(2).Exited);
      f=new Fake();t=Tree(f);f.Input.Enqueue(Event(3,1));Yes("tree-Pump-connects-real-dispatch-seam",t.Pump(25)&&t.Book.ProcessCount==1&&t.Waits.Count==1);Yes("tree-empty-poll-stale-error121-recorded",t.Pump(25)&&t.Waits[1].TimedPoll&&!t.UnsafePending);
      f.ThreadOk=false;previous=t.Waits.Count;Reject("tree-wrong-creating-thread-before-native-poll",()=>t.Pump(25));Yes("tree-wrong-thread-no-new-wait",t.Waits.Count==previous);
      foreach(string fault in new[]{"failure","no-bytes","short-bytes","wrong-request","contradiction"}) { f=new Fake { WaitFault=fault };t=Tree(f);Yes("tree-typed-wait-rejects-"+fault,!t.Pump(25)&&t.UnsafePending&&t.Waits.Count==1&&f.ContinueCalls==0); }
      foreach(string fault in new[]{"zero-pid","zero-tid","unknown-tag","bad-chance"}) { f=new Fake();t=Tree(f);t.Accept(Event(3,1));previous=f.ContinueCalls;var raw=Event(1,1);if(fault=="zero-pid")U32(raw,4,0);if(fault=="zero-tid")U32(raw,8,0);if(fault=="unknown-tag")U32(raw,0,99);if(fault=="bad-chance")U32(raw,168,2);Yes("tree-invalid-raw-header-rejected-"+fault,!t.Accept(raw)&&t.PendingRecord!=null&&f.ContinueCalls==previous); }
      f=new Fake();t=Tree(f);t.Accept(Event(3,1));previous=f.ContinueCalls;var malformed=Event(1,1);U32(malformed,40,16);Yes("tree-undecodable-exception-retains-header-not-continued",!t.Accept(malformed)&&t.PendingRecord!=null&&f.ContinueCalls==previous);
      f=new Fake();t=Tree(f);for(UInt32 pid=1;pid<=16;pid++)Guard.Require(t.Accept(Event(3,pid)),"Process cap positive fixture");previous=f.ContinueCalls;Yes("tree-process-cap-before-extra-binding-control",!t.Accept(Event(3,17))&&t.Book.ProcessCount==16&&f.ContinueCalls==previous);
      f=new Fake();t=Tree(f);t.Accept(Event(3,1));for(UInt32 n=1;n<256;n++){UInt64 handle=2097152+n*4;UInt32 tid=1000+n;f.ExtraThreadTids[handle]=tid;var ev=Event(2,1,tid);U64(ev,16,handle);Guard.Require(t.Accept(ev),"Thread cap positive fixture");}previous=f.ContinueCalls;Yes("tree-thread-cap-blocks-additional-primary-CREATE",!t.Accept(Event(3,2))&&f.ContinueCalls==previous&&t.Book.ProcessCount==1);
      f=new Fake();t=Tree(f);Start(t,1);for(int n=1;n<128;n++)Guard.Require(t.Accept(Event(1,1)),"Per-process exception cap fixture");previous=f.ContinueCalls;Yes("tree-per-process-exception-cap-no-extra-continue",!t.Accept(Event(1,1))&&f.ContinueCalls==previous);
      f=new Fake();t=Tree(f);Start(t,1);Start(t,2);Start(t,3);for(int n=1;n<90;n++){Guard.Require(t.Accept(Event(1,1))&&t.Accept(Event(1,2)),"Total exception cap fixture");}for(int n=1;n<76;n++)Guard.Require(t.Accept(Event(1,3)),"Total exception cap remainder");previous=f.ContinueCalls;Yes("tree-total-exception-cap-no-extra-continue",!t.Accept(Event(1,3))&&f.ContinueCalls==previous);
      f=new Fake();t=Tree(f);for(int n=0;n<TrialTreeEvents.WaitLimit;n++)Guard.Require(t.Pump(25),"Wait cap positive fixture");previous=t.Waits.Count;Yes("tree-wait-cap-no-extra-native-poll",!t.Pump(25)&&t.Waits.Count==previous&&t.Book.Errors.Count>0);
      f=new Fake();t=Tree(f);t.Accept(Event(3,1));for(int n=1;n<TrialTreeEvents.EventLimit;n++)Guard.Require(t.Accept(Event(8,1)),"Event cap positive fixture");previous=f.ContinueCalls;Yes("tree-event-cap-retains-overflow-header-no-control",!t.Accept(Event(8,1))&&f.ContinueCalls==previous&&t.UnsafePending);
      f=new Fake();t=Tree(f);t.Accept(Event(3,1));Yes("tree-RIP-event-retained-incomplete",!t.Accept(Event(9,1))&&t.Book.Errors.Count>0&&!t.Book.Complete);
      return checks.ToArray();
    }
  }
}
