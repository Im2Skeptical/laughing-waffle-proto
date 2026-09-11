import { computeGraphSeriesScaleRanges } from "../timegraphs-helpers.js";

export function mergeStickySeriesScaleRanges(
  previousRanges,
  nextRanges,
  seriesList = []
) {
  if (!(previousRanges instanceof Map) || !(nextRanges instanceof Map)) {
    return nextRanges instanceof Map ? nextRanges : new Map();
  }
  const merged = new Map(nextRanges);
  for (const seriesDef of Array.isArray(seriesList) ? seriesList : []) {
    const seriesId = String(seriesDef?.id ?? "");
    if (!seriesId) continue;
    const previousRange = previousRanges.get(seriesId);
    const nextRange = merged.get(seriesId);
    if (!previousRange || !nextRange) continue;
    merged.set(seriesId, {
      ...nextRange,
      minValue: Number.isFinite(previousRange.minValue)
        ? previousRange.minValue
        : nextRange.minValue,
      maxValue:
        Number.isFinite(previousRange.maxValue) &&
        Number.isFinite(nextRange.maxValue)
          ? Math.max(previousRange.maxValue, nextRange.maxValue)
          : Number.isFinite(previousRange.maxValue)
            ? previousRange.maxValue
            : nextRange.maxValue,
    });
  }
  return merged;
}

export function applyStickyScaleRangeSources(nextRanges, seriesList = [], sources = []) {
  let merged = nextRanges instanceof Map ? nextRanges : new Map();
  for (const source of Array.isArray(sources) ? sources : []) {
    if (!(source instanceof Map)) continue;
    merged = mergeStickySeriesScaleRanges(source, merged, seriesList);
  }
  return merged;
}

export function buildSeriesValuesForVisibleScaleRange(
  points,
  seriesValues,
  seriesList,
  visibleEndSec
) {
  const list = Array.isArray(seriesList) ? seriesList : [];
  const pointList = Array.isArray(points) ? points : [];
  const sourceValues =
    seriesValues instanceof Map ? seriesValues : new Map();
  const scaleEnd = Number.isFinite(visibleEndSec)
    ? Math.max(0, Number(visibleEndSec))
    : Number.POSITIVE_INFINITY;
  const out = new Map();

  for (const seriesDef of list) {
    const seriesId = String(seriesDef?.id ?? "");
    if (!seriesId) continue;
    const values = sourceValues.get(seriesId);
    const scaleValues = [];
    let previousT = null;
    let previousValue = null;

    for (let i = 0; i < pointList.length; i++) {
      const point = pointList[i];
      const t = Math.max(0, Math.floor(point?.tSec ?? 0));
      const value = Array.isArray(values) ? values[i] : null;

      if (!Number.isFinite(value)) {
        if (t <= scaleEnd) {
          previousT = null;
          previousValue = null;
        }
        continue;
      }

      if (t <= scaleEnd) {
        scaleValues.push(value);
        previousT = t;
        previousValue = value;
        continue;
      }

      if (
        Number.isFinite(previousT) &&
        Number.isFinite(previousValue) &&
        scaleEnd > previousT
      ) {
        const ratio = (scaleEnd - previousT) / Math.max(1e-6, t - previousT);
        scaleValues.push(previousValue + (value - previousValue) * ratio);
      }
      break;
    }

    out.set(seriesId, scaleValues);
  }

  return out;
}

export function computeSeriesScaleRangesForReveal(
  seriesList,
  points,
  seriesValues,
  visibleEndSec,
  freezeScaleMaxDuringReveal = false
) {
  const scaleValues = freezeScaleMaxDuringReveal
    ? buildSeriesValuesForVisibleScaleRange(
        points,
        seriesValues,
        seriesList,
        visibleEndSec
      )
    : seriesValues;
  return computeGraphSeriesScaleRanges(seriesList, scaleValues, {
    defaultMin: 0,
    defaultMax: 100,
  });
}

export function computeVisibleSeriesMaxValues(
  points,
  seriesValues,
  seriesList,
  visibleEndSec
) {
  const list = Array.isArray(seriesList) ? seriesList : [];
  const pointList = Array.isArray(points) ? points : [];
  const sourceValues =
    seriesValues instanceof Map ? seriesValues : new Map();
  const scaleEnd = Number.isFinite(visibleEndSec)
    ? Math.max(0, Number(visibleEndSec))
    : Number.POSITIVE_INFINITY;
  const out = new Map();

  for (const seriesDef of list) {
    const seriesId = String(seriesDef?.id ?? "");
    if (!seriesId) continue;
    const values = sourceValues.get(seriesId);
    let maxValue = -Infinity;
    let previousT = null;
    let previousValue = null;

    for (let i = 0; i < pointList.length; i++) {
      const point = pointList[i];
      const t = Math.max(0, Math.floor(point?.tSec ?? 0));
      const value = Array.isArray(values) ? values[i] : null;

      if (!Number.isFinite(value)) {
        if (t <= scaleEnd) {
          previousT = null;
          previousValue = null;
        }
        continue;
      }

      if (t <= scaleEnd) {
        maxValue = Math.max(maxValue, value);
        previousT = t;
        previousValue = value;
        continue;
      }

      if (
        Number.isFinite(previousT) &&
        Number.isFinite(previousValue) &&
        scaleEnd > previousT
      ) {
        const ratio = (scaleEnd - previousT) / Math.max(1e-6, t - previousT);
        const edgeValue = previousValue + (value - previousValue) * ratio;
        maxValue = Math.max(maxValue, edgeValue);
      }
      break;
    }

    out.set(seriesId, maxValue);
  }

  return out;
}
