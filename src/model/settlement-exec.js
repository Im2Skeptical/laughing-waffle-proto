// Do not add gameplay here. Site simulation belongs in detailed-settlements.js.

import { hubStructureDefs } from "../defs/gamepieces/hub-structure-defs.js";
import { settlementPracticeDefs } from "../defs/gamepieces/settlement-practice-defs.js";
import { getSettlementChaosGodState } from "./settlement-chaos.js";
import { getCurrentSeasonKey } from "./state.js";
import { TIER_ASC } from "./effects/core/tiers.js";
import {
  getHubCore,
  getSettlementClassIds,
  getSettlementFaithTier,
  getSettlementPopulationClassState,
  getSettlementPracticeSlotsByClass,
  getSettlementFloodplainFoodTotal,
  getSettlementTotalFood,
  getSettlementStructureSlots,
  syncSettlementHinterlandBlueResource,
} from "./settlement-state.js";
import {
  ensureSettlementStructureUpgradeState,
  findSettlementStructureByDefId,
  getSettlementStructureCapacityBonus,
  getSettlementStructureCurrentTier,
  getSettlementStructureUpgradeProgress,
} from "./settlement-upgrades.js";

function getStockpilesState(state) {
  return getHubCore(state)?.systemState?.stockpiles ?? null;
}

function getPopulationClassState(state, classId) {
  return getSettlementPopulationClassState(state, classId);
}

function getCommitmentAmount(commitment) {
  return Number.isFinite(commitment?.amount) ? Math.max(0, Math.floor(commitment.amount)) : 0;
}

function getCommittedPopulationForClass(classState) {
  const commitments = Array.isArray(classState?.commitments) ? classState.commitments : [];
  return commitments.reduce((sum, commitment) => sum + getCommitmentAmount(commitment), 0);
}

function getAdultPopulationForClass(classState) {
  if (Number.isFinite(classState?.adults)) {
    return Math.max(0, Math.floor(classState.adults));
  }
  if (Number.isFinite(classState?.total)) {
    return Math.max(0, Math.floor(classState.total));
  }
  return 0;
}

function getYouthPopulationForClass(classState) {
  return Number.isFinite(classState?.youth) ? Math.max(0, Math.floor(classState.youth)) : 0;
}

function getTotalPopulationForClass(classState) {
  return getAdultPopulationForClass(classState) + getYouthPopulationForClass(classState);
}

function getPracticeMode(def) {
  return def?.practiceMode === "passive" ? "passive" : "active";
}

function normalizeHappinessStatus(value) {
  if (value === "positive" || value === "negative") return value;
  return "neutral";
}

function getHousingPressureHappinessCapStatus(totalPopulation, populationCapacity) {
  const total = Number.isFinite(totalPopulation) ? Math.max(0, Math.floor(totalPopulation)) : 0;
  const capacity = Number.isFinite(populationCapacity)
    ? Math.max(0, Math.floor(populationCapacity))
    : 0;
  if (total <= 0) return "positive";
  if (capacity <= 0) return "negative";
  if (total * 5 > capacity * 6) return "negative";
  if (total > capacity) return "neutral";
  return "positive";
}

function clampHappinessStatusToCap(status, capStatus) {
  const order = ["negative", "neutral", "positive"];
  const normalized = normalizeHappinessStatus(status);
  const normalizedCap = normalizeHappinessStatus(capStatus);
  const statusIndex = order.indexOf(normalized);
  const capIndex = order.indexOf(normalizedCap);
  return order[Math.min(statusIndex, capIndex)] ?? normalized;
}

function applySettlementHousingPressureHappinessCap(state, summary) {
  const classIds = getSettlementClassIds(state);
  const totalPopulation = Number.isFinite(summary?.totalPopulation)
    ? Math.max(0, Math.floor(summary.totalPopulation))
    : classIds.reduce((sum, classId) => {
        return sum + getTotalPopulationForClass(getPopulationClassState(state, classId));
      }, 0);
  const populationCapacity = Number.isFinite(summary?.populationCapacity)
    ? Math.max(0, Math.floor(summary.populationCapacity))
    : 0;
  const capStatus = getHousingPressureHappinessCapStatus(totalPopulation, populationCapacity);
  let changed = false;
  for (const classId of classIds) {
    const classState = getPopulationClassState(state, classId);
    const happinessState = classState?.happiness;
    if (!happinessState || typeof happinessState !== "object") continue;
    const previousStatus = normalizeHappinessStatus(happinessState.status);
    const nextStatus = clampHappinessStatusToCap(previousStatus, capStatus);
    if (nextStatus === previousStatus) continue;
    happinessState.status = nextStatus;
    changed = true;
  }
  return changed;
}

