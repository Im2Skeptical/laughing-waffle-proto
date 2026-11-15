import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadFrozenCorpus} from './freeze-corpus.mjs';
import {expectedPlanningPause,expectedOpeningKnowledge,settledSaveKnowledge,assertSettledSaveAfter} from './save-state-oracle.mjs';

const manifest='artifacts/perf-hillclimb/frozen-baseline-a9df52c-sourceproof-20261104/manifest.json';
const pin='406f042f7e4a3142620b8d05023167d98893185d24347f4745740a3a3feac000';
const {oracle,fixtures}=await loadFrozenCorpus(manifest,{expectedIdentity:pin,seed:123});
const source=fixtures.history.expectedState,sourceBefore=structuredClone(source),expected=expectedPlanningPause(oracle,source);
const prefix='artifacts/perf-hillclimb/life-passive-frozen-parent-r2-20261105/launch-0-life-life-';
const saved=JSON.parse(await readFile(prefix+'raw-save.json','utf8'));
const rebuilt=JSON.parse(await readFile(prefix+'rebuilt-state.json','utf8'));
assert.deepEqual(saved.state,expected,'recorded real UI result equals independent expected pause, all other fields exact');
assert.deepEqual(rebuilt,source,'authoritative replay still equals the original unmodified simulation fixture');
for(const [name,change]of [
  ['unpaused',state=>{state.paused=false;}], ['wrong phase',state=>{state.phase='simulation';}],
  ['wrong RNG',state=>{state.rng.baseSeed++;}], ['wrong second',state=>{state.tSec++;}],
]){
  const wrong=structuredClone(saved.state);change(wrong);
  assert.throws(()=>assert.deepEqual(wrong,expected),`${name} cannot be erased by raw-output normalization`);
}
assert.deepEqual(source,sourceBefore,'deriving expected controls does not mutate the frozen source');
const opening=expectedOpeningKnowledge(oracle,fixtures.ordinary.expectedState);
assert.equal(opening.lossSec,3918);assert.equal(opening.lossYear,123);
const actualOpening=JSON.parse(await readFile('artifacts/perf-hillclimb/main-matrix-r1-20261105-8-mobile4-performance-off/launch-0-performance-prepared-raw-save.json','utf8')).state;
assert.deepEqual(actualOpening,expectedPlanningPause(oracle,opening.expectedState),'real completed opening matches independent frozen survival knowledge plus known UI pause');
const selectedTerminal=expectedOpeningKnowledge(oracle,fixtures.selected.expectedState);
for(const population of ['0-desktop','1-mobile4']){
  const base=`artifacts/perf-hillclimb/main-repair-r5-frontier-20261105-${population}-scrub-off/launch-0-scrub-anchor-scrub-frontier-`;
  const raw=JSON.parse(await readFile(base+'raw-save.json','utf8')).state;
  const rebuilt=JSON.parse(await readFile(base+'rebuilt-state.json','utf8'));
  assert.deepEqual(raw,expectedPlanningPause(oracle,selectedTerminal.expectedState),'real scrub preserves all frontier/RNG fields except independently derived pause and resolved survival knowledge');
  assert.deepEqual(rebuilt,selectedTerminal.expectedState,'actual authoritative rebuild preserves exact expected frontier/RNG plus known terminal observation');
}
for(const mutate of [s=>{s.persistentKnowledge.maxObservedCivilizationSurvivalYear=124;},s=>{s.persistentKnowledge.droppedItemKindsByPoolId.extra=['invented'];},s=>{s.rng.baseSeed++;}]){
  const wrong=structuredClone(actualOpening);mutate(wrong);
  assert.throws(()=>assert.deepEqual(wrong,expectedPlanningPause(oracle,opening.expectedState)),'other knowledge/RNG differences are never ignored');
}
const output=`artifacts/perf-hillclimb/save-state-controls-${new Date().toISOString().replace(/[:.]/g,'-')}`;
await mkdir(output);
const hashes={};for(const file of ['scripts/perf-hillclimb/save-state-oracle.mjs','scripts/perf-hillclimb/save-state-oracle-test.mjs'])
  hashes[file]=createHash('sha256').update(await readFile(file)).digest('hex');
await writeFile(`${output}/controls.json`,JSON.stringify({ok:true,frozenManifestId:pin,recordedActualPrefix:prefix,sourceHashes:hashes,
  expectedControl:{paused:expected.paused,phase:expected.phase},sourceControl:{paused:source.paused,phase:source.phase},
  scope:'independent expected UI pause and strict raw/rebuilt state separation; real fresh job and full harness audit still required'},null,2));
console.log(`[save-state-oracle] PASS recorded UI/frozen replay parity; wrong phase/pause/RNG/second rejection; ${output}/controls.json`);

