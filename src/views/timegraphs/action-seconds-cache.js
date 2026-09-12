import {
  getActionSecondsInRange,
  getActionSecondsInRangeSampled,
} from "../../model/timeline/index.js";

export function createActionSecondsCache() {
  return {
    cachedActionSecs: [],
    lastActionSecondsVersion: null,
    lastActionRangeKey: "",
    cachedMarkerActionSecs: [],
    lastMarkerActionSecondsVersion: null,
    lastMarkerRangeKey: "",
    lastMarkerCap: 0,
  };
}

export function getActionSecs(cache, timeline, startSec, endSec) {
  const actionSecondsVersion = Math.floor(timeline?._actionSecondsVersion ?? -1);
  const start = Math.max(0, Math.floor(startSec ?? 0));
  const end = Math.max(0, Math.floor(endSec ?? 0));
  const rangeKey = `${start}:${end}`;
  if (
    actionSecondsVersion !== cache.lastActionSecondsVersion ||
    rangeKey !== cache.lastActionRangeKey
  ) {
    cache.lastActionSecondsVersion = actionSecondsVersion;
    cache.lastActionRangeKey = rangeKey;
    cache.cachedActionSecs = getActionSecondsInRange(timeline, start, end, {
      copy: false,
    });
  }
  return cache.cachedActionSecs;
}

export function getMarkerActionSecs(cache, timeline, startSec, endSec, markerCap) {
  const actionSecondsVersion = Math.floor(timeline?._actionSecondsVersion ?? -1);
  const start = Math.max(0, Math.floor(startSec ?? 0));
  const end = Math.max(0, Math.floor(endSec ?? 0));
  const rangeKey = `${start}:${end}`;
  const cap = Math.max(64, Math.floor(markerCap ?? 64));
  if (
    actionSecondsVersion !== cache.lastMarkerActionSecondsVersion ||
    rangeKey !== cache.lastMarkerRangeKey ||
    cap !== cache.lastMarkerCap
  ) {
    cache.lastMarkerActionSecondsVersion = actionSecondsVersion;
    cache.lastMarkerRangeKey = rangeKey;
    cache.lastMarkerCap = cap;
    cache.cachedMarkerActionSecs = getActionSecondsInRangeSampled(
      timeline,
      start,
      end,
      cap * 2,
      { copy: false }
    );
  }
  return cache.cachedMarkerActionSecs;
}
