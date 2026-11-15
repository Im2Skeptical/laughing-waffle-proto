// Validity controls for every distinct oracle and timing mechanism.
// Comparison-ineligible. Controls use isolated sessions/wrappers and never
// mutate product code, so the real path is restored by construction.
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { runForecastControls } from './forecast.mjs';
import { startServer, runNewGameJob, runScrubJob, closeSession, inspectWorkerWrap } from './browser.mjs';
import { quantile } from './statistics.mjs';
import { REPO_ROOT, ARTIFACT_ROOT_REL } from './identities.mjs';

// F-6: every summary statistic comes from statistics.mjs (nearest-rank).
const median = (values) => (values.length ? quantile(values, 0.5) : null);

function writeJson(dir, name, data) {
  if (!dir) return null;
  mkdirSync(dir, { recursive: true });
  const p = path.join(dir, name);
  writeFileSync(p, JSON.stringify(data, null, 2));
  return p;
}

function strip(r) {
  if (!r) return r;
  const { _session, ...rest } = r;
  return rest;
}

export function runNodeControls({ outDir } = {}) {
  const raw = [];
  const forecast = runForecastControls({ rawSink: raw });
  writeJson(outDir, 'raw-forecast-controls.json', raw);
  return forecast;
}

export async function runBrowserControls({ outDir, screenshotDir = outDir } = {}) {
  const outcomes = [];
  const server = await startServer();
  let ng = null;
  try {
    // A1-05: instrumentation=false must not wrap Worker.
    const off = await inspectWorkerWrap({ server, instrument: false });
    outcomes.push({ id: 'instrument-off-no-worker-wrap', passed: off.wrapped === false && off.sameRef === true && off.instrumentFlag === false, detail: off });
    const on = await inspectWorkerWrap({ server, instrument: true });
    outcomes.push({ id: 'instrument-on-wraps-worker', passed: on.instrumentFlag === true && on.sameRef === false, detail: on });

    ng = await runNewGameJob({
      server, cpuThrottle: 1, viewport: 'desktop', instrument: false,
      launchId: 'ctrl-ng-positive', observationId: 'ctrl-ng-positive', timeoutMs: 240000,
      screenshotPath: screenshotDir ? path.join(screenshotDir, 'ctrl-ng-positive-new-game-finished.png') : null,
    });
    writeJson(outDir, 'raw-ctrl-ng-positive.json', strip(ng));
    outcomes.push({
      id: 'new-game-positive',
      passed: ng.ok === true && ng.lossSec > 0 && ng.elapsedMs > 1000 && ng.oracle?.ok === true && ng.graphicsPinned === true,
      detail: {
        elapsedMs: ng.elapsedMs, lossSec: ng.lossSec, coverageSec: ng.coverageSec, phase: ng.openingPhase,
        milestones: ng.milestones, bake: ng.bake, graphicsPinned: ng.graphicsPinned, oracle: ng.oracle,
      },
    });

    if (ng.ok && ng._session) {
      const scrubRows = {};
      const run = async (key, opts) => {
        const rows = await runScrubJob({ session: ng._session, launchId: `ctrl-scrub-${key}`, observationPrefix: `ctrl-scrub-${key}`, ...opts });
        scrubRows[key] = rows;
        return rows;
      };
      const warm = await run('positive', { steps: 8 });
      outcomes.push({
        id: 'scrub-positive',
        passed: warm.length === 8 && warm.every((r) => r.ok && !r.timeout),
        detail: { n: warm.length, p50: median(warm.map((r) => r.elapsedMs)), max: Math.max(0, ...warm.map((r) => r.elapsedMs)), failed: warm.filter((r) => !r.ok).length },
      });
      const wrong = await run('wrong', { steps: 3, wrongTarget: -1 });
      outcomes.push({ id: 'scrub-wrong-result', passed: wrong.length === 3 && wrong.every((r) => r.ok === false), detail: { oks: wrong.map((r) => r.ok), viewed: wrong.map((r) => r.viewedSec) } });
      const base2 = await run('delay-base', { steps: 6 });
      const delayed = await run('delay', { steps: 6, addedDelayMs: 200 });
      const baseMed = median(base2.map((r) => r.elapsedMs));
      const delMed = median(delayed.map((r) => r.elapsedMs));
      outcomes.push({ id: 'scrub-added-delay', passed: base2.every((r) => r.ok) && delayed.every((r) => r.ok) && (delMed - baseMed) >= 150, detail: { baseMed, delMed, delta: delMed - baseMed, method: 'statistics.quantile p50' } });
      const deferred = await run('deferred', { steps: 4, deferredMs: 200 });
      const defMed = median(deferred.map((r) => r.elapsedMs));
      outcomes.push({ id: 'scrub-deferred-completion', passed: deferred.every((r) => r.ok) && (defMed - baseMed) >= 150, detail: { baseMed, defMed, delta: defMed - baseMed, method: 'statistics.quantile p50' } });
      // B02: deferred completion is genuinely async (setTimeout after return).
      // With a deadline shorter than the deferral, the completion oracle must
      // time out and fail closed (B03) instead of crediting the early return.
      const early = await run('deferred-deadline', { steps: 3, deferredMs: 400, deadlineMs: 100 });
      outcomes.push({ id: 'scrub-deferred-async-fail-closed', passed: early.length === 3 && early.every((r) => r.ok === false && r.timeout === true && r.deferredMode === 'setTimeout-async'), detail: { oks: early.map((r) => r.ok), timeouts: early.map((r) => r.timeout), elapsed: early.map((r) => r.elapsedMs) } });
      outcomes.push({ id: 'scrub-deferred-async-mode', passed: deferred.every((r) => r.deferredMode === 'setTimeout-async') && deferred.every((r) => r.elapsedMs >= 200), detail: { elapsed: deferred.map((r) => r.elapsedMs) } });
      writeJson(outDir, 'raw-ctrl-scrub.json', scrubRows);
    } else {
      for (const id of ['scrub-positive', 'scrub-wrong-result', 'scrub-added-delay', 'scrub-deferred-completion', 'scrub-deferred-async-fail-closed', 'scrub-deferred-async-mode']) {
        outcomes.push({ id, passed: false, detail: 'skipped: new-game failed' });
      }
    }
  } finally {
    await closeSession(ng?._session);
    await server.close();
  }
  return { passed: outcomes.every((o) => o.passed), outcomes };
}

