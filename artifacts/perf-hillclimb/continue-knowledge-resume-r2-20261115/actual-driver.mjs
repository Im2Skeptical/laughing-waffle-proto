import assert from 'node:assert/strict';
import {readFile,writeFile,open} from 'node:fs/promises';
import {spawn,execFileSync} from 'node:child_process';
import {digest} from '../../../scripts/perf-hillclimb/fixtures.mjs';
const output='artifacts/perf-hillclimb/continue-knowledge-resume-r2-20261115';
const cells=[
 {id:'continue-knowledge-missing-frame-r2-20261115',seed:123,population:'desktop',job:'performance-continue',control:'settled-missing-frame',exit:1,error:'settled pre-save full read timeout after 1500ms'},
 {id:'continue-knowledge-never-evaluation-r2-20261115',seed:123,population:'desktop',job:'performance-continue',control:'settled-never-evaluation',exit:1,error:'settled pre-save full read timeout after 1500ms'},
 {id:'continue-knowledge-positive-desktop123-r2-20261115',seed:123,population:'desktop',job:'performance-continue',exit:0},
 {id:'continue-knowledge-positive-mobile424242-r2-20261115',seed:424242,population:'mobile4',job:'performance-continue',exit:0},
 {id:'continue-knowledge-wrong-save-r2-20261115',seed:123,population:'desktop',job:'save-history',control:'wrong-save',exit:1,error:'persisted/source state differs'},
 {id:'continue-knowledge-deferred-save-r2-20261115',seed:123,population:'desktop',job:'save-history',control:'deferred-save',exit:0},
];
const files=execFileSync('rg',['--files','src','scripts'],{encoding:'utf8'}).trim().split(/\r?\n/).map(f=>f.replaceAll('\\','/')).sort();
files.push('package.json','package-lock.json','docs/performance/perf-hillclimb-20261104/HARNESS.md');
const sources={};for(const f of files)sources[f]=digest(await readFile(f));
const build=JSON.parse(await readFile('dist/build-manifest.json')),assets={};
for(const k of ['bundle','worker','saveLoadWorker','stylesheet'])assets[build[k]]=digest(await readFile('dist/'+build[k]));
assets['images/dev-fixtures/performance-start.json.gz']=digest(await readFile('dist/images/dev-fixtures/performance-start.json.gz'));
const old=JSON.parse(await readFile('artifacts/perf-hillclimb/hold-adaptation-reference-r1-20261105/plan.json'));
const transitions=files.filter(f=>sources[f]!==old.sources[f]);
assert.deepEqual(transitions.sort(),['docs/performance/perf-hillclimb-20261104/HARNESS.md','scripts/perf-hillclimb/run.mjs','scripts/perf-hillclimb/save-state-oracle-test.mjs','scripts/perf-hillclimb/save-state-oracle.mjs'].sort());
assert.deepEqual(assets,old.assets,'product build assets unchanged');
const plan={policy:'frozen-terminal-observed-before-save-v1',at:new Date().toISOString(),sources,assets,transitions,cells,
 scope:'four narrow construction cases; expected wrong-save failure retained, no whole harness acceptance/tail baseline/performance improvement'};
await writeFile(output+'/actual-plan.json',JSON.stringify(plan,null,2),{flag:'wx'});
const stable=async()=>{const changed=[];for(const [f,h] of Object.entries(sources))if(digest(await readFile(f))!==h)changed.push(f);for(const [f,h]of Object.entries(assets))if(digest(await readFile('dist/'+f))!==h)changed.push('dist/'+f);return changed;};
const results=[];
for(const cell of cells){
 assert.deepEqual(await stable(),[]);
 const argv=['--experimental-vm-modules','scripts/perf-hillclimb/run.mjs',`--jobs=${cell.job}`,`--population=${cell.population}`,`--seed=${cell.seed}`,'--cache=cold','--artwork=off','--samples=1',`--id=${cell.id}`,
 '--fixture-manifest=artifacts/perf-hillclimb/frozen-baseline-a9df52c-sourceproof-20261104/manifest.json','--fixture-manifest-id=406f042f7e4a3142620b8d05023167d98893185d24347f4745740a3a3feac000'];
 if(cell.control)argv.push(`--control=${cell.control}`);
 const log=await open(output+'/'+cell.id+'.log','wx'),started=new Date().toISOString();
 console.log('[continue-knowledge] '+cell.id);
 let exit;try{exit=await new Promise((resolve,reject)=>{const p=spawn(process.execPath,argv,{stdio:['ignore',log.fd,log.fd],windowsHide:true});p.once('error',reject);p.once('exit',resolve);});}finally{await log.close();}
 const failure=await readFile('artifacts/perf-hillclimb/'+cell.id+'/failure.txt','utf8').catch(()=>null);
 const leaf=JSON.parse(await readFile('artifacts/perf-hillclimb/'+cell.id+'/manifest.json'));
 const cleanup={context:leaf.ownedContextCleanup,browser:leaf.ownedBrowserCleanup,errors:leaf.cleanupErrors??[]};
 let pass=exit===cell.exit&&(!cell.error||failure?.includes(cell.error));
 pass&&=cleanup.context?.length===1&&cleanup.context[0].closed===true&&cleanup.context[0].pageClosed===true
   &&cleanup.browser?.length===1&&cleanup.browser[0].closed===true&&cleanup.errors.length===0;
 let partial=null;
 if(cell.control?.startsWith('settled-')){
  partial=JSON.parse(await readFile('artifacts/perf-hillclimb/'+cell.id+'/launch-0-performance-continue-continued-settled-save-preparation-failed.json'));
  pass&&=partial.partial?.ready!==undefined&&partial.partial.frames.length===0;
 }
 results.push({...cell,argv,started,finished:new Date().toISOString(),actualExit:exit,pass,failure,cleanup,partial});
 await writeFile(output+'/actual-results.json',JSON.stringify(results,null,2));
 // A failed positive is a construction finding; retain exact failure and stop
 // before later cells can conceal it or mix repaired source into this plan.
 if(!pass)break;
}
const changed=await stable();await writeFile(output+'/actual-provenance-after.json',JSON.stringify({changed,at:new Date().toISOString()},null,2));
assert.deepEqual(changed,[]);console.log(`[continue-knowledge] ${results.filter(r=>r.pass).length}/${cells.length} expected outcomes`);
process.exitCode=results.length===cells.length&&results.every(r=>r.pass)?0:1;

