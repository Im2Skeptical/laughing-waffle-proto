import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { BROWSER_PROBE_LAUNCH_OPTIONS } from './browser-probe-config.mjs';

const output = 'artifacts/new-game-opening';
mkdirSync(output, {recursive:true});
const server = spawn(process.execPath, ['node_modules/serve/bin/serve.js', '-l', '18186', '--no-clipboard', 'dist'],
  {stdio:'ignore', windowsHide:true});
let browser, page;
const errors = [];
const snapshot = () => page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot());
async function pointClick(point) {
  assert.ok(point, 'visible control target');
  const box = await page.locator('canvas').boundingBox();
  await page.mouse.click(box.x + point.x / 2424 * box.width, box.y + point.y / 1080 * box.height);
}
async function reopen() {
  await pointClick(await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getRunCompleteClickPoint('details')));
  await page.waitForFunction(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot().runComplete.open);
}
try {
  for (let i=0;i<100;i++) { try { if ((await fetch('http://127.0.0.1:18186')).ok) break; } catch {} await delay(100); }
  browser = await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
  page = await browser.newPage({viewport:{width:1280,height:800}});
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:18186');
  await page.getByTestId('game-new').click();
  await page.getByTestId('game-slot-1').click();
  await page.getByTestId('game-loading-progress').waitFor();
  assert.equal(await page.evaluate(() => localStorage.getItem('civsurvivor.save.slot1')), null);
  await page.getByTestId('game-loading-back').click();
  assert.equal(await page.evaluate(() => localStorage.getItem('civsurvivor.save.slot1')), null);
  await page.getByTestId('game-new').click();
  await page.getByTestId('game-slot-1').click();
  await page.getByTestId('game-menu').waitFor({state:'hidden', timeout:120000});
  const began = Date.now();
  const start = await snapshot();
  assert.equal(start.opening.phase, 'revealing');
  assert.equal(start.runComplete.open, false);
  assert.equal(await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getNavigationClickPoint('vassal')), null);
  await page.keyboard.press('Space');
  assert.equal((await snapshot()).playbackTarget, 0);
  await page.getByTestId('game-menu-open').click();
  const held = (await snapshot()).opening.elapsedSec;
  await delay(400);
  assert.equal((await snapshot()).opening.elapsedSec, held, 'menu pauses introduction');
  await page.getByTestId('game-continue').click();
  await page.waitForFunction(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot().opening.phase === 'completed');
  const end = await snapshot();
  assert.equal(end.opening.elapsedSec, 5);
  assert.ok(Date.now() - began >= 4800, 'introduction is not skipped or shortened');
  assert.equal(end.frontierSec, 0);
  assert.equal(end.runner.timeline.actionCount, 0);
  assert.equal(end.viewedSec, end.opening.lossSec);
  assert.equal(end.runComplete.info.projected, true);
  assert.equal(end.runComplete.open, true);
  assert.equal(end.runComplete.spotlightRects.length, 4);
  await page.waitForFunction(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot().graph.monsterEndpoint === '100');
  await page.screenshot({path:`${output}/desktop.png`});
  await pointClick(await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getTimeActionClickPoint()));
  assert.equal((await snapshot()).viewedSec, 0);
  assert.equal((await snapshot()).runComplete.open, false);
  await delay(100);
  assert.equal((await snapshot()).graph.monsterEmphasis, false);

  await reopen();
  const plot = (await snapshot()).graph.plotScreenRect;
  await page.mouse.click(plot.x + plot.width * 0.45, plot.y + plot.height / 2);
  const scrubbed = await snapshot();
  assert.equal(scrubbed.runComplete.open, false);
  assert.ok(scrubbed.viewedSec > 0 && scrubbed.viewedSec < end.opening.lossSec);
  assert.equal(scrubbed.frontierSec, 0);

  await reopen();
  const lever = await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getTimeLeverScreenRect());
  const box = await page.locator('canvas').boundingBox();
  const toScreen = (x,y) => [box.x+x/2424*box.width,box.y+y/1080*box.height];
  await page.mouse.move(...toScreen(lever.x+lever.width/2,lever.y+lever.height*0.7));
  await page.mouse.down();
  await delay(150);
  assert.equal((await snapshot()).runComplete.open, false);
  assert.notEqual((await snapshot()).playbackTarget, 0, 'lever gesture reaches underlying control');
  await page.mouse.up();
  await pointClick(await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getTimeActionClickPoint()));
  await reopen();
  const wheel = await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getTimeWheelSnapshot());
  await page.mouse.move(...toScreen(wheel.season.x, wheel.season.y-wheel.season.radius*0.86));
  await page.mouse.down();
  await page.mouse.move(...toScreen(wheel.season.x+wheel.season.radius*0.7,wheel.season.y-wheel.season.radius*0.5),{steps:8});
  await page.mouse.up();
  assert.equal((await snapshot()).runComplete.open, false);

  await page.setViewportSize({width:844,height:390});
  await reopen();
  await delay(100);
  await page.screenshot({path:`${output}/mobile.png`});
  await pointClick(await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getTimeActionClickPoint()));
  assert.equal((await snapshot()).runComplete.open, false);
  assert.equal((await snapshot()).viewedSec, 0);
  assert.deepEqual(errors, []);
  writeFileSync(`${output}/probe.json`,JSON.stringify({ok:true,lossSec:end.opening.lossSec,checks:[
    'loading cancellation preserves saves','five-second read-only reveal','menu pause/resume','vassal lock',
    'monster endpoint','present','graph scrub','lever gesture','wheel gesture','mobile spotlight layout']}));
  console.log('[probe:new-game-opening] OK');
} catch(error) {
  await page?.screenshot({path:`${output}/failure.png`}).catch(()=>{});
  writeFileSync(`${output}/probe.json`,JSON.stringify({error:error.stack,errors}));
  console.error(`[probe:new-game-opening] FAILED: ${error.message}\nDetails: ${output}/probe.json`);
  process.exitCode=1;
} finally { await browser?.close(); server.kill(); }
