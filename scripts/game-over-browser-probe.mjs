import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { BROWSER_PROBE_LAUNCH_OPTIONS } from './browser-probe-config.mjs';
import { createNewGameState } from '../src/model/new-game.js';
import { createTimelineFromInitialState, rebuildStateAtSecond } from '../src/model/timeline/index.js';
import { serializeGameState } from '../src/model/state.js';
import { buildSaveMeta, serializeTimelineForSave } from '../src/controllers/sim-runner/save-slots.js';

const url = 'http://127.0.0.1:18186';
const output = 'artifacts/game-over';
mkdirSync(output, {recursive:true});
const server = spawn(process.execPath, ['node_modules/serve/bin/serve.js','-l','18186','--no-clipboard','dist'],
  {stdio:'ignore',windowsHide:true});
let browser, page;
const errors = [];
const initial = createNewGameState(123);
initial.civilization.chaos.monsterCount = 100;
const timeline = createTimelineFromInitialState(initial);
timeline.historyEndSec = timeline.maxReachedHistoryEndSec = timeline.cursorSec = 4;
const terminal = rebuildStateAtSecond(timeline, 4);
assert.equal(terminal.ok, true);
assert.equal(terminal.state.runStatus.complete, true);
const save = { meta:buildSaveMeta(terminal.state,'twoRegionStarter01'),
  state:serializeGameState(terminal.state), timeline:serializeTimelineForSave(timeline) };
async function click(id, touch = false) {
  const point = await page.evaluate(id => globalThis.__SETTLEMENT_DEBUG__.getRunCompleteClickPoint(id), id);
  assert.ok(point, `${id} has a visible target`);
  const box = await page.locator('canvas').boundingBox();
  const x = box.x + point.x / 2424 * box.width;
  const y = box.y + point.y / 1080 * box.height;
  if (touch) await page.touchscreen.tap(x,y);
  else await page.mouse.click(x,y);
  await delay(150);
}
try {
  for (let i=0;i<100;i++) { try { if ((await fetch(url)).ok) break; } catch {} await delay(100); }
  browser = await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
  page = await browser.newPage({viewport:{width:1280,height:800},hasTouch:true});
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(save => {
    localStorage.setItem('civsurvivor.save.slot1',JSON.stringify(save));
    Element.prototype.requestFullscreen = async () => {};
    screen.orientation.lock = async () => {};
  }, save);
  await page.goto(url);
  await page.getByTestId('game-continue').click();
  await page.waitForFunction(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot().runComplete?.open === true);
  const info = await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot().runComplete.info);
  assert.equal(info.projected, false);
  assert.match(info.explanation, /loss limit of 100/);
  await page.keyboard.press('Space');
  assert.equal(await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot().playbackTarget), 0);
  await page.screenshot({path:`${output}/popup-1280x800.png`});
  await click('browse');
  await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.browseSecond(0));
  await page.waitForFunction(() => {
    const s = globalThis.__SETTLEMENT_DEBUG__.getSnapshot();
    return s.runComplete.indicatorVisible && !s.runComplete.open && s.viewedSec === 0
      && s.worldMap.survivalTracker.actualLossYear === 1;
  });
  await page.screenshot({path:`${output}/history-1280x800.png`});
  await page.setViewportSize({width:844,height:390});
  await delay(250);
  await click('details', true);
  await page.screenshot({path:`${output}/popup-844x390.png`});
  await click('browse', true);
  await page.screenshot({path:`${output}/history-844x390.png`});
  await click('details', true);
  await click('newGame', true);
  await page.getByRole('heading', {name:'Choose a slot for your new game'}).waitFor();
  assert.equal(await page.locator('.game-save-slot').count(), 3);
  await page.getByTestId('game-slot-3').click();
  await page.getByTestId('game-menu').waitFor({state:'hidden'});
  assert.equal(await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot().runComplete.indicatorVisible), false,
    'starting a new game clears the prior loss');
  await page.close();
  page = await browser.newPage({viewport:{width:1280,height:800}});
  page.on('pageerror', error => errors.push(error.message));
  const forecastTimeline = createTimelineFromInitialState(initial);
  const forecastSave = {meta:buildSaveMeta(initial,'twoRegionStarter01'),state:serializeGameState(initial),
    timeline:serializeTimelineForSave(forecastTimeline)};
  await page.addInitScript(save => localStorage.setItem('civsurvivor.save.slot1',JSON.stringify(save)),forecastSave);
  await page.goto(url);
  await page.getByTestId('game-continue').click();
  await page.waitForFunction(() => {
    const loss = globalThis.__SETTLEMENT_DEBUG__.getSnapshot().runComplete;
    return loss.open && loss.info.projected;
  },null,{timeout:15000});
  assert.equal(await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getRunCompleteClickPoint('newGame')), null,
    'a foreseen extinction offers no new-game action');
  await page.screenshot({path:`${output}/foreseen-extinction.png`});
  await click('browse');
  await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.browseSecond(0));
  assert.equal(await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot().runComplete.indicatorVisible),true);
  const selected = await page.evaluate(() => {
    const api = globalThis.__SETTLEMENT_DEBUG__;
    api.openNextSelection();
    return api.selectCandidate(0);
  });
  assert.equal(selected.ok,true);
  await page.waitForFunction(() => !globalThis.__SETTLEMENT_DEBUG__.getSnapshot().runComplete.indicatorVisible);
  assert.deepEqual(errors, []);
  writeFileSync(`${output}/probe.json`, JSON.stringify({ok:true,info},null,2));
  console.log(`[probe:game-over] OK: automatic popup, reason, history badge, touch, new-game slots; ${output}`);
} catch (error) {
  await page?.screenshot({path:`${output}/failure.png`}).catch(()=>{});
  const snapshot = await page?.evaluate(() => {
    const s = globalThis.__SETTLEMENT_DEBUG__?.getSnapshot();
    return s && {frontierSec:s.frontierSec,viewedSec:s.viewedSec,forecastStatus:s.forecastStatus,
      graph:s.graph,runner:s.runner,runComplete:s.runComplete};
  }).catch(()=>null);
  writeFileSync(`${output}/probe.json`, JSON.stringify({error:error.stack,errors,snapshot},null,2));
  console.error(`[probe:game-over] FAILED: ${error.message}\nReproduce: node scripts/game-over-browser-probe.mjs\nDetails: ${output}/probe.json`);
  process.exitCode = 1;
} finally { await browser?.close(); server.kill(); }
