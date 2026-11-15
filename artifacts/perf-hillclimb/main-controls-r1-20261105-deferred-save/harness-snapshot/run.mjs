import assert from 'node:assert/strict';
import {mkdir,writeFile,appendFile,readFile,readdir} from 'node:fs/promises';
import {spawn,execFileSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {isDeepStrictEqual} from 'node:util';
import {setTimeout as delay} from 'node:timers/promises';
import {gunzipSync} from 'node:zlib';
import {chromium} from 'playwright';
import {BROWSER_PROBE_LAUNCH_OPTIONS} from '../browser-probe-config.mjs';
import {SAVE_DATABASE_NAME} from '../../src/controllers/sim-runner/save-storage.js';
import {inspectSaveText} from '../../src/controllers/sim-runner/save-slots.js';
import {serializeGameState,deserializeGameState} from '../../src/model/state.js';
import {advanceReplayStateOneSecond} from '../../src/model/replay-second-runner.js';
import {createFixtures,digest} from './fixtures.mjs';
import * as constructionOracle from './oracle-entry.mjs';
import {loadFrozenCorpus} from './freeze-corpus.mjs';
import {installRuntime,installSave,readSave} from './browser-runtime.mjs';
import {summarize} from './statistics.mjs';
import {dispatchOfferedDrag,dispatchOfferedPinch} from './offered-input.mjs';
import {assertActiveWork} from './active-work-oracle.mjs';
import {expectedPlanningPause,expectedOpeningKnowledge} from './save-state-oracle.mjs';
import {scrubComplete,installSaveCompletionControl,installScrubInputObservation,installStaleGenerationControl} from './main-job-oracles.mjs';
import {MAP_VIEWPORT_RECT} from '../../src/views/world-map/constants.js';
import {withDeadline} from './deadline.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(a=>{const [k,...v]=a.replace(/^--/,'').split('=');return[k,v.join('=')||true];}));
const config={jobs:String(args.jobs??'all').split(','),samples:Number(args.samples??1),
  population:String(args.population??'desktop'),cache:String(args.cache??'cold'),
  artwork:String(args.artwork??'off'),instrumentation:args.instrumentation!=='off',
  workerDelayMs:Number(args['worker-delay']??0),timeoutMs:Number(args.timeout??180000),
  port:Number(args.port??18244),dist:String(args.dist??'dist'),seed:Number(args.seed??123),control:args.control??null};
assert.ok([null,'wrong-target','stale-generation','clamp-bypass','wrong-save','deferred-save'].includes(config.control));
assert.ok(['desktop','mobile','mobile4'].includes(config.population));
assert.ok(['cold','warm'].includes(config.cache));
assert.ok(['off','progressive','illustrated'].includes(config.artwork));
assert.ok(Number.isInteger(config.samples)&&config.samples>=1,'positive independent suite count');
assert.ok([123,424242,99117].includes(config.seed),'fixed representative seed corpus');
const runId=String(args.id??new Date().toISOString().replace(/[:.]/g,'-'));
const output=path.resolve(String(args.output??`artifacts/perf-hillclimb/${runId}`));
await mkdir(path.dirname(output),{recursive:true});
await mkdir(output); // Never replace a prior manifest or append duplicate run identities.
const frozen=args['fixture-manifest']?await loadFrozenCorpus(String(args['fixture-manifest']),{
  expectedIdentity:args['fixture-manifest-id'],seed:config.seed}):null;
assert.ok(frozen||!args['fixture-manifest-id'],'fixture manifest ID needs its explicit frozen manifest path');
const expectedOracle=frozen?.oracle??constructionOracle;
const fixtures=frozen?.fixtures??createFixtures(config.seed);
const workloadMode=frozen?'frozen-baseline':'generated-construction-only';
const comparisonEligible=!!frozen&&!config.control;
const fixtureManifestId=frozen?.manifest.identity??'none-construction-only';
await writeFile(path.join(output,'fixtures.json'),JSON.stringify(Object.fromEntries(Object.entries(fixtures).map(([k,{text,expectedState,...f}])=>[k,f])),null,2));
const manifest={runId,started:new Date().toISOString(),config,productHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  branch:execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim(),
  dirty:execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim().split('\n').filter(Boolean),
  machine:{host:os.hostname(),platform:os.platform(),release:os.release(),arch:os.arch(),cpus:os.cpus(),totalMemory:os.totalmem()},
  runtime:{node:process.version,playwright:JSON.parse(await readFile('node_modules/playwright/package.json','utf8')).version},
  launch:BROWSER_PROBE_LAUNCH_OPTIONS,proxy:'desktop OS/CPU/GPU; no physical Pixel 6 evidence',
  timings:'Browser performance.now input capture through semantic completion plus double-rAF frame opportunity; not physical scanout',
  loadModel:'closed-loop transactions; map pan and mobile two-touch pinch additionally use fixed offered input independent of acknowledgements (pending validation)',
  postActionObservationMs:2500,
  requiredPassiveTimingApiVersion:2,
  phaseAStatus:'NOT SOUND; frozen workload identity is only one prerequisite, independent end-to-end acceptance remains required',
  workload:{mode:workloadMode,fixtureManifestId,comparisonEligible,
    frozenManifestPath:frozen?.absolute??null,oracleSdkSha256:frozen?.manifest.sdk.sha256??null,
    oracleSourceId:frozen?.manifest.source.sourceId??null,
    policy:frozen?'immutable corpus and SDK reused; current product only produces actual results':'CONSTRUCTION ONLY: current model generates workload and expected results; ineligible for scoring'},
  externalLoad:process.env.HC_LOAD_NOTES??'operator load not instrumented; no known competing task-owned workload'};
for(const f of ['build-info.json','build-manifest.json'])try{manifest[f]=JSON.parse(await readFile(path.join(config.dist,f),'utf8'));}catch{}
assert.ok(manifest['build-manifest.json'],'exact built asset manifest is required');
manifest.buildId=digest(manifest['build-manifest.json']);
const preparedFixture=await readFile(path.join(config.dist,'images/dev-fixtures/performance-start.json.gz'));
const actualPreparedPacket=(()=>{
  const packet=JSON.parse(gunzipSync(preparedFixture));
  return {key:packet.key,seed:packet.stateData.rng.baseSeed,stateSha256:digest(packet.stateData),lossSec:packet.lossSec};
})();
assert.equal(actualPreparedPacket.key,manifest['build-manifest.json'].performanceFixtureKey,'actual prepared packet key agrees with build');
assert.equal(actualPreparedPacket.seed,123,'actual prepared packet fixed seed');
manifest.preparedFixture={key:manifest['build-manifest.json'].performanceFixtureKey,compressedBytes:preparedFixture.length,sha256:digest(preparedFixture),
  logicalSeed:123,stateSha256:actualPreparedPacket.stateSha256,lossSec:actualPreparedPacket.lossSec,
  expectedOrdinaryStateSha256:frozen?.manifest.prepared.expectedOrdinaryState??actualPreparedPacket.stateSha256,
  preparation:'npm run build / npm start invokes performance-fixture.mjs; generation is outside runtime timings'};
if(frozen){
  await writeFile(path.join(output,'frozen-corpus-manifest.json'),await readFile(frozen.absolute));
  assert.equal(frozen.manifest.prepared.logicalSeed,123,'prepared packet has fixed logical seed123');
  assert.equal(manifest.preparedFixture.stateSha256,frozen.manifest.prepared.expectedOrdinaryState,'candidate prepared initial state preserves fixed logical seed123 workload');
}
const preparedWorkloadId=`prepared:seed=123:ordinary-state=${manifest.preparedFixture.expectedOrdinaryStateSha256}`;
manifest.harnessFiles={};
await mkdir(path.join(output,'harness-snapshot'),{recursive:true});
for(const file of (await readdir('scripts/perf-hillclimb')).filter(f=>f.endsWith('.mjs')).sort()){
  const source=await readFile(`scripts/perf-hillclimb/${file}`,'utf8');manifest.harnessFiles[file]=digest(source);
  await writeFile(path.join(output,'harness-snapshot',file),source);
}
manifest.harnessId=digest(manifest.harnessFiles);
const contract=await readFile('docs/performance/perf-hillclimb-20261104/HARNESS.md','utf8');
manifest.measurementContractId=digest(contract);
await writeFile(path.join(output,'measurement-contract.md'),contract);
await writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2));
const server=args.url?null:spawn(process.execPath,['node_modules/serve/bin/serve.js','-l',String(config.port),'--no-clipboard',config.dist],{stdio:'ignore',windowsHide:true});
const url=String(args.url??`http://127.0.0.1:${config.port}/`);
try {for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{}await delay(100);}
const servedManifest=await fetch(new URL('build-manifest.json',url));
assert.equal(servedManifest.ok,true,'server must expose exact built manifest, not a source preview/fallback page');
assert.equal(digest(await servedManifest.json()),manifest.buildId,'served build manifest must match declared product');
manifest.servedAssets={};
for(const key of ['bundle','worker','saveLoadWorker','stylesheet']){
  const relative=manifest['build-manifest.json'][key];
  const actual=await fetch(new URL(relative,url));assert.equal(actual.ok,true,`served ${key}`);
  const bytes=Buffer.from(await actual.arrayBuffer());
  const expected=await readFile(path.join(config.dist,relative));
  assert.equal(digest(bytes),digest(expected),`served ${key} bytes match declared dist`);
  manifest.servedAssets[key]=digest(bytes);
}
}catch(error){server?.kill();throw error;}
const records=[];let currentPage;let activeBrowser;let failed=false;let launchId;let pagePopulation;let pageInputFixture;let pageExpected;
const population={layout:config.population,cpuRate:config.population==='mobile4'?4:1,cache:config.cache,artwork:config.artwork,
  instrumentation:config.instrumentation,workerDelayMs:config.workerDelayMs,seed:config.seed,workloadMode,fixtureManifestId,control:config.control};
