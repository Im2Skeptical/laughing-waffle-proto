import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { BROWSER_PROBE_LAUNCH_OPTIONS } from './browser-probe-config.mjs';
const url = process.argv[2];
assert.ok(url, 'Pass the running local-preview URL');
const output = 'artifacts/region-names';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
const errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, hasTouch: true });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('civsurvivor.newGame.devSettings', JSON.stringify({seed:1867})));
  await page.goto(url);
  const fitting = await page.evaluate(async () => {
    const { createRegionLabel } = await import('/src/views/region-label.js');
    const full = 'Northwestern Mountains C';
    return [1000,180,110].map(width => {
      const label = createRegionLabel(full,{fontFamily:'Georgia',fontSize:21},0,0,width,52);
      const result = {limit:width,text:label.text,width:label.width,height:label.height,full:label.accessibleTitle};
      label.destroy(); return result;
    });
  });
  assert.equal(fitting[0].text,'Northwestern Mountains C');
  for (const entry of fitting) {
    assert.ok(entry.width <= entry.limit + .01 && entry.height <= 52.01);
    assert.equal(entry.full,'Northwestern Mountains C');
  }
  assert.equal(fitting[1].text,'NW Mountains C');
  await page.getByRole('button',{name:'New game',exact:true}).click();
  await page.getByRole('button',{name:'Start here',exact:true}).first().click();
  await page.waitForFunction(() => document.querySelector('#game-menu')?.hidden === true,null,{timeout:180000});
  await page.waitForFunction(() => globalThis.__SETTLEMENT_DEBUG__?.getSnapshot().worldMap?.regionReferences?.length === 20);
  const references = await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot().worldMap.regionReferences);
  assert.ok(references.every(r => r.reference && !/^(R|Region)[0-9]+$/.test(r.reference)));
  assert.equal(new Set(references.map(r=>r.reference)).size,20);
  await page.screenshot({path:`${output}/desktop.png`});
  await page.evaluate(async () => { if (document.fullscreenElement) await document.exitFullscreen(); });
  await page.setViewportSize({width:844,height:390});
  await page.getByTestId('game-continue').click();
  await page.getByTestId('game-menu').waitFor({state:'hidden'});
  await page.screenshot({path:`${output}/phone.png`});
  assert.deepEqual(errors,[]);
  writeFileSync(`${output}/result.json`,JSON.stringify({references,fitting,errors},null,2));
  console.log('[region-name-ui] 20 named regions; full/compact labels fit; desktop/phone rendered without errors');
} finally { await browser.close(); }
