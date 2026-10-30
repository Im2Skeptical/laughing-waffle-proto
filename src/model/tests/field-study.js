import assert from 'node:assert/strict';
import { createLabFixture, fiveSlots, practiceSlot } from '../dev-lab/fixtures.js';
import { getDetailedSettlementSites } from '../detailed-settlements/queries.js';
import { emitPracticeEvent } from '../detailed-settlements/practice-events.js';
import { flushPracticeEvents, evaluateDetailedPracticeSlot } from '../detailed-settlements/practices.js';
import { serializeGameState, deserializeGameState } from '../state.js';
import { createLabNodeSandbox } from '../dev-lab/node-sandbox.js';
import { getCurrentLifeMapVassal } from '../vassal-life-map.js';
import { purchaseVassalShopOffer } from '../vassal-life-map/shop.js';
import { confirmVassalLifeNode } from '../vassal-life-map/lifecycle/node-confirm.js';

const state = createLabFixture('charge');
const sites = getDetailedSettlementSites(state, {playerOnly:true});
for (const site of sites) site.detailedState.practiceSlots = fiveSlots();
sites[0].detailedState.practiceSlots = fiveSlots(practiceSlot('fieldStudy'));
const rng = JSON.stringify(state.rng);
for (const regionId of [sites[0].regionId, sites[1].regionId]) {
  const before = state.civilization.research.total;
  emitPracticeEvent(state,{kind:'practiceInstalled',regionId,practiceId:'forage'});
  flushPracticeEvents(state);
  assert.equal(state.civilization.research.total-before,2);
  assert.equal(sites[0].detailedState.practiceSlots[0].charge,0);
}
assert.equal(JSON.stringify(state.rng),rng);
assert.equal(evaluateDetailedPracticeSlot(state,sites[0].regionId,0).chargeThreshold,1);
const restored=deserializeGameState(serializeGameState(state));
for(const s of [state,restored]) {
  emitPracticeEvent(s,{kind:'practiceInstalled',regionId:sites[1].regionId,practiceId:'logging'});
  flushPracticeEvents(s);
}
assert.deepEqual(serializeGameState(restored),serializeGameState(state));

// Real staged checkout: staging pays nothing, each confirmed installation pays once.
for (const selfInstall of [false,true]) {
const sandbox=createLabNodeSandbox({type:'neutralMarket',seed:0,prestige:500,classId:'unclassed'});
const s=sandbox.state,v=getCurrentLifeMapVassal(s);
const local=s.world.sites.find(x=>x.regionId===v.locationRegionId).detailedState;
local.practiceSlots=selfInstall ? fiveSlots() : fiveSlots(practiceSlot('fieldStudy'));
const shop=v.lifeMap.nodeStates[sandbox.nodeId];
const template=shop.inventory.find(x=>x.intervention.kind==='practice');
shop.inventory=[selfInstall ? 'fieldStudy' : 'logging','forage'].map((id,i)=>({...structuredClone(template),offerId:`field-test-${i}`,intervention:{kind:'practice',mode:'learn',practiceId:id,targetRegionId:v.locationRegionId,resultingTier:'bronze'}}));
const offers=shop.inventory;
const before=s.civilization.research.total;
for(const offer of offers.slice(0,2)) { const result=purchaseVassalShopOffer(s,sandbox.nodeId,offer.offerId); assert.equal(result.ok,true,JSON.stringify(result)); }
assert.equal(s.civilization.research.total,before);
const saved=deserializeGameState(serializeGameState(s));
assert.equal(confirmVassalLifeNode(s,sandbox.nodeId).ok,true);
assert.equal(confirmVassalLifeNode(saved,sandbox.nodeId).ok,true);
assert.deepEqual(serializeGameState(saved),serializeGameState(s));
assert.equal(s.civilization.research.total-before,4);
}
console.log('[field-study] OK: local/remote installs, fixed payout, cap, RNG, save continuation, real multi-purchase checkout');
