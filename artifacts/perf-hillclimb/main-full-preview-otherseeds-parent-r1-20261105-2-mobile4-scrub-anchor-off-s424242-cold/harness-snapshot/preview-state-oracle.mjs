import assert from 'node:assert/strict';
import {expectedPlanningPause} from './save-state-oracle.mjs';

// Only frozen code and immutable inputs generate expected data. The caller must
// prove a current-source terminal observation before supplying terminalKnowledge.
export function expectedPreviewStates(oracle,fixture,second,terminalKnowledge){
  const source=JSON.stringify(fixture.expectedState);
  const saved=oracle.inspectSaveText(fixture.text);assert.equal(saved.ok,true);
  const replay=oracle.rebuildStateAtSecond(saved.nextTimeline,second);assert.equal(replay.ok,true);
  const preview=oracle.serializeGameState(replay.state);
  const frontier=expectedPlanningPause(oracle,fixture.expectedState);
  for(const state of [preview,frontier])if(terminalKnowledge){
    state.persistentKnowledge.maxObservedCivilizationSurvivalYear=Math.max(
      state.persistentKnowledge.maxObservedCivilizationSurvivalYear,terminalKnowledge.lossYear);
  }
  assert.equal(JSON.stringify(fixture.expectedState),source);
  return {preview,frontier};
}

export function assertPreviewStates(actual,expected,second){
  assert.equal(actual.version,1);
  assert.equal(actual.cursorIsFrontier,true,'retained cursor must actually be the authoritative frontier');
  assert.equal(actual.frontierSec,expected.frontier.tSec);
  assert.equal(actual.preview?.stateData.tSec,second,'exact viewed target');
  assert.deepEqual(actual.preview.stateData,expected.preview,'every serialized installed preview field and RNG');
  assert.deepEqual(actual.cursor?.stateData,expected.frontier,'every retained authoritative frontier field and RNG');
  assert.deepEqual(actual.timelineKnowledge,expected.frontier.persistentKnowledge,'retained timeline knowledge');
}
