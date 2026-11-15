// WP3: real-drag scrub job on the timegraph plot (the PR #73 path).
// Raw CDP mouse (desktop) or touch (mobile) press → open-loop moves at a fixed
// cadence → release. Start clock per move = event.timeStamp (input arrival,
// A1-01). Completion = first rAF frame at/after the handler whose
// viewedSec equals the product's pointer-mapped scrubSec. Moves superseded by a
// later move before completing are right-censored, never dropped. Coalesced
// moves (sent but not delivered as separate pointermove events) are counted.
//
// Reads use the flag-gated measurement probe
// (__SETTLEMENT_DEBUG__.getScrubProbe, enabled by __PERF_MEASUREMENT_HOOKS__),
// because getSnapshot() per frame would perturb the measured path.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { startServer, launchPage, runNewGameJob, closeSession } from './browser.mjs';
import { quantile } from './statistics.mjs';
import { finalizeRun } from './manifest.mjs';
import {
  REPO_ROOT, ARTIFACT_ROOT_REL, CONTRACT_ID, HARNESS_ID, FROZEN_SEED, EXPECTED_OPENING_LOSS_SEC,
  frozenFixtureId, oracleSdkId, population, collectBuildAssets,
} from './identities.mjs';

export const DRAG_MOVES = 40;
export const DRAG_CADENCE_MS = 50;
export const SETTLE_MS = 150; // EDGE_TRANSFER_SCRUB_SETTLE_MS
const median = (xs) => (xs.length ? quantile(xs, 0.5) : null);

function stamp() {
  return `[${new Date().toLocaleTimeString('en-AU', { hour12: false, timeZone: 'Australia/Sydney' })} AEDT]`;
}

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

// Prepared performance start (seed 424242), labelled separately from ordinary New Game.
export async function openPreparedStart({ server, cpuThrottle = 1, viewport = 'desktop', timeoutMs = 240000 }) {
  const session = await launchPage({ url: server.url, cpuThrottle, viewport, query: `/?perf=1&seed=${FROZEN_SEED}&art=0`, setSeed: false });
  const { page } = session;
  const t0 = Date.now();
  await page.getByTestId('game-new-performance').click({ timeout: 60000 });
  const start = page.getByRole('button', { name: 'Start here', exact: true }).first();
  if (await start.isVisible({ timeout: 3000 }).catch(() => false)) await start.click();
  await page.waitForFunction(() => {
    const menu = document.querySelector('#game-menu');
    const o = globalThis.__SETTLEMENT_DEBUG__?.getSnapshot?.()?.opening;
    return (!menu || menu.hidden) && (o?.phase === 'revealing' || o?.phase === 'completed') && o?.lossSec > 0;
  }, null, { timeout: timeoutMs, polling: 250 });
  await page.waitForFunction(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot().opening?.phase === 'completed', null, { timeout: 30000, polling: 200 }).catch(() => {});
  Object.assign(session, {
    fixture: `prepared-performance-start-seed-${FROZEN_SEED}`, start: 'prepared-424242', artwork: 'performance-mode-minimal',
    openMs: Date.now() - t0,
  });
  return session;
}

async function enableProbe(page) {
  return page.evaluate(() => {
    globalThis.__PERF_MEASUREMENT_HOOKS__ = true;
    return typeof globalThis.__SETTLEMENT_DEBUG__?.getScrubProbe === 'function'
      ? globalThis.__SETTLEMENT_DEBUG__.getScrubProbe() : null;
  });
}

// Waits until the visible forecast reveal has caught up so the drag range is stable.
async function waitForRevealSettled(page, timeoutMs = 60000) {
  await page.waitForFunction(() => {
    const g = globalThis.__SETTLEMENT_DEBUG__.getSnapshot().graph;
    return g && g.revealedCoverageEndSec >= g.computedCoverageEndSec && g.computedCoverageEndSec > 0;
  }, null, { timeout: timeoutMs, polling: 500 }).catch(() => {});
}

