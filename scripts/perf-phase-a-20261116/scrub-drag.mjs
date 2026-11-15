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
import { startServer, launchPage, runNewGameJob, closeSession, graphicsPinned } from './browser.mjs';
import { quantile, quantileInterval, summarize } from './statistics.mjs';
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

// Pixi debug click points are in the 2424x1080 design space (as in
// scripts/full-map-browser-probe.mjs); map them onto the canvas box.
async function designClick(page, pt) {
  if (!pt) return false;
  const b = await page.locator('canvas').first().boundingBox();
  await page.mouse.click(b.x + pt.x / 2424 * b.width, b.y + pt.y / 1080 * b.height);
  return true;
}

// Prepared performance start (seed 424242), labelled separately from ordinary New Game.
// WP3b: the documented direct performance URL (docs/development-workflow.md:
// "A numeric &seed=123 ... pins a direct launch"; "&launch=new for a fresh
// start"). `?perf=1` auto-enters on load (game-menu-dom startPerformanceEntry),
// which is why WP3 dry1/dry2 found the Developer tools button detached/hidden:
// the menu was already leaving. The menu button path cannot pin a seed without
// perf=1 (it picks uniformly among five prepared worlds), so it is not used.
export async function openPreparedStart({ server, cpuThrottle = 1, viewport = 'desktop', timeoutMs = 240000 }) {
  const session = await launchPage({ url: server.url, cpuThrottle, viewport, query: `/?dev=1&perf=1&art=0&seed=${FROZEN_SEED}&launch=new`, setSeed: false });
  const { page } = session;
  const t0 = Date.now();
  await page.waitForFunction(() => {
    const menu = document.querySelector('#game-menu');
    const o = globalThis.__SETTLEMENT_DEBUG__?.getSnapshot?.()?.opening;
    return (!menu || menu.hidden) && o?.phase === 'completed' && o?.lossSec > 0;
  }, null, { timeout: timeoutMs, polling: 250 });
  const opening = await page.evaluate(() => { const s = globalThis.__SETTLEMENT_DEBUG__.getSnapshot(); return { lossSec: s.opening.lossSec, seed: s.runner?.baseSeed ?? null }; });
  // B04: fail closed on the frozen identity before admitting prepared samples.
  const pin = preparedPinCheck({ opening, applied: session.applied });
  if (!pin.ok) { await closeSession(session); throw new Error(`prepared-start-pin-failed: ${pin.reasons.join(',')}`); }
  Object.assign(session, {
    fixture: `prepared-performance-start-seed-${FROZEN_SEED}`, start: 'prepared-424242', artwork: 'performance-mode-stubs-art0',
    openMs: Date.now() - t0, opening, entry: `/?dev=1&perf=1&art=0&seed=${FROZEN_SEED}&launch=new`,
  });
  return session;
}

// User path to a playing state: Minimise the Foreseen Extinction recap,
// press the Present time action, press Space (togglePause -> playbackTarget 1).
export async function enterPlaying(page) {
  const d = (m, a) => page.evaluate(([m, a]) => globalThis.__SETTLEMENT_DEBUG__[m]?.(a) ?? null, [m, a]);
  if ((await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot().runComplete?.open)) === true) {
    await designClick(page, await d('getRunCompleteClickPoint', 'browse')); await delay(600);
  }
  await designClick(page, await d('getNavigationClickPoint', 'present')); await delay(800);
  return resumePlaying(page);
}

export async function resumePlaying(page) {
  for (let attempt = 0; attempt < 2; attempt++) {
    if ((await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot().playbackTarget)) !== 0) break;
    await page.keyboard.press('Space'); await delay(400);
  }
  await delay(600);
  return page.evaluate(() => { const s = globalThis.__SETTLEMENT_DEBUG__.getSnapshot(); return { playbackTarget: s.playbackTarget, viewedSec: s.viewedSec, runCompleteOpen: s.runComplete?.open ?? null }; });
}

async function enableProbe(page) {
  return page.evaluate(() => {
    globalThis.__PERF_MEASUREMENT_HOOKS__ = true;
    return typeof globalThis.__SETTLEMENT_DEBUG__?.getScrubProbe === 'function'
      ? globalThis.__SETTLEMENT_DEBUG__.getScrubProbe() : null;
  });
}

