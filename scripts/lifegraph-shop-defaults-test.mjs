import assert from 'node:assert/strict';
import {createLifegraphController} from '../src/controllers/lifegraph-controller.js';
import {createAuthoredGameConfig} from '../src/model/game-config.js';
import {LIFEGRAPH_SHOP_NODE_IDS,lifeMapPhasesPerYear,resolveLifeMapOptionCosts} from '../src/model/life-map-balance.js';
import {serializeGameState} from '../src/model/state.js';
import {ActionKinds,applyAction} from '../src/model/actions.js';
import {getVassalNodeDecisionPresentation} from '../src/model/vassal-life-map.js';
import {getVassalDelvePhaseCost} from '../src/model/vassal-life-map/class-rules.js';
import {createTimelineFromInitialState,appendActionAtCursor,rebuildStateAtSecond} from '../src/model/timeline/index.js';
import {initializeReplayClock,advanceReplayStateToSecond} from '../src/model/replay-second-runner.js';

const c=createLifegraphController({store:null}),current=c.getGeneratorConfig();
assert.deepEqual(createAuthoredGameConfig().lifeMapGenerator,current,'normal New Game and Lab use identical defaults');
assert.equal(current.laneCount,3);assert.equal(current.normalDepthCount,10);assert.equal(current.design.enabled,true);
assert.deepEqual(current.design.costBands.time,{cheap:3,fair:5,expensive:10});
assert.deepEqual(current.design.costBands.prestige,{cheap:10,fair:15,expensive:30});
assert.deepEqual(current.design.shopPricing.prices.structure,current.design.shopPricing.prices.practice);
assert.ok(c.getSnapshot().presets.includes('Previous defaults'));
c.setReview('stockShop','Keep my content-gap notes.');
assert.equal(c.loadPreset('Previous defaults').ok,true);
assert.equal(c.getGeneratorConfig().laneCount,6);assert.equal(c.getGeneratorConfig().normalDepthCount,11);
assert.deepEqual(c.getGeneratorConfig().design.costBands.time,{cheap:2,fair:4,expensive:8});
assert.equal(c.getGeneratorConfig().design.shopPricing.prices.structure.bronze.prestige,12);
assert.equal(c.getGeneratorConfig().design.shopServices.delve.time,2);
assert.equal(c.deletePreset('Previous defaults').ok,false,'the preserved built-in profile cannot be deleted');
c.reset();assert.deepEqual(c.getGeneratorConfig(),current);
assert.equal(c.getSnapshot().draft.reviews.stockShop.notes,'Keep my content-gap notes.');

// One edit propagates to every ordinary, tagged and removal shop. Changing a
// service leaves card prices and the general cost presets alone.
c.setOptionCost('practiceReform','delve','time',12);
c.setOptionCost('publicWorks','emptyConfirm','time',7);
for(const id of LIFEGRAPH_SHOP_NODE_IDS){
  const rows=c.getChoiceReview(id).choices;
  assert.equal(rows.find(o=>o.id==='delve').base.time,12,id);
  assert.equal(rows.find(o=>o.id==='emptyConfirm').base.time,7,id);
  assert.ok(!rows.some(o=>o.id==='reroll'),id);
}
assert.deepEqual(c.getGeneratorConfig().design.costBands,current.design.costBands);
assert.deepEqual(c.getGeneratorConfig().design.shopPricing,current.design.shopPricing);
assert.equal(c.importJson(c.exportJson()).ok,true);c.reset();c.update(['preview','stats'],0);

for(const id of LIFEGRAPH_SHOP_NODE_IDS){
  const node=id.startsWith('signature:')?{family:'signature',signatureNode:{variantId:id.slice(10)}}:{family:id};
  const state=c.getSnapshot().state,phases=lifeMapPhasesPerYear(state);
  assert.equal(resolveLifeMapOptionCosts(state,node,{id:'delve'}).phaseCost,10*phases,id);
  assert.equal(resolveLifeMapOptionCosts(state,node,{id:'emptyConfirm'}).phaseCost,5*phases,id);
}
for(const classId of ['unclassed','warrior']){
  c.update(['preview','classId'],classId);c.openType('stockShop');
  const s=c.sandbox.getSnapshot(),before=serializeGameState(s.state);
  assert.equal(applyAction(s.state,{kind:ActionKinds.VASSAL_REROLL_SHOP,payload:{nodeId:s.nodeId}},{isReplay:true}).reason,'scholarRequired');
  assert.deepEqual(serializeGameState(s.state),before,'rejection preserves payment, inventory and RNG');
}

// Both services charge their shared quote and survive authoritative tick replay.
for(const service of ['delve','emptyConfirm']){
  c.update(['preview','classId'],'scholar');c.openType('stockShop');
  const s=c.sandbox.getSnapshot(),node=s.vassal.lifeMap.nodeStates[s.nodeId],timeline=createTimelineFromInitialState(s.state);
  const phaseCost=(service==='delve'?10:5)*lifeMapPhasesPerYear(s.state);
  if(service==='delve')assert.equal(getVassalDelvePhaseCost(s.state,s.vassal,node),phaseCost);
  else assert.equal(getVassalNodeDecisionPresentation(s.state,s.nodeId).mortalityEstimate.totalPhaseCost,phaseCost);
  const action={kind:service==='delve'?ActionKinds.VASSAL_REROLL_SHOP:ActionKinds.VASSAL_CONFIRM_LIFE_NODE,payload:{nodeId:s.nodeId}};
  assert.equal(appendActionAtCursor(timeline,{...action,tSec:s.state.tSec},s.state).ok,true);
  const prestige=s.vassal.prestige;
  assert.equal(applyAction(s.state,action,{isReplay:true}).ok,true);
  assert.equal(s.vassal.lifeMap.pendingResolution.phaseCost,phaseCost);
  assert.equal(s.vassal.prestige,prestige,'shop services have no Prestige charge');
  initializeReplayClock(s.state,s.state.tSec);
  assert.equal(advanceReplayStateToSecond(s.state,s.vassal.lifeMap.pendingResolution.resolveSec).ok,true);
  const replay=rebuildStateAtSecond(timeline,s.state.tSec);assert.equal(replay.ok,true);
  const snapshot=state=>JSON.stringify({tSec:state.tSec,rng:state.rng,world:state.world,civilization:state.civilization});
  assert.equal(snapshot(replay.state),snapshot(s.state),service+' exact replay');
}
console.log('[lifegraph-shop-defaults] current/previous profiles, shared edits across all shops, class rejection, 10/5-year payment and replay OK');
