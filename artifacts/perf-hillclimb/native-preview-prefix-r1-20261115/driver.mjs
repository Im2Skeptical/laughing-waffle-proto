import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,openSync,closeSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import path from 'node:path';
const root='artifacts/perf-hillclimb/native-preview-prefix-r1-20261115';
const json=f=>JSON.parse(readFileSync(f,'utf8')),hash=f=>createHash('sha256').update(readFileSync(f)).digest('hex');
const save=(name,data)=>writeFileSync(root+'/'+name+'.json',JSON.stringify(data,null,2));
assert.equal(process.version,'v24.15.0');
assert.ok(!existsSync(root+'/launch.json')&&!existsSync(root+'/fixture-registration.json'),'Never repeat an attempted prefix');
const admission=json(root+'/admission.json');assert.equal(admission.verdict,'ACCEPTED');
for(const name of ['driver.mjs','probe.mjs','cleanup-owned.ps1','source-authentication.json'])assert.equal(hash(root+'/'+name),admission.files[name]);
const authority=json('artifacts/perf-hillclimb/j8-paired-wait-progress-r1-20261115/plan.json');
function stable(){const changes=[];for(const[f,h]of Object.entries(authority.sources))if(hash(f)!==h)changes.push(f);for(const[f,h]of Object.entries(authority.assets))if(hash('dist/'+f)!==h)changes.push('dist/'+f);return changes;}
assert.deepEqual(stable(),[]);
const log=openSync(root+'/probe.log','wx'),started=new Date().toISOString();let code=null,signal=null,expired=false,spawnError=null,kill=null,timer;
try{await new Promise(resolve=>{const child=spawn(process.execPath,[root+'/probe.mjs'],{stdio:['ignore',log,log],windowsHide:true});save('launch',{started,parentPid:process.pid,childPid:child.pid,deadline:'2026-11-16T02:40:00Z',workLimitMs:300000});
  timer=setTimeout(()=>{expired=true;const r=spawnSync('taskkill',['/PID',String(child.pid),'/T','/F'],{encoding:'utf8',windowsHide:true,timeout:10000});kill={status:r.status,signal:r.signal,error:r.error?.message??null,stdout:r.stdout,stderr:r.stderr};child.unref();resolve();},300000);
  child.once('error',error=>{spawnError=error.message;resolve();});child.once('exit',(c,s)=>{code=c;signal=s;resolve();});});}
