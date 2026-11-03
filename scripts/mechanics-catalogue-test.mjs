import assert from 'node:assert/strict';
import { MECHANICS, gamepieceMechanics } from '../src/defs/mechanics.js';
import { createAuthoredGamepiecesDraft, validateGamepiecesDraft, canonicalizeGamepiecesDraft } from '../src/model/game-config.js';
import { getGamepieceFace } from '../src/model/gamepiece-presentation.js';
import { getInspectionTerms } from '../src/views/inspection-terms.js';
import { getPracticeSymbols } from '../src/views/inspection-symbols-pixi.js';
import { createLabFixture, practiceSlot, fiveSlots, setFixturePopulation } from '../src/model/dev-lab/fixtures.js';
import { getDetailedSettlementSites } from '../src/model/detailed-settlements/queries.js';
import { addMonsterPressure, triggerMonsterSpawn } from '../src/model/detailed-settlements/external-world.js';
import { flushPracticeEvents, runPracticeActivation } from '../src/model/detailed-settlements/practices.js';
import { serializeGameState, deserializeGameState } from '../src/model/state.js';
import { advanceReplayStateToSecond } from '../src/model/replay-second-runner.js';
import { createTimelineFromInitialState, rebuildStateAtSecond } from '../src/model/timeline/index.js';

const draft = createAuthoredGamepiecesDraft();
assert.equal(validateGamepiecesDraft(draft).ok, true);
for (const mutate of [
  p => { p.charge.trigger.any[0].kind = 'notAnImplementedTrigger'; },
  p => { p.charge.trigger.any[0].scope = 'neighboursTypo'; },
  p => { p.charge.trigger.any[0].typoFilter = true; },
  p => { p.charge.trigger.any = [{kind:'monsterPressure',traitsAny:['Bone']}]; },
  p => { p.effects[0].op = 'notAnImplementedEffect'; },
  p => { p.effects = [{ op:'triggerMonsterSpawn', amount:1.5 }]; },
  p => { p.effects = [{ op:'triggerMonsterSpawn', amount:1, populationBand:10 }]; },
  p => { p.charge.trigger.any = [{ kind:'monsterSpawn' }]; },
  p => { p.charge.trigger.any = [{ kind:'monsterSpawn', scope:'civilization', faction:'player' }]; },
]) {
  const invalid = structuredClone(draft);
  mutate(invalid.practices.watchkeeping);
  assert.equal(validateGamepiecesDraft(invalid).ok, false, 'unsupported references fail before a run');
}
const query = structuredClone(draft);
Object.values(query.structures)[0].modifiers = [{kind:'chargeGain',amount:1,query:{triggerKindsAny:['madeUp']}}];
assert.equal(validateGamepiecesDraft(query).ok, false);
const keywordDraft = structuredClone(draft);
keywordDraft.practices.forage.keywordOutputScale = {keyword:'synthesis',per:1,cap:3,amount:1};
assert.equal(validateGamepiecesDraft(keywordDraft).ok,true);
assert.deepEqual(canonicalizeGamepiecesDraft(keywordDraft).practices.forage.keywordOutputScale,
  keywordDraft.practices.forage.keywordOutputScale,'new valid keyword attachment survives capture');


function fixture({ loop = false, scheduled = false } = {}) {
  const state = createLabFixture('charge');
  for (const site of getDetailedSettlementSites(state)) {
    site.detailedState.practiceSlots = fiveSlots();
    site.detailedState.structureSlots.fill(null);
    setFixturePopulation(site.detailedState, 0);
  }
  const site = getDetailedSettlementSites(state, { playerOnly:true })[0];
  const id = scheduled ? 'forage' : 'watchkeeping';
  const def = state.gameConfig.gamepieces.practices[id];
  delete def.condition;
  delete def.specialistRequired;
  delete def.scholarRequired;
  def.workerCapacity = 0;
  def.effects = [{op:loop || scheduled ? 'triggerMonsterSpawn' : 'research',amount:1}];
  def.charge = { gain:1, threshold:1, trigger:{ any:[{kind:'monsterSpawn',scope:'civilization'}] },
    triggerText:'Deliberately stale prose: every Creep gain.', dischargeText:'Authored prose is not the trigger.' };
  if (scheduled) { def.mode = def.lane = 'scheduled'; def.activation = {type:'birth'}; delete def.charge; }
  site.detailedState.practiceSlots = fiveSlots(practiceSlot(id));
  state.civilization.chaos.monsterPressure = 0;
  state.civilization.practiceEvents = {nextId:1,pending:[],trace:[]};
  const validation=validateGamepiecesDraft(state.gameConfig.gamepieces);
  assert.equal(validation.ok, true, validation.errors.join('; '));
  return {state,site,slot:site.detailedState.practiceSlots[0]};
}