// Waits until the visible forecast reveal has caught up so the drag range is stable.
// B04: pure pin check for the prepared start (exported for the fail-closed test).
export function preparedPinCheck({ opening, applied }) {
  const reasons = [];
  if (opening?.lossSec !== EXPECTED_OPENING_LOSS_SEC) reasons.push(`loss-mismatch:${opening?.lossSec}!=${EXPECTED_OPENING_LOSS_SEC}`);
  if (opening?.seed !== FROZEN_SEED) reasons.push(`seed-mismatch:${opening?.seed}`);
  if (!graphicsPinned(applied)) reasons.push('graphics-not-pinned');
  return { ok: reasons.length === 0, reasons };
}

// B03: required preconditions/completions; a timeout is a failed check, never a pass.
export const DRAG_REQUIRED_PRECONDITIONS = ['revealSettled', 'referenceAwayReached', 'referenceReached', 'lossPinned'];

// Returns true only if the condition was observed before the timeout (B03).
async function waitForRevealSettled(page, timeoutMs = 60000) {
  await page.waitForFunction(() => {
    const g = globalThis.__SETTLEMENT_DEBUG__.getSnapshot().graph;
    return g && g.revealedCoverageEndSec >= g.computedCoverageEndSec && g.computedCoverageEndSec > 0;
  }, null, { timeout: timeoutMs, polling: 500 }).then(() => true, () => false);
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
      timeline: s.runner?.timeline ?? null, playbackTarget: s.playbackTarget, lossSec: s.opening?.lossSec ?? null,
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
    const mark = (ev) => rec.marks.push({ type: ev.type, timeStamp: ev.timeStamp,
      // Earliest coalesced sample: a coalesced move's arrival is not lost (no coordinated omission).
      arrival: Math.min(ev.timeStamp, ...(ev.getCoalescedEvents ? ev.getCoalescedEvents().map((c) => c.timeStamp) : [])), handlerNow: performance.now(), x: ev.clientX, y: ev.clientY, pointerType: ev.pointerType, coalesced: ev.getCoalescedEvents ? ev.getCoalescedEvents().length : null });
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
    // Post-frame stamp: a MessageChannel task queued from rAF runs after every
    // rAF callback of that frame (including Pixi's ticker render and any deferred
    // work) and after the rendering update, so completion cannot be stamped
    // before work that the frame still has to do (r2 deferred-control lesson).
    const ch = new MessageChannel(); const pendingAfter = [];
    ch.port1.onmessage = () => { const f = pendingAfter.shift(); if (f) f.after = performance.now(); };
    const loop = (t) => {
      const p = d.getScrubProbe();
      const f = { t, now: performance.now(), after: null, viewedSec: p.viewedSec, scrubSec: p.scrubSec, isScrubbing: p.isScrubbing, playbackTarget: p.playbackTarget, edgeSkipping: p.edge?.skipping ?? null };
      rec.frames.push(f); pendingAfter.push(f); ch.port2.postMessage(0);
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
  const down = marks.find((m) => m.type === 'pointerdown') ?? null;
  // Only moves delivered while the button/finger is down are drag moves; the
  // hover move sent before the press (r1 analysis bug) is excluded.
  const moves = marks.filter((m) => m.type === 'pointermove' && down && m.handlerNow >= down.handlerNow);
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
  // Primary metric (r3): per delivered move, arrival (earliest coalesced
  // timeStamp) → post-frame stamp of the first frame at/after its handler whose
  // viewedSec equals the live pointer-mapped scrubSec (+ wrongOffset). That
  // target is this move's or a newer one, so superseded moves are satisfied by
  // the newer position the user sees, not dropped and not censored forever.
  const caught = moves.map((m, i) => {
    const f = frames.find((x) => x.now >= m.handlerNow && x.after != null && x.scrubSec != null && x.viewedSec === x.scrubSec + wrongOffset);
    const arrival = Number.isFinite(m.arrival) ? m.arrival : m.timeStamp;
    return { i, arrival, handlerNow: m.handlerNow, ok: !!f, elapsedMs: f ? f.after - arrival : null, frameNow: f?.now ?? null, viewedSec: f?.viewedSec ?? null };
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
    ownTargetP50: rows.some((r) => r.ok) ? median(rows.filter((r) => r.ok).map((r) => r.elapsedMs)) : null,
    caught, caughtUp: caught.filter((c) => c.ok).length,
    p50: caught.some((c) => c.ok) ? median(caught.filter((c) => c.ok).map((c) => c.elapsedMs)) : null,
    p95: caught.length && caught.every((c) => c.ok) ? quantile(caught.map((c) => c.elapsedMs), 0.95) : null,
  };
}

export async function runDrag({ session, launchId, kind = 'mouse', moves = DRAG_MOVES, cadenceMs = DRAG_CADENCE_MS, addedDelayMs = 0, deferredMs = 0, screenshotDir = null, tag = launchId, playing = false, arm = null, rep = null }) {
  const { page, cdp } = session;
  // Off-clock: dismiss the opening Foreseen Extinction recap so the plot is unobstructed.
  if ((await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__?.getSnapshot?.()?.runComplete?.open)) === true) {
    await designClick(page, await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getRunCompleteClickPoint('browse'))); await delay(600);
  }
  if (playing) await resumePlaying(page);
  const probe0 = await enableProbe(page);
  if (!probe0) return { launchId, ok: false, reason: 'probe-unavailable' };
  const revealSettled = await waitForRevealSettled(page);
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
  const referenceAwayReached = await page.waitForFunction((s) => globalThis.__SETTLEMENT_DEBUG__.getScrubProbe().viewedSec === Math.max(0, s - 37), S, { timeout: 30000 }).then(() => true, () => false);
  await page.evaluate((s) => globalThis.__SETTLEMENT_DEBUG__.browseSecond(s), S);
  const referenceReached = await page.waitForFunction((s) => globalThis.__SETTLEMENT_DEBUG__.getScrubProbe().viewedSec === s, S, { timeout: 30000 }).then(() => true, () => false);
  await delay(SETTLE_MS + 250);
  const reference = await readFingerprint(page);
  const analysis = analyzeDrag(raw);
  const secPerPx = (maxSec - minSec) / Math.max(1, plot.b.x - plot.a.x);
  const mappingErrors = analysis.rows.filter((r) => r.targetSec != null).map((r) => Math.abs(r.targetSec - (minSec + (r.x - plot.a.x) * secPerPx)));
  const oracle = {
    revealSettled, referenceAwayReached, referenceReached,
    lossPinned: before.lossSec === EXPECTED_OPENING_LOSS_SEC && reference.lossSec === EXPECTED_OPENING_LOSS_SEC,
    graphicsPinned: graphicsPinned(session.applied),
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
    allDeliveredMovesCaughtUp: analysis.caught.length > 0 && analysis.caughtUp === analysis.caught.length,
  };
  const required = [...DRAG_REQUIRED_PRECONDITIONS, 'graphicsPinned', ...(playing ? ['holdMeaningful'] : []), 'latchedIsScrubbing', 'isScrubbingMidDrag', 'edgeSkipMidDrag', 'holdAfterDown', 'releasedNotScrubbing', 'edgeSettledAfterRelease',
    'pointerMappingOk', 'settledEqualsReferenceState', 'settledEqualsReferencePackets', 'frontierUnchanged', 'seedUnchanged', 'timelineUnchanged', 'movesCompletedAny', 'allDeliveredMovesCaughtUp'];
  const ok = required.every((k) => oracle[k] === true);
  const buildId = collectBuildAssets().buildAssetSha256 ?? 'missing-dist';
  const pop = population({ cpuThrottle: session.cpuThrottle ?? 1, viewport: session.viewport ?? 'desktop', cold: false, artwork: session.artwork, start: session.start ?? 'ordinary-new-game' });
  const control = addedDelayMs > 0 || deferredMs > 0;
  const observations = analysis.caught.map((c) => ({
    job: 'scrub-drag', step: 'move-arrival-to-caught-up-frame', population: { ...pop, input: kind, cadenceMs, arm: arm ?? (control ? 'control' : 'baseline') },
    launchId, observationId: `${launchId}-m${c.i}`, elapsedMs: c.ok ? c.elapsedMs : 0, ok: c.ok && ok, timeout: !c.ok, buildId,
    fixture: session.fixture ?? `ordinary-new-game-seed-${FROZEN_SEED}`, harnessId: HARNESS_ID, measurementContractId: CONTRACT_ID,
    fixtureManifestId: frozenFixtureId(), oracleSdkSha256: oracleSdkId(), comparisonEligible: !control, addedDelayMs, deferredMs,
  }));
  const ownTargetObservations = analysis.rows.map((r) => ({
    job: 'scrub-drag', step: 'move-to-viewed-frame', population: { ...pop, input: kind, cadenceMs },
    launchId, observationId: `${launchId}-own-m${r.i}`, elapsedMs: r.ok ? r.elapsedMs : (r.censoredLowerBoundMs ?? 0),
    ok: r.ok && ok, timeout: false, superseded: r.superseded, buildId,
    fixture: session.fixture ?? `ordinary-new-game-seed-${FROZEN_SEED}`, harnessId: HARNESS_ID, measurementContractId: CONTRACT_ID,
    fixtureManifestId: frozenFixtureId(), oracleSdkSha256: oracleSdkId(), comparisonEligible: !control,
    targetSec: r.targetSec, queueDelayMs: r.queueDelayMs, addedDelayMs, deferredMs,
  }));
  console.log(`${stamp()} drag ${launchId} ok=${ok} delivered=${analysis.delivered}/${moves} completed=${analysis.completed} superseded=${analysis.superseded} p50=${analysis.p50?.toFixed?.(1)} caughtUp=${analysis.caughtUp}/${analysis.caught.length} ownP50=${analysis.ownTargetP50?.toFixed?.(1)} latched=${analysis.latchedIsScrubbing}`);
  return {
    launchId, arm, rep, playing, kind, ok, oracle, required, before, midProbe, afterRelease, reference, plot, secPerPx, maxMappingError: mappingErrors.length ? Math.max(...mappingErrors) : null,
    sent: moves, delivered: analysis.delivered, coalescedOrDropped: moves - analysis.delivered,
    completed: analysis.completed, superseded: analysis.superseded, p50: analysis.p50, p95: analysis.p95, caughtUp: analysis.caughtUp, ownTargetP50: analysis.ownTargetP50,
    rafP50: analysis.rafP50, rafMax: analysis.rafMax, framesOver50: analysis.framesOver50, edgeSkippingDuring: analysis.edgeSkippingDuring,
    addedDelayMs, deferredMs, sendLog, raw, analysis, observations, ownTargetObservations, screenshots: { midDrag: midShot, afterSettle: settleShot },
    errors: session.errors.slice(0, 6),
  };
}

