import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { createInitialState } from '../src/model/init.js';
import { createLabFixture, fiveSlots, practiceSlot, setFixturePopulation } from '../src/model/dev-lab/fixtures.js';
import { getDetailedSettlementSites } from '../src/model/detailed-settlements/queries.js';
import { advanceReplayStateToSecond } from '../src/model/replay-second-runner.js';
import { serializeGameState, deserializeGameState } from '../src/model/state.js';
import { createTimelineFromInitialState, rebuildStateAtSecond } from '../src/model/timeline/index.js';

const BIRTH_SECONDS = [1, 7, 13];

function observationTickFixture() {
  const state = createLabFixture('charge');
  const sites = getDetailedSettlementSites(state);
  for (const site of sites) {
    const local = site.detailedState;
    if (!local) continue;
    local.practiceSlots = fiveSlots();
    if (local.populationByClass) setFixturePopulation(local, 0);
  }
  const site = getDetailedSettlementSites(state, { playerOnly: true })[0];
  site.detailedState.practiceSlots = fiveSlots(practiceSlot('observation'));
  const installed = sites.reduce((count, entry) => count + (entry.detailedState?.practiceSlots ?? []).filter((slot) => slot?.practiceId === 'observation').length, 0);
  assert.equal(installed, 1, 'exactly one Observation is installed');
  state.civilization.research.total = 0;
  return state;
}

function compareState(actual, expected, label) {
  const actualSnapshot = serializeGameState(actual);
  const expectedSnapshot = serializeGameState(expected);
  const equal = isDeepStrictEqual(actualSnapshot, expectedSnapshot);
  if (!equal) {
    mkdirSync('artifacts', {recursive:true});
    writeFileSync('artifacts/observation-cadence-mismatch.json', JSON.stringify({label,actual:actualSnapshot,expected:expectedSnapshot}));
  }
  assert.equal(equal, true, label + '; details: artifacts/observation-cadence-mismatch.json');
}

assert.ok(serializeGameState(createInitialState('devPlaytesting01', 42))?.gameConfig?.gamepieces?.practices?.observation,
  'serialization keeps Observation before any fixture save/load');
const state = observationTickFixture();
const capturedObservation = state.gameConfig.gamepieces.practices.observation;
assert.ok(serializeGameState(state)?.gameConfig?.gamepieces?.practices?.observation, 'serialized initial state keeps captured Observation');
const timeline = createTimelineFromInitialState(state);
let expected = 0;
let saved = null;
let restored = null;

for (let sec = 1; sec <= 13; sec += 1) {
  const stepped = advanceReplayStateToSecond(state, sec);
  assert.equal(stepped.ok, true, `official tick reaches ${sec}`);
  assert.equal(state.tSec, sec, `clock is the official second ${sec}`);
  if (BIRTH_SECONDS.includes(sec)) expected += 1;
  assert.equal(state.civilization.research.total, expected, `Research total after second ${sec}`);
  if (sec === 7) {
    saved = serializeGameState(state);
    const savedObservation = saved?.gameConfig?.gamepieces?.practices?.observation;
    assert.ok(savedObservation, 'save still contains gameConfig.practices.observation');
    assert.deepEqual(savedObservation, capturedObservation, 'saved Observation definition matches the definition captured before deserialize');
    restored = deserializeGameState(saved);
    assert.equal(restored.civilization.research.total, 2, 'reloaded Research at the second Birth');
  }
}

assert.equal(expected, 3, 'three Births award 1 Research each');
assert.ok(saved && restored, 'save branch exists');
const continued = advanceReplayStateToSecond(restored, 13);
assert.equal(continued.ok, true, 'reloaded state reaches second 13 by official ticks');
assert.equal(restored.civilization.research.total, 3, 'reloaded Research includes the third Birth');
compareState(restored, state, 'saved continuation matches the live GameState');
const rebuilt = rebuildStateAtSecond(timeline, 13);
assert.equal(rebuilt.ok, true, 'authoritative rebuild succeeds');
compareState(rebuilt.state, state, 'authoritative rebuild matches the live GameState');
console.log('[observation-cadence] OK: Birth totals 1/2/3, off-Birth unchanged, raw save and replay');
