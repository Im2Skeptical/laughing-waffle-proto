using System;
using System.Collections.Generic;
using NativeCapturePrototype;
using NativeCaptureController;
using NativeCaptureRepair;

namespace NativeTrialLifetime {
  public sealed class TrialIdentity {
    public readonly UInt32 Pid,PrimaryTid;public readonly UInt64 CreatedFileTime;public readonly string Image,ImageSha256;public readonly bool NativeIdentityVerified,JobMember;
    public TrialIdentity(UInt32 pid,UInt32 tid,UInt64 created,string image,string sha,bool verified,bool member) { Pid=pid;PrimaryTid=tid;CreatedFileTime=created;Image=image;ImageSha256=sha;NativeIdentityVerified=verified;JobMember=member; }
  }
  public sealed class TrialLife {
    public readonly TrialIdentity Identity;public bool CreateContinued,ExitContinued,WaitRecorded,WaitComplete,ReleaseRecorded,Released;public UInt32 ExitCode;public ProcessWaitReceipt Wait;
    internal TrialLife(TrialIdentity identity) { Identity=identity; }
  }
  public sealed class TrialJobQuery {
    public bool NativeCalled,Success,ErrorValid,OwnerHandleHeld,DeadlineExpired;public int? Error;public UInt32 ActiveProcesses;public int RemainingMs,RemainingBeforeMs,RawLastError;public string OwnerHandle,ElapsedMs;
    public bool ZeroConfirmed { get { return NativeCalled&&Success&&!ErrorValid&&!Error.HasValue&&OwnerHandleHeld&&HandleIndependence.ValidHex(OwnerHandle,true)&&!DeadlineExpired&&RemainingBeforeMs>0&&RemainingBeforeMs<=10000&&RemainingMs>0&&RemainingMs<=RemainingBeforeMs&&ActiveProcesses==0; } }
  }
  // State only. The native event adapter must retain original raw receipts.
  public sealed class TrialBook {
    readonly Dictionary<UInt32,TrialLife> lives=new Dictionary<UInt32,TrialLife>();
    readonly string image,sha;readonly int maximumProcesses,maximumEvents;readonly UInt32 root;
    UInt32 pendingPid,pendingTag,pendingTid;bool pending,jobZero,jobClosed,streams;int events,droppedErrors,lastRemaining=10000;
    public readonly List<string> Errors=new List<string>();public bool CleanupRequested { get;private set; }
    public TrialBook(UInt32 rootPid,string allowedImage,string allowedSha,int processLimit,int eventLimit) { Guard.Require(rootPid>0&&processLimit>=1&&processLimit<=16&&eventLimit>=1&&eventLimit<=4096,"Bounded trial book required");root=rootPid;image=Guard.Absolute(allowedImage);sha=allowedSha;Guard.Require(sha!=null&&sha.Length==64,"Image identity required");maximumProcesses=processLimit;maximumEvents=eventLimit; }
    public void Error(string detail) { CleanupRequested=true;if(Errors.Count<32)Errors.Add(detail);else droppedErrors++; }
    public void Register(TrialIdentity identity) {
      Guard.Require(identity!=null&&identity.Pid>0&&identity.PrimaryTid>0&&identity.CreatedFileTime>0&&identity.NativeIdentityVerified&&identity.JobMember,"Verified native PID/generation/job required");
      Guard.Require(String.Equals(Guard.Absolute(identity.Image),image,StringComparison.OrdinalIgnoreCase)&&identity.ImageSha256==sha,"Trial image differs from allowlist");
      Guard.Require(!lives.ContainsKey(identity.Pid)&&lives.Count<maximumProcesses,"Duplicate PID/generation or process cap");
      if(lives.Count==0)Guard.Require(identity.Pid==root,"Root must register first");lives.Add(identity.Pid,new TrialLife(identity));
    }
    public void Header(UInt32 tag,UInt32 pid,UInt32 tid) {
      Guard.Require(!pending&&tag>=1&&tag<=9&&pid>0&&tid>0&&lives.ContainsKey(pid),"Owned nonpending event required");Guard.Require(events<maximumEvents,"Trial event cap");
      var life=lives[pid];if(events==0)Guard.Require(pid==root&&tag==3,"First event must be root CREATE");
      if(tag==3)Guard.Require(!life.CreateContinued&&tid==life.Identity.PrimaryTid,"Unique primary CREATE required");else Guard.Require(life.CreateContinued&&!life.ExitContinued,"Event outside continued CREATE/EXIT lifetime");
      pending=true;pendingPid=pid;pendingTag=tag;pendingTid=tid;events++;
    }
    public void Continued(UInt32 tag,UInt32 pid,UInt32 tid,bool success,UInt32 exitCode) {
      Guard.Require(pending&&tag==pendingTag&&pid==pendingPid&&tid==pendingTid,"Continuation must match original pending header");
      if(!success) { Error("Native continuation failed; pending retained");return; }
      pending=false;var life=lives[pid];if(tag==3)life.CreateContinued=true;if(tag==5) { life.ExitContinued=true;life.ExitCode=exitCode;if(pid==root)CleanupRequested=true; }
    }
    public void RequestCleanup(string reason) { Error(reason); }
    public void RecordWait(UInt32 pid,ProcessWaitReceipt receipt) {
      Guard.Require(lives.ContainsKey(pid)&&lives[pid].ExitContinued&&!lives[pid].WaitRecorded&&!lives[pid].ReleaseRecorded,"One owned post-continued-EXIT wait before release");var life=lives[pid];life.WaitRecorded=true;life.Wait=receipt;
      life.WaitComplete=receipt!=null&&receipt.Complete&&!receipt.ErrorValid&&!receipt.Error.HasValue&&receipt.RequestedMs>0&&receipt.RequestedMs<=1000&&receipt.RemainingBeforeMs>0&&receipt.RemainingBeforeMs<=lastRemaining&&receipt.RemainingAfterMs>0&&receipt.RemainingAfterMs<=receipt.RemainingBeforeMs&&receipt.Source!=null&&receipt.Source.Pid==pid&&receipt.Source.CreatedFileTimeHex==Policy.Hex(life.Identity.CreatedFileTime)&&String.Equals(receipt.Source.Image,life.Identity.Image,StringComparison.OrdinalIgnoreCase)&&receipt.Source.Origin=="CREATE_PROCESS_DEBUG_EVENT.independent-duplicate";
      if(receipt!=null)lastRemaining=Math.Min(lastRemaining,receipt.RemainingAfterMs);
      if(!life.WaitComplete)Error("Independent process wait unavailable/incomplete:"+pid);
    }
    public void RecordRelease(UInt32 pid,bool confirmed) { Guard.Require(lives.ContainsKey(pid)&&!lives[pid].ReleaseRecorded,"Unique process release receipt required");var life=lives[pid];life.ReleaseRecorded=true;life.Released=confirmed;if(!confirmed||!life.ExitContinued||!life.WaitComplete)Error("Process ownership release incomplete/early:"+pid); }
    public void RecordJobZero(TrialJobQuery query) { Guard.Require(!jobClosed,"Cannot query a closed trial job");jobZero=query!=null&&query.ZeroConfirmed&&query.RemainingMs<=lastRemaining;if(query!=null)lastRemaining=Math.Min(lastRemaining,query.RemainingMs);if(!jobZero)Error("Native owned job zero unavailable/reset budget"); }
    public void RecordJobClose(bool confirmed) { Guard.Require(!jobClosed,"Job close recorded twice");jobClosed=true;bool waits=AllExitsContinued;foreach(var life in lives.Values)waits&=life.WaitComplete&&life.ReleaseRecorded&&life.Released;if(!confirmed||!jobZero||!waits||!streams)Error("Job close without confirmed zero/exits/waits/releases/EOF"); }
    public void RecordStreams(bool complete) { streams=complete;if(!complete)Error("Trial raw EOF/reader/release incomplete"); }
    public bool AllExitsContinued { get { if(pending||lives.Count==0)return false;foreach(var life in lives.Values)if(!life.ExitContinued)return false;return true; } }
    public bool Complete { get { if(Errors.Count>0||droppedErrors>0||!AllExitsContinued||!jobZero||!jobClosed||!streams||!lives.ContainsKey(root)||!lives[root].ExitContinued)return false;foreach(var life in lives.Values)if(!life.WaitComplete||!life.ReleaseRecorded||!life.Released)return false;return true; } }
    public int ProcessCount { get { return lives.Count; } }
    public int EventCount { get { return events; } }
    public int DroppedErrorCount { get { return droppedErrors; } }
    public bool Pending { get { return pending; } }
    public TrialLife Life(UInt32 pid) { Guard.Require(lives.ContainsKey(pid),"Unknown trial process");return lives[pid]; }
  }
}
