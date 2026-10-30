import assert from 'node:assert/strict';
import { createNewGameState } from '../src/model/new-game.js';
import { ActionKinds, applyAction } from '../src/model/actions.js';
import { serializeGameState, deserializeGameState } from '../src/model/state.js';
import { getCurrentLifeMapVassal, selectLifeMapVassal, getVassalCandidatePool, getVassalNodeDecisionPresentation } from '../src/model/vassal-life-map.js';
import { getVassalRiskDeathChance, rollScholarQualityBonus, getVassalDelvePhaseCost } from '../src/model/vassal-life-map/class-rules.js';
import { ensureCommissionOffers, chooseVassalCommission, recordCommissionAction, stepVassalCommission } from '../src/model/vassal-life-map/commissions.js';
import { getMartialForce, getRetinue, adjacentRegionIds, stepSpatialPressure } from '../src/model/detailed-settlements/external-world.js';
import { getRegionState } from '../src/model/world-state.js';
import { createDetailedPracticeSlot } from '../src/model/detailed-practice-tiers.js';
import { nodeIdForFamily } from '../src/model/tests/vassal-life-map/helpers.js';
import { classActionOptions } from '../src/model/vassal-life-map/class-actions.js';
import { advanceReplayStateToSecond, initializeReplayClock } from '../src/model/replay-second-runner.js';
import { createTimelineFromInitialState, appendActionAtCursor, rebuildStateAtSecond } from '../src/model/timeline/index.js';
import { runLifeDecisionJob, prepareLifeChoices } from '../src/model/vassal-life-map/decision-preparation.js';
import { acquireHeirloom } from '../src/model/vassal-life-map/heirlooms.js';

function selected(classId) {
  const state = createNewGameState(131);
  state.gameConfig.settings.values.primordialBasePressure = 0;
  state.civilization.vassalLineage.founderClassId = classId;
  state.civilization.vassalLineage.establishedClassId = classId;
  const candidate = getVassalCandidatePool(state).candidates[0];
  Object.assign(candidate,{classId,founderClassId:null,archetype:classId==='scholar'?'Scholar':'Warrior',age:18,prestige:500});
  assert.equal(selectLifeMapVassal(state,0,null,candidate).ok,true);
  return state;
}
const warrior = {classId:'warrior',stats:{intelligence:1}};
assert.ok(Math.abs(getVassalRiskDeathChance(warrior,.5)-.425)<1e-10);
warrior.stats.intelligence=2;
assert.ok(Math.abs(getVassalRiskDeathChance(warrior,.5)-.35)<1e-10);
warrior.stats.intelligence=100;
assert.ok(Math.abs(getVassalRiskDeathChance(warrior,.95)-.2)<1e-10);
assert.equal(getVassalRiskDeathChance(warrior,.5),0);
assert.equal(getVassalRiskDeathChance({classId:'scholar'},.5),.5);

// Guaranteed tiers and surpassing fractions use the serialized Vassal RNG.
for (const points of [0,20,25,40,45,100]) {
  const state=selected('scholar'), v=getCurrentLifeMapVassal(state);v.stats.cunning=points;
  const clone=deserializeGameState(serializeGameState(state));
  const roll=clone.rngNextVassalFloat(), chance=points*.05;
  const expected=Math.min(3,Math.floor(chance)+(chance%1>0&&roll<chance%1?1:0));
  const before=state.rng.vassalSeed;
  assert.equal(rollScholarQualityBonus(state,v,3),expected);
  if(chance%1===0)assert.equal(state.rng.vassalSeed,before,'guaranteed upgrades need no fractional roll');
  else assert.equal(state.rng.vassalSeed,clone.rng.vassalSeed);
  assert.equal(rollScholarQualityBonus(state,v,0),0,'Diamond cannot upgrade');
}

