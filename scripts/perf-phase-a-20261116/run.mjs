// Phase A suite runner. Detailed output goes to artifact files, not stdout.
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, copyFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { summarize } from './statistics.mjs';
import { runForecastWindow, runForecastHorizon, runReprojection } from './forecast.mjs';
import { startServer, runNewGameJob, runScrubJob, closeSession } from './browser.mjs';
import { runAllControls } from './controls.mjs';
import { openPreparedStart, enterPlaying, runDrag, settleGap, ARMS, CARRYOVER_CIRCUIT_4B, bootstrapMedianDelta, wrongTargetControl } from './scrub-drag.mjs';
import { quantile } from './statistics.mjs';
import { loadavg } from 'node:os';
import { PerformanceObserver, performance as perfNow } from 'node:perf_hooks';
import { finalizeRun } from './manifest.mjs';
import {
  REPO_ROOT, CONTRACT_ID, HARNESS_ID, FROZEN_SEED, FORECAST_WINDOW_SEC, EXPECTED_OPENING_LOSS_SEC,
  SCRUB_WARM_STEPS, HARNESS_DIR_REL, ARTIFACT_ROOT_REL, DOCS_RUNS_REL, PINNED_GRAPHICS, ARTWORK_MODE,
  collectHarnessFiles, collectBuildAssets, machineConfig, frozenFixtureId, oracleSdkId, packageVersion,
} from './identities.mjs';
import { execSync } from 'node:child_process';

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
  const r = spawnSync(process.execPath, [`${HARNESS_DIR_REL}/statistics-test.mjs`], {
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
  // F-W1-3 recheck (record only): per-launch wall clock, load, heap and GC
  // pauses overlapping the measured call.
  const gc = [];
  const obs = new PerformanceObserver((list) => { for (const e of list.getEntries()) gc.push({ start: e.startTime, duration: e.duration, kind: e.detail?.kind ?? e.kind ?? null }); });
  obs.observe({ entryTypes: ['gc'] });
  // One unmeasured warmup of the window job to leave JIT in a steady state.
  runForecastWindow({ launchId: `${idPrefix}-warmup`, observationId: `${idPrefix}-warmup`, endSec: 96 });
  for (let i = 0; i < count; i++) {
    const launchId = `${idPrefix}-${i}`;
    const heap0 = process.memoryUsage().heapUsed, la = loadavg()[0], wall = nowIso(), t0 = perfNow.now();
    const row = runOne({ launchId, observationId: launchId });
    const t1 = perfNow.now(), heap1 = process.memoryUsage().heapUsed;
    await new Promise((r) => setImmediate(r));
    const hits = gc.filter((g) => g.start < t1 && g.start + g.duration > t0);
    rows.push({ ...dropSession(row), diag: { index: i, wallStart: wall, loadavg1: la, heapUsedBeforeMB: heap0 / 1048576, heapUsedAfterMB: heap1 / 1048576,
      gcCount: hits.length, gcMs: hits.reduce((a, g) => a + g.duration, 0), gcMaxMs: hits.length ? Math.max(...hits.map((g) => g.duration)) : 0, gcKinds: hits.map((g) => g.kind) } });
  }
  obs.disconnect();
  return rows;
}

const SUITE_DRAGS = 12;
const SUITE_SETTLE_GAP_MS = 5000;

// WP4: scrub-drag evaluation per profile (predeclared in STATE.md).
// Within profile (pooled over 3 sessions): A/A, delay, deferred as in WP3c.
// Between sessions: pairwise bootstrap of per-drag baseline (A1+A2) p50s;
// cross-session envelope = max |bound| over the pairwise intervals.
function evaluateDragSuites(dragRuns) {
  const out = {};
  const profiles = [...new Set(dragRuns.filter((r) => r.profile).map((r) => r.profile))];
  for (const profile of profiles) {
    const runs = dragRuns.filter((r) => r.profile === profile);
    const per = (pred) => runs.filter((r) => r.ok && Number.isFinite(r.p50) && pred(r)).map((r) => r.p50);
    const base = per((r) => r.arm === 'A1' || r.arm === 'A2');
    const aa = bootstrapMedianDelta(per((r) => r.arm === 'A1'), per((r) => r.arm === 'A2'));
    const env = aa ? Math.max(Math.abs(aa.low), Math.abs(aa.high)) : Infinity;
    const dDelay = bootstrapMedianDelta(base, per((r) => r.arm === 'delay'), { seed: 0x44454c31 });
    const dDefer = bootstrapMedianDelta(base, per((r) => r.arm === 'deferred'), { seed: 0x44454631 });
    const sessions = [...new Set(runs.map((r) => r.session))];
    const sessionBase = Object.fromEntries(sessions.map((sId) => { const v = per((r) => r.session === sId && (r.arm === 'A1' || r.arm === 'A2')); return [sId, { n: v.length, median: v.length ? quantile(v, 0.5) : null, values: v }]; }));
    const pairs = [];
    for (let i = 0; i < sessions.length; i++) for (let j = i + 1; j < sessions.length; j++) {
      const b = bootstrapMedianDelta(sessionBase[sessions[i]].values, sessionBase[sessions[j]].values, { seed: 0x53455331 + i * 7 + j });
      if (b) pairs.push({ a: sessions[i], b: sessions[j], ...b, containsZero: b.low <= 0 && b.high >= 0 });
    }
    const crossEnvelope = pairs.length ? Math.max(...pairs.map((p) => Math.max(Math.abs(p.low), Math.abs(p.high)))) : null;
    const wrong = runs.filter((r) => r.arm === 'A1' && r.ok);
    out[profile] = {
      drags: runs.length, okDrags: runs.filter((r) => r.ok).length, sessions: sessions.length,
      controls: {
        correctness: runs.length > 0 && runs.every((r) => r.ok),
        wrongTarget: wrong.length > 0 && wrong.every((r) => r.wrongTargetPassed === true),
        aa: { passed: !!aa && aa.low <= 0 && aa.high >= 0, ...aa },
        delay: { passed: !!dDelay && dDelay.delta >= 150 && dDelay.low > 0 && dDelay.low > env, aaEnvelopeMs: env, ...dDelay },
        deferred: { passed: !!dDefer && dDefer.delta >= 150 && dDefer.low > 0 && dDefer.low > env, aaEnvelopeMs: env, ...dDefer },
      },
      betweenSession: { sessionBaselines: sessionBase, pairs, allContainZero: pairs.length > 0 && pairs.every((p) => p.containsZero), crossSessionEnvelopeMs: crossEnvelope,
        rule: 'cross-session comparisons (e.g. baseline vs candidate in different sessions) must exceed crossSessionEnvelopeMs; reported, not a stop gate' },
    };
  }
  return out;
}

async function runBrowserSuites({ suites, populations, outDir }) {
  const server = await startServer();
  const newGameRows = [];
  const bakeRows = [];
  const scrubRows = [];
  const unveilRows = [];
  const dragRows = [];
  const dragRuns = [];
  const suiteReports = [];
  try {
    // Profile-outer: all suites of one profile complete before the next starts.
    for (const pop of populations) {
      for (let s = 0; s < suites; s++) {
      console.log(`[${new Date().toLocaleTimeString('en-AU', { hour12: false, timeZone: 'Australia/Sydney' })} AEDT] suite ${s} ${pop.viewport}-x${pop.cpuThrottle} start`);
      const suiteRep = { index: s, pop, populations: [] };
      {
        const launchId = `suite${s}-${pop.viewport}-x${pop.cpuThrottle}`;
        const ng = await runNewGameJob({
          server,
          cpuThrottle: pop.cpuThrottle,
          viewport: pop.viewport,
          instrument: false,
          launchId,
          observationId: `${launchId}-ng`,
          screenshotPath: path.join(outDir, `${launchId}-new-game-finished.png`),
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
        // scrub-drag (WP3/WP3b): prepared 424242 start, playing, 5 baseline drags.
        let drags = [];
        let prep = null;
        try {
          prep = await openPreparedStart({ server, cpuThrottle: pop.cpuThrottle, viewport: pop.viewport });
          await enterPlaying(prep.page);
          // WP3c attempt 2 design: one carry-over/position-balanced 12-drag cycle
          // (A1, delay, A2, deferred, ...) with a 5 s held-idle settle gap.
          for (let r = 0; r < SUITE_DRAGS; r++) {
            const arm = ARMS[CARRYOVER_CIRCUIT_4B[r % 12]];
            const prevArm = drags.at(-1)?.arm ?? null;
            const gap = drags.length ? await settleGap(prep.page, SUITE_SETTLE_GAP_MS) : null;
            const d = await runDrag({ session: prep, launchId: `${launchId}-drag${String(r).padStart(2, '0')}-${arm.arm}`, kind: pop.viewport === 'mobile' ? 'touch' : 'mouse',
              addedDelayMs: arm.addedDelayMs, deferredMs: arm.deferredMs, playing: true, arm: arm.arm, rep: r,
              screenshotDir: r === 0 ? outDir : null, tag: `${launchId}-drag` });
            d.prevArm = prevArm; d.settleGap = gap;
            drags.push(d);
            dragRows.push(...d.observations);
            writeJson(path.join(outDir, 'drags', `raw-${d.launchId}.json`), d);
            dragRuns.push({ launchId: d.launchId, session: launchId, profile: `${pop.viewport}-x${pop.cpuThrottle}`, suite: s, arm: arm.arm, prevArm, settleGap: gap, ok: d.ok, p50: d.p50, p95: d.p95, delivered: d.delivered, caughtUp: d.caughtUp, rafP50: d.rafP50, rafMax: d.rafMax,
              wrongTargetPassed: arm.arm === 'A1' && d.ok ? wrongTargetControl(d).passed : null,
              failed: Object.entries(d.oracle ?? {}).filter(([k, v]) => d.required?.includes(k) && v !== true).map(([k]) => k), screenshots: d.screenshots });
            writeJson(path.join(outDir, 'scrub-drag-runs.json'), dragRuns);
          }
        } catch (err) {
          dragRuns.push({ launchId: `${launchId}-drag`, ok: false, reason: `error: ${err.message}` });
        } finally { await closeSession(prep); }
        suiteRep.populations.at(-1).dragPassed = drags.filter((d) => d.ok).length;
        suiteRep.populations.at(-1).dragTotal = SUITE_DRAGS;
      }
      suiteReports.push(suiteRep);
      // Incremental, so a box restart keeps finished suites.
      writeJson(path.join(outDir, 'suites.json'), { suiteReports, at: nowIso(), partial: true });
      writeJson(path.join(outDir, 'raw-new-game.json'), newGameRows);
      writeJson(path.join(outDir, 'raw-bake.json'), bakeRows);
      writeJson(path.join(outDir, 'raw-scrub.json'), scrubRows);
      writeJson(path.join(outDir, 'raw-opening-unveil.json'), unveilRows);
      writeJson(path.join(outDir, 'raw-scrub-drag.json'), dragRows);
      }
    }
  } finally {
    await server.close();
  }
  writeJson(path.join(outDir, 'suites.json'), { suiteReports, at: nowIso() });
  writeJson(path.join(outDir, 'raw-new-game.json'), newGameRows);
  writeJson(path.join(outDir, 'raw-bake.json'), bakeRows);
  writeJson(path.join(outDir, 'raw-scrub.json'), scrubRows);
  writeJson(path.join(outDir, 'raw-opening-unveil.json'), unveilRows);
  writeJson(path.join(outDir, 'raw-scrub-drag.json'), dragRows);
  writeJson(path.join(outDir, 'scrub-drag-runs.json'), dragRuns);
  return { newGameRows, bakeRows, scrubRows, unveilRows, dragRows, dragRuns, suiteReports };
}

async function main() {
  const id = arg('id', `proof-${Date.now()}`);
  const phase = arg('phase', 'controls'); // controls | forecast | suites | all
  const windowN = Number(arg('forecast-window-n', '120'));
  const horizonN = Number(arg('forecast-horizon-n', '6'));
  const reprojN = Number(arg('reproject-n', '6'));
  const suites = Number(arg('suites', '3'));
  const outDir = path.join(REPO_ROOT, ARTIFACT_ROOT_REL, id);
  const docsDir = path.join(REPO_ROOT, DOCS_RUNS_REL, id);
  mkdirSync(outDir, { recursive: true });
  mkdirSync(docsDir, { recursive: true });

  const identities = {
    contractId: CONTRACT_ID,
    harnessId: HARNESS_ID,
    seed: FROZEN_SEED,
    expectedOpeningLossSec: EXPECTED_OPENING_LOSS_SEC,
    productVersion: packageVersion(),
    gitDirtyHarness: (() => { try { return execSync(`git status --porcelain -- ${HARNESS_DIR_REL}`, { cwd: REPO_ROOT, encoding: 'utf8' }).trim().length > 0; } catch { return null; } })(),
    gitHead: (() => { try { return execSync('git rev-parse HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim(); } catch { return null; } })(),
    pinnedGraphics: PINNED_GRAPHICS,
    artworkMode: ARTWORK_MODE,
    loadavg1AtStart: machineConfig().loadavg1,
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
      finalizeRun(outDir, docsDir);
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

  if ((phase === 'suites' || phase === 'all') && !process.argv.includes('--allow-suites')) {
    console.log('suites are WP4-5 (frozen harness, fresh session); pass --allow-suites to run them');
    writeJson(path.join(outDir, 'PROOF_SUMMARY.json'), { ...report, suitesSkipped: true });
    finalizeRun(outDir, docsDir);
    process.exit(2);
  }
  if (phase === 'suites' || phase === 'all') {
    const profiles = arg('profiles', 'desktop-x1,mobile-x4').split(',');
    const populations = [
      { cpuThrottle: 1, viewport: 'desktop' },
      { cpuThrottle: 4, viewport: 'mobile' },
    ].filter((p) => profiles.includes(`${p.viewport}-x${p.cpuThrottle}`));
    const browser = await runBrowserSuites({ suites, populations, outDir });
    const ngSum = summarize(browser.newGameRows);
    const bakeSum = summarize(browser.bakeRows);
    const scrubSum = summarize(browser.scrubRows);
    const dragSum = browser.dragRows.length ? summarize(browser.dragRows) : [];
    const unveilSum = summarize(browser.unveilRows);
    const dragEval = evaluateDragSuites(browser.dragRuns);
    writeJson(path.join(outDir, 'scrub-drag-evaluation.json'), dragEval);
    writeJson(path.join(outDir, 'browser-summaries.json'), { newGame: ngSum, bake: bakeSum, scrub: scrubSum, scrubDrag: dragSum, openingUnveil: unveilSum });
    report.results.browser = {
      suites,
      functional: {
        newGame: browser.newGameRows.every((r) => r.ok),
        bake: browser.bakeRows.every((r) => r.ok),
        scrub: browser.scrubRows.every((r) => r.ok) && browser.scrubRows.length === suites * populations.length * SCRUB_WARM_STEPS,
        scrubDrag: browser.dragRuns.length === suites * populations.length * SUITE_DRAGS && browser.dragRuns.every((r) => r.ok),
        scrubDragControls: Object.values(dragEval).every((e) => e.controls.correctness && e.controls.wrongTarget && e.controls.aa.passed && e.controls.delay.passed && e.controls.deferred.passed),
      },
      dragEval,
      suiteReports: browser.suiteReports,
      summaries: { newGame: ngSum, bake: bakeSum, scrub: scrubSum, scrubDrag: dragSum, openingUnveil: unveilSum },
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
    report.results.browser?.functional.scrubDrag,
    report.results.browser?.functional.scrubDragControls,
  ].every((v) => v !== false);

  report.functionalOk = functionalOk;
  const fullProof = report.results.browser && report.results.forecast && report.results.controls;
  report.proposedVerdict = !functionalOk ? 'NOT SOUND: a required functional or control gate failed.'
    : fullProof ? 'Builder proposes SOUND, subject to independent audit of raw artifacts and control reproduction. Tail inference remains INCONCLUSIVE where eligibleForTailInference is false.'
      : `CONSTRUCTION ONLY (phase=${phase}): gates in this run passed; no Phase A verdict without the 3-rep suites and an independent audit.`;
  const summaryPath = writeJson(path.join(outDir, 'PROOF_SUMMARY.json'), report);
  finalizeRun(outDir, docsDir);
  console.log(JSON.stringify({
    id,
    functionalOk,
    proposed: report.proposedVerdict.slice(0, 120),
    artifact: summaryPath,
  }));
  process.exit(functionalOk ? 0 : 1);
}

await main();
