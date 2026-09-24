import assert from "node:assert/strict";
import { createInitialState } from "../init.js";
import { serializeGameState, deserializeGameState } from "../state.js";
import { canonicalizeSnapshot } from "../canonicalize.js";
import { advanceReplayStateOneSecond } from "../replay-second-runner.js";
import { GRAPH_METRICS } from "../graph-metrics.js";
import { buildProjectionSummaryFromState } from "../projection-summary.js";
import { buildProjectionChunkFromStateData, createProjectionChunkSession } from "../projection-chunk.js";

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
console.log("[timegraph-performance] exact summaries, isolated/live chunks and terminal boundary OK");
