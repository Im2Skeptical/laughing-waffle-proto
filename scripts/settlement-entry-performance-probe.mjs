// Cold game entry and first settlement navigation. Details stay in artifacts/.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { BROWSER_PROBE_LAUNCH_OPTIONS } from './browser-probe-config.mjs';

const label = process.argv[2] ?? 'current';
const port = Number(process.env.PROBE_PORT ?? 18186);
const url = process.env.PROBE_URL ?? `http://localhost:${port}`;
const cpuRate = Number(process.env.PROBE_CPU_RATE ?? 1);
mkdirSync('artifacts', { recursive: true });
let savePath = process.env.PROBE_SAVE;
if (process.env.PROBE_FIXTURE_SEC) {
  const seconds = Number(process.env.PROBE_FIXTURE_SEC);
  assert.ok(Number.isInteger(seconds) && seconds >= 0, 'fixture length must be a nonnegative integer');
  const { createNewGameState } = await import('../src/model/new-game.js');
  const { createEmptyTimelineFromBase, maintainCheckpoints } = await import('../src/model/timeline/index.js');
  const { initializeReplayClock, advanceReplayStateOneSecond } = await import('../src/model/replay-second-runner.js');
  const { exportSave } = await import('../src/controllers/sim-runner/save-slots.js');
  const state = createNewGameState(123), timeline = createEmptyTimelineFromBase(state);
  initializeReplayClock(state, 0);
  for (let sec = 1; sec <= seconds; sec++) {
    assert.ok(advanceReplayStateOneSecond(state).ok, `fixture cannot advance to ${sec}`);
    maintainCheckpoints(timeline, state, { writeMemo: false });
  }
  const saved = exportSave({ state, timeline, setupId: 'entry-performance' });
  assert.ok(saved.ok, 'fixture must serialize through the real save path');
  savePath = `artifacts/settlement-entry-fixture-${seconds}.json`;
  writeFileSync(savePath, saved.text);
}
const browser = await chromium.launch(process.env.PROBE_SOFTWARE_GL === '1'
  ? BROWSER_PROBE_LAUNCH_OPTIONS
  : { headless: true, args: ['--enable-gpu', ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : [])] });
