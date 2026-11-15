// Actual-product artwork controls. This is Phase A evidence, not a score or a
// physical-device benchmark. Fault and instrumentation populations stay apart.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile,appendFile} from 'node:fs/promises';
import {spawn,execFileSync} from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';
import {BROWSER_PROBE_LAUNCH_OPTIONS} from '../browser-probe-config.mjs';
import {installRuntime} from './browser-runtime.mjs';
import {withDeadline} from './deadline.mjs';
import {inspectAtlasUploads,assertArtworkPublication} from './artwork-oracles.mjs';
import {instrumentArtworkBundle} from './artwork-bundle-controls.mjs';

const args=Object.fromEntries(process.argv.slice(2).map(a=>{const[k,...v]=a.replace(/^--/,'').split('=');return[k,v.join('=')||true];}));
const config={cases:String(args.cases??'deferred,retry,exhausted').split(','),population:String(args.population??'desktop'),
  instrumentation:args.instrumentation!=='off',timeoutMs:Number(args.timeout??240000),navigationCycles:Number(args.cycles??5),
  gateTimeoutMs:Number(args['gate-timeout']??args.timeout??240000),controlNoRequest:args['control-no-request']==='1',
  tracePublication:args['publication-witness']!=='sampled',
  port:Number(args.port??18246),dist:path.resolve(String(args.dist??'dist'))};
assert.ok(config.cases.every(c=>['deferred','retry','exhausted','reference','early-publication'].includes(c)),'known control cases required');
assert.equal(new Set(config.cases).size,config.cases.length,'use separate run IDs for repeated cases');
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
const artworkBaseline=JSON.parse(await readFile('scripts/perf-hillclimb/fixtures/artwork-baseline.json','utf8'));
const buildInfo=JSON.parse(await readFile(path.join(config.dist,'build-info.json'),'utf8'));
const preparedBytes=await readFile(path.join(config.dist,'images/dev-fixtures/performance-start.json.gz'));
const preparedPacket=JSON.parse(gunzipSync(preparedBytes));
assert.equal(preparedPacket.key,buildInfo.performanceFixtureKey,'actual prepared packet matches its actual build');
assert.equal(preparedPacket.stateData.rng.baseSeed,artworkBaseline.seed,'fixed prepared logical seed');
assert.equal(hash(preparedPacket.stateData),artworkBaseline.initialStateSha256,'prepared initial state preserves frozen logical workload');
// Frozen current-loader retry contract, not a guessed bound on lower-level
// HTTP requests. A policy change requires contract review rather than silently
// changing the expected attempt count to match a candidate.
assert.match(artSource,/for \(let attempt = 0; attempt < 3; attempt\+\+\)/);
assert.match(artSource,/\[500, 1500\]\[attempt\]/);
const groups=artSource.slice(artSource.indexOf('const PACKED_GROUPS'),artSource.indexOf('function bumpRevision'));
const atlasFiles=[...groups.matchAll(/['"]([^'"]+\.json)['"]/g)].map(m=>m[1]);
assert.ok(atlasFiles.includes('resource-language.json')&&atlasFiles.includes('full-map-content-prototype.json'),'current artwork registry located');
const expectedAtlasFiles=[...artworkBaseline.resourceFiles,...artworkBaseline.groups.flatMap(g=>g.files)].sort();
assert.deepEqual([...atlasFiles].sort(),expectedAtlasFiles,'candidate cannot drop required baseline atlas files');
const manifest={runId,started:new Date().toISOString(),config,build,buildId:hash(build),measurementContractId:hash(contract),
  productHead:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  machine:{host:os.hostname(),os:os.release(),platform:os.platform(),cpus:os.cpus().map(c=>c.model),totalMemory:os.totalmem()},
  runtime:{node:process.version,playwright:JSON.parse(await readFile('node_modules/playwright/package.json','utf8')).version},
  launch:BROWSER_PROBE_LAUNCH_OPTIONS,sourceFiles:{},atlasFiles,
  artworkBaseline,artworkBaselineId:hash(artworkBaseline),requiredPassiveTimingApiVersion:2,
  preparedFixture:{key:preparedPacket.key,gzipSha256:hash(preparedBytes),gzipBytes:preparedBytes.length,
    stateSha256:hash(preparedPacket.stateData),seed:preparedPacket.stateData.rng.baseSeed,lossSec:preparedPacket.lossSec},
  retryPolicy:{attemptsPerSheetInvocation:3,automaticBackoffsMs:[500,1500],
    requestCount:'diagnostic only; Pixi dependency fetching/cache can change HTTP counts',
    attemptWitness:'PIXI.Assets.load wrapper installed before unchanged app bundle is released; original Promise returned'},
  fixture:'real performance New Game seed123; prepared current-build fixture; no game-settings override',
  proxy:'desktop Chromium/SwiftShader, optionally CPU-throttled; no physical Pixel6 evidence',
  memoryScope:'CDP JS heap only; native process/GPU memory unavailable; no forced GC',
  scope:'construction controls and diagnostics only; independent audit and representative sampling still required'};
