import assert from "node:assert/strict";
import {
  evaluateDetailedPracticeSlot,
  getDetailedSettlement,
  getDetailedSettlementViewModel,
  planDetailedAdministrationMoves,
  stepDetailedSettlementsSecond,
} from "../../detailed-settlements.js";
import { buildEdgeTransferBatchAtBoundary } from "../../edge-transfers.js";
import { serializeGameState } from "../../state.js";
import { deserializeGameState } from "../../state.js";
import { getRegionState } from "../../world-state.js";
import {
  createTimelineFromInitialState,
  rebuildStateAtSecond,
} from "../../timeline/index.js";
import { DETAILED_PRACTICE_SLOT_COUNT } from "../../../defs/gamepieces/detailed-settlement-defs.js";
import {
  clearDetailedPopulationAndFood,
  disableMonthlyDemographics,
  fresh,
  putStructure,
} from "./helpers.js";

const cultivate = fresh();
cultivate.currentSeasonIndex = 1;
cultivate._seasonChanged = true;
stepDetailedSettlementsSecond(cultivate, 8);
assert.deepEqual(
  ["cedar-woods", "west-levee", "upper-floodplain", "river-crown", "lake-country"]
    .map((id) => getDetailedSettlement(cultivate, id).storedFood),
  [44.5, 180, 180, 180, 180]
);
assert.deepEqual(
  ["cedar-woods", "west-levee", "upper-floodplain", "river-crown", "lake-country"]
    .map((id) => getDetailedSettlement(cultivate, id).looseFood),
  [0, 397, 397, 397, 37]
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
assert.equal(staffedForageSite.lastMeal.consumed, 7.5,
  "one Villager worker raises Forage from 5 to 7.5");
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
  10.5,
  "Forage output remains configurable through serialized gamepiece data");
assert.deepEqual(serializeGameState(configuredForageReload), serializeGameState(configuredForage));

const multiplierState = fresh();
const multiplierSite = getDetailedSettlement(multiplierState, "west-levee");
multiplierSite.populationByClass.villager.adults = 10;
multiplierSite.populationByClass.villager.eldersByAge = [];
multiplierSite.populationByClass.stranger.adults = 10;
const multiplierEvaluation = evaluateDetailedPracticeSlot(multiplierState, "west-levee", 0);
assert.equal(multiplierEvaluation.effects[0].scaledValue.workerMultiplier, 1.375,
  "one Villager and one Stranger worker produce a x1.375 multiplier");
multiplierSite.practiceSlots[0].tier = "gold";
assert.equal(evaluateDetailedPracticeSlot(multiplierState, "west-levee", 0).workerCapacity, 3,
  "Quality keeps the independently configured worker cap");

const decay = fresh();
const decaySite = getDetailedSettlement(decay, "cedar-woods");
for (const site of decay.world.sites) {
  site.detailedState.practiceSlots = Array.from({ length: DETAILED_PRACTICE_SLOT_COUNT }, () => null);
}
putStructure(decaySite, "smokehouse");
stepDetailedSettlementsSecond(decay, 6);
assert.equal(decaySite.storedFood, 55.2,
  "an unstaffed Smokehouse reduces the 10% stored decay loss by 20%");
assert.equal(decaySite.looseFood, 0, "Preservation does not change loose-food decay");

const build = fresh();
const buildSite = getDetailedSettlement(build, "river-crown");
buildSite.structureSlots = buildSite.structureSlots.map((_,origin) => ({ structureId: "granary", tier: "bronze", width: 1, origin, placementId: "fixture:"+origin }));
buildSite.practiceSlots = [
  { practiceId: "raiseHouses", tier: "bronze", charge: 0, work: 0 }, null, null, null, null,
];
stepDetailedSettlementsSecond(build, 1);
assert.equal(buildSite.practiceSlots[0].work, 1.5);
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
  null,
  null, null, null, null,
];
putStructure(preservedSource, "smokehouse");
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
preservedAdmin.gameConfig.gamepieces.structures.smokehouse.connectedAdministrationReach = true;
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
preservedAdmin.gameConfig.gamepieces.structures.smokehouse.connectedAdministrationReach = false;
assert.deepEqual(planDetailedAdministrationMoves(preservedAdmin), [],
  "disabled Preservation reach leaves Administration limited to adjacent settlements");
getRegionState(preservedAdmin, "upper-floodplain").controller = "frontier";
assert.deepEqual(planDetailedAdministrationMoves(preservedAdmin), [],
  "non-player control breaks Preservation's Administration path");

const commerce = clearDetailedPopulationAndFood(fresh());
for (const id of ["cedar-woods", "west-levee", "upper-floodplain", "river-crown", "lake-country"]) {
  putStructure(getDetailedSettlement(commerce, id), "caravanserai");
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
assert.equal(getDetailedSettlement(commerce, "cedar-woods").currency, 8,
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
  putStructure(getDetailedSettlement(commerceReplay, id), "caravanserai");
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
  putStructure(getDetailedSettlement(clearingImport, id), "caravanserai");
}
const clearingSite = getDetailedSettlement(clearingImport, "cedar-woods");
clearingSite.populationByClass.villager.adults = 10;
clearingSite.looseFood = 2;
clearingSite.currency = 3;
putStructure(clearingSite, "countingHouse", 4);
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
cappedPreservation.gameConfig.gamepieces.structures.smokehouse.effects[0].amount = 60;
putStructure(cappedPreservationSite, 'smokehouse', 2);
putStructure(cappedPreservationSite, 'smokehouse', 3);
stepDetailedSettlementsSecond(cappedPreservation, 6);
assert.equal(cappedPreservationSite.storedFood, 60,
  "combined Preservation is capped at a 100% stored-food decay reduction");
assert.equal(cappedPreservationSite.looseFood, 5,
  "even capped Preservation leaves loose-food decay unchanged");

for (const [tier, threshold] of [["silver", 6], ["gold", 4], ["diamond", 2]]) {
  const millState = clearDetailedPopulationAndFood(fresh(8910));
  const millSite = getDetailedSettlement(millState, "cedar-woods");
  millSite.practiceSlots = [{ practiceId: "forage", tier: "bronze", charge: 0, work: 0 },
    { practiceId: "mill", tier, charge: 0, work: 0 }, null, null, null];
  assert.equal(evaluateDetailedPracticeSlot(millState, "cedar-woods", 1).activation.chargeThreshold, threshold);
  for (let activation = 1; activation <= threshold; activation += 1) {
    millState.tSec = 2 + (activation - 1) * 6;
    stepDetailedSettlementsSecond(millState, millState.tSec);
    assert.equal(millSite.practiceSlots[1].charge, activation % threshold,
      `${tier} Mill spends its charge only on activation ${threshold}`);
    assert.equal(millSite.storedFood, activation * 5 + (activation === threshold ? 12 : 0),
      `${tier} Mill adds 12 food only when fully charged`);
  }
  assert.ok(millSite.practiceActivationTrace.some((entry) =>
    entry.kind === "activated" && entry.targetPracticeId === "mill"));
  const restored = deserializeGameState(serializeGameState(millState));
  assert.equal(evaluateDetailedPracticeSlot(restored, "cedar-woods", 1).activation.chargeThreshold, threshold,
    "quality thresholds survive serialization");
}
