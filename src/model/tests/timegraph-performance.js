import assert from "node:assert/strict";
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
import { createTimelineFromInitialState } from "../timeline/index.js";
import { createSettlementForecastController } from "../../controllers/settlement-forecast-controller.js";

function uncachedGraphValues(metric, state, subject) {
  return Object.fromEntries(metric.getSeries(subject, state).map(series =>
    [series.id, series.getValueFromSnapshot(state, subject)]).filter(([, value]) => Number.isFinite(value)));
}
const initial = createInitialState("devPlaytesting01", 99117);
initial.paused = false;
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
assert.equal(sec, 1828, "terminal second is emitted exactly, not rounded to slice end");
assert.deepEqual(base, serializeGameState(initial), "projection does not mutate its input");
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
  restored.world.sites[0].detailedState.storedFood = -100;
  restored.civilization.currentMoonTurn = null;
  assert.deepEqual(serializeGameState(restorer.restore(snapshot, anchorSec, t)), serializeGameState(reference), "returned states do not alias anchors");
  assert.ok(restorer.getSize() <= 4);
}
assert.throws(() => restorer.restore({ ...base, gameStateSchemaVersion: -1 }, 0), /schema/);
assert.throws(() => restorer.restore({ ...base, rng: {} }, 0), /RNG/);
assert.equal(restorer.restore(data, 1828, 1829), null, "never advances beyond run completion");

const timeline = createTimelineFromInitialState(initial);
const cache = createProjectionCache();
const token = cache.getTimelineToken(timeline);
const forecast = buildProjectionChunkFromStateData(timeline.baseStateData, 0, 128);
assert.equal(cache.mergeForecastChunk(timeline, { ...forecast, timelineToken: token, historyEndSec: 0 }).ok, true);
const controller = createTimeGraphController({ getTimeline: () => timeline, getCursorState: () => initial, projectionCache: cache });
const size = cache.getSize();
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
let coverage = 1552;
const lossController = createSettlementForecastController({
  getTimeline: () => timeline,
  getFrontierSec: () => 0,
  getFrontierState: () => initial,
  getControllerData: () => ({ forecastCoverageEndSec: coverage }),
  getRevealedCoverageEndSec: () => 1500,
  getEffectiveGraphHorizonSec: () => 2000,
  getControllerSummaryAt: sec => sec === 1558 && coverage >= 1558
    ? { runComplete: true, runLossSec: 1558, runLossYear: 49 }
    : { runComplete: false },
  exactLossSearchBucketSec: 16,
});
assert.equal(lossController.getProjectedLossInfo().resolved, false);
coverage = 1558;
assert.deepEqual(lossController.getProjectedLossInfo(), { resolved: true, lossSec: 1558, lossYear: 49 }, "terminal slice inside a cached unresolved bucket resolves");
assert.equal(lossController.getForecastStatus().browseCapSec, 1500, "worker completion never advances browse permission");
console.log("[timegraph-performance] exact summaries, isolated/live chunks and terminal boundary OK");
