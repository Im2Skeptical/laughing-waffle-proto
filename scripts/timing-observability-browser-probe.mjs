import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import os from 'node:os';
import { chromium } from 'playwright';
import { BROWSER_PROBE_LAUNCH_OPTIONS } from './browser-probe-config.mjs';

const output = process.env.TIMING_OBSERVABILITY_OUTPUT;
assert.ok(output, 'set TIMING_OBSERVABILITY_OUTPUT to the unique focused-test directory');
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
  population: 'regular URL > Performance New, full-map fixed seed123, progressive art; desktop SwiftShader proxy; no physical Pixel6 evidence',
  policy: 'untimed discovery/purity only; worker lifecycle observer enabled; no overhead/tail acceptance', stages: [], errors: [] };
const port = 18263;
const url = `http://127.0.0.1:${port}/`;
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
    localStorage.setItem('dev.progressiveArtwork', 'on');
    globalThis.__timingProbeWorkers = { starts: 0, stops: 0, posts: 0 };
    const NativeWorker = Worker;
    globalThis.Worker = class extends NativeWorker {
      constructor(...args) { super(...args); __timingProbeWorkers.starts++; }
      postMessage(...args) { __timingProbeWorkers.posts++; return super.postMessage(...args); }
      terminate() { __timingProbeWorkers.stops++; return super.terminate(); }
    };
  });
  // Test-only read exports from the actual bundled module, sharing the app's
  // real private caches/resolver. No product source hook or write API ships.
  const originalBundle = readFileSync(`dist/${manifest.bundle}`, 'utf8');
  assert.ok(originalBundle.includes('function getChronicleTexture('));
  const testExports = `\nexport {getChronicleTexture as timingProbeDrawingTexture};
export function timingProbeArtState(){return JSON.stringify({revision,
 cells:[...cells.keys()],textures:[...packedTextures.keys()],loads:[...packedLoads.keys()].map(g=>g.prefix),
 failed:[...failedGroups].map(g=>g.prefix),hidden:[...hiddenGroups].map(g=>g.prefix)});}`;
  const probeBundle = originalBundle + testExports;
  writeFileSync(`${output}/browser-read-exports.txt`, testExports);
  report.browserReadExports = {originalSha256:hash(originalBundle),servedSha256:hash(probeBundle),
    purpose:'test-only read exports, actual bundled resolver/private caches; no shipped writes/hooks'};
  await page.route(new URL(manifest.bundle,url).href, route=>route.fulfill({contentType:'text/javascript',body:probeBundle}));
  await page.goto(url);
  await page.waitForFunction(() => !!globalThis.__SETTLEMENT_DEBUG__?.getTimingSnapshot);
  report.renderer = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl?.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null;
  });
  await page.evaluate(async moduleUrl => { globalThis.__timingArtModule = await import(moduleUrl); }, new URL(manifest.bundle,url).href);
  async function stage(name) {
    const result = await page.evaluate(name => {
      const api = __SETTLEMENT_DEBUG__, original = { ...api };
      const beforeWorkers = JSON.stringify(__timingProbeWorkers);
      const beforeArt = __timingArtModule.timingProbeArtState();
      const beforeResources = performance.getEntriesByType('resource').length;
      const queries = [{}, {anchorSec:16}, {includeArtwork:true}, {anchorSec:16,includeProjectionSource:true}];
      const expected = queries.map(q=>JSON.stringify(api.getTimingSnapshot(q)));
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
          const q = i % queries.length;
          const value = api.getTimingSnapshot(queries[q]);
          if (JSON.stringify(value) !== expected[q]) throw new Error('primitive state changed within observation turn');
          mutate(value);
        }
        if (JSON.stringify(api.getTimingSnapshot()) !== expected[0]) throw new Error('caller mutation leaked');
        if (JSON.stringify(__timingProbeWorkers) !== beforeWorkers) throw new Error('worker lifecycle changed');
        if (__timingArtModule.timingProbeArtState() !== beforeArt) throw new Error('art cache/load/revision mutation');
        if (performance.getEntriesByType('resource').length !== beforeResources) throw new Error('resource work during passive reads');
        return { name, privateArtworkUnchanged:true, resourceCountUnchanged:true, queries, reads: 1000, forbiddenLegacyCalls: count, workerLifecycleUnchanged: true, snapshot: JSON.parse(expected[0]), anchorQuery:JSON.parse(expected[1]).graph, artwork:JSON.parse(expected[2]).artwork, projectionQuery:JSON.parse(expected[3]).graph.projection };
      } finally { Object.assign(api, original); }
    }, name);
    assert.equal(result.snapshot.version, 2);
    report.stages.push(result);
  }
  await stage('menu');
  await page.getByTestId('game-developer-tools').locator('summary').click();
  await page.getByTestId('game-progressive-artwork').setChecked(true);
  await page.getByTestId('game-new-performance').click();
  await page.waitForFunction(() => __SETTLEMENT_DEBUG__.getTimingSnapshot().opening.phase === 'revealing', null, {timeout:90000});
  await stage('opening-revealing');
  await page.waitForFunction(() => __SETTLEMENT_DEBUG__.getTimingSnapshot().opening.phase === 'completed', null, {timeout:90000});
  await stage('opening-completed');
  report.fullMapIdentity = await page.evaluate(() => {
    const s = __SETTLEMENT_DEBUG__.getSnapshot();
    return {seed:s.runner.baseSeed,loss:s.opening.lossSec,coverage:s.opening.coverageSec,regions:s.worldMap.regionCount};
  });
  assert.equal(report.fullMapIdentity.seed,123); assert.equal(report.fullMapIdentity.regions,20);
  assert.ok(report.fullMapIdentity.loss>0 && report.fullMapIdentity.coverage>=report.fullMapIdentity.loss);
  // Untimed legacy calibration only; never use full snapshots as a purity oracle.
  await page.waitForFunction(() => __SETTLEMENT_DEBUG__.getSnapshot().navigation?.time.mode === 'projection', null, { timeout: 90000 });
  async function click(method, arg) {
    const point = typeof method === 'object' ? method : await page.evaluate(({ method, arg }) => __SETTLEMENT_DEBUG__[method](arg), { method, arg });
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
  const cachedDecision = await page.evaluate(() => __SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision);
  const tagIndex = cachedDecision.shopTagChoices.findIndex(tag=>tag.id==='random');
  assert.ok(tagIndex>=0,'seed123 first node is actual category shop');
  await click(cachedDecision.shopTagConfirmPoints[tagIndex]);
  await page.waitForFunction(() => __SETTLEMENT_DEBUG__.getTimingSnapshot().life.shopTag === 'random');
  await stage('shop-category');
  const shop = await page.evaluate(() => {
    const full=__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision, raw=__SETTLEMENT_DEBUG__.getTimingSnapshot().life;
    return {raw, offers:full.offers.map(o=>o.offerId), purchases:full.purchaseOrder,
      board:full.practices.map(p=>p?.practiceId??null), offerIndex:full.offers.findIndex(o=>o.canStage && o.kind==='practice')};
  });
  assert.deepEqual(shop.raw.offerIds, shop.offers); assert.deepEqual(shop.raw.purchaseOrder,shop.purchases);
  assert.deepEqual(shop.raw.boardPracticeIds,shop.board); assert.equal(shop.board.length,5);
  assert.equal(shop.raw.observedDecisionNodeId,shop.raw.decisionNodeId);
  report.shopParity=shop;
  if(shop.offerIndex>=0) {
    await click('getLifeMapOfferClickPoint',shop.offerIndex);
    await page.waitForFunction(() => __SETTLEMENT_DEBUG__.getTimingSnapshot().life.purchaseOrder.length>0);
    await stage('shop-purchase');
  } else report.purchaseGap='No directly stageable Practice offer; no speculative replacement';
  await page.waitForFunction(() => document.querySelector('[data-testid=debug-open]')?.dataset.artworkReady==='true', null, {timeout:240000});
  await stage('artwork-prepared-hidden');
  async function drawingParity(label) {
    const result = await page.evaluate(() => {
      const publication=__SETTLEMENT_DEBUG__.getTimingSnapshot({includeArtwork:true}).artwork;
      const parity=publication.groups.filter(g=>g.sampleFile).map(g=>({id:g.id,expected:g.sampleDrawingAvailable,
        actual:!!__timingArtModule.timingProbeDrawingTexture(g.sampleFile)}));
      return {publication,parity};
    });
    for(const g of result.parity)assert.equal(g.actual,g.expected,`${label}: ${g.id} actual drawing lookup`);
    report[label]=result;
  }
  await drawingParity('hiddenDrawingParity');
  // Untimed ordinary user gesture publishes prepared artwork.
  await page.getByTestId('debug-open').click();
  await page.waitForFunction(() => __SETTLEMENT_DEBUG__.getTimingSnapshot().map.artReady === true);
  await stage('artwork-revealed');
  await drawingParity('visibleDrawingParity');
  assert.ok(report.visibleDrawingParity.parity.length>=13);
  assert.ok(report.hiddenDrawingParity.parity.every(g=>!g.actual));
  assert.ok(report.visibleDrawingParity.parity.every(g=>g.actual));
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
