import assert from "node:assert/strict";
import {
  getDetailedSettlement,
  getDetailedSettlementViewModel,
  getElderMortalityRate,
  getPopulationSummary,
  resolveProbability,
  stepDetailedSettlementsSecond,
} from "../../detailed-settlements.js";
import { buildEdgeTransferBatchAtBoundary } from "../../edge-transfers.js";
import { serializeGameState } from "../../state.js";
import { deserializeGameState } from "../../state.js";
import {
  createTimelineFromInitialState,
  rebuildStateAtSecond,
} from "../../timeline/index.js";
import { getMoonPhaseAtSecond } from "../../moon-phases.js";
import { DETAILED_PRACTICE_SLOT_COUNT } from "../../../defs/gamepieces/detailed-settlement-defs.js";
import {
  clearDetailedPopulationAndFood,
  disableMonthlyDemographics,
  fresh,
} from "./helpers.js";

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
