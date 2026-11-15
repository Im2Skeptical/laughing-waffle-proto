// Actual-product artwork controls. This is Phase A evidence, not a score or a
// physical-device benchmark. Fault and instrumentation populations stay apart.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,appendFile} from 'node:fs/promises';
import {spawn,execFileSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';
import {BROWSER_PROBE_LAUNCH_OPTIONS} from '../browser-probe-config.mjs';
import {installRuntime} from './browser-runtime.mjs';
import {withDeadline} from './deadline.mjs';
import {inspectAtlasUploads} from './artwork-oracles.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(a=>{const[k,...v]=a.replace(/^--/,'').split('=');return[k,v.join('=')||true];}));
const config={cases:String(args.cases??'deferred,retry,exhausted').split(','),population:String(args.population??'desktop'),
  instrumentation:args.instrumentation!=='off',timeoutMs:Number(args.timeout??240000),navigationCycles:Number(args.cycles??5),
  gateTimeoutMs:Number(args['gate-timeout']??args.timeout??240000),controlNoRequest:args['control-no-request']==='1',
  port:Number(args.port??18246),dist:path.resolve(String(args.dist??'dist'))};
assert.ok(config.cases.every(c=>['deferred','retry','exhausted','reference'].includes(c)),'known control cases required');
assert.ok(['desktop','mobile','mobile4'].includes(config.population));
assert.ok(Number.isInteger(config.navigationCycles)&&config.navigationCycles>=1&&config.navigationCycles<=20);
assert.ok(Number.isFinite(config.timeoutMs)&&config.timeoutMs>=1000);
assert.ok(Number.isFinite(config.gateTimeoutMs)&&config.gateTimeoutMs>=1&&config.gateTimeoutMs<=config.timeoutMs);
assert.ok(!config.controlNoRequest||(config.cases.length===1&&config.cases[0]==='deferred'),
  'missing-request negative control must be an explicitly separate deferred case');
const runId=String(args.id??`artwork-${new Date().toISOString().replace(/[:.]/g,'-')}`);
const output=path.resolve(String(args.output??`artifacts/perf-hillclimb/${runId}`));
await mkdir(path.dirname(output),{recursive:true});
// Preserve every prior success/failure and its exact identity. Reusing an id
// must not overwrite its manifest or append duplicate observation identities.
await mkdir(output);
const hash=x=>createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
const build=JSON.parse(await readFile(path.join(config.dist,'build-manifest.json'),'utf8'));
const contract=await readFile('docs/performance/perf-hillclimb-20261104/HARNESS.md','utf8');
const artSource=await readFile('src/views/chronicle-art.js','utf8');
// Frozen current-loader retry contract, not a guessed bound on lower-level
// HTTP requests. A policy change requires contract review rather than silently
// changing the expected attempt count to match a candidate.
assert.match(artSource,/for \(let attempt = 0; attempt < 3; attempt\+\+\)/);
assert.match(artSource,/\[500, 1500\]\[attempt\]/);
const groups=artSource.slice(artSource.indexOf('const PACKED_GROUPS'),artSource.indexOf('function bumpRevision'));
const atlasFiles=[...groups.matchAll(/['"]([^'"]+\.json)['"]/g)].map(m=>m[1]);
assert.ok(atlasFiles.includes('resource-language.json')&&atlasFiles.includes('full-map-content-prototype.json'),'current artwork registry located');
const manifest={runId,started:new Date().toISOString(),config,build,buildId:hash(build),measurementContractId:hash(contract),
  productHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  machine:{host:os.hostname(),os:os.release(),platform:os.platform(),cpus:os.cpus().map(c=>c.model),totalMemory:os.totalmem()},
  runtime:{node:process.version,playwright:JSON.parse(await readFile('node_modules/playwright/package.json','utf8')).version},
  launch:BROWSER_PROBE_LAUNCH_OPTIONS,sourceFiles:{},atlasFiles,
  retryPolicy:{attemptsPerSheetInvocation:3,automaticBackoffsMs:[500,1500],
    requestCount:'diagnostic only; Pixi dependency fetching/cache can change HTTP counts',
    attemptWitness:'PIXI.Assets.load wrapper installed before unchanged app bundle is released; original Promise returned'},
  fixture:'real performance New Game seed123; prepared current-build fixture; no game-settings override',
  proxy:'desktop Chromium/SwiftShader, optionally CPU-throttled; no physical Pixel6 evidence',
  memoryScope:'CDP JS heap only; native process/GPU memory unavailable; no forced GC',
  scope:'construction controls and diagnostics only; independent audit and representative sampling still required'};
for(const file of ['scripts/perf-hillclimb/artwork-controls.mjs','scripts/perf-hillclimb/browser-runtime.mjs',
  'scripts/perf-hillclimb/deadline.mjs','scripts/perf-hillclimb/artwork-oracles.mjs',
  'scripts/browser-probe-config.mjs','src/views/chronicle-art.js','src/views/progressive-artwork.js']) {
  const source=await readFile(file,'utf8');manifest.sourceFiles[file]=hash(source);
  await writeFile(path.join(output,path.basename(file)),source);
}
manifest.harnessId=hash(manifest.sourceFiles);
manifest.serializedRuntimeSha256=hash(installRuntime.toString());
await writeFile(path.join(output,'measurement-contract.md'),contract);
await writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2));

