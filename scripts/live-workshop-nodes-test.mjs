import assert from 'node:assert/strict';
import { createInitialState } from '../src/model/init.js';
import { ActionKinds as A, applyAction } from '../src/model/actions.js';
import { serializeGameState, deserializeGameState } from '../src/model/state.js';
import { getCurrentLifeMapVassal, selectLifeMapVassal, getVassalCandidatePool, getVassalNodeDecisionPresentation } from '../src/model/vassal-life-map.js';
import { advanceReplayStateToSecond, initializeReplayClock } from '../src/model/replay-second-runner.js';
import { createTimelineFromInitialState, appendActionAtCursor, rebuildStateAtSecond } from '../src/model/timeline/index.js';
import { nodeIdForFamily } from '../src/model/tests/vassal-life-map/helpers.js';
import { buildCampaignOptions, campaignForces } from '../src/model/vassal-life-map/campaign.js';
import { runLifeDecisionJob } from '../src/model/vassal-life-map/decision-preparation.js';
import { legacySettlementTargets } from '../src/model/vassal-life-map/world-choices.js';
import { getDetailedPracticeDef, getDetailedStructureDef } from '../src/model/game-config.js';
import { addWorldConnection, getWorldConnectionCandidates, getWorldDefinition } from '../src/model/world-state.js';
import { VASSAL_INTERVENTION_PRACTICE_IDS } from '../src/defs/gamepieces/detailed-settlement-defs.js';
import { seedNeutralSettlements, seedOpeningMonster } from '../src/model/detailed-settlements/external-world.js';
import { generateRelicOffers } from '../src/model/vassal-life-map/heirlooms.js';

function selected(classId='warrior',seed=42) {
  const state=createInitialState('devPlaytesting01',seed);
  state.gameConfig.settings.values.primordialBasePressure=0;
  Object.assign(state.civilization.vassalLineage,{founderClassId:classId,establishedClassId:classId});
  const candidate={...getVassalCandidatePool(state).candidates[0],classId,founderClassId:null,archetype:classId==='scholar'?'Scholar':'Warrior',age:18,prestige:100};
  assert.equal(selectLifeMapVassal(state,0,null,candidate).ok,true);
  const v=getCurrentLifeMapVassal(state);
  if(v.commissionOffers?.length)act(state,A.VASSAL_CHOOSE_COMMISSION,{offerId:v.commissionOffers[0].offerId});
  initializeReplayClock(state,state.tSec);
  return state;
}
function act(state,kind,payload={}) {
  const result=applyAction(state,{kind,payload},{isReplay:true});assert.equal(result.ok,true,result.reason);return result;
}
function enter(state,family) {
  const v=getCurrentLifeMapVassal(state),nodeId=nodeIdForFamily(state,family);
  v.lifeMap.availableNodeIds=[nodeId];act(state,A.VASSAL_ENTER_LIFE_NODE,{nodeId});
  return v.lifeMap.nodeStates[nodeId];
}
function settle(state) {
  const v=getCurrentLifeMapVassal(state),pending=v?.lifeMap.pendingResolution;
  if(pending)assert.equal(advanceReplayStateToSecond(state,pending.resolveSec).ok,true);
}
function boundary(state,node,success) {
  const v=getCurrentLifeMapVassal(state),option=node.options.find(o=>o.id===node.selectedOptionId);
  for(let seed=0;seed<10000;seed++) {
    state.rng.vassalSeed=seed;
    const copy=deserializeGameState(serializeGameState(state));
    if((copy.rngNextVassalInt(1,100)>option.risk)===success)return;
  }
  throw new Error('No encounter roll fixture');
}

{
  const state=selected(),v=getCurrentLifeMapVassal(state);
  assert.ok(generateRelicOffers(state,v).every(o=>o.immediateDeathChance===0));
  assert.ok(generateRelicOffers(state,v,{special:true}).filter(o=>o.definitionId).every(o=>o.immediateDeathChance>=.35));
}

