import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { createLabNodeSandbox } from '../dev-lab/node-sandbox.js';
import { createNewGameState } from '../new-game.js';
import { getRegionState } from '../world-state.js';
import { fiveSlots, practiceSlot, setFixturePopulation } from '../dev-lab/fixtures.js';
import { getCurrentLifeMapVassal, getVassalNodeDecisionPresentation } from '../vassal-life-map.js';
import { purchaseVassalShopOffer } from '../vassal-life-map/shop.js';
import { ActionKinds, applyAction } from '../actions.js';
import { getHousingCapacity, getStructureCount, getDetailedSettlementSites } from '../detailed-settlements/queries.js';
import { runConstructionCycles } from '../detailed-settlements/construction.js';
import { structureModifiers } from '../detailed-settlements/stock.js';
import { getGamepieceFace } from '../gamepiece-presentation.js';
import { getStockShopGenerationContext } from '../vassal-life-map/stock-shops.js';
import { settlementStructureDefs } from '../../defs/gamepieces/detailed-settlement-defs.js';
import { serializeGameState, deserializeGameState } from '../state.js';
import { createTimelineFromInitialState, appendActionAtCursor, rebuildStateAtSecond } from '../timeline/index.js';
import { advanceReplayStateToSecond } from '../replay-second-runner.js';
import { canonicalizeSnapshot } from '../canonicalize.js';
import { buildProjectionChunkFromStateData } from '../projection-chunk.js';
const equalState=(actual,expected,message)=>assert.equal(isDeepStrictEqual(actual,expected),true,message);

const {state,nodeId}=createLabNodeSandbox({type:'publicWorks',classId:'unclassed',prestige:100});
const v=getCurrentLifeMapVassal(state), node=v.lifeMap.nodeStates[nodeId];
for(const site of getDetailedSettlementSites(state)) {
  site.detailedState.structureSlots.fill(null);
  site.detailedState.practiceSlots=fiveSlots();
  setFixturePopulation(site.detailedState,0);
}
const site=state.world.sites.find(s=>s.regionId===v.locationRegionId), local=site.detailedState;
node.inventory=[{offerId:'plan',inventoryIndex:0,label:'Mud House',basePrestigeCost:2,basePhaseCost:1,
  intervention:{kind:'structure',mode:'add',structureId:'mudHouses',targetRegionId:site.regionId,tier:'bronze'}}];
const timeline=createTimelineFromInitialState(state);
const record=(kind,payload)=>{
  appendActionAtCursor(timeline,{kind,payload,tSec:state.tSec},state);
  const result=applyAction(state,{kind,payload},{isReplay:true});assert.equal(result.ok,true,result.reason);return result;
};
record(ActionKinds.VASSAL_PURCHASE_SHOP_OFFER,{nodeId,offerId:'plan',origin:0});
record(ActionKinds.VASSAL_PURCHASE_SHOP_OFFER,{nodeId,offerId:'plan',origin:1});
assert.equal(node.inventory.length,1,'the plan stays in the shop');
assert.equal(new Set(node.purchasedOffers.map(p=>p.offerId)).size,2,'commissions have independent identities');
assert.equal(new Set(node.purchasedOffers.map(p=>p.placement.placementId)).size,2);
const first=node.purchasedOffers.find(p=>p.placement.origin===0).offerId;
record(ActionKinds.VASSAL_UNDO_SHOP_PURCHASE,{nodeId,offerId:first});
assert.equal(node.inventory.length,1,'undo does not duplicate the plan');
record(ActionKinds.VASSAL_PURCHASE_SHOP_OFFER,{nodeId,offerId:'plan',origin:0});
const beforeRejected=serializeGameState(state);
assert.equal(purchaseVassalShopOffer(state,nodeId,'plan',1).reason,'stagedStructureOverlap');
equalState(serializeGameState(state),beforeRejected,'rejected commissions are atomic');
const presentation=getVassalNodeDecisionPresentation(state,nodeId);
assert.equal(presentation.offers[0].canStage,true,'plan remains enabled while space and Prestige remain');
assert.equal(presentation.offers[0].constructionPresentation.construction.requiredCycles,3);
assert.equal(presentation.offers[0].presentation.construction,null,'completed reference is separate');
record(ActionKinds.VASSAL_CONFIRM_LIFE_NODE,{nodeId});
assert.equal(getHousingCapacity(state,site.regionId),0,'sites provide no Housing');
assert.equal(getStructureCount(state,site.regionId,'mudHouses'),0,'sites are not completed Structures');
const initial=serializeGameState(state);
advanceReplayStateToSecond(state,3);
assert.equal(local.structureSlots[0].construction.completedCycles,0,'an unpaid cycle never advances');
// Logging supplies Construction through the same seasonal production used by replay.
// Capture a fresh authoritative anchor with real stocked hosts.
local.practiceSlots=fiveSlots(practiceSlot('logging',2));
const buildTimeline=createTimelineFromInitialState(state);
advanceReplayStateToSecond(state,9);
assert.equal(local.structureSlots[0].construction.completedCycles,1);
assert.equal(local.structureSlots[1].construction.completedCycles,1);
assert.equal(local.practiceSlots[0].stock,2,'seasonal output pays each commissioned house pays separately');
const partial=serializeGameState(state), restored=deserializeGameState(partial);
advanceReplayStateToSecond(state,81);advanceReplayStateToSecond(restored,81);
equalState(serializeGameState(restored),serializeGameState(state),'part-built save resumes identically');
assert.ok(local.structureSlots.filter(Boolean).every(slot=>!slot.construction),'three paid cycles complete both houses');
assert.equal(getHousingCapacity(state,site.regionId),60,'completed duplicate Housing stacks');
const rebuilt=rebuildStateAtSecond(buildTimeline,81);assert.equal(rebuilt.ok,true,rebuilt.reason);
equalState(canonicalizeSnapshot(serializeGameState(rebuilt.state)),canonicalizeSnapshot(serializeGameState(state)),'authoritative replay matches construction ticks');
const stagedReplay=rebuildStateAtSecond(timeline,0);assert.equal(stagedReplay.ok,true,stagedReplay.reason);
equalState(canonicalizeSnapshot(serializeGameState(stagedReplay.state)),canonicalizeSnapshot(initial),'repeated purchases and undo replay');
const projection=buildProjectionChunkFromStateData(partial,9,81);
equalState(canonicalizeSnapshot(projection.lastStateData),canonicalizeSnapshot(serializeGameState(state)),'forecast uses the same construction rules');