const forceState=selected('warrior'), active=getCurrentLifeMapVassal(forceState);
const before=getMartialForce(forceState);active.stats.intelligence+=3;
assert.equal(getMartialForce(forceState),before+3,'Prowess contributes globally');
const retinue=getRetinue(forceState,active);active.prestige+=100;
assert.equal(getRetinue(forceState,active).value,retinue.value+10,'no population cap');
assert.equal(getMartialForce(forceState),before+13);
const challenges=classActionOptions(forceState,active,'challenge');
assert.deepEqual(challenges.map(o=>o.phaseCost),[6,12,18],'old Challenge-only time reduction is removed');

// A remote active Warrior defends a supplied town even without local Warriors.
const defenseState=selected('warrior'), defender=getCurrentLifeMapVassal(defenseState);
defender.stats.intelligence=100;
const defended=defenseState.world.sites.find(site=>site.regionId===defenseState.civilization.capitalRegionId);
defender.locationRegionId=defenseState.world.sites.find(site=>site.detailedState && site.regionId!==defended.regionId && !site.neutral).regionId;
defended.detailedState.practiceSlots=[createDetailedPracticeSlot('forage','bronze'),createDetailedPracticeSlot('bowmaking','bronze'),createDetailedPracticeSlot('garrisonDuty','bronze'),null,null];
defended.detailedState.practiceSlots[0].stock=3;defended.detailedState.practiceSlots[1].stock=3;
const front=adjacentRegionIds(defenseState,defended.regionId).find(id=>getRegionState(defenseState,id).controller==='frontier');
assert.ok(front);
for(const region of defenseState.world.regions)delete region.monster;
for(const id of adjacentRegionIds(defenseState,front))if(id!==defended.regionId)getRegionState(defenseState,id).monster={defense:2};
getRegionState(defenseState,front).monster={defense:2};
defenseState.civilization.chaos.monsterPressure=100;
const index=defenseState.world.regions.findIndex(r=>r.id===front);
defenseState.civilization.chaos.lastPressureRegionId=defenseState.world.regions[(index+defenseState.world.regions.length-1)%defenseState.world.regions.length].id;
stepSpatialPressure(defenseState);
assert.equal(defended.detailedState.lastDefense?.result,'held');
assert.ok(defended.detailedState.practiceSlots[0].stock<3,'automatic defense still spends Edible');

// The universal RISK pipeline awards a fixed bonus on success, even when
// Prowess guarantees it, and never awards one for a protected failed roll.
for (const scenario of ['success','protectedFailure','safeCampaign']) {
  const protectedFailure=scenario==='protectedFailure';
  const state=selected('warrior'), v=getCurrentLifeMapVassal(state);
  v.stats.intelligence=100;
  const node=v.lifeMap.graph.nodes.find(n=>n.id===nodeIdForFamily(state,'challenge'));
  assert.ok(node);v.lifeMap.availableNodeIds=[node.id];
  assert.equal(applyAction(state,{kind:ActionKinds.VASSAL_ENTER_LIFE_NODE,payload:{nodeId:node.id}},{isReplay:true}).ok,true);
  const decision=v.lifeMap.nodeStates[node.id];
  decision.options=[{id:'risk-boundary',label:'RISK',phaseCost:1,prestigeDelta:9,
    immediateDeathChance:protectedFailure?1:scenario==='safeCampaign'?0:.5,
    ...(scenario==='safeCampaign'?{baseDanger:.2}:{})}];
  if(protectedFailure)assert.equal(acquireHeirloom(state,v,'mandateOfHeaven',{destination:'equip'}).ok,true);
  assert.equal(applyAction(state,{kind:ActionKinds.VASSAL_SELECT_LIFE_OPTION,payload:{nodeId:node.id,optionId:'risk-boundary'}},{isReplay:true}).ok,true);
  const prestige=v.prestige;
  assert.equal(applyAction(state,{kind:ActionKinds.VASSAL_CONFIRM_LIFE_NODE,payload:{nodeId:node.id}},{isReplay:true}).ok,true);
  assert.equal(v.prestige,prestige+9+(protectedFailure?0:15));
  assert.equal(decision.mandatePreventedDeath===true,protectedFailure);
}

