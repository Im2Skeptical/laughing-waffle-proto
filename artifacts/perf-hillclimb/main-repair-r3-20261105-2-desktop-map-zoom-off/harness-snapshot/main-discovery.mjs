import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';

// Sequential construction only. A failed cell is retained and does not remove
// later required cells from the discovery schedule. No J8 is dispatched here.
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const [k,...v]=a.replace(/^--/,'').split('=');return [k,v.join('=')];}));
assert.ok(args.id,'unique --id required');
const directory=path.resolve(`artifacts/perf-hillclimb/${args.id}`);
await mkdir(directory);
const populations=(args.populations??'desktop,mobile4').split(',');
const jobs=(args.jobs??'map,save,entry,performance,life').split(',').flatMap(j=>j==='map'?['map-pan','map-zoom','map-open','map-close']:[j]);
assert.ok(jobs.every(j=>['map-pan','map-zoom','map-open','map-close','save','save-opening','entry','performance','performance-continue','life','scrub'].includes(j)));
assert.ok(populations.every(p=>['desktop','mobile4'].includes(p)));
const schedule=populations.flatMap(population=>jobs.map(job=>({population,job,artwork:'off'})));
if(args.illustrated==='1')schedule.push({population:'desktop',job:'entry',artwork:'illustrated'});
await writeFile(path.join(directory,'schedule.json'),JSON.stringify(schedule,null,2));
const results=[];
for(const [index,cell] of schedule.entries()){
  const id=`${args.id}-${index}-${cell.population}-${cell.job}-${cell.artwork}`;
  const argv=['scripts/perf-hillclimb/run.mjs',
    '--fixture-manifest=artifacts/perf-hillclimb/frozen-baseline-a9df52c-sourceproof-20261104/manifest.json',
    '--fixture-manifest-id=406f042f7e4a3142620b8d05023167d98893185d24347f4745740a3a3feac000',
    '--seed=123',`--jobs=${cell.job}`,`--population=${cell.population}`,`--artwork=${cell.artwork}`,
    '--cache=cold','--samples=1',`--id=${id}`];
  console.log(`[main-discovery] ${id}`);
  const started=new Date().toISOString();
  const exitCode=await new Promise((resolve,reject)=>{
    const child=spawn(process.execPath,argv,{stdio:'inherit',windowsHide:true});
    child.once('error',reject);child.once('exit',resolve);
  });
  results.push({...cell,id,argv,started,finished:new Date().toISOString(),exitCode});
  await writeFile(path.join(directory,'results.json'),JSON.stringify(results,null,2));
}
console.log(`[main-discovery] executed=${results.length} failed=${results.filter(r=>r.exitCode!==0).length}; ${directory}`);
process.exitCode=results.some(r=>r.exitCode!==0)?1:0;
