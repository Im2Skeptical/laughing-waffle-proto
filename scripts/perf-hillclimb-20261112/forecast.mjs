// Node-side forecast horizon throughput and mid-run re-projection.
// Wall-clock via process.hrtime.bigint(); counts only successfully completed work.
import { createNewGameState } from '../../src/model/new-game.js';
import { serializeGameState } from '../../src/model/state.js';
import { buildProjectionChunkFromStateData } from '../../src/model/projection-chunk.js';
import {
  CONTRACT_ID, HARNESS_ID, FROZEN_SEED, FORECAST_WINDOW_SEC,
  FORECAST_HORIZON_CAP_SEC, frozenFixtureId, oracleSdkId, population,
} from './identities.mjs';

function nowNs() { return process.hrtime.bigint(); }
function msSince(t0) { return Number(nowNs() - t0) / 1e6; }

function busyWait(ms) {
  if (!(ms > 0)) return;
  const until = Number(nowNs()) / 1e6 + ms;
  while (Number(nowNs()) / 1e6 < until) { /* deliberate measured stall */ }
}

function initialStateData() {
  return serializeGameState(createNewGameState(FROZEN_SEED));
}

function nearestAnchor(stateDataBySecond, target) {
  const keys = [...stateDataBySecond.keys()].sort((a, b) => a - b);
  if (!keys.length) return null;
  let best = keys[0];
  for (const k of keys) {
    if (Math.abs(k - target) < Math.abs(best - target)) best = k;
  }
  return { sec: best, stateData: stateDataBySecond.get(best) };
}

function observationBase({ job, step, launchId, observationId, elapsedMs, ok, timeout, extra, cpuThrottle = 1 }) {
  return {
    job, step,
    population: population({ cpuThrottle, viewport: 'node', cold: true, artwork: 'n/a' }),
    launchId, observationId, elapsedMs, ok, timeout: !!timeout,
    buildId: 'node-model-v1.1.59',
    fixture: `ordinary-new-game-seed-${FROZEN_SEED}`,
    harnessId: HARNESS_ID,
    measurementContractId: CONTRACT_ID,
    fixtureManifestId: frozenFixtureId(),
    oracleSdkSha256: oracleSdkId(),
    comparisonEligible: true,
    ...extra,
  };
}

export function runForecastWindow({ launchId, observationId, endSec = FORECAST_WINDOW_SEC, addedDelayMs = 0, wrongEndOracle = null } = {}) {
  const data = initialStateData();
  const t0 = nowNs();
  if (addedDelayMs) busyWait(addedDelayMs);
  const chunk = buildProjectionChunkFromStateData(data, 0, endSec);
  const elapsedMs = msSince(t0);
  const expectedEnd = wrongEndOracle ?? endSec;
  const ok = chunk?.ok === true
    && chunk.endSec === expectedEnd
    && chunk.baseSec === 0
    && chunk.terminal !== true
    && chunk.summaryBySecond instanceof Map
    && chunk.summaryBySecond.has(0)
    && chunk.summaryBySecond.has(endSec);
  const simSec = ok ? (chunk.endSec - chunk.baseSec) : 0;
  return observationBase({
    job: 'forecast-window', step: 'chunk-complete',
    launchId, observationId, elapsedMs, ok, timeout: false,
    extra: {
      endSec: chunk?.endSec ?? null,
      terminal: chunk?.terminal === true,
      simSec,
      simPerSec: elapsedMs > 0 ? simSec / (elapsedMs / 1000) : null,
      addedDelayMs,
    },
  });
}

export function runForecastHorizon({ launchId, observationId, addedDelayMs = 0, expectedLossSec = null } = {}) {
  const data = initialStateData();
  const t0 = nowNs();
  if (addedDelayMs) busyWait(addedDelayMs);
  const chunk = buildProjectionChunkFromStateData(data, 0, FORECAST_HORIZON_CAP_SEC);
  const elapsedMs = msSince(t0);
  const ok = chunk?.ok === true
    && chunk.terminal === true
    && Number.isFinite(chunk.endSec)
    && chunk.endSec > 0
    && chunk.endSec < FORECAST_HORIZON_CAP_SEC
    && (expectedLossSec == null || chunk.endSec === expectedLossSec)
    && chunk.summaryBySecond.has(chunk.endSec);
  const simSec = ok ? chunk.endSec : 0;
  return {
    ...observationBase({
      job: 'forecast-horizon', step: 'loss-complete',
      launchId, observationId, elapsedMs, ok, timeout: false,
      extra: {
        endSec: chunk?.endSec ?? null,
        terminal: chunk?.terminal === true,
        simSec,
        simPerSec: elapsedMs > 0 ? simSec / (elapsedMs / 1000) : null,
        addedDelayMs,
      },
    }),
    chunk: ok ? chunk : null,
  };
}

