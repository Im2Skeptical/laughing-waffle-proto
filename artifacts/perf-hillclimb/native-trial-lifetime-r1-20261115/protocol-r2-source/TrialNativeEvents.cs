using System;
using System.IO;
using System.Text;
using System.Security.Cryptography;
using System.Runtime.InteropServices;
using System.Collections.Generic;
using NativeCapturePrototype;
using NativeCaptureController;
using NativeCaptureRepair;

namespace NativeTrialLifetime {
  // Declaration/implementation source only until COMPLETE independent source gate.
  internal sealed class TrialNativeEventCalls : ITrialEventCalls,IDisposable {
    readonly OwnedTarget root;readonly string ntdll,ntdllSha;readonly long ntdllBytes;readonly IntPtr buffer;bool disposed;
    internal TrialNativeEventCalls(OwnedTarget target,FrozenLoader loader) {
      Guard.Require(target!=null&&loader!=null&&target.Created,"Created root/frozen loader required");root=target;RequireCreatingThread();
      ntdll=loader.ImagePath;ntdllSha=(string)loader.Evidence()["sha256"];ntdllBytes=new FileInfo(ntdll).Length;
      Guard.Require(ntdllBytes>0&&ntdllBytes<=16777216,"Bounded frozen loader file required");buffer=Marshal.AllocHGlobal(Abi.DebugEventBytes);
    }
    public void RequireCreatingThread() { Guard.Require(!disposed&&Native.GetCurrentThreadId()==root.CreatingThread,"Tree debug operation changed creating OS thread/owner"); }
    public UInt64[] RootLiveOwned() { RequireCreatingThread();return root.LiveOwnedRaw(); }
    public void BindRootCreate(Dictionary<string,object> record) { RequireCreatingThread();root.BindDebugCreate(record); }
    public void ConfirmRootExit() { RequireCreatingThread();root.ConfirmDebugExit(); }
    public TrialImageReceipt ReadAndCloseImage(UInt64 raw) {
      RequireCreatingThread();Guard.Require(raw!=0&&raw!=UInt64.MaxValue,"Image hFile required");
      var r=new TrialImageReceipt { Handle=Policy.Hex(raw) };IntPtr handle=new IntPtr(unchecked((long)raw));
      try {
        var path=new StringBuilder(32768);UInt32 count=Native.GetFinalPathNameByHandleW(handle,path,(UInt32)path.Capacity,0);int error=Marshal.GetLastWin32Error();
        r.PathResult=count;r.PathRawLastError=error;r.PathErrorValid=count==0;r.PathAvailable=count>0&&count<path.Capacity;
        if(r.PathAvailable) {
          r.Path=Policy.CanonicalImage(path.ToString());
          if(String.Equals(r.Path,ntdll,StringComparison.OrdinalIgnoreCase))using(var stream=new FileStream(ntdll,FileMode.Open,FileAccess.Read,FileShare.Read)) {
            Guard.Require(stream.Length==ntdllBytes,"Loader PE byte size changed");
            using(var hash=SHA256.Create())r.Sha256=BitConverter.ToString(hash.ComputeHash(stream)).Replace("-","").ToLowerInvariant();
            Guard.Require(r.Sha256==ntdllSha,"Loader PE hash changed");
          }
        }
      }catch(Exception error) { r.Error=error.GetType().Name+":"+error.Message; }
      finally { bool ok=Native.CloseHandle(handle);int error=Marshal.GetLastWin32Error();r.Close=BoolNativeReceipt.From("debug.image.CloseHandle",ok,error); }
      return r;
    }
    public StartupPhaseReceipt ProbeStartup(string rootPath,UInt32 pid,bool created,bool module,bool first) { RequireCreatingThread();return StartupPhaseReceipt.Probe(rootPath,pid,created,module,first); }
    public BoolNativeReceipt Continue(UInt32 pid,UInt32 tid,UInt32 disposition) {
      RequireCreatingThread();bool ok=Native.ContinueDebugEvent(pid,tid,disposition);int error=Marshal.GetLastWin32Error();return BoolNativeReceipt.From("tree.ContinueDebugEvent",ok,error);
    }
    public TrialDebugWait Wait(int milliseconds) {
      RequireCreatingThread();Guard.Require(milliseconds>0&&milliseconds<=25,"Bounded tree debug poll required");
      Marshal.Copy(new byte[Abi.DebugEventBytes],0,buffer,Abi.DebugEventBytes);
      bool ok=Native.WaitForDebugEventEx(buffer,(UInt32)milliseconds);int error=Marshal.GetLastWin32Error();
      var r=new TrialDebugWait { RequestedMs=milliseconds,Call=BoolNativeReceipt.From("tree.WaitForDebugEventEx",ok,error) };
      if(ok) { r.Bytes=new byte[Abi.DebugEventBytes];Marshal.Copy(buffer,r.Bytes,0,r.Bytes.Length); }return r;
    }
    public void Dispose() { if(disposed)return;RequireCreatingThread();disposed=true;Marshal.FreeHGlobal(buffer); }
    internal bool Released { get { return disposed; } }
  }
}
