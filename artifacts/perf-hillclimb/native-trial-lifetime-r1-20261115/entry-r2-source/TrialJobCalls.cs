using System;
using System.Diagnostics;
using NativeCapturePrototype;
using NativeCaptureController;
using NativeCaptureRepair;

namespace NativeTrialLifetime {
  public sealed class TrialJobRaw {
    public BoolNativeReceipt Call;public bool OwnerHeld;public string OwnerHandle;public UInt32 ActiveProcesses;
  }
  public sealed class TrialTermination {
    public bool NativeCalled,OwnerHeld,DeadlineExpired;public string OwnerHandle,ElapsedMs;
    public int RemainingBeforeMs,RemainingAfterMs;public UInt32 ExitCode;public BoolNativeReceipt Call;
    public bool Requested { get { return NativeCalled&&OwnerHeld&&HandleIndependence.ValidHex(OwnerHandle,true)&&!DeadlineExpired&&RemainingAfterMs>0&&Call!=null&&Call.Result&&!Call.ErrorValid&&!Call.Error.HasValue; } }
  }
  public static class TrialJobLogic {
    public static TrialJobQuery Query(CleanupBudget budget,Func<TrialJobRaw> call) {
      Guard.Require(budget!=null&&call!=null,"Shared job query budget/call required");
      var r=new TrialJobQuery { RemainingBeforeMs=budget.RemainingMs,ElapsedMs="0" };
      if(r.RemainingBeforeMs==0) { r.DeadlineExpired=true;return r; }
      var clock=Stopwatch.StartNew();var raw=call();Guard.Require(raw!=null&&raw.Call!=null,"Typed job query call unavailable");
      r.NativeCalled=true;r.Success=raw.Call.Result;r.ErrorValid=raw.Call.ErrorValid;r.Error=raw.Call.Error;r.RawLastError=raw.Call.RawLastError;r.OwnerHandleHeld=raw.OwnerHeld;r.OwnerHandle=raw.OwnerHandle;r.ActiveProcesses=raw.ActiveProcesses;
      r.RemainingMs=budget.RemainingMs;r.DeadlineExpired=r.RemainingMs==0;r.ElapsedMs=clock.ElapsedMilliseconds.ToString(System.Globalization.CultureInfo.InvariantCulture);return r;
    }
    public static TrialTermination Terminate(CleanupBudget budget,Func<TrialJobRaw> call) {
      Guard.Require(budget!=null&&call!=null,"Shared job termination budget/call required");
      var r=new TrialTermination { RemainingBeforeMs=budget.RemainingMs,ExitCode=0xe0000001,ElapsedMs="0" };
      if(r.RemainingBeforeMs==0) { r.DeadlineExpired=true;return r; }
      var clock=Stopwatch.StartNew();var raw=call();Guard.Require(raw!=null&&raw.Call!=null,"Typed job termination unavailable");
      r.NativeCalled=true;r.Call=raw.Call;r.OwnerHeld=raw.OwnerHeld;r.OwnerHandle=raw.OwnerHandle;r.RemainingAfterMs=budget.RemainingMs;r.DeadlineExpired=r.RemainingAfterMs==0;r.ElapsedMs=clock.ElapsedMilliseconds.ToString(System.Globalization.CultureInfo.InvariantCulture);return r;
    }
  }
}
