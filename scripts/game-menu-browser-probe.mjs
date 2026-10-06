import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { BROWSER_PROBE_LAUNCH_OPTIONS } from './browser-probe-config.mjs';
import { createAuthoredGameConfig } from '../src/model/game-config.js';
import { createCardReviewController, CARD_REVIEW_STORAGE_KEY } from '../src/controllers/card-review-controller.js';
import { createStarterBootProfile } from '../src/model/starter-boot-profile.js';
import { DEBUG_PROFILE_LIBRARY_STORAGE_KEY, createEmptyDebugProfileLibrary, saveDebugProfile, serializeDebugProfileLibrary } from '../src/model/debug-profile-library.js';

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
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      constructor(url, options) {
        super(url, options);
        if (!String(url).includes('save-load-worker')) return;
        const probe = globalThis.__saveLoadFrames = { frames: 0, completed: false };
        const frame = () => { if (!probe.completed) { probe.frames++; requestAnimationFrame(frame); } };
        requestAnimationFrame(frame);
        this.addEventListener('message', ({ data }) => {
          if (!['loadProgress', 'historyProgress'].includes(data?.kind)) probe.completed = true;
        });
        this.addEventListener('message', event => {
          if (!globalThis.__holdSaveLoadMessages) return;
          event.stopImmediatePropagation();
          (globalThis.__heldSaveLoadMessages ??= []).push({ worker: this, data: event.data });
        });
      }
    };
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
async function openDeveloperTools(page) {
  const tools = page.getByTestId('game-developer-tools');
  if (await tools.getAttribute('open') === null) await tools.locator('summary').click();
}
async function checkLoadingDetails(page) {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.evaluate(() => { globalThis.__holdSaveLoadMessages = true; });
  await page.getByTestId('game-continue').click();
  await page.waitForFunction(() => globalThis.__heldSaveLoadMessages?.some(({ data }) => data?.ok === true));
  const loadingDetails = page.getByTestId('game-loading-details');
  await page.waitForFunction(() => document.querySelector('.game-loading-stage')?.textContent.includes('replaying history'));
  await page.getByTestId('game-loading-back').focus();
  const beforeTiming = await loadingDetails.textContent();
  await delay(500);
  assert.notEqual(await loadingDetails.textContent(), beforeTiming, 'loading timers keep updating while the worker is pending');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.testid), 'game-loading-back',
    'loading updates preserve button focus');
  await loadingDetails.locator('summary').click();
  await delay(300);
  assert.equal(await loadingDetails.locator('details').getAttribute('open'), '', 'timing updates preserve expanded details');
  const mobileBounds = await loadingDetails.boundingBox();
  assert.ok(mobileBounds.x >= 0 && mobileBounds.x + mobileBounds.width <= 844, 'loading details fit phone landscape');
  await page.screenshot({ path: 'artifacts/game-loading-phone.png' });
  await page.evaluate(() => {
    const messages = globalThis.__heldSaveLoadMessages.splice(0);
    for (const { worker, data } of messages) {
      worker.onmessage({ data: data?.ok === true ? { ok: false, reason: 'fixtureLoadFailure' } : data });
    }
    globalThis.__holdSaveLoadMessages = false;
  });
  await page.getByTestId('game-loading-retry').waitFor();
  assert.match(await loadingDetails.textContent(), /Stopped during: Preparing historical graphs.*fixtureLoadFailure/);
  const failedTiming = await loadingDetails.textContent();
  await delay(350);
  assert.equal(await loadingDetails.textContent(), failedTiming, 'failed loading timings remain frozen');
  await page.screenshot({ path: 'artifacts/game-loading-failure-phone.png' });
  await page.getByTestId('game-loading-retry').click();
  await page.getByTestId('game-menu').waitFor({ state: 'hidden' });
  await page.setViewportSize({ width: 1280, height: 800 });
}

