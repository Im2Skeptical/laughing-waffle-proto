import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { BROWSER_PROBE_LAUNCH_OPTIONS } from './browser-probe-config.mjs';

const PORT = 18182;
const url = `http://127.0.0.1:${PORT}`;
const artifact = 'artifacts/game-menu-browser-probe.json';
mkdirSync('artifacts', { recursive: true });
const server = spawn(process.execPath, ['node_modules/serve/bin/serve.js', '-l', String(PORT), '--no-clipboard', 'dist'],
  { stdio: 'ignore', windowsHide: true });
let browser;
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).ok) break; } catch {}
    if (i === 99) throw new Error(`Server unavailable at ${url}`);
    await delay(100);
  }
  browser = await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
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
  const waitForRide=async(target=page)=>{
    await target.waitForFunction(()=>{
      const snapshot=globalThis.__SETTLEMENT_DEBUG__.getSnapshot();
      return snapshot.graph.forecastRevealPlayheadFollowEnabled &&
        snapshot.viewedSec>snapshot.frontierSec &&
        Math.abs(snapshot.viewedSec-snapshot.graph.revealedCoverageEndSec)<=2;
    });
  };
  await waitForRide();
  const ride=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot());
  assert.equal(ride.runner.cursorStateSec,initialSecond,'Riding the unveil does not advance authoritative history');
  await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
  await delay(100);
  assert.equal(await page.getByTestId('game-menu').isVisible(),false,'Desktop focus loss keeps gameplay open');
  assert.equal(await page.evaluate(()=>!!document.fullscreenElement),false,'Desktop entry stays windowed');
  await page.evaluate(()=>document.dispatchEvent(new Event('fullscreenchange')));
  assert.equal(await page.getByTestId('game-menu').isVisible(),false,'Desktop fullscreen exit does not pause');
  await page.getByTestId('game-menu-open').click();
  await page.getByTestId('game-menu').waitFor({state:'visible'});
  const pausedRide=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot());
  await delay(350);
  await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.forceRender());
  const frozenRide=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot());
  assert.equal(frozenRide.viewedSec,pausedRide.viewedSec,'Background renders cannot move the paused playhead');
  assert.equal(frozenRide.graph.revealedCoverageEndSec,pausedRide.graph.revealedCoverageEndSec);
  await page.getByTestId('game-continue').click();
  await page.getByTestId('game-menu').waitFor({state:'hidden'});
  await waitForRide();
  assert.equal(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().graph.forecastRevealPlayheadFollowEnabled),true,'Continue preserves riding the unveil');
  const present=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getTimeActionClickPoint());
  assert.ok(present);
  const canvas=await page.locator('canvas').boundingBox();
  await page.mouse.click(canvas.x+present.x/2424*canvas.width,canvas.y+present.y/1080*canvas.height);
  await page.waitForFunction(()=>{
    const snapshot=globalThis.__SETTLEMENT_DEBUG__.getSnapshot();
    return !snapshot.graph.forecastRevealPlayheadFollowEnabled&&snapshot.viewedSec===snapshot.frontierSec;
  });
  await delay(250);
  assert.equal(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().viewedSec),initialSecond,'Present remains detached while the reveal continues');
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
  await page.getByTestId('game-menu').waitFor({state:'hidden'});
  assert.equal(await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot().runner.baseSeed), saved.state.rng.baseSeed);
  await page.reload();
  await page.getByTestId('game-continue').click();
  await waitForRide();
  await page.evaluate(()=>document.activeElement.blur());
  await page.keyboard.press('Space');
  const held=await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot());
  assert.equal(held.graph.forecastRevealPlayheadFollowEnabled,false,'Pause releases automatic unveil follow');
  assert.equal(held.playbackTarget,0,'Pause holds the moving unveil instead of starting normal playback');
  await delay(250);
  assert.equal(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().viewedSec),held.viewedSec);
  assert.equal(await page.evaluate(()=>!!document.fullscreenElement),false,'Desktop Continue stays windowed');
  await page.getByTestId('game-menu-open').click();
  await page.getByTestId('game-menu').waitFor({state:'visible'});
  await page.getByTestId('game-continue').click();
  await page.getByTestId('game-menu').waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().viewedSec),held.viewedSec,'Continue resumes the held picture without reloading');
  assert.equal(await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot().runner.baseSeed), saved.state.rng.baseSeed);
  await page.getByTestId('game-menu-open').click();
  await page.getByTestId('game-new').click();
  await page.getByTestId('game-slot-1').click();
  await page.getByTestId('game-replace-confirm').click();
  await page.getByTestId('game-menu').waitFor({state:'hidden'});
  const replacementSeed = await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot().runner.baseSeed);
  assert.notEqual(replacementSeed, saved.state.rng.baseSeed);
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new Error('quota'); }; });
  await page.getByTestId('game-menu-open').click();
  assert.equal(await page.getByTestId('game-menu').isVisible(), false);
  assert.equal(await page.locator('.game-save-error').isVisible(), true);

  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  phone.on('pageerror',error=>errors.push(error.message));
  // Exercise the unsupported-phone path as well as native desktop fullscreen.
  await phone.addInitScript(()=>{
    globalThis.__displayRequests=[];
    globalThis.__originalSetItem=Storage.prototype.setItem;
    Element.prototype.requestFullscreen=async()=>{
      globalThis.__displayRequests.push('fullscreen');throw new Error('Unavailable');
    };
    screen.orientation.lock=async(value)=>{
      globalThis.__displayRequests.push(value);throw new Error('Unavailable');
    };
  });
  await phone.goto(url);
  await phone.getByTestId('game-new').waitFor();
  assert.equal(await phone.locator('#mobile-landscape-gate').count(), 0);
  await phone.screenshot({ path: 'artifacts/game-menu-portrait.png' });
  await phone.getByTestId('game-new').click();
  await phone.getByTestId('game-slot-1').click();
  await phone.getByTestId('game-display-hint').waitFor({state:'visible'});
  assert.equal(await phone.getByTestId('game-menu').isVisible(), true);
  assert.equal(await phone.evaluate(()=>localStorage.getItem('civsurvivor.save.slot1')),null,'Portrait entry cannot create a game behind the menu');
  assert.deepEqual(await phone.evaluate(()=>globalThis.__displayRequests),['fullscreen','landscape']);
  await phone.setViewportSize({ width: 844, height: 390 });
  await phone.getByTestId('game-slot-1').click();
  await phone.getByTestId('game-menu').waitFor({state:'hidden'});
  await waitForRide(phone);
  await phone.evaluate(()=>document.activeElement.blur());
  await phone.keyboard.press('Space');
  const phoneHeld=await phone.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot());
  await phone.evaluate(()=>{Storage.prototype.setItem=()=>{throw new Error('quota');};});
  // Headless contexts do not model OS window focus; deliver its native event.
  await phone.evaluate(()=>window.dispatchEvent(new Event('blur')));
  await phone.getByTestId('game-menu').waitFor({state:'visible'});
  await delay(350);
  assert.equal(await phone.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().viewedSec),phoneHeld.viewedSec,'Focus loss pauses even when saving fails');
  await phone.evaluate(()=>window.dispatchEvent(new Event('focus')));
  assert.equal(await phone.getByTestId('game-menu').isVisible(),true,'Regaining focus does not auto-resume');
  await phone.evaluate(()=>{Storage.prototype.setItem=globalThis.__originalSetItem;});
  await phone.getByTestId('game-continue').click();
  await phone.getByTestId('game-menu').waitFor({state:'hidden'});
  const phoneResumed=await phone.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot());
  assert.equal(phoneResumed.viewedSec,phoneHeld.viewedSec);
  assert.equal(phoneResumed.runner.baseSeed,phoneHeld.runner.baseSeed);
  await phone.setViewportSize({ width: 390, height: 844 });
  await phone.getByTestId('game-menu').waitFor({state:'visible'});
  await phone.setViewportSize({width:844,height:390});
  assert.equal(await phone.getByTestId('game-menu').isVisible(),true,'Rotation alone does not resume a paused game');

  const hostileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const hostile = await hostileContext.newPage();
  hostile.on('pageerror', error => errors.push(error.message));
  await hostile.addInitScript(() => {
    globalThis.__displayRequests = [];
    let fullscreenEl = null;
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      get() { return fullscreenEl; },
    });
    document.hasFocus = () => false;
    Element.prototype.requestFullscreen = async function requestFullscreen() {
      globalThis.__displayRequests.push('fullscreen');
      fullscreenEl = this;
      document.dispatchEvent(new Event('fullscreenchange'));
      window.dispatchEvent(new Event('blur'));
    };
    screen.orientation.lock = (value) => {
      globalThis.__displayRequests.push(value);
      return new Promise(() => {});
    };
  });
  await hostile.goto(url);
  await hostile.getByTestId('game-new').waitFor();
  await hostile.getByTestId('game-new').click();
  const lockRequested = hostile.waitForFunction(() => globalThis.__displayRequests.includes('landscape'));
  await hostile.getByTestId('game-slot-1').click();
  await lockRequested;
  await hostile.setViewportSize({ width: 844, height: 390 });
  await hostile.getByTestId('game-menu').waitFor({ state: 'hidden' });
  assert.deepEqual(await hostile.evaluate(() => globalThis.__displayRequests), ['fullscreen', 'landscape']);
  assert.equal(await hostile.evaluate(() => document.hasFocus()), false);
  await waitForRide(hostile);

  assert.deepEqual(errors, []);
  writeFileSync(artifact, JSON.stringify({ ok: true, checks: ['three slots', 'seed preservation', 'reload continue', 'overwrite/cancel', 'storage failure', 'unveil following', 'desktop windowed entry and focus continuity','touch fullscreen entry', 'portrait menu fallback', 'focus pause and memory resume', 'touch entry despite hung lock and lost focus'], screenshots: ['game-menu-desktop.png', 'game-menu-slots.png', 'game-menu-portrait.png'] }));
  console.log('[probe:game-menu] OK');
} catch (error) {
  writeFileSync(artifact, JSON.stringify({ error: error.stack }));
  console.error(`[probe:game-menu] FAILED: ${error.message}\nDetails: ${artifact}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
}
