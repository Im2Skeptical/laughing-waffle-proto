import { buildProjectionChunkFromStateData } from "../model/projection-chunk.js";
import {
  recordSettlementForecastBuild,
  recordSettlementForecastWorkerReject,
} from "../model/perf.js";

export const TIMEGRAPH_FORECAST_PRIME_CHUNK_SIZE_SEC = 120;
export const TIMEGRAPH_FORECAST_CHUNK_SIZE_SEC = 480;
export const TIMEGRAPH_FORECAST_STREAM_SLICE_SEC = 30;
export const TIMEGRAPH_FORECAST_REQUEST_CADENCE_MS = 50;
export const TIMEGRAPH_FORECAST_WORKER_STALL_TIMEOUT_MS = 750;
export const TIMEGRAPH_FORECAST_EARLY_CHUNK_WINDOW_SEC = 1440;
export const TIMEGRAPH_FORECAST_EARLY_CHUNK_SIZE_SEC = 180;
export const TIMEGRAPH_FORECAST_EARLY_STREAM_SLICE_SEC = 20;
export const TIMEGRAPH_FORECAST_EARLY_REQUEST_CADENCE_MS = 20;

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

function clampSec(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function normalizeActionsBySecond(actionsBySecond, baseSec, endSec) {
  const out = [];
  const minSec = clampSec(baseSec) + 1;
  const maxSec = clampSec(endSec);
  if (maxSec < minSec) return out;

  const pushEntry = (secRaw, actionsRaw) => {
    const sec = clampSec(secRaw);
    if (sec < minSec || sec > maxSec) return;
    const actions = Array.isArray(actionsRaw) ? actionsRaw : [];
    if (!actions.length) return;
    out.push({
      tSec: sec,
      actions: actions.map((action) => ({ ...action, tSec: sec })),
    });
  };

  if (actionsBySecond instanceof Map) {
    for (const [sec, actions] of actionsBySecond.entries()) {
      pushEntry(sec, actions);
    }
  } else if (Array.isArray(actionsBySecond)) {
    for (const entry of actionsBySecond) {
      pushEntry(entry?.tSec ?? entry?.sec ?? entry?.second ?? 0, entry?.actions);
    }
  } else if (actionsBySecond && typeof actionsBySecond === "object") {
    for (const [sec, actions] of Object.entries(actionsBySecond)) {
      pushEntry(Number(sec), actions);
    }
  }

  out.sort((left, right) => left.tSec - right.tSec);
  return out;
}

function normalizeChunkEntries(entries) {
  if (entries instanceof Map) return Array.from(entries.entries());
  return Array.isArray(entries) ? entries : [];
}

function estimateMessageBytes(payload) {
  try {
    return Math.max(0, JSON.stringify(payload).length);
  } catch (_error) {
    return 0;
  }
}

export function createTimegraphForecastWorkerService({
  createWorker = null,
  timeNowMs = nowMs,
  primeChunkSizeSec = TIMEGRAPH_FORECAST_PRIME_CHUNK_SIZE_SEC,
  chunkSizeSec = TIMEGRAPH_FORECAST_CHUNK_SIZE_SEC,
  streamSliceSec = TIMEGRAPH_FORECAST_STREAM_SLICE_SEC,
  requestCadenceMs = TIMEGRAPH_FORECAST_REQUEST_CADENCE_MS,
  workerStallTimeoutMs = TIMEGRAPH_FORECAST_WORKER_STALL_TIMEOUT_MS,
  earlyChunkWindowSec = TIMEGRAPH_FORECAST_EARLY_CHUNK_WINDOW_SEC,
  earlyChunkSizeSec = TIMEGRAPH_FORECAST_EARLY_CHUNK_SIZE_SEC,
  earlyStreamSliceSec = TIMEGRAPH_FORECAST_EARLY_STREAM_SLICE_SEC,
  earlyRequestCadenceMs = TIMEGRAPH_FORECAST_EARLY_REQUEST_CADENCE_MS,
} = {}) {
  let worker = null;
  let workerDisabled = false;
  let nextRequestId = 1;
  const requestsById = new Map();
  const requestsByKey = new Map();

  function getChunkStrategy(baseSec, coverageEndSec) {
    const safeBaseSec = clampSec(baseSec);
    const safeCoverageEndSec = Math.max(safeBaseSec, clampSec(coverageEndSec));
    const earlyWindowSecClamped = Math.max(0, clampSec(earlyChunkWindowSec));
    const inEarlyWindow =
      earlyWindowSecClamped > 0 &&
      safeCoverageEndSec - safeBaseSec < earlyWindowSecClamped;
    return {
      chunkSizeSec: inEarlyWindow
        ? Math.max(1, Math.floor(earlyChunkSizeSec))
        : Math.max(1, Math.floor(chunkSizeSec)),
      streamSliceSec: inEarlyWindow
        ? Math.max(1, Math.floor(earlyStreamSliceSec))
        : Math.max(1, Math.floor(streamSliceSec)),
      requestCadenceMs: inEarlyWindow
        ? Math.max(0, Math.floor(earlyRequestCadenceMs))
        : Math.max(0, Math.floor(requestCadenceMs)),
    };
  }

  function clearInFlightRequests() {
    requestsById.clear();
    for (const entry of requestsByKey.values()) {
      if (!entry || typeof entry !== "object") continue;
      entry.inFlight = null;
    }
  }

  function teardownWorker({ disable = false } = {}) {
    if (disable === true) {
      workerDisabled = true;
    }
    const currentWorker = worker;
    worker = null;
    clearInFlightRequests();
    if (!currentWorker) return;
    if (typeof currentWorker.removeEventListener === "function") {
      currentWorker.removeEventListener("message", handleWorkerMessage);
      currentWorker.removeEventListener("error", handleWorkerError);
      currentWorker.removeEventListener("messageerror", handleWorkerMessageError);
    }
    currentWorker.terminate?.();
  }

  function handleWorkerError() {
    teardownWorker({ disable: true });
  }

  function handleWorkerMessageError() {
    teardownWorker({ disable: true });
  }

  function ensureWorker() {
    if (workerDisabled) return null;
    if (worker) return worker;
    try {
      if (typeof createWorker === "function") {
        worker = createWorker();
      } else if (typeof Worker === "function") {
        worker = new Worker(
          new URL("./timegraph-forecast-worker.js", import.meta.url),
          { type: "module" }
        );
      } else {
        return null;
      }
    } catch (_error) {
      worker = null;
      workerDisabled = true;
      return null;
    }
    if (worker && typeof worker.addEventListener === "function") {
      worker.addEventListener("message", handleWorkerMessage);
      worker.addEventListener("error", handleWorkerError);
      worker.addEventListener("messageerror", handleWorkerMessageError);
    } else if (worker) {
      worker.onmessage = handleWorkerMessage;
      worker.onerror = handleWorkerError;
    }
    return worker;
  }

  function releaseRequest(requestId) {
    const request = requestsById.get(requestId);
    if (!request) return null;
    requestsById.delete(requestId);
    const entry = requestsByKey.get(request.requestKey);
    if (entry?.inFlight?.requestId === requestId) {
      entry.inFlight = null;
    }
    return request;
  }

  function handleWorkerMessage(event) {
    const message = event?.data ?? null;
    if (!message || message.kind !== "chunkResult") return;

    const request = requestsById.get(message.requestId) ?? null;
    if (!request) return;

    const entry = requestsByKey.get(request.requestKey);
    const projectionCache = request.projectionCache;
    const timeline = request.timeline;
    if (!projectionCache || !timeline) return;

    const merged = projectionCache.mergeForecastChunk?.(timeline, {
      timelineToken: message.timelineToken,
      historyEndSec: message.historyEndSec,
      baseSec: message.baseSec,
      endSec: message.endSec,
      stepSec: message.stepSec,
      stateDataBySecond: normalizeChunkEntries(message.result?.stateDataBySecond),
      summaryBySecond: normalizeChunkEntries(message.result?.summaryBySecond),
      lastStateData: message.result?.lastStateData ?? null,
    });

    if (!entry) return;
    if (merged?.ok === true && message.result?.ok === true) {
      recordSettlementForecastBuild({
        workerSec: Math.max(0, clampSec(message.endSec) - clampSec(message.baseSec)),
        workerMessages: 1,
        workerMessageBytes: estimateMessageBytes(message),
      });
      entry.coverageEndSec = Math.max(
        clampSec(entry.coverageEndSec),
        clampSec(message.endSec)
      );
      entry.lastProgressMs = timeNowMs();
    } else if (message.result?.ok === true) {
      recordSettlementForecastWorkerReject(merged?.reason ?? "mergeFailed");
    }
    if (message.done === true) {
      releaseRequest(message.requestId);
    }
  }

  function advanceCoverageLocally({
    entry,
    projectionCache,
    timeline,
    timelineToken,
    historyEndSec,
    stepSec,
    boundaryStateData,
    scheduledActionsBySecond,
    maxSliceSec = streamSliceSec,
  } = {}) {
    if (!entry || !projectionCache || !timeline) {
      return {
        ok: false,
        reason: "missingDependencies",
        coverageEndSec: clampSec(historyEndSec),
        pending: false,
        requestedEndSec: clampSec(historyEndSec),
      };
    }

    const baseSec = clampSec(historyEndSec);
    const normalizedStepSec = Math.max(1, Math.floor(stepSec ?? 1));
    const sliceBaseSec = clampSec(entry.coverageEndSec);
    const sliceEndSec = Math.min(
      clampSec(entry.requestedEndSec),
      sliceBaseSec + Math.max(1, Math.floor(maxSliceSec ?? 1))
    );
    if (sliceEndSec <= sliceBaseSec) {
      return {
        ok: true,
        reason: "localFallbackNoop",
        coverageEndSec: sliceBaseSec,
        pending: clampSec(entry.requestedEndSec) > sliceBaseSec,
        requestedEndSec: clampSec(entry.requestedEndSec),
      };
    }

    const chunkBoundaryStateData =
      sliceBaseSec === baseSec
        ? boundaryStateData
        : projectionCache.getStateData?.(sliceBaseSec) ?? null;
    if (chunkBoundaryStateData == null) {
      return {
        ok: false,
        reason: "missingChunkBoundaryStateData",
        coverageEndSec: sliceBaseSec,
        pending: true,
        requestedEndSec: clampSec(entry.requestedEndSec),
      };
    }

    const sliceActions = normalizeActionsBySecond(
      scheduledActionsBySecond,
      sliceBaseSec,
      sliceEndSec
    );
    const sliceRes = buildProjectionChunkFromStateData(
      chunkBoundaryStateData,
      sliceBaseSec,
      sliceEndSec,
      {
        stepSec: normalizedStepSec,
        actionsBySecond: sliceActions,
      }
    );
    if (sliceRes?.ok !== true) {
      return {
        ok: false,
        reason: sliceRes?.reason ?? "localFallbackFailed",
        coverageEndSec: sliceBaseSec,
        pending: true,
        requestedEndSec: clampSec(entry.requestedEndSec),
      };
    }

    const merged = projectionCache.mergeForecastChunk?.(timeline, {
      timelineToken,
      historyEndSec: baseSec,
      baseSec: sliceBaseSec,
      endSec: sliceEndSec,
      stepSec: normalizedStepSec,
      stateDataBySecond: Array.from(sliceRes.stateDataBySecond.entries()),
      summaryBySecond: Array.from(sliceRes.summaryBySecond.entries()),
      lastStateData: sliceRes.lastStateData,
    });
    if (merged?.ok === true) {
      recordSettlementForecastBuild({
        fallbackSec: Math.max(0, clampSec(sliceEndSec) - clampSec(sliceBaseSec)),
      });
      entry.coverageEndSec = Math.max(
        clampSec(entry.coverageEndSec),
        clampSec(sliceEndSec)
      );
      entry.lastProgressMs = timeNowMs();
    }
    return {
      ok: merged?.ok === true,
      reason: merged?.ok === true ? "localFallback" : merged?.reason ?? "localFallbackMergeFailed",
      coverageEndSec: clampSec(entry.coverageEndSec),
      pending: clampSec(entry.requestedEndSec) > clampSec(entry.coverageEndSec),
      requestedEndSec: clampSec(entry.requestedEndSec),
    };
  }

  function getCoverageMeta(projectionCache, timelineToken, historyEndSec, stepSec) {
    const meta = projectionCache?.getForecastAsyncMeta?.() ?? null;
    const baseSec = clampSec(historyEndSec);
    const step = Math.max(1, Math.floor(stepSec ?? 1));
    if (
      meta &&
      meta.forecastAsyncToken === timelineToken &&
      clampSec(meta.forecastAsyncStepSec) === step
    ) {
      return {
        coverageEndSec: Math.max(baseSec, clampSec(meta.forecastAsyncEndSec)),
      };
    }
    return {
      coverageEndSec: baseSec,
    };
  }

  function requestCoverage({
    projectionCache,
    timeline,
    timelineToken,
    historyEndSec,
    stepSec,
    desiredEndSec,
    boundaryStateData,
    scheduledActionsBySecond,
  } = {}) {
    if (!projectionCache || !timeline) {
      return {
        ok: false,
        reason: "missingDependencies",
        coverageEndSec: clampSec(historyEndSec),
        pending: false,
        requestedEndSec: clampSec(historyEndSec),
      };
    }

    const baseSec = clampSec(historyEndSec);
    const requestedEndSec = Math.max(baseSec, clampSec(desiredEndSec));
    const normalizedStepSec = Math.max(1, Math.floor(stepSec ?? 1));
    const requestKey = `${timelineToken}|${normalizedStepSec}`;

    let entry = requestsByKey.get(requestKey);
    if (!entry) {
      const coverage = getCoverageMeta(
        projectionCache,
        timelineToken,
        baseSec,
        normalizedStepSec
      );
      entry = {
        requestKey,
        timelineToken,
        historyEndSec: baseSec,
        stepSec: normalizedStepSec,
        requestedEndSec,
        coverageEndSec: coverage.coverageEndSec,
        lastDispatchMs: -Infinity,
        lastProgressMs: timeNowMs(),
        inFlight: null,
        primedInitialChunk: false,
      };
      requestsByKey.set(requestKey, entry);
    } else {
      entry.requestedEndSec = Math.max(
        clampSec(entry.requestedEndSec),
        requestedEndSec
      );
      const coverage = getCoverageMeta(
        projectionCache,
        timelineToken,
        baseSec,
        normalizedStepSec
      );
      entry.coverageEndSec = coverage.coverageEndSec;
    }

    const pending = entry.requestedEndSec > entry.coverageEndSec;
    if (!pending) {
      return {
        ok: true,
        coverageEndSec: entry.coverageEndSec,
        pending: false,
        requestedEndSec: entry.requestedEndSec,
      };
    }

    if (!entry.primedInitialChunk && entry.coverageEndSec === baseSec) {
      const primeEndSec = Math.min(
        entry.requestedEndSec,
        baseSec + Math.max(1, Math.floor(primeChunkSizeSec))
      );
      if (primeEndSec > baseSec && boundaryStateData != null) {
        const primeActions = normalizeActionsBySecond(
          scheduledActionsBySecond,
          baseSec,
          primeEndSec
        );
        const primeRes = buildProjectionChunkFromStateData(
          boundaryStateData,
          baseSec,
          primeEndSec,
          {
            stepSec: normalizedStepSec,
            actionsBySecond: primeActions,
          }
        );
        if (primeRes?.ok === true) {
          const merged = projectionCache.mergeForecastChunk?.(timeline, {
            timelineToken,
            historyEndSec: baseSec,
            baseSec,
            endSec: primeEndSec,
            stepSec: normalizedStepSec,
            stateDataBySecond: Array.from(primeRes.stateDataBySecond.entries()),
            summaryBySecond: Array.from(primeRes.summaryBySecond.entries()),
            lastStateData: primeRes.lastStateData,
          });
          if (merged?.ok === true) {
            recordSettlementForecastBuild({
              fallbackSec: Math.max(0, clampSec(primeEndSec) - baseSec),
            });
            entry.coverageEndSec = Math.max(
              entry.coverageEndSec,
              clampSec(primeEndSec)
            );
            entry.lastProgressMs = timeNowMs();
          }
        }
      }
      entry.primedInitialChunk = true;
    }

    const pendingAfterPrime = entry.requestedEndSec > entry.coverageEndSec;
    if (!pendingAfterPrime) {
      return {
        ok: true,
        coverageEndSec: entry.coverageEndSec,
        pending: false,
        requestedEndSec: entry.requestedEndSec,
      };
    }

    const currentMs = timeNowMs();
    const chunkStrategy = getChunkStrategy(baseSec, entry.coverageEndSec);
    if (
      entry.inFlight &&
      currentMs - Math.max(
        Number.isFinite(entry.lastProgressMs) ? entry.lastProgressMs : -Infinity,
        Number.isFinite(entry.inFlight?.startedMs) ? entry.inFlight.startedMs : -Infinity
      ) >
        Math.max(1, Math.floor(workerStallTimeoutMs))
    ) {
      teardownWorker({ disable: true });
    }

    const workerInstance = ensureWorker();
    if (!workerInstance) {
      return advanceCoverageLocally({
        entry,
        projectionCache,
        timeline,
        timelineToken,
        historyEndSec: baseSec,
        stepSec: normalizedStepSec,
        boundaryStateData,
        scheduledActionsBySecond,
        maxSliceSec: chunkStrategy.streamSliceSec,
      });
    }

    if (
      entry.inFlight ||
      currentMs - entry.lastDispatchMs < chunkStrategy.requestCadenceMs
    ) {
      return {
        ok: true,
        coverageEndSec: entry.coverageEndSec,
        pending: true,
        requestedEndSec: entry.requestedEndSec,
      };
    }

    const chunkBaseSec = entry.coverageEndSec;
    const chunkEndSec = Math.min(
      entry.requestedEndSec,
      chunkBaseSec + chunkStrategy.chunkSizeSec
    );
    if (chunkEndSec <= chunkBaseSec) {
      return {
        ok: true,
        coverageEndSec: entry.coverageEndSec,
        pending: false,
        requestedEndSec: entry.requestedEndSec,
      };
    }

    const chunkBoundaryStateData =
      chunkBaseSec === baseSec
        ? boundaryStateData
        : projectionCache.getStateData?.(chunkBaseSec) ?? null;
    if (chunkBoundaryStateData == null) {
      return {
        ok: false,
        reason: "missingChunkBoundaryStateData",
        coverageEndSec: entry.coverageEndSec,
        pending: true,
        requestedEndSec: entry.requestedEndSec,
      };
    }

    const requestId = nextRequestId++;
    entry.lastDispatchMs = currentMs;
    entry.inFlight = {
      requestId,
      baseSec: chunkBaseSec,
      endSec: chunkEndSec,
      startedMs: currentMs,
    };

    const request = {
      requestId,
      requestKey,
      projectionCache,
      timeline,
    };
    requestsById.set(requestId, request);

    const chunkActions = normalizeActionsBySecond(
      scheduledActionsBySecond,
      chunkBaseSec,
      chunkEndSec
    );

    const message = {
      kind: "buildChunk",
      requestId,
      requestKey,
      timelineToken,
      historyEndSec: baseSec,
      baseSec: chunkBaseSec,
      endSec: chunkEndSec,
      stepSec: normalizedStepSec,
      streamSliceSec: chunkStrategy.streamSliceSec,
      boundaryStateData: chunkBoundaryStateData,
      scheduledActionsBySecond: chunkActions,
    };
    recordSettlementForecastBuild({
      workerMessages: 1,
      workerMessageBytes: estimateMessageBytes(message),
    });
    workerInstance.postMessage(message);

    return {
      ok: true,
      coverageEndSec: entry.coverageEndSec,
      pending: true,
      requestedEndSec: entry.requestedEndSec,
    };
  }

  function handleTimelineInvalidation(_reason = "invalidate") {
    // Timeline edits make the worker's current chunk obsolete. Clearing request
    // maps prevents stale merges, but the old worker can still keep computing
    // and delay the next branch's request. Terminate it so the next request
    // starts on a fresh worker with the current timeline token.
    teardownWorker({ disable: false });
    requestsByKey.clear();
    workerDisabled = false;
  }

  function dispose() {
    requestsByKey.clear();
    teardownWorker({ disable: false });
  }

  return {
    requestCoverage,
    handleTimelineInvalidation,
    dispose,
  };
}
