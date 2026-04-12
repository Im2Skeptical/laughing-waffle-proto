import { createProjectionCache } from "../../model/timegraph/projection-cache.js";
import {
  SEASON_DURATION_SEC,
  SETTLEMENT_FORECAST_CACHE_YEARS,
  SETTLEMENT_LOSS_SEARCH_YEARS,
} from "../../defs/gamesettings/gamerules-defs.js";
import {
  DEFAULT_PROJECTION_CACHE_MAX_BYTES,
  DEFAULT_STATE_DATA_ESTIMATE_BYTES,
} from "../../model/timegraph/constants.js";

function toNonNegativeSec(value, fallback = 0) {
  if (!Number.isFinite(value)) {
    return Math.max(0, Math.floor(fallback));
  }
  return Math.max(0, Math.floor(value));
}

export const SETTLEMENT_GRAPH_FORECAST_STEP_SEC = 1;
export const SETTLEMENT_GRAPH_CACHE_SLACK_SEC = 512;
const SETTLEMENT_GRAPH_MIN_CACHE_BYTES = 512 * 1024 * 1024;
export const SETTLEMENT_GRAPH_FORECAST_CACHE_CAPACITY_SEC =
  Math.max(1, Math.floor(SEASON_DURATION_SEC)) *
  4 *
  Math.max(1, Math.floor(SETTLEMENT_FORECAST_CACHE_YEARS));
export const SETTLEMENT_GRAPH_LOSS_SEARCH_CAPACITY_SEC =
  Math.max(1, Math.floor(SEASON_DURATION_SEC)) *
  4 *
  Math.max(1, Math.floor(SETTLEMENT_LOSS_SEARCH_YEARS));

export function computeSettlementProjectionCacheConfig({
  horizonSec = 0,
  stepSec = SETTLEMENT_GRAPH_FORECAST_STEP_SEC,
  extraSec = SETTLEMENT_GRAPH_CACHE_SLACK_SEC,
} = {}) {
  const horizon = toNonNegativeSec(horizonSec, 0);
  const step = Math.max(1, toNonNegativeSec(stepSec, SETTLEMENT_GRAPH_FORECAST_STEP_SEC));
  const slack = Math.max(step, toNonNegativeSec(extraSec, SETTLEMENT_GRAPH_CACHE_SLACK_SEC));
  // Settlement graphs can temporarily expand beyond the default 40-year window to cover
  // an entire current-vassal lifespan. Keep enough contiguous forecast state cached so
  // early sampled seconds are not evicted after a sync browse to a late death second.
  const requiredForecastCapacitySec = Math.max(
    horizon,
    SETTLEMENT_GRAPH_FORECAST_CACHE_CAPACITY_SEC
  );
  const requiredEntries =
    Math.ceil(requiredForecastCapacitySec / step) + Math.ceil(slack / step) + 1;
  const requiredBytes =
    requiredEntries * Math.max(1, DEFAULT_STATE_DATA_ESTIMATE_BYTES);

  return {
    maxEntries: requiredEntries,
    maxBytes: Math.max(
      SETTLEMENT_GRAPH_MIN_CACHE_BYTES,
      DEFAULT_PROJECTION_CACHE_MAX_BYTES * 2,
      requiredBytes
    ),
  };
}

export function createSettlementProjectionCache(opts = {}) {
  return createProjectionCache(computeSettlementProjectionCacheConfig(opts));
}

export function computeSettlementGraphWindowSpec({
  historyEndSec,
  cursorSec,
  forecastPreviewSec = null,
  horizonSec = 0,
  zoomed = false,
  lineageStartSec = null,
  currentVassalStartSec = null,
  projectedLossSec = null,
} = {}) {
  const historyEnd = toNonNegativeSec(historyEndSec, 0);
  const cursor = toNonNegativeSec(cursorSec, historyEnd);
  const previewSec = Number.isFinite(forecastPreviewSec)
    ? toNonNegativeSec(forecastPreviewSec, historyEnd)
    : null;
  const horizon = toNonNegativeSec(horizonSec, 0);
  const safeLineageStartSec = Number.isFinite(lineageStartSec)
    ? toNonNegativeSec(lineageStartSec, 0)
    : null;
  const safeCurrentVassalStartSec = Number.isFinite(currentVassalStartSec)
    ? toNonNegativeSec(currentVassalStartSec, safeLineageStartSec ?? 0)
    : null;
  const safeProjectedLossSec = Number.isFinite(projectedLossSec)
    ? toNonNegativeSec(projectedLossSec, 0)
    : null;

  const realizedEndSec = Math.max(historyEnd, cursor);
  const visibleEndSec = Math.max(realizedEndSec, previewSec ?? realizedEndSec);

  if (safeProjectedLossSec != null && safeProjectedLossSec > 0) {
    const minSec = zoomed === true
      ? safeCurrentVassalStartSec ?? safeLineageStartSec ?? 0
      : 0;
    const maxSec = Math.max(minSec + 1, safeProjectedLossSec);
    const preferredScrubSec = previewSec != null ? previewSec : cursor;
    return {
      minSec,
      maxSec,
      scrubSec: Math.max(minSec, Math.min(maxSec, preferredScrubSec)),
    };
  }

  if (zoomed === true) return null;

  return {
    minSec: 0,
    maxSec: Math.max(1, Math.max(visibleEndSec, realizedEndSec + horizon)),
    scrubSec: previewSec != null ? previewSec : cursor,
  };
}
