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
import { settlementStructureDefs } from "../../../defs/gamepieces/detailed-settlement-defs.js";
import { fresh } from "./helpers.js";

assert.deepEqual(validateDetailedPracticeDefinitions().errors, [
  'glassmaking: missing provider Mineral',
  'distilling: missing provider Vessel',
  'embalming: missing provider Vessel',
], 'the bronze test set leaves only the documented later-tier recipes without providers');
const state = fresh();
assert.equal(getGreenAscendancySummary(state).tier, 0);
state.year = 100;
assert.equal(getGreenAscendancySummary(state).tier, 1, "Green I begins at Year 100");
state.gameConfig.settings.values.greenAutomaticTier = false;
state.gameConfig.settings.values.greenForcedTier = 3;
assert.equal(getGreenAscendancySummary(state).tier, 3, "debug can force Green tier");
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
  .map((entry) => entry.effectiveWorkers), [1, 0, 0, 0, 0]);
const strangerWorkers = fresh();
const strangerSite = getDetailedSettlement(strangerWorkers, "river-crown");
strangerSite.populationByClass.villager.adults = 0;
strangerSite.populationByClass.villager.eldersByAge = [];
strangerSite.populationByClass.stranger.adults = 20;
assert.equal(assignDetailedSettlementWorkers(strangerWorkers, "river-crown")[0].effectiveWorkers, 0.5);

assert.equal(getStoredFoodCapacity(state, "upper-floodplain"), 7);
assert.equal(getHousingCapacity(state, "upper-floodplain"), 30);
getDetailedSettlement(state, "upper-floodplain").structureSlots[3] = { structureId: "granary" };
getDetailedSettlement(state, "upper-floodplain").structureSlots[4] = { structureId: "mudHouses" };
assert.equal(getStoredFoodCapacity(state, "upper-floodplain"), 12);
assert.equal(getHousingCapacity(state, "upper-floodplain"), 60);

assert.deepEqual(['mudHouses','timberHouse','stoneHouse','longhouse','tenement','greatDwelling'].map(id=>settlementStructureDefs[id]?.housing),[30,60,90,210,360,630]);

const vm = getDetailedSettlementViewModel(state, "river-crown");
assert.equal(vm.elderOrder.resistance, 13);
assert.equal(vm.structureCapacity, getRegionState(state, "river-crown").structureCapacity);
