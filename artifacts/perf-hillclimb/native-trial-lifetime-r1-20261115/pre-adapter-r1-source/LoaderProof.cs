using System;
using System.IO;
using System.Text;
using System.Diagnostics;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using NativeCapturePrototype;

namespace NativeCaptureController {
  public sealed class LoaderContract {
    public string ImagePath,ImageSha256,PdbPath,PdbSha256,Symbol,GuidRaw,BodySha256,InstructionDerivationSha256;
    public UInt64 FunctionBeginRva,FunctionEndRva,TrapRva,QueryExportRva;public UInt32 ImageAge,InfoAge,DbiAge;
  }
  internal sealed class FrozenLoader {
    readonly LoaderContract c;internal readonly string ContractSha256;
    internal FrozenLoader(string file,string expectedHash,string ntdllHash) {
      byte[] bytes;using(var stream=new FileStream(file,FileMode.Open,FileAccess.Read,FileShare.Read)) {
        var buffer=new byte[65537];int total=0,n;while(total<buffer.Length&&(n=stream.Read(buffer,total,buffer.Length-total))>0)total+=n;
        Guard.Require(total>0&&total<=65536,"Loader contract byte bound");bytes=new byte[total];Buffer.BlockCopy(buffer,0,bytes,0,total);
      }
      using(var sha=System.Security.Cryptography.SHA256.Create())Guard.Require(BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-","").ToLowerInvariant()==expectedHash,"Loader contract hash mismatch");
      c=new JavaScriptSerializer { MaxJsonLength=65536,RecursionLimit=8 }.Deserialize<LoaderContract>(new UTF8Encoding(false,true).GetString(bytes));
      Guard.Require(c!=null&&c.Symbol=="LdrpDoDebuggerBreak"&&c.FunctionBeginRva<c.TrapRva&&c.TrapRva<c.FunctionEndRva&&c.FunctionEndRva-c.FunctionBeginRva<=4096&&c.FunctionEndRva<=16777216,"Loader role/range invalid");
      Guard.Require(c.ImageAge>0&&c.DbiAge==c.ImageAge&&c.InfoAge>=c.ImageAge&&c.GuidRaw!=null&&c.GuidRaw.Length==32,"Loader symbol identity invalid");
      Guard.Require(c.BodySha256!=null&&c.BodySha256.Length==64&&c.InstructionDerivationSha256!=null&&c.InstructionDerivationSha256.Length==64,"Loader derivation identity absent");
      Guard.Require(c.ImageSha256==ntdllHash&&Guard.Sha256(c.ImagePath)==c.ImageSha256&&Guard.Sha256(c.PdbPath)==c.PdbSha256,"Loader PE/PDB inputs changed");ContractSha256=expectedHash;
    }
    internal string ImagePath { get { return Policy.CanonicalImage(c.ImagePath); } }
    internal UInt64 TrapRva { get { return c.TrapRva; } }
    internal Dictionary<string,object> Evidence() { return new Dictionary<string,object>{{"path",ImagePath},{"sha256",c.ImageSha256},{"pdbSha256",c.PdbSha256},{"symbol",c.Symbol},{"guidRaw",c.GuidRaw},{"imageAge",c.ImageAge},{"infoAge",c.InfoAge},{"dbiAge",c.DbiAge},{"functionBeginHex",Policy.Hex(c.FunctionBeginRva)},{"functionEndHex",Policy.Hex(c.FunctionEndRva)},{"bodySha256",c.BodySha256},{"rvaHex",Policy.Hex(c.TrapRva)},{"instructionDerivationSha256",c.InstructionDerivationSha256},{"contractSha256",ContractSha256}}; }
  }
  public sealed class StartupPhaseReceipt {
    public bool CreateSeen,ModuleSeen,FirstException,MarkerProbed,EntryMarkerAbsent,ProbeCertain;
    public string Path,ProbeException,Phase="OWNED_INITIAL_STARTUP",ElapsedMs;public int? ProbeHResult,ProbeError;
    public bool Succeeded { get { return Phase=="OWNED_INITIAL_STARTUP"&&CreateSeen&&ModuleSeen&&FirstException&&MarkerProbed&&EntryMarkerAbsent&&ProbeCertain&&Path!=null&&System.IO.Path.IsPathRooted(Path)&&System.IO.Path.GetFileName(Path)=="target-identity.json"&&ProbeException=="FileNotFoundException"&&ProbeError==2&&ProbeHResult.HasValue&&(ProbeHResult.Value&65535)==2; } }
    internal static StartupPhaseReceipt Probe(string root,bool created,bool module,bool first) {
      var r=new StartupPhaseReceipt { CreateSeen=created,ModuleSeen=module,FirstException=first,Path=System.IO.Path.Combine(root,"target-identity.json"),ElapsedMs="0" };
      if(!created||!module||!first)return r;var watch=Stopwatch.StartNew();r.MarkerProbed=true;
      try { using(var stream=new FileStream(r.Path,FileMode.Open,FileAccess.Read,FileShare.ReadWrite)) { r.ProbeCertain=true;r.EntryMarkerAbsent=false; } }
      catch(FileNotFoundException error) { r.ProbeException=error.GetType().Name;r.ProbeHResult=error.HResult;r.ProbeError=error.HResult&65535;r.ProbeCertain=r.ProbeError==2;r.EntryMarkerAbsent=r.ProbeCertain; }
      catch(Exception error) { r.ProbeException=error.GetType().Name;r.ProbeHResult=error.HResult;r.ProbeError=error.HResult&65535; }
      r.ElapsedMs=watch.ElapsedMilliseconds.ToString(System.Globalization.CultureInfo.InvariantCulture);return r;
    }
  }
}
