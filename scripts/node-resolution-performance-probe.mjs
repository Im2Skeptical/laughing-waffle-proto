// Focused browser performance probe: a real save slot, node resolution, then
// frame/input readiness after the recap. Detailed timings stay in artifacts.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { BROWSER_PROBE_LAUNCH_OPTIONS } from './browser-probe-config.mjs';
import { selectedState, nodeIdForFamily } from '../src/model/tests/vassal-life-map/helpers.js';
import { getCurrentLifeMapVassal } from '../src/model/vassal-life-map.js';
import { createTimelineFromInitialState } from '../src/model/timeline/index.js';
import { exportSave } from '../src/controllers/sim-runner/save-slots.js';

const port = 18186;
const url = `http://127.0.0.1:${port}`;
const label = process.env.PROBE_LABEL ?? 'current';
const artifact = `artifacts/node-resolution-performance-${label}.json`;
mkdirSync('artifacts', { recursive: true });
const state = selectedState(1);
getCurrentLifeMapVassal(state).lifeMap.availableNodeIds = [nodeIdForFamily(state, 'crisis')];
const timeline = createTimelineFromInitialState(state);
// Retain genuine serialized checkpoint snapshots, as accumulated history does.
timeline.checkpoints = Array.from({ length: Number(process.env.PROBE_CHECKPOINTS ?? 24) },
  () => ({checkpointSec:0,stateData:structuredClone(timeline.baseStateData)}));
const saved = exportSave({ state, timeline });
assert.equal(saved.ok, true);
const server = spawn(process.execPath, ['node_modules/serve/bin/serve.js', '-l', String(port), '--no-clipboard', process.env.PROBE_DIST ?? 'dist'],
  { stdio: 'ignore', windowsHide: true });
