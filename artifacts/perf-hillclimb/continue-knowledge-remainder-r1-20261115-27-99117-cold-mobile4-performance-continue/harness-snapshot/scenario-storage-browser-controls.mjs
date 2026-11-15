// Native storage/HTTP-cache mechanism controls, not a game latency benchmark.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import {chromium} from 'playwright';
import {BROWSER_PROBE_LAUNCH_OPTIONS} from '../browser-probe-config.mjs';
import {captureScenarioStorage,restoreScenarioStorage,readScenarioResources} from './scenario-storage.mjs';
import {installSave} from './browser-runtime.mjs';
import {SAVE_DATABASE_NAME} from '../../src/controllers/sim-runner/save-storage.js';
import {withDeadline} from './deadline.mjs';
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const id=process.argv[2]??`scenario-storage-controls-${new Date().toISOString().replace(/[:.]/g,'-')}`;
assert.match(id,/^[a-zA-Z0-9_-]+$/,'simple unique run ID required');
const output=path.resolve('artifacts/perf-hillclimb',id);await mkdir(output);
const corpusDirectory='artifacts/perf-hillclimb/frozen-baseline-a9df52c-sourceproof-20261104';
const corpus=JSON.parse(await readFile(path.join(corpusDirectory,'manifest.json'),'utf8'));
assert.equal(corpus.identity,'406f042f7e4a3142620b8d05023167d98893185d24347f4745740a3a3feac000');
const entry=corpus.fixtures.find(f=>f.seed===123&&f.id==='history');
const text=await readFile(path.join(corpusDirectory,entry.file),'utf8');assert.equal(hash(text),entry.sha256);
const source=await readFile('scripts/perf-hillclimb/scenario-storage.mjs','utf8');
const sourceFiles={};
for(const file of ['scripts/perf-hillclimb/scenario-storage.mjs','scripts/perf-hillclimb/scenario-storage-browser-controls.mjs',
  'scripts/perf-hillclimb/browser-runtime.mjs','scripts/perf-hillclimb/deadline.mjs','scripts/browser-probe-config.mjs',
  'src/controllers/sim-runner/save-storage.js']){
  const bytes=await readFile(file,'utf8');sourceFiles[file]=hash(bytes);
  await writeFile(path.join(output,path.basename(file)),bytes);
}
const requests=[];let browser;
const server=createServer((request,response)=>{
  requests.push({url:request.url,time:performance.now()});
  if(request.url==='/cached.js'){
    response.writeHead(200,{'Content-Type':'text/javascript','Cache-Control':'public, max-age=3600'});
    response.end('globalThis.nativeWarmResourceLoaded=true;');return;
  }
  response.writeHead(200,{'Content-Type':'text/html','Cache-Control':'no-store'});
  response.end(request.url==='/setup'?'<title>Isolated storage setup</title>':'<title>Native warm-cache control</title><script src="/cached.js"></script>');
});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
const url=`http://127.0.0.1:${server.address().port}`;
try{
  browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
  const context=await browser.newContext();const page=await context.newPage();page.setDefaultTimeout(10000);
  const evaluate=(fn,arg)=>withDeadline(page.evaluate(fn,arg),15000,'native scenario-storage control evaluation');
  await page.goto(url);assert.equal(await evaluate(()=>nativeWarmResourceLoaded),true);
  const firstTimeOrigin=await evaluate(()=>performance.timeOrigin);
  const meta=JSON.parse(text).meta;
  await evaluate(installSave,{database:SAVE_DATABASE_NAME,slot:1,text,meta});
  await evaluate(async database=>{
    localStorage.setItem('seed','123');sessionStorage.setItem('scenario','baseline');
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(database,1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    try{await new Promise((resolve,reject)=>{const tx=db.transaction('settings','readwrite');
      tx.objectStore('settings').put(true,'transfer-complete');tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});}finally{db.close();}
  },SAVE_DATABASE_NAME);
  const before=await evaluate(captureScenarioStorage,{database:SAVE_DATABASE_NAME});
  await evaluate(async database=>{
    localStorage.setItem('seed','99117');localStorage.setItem('warm-only','discard');sessionStorage.clear();
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(database,1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    try{await new Promise((resolve,reject)=>{const tx=db.transaction(['saves','slots','settings'],'readwrite');
      tx.objectStore('saves').put({slot:1,text:'wrong warmup progress'});
      tx.objectStore('slots').put({slot:1,meta:{wrong:true},characters:21});
      tx.objectStore('settings').put('discard','warm-only');
      tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error);});}finally{db.close();}
  },SAVE_DATABASE_NAME);
  const changed=await evaluate(captureScenarioStorage,{database:SAVE_DATABASE_NAME});assert.notDeepEqual(changed,before);
  await page.goto(`${url}/setup`);
  const receipt=await evaluate(restoreScenarioStorage,before);assert.equal(receipt.committed,true);
  const restored=await evaluate(captureScenarioStorage,{database:SAVE_DATABASE_NAME});assert.deepEqual(restored,before);
  // A real DataCloneError after clear requests must abort the whole native
  // transaction, preserving all stores and leaving preferences untouched.
  const abort=await evaluate(async({snapshot,source})=>{
    const bad=structuredClone(snapshot);bad.stores.saves.values[0].uncloneable=()=>{};
    try{await Function(`return (${source})`)()(bad);return {rejected:false};}
    catch(error){return {rejected:true,name:error.name};}
  },{snapshot:before,source:restoreScenarioStorage.toString()});
  assert.deepEqual(abort,{rejected:true,name:'DataCloneError'});
  assert.deepEqual(await evaluate(captureScenarioStorage,{database:SAVE_DATABASE_NAME}),before,'aborted restore preserves every baseline field');
  const malformed=structuredClone(before);malformed.stores.saves.keys[0]='mismatched-slot';
  await assert.rejects(evaluate(restoreScenarioStorage,malformed),/key correspondence/);
  assert.deepEqual(await evaluate(captureScenarioStorage,{database:SAVE_DATABASE_NAME}),before);
  await page.goto(url);assert.equal(await evaluate(()=>nativeWarmResourceLoaded),true);
  assert.notEqual(await evaluate(()=>performance.timeOrigin),firstTimeOrigin,'final readiness belongs to a fresh document');
  const cachedRequests=requests.filter(r=>r.url==='/cached.js');assert.equal(cachedRequests.length,1,'native HTTP resource cache survived scenario reset and fresh navigation');
  const resourceEvidence=await evaluate(readScenarioResources);
  const cachedResource=resourceEvidence.entries.find(entry=>entry.name===`${url}/cached.js`);
  assert.ok(cachedResource?.decodedBodySize>0,'native resource evidence includes the loaded body');
  assert.equal(cachedResource.transferSize,0,'raw ResourceTiming corroborates native server request counter');
  assert.deepEqual(await evaluate(captureScenarioStorage,{database:SAVE_DATABASE_NAME}),before);
  await writeFile(path.join(output,'controls.json'),JSON.stringify({ok:true,comparisonEligible:false,chromium:browser.version(),
    launch:BROWSER_PROBE_LAUNCH_OPTIONS,sourceSha256:hash(source),sourceFiles,fixtureSha256:entry.sha256,baselineSha256:hash(before),
    machine:{host:os.hostname(),os:os.release(),platform:os.platform(),cpu:os.cpus()[0]?.model,totalMemory:os.totalmem()},node:process.version,
    changedSha256:hash(changed),restoredSha256:hash(restored),receipt,abort,requests,resourceEvidence,
    scope:'native isolated storage transaction/reset and HTTP-cache mechanism only; actual game warm-entry/reset proof and independent audit remain required'},null,2));
  console.log(`[scenario-storage] PASS full storage reset, transaction abort, malformed-key rejection, fresh document and retained native HTTP cache; ${output}`);
}catch(error){
  await writeFile(path.join(output,'failure.txt'),error.stack);console.error(`[scenario-storage] FAIL ${error.message.split('\n')[0]}; ${output}`);process.exitCode=1;
}finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
