import { deserializeGameState, serializeGameState } from "./state.js";
import { canonicalizeSnapshot } from "./canonicalize.js";
import { buildProjectionSummaryFromState } from "./projection-summary.js";
import {
  DEFAULT_REPLAY_DT_STEP,
  advanceReplayStateOneSecond,
  applyReplayActionsAtSecond,
  initializeReplayClock,
} from "./replay-second-runner.js";
import {
  perfEnabled,
  perfNowMs,
  recordProjectionCanonicalize,
  recordProjectionDeserialize,
  recordProjectionSerialize,
} from "./perf.js";

const DEFAULT_FORECAST_STATE_ANCHOR_STRIDE_SEC = 16;

function clampSec(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function normalizeStepSec(stepSec) {
  if (!Number.isFinite(stepSec) || stepSec <= 0) return 1;
  return Math.max(1, Math.floor(stepSec));
}

function resolveDtStepStrict(dtStep) {
  if (dtStep == null) return { ok: true, dt: DEFAULT_REPLAY_DT_STEP };
  if (!Number.isFinite(dtStep) || dtStep !== DEFAULT_REPLAY_DT_STEP) {
    return { ok: false, reason: "unsupportedDtStep" };
  }
  return { ok: true, dt: DEFAULT_REPLAY_DT_STEP };
}

function normalizeStateAnchorStrideSec(stateAnchorStrideSec) {
  if (!Number.isFinite(stateAnchorStrideSec) || stateAnchorStrideSec <= 0) {
    return DEFAULT_FORECAST_STATE_ANCHOR_STRIDE_SEC;
  }
  return Math.max(1, Math.floor(stateAnchorStrideSec));
}

function shouldStoreStateAnchor(sec, startSec, endSec, stateAnchorStrideSec) {
  const safeSec = clampSec(sec);
  const safeStartSec = clampSec(startSec);
  const safeEndSec = clampSec(endSec);
  const stride = normalizeStateAnchorStrideSec(stateAnchorStrideSec);
  if (safeSec <= safeStartSec) return true;
  if (safeSec >= safeEndSec) return true;
  return (safeSec - safeStartSec) % stride === 0;
}

function deserializeProjectionState(stateData) {
  const startMs = perfEnabled() ? perfNowMs() : 0;
  const state = deserializeGameState(stateData);
  if (perfEnabled()) {
    recordProjectionDeserialize(perfNowMs() - startMs);
  }
  return state;
}

function serializeProjectionState(state) {
  const startMs = perfEnabled() ? perfNowMs() : 0;
  const stateData = serializeGameState(state);
  if (perfEnabled()) {
    recordProjectionSerialize(perfNowMs() - startMs);
  }
  return stateData;
}

function canonicalizeProjectionState(state) {
  const startMs = perfEnabled() ? perfNowMs() : 0;
  canonicalizeSnapshot(state);
  if (perfEnabled()) {
    recordProjectionCanonicalize(perfNowMs() - startMs);
  }
}

function normalizeActionsBySecond(actionsBySecond) {
  const out = new Map();
  if (actionsBySecond instanceof Map) {
    for (const [secRaw, actionsRaw] of actionsBySecond.entries()) {
      const sec = clampSec(secRaw);
      const list = Array.isArray(actionsRaw) ? actionsRaw : [];
      if (!list.length) continue;
      out.set(sec, list.map((action) => ({ ...action, tSec: sec })));
    }
    return out;
  }
  if (Array.isArray(actionsBySecond)) {
    for (const entry of actionsBySecond) {
      const sec = clampSec(entry?.tSec ?? entry?.sec ?? entry?.second ?? 0);
      const list = Array.isArray(entry?.actions) ? entry.actions : [];
      if (!list.length) continue;
      out.set(sec, list.map((action) => ({ ...action, tSec: sec })));
    }
    return out;
  }
  if (actionsBySecond && typeof actionsBySecond === "object") {
    for (const [secRaw, actionsRaw] of Object.entries(actionsBySecond)) {
      const sec = clampSec(Number(secRaw));
      const list = Array.isArray(actionsRaw) ? actionsRaw : [];
      if (!list.length) continue;
      out.set(sec, list.map((action) => ({ ...action, tSec: sec })));
    }
  }
  return out;
}

function createProjectionChunkRunner(
  boundaryStateData,
  baseSec,
  endSec,
  opts = {}
) {
  if (boundaryStateData == null) return { ok: false, reason: "noBaseStateData" };

  const dtRes = resolveDtStepStrict(opts?.dtStep);
  if (!dtRes.ok) return dtRes;
  const dt = dtRes.dt;

  const startSec = clampSec(baseSec);
  const targetEndSec = clampSec(endSec);
  if (targetEndSec < startSec) {
    return { ok: false, reason: "badEndSec" };
  }

  const stepSec = normalizeStepSec(opts?.stepSec);
  const stateAnchorStrideSec = normalizeStateAnchorStrideSec(
    opts?.stateAnchorStrideSec
  );
  const scheduledActionsBySecond = normalizeActionsBySecond(
    opts?.actionsBySecond
  );

  const state = deserializeProjectionState(boundaryStateData);
  canonicalizeProjectionState(state);
  initializeReplayClock(state, startSec);

  return {
    ok: true,
    dt,
    startSec,
    targetEndSec,
    stepSec,
    stateAnchorStrideSec,
    scheduledActionsBySecond,
    state,
  };
}

function advanceProjectionChunkOneSecond(runtime, sec) {
  const { dt, state, scheduledActionsBySecond } = runtime;
  const advanceResult = advanceReplayStateOneSecond(state, dt);
  if (!advanceResult?.ok) {
    return advanceResult;
  }

  const actions = scheduledActionsBySecond.get(sec);
  if (actions && actions.length) {
    const replayRes = applyReplayActionsAtSecond(state, actions, sec);
    if (!replayRes?.ok) {
      return replayRes;
    }
  }

  canonicalizeProjectionState(state);
  return {
    ok: true,
    summary: buildProjectionSummaryFromState(state),
  };
}

export function buildProjectionChunkFromStateData(
  boundaryStateData,
  baseSec,
  endSec,
  opts = {}
) {
  const runtime = createProjectionChunkRunner(
    boundaryStateData,
    baseSec,
    endSec,
    opts
  );
  if (!runtime?.ok) return runtime;

  const { startSec, targetEndSec, stepSec, stateAnchorStrideSec } = runtime;

  const stateDataBySecond = new Map();
  const summaryBySecond = new Map();
  let lastStateData = serializeProjectionState(runtime.state);
  summaryBySecond.set(startSec, buildProjectionSummaryFromState(runtime.state));

  for (let sec = startSec + 1; sec <= targetEndSec; sec += 1) {
    const stepRes = advanceProjectionChunkOneSecond(runtime, sec);
    if (!stepRes?.ok) return stepRes;
    const shouldStoreAnchor =
      (sec - startSec) % stepSec === 0 &&
      shouldStoreStateAnchor(sec, startSec, targetEndSec, stateAnchorStrideSec);
    const needsSerializedState = shouldStoreAnchor || sec === targetEndSec;
    if (needsSerializedState) {
      const stateData = serializeProjectionState(runtime.state);
      lastStateData = stateData;
      if (shouldStoreAnchor) {
        stateDataBySecond.set(sec, stateData);
      }
    }
    summaryBySecond.set(sec, stepRes.summary);
  }

  return {
    ok: true,
    baseSec: startSec,
    endSec: targetEndSec,
    stepSec,
    stateDataBySecond,
    summaryBySecond,
    lastStateData,
  };
}

export function streamProjectionChunkFromStateData(
  boundaryStateData,
  baseSec,
  endSec,
  opts = {}
) {
  const runtime = createProjectionChunkRunner(
    boundaryStateData,
    baseSec,
    endSec,
    opts
  );
  if (!runtime?.ok) return runtime;

  const { startSec, targetEndSec, stepSec, stateAnchorStrideSec } = runtime;
  const requestedEmitSliceSec =
    opts?.emitSliceSec ?? Math.max(1, targetEndSec - startSec);
  const emitSliceSec = Math.max(1, Math.floor(requestedEmitSliceSec));
  const onChunk = typeof opts?.onChunk === "function" ? opts.onChunk : null;

  let sliceBaseSec = startSec;
  let sliceStateDataBySecond = new Map();
  let sliceSummaryBySecond = new Map();
  let lastStateData = serializeProjectionState(runtime.state);
  sliceSummaryBySecond.set(startSec, buildProjectionSummaryFromState(runtime.state));

  for (let sec = startSec + 1; sec <= targetEndSec; sec += 1) {
    const stepRes = advanceProjectionChunkOneSecond(runtime, sec);
    if (!stepRes?.ok) return stepRes;
    sliceSummaryBySecond.set(sec, stepRes.summary);

    const reachedSliceBoundary =
      sec === targetEndSec || sec - sliceBaseSec >= emitSliceSec;
    const shouldStoreAnchor =
      (sec - startSec) % stepSec === 0 &&
      shouldStoreStateAnchor(sec, startSec, targetEndSec, stateAnchorStrideSec);
    const needsSerializedState = shouldStoreAnchor || reachedSliceBoundary;
    if (needsSerializedState) {
      const stateData = serializeProjectionState(runtime.state);
      lastStateData = stateData;
      if (shouldStoreAnchor) {
        sliceStateDataBySecond.set(sec, stateData);
      }
    }
    if (!reachedSliceBoundary) continue;

    const chunk = {
      ok: true,
      baseSec: sliceBaseSec,
      endSec: sec,
      stepSec,
      stateDataBySecond: sliceStateDataBySecond,
      summaryBySecond: sliceSummaryBySecond,
      lastStateData,
    };
    onChunk?.(chunk, { done: sec === targetEndSec });
    sliceBaseSec = sec;
    sliceStateDataBySecond = new Map();
    sliceSummaryBySecond = new Map();
    sliceSummaryBySecond.set(sec, stepRes.summary);
  }

  return {
    ok: true,
    baseSec: startSec,
    endSec: targetEndSec,
    stepSec,
    lastStateData,
  };
}

