import {
  DEMOGRAPHIC_STEP_YEARS,
  SEASON_DISPLAY,
  SETTLEMENT_BRONZE_FLOOR_COLLAPSE_LOSS_RATE,
  SETTLEMENT_HAPPINESS_FULL_FEED_STREAK_FOR_INCREASE,
  SETTLEMENT_HAPPINESS_MISSED_FEED_STREAK_FOR_STARVATION,
  SETTLEMENT_HAPPINESS_PARTIAL_FEED_MIN_POPULATION_RATIO,
  SETTLEMENT_HAPPINESS_PARTIAL_MEMORY_LENGTH,
  SETTLEMENT_STARVATION_EVENT_POPULATION_LOSS_RATE,
  SETTLEMENT_YEARLY_POPULATION_RATE_BY_FAITH,
  YOUTH_DECAY_RATE,
  YOUTH_PER_FOOD,
  YOUTH_TO_ADULT_RATE,
} from "../defs/gamesettings/gamerules-defs.js";
import { hubStructureDefs } from "../defs/gamepieces/hub-structure-defs.js";
import { settlementPracticeDefs } from "../defs/gamepieces/settlement-practice-defs.js";
import { pushGameEvent } from "./event-feed.js";
import { runEffect } from "./effects/index.js";
import { passiveTimingPasses } from "./passive-timing.js";
import {
  getSettlementChaosGodState,
  stepSettlementChaosSecond,
} from "./settlement-chaos.js";
import { stepSettlementOrders } from "./settlement-order-exec.js";
import { getCurrentSeasonKey } from "./state.js";
import { stepSettlementVassals } from "./settlement-vassal-exec.js";
import { TIER_ASC } from "./effects/core/tiers.js";
import {
  getHubCore,
  getSettlementClassIds,
  getSettlementFaithTier,
  getSettlementPopulationClassState,
  getSettlementPracticeSlotsByClass,
  getSettlementStockpile,
  getSettlementStructureSlots,
  syncSettlementFloodplainGreenResource,
  syncSettlementHinterlandBlueResource,
} from "./settlement-state.js";
import {
  ensureSettlementStructureUpgradeState,
  findSettlementStructureByDefId,
  getSettlementStructureCapacityBonus,
  getSettlementStructureCurrentTier,
  getSettlementStructureNextTier,
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

function setPopulationClassCounts(classState, adults, youth) {
  if (!classState || typeof classState !== "object") return;
  classState.adults = Number.isFinite(adults) ? Math.max(0, Math.floor(adults)) : 0;
  classState.youth = Number.isFinite(youth) ? Math.max(0, Math.floor(youth)) : 0;
}

function addAdultPopulation(classState, amount) {
  if (!classState || typeof classState !== "object") return 0;
  const delta = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
  if (delta <= 0) return getAdultPopulationForClass(classState);
  const nextAdults = getAdultPopulationForClass(classState) + delta;
  setPopulationClassCounts(classState, nextAdults, getYouthPopulationForClass(classState));
  return nextAdults;
}

function addYouthPopulation(classState, amount) {
  if (!classState || typeof classState !== "object") return 0;
  const delta = Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0;
  if (delta <= 0) return getYouthPopulationForClass(classState);
  const nextYouth = getYouthPopulationForClass(classState) + delta;
  setPopulationClassCounts(classState, getAdultPopulationForClass(classState), nextYouth);
  return nextYouth;
}

function reducePopulationFromClass(classState, amount) {
  if (!classState || typeof classState !== "object") {
    return { adultsRemoved: 0, youthRemoved: 0, totalRemoved: 0 };
  }
  const adults = getAdultPopulationForClass(classState);
  const youth = getYouthPopulationForClass(classState);
  const total = adults + youth;
  const targetRemoval = Math.min(
    total,
    Number.isFinite(amount) ? Math.max(0, Math.floor(amount)) : 0
  );
  if (targetRemoval <= 0 || total <= 0) {
    return { adultsRemoved: 0, youthRemoved: 0, totalRemoved: 0 };
  }

  let adultsRemoved = Math.min(adults, Math.floor((targetRemoval * adults) / total));
  let youthRemoved = Math.min(youth, targetRemoval - adultsRemoved);
  let remaining = targetRemoval - adultsRemoved - youthRemoved;
  if (remaining > 0) {
    const extraYouth = Math.min(youth - youthRemoved, remaining);
    youthRemoved += extraYouth;
    remaining -= extraYouth;
  }
  if (remaining > 0) {
    const extraAdults = Math.min(adults - adultsRemoved, remaining);
    adultsRemoved += extraAdults;
    remaining -= extraAdults;
  }

  setPopulationClassCounts(classState, adults - adultsRemoved, youth - youthRemoved);
  return {
    adultsRemoved,
    youthRemoved,
    totalRemoved: adultsRemoved + youthRemoved,
  };
}

function getYouthPerFood() {
  const youthPerFood = Number.isFinite(YOUTH_PER_FOOD)
    ? Math.max(1, Math.floor(YOUTH_PER_FOOD))
    : 2;
  return youthPerFood;
}

function getYouthFoodDemand(youthCount) {
  const youth = Number.isFinite(youthCount) ? Math.max(0, Math.floor(youthCount)) : 0;
  if (youth <= 0) return 0;
  return Math.ceil(youth / getYouthPerFood());
}

function getWeightedFoodDemandForClass(classState) {
  const youth = getYouthPopulationForClass(classState);
  return getAdultPopulationForClass(classState) + getYouthFoodDemand(youth);
}

function roundMealValue(value) {
  return Number(Number.isFinite(value) ? value : 0).toFixed(4) * 1;
}

function shouldRunDemographicStep(priorYear) {
  const cadence = Number.isFinite(DEMOGRAPHIC_STEP_YEARS)
    ? Math.max(1, Math.floor(DEMOGRAPHIC_STEP_YEARS))
    : 5;
  const year = Number.isFinite(priorYear) ? Math.max(1, Math.floor(priorYear)) : 1;
  return year % cadence === 0;
}

function applyDemographicStep(classState) {
  const youthBefore = getYouthPopulationForClass(classState);
  if (youthBefore <= 0) {
    return { youthBefore, toAdults: 0, decayed: 0, youthAfter: 0, adultsAfter: getAdultPopulationForClass(classState) };
  }
  const toAdultsRate = Number.isFinite(YOUTH_TO_ADULT_RATE)
    ? Math.max(0, Number(YOUTH_TO_ADULT_RATE))
    : 0.4;
  const decayRate = Number.isFinite(YOUTH_DECAY_RATE)
    ? Math.max(0, Number(YOUTH_DECAY_RATE))
    : 0.2;
  const toAdults = Math.min(youthBefore, Math.floor(youthBefore * toAdultsRate));
  const decayed = Math.min(youthBefore - toAdults, Math.floor(youthBefore * decayRate));
  const youthAfter = Math.max(0, youthBefore - toAdults - decayed);
  const adultsAfter = getAdultPopulationForClass(classState) + toAdults;
  setPopulationClassCounts(classState, adultsAfter, youthAfter);
  return { youthBefore, toAdults, decayed, youthAfter, adultsAfter };
}

function buildPracticePassiveKey(card, classId) {
  const instanceId = Number.isFinite(card?.instanceId) ? Math.floor(card.instanceId) : 0;
  return `settlement:practice:${classId || "default"}:${instanceId}`;
}

function getPracticeMode(def) {
  return def?.practiceMode === "passive" ? "passive" : "active";
}

function shiftTier(tier, delta = 0) {
  const normalized = typeof tier === "string" && TIER_ASC.includes(tier) ? tier : TIER_ASC[0];
  const index = TIER_ASC.indexOf(normalized);
  const nextIndex = Math.max(0, Math.min(TIER_ASC.length - 1, index + Math.floor(delta)));
  return TIER_ASC[nextIndex] || normalized;
}

function getHappinessFullFeedThreshold() {
  const raw = Number.isFinite(SETTLEMENT_HAPPINESS_FULL_FEED_STREAK_FOR_INCREASE)
    ? Math.floor(SETTLEMENT_HAPPINESS_FULL_FEED_STREAK_FOR_INCREASE)
    : 3;
  return Math.max(1, raw);
}

function getHappinessMissedFeedThreshold() {
  const raw = Number.isFinite(SETTLEMENT_HAPPINESS_MISSED_FEED_STREAK_FOR_STARVATION)
    ? Math.floor(SETTLEMENT_HAPPINESS_MISSED_FEED_STREAK_FOR_STARVATION)
    : 3;
  return Math.max(1, raw);
}

function getHappinessPartialMemoryLength() {
  const raw = Number.isFinite(SETTLEMENT_HAPPINESS_PARTIAL_MEMORY_LENGTH)
    ? Math.floor(SETTLEMENT_HAPPINESS_PARTIAL_MEMORY_LENGTH)
    : 3;
  return Math.max(1, raw);
}

function getHappinessPartialFeedMinPopulationRatio() {
  const raw = Number.isFinite(SETTLEMENT_HAPPINESS_PARTIAL_FEED_MIN_POPULATION_RATIO)
    ? Number(SETTLEMENT_HAPPINESS_PARTIAL_FEED_MIN_POPULATION_RATIO)
    : 0.5;
  return Math.max(0, Math.min(1, raw));
}

function normalizeHappinessStatus(value) {
  if (value === "positive" || value === "negative") return value;
  return "neutral";
}

function shiftHappinessStatus(status, delta = 0) {
  const order = ["negative", "neutral", "positive"];
  const normalized = normalizeHappinessStatus(status);
  const index = order.indexOf(normalized);
  const nextIndex = Math.max(0, Math.min(order.length - 1, index + Math.floor(delta)));
  return order[nextIndex] || normalized;
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

function computeFaithPopulationPenalty(totalPopulation, kind) {
  const total = Number.isFinite(totalPopulation)
    ? Math.max(0, Math.floor(totalPopulation))
    : 0;
  if (total <= 0) return 0;
  if (kind !== "faithCollapsed") {
    return 0;
  }
  const collapseRate = Number.isFinite(SETTLEMENT_BRONZE_FLOOR_COLLAPSE_LOSS_RATE)
    ? Math.max(0, Number(SETTLEMENT_BRONZE_FLOOR_COLLAPSE_LOSS_RATE))
    : 0.5;
  return Math.min(total, Math.max(1, Math.floor(total * collapseRate)));
}

function getSettlementYearlyPopulationFaithRate(faithTier) {
  if (
    SETTLEMENT_YEARLY_POPULATION_RATE_BY_FAITH &&
    typeof SETTLEMENT_YEARLY_POPULATION_RATE_BY_FAITH === "object"
  ) {
    const rate = SETTLEMENT_YEARLY_POPULATION_RATE_BY_FAITH[faithTier];
    if (Number.isFinite(rate)) return Number(rate);
  }
  return 0;
}

function getSeasonMealOutcomeKind(classState, attempts, successes) {
  const safeAttempts = Number.isFinite(attempts) ? Math.max(0, Number(attempts)) : 0;
  const safeSuccesses = Number.isFinite(successes) ? Math.max(0, Number(successes)) : 0;
  const totalPopulation = getTotalPopulationForClass(classState);
  const partialThreshold = totalPopulation * getHappinessPartialFeedMinPopulationRatio();
  if (safeAttempts <= 0) return "dormant";
  if (safeSuccesses >= safeAttempts - 0.0001) return "full";
  if (safeSuccesses + 0.0001 >= partialThreshold) return "partial";
  return "missed";
}

function getSeasonFeedRatio(attempts, successes) {
  const safeAttempts = Number.isFinite(attempts) ? Math.max(0, Number(attempts)) : 0;
  if (safeAttempts <= 0) return 0;
  const safeSuccesses = Number.isFinite(successes) ? Math.max(0, Number(successes)) : 0;
  return Math.max(0, Math.min(1, safeSuccesses / safeAttempts));
}

function applySeasonHappinessOutcome(happinessState, seasonOutcomeKind, feedRatio) {
  if (!happinessState || typeof happinessState !== "object") {
    return {
      previousStatus: "neutral",
      nextStatus: "neutral",
      fullFeedStreak: 0,
      missedFeedStreak: 0,
      partialFeedRatios: [],
      seasonOutcomeKind,
      feedRatio,
      starvationTriggered: false,
      changed: false,
    };
  }

  const previousStatus = normalizeHappinessStatus(happinessState.status);
  let nextStatus = previousStatus;
  let fullFeedStreak = Number.isFinite(happinessState.fullFeedStreak)
    ? Math.max(0, Math.floor(happinessState.fullFeedStreak))
    : 0;
  let missedFeedStreak = Number.isFinite(happinessState.missedFeedStreak)
    ? Math.max(0, Math.floor(happinessState.missedFeedStreak))
    : 0;
  let partialFeedRatios = Array.isArray(happinessState.partialFeedRatios)
    ? happinessState.partialFeedRatios
        .map((value) =>
          Number.isFinite(value) ? Math.max(0, Math.min(1, Number(value))) : null
        )
        .filter((value) => value != null)
        .slice(-getHappinessPartialMemoryLength())
    : [];
  const fullThreshold = getHappinessFullFeedThreshold();
  const missedThreshold = getHappinessMissedFeedThreshold();
  const partialMemoryLength = getHappinessPartialMemoryLength();
  let starvationTriggered = false;

  if (seasonOutcomeKind === "full") {
    fullFeedStreak += 1;
    missedFeedStreak = 0;
    partialFeedRatios = [];
    if (fullFeedStreak >= fullThreshold) {
      nextStatus = "positive";
      fullFeedStreak = 0;
    }
  } else if (seasonOutcomeKind === "partial") {
    const safeFeedRatio = Math.max(0, Math.min(1, Number(feedRatio) || 0));
    const previousPartialRatio =
      partialFeedRatios.length > 0 ? partialFeedRatios[partialFeedRatios.length - 1] : null;
    fullFeedStreak = 0;
    missedFeedStreak = 0;
    if (previousPartialRatio != null && safeFeedRatio <= previousPartialRatio + 0.0001) {
      nextStatus = shiftHappinessStatus(previousStatus, -1);
      partialFeedRatios = [safeFeedRatio];
    } else {
      partialFeedRatios = [...partialFeedRatios, safeFeedRatio].slice(-partialMemoryLength);
      if (partialFeedRatios.length >= partialMemoryLength) {
        nextStatus = shiftHappinessStatus(previousStatus, 1);
        partialFeedRatios = [];
      }
    }
  } else if (seasonOutcomeKind === "missed") {
    fullFeedStreak = 0;
    partialFeedRatios = [];
    missedFeedStreak = Math.min(missedThreshold, missedFeedStreak + 1);
    starvationTriggered = missedFeedStreak >= missedThreshold;
  } else {
    fullFeedStreak = 0;
    missedFeedStreak = 0;
    partialFeedRatios = [];
  }

  happinessState.status = nextStatus;
  happinessState.fullFeedStreak = fullFeedStreak;
  happinessState.missedFeedStreak = missedFeedStreak;
  happinessState.partialFeedRatios = partialFeedRatios;
  return {
    previousStatus,
    nextStatus,
    fullFeedStreak,
    missedFeedStreak,
    partialFeedRatios,
    seasonOutcomeKind,
    feedRatio,
    starvationTriggered,
    changed: previousStatus !== nextStatus,
  };
}

function clampRatio(value) {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 1) return 1;
  return value;
}

function applyYearlyHousingAttraction(yearlyState, housingVacancy, attractionRateRaw = 0) {
  if (!yearlyState || typeof yearlyState !== "object") {
    return { attracted: 0, attractionProgress: 0 };
  }
  const vacancy = Number.isFinite(housingVacancy) ? Math.max(0, Math.floor(housingVacancy)) : 0;
  const attractionRate = Number.isFinite(attractionRateRaw)
    ? Math.max(0, Number(attractionRateRaw))
    : 0;
  if (vacancy <= 0 || attractionRate <= 0) {
    yearlyState.attractionProgress = 0;
    return { attracted: 0, attractionProgress: 0 };
  }
  const existingProgress = Number.isFinite(yearlyState.attractionProgress)
    ? Math.max(0, Number(yearlyState.attractionProgress))
    : 0;
  const progressWithVacancy = existingProgress + vacancy * attractionRate;
  const attracted = Math.min(vacancy, Math.floor(progressWithVacancy));
  yearlyState.attractionProgress = Math.max(0, progressWithVacancy - attracted);
  return {
    attracted: Math.max(0, Math.floor(attracted)),
    attractionProgress: yearlyState.attractionProgress,
  };
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
        key && Number.isFinite(stockpiles?.[key]) ? Math.max(0, Math.floor(stockpiles[key])) : 0;
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
  if (effect.op !== "AdjustSystemState") return null;
  if (effect.system !== "stockpiles") return null;
  if (typeof effect.key !== "string" || !effect.key.length) return null;
  if (effect.amountVar !== "practiceAmount") return null;
  const amountScale = Number.isFinite(effect.amountScale) ? Number(effect.amountScale) : 1;
  if (!Number.isFinite(amountScale) || amountScale >= 0) return null;
  return {
    key: effect.key,
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
    const available = Number.isFinite(stockpiles?.[cost.key])
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
        const value = Number.isFinite(stockpiles?.[key]) ? Math.floor(stockpiles[key]) : 0;
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
        const value = Number.isFinite(stockpiles?.[key]) ? Math.floor(stockpiles[key]) : 0;
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

function releaseExpiredPopulationCommitments(state, tSec) {
  const core = getHubCore(state);
  let changed = false;

  for (const classId of getSettlementClassIds(state)) {
    const classState = getPopulationClassState(state, classId);
    if (!classState || !Array.isArray(classState.commitments)) continue;

    const remaining = [];
    const expired = [];
    for (const commitment of classState.commitments) {
      const releaseSec = Number.isFinite(commitment?.releaseSec)
        ? Math.floor(commitment.releaseSec)
        : null;
      if (releaseSec == null) continue;
      if (releaseSec <= tSec) {
        expired.push(commitment);
      } else {
        remaining.push(commitment);
      }
    }

    if (expired.length <= 0) continue;
    classState.commitments = remaining;
    changed = true;

    for (const commitment of expired) {
      if (!commitment?.onReleaseEffects) continue;
      runEffect(state, commitment.onReleaseEffects, {
        kind: "game",
        state,
        source: core,
        tSec,
        commitment,
        populationClassId: classId,
        fromPopulationClassId: classId,
        vars: {
          ...(commitment.vars && typeof commitment.vars === "object" && !Array.isArray(commitment.vars)
            ? commitment.vars
            : {}),
          practiceAmount: getCommitmentAmount(commitment),
          commitmentAmount: getCommitmentAmount(commitment),
        },
      });
    }
  }

  return changed;
}

function consumeSettlementMealsOnSeasonChange(state, tSec) {
  const stockpiles = getStockpilesState(state);
  if (!stockpiles) return false;

  let changed = false;
  let availableFood = Number.isFinite(stockpiles.food) ? Math.max(0, Number(stockpiles.food)) : 0;
  const totalMealDemand = getSettlementClassIds(state).reduce((sum, classId) => {
    return sum + getWeightedFoodDemandForClass(getPopulationClassState(state, classId));
  }, 0);
  const reserveRatio = Math.max(
    0,
    Number(
      Object.values(getHubCore(state)?.props?.practicePassiveBonusesByClass ?? {}).reduce(
        (max, bonuses) => {
          const ratio = Number(bonuses?.emergencyFoodReserveRatio ?? 0);
          return Math.max(max, Number.isFinite(ratio) ? ratio : 0);
        },
        0
      )
    )
  );
  const emergencyReserveFood =
    reserveRatio > 0 && availableFood + 0.0001 < totalMealDemand
      ? availableFood * Math.min(1, reserveRatio)
      : 0;
  let spendableFood = Math.max(0, availableFood - emergencyReserveFood);
  const seasonKey = getCurrentSeasonKey(state);
  const seasonLabel = SEASON_DISPLAY?.[seasonKey] || seasonKey || "Season";

  for (const classId of getSettlementClassIds(state)) {
    const classState = getPopulationClassState(state, classId);
    const yearlyState = classState?.yearly;
    const happinessState = classState?.happiness;
    if (!classState || !yearlyState) continue;
    const attempts = getWeightedFoodDemandForClass(classState);
    const successes = Math.min(attempts, spendableFood);
    const misses = Math.max(0, attempts - successes);
    const feedRatio = getSeasonFeedRatio(attempts, successes);
    const seasonOutcomeKind = getSeasonMealOutcomeKind(classState, attempts, successes);
    const happinessOutcome = applySeasonHappinessOutcome(
      happinessState,
      seasonOutcomeKind,
      feedRatio
    );
    spendableFood = Math.max(0, spendableFood - successes);
    availableFood = spendableFood + emergencyReserveFood;
    yearlyState.mealAttempts = roundMealValue(Number(yearlyState.mealAttempts ?? 0) + attempts);
    yearlyState.mealSuccesses = roundMealValue(
      Number(yearlyState.mealSuccesses ?? 0) + successes
    );
    yearlyState.lastSeasonOutcomeKind = seasonOutcomeKind;
    yearlyState.lastSeasonFeedRatio = roundMealValue(feedRatio);
    changed = true;

    let starvationLoss = { adultsRemoved: 0, youthRemoved: 0, totalRemoved: 0 };
    let starvationFaithBefore = null;
    let starvationFaithAfter = null;
    let starvationHappinessBefore = null;
    let starvationHappinessAfter = null;
    if (happinessOutcome.starvationTriggered) {
      const currentPopulation = getTotalPopulationForClass(classState);
      const starvationLossRate = Number.isFinite(SETTLEMENT_STARVATION_EVENT_POPULATION_LOSS_RATE)
        ? Math.max(0, Number(SETTLEMENT_STARVATION_EVENT_POPULATION_LOSS_RATE))
        : 0.2;
      const starvationLossAmount = Math.min(
        currentPopulation,
        Math.max(1, Math.floor(currentPopulation * starvationLossRate))
      );
      starvationLoss = reducePopulationFromClass(classState, starvationLossAmount);
      starvationFaithBefore = typeof classState?.faith?.tier === "string" ? classState.faith.tier : "gold";
      starvationHappinessBefore = normalizeHappinessStatus(happinessState?.status);
      if (classState?.faith && typeof classState.faith === "object") {
        classState.faith.tier = shiftTier(starvationFaithBefore, -1);
        starvationFaithAfter = classState.faith.tier;
      }
      if (happinessState && typeof happinessState === "object") {
        happinessState.status = shiftHappinessStatus(starvationHappinessBefore, -1);
        happinessState.fullFeedStreak = 0;
        happinessState.partialFeedRatios = [];
        starvationHappinessAfter = happinessState.status;
      }
      happinessOutcome.nextStatus = normalizeHappinessStatus(happinessState?.status);
      happinessOutcome.fullFeedStreak = Math.max(0, Math.floor(happinessState?.fullFeedStreak ?? 0));
      happinessOutcome.missedFeedStreak = Math.max(0, Math.floor(happinessState?.missedFeedStreak ?? 0));
      happinessOutcome.partialFeedRatios = Array.isArray(happinessState?.partialFeedRatios)
        ? [...happinessState.partialFeedRatios]
        : [];
      changed = true;
    }

    if (attempts <= 0) continue;
    pushGameEvent(state, {
      type: "populationSeasonMeal",
      tSec,
      text:
        `${classId} consumed ${roundMealValue(successes)}/${roundMealValue(attempts)} weighted meals in ${seasonLabel}` +
        ` (${seasonOutcomeKind}, happiness ${happinessOutcome.previousStatus} -> ${happinessOutcome.nextStatus})`,
      data: {
        focusKind: "hubCore",
        hubStructureId: null,
        classId,
        mealAttempts: roundMealValue(attempts),
        mealSuccesses: roundMealValue(successes),
        mealMisses: roundMealValue(misses),
        feedRatio: roundMealValue(feedRatio),
        adults: getAdultPopulationForClass(classState),
        youth: getYouthPopulationForClass(classState),
        youthPerFood: getYouthPerFood(),
        youthFoodRoundsUp: true,
        seasonKey,
        seasonOutcomeKind,
        happiness: {
          previousStatus: happinessOutcome.previousStatus,
          nextStatus: happinessOutcome.nextStatus,
          fullFeedStreak: happinessOutcome.fullFeedStreak,
          missedFeedStreak: happinessOutcome.missedFeedStreak,
          partialFeedRatios: happinessOutcome.partialFeedRatios,
          fullFeedThreshold: getHappinessFullFeedThreshold(),
          missedFeedThreshold: getHappinessMissedFeedThreshold(),
          partialMemoryLength: getHappinessPartialMemoryLength(),
        },
      },
    });

    if (happinessOutcome.starvationTriggered) {
      pushGameEvent(state, {
        type: "populationStarvationEvent",
        tSec,
        text:
          `${classId} starvation event in ${seasonLabel}: lost ${starvationLoss.totalRemoved} population, ` +
          `happiness ${starvationHappinessBefore} -> ${starvationHappinessAfter}, ` +
          `faith ${starvationFaithBefore} -> ${starvationFaithAfter}`,
        data: {
          classId,
          seasonKey,
          feedRatio: roundMealValue(feedRatio),
          starvationLoss,
          happiness: {
            previousStatus: starvationHappinessBefore,
            nextStatus: starvationHappinessAfter,
          },
          faith: {
            previousTier: starvationFaithBefore,
            nextTier: starvationFaithAfter,
          },
        },
      });
    }
  }

  stockpiles.food = roundMealValue(availableFood);
  return changed;
}

function maybeApplySettlementYearlyPopulationChange(state, tSec) {
  const core = getHubCore(state);
  const stockpiles = getStockpilesState(state);
  if (!core || !stockpiles) return false;

  const currentYear = Number.isFinite(state?.year) ? Math.max(1, Math.floor(state.year)) : 1;
  const classIds = getSettlementClassIds(state);
  if (
    !classIds.some((classId) => {
      const yearlyState = getPopulationClassState(state, classId)?.yearly;
      return yearlyState && yearlyState.year < currentYear;
    })
  ) {
    return false;
  }

  const yearlyResults = {};
  for (const classId of classIds) {
    const classState = getPopulationClassState(state, classId);
    const yearlyState = classState?.yearly;
    const faithState = classState?.faith;
    if (!classState || !yearlyState || yearlyState.year >= currentYear) continue;

    const previousAdults = getAdultPopulationForClass(classState);
    const previousYouth = getYouthPopulationForClass(classState);
    const previousPopulation = previousAdults + previousYouth;
    const previousFaithTier = typeof faithState?.tier === "string" ? faithState.tier : "gold";
    const mealAttempts = Number.isFinite(yearlyState.mealAttempts)
      ? Math.max(0, Number(yearlyState.mealAttempts))
      : 0;
    const mealSuccesses = Number.isFinite(yearlyState.mealSuccesses)
      ? Math.max(0, Number(yearlyState.mealSuccesses))
      : 0;
    const mealMisses = Math.max(0, mealAttempts - mealSuccesses);

    let outcomeKind = "populationUnchanged";
    let outcomeText = "population held steady";
    let youthGrowth = 0;
    let starvationLoss = { adultsRemoved: 0, youthRemoved: 0, totalRemoved: 0 };

    if (previousPopulation > 0) {
      const faithPopulationRate = getSettlementYearlyPopulationFaithRate(previousFaithTier);
      if (faithPopulationRate > 0) {
        const growth = Math.max(1, Math.floor(previousPopulation * faithPopulationRate));
        youthGrowth = growth;
        addYouthPopulation(classState, growth);
        outcomeKind = "populationChanged";
        outcomeText = `${previousFaithTier} faith growth (+${growth} youth)`;
      } else if (faithPopulationRate < 0) {
        const loss = Math.max(1, Math.floor(previousPopulation * Math.abs(faithPopulationRate)));
        starvationLoss = reducePopulationFromClass(classState, loss);
        outcomeKind = "populationReduced";
        outcomeText = `${previousFaithTier} faith decline (-${starvationLoss.totalRemoved} population)`;
      } else if (mealAttempts === 0) {
        outcomeText = "no yearly meal attempts";
      }
    } else {
      outcomeKind = "populationDormant";
      outcomeText = "no residents";
    }

    yearlyResults[classId] = {
      classId,
      previousAdults,
      previousYouth,
      previousPopulation,
      previousFaithTier,
      mealAttempts: roundMealValue(mealAttempts),
      mealSuccesses: roundMealValue(mealSuccesses),
      mealMisses: roundMealValue(mealMisses),
      outcomeKind,
      outcomeText,
      youthGrowth,
      starvationLoss,
    };
  }

  const afterMealsSummary = computeStructureDerivedState(state);
  let remainingVacancy = Math.max(
    0,
    Math.floor(afterMealsSummary.populationCapacity) - Math.floor(afterMealsSummary.totalPopulation)
  );

  for (const classId of classIds) {
    const result = yearlyResults[classId];
    if (!result) continue;
    const classState = getPopulationClassState(state, classId);
    const yearlyState = classState?.yearly;
    if (!classState || !yearlyState) continue;

    const attractionPerVacancyPerYear = Number(
      afterMealsSummary?.practicePassiveBonusesByClass?.[classId]?.attractionPerVacancyPerYear ?? 0
    );
    const attraction = applyYearlyHousingAttraction(
      yearlyState,
      remainingVacancy,
      attractionPerVacancyPerYear
    );
    const attractedPopulation = Math.min(
      Math.max(0, Math.floor(attraction.attracted ?? 0)),
      remainingVacancy
    );
    addAdultPopulation(classState, attractedPopulation);
    remainingVacancy = Math.max(0, remainingVacancy - attractedPopulation);
    result.attractedPopulation = attractedPopulation;
    result.attractionPerVacancyPerYear = attractionPerVacancyPerYear;
    if (result.previousPopulation <= 0 && attractedPopulation > 0) {
      result.outcomeKind = "populationAttracted";
      result.outcomeText = `vacancy attraction (+${attractedPopulation})`;
    }
  }

  const priorYear = Math.max(1, currentYear - 1);
  const demographicStepsByClass = {};
  if (shouldRunDemographicStep(priorYear)) {
    for (const classId of classIds) {
      const result = yearlyResults[classId];
      if (!result) continue;
      const classState = getPopulationClassState(state, classId);
      if (!classState) continue;
      demographicStepsByClass[classId] = applyDemographicStep(classState);
    }
  }

  const afterAttractionSummary = computeStructureDerivedState(state);
  applySettlementHousingPressureHappinessCap(state, afterAttractionSummary);
  for (const classId of classIds) {
    const result = yearlyResults[classId];
    if (!result) continue;
    const classState = getPopulationClassState(state, classId);
    const yearlyState = classState?.yearly;
    const faithState = classState?.faith;
    const happinessState = classState?.happiness;
    if (!classState || !yearlyState || !faithState || !happinessState) continue;

    const previousFaithTier = typeof faithState.tier === "string" ? faithState.tier : "gold";
    let nextFaithTier = previousFaithTier;
    let faithOutcome = result.previousPopulation > 0 ? "faithUnchanged" : "faithDormant";
    const happinessStatus = normalizeHappinessStatus(happinessState.status);

    if (result.previousPopulation > 0) {
      if (happinessStatus === "positive") {
        nextFaithTier = shiftTier(previousFaithTier, 1);
        faithOutcome =
          nextFaithTier === previousFaithTier ? "faithAlreadyMax" : "faithUpgraded";
      } else if (happinessStatus === "negative") {
        nextFaithTier = shiftTier(previousFaithTier, -1);
        faithOutcome =
          nextFaithTier === previousFaithTier ? "faithCollapsed" : "faithDegraded";
      }
    }

    const populationBeforeFaithPenalty = getTotalPopulationForClass(classState);
    const faithPopulationLoss = computeFaithPopulationPenalty(
      populationBeforeFaithPenalty,
      faithOutcome
    );
    if (faithPopulationLoss > 0) {
      reducePopulationFromClass(classState, faithPopulationLoss);
    }

    faithState.tier = nextFaithTier;
    yearlyState.year = currentYear;
    yearlyState.mealAttempts = 0;
    yearlyState.mealSuccesses = 0;
    yearlyState.lastMealAttempts = result.mealAttempts;
    yearlyState.lastMealSuccesses = result.mealSuccesses;
    yearlyState.lastOutcomeKind = result.outcomeKind;

    const nextAdults = getAdultPopulationForClass(classState);
    const nextYouth = getYouthPopulationForClass(classState);
    const demographicStep = demographicStepsByClass[classId] ?? {
      youthBefore: result.previousYouth + result.youthGrowth,
      toAdults: 0,
      decayed: 0,
      youthAfter: nextYouth,
      adultsAfter: nextAdults,
    };
    const attractionSummaryText =
      result.attractedPopulation > 0 ? `, +${result.attractedPopulation} attracted` : "";
    const demographicSummaryText =
      demographicStep.toAdults > 0 || demographicStep.decayed > 0
        ? `, youth step ${demographicStep.toAdults} -> adults / ${demographicStep.decayed} lost`
        : "";
    const faithPopulationLossText =
      faithPopulationLoss > 0
        ? faithOutcome === "faithCollapsed"
          ? `, bronze-floor collapse lost ${faithPopulationLoss} population`
          : `, faith loss cost ${faithPopulationLoss} population`
        : "";
    const faithSummaryText =
      `, happiness ${happinessStatus}, faith ${previousFaithTier} -> ${nextFaithTier}${faithPopulationLossText}`;
    pushGameEvent(state, {
      type: "populationYearlyUpdate",
      tSec,
      text: `Year ${priorYear} ${classId} update: ${result.previousPopulation} -> ${nextAdults + nextYouth} (${result.outcomeText})${attractionSummaryText}${demographicSummaryText}${faithSummaryText}`,
      data: {
        year: priorYear,
        classId,
        previousAdults: result.previousAdults,
        previousYouth: result.previousYouth,
        previousPopulation: result.previousPopulation,
        nextAdults,
        nextYouth,
        nextPopulation: nextAdults + nextYouth,
        mealAttempts: result.mealAttempts,
        mealSuccesses: result.mealSuccesses,
        mealMisses: result.mealMisses,
        populationOutcome: result.outcomeKind,
        youthGrowth: Math.max(0, Math.floor(result.youthGrowth ?? 0)),
        starvationLoss: result.starvationLoss,
        attractedPopulation: Math.max(0, Math.floor(result.attractedPopulation ?? 0)),
        housingCapacity: Math.max(0, Math.floor(afterAttractionSummary.populationCapacity)),
        housingVacancy: Math.max(
          0,
          Math.floor(afterAttractionSummary.populationCapacity) -
            Math.floor(afterAttractionSummary.totalPopulation)
        ),
        attractionPerVacancyPerYear: Number(result.attractionPerVacancyPerYear ?? 0),
        attractionProgress: Number(yearlyState.attractionProgress ?? 0),
        foodAfterMeals: roundMealValue(stockpiles.food),
        demographicStep,
        faithPopulationLoss,
        lastSeasonFeedRatio: Number(yearlyState.lastSeasonFeedRatio ?? 0),
        happiness: {
          status: happinessStatus,
          fullFeedStreak: Math.max(0, Math.floor(happinessState.fullFeedStreak ?? 0)),
          missedFeedStreak: Math.max(0, Math.floor(happinessState.missedFeedStreak ?? 0)),
          partialFeedRatios: Array.isArray(happinessState.partialFeedRatios)
            ? [...happinessState.partialFeedRatios]
            : [],
          fullFeedThreshold: getHappinessFullFeedThreshold(),
          missedFeedThreshold: getHappinessMissedFeedThreshold(),
          partialMemoryLength: getHappinessPartialMemoryLength(),
          lastSeasonOutcomeKind: yearlyState.lastSeasonOutcomeKind ?? null,
        },
        faith: {
          previousTier: previousFaithTier,
          nextTier: nextFaithTier,
          outcome: faithOutcome,
          populationBeforePenalty: populationBeforeFaithPenalty,
          populationLoss: faithPopulationLoss,
        },
      },
    });
  }

  return true;
}

function runSettlementPopulationSeasonTick(state, tSec) {
  if (!state || state._seasonChanged !== true) return false;
  maybeApplySettlementYearlyPopulationChange(state, tSec);
  return consumeSettlementMealsOnSeasonChange(state, tSec);
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

function executePassivePractices(state, tSec) {
  let summary = computeStructureDerivedState(state);
  const seasonKey = getCurrentSeasonKey(state);
  const core = getHubCore(state);

  for (const classId of getSettlementClassIds(state)) {
    const practiceSlots = getSettlementPracticeSlotsByClass(state, classId);
    const classSummary = summary?.classSummaries?.[classId] ?? {
      totalPopulation: 0,
      freePopulation: 0,
    };
    for (let slotIndex = 0; slotIndex < practiceSlots.length; slotIndex += 1) {
      const card = practiceSlots[slotIndex]?.card ?? null;
      if (!card) continue;
      const cardDef = settlementPracticeDefs[card.defId];
      if (!cardDef || getPracticeMode(cardDef) !== "passive") continue;

      const resolved = resolvePracticeExecutionDef(state, classId, card, classSummary, tSec);
      const executionDef = resolved.executionDef;
      const requirementResult = executionDef
        ? practiceRequirementsPass(executionDef, state, classSummary, seasonKey, classId)
        : { ok: false, reason: resolved.blockedReason };
      const amountResult =
        executionDef && requirementResult.ok
          ? resolvePracticeAmountResult(executionDef, state, classSummary)
          : { amount: 0, reason: null };
      const amount = amountResult.amount;
      const hasPassiveEffects =
        executionDef &&
        (Array.isArray(executionDef?.effects) ? executionDef.effects.length > 0 : !!executionDef?.effects);
      const timingPasses = hasPassiveEffects
        ? passiveTimingPasses(executionDef.timing, state, tSec, {
            passiveKey: buildPracticePassiveKey(card, classId),
            isActive: requirementResult.ok && amount > 0,
          })
        : false;

      setPracticeRuntime(card, {
        practiceMode: "passive",
        slotIndex,
        ownerClassId: classId,
        pendingPopulation: 0,
        previewAmount: amount,
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

      if (!executionDef || !requirementResult.ok || !hasPassiveEffects || !timingPasses || amount <= 0) {
        continue;
      }

      const didChange = runEffect(state, executionDef.effects, {
        kind: "game",
        state,
        source: core,
        tSec,
        practice: card,
        practiceDef: executionDef,
        practiceSourceId: cardDef.id,
        practiceSourceLabel: cardDef.name,
        populationClassId: classId,
        targetPopulationClassId:
          typeof cardDef.passiveTargetPopulationClassId === "string"
            ? cardDef.passiveTargetPopulationClassId
            : classId,
        vars: {
          practiceAmount: amount,
        },
      });
      if (!didChange) continue;

      setPracticeRuntime(card, {
        lastRunSec: tSec,
        lastAmount: amount,
      });
      summary = computeStructureDerivedState(state);
    }
  }

  syncPracticeIndicators(state, tSec, summary);
}

function executePractices(state, tSec) {
  let summary = computeStructureDerivedState(state);
  const seasonKey = getCurrentSeasonKey(state);
  const core = getHubCore(state);

  for (const classId of getSettlementClassIds(state)) {
    const practiceSlots = getSettlementPracticeSlotsByClass(state, classId);
    const classSummary = summary?.classSummaries?.[classId] ?? {
      totalPopulation: 0,
      freePopulation: 0,
    };
    if (findActivePracticeSlotIndex(state, classId, tSec) != null) {
      continue;
    }

    for (let slotIndex = 0; slotIndex < practiceSlots.length; slotIndex += 1) {
      const card = practiceSlots[slotIndex]?.card ?? null;
      if (!card) continue;
      const cardDef = settlementPracticeDefs[card.defId];
      if (!cardDef || getPracticeMode(cardDef) !== "active") continue;

      const resolved = resolvePracticeExecutionDef(state, classId, card, classSummary, tSec);
      const executionDef = resolved.executionDef;
      const requirementResult = executionDef
        ? practiceRequirementsPass(executionDef, state, classSummary, seasonKey, classId)
        : { ok: false, reason: resolved.blockedReason };
      const amountResult =
        executionDef && requirementResult.ok
          ? resolvePracticeAmountResult(executionDef, state, classSummary)
          : { amount: 0, reason: null };
      const amount = amountResult.amount;
      const timingPasses =
        executionDef &&
        passiveTimingPasses(executionDef.timing, state, tSec, {
          passiveKey: buildPracticePassiveKey(card, classId),
          isActive: requirementResult.ok && amount > 0,
        });
      const progressRuntime = getPracticeProgressRuntime(
        state,
        classId,
        cardDef,
        executionDef,
        tSec
      );

      setPracticeRuntime(card, {
        practiceMode: "active",
        slotIndex,
        ownerClassId: classId,
        pendingPopulation: progressRuntime.activeAmount,
        previewAmount: amount,
        available:
          progressRuntime.activeReservation ||
          (!!executionDef && requirementResult.ok && amount > 0),
        blockedReason:
          progressRuntime.activeReservation
            ? null
            : executionDef
              ? requirementResult.ok
                ? amountResult.reason
                : requirementResult.reason
              : resolved.blockedReason,
        mirroredPracticeTitle: resolved.mirroredFrom?.title ?? null,
        mirroredPracticeClassId: resolved.mirroredFrom?.classId ?? null,
        ...getPracticeUpgradeTargetRuntime(state, cardDef),
        ...progressRuntime,
        lastEvaluatedSec: tSec,
      });

      if (!executionDef || !requirementResult.ok || !timingPasses || amount <= 0) continue;

      const didChange = runEffect(state, executionDef.effects, {
        kind: "game",
        state,
        source: core,
        tSec,
        practice: card,
        practiceDef: executionDef,
        practiceSourceId: cardDef.id,
        practiceSourceLabel: cardDef.name,
        populationClassId: classId,
        fromPopulationClassId: classId,
        vars: {
          practiceAmount: amount,
        },
      });
      if (!didChange) break;

      setPracticeRuntime(card, {
        lastRunSec: tSec,
        lastAmount: amount,
      });
      summary = computeStructureDerivedState(state);
      break;
    }
  }

  syncPracticeIndicators(state, tSec, summary);
}

export function syncSettlementDerivedState(state, tSec = 0) {
  const desiredGreenResource = getStockpilesState(state)?.greenResource;
  if (Number.isFinite(desiredGreenResource)) {
    syncSettlementFloodplainGreenResource(state, desiredGreenResource);
  }
  const desiredBlueResource = getStockpilesState(state)?.blueResource;
  if (Number.isFinite(desiredBlueResource)) {
    syncSettlementHinterlandBlueResource(state, desiredBlueResource);
  }
  let summary = computeStructureDerivedState(state);
  if (clampSettlementState(state, summary)) {
    if (Number.isFinite(getStockpilesState(state)?.greenResource)) {
      syncSettlementFloodplainGreenResource(state, getStockpilesState(state).greenResource);
    }
    if (Number.isFinite(getStockpilesState(state)?.blueResource)) {
      syncSettlementHinterlandBlueResource(state, getStockpilesState(state).blueResource);
    }
    summary = computeStructureDerivedState(state);
  }
  syncPracticeIndicators(state, tSec, summary);
  return summary;
}

export function stepSettlementSecond(state, tSec) {
  if (!getHubCore(state)) return;
  releaseExpiredPopulationCommitments(state, tSec);
  runSettlementPopulationSeasonTick(state, tSec);
  if (state?.runStatus?.complete === true) return;
  syncSettlementDerivedState(state, tSec);
  stepSettlementVassals(state, tSec);
  if (state?.runStatus?.complete === true) return;
  syncSettlementDerivedState(state, tSec);
  stepSettlementOrders(state, tSec);
  if (state?.runStatus?.complete === true) return;
  syncSettlementDerivedState(state, tSec);
  executePassivePractices(state, tSec);
  if (state?.runStatus?.complete === true) return;
  syncSettlementDerivedState(state, tSec);
  executePractices(state, tSec);
  syncSettlementDerivedState(state, tSec);
  if (state?.runStatus?.complete === true) return;
  stepSettlementChaosSecond(state, tSec);
  syncSettlementDerivedState(state, tSec);
}
