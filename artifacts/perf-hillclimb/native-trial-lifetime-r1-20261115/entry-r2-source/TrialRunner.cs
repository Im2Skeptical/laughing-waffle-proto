using System;
using System.IO;
using System.Diagnostics;
using System.Collections.Generic;
using NativeCapturePrototype;
using NativeCaptureController;

namespace NativeTrialLifetime {
  // SOURCE ONLY, not an admission or physical lifetime checker. No entry called
  // in builds/fake controls. No arbitrary PID reopen/name kill/attach/retry.
  public static class TrialRunner {
    sealed class Batch:ITrialBatchCalls {readonly TrialHostLaunch[] launches;readonly Stopwatch clock=Stopwatch.StartNew();internal Batch(TrialHostLaunch[] input){launches=(TrialHostLaunch[])input.Clone();}public long MonotonicMilliseconds {get{return clock.ElapsedMilliseconds;}}public long StartedMs {get{return 0;}}public Dictionary<string,object> ExecuteCell(int index){return TrialRunner.ExecuteCell(launches[index],launches[index].Config.ConfigSha256);} }
    public static Dictionary<string,object> ExecuteCell(TrialHostLaunch launch,string admittedConfigFingerprint){
      Guard.Require(launch!=null,"Frozen admitted launch required");var c=launch.Config;c.VerifyFingerprint(admittedConfigFingerprint);c.RequireLeafTime(DateTime.UtcNow);launch.VerifyFiles();
      Guard.Require(!Directory.Exists(c.Root)&&!File.Exists(c.Root),"Never repeat existing control root");string parent=Path.GetDirectoryName(c.Root);Guard.Require(Directory.Exists(parent),"Reviewed control parent must exist");Guard.NoReparseParents(parent);Directory.CreateDirectory(c.Root);c.ReserveAttempt(admittedConfigFingerprint,DateTime.UtcNow);
      TrialRetainedHost host=null;TrialHostResult outcome=null;var errors=new List<string>();
      try{host=new TrialRetainedHost();host.CreateSuspended(launch,admittedConfigFingerprint);host.ResumeAfterJournal(identity=>TrialHostJournals.SaveLaunch(launch,identity));outcome=TrialHostPolicy.Supervise(host.Identity,host);}
      catch(Exception e){errors.Add(e.GetType().Name+":"+e.Message);}
      finally{if(host!=null&&!host.Released)host.SetupFailure=TrialHostSetup.StopAndRelease(host);}
      bool created=host!=null&&host.Created,exit=outcome!=null&&outcome.ExitConfirmed||host!=null&&host.SetupFailure!=null&&host.SetupFailure.ExitConfirmed;
      var report=new Dictionary<string,object>{{"schema",1},{"kind","SYNTHETIC_TRIAL_SUPERVISOR_OUTCOME"},{"slotId",c.Id},{"mode",c.Mode},{"configSha256",c.ConfigSha256},{"configFileSha256",launch.ConfigFileSha256},{"admissionSha256",launch.AdmissionSha256},{"hostCreated",created},{"hostExitConfirmed",exit},{"hardBlockNativeOwnership",created&&!exit},{"hostPolicy",outcome},{"hostEvidence",host==null?null:host.Evidence},{"errors",errors.ToArray()},{"completeCellAcceptance",false},{"scope","Raw supervisor outcome only. Host code0/exit/close never substitutes for independent actual lifetime/cell checker."}};
      try{var projected=(Dictionary<string,object>)TrialProjection.Lossless(report);Policy.SaveExclusive(c.Root,"supervisor.json",TrialReport.Json(projected),TrialReport.ReportLimit);return projected;}
      catch(Exception e){throw new InvalidOperationException("Supervisor evidence write failed; cell remains INCOMPLETE",e);}
    }
    public static Dictionary<string,object> ExecuteTwoCells(TrialHostLaunch[] launches){
      Guard.Require(launches!=null&&launches.Length==2&&launches[0]!=null&&launches[1]!=null&&launches[0].Config.Id=="lifetime-0-reuse"&&launches[1].Config.Id=="lifetime-1-fail-after-first","Exactly two reviewed slots in declared order required");
      var batch=new Batch(launches);var first=launches[0].Config.InputPins;var second=launches[1].Config.InputPins;Guard.Require(first.Length==second.Length,"Batch input inventory differs");for(int i=0;i<first.Length;i++)Guard.Require(first[i].Path==second[i].Path&&first[i].Sha256==second[i].Sha256&&first[i].Bytes==second[i].Bytes,"Two cells must share exact selected input population");
      foreach(var launch in launches){launch.Config.RequireLeafTime(DateTime.UtcNow);launch.VerifyFiles();Guard.Require(!Directory.Exists(launch.Config.Root)&&!File.Exists(launch.Config.Root),"Batch slot already exists");}
      return TrialBatchPolicy.Execute(batch);
    }
  }
}
