import { blendColor, clamp01, lerpNumber } from "../timegraphs-helpers.js";
import {
  PROJECTION_REPLACEMENT_ANIMATION_FRAME_MS,
  PROJECTION_REPLACEMENT_DIM_ALPHA,
  PROJECTION_REPLACEMENT_DIM_LINE_ALPHA,
  PROJECTION_REPLACEMENT_FLASH_ALPHA,
  PROJECTION_REPLACEMENT_FLASH_LINE_ALPHA,
  TIMEGRAPH_THEME,
} from "./constants.js";

export function createProjectionReplacementState() {
  return {
    staged: null,
    active: null,
  };
}

export function clearProjectionReplacementTransition(state) {
  state.staged = null;
  state.active = null;
}

export function clearStagedProjectionReplacement(state) {
  state.staged = null;
}

export function getProjectionReplacementScaleRanges(state) {
  const ranges = state.active?.snapshot?.seriesScaleRanges;
  return ranges instanceof Map ? ranges : null;
}

export function getProjectionReplacementMaxFloorSec(state) {
  return Number.isFinite(state.active?.maxSecFloor)
    ? Math.max(0, Math.floor(state.active.maxSecFloor))
    : null;
}

export function getProjectionReplacementDebugState(state) {
  return state.active
    ? {
        active: true,
        truncationStartSec: Math.max(
          0,
          Math.floor(state.active.truncationStartSec ?? 0)
        ),
        maxSecFloor: Number.isFinite(state.active.maxSecFloor)
          ? Math.max(0, Math.floor(state.active.maxSecFloor))
          : null,
        hasSnapshot: !!state.active.snapshot,
      }
    : null;
}

export function stageProjectionReplacementTransition(
  state,
  {
    snapshot,
    truncationStartSec,
    maxSecFloor,
    fallbackMaxSec,
    transitionDurationMs = 0,
    flashDurationMs = 0,
    fadeStrength = 1,
  } = {}
) {
  const points = Array.isArray(snapshot?.pointsForDraw)
    ? snapshot.pointsForDraw
    : [];
  if (!points.length) {
    state.staged = null;
    return false;
  }
  const normalizedTruncationStartSec = Math.max(
    0,
    Math.floor(
      truncationStartSec ??
        snapshot?.displayHistoryEndSec ??
        snapshot?.historyEndSec ??
        0
    )
  );
  const normalizedMaxSecFloor = Math.max(
    normalizedTruncationStartSec + 1,
    Math.floor(maxSecFloor ?? fallbackMaxSec ?? normalizedTruncationStartSec + 1)
  );
  state.staged = {
    snapshot,
    truncationStartSec: normalizedTruncationStartSec,
    maxSecFloor: normalizedMaxSecFloor,
    transitionDurationMs: Math.max(0, Number(transitionDurationMs ?? 0)),
    flashDurationMs: Math.max(0, Number(flashDurationMs ?? 0)),
    fadeStrength: clamp01(fadeStrength),
  };
  return true;
}

export function activateProjectionReplacementTransition(
  state,
  nowMs,
  opts = {}
) {
  if (opts?.activateProjectionReplacementTransition === true) {
    state.active = state.staged
      ? {
          ...state.staged,
          startedMs: nowMs,
        }
      : null;
    state.staged = null;
    return;
  }
  state.staged = null;
  if (opts?.clearProjectionReplacementTransition === true) {
    state.active = null;
  }
}