// Specialty selection is explicit and pays Random once. Pressure is deferred to checkout.
{
  const state=selected(),v=getCurrentLifeMapVassal(state),node=enter(state,'practiceReform');
  assert.equal(node.inventory.length,0);assert.equal(node.shopSelection.choices.length,3);
  const seed=state.rng.vassalSeed;
  getVassalNodeDecisionPresentation(state,node.nodeId);getVassalNodeDecisionPresentation(state,node.nodeId);
  assert.equal(state.rng.vassalSeed,seed,'reading choices is inert');
  const before=v.prestige;
  act(state,A.VASSAL_SELECT_LIFE_OPTION,{nodeId:node.nodeId,optionId:'random'});
  assert.equal(v.prestige,before+10);
  assert.equal(applyAction(state,{kind:A.VASSAL_SELECT_LIFE_OPTION,payload:{nodeId:node.nodeId,optionId:'random'}},{isReplay:true}).ok,false);
  v.prestige=0;
  const offer=node.inventory[0],pressure=state.civilization.chaos.monsterPressure;
  act(state,A.VASSAL_PURCHASE_SHOP_OFFER,{nodeId:node.nodeId,offerId:offer.offerId});
  assert.equal(node.purchasedOffers[0].monsterPressureCost,10);assert.equal(v.prestige,0);
  assert.equal(state.civilization.chaos.monsterPressure,pressure);
  act(state,A.VASSAL_UNDO_SHOP_PURCHASE,{nodeId:node.nodeId,offerId:offer.offerId});
  assert.equal(state.civilization.chaos.monsterPressure,pressure);
  act(state,A.VASSAL_PURCHASE_SHOP_OFFER,{nodeId:node.nodeId,offerId:offer.offerId});
  const restored=deserializeGameState(serializeGameState(state));
  act(state,A.VASSAL_CONFIRM_LIFE_NODE,{nodeId:node.nodeId});
  act(restored,A.VASSAL_CONFIRM_LIFE_NODE,{nodeId:node.nodeId});
  assert.equal(state.civilization.chaos.monsterPressure,pressure+10);
  assert.deepEqual(serializeGameState(state),serializeGameState(restored));
}
for(const kind of ['practiceReform','publicWorks']) {
  const state=selected('scholar'),v=getCurrentLifeMapVassal(state),node=enter(state,kind);
  const choice=node.shopSelection.choices.find(c=>c.enabled&&c.id!=='random');
  act(state,A.VASSAL_SELECT_LIFE_OPTION,{nodeId:node.nodeId,optionId:choice.id});
  assert.ok(node.inventory.length);
  for(const offer of node.inventory) {
    const change=offer.intervention;
    const def=change.kind==='practice'?getDetailedPracticeDef(state,change.practiceId):getDetailedStructureDef(state,change.structureId);
    if(kind==='practiceReform')assert.ok(def.stockTraits.includes(choice.id));
    else if(choice.id==='Housing')assert.ok(def.housing||def.tags.includes('Housing'));
  }
}

// Tour is deterministic and can reveal a real Relic before its acquisition choice.
for(const wantRelic of [false,true]) {
  let state,node;
  for(let seed=0;seed<40;seed++) {
    state=selected('warrior',seed);node=enter(state,'travel');
    act(state,A.VASSAL_SELECT_LIFE_OPTION,{nodeId:node.nodeId,optionId:'tour'});
    const fork=deserializeGameState(serializeGameState(state));
    act(fork,A.VASSAL_CONFIRM_LIFE_NODE,{nodeId:node.nodeId});
    if(!!getCurrentLifeMapVassal(fork).lifeMap.nodeStates[node.nodeId].rewardAcquisition===wantRelic)break;
  }
  const timeline=createTimelineFromInitialState(state),before=serializeGameState(state);
  const action={kind:A.VASSAL_CONFIRM_LIFE_NODE,payload:{nodeId:node.nodeId}};
  assert.equal(appendActionAtCursor(timeline,{...action,tSec:state.tSec},state).ok,true);
  act(state,action.kind,action.payload);
  if(wantRelic) {
    assert.ok(node.rewardAcquisition);assert.equal(state.tSec,before.tSec);
    assert.equal(getVassalNodeDecisionPresentation(state,node.nodeId).node.family,'relic');
    const acquisition={nodeId:node.nodeId,acquire:{destination:'carry'}};
    assert.equal(appendActionAtCursor(timeline,{kind:A.VASSAL_CONFIRM_LIFE_NODE,payload:acquisition,tSec:state.tSec},state).ok,true);
    act(state,A.VASSAL_CONFIRM_LIFE_NODE,acquisition);
  }
  settle(state);
  const rebuilt=rebuildStateAtSecond(timeline,state.tSec);assert.equal(rebuilt.ok,true);
  assert.deepEqual(serializeGameState(rebuilt.state),serializeGameState(state));
}

