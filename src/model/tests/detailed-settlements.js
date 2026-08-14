import assert from "node:assert/strict";
import { createInitialState } from "../init.js";
import {
  assignDetailedSettlementWorkers,
  buildDetailedVassalSelectionPool,
  evaluateDetailedPracticeSlot,
  getDetailedCivilizationSummary,
  getDetailedSettlement,
  getDetailedSettlementViewModel,
  getDetailedVassalInterventionEffectSec,
  getElderMortalityRate,
  getHousingCapacity,
  getPopulationSummary,
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
assert.deepEqual(
  ["cedar-woods", "west-levee", "upper-floodplain", "river-crown", "lake-country"]
    .map((id) => evaluateDetailedPracticeSlot(state, id, 0)
      .effects[0].scaledValue.evaluatorScore),
  [1, 3, 3, 3, 1]
);
assert.deepEqual(assignDetailedSettlementWorkers(state, "river-crown")
  .map((entry) => entry.effectiveWorkers), [3, 0, 0, 0, 0, 0]);
const strangerWorkers = fresh();
const strangerSite = getDetailedSettlement(strangerWorkers, "river-crown");
strangerSite.populationByClass.villager.adults = 0;
strangerSite.populationByClass.villager.eldersByAge = [];
strangerSite.populationByClass.stranger.adults = 20;
assert.equal(assignDetailedSettlementWorkers(strangerWorkers, "river-crown")[0].effectiveWorkers, 1);

assert.equal(getStoredFoodCapacity(state, "upper-floodplain"), 100);
assert.equal(getHousingCapacity(state, "upper-floodplain"), 80);
getDetailedSettlement(state, "upper-floodplain").structureSlots[3] = { structureId: "granary" };
getDetailedSettlement(state, "upper-floodplain").structureSlots[4] = { structureId: "mudHouses" };
assert.equal(getStoredFoodCapacity(state, "upper-floodplain"), 400);
assert.equal(getHousingCapacity(state, "upper-floodplain"), 180);

const cultivate = fresh();
cultivate.currentSeasonIndex = 1;
cultivate._seasonChanged = true;
stepDetailedSettlementsSecond(cultivate, 8);
assert.deepEqual(
  ["cedar-woods", "west-levee", "upper-floodplain", "river-crown", "lake-country"]
    .map((id) => getDetailedSettlement(cultivate, id).storedFood),
  [100, 100, 100, 100, 100]
);
assert.deepEqual(
  ["cedar-woods", "west-levee", "upper-floodplain", "river-crown", "lake-country"]
    .map((id) => getDetailedSettlement(cultivate, id).looseFood),
  [87, 407, 407, 407, 87]
);

const cultivateTiming = clearDetailedPopulationAndFood(fresh());
const cultivateTimingSite = getDetailedSettlement(cultivateTiming, "cedar-woods");
cultivateTimingSite.practiceSlots = [
  { practiceId: "cultivate", charge: 0, work: 0 }, null, null, null, null, null,
];
cultivateTiming.currentSeasonIndex = 0;
cultivateTiming._seasonChanged = true;
stepDetailedSettlementsSecond(cultivateTiming, 8);
assert.equal(cultivateTimingSite.storedFood, 0, "Cultivate does not activate in Spring");
cultivateTiming.currentSeasonIndex = 1;
cultivateTiming._seasonChanged = true;
stepDetailedSettlementsSecond(cultivateTiming, 16);
assert.equal(cultivateTimingSite.storedFood, 40, "zero-worker Cultivate keeps its base value");

const multiplierState = fresh();
const multiplierSite = getDetailedSettlement(multiplierState, "cedar-woods");
multiplierSite.populationByClass.villager.adults = 10;
multiplierSite.populationByClass.villager.eldersByAge = [];
multiplierSite.populationByClass.stranger.adults = 10;
const multiplierEvaluation = evaluateDetailedPracticeSlot(multiplierState, "cedar-woods", 0);
assert.equal(multiplierEvaluation.effects[0].scaledValue.workerMultiplier, 2.5,
  "one Villager and one Stranger worker produce a x2.5 multiplier");

const decay = fresh();
const decaySite = getDetailedSettlement(decay, "cedar-woods");
for (const site of decay.world.sites) {
  site.detailedState.practiceSlots = Array.from({ length: DETAILED_PRACTICE_SLOT_COUNT }, () => null);
}
decaySite.practiceSlots = [
  { practiceId: "preserve", charge: 0, work: 0 }, null, null, null, null, null,
];
stepDetailedSettlementsSecond(decay, 6);
assert.equal(decaySite.storedFood, 57.6,
  "two Preservation workers reduce the 10% stored decay loss by 60%");
assert.equal(decaySite.looseFood, 0, "Preservation does not change loose-food decay");

const build = fresh();
const buildSite = getDetailedSettlement(build, "river-crown");
buildSite.practiceSlots = [
  { practiceId: "buildGranary", charge: 0, work: 0 }, null, null, null, null, null,
];
stepDetailedSettlementsSecond(build, 1);
assert.equal(buildSite.practiceSlots[0].work, 1);
assert.equal(buildSite.structureSlots.filter(Boolean).length, 3,
  "full structure capacity makes completed work wait");
buildSite.structureSlots[2] = null;
stepDetailedSettlementsSecond(build, 7);
assert.equal(buildSite.structureSlots[2].structureId, "granary");
assert.equal(buildSite.practiceSlots[0], null);

const route = fresh();
for (const site of route.world.sites) {
  site.detailedState.practiceSlots = Array.from({ length: DETAILED_PRACTICE_SLOT_COUNT }, () => null);
  site.detailedState.storedFood = 0;
  site.detailedState.looseFood = 0;
}
for (const id of ["cedar-woods", "west-levee", "upper-floodplain"]) {
  const site = getDetailedSettlement(route, id);
  site.practiceSlots = [
    { practiceId: "administrate", charge: 0, work: 0 }, null, null, null, null, null,
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
  { practiceId: "administrate", charge: 0, work: 0 }, null, null, null, null, null,
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
  { practiceId: "administrate", charge: 0, work: 0 }, null, null, null, null, null,
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
    { practiceId: "caravanRoutes", charge: 0, work: 0 }, null, null, null, null, null,
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
  { practiceId: "exchange", charge: 0, work: 0 }, null, null, null, null, null,
];
getRegionState(directCommerce, "west-levee").controller = "frontier";
assert.equal(evaluateDetailedPracticeSlot(directCommerce, "cedar-woods", 0)
  .effects[0].scaledValue.evaluatorScore, 1,
"ordinary commercial adjacency includes a directly adjacent region regardless of controller");

const commerceReplay = clearDetailedPopulationAndFood(fresh(734));
for (const id of ["cedar-woods", "west-levee", "upper-floodplain", "river-crown", "lake-country"]) {
  getDetailedSettlement(commerceReplay, id).practiceSlots = [
    { practiceId: "caravanRoutes", charge: 0, work: 0 }, null, null, null, null, null,
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
  { practiceId: "import", charge: 0, work: 0 }, null, null, null, null, null,
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
    { practiceId: "caravanRoutes", charge: 0, work: 0 }, null, null, null, null, null,
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
const partialSite = getDetailedSettlement(partial, "cedar-woods");
for (const site of partial.world.sites) {
  site.detailedState.storedFood = 0;
  site.detailedState.looseFood = 0;
  site.detailedState.practiceSlots = Array.from({ length: DETAILED_PRACTICE_SLOT_COUNT }, () => null);
}
for (const [index, ratio] of [0.6, 0.7, 0.8].entries()) {
  const start = 1 + index * 6;
  stepDetailedSettlementsSecond(partial, start);
  partialSite.looseFood = 33 * ratio;
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
assert.ok(collapse.civilization.chaos.lastMoonIncome.byRegion.length === 5);

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

const vassalState = fresh(777);
const pool = buildDetailedVassalSelectionPool(vassalState);
assert.equal(pool.candidates.length, 3);
assert.deepEqual(pool.candidates[0].interventions.map((entry) => entry.requiredPrestige), [49, 59, 69]);
assert.ok(pool.candidates.every((candidate) => candidate.interventions.length === 3),
  "each candidate rolls three valid interventions independently");
assert.ok(pool.candidates.flatMap((candidate) => candidate.interventions).every((entry) =>
  entry.kind === "practice" || entry.kind === "structure" || entry.kind === "connection"
), "candidate interventions use the supported coarse vocabulary");
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
interventionVassal.initialAge = 50;
interventionVassal.deathAge = 99;
interventionVassal.interventions = [
  { kind: "practice", practiceId: "exchange", slotIndex: 3, requiredPrestige: 0, status: "pending", appliedYear: null, appliedSec: null },
  { kind: "structure", structureId: "granary", slotIndex: 3, requiredPrestige: 0, status: "pending", appliedYear: null, appliedSec: null },
  { kind: "connection", mode: "add", regionAId: "upper-floodplain", regionBId: "east-steppe", requiredPrestige: 0, status: "pending", appliedYear: null, appliedSec: null },
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
assert.equal(getDetailedSettlement(interventionState, "upper-floodplain").practiceSlots[3].practiceId, "exchange");
assert.equal(getDetailedSettlement(interventionState, "upper-floodplain").structureSlots[3].structureId, "granary");
assert.ok(interventionState.world.connections.some((entry) =>
  [entry.regionAId, entry.regionBId].includes("upper-floodplain")
  && [entry.regionAId, entry.regionBId].includes("east-steppe")
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

const vm = getDetailedSettlementViewModel(state, "river-crown");
assert.equal(vm.elderOrder.resistance, 29);
assert.equal(vm.structureCapacity, 3);
console.log("[detailed-settlements] OK");
