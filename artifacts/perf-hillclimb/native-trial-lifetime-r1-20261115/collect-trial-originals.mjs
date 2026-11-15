// Read-only bounded ORIGINAL-BYTE collection. Never launches/stops a process or
// accepts a cell. Native exit/source/runtime/batch authentication is separate.
import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
const need=(v,m)=>{if(!v)throw new Error(m);};
export const CONTROL_LIMITS=Object.freeze({'attempt.marker':128,'host-attempt.marker':128,'host-entry.marker':128,'host-launch.json':8192,'host-start.json':65536,'launch.json':8192,'host-end.json':65536,'supervisor.json':16777216,'result.json':16777216,'stdout.raw':1048576,'stderr.raw':1048576});
function parents(file){let at=path.resolve(file);need(at!==path.parse(at).root,'filesystem root evidence forbidden');while(at!==path.parse(at).root){const s=fs.lstatSync(at,{bigint:true});need(!s.isSymbolicLink(),'evidence reparse/symlink path');at=path.dirname(at);}}
function same(a,b){return a.dev===b.dev&&a.ino===b.ino&&a.size===b.size&&a.mtimeNs===b.mtimeNs&&a.ctimeNs===b.ctimeNs;}
export function readBoundedOriginal(file,maximum,{empty=false}={}){
  need(Number.isSafeInteger(maximum)&&maximum>0&&maximum<=16777216,'original per-file cap');parents(file);const before=fs.lstatSync(file,{bigint:true});need(before.isFile()&&!before.isSymbolicLink()&&before.size<=BigInt(maximum)&&(empty||before.size>0n),'original regular-file/size bound');
  const fd=fs.openSync(file,fs.constants.O_RDONLY|(fs.constants.O_NOFOLLOW??0));try{const held=fs.fstatSync(fd,{bigint:true});need(held.isFile()&&same(before,held),'original changed before held read');const bytes=Buffer.alloc(Number(held.size));let at=0;while(at<bytes.length){const n=fs.readSync(fd,bytes,at,bytes.length-at,at);need(n>0,'original truncated while reading');at+=n;}need(same(held,fs.fstatSync(fd,{bigint:true}))&&same(held,fs.lstatSync(file,{bigint:true})),'original changed during held read');return {bytes,sha256:createHash('sha256').update(bytes).digest('hex'),size:bytes.length};}finally{fs.closeSync(fd);}
}
function name(value){need(typeof value==='string'&&value.length>0&&value.length<=128&&path.basename(value)===value&&path.win32.basename(value)===value&&!value.includes('\0')&&!value.includes(':')&&value!=='.'&&value!=='..','flat original file name required');return value;}
export function collectTrialOriginals(root,targetNames){
  need(typeof root==='string'&&path.isAbsolute(root),'absolute evidence directory');parents(root);need(fs.lstatSync(root).isDirectory(),'evidence root directory required');need(Array.isArray(targetNames)&&targetNames.length>0&&targetNames.length<=64,'bounded declared target name inventory');
  const limits=new Map(Object.entries(CONTROL_LIMITS)),folded=new Set([...limits.keys()].map(x=>x.toLowerCase()));for(const target of targetNames){name(target);need(target.endsWith('.json')&&!folded.has(target.toLowerCase()),'duplicate/aliased target/control filename');folded.add(target.toLowerCase());limits.set(target,8192);}
  const before=fs.readdirSync(root);need(before.length===limits.size&&before.length<=128,'extra/missing evidence directory entries');for(const entry of before)need(limits.has(entry),'unreviewed evidence entry');
  let total=0;const originals=new Map(),pins=new Map();for(const [file,maximum] of limits){const r=readBoundedOriginal(path.join(root,file),maximum,{empty:file==='stdout.raw'||file==='stderr.raw'});total+=r.size;need(total<=41943040,'total original evidence byte cap');originals.set(file,r.bytes);pins.set(file,{bytes:r.size,sha256:r.sha256});}
  const after=fs.readdirSync(root);need([...after].sort().join('\0')===[...before].sort().join('\0'),'evidence directory changed during collection');return {scope:'BOUNDED_ORIGINAL_BYTES_ONLY',completeCellAcceptance:false,originals,pins,totalBytes:total};
}
