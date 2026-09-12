import {
  TIME_BOUNDS_ANIMATION_MAX_RATE_SEC_PER_SEC,
  TIME_BOUNDS_ANIMATION_MIN_RATE_SEC_PER_SEC,
  TIME_BOUNDS_ANIMATION_TARGET_DURATION_SEC,
} from "./constants.js";

export function createTimeBoundsState() {
  return {
    minSec: 0,
    maxSec: 0,
    animatedMinSec: null,
    animatedMaxSec: null,
    animatedBoundsLastTickMs: 0,
  };
}

export function clearAnimatedTimeBounds(state) {
  state.animatedMinSec = null;
  state.animatedMaxSec = null;
  state.animatedBoundsLastTickMs = 0;
}

export function resetAnimatedTimeBounds(state, nextMinSec, nextMaxSec, nowMs) {
  state.animatedMinSec = Math.max(0, Math.floor(nextMinSec ?? 0));
  state.animatedMaxSec = Math.max(
    state.animatedMinSec + 1,
    Math.floor(nextMaxSec ?? state.animatedMinSec + 1)
  );
  state.animatedBoundsLastTickMs = nowMs;
  state.minSec = state.animatedMinSec;
  state.maxSec = state.animatedMaxSec;
}

export function animateBoundToward(current, target, elapsedMs) {
  if (!Number.isFinite(current)) return Math.floor(target ?? 0);
  const safeTarget = Math.floor(target ?? current);
  if (safeTarget === current) return current;
  const delta = safeTarget - current;
  const stepMagnitude = Math.max(
    TIME_BOUNDS_ANIMATION_MIN_RATE_SEC_PER_SEC,
    Math.min(
      TIME_BOUNDS_ANIMATION_MAX_RATE_SEC_PER_SEC,
      Math.abs(delta) /
        Math.max(0.05, TIME_BOUNDS_ANIMATION_TARGET_DURATION_SEC)
    )
  ) * (Math.max(0, elapsedMs) / 1000);
  const step = Math.max(1, Math.floor(stepMagnitude));
  if (delta > 0) {
    return Math.min(safeTarget, current + step);
  }
  return Math.max(safeTarget, current - step);
}

export function setTimeBounds(
  state,
  nextMinSec,
  nextMaxSec,
  { animate = false, nowMs } = {}
) {
  const nextMin = Math.max(0, Math.floor(nextMinSec ?? 0));
  const nextMax = Math.max(nextMin + 1, Math.floor(nextMaxSec ?? nextMin + 1));
  if (animate !== true) {
    resetAnimatedTimeBounds(state, nextMin, nextMax, nowMs);
    return;
  }
  if (!Number.isFinite(state.animatedMinSec) || !Number.isFinite(state.animatedMaxSec)) {
    resetAnimatedTimeBounds(state, nextMin, nextMax, nowMs);
    return;
  }

  const elapsedMs = Math.max(
    0,
    nowMs - (Number.isFinite(state.animatedBoundsLastTickMs)
      ? state.animatedBoundsLastTickMs
      : nowMs)
  );
  state.animatedBoundsLastTickMs = nowMs;
  state.animatedMinSec = animateBoundToward(state.animatedMinSec, nextMin, elapsedMs);
  state.animatedMaxSec = animateBoundToward(state.animatedMaxSec, nextMax, elapsedMs);

  if (nextMin > state.animatedMinSec) {
    state.animatedMinSec = nextMin;
  }

  state.minSec = Math.max(0, Math.floor(state.animatedMinSec));
  state.maxSec = Math.max(state.minSec + 1, Math.floor(state.animatedMaxSec));
}
