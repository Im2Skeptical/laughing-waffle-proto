using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using NativeCapturePrototype;

namespace NativeCaptureController {
  public sealed class FrozenControl {
    readonly CaptureConfig c;
    public FrozenControl(CaptureConfig input,string[] allowed,string admittedHash) {
      Guard.Require(input!=null&&input.Arguments!=null,"Missing manifest");
      c=new CaptureConfig { ArtifactRoot=input.ArtifactRoot,RunRoot=input.RunRoot,Id=input.Id,Mode=input.Mode,
        Executable=input.Executable,ExecutableSha256=input.ExecutableSha256,Cwd=input.Cwd,Arguments=(string[])input.Arguments.Clone(),
        WorkLimitMs=input.WorkLimitMs,RawByteLimit=input.RawByteLimit,EventLimit=input.EventLimit,ExceptionLimit=input.ExceptionLimit,ReceiptByteLimit=input.ReceiptByteLimit };
      Guard.Validate(c,(string[])allowed.Clone(),admittedHash);Fingerprint=admittedHash;
    }
    public string Fingerprint { get;private set; }
    public string Executable { get { return c.Executable; } }
    public string ExecutableHash { get { return c.ExecutableSha256; } }
    public string Cwd { get { return c.Cwd; } }
    public string Root { get { return c.RunRoot; } }
    public string Mode { get { return c.Mode; } }
    public string Id { get { return c.Id; } }
    public string CommandLine { get { return Wire.CommandLine(c.Executable,c.Arguments); } }
    public string[] Arguments { get { return (string[])c.Arguments.Clone(); } }
  }
  public sealed class CaptureFacts {
    public bool Identity,AssignedBeforeResume,LoaderBreakpoint,ExitContinued,JobEmpty,StreamsComplete,HandlesClosed,SourceStable;
    public bool TimedOut,Overflow,ObserverError,UnsafeRecovery;
    public UInt32 ExitCode;public int MatchingFatalRecords;
    public bool Complete { get { return Identity&&AssignedBeforeResume&&LoaderBreakpoint&&ExitContinued&&JobEmpty&&StreamsComplete&&HandlesClosed&&SourceStable&&!TimedOut&&!Overflow&&!ObserverError&&!UnsafeRecovery; } }
  }
  public static class Policy {
    public static bool InjectAfterPoll(string mode,bool verified) { return mode=="observer-failure"&&verified; }
    public static string Classify(CaptureFacts f) {
      Guard.Require(f!=null,"Missing outcome facts");
      if(!f.Complete)return "INCOMPLETE";
      if(f.ExitCode==0xc0000409&&f.MatchingFatalRecords>0)return "NATIVE_EXCEPTION_CAPTURED";
      if(f.MatchingFatalRecords>0)return "OTHER_EXCEPTION_CAPTURED";
      return f.ExitCode==0?"NORMAL_EXIT":"NONZERO_EXIT_WITHOUT_MATCHED_EXCEPTION";
    }
    public static UInt32 Continuation(UInt32 tag,UInt32 code,UInt32 chance,UInt64 address,UInt64 expectedLoaderAddress,bool createSeen,bool alreadyHandled,UInt32 eventTid,UInt32 primaryTid,StartupPhaseReceipt phase) {
      Guard.Require(tag>=1&&tag<=9,"Bad event tag");if(tag!=1)return 0x00010002;
      return code==0x80000003&&chance==1&&createSeen&&!alreadyHandled&&eventTid==primaryTid&&expectedLoaderAddress!=0&&address==expectedLoaderAddress&&phase!=null&&phase.Succeeded?0x00010002:0x80010001;
    }
    public static bool IsFatalNative(UInt32 code,UInt32 flags,UInt32 chance,UInt32 count) {
      return code==0xc0000409&&(flags&1)!=0&&chance==0&&count>=1&&count<=15;
    }
    public static string Hex(UInt64 value) { return "0x"+value.ToString("x16",System.Globalization.CultureInfo.InvariantCulture); }
    public static string CanonicalImage(string input) {
      if(input.StartsWith(@"\\?\",StringComparison.Ordinal))input=input.Substring(4);
      return Guard.Absolute(input);
    }
    public static void SaveExclusive(string root,string name,byte[] bytes,int maximum) {
      Guard.Require(Path.GetFileName(name)==name&&bytes!=null&&bytes.Length<=maximum,"Bounded owned output required");
      using(var stream=new FileStream(Path.Combine(root,name),FileMode.CreateNew,FileAccess.Write,FileShare.Read)) { stream.Write(bytes,0,bytes.Length);stream.Flush(); }
    }
  }
}
