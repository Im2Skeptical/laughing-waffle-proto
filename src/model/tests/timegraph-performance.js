import assert from "node:assert/strict";
import { serialize as serializeWire } from "node:v8";
import { encodeForecastChunk, freezeForecastChunkConfigs } from "../timegraph/forecast-wire.js";
import { createInitialState } from "../init.js";
import { serializeGameState, deserializeGameState } from "../state.js";
import { canonicalizeSnapshot } from "../canonicalize.js";
import { advanceReplayStateOneSecond } from "../replay-second-runner.js";
import { GRAPH_METRICS } from "../graph-metrics.js";
import { buildProjectionSummaryFromState } from "../projection-summary.js";
import { buildProjectionChunkFromStateData, createProjectionChunkSession } from "../projection-chunk.js";
import { createProjectionStateRestorer } from "../timegraph/state-restorer.js";
import { createProjectionCache } from "../timegraph/projection-cache.js";
import { createTimeGraphController } from "../timegraph/controller-core.js";
import { createTimelineFromInitialState, appendActionAtCursor, rebuildStateAtSecond, getStateDataAtSecond } from "../timeline/index.js";
import { rememberMaxObservedCivilizationSurvivalYear, rememberDroppedItemKind } from "../persistent-memory.js";
import { createSettlementForecastController } from "../../controllers/settlement-forecast-controller.js";
import { ActionKinds } from "../actions.js";

function uncachedGraphValues(metric, state, subject) {
  return Object.fromEntries(metric.getSeries(subject, state).map(series =>
    [series.id, series.getValueFromSnapshot(state, subject, { kind: "unused-resolver" })]).filter(([, value]) => Number.isFinite(value)));
}
const initial = createInitialState("devPlaytesting01", 99117);
const knowledgeTimeline = createTimelineFromInitialState(initial);
const originalAnchor = serializeGameState(initial);
knowledgeTimeline.checkpoints.push({ checkpointSec: 0, stateData: originalAnchor });
const readBoundary = () => getStateDataAtSecond(knowledgeTimeline, 0).stateData;
assert.deepEqual(readBoundary(), originalAnchor);
rememberMaxObservedCivilizationSurvivalYear(knowledgeTimeline, 75);
rememberDroppedItemKind(knowledgeTimeline, { tableKey: 'probe', tileDefId: 'frontier', itemKind: 'ore' });
const expectedKnowledgeBoundary = deserializeGameState(originalAnchor);
rememberMaxObservedCivilizationSurvivalYear(expectedKnowledgeBoundary, 75);
rememberDroppedItemKind(expectedKnowledgeBoundary, { tableKey: 'probe', tileDefId: 'frontier', itemKind: 'ore' });
assert.deepEqual(readBoundary(), serializeGameState(expectedKnowledgeBoundary), 'knowledge overlays preserve the complete canonical snapshot');
const independentBoundary = deserializeGameState(readBoundary());
independentBoundary.world.sites[0].detailedState.practiceSlots.fill(null);
independentBoundary.persistentKnowledge.maxObservedCivilizationSurvivalYear = 999;
assert.deepEqual(readBoundary(), serializeGameState(expectedKnowledgeBoundary), 'mutable replay states cannot contaminate the cached wire boundary');
rememberMaxObservedCivilizationSurvivalYear(knowledgeTimeline, 90);
assert.equal(readBoundary().persistentKnowledge.maxObservedCivilizationSurvivalYear, 90, 'fresh knowledge is visible immediately');
assert.deepEqual(knowledgeTimeline.checkpoints[0].stateData, originalAnchor, 'overlays never rewrite the original checkpoint');
knowledgeTimeline.persistentKnowledge = structuredClone(originalAnchor.persistentKnowledge);
assert.deepEqual(readBoundary(), originalAnchor, 'a replacement knowledge set cannot inherit a cached observation');
const replacementAnchor = serializeGameState(initial);
replacementAnchor.world.sites[0].detailedState.practiceSlots.fill(null);
knowledgeTimeline.checkpoints[0].stateData = replacementAnchor;
assert.deepEqual(readBoundary().world, replacementAnchor.world, 'replacing an anchor invalidates its validation cache');
knowledgeTimeline.checkpoints[0].stateData = { ...originalAnchor, gameStateSchemaVersion: -1 };
assert.throws(readBoundary, 'new malformed anchors still pass through full deserialization');
initial.paused = false;
initial.gameConfig.settings.values.primordialBasePressure = 100;
// Pin this terminal-boundary scenario's production tuning. Higher authored
// worker yields can keep it alive past the 2100-second projection horizon.
for (const practice of Object.values(initial.gameConfig.gamepieces.practices)) practice.workerBonus = .25;
const state = deserializeGameState(serializeGameState(initial));
for (let sec = 0; sec <= 192; sec++) {
  if (sec) { advanceReplayStateOneSecond(state); canonicalizeSnapshot(state); }
  // Same mutable state across ticks catches accidentally persistent memoization.
  const before = serializeGameState(state);
  const summary = buildProjectionSummaryFromState(state);
  assert.deepEqual(summary.graphValues.civilization, uncachedGraphValues(GRAPH_METRICS.civilization, state, null));
  for (const site of state.world.sites) {
    assert.deepEqual(summary.graphValues.settlementByRegion[site.regionId],
      uncachedGraphValues(GRAPH_METRICS.settlement, state, { regionId: site.regionId }));
  }
  assert.deepEqual(serializeGameState(state), before, "summary evaluation is read-only");
}

