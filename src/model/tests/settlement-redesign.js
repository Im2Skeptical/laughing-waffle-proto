import assert from 'node:assert/strict';
import { createInitialState } from '../init.js';
import { ActionKinds, applyAction } from '../actions.js';
import { getCurrentLifeMapVassal, getVassalCandidatePool, getVassalNodeDecisionPresentation } from '../vassal-life-map.js';
import { serializeGameState, deserializeGameState } from '../state.js';
import { createTimelineFromInitialState, appendActionAtCursor, rebuildStateAtSecond } from '../timeline/index.js';
import { normalizeStructureLayout, occupiedCells } from '../structure-layout.js';
import { detailedSettlementPracticeDefs, settlementStructureDefs } from '../../defs/gamepieces/detailed-settlement-defs.js';
import { stepDetailedSettlementsSecond } from '../detailed-settlements.js';
import { getGamepieceFace } from '../gamepiece-presentation.js';

function owned(target) {
  const v=getCurrentLifeMapVassal(target);
  return { tSec:target.tSec,rng:target.rng,prestige:v?.prestige,lifeMap:v?.lifeMap,events:v?.lifeEvents,
    settlements:target.world.sites.map(s=>({structures:s.detailedState.structureSlots,practices:s.detailedState.practiceSlots,floor:s.detailedState.happinessFloor,population:s.detailedState.populationByClass})) };
}
const state = createInitialState('devPlaytesting01', 422);
state.paused=true;state.phase='planning';
state.gameConfig.settings.values.primordialBasePressure=0;
function dispatch(target,kind,payload){const result=applyAction(target,{kind,payload},{isReplay:true});assert.equal(result.ok,true,`${kind}: ${result.reason}`);return result;}
dispatch(state,ActionKinds.SETTLEMENT_SELECT_VASSAL,{candidateIndex:0,expectedPoolHash:getVassalCandidatePool(state).expectedPoolHash});
const vassal=getCurrentLifeMapVassal(state);vassal.prestige=1000;
const nodeId=vassal.lifeMap.graph.nodes.find(node=>node.family==='publicWorks').id;
vassal.lifeMap.availableNodeIds=[nodeId];
dispatch(state,ActionKinds.VASSAL_ENTER_LIFE_NODE,{nodeId});
const site=state.world.sites.find(site=>site.regionId===vassal.locationRegionId).detailedState;
state.world.regions.find(region=>region.id===vassal.locationRegionId).structureCapacity=8;
site.structureSlots=normalizeStructureLayout([{structureId:'granary'},{structureId:'mudHouses'},null,null,{structureId:'hostel',width:2}],8,id=>settlementStructureDefs[id]);
const confirmed=structuredClone(site.structureSlots);
const node=vassal.lifeMap.nodeStates[nodeId];
node.inventory=[['library',1],['university',3],['smokehouse',1]].map(([structureId],index)=>({offerId:`fixture:${index}`,inventoryIndex:index,label:structureId,basePrestigeCost:10,basePhaseCost:1,intervention:{kind:'structure',mode:'add',targetRegionId:vassal.locationRegionId,structureId,tier:'bronze'}}));
const timeline=createTimelineFromInitialState(state);
function record(kind,payload){appendActionAtCursor(timeline,{kind,payload,tSec:0},state);dispatch(state,kind,payload);}
record(ActionKinds.VASSAL_PURCHASE_SHOP_OFFER,{nodeId,offerId:'fixture:0'});
assert.equal(node.purchasedOffers[0].placement.origin,2,'tap chooses free span first');
record(ActionKinds.VASSAL_PURCHASE_SHOP_OFFER,{nodeId,offerId:'fixture:1',origin:4});
assert.deepEqual(site.structureSlots,confirmed,'draft demolition never touches the live strip');
assert.equal(getVassalNodeDecisionPresentation(state,nodeId).settlement.demolishedStructures[0].structureId,'hostel');
const beforeRejected=serializeGameState(state);
assert.equal(applyAction(state,{kind:ActionKinds.VASSAL_PURCHASE_SHOP_OFFER,payload:{nodeId,offerId:'fixture:2',origin:5}},{isReplay:true}).reason,'stagedStructureOverlap');
assert.deepEqual(serializeGameState(state),beforeRejected,'rejected overlap is atomic');
record(ActionKinds.VASSAL_MOVE_SHOP_STRUCTURE,{nodeId,offerId:'fixture:0',origin:3});
record(ActionKinds.VASSAL_UNDO_SHOP_PURCHASE,{nodeId,offerId:'fixture:1'});
assert.deepEqual(getVassalNodeDecisionPresentation(state,nodeId).settlement.demolishedStructures,[],'undo restores the confirmed Hostel');
record(ActionKinds.VASSAL_PURCHASE_SHOP_OFFER,{nodeId,offerId:'fixture:1',origin:0});
const preview=getVassalNodeDecisionPresentation(state,nodeId).settlement.structures;
assert.deepEqual(preview.filter(Boolean).map(p=>[p.origin,p.structureId]),[[0,'university'],[3,'library'],[4,'hostel']]);
const replay=rebuildStateAtSecond(timeline,0);assert.equal(replay.ok,true);
assert.deepEqual(owned(replay.state),owned(state),'purchase, move and undo replay exactly');
assert.deepEqual(owned(deserializeGameState(serializeGameState(state))),owned(state));
record(ActionKinds.VASSAL_CONFIRM_LIFE_NODE,{nodeId});
assert.deepEqual(site.structureSlots.filter(Boolean).map(p=>[p.origin,p.structureId]),preview.filter(Boolean).map(p=>[p.origin,p.structureId]),'confirmation equals the final tableau');
assert.equal(occupiedCells(site.structureSlots).filter(Boolean).length,6);
assert.deepEqual(owned(rebuildStateAtSecond(timeline,0).state),owned(state),'demolition and build confirmation replay exactly');

