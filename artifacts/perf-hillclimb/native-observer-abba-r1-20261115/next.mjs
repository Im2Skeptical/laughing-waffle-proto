// Execute at most one predeclared slot. No replacement or repeat.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root='artifacts/perf-hillclimb/native-observer-abba-r1-20261115';
const json=f=>JSON.parse(readFileSync(f,'utf8')),sha=f=>createHash('sha256').update(readFileSync(f)).digest('hex');
const plan=json(root+'/plan.json'),admission=json(root+'/admission.json');
assert.equal(process.version,plan.node);assert.equal(admission.verdict,'ACCEPTED');
assert.equal(sha(root+'/plan.json'),admission.planSha256);
assert.ok(Date.now()<Date.parse('2026-11-16T01:45:00Z'),'No new leaf inside final reserve');
assert.deepEqual(plan.order,['A','B','B','A']);assert.equal(plan.trials.length,4);
for(const [file,hash]of Object.entries(plan.files))assert.equal(sha(root+'/'+file),hash);
for(const trial of plan.trials)for(const[file,hash]of Object.entries(trial.files))assert.equal(sha(trial.root+'/'+file),hash);
let next=null;
for(const trial of plan.trials){
  if(!existsSync(trial.root+'/result.json')){
    assert.ok(!existsSync(trial.root+'/launch.json')&&!existsSync(trial.root+'/fixture-registration.json'),'Attempt is active or incomplete; do not repeat');
    next=trial;break;
  }
  const result=json(trial.root+'/result.json');
  assert.ok(['NO_REPRODUCTION_NOT_A_FIX','RED_PRIOR_NATIVE_SIGNATURE_REPRODUCED','OTHER_FAILURE_NOT_PRIOR_NATIVE_SIGNATURE'].includes(result.classification),'Prior infrastructure/identity/cleanup failure stops batch');
  assert.equal(result.cleanupVerified,true);assert.deepEqual(result.evidenceProblems,[]);assert.deepEqual(result.sourceAssetChanges,[]);
}
if(!next){console.log('Fixed four slots complete. No automatic additional trials.');process.exit(0);}
const receipt=root+'/slot-'+next.index+'-dispatch.json';assert.ok(!existsSync(receipt),'Never dispatch a slot twice');
writeFileSync(receipt,JSON.stringify({at:new Date().toISOString(),pid:process.pid,index:next.index,id:next.id,mode:next.mode,planSha256:sha(root+'/plan.json')},null,2),{flag:'wx'});
const r=spawnSync(process.execPath,[next.root+'/driver.mjs'],{stdio:'inherit',windowsHide:true,timeout:345000});
console.log(JSON.stringify({slot:next.id,status:r.status,signal:r.signal,error:r.error?.message??null}));
process.exitCode=r.status===0&&r.signal===null&&!r.error?0:1;
