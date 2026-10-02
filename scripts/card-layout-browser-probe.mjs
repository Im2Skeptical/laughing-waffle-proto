import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { BROWSER_PROBE_LAUNCH_OPTIONS } from './browser-probe-config.mjs';

const url='http://127.0.0.1:8093';
const server=spawn(process.execPath,['node_modules/serve/bin/serve.js','-l','8093','--no-clipboard','.'],{stdio:'ignore',windowsHide:true});
let browser;
try {
  for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{}await delay(100);}
  browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
  const page=await browser.newPage({viewport:{width:1280,height:1000}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route(url+'/',route=>route.fulfill({contentType:'text/html',body:'<html><body style="margin:0;background:#101719"><script src="https://cdn.jsdelivr.net/npm/pixi.js@7.2.4/dist/pixi.min.js"></script></body></html>'}));
  await page.goto(url);await page.waitForFunction(()=>!!globalThis.PIXI);
  const result=await page.evaluate(async()=>{
    const {preloadChronicleArt}=await import('/src/views/chronicle-art.js');
    const {addSettlementPiece}=await import('/src/views/settlement-piece-pixi.js');
    const {getGamepieceFace}=await import('/src/model/gamepiece-presentation.js');
    const {detailedSettlementPracticeDefs,settlementStructureDefs}=await import('/src/defs/gamepieces/detailed-settlement-defs.js');
    await preloadChronicleArt();
    await PIXI.Assets.load('images/sprite-sheets/settlement-pieces-0.json');
    await PIXI.Assets.load('images/sprite-sheets/settlement-pieces-1.json');
    const app=new PIXI.Application({width:1280,height:1000,backgroundColor:0x101719,antialias:true});document.body.append(app.view);
    const label=(text,x,y,size=15)=>app.stage.addChild(new PIXI.Text(text,{fontFamily:'Georgia',fontSize:size,fill:0xcabc9c})).position.set(x,y);
    label('CARD FACES  /  expanding icon sections',28,20,24);
    const base={...getGamepieceFace({tSec:0},'practice','forage'),stock:1,production:[{icon:'stock',value:2}],workerCapacity:1};
    const costs=[{kind:'consume',amount:1,traits:['Currency']},{kind:'consume',amount:1,traits:['Timber']}];
    const seasonal=[{season:'summer',icon:'stock',value:3},{season:'autumn',icon:'stock',value:2}];
    const cases=[['Base',base],['With costs',{...base,inputs:costs}],['With worker',{...base,workers:1,workerMultiplier:2}],['Multiple triggers',{...base,inputs:costs,production:seasonal}],['Maximum example',{...base,inputs:costs,production:seasonal,stock:12,stockCapacity:20,stockTraits:['Timber','Edible','Wild'],workerCapacity:3,workers:3,workerMultiplier:4}]];
    const sections=[];
    cases.forEach(([title,face],i)=>{
      label(title,28+i*250,60);
      const card=addSettlementPiece(app.stage,{x:28+i*250,y:90,width:224,height:314},{face,reducedMotion:true});sections.push(card.faceSections);
    });
    label('LIVE DEFINITIONS  /  native card size',28,442,20);
    ['forage','dryFarming','smelting','cropRotation','alchemy','warWagons'].forEach((id,i)=>{
      label(id,28+i*207,480,14);
      addSettlementPiece(app.stage,{x:28+i*207,y:507,width:170,height:238},{face:getGamepieceFace({tSec:0},'practice',id),reducedMotion:true});
    });
    label('STRUCTURES  /  fixed footprints',28,788,20);
    ['mudHouses','library','academy'].forEach((id,i)=>addSettlementPiece(app.stage,{x:28+i*390,y:829,width:360,height:160},{face:getGamepieceFace({},'structure',id)}));
    const failures=[];
    for(const [kind,defs] of [['practice',detailedSettlementPracticeDefs],['structure',settlementStructureDefs]])for(const id of Object.keys(defs)) {
      const parent=new PIXI.Container(),face=getGamepieceFace({},kind,id);
      const card=addSettlementPiece(parent,{x:0,y:0,width:kind==='practice'?170:120*face.footprint,height:kind==='practice'?238:160},{face});
      const b=card.getLocalBounds(),w=card.pieceGeometry.width,h=card.pieceGeometry.height;
      const top=card.faceSections.stock?.y??0;
      if(b.x < -1 || b.y < top-1 || b.right > w+1 || b.bottom > h+1 || !card.hitArea.contains(w-2,top+2)) failures.push({id,bounds:{x:b.x,y:b.y,right:b.right,bottom:b.bottom},expected:{w,h,top}});
      if(face.mode==='charge') {
        const {workers,charge,triggers,yields,inputs}=card.faceSections;
        if(inputs || workers.x!==0 || charge.x<workers.x+workers.width || charge.x+charge.width>yields.x+.01 || triggers.y+triggers.height>charge.y || triggers.x+triggers.width>yields.x+.01) failures.push({id,reason:'Charge sections overlap or use Stock costs'});
        if(charge.segments!==face.chargeThreshold || !face.chargeTriggers.length) failures.push({id,reason:'Charge threshold or trigger symbols missing'});
      }
      parent.destroy({children:true});
    }
    let inspections=0;
    const target=addSettlementPiece(new PIXI.Container(),{x:0,y:0,width:170,height:238},{face:base,onInspect:()=>inspections++});
    target.emit('pointertap',{stopPropagation(){}});target.dragConsumed=true;target.emit('pointertap',{stopPropagation(){}});
    app.renderer.render(app.stage);
    globalThis.cardReviewApp=app;
    return {failures,inspections,sections,count:Object.keys(detailedSettlementPracticeDefs).length+Object.keys(settlementStructureDefs).length};
  });
  mkdirSync('artifacts',{recursive:true});
  writeFileSync('artifacts/card-layout-review.json',JSON.stringify({...result,errors},null,2));
  await page.screenshot({path:'artifacts/card-layout-review.png'});
  await page.setViewportSize({width:844,height:390});
  await page.evaluate(()=>{const app=globalThis.cardReviewApp;app.renderer.resize(844,390);app.stage.scale.set(844/1280);});
  await page.screenshot({path:'artifacts/card-layout-mobile.png'});
  await page.setViewportSize({width:1280,height:440});
  const symbols=await page.evaluate(async()=>{
    const {addSettlementPiece}=await import('/src/views/settlement-piece-pixi.js');
    const {getGamepieceFace}=await import('/src/model/gamepiece-presentation.js');
    const app=globalThis.cardReviewApp;
    for(const child of app.stage.removeChildren())child.destroy({children:true});
    app.stage.scale.set(1);app.renderer.resize(1280,440);
    const centres=[];
    for(const [index,tSec] of [0,9,17,25,33].entries()) {
      const face=getGamepieceFace({tSec,seasonDurationSec:8},'practice','logging');
      const title=new PIXI.Text(`t=${tSec}  →  ${face.nextTrigger.season}`,{fontFamily:'Georgia',fontSize:20,fill:0xcabc9c});
      title.position.set(28+index*250,25);app.stage.addChild(title);
      const card=addSettlementPiece(app.stage,{x:28+index*250,y:95,width:220,height:308},{face});
      centres.push({x:Math.round(card.x+(card.faceSections.yields.x-18)*card.scale.x),y:Math.round(card.y+219*card.scale.y)});
    }
    app.renderer.render(app.stage);
    const context=app.renderer.extract.canvas(app.stage).getContext('2d');
    // Extracted stage bounds begin at its title, rather than at canvas (0,0).
    const bounds=app.stage.getBounds();
    const pixels=centres.map(p=>Array.from(context.getImageData(Math.round(p.x-bounds.x)-8,Math.round(p.y-bounds.y)-8,16,16).data).join(','));
    return {changes:pixels[0]!==pixels[1]&&pixels[1]!==pixels[2],skips:pixels[2]===pixels[3],wraps:pixels[0]===pixels[4]};
  });
  await page.screenshot({path:'artifacts/card-upcoming-triggers.png'});
  assert.ok(symbols.changes&&symbols.skips&&symbols.wraps,'Rendered spinner centres follow upcoming symbols, skip winter and wrap');
  assert.deepEqual(errors,[]);
  assert.equal(result.failures.length,0,`${result.failures[0]?.id}: face exceeds card hit area; see artifacts/card-layout-review.json`);
  assert.equal(result.inspections,1,'Tap inspects; dragging does not');
  assert.equal(result.sections[0].inputs,null,'No empty cost section');
  assert.ok(result.sections[3].yields.height>result.sections[0].yields.height,'Multiple triggers grow upward');
  assert.ok(result.sections[4].stock.width>result.sections[0].stock.width,'Stock tray grows for traits and digits');
  assert.equal(result.sections[4].stock.width,170,'Three stock tags and their count fill the card edge');
  assert.ok(result.sections[0].stock.y<0,'Larger stock tray rises above the card');
  assert.ok(result.sections[0].stock.y+result.sections[0].stock.height<=30,'Larger icons do not cover more illustration');
  assert.ok(result.sections[4].workers.height>result.sections[0].workers.height,'Sockets grow upward');
  console.log(`[card-layout] OK: ${result.count} faces fit; expanding sections, inspection and drag; artifacts/card-layout-review.png`);
} finally {await browser?.close();server.kill();}
