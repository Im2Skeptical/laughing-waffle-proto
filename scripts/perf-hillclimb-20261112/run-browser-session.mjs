// Time-boxed browser controls + suites. Skips Node forecast controls (already
// proven this session). Comparison-ineligible if this process is killed mid-run.
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { runAllControls } from './controls.mjs';
import { startServer, runNewGameJob, runScrubJob, closeSession, inspectWorkerWrap } from './browser.mjs';
import { REPO_ROOT, FROZEN_SEED, SCRUB_WARM_STEPS, machineConfig, collectBuildAssets, frozenFixtureId, oracleSdkId, HARNESS_ID, CONTRACT_ID } from './identities.mjs';

function now() { return new Date().toISOString(); }
function log(msg, extra) {
  const line = `[${new Date().toLocaleTimeString('en-AU', { hour12: false, timeZone: 'Australia/Sydney' })} AEDT] ${msg}${extra ? ' ' + JSON.stringify(extra) : ''}`;
  console.log(line);
}

const outDir = path.join(REPO_ROOT, 'artifacts/perf-hillclimb-20261112', process.argv[2] || `browser-session-${Date.now()}`);
mkdirSync(outDir, { recursive: true });

function dropSession(r) {
  if (!r) return r;
  const { _session, ...rest } = r;
  return rest;
}

function write(name, data) {
  const p = path.join(outDir, name);
  writeFileSync(p, JSON.stringify(data, null, 2));
  return p;
}