function clampRatio(value) {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function setStructureRuntime(structure, runtime) {
  if (!structure || typeof structure !== "object") return;
  if (!structure.props || typeof structure.props !== "object" || Array.isArray(structure.props)) {
    structure.props = {};
  }
  structure.props.settlement = {
    ...(structure.props.settlement || {}),
    ...runtime,
  };
}

function setPracticeRuntime(card, runtime) {
  if (!card || typeof card !== "object") return;
  if (!card.props || typeof card.props !== "object" || Array.isArray(card.props)) {
    card.props = {};
  }
  card.props.settlement = {
    ...(card.props.settlement || {}),
    ...runtime,
  };
}

function resolvePracticeAmountValue(input, state, classSummary) {
  if (Number.isFinite(input)) return Math.max(0, Math.floor(input));
  if (!input || typeof input !== "object") return 0;
  let baseValue = 0;
  switch (input.kind) {
    case "freePopulation":
      baseValue = Math.max(0, Math.floor(classSummary?.freePopulation ?? 0));
      break;
    case "totalPopulation":
      baseValue = Math.max(0, Math.floor(classSummary?.totalPopulation ?? 0));
      break;
    case "youthPopulation":
      baseValue = Math.max(0, Math.floor(classSummary?.youth ?? 0));
      break;
    case "stockpile": {
      const key = typeof input.key === "string" ? input.key : null;
      const stockpiles = getStockpilesState(state);
      baseValue =
        key === "food"
          ? Math.max(0, Math.floor(getSettlementTotalFood(state)))
          : key && Number.isFinite(stockpiles?.[key])
            ? Math.max(0, Math.floor(stockpiles[key]))
            : 0;
      break;
    }
    case "settlementTileStore": {
      const tileDefId = typeof input.tileDefId === "string" ? input.tileDefId : null;
      const key = typeof input.key === "string" ? input.key : null;
      baseValue =
        tileDefId === "tile_floodplains" && key === "food"
          ? getSettlementFloodplainFoodTotal(state)
          : 0;
      break;
    }
    case "chaosGodValue": {
      const godId = typeof input.godId === "string" ? input.godId : null;
      const key = typeof input.key === "string" ? input.key : null;
      const godState = godId ? getSettlementChaosGodState(state, godId) : null;
      baseValue =
        key && Number.isFinite(godState?.[key]) ? Math.max(0, Math.floor(godState[key])) : 0;
      break;
    }
    case "settlementStructureUpgradeCitizensRemaining": {
      const structureDefId = typeof input.structureDefId === "string" ? input.structureDefId : null;
      const structure = structureDefId ? findSettlementStructureByDefId(state, structureDefId) : null;
      const progress = structure ? getSettlementStructureUpgradeProgress(structure) : null;
      baseValue = Math.max(0, Math.floor(progress?.remainingCitizenYearsForNextTier ?? 0));
      break;
    }
    default:
      baseValue = 0;
      break;
  }
  const divideBy = Number.isFinite(input.divideBy) ? Math.floor(input.divideBy) : 0;
  if (divideBy > 1) {
    baseValue = Math.floor(baseValue / divideBy);
  }
  const minimum = Number.isFinite(input.minimum) ? Math.max(0, Math.floor(input.minimum)) : 0;
  if (minimum > 0 && baseValue > 0) {
    baseValue = Math.max(minimum, baseValue);
  }
  return Math.max(0, Math.floor(baseValue));
}

function resolvePracticeAmount(def, state, classSummary) {
  const spec = def?.amount;
  if (Number.isFinite(spec)) return Math.max(0, Math.floor(spec));
  if (!spec || typeof spec !== "object") return 0;
  const values = Array.isArray(spec.values) ? spec.values : [];
  if (!values.length) return 0;
  const resolved = values.map((value) => resolvePracticeAmountValue(value, state, classSummary));
  const mode = typeof spec.mode === "string" ? spec.mode : "min";
  let amount = 0;
  if (mode === "sum") {
    amount = resolved.reduce((sum, value) => sum + value, 0);
  } else if (mode === "max") {
    amount = resolved.reduce((max, value) => Math.max(max, value), 0);
  } else {
    amount = resolved.reduce((min, value) => Math.min(min, value), resolved[0] ?? 0);
  }
  const minimum = Number.isFinite(spec.minimum) ? Math.max(0, Math.floor(spec.minimum)) : 0;
  if (minimum > 0 && amount > 0) {
    amount = Math.max(minimum, amount);
  }
  return Math.max(0, Math.floor(amount));
}

function getPracticeImmediateStockpileCostPerUnit(effect) {
  if (!effect || typeof effect !== "object") return null;
  if (effect.op !== "AdjustSystemState" && effect.op !== "AdjustSettlementFood") return null;
  if (effect.op === "AdjustSystemState" && effect.system !== "stockpiles") return null;
  const key = effect.op === "AdjustSettlementFood" ? "food" : effect.key;
  if (typeof key !== "string" || !key.length) return null;
  if (effect.amountVar !== "practiceAmount") return null;
  const amountScale = Number.isFinite(effect.amountScale) ? Number(effect.amountScale) : 1;
  if (!Number.isFinite(amountScale) || amountScale >= 0) return null;
  return {
    key,
    costPerUnit: Math.max(1, Math.floor(Math.abs(amountScale))),
  };
}

function clampPracticeAmountByStockpileCosts(def, state, baseAmount) {
  const amount = Number.isFinite(baseAmount) ? Math.max(0, Math.floor(baseAmount)) : 0;
  if (amount <= 0) {
    return { amount: 0, reason: null };
  }
  const stockpiles = getStockpilesState(state);
  const effects = Array.isArray(def?.effects) ? def.effects : [];
  let clampedAmount = amount;
  let limitingReason = null;
  for (const effect of effects) {
    const cost = getPracticeImmediateStockpileCostPerUnit(effect);
    if (!cost) continue;
    const available =
      cost.key === "food"
        ? Math.max(0, Math.floor(getSettlementTotalFood(state)))
        : Number.isFinite(stockpiles?.[cost.key])
          ? Math.max(0, Math.floor(stockpiles[cost.key]))
          : 0;
    const affordableUnits = Math.max(0, Math.floor(available / Math.max(1, cost.costPerUnit)));
    if (affordableUnits >= clampedAmount) continue;
    clampedAmount = affordableUnits;
    limitingReason = `stockpile:${cost.key}`;
    if (clampedAmount <= 0) break;
  }
  return {
    amount: Math.max(0, Math.floor(clampedAmount)),
    reason: clampedAmount <= 0 ? limitingReason : null,
  };
}

function resolvePracticeAmountResult(def, state, classSummary) {
  const baseAmount = resolvePracticeAmount(def, state, classSummary);
  return clampPracticeAmountByStockpileCosts(def, state, baseAmount);
}

function getPracticeUpgradeTargetStructureDefId(def) {
  if (
    typeof def?.upgradeTargetStructureDefId === "string" &&
    def.upgradeTargetStructureDefId.length > 0
  ) {
    return def.upgradeTargetStructureDefId;
  }
  if (
    typeof def?.requires?.settlementStructureDefId === "string" &&
    def.requires.settlementStructureDefId.length > 0
  ) {
    return def.requires.settlementStructureDefId;
  }
  return null;
}

function getPracticeUpgradeTargetRuntime(state, def) {
  const structureDefId = getPracticeUpgradeTargetStructureDefId(def);
  const structure = structureDefId ? findSettlementStructureByDefId(state, structureDefId) : null;
  const progress = structure ? getSettlementStructureUpgradeProgress(structure) : null;
  return {
    upgradeTargetStructureDefId: structureDefId,
    upgradeTargetStructurePresent: !!structure,
    upgradeTargetTier: progress?.tier ?? null,
    upgradeTargetNextTier: progress?.nextTier ?? null,
    upgradeTargetProgressCompleted: Math.max(
      0,
      Math.floor(progress?.completedCitizenYearsTowardNextTier ?? 0)
    ),
    upgradeTargetProgressRequired: Math.max(
      0,
      Math.floor(progress?.requiredCitizenYearsForNextTier ?? 0)
    ),
    upgradeTargetProgressRemaining: Math.max(
      0,
      Math.floor(progress?.remainingCitizenYearsForNextTier ?? 0)
    ),
  };
}

function normalizeRequirementEntries(value) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") return [value];
  return [];
}

