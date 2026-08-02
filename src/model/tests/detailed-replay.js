import assert from "node:assert/strict";
import { createInitialState } from "../init.js";
import { buildDetailedVassalSelectionPool } from "../detailed-settlements.js";
import { serializeGameState } from "../state.js";
import { buildProjectionSummaryFromState } from "../projection-summary.js";
import { buildProjectionChunkFromStateData } from "../projection-chunk.js";
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
const selectedAtZero = rebuildStateAtSecond(timeline, 0);
assert.equal(selectedAtZero.ok, true);
const selectedVassal = selectedAtZero.state.civilization.vassalLineage.currentVassal;
assert.ok(selectedVassal.deathSec > selectedVassal.selectedSec);
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
console.log("[detailed-replay] OK");
