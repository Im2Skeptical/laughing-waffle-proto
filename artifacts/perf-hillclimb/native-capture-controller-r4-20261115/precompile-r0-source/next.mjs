import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,openSync,closeSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
const root='artifacts/perf-hillclimb/native-capture-controller-r4-20261115';
const json=f=>JSON.parse(readFileSync(f,'utf8')),sha=f=>createHash('sha256').update(readFileSync(f)).digest('hex');
const plan=json(root+'/plan.json'),admission=json(root+'/admission.json');
assert.equal(process.version,'v24.15.0');assert.equal(admission.verdict,'ACCEPTED_SYNTHETIC_SOURCE_ONLY');assert.equal(sha(root+'/plan.json'),admission.planSha256);
assert.ok(Date.now()<Date.parse('2026-11-16T01:45:00Z'),'Native reserve cutoff');
for(const[f,h]of Object.entries(plan.files))assert.equal(sha(f),h);
assert.deepEqual(plan.slots.map(s=>s.config.Mode),['normal','nonzero','synthetic-native','timeout','descendant','observer-failure']);
let next=null;
for(const slot of plan.slots){
  const receipt=slot.config.RunRoot+'/control-check.json';
  if(!existsSync(receipt)){assert.ok(!existsSync(root+'/dispatch-'+slot.index+'.json'),'Active/incomplete slot cannot repeat');next=slot;break;}
  assert.equal(json(receipt).verdict,'PASS','Prior failed/unconfirmed control stops remaining slots');
}
if(!next){console.log('Six fixed slots complete; no automatic additional trials.');process.exit(0);}
const first=existsSync(root+'/batch-start.json')?json(root+'/batch-start.json'):{at:new Date().toISOString(),workDeadlineMs:Date.now()+90000,terminalDeadlineMs:Date.now()+108000};
if(!existsSync(root+'/batch-start.json'))writeFileSync(root+'/batch-start.json',JSON.stringify(first,null,2),{flag:'wx'});
assert.ok(Date.now()<first.workDeadlineMs,'Fixed batch90s work cap reached');
writeFileSync(root+'/dispatch-'+next.index+'.json',JSON.stringify({at:new Date().toISOString(),pid:process.pid,index:next.index,planSha256:sha(root+'/plan.json')},null,2),{flag:'wx'});
const log=openSync(next.config.RunRoot+'/host.log','wx');let code=null,signal=null,error=null,expired=false,timer;
await new Promise(resolve=>{
  const child=spawn(plan.powerShell,['-NoProfile','-NonInteractive','-File',root+'/invoke-control.ps1','-Index',String(next.index)],{stdio:['ignore',log,log],windowsHide:true});
  writeFileSync(next.config.RunRoot+'/supervisor-launch.json',JSON.stringify({at:new Date().toISOString(),supervisorPid:process.pid,hostPid:child.pid,slot:next.index},null,2),{flag:'wx'});
  timer=setTimeout(()=>{expired=true;const remaining=first.terminalDeadlineMs-Date.now();const killed=remaining>0?spawnSync(plan.powerShell,['-NoProfile','-NonInteractive','-File',root+'/stop-owned-host.ps1','-Index',String(next.index),'-ExpectedPid',String(child.pid)],{encoding:'utf8',windowsHide:true,timeout:Math.max(1,Math.min(8000,remaining))}):{status:null,signal:null,error:Error('Terminal deadline exhausted before stop')};writeFileSync(next.config.RunRoot+'/supervisor-timeout.json',JSON.stringify({status:killed.status,signal:killed.signal,error:killed.error?.message??null,stdout:killed.stdout,stderr:killed.stderr},null,2),{flag:'wx'});child.unref();resolve();},Math.max(1,Math.min(35000,first.workDeadlineMs-Date.now())));
  child.once('error',e=>{error=e.message;resolve();});child.once('exit',(c,s)=>{code=c;signal=s;resolve();});
});clearTimeout(timer);closeSync(log);
const output={at:new Date().toISOString(),slot:next.index,hostExitCode:code,hostSignal:signal,hostError:error,expired,scope:'Supervisor outcome only; no automatic native/cleanup/control PASS.'};
writeFileSync(next.config.RunRoot+'/supervisor-result.json',JSON.stringify(output,null,2),{flag:'wx'});
console.log(JSON.stringify(output));
const remaining=first.terminalDeadlineMs-Date.now();assert.ok(remaining>0,'Terminal deadline exhausted before checker; slot consumed/incomplete');
const check=spawnSync(process.execPath,[root+'/check-control.mjs',String(next.index)],{stdio:'inherit',windowsHide:true,timeout:Math.max(1,Math.min(10000,remaining))});
if(check.status!==0||check.signal||check.error)process.exitCode=1;
