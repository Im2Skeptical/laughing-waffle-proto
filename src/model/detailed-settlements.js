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
import { getConnectedRegionIds, getRegionState } from "./world-state.js";
import { deserializeGameState, serializeGameState } from "./state.js";
import {
  getDetailedPracticeDef,
  getDetailedStructureDef,
  getGameSetting,
} from "./game-config.js";

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

export function validateDetailedPracticeDefinitions() {
  const errors = [];
  const validOps = new Set(detailedSettlementEffectOps);
  for (const [id, def] of Object.entries(detailedSettlementPracticeDefs)) {
    if (def.id !== id) errors.push(`${id}: id mismatch`);
    if (!Number.isInteger(def.workerCapacity) || def.workerCapacity < 0) {
      errors.push(`${id}: invalid workerCapacity`);
    }
    if (!["season", "newMoon", "passive"].includes(def.activation?.type)) {
      errors.push(`${id}: invalid activation`);
    }
    for (const effect of def.effects ?? []) {
      if (!validOps.has(effect?.op)) errors.push(`${id}: invalid effect op ${effect?.op}`);
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
  for (const classId of POPULATION_CLASS_ORDER) {
    const cohort = settlement?.populationByClass?.[classId] ?? {};
    const entry = {
      children: Math.max(0, Math.floor(cohort.children ?? 0)),
      adults: Math.max(0, Math.floor(cohort.adults ?? 0)),
      elders: eldersCount(cohort),
    };
    entry.total = entry.children + entry.adults + entry.elders;
    byClass[classId] = entry;
    children += entry.children;
    adults += entry.adults;
    elders += entry.elders;
  }
  return {
    children,
    adults,
    elders,
    total: children + adults + elders,
    mealDemand:
      Math.ceil(children * getGameSetting(state, "childMealConsumption"))
      + Math.ceil(adults * getGameSetting(state, "adultMealConsumption"))
      + Math.ceil(elders * getGameSetting(state, "elderMealConsumption")),
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
    },
  };
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

export function evaluateDetailedMapScore(state, regionId, evaluatorId) {
  if (evaluatorId !== "adjacentPlayerSameColour") {
    return { ok: false, reason: "unknownEvaluator", score: 0 };
  }
  const host = getRegionState(state, regionId);
  if (!host) return { ok: false, reason: "unknownRegion", score: 0 };
  let bonus = 0;
  for (const neighbourId of getConnectedRegionIds(state, regionId)) {
    const neighbour = getRegionState(state, neighbourId);
    if (neighbour?.controller === "player" && neighbour.colour === host.colour) bonus += 1;
  }
  return { ok: true, score: 1 + bonus };
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

function consumeFood(settlement, amount) {
  const demand = roundFood(amount);
  const fromLoose = Math.min(settlement.looseFood, demand);
  settlement.looseFood = roundFood(settlement.looseFood - fromLoose);
  const remainder = roundFood(demand - fromLoose);
  const fromStored = Math.min(settlement.storedFood, remainder);
  settlement.storedFood = roundFood(settlement.storedFood - fromStored);
  return roundFood(fromLoose + fromStored);
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

function executePracticeEffects(state, site, assignment, activationType) {
  const settlement = site.detailedState;
  const slot = settlement.practiceSlots[assignment.slotIndex];
  const def = getDetailedPracticeDef(state, slot?.practiceId);
  if (!def || def.activation.type !== activationType) return;
  if ((def.workerCapacity ?? 0) > 0 && assignment.tokens.length === 0) return;
  if ((def.activation.type === "season" || def.activation.type === "newMoon")
      && getRegionState(state, site.regionId)?.controller !== "player"
      && (def.effects ?? []).some((effect) =>
        effect.op === "addLocalFood" || effect.op === "routeLocalFood")) return;

  for (const effect of def.effects ?? []) {
    if (effect.op === "addLocalFood") {
      const multiplier = evaluateDetailedMapScore(
        state,
        site.regionId,
        effect.multiplier?.evaluator
      ).score;
      addFoodToSettlement(
        state,
        site.regionId,
        effect.amountPerEffectiveWorker * assignment.effectiveWorkers * multiplier
      );
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

function runPracticeActivation(state, activationType) {
  for (const site of getDetailedSettlementSites(state)) {
    const assignments = assignDetailedSettlementWorkers(state, site.regionId);
    for (const assignment of assignments) {
      executePracticeEffects(state, site, assignment, activationType);
    }
  }
}

function getPreserveReduction(state, site) {
  return assignDetailedSettlementWorkers(state, site.regionId).reduce((sum, assignment) => {
    const def = getDetailedPracticeDef(state, assignment.practiceId);
    return sum + (def?.effects ?? []).reduce((effectSum, effect) =>
      effect.op === "modifyStoredFoodDecay"
        ? effectSum - effect.additivePercentPerEffectiveWorker * assignment.effectiveWorkers
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
  for (const site of getDetailedSettlementSites(state)) {
    if (getRegionState(state, site.regionId)?.controller !== "player") continue;
    const assignments = assignDetailedSettlementWorkers(state, site.regionId);
    const adminTokens = assignments
      .filter((assignment) => assignment.practiceId === "administrate")
      .flatMap((assignment) => assignment.tokens);
    const neighbours = getConnectedRegionIds(state, site.regionId)
      .filter((id) => snapshot[id]);
    const packetPerEffectiveWorker = (
      getDetailedPracticeDef(state, "administrate")?.effects ?? []
    ).find((effect) => effect?.op === "routeLocalFood")?.packetPerEffectiveWorker ?? 0;
    for (const token of adminTokens) {
      const packet = roundFood(packetPerEffectiveWorker * token.effectiveness);
      const host = snapshot[site.regionId];
      const shortage = Math.max(0, host.demand - host.loose - host.stored);
      let sourceId = null;
      let destinationId = null;
      if (shortage > 0) {
        sourceId = neighbours.find((id) =>
          sourceAvailable[id].loose
            + Math.max(0, sourceAvailable[id].stored - sourceAvailable[id].demand) > 0
        ) ?? null;
        destinationId = sourceId ? site.regionId : null;
      } else if (sourceAvailable[site.regionId].loose > 0
          || sourceAvailable[site.regionId].stored > host.demand) {
        destinationId = neighbours.find((id) =>
          destinationProjected[id].loose + destinationProjected[id].stored
            < destinationProjected[id].demand
        ) ?? neighbours.find((id) =>
          destinationProjected[id].stored < destinationProjected[id].capacity) ?? null;
        sourceId = destinationId ? site.regionId : null;
      }
      if (!sourceId || !destinationId) continue;
      const source = sourceAvailable[sourceId];
      const destination = destinationProjected[destinationId];
      const movable = source.loose + Math.max(0, source.stored - source.demand);
      const amount = roundFood(Math.min(packet, movable));
      if (amount <= 0) continue;
      const looseAmount = Math.min(source.loose, amount);
      source.loose = roundFood(source.loose - looseAmount);
      source.stored = roundFood(source.stored - (amount - looseAmount));
      const room = Math.max(0, destination.capacity - destination.stored);
      const storedAmount = Math.min(room, amount);
      destination.stored = roundFood(destination.stored + storedAmount);
      destination.loose = roundFood(destination.loose + amount - storedAmount);
      moves.push({ sourceId, destinationId, amount, looseAmount });
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
    runPracticeActivation(planningState, "season");
  }
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

function runNewMoon(state) {
  applyAdministrationMoves(state, planDetailedAdministrationMoves(state));
  runPracticeActivation(state, "newMoon");
  for (const site of getDetailedSettlementSites(state)) {
    const settlement = site.detailedState;
    const decayRate = Math.max(
      0,
      getGameSetting(state, "storedFoodDecayRate") - getPreserveReduction(state, site) / 100
    );
    settlement.storedFood = roundFood(settlement.storedFood * (1 - decayRate));
    settlement.looseFood = roundFood(
      settlement.looseFood * (1 - getGameSetting(state, "looseFoodDecayRate"))
    );
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

function removePopulationProportionally(classState, count) {
  let remaining = Math.max(0, Math.floor(count));
  const total = Math.max(1,
    Math.floor(classState.children ?? 0) + Math.floor(classState.adults ?? 0) + eldersCount(classState));
  const childLoss = Math.min(classState.children, Math.floor(remaining * classState.children / total));
  classState.children -= childLoss;
  remaining -= childLoss;
  const adultLoss = Math.min(classState.adults, Math.floor(remaining * classState.adults / total));
  classState.adults -= adultLoss;
  remaining -= adultLoss;
  for (let index = classState.eldersByAge.length - 1; index >= 0 && remaining > 0; index -= 1) {
    const cohort = classState.eldersByAge[index];
    const loss = Math.min(cohort.count, remaining);
    cohort.count -= loss;
    remaining -= loss;
  }
  classState.eldersByAge = classState.eldersByAge.filter((cohort) => cohort.count > 0);
  while (remaining > 0 && classState.adults > 0) {
    classState.adults -= 1;
    remaining -= 1;
  }
  while (remaining > 0 && classState.children > 0) {
    classState.children -= 1;
    remaining -= 1;
  }
}

function runFullMoon(state) {
  for (const site of getDetailedSettlementSites(state)) {
    const settlement = site.detailedState;
    const demand = getPopulationSummary(state, site.regionId).mealDemand;
    const consumed = consumeFood(settlement, demand);
    const ratio = demand > 0 ? consumed / demand : 1;
    for (const classId of POPULATION_CLASS_ORDER) {
      const classState = settlement.populationByClass[classId];
      const happiness = updateHappiness(state, classState, ratio);
      if (happiness.starvationTriggered) {
        const classTotal = classState.children + classState.adults + eldersCount(classState);
        removePopulationProportionally(
          classState,
          Math.ceil(classTotal * getGameSetting(state, "starvationPopulationLossRate"))
        );
      }
    }
    settlement.lastMeal = {
      tSec: state.tSec,
      demand,
      consumed,
      ratio: roundFood(ratio),
    };
    settlement.looseFood = roundFood(
      settlement.looseFood * (1 - getGameSetting(state, "looseFoodDecayRate"))
    );
  }
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

function runDemographics(state) {
  for (const site of getDetailedSettlementSites(state)) {
    const settlement = site.detailedState;
    const result = { year: state.year, byClass: {} };
    for (const classId of POPULATION_CLASS_ORDER) {
      const classState = settlement.populationByClass[classId];
      const snapshot = clone(classState);
      const faithLabel = String(snapshot.faith.tier ?? "gold")
        .replace(/^./, (letter) => letter.toUpperCase());
      const birthRate = resolveProbability(getGameSetting(state, `birthRate${faithLabel}`));
      const births = rollCount(state, snapshot.adults, birthRate);
      const childToAdultRate = getGameSetting(state, "childToAdultRate");
      const adultToElderRate = getGameSetting(state, "adultToElderRate");
      const matured = rollCount(state, snapshot.children, childToAdultRate);
      const newElders = rollCount(state, snapshot.adults, adultToElderRate);
      const nextElders = [];
      let elderDeaths = 0;
      for (const cohort of [...snapshot.eldersByAge].sort((a, b) => a.age - b.age)) {
        const nextAge = cohort.age + 1;
        const deaths = rollCount(state, cohort.count, getElderMortalityRate(nextAge, state));
        elderDeaths += deaths;
        if (cohort.count - deaths > 0) {
          nextElders.push({ age: nextAge, count: cohort.count - deaths });
        }
      }
      if (newElders > 0) {
        nextElders.push({
          age: getGameSetting(state, "newElderAge"),
          count: newElders,
        });
      }
      classState.children = snapshot.children - matured + births;
      classState.adults = snapshot.adults + matured - newElders;
      classState.eldersByAge = nextElders;
      result.byClass[classId] = {
        ...(result.byClass[classId] ?? {}),
        births,
        matured,
        newElders,
        elderDeaths,
        birthRate,
        childToAdultRate,
        adultToElderRate,
      };
    }
    const population = getPopulationSummary(state, site.regionId);
    const overflow = Math.max(0, population.total - population.housingCapacity);
    const housingCapStatus = population.total <= population.housingCapacity
      ? "positive"
      : population.total
          > population.housingCapacity * getGameSetting(state, "overHousingNegativeRatio")
        ? "negative"
        : "neutral";
    for (const classId of POPULATION_CLASS_ORDER) {
      const happiness = settlement.populationByClass[classId].happiness;
      const currentIndex = HAPPINESS_ORDER.indexOf(happiness.status);
      const capIndex = HAPPINESS_ORDER.indexOf(housingCapStatus);
      happiness.status = HAPPINESS_ORDER[Math.min(
        currentIndex < 0 ? 1 : currentIndex,
        capIndex < 0 ? 1 : capIndex
      )];
    }
    for (const classId of POPULATION_CLASS_ORDER) {
      const classState = settlement.populationByClass[classId];
      if (classState.happiness.status === "positive") {
        classState.faith.tier = shiftStatus(classState.faith.tier, FAITH_ORDER, 1);
      } else if (classState.happiness.status === "negative") {
        if (classState.faith.tier === "bronze") {
          const classTotal = classState.children + classState.adults + eldersCount(classState);
          const collapseLoss = Math.min(
            classTotal,
            Math.max(
              1,
              Math.floor(classTotal * getGameSetting(state, "bronzeCollapseLossRate"))
            )
          );
          removePopulationProportionally(classState, collapseLoss);
          result.byClass[classId].bronzeCollapseLoss = collapseLoss;
        } else {
          classState.faith.tier = shiftStatus(classState.faith.tier, FAITH_ORDER, -1);
        }
      }
    }
    if (overflow > 0) {
      for (const classId of POPULATION_CLASS_ORDER) {
        const classTotal = population.byClass[classId].total;
        removePopulationProportionally(
          settlement.populationByClass[classId],
          Math.floor(overflow * classTotal / Math.max(1, population.total))
        );
      }
    }
    result.housingOverflow = overflow;
    settlement.lastAnnualResult = result;
  }
}

function runGlobalChaos(state) {
  const civilization = state.civilization;
  let totalIncome = 0;
  const byRegion = [];
  for (const site of getDetailedSettlementSites(state)) {
    const population = getPopulationSummary(state, site.regionId);
    let mitigation = 0;
    for (const classId of POPULATION_CLASS_ORDER) {
      const classState = site.detailedState.populationByClass[classId];
      const classPop = population.byClass[classId].total;
      if (classState.faith.tier === "gold") {
        mitigation += Math.floor(
          classPop / getGameSetting(state, "goldMitigationPerPopulation")
        ) * getGameSetting(state, "goldMitigationAmount");
      } else if (classState.faith.tier === "diamond") {
        mitigation += Math.floor(
          classPop / getGameSetting(state, "diamondMitigationPerPopulation")
        ) * getGameSetting(state, "diamondMitigationAmount");
      }
    }
    const growthSteps = Math.floor(
      Math.max(0, state.year - 1) / getGameSetting(state, "chaosGrowthYears")
    );
    let baseIncome = getGameSetting(state, "baseChaosIncomePerSite");
    for (let step = 0; step < growthSteps; step += 1) {
      baseIncome = Math.ceil(
        baseIncome * (1 + getGameSetting(state, "chaosGrowthRate"))
      );
    }
    const income = Math.max(0, baseIncome - mitigation);
    totalIncome += income;
    byRegion.push({ regionId: site.regionId, baseIncome, mitigation, income });
  }
  civilization.chaos.chaosPower += totalIncome;
  const spawned = Math.floor(
    civilization.chaos.chaosPower / getGameSetting(state, "chaosPerMonster")
  );
  civilization.chaos.monsterCount += spawned;
  civilization.chaos.lastAnnualIncome = { totalIncome, byRegion, spawned };
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

export function generateDetailedVassalCandidates(state) {
  const targetIds = getDetailedSettlementSites(state, { playerOnly: true })
    .map((site) => site.regionId);
  if (targetIds.length === 0) {
    state.civilization.vassalLineage.pendingCandidates = [];
    return [];
  }
  const shuffledTargets = shuffleWithStateRng(state, targetIds);
  const candidates = [];
  for (let candidateIndex = 0; candidateIndex < 3; candidateIndex += 1) {
    const targetRegionId = shuffledTargets[candidateIndex % shuffledTargets.length];
    const interventions = shuffleWithStateRng(state, VASSAL_INTERVENTION_PRACTICE_IDS).slice(0, 3);
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
      interventions: interventions.map((practiceId, index) => ({
        practiceId,
        requiredPrestige: resistance + requirementOffsets[index],
        status: "pending",
        appliedYear: null,
      })),
    });
  }
  state.civilization.vassalLineage.pendingCandidates = candidates;
  return candidates;
}

function candidatePoolHash(candidates) {
  return JSON.stringify(candidates);
}

export function buildDetailedVassalSelectionPool(state) {
  if (!state || state.civilization?.vassalLineage?.currentVassal) return null;
  const cloneState = deserializeGameState(serializeGameState(state));
  const candidates = generateDetailedVassalCandidates(cloneState).map((candidate, index) => ({
    ...candidate,
    candidateIndex: index,
  }));
  return {
    poolId: `detailed-vassal-${state.civilization.vassalLineage.nextVassalId}`,
    createdSec: state.tSec,
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
  };
}

export function selectDetailedCheatVassal(state, rawSpec = {}) {
  const lineage = state?.civilization?.vassalLineage;
  if (!lineage) return { ok: false, reason: "noLineage" };
  const targetRegionId =
    typeof rawSpec.targetRegionId === "string" ? rawSpec.targetRegionId : null;
  if (!getDetailedVassalDebugOptions(state).targetRegions.some(
    (entry) => entry.id === targetRegionId
  )) {
    return { ok: false, reason: "invalidTargetRegion" };
  }
  if (lineage.currentVassal && rawSpec.replaceCurrent !== true) {
    return { ok: false, reason: "currentVassalAlive" };
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
  const interventionPracticeIds = Array.isArray(rawSpec.interventionPracticeIds)
    ? rawSpec.interventionPracticeIds
    : options.interventionPracticeIds.slice(0, 3);
  if (
    interventionPracticeIds.length !== 3
    || new Set(interventionPracticeIds).size !== 3
    || interventionPracticeIds.some((id) => !options.interventionPracticeIds.includes(id))
  ) {
    return { ok: false, reason: "invalidInterventions" };
  }
  const resistanceSnapshot = Number.isFinite(rawSpec.resistanceSnapshot)
    ? Math.max(0, Math.floor(rawSpec.resistanceSnapshot))
    : getElderOrderSummary(state, targetRegionId).resistance;
  const defaultOffsets = [
    getGameSetting(state, "interventionRequirement01"),
    getGameSetting(state, "interventionRequirement02"),
    getGameSetting(state, "interventionRequirement03"),
  ];
  const requiredPrestige = interventionPracticeIds.map((_, index) =>
    Number.isFinite(rawSpec.requiredPrestige?.[index])
      ? Math.max(0, Math.floor(rawSpec.requiredPrestige[index]))
      : resistanceSnapshot + defaultOffsets[index]
  );

  if (lineage.currentVassal) {
    const replaced = lineage.currentVassal;
    replaced.isDead = true;
    replaced.deathYear = state.year;
    replaced.deathSec = state.tSec;
    for (const intervention of replaced.interventions ?? []) {
      if (intervention.status === "pending") intervention.status = "expired";
    }
    if (lineage.selectedVassals.length > 0) {
      lineage.selectedVassals[lineage.selectedVassals.length - 1] = clone(replaced);
    }
    lineage.currentVassal = null;
  }

  lineage.pendingCandidates = [{
    candidateId: `debug-candidate-${lineage.nextVassalId}`,
    targetRegionId,
    resistanceSnapshot,
    initialAge,
    deathAge,
    traitId: trait?.id ?? "debug",
    traitPrestigeModifier,
    professionId,
    interventions: interventionPracticeIds.map((practiceId, index) => ({
      practiceId,
      requiredPrestige: requiredPrestige[index],
      status: "pending",
      appliedYear: null,
    })),
    debugInjected: true,
  }];
  return selectDetailedVassalCandidate(state, 0);
}

export function selectDetailedVassalCandidate(state, candidateIndex, expectedPoolHash = null) {
  const lineage = state?.civilization?.vassalLineage;
  if (lineage?.currentVassal) return { ok: false, reason: "currentVassalAlive" };
  if (!Array.isArray(lineage?.pendingCandidates) || lineage.pendingCandidates.length === 0) {
    const generated = generateDetailedVassalCandidates(state);
    const actualHash = candidatePoolHash(generated);
    if (expectedPoolHash && expectedPoolHash !== actualHash) {
      lineage.pendingCandidates = [];
      return { ok: false, reason: "selectionPoolMismatch", actualPoolHash: actualHash };
    }
  }
  const candidate = lineage?.pendingCandidates?.[candidateIndex];
  if (!candidate) return { ok: false, reason: "invalidCandidate" };
  const selectedYear = Math.max(1, Math.floor(state.year ?? 1));
  const selectedSec = Math.max(0, Math.floor(state.tSec ?? 0));
  const yearsUntilDeath = Math.max(
    1,
    Math.floor(candidate.deathAge) - Math.floor(candidate.initialAge)
  );
  const deathYear = selectedYear + yearsUntilDeath;
  const deathSec = getDetailedYearStartSec(state, deathYear);
  const selected = {
    ...clone(candidate),
    vassalId: `vassal-${lineage.nextVassalId++}`,
    selectedYear,
    selectedSec,
    deathYear,
    deathSec,
    isDead: false,
  };
  lineage.currentVassal = selected;
  lineage.selectedVassals.push(clone(selected));
  lineage.pendingCandidates = [];
  return { ok: true, vassal: selected };
}

export function getDetailedVassalPrestige(state, vassal = null) {
  const current = vassal ?? state?.civilization?.vassalLineage?.currentVassal;
  if (!current) return 0;
  const age = current.initialAge + Math.max(0, state.year - current.selectedYear);
  return age + current.traitPrestigeModifier;
}

function applyIntervention(state, vassal, intervention) {
  const settlement = getDetailedSettlement(state, vassal.targetRegionId);
  if (!settlement) return false;
  const existing = settlement.practiceSlots.find(
    (slot) => slot?.practiceId === intervention.practiceId
  ) ?? { practiceId: intervention.practiceId, charge: 0, work: 0 };
  const prefix = vassal.interventions
    .filter((entry) => entry.status === "applied" || entry === intervention)
    .map((entry) => entry.practiceId);
  const byId = new Map(settlement.practiceSlots.filter(Boolean)
    .map((slot) => [slot.practiceId, slot]));
  byId.set(intervention.practiceId, existing);
  const ordered = [];
  for (const practiceId of prefix) {
    const slot = byId.get(practiceId) ?? { practiceId, charge: 0, work: 0 };
    if (!ordered.some((entry) => entry.practiceId === practiceId)) ordered.push(slot);
  }
  for (const slot of settlement.practiceSlots.filter(Boolean)) {
    if (!ordered.some((entry) => entry.practiceId === slot.practiceId)) ordered.push(slot);
  }
  settlement.practiceSlots = ordered.slice(0, DETAILED_PRACTICE_SLOT_COUNT);
  while (settlement.practiceSlots.length < DETAILED_PRACTICE_SLOT_COUNT) {
    settlement.practiceSlots.push(null);
  }
  intervention.status = "applied";
  intervention.appliedYear = state.year;
  return true;
}

function runVassalAnnualBoundary(state) {
  const lineage = state.civilization.vassalLineage;
  const vassal = lineage.currentVassal;
  if (!vassal || vassal.isDead) return;
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
  }
}

export function initializeDetailedSettlementCivilization(state) {
  state.gameStateSchemaVersion = 6;
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
    lastAnnualIncome: null,
  };
  state.civilization.vassalLineage = {
    nextVassalId: 1,
    currentVassal: null,
    pendingCandidates: [],
    selectedVassals: [],
  };
}

export function stepDetailedSettlementsSecond(state, tSec) {
  if (state?.runStatus?.complete === true) return;
  if (state._seasonChanged === true) runPracticeActivation(state, "season");
  const moonCycleSec = Math.max(2, getGameSetting(state, "moonCycleSec"));
  if (tSec > 0 && tSec % moonCycleSec === 0) runNewMoon(state);
  if (tSec > 0 && tSec % moonCycleSec === Math.floor(moonCycleSec / 2)) {
    runFullMoon(state);
  }
  if (state._seasonChanged === true && state.currentSeasonIndex === 0) {
    runDemographics(state);
    runGlobalChaos(state);
    runVassalAnnualBoundary(state);
  }
}

export function getDetailedSettlementViewModel(state, regionId) {
  const site = getDetailedSettlementSite(state, regionId);
  if (!site) return null;
  const region = getRegionState(state, regionId);
  const settlement = site.detailedState;
  const population = getPopulationSummary(state, regionId);
  const workers = assignDetailedSettlementWorkers(state, regionId);
  return {
    regionId,
    siteId: site.id,
    name: site.name,
    storedFood: settlement.storedFood,
    looseFood: settlement.looseFood,
    storedFoodCapacity: getStoredFoodCapacity(state, regionId),
    population,
    practices: settlement.practiceSlots.map((slot, index) => ({
      ...slot,
      label: slot ? getDetailedPracticeDef(state, slot.practiceId)?.label ?? slot.practiceId : null,
      workers: workers[index],
    })),
    structures: settlement.structureSlots,
    structureCapacity: region?.structureCapacity ?? 0,
    usedStructureCapacity: settlement.structureSlots.filter(Boolean).length,
    elderOrder: getElderOrderSummary(state, regionId),
    lastMeal: settlement.lastMeal,
    lastAnnualResult: settlement.lastAnnualResult,
  };
}

export { DETAILED_REGION_IDS };
