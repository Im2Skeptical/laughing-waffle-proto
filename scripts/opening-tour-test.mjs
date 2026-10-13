import assert from 'node:assert/strict';
import { createOpeningController } from '../images/dark-fantasy/life-map-opening-prototype/controller.js';
import { createOpeningExperiment, createOpeningTourOption, validateOpeningExperiment } from '../images/dark-fantasy/life-map-opening-prototype/experiment.js';
import { openingVassal } from '../images/dark-fantasy/life-map-opening-prototype/model.js';
import { serializeGameState, deserializeGameState } from '../src/model/state.js';
import { acquireHeirloom, getOwnedHeirloomDefinitionIds } from '../src/model/vassal-life-map/heirlooms.js';
import { VASSAL_HEIRLOOM_DEFS } from '../src/defs/gamepieces/vassal-heirloom-defs.js';

function controllerFor(chance,seed=42) {
  const c=createOpeningController(), d=createOpeningExperiment(); d.seed=seed;
  d.nodes.find(n=>n.id==='explore').options=[createOpeningTourOption(chance)];
  c.replaceDraft(d);c.restart();return c;
}
const serialize=c=>JSON.stringify(serializeGameState(c.getSnapshot().session.state));
for(const chance of [0,100]) {
  const c=controllerFor(chance);c.enter('explore');const start=c.getSnapshot();
  const location=openingVassal(start.session).locationRegionId, stats={...openingVassal(start.session).stats}, before=serialize(c);
  for(let n=0;n<8;n++)c.getDecision();
  assert.ok(serialize(c)===before,'previewing does not change state');c.select('tour');
  const seedBefore=structuredClone(c.getSnapshot().session.state.rng);for(let n=0;n<8;n++)c.getDecision();
  assert.deepEqual(c.getSnapshot().session.state.rng,seedBefore);
  await c.commit('tour');
  if(chance===100){
    const revealed=c.getSnapshot();assert.equal(revealed.session.activeId,'explore');assert.equal(revealed.decision.node.family,'relic');
    assert.equal(revealed.summary.tSec,start.summary.tSec,'finding a relic first requests acquisition');
    assert.equal(revealed.decision.options[0].immediateDeathChance,0);assert.equal(VASSAL_HEIRLOOM_DEFS[revealed.session.randomOutcome.definitionId].quality,'bronze');
    const roundTrip=deserializeGameState(serializeGameState(revealed.session.state));assert.equal(roundTrip.tSec,revealed.summary.tSec);
    await c.commit(revealed.decision.nodeState.selectedOptionId,'carry');
  }
  const end=c.getSnapshot(), reward=end.session.outcomes.at(-1).reward;
  assert.equal(openingVassal(end.session).locationRegionId,location);assert.equal(end.summary.tSec-start.summary.tSec,6);assert.equal(end.summary.dead,false);
  assert.deepEqual(end.session.availableIds,['founding']);assert.equal(end.session.founded,false);
  if(chance===0){assert.equal(openingVassal(end.session).stats[reward.statId],stats[reward.statId]+1);assert.equal(reward.statDelta,1);}
  else assert.ok(getOwnedHeirloomDefinitionIds(end.session.state,openingVassal(end.session)).has(reward.definitionId));
  const rewardBefore=structuredClone(reward);c.rewind();assert.ok(c.getSnapshot().session.availableIds.includes('explore'));
  c.enter('explore');await c.commit('tour');if(c.getSnapshot().session.activeId)await c.commit(c.getSnapshot().decision.nodeState.selectedOptionId,'carry');
  assert.deepEqual(c.getSnapshot().session.outcomes.at(-1).reward,rewardBefore,'rewind repeats the same outcome');
}
const exhausted=controllerFor(100), state=exhausted.getSnapshot().session.state, v=openingVassal(exhausted.getSnapshot().session);
for(const def of Object.values(VASSAL_HEIRLOOM_DEFS).filter(d=>d.quality==='bronze'))assert.equal(acquireHeirloom(state,v,def.id,{destination:v.heirlooms.equipped.some(s=>!s)?'equip':'carry'}).ok,true);
exhausted.enter('explore');assert.equal(exhausted.getDecision().options.find(o=>o.id==='tour').randomReward.relicChance,0);
await exhausted.commit('tour');assert.ok(exhausted.getSnapshot().session.outcomes.at(-1).reward.statId,'owned relic pool falls back to an ability');
const preview=createOpeningController(), draft=preview.getSnapshot().draft;preview.previewEncounter('explore');assert.equal(preview.getSnapshot().session.activeId,'explore');assert.deepEqual(preview.getSnapshot().draft,draft);
const invalid=createOpeningExperiment();invalid.nodes.find(n=>n.id==='explore').options[0].weightedOutcomes[0].weight=-1;assert.throws(()=>validateOpeningExperiment(invalid),/weight/);
console.log('[opening-tour] OK: seeded rewards, pure previews, 6-phase local tour, relic acquisition, save/rewind, exhausted-pool fallback and direct preview');
