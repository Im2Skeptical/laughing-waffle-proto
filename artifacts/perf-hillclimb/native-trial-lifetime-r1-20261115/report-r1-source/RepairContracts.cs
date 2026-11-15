using System;
using System.Threading;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Collections.Generic;
using NativeCapturePrototype;

namespace NativeCaptureRepair {
  // The lease pins the underlying resource even when Dispose races its use.
  public sealed class HandleLease : IDisposable {
    readonly SafeHandle owner;readonly object gate=new object();bool held;IntPtr value;
    public HandleLease(SafeHandle resource) {
      Guard.Require(resource!=null,"Resource required");owner=resource;
      try { owner.DangerousAddRef(ref held);Guard.Require(held&&!owner.IsInvalid,"Invalid leased resource");value=owner.DangerousGetHandle(); }
      catch { if(held) { held=false;owner.DangerousRelease(); }throw; }
    }
    public IntPtr Value { get { lock(gate) { if(!held)throw new ObjectDisposedException("HandleLease");return value; } } }
    public void Dispose() { lock(gate) { if(!held)return;held=false;owner.DangerousRelease(); } }
  }
  public sealed class CleanupBudget {
    readonly long deadline,frequency;readonly bool pure;long fakeNow;
    public CleanupBudget(int milliseconds) {
      Guard.Require(milliseconds>0&&milliseconds<=10000,"Cleanup cap1..10000ms required");
      frequency=Stopwatch.Frequency;deadline=checked(Stopwatch.GetTimestamp()+checked(frequency*milliseconds)/1000);
    }
    CleanupBudget(long now,long end,long ticksPerSecond) { Guard.Require(ticksPerSecond>0&&end>=now,"Invalid pure clock");pure=true;fakeNow=now;deadline=end;frequency=ticksPerSecond; }
    public static CleanupBudget PureFixture(long now,long end,long ticksPerSecond) { return new CleanupBudget(now,end,ticksPerSecond); }
    public void AdvancePureTicks(long ticks) { Guard.Require(pure&&ticks>=0,"Only forward pure clock changes allowed");fakeNow=checked(fakeNow+ticks); }
    public bool IsPureFixture { get { return pure; } }
    public int RemainingMs {
      get { long left=deadline-(pure?fakeNow:Stopwatch.GetTimestamp());if(left<=0)return 0;
        return (int)Math.Min(10000,checked(left*1000)/frequency); }
    }
    public int WaitCap(int maximum) { Guard.Require(maximum>=0&&maximum<=10000,"Invalid finite wait cap");return Math.Min(maximum,RemainingMs); }
    public void RequireNativeBudget() { Guard.Require(!pure,"Pure fixture budget cannot authorize native operations"); }
  }
  public sealed class ReaderState {
    readonly object gate=new object();readonly List<string> errors=new List<string>();
    bool started,ready,stopped,joined,closeRequested,released,resourcesReleased;int operations,droppedErrors;
    public void BeginOperation(bool requireOpen) { lock(gate) { Guard.Require(!released&&(!requireOpen||!closeRequested),"Reader closing/released");operations++; } }
    public void EndOperation() { lock(gate) { Guard.Require(operations>0,"Reader operation underflow");operations--; } }
    public void Start() { lock(gate) { Guard.Require(!started&&!closeRequested&&!released,"Reader already started/closed");started=true; } }
    public void PublishReady() { lock(gate)ready=true; }
    public void PublishStopped() { lock(gate)stopped=true; }
    public void ConfirmJoin() { lock(gate) { Guard.Require(stopped,"Cannot join before stopped publication");joined=true; } }
    public void RequestClose() { lock(gate)closeRequested=true; }
    public bool CloseRequested { get { lock(gate)return closeRequested; } }
    public bool Ready { get { lock(gate)return ready; } }
    public bool Released { get { lock(gate)return released; } }
    public bool ResourcesReleased { get { lock(gate)return resourcesReleased; } }
    public int DroppedErrors { get { lock(gate)return droppedErrors; } }
    public void RecordError(string error) { lock(gate) { if(errors.Count<32)errors.Add((error??"unknown").Substring(0,Math.Min(4096,(error??"unknown").Length)));else droppedErrors++; } }
    public string[] Errors { get { lock(gate)return errors.ToArray(); } }
    // Owner calls only after actual join; unstarted resources can close directly.
    public bool ClaimFinalization() {
      lock(gate) { if(resourcesReleased||!closeRequested||operations!=0||(started&&(!stopped||!joined)))return false;released=true;return true; }
    }
    public void ConfirmResourcesReleased() { lock(gate) { Guard.Require(released,"Finalization not claimed");resourcesReleased=true; } }
  }
  public interface IReturnedCloseOutcome { string ResourceLabel { get; }string CloseState { get; }string CloseDetail { get; } }
  public sealed class RollbackResourceReceipt {
    public int Index;public string Resource,State,Detail;public bool DisposeReturned;
  }
  public sealed class SetupFailureException : Exception {
    public readonly Exception Primary;public readonly RollbackResourceReceipt[] Rollback;
    public SetupFailureException(Exception primary,RollbackResourceReceipt[] receipts):base("Setup failed; rollback outcomes retained: "+primary.Message,primary) { Primary=primary;Rollback=receipts; }
  }
  public static class SetupRollback {
    // Retain the primary setup failure while attempting every allocated resource.
    public static Exception Release(Exception primary,params IDisposable[] resources) {
      Guard.Require(primary!=null&&resources!=null&&resources.Length<=8,"Bounded setup rollback required");
      var receipts=new List<RollbackResourceReceipt>();
      for(int i=resources.Length-1;i>=0;i--) {
        var receipt=new RollbackResourceReceipt { Index=i,Resource="resource["+i+"]",State=resources[i]==null?"NOT_ALLOCATED":"UNKNOWN" };
        receipts.Add(receipt);if(resources[i]==null)continue;
        try { resources[i].Dispose();receipt.DisposeReturned=true; }catch(Exception error) { receipt.State="DISPOSE_THREW";receipt.Detail=error.GetType().Name+":"+error.Message; }
        var native=resources[i] as IReturnedCloseOutcome;
        if(native!=null) { receipt.Resource=native.ResourceLabel;receipt.State=native.CloseState;receipt.Detail=native.CloseDetail; }
        else if(receipt.DisposeReturned)receipt.State="MANAGED_DISPOSE_RETURNED";
      }
      return new SetupFailureException(primary,receipts.ToArray());
    }
  }
  // This managed component is used by the actual pipe helper, not a test copy.
  public sealed class OwnedWorker {
    readonly object gate=new object();readonly ThreadStart body;Thread thread;
    bool closing,started,neverStart,joined;
    public OwnedWorker(ThreadStart work) { Guard.Require(work!=null,"Worker body required");body=work; }
    public void Start() {
      lock(gate) {
        Guard.Require(!closing&&!neverStart&&thread==null,"Worker closed/already started");
        thread=new Thread(body);thread.IsBackground=true;
        try { thread.Start();started=true; }catch { closing=true;neverStart=true;throw; }
      }
    }
    public void RequestClose() { lock(gate) { closing=true;if(thread==null)neverStart=true; } }
    public bool Join(int waitMs) {
      Guard.Require(waitMs>=0&&waitMs<=10000,"Bounded worker join required");Thread actual;
      lock(gate) { if(neverStart)return true;Guard.Require(started,"Worker not started or permanently closed");actual=thread; }
      bool ended=actual.Join(waitMs);if(ended)lock(gate)joined=true;return ended;
    }
    public bool TerminalProved { get { lock(gate)return neverStart||joined; } }
    public bool NeverStarted { get { lock(gate)return neverStart; } }
    public bool LiveStarted { get { lock(gate)return started&&!joined&&thread.IsAlive; } }
  }
  public sealed class ReaderStartupReceipt {
    public bool Ready,WorkerLive,ThreadHandleOwned,Closing,DeadlineExpired;public string[] Errors;public int DroppedErrors;
    public bool Succeeded { get { return Ready&&WorkerLive&&ThreadHandleOwned&&!Closing&&!DeadlineExpired&&Errors!=null&&Errors.Length==0&&DroppedErrors==0; } }
  }
  public sealed class ResumeGate {
    bool committed;
    public void Commit(ReaderStartupReceipt output,ReaderStartupReceipt error,Action resume) {
      Guard.Require(!committed&&output!=null&&error!=null&&output.Succeeded&&error.Succeeded&&resume!=null,"Both live owned readers must be ready before one Resume");
      resume();committed=true;
    }
  }
  public enum PipeReadAction { Data,NoData,Eof,Failure }
  public static class PipeReadPolicy {
    public static PipeReadAction Classify(bool succeeded,UInt32 count,int error) {
      if(!succeeded)return error==109?PipeReadAction.Eof:PipeReadAction.Failure;
      if(count>4096)return PipeReadAction.Failure;
      return count==0?PipeReadAction.NoData:PipeReadAction.Data;
    }
  }
  public enum DrainRecovery { Idle, ContinuedOwned, UnsafeIdentity, NativeFailure, Exhausted }
  public sealed class DrainStep {
    public bool EventSeen,ExitContinued,Ok=true;public string Error;
    public DrainRecovery Recovery;
    public bool MayKeepDraining { get { return Recovery==DrainRecovery.Idle||Recovery==DrainRecovery.ContinuedOwned; } }
  }
  // Cleanup only. There is no normal-loader-breakpoint policy or Run entry.
  public sealed class CleanupDebugDrain : IDisposable {
    readonly UInt32 pid,ownerThread;readonly IntPtr buffer;readonly object gate=new object();int events,exceptions;bool disposed;
    public readonly List<Dictionary<string,object>> Ledger=new List<Dictionary<string,object>>();
    public bool ExitContinued { get;private set; }
    public CleanupDebugDrain(UInt32 ownedPid,UInt32 creatingOsThread) {
      Guard.Require(ownedPid>0&&creatingOsThread>0,"Actual owned PID/creating OS thread required");
      pid=ownedPid;ownerThread=creatingOsThread;buffer=Marshal.AllocHGlobal(Abi.DebugEventBytes);
    }
    internal void TransferContinuedExit(bool verifiedNormalExit) { Guard.Require(!disposed&&Ledger.Count==0,"Exit handoff must precede cleanup events");ExitContinued=verifiedNormalExit; }
    public static UInt32 CleanupContinuation(UInt32 eventCode) { Guard.Require(eventCode>=1&&eventCode<=9,"Unsupported event");return eventCode==1?Native.NotHandled:Native.Continue; }
    public DrainStep Pump(CleanupBudget budget) { lock(gate)return PumpLocked(budget); }
    DrainStep PumpLocked(CleanupBudget budget) {
      budget.RequireNativeBudget();Guard.Require(!disposed,"Drain disposed");
      if(Native.GetCurrentThreadId()!=ownerThread)return new DrainStep { Ok=false,Recovery=DrainRecovery.UnsafeIdentity,Error="Wrong creating OS thread" };
      int wait=budget.WaitCap(25);if(wait==0)return new DrainStep { Ok=false,Recovery=DrainRecovery.Exhausted,Error="Cleanup deadline exhausted" };
      if(events>=2048)return new DrainStep { Ok=false,Recovery=DrainRecovery.Exhausted,Error="Cleanup event cap exceeded" };
      Marshal.Copy(new byte[Abi.DebugEventBytes],0,buffer,Abi.DebugEventBytes);
      bool received=Native.WaitForDebugEventEx(buffer,(UInt32)wait);int waitError=Marshal.GetLastWin32Error();
      if(!received)return new DrainStep { Ok=waitError==Native.ErrorSemTimeout,Recovery=waitError==Native.ErrorSemTimeout?DrainRecovery.Idle:DrainRecovery.NativeFailure,Error=waitError==Native.ErrorSemTimeout?null:"WaitForDebugEventEx:"+waitError };
      events++;var bytes=new byte[Abi.DebugEventBytes];Marshal.Copy(buffer,bytes,0,bytes.Length);
      UInt32 tag=BitConverter.ToUInt32(bytes,0),eventPid=BitConverter.ToUInt32(bytes,4),tid=BitConverter.ToUInt32(bytes,8);
      var step=new DrainStep { EventSeen=true,Recovery=DrainRecovery.ContinuedOwned };
      // An unexpected event is retained, never used to control a foreign identity.
      if(eventPid!=pid||tid==0||tag<1||tag>9) {
        Ledger.Add(new Dictionary<string,object>{{"eventCode",tag},{"pid",eventPid},{"tid",tid},{"expectedPid",pid},{"untrustedHeader",true},{"rawHex",BitConverter.ToString(bytes).Replace("-","").ToLowerInvariant()},{"continued",false}});
        return new DrainStep { EventSeen=true,Ok=false,Recovery=DrainRecovery.UnsafeIdentity,Error="Unexpected cleanup event header retained; no foreign control" };
      }
      Dictionary<string,object> record;
      try { record=Abi.Decode(bytes,pid); }
      catch(Exception error) { record=new Dictionary<string,object>{{"eventCode",tag},{"pid",pid},{"tid",tid},{"decodeError",error.Message}};step.Ok=false;step.Error="Cleanup decode failed"; }
      if(tag==1&&++exceptions>128) { step.Ok=false;step.Error="Cleanup exception cap exceeded"; }
      // Every owned pending event is continued, including a rejected payload.
      UInt32 continuation=CleanupContinuation(tag);record["continuation"]=continuation;
      if(record.ContainsKey("fileHandle")) {
        UInt64 raw=(UInt64)record["fileHandle"];
        if(raw!=0&&raw!=UInt64.MaxValue) {
          bool closed=Native.CloseHandle(new IntPtr(unchecked((long)raw)));int closeError=Marshal.GetLastWin32Error();
          record["imageHandleClosed"]=closed;if(!closed) { step.Ok=false;step.Error="Close debug image handle:"+closeError; }
        }
      }
      bool continued=Native.ContinueDebugEvent(pid,tid,continuation);int continueError=Marshal.GetLastWin32Error();
      record["continued"]=continued;record["continueError"]=continued?0:continueError;
      Ledger.Add(record);
      if(!continued) { step.Ok=false;step.Recovery=DrainRecovery.NativeFailure;step.Error="ContinueDebugEvent:"+continueError; }
      if(tag==5&&continued) { ExitContinued=true;step.ExitContinued=true; }
      return step;
    }
    public void Dispose() { lock(gate) { if(disposed)return;disposed=true;Marshal.FreeHGlobal(buffer); } }
  }
}
