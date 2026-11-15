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
    sealed class FakeSetup : IDisposable {
      public int Disposals;readonly bool fail;public FakeSetup(bool throws) { fail=throws; }
      public void Dispose() { Disposals++;if(fail)throw new Exception("synthetic-dispose-error"); }
    }
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
      var closeFirst=new OwnedWorker(()=>{throw new Exception("Closed worker must never execute");});closeFirst.RequestClose();
      Reject("close-wins-no-later-start",()=>closeFirst.Start());Yes("never-start-is-terminal",closeFirst.TerminalProved&&closeFirst.Join(0));
      for(int i=0;i<16;i++) {
        var entered=new ManualResetEvent(false);var release=new ManualResetEvent(false);
        var worker=new OwnedWorker(()=>{entered.Set();release.WaitOne(1000);});worker.Start();
        Yes("worker-entered-"+i,entered.WaitOne(1000));worker.RequestClose();
        Yes("live-worker-not-joined-"+i,!worker.Join(0)&&!worker.TerminalProved);
        release.Set();Yes("worker-real-join-"+i,worker.Join(1000)&&worker.TerminalProved);
        entered.Dispose();release.Dispose();
      }
      var pending=new ReaderState();pending.RequestClose();Yes("pending-claim-first",pending.ClaimFinalization());
      Yes("pending-claim-retry",pending.ClaimFinalization()&&!pending.ResourcesReleased);
      var heldResource=new FakeResource();var heldWriter=new HandleLease(heldResource);heldResource.Dispose();
      Yes("pending-physical-close",heldResource.Releases==0);heldWriter.Dispose();
      Yes("retry-after-physical-release",heldResource.Releases==1&&pending.ClaimFinalization());pending.ConfirmResourcesReleased();
      Yes("completed-finalize-not-repeated",!pending.ClaimFinalization());
      var continuedError=new DrainStep { Ok=false,Recovery=DrainRecovery.ContinuedOwned };
      Yes("latched-error-can-drain-owned",continuedError.MayKeepDraining&&!continuedError.Ok);
      Yes("foreign-header-cannot-drain",!new DrainStep { Ok=false,Recovery=DrainRecovery.UnsafeIdentity }.MayKeepDraining);
      Yes("native-failure-needs-failsafe",!new DrainStep { Ok=false,Recovery=DrainRecovery.NativeFailure }.MayKeepDraining);
      var cleanup=new JobCleanup { EmptyConfirmed=true };cleanup.Errors.Add("retained-observer-error");
      Yes("cleanup-fact-not-evidence-success",cleanup.EmptyConfirmed&&!cleanup.EvidenceComplete);
      Yes("zero-write-is-not-eof",PipeReadPolicy.Classify(true,0,0)==PipeReadAction.NoData);
      Yes("broken-anonymous-writer-is-eof",PipeReadPolicy.Classify(false,0,109)==PipeReadAction.Eof);
      Yes("cancellation-is-not-eof",PipeReadPolicy.Classify(false,0,995)==PipeReadAction.Failure);
      Yes("file-eof-is-not-pipe-proof",PipeReadPolicy.Classify(false,0,38)==PipeReadAction.Failure);
      Yes("oversize-read-rejected",PipeReadPolicy.Classify(true,4097,0)==PipeReadAction.Failure);
      Yes("read-data-is-data",PipeReadPolicy.Classify(true,4096,0)==PipeReadAction.Data);
      var original=new Exception("synthetic-setup-error");var allocated=new FakeSetup(false);
      Yes("rollback-preserves-primary",Object.ReferenceEquals(SetupRollback.Release(original,null,allocated,null),original));
      Yes("rollback-disposes-allocated-only",allocated.Disposals==1);
      var first=new FakeSetup(false);var failing=new FakeSetup(true);var last=new FakeSetup(false);
      var combined=SetupRollback.Release(original,first,failing,last) as AggregateException;
      Yes("rollback-continues-after-dispose-error",first.Disposals==1&&failing.Disposals==1&&last.Disposals==1);
      Yes("rollback-retains-both-errors",combined!=null&&combined.InnerExceptions.Count==2&&Object.ReferenceEquals(combined.InnerExceptions[0],original));
      Yes("nothing-preallocated-can-escape-createpipe-failure",Object.ReferenceEquals(SetupRollback.Release(original,(IDisposable)null),original));
      return checks.ToArray();
    }
  }
}
