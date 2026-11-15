using System;
using System.Text;
using System.IO;
using System.Runtime.InteropServices;
using System.Collections.Generic;
using NativeCapturePrototype;
using NativeCaptureRepair;

namespace NativeCaptureController {
  public static class SupervisorFailsafe {
    public static bool StopExactHost(UInt32 pid,UInt64 expectedCreated,string expectedImage) {
      IntPtr raw=Api.OpenProcess(0x00101001,false,pid);int openError=Marshal.GetLastWin32Error();
      if(raw==IntPtr.Zero)throw new InvalidOperationException("Open owned supervisor host:"+openError);
      using(var process=new OwnedResource(raw))using(var lease=new HandleLease(process)) {
        Guard.Require(Api.GetProcessId(lease.Value)==pid,"Failsafe PID mismatch");
        FileTimePair created,exited,kernel,user;bool timed=Native.GetProcessTimes(lease.Value,out created,out exited,out kernel,out user);int timeError=Marshal.GetLastWin32Error();
        if(!timed)throw new InvalidOperationException("Failsafe process times:"+timeError);
        Guard.Require((((UInt64)created.high<<32)|created.low)==expectedCreated,"Failsafe creation mismatch; no termination");
        var image=new StringBuilder(32768);UInt32 size=(UInt32)image.Capacity;bool named=Native.QueryFullProcessImageNameW(lease.Value,0,image,ref size);int imageError=Marshal.GetLastWin32Error();
        if(!named)throw new InvalidOperationException("Failsafe image:"+imageError);
        Guard.Require(String.Equals(Policy.CanonicalImage(image.ToString()),Policy.CanonicalImage(expectedImage),StringComparison.OrdinalIgnoreCase),"Failsafe image mismatch; no termination");
        if(Native.WaitForSingleObject(lease.Value,0)==0)return true;
        bool killed=Native.TerminateProcess(lease.Value,0xe0000003);int killError=Marshal.GetLastWin32Error();if(!killed)throw new InvalidOperationException("Exact host termination:"+killError);
        return Native.WaitForSingleObject(lease.Value,5000)==0;
      }
    }
  }
  internal static class Api {
    [DllImport("kernel32.dll",ExactSpelling=true,SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)]internal static extern bool GetExitCodeProcess(IntPtr process,out UInt32 code);
    [DllImport("kernel32.dll",ExactSpelling=true)]internal static extern UInt32 GetProcessId(IntPtr process);
    [DllImport("kernel32.dll",ExactSpelling=true,CharSet=CharSet.Unicode)]internal static extern IntPtr GetModuleHandleW(string name);
    [DllImport("kernel32.dll",ExactSpelling=true,CharSet=CharSet.Ansi)]internal static extern IntPtr GetProcAddress(IntPtr module,string name);
    [DllImport("kernel32.dll",ExactSpelling=true,SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)]internal static extern bool IsProcessInJob(IntPtr process,IntPtr job,[MarshalAs(UnmanagedType.Bool)]out bool member);
    [DllImport("kernel32.dll",ExactSpelling=true,SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)]internal static extern bool DebugActiveProcessStop(UInt32 pid);
    [DllImport("kernel32.dll",ExactSpelling=true,SetLastError=true)]internal static extern IntPtr OpenProcess(UInt32 access,[MarshalAs(UnmanagedType.Bool)]bool inherit,UInt32 pid);
  }
  internal sealed class AttributeHandles : IDisposable {
    IntPtr list,values;bool initialized,disposed;
    internal IntPtr Pointer { get { Guard.Require(!disposed&&initialized,"Attribute list unavailable");return list; } }
    internal AttributeHandles(IntPtr stdin,IntPtr stdout,IntPtr stderr) {
      UIntPtr size=UIntPtr.Zero;
      bool first=Native.InitializeProcThreadAttributeList(IntPtr.Zero,1,0,ref size);int firstError=Marshal.GetLastWin32Error();
      Guard.Require(!first&&firstError==122&&size.ToUInt64()>0&&size.ToUInt64()<=65536,"Unexpected attribute allocation query");
      try {
        list=Marshal.AllocHGlobal((int)size.ToUInt64());
        bool second=Native.InitializeProcThreadAttributeList(list,1,0,ref size);int secondError=Marshal.GetLastWin32Error();
        if(!second)throw new InvalidOperationException("InitializeProcThreadAttributeList:"+secondError);initialized=true;
        values=Marshal.AllocHGlobal(3*IntPtr.Size);Marshal.WriteIntPtr(values,0,stdin);Marshal.WriteIntPtr(values,IntPtr.Size,stdout);Marshal.WriteIntPtr(values,2*IntPtr.Size,stderr);
        bool updated=Native.UpdateProcThreadAttribute(list,0,Native.HandleListAttribute,values,new UIntPtr((uint)(3*IntPtr.Size)),IntPtr.Zero,IntPtr.Zero);int updateError=Marshal.GetLastWin32Error();
        if(!updated)throw new InvalidOperationException("UpdateProcThreadAttribute:"+updateError);
      }catch { Dispose();throw; }
    }
    public void Dispose() {
      if(disposed)return;disposed=true;
      try { if(initialized)Native.DeleteProcThreadAttributeList(list); }
      finally { if(values!=IntPtr.Zero)Marshal.FreeHGlobal(values);if(list!=IntPtr.Zero)Marshal.FreeHGlobal(list); }
    }
  }
  internal sealed class OwnedTarget : IDisposable {
    internal readonly OwnedResource Process,Thread;
    internal UInt32 Pid,Tid,CreatingThread;internal UInt64 CreatedFileTime;internal string Image;
    internal bool Created,Assigned,Resumed;
    internal OwnedTarget() { Process=new OwnedResource(IntPtr.Zero);Thread=new OwnedResource(IntPtr.Zero); }
    internal void Create(FrozenControl c,RepairedJob job,RepairedPipe output,RepairedPipe error,OwnedResource stdin) {
      CreatingThread=Native.GetCurrentThreadId();
      using(var inLease=new HandleLease(stdin))using(var outLease=output.LeaseWriter())using(var errorLease=error.LeaseWriter())
      using(var attributes=new AttributeHandles(inLease.Value,outLease.Value,errorLease.Value)) {
        var startup=new StartupInfoEx64();startup.startup.cb=(UInt32)Marshal.SizeOf(typeof(StartupInfoEx64));startup.startup.flags=0x100;
        startup.startup.stdInput=inLease.Value;startup.startup.stdOutput=outLease.Value;startup.startup.stdError=errorLease.Value;startup.attributes=attributes.Pointer;
        ProcessInformation64 info;
        bool made=Native.CreateProcessW(c.Executable,new StringBuilder(c.CommandLine),IntPtr.Zero,IntPtr.Zero,true,
          Native.DebugOnlyThisProcess|Native.CreateSuspended|Native.ExtendedStartupInfo|Native.CreateNoWindow,IntPtr.Zero,c.Cwd,ref startup,out info);
        int createError=Marshal.GetLastWin32Error();if(!made)throw new InvalidOperationException("CreateProcessW:"+createError);
        // Wrappers are preallocated, so no managed wrapper allocation can orphan these outputs.
        Process.Adopt(info.process);Pid=info.processId;Tid=info.threadId;Created=true;Thread.Adopt(info.thread);
      }
      output.CloseObserverWriter();error.CloseObserverWriter();stdin.Dispose();
      using(var process=new HandleLease(Process)) {
        Guard.Require(Pid>0&&Tid>0&&Api.GetProcessId(process.Value)==Pid,"Creation PID mismatch");
        var image=new StringBuilder(32768);UInt32 count=(UInt32)image.Capacity;
        bool named=Native.QueryFullProcessImageNameW(process.Value,0,image,ref count);int imageError=Marshal.GetLastWin32Error();
        if(!named)throw new InvalidOperationException("QueryFullProcessImageName:"+imageError);
        Image=Policy.CanonicalImage(image.ToString());Guard.Require(String.Equals(Image,Policy.CanonicalImage(c.Executable),StringComparison.OrdinalIgnoreCase),"Actual executable differs");
        FileTimePair created,exited,kernel,user;bool timed=Native.GetProcessTimes(process.Value,out created,out exited,out kernel,out user);int timeError=Marshal.GetLastWin32Error();
        if(!timed)throw new InvalidOperationException("GetProcessTimes:"+timeError);CreatedFileTime=((UInt64)created.high<<32)|created.low;
      }
      Guard.Require(Guard.Sha256(c.Executable)==c.ExecutableHash,"Executable changed during creation");
      job.AssignSuspended(Process);Assigned=true;
      bool killPolicy=Native.DebugSetProcessKillOnExit(true);int policyError=Marshal.GetLastWin32Error();if(!killPolicy)throw new InvalidOperationException("DebugSetProcessKillOnExit:"+policyError);
    }
    internal void Resume() {
      Guard.Require(Created&&Assigned&&!Resumed&&Native.GetCurrentThreadId()==CreatingThread,"Resume ownership/state mismatch");
      using(var thread=new HandleLease(Thread)) { UInt32 previous=Native.ResumeThread(thread.Value);int error=Marshal.GetLastWin32Error();if(previous!=1)throw new InvalidOperationException("ResumeThread previous="+previous+":error="+error); }
      Resumed=true;
    }
    internal bool ExitObserved() { using(var lease=new HandleLease(Process))return Native.WaitForSingleObject(lease.Value,0)==0; }
    internal bool OwnedStopAndDetach(CleanupBudget budget,List<string> errors) {
      budget.RequireNativeBudget();if(!Created)return true;
      using(var process=new HandleLease(Process)) {
        if(Native.WaitForSingleObject(process.Value,0)==0)return true;
        bool killed=Native.TerminateProcess(process.Value,0xe0000002);int killError=Marshal.GetLastWin32Error();errors.Add("Owned failsafe termination:"+killed+":"+killError);
        // Only this debugger's creation PID is detached; no attach/image-name operation.
        bool detached=Api.DebugActiveProcessStop(Pid);int detachError=Marshal.GetLastWin32Error();errors.Add("Owned debug detach after termination:"+detached+":"+detachError);
        int wait=budget.WaitCap(1000);return wait>0&&Native.WaitForSingleObject(process.Value,(UInt32)wait)==0;
      }
    }
    public void Dispose() { Thread.Dispose();Process.Dispose(); }
    internal bool Closed { get { return (!Created)||(Thread.CloseSucceeded==true&&Process.CloseSucceeded==true); } }
  }
}