// Multi-trait recipes fail atomically and passive modifiers remain dormant.
const atomic=deserializeGameState(partial), a=atomic.world.sites.find(s=>s.regionId===site.regionId).detailedState;
a.structureSlots.fill(null);
a.structureSlots[0]={structureId:'stoneHouse',placementId:'atomic',origin:0,width:1,construction:{completedCycles:0}};
a.practiceSlots=fiveSlots(practiceSlot('logging',3));
const saved=serializeGameState(atomic);runConstructionCycles(atomic,'housing');
equalState(serializeGameState(atomic),saved,'missing Tool preserves every Construction Stock');
assert.ok(getStockShopGenerationContext(atomic,{classId:null}).unmetStockOutputs.includes('Tool'),'Stock Supply recognizes site needs');
a.practiceSlots[1]=practiceSlot('toolmaking',1);runConstructionCycles(atomic,'housing');
assert.equal(a.structureSlots[0].construction.completedCycles,1);
assert.equal(a.practiceSlots[0].stock,1);assert.equal(a.practiceSlots[1].stock,0);
a.structureSlots[0]={structureId:'storehouse',placementId:'passive',origin:0,width:1,construction:{completedCycles:0}};
assert.deepEqual(structureModifiers(atomic,a),[],'unfinished buildings grant no passive modifier');
const face=getGamepieceFace(atomic,'structure','stoneHouse','silver',{slot:{construction:{completedCycles:2}}});
assert.deepEqual(face.inputs.map(i=>i.traits),[['Construction'],['Tool']]);
assert.deepEqual([face.construction.completedCycles,face.construction.requiredCycles],[2,4]);
const supply=createNewGameState(42), [receiver,donor]=getDetailedSettlementSites(supply,{playerOnly:true});
for(const site of getDetailedSettlementSites(supply)) {
  site.detailedState.practiceSlots=fiveSlots();site.detailedState.structureSlots.fill(null);
}
const siteSlot=(id)=>({structureId:'mudHouses',placementId:id,origin:0,width:1,construction:{completedCycles:0}});
receiver.detailedState.structureSlots[0]=siteSlot('receiver');
donor.detailedState.structureSlots[0]=siteSlot('donor');
donor.detailedState.practiceSlots=fiveSlots(practiceSlot('logging',1));
runConstructionCycles(supply,'housing');
assert.equal(donor.detailedState.structureSlots[0].construction.completedCycles,1,'a local site has first claim on its own Stock');
assert.equal(receiver.detailedState.structureSlots[0].construction.completedCycles,0,'earlier regions cannot steal the donor cycle');
donor.detailedState.practiceSlots[0].stock=2;runConstructionCycles(supply,'housing');
assert.equal(donor.detailedState.structureSlots[0].construction.completedCycles,2);
assert.equal(receiver.detailedState.structureSlots[0].construction.completedCycles,1,'connected adjacent leftovers pay a remote site');
assert.equal(donor.detailedState.practiceSlots[0].stock,0,'shared recipes debit the supplying host');
getRegionState(supply,donor.regionId).controller='external-a';
donor.detailedState.practiceSlots[0].stock=2;runConstructionCycles(supply,'housing');
assert.equal(receiver.detailedState.structureSlots[0].construction.completedCycles,1,'neutral Stock cannot pay player construction');
assert.equal(donor.detailedState.structureSlots[0].construction.completedCycles,2,'neutrals do not construct autonomously');
for(const def of Object.values(settlementStructureDefs)) {
  assert.ok(def.construction.cycles>=3&&def.construction.consume.length>0&&def.construction.consume.length<=3,def.id);
  assert.ok(def.vassalPrestigeCost<10&&def.vassalPhaseCost<12,def.id);
}
const housing=['mudHouses','timberHouse','stoneHouse','longhouse','tenement','greatDwelling'].map(id=>settlementStructureDefs[id]);
assert.ok(housing.every((d,i)=>!i||d.housing/d.footprint>housing[i-1].housing/housing[i-1].footprint),'Housing density rises across the ladder');
console.log('[structure-construction] repeatable plans, atomic paid cycles, completion, costs, save/replay/forecast OK');