// ---- browser controls only (no forecast.mjs) ----
async function runBrowserControls() {
  const outcomes = [];
  const server = await startServer();
  let ng = null, stalled = null;
  try {
    const off = await inspectWorkerWrap({ server, instrument: false });
    outcomes.push({
      id: 'instrument-off-no-worker-wrap',
      passed: off.wrapped === false && off.sameRef === true && off.instrumentFlag === false,
      detail: off,
    });
    log('wrap-off', outcomes.at(-1));
    const on = await inspectWorkerWrap({ server, instrument: true });
    outcomes.push({
      id: 'instrument-on-wraps-worker',
      passed: on.instrumentFlag === true && on.sameRef === false,
      detail: on,
    });
    log('wrap-on', outcomes.at(-1));

    log('new-game-positive starting');
    ng = await runNewGameJob({
      server, cpuThrottle: 1, viewport: 'desktop', instrument: false,
      launchId: 'ctrl-ng-positive', observationId: 'ctrl-ng-positive',
      timeoutMs: 240000,
    });
    outcomes.push({
      id: 'new-game-positive',
      passed: ng.ok === true && ng.lossSec > 0 && ng.elapsedMs > 1000 && ng.oracle?.ok === true,
      detail: dropSession({
        elapsedMs: ng.elapsedMs, lossSec: ng.lossSec, coverageSec: ng.coverageSec,
        phase: ng.openingPhase, openingElapsedSec: ng.openingElapsedSec,
        bake: ng.bake, heapMB: ng.heapMB, workerWrapped: ng.workerWrapped,
        oracle: ng.oracle, fixture: ng.fixture,
        queueDelayMs: ng.queueDelayMs,
      }),
    });
    log('new-game-positive', outcomes.at(-1));
    write('ctrl-ng-positive.json', dropSession(ng));

    if (ng.ok && ng._session) {
      const median = (vals) => {
        const s = [...vals].sort((a, b) => a - b);
        return s.length ? s[s.length >> 1] : null;
      };
      const warm = await runScrubJob({
        session: ng._session, launchId: 'ctrl-scrub-positive',
        observationPrefix: 'ctrl-scrub-pos', steps: 8,
      });
      outcomes.push({
        id: 'scrub-positive',
        passed: warm.length === 8 && warm.every((r) => r.ok && !r.timeout),
        detail: {
          n: warm.length,
          p50: warm.length ? [...warm].sort((a, b) => a.elapsedMs - b.elapsedMs)[warm.length >> 1].elapsedMs : null,
          max: Math.max(0, ...warm.map((r) => r.elapsedMs)),
          failed: warm.filter((r) => !r.ok).length,
        },
      });
      log('scrub-positive', outcomes.at(-1));
      write('ctrl-scrub-positive.json', warm);

      const wrong = await runScrubJob({
        session: ng._session, launchId: 'ctrl-scrub-wrong',
        observationPrefix: 'ctrl-scrub-wrong', steps: 3, wrongTarget: -1,
      });
      outcomes.push({
        id: 'scrub-wrong-result',
        passed: wrong.length === 3 && wrong.every((r) => r.ok === false),
        detail: { oks: wrong.map((r) => r.ok), viewed: wrong.map((r) => r.viewedSec) },
      });
      log('scrub-wrong-result', outcomes.at(-1));

      const base2 = await runScrubJob({
        session: ng._session, launchId: 'ctrl-scrub-delay-base',
        observationPrefix: 'ctrl-scrub-db', steps: 6,
      });
      const delayed = await runScrubJob({
        session: ng._session, launchId: 'ctrl-scrub-delay',
        observationPrefix: 'ctrl-scrub-d', steps: 6, addedDelayMs: 200,
      });
      const baseMed = median(base2.map((r) => r.elapsedMs));
      const delMed = median(delayed.map((r) => r.elapsedMs));
      outcomes.push({
        id: 'scrub-added-delay',
        passed: base2.every((r) => r.ok) && delayed.every((r) => r.ok) && (delMed - baseMed) >= 150,
        detail: { baseMed, delMed, delta: delMed - baseMed },
      });
      log('scrub-added-delay', outcomes.at(-1));

      const deferred = await runScrubJob({
        session: ng._session, launchId: 'ctrl-scrub-deferred',
        observationPrefix: 'ctrl-scrub-df', steps: 4, deferredMs: 200,
      });
      const defMed = median(deferred.map((r) => r.elapsedMs));
      outcomes.push({
        id: 'scrub-deferred-completion',
        passed: deferred.every((r) => r.ok) && (defMed - baseMed) >= 150,
        detail: { baseMed, defMed, delta: defMed - baseMed },
      });
      log('scrub-deferred-completion', outcomes.at(-1));
    } else {
      outcomes.push({ id: 'scrub-positive', passed: false, detail: 'skipped: new-game failed' });
      outcomes.push({ id: 'scrub-wrong-result', passed: false, detail: 'skipped' });
      outcomes.push({ id: 'scrub-added-delay', passed: false, detail: 'skipped' });
      outcomes.push({ id: 'scrub-deferred-completion', passed: false, detail: 'skipped' });
    }
    await closeSession(ng?._session);

    log('new-game-stall starting');
    stalled = await runNewGameJob({
      server, cpuThrottle: 1, viewport: 'desktop', instrument: false,
      stallMainThreadMs: 200,
      launchId: 'ctrl-ng-stall', observationId: 'ctrl-ng-stall',
      timeoutMs: 240000,
    });
    outcomes.push({
      id: 'new-game-queued-input-stall',
      passed: stalled.ok === true && stalled.queueDelayMs >= 150,
      detail: dropSession({
        elapsedMs: stalled.elapsedMs, queueDelayMs: stalled.queueDelayMs,
        handlerElapsedMs: stalled.handlerElapsedMs, oracle: stalled.oracle,
        lossSec: stalled.lossSec, openingPhase: stalled.openingPhase,
      }),
    });
    log('new-game-stall', outcomes.at(-1));
    write('ctrl-ng-stall.json', dropSession(stalled));
    await closeSession(stalled?._session);
  } finally {
    await server.close();
  }
  const passed = outcomes.every((o) => o.passed);
  write('controls.json', { passed, outcomes, at: now(), skipForecast: true });
  return { passed, outcomes, serverClosed: true };
}

