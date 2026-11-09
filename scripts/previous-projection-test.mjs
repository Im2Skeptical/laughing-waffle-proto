import assert from 'node:assert/strict';
import { createNewGameState } from '../src/model/new-game.js';
import { serializeGameState } from '../src/model/state.js';
import { createTimelineFromInitialState } from '../src/model/timeline/index.js';
import { createProjectionCache } from '../src/model/timegraph/projection-cache.js';
import { createTimeGraphController } from '../src/model/timegraph/controller-core.js';
import { retainProjectionForBrowsing } from '../src/model/timegraph/retained-projection.js';
import { createSettlementPlayback } from '../src/views/ui-root/settlement-playback.js';
import { createProjectionReplacementState, syncProjectionReplacementContext, stageProjectionReplacementTransition, activateProjectionReplacementTransition, getPreviousProjectionStateAt, getPreviousProjectionBrowseEndSec, buildProjectionReplacementRenderState } from '../src/views/timegraphs/projection-replacement-state.js';

const state=createNewGameState(131),timeline=createTimelineFromInitialState(state),cache=createProjectionCache();
const controller=createTimeGraphController({getTimeline:()=>timeline,getCursorState:()=>state,projectionCache:cache,horizonSec:96,forecastStepSec:16});
controller.ensureForecastCoverageTo(96);
const expected=serializeGameState(controller.getStateAt(47));
const before=JSON.stringify(timeline),started=performance.now();
const retained=controller.retainForecastForBrowsing(0,64);
const captureMs=performance.now()-started;
assert.equal(JSON.stringify(timeline),before,'capture leaves timeline/RNG untouched');
assert.ok(retained.anchorCount>1);
assert.equal(retained.endSec,64);
assert.equal(retained.getStateAt(65),null,'computed but never unveiled is inaccessible');
assert.equal(retained.getStateAt(-1),null);
assert.deepEqual(serializeGameState(retained.getStateAt(47)),expected,'off-anchor official replay is exact');
const first=retained.getStateAt(47);first.world.regions[0].controller='test-mutation';
assert.ok(Object.isFrozen(first.gameConfig),'retained configurations stay immutable');
assert.deepEqual(serializeGameState(retained.getStateAt(47)),expected,'preview bodies never alias');
cache.clear();
timeline.baseStateData.world.regions[0].controller='player';
assert.deepEqual(serializeGameState(retained.getStateAt(47)),expected,'a later branch and invalidation cannot change the retained future');
const raw=serializeGameState(state),privateReader=retainProjectionForBrowsing({startSec:0,endSec:4,anchors:[[0,raw]]});
raw.world.regions[0].controller='test-mutation';
assert.notEqual(privateReader.getStateAt(0).world.regions[0].controller,'test-mutation','capture owns its anchors');
const replacement=createProjectionReplacementState();syncProjectionReplacementContext(replacement,timeline,'civilization');
stageProjectionReplacementTransition(replacement,{snapshot:{pointsForDraw:[{tSec:0},{tSec:64}]},truncationStartSec:0,maxSecFloor:64,browsing:retained});
activateProjectionReplacementTransition(replacement,0,{activateProjectionReplacementTransition:true});
assert.equal(getPreviousProjectionBrowseEndSec(replacement),64);
assert.equal(getPreviousProjectionStateAt(replacement,8,10),null,'newly revealed area uses the current future');
assert.deepEqual(serializeGameState(getPreviousProjectionStateAt(replacement,47,10)),expected);
syncProjectionReplacementContext(replacement,timeline,'settlement');assert.equal(getPreviousProjectionBrowseEndSec(replacement),null);
syncProjectionReplacementContext(replacement,timeline,'civilization');assert.equal(getPreviousProjectionBrowseEndSec(replacement),64);
assert.equal(buildProjectionReplacementRenderState(replacement,100,64),null);
assert.equal(getPreviousProjectionBrowseEndSec(replacement),null,'fully replaced future releases its reader');
let preview=null,commitCount=0,speculative=0,currentEnd=8;
const oldStates=new WeakSet();
const playback=createSettlementPlayback({getRunner:()=>({getTimeline:()=>({historyEndSec:0}),getCursorState:()=>state,
 getState:()=>preview??state,getPreviewStatus:()=>({active:!!preview,isForecastPreview:!!preview,previewSec:preview?.tSec}),
 setPreviewState:s=>{preview=s;},clearPreviewState:()=>{preview=null;},browseCursorSecond:()=>({ok:true}),
 setTimeScaleTarget:()=>({ok:true}),commitPreviewToLive:()=>{commitCount++;return {ok:true};}}),
 getForecastController:()=>({getForecastStatus:()=>({browseCapSec:currentEnd})}),
 getGraphController:()=>({ensureForecastCoverageTo:()=>{speculative++;}}),
 getGraphView:()=>({getPreviousProjectionBrowseEndSec:()=>64,isPreviousProjectionSecond:s=>s>currentEnd&&s<=64,
  getPreviousProjectionStateAt:s=>{const result=retained.getStateAt(s);oldStates.add(result);return result;},isPreviousProjectionPreviewState:s=>oldStates.has(s)})});
assert.equal(playback.getSettlementPreviewCapSec(),64);
assert.equal(playback.previewSettlementViewedSecond(47).ok,true);
assert.deepEqual(serializeGameState(preview),expected);
assert.equal(speculative,0,'old browsing does not simulate a new future');
assert.equal(playback.commitSettlementViewedSecond(47).reason,'previousProjectionReadOnly');
assert.equal(playback.promoteSettlementPreviewToLive().reason,'previousProjectionReadOnly');
playback.setSettlementPlaybackTarget(1);playback.updateSettlementPreviewPlayback(1);
assert.equal(preview.tSec,48,'time controls browse the retained future too');
currentEnd=64;
assert.equal(playback.promoteSettlementPreviewToLive().reason,'previousProjectionReadOnly','stale old previews cannot commit as the boundary overtakes them');
assert.equal(commitCount,0);
console.log(`[previous-projection] PASS exact replay, revealed-only cap, isolation, branch/context/reset boundaries; capture ${captureMs.toFixed(1)} ms, ${retained.anchorCount} anchors (desktop Node)`);
