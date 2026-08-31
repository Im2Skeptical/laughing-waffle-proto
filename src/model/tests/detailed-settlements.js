import assert from "node:assert/strict";
import { createInitialState } from "../init.js";
import {
  assignDetailedSettlementWorkers,
  buildDetailedVassalSelectionPool,
  evaluateDetailedPracticeSlot,
  getDetailedCivilizationSummary,
  getGreenAscendancySummary,
  getDetailedSettlement,
  getDetailedSettlementViewModel,
  getDetailedVassalInterventionEffectSec,
  getElderMortalityRate,
  getHousingCapacity,
  getPopulationSummary,
  getPrimordialChaosPressure,
  getStoredFoodCapacity,
  planDetailedAdministrationMoves,
  resolveProbability,
  selectDetailedVassalCandidate,
  stepDetailedSettlementsSecond,
  validateDetailedPracticeDefinitions,
} from "../detailed-settlements.js";
import { buildEdgeTransferBatchAtBoundary } from "../edge-transfers.js";
import { serializeGameState } from "../state.js";
import { deserializeGameState } from "../state.js";
import {
  getRegionState,
  getWorldConnectionCandidates,
  getWorldDefinition,
} from "../world-state.js";
import {
  createTimelineFromInitialState,
  rebuildStateAtSecond,
} from "../timeline/index.js";
import {
  getSettlementSelectedVassalRealizedSegments,
  getSettlementVassalBoundarySeconds,
} from "../settlement-state.js";
import { getMoonPhaseAtSecond } from "../moon-phases.js";
import { DETAILED_PRACTICE_SLOT_COUNT } from "../../defs/gamepieces/detailed-settlement-defs.js";
import { ActionKinds, applyAction } from "../actions.js";
import {
  getCurrentLifeMapVassal,
  getVassalCandidatePool,
  getVassalLifeMapNodes,
  getVassalLifeMapOutgoingNodeIds,
  getVassalPrestigeIncome,
} from "../vassal-life-map.js";

function fresh(seed = 12345) {
  return createInitialState("devPlaytesting01", seed);
}

function clearDetailedPopulationAndFood(state) {
  for (const site of state.world.sites) {
    const settlement = site.detailedState;
    settlement.practiceSlots = Array.from({ length: DETAILED_PRACTICE_SLOT_COUNT }, () => null);
    settlement.storedFood = 0;
    settlement.looseFood = 0;
    for (const classState of Object.values(settlement.populationByClass)) {
      classState.children = 0;
      classState.adults = 0;
      classState.eldersByAge = [];
      classState.faith = { tier: "gold" };
      classState.happiness = {
        status: "neutral",
        fullFeedStreak: 0,
        missedFeedStreak: 0,
        partialFeedRatios: [],
      };
    }
  }
  return state;
}

function disableMonthlyDemographics(state) {
  for (const id of [
    "birthRateBronze", "birthRateSilver", "birthRateGold", "birthRateDiamond",
    "childToAdultRate", "adultToElderRate",
  ]) {
    state.gameConfig.settings.values[id] = 0;
  }
  return state;
}

assert.equal(validateDetailedPracticeDefinitions().ok, true);
const state = fresh();
assert.equal(getGreenAscendancySummary(state).tier, 0);
state.year = 100;
assert.equal(getGreenAscendancySummary(state).tier, 1, "Green I begins at Year 100");
state.gameConfig.settings.values.greenAutomaticTier = false;
state.gameConfig.settings.values.greenForcedTier = 3;
assert.equal(getGreenAscendancySummary(state).tier, 3, "debug can force Green tier");
assert.deepEqual(
  ["cedar-woods", "west-levee", "upper-floodplain", "river-crown", "lake-country"]
    .map((id) => evaluateDetailedPracticeSlot(state, id, 0)
      .effects[0].scaledValue.evaluatorScore),
  [1, 3, 3, 3, 1]
);
const primordial = fresh(8896);
assert.equal(getPrimordialChaosPressure(primordial), 100);
primordial.year = 12;
assert.equal(getPrimordialChaosPressure(primordial), 100,
  "Primordial growth waits until a full cadence has elapsed");
primordial.year = 13;
assert.equal(getPrimordialChaosPressure(primordial), 103);
primordial.gameConfig.settings.values.primordialBasePressure = 4;
primordial.gameConfig.settings.values.primordialGrowthFactor = 2;
primordial.gameConfig.settings.values.primordialGrowthCadenceYears = 3;
primordial.year = 7;
assert.equal(getPrimordialChaosPressure(primordial), 16,
  "Primordial base, factor, and cadence are configurable without a cap");
assert.deepEqual(assignDetailedSettlementWorkers(state, "river-crown")
  .map((entry) => entry.effectiveWorkers), [2, 0, 0, 0, 0]);
const strangerWorkers = fresh();
const strangerSite = getDetailedSettlement(strangerWorkers, "river-crown");
strangerSite.populationByClass.villager.adults = 0;
strangerSite.populationByClass.villager.eldersByAge = [];
strangerSite.populationByClass.stranger.adults = 20;
assert.equal(assignDetailedSettlementWorkers(strangerWorkers, "river-crown")[0].effectiveWorkers, 1);

assert.equal(getStoredFoodCapacity(state, "upper-floodplain"), 180);
assert.equal(getHousingCapacity(state, "upper-floodplain"), 35);
getDetailedSettlement(state, "upper-floodplain").structureSlots[3] = { structureId: "granary" };
getDetailedSettlement(state, "upper-floodplain").structureSlots[4] = { structureId: "mudHouses" };
assert.equal(getStoredFoodCapacity(state, "upper-floodplain"), 720);
assert.equal(getHousingCapacity(state, "upper-floodplain"), 140);

const cultivate = fresh();
cultivate.currentSeasonIndex = 1;
cultivate._seasonChanged = true;
stepDetailedSettlementsSecond(cultivate, 8);
assert.deepEqual(
  ["cedar-woods", "west-levee", "upper-floodplain", "river-crown", "lake-country"]
    .map((id) => getDetailedSettlement(cultivate, id).storedFood),
  [47, 180, 180, 180, 180]
);
assert.deepEqual(
  ["cedar-woods", "west-levee", "upper-floodplain", "river-crown", "lake-country"]
    .map((id) => getDetailedSettlement(cultivate, id).looseFood),
  [0, 937, 937, 937, 217]
);

const cultivateTiming = clearDetailedPopulationAndFood(fresh());
const cultivateTimingSite = getDetailedSettlement(cultivateTiming, "cedar-woods");
cultivateTimingSite.practiceSlots = [
  { practiceId: "cultivate", charge: 0, work: 0 }, null, null, null, null,
];
cultivateTiming.currentSeasonIndex = 0;
cultivateTiming._seasonChanged = true;
stepDetailedSettlementsSecond(cultivateTiming, 8);
assert.equal(cultivateTimingSite.storedFood, 0, "Cultivate does not activate in Spring");
cultivateTiming.currentSeasonIndex = 1;
cultivateTiming._seasonChanged = true;
stepDetailedSettlementsSecond(cultivateTiming, 16);
assert.equal(cultivateTimingSite.storedFood, 120, "zero-worker Cultivate keeps its base value");

const forageTiming = clearDetailedPopulationAndFood(fresh(8890));
const forageSource = getDetailedSettlement(forageTiming, "cedar-woods");
const forageDestination = getDetailedSettlement(forageTiming, "west-levee");
forageSource.practiceSlots[0] = { practiceId: "forage", charge: 0, work: 0 };
forageSource.practiceSlots[1] = { practiceId: "administrate", charge: 0, work: 0 };
forageDestination.populationByClass.villager.adults = 10;
const forageProjectionBefore = serializeGameState(forageTiming);
const forageTransfers = buildEdgeTransferBatchAtBoundary(forageTiming, 2).transfers
  .filter((transfer) => transfer.systemId === "administrate");
