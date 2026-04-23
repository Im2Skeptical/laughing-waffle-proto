import { buildProjectionChunkFromStateData } from "../model/projection-chunk.js";

function serializeChunkResult(result) {
  if (!result?.ok) return result;
  return {
    ...result,
    stateDataBySecond: Array.from(result.stateDataBySecond.entries()),
    summaryBySecond: Array.from(result.summaryBySecond.entries()),
  };
}

function clampSec(value, fallback = 0) {
  if (!Number.isFinite(value)) return Math.max(0, Math.floor(fallback));
  return Math.max(0, Math.floor(value));
}

function normalizeScheduledActionsForSlice(actionsBySecond, baseSec, endSec) {
  const out = [];
  const minSec = clampSec(baseSec) + 1;
  const maxSec = clampSec(endSec, minSec);
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

function postChunkResult(message, result, { baseSec, endSec, done }) {
  globalThis.postMessage({
    kind: "chunkResult",
    requestId: message.requestId,
    requestKey: message.requestKey,
    timelineToken: message.timelineToken,
    historyEndSec: message.historyEndSec,
    baseSec,
    endSec,
    stepSec: message.stepSec,
    done,
    result: serializeChunkResult(result),
  });
}

function runBuildChunkJob(message) {
  const sliceSpanSec = Math.max(1, clampSec(message.streamSliceSec, 1));
  const targetEndSec = clampSec(message.endSec, message.baseSec);
  const requestBaseSec = clampSec(message.baseSec, 0);
  const requestStepSec = Math.max(1, clampSec(message.stepSec, 1));

  let currentBaseSec = requestBaseSec;
  let currentBoundaryStateData = message.boundaryStateData;

  function stepSlice() {
    try {
      const sliceEndSec = Math.min(targetEndSec, currentBaseSec + sliceSpanSec);
      const sliceActions = normalizeScheduledActionsForSlice(
        message.scheduledActionsBySecond,
        currentBaseSec,
        sliceEndSec
      );
      const result = buildProjectionChunkFromStateData(
        currentBoundaryStateData,
        currentBaseSec,
        sliceEndSec,
        {
          stepSec: requestStepSec,
          actionsBySecond: sliceActions,
        }
      );
      if (result?.ok !== true) {
        postChunkResult(message, result, {
          baseSec: currentBaseSec,
          endSec: currentBaseSec,
          done: true,
        });
        return;
      }

      const done = sliceEndSec >= targetEndSec;
      postChunkResult(message, result, {
        baseSec: currentBaseSec,
        endSec: sliceEndSec,
        done,
      });
      if (done) return;

      currentBaseSec = sliceEndSec;
      currentBoundaryStateData = result.lastStateData;
      setTimeout(stepSlice, 0);
    } catch (error) {
      postChunkResult(
        message,
        {
          ok: false,
          reason: error?.message ?? "workerChunkFailed",
        },
        {
          baseSec: currentBaseSec,
          endSec: currentBaseSec,
          done: true,
        }
      );
    }
  }

  stepSlice();
}

globalThis.onmessage = (event) => {
  const message = event?.data ?? null;
  if (!message || message.kind !== "buildChunk") return;
  runBuildChunkJob(message);
};

