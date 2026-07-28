import assert from "node:assert/strict";
import { createInitialState } from "../init.js";
import { deserializeGameState, serializeGameState } from "../state.js";
import {
  getDetailedCivilizationSummary,
  getDetailedSettlementSites,
  getDetailedSettlement,
  getDetailedSettlementViewModel,
} from "../detailed-settlements.js";
import { GRAPH_METRICS } from "../graph-metrics.js";
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
import { validateWorldDefinition, validateWorldState } from "../world-state.js";
import { worldMapDefs } from "../../defs/world/world-map-defs.js";
import { REGION_STRUCTURE_CAPACITIES } from "../../defs/world/detailed-settlement-scenario.js";
import { getWorkerIndicatorPresentation } from "../../views/world-map-pixi.js";

const state = createInitialState("devPlaytesting01", 24680);
assert.equal(validateWorldDefinition(worldMapDefs.riverBasin01).ok, true);
assert.equal(validateWorldState(state).ok, true);
assert.equal(state.gameStateSchemaVersion, 5);
assert.deepEqual(state.world.regions.map((region) => region.structureCapacity),
  REGION_STRUCTURE_CAPACITIES);
assert.deepEqual(getDetailedSettlementSites(state).map((site) => site.regionId), [
  "cedar-woods", "west-levee", "upper-floodplain", "river-crown", "lake-country",
]);
assert.equal(state.civilization.capitalRegionId, "river-crown");
for (const site of getDetailedSettlementSites(state)) {
  const view = getDetailedSettlementViewModel(state, site.regionId);
  assert.equal(view.elderOrder.resistance, 29);
  assert.equal(view.usedStructureCapacity, 3);
  assert.equal(view.storedFood, 60);
}
assert.deepEqual(getWorkerIndicatorPresentation(0), {
  activeWorkerCount: 0,
  renderedPawnCount: 0,
  badgeValue: null,
});
assert.deepEqual(getWorkerIndicatorPresentation(3), {
  activeWorkerCount: 3,
  renderedPawnCount: 3,
  badgeValue: null,
});
assert.deepEqual(getWorkerIndicatorPresentation(7), {
  activeWorkerCount: 7,
  renderedPawnCount: 5,
  badgeValue: 7,
});

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
old.gameStateSchemaVersion = 4;
assert.throws(() => deserializeGameState(old), /expected v5/);

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
  oldSave.meta.schemaVersion = 4;
  storage.set(saveKey, JSON.stringify(oldSave));
  assert.equal(runner.loadFromSlot(1).reason, "versionMismatch");
} finally {
  if (priorLocalStorage === undefined) {
    delete globalThis.localStorage;
  } else {
    globalThis.localStorage = priorLocalStorage;
  }
}

console.log("[world-state-v5] OK");