function chooseCommission(state, id) {
  const v = getCurrentLifeMapVassal(state);
  for (let attempt = 0; attempt < 100; attempt++) {
    const offer = v.commissionOffers.find(o => o.id === id);
    if (offer) { assert.equal(chooseVassalCommission(state, offer.offerId).ok, true); return offer; }
    v.commissionOffers = [];
    ensureCommissionOffers(state, v);
  }
  throw new Error(`Missing commission ${id}`);
}

// Committed actions pay once; starting construction is sufficient.
for (const id of ['practice','structure','relic']) {
  const state = selected('scholar'), v = getCurrentLifeMapVassal(state);
  const offer = chooseCommission(state, id), prestige = v.prestige;
  assert.equal(chooseVassalCommission(state, offer.offerId).ok, false);
  const local = state.world.sites.find(s => s.regionId === v.locationRegionId).detailedState;
  local.structureSlots[0] = {structureId:'workshop',placementId:'autonomous',origin:0,width:1};
  stepVassalCommission(state,v);
  assert.equal(v.prestige,prestige,'autonomous changes earn no reward');
  recordCommissionAction(state,v,{kind:offer.event});
  assert.equal(v.prestige,prestige+20);
  assert.equal(v.completedCommissions,1);
  assert.equal(v.commissionOffers.length,3);
  assert.equal(v.commission,null);
  recordCommissionAction(state,v,{kind:offer.event});
  stepVassalCommission(state,v);
  assert.equal(v.prestige,prestige+20,'reward occurs once');
}

// Real checkout submits attribution only on commit, never staging or undo.
for(const [id,family,kind] of [['practice','practiceReform','practice'],['structure','publicWorks','structure']]) {
  const state=selected('scholar'), v=getCurrentLifeMapVassal(state);
  chooseCommission(state,id);
  const nodeId=nodeIdForFamily(state,family);v.lifeMap.availableNodeIds=[nodeId];
  const action=(kind,payload)=>{const r=applyAction(state,{kind,payload},{isReplay:true});assert.equal(r.ok,true,r.reason);};
  action(ActionKinds.VASSAL_ENTER_LIFE_NODE,{nodeId});
  const shop=v.lifeMap.nodeStates[nodeId];
  if(shop.shopSelection)action(ActionKinds.VASSAL_SELECT_LIFE_OPTION,{nodeId,optionId:shop.shopSelection.kind==='practice'?'random':shop.shopSelection.choices.find(c=>c.enabled).id});
  const offer=shop.inventory.find(o=>o.intervention.kind===kind && o.intervention.mode!=='upgrade');
  assert.ok(offer);const before=v.prestige;
  action(ActionKinds.VASSAL_PURCHASE_SHOP_OFFER,{nodeId,offerId:offer.offerId});
  assert.equal(v.prestige,before);assert.equal(v.completedCommissions??0,0);
  action(ActionKinds.VASSAL_UNDO_SHOP_PURCHASE,{nodeId,offerId:offer.offerId});
  assert.equal(v.commission.id,id);
  action(ActionKinds.VASSAL_PURCHASE_SHOP_OFFER,{nodeId,offerId:offer.offerId});
  const purchase=structuredClone(shop.purchasedOffers[0]);
  action(ActionKinds.VASSAL_CONFIRM_LIFE_NODE,{nodeId});
  assert.equal(v.prestige,before-purchase.prestigeCost+20,'committed Practice or construction setup pays immediately');
  assert.deepEqual(serializeGameState(deserializeGameState(serializeGameState(state))),serializeGameState(state));
}

