using System;using System.Collections.Generic;using NativeCaptureRepair;using NativeCaptureController;
namespace IndependentControllerR2 {
 sealed class FakeClose:IDisposable,IReturnedCloseOutcome{readonly string label,state;readonly List<string> order;public int Calls;public FakeClose(string l,string s,List<string> o){label=l;state=s;order=o;}public void Dispose(){Calls++;order.Add(label);}public string ResourceLabel{get{return label;}}public string CloseState{get{return state;}}public string CloseDetail{get{return state=="NATIVE_CLOSE_FAILED"?"CloseHandle:6":null;}}}
 public static class Checks{
 static List<string> checks;static void Yes(string n,bool v){if(!v)throw new Exception(n);checks.Add(n);}static void Reject(string n,Action a){bool hit=false;try{a();}catch{hit=true;}Yes(n,hit);}
 static ReaderStartupReceipt Ready(){return new ReaderStartupReceipt{Ready=true,WorkerLive=true,ThreadHandleOwned=true,Errors=new string[0]};}
 public static string[] Run(){checks=new List<string>();
  foreach(string name in new[]{"Ready","WorkerLive","ThreadHandleOwned","Closing","DeadlineExpired"})foreach(bool outputBad in new[]{false,true}){
   var good=Ready();var bad=Ready();typeof(ReaderStartupReceipt).GetField(name).SetValue(bad,name=="Closing"||name=="DeadlineExpired");int resumed=0;Reject("connected gate rejects "+name+"/"+outputBad,()=>new ResumeGate().Commit(outputBad?bad:good,outputBad?good:bad,()=>resumed++));Yes("no callback on bad startup "+name+"/"+outputBad,resumed==0);
  }
  foreach(string issue in new[]{"missing","error","drops"}){var bad=Ready();if(issue=="missing")bad=null;if(issue=="error")bad.Errors=new[]{"startup"};if(issue=="drops")bad.DroppedErrors=1;int resumed=0;Reject("remaining startup reject "+issue,()=>new ResumeGate().Commit(bad,Ready(),()=>resumed++));Yes("remaining startup no resume "+issue,resumed==0);}
  int count=0;var gate=new ResumeGate();gate.Commit(Ready(),Ready(),()=>count++);Reject("second commit rejected",()=>gate.Commit(Ready(),Ready(),()=>count++));Yes("one actual callback only",count==1);
  int waits=0,injected=0;Action idle=()=>{if(Policy.InjectAfterPoll("observer-failure",true)){injected++;return;}waits++;};idle();Yes("idle verified poll injects before wait",injected==1&&waits==0);Yes("no unverified injection",!Policy.InjectAfterPoll("observer-failure",false));foreach(string mode in new[]{"normal","timeout","descendant"})Yes("other modes no injection "+mode,!Policy.InjectAfterPoll(mode,true));
  var log=new List<string>();var primary=new Exception("configuration failed");var a=new FakeClose("job","NATIVE_CLOSE_FAILED",log);var b=new FakeClose("pipe.read","NATIVE_CLOSE_PENDING",log);var c=new FakeClose("pipe.write","NATIVE_CLOSE_SUCCEEDED",log);var e=SetupRollback.Release(primary,a,null,b,c) as SetupFailureException;
  Yes("failed constructor primary identity retained",e!=null&&Object.ReferenceEquals(e.Primary,primary));Yes("all reverse release attempts",String.Join(",",log)=="pipe.write,pipe.read,job"&&a.Calls==1&&b.Calls==1&&c.Calls==1);Yes("returned failed close is not success",e.Rollback[3].Resource=="job"&&e.Rollback[3].State=="NATIVE_CLOSE_FAILED"&&e.Rollback[3].Detail=="CloseHandle:6");Yes("pending close not upgraded",e.Rollback[1].Resource=="pipe.read"&&e.Rollback[1].State=="NATIVE_CLOSE_PENDING");Yes("partial unallocated member explicit",e.Rollback[2].State=="NOT_ALLOCATED");Yes("successful member distinguished",e.Rollback[0].State=="NATIVE_CLOSE_SUCCEEDED");
  Yes("ordinary exception not native",!Policy.IsFatalNative(23,1,0,2));Yes("first chance not native",!Policy.IsFatalNative(0xc0000409,1,1,2));Yes("actual matching policy",Policy.IsFatalNative(0xc0000409,1,0,2));return checks.ToArray();
 }
 }
}
