import { createProjectionCache } from "../../model/timegraph/projection-cache.js";
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

export function computeSettlementProjectionCacheConfig({
  horizonSec = 0,
  stepSec = SETTLEMENT_GRAPH_FORECAST_STEP_SEC,
  extraSec = SETTLEMENT_GRAPH_CACHE_SLACK_SEC,
} = {}) {
  const horizon = toNonNegativeSec(horizonSec, 0);
  const step = Math.max(1, toNonNegativeSec(stepSec, SETTLEMENT_GRAPH_FORECAST_STEP_SEC));
  const slack = Math.max(step, toNonNegativeSec(extraSec, SETTLEMENT_GRAPH_CACHE_SLACK_SEC));
  const requiredEntries =
    Math.ceil(horizon / step) + Math.ceil(slack / step) + 1;
  const requiredBytes =
    requiredEntries * Math.max(1, DEFAULT_STATE_DATA_ESTIMATE_BYTES);

  return {
    maxEntries: requiredEntries,
    maxBytes: Math.max(DEFAULT_PROJECTION_CACHE_MAX_BYTES * 2, requiredBytes),
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
} = {}) {
  if (zoomed === true) return null;

  const historyEnd = toNonNegativeSec(historyEndSec, 0);
  const cursor = toNonNegativeSec(cursorSec, historyEnd);
  const previewSec = Number.isFinite(forecastPreviewSec)
    ? toNonNegativeSec(forecastPreviewSec, historyEnd)
    : null;
  const horizon = toNonNegativeSec(horizonSec, 0);

  const realizedEndSec = Math.max(historyEnd, cursor);
  const visibleEndSec = Math.max(realizedEndSec, previewSec ?? realizedEndSec);

  return {
    minSec: 0,
    maxSec: Math.max(1, Math.max(visibleEndSec, realizedEndSec + horizon)),
    scrubSec: previewSec != null ? previewSec : cursor,
  };
}
