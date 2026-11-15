// Browser jobs: New Game → full opening forecast + useful interaction,
// bake (component of that load), timegraph scrub per-step latency.
// Instrumentation wraps Worker only when instrument === true (A1-05).
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import path from 'node:path';
import {
  REPO_ROOT, CONTRACT_ID, HARNESS_ID, FROZEN_SEED, SCRUB_WARM_STEPS, EXPECTED_OPENING_LOSS_SEC,
  NEW_GAME_TIMEOUT_MS, GRAPHICS_OPTIONS_KEY, PINNED_GRAPHICS, ARTWORK_MODE,
  frozenFixtureId, oracleSdkId, population, collectBuildAssets,
} from './identities.mjs';

function stamp() {
  return `[${new Date().toLocaleTimeString('en-AU', { hour12: false, timeZone: 'Australia/Sydney' })} AEDT]`;
}

const require = createRequire(path.join(REPO_ROOT, 'package.json'));
const { chromium } = require('playwright');

function freePort() {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close((err) => (err ? reject(err) : resolve(port)));
    });
    s.on('error', reject);
  });
}

export async function startServer() {
  const port = await freePort();
  const serveJs = path.join(REPO_ROOT, 'node_modules/serve/bin/serve.js');
  const child = spawn(process.execPath, [serveJs, '-l', String(port), '--no-clipboard', 'dist'], {
    cwd: REPO_ROOT, stdio: 'ignore',
  });
  const url = `http://127.0.0.1:${port}`;
  let ok = false;
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).ok) { ok = true; break; } } catch { /* retry */ }
    await delay(100);
  }
  if (!ok) {
    child.kill();
    throw new Error(`preview server failed on ${url}`);
  }
  return {
    url, port,
    async close() { child.kill(); },
  };
}

function workerHook(instrument) {
  return `(function(){
    globalThis.__hcInstrument = ${instrument ? 'true' : 'false'};
    globalThis.__hcOriginalWorker = globalThis.Worker;
    globalThis.__hcWorkerWrapped = false;
    globalThis.__hcWorkerEvents = [];
    if (${instrument ? 'true' : 'false'}) {
      const Original = globalThis.Worker;
      globalThis.Worker = class extends Original {
        constructor(...args){
          super(...args);
          globalThis.__hcWorkerWrapped = true;
          this.addEventListener('message', e => globalThis.__hcWorkerEvents.push({kind:'message', t:performance.now(), done:e.data?.done}));
        }
      };
    }
    globalThis.__hcLongTasks = [];
    try {
      new PerformanceObserver(list => {
        for (const e of list.getEntries()) globalThis.__hcLongTasks.push({start:e.startTime, dur:e.duration});
      }).observe({type:'longtask', buffered:true});
    } catch {}
    // Event Timing (independent of the harness clock) for A1-01 corroboration.
    globalThis.__hcEventTiming = [];
    try {
      new PerformanceObserver(list => {
        for (const e of list.getEntries()) globalThis.__hcEventTiming.push({
          name: e.name, startTime: e.startTime, processingStart: e.processingStart,
          processingEnd: e.processingEnd, duration: e.duration, interactionId: e.interactionId ?? 0,
        });
      }).observe({type:'event', durationThreshold:16, buffered:true});
    } catch {}
    try {
      new PerformanceObserver(list => {
        for (const e of list.getEntries()) globalThis.__hcEventTiming.push({
          name: 'first-input:' + e.name, startTime: e.startTime, processingStart: e.processingStart,
          processingEnd: e.processingEnd, duration: e.duration, interactionId: 0,
        });
      }).observe({type:'first-input', buffered:true});
    } catch {}
    globalThis.__hcMilestones = {};
    globalThis.__hcInputMarks = [];
    const mark = ev => {
      globalThis.__hcInputMarks.push({
        type: ev.type,
        timeStamp: ev.timeStamp,
        handlerNow: performance.now(),
      });
    };
    // Registered at document_start on window, so it runs before any app listener
    // in the capture phase. handlerNow is the first JS-visible moment.
    window.addEventListener('pointerdown', mark, true);
    window.addEventListener('mousedown', mark, true);
    window.addEventListener('click', mark, true);
  })()`;
}

