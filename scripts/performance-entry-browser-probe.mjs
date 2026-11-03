import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { BROWSER_PROBE_LAUNCH_OPTIONS } from './browser-probe-config.mjs';

// Run against npm start's regular address, never a preconfigured performance URL.
const url = new URL(process.argv[2] ?? 'http://localhost:5184/');
url.search = ''; url.hash = '';
const output = 'artifacts/performance-entry';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
let page;
const errors = [];
try {
  for (const artwork of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    page = await context.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url.href);
    await page.getByTestId('game-developer-tools').locator('summary').click();
    await page.getByTestId('game-progressive-artwork').setChecked(artwork);
    await page.waitForFunction(() => !document.querySelector('[data-testid="game-new-performance"]').disabled);
    // Emulate successful platform calls; actual device permission/rotation needs a phone.
    await page.evaluate(() => {
      globalThis.displayCalls = [];
      globalThis.entryDocumentMarker = true;
      document.documentElement.requestFullscreen = async () => { displayCalls.push('fullscreen'); };
      screen.orientation.lock = async value => { displayCalls.push(value); };
    });
    await page.getByTestId('game-new-performance').click();
    await page.waitForFunction(() => globalThis.displayCalls.includes('landscape'));
    assert.deepEqual(await page.evaluate(() => displayCalls), ['fullscreen', 'landscape']);
    await page.setViewportSize({ width: 844, height: 390 });
    await page.waitForFunction(() => document.querySelector('[data-testid="game-menu"]').hidden, {}, { timeout: 90000 });
    assert.equal(await page.evaluate(() => globalThis.entryDocumentMarker), true, 'one tap enters without reloading');
    assert.equal(new URL(page.url()).searchParams.get('art'), artwork ? '1' : '0');
    const terrain = await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot().worldMap.illustratedTerrain);
    assert.equal(terrain.bakes, 0, 'terrain cannot block performance entry');
    const decisionTerrain=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.decisionMapTerrain);
    assert.equal(decisionTerrain.bakes,0,'the embedded decision map cannot bake terrain during performance entry');
    assert.equal(await page.getByTestId('performance-display').count(), 0, 'no extra display-entry button');
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('[performance-entry] regular URL, one tap, fullscreen/landscape, no navigation or terrain bake; artwork on/off passed');
} catch (error) {
  await page?.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  writeFileSync(`${output}/failure.json`, JSON.stringify({ error: error.stack, errors }, null, 2));
  console.error(`[performance-entry] ${error.message}; details=${output}/failure.json`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
