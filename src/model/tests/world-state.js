import assert from "node:assert/strict";
import { createInitialState } from "../init.js";
import { deserializeGameState, serializeGameState } from "../state.js";
import {
  getDetailedCivilizationSummary,
  getDetailedSettlementSites,
  getDetailedSettlement,
  getDetailedSettlementViewModel,
  getSettlementPressureSummary,
} from "../detailed-settlements.js";
import { GRAPH_METRICS } from "../graph-metrics.js";
import {
  buildEdgeTransferBatchAtBoundary,
  getLatestEdgeTransferBoundarySec,
} from "../edge-transfers.js";
import {
  rememberMaxObservedCivilizationSurvivalYear,
} from "../persistent-memory.js";
import { buildProjectionSummaryFromState } from "../projection-summary.js";
import {
  createTimelineFromInitialState,
  rebuildStateAtSecond,
} from "../timeline/index.js";
import { createSimRunner } from "../../controllers/sim-runner.js";
import {
  createSettlementForecastController,
} from "../../controllers/settlement-forecast-controller.js";
import {
  addWorldConnection,
  getConnectedRegionIds,
  getRegionReference,
  getRegionState,
  removeWorldConnection,
  validateWorldDefinition,
  validateWorldState,
} from "../world-state.js";
import { worldMapDefs } from "../../defs/world/world-map-defs.js";
import {
  DEFAULT_REGION_STRUCTURE_CAPACITY_MAX,
  DEFAULT_REGION_STRUCTURE_CAPACITY_MIN,
} from "../../defs/world/detailed-settlement-scenario.js";
import {
  getEdgeTransferPacketFacing,
  getEdgeTransferPacketGlyphSpec,
  getEdgeTransferPacketPose,
  getEdgeTransferPacketVisualSpec,
  getWorkerIndicatorPresentation,
  resolveEdgeTransferPlaybackDirection,
} from "../../views/world-map-pixi.js";
import { resolveForecastRevealPlayheadSec } from "../../views/timegraphs-helpers.js";

const state = createInitialState("devPlaytesting01", 24680);
assert.equal(validateWorldDefinition(worldMapDefs.riverBasin01).ok, true);
assert.equal(validateWorldState(state).ok, true);
assert.equal(state.gameStateSchemaVersion, 12);
assert.ok(state.world.regions.every((region) =>
  region.structureCapacity >= DEFAULT_REGION_STRUCTURE_CAPACITY_MIN
  && region.structureCapacity <= DEFAULT_REGION_STRUCTURE_CAPACITY_MAX));
assert.deepEqual(
  createInitialState("devPlaytesting01", 24680).world.regions.map((region) => region.structureCapacity),
  state.world.regions.map((region) => region.structureCapacity),
  "equal seeds reproduce regional capacity rolls"
);
assert.notDeepEqual(
  createInitialState("devPlaytesting01", 24681).world.regions.map((region) => region.structureCapacity),
  state.world.regions.map((region) => region.structureCapacity),
  "different seeds can produce different regional capacity rolls"
);
assert.ok(state.world.regions.every((region) =>
  region.detailedSettlementEnabled || region.controller === "frontier"),
"all authored non-detailed regions begin as frontier");
assert.deepEqual(getDetailedSettlementSites(state).map((site) => site.regionId), [
  "cedar-woods", "west-levee", "upper-floodplain", "river-crown", "lake-country",
]);
assert.equal(state.civilization.capitalRegionId, "river-crown");
assert.deepEqual(worldMapDefs.riverBasin01.regions.map((region) => getRegionReference(state, region.id)),
  Array.from({ length: 15 }, (_, index) => `R${String(index + 1).padStart(2, "0")}`));
