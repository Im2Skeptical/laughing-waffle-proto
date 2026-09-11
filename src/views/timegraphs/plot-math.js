import {
  ACTION_SNAP_THRESHOLD_SEC,
  MAX_ACTION_MARKERS_DENSITY,
} from "./constants.js";

export function clampInt(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v | 0));
}

export function getGridStep(rangeSec, targetLines = 12) {
  const range = Math.max(1, Math.floor(rangeSec));
  const rough = range / Math.max(1, targetLines);
  const pow10 = Math.pow(10, Math.floor(Math.log10(rough)));
  const candidates = [1, 2, 5, 10];
  let step = candidates[candidates.length - 1] * pow10;
  for (const c of candidates) {
    const s = c * pow10;
    if (s >= rough) {
      step = s;
      break;
    }
  }
  return Math.max(1, Math.round(step));
}

export function timeToX(t, minSec, maxSec, plot) {
  const ratio = (t - minSec) / Math.max(1, maxSec - minSec);
  return plot.x + ratio * plot.w;
}

export function yForValue(v, seriesId, seriesScaleRanges, plot) {
  const scaleRange = seriesScaleRanges.get(seriesId) ?? null;
  const minValue = Number.isFinite(scaleRange?.minValue)
    ? scaleRange.minValue
    : 0;
  const maxValue = Number.isFinite(scaleRange?.maxValue)
    ? scaleRange.maxValue
    : 100;
  const tRaw = (v - minValue) / Math.max(1e-6, maxValue - minValue);
  const t = Math.max(0, Math.min(1, tRaw));
  // Keep min/max-aligned series inside the plot rect so long zero plateaus
  // do not disappear into the panel border during forecast reveal.
  const drawableHeight = Math.max(1, plot.h - 2);
  return plot.y + 1 + (1 - t) * drawableHeight;
}

export function getMarkerSeconds(
  actionSecs,
  plotW,
  density = MAX_ACTION_MARKERS_DENSITY
) {
  const list = Array.isArray(actionSecs) ? actionSecs : [];
  if (!list.length) return [];
  const maxMarkers = Math.max(64, Math.floor(plotW * density));
  if (list.length <= maxMarkers) return list;

  const stride = Math.max(1, Math.ceil(list.length / maxMarkers));
  const sampled = [];
  for (let i = 0; i < list.length; i += stride) {
    sampled.push(list[i]);
  }
  const last = list[list.length - 1];
  if (sampled[sampled.length - 1] !== last) {
    sampled.push(last);
  }
  return sampled;
}

export function applyActionSnap(
  t,
  list,
  thresholdSec = ACTION_SNAP_THRESHOLD_SEC
) {
  if (!list.length) return t;

  let lo = 0;
  let hi = list.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const val = list[mid];
    if (val < t) lo = mid + 1;
    else if (val > t) hi = mid - 1;
    else return val;
  }

  const candidates = [];
  if (lo >= 0 && lo < list.length) candidates.push(list[lo]);
  if (hi >= 0 && hi < list.length) candidates.push(list[hi]);

  let best = t;
  let bestDist = Infinity;
  for (const c of candidates) {
    const dist = Math.abs(c - t);
    if (dist < bestDist) {
      bestDist = dist;
      best = c;
    }
  }

  return bestDist <= thresholdSec ? best : t;
}
