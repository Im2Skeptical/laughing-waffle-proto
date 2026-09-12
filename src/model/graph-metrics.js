// src/model/graph-metrics.js
// Metric definitions for time graphs.

import { getSettlementChaosGodSummary } from "./settlement-chaos.js";
import { getSettlementClassIds } from "./settlement-state.js";
import { getRegionDefinition } from "./world-state.js";
import {
  assignDetailedSettlementWorkers,
  getDetailedCivilizationSummary,
  getDetailedSettlementSites,
  getDetailedSettlement,
  getPopulationSummary as getDetailedPopulationSummary,
} from "./detailed-settlements.js";
import { LEGACY_GRAPH_METRICS } from "./graph-metrics/legacy-metrics.js";
import {
  formatChaosReckoningValue,
  formatClassLabel,
  getChaosRawPressureTooltipSpec,
  getChaosReckoningValue,
  getChaosResistanceTooltipSpec,
  getSettlementChaosPowerTooltipSpec,
  getSettlementFaithTooltipSpec,
  getSettlementFoodTooltipSpec,
  getSettlementFreePopulationTooltipSpec,
  getSettlementHappinessTooltipSpec,
  getSettlementMonstersTooltipSpec,
  getSettlementPopulationTooltipSpec,
} from "./graph-metrics/tooltips.js";

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
    getLegendTooltipSpec: (state, classId) =>
      getSettlementHappinessTooltipSpec(state, classId),
    formatValue: (value) =>
      value >= 75 ? "Positive" : value <= 25 ? "Negative" : "Neutral",
  },
]);

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
    label: "Chaos Pressure",
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
    scaleMode: "fixed",
    scaleMin: 0,
    scaleMax: 100,
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

// Read-only metrics share the same selectors for live state, replay snapshots,
// and retained forecast summaries.
function createResourceGraphSeries({ id, label, color, scaleGroupId, read, local = false }) {
  return {
    id, label, color, scaleGroupId, scaleMode: "dynamic", scaleMin: 0,
    pickerGroup: "global", getValue: read, getValueFromSnapshot: read,
    getValueFromSummary: (summary, subject) => local
      ? getSettlementGraphValueFromSummary(summary, id, subject)
      : getCivilizationGraphValueFromSummary(summary, id),
    formatValue: (value) => Number.isFinite(value) ? `${Math.floor(value)}` : "0",
  };
}

const GOLD_GRAPH_SERIES = createResourceGraphSeries({
  id: "gold", label: "Gold", color: 0xc99d35, scaleGroupId: "gold",
  read: (state) => getDetailedSettlementSites(state, { playerOnly: true })
    .reduce((total, site) => total + Math.max(0, site.detailedState?.currency ?? 0), 0),
});
const LOCAL_GOLD_GRAPH_SERIES = createResourceGraphSeries({
  id: "gold", label: "Gold", color: 0xc99d35, scaleGroupId: "gold", local: true,
  read: (state, subject) => Math.max(0, getDetailedSettlement(state, getSettlementMetricRegionId(subject))?.currency ?? 0),
});
const CIVILIZATION_HOUSING_SERIES = createResourceGraphSeries({
  id: "civilizationHousingCapacity", label: "Civ Housing", color: 0x936445,
  scaleGroupId: "settlementPopulation",
  read: (state) => getDetailedCivilizationSummary(state).population.housingCapacity,
});
const LOCAL_HOUSING_SERIES = createResourceGraphSeries({
  id: "housingCapacity", label: "Local Housing", color: 0x877650,
  scaleGroupId: "settlementPopulation", local: true,
  read: (state, subject) => getDetailedPopulationSummary(state, getSettlementMetricRegionId(subject)).housingCapacity,
});

function getLocalCivilizationSeries() {
  return [
    ...CIVILIZATION_RESOURCE_SERIES.filter((series) => series.id.startsWith("chaos") || series.id === "monsterCount"),
    LOCAL_GOLD_GRAPH_SERIES, CIVILIZATION_HOUSING_SERIES, LOCAL_HOUSING_SERIES,
  ];
}

export const GRAPH_METRICS = {
  ...LEGACY_GRAPH_METRICS,
  settlement: {
    id: "settlement",
    label: "Local",
    series: [
      ...LOCAL_SETTLEMENT_RESOURCE_SERIES,
      ...getLocalCivilizationSeries(),
      ...getSettlementClassMetricSeries(null),
    ],
    getSeries: (_subject, state) => [
      ...LOCAL_SETTLEMENT_RESOURCE_SERIES,
      ...getLocalCivilizationSeries(),
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
      GOLD_GRAPH_SERIES, CIVILIZATION_HOUSING_SERIES,
      ...getCivilizationClassMetricSeries(null),
    ],
    getSeries: (_subject, state) => [
      ...CIVILIZATION_RESOURCE_SERIES,
      GOLD_GRAPH_SERIES, CIVILIZATION_HOUSING_SERIES,
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