async function readFingerprint(page) {
  return page.evaluate(async () => {
    const d = globalThis.__SETTLEMENT_DEBUG__;
    const s = d.getSnapshot();
    const probe = d.getScrubProbe?.() ?? null;
    const viewed = {
      viewedSec: s.viewedSec, slots: s.slots,
      civ: s.worldMap?.civilizationSummary ?? null, survival: s.worldMap?.survivalTracker ?? null,
    };
    const bytes = new TextEncoder().encode(JSON.stringify(viewed));
    const digest = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))).map((b) => b.toString(16).padStart(2, '0')).join('');
    return {
      viewedSec: s.viewedSec, frontierSec: s.frontierSec, baseSeed: s.runner?.baseSeed ?? null,
      timeline: s.runner?.timeline ?? null, playbackTarget: s.playbackTarget,
      isScrubbing: s.graph?.isScrubbing ?? null, scrubSec: s.graph?.scrubSec ?? null,
      minSec: s.graph?.minSec, maxSec: s.graph?.maxSec, browseCapSec: s.browseCapSec,
      revealedCoverageEndSec: s.graph?.revealedCoverageEndSec, viewedStateSha256: digest,
      edge: probe?.edge ?? null, previewStatus: s.runner?.previewStatus ?? null,
    };
  });
}

async function installRecorder(page, { addedDelayMs = 0, deferredMs = 0 }) {
  await page.evaluate(({ addedDelayMs, deferredMs }) => {
    const d = globalThis.__SETTLEMENT_DEBUG__;
    const rec = { frames: [], marks: [], running: true };
    globalThis.__hcDrag = rec;
    const mark = (ev) => rec.marks.push({ type: ev.type, timeStamp: ev.timeStamp, handlerNow: performance.now(), x: ev.clientX, y: ev.clientY, pointerType: ev.pointerType, coalesced: ev.getCoalescedEvents ? ev.getCoalescedEvents().length : null });
    rec.mark = mark;
    for (const type of ['pointerdown', 'pointermove', 'pointerup']) window.addEventListener(type, mark, true);
    if (addedDelayMs > 0) {
      // Validity control: known delay in the move handler path, before the app handler.
      rec.delay = (ev) => { if (ev.type === 'pointermove') { const u = performance.now() + addedDelayMs; while (performance.now() < u) { /* in-path delay */ } } };
      window.addEventListener('pointermove', rec.delay, true);
    }
    if (deferredMs > 0) {
      // Validity control: completion deferred until after the handler (blocks the next frame).
      rec.defer = (ev) => { if (ev.type === 'pointermove') requestAnimationFrame(() => { const u = performance.now() + deferredMs; while (performance.now() < u) { /* deferred completion */ } }); };
      window.addEventListener('pointermove', rec.defer, true);
    }
    const loop = (t) => {
      const p = d.getScrubProbe();
      rec.frames.push({ t, now: performance.now(), viewedSec: p.viewedSec, scrubSec: p.scrubSec, isScrubbing: p.isScrubbing, playbackTarget: p.playbackTarget, edgeSkipping: p.edge?.skipping ?? null });
      if (rec.running) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }, { addedDelayMs, deferredMs });
}

async function stopRecorder(page) {
  return page.evaluate(() => {
    const rec = globalThis.__hcDrag;
    rec.running = false;
    for (const type of ['pointerdown', 'pointermove', 'pointerup']) window.removeEventListener(type, rec.mark, true);
    if (rec.delay) window.removeEventListener('pointermove', rec.delay, true);
    if (rec.defer) window.removeEventListener('pointermove', rec.defer, true);
    return { frames: rec.frames, marks: rec.marks };
  });
}

function dispatcher(cdp, kind) {
  if (kind === 'touch') {
    return {
      down: (x, y) => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] }),
      move: (x, y) => cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id: 1 }] }),
      up: () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }),
    };
  }
  return {
    down: async (x, y) => { await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y }); return cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 }); },
    move: (x, y) => cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y, button: 'left', buttons: 1 }),
    up: (x, y) => cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', buttons: 0, clickCount: 1 }),
  };
}

