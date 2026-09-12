import assert from 'node:assert/strict';
import { fitPiece, constructionGeometry } from '../src/views/piece-geometry.js';
import { getGamepieceFace } from '../src/model/gamepiece-presentation.js';
import { getMoonCycleDurationSec, getMoonPhaseDurationSec } from '../src/model/moon-phases.js';

const faceClock={tSec:0,seasonDurationSec:8};
for(const [id,period,offset] of [['cultivate',32,9],['exchange',8,1],['forage',getMoonCycleDurationSec(faceClock),1+getMoonPhaseDurationSec(faceClock)]]){
  for(const second of [offset,offset+period/2,offset+period,offset+period/2,offset]){
    const clock={...faceClock,tSec:second},before=JSON.stringify(clock);
    const face=getGamepieceFace(clock,'practice',id);
    assert.ok(Math.abs(face.fill-((second-offset)%period)/period)<1e-10,`${id}: disc samples its trigger interval at ${second}`);
    assert.equal(JSON.stringify(clock),before,'Reading a face never advances time');
  }
}

for(const bounds of [{x:0,y:0,width:90,height:99},{x:5,y:8,width:350,height:200},{x:0,y:0,width:234,height:340}]){
  for(const footprint of [1,2,3]){
    const fitted=fitPiece(bounds,'structure',footprint);
    assert.equal(fitted.width/fitted.height,3*footprint/4);
    assert.ok(fitted.width*fitted.scale<=bounds.width+.001&&fitted.height*fitted.scale<=bounds.height+.001);
  }
  const card=fitPiece(bounds,'practice');assert.equal(card.width/card.height,5/7);
}
for(const capacity of [5,6,7,8]){
  const strip=constructionGeometry({x:0,y:0,width:582,height:108},capacity);
  assert.ok(Math.abs(strip.cell/strip.height-3/4)<1e-10);
  assert.ok(strip.width<=582&&strip.height<=108);
}
import { getNavigationVassalPortrait } from '../src/views/settlement-navigation-pixi.js';
import { getIllustrationSpec } from '../src/views/chronicle-art.js';
import { GRAPH_METRICS } from '../src/model/graph-metrics.js';
import { getGraphGroupSeriesIds, getActiveGraphGroups, toggleGraphGroup } from '../src/views/ui-root/settlement-graph-groups.js';
import {
  createSettlementGraphSession,
  getSettlementGraphMetric,
  getSettlementGraphRevealConfig,
  resolveEffectiveSettlementGraphHorizonSec,
  SETTLEMENT_GRAPH_REVEAL_DEFAULT,
  SETTLEMENT_GRAPH_REVEAL_PENDING_COMMIT,
  SETTLEMENT_GRAPH_WINDOW_SEC,
} from '../src/views/ui-root/settlement-graph-session.js';
import { computeGraphSeriesScaleRanges } from '../src/views/timegraphs-helpers.js';
import {
  createForecastRevealState,
  getAnimatedForecastCoverageEndSec,
  getDisplayHistoryEndSec,
  getForecastRevealDesiredVelocitySecPerSec,
  getForecastRevealEffectiveStartDelayMs,
  getForecastRevealFollowTargetEndSec,
  getRenderedHistoryEndSec,
  getVisibleForecastCoverageEndSec,
  pauseForecastReveal,
  resetForecastReveal,
  resolveForecastRevealPlayheadFollowSec,
  resolveForecastRevealPreviewTarget,
  restartForecastRevealFrom,
  setForecastRevealConfig,
  suspendForecastRevealPlayheadFollow,
  syncForecastRevealTarget,
} from '../src/views/timegraphs/forecast-reveal-state.js';
import {
  clampScrubSecToRevealCap,
  createScrubSession,
  pointerLocalXToSec,
  resetForecastPreviewState,
  resolveLatchedForecastPreviewRestore,
  setLatchedForecastScrub,
  syncLatchedForecastPreview,
} from '../src/views/timegraphs/scrub-session.js';
import {
  applyRunScaleHighWaterRanges,
  createScaleHighWaterState,
  syncScaleHighWaterTimeline,
} from '../src/views/timegraphs/scale-high-water.js';
import {
  buildPlotSnapshotKey,
  createPlotSnapshotCache,
  invalidatePlotSnapshot,
  isPlotSnapshotCacheHit,
  isPreviousPlotSnapshotCompatible,
  quantizePlotSnapshotMaxSec,
  quantizePlotSnapshotMinSec,
  resolvePlotSnapshotStablePrefixEndSec,
  resolvePlotSnapshotTargetMaxSec,
  storePlotSnapshot,
} from '../src/views/timegraphs/plot-snapshot-cache.js';
import {
  beginBootFadeTransition,
  clearBootFadeTransition,
  createBootFadeState,
  getBootFadeRenderState,
} from '../src/views/timegraphs/boot-fade-state.js';
import {
  animateBoundToward,
  clearAnimatedTimeBounds,
  createTimeBoundsState,
  resetAnimatedTimeBounds,
  setTimeBounds,
} from '../src/views/timegraphs/time-bounds-state.js';
import {
  activateProjectionReplacementTransition,
  buildProjectionReplacementRenderState,
  clearProjectionReplacementTransition,
  createProjectionReplacementState,
  getProjectionReplacementDebugState,
  getProjectionReplacementMaxFloorSec,
  getProjectionReplacementRenderKey,
  getProjectionReplacementScaleRanges,
  stageProjectionReplacementTransition,
} from '../src/views/timegraphs/projection-replacement-state.js';
import {
  GRAPH_BOOT_FADE_FRAME_MS,
  TIME_BOUNDS_ANIMATION_MAX_RATE_SEC_PER_SEC,
  TIME_BOUNDS_ANIMATION_MIN_RATE_SEC_PER_SEC,
  TIME_BOUNDS_ANIMATION_TARGET_DURATION_SEC,
  PROJECTION_REPLACEMENT_ANIMATION_FRAME_MS,
  PROJECTION_REPLACEMENT_DIM_ALPHA,
  PROJECTION_REPLACEMENT_DIM_LINE_ALPHA,
  PROJECTION_REPLACEMENT_FLASH_ALPHA,
  PROJECTION_REPLACEMENT_FLASH_LINE_ALPHA,
  SERIES_SCALE_MAX_FLASH_DURATION_MS,
  TIMEGRAPH_THEME,
} from '../src/views/timegraphs/constants.js';
import {
  createActionSecondsCache,
  getActionSecs,
  getMarkerActionSecs,
} from '../src/views/timegraphs/action-seconds-cache.js';
import {
  clearSeriesScaleMaxFlash,
  createSeriesScaleMaxFlashState,
  triggerSeriesScaleMaxFlash,
} from '../src/views/timegraphs/scale-max-flash-state.js';
import { lerpNumber } from '../src/views/timegraphs-helpers.js';
import { layoutTimegraphKey, getTimegraphLayout, TIMEGRAPH_CHROME } from '../src/views/timegraph-scroll-pixi.js';
import { detailedSettlementPracticeDefs, settlementStructureDefs } from '../src/defs/gamepieces/detailed-settlement-defs.js';
import {
  loopPhase, sampleSpriteFrame, sampleEventProgress, sampleMote,
  resolveVisualTime, sampleChronicleScore, audioOffsetAtTime, layoutChronicleNodes,
} from '../src/views/timeline-presentation.js';

