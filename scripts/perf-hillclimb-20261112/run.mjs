// Phase A suite runner. Detailed output goes to artifact files, not stdout.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { summarize } from './statistics.mjs';
import { runForecastWindow, runForecastHorizon, runReprojection } from './forecast.mjs';
import { startServer, runNewGameJob, runScrubJob, closeSession } from './browser.mjs';
import { runAllControls } from './controls.mjs';
import {
  REPO_ROOT, CONTRACT_ID, HARNESS_ID, FROZEN_SEED, FORECAST_WINDOW_SEC,
  SCRUB_WARM_STEPS, collectHarnessFiles, collectBuildAssets, machineConfig,
  frozenFixtureId, oracleSdkId,
} from './identities.mjs';

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

function nowIso() { return new Date().toISOString(); }

function writeJson(file, data) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2));
  return file;
}

function runStatisticsTest() {
  const r = spawnSync(process.execPath, ['scripts/perf-hillclimb-20261112/statistics-test.mjs'], {
    cwd: REPO_ROOT, encoding: 'utf8',
  });
  return { passed: r.status === 0, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim() };
}

function dropSession(obs) {
  const { _session, chunk, ...rest } = obs;
  return rest;
}

async function runForecastPopulation({ count, job, runOne, idPrefix }) {
  const rows = [];
  // One unmeasured warmup of the window job to leave JIT in a steady state.
  runForecastWindow({ launchId: `${idPrefix}-warmup`, observationId: `${idPrefix}-warmup`, endSec: 96 });
  for (let i = 0; i < count; i++) {
    const launchId = `${idPrefix}-${i}`;
    const row = runOne({ launchId, observationId: launchId });
    rows.push(dropSession(row));
  }
  return rows;
}

