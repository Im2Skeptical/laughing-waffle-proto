import assert from "node:assert/strict";
import { createInitialState } from "../init.js";
import {
  buildDetailedVassalSelectionPool,
  getDetailedVassalInterventionEffectSec,
} from "../detailed-settlements.js";
import { serializeGameState } from "../state.js";
import { buildProjectionSummaryFromState } from "../projection-summary.js";
import { buildProjectionChunkFromStateData } from "../projection-chunk.js";
import { createProjectionCache } from "../timegraph/projection-cache.js";
import {
  appendActionAtCursor,
  createTimelineFromInitialState,
  rebuildStateAtSecond,
} from "../timeline/index.js";

const base = createInitialState("devPlaytesting01", 99117);
const pool = buildDetailedVassalSelectionPool(base);
const rerolledPool = buildDetailedVassalSelectionPool(base, 1);
assert.equal(rerolledPool.rerollIndex, 1, "rerolled pools retain their deterministic index");
assert.notEqual(rerolledPool.expectedPoolHash, pool.expectedPoolHash,
  "rerolling derives a new candidate pool without changing simulation state");
assert.equal(base.rng.seed, 99117, "building candidate rerolls does not advance simulation RNG");
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
const selectedAtZero = rebuildStateAtSecond(timeline, 0);
assert.equal(selectedAtZero.ok, true);
const selectedVassal = selectedAtZero.state.civilization.vassalLineage.currentVassal;
assert.equal(
  selectedAtZero.state.rng.seed,
  base.rng.seed,
  "selecting a Vassal does not advance the authoritative simulation RNG"
);
assert.ok(selectedVassal.deathSec > selectedVassal.selectedSec);
const firstInterventionSec = Math.min(
  ...selectedVassal.interventions
    .map((intervention) => getDetailedVassalInterventionEffectSec(
      selectedAtZero.state,
      selectedVassal,
      intervention
    ))
    .filter(Number.isFinite)
);
assert.ok(firstInterventionSec > 1);
const unchangedPrefixEndSec = firstInterventionSec - 1;
const baselinePrefix = buildProjectionChunkFromStateData(
  serializeGameState(base),
  0,
  unchangedPrefixEndSec
);
const selectedPrefix = buildProjectionChunkFromStateData(
  serializeGameState(selectedAtZero.state),
  0,
  unchangedPrefixEndSec
);
assert.equal(baselinePrefix.ok, true);
assert.equal(selectedPrefix.ok, true);
assert.equal(
  selectedPrefix.endSec,
  baselinePrefix.endSec,
  "Vassal metadata does not alter the pre-intervention run boundary"
);
for (let tSec = 0; tSec <= baselinePrefix.endSec; tSec += 1) {
  assert.deepEqual(
    selectedPrefix.summaryBySecond.get(tSec)?.graphValues,
    baselinePrefix.summaryBySecond.get(tSec)?.graphValues,
    `Vassal selection leaves graph values unchanged before interventions at t=${tSec}`
  );
}
const beforeDeath = rebuildStateAtSecond(timeline, selectedVassal.deathSec - 1);
const atDeath = rebuildStateAtSecond(timeline, selectedVassal.deathSec);
const atDeathAgain = rebuildStateAtSecond(timeline, selectedVassal.deathSec);
assert.equal(beforeDeath.ok, true);
assert.equal(atDeath.ok, true);
assert.equal(atDeathAgain.ok, true);
assert.equal(
  beforeDeath.state.civilization.vassalLineage.currentVassal?.vassalId,
  selectedVassal.vassalId,
  "vassal remains active immediately before the planned boundary"
);
assert.equal(
  atDeath.state.civilization.vassalLineage.currentVassal,
  null,
  "vassal dies at the deterministic planned boundary"
);
assert.equal(
  atDeath.state.civilization.vassalLineage.selectedVassals.at(-1).deathSec,
  selectedVassal.deathSec
);
assert.deepEqual(
  serializeGameState(atDeath.state),
  serializeGameState(atDeathAgain.state),
  "rebuilding the lifespan boundary is authoritative"
);
const first = rebuildStateAtSecond(timeline, 160);
const second = rebuildStateAtSecond(timeline, 160);
assert.equal(first.ok, true);
assert.equal(second.ok, true);
assert.deepEqual(serializeGameState(first.state), serializeGameState(second.state));
assert.equal(first.state.rng.seed, second.state.rng.seed);
assert.equal(first.state.world.sites.length, 5);
assert.equal(first.state.civilization.vassalLineage.selectedVassals.length, 1);