export async function launchPage({ url, cpuThrottle = 1, viewport = 'desktop', instrument = false, query = '', setSeed = true } = {}) {
  // channel: 'chrome' matches the 12 Nov load probe that finished New Game
  // in 72–99 s at 1× on this same box. The Playwright Chromium headless
  // shell sat on a SwiftShader gpu-process at ~400% CPU for 6+ minutes
  // without resolving waitForUseful; that path is not used here.
  const browser = await chromium.launch({
    headless: true,
    channel: 'chrome',
    args: ['--enable-precise-memory-info', '--use-gl=angle', '--use-angle=swiftshader'],
  });
  const mobile = viewport === 'mobile';
  const context = await browser.newContext({
    viewport: mobile ? { width: 844, height: 390 } : { width: 1280, height: 800 },
    isMobile: mobile,
    hasTouch: true,
    deviceScaleFactor: mobile ? 2 : 1,
  });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e)));
  const cdp = await context.newCDPSession(page);
  if (cpuThrottle > 1) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuThrottle });
  }
  await page.addInitScript(workerHook(instrument));
  // F-7: pin graphics experiments to shipped defaults and the ordinary
  // (non-progressive) artwork path; values are read back below.
  await page.addInitScript(({ key, value }) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      localStorage.removeItem('dev.progressiveArtwork');
      localStorage.removeItem('dev.performanceRandomSeed');
    } catch {}
  }, { key: GRAPHICS_OPTIONS_KEY, value: PINNED_GRAPHICS });
  // Commit the frozen seed before the app reads preferences. Playwright fill()
  // alone does not reliably fire the menu's 'change' listener (setSeed).
  await page.addInitScript((seed) => {
    try {
      localStorage.setItem('full-map-redesign-v1.newGame.devSettings', JSON.stringify({
        enabled: false,
        profileId: 'regular-game',
        seed,
      }));
    } catch {}
  }, FROZEN_SEED);
  await page.goto(url + query, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const browserVersion = browser.version();
  const applied = await readAppliedGraphics(page);
  if (!setSeed) {
    return { browser, context, page, cdp, errors, cpuThrottle, viewport, instrument, seedState: null, browserVersion, applied };
  }
  await page.getByText('Developer tools', { exact: true }).click();
  const seedInput = page.getByRole('spinbutton', { name: 'New game seed' });
  await seedInput.fill(String(FROZEN_SEED));
  await seedInput.dispatchEvent('change');
  await seedInput.blur();
  const seedState = await page.evaluate((expected) => {
    const input = document.querySelector('[data-testid="game-new-seed"]');
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem('full-map-redesign-v1.newGame.devSettings') || 'null'); } catch {}
    return { inputValue: input?.value ?? null, storedSeed: stored?.seed ?? null, expected };
  }, FROZEN_SEED);
  if (String(seedState.storedSeed) !== String(FROZEN_SEED) || String(seedState.inputValue) !== String(FROZEN_SEED)) {
    throw new Error(`seed fixture not committed: ${JSON.stringify(seedState)}`);
  }
  return { browser, context, page, cdp, errors, cpuThrottle, viewport, instrument, seedState, browserVersion, applied };
}

export async function readAppliedGraphics(page) {
  return page.evaluate((key) => {
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem(key) || 'null'); } catch {}
    const q = new URLSearchParams(location.search);
    return {
      graphicsOptions: stored,
      search: location.search,
      minimalGraphicsUrl: q.get('dev') === '1',
      performanceUrl: q.get('perf') === '1',
      progressiveArtwork: localStorage.getItem('dev.progressiveArtwork'),
      devicePixelRatio: globalThis.devicePixelRatio,
      innerWidth: globalThis.innerWidth, innerHeight: globalThis.innerHeight,
    };
  }, GRAPHICS_OPTIONS_KEY);
}

export function graphicsPinned(applied) {
  return !!applied && !applied.minimalGraphicsUrl && !applied.performanceUrl
    && Object.keys(PINNED_GRAPHICS).every((k) => applied.graphicsOptions?.[k] === PINNED_GRAPHICS[k]);
}

