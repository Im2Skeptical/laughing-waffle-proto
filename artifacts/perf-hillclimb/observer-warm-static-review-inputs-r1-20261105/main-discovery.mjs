import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';

// Sequential construction only. A failed cell is retained and does not remove
// later required cells from the discovery schedule. No J8 is dispatched here.
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const [k,...v]=a.replace(/^--/,'').split('=');return [k,v.join('=')];}));
assert.ok(args.id,'unique --id required');
assert.match(args.id,/^[a-zA-Z0-9_-]+$/,'simple unique run ID required');
const directory=path.resolve(`artifacts/perf-hillclimb/${args.id}`);
const populations=(args.populations??'desktop,mobile4').split(',');
const caches=(args.caches??'cold').split(',');
const seeds=(args.seeds??'123').split(',').map(Number);
const illustratedPopulations=(args['illustrated-populations']??'desktop').split(',');
const jobs=(args.jobs??'map,save,entry,performance,life').split(',').flatMap(j=>j==='map'?['map-pan','map-zoom','map-open','map-close']:[j]);
assert.ok(jobs.every(j=>['map-pan','map-zoom','map-open','map-close','save','save-opening','entry','performance','performance-continue','life','scrub'].includes(j)));
assert.ok([...populations,...illustratedPopulations].every(p=>['desktop','mobile','mobile4'].includes(p)));
assert.ok(caches.every(cache=>['cold','warm'].includes(cache)));
assert.ok(seeds.every(seed=>[123,424242,99117].includes(seed)));
for(const values of [jobs,populations,caches,seeds,illustratedPopulations])assert.equal(new Set(values).size,values.length,'duplicate discovery cells are not a distinct population');
assert.ok(!args['illustrated-populations']||args.illustrated==='1','illustrated populations require explicit illustrated=1');
assert.ok(!jobs.includes('performance')||seeds.every(seed=>seed===123),
  'real prepared New is fixed seed123: stage performance separately; use performance-continue for other saved seeds');
const schedule=seeds.flatMap(seed=>caches.flatMap(cache=>populations.flatMap(population=>
  jobs.map(job=>({seed,cache,population,job,artwork:'off'})))));
if(args.illustrated==='1')for(const seed of seeds)for(const cache of caches)for(const population of illustratedPopulations)
  schedule.push({seed,cache,population,job:'entry',artwork:'illustrated'});
await mkdir(directory);
await writeFile(path.join(directory,'schedule.json'),JSON.stringify(schedule,null,2));
const results=[];
for(const [index,cell] of schedule.entries()){
  const id=`${args.id}-${index}-${cell.population}-${cell.job}-${cell.artwork}-s${cell.seed}-${cell.cache}`;
  const argv=['scripts/perf-hillclimb/run.mjs',
    '--fixture-manifest=artifacts/perf-hillclimb/frozen-baseline-a9df52c-sourceproof-20261104/manifest.json',
    '--fixture-manifest-id=406f042f7e4a3142620b8d05023167d98893185d24347f4745740a3a3feac000',
    `--seed=${cell.seed}`,`--jobs=${cell.job}`,`--population=${cell.population}`,`--artwork=${cell.artwork}`,
    `--cache=${cell.cache}`,'--samples=1',`--id=${id}`];
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
