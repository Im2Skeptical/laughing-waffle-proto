using System;
using System.Threading;
using System.Runtime.InteropServices;
using System.Collections.Generic;
using NativeCaptureRepair;
namespace IndependentLifecycleAudit {
 sealed class Fake : SafeHandle {
  public int Releases;
  public Fake(long value):base(IntPtr.Zero,true){SetHandle(new IntPtr(value));}
  public override bool IsInvalid {get{return handle==IntPtr.Zero||handle==new IntPtr(-1);}}
  protected override bool ReleaseHandle(){Interlocked.Increment(ref Releases);return true;}
 }
 public static class Checks {
  static List<string> names;
  static void Yes(string n,bool b){if(!b)throw new Exception(n);names.Add(n);}
  static void Reject(string n,Action f){bool hit=false;try{f();}catch{hit=true;}Yes(n,hit);}
  public static string[] Run(){names=new List<string>();
   Reject("null lease",()=>new HandleLease(null));
   var invalid=new Fake(0);Reject("zero resource lease",()=>new HandleLease(invalid));invalid.Dispose();Yes("invalid resource not released as real handle",invalid.Releases==0);
   for(int i=0;i<8;i++){var r=new Fake(0x100000001);var a=new HandleLease(r);var b=new HandleLease(r);var t=new Thread(()=>r.Dispose());t.Start();Yes("dispose joined "+i,t.Join(1000));Yes("two references pin "+i,r.Releases==0&&a.Value==new IntPtr(0x100000001)&&b.Value==a.Value);a.Dispose();Yes("first release does not close "+i,r.Releases==0);b.Dispose();Yes("last release closes exactly once "+i,r.Releases==1);r.Dispose();a.Dispose();b.Dispose();Yes("all repeat disposals idempotent "+i,r.Releases==1);Reject("disposed lease value "+i,()=>{var v=b.Value;});}
   var budget=CleanupBudget.PureFixture(0,10000,1000);var phase2=budget;budget.AdvancePureTicks(1234);Yes("budget shared after phase1",phase2.RemainingMs==8766);phase2.AdvancePureTicks(8765);Yes("shared last millisecond",budget.RemainingMs==1&&budget.WaitCap(25)==1);budget.AdvancePureTicks(1);Yes("all waits exhausted",phase2.RemainingMs==0&&phase2.WaitCap(10000)==0);Reject("pure cannot enter native",()=>phase2.RequireNativeBudget());Reject("negative time",()=>phase2.AdvancePureTicks(-1));Reject("invalid finite wait",()=>phase2.WaitCap(-1));Reject("excess finite wait",()=>phase2.WaitCap(10001));
   var fine=CleanupBudget.PureFixture(0,1,10000);Yes("submillisecond rounds down rather than overrun",fine.RemainingMs==0);
   var s=new ReaderState();s.BeginOperation(true);s.Start();s.RequestClose();s.PublishStopped();s.ConfirmJoin();Yes("active owner gates release",!s.ClaimFinalization());s.EndOperation();Yes("joined reader can claim",s.ClaimFinalization());Yes("claim is not physical release",!s.ResourcesReleased);s.ConfirmResourcesReleased();Yes("release confirmation explicit",s.ResourcesReleased);Reject("operation after finalization",()=>s.BeginOperation(false));
   var pending=new ReaderState();pending.RequestClose();Yes("unstarted initial finalization claim",pending.ClaimFinalization());Yes("unconfirmed claim cannot be reclaimed",!pending.ResourcesReleased&&!pending.ClaimFinalization());
   var early=new ReaderState();early.BeginOperation(true);early.Start();early.RequestClose();early.PublishStopped();early.ConfirmJoin();early.EndOperation();Yes("caller premature stop-join can authorize claim",early.ClaimFinalization());
   var errors=new ReaderState();for(int i=0;i<50;i++)errors.RecordError(new String('z',4500));Yes("error count capped",errors.Errors.Length==32);Yes("error text capped",errors.Errors[0].Length==4096);Yes("dropped error count explicit",errors.DroppedErrors==18);var copy=errors.Errors;copy[0]="changed";Yes("error snapshot detached",errors.Errors[0].Length==4096);
   Yes("cleanup owned exception not handled",CleanupDebugDrain.CleanupContinuation(1)==0x80010001);for(uint code=2;code<=9;code++)Yes("cleanup nonexception continue "+code,CleanupDebugDrain.CleanupContinuation(code)==0x10002);Reject("unknown cleanup tag",()=>CleanupDebugDrain.CleanupContinuation(0));
   return names.ToArray();
  }
 }
}
