import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { BROWSER_PROBE_LAUNCH_OPTIONS } from './browser-probe-config.mjs';

const url='http://127.0.0.1:8085', artifact='artifacts/settlement-draft-browser-probe.json';
mkdirSync('artifacts',{recursive:true});
writeFileSync('artifacts/settlement-draft-probe.html','<!doctype html><base href="/"><style>body{margin:0;background:#111817}canvas{width:100vw;max-height:100vh;object-fit:contain;display:block}</style>');
const server=spawn(process.execPath,['node_modules/serve/bin/serve.js','-l','8085','--no-clipboard','.'],{stdio:'ignore',windowsHide:true});
let browser,page;const errors=[],checks=[];
try {
  for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{}await delay(100);}
  browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
  for(const mobile of [false,true]) for(const kind of ['practice','structure']) {
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
      const site=state.world.sites.find(s=>s.regionId===v.locationRegionId).detailedState;
      state.world.regions.find(r=>r.id===v.locationRegionId).structureCapacity=8;
      site.structureSlots=layout.normalizeStructureLayout([{structureId:'granary'},{structureId:'mudHouses'},null,null,{structureId:'timberHouse'}],8,id=>defs.settlementStructureDefs[id]);
      site.practiceSlots=[...['forage','pastoralism','logging','surfaceMining','barter'].map(practiceId=>({practiceId,tier:'bronze',stock:2,charge:0,work:0}))];
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
      v.lifeMap.nodeStates[nodeId].inventory=actions.map((intervention,i)=>({offerId:'fixture:'+i,inventoryIndex:i,label:intervention.practiceId??intervention.structureId,basePrestigeCost:10,basePhaseCost:1,intervention:{...intervention,targetRegionId:v.locationRegionId}}));
      const line=timeline.createTimelineFromInitialState(state), results=[];
      const dispatch=(kind,payload)=>{
        const replayAction={kind,payload,tSec:0};
        const result=applyAction(state,replayAction,{isReplay:true});
        if(result.ok)timeline.appendActionAtCursor(line,replayAction,state);
        results.push(result);return result;
      };
      const app=new PIXI.Application({width:2424,height:1080,background:0x111817,antialias:true});document.body.append(app.view);art.preloadChronicleArt();
      const view=createVassalNodeDecisionModalView({app,layer:app.stage,getState:()=>state,
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
    await tap(await point('getTableauClickPoint',stagedIndex));
    s=await snapshot();
    if(s.quickCardId) {await tap(s.inspectionTitlePoint); s=await snapshot();}
    assert.ok(s.inspectionRect,'The staged board card remains inspectable');
    await tap(await point('getInspectionClosePoint'));
    if(kind==='practice') {
      await drag(await point('getOfferFacePoint',1),await point('getTableauClickPoint',0));
      s=await snapshot();assert.deepEqual(s.practices.filter(p=>p?.staged).map(p=>p.practiceId),['quarrying','dryFarming']);
      await drag(await point('getTableauClickPoint',0),await point('getTableauClickPoint',1));
      s=await snapshot();assert.deepEqual(s.practices.filter(p=>p?.staged).map(p=>p.practiceId),['dryFarming','quarrying']);
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
      await drag(await point('getTableauClickPoint',5+index),{x:600,y:380});
      assert.equal((await snapshot()).demolishedStructures.length,0,'Undo restores the covered confirmed building');
      await drag(await point('getOfferFacePoint',1),await point('getConstructionPoint',0));
      s=await snapshot();assert.deepEqual(s.demolishedStructures.map(p=>p.structureId),['granary','mudHouses']);
      await page.screenshot({path:`artifacts/settlement-draft-${mobile?'mobile':'desktop'}-demolition.png`});
      index=s.structures.filter(Boolean).findIndex(p=>p.structureId==='greatDwelling');
      await drag(await point('getTableauClickPoint',5+index),{x:600,y:380});
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
