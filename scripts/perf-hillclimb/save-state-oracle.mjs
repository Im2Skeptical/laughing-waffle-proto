import assert from 'node:assert/strict';

export const SETTLED_SAVE_KNOWLEDGE_POLICY='frozen-terminal-observed-before-save-v1';

// Validate independent source identity, never a knowledge value copied from the
// candidate. This setup deliberately waits for the frozen terminal before save.
export function settledSurvivalSource(snapshot,fixture,terminal){
  const r=snapshot?.runner,g=snapshot?.graph;
  assert.equal(r?.frontierSec,fixture.seconds,'survival observation has the fixture frontier');
  assert.equal(r?.actionCount,fixture.actions,'survival observation has the fixture actions');
  assert.ok(Number.isSafeInteger(r?.revision)&&r.revision>=0,'raw source revision required');
  assert.equal(g?.projection?.signatureMatches,true,'survival observation must match current source');
  assert.equal(typeof g?.asyncToken,'string');assert.ok(g.asyncToken.length>0,'source token required');
  assert.equal(g.projection.timelineToken,g.asyncToken,'foreign projection cannot supply survival knowledge');
  assert.equal(g.asyncHistoryEndSec,fixture.seconds,'projection source history must match fixture');
  assert.ok(Number.isFinite(g.computedSec)&&g.computedSec>=terminal.lossSec,'terminal coverage must precede the save clone');
  return {frontierSec:r.frontierSec,actionCount:r.actionCount,revision:r.revision,
    token:g.asyncToken,historyEndSec:g.asyncHistoryEndSec,subjectKey:g.subjectKey??null};
}

export function settledSaveKnowledge(oracle,fixture,terminal,receipt){
  assert.ok(Number.isInteger(terminal?.lossYear)&&terminal.lossYear>=1,'frozen terminal fact required');
  assert.ok(Number.isInteger(terminal?.lossSec)&&terminal.lossSec>=fixture.seconds);
  const expected=expectedPlanningPause(oracle,terminal.expectedState);
  const key=settledSurvivalSource(receipt.ready.snapshot,fixture,terminal);
  assert.equal(receipt.frames.length,2,'two following frame opportunities required');
  let previous=receipt.ready.atMs;
  assert.ok(Number.isFinite(previous));
  for(const frame of receipt.frames){
    assert.ok(Number.isFinite(frame.atMs)&&frame.atMs>previous,'subsequent frame ordering required');previous=frame.atMs;
    assert.deepEqual(settledSurvivalSource(frame.snapshot,fixture,terminal),key,'source remains stable through following frames');
  }
  assert.ok(receipt.read.startMs>=previous&&receipt.read.endMs>=receipt.read.startMs,'full read follows settled observation');
  for(const snapshot of [receipt.read.before,receipt.read.after])
    assert.deepEqual(settledSurvivalSource(snapshot,fixture,terminal),key,'source remains stable across full pre-clone read');
  assert.equal(receipt.read.actual.cursorIsFrontier,true,'pre-save inspected cursor is the frontier');
  assert.equal(receipt.read.actual.preview,null,'pre-save Present cleared preview');
  assert.deepEqual(receipt.read.actual.cursor?.stateData,expected,'all pre-save state fields/RNG equal frozen expected knowledge');
  assert.deepEqual(receipt.read.actual.timelineKnowledge,expected.persistentKnowledge,'pre-save timeline knowledge equals frozen expectation');
  return {policy:SETTLED_SAVE_KNOWLEDGE_POLICY,expectedYear:terminal.lossYear,source:key,
    triggers:[{kind:'settled-current-source-terminal-before-save',lossSec:terminal.lossSec,lossYear:terminal.lossYear,
      officialSeconds:terminal.officialSeconds,readyAtMs:receipt.ready.atMs,frameAtMs:receipt.frames.map(f=>f.atMs),
      preCloneReadStartMs:receipt.read.startMs,preCloneReadEndMs:receipt.read.endMs,source:key}]};
}

export function assertSettledSaveAfter(knowledge,fixture,snapshot,saveStartedMs){
  assert.ok(Number.isFinite(saveStartedMs)&&saveStartedMs>=knowledge.triggers[0].preCloneReadEndMs,
    'terminal knowledge must be established before save action/clone');
  assert.deepEqual(settledSurvivalSource(snapshot,fixture,knowledge.terminal),knowledge.source,
    'same source remains through save persistence');
}

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

// Derive resolved terminal-survival knowledge from an independent frozen
// simulation. The caller proves the applicable UI/controller observation
// trigger; no knowledge value comes from the actual saved output.
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