async function clickNewGame(page) {
  // Arm a page-side capture of the input arrival clock before Playwright dispatches.
  await page.evaluate(() => { globalThis.__hcInputMarks = []; });
  const tArm = await page.evaluate(() => performance.now());
  await page.getByRole('button', { name: 'New game', exact: true }).click();
  // Empty slots label the confirm action "Start here" (see game-menu-dom.js).
  const startHere = page.getByRole('button', { name: 'Start here', exact: true }).first();
  const startVisible = await startHere.isVisible({ timeout: 4000 }).catch(() => false);
  let slotClick = false;
  if (startVisible) {
    await startHere.click();
    slotClick = true;
  } else {
    const slot = page.getByTestId('game-slot-1');
    if (await slot.isVisible({ timeout: 2000 }).catch(() => false)) {
      await slot.click();
      slotClick = true;
    }
  }
  const marks = await page.evaluate(() => globalThis.__hcInputMarks);
  // Input-arrival clock: earliest event.timeStamp after arm. This includes
  // time queued behind a busy main thread (A1-01). Handler-now is diagnostic.
  const arrivals = marks.filter((m) => m.timeStamp >= tArm - 50);
  const startArrival = arrivals.length ? Math.min(...arrivals.map((m) => m.timeStamp)) : tArm;
  const startHandler = arrivals.length ? Math.min(...arrivals.map((m) => m.handlerNow)) : tArm;
  console.log(`${stamp()} clickNewGame slotClick=${slotClick} arrivals=${arrivals.length}`);
  return { tArm, startArrival, startHandler, slotClick, marks };
}

async function snapshotProgress(page) {
  return page.evaluate(() => {
    const menu = document.querySelector('#game-menu');
    const snap = globalThis.__SETTLEMENT_DEBUG__?.getSnapshot?.() ?? null;
    return {
      menuHidden: !menu || menu.hidden === true,
      opening: snap?.opening ?? null,
      baseSeed: snap?.runner?.baseSeed ?? null,
      coverageSec: snap?.opening?.coverageSec ?? null,
      prep: snap?.opening?.preparation ?? null,
      phase: snap?.opening?.phase ?? null,
    };
  });
}

async function waitForUseful(page, timeout = NEW_GAME_TIMEOUT_MS) {
  const started = Date.now();
  await page.evaluate((loss) => { globalThis.__hcMilestones.__expectedLoss = loss; }, EXPECTED_OPENING_LOSS_SEC);
  const iv = setInterval(() => {
    snapshotProgress(page).then((s) => {
      const sec = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`${stamp()} ng-progress t=${sec}s ${JSON.stringify(s)}`);
    }).catch((e) => {
      const sec = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`${stamp()} ng-progress t=${sec}s eval-failed:${e.message}`);
    });
  }, 5000);
  try {
    // After enter(), opening.consume()/begin() sets preparation back to
    // 'idle' and phase to 'revealing' (lossSec is the terminal). Requiring
    // preparation === 'ready' never holds once the menu has hidden.
    await page.waitForFunction(() => {
      const menu = document.querySelector('#game-menu');
      const d = globalThis.__SETTLEMENT_DEBUG__;
      const opening = d?.getSnapshot?.()?.opening;
      const menuGone = !menu || menu.hidden === true;
      // F-5 milestones: first poll (200 ms resolution, delayed by long tasks,
      // so each stamp is an upper bound) at which each signal was observed.
      // coverageSec comes from the opening controller's worker requestCoverage
      // result (new-game-opening-controller.js), not the idle live runner.
      const m = globalThis.__hcMilestones, t = performance.now();
      const seen = (k) => { if (m[k] == null) m[k] = t; };
      if (opening?.preparation === 'preparing') seen('preparing');
      if (Number.isFinite(opening?.coverageSec) && opening.coverageSec > 0) seen('coverageFirst');
      if (Number.isFinite(opening?.coverageSec) && opening.coverageSec >= m.__expectedLoss) seen('coverageReachedLoss');
      if (opening?.preparation === 'ready') seen('preparationReady');
      if (menuGone) seen('menuHidden');
      if (opening?.phase === 'revealing') seen('revealing');
      const entered = opening?.phase === 'revealing' || opening?.phase === 'completed'
        || (opening?.preparation === 'ready' && Number.isFinite(opening?.lossSec) && opening.lossSec > 0);
      const hasLoss = Number.isFinite(opening?.lossSec) && opening.lossSec > 0;
      return menuGone && entered && hasLoss && d;
    }, null, { timeout, polling: 200 });
    // Authored 5s reveal after begin(). Bound this so a missing advance() cannot
    // sit until the 15-minute job timeout. Incomplete reveal is recorded, not a
    // compute speedup.
    const revealBudget = Math.min(30000, Math.max(8000, timeout - (Date.now() - started)));
    await page.waitForFunction(() => {
      const opening = globalThis.__SETTLEMENT_DEBUG__?.getSnapshot?.()?.opening;
      const done = opening?.phase === 'completed' || opening?.elapsedSec >= 5;
      if (done && globalThis.__hcMilestones.revealComplete == null) globalThis.__hcMilestones.revealComplete = performance.now();
      return done;
    }, null, { timeout: revealBudget, polling: 100 }).catch(() => { /* recorded on the snapshot */ });
  } finally {
    clearInterval(iv);
  }
}