let settledControls=0;
for(const seed of [123,424242,99117]){
  const loaded=await loadFrozenCorpus(manifest,{expectedIdentity:pin,seed}),fixture=loaded.fixtures['later-history'];
  const immutableBefore=JSON.stringify(fixture.expectedState),terminal=expectedOpeningKnowledge(loaded.oracle,fixture.expectedState);
  const source={runner:{frontierSec:fixture.seconds,actionCount:fixture.actions,revision:4},
    graph:{computedSec:terminal.lossSec,asyncHistoryEndSec:fixture.seconds,asyncToken:'source-4',subjectKey:'fixture',
      projection:{signatureMatches:true,timelineToken:'source-4'}}};
  const expected=expectedPlanningPause(loaded.oracle,terminal.expectedState);
  const receipt={ready:{atMs:10,snapshot:structuredClone(source)},
    frames:[{atMs:20,snapshot:structuredClone(source)},{atMs:30,snapshot:structuredClone(source)}],
    read:{startMs:31,endMs:35,before:structuredClone(source),after:structuredClone(source),
      actual:{cursorIsFrontier:true,preview:null,cursor:{stateData:structuredClone(expected)},timelineKnowledge:structuredClone(expected.persistentKnowledge)}}};
  const knowledge={...settledSaveKnowledge(loaded.oracle,fixture,terminal,receipt),terminal};settledControls++;
  assertSettledSaveAfter(knowledge,fixture,source,40);settledControls++;
  for(const [name,mutate]of [
    ['wrong fixture frontier',r=>r.ready.snapshot.runner.frontierSec++],
    ['wrong actions',r=>r.ready.snapshot.runner.actionCount++],
    ['foreign projection',r=>r.ready.snapshot.graph.projection.timelineToken='foreign'],
    ['stale signature',r=>r.ready.snapshot.graph.projection.signatureMatches=false],
    ['wrong history',r=>r.ready.snapshot.graph.asyncHistoryEndSec++],
    ['insufficient early coverage',r=>r.ready.snapshot.graph.computedSec=terminal.lossSec-1],
    ['late-only terminal',r=>r.frames[0].snapshot.graph.computedSec=terminal.lossSec-1],
    ['source changed across frames',r=>r.frames[1].snapshot.runner.revision++],
    ['source changed across read',r=>r.read.after.runner.revision++],
    ['missing frame',r=>r.frames.pop()],
    ['wrong frame order',r=>r.frames[1].atMs=5],
    ['read before settled frames',r=>r.read.startMs=20],
    ['wrong knowledge',r=>r.read.actual.cursor.stateData.persistentKnowledge.maxObservedCivilizationSurvivalYear++],
    ['missing knowledge',r=>r.read.actual.cursor.stateData.persistentKnowledge.maxObservedCivilizationSurvivalYear=null],
    ['wrong timeline knowledge',r=>r.read.actual.timelineKnowledge.maxObservedCivilizationSurvivalYear++],
    ['wrong RNG',r=>r.read.actual.cursor.stateData.rng.baseSeed++],
    ['unexpected preview',r=>r.read.actual.preview={stateData:expected}],
    ['not frontier',r=>r.read.actual.cursorIsFrontier=false],
  ]){
    const wrong=structuredClone(receipt);mutate(wrong);
    assert.throws(()=>settledSaveKnowledge(loaded.oracle,fixture,terminal,wrong),name);settledControls++;
  }
  assert.throws(()=>assertSettledSaveAfter(knowledge,fixture,source,34),'late-only observation after save clone');settledControls++;
  const changed=structuredClone(source);changed.runner.revision++;
  assert.throws(()=>assertSettledSaveAfter(knowledge,fixture,changed,40),'source changed after clone');settledControls++;
  if(seed===424242){
    const retained='artifacts/perf-hillclimb/feedback-final-matrix-r2-20261105-otherseeds-6-mobile4-performance-continue-off-s424242-cold/launch-0-performance-continue-continued-raw-save.json';
    const actual=JSON.parse(await readFile(retained)).state;
    assert.deepEqual(actual,expected,'retained failing Continue state equals fully independent frozen terminal expectation');settledControls++;
  }
  assert.equal(JSON.stringify(fixture.expectedState),immutableBefore,'settled controls leave frozen fixture unchanged');
}
await writeFile(`${output}/settled-controls.json`,JSON.stringify({policy:'frozen-terminal-observed-before-save-v1',controls:settledControls,
  scope:'three-seed helper rejection controls and retained full-state parity only; actual path proof remains separate'},null,2));
console.log(`[save-state-oracle] PASS ${settledControls} settled source/knowledge/frame/clone controls; ${output}/settled-controls.json`);
