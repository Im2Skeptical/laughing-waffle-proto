import assert from 'node:assert/strict';
import { createOpeningController } from '../images/dark-fantasy/life-map-opening-prototype/controller.js';
import { createOpeningExperiment, validateOpeningExperiment } from '../images/dark-fantasy/life-map-opening-prototype/experiment.js';
import { openingVassal, commitOpeningEncounter } from '../images/dark-fantasy/life-map-opening-prototype/model.js';
import { serializeGameState } from '../src/model/state.js';
const saved=c=>JSON.stringify(serializeGameState(c.getSnapshot().session.state));
const c=createOpeningController(),draft=c.getSnapshot().draft;
assert.deepEqual(draft.nodes.find(node=>node.id==='favor').next,['legacy']);
for(const zero of [false,true]) {
  c.previewLegacy(zero);
  const before=saved(c),decision=c.getDecision();
  assert.deepEqual(decision.options.map(option=>option.id),['found-settlement','highest-stat','accumulated-prestige']);
  assert.equal(decision.options[0].blocked,zero?'Insufficient Prestige':null);
  assert.equal(decision.options[1].legacyReward.quantity,6);
  assert.equal(decision.options[2].legacyReward.quantity,zero?1:6);
  for(let i=0;i<5;i++)c.getDecision();assert.equal(saved(c),before,'previewing consumes no state or RNG');
  if(zero)assert.throws(()=>c.select('found-settlement'),/Insufficient Prestige/);
  assert.throws(()=>commitOpeningEncounter(c.getSnapshot().session),/workshop mockup/,'native settlement/retirement effects cannot run');
  for(const id of zero?['highest-stat','accumulated-prestige']:['found-settlement','highest-stat','accumulated-prestige']) {
    c.previewLegacy(zero);c.select(id);const selected=saved(c);await c.commit();
    assert.equal(saved(c),selected,'mock confirmation changes no game state, costs, rewards, time or RNG');
    const result=structuredClone(c.getSnapshot().session.outcomes.at(-1));
    assert.equal(result.legacyChoice.id,id);assert.equal(result.mock,true);assert.equal(c.getSnapshot().session.activeId,null);
    c.rewind();c.enter('legacy');c.select(id);await c.commit();
    assert.deepEqual(c.getSnapshot().session.outcomes.at(-1),result,'rewind repeats the mock choice');
  }
  assert.deepEqual(c.getSnapshot().draft,draft,'previewing preserves the authored draft');
}
c.previewLegacy(true);c.rewind();const vassal=openingVassal(c.getSnapshot().session);
Object.assign(vassal.stats,{intelligence:0,effectiveness:0,wisdom:9,cunning:0});c.enter('legacy');
assert.equal(c.getDecision().options[1].legacyReward.basis,'wisdom');
assert.equal(c.getDecision().options[1].legacyReward.quantity,9,'uses the actual highest stat');
c.previewLegacy();c.rewind();
const lowPopulation=c.getSnapshot().session,cohort=lowPopulation.state.world.sites.find(site=>site.regionId===openingVassal(lowPopulation).locationRegionId).detailedState.populationByClass.villager;
cohort.adults=0;for(const specialist of Object.values(cohort.specialists))specialist.adults=0;
c.enter('legacy');assert.equal(c.getDecision().options[0].blocked,'Requires 10 adult Villagers');
assert.ok(c.getDecision().options.slice(1).every(option=>!option.blocked));
const configured=createOpeningExperiment();Object.assign(configured.nodes.find(node=>node.kind==='legacy').legacy,{statMultiplier:2,prestigeDivisor:20,statReward:'Stat reward example',prestigeReward:'Prestige reward example'});
c.replaceDraft(configured);c.previewLegacy();
assert.equal(c.getDecision().options[1].legacyReward.quantity,12);assert.equal(c.getDecision().options[2].legacyReward.quantity,3);
const invalid=structuredClone(configured);invalid.nodes.find(node=>node.kind==='legacy').legacy.prestigeDivisor=0;
assert.throws(()=>validateOpeningExperiment(invalid),/Legacy costs/);
console.log('[opening-legacy] OK: three choices, affordability, positive fallback floors, editable scalars, highest stat, inert confirmation, draft isolation and rewind');
