// src/views/sunandmoon-disks-pixi.js
// Two rotating HUD disks: Moon cycle + Season cycle.
// Pure view module: reads state and dispatches scrub/commit intents only.

import {
  MOON_PHASE_OFFSET_SEC,
} from "../defs/gamesettings/gamerules-defs.js";
import { MOON_PHASE_DEFS } from "../defs/gamesettings/moon-phase-defs.js";
import { getGameSetting } from "../model/game-config.js";
import {
  getMoonCycleDurationSec,
  getMoonPhaseAtSecond,
} from "../model/moon-phases.js";
import { VIEW_LAYOUT } from "./layout-pixi.js";

export const SUN_AND_MOON_DISKS_LAYOUT = {
  ...VIEW_LAYOUT.sunMoonDisks,
  moon: { ...VIEW_LAYOUT.sunMoonDisks.moon },
  season: { ...VIEW_LAYOUT.sunMoonDisks.season },
};

const TWO_PI = Math.PI * 2;
const DISK_ID_MOON = "moon";
const DISK_ID_SEASON = "season";
const ROTATION_CLOCKWISE = "clockwise";
const ROTATION_ANTICLOCKWISE = "anticlockwise";
const SEASON_COMPANION_MARKER_STEP_RAD = Math.PI / 2;

