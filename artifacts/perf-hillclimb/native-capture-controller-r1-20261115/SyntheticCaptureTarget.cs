// Test-only target source. No invocation/admission is implied by this file.
using System;
using System.IO;
using System.Text;
using System.Threading;
using System.Diagnostics;
using System.Reflection;
using System.Runtime.InteropServices;

namespace NativeCaptureSynthetic {
  [StructLayout(LayoutKind.Sequential)] struct ExceptionRecord64 {
    public UInt32 code,flags;public UInt64 nested,address;public UInt32 count;
    public UInt64 p0,p1,p2,p3,p4,p5,p6,p7,p8,p9,p10,p11,p12,p13,p14;
  }
  static class Target {
    [DllImport("kernel32.dll",ExactSpelling=true)] [return:MarshalAs(UnmanagedType.Bool)]static extern bool IsDebuggerPresent();
    [DllImport("kernel32.dll",ExactSpelling=true)] static extern void RaiseFailFastException(ref ExceptionRecord64 record,IntPtr context,UInt32 flags);
    [DllImport("kernel32.dll",ExactSpelling=true,CharSet=CharSet.Unicode)]static extern IntPtr GetModuleHandleW(string name);
    [DllImport("kernel32.dll",ExactSpelling=true,CharSet=CharSet.Ansi)]static extern IntPtr GetProcAddress(IntPtr module,string name);
    static string Quote(string value) {
      var b=new StringBuilder("\"");int slashes=0;foreach(char c in value) {
        if(c=='\\') { slashes++;continue; }b.Append('\\',c=='"'?slashes*2+1:slashes);b.Append(c);slashes=0;
      }b.Append('\\',slashes*2);return b.Append('"').ToString();
    }
    static void Save(string root,string file,string text) {
      using(var stream=new FileStream(Path.Combine(root,file),FileMode.CreateNew,FileAccess.Write,FileShare.Read)) {
        byte[] bytes=new UTF8Encoding(false).GetBytes(text);stream.Write(bytes,0,bytes.Length);stream.Flush();
      }
    }
    static string Identity() {
      using(var process=Process.GetCurrentProcess())return "{\"pid\":"+process.Id+",\"createdFileTimeUtc\":\""+process.StartTime.ToUniversalTime().ToFileTimeUtc()+"\",\"debuggerPresent\":"+(IsDebuggerPresent()?"true":"false")+"}";
    }
    static int Child(string mode,string root) {
      Save(root,"descendant-identity.json",Identity());
      if(mode=="descendant-wait")Thread.Sleep(Timeout.Infinite);
      var ready=Stopwatch.StartNew();while(!File.Exists(Path.Combine(root,"descendant-verified.signal"))&&ready.ElapsedMilliseconds<5000)Thread.Sleep(10);
      if(!File.Exists(Path.Combine(root,"descendant-verified.signal")))return 92;
      return 0;
    }
    static int WithDescendant(string mode,string root) {
      var info=new ProcessStartInfo(Assembly.GetExecutingAssembly().Location,
        Quote(mode=="descendant"?"descendant-normal":"descendant-wait")+" "+Quote(root));
      info.UseShellExecute=false;info.CreateNoWindow=true;
      using(var child=Process.Start(info)) {
        if(child==null)throw new InvalidOperationException("Synthetic descendant not created");
        // This retained Process instance owns its actual creation/exit observation.
        Save(root,"descendant-registration.json","{\"parentPid\":"+Process.GetCurrentProcess().Id+",\"childPid\":"+child.Id+",\"createdFileTimeUtc\":\""+child.StartTime.ToUniversalTime().ToFileTimeUtc()+"\"}");
        if(mode=="descendant") {
          if(!child.WaitForExit(5000))throw new InvalidOperationException("Synthetic child did not finish");
          Save(root,"descendant-awaited.json","{\"childPid\":"+child.Id+",\"exitCode\":"+child.ExitCode+"}");return child.ExitCode;
        }
        // Timeout/observer-failure controls require controller-owned job teardown.
        Thread.Sleep(Timeout.Infinite);return 90;
      }
    }
    public static int Main(string[] args) {
      try {
        if(IntPtr.Size!=8||args.Length!=2)throw new InvalidOperationException("Exact x64 mode/root arguments required");
        string mode=args[0],root=Path.GetFullPath(args[1]);
        if(!Path.IsPathRooted(args[1])||!Directory.Exists(root))throw new InvalidOperationException("Registered control root missing");
        if(mode=="descendant-normal"||mode=="descendant-wait")return Child(mode,root);
        if(mode!="normal"&&mode!="nonzero"&&mode!="synthetic-native"&&mode!="timeout"&&mode!="descendant"&&mode!="observer-failure")throw new InvalidOperationException("Unknown synthetic mode");
        Save(root,"target-identity.json",Identity());
        if(mode=="normal") { Console.Out.Write("capture-normal\n");Console.Error.Write("capture-stderr\n");return 0; }
        if(mode=="nonzero")return 23;
        if(mode=="synthetic-native") {
          IntPtr address=GetProcAddress(GetModuleHandleW("kernel32.dll"),"RaiseFailFastException");
          if(address==IntPtr.Zero)throw new InvalidOperationException("Synthetic exception address unavailable");
          var record=new ExceptionRecord64 { code=0xc0000409,flags=1,address=unchecked((UInt64)address.ToInt64()),count=2,p0=0x50455246,p1=7 };
          RaiseFailFastException(ref record,IntPtr.Zero,0);return 88;
        }
        return WithDescendant(mode,root);
      }catch(Exception error) { Console.Error.Write("SYNTHETIC_FIXTURE_ERROR:"+error.GetType().Name+":"+error.Message+"\n");return 91; }
    }
  }
}
