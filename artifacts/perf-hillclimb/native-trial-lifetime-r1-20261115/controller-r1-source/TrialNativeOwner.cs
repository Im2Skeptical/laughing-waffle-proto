using System;
using System.IO;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Collections.Generic;
using NativeCapturePrototype;
using NativeCaptureController;
using NativeCaptureRepair;

namespace NativeTrialLifetime {
  // Source-only owner; no entry point/admission/config/runner yet. Construction
  // itself calls native and MUST NOT occur before complete independent admission.
  internal sealed class TrialNativeOwner : ITrialOwner {
    readonly IProcessLaunch launch;readonly string runRoot;readonly FrozenLoader loader;readonly long executableBytes;readonly UInt32 ownerThread;
    readonly Stopwatch work=new Stopwatch();readonly TrialStartup startup=new TrialStartup();readonly List<string> errors=new List<string>();
    readonly List<RollbackResourceReceipt> rollback=new List<RollbackResourceReceipt>();
    RepairedJob job;RepairedPipe stdout,stderr;OwnedResource stdin;OwnedTarget target;
    TrialNativeEventCalls events;TrialTreeEvents tree;TrialStreams streams;CleanupBudget finalBudget;
    bool initialized,aborted,released,jobClosed,bufferReleased;
    internal TrialNativeOwner(IProcessLaunch frozenLaunch,string ownedRoot,long frozenExecutableBytes,FrozenLoader frozenLoader) {
      Guard.Require(frozenLaunch!=null&&frozenLoader!=null&&frozenExecutableBytes>0&&frozenExecutableBytes<=16777216,"Frozen launch/loader/self byte size required");
      launch=frozenLaunch;runRoot=Guard.Absolute(ownedRoot);Guard.Require(String.Equals(runRoot,Guard.Absolute(launch.Cwd),StringComparison.OrdinalIgnoreCase),"Trial root/cwd differs");
      loader=frozenLoader;executableBytes=frozenExecutableBytes;ownerThread=Native.GetCurrentThreadId();
    }
    public void RequireCreatingThread() { Guard.Require(Native.GetCurrentThreadId()==ownerThread,"Trial owner moved creating OS thread"); }
    void Error(string text) { if(errors.Count<32)errors.Add(text.Substring(0,Math.Min(4096,text.Length))); }
    void Shared(CleanupBudget budget) { RequireCreatingThread();Guard.Require(finalBudget!=null&&Object.ReferenceEquals(finalBudget,budget),"Cleanup budget replaced/reset");budget.RequireNativeBudget(); }
    public TrialStartup Startup { get { return startup; } }
    public TrialTreeEvents Tree { get { return tree; } }
    public long WorkElapsedMs { get { return work.ElapsedMilliseconds; } }
    void UpdateStartup() {
      if(target==null)return;startup.RootPid=target.Pid;startup.PrimaryTid=target.Tid;startup.CreatingThread=target.CreatingThread;startup.Created=target.Created;startup.AssignedBeforeResume=target.Assigned;startup.Resumed=target.Resumed;startup.Image=target.Image;startup.CreatedFileTimeHex=Policy.Hex(target.CreatedFileTime);
    }
    public void Initialize() {
      RequireCreatingThread();Guard.Require(!initialized,"Owner initialized twice");initialized=true;
      Guard.Require(DateTime.UtcNow<DateTime.Parse("2026-11-16T01:45:00Z",System.Globalization.CultureInfo.InvariantCulture,System.Globalization.DateTimeStyles.AdjustToUniversal),"Native leaf cutoff reached");
      try {
        job=new RepairedJob();stdout=new RepairedPipe(1048576);stderr=new RepairedPipe(1048576);
        var attributes=new SecurityAttributes { bytes=(UInt32)Marshal.SizeOf(typeof(SecurityAttributes)),inherit=true,descriptor=IntPtr.Zero };
        stdin=new OwnedResource(IntPtr.Zero,"stdin.NUL");IntPtr nul=Native.CreateFileW("NUL",0x80000000,3,ref attributes,3,0x80,IntPtr.Zero);int nulError=Marshal.GetLastWin32Error();
        if(nul==new IntPtr(-1))throw SetupRollback.Release(new InvalidOperationException("Create NUL stdin:"+nulError),stdin);stdin.Adopt(nul);
        target=new OwnedTarget();target.Create(launch,job,stdout,stderr,stdin);UpdateStartup();startup.IdentityVerified=true;
        // Tree exists before readers/resume, so a reader startup failure can still
        // drain a created, assigned suspended root through the same dispatcher.
        var processCalls=new TrialNativeProcessCalls(job,launch.Executable,launch.ExecutableHash,executableBytes);
        events=new TrialNativeEventCalls(target,loader);tree=new TrialTreeEvents(target.Pid,runRoot,launch.Executable,launch.ExecutableHash,loader.ImagePath,(string)loader.Evidence()["sha256"],loader.TrapRva,processCalls,events);
        var startupBudget=new CleanupBudget(10000);stdout.StartReader(startupBudget);stderr.StartReader(startupBudget);
        startup.Stdout=stdout.StartupStatus(startupBudget);startup.Stderr=stderr.StartupStatus(startupBudget);
        new ResumeGate().Commit(startup.Stdout,startup.Stderr,target.Resume);UpdateStartup();work.Start();
      }catch(Exception error) { var setup=error as SetupFailureException;if(setup!=null)rollback.AddRange(setup.Rollback);Error("Initialize:"+error.GetType().Name+":"+error.Message);throw; }
      finally { UpdateStartup(); }
    }
    public bool Pump(int milliseconds) { RequireCreatingThread();Guard.Require(tree!=null,"Tree unavailable");return tree.Pump(milliseconds); }
    public CleanupBudget BeginCleanup() { RequireCreatingThread();Guard.Require(finalBudget==null,"Final budget created twice");finalBudget=new CleanupBudget(10000);return finalBudget; }
    public TrialTermination Terminate(CleanupBudget budget) { Shared(budget);return job==null?new TrialTermination { RemainingBeforeMs=budget.RemainingMs,RemainingAfterMs=budget.RemainingMs,ExitCode=0xe0000001 }:job.TerminateTrial(budget); }
    public TrialJobQuery Query(CleanupBudget budget) { Shared(budget);return job==null?new TrialJobQuery { RemainingBeforeMs=budget.RemainingMs,RemainingMs=budget.RemainingMs }:job.QueryTrial(budget); }
    public ProcessWaitReceipt ExtraRootWait(CleanupBudget budget) { Shared(budget);Guard.Require(target!=null,"Root unavailable");return target.ObserveExit(budget,1000,"additional-root-post-continued-EXIT"); }
    public TrialStreams FinishStreams(CleanupBudget budget) {
      Shared(budget);Guard.Require(!aborted&&streams==null&&tree!=null&&tree.Book.AllExitsContinued&&!tree.UnsafePending,"All debug EXITs must continue before EOF wait");
      streams=new TrialStreams();if(stdout!=null)streams.Stdout=stdout.Finish(budget);if(stderr!=null)streams.Stderr=stderr.Finish(budget);return streams;
    }
    public void AbortStreams() {
      RequireCreatingThread();aborted=true;
      // Non-blocking Dispose requests/owned writer closes only. Never await EOF
      // while a debug event is unresolved; incomplete reader needs host exit.
      foreach(IDisposable resource in new IDisposable[]{stdout,stderr})if(resource!=null)try { resource.Dispose(); }catch(Exception error) { Error("Abort stream:"+error.Message); }
    }
    public TrialOwnerRelease ReleaseRoot(CleanupBudget budget) {
      Shared(budget);Guard.Require(!released,"Root resources already released");released=true;bool clean=true;
      foreach(IDisposable resource in new IDisposable[]{stdout,stderr,stdin,target})if(resource!=null)try { resource.Dispose(); }catch(Exception error) { clean=false;Error("Root release:"+error.Message); }
      clean&=(target==null||target.Closed)&&(stdin==null||stdin.IsInvalid||stdin.CloseSucceeded==true);
      return new TrialOwnerRelease { Confirmed=clean,Evidence=new Dictionary<string,object>{{"target",target==null?null:target.HandleEvidence},{"stdin",stdin==null?null:stdin.Evidence()},{"errors",errors.ToArray()}} };
    }
    public bool ReleaseEventBuffer() { RequireCreatingThread();if(events!=null)events.Dispose();bufferReleased=events==null||events.Released;return bufferReleased; }
    public TrialOwnerRelease CloseJob() {
      RequireCreatingThread();Guard.Require(!jobClosed,"Job close repeated");jobClosed=true;if(job!=null)job.Dispose();return new TrialOwnerRelease { Confirmed=job!=null&&job.CloseConfirmed,Evidence=job==null?null:job.CloseEvidence };
    }
    public bool SourceStable() {
      using(var file=new FileStream(launch.Executable,FileMode.Open,FileAccess.Read,FileShare.Read)) {
        Guard.Require(file.Length==executableBytes,"Selected self executable size changed");
        using(var hash=System.Security.Cryptography.SHA256.Create())return BitConverter.ToString(hash.ComputeHash(file)).Replace("-","").ToLowerInvariant()==launch.ExecutableHash;
      }
    }
    public bool HostExitRequired { get { return errors.Count>0||!released||!bufferReleased||!jobClosed||target==null||!target.Closed||streams==null||!streams.Complete||tree==null||tree.UnsafePending||!tree.Book.AllExitsContinued||job==null||!job.CloseConfirmed; } }
    public Dictionary<string,object> Evidence { get { return new Dictionary<string,object>{{"ownerThread",ownerThread},{"startup",startup},{"targetHandles",target==null?null:target.HandleEvidence},{"additionalRootWaits",target==null?null:target.Waits},{"recoveryCalls",target==null?null:target.RecoveryCalls},{"stdin",stdin==null?null:stdin.Evidence()},{"jobClose",job==null?null:job.CloseEvidence},{"errors",errors.ToArray()},{"rollback",rollback},{"nonBlockingAbortRequested",aborted},{"eventBufferReleased",bufferReleased},{"hostExitRequired",HostExitRequired},{"scope","Native owner SOURCE ONLY until complete independent admission; unknown/unsafe cleanup requires supervised host exit, never proof of job zero/EOF."}}; } }
  }
}
