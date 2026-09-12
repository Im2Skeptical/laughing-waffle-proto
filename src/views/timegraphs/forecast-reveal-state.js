import {
  FORECAST_REVEAL_MIN_RATE_SEC_PER_SEC,
  FORECAST_REVEAL_PREVIEW_REFRESH_MS,
  FORECAST_REVEAL_TARGET_DURATION_SEC,
} from "./constants.js";
import { resolveForecastRevealPlayheadSec } from "../timegraphs-helpers.js";

export function createForecastRevealState({
  targetDurationSec = FORECAST_REVEAL_TARGET_DURATION_SEC,
  minRateSecPerSec = FORECAST_REVEAL_MIN_RATE_SEC_PER_SEC,
  maxRateSecPerSec = Number.POSITIVE_INFINITY,
  startDelayMs = 0,
  followGapSec = 0,
  followResponseSec = 0.9,
  accelerationSecPerSec2 = 220,
  decelerationSecPerSec2 = 320,
} = {}) {
  const defaults = {
    targetDurationSec,
    minRateSecPerSec,
    maxRateSecPerSec,
    startDelayMs,
    followGapSec,
    followResponseSec,
    accelerationSecPerSec2,
    decelerationSecPerSec2,
  };
  return {
    targetDurationSec: defaults.targetDurationSec,
    minRateSecPerSec: defaults.minRateSecPerSec,
    maxRateSecPerSec: defaults.maxRateSecPerSec,
    startDelayMs: defaults.startDelayMs,
    followGapSec: defaults.followGapSec,
    followResponseSec: defaults.followResponseSec,
    accelerationSecPerSec2: defaults.accelerationSecPerSec2,
    decelerationSecPerSec2: defaults.decelerationSecPerSec2,
    defaults,
    animatedEndSec: 0,
    targetEndSec: 0,
    lastTickMs: 0,
    historyEndSec: 0,
    capEndSec: null,
    visibleEndSec: 0,
    delayUntilMs: 0,
    startSecOverride: null,
    velocitySecPerSec: 0,
    paused: false,
    playheadFollowEnabled: true,
    previewSec: null,
    previewLastRefreshMs: 0,
  };
}

export function setForecastRevealConfig(state, next = {}) {
  const defaults = state.defaults ?? {};
  state.targetDurationSec = Number.isFinite(next.targetDurationSec)
    ? Math.max(0.05, Number(next.targetDurationSec))
    : defaults.targetDurationSec;
  state.minRateSecPerSec = Number.isFinite(next.minRateSecPerSec)
    ? Math.max(1, Number(next.minRateSecPerSec))
    : defaults.minRateSecPerSec;
  state.maxRateSecPerSec = Number.isFinite(next.maxRateSecPerSec)
    ? Math.max(state.minRateSecPerSec, Number(next.maxRateSecPerSec))
    : defaults.maxRateSecPerSec;
  state.startDelayMs = Number.isFinite(next.startDelayMs)
    ? Math.max(0, Number(next.startDelayMs))
    : defaults.startDelayMs;
  state.followGapSec = Number.isFinite(next.followGapSec)
    ? Math.max(0, Number(next.followGapSec))
    : defaults.followGapSec;
  state.followResponseSec = Number.isFinite(next.followResponseSec)
    ? Math.max(0.05, Number(next.followResponseSec))
    : defaults.followResponseSec;
  state.accelerationSecPerSec2 = Number.isFinite(next.accelerationSecPerSec2)
    ? Math.max(1, Number(next.accelerationSecPerSec2))
    : defaults.accelerationSecPerSec2;
  state.decelerationSecPerSec2 = Number.isFinite(next.decelerationSecPerSec2)
    ? Math.max(1, Number(next.decelerationSecPerSec2))
    : defaults.decelerationSecPerSec2;
}

export function pauseForecastReveal(state) {
  state.paused = true;
  state.velocitySecPerSec = 0;
}

export function suspendForecastRevealPlayheadFollow(state) {
  state.playheadFollowEnabled = false;
  state.previewSec = null;
  state.previewLastRefreshMs = 0;
}

export function resetForecastRevealDataContext(state, activeForecastPreviewSec) {
  state.previewSec = state.playheadFollowEnabled
    ? activeForecastPreviewSec
    : null;
  state.previewLastRefreshMs = 0;
  state.capEndSec = null;
}

export function isFollowingForecastReveal(state, presentationSuspended = false) {
  return (
    state.playheadFollowEnabled &&
    !state.paused &&
    !presentationSuspended &&
    state.animatedEndSec < state.targetEndSec
  );
}

