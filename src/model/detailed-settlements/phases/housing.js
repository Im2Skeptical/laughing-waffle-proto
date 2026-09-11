// Housing moon phase: overflow intents and happiness cap.

import { getGameSetting } from "../../game-config.js";
import { compositionTotal } from "../helpers.js";
import { getPhaseModifiers, runPracticeActivation } from "../practices.js";
import {
  getDetailedSettlementSites,
  getPopulationSummary,
} from "../queries.js";
import {
  addMoonMigrationIntent,
  getReservedSourceComposition,
  selectUnreservedPopulation,
} from "./migration.js";
import { setMoonTurnPhase } from "./moon-turn.js";

export function runHousingPhase(state, phase) {
  const turn = setMoonTurnPhase(state, phase);
  getPhaseModifiers(state).housingByRegion = {};
  runPracticeActivation(state, "housing");
  for (const site of getDetailedSettlementSites(state)) {
    const settlement = site.detailedState;
    const population = getPopulationSummary(state, site.regionId);
    const alreadyMigrating = compositionTotal(
      getReservedSourceComposition(turn, site.regionId)
    );
    const assessedPopulation = Math.max(0, population.total - alreadyMigrating);
    const capacity = population.housingCapacity + (getPhaseModifiers(state).housingByRegion[site.regionId] ?? 0);
    const overflow = Math.max(0, assessedPopulation - capacity);
    const happinessCap = assessedPopulation <= capacity
      ? "positive"
      : assessedPopulation > capacity * getGameSetting(state, "overHousingNegativeRatio")
        ? "negative"
        : "neutral";
    const composition = selectUnreservedPopulation(
      turn,
      site.regionId,
      settlement,
      ["stranger", "villager"],
      overflow
    );
    const intent = addMoonMigrationIntent(state, turn, {
      reason: "housing",
      sourceId: site.regionId,
      sourceClassId: null,
      composition,
    });
    turn.regions[site.regionId].housing = {
      tSec: state.tSec,
      population: assessedPopulation,
      capacity,
      overflow,
      migrants: intent?.requested ?? 0,
      happinessCap,
    };
  }
}