function practiceRequirementsPass(def, state, classSummary, seasonKey, classId) {
  const requires = def?.requires;
  if (!requires || typeof requires !== "object") {
    return { ok: true, reason: null };
  }
  if (Array.isArray(requires.season) && requires.season.length > 0) {
    if (!requires.season.includes(seasonKey)) {
      return { ok: false, reason: "seasonMismatch" };
    }
  }
  if (Number.isFinite(requires.freePopulationAtLeast)) {
    if ((classSummary?.freePopulation ?? 0) < Math.floor(requires.freePopulationAtLeast)) {
      return { ok: false, reason: "freePopulation" };
    }
  }
  if (typeof requires.settlementStructureDefId === "string") {
    const structure = findSettlementStructureByDefId(state, requires.settlementStructureDefId);
    if (!structure) {
      return {
        ok: false,
        reason: `upgradeTargetMissing:${requires.settlementStructureDefId}`,
      };
    }
  }
  if (
    typeof requires.settlementStructureTierBelow === "string" &&
    TIER_ASC.includes(requires.settlementStructureTierBelow)
  ) {
    const structure = typeof requires.settlementStructureDefId === "string"
      ? findSettlementStructureByDefId(state, requires.settlementStructureDefId)
      : null;
    if (!structure) {
      return {
        ok: false,
        reason: `upgradeTargetMissing:${requires.settlementStructureDefId ?? "unknown"}`,
      };
    }
    const currentTier = getSettlementStructureCurrentTier(structure);
    if (
      currentTier &&
      TIER_ASC.indexOf(currentTier) >= TIER_ASC.indexOf(requires.settlementStructureTierBelow)
    ) {
      return { ok: false, reason: `upgradeTier:${currentTier}` };
    }
  }
  const stockpileRequirements = normalizeRequirementEntries(requires.stockpileAtLeast);
  if (stockpileRequirements.length > 0) {
    const stockpiles = getStockpilesState(state);
    for (const entry of stockpileRequirements) {
      if (!entry || typeof entry !== "object") continue;
      for (const [key, amountRaw] of Object.entries(entry)) {
        if (!Number.isFinite(amountRaw)) continue;
        const amount = Math.max(0, Math.floor(amountRaw));
        const value =
          key === "food"
            ? Math.floor(getSettlementTotalFood(state))
            : Number.isFinite(stockpiles?.[key])
              ? Math.floor(stockpiles[key])
              : 0;
        if (value < amount) {
          return { ok: false, reason: `stockpile:${key}` };
        }
      }
    }
  }
  const stockpileUpperBounds = normalizeRequirementEntries(requires.stockpileAtMost);
  if (stockpileUpperBounds.length > 0) {
    const stockpiles = getStockpilesState(state);
    for (const entry of stockpileUpperBounds) {
      if (!entry || typeof entry !== "object") continue;
      for (const [key, amountRaw] of Object.entries(entry)) {
        if (!Number.isFinite(amountRaw)) continue;
        const amount = Math.max(0, Math.floor(amountRaw));
        const value =
          key === "food"
            ? Math.floor(getSettlementTotalFood(state))
            : Number.isFinite(stockpiles?.[key])
              ? Math.floor(stockpiles[key])
              : 0;
        if (value > amount) {
          return { ok: false, reason: `stockpileHigh:${key}` };
        }
      }
    }
  }
  const chaosRequirements = normalizeRequirementEntries(requires.chaosGodValueAtLeast);
  if (chaosRequirements.length > 0) {
    for (const entry of chaosRequirements) {
      if (!entry || typeof entry !== "object") continue;
      const godId = typeof entry.godId === "string" ? entry.godId : null;
      const key = typeof entry.key === "string" ? entry.key : null;
      const amount = Number.isFinite(entry.amount) ? Math.max(0, Math.floor(entry.amount)) : 0;
      const godState = godId ? getSettlementChaosGodState(state, godId) : null;
      const value = key && Number.isFinite(godState?.[key]) ? Math.floor(godState[key]) : 0;
      if (value < amount) {
        return { ok: false, reason: `chaosGod:${godId ?? "unknown"}:${key ?? "value"}` };
      }
    }
  }
  const requiredCapabilities = Array.isArray(requires.hasSettlementCapability)
    ? requires.hasSettlementCapability
    : typeof requires.hasSettlementCapability === "string"
      ? [requires.hasSettlementCapability]
      : [];
  if (requiredCapabilities.length > 0) {
    const capabilitySet = new Set(
      Array.isArray(getHubCore(state)?.props?.capabilities)
        ? getHubCore(state).props.capabilities
        : []
    );
    for (const capability of requiredCapabilities) {
      if (!capabilitySet.has(capability)) {
        return { ok: false, reason: `capability:${capability}` };
      }
    }
  }
  const requiredFaithTier =
    typeof requires.faithTierAtLeast === "string" &&
    TIER_ASC.includes(requires.faithTierAtLeast)
      ? requires.faithTierAtLeast
      : null;
  if (requiredFaithTier) {
    const currentFaithTier = getSettlementFaithTier(state, classId);
    if (TIER_ASC.indexOf(currentFaithTier) < TIER_ASC.indexOf(requiredFaithTier)) {
      return { ok: false, reason: `faithTier:${requiredFaithTier}` };
    }
  }
  return { ok: true, reason: null };
}

