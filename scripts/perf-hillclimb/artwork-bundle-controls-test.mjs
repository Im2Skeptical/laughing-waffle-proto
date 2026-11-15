import assert from 'node:assert/strict';
import vm from 'node:vm';
import {instrumentArtworkBundle,phaseLoaderSource,phaseRootSource,cooperativeSource,cooperativePrepareBindings} from './artwork-bundle-controls.mjs';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {spawnSync} from 'node:child_process';

// Mechanism fixture only. Actual full-game mutation/trace controls remain needed.
const source=`var packedTextures = new Map();
var hiddenGroups = /* @__PURE__ */ new Set();
var PACKED_GROUPS={chronicleHudFrames:{prefix:'hud/'}};var revision=0;
function bumpRevision(){revision += 1;}
function packedGroupFor(file){return file.startsWith('hud/')?PACKED_GROUPS.chronicleHudFrames:null;}
function getChronicleTexture(file){return hiddenGroups.has(PACKED_GROUPS.chronicleHudFrames)?null:packedTextures.get(file);}
globalThis.fixture={packedTextures,hiddenGroups,PACKED_GROUPS};`;
const originalSetHas=Set.prototype.has,originalMapSet=Map.prototype.set;let clock=0;
const context=vm.createContext({performance:{now:()=>++clock},__HC_ART__:{publicationEvents:[]}});
const contextSetHas=vm.runInContext('Set.prototype.has',context);
const contextMapSet=vm.runInContext('Map.prototype.set',context);
const instrumented=instrumentArtworkBundle(source,{allowFault:true});
vm.runInContext(instrumented.body,context);
const {packedTextures,hiddenGroups,PACKED_GROUPS}=context.fixture,group=PACKED_GROUPS.chronicleHudFrames;
assert.equal(hiddenGroups.add(group),hiddenGroups);hiddenGroups.add(group);
assert.equal(packedTextures.set('hud/test.png',{}),packedTextures,'native Map return semantics preserved');
assert.equal(context.__HC_ART__.publicationEvents.length,1,'duplicate hide is not an additional mutation');
assert.equal(hiddenGroups.delete({}),false);assert.equal(context.__HC_ART__.publicationEvents.length,1);
const published=context.__HC_ART_MUTANT__.publish();
assert.equal(published.beforeDrawing,false);assert.equal(published.afterDrawing,true);
const restored=context.__HC_ART_MUTANT__.restore();assert.ok(restored.to>published.from);
assert.deepEqual(Array.from(context.__HC_ART__.publicationEvents,e=>e.kind),['hide','publish','hide']);
hiddenGroups.clear();assert.equal(context.__HC_ART__.publicationEvents.at(-1).kind,'publish');
packedTextures.set('hud/new.png',{});
assert.equal(context.__HC_ART__.publicationEvents.at(-1).kind,'unwithheld-load','late hide without a preceding delete cannot hide initial frame publication');
assert.equal(Set.prototype.has,originalSetHas,'no global prototype is patched');
assert.equal(vm.runInContext('Set.prototype.has',context),contextSetHas,'actual module-context Set prototype is unchanged');
assert.equal(Map.prototype.set,originalMapSet);assert.equal(vm.runInContext('Map.prototype.set',context),contextMapSet,'actual module-context Map prototype is unchanged');
assert.match(instrumentArtworkBundle(source.replace('var hiddenGroups =','var hiddenGroups;\nhiddenGroups =')).body,
  /hiddenGroups = new HillclimbPublicationSet/,'real bundled separate declaration/assignment is supported');
assert.throws(()=>instrumentArtworkBundle(source.replace('hiddenGroups =','otherGroups =')),/one actual/);
assert.throws(()=>instrumentArtworkBundle(source+'\nvar hiddenGroups = new Set();'),/one actual/);
const plain=instrumentArtworkBundle(source,{tracePublication:false,allowFault:false});
assert.equal(plain.body,source,'reference path keeps original bytes');
assert.ok(!instrumentArtworkBundle(source).body.includes('__HC_ART_MUTANT__'),'normal observer has no fault API');
const renamed=source.replace('function bumpRevision(){','function bumpRevision2(){')+'\nfunction bumpRevision(timeline){throw Error("unrelated timeline revision");}';
const renamedContext=vm.createContext({performance:{now:()=>++clock},__HC_ART__:{publicationEvents:[]}});
vm.runInContext(instrumentArtworkBundle(renamed,{allowFault:true}).body,renamedContext);
renamedContext.fixture.hiddenGroups.add(renamedContext.fixture.PACKED_GROUPS.chronicleHudFrames);
renamedContext.fixture.packedTextures.set('hud/test.png',{});
assert.equal(renamedContext.__HC_ART_MUTANT__.publish().afterDrawing,true,'fault binds the renamed artwork increment, not the timeline function');
renamedContext.__HC_ART_MUTANT__.restore();
assert.throws(()=>instrumentArtworkBundle(source+'\nfunction bumpRevision3(){otherRevision += 1;}',{allowFault:true}),/one actual no-argument/);
console.log('[artwork-bundle] private mutation trace, true drawing availability fault/restore, Set semantics and unchanged reference controls passed; actual-game proof pending');

