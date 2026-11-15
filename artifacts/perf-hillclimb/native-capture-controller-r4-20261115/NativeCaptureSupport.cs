// Artifacts-only support layer. No static initializer or runnable target entry.
using System;
using System.IO;
using System.Text;
using System.Text.RegularExpressions;
using System.Collections;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Security.Cryptography;

namespace NativeCapturePrototype {
  public sealed class CaptureConfig {
    public string ArtifactRoot,RunRoot,Id,Mode,Executable,ExecutableSha256,Cwd;
    public string[] Arguments;
    public int WorkLimitMs,RawByteLimit,EventLimit,ExceptionLimit,ReceiptByteLimit;
  }
  public static class Guard {
    static readonly string[] Modes={"normal","nonzero","synthetic-native","timeout","descendant","observer-failure"};
    public static void Require(bool condition,string message) { if(!condition)throw new InvalidOperationException(message); }
    public static string Absolute(string input) {
      Require(!String.IsNullOrWhiteSpace(input),"Absolute path required");input=input.Replace('/','\\');
      Require(Regex.IsMatch(input,@"^[A-Za-z]:\\")||Regex.IsMatch(input,@"^\\\\[^\\]+\\[^\\]+\\"),"Fully qualified path required");
      Require(!String.Equals(Path.GetFullPath(input).TrimEnd('\\'),Path.GetPathRoot(input).TrimEnd('\\'),StringComparison.OrdinalIgnoreCase),"Volume/share root unsupported");
      return Path.GetFullPath(input).TrimEnd(Path.DirectorySeparatorChar,Path.AltDirectorySeparatorChar);
    }
    public static bool Inside(string path,string root) {
      string p=Absolute(path),r=Absolute(root);
      return p.StartsWith(r+Path.DirectorySeparatorChar,StringComparison.OrdinalIgnoreCase);
    }
    public static void NoReparseParents(string path) {
      string current=Absolute(path);
      while(!String.IsNullOrEmpty(current)) {
        Require((File.GetAttributes(current)&FileAttributes.ReparsePoint)==0,"Reparse/alias path unsupported");
        string parent=Path.GetDirectoryName(current);if(parent==current)break;current=parent;
      }
    }
    public static string Sha256(string file) {
      using(var stream=File.OpenRead(file))using(var sha=SHA256.Create())
        return BitConverter.ToString(sha.ComputeHash(stream)).Replace("-","").ToLowerInvariant();
    }
    public static string Fingerprint(CaptureConfig c) {
      Require(c!=null&&c.Arguments!=null,"Cannot fingerprint missing config");
      var output=new StringBuilder("capture-config-v1;");var utf8=new UTF8Encoding(false,true);
      Action<string> put=value=>{Require(value!=null,"Cannot fingerprint null field");output.Append(utf8.GetByteCount(value)).Append(':').Append(value);};
      foreach(string s in new[]{c.ArtifactRoot,c.RunRoot,c.Id,c.Mode,c.Executable,c.ExecutableSha256,c.Cwd})put(s);
      foreach(int n in new[]{c.WorkLimitMs,c.RawByteLimit,c.EventLimit,c.ExceptionLimit,c.ReceiptByteLimit,c.Arguments.Length})put(n.ToString(System.Globalization.CultureInfo.InvariantCulture));
      foreach(string s in c.Arguments)put(s);
      using(var sha=SHA256.Create())return BitConverter.ToString(sha.ComputeHash(utf8.GetBytes(output.ToString()))).Replace("-","").ToLowerInvariant();
    }
    public static void Validate(CaptureConfig c,string[] allowedExecutables,string admittedConfigSha256) {
      Require(c!=null,"Config missing");Abi.Layout();
      Require(Regex.IsMatch(admittedConfigSha256??"",@"^[0-9a-f]{64}$")&&Fingerprint(c)==admittedConfigSha256,"Config differs from admitted manifest");
      Require(Regex.IsMatch(c.Id??"",@"^control-[0-5]-(normal|nonzero|synthetic-native|timeout|descendant|observer-failure)$"),"Unknown control id");
      int index=Array.IndexOf(Modes,c.Mode);Require(index>=0&&c.Id=="control-"+index+"-"+c.Mode,"Control id/mode/order mismatch");
      Require(Inside(c.RunRoot,c.ArtifactRoot),"Run root outside artifact root");
      Require(Path.GetFileName(Absolute(c.RunRoot))==c.Id,"Run root basename mismatch");
      Require(String.Equals(Absolute(c.Cwd),Absolute(c.RunRoot),StringComparison.OrdinalIgnoreCase),"Synthetic cwd must equal owned run root");
      Require(Directory.Exists(c.ArtifactRoot)&&Directory.Exists(c.RunRoot),"Registered roots must exist");
      Require(c.WorkLimitMs==(c.Mode=="timeout"?1000:10000)&&c.RawByteLimit==1048576&&c.EventLimit==2048&&c.ExceptionLimit==128&&c.ReceiptByteLimit==4194304,"Unadmitted control limits");
      Require(c.Arguments!=null&&c.Arguments.Length<=16,"Missing/excess arguments");
      int length=0;foreach(string a in c.Arguments) { Require(a!=null&&a.IndexOf('\0')<0,"Null/NUL argument");length=checked(length+a.Length+3); }
      Require(length<16000,"Bounded command line exceeded");
      string executable=Absolute(c.Executable);bool allowed=false;
      Require(allowedExecutables!=null&&allowedExecutables.Length>0&&allowedExecutables.Length<=8,"Frozen executable allowlist missing");
      foreach(string candidate in allowedExecutables)allowed|=String.Equals(executable,Absolute(candidate),StringComparison.OrdinalIgnoreCase);
      Require(allowed,"Executable not allowlisted");
      Require(File.Exists(executable),"Executable missing");
      Require(Regex.IsMatch(c.ExecutableSha256??"",@"^[0-9a-f]{64}$"),"Expected executable hash missing");
      NoReparseParents(c.RunRoot);NoReparseParents(executable);
      Require(Sha256(executable)==c.ExecutableSha256,"Executable identity changed");
      foreach(string name in new[]{"launch.json","result.json","stdout.raw","stderr.raw"})
        Require(!File.Exists(Path.Combine(c.RunRoot,name))&&!Directory.Exists(Path.Combine(c.RunRoot,name)),"Never repeat an attempted control");
    }
    public static void Reserve(string runRoot,string marker) {
      Require(Path.GetFileName(marker)==marker&&!String.IsNullOrWhiteSpace(marker),"Marker must be a basename");
      using(var stream=new FileStream(Path.Combine(Absolute(runRoot),marker),FileMode.CreateNew,FileAccess.Write,FileShare.Read)) {
        byte[] bytes=Encoding.UTF8.GetBytes("exclusive-control-reservation\n");stream.Write(bytes,0,bytes.Length);
      }
    }
  }
  public static class Wire {
    public static string Hex64(UInt64 value) { return "0x"+value.ToString("x16",System.Globalization.CultureInfo.InvariantCulture); }
    public static object Lossless(object value) {
      if(value is UInt64)return Hex64((UInt64)value);
      if(value is IDictionary) {
        var output=new Dictionary<string,object>();foreach(DictionaryEntry pair in (IDictionary)value)output.Add((string)pair.Key,Lossless(pair.Value));return output;
      }
      if(value is IEnumerable&&!(value is string)) { var output=new List<object>();foreach(object item in (IEnumerable)value)output.Add(Lossless(item));return output; }
      return value;
    }
    public static string Quote(string value) {
      Guard.Require(value!=null&&value.IndexOf('\0')<0,"Null/NUL command argument");
      var output=new StringBuilder("\"");int slashes=0;
      foreach(char ch in value) {
        if(ch=='\\') { slashes++;continue; }
        if(ch=='\"')output.Append('\\',slashes*2+1);else output.Append('\\',slashes);
        output.Append(ch);slashes=0;
      }
      output.Append('\\',slashes*2);return output.Append('"').ToString();
    }
    public static string CommandLine(string executable,string[] arguments) {
      var output=new StringBuilder(Quote(executable));foreach(string arg in arguments)output.Append(' ').Append(Quote(arg));
      Guard.Require(output.Length<32767,"Native command line exceeded");return output.ToString();
    }
  }
  public sealed class BoundedBytes {
    readonly int limit;readonly MemoryStream kept=new MemoryStream();readonly object gate=new object();
    long total;bool overflow;
    public BoundedBytes(int maximum) { Guard.Require(maximum>0&&maximum<=1048576,"Invalid retention bound");limit=maximum; }
    public void Append(byte[] bytes,int count) {
      Guard.Require(bytes!=null&&count>=0&&count<=bytes.Length,"Invalid read chunk");
      lock(gate) { total=checked(total+count);int keep=Math.Min(count,limit-(int)kept.Length);if(keep>0)kept.Write(bytes,0,keep);overflow|=count>keep; }
    }
    public long Total { get { lock(gate)return total; } }
    public bool Overflow { get { lock(gate)return overflow; } }
    public byte[] Snapshot() { lock(gate)return kept.ToArray(); }
  }

