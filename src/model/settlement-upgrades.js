import { hubStructureDefs } from "../defs/gamepieces/hub-structure-defs.js";
import { TIER_ASC } from "./effects/core/tiers.js";
import { getSettlementStructureSlots } from "./settlement-state.js";

function getStructureDef(structureOrDefId) {
  if (!structureOrDefId) return null;
  const defId =
    typeof structureOrDefId === "string" ? structureOrDefId : structureOrDefId?.defId ?? null;
  return typeof defId === "string" ? hubStructureDefs?.[defId] ?? null : null;
}

function getSettlementPrototype(structureOrDefId) {
  const def = getStructureDef(structureOrDefId);
  return def?.settlementPrototype && typeof def.settlementPrototype === "object"
    ? def.settlementPrototype
    : null;
}

function getCapacityMap(structureOrDefId) {
  const prototype = getSettlementPrototype(structureOrDefId);
  if (
    prototype?.foodCapacityBonusByTier &&
    typeof prototype.foodCapacityBonusByTier === "object"
  ) {
    return prototype.foodCapacityBonusByTier;
  }
  if (
    prototype?.populationCapacityBonusByTier &&
    typeof prototype.populationCapacityBonusByTier === "object"
  ) {
    return prototype.populationCapacityBonusByTier;
  }
  return null;
}

export function isUpgradeableSettlementStructureDef(structureOrDefId) {
  return !!getCapacityMap(structureOrDefId);
}

export function normalizeSettlementUpgradeTier(value) {
  if (typeof value === "string" && TIER_ASC.includes(value)) return value;
  return "bronze";
}

export function getSettlementStructureUpgradeThresholdMap(structureOrDefId) {
  const prototype = getSettlementPrototype(structureOrDefId);
  return prototype?.upgradeCitizenYearsByTier &&
    typeof prototype.upgradeCitizenYearsByTier === "object"
    ? prototype.upgradeCitizenYearsByTier
    : null;
}

export function ensureSettlementStructureUpgradeState(structure) {
  if (!structure || !isUpgradeableSettlementStructureDef(structure)) return null;
  structure.tier = normalizeSettlementUpgradeTier(structure.tier);
  if (
    !structure.systemState ||
    typeof structure.systemState !== "object" ||
    Array.isArray(structure.systemState)
  ) {
    structure.systemState = {};
  }
  if (
    !structure.systemState.settlementUpgrade ||
    typeof structure.systemState.settlementUpgrade !== "object" ||
    Array.isArray(structure.systemState.settlementUpgrade)
  ) {
    structure.systemState.settlementUpgrade = {};
  }
  const upgradeState = structure.systemState.settlementUpgrade;
  upgradeState.completedCitizenYearsTowardNextTier = Number.isFinite(
    upgradeState.completedCitizenYearsTowardNextTier
  )
    ? Math.max(0, Math.floor(upgradeState.completedCitizenYearsTowardNextTier))
    : 0;
  return upgradeState;
}

export function getSettlementStructureCurrentTier(structure) {
  if (!isUpgradeableSettlementStructureDef(structure)) return null;
  ensureSettlementStructureUpgradeState(structure);
  return normalizeSettlementUpgradeTier(structure?.tier);
}

export function getSettlementStructureNextTier(tier) {
  const normalized = normalizeSettlementUpgradeTier(tier);
  const index = TIER_ASC.indexOf(normalized);
  if (index < 0 || index >= TIER_ASC.length - 1) return null;
  return TIER_ASC[index + 1] ?? null;
}

export function getSettlementStructureCapacityBonus(structure) {
  if (!isUpgradeableSettlementStructureDef(structure)) return null;
  const tier = getSettlementStructureCurrentTier(structure);
  const capacityMap = getCapacityMap(structure);
  const bonus = Number(capacityMap?.[tier] ?? 0);
  return Number.isFinite(bonus) ? Math.max(0, Math.floor(bonus)) : 0;
}

