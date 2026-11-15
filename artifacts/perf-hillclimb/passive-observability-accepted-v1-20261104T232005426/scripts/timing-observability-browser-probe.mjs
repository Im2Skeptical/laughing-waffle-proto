import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import os from 'node:os';
import { chromium } from 'playwright';
import { BROWSER_PROBE_LAUNCH_OPTIONS } from './browser-probe-config.mjs';

const output = 'artifacts/perf-hillclimb/passive-observability';
mkdirSync(output, { recursive: true });
const hash = value => createHash('sha256').update(value).digest('hex');
const manifest = JSON.parse(readFileSync('dist/build-manifest.json'));
const unit = JSON.parse(readFileSync(`${output}/unit.json`));
for (const [file, digest] of Object.entries(unit.sourceHashes)) assert.equal(hash(readFileSync(file)), digest, `rerun unit checks after changing ${file}`);
const report = { started: new Date().toISOString(), head: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  branch: execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim(),
  build: JSON.parse(readFileSync('dist/build-info.json')), manifest, sourceHashes: unit.sourceHashes,
  probeSha256: hash(readFileSync('scripts/timing-observability-browser-probe.mjs')),
  node: process.version, playwright: JSON.parse(readFileSync('node_modules/playwright/package.json')).version,
  machine: { host: os.hostname(), platform: os.platform(), release: os.release(), cpu: os.cpus()[0].model },
  launch: BROWSER_PROBE_LAUNCH_OPTIONS, viewport: { width: 1280, height: 800 }, cpuRate: 1,
  population: 'authored boot fixture, art=0, desktop SwiftShader proxy; no physical Pixel6 evidence',
  policy: 'untimed discovery/purity only; worker lifecycle observer enabled; no overhead/tail acceptance', stages: [], errors: [] };