const rerollTimeline = createTimelineFromInitialState(base);
appendActionAtCursor(rerollTimeline, {
  kind: "settlementSelectVassal",
  tSec: 0,
  payload: {
    candidateIndex: 0,
    expectedPoolHash: rerolledPool.expectedPoolHash,
    rerollIndex: rerolledPool.rerollIndex,
    tSec: 0,
  },
}, base);
const rerollSelected = rebuildStateAtSecond(rerollTimeline, 0);
assert.equal(rerollSelected.ok, true, "a selection from a rerolled pool replays");
assert.equal(rerollSelected.state.rng.seed, base.rng.seed,
  "rerolled selection keeps the authoritative RNG unchanged");
assert.equal(
  rerollSelected.state.civilization.vassalLineage.currentVassal?.candidateId,
  rerolledPool.candidates[0]?.candidateId,
  "replay selects the candidate shown by the rerolled pool"
);
const projectionSummary = buildProjectionSummaryFromState(first.state);
assert.ok(projectionSummary.graphValues.settlementByRegion["cedar-woods"]);
assert.ok(projectionSummary.graphValues.settlementByRegion["river-crown"]);
assert.equal(
  projectionSummary.graphValues.civilization.chaosPower,
  first.state.civilization.chaos.chaosPower,
  "global chaos is stored only in the civilization graph summary"
);
assert.equal(
  projectionSummary.graphValues.settlementByRegion["cedar-woods"].chaosPower,
  undefined
);

const terminalProjectionBase = createInitialState("devPlaytesting01");
terminalProjectionBase.civilization.chaos.chaosPower = 100;
terminalProjectionBase.civilization.chaos.monsterLossThreshold = 1;
const terminalProjection = buildProjectionChunkFromStateData(
  serializeGameState(terminalProjectionBase),
  0,
  3000
);
assert.equal(terminalProjection.ok, true);
assert.equal(
  terminalProjection.terminal,
  true,
  "forecast chunks finish successfully at civilization loss"
);
assert.ok(
  terminalProjection.endSec < 3000,
  "terminal forecast reports its actual end rather than requested coverage"
);
const terminalSummary = terminalProjection.summaryBySecond.get(
  terminalProjection.endSec
);
assert.equal(terminalSummary?.runComplete, true);
assert.equal(terminalSummary?.runLossYear, 1,
  "the configured terminal scenario resolves at its first Faith phase");
assert.ok(
  terminalProjection.stateDataBySecond.has(terminalProjection.endSec),
  "terminal state remains available to the survival tracker"
);
assert.equal(
  terminalProjection.summaryBySecond.has(terminalProjection.endSec + 1),
  false,
  "forecast does not simulate beyond completed history"
);

const evictionTimeline = createTimelineFromInitialState(
  createInitialState("devPlaytesting01", 99118)
);
const evictionCache = createProjectionCache({
  maxEntries: 256,
  maxBytes: 1024 * 1024 * 1024,
});
const evictionToken = evictionCache.getTimelineToken(evictionTimeline);
const evictionStateData = serializeGameState(evictionTimeline.baseStateData);
const firstEvictionMerge = evictionCache.mergeForecastChunk(evictionTimeline, {
  timelineToken: evictionToken,
  historyEndSec: 0,
  baseSec: 0,
  endSec: 256,
  stepSec: 1,
  stateDataBySecond: Array.from({ length: 256 }, (_, index) => [
    index + 1,
    evictionStateData,
  ]),
  summaryBySecond: Array.from({ length: 256 }, (_, index) => [
    index + 1,
    { tSec: index + 1 },
  ]),
  lastStateData: evictionStateData,
});
assert.equal(firstEvictionMerge.ok, true);
for (let sec = 1; sec < 256; sec += 1) evictionCache.getStateData(sec);
const tailMerge = evictionCache.mergeForecastChunk(evictionTimeline, {
  timelineToken: evictionToken,
  historyEndSec: 0,
  baseSec: 256,
  endSec: 257,
  stepSec: 1,
  stateDataBySecond: [[257, evictionStateData]],
  summaryBySecond: [[257, { tSec: 257 }]],
  lastStateData: evictionStateData,
});
assert.equal(tailMerge.ok, true);
assert.ok(evictionCache.getStateData(256),
  "forecast eviction preserves the worker continuation boundary");
assert.equal(evictionCache.getStateData(1), null,
  "old heavy forecast state is still evicted at the configured capacity");
assert.deepEqual(evictionCache.getSummary(1), { tSec: 1 },
  "old graph summaries survive heavy-state eviction");
console.log("[detailed-replay] OK");