finally{clearTimeout(timer);closeSync(log);}
let outerCleanup=null;
if(existsSync(root+'/fixture-registration.json')){const fixture=json(root+'/fixture-registration.json'),file=path.resolve(root+'/cleanup-outer.json');const r=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-File',path.resolve(root+'/cleanup-owned.ps1'),'-FixtureRoot',fixture.fixture,'-SinceIso',fixture.at,'-OutputPath',file],{encoding:'utf8',windowsHide:true,timeout:20000});outerCleanup={status:r.status,signal:r.signal,error:r.error?.message??null,receipt:existsSync(file)?json(file):null};}
const probe=existsSync(root+'/probe-result.json')?json(root+'/probe-result.json'):null,changes=stable();
const fixtureRegistration=existsSync(root+'/fixture-registration.json')?json(root+'/fixture-registration.json'):null;
const canonical=value=>typeof value==='string'&&value.length>0&&path.isAbsolute(value)?path.resolve(value).toLowerCase():null;
const registeredRoot=canonical(fixtureRegistration?.fixture);
const cleanupVerified=outerCleanup?.status===0&&outerCleanup.signal===null&&outerCleanup.error===null&&
  Array.isArray(outerCleanup.receipt?.remaining)&&outerCleanup.receipt.remaining.length===0&&
  Array.isArray(outerCleanup.receipt?.errors)&&outerCleanup.receipt.errors.length===0&&
  registeredRoot!==null&&canonical(outerCleanup.receipt.fixtureRoot)===registeredRoot&&outerCleanup.receipt.since===fixtureRegistration.at;
const evidenceProblems=[];const requireEvidence=(condition,problem)=>{if(!condition)evidenceProblems.push(problem);};
requireEvidence(registeredRoot!==null,'missing registered absolute fixture root');
requireEvidence(canonical(probe?.fixture)===registeredRoot&&registeredRoot!==null,'probe fixture differs from registration');
requireEvidence(Array.isArray(probe?.helperCalls),'helperCalls must be an array');
const calls=Array.isArray(probe?.helperCalls)?probe.helperCalls:[],stages=['main','main','worktrees/task-a','worktrees/task-b'];
requireEvidence(calls.length>=1&&calls.length<=4,'missing or excess original helper calls');
const readRaw=(index,name,declared)=>{
  if(declared===null)return null;
  if(!Number.isSafeInteger(declared)||declared<0||declared>1048576){evidenceProblems.push('invalid '+name+' byte count at'+index);return null;}
  try{const bytes=readFileSync(root+'/call-'+index+'-'+name+'.txt');requireEvidence(bytes.length===declared,'raw '+name+' length mismatch at'+index);return bytes;}
  catch(error){evidenceProblems.push('missing raw '+name+' at'+index+':'+error.code);return null;}
};
let exact=false;
for(const [index,rawCall]of calls.slice(0,4).entries()){
  const c=rawCall&&typeof rawCall==='object'&&!Array.isArray(rawCall)?rawCall:{};
  requireEvidence(c===rawCall,'missing/invalid helper-call object at'+index);
  const stage=stages[index],expectedCwd=registeredRoot===null?null:canonical(path.join(fixtureRegistration.fixture,stage==='main'?'':stage));
  const cwdMatches=expectedCwd!==null&&canonical(c?.cwd)===expectedCwd;
  requireEvidence(c?.index===index&&c.stage===stage,'wrong original call order/stage at'+index);
  requireEvidence(cwdMatches,'wrong/missing registered cwd at'+index);
  requireEvidence(Number.isInteger(c?.status)||c?.status===null,'missing/invalid exit status at'+index);
  requireEvidence(c?.signal===null||typeof c?.signal==='string','missing signal evidence at'+index);
  requireEvidence(c?.stdoutBytes!==null,'stdout unavailable at'+index);
  requireEvidence(c?.stderrAvailable===(c?.stderrBytes!==null),'stderr availability mismatch at'+index);
  if(c?.status!==0)requireEvidence(c?.stderrBytes!==null,'failed-call stderr unavailable at'+index);
  const stdout=readRaw(index,'stdout',c?.stdoutBytes),stderr=readRaw(index,'stderr',c?.stderrBytes);
  try{const start=json(root+'/call-'+index+'-start.json');requireEvidence(start.index===index&&start.stage===stage&&canonical(start.cwd)===expectedCwd&&start.timeoutMs===40000,'missing/inconsistent original start at'+index);
    requireEvidence(Number.isInteger(start.fixturePort)&&start.fixturePort>=1&&start.fixturePort<=65524,'invalid isolated port at'+index);
    if(cwdMatches){const subject=readFileSync(path.join(c.cwd,'scripts/local-preview.mjs'),'utf8').replace(/\r\n/g,'\n'),expected=readFileSync('scripts/local-preview.mjs','utf8').replace(/\r\n/g,'\n').replace('const firstPort = 5184;','const firstPort = '+start.fixturePort+';');
      requireEvidence(subject===expected&&createHash('sha256').update(subject).digest('hex')===start.subjectNormalizedSha256,'copied subject identity mismatch at'+index);}
    if(c.status===0){const match=stdout?.toString().match(/Local preview: (http:\/\/localhost:(\d+)\/)/);requireEvidence(!!match&&Number(match[2])>=start.fixturePort&&Number(match[2])<start.fixturePort+12,'missing/out-of-range successful startup URL at'+index);}
  }catch(error){evidenceProblems.push('missing start/subject evidence at'+index+':'+error.message);}
  const observed=cwdMatches&&c.stage===stage&&stage.startsWith('worktrees/')&&typeof c.status==='number'&&(c.status>>>0)===3221226505&&c.signal===null&&Number.isInteger(c.pid)&&c.pid>0&&stdout?.length===0&&stderr?.length===0;
  requireEvidence(c.exactPriorSignature===observed,'prior-signature metadata mismatch at'+index);exact||=observed;
  if(index<calls.length-1)requireEvidence(c.status===0,'original prefix continued after failed helper');
}
if(probe?.prefixCompleted){requireEvidence(calls.length===4&&calls.every(c=>c?.status===0&&c?.signal===null)&&!probe.originalError&&code===0,'complete prefix requires four successful original calls and normal exit');}
if(exact){const last=calls.at(-1);requireEvidence(!probe?.prefixCompleted&&code===1&&typeof probe?.originalError?.status==='number'&&(probe.originalError.status>>>0)===3221226505&&probe.originalError.signal===null&&probe.originalError.pid===last?.pid,'native signature missing original propagated error');}
const completed=!expired&&!spawnError&&signal===null&&[0,1].includes(code)&&probe?.finished&&cleanupVerified&&changes.length===0&&evidenceProblems.length===0;
const classification=!completed?'INCOMPLETE_OR_INFRASTRUCTURE':exact?'RED_PRIOR_NATIVE_SIGNATURE_REPRODUCED':probe.prefixCompleted&&!probe.originalError?'NO_REPRODUCTION_NOT_A_FIX':'OTHER_FAILURE_NOT_PRIOR_NATIVE_SIGNATURE';
save('result',{started,finished:new Date().toISOString(),code,signal,expired,spawnError,kill,classification,cleanupVerified,outerCleanup,evidenceProblems,sourceAssetChanges:changes,probe,scope:'One bounded original-prefix diagnostic. No product latency, full test pass, native cause/fix, neutrality, scoring or retry implied.'});
console.log(JSON.stringify({classification,code,signal,expired,cleanupVerified,sourceAssetChanges:changes,artifact:root}));
if(!completed)process.exitCode=1;
