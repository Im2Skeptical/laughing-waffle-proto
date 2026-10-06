import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { BROWSER_PROBE_LAUNCH_OPTIONS } from './browser-probe-config.mjs';

const url = 'http://127.0.0.1:8081', artifact = 'artifacts/map-lab-browser-probe.json';
mkdirSync('artifacts', { recursive: true });
const server = spawn(process.execPath, ['./node_modules/serve/bin/serve.js', '-l', '8081', '--no-clipboard', 'dist'], { stdio: 'ignore', windowsHide: true });
let browser;
const checks = [], errors = [];
try {
  for (let attempt = 0; attempt < 150; attempt++) {
    try { if ((await fetch(url)).ok) break; } catch (_) {}
    await delay(100);
  }
  browser = await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  context.on('page', page => page.on('pageerror', error => errors.push(error.message)));
  const page = await context.newPage();
  await page.goto(`${url}/#/dev/gym`);
  await page.getByTestId('lab-run-setup').waitFor();
  assert.equal(await page.getByTestId('debug-profile-select').inputValue(), 'regular-game');
  assert.equal(await page.getByTestId('debug-profile-save').isDisabled(), true);
  assert.equal(await page.getByTestId('map-lab-controller').isDisabled(), true);
  // Read-only protects values, while inspection of other regions stays available.
  await page.getByTestId('map-lab-world-map-region-lake-country').click();
  assert.equal(await page.getByTestId('map-lab-controller').inputValue(), 'player');
  await page.getByTestId('lab-setup-to-gym').click();
  await page.getByTestId('lab-play').waitFor();
  const world = () => page.evaluate(() => {
    const state = __LAB_DEBUG__.getSnapshot().state;
    return { second: state.tSec, players: state.world.regions.filter(region => region.controller === 'player').length,
      neutrals: state.world.sites.filter(site => site.neutral).length, lanes: state.gameConfig.lifeMapGenerator.laneCount,
      populationPerToken: state.gameConfig.settings.values.populationPerToken,
      stockCapacity: state.gameConfig.gamepieces.practices.forage.stockCapacity };
  });
  const baseline = await world();
  assert.equal(baseline.second, 0); assert.equal(baseline.players, 2); assert.equal(baseline.neutrals, 4);
  await page.reload();
  await page.getByTestId('lab-play').waitFor();
  assert.deepEqual(await world(), baseline, 'a profile-derived sandbox survives refresh');
  checks.push('Regular game is read-only, inspectable and creates two player settlements plus four neutrals');
  await page.getByTestId('lab-workspace-setup').click();
  await page.getByTestId('debug-profile-copy').click();
  await page.getByTestId('debug-gameSettings-tab').click();
  await page.getByTestId('setting-populationPerToken').fill('12');
  await page.getByTestId('setting-populationPerToken').press('Tab');
  await page.getByTestId('debug-gamepieces-tab').click();
  await page.getByTestId('gamepiece-practices-forage-stockCapacity').fill('6');
  await page.getByTestId('gamepiece-practices-forage-stockCapacity').press('Tab');
  await page.getByTestId('debug-lifeMapLab-tab').click();
  await page.getByTestId('life-map-lab-laneCount').fill('5');
  await page.getByTestId('life-map-lab-laneCount').press('Tab');
  await page.reload();
  await page.getByTestId('life-map-lab-laneCount').waitFor();
  assert.equal(await page.getByTestId('life-map-lab-laneCount').inputValue(), '5');
  await page.getByTestId('debug-profile-name').fill('Five lanes');
  await page.getByTestId('debug-profile-save').click();
  assert.equal(await page.getByTestId('debug-profile-select').inputValue(), 'profile-1');
  await page.getByTestId('debug-profile-default').click();
  await page.reload();
  await page.getByTestId('life-map-lab-laneCount').waitFor();
  assert.equal(await page.getByTestId('debug-profile-select').inputValue(), 'profile-1');
  await page.getByTestId('debug-profile-json-toggle').click();
  const exported = JSON.parse(await page.getByLabel('New run profile JSON').inputValue());
  assert.equal(exported.profile.gameSettings.values.populationPerToken, 12);
  assert.equal(exported.profile.gamepieces.practices.forage.stockCapacity, 6);
  assert.equal(exported.profile.lifeMapLab.generatorConfig.laneCount, 5);
  assert.equal(exported.profile.launch.neutralSettlements, true);
  await page.getByLabel('Imported profile name').fill('Imported copy');
  await page.getByTestId('debug-profile-json-import').click();
  assert.equal(await page.getByTestId('debug-profile-select').inputValue(), 'profile-2');
  await page.getByTestId('lab-setup-to-gym').click();
  await page.getByTestId('lab-play').waitFor();
  assert.deepEqual(await world(), { ...baseline, populationPerToken: 12, stockCapacity: 6, lanes: 5 });
  await page.getByTestId('lab-workspace-setup').click();
  await page.getByTestId('lab-workspace-settlement').click();
  await page.reload();
  await page.getByTestId('lab-play').waitFor();
  assert.deepEqual(await world(), { ...baseline, populationPerToken: 12, stockCapacity: 6, lanes: 5 }, 'workspace navigation preserves the imported state link');
  checks.push('All editor parts launch together; unsaved refresh, named profiles/default and JSON round trip preserve edits');
  await page.getByTestId('lab-workspace-setup').click();
  await page.getByTestId('debug-mapLab-tab').click();
  await page.getByTestId('map-lab-connection-mode').click();
  await page.getByLabel('New run profile', { exact: true }).selectOption('regular-game');
  assert.equal(await page.getByTestId('map-lab-connection-mode').isDisabled(), true);
  assert.equal(await page.getByTestId('map-lab-connection-mode').innerText(), 'Edit shared-edge connections');
  await page.getByTestId('lab-setup-to-gym').click();
  await page.getByTestId('lab-play').waitFor();
  assert.deepEqual(await world(), baseline, 'editing copies leaves the baseline pristine');
  await page.getByTestId('lab-workspace-setup').click();
  await page.getByLabel('New run profile', { exact: true }).selectOption('profile-2');
  await page.getByTestId('debug-mapLab-tab').click();
  await page.setViewportSize({ width: 844, height: 390 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  await page.getByTestId('debug-lifeMapLab-tab').click();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  await page.screenshot({ path: 'artifacts/map-lab-browser-probe-latest.png' });
  await page.getByTestId('debug-start-new-run').click();
  await page.getByTestId('lab-play-badge').waitFor({ timeout: 60000 });
  await page.waitForFunction(() => globalThis.__SETTLEMENT_DEBUG__);
  assert.equal(await page.evaluate(() => __SETTLEMENT_DEBUG__.getSnapshot().gameConfig.lifeMapGenerator.laneCount), 5);
  await page.keyboard.press('Control+Shift+D');
  await page.getByTestId('debug-vassal-tab').waitFor();
  assert.equal(await page.getByTestId('debug-profile-toolbar').count(), 0);
  assert.equal(await page.getByTestId('map-lab').count(), 0);
  assert.equal(await page.getByTestId('life-map-lab').count(), 0);
  await page.getByTestId('debug-save-diagnostics-tab').click();
  await page.goBack();
  await page.getByTestId('life-map-lab-laneCount').waitFor();
  assert.equal(await page.getByTestId('life-map-lab-laneCount').inputValue(), '5');
  checks.push('Mobile controls fit; Start new run enters unsaved normal play; live tools are focused; Back restores the draft');
  assert.deepEqual(errors, []);
  writeFileSync(artifact, JSON.stringify({ ok: true, checks }, null, 2));
  console.log('[probe:map-lab] OK: Gym profiles/editors, regular-game parity, persistence, launch/Back and mobile');
} catch (error) {
  writeFileSync(artifact, JSON.stringify({ ok: false, checks, errors, failure: error.message, stack: error.stack }, null, 2));
  console.error(`[probe:map-lab] FAIL: ${error.message}. Reproduce: npm run probe:map-lab. Details: ${artifact}`);
  process.exitCode = 1;
} finally { await browser?.close(); server.kill(); }
