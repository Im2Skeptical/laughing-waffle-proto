import {
  DETAILED_PRACTICE_SLOT_COUNT,
  POPULATION_CLASS_ORDER,
  VASSAL_INTERVENTION_PRACTICE_IDS,
  detailedSettlementEffectOps,
  detailedSettlementPracticeDefs,
  settlementStructureDefs,
} from "../defs/gamepieces/detailed-settlement-defs.js";
import {
  DETAILED_REGION_IDS,
  createInitialDetailedSettlementData,
} from "../defs/world/detailed-settlement-scenario.js";
import {
  addWorldConnection,
  establishDetailedSettlement,
  getConnectedRegionIds,
  getRegionReference,
  getRegionState,
  getWorldDefinition,
  getWorldConnectionCandidates,
  getWorldConnectionKey,
  removeWorldConnection,
} from "./world-state.js";
import {
  deserializeGameState,
  getCurrentSeasonKey,
  serializeGameState,
} from "./state.js";
import {
  getDetailedPracticeDef,
  getDetailedStructureDef,
  getBooleanGameSetting,
  getGameSetting,
} from "./game-config.js";
import { MOON_PHASE_INDEX_BY_ID } from "../defs/gamesettings/moon-phase-defs.js";
import {
  getMoonPhaseAtSecond,
  getNextMoonPhaseBoundarySec,
} from "./moon-phases.js";

const FOOD_SCALE = 10000;
const FAITH_ORDER = Object.freeze(["bronze", "silver", "gold", "diamond"]);
const HAPPINESS_ORDER = Object.freeze(["negative", "neutral", "positive"]);
const TRAITS = Object.freeze([
  { id: "hardworker", prestigeDelta: 4 },
  { id: "goodTeacher", prestigeDelta: 3 },
  { id: "fairTrader", prestigeDelta: 2 },
  { id: "pious", prestigeDelta: 1 },
  { id: "slothful", prestigeDelta: -4 },
  { id: "philanderer", prestigeDelta: -3 },
  { id: "quarrelsome", prestigeDelta: -2 },
]);
const PROFESSIONS = Object.freeze([
  "fisher", "farmer", "potter", "builder", "herder", "scribe",
]);

function getDetailedYearDurationSec(state) {
  const seasonCount = Array.isArray(state?.seasons) && state.seasons.length > 0
    ? state.seasons.length
    : 4;
  const seasonDurationSec = Number.isFinite(state?.seasonDurationSec)
    ? Math.max(1, Math.floor(state.seasonDurationSec))
    : 8;
  return seasonCount * seasonDurationSec;
}

function getDetailedYearStartSec(state, year) {
  const safeYear = Number.isFinite(year) ? Math.max(1, Math.floor(year)) : 1;
  if (safeYear <= 1) return 0;
  // Seasonal clocks advance on fractional simulation ticks. The annual stage
  // therefore observes a completed nominal year on the following whole second.
  return (safeYear - 1) * getDetailedYearDurationSec(state) + 1;
}

