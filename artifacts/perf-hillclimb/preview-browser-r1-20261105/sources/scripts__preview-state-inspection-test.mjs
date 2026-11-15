import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createSimRunner} from '../src/controllers/sim-runner.js';
import {createProjectionStateRestorer} from '../src/model/timegraph/state-restorer.js';
import {createProjectionCache} from '../src/model/timegraph/projection-cache.js';
import {createTimeGraphController} from '../src/model/timegraph/controller-core.js';
import {serializeGameState,deserializeGameState} from '../src/model/state.js';
import {publishSettlementDebugApi} from '../src/views/ui-root/settlement-debug-api.js';
import {loadFrozenCorpus} from './perf-hillclimb/freeze-corpus.mjs';
import {expectedPreviewStates,assertPreviewStates} from './perf-hillclimb/preview-state-oracle.mjs';
import {expectedPlanningPause} from './perf-hillclimb/save-state-oracle.mjs';

const output=process.argv[2]??`artifacts/perf-hillclimb/preview-focused-${Date.now()}`;
await mkdir(output,{recursive:true});
try {
const evidence=[];
function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const v of Object.values(value))freeze(v);}return value;}
const pin='406f042f7e4a3142620b8d05023167d98893185d24347f4745740a3a3feac000';
for(const seed of [123,424242,99117]){
  const {oracle,fixtures,manifest}=await loadFrozenCorpus('artifacts/perf-hillclimb/frozen-baseline-a9df52c-sourceproof-20261104/manifest.json',{expectedIdentity:pin,seed});
  assert.equal(manifest.sdk.sha256,'8c163025e51f71818016c358c1f10055beaf343dfc249f3db6713965d5fc40b0');
  const fixture=fixtures.ordinary,saved=oracle.inspectSaveText(fixture.text);
  const anchors=new Map([0,16,32].map(sec=>[sec,freeze(oracle.serializeGameState(oracle.rebuildStateAtSecond(saved.nextTimeline,sec).state))]));
  const anchorsBefore=JSON.stringify([...anchors]);
  let callbacks=0;
  const runner=createSimRunner({onInvalidate:()=>callbacks++,onRebuildViews:()=>callbacks++});
  runner.resetToState(deserializeGameState(expectedPlanningPause(oracle,fixture.expectedState)));
  const cursor=runner.getCursorState(),timeline=runner.getTimeline();
  const cache=createProjectionCache();cache.getTimelineToken(timeline);
  for(const [sec,data]of anchors)cache.setStateData(sec,data);
  cache.ensureForecastWindow=()=>{throw new Error('unexpected forecast work');};
  // Controller uses the same private codec as the actual UI. Its cache has
  // coverage from retained summaries, never an injected production pointer.
  for(let sec=0;sec<=32;sec++)cache.setSummary(sec,{tSec:sec});
  assert.equal(cache.mergeForecastChunk(timeline,{timelineToken:cache.getTimelineToken(timeline),historyEndSec:0,
    baseSec:0,endSec:32,stepSec:1,stateDataBySecond:anchors,summaryBySecond:new Map([[32,{tSec:32}]])}).ok,true);
  const controller=createTimeGraphController({getTimeline:()=>timeline,getCursorState:()=>cursor,projectionCache:cache});
  const restorer=createProjectionStateRestorer();
  const beforeCallbacks=callbacks;
  for(const second of [16,17]){
    const raw=restorer.restore(anchors.get(16),16,second);
    runner.setPreviewState(raw);
    const rawBefore=JSON.stringify(raw),cursorBefore=JSON.stringify(cursor),timelineBefore=JSON.stringify(timeline);
    const rawFunctions=Object.entries(raw).filter(([,v])=>typeof v==='function');
    freeze(raw);
    const expected=expectedPreviewStates(oracle,fixture,second);
    for(let i=0;i<12;i++){
      const observed=runner.inspectRetainedStates();assertPreviewStates(observed,expected,second);
      observed.preview.stateData.rng.seed=-1;observed.cursor.stateData.world.sites[0].regionId='DTO-only';
      observed.timelineKnowledge.invented=true;
    }
    assert.equal(JSON.stringify(raw),rawBefore);assert.equal(JSON.stringify(cursor),cursorBefore);assert.equal(JSON.stringify(timeline),timelineBefore);
    for(const [key,fn]of rawFunctions)assert.equal(raw[key],fn);
    assert.equal(callbacks,beforeCallbacks);
    const poison=()=>{throw new Error('forbidden debug dependency');};
    publishSettlementDebugApi({inspectRetainedStates:()=>runner.inspectRetainedStates(),getTimingSnapshot:poison,getState:poison,getCursorState:poison,getGraphControllerData:poison});
    assertPreviewStates(globalThis.__SETTLEMENT_DEBUG__.inspectRetainedStates(),expected,second);
    for(const kind of ['field','extra','rng','target']){
      const wrong=runner.inspectRetainedStates();
      if(kind==='field')wrong.preview.stateData.world.sites[0].regionId='wrong';
      if(kind==='extra')wrong.preview.stateData.invented={};
      if(kind==='rng')wrong.preview.stateData.rng.vassalSeed^=1;
      if(kind==='target')wrong.preview.stateData.tSec++;
      assert.throws(()=>assertPreviewStates(wrong,expected,second),undefined,kind+' must reject');
    }
    // Real installed preview mutation, not mutation of a copied inspection DTO.
    const installed=restorer.restore(anchors.get(16),16,second);runner.setPreviewState(installed);
    installed.world.sites[0].regionId='real-installed-mutant';installed.rng.vassalSeed^=1;
    assert.throws(()=>assertPreviewStates(runner.inspectRetainedStates(),expected,second));
    const other=restorer.restore(anchors.get(16),16,second===16?17:16);
    assert.deepEqual(serializeGameState(other),expectedPreviewStates(oracle,fixture,second===16?17:16).preview);
    runner.setPreviewState(restorer.restore(anchors.get(16),16,second));
    assertPreviewStates(runner.inspectRetainedStates(),expected,second);
    assert.equal(JSON.stringify(cursor),cursorBefore);assert.equal(JSON.stringify(timeline),timelineBefore);
    assert.equal(JSON.stringify([...anchors]),anchorsBefore);
    // Real graph-controller restore + install; mutation must not poison either
    // exact-anchor or off-anchor/replay cache paths.
    const fromController=controller.getStateAt(second);assert.ok(fromController);
    runner.setPreviewState(fromController);fromController.world.sites[0].regionId='controller-mutant';fromController.rng.seed^=1;
    assert.throws(()=>assertPreviewStates(runner.inspectRetainedStates(),expected,second));
    runner.setPreviewState(controller.getStateAt(second));
    assertPreviewStates(runner.inspectRetainedStates(),expected,second);
    assert.equal(JSON.stringify([...anchors]),anchorsBefore);
    evidence.push({seed,second,pass:true,rawFrozenPurityReads:12,wrongFieldExtraRngTargetRejected:true,realInstalledRestorerAndControllerMutation:true});
  }
  runner.rememberCivilizationSurvivalYear(123);
  const stale=restorer.restore(anchors.get(16),16);runner.setPreviewState(stale);
  stale.persistentKnowledge.maxObservedCivilizationSurvivalYear=null;
  const staleBefore=JSON.stringify(stale);
  assert.equal(runner.inspectRetainedStates().preview.stateData.persistentKnowledge.maxObservedCivilizationSurvivalYear,null,
    'inspector must not perform the knowledge merge done by getState');
  assert.equal(JSON.stringify(stale),staleBefore);
  runner.getState();assert.equal(stale.persistentKnowledge.maxObservedCivilizationSurvivalYear,123,'control exercises a real pending merge');
}
await writeFile(`${output}/results.json`,JSON.stringify(evidence,null,2));
console.log(`[preview-inspection] PASS ${evidence.length} seed/target cells; ${output}/results.json`);
} catch(error) {
  await writeFile(`${output}/failure.json`,JSON.stringify({message:error.message,stack:error.stack,actual:error.actual,expected:error.expected},null,2));
  console.error(`[preview-inspection] FAIL: ${error.message.split('\n')[0]}; ${output}/failure.json`);process.exitCode=1;
}