// Per-move analysis from raw frames/marks; pure, so the Auditor can recompute it.
export function analyzeDrag({ frames, marks, wrongOffset = 0 }) {
  const moves = marks.filter((m) => m.type === 'pointermove');
  const down = marks.find((m) => m.type === 'pointerdown') ?? null;
  const up = marks.find((m) => m.type === 'pointerup') ?? null;
  const rows = moves.map((m, i) => {
    const next = moves[i + 1]?.handlerNow ?? up?.handlerNow ?? Infinity;
    const firstAfter = frames.find((f) => f.now >= m.handlerNow);
    const target = firstAfter && firstAfter.now < next ? firstAfter.scrubSec : null;
    const expected = target == null ? null : target + wrongOffset;
    const done = expected == null ? null : frames.find((f) => f.now >= m.handlerNow && f.now < next + 1000 && f.viewedSec === expected);
    const superseded = !done || done.now >= next;
    const complete = !!done && !superseded;
    return {
      i, timeStamp: m.timeStamp, handlerNow: m.handlerNow, queueDelayMs: m.handlerNow - m.timeStamp, x: m.x,
      targetSec: target, expectedSec: expected, isScrubbingAtHandler: firstAfter?.isScrubbing ?? null,
      ok: complete, superseded, elapsedMs: complete ? done.now - m.timeStamp : null,
      censoredLowerBoundMs: complete ? null : (Number.isFinite(next) ? next - m.timeStamp : null),
    };
  });
  const during = frames.filter((f) => down && f.now >= down.handlerNow && (!up || f.now < up.handlerNow));
  const intervals = during.slice(1).map((f, i) => f.t - during[i].t);
  return {
    rows, delivered: moves.length,
    latchedIsScrubbing: during.length > 0 && during.some((f) => f.isScrubbing === true),
    isScrubbingAllDuring: during.length > 0 && during.every((f) => f.isScrubbing === true),
    edgeSkippingDuring: during.length ? during.filter((f) => f.edgeSkipping === true).length / during.length : null,
    holdAfterDown: during.length ? during[0].playbackTarget === 0 : null,
    rafIntervals: intervals,
    rafP50: intervals.length ? median(intervals) : null,
    rafMax: intervals.length ? Math.max(...intervals) : null,
    framesOver50: intervals.filter((v) => v > 50).length,
    completed: rows.filter((r) => r.ok).length,
    superseded: rows.filter((r) => r.superseded).length,
    p50: rows.some((r) => r.ok) ? median(rows.filter((r) => r.ok).map((r) => r.elapsedMs)) : null,
  };
}

