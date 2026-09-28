import { splitSpecialistCohorts, combineSpecialistCohorts } from "../cohorts.js";
import { specialistCount } from "../stock.js";
// Death moon phase: arrival meals, hardship, old-age mortality and population history.

import { POPULATION_CLASS_ORDER } from "../../../defs/gamepieces/detailed-settlement-defs.js";
import { getGameSetting } from "../../game-config.js";
import {
  clone,
  compositionTotal,
  compositionBins,
  compositionFromBins,
  emptyPopulationComposition,
  ensureMoonRegionResult,
  roundFood,
} from "../helpers.js";
import {
  getDetailedSettlement,
  getDetailedSettlementSites,
  getGreenAscendancySummary,
} from "../queries.js";
import { recordChaosLosses } from "./chaos.js";
import {
  addCompositionToStrangers,
  allocateArrivalMeals,
  compactMigrationMovement,
  removePopulationComposition,
} from "./migration.js";
import { setMoonTurnPhase } from "./moon-turn.js";
import {
  getElderMortalityRate,
  resetEmptyStrangerCohort,
  rollCount,
} from "./shared.js";

function rollCompositionDeaths(state, composition, probability) {
  return compositionFromBins(compositionBins(composition).map(bin=>({...bin,count:rollCount(state,bin.count,probability)})));
}

export function runDeathPhase(state, phase) {
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
    if (site.neutral) continue;
    const settlement = site.detailedState;
    const regionResult = ensureMoonRegionResult(turn, site.regionId);
    const byClass = {};
    for (const classId of POPULATION_CLASS_ORDER) {
      const classState = settlement.populationByClass[classId];
      let naturalDeaths = 0;
      const parts = splitSpecialistCohorts(classState);
      for(const part of Object.values(parts)) part.eldersByAge = (part.eldersByAge ?? []).map((cohort) => {
        const green = getGreenAscendancySummary(state);
        const mortality = getElderMortalityRate(cohort.age, state)
          * (1 - Math.min(1, green.elderMortalityReduction / 100));
        const deaths = rollCount(state, cohort.count, mortality);
        naturalDeaths += deaths;
        return { ...cohort, count: cohort.count - deaths };
      }).filter((cohort) => cohort.count > 0);
      combineSpecialistCohorts(classState, parts);
      byClass[classId] = { naturalDeaths };
      settlement.history ??= { deaths: 0 };
      settlement.history.deaths += naturalDeaths;
      oldAgeDeaths += naturalDeaths;
    }
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
      storedFoodRot: 0,
      looseFoodRot: 0,
    };
    if (settlement.lastMeal) settlement.lastMeal.migration = clone(migration);
    resetEmptyStrangerCohort(settlement);
  }
  prematureDeaths += internalMovements.reduce((sum, movement) => sum + movement.arrivalDeaths, 0);
  recordChaosLosses(state, { prematureDeaths, oldAgeDeaths });
}