// Real timed Delve: offers are hidden behind a pending action until ordinary
// ticks resolve. Save continuation, worker preparation and timeline replay agree.
const state=selected('scholar'), v=getCurrentLifeMapVassal(state);
chooseCommission(state,'relic');
v.stats.effectiveness=5;
const node=v.lifeMap.graph.nodes.find(n=>['practiceReform','publicWorks','foodShop','housingShop','neutralMarket','classMarket'].includes(n.family));
assert.ok(node);v.lifeMap.availableNodeIds=[node.id];
const timeline=createTimelineFromInitialState(state);
const act=(kind,payload)=>{
  assert.equal(appendActionAtCursor(timeline,{kind,payload,tSec:state.tSec},state).ok,true);
  const result=applyAction(state,{kind,payload},{isReplay:true});assert.equal(result.ok,true,result.reason);return result;
};
act(ActionKinds.VASSAL_ENTER_LIFE_NODE,{nodeId:node.id});
const shop=v.lifeMap.nodeStates[node.id];
if(shop.shopSelection)act(ActionKinds.VASSAL_SELECT_LIFE_OPTION,{nodeId:node.id,optionId:shop.shopSelection.kind==='practice'?'random':shop.shopSelection.choices.find(c=>c.enabled).id});
const inventory=structuredClone(shop.inventory);
const prestige=v.prestige, cost=getVassalDelvePhaseCost(state,v,shop);
assert.equal(cost,192,'10 years discounted by 40% at the default 32 phases/year');
const prepared=await prepareLifeChoices(serializeGameState(state));
assert.equal(prepared[node.id].reroll,undefined,'timed Delve cannot use the instant cached reroll route');
const base=serializeGameState(state);
act(ActionKinds.VASSAL_REROLL_SHOP,{nodeId:node.id});
assert.deepEqual(shop.inventory,inventory,'old offers are retained until time has elapsed');
assert.equal(v.prestige,prestige);
assert.equal(shop.resolving,true);
const target=v.lifeMap.pendingResolution.resolveSec;
const resolvedEventsBefore=v.lifeEvents.filter(event=>event.kind==='nodeResolved').length;
const restored=deserializeGameState(serializeGameState(state));
const dying=deserializeGameState(serializeGameState(state));
const dyingVassal=getCurrentLifeMapVassal(dying);
dyingVassal.initialAge=100;
// Pin the mortality roll independently of earlier shop inventory draws.
dying.rng.vassalSeed=0;
initializeReplayClock(dying,dying.tSec);
assert.equal(advanceReplayStateToSecond(dying,target).ok,true);
assert.equal(dyingVassal.endedReason,'died','Delve still resolves natural mortality');
assert.equal(dyingVassal.deathCause,'naturalMortality');
assert.equal(dyingVassal.lifeEvents.filter(event=>event.kind==='nodeResolved').length,resolvedEventsBefore,
  'a fatal Delve must not emit a turning-point-resolved life event either');
initializeReplayClock(state,state.tSec);initializeReplayClock(restored,restored.tSec);
assert.equal(advanceReplayStateToSecond(state,target).ok,true);
assert.equal(advanceReplayStateToSecond(restored,target).ok,true);
assert.equal(shop.resolving,false);assert.equal(shop.inventoryRoll,1);
assert.equal(v.lifeMap.currentNodeId,node.id);assert.equal(v.lifeMap.completedNodeIds.includes(node.id),false);
assert.equal(v.prestige,prestige,'Delve earns no node income');
assert.equal(v.lifeEvents.filter(event=>event.kind==='nodeResolved').length,resolvedEventsBefore,
  'Delve must not emit a turning-point-resolved life event');
assert.equal(v.lifeEvents.at(-1).kind,'shopDelved');
assert.deepEqual(serializeGameState(restored),serializeGameState(state));
const replay=rebuildStateAtSecond(timeline,target);assert.equal(replay.ok,true);
assert.deepEqual(serializeGameState(replay.state),serializeGameState(state));
const messages=[];
await runLifeDecisionJob({stateData:base,actions:[{kind:ActionKinds.VASSAL_REROLL_SHOP,payload:{nodeId:node.id}}]},m=>messages.push(m));
assert.deepEqual(messages.find(m=>m.kind==='ready').stateData,serializeGameState(state));
assert.equal(act(ActionKinds.VASSAL_REROLL_SHOP,{nodeId:node.id}).ok,true,'Delve is repeatable');
console.log('[vassal-class-rules] OK: risk, global Force, surplus quality, attributed Commissions, timed Delve replay');
