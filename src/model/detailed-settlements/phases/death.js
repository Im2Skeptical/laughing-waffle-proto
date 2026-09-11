// Death moon phase: arrival meals, hardship, old-age mortality, food rot.

import { POPULATION_CLASS_ORDER } from "../../../defs/gamepieces/detailed-settlement-defs.js";
import { getGameSetting } from "../../game-config.js";
import {
  clone,
  compositionTotal,
  emptyPopulationComposition,
  ensureMoonRegionResult,
  roundFood,
} from "../helpers.js";
import { getPreserveReduction } from "../practices.js";
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
