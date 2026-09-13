import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { BROWSER_PROBE_LAUNCH_OPTIONS } from './browser-probe-config.mjs';

const url='http://127.0.0.1:8089';
const server=spawn(process.execPath,['node_modules/serve/bin/serve.js','-l','8089','--no-clipboard','.'],{stdio:'ignore',windowsHide:true});
let browser;
try {
  for(let i=0;i<100;i++){try{if((await fetch(url)).ok)break;}catch{}await delay(100);}
  browser=await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
  const page=await browser.newPage({viewport:{width:1280,height:1120}});
  await page.route(url+'/',route=>route.fulfill({contentType:'text/html',body:'<html><body style="margin:0"><script src="https://cdn.jsdelivr.net/npm/pixi.js@7.2.4/dist/pixi.min.js"></script></body></html>'}));
  await page.goto(url);
  await page.waitForFunction(()=>!!globalThis.PIXI);
  const results=await page.evaluate(async()=>{
    const {preloadChronicleArt,getResourceTexture,getChronicleTexture}=await import('/src/views/chronicle-art.js');
    const {addSettlementPiece}=await import('/src/views/settlement-piece-pixi.js');
    const {getGamepieceFace}=await import('/src/model/gamepiece-presentation.js');
    const {addCostPanel,addResourceAmount}=await import('/src/views/resource-cost-pixi.js');
    const {addRegionPanelContent}=await import('/src/views/chronicle-world-panels.js');
    await preloadChronicleArt();
    const app=new PIXI.Application({width:1280,height:1120,backgroundColor:0x0b1513});document.body.append(app.view);
    const clock={tSec:17,seasonDurationSec:8};
    // First render requests the lazy paintings; render again after their atlas loads.
    addSettlementPiece(app.stage,{x:0,y:0,width:170,height:238},{face:getGamepieceFace(clock,'practice','cultivate')});
    await PIXI.Assets.load('images/sprite-sheets/settlement-pieces.json');
    await new Promise(resolve=>setTimeout(resolve,100));app.stage.removeChildren();
    const spinnerChecks=[];
    for(const [index,fill] of [0,.25,.75,1].entries()) {
      const face={...getGamepieceFace(clock,'practice',index>1?'marketFeast':'cultivate'),fill,activationAge:index===3?0:null};
      const card=addSettlementPiece(app.stage,{x:20+index*180,y:24,width:170,height:238},{face});
      const spinner=card.children.find(node=>node.texture===getResourceTexture('solar-wheel'));
      spinnerChecks.push(index<2?!!spinner&&Math.abs(spinner.rotation-fill*Math.PI*2)<.001:!spinner);
    }
    const costs=[];
    for(const [i,width,height,prestigeCost] of [[0,220,80,0],[1,220,160,123],[2,340,160,12345]]) {
      const panel=addCostPanel(app.stage,{x:20+i*250,y:300,width,height},{phaseCost:721,prestigeCost,interactive:false,fontSize:36,iconSize:48});
      const frame=panel.children.find(node=>node instanceof PIXI.NineSlicePlane);
      costs.push({width:panel.width,height:panel.height,expectedWidth:width,expectedHeight:height,corner:frame.topHeight*frame.scale.y});
    }
    const amount=addResourceAmount(app.stage,'prestige',123,{x:820,y:300});
    const iconFirst=amount.children.find(child=>child instanceof PIXI.Sprite&&!(child instanceof PIXI.Text)).x<amount.children.find(child=>child instanceof PIXI.Text).x;
    const warnings=[];
    const region=new PIXI.Container();app.stage.addChild(region);
    addRegionPanelContent(region,{x:20,y:490,width:928,height:588},{region:{colour:'green',controller:'player'},reference:'01',name:'Warning layout',tooltipView:{show:spec=>warnings.push(spec.title),hide:()=>{},pin:spec=>warnings.push(spec.title)},vm:{
      population:{total:80,housingCapacity:35,mealDemand:90},storedFood:20,looseFood:5,storedFoodCapacity:20,currency:120,
      pressure:{starvation:true,overcrowding:true,housingOverflow:45,unfedMealDemand:12,starvationMigrants:4},
      practices:['cultivate','exchange','marketFeast','forage','raiseHouses'].map(practiceId=>({practiceId,face:getGamepieceFace(clock,'practice',practiceId)})),
      structures:[{origin:0,width:1,face:getGamepieceFace(clock,'structure','granary')}],usedStructureCapacity:1,structureCapacity:5,
    }});
    const walk=node=>[node,...(node.children??[]).flatMap(walk)];
    const timeIcons=walk(app.stage).filter(node=>['year','moon','phase'].some(id=>node.texture===getChronicleTexture(`piece-frames-v1/time-${id}.png`)));
    const numbersCentered=timeIcons.length===9&&timeIcons.every(icon=>{
      const number=icon.parent.children.find(node=>node instanceof PIXI.Text);
      return number&&Math.abs(number.x-icon.width/2)<.01&&Math.abs(number.y-icon.height/2)<.01&&number.width<=icon.width*.65;
    });
    const nodes=walk(region),heading=nodes.find(node=>node.text==='PRACTICES');
    for(const node of nodes.filter(node=>node.cursor==='help'))node.emit('pointerover',{stopPropagation(){}});
    const warningBottom=Math.max(...nodes.filter(node=>node.cursor==='help').map(node=>node.getBounds().bottom));
    app.renderer.render(app.stage);
    globalThis.feedbackTitles=warnings;
    globalThis.feedbackApp=app;
    return {costs,iconFirst,warnings,spinnerChecks,numbersCentered,headingClear:heading.getBounds().top>warningBottom,textureReady:getResourceTexture('cost-frame').baseTexture.valid};
  });
  mkdirSync('artifacts',{recursive:true});
  await page.screenshot({path:'artifacts/piece-feedback-review.png'});
  assert.ok(results.textureReady,'Cost-frame texture loaded');
  assert.ok(results.iconFirst,'Prestige icon precedes the number');
  assert.ok(results.headingClear,'Practices heading clears warning glyphs');
  assert.ok(results.spinnerChecks.every(Boolean),'Scheduled cards retain rotating discs; charge cards have none');
  assert.ok(results.numbersCentered,'Each time denomination contains its number in the center');
  assert.deepEqual(results.warnings,['Overcrowded','Starving']);
  for(const [x,y,title] of [[80,582,'Population / Housing'],[312,583,'Overcrowded'],[80,582,'Population / Housing'],[380,582,'Food / Storage'],[607,583,'Starving'],[700,582,'Money']]){
    await page.mouse.move(x,y);
    await page.waitForFunction(title=>globalThis.feedbackTitles.at(-1)===title,title,{timeout:3000});
  }
  await page.mouse.click(312,583);
  assert.equal(await page.evaluate(()=>globalThis.feedbackTitles.at(-1)),'Overcrowded','Warning presses cannot be replaced by the segment label');
  const columnChecks=await page.evaluate(async()=>{
    const {pieceOfferCard,outcomeCard}=await import('/src/views/vassal-node-decision/cards.js');
    const {getGamepieceFace}=await import('/src/model/gamepiece-presentation.js');
    const app=globalThis.feedbackApp;app.stage.removeChildren();
    const cards=[];
    for(const [index,kind,id] of [[0,'practice','cultivate'],[1,'structure','granary'],[2,'structure','caravanserai']]){
      cards.push(pieceOfferCard(app.stage,{x:24+index*360,y:24,width:338,height:450},{title:id,presentation:getGamepieceFace({},kind,id),cost:{phaseCost:721,prestigeCost:18},enabled:true}));
      cards.push(outcomeCard(app.stage,{x:24+index*360,y:510,width:338,height:450},{title:'Development',effect:'+2 Wisdom · -1 Cunning',cost:{phaseCost:721,prestigeCost:18},enabled:true}));
    }
    app.renderer.render(app.stage);
    return cards.map(card=>({width:card.hitArea.width,footerWidth:card.costPanel.hitArea.width,footerY:card.costPanel.y}));
  });
  for(const card of columnChecks)assert.deepEqual(card,{width:338,footerWidth:326,footerY:296});
  await page.screenshot({path:'artifacts/choice-columns-review.png'});
  for(const cost of results.costs){assert.ok(cost.width<=cost.expectedWidth+1);assert.ok(cost.height<=cost.expectedHeight+1);assert.ok(Math.abs(cost.corner-14)<.01,'Frame corners stay 14 pixels at every panel height');}
  console.log('[piece-feedback] OK: warning glyphs, separate heading, cost frame bounds, prestige order; artifacts/piece-feedback-review.png');
} finally {await browser?.close();server.kill();}
