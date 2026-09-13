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
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  await page.route(url+'/',route=>route.fulfill({contentType:'text/html',body:'<html><body style="margin:0"><script src="https://cdn.jsdelivr.net/npm/pixi.js@7.2.4/dist/pixi.min.js"></script></body></html>'}));
  await page.goto(url);
  await page.waitForFunction(()=>!!globalThis.PIXI);
  const results=await page.evaluate(async()=>{
    const {preloadChronicleArt,getResourceTexture}=await import('/src/views/chronicle-art.js');
    const {addSettlementPiece}=await import('/src/views/settlement-piece-pixi.js');
    const {getGamepieceFace}=await import('/src/model/gamepiece-presentation.js');
    const {addCostPanel,addResourceAmount}=await import('/src/views/resource-cost-pixi.js');
    const {addRegionPanelContent}=await import('/src/views/chronicle-world-panels.js');
    await preloadChronicleArt();
    const app=new PIXI.Application({width:1280,height:800,backgroundColor:0x0b1513});document.body.append(app.view);
    const clock={tSec:17,seasonDurationSec:8};
    // First render requests the lazy paintings; render again after their atlas loads.
    addSettlementPiece(app.stage,{x:0,y:0,width:170,height:238},{face:getGamepieceFace(clock,'practice','cultivate')});
    await PIXI.Assets.load('images/sprite-sheets/settlement-pieces.json');
    await new Promise(resolve=>setTimeout(resolve,100));app.stage.removeChildren();
    for(const [index,fill] of [0,.25,.75,1].entries()) {
      const face={...getGamepieceFace(clock,'practice',index>1?'marketFeast':'cultivate'),fill,activationAge:index===3?0:null};
      addSettlementPiece(app.stage,{x:20+index*180,y:24,width:170,height:238},{face});
    }
    const costs=[];
    for(const [i,width,height,prestigeCost] of [[0,220,80,0],[1,220,160,123],[2,340,160,12345]]) {
      const panel=addCostPanel(app.stage,{x:20+i*250,y:300,width,height},{phaseCost:721,prestigeCost,interactive:false,fontSize:36,iconSize:48});
      costs.push({width:panel.width,height:panel.height,expectedWidth:width,expectedHeight:height});
    }
    const amount=addResourceAmount(app.stage,'prestige',123,{x:820,y:300});
    const iconFirst=amount.children.find(child=>child instanceof PIXI.Sprite&&!(child instanceof PIXI.Text)).x<amount.children.find(child=>child instanceof PIXI.Text).x;
    const warnings=[];
    const region=new PIXI.Container();app.stage.addChild(region);
    addRegionPanelContent(region,{x:20,y:490,width:626,height:300},{region:{colour:'green',controller:'player'},reference:'01',name:'Warning layout',tooltipView:{show:spec=>warnings.push(spec.title)},vm:{
      population:{total:80,housingCapacity:35,mealDemand:90},storedFood:20,looseFood:5,storedFoodCapacity:20,currency:120,
      pressure:{starvation:true,overcrowding:true,housingOverflow:45,unfedMealDemand:12,starvationMigrants:4},practices:[],structures:[],usedStructureCapacity:0,structureCapacity:5,
    }});
    const walk=node=>[node,...(node.children??[]).flatMap(walk)];
    const nodes=walk(region),heading=nodes.find(node=>node.text==='PRACTICES');
    for(const node of nodes.filter(node=>node.cursor==='help'))node.emit('pointerover');
    const warningBottom=Math.max(...nodes.filter(node=>node.cursor==='help').map(node=>node.getBounds().bottom));
    app.renderer.render(app.stage);
    return {costs,iconFirst,warnings,headingClear:heading.getBounds().top>warningBottom,textureReady:getResourceTexture('cost-frame').baseTexture.valid};
  });
  mkdirSync('artifacts',{recursive:true});
  await page.screenshot({path:'artifacts/piece-feedback-review.png'});
  assert.ok(results.textureReady,'Cost-frame texture loaded');
  assert.ok(results.iconFirst,'Prestige icon precedes the number');
  assert.ok(results.headingClear,'Practices heading clears warning glyphs');
  assert.deepEqual(results.warnings,['Overcrowded','Starving']);
  for(const cost of results.costs){assert.ok(cost.width<=cost.expectedWidth+1);assert.ok(cost.height<=cost.expectedHeight+1);}
  console.log('[piece-feedback] OK: warning glyphs, separate heading, cost frame bounds, prestige order; artifacts/piece-feedback-review.png');
} finally {await browser?.close();server.kill();}