const firstPortrait = { face: 'first' };
const secondPortrait = { face: 'second' };
const viewedLife = (tSec, currentVassalId, regionId = 'a') => ({
  tSec,
  world: { sites: [{ regionId: 'a', detailedState: {} }] },
  civilization: { vassalLineage: { currentVassalId, vassalsById: {
    first: { vassalId: 'first', locationRegionId: regionId, portrait: firstPortrait },
    second: { vassalId: 'second', locationRegionId: 'b', portrait: secondPortrait },
  } } },
});
const portraitSnapshots = [viewedLife(0, null), viewedLife(10, 'first'),
  viewedLife(20, 'first', 'b'), viewedLife(30, null), viewedLife(40, 'second')];
const untouchedSnapshots = JSON.stringify(portraitSnapshots);
for (const index of [0, 1, 2, 3, 4, 3, 2, 1, 0, 4, 1]) {
  const portrait = getNavigationVassalPortrait(portraitSnapshots[index]);
  assert.equal(portrait?.vassalId ?? null, [null, 'first', 'first', null, 'second'][index],
    'Scrubbing both directions follows the active life, including gaps between Vassals');
  if (portrait) {
    assert.equal(portrait.traits, index === 4 ? secondPortrait : firstPortrait);
    assert.equal(portrait.regionId, index === 1 ? 'a' : 'b');
    assert.equal(portrait.hasSettlement, index === 1,
      'Portrait shortcuts follow the viewed location and settlement availability');
  }
}
assert.equal(JSON.stringify(portraitSnapshots), untouchedSnapshots, 'Portrait selection never mutates snapshots');

const clip={frameCount:8,framesPerSecond:12,startSec:3};
const graphLayout = getTimegraphLayout();
for (const count of [0, 3, 5, 8, 9, 17, 24]) {
  const firstPage = layoutTimegraphKey(count);
  const covered = [];
  for (let page = 0; page < firstPage.pageCount; page++) {
    const key = layoutTimegraphKey(count, page);
    assert.deepEqual({ x: key.x, y: key.y, width: key.width, height: key.height }, graphLayout.key,
      'The key housing is fixed for every selection and page');
    assert.ok(key.points.length <= 8, 'Overflow never adds sockets or shrinks the graph');
    key.points.forEach((point, index) => {
      covered.push(key.startIndex + index);
      assert.ok(point.x >= key.x && point.x + TIMEGRAPH_CHROME.iconSize <= key.x + key.width);
      assert.ok(point.y >= key.y && point.y + TIMEGRAPH_CHROME.iconSize <= key.y + key.height);
    });
    assert.deepEqual(getTimegraphLayout().plot, graphLayout.plot);
  }
  assert.deepEqual(covered, Array.from({ length: count }, (_, index) => index), 'Every selected series appears exactly once across key pages');
  assert.equal(layoutTimegraphKey(count, -1).page, 0);
  assert.equal(layoutTimegraphKey(count, 100).page, firstPage.pageCount - 1);
}
assert.equal(layoutTimegraphKey(8).pageCount, 1);
assert.equal(layoutTimegraphKey(9).pageCount, 2);
const civSeries = GRAPH_METRICS.civilization.getSeries(null, null);
const localSeries = GRAPH_METRICS.settlement.getSeries(null, null);
assert.deepEqual(getGraphGroupSeriesIds('chaos', 'civilization', civSeries), ['monsterCount', 'chaosResistance', 'chaosRawPressure']);
assert.deepEqual(getGraphGroupSeriesIds('resources', 'civilization', civSeries), ['food', 'gold', 'totalPopulation']);
assert.deepEqual(getGraphGroupSeriesIds('resources', 'settlement', localSeries), ['food', 'gold', 'totalPopulation', 'housingCapacity']);
assert.deepEqual(getGraphGroupSeriesIds('population', 'settlement', localSeries),
  ['civilizationHousingCapacity', 'totalPopulation', 'population:villager', 'population:stranger', 'housingCapacity']);
