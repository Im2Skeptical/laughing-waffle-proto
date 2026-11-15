using System;
using System.IO;
using System.Text;
using System.Diagnostics;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using NativeCapturePrototype;
using NativeCaptureRepair;

namespace NativeCaptureController {
  internal sealed class EventSession : IDisposable {
    readonly OwnedTarget target;readonly CaptureFacts facts;readonly List<string> errors;
    readonly IntPtr buffer;readonly UInt64 loaderRva;readonly string ntdllPath;
    UInt64 remoteLoader;bool created,disposed;int exceptionCount;
    internal readonly List<Dictionary<string,object>> Ledger=new List<Dictionary<string,object>>();
    internal readonly Dictionary<string,object> LoaderIdentity=new Dictionary<string,object>();
    internal Dictionary<string,object> PhaseWitness;
    internal bool ExitContinued { get { return facts.ExitContinued; } }
    internal EventSession(OwnedTarget root,CaptureFacts outcome,List<string> failures,string expectedNtdllHash) {
      target=root;facts=outcome;errors=failures;
      ntdllPath=Policy.CanonicalImage(Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.System),"ntdll.dll"));
      Guard.Require(Guard.Sha256(ntdllPath)==expectedNtdllHash,"Pinned ntdll changed");
      IntPtr module=Api.GetModuleHandleW("ntdll.dll"),function=Api.GetProcAddress(module,"DbgBreakPoint");
      Guard.Require(module!=IntPtr.Zero&&function!=IntPtr.Zero,"Loader export unavailable");
      loaderRva=checked((UInt64)(function.ToInt64()-module.ToInt64()));Guard.Require(loaderRva>0&&loaderRva<16777216,"Loader RVA outside bounded image");
      LoaderIdentity["path"]=ntdllPath;LoaderIdentity["sha256"]=expectedNtdllHash;LoaderIdentity["export"]= "DbgBreakPoint";LoaderIdentity["rvaHex"]=Policy.Hex(loaderRva);
      buffer=Marshal.AllocHGlobal(Abi.DebugEventBytes);
    }
    void Failure(string error,bool unsafeRecovery) {
      facts.ObserverError=true;facts.UnsafeRecovery|=unsafeRecovery;if(errors.Count<32)errors.Add((error??"error").Substring(0,Math.Min(4096,(error??"error").Length)));
    }
    internal void Observe(FrozenControl c,DescendantWitness descendant) {
      var watch=Stopwatch.StartNew();int workMs=c.Mode=="timeout"?1000:10000;
      while(!facts.ExitContinued&&!facts.Overflow&&!facts.UnsafeRecovery) {
        if(watch.ElapsedMilliseconds>=workMs) { facts.TimedOut=true;break; }
        descendant.Poll();
        if(watch.ElapsedMilliseconds>=workMs) { facts.TimedOut=true;break; }
        if(Policy.InjectAfterPoll(c.Mode,descendant.Verified)) {
          PhaseWitness=new Dictionary<string,object>{{"phase","VERIFIED_DESCENDANT_BEFORE_WAIT"},{"eventCount",Ledger.Count},{"descendantPid",descendant.Pid},{"elapsedMs",watch.ElapsedMilliseconds.ToString(System.Globalization.CultureInfo.InvariantCulture)}};
          Failure("CONTROL_ONLY_OBSERVER_FAILURE_AFTER_REGISTRATION",false);break;
        }
        if(Ledger.Count>=2048) { facts.Overflow=true;break; }
        if(Native.GetCurrentThreadId()!=target.CreatingThread) { Failure("Normal loop changed OS thread",true);break; }
        int wait=(int)Math.Min(25,workMs-watch.ElapsedMilliseconds);if(wait<=0) { facts.TimedOut=true;break; }
        Marshal.Copy(new byte[Abi.DebugEventBytes],0,buffer,Abi.DebugEventBytes);
        bool got=Native.WaitForDebugEventEx(buffer,(UInt32)wait);int waitError=Marshal.GetLastWin32Error();
        if(!got) { if(waitError==121)continue;Failure("WaitForDebugEventEx:"+waitError,true);break; }
        var bytes=new byte[Abi.DebugEventBytes];Marshal.Copy(buffer,bytes,0,bytes.Length);
        UInt32 tag=BitConverter.ToUInt32(bytes,0),pid=BitConverter.ToUInt32(bytes,4),tid=BitConverter.ToUInt32(bytes,8);
        if(pid!=target.Pid||tid==0||tag<1||tag>9) {
          Ledger.Add(new Dictionary<string,object>{{"eventCode",tag},{"pid",pid},{"tid",tid},{"untrustedHeader",true},{"rawHex",BitConverter.ToString(bytes).Replace("-","").ToLowerInvariant()},{"continued",false}});
          Failure("Untrusted normal event retained, no foreign control",true);break;
        }
        Dictionary<string,object> record;
        try { record=Abi.Decode(bytes,target.Pid); }
        catch(Exception error) { record=new Dictionary<string,object>{{"eventCode",tag},{"pid",pid},{"tid",tid},{"rawHex",BitConverter.ToString(bytes).Replace("-","").ToLowerInvariant()},{"decodeError",error.Message}};Failure("Event decoding rejected",false); }
        if(tag==3)created=true;
        UInt32 continuation=Native.Continue;
        if(record.ContainsKey("fileHandle")) {
          UInt64 raw=(UInt64)record["fileHandle"];
          if(raw!=0&&raw!=UInt64.MaxValue) {
            IntPtr handle=new IntPtr(unchecked((long)raw));
            try {
              var path=new StringBuilder(32768);UInt32 count=Native.GetFinalPathNameByHandleW(handle,path,(UInt32)path.Capacity,0);int pathError=Marshal.GetLastWin32Error();
              if(count>0&&count<path.Capacity) {
                string image=Policy.CanonicalImage(path.ToString());record["imagePath"]=image;
                if(String.Equals(image,ntdllPath,StringComparison.OrdinalIgnoreCase)&&record.ContainsKey("imageBase")) {
                  UInt64 imageBase=(UInt64)record["imageBase"];remoteLoader=checked(imageBase+loaderRva);LoaderIdentity["baseHex"]=Policy.Hex(imageBase);LoaderIdentity["expectedAddressHex"]=Policy.Hex(remoteLoader);LoaderIdentity["moduleEventIndex"]=Ledger.Count;
                }
              }else record["imagePathUnavailable"]=pathError;
            }catch(Exception error) { Failure("Module identity:"+error.Message,false); }
            finally { bool closed=Native.CloseHandle(handle);int closeError=Marshal.GetLastWin32Error();record["imageHandleClosed"]=closed;if(!closed)Failure("Close debug image handle:"+closeError,false); }
          }
        }
        if(tag==1) {
          exceptionCount++;if(exceptionCount>128)facts.Overflow=true;
          if(record.ContainsKey("exceptionCode")) {
            UInt32 code=(UInt32)record["exceptionCode"],chance=(UInt32)record["firstChance"],flags=(UInt32)record["exceptionFlags"],count=(UInt32)record["parameterCount"];
            continuation=Policy.Continuation(tag,code,chance,(UInt64)record["exceptionAddress"],remoteLoader,created,facts.LoaderBreakpoint,tid,target.Tid);
            if(continuation==Native.Continue)facts.LoaderBreakpoint=true;
            if(Policy.IsFatalNative(code,flags,chance,count))facts.MatchingFatalRecords++;
          }else continuation=Native.NotHandled;
        }
        bool continued=Native.ContinueDebugEvent(pid,tid,continuation);int continueError=Marshal.GetLastWin32Error();
        record["continuation"]=continuation;record["continued"]=continued;record["continueError"]=continued?0:continueError;
        Ledger.Add(record);if(!continued) { Failure("Normal ContinueDebugEvent:"+continueError,true);break; }
        if(tag==5) { facts.ExitContinued=true;facts.ExitCode=(UInt32)record["exitCode"]; }
      }
    }
    public void Dispose() { if(disposed)return;disposed=true;Marshal.FreeHGlobal(buffer); }
  }
}
