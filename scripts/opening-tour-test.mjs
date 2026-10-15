import assert from 'node:assert/strict';
import { createOpeningController } from '../images/dark-fantasy/life-map-opening-prototype/controller.js';
import { createOpeningExperiment, createOpeningTourOption, applyOpeningWorldPrices, validateOpeningExperiment } from '../images/dark-fantasy/life-map-opening-prototype/experiment.js';
import { openingVassal, createOpeningSession, enterOpeningEncounter, commitOpeningEncounter } from '../images/dark-fantasy/life-map-opening-prototype/model.js';
import { getVassalPhaseDurationParts, getAdjustedVassalPrestigeCost } from '../src/model/vassal-life-map.js';
import { getRegionReference } from '../src/model/world-state.js';
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
  assert.equal(openingVassal(end.session).locationRegionId,location);assert.equal(end.summary.tSec-start.summary.tSec,64);assert.equal(end.summary.dead,false);
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
for(const mode of ['move','build']) {
  const c=controllerFor(0);c.enter('explore');
  const matches=o=>mode==='move'?!!o.locationRegionId:o.intervention?.kind==='connection';
  const option=c.getDecision().options.find(o=>matches(o)&&!o.blocked);assert.ok(option);
  assert.deepEqual(getVassalPhaseDurationParts(option.phases,c.getSnapshot().session.state),mode==='move'?{years:0,moons:3,phases:0}:{years:5,moons:0,phases:0});
  const start=c.getSnapshot(), location=start.summary.location, connections=start.session.state.world.connections.length;
  const expectedReward=start.draft.nodes.find(n=>n.id==='explore').worldCosts.travelPrestigeByRegion[option.locationRegionId];
  if(mode==='move')assert.equal(option.prestigeDelta,expectedReward);else {assert.equal(option.prestigeCost,15);assert.equal(option.cost,getAdjustedVassalPrestigeCost(openingVassal(start.session),15));}
  // Check the exact transaction before routine node income and simulation ticks.
  const session=createOpeningSession(start.draft);enterOpeningEncounter(session,'explore');
  const prestige=openingVassal(session).prestige;
  commitOpeningEncounter(session,option.id);
  assert.equal(openingVassal(session).prestige,prestige-option.cost+(option.prestigeDelta??0));
  assert.equal(openingVassal(session).lifeMap.pendingResolution.resolveSec-session.state.tSec,option.phases);
  const roundTrip=deserializeGameState(serializeGameState(session.state));
  assert.equal(roundTrip.civilization.vassalLineage.vassalsById[session.vassalId].prestige,openingVassal(session).prestige);
  await c.commit(option.id);const end=c.getSnapshot();
  assert.equal(end.summary.tSec-start.summary.tSec,option.phases);assert.equal(end.summary.dead,false);
  assert.equal(end.session.state.world.connections.length,connections+(mode==='build'?1:0));
  assert.equal(end.summary.location,mode==='move'?getRegionReference(end.session.state,option.locationRegionId):location);
  const outcome=structuredClone(end.session.outcomes.at(-1));c.rewind();c.enter('explore');await c.commit(option.id);
  assert.deepEqual(c.getSnapshot().session.outcomes.at(-1),outcome,'rewind repeats travel/route price and result');
}
const authored=createOpeningExperiment(), world=authored.nodes.find(n=>n.id==='explore');
assert.equal(new Set(Object.values(world.worldCosts.travelPrestigeByRegion)).size,3,'destinations have distinct authored reward tiers');
world.worldCosts.travelPrestigeByRegion['copper-basin']=17;const custom=controllerFor(0);custom.replaceDraft(authored);custom.restart();custom.enter('explore');
for(const option of custom.getDecision().options.filter(o=>o.locationRegionId))assert.equal(option.prestigeDelta,world.worldCosts.travelPrestigeByRegion[option.locationRegionId]);
const old={...world,phaseCost:6,options:[{...createOpeningTourOption(70),phaseCost:6}]}, priced=applyOpeningWorldPrices(old);
assert.equal(priced.options[0].phaseCost,64);assert.equal(priced.options[0].weightedOutcomes[0].weight,70);assert.deepEqual(priced.next,old.next);
world.worldCosts.travelPrestigeByRegion['copper-basin']=-1;assert.throws(()=>validateOpeningExperiment(authored),/world prices/);
console.log('[opening-tour] OK: 2-year Tour, 3-moon Move with destination rewards, 5-year/15-Prestige route, pure previews, seeded rewards, acquisition, serialization and rewind');
