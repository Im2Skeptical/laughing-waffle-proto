import assert from "node:assert/strict";
import {
  assignDetailedSettlementWorkers,
  evaluateDetailedPracticeSlot,
  getGreenAscendancySummary,
  getDetailedSettlement,
  getDetailedSettlementViewModel,
  getHousingCapacity,
  getPrimordialChaosPressure,
  getStoredFoodCapacity,
  validateDetailedPracticeDefinitions,
} from "../../detailed-settlements.js";
import { getRegionState } from "../../world-state.js";
import { fresh } from "./helpers.js";

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

const vm = getDetailedSettlementViewModel(state, "river-crown");
assert.equal(vm.elderOrder.resistance, 13);
assert.equal(vm.structureCapacity, getRegionState(state, "river-crown").structureCapacity);