const base = serializeGameState(initial);
// A later-founded settlement is absent from earlier summaries. Switching to
// it must read those known-empty local metrics, rather than replaying history
// again on every switch. Compare every series with the actual snapshot reader.
{
  const absentRegionId = initial.world.sites.at(-1).regionId;
  const existingRegionId = initial.world.sites[0].regionId;
  const beforeFoundation = deserializeGameState(base);
  beforeFoundation.world.sites = beforeFoundation.world.sites.filter(site =>
    site.regionId !== absentRegionId);
  const historicalData = serializeGameState(beforeFoundation);
  const tl = createTimelineFromInitialState(beforeFoundation);
  const projection = createProjectionCache();
  const graph = createTimeGraphController({ getTimeline: () => tl,
    getCursorState: () => initial, projectionCache: projection,
    metric: GRAPH_METRICS.settlement, horizonSec: 1 });
  graph.ensureCache();
  graph.retainAuthoritativeSummariesFrom(0,
    new Map([[0, buildProjectionSummaryFromState(beforeFoundation)]]));
  projection.ensureStateAtSecond = () => {
    assert.fail('a retained pre-founding summary must not trigger historical replay');
  };
  for (const regionId of [existingRegionId, absentRegionId, existingRegionId, absentRegionId]) {
    const subject = { regionId };
    graph.setSubject(subject, regionId);
    graph.ensureCache();
    assert.deepEqual(graph.getSeriesValuesForSeconds([0]).get(0),
      uncachedGraphValues(GRAPH_METRICS.settlement, beforeFoundation, subject),
      'pre-founding summaries preserve exact local defaults and global metrics');
  }
  // Absence of the summary itself, or of a series on an existing settlement,
  // is different: it must still use authoritative state, not invent zeroes.
  let fallbackReads = 0;
  projection.ensureStateAtSecond = () => {
    fallbackReads++;
    return { ok: true, stateData: historicalData };
  };
  const subject = { regionId: existingRegionId };
  graph.setSubject(subject, existingRegionId);
  graph.ensureCache();
  graph.retainAuthoritativeSummariesFrom(0, null);
  assert.deepEqual(graph.getSeriesValuesForSeconds([0]).get(0),
    uncachedGraphValues(GRAPH_METRICS.settlement, beforeFoundation, subject));
  assert.equal(fallbackReads, 1, 'a missing summary still reads authoritative state');
  const incomplete = buildProjectionSummaryFromState(beforeFoundation);
  delete incomplete.graphValues.settlementByRegion[existingRegionId].food;
  graph.retainAuthoritativeSummariesFrom(0, new Map([[0, incomplete]]));
  assert.deepEqual(graph.getSeriesValuesForSeconds([0]).get(0),
    uncachedGraphValues(GRAPH_METRICS.settlement, beforeFoundation, subject));
  assert.equal(fallbackReads, 2, 'an incomplete existing-settlement series still reads authoritative state');
}
const session = createProjectionChunkSession(base, 0, 2100);
assert.equal(session.ok, true);
let data = base;
let sec = 0;
while (sec < 2100) {
  const end = Math.min(2100, sec + (sec < 120 ? 20 : 30));
  const reference = buildProjectionChunkFromStateData(data, sec, end);
  const actual = session.next(end);
  assert.deepEqual(actual, reference, `live slice matches isolated replay at ${sec}`);
  sec = actual.endSec;
  data = actual.lastStateData;
  if (actual.terminal) break;
}
assert.equal(sec, data.runStatus.tSec, "terminal second is emitted exactly, not rounded to slice end");
assert.ok(sec < 2100);
assert.deepEqual(base, serializeGameState(initial), "projection does not mutate its input");
const actionsBySecond = [20, 21, 40].map(tSec => ({ tSec,
  actions: [{ kind: ActionKinds.SETTLEMENT_REROLL_VASSALS, payload: {} }] }));