const resources = getGraphGroupSeriesIds('resources', 'settlement', localSeries);
const combined = toggleGraphGroup('population', resources, 'settlement', localSeries);
assert.deepEqual(getActiveGraphGroups(combined, 'settlement', localSeries), ['resources', 'population']);
assert.deepEqual(toggleGraphGroup('population', combined, 'settlement', localSeries), resources,
  'Removing Population retains the population and housing shared with Resources');
assert.deepEqual(toggleGraphGroup('resources', resources, 'settlement', localSeries), []);
const monsterSeries = civSeries.filter((series) => series.id === 'monsterCount');
for (const values of [[0, 0], [12, 27], [100, 150]]) {
  const scale = computeGraphSeriesScaleRanges(monsterSeries, new Map([['monsterCount', values]])).get('monsterCount');
  assert.equal(scale.minValue, 0);
  assert.equal(scale.maxValue, 100, 'Monster scale is stable before and after the endgame threshold');
}
const artKeys=new Set();
for(const id of [...Object.keys(detailedSettlementPracticeDefs),...Object.keys(settlementStructureDefs)]){
  const art=getIllustrationSpec(id);
  assert.ok(art,`${id} needs an explicit gamepiece illustration`);
  const key=`${art.file}:${art.index}`;
  assert.ok(!artKeys.has(key),`${id} must be distinguishable from other gamepieces by its illustration`);
  artKeys.add(key);
}
const rect={x:0,y:0,width:1400,height:600};
const times=[0,.01,3,3.125,8.25,100.75,1e6+.5];
const frames=times.map(t=>({frame:sampleSpriteFrame(t,clip),motes:Array.from({length:16},(_,i)=>sampleMote(t,i,rect)),sound:sampleChronicleScore(t)}));
for(const index of [6,2,0,4,3,1,5,2,6,0]) {
  const t=times[index];
  assert.deepEqual({frame:sampleSpriteFrame(t,clip),motes:Array.from({length:16},(_,i)=>sampleMote(t,i,rect)),sound:sampleChronicleScore(t)},frames[index],
    'Non-sequential and reverse seeks must reproduce the identical picture and audio sample');
}
assert.equal(resolveVisualTime(12,12.75),12.75);
assert.equal(resolveVisualTime(12,13.1),12,'Unavailable simulation snapshots cannot be visually extrapolated');
assert.equal(resolveVisualTime(12,NaN),12);
assert.equal(sampleEventProgress(4,5,2),null);
assert.equal(sampleEventProgress(6,5,2),.5);
assert.equal(sampleEventProgress(8,5,2),null);
assert.equal(sampleEventProgress(Infinity,5,2),null);
assert.equal(sampleSpriteFrame(NaN,clip),0);
assert.equal(loopPhase(123,0),0);
// An asymmetric bell decay must become a swell on rewind. The actual backward
// buffer reads forward PCM at duration-offset, independent of browser support.
for(const t of [0,.13,2.9,5.73,23.9,24,100.13]) {
  const offset=audioOffsetAtTime(t,true);
  assert.ok(Math.abs(sampleChronicleScore(t)-sampleChronicleScore(24-offset))<1e-9);
}
for(let i=0;i<24000;i++)assert.ok(Math.abs(sampleChronicleScore(i/1000))<=.15,'The original score remains quiet and cannot clip');
const nodes=Array.from({length:6},(_,i)=>({id:`n${i}`,depth:1,position:{x:0,y:.2+i*.01}}));
const original=JSON.stringify(nodes);
const positions=layoutChronicleNodes(nodes,{x:0,y:0,width:1000,height:400});
for(let i=1;i<6;i++)assert.ok(positions.get(`n${i}`).y-positions.get(`n${i-1}`).y>=79.9);
assert.equal(JSON.stringify(nodes),original,'Presentation layout cannot modify serialized graph coordinates');
const sparseNodes = [
  {id:'a',depth:1,position:{x:.1,y:.3}},
  {id:'b',depth:1,position:{x:.1,y:.55}},
  {id:'c',depth:2,position:{x:.2,y:.7}},
];
const sparseLayout = layoutChronicleNodes(sparseNodes,{x:0,y:0,width:2000,height:500});
assert.equal(sparseLayout.get('a').y,150,'Sparse columns preserve generated lane positions');
assert.equal(sparseLayout.get('b').y,275);
assert.equal(sparseLayout.get('c').y,350,'Single nodes are not forced to the centre');
assert.deepEqual(layoutChronicleNodes([...sparseNodes].reverse(),{x:0,y:0,width:2000,height:500}),sparseLayout,
  'Layout is stable regardless of iteration order');

