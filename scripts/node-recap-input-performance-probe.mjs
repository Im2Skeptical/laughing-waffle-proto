// Actual consecutive decisions with ordinary autosaving. Measures quick-tap
// Continue feedback/closure rather than an unrelated frame-smoothness limit.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { BROWSER_PROBE_LAUNCH_OPTIONS } from './browser-probe-config.mjs';
import { createNewGameState } from '../src/model/new-game.js';
import { ActionKinds, applyAction } from '../src/model/actions.js';
import { getVassalCandidatePool } from '../src/model/vassal-life-map.js';
import { createTimelineFromInitialState } from '../src/model/timeline/index.js';
import { exportSave } from '../src/controllers/sim-runner/save-slots.js';

const port = 18187;
const url = `http://127.0.0.1:${port}`;
const label = process.env.PROBE_LABEL ?? 'consecutive';
const profileEnabled = process.env.PROBE_PROFILE === '1';
const artifact = `artifacts/node-recap-input-${label}.json`;
mkdirSync('artifacts', { recursive: true });
const state = createNewGameState(Number(process.env.PROBE_SEED ?? 735));
const pool = getVassalCandidatePool(state);
assert.equal(applyAction(state, { kind: ActionKinds.SETTLEMENT_SELECT_VASSAL,
  payload: { candidateIndex: 0, expectedPoolHash: pool.expectedPoolHash } }, { isReplay: true }).ok, true);
const saved = exportSave({ state, timeline: createTimelineFromInitialState(state) });
assert.equal(saved.ok, true);
const server = spawn(process.execPath, ['node_modules/serve/bin/serve.js', '-l', String(port), '--no-clipboard', 'dist'],
  { stdio: 'ignore', windowsHide: true });
