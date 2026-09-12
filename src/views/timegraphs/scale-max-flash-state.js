import { SERIES_SCALE_MAX_FLASH_DURATION_MS } from "./constants.js";

export function createSeriesScaleMaxFlashState() {
  return {
    bySeriesId: new Map(),
  };
}

export function clearSeriesScaleMaxFlash(state) {
  state.bySeriesId.clear();
}

export function triggerSeriesScaleMaxFlash(
  state,
  {
    previousRanges,
    nextRanges,
    visibleMaxValues,
    nowMs = performance.now(),
  } = {}
) {
  if (
    !(previousRanges instanceof Map) ||
    !(nextRanges instanceof Map) ||
    !(visibleMaxValues instanceof Map)
  ) {
    return false;
  }

  let triggered = false;
  for (const [seriesId, nextRange] of nextRanges.entries()) {
    const previousRange = previousRanges.get(seriesId);
    const previousMax = Number(previousRange?.maxValue);
    const nextMax = Number(nextRange?.maxValue);
    const visibleMax = Number(visibleMaxValues.get(seriesId));
    if (
      !Number.isFinite(previousMax) ||
      !Number.isFinite(nextMax) ||
      !Number.isFinite(visibleMax) ||
      nextMax <= previousMax + 1e-6 ||
      visibleMax < nextMax - 1e-6
    ) {
      continue;
    }
    state.bySeriesId.set(seriesId, {
      startedMs: nowMs,
      durationMs: SERIES_SCALE_MAX_FLASH_DURATION_MS,
    });
    triggered = true;
  }

  return triggered;
}
