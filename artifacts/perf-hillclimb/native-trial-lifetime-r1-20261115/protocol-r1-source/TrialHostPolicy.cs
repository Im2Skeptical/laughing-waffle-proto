using System;
using System.Collections.Generic;
using NativeCapturePrototype;
using NativeCaptureController;

namespace NativeTrialLifetime {
  public sealed class TrialHostWait {
    public bool NativeCalled,OwnerHeld,IdentityVerified,ErrorValid;public string Handle,CreatedFileTimeHex,Image;public UInt32 Pid,HandleOwnerPid,Status;
    public int RequestedMs,RawLastError;public int? Error;public BoolNativeReceipt ExitCodeCall;public UInt32? ExitCode;
  }
  public interface ITrialHostCalls {
    long MonotonicMilliseconds { get; }
    TrialHostWait WaitOwned(int maximumMs);
    BoolNativeReceipt TerminateOwned(TrialHostIdentity expected);
    TrialRelease ReleaseOwned();
  }
  public sealed class TrialHostResult {
    public bool NaturalExit,ForcedStop,ExitConfirmed,DeadlineExceeded;public UInt32? ExitCode;public BoolNativeReceipt Termination;public TrialRelease Release;
    public readonly List<TrialHostWait> Waits=new List<TrialHostWait>();public readonly List<string> Errors=new List<string>();
    public bool SuccessfulHostRun { get { return NaturalExit&&!ForcedStop&&!DeadlineExceeded&&ExitConfirmed&&ExitCode==0&&Errors.Count==0&&Release!=null&&Release.Confirmed; } }
  }
  // SAME bounded policy for future native retained-handle implementation and
  // pure fake controls. No process launch/native helper exists in this policy.
  public static class TrialHostPolicy {
    static void Error(TrialHostResult r,string detail) { if(r.Errors.Count<32)r.Errors.Add(detail); }
    static bool Signal(TrialHostResult r,TrialHostWait w,TrialHostIdentity expected,int requested) {
      Guard.Require(w!=null&&w.NativeCalled&&w.OwnerHeld&&w.IdentityVerified&&w.HandleOwnerPid==expected.HandleOwnerPid&&w.Handle==expected.OwnedHandle&&w.Pid==expected.Pid&&w.CreatedFileTimeHex==expected.CreatedFileTimeHex&&String.Equals(Policy.CanonicalImage(w.Image),Policy.CanonicalImage(expected.Image),StringComparison.OrdinalIgnoreCase)&&w.RequestedMs==requested,"Host wait actual retained identity/handle context differs");
      Guard.Require(w.ErrorValid==(w.Status==UInt32.MaxValue)&&w.Error==(w.ErrorValid?(int?)w.RawLastError:null),"Host wait status/error validity mismatch");
      if(w.Status==0) { Guard.Require(w.ExitCodeCall!=null&&w.ExitCodeCall.Result&&!w.ExitCodeCall.ErrorValid&&!w.ExitCodeCall.Error.HasValue&&w.ExitCode.HasValue,"Signaled host exit code unavailable");r.ExitConfirmed=true;r.ExitCode=w.ExitCode;return true; }
      Guard.Require(w.Status==258,"Host kernel wait failed/unexpected");return false;
    }
    public static TrialHostResult Supervise(TrialHostIdentity expected,ITrialHostCalls calls) {
      Guard.Require(expected!=null&&calls!=null&&expected.Pid>0&&expected.HandleOwnerPid>0&&HandleIndependence.ValidHex(expected.OwnedHandle,true)&&HandleIndependence.ValidHex(expected.CreatedFileTimeHex,true),"Expected retained host/context required");
      var r=new TrialHostResult();long start=calls.MonotonicMilliseconds,last=start;int polls=0;
      try {
        while(true) {
          long now=calls.MonotonicMilliseconds;Guard.Require(now>=last,"Host clock moved backward");last=now;if(now-start>=45000) { r.DeadlineExceeded=true;break; }
          Guard.Require(++polls<=512,"Bounded host work poll count");int request=(int)Math.Min(100,45000-(now-start));var wait=calls.WaitOwned(request);r.Waits.Add(wait);
          if(Signal(r,wait,expected,request)) { r.NaturalExit=true;break; }
        }
      }catch(Exception error) { Error(r,"Host work:"+error.Message); }
      finally {
        if(!r.ExitConfirmed) {
          r.ForcedStop=true;
          try {
            r.Termination=calls.TerminateOwned(expected);if(r.Termination==null||!r.Termination.Result||r.Termination.ErrorValid||r.Termination.Error.HasValue)Error(r,"Exact owned host termination unconfirmed");
            long stopStart=calls.MonotonicMilliseconds;last=stopStart;int stopPolls=0;
            while(calls.MonotonicMilliseconds-stopStart<5000) {
              long now=calls.MonotonicMilliseconds;Guard.Require(now>=last,"Host stop clock moved backward");last=now;Guard.Require(++stopPolls<=64,"Bounded host stop polls");int request=(int)Math.Min(100,5000-(now-stopStart));if(request<=0)break;
              var wait=calls.WaitOwned(request);r.Waits.Add(wait);if(Signal(r,wait,expected,request))break;
            }
            if(!r.ExitConfirmed)Error(r,"Owned host exit not confirmed by stop deadline");
          }catch(Exception error) { Error(r,"Host stop:"+error.Message); }
        }
        try { r.Release=calls.ReleaseOwned();Guard.Require(r.Release!=null&&r.Release.Handle==expected.OwnedHandle&&r.Release.NativeCalled&&r.Release.Confirmed&&r.Release.State=="NATIVE_CLOSE_SUCCEEDED"&&!r.Release.ErrorValid&&!r.Release.Error.HasValue&&r.Release.RawLastError.HasValue,"Owned host handle release incomplete"); }catch(Exception error) { Error(r,"Host release:"+error.Message); }
      }
      return r;
    }
  }
}