export async function runDrag({ session, launchId, kind = 'mouse', moves = DRAG_MOVES, cadenceMs = DRAG_CADENCE_MS, addedDelayMs = 0, deferredMs = 0, screenshotDir = null, tag = launchId }) {
  const { page, cdp } = session;
  const probe0 = await enableProbe(page);
  if (!probe0) return { launchId, ok: false, reason: 'probe-unavailable' };
  await waitForRevealSettled(page);
  const before = await readFingerprint(page);
  const cap = Math.min(before.browseCapSec ?? before.revealedCoverageEndSec, before.revealedCoverageEndSec ?? Infinity, before.maxSec);
  const minSec = before.minSec, maxSec = before.maxSec;
  const plot = await page.evaluate(() => ({ a: globalThis.__SETTLEMENT_DEBUG__.getGraphClickPoint(0, 0.5), b: globalThis.__SETTLEMENT_DEBUG__.getGraphClickPoint(1, 0.5) }));
  const secToX = (sec) => plot.a.x + (plot.b.x - plot.a.x) * ((sec - minSec) / Math.max(1, maxSec - minSec));
  const lo = minSec + (cap - minSec) * 0.15, hi = minSec + (cap - minSec) * 0.85;
  // 25 moves forward, then back (rewind exercises the ghost-drop path).
  const path_ = Array.from({ length: moves }, (_, i) => (i < 25 ? lo + (hi - lo) * (i / 24) : hi - (hi - lo) * ((i - 24) / 24)));
  const y = plot.a.y;
  await installRecorder(page, { addedDelayMs, deferredMs });
  const input = dispatcher(cdp, kind);
  const sendLog = [];
  const tStart = performance.now();
  await input.down(secToX(path_[0]), y);
  sendLog.push({ type: 'down', at: performance.now() - tStart });
  const pending = [];
  let midShot = null;
  for (let i = 0; i < path_.length; i++) {
    const due = tStart + cadenceMs * (i + 1);
    const wait = due - performance.now();
    if (wait > 0) await delay(wait);
    const x = secToX(path_[i]);
    sendLog.push({ type: 'move', i, at: performance.now() - tStart, lateMs: Math.max(0, -wait), x, plannedSec: path_[i] });
    pending.push(input.move(x, y).catch((e) => ({ error: String(e) }))); // open loop: not awaited
    if (i === 12 && screenshotDir) midShot = path.join(screenshotDir, `${tag}-mid-drag.png`);
  }
  if (midShot) await page.screenshot({ path: midShot }).catch(() => { midShot = null; });
  const midProbe = await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getScrubProbe());
  await Promise.all(pending);
  await input.up(secToX(path_.at(-1)), y);
  sendLog.push({ type: 'up', at: performance.now() - tStart });
  await delay(SETTLE_MS + 250);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const raw = await stopRecorder(page);
  const afterRelease = await readFingerprint(page);
  let settleShot = null;
  if (screenshotDir) { settleShot = path.join(screenshotDir, `${tag}-after-settle.png`); await page.screenshot({ path: settleShot }).catch(() => { settleShot = null; }); }
  // Never-dragged reference at the same second: browse away, browse back, settle.
  const S = afterRelease.viewedSec;
  await page.evaluate((s) => globalThis.__SETTLEMENT_DEBUG__.browseSecond(Math.max(0, s - 37)), S);
  await page.waitForFunction((s) => globalThis.__SETTLEMENT_DEBUG__.getScrubProbe().viewedSec === Math.max(0, s - 37), S, { timeout: 30000 }).catch(() => {});
  await page.evaluate((s) => globalThis.__SETTLEMENT_DEBUG__.browseSecond(s), S);
  await page.waitForFunction((s) => globalThis.__SETTLEMENT_DEBUG__.getScrubProbe().viewedSec === s, S, { timeout: 30000 }).catch(() => {});
  await delay(SETTLE_MS + 250);
  const reference = await readFingerprint(page);
  const analysis = analyzeDrag(raw);
  const secPerPx = (maxSec - minSec) / Math.max(1, plot.b.x - plot.a.x);
  const mappingErrors = analysis.rows.filter((r) => r.targetSec != null).map((r) => Math.abs(r.targetSec - (minSec + (r.x - plot.a.x) * secPerPx)));
  const oracle = {
    latchedIsScrubbing: analysis.latchedIsScrubbing,
    isScrubbingMidDrag: midProbe?.isScrubbing === true,
    edgeSkipMidDrag: midProbe?.edge?.skipping === true,
    holdAfterDown: analysis.holdAfterDown === true,
    holdMeaningful: before.playbackTarget !== 0,
    releasedNotScrubbing: afterRelease.isScrubbing === false,
    edgeSettledAfterRelease: afterRelease.edge?.skipping === false,
    pointerMappingOk: mappingErrors.length > 0 && Math.max(...mappingErrors) <= secPerPx + 1.5,
    settledEqualsReferenceState: afterRelease.viewedStateSha256 === reference.viewedStateSha256 && afterRelease.viewedSec === reference.viewedSec,
    settledEqualsReferencePackets: JSON.stringify(afterRelease.edge?.packets ?? null) === JSON.stringify(reference.edge?.packets ?? null) && afterRelease.edge?.packets != null,
    frontierUnchanged: before.frontierSec === afterRelease.frontierSec && before.frontierSec === reference.frontierSec,
    seedUnchanged: before.baseSeed === afterRelease.baseSeed && before.baseSeed === FROZEN_SEED,
    timelineUnchanged: JSON.stringify(before.timeline) === JSON.stringify(afterRelease.timeline),
    movesCompletedAny: analysis.completed > 0,
  };
  const required = ['latchedIsScrubbing', 'isScrubbingMidDrag', 'edgeSkipMidDrag', 'holdAfterDown', 'releasedNotScrubbing', 'edgeSettledAfterRelease',
    'pointerMappingOk', 'settledEqualsReferenceState', 'settledEqualsReferencePackets', 'frontierUnchanged', 'seedUnchanged', 'timelineUnchanged', 'movesCompletedAny'];
  const ok = required.every((k) => oracle[k] === true);
  const buildId = collectBuildAssets().buildAssetSha256 ?? 'missing-dist';
  const pop = population({ cpuThrottle: session.cpuThrottle ?? 1, viewport: session.viewport ?? 'desktop', cold: false, artwork: session.artwork, start: session.start ?? 'ordinary-new-game' });
  const control = addedDelayMs > 0 || deferredMs > 0;
  const observations = analysis.rows.map((r) => ({
    job: 'scrub-drag', step: 'move-to-viewed-frame', population: { ...pop, input: kind, cadenceMs },
    launchId, observationId: `${launchId}-m${r.i}`, elapsedMs: r.ok ? r.elapsedMs : (r.censoredLowerBoundMs ?? 0),
    ok: r.ok && ok, timeout: false, superseded: r.superseded, buildId,
    fixture: session.fixture ?? `ordinary-new-game-seed-${FROZEN_SEED}`, harnessId: HARNESS_ID, measurementContractId: CONTRACT_ID,
    fixtureManifestId: frozenFixtureId(), oracleSdkSha256: oracleSdkId(), comparisonEligible: !control,
    targetSec: r.targetSec, queueDelayMs: r.queueDelayMs, addedDelayMs, deferredMs,
  }));
  console.log(`${stamp()} drag ${launchId} ok=${ok} delivered=${analysis.delivered}/${moves} completed=${analysis.completed} superseded=${analysis.superseded} p50=${analysis.p50?.toFixed?.(1)} latched=${analysis.latchedIsScrubbing}`);
  return {
    launchId, kind, ok, oracle, required, before, midProbe, afterRelease, reference, plot, secPerPx, maxMappingError: mappingErrors.length ? Math.max(...mappingErrors) : null,
    sent: moves, delivered: analysis.delivered, coalescedOrDropped: moves - analysis.delivered,
    completed: analysis.completed, superseded: analysis.superseded, p50: analysis.p50,
    rafP50: analysis.rafP50, rafMax: analysis.rafMax, framesOver50: analysis.framesOver50, edgeSkippingDuring: analysis.edgeSkippingDuring,
    addedDelayMs, deferredMs, sendLog, raw, analysis, observations, screenshots: { midDrag: midShot, afterSettle: settleShot },
    errors: session.errors.slice(0, 6),
  };
}

