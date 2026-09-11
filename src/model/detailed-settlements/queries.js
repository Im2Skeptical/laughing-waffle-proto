// Site lookups, capacities, and population / pressure / elder / green summaries.

import { POPULATION_CLASS_ORDER } from "../../defs/gamepieces/detailed-settlement-defs.js";
import {
  DETAILED_REGION_IDS,
  createInitialDetailedSettlementData,
} from "../../defs/world/detailed-settlement-scenario.js";
import { getQualityMultiplier } from "../detailed-practice-tiers.js";
import {
  getBooleanGameSetting,
  getDetailedStructureDef,
  getGameSetting,
} from "../game-config.js";
import { getRegionState } from "../world-state.js";
import { clone, eldersCount, roundFood } from "./helpers.js";

export { DETAILED_REGION_IDS };

export function getDetailedSettlementSite(state, regionId) {
  return (state?.world?.sites ?? []).find(
    (site) => site?.regionId === regionId && site?.simulationMode === "detailed"
  ) ?? null;
}

export function getDetailedSettlement(state, regionId) {
  return getDetailedSettlementSite(state, regionId)?.detailedState ?? null;
}

export function getDetailedSettlementSites(state, { playerOnly = false } = {}) {
  const sites = (state?.world?.sites ?? []).filter(
    (site) => site?.simulationMode === "detailed" && site?.detailedState
  );
  return playerOnly
    ? sites.filter((site) => getRegionState(state, site.regionId)?.controller === "player")
    : sites;
}

export function createDetailedSettlementState() {
  return clone(createInitialDetailedSettlementData());
}

export function getStructureCount(state, regionId, structureId) {
  return (getDetailedSettlement(state, regionId)?.structureSlots ?? [])
    .filter((slot) => slot?.structureId === structureId).length;
}

export function getStructureQualityUnits(state, regionId, structureId) {
  const def = getDetailedStructureDef(state, structureId);
  return (getDetailedSettlement(state, regionId)?.structureSlots ?? [])
    .filter((slot) => slot?.structureId === structureId)
    .reduce((sum, slot) => sum + getQualityMultiplier(slot.tier ?? "bronze", def?.qualityMultiplierPerLevel ?? 0), 0);
}

export function getStoredFoodCapacity(state, regionId) {
  const count = getStructureQualityUnits(state, regionId, "granary");
  return getDetailedStructureDef(state, "granary").capacityPerCountSquared * count * count;
}

export function getHousingCapacity(state, regionId) {
  const count = getStructureQualityUnits(state, regionId, "mudHouses");
  return getDetailedStructureDef(state, "mudHouses").capacityPerCountSquared * count * count;
}

export function getPopulationSummary(state, regionId) {
  const settlement = getDetailedSettlement(state, regionId);
  const byClass = {};
  let children = 0;
  let adults = 0;
  let elders = 0;
  let mealDemand = 0;
  for (const classId of POPULATION_CLASS_ORDER) {
    const cohort = settlement?.populationByClass?.[classId] ?? {};
    const entry = {
      children: Math.max(0, Math.floor(cohort.children ?? 0)),
      adults: Math.max(0, Math.floor(cohort.adults ?? 0)),
      elders: eldersCount(cohort),
    };
    entry.total = entry.children + entry.adults + entry.elders;
    entry.mealDemand =
      Math.ceil(entry.children * getGameSetting(state, "childMealConsumption"))
      + Math.ceil(entry.adults * getGameSetting(state, "adultMealConsumption"))
      + Math.ceil(entry.elders * getGameSetting(state, "elderMealConsumption"));
    byClass[classId] = entry;
    children += entry.children;
    adults += entry.adults;
    elders += entry.elders;
    mealDemand += entry.mealDemand;
  }
  return {
    children,
    adults,
    elders,
    total: children + adults + elders,
    mealDemand,
    housingCapacity: getHousingCapacity(state, regionId),
    byClass,
  };
}

