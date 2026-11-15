using System;
using System.Collections.Generic;
using NativeCaptureRepair;
namespace IndependentRollbackR4 {
 sealed class Resource:IDisposable {
  readonly string id;readonly List<string> order;readonly Exception error;public int Calls;
  public Resource(string name,List<string> ledger,Exception failure){id=name;order=ledger;error=failure;}
  public void Dispose(){Calls++;order.Add(id);if(error!=null)throw error;}
 }
 public static class Checks {
  static List<string> checks;
  static void Yes(string name,bool ok){if(!ok)throw new Exception(name);checks.Add(name);}
  static void Reject(string name,Action action){bool rejected=false;try{action();}catch{rejected=true;}Yes(name,rejected);}
  public static string[] Run(){checks=new List<string>();var primary=new Exception("primary setup failure");
   Yes("no resource keeps primary identity",Object.ReferenceEquals(SetupRollback.Release(primary),primary));
   Yes("all null keeps primary identity",Object.ReferenceEquals(SetupRollback.Release(primary,null,null,null),primary));
   Reject("missing primary rejected",()=>SetupRollback.Release(null));
   Reject("missing resource array rejected",()=>SetupRollback.Release(primary,(IDisposable[])null));
   Reject("unbounded rollback array rejected",()=>SetupRollback.Release(primary,new IDisposable[9]));
   for(int count=1;count<=8;count++){
    var log=new List<string>();var resources=new Resource[count];var inputs=new IDisposable[count];
    for(int i=0;i<count;i++){resources[i]=new Resource("r"+i,log,null);inputs[i]=resources[i];}
    var outcome=SetupRollback.Release(primary,inputs);Yes("primary preserved after rollback "+count,Object.ReferenceEquals(outcome,primary));
    Yes("every allocated resource attempted "+count,log.Count==count);
    for(int i=0;i<count;i++)Yes("reverse exact-once "+count+"/"+i,log[i]=="r"+(count-1-i)&&resources[i].Calls==1);
   }
   var order=new List<string>();var firstError=new Exception("first-dispose-error");var lastError=new Exception("last-dispose-error");
   var a=new Resource("read",order,firstError);var b=new Resource("write",order,null);var c=new Resource("ready",order,lastError);
   var combined=SetupRollback.Release(primary,a,b,c) as AggregateException;
   Yes("cleanup continues after multiple failures",a.Calls==1&&b.Calls==1&&c.Calls==1&&String.Join(",",order)=="ready,write,read");
   Yes("aggregate retains primary and both errors",combined!=null&&combined.InnerExceptions.Count==3&&Object.ReferenceEquals(combined.InnerExceptions[0],primary)&&Object.ReferenceEquals(combined.InnerExceptions[1],lastError)&&Object.ReferenceEquals(combined.InnerExceptions[2],firstError));
   var partial=new List<string>();var allocated=new Resource("write",partial,null);
   Yes("null partial allocation accepted",Object.ReferenceEquals(SetupRollback.Release(primary,null,allocated,null),primary)&&allocated.Calls==1);
   var state=new ReaderState();state.RequestClose();Yes("representative retry mechanism retained",state.ClaimFinalization()&&state.ClaimFinalization()&&!state.ResourcesReleased);state.ConfirmResourcesReleased();Yes("representative release proof retained",state.ResourcesReleased&&!state.ClaimFinalization());
   int body=0;var worker=new OwnedWorker(()=>body++);worker.RequestClose();Reject("representative closed worker cannot start",()=>worker.Start());Yes("representative never-start terminal",body==0&&worker.TerminalProved&&worker.Join(0));
   Yes("representative zero not eof",PipeReadPolicy.Classify(true,0,0)==PipeReadAction.NoData);
   Yes("representative broken pipe eof",PipeReadPolicy.Classify(false,0,109)==PipeReadAction.Eof);
   return checks.ToArray();
  }
 }
}
