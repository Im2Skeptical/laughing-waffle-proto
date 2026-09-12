// Leftover unscoped metrics. Live gold/food/population series are on
// civilization/settlement. Grain/AP are unused by UI groups.
// GRAPH_METRICS still exposes these keys for unscoped controller fallbacks.

import { getTotalFoodFromEdibles, getTotalStackByTag } from "../query.js";
import {
  getSettlementPopulationSummary,
  getSettlementTotalFood,
  isSettlementPrototypeEnabled,
} from "../settlement-state.js";

export const GOLD_METRIC = {
  id: "gold",
  label: "Gold",
  series: [
    {
      id: "gold",
      label: "Gold",
      color: 0xffd966,
      getValue: (state, _subject) => state?.resources?.gold ?? state?.gold ?? 0,
      getValueFromSnapshot: (snapshot, _subject) =>
        snapshot?.resources?.gold ?? snapshot?.gold ?? 0,
      formatValue: (value) =>
        Number.isFinite(value) ? value.toFixed(1) : "0.0",
    },
  ],
};

export const GRAIN_METRIC = {
  id: "grain",
  label: "Grain",
  series: [
    {
      id: "grain",
      label: "Grain",
      color: 0xd3b562,
      getValue: (state, _subject) => getTotalStackByTag(state, "grain"),
      getValueFromSnapshot: (snapshot, _subject) =>
        getTotalStackByTag(snapshot, "grain"),
      formatValue: (value) =>
        Number.isFinite(value) ? value.toFixed(1) : "0.0",
    },
  ],
};

function getPrototypeOrResourceFood(state) {
  if (isSettlementPrototypeEnabled(state)) {
    return getSettlementTotalFood(state);
  }
  const base = state?.resources?.food ?? 0;
  const edible = getTotalFoodFromEdibles(state);
  const baseSafe = Number.isFinite(base) ? base : 0;
  const edibleSafe = Number.isFinite(edible) ? edible : 0;
  return baseSafe + edibleSafe;
}

export const FOOD_METRIC = {
  id: "food",
  label: "Food",
  series: [
    {
      id: "food",
      label: "Food",
      color: 0x66cc77,
      getValue: (state, _subject) => getPrototypeOrResourceFood(state),
      getValueFromSnapshot: (snapshot, _subject) =>
        getPrototypeOrResourceFood(snapshot),
      formatValue: (value) =>
        Number.isFinite(value) ? value.toFixed(1) : "0.0",
    },
  ],
};

export const AP_METRIC = {
  id: "ap",
  label: "AP",
  series: [
    {
      id: "apCap",
      label: "AP Cap",
      color: 0xffaa66,
      scaleGroupId: "ap",
      scaleMode: "dynamic",
      scaleMin: 0,
      getValue: (state, _subject) => state?.actionPointCap ?? 0,
      getValueFromSnapshot: (snapshot, _subject) =>
        snapshot?.actionPointCap ?? 0,
      formatValue: (value) =>
        Number.isFinite(value) ? `${Math.floor(value)}` : "0",
    },
    {
      id: "ap",
      label: "AP",
      color: 0x66ccff,
      scaleGroupId: "ap",
      scaleMode: "dynamic",
      scaleMin: 0,
      getValue: (state, _subject) => state?.actionPoints ?? 0,
      getValueFromSnapshot: (snapshot, _subject) =>
        snapshot?.actionPoints ?? 0,
      formatValue: (value) =>
        Number.isFinite(value) ? `${Math.floor(value)}` : "0",
    },
  ],
};

function getPrototypeOrResourcePopulation(state) {
  return isSettlementPrototypeEnabled(state)
    ? getSettlementPopulationSummary(state).total
    : state?.resources?.population ?? state?.population ?? 0;
}

export const POPULATION_METRIC = {
  id: "population",
  label: "Population",
  series: [
    {
      id: "population",
      label: "Population",
      color: 0xb8a4ff,
      getValue: (state, _subject) => getPrototypeOrResourcePopulation(state),
      getValueFromSnapshot: (snapshot, _subject) =>
        getPrototypeOrResourcePopulation(snapshot),
      formatValue: (value) =>
        Number.isFinite(value) ? `${Math.floor(value)}` : "0",
    },
  ],
};

export const LEGACY_GRAPH_METRICS = {
  gold: GOLD_METRIC,
  grain: GRAIN_METRIC,
  food: FOOD_METRIC,
  ap: AP_METRIC,
  population: POPULATION_METRIC,
};