export function roundFood(value) {
  return Math.max(0, Math.round((Number(value) || 0) * FOOD_SCALE) / FOOD_SCALE);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function eldersCount(classState) {
  return (classState?.eldersByAge ?? []).reduce(
    (sum, cohort) => sum + Math.max(0, Math.floor(cohort?.count ?? 0)),
    0
  );
}

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

function validateRegionScopeDefinition(scope, label, errors) {
  if (!scope || typeof scope !== "object") {
    errors.push(`${label}: missing region scope`);
    return;
  }
  if (scope.kind === "conditionalHostPractice") {
    if (typeof scope.practiceId !== "string") errors.push(`${label}: invalid practice condition`);
    if (scope.requiredDefinitionPath != null
        && (!Array.isArray(scope.requiredDefinitionPath)
          || scope.requiredDefinitionPath.length === 0
          || scope.requiredDefinitionPath.some(
            (part) => typeof part !== "string" && !Number.isInteger(part)
          ))) {
      errors.push(`${label}: invalid required definition path`);
    }
    validateRegionScopeDefinition(scope.whenPresent, `${label}.whenPresent`, errors);
    validateRegionScopeDefinition(scope.otherwise, `${label}.otherwise`, errors);
    return;
  }
  if (!["adjacent", "connectedComponent", "commercialAdjacent"].includes(scope.kind)) {
    errors.push(`${label}: invalid region scope ${scope.kind}`);
  }
}

function validateScaledValueDefinition(scaledValue, label, errors) {
  if (!scaledValue || typeof scaledValue !== "object") {
    errors.push(`${label}: missing scaledValue`);
    return;
  }
  if (!Number.isFinite(scaledValue.baseAmount) || scaledValue.baseAmount < 0) {
    errors.push(`${label}: invalid baseAmount`);
  }
  if (!Number.isFinite(scaledValue.workerMultiplier?.base)
      || scaledValue.workerMultiplier.base < 0) {
    errors.push(`${label}: invalid worker multiplier base`);
  }
  if (!Number.isFinite(scaledValue.workerMultiplier?.perEffectiveWorker)
      || scaledValue.workerMultiplier.perEffectiveWorker < 0) {
    errors.push(`${label}: invalid worker multiplier contribution`);
  }
  const evaluator = scaledValue.evaluator;
  if (evaluator?.kind === "constant") {
    if (!Number.isFinite(evaluator.score) || evaluator.score < 0) {
      errors.push(`${label}: invalid constant evaluator score`);
    }
  } else if (evaluator?.kind === "countRegions") {
    validateRegionScopeDefinition(evaluator.scope, `${label}.evaluator.scope`, errors);
  } else {
    errors.push(`${label}: invalid evaluator ${evaluator?.kind}`);
  }
}

export function validateDetailedPracticeDefinitions() {
  const errors = [];
  const validOps = new Set(detailedSettlementEffectOps);
  for (const [id, def] of Object.entries(detailedSettlementPracticeDefs)) {
    if (def.id !== id) errors.push(`${id}: id mismatch`);
    if (!Number.isInteger(def.workerCapacity) || def.workerCapacity < 0) {
      errors.push(`${id}: invalid workerCapacity`);
    }
    if (!["season", "birth", "food", "passive"].includes(def.activation?.type)) {
      errors.push(`${id}: invalid activation`);
    }
    if (def.activation?.stage != null
        && (def.activation.type !== "food"
          || !["preRouting", "postRouting"].includes(def.activation.stage))) {
      errors.push(`${id}: invalid activation stage`);
    }
    if (def.activation?.seasonKeys != null
        && (!Array.isArray(def.activation.seasonKeys)
          || def.activation.seasonKeys.some((key) => typeof key !== "string"))) {
      errors.push(`${id}: invalid season keys`);
    }
    for (const effect of def.effects ?? []) {
      if (!validOps.has(effect?.op)) errors.push(`${id}: invalid effect op ${effect?.op}`);
      if (["addLocalFood", "addLocalCurrency", "routeLocalFood", "reduceFoodDecay"].includes(effect?.op)) {
        validateScaledValueDefinition(effect.scaledValue, `${id}.${effect.op}`, errors);
      }
      if (effect?.op === "routeLocalFood") {
        validateRegionScopeDefinition(effect.targetScope, `${id}.routeLocalFood.targets`, errors);
      }
      if (effect?.op === "reduceFoodDecay"
          && !["stored", "loose"].includes(effect.foodKind)) {
        errors.push(`${id}: invalid food decay kind ${effect.foodKind}`);
      }
      if (effect?.op === "createLocalStructureAtWork"
          && !settlementStructureDefs[effect.structureDefId]) {
        errors.push(`${id}: invalid structure ${effect.structureDefId}`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

export function getStructureCount(state, regionId, structureId) {
  return (getDetailedSettlement(state, regionId)?.structureSlots ?? [])
    .filter((slot) => slot?.structureId === structureId).length;
}

export function getStoredFoodCapacity(state, regionId) {
  const count = getStructureCount(state, regionId, "granary");
  return getDetailedStructureDef(state, "granary").capacityPerCountSquared * count * count;
}

export function getHousingCapacity(state, regionId) {
  const count = getStructureCount(state, regionId, "mudHouses");
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

export function getDetailedCivilizationSummary(state) {
  const sites = getDetailedSettlementSites(state, { playerOnly: true });
  const byClass = Object.fromEntries(
    POPULATION_CLASS_ORDER.map((classId) => [
      classId,
      {
        children: 0,
        adults: 0,
        elders: 0,
        total: 0,
        assignedWorkers: 0,
        freePopulation: 0,
      },
    ])
  );
  const population = {
    children: 0,
    adults: 0,
    elders: 0,
    total: 0,
    mealDemand: 0,
    housingCapacity: 0,
    byClass,
  };
  let storedFood = 0;
  let looseFood = 0;
  let storedFoodCapacity = 0;
  let overHousingSiteCount = 0;

  for (const site of sites) {
    const regionId = site.regionId;
    const localPopulation = getPopulationSummary(state, regionId);
    const workerAssignments = assignDetailedSettlementWorkers(state, regionId);
    const assignedByClass = Object.fromEntries(
      POPULATION_CLASS_ORDER.map((classId) => [classId, 0])
    );
    for (const assignment of workerAssignments) {
      for (const token of assignment.tokens ?? []) {
        if (!Object.prototype.hasOwnProperty.call(assignedByClass, token?.classId)) {
          continue;
        }
        assignedByClass[token.classId] += 1;
      }
    }

    population.children += localPopulation.children;
    population.adults += localPopulation.adults;
    population.elders += localPopulation.elders;
    population.total += localPopulation.total;
    population.mealDemand += localPopulation.mealDemand;
    population.housingCapacity += localPopulation.housingCapacity;
    if (localPopulation.total > localPopulation.housingCapacity) {
      overHousingSiteCount += 1;
    }

    for (const classId of POPULATION_CLASS_ORDER) {
      const source = localPopulation.byClass[classId] ?? {};
      const target = byClass[classId];
      target.children += source.children ?? 0;
      target.adults += source.adults ?? 0;
      target.elders += source.elders ?? 0;
      target.total += source.total ?? 0;
      target.assignedWorkers += assignedByClass[classId] ?? 0;
      target.freePopulation += Math.max(
        0,
        (source.adults ?? 0) +
          (source.elders ?? 0) -
          (assignedByClass[classId] ?? 0)
      );
    }

    storedFood += site.detailedState.storedFood ?? 0;
    looseFood += site.detailedState.looseFood ?? 0;
    storedFoodCapacity += getStoredFoodCapacity(state, regionId);
  }

  storedFood = roundFood(storedFood);
  looseFood = roundFood(looseFood);
  storedFoodCapacity = roundFood(storedFoodCapacity);

  return {
    settlementCount: sites.length,
    regionIds: sites.map((site) => site.regionId),
    population,
    food: {
      stored: storedFood,
      loose: looseFood,
      total: roundFood(storedFood + looseFood),
      storedCapacity: storedFoodCapacity,
    },
    overHousingSiteCount,
    chaos: {
      chaosPower: Math.max(0, Number(state?.civilization?.chaos?.chaosPower) || 0),
      monsterCount: Math.max(0, Math.floor(state?.civilization?.chaos?.monsterCount ?? 0)),
      monsterLossThreshold: Math.max(
        1,
        Math.floor(state?.civilization?.chaos?.monsterLossThreshold ?? 1000)
      ),
      lastReckoning: clone(state?.civilization?.chaos?.lastMoonIncome ?? null),
    },
    green: getGreenAscendancySummary(state),
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

function refreshGreenAscendancy(state) {
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

function getWorldRegionOrder(state) {
  return new Map((getWorldDefinition(state)?.regions ?? []).map(
    (region, index) => [region.id, index]
  ));
}

function orderRegionIds(state, regionIds) {
  const order = getWorldRegionOrder(state);
  return [...new Set(regionIds)].sort((left, right) =>
    (order.get(left) ?? Number.MAX_SAFE_INTEGER)
      - (order.get(right) ?? Number.MAX_SAFE_INTEGER)
      || (String(left) < String(right) ? -1 : String(left) > String(right) ? 1 : 0)
  );
}

function regionHasDetailedPractice(state, regionId, practiceId) {
  return (getDetailedSettlement(state, regionId)?.practiceSlots ?? [])
    .some((slot) => slot?.practiceId === practiceId);
}

function regionMatchesFilters(state, host, regionId, filters) {
  if (!filters) return true;
  const region = getRegionState(state, regionId);
  if (!region) return false;
  if (filters.controller && region.controller !== filters.controller) return false;
  if (filters.colour === "host" && region.colour !== host.colour) return false;
  if (filters.colour === "differentFromHost" && region.colour === host.colour) return false;
  if (typeof filters.colour === "string"
      && filters.colour !== "host"
      && filters.colour !== "differentFromHost"
      && region.colour !== filters.colour) return false;
  if (filters.detailedSettlement === true && !getDetailedSettlement(state, regionId)) {
    return false;
  }
  if (filters.practiceId
      && !regionHasDetailedPractice(state, regionId, filters.practiceId)) {
    return false;
  }
  return true;
}

export function resolveDetailedRegionScope(state, regionId, scope) {
  const host = getRegionState(state, regionId);
  if (!host) return [];
  if (scope?.kind === "conditionalHostPractice") {
    const practiceDef = getDetailedPracticeDef(state, scope.practiceId);
    const requiredValue = (scope.requiredDefinitionPath ?? []).reduce(
      (current, key) => current?.[key],
      practiceDef
    );
    const conditionEnabled = scope.requiredDefinitionPath == null
      || requiredValue === true;
    const selectedScope = regionHasDetailedPractice(state, regionId, scope.practiceId)
      && conditionEnabled
      ? scope.whenPresent
      : scope.otherwise;
    return resolveDetailedRegionScope(state, regionId, selectedScope);
  }

  let candidateIds = [];
  if (scope?.kind === "adjacent") {
    candidateIds = getConnectedRegionIds(state, regionId);
  } else if (scope?.kind === "commercialAdjacent") {
    // Commercial reach is deliberately separate from ordinary adjacency. All
    // graph neighbours qualify, while a Caravan-only player settlement chain
    // adds its participating detailed settlements.
    candidateIds = getConnectedRegionIds(state, regionId);
    const isCaravanNode = (candidateId) =>
      getRegionState(state, candidateId)?.controller === "player"
      && Boolean(getDetailedSettlement(state, candidateId))
      && regionHasDetailedPractice(state, candidateId, "caravanRoutes");
    if (isCaravanNode(regionId)) {
      const visited = new Set();
      const queue = [regionId];
      while (queue.length > 0) {
        const current = queue.shift();
        if (visited.has(current)) continue;
        visited.add(current);
        for (const next of orderRegionIds(state, getConnectedRegionIds(state, current))) {
          if (!visited.has(next) && isCaravanNode(next)) queue.push(next);
        }
      }
      candidateIds.push(...visited);
    }
  } else if (scope?.kind === "connectedComponent") {
    if (!regionMatchesFilters(state, host, regionId, scope.traversalFilters)) return [];
    const visited = new Set();
    const queue = [regionId];
    while (queue.length > 0) {
      const current = queue.shift();
      if (visited.has(current)) continue;
      visited.add(current);
      for (const next of orderRegionIds(state, getConnectedRegionIds(state, current))) {
        if (!visited.has(next)
            && regionMatchesFilters(state, host, next, scope.traversalFilters)) {
          queue.push(next);
        }
      }
    }
    candidateIds = [...visited];
  } else {
    return [];
  }

  if (scope.includeHost === true) candidateIds.push(regionId);
  else candidateIds = candidateIds.filter((id) => id !== regionId);
  return orderRegionIds(state, candidateIds).filter(
    (id) => regionMatchesFilters(state, host, id, scope.regionFilters)
  );
}

export function evaluateDetailedMapScore(state, regionId, evaluator) {
  const host = getRegionState(state, regionId);
  if (!host) return { ok: false, reason: "unknownRegion", score: 0 };
  if (evaluator?.kind === "constant") {
    const score = Math.max(0, Number(evaluator.score) || 0);
    return {
      ok: true,
      score,
      breakdown: [{ kind: "constant", amount: score, text: evaluator.label ?? "constant" }],
      diagnostics: { matchingRegionIds: [] },
    };
  }
  if (evaluator?.kind !== "countRegions") {
    return { ok: false, reason: "unknownEvaluator", score: 0 };
  }
  const scopeRegionIds = resolveDetailedRegionScope(state, regionId, evaluator.scope);
  const candidateIds = evaluator.includeHost === true
    ? orderRegionIds(state, [regionId, ...scopeRegionIds])
    : scopeRegionIds;
  const matchingRegionIds = candidateIds.filter(
    (id) => regionMatchesFilters(state, host, id, evaluator.regionFilters)
  );
  const score = matchingRegionIds.length;
  return {
    ok: true,
    score,
    breakdown: [{
      kind: "regionCount",
      amount: score,
      text: `${score} ${evaluator.label ?? "qualifying regions"}`,
    }],
    diagnostics: { scopeRegionIds, matchingRegionIds },
  };
}

function resolveScaledValue(state, site, assignment, scaledValue) {
  const evaluation = evaluateDetailedMapScore(
    state,
    site.regionId,
    scaledValue?.evaluator
  );
  const baseAmount = Math.max(0, Number(scaledValue?.baseAmount) || 0);
  const evaluatorScore = evaluation.ok ? evaluation.score : 0;
  const baseValue = roundFood(baseAmount * evaluatorScore);
  const multiplierBase = Math.max(
    0,
    Number(scaledValue?.workerMultiplier?.base) || 0
  );
  const perEffectiveWorker = Math.max(
    0,
    Number(scaledValue?.workerMultiplier?.perEffectiveWorker) || 0
  );
  const workerMultiplier = roundFood(
    multiplierBase + assignment.effectiveWorkers * perEffectiveWorker
  );
  return {
    ok: evaluation.ok,
    baseAmount,
    evaluatorScore,
    evaluatorBreakdown: evaluation.breakdown ?? [],
    diagnostics: evaluation.diagnostics ?? {},
    baseValue,
    workerMultiplier,
    effectiveValue: roundFood(baseValue * workerMultiplier),
  };
}

export function assignDetailedSettlementWorkers(state, regionId) {
  const settlement = getDetailedSettlement(state, regionId);
  const slots = settlement?.practiceSlots ?? [];
  const assignments = slots.map(() => []);
  for (const classId of POPULATION_CLASS_ORDER) {
    const classState = settlement?.populationByClass?.[classId];
    let tokens = Math.floor(
      (Math.max(0, Math.floor(classState?.adults ?? 0)) + eldersCount(classState))
        / Math.max(1, getGameSetting(state, "populationPerToken"))
    );
    for (let slotIndex = 0; slotIndex < slots.length && tokens > 0; slotIndex += 1) {
      const def = getDetailedPracticeDef(state, slots[slotIndex]?.practiceId);
      const room = Math.max(0, (def?.workerCapacity ?? 0) - assignments[slotIndex].length);
      const count = Math.min(tokens, room);
      for (let index = 0; index < count; index += 1) {
        assignments[slotIndex].push({
          classId,
          effectiveness: getGameSetting(
            state,
            classId === "villager" ? "villagerEffectiveness" : "strangerEffectiveness"
          ),
        });
      }
      tokens -= count;
    }
  }
  return assignments.map((tokens, slotIndex) => ({
    slotIndex,
    practiceId: slots[slotIndex]?.practiceId ?? null,
    tokens,
    effectiveWorkers: tokens.reduce((sum, token) => sum + token.effectiveness, 0),
  }));
}

function buildDetailedPracticeEvaluation(state, site, assignment) {
  const slot = site?.detailedState?.practiceSlots?.[assignment.slotIndex] ?? null;
  const def = getDetailedPracticeDef(state, slot?.practiceId);
  if (!def) return null;
  return {
    practiceId: def.id,
    label: def.label,
    workerCapacity: def.workerCapacity,
    activation: clone(def.activation),
    rule: def.ui?.rule ?? "",
    effects: (def.effects ?? []).map((effect) => ({
      op: effect.op,
      foodKind: effect.foodKind ?? null,
      importCalculation: effect.op === "importMissingFood"
        ? getImportCalculation(state, site.regionId)
        : null,
      scaledValue: effect.scaledValue
        ? resolveScaledValue(state, site, assignment, effect.scaledValue)
        : null,
      targetRegionIds: effect.targetScope
        ? resolveDetailedRegionScope(state, site.regionId, effect.targetScope)
        : [],
    })),
  };
}

export function evaluateDetailedPracticeSlot(state, regionId, slotIndex) {
  const site = getDetailedSettlementSite(state, regionId);
  if (!site || !Number.isInteger(slotIndex)) return null;
  const assignment = assignDetailedSettlementWorkers(state, regionId)[slotIndex];
  return assignment ? buildDetailedPracticeEvaluation(state, site, assignment) : null;
}

function addFoodToSettlement(state, regionId, amount) {
  const settlement = getDetailedSettlement(state, regionId);
  if (!settlement || amount <= 0) return 0;
  const capacity = getStoredFoodCapacity(state, regionId);
  const room = Math.max(0, capacity - settlement.storedFood);
  const stored = Math.min(room, amount);
  settlement.storedFood = roundFood(settlement.storedFood + stored);
  settlement.looseFood = roundFood(settlement.looseFood + amount - stored);
  return roundFood(amount);
}

function addCurrencyToSettlement(state, regionId, amount) {
  const settlement = getDetailedSettlement(state, regionId);
  if (!settlement || amount <= 0) return 0;
  settlement.currency = roundFood(Math.max(0, settlement.currency ?? 0) + amount);
  return roundFood(amount);
}

function consumeFood(settlement, amount) {
  const demand = roundFood(amount);
  const fromLoose = Math.min(settlement.looseFood, demand);
  settlement.looseFood = roundFood(settlement.looseFood - fromLoose);
  const remainder = roundFood(demand - fromLoose);
  const fromStored = Math.min(settlement.storedFood, remainder);
  settlement.storedFood = roundFood(settlement.storedFood - fromStored);
  return roundFood(fromLoose + fromStored);
}

function getImportFunding(state, regionId) {
  const local = getDetailedSettlement(state, regionId);
  if (!local) return [];
  const sources = [{ regionId, settlement: local }];
  if (!regionHasDetailedPractice(state, regionId, "clearingHouse")) return sources;
  for (const remoteId of resolveDetailedRegionScope(state, regionId, {
    kind: "commercialAdjacent",
    includeHost: false,
    regionFilters: { controller: "player", detailedSettlement: true },
  })) {
    const settlement = getDetailedSettlement(state, remoteId);
    if (settlement) sources.push({ regionId: remoteId, settlement });
  }
  return sources;
}

function getImportCalculation(state, regionId) {
  const settlement = getDetailedSettlement(state, regionId);
  if (!settlement) return { missingFood: 0, localCurrency: 0, remoteCurrency: 0, importedFood: 0 };
  const mealDemand = getPopulationSummary(state, regionId).mealDemand;
  const missingFood = roundFood(Math.max(0, mealDemand - settlement.looseFood - settlement.storedFood));
  const sources = getImportFunding(state, regionId);
  const localCurrency = roundFood(Math.max(0, sources[0]?.settlement?.currency ?? 0));
  const remoteCurrency = roundFood(sources.slice(1).reduce(
    (sum, source) => sum + Math.max(0, source.settlement.currency ?? 0), 0
  ));
  return {
    missingFood,
    localCurrency,
    remoteCurrency,
    importedFood: roundFood(Math.min(missingFood, localCurrency + remoteCurrency)),
    remoteRegionIds: sources.slice(1).map((source) => source.regionId),
  };
}

function importMissingFood(state, regionId) {
  const calculation = getImportCalculation(state, regionId);
  let remaining = calculation.importedFood;
  for (const source of getImportFunding(state, regionId)) {
    if (remaining <= 0) break;
    const spent = Math.min(remaining, Math.max(0, source.settlement.currency ?? 0));
    source.settlement.currency = roundFood(source.settlement.currency - spent);
    remaining = roundFood(remaining - spent);
  }
  if (calculation.importedFood > 0) {
    // Imported Food exists only for this meal, so add it directly to loose Food.
    const settlement = getDetailedSettlement(state, regionId);
    settlement.looseFood = roundFood(settlement.looseFood + calculation.importedFood);
  }
  return calculation;
}

function compactPracticeSlots(settlement) {
  const active = settlement.practiceSlots.filter(Boolean).slice(0, DETAILED_PRACTICE_SLOT_COUNT);
  while (active.length < DETAILED_PRACTICE_SLOT_COUNT) active.push(null);
  settlement.practiceSlots = active;
}

function tryCreateStructure(state, regionId, structureId) {
  const settlement = getDetailedSettlement(state, regionId);
  const region = getRegionState(state, regionId);
  if (!settlement || !region || !getDetailedStructureDef(state, structureId)) return false;
  const slots = settlement.structureSlots;
  const capacity = Math.max(0, Math.floor(region.structureCapacity ?? 0));
  while (slots.length < capacity) slots.push(null);
  const index = slots.slice(0, capacity).findIndex((slot) => !slot);
  if (index < 0) return false;
  slots[index] = { structureId };
  slots.length = capacity;
  return true;
}

function markCompletedBuildInterventionResolved(state, regionId, practiceId) {
  const vassal = state?.civilization?.vassalLineage?.currentVassal;
  if (!vassal || vassal.targetRegionId !== regionId) return;
  const intervention = vassal.interventions.find(
    (entry) => entry.practiceId === practiceId && entry.status === "applied"
  );
  if (intervention) {
    intervention.status = "resolved";
    intervention.resolvedYear = state.year;
  }
}

function practiceMatchesActivation(state, def, activationType, stage = null) {
  if (def?.activation?.type !== activationType) return false;
  if (activationType === "food" && stage != null
      && (def.activation.stage ?? "postRouting") !== stage) return false;
  if (activationType !== "season" || !Array.isArray(def.activation.seasonKeys)) {
    return true;
  }
  return def.activation.seasonKeys.includes(getCurrentSeasonKey(state));
}

function executePracticeEffects(state, site, assignment, activationType, stage = null) {
  const settlement = site.detailedState;
  const slot = settlement.practiceSlots[assignment.slotIndex];
  const def = getDetailedPracticeDef(state, slot?.practiceId);
  if (!def || !practiceMatchesActivation(state, def, activationType, stage)) return;
  const hasBaselineEffect = (def.effects ?? []).some((effect) => effect.scaledValue);
  if (!hasBaselineEffect
      && (def.workerCapacity ?? 0) > 0
      && assignment.tokens.length === 0) return;
  if ((def.activation.type === "season" || def.activation.type === "food")
      && getRegionState(state, site.regionId)?.controller !== "player"
      && (def.effects ?? []).some((effect) =>
        effect.op === "addLocalFood" || effect.op === "addLocalCurrency" || effect.op === "routeLocalFood")) return;

  for (const effect of def.effects ?? []) {
    if (effect.op === "addLocalFood") {
      const resolved = resolveScaledValue(state, site, assignment, effect.scaledValue);
      addFoodToSettlement(
        state,
        site.regionId,
        resolved.effectiveValue
      );
    } else if (effect.op === "addLocalCurrency") {
      const resolved = resolveScaledValue(state, site, assignment, effect.scaledValue);
      addCurrencyToSettlement(state, site.regionId, resolved.effectiveValue);
    } else if (effect.op === "importMissingFood") {
      importMissingFood(state, site.regionId);
    } else if (effect.op === "advanceWork") {
      slot.work = roundFood((slot.work ?? 0)
        + effect.amountPerEffectiveWorker * assignment.effectiveWorkers);
    } else if (effect.op === "createLocalStructureAtWork") {
      if ((slot.work ?? 0) < effect.requiredWork) continue;
      if (!tryCreateStructure(state, site.regionId, effect.structureDefId)) continue;
      markCompletedBuildInterventionResolved(state, site.regionId, slot.practiceId);
      settlement.practiceSlots[assignment.slotIndex] = null;
      compactPracticeSlots(settlement);
      break;
    }
  }
}

function runPracticeActivation(state, activationType, stage = null) {
  for (const site of getDetailedSettlementSites(state)) {
    const assignments = assignDetailedSettlementWorkers(state, site.regionId);
    for (const assignment of assignments) {
      executePracticeEffects(state, site, assignment, activationType, stage);
    }
  }
}

function getPreserveReduction(state, site) {
  return assignDetailedSettlementWorkers(state, site.regionId).reduce((sum, assignment) => {
    const def = getDetailedPracticeDef(state, assignment.practiceId);
    return sum + (def?.effects ?? []).reduce((effectSum, effect) =>
      effect.op === "reduceFoodDecay" && effect.foodKind === "stored"
        ? effectSum + resolveScaledValue(
          state,
          site,
          assignment,
          effect.scaledValue
        ).effectiveValue
        : effectSum, 0);
  }, 0);
}

function buildFoodSnapshot(state) {
  return Object.fromEntries(getDetailedSettlementSites(state).map((site) => {
    const summary = getPopulationSummary(state, site.regionId);
    return [site.regionId, {
      stored: roundFood(site.detailedState.storedFood),
      loose: roundFood(site.detailedState.looseFood),
      capacity: getStoredFoodCapacity(state, site.regionId),
      demand: summary.mealDemand,
    }];
  }));
}

export function planDetailedAdministrationMoves(state) {
  const snapshot = buildFoodSnapshot(state);
  const sourceAvailable = clone(snapshot);
  const destinationProjected = clone(snapshot);
  const moves = [];
  const worldOrder = getWorldRegionOrder(state);
  const compareByAmountThenWorldOrder = (amountFor) => (left, right) =>
    amountFor(right) - amountFor(left)
      || (worldOrder.get(left) ?? Number.MAX_SAFE_INTEGER)
        - (worldOrder.get(right) ?? Number.MAX_SAFE_INTEGER)
      || (String(left) < String(right) ? -1 : String(left) > String(right) ? 1 : 0);
  const shortage = (entry) => roundFood(Math.max(
    0,
    (entry?.demand ?? 0) - (entry?.loose ?? 0) - (entry?.stored ?? 0)
  ));
  const surplus = (entry) => roundFood(Math.max(
    0,
    (entry?.loose ?? 0) + (entry?.stored ?? 0) - (entry?.demand ?? 0)
  ));
  const reserveMove = (sourceId, destinationId, amount) => {
    const source = sourceAvailable[sourceId];
    const destination = destinationProjected[destinationId];
    const safeAmount = roundFood(Math.max(0, amount));
    if (!source || !destination || safeAmount <= 0) return 0;
    const looseAmount = Math.min(source.loose, safeAmount);
    source.loose = roundFood(source.loose - looseAmount);
    source.stored = roundFood(source.stored - (safeAmount - looseAmount));
    const room = Math.max(0, destination.capacity - destination.stored);
    const storedAmount = Math.min(room, safeAmount);
    destination.stored = roundFood(destination.stored + storedAmount);
    destination.loose = roundFood(destination.loose + safeAmount - storedAmount);
    moves.push({ sourceId, destinationId, amount: safeAmount, looseAmount });
    return safeAmount;
  };

  for (const site of getDetailedSettlementSites(state)) {
    if (getRegionState(state, site.regionId)?.controller !== "player") continue;
    const assignments = assignDetailedSettlementWorkers(state, site.regionId);
    for (const assignment of assignments.filter(
      (entry) => entry.practiceId === "administrate"
    )) {
      const def = getDetailedPracticeDef(state, assignment.practiceId);
      const effect = (def?.effects ?? []).find((entry) => entry?.op === "routeLocalFood");
      if (!effect) continue;
      let remainingCapacity = resolveScaledValue(
        state,
        site,
        assignment,
        effect.scaledValue
      ).effectiveValue;
      const targets = resolveDetailedRegionScope(state, site.regionId, effect.targetScope)
        .filter((id) => snapshot[id]);
      const hostShortage = shortage(destinationProjected[site.regionId]);
      if (hostShortage > 0) {
        const sources = targets
          .filter((id) => surplus(sourceAvailable[id]) > 0)
          .sort(compareByAmountThenWorldOrder((id) => surplus(sourceAvailable[id])));
        for (const sourceId of sources) {
          if (remainingCapacity <= 0) break;
          const amount = Math.min(
            remainingCapacity,
            shortage(destinationProjected[site.regionId]),
            surplus(sourceAvailable[sourceId])
          );
          remainingCapacity = roundFood(
            remainingCapacity - reserveMove(sourceId, site.regionId, amount)
          );
        }
      } else {
        const destinations = targets
          .filter((id) => shortage(destinationProjected[id]) > 0)
          .sort(compareByAmountThenWorldOrder((id) => shortage(destinationProjected[id])));
        for (const destinationId of destinations) {
          if (remainingCapacity <= 0) break;
          const amount = Math.min(
            remainingCapacity,
            surplus(sourceAvailable[site.regionId]),
            shortage(destinationProjected[destinationId])
          );
          remainingCapacity = roundFood(
            remainingCapacity - reserveMove(site.regionId, destinationId, amount)
          );
        }
      }
    }
  }
  return moves;
}

export function planDetailedAdministrationMovesAtBoundary(
  preBoundaryState,
  boundarySec
) {
  const planningState = deserializeGameState(
    serializeGameState(preBoundaryState)
  );
  const sec = Math.max(0, Math.floor(boundarySec ?? 0));
  const seasonDurationSec = Math.max(
    1,
    Math.floor(planningState?.seasonDurationSec ?? 1)
  );
  // Seasonal production resolves before new-moon Administration when both
  // stages share a second. Mirror that order without running the later
  // transfer, decay, meal, demographic, or RNG-consuming stages.
  if (sec > 0 && sec % seasonDurationSec === 0) {
    const seasons = Array.isArray(planningState.seasons) ? planningState.seasons : [];
    if (seasons.length > 0) {
      const nextSeasonIndex = ((planningState.currentSeasonIndex ?? 0) + 1) % seasons.length;
      planningState.currentSeasonIndex = nextSeasonIndex;
      if (nextSeasonIndex === 0) planningState.year = Math.max(1, planningState.year + 1);
    }
    runPracticeActivation(planningState, "season");
  }
  runPracticeActivation(planningState, "food", "preRouting");
  return planDetailedAdministrationMoves(planningState);
}

function applyAdministrationMoves(state, moves) {
  // Remove every packet from its activation-start source before any
  // destination receives food. This preserves simultaneous resolution even
  // when two sites send packets in opposite directions.
  for (const move of moves) {
    const source = getDetailedSettlement(state, move.sourceId);
    if (!source) continue;
    const looseRemoved = Math.min(source.looseFood, move.looseAmount);
    source.looseFood = roundFood(source.looseFood - looseRemoved);
    source.storedFood = roundFood(source.storedFood - (move.amount - looseRemoved));
  }
  for (const move of moves) {
    const destination = getDetailedSettlement(state, move.destinationId);
    if (!destination) continue;
    addFoodToSettlement(state, move.destinationId, move.amount);
  }
}

function updateHappiness(state, classState, ratio) {
  const happiness = classState.happiness;
  const previousStatus = happiness.status;
  if (ratio >= 1) {
    happiness.fullFeedStreak += 1;
    happiness.missedFeedStreak = 0;
    happiness.partialFeedRatios = [];
    if (happiness.fullFeedStreak >= getGameSetting(state, "fullFeedStreakForIncrease")) {
      happiness.status = "positive";
      happiness.fullFeedStreak = 0;
    }
  } else if (ratio < getGameSetting(state, "partialFeedMinimumRatio")) {
    happiness.fullFeedStreak = 0;
    happiness.partialFeedRatios = [];
    happiness.missedFeedStreak = Math.min(
      getGameSetting(state, "missedFeedStreakForStarvation"),
      happiness.missedFeedStreak + 1
    );
    happiness.status = shiftStatus(previousStatus, HAPPINESS_ORDER, -1);
  } else {
    const previousRatio = happiness.partialFeedRatios.at(-1);
    happiness.fullFeedStreak = 0;
    happiness.missedFeedStreak = 0;
    const normalized = roundFood(ratio);
    if (previousRatio != null && normalized <= previousRatio + 0.0001) {
      happiness.status = shiftStatus(previousStatus, HAPPINESS_ORDER, -1);
      happiness.partialFeedRatios = [normalized];
    } else {
      happiness.partialFeedRatios = [...happiness.partialFeedRatios, normalized].slice(
        -getGameSetting(state, "partialFeedMemoryLength")
      );
      if (
        happiness.partialFeedRatios.length
        >= getGameSetting(state, "partialFeedMemoryLength")
      ) {
        happiness.status = shiftStatus(previousStatus, HAPPINESS_ORDER, 1);
        happiness.partialFeedRatios = [];
      }
    }
  }
  return {
    previousStatus,
    nextStatus: happiness.status,
    starvationTriggered:
      ratio < getGameSetting(state, "partialFeedMinimumRatio")
      && happiness.missedFeedStreak
        >= getGameSetting(state, "missedFeedStreakForStarvation"),
  };
}

function classPopulationTotal(classState) {
  return Math.max(0, Math.floor(classState?.children ?? 0))
    + Math.max(0, Math.floor(classState?.adults ?? 0))
    + eldersCount(classState);
}

function emptyPopulationComposition() {
  return Object.fromEntries(POPULATION_CLASS_ORDER.map((classId) => [classId, {
    children: 0,
    adults: 0,
    eldersByAge: [],
  }]));
}

function clonePopulationComposition(composition) {
  const result = emptyPopulationComposition();
  for (const classId of POPULATION_CLASS_ORDER) {
    const source = composition?.[classId] ?? {};
    result[classId] = {
      children: Math.max(0, Math.floor(source.children ?? 0)),
      adults: Math.max(0, Math.floor(source.adults ?? 0)),
      eldersByAge: (source.eldersByAge ?? []).map((cohort) => ({
        age: Math.max(0, Math.floor(cohort?.age ?? 0)),
        count: Math.max(0, Math.floor(cohort?.count ?? 0)),
      })).filter((cohort) => cohort.count > 0),
    };
  }
  return result;
}

function compositionBins(composition) {
  const bins = [];
  for (const [classIndex, classId] of POPULATION_CLASS_ORDER.entries()) {
    const cohort = composition?.[classId] ?? {};
    bins.push({ classId, kind: "children", age: null, count: cohort.children ?? 0, order: classIndex * 1000 });
    bins.push({ classId, kind: "adults", age: null, count: cohort.adults ?? 0, order: classIndex * 1000 + 1 });
    for (const [ageIndex, elder] of [...(cohort.eldersByAge ?? [])]
      .sort((a, b) => a.age - b.age).entries()) {
      bins.push({
        classId,
        kind: "elder",
        age: elder.age,
        count: elder.count,
        order: classIndex * 1000 + 2 + ageIndex,
      });
    }
  }
  return bins.filter((bin) => bin.count > 0);
}

function compositionFromBins(bins) {
  const result = emptyPopulationComposition();
  for (const bin of bins) {
    if (!result[bin.classId] || bin.count <= 0) continue;
    if (bin.kind === "children") result[bin.classId].children += bin.count;
    else if (bin.kind === "adults") result[bin.classId].adults += bin.count;
    else result[bin.classId].eldersByAge.push({ age: bin.age, count: bin.count });
  }
  for (const classId of POPULATION_CLASS_ORDER) {
    const merged = new Map();
    for (const cohort of result[classId].eldersByAge) {
      merged.set(cohort.age, (merged.get(cohort.age) ?? 0) + cohort.count);
    }
    result[classId].eldersByAge = [...merged.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([age, count]) => ({ age, count }));
  }
  return result;
}

function compositionTotal(composition) {
  return compositionBins(composition).reduce((sum, bin) => sum + bin.count, 0);
}

function selectPopulationComposition(settlement, classIds, requestedCount) {
  const source = emptyPopulationComposition();
  for (const classId of classIds) {
    const classState = settlement?.populationByClass?.[classId];
    if (!classState) continue;
    source[classId] = {
      children: Math.max(0, Math.floor(classState.children ?? 0)),
      adults: Math.max(0, Math.floor(classState.adults ?? 0)),
      eldersByAge: (classState.eldersByAge ?? []).map((cohort) => ({
        age: cohort.age,
        count: Math.max(0, Math.floor(cohort.count ?? 0)),
      })),
    };
  }
  const bins = compositionBins(source);
  const available = bins.reduce((sum, bin) => sum + bin.count, 0);
  const target = Math.min(available, Math.max(0, Math.floor(requestedCount)));
  if (target <= 0 || available <= 0) return emptyPopulationComposition();
  const allocations = bins.map((bin) => {
    const exact = target * bin.count / available;
    const count = Math.min(bin.count, Math.floor(exact));
    return { ...bin, count, remainder: exact - count, capacity: bin.count };
  });
  let remaining = target - allocations.reduce((sum, bin) => sum + bin.count, 0);
  for (const bin of [...allocations].sort((a, b) =>
    b.remainder - a.remainder || a.order - b.order)) {
    if (remaining <= 0) break;
    if (bin.count >= bin.capacity) continue;
    bin.count += 1;
    remaining -= 1;
  }
  return compositionFromBins(allocations);
}

function createMoonRegionResult(regionId) {
  return {
    regionId,
    birth: null,
    food: null,
    housing: null,
    faith: null,
    migration: null,
    death: null,
  };
}

function createMoonTurn(state, phase) {
  return {
    moonIndex: phase.moonIndex,
    startedSec: state.tSec,
    phaseId: phase.id,
    phaseIndex: phase.phaseIndex,
    regions: Object.fromEntries(
      getDetailedSettlementSites(state).map((site) => [
        site.regionId,
        createMoonRegionResult(site.regionId),
      ])
    ),
    migrationIntents: [],
    movements: [],
    unresolved: [],
  };
}

function beginMoonTurn(state, phase) {
  const civilization = state.civilization;
  const previous = civilization.currentMoonTurn;
  if (previous) {
    civilization.lastMoonTurn = clone(previous);
    for (const site of getDetailedSettlementSites(state)) {
      site.detailedState.lastMoonResult = clone(
        previous.regions?.[site.regionId] ?? createMoonRegionResult(site.regionId)
      );
    }
  }
  civilization.currentMoonTurn = createMoonTurn(state, phase);
  return civilization.currentMoonTurn;
}

function ensureMoonTurn(state, phase = getMoonPhaseAtSecond(state)) {
  const current = state?.civilization?.currentMoonTurn;
  if (current?.moonIndex === phase.moonIndex) return current;
  return beginMoonTurn(state, phase);
}

function setMoonTurnPhase(state, phase) {
  const turn = ensureMoonTurn(state, phase);
  turn.phaseId = phase.id;
  turn.phaseIndex = phase.phaseIndex;
  return turn;
}

function getReservedSourceComposition(turn, sourceRegionId) {
  const result = emptyPopulationComposition();
  for (const intent of turn?.migrationIntents ?? []) {
    if (intent.sourceId !== sourceRegionId) continue;
    for (const classId of POPULATION_CLASS_ORDER) {
      const target = result[classId];
      const source = intent.composition?.[classId];
      if (!source) continue;
      target.children += source.children;
      target.adults += source.adults;
      const byAge = new Map(target.eldersByAge.map((cohort) => [cohort.age, cohort.count]));
      for (const cohort of source.eldersByAge ?? []) {
        byAge.set(cohort.age, (byAge.get(cohort.age) ?? 0) + cohort.count);
      }
      target.eldersByAge = [...byAge.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([age, count]) => ({ age, count }));
    }
  }
  return result;
}

function selectUnreservedPopulation(
  turn,
  sourceRegionId,
  settlement,
  classIds,
  requestedCount
) {
  const holder = { populationByClass: clonePopulationComposition(settlement.populationByClass) };
  removePopulationComposition(holder, getReservedSourceComposition(turn, sourceRegionId));
  return selectPopulationComposition(holder, classIds, requestedCount);
}

function addMoonMigrationIntent(state, turn, intent) {
  const composition = clonePopulationComposition(intent.composition);
  const requested = compositionTotal(composition);
  if (requested <= 0) return null;
  const next = { ...intent, requested, composition };
  turn.migrationIntents.push(next);
  return next;
}

function removePopulationComposition(settlement, composition) {
  for (const classId of POPULATION_CLASS_ORDER) {
    const classState = settlement?.populationByClass?.[classId];
    const removal = composition?.[classId];
    if (!classState || !removal) continue;
    classState.children = Math.max(0, classState.children - removal.children);
    classState.adults = Math.max(0, classState.adults - removal.adults);
    const removalsByAge = new Map(
      (removal.eldersByAge ?? []).map((cohort) => [cohort.age, cohort.count])
    );
    classState.eldersByAge = (classState.eldersByAge ?? []).map((cohort) => ({
      ...cohort,
      count: Math.max(0, cohort.count - (removalsByAge.get(cohort.age) ?? 0)),
    })).filter((cohort) => cohort.count > 0);
  }
}

function takeFromComposition(composition, count) {
  const holder = { populationByClass: clonePopulationComposition(composition) };
  const selected = selectPopulationComposition(holder, POPULATION_CLASS_ORDER, count);
  removePopulationComposition(holder, selected);
  for (const classId of POPULATION_CLASS_ORDER) {
    composition[classId] = holder.populationByClass[classId];
  }
  return selected;
}

function resetEmptyStrangerCohort(settlement) {
  const stranger = settlement?.populationByClass?.stranger;
  if (!stranger || classPopulationTotal(stranger) > 0) return;
  stranger.faith = { tier: "gold", trend: null, streak: 0 };
  stranger.happiness = {
    status: "neutral",
    fullFeedStreak: 0,
    missedFeedStreak: 0,
    partialFeedRatios: [],
  };
}

function addCompositionToStrangers(settlement, composition) {
  const stranger = settlement?.populationByClass?.stranger;
  if (!stranger) return;
  const wasEmpty = classPopulationTotal(stranger) === 0;
  if (wasEmpty) resetEmptyStrangerCohort(settlement);
  for (const classId of POPULATION_CLASS_ORDER) {
    const incoming = composition?.[classId];
    if (!incoming) continue;
    stranger.children += incoming.children;
    stranger.adults += incoming.adults;
    const merged = new Map((stranger.eldersByAge ?? []).map(
      (cohort) => [cohort.age, cohort.count]
    ));
    for (const cohort of incoming.eldersByAge ?? []) {
      merged.set(cohort.age, (merged.get(cohort.age) ?? 0) + cohort.count);
    }
    stranger.eldersByAge = [...merged.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([age, count]) => ({ age, count }));
  }
}

function getMigrationHousingTarget(state, regionId) {
  return Math.floor(getHousingCapacity(state, regionId));
}

function getSettlementFoodTotal(settlement) {
  return roundFood((settlement?.storedFood ?? 0) + (settlement?.looseFood ?? 0));
}

function compareAuthoredRegionIds(state, regionAId, regionBId) {
  const sites = getDetailedSettlementSites(state);
  const indexA = sites.findIndex((site) => site.regionId === regionAId);
  const indexB = sites.findIndex((site) => site.regionId === regionBId);
  return (indexA < 0 ? Number.MAX_SAFE_INTEGER : indexA)
    - (indexB < 0 ? Number.MAX_SAFE_INTEGER : indexB);
}

function getMigrationCandidates(state, intent, emitterIds, projectedPopulation) {
  const sourceSummary = getPopulationSummary(state, intent.sourceId);
  const sourceRatio = sourceSummary.housingCapacity > 0
    ? sourceSummary.total / sourceSummary.housingCapacity
    : Number.POSITIVE_INFINITY;
  const candidates = getConnectedRegionIds(state, intent.sourceId)
    .filter((regionId) => getDetailedSettlement(state, regionId))
    .filter((regionId) => !emitterIds.has(regionId))
    .map((regionId) => {
      const settlement = getDetailedSettlement(state, regionId);
      resetEmptyStrangerCohort(settlement);
      const summary = getPopulationSummary(state, regionId);
      const target = getMigrationHousingTarget(state, regionId);
      const projected = projectedPopulation[regionId] ?? summary.total;
      const headroom = Math.max(0, target - projected);
      const occupancyRatio = summary.housingCapacity > 0
        ? projected / summary.housingCapacity
        : Number.POSITIVE_INFINITY;
      const food = getSettlementFoodTotal(settlement);
      return { regionId, headroom, occupancyRatio, food };
    })
    .filter((candidate) => candidate.headroom > 0)
    .filter((candidate) => {
      return candidate.occupancyRatio < sourceRatio && candidate.food > 0;
    });
  return candidates.sort((a, b) => {
    return a.occupancyRatio - b.occupancyRatio
      || b.food - a.food
      || b.headroom - a.headroom
      || compareAuthoredRegionIds(state, a.regionId, b.regionId);
  }).map((candidate) => candidate.regionId);
}

function getExternalMigrationDestinations(state, sourceRegionId) {
  const order = new Map((state?.world?.regions ?? []).map((region, index) => [region.id, index]));
  return getConnectedRegionIds(state, sourceRegionId)
    .filter((regionId) => getRegionState(state, regionId)?.controller !== "player")
    .sort((a, b) => (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER)
      || String(a).localeCompare(String(b)));
}

function allocateMigrationHousing(state, intents, emitterIds) {
  const projectedPopulation = Object.fromEntries(
    getDetailedSettlementSites(state).map((site) => [
      site.regionId,
      getPopulationSummary(state, site.regionId).total,
    ])
  );
  const work = intents.map((intent, index) => ({
    ...intent,
    intentIndex: index,
    remaining: intent.requested,
    candidateIndex: 0,
    candidates: getMigrationCandidates(state, intent, emitterIds, projectedPopulation),
  }));
  const allocations = [];
  while (work.some((intent) =>
    intent.remaining > 0 && intent.candidateIndex < intent.candidates.length)) {
    const proposalsByDestination = new Map();
    for (const intent of work) {
      if (intent.remaining <= 0 || intent.candidateIndex >= intent.candidates.length) continue;
      const destinationId = intent.candidates[intent.candidateIndex];
      if (!proposalsByDestination.has(destinationId)) {
        proposalsByDestination.set(destinationId, []);
      }
      proposalsByDestination.get(destinationId).push(intent);
    }
    for (const [destinationId, proposals] of [...proposalsByDestination.entries()]
      .sort((a, b) => compareAuthoredRegionIds(state, a[0], b[0]))) {
      const target = getMigrationHousingTarget(state, destinationId);
      const room = Math.max(0, target - projectedPopulation[destinationId]);
      const requested = proposals.reduce((sum, intent) => sum + intent.remaining, 0);
      const grantedTotal = Math.min(room, requested);
      const shares = proposals.map((intent) => {
        const exact = requested > 0 ? grantedTotal * intent.remaining / requested : 0;
        return {
          intent,
          count: Math.min(intent.remaining, Math.floor(exact)),
          remainder: exact - Math.floor(exact),
        };
      });
      let remainder = grantedTotal - shares.reduce((sum, share) => sum + share.count, 0);
      for (const share of [...shares].sort((a, b) =>
        b.remainder - a.remainder
          || compareAuthoredRegionIds(state, a.intent.sourceId, b.intent.sourceId)
          || POPULATION_CLASS_ORDER.indexOf(a.intent.sourceClassId)
            - POPULATION_CLASS_ORDER.indexOf(b.intent.sourceClassId))) {
        if (remainder <= 0) break;
        if (share.count >= share.intent.remaining) continue;
        share.count += 1;
        remainder -= 1;
      }
      for (const share of shares) {
        if (share.count > 0) {
          allocations.push({
            intentIndex: share.intent.intentIndex,
            destinationId,
            count: share.count,
          });
          share.intent.remaining -= share.count;
          projectedPopulation[destinationId] += share.count;
        }
        share.intent.candidateIndex += 1;
      }
    }
  }
  return { allocations, unresolved: work.map((intent) => intent.remaining) };
}

function getBinMealCost(state, kind) {
  if (kind === "children") return getGameSetting(state, "childMealConsumption");
  if (kind === "adults") return getGameSetting(state, "adultMealConsumption");
  return getGameSetting(state, "elderMealConsumption");
}

function allocateArrivalMeals(state, movements) {
  const byDestination = new Map();
  for (const movement of movements) {
    if (!byDestination.has(movement.destinationRegionId)) {
      byDestination.set(movement.destinationRegionId, []);
    }
    byDestination.get(movement.destinationRegionId).push(movement);
  }
  for (const destinationMovements of byDestination.values()) {
    const destination = getDetailedSettlement(
      state,
      destinationMovements[0].destinationRegionId
    );
    const bins = [];
    for (const [movementIndex, movement] of destinationMovements.entries()) {
      for (const bin of compositionBins(movement.composition)) {
        bins.push({
          ...bin,
          movementIndex,
          mealCost: getBinMealCost(state, bin.kind),
          survivorCount: 0,
        });
      }
    }
    const availableFood = getSettlementFoodTotal(destination);
    const paidDemand = bins.reduce(
      (sum, bin) => sum + bin.count * Math.max(0, bin.mealCost),
      0
    );
    const coverage = paidDemand > 0 ? Math.min(1, availableFood / paidDemand) : 1;
    let usedFood = 0;
    for (const bin of bins) {
      if (bin.mealCost <= 0) {
        bin.survivorCount = bin.count;
        bin.remainder = 0;
      } else {
        const exact = bin.count * coverage;
        bin.survivorCount = Math.floor(exact);
        bin.remainder = exact - bin.survivorCount;
        usedFood += bin.survivorCount * bin.mealCost;
      }
    }
    let remainingFood = roundFood(Math.max(0, availableFood - usedFood));
    let progressed = true;
    const rankedBins = [...bins].sort((a, b) =>
      b.remainder - a.remainder
        || a.movementIndex - b.movementIndex
        || a.order - b.order);
    while (progressed) {
      progressed = false;
      for (const bin of rankedBins) {
        if (bin.survivorCount >= bin.count || bin.mealCost <= 0) continue;
        if (bin.mealCost > remainingFood + 0.00001) continue;
        bin.survivorCount += 1;
        remainingFood = roundFood(remainingFood - bin.mealCost);
        usedFood += bin.mealCost;
        progressed = true;
      }
    }
    consumeFood(destination, roundFood(usedFood));
    for (const [movementIndex, movement] of destinationMovements.entries()) {
      const survivorBins = bins
        .filter((bin) => bin.movementIndex === movementIndex)
        .map((bin) => ({ ...bin, count: bin.survivorCount }));
      movement.survivorComposition = compositionFromBins(survivorBins);
      movement.survivors = compositionTotal(movement.survivorComposition);
      movement.arrivalDeaths = movement.amount - movement.survivors;
    }
  }
}

function compactMigrationMovement(movement) {
  return {
    transferId: movement.transferId,
    reason: movement.reason,
    sourceRegionId: movement.sourceRegionId,
    destinationRegionId: movement.destinationRegionId,
    sourceClassId: movement.sourceClassId,
    amount: movement.amount,
    survivors: movement.survivors,
    arrivalDeaths: movement.arrivalDeaths,
    external: movement.external === true,
    composition: clonePopulationComposition(movement.composition),
    survivorComposition: clonePopulationComposition(movement.survivorComposition),
  };
}

function resolveMigrationIntents(state, intents, {
  requiresArrivalMeal = false,
  unresolvedAreLost = false,
  deferArrival = false,
  tSec = state.tSec,
} = {}) {
  const green = getGreenAscendancySummary(state);
  const requestedIntents = intents.filter((intent) => intent.requested > 0);
  const blocked = [];
  const active = requestedIntents.map((intent, originalIndex) => {
    const allowed = Math.floor(intent.requested * green.migrationSuccess / 100);
    const remainder = clonePopulationComposition(intent.composition);
    const composition = takeFromComposition(remainder, allowed);
    if (compositionTotal(remainder) > 0) blocked.push({
      reason: intent.reason, sourceRegionId: intent.sourceId, sourceClassId: intent.sourceClassId,
      count: compositionTotal(remainder), composition: clonePopulationComposition(remainder),
    });
    return { ...intent, requested: allowed, composition, originalIndex };
  }).filter((intent) => intent.requested > 0);
  const emitterIds = new Set(requestedIntents.map((intent) => intent.sourceId));
  const { allocations, unresolved } = allocateMigrationHousing(state, active, emitterIds);
  const remainingCompositions = active.map((intent) =>
    clonePopulationComposition(intent.composition));
  const movements = allocations.map((allocation) => {
    const intent = active[allocation.intentIndex];
    return {
      reason: intent.reason,
      sourceRegionId: intent.sourceId,
      destinationRegionId: allocation.destinationId,
      sourceClassId: intent.sourceClassId,
      amount: allocation.count,
      composition: takeFromComposition(
        remainingCompositions[allocation.intentIndex],
        allocation.count
      ),
      survivors: allocation.count,
      arrivalDeaths: 0,
      survivorComposition: null,
    };
  });
  for (const movement of movements) {
    removePopulationComposition(
      getDetailedSettlement(state, movement.sourceRegionId),
      movement.composition
    );
  }
  const externalMovements = [];
  for (const [index, count] of unresolved.entries()) {
    if (count <= 0) continue;
    const intent = active[index];
    const destinationRegionId = getExternalMigrationDestinations(state, intent.sourceId)[0] ?? null;
    if (!destinationRegionId) continue;
    const composition = takeFromComposition(remainingCompositions[index], count);
    const amount = compositionTotal(composition);
    if (amount <= 0) continue;
    removePopulationComposition(getDetailedSettlement(state, intent.sourceId), composition);
    externalMovements.push({
      reason: intent.reason, sourceRegionId: intent.sourceId, destinationRegionId,
      sourceClassId: intent.sourceClassId, amount, survivors: amount, arrivalDeaths: 0,
      composition, survivorComposition: clonePopulationComposition(composition), external: true,
      originalIndex: intent.originalIndex,
    });
    unresolved[index] = 0;
  }
  const sourceLosses = [];
  if (unresolvedAreLost) {
    for (const [index, count] of unresolved.entries()) {
      if (count <= 0) continue;
      const intent = active[index];
      const source = getDetailedSettlement(state, intent.sourceId);
      const lossComposition = selectPopulationComposition(
        source,
        [intent.sourceClassId],
        count
      );
      removePopulationComposition(source, lossComposition);
      sourceLosses.push({
        reason: intent.reason,
        sourceRegionId: intent.sourceId,
        sourceClassId: intent.sourceClassId,
        count: compositionTotal(lossComposition),
        composition: lossComposition,
      });
    }
  }
  if (requiresArrivalMeal && !deferArrival) allocateArrivalMeals(state, movements);
  for (const [index, movement] of movements.entries()) {
    if (!requiresArrivalMeal) {
      movement.survivorComposition = clonePopulationComposition(movement.composition);
    }
    if (!deferArrival) {
      addCompositionToStrangers(
        getDetailedSettlement(state, movement.destinationRegionId),
        movement.survivorComposition
      );
    }
    movement.transferId = `migration:${Math.max(0, Math.floor(tSec))}:${movement.reason}:${index}`;
  }
  for (const [index, movement] of externalMovements.entries()) {
    movement.transferId = `migration:${Math.max(0, Math.floor(tSec))}:external:${movement.reason}:${index}`;
  }
  for (const site of getDetailedSettlementSites(state)) {
    resetEmptyStrangerCohort(site.detailedState);
  }
  return {
    movements: [...movements, ...externalMovements],
    externalEmigrants: externalMovements.reduce((sum, movement) => sum + movement.amount, 0),
    sourceLosses,
    unresolvedCompositions: [...active.map((intent, index) => ({
      reason: intent.reason,
      sourceRegionId: intent.sourceId,
      sourceClassId: intent.sourceClassId,
      count: unresolved[index],
      composition: clonePopulationComposition(remainingCompositions[index]),
    })).filter((entry) => entry.count > 0), ...blocked],
    intentSummaries: requestedIntents.map((intent, originalIndex) => {
      const activeIndex = active.findIndex((entry) => entry.originalIndex === originalIndex);
      const eligible = Math.floor(intent.requested * green.migrationSuccess / 100);
      const unplaced = activeIndex < 0 ? 0 : unresolved[activeIndex];
      const external = externalMovements.filter((movement) => movement.originalIndex === originalIndex)
        .reduce((sum, movement) => sum + movement.amount, 0);
      return {
      reason: intent.reason,
      sourceRegionId: intent.sourceId,
      sourceClassId: intent.sourceClassId,
      requested: intent.requested,
      eligible, greenBlocked: intent.requested - eligible,
      admitted: eligible - unplaced, external,
      unresolved: unplaced + intent.requested - eligible,
      unresolvedOutcome: unresolvedAreLost ? "lost" : "stayed",
      };
    }),
  };
}

function runBirthPhase(state, phase) {
  const turn = beginMoonTurn(state, phase);
  runPracticeActivation(state, "birth");
  const lastAgedYear = Math.max(1, Math.floor(
    state.civilization.lastPopulationAgingYear ?? 1
  ));
  const ageAdvance = Math.max(0, Math.floor(state.year ?? 1) - lastAgedYear);
  for (const site of getDetailedSettlementSites(state)) {
    const settlement = site.detailedState;
    const result = { tSec: state.tSec, year: state.year, byClass: {} };
    for (const classId of POPULATION_CLASS_ORDER) {
      const classState = settlement.populationByClass[classId];
      const snapshot = clone(classState);
      if (ageAdvance > 0) {
        snapshot.eldersByAge = snapshot.eldersByAge.map((cohort) => ({
          ...cohort,
          age: cohort.age + ageAdvance,
        }));
      }
      const faithLabel = String(snapshot.faith.tier ?? "gold")
        .replace(/^./, (letter) => letter.toUpperCase());
      const birthRate = resolveProbability(getGameSetting(state, `birthRate${faithLabel}`));
      const childToAdultRate = getGameSetting(state, "childToAdultRate");
      const adultToElderRate = getGameSetting(state, "adultToElderRate");
      const births = rollCount(state, snapshot.adults, birthRate);
      const matured = rollCount(state, snapshot.children, childToAdultRate);
      const newElders = rollCount(state, snapshot.adults, adultToElderRate);
      const nextElders = snapshot.eldersByAge.map((cohort) => ({ ...cohort }));
      if (newElders > 0) {
        const newElderAge = getGameSetting(state, "newElderAge");
        const existing = nextElders.find((cohort) => cohort.age === newElderAge);
        if (existing) existing.count += newElders;
        else nextElders.push({ age: newElderAge, count: newElders });
      }
      classState.children = snapshot.children - matured + births;
      classState.adults = snapshot.adults + matured - newElders;
      classState.eldersByAge = nextElders.sort((a, b) => a.age - b.age);
      result.byClass[classId] = {
        births,
        matured,
        newElders,
        ageAdvance,
        birthRate,
        childToAdultRate,
        adultToElderRate,
      };
    }
    turn.regions[site.regionId].birth = result;
  }
  state.civilization.lastPopulationAgingYear = Math.max(
    lastAgedYear,
    Math.floor(state.year ?? 1)
  );
}

function evaluateFoodHappiness(state, classState, ratio) {
  const previousStatus = classState.happiness.status;
  const result = updateHappiness(state, classState, ratio);
  const targetStatus = result.starvationTriggered
    ? shiftStatus(previousStatus, HAPPINESS_ORDER, -1)
    : classState.happiness.status;
  classState.happiness.status = previousStatus;
  return { ...result, targetStatus };
}

function runFoodPhase(state, phase) {
  const turn = setMoonTurnPhase(state, phase);
  runPracticeActivation(state, "food", "preRouting");
  applyAdministrationMoves(state, planDetailedAdministrationMoves(state));
  runPracticeActivation(state, "food", "postRouting");
  for (const site of getDetailedSettlementSites(state)) {
    const settlement = site.detailedState;
    const population = getPopulationSummary(state, site.regionId);
    let consumed = 0;
    const byClass = {};
    for (const classId of POPULATION_CLASS_ORDER) {
      const classState = settlement.populationByClass[classId];
      const classTotal = classPopulationTotal(classState);
      const demand = population.byClass[classId]?.mealDemand ?? 0;
      const classConsumed = consumeFood(settlement, demand);
      const ratio = demand > 0 ? classConsumed / demand : 1;
      consumed = roundFood(consumed + classConsumed);
      if (classId === "stranger" && classTotal <= 0) {
        resetEmptyStrangerCohort(settlement);
        byClass[classId] = { demand, consumed: classConsumed, ratio: 1, migrants: 0 };
        continue;
      }
      const happiness = evaluateFoodHappiness(state, classState, ratio);
      const requested = happiness.starvationTriggered
        ? Math.ceil(classTotal * (1 - ratio) - 0.00001)
        : 0;
      const composition = selectUnreservedPopulation(
        turn,
        site.regionId,
        settlement,
        [classId],
        requested
      );
      const intent = addMoonMigrationIntent(state, turn, {
        reason: "food",
        sourceId: site.regionId,
        sourceClassId: classId,
        composition,
      });
      byClass[classId] = {
        demand,
        consumed: classConsumed,
        ratio: roundFood(ratio),
        migrants: intent?.requested ?? 0,
        previousHappiness: happiness.previousStatus,
        targetHappiness: happiness.targetStatus,
      };
    }
    const result = {
      tSec: state.tSec,
      demand: population.mealDemand,
      consumed,
      ratio: roundFood(population.mealDemand > 0 ? consumed / population.mealDemand : 1),
      byClass,
      migration: { intents: [], outbound: [], inbound: [], sourceLosses: [] },
    };
    settlement.lastMeal = result;
    turn.regions[site.regionId].food = clone(result);
  }
}

function runHousingPhase(state, phase) {
  const turn = setMoonTurnPhase(state, phase);
  for (const site of getDetailedSettlementSites(state)) {
    const settlement = site.detailedState;
    const population = getPopulationSummary(state, site.regionId);
    const alreadyMigrating = compositionTotal(
      getReservedSourceComposition(turn, site.regionId)
    );
    const assessedPopulation = Math.max(0, population.total - alreadyMigrating);
    const capacity = population.housingCapacity;
    const overflow = Math.max(0, assessedPopulation - capacity);
    const happinessCap = assessedPopulation <= capacity
      ? "positive"
      : assessedPopulation > capacity * getGameSetting(state, "overHousingNegativeRatio")
        ? "negative"
        : "neutral";
    const composition = selectUnreservedPopulation(
      turn,
      site.regionId,
      settlement,
      ["stranger", "villager"],
      overflow
    );
    const intent = addMoonMigrationIntent(state, turn, {
      reason: "housing",
      sourceId: site.regionId,
      sourceClassId: null,
      composition,
    });
    turn.regions[site.regionId].housing = {
      tSec: state.tSec,
      population: assessedPopulation,
      capacity,
      overflow,
      migrants: intent?.requested ?? 0,
      happinessCap,
    };
  }
}

function normalizeFaithRuntime(faith) {
  faith.trend = faith.trend === "positive" || faith.trend === "negative"
    ? faith.trend
    : null;
  faith.streak = Math.max(0, Math.floor(faith.streak ?? 0));
  faith.collapseActive = faith.collapseActive === true;
  return faith;
}

function applyFaithOutcome(state, classState) {
  const faith = normalizeFaithRuntime(classState.faith);
  const happiness = classState.happiness.status;
  const trend = happiness === "positive" || happiness === "negative" ? happiness : null;
  if (!trend) {
    faith.trend = null;
    faith.streak = 0;
    return { shifted: false, previousTier: faith.tier, nextTier: faith.tier };
  }
  faith.streak = faith.trend === trend ? faith.streak + 1 : 1;
  faith.trend = trend;
  const previousTier = faith.tier;
  if (faith.streak >= getGameSetting(state, "faithStreakForShift")) {
    faith.tier = shiftStatus(faith.tier, FAITH_ORDER, trend === "positive" ? 1 : -1);
    faith.streak = 0;
  }
  return { shifted: faith.tier !== previousTier, previousTier, nextTier: faith.tier };
}

function runFaithPhase(state, phase) {
  const turn = setMoonTurnPhase(state, phase);
  for (const site of getDetailedSettlementSites(state)) {
    const settlement = site.detailedState;
    const byClass = {};
    const housingCap = turn.regions[site.regionId].housing?.happinessCap ?? "positive";
    for (const classId of POPULATION_CLASS_ORDER) {
      const classState = settlement.populationByClass[classId];
      if (classId === "stranger" && classPopulationTotal(classState) <= 0) {
        resetEmptyStrangerCohort(settlement);
        continue;
      }
      const food = turn.regions[site.regionId].food?.byClass?.[classId];
      const previousHappiness = classState.happiness.status;
      const foodTarget = food?.targetHappiness ?? previousHappiness;
      const foodIndex = Math.max(0, HAPPINESS_ORDER.indexOf(foodTarget));
      const capIndex = Math.max(0, HAPPINESS_ORDER.indexOf(housingCap));
      classState.happiness.status = HAPPINESS_ORDER[Math.min(foodIndex, capIndex)];
      const faithResult = applyFaithOutcome(state, classState);
      const collapseCondition = classState.faith.tier === "bronze"
        && classState.happiness.status === "negative";
      let displaced = 0;
      if (collapseCondition && classState.faith.collapseActive !== true) {
        const requested = Math.ceil(
          classPopulationTotal(classState) * getGameSetting(state, "bronzeCollapseLossRate")
        );
        const composition = selectUnreservedPopulation(
          turn,
          site.regionId,
          settlement,
          [classId],
          requested
        );
        displaced = addMoonMigrationIntent(state, turn, {
          reason: "faith",
          sourceId: site.regionId,
          sourceClassId: classId,
          composition,
        })?.requested ?? 0;
      }
      classState.faith.collapseActive = collapseCondition;
      byClass[classId] = {
        previousHappiness,
        happiness: classState.happiness.status,
        previousFaith: faithResult.previousTier,
        faith: faithResult.nextTier,
        faithShifted: faithResult.shifted,
        faithTrend: classState.faith.trend,
        faithStreak: classState.faith.streak,
        collapseEntered: collapseCondition && displaced > 0,
        displaced,
      };
    }
    turn.regions[site.regionId].faith = { tSec: state.tSec, byClass };
  }
  runGlobalChaos(state);
  runVassalAnnualBoundary(state);
}

function buildMoonMigrationSummary(result, regionId) {
  return {
    intents: result.intentSummaries
      .filter((intent) => intent.sourceRegionId === regionId),
    outbound: result.movements
      .filter((movement) => movement.sourceRegionId === regionId)
      .map(compactMigrationMovement),
    inbound: result.movements
      .filter((movement) => movement.destinationRegionId === regionId)
      .map(compactMigrationMovement),
    sourceLosses: [],
  };
}

function runMigrationPhase(state, phase) {
  const turn = setMoonTurnPhase(state, phase);
  const result = resolveMigrationIntents(state, turn.migrationIntents, {
    requiresArrivalMeal: true,
    unresolvedAreLost: false,
    deferArrival: true,
  });
  turn.movements = result.movements;
  recordChaosLosses(state, { externalEmigrants: result.externalEmigrants });
  turn.unresolved = result.unresolvedCompositions;
  turn.migrationIntentSummaries = result.intentSummaries;
  for (const site of getDetailedSettlementSites(state)) {
    const summary = buildMoonMigrationSummary(result, site.regionId);
    ensureMoonRegionResult(turn, site.regionId).migration = {
      tSec: state.tSec,
      ...summary,
    };
    if (site.detailedState.lastMeal) {
      site.detailedState.lastMeal.migration = clone(summary);
    }
  }
}

function rollCompositionDeaths(state, composition, probability) {
  const deaths = emptyPopulationComposition();
  for (const classId of POPULATION_CLASS_ORDER) {
    const source = composition?.[classId];
    const target = deaths[classId];
    if (!source) continue;
    target.children = rollCount(state, source.children, probability);
    target.adults = rollCount(state, source.adults, probability);
    target.eldersByAge = (source.eldersByAge ?? []).map((cohort) => ({
      age: cohort.age,
      count: rollCount(state, cohort.count, probability),
    })).filter((cohort) => cohort.count > 0);
  }
  return deaths;
}

function runDeathPhase(state, phase) {
  const turn = setMoonTurnPhase(state, phase);
  const internalMovements = turn.movements.filter((movement) => movement.external !== true);
  allocateArrivalMeals(state, internalMovements);
  for (const movement of internalMovements) {
    addCompositionToStrangers(
      getDetailedSettlement(state, movement.destinationRegionId),
      movement.survivorComposition
    );
  }
  const hardshipDeathsByRegion = Object.fromEntries(
    getDetailedSettlementSites(state).map((site) => [site.regionId, 0])
  );
  let prematureDeaths = 0;
  let oldAgeDeaths = 0;
  for (const unresolved of turn.unresolved) {
    const deaths = rollCompositionDeaths(
      state,
      unresolved.composition,
      getGameSetting(state, "migrationHardshipDeathRate")
    );
    removePopulationComposition(
      getDetailedSettlement(state, unresolved.sourceRegionId),
      deaths
    );
    hardshipDeathsByRegion[unresolved.sourceRegionId] += compositionTotal(deaths);
    prematureDeaths += compositionTotal(deaths);
  }
  for (const site of getDetailedSettlementSites(state)) {
    const settlement = site.detailedState;
    const regionResult = ensureMoonRegionResult(turn, site.regionId);
    const byClass = {};
    for (const classId of POPULATION_CLASS_ORDER) {
      const classState = settlement.populationByClass[classId];
      let naturalDeaths = 0;
      classState.eldersByAge = (classState.eldersByAge ?? []).map((cohort) => {
        const green = getGreenAscendancySummary(state);
        const mortality = getElderMortalityRate(cohort.age, state)
          * (1 - Math.min(1, green.elderMortalityReduction / 100));
        const deaths = rollCount(state, cohort.count, mortality);
        naturalDeaths += deaths;
        return { ...cohort, count: cohort.count - deaths };
      }).filter((cohort) => cohort.count > 0);
      byClass[classId] = { naturalDeaths };
      oldAgeDeaths += naturalDeaths;
    }
    const storedBefore = settlement.storedFood;
    const looseBefore = settlement.looseFood;
    const green = getGreenAscendancySummary(state);
    const preservationRatio = Math.min(1, (
      getPreserveReduction(state, site) + green.storedFoodDecayReduction
    ) / 100);
    settlement.storedFood = roundFood(settlement.storedFood * (1 - Math.max(
      0,
      getGameSetting(state, "storedFoodDecayRate") * (1 - preservationRatio)
    )));
    settlement.looseFood = roundFood(
      settlement.looseFood * (1 - getGameSetting(state, "looseFoodDecayRate"))
    );
    const migration = {
      ...(regionResult.migration ?? {
        intents: [], outbound: [], inbound: [], sourceLosses: [],
      }),
      outbound: turn.movements
        .filter((movement) => movement.sourceRegionId === site.regionId)
        .map(compactMigrationMovement),
      inbound: turn.movements
        .filter((movement) => movement.destinationRegionId === site.regionId)
        .map(compactMigrationMovement),
    };
    regionResult.migration = migration;
    regionResult.death = {
      tSec: state.tSec,
      byClass,
      hardshipDeaths: hardshipDeathsByRegion[site.regionId],
      arrivalDeaths: migration.inbound.reduce((sum, move) => sum + move.arrivalDeaths, 0),
      storedFoodRot: roundFood(storedBefore - settlement.storedFood),
      looseFoodRot: roundFood(looseBefore - settlement.looseFood),
    };
    if (settlement.lastMeal) settlement.lastMeal.migration = clone(migration);
    resetEmptyStrangerCohort(settlement);
  }
  prematureDeaths += internalMovements.reduce((sum, movement) => sum + movement.arrivalDeaths, 0);
  recordChaosLosses(state, { prematureDeaths, oldAgeDeaths });
}

export function resolveProbability(base, modifiers = null) {
  const additions = (modifiers?.additive ?? []).reduce(
    (sum, value) => sum + (Number.isFinite(value) ? value : 0), 0
  );
  const multiplier = (modifiers?.multipliers ?? []).reduce(
    (product, value) => product * (Number.isFinite(value) ? value : 1), 1
  );
  return Math.max(0, Math.min(1, (base + additions) * multiplier));
}

export function getElderMortalityRate(age, state = null) {
  if (age <= 49) return getGameSetting(state, "elderMortalityThrough49");
  if (age <= 54) return getGameSetting(state, "elderMortality50To54");
  if (age <= 59) return getGameSetting(state, "elderMortality55To59");
  if (age <= 64) return getGameSetting(state, "elderMortality60To64");
  if (age <= 69) return getGameSetting(state, "elderMortality65To69");
  if (age <= 74) return getGameSetting(state, "elderMortality70To74");
  return getGameSetting(state, "elderMortality75Plus");
}

function rollCount(state, count, probability) {
  let successes = 0;
  for (let index = 0; index < count; index += 1) {
    if (state.rngNextFloat() < probability) successes += 1;
  }
  return successes;
}

function shiftStatus(value, order, delta) {
  const index = Math.max(0, order.indexOf(value));
  return order[Math.max(0, Math.min(order.length - 1, index + delta))];
}

export function getPrimordialChaosPressure(state) {
  const basePressure = Math.max(0, getGameSetting(state, "primordialBasePressure"));
  const growthFactor = Math.max(1, getGameSetting(state, "primordialGrowthFactor"));
  const growthCadenceYears = Math.max(
    1,
    Math.floor(getGameSetting(state, "primordialGrowthCadenceYears"))
  );
  const elapsedYears = Math.max(0, Math.floor(state?.year ?? 1) - 1);
  const growthSteps = Math.floor(elapsedYears / growthCadenceYears);
  return roundFood(basePressure * (growthFactor ** growthSteps));
}

function runGlobalChaos(state) {
  const civilization = state.civilization;
  const pending = civilization.chaos.pendingLosses ?? {
    prematureDeaths: 0, oldAgeDeaths: 0, externalEmigrants: 0, internalMigrants: 0,
  };
  const faithPopulation = { bronze: 0, silver: 0, gold: 0, diamond: 0 };
  for (const site of getDetailedSettlementSites(state)) {
    for (const classId of POPULATION_CLASS_ORDER) {
      const classState = site.detailedState.populationByClass[classId];
      const tier = classState?.faith?.tier;
      if (Object.hasOwn(faithPopulation, tier)) {
        faithPopulation[tier] += classPopulationTotal(classState);
      }
    }
  }
  const resistance = Object.entries(faithPopulation).reduce((sum, [tier, population]) => {
    return sum + Math.floor(population / getGameSetting(state, `${tier}ChaosResistancePopulation`));
  }, 0);
  const primordialPressure = getPrimordialChaosPressure(state);
  const prematureDeathPressure = pending.prematureDeaths
    * getGameSetting(state, "prematureDeathChaosWeight");
  const externalEmigrationPressure = pending.externalEmigrants
    * getGameSetting(state, "externalEmigrationChaosWeight");
  const oldAgeDeathPressure = pending.oldAgeDeaths
    * getGameSetting(state, "oldAgeDeathChaosWeight");
  const internalMigrationPressure = pending.internalMigrants
    * getGameSetting(state, "internalMigrationChaosWeight");
  const rawPressure = primordialPressure
    + prematureDeathPressure
    + externalEmigrationPressure
    + oldAgeDeathPressure
    + internalMigrationPressure;
  const totalIncome = Math.max(0, rawPressure - resistance);
  civilization.chaos.chaosPower = roundFood(
    civilization.chaos.chaosPower + totalIncome
  );
  const spawnedTotal = Math.floor(
    civilization.chaos.chaosPower / getGameSetting(state, "chaosPerMonster")
  );
  const spawned = Math.max(0, spawnedTotal - civilization.chaos.monsterCount);
  civilization.chaos.monsterCount += spawned;
  civilization.chaos.lastMoonIncome = {
    prematureDeaths: pending.prematureDeaths,
    oldAgeDeaths: pending.oldAgeDeaths,
    externalEmigrants: pending.externalEmigrants,
    primordialPressure,
    prematureDeathPressure: roundFood(prematureDeathPressure),
    externalEmigrationPressure: roundFood(externalEmigrationPressure),
    oldAgeDeathPressure: roundFood(oldAgeDeathPressure),
    internalMigrationPressure: roundFood(internalMigrationPressure),
    rawPressure: roundFood(rawPressure),
    faithPopulation,
    resistance,
    incomingChaos: roundFood(totalIncome),
    totalIncome: roundFood(totalIncome),
    accumulatedChaos: civilization.chaos.chaosPower,
    spawned,
  };
  civilization.chaos.pendingLosses = {
    prematureDeaths: 0, oldAgeDeaths: 0, externalEmigrants: 0, internalMigrants: 0,
  };
  if (civilization.chaos.monsterCount >= civilization.chaos.monsterLossThreshold) {
    state.runStatus = {
      complete: true,
      reason: "redGodMonsterOverrun",
      year: state.year,
      tSec: state.tSec,
    };
    state.paused = true;
  }
}

function shuffleWithStateRng(state, values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = state.rngNextInt(0, index);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

const VASSAL_INTERVENTION_KINDS = Object.freeze([
  "practice",
  "structure",
  "addConnection",
  "expandSettlement",
  "globalStructure",
]);

function isPlayerDetailedRegion(state, regionId) {
  const region = getRegionState(state, regionId);
  return region?.controller === "player" && region.detailedSettlementEnabled === true;
}

function getExpansionCandidates(state, targetRegionId, reservedRegionIds = new Set()) {
  return getConnectedRegionIds(state, targetRegionId).filter((regionId) => {
    const region = getRegionState(state, regionId);
    return region?.controller === "frontier"
      && region.detailedSettlementEnabled !== true
      && !reservedRegionIds.has(regionId);
  });
}

function getCandidateConnectionEntries(state, targetRegionId, mode, connectionKeys = null) {
  const definition = getWorldDefinition(state);
  const connections = Array.isArray(state?.world?.connections) ? state.world.connections : [];
  const existing = connectionKeys ?? new Set(connections.map((entry) =>
    getWorldConnectionKey(entry.regionAId, entry.regionBId)
  ));
  const touchingTarget = (entry) =>
    entry.regionAId === targetRegionId || entry.regionBId === targetRegionId;
  if (mode === "add") {
    return getWorldConnectionCandidates(definition).filter((entry) =>
      touchingTarget(entry)
      && isPlayerDetailedRegion(state, entry.regionAId)
      && isPlayerDetailedRegion(state, entry.regionBId)
      && !existing.has(getWorldConnectionKey(entry.regionAId, entry.regionBId))
    );
  }
  return getWorldConnectionCandidates(definition).filter((entry) =>
    touchingTarget(entry) && existing.has(getWorldConnectionKey(entry.regionAId, entry.regionBId))
  );
}

function recordChaosLosses(state, losses) {
  const chaos = state.civilization.chaos;
  const pending = chaos.pendingLosses ?? {
    prematureDeaths: 0, oldAgeDeaths: 0, externalEmigrants: 0, internalMigrants: 0,
  };
  for (const key of Object.keys(pending)) {
    pending[key] += Math.max(0, Math.floor(losses?.[key] ?? 0));
  }
  chaos.pendingLosses = pending;
}

function buildCandidateIntervention(state, targetRegionId, kind, reserved = {}) {
  const settlement = getDetailedSettlement(state, targetRegionId);
  if (!settlement) return null;
  if (kind === "practice") {
    const slots = reserved.practiceSlots ?? settlement.practiceSlots.map((slot) => slot?.practiceId ?? null);
    const slotIndex = slots.findIndex((entry) => entry == null);
    const replacementIndex = slotIndex >= 0 ? slotIndex : slots.length - 1;
    const replacedPracticeId = slots[replacementIndex] ?? null;
    const practiceId = shuffleWithStateRng(state, VASSAL_INTERVENTION_PRACTICE_IDS)
      .find((id) => id !== slots[replacementIndex]) ?? null;
    if (!practiceId || replacementIndex < 0) return null;
    slots[replacementIndex] = practiceId;
    reserved.practiceSlots = slots;
    return {
      kind: "practice",
      targetRegionId,
      mode: replacedPracticeId ? "replace" : "add",
      replacedPracticeId,
      practiceId,
      slotIndex: replacementIndex,
    };
  }
  if (kind === "structure") {
    const slots = reserved.structureSlots ?? settlement.structureSlots.map((slot) => slot?.structureId ?? null);
    const slotIndex = slots.findIndex((entry) => entry == null);
    const structureId = shuffleWithStateRng(state, Object.keys(settlementStructureDefs))[0] ?? null;
    if (!structureId || slotIndex < 0) return null;
    slots[slotIndex] = structureId;
    reserved.structureSlots = slots;
    return { kind: "structure", targetRegionId, structureId, slotIndex };
  }
  if (kind === "expandSettlement") {
    const expandedRegionIds = reserved.expandedRegionIds ?? new Set();
    const regionId = shuffleWithStateRng(
      state,
      getExpansionCandidates(state, targetRegionId, expandedRegionIds)
    )[0] ?? null;
    if (!regionId) return null;
    expandedRegionIds.add(regionId);
    reserved.expandedRegionIds = expandedRegionIds;
    return { kind: "expandSettlement", sourceRegionId: targetRegionId, regionId };
  }
  if (kind === "globalStructure") {
    const globalSlots = reserved.globalStructureSlots ?? Object.fromEntries(
      getDetailedSettlementSites(state, { playerOnly: true }).map((site) => [
        site.regionId,
        site.detailedState.structureSlots.map((slot) => slot?.structureId ?? null),
      ])
    );
    const structureId = shuffleWithStateRng(
      state,
      Object.keys(settlementStructureDefs)
    )[0] ?? null;
    if (!structureId) return null;
    let reservedCount = 0;
    for (const site of getDetailedSettlementSites(state, { playerOnly: true })) {
      const slots = globalSlots[site.regionId] ?? [];
      const slotIndex = slots.findIndex((entry) => entry == null);
      if (slotIndex < 0) continue;
      slots[slotIndex] = structureId;
      globalSlots[site.regionId] = slots;
      reservedCount += 1;
    }
    if (reservedCount === 0) return null;
    reserved.globalStructureSlots = globalSlots;
    return { kind: "globalStructure", structureId };
  }
  if (kind === "addConnection" || kind === "removeConnection") {
    const connectionKeys = reserved.connectionKeys ?? new Set(
      (state.world.connections ?? []).map((entry) =>
        getWorldConnectionKey(entry.regionAId, entry.regionBId)
      )
    );
    const entries = getCandidateConnectionEntries(
      state,
      targetRegionId,
      kind === "addConnection" ? "add" : "remove",
      connectionKeys
    );
    const entry = shuffleWithStateRng(state, entries)[0] ?? null;
    if (!entry) return null;
    const key = getWorldConnectionKey(entry.regionAId, entry.regionBId);
    if (kind === "addConnection") connectionKeys.add(key);
    else connectionKeys.delete(key);
    reserved.connectionKeys = connectionKeys;
    return {
      kind: "connection",
      mode: kind === "addConnection" ? "add" : "remove",
      regionAId: entry.regionAId,
      regionBId: entry.regionBId,
    };
  }
  return null;
}

function buildRandomCandidateAgenda(state, targetRegionId) {
  const reserved = {};
  const agenda = [];
  for (let interventionIndex = 0; interventionIndex < 3; interventionIndex += 1) {
    let intervention = null;
    for (const kind of shuffleWithStateRng(state, VASSAL_INTERVENTION_KINDS)) {
      intervention = buildCandidateIntervention(state, targetRegionId, kind, reserved);
      if (intervention) break;
    }
    if (!intervention) {
      intervention = buildCandidateIntervention(state, targetRegionId, "practice", reserved);
    }
    if (!intervention) return null;
    agenda.push(intervention);
  }
  return agenda;
}

export function generateDetailedVassalCandidates(state) {
  const targetIds = getDetailedSettlementSites(state, { playerOnly: true })
    .map((site) => site.regionId);
  if (targetIds.length === 0) {
    state.civilization.vassalLineage.pendingCandidates = [];
    return [];
  }
  const candidates = [];
  for (let candidateIndex = 0; candidateIndex < 3; candidateIndex += 1) {
    const targetRegionId = shuffleWithStateRng(state, targetIds).find((id) =>
      buildRandomCandidateAgenda(state, id) != null
    );
    if (!targetRegionId) continue;
    const interventions = buildRandomCandidateAgenda(state, targetRegionId);
    if (!interventions) continue;
    const resistance = getElderOrderSummary(state, targetRegionId).resistance;
    const trait = TRAITS[state.rngNextInt(0, TRAITS.length - 1)];
    const initialAge = state.rngNextInt(
      getGameSetting(state, "vassalStartingAgeMin"),
      getGameSetting(state, "vassalStartingAgeMax")
    );
    const deathAge = state.rngNextInt(
      getGameSetting(state, "vassalDeathAgeMin"),
      getGameSetting(state, "vassalDeathAgeMax")
    );
    const requirementOffsets = [
      getGameSetting(state, "interventionRequirement01"),
      getGameSetting(state, "interventionRequirement02"),
      getGameSetting(state, "interventionRequirement03"),
    ];
    candidates.push({
      candidateId: `candidate-${state.civilization.vassalLineage.nextVassalId}-${candidateIndex + 1}`,
      targetRegionId,
      resistanceSnapshot: resistance,
      initialAge,
      deathAge,
      traitId: trait.id,
      traitPrestigeModifier: trait.prestigeDelta,
      professionId: PROFESSIONS[state.rngNextInt(0, PROFESSIONS.length - 1)],
      interventions: interventions.map((entry, index) => ({
        ...entry,
        requiredPrestige: resistance + requirementOffsets[index],
        status: "pending",
        appliedYear: null,
        appliedSec: null,
      })),
    });
  }
  state.civilization.vassalLineage.pendingCandidates = candidates;
  return candidates;
}

function candidatePoolHash(candidates) {
  return JSON.stringify(candidates);
}

function generateDetailedVassalCandidatesFromRngSnapshot(state, rerollIndex = 0) {
  const cloneState = deserializeGameState(serializeGameState(state));
  const safeRerollIndex = Number.isFinite(rerollIndex)
    ? Math.max(0, Math.min(999, Math.floor(rerollIndex)))
    : 0;
  let candidates = [];
  for (let index = 0; index <= safeRerollIndex; index += 1) {
    candidates = generateDetailedVassalCandidates(cloneState);
  }
  return candidates;
}

export function buildDetailedVassalSelectionPool(state, rerollIndex = 0) {
  if (!state || state.civilization?.vassalLineage?.currentVassal) return null;
  const safeRerollIndex = Number.isFinite(rerollIndex)
    ? Math.max(0, Math.min(999, Math.floor(rerollIndex)))
    : 0;
  const candidates = generateDetailedVassalCandidatesFromRngSnapshot(state, safeRerollIndex).map((candidate, index) => ({
    ...candidate,
    candidateIndex: index,
  }));
  return {
    poolId: `detailed-vassal-${state.civilization.vassalLineage.nextVassalId}-reroll-${safeRerollIndex}`,
    createdSec: state.tSec,
    rerollIndex: safeRerollIndex,
    candidates,
    expectedPoolHash: candidatePoolHash(candidates.map(({ candidateIndex, ...candidate }) => candidate)),
  };
}

export function getDetailedVassalDebugOptions(state) {
  return {
    targetRegions: getDetailedSettlementSites(state, { playerOnly: true }).map((site) => ({
      id: site.regionId,
      label: site.name ?? site.regionId,
    })),
    traits: TRAITS.map((entry) => ({ ...entry })),
    professions: PROFESSIONS.map((id) => ({ id, label: id })),
    interventionPracticeIds: VASSAL_INTERVENTION_PRACTICE_IDS.filter(
      (id) => !!getDetailedPracticeDef(state, id)
    ),
    interventionStructureIds: Object.keys(settlementStructureDefs),
  };
}

function ensureMoonRegionResult(turn, regionId) {
  if (!turn.regions[regionId]) {
    turn.regions[regionId] = createMoonRegionResult(regionId);
  }
  return turn.regions[regionId];
}

function createDebugInterventionReservation(state, targetRegionId) {
  const settlement = getDetailedSettlement(state, targetRegionId);
  return {
    practiceSlotsByRegion: {
      [targetRegionId]: settlement?.practiceSlots.map((slot) => slot?.practiceId ?? null) ?? [],
    },
    structureSlotsByRegion: {
      [targetRegionId]: settlement?.structureSlots.map((slot) => slot?.structureId ?? null) ?? [],
    },
    connectionKeys: new Set((state?.world?.connections ?? []).map((entry) =>
      getWorldConnectionKey(entry.regionAId, entry.regionBId)
    )),
    connectionCandidates: getWorldConnectionCandidates(getWorldDefinition(state)),
    expandedRegionIds: new Set(),
  };
}

function getDebugTargetSlots(state, reservation, regionId, kind) {
  const field = kind === "practice" ? "practiceSlotsByRegion" : "structureSlotsByRegion";
  const collection = reservation[field];
  if (Array.isArray(collection?.[regionId])) return collection[regionId];
  const settlement = getDetailedSettlement(state, regionId);
  const slots = kind === "practice"
    ? settlement?.practiceSlots.map((slot) => slot?.practiceId ?? null)
    : settlement?.structureSlots.map((slot) => slot?.structureId ?? null);
  collection[regionId] = slots ?? [];
  return collection[regionId];
}

function normalizeDebugIntervention(state, targetRegionId, raw, reservation) {
  const source = typeof raw === "string" ? { kind: "practice", practiceId: raw } : raw;
  if (!source || typeof source !== "object") return null;
  if (source.kind === "practice") {
    const interventionTargetRegionId = typeof source.targetRegionId === "string"
      ? source.targetRegionId : targetRegionId;
    if (!isPlayerDetailedRegion(state, interventionTargetRegionId)) return null;
    const practiceSlots = getDebugTargetSlots(
      state, reservation, interventionTargetRegionId, "practice"
    );
    if (!getDetailedPracticeDef(state, source.practiceId)) return null;
    const firstEmpty = practiceSlots.findIndex((practiceId) => practiceId == null);
    const slotIndex = Number.isInteger(source.slotIndex)
      ? source.slotIndex
      : (firstEmpty >= 0 ? firstEmpty : practiceSlots.length - 1);
    if (slotIndex < 0 || slotIndex >= practiceSlots.length) return null;
    const intervention = {
      kind: "practice",
      targetRegionId: interventionTargetRegionId,
      mode: practiceSlots[slotIndex] ? "replace" : "add",
      replacedPracticeId: practiceSlots[slotIndex] ?? null,
      practiceId: source.practiceId,
      slotIndex,
    };
    practiceSlots[slotIndex] = source.practiceId;
    return intervention;
  }
  if (source.kind === "structure") {
    const interventionTargetRegionId = typeof source.targetRegionId === "string"
      ? source.targetRegionId : targetRegionId;
    if (!isPlayerDetailedRegion(state, interventionTargetRegionId)) return null;
    const structureSlots = getDebugTargetSlots(
      state, reservation, interventionTargetRegionId, "structure"
    );
    const slotIndex = Number.isInteger(source.slotIndex)
      ? source.slotIndex
      : structureSlots.findIndex((structureId) => structureId == null);
    if (!settlementStructureDefs[source.structureId] || slotIndex < 0
        || slotIndex >= structureSlots.length || structureSlots[slotIndex]) return null;
    structureSlots[slotIndex] = source.structureId;
    return {
      kind: "structure", targetRegionId: interventionTargetRegionId,
      structureId: source.structureId, slotIndex,
    };
  }
  if (source.kind === "expandSettlement") {
    const sourceRegionId = typeof source.sourceRegionId === "string"
      ? source.sourceRegionId : targetRegionId;
    if (!isPlayerDetailedRegion(state, sourceRegionId)) return null;
    const candidates = getExpansionCandidates(
      state,
      sourceRegionId,
      reservation.expandedRegionIds
    );
    const regionId = typeof source.regionId === "string"
      ? candidates.find((id) => id === source.regionId)
      : candidates[0];
    if (!regionId) return null;
    reservation.expandedRegionIds.add(regionId);
    return { kind: "expandSettlement", sourceRegionId, regionId };
  }
  if (source.kind === "globalStructure") {
    if (!settlementStructureDefs[source.structureId]) return null;
    const hasRoom = getDetailedSettlementSites(state, { playerOnly: true }).some(
      (site) => site.detailedState.structureSlots.some((slot) => slot == null)
    );
    return hasRoom
      ? { kind: "globalStructure", structureId: source.structureId }
      : null;
  }
  if (source.kind === "connection" && ["add", "remove"].includes(source.mode)) {
    const candidates = reservation.connectionCandidates.filter((entry) => {
        const key = getWorldConnectionKey(entry.regionAId, entry.regionBId);
        const playerPair = isPlayerDetailedRegion(state, entry.regionAId)
          && isPlayerDetailedRegion(state, entry.regionBId);
        return playerPair && (source.mode === "add"
          ? !reservation.connectionKeys.has(key)
          : reservation.connectionKeys.has(key));
      });
    const sourceHasEndpoints = typeof source.regionAId === "string"
      && typeof source.regionBId === "string";
    const candidate = sourceHasEndpoints
      ? candidates.find((entry) =>
        getWorldConnectionKey(entry.regionAId, entry.regionBId) ===
          getWorldConnectionKey(source.regionAId, source.regionBId)
      )
      : candidates[0];
    const a = candidate?.regionAId;
    const b = candidate?.regionBId;
    const key = getWorldConnectionKey(a, b);
    const exists = reservation.connectionKeys.has(key);
    if (!candidate || (source.mode === "add" && exists) || (source.mode === "remove" && !exists)) {
      return null;
    }
    if (source.mode === "add") reservation.connectionKeys.add(key);
    else reservation.connectionKeys.delete(key);
    return { kind: "connection", mode: source.mode, regionAId: a, regionBId: b };
  }
  return null;
}

export function buildDetailedDebugVassalCandidate(state, rawSpec = {}, candidateIndex = 0) {
  const lineage = state?.civilization?.vassalLineage;
  if (!lineage) return { ok: false, reason: "noLineage" };
  const targetRegionId =
    typeof rawSpec.targetRegionId === "string" ? rawSpec.targetRegionId : null;
  if (!getDetailedVassalDebugOptions(state).targetRegions.some(
    (entry) => entry.id === targetRegionId
  )) {
    return { ok: false, reason: "invalidTargetRegion" };
  }
  const initialAge = Number.isFinite(rawSpec.initialAge)
    ? Math.max(0, Math.floor(rawSpec.initialAge))
    : getGameSetting(state, "vassalStartingAgeMin");
  const deathAge = Number.isFinite(rawSpec.deathAge)
    ? Math.max(initialAge + 1, Math.floor(rawSpec.deathAge))
    : Math.max(initialAge + 1, getGameSetting(state, "vassalDeathAgeMin"));
  const options = getDetailedVassalDebugOptions(state);
  const trait = options.traits.find((entry) => entry.id === rawSpec.traitId)
    ?? options.traits[0];
  const traitPrestigeModifier = Number.isFinite(rawSpec.traitPrestigeModifier)
    ? Number(rawSpec.traitPrestigeModifier)
    : trait?.prestigeDelta ?? 0;
  const professionId = options.professions.some((entry) => entry.id === rawSpec.professionId)
    ? rawSpec.professionId
    : options.professions[0]?.id ?? null;
  const rawInterventions = Array.isArray(rawSpec.interventions)
    ? rawSpec.interventions
    : (Array.isArray(rawSpec.interventionPracticeIds)
      ? rawSpec.interventionPracticeIds
      : options.interventionPracticeIds.slice(0, 3));
  if (rawInterventions.length !== 3) {
    return { ok: false, reason: "invalidInterventions" };
  }
  const reservation = createDebugInterventionReservation(state, targetRegionId);
  const interventions = rawInterventions.map((entry) =>
    normalizeDebugIntervention(state, targetRegionId, entry, reservation)
  );
  if (interventions.some((entry) => !entry)) return { ok: false, reason: "invalidInterventions" };
  const resistanceSnapshot = Number.isFinite(rawSpec.resistanceSnapshot)
    ? Math.max(0, Math.floor(rawSpec.resistanceSnapshot))
    : getElderOrderSummary(state, targetRegionId).resistance;
  const defaultOffsets = [
    getGameSetting(state, "interventionRequirement01"),
    getGameSetting(state, "interventionRequirement02"),
    getGameSetting(state, "interventionRequirement03"),
  ];
  const requiredPrestige = interventions.map((_, index) =>
    Number.isFinite(rawSpec.requiredPrestige?.[index])
      ? Math.max(0, Math.floor(rawSpec.requiredPrestige[index]))
      : Number.isFinite(rawInterventions[index]?.requiredPrestige)
        ? Math.max(0, Math.floor(rawInterventions[index].requiredPrestige))
      : resistanceSnapshot + defaultOffsets[index]
  );

  return {
    ok: true,
    candidate: {
      candidateId: `debug-candidate-${lineage.nextVassalId}-${Math.max(1, Math.floor(candidateIndex) + 1)}`,
      targetRegionId,
      resistanceSnapshot,
      initialAge,
      deathAge,
      traitId: trait?.id ?? "debug",
      traitPrestigeModifier,
      professionId,
      interventions: interventions.map((entry, index) => ({
        ...entry,
        requiredPrestige: requiredPrestige[index],
        status: "pending",
        appliedYear: null,
        appliedSec: null,
      })),
      debugInjected: true,
    },
  };
}

export function replaceDetailedVassalSelectionCandidate(
  state,
  selectionPool,
  candidateIndex,
  rawSpec = {}
) {
  const safeIndex = Number.isFinite(candidateIndex) ? Math.floor(candidateIndex) : -1;
  if (!Array.isArray(selectionPool?.candidates) || safeIndex < 0
      || safeIndex >= selectionPool.candidates.length) {
    return { ok: false, reason: "invalidCandidate" };
  }
  const debugCandidate = buildDetailedDebugVassalCandidate(state, rawSpec, safeIndex);
  if (!debugCandidate.ok) return debugCandidate;
  const candidates = selectionPool.candidates.map((candidate, index) =>
    index === safeIndex
      ? { ...debugCandidate.candidate, candidateIndex: safeIndex }
      : { ...candidate, candidateIndex: index }
  );
  return {
    ok: true,
    pool: {
      ...selectionPool,
      candidates,
      expectedPoolHash: candidatePoolHash(candidates.map(({ candidateIndex: _candidateIndex, ...candidate }) => candidate)),
    },
  };
}

export function selectDetailedVassalCandidate(
  state,
  candidateIndex,
  expectedPoolHash = null,
  rerollIndex = 0,
  candidateOverride = null
) {
  const lineage = state?.civilization?.vassalLineage;
  if (lineage?.currentVassal) return { ok: false, reason: "currentVassalAlive" };
  const safeRerollIndex = Number.isFinite(rerollIndex)
    ? Math.max(0, Math.min(999, Math.floor(rerollIndex)))
    : 0;
  let candidates = Array.isArray(lineage?.pendingCandidates)
    ? lineage.pendingCandidates
    : [];
  if (!Array.isArray(lineage?.pendingCandidates) || lineage.pendingCandidates.length === 0) {
    candidates = generateDetailedVassalCandidatesFromRngSnapshot(state, safeRerollIndex);
    if (candidateOverride != null) {
      const overrideResult = buildDetailedDebugVassalCandidate(state, candidateOverride, candidateIndex);
      if (!overrideResult.ok) return overrideResult;
      if (candidateIndex < 0 || candidateIndex >= candidates.length) {
        return { ok: false, reason: "invalidCandidate" };
      }
      candidates = candidates.map((candidate, index) =>
        index === candidateIndex ? overrideResult.candidate : candidate
      );
    }
    const actualHash = candidatePoolHash(candidates);
    if (expectedPoolHash && expectedPoolHash !== actualHash) {
      lineage.pendingCandidates = [];
      return { ok: false, reason: "selectionPoolMismatch", actualPoolHash: actualHash };
    }
  }
  const candidate = candidates[candidateIndex];
  if (!candidate) return { ok: false, reason: "invalidCandidate" };
  const schedule = getDetailedVassalCandidateSchedule(state, candidate);
  if (!schedule) return { ok: false, reason: "invalidCandidateSchedule" };
  const selected = {
    ...clone(candidate),
    vassalId: `vassal-${lineage.nextVassalId++}`,
    selectedYear: schedule.selectedYear,
    selectedSec: schedule.selectedSec,
    deathYear: schedule.deathYear,
    deathSec: schedule.deathSec,
    lastFaithYear: schedule.selectedYear,
    isDead: false,
  };
  lineage.currentVassal = selected;
  lineage.selectedVassals.push(clone(selected));
  lineage.pendingCandidates = [];
  return { ok: true, vassal: selected };
}

export function getDetailedVassalCandidateSchedule(state, candidate) {
  if (!state || !candidate || !Number.isFinite(candidate.initialAge)
      || !Number.isFinite(candidate.deathAge)) return null;
  const selectedYear = Math.max(1, Math.floor(state.year ?? 1));
  const selectedSec = Math.max(0, Math.floor(state.tSec ?? 0));
  const yearsUntilDeath = Math.max(
    1,
    Math.floor(candidate.deathAge) - Math.floor(candidate.initialAge)
  );
  const deathYear = selectedYear + yearsUntilDeath;
  const deathSec = getNextMoonPhaseBoundarySec(
    state,
    getDetailedYearStartSec(state, deathYear),
    MOON_PHASE_INDEX_BY_ID.faith
  );
  const scheduledVassal = {
    ...candidate,
    selectedYear,
    selectedSec,
    deathYear,
    deathSec,
  };
  const interventionEffectSecs = (candidate.interventions ?? []).map(
    (intervention) => getDetailedVassalInterventionEffectSec(
      state,
      scheduledVassal,
      intervention
    )
  );
  const finiteEffectSecs = interventionEffectSecs.filter(Number.isFinite);
  return {
    selectedYear,
    selectedSec,
    deathYear,
    deathSec,
    interventionEffectSecs,
    firstInterventionSec: finiteEffectSecs.length
      ? Math.min(...finiteEffectSecs)
      : null,
  };
}

export function getDetailedVassalPrestige(state, vassal = null) {
  const current = vassal ?? state?.civilization?.vassalLineage?.currentVassal;
  if (!current) return 0;
  const age = current.initialAge + Math.max(0, state.year - current.selectedYear);
  return age + current.traitPrestigeModifier;
}

function createExpansionDetailedState(structureCapacity) {
  const state = createInitialDetailedSettlementData();
  state.populationByClass.villager = {
    children: 0,
    adults: 10,
    eldersByAge: [],
    faith: { tier: "gold", trend: null, streak: 0 },
    happiness: {
      status: "neutral",
      fullFeedStreak: 0,
      missedFeedStreak: 0,
      partialFeedRatios: [],
    },
  };
  state.populationByClass.stranger = {
    children: 0,
    adults: 0,
    eldersByAge: [],
    faith: { tier: "gold", trend: null, streak: 0 },
    happiness: {
      status: "neutral",
      fullFeedStreak: 0,
      missedFeedStreak: 0,
      partialFeedRatios: [],
    },
  };
  state.storedFood = 0;
  state.looseFood = 20;
  state.currency = 0;
  state.practiceSlots = [
    { practiceId: "forage", charge: 0, work: 0 },
    null,
    null,
    null,
    null,
  ];
  state.structureSlots = Array.from(
    { length: Math.max(0, Math.floor(structureCapacity ?? 0)) },
    (_, index) => index === 0 ? { structureId: "mudHouses" } : null
  );
  state.lastMeal = null;
  state.lastMoonResult = null;
  return state;
}

function applyExpansionIntervention(state, vassal, intervention) {
  const regionId = intervention.regionId;
  const sourceRegionId = intervention.sourceRegionId ?? vassal.targetRegionId;
  if (!getConnectedRegionIds(state, sourceRegionId).includes(regionId)) {
    return { ok: false, reason: "frontierNotConnected" };
  }
  const region = getRegionState(state, regionId);
  if (region?.controller !== "frontier" || region.detailedSettlementEnabled === true) {
    return { ok: false, reason: "frontierUnavailable" };
  }
  return establishDetailedSettlement(
    state,
    regionId,
    createExpansionDetailedState(region.structureCapacity)
  );
}

function applyGlobalStructureIntervention(state, intervention) {
  if (!settlementStructureDefs[intervention.structureId]) {
    return { ok: false, reason: "invalidStructure" };
  }
  const appliedRegionIds = [];
  const skippedRegionIds = [];
  for (const site of getDetailedSettlementSites(state, { playerOnly: true })) {
    const slotIndex = site.detailedState.structureSlots.findIndex((slot) => slot == null);
    if (slotIndex < 0) {
      skippedRegionIds.push(site.regionId);
      continue;
    }
    site.detailedState.structureSlots[slotIndex] = {
      structureId: intervention.structureId,
    };
    appliedRegionIds.push(site.regionId);
  }
  intervention.appliedRegionIds = appliedRegionIds;
  intervention.skippedRegionIds = skippedRegionIds;
  return appliedRegionIds.length > 0
    ? { ok: true }
    : { ok: false, reason: "structureSlotsUnavailable" };
}

// This is deliberately a selector, rather than a forecast mutation. The
// timeline can therefore describe a pending intervention at the exact Faith
// boundary where the annual Vassal stage will evaluate it.
export function getDetailedVassalInterventionEffectSec(state, vassal, intervention) {
  if (!state || !vassal || !intervention) return null;
  if (Number.isFinite(intervention.appliedSec)) {
    return Math.max(0, Math.floor(intervention.appliedSec));
  }
  if (intervention.status !== "pending" || !Number.isFinite(intervention.requiredPrestige)) {
    return null;
  }
  const selectedYear = Math.max(1, Math.floor(vassal.selectedYear ?? state.year ?? 1));
  const initialAge = Math.max(0, Math.floor(vassal.initialAge ?? 0));
  const traitModifier = Math.floor(vassal.traitPrestigeModifier ?? 0);
  const yearsUntilGate = Math.max(
    1,
    Math.ceil(Math.floor(intervention.requiredPrestige) - initialAge - traitModifier)
  );
  const effectYear = selectedYear + yearsUntilGate;
  const effectSec = getNextMoonPhaseBoundarySec(
    state,
    getDetailedYearStartSec(state, effectYear),
    MOON_PHASE_INDEX_BY_ID.faith
  );
  const deathSec = Number.isFinite(vassal.deathSec)
    ? Math.max(0, Math.floor(vassal.deathSec))
    : null;
  return deathSec != null && effectSec > deathSec ? null : effectSec;
}

function applyIntervention(state, vassal, intervention) {
  const localTargetRegionId = intervention?.targetRegionId ?? vassal.targetRegionId;
  const settlement = getDetailedSettlement(state, localTargetRegionId);
  let result = { ok: false, reason: "missingSettlement" };
  if (settlement && intervention?.kind === "practice") {
    const slotIndex = Math.floor(intervention.slotIndex);
    result = getDetailedPracticeDef(state, intervention.practiceId)
      && slotIndex >= 0 && slotIndex < DETAILED_PRACTICE_SLOT_COUNT
      ? { ok: true }
      : { ok: false, reason: "invalidPractice" };
    if (result.ok) {
      settlement.practiceSlots[slotIndex] = {
        practiceId: intervention.practiceId,
        charge: 0,
        work: 0,
      };
    }
  } else if (settlement && intervention?.kind === "structure") {
    const slotIndex = Math.floor(intervention.slotIndex);
    result = settlementStructureDefs[intervention.structureId]
      && slotIndex >= 0 && slotIndex < settlement.structureSlots.length
      && settlement.structureSlots[slotIndex] == null
      ? { ok: true }
      : { ok: false, reason: "structureSlotUnavailable" };
    if (result.ok) settlement.structureSlots[slotIndex] = { structureId: intervention.structureId };
  } else if (intervention?.kind === "expandSettlement") {
    result = applyExpansionIntervention(state, vassal, intervention);
  } else if (intervention?.kind === "globalStructure") {
    result = applyGlobalStructureIntervention(state, intervention);
  } else if (intervention?.kind === "connection") {
    result = intervention.mode === "add"
      ? isPlayerDetailedRegion(state, intervention.regionAId)
          && isPlayerDetailedRegion(state, intervention.regionBId)
        ? addWorldConnection(state, intervention.regionAId, intervention.regionBId)
        : { ok: false, reason: "playerSettlementUnavailable" }
      : intervention.mode === "remove"
        ? removeWorldConnection(state, intervention.regionAId, intervention.regionBId)
        : { ok: false, reason: "invalidConnectionMode" };
  }
  intervention.appliedYear = state.year;
  intervention.appliedSec = state.tSec;
  if (result.ok) {
    intervention.status = "applied";
    return true;
  }
  intervention.status = "failed";
  intervention.failureReason = result.reason ?? "applyFailed";
  return false;
}

export function describeDetailedVassalIntervention(state, targetRegionId, intervention) {
  if (!intervention || typeof intervention !== "object") return "Unknown intervention";
  const targetRef = getRegionReference(state, targetRegionId) ?? targetRegionId;
  const localTargetRef = getRegionReference(state, intervention.targetRegionId) ?? targetRef;
  if (intervention.kind === "practice") {
    const label = getDetailedPracticeDef(state, intervention.practiceId)?.label
      ?? intervention.practiceId;
    const replaced = getDetailedPracticeDef(state, intervention.replacedPracticeId)?.label
      ?? intervention.replacedPracticeId;
    return intervention.mode === "replace" && replaced
      ? `Replace ${replaced} with ${label} — ${localTargetRef} slot ${Number(intervention.slotIndex) + 1}`
      : `Add ${label} — ${localTargetRef} slot ${Number(intervention.slotIndex) + 1}`;
  }
  if (intervention.kind === "structure") {
    const label = settlementStructureDefs[intervention.structureId]?.label
      ?? intervention.structureId;
    return `Add ${label} — ${localTargetRef}`;
  }
  if (intervention.kind === "expandSettlement") {
    const regionRef = getRegionReference(state, intervention.regionId) ?? intervention.regionId;
    const sourceRef = getRegionReference(state, intervention.sourceRegionId) ?? targetRef;
    return `Establish settlement ${regionRef} from ${sourceRef}`;
  }
  if (intervention.kind === "globalStructure") {
    const label = settlementStructureDefs[intervention.structureId]?.label
      ?? intervention.structureId;
    return `Add ${label} to all settlements with space`;
  }
  if (intervention.kind === "connection") {
    const left = getRegionReference(state, intervention.regionAId) ?? intervention.regionAId;
    const right = getRegionReference(state, intervention.regionBId) ?? intervention.regionBId;
    return `${intervention.mode === "remove" ? "Remove" : "Connect"} ${left} ↔ ${right}`;
  }
  return "Unknown intervention";
}

function runVassalAnnualBoundary(state) {
  const lineage = state.civilization.vassalLineage;
  const vassal = lineage.currentVassal;
  if (!vassal || vassal.isDead) return;
  const processedYear = Math.max(
    vassal.selectedYear,
    Math.floor(vassal.lastFaithYear ?? vassal.selectedYear)
  );
  if (state.year <= processedYear) return;
  const prestige = getDetailedVassalPrestige(state, vassal);
  for (const intervention of vassal.interventions) {
    if (intervention.status === "pending" && prestige >= intervention.requiredPrestige) {
      applyIntervention(state, vassal, intervention);
    }
  }
  const age = vassal.initialAge + Math.max(0, state.year - vassal.selectedYear);
  if (age >= vassal.deathAge) {
    vassal.isDead = true;
    vassal.deathYear = state.year;
    vassal.deathSec = state.tSec;
    for (const intervention of vassal.interventions) {
      if (intervention.status === "pending") intervention.status = "expired";
    }
    lineage.selectedVassals[lineage.selectedVassals.length - 1] = clone(vassal);
    lineage.currentVassal = null;
  } else {
    vassal.lastFaithYear = state.year;
    lineage.selectedVassals[lineage.selectedVassals.length - 1] = clone(vassal);
  }
}

export function initializeDetailedSettlementCivilization(state) {
  state.gameStateSchemaVersion = 13;
  for (const legacyCounter of [
    "nextHubStructureInstanceId",
    "nextEnvStructureInstanceId",
    "nextEnvInstanceId",
    "nextItemId",
    "nextSettlementCardInstanceId",
    "nextPopulationCommitmentId",
    "nextPawnId",
    "nextFollowerCreationOrderIndex",
  ]) {
    delete state[legacyCounter];
  }
  state.civilization.chaos = {
    chaosPower: 0,
    monsterCount: 0,
    monsterLossThreshold: getGameSetting(state, "monsterLossThreshold"),
    lastMoonIncome: null,
    pendingLosses: {
      prematureDeaths: 0,
      oldAgeDeaths: 0,
      externalEmigrants: 0,
      internalMigrants: 0,
    },
  };
  refreshGreenAscendancy(state);
  state.civilization.vassalLineage = {
    nextVassalId: 1,
    currentVassal: null,
    pendingCandidates: [],
    selectedVassals: [],
  };
  state.civilization.currentMoonTurn = null;
  state.civilization.lastMoonTurn = null;
  state.civilization.lastPopulationAgingYear = 1;
}

export function stepDetailedSettlementsSecond(state, tSec) {
  if (state?.runStatus?.complete === true) return;
  refreshGreenAscendancy(state);
  for (const site of getDetailedSettlementSites(state)) {
    resetEmptyStrangerCohort(site.detailedState);
  }
  if (state._seasonChanged === true) runPracticeActivation(state, "season");
  const phase = getMoonPhaseAtSecond(state, tSec);
  if (!phase.boundary) return;
  if (phase.id === "birth") runBirthPhase(state, phase);
  else if (phase.id === "food") runFoodPhase(state, phase);
  else if (phase.id === "housing") runHousingPhase(state, phase);
  else if (phase.id === "faith") runFaithPhase(state, phase);
  else if (phase.id === "migration") runMigrationPhase(state, phase);
  else if (phase.id === "death") runDeathPhase(state, phase);
}

export function getDetailedSettlementViewModel(state, regionId) {
  const site = getDetailedSettlementSite(state, regionId);
  if (!site) return null;
  const region = getRegionState(state, regionId);
  const settlement = site.detailedState;
  const population = getPopulationSummary(state, regionId);
  const workers = assignDetailedSettlementWorkers(state, regionId);
  const availableWorkerCount = POPULATION_CLASS_ORDER.reduce(
    (total, classId) => {
      const cohort = population.byClass[classId] ?? {};
      return total + Math.floor(
        (Math.max(0, cohort.adults ?? 0) + Math.max(0, cohort.elders ?? 0)) /
          Math.max(1, getGameSetting(state, "populationPerToken"))
      );
    },
    0
  );
  const activeWorkerCount = workers.reduce(
    (total, assignment) => total + (assignment.tokens?.length ?? 0),
    0
  );
  return {
    regionId,
    siteId: site.id,
    name: site.name,
    storedFood: settlement.storedFood,
    looseFood: settlement.looseFood,
    currency: roundFood(Math.max(0, settlement.currency ?? 0)),
    storedFoodCapacity: getStoredFoodCapacity(state, regionId),
    population,
    pressure: getSettlementPressureSummary(state, regionId),
    workerPool: {
      availableWorkerCount,
      activeWorkerCount,
      unusedWorkerCount: Math.max(
        0,
        availableWorkerCount - activeWorkerCount
      ),
    },
    practices: settlement.practiceSlots.map((slot, index) => ({
      ...slot,
      label: slot ? getDetailedPracticeDef(state, slot.practiceId)?.label ?? slot.practiceId : null,
      workers: workers[index],
      evaluation: slot ? buildDetailedPracticeEvaluation(state, site, workers[index]) : null,
    })),
    structures: settlement.structureSlots,
    structureCapacity: region?.structureCapacity ?? 0,
    usedStructureCapacity: settlement.structureSlots.filter(Boolean).length,
    elderOrder: getElderOrderSummary(state, regionId),
    lastMeal: settlement.lastMeal,
    currentMoonResult: state.civilization.currentMoonTurn?.regions?.[regionId] ?? null,
    lastMoonResult: settlement.lastMoonResult,
  };
}

export { DETAILED_REGION_IDS };