export async function runAllControls({ outDir, includeBrowser = true } = {}) {
  const outcomes = [{ id: 'statistics-unit', passed: null, detail: 'run via statistics-test.mjs in run.mjs' }];
  const node = runNodeControls({ outDir });
  outcomes.push(...node.outcomes);
  if (includeBrowser) {
    const browser = await runBrowserControls({ outDir });
    outcomes.push(...browser.outcomes);
  }
  const passed = outcomes.filter((o) => o.passed !== null).every((o) => o.passed);
  writeJson(outDir, 'controls.json', { passed, outcomes, at: new Date().toISOString(), includeBrowser });
  return { passed, outcomes };
}

if (process.argv[1]?.endsWith('controls.mjs')) {
  const outDir = path.join(REPO_ROOT, ARTIFACT_ROOT_REL, `controls-standalone-${Date.now()}`);
  const includeBrowser = process.argv.includes('--browser');
  const result = await runAllControls({ outDir, includeBrowser });
  console.log(JSON.stringify({ passed: result.passed, n: result.outcomes.length, artifact: path.join(outDir, 'controls.json') }));
  for (const o of result.outcomes) console.log(`${o.passed === true ? 'PASS' : o.passed === false ? 'FAIL' : 'SKIP'} ${o.id}`);
  process.exit(result.passed ? 0 : 1);
}