// Opt-in phase controls use the exact inspected bundled blocks above. The
// source-binding controls also apply them to the actual frozen served bundle.
const phaseSource=phaseLoaderSource+`\nfunction startRoot(){return loadProgressiveArtwork({renderer:app.renderer,canLoad,isCurrent,\n`+phaseRootSource+'\n}\nglobalThis.phaseFixture={loadProgressiveArtwork,startRoot};';
const phaseOptions={tracePublication:false,phaseWitness:true};
assert.throws(()=>instrumentArtworkBundle(phaseSource.replace('const artwork = await','const artwork2 = await'),phaseOptions),/one actual phase loader/);
assert.throws(()=>instrumentArtworkBundle(phaseSource+'\n'+phaseLoaderSource,phaseOptions),/one actual phase loader/);
assert.throws(()=>instrumentArtworkBundle(phaseSource+'\nfunction loadProgressiveArtwork(){return 3;}',phaseOptions),/one actual phase loader declaration/);
assert.throws(()=>instrumentArtworkBundle(phaseSource.replace('const main = await','const main2 = await'),phaseOptions),/one actual phase root/);
assert.throws(()=>instrumentArtworkBundle(phaseSource+'\n/*'+phaseRootSource+'*/',phaseOptions),/one actual phase root/);
assert.throws(()=>instrumentArtworkBundle(phaseSource,{...phaseOptions,phaseWitness:'1'}),/explicit boolean/);
assert.throws(()=>instrumentArtworkBundle(phaseSource+'\n// __HC_ART_PHASE__',phaseOptions),/collision/);
const phaseBody=instrumentArtworkBundle(phaseSource,phaseOptions).body;
const micro=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
function phaseRealm({instrumented=true,atlas,canLoad=()=>true,isCurrent=()=>true,main,decision}={}){
  let now=0;const calls=[],tasks=[],state=Object.freeze({tSec:0,rng:Object.freeze({baseSeed:123})});
  const ctx=vm.createContext({performance:{now:()=>now},setTimeout:(resolve,ms)=>{tasks.push({resolve,ms});},
    console:{warn:(...args)=>calls.push(['warning',...args])},state,canLoad,isCurrent,
    loadProgressiveChronicleArt:options=>{calls.push(['atlas',options]);return atlas?atlas(options):Promise.resolve({ok:true,reveal:()=>true});},
    app:{renderer:{}},worldMapView:{prepareProgressive:(...args)=>{calls.push(['main',...args]);return main?main(...args):Promise.resolve(()=>true);}},
    vassalNodeDecisionModalView:{prepareProgressive:(...args)=>{calls.push(['decision',...args]);return decision?decision(...args):Promise.resolve(()=>true);}},
    epoch:1,progressiveArtEpoch:1,pendingArtworkReveal:null,settlementDebugMenu:{refresh:()=>calls.push(['refresh'])}});
  vm.runInContext(instrumented?phaseBody:phaseSource,ctx);
  return {ctx,calls,tasks,state,advance:ms=>{now+=ms;},drain:async()=>{
    for(let i=0;i<1000;i++){await micro();if(!tasks.length)return;const task=tasks.shift();now+=task.ms;task.resolve();}
    throw new Error('fixture scheduler limit');
  }};
}
const phases=r=>r.ctx.__HC_ART_PHASE__;
const names=r=>Array.from(phases(r).events,e=>e.site);
const loaderOptions=(r,overrides={})=>({renderer:r.ctx.app.renderer,canLoad:r.ctx.canLoad,isCurrent:r.ctx.isCurrent,
  prepareTerrain:()=>Promise.resolve(()=>true),onReady:()=>{},onError:()=>{},...overrides});