export function runReprojection({ launchId, observationId, frontierSec = null, addedDelayMs = 0 } = {}) {
  // Opening (no-action) trajectory to a mid-run official frontier, then a fresh
  // forecast "as if no further changes." This is the compute of post-vassal-death
  // re-projection, not the browser-visible reveal pacing. Visible unveil is a
  // separate browser measurement; intentional 5s opening reveal is not treated
  // as compute.
  const opening = buildProjectionChunkFromStateData(initialStateData(), 0, FORECAST_HORIZON_CAP_SEC);
  if (!opening?.ok || !opening.terminal) {
    return observationBase({
      job: 'unveil-reproject', step: 'reproject-compute',
      launchId, observationId, elapsedMs: 0, ok: false, timeout: false,
      extra: { reason: 'opening-forecast-failed' },
    });
  }
  const target = frontierSec ?? Math.floor(opening.endSec / 3);
  const aligned = Math.floor(target / 16) * 16;
  const anchor = nearestAnchor(opening.stateDataBySecond, aligned);
  if (!anchor) {
    return observationBase({
      job: 'unveil-reproject', step: 'reproject-compute',
      launchId, observationId, elapsedMs: 0, ok: false, timeout: false,
      extra: { reason: 'missing-anchor' },
    });
  }
  const t0 = nowNs();
  if (addedDelayMs) busyWait(addedDelayMs);
  const chunk = buildProjectionChunkFromStateData(anchor.stateData, anchor.sec, FORECAST_HORIZON_CAP_SEC);
  const elapsedMs = msSince(t0);
  const ok = chunk?.ok === true
    && chunk.terminal === true
    && chunk.endSec >= anchor.sec
    && chunk.endSec <= opening.endSec
    && chunk.baseSec === anchor.sec
    && chunk.summaryBySecond.has(chunk.endSec);
  // Same opening trajectory with no player actions must not survive past the
  // original loss. A second independent build from the same anchor must agree.
  let agree = false;
  if (ok) {
    const twin = buildProjectionChunkFromStateData(anchor.stateData, anchor.sec, FORECAST_HORIZON_CAP_SEC);
    agree = twin.ok === true && twin.terminal === true && twin.endSec === chunk.endSec;
  }
  const simSec = ok ? (chunk.endSec - anchor.sec) : 0;
  return observationBase({
    job: 'unveil-reproject', step: 'reproject-compute',
    launchId, observationId, elapsedMs, ok: ok && agree, timeout: false,
    extra: {
      frontierSec: anchor.sec,
      openingLossSec: opening.endSec,
      reprojectLossSec: chunk?.endSec ?? null,
      twinAgreed: agree,
      terminal: chunk?.terminal === true,
      simSec,
      simPerSec: elapsedMs > 0 ? simSec / (elapsedMs / 1000) : null,
      addedDelayMs,
    },
  });
}

export function runForecastControls() {
  const outcomes = [];
  // Unmeasured warmup so the added-delay pair is a warm/warm comparison.
  runForecastWindow({ launchId: 'ctrl-delay-warmup', observationId: 'ctrl-delay-warmup', endSec: 96 });
  const base = runForecastWindow({ launchId: 'ctrl-delay-base', observationId: 'ctrl-delay-base', endSec: 96 });
  const delayed = runForecastWindow({ launchId: 'ctrl-delay-added', observationId: 'ctrl-delay-added', endSec: 96, addedDelayMs: 200 });
  const delayAppeared = delayed.ok && base.ok && (delayed.elapsedMs - base.elapsedMs) >= 150;
  outcomes.push({
    id: 'forecast-added-delay',
    passed: delayAppeared,
    detail: { baseMs: base.elapsedMs, delayedMs: delayed.elapsedMs, delta: delayed.elapsedMs - base.elapsedMs },
  });
  // Wrong expected end must fail the oracle.
  const wrong = runForecastWindow({ launchId: 'ctrl-wrong', observationId: 'ctrl-wrong', endSec: 96, wrongEndOracle: 50 });
  outcomes.push({
    id: 'forecast-wrong-result',
    passed: wrong.ok === false,
    detail: { ok: wrong.ok, endSec: wrong.endSec },
  });
  // Positive window and horizon still pass.
  const windowOk = runForecastWindow({ launchId: 'ctrl-window', observationId: 'ctrl-window', endSec: 96 });
  outcomes.push({ id: 'forecast-window-positive', passed: windowOk.ok === true, detail: { elapsedMs: windowOk.elapsedMs } });
  const horizon = runForecastHorizon({ launchId: 'ctrl-horizon', observationId: 'ctrl-horizon' });
  outcomes.push({
    id: 'forecast-horizon-positive',
    passed: horizon.ok === true && horizon.endSec === 5064,
    detail: { endSec: horizon.endSec, elapsedMs: horizon.elapsedMs, simPerSec: horizon.simPerSec },
  });
  // Pin expected loss 5064 from the v1.1.59 / seed 424242 observation above.
  // If product code changes loss, this control must fail closed (not silently retune).
  const wrongLoss = runForecastHorizon({ launchId: 'ctrl-wrong-loss', observationId: 'ctrl-wrong-loss', expectedLossSec: 1 });
  outcomes.push({
    id: 'forecast-horizon-wrong-loss',
    passed: wrongLoss.ok === false && wrongLoss.endSec === 5064,
    detail: { ok: wrongLoss.ok, endSec: wrongLoss.endSec },
  });
  const reproj = runReprojection({ launchId: 'ctrl-reproj', observationId: 'ctrl-reproj' });
  outcomes.push({
    id: 'reproject-positive',
    passed: reproj.ok === true && reproj.twinAgreed === true,
    detail: {
      frontierSec: reproj.frontierSec,
      openingLossSec: reproj.openingLossSec,
      reprojectLossSec: reproj.reprojectLossSec,
      elapsedMs: reproj.elapsedMs,
    },
  });
  return { passed: outcomes.every((o) => o.passed), outcomes };
}
