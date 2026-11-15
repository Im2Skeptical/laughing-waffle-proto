import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadFrozenCorpus} from './freeze-corpus.mjs';
import {expectedPlanningPause,expectedOpeningKnowledge} from './save-state-oracle.mjs';

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
