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
  assert.deepEqual(await page.evaluate(() => __SETTLEMENT_DEBUG__.getSnapshot().worldMap.vassalPreparation.chooser.portraitStages),
    ['youth','youth','youth'], 'drawer uses the youngest portrait variants');
  await click('getVassalCandidateClickPoint',0);
  await click('getNavigationClickPoint','vassal');
  const node = await page.evaluate(() => __SETTLEMENT_DEBUG__.getSnapshot().lineage.currentVassal.availableNodeIds[0]);
  const session = await page.context().newCDPSession(page);
  await session.send('Profiler.enable'); await session.send('Profiler.start');
  await click('getLifeMapNodeClickPoint',node);
  assert.equal(await page.evaluate(() => __SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.open), false,
    'selecting a candidate leaves the graph unobstructed');
  assert.equal(await point('getLifeMapOptionClickPoint',0), null, 'candidate contents stay hidden');
  const candidateTooltip = await page.evaluate(() => __SETTLEMENT_DEBUG__.getTooltipDebugState());
  assert.equal(candidateTooltip.visible,true,'candidate uses the shared tooltip');
  assert.equal(candidateTooltip.activeChoice,true,'candidate tooltip shows its active-choice border');
  assert.equal(candidateTooltip.pinVisible,false,'candidate tooltip hides the pin glyph');
  assert.equal(candidateTooltip.sourceId,node);
  const enter = await point('getLifeMapEnterNodeClickPoint');
  assert.ok(enter.x > 2000 && enter.y > 900,'entry uses the bottom-right confirm dock');
  await move(enter);
  await delay(80);
  assert.equal(await page.evaluate(() => __SETTLEMENT_DEBUG__.getTooltipDebugState().activeChoice),true,
    'the candidate tooltip persists while moving to Enter');
  await page.keyboard.press('Escape');
  assert.equal(await point('getLifeMapEnterNodeClickPoint'), null, 'Escape clears the candidate');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => __SETTLEMENT_DEBUG__.getSnapshot().lineage.currentVassal.currentNodeId), null,
    'Enter without a selected candidate does not commit');
  await click('getLifeMapNodeClickPoint',node);
  // Reproduce the first-node failure without changing the saved simulation.
  // An explicit preparation error leaves the panel open for real recovery taps;
  // a module-worker failure on Retry must then use the local execution path.
  const beforeEntry=await page.evaluate(()=>__SETTLEMENT_DEBUG__.getSnapshot().runner.timeline.actionCount);
  await page.evaluate(()=>{
    globalThis.__nativeLifeProbeWorker=window.Worker;
    globalThis.__lifeProbeFailure='validation';
    window.Worker=function(url,options){
      if(String(url).includes('life-decision-worker')) {
        if(globalThis.__lifeProbeFailure==='unavailable')throw new Error('module workers unavailable');
        return {terminate(){},postMessage(message){queueMicrotask(()=>this.onmessage?.({data:{
          kind:'error',reason:'probe preparation failure',requestId:message.requestId,
        }}));}};
      }
      return new globalThis.__nativeLifeProbeWorker(url,options);
    };
  });
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => __SETTLEMENT_DEBUG__.getSnapshot().lifeMap.entryConfirmationOpen),true);
  assert.equal(await page.evaluate(() => __SETTLEMENT_DEBUG__.getSnapshot().lineage.currentVassal.currentNodeId),null,
    'Enter opens confirmation without entering the node');
  await page.screenshot({path:`${output}/entry-confirmation.png`});
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => __SETTLEMENT_DEBUG__.getSnapshot().lifeMap.entryConfirmationOpen),false);
  await click('getLifeMapNodeClickPoint',node);
  await page.keyboard.press('Enter');
  const cancelPoint = await page.evaluate(() => __SETTLEMENT_DEBUG__.getSnapshot().lifeMap.entryCancelPoint);
  await move(cancelPoint); await page.mouse.down(); await page.mouse.up(); await delay(180);
  assert.equal(await page.evaluate(() => __SETTLEMENT_DEBUG__.getSnapshot().lineage.currentVassal.currentNodeId),null,
    'Cancel leaves the candidate unentered');
  assert.equal(await page.evaluate(() => __SETTLEMENT_DEBUG__.getSnapshot().lifeMap.entryConfirmationOpen),false);
  await page.keyboard.press('Enter');
  await click('getLifeMapEnterNodeClickPoint');
  await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().worldMap.lifeDecisionProcessing?.phase==='error');
  await page.setViewportSize({width:844,height:390});
  await delay(250);
  const recoveryTap=async(method,arg)=>{
    await page.waitForFunction(({method,arg}) => __SETTLEMENT_DEBUG__[method](arg), {method,arg});
    const p=await point(method,arg);assert.ok(p,'recovery control available');
    const box=await page.locator('canvas').boundingBox();
    await page.touchscreen.tap(box.x+p.x*box.width/2424,box.y+p.y*box.height/1080);
  };
  await recoveryTap('getLifeDecisionControlClickPoint','back');
  await page.waitForFunction(()=>!__SETTLEMENT_DEBUG__.getSnapshot().worldMap.lifeDecisionProcessing);
  assert.equal(await page.evaluate(()=>__SETTLEMENT_DEBUG__.getSnapshot().runner.timeline.actionCount),beforeEntry,
    'Go back receives taps above the node panel and does not record a failed entry');
  await recoveryTap('getLifeMapEnterNodeClickPoint');
  await page.waitForFunction(()=>__SETTLEMENT_DEBUG__.getSnapshot().worldMap.lifeDecisionProcessing?.phase==='error');
  await page.evaluate(()=>{globalThis.__lifeProbeFailure='unavailable';});
  await recoveryTap('getLifeDecisionControlClickPoint','retry');
  await page.waitForFunction(()=>!__SETTLEMENT_DEBUG__.getSnapshot().worldMap.lifeDecisionProcessing);
  assert.equal(await page.evaluate(()=>__SETTLEMENT_DEBUG__.getSnapshot().lineage.currentVassal.currentNodeId),node,
    'Retry receives taps above the node panel and recovers an unavailable worker');
  assert.equal(await page.evaluate(()=>__SETTLEMENT_DEBUG__.getSnapshot().runner.timeline.actionCount),beforeEntry+1,
    'recovery accepts the first entry exactly once');
  await page.evaluate(()=>{window.Worker=globalThis.__nativeLifeProbeWorker;});
  await page.setViewportSize({width:1280,height:800});
  await delay(250);
  await page.waitForFunction(() => !!__SETTLEMENT_DEBUG__.getLifeMapOptionClickPoint(0), null, {timeout:5000});
  await page.waitForFunction(() => !__SETTLEMENT_DEBUG__.getSnapshot().worldMap.lifeDecisionProcessing);
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
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  // Use actual touch input: mouse holds and completed taps cannot prove that a
  // phone paints the held state, especially on the card face above its footer.
  const mobileBox = await page.locator('canvas').boundingBox();
  const mobileCard = await page.evaluate(() => __SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.costPanels[0].cardRect);
  const facePoint = {x:mobileBox.x+(mobileCard.x+mobileCard.width/2)*mobileBox.width/2424,
    y:mobileBox.y+(mobileCard.y+60)*mobileBox.height/1080};
  const outsidePoint = {x:facePoint.x, y:mobileBox.y+(mobileCard.y-20)*mobileBox.height/1080};
  const touch = (type, p) => session.send('Input.dispatchTouchEvent', {
    type, touchPoints:p ? [{...p,id:1,radiusX:6,radiusY:6,force:1}] : [],
  });
  await touch('touchStart',facePoint);
  await delay(180);
  assert.equal(await page.evaluate(() => __SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.costPanels[0].cardInteractionState),
    'pressed','holding the card face on a phone must paint pressed feedback');
  await page.screenshot({path:`${output}/mobile-held.png`});
  await touch('touchCancel');
  assert.equal(await page.evaluate(() => __SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.costPanels[0].cardInteractionState),'idle');
  await touch('touchStart',facePoint);
  await touch('touchMove',outsidePoint);
  assert.equal(await page.evaluate(() => __SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.costPanels[0].cardInteractionState),'idle',
    'dragging a held touch off the card clears its pressed state');
  await touch('touchEnd');
  assert.equal(await page.evaluate(() => __SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.inspectedCardId),null,
    'dragging off cancels inspection');
  await touch('touchStart',outsidePoint);
  await touch('touchMove',facePoint);
  assert.equal(await page.evaluate(() => __SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.costPanels[0].cardInteractionState),
    'pressed','dragging a held touch onto the card gives visual feedback');
  await touch('touchEnd');
  assert.equal(await page.evaluate(() => __SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.inspectedCardId),null,
    'dragging in does not activate inspection');
  assert.equal(await page.evaluate(() => __SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.selectedOptionId),selected.selectedOptionId,
    'dragging in does not select a different option');
  const touchPoint = await point('getLifeMapOptionClickPoint',0);
  const box = await page.locator('canvas').boundingBox();
  await touch('touchStart',{x:box.x+touchPoint.x*box.width/2424,y:box.y+touchPoint.y*box.height/1080});
  await delay(100);
  assert.equal(await page.evaluate(() => __SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.costPanels[0].interactionState),'pressed',
    'the cost footer also acknowledges a held touch');
  await touch('touchCancel');
  await page.evaluate(() => window.addEventListener('touchend', () => requestAnimationFrame(() => {
    globalThis.__QUICK_TAP_FEEDBACK__ = __SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.tapFeedback;
  }), {once:true}));
  await page.touchscreen.tap(box.x+touchPoint.x*box.width/2424,box.y+touchPoint.y*box.height/1080);
  await page.waitForFunction(() => globalThis.__QUICK_TAP_FEEDBACK__ !== undefined);
  assert.ok(await page.evaluate(() => __QUICK_TAP_FEEDBACK__.every(f=>f.controlBound)),
    'a quick choice tap must not leave a detached rectangle above the screen');
  await delay(200);
  await page.screenshot({path:`${output}/mobile.png`});
  await page.waitForFunction(() => !__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.interactionPending);
  assert.ok(await page.evaluate(() => __SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.selectedOptionId));
  // Reach an earned level through ordinary node confirmations. This also exercises
  // worker-prepared entries across several resolution boundaries.
  let earnedLevel = false;
  for (let turn=0; turn<8 && !earnedLevel; turn++) {
    if (turn===0) {
      const confirm = await point('getLifeMapConfirmClickPoint');
      const confirmTouch = {x:box.x+confirm.x*box.width/2424,y:box.y+confirm.y*box.height/1080};
      await touch('touchStart',confirmTouch);
      await page.screenshot({path:`${output}/mobile-confirm-held.png`});
      await touch('touchCancel');
      await page.evaluate(() => window.addEventListener('touchend', () => requestAnimationFrame(() => {
        const s=__SETTLEMENT_DEBUG__.getSnapshot();
        globalThis.__CONFIRM_TAP_FEEDBACK__ = {feedback:s.lifeMapDecision.tapFeedback,processing:s.worldMap.lifeDecisionProcessing};
      }), {once:true}));
      await touch('touchStart',confirmTouch);
      await touch('touchEnd');
      await page.waitForFunction(() => !!globalThis.__CONFIRM_TAP_FEEDBACK__);
      assert.ok(await page.evaluate(() => __CONFIRM_TAP_FEEDBACK__.feedback.every(f=>f.controlBound)),
        'Confirm feedback must remain attached to the closing button');
      assert.ok(await page.evaluate(() => globalThis.__CONFIRM_TAP_FEEDBACK__.processing),
        'confirmation immediately shows screen-level processing feedback');
      await page.setViewportSize({width:1280,height:800});
      await delay(250);
    } else await click('getLifeMapConfirmClickPoint');
    await page.waitForFunction(() => __SETTLEMENT_DEBUG__.getSnapshot().lifeMapRecap.open, null, {timeout:15000});
    const completed = await page.evaluate(() => {
      const s=__SETTLEMENT_DEBUG__.getSnapshot();
      return {processing:s.worldMap.lifeDecisionProcessing,level:s.lifeMapRecap.recap.queuedLevelUp,
        ended:s.lifeMapRecap.recap.endedReason};
    });
    assert.equal(completed.processing,null,'recap opens with all required preparation complete');
    assert.equal(completed.ended,null,'young fixture survives its early choices');
    if (turn === 0) {
      await page.waitForFunction(() => __SETTLEMENT_DEBUG__.getSnapshot().lifeMapRecap.clock?.locked);
      const clock = await page.evaluate(() => __SETTLEMENT_DEBUG__.getSnapshot().lifeMapRecap);
      assert.equal(clock.clock.second,clock.recap.clock.toSec, 'clock locks into the exact committed time');
      assert.deepEqual(clock.clock.labels, ['Year', 'Moon', 'Phase'], 'recap teaches all three time icons');
      await page.screenshot({path:`${output}/clock-recap-1280x800.png`});
      await page.setViewportSize({width:844,height:390}); await delay(250);
      await page.screenshot({path:`${output}/clock-recap-844x390.png`});
      await page.setViewportSize({width:1280,height:800}); await delay(250);
    }
    await click('getLifeMapRecapDismissClickPoint');
    earnedLevel = completed.level;
    if (earnedLevel) break;
    const next = await page.evaluate(() => __SETTLEMENT_DEBUG__.getSnapshot().lineage.currentVassal.availableNodeIds[0]);
    const beforeEntry = await page.evaluate(() => __SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision);
    const beforeComparison = await page.evaluate(() => {
      const s=__SETTLEMENT_DEBUG__.getSnapshot();
      return {lineage:s.lineage,timeline:s.runner.timeline,second:s.frontierSec};
    });
    const other = await page.evaluate(next => __SETTLEMENT_DEBUG__.getSnapshot()
      .lineage.currentVassal.availableNodeIds.find(id => id !== next),next);
    if (other) {
      await click('getLifeMapNodeClickPoint',other);
      assert.equal(await page.evaluate(() => __SETTLEMENT_DEBUG__.getSnapshot().lifeMap.candidateNodeId),other);
    }
    await click('getLifeMapNodeClickPoint',next);
    assert.equal(await page.evaluate(() => __SETTLEMENT_DEBUG__.getSnapshot().lifeMap.candidateNodeId),next);
    assert.equal(await page.evaluate(() => __SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.open), false);
    assert.equal(await point('getLifeMapOptionClickPoint',0),null,'comparison exposes no options');
    assert.equal(await point('getLifeMapOfferClickPoint',0),null,'comparison exposes no offers');
    assert.deepEqual(await page.evaluate(() => {
      const s=__SETTLEMENT_DEBUG__.getSnapshot();
      return {lineage:s.lineage,timeline:s.runner.timeline,second:s.frontierSec};
    }),beforeComparison,'comparing candidates changes no simulation state or history');
    const nextPoint = await point('getLifeMapNodeClickPoint',next);
    const canvas = await page.locator('canvas').boundingBox();
    await page.mouse.dblclick(canvas.x + nextPoint.x * canvas.width / 2424,
      canvas.y + nextPoint.y * canvas.height / 1080, {delay:80});
    assert.equal(await page.evaluate(() => __SETTLEMENT_DEBUG__.getSnapshot().lifeMap.entryConfirmationOpen),true,
      'double-click requires an explicit confirmation too');
    await click('getLifeMapEnterNodeClickPoint');
    // Measure entry reuse without also opening a mouse-hover choice preview.
    // The node's position can fall under one of the newly displayed cards.
    await page.mouse.move(5,5);
    await page.waitForFunction(() => __SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision.open);
    await page.waitForFunction(() => !__SETTLEMENT_DEBUG__.getSnapshot().worldMap.lifeDecisionProcessing);
    const afterEntry = await page.evaluate(() => __SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision);
    assert.equal(afterEntry.layoutBuilds,beforeEntry.layoutBuilds,'prepared node entry must not rebuild its graphics');
    assert.ok(afterEntry.preparedLayoutHits>=beforeEntry.preparedLayoutHits+1,
      'entered choices reuse the prepared screen');
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
