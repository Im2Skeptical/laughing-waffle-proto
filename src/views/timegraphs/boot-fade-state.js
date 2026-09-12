import { clamp01 } from "../timegraphs-helpers.js";
import { GRAPH_BOOT_FADE_FRAME_MS } from "./constants.js";

export function createBootFadeState({
  durationMs = 0,
  color = 0x000000,
} = {}) {
  return {
    durationMs: Math.max(0, Number(durationMs ?? 0)),
    color: Number.isFinite(color) ? Math.max(0, Math.floor(color)) : 0x000000,
    transition: null,
  };
}

export function beginBootFadeTransition(state, nowMs) {
  state.transition =
    state.durationMs > 0
      ? {
          startedMs: nowMs,
          durationMs: state.durationMs,
          color: state.color,
        }
      : null;
}

export function clearBootFadeTransition(state) {
  state.transition = null;
}

export function getBootFadeRenderState(state, nowMs) {
  const transition = state.transition;
  if (!transition) return null;
  const durationMs = Math.max(0, Number(transition.durationMs ?? 0));
  if (durationMs <= 0) {
    state.transition = null;
    return null;
  }
  const elapsedMs = Math.max(
    0,
    nowMs - Math.max(0, Number(transition.startedMs ?? nowMs))
  );
  const progress = clamp01(elapsedMs / durationMs);
  const alpha = Math.max(0, 1 - progress);
  if (alpha <= 0.001) {
    state.transition = null;
    return null;
  }
  return {
    color: Number.isFinite(transition.color) ? transition.color : state.color,
    alpha,
    key: Math.floor(elapsedMs / GRAPH_BOOT_FADE_FRAME_MS),
  };
}