// Baseline/instrumented paths call original gates in identical order/count and
// pass the very same wait/current callbacks into the original await callees.
for(const instrumented of [false,true]){
  let loadCalls=0,currentCalls=0;const order=[];
  const r=phaseRealm({instrumented,canLoad:()=>{order.push('load');return ++loadCalls>1;},isCurrent:()=>{order.push('current');currentCalls++;return true;}});
  const before=JSON.stringify(r.state),promise=r.ctx.phaseFixture.startRoot();await r.drain();assert.equal(await promise,undefined);
  assert.deepEqual(order,['current','load','current','load','load','current','current','current']);
  assert.equal(currentCalls,5);assert.equal(loadCalls,3);
  const atlasOptions=r.calls.find(x=>x[0]==='atlas')[1],mainArgs=r.calls.find(x=>x[0]==='main'),decisionArgs=r.calls.find(x=>x[0]==='decision');
  assert.equal(mainArgs[2],atlasOptions.wait);assert.equal(decisionArgs[2],atlasOptions.wait);
  assert.equal(mainArgs[3],r.ctx.isCurrent);assert.equal(decisionArgs[3],r.ctx.isCurrent);
  assert.equal(JSON.stringify(r.state),before,'no simulation/RNG writes');assert.equal(r.ctx.pendingArtworkReveal(),true);
  if(instrumented){assert.equal(phases(r).loaders[0].gates['pre-idle-load'].denied,1);
    assert.ok(names(r).includes('denied-delay-enter'));assert.ok(names(r).includes('pending-reveal'));
    assert.equal(phases(r).loaders[0].sites['denied-delay-return'].lastAt-phases(r).loaders[0].sites['denied-delay-enter'].lastAt,200);
    assert.equal(phases(r).loaders[0].sites['idle-return'].lastAt-phases(r).loaders[0].sites['idle-enter'].lastAt,32);}
}
// Held/delayed original atlas Promise is not replaced, touched with then(), or
// reported as returned early. Exactly one original .ok getter evaluation.
{
  const hold=deferred();let okReads=0;const artwork={get ok(){okReads++;return true;},reveal:()=>true};
  const r=phaseRealm({atlas:()=>hold.promise});const p=r.ctx.phaseFixture.startRoot();await micro();
  assert.equal(phases(r).loaders[0].lastPhase,'atlas-enter');assert.ok(!names(r).includes('atlas-return'));
  r.advance(321);hold.resolve(artwork);await r.drain();await p;assert.equal(okReads,1);
  assert.equal(phases(r).loaders[0].sites['atlas-return'].lastAt-phases(r).loaders[0].sites['atlas-enter'].lastAt,321);
}
// A thenable identity/control observes the same original object and exactly one
// await subscription in each path. No replacement Promise or extra .then chain.
for(const instrumented of [false,true]){
  let subscriptions=0;const originalPromise={then(resolve){assert.equal(this,originalPromise);subscriptions++;resolve({ok:false});}};
  const r=phaseRealm({instrumented,atlas:()=>originalPromise});const p=r.ctx.phaseFixture.startRoot();await r.drain();await p;assert.equal(subscriptions,1);
  assert.equal(r.calls.filter(x=>x[0]==='main').length,0);
  if(instrumented)assert.equal(phases(r).loaders[0].sites['atlas-return'].last,false);
}
// Native Promise identity is retained: the original Promise's observable own
// then getter is accessed exactly as in the original await, once per path.
// Instrumentation neither wraps nor replaces the Promise returned by callee.
for(const instrumented of [false,true]){
  const originalPromise=Promise.resolve({ok:false});let reads=0,receiver=null;
  const then=originalPromise.then;
  Object.defineProperty(originalPromise,'then',{get(){reads++;return function(...args){receiver=this;return then.apply(this,args);};}});
  const r=phaseRealm({instrumented,atlas:()=>originalPromise}),options=loaderOptions(r);
  const p=r.ctx.phaseFixture.loadProgressiveArtwork(options);await r.drain();await p;
  assert.equal(reads,1);assert.equal(receiver,originalPromise);
  assert.equal(r.calls.find(x=>x[0]==='atlas')[1].onError,options.onError);
}
// Rejections and errors preserve the exact original reason and call/return
// semantics. A rejected atlas remains unreturned; terrain rejection follows the
// original catch/onError path, rather than becoming a successful preparation.
{
  const reason=new Error('atlas-original-rejection'),hold=deferred(),r=phaseRealm({atlas:()=>hold.promise});
  const p=r.ctx.phaseFixture.loadProgressiveArtwork(loaderOptions(r));const rejected=assert.rejects(p,e=>e===reason);
  await micro();hold.reject(reason);await rejected;assert.equal(phases(r).loaders[0].lastPhase,'atlas-enter');
}
{
  const reason=new Error('terrain-original-rejection'),r=phaseRealm();let received=null;
  const p=r.ctx.phaseFixture.loadProgressiveArtwork(loaderOptions(r,{prepareTerrain:()=>Promise.reject(reason),onError:e=>{received=e;}}));
  await r.drain();assert.equal(await p,undefined);assert.equal(received,reason);assert.equal(phases(r).loaders[0].lastPhase,'caught-error');
}
for(const instrumented of [false,true]){
  const reason=new Error('original-gate-error'),r=phaseRealm({instrumented,isCurrent:()=>{throw reason;}});
  const p=r.ctx.phaseFixture.loadProgressiveArtwork(loaderOptions(r));await assert.rejects(p,e=>e===reason);
  assert.equal(r.calls.filter(x=>x[0]==='main').length,0);
}
// Held main and held decision await are individually localized. The root uses
// the synchronous caller ID captured before its first original await.
for(const stage of ['main','decision']){
  const hold=deferred(),r=phaseRealm({[stage]:()=>hold.promise});const p=r.ctx.phaseFixture.startRoot();await r.drain();
  assert.equal(phases(r).loaders[0].lastPhase,stage+'-enter');assert.ok(!phases(r).loaders[0].sites[stage+'-return']);
  hold.resolve(()=>true);await r.drain();await p;assert.ok(phases(r).loaders[0].sites[stage+'-return']);
}
{
  const reason=new Error('main-rejected'),r=phaseRealm({main:()=>Promise.reject(reason)});
  const p=r.ctx.phaseFixture.startRoot();await r.drain();await p;
  assert.equal(phases(r).loaders[0].lastPhase,'caught-error');
  assert.equal(phases(r).unlinkedSites['root-error-unlinked'].count,1);
  assert.equal(r.calls.filter(x=>x[0]==='decision').length,0);
}
// Idle scheduling can itself be held without a false return marker.
{
  const r=phaseRealm(),p=r.ctx.phaseFixture.startRoot();await micro();
  assert.equal(phases(r).loaders[0].lastPhase,'idle-enter');assert.ok(!phases(r).loaders[0].sites['idle-return']);
  assert.equal(r.tasks.length,1);await r.drain();await p;
}
// Stale/denied gates retain short-circuit semantics without an extra read. A
// stale queue never calls canLoad; a stale reveal never calls terrain/reveal.
{
  let reads=0;const r=phaseRealm({isCurrent:()=>false,canLoad:()=>{reads++;throw Error('short circuit lost');}});
  const p=r.ctx.phaseFixture.startRoot();await r.drain();await p;assert.equal(reads,0);
  assert.ok(names(r).includes('wait-stale-return'));assert.ok(names(r).includes('loader-stale-return'));
}
{
  let current=true,reveals=0;const r=phaseRealm({isCurrent:()=>current});
  const p=r.ctx.phaseFixture.loadProgressiveArtwork(loaderOptions(r,{prepareTerrain:()=>Promise.resolve(()=>{reveals++;return true;}),onReady:fn=>{r.reveal=fn;}}));
  await r.drain();await p;current=false;assert.equal(r.reveal(),false);assert.equal(reveals,0);
}
{
  let artworkReveals=0,terrainReveals=0;
  const r=phaseRealm({atlas:()=>Promise.resolve({ok:true,reveal:()=>{artworkReveals++;return true;}})});
  const p=r.ctx.phaseFixture.loadProgressiveArtwork(loaderOptions(r,{prepareTerrain:()=>Promise.resolve(()=>{terrainReveals++;return false;}),onReady:fn=>{r.reveal=fn;}}));
  await r.drain();await p;assert.equal(r.reveal(),false);assert.equal(terrainReveals,1);assert.equal(artworkReveals,0);
  assert.equal(phases(r).loaders[0].lastPhase,'terrain-reveal-denied');
}
// Global storage is bounded even across repeated queue waits and >8 loaders.
{
  const r=phaseRealm({atlas:async({wait})=>{for(let i=0;i<50;i++)await wait();return {ok:true,reveal:()=>true};}});
  const p=r.ctx.phaseFixture.startRoot();await r.drain();await p;
  assert.equal(phases(r).events.length,32);assert.ok(phases(r).droppedEvents>0);
  assert.equal(phases(r).loaders[0].lastPhase,'ready-return');assert.ok(phases(r).loaders[0].sites['main-return']);
  for(let i=0;i<10;i++){const q=r.ctx.phaseFixture.startRoot();await r.drain();await q;}
  assert.equal(phases(r).loaders.length,8);assert.equal(phases(r).loaderCount,11);assert.equal(phases(r).droppedLoaders,3);
  phases(r).droppedEvents=2147483647;r.ctx.hillclimbPhaseMark(null,'root-error-unlinked');assert.equal(phases(r).droppedEvents,2147483647);
}
// Two interleaved invocations retain distinct captured root IDs after awaits.
{
  const holds=[deferred(),deferred()];let n=0;const r=phaseRealm({main:()=>holds[n++].promise});
  const a=r.ctx.phaseFixture.startRoot();await r.drain();const b=r.ctx.phaseFixture.startRoot();await r.drain();
  holds[1].resolve(()=>true);await r.drain();await b;assert.ok(phases(r).loaders[1].sites['decision-return']);
  assert.ok(!phases(r).loaders[0].sites['main-return']);holds[0].resolve(()=>true);await r.drain();await a;
  assert.ok(phases(r).loaders[0].sites['decision-return']);
}
// Real-bundle binding plus independent saved pre-change implementation equality
// and frozen ABBA served hash: default OFF bytes remain exactly the old bytes.
const build=JSON.parse(await readFile('dist/build-manifest.json','utf8'));
const actualBundle=await readFile(path.join('dist',build.bundle),'utf8');
const beforeModule=await import(pathToFileURL(path.resolve('artifacts/perf-hillclimb/phase-witness-build-r1-20261115/before/scripts__perf-hillclimb__artwork-bundle-controls.mjs')).href);
const sha=x=>createHash('sha256').update(x).digest('hex');
const actualOff=instrumentArtworkBundle(actualBundle),oldOff=beforeModule.instrumentArtworkBundle(actualBundle);
assert.equal(actualOff.body,oldOff.body,'default response bytes match preserved pre-change implementation');
const abbaPlan=JSON.parse(await readFile('artifacts/perf-hillclimb/j8-optional-abba-r1-20261115/plan.json','utf8'));
assert.equal(sha(actualOff.body),abbaPlan.servedVariantSha256,'actual default response hash matches frozen ABBA authority');
assert.equal(sha(actualBundle),abbaPlan.originalBundleSha256);
const actualOn=instrumentArtworkBundle(actualBundle,{phaseWitness:true});assert.equal(actualOn.phaseWitnessVersion,1);
const priorPhasePlan=JSON.parse(await readFile('artifacts/perf-hillclimb/j8-phase-path-r1-20261115/plan.json','utf8'));
assert.equal(sha(actualOn.body),priorPhasePlan.servedVariantSha256,'phase-v1 response remains byte-identical when new counter seam disabled');
assert.notEqual(sha(actualOn.body),sha(actualOff.body));
const parsed=spawnSync(process.execPath,['--check','--input-type=module'],{input:actualOn.body,encoding:'utf8'});
assert.equal(parsed.status,0,`actual served module parses: ${parsed.stderr?.slice(0,500)}`);
for(const target of [phaseLoaderSource,phaseRootSource]){
  assert.throws(()=>instrumentArtworkBundle(actualBundle.replace(target,''),{phaseWitness:true}),/one actual phase/);
  assert.throws(()=>instrumentArtworkBundle(actualBundle+'\n/*'+target+'*/',{phaseWitness:true}),/one actual phase/);
}
// The actual runner's post-clock reader fails closed under an active clock,
// absent/wrong version, or overflowing storage, and retains bounded snapshots.
const runnerSource=await readFile('scripts/perf-hillclimb/artwork-controls.mjs','utf8');
const readerSource=runnerSource.slice(runnerSource.indexOf('async function readPhaseWitness(s){'),runnerSource.indexOf('\nasync function menu(s,'));
assert.ok(readerSource.startsWith('async function readPhaseWitness'));
const readerContext=vm.createContext({PHASE_WITNESS_VERSION:1,COOPERATIVE_WITNESS_VERSION:1,config:{cooperativeWitness:false},withDeadline:async value=>value});
vm.runInContext(readerSource+'\nglobalThis.read=readPhaseWitness;',readerContext);
const validPhase={version:1,events:[],loaders:[]};
const readIn=(active,witness)=>readerContext.read({page:{evaluate:async(fn,version)=>{
  const realm=vm.createContext({__HC__:{active},__HC_ART_PHASE__:witness,performance:{now:()=>400}});
  return vm.runInContext('('+fn.toString()+')('+JSON.stringify(version)+')',realm);
}}});
assert.equal((await readIn(false,validPhase)).collectedAt,400);
await assert.rejects(readIn(true,validPhase),/original operation clock/);
await assert.rejects(readIn(false,undefined),/missing or wrong version/);
await assert.rejects(readIn(false,{...validPhase,version:2}),/missing or wrong version/);
await assert.rejects(readIn(false,{...validPhase,events:Array(33).fill(null)}),/bounds violated/);
for(const badOption of ['--phase-witness=ignored','--phase-witness']){
  const rejected=spawnSync(process.execPath,['scripts/perf-hillclimb/artwork-controls.mjs',badOption],{encoding:'utf8'});
  assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/phase-witness requires explicit 0 or 1/);
}
console.log('[artwork-phase] exact actual bindings/missing/duplicate, default ABBA bytes, bounded overflow, call order/short circuit, same await objects/return/errors, held/delayed/rejected stages, no state writes and interleaved IDs passed; independent audit and actual cases pending');