try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).ok) break; } catch {}
    if (i === 99) throw new Error(`Server unavailable at ${url}`);
    await delay(100);
  }
  browser = await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
  const menuContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  page = await menuContext.newPage();
  // Match the existing opening-forecast probe's allowance on software GL.
  page.setDefaultTimeout(120000);
  page.on('pageerror', (error) => errors.push(error.message));
  await installSaveProbe(page);
  if (process.argv.includes('--artwork-only')) {
    const { createNewGameState } = await import('../src/model/new-game.js');
    const { createTimelineFromInitialState } = await import('../src/model/timeline/index.js');
    const { exportSave } = await import('../src/controllers/sim-runner/save-slots.js');
    const state = createNewGameState(735);
    const fixture = exportSave({ state, timeline: createTimelineFromInitialState(state), setupId: 'artwork-probe' }).text;
    await page.addInitScript(text => {
      if (sessionStorage.getItem('artworkFixtureInstalled')) return;
      localStorage.setItem('civsurvivor.save.slot1', text);
      sessionStorage.setItem('artworkFixtureInstalled', '1');
    }, fixture);
    let blocked = true;
    let failedRequests = 0;
    await page.route('**/sprite-sheets/resource-language.png', route => {
      if (blocked) { failedRequests++; return route.abort('failed'); }
      return route.continue();
    });
    await page.goto(url);
    await page.getByTestId('game-continue').click();
    await page.getByTestId('game-loading-retry').waitFor();
    assert.match(await page.locator('#game-menu h2').textContent(), /Artwork couldn’t be loaded/);
    assert.ok(failedRequests >= 3 && failedRequests <= 7, 'failed downloads receive bounded automatic retries');
    assert.match(await page.getByTestId('game-loading-details').textContent(), /resource-language.json/);
    assert.equal(await page.getByTestId('game-menu').isVisible(), true);
    await page.screenshot({ path: 'artifacts/game-artwork-failure.png' });
    blocked = false;
    await page.getByTestId('game-loading-retry').click();
    await page.waitForFunction(() => document.querySelector('#game-menu').hidden
      || document.querySelector('[data-testid="game-loading-retry"]'));
    assert.equal(await page.getByTestId('game-menu').isVisible(), false,
      `artwork retry must recover: ${await page.getByTestId('game-loading-details').textContent().catch(() => '')}`);
    const uploaded = await page.evaluate(() => ['resource-language', 'piece-frames', 'chronicle-illustrations',
      'vassal-portraits', 'chronicle-gate', 'timegraph-chronicle', ...[0, 1, 2].map(i => `settlement-pieces-${i}`)]
      .every(name => Object.values(PIXI.Assets.cache.get(`images/sprite-sheets/${name}.json`)?.textures ?? {})
        .some(texture => texture.baseTexture.valid && Object.keys(texture.baseTexture._glTextures).length > 0)));
    assert.equal(uploaded, true, 'manual retry uploads every required atlas');
    await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.browseSecond(0));
    const firstOpen = await page.evaluate(() => {
      const d = globalThis.__SETTLEMENT_DEBUG__;
      const before = d.getSnapshot().worldMap.vassalPreparation.chooser;
      const wasOpen = d.isVassalSelectionOpen();
      const start = performance.now();
      const result = d.openNextSelection();
      const handlerMs = performance.now() - start;
      const after = d.getSnapshot().worldMap.vassalPreparation.chooser;
      return { before, after, wasOpen, ok: result.ok, handlerMs };
    });
    assert.equal(firstOpen.wasOpen, false, 'preparation does not open the chooser');
    assert.equal(firstOpen.before.candidateCount, 3, 'three candidate panels are built behind loading');
    assert.equal(firstOpen.ok, true);
    assert.equal(firstOpen.after.buildCount, firstOpen.before.buildCount, 'first opening reuses the prepared candidate panels');
    assert.equal((await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.selectCandidate(0))).ok, true);
    await page.getByTestId('game-menu-open').click();
    await page.waitForFunction(() => document.querySelector('[data-testid="game-save-status"]')?.textContent === 'Saved');
    // The fixture initializes only the first page; subsequent Continue must
    // load the Vassal selection actually saved through the game menu.
    await page.evaluate(() => localStorage.removeItem('civsurvivor.save.slot1'));
    await page.reload();
    await page.getByTestId('game-continue').click();
    await page.getByTestId('game-menu').waitFor({ state: 'hidden' });
    // Freeze forecast-following through the real Present control so the first
    // opening compares the same presentation that was prepared during loading.
    await page.waitForFunction(() => !!globalThis.__SETTLEMENT_DEBUG__.getNavigationClickPoint('present'));
    const canvas = await page.locator('canvas').boundingBox();
    const present = await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getNavigationClickPoint('present'));
    await page.mouse.click(canvas.x + present.x * canvas.width / 2424, canvas.y + present.y * canvas.height / 1080);
    await page.waitForFunction(() => {
      const s = globalThis.__SETTLEMENT_DEBUG__.getSnapshot();
      return s.viewedSec === s.frontierSec && s.navigation.time.mode === 'present';
    });
    await page.waitForFunction(() => !!globalThis.__SETTLEMENT_DEBUG__.getNavigationClickPoint('life'));
    await delay(150); // Exercise hidden updates between preparation and first opening.
    const continued = await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot().worldMap.vassalPreparation);
    assert.ok(continued.lifeMap.nodeCount > 0, 'Continue prepares the active Vassal Life Map');
    assert.ok(continued.hud.childCount > 0, 'Continue prepares the active Vassal HUD');
    assert.equal(continued.lifeMap.visible, false);
    const point = await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getNavigationClickPoint('life'));
    assert.ok(point);
    await page.mouse.click(canvas.x + point.x * canvas.width / 2424, canvas.y + point.y * canvas.height / 1080);
    await page.waitForFunction(() => {
      const s = globalThis.__SETTLEMENT_DEBUG__.getSnapshot().worldMap;
      return s.mode === 'vassalLife' && s.vassalPreparation.hud.visible;
    });
    const opened = await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot().worldMap.vassalPreparation);
    assert.equal(opened.lifeMap.buildCount, continued.lifeMap.buildCount, 'first Life Map opening reuses its prepared scene');
    assert.equal(opened.hud.buildCount, continued.hud.buildCount, 'first HUD opening reuses its prepared scene');
    assert.deepEqual(errors, []);
    writeFileSync('artifacts/game-artwork-browser-probe.json', JSON.stringify({ ok: true, failedRequests, firstOpen, continued, opened }, null, 2));
    console.log(`[probe:game-menu] PASS: sprite failure, retries, recovery, prepared Vassal drawer and Continue Life Map (${firstOpen.handlerMs.toFixed(1)}ms drawer handler)`);
  } else if (process.argv.includes('--loading-only')) {
    const { createNewGameState } = await import('../src/model/new-game.js');
    const { createTimelineFromInitialState } = await import('../src/model/timeline/index.js');
    const { exportSave } = await import('../src/controllers/sim-runner/save-slots.js');
    const state = createNewGameState(735), timeline = createTimelineFromInitialState(state);
    timeline.cursorSec = 20; timeline.historyEndSec = 20;
    const fixture = exportSave({ state, timeline, setupId: 'loading-probe' }).text;
    await page.addInitScript(text => localStorage.setItem('civsurvivor.save.slot1', text), fixture);
    await page.goto(url);
    await page.getByTestId('game-continue').waitFor();
    await checkLoadingDetails(page);
    assert.deepEqual(errors, []);
    writeFileSync('artifacts/game-loading-browser-probe.json', JSON.stringify({ ok: true,
      checks: ['live timing', 'button focus', 'expanded timing persistence', 'phone bounds', 'history failure details', 'frozen failure timings', 'retry'] }));
    console.log('PASS phone loading details, timings, failure and retry');
  } else if (process.argv.includes('--dev-settings-only')) {
    const profile = createStarterBootProfile();
    profile.gameSettings.values.populationPerToken = 12;
    profile.gameSettings.values.primordialBasePressure = 400;
    profile.lifeMapLab.generatorConfig.laneCount = 5;
    profile.launch.neutralSettlements = false;
    profile.gamepieces.practices.forage.stockCapacity = 6;
    const library = saveDebugProfile(createEmptyDebugProfileLibrary(), 'Five lanes test', profile).library;
    await page.addInitScript(({ key, text }) => localStorage.setItem(key, text),
      { key: DEBUG_PROFILE_LIBRARY_STORAGE_KEY, text: serializeDebugProfileLibrary(library) });
    await page.goto(url);
    await page.getByTestId('game-new').waitFor();
    await openDeveloperTools(page);
    assert.equal(await page.getByTestId('game-use-dev-settings').isChecked(), false);
    assert.equal(await page.getByTestId('game-dev-profile').isDisabled(), true);
    assert.equal(await page.getByTestId('game-new-run-setup').count(), 0);
    await page.getByTestId('game-use-dev-settings').check();
    await page.getByTestId('game-dev-profile').selectOption('profile-1');
    assert.match(await page.getByTestId('game-dev-settings-status').textContent(), /New Game will use Five lanes test/);
    await page.reload();
    await page.getByTestId('game-new').waitFor();
    await openDeveloperTools(page);
    assert.equal(await page.getByTestId('game-use-dev-settings').isChecked(), true);
    assert.equal(await page.getByTestId('game-dev-profile').inputValue(), 'profile-1');
    // A profile saved in the Gym tab refreshes the menu and its prepared opening.
    const gym = await page.context().newPage();
    await gym.goto(`${url}/#/dev/gym?workspace=setup`);
    library.profiles[0].name = 'Updated five lanes';
    library.profiles[0].profile.gameSettings.values.populationPerToken = 14;
    await gym.evaluate(({ key, text }) => localStorage.setItem(key, text),
      { key: DEBUG_PROFILE_LIBRARY_STORAGE_KEY, text: serializeDebugProfileLibrary(library) });
    await page.waitForFunction(() => document.querySelector('[data-testid="game-dev-settings-status"]').textContent.includes('Updated five lanes'));
    await gym.close();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByTestId('game-dev-profile').scrollIntoViewIfNeeded();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    await page.screenshot({ path: 'artifacts/game-menu-dev-settings-phone.png' });
    await page.setViewportSize({ width: 844, height: 390 });
    await page.getByTestId('game-new').click();
    assert.equal(await page.getByTestId('game-developer-tools').getAttribute('open'), '', 'slot selection preserves expanded developer tools');
    await page.getByTestId('game-slot-1').click();
    await page.getByTestId('game-menu').waitFor({ state: 'hidden' });
    const saved = await page.evaluate(async () => JSON.parse(await globalThis.__readSaveSlot(1)));
    assert.equal(saved.state.gameConfig.settings.values.populationPerToken, 14);
    assert.equal(saved.state.gameConfig.lifeMapGenerator.laneCount, 5);
    assert.equal(saved.state.gameConfig.gamepieces.practices.forage.stockCapacity, 6);
    assert.equal(saved.state.world.sites.filter(site => site.neutral).length, 0);
    await page.getByTestId('game-menu-open').click();
    await openDeveloperTools(page);
    await page.getByTestId('game-use-dev-settings').uncheck();
    await page.getByTestId('game-continue').click();
    await page.getByTestId('game-menu').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => __SETTLEMENT_DEBUG__.getSnapshot().gameConfig.lifeMapGenerator.laneCount), 5, 'Continue retains saved custom settings after the toggle is disabled');
    assert.deepEqual(errors, []);
    writeFileSync('artifacts/game-menu-dev-settings-probe.json', JSON.stringify({ ok: true,
      checks: ['saved profile picker', 'preference refresh', 'Gym profile updates invalidate preparation', 'phone layout', 'New Game custom initialization and save', 'Continue isolation'] }));
    console.log('PASS menu dev profile picker, persistence, mobile, New Game and Continue isolation');
  } else {
  await page.goto(url);
  await page.getByTestId('game-new').waitFor();
  await page.waitForFunction(() => !document.querySelector('[data-testid=game-new]').disabled);
  assert.equal(await page.getByTestId('game-continue').count(), 0);
  const draftStorage=new Map(), review=createCardReviewController({storage:{getItem:key=>draftStorage.get(key)??null,setItem:(key,value)=>draftStorage.set(key,value)}});
  review.flag('practice','forage',createAuthoredGameConfig().gamepieces.practices.forage);
  review.edit('practice','forage',['stockCapacity'],7);
  review.edit('practice','forage',['stockTraits'],['Edible','Plant','Water']);
  await page.evaluate(({key,value})=>localStorage.setItem(key,value),{key:CARD_REVIEW_STORAGE_KEY,value:draftStorage.get(CARD_REVIEW_STORAGE_KEY)});
  await openDeveloperTools(page);
  await page.getByTestId('game-use-edited-cards').check();
  assert.match(await page.getByTestId('game-edited-cards-status').textContent(),/1 edited card saved on this device/);
  await page.reload();
  await page.getByTestId('game-new').waitFor();
  await page.waitForFunction(() => !document.querySelector('[data-testid=game-new]').disabled);
  await openDeveloperTools(page);
  assert.equal(await page.getByTestId('game-use-edited-cards').isChecked(),true,'edited-card preference persists across reloads');
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
  const openingAssets = await page.evaluate(() => {
    const view = globalThis.__SETTLEMENT_DEBUG__.getSnapshot().view;
    const sheets = [0, 1, 2].map(index => PIXI.Assets.cache.get(`images/sprite-sheets/settlement-pieces-${index}.json`));
    return { sceneBuilt: !!view, sceneVisible: view?.visible,
      sheetsUploaded: sheets.every(sheet => sheet && Object.values(sheet.textures)
        .every(texture => Object.keys(texture.baseTexture._glTextures).length > 0)) };
  });
  assert.deepEqual(openingAssets, { sceneBuilt: true, sceneVisible: false, sheetsUploaded: true },
    'first settlement scene and all piece atlases are ready before gameplay opens');
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
  assert.equal(saved.state.gameConfig.gamepieces.practices.forage.stockCapacity,7,'New Game snapshots the edited card');
  assert.deepEqual(saved.state.gameConfig.gamepieces.practices.forage.stockTraits,['Edible','Plant','Water']);
  assert.equal(saved.state.world.sites.filter(site => saved.state.world.regions.find(region => region.id === site.regionId)?.controller === 'player').length, 2);
  assert.equal(saved.state.world.sites.filter(site => site.neutral).length, 4);
  await page.getByTestId('game-menu-open').click();
  await openDeveloperTools(page);
  await page.getByTestId('game-use-edited-cards').uncheck();
  await page.getByTestId('game-new').click();
  await page.getByTestId('game-slot-1').click();
  await page.getByTestId('game-replace-confirm').waitFor();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  assert.equal(await page.evaluate(async () => JSON.parse(await globalThis.__readSaveSlot(1)).state.rng.baseSeed), saved.state.rng.baseSeed);
  await page.getByTestId('game-slot-2').click();
  await page.getByTestId('game-menu').waitFor({state:'hidden'});
  assert.equal(await page.evaluate(async()=>JSON.parse(await globalThis.__readSaveSlot(2)).state.gameConfig.gamepieces.practices.forage.stockCapacity),2,'disabled toggle starts with live values');
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
  await checkLoadingDetails(page);
  assert.equal(await page.evaluate(() => globalThis.__saveLoadFrames?.completed), true,
    'built Continue uses the save-load worker');
  assert.ok(await page.evaluate(() => globalThis.__saveLoadFrames.frames > 0),
    'loading animation receives frames while the save is parsed and replayed');
  assert.equal(await page.evaluate(() => !!globalThis.__SETTLEMENT_DEBUG__.getSnapshot().view), true,
    'Continue from storage prepares its settlement scene too');
  assert.equal(await page.evaluate(async()=>JSON.parse(await globalThis.__readSaveSlot(1)).state.gameConfig.gamepieces.practices.forage.stockCapacity),7,'Continue keeps recorded edited definitions while the toggle is off');
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
  assert.equal(diagnostic.loading.phase, 'ready');
  assert.ok(diagnostic.loading.stages.some(stage => stage.stage === 'scene'));
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
  await phone.getByTestId('game-menu').locator('summary').tap();
  await phone.getByTestId('game-use-edited-cards').tap();
  assert.equal(await phone.getByTestId('game-use-edited-cards').isChecked(),true,'portrait phone can enable edited-card mode with a tap');
  const toggleBounds=await phone.locator('.game-edited-cards-toggle').filter({has:phone.getByTestId('game-use-edited-cards')}).boundingBox();
  assert.ok(toggleBounds.height>=44&&toggleBounds.x>=0&&toggleBounds.x+toggleBounds.width<=390,'edited-card toggle has a full-width phone touch target');
  await phone.screenshot({ path: 'artifacts/game-menu-portrait.png' });
  await phone.getByTestId('game-menu').locator('summary').tap();
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
  await phone.setViewportSize({ width: 568, height: 320 });
  assert.deepEqual(await phone.evaluate(() => [...document.querySelectorAll('#game-menu button')]
    .filter(node => node.checkVisibility())
    .filter(node => { const box = node.getBoundingClientRect(); return box.bottom > innerHeight || box.right > innerWidth; })
    .map(node => node.textContent)), [], 'live resume and save controls fit the smallest landscape phone');
  await phone.setViewportSize({ width: 844, height: 390 });
  await phone.reload();
  await phone.getByTestId('game-continue').waitFor();
  const assertMenuFits = async target => {
    const clipped = await target.evaluate(() => [...document.querySelectorAll('#game-menu button, #game-menu h1, #game-menu h2, #game-menu summary, .game-menu-note')]
      .filter(node => node.checkVisibility())
      .filter(node => { const box = node.getBoundingClientRect(); return box.top < 0 || box.left < 0 || box.bottom > innerHeight || box.right > innerWidth; })
      .map(node => node.textContent));
    assert.deepEqual(clipped, [], 'landscape menu controls and copy fit without scrolling');
  };
  for (const size of [{ width: 844, height: 390 }, { width: 667, height: 375 }, { width: 568, height: 320 }]) {
    await phone.setViewportSize(size);
    await assertMenuFits(phone);
    await phone.getByTestId('game-new').click();
    await assertMenuFits(phone);
    await phone.getByRole('button', { name: 'Back', exact: true }).click();
    await phone.getByTestId('game-load').click();
    await assertMenuFits(phone);
    if (size.width === 844) await phone.screenshot({ path: 'artifacts/game-menu-landscape-slots.png' });
    await phone.getByRole('button', { name: 'Back', exact: true }).click();
  }
  await phone.setViewportSize({ width: 844, height: 390 });
  await phone.getByTestId('game-continue').tap();
  await phone.getByTestId('game-menu').waitFor({state:'hidden'});
  assert.deepEqual(await phone.evaluate(() => globalThis.__displayRequests), ['fullscreen', 'landscape'],
    'Continue after reload requests the same phone display mode as New game');
  assert.equal(await phone.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot().runner.baseSeed), phoneHeld.runner.baseSeed);
  await phone.getByTestId('game-menu-open').click();
  await phone.waitForFunction(() => !document.querySelector('[data-testid=game-load]').disabled);
  await phone.getByTestId('game-load').click();
  // A touch gesture also works when a connected mouse is the primary pointer.
  await phone.evaluate(() => {
    globalThis.__displayRequests.length = 0;
    const matchMedia = window.matchMedia.bind(window);
    window.matchMedia = query => {
      const result = matchMedia(query);
      if (query.includes('pointer: coarse')) Object.defineProperty(result, 'matches', { value: false });
      return result;
    };
  });
  await phone.getByTestId('game-slot-1').tap();
  await phone.getByTestId('game-menu').waitFor({state:'hidden'});
  assert.deepEqual(await phone.evaluate(() => globalThis.__displayRequests), ['fullscreen'],
    'saved-slot Continue requests fullscreen from the touch gesture even with a fine primary pointer');

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
    document.exitFullscreen = async () => {
      fullscreenEl = null;
      document.dispatchEvent(new Event('fullscreenchange'));
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
  await hostile.evaluate(() => document.exitFullscreen());
  await hostile.getByTestId('game-menu').waitFor({ state: 'visible' });
  await hostile.waitForFunction(() => document.querySelector('[data-testid=game-save-status]').dataset.phase === 'saved');
  await hostile.reload();
  await hostile.getByTestId('game-continue').tap();
  await hostile.getByTestId('game-menu').waitFor({ state: 'hidden' });
  assert.equal(await hostile.evaluate(() => document.fullscreenElement === document.documentElement), true,
    'Continue from a saved game enters native fullscreen');
  assert.deepEqual(await hostile.evaluate(() => globalThis.__displayRequests), ['fullscreen', 'landscape']);

  assert.deepEqual(errors, []);
  writeFileSync(artifact, JSON.stringify({ ok: true, checks: ['three IndexedDB slots', 'seed preservation', 'reload continue', 'overwrite/cancel', 'transaction failure', 'live export during quota failure', 'diagnostic download', 'invalid import preservation', 'validated import and replacement confirmation', 'save with full localStorage', 'save beyond localStorage quota', 'three-slot transfer with unrelated data preserved', 'blocked storage startup and retry', 'unveil following', 'desktop windowed entry and focus continuity','touch fullscreen entry', 'portrait menu fallback', 'focus pause and memory resume', 'touch entry despite hung lock and lost focus', 'prepared settlement scene and uploaded piece atlases', 'saved phone Continue fullscreen after reload and with a mouse accessory'], screenshots: ['game-menu-desktop.png', 'game-menu-slots.png', 'game-menu-portrait.png','save-recovery-diagnostics.png','save-recovery-phone.png'] }));
  console.log('[probe:game-menu] OK');
  }
} catch (error) {
  const menuStatus = page ? await page.evaluate(() => ({
    menuVisible: !document.querySelector('#game-menu')?.hidden,
    messages: Array.from(document.querySelectorAll('#game-menu [role="status"], #game-menu [role="alert"]')).map(node=>node.textContent),
    loading: document.querySelector('#game-menu h2')?.textContent,
    loadingDetails: document.querySelector('[data-testid="game-loading-details"]')?.textContent,
    vassalPreparation: globalThis.__SETTLEMENT_DEBUG__?.getSnapshot()?.worldMap?.vassalPreparation,
    opening: globalThis.__SETTLEMENT_DEBUG__?.getSnapshot()?.opening,
  })).catch(()=>null) : null;
  writeFileSync(artifact, JSON.stringify({ error: error.stack, pageErrors: errors, menuStatus }));
  console.error(`[probe:game-menu] FAILED: ${error.message.split('\n')[0]}\nReproduce: npm run probe:game-menu\nDetails: ${artifact}`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
}