assert.equal(forageTransfers.reduce((sum, transfer) => sum + transfer.amount, 0), 5,
  "projection includes pre-routing Forage in the same Food phase");
assert.deepEqual(serializeGameState(forageTiming), forageProjectionBefore,
  "projecting Forage does not mutate authoritative state");
stepDetailedSettlementsSecond(forageTiming, 2);
assert.equal(forageDestination.lastMeal.consumed, 5,
  "unstaffed Forage produces its base 5 before same-phase Administration routing");
assert.equal(forageSource.storedFood + forageSource.looseFood, 0);
const staffedForage = clearDetailedPopulationAndFood(fresh(8891));
const staffedForageSite = getDetailedSettlement(staffedForage, "cedar-woods");
staffedForageSite.practiceSlots[0] = { practiceId: "forage", charge: 0, work: 0 };
staffedForageSite.populationByClass.villager.adults = 10;
stepDetailedSettlementsSecond(staffedForage, 2);
assert.equal(staffedForageSite.lastMeal.consumed, 10,
  "one Villager worker raises Forage from 5 to 10");
const configuredForage = clearDetailedPopulationAndFood(fresh(8895));
const configuredForageSite = getDetailedSettlement(configuredForage, "cedar-woods");
configuredForageSite.practiceSlots[0] = { practiceId: "forage", charge: 0, work: 0 };
configuredForageSite.populationByClass.villager.adults = 10;
configuredForage.gameConfig.gamepieces.practices.forage.effects[0]
  .scaledValue.baseAmount = 7;
const configuredForageReload = deserializeGameState(serializeGameState(configuredForage));
stepDetailedSettlementsSecond(configuredForage, 2);
stepDetailedSettlementsSecond(configuredForageReload, 2);
assert.equal(
  configuredForageSite.lastMeal.consumed
    + configuredForageSite.storedFood
    + configuredForageSite.looseFood,
  14,
  "Forage output remains configurable through serialized gamepiece data");
assert.deepEqual(serializeGameState(configuredForageReload), serializeGameState(configuredForage));

const multiplierState = fresh();
const multiplierSite = getDetailedSettlement(multiplierState, "west-levee");
multiplierSite.populationByClass.villager.adults = 10;
multiplierSite.populationByClass.villager.eldersByAge = [];
multiplierSite.populationByClass.stranger.adults = 10;
const multiplierEvaluation = evaluateDetailedPracticeSlot(multiplierState, "west-levee", 0);
assert.equal(multiplierEvaluation.effects[0].scaledValue.workerMultiplier, 2.5,
  "one Villager and one Stranger worker produce a x2.5 multiplier");
multiplierSite.practiceSlots[0].tier = "gold";
assert.equal(evaluateDetailedPracticeSlot(multiplierState, "west-levee", 0).workerCapacity, 7,
  "Gold practices add four worker slots to their Bronze capacity");

const decay = fresh();
const decaySite = getDetailedSettlement(decay, "cedar-woods");
for (const site of decay.world.sites) {
  site.detailedState.practiceSlots = Array.from({ length: DETAILED_PRACTICE_SLOT_COUNT }, () => null);
}
decaySite.practiceSlots = [
  { practiceId: "preserve", charge: 0, work: 0 }, null, null, null, null,
];
stepDetailedSettlementsSecond(decay, 6);
assert.equal(decaySite.storedFood, 57.6,
  "two Preservation workers reduce the 10% stored decay loss by 60%");
assert.equal(decaySite.looseFood, 0, "Preservation does not change loose-food decay");

const build = fresh();
const buildSite = getDetailedSettlement(build, "river-crown");
buildSite.structureSlots = buildSite.structureSlots.map(() => ({ structureId: "granary" }));
buildSite.practiceSlots = [
  { practiceId: "raiseHouses", tier: "bronze", charge: 0, work: 0 }, null, null, null, null,
];
stepDetailedSettlementsSecond(build, 1);
assert.equal(buildSite.practiceSlots[0].work, 1);
assert.equal(buildSite.structureSlots.filter(Boolean).length, buildSite.structureSlots.length,
  "full structure capacity makes completed work wait");
const buildSlotIndex = buildSite.structureSlots.length - 1;
buildSite.structureSlots[buildSlotIndex] = null;
stepDetailedSettlementsSecond(build, 7);
assert.equal(buildSite.structureSlots[buildSlotIndex].structureId, "mudHouses");
assert.ok(buildSite.practiceSlots[0], "Raise Houses remains as a repeatable Practice");

const route = fresh();
for (const site of route.world.sites) {
  site.detailedState.practiceSlots = Array.from({ length: DETAILED_PRACTICE_SLOT_COUNT }, () => null);
  site.detailedState.storedFood = 0;
  site.detailedState.looseFood = 0;
}
for (const id of ["cedar-woods", "west-levee", "upper-floodplain"]) {
  const site = getDetailedSettlement(route, id);
  site.practiceSlots = [
    { practiceId: "administrate", charge: 0, work: 0 }, null, null, null, null,
  ];
}
getDetailedSettlement(route, "cedar-woods").looseFood = 90;
getDetailedSettlement(route, "west-levee").populationByClass.villager.adults = 30;
getDetailedSettlement(route, "upper-floodplain").populationByClass.villager.adults = 30;
stepDetailedSettlementsSecond(route, 2);
assert.equal(getDetailedSettlement(route, "west-levee").lastMeal.consumed, 33);
assert.equal(getDetailedSettlement(route, "upper-floodplain").lastMeal.consumed, 0,
  "snapshot routing prevents same-moon Region01→03→06 transport");

const cultivateOwnership = fresh();
getRegionState(cultivateOwnership, "upper-floodplain").controller = "frontier";
assert.equal(
  evaluateDetailedPracticeSlot(cultivateOwnership, "west-levee", 0)
    .effects[0].scaledValue.evaluatorScore,
  1,
  "a non-player region breaks the same-colour connected component"
);

const baselineAdmin = clearDetailedPopulationAndFood(fresh());
const baselineAdminSource = getDetailedSettlement(baselineAdmin, "cedar-woods");
baselineAdminSource.practiceSlots = [
  { practiceId: "administrate", charge: 0, work: 0 }, null, null, null, null,
];
baselineAdminSource.looseFood = 200;
getDetailedSettlement(baselineAdmin, "west-levee").populationByClass.villager.children = 200;
const baselineAdminMoves = planDetailedAdministrationMoves(baselineAdmin);
assert.deepEqual(
  baselineAdminMoves.map(({ sourceId, destinationId, amount }) => ({
    sourceId, destinationId, amount,
  })),
  [{ sourceId: "cedar-woods", destinationId: "west-levee", amount: 50 }],
  "zero-worker Administration retains its base 50 shared cap"
);

getDetailedSettlement(baselineAdmin, "west-levee").populationByClass.villager.children = 0;
assert.deepEqual(planDetailedAdministrationMoves(baselineAdmin), [],
  "Administration does not move food merely to balance storage");

const splitAdmin = clearDetailedPopulationAndFood(fresh());
const splitSource = getDetailedSettlement(splitAdmin, "river-crown");
splitSource.practiceSlots = [
  { practiceId: "administrate", charge: 0, work: 0 }, null, null, null, null,
];
splitSource.looseFood = 200;
getDetailedSettlement(splitAdmin, "upper-floodplain")
  .populationByClass.villager.children = 60;
getDetailedSettlement(splitAdmin, "lake-country")
  .populationByClass.villager.children = 80;
