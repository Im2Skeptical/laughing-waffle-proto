import assert from 'node:assert/strict';
import { createOpeningController } from '../images/dark-fantasy/life-map-opening-prototype/controller.js';
import { createOpeningExperiment, validateOpeningExperiment } from '../images/dark-fantasy/life-map-opening-prototype/experiment.js';
import { openingVassal, commitOpeningEncounter } from '../images/dark-fantasy/life-map-opening-prototype/model.js';
import { serializeGameState } from '../src/model/state.js';
const saved=c=>JSON.stringify(serializeGameState(c.getSnapshot().session.state));
const chooseDestination=c=>{
  const target=c.getDecision().legacySettlement.targets.find(target=>!target.blocked);assert.ok(target);
  const before=saved(c);c.selectLegacyDestination(target.settlementRegionId);assert.equal(saved(c),before,'selecting a map destination changes no simulation state or RNG');
  return target.settlementRegionId;
};
const c=createOpeningController(),draft=c.getSnapshot().draft;
assert.deepEqual(draft.nodes.find(node=>node.id==='favor').next,['legacy']);
for(const zero of [false,true]) {
  c.previewLegacy(zero);
  const before=saved(c),decision=c.getDecision();
  assert.deepEqual(decision.options.map(option=>option.id),['found-settlement','highest-stat','accumulated-prestige']);
  assert.equal(decision.options[0].blocked,zero?'Insufficient Prestige':null);
  assert.equal(decision.options[1].legacyReward.quantity,2);
  assert.equal(decision.options[1].legacyReward.kind,'startingStat');assert.equal(decision.options[1].legacyReward.statId,'intelligence');
  assert.equal(decision.options[2].legacyReward.quantity,zero?0:6);
  assert.equal(decision.options[2].legacyReward.kind,'startingPrestige');
  for(let i=0;i<5;i++)c.getDecision();assert.equal(saved(c),before,'previewing consumes no state or RNG');
  if(zero)assert.throws(()=>c.select('found-settlement'),/Insufficient Prestige/);
  assert.throws(()=>commitOpeningEncounter(c.getSnapshot().session),/workshop mockup/,'native settlement/retirement effects cannot run');
  for(const id of zero?['highest-stat','accumulated-prestige']:['found-settlement','highest-stat','accumulated-prestige']) {
    c.previewLegacy(zero);c.select(id);
    if(id==='found-settlement') {
      await assert.rejects(c.commit(),/settlement destination/);
      assert.throws(()=>c.selectLegacyDestination(openingVassal(c.getSnapshot().session).locationRegionId),/highlighted frontier/);
      chooseDestination(c);
    }
    const selected=saved(c);await c.commit();
    assert.equal(saved(c),selected,'mock confirmation changes no game state, costs, rewards, time or RNG');
    const result=structuredClone(c.getSnapshot().session.outcomes.at(-1));
    assert.equal(result.legacyChoice.id,id);assert.equal(result.mock,true);assert.equal(c.getSnapshot().session.activeId,null);
    if(id==='found-settlement')assert.ok(result.legacyChoice.destinationRegionId);
    c.rewind();c.enter('legacy');c.select(id);if(id==='found-settlement')chooseDestination(c);await c.commit();
    assert.deepEqual(c.getSnapshot().session.outcomes.at(-1),result,'rewind repeats the mock choice');
  }
  assert.deepEqual(c.getSnapshot().draft,draft,'previewing preserves the authored draft');
}
c.previewLegacy();c.select('found-settlement');chooseDestination(c);c.select(null);
assert.equal(c.getDecision().nodeState.selectedOptionId,null);assert.equal(c.getDecision().legacySettlement.selectedRegionId,null);
c.select('found-settlement');chooseDestination(c);c.select('highest-stat');assert.equal(c.getDecision().legacySettlement.selectedRegionId,null,'switching rewards clears the destination');
c.previewLegacy();c.rewind();const disconnected=c.getSnapshot().session,origin=openingVassal(disconnected).locationRegionId;
disconnected.state.world.connections=disconnected.state.world.connections.filter(edge=>edge.regionAId!==origin&&edge.regionBId!==origin);
c.enter('legacy');assert.equal(c.getDecision().options[0].blocked,'Requires Connected frontier destination');assert.ok(c.getDecision().options.slice(1).every(option=>!option.blocked));
c.previewLegacy(true);c.rewind();const vassal=openingVassal(c.getSnapshot().session);
Object.assign(vassal.stats,{intelligence:0,effectiveness:0,wisdom:9,cunning:0});c.enter('legacy');
assert.equal(c.getDecision().options[1].legacyReward.basis,'wisdom');
assert.equal(c.getDecision().options[1].legacyReward.quantity,3,'uses the actual highest stat');
assert.equal(c.getDecision().options[1].label,'Wisdom');
c.previewLegacy();c.rewind();
const lowPopulation=c.getSnapshot().session,cohort=lowPopulation.state.world.sites.find(site=>site.regionId===openingVassal(lowPopulation).locationRegionId).detailedState.populationByClass.villager;
cohort.adults=0;for(const specialist of Object.values(cohort.specialists))specialist.adults=0;
c.enter('legacy');assert.equal(c.getDecision().options[0].blocked,'Requires 10 adult Villagers');
assert.ok(c.getDecision().options.slice(1).every(option=>!option.blocked));
for(const [statValue,prestige,statExpected,prestigeExpected] of [[0,0,0,0],[2,9,0,0],[3,10,1,1],[5,19,1,1],[6,20,2,2],[90,1500,30,150]]) {
  c.previewLegacy();c.rewind();const actor=openingVassal(c.getSnapshot().session);
  Object.assign(actor.stats,{intelligence:statValue,effectiveness:0,wisdom:0,cunning:0});actor.prestige=prestige;c.enter('legacy');
  assert.equal(c.getDecision().options[1].legacyReward.quantity,statExpected);
  assert.equal(c.getDecision().options[2].legacyReward.quantity,prestigeExpected);
  assert.ok(!c.getDecision().options[1].blocked,'the highest-stat option is always offered, even below its first threshold');
}
for(const statId of ['cunning','wisdom','effectiveness','intelligence']) {
  c.previewLegacy();c.rewind();const actor=openingVassal(c.getSnapshot().session);
  Object.assign(actor.stats,{intelligence:0,effectiveness:0,wisdom:0,cunning:0,[statId]:9});c.enter('legacy');
  assert.equal(c.getDecision().options[1].legacyReward.statId,statId);assert.equal(c.getDecision().options[1].legacyReward.quantity,3);
}
const configured=createOpeningExperiment();Object.assign(configured.nodes.find(node=>node.kind==='legacy').legacy,{statDivisor:6,prestigeDivisor:20});
c.replaceDraft(configured);c.previewLegacy();
assert.equal(c.getDecision().options[1].legacyReward.quantity,1);assert.equal(c.getDecision().options[2].legacyReward.quantity,3);
const invalid=structuredClone(configured);invalid.nodes.find(node=>node.kind==='legacy').legacy.prestigeDivisor=0;
assert.throws(()=>validateOpeningExperiment(invalid),/Legacy costs/);
console.log('[opening-legacy] OK: three choices, affordability, linear uncapped bonuses, thresholds, all highest stats, inert confirmation, draft isolation and rewind');
