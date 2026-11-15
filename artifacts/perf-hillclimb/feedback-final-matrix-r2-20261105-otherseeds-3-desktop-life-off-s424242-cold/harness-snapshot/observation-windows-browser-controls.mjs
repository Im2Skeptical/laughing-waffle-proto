// Real renderer/frame attribution controls. This is a mechanism fixture, not
// actual-game latency proof, and every result is comparison-ineligible.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import {chromium} from 'playwright';
import {BROWSER_PROBE_LAUNCH_OPTIONS} from '../browser-probe-config.mjs';
import {installRuntime} from './browser-runtime.mjs';
import {withDeadline} from './deadline.mjs';
import {attributeObservationWindow} from './observation-windows.mjs';

const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const id=process.argv[2]??`observation-window-controls-${new Date().toISOString().replace(/[:.]/g,'-')}`;
assert.match(id,/^[a-zA-Z0-9_-]+$/,'simple unique run ID required');
const output=path.resolve('artifacts/perf-hillclimb',id);await mkdir(output);
const sourceFiles={};
for(const file of ['scripts/perf-hillclimb/observation-windows.mjs','scripts/perf-hillclimb/observation-windows-browser-controls.mjs',
  'scripts/perf-hillclimb/browser-runtime.mjs','scripts/perf-hillclimb/deadline.mjs','scripts/browser-probe-config.mjs']){
  const source=await readFile(file,'utf8');sourceFiles[file]=hash(source);
  await writeFile(path.join(output,path.basename(file)),source);
}
let browser;
try{
  browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
  const context=await browser.newContext({viewport:{width:1280,height:800}});
  const page=await context.newPage();page.setDefaultTimeout(10000);
  const evaluate=(fn,arg)=>withDeadline(page.evaluate(fn,arg),10000,'observation-window native control evaluation');
  await page.setContent('<button id="stall">Known renderer work</button><output>idle</output>');
  await evaluate(installRuntime,{instrumentation:true});
  await evaluate(()=>{
    document.querySelector('#stall').onclick=event=>{
      const began=performance.now();while(performance.now()-began<220){}
      globalThis.knownStall={began,ended:performance.now(),trusted:event.isTrusted};
      document.querySelector('output').textContent='done';
    };
  });
  const settle=()=>evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await settle();
  const startMs=await evaluate(()=>performance.now());
  const diagnosticStart=await evaluate(()=>performance.now());
  await page.locator('#stall').click();
  const diagnosticEnd=await evaluate(()=>performance.now());
  const knownStall=await evaluate(()=>knownStall);
  assert.equal(knownStall.trusted,true);assert.ok(knownStall.ended-knownStall.began>=219);
  await settle();
  const endMs=await evaluate(()=>performance.now());
  const raw=await evaluate(bounds=>__HC__.readContinuousWindow(bounds),{startMs,endMs});
  assert.equal(raw.available,true);
  const diagnostic={id:'actual-block',label:'known isolated renderer diagnostic',startMs:diagnosticStart,endMs:diagnosticEnd};
  const nested={id:'nested',label:'nested diagnostic annotation',startMs:knownStall.began+20,endMs:knownStall.ended-20};
  const rawIdentity=hash(raw);
  const attributed=attributeObservationWindow(raw,[diagnostic,nested]);
  assert.equal(hash(raw),rawIdentity,'raw renderer evidence remains untouched');
  assert.ok(raw.frames.some(frame=>frame.dt>=180),'known stall appears in actual rAF intervals');
  assert.ok(attributed.excludedFrameIntervals.some(frame=>frame.dt>=180),'whole known crossing frame is explicitly retained as excluded');
  assert.equal(attributed.observationGaps.length,1);assert.equal(attributed.diagnosticUnionMs,diagnosticEnd-diagnosticStart,
    'nested diagnostic does not double-count the removed interval');
  assert.equal(attributed.wholeWindowFrameEvidenceAvailable,false,'a diagnostic gap cannot certify whole-window smoothness');
  let longTaskControl={available:false};
  if(raw.longTasksAvailable){
    assert.ok(raw.longTasks.some(task=>task.duration>=180),'known handler stall appears in native long-task observation');
    assert.ok(attributed.excludedLongTasks.some(task=>task.duration>=180));
    longTaskControl={available:true,knownStallRetained:true};
  }

  // Let a native remote task outlive its host deadline. The attribution input
  // deliberately drops the late completion receipt, exercising the same
  // conservative unknown-end policy; it does not claim work stays alive later.
  const openStart=await evaluate(()=>performance.now());
  const pending=page.evaluate(()=>new Promise(resolve=>setTimeout(()=>{
    const began=performance.now();while(performance.now()-began<180){}
    resolve({began,ended:performance.now()});
  },100)));
  await assert.rejects(withDeadline(pending,25,'deliberately lost diagnostic completion'),/timeout/);
  const lateReceipt=await withDeadline(pending,5000,'retain late native completion for control evidence');
  await settle();
  const openEnd=await evaluate(()=>performance.now());
  const openRaw=await evaluate(bounds=>__HC__.readContinuousWindow(bounds),{startMs:openStart,endMs:openEnd});
  const open=attributeObservationWindow(openRaw,[{id:'unknown-end',label:'host deadline without confirmed end',startMs:openStart,endMs:null}]);
  assert.equal(open.hasUnclosedDiagnostic,true);assert.equal(open.outsideDiagnosticFrameIntervals.length,0);
  assert.equal(open.diagnosticUnionMs,openEnd-openStart);assert.equal(open.wholeWindowFrameEvidenceAvailable,false);
  const unavailable=attributeObservationWindow({...raw,available:false,longTasksAvailable:false,frames:[],longTasks:[]},[diagnostic]);
  assert.equal(unavailable.available,false);assert.equal(unavailable.wholeWindowFrameEvidenceAvailable,false);
  await writeFile(path.join(output,'controls.json'),JSON.stringify({ok:true,comparisonEligible:false,sourceFiles,
    machine:{host:os.hostname(),os:os.release(),platform:os.platform(),cpu:os.cpus()[0]?.model,totalMemory:os.totalmem()},
    runtime:{node:process.version,chromium:browser.version(),playwright:JSON.parse(await readFile('node_modules/playwright/package.json','utf8')).version},
    launch:BROWSER_PROBE_LAUNCH_OPTIONS,knownStall,raw,attributed,longTaskControl,openRaw,open,lateReceipt,unavailable,
    scope:'native renderer/frame/unknown-end attribution mechanism only; actual artwork wrapper, affected product paths, common observer overhead and independent audit remain required'},null,2));
  console.log(`[observation-window-controls] PASS native stall retained, whole crossing intervals/nested union, open receipt and unavailable evidence; ${output}`);
}catch(error){
  await writeFile(path.join(output,'failure.txt'),error.stack);console.error(`[observation-window-controls] FAIL ${error.message.split('\n')[0]}; ${output}`);process.exitCode=1;
}finally{await browser?.close();}
