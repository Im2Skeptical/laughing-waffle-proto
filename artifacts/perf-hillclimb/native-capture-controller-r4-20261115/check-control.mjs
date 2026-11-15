import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {deriveLoader} from './loader-contract.mjs';
const root='artifacts/perf-hillclimb/native-capture-controller-r4-20261115';
const json=f=>JSON.parse(readFileSync(f,'utf8')),sha=f=>createHash('sha256').update(readFileSync(f)).digest('hex');
const plan=json(root+'/plan.json'),index=Number(process.argv[2]);assert.ok(Number.isInteger(index)&&index>=0&&index<6);
const slot=plan.slots[index],dir=slot.config.RunRoot,problems=[];const need=(ok,message)=>{if(!ok)problems.push(message);};
let r=null;
try{
  r=json(dir+'/result.json');const host=json(dir+'/supervisor-result.json'),launch=json(dir+'/launch.json'),identity=json(dir+'/target-identity.json');
  const expectedHost=['timeout','observer-failure'].includes(slot.config.Mode)?2:0;
  need(!host.expired&&host.hostError===null&&host.hostSignal===null&&host.hostExitCode===expectedHost,'mode-bound host exit/timeout incomplete');
  need(r.controlId===slot.config.Id&&r.configSha256===slot.configSha256&&launch.configSha256===slot.configSha256,'control/config identity mismatch');
  need(Number.isInteger(launch.pid)&&launch.pid>0&&identity.pid===launch.pid&&identity.debuggerPresent===true,'actual target identity/debugger state missing');
  need(BigInt(identity.createdFileTimeUtc)===BigInt(launch.createdFileTimeHex),'target creation time mismatch');
  const canonical=s=>typeof s==='string'?s.replace(/\\/g,'/').toLowerCase():'';
  need(canonical(launch.image)===canonical(slot.config.Executable),'launch image differs from admitted target');
  const f=r.facts;
  for(const key of ['Identity','AssignedBeforeResume','LoaderBreakpoint','ExitContinued','JobEmpty','StreamsComplete','HandlesClosed','SourceStable'])need(f[key]===true,'missing required fact '+key);
  need(f.Overflow===false&&f.UnsafeRecovery===false,'overflow/unsafe recovery');
  need(Array.isArray(r.rollbackReceipts)&&r.rollbackReceipts.length===0,'constructor rollback means declared control setup incomplete');
  need(r.stdoutAvailable===true&&r.stderrAvailable===true&&r.stdoutEof===true&&r.stderrEof===true,'raw stream availability/EOF missing');
  need(r.stdoutResourcesReleased===true&&r.stderrResourcesReleased===true,'stream resources unconfirmed');
  need(Array.isArray(r.stdoutErrors)&&r.stdoutErrors.length===0&&Array.isArray(r.stderrErrors)&&r.stderrErrors.length===0&&r.stdoutDroppedErrors===0&&r.stderrDroppedErrors===0,'stream errors/dropped errors');
  const out=readFileSync(dir+'/stdout.raw'),err=readFileSync(dir+'/stderr.raw');
  need(BigInt(r.stdoutTotalBytes)===BigInt(out.length)&&BigInt(r.stderrTotalBytes)===BigInt(err.length)&&out.length<=1048576&&err.length<=1048576,'raw byte lengths incomplete');
  need(Array.isArray(r.events)&&r.events.length>0&&r.events.length<=2048,'event ledger missing/overflow');
  const events=Array.isArray(r.events)?r.events:[];
  need(events.every(e=>e.pid===launch.pid&&Number.isInteger(e.tid)&&e.tid>0&&e.continued===true&&e.continueError===0&&!e.decodeError&&!e.untrustedHeader),'event ownership/continuation error');
  const exits=events.filter(e=>e.eventCode===5);need(exits.length===1&&exits[0].exitCode===f.ExitCode,'actual exit event missing/double/mismatch');
  const creates=events.filter(e=>e.eventCode===3);need(creates.length===1&&events[0]===creates[0]&&creates[0].tid===launch.primaryTid,'exact initial owned CREATE missing');
  const exitIndex=events.indexOf(exits[0]);
  need(exits.length===1&&exitIndex===events.length-1&&exits[0].continuation===65538,'continued EXIT must be terminal');
  for(const event of events){
    if(Object.hasOwn(event,'imageHandleClosed'))need(event.imageHandleClosed===true,'explicit image handle close outcome is not success');
    if(event.eventCode!==3&&event.eventCode!==6)continue;
    const typed=typeof event.fileHandle==='string'&&/^0x[0-9a-fA-F]{16}$/.test(event.fileHandle);
    need(typed,'native image file handle identity unavailable');if(!typed)continue;
    const raw=BigInt(event.fileHandle),owned=raw!==0n&&raw!==0xffffffffffffffffn;
    if(owned)need(event.imageHandleClosed===true,'owned native image file handle release unconfirmed');
    else need(!Object.hasOwn(event,'imageHandleClosed'),'null/invalid image handle has contradictory close receipt');
  }
  const loader=r.loaderIdentity;
  const dllPin=Object.entries(plan.files).find(([p])=>canonical(p).endsWith('/ntdll.dll'));need(!!dllPin,'frozen ntdll input missing');
  const dllBytes=readFileSync(dllPin[0]);need(sha(dllPin[0])===dllPin[1]&&dllPin[1]===plan.ntdllSha256,'ntdll source identity changed');
  const contract=json(plan.loaderContractFile);need(sha(plan.loaderContractFile)===plan.loaderContractSha256&&plan.files[plan.loaderContractFile]===plan.loaderContractSha256,'loader contract plan binding mismatch');
  const pdbBytes=readFileSync(contract.PdbPath);need(sha(contract.PdbPath)===contract.PdbSha256&&plan.files[contract.PdbPath]===contract.PdbSha256,'frozen PDB source identity changed');
  const derived=deriveLoader(dllBytes,pdbBytes),rva=derived.TrapRva;
  for(const key of ['ImageSha256','PdbSha256','Symbol','GuidRaw','ImageAge','InfoAge','DbiAge','FunctionBeginRva','FunctionEndRva','BodySha256','TrapRva','ReachableTrapOffset','QueryExportRva','InstructionDerivationSha256'])need(contract[key]===derived[key],'loader contract derivation mismatch '+key);
  need(loader&&canonical(loader.path)===canonical(dllPin[0])&&loader.sha256===derived.ImageSha256&&loader.pdbSha256===derived.PdbSha256&&loader.symbol===derived.Symbol&&loader.guidRaw===derived.GuidRaw&&loader.imageAge===derived.ImageAge&&loader.infoAge===derived.InfoAge&&loader.dbiAge===derived.DbiAge&&loader.bodySha256===derived.BodySha256&&loader.instructionDerivationSha256===derived.InstructionDerivationSha256&&loader.contractSha256===plan.loaderContractSha256&&BigInt(loader.functionBeginHex)===BigInt(derived.FunctionBeginRva)&&BigInt(loader.functionEndHex)===BigInt(derived.FunctionEndRva)&&BigInt(loader.rvaHex)===BigInt(rva),'loader static provenance mismatch');
  const moduleIndex=loader.moduleEventIndex,module=events[moduleIndex];
  need(Number.isInteger(moduleIndex)&&moduleIndex>0&&module?.eventCode===6&&canonical(module.imagePath)===canonical(dllPin[0])&&BigInt(module.imageBase)===BigInt(loader.baseHex),'observed ntdll module/base missing');
  const expectedAddress=BigInt(loader.baseHex)+BigInt(rva);need(expectedAddress===BigInt(loader.expectedAddressHex),'loader expected address mismatch');
  const swallowed=events.filter(e=>e.eventCode===1&&e.continuation===65538);
  need(swallowed.length===1,'exactly one loader exception must be handled');
  if(swallowed.length===1){const bp=swallowed[0],at=events.indexOf(bp);need(at>moduleIndex&&at<events.indexOf(exits[0])&&bp===events.find(e=>e.eventCode===1)&&bp.exceptionCode===2147483651&&bp.firstChance===1&&bp.tid===launch.primaryTid&&BigInt(bp.exceptionAddress)===expectedAddress,'legitimate loader breakpoint trace mismatch');
    const stage=bp.startupPhase;need(stage&&stage.Phase==='OWNED_INITIAL_STARTUP'&&stage.CreateSeen===true&&stage.ModuleSeen===true&&stage.FirstException===true&&stage.MarkerProbed===true&&stage.EntryMarkerAbsent===true&&stage.ProbeCertain===true&&stage.Succeeded===true&&stage.ProbeException==='FileNotFoundException'&&stage.ProbeError===2&&Number.isInteger(stage.ProbeHResult)&&(stage.ProbeHResult&65535)===2&&canonical(stage.Path)===canonical(dir+'/target-identity.json')&&typeof stage.ElapsedMs==='string'&&/^\d+$/.test(stage.ElapsedMs),'original startup phase/marker absence unavailable');
  }
  need(events.filter(e=>e.eventCode===1&&!swallowed.includes(e)).every(e=>e.continuation===2147549185),'non-loader exception swallowed');
  const nativeRecords=events.filter(e=>e.eventCode===1&&e.exceptionCode===3221226505&&e.firstChance===0&&(e.exceptionFlags&1)!==0&&e.parameterCount>=1&&e.parameterCount<=15&&Array.isArray(e.parameters)&&e.parameters.length===e.parameterCount);
  need(nativeRecords.every(e=>events.indexOf(e)>0&&events.indexOf(e)<exitIndex),'fatal record outside owned CREATE/EXIT lifetime');
  need(f.MatchingFatalRecords===nativeRecords.length,'computed fatal-record count contradicts claim');
  for(const key of ['stdoutStartup','stderrStartup']){const ready=r[key];need(ready&&ready.Ready===true&&ready.WorkerLive===true&&ready.ThreadHandleOwned===true&&ready.Closing===false&&ready.DeadlineExpired===false&&Array.isArray(ready.Errors)&&ready.Errors.length===0&&ready.DroppedErrors===0&&ready.Succeeded===true,'pre-resume startup evidence missing '+key);}
  const h=r.targetHandles,validHandle=s=>typeof s==='string'&&/^0x[0-9a-fA-F]{16}$/.test(s)&&BigInt(s)!==0n&&BigInt(s)!==0xffffffffffffffffn;
  need(h&&h.createdPid===launch.pid&&BigInt(h.createdFileTimeHex)===BigInt(launch.createdFileTimeHex)&&canonical(h.image)===canonical(launch.image)&&h.originalsClosedBeforeDebugCreate===true&&h.debugCreateBound===true&&h.debugExitContinued===true&&h.waitIdentityVerified===true&&h.activeAlias===false,'target handle identity/lifetime unavailable');
  const handleNames=['creationReturnedProcess','creationReturnedThread','creationProcessDuplicate','creationThreadDuplicate','debugProcessSystemOwned','debugThreadSystemOwned','waitDuplicate'];
  need(handleNames.every(k=>validHandle(h[k])),'raw target handle identity missing');
  need(h.debugProcessSystemOwned===creates[0].processHandle&&h.debugThreadSystemOwned===creates[0].threadHandle,'debug event handle provenance mismatch');
  const normalized=keys=>keys.map(k=>h[k].toLowerCase());
  need(new Set(normalized(['creationReturnedProcess','creationReturnedThread','creationProcessDuplicate','creationThreadDuplicate'])).size===4,'creation duplicate has simultaneous alias');
  need(new Set(normalized(['creationProcessDuplicate','creationThreadDuplicate','debugProcessSystemOwned','debugThreadSystemOwned','waitDuplicate'])).size===5,'live wait/event/creation handles alias');
  const expectedDuplications=[['CreateProcess.returned.process','creationReturnedProcess','creationProcessDuplicate'],['CreateProcess.returned.thread','creationReturnedThread','creationThreadDuplicate'],['CREATE_PROCESS_DEBUG_EVENT.process','debugProcessSystemOwned','waitDuplicate']];
  need(Array.isArray(h.duplications)&&h.duplications.length===3&&expectedDuplications.every(([origin,source,produced],i)=>{const d=h.duplications[i];return d.origin===origin&&d.source===h[source]&&d.produced===h[produced]&&d.result===true&&d.errorValid===false&&d.error===null&&Number.isInteger(d.rawLastError)&&d.activeAlias===false&&d.inherit===false&&d.sameAccess===true;}),'original independent duplication receipts incomplete');
  const releaseOrigins=['CreateProcess.returned.process','CreateProcess.returned.thread','creation.process.independent-duplicate','creation.thread.independent-duplicate','CREATE_EVENT.process.wait-duplicate'];
  need(Array.isArray(h.releases)&&h.releases.length===5&&releaseOrigins.every((origin,i)=>h.releases[i].origin===origin&&h.releases[i].state==='NATIVE_CLOSE_SUCCEEDED'&&h.releases[i].detail===null),'owned handle release receipt incomplete');
  need(Array.isArray(r.processWaits)&&r.processWaits.length===1,'one original post-EXIT wait required');
  const wait=r.processWaits?.[0],waitSource=wait?.Source;
  need(waitSource&&waitSource.Origin==='CREATE_PROCESS_DEBUG_EVENT.independent-duplicate'&&waitSource.Handle===h.waitDuplicate&&waitSource.Pid===launch.pid&&BigInt(waitSource.CreatedFileTimeHex)===BigInt(launch.createdFileTimeHex)&&canonical(waitSource.Image)===canonical(launch.image)&&waitSource.Independent===true&&waitSource.IdentityVerified===true&&waitSource.Usable===true,'post-EXIT wait source/generation mismatch');
  need(wait&&wait.Phase==='post-continued-EXIT'&&wait.NativeCalled===true&&wait.OwnershipUnavailable===false&&wait.RawStatus===0&&wait.Signaled===true&&wait.Complete===true&&wait.DeadlineExpired===false&&wait.ErrorValid===false&&wait.Error===null&&Number.isInteger(wait.RawLastError),'raw post-EXIT signal outcome incomplete');
  need(wait&&Number.isInteger(wait.RequestedMs)&&wait.RequestedMs>=1&&wait.RequestedMs<=1000&&Number.isInteger(wait.RemainingBeforeMs)&&wait.RemainingBeforeMs>0&&wait.RemainingBeforeMs<=10000&&wait.RequestedMs<=wait.RemainingBeforeMs&&Number.isInteger(wait.RemainingAfterMs)&&wait.RemainingAfterMs>0&&wait.RemainingAfterMs<=wait.RemainingBeforeMs&&typeof wait.ElapsedMs==='string'&&/^\d+$/.test(wait.ElapsedMs)&&Number.isSafeInteger(Number(wait.ElapsedMs)),'post-EXIT shared deadline evidence incomplete');
  need(Array.isArray(r.recoveryCalls)&&r.recoveryCalls.length===0,'unexpected recovery calls cannot establish declared complete cell');
  const mode=slot.config.Mode;
  if(['timeout','descendant','observer-failure'].includes(mode)){
    need(r.descendantVerified===true&&r.descendantExitObserved===true,'descendant existence/exit unconfirmed');
    const registration=json(dir+'/descendant-registration.json'),child=json(dir+'/descendant-identity.json'),observed=r.descendantObservation;
    need(Number.isInteger(registration.childPid)&&registration.childPid>0&&registration.childPid!==launch.pid&&registration.parentPid===launch.pid&&child.pid===registration.childPid,'original descendant ancestry mismatch');
    need(observed&&observed.pid===child.pid&&observed.reportedParentPid===launch.pid&&observed.jobMember===true&&child.debuggerPresent===false&&observed.debuggerPresent===false,'actual child membership/identity missing');
    need(BigInt(child.createdFileTimeUtc)===BigInt(registration.createdFileTimeUtc)&&BigInt(child.createdFileTimeUtc)===BigInt(observed.createdFileTimeHex)&&canonical(observed.image)===canonical(slot.config.Executable),'child generation/image mismatch');
    need(observed.registrationSha256===sha(dir+'/descendant-registration.json')&&observed.identitySha256===sha(dir+'/descendant-identity.json'),'child original witness hashes mismatch');
    need(observed.exitWaitResult===0&&observed.exitCodeRead===true&&observed.exitCodeError===0,'retained child exit observation missing');
    need(readFileSync(dir+'/descendant-verified.signal').toString()==='1','child verification signal missing');
    if(mode==='descendant'){const awaited=json(dir+'/descendant-awaited.json');need(awaited.childPid===child.pid&&awaited.exitCode===0&&observed.exitCode===0,'normal child original await evidence mismatch');}
    if(mode==='observer-failure')need(r.phaseWitness?.phase==='VERIFIED_DESCENDANT_BEFORE_WAIT'&&r.phaseWitness.descendantPid===child.pid&&Number.isInteger(r.phaseWitness.eventCount)&&r.phaseWitness.eventCount<events.length,'exact observer-failure phase missing');
  }
  if(mode==='normal'){need(r.classification==='NORMAL_EXIT'&&f.ExitCode===0,'normal outcome mismatch');need(out.toString()==='capture-normal\n'&&err.toString()==='capture-stderr\n','normal raw sentinels mismatch');}
  else {need(out.length===0&&err.length===0,'unexpected synthetic raw output');}
  if(mode==='nonzero')need(r.classification==='NONZERO_EXIT_WITHOUT_MATCHED_EXCEPTION'&&f.ExitCode===23,'ordinary exit23 mismatch');
  if(mode==='descendant')need(r.classification==='NORMAL_EXIT'&&f.ExitCode===0,'normal descendant mismatch');
  if(mode==='synthetic-native'){
    need(r.classification==='NATIVE_EXCEPTION_CAPTURED'&&f.ExitCode===3221226505,'native outcome mismatch');
    const fatal=events.filter(e=>e.eventCode===1&&e.exceptionCode===3221226505&&e.firstChance===0&&(e.exceptionFlags&1)!==0);
    need(fatal.length===1&&fatal[0].parameterCount===2&&fatal[0].parameters?.[0]==='0x0000000050455246'&&fatal[0].parameters?.[1]==='0x0000000000000007'&&fatal[0].continuation===2147549185,'supplied native record/parameters/chance mismatch');
  }
  if(!['timeout','observer-failure'].includes(mode)){const computed=f.ExitCode===3221226505&&nativeRecords.length>0?'NATIVE_EXCEPTION_CAPTURED':nativeRecords.length>0?'OTHER_EXCEPTION_CAPTURED':f.ExitCode===0?'NORMAL_EXIT':'NONZERO_EXIT_WITHOUT_MATCHED_EXCEPTION';need(r.classification===computed,'computed trace classification mismatch');}
  if(mode==='timeout')need(r.classification==='INCOMPLETE'&&f.TimedOut===true&&f.ObserverError===false,'expected timeout mismatch');
  else need(f.TimedOut===false,'unexpected timeout');
  if(mode==='observer-failure')need(r.classification==='INCOMPLETE'&&f.ObserverError===true&&r.errors.length===1&&r.errors[0]==='CONTROL_ONLY_OBSERVER_FAILURE_AFTER_REGISTRATION','expected observer-failure mismatch');
  else need(f.ObserverError===false&&Array.isArray(r.errors)&&r.errors.length===0,'unexpected observer errors');
}catch(error){problems.push('evidence parse/read:'+error.message);}
const result={at:new Date().toISOString(),slot:index,mode:slot.config.Mode,verdict:problems.length===0?'PASS':'FAIL_OR_INCOMPLETE',problems,resultSha256:r?sha(dir+'/result.json'):null,scope:'Synthetic control oracle only; no native cause/fix/product timing/whole SOUND.'};
writeFileSync(dir+'/control-check.json',JSON.stringify(result,null,2),{flag:'wx'});console.log(JSON.stringify(result));if(problems.length)process.exitCode=1;
