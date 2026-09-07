import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const url = 'http://127.0.0.1:8082';
const artifact = 'artifacts/game-menu-browser-probe.json';
mkdirSync('artifacts', { recursive: true });
const server = spawn(process.execPath, ['node_modules/serve/bin/serve.js', '-l', '8082', '--no-clipboard', 'dist'],
  { stdio: 'ignore', windowsHide: true });
let browser;
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).ok) break; } catch {}
    await delay(100);
  }
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(url);
  await page.getByTestId('game-new').waitFor();
  assert.equal(await page.getByTestId('game-continue').count(), 0);
  await page.screenshot({ path: 'artifacts/game-menu-desktop.png' });
  const initialSecond = await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot().runner.cursorStateSec);
  await page.evaluate(() => document.activeElement.blur());
  await page.keyboard.press('Space');
  await delay(300);
  assert.equal(await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot().runner.cursorStateSec), initialSecond);
  await page.getByTestId('game-new').click();
  assert.equal(await page.locator('.game-save-slot').count(), 3);
  await page.getByTestId('game-slot-1').click();
  await page.getByTestId('game-menu').waitFor({ state: 'hidden' });
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('civsurvivor.save.slot1')));
  assert.equal(saved.state.world.sites.length, 2);
  await page.getByTestId('game-menu-open').click();
  await page.getByTestId('game-new').click();
  await page.getByTestId('game-slot-1').click();
  await page.getByTestId('game-replace-confirm').waitFor();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('civsurvivor.save.slot1')).state.rng.baseSeed), saved.state.rng.baseSeed);
  await page.getByTestId('game-slot-2').click();
  await page.getByTestId('game-menu-open').click();
  await page.getByTestId('game-new').click();
  await page.getByTestId('game-slot-3').click();
  await page.getByTestId('game-menu-open').click();
  await page.getByTestId('game-load').click();
  await page.screenshot({ path: 'artifacts/game-menu-slots.png' });
  await page.getByTestId('game-slot-1').click();
  assert.equal(await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot().runner.baseSeed), saved.state.rng.baseSeed);
  await page.reload();
  await page.getByTestId('game-continue').click();
  assert.equal(await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot().runner.baseSeed), saved.state.rng.baseSeed);
  await page.getByTestId('game-menu-open').click();
  await page.getByTestId('game-new').click();
  await page.getByTestId('game-slot-1').click();
  await page.getByTestId('game-replace-confirm').click();
  const replacementSeed = await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot().runner.baseSeed);
  assert.notEqual(replacementSeed, saved.state.rng.baseSeed);
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('quota'); }; });
  await page.getByTestId('game-menu-open').click();
  assert.equal(await page.getByTestId('game-menu').isVisible(), false);
  assert.equal(await page.locator('.game-save-error').isVisible(), true);

  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await phone.goto(url);
  await phone.getByTestId('game-new').waitFor();
  assert.equal(await phone.locator('#mobile-landscape-gate').isVisible(), false);
  await phone.screenshot({ path: 'artifacts/game-menu-portrait.png' });
  await phone.getByTestId('game-new').click();
  await phone.getByTestId('game-slot-1').click();
  assert.equal(await phone.locator('#mobile-landscape-gate').isVisible(), true);
  await phone.getByTestId('mobile-menu-return').click();
  assert.equal(await phone.getByTestId('game-menu').isVisible(), true);
  await phone.getByTestId('game-continue').click();
  assert.equal(await phone.locator('#mobile-landscape-gate').isVisible(), true);
  await phone.setViewportSize({ width: 844, height: 390 });
  assert.equal(await phone.locator('#mobile-landscape-gate').isVisible(), false);
  await phone.getByTestId('game-menu-open').click();
  await phone.setViewportSize({ width: 390, height: 844 });
  assert.equal(await phone.getByTestId('game-menu').isVisible(), true);
  assert.equal(await phone.locator('#mobile-landscape-gate').isVisible(), false);
  assert.deepEqual(errors, []);
  writeFileSync(artifact, JSON.stringify({ ok: true, checks: ['three slots', 'seed preservation', 'reload continue', 'overwrite/cancel', 'storage failure', 'menu pause', 'portrait gate'], screenshots: ['game-menu-desktop.png', 'game-menu-slots.png', 'game-menu-portrait.png'] }));
  console.log('[probe:game-menu] OK');
} catch (error) {
  writeFileSync(artifact, JSON.stringify({ error: error.stack }));
  console.error(`[probe:game-menu] FAILED: ${error.message}\nDetails: ${artifact}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
}