population.inputType=config.population==='desktop'?'mouse':'touch';
let nextObservationId=1;
const launches=[];
const calibrations=[];
let canvasBox;
let pendingOfferedEvidence=null;

async function record(job,step,body,{input,fixture=null,event='pointerdown',startNow=false,captureInputTiming=false,oracle}={}) {
  const page=currentPage;
  const header={runId,buildId:manifest.buildId,observationId:`${runId}:op-${nextObservationId++}`,launchId,job,step,
    harnessId:manifest.harnessId,measurementContractId:manifest.measurementContractId,
    fixtureManifestId,oracleSdkSha256:manifest.workload.oracleSdkSha256,comparisonEligible,
    population:pagePopulation??population,fixture:fixture?.sha256??fixture??pageInputFixture??`ordinary:seed=${config.seed}`,input};
  const hostGuardEnd=performance.now()+config.timeoutMs+10000;
  const bounded=(promise,label)=>withDeadline(promise,Math.max(1,hostGuardEnd-performance.now()),label);
  let completedTiming,armed=false,oracleStart=null;
  pendingOfferedEvidence=null;
  try {
    await bounded(page.evaluate(({step,event,timeoutMs,startNow,captureInputTiming})=>__HC__.arm({name:step,event,timeoutMs,startNow,captureInputTiming}),{step,event,timeoutMs:config.timeoutMs,startNow,captureInputTiming}),`${job}/${step} arm`);armed=true;
    const witness=await bounded(body(),`${job}/${step} body`);
    const timing=completedTiming=await bounded(page.evaluate(w=>__HC__.finish(w),witness??null),`${job}/${step} finish`);
    assert.ok(timing.elapsedMs>=0,'finite nonnegative browser elapsed');
    assert.ok(startNow||timing.trustedInput,'real trusted input required');
    oracleStart=oracle?await page.evaluate(()=>performance.now()):null;
    const oracleResult=oracle?await withDeadline(oracle(witness,timing),config.timeoutMs,`${job}/${step} untimed correctness oracle`):null;
    const oracleEnd=oracle?await page.evaluate(()=>performance.now()):null;
    const row={...header,ok:true,...timing,untimedOracle:oracleResult,untimedOracleWindow:oracle?{startMs:oracleStart,endMs:oracleEnd}:null};records.push(row);
    await appendFile(path.join(output,'observations.jsonl'),JSON.stringify(row)+'\n');
    return row;
  }catch(error){
    const timing=completedTiming??(armed?await withDeadline(page.evaluate(e=>__HC__.cancel(e),error.message),5000,'failed operation cancellation').catch(()=>null):null);
    const oracleEnd=oracleStart!==null?await withDeadline(page.evaluate(()=>performance.now()),5000,'failed oracle window marker').catch(()=>null):null;
    const row={...header,ok:false,...timing,error:error.stack,timeout:/timeout/i.test(error.message),
      untimedOracleWindow:oracleStart!==null?{startMs:oracleStart,endMs:oracleEnd}:null};
    records.push(row);await appendFile(path.join(output,'observations.jsonl'),JSON.stringify(row)+'\n');
    if(pendingOfferedEvidence)await writeFile(path.join(output,`failure-${job}-${step}-offered.json`),JSON.stringify(pendingOfferedEvidence));
    if(job==='J5'){
      const input=await withDeadline(page.evaluate(()=>{const p=globalThis.__HC_SCRUB_INPUT__;p?.stop();return p?.events??null;}),5000,'scrub failure input evidence').catch(()=>null);
      await writeFile(path.join(output,`failure-${job}-${step}-input.json`),JSON.stringify(input));
    }
    if(config.control==='stale-generation'){
      const fault=await withDeadline(page.evaluate(()=>__HC_STALE_CONTROL__),5000,'stale generation control evidence').catch(()=>null);
      await writeFile(path.join(output,'stale-generation-deliveries.json'),JSON.stringify(fault,null,2));
    }
    const failureState=await withDeadline(page.evaluate(()=>{
      const api=globalThis.__SETTLEMENT_DEBUG__;
      const passive=api?.getTimingSnapshot({includeProjectionSource:true});
      const s=api?.getSnapshot();if(!s)return {passive};
      return {passive,frontier:s.frontierSec,viewed:s.viewedSec,mode:s.worldMap.mode,camera:s.worldMap.camera,
        processing:s.worldMap.lifeDecisionProcessing,projection:s.projection,forecast:s.forecastStatus,
        graph:{revealed:s.graph.revealedCoverageEndSec,target:s.graph.forecastRevealFollowTargetEndSec,plot:s.graph.plotScreenRect},
        decision:{open:s.lifeMapDecision.open,family:s.lifeMapDecision.family,selected:s.lifeMapDecision.selectedOptionId,
          shopTag:s.lifeMapDecision.shopTag,offers:s.lifeMapDecision.offers?.map(o=>({id:o.offerId,canStage:o.canStage})),
          purchaseOrder:s.lifeMapDecision.purchaseOrder,recap:s.lifeMapRecap.open}};
    }),5000,'failure diagnostic').catch(()=>null);
    await writeFile(path.join(output,`failure-${job}-${step}.json`),JSON.stringify({expected:header,error:error.message,actual:failureState},null,2));
    await withDeadline(page.screenshot({path:path.join(output,`failure-${job}-${step}.png`)}),5000,'failure screenshot').catch(()=>{});
    throw error;
  }
}
async function closeSession(session){
  try{
    if(!session.page.isClosed()){
      const marker=await withDeadline(session.page.evaluate(()=>{
        const last=__HC__.operations.at(-1);return {lastFinished:last?.finished??null,now:performance.now()};
      }),5000,'session marker');
      if(marker.lastFinished!==null){
        const end=marker.lastFinished+manifest.postActionObservationMs;
        if(marker.now<end)await delay(end-marker.now);
        await withDeadline(session.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))),config.timeoutMs,'continuous frame observation');
        const telemetry=await withDeadline(session.page.evaluate(({end,lastFinished})=>({
          session:__HC__.readContinuousWindow({startMs:0,endMs:performance.now()}),
          postAction:__HC__.readContinuousWindow({startMs:lastFinished,endMs:end}),
        }),{end,lastFinished:marker.lastFinished}),5000,'continuous telemetry');
        const excludedOracleWindows=records.filter(r=>r.launchId===launchId&&r.untimedOracleWindow)
          .map(r=>({...r.untimedOracleWindow,observationId:r.observationId,reason:'host frozen replay/full-state correctness oracle; not product frame/stall evidence'}));
        const productFrameIntervals=telemetry.session.frames.filter(f=>!excludedOracleWindows.some(w=>
          w.endMs===null||f.time>w.startMs&&f.time-f.dt<w.endMs));
        const productLongTasks=telemetry.session.longTasks.filter(t=>!excludedOracleWindows.some(w=>
          w.endMs===null||t.start+t.duration>w.startMs&&t.start<w.endMs));
        await writeFile(path.join(output,`${launchId.split(':').at(-1)}-continuous.json`),JSON.stringify({
          ...telemetry,excludedOracleWindows,productFrameIntervals,productLongTasks,
          policy:'raw session/postAction retained; product arrays exclude any positive overlap with explicit heavy correctness-oracle windows; excluded gaps cannot establish smoothness',
        }));
      }
    }
  }finally{await session.context.close();}
}
let nextWaitId=1;
async function wait(fn,arg,timeout=config.timeoutMs,terminal=false) {
  const handle=await currentPage.waitForFunction(({source,arg,waitId,terminal})=>__HC__.probe(()=>Function('arg',`return (${source})(arg)`)(arg),{key:waitId,terminal}),
    {source:fn.toString(),arg,waitId:nextWaitId++,terminal},{polling:'raf',timeout});
  const result=await handle.jsonValue();await handle.dispose();return result;
}
const complete=(fn,arg,timeout)=>wait(fn,arg,timeout,true);
const observe=(fn,arg,{terminal=true,timeout=config.timeoutMs,query}={})=>wait(options=>{
  const s=__SETTLEMENT_DEBUG__.getTimingSnapshot(options.query);
  if(s?.version!==2)throw new Error('passive timing DTO v2 is required');
  return Function('s','arg',`return (${options.source})(s,arg)`)(s,options.arg);
},{source:fn.toString(),arg,query},timeout,terminal);
async function timing(query){return currentPage.evaluate(query=>{
  const start=performance.now();
  try{return __SETTLEMENT_DEBUG__.getTimingSnapshot(query);}
  finally{const op=__HC__.active;if(op){op.directTimingReadCount=(op.directTimingReadCount??0)+1;
    op.directTimingReadCpuMs=(op.directTimingReadCpuMs??0)+performance.now()-start;}}
},query);}
async function requirePassiveFields(paths,query){
  const missing=await currentPage.evaluate(({paths,query})=>{
    const s=__SETTLEMENT_DEBUG__.getTimingSnapshot(query);
    return paths.filter(path=>{let value=s;for(const key of path.split('.')){if(value==null||!Object.hasOwn(value,key))return true;value=value[key];}return false;});
  },{paths,query});
  assert.deepEqual(missing,[],`missing passive fields block this job: ${missing.join(', ')}`);
}
async function snapshot(){return currentPage.evaluate(()=>{
  if(__HC__.active)throw new Error('intrusive full snapshot forbidden inside measured operation');
  const {gameConfig,...s}=__SETTLEMENT_DEBUG__.getSnapshot();return s;
});}
async function point(method,arg){
  const result=await currentPage.evaluate(({method,arg})=>{
    if(__HC__.active)throw new Error('calibrate geometry outside measured operation');
    const before=__SETTLEMENT_DEBUG__.getTimingSnapshot();
    const value=__SETTLEMENT_DEBUG__[method](arg);
    const after=__SETTLEMENT_DEBUG__.getTimingSnapshot();return {value,before,after};
  },{method,arg});
  calibrations.push({launchId,method,arg,point:result.value,passiveBefore:result.before,passiveAfter:result.after,
    policy:'explicit untimed geometry calibration; raw-DTo parity alone does not prove hidden-cache passivity'});
  assert.ok(isDeepStrictEqual(result.before,result.after),`${method} geometry calibration changed raw timing primitives`);
  canvasBox=await currentPage.locator('canvas').boundingBox();
  calibrations.at(-1).canvasBox=canvasBox;
  return result.value;
}
const activate=id=>config.population==='desktop'?currentPage.getByTestId(id).click():currentPage.getByTestId(id).tap();
async function click(p,{double=false}={}) {
  assert.ok(p,'real control exists');const b=canvasBox;assert.ok(b,'untimed canvas geometry calibrated');
  const x=b.x+p.x*b.width/2424,y=b.y+p.y*b.height/1080;
  if(config.population!=='desktop'&&double){await currentPage.touchscreen.tap(x,y);await delay(80);await currentPage.touchscreen.tap(x,y);}
  else if(config.population!=='desktop')await currentPage.touchscreen.tap(x,y);
  else if(double)await currentPage.mouse.dblclick(x,y,{delay:80});
  else{await currentPage.mouse.move(x,y);await currentPage.mouse.down();await currentPage.mouse.up();}
}
async function launch(sample,job) {
  launchId=`${runId}:launch-${sample}-${job}`;
  activeBrowser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
  launches.push({launchId,sample,job,hostStarted:new Date().toISOString(),browserProcess:'fresh Chromium.launch',contextPolicy:'isolated context per job; warm retained only within declared unmeasured priming'});
  manifest.runtime.chromium=activeBrowser.version();
  if(!manifest.gpu)try{const c=await activeBrowser.newBrowserCDPSession();manifest.gpu=(await c.send('SystemInfo.getInfo')).gpu;}catch{}
}
async function newPage({fixture,slot=1,artwork=config.artwork,ordinary=false,regularUrl=false}={}) {
  const context=await activeBrowser.newContext({viewport:config.population==='desktop'?{width:1280,height:800}:{width:844,height:390},
    hasTouch:config.population!=='desktop',isMobile:config.population!=='desktop',deviceScaleFactor:1});
  const page=await context.newPage();currentPage=page;page.setDefaultTimeout(config.timeoutMs);
  pagePopulation={...population,artwork,entryPath:ordinary?'ordinary':'continue-fixture'};
  pageInputFixture=fixture?.sha256??`ordinary:seed=${config.seed}`;
  pageExpected={frontierSec:fixture?.seconds??0,actionCount:fixture?.actions??0};
  const errors=[];page.on('pageerror',e=>errors.push({message:e.message,time:Date.now()}));
  const runtimeOptions={instrumentation:config.instrumentation,workerDelayMs:config.workerDelayMs};
  if(config.control==='stale-generation'){
    const content=`(${installStaleGenerationControl.toString()})(${JSON.stringify({asset:manifest['build-manifest.json'].worker})});\n(${installRuntime.toString()})(${JSON.stringify(runtimeOptions)});`;
    await writeFile(path.join(output,'stale-generation-init.js'),content);
    await page.addInitScript({content});
  }else await page.addInitScript(installRuntime,runtimeOptions);
  if(config.control==='clamp-bypass'){
    const asset=manifest['build-manifest.json'].bundle,original=await readFile(path.join(config.dist,asset),'utf8');
    const begin='  function getVisibleForecastScrubCapSec() {',end='  function clampScrubSecToRevealCap(targetSec) {';
    const from=original.indexOf(begin),to=original.indexOf(end,from);
    assert.ok(from>=0&&to>from&&original.indexOf(begin,from+1)===-1,'one exact private reveal-cap function in pinned built app');
    const replacement='  function getVisibleForecastScrubCapSec() { return maxSec; }\n';
    const mutant=original.slice(0,from)+replacement+original.slice(to);
    manifest.controlAsset={kind:'isolated response-only reveal-cap bypass',asset,originalSha256:digest(original),mutantSha256:digest(mutant),
      originalFunction:original.slice(from,to),replacement,eligible:false};
    await writeFile(path.join(output,'control-mutant-app.js'),mutant);
    await page.route(new URL(asset,url).href,route=>route.fulfill({status:200,contentType:'text/javascript',body:mutant}));
  }
  await page.addInitScript(({ordinary,artwork,seed})=>{
    // New game seed is the real menu preference; no RNG function is replaced.
    localStorage.setItem('full-map-redesign-v1.newGame.devSettings',JSON.stringify({enabled:false,seed}));
    localStorage.setItem('dev.progressiveArtwork',artwork==='progressive'?'on':'off');
  },{ordinary,artwork,seed:config.seed});
  const cdp=await context.newCDPSession(page);if(population.cpuRate>1)await cdp.send('Emulation.setCPUThrottlingRate',{rate:population.cpuRate});
  if(fixture) {
    await page.goto(url+'__harness_fixture_setup__');
    await page.evaluate(installSave,{database:SAVE_DATABASE_NAME,slot,text:fixture.text,meta:fixture.meta});
  }
  // A warm population primes the exact full navigation/entry path once. It is
  // separate from timed observations; browser process/context/cache persist.
  const target=regularUrl?url:ordinary?(artwork==='illustrated'?url:`${url}?dev=1`):artwork==='illustrated'?url:`${url}?dev=1&art=0`;
  await page.goto(target);
  await page.getByTestId('game-new').waitFor();
  await page.waitForFunction(()=>document.querySelector('[data-testid=game-new]')?.disabled===false);
  const menuReady=await page.evaluate(async()=>{
    const readyAtMs=performance.now();
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    if(document.querySelector('[data-testid=game-new]')?.disabled!==false)throw new Error('menu readiness did not persist');
    return {readyAtMs,frameOpportunityMs:performance.now(),scope:'navigation time origin to host-observed enabled menu + double-rAF; includes driver observation gap, firstFeedback unmeasured'};
  });
  launches.at(-1).menuReady=menuReady;
  if(config.cache==='warm') {
    await page.waitForFunction(()=>!document.querySelector('[data-testid=game-new]').disabled);
    if(fixture){
      if(slot==='performance-dev'){
        await page.getByTestId('game-developer-tools').locator('summary').click();
        await activate('game-continue-performance');
      }else await activate('game-continue');
      await useful();
    }
    else if(regularUrl){
      await page.getByTestId('game-developer-tools').locator('summary').click();
      await page.getByTestId('game-progressive-artwork').setChecked(artwork==='progressive');
      await activate('game-new-performance');await useful({opening:true});
    }else{await activate('game-new');await activate('game-slot-1');await useful({opening:true});}
    await page.goto(url+'__harness_fixture_setup__');
    await page.evaluate(async database=>{
      const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(database,1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
      try{await new Promise((resolve,reject)=>{const tx=db.transaction(['saves','slots'],'readwrite');tx.objectStore('saves').clear();tx.objectStore('slots').clear();tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});}finally{db.close();}
    },SAVE_DATABASE_NAME);
    if(fixture)await page.evaluate(installSave,{database:SAVE_DATABASE_NAME,slot,text:fixture.text,meta:fixture.meta});
    await page.goto(target);await page.getByTestId('game-new').waitFor();
  }
  canvasBox=await page.locator('canvas').boundingBox();
  const versions=await page.evaluate(()=>({runtime:__HC__.version,passiveTiming:__SETTLEMENT_DEBUG__.getTimingSnapshot().version}));
  assert.equal(versions.passiveTiming,manifest.requiredPassiveTimingApiVersion,'served passive timing API must match harness contract');
  launches.at(-1).documentVersions=versions;
  return {page,context,cdp,errors};
}
async function useful({opening=false}={}) {
  if(opening)await requirePassiveFields(['opening.phase','opening.lossSec','opening.coverageSec']);
  return observe((s,expected)=>{
    const menu=document.querySelector('[data-testid=game-menu]');
    return menu?.hidden===true&&s.mode==='map'&&s.map.visible&&s.graph.visible
      &&s.runner.frontierSec===expected.frontierSec&&s.runner.actionCount===expected.actionCount
      &&s.graph.historyEndSec===expected.frontierSec&&s.graph.computedSec>=expected.frontierSec
      &&(!expected.opening||s.opening.phase==='completed'&&s.opening.lossSec>0
        &&s.opening.coverageSec>=s.opening.lossSec&&s.graph.computedSec>=s.opening.lossSec)&&s;
  },{...pageExpected,opening});
}
async function present(p) {
  p??=await point('getTimeActionClickPoint');if(p)await click(p);
  return observe(s=>s.runner.viewedSec===s.runner.frontierSec&&s.runner.previewActive===false&&s);
}
async function previewOracle(fixture,second,observed) {
  const saved=expectedOracle.inspectSaveText(fixture.text);assert.equal(saved.ok,true);
  const replay=expectedOracle.rebuildStateAtSecond(saved.nextTimeline,second);assert.equal(replay.ok,true);
  const json=x=>JSON.parse(JSON.stringify(x));
  const actual={civilization:json(observed.worldMap.civilizationSummary),settlement:observed.worldMap.selectedRegionId?json(observed.worldMap.selectedRegion?.detailedSettlement):null};
  const expected={civilization:json(expectedOracle.getDetailedCivilizationSummary(replay.state)),settlement:observed.worldMap.selectedRegionId?
    json(expectedOracle.getDetailedSettlementViewModel(replay.state,observed.worldMap.selectedRegionId)):null};
  const comparison={fixture:fixture.sha256,fixtureManifestId,oracleSdkSha256:manifest.workload.oracleSdkSha256,second,
    replayedStateSha256:digest(expectedOracle.serializeGameState(replay.state)),
    actualHash:digest(actual),expectedHash:digest(expected),deltaPaths:differencePaths(actual,expected),actual,expected};
  const artifact=`preview-${launchId.split(':').at(-1)}-${second}.json`;
  await writeFile(path.join(output,artifact),JSON.stringify(comparison,null,2));
  assert.ok(isDeepStrictEqual(actual,expected),`visible preview/replay differs: ${comparison.deltaPaths.join(', ')}; ${artifact}`);
  return {second,replayedStateSha256:comparison.replayedStateSha256,civilizationSummary:true,selectedSettlement:true,artifact};
}
function differencePaths(a,b,prefix='',out=[]) {
  if(out.length>=64||Object.is(a,b))return out;
  if(!a||!b||typeof a!=='object'||typeof b!=='object'){out.push(prefix||'<root>');return out;}
  for(const key of new Set([...Object.keys(a),...Object.keys(b)])){
    if(out.length>=64)break;
    differencePaths(a[key],b[key],prefix?`${prefix}.${key}`:key,out);
  }
  return out;
}
async function fullSaveOracle(fixture,text,tag,{planningPause=false,openingKnowledge=false}={}) {
  const checked=inspectSaveText(text),original=expectedOracle.inspectSaveText(fixture.text);
  assert.equal(checked.ok,true,'saved envelope and authoritative replay are valid');assert.equal(original.ok,true);
  const immutable=fixture.expectedState??expectedOracle.serializeGameState(original.state);
  assert.ok(isDeepStrictEqual(expectedOracle.serializeGameState(original.state),immutable),'frozen SDK frontier matches raw immutable expected state');
  const opening=openingKnowledge?expectedOpeningKnowledge(expectedOracle,immutable):null;
  const expected=opening?.expectedState??immutable;
  const expectedRaw=planningPause?expectedPlanningPause(expectedOracle,expected):expected;
  const actual=serializeGameState(checked.state),raw=JSON.parse(text).state;
  const decoded=serializeGameState(deserializeGameState(raw));
  const identity={sourceFixture:fixture.sha256,fixtureManifestId,oracleSdkSha256:manifest.workload.oracleSdkSha256,
    sourceState:digest(immutable),expectedReplayState:digest(expected),expectedOpeningKnowledge:opening?{lossSec:opening.lossSec,lossYear:opening.lossYear,officialSeconds:opening.officialSeconds}:null,
    expectedRawSavedState:digest(expectedRaw),rawSavedState:digest(raw),decodedSavedState:digest(decoded),rebuiltSavedState:digest(actual),
    deltaPaths:differencePaths(actual,expected),rawDeltaPaths:differencePaths(raw,expectedRaw),decodedDeltaPaths:differencePaths(decoded,expectedRaw),
    expectedControlTransition:planningPause?'explicit Present/paid-time commit pauses into planning; independently derived with frozen SDK':'none',
    transform:'actual raw/decoded/rebuilt output is not transformed; every field including controls, persistent knowledge and RNG is compared'};
  await writeFile(path.join(output,`${tag}-state-comparison.json`),JSON.stringify(identity,null,2));
  await writeFile(path.join(output,`${tag}-source-state.json`),JSON.stringify(immutable));
  await writeFile(path.join(output,`${tag}-expected-replay-state.json`),JSON.stringify(expected));
  await writeFile(path.join(output,`${tag}-expected-raw-state.json`),JSON.stringify(expectedRaw));
  await writeFile(path.join(output,`${tag}-raw-save.json`),text);
  await writeFile(path.join(output,`${tag}-decoded-state.json`),JSON.stringify(decoded));
  await writeFile(path.join(output,`${tag}-rebuilt-state.json`),JSON.stringify(actual));
  assert.ok(isDeepStrictEqual(actual,expected),`persisted/source state differs: ${identity.deltaPaths.join(', ')}; ${tag}-state-comparison.json`);
  assert.ok(isDeepStrictEqual(raw,expectedRaw),`raw saved/expected UI state differs: ${identity.rawDeltaPaths.join(', ')}; ${tag}-state-comparison.json`);
  assert.ok(isDeepStrictEqual(decoded,expectedRaw),`decoded saved/expected UI state differs: ${identity.decodedDeltaPaths.join(', ')}; ${tag}-state-comparison.json`);
  return {identity,actual,expected};
}
async function continueFixture(fixture,slot=1) {
  const progressive=config.artwork==='progressive';
  if(progressive)slot='performance-dev';
  const session=await newPage({fixture,slot,artwork:config.artwork,regularUrl:progressive});
  if(progressive){
    await currentPage.getByTestId('game-developer-tools').locator('summary').click();
    await currentPage.getByTestId('game-progressive-artwork').setChecked(true);
    await activate('game-continue-performance');
  }else await activate('game-continue');
  await useful();await present();
  return session;
}
async function persistedEntryOracle(fixture,tag,slot=1,openingKnowledge=false){
  const previous=await currentPage.evaluate(readSave,{database:SAVE_DATABASE_NAME,slot});
  const saveOffset=await currentPage.evaluate(()=>__HC__.saveEvents.length);
  await activate('game-menu-open');
  await wait(({slot,saveOffset,instrumentation})=>document.querySelector('[data-testid=game-save-status]')?.dataset.phase==='saved'
    &&(!instrumentation||__HC__.saveEvents.slice(saveOffset).some(e=>e.kind==='complete'&&e.slots.includes(slot))),
  {slot,saveOffset,instrumentation:config.instrumentation});
  const text=await currentPage.evaluate(readSave,{database:SAVE_DATABASE_NAME,slot});
  assert.ok(text,'new committed payload exists in actual full-map namespace');
  if(previous)assert.notEqual(JSON.parse(text).meta.savedAt,JSON.parse(previous).meta.savedAt,'entry oracle observes a new save transaction, not the installed or initial payload');
  const full=await fullSaveOracle(fixture,text,tag,{planningPause:true,openingKnowledge});
  if(openingKnowledge){
    const actual=await timing(),expected=full.identity.expectedOpeningKnowledge;
    assert.equal(actual.opening.lossSec,expected.lossSec,'actual full opening terminal agrees with frozen SDK');
    // Reopening Menu may prepare the *next* New Game and reset its preparation
    // coverage while the consumed opening phase/loss remain completed/current.
    // Initial full coverage was captured at the useful-entry terminal witness.
    assert.ok(actual.graph.computedSec>=expected.lossSec,'consumed full opening forecast remains available');
  }
  for(const site of full.actual.world.sites)if(site.detailedState)assert.equal(site.detailedState.practiceSlots.length,5,'five Practice slots');
  return full.identity;
}
async function openLife(p,expectedVassal) {
  await click(p);
  return observe((s,id)=>s.mode==='vassalLife'&&s.life.visible&&s.life.displayedVassalId===id&&s,expectedVassal);
}
async function entry() {
  assert.ok(config.artwork!=='progressive','J1 supports separate minimal off / illustrated populations; progressive art is J8');
  const session=await newPage({ordinary:true});
  try{
    await requirePassiveFields(['opening.phase','opening.lossSec','opening.coverageSec']);
    await record('J1','new-game-to-slot-picker',async()=>{
      await activate('game-new');
      await complete(()=>!!document.querySelector('[data-testid=game-slot-1]'));return {slotPicker:true};
    },{input:'game-new'});
    const row=await record('J1','ordinary-new-through-opening',async()=>{
      await activate('game-slot-1');
      return useful({opening:true});
    },{input:'game-slot-1',oracle:async w=>{
      const s=await snapshot();assert.equal(s.runner.baseSeed,config.seed);assert.equal(w.runner.frontierSec,0);
      assert.equal(s.opening.phase,'completed');assert.ok(s.opening.lossSec>0&&w.graph.computedSec>=s.opening.lossSec);
      return {seed:s.runner.baseSeed,fullLossSec:s.opening.lossSec};
    }});
    const navigation={...row,id:`${row.id}:navigation`,step:'navigation-to-useful',started:0,
      observationId:`${runId}:op-${nextObservationId++}`,
      elapsedMs:row.finished,terminalReadinessMs:row.semanticEnd,firstFeedbackMs:null,eventTimeStamp:null,inputQueueMs:null,armToDispatchMs:null,
      timingBoundary:'navigation time origin to same useful frame; includes automated menu-input gaps',
      fixture:`ordinary current New Game seed${config.seed}`,frames:undefined};
    records.push(navigation);await appendFile(path.join(output,'observations.jsonl'),JSON.stringify(navigation)+'\n');
    const presentPoint=await point('getTimeActionClickPoint');
    await record('J1','opening-to-responsive-present',()=>present(presentPoint),{input:'Present',fixture:fixtures.ordinary,oracle:async()=>{
      const s=await snapshot();assert.equal(s.worldMap.regionCount,20);assert.equal(s.worldMap.regionMapIndicators.filter(r=>r.controller==='player').length,2,'ordinary authored start has two player holdings');
      assert.equal(s.runComplete.open,false,'Present closes opening projection details');
      const preview=await previewOracle(fixtures.ordinary,0,s);
      return {preview,persisted:await persistedEntryOracle(fixtures.ordinary,`${launchId.split(':').at(-1)}-entry`,1,true)};
    }});
    await writeFile(path.join(output,`${launchId.split(':').at(-1)}-entry-detail.json`),JSON.stringify({navigationToUsefulMs:await currentPage.evaluate(()=>performance.now()),entryMs:row.elapsedMs,errors:session.errors}));
    assert.deepEqual(session.errors,[]);
  }finally{await closeSession(session);}
}
async function performanceEntry() {
  assert.equal(config.seed,123,'Performance New uses the real fixed seed-123 prepared start');
  assert.ok(config.artwork!=='illustrated','Performance New populations are artwork off / progressive');
  // Entry starts at the ordinary URL and uses the real Developer Tools button.
  const session=await newPage({ordinary:true,regularUrl:true});
  pagePopulation={...pagePopulation,seed:123,entryPath:'performance-prepared-new'};
  try{
    await requirePassiveFields(['opening.phase','opening.lossSec','opening.coverageSec']);
    const originalUrl=currentPage.url();
    await currentPage.evaluate(marker=>{globalThis.__hcDocumentMarker=marker;},runId);
    await currentPage.getByTestId('game-developer-tools').locator('summary').click();
    await currentPage.getByTestId('game-progressive-artwork').setChecked(config.artwork==='progressive');
    await wait(()=>!document.querySelector('[data-testid=game-new-performance]').disabled);
    await record('J2','performance-new',async()=>{
      await activate('game-new-performance');return useful({opening:true});
    },{input:'game-new-performance',fixture:preparedWorkloadId,oracle:async w=>{
      const s=await snapshot();assert.equal(s.runner.baseSeed,123);assert.equal(s.worldMap.illustratedTerrain.bakes,0);
      assert.ok(s.opening.lossSec>0&&w.graph.computedSec>=s.opening.lossSec,'complete prepared opening coverage');
      assert.equal(await currentPage.evaluate(()=>globalThis.__hcDocumentMarker),runId,'one real menu action enters without document reload');
      assert.equal(new URL(currentPage.url()).pathname,new URL(originalUrl).pathname);return {seed:s.runner.baseSeed,fullLossSec:s.opening.lossSec};
    }});
    const presentPoint=await point('getTimeActionClickPoint');
    await record('J2','performance-present',()=>present(presentPoint),{input:'Present',fixture:preparedWorkloadId,
      oracle:()=>persistedEntryOracle(fixtures.ordinary,`${launchId.split(':').at(-1)}-prepared`,'performance-dev',true)});
    assert.deepEqual(session.errors,[]);
  }finally{await closeSession(session);}
}
async function performanceContinue() {
  assert.equal(config.seed,123,'Performance Continue history is derived from the real fixed seed-123 initializer');
  assert.ok(config.artwork!=='illustrated','Performance Continue populations are artwork off / progressive');
  const fixture=fixtures['later-history'];
  const session=await newPage({fixture,slot:'performance-dev',regularUrl:true});
  pagePopulation={...pagePopulation,entryPath:'performance-continue-action-history'};
  try{
    await currentPage.getByTestId('game-developer-tools').locator('summary').click();
    await currentPage.getByTestId('game-progressive-artwork').setChecked(config.artwork==='progressive');
    await record('J2','performance-continue',async()=>{
      await activate('game-continue-performance');return await useful();
    },{input:'game-continue-performance',fixture,oracle:async w=>{
      const s=await snapshot();assert.equal(s.runner.baseSeed,fixture.seed);assert.equal(w.runner.frontierSec,fixture.seconds);assert.equal(w.runner.actionCount,fixture.actions);
      assert.equal(s.worldMap.illustratedTerrain.bakes,0,'performance Continue does not bake terrain on entry');
      return {fixture:fixture.sha256,frontier:w.runner.frontierSec,actions:w.runner.actionCount};
    }});
    const presentPoint=await point('getTimeActionClickPoint');
    await record('J2','performance-continue-present',()=>present(presentPoint),{input:'Present',fixture,
      oracle:()=>persistedEntryOracle(fixture,`${launchId.split(':').at(-1)}-continued`,'performance-dev')});
    assert.deepEqual(session.errors,[]);
  }finally{await closeSession(session);}
}
async function mapAndScrub({mapOnly=false,anchor=true,operation}={}) {
  const interactionFixture=fixtures.selected;
  const terminal=mapOnly?null:expectedOpeningKnowledge(expectedOracle,interactionFixture.expectedState);
  if(terminal)launches.at(-1).j5Schedule={lossSec:terminal.lossSec,source:'independent frozen SDK, outside actual browser and clocks',
    readiness:'naturally completed compute and stable terminal window while reveal still advances; six real pointer moves'};
  const session=await continueFixture(interactionFixture);
  try {
    const start=await timing();
    await writeFile(path.join(output,`${launchId.split(':').at(-1)}-map-before.json`),JSON.stringify(start,null,2));
    const workOracle=before=>async(after,timing)=>assertActiveWork({expectedBefore:before,after,timing});
    if(mapOnly){
      const b=canvasBox,rect=MAP_VIEWPORT_RECT;
      const screen=(x,y)=>({x:b.x+x*b.width/2424,y:b.y+y*b.height/1080});
      // Seed123's centre has population/settlement hit targets. Start on clear
      // east background so the map viewport receives the gesture's first press.
      const from=screen(rect.x+rect.width*.92,rect.y+rect.height*.65),to=screen(rect.x+rect.width*.78,rect.y+rect.height*.65);
      if(operation==='pan'){
      const panBefore=await timing();
      await record('J3','map-pan',async()=>{
        if(config.control==='stale-generation')await currentPage.evaluate(()=>{__HC_STALE_CONTROL__.armed=true;});
        const offered=pendingOfferedEvidence=await dispatchOfferedDrag({page:currentPage,cdp:session.cdp,from,to,input:population.inputType});
        const after=await observe((s,expected)=>s.mode==='map'&&s.map.visible&&!s.map.focusAnimating
          &&(s.map.camera.x!==expected.x||s.map.camera.y!==expected.y)&&s,panBefore.map.camera);
        return {...after,offered};
      },{input:{gesture:'fixed-offered pan',from,to,steps:12,intervalMs:1000/60},captureInputTiming:true,oracle:async(after,timing)=>{
        assert.equal(after.offered.summary.dropped,0,'no requested pointer samples silently disappear');
        assert.equal(after.offered.summary.protocolErrors,0);assert.equal(after.offered.summary.generatorSaturated,false,'offered load generator is not saturated');
        assert.equal(after.offered.summary.cancelled,0);assert.equal(after.offered.summary.missingFrames,0);
        assert.equal(after.offered.summary.invalidTimestamps,0);assert.equal(after.offered.summary.calibrationResolved,true,'offered input clock calibration resolves requested interval');
        return workOracle(panBefore)(after,timing);
      }});
      }
      if(operation==='zoom'){
      const zoomBefore=await timing(),zoomPoint=screen(rect.x+rect.width*.82,rect.y+rect.height*.62);
      if(config.population==='desktop'){
        await record('J3','map-zoom',async()=>{
          await currentPage.mouse.move(zoomPoint.x,zoomPoint.y);await currentPage.mouse.wheel(0,-180);
          return observe((s,old)=>s.mode==='map'&&s.map.camera.zoom>old.zoom&&s,zoomBefore.map.camera);
        },{event:'wheel',input:{wheel:-180,point:zoomPoint},captureInputTiming:true,oracle:workOracle(zoomBefore)});
      }else{
        const startSpan=rect.width*.1*b.width/2424,endSpan=startSpan*1.35;
        await record('J3','map-pinch-zoom',async()=>{
          const offered=pendingOfferedEvidence=await dispatchOfferedPinch({page:currentPage,cdp:session.cdp,center:zoomPoint,startSpan,endSpan});
          const after=await observe((s,old)=>s.mode==='map'&&s.map.visible&&!s.map.focusAnimating&&s.map.camera.zoom>old.zoom&&s,zoomBefore.map.camera);
          return {...after,offered};
        },{input:{gesture:'fixed-offered two-touch pinch',center:zoomPoint,startSpan,endSpan,steps:12,intervalMs:1000/60},captureInputTiming:true,oracle:async(after,timing)=>{
          assert.equal(after.offered.summary.dropped,0,'no offered pinch contact samples silently disappear');
          assert.equal(after.offered.summary.protocolErrors,0);assert.equal(after.offered.summary.cancelled,0);
          assert.equal(after.offered.summary.missingFrames,0);assert.equal(after.offered.summary.invalidTimestamps,0);
          assert.equal(after.offered.summary.generatorSaturated,false);assert.equal(after.offered.summary.calibrationResolved,true);
          return workOracle(zoomBefore)(after,timing);
        }});
      }
      }
      if(operation==='open'||operation==='close'){
      const source=JSON.parse(interactionFixture.text).state;
      // Without an active explicit map selection, the real Settlement dock
      // targets the current Vassal location, whose flag can be offscreen.
      const region=start.regionSelectionActive?start.selectedRegionId:
        source.civilization.vassalLineage.vassalsById[interactionFixture.expected.lineage].locationRegionId;
      const regionPoint=await point('getNavigationClickPoint','settlement'),openBefore=await timing();
      const open=async()=>{
        await click(regionPoint);
        return observe((s,id)=>s.mode==='settlement'&&s.selectedRegionId===id&&!s.map.focusAnimating&&s,region);
      };
      if(operation==='open')await record('J3','settlement-open',open,{input:{navigation:'Settlement',region},captureInputTiming:true,oracle:workOracle(openBefore)});
      else{
      await open();
      // The mode variable changes before its dock is rendered. Calibrate the
      // first actual available Map control in one RPC, retaining the canvas
      // measured earlier in this unchanged document; avoid waiting away work.
      const handle=await currentPage.waitForFunction(()=>{
        if(__HC__.active)throw new Error('close calibration must precede timing');
        const before=__SETTLEMENT_DEBUG__.getTimingSnapshot();
        const point=__SETTLEMENT_DEBUG__.getNavigationClickPoint('map');
        return point&&{point,before,after:__SETTLEMENT_DEBUG__.getTimingSnapshot()};
      },null,{polling:'raf',timeout:config.timeoutMs});
      const calibrated=await handle.jsonValue();await handle.dispose();
      assert.ok(isDeepStrictEqual(calibrated.before,calibrated.after),'close geometry calibration preserves passive primitives');
      calibrations.push({launchId,method:'ready Map navigation point; one RPC, retained canvas',...calibrated,canvasBox});
      const closePoint=calibrated.point,closeBefore=openBefore;
      await record('J3','settlement-close',async()=>{
        await click(closePoint);return observe(s=>s.mode==='map'&&s.map.visible&&!s.map.focusAnimating&&s);
      },{input:'Map navigation',captureInputTiming:true,oracle:workOracle(closeBefore)});
      }
      }
    }else{
      // Separate browser launches keep the untimed oracle for one scrub from
      // warming the other target. No full snapshot/restore probe precedes it.
      const sec=anchor?16:17;
      const anchorQuery={anchorSec:sec,includeProjectionSource:true};
      await requirePassiveFields(['graph.requestedAnchorSec','graph.hasRetainedAnchor','graph.retainedAnchorSource',
        'graph.projection.signatureMatches','graph.projection.timelineToken','graph.projection.hasRetainedAnchor'],anchorQuery);
      await observe((s,sec)=>s.graph.revealedSec>=sec&&s.graph.targetSec>s.graph.revealedSec
        &&s.graph.computedSec>=sec&&s.graph.minSec<=sec&&s.graph.maxSec>sec&&s,sec,{terminal:false});
      let before=await timing(anchorQuery),g=before.graph;
      const controlSecond=config.control==='wrong-target'?sec+1:config.control==='clamp-bypass'?terminal.lossSec:sec;
      assert.equal(g.requestedAnchorSec,sec);assert.equal(g.projection.requestedAnchorSec,sec);
      assert.equal(g.projection.signatureMatches,true,'anchor store belongs to the actual current timeline signature');
      assert.equal(g.projection.timelineToken,g.asyncToken,'observed forecast request belongs to the current projection generation');
      assert.equal(typeof g.hasRetainedAnchor,'boolean');assert.equal(typeof g.projection.hasRetainedAnchor,'boolean');
      assert.equal(g.hasRetainedAnchor||g.projection.hasRetainedAnchor,anchor,'exact membership in actual graph/projection stores, not inferred from stride');
      // The live graph window can expand between host calibration and delivery.
      // Use a fixed six-move real drag with passive retained geometry refreshes;
      // every move stays inside this transaction, including correction cost.
      calibrations.push({launchId,method:'passive graph.plotRect + previously measured canvas box',canvasBox,
        policy:'retained stage transform only; no graph point/bounds/restore getter before scrub'});
      await record('J5',anchor?'scrub-anchor':'scrub-off-anchor',async()=>{
        await currentPage.evaluate(installScrubInputObservation);
        // Wait for natural supply completion, not an artificial worker pause.
        // J5 requires active reveal, whereas J3 separately requires computation.
        before=await observe((s,loss)=>s.graph.computedSec>=loss&&s.graph.maxSec===loss
          &&s.graph.targetSec>s.graph.revealedSec&&s,terminal.lossSec,{terminal:false,query:anchorQuery});
        g=before.graph;
        assert.equal(g.hasRetainedAnchor||g.projection.hasRetainedAnchor,anchor,'target still has declared retention at scrub input');
        const r=g.plotRect,b=canvasBox;
        let p={x:b.x+(r.x+r.width*((config.control==='clamp-bypass'?controlSecond-.1:controlSecond)-g.minSec)/(g.maxSec-g.minSec))*b.width/2424,
          y:b.y+(r.y+r.height*.5)*b.height/1080};
        const touch=(type,p)=>session.cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{id:1,x:p.x,y:p.y,radiusX:1,radiusY:1}]});
        if(config.population==='desktop'){await currentPage.mouse.move(p.x,p.y);await currentPage.mouse.down();}
        else await touch('touchStart',p);
        const moves=[];
        for(let i=0;i<(config.control==='clamp-bypass'?0:6);i++){
          const live=await timing(),r=live.graph.plotRect,b=canvasBox;
          const requested=config.control==='clamp-bypass'?live.graph.maxSec:controlSecond;
          const x=r.x+r.width*(requested-live.graph.minSec)/(live.graph.maxSec-live.graph.minSec);
          p={x:b.x+x*b.width/2424,y:b.y+(r.y+r.height*.5)*b.height/1080};
          moves.push({index:i,minSec:live.graph.minSec,maxSec:live.graph.maxSec,point:p});
          if(config.population==='desktop')await currentPage.mouse.move(p.x,p.y);
          else await touch('touchMove',p);
        }
        if(config.population==='desktop')await currentPage.mouse.up();else await touch('touchEnd',p);
        const after=await observe(scrubComplete,
        {second:config.control==='clamp-bypass'?controlSecond:sec,frontier:before.runner.frontierSec,revealed:g.revealedSec,target:g.targetSec,token:config.control==='stale-generation'?'deliberately-stale-generation':g.asyncToken,
          subject:g.subjectKey,revision:before.runner.revision,actions:before.runner.actionCount},{query:anchorQuery,timeout:config.control?1500:config.timeoutMs});
        const input=await currentPage.evaluate(()=>{__HC_SCRUB_INPUT__.stop();return __HC_SCRUB_INPUT__.events;});
        return {...after,scrubMoves:moves,scrubInput:input,inputReadiness:before};
      },{captureInputTiming:true,input:{sec,anchor,calibrationCap:g.browseCapSec,graphRetained:g.hasRetainedAnchor,projectionRetained:g.projection.hasRetainedAnchor},fixture:interactionFixture,oracle:async(_w,timing)=>{
        assert.ok(timing.inputTimingSnapshot.graph.targetSec>timing.inputTimingSnapshot.graph.revealedSec,'J5 reveal is active at actual trusted input');
        const after=await snapshot();assert.equal(after.frontierSec,before.runner.frontierSec,'read-only scrub preserves authoritative frontier');
        return previewOracle(interactionFixture,sec,after);
      }});
    }
    assert.deepEqual(session.errors,[]);
  }finally{await closeSession(session);}
}
async function life() {
  const session=await continueFixture(fixtures.selected);
  try {
    const data=JSON.parse(fixtures.selected.text).state;
    const vassal=data.civilization.vassalLineage.vassalsById[fixtures.selected.expected.lineage];
    const node=vassal.lifeMap.availableNodeIds[0],before=await timing();
    let lifePoint=await point('getNavigationClickPoint','life');lifePoint??=await point('getNavigationClickPoint','vassal');
    await record('J4','life-map-open',()=>openLife(lifePoint,vassal.vassalId),{fixture:fixtures.selected,input:'Life Map'});
    const nodePoint=await point('getLifeMapNodeClickPoint',node);
    await record('J4','node-select',async()=>{
      await click(nodePoint);
      return observe((s,expected)=>s.mode==='vassalLife'&&s.life.displayedVassalId===expected.vassal
        &&s.life.selectedCandidateNodeId===expected.node&&!s.life.decisionOpen
        &&s.runner.actionCount===expected.actionCount&&s,
      {node,vassal:vassal.vassalId,actionCount:before.runner.actionCount});
    },{input:{node}});
    const enterPoint=await point('getLifeMapEnterNodeClickPoint');
    await record('J4','entry-dialog-open',async()=>{
      await click(enterPoint);
      return observe((s,node)=>s.life.selectedCandidateNodeId===node&&s.life.entryConfirmationOpen
        &&s.life.entryOpen&&s.life.entryVisible&&s.life.entryPhase==='open'&&s,node);
    },{input:{enterNode:node}});
    const confirmEntryPoint=await point('getLifeMapEnterNodeClickPoint');
    await record('J4','node-entry-confirm',async()=>{
      await click(confirmEntryPoint);
      return observe((s,expected)=>s.life.displayedVassalId===expected.vassal&&s.life.decisionNodeId===expected.node
        &&s.life.decisionOpen&&s.life.decisionPhase==='open'&&s.life.processing.sourceMatches===true
        &&!s.life.processing.jobActive&&s.runner.actionCount===expected.actionCount&&s,
      {node,vassal:vassal.vassalId,actionCount:before.runner.actionCount+1});
    },{input:{confirmEntry:node}});
    await requirePassiveFields(['life.shopTag','life.offerIds','life.purchaseOrder','life.boardPracticeIds']);
    // This explicit untimed snapshot calibrates the already-rendered category
    // controls. It never supplies a timed readiness predicate or scrub target.
    const d=(await snapshot()).lifeMapDecision;
    const randomIndex=d.shopTagChoices.findIndex(x=>x.id==='random');assert.ok(randomIndex>=0);
    calibrations.push({launchId,method:'getSnapshot.lifeMapDecision.shopTagConfirmPoints',purpose:'untimed visible category geometry',intrusive:true});
    const expectedShop=JSON.parse(fixtures.shop.text).state;
    const expectedVassal=expectedShop.civilization.vassalLineage.vassalsById[vassal.vassalId];
    const expectedOffers=expectedVassal.lifeMap.nodeStates[node].inventory.map(o=>o.offerId);
    const categoryBefore=await timing();
    await record('J4','shop-category-selection',async()=>{
      await click(d.shopTagConfirmPoints[randomIndex]);
      return observe((s,expected)=>s.life.decisionOpen&&s.life.decisionNodeId===expected.node
        &&s.life.observedDecisionNodeId===expected.node&&s.life.decisionPhase==='open'&&s.life.resolving===false
        &&s.life.shopTag==='random'&&JSON.stringify(s.life.offerIds)===JSON.stringify(expected.offers)
        &&s.life.processing.sourceMatches===true&&s.life.processing.draftActionCount===expected.drafts
        &&s.life.processing.draftActive===true&&s.life.processing.jobActive===false
        // Match the real modal guard. This property is not maintained by current
        // code, so null does not claim an empty queue; >0 alone blocks rendering.
        &&!(s.life.pendingInteractionCount>0)&&s,
      {node,offers:expectedOffers,drafts:categoryBefore.life.processing.draftActionCount+1});
    },{input:{node,shopTag:'random',expectedOffers,expectedDrafts:categoryBefore.life.processing.draftActionCount+1}});
    const expectedHistory=JSON.parse(fixtures.history.text).state;
    const site=expectedShop.world.sites.find(s=>s.regionId===vassal.locationRegionId);
    assert.ok(site.detailedState.practiceSlots.some(p=>!p),'fixed first purchase has a legal free slot, no speculative replacement action');
    const expectedBoard=expectedHistory.world.sites.find(s=>s.regionId===vassal.locationRegionId).detailedState.practiceSlots.map(p=>p?.practiceId??null);
    const offerIndex=0,offerId=expectedOffers[0],offerPoint=await point('getLifeMapOfferClickPoint',offerIndex),purchaseBefore=await timing();
    await record('J6','purchase-to-staged-preview',async()=>{
      await click(offerPoint);
      return observe((s,expected)=>s.life.decisionOpen&&s.life.decisionNodeId===expected.node
        &&s.life.observedDecisionNodeId===expected.node&&s.life.decisionPhase==='open'&&s.life.resolving===false
        &&s.life.purchaseOrder.length===1&&s.life.purchaseOrder[0]===expected.offerId
        &&JSON.stringify(s.life.boardPracticeIds)===JSON.stringify(expected.board)
        &&!(s.life.pendingInteractionCount>0)&&s.life.processing.sourceMatches===true
        &&s.life.processing.draftActive===true&&s.life.processing.jobActive===false
        &&s.life.processing.draftActionCount===expected.drafts&&s,
      {node,offerId,board:expectedBoard,drafts:purchaseBefore.life.processing.draftActionCount+1});
    },{input:{node,offerIndex,offerId}});
    const beforeConfirm=await timing(),confirmPoint=await point('getLifeMapConfirmClickPoint');
    await record('J6','confirm-to-recomputed-preview',async()=>{
      await click(confirmPoint);
      return observe((s,expected)=>s.life.recapOpen&&s.life.processing.sourceMatches===true&&!s.life.processing.jobActive
        &&s.runner.frontierSec===expected.second&&s.runner.actionCount===expected.actions
        &&s.graph.historyEndSec===expected.second&&s.graph.computedSec>=expected.second
        &&s.graph.cacheVersion!==expected.oldCacheVersion&&s,
      {second:fixtures.history.seconds,actions:beforeConfirm.runner.actionCount+3,oldCacheVersion:beforeConfirm.graph.cacheVersion});
    },{input:'Confirm purchased node',fixture:fixtures.selected,oracle:async()=>{
      const s=await snapshot();
      assert.equal(s.runner.timeline.actionCount,beforeConfirm.runner.actionCount+3,'category, purchase and confirmation each record exactly once as the committed batch');
      assert.equal(s.frontierSec,fixtures.history.seconds,'ordinary paid time matches independent public-action fixture');
      return previewOracle(fixtures.history,s.viewedSec,s);
    }});
    await observe(s=>s.life.recapClock?.locked===true,null,{terminal:false});
    const dismissPoint=await point('getLifeMapRecapDismissClickPoint');
    await record('J4','recap-return',async()=>{
      await click(dismissPoint);return observe((s,second)=>!s.life.recapOpen&&!s.life.processing.jobActive
        &&s.life.processing.sourceMatches===true&&s.runner.frontierSec===second&&s,fixtures.history.seconds);
    },{input:'recap Continue'});
    const mapPoint=await point('getNavigationClickPoint','map');
    await record('J4','return-to-map',async()=>{
      await click(mapPoint);
      return observe((s,second)=>s.mode==='map'&&s.map.visible&&!s.life.processing.jobActive
        &&s.runner.frontierSec===second&&s,fixtures.history.seconds);
    },{input:'Map navigation',fixture:fixtures.selected,oracle:async()=>{
      await activate('game-menu-open');
      await wait(()=>document.querySelector('[data-testid=game-save-status]')?.dataset.phase==='saved');
      const saved=await currentPage.evaluate(readSave,{database:SAVE_DATABASE_NAME,slot:config.artwork==='progressive'?'performance-dev':1});
      return (await fullSaveOracle(fixtures.history,saved,`${launchId.split(':').at(-1)}-life`,{planningPause:true})).identity;
    }});
    assert.deepEqual(session.errors,[]);
  }finally{await closeSession(session);}
}
async function saveLoad(fixtureName='later-history') {
  assert.ok(config.artwork!=='progressive','J7 ordinary-slot load supports minimal off / illustrated; performance progressive Continue is J2');
  const fixture=fixtures[fixtureName],session=await newPage({fixture,artwork:config.artwork});
  try{
    await record('J7',fixtureName==='ordinary'?'opening-load':'nontrivial-load',async()=>{await activate('game-continue');return await useful();},{input:'Continue',fixture,oracle:async w=>{
      const s=await snapshot();assert.equal(s.runner.baseSeed,fixture.seed);assert.equal(w.runner.frontierSec,fixture.seconds);assert.equal(w.runner.actionCount,fixture.actions);
      return previewOracle(fixture,s.viewedSec,s);
    }});
    await present();
    if(config.control==='deferred-save')await currentPage.evaluate(installSaveCompletionControl);
    await record('J7','save-to-persisted',async()=>{
      await activate('game-menu-open');await currentPage.getByTestId('game-menu').waitFor({state:'visible'});
      // Menu save is asynchronous. Reading a transaction after the click does
      // not itself establish completion; require the new payload's identity.
      await complete(()=>__HC__.active.savePhaseTransitionObserved&&document.querySelector('[data-testid=game-save-status]')?.dataset.phase==='saved');
      return {slot:1,persisted:true};
    },{input:'Menu (save)',fixture,oracle:async(_w,timing)=>{
      if(config.instrumentation)assert.ok(timing.saveEvents.some(e=>e.kind==='complete'&&e.slots.includes(1)),'displayed save acknowledgement follows actual slot transaction completion');
      let text=await currentPage.evaluate(readSave,{database:SAVE_DATABASE_NAME,slot:1});
      assert.ok(text);const checked=inspectSaveText(text);assert.equal(checked.ok,true);
      assert.notEqual(JSON.parse(text).meta.savedAt,fixture.meta.savedAt,'new transaction replaces fixture saved timestamp');
      const actual=serializeGameState(checked.state);assert.equal(actual.rng.baseSeed,fixture.seed);
      assert.equal(Math.floor(actual.tSec),fixture.seconds);
      if(config.control==='wrong-save'){
        const wrong=fixtureName==='ordinary'?fixtures['later-history']:fixtures.ordinary;
        await currentPage.evaluate(installSave,{database:SAVE_DATABASE_NAME,slot:1,text:wrong.text,meta:wrong.meta});
        text=await currentPage.evaluate(readSave,{database:SAVE_DATABASE_NAME,slot:1});
      }
      if(config.control==='deferred-save'){
        const control=await currentPage.evaluate(()=>__HC_SAVE_CONTROL__);
        await writeFile(path.join(output,`${launchId.split(':').at(-1)}-deferred-save.json`),JSON.stringify({control,timing:{started:timing.started,semanticEnd:timing.semanticEnd,finished:timing.finished}},null,2));
        const delivery=control.events.find(e=>e.nativeCompleteAt>=timing.started&&e.deliveredAt<=timing.finished);
        assert.ok(delivery,'terminal includes actual deferred transaction acknowledgement');
        assert.ok(delivery.deliveredAt-delivery.nativeCompleteAt>=190,'known200ms acknowledgement delay is observed');
        assert.ok(timing.semanticEnd>=delivery.deliveredAt,'early native commit cannot terminate the deferred app path');
      }
      const full=await fullSaveOracle(fixture,text,`${launchId.split(':').at(-1)}-save`,{planningPause:true});
      // Fail closed on every source/persisted difference. Any legitimate new
      // survival knowledge needs an independently derived exact expectation
      // before acceptance; never merge the actual output into its own oracle.
      const a=deserializeGameState(actual),b=expectedOracle.deserializeGameState(full.expected);
      for(let i=0;i<3;i++){
        assert.equal(advanceReplayStateOneSecond(a).ok,true);assert.equal(expectedOracle.advanceReplayStateOneSecond(b).ok,true);
        assert.deepEqual(serializeGameState(a),expectedOracle.serializeGameState(b),'persisted/frozen expected official-second continuation including all RNG streams');
      }
      return {characters:text.length,sha256:digest(text),stateSha256:digest(actual),seconds:actual.tSec,allFields:true,continuationSeconds:3};
    }});
    assert.deepEqual(session.errors,[]);
  }finally{await closeSession(session);}
}
async function artwork() {
  const session=await newPage({ordinary:true,regularUrl:true,artwork:'progressive'});
  pagePopulation={...pagePopulation,seed:123,entryPath:'performance-progressive-art'};
  pageInputFixture=preparedWorkloadId;
  try {
    assert.equal(config.seed,123,'prepared progressive artwork uses its actual fixed seed');
    await requirePassiveFields(['opening.phase','opening.lossSec','opening.coverageSec','map.artReady','map.artPrepared','life.decisionArtReady','life.decisionArtPrepared']);
    const preEntryPresentPoint=await point('getTimeActionClickPoint');
    assert.ok(preEntryPresentPoint,'compound artwork job requires a pre-entry retained Present geometry; missing geometry blocks coverage');
    const memoryBefore=await session.cdp.send('Runtime.getHeapUsage');
    await currentPage.getByTestId('game-developer-tools').locator('summary').click();
    await currentPage.getByTestId('game-progressive-artwork').setChecked(true);
    await wait(()=>!document.querySelector('[data-testid=game-new-performance]').disabled);
    await record('J8','progressive-entry-to-art-ready',async()=>{
      await activate('game-new-performance');await useful({opening:true});await present(preEntryPresentPoint);
      return observe(s=>document.querySelector('[data-testid=debug-open]')?.dataset.artworkReady==='true'
        &&s.map.artPrepared===true&&s.life.decisionArtPrepared===true
        &&s.map.artReady===false&&s.life.decisionArtReady===false&&s);
    },{input:'Performance New with progressive art',oracle:async()=>{
      const s=await snapshot();assert.equal(s.worldMap.illustratedTerrain.ready,false,'prepared terrain stays unpublished until explicit reveal');
      assert.equal(s.lifeMapDecision.decisionMapTerrain.ready,false,'decision terrain stays unpublished until explicit reveal');
      return {unrevealed:true};
    }});
    const before=(await snapshot()).worldMap.illustratedTerrain;
    await record('J8','explicit-art-reveal',async()=>{
      await activate('debug-open');
      return observe(s=>document.querySelector('[data-testid=debug-open]')?.dataset.artworkReady==='false'
        &&s.map.artReady===true&&s.life.decisionArtReady===true&&s);
    },{input:'Artwork ready seal',oracle:async()=>{
      const s=await snapshot();assert.equal(s.worldMap.illustratedTerrain.ready,true,'explicit reveal publishes completed terrain');
      assert.equal(s.lifeMapDecision.decisionMapTerrain.ready,true);return {explicitlyRevealed:true,before};
    }});
    const memoryAfterReveal=await session.cdp.send('Runtime.getHeapUsage');
    // Retain before/after navigation heaps separately from intentional atlas
    // growth. No forced GC or total GPU/process-memory claim is made.
    const memoryNavigation=[];
    const region=JSON.parse(fixtures.ordinary.text).state.civilization.capitalRegionId;
    assert.ok(region);
    for(let i=0;i<5;i++){
      await click(await point('getWorldMapClickPoint',region),{double:true});
      await observe(s=>s.mode==='settlement',null,{terminal:false});
      await click(await point('getNavigationClickPoint','map'));
      await observe(s=>s.mode==='map',null,{terminal:false});
      memoryNavigation.push(await session.cdp.send('Runtime.getHeapUsage'));
    }
    await writeFile(path.join(output,`${launchId.split(':').at(-1)}-art-memory.json`),JSON.stringify({memoryBefore,memoryAfterReveal,memoryNavigation,scope:'CDP JS heap only; excludes native process and GPU allocation; no forced GC'}));
    assert.deepEqual(session.errors,[]);
  }finally{await closeSession(session);}
}
const jobs={entry,performance:performanceEntry,'performance-continue':performanceContinue,
  'map-pan':()=>mapAndScrub({mapOnly:true,operation:'pan'}),'map-zoom':()=>mapAndScrub({mapOnly:true,operation:'zoom'}),
  'map-open':()=>mapAndScrub({mapOnly:true,operation:'open'}),'map-close':()=>mapAndScrub({mapOnly:true,operation:'close'}),
  'scrub-anchor':()=>mapAndScrub({anchor:true}),'scrub-off-anchor':()=>mapAndScrub({anchor:false}),life,save:saveLoad,'save-opening':()=>saveLoad('ordinary'),art:artwork};