export function getDisplayHistoryEndSec(state, actualHistoryEndSec) {
  const actual = Math.max(0, Math.floor(actualHistoryEndSec ?? 0));
  if (!Number.isFinite(state.startSecOverride)) {
    return actual;
  }
  const override = Math.max(0, Math.floor(state.startSecOverride));
  if (override !== actual) {
    state.startSecOverride = null;
    return actual;
  }
  return override;
}

export function getVisibleForecastCoverageEndSec(
  state,
  actualForecastCoverageEndSec,
  displayHistoryEndSec
) {
  const displayHistoryEnd = Math.max(
    0,
    Math.floor(displayHistoryEndSec ?? 0)
  );
  const actualForecastEnd = Math.max(
    displayHistoryEnd,
    Math.floor(actualForecastCoverageEndSec ?? displayHistoryEnd)
  );
  const visibleForecastEnd =
    state.historyEndSec === displayHistoryEnd
      ? Math.max(
          displayHistoryEnd,
          Math.floor(state.visibleEndSec ?? displayHistoryEnd)
        )
      : displayHistoryEnd;
  return Math.max(
    displayHistoryEnd,
    Math.min(actualForecastEnd, visibleForecastEnd)
  );
}

export function getForecastRevealFollowTargetEndSec(
  state,
  targetEndSec,
  historyEndSec,
  currentEndSec = historyEndSec
) {
  const historyEnd = Math.max(0, Math.floor(historyEndSec ?? 0));
  const targetEnd = Math.max(historyEnd, Math.floor(targetEndSec ?? historyEnd));
  const currentEnd = Math.max(
    historyEnd,
    Math.min(targetEnd, Number(currentEndSec ?? historyEnd))
  );
  if (Number.isFinite(state.capEndSec)) return targetEnd;
  const configuredGapSec = Math.max(0, Number(state.followGapSec ?? 0));
  if (configuredGapSec <= 0) return targetEnd;
  const availableSpanSec = Math.max(0, targetEnd - historyEnd);
  if (availableSpanSec <= 1) return historyEnd;
  const remainingToTargetSec = Math.max(0, targetEnd - currentEnd);
  const effectiveGapSec = Math.min(
    configuredGapSec,
    Math.max(0, remainingToTargetSec * 0.5),
    Math.max(4, availableSpanSec * 0.4)
  );
  return Math.max(historyEnd, targetEnd - effectiveGapSec);
}

export function getRenderedHistoryEndSec(
  state,
  displayHistoryEndSec,
  actualForecastCoverageEndSec,
  extra = null,
  {
    treatRevealedForecastAsHistory = false,
    renderedHistoryEndResolver = null,
  } = {}
) {
  const displayHistoryEnd = Math.max(
    0,
    Math.floor(displayHistoryEndSec ?? 0)
  );
  const actualForecastEnd = Math.max(
    displayHistoryEnd,
    Math.floor(actualForecastCoverageEndSec ?? displayHistoryEnd)
  );
  const visibleForecastEnd = getVisibleForecastCoverageEndSec(
    state,
    actualForecastEnd,
    displayHistoryEnd
  );
  if (typeof renderedHistoryEndResolver === "function") {
    const resolved = renderedHistoryEndResolver({
      displayHistoryEndSec: displayHistoryEnd,
      actualForecastCoverageEndSec: actualForecastEnd,
      visibleForecastCoverageEndSec: visibleForecastEnd,
      ...extra,
    });
    if (Number.isFinite(resolved)) {
      return Math.max(
        displayHistoryEnd,
        Math.min(actualForecastEnd, Math.floor(resolved))
      );
    }
  }
  if (treatRevealedForecastAsHistory !== true) {
    return displayHistoryEnd;
  }
  return visibleForecastEnd;
}

