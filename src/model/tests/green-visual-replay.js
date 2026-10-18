import assert from 'node:assert/strict';
import { createInitialState } from '../init.js';
import { deserializeGameState, serializeGameState } from '../state.js';
import { createTimelineFromInitialState, rebuildStateAtSecond } from '../timeline/index.js';

// Current-schema saves captured before effect removal remain loadable.
const { advanceReplayStateToSecond, initializeReplayClock } = await import('../replay-second-runner.js');
for (const tier of [0, 1, 2, 3]) {
 const original = createInitialState('devPlaytesting01', 7731);
 Object.assign(original.gameConfig.settings.values, {greenAutomaticTier:false, greenForcedTier:tier, primordialBasePressure:0});
 for (const [prefix, values] of Object.entries({greenStoredDecayReduction:[25,50,75], greenElderMortalityReduction:[20,40,60], greenMigrationSuccess:[90,75,60]})) {
  ['I','II','III'].forEach((suffix,index) => {original.gameConfig.settings.values[prefix+suffix]=values[index];});
 }
 const restored = deserializeGreenSave(original);
 const timeline = createTimelineFromInitialState(restored);
 initializeReplayClock(restored);
 assert.equal(advanceReplayStateToSecond(restored, 3).ok, true);
 const resumed = deserializeGreenSave(restored);
 initializeReplayClock(resumed, 3);
 assert.equal(advanceReplayStateToSecond(restored, 12).ok, true);
 assert.equal(advanceReplayStateToSecond(resumed, 12).ok, true);
 assert.deepEqual(serializeGameState(resumed), serializeGameState(restored), 'Green save resumes deterministically');
 const replay = rebuildStateAtSecond(timeline, 12);
 assert.equal(replay.ok, true);
 assert.deepEqual(serializeGameState(replay.state), serializeGameState(restored), 'Green save replay matches live continuation');
 assert.equal(replay.state.civilization.green.tier, tier);
}
function deserializeGreenSave(state) {
 return deserializeGameState(JSON.parse(JSON.stringify(serializeGameState(state))));
}