  [StructLayout(LayoutKind.Sequential)] public struct StartupInfoEx64 { public StartupInfo64 startup;public IntPtr attributes; }
  [StructLayout(LayoutKind.Sequential)] public struct SecurityAttributes { public UInt32 bytes;public IntPtr descriptor;[MarshalAs(UnmanagedType.Bool)]public bool inherit; }
  [StructLayout(LayoutKind.Sequential)] public struct FileTimePair { public UInt32 low,high; }
  [StructLayout(LayoutKind.Sequential)] public struct JobBasicLimits {
    public Int64 processTime,jobTime;public UInt32 flags;public UIntPtr minWorking,maxWorking;
    public UInt32 activeProcessLimit;public UIntPtr affinity;public UInt32 priority,scheduling;
  }
  [StructLayout(LayoutKind.Sequential)] public struct IoCounters { public UInt64 readOps,writeOps,otherOps,readBytes,writeBytes,otherBytes; }
  [StructLayout(LayoutKind.Sequential)] public struct JobExtendedLimits { public JobBasicLimits basic;public IoCounters io;public UIntPtr processMemory,jobMemory,peakProcess,peakJob; }
  [StructLayout(LayoutKind.Sequential)] public struct JobAccounting {
    public Int64 user,kernel,thisUser,thisKernel;public UInt32 pageFaults,totalProcesses,activeProcesses,terminatedProcesses;
  }
  // Declarations are not invoked by the build/pure-check entry path.
  public static class Native {
    public const UInt32 DebugOnlyThisProcess=2,CreateSuspended=4,ExtendedStartupInfo=0x80000,CreateNoWindow=0x08000000;
    public const UInt32 Continue=0x00010002,NotHandled=0x80010001,KillOnJobClose=0x2000;
    public const int ErrorSemTimeout=121,ErrorInsufficientBuffer=122;
    public static readonly IntPtr HandleListAttribute=new IntPtr(0x00020002);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)]
    public static extern bool CreateProcessW(string application,StringBuilder command,IntPtr processAttributes,IntPtr threadAttributes,[MarshalAs(UnmanagedType.Bool)]bool inherit,UInt32 flags,IntPtr environment,string cwd,ref StartupInfoEx64 startup,out ProcessInformation64 process);
    [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)]public static extern bool WaitForDebugEventEx(IntPtr buffer,UInt32 waitMs);
    [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)]public static extern bool ContinueDebugEvent(UInt32 pid,UInt32 tid,UInt32 status);
    [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)]public static extern bool DebugSetProcessKillOnExit([MarshalAs(UnmanagedType.Bool)]bool kill);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]public static extern IntPtr CreateJobObjectW(IntPtr attributes,string name);
    [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)]public static extern bool SetInformationJobObject(IntPtr job,int infoClass,ref JobExtendedLimits info,UInt32 bytes);
    [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)]public static extern bool QueryInformationJobObject(IntPtr job,int infoClass,out JobAccounting info,UInt32 bytes,IntPtr returnedBytes);
    [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)]public static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
    [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)]public static extern bool TerminateJobObject(IntPtr job,UInt32 code);
    [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)]public static extern bool TerminateProcess(IntPtr process,UInt32 code);
    [DllImport("kernel32.dll",SetLastError=true)]public static extern UInt32 WaitForSingleObject(IntPtr handle,UInt32 waitMs);
    [DllImport("kernel32.dll",SetLastError=true)]public static extern UInt32 ResumeThread(IntPtr thread);
    [DllImport("kernel32.dll")]public static extern UInt32 GetCurrentThreadId();
    [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)]public static extern bool GetProcessTimes(IntPtr process,out FileTimePair created,out FileTimePair exited,out FileTimePair kernel,out FileTimePair user);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)]public static extern bool QueryFullProcessImageNameW(IntPtr process,UInt32 flags,StringBuilder name,ref UInt32 length);
    [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)]public static extern bool InitializeProcThreadAttributeList(IntPtr attributes,int count,int flags,ref UIntPtr size);
    [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)]public static extern bool UpdateProcThreadAttribute(IntPtr attributes,UInt32 flags,IntPtr attribute,IntPtr value,UIntPtr bytes,IntPtr previous,IntPtr returnedBytes);
    [DllImport("kernel32.dll")]public static extern void DeleteProcThreadAttributeList(IntPtr attributes);
    [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)]public static extern bool CreatePipe(out IntPtr read,out IntPtr write,ref SecurityAttributes attributes,UInt32 size);
    [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)]public static extern bool SetHandleInformation(IntPtr handle,UInt32 mask,UInt32 flags);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]public static extern IntPtr CreateFileW(string file,UInt32 access,UInt32 share,ref SecurityAttributes attributes,UInt32 disposition,UInt32 flags,IntPtr template);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)]public static extern UInt32 GetFinalPathNameByHandleW(IntPtr file,StringBuilder name,UInt32 count,UInt32 flags);
    [DllImport("kernel32.dll",SetLastError=true)] [return:MarshalAs(UnmanagedType.Bool)]public static extern bool CloseHandle(IntPtr handle);
  }
}