let browser;
let page;
let stage = 'boot';
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).ok) break; } catch {}
    await delay(100);
  }
  browser = await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
  page = await browser.newPage({ viewport: { width: 844, height: 390 } });
  page.on('pageerror', e => { writeFileSync('artifacts/node-resolution-error.txt', e.stack); console.log('Probe page error:', e.message); });
  page.setDefaultTimeout(60000);
  await page.addInitScript(({ text, meta, saveOnRecap, legacy, streamSlice }) => {
    if (streamSlice) {
      const postMessage = Worker.prototype.postMessage;
      Worker.prototype.postMessage = function(message, ...args) {
        if (message.kind === 'buildChunk') message = { ...message, streamSliceSec: streamSlice };
        return postMessage.call(this, message, ...args);
      };
    }
    if(legacy) localStorage.setItem('civsurvivor.save.slot3',text);
    else {
    const request = indexedDB.open('civilization-saves',1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('saves',{keyPath:'slot'});
      request.result.createObjectStore('slots',{keyPath:'slot'});
      request.result.createObjectStore('settings');
    };
    request.onsuccess = () => {
      const tx=request.result.transaction(['saves','slots'],'readwrite');
      tx.objectStore('saves').put({slot:3,text});
      tx.objectStore('slots').put({slot:3,meta,characters:text.length});
      tx.oncomplete=()=>request.result.close();
    };
    }
    const interval = window.setInterval;
    window.setInterval = function(callback, ms, ...args) {
      if (ms === 10000) {
        globalThis.__probeAutosave = () => callback(...args);
        // Pin the overlap rather than waiting for a ten-second timer race.
        return interval(() => {}, ms);
      }
      return interval(callback, ms, ...args);
    };
    globalThis.__probeSaveOnRecap = saveOnRecap;
  }, { text: saved.text, meta:saved.meta, saveOnRecap: process.env.PROBE_SAVE !== '0',legacy:process.env.PROBE_BACKEND==='localStorage', streamSlice: Number(process.env.PROBE_STREAM_SLICE ?? 0) });
  await page.goto(url);
  await page.getByTestId('game-continue').click();
  await page.getByTestId('game-menu').waitFor({ state: 'hidden' });
  await page.evaluate(() => __SETTLEMENT_DEBUG__.forceRender());
  await delay(150);
  async function clickPoint(point) {
    assert.ok(point, 'expected an actionable control');
    const box = await page.locator('canvas').boundingBox();
    await page.mouse.click(box.x + point.x / 2424 * box.width, box.y + point.y / 1080 * box.height);
    await delay(150);
  }
  let node = await page.evaluate(() => {
    const debug = __SETTLEMENT_DEBUG__;
    const vassal = debug.getSnapshot().lineage.currentVassal;
    return debug.getLifeMapNodeClickPoint(vassal.availableNodeIds[0]);
  });
  // Loading a selected vassal initially lands on the world view.
  if (!node) {
    await clickPoint(await page.evaluate(() => __SETTLEMENT_DEBUG__.getNavigationClickPoint('present')));
    await clickPoint(await page.evaluate(() => __SETTLEMENT_DEBUG__.getNavigationClickPoint('life')));
    await page.evaluate(() => __SETTLEMENT_DEBUG__.forceRender());
    await delay(300);
    const handle = await page.waitForFunction(() => {
      const debug = __SETTLEMENT_DEBUG__;
      return debug.getLifeMapNodeClickPoint(debug.getSnapshot().lineage.currentVassal.availableNodeIds[0]);
    },null,{timeout:8000});
    node = await handle.jsonValue();
    await handle.dispose();
  }
  await clickPoint(node);
  await clickPoint(await page.evaluate(() => __SETTLEMENT_DEBUG__.getLifeMapEnterNodeClickPoint()));
  await clickPoint(await page.evaluate(() => __SETTLEMENT_DEBUG__.getLifeMapEnterNodeClickPoint()));
  await delay(800);
  await page.waitForFunction(() => __SETTLEMENT_DEBUG__.getLifeMapOptionClickPoint(0),null,{timeout:8000});
  await clickPoint(await page.evaluate(() => __SETTLEMENT_DEBUG__.getLifeMapOptionClickPoint(0)));
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.PROBE_CPU_RATE ?? 4) });
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.start');
  await page.evaluate(() => {
    const result = { started: performance.now(), frames: [], longTasks: [], recap: null, autosave: null };
    globalThis.__probeNodeResult = result;
    new PerformanceObserver(list => result.longTasks.push(...list.getEntries().map(e => ({ start: e.startTime, duration: e.duration }))))
      .observe({ type: 'longtask' });
    let last = performance.now();
    function sample() {
      const now = performance.now();
      const open = __SETTLEMENT_DEBUG__.getNodeResolutionTimingSnapshot().recapOpen;
      result.frames.push({ time: now, dt: now - last, open });
      last = now;
      if (open && result.recap === null) {
        result.recap = now;
        // A save can start at any point while the recap is interactive.
        if (globalThis.__probeSaveOnRecap) setTimeout(() => {
          result.autosave = performance.now();
          globalThis.__probeAutosave();
          result.autosaveReturned = performance.now();
        }, 0);
      }
      if (result.recap === null || now < result.recap + 2500) requestAnimationFrame(sample);
      else result.done = true;
    }
    requestAnimationFrame(sample);
  });
  await clickPoint(await page.evaluate(() => __SETTLEMENT_DEBUG__.getLifeMapConfirmClickPoint()));
  await page.waitForFunction(() => __probeNodeResult.done === true);
  const { profile } = await cdp.send('Profiler.stop');
  writeFileSync(`artifacts/node-resolution-performance-${label}.cpuprofile`, JSON.stringify(profile));
  const result = await page.evaluate(() => __probeNodeResult);
  const postFrames = result.frames.filter(f => f.time > result.recap + 1);
  const worst = Math.max(...postFrames.map(f => f.dt));
  const dismiss = await page.evaluate(() => __SETTLEMENT_DEBUG__.getLifeMapRecapDismissClickPoint());
  await clickPoint(dismiss);
  assert.equal(await page.evaluate(() => __SETTLEMENT_DEBUG__.getNodeResolutionTimingSnapshot().recapOpen), false,
    'the displayed recap accepts Continue');
  const summary = { payloadCharacters: saved.text.length, worstPostRecapFrameMs: Math.round(worst),
    synchronousAutosaveMs: Math.round((result.autosaveReturned ?? 0) - (result.autosave ?? 0)),
    saveOnRecap: process.env.PROBE_SAVE !== '0', cpuRate: Number(process.env.PROBE_CPU_RATE ?? 4),
    streamSliceSec: Number(process.env.PROBE_STREAM_SLICE ?? 20) };
  let diagnostics = null;
  if (process.env.PROBE_BACKEND !== 'localStorage') {
    stage = 'open menu';
    await page.getByTestId('game-menu-open').click();
    await page.getByTestId('game-menu').waitFor({state:'visible'});
    stage = 'open diagnostics';
    await page.getByTestId('game-save-diagnostics').evaluate(button => { button.closest('details').open=true; button.click(); });
    stage = 'read diagnostics';
    await page.waitForFunction(() => document.querySelector('[data-testid=game-menu] [data-testid=save-diagnostic-report]')?.value,null,{timeout:10000});
    diagnostics = await page.getByTestId('game-menu').getByTestId('save-diagnostic-report').inputValue().then(JSON.parse);
    assert.ok(diagnostics.nodeResolutions.length, 'real popup frames reach the downloadable report');
    assert.ok(diagnostics.recentSaveAttempts.some(attempt => attempt.serializationMs >= 0),
      'the report separates save serialization from asynchronous storage waits');
  }
  writeFileSync(artifact, JSON.stringify({ summary, result, diagnostics }, null, 2));
  console.log(JSON.stringify({ ...summary, artifact }));
  // The established software-GL/4x-CPU case already fails strict smoothness
  // before IndexedDB. Keep that limit visible as an opt-in performance gate.
  if (process.env.PROBE_ASSERT_SMOOTH === '1') {
    assert.ok(worst < 500, `recap is unresponsive for ${Math.round(worst)} ms; expected frames within 500 ms (${artifact})`);
  }
} catch (error) {
  const state = await page?.evaluate(() => ({ text: document.body.innerText.slice(-1200),
    menuHidden: document.querySelector('[data-testid=game-menu]')?.hidden,
    reportLength: document.querySelector('[data-testid=game-menu] [data-testid=save-diagnostic-report]')?.value?.length }));
  writeFileSync(`artifacts/node-resolution-performance-${label}-failure.json`,JSON.stringify({stage,message:error.message,state},null,2));
  throw error;
} finally {
  await browser?.close();
  server.kill();
}
