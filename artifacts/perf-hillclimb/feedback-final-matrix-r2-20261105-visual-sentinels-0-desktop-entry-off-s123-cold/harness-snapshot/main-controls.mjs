import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
const id=process.argv[2];assert.ok(id,'unique control ID required');
const directory=`artifacts/perf-hillclimb/${id}`;await mkdir(directory);
const cases=[
  {control:'wrong-target',job:'scrub-anchor',exit:1,error:/Timeout 1500ms/},
  {control:'stale-generation',job:'map-pan',exit:1,error:/matching current-generation/},
  {control:'clamp-bypass',job:'scrub-anchor',exit:1,error:/J5 observed unrevealed browse access/},
  {control:'wrong-save',job:'save-opening',exit:1,error:/persisted\/source state differs/},
  {control:'deferred-save',job:'save-opening',exit:0},
];
await writeFile(`${directory}/schedule.json`,JSON.stringify(cases,(k,v)=>v instanceof RegExp?v.source:v,2));
const results=[];
for(const c of cases){
  const runId=`${id}-${c.control}`;
  const argv=['--experimental-vm-modules','scripts/perf-hillclimb/run.mjs',
    '--fixture-manifest=artifacts/perf-hillclimb/frozen-baseline-a9df52c-sourceproof-20261104/manifest.json',
    '--fixture-manifest-id=406f042f7e4a3142620b8d05023167d98893185d24347f4745740a3a3feac000',
    '--seed=123',`--jobs=${c.job}`,'--population=desktop','--artwork=off','--cache=cold','--samples=1',`--control=${c.control}`,`--id=${runId}`];
  console.log(`[main-controls] ${runId}`);
  const exit=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,argv,{stdio:'inherit',windowsHide:true});child.once('error',reject);child.once('exit',resolve);});
  const failure=await readFile(`artifacts/perf-hillclimb/${runId}/failure.txt`,'utf8').catch(()=>null);
  let matched=exit===c.exit&&(!c.error||c.error.test(failure??'')),productWitness=null;
  if(c.job==='scrub-anchor'){
    const diagnostic=JSON.parse(await readFile(`artifacts/perf-hillclimb/${runId}/failure-J5-scrub-anchor.json`,'utf8'));
    const [row]=(await readFile(`artifacts/perf-hillclimb/${runId}/observations.jsonl`,'utf8')).trim().split('\n').map(JSON.parse);
    const actual=diagnostic.actual.passive,input=row.inputTimingSnapshot;
    productWitness={viewedSec:actual.runner.viewedSec,latchedSec:actual.graph.latchedForecastScrubSec,
      inputCapSec:input?.graph.browseCapSec,actualToken:actual.graph.asyncToken,inputToken:input?.graph.asyncToken,
      inputRevealActive:input?.graph.targetSec>input?.graph.revealedSec};
    matched&&=productWitness.inputRevealActive&&actual.runner.forecastPreview===true;
    if(c.control==='wrong-target')matched&&=actual.runner.viewedSec===17;
    if(c.control==='clamp-bypass')matched&&=actual.runner.viewedSec===3918&&actual.graph.browseCapSec<3918;
  }
  if(c.control==='stale-generation'){
    const fault=JSON.parse(await readFile(`artifacts/perf-hillclimb/${runId}/stale-generation-deliveries.json`,'utf8'));
    const [row]=(await readFile(`artifacts/perf-hillclimb/${runId}/observations.jsonl`,'utf8')).trim().split('\n').map(JSON.parse);
    const delivered=(row.workerEvents??[]).filter(e=>e.message==='chunkResult'&&e.timelineToken==='stale-control-generation');
    productWitness={mutatedDeliveries:fault.events.length,observedStaleReplies:delivered.length,input:row.inputTimingSnapshot.graph};
    matched&&=fault.armed&&fault.events.length>0&&delivered.length>0&&row.inputTimingSnapshot.graph.projection.signatureMatches===true;
  }
  results.push({control:c.control,runId,argv,exit,expectedExit:c.exit,matched,productWitness,failure});
  await writeFile(`${directory}/results.json`,JSON.stringify(results,null,2));
}
assert.equal(results.length,cases.length);
assert.ok(results.every(r=>r.matched),'every actual-product control must execute and reach its intended assertion');
console.log(`[main-controls] all five intended control outcomes observed; ${directory}`);