function buildClassAvailabilityBeforeStructures(state) {
  const out = {};
  for (const classId of getSettlementClassIds(state)) {
    const classState = getPopulationClassState(state, classId);
    const adults = getAdultPopulationForClass(classState);
    const youth = getYouthPopulationForClass(classState);
    const committed = getCommittedPopulationForClass(classState);
    out[classId] = {
      adults,
      youth,
      total: adults + youth,
      committed,
      available: Math.max(0, adults - committed),
    };
  }
  return out;
}

function splitSharedAmountByAvailability(availableByClass, totalAmount, classIds) {
  const safeAmount = Number.isFinite(totalAmount) ? Math.max(0, Math.floor(totalAmount)) : 0;
  const out = {};
  for (const classId of classIds) out[classId] = 0;
  const totalAvailable = classIds.reduce(
    (sum, classId) => sum + Math.max(0, Math.floor(availableByClass[classId] ?? 0)),
    0
  );
  if (safeAmount <= 0 || totalAvailable <= 0) return out;

  let allocated = 0;
  for (const classId of classIds) {
    const available = Math.max(0, Math.floor(availableByClass[classId] ?? 0));
    if (available <= 0) continue;
    const share = Math.min(available, Math.floor((safeAmount * available) / totalAvailable));
    out[classId] = share;
    allocated += share;
  }

  let remaining = Math.max(0, safeAmount - allocated);
  while (remaining > 0) {
    let claimed = false;
    for (const classId of classIds) {
      const available = Math.max(0, Math.floor(availableByClass[classId] ?? 0));
      if (available <= out[classId]) continue;
      out[classId] += 1;
      remaining -= 1;
      claimed = true;
      if (remaining <= 0) break;
    }
    if (!claimed) break;
  }
  return out;
}

function getPracticePassiveBonuses(state, classSummaries, seasonKey) {
  const totalsByClass = {};
  for (const classId of getSettlementClassIds(state)) {
    if (!totalsByClass[classId]) {
      totalsByClass[classId] = {};
    }
    const practiceSlots = getSettlementPracticeSlotsByClass(state, classId);
    for (let slotIndex = 0; slotIndex < practiceSlots.length; slotIndex += 1) {
      const card = practiceSlots[slotIndex]?.card ?? null;
      if (!card) continue;
      const def = settlementPracticeDefs[card.defId];
      if (!def || getPracticeMode(def) !== "passive") continue;
      const passiveBonuses =
        def?.passiveBonuses &&
        typeof def.passiveBonuses === "object" &&
        !Array.isArray(def.passiveBonuses)
          ? def.passiveBonuses
          : null;
      if (!passiveBonuses) continue;

      const classSummary = classSummaries[classId];
      const requirementResult = practiceRequirementsPass(def, state, classSummary, seasonKey, classId);
      if (!requirementResult.ok) continue;

      const targetClassId =
        typeof def.passiveTargetPopulationClassId === "string"
          ? def.passiveTargetPopulationClassId
          : classId;
      if (!totalsByClass[targetClassId]) {
        totalsByClass[targetClassId] = {};
      }
      for (const [key, rawValue] of Object.entries(passiveBonuses)) {
        if (!Number.isFinite(rawValue)) continue;
        totalsByClass[targetClassId][key] =
          Number(totalsByClass[targetClassId][key] ?? 0) + Number(rawValue);
      }
    }
  }
  return totalsByClass;
}