export function getForecastRevealDesiredVelocitySecPerSec(
  state,
  targetEndSec,
  currentEndSec,
  historyEndSec
) {
  const historyEnd = Math.max(0, Math.floor(historyEndSec ?? 0));
  const currentEnd = Math.max(historyEnd, Number(currentEndSec ?? historyEnd));
  const targetEnd = Math.max(historyEnd, Math.floor(targetEndSec ?? historyEnd));
  const minRevealRateSecPerSec = Math.max(
    1,
    Number(state.minRateSecPerSec ?? FORECAST_REVEAL_MIN_RATE_SEC_PER_SEC)
  );
  const maxRevealRateSecPerSec = Math.max(
    minRevealRateSecPerSec,
    Number(state.maxRateSecPerSec ?? Number.POSITIVE_INFINITY)
  );
  const remainingForecastSpanSec = Math.max(1, targetEnd - historyEnd);
  const targetRevealRateSecPerSec =
    remainingForecastSpanSec /
    Math.max(
      0.05,
      Number(state.targetDurationSec ?? FORECAST_REVEAL_TARGET_DURATION_SEC)
    );
  const followTargetEndSec = getForecastRevealFollowTargetEndSec(
    state,
    targetEnd,
    historyEnd,
    currentEnd
  );
  const followDistanceSec = Math.max(0, followTargetEndSec - currentEnd);
  const followResponseSec = Math.max(
    0.05,
    Number(state.followResponseSec ?? 0.9)
  );
  const adaptiveRevealRateSecPerSec = followDistanceSec / followResponseSec;
  let desiredVelocitySecPerSec =
    state.followGapSec > 0
      ? adaptiveRevealRateSecPerSec
      : Math.max(
          minRevealRateSecPerSec,
          Math.min(maxRevealRateSecPerSec, targetRevealRateSecPerSec)
        );
  if (state.followGapSec > 0) {
    const farFromFollowTarget =
      followDistanceSec >
      Math.max(6, Number(state.followGapSec ?? 0) * 0.25);
    if (farFromFollowTarget) {
      desiredVelocitySecPerSec = Math.max(
        minRevealRateSecPerSec,
        desiredVelocitySecPerSec
      );
    }
    desiredVelocitySecPerSec = Math.max(
      0,
      Math.min(maxRevealRateSecPerSec, desiredVelocitySecPerSec)
    );
  }
  return {
    desiredVelocitySecPerSec,
    followTargetEndSec,
    followDistanceSec,
    minRevealRateSecPerSec,
    maxRevealRateSecPerSec,
  };
}

export function getForecastRevealEffectiveStartDelayMs(
  state,
  targetEndSec,
  animatedEndSec,
  historyEndSec
) {
  const configuredDelayMs = Math.max(0, Number(state.startDelayMs ?? 0));
  if (configuredDelayMs <= 0) return 0;
  const { followDistanceSec } = getForecastRevealDesiredVelocitySecPerSec(
    state,
    targetEndSec,
    animatedEndSec,
    historyEndSec
  );
  if (
    followDistanceSec >=
    Math.max(6, Number(state.followGapSec ?? 0) * 0.33)
  ) {
    return 0;
  }
  return configuredDelayMs;
}

export function resetForecastReveal(
  state,
  animatedEndSec,
  targetEndSec,
  historyEndSec,
  nowMs
) {
  const historyEnd = Math.max(0, Math.floor(historyEndSec ?? 0));
  const animatedEnd = Math.max(
    historyEnd,
    Math.floor(animatedEndSec ?? historyEnd)
  );
  const targetEnd = Math.max(
    animatedEnd,
    Math.floor(targetEndSec ?? animatedEnd)
  );
  state.animatedEndSec = animatedEnd;
  state.targetEndSec = targetEnd;
  state.lastTickMs = nowMs;
  state.historyEndSec = historyEnd;
  state.visibleEndSec = animatedEnd;
  const initialVelocity = getForecastRevealDesiredVelocitySecPerSec(
    state,
    targetEnd,
    animatedEnd,
    historyEnd
  ).desiredVelocitySecPerSec;
  state.velocitySecPerSec =
    initialVelocity > 0
      ? Math.max(0, Math.min(initialVelocity, Number(initialVelocity)))
      : 0;
  state.delayUntilMs =
    nowMs +
    getForecastRevealEffectiveStartDelayMs(
      state,
      targetEnd,
      animatedEnd,
      historyEnd
    );
}