// Paired counters: the exact existing runner and prepare await sites, known
// generator work distinct from existing delayed yield, no scheduler changes.
const coopPrepare=String.raw`
async function fixturePrepare(backgroundWait){
  const early=null,map={},presentation={},landmarks={},renderer={};
  const bakeOptions=()=>({});
  const cooperativeOptions=stats=>({stats,sliceMs:8,yieldTask:backgroundWait,isCancelled:()=>!isCurrent()});
        const start = performance.now(), cooperation = {};
        const art = early?.art ?? await runCooperative(bakePixelTerrainSteps(map, bakeOptions(map)), cooperativeOptions(cooperation));
        const built = await runCooperative(prepareRegionalTilesSteps(presentation, landmarks, renderer), cooperativeOptions(cooperation));
  globalThis.finishedStats=cooperation;return ()=>true;
}
globalThis.fixtureRun=runCooperative;
`;
const coopSource=phaseSource+'\n'+cooperativeSource+'\n'+coopPrepare;
const coopOptions={tracePublication:false,phaseWitness:true,cooperativeWitness:true};
const coopBody=instrumentArtworkBundle(coopSource,coopOptions).body;
assert.throws(()=>instrumentArtworkBundle(coopSource,{...coopOptions,phaseWitness:false}),/requires explicit/);
assert.throws(()=>instrumentArtworkBundle(coopSource,{...coopOptions,cooperativeWitness:'1'}),/requires explicit/);
for(const target of [cooperativeSource,...Object.values(cooperativePrepareBindings)]){
  assert.throws(()=>instrumentArtworkBundle(coopSource.replace(target,''),coopOptions),/one actual cooperative/);
  assert.throws(()=>instrumentArtworkBundle(coopSource+'\n/*'+target+'*/',coopOptions),/one actual cooperative/);
}
assert.throws(()=>instrumentArtworkBundle(coopSource+'\n// __HC_ART_COOP__',coopOptions),/collision/);
function coopRealm(instrumented=true){
  let now=0,current=true;const tasks=[],calls=[];
  const state=Object.freeze({tSec:0,rng:Object.freeze({baseSeed:123})});
  const ctx=vm.createContext({performance:{now:()=>now},setTimeout:(resolve,ms)=>tasks.push({resolve,ms}),
    console:{warn:(...args)=>calls.push(['warn',...args])},state,
    isCurrent:()=>{calls.push('current');return current;},canLoad:()=>{calls.push('load');return true;},
    loadProgressiveChronicleArt:()=>Promise.resolve({ok:true,reveal:()=>true}),
    bakePixelTerrainSteps:function*(){for(let i=0;i<3;i++){calls.push('bake-step');now+=20;yield;}now+=5;return {art:true};},
    prepareRegionalTilesSteps:function*(){for(let i=0;i<2;i++){calls.push('regional-step');now+=10;yield;}now+=2;return {regional:true};},
    app:{renderer:{}},worldMapView:{prepareProgressive:(_renderer,wait)=>ctx.fixturePrepare(wait)},
    vassalNodeDecisionModalView:{prepareProgressive:()=>Promise.resolve(()=>true)},
    epoch:1,progressiveArtEpoch:1,pendingArtworkReveal:null,settlementDebugMenu:{refresh:()=>calls.push('refresh')}});
  vm.runInContext(instrumented?coopBody:coopSource,ctx);
  return {ctx,calls,tasks,state,now:()=>now,advance:ms=>{now+=ms;},cancel:()=>{current=false;},drain:async()=>{
    for(let i=0;i<1000;i++){await micro();if(!tasks.length)return;const task=tasks.shift();now+=task.ms;task.resolve();}throw Error('fixture scheduler limit');}};
}
const nativeCoop=coopRealm(false),pairedCoop=coopRealm();
for(const r of [nativeCoop,pairedCoop]){const before=JSON.stringify(r.state),p=r.ctx.phaseFixture.startRoot();await r.drain();await p;assert.equal(JSON.stringify(r.state),before);assert.equal(r.ctx.pendingArtworkReveal(),true);}
assert.deepEqual(pairedCoop.calls,nativeCoop.calls,'original steps/gates/order unchanged');
assert.equal(pairedCoop.now(),nativeCoop.now(),'known original virtual wall time unchanged');
assert.equal(JSON.stringify(pairedCoop.ctx.finishedStats),JSON.stringify(nativeCoop.ctx.finishedStats),'original stats unchanged');
const coopWitness=pairedCoop.ctx.__HC_ART_COOP__,cl=coopWitness.loaders[0];
assert.equal(coopWitness.invalid,0);assert.equal(coopWitness.unlinkedJobs,0);assert.equal(cl.open,null);
assert.equal(cl.waits['main:idle'].count,5);assert.equal(cl.waits['main:idle'].totalMs,160);assert.equal(cl.waits['main:idle'].maxMs,32);
assert.deepEqual(Array.from(cl.jobs,j=>[j.name,j.steps,j.yields,j.status]),[['bake',4,3,'complete'],['regional',3,2,'complete']]);
assert.equal(cl.jobs[0].longestStepMs,20);assert.equal(cl.jobs[1].longestStepMs,20,'existing longest is cumulative shared stats, explicitly labelled');
assert.equal(cl.jobs[0].updatedAt-cl.jobs[0].started,161,'65ms known work plus96ms wait');
assert.equal(cl.jobs[1].updatedAt-cl.jobs[1].started,86,'22ms known work plus64ms wait');
// Open waits are retained as right-censored intervals; no fabricated return.
{
  const r=coopRealm();const p=r.ctx.phaseFixture.startRoot();await micro();const l=r.ctx.__HC_ART_COOP__.loaders[0];
  assert.equal(l.open.kind,'idle');assert.equal(l.open.phase,'pre-terrain');r.advance(77);assert.equal(r.now()-l.open.started,77);assert.equal(Object.keys(l.waits).length,0);
  await r.drain();await p;
}
// Overlap, unmatched returns, mixed callback identities and source phase
// changes are explicit invalidity; ambiguous spans never enter totals.
for(const mode of ['overlap','unmatched','phase-change','mixed-id']){
  const r=coopRealm(),c=r.ctx;c.hillclimbCoopPhase(1,'loader-enter',0);c.hillclimbCoopPhase(1,'main-enter',0);
  if(mode==='mixed-id'){const wait=()=>{};c.hillclimbCoopBindWait(wait,1);c.hillclimbCoopBindWait(wait,2);}
  else if(mode==='unmatched')c.hillclimbCoopPhase(1,'idle-return',10);
  else{c.hillclimbCoopPhase(1,'idle-enter',1);if(mode==='overlap')c.hillclimbCoopPhase(1,'idle-enter',2);else c.hillclimbCoopPhase(1,'decision-enter',2);c.hillclimbCoopPhase(1,'idle-return',10);}
  assert.ok(c.__HC_ART_COOP__.invalid>0);assert.equal(Object.keys(c.__HC_ART_COOP__.loaders[0].waits).length,0);
}
// Exact native yield thenable identity/subscription and return/error/cancel
// behavior. Registration observes only the owned stats; other jobs stay untouched.
for(const mode of ['complete','cancel','reject','step-throw']){
  const traces=[];
  for(const instrumented of [false,true]){
    const r=coopRealm(instrumented),c=r.ctx,stats={},error=Error(mode);let next=0,returned=0,subscriptions=0,receiver=false;
    const yieldObject={then(resolve,reject){subscriptions++;receiver=this===yieldObject;r.advance(51);if(mode==='reject')reject(error);else{if(mode==='cancel')r.cancel();resolve();}}};
    const yieldTask=()=>yieldObject;
    if(instrumented){c.hillclimbCoopPhase(1,'loader-enter',0);c.hillclimbCoopPhase(1,'main-enter',0);c.hillclimbCoopBindWait(yieldTask,1);c.hillclimbCoopRegister(stats,yieldTask);c.hillclimbCoopJob(stats,'bake');}
    const steps={next(){next++;r.advance(20);if(mode==='step-throw')throw error;return {done:next===2,value:'same-result'};},return(){returned++;}};
    let value,caught;try{value=await c.fixtureRun(steps,{stats,sliceMs:8,yieldTask,isCancelled:()=>!c.isCurrent()});}catch(e){caught=e;}
    if(mode==='reject'||mode==='step-throw')assert.equal(caught,error,'exact original thrown error retained');
    traces.push(JSON.stringify({next,returned,subscriptions,receiver,value,error:caught?.message,stats,now:r.now()}));
    if(instrumented&&mode==='cancel')assert.equal(c.__HC_ART_COOP__.loaders[0].jobs[0].status,'cancel');
  }
  assert.equal(traces[0],traces[1],mode+' original native behavior unchanged');
}
// Bounded progress and job storage; rejected attribution remains visible.
{
  const r=coopRealm(),c=r.ctx,wait=()=>{},stats={};c.hillclimbCoopPhase(1,'loader-enter',0);c.hillclimbCoopPhase(1,'main-enter',0);c.hillclimbCoopBindWait(wait,1);c.hillclimbCoopRegister(stats,wait);
  for(let i=0;i<6;i++){c.hillclimbCoopJob(stats,'bake');c.hillclimbCoopProgress(stats,'complete');}
  assert.equal(c.__HC_ART_COOP__.loaders[0].jobs.length,4);assert.ok(c.__HC_ART_COOP__.invalid>0);
  stats.steps=2147483648;c.hillclimbCoopProgress(stats,'yield-enter');assert.ok(c.__HC_ART_COOP__.invalid>2);
  for(let i=2;i<=10;i++)c.hillclimbCoopPhase(i,'loader-enter',0);assert.equal(c.__HC_ART_COOP__.loaders.length,8);
}
const actualCoop=instrumentArtworkBundle(actualBundle,{phaseWitness:true,cooperativeWitness:true});
assert.equal(actualCoop.cooperativeWitnessVersion,1);assert.notEqual(sha(actualCoop.body),sha(actualOn.body));
const parsedCoop=spawnSync(process.execPath,['--check','--input-type=module'],{input:actualCoop.body,encoding:'utf8'});assert.equal(parsedCoop.status,0,parsedCoop.stderr?.slice(0,500));
for(const target of [cooperativeSource,...Object.values(cooperativePrepareBindings)]){
  assert.throws(()=>instrumentArtworkBundle(actualBundle.replace(target,''),{phaseWitness:true,cooperativeWitness:true}),/one actual cooperative/);
  assert.throws(()=>instrumentArtworkBundle(actualBundle+'\n/*'+target+'*/',{phaseWitness:true,cooperativeWitness:true}),/one actual cooperative/);
}
readerContext.config.cooperativeWitness=true;
const coopRead=(witness,active=false)=>readerContext.read({page:{evaluate:async(fn,args)=>{
  const realm=vm.createContext({__HC__:{active},__HC_ART_PHASE__:validPhase,__HC_ART_COOP__:witness,performance:{now:()=>500}});
  return vm.runInContext('('+fn.toString()+')('+JSON.stringify(args)+')',realm);
}}});
const validCoop={version:1,loaders:[]};assert.equal((await coopRead(validCoop)).cooperative.collectedAt,500);
await assert.rejects(coopRead(undefined),/cooperative witness presence/);await assert.rejects(coopRead({...validCoop,version:2}),/cooperative witness presence/);
await assert.rejects(coopRead({...validCoop,loaders:Array(9).fill({jobs:[],waits:{}})}),/bounds violated/);
await assert.rejects(coopRead(validCoop,true),/original operation clock/);
for(const badOptions of [['--cooperative-witness'],['--cooperative-witness=ignored'],['--cooperative-witness=1']]){
  const rejected=spawnSync(process.execPath,['scripts/perf-hillclimb/artwork-controls.mjs',...badOptions],{encoding:'utf8'});assert.notEqual(rejected.status,0);assert.match(rejected.stderr,/cooperative-witness requires/);
}
console.log('[artwork-cooperative] paired known work/wait, open/cancel/reject/overlap/mixed attribution, native identity/ordering/stats, bounded counters, exact actual bindings and legacy response bytes passed; independent affected review/one actual case pending');