assert.deepEqual(
  planDetailedAdministrationMoves(splitAdmin).map(
    ({ sourceId, destinationId, amount }) => ({ sourceId, destinationId, amount })
  ),
  [
    { sourceId: "river-crown", destinationId: "lake-country", amount: 40 },
    { sourceId: "river-crown", destinationId: "upper-floodplain", amount: 10 },
  ],
  "one shared cap splits across the greatest meal shortages first"
);

const preservedAdmin = clearDetailedPopulationAndFood(fresh());
const preservedSource = getDetailedSettlement(preservedAdmin, "cedar-woods");
preservedSource.practiceSlots = [
  { practiceId: "administrate", charge: 0, work: 0 },
  { practiceId: "preserve", charge: 0, work: 0 },
  null, null, null, null,
];
preservedSource.looseFood = 200;
const preservedDestination = getDetailedSettlement(preservedAdmin, "lake-country");
preservedDestination.practiceSlots = [
  { practiceId: "administrate", charge: 0, work: 0 },
  { practiceId: "administrate", charge: 0, work: 0 },
  null, null, null, null,
];
preservedDestination.populationByClass.villager.children = 200;
assert.deepEqual(planDetailedAdministrationMoves(preservedAdmin), [],
  "Administration defaults to adjacent-only even when Preservation is present");
preservedAdmin.gameConfig.gamepieces.practices.preserve.connectedAdministrationReach = true;
const preservedEvaluation = evaluateDetailedPracticeSlot(preservedAdmin, "cedar-woods", 0);
assert.equal(preservedEvaluation.effects[0].scaledValue.evaluatorScore, 2,
  "Administration presence is counted once per reachable region");
assert.deepEqual(
  planDetailedAdministrationMoves(preservedAdmin).map(
    ({ sourceId, destinationId, amount }) => ({ sourceId, destinationId, amount })
  ),
  [{ sourceId: "cedar-woods", destinationId: "lake-country", amount: 100 }],
  "local Preservation expands Administration across a player-controlled path"
);
preservedAdmin.gameConfig.gamepieces.practices.preserve.connectedAdministrationReach = false;
assert.deepEqual(planDetailedAdministrationMoves(preservedAdmin), [],
  "disabled Preservation reach leaves Administration limited to adjacent settlements");
getRegionState(preservedAdmin, "upper-floodplain").controller = "frontier";
assert.deepEqual(planDetailedAdministrationMoves(preservedAdmin), [],
  "non-player control breaks Preservation's Administration path");

const commerce = clearDetailedPopulationAndFood(fresh());
for (const id of ["cedar-woods", "west-levee", "upper-floodplain", "river-crown", "lake-country"]) {
  getDetailedSettlement(commerce, id).practiceSlots = [
    { practiceId: "caravanRoutes", charge: 0, work: 0 }, null, null, null, null,
  ];
}
getDetailedSettlement(commerce, "cedar-woods").practiceSlots[1] =
  { practiceId: "exchange", charge: 0, work: 0 };
getDetailedSettlement(commerce, "cedar-woods").populationByClass.villager.adults = 20;
const exchangeEvaluation = evaluateDetailedPracticeSlot(commerce, "cedar-woods", 1);
assert.equal(exchangeEvaluation.effects[0].scaledValue.evaluatorScore, 4,
  "Exchange counts different-colour regions across its Caravan component");
assert.deepEqual(exchangeEvaluation.effects[0].scaledValue.diagnostics.matchingRegionIds,
  ["west-levee", "upper-floodplain", "river-crown", "lake-country"]);
commerce._seasonChanged = true;
stepDetailedSettlementsSecond(commerce, 8);
assert.equal(getDetailedSettlement(commerce, "cedar-woods").currency, 12,
  "Exchange uses the normal base-plus-effective-worker multiplier");

const directCommerce = clearDetailedPopulationAndFood(fresh());
getDetailedSettlement(directCommerce, "cedar-woods").practiceSlots = [
  { practiceId: "exchange", charge: 0, work: 0 }, null, null, null, null,
];
getRegionState(directCommerce, "west-levee").controller = "frontier";
assert.equal(evaluateDetailedPracticeSlot(directCommerce, "cedar-woods", 0)
  .effects[0].scaledValue.evaluatorScore, 1,
"ordinary commercial adjacency includes a directly adjacent region regardless of controller");

const commerceReplay = clearDetailedPopulationAndFood(fresh(734));
for (const id of ["cedar-woods", "west-levee", "upper-floodplain", "river-crown", "lake-country"]) {
  getDetailedSettlement(commerceReplay, id).practiceSlots = [
    { practiceId: "caravanRoutes", charge: 0, work: 0 }, null, null, null, null,
  ];
}
getDetailedSettlement(commerceReplay, "cedar-woods").practiceSlots[1] =
  { practiceId: "exchange", charge: 0, work: 0 };
const commerceTimeline = createTimelineFromInitialState(commerceReplay);
const commerceReplayA = rebuildStateAtSecond(commerceTimeline, 8);
const commerceReplayB = rebuildStateAtSecond(commerceTimeline, 8);
assert.deepEqual(serializeGameState(commerceReplayA.state), serializeGameState(commerceReplayB.state),
  "Currency and commercial reach replay deterministically");

const localImport = disableMonthlyDemographics(clearDetailedPopulationAndFood(fresh()));
const localImportSite = getDetailedSettlement(localImport, "cedar-woods");
localImportSite.populationByClass.villager.adults = 10;
localImportSite.looseFood = 2;
localImportSite.currency = 5;
localImportSite.practiceSlots = [
  { practiceId: "import", charge: 0, work: 0 }, null, null, null, null,
];
stepDetailedSettlementsSecond(localImport, 1);
stepDetailedSettlementsSecond(localImport, 2);
assert.equal(localImportSite.lastMeal.consumed, 7,
  "Import adds only the affordable portion of the current meal shortfall");
assert.equal(localImportSite.currency, 0, "Import spends local Currency first");
assert.equal(localImportSite.looseFood, 0, "Import does not leave surplus Food");

const clearingImport = disableMonthlyDemographics(clearDetailedPopulationAndFood(fresh()));
for (const id of ["cedar-woods", "west-levee", "upper-floodplain", "river-crown", "lake-country"]) {
  getDetailedSettlement(clearingImport, id).practiceSlots = [
    { practiceId: "caravanRoutes", charge: 0, work: 0 }, null, null, null, null,
  ];
}
const clearingSite = getDetailedSettlement(clearingImport, "cedar-woods");
clearingSite.populationByClass.villager.adults = 10;
clearingSite.looseFood = 2;
clearingSite.currency = 3;
clearingSite.practiceSlots[1] = { practiceId: "clearingHouse", charge: 0, work: 0 };
clearingSite.practiceSlots[2] = { practiceId: "import", charge: 0, work: 0 };
getDetailedSettlement(clearingImport, "west-levee").currency = 9;
stepDetailedSettlementsSecond(clearingImport, 1);
stepDetailedSettlementsSecond(clearingImport, 2);
assert.equal(clearingSite.lastMeal.consumed, 10,
  "Clearing House makes commercially adjacent allied Currency available to Import");
assert.equal(clearingSite.currency, 0);
assert.equal(getDetailedSettlement(clearingImport, "west-levee").currency, 4,
  "Clearing House spends remote Currency after local Currency in authored region order");
const importedVm = getDetailedSettlementViewModel(clearingImport, "cedar-woods");
assert.equal(importedVm.currency, 0, "Currency is exposed in the local settlement view model");
assert.equal(importedVm.currencySpentThisMoon, 3,
  "Currency spending is exposed for world-map indicators");
assert.equal(getDetailedSettlementViewModel(clearingImport, "west-levee").currencySpentThisMoon, 5,
  "Remote import funding records the spending settlement");

