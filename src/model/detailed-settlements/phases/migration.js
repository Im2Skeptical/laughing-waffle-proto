// Migration intent, housing/meal allocation, and the migration moon phase.

import { POPULATION_CLASS_ORDER } from "../../../defs/gamepieces/detailed-settlement-defs.js";
import { getGameSetting } from "../../game-config.js";
import { getConnectedRegionIds, getRegionState } from "../../world-state.js";
import {
  classPopulationTotal,
  clone,
  clonePopulationComposition,
  compositionBins,
  compositionFromBins,
  compositionTotal,
  emptyPopulationComposition,
  ensureMoonRegionResult,
  roundFood,
  selectPopulationComposition,
} from "../helpers.js";
import { consumeFood } from "../practices.js";
import {
  getDetailedSettlement,
  getDetailedSettlementSites,
  getGreenAscendancySummary,
  getHousingCapacity,
  getPopulationSummary,
} from "../queries.js";
import { recordChaosLosses } from "./chaos.js";
import { setMoonTurnPhase } from "./moon-turn.js";
import { resetEmptyStrangerCohort } from "./shared.js";

export function getReservedSourceComposition(turn, sourceRegionId) {
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

export function selectUnreservedPopulation(
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

export function addMoonMigrationIntent(state, turn, intent) {
  const composition = clonePopulationComposition(intent.composition);
  const requested = compositionTotal(composition);
  if (requested <= 0) return null;
  const next = { ...intent, requested, composition };
  turn.migrationIntents.push(next);
  return next;
}

export function removePopulationComposition(settlement, composition) {
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

export function addCompositionToStrangers(settlement, composition) {
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

export function allocateArrivalMeals(state, movements) {
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

export function compactMigrationMovement(movement) {
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

export function runMigrationPhase(state, phase) {
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