function createSettlementExecutionContext(state, tSec = 0) {
  let cachedSummary = null;
  let summaryDirty = true;
  let cachedSeasonKey = null;
  let seasonDirty = true;

  return {
    state,
    tSec,
    invalidateDerivedSummary() {
      summaryDirty = true;
    },
    invalidateSeasonKey() {
      seasonDirty = true;
    },
    getSeasonKey() {
      if (seasonDirty || cachedSeasonKey == null) {
        cachedSeasonKey = getCurrentSeasonKey(state);
        seasonDirty = false;
      }
      return cachedSeasonKey;
    },
    getDerivedSummary() {
      if (summaryDirty || !cachedSummary) {
        cachedSummary = computeStructureDerivedState(state);
        summaryDirty = false;
      }
      return cachedSummary;
    },
  };
}

function computeStructureDerivedState(state) {
  const core = getHubCore(state);
  const classIds = getSettlementClassIds(state);
  const classAvailability = buildClassAvailabilityBeforeStructures(state);
  const totalPopulation = classIds.reduce(
    (sum, classId) => sum + classAvailability[classId].total,
    0
  );
  const committedPopulation = classIds.reduce(
    (sum, classId) => sum + classAvailability[classId].committed,
    0
  );
  const structureSlots = getSettlementStructureSlots(state);

  const totalAdultPopulation = classIds.reduce(
    (sum, classId) => sum + classAvailability[classId].adults,
    0
  );
  let availableForStructures = Math.max(0, totalAdultPopulation - committedPopulation);
  let structureStaffingReserved = 0;
  let foodCapacity = 0;
  let populationCapacity = 0;
  const capabilities = [];
  const activeStructureIds = [];

  for (let slotIndex = 0; slotIndex < structureSlots.length; slotIndex += 1) {
    const structure = structureSlots[slotIndex]?.structure ?? null;
    if (!structure) continue;
    const def = hubStructureDefs[structure.defId];
    ensureSettlementStructureUpgradeState(structure);
    const settlementSpec =
      def?.settlementPrototype && typeof def.settlementPrototype === "object"
        ? def.settlementPrototype
        : {};
    const staffingRequired = Number.isFinite(settlementSpec.staffingRequired)
      ? Math.max(0, Math.floor(settlementSpec.staffingRequired))
      : 0;
    const canStaff = staffingRequired <= availableForStructures;
    const isActive = staffingRequired <= 0 || canStaff;

    if (isActive && staffingRequired > 0) {
      availableForStructures -= staffingRequired;
      structureStaffingReserved += staffingRequired;
    }

    if (isActive) {
      const tierCapacityBonus = getSettlementStructureCapacityBonus(structure);
      foodCapacity +=
        settlementSpec?.foodCapacityBonusByTier && tierCapacityBonus != null
          ? tierCapacityBonus
          : Number.isFinite(settlementSpec.foodCapacityBonus)
            ? Math.max(0, Math.floor(settlementSpec.foodCapacityBonus))
            : 0;
      populationCapacity +=
        settlementSpec?.populationCapacityBonusByTier && tierCapacityBonus != null
          ? tierCapacityBonus
          : Number.isFinite(settlementSpec.populationCapacityBonus)
            ? Math.max(0, Math.floor(settlementSpec.populationCapacityBonus))
            : 0;
      const grantedCapabilities = Array.isArray(settlementSpec.capabilities)
        ? settlementSpec.capabilities
        : [];
      for (const capability of grantedCapabilities) {
        if (typeof capability === "string" && capability.length > 0) {
          capabilities.push(capability);
        }
      }
      if (Number.isFinite(structure.instanceId)) {
        activeStructureIds.push(Math.floor(structure.instanceId));
      }
    }

    const upgradeProgress = getSettlementStructureUpgradeProgress(structure);
    const tierCapacityBonus = getSettlementStructureCapacityBonus(structure);

    setStructureRuntime(structure, {
      active: isActive,
      slotIndex,
      staffingRequired,
      reservedPopulation: isActive ? staffingRequired : 0,
      foodCapacityBonus:
        settlementSpec?.foodCapacityBonusByTier && tierCapacityBonus != null
          ? tierCapacityBonus
          : Number.isFinite(settlementSpec.foodCapacityBonus)
            ? Math.max(0, Math.floor(settlementSpec.foodCapacityBonus))
            : 0,
      populationCapacityBonus:
        settlementSpec?.populationCapacityBonusByTier && tierCapacityBonus != null
          ? tierCapacityBonus
          : Number.isFinite(settlementSpec.populationCapacityBonus)
            ? Math.max(0, Math.floor(settlementSpec.populationCapacityBonus))
            : 0,
      capabilities: Array.isArray(settlementSpec.capabilities)
        ? settlementSpec.capabilities.filter((entry) => typeof entry === "string")
        : [],
      upgradeTier: upgradeProgress.tier,
      nextUpgradeTier: upgradeProgress.nextTier,
      upgradeProgressCompleted: upgradeProgress.completedCitizenYearsTowardNextTier,
      upgradeProgressRequired: upgradeProgress.requiredCitizenYearsForNextTier,
      upgradeProgressRemaining: upgradeProgress.remainingCitizenYearsForNextTier,
    });
  }

  const availableByClass = {};
  for (const classId of classIds) {
    availableByClass[classId] = classAvailability[classId].available;
  }
  const staffingByClass = splitSharedAmountByAvailability(
    availableByClass,
    structureStaffingReserved,
    classIds
  );
  const classSummaries = {};
  for (const classId of classIds) {
    const classState = getPopulationClassState(state, classId);
    const adults = classAvailability[classId].adults;
    const youth = classAvailability[classId].youth;
    const total = classAvailability[classId].total;
    const committed = classAvailability[classId].committed;
    const staffed = Math.max(0, Math.floor(staffingByClass[classId] ?? 0));
    const freeAdults = Math.max(0, adults - committed - staffed);
    classSummaries[classId] = {
      adults,
      youth,
      workPopulation: adults,
      totalPopulation: total,
      total,
      committed,
      staffed,
      reserved: committed + staffed,
      freePopulation: freeAdults,
      free: freeAdults,
      faithTier: typeof classState?.faith?.tier === "string" ? classState.faith.tier : "gold",
      happinessStatus: normalizeHappinessStatus(classState?.happiness?.status),
      fullFeedStreak: Number.isFinite(classState?.happiness?.fullFeedStreak)
        ? Math.max(0, Math.floor(classState.happiness.fullFeedStreak))
        : 0,
      missedFeedStreak: Number.isFinite(classState?.happiness?.missedFeedStreak)
        ? Math.max(0, Math.floor(classState.happiness.missedFeedStreak))
        : 0,
      partialFeedRatios: Array.isArray(classState?.happiness?.partialFeedRatios)
        ? [...classState.happiness.partialFeedRatios]
        : [],
    };
  }

  const uniqueCapabilities = Array.from(new Set(capabilities)).sort((a, b) =>
    a.localeCompare(b)
  );
  const freePopulation = Object.values(classSummaries).reduce(
    (sum, classSummary) => sum + Math.max(0, Math.floor(classSummary.freePopulation ?? 0)),
    0
  );
  const practicePassiveBonusesByClass = getPracticePassiveBonuses(
    state,
    classSummaries,
    getCurrentSeasonKey(state)
  );

  if (core?.props && typeof core.props === "object") {
    core.props.foodCapacity = foodCapacity;
    core.props.populationCapacity = populationCapacity;
    core.props.structureStaffingReserved = structureStaffingReserved;
    core.props.committedPopulation = committedPopulation;
    core.props.freePopulation = freePopulation;
    core.props.capabilities = uniqueCapabilities;
    core.props.activeStructureIds = activeStructureIds.sort((a, b) => a - b);
    core.props.classSummaries = classSummaries;
    core.props.practicePassiveBonusesByClass = practicePassiveBonusesByClass;
  }

  return {
    totalPopulation,
    committedPopulation,
    structureStaffingReserved,
    freePopulation,
    foodCapacity,
    populationCapacity,
    capabilities: uniqueCapabilities,
    classSummaries,
    practicePassiveBonusesByClass,
  };
}