const reveal = createForecastRevealState({
  targetDurationSec: 0.6,
  minRateSecPerSec: 480,
  startDelayMs: 0,
  followGapSec: 0,
});
reveal.startSecOverride = 40;
assert.equal(getDisplayHistoryEndSec(reveal, 40), 40, 'matching reveal start override is used as display history');
assert.equal(reveal.startSecOverride, 40);
assert.equal(getDisplayHistoryEndSec(reveal, 100), 100, 'a mismatched override is discarded');
assert.equal(reveal.startSecOverride, null);
reveal.historyEndSec = 100;
reveal.visibleEndSec = 180.9;
assert.equal(getVisibleForecastCoverageEndSec(reveal, 250, 100), 180,
  'visible coverage is the floored playhead, capped by actual forecast');
reveal.historyEndSec = 90;
assert.equal(getVisibleForecastCoverageEndSec(reveal, 250, 100), 100,
  'stale reveal history does not leak coverage past display history');
assert.equal(getForecastRevealFollowTargetEndSec(reveal, 700, 100, 100), 700,
  'zero follow gap keeps the follow target at the actual forecast end');
const followReveal = createForecastRevealState({ followGapSec: 60, followResponseSec: 0.9 });
assert.equal(getForecastRevealFollowTargetEndSec(followReveal, 700, 100, 100), 640);
assert.equal(
  getForecastRevealDesiredVelocitySecPerSec(reveal, 700, 100, 100).desiredVelocitySecPerSec,
  1000,
  'ungapped reveal rate is remaining span over the target duration'
);
assert.equal(
  getForecastRevealDesiredVelocitySecPerSec(followReveal, 700, 100, 100).desiredVelocitySecPerSec,
  600
);
followReveal.capEndSec = 400;
assert.equal(getForecastRevealFollowTargetEndSec(followReveal, 700, 100, 100), 700,
  'an explicit reveal cap disables the follow gap');
followReveal.capEndSec = null;
resetForecastReveal(reveal, 100, 700, 100, 0);
assert.equal(reveal.velocitySecPerSec, 1000);
assert.equal(getAnimatedForecastCoverageEndSec(reveal, 100, 100), 200,
  'one tenth of a second at 1000 sec/sec reveals 100 forecast seconds');
pauseForecastReveal(reveal);
assert.equal(getAnimatedForecastCoverageEndSec(reveal, 250, 100), 200, 'pause freezes coverage');
const delayed = createForecastRevealState({ startDelayMs: 200, followGapSec: 0, minRateSecPerSec: 480 });
resetForecastReveal(delayed, 695, 700, 100, 0);
assert.equal(getForecastRevealEffectiveStartDelayMs(delayed, 700, 695, 100), 200);
assert.equal(getAnimatedForecastCoverageEndSec(delayed, 100, 100), 695,
  'start delay holds the playhead until the delay elapses');
followReveal.startDelayMs = 200;
assert.equal(getForecastRevealEffectiveStartDelayMs(followReveal, 700, 100, 100), 0,
  'a large remaining follow gap skips the configured start delay');
const restartReveal = createForecastRevealState({ followGapSec: 0, minRateSecPerSec: 480 });
restartForecastRevealFrom(restartReveal, 80, { extraStartDelayMs: 50 }, {
  actualHistoryEndSec: 100,
  actualForecastCoverageEndSec: 400,
  nowMs: 1000,
  activeForecastPreviewSec: 120,
});
assert.equal(restartReveal.startSecOverride, 80);
assert.equal(restartReveal.animatedEndSec, 100);
assert.equal(restartReveal.targetEndSec, 400);
assert.equal(restartReveal.previewSec, 120);
assert.equal(restartReveal.delayUntilMs, 1050);
assert.equal(getRenderedHistoryEndSec(restartReveal, 100, 400, null, { treatRevealedForecastAsHistory: false }), 100);
restartReveal.historyEndSec = 100;
restartReveal.visibleEndSec = 180;
assert.equal(getRenderedHistoryEndSec(restartReveal, 100, 400, null, { treatRevealedForecastAsHistory: true }), 180);
syncForecastRevealTarget(restartReveal, 50, 40, 2000);
assert.equal(restartReveal.targetEndSec, 50, 'a shorter actual coverage resets the reveal');
setForecastRevealConfig(restartReveal, { targetDurationSec: 1.2 });
assert.equal(restartReveal.targetDurationSec, 1.2);
setForecastRevealConfig(restartReveal, {});
assert.equal(restartReveal.targetDurationSec, 0.6, 'omitted config fields restore constructor defaults');
assert.equal(
  resolveForecastRevealPlayheadFollowSec(restartReveal, {
    visibleForecastCoverageEndSec: 180.9,
    minSec: 0,
    maxSec: 320,
  }),
  180
);
suspendForecastRevealPlayheadFollow(restartReveal);
assert.equal(resolveForecastRevealPlayheadFollowSec(restartReveal, {
  visibleForecastCoverageEndSec: 180,
}), null);
restartReveal.playheadFollowEnabled = true;
restartReveal.previewSec = 150;
assert.equal(
  resolveForecastRevealPreviewTarget(restartReveal, 180, 200, { historyEndSec: 100 }),
  180
);
assert.equal(
  resolveForecastRevealPreviewTarget(restartReveal, 180, 200, { historyEndSec: 100, isScrubbing: true }),
  null
);
assert.equal(pointerLocalXToSec(60, { x: 10, w: 100 }, 0, 100), 50);
assert.equal(clampScrubSecToRevealCap(500, 100, 200, { minSec: 0, maxSec: 1000 }), 200);
assert.equal(clampScrubSecToRevealCap(50, 100, 200, { minSec: 0, maxSec: 1000 }), 50);
const scrub = createScrubSession({ forecastPreviewStatusNote: 'Viewing forecast' });
setLatchedForecastScrub(scrub, 180.9);
assert.equal(scrub.latchedForecastScrubSec, 180);
assert.equal(resolveLatchedForecastPreviewRestore(scrub, 100, 200), 'restore');
assert.equal(resolveLatchedForecastPreviewRestore(scrub, 180, 200), 'clear');
syncLatchedForecastPreview(scrub, restartReveal, {
  active: true,
  isForecastPreview: true,
  previewSec: 150,
}, (sec) => sec);
assert.equal(scrub.latchedForecastScrubSec, null, 'automatic reveal preview does not latch');
resetForecastPreviewState(scrub, restartReveal);
assert.equal(scrub.isScrubbing, false);
assert.equal(restartReveal.previewSec, null);

