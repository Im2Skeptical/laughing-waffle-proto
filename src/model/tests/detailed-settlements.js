import assert from "node:assert/strict";
import { createInitialState } from "../init.js";
import {
  assignDetailedSettlementWorkers,
  buildDetailedVassalSelectionPool,
  evaluateDetailedMapScore,
  getDetailedCivilizationSummary,
  getDetailedSettlement,
  getDetailedSettlementViewModel,
  getElderMortalityRate,
  getHousingCapacity,
  getPopulationSummary,
  getStoredFoodCapacity,
  resolveProbability,
  selectDetailedVassalCandidate,
  stepDetailedSettlementsSecond,
  validateDetailedPracticeDefinitions,
} from "../detailed-settlements.js";
import { buildEdgeTransferBatchAtBoundary } from "../edge-transfers.js";
import { serializeGameState } from "../state.js";
import {
  createTimelineFromInitialState,
  rebuildStateAtSecond,
} from "../timeline/index.js";
import {
  getSettlementSelectedVassalRealizedSegments,
  getSettlementVassalBoundarySeconds,
} from "../settlement-state.js";

function fresh(seed = 12345) {
  return createInitialState("devPlaytesting01", seed);
}

function clearDetailedPopulationAndFood(state) {
  for (const site of state.world.sites) {
    const settlement = site.detailedState;
    settlement.practiceSlots = [null, null, null, null, null];
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

assert.equal(validateDetailedPracticeDefinitions().ok, true);
const state = fresh();
assert.deepEqual(
  ["cedar-woods", "west-levee", "upper-floodplain", "river-crown", "lake-country"]
    .map((id) => evaluateDetailedMapScore(state, id, "adjacentPlayerSameColour").score),
  [1, 2, 3, 2, 1]
);
assert.deepEqual(assignDetailedSettlementWorkers(state, "river-crown")
  .map((entry) => entry.effectiveWorkers), [2, 1, 0, 0, 0]);
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
cultivate._seasonChanged = true;
stepDetailedSettlementsSecond(cultivate, 8);
assert.deepEqual(
  ["cedar-woods", "west-levee", "upper-floodplain", "river-crown", "lake-country"]
    .map((id) => getDetailedSettlement(cultivate, id).storedFood),
  [80, 100, 100, 100, 80]
);
assert.deepEqual(
  ["cedar-woods", "west-levee", "upper-floodplain", "river-crown", "lake-country"]
    .map((id) => getDetailedSettlement(cultivate, id).looseFood),
  [0, 0, 20, 0, 0]
);

const decay = fresh();
const decaySite = getDetailedSettlement(decay, "cedar-woods");
for (const site of decay.world.sites) {
  site.detailedState.practiceSlots = [null, null, null, null, null];
}
decaySite.practiceSlots = [
  { practiceId: "preserve", charge: 0, work: 0 }, null, null, null, null,
];
stepDetailedSettlementsSecond(decay, 6);
assert.equal(decaySite.storedFood, 56.4, "two Preserve-capacity workers reduce decay to 6%");

const build = fresh();
const buildSite = getDetailedSettlement(build, "river-crown");
buildSite.practiceSlots = [
  { practiceId: "buildGranary", charge: 0, work: 0 }, null, null, null, null,
];
stepDetailedSettlementsSecond(build, 6);
assert.equal(buildSite.practiceSlots[0].work, 1);
assert.equal(buildSite.structureSlots.filter(Boolean).length, 3,
  "full structure capacity makes completed work wait");
buildSite.structureSlots[2] = null;
stepDetailedSettlementsSecond(build, 12);
assert.equal(buildSite.structureSlots[2].structureId, "granary");
assert.equal(buildSite.practiceSlots[0], null);

const route = fresh();
for (const site of route.world.sites) {
  site.detailedState.practiceSlots = [null, null, null, null, null];
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
stepDetailedSettlementsSecond(route, 6);
assert.ok(getDetailedSettlement(route, "west-levee").storedFood > 0);
assert.equal(getDetailedSettlement(route, "upper-floodplain").storedFood, 0,
  "snapshot routing prevents same-moon Region01→03→06 transport");

assert.deepEqual([49, 50, 55, 60, 65, 70, 75].map(getElderMortalityRate),
  [0.01, 0.03, 0.08, 0.18, 0.35, 0.6, 0.85]);
assert.equal(resolveProbability(0.2, { additive: [0.2], multipliers: [2] }), 0.8);
assert.equal(resolveProbability(0.8, { additive: [0.4], multipliers: [2] }), 1);

const partial = fresh(880);
const partialSite = getDetailedSettlement(partial, "cedar-woods");
partialSite.storedFood = 0;
for (const [index, ratio] of [0.6, 0.7, 0.8].entries()) {
  partialSite.looseFood = 33 * ratio;
  stepDetailedSettlementsSecond(partial, 3 + index * 6);
}
assert.equal(partialSite.populationByClass.villager.happiness.status, "positive",
  "three rising partial meals improve happiness");

const collapse = fresh(881);
const collapseClass = getDetailedSettlement(collapse, "cedar-woods").populationByClass.villager;
collapseClass.faith.tier = "bronze";
collapseClass.happiness.status = "negative";
collapse._seasonChanged = true;
collapse.currentSeasonIndex = 0;
stepDetailedSettlementsSecond(collapse, 32);
const collapseResult = getDetailedSettlement(collapse, "cedar-woods").lastAnnualResult;
assert.equal(collapseResult.byClass.villager.bronzeCollapseLoss, 0,
  "fed collapse migrants survive instead of becoming population loss");
assert.equal(collapseResult.migration.outbound[0].reason, "faithCollapse");
assert.equal(collapseResult.migration.outbound[0].arrivalDeaths, 0);
assert.equal(collapseClass.faith.tier, "bronze");
assert.ok(collapse.civilization.chaos.lastAnnualIncome.byRegion.length === 5);

const overHousing = fresh(882);
const overHousingSite = getDetailedSettlement(overHousing, "cedar-woods");
overHousingSite.populationByClass.villager.children = 0;
overHousingSite.populationByClass.villager.adults = 90;
overHousingSite.populationByClass.villager.eldersByAge = [];
overHousingSite.populationByClass.villager.faith.tier = "bronze";
overHousingSite.populationByClass.villager.happiness.status = "positive";
overHousing._seasonChanged = true;
overHousing.currentSeasonIndex = 0;
stepDetailedSettlementsSecond(overHousing, 32);
const retainedPopulation = getDetailedSettlementViewModel(overHousing, "cedar-woods").population;
assert.equal(retainedPopulation.housingCapacity, 80);
assert.equal(retainedPopulation.total, 64,
  "over-cap housing migration reduces the source to the configured 80% target");
assert.equal(overHousingSite.lastAnnualResult.housingOverflow, 10);
assert.equal(overHousingSite.lastAnnualResult.housingOverflowAfterMigration, 0);
assert.equal(overHousingSite.lastAnnualResult.migration.outbound[0].amount, 26);
assert.equal(overHousingSite.populationByClass.villager.happiness.status, "neutral",
  "housing happiness remains Neutral after the cap is removed");

const partialMigration = clearDetailedPopulationAndFood(fresh(883));
const partialSource = getDetailedSettlement(partialMigration, "cedar-woods");
partialSource.populationByClass.villager.children = 10;
partialSource.populationByClass.villager.adults = 5;
partialSource.populationByClass.villager.eldersByAge = [{ age: 50, count: 5 }];
partialSource.populationByClass.villager.happiness.status = "positive";
partialSource.populationByClass.villager.happiness.partialFeedRatios = [0.8];
partialSource.looseFood = 9;
const partialDestination = getDetailedSettlement(partialMigration, "west-levee");
partialDestination.storedFood = 3;
const staleDormantStranger = getDetailedSettlement(partialMigration, "upper-floodplain")
  .populationByClass.stranger;
staleDormantStranger.faith.tier = "bronze";
staleDormantStranger.happiness.status = "negative";
staleDormantStranger.happiness.fullFeedStreak = 9;
partialMigration.world.regions.find((region) => region.id === "west-levee").controller = "external-a";
partialMigration.tSec = 3;
stepDetailedSettlementsSecond(partialMigration, 3);
const partialMove = partialSource.lastMeal.migration.outbound[0];
assert.deepEqual(partialSource.lastMeal.migration.intents[0], {
  reason: "partialMeal",
  sourceRegionId: "cedar-woods",
  sourceClassId: "villager",
  requested: 8,
  admitted: 8,
  unresolved: 0,
  unresolvedOutcome: "stayed",
});
assert.deepEqual({
  reason: partialMove.reason,
  amount: partialMove.amount,
  survivors: partialMove.survivors,
  arrivalDeaths: partialMove.arrivalDeaths,
}, {
  reason: "partialMeal",
  amount: 8,
  survivors: 4,
  arrivalDeaths: 4,
}, "worsening partial meals move the unfed share and kill unfed arrivals");
assert.equal(getPopulationSummary(partialMigration, "cedar-woods").total, 12);
assert.equal(getPopulationSummary(partialMigration, "west-levee").total, 4);
assert.equal(partialDestination.populationByClass.villager.adults, 0);
assert.deepEqual({
  children: partialDestination.populationByClass.stranger.children,
  adults: partialDestination.populationByClass.stranger.adults,
  eldersByAge: partialDestination.populationByClass.stranger.eldersByAge,
}, {
  children: 2,
  adults: 1,
  eldersByAge: [{ age: 50, count: 1 }],
},
  "arrivals join the destination Stranger cohort across controller boundaries");
assert.equal(partialDestination.storedFood + partialDestination.looseFood, 0,
  "arrival meals consume destination food before loose-food decay");
const dormantStranger = getDetailedSettlement(partialMigration, "upper-floodplain")
  .populationByClass.stranger;
assert.deepEqual({
  faith: dormantStranger.faith.tier,
  happiness: dormantStranger.happiness.status,
  fullFeedStreak: dormantStranger.happiness.fullFeedStreak,
}, { faith: "gold", happiness: "neutral", fullFeedStreak: 0 },
"empty Stranger cohorts remain at their dormant defaults");

const starvationMigration = clearDetailedPopulationAndFood(fresh(884));
const starvationSource = getDetailedSettlement(starvationMigration, "cedar-woods");
starvationSource.populationByClass.villager.adults = 20;
starvationSource.populationByClass.villager.happiness.missedFeedStreak = 2;
getDetailedSettlement(starvationMigration, "west-levee").storedFood = 4;
starvationMigration.tSec = 3;
stepDetailedSettlementsSecond(starvationMigration, 3);
const starvationMove = starvationSource.lastMeal.migration.outbound[0];
assert.equal(starvationMove.reason, "starvation");
assert.equal(starvationMove.amount, 4);
assert.equal(starvationMove.survivors, 4);
assert.equal(starvationSource.lastMeal.migration.sourceLosses.length, 0);
assert.equal(getDetailedCivilizationSummary(starvationMigration).population.total, 20,
  "successful starvation migration prevents the original population loss");

const failedStarvation = clearDetailedPopulationAndFood(fresh(885));
const failedSource = getDetailedSettlement(failedStarvation, "cedar-woods");
failedSource.populationByClass.villager.adults = 20;
failedSource.populationByClass.villager.happiness.missedFeedStreak = 2;
failedStarvation.tSec = 3;
stepDetailedSettlementsSecond(failedStarvation, 3);
assert.equal(failedSource.lastMeal.migration.outbound.length, 0);
assert.equal(failedSource.lastMeal.migration.sourceLosses[0].count, 4);
assert.equal(getPopulationSummary(failedStarvation, "cedar-woods").total, 16);

const contestedHousing = clearDetailedPopulationAndFood(fresh(886));
for (const id of ["west-levee", "river-crown"]) {
  const settlement = getDetailedSettlement(contestedHousing, id);
  settlement.populationByClass.villager.adults = 120;
  settlement.populationByClass.villager.faith.tier = "silver";
  settlement.populationByClass.villager.happiness.status = "positive";
}
for (const id of ["cedar-woods", "lake-country"]) {
  const settlement = getDetailedSettlement(contestedHousing, id);
  settlement.populationByClass.villager.adults = 63;
  settlement.populationByClass.villager.faith.tier = "bronze";
}
contestedHousing._seasonChanged = true;
contestedHousing.currentSeasonIndex = 0;
contestedHousing.tSec = 32;
stepDetailedSettlementsSecond(contestedHousing, 32);
const contestedInbound = getDetailedSettlement(contestedHousing, "upper-floodplain")
  .lastAnnualResult.migration.inbound;
assert.deepEqual(contestedInbound.map((move) => move.amount), [32, 32],
  "two over-cap sources receive fair deterministic shares of contested room");
assert.equal(getPopulationSummary(contestedHousing, "upper-floodplain").total, 64);
assert.equal(getDetailedSettlement(contestedHousing, "west-levee")
  .populationByClass.villager.happiness.status, "negative",
"the severe-overcrowding Negative cap is not immediately restored after migration");

const failedCollapse = clearDetailedPopulationAndFood(fresh(888));
const failedCollapseClass = getDetailedSettlement(failedCollapse, "cedar-woods")
  .populationByClass.villager;
failedCollapseClass.adults = 10;
failedCollapseClass.faith.tier = "bronze";
failedCollapseClass.happiness.status = "negative";
failedCollapse._seasonChanged = true;
failedCollapse.currentSeasonIndex = 0;
failedCollapse.tSec = 32;
stepDetailedSettlementsSecond(failedCollapse, 32);
assert.equal(getPopulationSummary(failedCollapse, "cedar-woods").total, 5);
assert.equal(failedCollapseClass.faith.tier, "bronze");
assert.equal(getDetailedSettlement(failedCollapse, "cedar-woods")
  .lastAnnualResult.byClass.villager.bronzeCollapseLoss, 5,
"collapse population still disappears when no higher fed refuge exists");

const migrationTimelineState = clearDetailedPopulationAndFood(fresh(887));
const timelineSource = getDetailedSettlement(migrationTimelineState, "cedar-woods");
timelineSource.populationByClass.villager.adults = 20;
timelineSource.populationByClass.villager.happiness.status = "positive";
timelineSource.populationByClass.villager.happiness.partialFeedRatios = [0.8];
timelineSource.looseFood = 12;
getDetailedSettlement(migrationTimelineState, "west-levee").storedFood = 5;
const migrationTimeline = createTimelineFromInitialState(migrationTimelineState);
const preMigrationBoundary = rebuildStateAtSecond(migrationTimeline, 2);
const migrationBatch = buildEdgeTransferBatchAtBoundary(preMigrationBoundary.state, 3);
const migrationTransfer = migrationBatch.transfers.find(
  (transfer) => transfer.resourceId === "population"
);
assert.deepEqual({
  amount: migrationTransfer.amount,
  survivors: migrationTransfer.survivors,
  arrivalDeaths: migrationTransfer.arrivalDeaths,
}, { amount: 8, survivors: 5, arrivalDeaths: 3 });
assert.deepEqual(
  buildEdgeTransferBatchAtBoundary(
    rebuildStateAtSecond(migrationTimeline, 2).state,
    3
  ),
  migrationBatch,
  "migration packet reconstruction is replay deterministic"
);
assert.deepEqual(
  serializeGameState(preMigrationBoundary.state),
  serializeGameState(rebuildStateAtSecond(migrationTimeline, 2).state),
  "migration packet reconstruction does not mutate its boundary state"
);

const vassalState = fresh(777);
const pool = buildDetailedVassalSelectionPool(vassalState);
assert.equal(pool.candidates.length, 3);
assert.equal(new Set(pool.candidates.map((candidate) => candidate.targetRegionId)).size, 3);
assert.deepEqual(pool.candidates[0].interventions.map((entry) => entry.requiredPrestige), [49, 59, 69]);
assert.equal(selectDetailedVassalCandidate(vassalState, 0, pool.expectedPoolHash).ok, true);
const vassal = vassalState.civilization.vassalLineage.currentVassal;
assert.equal(vassal.selectedSec, 0);
assert.equal(
  vassal.deathYear,
  vassal.selectedYear + vassal.deathAge - vassal.initialAge,
  "death year is known when the vassal is selected"
);
assert.equal(vassal.deathSec, (vassal.deathYear - 1) * 32 + 1);
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
stepDetailedSettlementsSecond(vassalState, 32);
const finished = vassalState.civilization.vassalLineage.selectedVassals.at(-1);
assert.equal(finished.interventions[0].status, "applied",
  "passing intervention applies before same-boundary death");
assert.equal(finished.interventions[1].status, "expired");

const buildInterventionState = fresh(778);
const buildPool = buildDetailedVassalSelectionPool(buildInterventionState);
selectDetailedVassalCandidate(buildInterventionState, 0, buildPool.expectedPoolHash);
const buildVassal = buildInterventionState.civilization.vassalLineage.currentVassal;
buildVassal.targetRegionId = "west-levee";
buildVassal.initialAge = 50;
buildVassal.deathAge = 99;
buildVassal.interventions = [
  { practiceId: "buildGranary", requiredPrestige: 0, status: "pending", appliedYear: null },
  { practiceId: "vassalDummyPractice01", requiredPrestige: 999, status: "pending", appliedYear: null },
  { practiceId: "vassalDummyPractice02", requiredPrestige: 999, status: "pending", appliedYear: null },
];
buildInterventionState._seasonChanged = true;
buildInterventionState.currentSeasonIndex = 0;
stepDetailedSettlementsSecond(buildInterventionState, 32);
assert.equal(getDetailedSettlement(buildInterventionState, "west-levee")
  .practiceSlots[0].practiceId, "buildGranary");
buildInterventionState._seasonChanged = false;
stepDetailedSettlementsSecond(buildInterventionState, 36);
assert.equal(buildVassal.interventions[0].status, "resolved");
assert.equal(getDetailedSettlement(buildInterventionState, "west-levee")
  .practiceSlots.some((slot) => slot?.practiceId === "buildGranary"), false);
buildVassal.interventions[1].requiredPrestige = 0;
buildInterventionState._seasonChanged = true;
buildInterventionState.currentSeasonIndex = 0;
buildInterventionState.year += 1;
stepDetailedSettlementsSecond(buildInterventionState, 64);
assert.equal(getDetailedSettlement(buildInterventionState, "west-levee")
  .practiceSlots[0].practiceId, "vassalDummyPractice01");
assert.equal(getDetailedSettlement(buildInterventionState, "west-levee")
  .practiceSlots.some((slot) => slot?.practiceId === "buildGranary"), false,
  "resolved build interventions are not reinserted");

const vm = getDetailedSettlementViewModel(state, "river-crown");
assert.equal(vm.elderOrder.resistance, 29);
assert.equal(vm.structureCapacity, 3);
console.log("[detailed-settlements] OK");
