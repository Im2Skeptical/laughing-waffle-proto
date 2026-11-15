import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';
import {BROWSER_PROBE_LAUNCH_OPTIONS} from '../browser-probe-config.mjs';
import {installRuntime} from './browser-runtime.mjs';
import {installFeedbackObserver} from './feedback-runtime.mjs';
import {installFeedbackBindings} from './feedback-bindings.mjs';
import {installNativeFeedback} from './native-feedback.mjs';
import {dispatchOfferedDrag,dispatchOfferedPinch} from './offered-input.mjs';
import {digest} from './fixtures.mjs';
import {MAP_VIEWPORT_RECT} from '../../src/views/world-map/constants.js';
const id=process.argv[2];assert.ok(id);const output=`artifacts/perf-hillclimb/${id}`;await mkdir(output);
const put=(n,v)=>writeFile(`${output}/${n}.json`,JSON.stringify(v,null,2));
const plan=[{population:'desktop',kind:'pan'},{population:'desktop',kind:'wheel'},
 {population:'mobile4',kind:'pan'},{population:'mobile4',kind:'pinch'},{population:'mobile4',kind:'wheel'}];
const sources={};for(const f of ['feedback-gesture-controls','feedback-runtime','feedback-bindings','browser-runtime','native-feedback','offered-input'])sources[f]=digest(await readFile(`scripts/perf-hillclimb/${f}.mjs`));
await put('plan',{runtime:{node:process.version,execArgv:process.execArgv,playwright:JSON.parse(await readFile('node_modules/playwright/package.json')).version,launch:BROWSER_PROBE_LAUNCH_OPTIONS},plan,sources,build:JSON.parse(await readFile('dist/build-manifest.json')),scope:'comparison-ineligible native mechanism controls; real prepared game; active-work positive J3 remains separate; delayed completion250ms'});
const server=spawn(process.execPath,['node_modules/serve/bin/serve.js','-l','18249','--no-clipboard','dist'],{stdio:'ignore',windowsHide:true});let browser;const results=[];
try{
 for(let i=0;i<100;i++){try{if((await fetch('http://127.0.0.1:18249/')).ok)break;}catch{}await delay(100);}
 for(const [index,cell]of plan.entries()){
  console.log(`[feedback-gesture] ${cell.population}/${cell.kind}`);
  let page,wheelAccounting=null;
  try{
   browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);const mobile=cell.population==='mobile4';
   const context=await browser.newContext({viewport:mobile?{width:844,height:390}:{width:1280,height:800},hasTouch:mobile,isMobile:mobile});page=await context.newPage();
   page.setDefaultTimeout(180000);await page.addInitScript(installRuntime,{instrumentation:true});await page.addInitScript(installFeedbackObserver);await page.addInitScript(installFeedbackBindings);await page.addInitScript(installNativeFeedback);
   const cdp=await context.newCDPSession(page);if(mobile)await cdp.send('Emulation.setCPUThrottlingRate',{rate:4});
   await page.goto('http://127.0.0.1:18249/?dev=1&art=0');await page.getByTestId('game-developer-tools').locator('summary').click();await page.getByTestId('game-progressive-artwork').setChecked(false);
   await page.getByTestId('game-new-performance').click();await page.waitForFunction(()=>{const s=__SETTLEMENT_DEBUG__.getTimingSnapshot();return document.querySelector('[data-testid=game-menu]')?.hidden&&s.map.visible&&s.opening.phase==='completed'&&s.opening.lossSec>0&&s.opening.coverageSec>=s.opening.lossSec&&s.graph.computedSec>=s.opening.lossSec;});
   const box=await page.locator('canvas').boundingBox();
   const present=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getTimeActionClickPoint());assert.ok(present,'real Present control');
   const px=box.x+present.x*box.width/2424,py=box.y+present.y*box.height/1080;
   if(mobile)await page.touchscreen.tap(px,py);else await page.mouse.click(px,py);
   await page.waitForFunction(()=>{const s=__SETTLEMENT_DEBUG__.getTimingSnapshot();return s.runner.viewedSec===s.runner.frontierSec&&!s.runner.previewActive&&!s.map.focusAnimating;});
   const rect=MAP_VIEWPORT_RECT;
   const screen=(x,y)=>({x:box.x+x*box.width/2424,y:box.y+y*box.height/1080});
   const center=screen(rect.x+rect.width*.82,rect.y+rect.height*.62);
   const from=screen(rect.x+rect.width*.92,rect.y+rect.height*.65);
   const to=screen(rect.x+rect.width*.78,rect.y+rect.height*.65);
   await page.screenshot({path:`${output}/${index}-before.png`});
   await page.evaluate(kind=>{const operationId=__HC__.arm({name:'native-'+kind,event:kind==='wheel'?'wheel':'pointerdown',timeoutMs:5000});__HC_FEEDBACK__.arm({operationId,binding:'camera',readCue:()=>__HC_READ_FEEDBACK__('camera')});},cell.kind);
   let offered;
   if(cell.kind==='pan')offered=await dispatchOfferedDrag({page,cdp,from,to,input:mobile?'touch':'mouse',steps:12,intervalMs:1000/60});
   else if(cell.kind==='pinch'){const startSpan=box.width*rect.width/2424*.1;offered=await dispatchOfferedPinch({page,cdp,center,startSpan,endSpan:startSpan*1.35,steps:12,intervalMs:1000/60});}
   else{
    const start=performance.now();offered=await Promise.all(Array.from({length:18},(_,i)=>(async()=>{await delay(Math.max(0,start+i*40-performance.now()));const sent=performance.now();await cdp.send('Input.dispatchMouseEvent',{type:'mouseWheel',x:center.x,y:center.y,deltaX:0,deltaY:-25});return {index:i,dueHost:start+i*40,sentHost:sent,ackHost:performance.now()};})()));
   }
   await delay(250);
   await page.waitForFunction(()=>__HC__.probe(()=>true,{terminal:true,key:'delayed-gesture-completion'}),null,{polling:'raf'});
   const actual=await page.evaluate(async()=>{const host=await __HC__.finish({deliberateCompletionDelayMs:250});const record=__HC_FEEDBACK__.finish();return {host,record,export:__HC_FEEDBACK__.drain(),native:__HC_NATIVE__.stop()};});
   await put(`${index}-actual`,{...cell,...actual,offered});await page.screenshot({path:`${output}/${index}-after.png`});
   assert.equal(actual.record.phase,'completed');
   assert.ok(actual.record.firstFeedbackAtMs<actual.host.semanticEnd);
   const receipts=actual.native.receipts.filter(r=>r.timeStamp>=actual.host.started);
   const last=receipts.at(-1);assert.ok(actual.record.firstFeedbackAtMs<last.timeStamp,'first response precedes final offered event');
   if(cell.kind==='wheel'){const received=receipts.filter(r=>r.type==='wheel').length;wheelAccounting={offeredCommands:offered.length,receivedNativeEvents:received,hcInputCount:actual.host.inputCount,unresolvedMissingOrCoalesced:offered.length-received,scope:'all protocol commands retained; exact HC/native receipt parity; unresolved protocol-to-DOM coalescing/loss is NOT zero or offered-load conformance'};await put(`${index}-wheel-accounting`,wheelAccounting);assert.equal(actual.host.inputCount,received);assert.ok(received>=2,'actual repeated native armed-type events required');}
   else{assert.ok(receipts.some(r=>r.type==='pointermove'));assert.ok(receipts.some(r=>r.type==='pointerup'));if(cell.kind==='pinch')assert.equal(new Set(receipts.filter(r=>r.type==='pointerdown').map(r=>r.pointerId)).size,2);}
   results.push({...cell,pass:true,wheelAccounting,passScope:'native feedback lifetime / HC-to-receipt parity only; unresolved protocol-to-DOM delivery remains a gap'});
  }catch(e){await put(`${index}-passive-failure`,await page?.evaluate(()=>({timing:globalThis.__SETTLEMENT_DEBUG__?.getTimingSnapshot({includeProjectionSource:true}),host:globalThis.__HC__?.active,native:globalThis.__HC_NATIVE__?.stop()})).catch(x=>({error:x.message})));results.push({...cell,pass:false,error:e.message});await put(`${index}-failure`,{message:e.message,stack:e.stack});}
  finally{await browser?.close();browser=null;await put('results',results);}
 }
 for(const [f,h]of Object.entries(sources))assert.equal(digest(await readFile(`scripts/perf-hillclimb/${f}.mjs`)),h);
}finally{await browser?.close();server.kill();}
console.log(`[feedback-gesture] ${results.filter(x=>x.pass).length}/${plan.length} pass`);process.exitCode=results.some(x=>!x.pass)?1:0;