const server=spawn(process.execPath,['node_modules/serve/bin/serve.js','-l',String(config.port),'--no-clipboard',config.dist],{stdio:'ignore',windowsHide:true});
const url=`http://127.0.0.1:${config.port}/`;
let browser,currentPage,failed=false,operationId=0;
const observations=[],results=[];
async function verifyServer() {
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch(url)).ok){ready=true;break;}}catch{}await delay(100);}
  assert.ok(ready,'owned dist server started');
  const response=await fetch(new URL('build-manifest.json',url));assert.equal(response.ok,true);
  assert.equal(hash(await response.json()),manifest.buildId,'served product manifest matches declared build');
  manifest.servedAssets={};
  for(const key of ['bundle','worker','saveLoadWorker','stylesheet']) {
    const relative=build[key],response=await fetch(new URL(relative,url));assert.equal(response.ok,true);
    const bytes=Buffer.from(await response.arrayBuffer());assert.equal(hash(bytes),hash(await readFile(path.join(config.dist,relative))),`served ${key} identity`);
    manifest.servedAssets[key]=hash(bytes);
  }
}

// Minimal fault/error witness remains in both instrumentation populations.
// Heavy periodic state sampling is explicitly toggled and its CPU cost retained.
function installArtworkWitness({instrumentation}) {
  const a=globalThis.__HC_ART__={samples:[],warnings:[],resourceEvents:[],assetLoadCalls:[],droppedSamples:0,samplingCpuMs:0,
    startInput:null,revealInput:null,firstReadyAt:null};
  const warn=console.warn;console.warn=function(...values){
    const text=values.map(String).join(' ');if(text.includes('[progressive-artwork]'))a.warnings.push({time:performance.now(),text});
    return warn.apply(this,values);
  };
  document.addEventListener('pointerdown',e=>{
    const target=e.target?.closest?.('[data-testid]');
    if(target?.dataset.testid==='game-new-performance')a.startInput=e.timeStamp;
    if(target?.dataset.testid==='debug-open'&&target.dataset.artworkReady==='true')a.revealInput=e.timeStamp;
  },{capture:true});
  if(!instrumentation)return;
  try{new PerformanceObserver(list=>a.resourceEvents.push(...list.getEntries().map(e=>({name:e.name,start:e.startTime,duration:e.duration,
    responseEnd:e.responseEnd,transferSize:e.transferSize,decodedBodySize:e.decodedBodySize}))))
    .observe({type:'resource',buffered:true});}catch{}
  setInterval(()=>{
    if(a.startInput===null||!globalThis.__SETTLEMENT_DEBUG__||document.querySelector('[data-testid=game-menu]')?.hidden!==true)return;
    const began=performance.now(),s=__SETTLEMENT_DEBUG__.getSnapshot(),seal=document.querySelector('[data-testid=debug-open]');
    const row={time:began,mainReady:!!s.worldMap?.illustratedTerrain?.ready,mainPrepared:!!s.worldMap?.illustratedTerrain?.prepared,
      decisionReady:!!s.lifeMapDecision?.decisionMapTerrain?.ready,decisionPrepared:!!s.lifeMapDecision?.decisionMapTerrain?.prepared,
      sealReady:seal?.dataset.artworkReady==='true',revealInput:a.revealInput};
    if(row.sealReady&&a.firstReadyAt===null)a.firstReadyAt=began;
    if(a.samples.length<4000)a.samples.push(row);else a.droppedSamples++;
    a.samplingCpuMs+=performance.now()-began;
  },250);
}
function installAssetAttemptWitness() {
  const a=globalThis.__HC_ART__;if(a.assetWitnessInstalled)return;
  const original=PIXI.Assets.load;
  a.assetWitnessInstalled=true;a.pixiVersion=PIXI.VERSION;
  PIXI.Assets.load=function(input,...rest){
    const paths=Array.isArray(input)?input:[input];
    a.assetLoadCalls.push({time:performance.now(),paths:paths.filter(p=>typeof p==='string'),
      operation:globalThis.__HC__?.active?.name??'setup'});
    return original.call(this,input,...rest);
  };
}
async function session(caseId) {
  browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);manifest.runtime.chromium=browser.version();
  const context=await browser.newContext({viewport:config.population==='desktop'?{width:1280,height:800}:{width:844,height:390},
    hasTouch:config.population!=='desktop',isMobile:config.population!=='desktop',deviceScaleFactor:1});
  const page=await context.newPage();currentPage=page;page.setDefaultTimeout(config.timeoutMs);
  const cdp=await context.newCDPSession(page);if(config.population==='mobile4')await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
  const errors=[],consoleErrors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')consoleErrors.push(m.text().slice(0,500));});
  page.on('requestfailed',r=>requests.push({url:r.url(),failure:r.failure()?.errorText}));
  await page.addInitScript(installRuntime,{instrumentation:config.instrumentation});
  await page.addInitScript(installArtworkWitness,{instrumentation:config.instrumentation});
  await page.addInitScript(()=>localStorage.setItem('dev.progressiveArtwork','on'));
  // Entry preparation can reuse an initial lazy resource load. Capture both
  // phases rather than installing a hook too late and missing its first call.
  // The module request is held only during untimed setup; bytes are unchanged.
  await page.route(new URL(build.bundle,url).href,async route=>{
    await page.waitForFunction(()=>globalThis.PIXI?.Assets?.load);
    await page.evaluate(installAssetAttemptWitness);
    await route.continue();
  });
  return {caseId,launchId:`${runId}:${caseId}:browser`,context,page,cdp,errors,consoleErrors,requests};
}
async function condition(fn,arg,{terminal=false,key='wait',timeout=config.timeoutMs}={}) {
  const h=await currentPage.waitForFunction(({source,arg,terminal,key})=>__HC__.probe(()=>Function('arg',`return (${source})(arg)`)(arg),{key,terminal}),
    {source:fn.toString(),arg,terminal,key},{polling:'raf',timeout});
  const result=await h.jsonValue();await h.dispose();return result;
}
async function compactSnapshot() {return currentPage.evaluate(()=>{
  const s=__SETTLEMENT_DEBUG__.getSnapshot();return {time:performance.now(),frontier:s.frontierSec,viewed:s.viewedSec,
    actions:s.runner.timeline.actionCount,mode:s.worldMap.mode,main:s.worldMap.illustratedTerrain,
    decision:s.lifeMapDecision.decisionMapTerrain,sealReady:document.querySelector('[data-testid=debug-open]')?.dataset.artworkReady==='true'};
});}
function assertUnrevealed(s,label) {assert.equal(s.main.ready,false,`${label}: world artwork not published`);assert.equal(s.decision.ready,false,`${label}: decision artwork not published`);}
function assertPrepared(s) {assertUnrevealed(s,'prepared before explicit reveal');assert.equal(s.main.prepared,true);assert.equal(s.decision.prepared,true);assert.equal(s.sealReady,true);}
async function clickPoint(method,arg,{double=false}={}) {
  const p=await currentPage.evaluate(({method,arg})=>__SETTLEMENT_DEBUG__[method](arg),{method,arg});assert.ok(p,`${method} control exists`);
  const bounds=await currentPage.locator('canvas').boundingBox();assert.ok(bounds);
  const x=bounds.x+p.x*bounds.width/2424,y=bounds.y+p.y*bounds.height/1080;
  if(double)await currentPage.mouse.dblclick(x,y,{delay:80});else await currentPage.mouse.click(x,y);
}
async function record(s,step,body,{startNow=false,fault='none',timeoutMs=config.timeoutMs}={}) {
  const header={runId,job:'J8',step,launchId:s.launchId,observationId:`${runId}:art-${++operationId}`,
    buildId:manifest.buildId,harnessId:manifest.harnessId,measurementContractId:manifest.measurementContractId,
    fixture:'prepared:seed123',population:{layout:config.population,cpuRate:config.population==='mobile4'?4:1,
      cache:'browser-cold',artwork:s.artwork??'progressive',instrumentation:config.instrumentation,fault},kind:'validity-control'};
  await currentPage.evaluate(({name,timeoutMs,startNow})=>__HC__.arm({name,timeoutMs,startNow}),{name:step,timeoutMs,startNow});
  try{
    const witness=await body();const timing=await currentPage.evaluate(w=>__HC__.finish(w),witness);
    const row={...header,ok:true,...timing};observations.push(row);await appendFile(path.join(output,'observations.jsonl'),JSON.stringify(row)+'\n');return row;
  }catch(error){
    const timing=await currentPage.evaluate(e=>__HC__.cancel(e),error.message).catch(()=>null);
    const row={...header,ok:false,...timing,error:error.message,timeout:/timeout/i.test(error.message)};
    observations.push(row);await appendFile(path.join(output,'observations.jsonl'),JSON.stringify(row)+'\n');throw error;
  }
}
async function menu(s,{progressive=true}={}) {
  s.artwork=progressive?'progressive':'off';
  // This is the actual regular menu in its supported minimal-graphics mode.
  // It prevents illustrated resources from loading before the performance tap.
  await s.page.goto(`${url}?dev=1`);
  await s.page.getByTestId('game-developer-tools').locator('summary').click();
  await s.page.getByTestId('game-progressive-artwork').setChecked(progressive);
  await condition(()=>!document.querySelector('[data-testid=game-new-performance]')?.disabled);
}
async function useful() {
  await condition(()=>document.querySelector('[data-testid=game-menu]')?.hidden===true
    &&globalThis.__SETTLEMENT_DEBUG__?.getSnapshot().opening?.phase==='completed');
  const p=await currentPage.evaluate(()=>__SETTLEMENT_DEBUG__.getTimeActionClickPoint());
  if(p)await clickPoint('getTimeActionClickPoint');
  await condition(()=>{const s=__SETTLEMENT_DEBUG__.getSnapshot();return s.viewedSec===s.frontierSec&&!s.runComplete.open;});
}
async function navigation(s,label) {
  const region=await currentPage.evaluate(()=>__SETTLEMENT_DEBUG__.getSnapshot().worldMap.regionMapIndicators?.find(r=>r.controller==='player')?.regionId);
  assert.ok(region,'real player settlement exists');
  await record(s,`${label}-settlement-open`,async()=>{
    await clickPoint('getWorldMapClickPoint',region,{double:true});
    return condition(id=>{const s=__SETTLEMENT_DEBUG__.getSnapshot(),map=s.worldMap;
      return map.mode==='settlement'&&!map.focusAnimating&&map.selectedRegionId===id
        &&{mode:map.mode,region:map.selectedRegionId};},region,{terminal:true,key:`settlement-open:${region}`});
  });
  await record(s,`${label}-map-return`,async()=>{
    await clickPoint('getNavigationClickPoint','map');
    return condition(()=>{const s=__SETTLEMENT_DEBUG__.getSnapshot();return s.worldMap.mode==='map'&&!s.worldMap.focusAnimating&&{mode:s.worldMap.mode};},null,{terminal:true,key:'map-return'});
  });
}
async function uploadedAtlases() {return currentPage.evaluate(inspectAtlasUploads,atlasFiles);}
async function assetAttempts(file) {
  return currentPage.evaluate(file=>__HC_ART__.assetLoadCalls.filter(c=>c.paths.some(p=>new URL(p,location.href).pathname.endsWith(`/sprite-sheets/${file}`))),file);
}
function assertRetryBatches(calls,{maxInvocations,label}) {
  const size=manifest.retryPolicy.attemptsPerSheetInvocation;
  assert.ok(calls.length>=size&&calls.length%size===0&&calls.length<=size*maxInvocations,
    `${label}: every failed sheet invocation exhausts exactly three application attempts`);
  for(let start=0;start<calls.length;start+=size)for(let n=1;n<size;n++)
    assert.ok(calls[start+n].time-calls[start+n-1].time>=manifest.retryPolicy.automaticBackoffsMs[n-1]-5,
      `${label}: attempt ${n+1} includes its declared application backoff`);
  return {calls,invocations:calls.length/size,backoffsMs:manifest.retryPolicy.automaticBackoffsMs};
}
async function finishSession(s,details) {
  const witness=await s.page.evaluate(()=>({...__HC_ART__,resources:performance.getEntriesByType('resource').filter(e=>e.name.includes('/sprite-sheets/'))
    .map(e=>({name:e.name,start:e.startTime,duration:e.duration,responseEnd:e.responseEnd,transferSize:e.transferSize}))}));
  assert.equal(witness.droppedSamples,0,'no silently dropped artwork oracle samples');
  assert.equal(witness.samples.filter(x=>x.revealInput===null&&(x.mainReady||x.decisionReady)).length,0,'periodic oracle detected no publication before explicit input');
  assert.deepEqual(s.errors,[],'no unhandled product page error');
  const result={case:s.caseId,...details,witness,errors:s.errors,consoleErrors:s.consoleErrors,requestFailures:s.requests};
  await writeFile(path.join(output,`${s.caseId}.json`),JSON.stringify(result,null,2));results.push({case:s.caseId,ok:true,detailsFile:`${s.caseId}.json`});
}
async function stagedAndReveal(s,{held=false,gate,release}={}) {
  // The explicit negative-control population follows the real artwork-off
  // entry path, so the expected progressive atlas request never occurs.
  await menu(s,{progressive:!config.controlNoRequest});
  await record(s,'performance-entry-useful',async()=>{
    await s.page.getByTestId('game-new-performance').click();await useful();
    return condition(()=>{const x=__SETTLEMENT_DEBUG__.getSnapshot();return x.viewedSec===x.frontierSec&&!x.runComplete.open&&{frontier:x.frontierSec};},null,{terminal:true,key:'useful'});
  },{fault:held?'deferred-atlas':'none'});
  const memory=[{stage:'entry',...await s.cdp.send('Runtime.getHeapUsage')}];
  if(held) {
    await record(s,'deferred-atlas-request-observed',async()=>{
      await withDeadline(gate,config.gateTimeoutMs,'deferred atlas request observation');
      return condition(()=>__HC_ART__.deferredRequestObserved,null,{terminal:true,key:'actual-deferred-request'});
    },{startNow:true,fault:config.controlNoRequest?'deliberate-no-progressive-request':'required-deferred-request-witness',timeoutMs:config.gateTimeoutMs});
    const before=await compactSnapshot();assertUnrevealed(before,'atlas response deferred');assert.equal(before.sealReady,false);
    await navigation(s,'while-art-deferred');
    const still=await compactSnapshot();assertUnrevealed(still,'navigation while response deferred');assert.equal(still.sealReady,false);
    const deferred=await record(s,'deferred-atlas-to-prepared',async()=>{
      // Known delay is inside the browser-visible loading path, not a host sleep
      // outside a measured operation. Resource timing corroborates its duration.
      release();
      return condition(()=>document.querySelector('[data-testid=debug-open]')?.dataset.artworkReady==='true',null,{terminal:true,key:'art-prepared'});
    },{startNow:true,fault:'atlas-held-then-200ms-delay'});
    assert.ok(deferred.elapsedMs>=190,'actual deferred response cannot be bypassed by an early ready result');
  }else await record(s,'background-to-prepared',()=>condition(()=>document.querySelector('[data-testid=debug-open]')?.dataset.artworkReady==='true',null,{terminal:true,key:'art-prepared'}),{startNow:true});
  const prepared=await compactSnapshot();assertPrepared(prepared);
  assert.throws(()=>assertPrepared({...prepared,main:{...prepared.main,ready:true}}),/not published/,'deliberately premature result fails same oracle');
  const uploaded=await uploadedAtlases();assert.ok(uploaded.every(a=>a.valid&&a.uploaded),'every registered atlas is decoded and GPU-uploaded before ready');
  memory.push({stage:'prepared-hidden',...await s.cdp.send('Runtime.getHeapUsage')});
  await s.page.screenshot({path:path.join(output,`${s.caseId}-prepared-hidden.png`)});
  await record(s,'explicit-reveal',async()=>{
    await s.page.getByTestId('debug-open').click();
    return condition(()=>{const x=__SETTLEMENT_DEBUG__.getSnapshot();return x.worldMap.illustratedTerrain.ready===true
      &&x.lifeMapDecision.decisionMapTerrain.ready===true&&document.querySelector('[data-testid=debug-open]')?.dataset.artworkReady==='false'
      &&{main:x.worldMap.illustratedTerrain,decision:x.lifeMapDecision.decisionMapTerrain};},null,{terminal:true,key:'art-published'});
  });
  await s.page.screenshot({path:path.join(output,`${s.caseId}-revealed.png`)});
  memory.push({stage:'revealed',...await s.cdp.send('Runtime.getHeapUsage')});
  for(let block=0;block<2;block++){
    for(let n=0;n<config.navigationCycles;n++)await navigation(s,`revealed-${block}-${n}`);
    memory.push({stage:`navigation-block-${block+1}`,operations:2*config.navigationCycles,...await s.cdp.send('Runtime.getHeapUsage')});
  }
  await finishSession(s,{prepared,revealed:await compactSnapshot(),uploaded,memory,
    memoryPolicy:'raw JS heap, same settled map endpoint, no forced GC; one run cannot establish retained-memory growth or tails',
    samplingPolicy:'250ms compact state snapshots when instrumentation on; endpoint checks retained off; transient unsampled publication cannot be ruled out from sampling alone'});
}
async function runCase(caseId) {
  const s=await session(caseId);
  try{
    if(caseId==='deferred') {
      let gateResolve,releaseResolve;
      const gate=new Promise(resolve=>{gateResolve=resolve;}),released=new Promise(resolve=>{releaseResolve=resolve;});
      let held=false;
      await s.page.route('**/sprite-sheets/full-map-content-prototype.json',async route=>{
        if(held)return route.continue();held=true;
        await s.page.evaluate(url=>{__HC_ART__.deferredRequestObserved={url,time:performance.now()};},route.request().url());
        gateResolve();await released;await delay(200);return route.continue();
      });
      try{await stagedAndReveal(s,{held:true,gate,release:releaseResolve});}
      finally{releaseResolve();}
    }else if(caseId==='reference') await stagedAndReveal(s);
    else if(caseId==='retry') {
      let blocked=true,count=0;
      await s.page.route('**/sprite-sheets/resource-language.png',route=>{if(blocked){count++;return route.abort('failed');}return route.continue();});
      await menu(s,{progressive:false});
      await record(s,'required-asset-failure-detected',async()=>{
        await s.page.getByTestId('game-new-performance').click();
        return condition(()=>!!document.querySelector('[data-testid=game-loading-retry]')
          &&document.querySelector('[data-testid=game-menu]')?.hidden===false,null,{terminal:true,key:'required-art-error'});
      },{fault:'required-resource-png-aborted'});
      assert.ok(count>0,'real required-resource HTTP failure exercised');
      // The initial lazy group can already be failed when explicit entry starts;
      // prepareChronicleArt may then start one fresh bounded group invocation.
      const automaticAttempts=assertRetryBatches(await assetAttempts('resource-language.json'),
        {maxInvocations:2,label:'required resource initial/entry loading'});
      assert.match(await s.page.getByTestId('game-loading-details').textContent(),/resource-language/);
      const failedCount=count;blocked=false;
      await record(s,'required-asset-manual-retry',async()=>{
        await s.page.getByTestId('game-loading-retry').click();await useful();
        return condition(()=>document.querySelector('[data-testid=game-menu]')?.hidden===true,null,{terminal:true,key:'manual-retry-recovered'});
      },{fault:'required-resource-restored'});
      const uploaded=(await uploadedAtlases()).filter(x=>x.file==='resource-language.json');
      assert.ok(uploaded.length===1&&uploaded[0].valid&&uploaded[0].uploaded,'restored required resource actually uploaded');
      const afterRetry=await assetAttempts('resource-language.json');
      assert.equal(afterRetry.length,automaticAttempts.calls.length+1,'manual retry succeeds on one new application attempt');
      await navigation(s,'after-required-art-retry');
      await finishSession(s,{automaticHttpFailures:failedCount,automaticAttempts,manualAttempt:afterRetry.at(-1),uploaded,manualRetry:true});
    }else if(caseId==='exhausted') {
      let count=0;
      await s.page.route('**/sprite-sheets/full-map-content-prototype.json',route=>{count++;return route.abort('failed');});
      await menu(s);
      await record(s,'progressive-failure-observed',async()=>{
        await s.page.getByTestId('game-new-performance').click();await useful();
        return condition(()=>__HC_ART__.warnings.some(w=>/Artwork could not be loaded.*full-map-content-prototype/.test(w.text)),null,{terminal:true,key:'progressive-error'});
      },{fault:'progressive-required-atlas-exhausted'});
      assert.ok(count>0,'real progressive HTTP failure exercised');
      const automaticAttempts=assertRetryBatches(await assetAttempts('full-map-content-prototype.json'),
        {maxInvocations:1,label:'progressive full-map loading'});
      const state=await compactSnapshot();assertUnrevealed(state,'failed progressive artwork');assert.equal(state.sealReady,false);
      assert.throws(()=>assertPrepared(state),'actual missing required art fails successful-preparation oracle');
      await navigation(s,'after-progressive-art-failure');
      const remaining=atlasFiles.filter(f=>f!=='full-map-content-prototype.json');
      await condition(files=>files.every(file=>{
        const textures=Object.values(PIXI.Assets.cache.get(`images/sprite-sheets/${file}`)?.textures??{});
        return textures.length>0&&textures.every(t=>t.baseTexture?.valid&&Object.keys(t.baseTexture._glTextures??{}).length>0);
      }),remaining,{key:'other-progressive-groups-uploaded'});
      const after=await compactSnapshot();assertUnrevealed(after,'after failed-art navigation');assert.equal(after.sealReady,false);
      assert.equal((await assetAttempts('full-map-content-prototype.json')).length,automaticAttempts.calls.length,
        'drawing/navigation after exhaustion cannot restart automatic attempts');
      await finishSession(s,{automaticHttpFailures:count,automaticAttempts,state,after,
        manualRetry:'unavailable: progressive error is console warning; no product retry affordance is invented or required by this control'});
    }
  }catch(error){
    await s.page.screenshot({path:path.join(output,`${caseId}-failure.png`)}).catch(()=>{});
    await writeFile(path.join(output,`${caseId}-failure.json`),JSON.stringify({error:error.stack,errors:s.errors,consoleErrors:s.consoleErrors,requestFailures:s.requests},null,2));
    throw error;
  }finally{await s.context.close();await browser.close();browser=null;}
}
try{
  await verifyServer();
  for(const caseId of config.cases)await runCase(caseId);
}catch(error){failed=true;console.error(`[artwork-controls] FAIL ${error.message}; details=${output}`);}
finally{
  await browser?.close();server.kill();manifest.finished=new Date().toISOString();manifest.failed=failed;
  await writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2));
  await writeFile(path.join(output,'summary.json'),JSON.stringify({ok:!failed,results,observations:observations.length,
    failures:observations.filter(x=>!x.ok).length,scope:manifest.scope},null,2));
}
console.log(`[artwork-controls] ${failed?'FAILED':'completed'} cases=${results.length}/${config.cases.length} observations=${observations.length} path=${output}`);
process.exitCode=failed?1:0;