const scheduledSession = createProjectionChunkSession(base, 0, 80, { actionsBySecond });
let scheduledData = base;
for (let start = 0; start < 80; start += 20) {
  const expected = buildProjectionChunkFromStateData(scheduledData, start, start + 20, { actionsBySecond });
  assert.equal(expected.ok, true, expected.reason);
  const actual = scheduledSession.next(start + 20);
  assert.deepEqual(actual, expected, "RNG-consuming actions at/beside slice boundaries apply exactly once");
  scheduledData = expected.lastStateData;
}
const restorer = createProjectionStateRestorer({ maxEntries: 4 });
const reference = deserializeGameState(base);
canonicalizeSnapshot(reference);
const anchors = new Map([[0, serializeGameState(reference)]]);
for (let t = 0; t <= 128; t++) {
  if (t) { advanceReplayStateOneSecond(reference); canonicalizeSnapshot(reference); }
  if (t % 16 === 0) anchors.set(t, serializeGameState(reference));
  const anchorSec = t - t % 16;
  const snapshot = anchors.get(anchorSec);
  const restored = restorer.restore(snapshot, anchorSec, t);
  assert.deepEqual(serializeGameState(restored), serializeGameState(reference), `off-anchor restore at ${t}`);
  assert.ok(Object.isFrozen(restored.gameConfig.settings.values));
  restored.rng.seed = 1;
  restored.world.sites[0].detailedState.practiceSlots[0].stock = -100;
  restored.civilization.currentMoonTurn = null;
  assert.deepEqual(serializeGameState(restorer.restore(snapshot, anchorSec, t)), serializeGameState(reference), "returned states do not alias anchors");
  assert.ok(restorer.getSize() <= 4);
}
assert.throws(() => restorer.restore({ ...base, gameStateSchemaVersion: -1 }, 0), /schema/);
assert.throws(() => restorer.restore({ ...base, rng: {} }, 0), /RNG/);
const invalidWorld=structuredClone(base);
invalidWorld.world.regions[0].controller='invalid';
assert.throws(()=>restorer.restore(invalidWorld,0),/world/i,'cached configs never bypass world validation');
const invalidLife=structuredClone(base);
invalidLife.civilization.vassalLineage.currentVassalId='missing-vassal';
assert.throws(()=>restorer.restore(invalidLife,0),/Life Map/i,'cached configs never bypass Life Map validation');
const changedConfig=structuredClone(base);
changedConfig.gameConfig.settings.values.primordialBasePressure=7;
const changedExpected=deserializeGameState(changedConfig);
canonicalizeSnapshot(changedExpected);
assert.deepEqual(serializeGameState(restorer.restore(changedConfig,0)),serializeGameState(changedExpected),
  'new config values are fully validated and canonicalized, not inherited from another anchor');
const invalidConfig=structuredClone(changedConfig);
invalidConfig.gameConfig.schemaVersion=-1;
assert.throws(()=>restorer.restore(invalidConfig,0),/config/i);
const ordinary=deserializeGameState(changedConfig);
ordinary.gameConfig.settings.values.primordialBasePressure=9;
assert.equal(changedConfig.gameConfig.settings.values.primordialBasePressure,7,
  'ordinary save/replay deserialization still returns an independent mutable config');
restorer.clear();
assert.deepEqual(serializeGameState(restorer.restore(base,0)),serializeGameState(deserializeGameState(base)),
  'clearing the reader releases its previous configuration');
assert.equal(restorer.restore(data, sec, sec+1), null, "never advances beyond run completion");

const timeline = createTimelineFromInitialState(initial);
const cache = createProjectionCache();
const token = cache.getTimelineToken(timeline);
const forecast = buildProjectionChunkFromStateData(timeline.baseStateData, 0, 128);
const ordinaryWire={...forecast,stateDataBySecond:Array.from(forecast.stateDataBySecond),
  summaryBySecond:Array.from(forecast.summaryBySecond)};
const encodedWire=encodeForecastChunk(forecast);
assert.equal(JSON.stringify(encodedWire),JSON.stringify(ordinaryWire),'wire JSON/state/RNG/summaries are unchanged');
assert.ok(serializeWire(encodedWire).byteLength < serializeWire(ordinaryWire).byteLength*.5,
  'real forecast messages must clone each identical config once, not once per anchor');
const receivedWire=freezeForecastChunkConfigs(structuredClone(encodedWire));
const [firstAnchor,secondAnchor]=receivedWire.stateDataBySecond.map(([,data])=>data);
assert.equal(firstAnchor.gameConfig,secondAnchor.gameConfig);
assert.ok(Object.isFrozen(firstAnchor.gameConfig.settings.values));
assert.notEqual(firstAnchor.world,secondAnchor.world,'only frozen config may share pointers');
const independentFirst=restorer.restore(firstAnchor,firstAnchor.tSec);
const independentSecond=restorer.restore(secondAnchor,secondAnchor.tSec);
independentFirst.rng.seed=1;
assert.equal(independentSecond.rng.seed,secondAnchor.rng.seed);
assert.deepEqual(receivedWire.summaryBySecond,ordinaryWire.summaryBySecond);
const alternateConfig=structuredClone(firstAnchor);
alternateConfig.gameConfig.settings.values.primordialBasePressure=7;
const mixedWire=freezeForecastChunkConfigs(structuredClone(encodeForecastChunk({ok:true,
  stateDataBySecond:new Map([[firstAnchor.tSec,firstAnchor],[secondAnchor.tSec,alternateConfig]]),
  summaryBySecond:new Map(),lastStateData:alternateConfig})));
