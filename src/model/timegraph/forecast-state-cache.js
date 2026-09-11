// src/model/timegraph/forecast-state-cache.js
// Forecast/history cache helpers used by createTimeGraphController.
// Mechanical extract of pure map writes, purges, retained-anchor rebuild,
// coverage reads, and subject-value cache maintenance. Invalidation policy,
// sampling signatures, throttle, and forecast follow stay in the controller.

import { buildProjectionStateWindowFromStateData } from "../projection.js";
import { getActionSecondsInRange } from "../timeline/index.js";
import { clampSec } from "./utils.js";

const SUBJECT_VALUE_CACHE_MAX = 5000;
const SUBJECT_VALUE_CACHE_COMPACT_THRESHOLD = 1024;

export function shouldSampleHistory(sec, frontierSec, strideSec) {
  if (sec === frontierSec) return true;
  return sec % strideSec === 0;
}

export function cacheForecastStateData(stateDataByBoundary, sec, historyEndSec, stateData) {
  if (!(stateDataByBoundary instanceof Map) || stateData == null) return;
  const targetSec = clampSec(sec);
  stateDataByBoundary.set(targetSec, stateData);
}

export function purgePastStateData(stateDataByBoundary, historyEndSec) {
  if (!(stateDataByBoundary instanceof Map)) return;
  const cutoff = clampSec(historyEndSec);
  for (const sec of stateDataByBoundary.keys()) {
    if (clampSec(sec) <= cutoff) {
      stateDataByBoundary.delete(sec);
    }
  }
}

export function findNearestForecastAnchorSec(stateDataByBoundary, targetSec, historyEndSec) {
  if (!(stateDataByBoundary instanceof Map)) return null;
  const target = clampSec(targetSec);
  const historyEnd = clampSec(historyEndSec);
  let nearestSec = null;
  for (const secRaw of stateDataByBoundary.keys()) {
    const sec = clampSec(secRaw);
    if (sec <= historyEnd || sec > target) continue;
    if (nearestSec == null || sec > nearestSec) {
      nearestSec = sec;
    }
  }
  return nearestSec;
}

export function deleteMapEntriesAtOrAfter(map, startSec) {
  if (!(map instanceof Map)) return;
  const start = clampSec(startSec);
  for (const secRaw of map.keys()) {
    if (clampSec(secRaw) >= start) {
      map.delete(secRaw);
    }
  }
}

export function getEffectiveForecastCoverageEndSec(tl, projection, asyncForecastStepSec) {
  const historyEndSec = clampSec(tl?.historyEndSec ?? 0);
  const meta = projection.getForecastMeta?.() ?? null;
  const timelineToken = projection.getTimelineToken?.(tl) ?? null;
  if (!meta || typeof timelineToken !== "string") {
    return historyEndSec;
  }

  let coverageEndSec = historyEndSec;
  if (
    meta.forecastAsyncToken === timelineToken &&
    clampSec(meta.forecastAsyncStepSec) === asyncForecastStepSec
  ) {
    coverageEndSec = Math.max(
      coverageEndSec,
      clampSec(meta.forecastAsyncEndSec)
    );
  }
  if (
    clampSec(meta.forecastBaseSec) <= historyEndSec &&
    clampSec(meta.forecastEndSec) > historyEndSec
  ) {
    coverageEndSec = Math.max(
      coverageEndSec,
      clampSec(meta.forecastEndSec)
    );
  }
  return coverageEndSec;
}

export function getPublishedForecastCoverageEndSec(
  tl,
  graphCache,
  projection,
  asyncForecastStepSec
) {
  const historyEndSec = clampSec(tl?.historyEndSec ?? 0);
  return Math.max(
    historyEndSec,
    getEffectiveForecastCoverageEndSec(tl, projection, asyncForecastStepSec),
    clampSec(graphCache?.window?.forecastCoverageEndSec ?? historyEndSec)
  );
}