const cappedPreservation = clearDetailedPopulationAndFood(fresh());
const cappedPreservationSite = getDetailedSettlement(cappedPreservation, "cedar-woods");
cappedPreservationSite.populationByClass.villager.adults = 40;
cappedPreservationSite.storedFood = 60;
cappedPreservationSite.looseFood = 20;
cappedPreservationSite.practiceSlots = [
  { practiceId: "preserve", charge: 0, work: 0 },
  { practiceId: "preserve", charge: 0, work: 0 },
  null, null, null, null,
];
stepDetailedSettlementsSecond(cappedPreservation, 6);
assert.equal(cappedPreservationSite.storedFood, 60,
  "combined Preservation is capped at a 100% stored-food decay reduction");
assert.equal(cappedPreservationSite.looseFood, 5,
  "even capped Preservation leaves loose-food decay unchanged");

assert.deepEqual([49, 50, 55, 60, 65, 70, 75].map(getElderMortalityRate),
  [0.0025, 0.005, 0.015, 0.04, 0.08, 0.16, 0.3]);
assert.equal(resolveProbability(0.2, { additive: [0.2], multipliers: [2] }), 0.8);
assert.equal(resolveProbability(0.8, { additive: [0.4], multipliers: [2] }), 1);

const partial = disableMonthlyDemographics(fresh(880));
partial.gameConfig.settings.values.partialFeedMemoryLength = 3;
const partialSite = getDetailedSettlement(partial, "cedar-woods");
for (const site of partial.world.sites) {
  site.detailedState.storedFood = 0;
  site.detailedState.looseFood = 0;
  site.detailedState.practiceSlots = Array.from({ length: DETAILED_PRACTICE_SLOT_COUNT }, () => null);
}
for (const [index, ratio] of [0.6, 0.7, 0.8].entries()) {
  const start = 1 + index * 6;
  stepDetailedSettlementsSecond(partial, start);
  partialSite.looseFood = getPopulationSummary(partial, "cedar-woods").mealDemand * ratio;
  stepDetailedSettlementsSecond(partial, start + 1);
  stepDetailedSettlementsSecond(partial, start + 2);
  stepDetailedSettlementsSecond(partial, start + 3);
}
assert.equal(partialSite.populationByClass.villager.happiness.status, "positive",
  "three rising partial meals improve happiness");

const underHalfFed = disableMonthlyDemographics(clearDetailedPopulationAndFood(fresh(8801)));
const underHalfSite = getDetailedSettlement(underHalfFed, "cedar-woods");
const underHalfClass = underHalfSite.populationByClass.villager;
underHalfClass.adults = 10;
underHalfClass.happiness.status = "positive";
underHalfSite.looseFood = 4.9;
stepDetailedSettlementsSecond(underHalfFed, 1);
stepDetailedSettlementsSecond(underHalfFed, 2);
assert.equal(underHalfSite.lastMeal.byClass.villager.ratio, 0.49);
assert.equal(underHalfSite.lastMeal.byClass.villager.targetHappiness, "neutral",
  "feeding less than half of a cohort always targets one happiness step lower");
assert.equal(underHalfClass.happiness.missedFeedStreak, 1,
  "an immediate happiness loss still advances the starvation streak");
assert.equal(underHalfSite.lastMeal.byClass.villager.migrants, 0,
  "the first missed meal does not put the unfed share into the migrant bucket");
for (const sec of [3, 4, 5, 6, 7]) stepDetailedSettlementsSecond(underHalfFed, sec);
underHalfSite.looseFood = 4.9;
stepDetailedSettlementsSecond(underHalfFed, 8);
assert.equal(underHalfClass.happiness.missedFeedStreak, 2);
assert.equal(underHalfSite.lastMeal.byClass.villager.migrants, 0,
  "the unfed share waits until the configured starvation trigger");
for (const sec of [9, 10, 11, 12, 13]) stepDetailedSettlementsSecond(underHalfFed, sec);
underHalfSite.looseFood = 4.9;
stepDetailedSettlementsSecond(underHalfFed, 14);
assert.equal(underHalfClass.happiness.missedFeedStreak, 3);
assert.equal(underHalfSite.lastMeal.byClass.villager.migrants, 6,
  "the triggering missed meal puts only the unfed share into the migrant bucket");
assert.deepEqual(
  getDetailedSettlementViewModel(underHalfFed, "cedar-woods").pressure,
  {
    starvation: true,
    starvationMigrants: 6,
    unfedMealDemand: 5.1,
    overcrowding: false,
    housingOverflow: 0,
  },
  "map pressure marks an actual starvation-triggering meal"
);

const halfFed = disableMonthlyDemographics(clearDetailedPopulationAndFood(fresh(8802)));
const halfFedSite = getDetailedSettlement(halfFed, "cedar-woods");
const halfFedClass = halfFedSite.populationByClass.villager;
halfFedClass.adults = 10;
halfFedClass.happiness.status = "positive";
halfFedSite.looseFood = 5;
stepDetailedSettlementsSecond(halfFed, 1);
stepDetailedSettlementsSecond(halfFed, 2);
assert.equal(halfFedSite.lastMeal.byClass.villager.ratio, 0.5);
assert.equal(halfFedSite.lastMeal.byClass.villager.targetHappiness, "positive",
  "feeding exactly half remains part of the partial-meal improvement rules");
assert.equal(halfFedClass.happiness.missedFeedStreak, 0);
assert.deepEqual(halfFedClass.happiness.partialFeedRatios, [0.5]);

const combined = disableMonthlyDemographics(clearDetailedPopulationAndFood(fresh(883)));
combined.gameConfig.gamepieces.structures.mudHouses.capacityPerCountSquared = 20;
const combinedSource = getDetailedSettlement(combined, "cedar-woods");
combinedSource.populationByClass.villager.adults = 100;
combinedSource.populationByClass.villager.happiness.missedFeedStreak = 2;
combinedSource.looseFood = 40;
combinedSource.structureSlots = [{ structureId: "mudHouses" }, null, null];
const combinedDestination = getDetailedSettlement(combined, "west-levee");
combinedDestination.storedFood = 100;
combinedDestination.structureSlots = combinedDestination.structureSlots
  .map(() => ({ structureId: "mudHouses" }));
for (const sec of [1, 2, 3, 4, 5, 6]) stepDetailedSettlementsSecond(combined, sec);
const combinedTurn = combined.civilization.currentMoonTurn;
assert.deepEqual(combinedTurn.migrationIntents.map((intent) => intent.reason), ["food", "housing"],
  "starvation migrants are reserved before housing selects from the remainder");
assert.deepEqual(combinedTurn.migrationIntents.map((intent) => intent.requested), [60, 20]);
assert.equal(combinedTurn.movements.reduce((sum, move) => sum + move.amount, 0), 80);
assert.equal(getPopulationSummary(combined, "cedar-woods").total, 20);
assert.equal(getPopulationSummary(combined, "west-levee").byClass.stranger.total, 80,
  "all migrant causes share destination and arrival rules");

const collapse = disableMonthlyDemographics(clearDetailedPopulationAndFood(fresh(881)));
const collapseSource = getDetailedSettlement(collapse, "cedar-woods");
collapseSource.populationByClass.villager.adults = 10;
collapseSource.populationByClass.villager.faith.tier = "bronze";
collapseSource.populationByClass.villager.happiness.status = "neutral";
collapseSource.populationByClass.villager.happiness.partialFeedRatios = [0.8];
collapseSource.looseFood = 7;
getDetailedSettlement(collapse, "west-levee").storedFood = 20;
for (const sec of [1, 2, 3, 4]) stepDetailedSettlementsSecond(collapse, sec);
assert.equal(collapseSource.populationByClass.villager.happiness.status, "negative");
assert.deepEqual(
  collapse.civilization.currentMoonTurn.migrationIntents.map((intent) => intent.reason),
  ["faith"],
  "an ordinary food shortfall stays out of the bucket while faith collapse still adds migrants"
);
assert.equal(collapse.civilization.currentMoonTurn.migrationIntents
  .reduce((sum, intent) => sum + intent.requested, 0), 3);
