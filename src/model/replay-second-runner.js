import { applyAction } from "./actions.js";
import { updateGame } from "./game-model.js";

export const TICKS_PER_REPLAY_SECOND = 60;
export const DEFAULT_REPLAY_DT_STEP = 1 / TICKS_PER_REPLAY_SECOND;

function normalizeReplaySecond(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

export function initializeReplayClock(state, startSec = 0) {
  if (!state || typeof state !== "object") return state;
  const safeStartSec = normalizeReplaySecond(startSec);
  state.paused = false;
  state.tSec = safeStartSec;
  state.simStepIndex = safeStartSec * TICKS_PER_REPLAY_SECOND;
  return state;
}

export function advanceReplayStateOneSecond(
  state,
  dtStep = DEFAULT_REPLAY_DT_STEP
) {
  const beforeSec = normalizeReplaySecond(state?.tSec);
  for (let index = 0; index < TICKS_PER_REPLAY_SECOND; index += 1) {
    updateGame(dtStep, state);
  }
  const currentSec = normalizeReplaySecond(state?.tSec);
  if (currentSec <= beforeSec) {
    return {
      ok: false,
      reason: "advanceFailed",
      currentSec,
      previousSec: beforeSec,
    };
  }
  return {
    ok: true,
    currentSec,
  };
}

export function advanceReplayStateToSecond(
  state,
  targetSec,
  dtStep = DEFAULT_REPLAY_DT_STEP
) {
  const desiredSec = normalizeReplaySecond(targetSec);
  let currentSec = normalizeReplaySecond(state?.tSec);
  if (currentSec >= desiredSec) {
    return { ok: true, currentSec };
  }

  while (currentSec < desiredSec) {
    const advanceResult = advanceReplayStateOneSecond(state, dtStep);
    if (!advanceResult?.ok) {
      return {
        ok: false,
        reason: advanceResult?.reason ?? "advanceFailed",
        currentSec,
        targetSec: desiredSec,
      };
    }
    currentSec = normalizeReplaySecond(advanceResult.currentSec);
  }

  return { ok: true, currentSec };
}

export function applyReplayActionsAtSecond(state, actions, sec = null) {
  const normalizedActions = Array.isArray(actions) ? actions : [];
  const safeSec = sec == null ? null : normalizeReplaySecond(sec);
  let lastResult = null;
  for (const action of normalizedActions) {
    const result = applyAction(state, action, { isReplay: true });
    lastResult = result ?? null;
    if (!result?.ok) {
      return {
        ok: false,
        reason: result?.reason ?? "actionFailed",
        detail: result?.detail ?? result ?? null,
        action,
        tSec: safeSec,
      };
    }
  }
  return {
    ok: true,
    count: normalizedActions.length,
    tSec: safeSec,
    result: lastResult,
  };
}
