// Run from the preserved performance checkout. Orchestration only: unchanged
// audited run.mjs argv, one browser at a time, no timings taken in this driver.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync,openSync,closeSync} from 'node:fs';
import {execFileSync,spawn} from 'node:child_process';
import {assertDiscoveryCell} from '../../../scripts/perf-hillclimb/job-schedule.mjs';
const directory='artifacts/perf-hillclimb/continue-knowledge-remainder-r1-20261115';
const originalDirectory='artifacts/perf-hillclimb/continue-knowledge-coverage-r1-20261115';
const digest=data=>createHash('sha256').update(data).digest('hex');
const json=file=>JSON.parse(readFileSync(file));
const save=(file,value)=>writeFileSync(`${directory}/${file}.json`,JSON.stringify(value,null,2));
mkdirSync(directory,{recursive:true});
const planFile=`${directory}/plan.json`;
if(!existsSync(planFile)){
  const original=json(`${originalDirectory}/plan.json`),prior=json(`${originalDirectory}/results.json`);
  assert.equal(prior.length,24);assert.equal(prior.at(-1).index,23);assert.equal(prior.at(-1).exitCode,3221226505);assert.equal(prior.at(-1).cleanupVerified,false);
  const recovery=json(`${originalDirectory}/native-reproduction-result.json`);
  const externalRecovery=json(`${originalDirectory}/external-recovery-2304.json`);
  assert.deepEqual(externalRecovery.matchingProcesses,[]);assert.deepEqual(externalRecovery.probe18244Listeners,[]);assert.equal(externalRecovery.originalFailedCleanupStillUnresolved,true);
  assert.equal(recovery.failed,false);assert.deepEqual(recovery.sourceAssetChanges,[]);
  assert.ok(recovery.ownedContextCleanup.length>0&&recovery.ownedContextCleanup.every(c=>c.closed&&c.pageClosed));
  assert.ok(recovery.ownedBrowserCleanup.length>0&&recovery.ownedBrowserCleanup.every(b=>b.closed));assert.deepEqual(recovery.cleanupErrors,[]);
  const {sources,assets,build}=original;
  const cells=original.cells.slice(24).map((old,index)=>{
    const id=`continue-knowledge-remainder-r1-20261115-${old.index}-${old.seed}-${old.cache}-${old.population}-${old.job}`;
    return {...old,index,id,originalIndex:old.index,originalPlannedId:old.id,argv:old.argv.map(arg=>arg.startsWith('--id=')?`--id=${id}`:arg)};
  });
  assert.equal(cells.length,12);
  save('plan',{created:new Date().toISOString(),phaseA:'NOT SOUND',sources,assets,build,cells,originalDirectory,originalPlanSha256:digest(readFileSync(`${originalDirectory}/plan.json`)),originalResultsSha256:digest(readFileSync(`${originalDirectory}/results.json`)),recoverySha256:digest(readFileSync(`${originalDirectory}/native-reproduction-result.json`)),externalRecoverySha256:digest(readFileSync(`${originalDirectory}/external-recovery-2304.json`)),driverSha256:digest(readFileSync(new URL(import.meta.url))),scope:'Only12 previously unexecuted original indices24-35, same frozen source/config/runner, mapped fresh IDs. Original23 successes and native-terminated attempt remain unchanged and unresolved; standalone diagnostic is not a replacement. No clean36/36 suite, root-cause, tail, speed or overhead claim. Recovery independently inventoried, no original cleanup flag overridden. Soft20-minute chunks; stop new cells01:55Z.'});
}
const plan=json(planFile);
assert.equal(digest(readFileSync(new URL(import.meta.url))),plan.driverSha256,'orchestration driver stays fixed');
assert.equal(digest(readFileSync(`${originalDirectory}/plan.json`)),plan.originalPlanSha256);
assert.equal(digest(readFileSync(`${originalDirectory}/results.json`)),plan.originalResultsSha256);
assert.equal(digest(readFileSync(`${originalDirectory}/native-reproduction-result.json`)),plan.recoverySha256);
assert.equal(digest(readFileSync(`${originalDirectory}/external-recovery-2304.json`)),plan.externalRecoverySha256);
function stable(){
  const changed=[];
  for(const [file,hash]of Object.entries(plan.sources))if(digest(readFileSync(file))!==hash)changed.push(file);
  for(const [file,hash]of Object.entries(plan.assets))if(digest(readFileSync(`dist/${file}`))!==hash)changed.push(`dist/${file}`);
  assert.deepEqual(changed,[],'source/contract/app assets remain frozen across all chunks');
}
stable();
const results=existsSync(`${directory}/results.json`)?json(`${directory}/results.json`):[];
assert.ok(results.every((r,i)=>r.index===i),'append-only ordered completed cells');
assert.ok(results.every(r=>r.cleanupVerified===true),'inspect unresolved cleanup before another workload');
const chunkStart=Date.now(),budgetMs=Number(process.argv[2]??20)*60000;
assert.ok(Number.isFinite(budgetMs)&&budgetMs>0&&budgetMs<=25*60000);
const stopNewAt=Date.parse('2026-11-15T01:55:00Z');
const chunk=[];
for(const cell of plan.cells.slice(results.length)){
  if(Date.now()-chunkStart>=budgetMs||Date.now()>=stopNewAt)break;
  stable();
  assert.equal(existsSync(`artifacts/perf-hillclimb/${cell.id}`),false,'interrupted leaf must be inspected, never overwritten/rerun under same id');
  console.log(`[remainder] ${cell.index+1}/12 original${cell.originalIndex} ${cell.seed}/${cell.cache}/${cell.population}/${cell.job}`);
  const log=openSync(`${directory}/cell-${cell.index}.log`,'wx'),started=new Date().toISOString();
  let exitCode;
  try{exitCode=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,cell.argv,{stdio:['ignore',log,log],windowsHide:true});child.once('error',reject);child.once('exit',resolve);});}finally{closeSync(log);}
  stable();
  const leaf=json(`artifacts/perf-hillclimb/${cell.id}/manifest.json`);
  let actualLaunchValidation;
  try{actualLaunchValidation=assertDiscoveryCell(cell,leaf);}catch(error){actualLaunchValidation={ok:false,error:error.message};}
  const contexts=leaf.ownedContextCleanup??[],browsers=leaf.ownedBrowserCleanup??[];
  const cleanupVerified=contexts.length>0&&browsers.length>0&&contexts.every(c=>c.closed&&c.pageClosed)&&browsers.every(b=>b.closed)&&!(leaf.cleanupErrors?.length);
  const result={...cell,started,finished:new Date().toISOString(),exitCode,manifestPresent:true,actualLaunchValidation,cleanupVerified,ownedContextCleanup:contexts,ownedBrowserCleanup:browsers,cleanupErrors:leaf.cleanupErrors??[]};
  results.push(result);chunk.push(result);save('results',results);
  console.log(`[remainder] original${cell.originalIndex} exit${exitCode}; total${results.length}/12`);
  if(!cleanupVerified)break;
}
stable();
const suffix=new Date().toISOString().replace(/[:.]/g,'-');
save(`chunk-${suffix}`,{started:new Date(chunkStart).toISOString(),finished:new Date().toISOString(),cells:chunk.map(r=>r.index),originalIndices:chunk.map(r=>r.originalIndex),completed:results.length,failed:results.filter(r=>r.exitCode!==0||!r.actualLaunchValidation.ok||!r.cleanupVerified).map(r=>r.originalIndex),sourceAssetChanges:[],nextIndex:results.length<12?results.length:null});
console.log(JSON.stringify({completed:results.length,total:12,failed:results.filter(r=>r.exitCode!==0||!r.actualLaunchValidation.ok||!r.cleanupVerified).map(r=>r.originalIndex),nextIndex:results.length<12?results.length:null,artifact:directory,originalNativeFailureUnresolved:true}));
