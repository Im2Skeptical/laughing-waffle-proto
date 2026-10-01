import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { BROWSER_PROBE_LAUNCH_OPTIONS } from './browser-probe-config.mjs';
const output = 'artifacts/life-map-interaction';
mkdirSync(output, { recursive: true });
const server = spawn(process.execPath, ['./node_modules/serve/bin/serve.js', '-l', '18095', '--no-clipboard', 'dist'], { stdio: 'ignore', windowsHide: true });
let browser, page;
const errors = [];
try {
  for (let i=0;i<100;i++) { try { if ((await fetch('http://localhost:18095')).ok) break; } catch {} await delay(100); }
  browser = await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
  page = await browser.newPage({ viewport: {width:1280,height:800}, hasTouch:true });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('civsurvivor.debugProfiles.boot.v2','probe-authored-setup'));
  await page.goto('http://localhost:18095');
  await page.waitForFunction(() => !!globalThis.__SETTLEMENT_DEBUG__?.enterBootTestRun);
  await page.evaluate(() => __SETTLEMENT_DEBUG__.enterBootTestRun());
  const point = (method,arg) => page.evaluate(({method,arg}) => __SETTLEMENT_DEBUG__[method](arg), {method,arg});
  const move = async p => { assert.ok(p, "control point unavailable"); const b=await page.locator('canvas').boundingBox(); await page.mouse.move(b.x+p.x*b.width/2424,b.y+p.y*b.height/1080); };
  const click = async (method,arg) => {await move(await point(method,arg)); await page.mouse.down(); await page.mouse.up(); await delay(180);};
  await page.waitForFunction(() => __SETTLEMENT_DEBUG__.getSnapshot().navigation?.time.mode==='projection');
  await click('getNavigationClickPoint','present');
  await click('getNavigationClickPoint','vassal');
  await click('getVassalCandidateClickPoint',0);
  await click('getNavigationClickPoint','vassal');
  const node = await page.evaluate(() => __SETTLEMENT_DEBUG__.getSnapshot().lineage.currentVassal.availableNodeIds[0]);
  const session = await page.context().newCDPSession(page);
  await session.send('Profiler.enable'); await session.send('Profiler.start');
  await click('getLifeMapNodeClickPoint',node);
  await page.waitForFunction(() => __SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.animation.phase==='open');
  await click('getLifeMapEnterNodeClickPoint');
  await page.waitForFunction(() => !!__SETTLEMENT_DEBUG__.getLifeMapOptionClickPoint(0), null, {timeout:5000});
  await delay(500);
  const {profile} = await session.send('Profiler.stop');
  writeFileSync(`${output}/click-profile.json`,JSON.stringify(profile));
  const counts = new Map(); for (const id of profile.samples??[]) counts.set(id,(counts.get(id)??0)+1);
  const hotspots=profile.nodes.map(n=>({name:n.callFrame.functionName,samples:counts.get(n.id)??0})).sort((a,b)=>b.samples-a.samples).slice(0,12);
  writeFileSync(`${output}/hotspots.json`,JSON.stringify(hotspots,null,2));
  const beforeSelection = await page.evaluate(() => __SETTLEMENT_DEBUG__.getSnapshot().runner.timeline);
  await move(await point('getLifeMapOptionClickPoint',0));
  await page.mouse.down(); await delay(180);
  const held=await page.evaluate(() => __SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision);
  await page.screenshot({path:`${output}/pressed.png`});
  assert.equal(held.costPanels[0].interactionState,'pressed','a held option must visibly acknowledge pointer down');
  await page.evaluate(() => window.addEventListener('pointerup', () => requestAnimationFrame(() => {
    globalThis.__HELD_OPTION_RELEASE_STATE__ = __SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.costPanels[0]?.interactionState;
  }), {once:true}));
  await page.mouse.up();
  await page.waitForFunction(() => !!__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.selectedOptionId);
  assert.notEqual(await page.evaluate(() => globalThis.__HELD_OPTION_RELEASE_STATE__), 'pending', 'draft selection needs no loading label');
  const selected=await page.evaluate(() => __SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision);
  assert.ok(selected.selectedOptionId,'release stages the option');
  assert.deepEqual(await page.evaluate(() => __SETTLEMENT_DEBUG__.getSnapshot().runner.timeline),beforeSelection,
    'draft selection neither appends actions nor rebuilds the timeline');
  const timelineBefore = await page.evaluate(() => __SETTLEMENT_DEBUG__.getSnapshot().runner.timeline);
  await move(await point('getLifeMapOptionClickPoint',0));
  await page.mouse.down();
  await page.mouse.move(5,5);
  await page.mouse.up();
  assert.deepEqual(await page.evaluate(() => __SETTLEMENT_DEBUG__.getSnapshot().runner.timeline), timelineBefore, 'sliding off cancels activation');
  await page.setViewportSize({width:844,height:390});
  await delay(200);
  const touchPoint = await point('getLifeMapOptionClickPoint',0);
  const box = await page.locator('canvas').boundingBox();
  await page.touchscreen.tap(box.x+touchPoint.x*box.width/2424,box.y+touchPoint.y*box.height/1080);
  await delay(200);
  await page.screenshot({path:`${output}/mobile.png`});
  await page.waitForFunction(() => !__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.interactionPending);
  assert.ok(await page.evaluate(() => __SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.selectedOptionId));
  // Reach an earned level through ordinary node confirmations. This also exercises
  // worker-prepared entries across several resolution boundaries.
  await page.setViewportSize({width:1280,height:800});
  await delay(250);
  let earnedLevel = false;
  for (let turn=0; turn<8 && !earnedLevel; turn++) {
    await click('getLifeMapConfirmClickPoint');
    await page.waitForFunction(() => __SETTLEMENT_DEBUG__.getSnapshot().lifeMapRecap.open, null, {timeout:15000});
    const completed = await page.evaluate(() => {
      const s=__SETTLEMENT_DEBUG__.getSnapshot();
      return {processing:s.worldMap.lifeDecisionProcessing,level:s.lifeMapRecap.recap.queuedLevelUp,
        ended:s.lifeMapRecap.recap.endedReason};
    });
    assert.equal(completed.processing,null,'recap opens with all required preparation complete');
    assert.equal(completed.ended,null,'young fixture survives its early choices');
    await click('getLifeMapRecapDismissClickPoint');
    earnedLevel = completed.level;
    if (earnedLevel) break;
    const next = await page.evaluate(() => __SETTLEMENT_DEBUG__.getSnapshot().lineage.currentVassal.availableNodeIds[0]);
    await click('getLifeMapNodeClickPoint',next);
    await page.waitForFunction(() => __SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.animation.phase==='open');
    await click('getLifeMapEnterNodeClickPoint');
    await page.waitForFunction(() => !__SETTLEMENT_DEBUG__.getSnapshot().worldMap.lifeDecisionProcessing);
    const available = await page.evaluate(() => {
      const d=__SETTLEMENT_DEBUG__,s=d.getSnapshot().lifeMapDecision;
      return s.costPanels.findIndex((panel,index)=>panel.interactionState!=='disabled' && d.getLifeMapOptionClickPoint(index));
    });
    if (available>=0) await click('getLifeMapOptionClickPoint',available);
  }
  assert.equal(earnedLevel,true,'fixture earns a level');
  await page.waitForFunction(() => __SETTLEMENT_DEBUG__.getSnapshot().lifeMapLevelUp.open);
  const levelBefore=await page.evaluate(() => __SETTLEMENT_DEBUG__.getSnapshot().runner.timeline);
  await move(await point('getLifeMapLevelUpChoiceClickPoint',0));
  await page.mouse.down(); await delay(100);
  assert.equal(await page.evaluate(() => __SETTLEMENT_DEBUG__.getSnapshot().lifeMapLevelUp.choiceStates[0]),'pressed');
  await page.mouse.up();
  await page.waitForFunction(() => !!__SETTLEMENT_DEBUG__.getSnapshot().lifeMapLevelUp.selectedStatId);
  assert.deepEqual(await page.evaluate(() => __SETTLEMENT_DEBUG__.getSnapshot().runner.timeline),levelBefore,
    'level-up selection is local until Confirm');
  await page.screenshot({path:`${output}/level-up.png`});
  await click('getLifeMapLevelUpConfirmClickPoint');
  await page.waitForFunction(() => !__SETTLEMENT_DEBUG__.getSnapshot().worldMap.lifeDecisionProcessing);
  assert.equal(await page.evaluate(() => __SETTLEMENT_DEBUG__.getSnapshot().runner.timeline.actionCount),levelBefore.actionCount+1,
    'level-up commits exactly once');
  assert.deepEqual(errors, [], 'no browser errors during Life Map interactions');
  console.log('PASS Life Map drafts, held feedback, prepared resolution/entries and level-up; profile: '+output);
 } catch(error) {
  const failureState = await page?.evaluate(() => {
    const s=globalThis.__SETTLEMENT_DEBUG__?.getSnapshot();
    return s && {frontier:s.frontierSec,viewed:s.viewedSec,processing:s.worldMap.lifeDecisionProcessing,
      decision:s.lifeMapDecision,recap:s.lifeMapRecap,level:s.lifeMapLevelUp};
  }).catch(()=>null);
  writeFileSync(`${output}/failure-state.json`,JSON.stringify({errors,failureState},null,2));
  writeFileSync(`${output}/failure.txt`,error.stack); await page?.screenshot({path:`${output}/failure.png`}); console.error(error.message); process.exitCode=1; }
finally { await browser?.close(); server.kill(); }
