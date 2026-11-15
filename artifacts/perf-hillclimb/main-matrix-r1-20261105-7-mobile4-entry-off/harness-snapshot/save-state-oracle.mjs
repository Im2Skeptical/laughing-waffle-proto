import assert from 'node:assert/strict';

// Derive the known UI pause on independent frozen data. Never normalize or copy
// control flags from the actual output being checked. Replay expectation stays
// separate: its official-second state is intentionally simulation/unpaused.
export function expectedPlanningPause(oracle,logicalState){
  const sourceBefore=JSON.stringify(logicalState);
  assert.deepEqual(oracle.serializeGameState(oracle.deserializeGameState(logicalState)),logicalState,
    'immutable expected state must already round-trip without repair');
  const expected=oracle.serializeGameState(oracle.deserializeGameState({...logicalState,paused:true}));
  assert.equal(expected.paused,true);assert.equal(expected.phase,'planning','frozen SDK derives the paused phase');
  assert.deepEqual({...expected,paused:logicalState.paused,phase:logicalState.phase},logicalState,
    'expected UI pause must not change any other serialized field, including knowledge and RNG');
  assert.equal(JSON.stringify(logicalState),sourceBefore,'expected transition must leave immutable baseline input untouched');
  return expected;
}