assert.notEqual(mixedWire.stateDataBySecond[0][1].gameConfig,mixedWire.lastStateData.gameConfig,
  'different configs within a message must never be interned together');
assert.equal(encodeForecastChunk({ok:false,reason:'test'}).reason,'test');
assert.equal(cache.mergeForecastChunk(timeline, { ...forecast, timelineToken: token, historyEndSec: 0 }).ok, true);
const controller = createTimeGraphController({ getTimeline: () => timeline, getCursorState: () => initial, projectionCache: cache });
const size = cache.getSize();
const readSummary = cache.getSummary;
cache.getSummary = () => null;
assert.equal(controller.getSummaryAt(77, { cachedOnly: true }), null,
  "display reads wait for worker summaries instead of replaying a missing second");
cache.getSummary = readSummary;
for (let t = 1; t <= 128; t++) {
  const expected = restorer.restore(anchors.get(t - t % 16), t - t % 16, t);
  assert.deepEqual(serializeGameState(controller.getStateAt(t)), serializeGameState(expected));
}
assert.equal(cache.getSize(), size, "unveil never densifies projection anchors");
const ensureWindow = cache.ensureForecastWindow;
cache.ensureForecastWindow = () => { throw new Error("unexpected synchronous reforecast of worker coverage"); };
assert.equal(controller.ensureForecastCoverageTo(77).ok, true);
cache.ensureForecastWindow = ensureWindow;
assert.equal(controller.getStateAt(129), null, "restore cannot publish uncovered seconds");
cache.invalidateFromSecond(timeline, 65);
assert.equal(controller.getStateAt(80), null, "edited future cannot return a stale hot restore");
assert.equal(cache.mergeForecastChunk(timeline, { ...forecast, timelineToken: token, historyEndSec: 0 }).ok, false, "late worker chunk is rejected");
const editState = restorer.restore(base, 0, 17);
const editAction = { kind: ActionKinds.SETTLEMENT_REROLL_VASSALS, payload: {} };
assert.equal(appendActionAtCursor(timeline, editAction, editState).ok, true);
cache.invalidateFromSecond(timeline, 17);
const edited = rebuildStateAtSecond(timeline, 17);
assert.equal(edited.ok, true);
const editedForecast = buildProjectionChunkFromStateData(serializeGameState(edited.state), 17, 80);
const editedToken = cache.getTimelineToken(timeline);
cache.mergeForecastChunk(timeline, { ...editedForecast, timelineToken: editedToken, historyEndSec: 0 });
const editExpected = rebuildStateAtSecond(timeline, 63);
const editActual = controller.getStateAt(63);
assert.deepEqual(serializeGameState(editActual), serializeGameState(editExpected.state), "off-anchor edit future follows authoritative replay");
let coverage = 1552;
let summariesReady = true;
const lossController = createSettlementForecastController({
  getTimeline: () => timeline,
  getFrontierSec: () => 0,
  getFrontierState: () => initial,
  getControllerData: () => ({ forecastCoverageEndSec: coverage }),
  getRevealedCoverageEndSec: () => 1500,
  getEffectiveGraphHorizonSec: () => 2000,
  getControllerSummaryAt: (sec, options) => {
    assert.equal(options.cachedOnly, true, "survival display only reads published summaries");
    if (!summariesReady) return null;
    return sec === 1558 && coverage >= 1558
      ? { runComplete: true, runLossSec: 1558, runLossYear: 49 }
      : { runComplete: false };
  },
  getControllerStateAt: () => { throw new Error("display must not fall back to synchronous replay"); },
  exactLossSearchBucketSec: 16,
});
assert.equal(lossController.getProjectedLossInfo().resolved, false);
coverage = 1558;
summariesReady = false;
assert.equal(lossController.getProjectedLossInfo().resolved, false, "missing summary stays pending");
summariesReady = true;
assert.deepEqual(lossController.getProjectedLossInfo(), { resolved: true, lossSec: 1558, lossYear: 49 }, "terminal slice inside a cached unresolved bucket resolves");
assert.equal(lossController.getForecastStatus().browseCapSec, 1500, "worker completion never advances browse permission");
console.log("[timegraph-performance] exact summaries, isolated/live chunks and terminal boundary OK");