export function oracleNewGame(snap, errors) {
  const reasons = [];
  if (!snap) reasons.push('no-snapshot');
  const opening = snap?.opening;
  // preparation returns to 'idle' after begin(); 'revealing'/'completed' is the
  // post-enter honest state. 'ready' is only visible before consume().
  const opened = opening?.phase === 'revealing' || opening?.phase === 'completed' || opening?.preparation === 'ready';
  if (!opened) reasons.push(`forecast-not-ready:${opening?.phase}/${opening?.preparation}`);
  // B03: the authored reveal must actually have been reached; a swallowed
  // reveal timeout (phase 'revealing', elapsedSec < 5) fails closed.
  const revealReached = opening?.phase === 'completed' || (Number.isFinite(opening?.elapsedSec) && opening.elapsedSec >= 5);
  if (!revealReached) reasons.push(`reveal-incomplete:${opening?.phase}/${opening?.elapsedSec}`);
  if (!(opening?.lossSec > 0)) reasons.push('missing-loss');
  else if (opening.lossSec !== EXPECTED_OPENING_LOSS_SEC) reasons.push(`loss-mismatch:${opening.lossSec}!=${EXPECTED_OPENING_LOSS_SEC}`);
  if (snap?.runner?.baseSeed !== FROZEN_SEED) {
    reasons.push(`seed-mismatch:${snap?.runner?.baseSeed}`);
  }
  const coverage = opening?.coverageSec ?? snap?.controller?.computedCoverageEndSec ?? 0;
  if (!(coverage > 0) || (opening?.lossSec && coverage < opening.lossSec * 0.99)) {
    reasons.push('coverage-short');
  }
  // Five Practice slots is a non-negotiable. Slot summary may be on the capital.
  const slots = snap?.slots;
  if (Array.isArray(slots) && slots.length && slots.length !== 5) {
    reasons.push(`slot-count:${slots.length}`);
  }
  return { ok: reasons.length === 0, reasons, errors: errors.slice(0, 8) };
}