assert.equal(collapse.civilization.chaos.lastMoonIncome.incomingChaos, 99,
  "Primordial pressure contributes even without settlement-tax income");
assert.equal(collapse.civilization.chaos.lastMoonIncome.primordialPressure, 100);

const weightedLegacyLosses = clearDetailedPopulationAndFood(fresh(8897));
weightedLegacyLosses.gameConfig.settings.values.primordialBasePressure = 0;
weightedLegacyLosses.gameConfig.settings.values.oldAgeDeathChaosWeight = 2;
weightedLegacyLosses.gameConfig.settings.values.internalMigrationChaosWeight = 3;
weightedLegacyLosses.civilization.chaos.pendingLosses.oldAgeDeaths = 2;
weightedLegacyLosses.civilization.chaos.pendingLosses.internalMigrants = 4;
for (const sec of [1, 2, 3, 4]) stepDetailedSettlementsSecond(weightedLegacyLosses, sec);
assert.equal(weightedLegacyLosses.civilization.chaos.lastMoonIncome.oldAgeDeathPressure, 4);
assert.equal(weightedLegacyLosses.civilization.chaos.lastMoonIncome.internalMigrationPressure, 12);
assert.equal(weightedLegacyLosses.civilization.chaos.lastMoonIncome.rawPressure, 16,
  "existing nonzero legacy loss weights remain part of raw Primordial reckoning");
assert.equal(weightedLegacyLosses.civilization.chaos.lastMoonIncome.incomingChaos, 16);
for (const sec of [5, 6, 7, 8, 9, 10]) stepDetailedSettlementsSecond(weightedLegacyLosses, sec);
assert.equal(weightedLegacyLosses.civilization.chaos.chaosPower, 16,
  "resistance and zero incoming pressure never subtract accumulated Chaos");

const faithStreak = disableMonthlyDemographics(clearDetailedPopulationAndFood(fresh(884)));
const faithClass = getDetailedSettlement(faithStreak, "cedar-woods").populationByClass.villager;
faithClass.adults = 1;
faithClass.faith.tier = "silver";
faithClass.happiness.status = "positive";
for (let index = 0; index < 3; index += 1) {
  const start = 1 + index * 6;
  getDetailedSettlement(faithStreak, "cedar-woods").storedFood = 1;
  for (const sec of [start, start + 1, start + 2, start + 3]) {
    stepDetailedSettlementsSecond(faithStreak, sec);
  }
}
assert.equal(faithClass.faith.tier, "gold",
  "three positive Faith phases shift the tier once");

const hardship = disableMonthlyDemographics(clearDetailedPopulationAndFood(fresh(885)));
const hardshipSource = getDetailedSettlement(hardship, "cedar-woods");
hardshipSource.populationByClass.villager.adults = 10;
hardshipSource.populationByClass.villager.happiness.missedFeedStreak = 2;
hardship.gameConfig.settings.values.migrationHardshipDeathRate = 1;
for (const sec of [1, 2, 3, 4, 5, 6]) stepDetailedSettlementsSecond(hardship, sec);
assert.equal(getPopulationSummary(hardship, "cedar-woods").total, 0,
  "unplaced starvation migrants remain until Death and then take hardship mortality");
assert.equal(hardship.civilization.currentMoonTurn.regions["cedar-woods"]
  .death.hardshipDeaths, 10);

const rootedness = disableMonthlyDemographics(clearDetailedPopulationAndFood(fresh(8851)));
rootedness.gameConfig.settings.values.greenAutomaticTier = false;
rootedness.gameConfig.settings.values.greenForcedTier = 2;
rootedness.gameConfig.settings.values.migrationHardshipDeathRate = 0;
const rootedSource = getDetailedSettlement(rootedness, "west-levee");
rootedSource.populationByClass.villager.adults = 100;
rootedSource.populationByClass.villager.happiness.missedFeedStreak = 2;
for (const sec of [1, 2, 3, 4, 5, 6]) stepDetailedSettlementsSecond(rootedness, sec);
assert.equal(getPopulationSummary(rootedness, "west-levee").total, 25,
  "Green-blocked migrants stay at their source as unresolved migrants");
assert.equal(rootedness.civilization.chaos.pendingLosses.externalEmigrants, 75,
  "eligible migrants use direct external exits after player destinations");
const rootednessReloaded = deserializeGameState(serializeGameState(rootedness));
for (const sec of [7, 8, 9, 10]) {
  stepDetailedSettlementsSecond(rootedness, sec);
  stepDetailedSettlementsSecond(rootednessReloaded, sec);
}
assert.deepEqual(serializeGameState(rootednessReloaded), serializeGameState(rootedness),
  "pending Green/external loss accounting survives serialization and deterministic replay");
assert.equal(rootedness.civilization.chaos.lastMoonIncome.externalEmigrants, 75,
  "Faith consumes migration losses one moon later");
assert.equal(rootedness.civilization.chaos.lastMoonIncome.rawPressure, 175);
assert.equal(rootedness.civilization.chaos.lastMoonIncome.resistance, 12,
  "Faith resistance uses the surviving full cohort population");
assert.equal(rootedness.civilization.chaos.lastMoonIncome.incomingChaos, 163);

const greenPreservation = disableMonthlyDemographics(clearDetailedPopulationAndFood(fresh(8852)));
greenPreservation.gameConfig.settings.values.greenAutomaticTier = false;
greenPreservation.gameConfig.settings.values.greenForcedTier = 1;
greenPreservation.gameConfig.settings.values.greenStoredDecayReductionI = 100;
const preservationSite = getDetailedSettlement(greenPreservation, "cedar-woods");
preservationSite.storedFood = 10;
preservationSite.looseFood = 10;
stepDetailedSettlementsSecond(greenPreservation, 6);
assert.equal(preservationSite.storedFood, 10, "Green preservation affects stored food only");
assert.equal(preservationSite.looseFood, 2.5, "Green preservation leaves loose-food rot unchanged");

const greenLongevity = disableMonthlyDemographics(clearDetailedPopulationAndFood(fresh(8853)));
greenLongevity.gameConfig.settings.values.greenAutomaticTier = false;
greenLongevity.gameConfig.settings.values.greenForcedTier = 1;
greenLongevity.gameConfig.settings.values.greenElderMortalityReductionI = 100;
greenLongevity.gameConfig.settings.values.elderMortality75Plus = 1;
const longevityClass = getDetailedSettlement(greenLongevity, "cedar-woods").populationByClass.villager;
longevityClass.eldersByAge = [{ age: 75, count: 3 }];
stepDetailedSettlementsSecond(greenLongevity, 6);
assert.equal(longevityClass.eldersByAge[0].count, 3,
  "Green longevity reduces only the existing elder mortality roll");

const ageDeath = disableMonthlyDemographics(clearDetailedPopulationAndFood(fresh(886)));
const ageClass = getDetailedSettlement(ageDeath, "cedar-woods").populationByClass.villager;
ageClass.eldersByAge = [{ age: 75, count: 3 }];
ageDeath.gameConfig.settings.values.elderMortality75Plus = 1;
stepDetailedSettlementsSecond(ageDeath, 1);
stepDetailedSettlementsSecond(ageDeath, 6);
assert.equal(ageClass.eldersByAge.length, 0);
assert.equal(ageDeath.civilization.currentMoonTurn.regions["cedar-woods"]
  .death.byClass.villager.naturalDeaths, 3);

