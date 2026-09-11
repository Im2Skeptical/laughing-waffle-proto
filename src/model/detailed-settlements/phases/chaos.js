// Civilization-global chaos pressure, income, and pending loss recording.

import { POPULATION_CLASS_ORDER } from "../../../defs/gamepieces/detailed-settlement-defs.js";
import { getDetailedStructureDef, getGameSetting } from "../../game-config.js";
import {
  classPopulationTotal,
  roundFood,
} from "../helpers.js";
import {
  getLocalDistinctPieceTags,
  getPhaseModifiers,
} from "../practices.js";
import {
  getDetailedSettlementSites,
  getStructureQualityUnits,
} from "../queries.js";

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

export function runGlobalChaos(state) {
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

export function recordChaosLosses(state, losses) {
  const chaos = state.civilization.chaos;
  const pending = chaos.pendingLosses ?? {
    prematureDeaths: 0, oldAgeDeaths: 0, externalEmigrants: 0, internalMigrants: 0,
  };
  for (const key of Object.keys(pending)) {
    pending[key] += Math.max(0, Math.floor(losses?.[key] ?? 0));
  }
  chaos.pendingLosses = pending;
}