async function runSuites({ suites, populations, deadlineMs }) {
  const server = await startServer();
  const newGameRows = [], bakeRows = [], scrubRows = [], unveilRows = [], suiteReports = [];
  try {
    for (let s = 0; s < suites; s++) {
      if (Date.now() >= deadlineMs) {
        log('suite deadline reached, stopping', { completedSuites: s });
        break;
      }
      const suiteRep = { index: s, populations: [] };
      for (const pop of populations) {
        if (Date.now() >= deadlineMs) {
          log('suite deadline mid-population, stopping');
          break;
        }
        const launchId = `suite${s}-${pop.viewport}-x${pop.cpuThrottle}`;
        log('suite starting', { launchId });
        const ng = await runNewGameJob({
          server,
          cpuThrottle: pop.cpuThrottle,
          viewport: pop.viewport,
          instrument: false,
          launchId,
          observationId: `${launchId}-ng`,
          timeoutMs: 240000,
        });
        newGameRows.push(dropSession(ng));
        write(`raw-ng-${launchId}.json`, dropSession(ng));
        log('suite new-game', {
          launchId, ok: ng.ok, elapsedMs: ng.elapsedMs, lossSec: ng.lossSec,
          seedReason: ng.oracle?.reasons, phase: ng.openingPhase,
          bakeMs: ng.bake?.bakeMs, openingElapsedSec: ng.openingElapsedSec,
        });
        if (ng.bake && Number.isFinite(ng.bake.bakeMs)) {
          bakeRows.push({ ...dropSession(ng), job: 'bake', step: 'terrain-bake',
            observationId: `${launchId}-bake`, elapsedMs: ng.bake.bakeMs,
            ok: ng.ok && ng.bake.bakeMs > 0 });
        } else {
          bakeRows.push({ ...dropSession(ng), job: 'bake', step: 'terrain-bake',
            observationId: `${launchId}-bake`, elapsedMs: 0, ok: false, reason: 'bake-not-reported' });
        }
        unveilRows.push({
          ...dropSession(ng), job: 'opening-unveil-pacing', step: 'authored-reveal',
          observationId: `${launchId}-opening-unveil`,
          elapsedMs: (ng.openingElapsedSec ?? 0) * 1000,
          ok: ng.ok && (ng.openingPhase === 'completed' || ng.openingElapsedSec >= 5),
          note: 'intentional opening reveal pacing, not post-death re-projection compute',
        });
        let scrub = [];
        if (ng.ok && ng._session) {
          scrub = await runScrubJob({
            session: ng._session, launchId,
            observationPrefix: `${launchId}-scrub`,
            steps: SCRUB_WARM_STEPS,
          });
          scrubRows.push(...scrub);
          write(`raw-scrub-${launchId}.json`, scrub);
          log('suite scrub', { launchId, passed: scrub.filter((r) => r.ok).length, total: scrub.length,
            times: scrub.map((r) => r.elapsedMs) });
        }
        suiteRep.populations.push({
          pop, launchId,
          newGameOk: ng.ok, newGameMs: ng.elapsedMs, lossSec: ng.lossSec,
          bakeMs: ng.bake?.bakeMs ?? null,
          oracle: ng.oracle,
          scrubPassed: scrub.filter((r) => r.ok).length,
          scrubTotal: scrub.length,
        });
        await closeSession(ng._session);
      }
      suiteReports.push(suiteRep);
    }
  } finally {
    await server.close();
  }
  write('suites.json', { suiteReports, at: now() });
  write('raw-new-game.json', newGameRows);
  write('raw-bake.json', bakeRows);
  write('raw-scrub.json', scrubRows);
  write('raw-opening-unveil.json', unveilRows);
  return { newGameRows, bakeRows, scrubRows, unveilRows, suiteReports };
}

const phase = process.argv[3] || 'all'; // controls | suites | all
const deadline = Date.parse('2026-11-12T12:36:00+11:00');
log('session start', { outDir, phase, deadline: new Date(deadline).toISOString(), seed: FROZEN_SEED,
  identities: { HARNESS_ID, CONTRACT_ID, fixture: frozenFixtureId(), oracle: oracleSdkId(), build: collectBuildAssets(), machine: machineConfig() } });

const report = { at: now(), outDir, phase };
if (phase === 'controls' || phase === 'all') {
  report.controls = await runBrowserControls();
  log('controls done', { passed: report.controls.passed });
}
if ((phase === 'suites' || phase === 'all') && Date.now() < deadline) {
  report.suites = await runSuites({
    suites: 6,
    populations: [
      { cpuThrottle: 1, viewport: 'desktop' },
      { cpuThrottle: 4, viewport: 'mobile' },
    ],
    deadlineMs: deadline,
  });
  log('suites done', { n: report.suites.suiteReports.length });
} else if (phase === 'suites' || phase === 'all') {
  log('skipped suites, past deadline');
}
write('SESSION_REPORT.json', report);
log('session complete', { passed: report.controls?.passed, suites: report.suites?.suiteReports?.length ?? 0 });
process.exit(report.controls && report.controls.passed === false ? 1 : 0);
