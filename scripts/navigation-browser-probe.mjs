import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { BROWSER_PROBE_LAUNCH_OPTIONS } from './browser-probe-config.mjs';

const PORT = 8093;
const URL = `http://127.0.0.1:${PORT}`;
const OUTPUT = 'artifacts/navigation';
mkdirSync(OUTPUT, { recursive: true });
const errors = [];
const checkpoints = [];
let browser, page;
const server = spawn(process.execPath,
  ['./node_modules/serve/bin/serve.js', '-l', String(PORT), '--no-clipboard', 'dist'],
  { stdio: 'ignore', windowsHide: true });

async function snapshot() {
  return page.evaluate(() => {
    const s = globalThis.__SETTLEMENT_DEBUG__.getSnapshot();
    return {
      navigation: s.navigation, mode: s.worldMap.mode,
      selectedRegionId: s.worldMap.selectedRegionId,
      regionSelectionActive: s.worldMap.regionSelectionActive,
      settlementRegionId: s.view?.regionId, headerControls: s.view?.headerControls,
      life: s.lifeMap, decision: {
        open: s.lifeMapDecision.open, selectedOptionId: s.lifeMapDecision.selectedOptionId,
        nodeId: s.lifeMapDecision.nodeId,
      },
      current: s.lineage?.currentVassal, lineage: s.lineage,
      timeline: s.runner.timeline, frontierSec: s.frontierSec, viewedSec: s.viewedSec,
    };
  });
}

async function clickPoint(point, { touch = false, double = false } = {}) {
  assert.ok(point, 'the visible control has a click target');
  const box = await page.locator('canvas').boundingBox();
  const x = box.x + point.x / 2424 * box.width;
  const y = box.y + point.y / 1080 * box.height;
  if (touch) {
    await page.touchscreen.tap(x, y);
    if (double) { await delay(80); await page.touchscreen.tap(x, y); }
  } else if (double) await page.mouse.dblclick(x, y, { delay: 80 });
  else await page.mouse.click(x, y);
  await delay(180);
}

async function navigate(id, options) {
  const point = await page.evaluate((id) => globalThis.__SETTLEMENT_DEBUG__.getNavigationClickPoint(id), id);
  await clickPoint(point, options);
}

async function controlPoint(method, arg) {
  return page.evaluate(({ method, arg }) => globalThis.__SETTLEMENT_DEBUG__[method](arg), { method, arg });
}

async function waitMode(mode) {
  await page.waitForFunction((mode) => globalThis.__SETTLEMENT_DEBUG__.getSnapshot().navigation?.mode === mode, mode);
}

function destinations(s) { return s.navigation.destinations.map((entry) => entry.id); }

async function capture(name) {
  await page.mouse.move(1200, 100);
  await page.screenshot({ path: `${OUTPUT}/${name}.png` });
  const s = await snapshot();
  checkpoints.push({ name, navigation: s.navigation });
}