function clamp01(v) {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function clampInt(v, fallback) {
  const n = Math.floor(v);
  return Number.isFinite(n) ? n : fallback;
}

function clampNonNegativeSec(v, fallback = 0) {
  if (!Number.isFinite(v)) return Math.max(0, Math.floor(fallback));
  return Math.max(0, Math.floor(v));
}

function wrap01(v) {
  if (!Number.isFinite(v)) return 0;
  const wrapped = v - Math.floor(v);
  return clamp01(wrapped);
}

function normalizeSignedAngleDeltaRad(deltaRad) {
  if (!Number.isFinite(deltaRad)) return 0;
  let d = deltaRad;
  while (d > Math.PI) d -= TWO_PI;
  while (d < -Math.PI) d += TWO_PI;
  return d;
}

function getTSecInt(state) {
  const t = Math.floor(state?.tSec ?? 0);
  return Number.isFinite(t) ? Math.max(0, t) : 0;
}

// Scrub correctness: prefer tSec (graph boundary time).
// Live smoothness: if simStepIndex is consistent with tSec, use it for fractional seconds.
function getTimeSecForRotation(state) {
  const tSec = getTSecInt(state);
  const steps = state?.simStepIndex;
  if (Number.isFinite(steps)) {
    const tf = Math.max(0, steps / 60);
    if (Math.floor(tf) === tSec) return tf;
  }
  return tSec;
}

function getDiskLayout(diskId, layout) {
  return diskId === DISK_ID_SEASON ? layout?.season : layout?.moon;
}

function getDiskSecondsPerRevolution(diskId, layout, state = null) {
  if (diskId === DISK_ID_SEASON) {
    const quadrants = Math.max(1, clampInt(layout?.season?.quadrants, 4));
    return Math.max(1, getGameSetting(state, "seasonDurationSec")) * quadrants;
  }
  return getMoonCycleDurationSec(state);
}

function phase01ToRotationRad(phase01, diskLayout) {
  const p = clamp01(phase01);
  const dir = diskLayout?.clockwise ? 1 : -1;
  return (diskLayout?.rotationOffsetRad || 0) + dir * p * TWO_PI;
}

function getMoonOrbitPhase01AtTime(state, timeSec) {
  const cycleSec = getMoonCycleDurationSec(state);
  const offsetSec = clampInt(MOON_PHASE_OFFSET_SEC, Math.floor(cycleSec / 2));
  const t = Math.max(0, Number.isFinite(timeSec) ? timeSec : 0);
  const phaseSec = (t + offsetSec) % cycleSec;
  return clamp01(phaseSec / cycleSec);
}

function getSeasonProgress01(state, timeSec) {
  const seasonLen = Math.max(1, getGameSetting(state, "seasonDurationSec"));

  const remaining = state?.seasonTimeRemaining;
  if (Number.isFinite(remaining)) {
    return clamp01(1 - remaining / seasonLen);
  }

  const clock = state?.seasonClockSec;
  if (Number.isFinite(clock)) {
    return clamp01(clock / seasonLen - Math.floor(clock / seasonLen));
  }

  const t = Math.max(0, Number.isFinite(timeSec) ? timeSec : 0);
  return clamp01(((t % seasonLen) / seasonLen) || 0);
}

function getSeasonWheelPhase01(state, timeSec, quadrants) {
  const q = Math.max(1, clampInt(quadrants, 4));
  const idxRaw = state?.currentSeasonIndex;
  const idx = Number.isFinite(idxRaw) ? Math.floor(idxRaw) : 0;
  const wrappedIdx = ((idx % q) + q) % q;
  const progress = getSeasonProgress01(state, timeSec);
  return clamp01((wrappedIdx + progress) / q);
}

function getDiskPhase01AtTime(diskId, state, timeSec, layout) {
  if (diskId === DISK_ID_SEASON) {
    const quadrants = Math.max(1, clampInt(layout?.season?.quadrants, 4));
    return getSeasonWheelPhase01(state, timeSec, quadrants);
  }
  return getMoonOrbitPhase01AtTime(state, timeSec);
}

function getDiskPlayheadOffsetRad(diskId, layout) {
  const diskLayout = getDiskLayout(diskId, layout) || {};
  return Number.isFinite(diskLayout.playheadOffsetRad)
    ? diskLayout.playheadOffsetRad
    : 0;
}

function getDiskPlayheadAngleRad(diskId, layout) {
  const diskLayout = getDiskLayout(diskId, layout) || {};
  const phaseZeroAngle = phase01ToRotationRad(0, diskLayout);
  return phaseZeroAngle + getDiskPlayheadOffsetRad(diskId, layout);
}

function getDiskRingAngleAtSecond({
  diskId,
  state,
  fromTimeSec,
  targetSec,
  layout,
}) {
  if (!state) return getDiskPlayheadAngleRad(diskId, layout);

  const fromSec = Number.isFinite(fromTimeSec) ? fromTimeSec : 0;
  const toSec = Number.isFinite(targetSec) ? targetSec : fromSec;
  const secPerRev = getDiskSecondsPerRevolution(diskId, layout, state);
  const basePhase = getDiskPhase01AtTime(diskId, state, fromSec, layout);
  const deltaPhase = (toSec - fromSec) / Math.max(1, secPerRev);
  const phase = wrap01(basePhase + deltaPhase);
  const diskRotation = phase01ToRotationRad(phase, getDiskLayout(diskId, layout));
  return diskRotation + getDiskPlayheadOffsetRad(diskId, layout);
}

function getDragRingAngleFromAnchorRad(
  diskId,
  layout,
  state,
  dragStartSec,
  targetSec,
  anchorAngleRad
) {
  const startSec = Number.isFinite(dragStartSec) ? dragStartSec : 0;
  const endSec = Number.isFinite(targetSec) ? targetSec : startSec;
  const secPerRev = getDiskSecondsPerRevolution(diskId, layout, state);
  const diskLayout = getDiskLayout(diskId, layout) || {};
  const dir = diskLayout.clockwise ? 1 : -1;
  const deltaPhase = (endSec - startSec) / Math.max(1, secPerRev);
  const anchor = Number.isFinite(anchorAngleRad)
    ? anchorAngleRad
    : getDiskPlayheadAngleRad(diskId, layout);
  return anchor + dir * deltaPhase * TWO_PI;
}

function getFrontierSec({ getTimeline, getState }) {
  const timeline = typeof getTimeline === "function" ? getTimeline() : null;
  const timelineSec = Math.floor(timeline?.historyEndSec ?? -1);
  if (Number.isFinite(timelineSec) && timelineSec >= 0) {
    return timelineSec;
  }
  const state = typeof getState === "function" ? getState() : null;
  return getTSecInt(state);
}

export function clampDiskHistoryBrowseTargetSec(dragSec, frontierSec) {
  const frontier = clampNonNegativeSec(frontierSec, 0);
  const target = clampNonNegativeSec(dragSec, frontier);
  return Math.max(0, Math.min(frontier, target));
}

export function clampDiskForecastPreviewTargetSec(
  dragSec,
  frontierSec,
  revealCapSec
) {
  const frontier = clampNonNegativeSec(frontierSec, 0);
  const target = clampNonNegativeSec(dragSec, frontier);
  const revealCap = clampNonNegativeSec(revealCapSec, frontier);
  return Math.max(frontier, Math.min(target, Math.max(frontier, revealCap)));
}

function getSpritePointerAngleRad(sprite, globalPoint) {
  if (!sprite || !globalPoint) return null;
  const center = sprite.getGlobalPosition();
  const dx = globalPoint.x - center.x;
  const dy = globalPoint.y - center.y;
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return null;
  if (dx === 0 && dy === 0) return null;
  return Math.atan2(dy, dx);
}

function drawInwardPlayheadTriangle(
  gfx,
  cx,
  cy,
  angleRad,
  {
    tipRadius,
    baseRadius,
    halfWidth,
    fillColor = 0xffffff,
    fillAlpha = 0.96,
    strokeColor = 0x0f1220,
    strokeAlpha = 0.95,
    strokeWidth = 2,
  } = {}
) {
  const tipX = cx + Math.cos(angleRad) * tipRadius;
  const tipY = cy + Math.sin(angleRad) * tipRadius;

  const baseCx = cx + Math.cos(angleRad) * baseRadius;
  const baseCy = cy + Math.sin(angleRad) * baseRadius;

  const px = Math.cos(angleRad + Math.PI * 0.5) * halfWidth;
  const py = Math.sin(angleRad + Math.PI * 0.5) * halfWidth;

  const b1x = baseCx + px;
  const b1y = baseCy + py;
  const b2x = baseCx - px;
  const b2y = baseCy - py;

  gfx.lineStyle(strokeWidth, strokeColor, strokeAlpha);
  gfx.beginFill(fillColor, fillAlpha);
  gfx.drawPolygon([tipX, tipY, b1x, b1y, b2x, b2y]);
  gfx.endFill();
}

export function createSunAndMoonDisksView({
  app,
  layer,
  getState,
  getDiskVisibility,
  getTimeline,
  getEditableHistoryBounds,
  getForecastPreviewCapSec,
  browseCursorSecond,
  commitCursorSecond,
  previewCursorSecond,
  clearPreviewState,
  commitPreviewToLive,
  requestPauseBeforeDrag,
  tooltipView,
  layout = SUN_AND_MOON_DISKS_LAYOUT,
} = {}) {
let root = null;
let moonSprite = null;
let seasonSprite = null;
let phaseIconLayer = null;
let phaseIconEntries = [];
let hoveredPhaseId = null;
let lastTooltipSecond = null;
let feedbackGraphics = null;
let feedbackText = null;
  let lastEnabled = null;

  let dragSession = null;
  const ringMarkerAngleByDisk = {
    [DISK_ID_MOON]: null,
    [DISK_ID_SEASON]: null,
  };

  let browseRafId = 0;
  let pendingBrowseSec = null;
  let commitRafId = 0;
  let pendingCommitSec = null;
  let previewRafId = 0;
  let pendingPreviewSec = null;

  let stageMoveHandler = null;
  let stageUpHandler = null;
  let stageListenersBound = false;
  let lastStageMovePointerId = null;
  let lastStageMoveX = null;
  let lastStageMoveY = null;

  function getSpriteByDiskId(diskId) {
    return diskId === DISK_ID_SEASON ? seasonSprite : moonSprite;
  }

  function resolveDiskVisibility(state) {
    const raw =
      typeof getDiskVisibility === "function" ? getDiskVisibility(state) : null;
    if (!raw || typeof raw !== "object") {
      return { moon: true, season: true };
    }
    return {
      moon: raw.moon !== false,
      season: raw.season !== false,
    };
  }

  function isDiskVisible(diskId, visibility) {
    if (!visibility || typeof visibility !== "object") return true;
    return diskId === DISK_ID_SEASON ? visibility.season !== false : visibility.moon !== false;
  }

  function getFeedbackDiskId(visibility) {
    if (dragSession && isDiskVisible(dragSession.diskId, visibility)) {
      return dragSession.diskId;
    }
    if (isDiskVisible(DISK_ID_SEASON, visibility)) return DISK_ID_SEASON;
    if (isDiskVisible(DISK_ID_MOON, visibility)) return DISK_ID_MOON;
    return null;
  }

  function sumRegionValues(turn, phaseId, read) {
    return Object.values(turn?.regions ?? {}).reduce(
      (sum, region) => sum + (Number(read(region?.[phaseId])) || 0),
      0
    );
  }

  function buildPhaseTooltipSpec(state, phaseDef) {
    const current = state?.civilization?.currentMoonTurn ?? null;
    const fallback = state?.civilization?.lastMoonTurn ?? null;
    const hasCurrentResult = Object.values(current?.regions ?? {})
      .some((region) => region?.[phaseDef.id] != null);
    const turn = hasCurrentResult ? current : fallback;
    const rows = [];
    if (phaseDef.id === "birth") {
      rows.push(
        { label: "Births", value: sumRegionValues(turn, "birth", (v) =>
          Object.values(v?.byClass ?? {}).reduce((n, c) => n + (c?.births ?? 0), 0)) },
        { label: "Became adults", value: sumRegionValues(turn, "birth", (v) =>
          Object.values(v?.byClass ?? {}).reduce((n, c) => n + (c?.matured ?? 0), 0)) },
        { label: "Became elders", value: sumRegionValues(turn, "birth", (v) =>
          Object.values(v?.byClass ?? {}).reduce((n, c) => n + (c?.newElders ?? 0), 0)) }
      );
    } else if (phaseDef.id === "food") {
      rows.push(
        { label: "Meal demand", value: sumRegionValues(turn, "food", (v) => v?.demand) },
        { label: "Food eaten", value: sumRegionValues(turn, "food", (v) => v?.consumed) },
        { label: "Food migrants", value: sumRegionValues(turn, "food", (v) =>
          Object.values(v?.byClass ?? {}).reduce((n, c) => n + (c?.migrants ?? 0), 0)) }
      );
    } else if (phaseDef.id === "housing") {
      rows.push(
        { label: "Population assessed", value: sumRegionValues(turn, "housing", (v) => v?.population) },
        { label: "Housing capacity", value: sumRegionValues(turn, "housing", (v) => v?.capacity) },
        { label: "Housing migrants", value: sumRegionValues(turn, "housing", (v) => v?.migrants) }
      );
    } else if (phaseDef.id === "faith") {
      rows.push(
        { label: "Faith shifts", value: sumRegionValues(turn, "faith", (v) =>
          Object.values(v?.byClass ?? {}).filter((c) => c?.faithShifted).length) },
        { label: "Faith migrants", value: sumRegionValues(turn, "faith", (v) =>
          Object.values(v?.byClass ?? {}).reduce((n, c) => n + (c?.displaced ?? 0), 0)) },
        { label: "Chaos this moon", value: state?.civilization?.chaos?.lastMoonIncome?.totalIncome ?? 0 }
      );
    } else if (phaseDef.id === "migration") {
      rows.push(
        { label: "Requested", value: (turn?.migrationIntentSummaries ?? [])
          .reduce((n, intent) => n + (intent?.requested ?? 0), 0) },
        { label: "Moved", value: (turn?.movements ?? [])
          .reduce((n, move) => n + (move?.amount ?? 0), 0) },
        { label: "Unplaced", value: (turn?.unresolved ?? [])
          .reduce((n, entry) => n + (entry?.count ?? 0), 0) }
      );
    } else if (phaseDef.id === "death") {
      rows.push(
        { label: "Arrival deaths", value: sumRegionValues(turn, "death", (v) => v?.arrivalDeaths) },
        { label: "Hardship deaths", value: sumRegionValues(turn, "death", (v) => v?.hardshipDeaths) },
        { label: "Natural deaths", value: sumRegionValues(turn, "death", (v) =>
          Object.values(v?.byClass ?? {}).reduce((n, c) => n + (c?.naturalDeaths ?? 0), 0)) },
        { label: "Food rotted", value: Math.round(100 * (
          sumRegionValues(turn, "death", (v) => v?.storedFoodRot)
          + sumRegionValues(turn, "death", (v) => v?.looseFoodRot)
        )) / 100 }
      );
    }
    return {
      title: `${phaseDef.label} phase`,
      subtitle: hasCurrentResult ? "Current moon" : turn ? "Previous moon" : "Not yet resolved",
      sections: [
        { type: "paragraph", text: phaseDef.summary },
        { type: "table", title: "Civilization", rows },
      ],
      maxWidth: 310,
    };
  }

  function showPhaseTooltip(phaseId) {
    const entry = phaseIconEntries.find((item) => item.phase.id === phaseId);
    const state = getState?.();
    if (!entry || !state || !tooltipView) return;
    tooltipView.show(buildPhaseTooltipSpec(state, entry.phase), entry.container.getBounds());
    lastTooltipSecond = getTSecInt(state);
  }

  function flushBrowseRequest() {
    browseRafId = 0;
    const sec = pendingBrowseSec;
    pendingBrowseSec = null;
    if (!Number.isFinite(sec)) return;
    browseCursorSecond?.(Math.max(0, Math.floor(sec)));
  }

  function clearBrowseRequest() {
    if (browseRafId && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(browseRafId);
    }
    browseRafId = 0;
    pendingBrowseSec = null;
  }

  function queueBrowseSecond(sec) {
    clearCommitRequest();
    clearPreviewRequest();
    pendingBrowseSec = Math.max(0, Math.floor(sec));
    if (browseRafId) return;
    if (typeof requestAnimationFrame === "function") {
      browseRafId = requestAnimationFrame(flushBrowseRequest);
      return;
    }
    flushBrowseRequest();
  }

  function flushCommitRequest() {
    commitRafId = 0;
    const sec = pendingCommitSec;
    pendingCommitSec = null;
    if (!Number.isFinite(sec)) return;
    commitCursorSecond?.(Math.max(0, Math.floor(sec)));
  }

  function clearCommitRequest() {
    if (commitRafId && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(commitRafId);
    }
    commitRafId = 0;
    pendingCommitSec = null;
  }

  function queueCommitSecond(sec) {
    clearBrowseRequest();
    clearPreviewRequest();
    pendingCommitSec = Math.max(0, Math.floor(sec));
    if (commitRafId) return;
    if (typeof requestAnimationFrame === "function") {
      commitRafId = requestAnimationFrame(flushCommitRequest);
      return;
    }
    flushCommitRequest();
  }

  function flushPreviewRequest() {
    previewRafId = 0;
    const sec = pendingPreviewSec;
    pendingPreviewSec = null;
    if (!Number.isFinite(sec)) return;
    previewCursorSecond?.(Math.max(0, Math.floor(sec)));
  }

  function clearPreviewRequest() {
    if (previewRafId && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(previewRafId);
    }
    previewRafId = 0;
    pendingPreviewSec = null;
  }

  function queuePreviewSecond(sec) {
    clearBrowseRequest();
    clearCommitRequest();
    pendingPreviewSec = Math.max(0, Math.floor(sec));
    if (previewRafId) return;
    if (typeof requestAnimationFrame === "function") {
      previewRafId = requestAnimationFrame(flushPreviewRequest);
      return;
    }
    flushPreviewRequest();
  }

  function startDrag(diskId, event) {
    if (!event) return;
    if (layout?.enabled === false) return;

    const state = typeof getState === "function" ? getState() : null;
    const visibility = resolveDiskVisibility(state);
    if (!isDiskVisible(diskId, visibility)) return;

    const sprite = getSpriteByDiskId(diskId);
    if (!sprite || sprite.visible === false) return;

    const pointerAngleRad = getSpritePointerAngleRad(sprite, event.global);
    if (!Number.isFinite(pointerAngleRad)) return;

    requestPauseBeforeDrag?.();

    const dragStartSec = getTSecInt(state);
    const markerAnchorRad = Number.isFinite(ringMarkerAngleByDisk[diskId])
      ? ringMarkerAngleByDisk[diskId]
      : getDiskPlayheadAngleRad(diskId, layout);

    dragSession = {
      diskId,
      pointerId: Number.isFinite(event.pointerId) ? event.pointerId : null,
      lastPointerAngleRad: pointerAngleRad,
      dragStartSec,
      dragAnchorRingAngleRad: markerAnchorRad,
      accumSec: 0,
      visualTargetSec: dragStartSec,
      lastRotationDirection: ROTATION_CLOCKWISE,
    };

    if (moonSprite) moonSprite.cursor = "grabbing";
    if (seasonSprite) seasonSprite.cursor = "grabbing";
    event.stopPropagation?.();
  }

  function endDrag() {
    if (!dragSession) return;
    const activeDrag = dragSession;
    const frontierSec = getFrontierSec({ getTimeline, getState });
    const targetSec = Math.max(
      0,
      Math.floor(activeDrag.visualTargetSec ?? activeDrag.dragStartSec ?? frontierSec)
    );
    const isFutureTarget = targetSec > frontierSec;

    if (isFutureTarget && typeof previewCursorSecond === "function") {
      flushPreviewRequest();
      const commitRes = commitPreviewToLive?.();
      if (!commitRes?.ok) {
        commitCursorSecond?.(targetSec);
      }
    } else if (Number.isFinite(pendingCommitSec)) {
      flushCommitRequest();
    } else if (Number.isFinite(pendingBrowseSec)) {
      clearPreviewState?.();
      flushBrowseRequest();
    } else {
      clearPreviewRequest();
      clearPreviewState?.();
    }

    dragSession = null;
    if (moonSprite) moonSprite.cursor = "grab";
    if (seasonSprite) seasonSprite.cursor = "grab";
  }

  function updateDragFromPointerEvent(event) {
    if (!dragSession || !event) return;

    if (
      dragSession.pointerId != null &&
      Number.isFinite(event.pointerId) &&
      event.pointerId !== dragSession.pointerId
    ) {
      return;
    }

    const state = typeof getState === "function" ? getState() : null;
    const visibility = resolveDiskVisibility(state);
    if (!isDiskVisible(dragSession.diskId, visibility)) {
      endDrag();
      return;
    }

    const sprite = getSpriteByDiskId(dragSession.diskId);
    if (!sprite || sprite.visible === false) return;

    const nextPointerAngleRad = getSpritePointerAngleRad(sprite, event.global);
    if (!Number.isFinite(nextPointerAngleRad)) return;

    const angleDeltaRad = normalizeSignedAngleDeltaRad(
      nextPointerAngleRad - dragSession.lastPointerAngleRad
    );
    dragSession.lastPointerAngleRad = nextPointerAngleRad;

    if (Math.abs(angleDeltaRad) > 1e-9) {
      dragSession.lastRotationDirection =
        angleDeltaRad < 0 ? ROTATION_ANTICLOCKWISE : ROTATION_CLOCKWISE;
    }

    const secPerRev = getDiskSecondsPerRevolution(dragSession.diskId, layout, state);
    const diskLayout = getDiskLayout(dragSession.diskId, layout) || {};
    const direction = diskLayout.clockwise ? 1 : -1;
    const deltaPhase = (angleDeltaRad / TWO_PI) * direction;
    const deltaSec = deltaPhase * secPerRev;
    dragSession.accumSec += deltaSec;

    const frontierSec = getFrontierSec({ getTimeline, getState });
    const dragSec = Math.round(dragSession.dragStartSec + dragSession.accumSec);
    if (dragSec <= frontierSec) {
      // Browsing recorded history must not be limited by editability rules.
      // Edit-window gates apply to mutations, not to read-only time travel.
      const clampedSec = clampDiskHistoryBrowseTargetSec(dragSec, frontierSec);
      dragSession.visualTargetSec = clampedSec;
      clearPreviewState?.();
      queueBrowseSecond(clampedSec);
      return;
    }

    const forecastPreviewCapSec =
      typeof getForecastPreviewCapSec === "function"
        ? getForecastPreviewCapSec()
        : frontierSec;
    const clampedFutureSec = clampDiskForecastPreviewTargetSec(
      dragSec,
      frontierSec,
      forecastPreviewCapSec
    );
    dragSession.visualTargetSec = clampedFutureSec;
    if (clampedFutureSec <= frontierSec) {
      clearPreviewState?.();
      queueBrowseSecond(frontierSec);
      return;
    }
    if (typeof previewCursorSecond === "function") {
      queuePreviewSecond(clampedFutureSec);
      return;
    }
    queueCommitSecond(clampedFutureSec);
  }

  function bindStageInput() {
    if (stageListenersBound) return;
    if (!app?.stage) return;

    stageMoveHandler = (event) => {
      if (!dragSession) return;
      const global = event?.global;
      const pointerId = Number.isFinite(event?.pointerId) ? event.pointerId : null;
      if (
        Number.isFinite(global?.x) &&
        Number.isFinite(global?.y) &&
        pointerId === lastStageMovePointerId &&
        global.x === lastStageMoveX &&
        global.y === lastStageMoveY
      ) {
        return;
      }
      lastStageMovePointerId = pointerId;
      lastStageMoveX = Number.isFinite(global?.x) ? global.x : null;
      lastStageMoveY = Number.isFinite(global?.y) ? global.y : null;
      updateDragFromPointerEvent(event);
      event.stopPropagation?.();
    };

    stageUpHandler = () => {
      lastStageMovePointerId = null;
      lastStageMoveX = null;
      lastStageMoveY = null;
      endDrag();
    };

    // Keep disk scrubbing responsive even when the pointer leaves the disk sprite
    // during a turn. Some layouts make the old hit-tested pointermove path feel dead.
    app.stage.on("globalpointermove", stageMoveHandler);
    app.stage.on("pointermove", stageMoveHandler);
    app.stage.on("pointerup", stageUpHandler);
    app.stage.on("pointerupoutside", stageUpHandler);
    stageListenersBound = true;
  }

  function unbindStageInput() {
    if (!stageListenersBound || !app?.stage) return;
    if (stageMoveHandler) app.stage.off("globalpointermove", stageMoveHandler);
    if (stageMoveHandler) app.stage.off("pointermove", stageMoveHandler);
    if (stageUpHandler) {
      app.stage.off("pointerup", stageUpHandler);
      app.stage.off("pointerupoutside", stageUpHandler);
    }
    stageMoveHandler = null;
    stageUpHandler = null;
    lastStageMovePointerId = null;
    lastStageMoveX = null;
    lastStageMoveY = null;
    clearBrowseRequest();
    clearCommitRequest();
    clearPreviewRequest();
    stageListenersBound = false;
  }

  function resolveRingMarkerAngleRad({
    diskId,
    state,
    baseTimeSec,
    committedSec,
  }) {
    const committedMarkerAngleRad = getDiskRingAngleAtSecond({
      diskId,
      state,
      fromTimeSec: baseTimeSec,
      targetSec: committedSec,
      layout,
    });

    if (
      dragSession &&
      dragSession.diskId === diskId &&
      Number.isFinite(dragSession.visualTargetSec)
    ) {
      const dragMarkerAngleRad = getDragRingAngleFromAnchorRad(
        diskId,
        layout,
        state,
        dragSession.dragStartSec,
        dragSession.visualTargetSec,
        dragSession.dragAnchorRingAngleRad
      );
      ringMarkerAngleByDisk[diskId] = dragMarkerAngleRad;
      return dragMarkerAngleRad;
    }

    ringMarkerAngleByDisk[diskId] = committedMarkerAngleRad;
    return committedMarkerAngleRad;
  }

  function drawCompanionSeasonMarkers(cx, cy, ringRadius, baseAngleRad) {
    feedbackGraphics.lineStyle(1, 0x8ec3f2, 0.42);
    feedbackGraphics.beginFill(0x8ec3f2, 0.42);
    for (let i = 1; i <= 3; i++) {
      const markerAngleRad = baseAngleRad + SEASON_COMPANION_MARKER_STEP_RAD * i;
      const markerX = cx + Math.cos(markerAngleRad) * ringRadius;
      const markerY = cy + Math.sin(markerAngleRad) * ringRadius;
      feedbackGraphics.drawCircle(markerX, markerY, 3);
    }
    feedbackGraphics.endFill();
  }

  function drawRingFeedback({ state, baseTimeSec, visibility }) {
    if (!feedbackGraphics) return;

    feedbackGraphics.clear();
    if (feedbackText) {
      feedbackText.visible = false;
      feedbackText.text = "";
    }

    const diskId = getFeedbackDiskId(visibility);
    if (!diskId) return;
    const sprite = getSpriteByDiskId(diskId);
    if (!sprite || sprite.visible === false || !state) return;

    const cx = sprite.x;
    const cy = sprite.y;
    const baseRadius = Math.max(sprite.width, sprite.height) * 0.5;
    const ringRadius = Number.isFinite(baseRadius) && baseRadius > 0 ? baseRadius + 10 : 36;
    const committedSec = getTSecInt(state);

    feedbackGraphics.lineStyle(1, 0x8ec3f2, 0.45);
    feedbackGraphics.drawCircle(cx, cy, ringRadius);

    const playheadAngleRad = getDiskPlayheadAngleRad(diskId, layout);
    drawInwardPlayheadTriangle(feedbackGraphics, cx, cy, playheadAngleRad, {
      tipRadius: ringRadius - 0.5,
      baseRadius: ringRadius + 9,
      halfWidth: 5.5,
      fillColor: 0xffffff,
      fillAlpha: 0.98,
      strokeColor: 0x0f1220,
      strokeAlpha: 0.98,
      strokeWidth: 2,
    });

    const ringMarkerAngleRad = resolveRingMarkerAngleRad({
      diskId,
      state,
      baseTimeSec,
      committedSec,
    });
    const baseDotX = cx + Math.cos(ringMarkerAngleRad) * ringRadius;
    const baseDotY = cy + Math.sin(ringMarkerAngleRad) * ringRadius;
    feedbackGraphics.lineStyle(1, 0x8ec3f2, 0.5);
    feedbackGraphics.beginFill(0x8ec3f2, 0.55);
    feedbackGraphics.drawCircle(baseDotX, baseDotY, 4);
    feedbackGraphics.endFill();

    if (diskId === DISK_ID_SEASON) {
      drawCompanionSeasonMarkers(cx, cy, ringRadius, ringMarkerAngleRad);
    }

    if (!dragSession || dragSession.diskId !== diskId) return;
    if (!Number.isFinite(dragSession.visualTargetSec)) return;

    const targetSec = clampNonNegativeSec(dragSession.visualTargetSec, committedSec);
    const targetAngleRad = getDragRingAngleFromAnchorRad(
      diskId,
      layout,
      state,
      dragSession.dragStartSec,
      targetSec,
      dragSession.dragAnchorRingAngleRad
    );

    const markerColor =
      dragSession.lastRotationDirection === ROTATION_ANTICLOCKWISE
        ? 0xff5c5c
        : 0x87c7ff;

    const markerX = cx + Math.cos(targetAngleRad) * ringRadius;
    const markerY = cy + Math.sin(targetAngleRad) * ringRadius;

    feedbackGraphics.lineStyle(2, markerColor, 0.8);
    feedbackGraphics.drawCircle(cx, cy, ringRadius);
    feedbackGraphics.beginFill(markerColor, 0.95);
    feedbackGraphics.drawCircle(markerX, markerY, 5);
    feedbackGraphics.endFill();

    if (feedbackText) {
      const startSec = clampNonNegativeSec(dragSession.dragStartSec, 0);
      const dragDeltaSec = Math.floor(targetSec - startSec);
      const sign = dragDeltaSec >= 0 ? "+" : "-";
      feedbackText.text = `${sign}${Math.abs(dragDeltaSec)} tSec`;
      feedbackText.x = Math.round(cx - feedbackText.width * 0.5);
      feedbackText.y = Math.round(cy - ringRadius - feedbackText.height - 6);
      feedbackText.visible = true;
    }
  }

  function ensureCreated() {
    if (!layer) return { ok: false, reason: "noLayer" };
    if (root) return { ok: true };

    root = new PIXI.Container();
    root.zIndex = layout?.zIndex ?? 0;

    {
      const tex = PIXI.Texture.from(layout.season.texturePath);
      seasonSprite = new PIXI.Sprite(tex);
      seasonSprite.anchor.set(0.5);
      seasonSprite.eventMode = "static";
      seasonSprite.cursor = "grab";
      seasonSprite.on("pointerdown", (event) => startDrag(DISK_ID_SEASON, event));
      root.addChild(seasonSprite);
    }

    {
      const tex = PIXI.Texture.from(layout.moon.texturePath);
      moonSprite = new PIXI.Sprite(tex);
      moonSprite.anchor.set(0.5);
      moonSprite.eventMode = "static";
      moonSprite.cursor = "grab";
      moonSprite.on("pointerdown", (event) => startDrag(DISK_ID_MOON, event));
      root.addChild(moonSprite);
    }

    phaseIconLayer = new PIXI.Container();
    phaseIconEntries = MOON_PHASE_DEFS.map((phase, phaseIndex) => {
      const container = new PIXI.Container();
      const background = new PIXI.Graphics();
      const label = new PIXI.Text(phase.glyph, {
        fill: 0xf5f0e6,
        fontSize: 12,
        fontFamily: "Arial",
        fontWeight: "bold",
        align: "center",
      });
      label.anchor.set(0.5);
      label.eventMode = "none";
      container.addChild(background, label);
      container.eventMode = "static";
      container.cursor = "help";
      container.on("pointerover", () => {
        hoveredPhaseId = phase.id;
        showPhaseTooltip(phase.id);
      });
      container.on("pointerout", () => {
        if (hoveredPhaseId === phase.id) hoveredPhaseId = null;
        tooltipView?.hide?.();
      });
      container.on("pointerdown", (event) => event?.stopPropagation?.());
      phaseIconLayer.addChild(container);
      return { phase, phaseIndex, container, background, label };
    });
    root.addChild(phaseIconLayer);

    feedbackGraphics = new PIXI.Graphics();
    feedbackGraphics.eventMode = "none";
    root.addChild(feedbackGraphics);

    feedbackText = new PIXI.Text("", {
      fill: 0xfff0b8,
      fontSize: 12,
      fontFamily: "Arial",
      fontWeight: "bold",
      align: "center",
      stroke: 0x111111,
      strokeThickness: 3,
    });
    feedbackText.eventMode = "none";
    feedbackText.visible = false;
    root.addChild(feedbackText);

    layer.addChild(root);
    bindStageInput();
    return { ok: true };
  }

  function applyLayout() {
    if (!root) return;

    const enabled = layout?.enabled !== false;
    root.visible = enabled;

    if (moonSprite) {
      moonSprite.x = layout.moon.x;
      moonSprite.y = layout.moon.y;
      moonSprite.scale.set(layout.moon.scale);
      moonSprite.alpha = layout.moon.alpha;
    }

    if (seasonSprite) {
      seasonSprite.x = layout.season.x;
      seasonSprite.y = layout.season.y;
      seasonSprite.scale.set(layout.season.scale);
      seasonSprite.alpha = layout.season.alpha;
    }
    if (phaseIconLayer) {
      phaseIconLayer.visible = enabled;
      const radius = Number.isFinite(layout.moon?.phaseIconRadius)
        ? layout.moon.phaseIconRadius
        : 112;
      for (const entry of phaseIconEntries) {
        const angle = -Math.PI / 2 + entry.phaseIndex / MOON_PHASE_DEFS.length * TWO_PI;
        entry.container.x = layout.moon.x + Math.cos(angle) * radius;
        entry.container.y = layout.moon.y + Math.sin(angle) * radius;
      }
    }
  }

  function init() {
    const res = ensureCreated();
    if (!res.ok) return res;
    applyLayout();
    lastEnabled = layout?.enabled !== false;
    return { ok: true };
  }

  function update(_frameDt) {
    if (!root || !getState) return;

    const state = getState();
    if (!state) return;

    const visibility = resolveDiskVisibility(state);
    const moonVisible = isDiskVisible(DISK_ID_MOON, visibility);
    const seasonVisible = isDiskVisible(DISK_ID_SEASON, visibility);

    const enabled = layout?.enabled !== false;
    if (enabled !== lastEnabled) {
      applyLayout();
      lastEnabled = enabled;
    }

    if (dragSession && !isDiskVisible(dragSession.diskId, visibility)) {
      endDrag();
    }

    if (moonSprite) moonSprite.visible = moonVisible;
    if (seasonSprite) seasonSprite.visible = seasonVisible;
    if (phaseIconLayer) phaseIconLayer.visible = moonVisible;
    root.visible = enabled && (moonVisible || seasonVisible);

    if (!root.visible) {
      if (dragSession) endDrag();
      if (feedbackGraphics) feedbackGraphics.clear();
      if (feedbackText) feedbackText.visible = false;
      return;
    }

    const baseTimeSec = getTimeSecForRotation(state);

    if (moonSprite && moonSprite.visible !== false) {
      const orbit01 = getMoonOrbitPhase01AtTime(state, baseTimeSec);
      moonSprite.rotation = phase01ToRotationRad(orbit01, layout.moon);
    }

    const activePhase = getMoonPhaseAtSecond(state, getTSecInt(state));
    for (const entry of phaseIconEntries) {
      const active = entry.phaseIndex === activePhase.phaseIndex;
      entry.background.clear();
      entry.background.lineStyle(active ? 3 : 1, active ? 0xffd77a : 0x8f7c60, 1);
      entry.background.beginFill(active ? 0x6d5230 : 0x2a241d, active ? 0.98 : 0.88);
      entry.background.drawCircle(0, 0, active ? 13 : 11);
      entry.background.endFill();
      entry.label.style.fill = active ? 0xfff0b8 : 0xf5f0e6;
    }
    if (hoveredPhaseId && lastTooltipSecond !== getTSecInt(state)) {
      showPhaseTooltip(hoveredPhaseId);
    }

    if (seasonSprite && seasonSprite.visible !== false) {
      const q =
        Number.isFinite(layout.season?.quadrants) && layout.season.quadrants > 0
          ? layout.season.quadrants
          : 4;
      const wheel01 = getSeasonWheelPhase01(state, baseTimeSec, q);
      seasonSprite.rotation = phase01ToRotationRad(wheel01, layout.season);
    }

    drawRingFeedback({
      state,
      baseTimeSec,
      visibility,
    });
  }

  function destroy() {
    endDrag();

    if (browseRafId && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(browseRafId);
    }
    browseRafId = 0;
    pendingBrowseSec = null;

    if (commitRafId && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(commitRafId);
    }
    commitRafId = 0;
    pendingCommitSec = null;

    unbindStageInput();

    if (!root) return;

    if (moonSprite) moonSprite.off("pointerdown");
    if (seasonSprite) seasonSprite.off("pointerdown");
    for (const entry of phaseIconEntries) {
      entry.container.off("pointerover");
      entry.container.off("pointerout");
      entry.container.off("pointerdown");
    }
    tooltipView?.hide?.();

    root.removeFromParent();
    root.destroy({ children: true });
    root = null;
    moonSprite = null;
    seasonSprite = null;
    phaseIconLayer = null;
    phaseIconEntries = [];
    hoveredPhaseId = null;
    feedbackGraphics = null;
    feedbackText = null;
  }

  return {
    init,
    update,
    applyLayout,
    destroy,
    getRoot: () => root,
    isDragging: () => !!dragSession,
    getScreenRect: () =>
      !root || !root.visible || typeof root.getBounds !== "function"
        ? null
        : root.getBounds(),
  };
}