{
  const highWater = createScaleHighWaterState();
  const timelineA = { id: 'run-a' };
  const timelineB = { id: 'run-b' };
  const series = [{ id: 'food' }];
  syncScaleHighWaterTimeline(highWater, timelineA);
  const first = applyRunScaleHighWaterRanges(
    highWater,
    new Map([['food', { maxValue: 10, groupId: 'resources' }]]),
    series,
    'civilization'
  );
  assert.equal(first.get('food').maxValue, 10);
  const receded = applyRunScaleHighWaterRanges(
    highWater,
    new Map([['food', { maxValue: 7, groupId: 'resources' }]]),
    series,
    'civilization'
  );
  assert.equal(receded.get('food').maxValue, 10, 'run-scoped high-water never recedes');
  syncScaleHighWaterTimeline(highWater, timelineA);
  const sameTimeline = applyRunScaleHighWaterRanges(
    highWater,
    new Map([['food', { maxValue: 4, groupId: 'resources' }]]),
    series,
    'civilization'
  );
  assert.equal(sameTimeline.get('food').maxValue, 10, 'same timeline identity keeps high-water');
  const otherSubject = applyRunScaleHighWaterRanges(
    highWater,
    new Map([['food', { maxValue: 3, groupId: 'resources' }]]),
    series,
    'settlement:region-1'
  );
  assert.equal(otherSubject.get('food').maxValue, 3, 'subject keys isolate high-water groups');
  const fixed = applyRunScaleHighWaterRanges(
    highWater,
    new Map([['gold', { maxValue: 8, scaleMode: 'fixed' }]]),
    [{ id: 'gold' }],
    'civilization'
  );
  assert.equal(fixed.get('gold').maxValue, 8, 'fixed series are not raised to high-water');
  syncScaleHighWaterTimeline(highWater, timelineB);
  const reset = applyRunScaleHighWaterRanges(
    highWater,
    new Map([['food', { maxValue: 4, groupId: 'resources' }]]),
    series,
    'civilization'
  );
  assert.equal(reset.get('food').maxValue, 4, 'a new timeline identity resets high-water');
}

{
  const cache = createPlotSnapshotCache();
  assert.equal(isPlotSnapshotCacheHit(cache, 'k'), false);
  assert.equal(quantizePlotSnapshotMinSec(20, 32), 0);
  assert.equal(quantizePlotSnapshotMaxSec(0, 33, 32), 64);
  assert.equal(
    buildPlotSnapshotKey({
      cacheVersion: 3,
      snapshotMinSec: 0,
      snapshotMaxSec: 64,
      displayHistoryEndSec: 10,
      zoomed: false,
      sampleCursorSec: null,
    }),
    '3|0:64|10|0|stable'
  );
  storePlotSnapshot(cache, '3|0:64|10|0|stable', {
    data: { cacheVersion: 3 },
    snapshotMinSec: 0,
    displayHistoryEndSec: 10,
    zoomed: false,
    sampleCursorSec: null,
    visibleForecastCoverageEndSec: 18.9,
  });
  assert.equal(isPlotSnapshotCacheHit(cache, '3|0:64|10|0|stable'), true);
  assert.equal(resolvePlotSnapshotStablePrefixEndSec(cache.snapshot, 40, 10), 18);
  assert.equal(
    isPreviousPlotSnapshotCompatible(cache.snapshot, {
      freezeRevealedPlotPrefix: true,
      cacheVersion: 3,
      snapshotMinSec: 0,
      displayHistoryEndSec: 10,
      zoomed: false,
      sampleCursorSec: null,
    }),
    true
  );
  assert.equal(
    isPreviousPlotSnapshotCompatible(cache.snapshot, {
      freezeRevealedPlotPrefix: false,
      cacheVersion: 3,
      snapshotMinSec: 0,
      displayHistoryEndSec: 10,
      zoomed: false,
      sampleCursorSec: null,
    }),
    false
  );
  invalidatePlotSnapshot(cache);
  assert.equal(cache.snapshot, null);
  assert.equal(cache.key, '');
  assert.equal(resolvePlotSnapshotTargetMaxSec(cache, 50, 0, 0), 50);
  assert.equal(resolvePlotSnapshotTargetMaxSec(cache, 50, 0, 16), 66);
  assert.equal(
    resolvePlotSnapshotTargetMaxSec(cache, 52, 0, 16),
    66,
    'lead hysteresis keeps the previous target'
  );
  assert.equal(
    resolvePlotSnapshotTargetMaxSec(cache, 80, 0, 16),
    96,
    'a target past the stored high-water resets'
  );
}