const port = 18263;
const url = `http://127.0.0.1:${port}/?art=0`;
const server = spawn(process.execPath, ['node_modules/serve/bin/serve.js', '-l', String(port), '--no-clipboard', 'dist'], { stdio: 'ignore', windowsHide: true });
let browser, page;
try {
  for (let i = 0; i < 100; i++) { try { if ((await fetch(url)).ok) break; } catch {} await delay(100); }
  report.servedAssets = {};
  assert.deepEqual(await (await fetch(new URL('build-manifest.json', url))).json(), manifest);
  for (const key of ['bundle', 'worker', 'saveLoadWorker', 'stylesheet']) {
    const bytes = Buffer.from(await (await fetch(new URL(manifest[key], url))).arrayBuffer());
    assert.equal(hash(bytes), hash(readFileSync(`dist/${manifest[key]}`)));
    report.servedAssets[key] = hash(bytes);
  }
  browser = await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
  report.chromium = browser.version();
  page = await browser.newPage({ viewport: report.viewport });
  page.on('pageerror', error => report.errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.setItem('civsurvivor.debugProfiles.boot.v2', 'probe-authored-setup');
    globalThis.__timingProbeWorkers = { starts: 0, stops: 0, posts: 0 };
    const NativeWorker = Worker;
    globalThis.Worker = class extends NativeWorker {
      constructor(...args) { super(...args); __timingProbeWorkers.starts++; }
      postMessage(...args) { __timingProbeWorkers.posts++; return super.postMessage(...args); }
      terminate() { __timingProbeWorkers.stops++; return super.terminate(); }
    };
  });
  await page.goto(url);
  await page.waitForFunction(() => !!globalThis.__SETTLEMENT_DEBUG__?.getTimingSnapshot);
  report.renderer = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null;
  });
  async function stage(name) {
    const result = await page.evaluate(name => {
      const api = __SETTLEMENT_DEBUG__, original = { ...api };
      const beforeWorkers = JSON.stringify(__timingProbeWorkers);
      const expected = JSON.stringify(api.getTimingSnapshot());
      let count = 0;
      // Poison every legacy facade method. Internal state/presentation/cache
      // callbacks are separately poisoned at their actual Node seams.
      for (const key of Object.keys(api)) if (key !== 'getTimingSnapshot') api[key] = () => { count++; throw new Error(`legacy ${key}`); };
      try {
        function mutate(value) {
          for (const key of Object.keys(value)) {
            if (value[key] && typeof value[key] === 'object') mutate(value[key]); else value[key] = 'mutated';
          }
        }
        for (let i = 0; i < 1000; i++) {
          const value = api.getTimingSnapshot();
          if (JSON.stringify(value) !== expected) throw new Error('primitive state changed within observation turn');
          mutate(value);
        }
        if (JSON.stringify(api.getTimingSnapshot()) !== expected) throw new Error('caller mutation leaked');
        if (JSON.stringify(__timingProbeWorkers) !== beforeWorkers) throw new Error('worker lifecycle changed');
        return { name, reads: 1000, forbiddenLegacyCalls: count, workerLifecycleUnchanged: true, snapshot: JSON.parse(expected) };
      } finally { Object.assign(api, original); }
    }, name);
    assert.equal(result.snapshot.version, 1);
    report.stages.push(result);
  }
  await stage('menu');
  await page.evaluate(() => __SETTLEMENT_DEBUG__.enterBootTestRun());
  await stage('boot-map');
  // Untimed legacy calibration only; never use full snapshots as a purity oracle.
  await page.waitForFunction(() => __SETTLEMENT_DEBUG__.getSnapshot().navigation?.time.mode === 'projection', null, { timeout: 90000 });
  async function click(method, arg) {
    const point = await page.evaluate(({ method, arg }) => __SETTLEMENT_DEBUG__[method](arg), { method, arg });
    assert.ok(point, `untimed calibration ${method}`);
    const rect = await page.locator('canvas').boundingBox();
    await page.mouse.move(rect.x + point.x * rect.width / 2424, rect.y + point.y * rect.height / 1080);
    await page.mouse.down(); await page.mouse.up();
    await delay(180); // untimed input/calibration settling, as in the Life interaction probe
  }
  await click('getNavigationClickPoint', 'present');
  await stage('present-map');
  const parity = await page.evaluate(() => {
    const full = __SETTLEMENT_DEBUG__.getSnapshot(); // explicitly untimed
    const raw = __SETTLEMENT_DEBUG__.getTimingSnapshot();
    return { full: { frontier: full.frontierSec, viewed: full.viewedSec, camera: full.worldMap.camera,
      computed: full.graph.computedCoverageEndSec, revealed: full.graph.revealedCoverageEndSec },
    raw: { frontier: raw.runner.frontierSec, viewed: raw.runner.viewedSec, camera: raw.map.camera,
      computed: raw.graph.computedSec, revealed: raw.graph.revealedSec } };
  });
  assert.deepEqual(parity.raw, parity.full); report.untimedParity = parity;
  await click('getNavigationClickPoint', 'vassal');
  await click('getVassalCandidateClickPoint', 0);
  await click('getNavigationClickPoint', 'vassal');
  await page.waitForFunction(() => {
    const value = __SETTLEMENT_DEBUG__.getTimingSnapshot();
    return value.mode === 'vassalLife' && value.life.displayedVassalId !== null;
  }, null, { timeout: 90000 });
  const nodeId = await page.evaluate(() => __SETTLEMENT_DEBUG__.getSnapshot().lineage.currentVassal.availableNodeIds[0]);
  report.calibratedNodeId = nodeId ?? null;
  await click('getLifeMapNodeClickPoint', nodeId);
  await page.waitForFunction(id => __SETTLEMENT_DEBUG__.getTimingSnapshot().life.selectedCandidateNodeId === id, nodeId);
  await stage('candidate');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => __SETTLEMENT_DEBUG__.getTimingSnapshot().life.entryPhase === 'open');
  await stage('entry-dialog');
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => {
    const life = __SETTLEMENT_DEBUG__.getTimingSnapshot().life;
    return life.decisionOpen && life.decisionPhase === 'open' && !life.processing.jobActive;
  }, null, { timeout: 90000 });
  await stage('decision');
  assert.deepEqual(report.errors, []);
  report.verdict = 'PASS: integrated primitive discovery/purity; Phase A NOT SOUND';
  console.log(`[timing-observability-browser] PASS: ${report.stages.length} stages; ${output}/browser.json`);
} catch (error) {
  report.verdict = 'FAIL'; report.failure = error.stack; process.exitCode = 1;
  report.failureState = await page?.evaluate(() => {
    const api = globalThis.__SETTLEMENT_DEBUG__;
    if (!api) return null;
    const raw = api.getTimingSnapshot();
    const full = api.getSnapshot(); // failure-only untimed diagnostic
    return { raw, lineage: full.lineage?.currentVassal, navigation: full.navigation?.time };
  }).catch(() => null);
  console.error(`[timing-observability-browser] FAIL: ${error.message}; ${output}/browser.json`);
} finally {
  await browser?.close(); server.kill();
  writeFileSync(`${output}/browser.json`, JSON.stringify(report, null, 2));
}
