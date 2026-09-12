import assert from 'node:assert/strict';
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