const slowerPhases = fresh(8871);
slowerPhases.gameConfig.settings.values.phaseDurationSec = 2;
assert.deepEqual(
  [1, 2, 3, 5, 7, 9, 11, 13].map((sec) => {
    const phase = getMoonPhaseAtSecond(slowerPhases, sec);
    return `${phase.id}:${phase.boundary}`;
  }),
  ["birth:true", "birth:false", "food:true", "housing:true", "faith:true",
    "migration:true", "death:true", "birth:true"],
  "phaseDurationSec expands each phase without changing its order"
);

const midMoonA = disableMonthlyDemographics(clearDetailedPopulationAndFood(fresh(8872)));
getDetailedSettlement(midMoonA, "cedar-woods").populationByClass.villager.adults = 12;
getDetailedSettlement(midMoonA, "cedar-woods").looseFood = 6;
for (const sec of [1, 2, 3]) stepDetailedSettlementsSecond(midMoonA, sec);
const midMoonB = deserializeGameState(serializeGameState(midMoonA));
for (const sec of [4, 5, 6]) {
  stepDetailedSettlementsSecond(midMoonA, sec);
  stepDetailedSettlementsSecond(midMoonB, sec);
}
assert.deepEqual(serializeGameState(midMoonA), serializeGameState(midMoonB),
  "serializing between Housing and Faith preserves the authoritative moon outcome");

const migrationTimelineState = disableMonthlyDemographics(clearDetailedPopulationAndFood(fresh(887)));
const timelineSource = getDetailedSettlement(migrationTimelineState, "cedar-woods");
timelineSource.populationByClass.villager.adults = 20;
timelineSource.populationByClass.villager.happiness.missedFeedStreak = 2;
timelineSource.looseFood = 8;
getDetailedSettlement(migrationTimelineState, "west-levee").storedFood = 5;
const migrationTimeline = createTimelineFromInitialState(migrationTimelineState);
const preMigrationBoundary = rebuildStateAtSecond(migrationTimeline, 4);
const migrationBatch = buildEdgeTransferBatchAtBoundary(preMigrationBoundary.state, 5);
const migrationTransfer = migrationBatch.transfers.find(
  (transfer) => transfer.resourceId === "population"
);
assert.deepEqual({
  amount: migrationTransfer.amount,
}, { amount: 12 });
assert.deepEqual(
  buildEdgeTransferBatchAtBoundary(
    rebuildStateAtSecond(migrationTimeline, 4).state,
    5
  ),
  migrationBatch,
  "migration packet reconstruction is replay deterministic"
);
assert.deepEqual(
  serializeGameState(preMigrationBoundary.state),
  serializeGameState(rebuildStateAtSecond(migrationTimeline, 4).state),
  "migration packet reconstruction does not mutate its boundary state"
);

const lifeMapState = fresh(777);
lifeMapState.paused = true;
lifeMapState.gameConfig.settings.values.primordialBasePressure = 0;
lifeMapState.civilization.chaos.monsterLossThreshold = 1000000;
const lifePool = getVassalCandidatePool(lifeMapState);
assert.equal(lifePool.candidates.length, 3);
assert.ok(lifePool.candidates.every((candidate) =>
  Number.isFinite(candidate.age) && Number.isFinite(candidate.prestige)
    && ["cunning", "wisdom", "effectiveness", "intelligence"].every(
      (statId) => Number.isFinite(candidate.stats?.[statId])
    )
));
assert.equal(applyAction(lifeMapState, {
  kind: ActionKinds.SETTLEMENT_SELECT_VASSAL,
  payload: { candidateIndex: 0, expectedPoolHash: lifePool.expectedPoolHash },
}, { isReplay: true }).ok, true);
let lifeVassal = getCurrentLifeMapVassal(lifeMapState);
const lifeNodes = getVassalLifeMapNodes(lifeVassal);
assert.equal(lifeNodes.filter((node) => node.family === "legacy").length, 1);
assert.ok(lifeVassal.lifeMap.availableNodeIds.length >= 2, "generated map has an opening choice");
for (const node of lifeNodes) {
  assert.ok(getVassalLifeMapOutgoingNodeIds(lifeVassal, node.id).every((id) =>
    lifeNodes.find((entry) => entry.id === id)?.depth === node.depth + 1
  ), `${node.id} has only forward edges`);
}
const patronageNodeId = lifeNodes.find((node) => node.family === "patronage").id;
lifeVassal.lifeMap.availableNodeIds = [patronageNodeId];
assert.equal(applyAction(lifeMapState, {
  kind: ActionKinds.VASSAL_ENTER_LIFE_NODE, payload: { nodeId: patronageNodeId },
}, { isReplay: true }).ok, true);
const patronageNode = lifeVassal.lifeMap.nodeStates[patronageNodeId];
assert.equal(patronageNode.entered, true);
const prestigeBefore = lifeVassal.prestige;
const incomeBefore = getVassalPrestigeIncome(lifeVassal);
assert.equal(applyAction(lifeMapState, {
  kind: ActionKinds.VASSAL_SELECT_LIFE_OPTION,
  payload: { nodeId: patronageNodeId, optionId: "cultivateConnections" },
}, { isReplay: true }).ok, true);
assert.equal(applyAction(lifeMapState, {
  kind: ActionKinds.VASSAL_CONFIRM_LIFE_NODE, payload: { nodeId: patronageNodeId },
}, { isReplay: true }).ok, true);
assert.equal(lifeVassal.prestige, prestigeBefore + 5,
  "option effects apply before the delayed completion income");
assert.equal(lifeVassal.stats.cunning >= 1, true);
const resolveSec = lifeVassal.lifeMap.pendingResolution.resolveSec;
for (let sec = 1; sec <= resolveSec; sec += 1) {
  lifeMapState.tSec = sec;
  stepDetailedSettlementsSecond(lifeMapState, sec);
}
lifeVassal = getCurrentLifeMapVassal(lifeMapState);
assert.equal(lifeVassal.lifeMap.nodeStates[patronageNodeId].resolved, true);
assert.equal(lifeVassal.prestige, prestigeBefore + 5 + incomeBefore + 1,
  "Cultivate Cunning affects the one recurring Prestige grant");
assert.equal(lifeVassal.lifeMap.nodeStates[patronageNodeId].mortality.roll >= 0, true);
assert.ok(lifeVassal.lifeMap.availableNodeIds.length >= 1);

const shopState = fresh(778);
shopState.paused = true;
const shopPool = getVassalCandidatePool(shopState);
applyAction(shopState, { kind: ActionKinds.SETTLEMENT_SELECT_VASSAL,
  payload: { candidateIndex: 0, expectedPoolHash: shopPool.expectedPoolHash } }, { isReplay: true });
let shopVassal = getCurrentLifeMapVassal(shopState);
shopVassal.prestige = 100;
const practiceNodeId = getVassalLifeMapNodes(shopVassal)
  .find((node) => node.family === "practiceReform").id;
shopVassal.lifeMap.availableNodeIds = [practiceNodeId];
applyAction(shopState, { kind: ActionKinds.VASSAL_ENTER_LIFE_NODE,
  payload: { nodeId: practiceNodeId } }, { isReplay: true });
const shopNode = shopVassal.lifeMap.nodeStates[practiceNodeId];
assert.equal(shopNode.inventory.length, 3);
const initialOfferIds = shopNode.inventory.map((offer) => offer.offerId);
applyAction(shopState, { kind: ActionKinds.VASSAL_PURCHASE_SHOP_OFFER,
  payload: { nodeId: practiceNodeId, offerId: initialOfferIds[0] } }, { isReplay: true });
