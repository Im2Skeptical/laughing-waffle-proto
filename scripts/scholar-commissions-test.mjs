import assert from 'node:assert/strict';
import { createNewGameState } from '../src/model/new-game.js';
import { ActionKinds, applyAction } from '../src/model/actions.js';
import { serializeGameState, deserializeGameState } from '../src/model/state.js';
import { getCurrentLifeMapVassal, selectLifeMapVassal, getVassalCandidatePool } from '../src/model/vassal-life-map.js';
import { ensureCommissionOffers, chooseVassalCommission, recordCommissionAction, stepVassalCommission, validateVassalCommissions } from '../src/model/vassal-life-map/commissions.js';
import { VASSAL_COMMISSION_DEFS } from '../src/defs/vassal-class-rules.js';
import { VASSAL_HEIRLOOM_DEFS } from '../src/defs/gamepieces/vassal-heirloom-defs.js';
import { VASSAL_STAT_IDS } from '../src/defs/gamepieces/vassal-life-map-defs.js';
import { getVassalEffectiveStats, getVassalNodeResolutionGains } from '../src/model/vassal-life-map/selectors.js';
import { getDetailedPracticeDef, getDetailedStructureDef } from '../src/model/game-config.js';
import { acquireHeirloom } from '../src/model/vassal-life-map/heirlooms.js';
import { nodeIdForFamily } from '../src/model/tests/vassal-life-map/helpers.js';
import { createTimelineFromInitialState, appendActionAtCursor, rebuildStateAtSecond } from '../src/model/timeline/index.js';
import { runLifeDecisionJob } from '../src/model/vassal-life-map/decision-preparation.js';

function selected() {
  const state = createNewGameState(131);
  state.gameConfig.settings.values.primordialBasePressure = 0;
  Object.assign(state.civilization.vassalLineage, { founderClassId:'scholar', establishedClassId:'scholar' });
  const candidate = getVassalCandidatePool(state).candidates[0];
  Object.assign(candidate, { classId:'scholar', founderClassId:null, archetype:'Scholar', age:18, prestige:500 });
  assert.equal(selectLifeMapVassal(state,0,null,candidate).ok,true);
  state.civilization.prestige=500;
  return state;
}

function offerFor(state, id, matches = () => true) {
  const v = getCurrentLifeMapVassal(state);
  for (let attempt=0; attempt<100; attempt++) {
    const offer = v.commissionOffers.find(o=>o.id===id && matches(o));
    if (offer) return offer;
    v.commissionOffers=[]; ensureCommissionOffers(state,v);
  }
  throw new Error(`Missing offer ${id}`);
}

function accept(state,id,matches) {
  const offer=offerFor(state,id,matches);
  assert.equal(chooseVassalCommission(state,offer.offerId).ok,true);
  return offer;
}

const relicAt = quality => Object.values(VASSAL_HEIRLOOM_DEFS).find(def=>def.quality===quality).id;
assert.equal(VASSAL_COMMISSION_DEFS.length,11);

// Exercise every task's positive and negative completion checks, persistence,
// exact-once reward and immediate replacement offers.
for (const def of VASSAL_COMMISSION_DEFS) {
  const state=selected(), v=getCurrentLifeMapVassal(state);
  const offer=accept(state,def.id), before=state.civilization.prestige;
  const event={kind:def.event};
  if (offer.tag) {
    const registry=offer.event==='practiceInstalled'?state.gameConfig.gamepieces.practices:state.gameConfig.gamepieces.structures;
    const matching=Object.values(registry).find(d=>d.tags.includes(offer.tag));
    const wrong=Object.values(registry).find(d=>!d.tags.includes(offer.tag));
    const key=offer.event==='practiceInstalled'?'practiceId':'structureId';
    assert.ok(matching);
    if(wrong) recordCommissionAction(state,v,{...event,[key]:wrong.id});
    event[key]=matching.id;
  }
  if (offer.nodeFamily) {
    recordCommissionAction(state,v,{...event,nodeFamily:'not-a-node'});
    event.nodeFamily=offer.nodeFamily;
  }
  if (offer.regionId) {
    recordCommissionAction(state,v,{...event,regionId:v.locationRegionId});
    event.regionId=offer.regionId;
  }
  if (offer.minimumQuality) {
    recordCommissionAction(state,v,{...event,definitionId:relicAt('silver')});
    event.definitionId=relicAt('gold');
  }
  if (offer.statId) {
    stepVassalCommission(state,v);
    const other=VASSAL_STAT_IDS.find(id=>id!==offer.statId);
    v.stats[other]++;
    recordCommissionAction(state,v,event);
    assert.ok(v.commission,'a different stat is insufficient');
    v.stats[offer.statId]++;
  }
  if (offer.amount) {
    recordCommissionAction(state,v,{...event,amount:12});
    state.civilization.prestige-=100;
    event.amount=18;
    assert.equal(v.commission.progress,12);
  }
  assert.equal(v.completedCommissions??0,0,'wrong actions never complete the task');
  assert.deepEqual(validateVassalCommissions(v),[]);
  const restored=deserializeGameState(serializeGameState(state));
  recordCommissionAction(state,v,event);
  recordCommissionAction(restored,getCurrentLifeMapVassal(restored),event);
  assert.equal(state.civilization.prestige,before-(offer.amount?100:0)+offer.prestige,def.id);
  assert.equal(v.commission,null);
  assert.equal(v.completedCommissions,1);
  assert.equal(v.commissionOffers.length,3);
  recordCommissionAction(state,v,event);
  assert.equal(v.completedCommissions,1);
  assert.deepEqual(serializeGameState(state),serializeGameState(restored));
}