assert.equal(addWorldConnection(state, "upper-floodplain", "east-steppe").ok, true);
assert.ok(getConnectedRegionIds(state, "upper-floodplain").includes("east-steppe"));
assert.equal(removeWorldConnection(state, "upper-floodplain", "east-steppe").ok, true);
assert.equal(getConnectedRegionIds(state, "upper-floodplain").includes("east-steppe"), false);
assert.equal(validateWorldState(state).ok, true);
for (const site of getDetailedSettlementSites(state)) {
  const view = getDetailedSettlementViewModel(state, site.regionId);
  assert.equal(view.elderOrder.resistance, 29);
  assert.equal(view.usedStructureCapacity, 3);
  assert.equal(view.storedFood, 60);
  assert.deepEqual(view.workerPool, {
    availableWorkerCount: 3,
    activeWorkerCount: 3,
    unusedWorkerCount: 0,
  });
}
const pressureState = createInitialState("devPlaytesting01", 24680);
const pressuredSettlement = getDetailedSettlement(pressureState, "cedar-woods");
const pressuredPopulation = getDetailedSettlementViewModel(
  pressureState,
  "cedar-woods"
).population;
pressuredSettlement.populationByClass.villager.adults += 100;
pressuredSettlement.lastMeal = {
  tSec: 2,
  demand: 40,
  consumed: 25,
  ratio: 0.625,
  byClass: {
    villager: { migrants: 4 },
    stranger: { migrants: 2 },
  },
};
assert.deepEqual(getSettlementPressureSummary(pressureState, "cedar-woods"), {
  starvation: true,
  starvationMigrants: 6,
  unfedMealDemand: 15,
  overcrowding: true,
  housingOverflow: Math.max(
    0,
    pressuredPopulation.total + 100 - pressuredPopulation.housingCapacity
  ),
});
assert.deepEqual(
  getDetailedSettlementViewModel(pressureState, "cedar-woods").pressure,
  getSettlementPressureSummary(pressureState, "cedar-woods")
);
const rebuiltPressure = rebuildStateAtSecond(
  createTimelineFromInitialState(pressureState),
  0
);
assert.equal(rebuiltPressure.ok, true);
assert.deepEqual(
  getSettlementPressureSummary(rebuiltPressure.state, "cedar-woods"),
  getSettlementPressureSummary(pressureState, "cedar-woods"),
  "map pressure derives identically from replayed viewed state"
);
assert.deepEqual(getWorkerIndicatorPresentation(0), {
  activeWorkerCount: 0,
  unusedWorkerCount: 0,
  totalWorkerCount: 0,
  renderedActivePawnCount: 0,
  renderedUnusedPawnCount: 0,
  renderedPawnCount: 0,
  badgeValue: null,
});
assert.deepEqual(getWorkerIndicatorPresentation(3), {
  activeWorkerCount: 3,
  unusedWorkerCount: 0,
  totalWorkerCount: 3,
  renderedActivePawnCount: 3,
  renderedUnusedPawnCount: 0,
  renderedPawnCount: 3,
  badgeValue: null,
});
assert.deepEqual(getWorkerIndicatorPresentation(7, 3), {
  activeWorkerCount: 7,
  unusedWorkerCount: 3,
  totalWorkerCount: 10,
  renderedActivePawnCount: 4,
  renderedUnusedPawnCount: 1,
  renderedPawnCount: 5,
  badgeValue: 10,
});
const unusedWorkerState = createInitialState("devPlaytesting01", 24680);
const unusedWorkerSettlement = getDetailedSettlement(
  unusedWorkerState,
  "cedar-woods"
);
unusedWorkerSettlement.populationByClass.villager.adults = 100;
unusedWorkerSettlement.practiceSlots = Array.from({ length: 5 }, () => null);
assert.deepEqual(
  getDetailedSettlementViewModel(unusedWorkerState, "cedar-woods").workerPool,
  {
    availableWorkerCount: 10,
    activeWorkerCount: 0,
    unusedWorkerCount: 10,
  }
);
assert.equal(
  resolveForecastRevealPlayheadSec({
    followEnabled: true,
    visibleForecastCoverageEndSec: 127.9,
    minSec: 0,
    maxSec: 320,
  }),
  127,
  "automatic playhead follows the visible reveal edge"
);
assert.equal(
  resolveForecastRevealPlayheadSec({
    followEnabled: false,
    visibleForecastCoverageEndSec: 180,
  }),
  null,
  "manual playhead ownership disables reveal following"
);
assert.equal(
  resolveForecastRevealPlayheadSec({
    followEnabled: true,
    latchedForecastScrubSec: 90,
    visibleForecastCoverageEndSec: 180,
  }),
  null,
  "a latched forecast preview is never overwritten by reveal following"
);
assert.equal(getLatestEdgeTransferBoundarySec(17), 17);
const transferTimeline = createTimelineFromInitialState(
  createInitialState("devPlaytesting01", 24680)
);
const preTransferBoundary = rebuildStateAtSecond(transferTimeline, 13);
assert.equal(preTransferBoundary.ok, true);
getDetailedSettlement(preTransferBoundary.state, "cedar-woods").looseFood = 500;
for (const regionId of ["west-levee", "upper-floodplain", "river-crown", "lake-country"]) {
  const settlement = getDetailedSettlement(preTransferBoundary.state, regionId);
  settlement.storedFood = 0;
  settlement.looseFood = 0;
}
const preTransferStateData = serializeGameState(preTransferBoundary.state);
const transferBatch = buildEdgeTransferBatchAtBoundary(
  preTransferBoundary.state,
  14
);
assert.ok(transferBatch.transfers.length > 0);
assert.deepEqual(
  serializeGameState(preTransferBoundary.state),
  preTransferStateData,
  "edge-transfer selection is pure"
);
for (const transfer of transferBatch.transfers) {
  assert.equal(transfer.systemId, "administrate");
  assert.equal(transfer.resourceId, "food");
  assert.ok(transfer.amount > 0);
  assert.equal(getRegionState(preTransferBoundary.state, transfer.sourceRegionId)?.controller,
    "player");
  assert.equal(getRegionState(preTransferBoundary.state, transfer.destinationRegionId)?.controller,
    "player");
  assert.ok(getDetailedSettlement(preTransferBoundary.state, transfer.sourceRegionId));
  assert.ok(getDetailedSettlement(preTransferBoundary.state, transfer.destinationRegionId));
}
assert.deepEqual(
  buildEdgeTransferBatchAtBoundary(
    deserializeGameState(preTransferStateData),
    14
  ),
  transferBatch,
  "edge-transfer batches are replay deterministic"
);
const packetPose = getEdgeTransferPacketPose({
  from: { x: 10, y: 20 },
  to: { x: 110, y: 20 },
  progress: 0.5,
});
assert.equal(packetPose.x, 60);
assert.equal(packetPose.y, 20);
assert.equal(packetPose.directionX, 1);
assert.equal(packetPose.directionY, 0);
const rewindPacketPose = getEdgeTransferPacketPose({
  from: { x: 100, y: 20 },
  to: { x: 0, y: 20 },
  progress: 0.4,
  laneOffset: 9,
});
const matchingForwardPose = getEdgeTransferPacketPose({
  from: { x: 0, y: 20 },
  to: { x: 100, y: 20 },
  progress: 0.6,
  laneOffset: -9,
});
const fixedPacketFacing = getEdgeTransferPacketFacing(
  { x: 0, y: 20 },
  { x: 100, y: 20 }
);
const rewindVisualSpec = getEdgeTransferPacketVisualSpec({
  sourcePoint: { x: 0, y: 20 },
  destinationPoint: { x: 100, y: 20 },
  reversed: true,
  laneOffset: -9,
});
assert.equal(getEdgeTransferPacketGlyphSpec("food").color, 0x66cc77);
assert.equal(getEdgeTransferPacketGlyphSpec("population").color, 0xd6c1ff);
assert.equal(getEdgeTransferPacketGlyphSpec("food").circles.length, 3);
assert.equal(rewindPacketPose.directionX, -1);
assert.ok(Math.abs(rewindPacketPose.x - matchingForwardPose.x) < 0.0001);
assert.ok(Math.abs(rewindPacketPose.y - matchingForwardPose.y) < 0.0001);
assert.equal(fixedPacketFacing.directionX, 1);
assert.equal(fixedPacketFacing.angle, 0);
assert.deepEqual(rewindVisualSpec, {
  from: { x: 100, y: 20 },
  to: { x: 0, y: 20 },
  facingFrom: { x: 0, y: 20 },
  facingTo: { x: 100, y: 20 },
  laneOffset: 9,
});
assert.equal(resolveEdgeTransferPlaybackDirection(null, 12), 1);
assert.equal(resolveEdgeTransferPlaybackDirection(12, 18), 1);
assert.equal(resolveEdgeTransferPlaybackDirection(18, 12), -1);
assert.equal(resolveEdgeTransferPlaybackDirection(12, 12), 0);