export function buildProjectionReplacementRenderState(
  state,
  nowMs,
  lineDrawEndSec
) {
  const overlay = state.active;
  if (!overlay) return null;
  const fadeStrength = clamp01(overlay.fadeStrength ?? 1);
  const truncationStartSec = Math.max(
    0,
    Math.floor(overlay.truncationStartSec ?? 0)
  );
  const maxSecFloor = Math.max(
    truncationStartSec + 1,
    Math.floor(overlay.maxSecFloor ?? truncationStartSec + 1)
  );
  const activeStartSec = Math.max(
    truncationStartSec,
    Math.floor(lineDrawEndSec ?? truncationStartSec)
  );
  if (activeStartSec >= maxSecFloor) {
    state.active = null;
    return null;
  }
  const transitionDurationMs = Math.max(
    0,
    Number(overlay.transitionDurationMs ?? 0)
  );
  const flashDurationMs = Math.max(
    0,
    Math.min(
      transitionDurationMs,
      Number(overlay.flashDurationMs ?? transitionDurationMs)
    )
  );
  const elapsedMs = Math.max(
    0,
    nowMs - Math.max(0, Number(overlay.startedMs ?? nowMs))
  );
  const flashProgress =
    flashDurationMs > 0 ? clamp01(elapsedMs / flashDurationMs) : 1;
  const fadeDurationMs = Math.max(0, transitionDurationMs - flashDurationMs);
  const fadeProgress =
    elapsedMs <= flashDurationMs
      ? 0
      : fadeDurationMs > 0
        ? clamp01((elapsedMs - flashDurationMs) / fadeDurationMs)
        : 1;
  const settled = elapsedMs >= transitionDurationMs;
  const tintColor = settled
    ? TIMEGRAPH_THEME.panelBorder
    : elapsedMs < flashDurationMs
      ? TIMEGRAPH_THEME.eventMarkerCritical
      : blendColor(
          TIMEGRAPH_THEME.eventMarkerCritical,
          TIMEGRAPH_THEME.panelBorder,
          fadeProgress
        );
  const zoneColor = settled
    ? TIMEGRAPH_THEME.panelBorder
    : blendColor(
        TIMEGRAPH_THEME.eventMarkerCritical,
        TIMEGRAPH_THEME.panelBodyBg,
        elapsedMs < flashDurationMs
          ? flashProgress * 0.35
          : 0.55 + fadeProgress * 0.45
      );
  const zoneAlpha = settled
    ? PROJECTION_REPLACEMENT_DIM_ALPHA
    : lerpNumber(
        PROJECTION_REPLACEMENT_FLASH_ALPHA,
        PROJECTION_REPLACEMENT_DIM_ALPHA,
        elapsedMs < flashDurationMs ? 0 : fadeProgress
      );
  const lineAlpha = settled
    ? lerpNumber(1, PROJECTION_REPLACEMENT_DIM_LINE_ALPHA, fadeStrength)
    : lerpNumber(
        PROJECTION_REPLACEMENT_FLASH_LINE_ALPHA,
        lerpNumber(1, PROJECTION_REPLACEMENT_DIM_LINE_ALPHA, fadeStrength),
        elapsedMs < flashDurationMs ? 0 : fadeProgress
      );
  const settledZoneAlpha = lerpNumber(
    0,
    PROJECTION_REPLACEMENT_DIM_ALPHA,
    fadeStrength
  );
  const tintStrength = settled
    ? lerpNumber(0, 0.88, fadeStrength)
    : lerpNumber(
        0.74,
        lerpNumber(0, 0.88, fadeStrength),
        fadeProgress
      );
  return {
    snapshot: overlay.snapshot,
    unchangedStartSec: Math.floor(lineDrawEndSec ?? truncationStartSec),
    unchangedEndSec: Math.min(truncationStartSec, maxSecFloor),
    drawStartSec: activeStartSec,
    drawEndSec: maxSecFloor,
    maxSecFloor,
    zoneColor,
    zoneAlpha: settled ? settledZoneAlpha : zoneAlpha,
    tintColor,
    tintStrength,
    lineAlpha,
    settled,
    transitionAnimating: elapsedMs < transitionDurationMs,
  };
}

export function getProjectionReplacementRenderKey(state, nowMs) {
  const overlay = state.active;
  if (!overlay) return "";
  const transitionDurationMs = Math.max(
    0,
    Number(overlay.transitionDurationMs ?? 0)
  );
  const elapsedMs = Math.max(
    0,
    nowMs - Math.max(0, Number(overlay.startedMs ?? nowMs))
  );
  if (elapsedMs >= transitionDurationMs) {
    return "";
  }
  const phaseBucket = Math.floor(
    elapsedMs / PROJECTION_REPLACEMENT_ANIMATION_FRAME_MS
  );
  return `${Math.floor(overlay.truncationStartSec ?? 0)}:${Math.floor(
    overlay.maxSecFloor ?? 0
  )}:${phaseBucket}`;
}
