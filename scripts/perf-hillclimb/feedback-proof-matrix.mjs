import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {spawn,execFileSync} from 'node:child_process';
import {digest} from './fixtures.mjs';
const id=process.argv[2];assert.match(id??'',/^[\w-]+$/);
const output=`artifacts/perf-hillclimb/${id}`;await mkdir(output);
const save=(name,value)=>writeFile(`${output}/${name}.json`,JSON.stringify(value,null,2));
const files=execFileSync('rg',['--files','src','scripts'],{encoding:'utf8'}).trim().split(/\r?\n/).map(f=>f.replaceAll('\\','/')).sort();
files.push('package.json','package-lock.json','docs/performance/perf-hillclimb-20261104/HARNESS.md');
const sources={};for(const f of files)sources[f]=digest(await readFile(f));
const build=JSON.parse(await readFile('dist/build-manifest.json')),assets={};
for(const k of ['bundle','worker','saveLoadWorker','stylesheet'])assets[build[k]]=digest(await readFile('dist/'+build[k]));
assets['images/dev-fixtures/performance-start.json.gz']=digest(await readFile('dist/images/dev-fixtures/performance-start.json.gz'));
const stages=[
 ['minimal-all','scripts/perf-hillclimb/main-discovery.mjs','--jobs=entry,performance,map,scrub,life,save','--populations=desktop,mobile4','--seeds=123','--caches=cold'],
 ['otherseeds','scripts/perf-hillclimb/main-discovery.mjs','--jobs=performance-continue,scrub,life,save','--populations=desktop,mobile4','--seeds=424242,99117','--caches=cold'],
 ['warm-entry','scripts/perf-hillclimb/main-discovery.mjs','--jobs=entry,performance','--populations=desktop,mobile4','--seeds=123','--caches=warm'],
 ['progressive-entry','scripts/perf-hillclimb/main-discovery.mjs','--jobs=performance','--populations=desktop,mobile4','--seeds=123','--caches=cold','--artwork=progressive'],
 ['visual-sentinels','scripts/perf-hillclimb/main-discovery.mjs','--jobs=entry,life,save,map-open,scrub-anchor','--populations=desktop,mobile4','--seeds=123','--caches=cold','--visual-evidence=1'],
 ['illustrated','scripts/perf-hillclimb/run.mjs','--jobs=entry','--population=desktop','--seed=123','--cache=cold','--artwork=illustrated',
  '--fixture-manifest=artifacts/perf-hillclimb/frozen-baseline-a9df52c-sourceproof-20261104/manifest.json','--fixture-manifest-id=406f042f7e4a3142620b8d05023167d98893185d24347f4745740a3a3feac000'],
 ...['desktop','mobile4'].map(pop=>[`art-${pop}`,'scripts/perf-hillclimb/artwork-controls.mjs',`--population=${pop}`,'--cases=reference,deferred,retry,exhausted','--cycles=5']),
];
const plan=stages.map(([stage,script,...args])=>({stage,argv:['--experimental-vm-modules',script,...args,`--id=${id}-${stage}`]}));
await save('plan',{id,runtime:{node:process.version,execArgv:process.execArgv,nodeExecutableSha256:digest(await readFile(process.execPath)),playwright:JSON.parse(await readFile('node_modules/playwright/package.json')).version},phaseA:'NOT SOUND',sources,build,assets,plan,scope:'representative construction, not complete suites/tails/overhead; no first physical pixel evidence'});
const results=[];
for(const cell of plan){
 const changed=[];for(const f of files)if(digest(await readFile(f))!==sources[f])changed.push(f);
 for(const [f,h]of Object.entries(assets))if(digest(await readFile('dist/'+f))!==h)changed.push('dist/'+f);
 assert.deepEqual(changed,[],'fixed executable/app/package/contract/build/fixture matrix source');
 console.log(`[feedback-matrix] ${cell.stage}`);
 const started=new Date().toISOString(),exit=await new Promise((resolve,reject)=>{const p=spawn(process.execPath,cell.argv,{stdio:'inherit',windowsHide:true});p.once('error',reject);p.once('exit',resolve);});
 results.push({...cell,started,finished:new Date().toISOString(),exit});await save('results',results);
}
const changed=[];for(const f of files)if(digest(await readFile(f))!==sources[f])changed.push(f);
for(const [f,h]of Object.entries(assets))if(digest(await readFile('dist/'+f))!==h)changed.push('dist/'+f);
await save('provenance-after',{changed});assert.deepEqual(changed,[]);
process.exitCode=results.some(r=>r.exit!==0)?1:0;