assert.equal(shopNode.inventory.length, 2, "purchase removes without refilling");
assert.equal(shopNode.purchasedOfferIds.length, 1);
assert.equal(shopNode.mortality, undefined, "purchase does not resolve mortality");
applyAction(shopState, { kind: ActionKinds.VASSAL_REROLL_SHOP,
  payload: { nodeId: practiceNodeId } }, { isReplay: true });
assert.equal(shopNode.rerollUsed, false, "reroll is blocked while a purchase is staged");
applyAction(shopState, { kind: ActionKinds.VASSAL_UNDO_SHOP_PURCHASE,
  payload: { nodeId: practiceNodeId, offerId: initialOfferIds[0] } }, { isReplay: true });
applyAction(shopState, { kind: ActionKinds.VASSAL_REROLL_SHOP,
  payload: { nodeId: practiceNodeId } }, { isReplay: true });
assert.equal(shopNode.rerollUsed, true);
assert.equal(shopNode.inventory.length, 3, "reroll refills remaining inventory to three");
assert.equal(applyAction(shopState, { kind: ActionKinds.VASSAL_REROLL_SHOP,
  payload: { nodeId: practiceNodeId } }, { isReplay: true }).reason, "rerollUsed");
assert.deepEqual(
  deserializeGameState(serializeGameState(shopState)).civilization.vassalLineage,
  shopState.civilization.vassalLineage,
  "shop inventory and ledger survive serialization"
);