function trimPopulationCommitmentsToTotal(classState) {
  if (!classState || !Array.isArray(classState.commitments)) return false;
  const total = getAdultPopulationForClass(classState);
  let committed = getCommittedPopulationForClass(classState);
  if (committed <= total) return false;
  let changed = false;
  for (let index = classState.commitments.length - 1; index >= 0 && committed > total; index -= 1) {
    const commitment = classState.commitments[index];
    const amount = getCommitmentAmount(commitment);
    if (amount <= 0) {
      classState.commitments.splice(index, 1);
      changed = true;
      continue;
    }
    const overflow = committed - total;
    if (overflow >= amount) {
      classState.commitments.splice(index, 1);
      committed -= amount;
      changed = true;
      continue;
    }
    commitment.amount = Math.max(0, amount - overflow);
    if (commitment.vars && typeof commitment.vars === "object") {
      commitment.vars.practiceAmount = commitment.amount;
    }
    committed -= overflow;
    changed = true;
  }
  return changed;
}

function clampSettlementState(state, summary) {
  const stockpiles = getStockpilesState(state);
  if (!stockpiles) return false;
  let changed = false;

  const foodCapacity = Number.isFinite(summary?.foodCapacity)
    ? Math.max(0, Math.floor(summary.foodCapacity))
    : 0;
  if (Number.isFinite(stockpiles.food) && stockpiles.food > foodCapacity) {
    stockpiles.food = foodCapacity;
    changed = true;
  }
  const redResourceCap = Math.max(0, Math.floor(summary?.totalPopulation ?? 0));
  if (Number.isFinite(stockpiles.redResource) && stockpiles.redResource > redResourceCap) {
    stockpiles.redResource = redResourceCap;
    changed = true;
  }

  const classIds = getSettlementClassIds(state);
  for (const classId of classIds) {
    const classState = getPopulationClassState(state, classId);
    if (!classState) continue;
    if (!Number.isFinite(classState.adults) || classState.adults < 0) {
      classState.adults = 0;
      changed = true;
    }
    if (!Number.isFinite(classState.youth) || classState.youth < 0) {
      classState.youth = 0;
      changed = true;
    }
    if (trimPopulationCommitmentsToTotal(classState)) {
      changed = true;
    }
  }
  if (applySettlementHousingPressureHappinessCap(state, summary)) {
    changed = true;
  }
  return changed;
}

function getPendingPopulationForSource(state, classId, sourceId) {
  const classState = getPopulationClassState(state, classId);
  if (!sourceId || !Array.isArray(classState?.commitments)) return 0;
  return classState.commitments.reduce((sum, commitment) => {
    if (commitment?.sourceId !== sourceId) return sum;
    return sum + getCommitmentAmount(commitment);
  }, 0);
}

