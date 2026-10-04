import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
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
let page;
const errors = [];
async function installSaveProbe(target) {
  await target.addInitScript(() => {
    globalThis.__originalSavePut = IDBObjectStore.prototype.put;
    globalThis.__readSaveSlot = async slot => {
      const db = await new Promise((resolve, reject) => {
        const request = indexedDB.open('civilization-saves', 1);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      try {
        return await new Promise((resolve, reject) => {
          const tx = db.transaction('saves', 'readonly');
          let text = null;
          const request = tx.objectStore('saves').get(slot);
          request.onsuccess = () => { text = request.result?.text ?? null; };
          tx.oncomplete = () => resolve(text);
          tx.onabort = () => reject(tx.error);
        });
      } finally { db.close(); }
    };
  });
}
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).ok) break; } catch {}
    if (i === 99) throw new Error(`Server unavailable at ${url}`);
    await delay(100);
  }
  browser = await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  // Match the existing opening-forecast probe's allowance on software GL.
  page.setDefaultTimeout(120000);
  page.on('pageerror', (error) => errors.push(error.message));
  await installSaveProbe(page);
  await page.goto(url);
  await page.getByTestId('game-new').waitFor();
  await page.waitForFunction(() => !document.querySelector('[data-testid=game-new]').disabled);
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
  await page.waitForFunction(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot().opening.phase === 'completed');
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
  const saved = await page.evaluate(async () => JSON.parse(await globalThis.__readSaveSlot(1)));
  assert.equal(saved.state.world.sites.filter(site => saved.state.world.regions.find(region => region.id === site.regionId)?.controller === 'player').length, 2);
  assert.equal(saved.state.world.sites.filter(site => site.neutral).length, 4);
  await page.getByTestId('game-menu-open').click();
  await page.getByTestId('game-new').click();
  await page.getByTestId('game-slot-1').click();
  await page.getByTestId('game-replace-confirm').waitFor();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(await page.evaluate(async () => JSON.parse(await globalThis.__readSaveSlot(1)).state.rng.baseSeed), saved.state.rng.baseSeed);
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
  await page.getByTestId('game-menu-open').click();
  await page.waitForFunction(() => document.querySelector('[data-testid=game-save-status]').dataset.phase === 'saved'
    && !document.querySelector('[data-testid=game-new]').disabled);
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
  await page.getByTestId('game-menu-open').click();
  await page.waitForFunction(() => document.querySelector('[data-testid=game-save-status]').dataset.phase === 'saved'
    && !document.querySelector('[data-testid=game-new]').disabled);
  const previousSave = await page.evaluate(() => globalThis.__readSaveSlot(1));
  await page.evaluate(() => {
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name !== 'saves') return globalThis.__originalSavePut.apply(this, args);
      throw new DOMException('Probe quota rejection', 'QuotaExceededError');
    };
  });
  await page.getByTestId('game-continue').click();
  await page.getByTestId('game-menu').waitFor({ state: 'hidden' });
  await page.getByTestId('game-menu-open').click();
  assert.equal(await page.getByTestId('game-menu').isVisible(), true);
  assert.equal(await page.getByTestId('game-save-summary').isVisible(), true);
  assert.equal(await page.getByTestId('game-save-export').isVisible(), true);
  await page.waitForFunction(() => document.querySelector('[data-testid=game-save-status]').dataset.phase === 'failed');
  assert.equal(await page.getByTestId('game-new').isDisabled(), true);
  assert.equal(await page.evaluate(() => globalThis.__readSaveSlot(1)), previousSave);
  const liveExportDownload = page.waitForEvent('download');
  await page.getByTestId('game-save-export').click();
  const liveExport = await liveExportDownload;
  await liveExport.saveAs('artifacts/save-recovery-export.json');
  const exportText = readFileSync('artifacts/save-recovery-export.json', 'utf8');
  const exportData = JSON.parse(exportText);
  assert.equal(exportData.state.rng.baseSeed, replacementSeed);
  assert.equal(exportData.timeline.checkpoints.length, JSON.parse(previousSave).timeline.checkpoints.length);
  assert.equal(await page.getByTestId('game-save-summary').textContent().then(text=>text.startsWith('Save failed')), true);
  await page.locator('#game-menu details summary').click();
  await page.getByTestId('game-save-diagnostics').click();
  const reportLocator = page.locator('#game-menu').getByTestId('save-diagnostic-report');
  await page.waitForFunction(() => document.querySelector('#game-menu [data-testid=save-diagnostic-report]').value.startsWith('{'));
  const diagnostic = JSON.parse(await reportLocator.inputValue());
  assert.equal(diagnostic.lastFailure.category, 'quota');
  assert.equal(diagnostic.lastFailure.error.name, 'QuotaExceededError');
  assert.ok(diagnostic.lastFailure.payloadUtf8Bytes > 0);
  assert.equal(diagnostic.status.lastSuccessfulSave.slot, 1);
  assert.ok(!('state' in diagnostic));
  const reportDownload = page.waitForEvent('download');
  await page.locator('#game-menu').getByTestId('save-diagnostic-download').click();
  await (await reportDownload).saveAs('artifacts/save-recovery-diagnostics.json');
  await page.screenshot({ path: 'artifacts/save-recovery-diagnostics.png' });
  await page.getByTestId('save-diagnostic-back').click();
  await page.evaluate(() => { IDBObjectStore.prototype.put = globalThis.__originalSavePut; });
  await page.getByTestId('game-save-retry').click();
  await page.waitForFunction(() => !document.querySelector('[data-testid=game-new]').disabled);
  await page.getByTestId('game-load').click();
  const seedBeforeImport = await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot().runner.baseSeed);
  await page.getByTestId('game-save-import-file').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
  await page.waitForFunction(() => document.querySelector('#game-menu').textContent.includes('invalid or damaged'));
  assert.equal(await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot().runner.baseSeed), seedBeforeImport);
  await page.getByTestId('game-save-import-file').setInputFiles({ name: 'export.json', mimeType: 'application/json', buffer: Buffer.from(exportText) });
  await page.getByRole('heading', { name: /Import Year/ }).waitFor();
  const previousSlot3 = await page.evaluate(() => globalThis.__readSaveSlot(3));
  await page.getByTestId('game-slot-3').click();
  await page.getByTestId('game-replace-confirm').waitFor();
  assert.equal(await page.evaluate(() => globalThis.__readSaveSlot(3)), previousSlot3, 'slot is unchanged until replacement is confirmed');
  await page.getByTestId('game-replace-confirm').click();
  await page.getByTestId('game-menu').waitFor({state:'hidden'});
  assert.equal(await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot().runner.baseSeed), replacementSeed);
  assert.equal(await page.evaluate(async () => JSON.parse(await globalThis.__readSaveSlot(3)).state.rng.baseSeed), replacementSeed);

  // Reproduce the phone's actual trigger in Chromium, then import a save that
  // independently exceeds localStorage's entire allowance into IndexedDB.
  const fullLocal = await page.evaluate(() => {
    let filledCharacters = 0;
    try {
      for (let index = 0; index < 100; index++) {
        localStorage.setItem(`probe-full-origin-${index}`, 'x'.repeat(64 * 1024));
        filledCharacters += 64 * 1024;
      }
    } catch (error) { return { filledCharacters, error: error.name }; }
    return { filledCharacters, error: null };
  });
  assert.equal(fullLocal.error, 'QuotaExceededError');
  assert.ok(fullLocal.filledCharacters > 4 * 1024 * 1024);
  await page.getByTestId('game-menu-open').click();
  await page.waitForFunction(() => document.querySelector('[data-testid=game-save-status]').dataset.phase === 'saved'
    && !document.querySelector('[data-testid=game-load]').disabled);
  await page.getByTestId('game-load').click();
  const largeSave = { ...exportData, state: { ...exportData.state, storageTestPayload: 'x'.repeat(6 * 1024 * 1024) } };
  const largeText = JSON.stringify(largeSave);
  await page.getByTestId('game-save-import-file').setInputFiles({ name: 'large-save.json', mimeType: 'application/json', buffer: Buffer.from(largeText) });
  await page.getByRole('heading', { name: /Import Year/ }).waitFor();
  await page.getByTestId('game-slot-2').click();
  await page.getByTestId('game-replace-confirm').click();
  await page.getByTestId('game-menu').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => globalThis.__readSaveSlot(2)), largeText);
  assert.equal(await page.evaluate(() => localStorage.getItem('civsurvivor.save.slot2')), null);
  assert.equal(await page.getByTestId('game-save-status').getAttribute('data-phase'), 'saved');

  const transferPage = await browser.newPage({ viewport: { width: 844, height: 390 } });
  await installSaveProbe(transferPage);
  await transferPage.addInitScript(text => {
    for (const slot of [1, 2, 3]) localStorage.setItem(`civsurvivor.save.slot${slot}`, text);
    localStorage.setItem('probe-unrelated-data', 'private-value-sentinel');
  }, exportText);
  await transferPage.goto(url);
  await transferPage.waitForFunction(() => !document.querySelector('[data-testid=game-load]')?.disabled);
  for (const slot of [1, 2, 3]) {
    assert.equal(await transferPage.evaluate(slot => globalThis.__readSaveSlot(slot), slot), exportText);
    assert.equal(await transferPage.evaluate(slot => localStorage.getItem(`civsurvivor.save.slot${slot}`), slot), null);
  }
  assert.equal(await transferPage.evaluate(() => localStorage.getItem('probe-unrelated-data')), 'private-value-sentinel');
  await transferPage.close();
  const blockedPage = await browser.newPage({ viewport: { width: 844, height: 390 } });
  await blockedPage.addInitScript(() => {
    const factory = indexedDB;
    globalThis.__blockSaveAccess = true;
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, get() {
      if (globalThis.__blockSaveAccess) throw new DOMException('Storage blocked for probe', 'SecurityError');
      return factory;
    } });
  });
  await blockedPage.goto(url);
  await blockedPage.getByTestId('game-storage-retry').waitFor();
  assert.equal(await blockedPage.getByTestId('game-new').isDisabled(), true);
  await blockedPage.evaluate(() => { globalThis.__blockSaveAccess = false; });
  await blockedPage.getByTestId('game-storage-retry').click();
  await blockedPage.waitForFunction(() => !document.querySelector('[data-testid=game-new]').disabled);
  await blockedPage.close();

  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  phone.setDefaultTimeout(120000);
  phone.on('pageerror',error=>errors.push(error.message));
  // Exercise the unsupported-phone path as well as native desktop fullscreen.
  await phone.addInitScript(()=>{
    globalThis.__displayRequests=[];

    Element.prototype.requestFullscreen=async()=>{
      globalThis.__displayRequests.push('fullscreen');throw new Error('Unavailable');
    };
    screen.orientation.lock=async(value)=>{
      globalThis.__displayRequests.push(value);throw new Error('Unavailable');
    };
  });
  await installSaveProbe(phone);
  await phone.goto(url);
  await phone.getByTestId('game-new').waitFor();
  await phone.waitForFunction(() => !document.querySelector('[data-testid=game-new]').disabled);
  assert.equal(await phone.locator('#mobile-landscape-gate').count(), 0);
  await phone.screenshot({ path: 'artifacts/game-menu-portrait.png' });
  await phone.getByTestId('game-new').click();
  await phone.getByTestId('game-slot-1').click();
  await phone.getByTestId('game-display-hint').waitFor({state:'visible'});
  assert.equal(await phone.getByTestId('game-menu').isVisible(), true);
  assert.equal(await phone.evaluate(()=>globalThis.__readSaveSlot(1)),null,'Portrait entry cannot create a game behind the menu');
  assert.deepEqual(await phone.evaluate(()=>globalThis.__displayRequests),['fullscreen','landscape']);
  await phone.setViewportSize({ width: 844, height: 390 });
  await phone.getByTestId('game-slot-1').click();
  await phone.getByTestId('game-menu').waitFor({state:'hidden'});
  await waitForRide(phone);
  await phone.waitForFunction(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot().opening.phase === 'completed');
  await phone.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.browseSecond(0));
  await phone.evaluate(()=>document.activeElement.blur());
  await phone.keyboard.press('Space');
  const phoneHeld=await phone.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot());
  await phone.evaluate(()=>{IDBObjectStore.prototype.put=function(...args){if(this.name==='saves')throw new DOMException('quota','QuotaExceededError');return globalThis.__originalSavePut.apply(this,args);};});
  // Headless contexts do not model OS window focus; deliver its native event.
  await phone.evaluate(()=>window.dispatchEvent(new Event('blur')));
  await phone.getByTestId('game-menu').waitFor({state:'visible'});
  await phone.waitForFunction(() => document.querySelector('[data-testid=game-save-status]').dataset.phase === 'failed');
  assert.equal(await phone.getByTestId('game-save-export').isVisible(),true);
  await phone.screenshot({path:'artifacts/save-recovery-phone.png'});
  await delay(350);
  assert.equal(await phone.evaluate(()=>globalThis.__SETTLEMENT_DEBUG__.getSnapshot().viewedSec),phoneHeld.viewedSec,'Focus loss pauses even when saving fails');
  await phone.evaluate(()=>window.dispatchEvent(new Event('focus')));
  assert.equal(await phone.getByTestId('game-menu').isVisible(),true,'Regaining focus does not auto-resume');
  await phone.evaluate(()=>{IDBObjectStore.prototype.put=globalThis.__originalSavePut;});
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
  hostile.setDefaultTimeout(120000);
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
  await hostile.waitForFunction(() => !document.querySelector('[data-testid=game-new]').disabled);
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
  writeFileSync(artifact, JSON.stringify({ ok: true, checks: ['three IndexedDB slots', 'seed preservation', 'reload continue', 'overwrite/cancel', 'transaction failure', 'live export during quota failure', 'diagnostic download', 'invalid import preservation', 'validated import and replacement confirmation', 'save with full localStorage', 'save beyond localStorage quota', 'three-slot transfer with unrelated data preserved', 'blocked storage startup and retry', 'unveil following', 'desktop windowed entry and focus continuity','touch fullscreen entry', 'portrait menu fallback', 'focus pause and memory resume', 'touch entry despite hung lock and lost focus'], screenshots: ['game-menu-desktop.png', 'game-menu-slots.png', 'game-menu-portrait.png','save-recovery-diagnostics.png','save-recovery-phone.png'] }));
  console.log('[probe:game-menu] OK');
} catch (error) {
  const menuStatus = page ? await page.evaluate(() => ({
    menuVisible: !document.querySelector('#game-menu')?.hidden,
    messages: Array.from(document.querySelectorAll('#game-menu [role="status"], #game-menu [role="alert"]')).map(node=>node.textContent),
    loading: document.querySelector('#game-menu h2')?.textContent,
    opening: globalThis.__SETTLEMENT_DEBUG__?.getSnapshot()?.opening,
  })).catch(()=>null) : null;
  writeFileSync(artifact, JSON.stringify({ error: error.stack, pageErrors: errors, menuStatus }));
  console.error(`[probe:game-menu] FAILED: ${error.message.split('\n')[0]}\nReproduce: npm run probe:game-menu\nDetails: ${artifact}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
}
