// Shared primitives: clone, food rounding, composition bins, moon-result shells.

import { POPULATION_CLASS_ORDER } from "../../defs/gamepieces/detailed-settlement-defs.js";

const FOOD_SCALE = 10000;

function getDetailedYearDurationSec(state) {
  const seasonCount = Array.isArray(state?.seasons) && state.seasons.length > 0
    ? state.seasons.length
    : 4;
  const seasonDurationSec = Number.isFinite(state?.seasonDurationSec)
    ? Math.max(1, Math.floor(state.seasonDurationSec))
    : 8;
  return seasonCount * seasonDurationSec;
}

export function getDetailedYearStartSec(state, year) {
  const safeYear = Number.isFinite(year) ? Math.max(1, Math.floor(year)) : 1;
  if (safeYear <= 1) return 0;
  // Seasonal clocks advance on fractional simulation ticks. The annual stage
  // therefore observes a completed nominal year on the following whole second.
  return (safeYear - 1) * getDetailedYearDurationSec(state) + 1;
}

export function roundFood(value) {
  return Math.max(0, Math.round((Number(value) || 0) * FOOD_SCALE) / FOOD_SCALE);
}

export function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function eldersCount(classState) {
  return (classState?.eldersByAge ?? []).reduce(
    (sum, cohort) => sum + Math.max(0, Math.floor(cohort?.count ?? 0)),
    0
  );
}

export function classPopulationTotal(classState) {
  return Math.max(0, Math.floor(classState?.children ?? 0))
    + Math.max(0, Math.floor(classState?.adults ?? 0))
    + eldersCount(classState);
}

export function emptyPopulationComposition() {
  return Object.fromEntries(POPULATION_CLASS_ORDER.map((classId) => [classId, {
    children: 0,
    adults: 0,
    eldersByAge: [],
  }]));
}

export function clonePopulationComposition(composition) {
  const result = emptyPopulationComposition();
  for (const classId of POPULATION_CLASS_ORDER) {
    const source = composition?.[classId] ?? {};
    result[classId] = {
      children: Math.max(0, Math.floor(source.children ?? 0)),
      adults: Math.max(0, Math.floor(source.adults ?? 0)),
      eldersByAge: (source.eldersByAge ?? []).map((cohort) => ({
        age: Math.max(0, Math.floor(cohort?.age ?? 0)),
        count: Math.max(0, Math.floor(cohort?.count ?? 0)),
      })).filter((cohort) => cohort.count > 0),
    };
  }
  return result;
}

export function compositionBins(composition) {
  const bins = [];
  for (const [classIndex, classId] of POPULATION_CLASS_ORDER.entries()) {
    const cohort = composition?.[classId] ?? {};
    bins.push({ classId, kind: "children", age: null, count: cohort.children ?? 0, order: classIndex * 1000 });
    bins.push({ classId, kind: "adults", age: null, count: cohort.adults ?? 0, order: classIndex * 1000 + 1 });
    for (const [ageIndex, elder] of [...(cohort.eldersByAge ?? [])]
      .sort((a, b) => a.age - b.age).entries()) {
      bins.push({
        classId,
        kind: "elder",
        age: elder.age,
        count: elder.count,
        order: classIndex * 1000 + 2 + ageIndex,
      });
    }
  }
  return bins.filter((bin) => bin.count > 0);
}

export function compositionFromBins(bins) {
  const result = emptyPopulationComposition();
  for (const bin of bins) {
    if (!result[bin.classId] || bin.count <= 0) continue;
    if (bin.kind === "children") result[bin.classId].children += bin.count;
    else if (bin.kind === "adults") result[bin.classId].adults += bin.count;
    else result[bin.classId].eldersByAge.push({ age: bin.age, count: bin.count });
  }
  for (const classId of POPULATION_CLASS_ORDER) {
    const merged = new Map();
    for (const cohort of result[classId].eldersByAge) {
      merged.set(cohort.age, (merged.get(cohort.age) ?? 0) + cohort.count);
    }
    result[classId].eldersByAge = [...merged.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([age, count]) => ({ age, count }));
  }
  return result;
}

export function compositionTotal(composition) {
  return compositionBins(composition).reduce((sum, bin) => sum + bin.count, 0);
}

export function selectPopulationComposition(settlement, classIds, requestedCount) {
  const source = emptyPopulationComposition();
  for (const classId of classIds) {
    const classState = settlement?.populationByClass?.[classId];
    if (!classState) continue;
    source[classId] = {
      children: Math.max(0, Math.floor(classState.children ?? 0)),
      adults: Math.max(0, Math.floor(classState.adults ?? 0)),
      eldersByAge: (classState.eldersByAge ?? []).map((cohort) => ({
        age: cohort.age,
        count: Math.max(0, Math.floor(cohort.count ?? 0)),
      })),
    };
  }
  const bins = compositionBins(source);
  const available = bins.reduce((sum, bin) => sum + bin.count, 0);
  const target = Math.min(available, Math.max(0, Math.floor(requestedCount)));
  if (target <= 0 || available <= 0) return emptyPopulationComposition();
  const allocations = bins.map((bin) => {
    const exact = target * bin.count / available;
    const count = Math.min(bin.count, Math.floor(exact));
    return { ...bin, count, remainder: exact - count, capacity: bin.count };
  });
  let remaining = target - allocations.reduce((sum, bin) => sum + bin.count, 0);
  for (const bin of [...allocations].sort((a, b) =>
    b.remainder - a.remainder || a.order - b.order)) {
    if (remaining <= 0) break;
    if (bin.count >= bin.capacity) continue;
    bin.count += 1;
    remaining -= 1;
  }
  return compositionFromBins(allocations);
}

export function createMoonRegionResult(regionId) {
  return {
    regionId,
    birth: null,
    food: null,
    housing: null,
    faith: null,
    migration: null,
    death: null,
    currencySpent: 0,
  };
}

export function ensureMoonRegionResult(turn, regionId) {
  if (!turn.regions[regionId]) {
    turn.regions[regionId] = createMoonRegionResult(regionId);
  }
  return turn.regions[regionId];
}
