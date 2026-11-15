using System;
using System.Text;
using System.Runtime.InteropServices;
using System.Collections.Generic;
using NativeCapturePrototype;
using NativeCaptureController;
using NativeCaptureRepair;

namespace NativeTrialLifetime {
  // Source only until COMPLETE source admission. Constructor itself calls native.
  internal sealed class TrialNativeProcessCalls : ITrialProcessCalls {
    readonly UInt32 creatingThread;readonly RepairedJob job;
    readonly Dictionary<UInt64,OwnedResource> owned=new Dictionary<UInt64,OwnedResource>();
    readonly List<OwnedResource> ambiguous=new List<OwnedResource>();int totalProduced;
    internal TrialNativeProcessCalls(RepairedJob retainedJob) { Guard.Require(retainedJob!=null,"Retained trial job required");job=retainedJob;creatingThread=Native.GetCurrentThreadId(); }
    static UInt64 Raw(IntPtr handle) { return unchecked((UInt64)handle.ToInt64()); }
    static IntPtr Handle(UInt64 raw) { return new IntPtr(unchecked((long)raw)); }
    public void RequireCreatingThread() { Guard.Require(Native.GetCurrentThreadId()==creatingThread,"Tree ownership moved OS thread"); }
    public TrialProcessProbe Probe(UInt64 process,UInt64 thread) {
      RequireCreatingThread();Guard.Require(process!=0&&process!=UInt64.MaxValue&&thread!=0&&thread!=UInt64.MaxValue,"Native probe handle missing");
      // System handles are borrowed only while the matching debug event is pending.
      var r=new TrialProcessProbe();IntPtr p=Handle(process),t=Handle(thread);
      r.Pid=Api.GetProcessId(p);r.PidRawError=Marshal.GetLastWin32Error();
      r.Tid=Api.GetThreadId(t);r.TidRawError=Marshal.GetLastWin32Error();
      r.ThreadPid=Api.GetProcessIdOfThread(t);r.ThreadPidRawError=Marshal.GetLastWin32Error();
      FileTimePair created,exited,kernel,user;bool timed=Native.GetProcessTimes(p,out created,out exited,out kernel,out user);int timeError=Marshal.GetLastWin32Error();r.Times=BoolNativeReceipt.From("CREATE.identity.times",timed,timeError);
      if(timed)r.CreatedFileTime=((UInt64)created.high<<32)|created.low;
      var image=new StringBuilder(32768);UInt32 count=(UInt32)image.Capacity;bool named=Native.QueryFullProcessImageNameW(p,0,image,ref count);int imageError=Marshal.GetLastWin32Error();r.ImageQuery=BoolNativeReceipt.From("CREATE.identity.image",named,imageError);
      if(named) { r.Image=Policy.CanonicalImage(image.ToString());r.ImageSha256=Guard.Sha256(r.Image); }
      UInt16 processMachine,nativeMachine;bool architecture=Api.IsWow64Process2(p,out processMachine,out nativeMachine);int architectureError=Marshal.GetLastWin32Error();r.Architecture=BoolNativeReceipt.From("CREATE.identity.architecture",architecture,architectureError);r.ProcessMachine=processMachine;r.NativeMachine=nativeMachine;
      r.Membership=job.ProbeBorrowedMembership(p);return r;
    }
    public TrialDuplicate Duplicate(UInt64 source,UInt64[] otherLive) {
      RequireCreatingThread();Guard.Require(otherLive!=null&&otherLive.Length<=514&&totalProduced<16,"Bounded native duplicate inventory required");
      // Allocate wrapper before native output can be produced.
      var resource=new OwnedResource(IntPtr.Zero,"CREATE_EVENT.wait-duplicate");IntPtr made;
      bool ok=ExtraNative.DuplicateHandle(ExtraNative.GetCurrentProcess(),Handle(source),ExtraNative.GetCurrentProcess(),out made,0,false,2);int error=Marshal.GetLastWin32Error();
      var r=new TrialDuplicate { Source=source,Produced=Raw(made),Call=BoolNativeReceipt.From("CREATE.duplicate",ok,error),Inherit=false,SameAccess=true };
      if(ok) {
        totalProduced++;resource.Adopt(made);r.Alias=!HandleIndependence.CanOwn(source,r.Produced,otherLive)||owned.ContainsKey(r.Produced);
        if(r.Alias) { resource.AbandonAmbiguousAlias();ambiguous.Add(resource); }
        else owned.Add(r.Produced,resource);
      }else resource.Dispose();return r;
    }
    public ProcessWaitReceipt Wait(UInt64 duplicate,WaitSource identity,CleanupBudget budget,int maximum) {
      RequireCreatingThread();budget.RequireNativeBudget();Guard.Require(owned.ContainsKey(duplicate),"No retained CREATE duplicate");
      using(var lease=new HandleLease(owned[duplicate]))return ProcessWaitLogic.Observe(budget,maximum,"post-continued-EXIT",identity,ms=> { UInt32 status=Native.WaitForSingleObject(lease.Value,ms);int error=Marshal.GetLastWin32Error();return new NativeWaitOutcome { Status=status,RawLastError=error }; });
    }
    public TrialRelease Release(UInt64 duplicate) {
      RequireCreatingThread();Guard.Require(owned.ContainsKey(duplicate),"No independently owned duplicate to release");var resource=owned[duplicate];resource.Dispose();
      var result=new TrialRelease { Origin=resource.ResourceLabel,Handle=Policy.Hex(duplicate),State=resource.CloseState,Detail=resource.CloseDetail,Confirmed=resource.CloseSucceeded==true };
      if(result.Confirmed)owned.Remove(duplicate);return result;
    }
  }
}