if(config.jobs.includes('scrub'))config.jobs=[...config.jobs.filter(j=>j!=='scrub'),'scrub-anchor','scrub-off-anchor'];
if(config.jobs.includes('map'))config.jobs=[...config.jobs.filter(j=>j!=='map'),'map-pan','map-zoom','map-open','map-close'];
if(config.jobs.includes('performance')&&!config.jobs.includes('performance-continue'))config.jobs.push('performance-continue');
if(config.jobs.includes('save')&&!config.jobs.includes('save-opening'))config.jobs.push('save-opening');
assert.ok(config.jobs.every(job=>job==='all'||Object.hasOwn(jobs,job)),'unknown job selection');
try {
  for(let sample=0;sample<config.samples;sample++) {
    for(const [name,job]of Object.entries(jobs))if(config.jobs.includes('all')||config.jobs.includes(name)){
      await launch(sample,name);
      try{await job();}catch(error){
        const passive=await withDeadline(currentPage.evaluate(()=>__SETTLEMENT_DEBUG__.getTimingSnapshot({includeProjectionSource:true})),5000,'job/setup failure passive diagnostic').catch(()=>null);
        await writeFile(path.join(output,`${name}-job-failure.json`),JSON.stringify({error:error.message,passive},null,2));
        await withDeadline(currentPage.screenshot({path:path.join(output,`${name}-job-failure.png`)}),5000,'job/setup failure screenshot').catch(()=>{});
        throw error;
      }finally{await activeBrowser.close();activeBrowser=null;}
    }
  }
}catch(error){failed=true;
  await currentPage?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});
  await writeFile(path.join(output,'failure.txt'),error.stack);
  console.error(`[hillclimb] FAIL ${records.at(-1)?.job??'setup'}/${records.at(-1)?.step??'setup'}: ${error.message.split('\n')[0]}; ${output}`);
}finally{
  await activeBrowser?.close();server?.kill();
  if(!failed&&records.length===0){failed=true;console.error('[hillclimb] no observations is not an executed suite');}
  manifest.finished=new Date().toISOString();manifest.failed=failed;
  manifest.launches=launches;
  manifest.calibrations=calibrations;
  await writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2));
  const summary=summarize(records).map(group=>({...group,workloadMode,fixtureManifestId,comparisonEligible,
    eligibleForTailInference:comparisonEligible&&group.eligibleForTailInference,
    ...(frozen?{}:{inference:'CONSTRUCTION ONLY; generated expected results/workloads cannot support a baseline or candidate score'})}));
  await writeFile(path.join(output,'summary.json'),JSON.stringify(summary,null,2));
}
console.log(`[hillclimb] ${failed?'FAILED':'completed'} observations=${records.length} path=${output}`);
process.exitCode=failed?1:0;