// Wrong-target control: re-analyse the same raw frames with an offset target.
export function wrongTargetControl(drag) {
  const wrong = analyzeDrag({ ...drag.raw, wrongOffset: 7 });
  return { id: 'drag-wrong-target', passed: drag.completed > 0 && wrong.completed === 0, detail: { positiveCompleted: drag.completed, wrongCompleted: wrong.completed } };
}

export async function runScrubDragSuite({ outDir, kinds = ['prepared-desktop', 'ordinary-desktop'], screenshotDir = outDir }) {
  mkdirSync(outDir, { recursive: true });
  const server = await startServer();
  const results = { at: new Date().toISOString(), runs: [], controls: [] };
  const save = () => writeFileSync(path.join(outDir, 'scrub-drag-summary.json'), JSON.stringify({
    ...results,
    runs: results.runs.map(({ raw, analysis, observations, sendLog, ...r }) => r),
  }, null, 2));
  try {
    for (const kindName of kinds) {
      let session = null;
      try {
        if (kindName.startsWith('prepared')) {
          const mobile = kindName.endsWith('mobile');
          session = await openPreparedStart({ server, cpuThrottle: mobile ? 4 : 1, viewport: mobile ? 'mobile' : 'desktop' });
        } else {
          const ng = await runNewGameJob({ server, cpuThrottle: 1, viewport: 'desktop', launchId: `drag-ng-${kindName}`, observationId: `drag-ng-${kindName}`, timeoutMs: 240000 });
          session = ng._session;
          Object.assign(session, { fixture: `ordinary-new-game-seed-${FROZEN_SEED}`, start: 'ordinary-new-game' });
          if (!ng.ok) { results.runs.push({ launchId: kindName, ok: false, reason: 'new-game-failed', oracle: ng.oracle }); save(); continue; }
        }
        const input = kindName.endsWith('mobile') ? 'touch' : 'mouse';
        const pos = await runDrag({ session, launchId: `${kindName}-positive`, kind: input, screenshotDir, tag: kindName });
        results.runs.push(pos);
        writeFileSync(path.join(outDir, `raw-drag-${kindName}-positive.json`), JSON.stringify(pos, null, 2));
        save();
        if (kindName === kinds[0] && pos.ok) {
          results.controls.push(wrongTargetControl(pos));
          const delayed = await runDrag({ session, launchId: `${kindName}-delay`, kind: input, addedDelayMs: 200 });
          writeFileSync(path.join(outDir, `raw-drag-${kindName}-delay.json`), JSON.stringify(delayed, null, 2));
          const deferred = await runDrag({ session, launchId: `${kindName}-deferred`, kind: input, deferredMs: 200 });
          writeFileSync(path.join(outDir, `raw-drag-${kindName}-deferred.json`), JSON.stringify(deferred, null, 2));
          // Recompute positive median from the same module for the comparison.
          const base = pos.p50;
          results.controls.push({ id: 'drag-added-delay', passed: delayed.completed > 0 && Number.isFinite(base) && delayed.p50 - base >= 150, detail: { baseP50: base, delayedP50: delayed.p50, delta: delayed.p50 - base, delayedCompleted: delayed.completed } });
          results.controls.push({ id: 'drag-deferred-completion', passed: deferred.completed > 0 && Number.isFinite(base) && deferred.p50 - base >= 150, detail: { baseP50: base, deferredP50: deferred.p50, delta: deferred.p50 - base, deferredCompleted: deferred.completed } });
          results.runs.push({ ...delayed, raw: undefined }, { ...deferred, raw: undefined });
        }
        save();
      } catch (err) {
        results.runs.push({ launchId: kindName, ok: false, reason: `error: ${err.message}` });
        save();
      } finally {
        await closeSession(session);
      }
    }
  } finally {
    await server.close();
  }
  save();
  return results;
}

if (process.argv[1]?.endsWith('scrub-drag.mjs')) {
  const id = arg('id', `drag-${Date.now()}`);
  const kinds = arg('kinds', 'prepared-desktop,ordinary-desktop').split(',');
  const outDir = path.join(REPO_ROOT, ARTIFACT_ROOT_REL, id);
  const r = await runScrubDragSuite({ outDir, kinds });
  finalizeRun(outDir);
  console.log(JSON.stringify({ id, runs: r.runs.map((x) => ({ id: x.launchId, ok: x.ok, reason: x.reason, p50: x.p50, completed: x.completed, delivered: x.delivered, failed: x.oracle ? Object.entries(x.oracle).filter(([k, v]) => v !== true).map(([k]) => k) : null })), controls: r.controls.map((c) => ({ id: c.id, passed: c.passed })), artifact: outDir }));
}
