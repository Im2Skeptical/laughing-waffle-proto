using System;
using System.IO;
using System.Text;
using System.Diagnostics;
using System.Threading;
using System.Runtime.InteropServices;
using System.Web.Script.Serialization;

namespace NativeTrialSynthetic {
  public sealed class Identity { public int Pid,ReportedParent;public string Role,CreatedFileTimeUtc,Image;public bool DebuggerPresent; }
  public sealed class Daemon { public int Pid;public string CreatedFileTimeUtc,Image; }
  public sealed class Request { public int RequestorPid,Sequence; }
  public sealed class Reply { public int DaemonPid,RequestorPid,Sequence;public string CreatedFileTimeUtc; }
  public static class Target {
    [DllImport("kernel32.dll",ExactSpelling=true)] [return:MarshalAs(UnmanagedType.Bool)]static extern bool IsDebuggerPresent();
    static readonly JavaScriptSerializer json=new JavaScriptSerializer { MaxJsonLength=8192,RecursionLimit=8 };
    static string root,self;static int pid;
    static void Save(string name,object value) {
      if(Path.GetFileName(name)!=name)throw new InvalidOperationException("Owned filename required");
      string final=Path.Combine(root,name),temporary=final+".pid-"+pid+".tmp";byte[] bytes=new UTF8Encoding(false,true).GetBytes(json.Serialize(value));if(bytes.Length>8192)throw new InvalidOperationException("Synthetic receipt overflow");
      using(var stream=new FileStream(temporary,FileMode.CreateNew,FileAccess.Write,FileShare.None))stream.Write(bytes,0,bytes.Length);
      File.Move(temporary,final);
    }
    static T Read<T>(string name) {
      string file=Path.Combine(root,name);using(var stream=new FileStream(file,FileMode.Open,FileAccess.Read,FileShare.Read)) {
        var bytes=new byte[8193];int count=0,n;while(count<bytes.Length&&(n=stream.Read(bytes,count,bytes.Length-count))>0)count+=n;
        if(count>8192)throw new InvalidOperationException("Synthetic input overflow");return json.Deserialize<T>(new UTF8Encoding(false,true).GetString(bytes,0,count));
      }
    }
    static void Await(string name,int maximum) { var clock=Stopwatch.StartNew();while(!File.Exists(Path.Combine(root,name))) { if(clock.ElapsedMilliseconds>=maximum)throw new TimeoutException("Missing synthetic receipt:"+name);Thread.Sleep(5); } }
    static Process Start(string role) {
      var start=new ProcessStartInfo(self,role+" \""+root+"\" "+pid) { UseShellExecute=false,CreateNoWindow=true,WorkingDirectory=root };
      var process=Process.Start(start);if(process==null)throw new InvalidOperationException("Synthetic child creation unavailable");
      Save("start-"+role+".json",new { ParentPid=pid,ChildPid=process.Id,ChildCreatedFileTimeUtc=process.StartTime.ToUniversalTime().ToFileTimeUtc().ToString(),Image=self });return process;
    }
    static void RequireDaemon(Daemon daemon) {
      using(var process=Process.GetProcessById(daemon.Pid))if(process.HasExited||process.StartTime.ToUniversalTime().ToFileTimeUtc().ToString()!=daemon.CreatedFileTimeUtc||!String.Equals(process.MainModule.FileName,self,StringComparison.OrdinalIgnoreCase))throw new InvalidOperationException("Synthetic daemon generation/image/liveness mismatch");
    }
    static int DaemonMain() {
      var identity=Process.GetCurrentProcess();var daemon=new Daemon { Pid=pid,CreatedFileTimeUtc=identity.StartTime.ToUniversalTime().ToFileTimeUtc().ToString(),Image=self };Save("daemon-ready.json",daemon);
      var clock=Stopwatch.StartNew();bool replied=false;
      while(clock.ElapsedMilliseconds<20000) {
        if(!replied&&File.Exists(Path.Combine(root,"reuse-request.json"))) { var request=Read<Request>("reuse-request.json");if(request.Sequence!=2||request.RequestorPid<=0)throw new InvalidOperationException("Unexpected reuse request");Save("reuse-reply.json",new Reply { DaemonPid=pid,RequestorPid=request.RequestorPid,Sequence=2,CreatedFileTimeUtc=daemon.CreatedFileTimeUtc });replied=true; }
        Thread.Sleep(5);
      }
      return 96; // Fallback is an explicit failed lifetime cell, never successful cleanup.
    }
    static int FirstHelper() {
      using(var daemon=Start("daemon")) { Await("daemon-ready.json",3000);var ready=Read<Daemon>("daemon-ready.json");if(ready.Pid!=daemon.Id)throw new InvalidOperationException("Started daemon differs");RequireDaemon(ready);Save("helper-first-return.json",new { HelperPid=pid,DaemonPid=ready.Pid,ready.CreatedFileTimeUtc,DaemonAlive=true });return 0; }
    }
    static int SecondHelper() {
      var daemon=Read<Daemon>("daemon-ready.json");RequireDaemon(daemon);Save("reuse-request.json",new Request { RequestorPid=pid,Sequence=2 });Await("reuse-reply.json",3000);var reply=Read<Reply>("reuse-reply.json");
      if(reply.DaemonPid!=daemon.Pid||reply.CreatedFileTimeUtc!=daemon.CreatedFileTimeUtc||reply.RequestorPid!=pid||reply.Sequence!=2)throw new InvalidOperationException("Daemon reuse reply mismatch");RequireDaemon(daemon);Save("helper-second-return.json",new { HelperPid=pid,DaemonPid=daemon.Pid,daemon.CreatedFileTimeUtc,DaemonAlive=true,Sequence=2 });return 0;
    }
    static int RootMain(bool fail) {
      int firstPid;using(var first=Start("helper-first")) { firstPid=first.Id;if(!first.WaitForExit(3000)||first.ExitCode!=0)throw new InvalidOperationException("First helper did not return0"); }
      var daemon=Read<Daemon>("daemon-ready.json");RequireDaemon(daemon);Save("between-helpers.json",new { RootPid=pid,FirstHelperPid=firstPid,FirstHelperExitCode=0,DaemonPid=daemon.Pid,daemon.CreatedFileTimeUtc,DaemonAlive=true });
      if(fail) { Save("prefix-outcome.json",new { RootPid=pid,ExpectedExitCode=23,Completed=false,AfterFirstReturn=true,DaemonPid=daemon.Pid,daemon.CreatedFileTimeUtc,DaemonAlive=true });return 23; }
      Thread.Sleep(100);int secondPid;using(var second=Start("helper-second")) { secondPid=second.Id;if(!second.WaitForExit(3000)||second.ExitCode!=0)throw new InvalidOperationException("Second helper did not return0"); }
      RequireDaemon(daemon);Save("prefix-outcome.json",new { RootPid=pid,ExpectedExitCode=0,Completed=true,AfterFirstReturn=true,SecondHelperPid=secondPid,DaemonPid=daemon.Pid,daemon.CreatedFileTimeUtc,DaemonAlive=true });return 0;
    }
    public static int Main(string[] args) {
      if(args.Length<2||args.Length>3)return 90;
      try {
        string role=args[0];if(role!="reuse"&&role!="fail-after-first"&&role!="helper-first"&&role!="helper-second"&&role!="daemon")return 91;
        root=Path.GetFullPath(args[1]);if(!Path.IsPathRooted(args[1])||root.IndexOf('"')>=0||root.EndsWith("\\",StringComparison.Ordinal)||root.EndsWith("/",StringComparison.Ordinal)||!Directory.Exists(root)||!String.Equals(Path.GetFullPath(Environment.CurrentDirectory),root,StringComparison.OrdinalIgnoreCase))return 92;
        self=System.Reflection.Assembly.GetExecutingAssembly().Location;pid=Process.GetCurrentProcess().Id;int parent=args.Length==3?Int32.Parse(args[2]):0;
        Save("identity-"+pid+".json",new Identity { Pid=pid,ReportedParent=parent,Role=role,CreatedFileTimeUtc=Process.GetCurrentProcess().StartTime.ToUniversalTime().ToFileTimeUtc().ToString(),Image=self,DebuggerPresent=IsDebuggerPresent() });
        if(!IsDebuggerPresent())return 94;
        if(role=="daemon")return DaemonMain();if(role=="helper-first")return FirstHelper();if(role=="helper-second")return SecondHelper();return RootMain(role=="fail-after-first");
      }catch(Exception error) { try { Save("target-error-"+pid+".json",new { Error=error.GetType().Name,Message=error.Message }); }catch { }return 95; }
    }
  }
}
