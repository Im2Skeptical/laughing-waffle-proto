using System;
using System.Text;
using System.Collections.Generic;
using System.Web.Script.Serialization;

namespace NativeTrialLifetime {
  public static class PureAdmissionChecks {
    static readonly List<string> checks=new List<string>();static readonly string sha=new string('a',64);
    static void Yes(string name,bool value){if(!value)throw new Exception("FAIL:"+name);checks.Add(name);}
    static void Reject(string name,Action action){bool rejected=false;try{action();}catch{rejected=true;}Yes(name,rejected);}
    static Dictionary<string,object> Receipt(FrozenTrial c){return new Dictionary<string,object>{{"schema",1},{"kind","SOURCE_ONLY_TWO_SYNTHETIC_CELLS"},{"verdict","SOURCE_ACCEPTED"},{"auditor","independent-auditor"},{"builder","builder"},{"slotId",c.Id},{"mode",c.Mode},{"configSha256",c.ConfigSha256},{"observerSha256",sha},{"targetSha256",sha},{"reviewFile",@"C:\virtual\trial\review.md"},{"reviewSha256",sha},{"manifestFile",@"C:\virtual\trial\manifest.json"},{"manifestSha256",sha},{"notAfterUtc","2026-11-16T01:45:00Z"}};}
    static byte[] Json(Dictionary<string,object> d){return Encoding.UTF8.GetBytes(new JavaScriptSerializer().Serialize(d));}
    public static string[] Run(){
      checks.Clear();var c=PureHostLaunchChecks.Config();var receipt=Receipt(c);var accepted=TrialAdmission.Parse(c,Json(receipt));receipt["auditor"]="changed";Yes("admission-immutable-parsed-crosslinks",accepted.Auditor=="independent-auditor"&&accepted.Builder=="builder");
      foreach(string fault in new[]{"schema","kind","verdict","slotId","mode","configSha256","observerSha256","targetSha256","reviewSha256","manifestSha256","notAfterUtc","auditor","builder","reviewFile","manifestFile","alias","unknown","missing"}){var d=Receipt(c);switch(fault){case "schema":d[fault]=2;break;case "alias":d["manifestFile"]=d["reviewFile"];break;case "unknown":d["extra"]=true;break;case "missing":d.Remove("reviewFile");break;case "auditor":d[fault]="BUILDER";break;case "builder":d[fault]=" ";break;case "reviewFile":case "manifestFile":d[fault]=@"C:\other\foreign";break;case "configSha256":case "observerSha256":case "targetSha256":d[fault]=new string('b',64);break;case "notAfterUtc":d[fault]="2026-11-16T02:40:00Z";break;default:d[fault]="invalid";break;}Reject("admission-rejects-"+fault,()=>TrialAdmission.Parse(c,Json(d)));}
      var canonical=Encoding.UTF8.GetString(Json(Receipt(c)));Reject("admission-duplicate-decoded-key",()=>TrialAdmission.Parse(c,Encoding.UTF8.GetBytes(canonical.Substring(0,canonical.Length-1)+",\"verdict\":\"SOURCE_ACCEPTED\"}")));Reject("admission-trailing-document",()=>TrialAdmission.Parse(c,Encoding.UTF8.GetBytes(canonical+"{}")));Reject("admission-nested-proof-substitution",()=>{var d=Receipt(c);d["reviewFile"]=new Dictionary<string,object>{{"accepted",true}};TrialAdmission.Parse(c,Json(d));});
      var bytes=Encoding.UTF8.GetBytes("exclusive-control-reservation\n");TrialReservation.Validate(bytes);Yes("reservation-exact-original-bytes",bytes.Length==30);Reject("reservation-absent",()=>TrialReservation.Validate(null));Reject("reservation-empty",()=>TrialReservation.Validate(new byte[0]));Reject("reservation-missing-newline",()=>TrialReservation.Validate(Encoding.UTF8.GetBytes("exclusive-control-reservation")));Reject("reservation-extra-newline",()=>TrialReservation.Validate(Encoding.UTF8.GetBytes("exclusive-control-reservation\n\n")));bytes[0]=(byte)'x';Reject("reservation-wrong-same-length",()=>TrialReservation.Validate(bytes));
      TrialReservation.ValidatePrefix(new[]{"attempt.marker"},false);TrialReservation.ValidatePrefix(new[]{"host-attempt.marker","attempt.marker"},true);Yes("reservation-fresh-only-prefixes",true);Reject("reservation-old-result-not-rescued",()=>TrialReservation.ValidatePrefix(new[]{"attempt.marker","result.json"},false));Reject("reservation-consumed-host-prefix-cannot-repeat",()=>TrialReservation.ValidatePrefix(new[]{"attempt.marker","host-attempt.marker"},false));Reject("reservation-missing-parent-marker",()=>TrialReservation.ValidatePrefix(new[]{"host-attempt.marker"},false));Reject("reservation-duplicate-marker",()=>TrialReservation.ValidatePrefix(new[]{"attempt.marker","attempt.marker"},true));
      return checks.ToArray();
    }
  }
}
