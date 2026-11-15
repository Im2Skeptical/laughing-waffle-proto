// One sequential cell per invocation; existing artwork runner/oracles unchanged.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync,openSync,closeSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {instrumentArtworkBundle} from '../../../scripts/perf-hillclimb/artwork-bundle-controls.mjs';
const directory='artifacts/perf-hillclimb/j8-optional-abba-r1-20261115';
const authority='artifacts/perf-hillclimb/continue-knowledge-coverage-r1-20261115/plan.json';
const remainder='artifacts/perf-hillclimb/continue-knowledge-remainder-r1-20261115/results.json';
const digest=x=>createHash('sha256').update(x).digest('hex');
const json=f=>JSON.parse(readFileSync(f));
const save=(name,data)=>writeFileSync(`${directory}/${name}.json`,JSON.stringify(data,null,2));
mkdirSync(directory,{recursive:true});
if(!existsSync(`${directory}/plan.json`)){
  const completed=json(remainder);assert.equal(completed.length,12);assert.ok(completed.every(r=>r.exitCode===0&&r.actualLaunchValidation?.ok&&r.cleanupVerified),'finish/release remainder before J8 admission');
  assert.ok(Date.now()<Date.parse('2026-11-15T00:55:00Z'),'reserve45min before first four-cell batch');
  const original=json(authority),{sources,assets,build}=original;
  assert.deepEqual(json('dist/build-manifest.json'),build,'same build metadata as frozen authority');
  const buildManifestSha256=digest(readFileSync('dist/build-manifest.json'));
  const bundle=readFileSync(`dist/${build.bundle}`,'utf8');
  const variant=instrumentArtworkBundle(bundle,{tracePublication:true,allowFault:false});
  const cases=[['on-a','on'],['off-b','off'],['off-a','off'],['on-b','on']].map(([label,instrumentation],index)=>{
    const id=`j8-optional-${label}-20261115-r1`;
    return {index,id,instrumentation,argv:['--experimental-vm-modules','scripts/perf-hillclimb/artwork-controls.mjs',`--id=${id}`,'--population=mobile4','--cases=reference','--cycles=5',`--instrumentation=${instrumentation}`,'--timeout=240000','--gate-timeout=240000','--case-timeout=600000']};
  });
  save('plan',{created:new Date().toISOString(),phaseA:'NOT SOUND',sources,assets,build,buildManifestSha256,cases,authority,authoritySha256:digest(readFileSync(authority)),remainderSha256:digest(readFileSync(remainder)),driverSha256:digest(readFileSync(new URL(import.meta.url))),originalBundleSha256:digest(bundle),servedVariantSha256:digest(variant.body),scope:'Four fixed reference/mobile4 ON/OFF/OFF/ON diagnostics; unchanged240s readiness/13groups/16atlases/two5-cycle navigation blocks/private publication trace.600s whole-case cap is not successful shortened work. No retries or product/candidate/tail/observer-neutrality claim. Original native termination remains unresolved.',commonHooks:'HC clocks/polling; feedback/bindings; ready-seal/input/console; Assets.load wrapper; private Set/Map publication and drawing parity; endpoint/state/context oracles remain.',interpretation:'BothON fail same readiness and bothOFF pass: consistent with optional bundle contribution only. Allfail same gate: removal insufficient. Allpass: old failure not reproduced. Mixed/different/capped/identity failures: INCONCLUSIVE. No automatic extra runs.'});
}
const plan=json(`${directory}/plan.json`);
assert.equal(digest(readFileSync(new URL(import.meta.url))),plan.driverSha256);
assert.equal(digest(readFileSync(authority)),plan.authoritySha256);
assert.equal(digest(readFileSync(remainder)),plan.remainderSha256);
function stable(){const changed=[];for(const[f,h]of Object.entries(plan.sources))if(digest(readFileSync(f))!==h)changed.push(f);for(const[f,h]of Object.entries(plan.assets))if(digest(readFileSync(`dist/${f}`))!==h)changed.push(`dist/${f}`);if(digest(readFileSync('dist/build-manifest.json'))!==plan.buildManifestSha256)changed.push('dist/build-manifest.json');assert.deepEqual(changed,[],'same source/contract/app assets throughout four-cell batch');}
stable();
const results=existsSync(`${directory}/results.json`)?json(`${directory}/results.json`):[];
assert.ok(results.every((r,i)=>r.index===i&&r.identityVerified&&r.cleanupVerified),'unresolved infrastructure/identity/cleanup blocks another cell');
if(results.length===4){console.log('J8 fixed four-cell batch already complete');process.exit(0);}
assert.ok(Date.now()<Date.parse('2026-11-15T01:45:00Z'),'stop new10min cells before final confirmation window');
const cell=plan.cases[results.length];assert.equal(existsSync(`artifacts/perf-hillclimb/${cell.id}`),false,'never overwrite an interrupted leaf');
const log=openSync(`${directory}/cell-${cell.index}.log`,'wx');
const started=new Date().toISOString();let exitCode,signal;
console.log(`[J8] ${cell.index+1}/4 instrumentation=${cell.instrumentation}`);
try{await new Promise((resolve,reject)=>{const child=spawn(process.execPath,cell.argv,{stdio:['ignore',log,log],windowsHide:true});save(`launch-${cell.index}`,{cell,started,parentPid:process.pid,childPid:child.pid});child.once('error',reject);child.once('exit',(code,s)=>{exitCode=code;signal=s;resolve();});});}finally{closeSync(log);}
stable();
const leaf=`artifacts/perf-hillclimb/${cell.id}`;
let manifest=null,summary=null,identityVerified=false,identityError=null;
try{
  manifest=json(`${leaf}/manifest.json`);summary=json(`${leaf}/summary.json`);
  assert.ok(exitCode===0||exitCode===1,'only normal runner success/failure statuses are comparable');assert.equal(signal,null);
  assert.equal(manifest.failed,exitCode!==0);assert.equal(summary.ok,exitCode===0);
  assert.equal(summary.requestedCases,1);
  if(exitCode===0){assert.equal(summary.completedCases,1);assert.equal(summary.results.length,1);assert.equal(summary.results[0].case,'reference');assert.equal(summary.results[0].ok,true);}
  assert.ok(manifest.finished);assert.equal(manifest.runId,cell.id);
  assert.deepEqual(manifest.build,plan.build);assert.equal(manifest.buildId,digest(JSON.stringify(plan.build)));
  assert.equal(manifest.measurementContractId,plan.sources['docs/performance/perf-hillclimb-20261104/HARNESS.md']);
  for(const [file,hash]of Object.entries(manifest.sourceFiles))assert.equal(hash,plan.sources[file]);
  for(const key of ['bundle','worker','saveLoadWorker','stylesheet'])assert.equal(manifest.servedAssets?.[key],plan.assets[plan.build[key]]);
  assert.equal(manifest.servedAssets?.preparedFixture,plan.assets['images/dev-fixtures/performance-start.json.gz']);
  assert.deepEqual(manifest.config.cases,['reference']);assert.equal(manifest.config.population,'mobile4');assert.equal(manifest.config.instrumentation,cell.instrumentation==='on');
  assert.equal(manifest.config.timeoutMs,240000);assert.equal(manifest.config.gateTimeoutMs,240000);assert.equal(manifest.config.navigationCycles,5);assert.equal(manifest.config.caseTimeoutMs,600000);assert.equal(manifest.config.tracePublication,true);
  assert.equal(manifest.preparedFixture.seed,123);assert.equal(manifest.preparedFixture.gzipSha256,plan.assets['images/dev-fixtures/performance-start.json.gz']);
  const variant=manifest.caseVariants?.reference;assert.equal(variant?.originalSha256,plan.originalBundleSha256);assert.equal(variant?.servedSha256,plan.servedVariantSha256);assert.equal(variant?.tracePublication,true);assert.equal(variant?.localFaultApi,false);
  identityVerified=true;
}catch(error){identityError=error.message;}
const cleanup=manifest?.caseCleanup?.reference??(existsSync(`${leaf}/reference-cleanup.json`)?json(`${leaf}/reference-cleanup.json`):null);
const cleanupVerified=cleanup?.contextClosed===true&&cleanup?.browserClosed===true&&cleanup?.browserConnected===false&&cleanup?.errors?.length===0&&Array.isArray(cleanup?.lifetime?.unconfirmedWork)&&cleanup.lifetime.unconfirmedWork.length===0&&!manifest?.finalCleanupError;
const result={...cell,started,finished:new Date().toISOString(),exitCode,signal,identityVerified,identityError,cleanupVerified,cleanup,manifestFailed:manifest?.failed??null,summaryOk:summary?.ok??null,completedCases:summary?.completedCases??null,caseFailures:summary?.caseFailures??null,observations:summary?.observations??null,sourceAssetChanges:[]};
results.push(result);save('results',results);
console.log(JSON.stringify({completed:results.length,total:4,exitCode,identityVerified,cleanupVerified,caseFailures:result.caseFailures,nextIndex:results.length<4?results.length:null,artifact:directory}));
if(!identityVerified||!cleanupVerified)process.exitCode=1;