{
  const none = createBootFadeState({ durationMs: 0, color: 0xffffff });
  beginBootFadeTransition(none, 0);
  assert.equal(none.transition, null, 'zero-duration boot fade never starts');
  assert.equal(getBootFadeRenderState(none, 0), null);
  const fade = createBootFadeState({ durationMs: 1000, color: 0x123456 });
  beginBootFadeTransition(fade, 0);
  const start = getBootFadeRenderState(fade, 0);
  assert.equal(start.color, 0x123456);
  assert.equal(start.alpha, 1);
  assert.equal(start.key, 0);
  const mid = getBootFadeRenderState(fade, 500);
  assert.equal(mid.alpha, 0.5);
  assert.equal(mid.key, Math.floor(500 / GRAPH_BOOT_FADE_FRAME_MS));
  assert.equal(getBootFadeRenderState(fade, 1000), null, 'completed fade clears itself');
  assert.equal(fade.transition, null);
  beginBootFadeTransition(fade, 10);
  clearBootFadeTransition(fade);
  assert.equal(getBootFadeRenderState(fade, 20), null);
}

{
  const boundStep = (delta, elapsedMs) => Math.max(
    1,
    Math.floor(
      Math.max(
        TIME_BOUNDS_ANIMATION_MIN_RATE_SEC_PER_SEC,
        Math.min(
          TIME_BOUNDS_ANIMATION_MAX_RATE_SEC_PER_SEC,
          Math.abs(delta) / Math.max(0.05, TIME_BOUNDS_ANIMATION_TARGET_DURATION_SEC)
        )
      ) * (Math.max(0, elapsedMs) / 1000)
    )
  );
  const bounds = createTimeBoundsState();
  assert.equal(bounds.minSec, 0);
  assert.equal(bounds.maxSec, 0);
  assert.equal(bounds.animatedMinSec, null);
  resetAnimatedTimeBounds(bounds, -4.7, 12.9, 10);
  assert.equal(bounds.minSec, 0);
  assert.equal(bounds.maxSec, 12);
  assert.equal(bounds.animatedMinSec, 0);
  assert.equal(bounds.animatedMaxSec, 12);
  assert.equal(bounds.animatedBoundsLastTickMs, 10);
  setTimeBounds(bounds, 8, 3, { animate: false, nowMs: 20 });
  assert.equal(bounds.minSec, 8);
  assert.equal(bounds.maxSec, 9, 'max never falls below min + 1');
  clearAnimatedTimeBounds(bounds);
  assert.equal(bounds.animatedMinSec, null);
  assert.equal(bounds.animatedMaxSec, null);
  assert.equal(bounds.animatedBoundsLastTickMs, 0);
  assert.equal(bounds.minSec, 8, 'clear leaves displayed bounds in place');
  setTimeBounds(bounds, 0, 100, { animate: true, nowMs: 30 });
  assert.equal(bounds.minSec, 0, 'null animated bounds snap even when animate is requested');
  assert.equal(bounds.maxSec, 100);
  setTimeBounds(bounds, 0, 10000, { animate: true, nowMs: 46 });
  assert.equal(bounds.maxSec, 100 + boundStep(9900, 16));
  assert.equal(animateBoundToward(100, 100, 16), 100);
  assert.equal(animateBoundToward(Number.NaN, 50.9, 16), 50);
  assert.equal(animateBoundToward(1000, 0, 16), 1000 - boundStep(1000, 16));
  assert.equal(animateBoundToward(5, 8, 0), 6, 'zero elapsed still moves one second');
  setTimeBounds(bounds, 500, 10000, { animate: true, nowMs: 62 });
  assert.equal(bounds.minSec, 500, 'a later min snaps forward instead of waiting on the lerp');
}

