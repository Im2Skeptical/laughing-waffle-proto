using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using NativeCapturePrototype;
using NativeCaptureController;

namespace NativeTrialLifetime {
  public static class PureReportChecks {
    static readonly List<string> checks=new List<string>();static readonly JavaScriptSerializer json=new JavaScriptSerializer { MaxJsonLength=16777216,RecursionLimit=48 };
    static void Yes(string name,bool value) { if(!value)throw new Exception("FAIL:"+name);checks.Add(name); }
    static void Reject(string name,Action action) { bool no=false;try { action(); }catch { no=true; }Yes(name,no); }
    static byte[] Bytes(object value) { return new UTF8Encoding(false,true).GetBytes(json.Serialize(value)); }
    static Dictionary<string,TrialOriginalFile> Originals(TrialControlResult c,bool fail) {
      string mode=fail?"fail-after-first":"reuse";var files=new Dictionary<string,TrialOriginalFile>(StringComparer.Ordinal);
      Action<string,object> add=(name,value)=>files.Add(name,TrialOriginalFiles.Decode(name,Bytes(value)));
      foreach(UInt32 pid in c.Tree.ProcessOrder) { string role=pid==1?mode:pid==2?"helper-first":pid==3?"daemon":"helper-second";add("identity-"+pid+".json",new { Pid=pid,ReportedParent=pid==1?0:pid==3?2:1,Role=role,CreatedFileTimeUtc=(pid+1000).ToString(),Image=c.Startup.Image,DebuggerPresent=true }); }
      add("start-helper-first.json",new { ParentPid=1,ChildPid=2,ChildCreatedFileTimeUtc="1002",Image=c.Startup.Image });add("start-daemon.json",new { ParentPid=2,ChildPid=3,ChildCreatedFileTimeUtc="1003",Image=c.Startup.Image });
      add("daemon-ready.json",new { Pid=3,CreatedFileTimeUtc="1003",Image=c.Startup.Image });add("helper-first-return.json",new { HelperPid=2,DaemonPid=3,CreatedFileTimeUtc="1003",DaemonAlive=true });
      add("between-helpers.json",new { RootPid=1,FirstHelperPid=2,FirstHelperExitCode=0,DaemonPid=3,CreatedFileTimeUtc="1003",DaemonAlive=true });
      if(fail)add("prefix-outcome.json",new { RootPid=1,ExpectedExitCode=23,Completed=false,AfterFirstReturn=true,DaemonPid=3,CreatedFileTimeUtc="1003",DaemonAlive=true });
      else {
        add("start-helper-second.json",new { ParentPid=1,ChildPid=4,ChildCreatedFileTimeUtc="1004",Image=c.Startup.Image });add("reuse-request.json",new { RequestorPid=4,Sequence=2 });add("reuse-reply.json",new { DaemonPid=3,RequestorPid=4,Sequence=2,CreatedFileTimeUtc="1003" });
        add("helper-second-return.json",new { HelperPid=4,DaemonPid=3,CreatedFileTimeUtc="1003",DaemonAlive=true,Sequence=2 });add("prefix-outcome.json",new { RootPid=1,ExpectedExitCode=0,Completed=true,AfterFirstReturn=true,SecondHelperPid=4,DaemonPid=3,CreatedFileTimeUtc="1003",DaemonAlive=true });
      }
      return files;
    }
    public static string[] Run(string existingImage,string ownedIoRoot) {
      checks.Clear();var c=PureControllerChecks.Fixture(existingImage,false);var files=Originals(c,false);var o=TrialTargetOutcome.Classify("reuse",c,files);Yes("report-linked-virtual-SAME-daemon-reuse",o.LinkedExpectedOutcome&&o.DaemonPid==3&&o.SecondHelperPid==4);
      var fail=PureControllerChecks.Fixture(existingImage,true);Yes("report-linked-virtual-failure-after-first",TrialTargetOutcome.Classify("fail-after-first",fail,Originals(fail,true)).LinkedExpectedOutcome);
      foreach(string fault in new[]{"identity-pid","generation","parent","debugger","role","image","first-return","between-exit","daemon-alive","root-code","completed","second-pid","request-sequence","reply-generation","reply-pid","reply-requestor","second-return","start-child","start-generation","schema-extra","missing","extra","temporary","error-file","name","size","unreadable"}) {
        var f=Originals(c,false);string name="identity-3.json";string key="Pid";object value=(UInt32)99;
        switch(fault) {
          case "generation":key="CreatedFileTimeUtc";value="9007199254740993";break;case "parent":key="ReportedParent";value=(UInt32)1;break;case "debugger":key="DebuggerPresent";value=false;break;case "role":key="Role";value="helper-first";break;case "image":key="Image";value=Path.Combine(Path.GetDirectoryName(existingImage),"wrong.exe");break;
          case "first-return":name="helper-first-return.json";key="HelperPid";break;case "between-exit":name="between-helpers.json";key="FirstHelperExitCode";value=(UInt32)23;break;case "daemon-alive":name="prefix-outcome.json";key="DaemonAlive";value=false;break;
          case "root-code":name="prefix-outcome.json";key="ExpectedExitCode";value=(UInt32)23;break;case "completed":name="prefix-outcome.json";key="Completed";value=false;break;case "second-pid":name="prefix-outcome.json";key="SecondHelperPid";break;
          case "request-sequence":name="reuse-request.json";key="Sequence";value=(UInt32)1;break;case "reply-generation":name="reuse-reply.json";key="CreatedFileTimeUtc";value="1004";break;case "reply-pid":name="reuse-reply.json";key="DaemonPid";break;case "reply-requestor":name="reuse-reply.json";key="RequestorPid";break;
          case "second-return":name="helper-second-return.json";key="Sequence";value=(UInt32)1;break;case "start-child":name="start-daemon.json";key="ChildPid";break;case "start-generation":name="start-daemon.json";key="ChildCreatedFileTimeUtc";value="1004";break;
          case "schema-extra":key="Unexpected";value=true;break;
        }
        if(fault=="missing")f.Remove("reuse-reply.json");else if(fault=="extra"||fault=="temporary"||fault=="error-file") { string n=fault=="extra"?"identity-99.json":fault=="temporary"?"identity-3.json.pid-3.tmp":"target-error-3.json";f.Add(n,TrialOriginalFiles.Decode(n,Bytes(new { Error="fixture" }))); }
        else if(fault=="name")f[name].Name="identity-99.json";else if(fault=="size")f[name].Bytes=8193;else if(fault=="unreadable")f[name].Error="IOException:fixture";
        else { f[name].Values[key]=value;f[name]=TrialOriginalFiles.Decode(name,Bytes(f[name].Values)); }
        Yes("report-target-linkage-rejects-"+fault,!TrialTargetOutcome.Classify("reuse",c,f).LinkedExpectedOutcome);
      }
      foreach(string bad in new[]{"{\"a\":1,\"a\":2}","{\"a\":1,\"\\u0061\":2}","{\"a\":-1}","{\"a\":1.2}","{\"a\":01}","{\"a\":4294967296}","{\"a\":null}","{\"a\":[]}","{\"a\":{}}","{\"a\":true}x"})Reject("flat-parser-rejects-"+checks.Count,()=>TrialFlatJson.Parse(Encoding.UTF8.GetBytes(bad)));
      foreach(string bad in new[]{"{\"a\":\"\\z\"}","{\"a\":\"\\x61\"}","{\"a\":\"\\uZZZZ\"}","{\"a\":\"\\ud800\"}","{\"a\":\"\\udc00\"}","{\"a\":1,}","{\"a\":1e3}","{\"a\":+1}"})Reject("flat-parser-strict-escape-number-"+checks.Count,()=>TrialFlatJson.Parse(Encoding.UTF8.GetBytes(bad)));
      var paired=TrialFlatJson.Parse(Encoding.UTF8.GetBytes("{\"a\":\"\\ud83d\\ude00\"}"));Yes("flat-parser-valid-Unicode-surrogate-pair-preserved",(string)paired["a"]==Char.ConvertFromUtf32(0x1f600));
      var fatalCase=PureControllerChecks.Fixture(existingImage,false);var fatalRaw=PureTreeChecks.Event(1,1,0,0xc0000409);Buffer.BlockCopy(BitConverter.GetBytes((UInt32)0),0,fatalRaw,168,4);Buffer.BlockCopy(BitConverter.GetBytes((UInt32)1),0,fatalRaw,20,4);var fatal=Abi.Decode(fatalRaw,1);fatal["continued"]=true;fatal["continuation"]=Native.NotHandled;fatalCase.Tree.Ledger.Insert(3,fatal);Yes("report-unexpected-second-chance-native-kept-incomplete",!TrialTargetOutcome.Classify("reuse",fatalCase,Originals(fatalCase,false)).LinkedExpectedOutcome);
      Reject("flat-parser-invalid-UTF8",()=>TrialFlatJson.Parse(new byte[]{123,34,97,34,58,34,255,34,125}));Reject("flat-parser-byte-cap",()=>TrialFlatJson.Parse(new byte[8193]));
      var id=new TrialIdentity(1,101,134087812345678901UL,existingImage,new string('a',64),true,true);var projected=(Dictionary<string,object>)TrialProjection.Lossless(id);Yes("projection-FILETIME-above-2pow53-lossless-hex",(string)projected["CreatedFileTime"]==Policy.Hex(id.CreatedFileTime));
      Reject("projection-raw-bytes-not-implicitly-serialized",()=>TrialProjection.Lossless(new byte[]{1,2}));Reject("projection-unknown-POCO-rejected",()=>TrialProjection.Lossless(new object()));var cycle=new Dictionary<string,object>();cycle.Add("cycle",cycle);Reject("projection-cycle-rejected",()=>TrialProjection.Lossless(cycle));
      var report=TrialReport.Build("reuse",c,files);byte[] encoded=TrialReport.Json(report);Yes("report-bounded-explicit-projection-encodes",encoded.Length<TrialReport.ReportLimit&&(string)report["classification"]=="SYNTHETIC_SAME_DAEMON_REUSE_LINKED");
      Guard.Require(Directory.Exists(ownedIoRoot)&&Directory.GetFileSystemEntries(ownedIoRoot).Length==0,"Fresh managed IO fixture required");
      foreach(var pair in files)File.WriteAllBytes(Path.Combine(ownedIoRoot,pair.Key),Bytes(pair.Value.Values));var captured=TrialOriginalFiles.Capture(ownedIoRoot);Yes("report-actual-bounded-original-file-read-virtual-targets",captured.Count==14&&TrialTargetOutcome.Classify("reuse",c,captured).LinkedExpectedOutcome);
      Yes("report-actual-exclusive-raw-and-JSON-write",TrialReport.Save(ownedIoRoot,"reuse",c,captured)&&File.Exists(Path.Combine(ownedIoRoot,"stdout.raw"))&&File.Exists(Path.Combine(ownedIoRoot,"stderr.raw"))&&File.Exists(Path.Combine(ownedIoRoot,"result.json")));
      string originalHash=Guard.Sha256(Path.Combine(ownedIoRoot,"result.json"));Yes("report-never-overwrites-existing-evidence",!TrialReport.Save(ownedIoRoot,"reuse",c,captured)&&originalHash==Guard.Sha256(Path.Combine(ownedIoRoot,"result.json"))&&File.Exists(Path.Combine(ownedIoRoot,"evidence-error.txt")));
      return checks.ToArray();
    }
  }
}