const civilizationSummary = getDetailedCivilizationSummary(state);
assert.deepEqual(civilizationSummary.regionIds, [
  "cedar-woods",
  "west-levee",
  "upper-floodplain",
  "river-crown",
  "lake-country",
]);
assert.equal(civilizationSummary.settlementCount, 5);
assert.deepEqual(
  {
    children: civilizationSummary.population.children,
    adults: civilizationSummary.population.adults,
    elders: civilizationSummary.population.elders,
    total: civilizationSummary.population.total,
    mealDemand: civilizationSummary.population.mealDemand,
    housingCapacity: civilizationSummary.population.housingCapacity,
  },
  {
    children: 0,
    adults: 150,
    elders: 15,
    total: 165,
    mealDemand: 165,
    housingCapacity: 400,
  }
);
assert.deepEqual(civilizationSummary.food, {
  stored: 300,
  loose: 0,
  total: 300,
  storedCapacity: 500,
});
assert.equal(civilizationSummary.population.byClass.villager.total, 165);
assert.equal(civilizationSummary.population.byClass.stranger.total, 0);

const filteredState = deserializeGameState(serializeGameState(state));
filteredState.world.regions.find(
  (region) => region.id === "lake-country"
).controller = "external-a";
assert.equal(getDetailedCivilizationSummary(filteredState).settlementCount, 4);
assert.equal(getDetailedCivilizationSummary(filteredState).population.total, 132);

