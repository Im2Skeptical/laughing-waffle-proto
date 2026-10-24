import assert from 'node:assert/strict';
import { bronzeKeywordPrototypeDefs as definitions } from '../src/defs/gamepieces/bronze-keyword-prototype-defs.js';
import { createKeywordPrototypeState as create } from '../src/model/keywords-classes-prototype-fixture.js';
import { getDetailedPracticeDef } from '../src/model/game-config.js';
import { getDetailedSettlementSites } from '../src/model/detailed-settlements/queries.js';
import { evaluateDetailedPracticeSlot, runPracticeActivation, flushPracticeEvents } from '../src/model/detailed-settlements/practices.js';
import { getGamepieceFace } from '../src/model/gamepiece-presentation.js';
import { stockOutputBreakdown, stockCapacity } from '../src/model/detailed-settlements/stock.js';
import { initializeReplayClock, advanceReplayStateToSecond as advance } from '../src/model/replay-second-runner.js';
import { createTimelineFromInitialState, rebuildStateAtSecond } from '../src/model/timeline/index.js';
import { serializeGameState, deserializeGameState } from '../src/model/state.js';
import { getVassalShopCandidatePool } from '../src/model/vassal-life-map/shop.js';
import { getVassalCandidatePool, selectLifeMapVassal } from '../src/model/vassal-life-map.js';
import { resolveCampaignAttempt, buildCampaignOptions } from '../src/model/vassal-life-map/campaign.js';

const home=s=>getDetailedSettlementSites(s,{playerOnly:true})[0];
const copy=s=>deserializeGameState(serializeGameState(s));
assert.equal(Object.keys(definitions).length,8);
for(const def of Object.values(definitions))assert.doesNotThrow(()=>getGamepieceFace(null,'practice',def.id,'bronze'),'catalogue faces support absent simulation state');
for(const role of ['scholar','warrior']) {
  const state=create('disciplines',role,{cards:'bronze'}),site=home(state);
  for(const provider of getDetailedSettlementSites(state,{playerOnly:true}))for(const slot of provider.detailedState.practiceSlots)
    assert.ok(slot.stock<=stockCapacity(state,provider.detailedState,slot),'fixture stocks respect native capacity');
  assert.equal(site.detailedState.practiceSlots.length,5);
  const candidate={...getVassalCandidatePool(state).candidates[role==='scholar'?0:1],classId:role,founderClassId:null,locationRegionId:site.regionId};
  const node={nodeId:'bronze-pool',type:'practiceShop',category:'practice'};
  const before=serializeGameState(state);
  const pool=getVassalShopCandidatePool(state,candidate,node,{kind:'practice'});
  for(const [index,slot] of site.detailedState.practiceSlots.slice(0,4).entries()) {
    const def=getDetailedPracticeDef(state,slot.practiceId);
    assert.equal(def.minimumQuality,'bronze');assert.equal(slot.tier,'bronze');
    assert.ok(pool.some(offer=>offer.definitionId===def.id),`${def.id} obtainable at zero Research`);
    const face=getGamepieceFace(state,'practice',def.id,slot.tier,{settlement:site.detailedState,slot});
    assert.equal(face.keywordReading.active,true);
    assert.ok(face.reading.effects.some(effect=>effect.passive&&!effect.timing));
    assert.ok(face.reading.effects.filter(effect=>effect.timing).every(effect=>!effect.text.includes('Output Multiplier')));
    const inactive=copy(state);inactive.gameConfig.keywordPrototype.classId='merchant';
    const ordinary=stockOutputBreakdown(inactive,home(inactive).detailedState,slot);
    assert.equal(stockOutputBreakdown(state,site.detailedState,slot).multiplier-ordinary.multiplier,face.keywordReading.bonus);
    assert.equal(stockCapacity(state,site.detailedState,slot),stockCapacity(inactive,home(inactive).detailedState,slot));
    assert.equal(evaluateDetailedPracticeSlot(state,site.regionId,index).chargeGain,evaluateDetailedPracticeSlot(inactive,site.regionId,index).chargeGain);
  }
  assert.deepEqual(serializeGameState(state),before,'pool and inspection are pure, including RNG');
  initializeReplayClock(state);const timeline=createTimelineFromInitialState(state);
  const activated=new Set();
  for(let second=1;second<=36;second++) {
    assert.equal(advance(state,second).ok,true);
    for(const entry of site.detailedState.practiceActivationTrace)if(['activated','discharged'].includes(entry.kind))activated.add(entry.targetPracticeId);
  }
  for(const slot of site.detailedState.practiceSlots.slice(0,4))assert.ok(activated.has(slot.practiceId),`${slot.practiceId} really activates`);
  assert.deepEqual(serializeGameState(rebuildStateAtSecond(timeline,36).state),serializeGameState(state),'full recipe/keyword/Charge replay parity');
  const resumed=copy(state);advance(resumed,48);advance(state,48);
  assert.deepEqual(serializeGameState(resumed),serializeGameState(state),'captured definitions and JSON resume parity');
}

