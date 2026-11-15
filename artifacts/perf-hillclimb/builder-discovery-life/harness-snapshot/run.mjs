import assert from 'node:assert/strict';
import {mkdir,writeFile,appendFile,readFile,readdir} from 'node:fs/promises';
import {spawn,execFileSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';
import {BROWSER_PROBE_LAUNCH_OPTIONS} from '../browser-probe-config.mjs';
import {SAVE_DATABASE_NAME} from '../../src/controllers/sim-runner/save-storage.js';
import {inspectSaveText} from '../../src/controllers/sim-runner/save-slots.js';
import {serializeGameState} from '../../src/model/state.js';
import {rebuildStateAtSecond} from '../../src/model/timeline/index.js';
import {getDetailedCivilizationSummary,getDetailedSettlementViewModel} from '../../src/model/detailed-settlements.js';
import {createFixtures,digest} from './fixtures.mjs';
import {installRuntime,installSave,readSave} from './browser-runtime.mjs';
import {summarize} from './statistics.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(a=>{const [k,...v]=a.replace(/^--/,'').split('=');return[k,v.join('=')||true];}));
const config={jobs:String(args.jobs??'all').split(','),samples:Number(args.samples??1),
  population:String(args.population??'desktop'),cache:String(args.cache??'cold'),
  artwork:String(args.artwork??'off'),instrumentation:args.instrumentation!=='off',
  workerDelayMs:Number(args['worker-delay']??0),timeoutMs:Number(args.timeout??180000),
  port:Number(args.port??18244),dist:String(args.dist??'dist'),seed:Number(args.seed??123)};
assert.ok(['desktop','mobile','mobile4'].includes(config.population));
assert.ok(['cold','warm'].includes(config.cache));
assert.ok(['off','progressive','illustrated'].includes(config.artwork));
assert.ok(Number.isInteger(config.samples)&&config.samples>=1,'positive independent suite count');
assert.ok([123,424242,99117].includes(config.seed),'fixed representative seed corpus');
const runId=String(args.id??new Date().toISOString().replace(/[:.]/g,'-'));
const output=path.resolve(String(args.output??`artifacts/perf-hillclimb/${runId}`));
await mkdir(output,{recursive:true});
const fixtures=createFixtures(config.seed);
await writeFile(path.join(output,'fixtures.json'),JSON.stringify(Object.fromEntries(Object.entries(fixtures).map(([k,{text,...f}])=>[k,f])),null,2));
const manifest={runId,started:new Date().toISOString(),config,productHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  branch:execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim(),
  dirty:execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim().split('\n').filter(Boolean),
  machine:{host:os.hostname(),platform:os.platform(),release:os.release(),arch:os.arch(),cpus:os.cpus(),totalMemory:os.totalmem()},
  runtime:{node:process.version,playwright:JSON.parse(await readFile('node_modules/playwright/package.json','utf8')).version},
  launch:BROWSER_PROBE_LAUNCH_OPTIONS,proxy:'desktop OS/CPU/GPU; no physical Pixel 6 evidence',
  timings:'Browser performance.now input capture through semantic completion plus double-rAF frame opportunity; not physical scanout',
  loadModel:'closed-loop transaction latency; no claim of open-loop input saturation coverage',
  externalLoad:process.env.HC_LOAD_NOTES??'operator load not instrumented; no known competing task-owned workload'};
for(const f of ['build-info.json','build-manifest.json'])try{manifest[f]=JSON.parse(await readFile(path.join(config.dist,f),'utf8'));}catch{}
assert.ok(manifest['build-manifest.json'],'exact built asset manifest is required');
manifest.buildId=digest(manifest['build-manifest.json']);
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
const records=[];let currentPage;let activeBrowser;let failed=false;let launchId;let pagePopulation;
const population={layout:config.population,cpuRate:config.population==='mobile4'?4:1,cache:config.cache,artwork:config.artwork,
  instrumentation:config.instrumentation,workerDelayMs:config.workerDelayMs,seed:config.seed};
let nextObservationId=1;

async function record(job,step,body,{input,fixture=null,event='pointerdown',startNow=false,oracle}={}) {
  const page=currentPage;
  const header={runId,buildId:manifest.buildId,observationId:`${runId}:op-${nextObservationId++}`,launchId,job,step,
    harnessId:manifest.harnessId,measurementContractId:manifest.measurementContractId,
    population:pagePopulation??population,fixture:fixture?.sha256??fixture??`ordinary:seed=${config.seed}`,input};
  await page.evaluate(({step,event,timeoutMs,startNow})=>__HC__.arm({name:step,event,timeoutMs,startNow}),{step,event,timeoutMs:config.timeoutMs,startNow});
  let completedTiming;
  try {
    const witness=await body();
    const timing=completedTiming=await page.evaluate(w=>__HC__.finish(w),witness??null);
    assert.ok(timing.elapsedMs>=0,'finite nonnegative browser elapsed');
    assert.ok(startNow||timing.trustedInput,'real trusted input required');
    const oracleResult=oracle?await oracle(witness,timing):null;
    const row={...header,ok:true,...timing,untimedOracle:oracleResult};records.push(row);
    await appendFile(path.join(output,'observations.jsonl'),JSON.stringify(row)+'\n');
    return row;
  }catch(error){
    const timing=completedTiming??await page.evaluate(e=>__HC__.cancel(e),error.message).catch(()=>null);
    const row={...header,ok:false,...timing,error:error.stack,timeout:/timeout/i.test(error.message)};
    records.push(row);await appendFile(path.join(output,'observations.jsonl'),JSON.stringify(row)+'\n');
    await page.screenshot({path:path.join(output,`failure-${job}-${step}.png`)}).catch(()=>{});
    throw error;
  }
}
async function wait(fn,arg,timeout=config.timeoutMs) {
  const handle=await currentPage.waitForFunction(({source,arg})=>__HC__.probe(()=>Function('arg',`return (${source})(arg)`)(arg)),
    {source:fn.toString(),arg},{polling:'raf',timeout});
  const result=await handle.jsonValue();await handle.dispose();return result;
}
async function snapshot(){return currentPage.evaluate(()=>{const {gameConfig,...s}=__SETTLEMENT_DEBUG__.getSnapshot();return s;});}
async function point(method,arg){return currentPage.evaluate(({method,arg})=>__SETTLEMENT_DEBUG__[method](arg),{method,arg});}
async function click(p,{double=false}={}) {
  assert.ok(p,'real control exists');const b=await currentPage.locator('canvas').boundingBox();assert.ok(b,'game canvas exists');
  const x=b.x+p.x*b.width/2424,y=b.y+p.y*b.height/1080;
  if(double)await currentPage.mouse.dblclick(x,y,{delay:80});else await currentPage.mouse.click(x,y);
}
async function launch(sample,job) {
  launchId=`${runId}:launch-${sample}-${job}`;
  activeBrowser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
  manifest.runtime.chromium=activeBrowser.version();
  if(!manifest.gpu)try{const c=await activeBrowser.newBrowserCDPSession();manifest.gpu=(await c.send('SystemInfo.getInfo')).gpu;}catch{}
}
async function newPage({fixture,slot=1,artwork=config.artwork,ordinary=false,regularUrl=false}={}) {
  const context=await activeBrowser.newContext({viewport:config.population==='desktop'?{width:1280,height:800}:{width:844,height:390},
    hasTouch:config.population!=='desktop',isMobile:config.population!=='desktop',deviceScaleFactor:1});
  const page=await context.newPage();currentPage=page;page.setDefaultTimeout(config.timeoutMs);
  pagePopulation={...population,artwork,entryPath:ordinary?'ordinary':'continue-fixture'};
  const errors=[];page.on('pageerror',e=>errors.push({message:e.message,time:Date.now()}));
  await page.addInitScript(installRuntime,{instrumentation:config.instrumentation,workerDelayMs:config.workerDelayMs});
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
  if(config.cache==='warm') {
    await page.waitForFunction(()=>!document.querySelector('[data-testid=game-new]').disabled);
    if(fixture){
      if(slot==='performance-dev'){
        await page.getByTestId('game-developer-tools').locator('summary').click();
        await page.getByTestId('game-continue-performance').click();
      }else await page.getByTestId('game-continue').click();
      await useful();
    }
    else if(regularUrl){
      await page.getByTestId('game-developer-tools').locator('summary').click();
      await page.getByTestId('game-progressive-artwork').setChecked(artwork==='progressive');
      await page.getByTestId('game-new-performance').click();await useful({opening:true});
    }else{await page.getByTestId('game-new').click();await page.getByTestId('game-slot-1').click();await useful({opening:true});}
    await page.goto(url+'__harness_fixture_setup__');
    await page.evaluate(async database=>{
      const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(database,1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
      try{await new Promise((resolve,reject)=>{const tx=db.transaction(['saves','slots'],'readwrite');tx.objectStore('saves').clear();tx.objectStore('slots').clear();tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});}finally{db.close();}
    },SAVE_DATABASE_NAME);
    if(fixture)await page.evaluate(installSave,{database:SAVE_DATABASE_NAME,slot,text:fixture.text,meta:fixture.meta});
    await page.goto(target);await page.getByTestId('game-new').waitFor();
  }
  return {page,context,cdp,errors};
}
async function useful({opening=false}={}) {
  await currentPage.getByTestId('game-menu').waitFor({state:'hidden'});
  if(opening)await wait(()=>__SETTLEMENT_DEBUG__.getSnapshot().opening?.phase==='completed');
  const s=await snapshot();assert.ok(s.view&&s.worldMap,'game views constructed');
  return {frontierSec:s.frontierSec,viewedSec:s.viewedSec,baseSeed:s.runner.baseSeed,opening:s.opening,
    forecast:s.forecastStatus,computed:s.controller?.computedCoverageEndSec,projection:s.projection,
    terrain:s.worldMap.illustratedTerrain,actions:s.runner.timeline.actionCount};
}
async function present() {
  const p=await point('getTimeActionClickPoint');if(p)await click(p);
  await wait(()=>{const s=__SETTLEMENT_DEBUG__.getSnapshot();return s.viewedSec===s.frontierSec&&!s.runComplete.open;});
}
function previewOracle(fixture,second,observed) {
  const saved=inspectSaveText(fixture.text);assert.equal(saved.ok,true);
  const replay=rebuildStateAtSecond(saved.nextTimeline,second);assert.equal(replay.ok,true);
  const json=x=>JSON.parse(JSON.stringify(x));
  assert.deepEqual(json(observed.worldMap.civilizationSummary),json(getDetailedCivilizationSummary(replay.state)),
    'visible civilization equals independent authoritative replay');
  if(observed.worldMap.selectedRegionId)assert.deepEqual(json(observed.worldMap.selectedRegion?.detailedSettlement),
    json(getDetailedSettlementViewModel(replay.state,observed.worldMap.selectedRegionId)),
    'visible selected settlement equals independent authoritative replay');
  return {second,replayedStateSha256:digest(serializeGameState(replay.state)),civilizationSummary:true,selectedSettlement:true};
}
async function continueFixture(fixture,slot=1) {
  const session=await newPage({fixture,slot,artwork:'off'});
  await currentPage.getByTestId('game-continue').click();await useful();await present();
  return session;
}
async function openLife() {
  let p=await point('getNavigationClickPoint','life');if(!p)p=await point('getNavigationClickPoint','vassal');
  await click(p);await wait(()=>__SETTLEMENT_DEBUG__.getSnapshot().worldMap.mode==='vassalLife');
}
async function openNode(node) {
  await click(await point('getLifeMapNodeClickPoint',node));
  await click(await point('getLifeMapEnterNodeClickPoint'));
  await click(await point('getLifeMapEnterNodeClickPoint'));
  await wait(()=>{const s=__SETTLEMENT_DEBUG__.getSnapshot();return s.lifeMapDecision.open&&!s.worldMap.lifeDecisionProcessing;});
}
async function entry() {
  assert.ok(config.artwork!=='progressive','J1 supports separate minimal off / illustrated populations; progressive art is J8');
  const session=await newPage({ordinary:true});
  try{
    await record('J1','new-game-to-slot-picker',async()=>{
      await currentPage.getByTestId('game-new').click();
      await currentPage.getByTestId('game-slot-1').waitFor();return {slotPicker:true};
    },{input:'game-new'});
    const row=await record('J1','ordinary-new-through-opening',async()=>{
      await currentPage.getByTestId('game-slot-1').click();
      const witness=await useful({opening:true});
      assert.equal(witness.baseSeed,config.seed,'ordinary menu seed retained');
      assert.equal(witness.frontierSec,0,'opening remains read only');
      assert.ok(witness.opening.lossSec>0,'opening exact loss is known');
      assert.ok(witness.computed>=witness.opening.lossSec,'full opening forecast present');
      return witness;
    },{input:'game-slot-1'});
    const navigation={...row,id:`${row.id}:navigation`,step:'navigation-to-useful',started:0,
      observationId:`${runId}:op-${nextObservationId++}`,
      elapsedMs:row.finished,timingBoundary:'navigation time origin to same useful frame; includes automated menu-input gaps',
      fixture:`ordinary current New Game seed${config.seed}`,frames:undefined};
    records.push(navigation);await appendFile(path.join(output,'observations.jsonl'),JSON.stringify(navigation)+'\n');
    await record('J1','opening-to-responsive-present',async()=>{await present();return {frontier:(await snapshot()).frontierSec};},{input:'Present'});
    await writeFile(path.join(output,`${launchId.split(':').at(-1)}-entry-detail.json`),JSON.stringify({navigationToUsefulMs:await currentPage.evaluate(()=>performance.now()),entryMs:row.elapsedMs,errors:session.errors}));
    assert.deepEqual(session.errors,[]);
  }finally{await session.context.close();}
}
async function performanceEntry() {
  // Entry starts at the ordinary URL and uses the real Developer Tools button.
  const session=await newPage({ordinary:true,regularUrl:true});
  pagePopulation={...pagePopulation,seed:123,entryPath:'performance-prepared-new'};
  try{
    const originalUrl=currentPage.url();
    await currentPage.getByTestId('game-developer-tools').locator('summary').click();
    await currentPage.getByTestId('game-progressive-artwork').setChecked(config.artwork==='progressive');
    await wait(()=>!document.querySelector('[data-testid=game-new-performance]').disabled);
    await record('J2','performance-new',async()=>{
      await currentPage.getByTestId('game-new-performance').click();const w=await useful({opening:true});
      assert.equal(w.baseSeed,123,'prepared start seed');assert.equal(w.terrain.bakes,0,'performance entry avoids terrain bake');
      assert.equal(new URL(currentPage.url()).pathname,new URL(originalUrl).pathname);return w;
    },{input:'game-new-performance',fixture:`prepared:${manifest['build-manifest.json'].performanceFixtureKey}`});
    await present();
    assert.deepEqual(session.errors,[]);
  }finally{await session.context.close();}
}
async function performanceContinue() {
  const fixture=fixtures['later-history'];
  const session=await newPage({fixture,slot:'performance-dev',regularUrl:true});
  pagePopulation={...pagePopulation,entryPath:'performance-continue-action-history'};
  try{
    await currentPage.getByTestId('game-developer-tools').locator('summary').click();
    await currentPage.getByTestId('game-progressive-artwork').setChecked(config.artwork==='progressive');
    await record('J2','performance-continue',async()=>{
      await currentPage.getByTestId('game-continue-performance').click();return await useful();
    },{input:'game-continue-performance',fixture,oracle:w=>{
      assert.equal(w.baseSeed,fixture.seed);assert.equal(w.frontierSec,fixture.seconds);assert.equal(w.actions,fixture.actions);
      assert.equal(w.terrain.bakes,0,'performance Continue does not bake terrain on entry');
      return {fixture:fixture.sha256,frontier:w.frontierSec,actions:w.actions};
    }});
    assert.deepEqual(session.errors,[]);
  }finally{await session.context.close();}
}
async function mapAndScrub() {
  const session=await continueFixture(fixtures.ordinary);
  try {
    const initial=await snapshot();
    const counters=await currentPage.evaluate(()=>__SETTLEMENT_DEBUG__.getPerfSnapshot());
    await writeFile(path.join(output,`${launchId.split(':').at(-1)}-map-before.json`),JSON.stringify({worldMap:initial.worldMap,graph:initial.graph,projection:initial.projection,counters},null,2));
    const b=await currentPage.locator('canvas').boundingBox();
    const start=await snapshot();
    await record('J3','map-pan',async()=>{
      await currentPage.mouse.move(b.x+b.width*.48,b.y+b.height*.4);await currentPage.mouse.down();
      await currentPage.mouse.move(b.x+b.width*.62,b.y+b.height*.4,{steps:8});await currentPage.mouse.up();
      return await wait(before=>{const s=__SETTLEMENT_DEBUG__.getSnapshot();const c=s.worldMap.camera;
        return JSON.stringify(c)!==JSON.stringify(before)&&{camera:c,forecast:s.forecastStatus,projection:s.projection};},start.worldMap.camera);
    },{input:'map drag'});
    const before=(await snapshot()).worldMap.camera;
    await record('J3','map-zoom',async()=>{
      await currentPage.mouse.move(b.x+b.width*.5,b.y+b.height*.4);await currentPage.mouse.wheel(0,-180);
      return await wait(old=>{const s=__SETTLEMENT_DEBUG__.getSnapshot();return s.worldMap.camera.zoom>old.zoom&&{camera:s.worldMap.camera};},before);
    },{event:'wheel',input:'map wheel -180'});
    const region=await currentPage.evaluate(()=>{const s=__SETTLEMENT_DEBUG__.getSnapshot();return s.worldMap.regionMapIndicators?.find(r=>r.controller==='player')?.regionId??s.lineage?.currentVassal?.locationRegionId;});
    assert.ok(region,'ordinary controlled settlement target');
    await record('J3','settlement-open',async()=>{
      await click(await point('getWorldMapClickPoint',region),{double:true});
      return await wait(id=>{const s=__SETTLEMENT_DEBUG__.getSnapshot();return s.worldMap.mode==='settlement'&&!s.worldMap.focusAnimating&&{mode:s.worldMap.mode,selected:s.worldMap.selectedRegionId,region:id};},region);
    },{input:{doubleClickRegion:region}});
    await record('J3','settlement-close',async()=>{await click(await point('getNavigationClickPoint','map'));return await wait(()=>{const s=__SETTLEMENT_DEBUG__.getSnapshot();return s.worldMap.mode==='map'&&!s.worldMap.focusAnimating&&{mode:s.worldMap.mode};});},{input:'Map navigation'});
    // Real pointer targets are selected from current graph geometry. Exact
    // anchor/off-anchor classification is derived from actual retained keys.
    for(const anchor of [true,false]) {
      const state=await snapshot(),g=state.graph;
      const cap=Math.min(state.browseCapSec,g.revealedCoverageEndSec);
      const keys=[...(state.controller.graphBoundarySecs?.first??[]),...(state.controller.graphBoundarySecs?.last??[])];
      const candidates=Array.from({length:Math.max(0,Math.floor(Math.min(cap,g.maxSec))-Math.ceil(g.minSec))},(_,i)=>i+Math.ceil(g.minSec));
      const sec=candidates.find(t=>t>0&&(anchor?keys.includes(t):!keys.includes(t)));
      assert.ok(Number.isFinite(sec),`covered ${anchor?'anchor':'off-anchor'} exists`);
      const x=g.plotScreenRect.x+(sec-g.minSec)/(g.maxSec-g.minSec)*g.plotScreenRect.width;
      const y=g.plotScreenRect.y+g.plotScreenRect.height*.5;
      await record('J5',anchor?'scrub-anchor':'scrub-off-anchor',async()=>{
        await currentPage.mouse.click(x,y);
        return await wait(expected=>{const s=__SETTLEMENT_DEBUG__.getSnapshot();
          return s.viewedSec===expected&&s.runner.cursorStateSec===expected&&{second:s.viewedSec,frontier:s.frontierSec,cap:s.graph.revealedCoverageEndSec,status:s.runner.previewStatus};},sec);
      },{input:{sec,anchor,cap},fixture:fixtures.ordinary,oracle:async()=>previewOracle(fixtures.ordinary,sec,await snapshot())});
      const after=await snapshot();assert.equal(after.frontierSec,start.frontierSec,'read-only scrub preserves frontier');
    }
    assert.deepEqual(session.errors,[]);
  }finally{await session.context.close();}
}
async function life() {
  const session=await continueFixture(fixtures.selected);
  try {
    await record('J4','life-map-open',async()=>{await openLife();return {mode:(await snapshot()).worldMap.mode};},{fixture:fixtures.selected,input:'Life Map'});
    const before=await snapshot(),node=before.lineage.currentVassal.availableNodeIds[0];
    await record('J4','node-select',async()=>{await click(await point('getLifeMapNodeClickPoint',node));return await wait(node=>{const s=__SETTLEMENT_DEBUG__.getSnapshot();return s.lifeMap.candidateNodeId===node&&!s.lifeMapDecision.open&&{candidate:node,actions:s.runner.timeline.actionCount};},node);},{input:{node}});
    assert.equal((await snapshot()).runner.timeline.actionCount,before.runner.timeline.actionCount,'selection is read-only');
    await click(await point('getLifeMapEnterNodeClickPoint'));
    await record('J4','node-entry-confirm',async()=>{
      await click(await point('getLifeMapEnterNodeClickPoint'));
      return await wait(node=>{const s=__SETTLEMENT_DEBUG__.getSnapshot();return s.lifeMapDecision.open&&!s.worldMap.lifeDecisionProcessing&&s.lineage.currentVassal.currentNodeId===node&&{node,actions:s.runner.timeline.actionCount};},node);
    },{input:{confirmEntry:node}});
    assert.equal((await snapshot()).runner.timeline.actionCount,before.runner.timeline.actionCount+1,'entry records exactly one action');
    const d=(await snapshot()).lifeMapDecision;
    const randomIndex=d.shopTagChoices.findIndex(x=>x.id==='random');assert.ok(randomIndex>=0);
    await record('J4','shop-category-selection',async()=>{
      await click(await point('getLifeMapOptionClickPoint',randomIndex));
      return await wait(()=>{const d=__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision;return d.shopTag==='random'&&d.offers.length>0&&{shopTag:d.shopTag,offers:d.offers.map(o=>o.offerId)};});
    },{input:'Random Practice pool'});
    const purchaseBefore=await snapshot();
    const offerIndex=purchaseBefore.lifeMapDecision.offers.findIndex(o=>o.canStage);assert.ok(offerIndex>=0);
    await record('J6','purchase-to-staged-preview',async()=>{
      await click(await point('getLifeMapOfferClickPoint',offerIndex));
      let d=(await snapshot()).lifeMapDecision;
      if(d.replacementOfferId)await click(await point('getLifeMapTableauClickPoint',4));
      return await wait(()=>{const s=__SETTLEMENT_DEBUG__.getSnapshot(),d=s.lifeMapDecision;
        return d.purchaseOrder.length===1&&!d.interactionPending&&{purchaseOrder:d.purchaseOrder,practices:d.practices.map(p=>p?.practiceId??null),prestige:d.projectedPrestige,actions:s.runner.timeline.actionCount};});
    },{input:{offerIndex}});
    const beforeConfirm=await snapshot();
    await record('J6','confirm-to-recomputed-preview',async()=>{
      await click(await point('getLifeMapConfirmClickPoint'));
      return await wait(()=>{const s=__SETTLEMENT_DEBUG__.getSnapshot();return s.lifeMapRecap.open&&!s.worldMap.lifeDecisionProcessing&&!s.pendingCommitJob&&{frontier:s.frontierSec,recap:s.lifeMapRecap,projection:s.projection,forecast:s.forecastStatus,actions:s.runner.timeline.actionCount};});
    },{input:'Confirm purchased node'});
    assert.equal((await snapshot()).runner.timeline.actionCount,beforeConfirm.runner.timeline.actionCount+1,'confirmation records exactly once');
    await wait(()=>__SETTLEMENT_DEBUG__.getSnapshot().lifeMapRecap.clock?.locked);
    await record('J4','recap-return',async()=>{await click(await point('getLifeMapRecapDismissClickPoint'));return await wait(()=>{const s=__SETTLEMENT_DEBUG__.getSnapshot();return !s.lifeMapRecap.open&&!s.worldMap.lifeDecisionProcessing&&{mode:s.worldMap.mode,frontier:s.frontierSec};});},{input:'recap Continue'});
    assert.deepEqual(session.errors,[]);
  }finally{await session.context.close();}
}
async function saveLoad() {
  const fixture=fixtures.history,session=await newPage({fixture,artwork:'off'});
  try{
    await record('J7','nontrivial-load',async()=>{await currentPage.getByTestId('game-continue').click();const w=await useful();
      assert.equal(w.baseSeed,fixture.seed);assert.equal(w.frontierSec,fixture.seconds);return w;},{input:'Continue',fixture});
    await present();
    await record('J7','save-to-persisted',async()=>{
      await currentPage.getByTestId('game-menu-open').click();await currentPage.getByTestId('game-menu').waitFor({state:'visible'});
      // Menu save is asynchronous. Reading a transaction after the click does
      // not itself establish completion; require the new payload's identity.
      if(config.instrumentation)await wait(()=>__HC__.saveEvents.some(e=>e.kind==='complete'&&e.time>=__HC__.active.started&&e.slots.includes(1)));
      else await wait(()=>document.querySelector('[data-testid=game-new]')?.disabled===false);
      return {slot:1,persisted:true};
    },{input:'Menu (save)',fixture,oracle:async()=>{
      const text=await currentPage.evaluate(readSave,{database:SAVE_DATABASE_NAME,slot:1});
      assert.ok(text);const checked=inspectSaveText(text);assert.equal(checked.ok,true);
      assert.notEqual(JSON.parse(text).meta.savedAt,fixture.meta.savedAt,'new transaction replaces fixture saved timestamp');
      const actual=serializeGameState(checked.state);assert.equal(actual.rng.baseSeed,fixture.seed);
      assert.equal(Math.floor(actual.tSec),fixture.seconds);return {characters:text.length,sha256:digest(text),stateSha256:digest(actual),seconds:actual.tSec};
    }});
    assert.deepEqual(session.errors,[]);
  }finally{await session.context.close();}
}
async function artwork() {
  const session=await newPage({ordinary:true,regularUrl:true,artwork:'progressive'});
  pagePopulation={...pagePopulation,seed:123,entryPath:'performance-progressive-art'};
  try {
    const memoryBefore=await session.cdp.send('Runtime.getHeapUsage');
    await currentPage.getByTestId('game-developer-tools').locator('summary').click();
    await currentPage.getByTestId('game-progressive-artwork').setChecked(true);
    await wait(()=>!document.querySelector('[data-testid=game-new-performance]').disabled);
    await record('J8','progressive-entry-to-art-ready',async()=>{
      await currentPage.getByTestId('game-new-performance').click();await useful({opening:true});await present();
      await currentPage.locator('[data-testid=debug-open][data-artwork-ready=true]').waitFor();
      const s=await snapshot();return {terrain:s.worldMap.illustratedTerrain,decision:s.lifeMapDecision.decisionMapTerrain};
    },{input:'Performance New with progressive art',oracle:w=>{
      assert.equal(w.terrain.ready,false,'prepared terrain stays unpublished until explicit reveal');
      assert.equal(w.decision.ready,false,'decision terrain stays unpublished until explicit reveal');
      return {unrevealed:true};
    }});
    const before=(await snapshot()).worldMap.illustratedTerrain;
    await record('J8','explicit-art-reveal',async()=>{
      await currentPage.getByTestId('debug-open').click();
      await currentPage.locator('[data-testid=debug-open][data-artwork-ready=false]').waitFor();
      const s=await snapshot();return {terrain:s.worldMap.illustratedTerrain,before};
    },{input:'Artwork ready seal',oracle:w=>{assert.equal(w.terrain.ready,true,'explicit reveal publishes completed terrain');return {explicitlyRevealed:true};}});
    const memoryAfterReveal=await session.cdp.send('Runtime.getHeapUsage');
    // Retain before/after navigation heaps separately from intentional atlas
    // growth. No forced GC or total GPU/process-memory claim is made.
    const memoryNavigation=[];
    const region=await currentPage.evaluate(()=>__SETTLEMENT_DEBUG__.getSnapshot().worldMap.regionMapIndicators.find(r=>r.controller==='player')?.regionId);
    assert.ok(region);
    for(let i=0;i<5;i++){
      await click(await point('getWorldMapClickPoint',region),{double:true});
      await wait(()=>__SETTLEMENT_DEBUG__.getSnapshot().worldMap.mode==='settlement');
      await click(await point('getNavigationClickPoint','map'));
      await wait(()=>__SETTLEMENT_DEBUG__.getSnapshot().worldMap.mode==='map');
      memoryNavigation.push(await session.cdp.send('Runtime.getHeapUsage'));
    }
    await writeFile(path.join(output,`${launchId.split(':').at(-1)}-art-memory.json`),JSON.stringify({memoryBefore,memoryAfterReveal,memoryNavigation,scope:'CDP JS heap only; excludes native process and GPU allocation; no forced GC'}));
    assert.deepEqual(session.errors,[]);
  }finally{await session.context.close();}
}
const jobs={entry,performance:performanceEntry,'performance-continue':performanceContinue,map:mapAndScrub,life,save:saveLoad,art:artwork};
if(config.jobs.includes('performance')&&!config.jobs.includes('performance-continue'))config.jobs.push('performance-continue');
assert.ok(config.jobs.every(job=>job==='all'||Object.hasOwn(jobs,job)),'unknown job selection');
try {
  for(let sample=0;sample<config.samples;sample++) {
    for(const [name,job]of Object.entries(jobs))if(config.jobs.includes('all')||config.jobs.includes(name)){
      await launch(sample,name);try{await job();}finally{await activeBrowser.close();activeBrowser=null;}
    }
  }
}catch(error){failed=true;
  await currentPage?.screenshot({path:path.join(output,'failure.png')}).catch(()=>{});
  await writeFile(path.join(output,'failure.txt'),error.stack);
  console.error(`[hillclimb] FAIL ${records.at(-1)?.job??'setup'}/${records.at(-1)?.step??'setup'}: ${error.message}; ${output}`);
}finally{
  await activeBrowser?.close();server?.kill();
  if(!failed&&records.length===0){failed=true;console.error('[hillclimb] no observations is not an executed suite');}
  manifest.finished=new Date().toISOString();manifest.failed=failed;
  await writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2));
  await writeFile(path.join(output,'summary.json'),JSON.stringify(summarize(records),null,2));
}
console.log(`[hillclimb] ${failed?'FAILED':'completed'} observations=${records.length} path=${output}`);
process.exitCode=failed?1:0;
