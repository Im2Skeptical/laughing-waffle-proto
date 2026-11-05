import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';
import {BROWSER_PROBE_LAUNCH_OPTIONS} from '../browser-probe-config.mjs';
import {installRuntime} from './browser-runtime.mjs';
import {installFeedbackObserver} from './feedback-runtime.mjs';
import {collectFeedback} from './feedback-collection.mjs';
import {installFeedbackBindings} from './feedback-bindings.mjs';
import {installNativeFeedback,startNativeTrace} from './native-feedback.mjs';
import {digest} from './fixtures.mjs';
const id=process.argv[2];assert.ok(id,'fresh ID required');
const output=`artifacts/perf-hillclimb/${id}`;await mkdir(output);
const save=(n,v)=>writeFile(`${output}/${n}.json`,JSON.stringify(v,null,2));
const cases=['immediate-delayed-completion','immediate-completion','queue','capture-cost','no-op','clipped-cue','pre-input-drift','transient','render-delay','missing-frame','cancel-before-input','runtime-replacement','host-failure'];
const schedule=['desktop','mobile','mobile4'].flatMap(population=>cases.map(control=>({population,control})));
const sources={};for(const f of ['feedback-native-controls','native-feedback','feedback-bindings','feedback-runtime','feedback-collection','browser-runtime'])sources[f]=digest(await readFile(`scripts/perf-hillclimb/${f}.mjs`));
const build=JSON.parse(await readFile('dist/build-manifest.json'));await save('plan',{runtime:{node:process.version,execArgv:process.execArgv,playwright:JSON.parse(await readFile('node_modules/playwright/package.json')).version,launch:BROWSER_PROBE_LAUNCH_OPTIONS},schedule,sources,build,contract:digest(await readFile('docs/performance/perf-hillclimb-20261104/HARNESS.md')),phaseA:'NOT SOUND',comparisonEligible:false,scope:'native diagnostic controls, no first physical pixel proof'});
const server=spawn(process.execPath,['node_modules/serve/bin/serve.js','-l','18248','--no-clipboard','dist'],{stdio:'ignore',windowsHide:true});
let browser;const results=[];
try{
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:18248/')).ok)break;}catch{}await delay(100);}
 for(const [index,cell]of schedule.entries()){
  console.log(`[native-feedback] ${index+1}/${schedule.length} ${cell.population}/${cell.control}`);
  let page,trace;
  try{
   browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
   const mobile=cell.population!=='desktop',context=await browser.newContext({viewport:mobile?{width:844,height:390}:{width:1280,height:800},isMobile:mobile,hasTouch:mobile});
   page=await context.newPage();page.setDefaultTimeout(15000);
   await page.addInitScript(installRuntime,{instrumentation:true});await page.addInitScript(installFeedbackObserver);await page.addInitScript(installFeedbackBindings);await page.addInitScript(installNativeFeedback);
   const cdp=await context.newCDPSession(page);if(cell.population==='mobile4')await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
   await page.goto('http://127.0.0.1:18248/?dev=1&art=0');await page.getByTestId('game-new').waitFor();
   await page.waitForFunction(()=>!document.querySelector('[data-testid=game-new]').disabled);
   const response=await page.request.get(new URL(build.bundle,'http://127.0.0.1:18248/').href);assert.equal(digest(await response.body()),digest(await readFile('dist/'+build.bundle)));
   const point=await page.getByTestId('game-new').boundingBox();
   if(cell.control==='immediate-delayed-completion')await page.screenshot({path:`${output}/${index}-before.png`});
   if(index===0||cell.control==='capture-cost'&&cell.population==='mobile4')trace=await startNativeTrace(cdp,`${output}/${index}-trace.json`);
   await page.evaluate(control=>{
    globalThis.__HC_ORIGINAL__=__HC__;globalThis.__HC_ORDER__=[];const log=label=>__HC_ORDER__.push({label,at:performance.now()});
    window.addEventListener('pointerdown',()=>{log('window-capture');queueMicrotask(()=>log('capture-microtask'));},{capture:true,once:true});
    document.querySelector('[data-testid=game-new]').addEventListener('pointerdown',()=>log('target-down'),{once:true});
    if(control==='capture-cost'){
      const api=__SETTLEMENT_DEBUG__,original=api.getTimingSnapshot;
      api.getTimingSnapshot=(...a)=>{const t=performance.now();while(performance.now()-t<60){}return original(...a);};
    }
    const operationId=__HC__.arm({name:'native-slot-picker-control',timeoutMs:control==='missing-frame'?1200:5000,captureInputTiming:control==='capture-cost'});
    __HC_FEEDBACK__.arm({operationId,binding:'slot-picker',readCue:()=>__HC_READ_FEEDBACK__('slot-picker')});
    if(control==='runtime-replacement')globalThis.__HC__={version:4,active:null,operations:[]};
    if(control==='queue')setTimeout(()=>{log('busy-start');const t=performance.now();while(performance.now()-t<200){}log('busy-end');},0);
    if(control==='pre-input-drift')document.querySelector('[data-testid=game-new]').click();
    if(control==='clipped-cue'){const observer=new MutationObserver(()=>{const slot=document.querySelector('[data-testid=game-slot-1]');if(slot){observer.disconnect();slot.parentElement.style.overflow='hidden';slot.parentElement.style.height='0px';}});observer.observe(document.documentElement,{childList:true,subtree:true});}
    if(control==='render-delay'||control==='transient'){
      const style=document.createElement('style');document.head.append(style);
      if(control==='render-delay'){
        style.textContent='[data-testid=game-slot-1]{visibility:hidden!important}';
        setTimeout(()=>{style.remove();log('real-DOM-visibility-restored');},250);
      }else{
        // Real public slot-picker UI rendered by app click, then deliberately hidden.
        const o=new MutationObserver(()=>{if(document.querySelector('[data-testid=game-slot-1]')){
          o.disconnect();requestAnimationFrame(()=>{style.textContent='[data-testid=game-slot-1]{visibility:hidden!important}';log('real-DOM-transient-hidden');});}});
        o.observe(document.documentElement,{childList:true,subtree:true});
      }
    }
    if(control==='missing-frame')globalThis.requestAnimationFrame=()=>0;
    if(control==='cancel-before-input')__HC_FEEDBACK__.cancel('native paired cancel before input');
   },cell.control);
   if(cell.control==='queue')await delay(20);
   if(cell.control!=='cancel-before-input'){
    const x=point.x+point.width/2,y=point.y+point.height/2;
    if(cell.control==='no-op'){
      await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x:2,y:2,button:'left',clickCount:1});await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x:2,y:2,button:'left',clickCount:1});
    }else if(mobile)await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x,y}]});
    else await cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});
    if(cell.control!=='no-op'){
      if(mobile)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      else await cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});
    }
   }
   await delay(cell.control==='missing-frame'?1300:cell.control==='immediate-completion'?0:500);
   const actual=await page.evaluate(async control=>{
    if(control==='runtime-replacement')__HC_ORIGINAL__.cancel('native runtime replacement cleanup');
    if(__HC__.active){
      if(control==='host-failure')__HC__.cancel('native intended functional failure');
      else if(control==='missing-frame')__HC__.cancel('native missing frame deadline');
      else{
        await new Promise(resolve=>{const poll=()=>{if(__HC__.probe(()=>true,{terminal:true,key:'control-delayed-completion'}))resolve();else requestAnimationFrame(poll);};poll();});
        await __HC__.finish({control});
      }
    }
    return {host:__HC_ORIGINAL__.operations.at(-1),native:__HC_NATIVE__.stop(),order:__HC_ORDER__};
   },cell.control);
   Object.assign(actual,await page.evaluate(collectFeedback,{postCompletionGraceMs:1000}));
   await save(`${index}-actual`,actual);
   if(cell.control==='immediate-delayed-completion')await page.screenshot({path:`${output}/${index}-after.png`});
   const r=actual.record??actual.export.records[0];assert.ok(r);
   if(['immediate-delayed-completion','immediate-completion','queue','capture-cost','render-delay'].includes(cell.control)){
     assert.equal(r.phase,'completed');assert.equal(r.startedAtMs,actual.host.started);assert.equal(r.inputQueueMs,actual.host.inputQueueMs);
     if(cell.control!=='immediate-completion')assert.ok(r.firstFeedbackAtMs<actual.host.finished);
     assert.equal(r.markerAfterCompletion,r.firstFeedbackAtMs>actual.host.finished);
   }
   if(actual.record?.startedAtMs!==null&&actual.record?.startedAtMs!=null){
    const target=actual.order.find(x=>x.label==='target-down');
    assert.ok(r.preHandlerAtMs<=r.hostHandlerAtMs);
    if(target){assert.ok(r.hostHandlerAtMs<=target.at);if(r.postDispatchAtMs!==null)assert.ok(r.postDispatchAtMs>=target.at,'actual timer task follows target dispatch');}
   }
   if(cell.control==='capture-cost')assert.ok(r.hostCaptureReadMs>=59);
   if(cell.control==='queue')assert.ok(r.inputQueueMs>=100,'actual busy task queued native input');
   if(cell.control==='render-delay')assert.ok(r.firstFeedbackMs>=150);
   if(['no-op','clipped-cue','transient','missing-frame','pre-input-drift','cancel-before-input','runtime-replacement'].includes(cell.control))assert.equal(r.firstFeedbackMs,null);
   if(cell.control==='pre-input-drift')assert.match(r.error,/drift/);
   if(cell.control==='runtime-replacement')assert.equal(r.hostAtCollection.status,'runtime-replaced');
   if(cell.control==='host-failure')assert.equal(r.overallStatus,'failed');
   results.push({...cell,pass:true,feedback:r.phase,firstChangedFrameAtMs:r.firstChangedFrameAtMs});
  }catch(e){results.push({...cell,pass:false,error:e.message});await save(`${index}-failure`,{message:e.message,stack:e.stack});}
  finally{if(trace)await trace.stop();await browser?.close();browser=null;await save('results',results);}
 }
 for(const f of Object.keys(sources))assert.equal(digest(await readFile(`scripts/perf-hillclimb/${f}.mjs`)),sources[f]);
}finally{await browser?.close();server.kill();}
console.log(`[native-feedback] ${results.filter(x=>x.pass).length}/${schedule.length} passed; ${output}`);process.exitCode=results.some(x=>!x.pass)?1:0;
