// Run from the preserved performance checkout. Orchestration only: unchanged
// audited run.mjs argv, one browser at a time, no timings taken in this driver.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync,openSync,closeSync} from 'node:fs';
import {execFileSync,spawn} from 'node:child_process';
import {assertDiscoveryCell} from '../../../scripts/perf-hillclimb/job-schedule.mjs';
const directory='artifacts/perf-hillclimb/continue-knowledge-coverage-r1-20261115';
const digest=data=>createHash('sha256').update(data).digest('hex');
const json=file=>JSON.parse(readFileSync(file));
const save=(file,value)=>writeFileSync(`${directory}/${file}.json`,JSON.stringify(value,null,2));
mkdirSync(directory,{recursive:true});
const planFile=`${directory}/plan.json`;
if(!existsSync(planFile)){
  const files=execFileSync('rg',['--files','src','scripts'],{encoding:'utf8'}).trim().split(/\r?\n/).map(f=>f.replaceAll('\\','/')).sort();
  files.push('package.json','package-lock.json','docs/performance/perf-hillclimb-20261104/HARNESS.md');
  const sources=Object.fromEntries(files.map(f=>[f,digest(readFileSync(f))]));
  const build=json('dist/build-manifest.json');
  const assetFiles=['bundle','worker','saveLoadWorker','stylesheet'].map(k=>build[k]);
  assetFiles.push('images/dev-fixtures/performance-start.json.gz');
  const assets=Object.fromEntries(assetFiles.map(f=>[f,digest(readFileSync(`dist/${f}`))]));
  const cells=[];
  for(const seed of [123,424242,99117])for(const cache of ['cold','warm'])for(const population of ['desktop','mobile4'])for(const job of ['performance-continue','save-history','save-opening']){
    const index=cells.length,id=`continue-knowledge-coverage-r1-20261115-${index}-${seed}-${cache}-${population}-${job}`;
    cells.push({index,id,seed,cache,population,job,artwork:'off',argv:['--experimental-vm-modules','scripts/perf-hillclimb/run.mjs',`--id=${id}`,`--jobs=${job}`,`--seed=${seed}`,`--population=${population}`,`--cache=${cache}`,'--artwork=off','--samples=1',
      '--fixture-manifest=artifacts/perf-hillclimb/frozen-baseline-a9df52c-sourceproof-20261104/manifest.json','--fixture-manifest-id=406f042f7e4a3142620b8d05023167d98893185d24347f4745740a3a3feac000']});
  }
  save('plan',{created:new Date().toISOString(),phaseA:'NOT SOUND',sources,assets,build,cells,driverSha256:digest(readFileSync(new URL(import.meta.url))),scope:'Predeclared36-cell construction coverage only, unchanged audited per-job runner, no tail/speed/overhead claim. Fresh immutable leaf per cell. Soft20-minute serial chunks, stop new cells by01:55Z for final confirmation.'});
}
const plan=json(planFile);
assert.equal(digest(readFileSync(new URL(import.meta.url))),plan.driverSha256,'orchestration driver stays fixed');
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
  console.log(`[coverage] ${cell.index+1}/36 ${cell.seed}/${cell.cache}/${cell.population}/${cell.job}`);
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
  console.log(`[coverage] cell${cell.index} exit${exitCode}; total${results.length}/36`);
  if(!cleanupVerified)break;
}
stable();
const suffix=new Date().toISOString().replace(/[:.]/g,'-');
save(`chunk-${suffix}`,{started:new Date(chunkStart).toISOString(),finished:new Date().toISOString(),cells:chunk.map(r=>r.index),completed:results.length,failed:results.filter(r=>r.exitCode!==0||!r.actualLaunchValidation.ok||!r.cleanupVerified).map(r=>r.index),sourceAssetChanges:[],nextIndex:results.length<36?results.length:null});
console.log(JSON.stringify({completed:results.length,total:36,failed:results.filter(r=>r.exitCode!==0||!r.actualLaunchValidation.ok||!r.cleanupVerified).map(r=>r.index),nextIndex:results.length<36?results.length:null,artifact:directory}));
