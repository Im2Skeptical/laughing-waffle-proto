import { consumeStock, consumeAvailableStock, CIV_CONTENT_TUNING } from "../stock.js";
import { replenishNeutralMarkets } from '../neutral-market.js';
// Food moon phase: meals, happiness, and starvation migration intents.

import { POPULATION_CLASS_ORDER } from "../../../defs/gamepieces/detailed-settlement-defs.js";
import { getGameSetting } from "../../game-config.js";
import {
  classPopulationTotal,
  clone,
  roundFood,
} from "../helpers.js";
import {
  getPhaseModifiers,
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
  replenishNeutralMarkets(state);
  runPracticeActivation(state, "food", "preRouting");
  runPracticeActivation(state, "food", "postRouting");
  // All owners get first use of their own Edible Stock. Only after this pass
  // may unmet demand draw on the stock left in adjacent connected settlements.
  const meals = getDetailedSettlementSites(state).map(site => {
    const settlement = site.detailedState;
    const population = getPopulationSummary(state, site.regionId);
    const savedStock = Math.min(population.mealDemand, Math.max(0, getPhaseModifiers(state).foodByRegion[site.regionId] ?? 0));
    const demandStock = population.mealDemand - savedStock;
    const localConsumed = consumeStock(state, settlement, "Edible", demandStock);
    return { site, savedStock, demandStock, localConsumed };
  });
  for (const { site, savedStock, demandStock, localConsumed } of meals) {
    const settlement = site.detailedState;
    const shortage = demandStock - localConsumed;
    const consumed = localConsumed + (shortage > 0
      ? consumeAvailableStock(state, settlement, "Edible", shortage) : 0);
    let fedPeople = (consumed + savedStock) * CIV_CONTENT_TUNING.populationPerEdible;
    const byClass = {};
    for (const classId of POPULATION_CLASS_ORDER) {
      const classState = settlement.populationByClass[classId];
      const classTotal = classPopulationTotal(classState);
      const demand = classTotal;
      const classConsumed = Math.min(demand, fedPeople);
      fedPeople -= classConsumed;
      const ratio = demand > 0 ? classConsumed / demand : 1;

      if (classId === "stranger" && classTotal <= 0) {
        resetEmptyStrangerCohort(settlement);
        byClass[classId] = { demand, consumed: classConsumed, ratio: 1, migrants: 0 };
        continue;
      }
      if (site.neutral) { byClass[classId] = { demand, consumed: classConsumed, ratio, migrants: 0 }; continue; }
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
      demand: demandStock,
      savedStock,
      consumed,
      ratio: roundFood(demandStock > 0 ? consumed / demandStock : 1),
      byClass,
      migration: { intents: [], outbound: [], inbound: [], sourceLosses: [] },
    };
    settlement.lastMeal = result;
    turn.regions[site.regionId].food = clone(result);
  }
}