export function restartForecastRevealFrom(
  state,
  startSec,
  opts = {},
  {
    actualHistoryEndSec,
    actualForecastCoverageEndSec,
    nowMs,
    activeForecastPreviewSec,
  } = {}
) {
  state.paused = false;
  state.playheadFollowEnabled = true;
  state.previewSec = activeForecastPreviewSec;
  state.previewLastRefreshMs = 0;
  const actualHistoryEnd = Math.max(0, Math.floor(actualHistoryEndSec ?? 0));
  const displayHistoryEndSec = getDisplayHistoryEndSec(state, actualHistoryEnd);
  const actualForecastEnd = Math.max(
    actualHistoryEnd,
    Math.floor(actualForecastCoverageEndSec ?? actualHistoryEnd)
  );
  const maxRestartSec =
    opts?.allowForecastStart === true
      ? Math.max(actualForecastEnd, Math.floor(startSec ?? actualHistoryEnd))
      : actualHistoryEnd;
  const normalizedStartSec = Math.max(
    0,
    Math.min(Math.floor(startSec ?? actualHistoryEnd), maxRestartSec)
  );
  const requestedRevealEndSec = Number.isFinite(opts?.revealTargetEndSec)
    ? Math.max(normalizedStartSec, Math.floor(opts.revealTargetEndSec))
    : actualForecastEnd;
  state.capEndSec = Number.isFinite(opts?.revealTargetEndSec)
    ? requestedRevealEndSec
    : null;
  const revealTargetEndSec = Math.max(
    displayHistoryEndSec,
    Math.min(actualForecastEnd, requestedRevealEndSec)
  );
  state.startSecOverride =
    normalizedStartSec <= actualForecastEnd ? normalizedStartSec : null;
  resetForecastReveal(
    state,
    Math.max(displayHistoryEndSec, normalizedStartSec),
    revealTargetEndSec,
    displayHistoryEndSec,
    nowMs
  );
  const extraStartDelayMs = Math.max(0, Number(opts?.extraStartDelayMs ?? 0));
  if (extraStartDelayMs > 0) {
    state.delayUntilMs = Math.max(
      state.delayUntilMs,
      nowMs + extraStartDelayMs
    );
  }
}

export function clearForecastRevealStartOverride(state) {
  if (!Number.isFinite(state.startSecOverride)) return false;
  state.startSecOverride = null;
  return true;
}

export function getAnimatedForecastCoverageEndSec(
  state,
  nowMs,
  historyEndSec,
  presentationSuspended = false
) {
  const historyEnd = Math.max(0, Math.floor(historyEndSec ?? 0));
  state.historyEndSec = historyEnd;
  const targetEnd = Math.max(
    historyEnd,
    Math.floor(state.targetEndSec ?? historyEnd)
  );
  const currentEnd = Math.max(
    historyEnd,
    Number(state.animatedEndSec ?? historyEnd)
  );
  if (state.paused || presentationSuspended) {
    state.lastTickMs = nowMs;
    state.visibleEndSec = currentEnd;
    return currentEnd;
  }
  if (targetEnd <= currentEnd) {
    state.animatedEndSec = targetEnd;
    state.lastTickMs = nowMs;
    state.visibleEndSec = targetEnd;
    state.velocitySecPerSec = 0;
    if (nowMs >= state.delayUntilMs) {
      state.delayUntilMs = 0;
    }
    return targetEnd;
  }
  const effectiveStartMs = Math.max(state.lastTickMs, state.delayUntilMs);
  const elapsedMs = Math.max(0, nowMs - effectiveStartMs);
  state.lastTickMs = nowMs;
  if (elapsedMs <= 0) return currentEnd;
  state.delayUntilMs = 0;
  const elapsedSec = elapsedMs / 1000;
  const {
    desiredVelocitySecPerSec: targetVelocitySecPerSec,
    followTargetEndSec,
    maxRevealRateSecPerSec,
  } = getForecastRevealDesiredVelocitySecPerSec(
    state,
    targetEnd,
    currentEnd,
    historyEnd
  );
  const accelLimitSecPerSec = Math.max(
    1,
    Number(state.accelerationSecPerSec2 ?? 220)
  );
  const decelLimitSecPerSec = Math.max(
    1,
    Number(state.decelerationSecPerSec2 ?? 320)
  );
  const velocityDeltaSecPerSec =
    targetVelocitySecPerSec - state.velocitySecPerSec;
  const maxVelocityStepSecPerSec =
    velocityDeltaSecPerSec >= 0
      ? accelLimitSecPerSec * elapsedSec
      : decelLimitSecPerSec * elapsedSec;
  const clampedVelocityDeltaSecPerSec = Math.max(
    -maxVelocityStepSecPerSec,
    Math.min(maxVelocityStepSecPerSec, velocityDeltaSecPerSec)
  );
  state.velocitySecPerSec = Math.max(
    0,
    Math.min(
      maxRevealRateSecPerSec,
      state.velocitySecPerSec + clampedVelocityDeltaSecPerSec
    )
  );
  const revealDeltaSec = elapsedSec * state.velocitySecPerSec;
  const maxVisibleEndSec =
    state.followGapSec > 0 ? followTargetEndSec : targetEnd;
  const animatedEnd = Math.min(maxVisibleEndSec, currentEnd + revealDeltaSec);
  state.animatedEndSec = Math.max(historyEnd, animatedEnd);
  state.visibleEndSec = state.animatedEndSec;
  return state.animatedEndSec;
}

