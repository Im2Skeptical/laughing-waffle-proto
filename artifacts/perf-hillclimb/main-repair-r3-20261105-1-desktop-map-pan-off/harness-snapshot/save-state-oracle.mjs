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

// Full opening explicitly reveals terminal survival. Derive its sole knowledge
// update from an independent frozen simulation, never from actual saved output.
export function expectedOpeningKnowledge(oracle,logicalState){
  const before=JSON.stringify(logicalState),projection=oracle.deserializeGameState(logicalState);
  oracle.initializeReplayClock(projection,Math.floor(projection.tSec));
  let seconds=0;
  while(projection.runStatus?.complete!==true&&seconds<19200){
    assert.equal(oracle.advanceReplayStateOneSecond(projection).ok,true,'frozen opening projection advances every official second');seconds++;
  }
  assert.equal(projection.runStatus?.complete,true,'frozen opening terminal must resolve within declared600-year capacity');
  const lossSec=Math.floor(projection.runStatus.tSec),lossYear=Math.max(1,Math.floor(projection.runStatus.year));
  assert.ok(Number.isFinite(lossSec)&&Number.isFinite(lossYear));
  const expectedState=oracle.serializeGameState(oracle.deserializeGameState(logicalState));
  expectedState.persistentKnowledge.maxObservedCivilizationSurvivalYear=Math.max(
    expectedState.persistentKnowledge.maxObservedCivilizationSurvivalYear??1,lossYear);
  const restore=structuredClone(expectedState);
  restore.persistentKnowledge.maxObservedCivilizationSurvivalYear=logicalState.persistentKnowledge.maxObservedCivilizationSurvivalYear;
  assert.deepEqual(restore,logicalState,'opening expectation changes only independently observed terminal survival knowledge');
  assert.equal(JSON.stringify(logicalState),before,'immutable opening state remains unchanged');
  return {expectedState,lossSec,lossYear,officialSeconds:seconds};
}