export function tryBuildForecastStateDataFromRetainedAnchor(
  stateDataByBoundary,
  projection,
  sec,
  historyEndSec,
  tl = null
) {
  const targetSec = clampSec(sec);
  const frontierSec = clampSec(historyEndSec);
  const anchorSec = findNearestForecastAnchorSec(
    stateDataByBoundary,
    targetSec,
    frontierSec
  );
  if (anchorSec == null) return null;
  if (tl) {
    const actionSecs = getActionSecondsInRange(tl, anchorSec + 1, targetSec, {
      copy: false,
    });
    if (Array.isArray(actionSecs) && actionSecs.length > 0) return null;
  }

  const anchorStateData =
    stateDataByBoundary?.get?.(anchorSec) ?? null;
  const deltaSec = targetSec - anchorSec;
  if (anchorStateData == null || deltaSec < 0) return null;
  if (deltaSec === 0) {
    return anchorStateData;
  }

  const win = buildProjectionStateWindowFromStateData(
    anchorStateData,
    anchorSec,
    { horizonSec: deltaSec }
  );
  if (!win?.ok) return null;

  let rebuiltStateData = null;
  for (const [builtSec, builtStateData] of win.stateDataBySecond.entries()) {
    if (builtSec <= anchorSec || builtSec > targetSec) continue;
    cacheForecastStateData(
      stateDataByBoundary,
      builtSec,
      frontierSec,
      builtStateData
    );
    projection.setStateData?.(builtSec, builtStateData);
    if (builtSec === targetSec) {
      rebuiltStateData = builtStateData;
    }
  }

  return rebuiltStateData;
}

export function buildScheduledActionsBySecond(tl, startSec, endSec) {
  const start = clampSec(startSec);
  const end = clampSec(endSec);
  if (!tl || end <= start) return [];
  const actionSecs = getActionSecondsInRange(tl, start + 1, end, {
    copy: false,
  });
  if (!Array.isArray(actionSecs) || !actionSecs.length) return [];

  const out = [];
  for (const sec of actionSecs) {
    const actions =
      tl.actionsBySec && typeof tl.actionsBySec.get === "function"
        ? tl.actionsBySec.get(sec)
        : null;
    if (!Array.isArray(actions) || !actions.length) continue;
    out.push({
      tSec: sec,
      actions: actions.map((action) => ({ ...action, tSec: sec })),
    });
  }
  return out;
}

export function invalidateSubjectValuesFromSec(subjectValueCache, startSec) {
  const cutoff = clampSec(startSec);
  for (const entry of subjectValueCache.values()) {
    const valuesBySec = entry?.valuesBySec;
    const order = entry?.order;
    if (!(valuesBySec instanceof Map) || !Array.isArray(order)) continue;
    const rawHead = Number.isFinite(entry?.orderHead)
      ? Math.floor(entry.orderHead)
      : 0;
    const head = Math.max(0, Math.min(order.length, rawHead));
    for (const sec of valuesBySec.keys()) {
      if (clampSec(sec) >= cutoff) {
        valuesBySec.delete(sec);
      }
    }
    const nextOrder = [];
    for (let i = head; i < order.length; i++) {
      const sec = clampSec(order[i]);
      if (sec >= cutoff) continue;
      if (!valuesBySec.has(sec)) continue;
      nextOrder.push(sec);
    }
    entry.order = nextOrder;
    entry.orderHead = 0;
  }
}

export function pushSubjectValueSec(entry, sec, valuesBySec) {
  if (!entry || !(valuesBySec instanceof Map)) return;
  if (!Array.isArray(entry.order)) entry.order = [];
  if (!Number.isFinite(entry.orderHead)) entry.orderHead = 0;

  let head = Math.max(0, Math.floor(entry.orderHead));
  if (head > entry.order.length) head = entry.order.length;
  entry.order.push(sec);

  while (entry.order.length - head > SUBJECT_VALUE_CACHE_MAX) {
    const oldest = entry.order[head];
    head += 1;
    if (oldest != null) valuesBySec.delete(oldest);
  }

  if (
    head >= SUBJECT_VALUE_CACHE_COMPACT_THRESHOLD &&
    head * 2 >= entry.order.length
  ) {
    entry.order = entry.order.slice(head);
    head = 0;
  }

  entry.orderHead = head;
}

export function pruneHistoryAfterSec(graphCache, limitSec) {
  if (!graphCache) return;
  const limit = clampSec(limitSec);
  const history = Array.isArray(graphCache.history) ? graphCache.history : [];
  graphCache.history = history.filter(
    (p) => clampSec(p?.tSec ?? 0) <= limit
  );

  if (graphCache.stateDataByBoundary) {
    for (const sec of graphCache.stateDataByBoundary.keys()) {
      if (sec > limit) {
        graphCache.stateDataByBoundary.delete(sec);
      }
    }
    purgePastStateData(graphCache.stateDataByBoundary, limit);
  }

  if (graphCache.window) {
    graphCache.window.baseSec = limit;
    graphCache.window.forecast = [];
  }

  graphCache.historyEndSec = limit;
}
