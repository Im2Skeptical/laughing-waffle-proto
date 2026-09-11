// Read models that combine queries with worker assignment.

import { POPULATION_CLASS_ORDER } from "../../defs/gamepieces/detailed-settlement-defs.js";
import { getGamepieceFace } from "../gamepiece-presentation.js";
import {
  getDetailedPracticeDef,
  getDetailedStructureDef,
  getGameSetting,
} from "../game-config.js";
import { occupiedCells } from "../structure-layout.js";
import { getRegionState } from "../world-state.js";
import { clone, roundFood } from "./helpers.js";
import {
  assignDetailedSettlementWorkers,
  buildDetailedPracticeEvaluation,
  getLocalDistinctPieceTags,
  getPracticeTags,
} from "./practices.js";
import {
  getDetailedSettlementSite,
  getDetailedSettlementSites,
  getElderOrderSummary,
  getGreenAscendancySummary,
  getPopulationSummary,
  getSettlementPressureSummary,
  getStoredFoodCapacity,
} from "./queries.js";

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
    research: roundFood(state?.civilization?.research?.total ?? 0),
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
    currencySpentThisMoon: roundFood(state.civilization.currentMoonTurn?.regions?.[regionId]?.currencySpent ?? 0),
    currencySpentLastMoon: roundFood(settlement.lastMoonResult?.currencySpent ?? 0),
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
      tags: slot ? getPracticeTags(state, slot.practiceId) : [],
      face: slot ? getGamepieceFace(state, "practice", slot.practiceId, slot.tier, { evaluation: buildDetailedPracticeEvaluation(state, site, workers[index]), workers: workers[index], slot }) : null,
      workers: workers[index],
      evaluation: slot ? buildDetailedPracticeEvaluation(state, site, workers[index]) : null,
    })),
    structures: settlement.structureSlots.map((slot) => slot ? ({ ...slot, face: getGamepieceFace(state, "structure", slot.structureId, slot.tier), label: getDetailedStructureDef(state, slot.structureId)?.label ?? slot.structureId, tags: getDetailedStructureDef(state, slot.structureId)?.tags ?? [] }) : null),
    structureCapacity: region?.structureCapacity ?? 0,
    usedStructureCapacity: occupiedCells(settlement.structureSlots).filter(Boolean).length,
    elderOrder: getElderOrderSummary(state, regionId),
    lastMeal: settlement.lastMeal,
    currentMoonResult: state.civilization.currentMoonTurn?.regions?.[regionId] ?? null,
    lastMoonResult: settlement.lastMoonResult,
    research: roundFood(state.civilization.research?.total ?? 0),
    localTags: getLocalDistinctPieceTags(state, regionId),
    retiredVassals: (state.civilization.retiredVassals ?? []).filter((entry) => entry.retirementRegionId === regionId),
    activationTrace: settlement.practiceActivationTrace ?? [],
  };
}