const f = fixture(), startResearch = f.state.civilization.research.total;
const rng = JSON.stringify(f.state.rng);
addMonsterPressure(f.state, 250);
const spawns = f.state.civilization.practiceEvents.pending.filter(e => e.kind === 'monsterSpawn');
assert.equal(spawns.length, 2, 'two threshold resolutions, not one per regional signal');
assert.equal(f.state.civilization.chaos.monsterPressure, 50);
assert.ok(spawns.every(e => e.cause === 'creep' && e.regionId === undefined));
flushPracticeEvents(f.state);
assert.equal(f.state.civilization.research.total - startResearch, 2, 'global card reacts exactly once per Spawn');
assert.equal(JSON.stringify(f.state.rng), rng, 'no new random draw');

const direct = fixture();
direct.state.civilization.chaos.monsterPressure = 12.5;
triggerMonsterSpawn(direct.state);
assert.equal(direct.state.civilization.chaos.monsterPressure, 12.5);
assert.equal(direct.state.civilization.practiceEvents.pending.filter(e => e.kind === 'monsterSpawn').length, 1);
const loaded = deserializeGameState(serializeGameState(direct.state));
flushPracticeEvents(direct.state); flushPracticeEvents(loaded);
assert.deepEqual(serializeGameState(direct.state), serializeGameState(loaded), 'pending global event survives save/load');

const blocked = fixture();
for (const region of blocked.state.world.regions) region.monster={defense:2};
assert.equal(triggerMonsterSpawn(blocked.state).outcome,'strengthened');
assert.equal(blocked.state.civilization.practiceEvents.pending.filter(e=>e.kind==='monsterSpawn').length,1);
const stopped = fixture();
stopped.state.runStatus={complete:true};
assert.equal(triggerMonsterSpawn(stopped.state),null);
assert.equal(stopped.state.civilization.practiceEvents.pending.length,0,'completed runs cannot spawn');

const activation = fixture({scheduled:true});
runPracticeActivation(activation.state, 'birth');
assert.equal(activation.state.civilization.chaos.expansionEvents, 1, 'real DSL operation resolves a Spawn');
assert.equal(activation.state.civilization.chaos.monsterPressure, 0);

const loop = fixture({loop:true});
triggerMonsterSpawn(loop.state);
flushPracticeEvents(loop.state);
assert.equal(loop.state.civilization.chaos.expansionEvents, 2, 'Spawn-triggering Spawn card respects one Discharge per root');
assert.equal(loop.slot.charge, 1, 'child Spawn Charge is retained');
assert.equal(loop.state.civilization.practiceEvents.pending.length, 0);

const face = getGamepieceFace(f.state, 'practice', 'watchkeeping');
assert.match(face.reading.trigger, /every Monster Spawn/);
assert.doesNotMatch(face.reading.trigger, /Creep gain/);
assert.ok(face.mechanics.some(m => m.id === 'monsterSpawn'));
assert.ok(getPracticeSymbols(face).some(s => s.name === MECHANICS.monsterSpawn.name));
assert.equal(getInspectionTerms(face).terms['Monster Spawn'], MECHANICS.monsterSpawn.definition);
assert.deepEqual(gamepieceMechanics(draft.practices.experimentation).map(m=>m.id), ['research','shopQuality','creep','stock']);

const replay = fixture({scheduled:true}).state;
const timeline = createTimelineFromInitialState(replay);
assert.equal(advanceReplayStateToSecond(replay, 2).ok, true);
const rebuilt = rebuildStateAtSecond(timeline, 2);
assert.equal(rebuilt.ok, true);
assert.ok(replay.civilization.chaos.expansionEvents > 0, 'official tick activates the Spawn recipe');
assert.deepEqual(serializeGameState(replay), serializeGameState(rebuilt.state), 'authoritative replay includes the new operation and event');
console.log('[mechanics-catalogue] validation, linked readings, real Spawn effects/reactions, overflow, chains, save and replay passed');
