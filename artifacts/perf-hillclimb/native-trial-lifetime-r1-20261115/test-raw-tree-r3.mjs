import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { inspectRawTree } from './check-raw-tree.mjs';
import { parseEvidenceJson } from './strict-evidence-json.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),out=path.join(root,'raw-tree-proof-r3');
if(fs.existsSync(out))throw new Error('Proof identity already used');fs.mkdirSync(out);
const input=path.join(root,'managed-report-io-r4','result.json'),bytes=fs.readFileSync(input),base=parseEvidenceJson(bytes);
const hash=b=>createHash('sha256').update(b).digest('hex'),clone=x=>JSON.parse(JSON.stringify(x));
const initial=base.events.find(e=>e.eventCode===1),module=base.events.find(e=>e.eventCode===6);
const contract={boundary:'CALLER_MUST_VERIFY_OWNER_RUNTIME_AND_FILES',rootPid:1,rootDir:path.win32.dirname(initial.startupPhase.Path),imagePath:base.processes[0].identity.Image,imageSha256:'a'.repeat(64),imageBytes:4096,loaderPath:module.image.Path,loaderSha256:'b'.repeat(64),trapRva:'0x0000000000000035',jobHandle:'0x000000000007a120',rootCreationOwned:['0x00000000000f4240','0x00000000000f4244'],rootEventWait:'0x00000000000f4248'};
const results=[];
function run(name,expected,change=()=>{}) {
  const r=clone(base),c=clone(contract);change(r,c);let accepted=false,error=null,summary=null;
  try {summary=inspectRawTree(r,c);accepted=true;}catch(e){error=e.message;}
  results.push({name,expected,accepted,error,scope:summary?.scope,completeCellAcceptance:summary?.completeCellAcceptance});
  if(accepted!==expected)throw new Error(`CONTROL_MISMATCH:${name}:${expected}:${accepted}:${error}`);
}
function raw(e,modify) {const b=Buffer.from(e.rawHex,'hex');modify(b);e.rawHex=b.toString('hex');}
function sync(r) {r.events.forEach((e,n)=>e.index=n);r.debugWaits=r.events.map(e=>({requestedMs:25,call:{Phase:'tree.WaitForDebugEventEx',Result:true,ErrorValid:false,Error:null,RawLastError:121},rawByteLength:176,rawHex:e.rawHex}));}
const bp=r=>r.events.find(e=>e.eventCode===1);
function nonFirst(e){Object.assign(e.startupPhase,{FirstException:false,MarkerProbed:false,EntryMarkerAbsent:false,ProbeCertain:false,ProbeException:null,ProbeError:null,ProbeHResult:null});}
function extraException(r,{before=false,breakpoint=false,consume=false}={}){const e=clone(bp(r));if(!before)nonFirst(e);if(!breakpoint){e.exceptionCode=0xe0434352;raw(e,b=>b.writeUInt32LE(e.exceptionCode,16));}e.continuation=consume?0x10002:0x80010001;r.events.splice(before?2:3,0,e);if(before)nonFirst(r.events[3]);r.processes[0].exceptionCount++;sync(r);}
try {
  run('coherent-managed-raw-tree-scope-only',true);
  run('successful-stale-errors-remain-invalid',true,r=>{for(const e of r.events)e.continueCall.RawLastError=6;});
  run('caller-boundary-remains-explicit-not-whole-cell',false,(r,c)=>delete c.boundary);
  run('all-builder-summary-claims-ignored-by-raw-layer',true,r=>{r.classification='INCOMPLETE';r.containmentCompleteClaim=false;for(const p of r.processes){p.closedClaim=false;p.loaderHandledClaim=false;}});
  run('lossless-FILETIME-above-2pow53',true,r=>{const p=r.processes[0];p.identity.CreatedFileTime='0x01dc60b811223344';p.originalProbe.CreatedFileTime=p.identity.CreatedFileTime;p.duplicateProbe.CreatedFileTime=p.identity.CreatedFileTime;});
  run('closed-CREATE-image-handle-reused-for-later-wait-duplicate',true,r=>{const p=r.processes[1],e=r.events.find(e=>e.eventCode===3&&e.pid===p.pid);p.duplication.Produced=e.fileHandle;});
  run('timeout-poll-has-no-event',true,r=>r.debugWaits.unshift({requestedMs:25,call:{Result:false,ErrorValid:true,Error:121,RawLastError:121},rawByteLength:0,rawHex:null}));
  run('raw-byte-count',false,r=>{r.events[0].rawHex=r.events[0].rawHex.slice(2);sync(r);});
  run('decoded-PID-disagrees-with-original',false,r=>r.events[0].pid=9);
  run('raw-PID-changed-without-metadata',false,r=>{raw(r.events[0],b=>b.writeUInt32LE(9,4));sync(r);});
  run('false-native-continue-result',false,r=>r.events[0].continueCall.Result=false);
  run('continue-error-contradiction',false,r=>{r.events[0].continueCall.ErrorValid=true;r.events[0].continueCall.Error=6;});
  run('continued-flag-contradicts-native-event',false,r=>r.events[0].continued=false);
  run('missing-successful-debug-wait',false,r=>r.debugWaits.pop());
  run('duplicate-successful-debug-wait',false,r=>r.debugWaits.push(clone(r.debugWaits[0])));
  run('failed-wait-not-timeout',false,r=>r.debugWaits.unshift({requestedMs:25,call:{Result:false,ErrorValid:true,Error:6,RawLastError:6},rawByteLength:0,rawHex:null}));
  run('poll-unbounded',false,r=>r.debugWaits[0].requestedMs=26);
  run('process-generation-duplicate-probe',false,r=>r.processes[0].duplicateProbe.CreatedFileTime='0x00000000000004d2');
  run('unsupported-WOW64-target',false,r=>r.processes[0].originalProbe.ProcessMachine=0x14c);
  run('wrong-thread-owner-PID',false,r=>r.processes[0].duplicateProbe.ThreadPid=9);
  run('wrong-image-hash',false,r=>r.processes[0].originalProbe.ImageSha256='c'.repeat(64));
  run('wrong-image-byte-size',false,r=>r.processes[0].originalProbe.ImageBytes='8192');
  run('wrong-job-membership',false,r=>r.processes[0].originalProbe.Membership.Member=false);
  run('unheld-job-owner',false,r=>r.processes[0].duplicateProbe.Membership.OwnerHeld=false);
  run('different-job-owner',false,r=>r.processes[0].duplicateProbe.Membership.OwnerHandle='0x000000000007a124');
  run('failed-native-identity-call',false,r=>{const x=r.processes[0].originalProbe.Times;x.Result=false;x.ErrorValid=true;x.Error=6;});
  run('wait-duplicate-aliases-system-source',false,r=>r.processes[0].duplication.Produced=r.processes[0].duplication.Source);
  run('wait-duplicate-aliases-other-live-root-owner',false,r=>r.processes[1].duplication.Produced=contract.rootCreationOwned[0]);
  run('root-extra-wait-aliases-binding-wait',false,(r,c)=>c.rootEventWait=r.processes[0].duplication.Produced);
  run('image-CloseHandle-failure',false,r=>r.events[0].image.Close.Result=false);
  run('CREATE-hFile-aliases-current-system-process',false,r=>{const e=r.events[0];e.fileHandle=e.processHandle;e.image.Handle=e.processHandle;raw(e,b=>b.writeBigUInt64LE(BigInt(e.fileHandle),16));sync(r);});
  run('loader-image-hash-changed',false,r=>r.events.find(e=>e.eventCode===6).image.Sha256='c'.repeat(64));
  run('coherent-wrong-first-trap-address',false,r=>{const e=bp(r);e.exceptionAddress='0x0000000000100036';raw(e,b=>b.writeBigUInt64LE(BigInt(e.exceptionAddress),32));sync(r);});
  run('coherent-wrong-first-trap-thread',false,r=>{const e=bp(r);e.tid=999;raw(e,b=>b.writeUInt32LE(999,8));sync(r);});
  run('coherent-second-chance-trap',false,r=>{const e=bp(r);e.firstChance=0;raw(e,b=>b.writeUInt32LE(0,168));sync(r);});
  run('marker-present-is-not-absent-phase',false,r=>{const e=bp(r);e.startupPhase.EntryMarkerAbsent=false;});
  run('marker-wrong-PID',false,r=>bp(r).startupPhase.Pid=9);
  run('marker-path-outside-run-root',false,r=>bp(r).startupPhase.Path='C:\\other\\identity-1.json');
  run('marker-path-not-found-is-not-file-not-found',false,r=>{const p=bp(r).startupPhase;p.ProbeError=3;p.ProbeHResult=-2147024893;});
  run('phase-first-exception-contradiction',false,r=>bp(r).startupPhase.FirstException=false);
  run('noninitial-benign-exception-correctly-not-handled',true,r=>extraException(r));
  run('late-first-address-does-not-consume-loader-trap',false,r=>extraException(r,{before:true}));
  run('repeated-loader-address-not-swallowed',false,r=>extraException(r,{breakpoint:true,consume:true}));
  run('noninitial-missing-phase-receipt',false,r=>{extraException(r);delete r.events[3].startupPhase;});
  run('noninitial-unprobed-marker-fabrication',false,r=>{extraException(r);r.events[3].startupPhase.EntryMarkerAbsent=true;});
  run('exception-count-metadata-mismatch',false,r=>r.processes[0].exceptionCount=2);
  run('missing-loader-module-does-not-consume-breakpoint',false,r=>{r.events.splice(1,1);const e=bp(r);e.startupPhase.ModuleSeen=false;e.startupPhase.MarkerProbed=false;sync(r);});
  run('extra-process-row-without-original-CREATE',false,r=>{const p=clone(r.processes[0]);p.pid=99;p.identity.Pid=99;r.processes.push(p);});
  run('missing-process-row',false,r=>r.processes.pop());
  run('missing-original-EXIT',false,r=>{r.events.pop();sync(r);});
  run('event-after-continued-EXIT',false,r=>{const e=clone(r.events.find(e=>e.eventCode===6&&e.pid===2));r.events.push(e);sync(r);});
  run('raw-pointer-rounded-number',false,r=>r.events[0].processHandle=Number(BigInt(r.events[0].processHandle)));
  fs.writeFileSync(path.join(out,'summary.json'),JSON.stringify({scope:'RAW_TREE_ONLY_NOT_COMPLETE_CELL_NOT_SOURCE_ADMISSION',nativeCalls:0,sourceInput:input,inputSha256:hash(bytes),checkerSha256:hash(fs.readFileSync(path.join(root,'check-raw-tree.mjs'))),contract,controls:results},null,2),{flag:'wx'});
  console.log(JSON.stringify({scope:'RAW_TREE_ONLY',controls:results.length,accepts:results.filter(x=>x.accepted).length,rejects:results.filter(x=>!x.accepted).length,nativeCalls:0,completeCellAcceptance:false,artifact:path.join(out,'summary.json')}));
} catch(error) {
  fs.writeFileSync(path.join(out,'failed.json'),JSON.stringify({error:error.message,results,scope:'RAW_TREE_ONLY',nativeCalls:0},null,2),{flag:'wx'});throw error;
}