function getPracticeReservationRuntime(state, classId, sourceId, tSec) {
  const pendingPopulation = getPendingPopulationForSource(state, classId, sourceId);
  const classState = getPopulationClassState(state, classId);
  const safeNowSec = Number.isFinite(tSec) ? Math.max(0, Math.floor(tSec)) : 0;
  if (!sourceId || !Array.isArray(classState?.commitments) || pendingPopulation <= 0) {
    return {
      activeReservation: false,
      activeAmount: 0,
      activeStartSec: null,
      activeReleaseSec: null,
      activeDurationSec: 0,
      activeRemainingSec: 0,
      activeProgressRemaining: 0,
    };
  }

  let earliestStartSec = null;
  let latestReleaseSec = null;
  for (const commitment of classState.commitments) {
    if (commitment?.sourceId !== sourceId) continue;
    const releaseSec = Number.isFinite(commitment?.releaseSec)
      ? Math.max(0, Math.floor(commitment.releaseSec))
      : null;
    if (releaseSec == null || releaseSec <= safeNowSec) continue;
    const startSec = Number.isFinite(commitment?.startSec)
      ? Math.max(0, Math.floor(commitment.startSec))
      : null;
    earliestStartSec =
      earliestStartSec == null
        ? (startSec ?? safeNowSec)
        : Math.min(earliestStartSec, startSec ?? safeNowSec);
    latestReleaseSec =
      latestReleaseSec == null ? releaseSec : Math.max(latestReleaseSec, releaseSec);
  }

  if (latestReleaseSec == null) {
    return {
      activeReservation: false,
      activeAmount: 0,
      activeStartSec: null,
      activeReleaseSec: null,
      activeDurationSec: 0,
      activeRemainingSec: 0,
      activeProgressRemaining: 0,
    };
  }

  const activeStartSec = earliestStartSec ?? safeNowSec;
  const activeDurationSec = Math.max(1, latestReleaseSec - activeStartSec);
  const activeRemainingSec = Math.max(0, latestReleaseSec - safeNowSec);
  return {
    activeReservation: true,
    activeProgressKind: "reservation",
    activeAmount: pendingPopulation,
    activeStartSec,
    activeReleaseSec: latestReleaseSec,
    activeDurationSec,
    activeRemainingSec,
    activeProgressRemaining: clampRatio(activeRemainingSec / activeDurationSec),
  };
}

function getPracticeCadenceRuntime(def, tSec) {
  const cadenceSec = Number.isFinite(def?.timing?.cadenceSec)
    ? Math.max(1, Math.floor(def.timing.cadenceSec))
    : 0;
  const safeNowSec = Number.isFinite(tSec) ? Math.max(0, Math.floor(tSec)) : 0;
  if (cadenceSec <= 0) {
    return {
      activeReservation: false,
      activeProgressKind: null,
      activeAmount: 0,
      activeStartSec: null,
      activeReleaseSec: null,
      activeDurationSec: 0,
      activeRemainingSec: 0,
      activeProgressRemaining: 0,
    };
  }
  const secondsIntoCadence = safeNowSec % cadenceSec;
  const activeRemainingSec =
    secondsIntoCadence === 0 ? cadenceSec : cadenceSec - secondsIntoCadence;
  const activeStartSec = safeNowSec - secondsIntoCadence;
  return {
    activeReservation: false,
    activeProgressKind: "cadence",
    activeAmount: 0,
    activeStartSec,
    activeReleaseSec: activeStartSec + cadenceSec,
    activeDurationSec: cadenceSec,
    activeRemainingSec,
    activeProgressRemaining: clampRatio(activeRemainingSec / cadenceSec),
  };
}

function getPracticeProgressRuntime(state, classId, cardDef, executionDef, tSec) {
  const reservationRuntime = getPracticeReservationRuntime(state, classId, cardDef?.id, tSec);
  if (reservationRuntime.activeReservation) return reservationRuntime;
  return getPracticeCadenceRuntime(executionDef || cardDef, tSec);
}

function resolveMirrorPractice(state, sourceClassId, summary, tSec) {
  const practiceSlots = getSettlementPracticeSlotsByClass(state, sourceClassId);
  const seasonKey = getCurrentSeasonKey(state);
  for (let slotIndex = 0; slotIndex < practiceSlots.length; slotIndex += 1) {
    const card = practiceSlots[slotIndex]?.card ?? null;
    if (!card) continue;
    const def = settlementPracticeDefs[card.defId];
    if (!def || getPracticeMode(def) !== "active" || def.mirrorPracticeFromClassId) continue;
    const runtime = getPracticeReservationRuntime(state, sourceClassId, card.defId, tSec);
    if (runtime.activeReservation) {
      return { card, def };
    }
  }
  for (let slotIndex = 0; slotIndex < practiceSlots.length; slotIndex += 1) {
    const card = practiceSlots[slotIndex]?.card ?? null;
    if (!card) continue;
    const def = settlementPracticeDefs[card.defId];
    if (!def || getPracticeMode(def) !== "active" || def.mirrorPracticeFromClassId) continue;
    const requirementResult = practiceRequirementsPass(def, state, summary, seasonKey, sourceClassId);
    const amountResult = requirementResult.ok
      ? resolvePracticeAmountResult(def, state, summary)
      : { amount: 0, reason: null };
    if (requirementResult.ok && amountResult.amount > 0) {
      return { card, def };
    }
  }
  return null;
}