// Both original wait policies and independent loader accounting are retained.
{
  const r=coopRealm();let calls=0;r.ctx.canLoad=()=>++calls>1;
  const p=r.ctx.phaseFixture.startRoot();await r.drain();await p;
  const w=r.ctx.__HC_ART_COOP__;assert.equal(w.invalid,0);
  assert.equal(w.loaders[0].waits['pre-terrain:denied-delay'].count,1);
  assert.equal(w.loaders[0].waits['pre-terrain:denied-delay'].totalMs,200);
}
{
  const r=coopRealm(),c=r.ctx;
  for(const id of [1,2]){c.hillclimbCoopPhase(id,'loader-enter',0);c.hillclimbCoopPhase(id,'main-enter',1);c.hillclimbCoopPhase(id,'idle-enter',2);}
  c.hillclimbCoopPhase(2,'idle-return',12);c.hillclimbCoopPhase(1,'idle-return',22);
  assert.equal(c.__HC_ART_COOP__.invalid,0);assert.equal(c.__HC_ART_COOP__.loaders[0].waits['main:idle'].totalMs,20);assert.equal(c.__HC_ART_COOP__.loaders[1].waits['main:idle'].totalMs,10);
}
console.log('[artwork-cooperative] denied-delay and interleaved loader accounting passed');
