using System;
using System.IO;
using System.Text;
using System.Collections;
using System.Collections.Generic;
using System.Reflection;
using System.Web.Script.Serialization;
using NativeCapturePrototype;
using NativeCaptureController;
using NativeCaptureRepair;

namespace NativeTrialLifetime {
  public static class TrialProjection {
    static readonly HashSet<Type> records=new HashSet<Type>(new[]{typeof(TrialStartup),typeof(ReaderStartupReceipt),typeof(TrialBudgetStep),typeof(TrialJobQuery),typeof(TrialTermination),typeof(TrialOwnerRelease),typeof(ProcessWaitReceipt),typeof(WaitSource),typeof(BoolNativeReceipt),typeof(TrialDuplicate),typeof(TrialProcessProbe),typeof(TrialMembership),typeof(TrialRelease),typeof(StartupPhaseReceipt),typeof(RollbackResourceReceipt),typeof(TrialIdentity),typeof(TrialOriginalFile),typeof(TrialTargetOutcome),typeof(TrialImageReceipt)});
    sealed class Projector {
      int nodes;readonly HashSet<object> active=new HashSet<object>();
      internal object Value(object value,int depth) {
        Guard.Require(depth<=32&&++nodes<=2097152,"Projection depth/node cap");if(value==null)return null;
        if(value is UInt64)return Policy.Hex((UInt64)value);if(value is Int64)return ((Int64)value).ToString(System.Globalization.CultureInfo.InvariantCulture);
        if(value is string) { Guard.Require(((string)value).Length<=8388608,"Projection string cap");return value; }
        if(value is bool||value is UInt32||value is Int32||value is UInt16||value is Int16||value is byte||value is sbyte)return value;
        Guard.Require(!(value is byte[]),"Raw bytes require separate file projection");Guard.Require(active.Add(value),"Projection cycle");
        try {
          var map=value as IDictionary;if(map!=null) { Guard.Require(map.Count<=128,"Projection map cap");var d=new Dictionary<string,object>();foreach(DictionaryEntry item in map) { Guard.Require(item.Key is string&&((string)item.Key).Length<=32768,"String evidence key required");d.Add((string)item.Key,Value(item.Value,depth+1)); }return d; }
          var list=value as IEnumerable;if(list!=null) { var a=new List<object>();foreach(object item in list) { Guard.Require(a.Count<16640,"Projection sequence cap");a.Add(Value(item,depth+1)); }return a; }
          Type type=value.GetType();Guard.Require(records.Contains(type),"Unregistered record projection:"+type.FullName);var output=new Dictionary<string,object>();
          foreach(var field in type.GetFields(BindingFlags.Public|BindingFlags.Instance))output.Add(field.Name,Value(field.GetValue(value),depth+1));return output;
        }finally { active.Remove(value); }
      }
    }
    public static object Lossless(object value) { return new Projector().Value(value,0); }
  }
  public static class TrialReport {
    public const int ReportLimit=16777216,RawLimit=1048576,ErrorLimit=8192;
    static string Hash(byte[] bytes) { using(var sha=System.Security.Cryptography.SHA256.Create())return BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-","").ToLowerInvariant(); }
    static Dictionary<string,object> Stream(string filename,RepairedPipeResult pipe) {
      return new Dictionary<string,object>{{"file",filename},{"available",pipe!=null},{"retainedBytes",pipe==null?0:pipe.Retained.Length},{"sha256",pipe==null?null:Hash(pipe.Retained)},{"totalBytes",pipe==null?null:pipe.Total.ToString(System.Globalization.CultureInfo.InvariantCulture)},{"overflow",pipe!=null&&pipe.Overflow},{"eof",pipe!=null&&pipe.Eof},{"stopped",pipe!=null&&pipe.Stopped},{"resourcesReleased",pipe!=null&&pipe.ResourcesReleased},{"deadlineExpired",pipe!=null&&pipe.DeadlineExpired},{"errors",pipe==null?null:pipe.Errors},{"droppedErrors",pipe==null?0:pipe.DroppedErrors},{"releases",pipe==null?null:pipe.Releases}};
    }
    public static Dictionary<string,object> Build(string mode,TrialControlResult c,Dictionary<string,TrialOriginalFile> originals) {
      Guard.Require(c!=null,"Controller result required");var processes=new List<object>();var waits=new List<object>();
      if(c.Tree!=null) {
        foreach(UInt32 pid in c.Tree.ProcessOrder) {
          var b=c.Tree.Binding(pid);var p=c.Tree.Phase(pid);var threads=new List<object>();foreach(var pair in p.Threads)threads.Add(new Dictionary<string,object>{{"tid",pair.Key},{"systemHandle",Policy.Hex(pair.Value.Handle)},{"primary",pair.Value.Primary},{"exited",pair.Value.Exited}});
          processes.Add(new Dictionary<string,object>{{"pid",pid},{"identity",b.Identity},{"originalProbe",b.OriginalProbe},{"duplicateProbe",b.DuplicateProbe},{"duplication",b.Duplication},{"waits",b.Waits},{"release",b.ReleaseReceipt},{"closedClaim",b.Closed},{"createContinued",p.Created},{"exitContinued",p.Exited},{"loaderHandledClaim",p.LoaderHandled},{"exceptionCount",p.Exceptions},{"loaderBase",Policy.Hex(p.LoaderBase)},{"loaderAddress",Policy.Hex(p.RemoteLoader)},{"remainingSystemThreads",threads},{"systemProcess",Policy.Hex(b.SystemProcess)},{"systemPrimaryThread",Policy.Hex(b.SystemPrimaryThread)}});
        }
        foreach(var w in c.Tree.Waits)waits.Add(w==null?null:new Dictionary<string,object>{{"requestedMs",w.RequestedMs},{"call",w.Call},{"rawByteLength",w.Bytes==null?0:w.Bytes.Length},{"rawHex",w.Bytes==null?null:BitConverter.ToString(w.Bytes).Replace("-","").ToLowerInvariant()}});
      }
      var originalList=new List<object>();if(originals!=null)foreach(var pair in originals)originalList.Add(pair.Value);
      var outcome=TrialTargetOutcome.Classify(mode,c,originals);
      var report=new Dictionary<string,object>{{"schema",1},{"kind","SYNTHETIC_TRIAL_LIFETIME_DIAGNOSTIC"},{"mode",mode},{"classification",outcome.Classification},{"targetOutcome",outcome},{"containmentCompleteClaim",c.ContainmentComplete},
        {"controller",new Dictionary<string,object>{{"startup",c.Startup},{"termination",c.Termination},{"extraRootWait",c.ExtraRootWait},{"queries",c.Queries},{"budgetSteps",c.BudgetSteps},{"errors",c.Errors},{"droppedErrors",c.DroppedErrors},{"workStop",c.WorkStop},{"timedOut",c.TimedOut},{"cleanupExpired",c.CleanupExpired},{"finalRemainingMs",c.FinalRemainingMs},{"sourceUnchangedClaim",c.SourceUnchanged},{"loaderPhasesCompleteClaim",c.LoaderPhasesComplete},{"hostExitRequired",c.HostExitRequired},{"rootRelease",c.RootRelease},{"eventBufferReleased",c.BufferReleased},{"jobClose",c.JobClose}}},
        {"processes",processes},{"events",c.Tree==null?null:c.Tree.Ledger},{"debugWaits",waits},{"treeErrors",c.Tree==null?null:c.Tree.Book.Errors},{"treeDroppedErrors",c.Tree==null?0:c.Tree.Book.DroppedErrorCount},{"unsafePending",c.Tree!=null&&c.Tree.UnsafePending},{"pendingEvent",c.Tree==null?null:c.Tree.PendingRecord},{"owner",c.OwnerEvidence},{"targetOriginals",originalList},
        {"stdout",Stream("stdout.raw",c.Streams==null?null:c.Streams.Stdout)},{"stderr",Stream("stderr.raw",c.Streams==null?null:c.Streams.Stderr)},
        {"scope","Builder projection/classifier, not independent acceptance. Native source unadmitted until complete source gate; diagnostic population, not product timing/cause/fix/neutrality/whole SOUND."}};
      return (Dictionary<string,object>)TrialProjection.Lossless(report);
    }
    public static byte[] Json(Dictionary<string,object> report) {
      var text=new JavaScriptSerializer { MaxJsonLength=ReportLimit,RecursionLimit=48 }.Serialize(report);byte[] bytes=new UTF8Encoding(false,true).GetBytes(text);Guard.Require(bytes.Length<=ReportLimit,"UTF8 report byte limit exceeded");return bytes;
    }
    public static bool Save(string ownedRoot,string mode,TrialControlResult c,Dictionary<string,TrialOriginalFile> originals) {
      string root=Guard.Absolute(ownedRoot);
      try {
        Guard.NoReparseParents(root);
        if(c.Streams!=null) { if(c.Streams.Stdout!=null)Policy.SaveExclusive(root,"stdout.raw",c.Streams.Stdout.Retained,RawLimit);if(c.Streams.Stderr!=null)Policy.SaveExclusive(root,"stderr.raw",c.Streams.Stderr.Retained,RawLimit); }
        Policy.SaveExclusive(root,"result.json",Json(Build(mode,c,originals)),ReportLimit);return true;
      }catch(Exception error) {
        string text="INCOMPLETE evidence write:"+error.GetType().Name+":"+error.Message;
        try { byte[] bytes=Encoding.UTF8.GetBytes(text.Substring(0,Math.Min(2048,text.Length)));Policy.SaveExclusive(root,"evidence-error.txt",bytes,ErrorLimit); }catch { }return false;
      }
    }
  }
}
