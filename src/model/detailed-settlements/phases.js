// Moon-turn helpers, six-phase stepper, chaos, and civilization init.

import { POPULATION_CLASS_ORDER } from "../../defs/gamepieces/detailed-settlement-defs.js";
import { getDetailedStructureDef, getGameSetting } from "../game-config.js";
import { getMoonPhaseAtSecond } from "../moon-phases.js";
import {
  initializeVassalLifeMapCivilization,
  stepVassalLifeMapSecond,
} from "../vassal-life-map.js";
import { getConnectedRegionIds, getRegionState } from "../world-state.js";
import {
  classPopulationTotal,
  clone,
  clonePopulationComposition,
  compositionBins,
  compositionFromBins,
  compositionTotal,
  createMoonRegionResult,
  emptyPopulationComposition,
  ensureMoonRegionResult,
  roundFood,
  selectPopulationComposition,
} from "./helpers.js";
import {
  applyAdministrationMoves,
  consumeFood,
  getLocalDistinctPieceTags,
  getPhaseModifiers,
  getPreserveReduction,
  planDetailedAdministrationMoves,
  runPracticeActivation,
} from "./practices.js";
import {
  getDetailedSettlement,
  getDetailedSettlementSites,
  getGreenAscendancySummary,
  getHousingCapacity,
  getPopulationSummary,
  getStructureQualityUnits,
  refreshGreenAscendancy,
} from "./queries.js";

const FAITH_ORDER = Object.freeze(["bronze", "silver", "gold", "diamond"]);
const HAPPINESS_ORDER = Object.freeze(["negative", "neutral", "positive"]);

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
  getPhaseModifiers(state).foodByRegion = {};
  runPracticeActivation(state, "food", "preRouting");
  applyAdministrationMoves(state, planDetailedAdministrationMoves(state));
  runPracticeActivation(state, "food", "postRouting");
  for (const site of getDetailedSettlementSites(state)) {
    const settlement = site.detailedState;
    const population = getPopulationSummary(state, site.regionId);
    let consumed = 0;
    const byClass = {};
    let foodReduction = Math.max(0, getPhaseModifiers(state).foodByRegion[site.regionId] ?? 0);
    for (const classId of POPULATION_CLASS_ORDER) {
      const classState = settlement.populationByClass[classId];
      const classTotal = classPopulationTotal(classState);
      const baseDemand = population.byClass[classId]?.mealDemand ?? 0;
      const demand = Math.max(0, baseDemand - Math.min(baseDemand, foodReduction));
      foodReduction = Math.max(0, foodReduction - baseDemand);
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
  getPhaseModifiers(state).housingByRegion = {};
  runPracticeActivation(state, "housing");
  for (const site of getDetailedSettlementSites(state)) {
    const settlement = site.detailedState;
    const population = getPopulationSummary(state, site.regionId);
    const alreadyMigrating = compositionTotal(
      getReservedSourceComposition(turn, site.regionId)
    );
    const assessedPopulation = Math.max(0, population.total - alreadyMigrating);
    const capacity = population.housingCapacity + (getPhaseModifiers(state).housingByRegion[site.regionId] ?? 0);
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
  getPhaseModifiers(state).faithResistance = 0;
  runPracticeActivation(state, "faith");
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
      classState.happiness.status = settlement.happinessFloor?.status === "positive" && settlement.happinessFloor.remainingResolutions > 0
        ? "positive" : HAPPINESS_ORDER[Math.min(foodIndex, capIndex)];
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
    if (settlement.happinessFloor?.remainingResolutions > 0) settlement.happinessFloor.remainingResolutions -= 1;
    turn.regions[site.regionId].faith = { tSec: state.tSec, byClass };
  }
  runGlobalChaos(state);
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
  const populationResistance = Object.entries(faithPopulation).reduce((sum, [tier, population]) => {
    return sum + Math.floor(population / getGameSetting(state, `${tier}ChaosResistancePopulation`));
  }, 0);
  const forumResistance = getDetailedSettlementSites(state).reduce((sum, site) => {
    const def = getDetailedStructureDef(state, "forum");
    return sum + getLocalDistinctPieceTags(state, site.regionId).length
      * (def?.faithResistancePerDistinctTag ?? 0) * getStructureQualityUnits(state, site.regionId, "forum");
  }, 0);
  const sagesResistance = getDetailedSettlementSites(state).reduce((sum, site) => {
    const wisdom = (state.civilization.retiredVassals ?? []).filter((entry) => entry.retirementRegionId === site.regionId)
      .reduce((inner, entry) => inner + Math.max(0, Number(entry.finalWisdom) || 0), 0);
    const def = getDetailedStructureDef(state, "hallOfSages");
    return sum + wisdom * (def?.faithResistancePerRetiredWisdom ?? 0) * getStructureQualityUnits(state, site.regionId, "hallOfSages");
  }, 0);
  const resistance = roundFood(populationResistance + forumResistance + sagesResistance + (getPhaseModifiers(state).faithResistance ?? 0));
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
    populationResistance,
    forumResistance: roundFood(forumResistance),
    sagesResistance: roundFood(sagesResistance),
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

export function initializeDetailedSettlementCivilization(state) {
  state.gameStateSchemaVersion = 20;
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
  state.civilization.research = { total: Math.max(0, getGameSetting(state, "startingResearch") || 0) };
  state.civilization.retiredVassals = [];
  state.civilization.phaseModifiers = { housingByRegion: {}, foodByRegion: {}, faithResistance: 0 };
  refreshGreenAscendancy(state);
  initializeVassalLifeMapCivilization(state);
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
  if (phase.boundary) {
    if (phase.id === "birth") runBirthPhase(state, phase);
    else if (phase.id === "food") runFoodPhase(state, phase);
    else if (phase.id === "housing") runHousingPhase(state, phase);
    else if (phase.id === "faith") runFaithPhase(state, phase);
    else if (phase.id === "migration") runMigrationPhase(state, phase);
    else if (phase.id === "death") runDeathPhase(state, phase);
  }
  if (state?.runStatus?.complete !== true) stepVassalLifeMapSecond(state, tSec);
}
