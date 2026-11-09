import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { BROWSER_PROBE_LAUNCH_OPTIONS } from './browser-probe-config.mjs';

const base = process.env.REMNANT_PREVIEW_URL ?? 'http://localhost:5187/';
const folder = 'artifacts/remnant-supply';
await mkdir(folder, { recursive: true });
// Disposable review page: uses the shipped card renderer, actual model recipes,
// generated readings and multiplier fittings. Does not write any player saves.
const html = String.raw`<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Inherited supply review</title><style>
body{margin:0;background:#171b19;color:#ded0ad;font:14px Georgia,serif}header,section{padding:8px 14px}header{display:flex;gap:8px;align-items:center;flex-wrap:wrap}button{background:#303b32;color:#eadcba;border:1px solid #95805c;padding:7px 12px;cursor:pointer}canvas{max-width:100%;height:auto;display:block;margin:auto}#reading{white-space:pre-line;line-height:1.5;border-top:1px solid #685f43;min-height:36px}h1{font-size:18px;margin:0 12px 0 0}
</style><header><h1>Inherited supply · map only</h1><button id="group">Next four</button><button id="supply">Show blocked</button><button id="size">70×100</button></header><main id="stage"></main><section id="reading">Tap a card or its multiplier fitting to inspect. No player saves are changed.</section>
<script>window.reviewStage='loading Pixi';</script><script src="https://cdn.jsdelivr.net/npm/pixi.js@7.2.4/dist/pixi.min.js"></script><script type="module">
import {preloadChronicleArt,getChronicleTexture,getIllustrationSpec} from '/src/views/chronicle-art.js';
import {addSettlementPiece} from '/src/views/settlement-piece-pixi.js';
import {addPracticeMultiplierPair} from '/src/views/multiplier-fitting.js';
import {getGamepieceFace} from '/src/model/gamepiece-presentation.js';
import {remnantSupplyPracticeDefs as defs} from '/src/defs/gamepieces/remnant-supply-defs.js';
import {createNewGameState} from '/src/model/new-game.js';
import {runPracticeActivation,evaluateDetailedPracticeSlot,flushPracticeEvents} from '/src/model/detailed-settlements/practices.js';
import {assignDetailedSettlementWorkers} from '/src/model/detailed-settlements/workers.js';
import {writePopulationBins} from '/src/model/detailed-settlements/population-ledger.js';
import {getRegionState} from '/src/model/world-state.js';
import {triggerMonsterSpawn} from '/src/model/detailed-settlements/external-world.js';
import {stockCapacity} from '/src/model/detailed-settlements/stock.js';
window.reviewStage='preparing artwork';
await preloadChronicleArt({includeSettlementPieces:true});
window.reviewStage='rendering cards';
const app=new PIXI.Application({width:1000,height:325,backgroundColor:0x171b19,antialias:false});document.querySelector('#stage').append(app.view);
const ids=Object.keys(defs),season=['spring','summer','autumn','winter'];let group=0,blocked=false,small=false,models=[];
const provider={Edible:'fm_handQuern',Currency:'barter',Timber:'logging',Construction:'fm_rubblePicking',Water:'rm_siltedChannels',Tool:'rm_rustedArmoury',Metal:'smelting',Fuel:'charcoalBurning'};
const slot=(id,stock=0)=>({practiceId:id,instanceId:'review:'+id,tier:'bronze',charge:0,work:0,stock});
function fixture(id){
 const state=createNewGameState(424242);state.world.connections=[];state.gameConfig.settings.values.populationPerToken=1000;
 const site=state.world.sites.find(s=>s.regionId===state.civilization.capitalRegionId),local=site.detailedState,def=defs[id];local.structureSlots.fill(null);local.practiceSlots=[slot(id)];
 for(const cost of def.consume)local.practiceSlots.push(slot(provider[cost.traits[0]],cost.amount*2));
 for(const cost of def.require)local.practiceSlots.push(slot(provider[cost.traits[0]],cost.amount));
 for(const source of local.practiceSlots)if(source.stock>stockCapacity(state,local,source))throw Error(id+': fixture exceeds ordinary capacity');
 while(local.practiceSlots.length<5)local.practiceSlots.push(null);
 if(def.mode==='scheduled'){
  state.currentSeasonIndex=season.indexOf(def.activation.seasonKeys[0]);if(blocked)local.practiceSlots[1].stock=0;runPracticeActivation(state,'season');
 }else{
  local.practiceSlots[1]=slot('weaponsmithing',6);local.garrison={supplied:true};writePopulationBins(local,[{classId:'villager',allegiance:'player',specialty:'warrior',kind:'adults',age:null,count:10}]);
  for(const r of state.world.regions)delete r.monster;getRegionState(state,site.regionId).monster={defense:1};if(blocked)local.practiceSlots[0].stock=2;
  for(let n=0;n<6;n++){triggerMonsterSpawn(state);flushPracticeEvents(state);}
 }
 const evaluation=evaluateDetailedPracticeSlot(state,site.regionId,0),workers=assignDetailedSettlementWorkers(state,site.regionId)[0];
 const face=getGamepieceFace(state,'practice',id,'bronze',{evaluation,workers,slot:local.practiceSlots[0],settlement:local});
 return {id,state,local,face};
}
const reading=document.querySelector('#reading');
function inspect(m){reading.textContent=m.face.label+' — '+(m.face.blocked?'Blocked: '+m.face.blockedReason:'Actual retained Stock: '+m.face.stock)+'\n'+m.face.reading.effects.map(e=>(e.timing?e.timing+': ':'')+e.text).join('\n')+'\n'+defs[m.id].flavor;}
const tip={pin(spec){reading.textContent=spec.title+'\nBase pool ×1'+spec.poolBreakdown.pool.sources.map(s=>'\n'+s.label+': +'+s.amount).join('');},refreshMultiplier(){}};
function render(){
 app.stage.removeChildren().forEach(c=>c.destroy({children:true}));models=(small?ids:ids.slice(group*4,group*4+4)).map(fixture);
 app.renderer.resize(small?760:1000,small?155:325);
 models.forEach((m,i)=>{const width=small?70:180,height=width*1.4,x=(small?14+i*94:35+i*245),y=16;
  const card=addSettlementPiece(app.stage,{x,y,width,height},{face:m.face,reducedMotion:true,onInspect:()=>inspect(m)});
  addPracticeMultiplierPair(app.stage,{x,y:y+height+8,width,height:small?20:34},{practiceId:m.id,face:m.face},i,tip);
  m.textureValid=getChronicleTexture(getIllustrationSpec(m.id).file).baseTexture.valid;
  m.point={x:x+width/2,y:y+height/2};m.fitPoint={x:x+width/4,y:y+height+25};
 });app.renderer.render(app.stage);
 document.querySelector('#supply').textContent=blocked?'Show working':'Show blocked';
 document.querySelector('#size').textContent=small?'Large cards':'70×100';
 reading.textContent=(blocked?'Blocked recipes: missing inputs, or a full Loot host retaining earned Charge.':'Working recipes: Stock produced through actual activations and defenses.')+' Tap a card to inspect.';
 window.reviewSnapshot={group,blocked,small,cards:models.map(m=>({id:m.id,stock:m.face.stock,charge:m.face.charge,blocked:m.face.blocked,textureValid:m.textureValid,point:m.point,fitPoint:m.fitPoint}))};
}
document.querySelector('#group').onclick=()=>{group=1-group;small=false;render();};document.querySelector('#supply').onclick=()=>{blocked=!blocked;render();};document.querySelector('#size').onclick=()=>{small=!small;render();};
window.reviewRender=render;render();window.reviewReady=true;window.reviewStage='ready';
</script></html>`;
await writeFile(`${folder}/cards.html`, html);
const browser = await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS), errors = [], checks = [], networkFailures = [];
let page;
try {
  page = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true });
  page.on('pageerror', error => errors.push(error.message));
  page.on('requestfailed', request => networkFailures.push({ url: request.url(), error: request.failure()?.errorText }));
  page.on('response', response => { if (!response.ok()) networkFailures.push({ url: response.url(), status: response.status() }); });
  const reviewUrl = new URL(base).href;
  await page.route(reviewUrl, route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.goto(reviewUrl);
  await page.waitForFunction(() => window.reviewReady, null, { timeout: 30000 });
  for (let group = 0; group < 2; group++) {
    for (const blocked of [false, true]) {
      const snapshot = await page.evaluate(() => window.reviewSnapshot);
      assert.equal(snapshot.group, group); assert.equal(snapshot.blocked, blocked);
      assert(snapshot.cards.every(card => card.textureValid));
      assert(snapshot.cards.every(card => blocked ? card.blocked : !card.blocked && card.stock > 0));
      const { point } = snapshot.cards[0], canvas = await page.locator('canvas').boundingBox();
      await page.touchscreen.tap(canvas.x + point.x / 1000 * canvas.width, canvas.y + point.y / 325 * canvas.height);
      assert((await page.locator('#reading').textContent()).includes(blocked ? 'Blocked:' : 'Actual retained Stock:'));
      await page.screenshot({ path: `${folder}/cards-${group}-${blocked ? 'blocked' : 'working'}-phone.png` });
      if (!blocked) {
        const fitting = snapshot.cards[0].fitPoint;
        await page.touchscreen.tap(canvas.x + fitting.x / 1000 * canvas.width, canvas.y + fitting.y / 325 * canvas.height);
        assert((await page.locator('#reading').textContent()).includes('Output Multiplier'));
        await page.touchscreen.tap(canvas.x + (fitting.x + 90) / 1000 * canvas.width, canvas.y + fitting.y / 325 * canvas.height);
        assert((await page.locator('#reading').textContent()).includes('Capacity Multiplier'));
      }
      checks.push({ group, blocked, ids: snapshot.cards.map(card => card.id) });
      await page.locator('#supply').click();
    }
    if (!group) await page.locator('#group').click();
  }
  await page.locator('#size').click();
  assert.equal((await page.evaluate(() => window.reviewSnapshot.cards)).length, 8);
  await page.screenshot({ path: `${folder}/cards-70x100.png` });
  assert.deepEqual(errors, []);
  await writeFile(`${folder}/browser-results.json`, JSON.stringify({ checks, errors }, null, 2));
  console.log('[remnant-supply-browser] eight real painted cards, working/blocked states, phone touch inspection and 70x100 rendering passed');
} catch (error) {
  const progress = await page?.evaluate(() => ({ url: location.href, stage: window.reviewStage, pixi: !!window.PIXI }));
  await writeFile(`${folder}/browser-failure.json`, JSON.stringify({ error: error.message, progress, networkFailures: networkFailures.slice(0, 12), errors, checks }, null, 2));
  throw error;
} finally { await browser.close(); }