export async function runNewGameJob({ server, cpuThrottle = 1, viewport = 'desktop', instrument = false, launchId, observationId, timeoutMs = NEW_GAME_TIMEOUT_MS, screenshotPath = null } = {}) {
  const assets = collectBuildAssets();
  const session = await launchPage({
    url: server.url, cpuThrottle, viewport, instrument,
  });
  const { page, browser, errors } = session;
  let result;
  try {
    const click = await clickNewGame(page);
    // During opening preparation the live runner is still the idle
    // devPlaytesting default (rngSeed 12345). The frozen fixture is the
    // prepared New Game, which only becomes runner.baseSeed after enter().
    // Do not treat 12345 here as a fixture failure. After waitForUseful
    // (menu gone), the oracle requires runner.baseSeed === FROZEN_SEED.
    let timedOut = false;
    try {
      await waitForUseful(page, timeoutMs);
    } catch (err) {
      timedOut = true;
      console.log(`${stamp()} waitForUseful: ${err.message}`);
    }
    const endNow = await page.evaluate(() => performance.now()).catch(() => null);
    const milestonesRaw = await page.evaluate(() => ({ ...globalThis.__hcMilestones })).catch(() => ({}));
    if (screenshotPath) await page.screenshot({ path: screenshotPath }).catch(() => {});
    const snap = await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot());
    const opening = snap?.opening ?? null;
    const bake = snap?.worldMap?.illustratedTerrain
      ? {
          bakeMs: snap.worldMap.illustratedTerrain.bakeMs ?? null,
          terrainBakeMs: snap.worldMap.illustratedTerrain.terrainBakeMs ?? null,
          variantBuildMs: snap.worldMap.illustratedTerrain.variantBuildMs ?? null,
        }
      : null;
    const heapMB = await page.evaluate(() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1e6) : null);
    const workerWrapped = await page.evaluate(() => globalThis.__hcWorkerWrapped === true);
    const originalWorkerIntact = await page.evaluate(() => globalThis.Worker === globalThis.__hcOriginalWorker);
    const longTasks = await page.evaluate((t0) =>
      (globalThis.__hcLongTasks || []).filter((t) => t.start >= t0), click.startArrival);
    const oracle = oracleNewGame(snap, errors);
    const elapsedMs = endNow - click.startArrival;
    const handlerElapsedMs = endNow - click.startHandler;
    const queueDelayMs = click.startHandler - click.startArrival;
    // Split milestones relative to input arrival (upper bounds, 200 ms polls).
    const milestones = {};
    for (const [k, v] of Object.entries(milestonesRaw)) {
      if (!k.startsWith('__') && Number.isFinite(v)) milestones[k] = v - click.startArrival;
    }
    result = {
      job: 'new-game-opening',
      step: 'useful-interaction',
      population: population({ cpuThrottle, viewport, cold: true }),
      launchId, observationId,
      elapsedMs, handlerElapsedMs, queueDelayMs,
      ok: oracle.ok && !timedOut && graphicsPinned(session.applied), timeout: timedOut,
      buildId: assets.buildAssetSha256 ?? 'missing-dist',
      fixture: `ordinary-new-game-seed-${FROZEN_SEED}`,
      harnessId: HARNESS_ID,
      measurementContractId: CONTRACT_ID,
      fixtureManifestId: frozenFixtureId(),
      oracleSdkSha256: oracleSdkId(),
      comparisonEligible: true,
      lossSec: opening?.lossSec ?? null,
      coverageSec: opening?.coverageSec ?? null,
      openingPhase: opening?.phase ?? null,
      openingElapsedSec: opening?.elapsedSec ?? null,
      bake,
      heapMB,
      workerWrapped,
      originalWorkerIntact,
      instrument,
      milestones,
      forecastReadyMs: milestones.preparationReady ?? null,
      coverageReachedLossMs: milestones.coverageReachedLoss ?? null,
      menuHiddenMs: milestones.menuHidden ?? null,
      revealCompleteMs: milestones.revealComplete ?? null,
      graphicsApplied: session.applied,
      graphicsPinned: graphicsPinned(session.applied),
      browserVersion: session.browserVersion,
      screenshotPath,
      longTaskSumMs: longTasks.reduce((a, t) => a + t.dur, 0),
      longTasks200: longTasks.filter((t) => t.dur >= 200).length,
      longestTaskMs: longTasks.reduce((a, t) => Math.max(a, t.dur), 0),
      oracle,
      click,
    };
  } finally {
    // Leave the page open for a subsequent scrub on the same session if requested.
    result = result ?? { ok: false, timeout: true, elapsedMs: NEW_GAME_TIMEOUT_MS, errors };
    result._session = session;
  }
  return result;
}

