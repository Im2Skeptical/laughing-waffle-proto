using System;
using System.Collections.Generic;
using NativeCapturePrototype;
using NativeCaptureController;
using NativeCaptureRepair;

namespace NativeTrialLifetime {
  public sealed class TrialMembership {
    public BoolNativeReceipt Call;public bool Member,OwnerHeld;public string OwnerHandle;
    public bool Verified { get { return Call!=null&&Call.Result&&!Call.ErrorValid&&!Call.Error.HasValue&&Member&&OwnerHeld&&HandleIndependence.ValidHex(OwnerHandle,true); } }
  }
  public sealed class TrialProcessProbe {
    public UInt32 Pid,Tid,ThreadPid;public UInt64 CreatedFileTime;
    public string Image,ImageSha256;public UInt16 ProcessMachine,NativeMachine;
    public BoolNativeReceipt Times,ImageQuery,Architecture;
    public TrialMembership Membership;
    public int PidRawError,TidRawError,ThreadPidRawError;
    public bool PidErrorValid { get { return Pid==0; } } public bool TidErrorValid { get { return Tid==0; } } public bool ThreadPidErrorValid { get { return ThreadPid==0; } }
    static bool Ok(BoolNativeReceipt r) { return r!=null&&r.Result&&!r.ErrorValid&&!r.Error.HasValue; }
    public bool Matches(UInt32 pid,UInt32 tid,string image,string sha) {
      return pid>0&&tid>0&&Pid==pid&&Tid==tid&&ThreadPid==pid&&CreatedFileTime>0&&
        Ok(Times)&&Ok(ImageQuery)&&Ok(Architecture)&&ProcessMachine==0&&NativeMachine==0x8664&&
        Membership!=null&&Membership.Verified&&Image!=null&&
        String.Equals(Policy.CanonicalImage(Image),Policy.CanonicalImage(image),StringComparison.OrdinalIgnoreCase)&&ImageSha256==sha;
    }
  }
  public sealed class TrialDuplicate {
    public UInt64 Source,Produced;public BoolNativeReceipt Call;public bool Alias,Inherit,SameAccess;
    public bool Independent(UInt64 source,UInt64[] live) {
      return Call!=null&&Call.Result&&!Call.ErrorValid&&!Call.Error.HasValue&&Source==source&&!Alias&&!Inherit&&SameAccess&&HandleIndependence.CanOwn(source,Produced,live);
    }
  }
  public sealed class TrialRelease { public string Origin,Handle,State,Detail;public bool Confirmed; }
  // This seam is used by both the real binding and connected managed controls.
  // Native calls are forbidden during source construction; tests supply a fake.
  public interface ITrialProcessCalls {
    void RequireCreatingThread();
    TrialProcessProbe Probe(UInt64 process,UInt64 thread);
    TrialDuplicate Duplicate(UInt64 source,UInt64[] otherLive);
    ProcessWaitReceipt Wait(UInt64 owned,WaitSource identity,CleanupBudget budget,int maximum);
    TrialRelease Release(UInt64 owned);
  }
  public sealed class TrialProcessBinding {
    readonly ITrialProcessCalls calls;readonly UInt32 pid,tid;readonly string allowedImage,allowedSha;
    bool attempted,exitContinued,released,waitVerified,releaseVerified;UInt64 eventProcess,eventThread,wait;
    public TrialProcessProbe OriginalProbe,DuplicateProbe;public TrialDuplicate Duplication;public TrialRelease ReleaseReceipt;
    public TrialIdentity Identity { get;private set; }
    public readonly List<ProcessWaitReceipt> Waits=new List<ProcessWaitReceipt>();
    public TrialProcessBinding(ITrialProcessCalls adapter,UInt32 process,UInt32 primary,string image,string sha) {
      Guard.Require(adapter!=null&&process>0&&primary>0&&sha!=null&&sha.Length==64,"Bounded binding identity required");
      calls=adapter;pid=process;tid=primary;allowedImage=Policy.CanonicalImage(image);allowedSha=sha;
    }
    public void Bind(UInt64 process,UInt64 thread,UInt64[] otherLive) {
      Guard.Require(!attempted&&!released&&otherLive!=null&&otherLive.Length<=512,"One bounded CREATE binding required");attempted=true;calls.RequireCreatingThread();
      Guard.Require(process!=0&&process!=UInt64.MaxValue&&thread!=0&&thread!=UInt64.MaxValue&&process!=thread,"Distinct system CREATE handles required");
      eventProcess=process;eventThread=thread;
      foreach(UInt64 raw in otherLive)Guard.Require(raw!=process&&raw!=thread,"System CREATE aliases live owned handle");
      OriginalProbe=calls.Probe(process,thread);
      Guard.Require(OriginalProbe!=null&&OriginalProbe.Matches(pid,tid,allowedImage,allowedSha),"CREATE native identity/job/x64 differs");
      var live=new List<UInt64>(otherLive);live.Add(process);live.Add(thread);
      Duplication=calls.Duplicate(process,live.ToArray());
      Guard.Require(Duplication!=null&&Duplication.Independent(process,live.ToArray()),"CREATE duplicate not independently owned");
      wait=Duplication.Produced; // Retained before second probe; failure still needs owned release.
      DuplicateProbe=calls.Probe(wait,thread);
      Guard.Require(DuplicateProbe!=null&&DuplicateProbe.Matches(pid,tid,allowedImage,allowedSha)&&DuplicateProbe.CreatedFileTime==OriginalProbe.CreatedFileTime,"Wait duplicate native generation differs");
      Identity=new TrialIdentity(pid,tid,OriginalProbe.CreatedFileTime,OriginalProbe.Image,OriginalProbe.ImageSha256,true,true);
    }
    public void ConfirmContinuedExit(UInt32 process) { calls.RequireCreatingThread();Guard.Require(Identity!=null&&process==pid&&!exitContinued&&!released,"One matching continued EXIT required");exitContinued=true; }
    public ProcessWaitReceipt ObserveExit(CleanupBudget budget,int maximum) {
      calls.RequireCreatingThread();Guard.Require(exitContinued&&!released&&Identity!=null&&wait!=0&&Waits.Count==0&&maximum>0&&maximum<=1000,"One post-continued-EXIT owned wait required");
      var source=new WaitSource { Origin="CREATE_PROCESS_DEBUG_EVENT.independent-duplicate",Handle=Policy.Hex(wait),CreatedFileTimeHex=Policy.Hex(Identity.CreatedFileTime),Image=Identity.Image,Pid=pid,Independent=true,IdentityVerified=true };
      ProcessWaitReceipt receipt=calls.Wait(wait,source,budget,maximum);Waits.Add(receipt);
      waitVerified=receipt!=null&&receipt.Complete&&!receipt.ErrorValid&&!receipt.Error.HasValue&&receipt.RequestedMs>0&&receipt.RequestedMs<=maximum&&receipt.RemainingBeforeMs>0&&receipt.RemainingAfterMs>0&&receipt.RemainingAfterMs<=receipt.RemainingBeforeMs&&receipt.Source!=null&&receipt.Source.Origin=="CREATE_PROCESS_DEBUG_EVENT.independent-duplicate"&&receipt.Source.Handle==Policy.Hex(wait)&&receipt.Source.Pid==pid&&receipt.Source.CreatedFileTimeHex==Policy.Hex(Identity.CreatedFileTime)&&String.Equals(receipt.Source.Image,Identity.Image,StringComparison.OrdinalIgnoreCase);
      return receipt;
    }
    public TrialRelease Release() {
      calls.RequireCreatingThread();Guard.Require(!released,"Binding release already requested");released=true;
      if(wait==0)return ReleaseReceipt=new TrialRelease { Origin="CREATE_EVENT.wait-duplicate",Handle=Policy.Hex(0),State="NOT_OWNED",Confirmed=false };
      // Recovery may release an incomplete binding, but cannot make it complete.
      ReleaseReceipt=calls.Release(wait);releaseVerified=ReleaseReceipt!=null&&ReleaseReceipt.Confirmed&&ReleaseReceipt.Handle==Policy.Hex(wait)&&ReleaseReceipt.Origin=="CREATE_EVENT.wait-duplicate"&&ReleaseReceipt.State=="NATIVE_CLOSE_SUCCEEDED";return ReleaseReceipt;
    }
    public bool Closed { get { return Identity!=null&&exitContinued&&Waits.Count==1&&waitVerified&&released&&releaseVerified; } }
    public UInt64 LiveOwned { get { return released?0:wait; } }
    public UInt64 SystemProcess { get { return eventProcess; } }
    public UInt64 SystemPrimaryThread { get { return eventThread; } }
  }
}