// Wrong-target control: re-analyse the same raw frames with an offset target.
export function wrongTargetControl(drag) {
  const wrong = analyzeDrag({ ...drag.raw, wrongOffset: 7 });
  return { id: 'drag-wrong-target', passed: drag.analysis.caughtUp > 0 && wrong.caughtUp === 0 && wrong.completed === 0, detail: { positiveCaughtUp: drag.analysis.caughtUp, wrongCaughtUp: wrong.caughtUp, wrongOwnTargetCompleted: wrong.completed } };
}

export async function runScrubDragSuite({ outDir, kinds = ['prepared-desktop', 'ordinary-desktop'], screenshotDir = outDir }) {
  mkdirSync(outDir, { recursive: true });
  const server = await startServer();
  const results = { at: new Date().toISOString(), runs: [], controls: [] };
  const save = () => writeFileSync(path.join(outDir, 'scrub-drag-summary.json'), JSON.stringify({
    ...results,
    runs: results.runs.map(({ raw, analysis, observations, ownTargetObservations, sendLog, ...r }) => r),
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
          results.controls.push({ id: 'drag-added-delay', passed: delayed.caughtUp > 0 && Number.isFinite(base) && delayed.p50 - base >= 150, detail: { baseP50: base, delayedP50: delayed.p50, delta: delayed.p50 - base, delayedCompleted: delayed.completed } });
          results.controls.push({ id: 'drag-deferred-completion', passed: deferred.caughtUp > 0 && Number.isFinite(base) && deferred.p50 - base >= 150, detail: { baseP50: base, deferredP50: deferred.p50, delta: deferred.p50 - base, deferredCompleted: deferred.completed } });
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

// WP3b: repeated, interleaved arms. Arms per rep are rotated (Latin square),
// so each arm takes each position once in 4 reps. A1/A2 are identical
// baselines (A/A). Uncertainty: deterministic seeded bootstrap over whole drags
// (clusters) of the difference in medians of per-drag p50s.
export const ARMS = [
  { arm: 'A1', addedDelayMs: 0, deferredMs: 0 },
  { arm: 'A2', addedDelayMs: 0, deferredMs: 0 },
  { arm: 'delay', addedDelayMs: 200, deferredMs: 0 },
  { arm: 'deferred', addedDelayMs: 0, deferredMs: 200 },
];

function xorshift(seed) { let w = seed >>> 0 || 1; return (n) => { w ^= w << 13; w ^= w >>> 17; w ^= w << 5; return Math.floor((w >>> 0) / 4294967296 * n); }; }

export function bootstrapMedianDelta(a, b, { replicates = 5000, seed = 0x41413031, confidence = 0.95 } = {}) {
  if (!a.length || !b.length) return null;
  const draw = xorshift(seed), est = [];
  for (let r = 0; r < replicates; r++) {
    const ra = a.map(() => a[draw(a.length)]), rb = b.map(() => b[draw(b.length)]);
    est.push(quantile(rb, 0.5) - quantile(ra, 0.5));
  }
  const alpha = (1 - confidence) / 2;
  return { delta: quantile(b, 0.5) - quantile(a, 0.5), low: quantile(est, alpha), high: quantile(est, 1 - alpha), confidence, replicates, seed, nA: a.length, nB: b.length,
    method: 'percentile bootstrap over whole drags of median(per-drag p50) difference; diagnostic, small n' };
}

export function evaluateRepeat(drags) {
  const per = (arm) => drags.filter((d) => d.arm === arm && d.ok && Number.isFinite(d.p50)).map((d) => d.p50);
  const pooled = (arm) => drags.filter((d) => d.arm === arm && d.ok).flatMap((d) => d.analysis.caught.filter((c) => c.ok).map((c) => c.elapsedMs));
  const arms = Object.fromEntries(ARMS.map(({ arm }) => {
    const p = pooled(arm);
    return [arm, { drags: drags.filter((d) => d.arm === arm).length, okDrags: per(arm).length, perDragP50: per(arm), medianOfP50: per(arm).length ? quantile(per(arm), 0.5) : null,
      pooledN: p.length, pooledP50: p.length ? quantile(p, 0.5) : null, pooledP50Interval: p.length ? quantileInterval(p, 0.5, 0.95) : null }];
  }));
  const base = [...per('A1'), ...per('A2')];
  const aa = bootstrapMedianDelta(per('A1'), per('A2'));
  const dDelay = bootstrapMedianDelta(base, per('delay'), { seed: 0x44454c31 });
  const dDefer = bootstrapMedianDelta(base, per('deferred'), { seed: 0x44454631 });
  const aaHalf = aa ? Math.max(Math.abs(aa.low), Math.abs(aa.high)) : Infinity;
  // F-W3b-1 carry-over: baseline (A1/A2) drags preceded by a control arm vs by a baseline arm.
  const baseAfter = (pred) => drags.filter((d) => (d.arm === 'A1' || d.arm === 'A2') && d.ok && Number.isFinite(d.p50) && d.prevArm && pred(d.prevArm)).map((d) => d.p50);
  const carry = bootstrapMedianDelta(baseAfter((p) => p === 'A1' || p === 'A2'), baseAfter((p) => p === 'delay' || p === 'deferred'), { seed: 0x43415231 });
  const allOk = drags.every((d) => d.ok);
  const wrong = drags.filter((d) => d.arm === 'A1' && d.ok).map(wrongTargetControl);
  const controls = [
    { id: 'repeat-correctness', passed: allOk && drags.length >= 20, detail: { drags: drags.length, failed: drags.filter((d) => !d.ok).map((d) => ({ launchId: d.launchId, failed: d.oracle ? Object.entries(d.oracle).filter(([k, v]) => d.required.includes(k) && v !== true).map(([k]) => k) : d.reason })) } },
    { id: 'drag-wrong-target-repeat', passed: wrong.length >= 5 && wrong.every((w) => w.passed), detail: wrong.map((w) => w.detail) },
    // Predeclared: A/A 95% interval contains 0 (runner/order bias within noise).
    { id: 'drag-aa', passed: !!aa && aa.low <= 0 && aa.high >= 0 && per('A1').length >= 5 && per('A2').length >= 5, detail: aa },
    // Predeclared: control shift >= 150 ms, lower bound > 0 and beyond the A/A envelope.
    { id: 'drag-added-delay-repeat', passed: !!dDelay && per('delay').length >= 5 && dDelay.delta >= 150 && dDelay.low > 0 && dDelay.low > aaHalf, detail: { ...dDelay, aaEnvelopeMs: aaHalf } },
    { id: 'drag-carry-over', passed: !!carry && carry.nA >= 3 && carry.nB >= 3 && carry.low <= 0 && carry.high >= 0, detail: carry },
    { id: 'drag-deferred-completion-repeat', passed: !!dDefer && per('deferred').length >= 5 && dDefer.delta >= 150 && dDefer.low > 0 && dDefer.low > aaHalf, detail: { ...dDefer, aaEnvelopeMs: aaHalf } },
  ];
  return { arms, controls };
}

// WP3c: Williams balanced Latin square for 4 arms (rows over A1,A2,delay,deferred
// indices): within each block of 4 rows every arm immediately follows every
// other arm exactly once (first-order carry-over balanced).
export const WILLIAMS_4 = [[0, 1, 3, 2], [1, 2, 0, 3], [2, 3, 1, 0], [3, 0, 2, 1]];
// Eulerian circuit of the complete directed graph on 4 arms: repeated
// cyclically, every ordered pair (including the wrap) occurs exactly once per
// 12 drags, so carry-over is balanced across row boundaries too (WP3c).
export const CARRYOVER_CIRCUIT_4 = [0, 1, 0, 2, 0, 3, 1, 2, 1, 3, 2, 3];
// WP3c attempt 2: also position-balanced within the 12-cycle (A1 and A2 mean
// position 5.67, controls never more than 2 in a row), chosen by exhaustive
// search over all 768 Eulerian circuits starting at A1.
export const CARRYOVER_CIRCUIT_4B = [0, 2, 1, 3, 1, 2, 3, 0, 3, 2, 0, 1];

// Fixed settle gap: wait until playback is held and the drag/edge state is
// idle, then a further gapMs (recorded per drag).
// B03: a drag whose settle-gap idle precondition timed out is not admitted.
export function applyGapOutcome(drag, gap) {
  drag.settleGap = gap;
  if (gap && gap.idleReached !== true) {
    drag.ok = false;
    drag.oracle = { ...(drag.oracle ?? {}), settleGapIdleReached: false };
    drag.required = [...(drag.required ?? []), 'settleGapIdleReached'];
    for (const o of drag.observations ?? []) o.ok = false;
  }
  return drag;
}

export async function settleGap(page, gapMs) {
  const t0 = Date.now();
  const idleReached = await page.waitForFunction(() => { const p = globalThis.__SETTLEMENT_DEBUG__.getScrubProbe(); return p && p.playbackTarget === 0 && p.isScrubbing === false && p.edge?.skipping !== true; }, null, { timeout: 30000, polling: 100 }).then(() => true, () => false);
  const idleAt = Date.now();
  await delay(gapMs);
  return { idleReached, waitIdleMs: idleAt - t0, extraMs: gapMs, totalMs: Date.now() - t0 };
}

export async function runRepeatSuite({ outDir, kinds = ['prepared-desktop', 'prepared-mobile'], reps = 5, screenshotDir = outDir, design = 'rotation', settleGapMs = 0 }) {
  mkdirSync(outDir, { recursive: true });
  const server = await startServer();
  const results = { at: new Date().toISOString(), reps, design, settleGapMs, arms: ARMS, kinds: {} };
  const save = () => writeFileSync(path.join(outDir, 'scrub-drag-repeat-summary.json'), JSON.stringify(results, null, 2));
  try {
    for (const kindName of kinds) {
      const mobile = kindName.endsWith('mobile');
      const input = mobile ? 'touch' : 'mouse';
      const k = results.kinds[kindName] = { input, cpuThrottle: mobile ? 4 : 1, viewport: mobile ? 'mobile-844x390' : 'desktop-1280x800', drags: [], playing: null };
      let session = null;
      try {
        session = await openPreparedStart({ server, cpuThrottle: mobile ? 4 : 1, viewport: mobile ? 'mobile' : 'desktop' });
        k.opening = session.opening; k.openMs = session.openMs; k.entry = session.entry;
        k.playing = await enterPlaying(session.page);
        if (screenshotDir) { k.playingShot = path.join(screenshotDir, `${kindName}-playing-before-drag.png`); await session.page.screenshot({ path: k.playingShot }); }
        console.log(`${stamp()} ${kindName} opened ${session.openMs} ms playing=${JSON.stringify(k.playing)}`);
        const drags = [];
        const circuit = design === 'circuit2' ? CARRYOVER_CIRCUIT_4B : CARRYOVER_CIRCUIT_4;
        const total = design.startsWith('circuit') ? Math.ceil(reps * 4 / 12) * 12 : reps * 4;
        for (let idx = 0; idx < total; idx++) {
          const r = Math.floor(idx / 4), j = idx % 4;
          {
            const a = design.startsWith('circuit') ? ARMS[circuit[idx % 12]] : design === 'williams' ? ARMS[WILLIAMS_4[r % 4][j]] : ARMS[(j + r) % ARMS.length];
            const prevArm = drags.at(-1)?.arm ?? null;
            const gap = settleGapMs > 0 && drags.length ? await settleGap(session.page, settleGapMs) : null;
            const launchId = design.startsWith('circuit') ? `${kindName}-${String(idx).padStart(2, '0')}-${a.arm}` : `${kindName}-${a.arm}-r${r}`;
            const shotTag = idx === 0 ? kindName : null;
            const d = await runDrag({ session, launchId, kind: input, addedDelayMs: a.addedDelayMs, deferredMs: a.deferredMs, playing: true, arm: a.arm, rep: r,
              screenshotDir: shotTag ? screenshotDir : null, tag: shotTag ?? launchId });
            d.prevArm = prevArm; applyGapOutcome(d, gap);
            drags.push(d);
            const { raw, sendLog, ...rest } = d;
            writeFileSync(path.join(outDir, `raw-drag-${launchId}.json`), JSON.stringify(d));
            k.drags.push({ ...rest, analysis: undefined, observations: undefined, ownTargetObservations: undefined });
            save();
          }
        }
        const ev = evaluateRepeat(drags);
        k.arms = ev.arms; k.controls = ev.controls;
        k.summaries = summarize(drags.flatMap((d) => d.observations));
        console.log(`${stamp()} ${kindName} controls ${ev.controls.map((c) => `${c.id}=${c.passed}`).join(' ')}`);
      } catch (err) {
        k.error = `error: ${err.message}`; console.log(`${stamp()} ${kindName} ${k.error}`);
      } finally { save(); await closeSession(session); }
    }
  } finally { await server.close(); }
  save();
  return results;
}

if (process.argv[1]?.endsWith('scrub-drag.mjs')) {
  const id = arg('id', `drag-${Date.now()}`);
  const kinds = arg('kinds', 'prepared-desktop,ordinary-desktop').split(',');
  const outDir = path.join(REPO_ROOT, ARTIFACT_ROOT_REL, id);
  const reps = Number(arg('repeat', '0'));
  if (reps > 0) {
    const r = await runRepeatSuite({ outDir, kinds, reps, design: arg('design', 'rotation'), settleGapMs: Number(arg('settle-gap-ms', '0')) });
    finalizeRun(outDir);
    console.log(JSON.stringify({ id, kinds: Object.fromEntries(Object.entries(r.kinds).map(([n, k]) => [n, { error: k.error, arms: k.arms && Object.fromEntries(Object.entries(k.arms).map(([a, v]) => [a, { ok: v.okDrags, med: v.medianOfP50 }])), controls: k.controls?.map((c) => ({ id: c.id, passed: c.passed, delta: c.detail?.delta, low: c.detail?.low, high: c.detail?.high })) }])), artifact: outDir }));
    process.exit(0);
  }
  const r = await runScrubDragSuite({ outDir, kinds });
  finalizeRun(outDir);
  console.log(JSON.stringify({ id, runs: r.runs.map((x) => ({ id: x.launchId, ok: x.ok, reason: x.reason, p50: x.p50, completed: x.completed, delivered: x.delivered, failed: x.oracle ? Object.entries(x.oracle).filter(([k, v]) => v !== true).map(([k]) => k) : null })), controls: r.controls.map((c) => ({ id: c.id, passed: c.passed })), artifact: outDir }));
  process.exit(0);
}