{
  const replacement = createProjectionReplacementState();
  const ranges = new Map([['food', { maxValue: 12 }]]);
  const snapshot = {
    pointsForDraw: [{ tSec: 0 }, { tSec: 10 }],
    displayHistoryEndSec: 40,
    historyEndSec: 30,
    seriesScaleRanges: ranges,
  };
  assert.equal(
    stageProjectionReplacementTransition(replacement, { snapshot: { pointsForDraw: [] } }),
    false
  );
  assert.equal(replacement.staged, null);
  assert.equal(
    stageProjectionReplacementTransition(replacement, { snapshot, fallbackMaxSec: 80 }),
    true
  );
  assert.equal(replacement.staged.truncationStartSec, 40);
  assert.equal(replacement.staged.maxSecFloor, 80);
  assert.equal(
    stageProjectionReplacementTransition(replacement, {
      snapshot,
      truncationStartSec: 25.9,
      maxSecFloor: 100.2,
      transitionDurationMs: 1000,
      flashDurationMs: 200,
      fadeStrength: 1,
    }),
    true
  );
  assert.equal(replacement.staged.truncationStartSec, 25);
  assert.equal(replacement.staged.maxSecFloor, 100);
  activateProjectionReplacementTransition(replacement, 0, {
    activateProjectionReplacementTransition: true,
  });
  assert.equal(replacement.staged, null);
  assert.equal(replacement.active.startedMs, 0);
  assert.equal(getProjectionReplacementMaxFloorSec(replacement), 100);
  assert.equal(getProjectionReplacementScaleRanges(replacement), ranges);
  assert.deepEqual(getProjectionReplacementDebugState(replacement), {
    active: true,
    truncationStartSec: 25,
    maxSecFloor: 100,
    hasSnapshot: true,
  });
  assert.equal(getProjectionReplacementRenderKey(replacement, 0), '25:100:0');
  assert.equal(
    getProjectionReplacementRenderKey(replacement, PROJECTION_REPLACEMENT_ANIMATION_FRAME_MS),
    '25:100:1'
  );
  const flash = buildProjectionReplacementRenderState(replacement, 0, 50);
  assert.equal(flash.settled, false);
  assert.equal(flash.transitionAnimating, true);
  assert.equal(flash.drawStartSec, 50);
  assert.equal(flash.drawEndSec, 100);
  assert.equal(flash.unchangedStartSec, 50);
  assert.equal(flash.unchangedEndSec, 25);
  assert.equal(flash.zoneAlpha, PROJECTION_REPLACEMENT_FLASH_ALPHA);
  assert.equal(flash.lineAlpha, PROJECTION_REPLACEMENT_FLASH_LINE_ALPHA);
  assert.equal(flash.tintStrength, 0.74);
  assert.equal(flash.tintColor, TIMEGRAPH_THEME.eventMarkerCritical);
  const settled = buildProjectionReplacementRenderState(replacement, 1000, 50);
  assert.equal(settled.settled, true);
  assert.equal(settled.transitionAnimating, false);
  assert.equal(settled.zoneAlpha, PROJECTION_REPLACEMENT_DIM_ALPHA);
  assert.equal(settled.lineAlpha, PROJECTION_REPLACEMENT_DIM_LINE_ALPHA);
  assert.equal(settled.tintStrength, 0.88);
  assert.equal(settled.tintColor, TIMEGRAPH_THEME.panelBorder);
  assert.equal(getProjectionReplacementRenderKey(replacement, 1000), '');
  assert.equal(
    buildProjectionReplacementRenderState(replacement, 1000, 100),
    null,
    'coverage past the replacement floor clears the overlay'
  );
  assert.equal(replacement.active, null);
  stageProjectionReplacementTransition(replacement, {
    snapshot,
    truncationStartSec: 10,
    maxSecFloor: 40,
    fadeStrength: 0.5,
  });
  activateProjectionReplacementTransition(replacement, 5, {});
  assert.equal(replacement.staged, null, 'restart without activate drops the staged overlay');
  assert.equal(replacement.active, null);
  stageProjectionReplacementTransition(replacement, {
    snapshot,
    truncationStartSec: 10,
    maxSecFloor: 40,
    transitionDurationMs: 0,
    fadeStrength: 0.5,
  });
  activateProjectionReplacementTransition(replacement, 0, {
    activateProjectionReplacementTransition: true,
  });
  const dimmed = buildProjectionReplacementRenderState(replacement, 0, 10);
  assert.equal(dimmed.settled, true);
  assert.equal(dimmed.zoneAlpha, lerpNumber(0, PROJECTION_REPLACEMENT_DIM_ALPHA, 0.5));
  assert.equal(dimmed.lineAlpha, lerpNumber(1, PROJECTION_REPLACEMENT_DIM_LINE_ALPHA, 0.5));
  activateProjectionReplacementTransition(replacement, 0, {
    clearProjectionReplacementTransition: true,
  });
  assert.equal(replacement.active, null);
  clearProjectionReplacementTransition(replacement);
  assert.equal(replacement.staged, null);
}

{
  const cache = createActionSecondsCache();
  const timeline = { _actionSecondsVersion: 1 };
  const first = getActionSecs(cache, timeline, 0, 10);
  const again = getActionSecs(cache, timeline, 0, 10);
  assert.equal(again, first, 'same version and range reuses the cached action seconds');
  const otherRange = getActionSecs(cache, timeline, 0, 20);
  assert.notEqual(otherRange, first, 'a range change replaces the action-second cache');
  const nextVersion = getActionSecs(cache, { _actionSecondsVersion: 2 }, 0, 20);
  assert.notEqual(nextVersion, otherRange, 'an action-seconds version change replaces the cache');
  const markers = getMarkerActionSecs(cache, timeline, 0, 10, 64);
  const markersAgain = getMarkerActionSecs(cache, timeline, 0, 10, 64);
  assert.equal(markersAgain, markers, 'same marker range and cap reuse the sampled cache');
  const widerCap = getMarkerActionSecs(cache, timeline, 0, 10, 128);
  assert.notEqual(widerCap, markers, 'a marker cap change replaces the sampled cache');
}

{
  const flash = createSeriesScaleMaxFlashState();
  assert.equal(triggerSeriesScaleMaxFlash(flash, {}), false);
  const previousRanges = new Map([['food', { maxValue: 10 }], ['gold', { maxValue: 4 }]]);
  const nextRanges = new Map([['food', { maxValue: 12 }], ['gold', { maxValue: 4 }]]);
  const visibleMaxValues = new Map([['food', 12], ['gold', 4]]);
  assert.equal(
    triggerSeriesScaleMaxFlash(flash, {
      previousRanges,
      nextRanges,
      visibleMaxValues,
      nowMs: 100,
    }),
    true
  );
  assert.equal(flash.bySeriesId.get('food').startedMs, 100);
  assert.equal(flash.bySeriesId.get('food').durationMs, SERIES_SCALE_MAX_FLASH_DURATION_MS);
  assert.equal(flash.bySeriesId.has('gold'), false, 'unchanged series do not flash');
  assert.equal(
    triggerSeriesScaleMaxFlash(flash, {
      previousRanges,
      nextRanges: new Map([['food', { maxValue: 10 }]]),
      visibleMaxValues,
      nowMs: 200,
    }),
    false,
    'a receding max does not flash'
  );
  assert.equal(
    triggerSeriesScaleMaxFlash(flash, {
      previousRanges,
      nextRanges,
      visibleMaxValues: new Map([['food', 11]]),
      nowMs: 200,
    }),
    false,
    'a max the visible window has not reached does not flash'
  );
  clearSeriesScaleMaxFlash(flash);
  assert.equal(flash.bySeriesId.size, 0);
}

