// One sequential cell per invocation; existing artwork runner/oracles unchanged.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,readFileSync,writeFileSync,openSync,closeSync,readdirSync,statSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {instrumentArtworkBundle} from '../../../scripts/perf-hillclimb/artwork-bundle-controls.mjs';
const directory='artifacts/perf-hillclimb/j8-paired-wait-progress-r1-20261115';
const authority='artifacts/perf-hillclimb/j8-phase-path-r1-20261115/plan.json';
const remainder='artifacts/perf-hillclimb/continue-knowledge-remainder-r1-20261115/results.json';
const proofRoot='artifacts/perf-hillclimb/paired-counter-build-r1-20261115';
const digest=x=>createHash('sha256').update(x).digest('hex');
const json=f=>JSON.parse(readFileSync(f));
const save=(name,data)=>writeFileSync(`${directory}/${name}.json`,JSON.stringify(data,null,2));
mkdirSync(directory,{recursive:true});
const admission=json(`${directory}/admission.json`);assert.equal(admission.verdict,'ACCEPTED');assert.equal(admission.driverSha256,digest(readFileSync(new URL(import.meta.url))));assert.equal(admission.proofSha256,digest(readFileSync(`${proofRoot}/after.json`)));
assert.equal(readFileSync(`${proofRoot}/focused-r2-exit.txt`,'utf8').trim(),'0','successful focused receipt required');
if(!existsSync(`${directory}/plan.json`)){
  const completed=json(remainder);assert.equal(completed.length,12);assert.ok(completed.every(r=>r.exitCode===0&&r.actualLaunchValidation?.ok&&r.cleanupVerified),'finish/release remainder before J8 admission');
  assert.equal(readFileSync(`${proofRoot}/build-r1-exit.txt`,'utf8').trim(),'0','completed successful fresh build receipt required');
  const buildExitSha256=digest(readFileSync(`${proofRoot}/build-r1-exit.txt`)),buildLogSha256=digest(readFileSync(`${proofRoot}/build-r1.log`));
  assert.ok(Date.now()<Date.parse('2026-11-15T01:45:00Z'),'new case admission before final confirmation cutoff');
  const original=json(authority),proof=json(`${proofRoot}/after.json`),sources={},transition=[];
  for(const [file,oldHash]of Object.entries(original.sources)){const now=digest(readFileSync(file));sources[file]=now;if(now!==oldHash)transition.push({file,oldHash,newHash:now});}
  const allowed=Object.keys(proof.files).sort();
  assert.deepEqual(transition.map(x=>x.file).sort(),allowed,'only declared three harness files and parent contract changed');
  for(const file of allowed.filter(f=>f.startsWith('scripts/')))assert.equal(sources[file],proof.files[file]);
  assert.equal(sources['docs/performance/perf-hillclimb-20261104/HARNESS.md'],proof.files['docs/performance/perf-hillclimb-20261104/HARNESS.md']);
  const build=json('dist/build-manifest.json'),assets={};
  for(const key of ['bundle','worker','saveLoadWorker','stylesheet']){const hash=original.assets[original.build[key]];assert.equal(digest(readFileSync(`dist/${build[key]}`)),hash,'compiled app/worker/style bytes unchanged');assets[build[key]]=hash;}
  assets['images/dev-fixtures/performance-start.json.gz']=original.assets['images/dev-fixtures/performance-start.json.gz'];
  assert.equal(digest(readFileSync('dist/images/dev-fixtures/performance-start.json.gz')),assets['images/dev-fixtures/performance-start.json.gz']);
  const buildManifestSha256=digest(readFileSync('dist/build-manifest.json'));
  const bundle=readFileSync(`dist/${build.bundle}`,'utf8');
  const variant=instrumentArtworkBundle(bundle,{tracePublication:true,allowFault:false,phaseWitness:true,cooperativeWitness:true});
  assert.equal(variant.cooperativeWitness,true);assert.equal(variant.cooperativeWitnessVersion,1);assert.equal(variant.phaseWitness,true);assert.equal(variant.phaseWitnessVersion,1);assert.equal(digest(variant.body),proof.variants.cooperative);
  const cases=['off'].map((instrumentation,index)=>{
    const id=`j8-paired-${instrumentation}-20261115-r1`;
    return {index,id,instrumentation,argv:['--experimental-vm-modules','scripts/perf-hillclimb/artwork-controls.mjs',`--id=${id}`,'--population=mobile4','--cases=reference','--cycles=5',`--instrumentation=${instrumentation}`,'--phase-witness=1','--cooperative-witness=1','--timeout=240000','--gate-timeout=240000','--case-timeout=600000']};
  });
  save('plan',{created:new Date().toISOString(),phaseA:'NOT SOUND',sources,assets,build,buildManifestSha256,cases,authority,transition,phaseVersion:1,buildExitSha256,buildLogSha256,proofSha256:digest(readFileSync(`${proofRoot}/after.json`)),authoritySha256:digest(readFileSync(authority)),remainderSha256:digest(readFileSync(remainder)),driverSha256:digest(readFileSync(new URL(import.meta.url))),originalBundleSha256:digest(bundle),servedVariantSha256:digest(variant.body),scope:'Exactly ONE new paired wait/progress optional-OFF phase-enabled reference/mobile4 diagnostic. Same240s/600s/13groups/16atlases/cycles5/endpoints, app bytes unchanged. Separate population ineligible for speed comparison. No retry/product cause/fix/neutrality/tail/score claim. Full registered verify refreshed in final35min; fresh build plus affected focused/independent admission required now.',hypothesis:'At least80% of observed pending-main wall window is existing idle/denied-delay waiting while matched cooperative job advances. Analyze through explicit post-clock collection, separately from original cancel; open waits right-censored; invalid/ambiguous pairing INCONCLUSIVE; residual is other work/waits, not pure CPU.',admissionSha256:digest(readFileSync(`${directory}/admission.json`)),focusedLogSha256:digest(readFileSync(`${proofRoot}/focused-r2.log`)),focusedExitSha256:digest(readFileSync(`${proofRoot}/focused-r2-exit.txt`)),interpretation:'Use bounded per-loader site/gate counters and timestamps against original operation end/cancel. Truncated event absence proves nothing; post-clock returns may be late. Mark interleaved/unlinked/overflow ambiguity. If outcomes change, disclose observer perturbation. No extra samples.'});
}
const plan=json(`${directory}/plan.json`);
assert.equal(digest(readFileSync(new URL(import.meta.url))),plan.driverSha256);
assert.equal(digest(readFileSync(authority)),plan.authoritySha256);
assert.equal(digest(readFileSync(remainder)),plan.remainderSha256);
assert.equal(digest(readFileSync(`${proofRoot}/after.json`)),plan.proofSha256);
assert.equal(digest(readFileSync(`${proofRoot}/build-r1-exit.txt`)),plan.buildExitSha256);
assert.equal(digest(readFileSync(`${proofRoot}/build-r1.log`)),plan.buildLogSha256);
function stable(){const changed=[];for(const[f,h]of Object.entries(plan.sources))if(digest(readFileSync(f))!==h)changed.push(f);for(const[f,h]of Object.entries(plan.assets))if(digest(readFileSync(`dist/${f}`))!==h)changed.push(`dist/${f}`);if(digest(readFileSync('dist/build-manifest.json'))!==plan.buildManifestSha256)changed.push('dist/build-manifest.json');assert.deepEqual(changed,[],'same source/contract/app assets throughout single-cell diagnostic');}
stable();
const results=existsSync(`${directory}/results.json`)?json(`${directory}/results.json`):[];
assert.ok(results.every((r,i)=>r.index===i&&r.identityVerified&&r.cleanupVerified&&r.phaseDataAvailable),'unresolved infrastructure/identity/cleanup/phase data blocks another cell');
assert.equal(digest(readFileSync(`${directory}/admission.json`)),plan.admissionSha256);assert.equal(readFileSync(`${proofRoot}/focused-r2-exit.txt`,'utf8').trim(),'0');assert.equal(digest(readFileSync(`${proofRoot}/focused-r2.log`)),plan.focusedLogSha256);assert.equal(digest(readFileSync(`${proofRoot}/focused-r2-exit.txt`)),plan.focusedExitSha256);
if(results.length===1){console.log('J8 fixed single paired-counter diagnostic already complete');process.exit(0);}
assert.ok(Date.now()<Date.parse('2026-11-15T01:45:00Z'),'stop new10min cells before final confirmation window');
const cell=plan.cases[results.length];assert.equal(existsSync(`artifacts/perf-hillclimb/${cell.id}`),false,'never overwrite an interrupted leaf');
const log=openSync(`${directory}/cell-${cell.index}.log`,'wx');
const started=new Date().toISOString();let exitCode,signal;
console.log(`[J8 paired] ${cell.index+1}/1 instrumentation=${cell.instrumentation}`);
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
  assert.equal(manifest.config.cooperativeWitness,true);assert.equal(manifest.cooperativeWitness.enabled,true);assert.equal(manifest.cooperativeWitness.requiredVersion,1);assert.equal(manifest.config.phaseWitness,true);assert.equal(manifest.phaseWitness.enabled,true);assert.equal(manifest.phaseWitness.requiredVersion,1);
  assert.equal(manifest.config.timeoutMs,240000);assert.equal(manifest.config.gateTimeoutMs,240000);assert.equal(manifest.config.navigationCycles,5);assert.equal(manifest.config.caseTimeoutMs,600000);assert.equal(manifest.config.tracePublication,true);
  assert.equal(manifest.preparedFixture.seed,123);assert.equal(manifest.preparedFixture.gzipSha256,plan.assets['images/dev-fixtures/performance-start.json.gz']);
  const variant=manifest.caseVariants?.reference;assert.equal(variant?.originalSha256,plan.originalBundleSha256);assert.equal(variant?.servedSha256,plan.servedVariantSha256);assert.equal(variant?.tracePublication,true);assert.equal(variant?.localFaultApi,false);
  assert.equal(variant?.cooperativeWitness,true);assert.equal(variant?.cooperativeWitnessVersion,1);assert.equal(variant?.cooperativeWitnessObserved?.present,true);assert.equal(variant?.cooperativeWitnessObserved?.version,1);assert.equal(variant?.phaseWitness,true);assert.equal(variant?.phaseWitnessVersion,1);assert.equal(variant?.phaseWitnessObserved?.present,true);assert.equal(variant?.phaseWitnessObserved?.version,1);
  identityVerified=true;
}catch(error){identityError=error.message;}
const cleanup=manifest?.caseCleanup?.reference??(existsSync(`${leaf}/reference-cleanup.json`)?json(`${leaf}/reference-cleanup.json`):null);
const cleanupVerified=cleanup?.contextClosed===true&&cleanup?.browserClosed===true&&cleanup?.browserConnected===false&&cleanup?.errors?.length===0&&Array.isArray(cleanup?.lifetime?.unconfirmedWork)&&cleanup.lifetime.unconfirmedWork.length===0&&!manifest?.finalCleanupError;
let phaseDataAvailable=false,phaseError=null;const phaseSnapshots=[];
if(identityVerified&&cleanupVerified)try{
  for(const file of readdirSync(leaf).filter(f=>f.endsWith('-observation.json'))){assert.ok(statSync(`${leaf}/${file}`).size<=64*1024*1024,'bounded post-closure raw analysis');const raw=json(`${leaf}/${file}`),phase=raw.phaseWitness;if(!phase)continue;assert.equal(phase.cooperative?.version,1);assert.equal(phase.cooperative.collectedAt,phase.collectedAt);assert.ok(Array.isArray(phase.cooperative.loaders)&&phase.cooperative.loaders.length<=8&&phase.cooperative.loaders.every(l=>Array.isArray(l.jobs)&&l.jobs.length<=4));assert.equal(phase.version,1);assert.ok(Number.isFinite(phase.collectedAt));assert.ok(Array.isArray(phase.events)&&phase.events.length<=32&&Array.isArray(phase.loaders)&&phase.loaders.length<=8);phaseSnapshots.push({file,phase});}
  assert.ok(phaseSnapshots.length>0,'actual post-clock phase witness must be retained');phaseDataAvailable=true;save(`phase-${cell.index}`,{caseId:cell.id,scope:'Post-clock collection; compare site times to original operation finish/cancel before claiming deadline phase. Events may overflow.',snapshots:phaseSnapshots});
}catch(error){phaseError=error.message;}
const result={...cell,started,finished:new Date().toISOString(),exitCode,signal,identityVerified,identityError,cleanupVerified,cleanup,phaseDataAvailable,phaseError,manifestFailed:manifest?.failed??null,summaryOk:summary?.ok??null,completedCases:summary?.completedCases??null,caseFailures:summary?.caseFailures??null,observations:summary?.observations??null,sourceAssetChanges:[]};
results.push(result);save('results',results);
console.log(JSON.stringify({completed:results.length,total:1,exitCode,identityVerified,cleanupVerified,phaseDataAvailable,phaseError,caseFailures:result.caseFailures,nextIndex:results.length<1?results.length:null,artifact:directory}));
if(!identityVerified||!cleanupVerified||!phaseDataAvailable)process.exitCode=1;