// All Legacy choices are free and affect real successors or a real settlement.
for(const choice of ['highest-stat','accumulated-prestige','found-settlement']) {
  const state=selected(),v=getCurrentLifeMapVassal(state);
  v.stats.wisdom=8;v.prestige=67;
  if(choice==='found-settlement'&&!legacySettlementTargets(state,v).length) {
    const edge=getWorldConnectionCandidates(getWorldDefinition(state)).find(edge=>
      [edge.regionAId,edge.regionBId].includes(v.locationRegionId)&&state.world.regions.some(r=>r.id===(edge.regionAId===v.locationRegionId?edge.regionBId:edge.regionAId)&&r.controller==='frontier'&&!r.monster));
    assert.ok(edge);assert.equal(addWorldConnection(state,edge.regionAId,edge.regionBId).ok,true);
  }
  const node=enter(state,'legacy');
  if(choice==='found-settlement') {
    v.prestige=0;
    const source=state.world.sites.find(s=>s.regionId===v.locationRegionId).detailedState;
    source.populationByClass.villager.adults=0;
    const id=legacySettlementTargets(state,v)[0];
    act(state,A.VASSAL_SELECT_LIFE_OPTION,{nodeId:node.nodeId,optionId:`legacy-target:${id}`});
    act(state,A.VASSAL_CONFIRM_LIFE_NODE,{nodeId:node.nodeId});
    assert.equal(state.world.regions.find(r=>r.id===id).controller,'player');
    assert.equal(source.populationByClass.villager.adults,0);
  } else {
    act(state,A.VASSAL_SELECT_LIFE_OPTION,{nodeId:node.nodeId,optionId:choice});
    act(state,A.VASSAL_CONFIRM_LIFE_NODE,{nodeId:node.nodeId});
    if(choice==='highest-stat')assert.equal(state.civilization.vassalLegacy.futureStartingStatBonuses.wisdom,2);
    else assert.equal(state.civilization.vassalLegacy.futureStartingPrestigeBonus,6);
  }
  assert.equal(getCurrentLifeMapVassal(state),null);
  deserializeGameState(serializeGameState(state));
}

// Campaign is Warrior-only, uses different forces, supports continuation, and persists victories.
for(const success of [true,false]) {
  const state=selected(),v=getCurrentLifeMapVassal(state),node=enter(state,'campaign');
  act(state,A.VASSAL_SELECT_LIFE_OPTION,{nodeId:node.nodeId,optionId:'campaign-mode:duel'});
  boundary(state,node,success);
  const prestige=v.prestige,prowess=v.stats.intelligence,sec=state.tSec;
  act(state,A.VASSAL_CONFIRM_LIFE_NODE,{nodeId:node.nodeId});settle(state);
  assert.ok(state.tSec>sec);assert.equal(v.lifeMap.currentNodeId,node.nodeId);
  assert.equal(node.campaign.failed,!success);
  if(success){assert.equal(v.stats.intelligence,prowess+1);assert.equal(v.prestige,prestige+25);}
  else {assert.equal(v.stats.intelligence,prowess);assert.equal(v.isDead,false);}
  const restored=deserializeGameState(serializeGameState(state));
  assert.deepEqual(serializeGameState(restored),serializeGameState(state));
  assert.ok(!buildCampaignOptions(state,v,node).some(o=>o.stage==='duel')||!success);
}
{
  const state=selected('scholar'),v=getCurrentLifeMapVassal(state),nodeId=nodeIdForFamily(state,'campaign');
  v.commissionOffers=[];v.lifeMap.availableNodeIds=[nodeId];
  assert.equal(applyAction(state,{kind:A.VASSAL_ENTER_LIFE_NODE,payload:{nodeId}},{isReplay:true}).ok,false);
}

