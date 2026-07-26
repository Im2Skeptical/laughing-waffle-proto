import assert from "node:assert/strict";
import { createInitialState } from "../init.js";
import { buildDetailedVassalSelectionPool } from "../detailed-settlements.js";
import { serializeGameState } from "../state.js";
import { buildProjectionSummaryFromState } from "../projection-summary.js";
import {
  appendActionAtCursor,
  createTimelineFromInitialState,
  rebuildStateAtSecond,
} from "../timeline/index.js";

const base = createInitialState("devPlaytesting01", 99117);
const pool = buildDetailedVassalSelectionPool(base);
const timeline = createTimelineFromInitialState(base);
appendActionAtCursor(timeline, {
  kind: "settlementSelectVassal",
  tSec: 0,
  payload: {
    candidateIndex: 1,
    expectedPoolHash: pool.expectedPoolHash,
    tSec: 0,
  },
}, base);
const first = rebuildStateAtSecond(timeline, 160);
const second = rebuildStateAtSecond(timeline, 160);
assert.equal(first.ok, true);
assert.equal(second.ok, true);
assert.deepEqual(serializeGameState(first.state), serializeGameState(second.state));
assert.equal(first.state.rng.seed, second.state.rng.seed);
assert.equal(first.state.world.sites.length, 5);
assert.equal(first.state.civilization.vassalLineage.selectedVassals.length, 1);
const projectionSummary = buildProjectionSummaryFromState(first.state);
assert.ok(projectionSummary.graphValues.settlementByRegion["cedar-woods"]);
assert.ok(projectionSummary.graphValues.settlementByRegion["river-crown"]);
assert.equal(
  projectionSummary.graphValues.settlementByRegion["cedar-woods"].chaosPower,
  projectionSummary.graphValues.settlementByRegion["river-crown"].chaosPower,
  "chaos remains global while site series are separately keyed"
);
console.log("[detailed-replay] OK");
