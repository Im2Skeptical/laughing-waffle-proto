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
site.structureSlots=normalizeStructureLayout([{structureId:'granary'},{structureId:'mudHouses'},null,null,{structureId:'longhouse',width:2}],8,id=>settlementStructureDefs[id]);
const confirmed=structuredClone(site.structureSlots);
const node=vassal.lifeMap.nodeStates[nodeId];
node.inventory=[['workshop',1],['greatDwelling',3],['granary',1]].map(([structureId],index)=>({offerId:`fixture:${index}`,inventoryIndex:index,label:structureId,basePrestigeCost:10,basePhaseCost:1,intervention:{kind:'structure',mode:'add',targetRegionId:vassal.locationRegionId,structureId,tier:'bronze'}}));
const timeline=createTimelineFromInitialState(state);
function record(kind,payload){appendActionAtCursor(timeline,{kind,payload,tSec:0},state);dispatch(state,kind,payload);}
record(ActionKinds.VASSAL_PURCHASE_SHOP_OFFER,{nodeId,offerId:'fixture:0'});
assert.equal(node.purchasedOffers[0].placement.origin,2,'tap chooses free span first');
record(ActionKinds.VASSAL_PURCHASE_SHOP_OFFER,{nodeId,offerId:'fixture:1',origin:4});
assert.deepEqual(site.structureSlots,confirmed,'draft demolition never touches the live strip');
assert.equal(getVassalNodeDecisionPresentation(state,nodeId).settlement.demolishedStructures[0].structureId,'longhouse');
const beforeRejected=serializeGameState(state);
assert.equal(applyAction(state,{kind:ActionKinds.VASSAL_PURCHASE_SHOP_OFFER,payload:{nodeId,offerId:'fixture:2',origin:5}},{isReplay:true}).reason,'stagedStructureOverlap');
assert.deepEqual(serializeGameState(state),beforeRejected,'rejected overlap is atomic');
record(ActionKinds.VASSAL_MOVE_SHOP_STRUCTURE,{nodeId,offerId:'fixture:0',origin:3});
record(ActionKinds.VASSAL_UNDO_SHOP_PURCHASE,{nodeId,offerId:node.purchasedOffers.find(p=>p.sourceOfferId==='fixture:1').offerId});
assert.deepEqual(getVassalNodeDecisionPresentation(state,nodeId).settlement.demolishedStructures,[],'undo restores the confirmed Hostel');
record(ActionKinds.VASSAL_PURCHASE_SHOP_OFFER,{nodeId,offerId:'fixture:1',origin:0});
const preview=getVassalNodeDecisionPresentation(state,nodeId).settlement.structures;
assert.deepEqual(preview.filter(Boolean).map(p=>[p.origin,p.structureId]),[[0,'greatDwelling'],[3,'workshop'],[4,'longhouse']]);
const replay=rebuildStateAtSecond(timeline,0);assert.equal(replay.ok,true);
assert.deepEqual(owned(replay.state),owned(state),'purchase, move and undo replay exactly');
assert.deepEqual(owned(deserializeGameState(serializeGameState(state))),owned(state));
record(ActionKinds.VASSAL_CONFIRM_LIFE_NODE,{nodeId});
assert.deepEqual(site.structureSlots.filter(Boolean).map(p=>[p.origin,p.structureId]),preview.filter(Boolean).map(p=>[p.origin,p.structureId]),'confirmation equals the final tableau');
assert.equal(occupiedCells(site.structureSlots).filter(Boolean).length,6);
assert.deepEqual(owned(rebuildStateAtSecond(timeline,0).state),owned(state),'demolition and build confirmation replay exactly');

console.log('[settlement-redesign] placement actions, confirmation and replay OK');

