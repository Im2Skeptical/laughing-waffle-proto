import assert from 'node:assert/strict';
import {createNewGameState} from '../src/model/new-game.js';
import {serializeGameState,deserializeGameState} from '../src/model/state.js';
import {planStock,applyStockPlan} from '../src/model/detailed-settlements/stock.js';
import {conquerSettlement} from '../src/model/detailed-settlements/external-world.js';
import {writePopulationBins} from '../src/model/detailed-settlements/population-ledger.js';
import {changeController,resolveControl} from '../src/model/detailed-settlements/territory.js';
import {runPracticeActivation,flushPracticeEvents} from '../src/model/detailed-settlements/practices.js';
import {emitPracticeEvent} from '../src/model/detailed-settlements/practice-events.js';
import {runFoodPhase} from '../src/model/detailed-settlements/phases/food.js';
import {getMoonPhaseAtSecond} from '../src/model/moon-phases.js';
import {validatePurchaseInterventions} from '../src/model/vassal-life-map/shop.js';
import {getShopOfferPrice} from '../src/model/vassal-life-map/shop-specialties.js';
import {createTimelineFromInitialState,rebuildStateAtSecond} from '../src/model/timeline/index.js';
import {quotePrestige} from '../src/model/vassal-life-map/treasury.js';
import {getAdjacentRegionIds,getConnectedRegionIds} from '../src/model/world-state.js';
import {initializeReplayClock,advanceReplayStateToSecond} from '../src/model/replay-second-runner.js';
for(const seed of [1,2,4,6,7,8,12,18,1867]){
 const s=createNewGameState(seed),players=s.world.sites.filter(x=>s.world.regions.find(r=>r.id===x.regionId).controller==='player');
 assert.deepEqual(players.map(x=>x.detailedState.practiceSlots.filter(Boolean).length).sort(),[3,3]);
 assert(s.world.sites.some(x=>x.neutral&&players.some(p=>getAdjacentRegionIds(s,p.regionId).includes(x.regionId)&&getConnectedRegionIds(s,p.regionId).includes(x.regionId))));
 const buyer=players.find(p=>s.world.sites.some(x=>x.neutral&&x.neutral.stocks.some(g=>g.traits.includes('Edible'))&&getAdjacentRegionIds(s,p.regionId).includes(x.regionId)&&getConnectedRegionIds(s,p.regionId).includes(x.regionId)));
 for(const p of players)p.detailedState.practiceSlots=Array(5).fill(null);
 buyer.detailedState.practiceSlots[0]={practiceId:'barter',tier:'bronze',stock:4,charge:0,work:0};
 const requirement=planStock(s,buyer.detailedState,[],[{traits:['Edible'],amount:1}]);assert(!requirement.ok);
 const paid=planStock(s,buyer.detailedState,[{traits:['Edible'],amount:1}]);assert(paid.ok);
 assert(paid.providers.some(p=>p.paymentFor));assert(applyStockPlan(s,buyer.detailedState,paid));
 assert(buyer.detailedState.practiceSlots[0].stock<4);
 buyer.detailedState.practiceSlots[0].stock=0;
 const beforeFailure=JSON.stringify(s.world.sites.filter(x=>x.neutral).map(x=>x.neutral.stocks));
 assert(!planStock(s,buyer.detailedState,[{traits:['Edible'],amount:100}]).ok);
 assert.equal(JSON.stringify(s.world.sites.filter(x=>x.neutral).map(x=>x.neutral.stocks)),beforeFailure);
 const town=s.world.sites.find(x=>x.neutral),pop=JSON.stringify(town.detailedState.populationByClass);
 const stocks=town.neutral.stocks.map(x=>x.stock);
 runFoodPhase(s,getMoonPhaseAtSecond(s,0));
 assert.equal(JSON.stringify(town.detailedState.populationByClass),pop);
 assert(town.neutral.stocks.every((x,i)=>x.stock>=stocks[i]));
 assert.equal(validatePurchaseInterventions(s,{locationRegionId:town.regionId},[{intervention:{kind:'practice',mode:'learn',practiceId:'forage'}}]).reason,'neutralStorefront');
 const available=town.neutral.stocks.reduce((n,g)=>n+g.stock,0);
 const inheritedPractices=[...town.neutral.practices];
 changeController(s,town.regionId,'external-a');assert(!town.neutral);assert(town.town.activated);
 assert(town.town.market.stocks.every(g=>g.stock===0));
 assert(town.detailedState.practiceSlots.reduce((n,p)=>n+(p?.stock??0),0)<=available);
 assert.equal(town.detailedState.practiceSlots.length,5);
 assert.deepEqual(town.detailedState.practiceSlots.filter(Boolean).map(slot=>slot.practiceId),inheritedPractices,'first control installs the captured inherited recipe, including degraded supply');
 assert.equal(JSON.stringify(town.detailedState.populationByClass),pop);
 const board=JSON.stringify(town.detailedState.practiceSlots);
 changeController(s,town.regionId,'frontier');assert(town.neutral);
 runPracticeActivation(s,'birth');flushPracticeEvents(s);assert.equal(JSON.stringify(town.detailedState.practiceSlots),board);
 changeController(s,town.regionId,'player');assert(!town.neutral);assert.equal(JSON.stringify(town.detailedState.practiceSlots),board);
 assert.deepEqual(serializeGameState(deserializeGameState(serializeGameState(s))),serializeGameState(s));
 const site=players[0],v={locationRegionId:site.regionId,stats:{},heirlooms:{equipped:[]}},node={purchasedOffers:[]};
 const offer={basePrestigeCost:10,intervention:{kind:'practice',mode:'learn',practiceId:'forage'}};
 const slot={practiceId:'barter',tier:'bronze',stock:0};
 for(const n of [2,3,4]){
  site.detailedState.practiceSlots=Array.from({length:5},(_,i)=>i<n?{...slot}:null);
  s.civilization.prestige=100;
  assert.equal(getShopOfferPrice(v,node,offer,s).prestigeCost,10);
  assert.equal(getShopOfferPrice(v,node,offer,s).prestigeCost,10);
  s.civilization.prestige=1;
  assert.equal(getShopOfferPrice(v,node,offer,s).monsterPressureCost,10);
 }
}
for(const military of [false,true]){
 const state=createNewGameState(42),town=state.world.sites.find(s=>s.neutral);
 if(military)assert(conquerSettlement(state,town.regionId,3).ok);
 else{
  writePopulationBins(town.detailedState,[{classId:'villager',allegiance:'player',specialty:'ordinary',kind:'adults',age:null,count:18}]);
  resolveControl(state);resolveControl(state);
 }
 assert(town.town.activated);assert(!town.neutral);
 assert.equal(state.world.regions.find(r=>r.id===town.regionId).controller,'player');
}
assert.deepEqual(quotePrestige(9,40,10),{prestigeCost:0,monsterPressureCost:50});
const live=createNewGameState(42);initializeReplayClock(live);const timeline=createTimelineFromInitialState(live);advanceReplayStateToSecond(live,20);
const loaded=deserializeGameState(serializeGameState(live));initializeReplayClock(loaded,20);
advanceReplayStateToSecond(live,80);advanceReplayStateToSecond(loaded,80);
assert.deepEqual(serializeGameState(live),serializeGameState(loaded));
const replay=rebuildStateAtSecond(timeline,80);assert(replay.ok);assert.deepEqual(serializeGameState(replay.state),serializeGameState(live));
console.log('[crafted-economies] sparse openings, storefront suspension, first control, reacquisition, pricing and continuation OK');