export function syncForecastRevealTarget(
  state,
  actualCoverageEndSec,
  historyEndSec,
  nowMs,
  onReset = null
) {
  const historyEnd = Math.max(0, Math.floor(historyEndSec ?? 0));
  const previousHistoryEnd = Math.max(
    0,
    Math.floor(state.historyEndSec ?? 0)
  );
  const uncappedActualEnd = Math.max(
    historyEnd,
    Math.floor(actualCoverageEndSec ?? historyEnd)
  );
  const actualEnd = Number.isFinite(state.capEndSec)
    ? Math.max(
        historyEnd,
        Math.min(uncappedActualEnd, Math.floor(state.capEndSec))
      )
    : uncappedActualEnd;
  const targetEnd = Math.max(
    historyEnd,
    Math.floor(state.targetEndSec ?? historyEnd)
  );
  const hasRevealState =
    Number.isFinite(state.targetEndSec) &&
    Number.isFinite(state.animatedEndSec);

  if (
    !hasRevealState ||
    historyEnd < previousHistoryEnd ||
    actualEnd < targetEnd ||
    actualEnd < state.animatedEndSec
  ) {
    resetForecastReveal(state, historyEnd, actualEnd, historyEnd, nowMs);
    onReset?.();
    return state.animatedEndSec;
  }

  if (historyEnd !== previousHistoryEnd) {
    const clampedAnimatedEnd = Math.max(
      historyEnd,
      Number(state.animatedEndSec ?? historyEnd)
    );
    state.animatedEndSec = clampedAnimatedEnd;
    state.visibleEndSec = clampedAnimatedEnd;
    state.targetEndSec = Math.max(actualEnd, clampedAnimatedEnd);
    state.historyEndSec = historyEnd;
  }

  if (actualEnd > targetEnd) {
    state.targetEndSec = actualEnd;
    state.historyEndSec = historyEnd;
    return state.animatedEndSec;
  }

  return state.animatedEndSec;
}

export function resolveForecastRevealPlayheadFollowSec(
  state,
  {
    isScrubbing,
    latchedForecastScrubSec,
    previewStatus,
    visibleForecastCoverageEndSec,
    minSec = 0,
    maxSec = Number.POSITIVE_INFINITY,
  } = {}
) {
  const preview =
    previewStatus && typeof previewStatus === "object" ? previewStatus : null;
  const activeForecastPreviewSec =
    preview?.isForecastPreview === true && Number.isFinite(preview?.previewSec)
      ? preview.previewSec
      : null;
  const isAutomaticRevealPreview =
    state.playheadFollowEnabled === true &&
    Number.isFinite(activeForecastPreviewSec) &&
    Number.isFinite(state.previewSec) &&
    Math.floor(activeForecastPreviewSec) === Math.floor(state.previewSec);
  return resolveForecastRevealPlayheadSec({
    followEnabled: state.playheadFollowEnabled,
    isScrubbing,
    latchedForecastScrubSec,
    forecastPreviewSec: isAutomaticRevealPreview
      ? null
      : activeForecastPreviewSec,
    visibleForecastCoverageEndSec,
    minSec,
    maxSec,
  });
}

export function resolveForecastRevealPreviewTarget(
  state,
  visibleForecastCoverageEndSec,
  nowMs,
  {
    presentationSuspended = false,
    canAutoPreview = true,
    isScrubbing = false,
    latchedForecastScrubSec = null,
    historyEndSec = 0,
  } = {}
) {
  if (
    presentationSuspended ||
    state.playheadFollowEnabled !== true ||
    canAutoPreview !== true ||
    isScrubbing ||
    Number.isFinite(latchedForecastScrubSec) ||
    !Number.isFinite(visibleForecastCoverageEndSec)
  ) {
    return null;
  }
  const historyEnd = Math.max(0, Math.floor(historyEndSec ?? 0));
  const targetSec = Math.max(
    historyEnd,
    Math.floor(visibleForecastCoverageEndSec)
  );
  if (
    targetSec <= historyEnd ||
    targetSec === state.previewSec ||
    nowMs - state.previewLastRefreshMs < FORECAST_REVEAL_PREVIEW_REFRESH_MS
  ) {
    return null;
  }
  return targetSec;
}

export function markForecastRevealPreview(state, targetSec, nowMs) {
  state.previewSec = targetSec;
  state.previewLastRefreshMs = nowMs;
}