export function getSettlementStructureUpgradeThreshold(structure) {
  if (!isUpgradeableSettlementStructureDef(structure)) return 0;
  const tier = getSettlementStructureCurrentTier(structure);
  const thresholdMap = getSettlementStructureUpgradeThresholdMap(structure);
  const threshold = Number(thresholdMap?.[tier] ?? 0);
  return Number.isFinite(threshold) ? Math.max(0, Math.floor(threshold)) : 0;
}

export function getSettlementStructureUpgradeProgress(structure) {
  if (!isUpgradeableSettlementStructureDef(structure)) {
    return {
      tier: null,
      nextTier: null,
      completedCitizenYearsTowardNextTier: 0,
      requiredCitizenYearsForNextTier: 0,
      remainingCitizenYearsForNextTier: 0,
    };
  }
  const upgradeState = ensureSettlementStructureUpgradeState(structure);
  const tier = getSettlementStructureCurrentTier(structure);
  const nextTier = getSettlementStructureNextTier(tier);
  const completed = Math.max(
    0,
    Math.floor(upgradeState?.completedCitizenYearsTowardNextTier ?? 0)
  );
  const required = nextTier ? getSettlementStructureUpgradeThreshold(structure) : 0;
  return {
    tier,
    nextTier,
    completedCitizenYearsTowardNextTier: nextTier ? completed : 0,
    requiredCitizenYearsForNextTier: required,
    remainingCitizenYearsForNextTier: nextTier ? Math.max(0, required - completed) : 0,
  };
}

export function findSettlementStructureByDefId(state, defId) {
  if (typeof defId !== "string" || !defId.length) return null;
  const slots = getSettlementStructureSlots(state);
  for (const slot of slots) {
    const structure = slot?.structure ?? null;
    if (!structure || structure.defId !== defId) continue;
    return structure;
  }
  return null;
}

export function advanceSettlementStructureUpgrade(structure, amount) {
  if (!structure || !isUpgradeableSettlementStructureDef(structure)) {
    return {
      changed: false,
      tierChanged: false,
      tier: null,
      nextTier: null,
      completedCitizenYearsTowardNextTier: 0,
      requiredCitizenYearsForNextTier: 0,
      remainingCitizenYearsForNextTier: 0,
    };
  }
  const upgradeState = ensureSettlementStructureUpgradeState(structure);
  const safeAmount = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
  if (safeAmount <= 0) {
    return {
      changed: false,
      tierChanged: false,
      ...getSettlementStructureUpgradeProgress(structure),
    };
  }

  let changed = false;
  let tierChanged = false;
  let pending = safeAmount;
  while (pending > 0) {
    const tier = getSettlementStructureCurrentTier(structure);
    const nextTier = getSettlementStructureNextTier(tier);
    if (!nextTier) {
      if (upgradeState.completedCitizenYearsTowardNextTier !== 0) {
        upgradeState.completedCitizenYearsTowardNextTier = 0;
        changed = true;
      }
      break;
    }
    const required = Math.max(1, getSettlementStructureUpgradeThreshold(structure));
    const completed = Math.max(
      0,
      Math.floor(upgradeState.completedCitizenYearsTowardNextTier ?? 0)
    );
    const applied = Math.min(pending, Math.max(0, required - completed));
    if (applied <= 0) break;
    upgradeState.completedCitizenYearsTowardNextTier = completed + applied;
    pending -= applied;
    changed = true;
    if (upgradeState.completedCitizenYearsTowardNextTier >= required) {
      structure.tier = nextTier;
      upgradeState.completedCitizenYearsTowardNextTier = 0;
      tierChanged = true;
    }
  }

  if (getSettlementStructureNextTier(structure.tier) == null) {
    upgradeState.completedCitizenYearsTowardNextTier = 0;
  }

  return {
    changed,
    tierChanged,
    ...getSettlementStructureUpgradeProgress(structure),
  };
}
