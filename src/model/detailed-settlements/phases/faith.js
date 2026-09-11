// Faith moon phase: happiness evidence, faith streak, collapse, then chaos.

import { POPULATION_CLASS_ORDER } from "../../../defs/gamepieces/detailed-settlement-defs.js";
import { getGameSetting } from "../../game-config.js";
import { classPopulationTotal } from "../helpers.js";
import { getPhaseModifiers, runPracticeActivation } from "../practices.js";
import { getDetailedSettlementSites } from "../queries.js";
import { runGlobalChaos } from "./chaos.js";
import { addMoonMigrationIntent, selectUnreservedPopulation } from "./migration.js";
import { setMoonTurnPhase } from "./moon-turn.js";
import {
  HAPPINESS_ORDER,
  resetEmptyStrangerCohort,
  shiftStatus,
} from "./shared.js";

const FAITH_ORDER = Object.freeze(["bronze", "silver", "gold", "diamond"]);

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

export function runFaithPhase(state, phase) {
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