export function getSettlementPressureSummary(state, regionId) {
  const settlement = getDetailedSettlement(state, regionId);
  if (!settlement) return null;
  const population = getPopulationSummary(state, regionId);
  const lastMeal = settlement.lastMeal;
  const starvationMigrants = POPULATION_CLASS_ORDER.reduce(
    (total, classId) => total + Math.max(
      0,
      Math.floor(lastMeal?.byClass?.[classId]?.migrants ?? 0)
    ),
    0
  );
  const unfedMealDemand = Math.max(
    0,
    roundFood((lastMeal?.demand ?? 0) - (lastMeal?.consumed ?? 0))
  );
  const housingOverflow = Math.max(
    0,
    population.total - population.housingCapacity
  );
  return {
    starvation: starvationMigrants > 0,
    starvationMigrants,
    unfedMealDemand,
    overcrowding: housingOverflow > 0,
    housingOverflow,
  };
}

const GREEN_TIER_LABELS = Object.freeze(["Dormant", "Green I", "Green II", "Green III"]);

function getGreenTierValue(state) {
  if (!getBooleanGameSetting(state, "greenAutomaticTier")) {
    return Math.max(0, Math.min(3, Math.floor(getGameSetting(state, "greenForcedTier"))));
  }
  const cadence = Math.max(1, Math.floor(getGameSetting(state, "greenCadenceYears")));
  return Math.max(0, Math.min(3, Math.floor(Math.max(1, state?.year ?? 1) / cadence)));
}

function getGreenTierSetting(state, prefix, tier) {
  if (tier <= 0) return 0;
  return Math.max(0, getGameSetting(state, `${prefix}${["I", "II", "III"][tier - 1]}`));
}

export function getGreenAscendancySummary(state) {
  const tier = getGreenTierValue(state);
  const automatic = getBooleanGameSetting(state, "greenAutomaticTier");
  const cadenceYears = Math.max(1, Math.floor(getGameSetting(state, "greenCadenceYears")));
  const year = Math.max(1, Math.floor(state?.year ?? 1));
  return {
    tier,
    label: GREEN_TIER_LABELS[tier],
    automatic,
    cadenceYears,
    nextEscalationYears: automatic && tier < 3
      ? Math.max(0, cadenceYears * (tier + 1) - year)
      : null,
    storedFoodDecayReduction: getGreenTierSetting(state, "greenStoredDecayReduction", tier),
    elderMortalityReduction: getGreenTierSetting(state, "greenElderMortalityReduction", tier),
    migrationSuccess: tier <= 0 ? 100 : getGreenTierSetting(state, "greenMigrationSuccess", tier),
  };
}

export function refreshGreenAscendancy(state) {
  const green = getGreenAscendancySummary(state);
  state.civilization.green = { tier: green.tier };
  return green;
}

export function getElderOrderSummary(state, regionId) {
  const settlement = getDetailedSettlement(state, regionId);
  const ages = [];
  for (const classId of POPULATION_CLASS_ORDER) {
    for (const cohort of settlement?.populationByClass?.[classId]?.eldersByAge ?? []) {
      for (let index = 0; index < Math.max(0, Math.floor(cohort.count ?? 0)); index += 1) {
        ages.push(Math.max(45, Math.floor(cohort.age ?? 45)));
      }
    }
  }
  ages.sort((a, b) => a - b);
  const prestigeBaseAge = getGameSetting(state, "elderPrestigeBaseAge");
  const resistancePerAdditionalElder = getGameSetting(
    state,
    "resistancePerAdditionalElder"
  );
  const totalPrestige = ages.reduce(
    (sum, age) => sum + Math.max(0, age - prestigeBaseAge),
    0
  );
  const count = ages.length;
  const averagePrestige = count > 0 ? Math.floor(totalPrestige / count) : 0;
  return {
    regionId,
    workerPolicyId: settlement?.elderOrder?.workerPolicyId ?? null,
    ages,
    count,
    totalPrestige,
    averagePrestige,
    coordinationResistance: count > 0 ? resistancePerAdditionalElder * (count - 1) : 0,
    resistance:
      count > 0 ? averagePrestige + resistancePerAdditionalElder * (count - 1) : 0,
  };
}

export function hasStructureCapability(state, regionId, capability) {
  return (getDetailedSettlement(state, regionId)?.structureSlots ?? []).some(slot => slot && getDetailedStructureDef(state, slot.structureId)?.[capability] === true);
}
