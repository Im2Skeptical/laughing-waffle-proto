import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const base='artifacts/perf-hillclimb',batch=base+'/j8-paired-wait-progress-r1-20261115',leaf=base+'/j8-paired-off-20261115-r1',out=base+'/auditor-paired-actual-20261115-r1';
const hashes={};
const hash=async f=>{const h=createHash('sha256');for await(const b of fs.createReadStream(f))h.update(b);return h.digest('hex');};
async function read(f,json=true){assert.ok(fs.statSync(f).size<=2*1024*1024,'bounded input '+f);hashes[f]=await hash(f);const text=fs.readFileSync(f,'utf8');return json?JSON.parse(text):text;}
const plan=await read(batch+'/plan.json'),results=await read(batch+'/results.json'),m=await read(leaf+'/manifest.json'),summary=await read(leaf+'/summary.json'),cleanup=await read(leaf+'/reference-cleanup.json'),failure=await read(leaf+'/reference-failure.json'),raw=await read(leaf+'/reference-failure-observation.json');
const rows=(await read(leaf+'/observations.jsonl',false)).trim().split(/\r?\n/).map(JSON.parse);
const proof=await read(base+'/paired-counter-build-r1-20261115/after.json');
assert.equal(results.length,1);assert.equal(results[0].exitCode,1);assert.equal(results[0].signal,null);assert.equal(m.failed,true);assert.equal(summary.ok,false);assert.equal(summary.completedCases,0);assert.equal(summary.requestedCases,1);assert.equal(rows.length,3);
assert.equal(m.runId,'j8-paired-off-20261115-r1');assert.deepEqual(m.build,plan.build);assert.equal(m.buildId,createHash('sha256').update(JSON.stringify(plan.build)).digest('hex'));assert.equal(m.measurementContractId,plan.sources['docs/performance/perf-hillclimb-20261104/HARNESS.md']);
for(const [f,h]of Object.entries(plan.sources)){assert.equal(await hash(f),h,'current source '+f);hashes[f]=h;}
for(const [f,h]of Object.entries(m.sourceFiles))assert.equal(h,plan.sources[f],'manifest source '+f);
for(const [f,h]of Object.entries(plan.assets)){assert.equal(await hash('dist/'+f),h,'current asset '+f);hashes['dist/'+f]=h;}
assert.equal(await hash('dist/build-manifest.json'),plan.buildManifestSha256);hashes['dist/build-manifest.json']=plan.buildManifestSha256;
for(const k of ['bundle','worker','saveLoadWorker','stylesheet'])assert.equal(m.servedAssets[k],plan.assets[plan.build[k]]);assert.equal(m.servedAssets.preparedFixture,plan.assets['images/dev-fixtures/performance-start.json.gz']);
assert.deepEqual(m.config.cases,['reference']);for(const [k,v]of Object.entries({population:'mobile4',instrumentation:false,phaseWitness:true,cooperativeWitness:true,tracePublication:true,timeoutMs:240000,gateTimeoutMs:240000,caseTimeoutMs:600000,navigationCycles:5}))assert.equal(m.config[k],v,k);
assert.equal(m.preparedFixture.seed,123);assert.equal(m.preparedFixture.gzipSha256,plan.assets['images/dev-fixtures/performance-start.json.gz']);assert.equal(m.atlasFiles.length,16);
const variant=m.caseVariants.reference;assert.equal(variant.servedSha256,proof.variants.cooperative);assert.equal(variant.servedSha256,plan.servedVariantSha256);assert.equal(variant.originalSha256,plan.originalBundleSha256);
for(const name of ['phase','cooperative']){assert.equal(variant[name+'Witness'],true);assert.equal(variant[name+'WitnessVersion'],1);assert.deepEqual(variant[name+'WitnessObserved'],{present:true,version:1});assert.equal(m[name+'Witness'].enabled,true);assert.equal(m[name+'Witness'].requiredVersion,1);}
assert.equal(cleanup.contextClosed,true);assert.equal(cleanup.browserClosed,true);assert.equal(cleanup.browserConnected,false);assert.deepEqual(cleanup.errors,[]);assert.deepEqual(cleanup.lifetime.unconfirmedWork,[]);assert.ok(!m.finalCleanupError);
const failed=rows.find(r=>!r.ok);assert.equal(failed.step,'remaining-background-wait-to-prepared');assert.equal(failed.timeout,true);assert.equal(failed.error,'page.waitForFunction: Timeout 240000ms exceeded.');assert.ok(Number.isFinite(failed.finished));assert.equal(rows.filter(r=>r.ok).length,2);
function account(phase){
 assert.equal(phase.version,1);assert.ok(phase.events.length<=32);assert.equal(phase.droppedLoaders,0);assert.deepEqual(phase.unlinkedSites,{});assert.equal(phase.loaders.length,1);
 const w=phase.cooperative;assert.equal(w.version,1);assert.equal(w.collectedAt,phase.collectedAt);assert.equal(w.invalid,0);assert.equal(w.unlinkedJobs,0);assert.equal(w.loaders.length,1);
 const l=w.loaders[0],p=phase.loaders[0];assert.equal(l.id,p.id);assert.equal(l.id,1);assert.equal(l.phase,'main');assert.equal(l.invalid,0);assert.ok(l.jobs.length<=4);assert.ok(Object.keys(l.waits).length<=16);assert.equal(l.phaseStarted.main,p.sites['main-enter'].lastAt);assert.ok(!p.sites['main-return']);
 const waits=Object.values(l.waits).filter(s=>s.phase==='main');assert.ok(waits.every(s=>s.count>=0&&Number.isFinite(s.totalMs)&&s.totalMs>=0&&s.lastReturned<=w.collectedAt));
 const completed=waits.reduce((t,s)=>t+s.totalMs,0),count=waits.reduce((t,s)=>t+s.count,0),open=l.open;assert.equal(open.phase,'main');assert.equal(open.ambiguous,false);assert.ok(open.started>=Math.max(...waits.map(s=>s.lastReturned)));assert.ok(open.started<failed.finished&&failed.finished<=w.collectedAt);
 const censored=w.collectedAt-open.started,total=completed+censored,window=w.collectedAt-l.phaseStarted.main;assert.ok(total<=window);
 for(const j of l.jobs){assert.equal(j.phase,'main');assert.ok(Number.isSafeInteger(j.steps)&&Number.isSafeInteger(j.yields)&&j.steps>=0&&j.yields>=0);assert.ok(j.started>=l.phaseStarted.main&&j.updatedAt<=w.collectedAt);assert.ok(Number.isFinite(j.longestStepMs));}
 assert.equal(l.jobs[0].name,'bake');assert.equal(l.jobs[0].status,'complete');assert.equal(l.jobs[1].name,'regional');assert.equal(l.jobs[1].status,'yield-enter');assert.ok(l.jobs[1].steps>0&&l.jobs[1].yields>0);
 return {collectedAt:w.collectedAt,cancelAt:failed.finished,collectionAfterCancelMs:w.collectedAt-failed.finished,mainStarted:l.phaseStarted.main,windowMs:window,completedWaitMs:completed,completedWaitCount:count,open,rightCensoredWaitMs:censored,totalWaitMs:total,waitShare:total/window,residualOtherWorkOrWaitMs:window-total,hypothesis:'wait share at least0.8 with matched progress',verdict:total/window>=.8?'SUPPORTED_IN_THIS_DIAGNOSTIC':'FALSIFIED_IN_THIS_DIAGNOSTIC',jobs:l.jobs,droppedEvents:phase.droppedEvents,gates:p.gates};
}
const primary=account(failed.phaseWitness),later=account(raw.phaseWitness);
for(const field of ['errors','consoleErrors','requestFailures','collectionErrors'])assert.deepEqual(failure[field],[]);
const extraction={at:new Date().toISOString(),scope:'Independent original-file accounting; no parent accounting summary read',sourceAssetsIdentity:true,cleanupVerified:true,headers:rows.map(({step,ok,started,finished,elapsedMs,timeout,error})=>({step,ok,started,finished,elapsedMs,timeout,error})),primary,laterSnapshot:later,passiveArtwork:failure.passive.artwork,errors:[],limits:'Post-clock through collection; open wait right-censored. Residual is other work/waits, not CPU. Unequal step counts are not percent complete. No speed/neutrality/product-cause/whole-SOUND acceptance.'};
fs.writeFileSync(out+'/input-sha256.json',JSON.stringify(hashes,null,2));fs.writeFileSync(out+'/extraction.json',JSON.stringify(extraction,null,2));
const receipt={at:new Date().toISOString(),inputSha256:await hash(out+'/input-sha256.json'),extractionSha256:await hash(out+'/extraction.json'),primary,laterBoundary:later.collectedAt,sourceAssetsIdentity:true,cleanupVerified:true};fs.writeFileSync(out+'/receipt.json',JSON.stringify(receipt,null,2));
console.log(JSON.stringify({...receipt,primary:{...primary,jobs:primary.jobs.map(({name,status,steps,yields,longestStepMs})=>({name,status,steps,yields,longestStepMs})),gates:undefined}}));
