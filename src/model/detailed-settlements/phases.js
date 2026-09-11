// Moon-turn helpers, six-phase stepper, chaos, and civilization init.
// Phase bodies live in ./phases/; this file remains the public stepper path.

import { getGameSetting } from "../game-config.js";
import { getMoonPhaseAtSecond } from "../moon-phases.js";
import {
  initializeVassalLifeMapCivilization,
  stepVassalLifeMapSecond,
} from "../vassal-life-map.js";
import { runPracticeActivation } from "./practices.js";
import {
  getDetailedSettlementSites,
  refreshGreenAscendancy,
} from "./queries.js";
import { runBirthPhase } from "./phases/birth.js";
import { runDeathPhase } from "./phases/death.js";
import { runFaithPhase } from "./phases/faith.js";
import { runFoodPhase } from "./phases/food.js";
import { runHousingPhase } from "./phases/housing.js";
import { runMigrationPhase } from "./phases/migration.js";
import { resetEmptyStrangerCohort } from "./phases/shared.js";

export { getElderMortalityRate, resolveProbability } from "./phases/shared.js";
export { getPrimordialChaosPressure } from "./phases/chaos.js";

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