assert.equal(getSettlementGraphMetric('settlement'), GRAPH_METRICS.settlement);
assert.equal(getSettlementGraphMetric('civilization'), GRAPH_METRICS.civilization);
assert.equal(getSettlementGraphRevealConfig('pendingCommit'), SETTLEMENT_GRAPH_REVEAL_PENDING_COMMIT);
assert.equal(getSettlementGraphRevealConfig('default'), SETTLEMENT_GRAPH_REVEAL_DEFAULT);
assert.equal(resolveEffectiveSettlementGraphHorizonSec(null), SETTLEMENT_GRAPH_WINDOW_SEC);
assert.equal(resolveEffectiveSettlementGraphHorizonSec(2048), 2048);

{
  const calls = [];
  const graphController = {
    getData: () => ({ subjectKey: 'civilization' }),
    setMetric: (metric) => calls.push(['setMetric', metric]),
    setSubject: (subject, key) => calls.push(['setSubject', subject, key]),
    setHorizonSecOverride: (sec) => calls.push(['setHorizon', sec]),
    ensureCache: () => calls.push(['ensureCache']),
    refreshAuthoritativeRangeFrom: (sec) => calls.push(['refreshFrom', sec]),
  };
  const graphView = {
    clearProjectionReplacementTransition: () => calls.push(['clearTransition']),
    resetDataContext: () => calls.push(['resetDataContext']),
    render: () => calls.push(['render']),
    setForecastRevealConfig: (config) => calls.push(['setRevealConfig', config]),
    restartForecastRevealFrom: (sec, opts) => calls.push(['restartReveal', sec, opts]),
    clearForecastRevealRestart: () => calls.push(['clearRevealRestart']),
  };
  const seriesMenu = {
    setContext: (scope) => calls.push(['setContext', scope]),
    selectDefaultGroup: () => calls.push(['selectDefaultGroup']),
    syncSelection: () => calls.push(['syncSelection']),
  };
  let worldMode = 'map';
  let frontierState = {
    civilization: {
      vassalLineage: {
        currentVassalId: 'v1',
        vassalsById: {
          v1: { endedReason: 'died' },
        },
      },
    },
  };
  const forecastController = {
    getRevealMode: () => (frontierState.civilization.vassalLineage.currentVassalId ? 'pendingCommit' : 'default'),
    syncHorizon: () => calls.push(['syncHorizon']),
    processPendingCommit: ({ clearForecastRevealRestart }) => {
      calls.push(['processPendingCommit']);
      clearForecastRevealRestart?.();
      frontierState = {
        civilization: {
          vassalLineage: {
            currentVassalId: null,
            vassalsById: { v1: { endedReason: 'died' } },
          },
        },
      };
    },
  };
  const session = createSettlementGraphSession({
    getGraphController: () => graphController,
    getGraphView: () => graphView,
    getForecastController: () => forecastController,
    getSeriesMenu: () => seriesMenu,
    getSelectedWorldRegionId: () => 'river-crown',
    getFrontierState: () => frontierState,
    getFrontierSec: () => 320,
    setWorldViewMode: (mode) => {
      worldMode = mode;
      calls.push(['setWorldViewMode', mode]);
    },
  });
  assert.equal(session.getSettlementGraphScope(), 'civilization');
  assert.equal(session.getSettlementGraphMetric(), GRAPH_METRICS.civilization);
  session.setSettlementGraphContext('settlement', 'river-crown');
  assert.equal(session.getSettlementGraphScope(), 'settlement');
  assert.equal(session.getSettlementGraphMetric(), GRAPH_METRICS.settlement);
  assert.deepEqual(calls.slice(0, 7), [
    ['clearTransition'],
    ['setMetric', GRAPH_METRICS.settlement],
    ['setSubject', { regionId: 'river-crown' }, 'river-crown'],
    ['setContext', 'settlement'],
    ['selectDefaultGroup'],
    ['syncSelection'],
    ['ensureCache'],
  ]);
  session.setSettlementGraphHorizonOverride(4096);
  assert.equal(session.getEffectiveSettlementGraphHorizonSec(), 4096);
  session.syncSettlementGraphRevealConfig();
  assert.equal(calls.at(-1)?.[1], SETTLEMENT_GRAPH_REVEAL_PENDING_COMMIT);
  session.syncSettlementGraphRevealConfig();
  session.processSettlementPendingCommit();
  assert.equal(worldMode, 'map');
  assert.ok(calls.some((entry) => entry[0] === 'clearRevealRestart'));
  assert.ok(calls.some((entry) => entry[0] === 'restartReveal' && entry[1] === 320));
  const ended = session.revealCivilizationAfterVassalEnd('missing');
  assert.equal(ended, false);
}

console.log('[presentation-time] OK: unique gamepiece art, arbitrary seeks, reverse PCM, bounded score, topology layout, and timegraph reveal/scrub state');
