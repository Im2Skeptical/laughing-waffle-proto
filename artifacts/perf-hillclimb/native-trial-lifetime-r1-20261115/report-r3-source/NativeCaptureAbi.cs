// Artifacts-only, pure decoder foundation. No process launch or debug API calls.
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

namespace NativeCapturePrototype {
  [StructLayout(LayoutKind.Sequential)]
  public struct StartupInfo64 {
    public UInt32 cb;
    public IntPtr reserved, desktop, title;
    public UInt32 x,y,xSize,ySize,xChars,yChars,fillAttribute,flags;
    public UInt16 showWindow,reservedBytes;
    public IntPtr reservedData,stdInput,stdOutput,stdError;
  }
  [StructLayout(LayoutKind.Sequential)]
  public struct ProcessInformation64 {
    public IntPtr process,thread;
    public UInt32 processId,threadId;
  }
  [StructLayout(LayoutKind.Sequential)]
  public struct ExceptionRecord64 {
    public UInt32 code,flags;
    public UInt64 nestedRecord,address;
    public UInt32 parameterCount;
    public UInt64 p0,p1,p2,p3,p4,p5,p6,p7,p8,p9,p10,p11,p12,p13,p14;
  }
  [StructLayout(LayoutKind.Sequential)]
  public struct ExceptionDebugInfo64 {
    public ExceptionRecord64 record;
    public UInt32 firstChance;
  }
  [StructLayout(LayoutKind.Sequential)]
  public struct DebugEventLayout64 {
    public UInt32 code,pid,tid;
    public ExceptionDebugInfo64 largestUnionMember;
  }
  public static class Abi {
    public const int DebugEventBytes=176;
    public const UInt32 PriorExitStatus=0xc0000409;
    static void Require(bool condition,string message) { if(!condition)throw new InvalidOperationException(message); }
    static UInt32 U32(byte[] bytes,int offset) { Require(offset>=0&&offset+4<=bytes.Length,"Truncated DWORD");return BitConverter.ToUInt32(bytes,offset); }
    static UInt64 U64(byte[] bytes,int offset) { Require(offset>=0&&offset+8<=bytes.Length,"Truncated pointer");return BitConverter.ToUInt64(bytes,offset); }
    public static Dictionary<string,object> Layout() {
      Require(IntPtr.Size==8&&BitConverter.IsLittleEndian,"Only x64 little-endian host supported");
      return new Dictionary<string,object> {
        {"startupInfoBytes",Marshal.SizeOf(typeof(StartupInfo64))},
        {"processInformationBytes",Marshal.SizeOf(typeof(ProcessInformation64))},
        {"exceptionRecordBytes",Marshal.SizeOf(typeof(ExceptionRecord64))},
        {"exceptionDebugInfoBytes",Marshal.SizeOf(typeof(ExceptionDebugInfo64))},
        {"debugEventBytes",Marshal.SizeOf(typeof(DebugEventLayout64))},
        {"unionOffset",Marshal.OffsetOf(typeof(DebugEventLayout64),"largestUnionMember").ToInt32()},
        {"exceptionParameterOffset",Marshal.OffsetOf(typeof(ExceptionRecord64),"p0").ToInt32()},
        {"firstChanceOffset",Marshal.OffsetOf(typeof(ExceptionDebugInfo64),"firstChance").ToInt32()}
      };
    }
    public static Dictionary<string,object> Decode(byte[] bytes,UInt32 ownedPid) {
      Layout();Require(bytes!=null&&bytes.Length==DebugEventBytes,"Exact x64 DEBUG_EVENT byte count required");
      UInt32 code=U32(bytes,0),pid=U32(bytes,4),tid=U32(bytes,8);
      Require(ownedPid>0&&pid==ownedPid&&tid>0,"Unexpected or missing owned process/thread identity");
      Require(code>=1&&code<=9,"Unknown debug event type");
      var result=new Dictionary<string,object>{{"eventCode",code},{"pid",pid},{"tid",tid}};
      if(code==1) {
        UInt32 count=U32(bytes,40),chance=U32(bytes,168);
        Require(count<=15,"Exception parameters exceed native bound");Require(chance<=1,"Invalid first-chance value");
        var parameters=new List<UInt64>();for(int i=0;i<count;i++)parameters.Add(U64(bytes,48+i*8));
        result.Add("exceptionCode",U32(bytes,16));result.Add("exceptionFlags",U32(bytes,20));
        result.Add("nestedRecord",U64(bytes,24));result.Add("exceptionAddress",U64(bytes,32));
        result.Add("parameterCount",count);result.Add("parameters",parameters);result.Add("firstChance",chance);
      }else if(code==5)result.Add("exitCode",U32(bytes,16));
      else if(code==3) {
        result.Add("fileHandle",U64(bytes,16));result.Add("processHandle",U64(bytes,24));
        result.Add("threadHandle",U64(bytes,32));result.Add("imageBase",U64(bytes,40));
      }else if(code==2)result.Add("threadHandle",U64(bytes,16));
      else if(code==6) { result.Add("fileHandle",U64(bytes,16));result.Add("imageBase",U64(bytes,24)); }
      else if(code==7)result.Add("imageBase",U64(bytes,16));
      else if(code==9) { result.Add("error",U32(bytes,16));result.Add("type",U32(bytes,20)); }
      return result;
    }
  }
}
