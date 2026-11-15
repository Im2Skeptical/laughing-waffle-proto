// Reversible browser fixtures exercise the exact runtime timer and completion
// mechanism. Product-path negative controls remain separately required.
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {BROWSER_PROBE_LAUNCH_OPTIONS} from '../browser-probe-config.mjs';
import {installRuntime,installSave,readSave} from './browser-runtime.mjs';

const output=process.argv[2]??`artifacts/perf-hillclimb/mechanism-controls-${new Date().toISOString().replace(/[:.]/g,'-')}`;
await mkdir(output,{recursive:true});
const hash=x=>createHash('sha256').update(x).digest('hex');
const identity={date:new Date().toISOString(),files:{},contractId:hash(await readFile('docs/performance/perf-hillclimb-20261104/HARNESS.md')),
  build:JSON.parse(await readFile('dist/build-manifest.json','utf8')),node:process.version,
  playwright:JSON.parse(await readFile('node_modules/playwright/package.json','utf8')).version};
for(const file of ['browser-runtime.mjs','mechanism-controls.mjs']){
  const source=await readFile(`scripts/perf-hillclimb/${file}`,'utf8');identity.files[file]=hash(source);await writeFile(`${output}/${file}`,source);
}
const html=`<!doctype html><button id="act">Run</button><output id="result">idle</output><script>
globalThis.delayMs=0;globalThis.blockMs=0;globalThis.value='correct';
document.addEventListener('pointerdown',()=>{const end=performance.now()+blockMs;while(performance.now()<end){}},{capture:true});
document.querySelector('button').onclick=()=>setTimeout(()=>document.querySelector('output').textContent=value,delayMs);
</script>`;
const server=http.createServer((_,res)=>{res.setHeader('Content-Type','text/html');res.end(html);});
await new Promise(resolve=>server.listen(18245,'127.0.0.1',resolve));
const browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);const results=[];
try{
  async function session(instrumentation=true){
    const context=await browser.newContext();const page=await context.newPage();
    await page.addInitScript(()=>{globalThis.__nativeWorkerForControl=globalThis.Worker;});
    await page.addInitScript(installRuntime,{instrumentation});await page.goto('http://127.0.0.1:18245/');
    return {page,context};
  }
  async function operation(page,{delayMs=0,blockMs=0,value='correct',expected='correct',timeoutMs=2000,intermediate=false}={}){
    await page.evaluate(options=>{Object.assign(globalThis,options);document.querySelector('output').textContent='idle';}, {delayMs,blockMs,value});
    await page.evaluate(timeoutMs=>__HC__.arm({name:'control',timeoutMs}),timeoutMs);
    await page.locator('button').click();
    if(intermediate)await page.waitForFunction(()=>__HC__.probe(()=>true,{key:'intermediate',terminal:false}));
    await page.waitForFunction(expected=>__HC__.probe(()=>document.querySelector('output').textContent===expected,{key:'terminal',terminal:true}),expected,{timeout:Math.max(500,timeoutMs),polling:'raf'});
    return page.evaluate(()=>__HC__.finish({text:document.querySelector('output').textContent}));
  }
  const s=await session();
  try{
    const baseline=await operation(s.page);assert.equal(baseline.trustedInput,true);
    const delay=await operation(s.page,{delayMs:200});
    assert.ok(delay.elapsedMs-baseline.elapsedMs>=150,'known deferred completion cannot return before work');
    const intermediateDelayed=await operation(s.page,{delayMs:200,intermediate:true});
    assert.ok(intermediateDelayed.elapsedMs-baseline.elapsedMs>=150,'successful intermediate predicate cannot terminate before later deferred terminal');
    const queued=await operation(s.page,{blockMs:200});
    assert.ok(queued.inputQueueMs>=180,'capture blocker delay is counted before timer handler');
    assert.ok(queued.elapsedMs>=200,'queued handler work cannot masquerade as a speedup');
    let wrongFailed=false;try{await operation(s.page,{value:'wrong',timeoutMs:100});}catch{wrongFailed=true;await s.page.evaluate(()=>__HC__.cancel('expected wrong result rejection'));}
    assert.equal(wrongFailed,true,'wrong result fails actual browser completion oracle');
    let lateFailed=false;try{await operation(s.page,{delayMs:200,timeoutMs:100});}catch{lateFailed=true;await s.page.evaluate(()=>__HC__.cancel('expected late result rejection'));}
    assert.equal(lateFailed,true,'late semantic success cannot pass deadline');
    results.push({mechanism:'trusted-input/deferred-visible-completion',baseline,delay,intermediateDelayed,queued,wrongFailed,lateFailed});
    await s.page.evaluate(async()=>{
      const source='onmessage=e=>postMessage(e.data)';
      const worker=new Worker(URL.createObjectURL(new Blob([source],{type:'text/javascript'})));
      await new Promise(resolve=>{worker.onmessage=resolve;worker.postMessage('warmup');});
      worker.onmessage=e=>{document.querySelector('output').textContent=e.data;};
      document.querySelector('button').onclick=()=>worker.postMessage('correct');
      globalThis.controlWorker=worker;
    });
    const workerBaseline=await operation(s.page);
    await s.page.evaluate(()=>{__HC__.workerDelayMs=200;});
    const workerDelayed=await operation(s.page);
    assert.ok(workerDelayed.elapsedMs-workerBaseline.elapsedMs>=150,'real delayed worker completion is inside elapsed path');
    assert.ok(workerDelayed.workerEvents.some(e=>e.kind==='response'),'actual worker response independently witnessed');
    results.push({mechanism:'actual-worker-delivery',workerBaseline,workerDelayed});
    await s.page.evaluate(()=>{__HC__.workerDelayMs=0;controlWorker.terminate();});
    // Actual transaction completion and identity are asserted; wrong-slot reads
    // and wrong payloads must be distinguishable rather than any save = success.
    await s.page.evaluate(installSave,{database:'hillclimb-control',slot:1,text:'first',meta:{schemaVersion:1}});
    assert.equal(await s.page.evaluate(readSave,{database:'hillclimb-control',slot:1}),'first');
    assert.equal(await s.page.evaluate(readSave,{database:'hillclimb-control',slot:2}),null);
    await s.page.evaluate(installSave,{database:'hillclimb-control',slot:1,text:'second',meta:{schemaVersion:1}});
    assert.equal(await s.page.evaluate(readSave,{database:'hillclimb-control',slot:1}),'second');
    results.push({mechanism:'IndexedDB committed transaction',correctSlot:true,wrongSlotRejected:true,replacementIdentity:true});
  }finally{await s.context.close();}
  const native=await session(false);try{
    assert.equal(await native.page.evaluate(()=>Worker===__nativeWorkerForControl),true,'overhead reference preserves native Worker');
    const op=await operation(native.page);results.push({mechanism:'no-hook reference',nativeWorker:true,operation:op});
  }finally{await native.context.close();}
  const queued=await session();try{
    // Coordinates are resolved before blocking. CDP dispatch bypasses locator
    // actionability waits, so input can really arrive while renderer JS is busy.
    const bounds=await queued.page.locator('button').boundingBox();
    const cdp=await queued.context.newCDPSession(queued.page);
    await queued.page.evaluate(()=>__HC__.arm({name:'renderer-queue-control',timeoutMs:2000}));
    const signal=queued.page.waitForEvent('console',{predicate:m=>m.text()==='HC_BUSY_START',timeout:5000});
    const busy=queued.page.evaluate(()=>{
      const start=performance.now();globalThis.__hcBusyWindow={start,end:null};console.debug('HC_BUSY_START');
      while(performance.now()-start<300){}
      __hcBusyWindow.end=performance.now();
    });
    await signal;
    const hostDispatchDue=performance.now(),hostDispatchWall=Date.now();
    const input={x:bounds.x+bounds.width/2,y:bounds.y+bounds.height/2,button:'left',clickCount:1};
    const pressed=cdp.send('Input.dispatchMouseEvent',{type:'mousePressed',...input,buttons:1});
    const released=cdp.send('Input.dispatchMouseEvent',{type:'mouseReleased',...input,buttons:0});
    await Promise.all([busy,pressed,released]);
    await queued.page.waitForFunction(()=>__HC__.probe(()=>document.querySelector('output').textContent==='correct',{key:'queued-terminal',terminal:true}));
    const operation=await queued.page.evaluate(()=>__HC__.finish({text:document.querySelector('output').textContent}));
    const busyWindow=await queued.page.evaluate(()=>__hcBusyWindow);
    assert.ok(operation.eventTimeStamp>=busyWindow.start&&operation.eventTimeStamp<busyWindow.end,'trusted input actually arrived while renderer was blocked');
    assert.ok(operation.inputQueueMs>=150,'renderer queue before every handler is included');
    assert.ok(operation.elapsedMs>=150,'queued input cannot masquerade as immediate response');
    results.push({mechanism:'already-dispatched input during renderer main-thread block',hostDispatchDue,hostDispatchWall,busyWindow,operation});
  }finally{await queued.context.close();}
  await writeFile(`${output}/controls.json`,JSON.stringify({ok:true,identity,chromium:browser.version(),launch:BROWSER_PROBE_LAUNCH_OPTIONS,results,
    scope:'mechanism fixtures only; product-path wrong generation/art/RNG/read-only controls remain required'},null,2));
  console.log(`[hillclimb-controls] PASS ${results.length} mechanisms; ${output}/controls.json`);
}catch(error){await writeFile(`${output}/failure.txt`,error.stack);console.error(`[hillclimb-controls] FAIL ${error.message}; ${output}`);process.exitCode=1;}
finally{await browser.close();server.close();}
