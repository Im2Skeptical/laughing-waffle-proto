// src/model/graph-metrics.js
// Metric definitions for time graphs.

import { MOON_CYCLE_SEC, YOUTH_PER_FOOD } from "../defs/gamesettings/gamerules-defs.js";
import { getTotalFoodFromEdibles, getTotalStackByTag } from "./query.js";
import { getSettlementChaosGodSummary } from "./settlement-chaos.js";
import {
  getSettlementFaithGraphValue,
  getSettlementFaithSummary,
  getSettlementHappinessGraphValue,
  getSettlementHappinessSummary,
  getSettlementClassIds,
  getSettlementFloodplainFoodTotal,
  getSettlementPopulationSummary,
  getSettlementStockpile,
  getSettlementTotalFood,
  isSettlementPrototypeEnabled,
} from "./settlement-state.js";
import { getPrimaryDetailedSiteState, getRegionDefinition } from "./world-state.js";
import {
  assignDetailedSettlementWorkers,
  getDetailedCivilizationSummary,
  getDetailedSettlement,
  getPopulationSummary as getDetailedPopulationSummary,
} from "./detailed-settlements.js";

export const SETTLEMENT_RESOURCE_COLOURS = Object.freeze({
  totalPopulation: 0xd6c1ff,
  food: 0x66cc77,
});

const DEFAULT_SETTLEMENT_GRAPH_CLASS_IDS = Object.freeze(["villager", "stranger"]);
const SETTLEMENT_CLASS_METRIC_COLOR_PALETTES = Object.freeze({
  population: Object.freeze([
    0xb88cff,
    0x66b7f0,
    0xf2a766,
    0x8acb88,
    0xf07a7a,
    0x88d7d0,
    0xe0b86e,
    0xc79be8,
  ]),
  freePopulation: Object.freeze([
    0xd8c47d,
    0xa2d6c9,
    0xe2aa72,
    0xa5c992,
    0xd7a1a1,
    0xa7c2e6,
    0xd9d27a,
    0xcbb4e4,
  ]),
  faith: Object.freeze([
    0xf1de7a,
    0xf6c972,
    0xe5c27f,
    0xe8dd9b,
    0xecc16d,
    0xd9c984,
    0xf0d49c,
    0xd3ba67,
  ]),
  happiness: Object.freeze([
    0xf2a766,
    0xef8e73,
    0xe9bb6e,
    0xe68888,
    0xf0b38e,
    0xd48d5f,
    0xdba07d,
    0xebc29d,
  ]),
});
const SETTLEMENT_CLASS_METRIC_DEFS = Object.freeze([
  {
    id: "population",
    shortLabel: "Pop",
    label: "Population",
    scaleGroupId: "settlementPopulation",
    scaleMode: "dynamic",
    scaleMin: 0,
    getValue: (state, classId) => getSettlementPopulationSummary(state, classId).total,
    getValueFromSnapshot: (snapshot, classId) =>
      getSettlementPopulationSummary(snapshot, classId).total,
    getLegendTooltipSpec: (state, classId) =>
      getSettlementPopulationTooltipSpec(state, classId),
    formatValue: (value) => (Number.isFinite(value) ? `${Math.floor(value)}` : "0"),
  },
  {
    id: "freePopulation",
    shortLabel: "Free",
    label: "Free Population",
    scaleGroupId: "settlementFreePopulation",
    scaleMode: "dynamic",
    scaleMin: 0,
    getValue: (state, classId) => getSettlementPopulationSummary(state, classId).free,
    getValueFromSnapshot: (snapshot, classId) =>
      getSettlementPopulationSummary(snapshot, classId).free,
    getLegendTooltipSpec: (state, classId) =>
      getSettlementFreePopulationTooltipSpec(state, classId),
    formatValue: (value) => (Number.isFinite(value) ? `${Math.floor(value)}` : "0"),
  },
  {
    id: "faith",
    shortLabel: "Faith",
    label: "Faith",
    scaleGroupId: "settlementFaith",
    scaleMode: "fixed",
    scaleMin: 0,
    scaleMax: 100,
    getValue: (state, classId) => getSettlementFaithGraphValue(state, classId),
    getValueFromSnapshot: (snapshot, classId) =>
      getSettlementFaithGraphValue(snapshot, classId),
    getLegendTooltipSpec: (state, classId) =>
      getSettlementFaithTooltipSpec(state, classId),
    formatValue: (value) => (Number.isFinite(value) ? `${Math.floor(value)}` : "0"),
  },
  {
    id: "happiness",
    shortLabel: "Happy",
    label: "Happiness",
    scaleGroupId: "settlementHappiness",
    scaleMode: "fixed",
    scaleMin: 0,
    scaleMax: 100,
    getValue: (state, classId) => getSettlementHappinessGraphValue(state, classId),
    getValueFromSnapshot: (snapshot, classId) =>
      getSettlementHappinessGraphValue(snapshot, classId),
    getLegendTooltipSpec: (state, classId) =>
      getSettlementHappinessTooltipSpec(state, classId),
    formatValue: (value) =>
      value >= 75 ? "Positive" : value <= 25 ? "Negative" : "Neutral",
  },
]);

