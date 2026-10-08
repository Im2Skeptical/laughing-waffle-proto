import assert from 'node:assert/strict';
import { createNewGameState } from '../new-game.js';
import { serializeGameState, deserializeGameState } from '../state.js';
import { getAdjacentRegionIds, getRegionState } from '../world-state.js';
import { practiceSlot, fiveSlots, setFixturePopulation } from '../dev-lab/fixtures.js';
import { planStock, applyStockPlan, consumeAvailableStock } from '../detailed-settlements/stock.js';
import { replenishNeutralMarkets } from '../detailed-settlements/neutral-market.js';
import { getDetailedSettlementViewModel } from '../detailed-settlements/view-model.js';
import { conquerSettlement } from '../detailed-settlements/external-world.js';
import { runPracticeActivation } from '../detailed-settlements/practices.js';
import { advanceReplayStateToSecond } from '../replay-second-runner.js';
import { createTimelineFromInitialState, rebuildStateAtSecond } from '../timeline/index.js';
import { buildProjectionChunkFromStateData } from '../projection-chunk.js';
import { canonicalizeSnapshot } from '../canonicalize.js';

function snapshot(state) {
  const data=serializeGameState(state);
  canonicalizeSnapshot(data);
  return data;
}

function fixture() {
  const state = createNewGameState(42);
  const local = state.world.sites.find(site=>site.regionId===state.civilization.capitalRegionId);
  const ally = state.world.sites.find(site=>site!==local && getRegionState(state,site.regionId).controller==='player');
  const neutral = state.world.sites.find(site=>site.neutral && getAdjacentRegionIds(state,local.regionId).includes(site.regionId));
  for (const site of state.world.sites) {
    setFixturePopulation(site.detailedState,0);
    site.detailedState.practiceSlots=fiveSlots();
  }
  state.world.connections = [ally,neutral].map(site=>({regionAId:local.regionId,regionBId:site.regionId}));
  neutral.neutral.stocks=[
    {id:'food',label:'Provisions',traits:['Edible'],stock:6,capacity:10,price:2,replenishment:0},
    {id:'timber',label:'Timber',traits:['Timber','Fuel','Construction'],stock:6,capacity:10,price:1,replenishment:2},
  ];
  return {state,local,ally,neutral};
}

const ordered=fixture();
ordered.local.detailedState.practiceSlots=fiveSlots(practiceSlot('logging',1),practiceSlot('barter',3));
ordered.ally.detailedState.practiceSlots=fiveSlots(practiceSlot('logging',1));
const before=serializeGameState(ordered.state);
const plan=planStock(ordered.state,ordered.local.detailedState,[{traits:['Timber'],amount:3}]);
assert.equal(plan.ok,true);
assert.deepEqual(plan.providers.filter(p=>!p.paymentFor).map(p=>p.regionId),[ordered.local.regionId,ordered.ally.regionId,ordered.neutral.regionId]);
assert.deepEqual(serializeGameState(ordered.state),before,'planning changes no state or RNG');
applyStockPlan(ordered.state,ordered.local.detailedState,plan);
assert.equal(ordered.local.detailedState.practiceSlots[1].stock,2);
assert.equal(ordered.neutral.neutral.stocks[1].stock,5);
assert.equal(ordered.neutral.neutral.currencyStock,1);
assert.ok(ordered.state.civilization.practiceEvents.stockTransfers.transfers.some(t=>t.traits.includes('Currency')&&t.destinationRegionId===ordered.neutral.regionId),'payment packets go to the seller');
const atomic=fixture();
atomic.local.detailedState.practiceSlots=fiveSlots(practiceSlot('barter',3));
for (const costs of [[{traits:['Edible'],amount:2}], [{traits:['Edible'],amount:1},{traits:['Arms'],amount:1}], [{traits:['Edible'],amount:1},{traits:['Currency'],amount:2}]]) {
  const saved=serializeGameState(atomic.state);
  const failed=planStock(atomic.state,atomic.local.detailedState,costs);
  assert.equal(failed.ok,false);
  assert.equal(applyStockPlan(atomic.state,atomic.local.detailedState,failed),false);
  assert.deepEqual(serializeGameState(atomic.state),saved,'failed recipe neither buys nor partially pays');
}
assert.equal(planStock(atomic.state,atomic.local.detailedState,[],[{traits:['Timber'],amount:1}]).ok,false,'Require cannot use unsold neutral Stock');
assert.equal(planStock(atomic.state,atomic.local.detailedState,[{traits:['Timber'],amount:1}],[],null,false,true).ok,false,'local pass cannot buy');
const allyCurrency=fixture();
allyCurrency.ally.detailedState.practiceSlots=fiveSlots(practiceSlot('barter',5));
assert.equal(consumeAvailableStock(allyCurrency.state,allyCurrency.local.detailedState,'Edible',1),0,'market payment needs Currency in the consuming town');
assert.equal(allyCurrency.ally.detailedState.practiceSlots[0].stock,5);
assert.equal(consumeAvailableStock(atomic.state,atomic.local.detailedState,'Edible',3),1,'meals buy only what can be paid');
assert.equal(atomic.local.detailedState.practiceSlots[0].stock,1);
assert.equal(atomic.neutral.neutral.currencyStock,2);
const links=fixture();
links.local.detailedState.practiceSlots=fiveSlots(practiceSlot('barter',3));
links.state.world.connections=[];
assert.equal(consumeAvailableStock(links.state,links.local.detailedState,'Edible',1),0,'adjacency alone cannot buy');
links.state.world.connections=[{regionAId:links.local.regionId,regionBId:links.neutral.regionId}];
getRegionState(links.state,links.local.regionId).controller='external-a';
assert.equal(consumeAvailableStock(links.state,links.local.detailedState,'Edible',1),0,'non-player settlements cannot buy from player supply');
const distant=fixture();
const distantNeutral=distant.state.world.sites.find(site=>site.neutral&&!getAdjacentRegionIds(distant.state,distant.local.regionId).includes(site.regionId));
distant.local.detailedState.practiceSlots=fiveSlots(practiceSlot('barter',5));
distant.state.world.connections=[{regionAId:distant.local.regionId,regionBId:distantNeutral.regionId}];
assert.equal(consumeAvailableStock(distant.state,distant.local.detailedState,'Edible',1),0,'a road to a distant neutral is insufficient');
const production=fixture();
production.local.detailedState.practiceSlots=fiveSlots(practiceSlot('bowmaking'),practiceSlot('barter',2));
production.ally.detailedState.practiceSlots=fiveSlots(practiceSlot('toolmaking',1));
runPracticeActivation(production.state,'birth');
assert.equal(production.local.detailedState.practiceSlots[0].stock,3,'real scheduled DSL recipes buy unmet Consume inputs');
assert.equal(production.neutral.neutral.stocks[1].stock,5);
assert.equal(production.neutral.neutral.currencyStock,1);
assert.equal(production.ally.detailedState.practiceSlots[0].stock,1,'allied Require is retained during paid production');