const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
page.setDefaultTimeout(60000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
const session = await page.context().newCDPSession(page);
const browserSession = await browser.newBrowserCDPSession();
const gpu = (await browserSession.send('SystemInfo.getInfo')).gpu.devices;
let server;
await session.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
await page.addInitScript(() => {
  globalThis.__PERF_ENABLED__ = false;
  // Pin initial seed selection; simulation still uses its serialized RNG.
  crypto.getRandomValues = array => { array.fill(123); return array; };
  globalThis.__entryTiming = { frames: [], tasks: [], marks: [] };
  let last = performance.now();
  function frame(time) {
    __entryTiming.frames.push({ at: time, ms: time - last });
    last = time;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  new PerformanceObserver(list => __entryTiming.tasks.push(...list.getEntries()
    .map(entry => ({ at: entry.startTime, ms: entry.duration }))))
    .observe({ type: 'longtask' });
});
async function mark(name) {
  return page.evaluate(name => { const at = performance.now(); __entryTiming.marks.push({ name, at }); return at; }, name);
}
async function navigate(id) {
  await page.waitForFunction(id => !!__SETTLEMENT_DEBUG__.getNavigationClickPoint(id), id);
  const point = await page.evaluate(id => __SETTLEMENT_DEBUG__.getNavigationClickPoint(id), id);
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.click(box.x + point.x / 2424 * box.width, box.y + point.y / 1080 * box.height);
}
try {
  if (!process.env.PROBE_URL) {
    server = spawn(process.execPath, ['node_modules/serve/bin/serve.js', '-l', String(port), '--no-clipboard', 'dist'],
      { stdio: 'ignore', windowsHide: true });
    let ready = false;
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(url)).ok) { ready = true; break; } } catch {}
      await delay(100);
    }
    assert.ok(ready, `probe server unavailable at ${url}`);
  }
  if (process.env.PROBE_PROFILE === '1') {
    await session.send('Profiler.enable');
    await session.send('Profiler.start');
  }
  await page.goto(url);
  await page.getByTestId('game-new').waitFor();
  await page.waitForFunction(() => !document.querySelector('[data-testid=game-new]').disabled);
  const result = { label, cpuRate, gpu, errors };
  if (process.env.PROBE_SAVE_ONLY !== '1') {
    await mark('new');
    await page.getByTestId('game-new').click();
    await page.getByTestId('game-slot-1').click();
    await page.getByTestId('game-menu').waitFor({ state: 'hidden' });
    await mark('entered');
    await page.waitForFunction(() => __SETTLEMENT_DEBUG__.getSnapshot().opening.phase === 'completed');
    await mark('openingComplete');
    await navigate('present');
    await page.waitForFunction(() => {
      const s = __SETTLEMENT_DEBUG__.getSnapshot(); return s.viewedSec === s.frontierSec;
    });
    await mark('flagClick');
    const flag = await page.evaluate(() => {
      const d = __SETTLEMENT_DEBUG__, regionId = d.getSnapshot().worldMap.selectedRegionId;
      const cacheBefore = d.getSnapshot().worldMap.regionPanelCache;
      const start = performance.now(); d.selectWorldRegion(regionId);
      return { regionId, handlerMs: performance.now() - start, cacheBefore,
        cacheAfter: d.getSnapshot().worldMap.regionPanelCache };
    });
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await mark('flagPaint');
    if (process.env.PROBE_SCENE === '1') await page.evaluate(() => {
      const stats = __entryTiming.scene = { destroyedTexts: 0, textUpdates: 0, textUpdateMs: 0, graphicsBatches: 0, graphicsMs: 0 };
      const destroy = PIXI.Text.prototype.destroy;
      PIXI.Text.prototype.destroy = function(...args) { stats.destroyedTexts++; return destroy.apply(this, args); };
      const update = PIXI.Text.prototype.updateText;
      PIXI.Text.prototype.updateText = function(...args) { const t = performance.now(); stats.textUpdates++; const r = update.apply(this, args); stats.textUpdateMs += performance.now() - t; return r; };
      const batches = PIXI.GraphicsGeometry.prototype.updateBatches;
      PIXI.GraphicsGeometry.prototype.updateBatches = function(...args) { const t = performance.now(); stats.graphicsBatches++; const r = batches.apply(this, args); stats.graphicsMs += performance.now() - t; return r; };
    });
    await mark('settlementClick');
    await navigate('settlement');
    await page.waitForFunction(() => __SETTLEMENT_DEBUG__.getSnapshot().view?.visible === true);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await mark('settlementPaint');
    const scene = await page.evaluate(() => __entryTiming.scene ?? null);
    await navigate('map');
    await mark('secondClick');
    await navigate('settlement');
    await page.waitForFunction(() => __SETTLEMENT_DEBUG__.getSnapshot().view?.visible === true);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await mark('secondPaint');
    const timing = await page.evaluate(() => ({ ...__entryTiming, perf: __SETTLEMENT_DEBUG__.getPerfSnapshot() }));
    const marks = Object.fromEntries(timing.marks.map(mark => [mark.name, mark.at]));
    const range = (from, to) => {
      const frames = timing.frames.filter(frame => frame.at >= marks[from] && frame.at <= marks[to]).map(frame => frame.ms);
      const tasks = timing.tasks.filter(task => task.at >= marks[from] && task.at <= marks[to]);
      return { elapsedMs: marks[to] - marks[from], worstFrameMs: Math.max(0, ...frames), worstTaskMs: Math.max(0, ...tasks.map(task => task.ms)) };
    };
    Object.assign(result, { entry: range('new', 'entered'), opening: range('entered', 'openingComplete'),
      firstFlag: { ...range('flagClick', 'flagPaint'), ...flag },
      firstSettlement: { ...range('settlementClick', 'settlementPaint'), scene }, secondSettlement: range('secondClick', 'secondPaint'), timing });
    await page.getByTestId('game-menu-open').click();
  } else assert.ok(savePath, 'PROBE_SAVE_ONLY requires a save fixture');
  if (savePath) {
    await page.evaluate(async text => {
      const { meta } = JSON.parse(text);
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('civilization-saves', 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      await new Promise((resolve, reject) => {
        const tx = db.transaction(['saves', 'slots'], 'readwrite');
        tx.objectStore('saves').put({ slot: 1, text });
        tx.objectStore('slots').put({ slot: 1, meta });
        tx.oncomplete = resolve; tx.onabort = () => reject(tx.error);
      });
      db.close();
    }, readFileSync(savePath, 'utf8'));
  }
  await page.reload();
  await page.getByTestId('game-continue').waitFor();
  const loadStart = await mark('load');
  await page.getByTestId('game-continue').click();
  await page.getByTestId('game-menu').waitFor({ state: 'hidden' });
  result.coldLoad = { elapsedMs: await mark('loaded') - loadStart };
  result.coldTiming = await page.evaluate(() => __entryTiming);
  const loadEnd = result.coldTiming.marks.find(mark => mark.name === 'loaded').at;
  result.coldLoad.worstFrameMs = Math.max(0, ...result.coldTiming.frames
    .filter(frame => frame.at >= loadStart && frame.at <= loadEnd).map(frame => frame.ms));
  result.coldLoad.worstTaskMs = Math.max(0, ...result.coldTiming.tasks
    .filter(task => task.at >= loadStart && task.at <= loadEnd).map(task => task.ms));
  await navigate('present');
  await page.waitForFunction(() => {
    const s = __SETTLEMENT_DEBUG__.getSnapshot(); return s.viewedSec === s.frontierSec;
  });
  result.loadedFlag = await page.evaluate(() => {
    const d = __SETTLEMENT_DEBUG__, before = d.getSnapshot();
    const start = performance.now(); d.selectWorldRegion(before.worldMap.selectedRegionId);
    const handlerMs = performance.now() - start;
    const after = d.getSnapshot();
    return { handlerMs, cacheBefore: before.worldMap.regionPanelCache,
      cacheAfter: after.worldMap.regionPanelCache, panelVisible: after.worldMap.detailPanelVisible,
      historyUnchanged: JSON.stringify(before.runner.timeline) === JSON.stringify(after.runner.timeline) };
  });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  if (process.env.PROBE_PROFILE === '1') {
    const { profile } = await session.send('Profiler.stop');
    writeFileSync(`artifacts/settlement-entry-profile-${label}.json`, JSON.stringify(profile));
  }
  writeFileSync(`artifacts/settlement-entry-${label}.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ label, cpuRate, entry: result.entry, opening: result.opening,
    firstFlag: result.firstFlag,
    coldLoad: result.coldLoad, loadedFlag: result.loadedFlag,
    firstSettlement: result.firstSettlement, secondSettlement: result.secondSettlement, errors,
    artifact: `artifacts/settlement-entry-${label}.json` }));
  assert.deepEqual(errors, []);
  if (process.env.PROBE_ASSERT_LOAD_MAX_MS) {
    assert.ok(result.coldLoad.elapsedMs <= Number(process.env.PROBE_ASSERT_LOAD_MAX_MS),
      `cold load ${result.coldLoad.elapsedMs.toFixed(0)}ms exceeds ${process.env.PROBE_ASSERT_LOAD_MAX_MS}ms; see artifact`);
  }
  if (process.env.PROBE_ASSERT_PREPARED === '1') {
    assert.ok(result.loadedFlag.cacheBefore?.count > 0, 'load must prepare the panels opened by map flags');
    assert.equal(result.loadedFlag.cacheAfter.builds, result.loadedFlag.cacheBefore.builds,
      'first loaded settlement reuses its uploaded scene');
    assert.equal(result.loadedFlag.panelVisible, true);
    assert.equal(result.loadedFlag.historyUnchanged, true);
  }
  if (process.env.PROBE_ASSERT_SMOOTH === '1' && result.firstSettlement) {
    assert.ok(result.firstSettlement.worstFrameMs < 100, 'first settlement frame must stay under 100ms');
    assert.ok(result.opening.worstFrameMs < 100, 'opening frames must stay under 100ms');
  }
} finally { await browser.close(); server?.kill(); }