// Every practice is active, workers are optional, and every output is bounded.
for(const def of Object.values(detailedSettlementPracticeDefs)) {
  assert.ok(['scheduled','charge'].includes(def.lane));
  assert.notEqual(def.activation.type,'passive');
  assert.ok(def.workerCapacity>=0&&def.workerBonus>=0);
  assert.ok((def.outputs??[]).length<=3);
}
for(const id of ['smokehouse','caravanserai','countingHouse','resettlementHall'])assert.ok(settlementStructureDefs[id]);
for(const id of ['preserve','caravanRoutes','clearingHouse','exodus'])assert.equal(detailedSettlementPracticeDefs[id],undefined);
assert.equal(settlementStructureDefs.university.footprint,3);
assert.ok(settlementStructureDefs.hostel.nonfunctionalEffects.length);
assert.ok(settlementStructureDefs.resettlementHall.nonfunctionalEffects.length);
const silverGranary = getGamepieceFace(state,'structure','granary','silver');
assert.equal(silverGranary.outputs[0].value,281.25,'Capacity badge agrees with the one-building quality-squared capacity');
assert.ok(silverGranary.detailLines.some(line=>line.includes('combined quality units')));
assert.ok(getGamepieceFace(state,'structure','hostel').detailLines.some(line=>line.includes('nonfunctional')));
assert.ok(getGamepieceFace(state,'practice','harvestFestival','silver').detailLines.some(line=>line.includes('Activates at 2 charge')),'Inspection uses the same rounded threshold as simulation');

const festival=createInitialState('devPlaytesting01',423);
festival.gameConfig.settings.values.primordialBasePressure=0;
festival.gameConfig.gamepieces.practices.harvestFestival.activation.chargeThreshold=1;
for(const site of festival.world.sites)site.detailedState.practiceSlots=[null,null,null,null,null];
const village=festival.world.sites[0].detailedState;
village.practiceSlots=[{practiceId:'forage',tier:'bronze',charge:0,work:0},{practiceId:'harvestFestival',tier:'silver',charge:0,work:0},null,null,null];
village.populationByClass.villager.adults=0;village.populationByClass.villager.eldersByAge=[];village.populationByClass.villager.children=10;
for(const tSec of [2,8,14,20]){festival.tSec=tSec;stepDetailedSettlementsSecond(festival,tSec);}
assert.equal(village.happinessFloor.remainingResolutions,3,'duration stacks additively to three even with no workers');
const restored=deserializeGameState(serializeGameState(festival));
for(const target of [festival,restored])for(const tSec of [22,28,34]){target.tSec=tSec;stepDetailedSettlementsSecond(target,tSec);}
assert.equal(village.happinessFloor.remainingResolutions,0,'each Faith consumes one duration unit');
assert.equal(village.populationByClass.villager.happiness.status,'positive');
assert.deepEqual(owned(festival),owned(restored),'duration survives serialization between activations and Faith');
village.populationByClass.villager.happiness.status='negative';festival.tSec=40;stepDetailedSettlementsSecond(festival,40);
assert.equal(village.populationByClass.villager.happiness.status,'negative','expired floor no longer overrides Faith evidence');
console.log('[settlement-redesign] placement actions, confirmation replay, content and duration OK');