manifest.publicationWitness={mode:config.tracePublication?'specific private visibility Set mutations plus passive samples':'passive samples/endpoints only',
  cachePolicy:'new browser/context per case; interception is explicit and this script makes browser-cold claims only',
  overhead:'private-Set and common asset hooks require matched A/A/on-off proof before timing acceptance'};
for(const file of ['scripts/perf-hillclimb/artwork-controls.mjs','scripts/perf-hillclimb/browser-runtime.mjs',
  'scripts/perf-hillclimb/deadline.mjs','scripts/perf-hillclimb/artwork-oracles.mjs','scripts/perf-hillclimb/artwork-bundle-controls.mjs','scripts/perf-hillclimb/fixtures/artwork-baseline.json',
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
const observations=[],results=[],caseFailures=[];
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
// Optional passive publication inventory sampling has explicit cost. It is not
// a claim that a 250ms sampler can exclude every transient visible publication.
function installArtworkWitness({instrumentation}) {
  const a=globalThis.__HC_ART__={samples:[],warnings:[],resourceEvents:[],assetLoadCalls:[],droppedSamples:0,samplingCpuMs:0,
    publicationEvents:[],startInput:null,revealInput:null,firstReadyAt:null,firstReadyFrameAt:null};
  const warn=console.warn;console.warn=function(...values){
    const text=values.map(String).join(' ');if(text.includes('[progressive-artwork]'))a.warnings.push({time:performance.now(),text});
    return warn.apply(this,values);
  };
  document.addEventListener('pointerdown',e=>{
    const target=e.target?.closest?.('[data-testid]');
    if(target?.dataset.testid==='game-new-performance')a.startInput=e.timeStamp;
    if(target?.dataset.testid==='debug-open'&&target.dataset.artworkReady==='true')a.revealInput=e.timeStamp;
  },{capture:true});
  // Observe the actual ready-seal transition without a heavyweight state poll.
  // The second frame is an opportunity witness, never GPU idle/physical scanout.
  let bindObserver;
  const bind=()=>{
    const seal=document.querySelector('[data-testid=debug-open]');if(!seal)return false;
    bindObserver?.disconnect();
    const read=()=>{
      if(a.startInput===null||a.firstReadyAt!==null||seal.dataset.artworkReady!=='true')return;
      a.firstReadyAt=performance.now();
      requestAnimationFrame(()=>requestAnimationFrame(()=>{
        a.firstReadyFrameAt=seal.dataset.artworkReady==='true'?performance.now():null;
        a.readyFrameScope='seal stays ready through double-rAF opportunity, not physical scanout';
      }));
    };
    new MutationObserver(read).observe(seal,{attributes:true,attributeFilter:['data-artwork-ready']});read();return true;
  };
  const startBind=()=>{if(!bind()){bindObserver=new MutationObserver(bind);bindObserver.observe(document.documentElement,{childList:true,subtree:true});}};
  if(document.documentElement)startBind();else document.addEventListener('DOMContentLoaded',startBind,{once:true});
  if(!instrumentation)return;
  try{new PerformanceObserver(list=>a.resourceEvents.push(...list.getEntries().map(e=>({name:e.name,start:e.startTime,duration:e.duration,
    responseEnd:e.responseEnd,transferSize:e.transferSize,decodedBodySize:e.decodedBodySize}))))
    .observe({type:'resource',buffered:true});}catch{}
  setInterval(()=>{
    if(a.startInput===null||!globalThis.__SETTLEMENT_DEBUG__||document.querySelector('[data-testid=game-menu]')?.hidden!==true)return;
    const began=performance.now(),s=__SETTLEMENT_DEBUG__.getTimingSnapshot({includeArtwork:true}),seal=document.querySelector('[data-testid=debug-open]');
    const row={time:began,version:s.version,mainReady:s.map?.artReady,mainPrepared:s.map?.artPrepared,
      decisionReady:s.life?.decisionArtReady,decisionPrepared:s.life?.decisionArtPrepared,
      publishedGroups:s.artwork?.groups?.filter(g=>g.drawingAvailable===true).map(g=>g.id)??null,
      sealReady:seal?.dataset.artworkReady==='true',revealInput:a.revealInput};
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
function installEarlyAssetAttemptWitness(source){
  const attempt=()=>{
    if(!globalThis.PIXI?.Assets?.load||!globalThis.__HC_ART__)return;
    Function(`(${source})()`)();document.removeEventListener('load',attempt,true);
  };
  document.addEventListener('load',attempt,true);document.addEventListener('DOMContentLoaded',attempt,{once:true});attempt();
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
  await page.addInitScript(installEarlyAssetAttemptWitness,installAssetAttemptWitness.toString());
  await page.addInitScript(()=>localStorage.setItem('dev.progressiveArtwork','on'));
  // Entry preparation can reuse an initial lazy resource load. Capture both
  // phases rather than installing a hook too late and missing its first call.
  const original=await readFile(path.join(config.dist,build.bundle),'utf8');
  const variant=instrumentArtworkBundle(original,{tracePublication:config.tracePublication,allowFault:caseId==='early-publication'});
  const appVariant={originalSha256:hash(original),servedSha256:hash(variant.body),tracePublication:variant.tracePublication,
    localFaultApi:variant.allowFault,scope:variant.scope};
  (manifest.caseVariants??={})[caseId]=appVariant;
  await writeFile(path.join(output,`${caseId}-observer-prefix.js`),variant.prefix);
  await writeFile(path.join(output,`${caseId}-control-extension.js`),variant.extension);
  if(variant.body!==original)await page.route(new URL(build.bundle,url).href,async route=>{
    await page.waitForFunction(()=>globalThis.PIXI?.Assets?.load);
    await page.evaluate(installAssetAttemptWitness);
    await route.fulfill({contentType:'text/javascript',body:variant.body});
  });
  return {caseId,launchId:`${runId}:${caseId}:browser`,context,page,cdp,errors,consoleErrors,requests,appVariant,calibrations:[],expectedFaults:[]};
}
async function condition(fn,arg,{terminal=false,key='wait',timeout=config.timeoutMs}={}) {
  const h=await currentPage.waitForFunction(({source,arg,terminal,key})=>__HC__.probe(()=>Function('arg',`return (${source})(arg)`)(arg),{key,terminal}),
    {source:fn.toString(),arg,terminal,key},{polling:'raf',timeout});
  const result=await h.jsonValue();await h.dispose();return result;
}
async function compactSnapshot() {return currentPage.evaluate(()=>{
  const s=__SETTLEMENT_DEBUG__.getTimingSnapshot({includeArtwork:true});
  return {...s,time:performance.now(),sealReady:document.querySelector('[data-testid=debug-open]')?.dataset.artworkReady==='true'};
});}
function assertUnrevealed(s,label) {return assertArtworkPublication(s,artworkBaseline.groups);}
function assertPrepared(s) {return assertArtworkPublication(s,artworkBaseline.groups,{prepared:true});}
async function resolvePoint(s,method,arg) {
  assert.equal(await currentPage.evaluate(()=>!!__HC__.active),false,'legacy geometry calibration is outside clocks');
  const began=await currentPage.evaluate(()=>performance.now());
  const p=await currentPage.evaluate(({method,arg})=>__SETTLEMENT_DEBUG__[method](arg),{method,arg});assert.ok(p,`${method} control exists`);
  const bounds=await currentPage.locator('canvas').boundingBox();assert.ok(bounds);
  const point={x:bounds.x+p.x*bounds.width/2424,y:bounds.y+p.y*bounds.height/1080};
  s.calibrations.push({method,arg,point,began,ended:await currentPage.evaluate(()=>performance.now()),
    scope:'untimed geometry; legacy getters/toGlobal may synchronize state/transforms; not certified neutral'});
  return point;
}
async function clickResolved(point,{double=false}={}){
  if(config.population==='desktop'){
    if(double)await currentPage.mouse.dblclick(point.x,point.y,{delay:80});else await currentPage.mouse.click(point.x,point.y);
  }else{
    await currentPage.touchscreen.tap(point.x,point.y);
    if(double){await delay(80);await currentPage.touchscreen.tap(point.x,point.y);}
  }
}
async function activate(id){
  const target=currentPage.getByTestId(id);if(config.population==='desktop')await target.click();else await target.tap();
}
async function record(s,step,body,{startNow=false,fault='none',timeoutMs=config.timeoutMs,oracle}={}) {
  const header={runId,job:'J8',step,launchId:s.launchId,observationId:`${runId}:art-${++operationId}`,
    buildId:manifest.buildId,harnessId:manifest.harnessId,measurementContractId:manifest.measurementContractId,
    fixture:'prepared:seed123',population:{layout:config.population,cpuRate:config.population==='mobile4'?4:1,
      cache:'browser-cold',artwork:s.artwork??'progressive',instrumentation:config.instrumentation,fault,
      publicationWitness:config.tracePublication?'private-set':'sampled',appVariantSha256:s.appVariant.servedSha256},kind:'validity-control'};
  const hostEnd=performance.now()+timeoutMs+5000;
  const bounded=(promise,label)=>withDeadline(promise,Math.max(1,hostEnd-performance.now()),`${step} ${label}`);
  let armed=false,completedTiming;
  try{
    await bounded(currentPage.evaluate(({name,timeoutMs,startNow})=>__HC__.arm({name,timeoutMs,startNow}),{name:step,timeoutMs,startNow}),'arm');armed=true;
    const witness=await bounded(body(),'body');const timing=completedTiming=await bounded(currentPage.evaluate(w=>__HC__.finish(w),witness),'finish');
    assert.ok(startNow||timing.trustedInput,'real trusted input required');
    const oracleStart=oracle?await currentPage.evaluate(()=>performance.now()):null;
    const correctness=oracle?await bounded(oracle(witness,timing),'untimed correctness oracle'):null;
    const oracleEnd=oracle?await currentPage.evaluate(()=>performance.now()):null;
    const row={...header,ok:true,...timing,untimedOracle:correctness,
      untimedOracleWindow:oracle?{startMs:oracleStart,endMs:oracleEnd}:null};
    observations.push(row);await appendFile(path.join(output,'observations.jsonl'),JSON.stringify(row)+'\n');return row;
  }catch(error){
    const timing=completedTiming??(armed?await withDeadline(currentPage.evaluate(e=>__HC__.cancel(e),error.message),5000,'failed artwork operation cancellation').catch(()=>null):null);
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
  const setup=await s.page.evaluate(()=>{
    const api=__SETTLEMENT_DEBUG__;
    if(api.getTimingSnapshot().version!==2)throw new Error('passive DTO v2 required');
    if(!__HC_ART__.assetWitnessInstalled)throw new Error('asset-attempt witness missed app initialization');
    for(const name of ['getSnapshot','getWorldMapClickPoint','getNavigationClickPoint','getTimeActionClickPoint']){
      const original=api[name];api[name]=(...args)=>{
        if(__HC__.active)throw new Error(`intrusive ${name} under artwork clock`);return original(...args);
      };
    }
    return {passiveVersion:api.getTimingSnapshot().version,assetWitnessInstalled:true};
  });
  s.setup=setup;
}
async function openingReady() {
  await condition(()=>document.querySelector('[data-testid=game-menu]')?.hidden===true
    &&globalThis.__SETTLEMENT_DEBUG__?.getTimingSnapshot().opening?.phase==='completed');
  return condition(()=>{
    const s=__SETTLEMENT_DEBUG__.getTimingSnapshot(),o=s.opening;
    return s.version===2&&o.phase==='completed'&&Number.isFinite(o.lossSec)&&o.lossSec>0
      &&o.coverageSec>=o.lossSec&&o.elapsedSec===5&&s;
  },null,{terminal:true,key:'full-opening-ready'});
}
async function present(s){
  // The navigation dock is hidden in the menu. Calibrate only after entry,
  // outside its clock; full click-to-art-ready span is retained independently.
  const p=await resolvePoint(s,'getTimeActionClickPoint');
  return record(s,'opening-to-responsive-present',async()=>{
    await clickResolved(p);
    return condition(()=>{
      const x=__SETTLEMENT_DEBUG__.getTimingSnapshot();return x.mode==='map'&&x.map.visible
        &&!x.map.focusAnimating&&x.runner.viewedSec===x.runner.frontierSec&&x;
    },null,{terminal:true,key:'actual-present'});
  });
}
async function navigation(s,label) {
  const region=preparedPacket.stateData.civilization.capitalRegionId;
  assert.ok(region,'frozen logical start has a real capital settlement');
  const regionPoint=await resolvePoint(s,'getWorldMapClickPoint',region);
  await record(s,`${label}-settlement-open`,async()=>{
    await clickResolved(regionPoint,{double:true});
    return condition(id=>{const x=__SETTLEMENT_DEBUG__.getTimingSnapshot();
      return x.mode==='settlement'&&!x.map.focusAnimating&&x.selectedRegionId===id&&x;
    },region,{terminal:true,key:`settlement-open:${region}`});
  });
  const mapPoint=await resolvePoint(s,'getNavigationClickPoint','map');
  await record(s,`${label}-map-return`,async()=>{
    await clickResolved(mapPoint);
    return condition(()=>{const x=__SETTLEMENT_DEBUG__.getTimingSnapshot();return x.mode==='map'&&x.map.visible&&!x.map.focusAnimating&&x;},
      null,{terminal:true,key:'map-return'});
  });
}
async function drawingParity(snapshot){
  if(!config.tracePublication)return {available:false,scope:'unmodified sampled path has no diagnostic drawing export'};
  const parity=await currentPage.evaluate(groups=>{
    if(typeof __HC_ART_DRAW__!=='function')throw new Error('actual drawing resolver export missing');
    const before=__HC_ART__.assetLoadCalls.length;
    const values=groups.map(group=>({id:group.id,expected:group.sampleDrawingAvailable,actual:__HC_ART_DRAW__(group.sampleFile)}));
    if(__HC_ART__.assetLoadCalls.length!==before)throw new Error('prepared representative drawing lookup initiated loading');
    return values;
  },snapshot.artwork.groups.filter(group=>group.sampleFile));
  assert.equal(parity.length,artworkBaseline.groups.length,'actual drawing parity covers every required group');
  for(const group of parity)assert.equal(group.actual,group.expected,`${group.id} actual drawing lookup matches publication metadata`);
  return {available:true,parity,scope:'prepared representative frames in the actual resolver; no per-frame pixel equivalence claim'};
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
  const last=await s.page.evaluate(()=>__HC__.operations.at(-1)?.finished??null);
  const anchor=Math.max(last??0,...s.expectedFaults.map(f=>f.to));
  assert.ok(anchor>0,'artwork observation has an actual completed marker');
  await withDeadline(s.page.evaluate(async anchor=>{
    const remain=anchor+2500-performance.now();if(remain>0)await new Promise(resolve=>setTimeout(resolve,remain));
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  },anchor),10000,'artwork post-action frame window');
  const continuous=await s.page.evaluate(({anchor})=>({
    session:__HC__.readContinuousWindow({startMs:__HC_ART__.startInput,endMs:performance.now()}),
    postAction:__HC__.readContinuousWindow({startMs:anchor,endMs:anchor+2500}),
  }),{anchor});
  const witness=await s.page.evaluate(()=>({...__HC_ART__,resources:performance.getEntriesByType('resource').filter(e=>e.name.includes('/sprite-sheets/'))
    .map(e=>({name:e.name,start:e.startTime,duration:e.duration,responseEnd:e.responseEnd,transferSize:e.transferSize}))}));
  assert.equal(witness.droppedSamples,0,'no silently dropped artwork oracle samples');
  const expectedAt=(time,prefix)=>s.expectedFaults.some(f=>time>=f.from&&time<=f.to&&(prefix===undefined||f.prefix===prefix));
  const prematureSamples=witness.samples.filter(x=>x.revealInput===null
    &&(x.mainReady||x.decisionReady||x.publishedGroups?.length)&&!expectedAt(x.time));
  assert.equal(prematureSamples.length,0,'passive samples found unexpected pre-input terrain/atlas publication');
  for(const event of witness.publicationEvents)assert.equal(typeof event.prefix,'string','private mutation identity is explicit');
  const preInput=witness.publicationEvents.filter(e=>e.kind==='publish'&&e.time>=witness.startInput
    &&(witness.revealInput===null||e.time<witness.revealInput));
  assert.equal(preInput.filter(e=>!expectedAt(e.time,e.prefix)).length,0,'private Set trace found unexpected publication, including between samples');
  for(const fault of s.expectedFaults)if(config.tracePublication)
    assert.equal(preInput.filter(e=>e.prefix===fault.prefix&&e.time>=fault.from&&e.time<=fault.to).length,1,
      'declared actual early-publication fault has exactly one traced mutation');
  const nonresourceFiles=artworkBaseline.groups.flatMap(g=>g.files);
  const actualLoads=witness.assetLoadCalls.filter(call=>call.time>=witness.startInput&&call.paths.some(p=>
    nonresourceFiles.some(file=>new URL(p,url).pathname.endsWith(`/sprite-sheets/${file}`))));
  const firstActualLoad=actualLoads.length?Math.min(...actualLoads.map(c=>c.time)):null;
  const preparationTiming={firstInput:witness.startInput,firstActualNonresourceAssetCall:firstActualLoad,
    sealReady:witness.firstReadyAt,sealReadyFrame:witness.firstReadyFrameAt,
    inputToReadyFrameMs:witness.firstReadyFrameAt===null?null:witness.firstReadyFrameAt-witness.startInput,
    actualAssetCallToReadyFrameMs:firstActualLoad===null||witness.firstReadyFrameAt===null?null:witness.firstReadyFrameAt-firstActualLoad,
    scope:'full click span and first actual nonresource Assets.load call through stable ready-seal frame opportunity; not worker CPU/GPU idle/physical scanout'};
  if(s.artwork==='progressive'&&s.caseId!=='exhausted'){
    assert.ok(firstActualLoad!==null&&witness.firstReadyFrameAt!==null,'successful preparation retains actual work start and ready frame');
    assert.ok(preparationTiming.actualAssetCallToReadyFrameMs>=0,'preparation clock does not end before work starts');
  }
  assert.deepEqual(s.errors,[],'no unhandled product page error');
  const result={case:s.caseId,...details,witness,preparationTiming,continuous,calibrations:s.calibrations,
    observationAvailability:{passiveSamples:config.instrumentation,privateMutationTrace:config.tracePublication,
      resourceObserver:config.instrumentation,frames:config.instrumentation},
    expectedFaults:s.expectedFaults,appVariant:s.appVariant,errors:s.errors,consoleErrors:s.consoleErrors,requestFailures:s.requests};
  await writeFile(path.join(output,`${s.caseId}.json`),JSON.stringify(result,null,2));results.push({case:s.caseId,ok:true,detailsFile:`${s.caseId}.json`});
}
async function earlyPublicationControl(s,prepared){
  assertPrepared(prepared);
  const mutation=await s.page.evaluate(()=>__HC_ART_MUTANT__.publish());
  let restored;
  try{
    await withDeadline(s.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))),5000,'actual early-publication frame');
    const bad=await compactSnapshot();
    assert.equal(bad.map.artReady,false);assert.equal(bad.life.decisionArtReady,false,'terrain-only oracle would miss this fault');
    assert.equal(mutation.beforeDrawing,false);assert.equal(mutation.afterDrawing,true,'actual drawing resolver publishes the loaded HUD frame');
    let rejection;
    try{assertPrepared(bad);}catch(error){rejection=error.message;}
    assert.match(rejection??'',/premature non-resource publication chronicleHudFrames/,'same normal endpoint oracle rejects the real visibility fault');
    const parity=await drawingParity(bad);
    restored=await s.page.evaluate(()=>__HC_ART_MUTANT__.restore());
    s.expectedFaults.push({kind:'deliberate early non-terrain publication',prefix:mutation.prefix,from:mutation.from,to:restored.to});
    const after=await compactSnapshot();assertPrepared(after);
    return {mutation,rejection,parity,restored,after,
      scope:'expected negative-control rejection, not a passing product or timing sample'};
  }finally{if(!restored)await s.page.evaluate(()=>__HC_ART_MUTANT__.restore()).catch(()=>{});}
}
async function stagedAndReveal(s,{held=false,gate,release}={}) {
  // The explicit negative-control population follows the real artwork-off
  // entry path, so the expected progressive atlas request never occurs.
  await menu(s,{progressive:!config.controlNoRequest});
  await record(s,'performance-entry-full-opening',async()=>{
    await activate('game-new-performance');return openingReady();
  },{fault:held?'deferred-atlas':'none'});
  await present(s);
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
      return condition(()=>{const x=__SETTLEMENT_DEBUG__.getTimingSnapshot();
        return document.querySelector('[data-testid=debug-open]')?.dataset.artworkReady==='true'
          &&x.map.artPrepared===true&&x.life.decisionArtPrepared===true&&x.map.artReady===false&&x.life.decisionArtReady===false;
      },null,{terminal:true,key:'art-prepared'});
    },{startNow:true,fault:'atlas-held-then-200ms-delay',oracle:async()=>assertPrepared(await compactSnapshot())});
    assert.ok(deferred.elapsedMs>=190,'actual deferred response cannot be bypassed by an early ready result');
  }else await record(s,'remaining-background-wait-to-prepared',()=>condition(()=>{
    const x=__SETTLEMENT_DEBUG__.getTimingSnapshot();return document.querySelector('[data-testid=debug-open]')?.dataset.artworkReady==='true'
      &&x.map.artPrepared===true&&x.life.decisionArtPrepared===true&&x.map.artReady===false&&x.life.decisionArtReady===false;
  },null,{terminal:true,key:'art-prepared'}),{startNow:true,oracle:async()=>assertPrepared(await compactSnapshot())});
  const prepared=await compactSnapshot();assertPrepared(prepared);
  const hiddenDrawingParity=await drawingParity(prepared);
  const uploaded=await uploadedAtlases();assert.ok(uploaded.every(a=>a.valid&&a.uploaded),'every registered atlas is decoded and GPU-uploaded before ready');
  memory.push({stage:'prepared-hidden',...await s.cdp.send('Runtime.getHeapUsage')});
  await s.page.screenshot({path:path.join(output,`${s.caseId}-prepared-hidden.png`)});
  if(s.caseId==='early-publication'){
    const expectedRejection=await earlyPublicationControl(s,prepared);
    await finishSession(s,{prepared,hiddenDrawingParity,uploaded,memory,expectedRejection});return;
  }
  await record(s,'explicit-reveal',async()=>{
    await activate('debug-open');
    return condition(()=>{const x=__SETTLEMENT_DEBUG__.getTimingSnapshot();return x.map.artReady===true
      &&x.life.decisionArtReady===true&&document.querySelector('[data-testid=debug-open]')?.dataset.artworkReady==='false'&&x;
    },null,{terminal:true,key:'art-published'});
  },{oracle:async()=>assertArtworkPublication(await compactSnapshot(),artworkBaseline.groups,{revealed:true})});
  const revealed=await compactSnapshot();assertArtworkPublication(revealed,artworkBaseline.groups,{revealed:true});
  const visibleDrawingParity=await drawingParity(revealed);
  await s.page.screenshot({path:path.join(output,`${s.caseId}-revealed.png`)});
  memory.push({stage:'revealed',...await s.cdp.send('Runtime.getHeapUsage')});
  for(let block=0;block<2;block++){
    for(let n=0;n<config.navigationCycles;n++)await navigation(s,`revealed-${block}-${n}`);
    memory.push({stage:`navigation-block-${block+1}`,operations:2*config.navigationCycles,...await s.cdp.send('Runtime.getHeapUsage')});
  }
  await finishSession(s,{prepared,revealed,hiddenDrawingParity,visibleDrawingParity,uploaded,memory,
    memoryPolicy:'raw JS heap, same settled map endpoint, no forced GC; one run cannot establish retained-memory growth or tails',
    samplingPolicy:'250ms passive snapshots optional; all-group endpoints retained off; private-Set trace records transient unhide writes when enabled; overhead/A-A proof pending'});
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
    }else if(caseId==='reference'||caseId==='early-publication') await stagedAndReveal(s);
    else if(caseId==='retry') {
      let blocked=true,count=0;
      await s.page.route('**/sprite-sheets/resource-language.png',route=>{if(blocked){count++;return route.abort('failed');}return route.continue();});
      await menu(s,{progressive:false});
      await record(s,'required-asset-failure-detected',async()=>{
        await activate('game-new-performance');
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
        await activate('game-loading-retry');return openingReady();
      },{fault:'required-resource-restored'});
      await present(s);
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
        await activate('game-new-performance');await openingReady();
        return condition(()=>__HC_ART__.warnings.some(w=>/Artwork could not be loaded.*full-map-content-prototype/.test(w.text)),null,{terminal:true,key:'progressive-error'});
      },{fault:'progressive-required-atlas-exhausted'});
      await present(s);
      assert.ok(count>0,'real progressive HTTP failure exercised');
      const automaticAttempts=assertRetryBatches(await assetAttempts('full-map-content-prototype.json'),
        {maxInvocations:1,label:'progressive full-map loading'});
      const state=await compactSnapshot();assertUnrevealed(state,'failed progressive artwork');assert.equal(state.sealReady,false);
      assert.throws(()=>assertPrepared(state),'actual missing required art fails successful-preparation oracle');
      await navigation(s,'after-progressive-art-failure');
      const remaining=atlasFiles.filter(f=>f!=='full-map-content-prototype.json');
      await condition(({files,source})=>Function(`return (${source})`)()(files).every(a=>a.valid&&a.uploaded),
        {files:remaining,source:inspectAtlasUploads.toString()},{key:'other-progressive-groups-uploaded'});
      const after=await compactSnapshot();assertUnrevealed(after,'after failed-art navigation');assert.equal(after.sealReady,false);
      assert.equal((await assetAttempts('full-map-content-prototype.json')).length,automaticAttempts.calls.length,
        'drawing/navigation after exhaustion cannot restart automatic attempts');
      await finishSession(s,{automaticHttpFailures:count,automaticAttempts,state,after,
        manualRetry:'unavailable: progressive error is console warning; no product retry affordance is invented or required by this control'});
    }
  }catch(error){
    caseFailures.push({case:caseId,error:error.message,detailsFile:`${caseId}-failure.json`});
    await withDeadline(s.page.screenshot({path:path.join(output,`${caseId}-failure.png`)}),5000,'failed artwork screenshot').catch(()=>{});
    const passive=await withDeadline(compactSnapshot(),5000,'failed artwork passive state').catch(()=>null);
    await writeFile(path.join(output,`${caseId}-failure.json`),JSON.stringify({error:error.stack,passive,errors:s.errors,consoleErrors:s.consoleErrors,requestFailures:s.requests},null,2));
    throw error;
  }finally{await s.context.close();await browser.close();browser=null;}
}
try{
  await verifyServer();
  for(const caseId of config.cases)await runCase(caseId);
  assert.equal(results.length,config.cases.length,'every requested control case must actually complete');
}catch(error){failed=true;console.error(`[artwork-controls] FAIL ${error.message}; details=${output}`);}
finally{
  await browser?.close();server.kill();manifest.finished=new Date().toISOString();manifest.failed=failed;
  await writeFile(path.join(output,'manifest.json'),JSON.stringify(manifest,null,2));
  await writeFile(path.join(output,'summary.json'),JSON.stringify({ok:!failed,results,observations:observations.length,
    failures:observations.filter(x=>!x.ok).length,caseFailures,requestedCases:config.cases.length,completedCases:results.length,scope:manifest.scope},null,2));
}
console.log(`[artwork-controls] ${failed?'FAILED':'completed'} cases=${results.length}/${config.cases.length} observations=${observations.length} path=${output}`);
process.exitCode=failed?1:0;
