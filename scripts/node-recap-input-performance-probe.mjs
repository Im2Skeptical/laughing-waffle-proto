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
import { getClockTimePassage } from '../src/views/sunandmoon-disks-pixi.js';
import { getTimeRevealCounters } from '../src/views/consequential-time-pixi.js';

const port = 18187;
const url = `http://127.0.0.1:${port}`;
const label = process.env.PROBE_LABEL ?? 'consecutive';
const profileEnabled = process.env.PROBE_PROFILE === '1';
const throughEnd = process.env.PROBE_UNVEIL === '1';
const measureAnimation = process.env.PROBE_ANIMATION === '1';
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
let unveil = null;
let profileClock = null;
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).ok) break; } catch {}
    await delay(100);
  }
  browser = await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
  page = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true });
  page.setDefaultTimeout(30000);
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(({ text, meta, saveEnabled, measureAnimation }) => {
    // Keep the requested viewport while testing responsive animation/layout.
    // Headless fullscreen substitutes the host display size for phone metrics.
    if (measureAnimation) Element.prototype.requestFullscreen = async () => {};
    globalThis.__probeWorkers = [];
    const NativeWorker = globalThis.Worker;
    globalThis.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args);
        this.probe = { createdMs: performance.now(), events: [] };
        globalThis.__probeWorkers.push(this.probe);
        this.addEventListener('message', ({ data }) => {
          const entries=data.result?.stateDataBySecond;
          this.probe.events.push({ atMs: performance.now(), kind: data.kind, endSec: data.endSec, done: data.done,
            sharedConfig:Array.isArray(entries)&&entries.length>1
              ? data.result.sharedConfig?.id != null && entries.every(([, snapshot]) => snapshot.gameConfig == null) : null });
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
  }, { text: saved.text, meta: saved.meta, saveEnabled: process.env.PROBE_SAVE !== '0', measureAnimation });
  await page.goto(url);
  await page.getByTestId('game-continue').click();
  await page.getByTestId('game-menu').waitFor({ state: 'hidden' });
  // This imported fixture bypasses the normal new-game opening. Finish its
  // initial coverage/loading before playing; never delay a tap after a recap.
  await page.waitForFunction(() => globalThis.__probeWorkers.some(worker =>
    worker.request?.kind === 'buildChunk' && worker.events.some(event => event.done === true)),
    null, { timeout: 120000 });
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
  async function checkHeaderLayout(viewport) {
    await page.setViewportSize(viewport);
    await delay(250);
    const header = await page.evaluate(() => {
      const canvas = document.querySelector('canvas').getBoundingClientRect();
      const controls = document.querySelector('[data-testid="utility-controls"]').getBoundingClientRect();
      return { actualY: controls.y + controls.height / 2,
        expectedY: canvas.y + canvas.height * 43 / 1080 };
    });
    assert.ok(Math.abs(header.actualY - header.expectedY) < 1,
      `Save & menu must stay centered in the game header: ${JSON.stringify({ viewport, ...header })}`);
  }
  if (measureAnimation) for (const viewport of [{ width: 1280, height: 800 }, { width: 844, height: 390 }]) {
    await checkHeaderLayout(viewport);
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(process.env.PROBE_CPU_RATE ?? 4) });
  await cdp.send('Performance.enable');
  if (profileEnabled) { await cdp.send('Profiler.enable'); await cdp.send('Profiler.start'); }
  profileClock = (await cdp.send('Performance.getMetrics')).metrics
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
    await click('getLifeMapEnterNodeClickPoint');
    await page.waitForFunction(() => {
      const state = __SETTLEMENT_DEBUG__.getLifeDecisionTimingSnapshot();
      return !state.processing && state.currentNodeId !== null;
    }, null, { polling: 100 });
    const option = await point('getLifeMapOptionClickPoint', 0);
    if (option) await click('getLifeMapOptionClickPoint', 0);
    const family = await page.evaluate(() => __SETTLEMENT_DEBUG__.getLifeDecisionTimingSnapshot().family);
    const committedBefore = await page.evaluate(() => __SETTLEMENT_DEBUG__.getLifeDecisionTimingSnapshot().frontierSec);
    stage = `confirm node ${turn + 1} (${family})`;
    if (measureAnimation) await page.evaluate(() => {
      globalThis.__recapAnimation = { frames: [], done: false };
      let first = null, previous = null, progress = 0;
      function sample() {
        const time = performance.now();
        const state = __SETTLEMENT_DEBUG__.getNodeResolutionTimingSnapshot();
        if (state.recapOpen && state.recapClock) {
          __recapAnimation.rotationMode ??= state.recapClock.rotationMode;
          __recapAnimation.previousCounters ??= state.recapClock.previousCounters;
          first ??= time;
          __recapAnimation.frames.push({ atMs: time - first, gapMs: previous == null ? 0 : time - previous,
            progress: state.recapClock.progress, jump: state.recapClock.progress - progress,
            recoil: state.recapClock.recoil,
            processingVisible: state.processingVisible,
            second: state.recapClock.second,
            moonRotation: state.recapClock.moonRotation, seasonRotation: state.recapClock.seasonRotation });
          previous = time; progress = state.recapClock.progress;
          if (state.recapClock.locked) { __recapAnimation.done = true; return; }
        }
        requestAnimationFrame(sample);
      }
      requestAnimationFrame(sample);
    });
    await click('getLifeMapConfirmClickPoint');
    await page.waitForFunction(() => __SETTLEMENT_DEBUG__.getNodeResolutionTimingSnapshot().recapOpen);
    let animation = null;
    if (measureAnimation) {
      await page.waitForFunction(() => __recapAnimation.done);
      animation = await page.evaluate(() => __recapAnimation);
      if (turn === 0) for (const viewport of [{ width: 1280, height: 800 }, { width: 844, height: 390 }]) {
        await checkHeaderLayout(viewport);
      }
    }
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
    turns.push({ turn: turn + 1, node, family, committedBefore, ...meta, input, animation,
      dispatchDelayMs: Math.round(input.downAtMs + input.timeOrigin - requestedDownEpochMs),
      responseMs: Math.round(response + input.timeOrigin - requestedDownEpochMs),
      closeMs: Math.round(input.closedAtMs + input.timeOrigin - requestedDownEpochMs),
      heapBytes: metrics.find(m => m.name === 'JSHeapUsedSize')?.value, workers });
    writeFileSync(artifact, JSON.stringify({ turns, errors, profileClock }, null, 2));
    if (meta.ended && throughEnd) {
      stage = 'post-vassal future unveil';
      await page.evaluate(() => {
        globalThis.__unveilFrames = []; const start = performance.now(); let previous = start;
        function sample() {
          const time = performance.now();
          __unveilFrames.push(time - previous); previous = time;
          if (time - start < 12000) requestAnimationFrame(sample);
          else globalThis.__unveilComplete = true;
        }
        requestAnimationFrame(sample);
      });
      await page.waitForFunction(() => globalThis.__unveilComplete, null, { timeout: 90000 });
      unveil = await page.evaluate(() => {
        const frames = __unveilFrames.sort((a,b) => a-b);
        return { frames: frames.length, p95Ms: frames[Math.floor(frames.length*.95)],
          maxMs: Math.max(...frames), ...__SETTLEMENT_DEBUG__.getNodeResolutionTimingSnapshot(),
          worker: __SETTLEMENT_DEBUG__.getLifeDecisionTimingSnapshot().forecastWorker };
      });
      writeFileSync(artifact, JSON.stringify({ turns, errors, profileClock, unveil }, null, 2));
      break;
    }
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
  if (measureAnimation) {
    assert.ok(turns.every(turn => turn.animation.frames.at(-1).second > turn.animation.frames[0].second),
      `recap must count from previous committed time to the new total (${artifact})`);
    for (const turn of turns) {
      const frames = turn.animation.frames;
      assert.equal(frames[0].second, turn.committedBefore, 'recap starts at the previous committed time');
      assert.equal(frames.at(-1).second, turn.second, 'recap stops at the new total');
      const clock = getClockTimePassage({ ...state, tSec: turn.committedBefore }, { tSec: turn.second });
      assert.equal(turn.animation.rotationMode, 'cyclical', 'recap uses actual cyclical motion');
      assert.deepEqual(turn.animation.previousCounters, getTimeRevealCounters(clock, clock.fromSec),
        'each counter retains its previous committed value beside the arrow');
      const first = frames[0];
      const moonStart = first.moonRotation - first.recoil;
      const seasonStart = first.seasonRotation + first.recoil * .65;
      for (const frame of frames) {
        const moonElapsed = Math.max(0, frame.second - 1) - Math.max(0, first.second - 1);
        const moonTravel = moonElapsed / clock.moonCycleSec * Math.PI * 2;
        const seasonTravel = (frame.second - first.second) / clock.seasonCycleSec * Math.PI * 2;
        assert.ok(Math.abs(frame.moonRotation - moonStart - moonTravel - frame.recoil) < 1e-9,
          `moon wheel follows actual elapsed time (${artifact})`);
        assert.ok(Math.abs(frame.seasonRotation - seasonStart - seasonTravel + frame.recoil * .65) < 1e-9,
          `year wheel follows actual elapsed time (${artifact})`);
      }
    }
    assert.ok(turns.every(turn => turn.animation.frames.every(frame => !frame.processingVisible)),
      `the loading bar must finish before the recap opens (${artifact})`);
    const maxJump = Math.max(...turns.flatMap(turn => turn.animation.frames.map(frame => frame.jump)));
    const maxGap = Math.max(...turns.flatMap(turn => turn.animation.frames.map(frame => frame.gapMs)));
    console.log(`[recap-animation] max jump=${maxJump.toFixed(3)}, max gap=${Math.round(maxGap)}ms; ${artifact}`);
    assert.ok(maxJump < .12 && maxGap < 150, `recap animation stalls: jump=${maxJump.toFixed(3)}, gap=${Math.round(maxGap)}ms (${artifact})`);
  }
  assert.ok(turns.some(turn=>turn.workers.some(worker=>worker.events.some(event=>event.sharedConfig===true))),
    'real browser worker replies must use the shared forecast config reference');
  console.log(JSON.stringify({ responseMs: turns.map(t => t.responseMs), closeMs: turns.map(t => t.closeMs), unveil, artifact }));
  if (throughEnd) {
    assert.ok(unveil, 'the fixture must reach its first vassal end');
    // Catch the reported multi-second freeze separately from the stricter
    // frame-smoothness experiment (software GL at 4x CPU has its own floor).
    const smooth = process.env.PROBE_ASSERT_SMOOTH === '1';
    assert.ok(unveil.p95Ms < (smooth ? 100 : 1000) && unveil.maxMs < (smooth ? 250 : 1000),
      `future unveil stutters: p95=${Math.round(unveil.p95Ms)}ms max=${Math.round(unveil.maxMs)}ms (${artifact})`);
  }
  if (process.env.PROBE_ASSERT_INPUT !== '0') {
    assert.ok(turns.every(t => t.responseMs <= 250), `Continue feedback exceeds 250ms: ${turns.map(t => t.responseMs).join(', ')} (${artifact})`);
    assert.ok(turns.filter(t => !t.ended).every(t => t.closeMs <= 750),
      `Continue dismissal exceeds 750ms: ${turns.map(t => t.closeMs).join(', ')} (${artifact})`);
    // Return to map includes the first map draw, unlike an ordinary Continue.
    // Keep reporting it and catch multi-second navigation separately.
    assert.ok(turns.filter(t => t.ended).every(t => t.closeMs <= 1500),
      `Return to map exceeds 1500ms (${artifact})`);
    assert.ok(turns.every(t => !t.forecastWorker?.disabled), `Forecast worker disabled during a healthy consecutive run (${artifact})`);
  }
} catch (error) {
  writeFileSync(artifact, JSON.stringify({ stage, error: error.message, turns, errors, profileClock, unveil }, null, 2));
  throw error;
} finally { await browser?.close(); server.kill(); }
