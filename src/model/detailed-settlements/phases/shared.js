// Shared phase helpers used by more than one moon phase.

import { getGameSetting } from "../../game-config.js";
import { classPopulationTotal } from "../helpers.js";

export const HAPPINESS_ORDER = Object.freeze(["negative", "neutral", "positive"]);

export function resetEmptyStrangerCohort(settlement) {
  const stranger = settlement?.populationByClass?.stranger;
  if (!stranger || classPopulationTotal(stranger) > 0) return;
  stranger.faith = { tier: "gold", trend: null, streak: 0 };
  stranger.happiness = {
    status: "neutral",
    fullFeedStreak: 0,
    missedFeedStreak: 0,
    partialFeedRatios: [],
  };
}

export function resolveProbability(base, modifiers = null) {
  const additions = (modifiers?.additive ?? []).reduce(
    (sum, value) => sum + (Number.isFinite(value) ? value : 0), 0
  );
  const multiplier = (modifiers?.multipliers ?? []).reduce(
    (product, value) => product * (Number.isFinite(value) ? value : 1), 1
  );
  return Math.max(0, Math.min(1, (base + additions) * multiplier));
}

export function getElderMortalityRate(age, state = null) {
  if (age <= 49) return getGameSetting(state, "elderMortalityThrough49");
  if (age <= 54) return getGameSetting(state, "elderMortality50To54");
  if (age <= 59) return getGameSetting(state, "elderMortality55To59");
  if (age <= 64) return getGameSetting(state, "elderMortality60To64");
  if (age <= 69) return getGameSetting(state, "elderMortality65To69");
  if (age <= 74) return getGameSetting(state, "elderMortality70To74");
  return getGameSetting(state, "elderMortality75Plus");
}

export function rollCount(state, count, probability) {
  let successes = 0;
  for (let index = 0; index < count; index += 1) {
    if (state.rngNextFloat() < probability) successes += 1;
  }
  return successes;
}

export function shiftStatus(value, order, delta) {
  const index = Math.max(0, order.indexOf(value));
  return order[Math.max(0, Math.min(order.length - 1, index + delta))];
}
