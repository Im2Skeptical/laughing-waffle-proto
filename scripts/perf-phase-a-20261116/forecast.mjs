// Node-side forecast horizon throughput and mid-run re-projection.
// Wall-clock via process.hrtime.bigint(); counts only successfully completed work.
import { createNewGameState } from '../../src/model/new-game.js';
import { serializeGameState } from '../../src/model/state.js';
import { buildProjectionChunkFromStateData } from '../../src/model/projection-chunk.js';
import {
  CONTRACT_ID, HARNESS_ID, FROZEN_SEED, FORECAST_WINDOW_SEC,
  FORECAST_HORIZON_CAP_SEC, EXPECTED_OPENING_LOSS_SEC, frozenFixtureId, oracleSdkId, population, nodeBuildId,
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
    buildId: nodeBuildId(),
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

export function runForecastHorizon({ launchId, observationId, addedDelayMs = 0, expectedLossSec = EXPECTED_OPENING_LOSS_SEC } = {}) {
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
  if (!opening?.ok || !opening.terminal || opening.endSec !== EXPECTED_OPENING_LOSS_SEC) {
    return observationBase({
      job: 'unveil-reproject', step: 'reproject-compute',
      launchId, observationId, elapsedMs: 0, ok: false, timeout: false,
      extra: { reason: 'opening-forecast-failed-or-loss-moved', openingLossSec: opening?.endSec ?? null },
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

export function runForecastControls({ rawSink = null } = {}) {
  const outcomes = [];
  // Every control row (positive and negative) is retained raw (F-3).
  const keep = (row) => {
    if (rawSink) { const { chunk, ...rest } = row; rawSink.push({ ...rest, comparisonEligible: false, control: true }); }
    return row;
  };
  // Unmeasured warmup so the added-delay pair is a warm/warm comparison.
  // The first cold attempt on 12 Nov showed only +86 ms (JIT noise); warmup is required.
  keep(runForecastWindow({ launchId: 'ctrl-delay-warmup', observationId: 'ctrl-delay-warmup', endSec: 96 }));
  const base = keep(runForecastWindow({ launchId: 'ctrl-delay-base', observationId: 'ctrl-delay-base', endSec: 96 }));
  const delayed = keep(runForecastWindow({ launchId: 'ctrl-delay-added', observationId: 'ctrl-delay-added', endSec: 96, addedDelayMs: 200 }));
  outcomes.push({
    id: 'forecast-added-delay',
    passed: delayed.ok && base.ok && (delayed.elapsedMs - base.elapsedMs) >= 150,
    detail: { baseMs: base.elapsedMs, delayedMs: delayed.elapsedMs, delta: delayed.elapsedMs - base.elapsedMs },
  });
  // Wrong expected end must fail the oracle.
  const wrong = keep(runForecastWindow({ launchId: 'ctrl-wrong', observationId: 'ctrl-wrong', endSec: 96, wrongEndOracle: 50 }));
  outcomes.push({ id: 'forecast-wrong-result', passed: wrong.ok === false, detail: { ok: wrong.ok, endSec: wrong.endSec } });
  const windowOk = keep(runForecastWindow({ launchId: 'ctrl-window', observationId: 'ctrl-window', endSec: 96 }));
  outcomes.push({ id: 'forecast-window-positive', passed: windowOk.ok === true, detail: { elapsedMs: windowOk.elapsedMs, endSec: windowOk.endSec } });
  const horizon = keep(runForecastHorizon({ launchId: 'ctrl-horizon', observationId: 'ctrl-horizon' }));
  outcomes.push({
    id: 'forecast-horizon-positive',
    passed: horizon.ok === true && horizon.endSec === EXPECTED_OPENING_LOSS_SEC,
    detail: { endSec: horizon.endSec, expected: EXPECTED_OPENING_LOSS_SEC, elapsedMs: horizon.elapsedMs, simPerSec: horizon.simPerSec },
  });
  // Expected loss is pinned in identities.mjs (6138 on v1.1.69). A wrong
  // expected loss must fail closed while the observed endSec stays the pin.
  const wrongLoss = keep(runForecastHorizon({ launchId: 'ctrl-wrong-loss', observationId: 'ctrl-wrong-loss', expectedLossSec: 1 }));
  outcomes.push({
    id: 'forecast-horizon-wrong-loss',
    passed: wrongLoss.ok === false && wrongLoss.endSec === EXPECTED_OPENING_LOSS_SEC,
    detail: { ok: wrongLoss.ok, endSec: wrongLoss.endSec },
  });
  const reproj = keep(runReprojection({ launchId: 'ctrl-reproj', observationId: 'ctrl-reproj' }));
  outcomes.push({
    id: 'reproject-positive',
    passed: reproj.ok === true && reproj.twinAgreed === true,
    detail: {
      frontierSec: reproj.frontierSec, openingLossSec: reproj.openingLossSec,
      reprojectLossSec: reproj.reprojectLossSec, twinAgreed: reproj.twinAgreed, elapsedMs: reproj.elapsedMs,
    },
  });
  return { passed: outcomes.every((o) => o.passed), outcomes };
}