// Generation uses only Vassal RNG, survives saves, and resolves display text.
{
  const state=selected(), v=getCurrentLifeMapVassal(state);
  const base=state.rng.seed, development=state.rng.vassalDevelopmentSeed, topology=state.rng.vassalLifeMapSeed;
  const observed=new Set();
  for(let i=0;i<100;i++) {
    v.commissionOffers=[];
    const saved=deserializeGameState(serializeGameState(state));
    ensureCommissionOffers(state,v); ensureCommissionOffers(saved,getCurrentLifeMapVassal(saved));
    assert.deepEqual(serializeGameState(state),serializeGameState(saved));
    assert.equal(new Set(v.commissionOffers.map(o=>o.id)).size,3);
    for(const offer of v.commissionOffers) {
      observed.add(offer.id);
      assert.doesNotMatch(offer.label,/\{|undefined/);
      if(offer.tag) {
        const definitions=offer.event==='practiceInstalled'?Object.values(state.gameConfig.gamepieces.practices):Object.values(state.gameConfig.gamepieces.structures);
        assert.ok(definitions.some(d=>!d.locked&&['common','scholar'].includes(d.pool)&&d.minimumQuality==='bronze'&&d.tags.includes(offer.tag)));
      }
    }
  }
  assert.equal(observed.size,11);
  assert.equal(state.rng.seed,base);
  assert.equal(state.rng.vassalDevelopmentSeed,development);
  assert.equal(state.rng.vassalLifeMapSeed,topology);
}

// Entering is sufficient: no option selection or node resolution is needed.
{
  const state=selected(), v=getCurrentLifeMapVassal(state), offer=accept(state,'node');
  const node=v.lifeMap.graph.nodes.find(n=>n.family===offer.nodeFamily);
  v.lifeMap.availableNodeIds=[node.id];
  const before=state.civilization.prestige;
  assert.equal(applyAction(state,{kind:ActionKinds.VASSAL_ENTER_LIFE_NODE,payload:{nodeId:node.id}},{isReplay:true}).ok,true);
  assert.equal(state.civilization.prestige,before+20);
  assert.equal(v.lifeMap.completedNodeIds.includes(node.id),false);
}

// Actual option income (not net balance) completes through authoritative actions,
// including timeline replay and the decision worker on the same second.
{
  const state=selected(),v=getCurrentLifeMapVassal(state);
  accept(state,'prestige');
  const nodeId=nodeIdForFamily(state,'patronage');v.lifeMap.availableNodeIds=[nodeId];
  assert.equal(applyAction(state,{kind:ActionKinds.VASSAL_ENTER_LIFE_NODE,payload:{nodeId}},{isReplay:true}).ok,true);
  const node=v.lifeMap.nodeStates[nodeId];
  node.options=[{id:'paid-income',label:'Earn',phaseCost:0,prestigeCost:20,prestigeDelta:30}];
  const timeline=createTimelineFromInitialState(state), before=state.civilization.prestige;
  const actions=[{kind:ActionKinds.VASSAL_SELECT_LIFE_OPTION,payload:{nodeId,optionId:'paid-income'}},
    {kind:ActionKinds.VASSAL_CONFIRM_LIFE_NODE,payload:{nodeId}}];
  const base=serializeGameState(state);
  for(const action of actions) {
    assert.equal(appendActionAtCursor(timeline,{...action,tSec:state.tSec},state).ok,true);
    assert.equal(applyAction(state,action,{isReplay:true}).ok,true);
  }
  assert.equal(v.completedCommissions,1);
  assert.equal(state.civilization.prestige,before-20+30+40+getVassalNodeResolutionGains(v,'patronage').prestige,'gross income, prize and normal node income are distinct');
  const replay=rebuildStateAtSecond(timeline,state.tSec);assert.equal(replay.ok,true);
  assert.deepEqual(serializeGameState(replay.state),serializeGameState(state));
  const messages=[];
  await runLifeDecisionJob({stateData:base,actions},m=>messages.push(m));
  assert.deepEqual(messages.find(m=>m.kind==='ready').stateData,serializeGameState(state));
}

// Real route checkout, intentional Travel and permanent Development hooks.
for(const [id,family] of [['route','crossroads'],['travel','crossroads'],['stat','development']]) {
  const state=selected(),v=getCurrentLifeMapVassal(state),offer=accept(state,id);
  const nodeId=nodeIdForFamily(state,family);v.lifeMap.availableNodeIds=[nodeId];
  const act=(kind,payload)=>{const result=applyAction(state,{kind,payload},{isReplay:true});assert.equal(result.ok,true,result.reason);};
  act(ActionKinds.VASSAL_ENTER_LIFE_NODE,{nodeId});
  const node=v.lifeMap.nodeStates[nodeId];
  if(id==='route') {
    const route=node.options.find(o=>o.intervention?.kind==='connection');assert.ok(route);
    act(ActionKinds.VASSAL_SELECT_LIFE_OPTION,{nodeId,optionId:route.id});
    assert.equal(v.completedCommissions??0,0,'staged routes do not count');
    act(ActionKinds.VASSAL_SELECT_LIFE_OPTION,{nodeId,optionId:'tour'});
    assert.equal(v.completedCommissions??0,0,'changing the selection does not count');
    act(ActionKinds.VASSAL_SELECT_LIFE_OPTION,{nodeId,optionId:route.id});
  } else {
    const option=id==='travel'?node.options.find(o=>o.locationRegionId===offer.regionId):null;
    if(id==='stat') {
      // Use a legal queued level-up rather than relying on three random Study stats.
      v.developmentChoiceQueue=[{choiceId:'commission-development',offeredStatIds:[offer.statId]}];
      act(ActionKinds.VASSAL_CHOOSE_DEVELOPMENT_STAT,{choiceId:'commission-development',statId:offer.statId});
      assert.equal(v.completedCommissions,1);
      continue;
    }
    assert.ok(option);
    act(ActionKinds.VASSAL_SELECT_LIFE_OPTION,{nodeId,optionId:option.id});
  }
  act(ActionKinds.VASSAL_CONFIRM_LIFE_NODE,{nodeId});
  assert.equal(v.completedCommissions,1,`${id} must be credited by the real action hook`);
}

// Real tagged shop checkout carries the purchased definition into the matcher.
for(const [id,family,kind] of [['practiceTag','practiceReform','practice'],['structureTag','publicWorks','structure']]) {
  const state=selected(),v=getCurrentLifeMapVassal(state);
  accept(state,'relic');
  const nodeId=nodeIdForFamily(state,family);v.lifeMap.availableNodeIds=[nodeId];
  const act=(kind,payload)=>{const result=applyAction(state,{kind,payload},{isReplay:true});assert.equal(result.ok,true,result.reason);};
  act(ActionKinds.VASSAL_ENTER_LIFE_NODE,{nodeId});
  const node=v.lifeMap.nodeStates[nodeId];
  if(node.shopSelection)act(ActionKinds.VASSAL_SELECT_LIFE_OPTION,{nodeId,optionId:node.shopSelection.kind==='practice'?'random':node.shopSelection.choices.find(c=>c.enabled).id});
  const card=node.inventory.find(o=>o.intervention.kind===kind&&o.intervention.mode!=='upgrade');
  assert.ok(card);
  const definition=kind==='practice'?getDetailedPracticeDef(state,card.intervention.practiceId):getDetailedStructureDef(state,card.intervention.structureId);
  v.commission=null;v.commissionOffers=[];ensureCommissionOffers(state,v);
  accept(state,id,offer=>definition.tags.includes(offer.tag));
  act(ActionKinds.VASSAL_PURCHASE_SHOP_OFFER,{nodeId,offerId:card.offerId});
  assert.equal(v.completedCommissions??0,0);
  act(ActionKinds.VASSAL_CONFIRM_LIFE_NODE,{nodeId});
  assert.equal(v.completedCommissions,1);
}

// Existing stats, or a temporary equipment uplift, are not a permanent increase.
{
  const state=selected(),v=getCurrentLifeMapVassal(state);
  VASSAL_STAT_IDS.forEach(id=>{v.stats[id]=20;});
  const offer=accept(state,'stat',o=>o.statId==='cunning');
  stepVassalCommission(state,v);
  assert.equal(v.commission.startingStat,20);
  const before=getVassalEffectiveStats(v)[offer.statId];
  const equipment=Object.values(VASSAL_HEIRLOOM_DEFS).find(def=>(def.effects?.bonusCunning??0)>0);
  assert.ok(equipment);
  assert.equal(acquireHeirloom(state,v,equipment.id,{destination:'equip'}).ok,true);
  assert.ok(getVassalEffectiveStats(v)[offer.statId]>before);
  stepVassalCommission(state,v);
  assert.ok(v.commission,'equipment does not increase the permanent stat');
  v.stats[offer.statId]--;
  stepVassalCommission(state,v);
  v.stats[offer.statId]++;
  stepVassalCommission(state,v);
  assert.equal(v.stats[offer.statId],before);
  assert.ok(v.commission);
}

console.log('[scholar-commissions] OK: eleven tasks, targets, tiers, gross income, exact-once rewards, save/replay/worker parity');
