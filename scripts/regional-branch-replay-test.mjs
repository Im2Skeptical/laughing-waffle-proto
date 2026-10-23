// Raw state/RNG comparisons after replacing future regional history. No rule changes.
import assert from 'node:assert/strict';
import { ActionKinds, applyAction } from '../src/model/actions.js';
import { createNewGameState } from '../src/model/new-game.js';
import { advanceReplayStateToSecond, initializeReplayClock } from '../src/model/replay-second-runner.js';
import { serializeGameState, deserializeGameState, syncPhaseToPaused } from '../src/model/state.js';
import { appendActionAtCursor, createTimelineFromInitialState, rebuildStateAtSecond, truncateTimelineAfterSecond } from '../src/model/timeline/index.js';
import { getVassalCandidatePool } from '../src/model/vassal-life-map.js';

function advance(state, sec) {
  assert.equal(advanceReplayStateToSecond(state, sec).ok, true);
}
function apply(state, action) {
  assert.equal(applyAction(state, action, { isReplay: true }).ok, true, action.kind);
}
function selected(state, index) {
  const pool = getVassalCandidatePool(state);
  assert.ok(pool.candidates.length > index);
  return { kind: ActionKinds.SETTLEMENT_SELECT_VASSAL,
    payload: { candidateIndex: index, expectedPoolHash: pool.expectedPoolHash } };
}
for (const seed of [1, 42, 1867]) {
  const state = createNewGameState(seed);
  initializeReplayClock(state);
  syncPhaseToPaused(state);
  const timeline = createTimelineFromInitialState(state);
  const record = (action) => {
    apply(state, action);
    assert.equal(appendActionAtCursor(timeline, action, state).ok, true);
  };
  advance(state, 1);
  record({ kind: ActionKinds.SETTLEMENT_REROLL_VASSALS, payload: {} });
  const cutoff = serializeGameState(state);
  advance(state, 2);
  record(selected(state, 0));
  advance(state, 4);
  assert.equal(rebuildStateAtSecond(timeline, 4).ok, true, 'recorded candidate payload must replay'); // Warm the future memo.
  const oldActions = structuredClone(timeline.actions);
  assert.equal(truncateTimelineAfterSecond(timeline, 1).ok, true);
  assert.deepEqual(timeline.actions, oldActions.filter(action => action.tSec === 1),
    'keep exact-cutoff actions and discard future actions');
  const atCutoff = rebuildStateAtSecond(timeline, 1);
  assert.equal(atCutoff.ok, true);
  assert.deepEqual(serializeGameState(atCutoff.state), cutoff, 'cutoff rebuild preserves full state');

  const branch = atCutoff.state;
  advance(branch, 2);
  const alternate = selected(branch, 1);
  apply(branch, alternate);
  assert.equal(appendActionAtCursor(timeline, alternate, branch).ok, true);
  advance(branch, 4);
  const expected = serializeGameState(branch);
  const reference = deserializeGameState(JSON.parse(JSON.stringify(cutoff)));
  advance(reference, 2);
  apply(reference, alternate);
  advance(reference, 4);
  assert.deepEqual(serializeGameState(reference), expected, 'independent stepped branch');
  for (const sec of [4, 0, 2, 1, 4]) {
    const rebuilt = rebuildStateAtSecond(timeline, sec);
    assert.equal(rebuilt.ok, true);
    assert.equal(rebuilt.state.paused, false);
    assert.equal(rebuilt.state.phase, 'simulation');
    if (sec === 4) assert.deepEqual(serializeGameState(rebuilt.state), expected, 'stale future memo invalidated');
  }
  const resumed = deserializeGameState(JSON.parse(JSON.stringify(expected)));
  assert.deepEqual(serializeGameState(resumed), expected, 'JSON roundtrip includes RNG');
  advance(resumed, 6);
  advance(branch, 6);
  assert.deepEqual(serializeGameState(resumed), serializeGameState(branch), 'branch continuation');
}
console.log('[regional-branch-replay] 3 seeds: exact cutoff, alternate candidate, raw replay/JSON continuation OK');