// Missing recipes neither generate output nor spend available partial ingredients.
for(const [index,trigger,stage] of [[2,'food','preRouting'],[3,'housing',null]]) {
  const state=create('disciplines','scholar',{cards:'bronze'}),site=home(state);
  state.world.connections=[]; // No Grain/Timber provider exists locally.
  assert.equal(evaluateDetailedPracticeSlot(state,site.regionId,index).supplied,false);
  const record=site.detailedState.practiceSlots[0].stock;
  runPracticeActivation(state,trigger,stage);
  assert.equal(site.detailedState.practiceSlots[index].stock,0);
  assert.equal(site.detailedState.practiceSlots[0].stock,record,'failed recipe retains its Record');
}
const noBone=create('disciplines','warrior',{cards:'bronze'});
assert.equal(evaluateDetailedPracticeSlot(noBone,home(noBone).regionId,3).supplied,false);
runPracticeActivation(noBone,'death');
assert.ok(home(noBone).detailedState.practiceSlots[3].stock>0,'same-batch real Hunt can unblock Bone requirement through the event queue');

const shortage=create('disciplines','scholar',{cards:'bronze',synthesisSupply:'blocked'});
initializeReplayClock(shortage);
assert.equal(evaluateDetailedPracticeSlot(shortage,home(shortage).regionId,2).supplied,false);
advance(shortage,12);
assert.equal(evaluateDetailedPracticeSlot(shortage,home(shortage).regionId,2).supplied,true);
assert.equal(home(shortage).detailedState.practiceSlots[2].stock,0,'restored supply waits for the Food trigger');
advance(shortage,14);
assert.ok(home(shortage).detailedState.practiceSlots[2].stock>0,'next real Food phase produces and feeds');

// Prove the kill enabler need not be Silver: real Campaign, all-Bronze boards.
const campaign=create('disciplines','warrior',{cards:'bronze'}),site=home(campaign);
const ally=getDetailedSettlementSites(campaign,{playerOnly:true})[1];
ally.detailedState.practiceSlots[3]={practiceId:'forage',tier:'bronze',stock:4,charge:0,work:0};
site.detailedState.practiceSlots[2].stock=8;
const candidate={...getVassalCandidatePool(campaign).candidates[1],classId:'warrior',founderClassId:null};
assert.equal(selectLifeMapVassal(campaign,1,null,candidate).ok,true);
const lineage=campaign.civilization.vassalLineage,vassal=lineage.vassalsById[lineage.currentVassalId];
vassal.locationRegionId=site.regionId;vassal.prestige=100;vassal.stats.intelligence=10000;
const visit={nodeId:'bronze-campaign',type:'campaign',campaign:{failed:false,questRegionIds:[],duelDone:false}};
const target=campaign.world.regions.find(region=>region.monster);target.monster.cleared=true;
const option=buildCampaignOptions(campaign,vassal,visit).find(option=>option.stage==='nest');
assert.equal(option.risk,0,'high-Prowess fixture removes success variance, still uses normal RNG');
assert.equal(resolveCampaignAttempt(campaign,vassal,visit,option).ok,true);
flushPracticeEvents(campaign);
assert.equal(campaign.civilization.history.monsterTrophies,1);
assert.equal(site.detailedState.practiceSlots[0].stock,4,'actual Campaign kill Discharges Beast Rendering with trophy Output ×2');
assert.equal(target.monster,undefined);
console.log('[bronze-keywords] OK: 8 Bronze offers/real activations, separate passives, atomic failures, actual Campaign enabler, JSON/replay and pure inspection');
