using System;
using System.Collections.Generic;
using NativeCapturePrototype;
using NativeCaptureController;

namespace NativeTrialLifetime {
  public sealed class TrialTargetOutcome {
    public string Classification="INCOMPLETE";public UInt32 RootPid,FirstHelperPid,SecondHelperPid,DaemonPid;public bool LinkedExpectedOutcome;
    public readonly List<string> Errors=new List<string>();
    static Dictionary<string,object> File(Dictionary<string,TrialOriginalFile> files,string name,params string[] keys) {
      Guard.Require(files.ContainsKey(name),"Missing original:"+name);var f=files[name];Guard.Require(f!=null&&f.Error==null&&f.Values!=null&&f.Bytes>0&&f.Bytes<=8192&&f.Sha256!=null&&f.Sha256.Length==64,"Invalid original:"+name);
      Guard.Require(f.Name==name&&f.Values.Count==keys.Length,"Original name/schema differs:"+name);foreach(string key in keys)Guard.Require(f.Values.ContainsKey(key),"Original key missing:"+name+":"+key);return f.Values;
    }
    static UInt32 U(Dictionary<string,object> f,string key) { Guard.Require(f[key] is UInt32,"Unsigned target scalar required:"+key);return (UInt32)f[key]; }
    static string S(Dictionary<string,object> f,string key) { Guard.Require(f[key] is string,"String target scalar required:"+key);return (string)f[key]; }
    static void Yes(Dictionary<string,object> f,string key,bool expected=true) { Guard.Require(f[key] is bool&&(bool)f[key]==expected,"Target boolean differs:"+key); }
    static UInt64 Time(Dictionary<string,object> f,string key) { UInt64 n=0;string s=S(f,key);Guard.Require(s.Length>0&&s[0]!='0'&&UInt64.TryParse(s,System.Globalization.NumberStyles.None,System.Globalization.CultureInfo.InvariantCulture,out n),"Lossless positive decimal FILETIME required");return n; }
    static void DaemonFields(Dictionary<string,object> f,UInt32 daemon,UInt64 created) { Guard.Require(U(f,"DaemonPid")==daemon&&Time(f,"CreatedFileTimeUtc")==created,"Daemon generation differs");Yes(f,"DaemonAlive"); }
    static int EventIndex(TrialControlResult c,UInt32 pid,UInt32 tag) { int index=-1;for(int n=0;n<c.Tree.Ledger.Count;n++){var e=c.Tree.Ledger[n];if(e.ContainsKey("pid")&&(UInt32)e["pid"]==pid&&(UInt32)e["eventCode"]==tag){Guard.Require(index<0&&e.ContainsKey("continued")&&(bool)e["continued"],"Unique continued native event required");index=n;}}Guard.Require(index>=0,"Native event missing");return index; }
    static void Start(Dictionary<string,TrialOriginalFile> files,string role,UInt32 parent,UInt32 child,UInt64 created,string image) { var f=File(files,"start-"+role+".json","ParentPid","ChildPid","ChildCreatedFileTimeUtc","Image");Guard.Require(U(f,"ParentPid")==parent&&U(f,"ChildPid")==child&&Time(f,"ChildCreatedFileTimeUtc")==created&&String.Equals(Policy.CanonicalImage(S(f,"Image")),image,StringComparison.OrdinalIgnoreCase),"Start receipt linkage differs:"+role); }
    public static TrialTargetOutcome Classify(string mode,TrialControlResult c,Dictionary<string,TrialOriginalFile> files) {
      var r=new TrialTargetOutcome();
      try {
        Guard.Require(mode=="reuse"||mode=="fail-after-first","Unknown lifetime mode");Guard.Require(c!=null&&c.ContainmentComplete,"Native containment state incomplete");Guard.Require(files!=null&&files.Count<=64,"Original target file inventory absent/excess");
        foreach(var e in c.Tree.Ledger)if(e.ContainsKey("eventCode")&&(UInt32)e["eventCode"]==1&&e.ContainsKey("firstChance")&&(UInt32)e["firstChance"]==0)Guard.Require((UInt32)e["exceptionCode"]!=0xc0000409&&((UInt32)e["exceptionFlags"]&1)==0,"Unexpected second-chance native/noncontinuable record retained");
        var roles=new Dictionary<string,UInt32>(StringComparer.Ordinal);r.RootPid=c.Startup.RootPid;int expected=mode=="reuse"?4:3;Guard.Require(c.Tree.Book.ProcessCount==expected,"Unexpected native process population");string image=Policy.CanonicalImage(c.Startup.Image);
        foreach(var pair in files)Guard.Require(pair.Value!=null&&pair.Value.Error==null&&!pair.Key.StartsWith("target-error-",StringComparison.Ordinal)&&pair.Key.EndsWith(".json",StringComparison.Ordinal),"Failed/temporary/error target original:"+pair.Key);
        foreach(UInt32 pid in c.Tree.ProcessOrder) {
          var f=File(files,"identity-"+pid+".json","Pid","ReportedParent","Role","CreatedFileTimeUtc","Image","DebuggerPresent");var native=c.Tree.Binding(pid).Identity;string role=S(f,"Role");
          Guard.Require(U(f,"Pid")==pid&&pid>0&&pid<=Int32.MaxValue&&native!=null&&Time(f,"CreatedFileTimeUtc")==native.CreatedFileTime&&String.Equals(Policy.CanonicalImage(S(f,"Image")),native.Image,StringComparison.OrdinalIgnoreCase),"Native/target identity differs");Yes(f,"DebuggerPresent");
          Guard.Require(!roles.ContainsKey(role)&&(role==mode||role=="helper-first"||role=="helper-second"||role=="daemon"),"Duplicate/unknown target role");roles.Add(role,pid);
        }
        Guard.Require(roles.ContainsKey(mode)&&roles[mode]==r.RootPid&&roles.ContainsKey("helper-first")&&roles.ContainsKey("daemon")&&(mode=="reuse"?roles.ContainsKey("helper-second"):!roles.ContainsKey("helper-second")),"Required target role population differs");
        r.FirstHelperPid=roles["helper-first"];r.DaemonPid=roles["daemon"];if(mode=="reuse")r.SecondHelperPid=roles["helper-second"];
        UInt64 daemonTime=c.Tree.Binding(r.DaemonPid).Identity.CreatedFileTime;
        foreach(var pair in roles) { var f=files["identity-"+pair.Value+".json"].Values;UInt32 parent=pair.Key==mode?0:pair.Key=="daemon"?r.FirstHelperPid:r.RootPid;Guard.Require(U(f,"ReportedParent")==parent,"Reported parent differs"); }
        Start(files,"helper-first",r.RootPid,r.FirstHelperPid,c.Tree.Binding(r.FirstHelperPid).Identity.CreatedFileTime,image);Start(files,"daemon",r.FirstHelperPid,r.DaemonPid,daemonTime,image);
        var ready=File(files,"daemon-ready.json","Pid","CreatedFileTimeUtc","Image");Guard.Require(U(ready,"Pid")==r.DaemonPid&&Time(ready,"CreatedFileTimeUtc")==daemonTime&&String.Equals(Policy.CanonicalImage(S(ready,"Image")),image,StringComparison.OrdinalIgnoreCase),"Daemon ready native identity differs");
        var first=File(files,"helper-first-return.json","HelperPid","DaemonPid","CreatedFileTimeUtc","DaemonAlive");Guard.Require(U(first,"HelperPid")==r.FirstHelperPid,"First helper return differs");DaemonFields(first,r.DaemonPid,daemonTime);
        var between=File(files,"between-helpers.json","RootPid","FirstHelperPid","FirstHelperExitCode","DaemonPid","CreatedFileTimeUtc","DaemonAlive");Guard.Require(U(between,"RootPid")==r.RootPid&&U(between,"FirstHelperPid")==r.FirstHelperPid&&U(between,"FirstHelperExitCode")==0,"Between-helper linkage differs");DaemonFields(between,r.DaemonPid,daemonTime);
        string[] prefixKeys=mode=="reuse"?new[]{"RootPid","ExpectedExitCode","Completed","AfterFirstReturn","SecondHelperPid","DaemonPid","CreatedFileTimeUtc","DaemonAlive"}:new[]{"RootPid","ExpectedExitCode","Completed","AfterFirstReturn","DaemonPid","CreatedFileTimeUtc","DaemonAlive"};
        var outcome=File(files,"prefix-outcome.json",prefixKeys);Guard.Require(U(outcome,"RootPid")==r.RootPid&&U(outcome,"ExpectedExitCode")== (mode=="reuse"?0u:23u),"Root declared outcome differs");Yes(outcome,"Completed",mode=="reuse");Yes(outcome,"AfterFirstReturn");DaemonFields(outcome,r.DaemonPid,daemonTime);
        Guard.Require(c.Tree.Book.Life(r.RootPid).ExitCode==(mode=="reuse"?0u:23u)&&c.Tree.Book.Life(r.FirstHelperPid).ExitCode==0&&c.Tree.Book.Life(r.DaemonPid).ExitCode==0xe0000001,"Unexpected native root/helper/daemon exit (fallback96 is failure)");
        int rootCreate=EventIndex(c,r.RootPid,3),firstCreate=EventIndex(c,r.FirstHelperPid,3),daemonCreate=EventIndex(c,r.DaemonPid,3),firstExit=EventIndex(c,r.FirstHelperPid,5),rootExit=EventIndex(c,r.RootPid,5),daemonExit=EventIndex(c,r.DaemonPid,5);
        Guard.Require(rootCreate<firstCreate&&firstCreate<daemonCreate&&daemonCreate<firstExit&&firstExit<rootExit&&rootExit<daemonExit,"Native lifetime event order differs");
        if(mode=="reuse") {
          Start(files,"helper-second",r.RootPid,r.SecondHelperPid,c.Tree.Binding(r.SecondHelperPid).Identity.CreatedFileTime,image);Guard.Require(U(outcome,"SecondHelperPid")==r.SecondHelperPid&&c.Tree.Book.Life(r.SecondHelperPid).ExitCode==0,"Second helper outcome differs");
          int secondCreate=EventIndex(c,r.SecondHelperPid,3),secondExit=EventIndex(c,r.SecondHelperPid,5);Guard.Require(firstExit<secondCreate&&secondCreate<secondExit&&secondExit<rootExit,"Second helper native interval differs");
          var request=File(files,"reuse-request.json","RequestorPid","Sequence");Guard.Require(U(request,"RequestorPid")==r.SecondHelperPid&&U(request,"Sequence")==2,"Reuse request differs");
          var reply=File(files,"reuse-reply.json","DaemonPid","RequestorPid","Sequence","CreatedFileTimeUtc");Guard.Require(U(reply,"DaemonPid")==r.DaemonPid&&U(reply,"RequestorPid")==r.SecondHelperPid&&U(reply,"Sequence")==2&&Time(reply,"CreatedFileTimeUtc")==daemonTime,"SAME daemon reply differs");
          var second=File(files,"helper-second-return.json","HelperPid","DaemonPid","CreatedFileTimeUtc","DaemonAlive","Sequence");Guard.Require(U(second,"HelperPid")==r.SecondHelperPid&&U(second,"Sequence")==2,"Second helper return differs");DaemonFields(second,r.DaemonPid,daemonTime);
        }
        Guard.Require(files.Count==(mode=="reuse"?14:9),"Unexpected/missing extra target original file");
        r.LinkedExpectedOutcome=true;r.Classification=mode=="reuse"?"SYNTHETIC_SAME_DAEMON_REUSE_LINKED":"SYNTHETIC_FAILURE_AFTER_FIRST_RETURN_LINKED";
      }catch(Exception error) { r.Errors.Add(error.GetType().Name+":"+error.Message); }
      return r;
    }
  }
}