async function runBrowserSuites({ suites, populations, outDir }) {
  const server = await startServer();
  const newGameRows = [];
  const bakeRows = [];
  const scrubRows = [];
  const unveilRows = [];
  const suiteReports = [];
  try {
    for (let s = 0; s < suites; s++) {
      const suiteRep = { index: s, populations: [] };
      for (const pop of populations) {
        const launchId = `suite${s}-${pop.viewport}-x${pop.cpuThrottle}`;
        const ng = await runNewGameJob({
          server,
          cpuThrottle: pop.cpuThrottle,
          viewport: pop.viewport,
          instrument: false,
          launchId,
          observationId: `${launchId}-ng`,
        });
        newGameRows.push(dropSession(ng));
        if (ng.bake && Number.isFinite(ng.bake.bakeMs)) {
          bakeRows.push({
            ...dropSession(ng),
            job: 'bake',
            step: 'terrain-bake',
            observationId: `${launchId}-bake`,
            elapsedMs: ng.bake.bakeMs,
            ok: ng.ok && ng.bake.bakeMs > 0,
          });
        } else {
          bakeRows.push({
            ...dropSession(ng),
            job: 'bake',
            step: 'terrain-bake',
            observationId: `${launchId}-bake`,
            elapsedMs: 0,
            ok: false,
            reason: 'bake-not-reported',
          });
        }
        // Opening-unveil: authored 5s presentation after forecast readiness.
        // Report separately from compute. Not a compute gain if shortened.
        unveilRows.push({
          ...dropSession(ng),
          job: 'opening-unveil-pacing',
          step: 'authored-reveal',
          observationId: `${launchId}-opening-unveil`,
          elapsedMs: (ng.openingElapsedSec ?? 0) * 1000,
          ok: ng.ok && (ng.openingPhase === 'completed' || ng.openingElapsedSec >= 5),
          note: 'intentional opening reveal pacing, not post-death re-projection compute',
        });
        let scrub = [];
        if (ng.ok && ng._session) {
          scrub = await runScrubJob({
            session: ng._session,
            launchId,
            observationPrefix: `${launchId}-scrub`,
            steps: SCRUB_WARM_STEPS,
          });
          scrubRows.push(...scrub);
        }
        suiteRep.populations.push({
          pop, launchId,
          newGameOk: ng.ok, newGameMs: ng.elapsedMs, lossSec: ng.lossSec,
          bakeMs: ng.bake?.bakeMs ?? null,
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
  writeJson(path.join(outDir, 'suites.json'), { suiteReports, at: nowIso() });
  writeJson(path.join(outDir, 'raw-new-game.json'), newGameRows);
  writeJson(path.join(outDir, 'raw-bake.json'), bakeRows);
  writeJson(path.join(outDir, 'raw-scrub.json'), scrubRows);
  writeJson(path.join(outDir, 'raw-opening-unveil.json'), unveilRows);
  return { newGameRows, bakeRows, scrubRows, unveilRows, suiteReports };
}

async function main() {
  const id = arg('id', `proof-${Date.now()}`);
  const phase = arg('phase', 'all'); // controls | forecast | suites | all
  const windowN = Number(arg('forecast-window-n', '120'));
  const horizonN = Number(arg('forecast-horizon-n', '6'));
  const reprojN = Number(arg('reproject-n', '6'));
  const suites = Number(arg('suites', '3'));
  const outDir = path.join(REPO_ROOT, 'artifacts/perf-hillclimb-20261112', id);
  const docsDir = path.join(REPO_ROOT, 'docs/performance/perf-hillclimb-20261112/runs', id);
  mkdirSync(outDir, { recursive: true });
  mkdirSync(docsDir, { recursive: true });

  const identities = {
    contractId: CONTRACT_ID,
    harnessId: HARNESS_ID,
    seed: FROZEN_SEED,
    fixtureManifestId: frozenFixtureId(),
    oracleSdkSha256: oracleSdkId(),
    harness: collectHarnessFiles(),
    build: collectBuildAssets(),
    machine: machineConfig(),
    at: nowIso(),
  };
  writeJson(path.join(outDir, 'identities.json'), identities);

  const report = { id, phase, identities, at: nowIso(), results: {} };

  if (phase === 'controls' || phase === 'all') {
    const stats = runStatisticsTest();
    report.results.statistics = stats;
    const includeBrowser = !process.argv.includes('--node-only');
    const controls = await runAllControls({
      outDir: path.join(outDir, 'controls'),
      includeBrowser,
    });
    report.results.controls = { passed: controls.passed && stats.passed, outcomes: controls.outcomes, statistics: stats };
    writeJson(path.join(outDir, 'controls-summary.json'), report.results.controls);
    if (!report.results.controls.passed) {
      writeJson(path.join(outDir, 'PROOF_SUMMARY.json'), { ...report, proposedVerdict: 'NOT SOUND: controls failed' });
      console.log(JSON.stringify({ id, passed: false, reason: 'controls-failed', artifact: outDir }));
      process.exit(1);
    }
  }

  if (phase === 'forecast' || phase === 'all') {
    const windowRows = await runForecastPopulation({
      count: windowN, job: 'forecast-window', idPrefix: `${id}-fw`,
      runOne: (ids) => runForecastWindow({ ...ids, endSec: FORECAST_WINDOW_SEC }),
    });
    const horizonRows = await runForecastPopulation({
      count: horizonN, job: 'forecast-horizon', idPrefix: `${id}-fh`,
      runOne: (ids) => dropSession(runForecastHorizon(ids)),
    });
    const reprojRows = await runForecastPopulation({
      count: reprojN, job: 'unveil-reproject', idPrefix: `${id}-rp`,
      runOne: (ids) => runReprojection(ids),
    });
    writeJson(path.join(outDir, 'raw-forecast-window.json'), windowRows);
    writeJson(path.join(outDir, 'raw-forecast-horizon.json'), horizonRows);
    writeJson(path.join(outDir, 'raw-reproject.json'), reprojRows);
    const summaries = {
      window: summarize(windowRows),
      horizon: summarize(horizonRows),
      reproject: summarize(reprojRows),
    };
    writeJson(path.join(outDir, 'forecast-summaries.json'), summaries);
    report.results.forecast = {
      windowN, horizonN, reprojN,
      windowPassed: windowRows.every((r) => r.ok),
      horizonPassed: horizonRows.every((r) => r.ok),
      reprojectPassed: reprojRows.every((r) => r.ok),
      summaries,
    };
  }

  if (phase === 'suites' || phase === 'all') {
    const populations = [
      { cpuThrottle: 1, viewport: 'desktop' },
      { cpuThrottle: 4, viewport: 'mobile' },
    ];
    const browser = await runBrowserSuites({ suites, populations, outDir });
    const ngSum = summarize(browser.newGameRows);
    const bakeSum = summarize(browser.bakeRows);
    const scrubSum = summarize(browser.scrubRows);
    writeJson(path.join(outDir, 'browser-summaries.json'), { newGame: ngSum, bake: bakeSum, scrub: scrubSum });
    report.results.browser = {
      suites,
      functional: {
        newGame: browser.newGameRows.every((r) => r.ok),
        bake: browser.bakeRows.every((r) => r.ok),
        scrub: browser.scrubRows.every((r) => r.ok) && browser.scrubRows.length === suites * populations.length * SCRUB_WARM_STEPS,
      },
      suiteReports: browser.suiteReports,
      summaries: { newGame: ngSum, bake: bakeSum, scrub: scrubSum },
    };
  }

  const functionalOk = [
    report.results.controls?.passed,
    report.results.forecast?.windowPassed,
    report.results.forecast?.horizonPassed,
    report.results.forecast?.reprojectPassed,
    report.results.browser?.functional.newGame,
    report.results.browser?.functional.bake,
    report.results.browser?.functional.scrub,
  ].every((v) => v !== false);

  report.functionalOk = functionalOk;
  report.proposedVerdict = functionalOk
    ? 'Builder proposes SOUND, subject to independent audit of raw artifacts and control reproduction. Tail inference remains INCONCLUSIVE where eligibleForTailInference is false.'
    : 'NOT SOUND: a required functional or control gate failed.';
  const summaryPath = writeJson(path.join(outDir, 'PROOF_SUMMARY.json'), report);
  // Also copy a short pointer into the docs run folder.
  writeJson(path.join(docsDir, 'PROOF_SUMMARY.json'), report);
  console.log(JSON.stringify({
    id,
    functionalOk,
    proposed: report.proposedVerdict.slice(0, 120),
    artifact: summaryPath,
  }));
  process.exit(functionalOk ? 0 : 1);
}

await main();
