using System;
using System.Threading;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using NativeCaptureRepair;

namespace NativeCaptureRepairProof {
  sealed class FakeResource : SafeHandle {
    public int Releases;
    public FakeResource():base(IntPtr.Zero,true) { SetHandle(new IntPtr(0x123456)); }
    public override bool IsInvalid { get { return handle==IntPtr.Zero; } }
    protected override bool ReleaseHandle() { Interlocked.Increment(ref Releases);return true; }
  }
  public static class PureChecks {
    static readonly List<string> checks=new List<string>();
    static void Yes(string name,bool value) { if(!value)throw new Exception("Pure check failed: "+name);checks.Add(name); }
    static void Reject(string name,Action action) { bool rejected=false;try { action(); }catch { rejected=true; }Yes(name,rejected); }
    public static string[] Run() {
      var resource=new FakeResource();var lease=new HandleLease(resource);
      resource.Dispose();Yes("dispose-defers-under-lease",resource.Releases==0);
      Yes("leased-value-stays-owned",lease.Value==new IntPtr(0x123456));lease.Dispose();
      Yes("release-after-lease-exactly-once",resource.Releases==1);lease.Dispose();resource.Dispose();Yes("repeat-disposal-idempotent",resource.Releases==1);
      Reject("value-after-release",()=>{var ignored=lease.Value;});Reject("lease-already-disposed",()=>{new HandleLease(resource);});
      for(int i=0;i<32;i++) {
        var concurrent=new FakeResource();var held=new HandleLease(concurrent);
        var thread=new Thread(()=>concurrent.Dispose());thread.Start();Yes("dispose-thread-join-"+i,thread.Join(1000));
        Yes("concurrent-dispose-pinned-"+i,concurrent.Releases==0&&held.Value==new IntPtr(0x123456));held.Dispose();
        Yes("concurrent-final-release-"+i,concurrent.Releases==1);
      }
      var budget=CleanupBudget.PureFixture(1000,11000,1000);Yes("initial-budget",budget.RemainingMs==10000);
      budget.AdvancePureTicks(7000);Yes("remaining-budget",budget.RemainingMs==3000&&budget.WaitCap(5000)==3000);
      var same=budget;same.AdvancePureTicks(2999);Yes("shared-no-reset",budget.RemainingMs==1&&budget.WaitCap(25)==1);
      budget.AdvancePureTicks(1);Yes("deadline-expired",budget.RemainingMs==0&&budget.WaitCap(500)==0);
      Reject("no-native-with-pure-clock",()=>budget.RequireNativeBudget());Reject("no-negative-clock",()=>budget.AdvancePureTicks(-1));
      Reject("no-unbounded-wait",()=>budget.WaitCap(10001));Reject("no-unbounded-budget",()=>new CleanupBudget(10001));
      var state=new ReaderState();state.BeginOperation(true);state.Start();state.RequestClose();
      Yes("live-cannot-finalize",!state.ClaimFinalization());state.PublishReady();Yes("ready-recorded",state.Ready);
      state.PublishStopped();Yes("stopped-without-join-not-finalized",!state.ClaimFinalization());state.ConfirmJoin();
      Yes("active-operation-blocks-finalization",!state.ClaimFinalization());state.EndOperation();
      Yes("close-request-can-finalize-after-join",state.ClaimFinalization());Yes("not-yet-resource-proof",!state.ResourcesReleased);
      state.ConfirmResourcesReleased();Yes("resource-proof-separate",state.ResourcesReleased);Yes("repeat-finalization-rejected",!state.ClaimFinalization());
      Reject("released-operation-rejected",()=>state.BeginOperation(false));Reject("operation-underflow-rejected",()=>state.EndOperation());
      var idle=new ReaderState();idle.RequestClose();Yes("unstarted-can-finalize",idle.ClaimFinalization());
      var bad=new ReaderState();Reject("join-before-stop-rejected",()=>bad.ConfirmJoin());
      Reject("release-without-finalize-rejected",()=>bad.ConfirmResourcesReleased());
      bad.RecordError(new String('x',5000));Yes("error-text-bounded",bad.Errors[0].Length==4096);
      for(int i=0;i<40;i++)bad.RecordError("error");Yes("error-count-bounded",bad.Errors.Length==32&&bad.DroppedErrors==9);
      Yes("cleanup-exception-not-swallowed",CleanupDebugDrain.CleanupContinuation(1)==0x80010001);
      Yes("cleanup-exit-continues",CleanupDebugDrain.CleanupContinuation(5)==0x00010002);
      Reject("cleanup-unknown-tag-rejected",()=>CleanupDebugDrain.CleanupContinuation(10));
      return checks.ToArray();
    }
  }
}
