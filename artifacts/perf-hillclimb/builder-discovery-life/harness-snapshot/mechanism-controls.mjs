// Reversible browser fixtures exercise the exact runtime timer and completion
// mechanism. Product-path negative controls remain separately required.
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {BROWSER_PROBE_LAUNCH_OPTIONS} from '../browser-probe-config.mjs';
import {installRuntime,installSave,readSave} from './browser-runtime.mjs';

const output=process.argv[2]??'artifacts/perf-hillclimb/mechanism-controls';
await mkdir(output,{recursive:true});
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
  async function operation(page,{delayMs=0,blockMs=0,value='correct',expected='correct',timeoutMs=2000}={}){
    await page.evaluate(options=>{Object.assign(globalThis,options);document.querySelector('output').textContent='idle';}, {delayMs,blockMs,value});
    await page.evaluate(timeoutMs=>__HC__.arm({name:'control',timeoutMs}),timeoutMs);
    await page.locator('button').click();
    await page.waitForFunction(expected=>document.querySelector('output').textContent===expected,expected,{timeout:Math.max(500,timeoutMs),polling:'raf'});
    return page.evaluate(()=>__HC__.finish({text:document.querySelector('output').textContent}));
  }
  const s=await session();
  try{
    const baseline=await operation(s.page);assert.equal(baseline.trustedInput,true);
    const delay=await operation(s.page,{delayMs:200});
    assert.ok(delay.elapsedMs-baseline.elapsedMs>=150,'known deferred completion cannot return before work');
    const queued=await operation(s.page,{blockMs:200});
    assert.ok(queued.inputQueueMs>=180,'capture blocker delay is counted before timer handler');
    assert.ok(queued.elapsedMs>=200,'queued handler work cannot masquerade as a speedup');
    let wrongFailed=false;try{await operation(s.page,{value:'wrong',timeoutMs:100});}catch{wrongFailed=true;await s.page.evaluate(()=>__HC__.cancel('expected wrong result rejection'));}
    assert.equal(wrongFailed,true,'wrong result fails actual browser completion oracle');
    let lateFailed=false;try{await operation(s.page,{delayMs:200,timeoutMs:100});}catch{lateFailed=true;await s.page.evaluate(()=>__HC__.cancel('expected late result rejection'));}
    assert.equal(lateFailed,true,'late semantic success cannot pass deadline');
    results.push({mechanism:'trusted-input/deferred-visible-completion',baseline,delay,queued,wrongFailed,lateFailed});
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
  await writeFile(`${output}/controls.json`,JSON.stringify({ok:true,chromium:browser.version(),launch:BROWSER_PROBE_LAUNCH_OPTIONS,results,
    scope:'mechanism fixtures only; product-path wrong generation/art/RNG/read-only controls remain required'},null,2));
  console.log(`[hillclimb-controls] PASS ${results.length} mechanisms; ${output}/controls.json`);
}catch(error){await writeFile(`${output}/failure.txt`,error.stack);console.error(`[hillclimb-controls] FAIL ${error.message}; ${output}`);process.exitCode=1;}
finally{await browser.close();server.close();}
