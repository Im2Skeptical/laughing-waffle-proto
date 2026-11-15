// New COHERENT VIRTUAL source-schema receipts, never an actual native cell.
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';import {parseEvidenceJson} from './strict-evidence-json.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));const clone=v=>JSON.parse(JSON.stringify(v));
export function makeOwnerFixture(){
  const r=clone(parseEvidenceJson(fs.readFileSync(path.join(root,'managed-report-io-r4','result.json')))),c=r.controller,p=r.processes[0],id=p.identity;
  const close=origin=>({origin,state:'NATIVE_CLOSE_SUCCEEDED',detail:null,nativeCalled:true,result:true,rawLastError:121,errorValid:false,error:null});
  const dup=(origin,source,produced)=>({origin,source,produced,result:true,errorValid:false,error:null,rawLastError:121,activeAlias:false,inherit:false,sameAccess:true});
  const h={createdPid:id.Pid,createdFileTimeHex:id.CreatedFileTime,image:id.Image,creationReturnedProcess:'0x0000000000000100',creationReturnedThread:'0x0000000000000104',creationProcessDuplicate:'0x00000000000f4240',creationThreadDuplicate:'0x00000000000f4244',originalsClosedBeforeDebugCreate:true,debugProcessSystemOwned:p.systemProcess,debugThreadSystemOwned:p.systemPrimaryThread,debugCreateBound:true,debugExitContinued:true,waitDuplicate:'0x00000000000f4248',waitIdentityVerified:true,activeAlias:false};
  h.duplications=[dup('CreateProcess.returned.process',h.creationReturnedProcess,h.creationProcessDuplicate),dup('CreateProcess.returned.thread',h.creationReturnedThread,h.creationThreadDuplicate),dup('CREATE_PROCESS_DEBUG_EVENT.process',h.debugProcessSystemOwned,h.waitDuplicate)];
  h.releases=['CreateProcess.returned.process','CreateProcess.returned.thread','creation.process.independent-duplicate','creation.thread.independent-duplicate','CREATE_EVENT.process.wait-duplicate'].map(close);
  const stdin=close('stdin.NUL'),jobClose=close('job');
  r.owner={ownerThread:c.startup.CreatingThread,startup:clone(c.startup),targetHandles:h,additionalRootWaits:[clone(c.extraRootWait)],recoveryCalls:[],stdin,jobClose,errors:[],rollback:[],nonBlockingAbortRequested:false,eventBufferReleased:true,hostExitRequired:false,scope:'VIRTUAL_SOURCE_SCHEMA_FIXTURE_NOT_NATIVE_EVIDENCE'};
  c.rootRelease.Evidence={target:clone(h),stdin:clone(stdin),errors:[]};c.jobClose.Evidence=clone(jobClose);
  for(const name of ['stdout','stderr'])r[name].releases=['pipe.read','pipe.write','native-handle'].map(close);
  const first=r.events.find(e=>e.eventCode===1),module=r.events.find(e=>e.eventCode===6);
  const expected={rootPid:id.Pid,imagePath:id.Image,imageSha256:id.ImageSha256,imageBytes:Number(p.originalProbe.ImageBytes),rootDir:path.win32.dirname(first.startupPhase.Path),loaderPath:module.image.Path,loaderSha256:module.image.Sha256,trapRva:'0x0000000000000035'};
  return {fixtureKind:'VIRTUAL_OWNER_RAW_TREE_NO_RUNTIME_TARGET_OR_HOST_ACCEPTANCE',report:r,expected,rawFiles:{stdout:Buffer.alloc(0),stderr:Buffer.alloc(0)}};
}
