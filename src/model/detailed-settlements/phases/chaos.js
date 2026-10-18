// Civilization-global chaos pressure, income, and pending loss recording.

import { POPULATION_CLASS_ORDER } from "../../../defs/gamepieces/detailed-settlement-defs.js";
import { getGameSetting } from "../../game-config.js";
import { roundChaos } from '../../chaos-values.js';
import {
  classPopulationTotal,
} from "../helpers.js";
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
  return roundChaos(basePressure * (growthFactor ** growthSteps));
}

export function getChaosResistanceBreakdown(state) {
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
  const faithResistance = Object.entries(faithPopulation).reduce((sum, [tier, population]) => {
    // Fractional contributions preserve every person in the compact units.
    // Relative to Chaos, these unchanged ratios now provide 10x protection.
    return sum + population / getGameSetting(state, `${tier}ChaosResistancePopulation`);
  }, 0);
  const populationResistance = faithResistance * getGameSetting(state, 'populationChaosResistanceMultiplier');
  const resistance = roundChaos(populationResistance + (state?.civilization?.phaseModifiers?.faithResistance ?? 0));
  return { faithPopulation, populationResistance: roundChaos(populationResistance), resistance };
}

export const getChaosResistance = state => getChaosResistanceBreakdown(state).resistance;

export function runGlobalChaos(state) {
  const civilization = state.civilization;
  const pending = civilization.chaos.pendingLosses ?? {
    prematureDeaths: 0, oldAgeDeaths: 0, externalEmigrants: 0, internalMigrants: 0,
  };
  const { faithPopulation, populationResistance, resistance } = getChaosResistanceBreakdown(state);
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
  // Resistance contains accumulated Chaos's monster threat, never its income.
  const totalIncome = Math.max(0, rawPressure);
  civilization.chaos.chaosPower = roundChaos(
    civilization.chaos.chaosPower + totalIncome
  );
  const spawned = 0;
  civilization.chaos.lastMoonIncome = {
    prematureDeaths: pending.prematureDeaths,
    oldAgeDeaths: pending.oldAgeDeaths,
    externalEmigrants: pending.externalEmigrants,
    primordialPressure,
    prematureDeathPressure: roundChaos(prematureDeathPressure),
    prematureDeathMitigation: roundChaos(pending.prematureDeathMitigation??0),
    externalEmigrationPressure: roundChaos(externalEmigrationPressure),
    oldAgeDeathPressure: roundChaos(oldAgeDeathPressure),
    internalMigrationPressure: roundChaos(internalMigrationPressure),
    rawPressure: roundChaos(rawPressure),
    faithPopulation,
    resistance,
    populationResistance,
    incomingChaos: roundChaos(totalIncome),
    totalIncome: roundChaos(totalIncome),
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
