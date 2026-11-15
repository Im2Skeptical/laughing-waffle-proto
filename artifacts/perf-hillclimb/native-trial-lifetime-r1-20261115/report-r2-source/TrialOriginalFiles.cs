using System;
using System.IO;
using System.Text;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using NativeCapturePrototype;

namespace NativeTrialLifetime {
  public sealed class TrialOriginalFile {
    public string Name,Sha256,Error;public int Bytes;public Dictionary<string,object> Values;
  }
  // All frozen target receipts are FLAT JSON objects of scalar values. Parse
  // that exact grammar, rejecting duplicate decoded keys, nested data, trailing
  // text, floats, negative/overflow numbers and invalid UTF8 rather than silently
  // replacing a property through JavaScriptSerializer's dictionary conversion.
  public static class TrialFlatJson {
    sealed class Parser {
      readonly string text;int at;readonly JavaScriptSerializer strings=new JavaScriptSerializer { MaxJsonLength=8192,RecursionLimit=2 };
      internal Parser(string value) { text=value; }
      void White() { while(at<text.Length&&(text[at]==' '||text[at]=='\r'||text[at]=='\n'||text[at]=='\t'))at++; }
      void Need(char c) { White();Guard.Require(at<text.Length&&text[at++]==c,"Flat JSON delimiter invalid"); }
      string String() {
        White();int begin=at;Guard.Require(at<text.Length&&text[at++]=='"',"JSON string required");bool escaped=false;
        while(at<text.Length) {
          char c=text[at++];Guard.Require(c>=32,"Unescaped control character");
          if(escaped) { Guard.Require("\"\\/bfnrtu".IndexOf(c)>=0,"Invalid JSON string escape");if(c=='u') { Guard.Require(at+4<=text.Length,"Truncated Unicode escape");for(int n=0;n<4;n++)Guard.Require(Uri.IsHexDigit(text[at+n]),"Invalid Unicode escape");at+=4; }escaped=false;continue; }
          if(c=='\\') { escaped=true;continue; }
          if(c=='"') { string decoded=strings.Deserialize<string>(text.Substring(begin,at-begin));for(int n=0;n<decoded.Length;n++) { if(Char.IsHighSurrogate(decoded[n])) { Guard.Require(n+1<decoded.Length&&Char.IsLowSurrogate(decoded[n+1]),"Unpaired Unicode surrogate");n++; }else Guard.Require(!Char.IsLowSurrogate(decoded[n]),"Unpaired Unicode surrogate"); }return decoded; }
        }
        throw new InvalidOperationException("Unterminated JSON string");
      }
      object Value() {
        White();Guard.Require(at<text.Length,"Missing scalar");if(text[at]=='"')return String();
        foreach(string token in new[]{"true","false"})if(at+token.Length<=text.Length&&text.Substring(at,token.Length)==token) { at+=token.Length;return token=="true"; }
        int begin=at;while(at<text.Length&&text[at]>='0'&&text[at]<='9')at++;
        Guard.Require(at>begin&&(at-begin==1||text[begin]!='0'),"Unsigned integer scalar required");UInt32 value;
        Guard.Require(UInt32.TryParse(text.Substring(begin,at-begin),System.Globalization.NumberStyles.None,System.Globalization.CultureInfo.InvariantCulture,out value),"Target numeric scalar overflow");return value;
      }
      internal Dictionary<string,object> Parse() {
        var values=new Dictionary<string,object>(StringComparer.Ordinal);Need('{');White();if(at<text.Length&&text[at]=='}')at++;
        else while(true) { string key=String();Guard.Require(key.Length<=128&&!values.ContainsKey(key)&&values.Count<16,"Duplicate/excess target key");Need(':');values.Add(key,Value());White();Guard.Require(at<text.Length,"Missing object end");char c=text[at++];if(c=='}')break;Guard.Require(c==',',"Invalid object separator"); }
        White();Guard.Require(at==text.Length,"Trailing target JSON data");return values;
      }
    }
    public static Dictionary<string,object> Parse(byte[] bytes) { Guard.Require(bytes!=null&&bytes.Length>0&&bytes.Length<=8192,"Bounded target bytes required");return new Parser(new UTF8Encoding(false,true).GetString(bytes)).Parse(); }
  }
  public static class TrialOriginalFiles {
    public const int FileLimit=64,ByteLimit=8192;
    public static bool Related(string name) { return name.StartsWith("identity-",StringComparison.Ordinal)||name.StartsWith("start-",StringComparison.Ordinal)||name.StartsWith("helper-",StringComparison.Ordinal)||name.StartsWith("daemon-",StringComparison.Ordinal)||name.StartsWith("reuse-",StringComparison.Ordinal)||name.StartsWith("target-error-",StringComparison.Ordinal)||name=="between-helpers.json"||name=="prefix-outcome.json"; }
    public static TrialOriginalFile Decode(string name,byte[] bytes) {
      var r=new TrialOriginalFile { Name=name,Bytes=bytes==null?0:bytes.Length };
      try { Guard.Require(Path.GetFileName(name)==name&&Related(name)&&bytes!=null&&bytes.Length>0&&bytes.Length<=ByteLimit,"Unowned/oversized target receipt");using(var hash=System.Security.Cryptography.SHA256.Create())r.Sha256=BitConverter.ToString(hash.ComputeHash(bytes)).Replace("-","").ToLowerInvariant();r.Values=TrialFlatJson.Parse(bytes); }
      catch(Exception error) { r.Error=error.GetType().Name+":"+error.Message; }return r;
    }
    public static Dictionary<string,TrialOriginalFile> Capture(string ownedRoot) {
      string root=Guard.Absolute(ownedRoot);Guard.NoReparseParents(root);var result=new Dictionary<string,TrialOriginalFile>(StringComparer.Ordinal);int scanned=0;
      foreach(string path in Directory.EnumerateFileSystemEntries(root)) {
        Guard.Require(++scanned<=128,"Owned trial directory entry cap");string name=Path.GetFileName(path);if(!Related(name))continue;
        Guard.Require(result.Count<FileLimit,"Target original file cap");TrialOriginalFile r;
        try {
          Guard.NoReparseParents(path);using(var stream=new FileStream(path,FileMode.Open,FileAccess.Read,FileShare.Read)) {
            Guard.Require(stream.Length>0&&stream.Length<=ByteLimit,"Target original byte bound");var bytes=new byte[(int)stream.Length];int total=0,n;while(total<bytes.Length&&(n=stream.Read(bytes,total,bytes.Length-total))>0)total+=n;Guard.Require(total==bytes.Length,"Target original truncated");r=Decode(name,bytes);
          }
        }catch(Exception error) { r=new TrialOriginalFile { Name=name,Error=error.GetType().Name+":"+error.Message }; }
        result.Add(name,r);
      }
      return result;
    }
  }
}
