// Food moon phase: meals, happiness, and starvation migration intents.

import { POPULATION_CLASS_ORDER } from "../../../defs/gamepieces/detailed-settlement-defs.js";
import { getGameSetting } from "../../game-config.js";
import {
  classPopulationTotal,
  clone,
  roundFood,
} from "../helpers.js";
import {
  applyAdministrationMoves,
  consumeFood,
  getPhaseModifiers,
  planDetailedAdministrationMoves,
  runPracticeActivation,
} from "../practices.js";
import {
  getDetailedSettlementSites,
  getPopulationSummary,
} from "../queries.js";
import { addMoonMigrationIntent, selectUnreservedPopulation } from "./migration.js";
import { setMoonTurnPhase } from "./moon-turn.js";
import {
  HAPPINESS_ORDER,
  resetEmptyStrangerCohort,
  shiftStatus,
} from "./shared.js";

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

function evaluateFoodHappiness(state, classState, ratio) {
  const previousStatus = classState.happiness.status;
  const result = updateHappiness(state, classState, ratio);
  const targetStatus = result.starvationTriggered
    ? shiftStatus(previousStatus, HAPPINESS_ORDER, -1)
    : classState.happiness.status;
  classState.happiness.status = previousStatus;
  return { ...result, targetStatus };
}

export function runFoodPhase(state, phase) {
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
