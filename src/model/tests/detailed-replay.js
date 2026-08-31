import assert from "node:assert/strict";
import { ActionKinds } from "../actions.js";
import { createInitialState } from "../init.js";
import { buildProjectionChunkFromStateData } from "../projection-chunk.js";
import { buildProjectionSummaryFromState } from "../projection-summary.js";
import { serializeGameState } from "../state.js";
import {
  appendActionAtCursor,
  createTimelineFromInitialState,
  rebuildStateAtSecond,
} from "../timeline/index.js";
import {
  getCurrentLifeMapVassal,
  getVassalCandidatePool,
  selectLifeMapVassal,
} from "../vassal-life-map.js";

const base = createInitialState("devPlaytesting01", 99117);
base.gameConfig.settings.values.primordialBasePressure = 0;
const initialPool = getVassalCandidatePool(base);
const timeline = createTimelineFromInitialState(base);
const selectedPreview = createInitialState("devPlaytesting01", 99117);
const previewPool = getVassalCandidatePool(selectedPreview);
const previewSelection = selectLifeMapVassal(
  selectedPreview, 1, previewPool.expectedPoolHash
);
assert.equal(previewSelection.ok, true);
const previewVassal = getCurrentLifeMapVassal(selectedPreview);
const entryNodeId = previewVassal.lifeMap.availableNodeIds.find((id) =>
  previewVassal.lifeMap.graph.nodes.find((node) => node.id === id)?.family === "patronage");

for (const action of [
  {
    kind: ActionKinds.SETTLEMENT_SELECT_VASSAL,
    payload: { candidateIndex: 1, expectedPoolHash: initialPool.expectedPoolHash },
  },
  {
    kind: ActionKinds.VASSAL_ENTER_LIFE_NODE,
    payload: { nodeId: entryNodeId },
  },
  {
    kind: ActionKinds.VASSAL_SELECT_LIFE_OPTION,
    payload: { nodeId: entryNodeId, optionId: "cultivateConnections" },
  },
  {
    kind: ActionKinds.VASSAL_CONFIRM_LIFE_NODE,
    payload: { nodeId: entryNodeId },
  },
]) {
  appendActionAtCursor(timeline, { ...action, tSec: 0 }, base);
}

const selected = rebuildStateAtSecond(timeline, 0);
assert.equal(selected.ok, true);
const selectedVassal = getCurrentLifeMapVassal(selected.state);
assert.ok(selectedVassal);
assert.equal(selectedVassal.lifeMap.pendingResolution.phaseCost, 324);
const resolutionSec = selectedVassal.lifeMap.pendingResolution.resolveSec;
assert.equal(resolutionSec, 324);

const beforeResolution = rebuildStateAtSecond(timeline, resolutionSec - 1);
const atResolution = rebuildStateAtSecond(timeline, resolutionSec);
const atResolutionAgain = rebuildStateAtSecond(timeline, resolutionSec);
assert.equal(beforeResolution.ok, true);
assert.equal(atResolution.ok, true);
assert.deepEqual(
  serializeGameState(atResolution.state),
  serializeGameState(atResolutionAgain.state),
  "node completion replay is authoritative"
);
const resolvedVassal = getCurrentLifeMapVassal(atResolution.state);
assert.equal(resolvedVassal.lifeMap.nodeStates[entryNodeId].resolved, true);
assert.equal(resolvedVassal.lifeMap.pendingResolution, null);
assert.ok(resolvedVassal.lifeMap.availableNodeIds.length >= 1);
assert.equal(
  atResolution.state.rng.vassalSeed,
  atResolutionAgain.state.rng.vassalSeed,
  "mortality consumes the same RNG on every rebuild"
);

const rerollBase = createInitialState("devPlaytesting01", 1234);
const rerollTimeline = createTimelineFromInitialState(rerollBase);
appendActionAtCursor(rerollTimeline, {
  kind: ActionKinds.SETTLEMENT_REROLL_VASSALS,
  payload: {},
  tSec: 0,
}, rerollBase);
const rerolledA = rebuildStateAtSecond(rerollTimeline, 0);
const rerolledB = rebuildStateAtSecond(rerollTimeline, 0);
assert.equal(rerolledA.ok, true);
assert.deepEqual(getVassalCandidatePool(rerolledA.state), getVassalCandidatePool(rerolledB.state));
assert.equal(getVassalCandidatePool(rerolledA.state).rerollIndex, 1);

const elderA = createInitialState("devPlaytesting01", 6543);
const elderB = createInitialState("devPlaytesting01", 6543);
for (const site of elderB.world.sites) {
  site.detailedState.populationByClass.villager.eldersByAge = [{ age: 90, count: 99 }];
  site.detailedState.populationByClass.stranger.eldersByAge = [{ age: 100, count: 50 }];
}
elderA.paused = true;
elderB.paused = true;
const { applyAction } = await import("../actions.js");
assert.equal(applyAction(elderA, { kind: ActionKinds.SETTLEMENT_REROLL_VASSALS, payload: {} }).ok, true);
assert.equal(applyAction(elderB, { kind: ActionKinds.SETTLEMENT_REROLL_VASSALS, payload: {} }).ok, true);
assert.deepEqual(
  getVassalCandidatePool(elderA),
  getVassalCandidatePool(elderB),
  "Elder populations do not affect candidate generation"
);

const projection = buildProjectionChunkFromStateData(
  serializeGameState(selected.state),
  0,
  resolutionSec
);
assert.equal(projection.ok, true);
const projectedEnd = projection.summaryBySecond.get(resolutionSec);
assert.equal(projectedEnd?.settlement?.currentVassalResolutionSec, null,
  "projection resolves the same pending node boundary");

const projectionSummary = buildProjectionSummaryFromState(atResolution.state);
assert.ok(projectionSummary.graphValues.settlementByRegion["cedar-woods"]);
assert.equal(
  projectionSummary.graphValues.civilization.chaosPower,
  atResolution.state.civilization.chaos.chaosPower
);

const terminalProjectionBase = createInitialState("devPlaytesting01");
terminalProjectionBase.civilization.chaos.chaosPower = 100;
terminalProjectionBase.civilization.chaos.monsterLossThreshold = 1;
const terminalProjection = buildProjectionChunkFromStateData(
  serializeGameState(terminalProjectionBase), 0, 3000
);
assert.equal(terminalProjection.ok, true);
assert.equal(terminalProjection.terminal, true);
assert.ok(terminalProjection.endSec < 3000);

console.log("[detailed-replay] OK");
