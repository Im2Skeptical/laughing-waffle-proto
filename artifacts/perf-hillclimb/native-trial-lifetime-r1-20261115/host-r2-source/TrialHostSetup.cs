using System;
using System.Collections.Generic;
using NativeCapturePrototype;
using NativeCaptureController;

namespace NativeTrialLifetime {
  public sealed class TrialCreatedHost {
    public bool Created;public UInt32 Pid,HandleOwnerPid;public string RetainedHandle,Origin;
  }
  public interface ITrialHostSetupCalls {
    long MonotonicMilliseconds { get; }
    TrialCreatedHost Creation { get; }
    BoolNativeReceipt TerminateCreated();
    TrialHostWait WaitCreated(int maximumMs);
    TrialRelease[] ReleaseCreated();
  }
  public sealed class TrialHostSetupResult {
    public TrialCreatedHost Creation;public long StartedMs,StoppedMs;public BoolNativeReceipt Termination;
    public bool ExitConfirmed,HandlesReleased;public UInt32? ExitCode;public TrialRelease[] Releases;
    public readonly List<TrialHostWait> Waits=new List<TrialHostWait>();public readonly List<string> Errors=new List<string>();
    // Setup failure NEVER becomes a successful host/cell even if rollback works.
    public string Classification { get { return "INCOMPLETE_HOST_SETUP"; } }
  }
  public static class TrialHostSetup {
    static void Error(TrialHostSetupResult r,string value){if(r.Errors.Count<32)r.Errors.Add(value);}
    public static TrialHostSetupResult StopAndRelease(ITrialHostSetupCalls calls){
      Guard.Require(calls!=null,"Creation-owned setup calls required");var r=new TrialHostSetupResult();
      try {
        var c=calls.Creation;Guard.Require(c!=null,"Creation ownership receipt absent");r.Creation=new TrialCreatedHost {Created=c.Created,Pid=c.Pid,HandleOwnerPid=c.HandleOwnerPid,RetainedHandle=c.RetainedHandle,Origin=c.Origin};
        r.StartedMs=calls.MonotonicMilliseconds;long last=r.StartedMs;
        if(c.Created){
          Guard.Require(c.Pid>0&&c.HandleOwnerPid>0&&HandleIndependence.ValidHex(c.RetainedHandle,true)&&c.Origin=="CreateProcessW.returned-retained","No foreign/PID-opened host rollback");
          r.Termination=calls.TerminateCreated();if(r.Termination==null||!r.Termination.Result||r.Termination.ErrorValid||r.Termination.Error.HasValue)Error(r,"Created-host termination unconfirmed");
          Guard.Require(calls.MonotonicMilliseconds>=last,"Setup termination clock moved backward");int polls=0;
          while(true){long now=calls.MonotonicMilliseconds;Guard.Require(now>=last,"Setup wait clock moved backward");last=now;if(now-r.StartedMs>=5000)break;Guard.Require(++polls<=64,"Setup poll cap");int request=(int)Math.Min(100,5000-(now-r.StartedMs));var w=calls.WaitCreated(request);r.Waits.Add(w);long after=calls.MonotonicMilliseconds;Guard.Require(after>=now,"Setup wait clock moved backward");last=after;
            Guard.Require(w!=null&&w.NativeCalled&&w.OwnerHeld&&w.Handle==c.RetainedHandle&&w.Pid==c.Pid&&w.HandleOwnerPid==c.HandleOwnerPid&&w.RequestedMs==request,"Setup wait lost retained creation ownership");
            Guard.Require(w.ErrorValid==(w.Status==UInt32.MaxValue)&&w.Error==(w.ErrorValid?(int?)w.RawLastError:null),"Setup wait error validity differs");
            if(w.Status==0){Guard.Require(w.ExitCodeCall!=null&&w.ExitCodeCall.Result&&!w.ExitCodeCall.ErrorValid&&!w.ExitCodeCall.Error.HasValue&&w.ExitCode.HasValue,"Setup exit code unavailable");r.ExitCode=w.ExitCode;r.ExitConfirmed=after-r.StartedMs<5000;if(!r.ExitConfirmed)Error(r,"Setup signal after stop deadline");break;}
            Guard.Require(w.Status==258,"Setup wait failed/unexpected");
          }
          if(!r.ExitConfirmed)Error(r,"Created-host exit not confirmed by single stop deadline");
        }
      }catch(Exception error){Error(r,"Setup stop:"+error.Message);}
      finally {
        r.StoppedMs=calls.MonotonicMilliseconds;
        try{r.Releases=calls.ReleaseCreated();Guard.Require(r.Releases!=null&&r.Releases.Length==3,"All three host handle release receipts required");r.HandlesReleased=true;foreach(var close in r.Releases){bool absent=close!=null&&close.State=="NOT_OWNED"&&!close.NativeCalled&&close.Handle==Policy.Hex(0);bool closed=close!=null&&close.NativeCalled&&close.Confirmed&&close.State=="NATIVE_CLOSE_SUCCEEDED"&&!close.ErrorValid&&!close.Error.HasValue&&close.RawLastError.HasValue;Guard.Require(absent||closed,"Setup owned handle close unconfirmed");}}catch(Exception error){r.HandlesReleased=false;Error(r,"Setup release:"+error.Message);}
      }
      return r;
    }
  }
}