function capitalizeLabel(value) {
  const text = typeof value === "string" ? value : "";
  if (!text.length) return "None";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function getSettlementFoodTooltipSpec(state) {
  const population = getSettlementPopulationSummary(state);
  const food = getSettlementTotalFood(state);
  const storedFood = getSettlementStockpile(state, "food");
  const fieldFood = getSettlementFloodplainFoodTotal(state);
  const foodCapacity = Math.max(0, Math.floor(getPrimaryDetailedSiteState(state)?.hub?.core?.props?.foodCapacity ?? 0));
  const youthPerFood = Number.isFinite(YOUTH_PER_FOOD) ? Math.max(1, Math.floor(YOUTH_PER_FOOD)) : 2;
  const weightedDemand = population.adults + Math.ceil(population.youth / youthPerFood);
  return {
    title: "Food",
    lines: [
      `Current food: ${Math.floor(food)} (${Math.floor(storedFood)}/${foodCapacity} stored, ${Math.floor(fieldFood)} in fields).`,
      `Each full moon consumes up to ${weightedDemand} food (${population.adults} adults + ${population.youth} youth, with 1 food per ${youthPerFood} youth and odd youth rounded up).`,
      `Full moon cadence: every ${Math.max(1, Math.floor(MOON_CYCLE_SEC || 1))}s at the midpoint of the moon cycle.`,
      "Meals consume stored hub food first, then field food from floodplains.",
      "Spring rollovers resolve the last year's population and faith independently of moon meals.",
    ],
  };
}

function getSettlementRedTooltipSpec(state) {
  const population = getSettlementPopulationSummary(state);
  const red = getSettlementStockpile(state, "redResource");
  const redCap = Math.max(0, population.total);
  return {
    title: "Red Resource",
    lines: [
      `Current stockpile: ${Math.floor(red)}/${redCap}`,
      "Generated by Flood Rites and capped by total population.",
    ],
  };
}

function getSettlementChaosPowerTooltipSpec(state) {
  const redGod = getSettlementChaosGodSummary(state, "redGod");
  return {
    title: "Chaos Power",
    lines: [
      `Current chaos power: ${Math.floor(redGod?.chaosPower ?? 0)}`,
      `Next spawn in: ${Math.floor(redGod?.spawnCountdownSec ?? 0)}s`,
      `Projected monsters on next spawn: ${Math.floor(redGod?.nextSpawnCount ?? 0)}`,
    ],
  };
}

function getSettlementMonstersTooltipSpec(state) {
  const redGod = getSettlementChaosGodSummary(state, "redGod");
  return {
    title: "Monsters",
    lines: [
      `Current monsters: ${Math.floor(redGod?.monsterCount ?? 0)}/${Math.floor(redGod?.monsterWinCount ?? 100)}`,
      `Spawn cadence: every ${Math.floor(redGod?.cadenceSec ?? 0)}s`,
      "If monsters reach the win threshold, the run ends.",
    ],
  };
}

function formatClassLabel(classId) {
  return capitalizeLabel(typeof classId === "string" ? classId : "villager");
}

function getSettlementMetricRegionId(subject = null) {
  if (typeof subject === "string" && subject.length > 0) return subject;
  if (typeof subject?.regionId === "string") return subject.regionId;
  return null;
}

function getDetailedClassMetricValue(state, subject, classId, metricId) {
  const regionId = getSettlementMetricRegionId(subject);
  if (!regionId) return 0;
  const summary = getDetailedPopulationSummary(state, regionId);
  const classSummary = summary.byClass[classId] ?? { children: 0, adults: 0, elders: 0, total: 0 };
  const classState = getDetailedSettlement(state, regionId)?.populationByClass?.[classId];
  if (metricId === "population") return classSummary.total;
  if (metricId === "freePopulation") {
    const assigned = assignDetailedSettlementWorkers(state, regionId).reduce(
      (sum, entry) => sum + entry.tokens.filter((token) => token.classId === classId).length, 0
    );
    return Math.max(0, classSummary.adults + classSummary.elders - assigned);
  }
  if (metricId === "faith") {
    return (["bronze", "silver", "gold", "diamond"].indexOf(classState?.faith?.tier) + 1) * 25;
  }
  if (metricId === "happiness") {
    return classState?.happiness?.status === "positive"
      ? 100 : classState?.happiness?.status === "negative" ? 0 : 50;
  }
  return 0;
}

function getDetailedCivilizationClassMetricValue(state, classId, metricId) {
  const classSummary =
    getDetailedCivilizationSummary(state)?.population?.byClass?.[classId] ?? {};
  if (metricId === "population") return classSummary.total ?? 0;
  if (metricId === "freePopulation") return classSummary.freePopulation ?? 0;
  return 0;
}

function getSettlementGraphValueFromSummary(summary, seriesId, subject = null) {
  const regionId = getSettlementMetricRegionId(subject);
  const graphValues = regionId
    ? summary?.graphValues?.settlementByRegion?.[regionId]
    : null;
  if (!graphValues || typeof graphValues !== "object") return null;
  const value = graphValues[seriesId];
  return Number.isFinite(value) ? Number(value) : null;
}

function getCivilizationGraphValueFromSummary(summary, seriesId) {
  const graphValues = summary?.graphValues?.civilization;
  if (!graphValues || typeof graphValues !== "object") return null;
  const value = graphValues[seriesId];
  return Number.isFinite(value) ? Number(value) : null;
}

function getSettlementPopulationTooltipSpec(state, classId = null) {
  const population = getSettlementPopulationSummary(state, classId);
  return {
    title: `${classId ? `${formatClassLabel(classId)} ` : ""}Population`,
    lines: [
      `Total population: ${population.total}`,
      `Adults: ${population.adults}`,
      `Youth: ${population.youth}`,
      `Reserved by structures/practices: ${population.reserved}`,
      `Free population: ${population.free}`,
    ],
  };
}

function getSettlementFreePopulationTooltipSpec(state, classId = null) {
  const population = getSettlementPopulationSummary(state, classId);
  return {
    title: `${classId ? `${formatClassLabel(classId)} ` : ""}Free Population`,
    lines: [
      `Free population: ${population.free}`,
      `Structure staffing: ${population.staffed}`,
      `Practice commitments: ${population.committed}`,
    ],
  };
}

function getSettlementFaithTooltipSpec(state, classId = null) {
  const faith = getSettlementFaithSummary(state, classId);
  const happiness = getSettlementHappinessSummary(state, classId);
  return {
    title: `${classId ? `${formatClassLabel(classId)} ` : ""}Faith`,
    lines: [
      `Current tier: ${capitalizeLabel(faith.tier)}`,
      `Current happiness: ${capitalizeLabel(happiness.status)}`,
      "At each spring rollover, positive happiness raises faith and negative happiness lowers it.",
    ],
  };
}

function getSettlementHappinessTooltipSpec(state, classId = null) {
  const happiness = getSettlementHappinessSummary(state, classId);
  const partialMemory =
    happiness.partialFeedRatios.length > 0
      ? happiness.partialFeedRatios.map((value) => `${Math.round(value * 100)}%`).join(" -> ")
      : "None";
  return {
    title: `${classId ? `${formatClassLabel(classId)} ` : ""}Happiness`,
    lines: [
      `Current state: ${capitalizeLabel(happiness.status)}`,
      `Full-feed streak: ${happiness.fullFeedStreak}/${happiness.fullFeedThreshold}`,
      `Missed-feed streak: ${happiness.missedFeedStreak}/${happiness.missedFeedThreshold}`,
      `Partial memory: ${partialMemory}`,
      "Three full seasons set happiness to positive. Three consecutive misses trigger starvation, and further misses keep triggering it until the class gets at least a 50% feed. Partial ratios improve on 3 rising steps and worsen immediately on flat-or-lower steps.",
    ],
  };
}

function getSettlementGraphClassIds(state) {
  const classIds = getSettlementClassIds(state);
  return classIds.length ? classIds : DEFAULT_SETTLEMENT_GRAPH_CLASS_IDS;
}

function resolveSettlementClassMetricColor(metricId, classIndex) {
  const palette = Array.isArray(SETTLEMENT_CLASS_METRIC_COLOR_PALETTES[metricId])
    ? SETTLEMENT_CLASS_METRIC_COLOR_PALETTES[metricId]
    : SETTLEMENT_CLASS_METRIC_COLOR_PALETTES.population;
  if (!palette.length) return 0xb8a4ff;
  const safeIndex = Number.isFinite(classIndex) ? Math.max(0, Math.floor(classIndex)) : 0;
  return palette[safeIndex % palette.length];
}

function createSettlementClassMetricSeries(classId, classIndex, metricDef) {
  const safeClassId =
    typeof classId === "string" && classId.length ? classId : "villager";
  const safeMetricDef =
    metricDef && typeof metricDef === "object"
      ? metricDef
      : SETTLEMENT_CLASS_METRIC_DEFS[0];
  const metricId = String(safeMetricDef.id ?? "population");
  const metricShortLabel = String(
    safeMetricDef.shortLabel ?? safeMetricDef.label ?? metricId
  );
  const metricLabel = String(safeMetricDef.label ?? metricShortLabel);
  const classLabel = formatClassLabel(safeClassId);
  return {
    id: `${metricId}:${safeClassId}`,
    label: `${classLabel} ${metricShortLabel}`,
    color: resolveSettlementClassMetricColor(metricId, classIndex),
    legendLabel: `${classLabel} ${metricLabel}`,
    scaleGroupId: String(safeMetricDef.scaleGroupId ?? metricId),
    scaleMode: String(safeMetricDef.scaleMode ?? "dynamic"),
    scaleMin: safeMetricDef.scaleMin,
    scaleMax: safeMetricDef.scaleMax,
    pickerGroup: "classMetric",
    pickerClassId: safeClassId,
    pickerMetricId: metricId,
    pickerMetricLabel: metricLabel,
    pickerMetricShortLabel: metricShortLabel,
    getValue: (state, subject) =>
      getDetailedClassMetricValue(state, subject, safeClassId, metricId),
    getValueFromSnapshot: (snapshot, subject) =>
      getDetailedClassMetricValue(snapshot, subject, safeClassId, metricId),
    getValueFromSummary: (summary, subject) =>
      getSettlementGraphValueFromSummary(summary, `${metricId}:${safeClassId}`, subject),
    getLegendTooltipSpec: (state) =>
      safeMetricDef.getLegendTooltipSpec(state, safeClassId),
    formatValue: safeMetricDef.formatValue,
  };
}

function getSettlementClassMetricSeries(state) {
  const classIds = getSettlementGraphClassIds(state);
  const series = [];
  for (const metricDef of SETTLEMENT_CLASS_METRIC_DEFS) {
    classIds.forEach((classId, index) => {
      series.push(createSettlementClassMetricSeries(classId, index, metricDef));
    });
  }
  return series;
}

function getChaosReckoningValue(state, key) {
  const value = state?.civilization?.chaos?.lastMoonIncome?.[key];
  return Number.isFinite(value) ? Number(value) : 0;
}

function formatChaosReckoningValue(value) {
  if (!Number.isFinite(value)) return "0";
  return Number(value.toFixed(4)).toString();
}

function getChaosRawPressureTooltipSpec(state) {
  return {
    title: "Raw Chaos Pressure",
    lines: [
      `Latest Faith reckoning: ${formatChaosReckoningValue(getChaosReckoningValue(state, "rawPressure"))}`,
      "Primordial pressure plus recorded civilization losses, before resistance.",
      "Reckoned during Faith and held until the next Faith phase.",
    ],
  };
}

function getChaosResistanceTooltipSpec(state) {
  return {
    title: "Chaos Resistance",
    lines: [
      `Latest Faith reckoning: ${formatChaosReckoningValue(getChaosReckoningValue(state, "resistance"))}`,
      "Living population contributes resistance according to its Faith tier.",
      "Resistance only reduces new incoming Chaos; it never removes accumulated Chaos.",
    ],
  };
}

function createCivilizationClassMetricSeries(classId, classIndex, metricDef) {
  const series = createSettlementClassMetricSeries(classId, classIndex, metricDef);
  return {
    ...series,
    getValue: (state) =>
      getDetailedCivilizationClassMetricValue(state, classId, metricDef.id),
    getValueFromSnapshot: (snapshot) =>
      getDetailedCivilizationClassMetricValue(snapshot, classId, metricDef.id),
    getValueFromSummary: (summary) =>
      getCivilizationGraphValueFromSummary(summary, `${metricDef.id}:${classId}`),
  };
}

function getCivilizationClassMetricSeries(state) {
  const classIds = Object.keys(
    getDetailedCivilizationSummary(state)?.population?.byClass ?? {}
  );
  const resolvedClassIds = classIds.length
    ? classIds
    : DEFAULT_SETTLEMENT_GRAPH_CLASS_IDS;
  const series = [];
  for (const metricDef of SETTLEMENT_CLASS_METRIC_DEFS.slice(0, 2)) {
    resolvedClassIds.forEach((classId, index) => {
      series.push(createCivilizationClassMetricSeries(classId, index, metricDef));
    });
  }
  return series;
}

const LOCAL_SETTLEMENT_RESOURCE_SERIES = Object.freeze([
  {
    id: "totalPopulation",
    label: "Total Pop",
    color: SETTLEMENT_RESOURCE_COLOURS.totalPopulation,
    scaleGroupId: "settlementPopulation",
    scaleMode: "dynamic",
    scaleMin: 0,
    pickerGroup: "global",
    getValue: (state, subject) =>
      getDetailedPopulationSummary(state, getSettlementMetricRegionId(subject)).total,
    getValueFromSnapshot: (snapshot, subject) =>
      getDetailedPopulationSummary(snapshot, getSettlementMetricRegionId(subject)).total,
    getValueFromSummary: (summary, subject) =>
      getSettlementGraphValueFromSummary(summary, "totalPopulation", subject),
    getLegendTooltipSpec: (state) => getSettlementPopulationTooltipSpec(state),
    formatValue: (value) =>
      Number.isFinite(value) ? `${Math.floor(value)}` : "0",
  },
  {
    id: "food",
    label: "Food",
    color: SETTLEMENT_RESOURCE_COLOURS.food,
    scaleGroupId: "settlementFood",
    scaleMode: "dynamic",
    scaleMin: 0,
    pickerGroup: "global",
    getValue: (state, subject) => {
      const local = getDetailedSettlement(state, getSettlementMetricRegionId(subject));
      return (local?.storedFood ?? 0) + (local?.looseFood ?? 0);
    },
    getValueFromSnapshot: (snapshot, subject) => {
      const local = getDetailedSettlement(snapshot, getSettlementMetricRegionId(subject));
      return (local?.storedFood ?? 0) + (local?.looseFood ?? 0);
    },
    getValueFromSummary: (summary, subject) =>
      getSettlementGraphValueFromSummary(summary, "food", subject),
    getLegendTooltipSpec: (state) => getSettlementFoodTooltipSpec(state),
    formatValue: (value) =>
      Number.isFinite(value) ? `${Math.floor(value)}` : "0",
  },
]);

const CIVILIZATION_RESOURCE_SERIES = Object.freeze([
  {
    id: "totalPopulation",
    label: "Total Pop",
    color: SETTLEMENT_RESOURCE_COLOURS.totalPopulation,
    scaleGroupId: "settlementPopulation",
    scaleMode: "dynamic",
    scaleMin: 0,
    pickerGroup: "global",
    getValue: (state) => getDetailedCivilizationSummary(state).population.total,
    getValueFromSnapshot: (snapshot) =>
      getDetailedCivilizationSummary(snapshot).population.total,
    getValueFromSummary: (summary) =>
      getCivilizationGraphValueFromSummary(summary, "totalPopulation"),
    formatValue: (value) =>
      Number.isFinite(value) ? `${Math.floor(value)}` : "0",
  },
  {
    id: "food",
    label: "Food",
    color: SETTLEMENT_RESOURCE_COLOURS.food,
    scaleGroupId: "settlementFood",
    scaleMode: "dynamic",
    scaleMin: 0,
    pickerGroup: "global",
    getValue: (state) => getDetailedCivilizationSummary(state).food.total,
    getValueFromSnapshot: (snapshot) =>
      getDetailedCivilizationSummary(snapshot).food.total,
    getValueFromSummary: (summary) =>
      getCivilizationGraphValueFromSummary(summary, "food"),
    formatValue: (value) =>
      Number.isFinite(value) ? `${Math.floor(value)}` : "0",
  },
  {
    id: "chaosPower",
    label: "Chaos Power",
    color: 0xc96a52,
    scaleGroupId: "settlementChaosPower",
    scaleMode: "dynamic",
    scaleMin: 0,
    pickerGroup: "global",
    getValue: (state) => getSettlementChaosGodSummary(state, "redGod").chaosPower,
    getValueFromSnapshot: (snapshot) =>
      getSettlementChaosGodSummary(snapshot, "redGod").chaosPower,
    getValueFromSummary: (summary) =>
      getCivilizationGraphValueFromSummary(summary, "chaosPower"),
    getLegendTooltipSpec: (state) => getSettlementChaosPowerTooltipSpec(state),
    formatValue: (value) =>
      Number.isFinite(value) ? `${Math.floor(value)}` : "0",
  },
  {
    id: "chaosRawPressure",
    label: "Raw Pressure",
    color: 0xe89a55,
    scaleGroupId: "chaosReckoning",
    scaleMode: "dynamic",
    scaleMin: 0,
    pickerGroup: "global",
    getValue: (state) => getChaosReckoningValue(state, "rawPressure"),
    getValueFromSnapshot: (snapshot) =>
      getChaosReckoningValue(snapshot, "rawPressure"),
    getValueFromSummary: (summary) =>
      getCivilizationGraphValueFromSummary(summary, "chaosRawPressure"),
    getLegendTooltipSpec: (state) => getChaosRawPressureTooltipSpec(state),
    formatValue: formatChaosReckoningValue,
  },
  {
    id: "chaosResistance",
    label: "Chaos Resistance",
    color: 0x73c9c8,
    scaleGroupId: "chaosReckoning",
    scaleMode: "dynamic",
    scaleMin: 0,
    pickerGroup: "global",
    getValue: (state) => getChaosReckoningValue(state, "resistance"),
    getValueFromSnapshot: (snapshot) =>
      getChaosReckoningValue(snapshot, "resistance"),
    getValueFromSummary: (summary) =>
      getCivilizationGraphValueFromSummary(summary, "chaosResistance"),
    getLegendTooltipSpec: (state) => getChaosResistanceTooltipSpec(state),
    formatValue: formatChaosReckoningValue,
  },
  {
    id: "monsterCount",
    label: "Monsters",
    color: 0xb84e4e,
    scaleGroupId: "settlementMonsterCount",
    scaleMode: "dynamic",
    scaleMin: 0,
    pickerGroup: "global",
    getValue: (state) => getSettlementChaosGodSummary(state, "redGod").monsterCount,
    getValueFromSnapshot: (snapshot) =>
      getSettlementChaosGodSummary(snapshot, "redGod").monsterCount,
    getValueFromSummary: (summary) =>
      getCivilizationGraphValueFromSummary(summary, "monsterCount"),
    getLegendTooltipSpec: (state) => getSettlementMonstersTooltipSpec(state),
    formatValue: (value) =>
      Number.isFinite(value) ? `${Math.floor(value)}` : "0",
  },
]);

export const GRAPH_METRICS = {
  gold: {
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
  },
  grain: {
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
  },
  food: {
    id: "food",
    label: "Food",
    series: [
      {
        id: "food",
        label: "Food",
        color: SETTLEMENT_RESOURCE_COLOURS.food,
        getValue: (state, _subject) => {
          if (isSettlementPrototypeEnabled(state)) {
            return getSettlementTotalFood(state);
          }
          const base = state?.resources?.food ?? 0;
          const edible = getTotalFoodFromEdibles(state);
          const baseSafe = Number.isFinite(base) ? base : 0;
          const edibleSafe = Number.isFinite(edible) ? edible : 0;
          return baseSafe + edibleSafe;
        },
        getValueFromSnapshot: (snapshot, _subject) => {
          if (isSettlementPrototypeEnabled(snapshot)) {
            return getSettlementTotalFood(snapshot);
          }
          const base = snapshot?.resources?.food ?? 0;
          const edible = getTotalFoodFromEdibles(snapshot);
          const baseSafe = Number.isFinite(base) ? base : 0;
          const edibleSafe = Number.isFinite(edible) ? edible : 0;
          return baseSafe + edibleSafe;
        },
        formatValue: (value) =>
          Number.isFinite(value) ? value.toFixed(1) : "0.0",
      },
    ],
  },
  ap: {
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
  },
  population: {
    id: "population",
    label: "Population",
    series: [
      {
        id: "population",
        label: "Population",
        color: 0xb8a4ff,
        getValue: (state, _subject) =>
          isSettlementPrototypeEnabled(state)
            ? getSettlementPopulationSummary(state).total
            : state?.resources?.population ?? state?.population ?? 0,
        getValueFromSnapshot: (snapshot, _subject) =>
          isSettlementPrototypeEnabled(snapshot)
            ? getSettlementPopulationSummary(snapshot).total
            : snapshot?.resources?.population ?? snapshot?.population ?? 0,
        formatValue: (value) =>
          Number.isFinite(value) ? `${Math.floor(value)}` : "0",
      },
    ],
  },
  settlement: {
    id: "settlement",
    label: "Local",
    series: [
      ...LOCAL_SETTLEMENT_RESOURCE_SERIES,
      ...getSettlementClassMetricSeries(null),
    ],
    getSeries: (_subject, state) => [
      ...LOCAL_SETTLEMENT_RESOURCE_SERIES,
      ...getSettlementClassMetricSeries(state),
    ],
    getLabel: (subject, state) => {
      const regionId = getSettlementMetricRegionId(subject);
      const regionName = regionId
        ? getRegionDefinition(state, regionId)?.name ?? regionId
        : "No settlement";
      return `Local • ${regionName}`;
    },
    getSubjectKey: (subject) => getSettlementMetricRegionId(subject),
  },
  civilization: {
    id: "civilization",
    label: "Civilization • All player settlements",
    series: [
      ...CIVILIZATION_RESOURCE_SERIES,
      ...getCivilizationClassMetricSeries(null),
    ],
    getSeries: (_subject, state) => [
      ...CIVILIZATION_RESOURCE_SERIES,
      ...getCivilizationClassMetricSeries(state),
    ],
    getSubjectKey: () => "civilization",
  },
};

function mergeSeries(metrics) {
  const merged = [];
  const seen = new Set();
  for (const metric of metrics) {
    const series = Array.isArray(metric?.series) ? metric.series : [];
    for (const s of series) {
      if (!s || !s.id || seen.has(s.id)) continue;
      merged.push(s);
      seen.add(s.id);
    }
  }
  return merged;
}

GRAPH_METRICS.all = {
  id: "all",
  label: "All",
  series: mergeSeries([
    GRAPH_METRICS.gold,
    GRAPH_METRICS.grain,
    GRAPH_METRICS.food,
    GRAPH_METRICS.ap,
    GRAPH_METRICS.population,
    GRAPH_METRICS.civilization,
    GRAPH_METRICS.settlement,
  ]),
};

export function getGraphMetric(metricId) {
  return GRAPH_METRICS[metricId] || GRAPH_METRICS.gold;
}
