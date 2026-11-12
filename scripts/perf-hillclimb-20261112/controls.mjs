// Validity controls for every distinct oracle and timing mechanism.
// Comparison-ineligible. Restore the real path before proof runs (these
// use isolated sessions and do not mutate product code).
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { runForecastControls } from './forecast.mjs';
import { startServer, runNewGameJob, runScrubJob, closeSession, inspectWorkerWrap } from './browser.mjs';
import { REPO_ROOT } from './identities.mjs';

function pctDelta(delayed, base) { return delayed - base; }

export async function runAllControls({ outDir, includeBrowser = true } = {}) {
  const outcomes = [];

  // Statistics mechanism is tested separately by statistics-test.mjs;
  // invoke it here as a required gate via child-process? Importing the test
  // file would re-run asserts. We spawn it in run.mjs. Record the expectation.
  outcomes.push({ id: 'statistics-unit', passed: null, detail: 'run via statistics-test.mjs' });

  const forecast = runForecastControls();
  for (const o of forecast.outcomes) outcomes.push(o);

  if (!includeBrowser) {
    return { passed: outcomes.filter((o) => o.passed !== null).every((o) => o.passed), outcomes, forecastOnly: true };
  }

  const server = await startServer();
  try {
    // A1-05: instrumentation=false must not wrap Worker.
    const off = await inspectWorkerWrap({ server, instrument: false });
    outcomes.push({
      id: 'instrument-off-no-worker-wrap',
      passed: off.wrapped === false && off.sameRef === true && off.instrumentFlag === false,
      detail: off,
    });
    const on = await inspectWorkerWrap({ server, instrument: true });
    outcomes.push({
      id: 'instrument-on-wraps-worker',
      passed: on.instrumentFlag === true && on.sameRef === false,
      detail: on,
    });

    // Positive New Game + bake oracle.
    const ng = await runNewGameJob({
      server, cpuThrottle: 1, viewport: 'desktop', instrument: false,
      launchId: 'ctrl-ng-positive', observationId: 'ctrl-ng-positive',
    });
    outcomes.push({
      id: 'new-game-positive',
      passed: ng.ok === true && ng.lossSec > 0 && ng.elapsedMs > 1000,
      detail: {
        elapsedMs: ng.elapsedMs, lossSec: ng.lossSec, coverageSec: ng.coverageSec,
        phase: ng.openingPhase, bake: ng.bake, heapMB: ng.heapMB,
        workerWrapped: ng.workerWrapped, oracle: ng.oracle,
      },
    });

    if (ng.ok && ng._session) {
      // Positive scrub.
      const warm = await runScrubJob({
        session: ng._session, launchId: 'ctrl-scrub-positive',
        observationPrefix: 'ctrl-scrub-pos', steps: 8,
      });
      const scrubPass = warm.length === 8 && warm.every((r) => r.ok && !r.timeout);
      outcomes.push({
        id: 'scrub-positive',
        passed: scrubPass,
        detail: {
          n: warm.length,
          p50: warm.length ? [...warm].sort((a, b) => a.elapsedMs - b.elapsedMs)[warm.length >> 1].elapsedMs : null,
          max: Math.max(...warm.map((r) => r.elapsedMs)),
          failed: warm.filter((r) => !r.ok).length,
        },
      });

      // Wrong-target oracle must fail.
      const wrong = await runScrubJob({
        session: ng._session, launchId: 'ctrl-scrub-wrong',
        observationPrefix: 'ctrl-scrub-wrong', steps: 3, wrongTarget: -1,
      });
      outcomes.push({
        id: 'scrub-wrong-result',
        passed: wrong.length === 3 && wrong.every((r) => r.ok === false),
        detail: { oks: wrong.map((r) => r.ok), viewed: wrong.map((r) => r.viewedSec) },
      });

      // Added 200ms in-path delay must appear.
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

      // Deferred completion (200ms stall before browse returns / viewed updates)
      // must not look faster than a normal step.
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
    } else {
      outcomes.push({ id: 'scrub-positive', passed: false, detail: 'skipped: new-game failed' });
    }
    await closeSession(ng._session);

    // Main-thread stall after input arrival must appear in arrival-to-useful
    // and must be visible as queueDelay (handlerNow - timeStamp).
    const stalled = await runNewGameJob({
      server, cpuThrottle: 1, viewport: 'desktop', instrument: false,
      stallMainThreadMs: 200,
      launchId: 'ctrl-ng-stall', observationId: 'ctrl-ng-stall',
    });
    outcomes.push({
      id: 'new-game-queued-input-stall',
      passed: stalled.ok === true && stalled.queueDelayMs >= 150,
      detail: {
        elapsedMs: stalled.elapsedMs, queueDelayMs: stalled.queueDelayMs,
        handlerElapsedMs: stalled.handlerElapsedMs, oracle: stalled.oracle,
      },
    });
    await closeSession(stalled._session);
  } finally {
    await server.close();
  }

  const passed = outcomes.filter((o) => o.passed !== null).every((o) => o.passed);
  if (outDir) {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(path.join(outDir, 'controls.json'), JSON.stringify({ passed, outcomes, at: new Date().toISOString() }, null, 2));
  }
  return { passed, outcomes };
}

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  if (!s.length) return null;
  return s[s.length >> 1];
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('controls.mjs')) {
  const outDir = path.join(REPO_ROOT, 'artifacts/perf-hillclimb-20261112/controls-standalone');
  const includeBrowser = process.argv.includes('--browser');
  const result = await runAllControls({ outDir, includeBrowser });
  console.log(JSON.stringify({ passed: result.passed, n: result.outcomes.length, artifact: path.join(outDir, 'controls.json') }));
  for (const o of result.outcomes) {
    console.log(`${o.passed === true ? 'PASS' : o.passed === false ? 'FAIL' : 'SKIP'} ${o.id}`);
  }
  process.exit(result.passed ? 0 : 1);
}