let browser, page, stage = 'boot';
const turns = [], errors = [];
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).ok) break; } catch {}
    await delay(100);
  }
  browser = await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
  page = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true });
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ text, meta, saveEnabled }) => {
    globalThis.__probeWorkers = [];
    const NativeWorker = globalThis.Worker;
    globalThis.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args);
        this.probe = { createdMs: performance.now(), events: [] };
        globalThis.__probeWorkers.push(this.probe);
        this.addEventListener('message', ({ data }) => {
          this.probe.events.push({ atMs: performance.now(), kind: data.kind, endSec: data.endSec, done: data.done });
          if (this.probe.events.length > 8) this.probe.events.shift();
        });
        this.addEventListener('error', event => { this.probe.error = event.message; });
      }
      postMessage(data, ...args) {
        this.probe.request = { atMs: performance.now(), kind: data.kind, baseSec: data.baseSec, endSec: data.endSec };
        return super.postMessage(data, ...args);
      }
      terminate() { this.probe.terminatedMs = performance.now(); return super.terminate(); }
    };
    const request = indexedDB.open('civilization-saves', 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('saves', { keyPath: 'slot' });
      request.result.createObjectStore('slots', { keyPath: 'slot' });
      request.result.createObjectStore('settings');
    };
    request.onsuccess = () => {
      const tx = request.result.transaction(['saves', 'slots'], 'readwrite');
      tx.objectStore('saves').put({ slot: 3, text });
      tx.objectStore('slots').put({ slot: 3, meta, characters: text.length });
      tx.oncomplete = () => request.result.close();
    };
    if (!saveEnabled) {
      const interval = window.setInterval;
      window.setInterval = function(callback, ms, ...args) {
        return interval(ms === 10000 ? () => {} : callback, ms, ...args);
      };
    }
  }, { text: saved.text, meta: saved.meta, saveEnabled: process.env.PROBE_SAVE !== '0' });
  await page.goto(url);
  await page.getByTestId('game-continue').click();
  await page.getByTestId('game-menu').waitFor({ state: 'hidden' });
  const cdp = await page.context().newCDPSession(page);
  const point = (method, arg) => page.evaluate(({ method, arg }) => __SETTLEMENT_DEBUG__[method](arg), { method, arg });
  async function click(method, arg) {
    const handle = await page.waitForFunction(({ method, arg }) => __SETTLEMENT_DEBUG__[method](arg), { method, arg });
    const p = await handle.jsonValue(); await handle.dispose();
    const box = await page.locator('canvas').boundingBox();
    await page.mouse.click(box.x + p.x * box.width / 2424, box.y + p.y * box.height / 1080);
    await delay(180);
  }
  await click('getNavigationClickPoint', 'present');
  await click('getNavigationClickPoint', 'life');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.PROBE_CPU_RATE ?? 4) });
  await cdp.send('Performance.enable');
  if (profileEnabled) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.start'); }
  const profileClock = (await cdp.send('Performance.getMetrics')).metrics
    .filter(metric => ['Timestamp', 'NavigationStart'].includes(metric.name));
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    canvas.addEventListener('pointerdown', event => {
      const input = globalThis.__recapInput;
      if (!input || input.downAtMs != null) return;
      input.downAtMs = performance.now();
      input.eventTimestamp = event.timeStamp;
      queueMicrotask(() => {
        input.handledDownAtMs = performance.now();
        input.pressState = __SETTLEMENT_DEBUG__.getNodeResolutionTimingSnapshot().recapContinueState;
      });
      function sample() {
        const state = __SETTLEMENT_DEBUG__.getNodeResolutionTimingSnapshot();
        if (state.recapContinueState === 'pressed') input.feedbackFrameAtMs ??= performance.now();
        if (!state.recapOpen) input.closedAtMs ??= performance.now();
        if (input.closedAtMs == null) requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    }, { capture: true });
    canvas.addEventListener('pointerup', () => {
      if (globalThis.__recapInput) globalThis.__recapInput.upAtMs = performance.now();
    }, { capture: true });
  });

  for (let turn = 0; turn < Number(process.env.PROBE_NODES ?? 7); turn++) {
    stage = `enter node ${turn + 1}`;
    const node = await page.evaluate(() => __SETTLEMENT_DEBUG__.getLifeDecisionTimingSnapshot().nextNodeId);
    assert.ok(node, 'the fixture must have another reachable node');
    await click('getLifeMapNodeClickPoint', node);
    await click('getLifeMapEnterNodeClickPoint');
    await page.waitForFunction(() => {
      const state = __SETTLEMENT_DEBUG__.getLifeDecisionTimingSnapshot();
      return !state.processing && state.currentNodeId !== null;
    }, null, { polling: 100 });
    const option = await point('getLifeMapOptionClickPoint', 0);
    if (option) await click('getLifeMapOptionClickPoint', 0);
    const family = await page.evaluate(() => __SETTLEMENT_DEBUG__.getLifeDecisionTimingSnapshot().family);
    stage = `confirm node ${turn + 1} (${family})`;
    await click('getLifeMapConfirmClickPoint');
    await page.waitForFunction(() => __SETTLEMENT_DEBUG__.getNodeResolutionTimingSnapshot().recapOpen);
    const dismiss = await point('getLifeMapRecapDismissClickPoint');
    const box = await page.locator('canvas').boundingBox();
    const touchPoint = { x: box.x + dismiss.x * box.width / 2424, y: box.y + dismiss.y * box.height / 1080,
      id: 1, radiusX: 5, radiusY: 5, force: 1 };
    const meta = await page.evaluate(() => {
      const snapshot = __SETTLEMENT_DEBUG__.getLifeDecisionTimingSnapshot();
      return { ended: snapshot.endedReason, level: snapshot.queuedLevelUp,
        second: snapshot.frontierSec, checkpoints: snapshot.checkpointCount, forecastWorker: snapshot.forecastWorker };
    });
    stage = `tap Continue ${turn + 1}`;
    await page.evaluate(() => { globalThis.__recapInput = {}; });
    const requestedDownEpochMs = Date.now();
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [touchPoint], timestamp: requestedDownEpochMs / 1000 });
    await delay(70);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [], timestamp: Date.now() / 1000 });
    await page.waitForFunction(() => globalThis.__recapInput?.closedAtMs != null);
    const input = await page.evaluate(() => { const input = globalThis.__recapInput; globalThis.__recapInput = null;
      return { ...input, timeOrigin: performance.timeOrigin }; });
    const workers = await page.evaluate(() => globalThis.__probeWorkers.map(worker => ({ ...worker })));
    const response = Math.min(input.feedbackFrameAtMs ?? Infinity, input.closedAtMs);
    const { metrics } = await cdp.send('Performance.getMetrics');
    turns.push({ turn: turn + 1, node, family, ...meta, input,
      dispatchDelayMs: Math.round(input.downAtMs + input.timeOrigin - requestedDownEpochMs),
      responseMs: Math.round(response + input.timeOrigin - requestedDownEpochMs),
      closeMs: Math.round(input.closedAtMs + input.timeOrigin - requestedDownEpochMs),
      heapBytes: metrics.find(m => m.name === 'JSHeapUsedSize')?.value, workers });
    writeFileSync(artifact, JSON.stringify({ turns, errors, profileClock }, null, 2));
    assert.equal(meta.ended, null, 'the deterministic early fixture should survive');
    if (meta.level) {
      await click('getLifeMapLevelUpChoiceClickPoint', 0);
      await click('getLifeMapLevelUpConfirmClickPoint');
      await page.waitForFunction(() => !__SETTLEMENT_DEBUG__.getLifeDecisionTimingSnapshot().processing);
    }
  }
  if (profileEnabled) {
    const { profile } = await cdp.send('Profiler.stop');
    writeFileSync(`artifacts/node-recap-input-${label}.cpuprofile`, JSON.stringify(profile));
  }
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ responseMs: turns.map(t => t.responseMs), closeMs: turns.map(t => t.closeMs), artifact }));
  if (process.env.PROBE_ASSERT_INPUT !== '0') {
    assert.ok(turns.every(t => t.responseMs <= 250), `Continue feedback exceeds 250ms: ${turns.map(t => t.responseMs).join(', ')} (${artifact})`);
    assert.ok(turns.every(t => t.closeMs <= 750), `Continue dismissal exceeds 750ms: ${turns.map(t => t.closeMs).join(', ')} (${artifact})`);
    assert.ok(turns.every(t => !t.forecastWorker?.disabled), `Forecast worker disabled during a healthy consecutive run (${artifact})`);
  }
} catch (error) {
  writeFileSync(artifact, JSON.stringify({ stage, error: error.message, turns, errors }, null, 2));
  throw error;
} finally { await browser?.close(); server.kill(); }