// Each target changes authoritative world state; worker, replay and saved continuation agree.
for(const stage of ['clear','nest','alliance','quest']) {
  const state=selected(),v=getCurrentLifeMapVassal(state);
  seedNeutralSettlements(state);seedOpeningMonster(state);
  const source=state.world.sites.find(s=>s.regionId===v.locationRegionId).detailedState;
  const food=source.practiceSlots.find(p=>p&&getDetailedPracticeDef(state,p.practiceId).stockTraits.includes('Edible'));
  assert.ok(food);food.stock=1000;
  const monster=state.world.regions.find(r=>r.monster);assert.ok(monster);
  if(stage==='nest')monster.monster.cleared=true;
  const node=enter(state,'campaign'),target=node.options.find(o=>o.stage===stage);assert.ok(target,stage);
  act(state,A.VASSAL_SELECT_LIFE_OPTION,{nodeId:node.nodeId,optionId:target.id});boundary(state,node,true);
  const base=serializeGameState(state),timeline=createTimelineFromInitialState(state),actions=[];
  const commit=payload=>{
    const action={kind:A.VASSAL_CONFIRM_LIFE_NODE,payload};actions.push(action);
    assert.equal(appendActionAtCursor(timeline,{...action,tSec:state.tSec},state).ok,true);
    act(state,action.kind,action.payload);
  };
  commit({nodeId:node.nodeId});
  if(stage==='quest'){
    assert.ok(node.rewardAcquisition,'Quest stages an actual Relic');
    const messages=[];await runLifeDecisionJob({stateData:base,actions},m=>messages.push(m));
    assert.deepEqual(messages.find(m=>m.kind==='ready').stateData,serializeGameState(state),'worker preserves the acquisition boundary');
    commit({nodeId:node.nodeId,acquire:{destination:'carry'}});
  }
  const saved=deserializeGameState(serializeGameState(state));settle(state);settle(saved);
  assert.deepEqual(serializeGameState(saved),serializeGameState(state),'save during encounter resumes identically');
  const replay=rebuildStateAtSecond(timeline,state.tSec);assert.equal(replay.ok,true);
  assert.deepEqual(serializeGameState(replay.state),serializeGameState(state));
  const messages=[];await runLifeDecisionJob({stateData:base,actions},m=>messages.push(m));
  assert.deepEqual(messages.find(m=>m.kind==='ready').stateData,serializeGameState(state),`${stage} worker matches authoritative ticks`);
  const region=state.world.regions.find(r=>r.id===target.regionId);
  if(stage==='clear')assert.equal(region.monster.cleared,true);
  if(stage==='nest')assert.equal(region.monster,undefined);
  if(stage==='alliance')assert.equal(region.controller,'player');
  if(stage==='quest')assert.ok(node.campaign.questRegionIds.includes(target.regionId));
  act(state,A.VASSAL_SELECT_LIFE_OPTION,{nodeId:node.nodeId,optionId:'campaign-leave'});
  act(state,A.VASSAL_CONFIRM_LIFE_NODE,{nodeId:node.nodeId});
  assert.ok(v.lifeMap.completedNodeIds.includes(node.nodeId),'Leave advances the graph');
}
{
  const state=selected(),v=getCurrentLifeMapVassal(state);seedOpeningMonster(state);
  const source=state.world.sites.find(s=>s.regionId===v.locationRegionId).detailedState;
  source.practiceSlots.find(p=>p&&getDetailedPracticeDef(state,p.practiceId).stockTraits.includes('Edible')).stock=100;
  const node=enter(state,'campaign'),target=node.options.find(o=>o.stage==='clear');
  act(state,A.VASSAL_SELECT_LIFE_OPTION,{nodeId:node.nodeId,optionId:target.id});
  delete state.world.regions.find(r=>r.id===target.regionId).monster;
  const before=serializeGameState(state);
  assert.equal(applyAction(state,{kind:A.VASSAL_CONFIRM_LIFE_NODE,payload:{nodeId:node.nodeId}},{isReplay:true}).ok,false);
  assert.ok(JSON.stringify(serializeGameState(state))===JSON.stringify(before),'a stale target rejects before payment or RNG');
}
{
  const state=selected(),v=getCurrentLifeMapVassal(state),source=state.world.sites.find(s=>s.regionId===v.locationRegionId).detailedState;
  source.populationByClass.villager.specialists.warrior.adults=7;
  const armsId=VASSAL_INTERVENTION_PRACTICE_IDS.find(id=>getDetailedPracticeDef(state,id)?.stockTraits.includes('Arms'));
  assert.ok(armsId);source.practiceSlots[0]={...source.practiceSlots[0],practiceId:armsId,stock:4};
  const forces=campaignForces(state,v);
  assert.equal(forces.duel.total,forces.duel.prowess);
  assert.equal(forces.quest.total,forces.quest.prowess+forces.quest.retinue);
  assert.equal(forces.attack.total,forces.quest.total+Math.min(forces.attack.warriors,forces.attack.arms));
  assert.ok(forces.attack.total>forces.quest.total,'armed Warriors increase Attack force');
}
console.log('[live-workshop-nodes] OK: specialties, pressure, Tour, Legacy, all Campaign outcomes, forces and save/replay/worker parity');
