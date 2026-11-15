using System;
using System.Diagnostics;
using NativeCapturePrototype;
using NativeCaptureRepair;

namespace NativeCaptureController {
  public static class HandleIndependence {
    public static bool CanOwn(UInt64 source,UInt64 produced,UInt64[] otherLive) {
      if(source==0||source==UInt64.MaxValue||produced==0||produced==UInt64.MaxValue||source==produced||otherLive==null)return false;
      foreach(UInt64 raw in otherLive)if(raw==produced)return false;return true;
    }
    internal static bool ValidHex(string text,bool nonzero) { UInt64 raw;return text!=null&&text.Length==18&&text.StartsWith("0x",StringComparison.Ordinal)&&UInt64.TryParse(text.Substring(2),System.Globalization.NumberStyles.AllowHexSpecifier,System.Globalization.CultureInfo.InvariantCulture,out raw)&&raw!=UInt64.MaxValue&&(!nonzero||raw!=0); }
  }
  public sealed class WaitSource {
    public string Origin,Handle,CreatedFileTimeHex,Image;public UInt32 Pid;
    public bool Independent,IdentityVerified;
    public bool Usable { get { return Independent&&IdentityVerified&&Pid>0&&HandleIndependence.ValidHex(Handle,true)&&HandleIndependence.ValidHex(CreatedFileTimeHex,true)&&!String.IsNullOrEmpty(Image); } }
  }
  public sealed class NativeWaitOutcome { public UInt32 Status;public int RawLastError; }
  public sealed class ProcessWaitReceipt {
    public string Phase;public WaitSource Source;public bool NativeCalled,DeadlineExpired,OwnershipUnavailable,ErrorValid;
    public UInt32? RawStatus;public int? Error;public int RawLastError,RequestedMs,RemainingBeforeMs,RemainingAfterMs;public string ElapsedMs;
    public bool Signaled { get { return NativeCalled&&!OwnershipUnavailable&&Source!=null&&Source.Usable&&RawStatus==0; } }
    public bool Complete { get { return Signaled&&!DeadlineExpired; } }
  }
  public sealed class BoolNativeReceipt {
    public string Phase;public bool Result,ErrorValid;public int RawLastError;public int? Error;
    public static BoolNativeReceipt From(string phase,bool result,int raw) { return new BoolNativeReceipt { Phase=phase,Result=result,RawLastError=raw,ErrorValid=!result,Error=result?(int?)null:raw }; }
  }
  public static class ProcessWaitLogic {
    public static ProcessWaitReceipt Observe(CleanupBudget budget,int maximum,string phase,WaitSource source,Func<UInt32,NativeWaitOutcome> call) {
      Guard.Require(budget!=null&&maximum>=0&&maximum<=10000&&call!=null,"Bounded wait arguments required");
      var r=new ProcessWaitReceipt { Phase=phase,Source=source,RemainingBeforeMs=budget.RemainingMs,ElapsedMs="0" };
      r.OwnershipUnavailable=source==null||!source.Usable;
      if(r.OwnershipUnavailable) { r.RemainingAfterMs=budget.RemainingMs;return r; }
      if(r.RemainingBeforeMs==0) { r.DeadlineExpired=true;r.RemainingAfterMs=0;return r; }
      r.RequestedMs=budget.WaitCap(maximum);var clock=Stopwatch.StartNew();NativeWaitOutcome outcome=call((UInt32)r.RequestedMs);
      Guard.Require(outcome!=null,"Native wait outcome unavailable");r.NativeCalled=true;r.RawStatus=outcome.Status;r.RawLastError=outcome.RawLastError;r.ErrorValid=outcome.Status==0xffffffff;r.Error=r.ErrorValid?(int?)outcome.RawLastError:null;
      r.ElapsedMs=clock.ElapsedMilliseconds.ToString(System.Globalization.CultureInfo.InvariantCulture);r.RemainingAfterMs=budget.RemainingMs;r.DeadlineExpired=r.RemainingAfterMs==0;return r;
    }
  }
}
