// Checker-side parser: fail before JSON.parse could silently round numbers or
// replace duplicate object keys. No native target/observer calls.
export function parseEvidenceJson(input,{maxBytes=16777216,maxDepth=48,maxNodes=2097152,maxArray=16640,maxKeys=128}={}) {
  const bytes=Buffer.isBuffer(input)?input:Buffer.from(input);
  const need=(ok,message)=>{if(!ok)throw new Error(message);};
  need(bytes.length>0&&bytes.length<=maxBytes,'JSON byte cap');need(!(bytes[0]===239&&bytes[1]===187&&bytes[2]===191),'unexpected JSON BOM');
  const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);let at=0,nodes=0;
  const white=()=>{while(at<text.length&&' \r\n\t'.includes(text[at]))at++;};
  function string(){white();const start=at;need(text[at++]==='"','JSON string expected');let escaped=false;
    while(at<text.length){const c=text[at++];need(c.charCodeAt(0)>=32,'unescaped JSON control');if(escaped){need('"\\/bfnrtu'.includes(c),'invalid JSON escape');if(c==='u'){need(/^[0-9a-fA-F]{4}$/.test(text.slice(at,at+4)),'invalid Unicode escape');at+=4;}escaped=false;continue;}if(c==='\\'){escaped=true;continue;}if(c==='"'){const value=JSON.parse(text.slice(start,at));for(let n=0;n<value.length;n++){const code=value.charCodeAt(n);if(code>=0xd800&&code<=0xdbff){const low=value.charCodeAt(++n);need(low>=0xdc00&&low<=0xdfff,'unpaired Unicode high surrogate');}else need(!(code>=0xdc00&&code<=0xdfff),'unpaired Unicode low surrogate');}return value;}}
    throw new Error('unterminated JSON string');
  }
  function value(depth){white();need(depth<=maxDepth&&++nodes<=maxNodes,'JSON depth/node cap');const c=text[at];
    if(c==='"')return string();
    if(c==='{'){at++;const result=Object.create(null),keys=new Set();white();if(text[at]==='}'){at++;return result;}while(true){const key=string();need(key.length<=32768&&!keys.has(key)&&keys.size<maxKeys,'duplicate/excess JSON key');keys.add(key);white();need(text[at++]===':','JSON colon');result[key]=value(depth+1);white();const end=text[at++];if(end==='}')return result;need(end===',','JSON object separator');}}
    if(c==='['){at++;const result=[];white();if(text[at]===']'){at++;return result;}while(true){need(result.length<maxArray,'JSON array cap');result.push(value(depth+1));white();const end=text[at++];if(end===']')return result;need(end===',','JSON array separator');}}
    for(const [token,result] of [['true',true],['false',false],['null',null]])if(text.startsWith(token,at)){at+=token.length;return result;}
    const token=/^-?(?:0|[1-9][0-9]*)/.exec(text.slice(at))?.[0];need(token&&token!=='-0','integer JSON scalar required');at+=token.length;const result=Number(token);need(Number.isSafeInteger(result),'unsafe JSON integer: use explicit lossless string');return result;
  }
  const result=value(0);white();need(at===text.length,'trailing JSON data');return result;
}
