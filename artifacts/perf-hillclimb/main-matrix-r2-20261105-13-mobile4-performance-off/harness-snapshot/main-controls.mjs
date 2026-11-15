import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
const id=process.argv[2];assert.ok(id,'unique control ID required');
const directory=`artifacts/perf-hillclimb/${id}`;await mkdir(directory);
const cases=[
  {control:'wrong-target',job:'scrub-anchor',exit:1,error:/Timeout 1500ms/},
  {control:'stale-generation',job:'scrub-anchor',exit:1,error:/Timeout 1500ms/},
  {control:'clamp-bypass',job:'scrub-anchor',exit:1,error:/Timeout 1500ms/},
  {control:'wrong-save',job:'save-opening',exit:1,error:/persisted\/source state differs/},
  {control:'deferred-save',job:'save-opening',exit:0},
];
await writeFile(`${directory}/schedule.json`,JSON.stringify(cases,(k,v)=>v instanceof RegExp?v.source:v,2));
const results=[];
for(const c of cases){
  const runId=`${id}-${c.control}`;
  const argv=['scripts/perf-hillclimb/run.mjs',
    '--fixture-manifest=artifacts/perf-hillclimb/frozen-baseline-a9df52c-sourceproof-20261104/manifest.json',
    '--fixture-manifest-id=406f042f7e4a3142620b8d05023167d98893185d24347f4745740a3a3feac000',
    '--seed=123',`--jobs=${c.job}`,'--population=desktop','--artwork=off','--cache=cold','--samples=1',`--control=${c.control}`,`--id=${runId}`];
  console.log(`[main-controls] ${runId}`);
  const exit=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,argv,{stdio:'inherit',windowsHide:true});child.once('error',reject);child.once('exit',resolve);});
  const failure=await readFile(`artifacts/perf-hillclimb/${runId}/failure.txt`,'utf8').catch(()=>null);
  const matched=exit===c.exit&&(!c.error||c.error.test(failure??''));
  results.push({control:c.control,runId,argv,exit,expectedExit:c.exit,matched,failure});
  await writeFile(`${directory}/results.json`,JSON.stringify(results,null,2));
}
assert.equal(results.length,cases.length);
assert.ok(results.every(r=>r.matched),'every actual-product control must execute and reach its intended assertion');
console.log(`[main-controls] all five intended control outcomes observed; ${directory}`);