console.log("[detailed-settlements] life-map OK");
if (false) {
const vassalState = fresh(777);
const pool = buildDetailedVassalSelectionPool(vassalState);
assert.equal(pool.candidates.length, 3);
assert.deepEqual(pool.candidates[0].interventions.map((entry) => entry.requiredPrestige), [23, 33, 43]);
assert.ok(pool.candidates.every((candidate) => candidate.interventions.length === 3),
  "each candidate rolls three valid interventions independently");
assert.ok(pool.candidates.flatMap((candidate) => candidate.interventions).every((entry) =>
  ["practice", "structure", "connection", "expandSettlement", "globalStructure"]
    .includes(entry.kind)
), "candidate interventions use the supported coarse vocabulary");
const sampledInterventions = [];
for (let seed = 790; seed < 830; seed += 1) {
  const sampledState = fresh(seed);
  const sampledPool = buildDetailedVassalSelectionPool(sampledState);
  for (const candidate of sampledPool.candidates) {
    const expansionIds = candidate.interventions
      .filter((entry) => entry.kind === "expandSettlement")
      .map((entry) => entry.regionId);
    assert.equal(new Set(expansionIds).size, expansionIds.length,
      "repeated expansion agenda entries reserve distinct frontiers");
    sampledInterventions.push(...candidate.interventions.map((entry) => ({
      state: sampledState,
      targetRegionId: candidate.targetRegionId,
      entry,
    })));
  }
}
assert.ok(sampledInterventions.some(({ entry }) => entry.kind === "expandSettlement"));
assert.ok(sampledInterventions.some(({ entry }) => entry.kind === "globalStructure"));
for (const { state: sampledState, targetRegionId, entry } of sampledInterventions) {
  assert.notEqual(entry.kind, "removeConnection",
    "normal Vassal candidate generation never removes connections");
  if (entry.kind === "connection") {
    assert.equal(entry.mode, "add");
    for (const regionId of [entry.regionAId, entry.regionBId]) {
      const region = getRegionState(sampledState, regionId);
      assert.equal(region.controller, "player");
      assert.equal(region.detailedSettlementEnabled, true);
    }
  }
  if (entry.kind === "practice" || entry.kind === "structure") {
    assert.equal(entry.targetRegionId, targetRegionId,
      "normal Vassal local interventions remain targeted at the Vassal home");
  }
  if (entry.kind === "expandSettlement") {
    assert.equal(entry.sourceRegionId, targetRegionId,
      "normal Vassal expansion keeps the Vassal home as its source");
    const region = getRegionState(sampledState, entry.regionId);
    assert.equal(region.controller, "frontier");
    assert.equal(region.detailedSettlementEnabled, false);
    assert.ok(sampledState.world.connections.some((connection) =>
      [connection.regionAId, connection.regionBId].includes(targetRegionId)
      && [connection.regionAId, connection.regionBId].includes(entry.regionId)));
  }
  if (entry.kind === "globalStructure") {
    assert.ok(["granary", "mudHouses"].includes(entry.structureId));
  }
}
const constrainedVassalState = fresh(780);
for (const site of constrainedVassalState.world.sites) {
  site.detailedState.structureSlots = site.detailedState.structureSlots.map(() => ({ structureId: "granary" }));
}
constrainedVassalState.world.connections = getWorldConnectionCandidates(
  getWorldDefinition(constrainedVassalState)
);
const constrainedPool = buildDetailedVassalSelectionPool(constrainedVassalState);
assert.equal(constrainedPool.candidates.length, 3,
  "candidate rolls retry another intervention type when structures are unavailable");
assert.ok(constrainedPool.candidates.flatMap((candidate) => candidate.interventions).every(
  (entry) => entry.kind !== "structure"
), "the fallback skips unavailable structure interventions");
assert.equal(selectDetailedVassalCandidate(vassalState, 0, pool.expectedPoolHash).ok, true);
const vassal = vassalState.civilization.vassalLineage.currentVassal;
assert.equal(vassal.selectedSec, 0);
assert.equal(
  vassal.deathYear,
  vassal.selectedYear + vassal.deathAge - vassal.initialAge,
  "death year is known when the vassal is selected"
);
assert.ok(vassal.deathSec >= (vassal.deathYear - 1) * 32 + 1);
assert.equal(getMoonPhaseAtSecond(vassalState, vassal.deathSec).id, "faith",
  "vassal death is scheduled for the first Faith phase after the annual boundary");
assert.equal(
  vassalState.civilization.vassalLineage.selectedVassals[0].deathSec,
  vassal.deathSec,
  "lineage snapshot retains the planned lifespan boundary"
);
const realizedThroughSec = Math.min(vassal.deathSec - 1, 96);
assert.deepEqual(
  getSettlementSelectedVassalRealizedSegments(vassalState, realizedThroughSec),
  [{
    vassalId: vassal.vassalId,
    startSec: 0,
    endSec: realizedThroughSec,
    complete: false,
  }],
  "committed history within the active lifespan is fixed"
);
assert.deepEqual(
  getSettlementVassalBoundarySeconds(vassalState, realizedThroughSec),
  [realizedThroughSec],
  "the active lifespan bracket follows committed history"
);
const bracketState = fresh(779);
const firstBracketVassal = {
  vassalId: "vassal-1",
  selectedSec: 0,
  deathSec: 100,
  isDead: true,
};
const secondBracketVassal = {
  vassalId: "vassal-2",
  selectedSec: 100,
  deathSec: 300,
  isDead: false,
};
bracketState.civilization.vassalLineage.currentVassal = secondBracketVassal;
bracketState.civilization.vassalLineage.selectedVassals = [
  firstBracketVassal,
  secondBracketVassal,
];
assert.deepEqual(
  getSettlementSelectedVassalRealizedSegments(bracketState, 250),
  [
    { vassalId: "vassal-1", startSec: 0, endSec: 100, complete: true },
    { vassalId: "vassal-2", startSec: 100, endSec: 250, complete: false },
  ],
  "successive vassal lifespans preserve committed-history brackets"
);
assert.deepEqual(
  getSettlementVassalBoundarySeconds(bracketState, 250),
  [100, 250],
  "completed and active lifespan boundaries remain distinct"
);
vassal.initialAge = vassal.interventions[0].requiredPrestige - vassal.traitPrestigeModifier;
vassal.deathAge = vassal.initialAge;
vassalState._seasonChanged = true;
vassalState.currentSeasonIndex = 0;
vassalState.year += 1;
stepDetailedSettlementsSecond(vassalState, 34);
const finished = vassalState.civilization.vassalLineage.selectedVassals.at(-1);
assert.equal(finished.interventions[0].status, "applied",
  "passing intervention applies before same-boundary death");
assert.equal(finished.interventions[1].status, "expired");

const interventionState = fresh(778);
const interventionPool = buildDetailedVassalSelectionPool(interventionState);
selectDetailedVassalCandidate(interventionState, 0, interventionPool.expectedPoolHash);
const interventionVassal = interventionState.civilization.vassalLineage.currentVassal;
interventionVassal.targetRegionId = "upper-floodplain";
interventionState.world.connections = interventionState.world.connections.filter((entry) =>
  ![entry.regionAId, entry.regionBId].includes("west-levee")
  || ![entry.regionAId, entry.regionBId].includes("upper-floodplain"));
interventionVassal.initialAge = 50;
interventionVassal.deathAge = 99;
interventionVassal.interventions = [
  { kind: "practice", targetRegionId: "river-crown", practiceId: "exchange", slotIndex: 3, requiredPrestige: 0, status: "pending", appliedYear: null, appliedSec: null },
  { kind: "structure", targetRegionId: "river-crown", structureId: "granary", slotIndex: 3, requiredPrestige: 0, status: "pending", appliedYear: null, appliedSec: null },
  { kind: "connection", mode: "add", regionAId: "upper-floodplain", regionBId: "west-levee", requiredPrestige: 0, status: "pending", appliedYear: null, appliedSec: null },
];
assert.equal(
  getDetailedVassalInterventionEffectSec(
    interventionState,
    interventionVassal,
    interventionVassal.interventions[0]
  ),
  34,
  "a pending intervention forecasts the first eligible Faith boundary"
);
interventionState._seasonChanged = true;
interventionState.currentSeasonIndex = 0;
interventionState.year += 1;
stepDetailedSettlementsSecond(interventionState, 34);
assert.equal(getDetailedSettlement(interventionState, "river-crown").practiceSlots[3].practiceId, "exchange");
assert.equal(getDetailedSettlement(interventionState, "river-crown").structureSlots[3].structureId, "granary");
assert.ok(interventionState.world.connections.some((entry) =>
  [entry.regionAId, entry.regionBId].includes("upper-floodplain")
  && [entry.regionAId, entry.regionBId].includes("west-levee")
), "Vassal connection intervention updates the shared world graph");
assert.ok(interventionVassal.interventions.every((entry) => entry.status === "applied" && Number.isFinite(entry.appliedSec)));
assert.equal(
  getDetailedVassalInterventionEffectSec(
    interventionState,
    interventionVassal,
    interventionVassal.interventions[0]
  ),
  interventionVassal.interventions[0].appliedSec,
  "an applied intervention keeps its authoritative timeline second"
);

const expansionState = fresh(8892);
const expansionPool = buildDetailedVassalSelectionPool(expansionState);
selectDetailedVassalCandidate(expansionState, 0, expansionPool.expectedPoolHash);
const expansionVassal = expansionState.civilization.vassalLineage.currentVassal;
expansionVassal.targetRegionId = "west-levee";
expansionVassal.initialAge = 50;
expansionVassal.deathAge = 99;
expansionVassal.interventions = [
  { kind: "expandSettlement", sourceRegionId: "west-levee", regionId: "iron-hills", requiredPrestige: 0, status: "pending" },
];
expansionState.year += 1;
stepDetailedSettlementsSecond(expansionState, 34);
const expandedRegion = getRegionState(expansionState, "iron-hills");
const expandedSite = getDetailedSettlement(expansionState, "iron-hills");
assert.equal(expandedRegion.controller, "player");
assert.equal(expandedRegion.detailedSettlementEnabled, true);
assert.equal(expandedSite.populationByClass.villager.adults, 10);
assert.equal(expandedSite.populationByClass.villager.faith.tier, "gold");
assert.equal(expandedSite.looseFood, 20);
assert.equal(expandedSite.storedFood, 0);
assert.equal(expandedSite.currency, 0);
assert.equal(expandedSite.populationByClass.villager.happiness.status, "neutral");
assert.equal(expandedSite.populationByClass.stranger.adults, 0);
assert.equal(expandedSite.practiceSlots.length, 5);
assert.equal(expandedSite.practiceSlots[0].practiceId, "forage");
assert.ok(expandedSite.practiceSlots.slice(1).every((slot) => slot == null));
assert.equal(expandedSite.structureSlots[0].structureId, "mudHouses");
assert.ok(expandedSite.structureSlots.slice(1).every((slot) => slot == null));
assert.deepEqual(
  expansionState.world.sites.map((site) => site.regionId),
  ["cedar-woods", "iron-hills", "west-levee", "upper-floodplain", "river-crown", "lake-country"],
  "expanded sites retain authored world order"
);

const globalState = fresh(8894);
const globalPool = buildDetailedVassalSelectionPool(globalState);
selectDetailedVassalCandidate(globalState, 0, globalPool.expectedPoolHash);
const globalVassal = globalState.civilization.vassalLineage.currentVassal;
globalVassal.initialAge = 50;
globalVassal.deathAge = 99;
const fullSite = getDetailedSettlement(globalState, "cedar-woods");
fullSite.structureSlots = fullSite.structureSlots.map(() => ({ structureId: "granary" }));
globalVassal.interventions = [
  { kind: "globalStructure", structureId: "mudHouses", requiredPrestige: 0, status: "pending" },
];
globalState.year += 1;
stepDetailedSettlementsSecond(globalState, 34);
const globalIntervention = globalVassal.interventions[0];
assert.deepEqual(globalIntervention.appliedRegionIds,
  ["west-levee", "upper-floodplain", "river-crown", "lake-country"]);
assert.deepEqual(globalIntervention.skippedRegionIds, ["cedar-woods"]);
for (const regionId of globalIntervention.appliedRegionIds) {
  assert.ok(getDetailedSettlement(globalState, regionId).structureSlots.some(
    (slot) => slot?.structureId === "mudHouses"));
}

const failedExpansionState = fresh(8893);
const failedExpansionPool = buildDetailedVassalSelectionPool(failedExpansionState);
selectDetailedVassalCandidate(failedExpansionState, 0, failedExpansionPool.expectedPoolHash);
const failedExpansionVassal = failedExpansionState.civilization.vassalLineage.currentVassal;
failedExpansionVassal.targetRegionId = "west-levee";
failedExpansionVassal.initialAge = 50;
failedExpansionVassal.deathAge = 99;
failedExpansionVassal.interventions = [
  { kind: "expandSettlement", sourceRegionId: "west-levee", regionId: "iron-hills", requiredPrestige: 0, status: "pending" },
];
failedExpansionState.world.connections = failedExpansionState.world.connections.filter((entry) =>
  !([entry.regionAId, entry.regionBId].includes("iron-hills")
    && [entry.regionAId, entry.regionBId].includes("west-levee")));
failedExpansionState.year += 1;
stepDetailedSettlementsSecond(failedExpansionState, 34);
assert.equal(failedExpansionVassal.interventions[0].status, "failed");
assert.equal(getRegionState(failedExpansionState, "iron-hills").controller, "frontier");

const vm = getDetailedSettlementViewModel(state, "river-crown");
assert.equal(vm.elderOrder.resistance, 13);
assert.equal(vm.structureCapacity, getRegionState(state, "river-crown").structureCapacity);
console.log("[detailed-settlements] OK");
}