const live=fixture();
live.state.gameConfig.settings.values.primordialBasePressure=0;
setFixturePopulation(live.local.detailedState,61);
live.local.detailedState.practiceSlots=fiveSlots(practiceSlot('barter',4));
const timeline=createTimelineFromInitialState(live.state);
advanceReplayStateToSecond(live.state,1);
const restored=deserializeGameState(serializeGameState(live.state));
advanceReplayStateToSecond(live.state,2);
advanceReplayStateToSecond(restored,2);
assert.equal(live.local.detailedState.lastMeal.consumed,2,'real Food phase makes affordable market purchases');
assert.equal(live.local.detailedState.practiceSlots[0].stock,0);
assert.equal(live.neutral.neutral.currencyStock,4);
assert.deepEqual(snapshot(restored),snapshot(live.state));
const replay=rebuildStateAtSecond(timeline,2);
assert.equal(replay.ok,true);
assert.deepEqual(snapshot(replay.state),snapshot(live.state));
const projected=buildProjectionChunkFromStateData(serializeGameState(rebuildStateAtSecond(timeline,0).state),0,2);
assert.equal(projected.ok,true);
assert.deepEqual(snapshot(projected.lastStateData),snapshot(live.state),'forecast and live purchases agree');
const vm=getDetailedSettlementViewModel(live.state,live.neutral.regionId);
assert.equal(vm.neutral,true);
assert.equal(vm.practices.some(p=>p.practiceId),false);
assert.equal(vm.structures.some(Boolean),false);
assert.equal(vm.marketStocks[0].price,2);
live.neutral.neutral.stocks[1].stock=9;
replenishNeutralMarkets(live.state);
assert.equal(live.neutral.neutral.stocks[1].stock,10,'replenishment respects capacity');
const malformed=serializeGameState(live.state);
malformed.world.sites.find(site=>site.neutral).neutral.stocks[0].price=0;
assert.throws(()=>deserializeGameState(malformed),/invalid neutral Stock/);
assert.equal(conquerSettlement(live.state,live.neutral.regionId,4).ok,true);
assert.equal(getDetailedSettlementViewModel(live.state,live.neutral.regionId).neutral,false,'conquest switches to the player board');
assert.equal(deserializeGameState(serializeGameState(live.state)).gameStateSchemaVersion,31);
console.log('[neutral-markets] paid priority, atomic recipes, affordable meals, links, capacity, conquest and replay parity OK');
