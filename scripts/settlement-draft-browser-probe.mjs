import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { BROWSER_PROBE_LAUNCH_OPTIONS } from './browser-probe-config.mjs';

const portProbe=createServer();
await new Promise(resolve=>portProbe.listen(0,'127.0.0.1',resolve));
const port=portProbe.address().port;
await new Promise(resolve=>portProbe.close(resolve));
const url=`http://127.0.0.1:${port}`, artifact='artifacts/settlement-draft-browser-probe.json';
mkdirSync('artifacts',{recursive:true});
writeFileSync('artifacts/settlement-draft-probe.html','<!doctype html><base href="/"><style>body{margin:0;background:#111817}canvas{width:100vw;max-height:100vh;object-fit:contain;display:block}</style>');
const server=spawn(process.execPath,['node_modules/serve/bin/serve.js','-l',String(port),'--no-clipboard','.'],{stdio:'ignore',windowsHide:true});
let browser,page;const errors=[],checks=[];
const returnOnly=process.argv.includes('--construction-return');
const replacementOnly=process.argv.includes('--practice-replacement');
try {
  for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{}await delay(100);}
  browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
  for(const mobile of [false,true]) for(const kind of replacementOnly?['practice']:returnOnly?['structure']:['practice','structure']) {
    page=await browser.newPage({viewport:mobile?{width:844,height:390}:{width:1280,height:800},hasTouch:mobile});
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url+'/artifacts/settlement-draft-probe.html');
    await page.addScriptTag({url:'https://cdn.jsdelivr.net/npm/pixi.js@7.2.4/dist/pixi.min.js'});
    await page.evaluate(async kind=>{
      const [{createInitialState},{ActionKinds:K,applyAction},life,layout,defs,timeline,art,{createVassalNodeDecisionModalView}]=await Promise.all([
        import('/src/model/init.js'),import('/src/model/actions.js'),import('/src/model/vassal-life-map.js'),
        import('/src/model/structure-layout.js'),import('/src/defs/gamepieces/detailed-settlement-defs.js'),
        import('/src/model/timeline/index.js'),import('/src/views/chronicle-art.js'),import('/src/views/vassal-node-decision-modal-pixi.js')]);
      const state=createInitialState('devPlaytesting01',422);state.paused=true;state.phase='planning';
      applyAction(state,{kind:K.SETTLEMENT_SELECT_VASSAL,payload:{candidateIndex:0,expectedPoolHash:life.getVassalCandidatePool(state).expectedPoolHash}},{isReplay:true});
      const v=life.getCurrentLifeMapVassal(state);v.prestige=1000;v.classId=null;
      const nodeId=v.lifeMap.graph.nodes.find(n=>n.family==='publicWorks').id;v.lifeMap.availableNodeIds=[nodeId];
      applyAction(state,{kind:K.VASSAL_ENTER_LIFE_NODE,payload:{nodeId}},{isReplay:true});
      v.lifeMap.nodeStates[nodeId].shopSelection.selectedTag='Housing';
      const site=state.world.sites.find(s=>s.regionId===v.locationRegionId).detailedState;
      state.world.regions.find(r=>r.id===v.locationRegionId).structureCapacity=8;
      site.structureSlots=layout.normalizeStructureLayout([{structureId:'granary'},{structureId:'mudHouses'},null,null,{structureId:'timberHouse'}],8,id=>defs.settlementStructureDefs[id]);
      site.practiceSlots=[...['forage','pastoralism','logging','surfaceMining','barter'].map(practiceId=>({practiceId,tier:'bronze',stock:2,charge:0,work:0}))];
      site.practiceSlots[4].stock=4;
      const actions=kind==='practice'?[
        {kind,mode:'learn',practiceId:'dryFarming',resultingTier:'bronze'},
        {kind,mode:'learn',practiceId:'quarrying',resultingTier:'bronze'},
        {kind,mode:'upgrade',practiceId:'forage',tier:'bronze',resultingTier:'silver'},
      ]:[
        {kind,mode:'add',structureId:'workshop',tier:'bronze'},
        {kind,mode:'add',structureId:'greatDwelling',tier:'bronze'},
        {kind,mode:'add',structureId:'longhouse',tier:'bronze'},
        {kind,mode:'add',structureId:'granary',tier:'bronze'},
      ];
      v.lifeMap.nodeStates[nodeId].inventory=actions.map((intervention,i)=>({offerId:'fixture:'+i,inventoryIndex:i,label:intervention.practiceId??intervention.structureId,basePrestigeCost:10,basePhaseCost:1,baseCurrencyCost:kind==='structure'?1:0,intervention:{...intervention,targetRegionId:v.locationRegionId}}));
      const line=timeline.createTimelineFromInitialState(state), results=[];
      const dispatch=(kind,payload)=>{
        const replayAction={kind,payload,tSec:0};
        const result=applyAction(state,replayAction,{isReplay:true});
        if(result.ok)timeline.appendActionAtCursor(line,replayAction,state);
        results.push(result);return result;
      };
      const app=new PIXI.Application({width:2424,height:1080,background:0x111817,antialias:true});document.body.append(app.view);art.preloadChronicleArt();
      let animationClock=null;
      const view=createVassalNodeDecisionModalView({app,layer:app.stage,getState:()=>state,
        getAnimationTime:()=>animationClock??performance.now(),
        getPresentation:()=>({vassal:v,readOnly:false,viewedSec:0,frontierSec:0}),
        getDecisionPresentation:(_id,preview)=>life.getVassalNodeDecisionPresentation(state,nodeId,preview),
        onPurchaseOffer:(nodeId,offerId,origin,toIndex,replacePracticeId)=>dispatch(K.VASSAL_PURCHASE_SHOP_OFFER,{nodeId,offerId,origin,toIndex,replacePracticeId}),
        onUndoPurchase:(nodeId,offerId)=>dispatch(K.VASSAL_UNDO_SHOP_PURCHASE,{nodeId,offerId}),
        onReorderPurchase:(nodeId,offerId,toIndex)=>dispatch(K.VASSAL_REORDER_SHOP_PURCHASE,{nodeId,offerId,toIndex}),
        onMoveStructure:(nodeId,offerId,origin)=>dispatch(K.VASSAL_MOVE_SHOP_STRUCTURE,{nodeId,offerId,origin}),
        onConfirmNode:nodeId=>dispatch(K.VASSAL_CONFIRM_LIFE_NODE,{nodeId}),
      });
      view.open(nodeId);app.ticker.add(()=>view.update());
      globalThis.probe={view,results,snapshot:()=>view.getSemanticSnapshot(),confirmed:()=>({practices:site.practiceSlots,structures:site.structureSlots}),
        freezeAnimation:()=>{animationClock=performance.now();},
        advanceAnimation:ms=>{animationClock+=ms;view.update();app.renderer.render(app.stage);},
        resumeAnimation:()=>{animationClock=null;},
        costs:()=>{const d=life.getVassalNodeDecisionPresentation(state,nodeId);return {currency:d.settlement.currency,phases:d.mortalityEstimate.totalPhaseCost};},
        undoAfterConfirm:offerId=>dispatch(K.VASSAL_UNDO_SHOP_PURCHASE,{nodeId,offerId}),
        replay:()=>{const r=timeline.rebuildStateAtSecond(line,0);const s=r.state.world.sites.find(s=>s.regionId===v.locationRegionId).detailedState;return {ok:r.ok,practices:s.practiceSlots,structures:s.structureSlots};}};
    },kind);
    const point=async(method,index)=>{
      if (['getOfferFacePoint','getOfferClickPoint','getUndoClickPoint'].includes(method)) {
        const before=await page.evaluate(()=>probe.snapshot());
        const id=method==='getOfferFacePoint' ? 'fixture:'+index
          : method==='getUndoClickPoint' ? [...before.purchaseOrder].sort((a,b)=>Number(a.split(':')[1])-Number(b.split(':')[1]))[index] : before.offers[index]?.offerId;
        for(let attempt=0;attempt<4;attempt++) {
          const s=await page.evaluate(()=>probe.snapshot());
          if(s.visibleOfferIds.includes(id)) {
            const visible=method==='getOfferFacePoint'||kind==='structure'&&method==='getOfferClickPoint' ? s.visibleOfferIds
              : s.visibleOfferIds.filter(offerId=>method==='getUndoClickPoint' ? s.purchaseOrder.includes(offerId) : !s.purchaseOrder.includes(offerId));
            return page.evaluate(([m,i])=>probe.view[m](i),[method,visible.indexOf(id)]);
          }
          const direction=Number(id.split(':')[1])<Number(s.visibleOfferIds[0].split(':')[1])?0:1;
          const p=await page.evaluate(d=>probe.view.getOfferPageClickPoint(d),direction);
          await tap(p);
        }
      }
      return page.evaluate(([m,i])=>globalThis.probe.view[m](i),[method,index]);
    };
    const screen=async p=>{assert.ok(p,'The control exists');const b=await page.locator('canvas').boundingBox();return {x:b.x+p.x/2424*b.width,y:b.y+p.y/1080*b.height};};
    const tap=async (p,hold=false)=>{
      const q=await screen(p);
      if(hold){
        const c=mobile?await page.context().newCDPSession(page):null;
        if(c)await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[q]});
        else{await page.mouse.move(q.x,q.y);await page.mouse.down();}
        await page.evaluate(()=>probe.view.refresh());await delay(240);
        if(c){await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await c.detach();}else await page.mouse.up();
      }else if(mobile)await page.touchscreen.tap(q.x,q.y);else await page.mouse.click(q.x,q.y);
      await delay(180);
    };
    const snapshot=()=>page.evaluate(()=>probe.snapshot());
    const drag=async(from,to)=>{
      const before=await snapshot(); let held;
      const a=await screen(from),b=await screen(to);
      if(mobile){const c=await page.context().newCDPSession(page);await c.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[a]});for(let i=1;i<=12;i++)await c.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:a.x+(b.x-a.x)*i/12,y:a.y+(b.y-a.y)*i/12}]});held=await snapshot();await c.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await c.detach();}
      else{await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:12});held=await snapshot();await page.mouse.up();}
      await delay(250);
      assert.deepEqual(held.purchaseOrder,before.purchaseOrder,'Dragging previews without committing the purchase');
      if(held.dragPreview?.ok) {
        const after=await snapshot();
        assert.deepEqual(after.practices.map(p=>p?.practiceId??null),held.dragPreview.practices,'Practice commit matches the live preview');
        assert.deepEqual(after.discardedPractices.map(p=>p.practiceId),held.dragPreview.discard,'Outgoing cards match the live discard preview');
        assert.deepEqual(after.structures.map(p=>p?{placementId:p.placementId,structureId:p.structureId,origin:p.origin,width:p.width}:null),held.dragPreview.structures,'Structure commit matches the live preview');
      }
    };
    await delay(900);
    const initial=await snapshot();
    assert.deepEqual(initial.visibleOfferIds,['fixture:0','fixture:1','fixture:2'],
      'Three offers fit on the first page, including the widest Structure');
    assert.deepEqual(initial.costPanels.map(panel=>panel.rect.width),[270,270,270],
      'Structures and Practices use the same offer columns');
    if(replacementOnly) {
      const original=initial.practices.map(p=>p?.practiceId??null);
      const live=await page.evaluate(()=>probe.confirmed());
      await page.evaluate(()=>probe.freezeAnimation());
      const hold=async()=>{
        const source=await screen(await point('getOfferFacePoint',0));
        const touch=mobile?await page.context().newCDPSession(page):null;
        if(touch)await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[source]});
        else {await page.mouse.move(source.x,source.y);await page.mouse.down();}
        return {
          async move(p){const q=await screen(p);if(touch)await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[q]});else await page.mouse.move(q.x,q.y,{steps:6});await delay(60);},
          async release(settle=true){if(touch){await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await touch.detach();}else await page.mouse.up();await delay(180);if(settle)await page.evaluate(()=>probe.advanceAnimation(200));},
        };
      };
      let held=await hold();
      for(const index of [0,2,4,1]) {
        await held.move(await point('getTableauClickPoint',index));
        if(index===0) {
          assert.equal((await snapshot()).practiceDragProgress,0,'The lift starts without an instant jump');
          await page.evaluate(()=>probe.advanceAnimation(50));
          const partial=await snapshot();
          assert.ok(partial.practiceDragProgress>.25&&partial.practiceDragProgress<1,'The lift eases out through an intermediate pose');
          assert.ok(partial.practiceDragScales.every(scale=>scale>1&&scale<1.025),'Scaling animates with the tilt');
          await page.evaluate(()=>probe.advanceAnimation(150));
        }
        const s=await snapshot(),expected=[...original];expected[index]='dryFarming';
        assert.deepEqual(s.dragPreview?.discard,[original[index]],`Slot ${index+1} previews its own outgoing Practice`);
        assert.deepEqual(s.dragPreview.practices,expected,'Replacing a card preserves every other slot');
        assert.deepEqual(s.purchaseOrder,[],'Hovering cannot stage a purchase');
        assert.deepEqual(await page.evaluate(()=>probe.confirmed()),live,'Hovering cannot change the live board');
        assert.ok(s.practiceDragRotations.length===5&&s.practiceDragRotations.every(r=>Math.abs(r)>.05&&Math.abs(r)<.056),'The board holds a roughly three-degree tilt across target changes');
        assert.ok(s.practiceDragScales.every(scale=>Math.abs(scale-1.025)<.00001),'Cards remain slightly enlarged across preview rebuilds');
      }
      await page.screenshot({path:`artifacts/practice-replacement-${mobile?'phone':'desktop'}-preview.png`});
      await held.move({x:600,y:840});
      let s=await snapshot();assert.equal(s.dragPreview,null,'Leaving the board clears the proposed discard');
      assert.ok(s.practiceDragRotations.every(r=>Math.abs(r)>0),'The board remains tilted until the drag ends');
      await held.release(false);
      assert.equal((await snapshot()).practiceDragProgress,1,'The return starts without snapping to the resting pose');
      await page.evaluate(()=>probe.advanceAnimation(50));
      const returning=await snapshot();
      assert.ok(returning.practiceDragProgress>0&&returning.practiceDragProgress<.75,'The return eases through an intermediate pose');
      await page.evaluate(()=>probe.advanceAnimation(150));
      s=await snapshot();assert.deepEqual(s.practices.map(p=>p?.practiceId??null),original);
      assert.ok(s.practiceDragRotations.every(r=>r===0),'Cancelling the drop straightens the board');
      assert.ok(s.practiceDragScales.every(scale=>scale===1),'Cancelling the drop restores the original size');
      held=await hold();await held.move(await point('getTableauClickPoint',2));await page.evaluate(()=>probe.advanceAnimation(200));await held.release();
      s=await snapshot();const expected=[...original];expected[2]='dryFarming';
      assert.deepEqual(s.practices.map(p=>p?.practiceId??null),expected,'Drop replaces the hovered card');
      assert.deepEqual(s.discardedPractices.map(p=>p.practiceId),[original[2]]);
      assert.ok(s.practiceDragRotations.every(r=>r===0),'Dropping straightens the board');
      assert.ok(s.practiceDragScales.every(scale=>scale===1),'Dropping restores the original size');
      await tap(await point('getUndoClickPoint',0));
      assert.deepEqual((await snapshot()).practices.map(p=>p?.practiceId??null),original,'Undo restores the exact original board');
      held=await hold();await held.move(await point('getTableauClickPoint',2));await page.evaluate(()=>probe.advanceAnimation(200));await held.release();
      await page.evaluate(()=>probe.resumeAnimation());
      await tap(await point('getConfirmClickPoint'));
      const actual=await page.evaluate(()=>probe.confirmed()),replay=await page.evaluate(()=>probe.replay());
      assert.deepEqual(actual.practices.map(p=>p?.practiceId??null),expected,'Confirm installs the shown replacement');
      assert.equal(replay.ok,true);assert.deepEqual(replay.practices,actual.practices,'Replay retains the chosen replacement');
      checks.push(`${mobile?'touch':'mouse'} replacement: moving discard, eased tilt/scale, preview continuity, cancel, commit, undo, confirm and replay`);
      await page.close();page=null;continue;
    }
    await page.screenshot({path:`artifacts/settlement-draft-${mobile?'mobile':'desktop'}-${kind}-offers.png`});
    await tap(await point('getOfferFacePoint',0));
    let s=await snapshot();assert.equal(s.purchaseOrder.length,0);assert.ok(s.inspectedCardId || s.quickCardId);
    if(s.quickCardId) {await tap(s.inspectionTitlePoint); s=await snapshot();}
    assert.ok(s.inspectionRect,'Offer inspection opens');
    const source=await point('getOfferFacePoint',0);
    assert.ok(source,'The offer retains its inspection target');
    await page.screenshot({path:`artifacts/settlement-draft-${mobile?'mobile':'desktop'}-${kind}-inspection.png`});
    await tap(await point('getInspectionClosePoint'));
    await tap(await point('getOfferClickPoint',0),true);
    s=await snapshot();
    if(s.replacementOfferId) await tap(await point('getTableauClickPoint',4));
    s=await snapshot();assert.equal(s.purchaseOrder.length,1,'Cost plus chosen replacement stages one purchase');
    assert.equal(s.currentPrestige,1000);assert.equal(s.projectedPrestige,990);
    const stagedIndex=kind==='practice'?0:5+s.structures.filter(Boolean).findIndex(p=>p.staged);
    if(returnOnly) {
      const firstCommission=s.purchaseOrder[0];
      const initialCosts=await page.evaluate(()=>probe.costs());
      await drag(await point('getOfferFacePoint',0),await point('getConstructionPoint',3));
      s=await snapshot();assert.equal(s.purchaseOrder.length,2,'One offer can stage multiple construction zones');
      const secondCommission=s.purchaseOrder.find(id=>id!==firstCommission);
      const secondIndex=5+s.structures.filter(Boolean).findIndex(piece=>piece.offerId===secondCommission);
      assert.equal(s.projectedPrestige,980);
      assert.equal((await page.evaluate(()=>probe.costs())).currency,initialCosts.currency-1);
      await drag(await point('getTableauClickPoint',secondIndex),await point('getOfferFacePoint',0));
      s=await snapshot();
      assert.deepEqual(s.purchaseOrder,[firstCommission],'Return removes only the dragged commission from a repeated offer');
      assert.equal(s.projectedPrestige,990);
      assert.deepEqual(await page.evaluate(()=>probe.costs()),initialCosts,'Returning a repeat commission releases its reserved costs');
      await drag(await point('getTableauClickPoint',stagedIndex),{x:600,y:880});
      s=await snapshot();
      assert.equal(s.purchaseOrder.length,1,'Dropping outside the shop cannot refund a construction commission');
      await drag(await point('getTableauClickPoint',stagedIndex),await point('getOfferFacePoint',0));
      s=await snapshot();
      assert.equal(s.purchaseOrder.length,0,'Returning a construction zone to its source removes the commission');
      assert.equal(s.projectedPrestige,1000,'Returning a construction zone releases its reserved Prestige');
      assert.equal((await page.evaluate(()=>probe.costs())).currency,initialCosts.currency+1,'Returning a construction zone releases its reserved Currency');
      assert.deepEqual(s.structures.map(piece=>piece?.structureId??null),initial.structures.map(piece=>piece?.structureId??null));
      await drag(await point('getOfferFacePoint',0),await point('getConstructionPoint',2));
      s=await snapshot();const committedId=s.purchaseOrder[0];
      await tap(await point('getConfirmClickPoint'));
      const confirmed=await page.evaluate(()=>probe.confirmed());
      assert.equal((await page.evaluate(id=>probe.undoAfterConfirm(id),committedId)).ok,false,'Confirmed construction cannot be refunded');
      assert.deepEqual(await page.evaluate(()=>probe.confirmed()),confirmed);
      const replay=await page.evaluate(()=>probe.replay());
      assert.equal(replay.ok,true);assert.deepEqual(replay.structures,confirmed.structures);
      checks.push(`${mobile?'touch':'mouse'} construction return`);
      await page.close();page=null;continue;
    }
    await tap(await point('getTableauClickPoint',stagedIndex));
    s=await snapshot();
    if(s.quickCardId) {await tap(s.inspectionTitlePoint); s=await snapshot();}
    assert.ok(s.inspectionRect,'The staged board card remains inspectable');
    await tap(await point('getInspectionClosePoint'));
    if(kind==='practice') {
      await drag(await point('getOfferFacePoint',1),await point('getTableauClickPoint',1));
      s=await snapshot();assert.deepEqual(s.practices.filter(p=>p?.staged).map(p=>p.practiceId),['dryFarming','quarrying']);
      await drag(await point('getTableauClickPoint',1),await point('getTableauClickPoint',0));
      s=await snapshot();assert.deepEqual(s.practices.filter(p=>p?.staged).map(p=>p.practiceId),['quarrying','dryFarming']);
      assert.ok(s.discardedPractices.length,'Full board shows a recoverable discard');
      await tap(await point('getDiscardClickPoint',0));
      assert.ok((await snapshot()).inspectedCardId || (await snapshot()).quickCardId,'Discard is clickable');
      if ((await snapshot()).inspectedCardId) await tap(await point('getInspectionClosePoint'));
      else await tap({x:500,y:840});
      const restored=s.discardedPractices[0].practiceId;
      await drag(await point('getDiscardClickPoint',0),await point('getTableauClickPoint',4));
      assert.equal((await snapshot()).practices[4].practiceId,restored,'Discard can be dragged back to the board');

      await drag(await point('getTableauClickPoint',0),{x:600,y:380});
      assert.equal((await snapshot()).purchaseOrder.length,1,'Dragging to offers undoes a purchase');
      await tap(await point('getUndoClickPoint',0));assert.equal((await snapshot()).purchaseOrder.length,0);
      await drag(await point('getOfferFacePoint',2),await point('getTableauClickPoint',0));
      s=await snapshot();assert.equal(s.practices[0].practiceId,'forage');assert.equal(s.practices[0].tier,'silver');
      await tap(await point('getOfferClickPoint',0));
      if ((await snapshot()).replacementOfferId) await tap(await point('getTableauClickPoint',4));
      await drag(await point('getTableauClickPoint',1),await point('getTableauClickPoint',0));
      s=await snapshot();assert.deepEqual(s.practices.slice(0,2).map(p=>p.practiceId),['forage','dryFarming'],'Upgrades can join and reorder the staged prefix');
    } else {
      assert.equal(s.structures.find(p=>p?.staged).origin,2,'Cost picks the first free span');
      await drag(await point('getOfferFacePoint',1),await point('getConstructionPoint',4));
      s=await snapshot();assert.equal(s.demolishedStructures[0].structureId,'timberHouse');
      await drag(await point('getOfferFacePoint',2),await point('getConstructionPoint',5));
      assert.equal((await snapshot()).purchaseOrder.length,2,'Staged buildings cannot overlap');
      s=await snapshot();let index=s.structures.filter(Boolean).findIndex(p=>p.structureId==='workshop');
      await drag(await point('getTableauClickPoint',5+index),await point('getConstructionPoint',3));
      s=await snapshot();assert.equal(s.structures.find(p=>p?.structureId==='workshop').origin,3);
      index=s.structures.filter(Boolean).findIndex(p=>p.structureId==='greatDwelling');
      await drag(await point('getTableauClickPoint',5+index),await point('getOfferFacePoint',1));
      assert.equal((await snapshot()).demolishedStructures.length,0,'Undo restores the covered confirmed building');
      await drag(await point('getOfferFacePoint',1),await point('getConstructionPoint',0));
      s=await snapshot();assert.deepEqual(s.demolishedStructures.map(p=>p.structureId),['granary','mudHouses']);
      await page.screenshot({path:`artifacts/settlement-draft-${mobile?'mobile':'desktop'}-demolition.png`});
      index=s.structures.filter(Boolean).findIndex(p=>p.structureId==='greatDwelling');
      await drag(await point('getTableauClickPoint',5+index),await point('getOfferFacePoint',1));
      await drag(await point('getOfferFacePoint',3),await point('getConstructionPoint',0));
      s=await snapshot();assert.equal(s.structures[0].structureId,'granary');assert.equal(s.structures[0].staged,true);
    }
    await delay(700);await page.mouse.move(5,5);
    await page.screenshot({path:`artifacts/settlement-draft-${mobile?'mobile':'desktop'}-${kind}.png`});
    s=await snapshot();const expected={practices:s.practices.map(p=>p?.practiceId??null),structures:s.structures.map(p=>p?[p.structureId,p.origin,p.width,p.tier]:null)};
    await tap(await point('getConfirmClickPoint'));
    const actual=await page.evaluate(()=>probe.confirmed());
    assert.deepEqual(actual.practices.map(p=>p?.practiceId??null),expected.practices);
    assert.deepEqual(actual.structures.map(p=>p?[p.structureId,p.origin,p.width,p.tier]:null),expected.structures);
    const replay=await page.evaluate(()=>probe.replay());assert.equal(replay.ok,true);assert.deepEqual(replay.practices,actual.practices);assert.deepEqual(replay.structures,actual.structures);
    checks.push(`${mobile?'mobile':'desktop'} ${kind}: inspect, cost, drag, reorder/move, undo, upgrade, confirm and replay`);
    await page.close();page=null;
  }
  assert.equal(errors.length,0,'Browser errors: '+errors[0]);writeFileSync(artifact,JSON.stringify({ok:true,checks},null,2));
  console.log('[probe:settlement-draft] OK: desktop and touch draft gestures match confirmed and replayed settlements');
} catch(error) {
  if(page)await page.screenshot({path:'artifacts/settlement-draft-failure.png'}).catch(()=>{});
  const state=page?await page.evaluate(()=>({result:probe.results.at(-1),order:probe.snapshot().purchaseOrder})).catch(()=>null):null;
  writeFileSync(artifact,JSON.stringify({error:error.stack,state,errors,checks},null,2));
  console.error('[probe:settlement-draft] FAILED: '+error.message.split('\n')[0]+' · '+artifact);process.exitCode=1;
} finally {await browser?.close();server.kill();}
