// OWNER + RAW TREE layer only. Runtime/source/target original/host guards remain
// mandatory at composition. No permissive path for missing fake owner receipts.
import path from 'node:path';import {createHash} from 'node:crypto';import {inspectRawTree} from './check-raw-tree.mjs';
const need=(v,m)=>{if(!v)throw new Error(m);};
const integer=(v,m)=>need(Number.isSafeInteger(v),m);
const canonical=v=>{need(typeof v==='string'&&/^[A-Za-z]:[\\/]/.test(v),'absolute Windows path');return path.win32.normalize(v).toLowerCase();};
const handle=(v,m)=>{need(typeof v==='string'&&/^0x[0-9a-f]{16}$/.test(v)&&BigInt(v)>0n&&BigInt(v)!==0xffffffffffffffffn,m);return v;};
const equal=(a,b,m)=>need(JSON.stringify(a)===JSON.stringify(b),m);
const empty=(v,m)=>need(Array.isArray(v)&&v.length===0,m);
function boolCall(v,m){need(v&&v.Result===true&&v.ErrorValid===false&&v.Error===null,m);integer(v.RawLastError,`${m}: raw error`);}
function close(v,origin){need(v&&v.origin===origin&&v.state==='NATIVE_CLOSE_SUCCEEDED'&&v.detail===null&&v.nativeCalled===true&&v.result===true&&v.errorValid===false&&v.error===null,`owned close:${origin}`);integer(v.rawLastError,`owned close raw error:${origin}`);}
function wait(v,id,owned,phase){
  need(v&&v.Phase===phase&&v.NativeCalled===true&&v.RawStatus===0&&v.DeadlineExpired===false&&v.OwnershipUnavailable===false&&v.ErrorValid===false&&v.Error===null,'owned wait raw signal/status');integer(v.RawLastError,'owned wait raw error');
  need(Number.isInteger(v.RequestedMs)&&v.RequestedMs>0&&v.RequestedMs<=1000,'owned wait cap');const s=v.Source;
  need(s&&s.Origin==='CREATE_PROCESS_DEBUG_EVENT.independent-duplicate'&&s.Handle===owned&&s.Pid===id.Pid&&s.CreatedFileTimeHex===id.CreatedFileTime&&canonical(s.Image)===canonical(id.Image)&&s.Independent===true&&s.IdentityVerified===true,'owned wait origin/identity/generation/handle');handle(s.Handle,'owned wait handle');
}
function span(v,beforeKey,afterKey,step){need(v&&Number.isSafeInteger(v[beforeKey])&&Number.isSafeInteger(v[afterKey])&&v[beforeKey]>0&&v[afterKey]>0&&v[beforeKey]<=step.BeforeMs&&v[afterKey]<=v[beforeKey]&&v[afterKey]>=step.AfterMs,'receipt outside actual shared budget step');}
export function inspectOwnerCleanup(report,expected,rawFiles){
  const c=report.controller,o=report.owner;need(c&&o&&!Object.hasOwn(o,'fake'),'concrete owner receipts required, fake owner forbidden');
  empty(c.errors,'controller errors');need(c.droppedErrors===0&&c.timedOut===false&&c.cleanupExpired===false&&c.workStop==='ROOT_EXIT'&&c.hostExitRequired===false,'controller failure/deadline state');
  empty(report.treeErrors,'tree errors');need(report.treeDroppedErrors===0&&report.unsafePending===false&&report.pendingEvent===null,'tree loss/unsafe/pending');
  empty(o.errors,'owner errors');empty(o.rollback,'setup rollback');empty(o.recoveryCalls,'unexpected owner recovery');need(o.nonBlockingAbortRequested===false&&o.eventBufferReleased===true&&o.hostExitRequired===false,'owner incomplete/abort/buffer');
  const start=c.startup;need(start&&start.RootPid===expected.rootPid&&start.Created===true&&start.AssignedBeforeResume===true&&start.IdentityVerified===true&&start.Resumed===true&&canonical(start.Image)===canonical(expected.imagePath),'root launch identity/assignment/resume');
  need(Number.isInteger(start.CreatingThread)&&start.CreatingThread>0&&o.ownerThread===start.CreatingThread,'owner creating OS thread');equal(o.startup,start,'owner/startup mismatch');
  for(const r of [start.Stdout,start.Stderr]){need(r&&r.Ready===true&&r.WorkerLive===true&&r.ThreadHandleOwned===true&&r.Closing===false&&r.DeadlineExpired===false&&r.DroppedErrors===0,'readers ready before resume');empty(r.Errors,'startup reader errors');}
  const rootProcess=report.processes.find(p=>p.pid===start.RootPid);need(rootProcess&&rootProcess.identity,'root process table');const id=rootProcess.identity;
  need(start.PrimaryTid===id.PrimaryTid&&start.CreatedFileTimeHex===id.CreatedFileTime,'root startup native identity/generation');
  const h=o.targetHandles;need(h&&h.createdPid===id.Pid&&h.createdFileTimeHex===id.CreatedFileTime&&canonical(h.image)===canonical(id.Image),'root native handles identity');
  for(const key of ['creationReturnedProcess','creationReturnedThread','creationProcessDuplicate','creationThreadDuplicate','debugProcessSystemOwned','debugThreadSystemOwned','waitDuplicate'])handle(h[key],`root handle:${key}`);
  need(h.creationReturnedProcess!==h.creationReturnedThread&&h.originalsClosedBeforeDebugCreate===true&&h.debugCreateBound===true&&h.debugExitContinued===true&&h.waitIdentityVerified===true&&h.activeAlias===false,'root ownership/lifetime flags');
  const creationLive=new Set([h.creationReturnedProcess,h.creationReturnedThread]);
  for(const key of ['creationProcessDuplicate','creationThreadDuplicate']){need(!creationLive.has(h[key]),'creation duplicate aliases original/live duplicate');creationLive.add(h[key]);}
  need(h.debugProcessSystemOwned===rootProcess.systemProcess&&h.debugThreadSystemOwned===rootProcess.systemPrimaryThread,'root system event handle origins');
  need(Array.isArray(h.duplications)&&h.duplications.length===3,'root exactly three native duplicates');
  const pairs=[['CreateProcess.returned.process',h.creationReturnedProcess,h.creationProcessDuplicate],['CreateProcess.returned.thread',h.creationReturnedThread,h.creationThreadDuplicate],['CREATE_PROCESS_DEBUG_EVENT.process',h.debugProcessSystemOwned,h.waitDuplicate]];
  for(let n=0;n<pairs.length;n++){const [origin,source,produced]=pairs[n],d=h.duplications[n];need(d&&d.origin===origin&&d.source===source&&d.produced===produced&&d.result===true&&d.errorValid===false&&d.error===null&&d.activeAlias===false&&d.inherit===false&&d.sameAccess===true,'raw root duplication origin/options/result');integer(d.rawLastError,'root duplicate raw last-error');}
  const origins=['CreateProcess.returned.process','CreateProcess.returned.thread','creation.process.independent-duplicate','creation.thread.independent-duplicate','CREATE_EVENT.process.wait-duplicate'];
  need(Array.isArray(h.releases)&&h.releases.length===origins.length,'root close outcome inventory');for(let n=0;n<origins.length;n++)close(h.releases[n],origins[n]);
  need(c.rootRelease&&c.rootRelease.Confirmed===true&&c.rootRelease.Evidence,'root release evidence');equal(c.rootRelease.Evidence.target,h,'root release/owner handle receipts differ');close(o.stdin,'stdin.NUL');equal(c.rootRelease.Evidence.stdin,o.stdin,'stdin release receipts differ');empty(c.rootRelease.Evidence.errors,'root release errors');
  const term=c.termination;need(term&&term.NativeCalled===true&&term.OwnerHeld===true&&term.DeadlineExpired===false&&term.ExitCode===0xe0000001,'owned trial termination raw state');boolCall(term.Call,'TerminateJobObject');const job=handle(term.OwnerHandle,'job owner handle');
  // Only now derive the raw checker's root inputs from checked native-owner
  // origins. Runtime/image/loader/host inputs remain externally unverified.
  const raw=inspectRawTree(report,{...expected,boundary:'CALLER_MUST_VERIFY_OWNER_RUNTIME_AND_FILES',jobHandle:job,rootCreationOwned:[h.creationProcessDuplicate,h.creationThreadDuplicate],rootEventWait:h.waitDuplicate});
  need(Array.isArray(c.budgetSteps)&&c.budgetSteps.length>0&&c.budgetSteps.length<=16640,'cleanup step count');let prior=10000,priorWait=0;
  for(const s of c.budgetSteps){need(s&&Number.isSafeInteger(s.BeforeMs)&&Number.isSafeInteger(s.AfterMs)&&s.BeforeMs>0&&s.BeforeMs<=prior&&s.AfterMs>0&&s.AfterMs<=s.BeforeMs,'monotonic one cleanup deadline');need(Number.isInteger(s.WaitIndex)&&s.WaitIndex>=priorWait&&s.WaitIndex<=report.debugWaits.length,'monotonic wait/event cursor');prior=s.AfterMs;priorWait=s.WaitIndex;}
  let at=0,queryIndex=0;const steps=c.budgetSteps,take=phase=>{const s=steps[at++];need(s&&s.Phase===phase,`cleanup order:${phase}`);return s;};
  const termStep=take('terminate-job');span(term,'RemainingBeforeMs','RemainingAfterMs',termStep);
  const eventWaitCursor=[];for(let n=0;n<report.debugWaits.length;n++)if(report.debugWaits[n].call.Result===true)eventWaitCursor.push(n+1);
  const rootRaw=raw.processes.find(p=>p.pid===start.RootPid);need(termStep.WaitIndex===eventWaitCursor[rootRaw.exitIndex],'termination must follow root EXIT and precede cleanup events');
  const queries=c.queries;need(Array.isArray(queries)&&queries.length>0,'typed owner-held job queries');
  function query(s,final){const q=queries[queryIndex++];need(q&&q.NativeCalled===true&&q.Success===true&&q.ErrorValid===false&&q.Error===null&&q.OwnerHandleHeld===true&&q.OwnerHandle===job&&q.DeadlineExpired===false,'native job query ownership/result');integer(q.RawLastError,'query raw last-error');need(Number.isInteger(q.ActiveProcesses)&&q.ActiveProcesses>=0&&(!final||q.ActiveProcesses===0),'final raw active-process count zero');span(q,'RemainingBeforeMs','RemainingMs',s);}
  while(steps[at]?.Phase==='drain-job-query'){query(take('drain-job-query'),false);const s=take('drain-event');need(s.WaitIndex===steps[at-2].WaitIndex+1,'one native cleanup poll per drain step');}
  const finalCursor=report.debugWaits.length;
  for(const p of report.processes){const s=take(`process-wait:${p.pid}`);need(s.WaitIndex===finalCursor,'process wait before continued EXIT drain');need(Array.isArray(p.waits)&&p.waits.length===1,'one independent process wait');wait(p.waits[0],p.identity,p.duplication.Produced,'post-continued-EXIT');span(p.waits[0],'RemainingBeforeMs','RemainingAfterMs',s);}
  const extraStep=take('extra-root-wait');need(extraStep.WaitIndex===finalCursor,'additional root wait before EXIT drain');wait(c.extraRootWait,id,h.waitDuplicate,'additional-root-post-continued-EXIT');span(c.extraRootWait,'RemainingBeforeMs','RemainingAfterMs',extraStep);
  need(h.waitDuplicate!==rootProcess.duplication.Produced,'two root event waits must be independent');need(Array.isArray(o.additionalRootWaits)&&o.additionalRootWaits.length===1,'additional root wait inventory');equal(o.additionalRootWaits[0],c.extraRootWait,'additional root wait receipt crosslink');
  const eofStep=take('streams-after-continued-EXITs');need(eofStep.WaitIndex===finalCursor,'EOF before all continued native exits');
  for(const name of ['stdout','stderr']){const r=report[name],bytes=rawFiles?.[name];need(r&&Buffer.isBuffer(bytes)&&bytes.length<=1048576&&r.file===`${name}.raw`&&r.available===true,'original raw stream bytes unavailable');need(r.retainedBytes===bytes.length&&r.totalBytes===String(bytes.length)&&r.sha256===createHash('sha256').update(bytes).digest('hex'),'raw stream hash/count');need(r.overflow===false&&r.eof===true&&r.stopped===true&&r.resourcesReleased===true&&r.deadlineExpired===false&&r.droppedErrors===0,'raw EOF/reader ownership');empty(r.errors,'reader errors');need(Array.isArray(r.releases)&&r.releases.length===3,'pipe native close inventory');for(const [n,label] of ['pipe.read','pipe.write','native-handle'].entries())close(r.releases[n],label);}
  for(const p of report.processes){const s=take(`binding-release:${p.pid}`);need(s.WaitIndex===finalCursor,'binding release before EXIT drain');const r=p.release;need(r&&r.Origin==='CREATE_EVENT.wait-duplicate'&&r.Handle===p.duplication.Produced&&r.State==='NATIVE_CLOSE_SUCCEEDED'&&r.Detail===null&&r.NativeCalled===true&&r.Confirmed===true&&r.ErrorValid===false&&r.Error===null,'binding independent native close');integer(r.RawLastError,'binding close raw error');}
  const rootReleaseStep=take('root-release');need(rootReleaseStep.WaitIndex===finalCursor,'root release before EXIT drain');query(take('final-owner-held-job-query'),true);need(queryIndex===queries.length&&at===steps.length,'extra/missing job query/cleanup step');
  need(Number.isInteger(c.finalRemainingMs)&&c.finalRemainingMs>0&&c.finalRemainingMs<=prior&&c.eventBufferReleased===true,'cleanup final deadline/buffer');close(o.jobClose,'job');need(c.jobClose?.Confirmed===true,'job close missing');equal(c.jobClose.Evidence,o.jobClose,'job close owner receipt mismatch');
  return {scope:'OWNER_RAW_TREE_CLEANUP_ONLY',completeCellAcceptance:false,raw,jobHandle:job,rootEventWait:h.waitDuplicate,processWaits:report.processes.length+1,queries:queries.length,cleanupSteps:steps.length,unverified:['runtime/source/argv/cwd/loader provenance','original target file bytes/functionality','exclusive attempt/host/supervisor guards']};
}