export async function runScrubJob({ session, launchId, observationPrefix, steps = SCRUB_WARM_STEPS, addedDelayMs = 0, wrongTarget = null, deferredMs = 0, deadlineMs = 30000 } = {}) {
  const { page, errors, cpuThrottle = 1, viewport = 'desktop' } = session;
  const assets = collectBuildAssets();
  const fixture = session.fixture ?? `ordinary-new-game-seed-${FROZEN_SEED}`;
  const start = session.start ?? 'ordinary-new-game';
  const artwork = session.artwork ?? ARTWORK_MODE;
  const snap0 = await page.evaluate(() => {
    const s = globalThis.__SETTLEMENT_DEBUG__.getSnapshot();
    return {
      viewed: s.viewedSec,
      frontier: s.frontierSec,
      cap: s.browseCapSec,
      rev: s.graph?.revealedCoverageEndSec,
      loss: s.opening?.lossSec,
    };
  });
  const hi = Math.max(1, Math.min(snap0.cap ?? snap0.rev ?? snap0.frontier ?? 1, snap0.rev ?? 1e9));
  const observations = await page.evaluate(async ({ n, hi, addedDelayMs, deferredMs, wrongTarget, deadlineMs }) => {
    const d = globalThis.__SETTLEMENT_DEBUG__;
    const raf = () => new Promise((r) => requestAnimationFrame(r));
    const rows = [];
    const original = d.browseSecond.bind(d);
    const browse = (sec) => {
      if (addedDelayMs > 0) {
        const until = performance.now() + addedDelayMs;
        while (performance.now() < until) { /* in-path delay */ }
      }
      if (deferredMs > 0) {
        // B02: genuine deferred completion. The call returns immediately and
        // the real browse runs later in a separate task, so a timer that
        // trusted the return (or two rAFs) would read early; only the
        // viewedSec completion oracle below can catch it.
        setTimeout(() => original(sec), deferredMs);
        return undefined;
      }
      return original(sec);
    };
    for (let i = 0; i < n; i++) {
      const sec = Math.floor(hi * (0.5 + 0.45 * Math.sin(i / 9)));
      const expected = wrongTarget != null ? wrongTarget : sec;
      const t0 = performance.now();
      browse(sec);
      // Wait for observable completion: viewed second matches request (clamped
      // to coverage), state is present, then a frame opportunity. Two rAF alone
      // is not completion if viewedSec is still stale.
      const deadline = t0 + deadlineMs;
      let viewed = d.getSnapshot().viewedSec;
      while (viewed !== sec && performance.now() < deadline) {
        await raf();
        viewed = d.getSnapshot().viewedSec;
      }
      const has = d.hasStateAt?.(sec) === true || d.hasStateDataAt?.(sec) === true;
      await raf();
      const t1 = performance.now();
      const snap = d.getSnapshot();
      // B03: completion must be observed before the deadline; a timed-out wait fails.
      const reached = viewed === sec;
      const ok = reached && snap.viewedSec === expected && (has || snap.viewedSec === sec);
      rows.push({
        i, targetSec: sec, viewedSec: snap.viewedSec, expected,
        elapsedMs: t1 - t0, ok, hasState: has,
        timeout: !reached,
      });
      // Let any still-pending deferred browse land before the next step.
      if (!reached && deferredMs > 0) await new Promise((r) => setTimeout(r, deferredMs + 50));
    }
    return rows;
  }, { n: steps, hi, addedDelayMs, deferredMs, wrongTarget, deadlineMs });

  const buildId = assets.buildAssetSha256 ?? 'missing-dist';
  return observations.map((row, idx) => ({
    job: 'scrub-step',
    step: 'restore-visible',
    population: population({ cpuThrottle: session.cpuThrottle ?? 1, viewport: session.viewport ?? 'desktop', cold: false, artwork, start }),
    launchId,
    observationId: `${observationPrefix}-${idx}`,
    elapsedMs: row.elapsedMs,
    ok: row.ok,
    timeout: row.timeout,
    buildId,
    fixture,
    harnessId: HARNESS_ID,
    measurementContractId: CONTRACT_ID,
    fixtureManifestId: frozenFixtureId(),
    oracleSdkSha256: oracleSdkId(),
    comparisonEligible: addedDelayMs === 0 && deferredMs === 0 && wrongTarget == null,
    targetSec: row.targetSec,
    viewedSec: row.viewedSec,
    hasState: row.hasState,
    addedDelayMs,
    deferredMs,
    deferredMode: deferredMs > 0 ? 'setTimeout-async' : null,
    deadlineMs,
    errors: errors.slice(0, 4),
    hi,
  }));
}

export async function closeSession(session) {
  try { await session?.browser?.close(); } catch { /* already closed */ }
}

export async function inspectWorkerWrap({ server, instrument }) {
  const session = await launchPage({ url: server.url, instrument, cpuThrottle: 1, viewport: 'desktop' });
  try {
    const info = await session.page.evaluate(() => ({
      wrapped: globalThis.__hcWorkerWrapped === true,
      sameRef: globalThis.Worker === globalThis.__hcOriginalWorker,
      instrumentFlag: globalThis.__hcInstrument === true,
    }));
    return info;
  } finally {
    await closeSession(session);
  }
}