const roundedFoodState = deserializeGameState(serializeGameState(state));
getDetailedSettlement(roundedFoodState, "cedar-woods").storedFood = 0.33336;
getDetailedSettlement(roundedFoodState, "west-levee").storedFood = 0.33336;
getDetailedSettlement(roundedFoodState, "upper-floodplain").storedFood = 0.33336;
getDetailedSettlement(roundedFoodState, "river-crown").storedFood = 0;
getDetailedSettlement(roundedFoodState, "lake-country").storedFood = 0;
assert.equal(getDetailedCivilizationSummary(roundedFoodState).food.stored, 1.0001);

const civilizationSeries = GRAPH_METRICS.civilization.getSeries(null, state);
const localSeries = GRAPH_METRICS.settlement.getSeries(
  { regionId: "cedar-woods" },
  state
);
assert.equal(
  civilizationSeries.find((series) => series.id === "totalPopulation")
    .getValue(state),
  165
);
assert.equal(
  localSeries.find((series) => series.id === "totalPopulation")
    .getValue(state, { regionId: "cedar-woods" }),
  33
);
assert.equal(
  localSeries.some((series) => series.id === "chaosPower"),
  false,
  "global chaos is not mixed into local graph series"
);
assert.deepEqual(
  civilizationSeries
    .filter((series) => series.pickerGroup === "classMetric")
    .map((series) => series.id),
  [
    "population:villager",
    "population:stranger",
    "freePopulation:villager",
    "freePopulation:stranger",
  ]
);

const projectionSummary = buildProjectionSummaryFromState(state);
assert.equal(
  Object.prototype.hasOwnProperty.call(
    projectionSummary.graphValues,
    "settlement"
  ),
  false
);
assert.equal(projectionSummary.graphValues.civilization.totalPopulation, 165);
assert.equal(
  projectionSummary.graphValues.settlementByRegion["cedar-woods"]
    .totalPopulation,
  33
);

const roundTrip = deserializeGameState(serializeGameState(state));
assert.deepEqual(serializeGameState(roundTrip), serializeGameState(state));
const serializedText = JSON.stringify(serializeGameState(state));
for (const removedKey of ["elderCouncil", "agendaByClass", "installedPracticeIds", "activeEnvEventRuns"]) {
  assert.equal(serializedText.includes(removedKey), false, `legacy state absent: ${removedKey}`);
}
const old = serializeGameState(state);
old.gameStateSchemaVersion = 11;
assert.throws(() => deserializeGameState(old), /expected v12/);