function resolvePracticeExecutionDef(state, ownerClassId, card, summary, tSec) {
  const def = settlementPracticeDefs[card?.defId];
  if (!def) {
    return { cardDef: null, executionDef: null, mirroredFrom: null, blockedReason: "missingDef" };
  }
  if (!def.mirrorPracticeFromClassId) {
    return { cardDef: def, executionDef: def, mirroredFrom: null, blockedReason: null };
  }
  const mirrored = resolveMirrorPractice(state, def.mirrorPracticeFromClassId, summary, tSec);
  if (!mirrored?.def) {
    return { cardDef: def, executionDef: null, mirroredFrom: null, blockedReason: "mirrorSource" };
  }
  return {
    cardDef: def,
    executionDef: mirrored.def,
    mirroredFrom: {
      classId: def.mirrorPracticeFromClassId,
      defId: mirrored.def.id,
      title: mirrored.def.name,
    },
    blockedReason: null,
  };
}

function findActivePracticeSlotIndex(state, classId, tSec) {
  const practiceSlots = getSettlementPracticeSlotsByClass(state, classId);
  for (let slotIndex = 0; slotIndex < practiceSlots.length; slotIndex += 1) {
    const card = practiceSlots[slotIndex]?.card ?? null;
    if (!card) continue;
    const def = settlementPracticeDefs[card.defId];
    if (!def || getPracticeMode(def) !== "active") continue;
    const reservationRuntime = getPracticeReservationRuntime(state, classId, def.id, tSec);
    if (reservationRuntime.activeReservation) {
      return slotIndex;
    }
  }
  return null;
}

function syncPracticeIndicators(state, tSec, summary) {
  const seasonKey = getCurrentSeasonKey(state);
  const classIds = getSettlementClassIds(state);
  for (const classId of classIds) {
    const classSummary = summary?.classSummaries?.[classId] ?? {
      totalPopulation: 0,
      freePopulation: 0,
    };
    const practiceSlots = getSettlementPracticeSlotsByClass(state, classId);
    const activePracticeSlotIndex = findActivePracticeSlotIndex(state, classId, tSec);
    for (let slotIndex = 0; slotIndex < practiceSlots.length; slotIndex += 1) {
      const card = practiceSlots[slotIndex]?.card ?? null;
      if (!card) continue;
      const cardDef = settlementPracticeDefs[card.defId];
      if (!cardDef) continue;

      const resolved = resolvePracticeExecutionDef(state, classId, card, classSummary, tSec);
      const executionDef = resolved.executionDef;
      const practiceMode = getPracticeMode(cardDef);
      const requirementResult = executionDef
        ? practiceRequirementsPass(executionDef, state, classSummary, seasonKey, classId)
        : { ok: false, reason: resolved.blockedReason };
      const amountResult =
        executionDef && requirementResult.ok
          ? resolvePracticeAmountResult(executionDef, state, classSummary)
          : { amount: 0, reason: null };
      const previewAmount = amountResult.amount;

      if (practiceMode === "passive") {
        setPracticeRuntime(card, {
          practiceMode,
          slotIndex,
          ownerClassId: classId,
          pendingPopulation: 0,
          previewAmount,
          available: !!executionDef && requirementResult.ok && amountResult.reason == null,
          blockedReason: executionDef
            ? requirementResult.ok
              ? amountResult.reason
              : requirementResult.reason
            : resolved.blockedReason,
          activeReservation: false,
          activeProgressKind: null,
          activeAmount: 0,
          activeStartSec: null,
          activeReleaseSec: null,
          activeDurationSec: 0,
          activeRemainingSec: 0,
          activeProgressRemaining: 0,
          mirroredPracticeTitle: resolved.mirroredFrom?.title ?? null,
          ...getPracticeUpgradeTargetRuntime(state, cardDef),
          lastEvaluatedSec: tSec,
        });
        continue;
      }

      const progressRuntime = getPracticeProgressRuntime(
        state,
        classId,
        cardDef,
        executionDef,
        tSec
      );
      const blockedReason = progressRuntime.activeReservation
        ? null
        : activePracticeSlotIndex != null
          ? "priority"
          : executionDef
            ? requirementResult.ok
              ? amountResult.reason
              : requirementResult.reason
            : resolved.blockedReason;
      setPracticeRuntime(card, {
        practiceMode,
        slotIndex,
        ownerClassId: classId,
        pendingPopulation: progressRuntime.activeAmount,
        previewAmount,
        available:
          progressRuntime.activeReservation ||
          (activePracticeSlotIndex == null &&
            !!executionDef &&
            requirementResult.ok &&
            previewAmount > 0),
        blockedReason,
        mirroredPracticeTitle: resolved.mirroredFrom?.title ?? null,
        mirroredPracticeClassId: resolved.mirroredFrom?.classId ?? null,
        ...getPracticeUpgradeTargetRuntime(state, cardDef),
        ...progressRuntime,
        lastEvaluatedSec: tSec,
      });
    }
  }
}

export function syncSettlementDerivedState(state, tSec = 0, executionContext = null) {
  const activeExecutionContext =
    executionContext ?? createSettlementExecutionContext(state, tSec);
  const desiredBlueResource = getStockpilesState(state)?.blueResource;
  if (Number.isFinite(desiredBlueResource)) {
    syncSettlementHinterlandBlueResource(state, desiredBlueResource);
  }
  let summary = activeExecutionContext.getDerivedSummary();
  if (clampSettlementState(state, summary)) {
    if (Number.isFinite(getStockpilesState(state)?.blueResource)) {
      syncSettlementHinterlandBlueResource(state, getStockpilesState(state).blueResource);
    }
    activeExecutionContext.invalidateDerivedSummary();
    summary = activeExecutionContext.getDerivedSummary();
  }
  syncPracticeIndicators(state, tSec, summary);
  return summary;
}