// A full board retains displaced originals and purchases for the entire visit.
const practiceState = createInitialState('devPlaytesting01', 422);
practiceState.paused=true; practiceState.phase='planning';
dispatch(practiceState,ActionKinds.SETTLEMENT_SELECT_VASSAL,{candidateIndex:0,expectedPoolHash:getVassalCandidatePool(practiceState).expectedPoolHash});
const pv=getCurrentLifeMapVassal(practiceState); pv.prestige=1000;
const pn=pv.lifeMap.graph.nodes.find(node=>node.family==='practiceReform').id;
pv.lifeMap.availableNodeIds=[pn]; dispatch(practiceState,ActionKinds.VASSAL_ENTER_LIFE_NODE,{nodeId:pn});
const ps=practiceState.world.sites.find(site=>site.regionId===pv.locationRegionId).detailedState;
ps.practiceSlots=['forage','pastoralism','logging','surfaceMining','barter'].map(practiceId=>({practiceId,tier:'bronze',stock:2,charge:0,work:0}));
const originalPractices=structuredClone(ps.practiceSlots);
pv.lifeMap.nodeStates[pn].inventory=['dryFarming','quarrying'].map((practiceId,index)=>({offerId:'ux:'+index,inventoryIndex:index,label:practiceId,basePrestigeCost:10,basePhaseCost:1,intervention:{kind:'practice',mode:'learn',practiceId,resultingTier:'bronze',targetRegionId:pv.locationRegionId}}));
const pt=createTimelineFromInitialState(practiceState);
const recordPractice=(kind,payload)=>{appendActionAtCursor(pt,{kind,payload,tSec:0},practiceState);dispatch(practiceState,kind,payload);};
const purchase={nodeId:pn,offerId:'ux:0',toIndex:0,replacePracticeId:'logging'};
const beforePreview=serializeGameState(practiceState);
const predicted=getVassalNodeDecisionPresentation(practiceState,pn,{draftMove:{kind:'practice',id:'ux:0',fromOffer:true,toIndex:0,replacePracticeId:'logging'}});
assert.equal(predicted.draftPreview.ok,true);
assert.deepEqual(serializeGameState(practiceState),beforePreview,'preview leaves all state and RNG untouched');
recordPractice(ActionKinds.VASSAL_PURCHASE_SHOP_OFFER,purchase);
let presented=getVassalNodeDecisionPresentation(practiceState,pn);
assert.deepEqual(presented.settlement.practices,predicted.settlement.practices,'purchase matches its preview');
assert.deepEqual(presented.settlement.discardedPractices.map(p=>p.practiceId),['logging'],'any selected original can be replaced');
assert.deepEqual(ps.practiceSlots,originalPractices,'draft leaves the confirmed board untouched');
recordPractice(ActionKinds.VASSAL_PURCHASE_SHOP_OFFER,{nodeId:pn,offerId:'ux:1',toIndex:2});
assert.equal(getVassalNodeDecisionPresentation(practiceState,pn).purchases.length,2,'one visit permits multiple affordable purchases');
const move={kind:'practice',id:'practice:logging',toIndex:1};
const recovery=getVassalNodeDecisionPresentation(practiceState,pn,{draftMove:move});
recordPractice(ActionKinds.VASSAL_REORDER_SHOP_PURCHASE,{nodeId:pn,offerId:move.id,toIndex:1});
presented=getVassalNodeDecisionPresentation(practiceState,pn);
assert.deepEqual(presented.settlement.practices,recovery.settlement.practices,'discard recovery matches its preview');
assert.equal(presented.settlement.practices[1].stock,2,'recovery retains hosted stock');
assert.equal(presented.settlement.practices[1].charge,0,'recovery retains charge');
recordPractice(ActionKinds.VASSAL_REORDER_SHOP_PURCHASE,{nodeId:pn,offerId:'practice:dryFarming',toIndex:5});
assert.ok(getVassalNodeDecisionPresentation(practiceState,pn).settlement.discardedPractices.some(p=>p.practiceId==='dryFarming'),'purchased cards can also enter discard');
recordPractice(ActionKinds.VASSAL_REORDER_SHOP_PURCHASE,{nodeId:pn,offerId:'practice:dryFarming',toIndex:0});
assert.equal(getVassalNodeDecisionPresentation(practiceState,pn).settlement.practices[0].practiceId,'dryFarming','purchased cards can return from discard');
assert.deepEqual(owned(rebuildStateAtSecond(pt,0).state),owned(practiceState),'discard actions replay exactly');
assert.deepEqual(owned(deserializeGameState(serializeGameState(practiceState))),owned(practiceState),'draft order survives JSON save/reload');
const expectedBoard=getVassalNodeDecisionPresentation(practiceState,pn).settlement.practices.map(p=>p?.practiceId ?? null);
recordPractice(ActionKinds.VASSAL_CONFIRM_LIFE_NODE,{nodeId:pn});
assert.deepEqual(ps.practiceSlots.map(p=>p?.practiceId ?? null),expectedBoard,'commit uses the last preview');
assert.deepEqual(owned(rebuildStateAtSecond(pt,0).state),owned(practiceState),'replacement confirmation replays exactly');

// The preceding Structure scenario is resolving; use a fresh shop sandbox for
// recoverable demolition and placement rejection without mutating live sites.
const {createLabNodeSandbox}=await import('../dev-lab/node-sandbox.js');
const sandbox=createLabNodeSandbox({type:'publicWorks',prestige:1000});
const sv=getCurrentLifeMapVassal(sandbox.state), sn=sandbox.nodeId;
const ss=sandbox.state.world.sites.find(site=>site.regionId===sv.locationRegionId).detailedState;
const structure=ss.structureSlots.find(Boolean);
const oldStrip=structuredClone(ss.structureSlots);
dispatch(sandbox.state,ActionKinds.VASSAL_MOVE_SHOP_STRUCTURE,{nodeId:sn,offerId:'structure:'+structure.placementId,origin:null});
assert.ok(getVassalNodeDecisionPresentation(sandbox.state,sn).settlement.demolishedStructures.some(p=>p.placementId===structure.placementId));
const structurePreview=getVassalNodeDecisionPresentation(sandbox.state,sn,{draftMove:{kind:'structure',id:'structure:'+structure.placementId,origin:structure.origin}});
dispatch(sandbox.state,ActionKinds.VASSAL_MOVE_SHOP_STRUCTURE,{nodeId:sn,offerId:'structure:'+structure.placementId,origin:structure.origin});
assert.deepEqual(getVassalNodeDecisionPresentation(sandbox.state,sn).settlement.structures,structurePreview.settlement.structures);
assert.deepEqual(ss.structureSlots,oldStrip,'structure discard edits are draft-only');
const beforeInvalid=serializeGameState(sandbox.state);
assert.equal(applyAction(sandbox.state,{kind:ActionKinds.VASSAL_MOVE_SHOP_STRUCTURE,payload:{nodeId:sn,offerId:'structure:'+structure.placementId,origin:99}},{isReplay:true}).ok,false);
assert.deepEqual(serializeGameState(sandbox.state),beforeInvalid,'invalid recovery is atomic');
console.log('[settlement-redesign] replacement, multiple purchases, recoverable discard, preview and replay OK');