const forecastState = createInitialState("devPlaytesting01", 24680);
const forecastTimeline = { revision: 0 };
let observedSurvivalYear = null;
const forecastController = createSettlementForecastController({
  getTimeline: () => forecastTimeline,
  ensureControllerCache: () => {},
  getControllerData: () => ({ forecastCoverageEndSec: 320 }),
  getControllerStateAt: () => null,
  getControllerStateDataAt: () => null,
  getControllerSummaryAt: () => ({ runComplete: false }),
  getFrontierSec: () => 0,
  getFrontierState: () => forecastState,
  getViewedState: () => forecastState,
  getViewedSec: () => 0,
  getRevealedCoverageEndSec: () => 128,
  getEffectiveGraphHorizonSec: () => 320,
  setHorizonSecOverride: () => {},
  commitCursorSecond: () => ({ ok: true }),
  browseCursorSecond: () => ({ ok: true }),
  clearPreviewState: () => {},
  setPlaybackViewSec: () => {},
  getMaxObservedSurvivalYear: () => observedSurvivalYear,
  rememberObservedSurvivalYear: (year) => {
    const previous = observedSurvivalYear;
    observedSurvivalYear =
      previous == null ? year : Math.max(previous, year);
    return {
      ok: true,
      changed: observedSurvivalYear !== previous,
      value: observedSurvivalYear,
    };
  },
  graphWindowSec: 320,
  lossSearchCapacitySec: 320,
  dynamicDisplayBufferYears: 4,
  dynamicDisplayQuantumSec: 1,
  exactLossSearchBucketSec: 16,
});
const unresolvedDisplay = forecastController.getLossInfoForDisplay();
assert.equal(unresolvedDisplay.resolved, false);
assert.ok(
  unresolvedDisplay.lossYear > 1,
  "unresolved graph extent still supplies an internal display horizon"
);
assert.equal(unresolvedDisplay.maxLossYear, null);
assert.equal(observedSurvivalYear, null, "render-facing getter stays pure");
assert.deepEqual(forecastController.syncObservedSurvivalYear(), {
  changed: false,
  value: null,
});
assert.equal(
  observedSurvivalYear,
  null,
  "unresolved forecast coverage never updates the survival record"
);

forecastState.year = 12;
forecastState.runStatus = {
  complete: true,
  tSec: 352,
  year: 12,
  reason: "test",
};
forecastTimeline.revision += 1;
forecastController.invalidateLossCache();
assert.deepEqual(forecastController.syncObservedSurvivalYear(), {
  changed: true,
  value: 12,
});
assert.equal(
  forecastController.getLossInfoForDisplay().maxLossYear,
  12,
  "resolved loss years are exposed and remembered"
);

assert.equal(
  rememberMaxObservedCivilizationSurvivalYear(state, 75),
  true
);
assert.equal(
  rememberMaxObservedCivilizationSurvivalYear(state, 60),
  false
);
assert.equal(
  state.persistentKnowledge.maxObservedCivilizationSurvivalYear,
  75
);

const timeline = createTimelineFromInitialState(state);
const first = rebuildStateAtSecond(timeline, 96);
const second = rebuildStateAtSecond(timeline, 96);
assert.equal(first.ok, true);
assert.equal(second.ok, true);
assert.deepEqual(serializeGameState(first.state), serializeGameState(second.state));
assert.equal(
  first.state.persistentKnowledge.maxObservedCivilizationSurvivalYear,
  75,
  "survival record is retained by authoritative rebuilds"
);

const storage = new Map();
const priorLocalStorage = globalThis.localStorage;
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: (key) => storage.delete(key),
};
try {
  const runner = createSimRunner({ setupId: "devPlaytesting01" });
  assert.equal(runner.init().ok, true);
  runner.rememberCivilizationSurvivalYear(91);
  assert.equal(runner.saveToSlot(1).ok, true);
  assert.equal(runner.resetToSetup("devPlaytesting01").ok, true);
  assert.equal(
    runner.getState().persistentKnowledge.maxObservedCivilizationSurvivalYear,
    null,
    "a new run resets the record"
  );
  assert.equal(runner.loadFromSlot(1).ok, true);
  assert.equal(
    runner.getState().persistentKnowledge.maxObservedCivilizationSurvivalYear,
    91,
    "save/load restores the record"
  );
  const saveKey = Array.from(storage.keys()).find((key) => key.endsWith(".slot1"));
  const oldSave = JSON.parse(storage.get(saveKey));
  oldSave.meta.schemaVersion = 6;
  storage.set(saveKey, JSON.stringify(oldSave));
  assert.equal(runner.loadFromSlot(1).reason, "versionMismatch");
} finally {
  if (priorLocalStorage === undefined) {
    delete globalThis.localStorage;
  } else {
    globalThis.localStorage = priorLocalStorage;
  }
}

console.log("[world-state-v12] OK");