try {
  for (let attempt = 0; attempt < 100; attempt++) {
    try { if ((await fetch(URL)).ok) break; } catch {}
    if (attempt === 99) throw new Error(`Server unavailable at ${URL}`);
    await delay(100);
  }
  browser = await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
  page = await browser.newPage({ viewport: { width: 1280, height: 800 }, hasTouch: true });
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('civsurvivor.debugProfiles.boot.v2', 'probe-authored-setup'));
  await page.goto(URL);
  await page.waitForFunction(() => !!globalThis.__SETTLEMENT_DEBUG__?.enterBootTestRun);
  await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.enterBootTestRun());
  await page.waitForFunction(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot().navigation?.time.mode === 'projection');
  const projected = await snapshot();
  assert.equal(projected.navigation.portrait, null, 'there is no invented vassal before selection');
  assert.deepEqual(destinations(projected), ['vassal', 'settlement']);
  await capture('projection-1280x800');
  await navigate('present');
  let s = await snapshot();
  assert.equal(s.navigation.time.mode, 'present');
  assert.equal(s.viewedSec, s.frontierSec);
  assert.ok(await controlPoint('getNavigationClickPoint', 'present'), 'Present remains on screen at the frontier');
  assert.deepEqual(s.timeline, projected.timeline, 'returning from a projection does not commit it');

  await navigate('vassal');
  s = await snapshot();
  assert.deepEqual(destinations(s), ['vassal'], 'candidate confirmation replaces irrelevant destinations');
  assert.equal(s.navigation.destinations[0].enabled, false);
  await navigate('vassal');
  assert.equal((await snapshot()).current, null, 'an unselected candidate cannot be confirmed');
  await clickPoint(await controlPoint('getVassalCandidateClickPoint', 0));
  await page.waitForFunction(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot().navigation.destinations[0].enabled === true);
  await capture('chooser-1280x800');
  await navigate('vassal');
  await waitMode('vassalLife');
  s = await snapshot();
  const vassalId = s.current.vassalId;
  const regionId = s.current.locationRegionId;
  assert.deepEqual(destinations(s), ['map', 'settlement']);
  assert.equal(s.navigation.portrait, null, 'the Life Map already has a portrait in its HUD');
  assert.equal(s.navigation.destinations[1].regionId, regionId);
  await capture('lifemap-1280x800');
  const beforeNavigation = await snapshot();

  await navigate('settlement');
  await waitMode('settlement');
  s = await snapshot();
  assert.equal(s.settlementRegionId, regionId, 'Life Map opens the vassal settlement in one click');
  assert.deepEqual(destinations(s), ['map', 'life']);
  assert.equal(s.headerControls.map, undefined, 'settlement no longer has the old header Map button');
  assert.equal(s.navigation.portrait.vassalId, vassalId);
  await capture('settlement-1280x800');

  await navigate('map');
  await waitMode('map');
  const otherRegion = regionId === 'river-crown' ? 'lake-country' : 'river-crown';
  await clickPoint(await controlPoint('getWorldMapClickPoint', otherRegion));
  s = await snapshot();
  assert.equal(s.navigation.destinations.find((entry) => entry.id === 'settlement').regionId, otherRegion,
    'an explicitly selected settlement takes priority on the Regional Map');
  await navigate('settlement');
  assert.equal((await snapshot()).settlementRegionId, otherRegion);
  await navigate('portrait');
  s = await snapshot();
  assert.equal(s.mode, 'map', 'one portrait click focuses the Regional Map');
  assert.equal(s.selectedRegionId, regionId);
  assert.equal(s.regionSelectionActive, true);
  await capture('regional-map-1280x800');
  await delay(450);
  await navigate('portrait', { double: true });
  s = await snapshot();
  assert.equal(s.mode, 'settlement', 'double-clicking the portrait opens its detailed settlement');
  assert.equal(s.settlementRegionId, regionId);
  assert.deepEqual(s.timeline, beforeNavigation.timeline, 'screen navigation never changes committed history');
  assert.deepEqual(s.lineage, beforeNavigation.lineage, 'screen navigation never changes vassal state');

  await navigate('life');
  const nodeId = (await snapshot()).current.availableNodeIds[0];
  await clickPoint(await controlPoint('getLifeMapNodeClickPoint', nodeId));
  await clickPoint(await controlPoint('getLifeMapEnterNodeClickPoint'));
  await clickPoint(await controlPoint('getLifeMapOptionClickPoint', 0));
  const draft = await snapshot();
  assert.ok(draft.decision.selectedOptionId, 'the fixture stages a node decision');
  await navigate('settlement');
  s = await snapshot();
  assert.equal(s.mode, 'settlement', 'the dock is reachable through the decision backdrop');
  assert.equal(s.decision.open, false);
  await navigate('life');
  await clickPoint(await controlPoint('getLifeMapNodeClickPoint', nodeId));
  s = await snapshot();
  assert.equal(s.decision.selectedOptionId, draft.decision.selectedOptionId, 'navigation preserves the staged decision');
  assert.deepEqual(s.timeline, draft.timeline);
  await clickPoint(await controlPoint('getLifeMapConfirmClickPoint'));
  await page.waitForFunction((start) => {
    const s = globalThis.__SETTLEMENT_DEBUG__.getSnapshot();
    return s.frontierSec > start && !s.pendingCommitJob;
  }, draft.frontierSec, { timeout: 12000 });
  await navigate('present');
  const resolved = await snapshot();
  assert.ok(resolved.current, 'the young fixture vassal survives the first node');
  await page.evaluate((sec) => globalThis.__SETTLEMENT_DEBUG__.browseSecond(sec), draft.frontierSec);
  await page.waitForFunction(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot().navigation.time.mode === 'history');
  const history = await snapshot();
  assert.equal(history.life.readOnly, true);
  await clickPoint(await controlPoint('getLifeMapNodeClickPoint', resolved.current.availableNodeIds[0]));
  s = await snapshot();
  assert.equal(s.navigation.feedbackVisible, true, 'a locked node points back to Present');
  const feedbackCount = s.navigation.feedbackCount;
  await clickPoint(await controlPoint('getLifeMapEnterNodeClickPoint'));
  s = await snapshot();
  assert.ok(s.navigation.feedbackCount > feedbackCount, 'the disabled entry explains the time lock');
  assert.deepEqual(s.timeline, history.timeline, 'a historical entry attempt cannot edit history');
  assert.deepEqual(s.lineage, history.lineage);
  await capture('history-feedback-1280x800');
  await navigate('settlement');
  s = await snapshot();
  assert.equal(s.viewedSec, history.viewedSec, 'navigation preserves historical viewing time');
  assert.equal(s.navigation.portrait.regionId, s.life.profile.locationRegionId,
    'portrait and settlement navigation use the viewed life location');
  await navigate('present');
  s = await snapshot();
  assert.equal(s.mode, 'settlement', 'Present keeps the current screen');
  assert.equal(s.navigation.time.mode, 'present');
  assert.equal(s.navigation.feedbackVisible, false);

  await page.setViewportSize({ width: 844, height: 390 });
  await delay(250);
  await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.enterBootTestRun());
  await navigate('map', { touch: true });
  await navigate('portrait', { touch: true });
  s = await snapshot();
  assert.equal(s.mode, 'map');
  assert.equal(s.selectedRegionId, resolved.current.locationRegionId,
    'the portrait follows the vassal after a node relocates them');
  await capture('regional-map-844x390');
  for (const target of s.navigation.targets) {
    assert.ok(target.x >= 28 && target.x + target.width <= 336, `${target.id} stays out of the graph`);
    assert.ok(target.y >= 840 && target.y + target.height <= 1064, `${target.id} stays inside the lower band`);
    assert.ok(target.height * 844 / 2424 >= 23.5, `${target.id} keeps its mobile hit height`);
  }
  await delay(450);
  await navigate('portrait', { touch: true, double: true });
  assert.equal((await snapshot()).mode, 'settlement', 'portrait double-tap works on touch input');
  await capture('settlement-844x390');
  await navigate('life', { touch: true });
  assert.deepEqual(destinations(await snapshot()), ['map', 'settlement']);
  await capture('lifemap-844x390');
  await page.evaluate((sec) => globalThis.__SETTLEMENT_DEBUG__.browseSecond(sec), draft.frontierSec);
  await page.waitForFunction(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot().navigation.time.mode === 'history');
  await clickPoint(await controlPoint('getLifeMapNodeClickPoint', resolved.current.availableNodeIds[0]), { touch: true });
  await capture('history-feedback-844x390');
  await navigate('present', { touch: true });
  s = await snapshot();
  assert.equal(s.navigation.time.mode, 'present', 'touch can return to Present through a modal');
  assert.equal(s.mode, 'vassalLife');
  assert.deepEqual(errors, [], 'no browser runtime errors');
  writeFileSync(`${OUTPUT}/probe.json`, JSON.stringify({ ok: true, checkpoints }, null, 2));
  console.log(`[probe:navigation] OK: direct routes, portrait mouse/touch, drafts, time locks, mobile layout\n[probe:navigation] details=${OUTPUT}/probe.json`);
} catch (error) {
  let last = null;
  try { last = await snapshot(); await page.screenshot({ path: `${OUTPUT}/failure.png` }); } catch {}
  writeFileSync(`${OUTPUT}/probe.json`, JSON.stringify({ error: error.stack, last, errors, checkpoints }, null, 2));
  console.error(`[probe:navigation] FAILED: ${error.message}\n[probe:navigation] reproduce=npm run probe:navigation\n[probe:navigation] details=${OUTPUT}/probe.json`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
}
