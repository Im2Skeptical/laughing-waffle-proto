using System;
using System.Threading;
using System.Runtime.InteropServices;
using System.Collections.Generic;
using NativeCaptureRepair;
namespace IndependentLifecycleR3 {
 sealed class Fake : SafeHandle {
  public int Releases;
  public Fake():base(IntPtr.Zero,true){SetHandle(new IntPtr(0x100000001));}
  public override bool IsInvalid { get { return handle==IntPtr.Zero; } }
  protected override bool ReleaseHandle(){Interlocked.Increment(ref Releases);return true;}
 }
 public static class Checks {
  static List<string> names;
  static void Yes(string n,bool value){if(!value)throw new Exception(n);names.Add(n);}
  static void Reject(string n,Action a){bool hit=false;try{a();}catch{hit=true;}Yes(n,hit);}
  public static string[] Run(){names=new List<string>();
   for(int i=0;i<8;i++){
    var f=new Fake();var a=new HandleLease(f);var b=new HandleLease(f);
    var d=new Thread(()=>f.Dispose());d.Start();Yes("dispose thread joined "+i,d.Join(1000));
    Yes("two leases defer physical release "+i,f.Releases==0&&a.Value==b.Value);
    var s=new ReaderState();s.RequestClose();Yes("initial pending claim "+i,s.ClaimFinalization());
    Yes("retry pending claim "+i,s.ClaimFinalization()&&!s.ResourcesReleased);
    a.Dispose();Yes("one remaining lease pins "+i,f.Releases==0);b.Dispose();
    Yes("physical release exactly once "+i,f.Releases==1&&s.ClaimFinalization());
    s.ConfirmResourcesReleased();Yes("completed finalization terminal "+i,s.ResourcesReleased&&!s.ClaimFinalization());
    Reject("cannot begin after release "+i,()=>s.BeginOperation(false));
   }
   for(int i=0;i<8;i++){
    int calls=0;var w=new OwnedWorker(()=>Interlocked.Increment(ref calls));w.RequestClose();
    Exception startError=null;var starter=new Thread(()=>{try{w.Start();}catch(Exception e){startError=e;}});
    starter.Start();Yes("close-first starter joined "+i,starter.Join(1000));
    Yes("close-first permanently terminal "+i,w.NeverStarted&&w.TerminalProved&&w.Join(0));
    Yes("close-first never executes body "+i,calls==0&&startError!=null);
   }
   for(int i=0;i<8;i++){
    using(var entered=new ManualResetEvent(false))using(var release=new ManualResetEvent(false)){
     int calls=0;var w=new OwnedWorker(()=>{Interlocked.Increment(ref calls);entered.Set();release.WaitOne(1000);});
     w.Start();Yes("start-first entered "+i,entered.WaitOne(1000));
     var closer=new Thread(()=>w.RequestClose());closer.Start();Yes("close requester joined "+i,closer.Join(1000));
     Yes("close does not invent real join "+i,!w.NeverStarted&&!w.TerminalProved&&!w.Join(0));
     release.Set();Yes("actual joined worker terminal "+i,w.Join(1000)&&w.TerminalProved&&calls==1);
     Reject("closed worker cannot restart "+i,()=>w.Start());
    }
   }
   for(int i=0;i<16;i++){
    using(var go=new ManualResetEvent(false))using(var release=new ManualResetEvent(false)){
     int calls=0;Exception startError=null;
     var w=new OwnedWorker(()=>{Interlocked.Increment(ref calls);release.WaitOne(1000);});
     var starter=new Thread(()=>{go.WaitOne(1000);try{w.Start();}catch(Exception e){startError=e;}});
     var closer=new Thread(()=>{go.WaitOne(1000);w.RequestClose();});starter.Start();closer.Start();go.Set();
     Yes("racing starter joined "+i,starter.Join(1000));Yes("racing close joined "+i,closer.Join(1000));
     release.Set();Yes("race reaches proved terminal "+i,w.Join(1000)&&w.TerminalProved);
     Yes("race has one consistent winner "+i,w.NeverStarted?(calls==0&&startError!=null):(calls==1&&startError==null));
    }
   }
   var state=new ReaderState();state.BeginOperation(true);state.Start();state.RequestClose();
   Yes("running state cannot finalize",!state.ClaimFinalization());state.PublishStopped();
   Yes("stopped is not joined",!state.ClaimFinalization());state.ConfirmJoin();
   Yes("owner operation still blocks",!state.ClaimFinalization());state.EndOperation();
   Yes("operation completion permits retry",state.ClaimFinalization()&&state.ClaimFinalization());
   var budget=CleanupBudget.PureFixture(0,9000,1000);var same=budget;budget.AdvancePureTicks(8901);
   Yes("shared 99ms remains",same.RemainingMs==99&&same.WaitCap(25)==25);same.AdvancePureTicks(99);
   Yes("no phase budget reset",budget.WaitCap(25)==0);Reject("fake budget never authorizes native",()=>budget.RequireNativeBudget());
   foreach(DrainRecovery r in Enum.GetValues(typeof(DrainRecovery))){
    var step=new DrainStep{Ok=false,Recovery=r};Yes("typed drain policy "+r,step.MayKeepDraining==(r==DrainRecovery.Idle||r==DrainRecovery.ContinuedOwned));
   }
   var result=new JobCleanup{EmptyConfirmed=true};Yes("physical facts alone only clean empty",result.EvidenceComplete);
   result.Errors.Add("owned event decode failed");Yes("latched error prevents evidence complete",!result.EvidenceComplete&&result.EmptyConfirmed);
   result.Errors.Clear();result.UnsafeRecoveryRequired=true;Yes("unsafe recovery prevents success",!result.EvidenceComplete);
   result.UnsafeRecoveryRequired=false;result.DeadlineExpired=true;Yes("deadline prevents success",!result.EvidenceComplete);
   for(uint tag=1;tag<=9;tag++)Yes("cleanup continuation "+tag,CleanupDebugDrain.CleanupContinuation(tag)==(tag==1?0x80010001u:0x10002u));
   Reject("unknown header not continued",()=>CleanupDebugDrain.CleanupContinuation(0));
   Yes("successful zero read not eof",PipeReadPolicy.Classify(true,0,109)==PipeReadAction.NoData);
   Yes("success ignores stale error",PipeReadPolicy.Classify(true,4096,995)==PipeReadAction.Data);
   Yes("only broken pipe closure",PipeReadPolicy.Classify(false,0,109)==PipeReadAction.Eof);
   foreach(int error in new int[]{0,38,995,6,997})Yes("other failure not eof "+error,PipeReadPolicy.Classify(false,0,error)==PipeReadAction.Failure);
   Yes("oversize success rejected",PipeReadPolicy.Classify(true,UInt32.MaxValue,0)==PipeReadAction.Failure);
   var eState=new ReaderState();for(int i=0;i<45;i++)eState.RecordError(new String('x',5000));
   Yes("error bounds and drops",eState.Errors.Length==32&&eState.DroppedErrors==13&&eState.Errors[0].Length==4096);
   var copy=eState.Errors;copy[0]="mutated";Yes("detached error snapshot",eState.Errors[0].Length==4096);
   return names.ToArray();
  }
 }
}
