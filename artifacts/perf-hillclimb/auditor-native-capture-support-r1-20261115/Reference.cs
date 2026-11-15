using System;
using System.Collections.Generic;
using System.Text;
namespace IndependentSupportAudit {
 public static class Reference {
  // Managed argument grammar reference, not a call to the Windows argv parser.
  public static string[] Parse(string command) {
   var args=new List<string>();int i=0;
   while(i<command.Length){while(i<command.Length&&(command[i]==' '||command[i]=='\t'))i++;if(i==command.Length)break;
    var arg=new StringBuilder();bool quoted=false;
    while(i<command.Length){if(!quoted&&(command[i]==' '||command[i]=='\t'))break;
     int slashes=0;while(i<command.Length&&command[i]=='\\'){slashes++;i++;}
     if(i<command.Length&&command[i]=='"'){arg.Append('\\',slashes/2);if(slashes%2==1)arg.Append('"');else quoted=!quoted;i++;}
     else{arg.Append('\\',slashes);if(i<command.Length){if(!quoted&&(command[i]==' '||command[i]=='\t'))break;arg.Append(command[i++]);}}
    }args.Add(arg.ToString());
   }return args.ToArray();
  }
 }
}
