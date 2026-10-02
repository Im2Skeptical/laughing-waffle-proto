// Civilization-global chaos pressure, income, and pending loss recording.

import { POPULATION_CLASS_ORDER } from "../../../defs/gamepieces/detailed-settlement-defs.js";
import { getGameSetting } from "../../game-config.js";
import {
  classPopulationTotal,
  roundFood,
} from "../helpers.js";
import {
  getPhaseModifiers,
} from "../practices.js";
import {
  getDetailedSettlementSites,
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
  for (const site of getDetailedSettlementSites(state, { playerOnly: true })) {
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
  const resistance = roundFood(populationResistance + (getPhaseModifiers(state).faithResistance ?? 0));
  const primordialPressure = getPrimordialChaosPressure(state);
  const prematureDeathPressure = Math.max(0,pending.prematureDeaths
    * getGameSetting(state, "prematureDeathChaosWeight")-(pending.prematureDeathMitigation??0));
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
  const spawned = 0;
  civilization.chaos.lastMoonIncome = {
    prematureDeaths: pending.prematureDeaths,
    oldAgeDeaths: pending.oldAgeDeaths,
    externalEmigrants: pending.externalEmigrants,
    primordialPressure,
    prematureDeathPressure: roundFood(prematureDeathPressure),
    prematureDeathMitigation: roundFood(pending.prematureDeathMitigation??0),
    externalEmigrationPressure: roundFood(externalEmigrationPressure),
    oldAgeDeathPressure: roundFood(oldAgeDeathPressure),
    internalMigrationPressure: roundFood(internalMigrationPressure),
    rawPressure: roundFood(rawPressure),
    faithPopulation,
    resistance,
    populationResistance,
    incomingChaos: roundFood(totalIncome),
    totalIncome: roundFood(totalIncome),
    accumulatedChaos: civilization.chaos.chaosPower,
    spawned,
  };
  civilization.chaos.pendingLosses = {
    prematureDeaths: 0, oldAgeDeaths: 0, externalEmigrants: 0, internalMigrants: 0,
  };
}

export function recordChaosLosses(state, losses) {
  const chaos = state.civilization.chaos;
  const pending = chaos.pendingLosses ?? {
    prematureDeaths: 0, oldAgeDeaths: 0, externalEmigrants: 0, internalMigrants: 0,
  };
  for (const key of ['prematureDeaths','oldAgeDeaths','externalEmigrants','internalMigrants']) {
    pending[key] += Math.max(0, Math.floor(losses?.[key] ?? 0));
  }
  pending.prematureDeathMitigation=(pending.prematureDeathMitigation??0)+Math.max(0,losses?.prematureDeathMitigation??0);
  chaos.pendingLosses = pending;
}
