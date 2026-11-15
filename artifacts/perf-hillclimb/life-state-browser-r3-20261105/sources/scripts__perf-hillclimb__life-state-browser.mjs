import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawn,execFileSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';
import {BROWSER_PROBE_LAUNCH_OPTIONS} from '../browser-probe-config.mjs';
import {SAVE_DATABASE_NAME} from '../../src/controllers/sim-runner/save-storage.js';
import {installSave} from './browser-runtime.mjs';
import {loadFrozenLifeOracle,sha256,DEFAULT_BASE,BASE_PIN} from './frozen-life-oracle.mjs';
import {createLifeExpectations,assertExactState,assertExact,planningPause} from './frozen-life-expectations.mjs';
import {expectedOpeningKnowledge} from './save-state-oracle.mjs';
import {lifeStateResponse,token} from './life-state-controls.mjs';
import {installScrubInputObservation} from './main-job-oracles.mjs';
const args=Object.fromEntries(process.argv.slice(2).map(a=>{const[k,...v]=a.replace(/^--/,'').split('=');return[k,v.join('=')];}));assert.ok(args.id);
const output=path.resolve(`artifacts/perf-hillclimb/${args.id}`);await mkdir(output);
const save=async(f,v)=>writeFile(`${output}/${f}`,JSON.stringify(v,null,2));
const manifest={phaseA:'NOT SOUND',comparisonEligible:false,id:args.id,date:new Date().toISOString(),machine:{hostname:os.hostname(),os:os.release(),cpu:os.cpus()[0].model,node:process.version},head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),branch:execFileSync('git',['branch','--show-current'],{encoding:'utf8'}).trim(),sources:{},assets:{},scope:'Life correctness diagnostics only; no latency/frame/heap acceptance observations'};
const files=execFileSync('rg',['--files','src','scripts'],{encoding:'utf8'}).trim().split(/\r?\n/).map(f=>f.replaceAll('\\','/')).sort();files.push('package.json','package-lock.json');await mkdir(`${output}/sources`);
for(const f of files){const bytes=await readFile(f);manifest.sources[f]=sha256(bytes);}
for(const f of files.filter(f=>f.includes('life-state-')||['src/controllers/life-decision-controller.js','src/views/vassal-node-decision-modal-pixi.js','src/views/ui-root/settlement-debug-api.js','src/views/ui-root-settlement-pixi.js'].includes(f)))await writeFile(`${output}/sources/${f.replaceAll('/','__')}`,await readFile(f));
const build=JSON.parse(await readFile('dist/build-manifest.json'));manifest.build=build;
for(const k of ['bundle','worker','saveLoadWorker','stylesheet'])manifest.assets[k]={file:build[k],sha256:sha256(await readFile(path.join('dist',build[k])))};
const original=await readFile(path.join('dist',build.bundle),'utf8');
const standard=lifeStateResponse(original),twin=lifeStateResponse(original,{removeSourceGuard:true});await writeFile(`${output}/response.js`,standard.mutant);await writeFile(`${output}/response-twin.js`,twin.mutant);await save('response-identity.json',standard.identity);await save('response-twin-identity.json',twin.identity);
const frozen=await loadFrozenLifeOracle({manifest:'artifacts/perf-hillclimb/frozen-life-oracle-20261105-r7/addendum/manifest.json',expectedIdentity:'6b7456c5594cf05393b81c16a3cfc3682bff8c92fbba8821bfe8af16e911d8b8',baseManifest:DEFAULT_BASE,expectedBaseIdentity:BASE_PIN});manifest.frozen={base:BASE_PIN,addendum:frozen.manifest.identity,integrity:frozen.integrity};
const cells=[];for(const seed of (args.seeds??'123,424242,99117').split(',').map(Number))for(const population of (args.populations??'desktop,mobile4').split(','))cells.push({seed,population,mode:'positive'});
if(args.controls!=='off')for(const mode of ['mutation','guard-twin'])cells.push({seed:123,population:'desktop',mode});
manifest.schedule=cells;await save('manifest.json',manifest);
const server=spawn(process.execPath,['node_modules/serve/bin/serve.js','-l','18246','--no-clipboard','dist'],{stdio:'ignore',windowsHide:true});const url='http://127.0.0.1:18246/';let browser;const results=[];
try{
 for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{}await delay(100);}
 assert.deepEqual(await(await fetch(url+'build-manifest.json')).json(),build);
 for(const asset of Object.values(manifest.assets))assert.equal(sha256(Buffer.from(await(await fetch(new URL(asset.file,url))).arrayBuffer())),asset.sha256);
 for(const [index,cell]of cells.entries()){
  const dir=`${index}-${cell.seed}-${cell.population}-${cell.mode}`;await mkdir(`${output}/${dir}`);const put=(name,value)=>save(`${dir}/${name}.json`,value);let page;const costs=[],errors=[],triggers=[];
  console.log(`[life-state] ${index+1}/${cells.length} ${cell.seed}/${cell.population}/${cell.mode}`);
  try{
   const e=createLifeExpectations(frozen,cell.seed),fixture=frozen.fixturesFor(cell.seed).selected,inputHash=sha256(fixture.text);
   const terminals={};for(const n of [1,2,5])terminals[n]=expectedOpeningKnowledge(frozen.oracle,e.logical[n]);
   await put('frozen-expected',{trace:e.trace,nodeId:e.nodeId,offerId:e.offerId,offerIndex:e.offerIndex,targetSec:e.targetSec,entered:e.enteredPaused,staged:e.staged,accepted:e.accepted,adopted:e.adopted,ready:e.history,committed:e.committed,decision:e.stagedDecision,terminals});
   browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);manifest.chromium=browser.version();const mobile=cell.population==='mobile4';const context=await browser.newContext({viewport:mobile?{width:844,height:390}:{width:1280,height:800},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});page=await context.newPage();page.setDefaultTimeout(180000);page.on('pageerror',x=>errors.push(x.message));
   await page.route(new URL(build.bundle,url).href,route=>route.fulfill({status:200,contentType:'text/javascript',body:cell.mode==='guard-twin'?twin.mutant:standard.mutant}));
   await page.addInitScript(({token,nodeId,mutateDraft})=>{globalThis.__HC_LIFE_STATE__={token,nodeId,mutateDraft,events:[],knowledge:[],changedCalls:0,gateRejections:[]};localStorage.setItem('dev.progressiveArtwork','off');},{token,nodeId:e.nodeId,mutateDraft:cell.mode==='mutation'});
   const cdp=await context.newCDPSession(page);if(mobile)await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
   await page.goto(url+'__harness_fixture_setup__');await page.evaluate(installSave,{database:SAVE_DATABASE_NAME,slot:1,text:fixture.text,meta:fixture.meta});await page.goto(url+'?dev=1&art=0');await page.getByTestId('game-new').waitFor();await page.waitForFunction(()=>document.querySelector('[data-testid=game-new]')?.disabled===false);
   await (mobile?page.getByTestId('game-continue').tap():page.getByTestId('game-continue').click());
   const timing=()=>page.evaluate(()=>__SETTLEMENT_DEBUG__.getTimingSnapshot({includeProjectionSource:true}));
   const wait=async(fn,arg)=>page.waitForFunction(({fn,arg})=>{const s=globalThis.__SETTLEMENT_DEBUG__?.getTimingSnapshot({includeProjectionSource:true});return s&&eval('('+fn+')')(s,arg);},{fn:fn.toString(),arg});
   await wait((s,loss)=>s.mode==='map'&&s.graph.computedSec>=loss&&s.graph.projection.signatureMatches===true&&s.graph.projection.timelineToken===s.graph.asyncToken,terminals[1].lossSec);
   await page.waitForFunction(()=>__HC_LIFE_STATE__.knowledge.length>0);
   const canvas=await page.locator('canvas').boundingBox();assert.ok(canvas);
   const click=async(p)=>{assert.ok(p,'real input control exists');const x=canvas.x+p.x*canvas.width/2424,y=canvas.y+p.y*canvas.height/1080;if(mobile)await page.touchscreen.tap(x,y);else await page.mouse.click(x,y);triggers.push({kind:'trusted-click',point:p});};
   const point=(method,arg)=>page.evaluate(({method,arg})=>__SETTLEMENT_DEBUG__[method](arg),{method,arg});
   const inspect=async(tag)=>{const hs=performance.now();const read=await page.evaluate(nodeId=>{const startMs=performance.now(),before=__SETTLEMENT_DEBUG__.getTimingSnapshot({includeProjectionSource:true});const life=__SETTLEMENT_DEBUG__.inspectRetainedLifePreparation({nodeId}),decision=__SETTLEMENT_DEBUG__.inspectRetainedLifeDecision(),runner=__SETTLEMENT_DEBUG__.inspectRetainedStates();const after=__SETTLEMENT_DEBUG__.getTimingSnapshot({includeProjectionSource:true});return{life,decision,runner,before,after,startMs,endMs:performance.now()};},e.nodeId);costs.push({tag,hostRpcMs:performance.now()-hs,readerCpuMs:read.endMs-read.startMs,startMs:read.startMs,endMs:read.endMs});await put(tag,read);assertExact(read.before,read.after,'source correspondence before/after strict readers');return read;};
   // The initial strict read precedes all legacy full snapshots/getters.
   await inspect('initial');
   await click(await point('getTimeActionClickPoint'));await wait(s=>s.runner.viewedSec===s.runner.frontierSec&&!s.runner.previewActive);
   await inspect('initial-present');
   await click(await point('getNavigationClickPoint','life')??await point('getNavigationClickPoint','vassal'));await wait(s=>s.mode==='vassalLife'&&s.life.visible);
   await click(await point('getLifeMapNodeClickPoint',e.nodeId));await wait((s,n)=>s.life.selectedCandidateNodeId===n&&!s.life.decisionOpen,e.nodeId);
   await click(await point('getLifeMapEnterNodeClickPoint'));await wait(s=>s.life.entryConfirmationOpen&&s.life.entryPhase==='open');
   await click(await point('getLifeMapEnterNodeClickPoint'));await wait((s,n)=>s.life.decisionOpen&&s.life.decisionNodeId===n&&s.life.decisionPhase==='open'&&!s.life.processing.jobActive,e.nodeId);
   const entered=await inspect('entered');
   // Legacy geometry is used only after the strict retained read, untimed.
   const geometry=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision);const categoryIndex=geometry.shopTagChoices.findIndex(x=>x.id===e.category.optionId);assert.ok(categoryIndex>=0);
   await click(geometry.shopTagConfirmPoints[categoryIndex]);await wait((s,tag)=>s.life.shopTag===tag&&s.life.processing.draftActionCount===1,e.category.optionId);
   const category=await inspect('category');assert.equal(category.decision.lastDecision.offers[e.offerIndex].offerId,e.offerId);
   await click(await point('getLifeMapOfferClickPoint',e.offerIndex));await page.mouse.move(0,0);await wait((s,id)=>s.life.purchaseOrder?.length===1&&s.life.purchaseOrder[0]===id&&s.life.processing.draftActionCount===2,e.offerId);
   const staged=await inspect('staged');
   await click(await point('getLifeMapConfirmClickPoint'));await wait((s,t)=>s.life.recapOpen&&s.runner.frontierSec===t&&!s.life.processing.jobActive,e.targetSec);
   const committed=await inspect('committed');
   await wait(s=>s.life.recapClock?.locked===true);await click(await point('getLifeMapRecapDismissClickPoint'));await wait(s=>!s.life.recapOpen);
   await click(await point('getNavigationClickPoint','map'));await wait(s=>s.mode==='map'&&s.map.visible);
   const histories=[];
   for(const second of [16,17]){
    await page.evaluate(installScrubInputObservation);
    let p;const at=s=>({x:canvas.x+(s.graph.plotRect.x+s.graph.plotRect.width*(second-s.graph.minSec)/(s.graph.maxSec-s.graph.minSec))*canvas.width/2424,y:canvas.y+(s.graph.plotRect.y+s.graph.plotRect.height*.5)*canvas.height/1080});
    const touch=(type,p)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{id:1,...p,radiusX:1,radiusY:1}]});
    p=at(await timing());if(mobile)await touch('touchStart',p);else{await page.mouse.move(p.x,p.y);await page.mouse.down();}
    for(let i=0;i<6;i++){p=at(await timing());if(mobile)await touch('touchMove',p);else await page.mouse.move(p.x,p.y);}
    if(mobile)await touch('touchEnd',p);else await page.mouse.up();
    await wait((s,t)=>s.runner.viewedSec===t&&!s.runner.forecastPreview,second);
    const input=await page.evaluate(()=>{__HC_SCRUB_INPUT__.stop();return __HC_SCRUB_INPUT__.events;});assert.ok(input.some(x=>x.type==='pointerdown'));assert.ok(input.every(x=>x.viewedSec<=x.browseCapSec));await put('history-input-'+second,input);
    histories.push({second,actual:await inspect('history-'+second)});
   }
   await click(await point('getTimeActionClickPoint'));await wait((s,t)=>s.runner.viewedSec===t,e.targetSec);const present=await inspect('present');
   const exportStart=performance.now();const evidence=await page.evaluate(()=>__HC_LIFE_STATE__);costs.push({tag:'boundary-evidence-export',hostRpcMs:performance.now()-exportStart});await put('boundary-evidence',evidence);await put('public-triggers',triggers);await put('reader-costs',costs);
   // Knowledge is independently derived from frozen official ticks. The actual
   // callback/action prefix/source trigger determines when that fact can apply.
   for(const k of evidence.knowledge){const count=k.actions.length;assert.ok([1,2,5].includes(count));assertExact(k.actions,e.trace.slice(0,count),'knowledge trigger exact recorded actions');const fact=terminals[count];assert.equal(k.year,fact.lossYear);assert.ok(k.timing.graph.computedSec>=fact.lossSec);assert.equal(k.timing.graph.projection.signatureMatches,true);assert.equal(k.timing.graph.projection.timelineToken,k.timing.graph.asyncToken);}
   const knowledgeAt=ms=>Math.max(1,...evidence.knowledge.filter(k=>k.endMs<=ms).map(k=>terminals[k.actions.length].lossYear));
   const withKnowledge=(state,ms)=>{const x=structuredClone(state);x.persistentKnowledge.maxObservedCivilizationSurvivalYear=Math.max(x.persistentKnowledge.maxObservedCivilizationSurvivalYear,knowledgeAt(ms));return x;};
   const submitted=evidence.events.filter(x=>x.kind==='submitted'),entrySubmitted=submitted[0],confirmSubmitted=submitted[1];assert.equal(submitted.length,2);
   const entryMs=entrySubmitted.startMs,confirmMs=confirmSubmitted.startMs;
   await put('permitted-derivations',{knowledge:evidence.knowledge.map(k=>({actions:k.actions,year:terminals[k.actions.length].lossYear,lossSec:terminals[k.actions.length].lossSec,startMs:k.startMs,endMs:k.endMs,timing:k.timing})),entryCloneMs:entryMs,confirmCloneMs:confirmMs});
   assertExactState(entered.life.draft.stateData,withKnowledge(e.enteredPaused,entryMs));assertExactState(category.life.draft.stateData,withKnowledge(planningPause(frozen.oracle,e.logical[3]),entryMs));assertExactState(staged.life.draft.stateData,withKnowledge(e.staged,entryMs));
   assertExact(staged.life.actions,e.trace.slice(2,4).map(({kind,payload})=>({kind,payload})),'exact pending draft actions');
   const decisionExpected=e.presentation(withKnowledge(e.staged,entryMs),{nodeId:e.nodeId,preview:{previewOptionId:null,previewOfferId:null}});assertExact(staged.decision.lastDecision,decisionExpected,'full actual consumed decision/tableau');assert.equal(staged.decision.dragPreview,null);
   for(const event of evidence.events){assert.equal(event.pure,true);if(event.kind==='accepted-adopted'&&event.life.job.targetSec>0){assertExactState(event.life.job.payload.stateData,withKnowledge(e.enteredPaused,confirmMs));assertExactState(event.life.job.stateData,withKnowledge(e.accepted,confirmMs));assertExactState(event.runner.cursor.stateData,withKnowledge(e.adopted,event.startMs));}
    if(event.kind==='ready'&&event.life.job.targetSec>0)assertExactState(event.life.job.stateData,withKnowledge(e.history,confirmMs));}
   assert.ok(evidence.events.some(x=>x.kind==='ready'&&x.life.job.targetSec===e.targetSec));
   for(const a of [committed,present]){assertExactState(a.runner.cursor.stateData,withKnowledge(e.committed,a.startMs));assert.equal(a.life.job,null);assert.equal(a.runner.cursorIsFrontier,true);}
   for(const {second,actual}of histories){assert.equal(actual.runner.preview,null);assert.equal(actual.runner.cursorIsFrontier,false);assertExactState(actual.runner.cursor.stateData,withKnowledge(planningPause(frozen.oracle,e.replayPrefix(5,second)),actual.startMs));}
   const oldBefore=evidence.events.find(x=>x.kind==='old-message-before'),oldAfter=evidence.events.find(x=>x.kind==='old-message-after');assert.ok(evidence.messagesTested);assert.equal(oldAfter.extra.changedDelta,0);assertExact(oldBefore.life,oldAfter.life,'old Life envelope preserves complete pending body');assertExact(oldBefore.runner,oldAfter.runner);assertExact(oldBefore.timeline,oldAfter.timeline);assert.ok(evidence.gateRejections.length>=4);
   const stale=evidence.staleCommit;assert.equal(stale.retainedReady,true);assert.equal(stale.sourceMatches,false);const zeroCall=()=>{assert.equal(stale.commitCalls,0,'direct stale attempt must make ZERO runner commit calls');};
   if(cell.mode==='guard-twin'){assert.throws(zeroCall);assert.ok(stale.commitCalls>0);}else{zeroCall();assert.equal(stale.result.reason,'resolutionNotReady');assert.equal(stale.changedDelta,0);assert.equal(stale.before,stale.after);}
   if(cell.mode==='mutation'){const m=evidence.draftMutation;assert.ok(m);assert.throws(()=>assertExactState(m.mutant.draft.stateData,withKnowledge(e.staged,entryMs)));assertExact(m.original,m.restored);assert.equal(m.backingBefore,m.backingDuring,'actual draft mutation leaves authoritative/cached-node/payload backing unchanged');}
   assert.equal(sha256(fixture.text),inputHash);assert.deepEqual(errors,[]);results.push({...cell,pass:true,costs});await put('checks',{pass:true,fullStates:true,fullDecision:true,oldMessages:true,staleCommit:true,mutation:cell.mode==='mutation',guardSensitivity:cell.mode==='guard-twin'});
  }catch(error){let passive=null;try{passive=await page?.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__?.getTimingSnapshot({includeProjectionSource:true}));await page?.screenshot({path:`${output}/${dir}/failure.png`});await put('boundary-evidence',await page?.evaluate(()=>globalThis.__HC_LIFE_STATE__));}catch{}
   await put('failure',{message:error.message,stack:error.stack,actual:error.actual,expected:error.expected,errors,passive,costs});results.push({...cell,pass:false,error:error.message.split('\n')[0],costs});console.error(`[life-state] FAIL ${dir}: ${error.message.split('\n')[0]}; ${output}/${dir}/failure.json`);
  }finally{await browser?.close();browser=null;}
  await save('results.json',results);
 }
 const changed=[];for(const file of files)if(sha256(await readFile(file))!==manifest.sources[file])changed.push(file);await save('provenance-after.json',{changed});assert.deepEqual(changed,[],'fixed app/harness executable sources throughout matrix');manifest.completed=new Date().toISOString();await save('manifest.json',manifest);
}finally{await browser?.close();server.kill();}
console.log(`[life-state] ${results.filter(x=>x.pass).length}/${cells.length} PASS; ${output}/results.json`);if(results.some(x=>!x.pass))process.exitCode=1;

