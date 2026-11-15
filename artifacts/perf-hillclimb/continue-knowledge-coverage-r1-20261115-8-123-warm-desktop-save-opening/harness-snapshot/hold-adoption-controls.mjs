import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {spawn,execFileSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import os from 'node:os';
import {chromium} from 'playwright';
import {BROWSER_PROBE_LAUNCH_OPTIONS} from '../browser-probe-config.mjs';
import {digest} from './fixtures.mjs';
import {installRuntime} from './browser-runtime.mjs';
import {installFeedbackObserver} from './feedback-runtime.mjs';
import {installFeedbackBindings} from './feedback-bindings.mjs';
import {collectFeedback} from './feedback-collection.mjs';
import {installNativeFeedback} from './native-feedback.mjs';
import {loadFrozenLifeOracle,DEFAULT_BASE,BASE_PIN} from './frozen-life-oracle.mjs';

const id=process.argv[2],mode=process.argv[3]??'controls';assert.match(id??'',/^[\w-]+$/);
assert.ok(['controls','reference','negative'].includes(mode));
const output=`artifacts/perf-hillclimb/${id}`;await mkdir(output);
const put=(n,v)=>writeFile(`${output}/${n}.json`,JSON.stringify(v,null,2));
const sourceFiles=execFileSync('rg',['--files','src','scripts'],{encoding:'utf8'}).trim().split(/\r?\n/).map(f=>f.replaceAll('\\','/')).sort();
sourceFiles.push('package.json','package-lock.json','docs/performance/perf-hillclimb-20261104/HARNESS.md');
const sources={};for(const f of sourceFiles)sources[f]=digest(await readFile(f));
const build=JSON.parse(await readFile('dist/build-manifest.json')),assets={};
for(const key of ['bundle','worker','saveLoadWorker','stylesheet'])assets[build[key]]=digest(await readFile('dist/'+build[key]));
assets['images/dev-fixtures/performance-start.json.gz']=digest(await readFile('dist/images/dev-fixtures/performance-start.json.gz'));
const frozen=await loadFrozenLifeOracle({manifest:'artifacts/perf-hillclimb/frozen-life-oracle-20261105-r7/addendum/manifest.json',expectedIdentity:'6b7456c5594cf05393b81c16a3cfc3682bff8c92fbba8821bfe8af16e911d8b8',baseManifest:DEFAULT_BASE,expectedBaseIdentity:BASE_PIN});
const populations=['desktop','mobile1','mobile4'];
const controlPlan=populations.flatMap(population=>[
 ...[1,-1].flatMap(direction=>['click','drag'].map(gesture=>({population,direction,gesture}))),
 {population,direction:1,gesture:'playing-no-motion'},
 {population,direction:0,gesture:'held-no-motion'},
 {population,direction:0,gesture:'coast'},
]);
const referencePlan=[123,424242,99117].flatMap(seed=>['desktop','mobile4'].flatMap(population=>['scrub-anchor','scrub-off-anchor','life'].map(job=>({seed,population,job}))));
const negativePlan=[{control:'wrong-target',job:'scrub-anchor',error:'Timeout 1500ms'},
 {control:'stale-generation',job:'map-pan',error:'matching current-generation'},
 {control:'clamp-bypass',job:'scrub-anchor',error:'J5 observed unrevealed browse access'}];
const plan=mode==='controls'?controlPlan:mode==='reference'?referencePlan:negativePlan;
await put('plan',{id,mode,created:new Date().toISOString(),head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
 runtime:{node:process.version,nodeExecutable:digest(await readFile(process.execPath)),playwright:JSON.parse(await readFile('node_modules/playwright/package.json')).version,launch:BROWSER_PROBE_LAUNCH_OPTIONS,machine:os.hostname(),os:os.release(),cpus:os.cpus()[0]?.model},
 sources,assets,build,frozen:{base:BASE_PIN,life:frozen.manifest.identity,integrity:frozen.integrity},plan,
 admission:'Exclusive owned CPU/Node/test/build/browser execution slot. Root metadata-only; inherited5184/other preview5185 preserved. PM reports load finished/no new full-suite load. No simultaneous owned load. No whole-host invisibility claim. Earlier possibly-contended evidence unchanged.',
 scope:mode==='reference'?'Predeclared one independent cold minimal launch per18 cells: all3 seeds x desktop/mobile4 x J5 anchor16/off17 and strict Life/J6 including16/17/Present. Same existing protocol, samples1; failures retained. Scoped current-build reference only, not tail baseline, complete8-job suites, overhead proof or acceptance.': 'Comparison-ineligible Hold mechanism controls; rAF/retained ink is not physical pixels. No scoring/self-audit. Phase A NOT SOUND.'});
async function stable(){const changed=[];for(const [f,h]of Object.entries(sources))if(digest(await readFile(f))!==h)changed.push(f);for(const [f,h]of Object.entries(assets))if(digest(await readFile('dist/'+f))!==h)changed.push('dist/'+f);return changed;}
const results=[];let browser,server;
async function child(argv,stem){
 const {open}=await import('node:fs/promises');const file=await open(`${output}/${stem}.log`,'wx');
 try{return await new Promise((resolve,reject)=>{const p=spawn(process.execPath,argv,{stdio:['ignore',file.fd,file.fd],windowsHide:true});p.once('error',reject);p.once('exit',resolve);});}finally{await file.close();}
}
try{
 if(mode!=='controls'){
  for(const [index,cell]of plan.entries()){
   assert.deepEqual(await stable(),[]);const runId=`${id}-${index}-${cell.job}`;
   const argv=['--experimental-vm-modules','scripts/perf-hillclimb/run.mjs',`--id=${runId}`,`--seed=${cell.seed??123}`,`--population=${cell.population??'desktop'}`,`--jobs=${cell.job}`,
    '--cache=cold','--artwork=off','--samples=1',`--fixture-manifest=${DEFAULT_BASE}`,`--fixture-manifest-id=${BASE_PIN}`];
   if(cell.control)argv.push(`--control=${cell.control}`);
   console.log(`[hold-${mode}] ${index+1}/${plan.length} ${runId}`);
   const started=new Date().toISOString(),exit=await child(argv,String(index));
   const failure=await readFile(`artifacts/perf-hillclimb/${runId}/failure.txt`,'utf8').catch(()=>null);
   let witness=null,pass=exit===(mode==='negative'?1:0)&&(mode!=='negative'||failure?.includes(cell.error));
   if(mode==='negative'){
    const rows=(await readFile(`artifacts/perf-hillclimb/${runId}/observations.jsonl`,'utf8').catch(()=>'')).trim().split('\n').filter(Boolean).map(JSON.parse);
    const row=rows[0];
    if(cell.control==='stale-generation'){
     const fault=JSON.parse(await readFile(`artifacts/perf-hillclimb/${runId}/stale-generation-deliveries.json`));
     const replies=(row?.workerEvents??[]).filter(e=>e.message==='chunkResult'&&e.timelineToken==='stale-control-generation');
     witness={mutated:fault.events.length,replies:replies.length,input:row?.inputTimingSnapshot};
     pass&&=fault.armed&&fault.events.length>0&&replies.length>0&&row?.inputTimingSnapshot.graph.projection.signatureMatches===true;
    }else{
     const diagnostic=JSON.parse(await readFile(`artifacts/perf-hillclimb/${runId}/failure-J5-scrub-anchor.json`));
     const s=diagnostic.actual.passive,input=row?.inputTimingSnapshot;
     witness={viewedSec:s.runner.viewedSec,cap:s.graph.browseCapSec,input};
     pass&&=input?.graph.targetSec>input?.graph.revealedSec&&s.runner.forecastPreview===true;
     pass&&=cell.control==='wrong-target'?s.runner.viewedSec===17:s.runner.viewedSec===3918&&s.graph.browseCapSec<3918;
    }
   }
   results.push({...cell,runId,argv,started,finished:new Date().toISOString(),exit,pass,failure,witness});await put('results',results);
  }
 }else{
  server=spawn(process.execPath,['node_modules/serve/bin/serve.js','-l','18250','--no-clipboard','dist'],{stdio:'ignore',windowsHide:true});
  let ready=false;for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:18250/build-manifest.json')).ok){ready=true;break;}}catch{}await delay(100);}assert.ok(ready);
  const served=await fetch('http://127.0.0.1:18250/build-manifest.json');assert.equal(digest(await served.json()),digest(build));
  for(const population of populations){
   browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);await put(`browser-${population}`,{version:browser.version()});
   const mobile=population!=='desktop',context=await browser.newContext({viewport:mobile?{width:844,height:390}:{width:1280,height:800},hasTouch:mobile,isMobile:mobile});
   const page=await context.newPage();page.setDefaultTimeout(180000);const cdp=await context.newCDPSession(page);if(population==='mobile4')await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(installRuntime,{instrumentation:true});await page.addInitScript(installFeedbackObserver);await page.addInitScript(installFeedbackBindings);await page.addInitScript(installNativeFeedback);
   await page.goto('http://127.0.0.1:18250/?dev=1&art=0');await page.getByTestId('game-developer-tools').locator('summary').click();await page.getByTestId('game-progressive-artwork').setChecked(false);await page.getByTestId('game-new-performance').click();
   await page.waitForFunction(()=>{const s=__SETTLEMENT_DEBUG__.getTimingSnapshot();return document.querySelector('[data-testid=game-menu]')?.hidden&&s.map.visible&&s.opening.phase==='completed'&&s.opening.lossSec>0&&s.opening.coverageSec>=s.opening.lossSec&&s.graph.computedSec>=s.opening.lossSec;});
   const box=await page.locator('canvas').boundingBox(),screen=p=>({x:box.x+p.x*box.width/2424,y:box.y+p.y*box.height/1080});
   const read=()=>page.evaluate(()=>({timing:__SETTLEMENT_DEBUG__.getTimingSnapshot(),retained:__SETTLEMENT_DEBUG__.getRetainedFeedbackSnapshot()}));
   const graphPoint=async ratio=>{const s=await read(),g=s.timing.graph,r=g.plotRect;return screen({x:r.x+r.width*ratio,y:r.y+r.height*.5});};
   const pointer=async(type,p)=>mobile?cdp.send('Input.dispatchTouchEvent',{type:{down:'touchStart',move:'touchMove',up:'touchEnd'}[type],touchPoints:type==='up'?[]:[{id:1,...p,radiusX:1,radiusY:1}]}):type==='down'?(await page.mouse.move(p.x,p.y),page.mouse.down()):type==='move'?page.mouse.move(p.x,p.y):page.mouse.up();
   const tap=async p=>{await pointer('down',p);await pointer('up',p);};
   const lever=async direction=>{const rect=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getTimeLeverScreenRect());await tap(screen({x:rect.x+rect.width/2,y:rect.y+rect.height*(direction>0?.35:.65)}));};
   for(const cell of plan.filter(x=>x.population===population)){
    const index=plan.indexOf(cell);let raw={cell};console.log(`[hold-controls] ${index+1}/${plan.length} ${population}/${cell.gesture}/${cell.direction}`);
    try{
     assert.deepEqual(await stable(),[]);
     await tap(await graphPoint(.5));await delay(150);let setup=await read();
     assert.ok(setup.timing.runner.viewedSec>100&&setup.timing.graph.browseCapSec-setup.timing.runner.viewedSec>100,'room both directions');
     if(cell.direction){await lever(cell.direction);const a=await read();await delay(150);const b=await read();
      raw.speedPrecondition={a,b};assert.equal(Math.sign(b.retained.transport.target),cell.direction);assert.equal(Math.sign(b.retained.transport.current),cell.direction);
      assert.ok((b.retained.transport.visualSec-a.retained.transport.visualSec)*cell.direction>0,'real stable playback motion');assert.notEqual(b.retained.timeControls.lever.label,'HOLD');
     }
     if(cell.gesture==='coast'){
      // Actual sun/moon wheel rotational flick, not a fabricated drag session.
      const disks=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getTimeWheelSnapshot());const disk=disks.season;assert.ok(disk);
      const at=a=>screen({x:disk.x+Math.cos(a)*disk.radius*.85,y:disk.y+Math.sin(a)*disk.radius*.85});
      raw.coastGeometry={disk,box,angles:{start:-2,end:-1.28},radiusFraction:.85};
      await pointer('down',at(-2));for(let i=1;i<=7;i++){await delay(12);await pointer('move',at(-2+i*.09));}
      // CDP touchMove acknowledgement can itself take >80ms on this proxy.
      // Queue the final move and release in protocol order without waiting for
      // that acknowledgement; keep the actual trusted receipts/precondition.
      if(mobile)await Promise.all([pointer('move',at(-1.28)),pointer('up',at(-1.28))]);
      else{await pointer('move',at(-1.28));await pointer('up',at(-1.28));}
      raw.coastPrecondition=await read();assert.equal(raw.coastPrecondition.retained.momentum.coasting,true);assert.ok(Math.abs(raw.coastPrecondition.retained.momentum.velocity)>.1,'genuine nonzero coast');
     }
     const before=await read();raw.before=before;
     const noMotion=cell.gesture.includes('no-motion');
     let p=noMotion?await graphPoint((before.timing.runner.viewedSec-before.timing.graph.minSec)/(before.timing.graph.maxSec-before.timing.graph.minSec)):await graphPoint(.3);
     // Capture raw pre-app transport at the trusted press. A post-dispatch task
     // also records the handler result; neither is substituted for visible ink.
     await page.evaluate(()=>{
      globalThis.__HOLD_INPUT__=[];
      const listener=e=>{if(!e.isTrusted)return;const start=performance.now(),s=__SETTLEMENT_DEBUG__.getRetainedFeedbackSnapshot();
       __HOLD_INPUT__.push({stage:'capture',type:e.type,pointerType:e.pointerType,timeStamp:e.timeStamp,atMs:start,transport:s.transport,momentum:s.momentum,timeControls:s.timeControls,cpuMs:performance.now()-start});
       setTimeout(()=>{const start=performance.now(),s=__SETTLEMENT_DEBUG__.getRetainedFeedbackSnapshot();__HOLD_INPUT__.push({stage:'task',type:e.type,atMs:start,transport:s.transport,momentum:s.momentum,timeControls:s.timeControls,cpuMs:performance.now()-start});},0);
      };globalThis.__STOP_HOLD_INPUT__=()=>{for(const type of ['pointerdown','pointerup'])document.removeEventListener(type,listener,true);};
      for(const type of ['pointerdown','pointerup'])document.addEventListener(type,listener,true);
      const operationId=__HC__.arm({name:'hold-press',event:'pointerdown',timeoutMs:10000});__HC_FEEDBACK__.arm({operationId,binding:'scrub',readCue:()=>__HC_READ_FEEDBACK__('scrub')});
     });
     await pointer('down',p);raw.pressed=await read();
     assert.equal(raw.pressed.retained.transport.target,0);assert.equal(raw.pressed.retained.transport.current,0);assert.equal(raw.pressed.retained.momentum.active,false);
     if(cell.gesture==='drag')for(let i=1;i<=6;i++){p=await graphPoint(.3+i*.03);await pointer('move',p);}
     await pointer('up',p);
     await page.waitForFunction(()=>__HC__.probe(()=>{const s=__SETTLEMENT_DEBUG__.getRetainedFeedbackSnapshot();return s.transport.target===0&&s.transport.current===0&&!s.momentum.active&&s.timeControls.lever.label==='HOLD';},{terminal:true,key:'drawn-hold'}),null,{polling:'raf',timeout:10000});
     raw.host=await page.evaluate(()=>__HC__.finish({hold:true}));raw.feedback=await page.evaluate(collectFeedback,{postCompletionGraceMs:1000});
     raw.released=await read();await delay(350);raw.settled=await read();
     raw.inputs=await page.evaluate(()=>{__STOP_HOLD_INPUT__();return __HOLD_INPUT__;});
     assert.equal(raw.settled.timing.runner.viewedSec,raw.released.timing.runner.viewedSec);assert.equal(raw.settled.retained.transport.target,0);assert.equal(raw.settled.retained.transport.current,0);
     const input=raw.inputs.find(e=>e.stage==='capture'&&e.type==='pointerdown');assert.ok(input);assert.equal(input.pointerType,mobile?'touch':'mouse');
     if(cell.direction)assert.equal(Math.sign(input.transport.current),cell.direction);
     if(cell.gesture==='coast'){assert.equal(input.momentum.coasting,true);assert.ok(Math.abs(input.momentum.velocity)>.1,'nonzero coast at actual press');}
     const drawnBefore=raw.before.retained.timeControls.lever,drawnAfter=raw.settled.retained.timeControls.lever;
     if(cell.gesture==='held-no-motion')assert.equal(drawnBefore.label,drawnAfter.label,'already Hold has no lever cue change');
     if(cell.gesture==='playing-no-motion')assert.notEqual(drawnBefore.label,drawnAfter.label,'playing press responds with actual drawn Hold');
     await lever(1);const resumedA=await read();await delay(150);const resumedB=await read();raw.resume={a:resumedA,b:resumedB};
     assert.ok(resumedB.retained.transport.target>0&&resumedB.retained.transport.current>0);assert.ok(resumedB.retained.transport.visualSec>resumedA.retained.transport.visualSec,'real explicit lever resume moves time');
     raw.functionalPass=true;
     if(!noMotion){assert.equal(raw.feedback.record.phase,'completed');assert.ok(raw.feedback.record.firstFeedbackAtMs>=raw.host.started);}
     assert.deepEqual(errors,[]);raw.pass=true;
    }catch(error){raw.pass=false;raw.error=error.stack;raw.failure=await read().catch(()=>null);await page.evaluate(()=>{globalThis.__STOP_HOLD_INPUT__?.();if(__HC__.active)__HC__.cancel('failed Hold control');if(__HC_FEEDBACK__.status().active)__HC_FEEDBACK__.cancel('failed Hold control');}).catch(()=>{});}
    await put(`${index}-actual`,raw);results.push({...cell,pass:raw.pass,functionalPass:raw.functionalPass===true,feedbackPhase:raw.feedback?.record?.phase??null,error:raw.error??null});await put('results',results);
   }
   await put(`native-${population}`,await page.evaluate(()=>__HC_NATIVE__.stop()));await context.close();await browser.close();browser=null;
  }
 }
}finally{
 await browser?.close();if(server){server.kill();await new Promise(resolve=>{if(server.exitCode!==null)resolve();else server.once('exit',resolve);});}
 const changed=await stable();await put('provenance-after',{changed});await put('cleanup',{browserClosed:!browser?.isConnected(),ownedServerClosed:!server||server.exitCode!==null||server.signalCode!==null,at:new Date().toISOString()});assert.deepEqual(changed,[]);
}
console.log(`[hold-${mode}] ${results.filter(x=>x.pass).length}/${plan.length} pass; ${output}`);process.exitCode=results.length!==plan.length||results.some(x=>!x.pass)?1:0;
