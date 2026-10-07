import { createSaveTestStorage } from '../../../scripts/save-test-storage.mjs';
import { ActionKinds } from "../actions.js";
import { getVassalCandidatePool } from "../vassal-life-map.js";
import { createNewGameState } from "../new-game.js";
import { createStarterBootProfile } from "../starter-boot-profile.js";
import { createGameSessionController } from "../../controllers/game-session-controller.js";
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
import { GRAPH_METRICS, getGraphMetric } from "../graph-metrics.js";
import {
  getSettlementFaithTooltipSpec,
  getSettlementFreePopulationTooltipSpec,
  getSettlementMonstersTooltipSpec,
  getSettlementPopulationTooltipSpec,
} from "../graph-metrics/tooltips.js";
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
import { createTimeGraphController } from "../timegraph-controller.js";
import { createProjectionCache } from "../timegraph/projection-cache.js";
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
assert.equal(state.gameStateSchemaVersion, 29);
const invalidPracticeTierState = serializeGameState(state);
invalidPracticeTierState.world.sites[0].detailedState.practiceSlots.find(Boolean).tier = "platinum";
assert.equal(validateWorldState(invalidPracticeTierState).ok, false,
  "practice slots reject tiers outside Bronze through Diamond");
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
assert.deepEqual(
  getDetailedSettlementSites(state).map((site) => ({
    regionId: site.regionId,
    adults: site.detailedState.populationByClass.villager.adults,
    practices: site.detailedState.practiceSlots.map((slot) => slot?.practiceId ?? null),
    structures: site.detailedState.structureSlots.slice(0, 2).map((slot) => slot?.structureId ?? null),
  })),
  [
    { regionId: "cedar-woods", adults: 20, practices: ["forage", ...Array(4).fill(null)], structures: ["granary", "mudHouses"] },
    ...["west-levee", "upper-floodplain", "river-crown", "lake-country"].map((regionId) => ({
      regionId,
      adults: 20,
      practices: ["forage", ...Array(4).fill(null)],
      structures: ["granary", "mudHouses"],
    })),
  ],
  "Cultivate_01 authored settlements retain their profile-specific starting state"
);
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
  assert.equal(view.elderOrder.resistance, 13);
  assert.equal(view.usedStructureCapacity, 2);
  assert.equal(view.storedFood, 2);
  assert.deepEqual(view.workerPool, {
    availableWorkerCount: 2,
    activeWorkerCount: 2,
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
getDetailedSettlement(preTransferBoundary.state, "cedar-woods").practiceSlots[0].stock = 5;
for (const regionId of ["west-levee", "upper-floodplain", "river-crown", "lake-country"]) {
  const settlement = getDetailedSettlement(preTransferBoundary.state, regionId);
  settlement.practiceSlots[0].stock = 0;

}
const preTransferStateData = serializeGameState(preTransferBoundary.state);
const transferBatch = buildEdgeTransferBatchAtBoundary(
  preTransferBoundary.state,
  14
);
assert.equal(transferBatch.transfers.length, 0, "Stock is not routed by legacy Administration");
assert.deepEqual(
  serializeGameState(preTransferBoundary.state),
  preTransferStateData,
  "edge-transfer selection is pure"
);
for (const transfer of transferBatch.transfers) {
  assert.equal(transfer.systemId, "migration");
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
assert.deepEqual(getEdgeTransferPacketGlyphSpec("food").icons, ['Edible']);
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
    adults: 100,
    elders: 15,
    total: 115,
    mealDemand: 5,
    housingCapacity: 150,
  }
);
assert.deepEqual(civilizationSummary.food, {
  stored: 10,
  loose: 0,
  total: 10,
  storedCapacity: 25,
});
assert.equal(civilizationSummary.population.byClass.villager.total, 115);
assert.equal(civilizationSummary.population.byClass.stranger.total, 0);

const filteredState = deserializeGameState(serializeGameState(state));
filteredState.world.regions.find(
  (region) => region.id === "lake-country"
).controller = "external-a";
assert.equal(getDetailedCivilizationSummary(filteredState).settlementCount, 4);
assert.equal(getDetailedCivilizationSummary(filteredState).population.total, 92);

const roundedFoodState = deserializeGameState(serializeGameState(state));
getDetailedSettlement(roundedFoodState, "cedar-woods").practiceSlots[0].stock = 1;
getDetailedSettlement(roundedFoodState, "west-levee").practiceSlots[0].stock = 1;
getDetailedSettlement(roundedFoodState, "upper-floodplain").practiceSlots[0].stock = 1;
getDetailedSettlement(roundedFoodState, "river-crown").practiceSlots[0].stock = 0;
getDetailedSettlement(roundedFoodState, "lake-country").practiceSlots[0].stock = 0;
assert.equal(getDetailedCivilizationSummary(roundedFoodState).food.stored, 3);

const civilizationSeries = GRAPH_METRICS.civilization.getSeries(null, state);
state.civilization.chaos.lastMoonIncome = {
  rawPressure: 12.5,
  resistance: 3,
};
const localSeries = GRAPH_METRICS.settlement.getSeries(
  { regionId: "cedar-woods" },
  state
);
assert.equal(
  civilizationSeries.find((series) => series.id === "totalPopulation")
    .getValue(state),
  115
);
assert.equal(
  civilizationSeries.find((series) => series.id === "chaosRawPressure").getValue(state),
  12.5
);
assert.equal(
  civilizationSeries.find((series) => series.id === "chaosResistance").getValue(state),
  3
);
assert.equal(
  civilizationSeries.find((series) => series.id === "chaosRawPressure").scaleGroupId,
  civilizationSeries.find((series) => series.id === "chaosResistance").scaleGroupId,
  "raw Chaos pressure and Chaos resistance share a scale for direct comparison"
);
assert.equal(
  localSeries.find((series) => series.id === "totalPopulation")
    .getValue(state, { regionId: "cedar-woods" }),
  23
);
const legendState = deserializeGameState(serializeGameState(state));
getDetailedSettlement(legendState, "cedar-woods").populationByClass.villager.adults = 41;
const legendSeries = GRAPH_METRICS.settlement.getSeries({ regionId: "cedar-woods" }, legendState);
function legendAdults(spec) {
  const line = spec.lines.find((entry) => entry.startsWith("Adults: "));
  return Number(line.slice("Adults: ".length));
}
const legendTotal = legendSeries.find((series) => series.id === "totalPopulation");
const cedarAdults = legendAdults(legendTotal.getLegendTooltipSpec(legendState, "cedar-woods"));
const capitalAdults = legendAdults(legendTotal.getLegendTooltipSpec(legendState, { regionId: "river-crown" }));
assert.equal(cedarAdults, capitalAdults + 21);
assert.equal(legendAdults(legendTotal.getLegendTooltipSpec(legendState)), capitalAdults);
const legendVillager = legendSeries.find((series) => series.id === "population:villager");
assert.equal(legendAdults(legendVillager.getLegendTooltipSpec(legendState, { regionId: "cedar-woods" })), 41);
assert.equal(legendAdults(legendVillager.getLegendTooltipSpec(legendState)), 20);
const legendFree = legendSeries.find((series) => series.id === "freePopulation:villager");
assert.notEqual(
  legendFree.getLegendTooltipSpec(legendState, "cedar-woods").lines[0],
  legendFree.getLegendTooltipSpec(legendState, "river-crown").lines[0]
);
const legendCivilization = GRAPH_METRICS.civilization.getSeries(null, legendState)
  .find((series) => series.id === "population:villager");
assert.ok(legendAdults(legendCivilization.getLegendTooltipSpec(legendState, "cedar-woods")) > 41);
assert.equal(
  localSeries.some((series) => series.id === "chaosPower"),
  true,
  "Chaos remains available from the local graph's group controls"
);
const localFoodTooltip = localSeries
  .find((series) => series.id === "food")
  .getLegendTooltipSpec(state);
assert.equal(
  localFoodTooltip.lines.some(
    (line) => /floodplain|hub food|in fields/i.test(line)
  ),
  false,
  "detailed food tooltip uses stored/loose copy, not hub floodplain stockpiles"
);
assert.match(
  localFoodTooltip.lines[0],
  /Hosted|Edible/i
);
assert.equal(civilizationSeries.find((series) => series.id === "monsterCount").scaleMode, "fixed");
assert.equal(civilizationSeries.find((series) => series.id === "monsterCount").scaleMax, 15);
assert.equal(civilizationSeries.find((series) => series.id === "civilizationHousingCapacity").getValue(state), 150);
assert.equal(localSeries.find((series) => series.id === "housingCapacity").getValue(state, { regionId: "cedar-woods" }), 30);
const fundedState = deserializeGameState(serializeGameState(state));
getDetailedSettlement(fundedState, "cedar-woods").practiceSlots[1] = {practiceId:"barter",tier:"bronze",stock:3};
getDetailedSettlement(fundedState, "river-crown").practiceSlots[1] = {practiceId:"barter",tier:"bronze",stock:4};
const fundedSummary = buildProjectionSummaryFromState(fundedState);
assert.equal(civilizationSeries.find((series) => series.id === "gold").getValue(fundedState), 7,
  "Gold sums actual settlement currency, independently of the obsolete global gold resource");
assert.equal(localSeries.find((series) => series.id === "gold").getValue(fundedState, { regionId: "cedar-woods" }), 3);
for (const [seriesList, subject] of [[civilizationSeries, null], [localSeries, { regionId: "cedar-woods" }]]) {
  for (const series of seriesList) {
    assert.equal(series.getValueFromSummary(fundedSummary, subject), series.getValueFromSnapshot(fundedState, subject),
      `${series.id} survives forecast snapshot eviction with the correct scope`);
  }
}
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
assert.equal(projectionSummary.graphValues.civilization.totalPopulation, 115);
assert.equal(projectionSummary.graphValues.civilization.chaosRawPressure, 12.5);
assert.equal(projectionSummary.graphValues.civilization.chaosResistance, 3);
assert.equal(
  projectionSummary.graphValues.settlementByRegion["cedar-woods"]
    .totalPopulation,
  23
);

const oversizedBoard = serializeGameState(state);
oversizedBoard.world.sites[0].detailedState.practiceSlots.push(null);
assert.throws(() => deserializeGameState(oversizedBoard), /must have 5 practice slots/,
  "serialized boards cannot exceed the fixed five-slot limit");
const roundTrip = deserializeGameState(serializeGameState(state));
assert.deepEqual(serializeGameState(roundTrip), serializeGameState(state));
const serializedText = JSON.stringify(serializeGameState(state));
for (const removedKey of ["elderCouncil", "agendaByClass", "installedPracticeIds", "activeEnvEventRuns"]) {
  assert.equal(serializedText.includes(removedKey), false, `legacy state absent: ${removedKey}`);
}
const old = serializeGameState(state);
old.gameStateSchemaVersion = 26;
assert.throws(() => deserializeGameState(old), /expected v29/);

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

state.gameConfig.settings.values.primordialBasePressure=0;
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

const graphRefreshBase=createInitialState("devPlaytesting01",24680);
graphRefreshBase.gameConfig.settings.values.primordialBasePressure=0;
const graphRefreshTimeline=createTimelineFromInitialState(graphRefreshBase);
let graphRefreshCursorState = rebuildStateAtSecond(
  graphRefreshTimeline,
  0
).state;
const graphRefreshController = createTimeGraphController({
  getTimeline: () => graphRefreshTimeline,
  getCursorState: () => graphRefreshCursorState,
  metric: GRAPH_METRICS.civilization,
  projectionCache: createProjectionCache(),
  forecastStepSec: 1,
  horizonSec: 96,
});
graphRefreshController.setSubject(null, "civilization");
graphRefreshController.setActive(true);
assert.equal(graphRefreshController.ensureForecastCoverageTo(64).ok, true);
graphRefreshTimeline.historyEndSec = 32;
graphRefreshTimeline.cursorSec = 32;
graphRefreshCursorState = rebuildStateAtSecond(
  graphRefreshTimeline,
  32
).state;
const graphRefreshResult =
  graphRefreshController.refreshAuthoritativeRangeFrom(0);
assert.deepEqual(
  {
    ok: graphRefreshResult.ok,
    startSec: graphRefreshResult.startSec,
    historyEndSec: graphRefreshResult.historyEndSec,
  },
  { ok: true, startSec: 0, historyEndSec: 32 },
  "committed forecast spans can be re-materialized from authoritative replay"
);
const refreshedFrontierValues = graphRefreshController
  .getSeriesValuesForSeconds([32], { focus: true })
  .get(32);
assert.deepEqual(
  refreshedFrontierValues,
  buildProjectionSummaryFromState(graphRefreshCursorState).graphValues
    .civilization,
  "authoritative graph refresh exposes the replayed frontier values"
);

// Player starts retain the fixed map and roll only eligible connected pairs.
const starterProfile = createStarterBootProfile();
const startingPairs = new Set();
for (let seed = 1; seed <= 64; seed += 1) {
  const fresh = createNewGameState(seed * 7919);
  const players = fresh.world.regions.filter((region) => region.controller === "player");
  assert.equal(players.length, 2);
  assert.equal(fresh.world.sites.length, 6);
  const ids = players.map((region) => region.id).sort();
  startingPairs.add(ids.join("|"));
  assert.ok(fresh.world.connections.some((edge) =>
    [edge.regionAId, edge.regionBId].sort().join("|") === ids.join("|")));
  assert.deepEqual(fresh.world.connections, starterProfile.mapLab.connections);
  assert.ok(players.every((region) => region.detailedSettlementEnabled));
  assert.ok(ids.includes(fresh.civilization.capitalRegionId));
  assert.deepEqual(serializeGameState(fresh), serializeGameState(createNewGameState(seed * 7919)));
  assert.deepEqual(serializeGameState(deserializeGameState(serializeGameState(fresh))), serializeGameState(fresh));
}
assert.equal(startingPairs.size, starterProfile.mapLab.connections.length, "seed coverage reaches all fixed-map roads");
const freshRun = createNewGameState(735);
const freshTimeline = createTimelineFromInitialState(freshRun);
assert.deepEqual(serializeGameState(rebuildStateAtSecond(freshTimeline, 12).state),
  serializeGameState(rebuildStateAtSecond(createTimelineFromInitialState(createNewGameState(735)), 12).state));

const storage = createSaveTestStorage();
try {
  const runner = createSimRunner({ setupId: "devPlaytesting01" });
  assert.equal(runner.init().ok, true);
  runner.rememberCivilizationSurvivalYear(91);
  assert.equal((await runner.saveToSlot(1)).ok, true);
  assert.equal(runner.resetToSetup("devPlaytesting01").ok, true);
  assert.equal(
    runner.getState().persistentKnowledge.maxObservedCivilizationSurvivalYear,
    null,
    "a new run resets the record"
  );
  assert.equal((await runner.loadFromSlot(1)).ok, true);
  assert.equal(
    runner.getState().persistentKnowledge.maxObservedCivilizationSurvivalYear,
    91,
    "save/load restores the record"
  );
  const session = createGameSessionController({ runner });
  assert.equal(session.isInMenu(), true);
  assert.equal((await session.newGame(2)).ok, true);
  assert.equal(session.getActiveSlot(), 2);
  const candidatePool = getVassalCandidatePool(runner.getState());
  assert.equal(runner.dispatchActionAtCurrentSecond(ActionKinds.SETTLEMENT_SELECT_VASSAL, {
    candidateIndex: 0, expectedPoolHash: candidatePool.expectedPoolHash,
  }).ok, true);
  runner.setPaused(false);
  for (let second = 0; second < 12; second += 1) runner.update(1);
  assert.ok(runner.getState().tSec > 0, "save contains progressed simulation");
  assert.equal(session.openMenu(), true);
  await session.save();
  const slot2 = await storage.get(2);
  assert.equal((await session.newGame(3)).ok, true);
  assert.ok(await storage.get(2) === slot2, "starting slot 3 preserves slot 2");
  assert.equal((await session.continueGame(2)).ok, true);
  assert.equal(runner.getState().rng.baseSeed, JSON.parse(slot2).state.rng.baseSeed);
  const savedSlot2 = JSON.parse(slot2);
  assert.equal(runner.getState().tSec, savedSlot2.state.tSec);
  assert.ok(JSON.stringify(serializeGameState(runner.getState()).world) === JSON.stringify(savedSlot2.state.world),
    "load restores progressed settlements");
  assert.ok(JSON.stringify(serializeGameState(runner.getState()).civilization) === JSON.stringify(savedSlot2.state.civilization),
    "load restores the selected Vassal and civilization");
  const beforeBadLoad = serializeGameState(runner.getState());
  await storage.set(3, "{broken");
  assert.equal((await runner.loadFromSlot(3)).ok, false);
  assert.deepEqual(serializeGameState(runner.getState()), beforeBadLoad);
  storage.fail(new DOMException("quota", "QuotaExceededError"));
  assert.equal((await session.save()).reason, "storageFailed");
  assert.equal(session.openMenu(), true, 'recovery controls remain reachable when saving fails');
  await session.save();
  storage.fail(null);
  const oldSave = JSON.parse(await storage.get(1));
  oldSave.meta.schemaVersion = 6;
  await storage.set(1, JSON.stringify(oldSave));
  assert.equal((await runner.loadFromSlot(1)).reason, "versionMismatch");
} finally {
  storage.restore();
}

assert.equal(getGraphMetric("not-a-metric"), null);
assert.equal(getGraphMetric("gold"), GRAPH_METRICS.gold);
assert.ok(GRAPH_METRICS.gold);
const populationTooltip = getSettlementPopulationTooltipSpec(state);
assert.ok(populationTooltip.lines.some((line) => line.startsWith("Children:")));
assert.ok(!populationTooltip.lines.some((line) => line.includes("Youth")));
const villagerPopulation = getSettlementPopulationTooltipSpec(state, "villager", "civilization");
assert.ok(villagerPopulation.title.startsWith("Villager"));
assert.ok(villagerPopulation.lines.some((line) => line.startsWith("Children:")));
const freeTooltip = getSettlementFreePopulationTooltipSpec(state, "villager", "civilization");
assert.deepEqual(freeTooltip.lines.map((line) => line.split(":")[0]), ["Free population", "Assigned workers"]);
const monsterTooltip = getSettlementMonstersTooltipSpec(state);
assert.ok(monsterTooltip.lines.some((line) => line.startsWith("Current monsters:")));
assert.ok(!monsterTooltip.lines.some((line) => line.includes("every 0s") || line.includes("/100")));
const faithTooltip = getSettlementFaithTooltipSpec(state);
assert.ok(faithTooltip.lines.some((line) => line.includes("Faith moon")));
assert.ok(!faithTooltip.lines.some((line) => line.toLowerCase().includes("spring")));

console.log("[world-state-v19] OK");
