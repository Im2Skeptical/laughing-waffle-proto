// src/views/timegraphs-pixi.js
// Render-only view for metric graphs.
// STAGE 3: tSec aware.

import { GRAPH_METRICS } from "../model/graph-metrics.js";
import { createTimegraphScroll, getTimegraphInk, getTimegraphLayout, TIMEGRAPH_CHROME } from './timegraph-scroll-pixi.js';
import { perfEnabled, perfNowMs, recordGraphRender } from "../model/perf.js";
import {
  getActionSecondsInRange,
  getActionSecondsInRangeSampled,
} from "../model/timeline/index.js";
import { computeHistoryZoneSegments } from "../model/timegraph/edit-policy.js";
import {
  GAMEPIECE_HOVER_SCALE,
} from "./layout-pixi.js";
import { createWindowHeader } from "./ui-helpers/window-header.js";
import { installSolidUiHitArea } from "./ui-helpers/solid-ui-hit-area.js";
import { getDisplayObjectWorldScale } from "./ui-helpers/display-object-scale.js";
import {
  blendColor,
  clamp01,
  clampForecastScrubTargetSec,
  getSeriesValue,
  lerpNumber,
  normalizeEventMarkers,
  normalizeHistoryZoneSegments,
  normalizeItemUnavailableZones,
  resolveDefaultGraphScrubSec,
} from "./timegraphs-helpers.js";
import {
  ACTION_SNAP_THRESHOLD_SEC,
  FORECAST_REVEAL_MIN_RATE_SEC_PER_SEC,
  FORECAST_REVEAL_PLOT_THROTTLE_MS,
  FORECAST_REVEAL_TARGET_DURATION_SEC,
  GRAPH_BOOT_FADE_FRAME_MS,
  MAX_ACTION_MARKERS_DENSITY,
  MAX_PLOT_POINTS,
  PLOT_REFRESH_OVERSCAN_POINTS,
  PLOT_SNAPSHOT_BOUNDS_QUANTUM_SEC,
  PLOT_THROTTLE_MS,
  PROJECTION_REPLACEMENT_ANIMATION_FRAME_MS,
  PROJECTION_REPLACEMENT_DIM_ALPHA,
  PROJECTION_REPLACEMENT_DIM_LINE_ALPHA,
  PROJECTION_REPLACEMENT_FLASH_ALPHA,
  PROJECTION_REPLACEMENT_FLASH_LINE_ALPHA,
  RESTORE_THROTTLE_MS,
  SERIES_SCALE_MAX_FLASH_DURATION_MS,
  TIME_BOUNDS_ANIMATION_MAX_RATE_SEC_PER_SEC,
  TIME_BOUNDS_ANIMATION_MIN_RATE_SEC_PER_SEC,
  TIME_BOUNDS_ANIMATION_TARGET_DURATION_SEC,
  TIMEGRAPH_THEME,
} from "./timegraphs/constants.js";
import {
  getSeriesLegendTitle,
  makeLegendSignature,
  paintKeyCabinetStyles,
  resolveKeyCabinetPage,
  sliceKeyCabinetPage,
} from "./timegraphs/key-cabinet.js";
import {
  applyActionSnap as snapTimeToActions,
  getMarkerSeconds as sampleMarkerSeconds,
  timeToX as mapTimeToX,
} from "./timegraphs/plot-math.js";
import {
  drawActionMarkers,
  drawBootFadeOverlay,
  drawEventMarkers,
  drawForecastRevealMarker,
  drawPlotGrid,
  drawScrubMarkers,
  drawSeriesLinesForRange as paintSeriesLinesForRange,
  drawZone,
  fillHistoryZones,
  getSeriesScaleMaxFlashRenderKey as computeSeriesScaleMaxFlashRenderKey,
  getSeriesScaleMaxFlashStrength as computeSeriesScaleMaxFlashStrength,
} from "./timegraphs/plot-draw.js";
import {
  applyStickyScaleRangeSources,
  computeSeriesScaleRangesForReveal as computeSeriesScaleRangesForRevealRange,
  computeVisibleSeriesMaxValues,
} from "./timegraphs/scale.js";
import {
  clearForecastRevealStartOverride,
  createForecastRevealState,
  getAnimatedForecastCoverageEndSec as readAnimatedForecastCoverageEndSec,
  getDisplayHistoryEndSec as readDisplayHistoryEndSec,
  getForecastRevealFollowTargetEndSec as readForecastRevealFollowTargetEndSec,
  getRenderedHistoryEndSec as readRenderedHistoryEndSec,
  getVisibleForecastCoverageEndSec as readVisibleForecastCoverageEndSec,
  isFollowingForecastReveal as readIsFollowingForecastReveal,
  markForecastRevealPreview,
  pauseForecastReveal as applyPauseForecastReveal,
  resetForecastReveal as resetForecastRevealState,
  resetForecastRevealDataContext,
  resolveForecastRevealPlayheadFollowSec,
  resolveForecastRevealPreviewTarget,
  restartForecastRevealFrom as restartForecastRevealState,
  setForecastRevealConfig as applyForecastRevealConfig,
  suspendForecastRevealPlayheadFollow as applySuspendForecastRevealPlayheadFollow,
  syncForecastRevealTarget as applySyncForecastRevealTarget,
} from "./timegraphs/forecast-reveal-state.js";
import {
  beginScrubSession,
  clearLatchedForecastScrub,
  createScrubSession,
  pointerLocalXToSec,
  releaseScrubSession,
  resetForecastPreviewState as resetScrubForecastPreviewState,
  setLatchedForecastScrub,
  syncLatchedForecastPreview,
} from "./timegraphs/scrub-session.js";

export {
  clampForecastScrubTargetSec,
  computeGraphSeriesScaleRanges,
  reconcileLatchedForecastPreview,
  resolveDefaultGraphScrubSec,
  resolveForecastRevealPlayheadSec,
} from "./timegraphs-helpers.js";

export function createMetricGraphView({
  app,
  layer,
  controller,
  interaction = null,
  tooltipView = null,
  metric = GRAPH_METRICS.gold,
  getMetricDef,
  getTimeline,
  getCursorState,
  getPreviewStatus,
  canAutoPreviewForecastReveal = null,
  getSeriesValueOverride,
  getEventMarkers,
  getEditableHistoryBounds,
  setPreviewState,
  clearPreviewState,
  commitSecond,
  openPosition,
  historyWindowSec = null,
  getWindowSpec = null,
  canCommitScrubSecond = null,
  onToggleSystemTargetMode = null,
  getActiveSeriesGroups = null,
  onToggleSeriesGroup = null,
  windowWidth = 1200,
  windowHeight = 176,
  displayScale = 1,
  headerHeight = 38,
  showPin = false,
  showClose = true,
  draggable = true,
  treatRevealedForecastAsHistory = false,
  getRenderedHistoryEndSec: renderedHistoryEndResolver = null,
  forecastRevealTargetDurationSec = FORECAST_REVEAL_TARGET_DURATION_SEC,
  forecastRevealMinRateSecPerSec = FORECAST_REVEAL_MIN_RATE_SEC_PER_SEC,
  forecastRevealMaxRateSecPerSec = Number.POSITIVE_INFINITY,
  forecastRevealStartDelayMs = 0,
  forecastRevealFollowGapSec = 0,
  forecastRevealFollowResponseSec = 0.9,
  forecastRevealAccelerationSecPerSec2 = 220,
  forecastRevealDecelerationSecPerSec2 = 320,
  plotSnapshotBoundsQuantumSec = PLOT_SNAPSHOT_BOUNDS_QUANTUM_SEC,
  plotSnapshotCoverForecast = false,
  plotSnapshotLeadSec = 0,
  freezeRevealedPlotPrefix = false,
  freezeScaleMaxDuringReveal = false,
  commitForecastOnScrubRelease = false,
  commitHistoryOnScrubRelease = true,
  forecastPreviewStatusNote: forecastPreviewStatusNoteOverride = null,
  bootFadeDurationMs = 0,
  bootFadeColor = 0x000000,
  bootRevealDelayMs = 0,
}) {
  const reveal = createForecastRevealState({
    targetDurationSec: forecastRevealTargetDurationSec,
    minRateSecPerSec: forecastRevealMinRateSecPerSec,
    maxRateSecPerSec: forecastRevealMaxRateSecPerSec,
    startDelayMs: forecastRevealStartDelayMs,
    followGapSec: forecastRevealFollowGapSec,
    followResponseSec: forecastRevealFollowResponseSec,
    accelerationSecPerSec2: forecastRevealAccelerationSecPerSec2,
    decelerationSecPerSec2: forecastRevealDecelerationSecPerSec2,
  });
  const plotSnapshotBoundsQuantumSecCur = Math.max(
    1,
    Math.floor(plotSnapshotBoundsQuantumSec ?? PLOT_SNAPSHOT_BOUNDS_QUANTUM_SEC)
  );
  const plotSnapshotCoverForecastCur = plotSnapshotCoverForecast === true;
  const plotSnapshotLeadSecCur = Math.max(
    0,
    Math.floor(plotSnapshotLeadSec ?? 0)
  );
  const freezeRevealedPlotPrefixCur = freezeRevealedPlotPrefix === true;
  const freezeScaleMaxDuringRevealCur = freezeScaleMaxDuringReveal === true;
  const bootFadeDurationMsCur = Math.max(0, Number(bootFadeDurationMs ?? 0));
  const bootFadeColorCur = Number.isFinite(bootFadeColor)
    ? Math.max(0, Math.floor(bootFadeColor))
    : 0x000000;
  const bootRevealDelayMsCur = Math.max(
    0,
    Number(bootRevealDelayMs ?? bootFadeDurationMsCur)
  );
  let metricDef = GRAPH_METRICS.gold;
  let series = GRAPH_METRICS.gold.series;
  // View-only comparison ceilings: rendering must not affect simulation,
  // serialization, or authoritative replay.
  let scaleHighWaterTimeline = null;
  const scaleHighWaterMaxByGroupId = new Map();
  let windowSpecResolver =
    typeof getWindowSpec === "function" ? getWindowSpec : null;
  let commitPolicyResolver =
    typeof canCommitScrubSecond === "function" ? canCommitScrubSecond : null;
  let historyZoneResolver = null;
  let seriesValueOverrideResolver =
    typeof getSeriesValueOverride === "function" ? getSeriesValueOverride : null;
  let eventMarkerResolver =
    typeof getEventMarkers === "function" ? getEventMarkers : null;

  function resolveMetric() {
    const next =
      typeof getMetricDef === "function" ? getMetricDef() : metric;
    const resolved =
      typeof next === "string" ? GRAPH_METRICS[next] : next;
    metricDef =
      resolved && typeof resolved === "object"
        ? resolved
        : GRAPH_METRICS.gold;
    series = Array.isArray(metricDef.series)
      ? metricDef.series
      : GRAPH_METRICS.gold.series;
  }

  function getActiveSeries() {
    const data = controller?.getData?.() ?? null;
    if (Array.isArray(data?.series)) {
      return data.series;
    }
    resolveMetric();
    return series;
  }

  function getMetricLabel() {
    const data = controller?.getData?.() ?? null;
    return data?.label ?? metricDef?.label ?? "Metric";
  }

  resolveMetric();

  function syncScaleHighWaterTimeline(timeline) {
    if (scaleHighWaterTimeline === timeline) return;
    scaleHighWaterTimeline = timeline ?? null;
    scaleHighWaterMaxByGroupId.clear();
  }

  function applyRunScaleHighWaterRanges(
    nextRanges,
    seriesList = [],
    subjectKey = null
  ) {
    if (!(nextRanges instanceof Map)) return nextRanges;
    const merged = new Map(nextRanges);
    for (const seriesDef of Array.isArray(seriesList) ? seriesList : []) {
      const seriesId = String(seriesDef?.id ?? "");
      const range = merged.get(seriesId);
      if (!seriesId || !range || range.scaleMode === "fixed") continue;
      const groupId = `${String(subjectKey ?? "__global__")}:${String(
        range.groupId ?? seriesId
      )}`;
      const maxValue = Number.isFinite(range.maxValue) ? range.maxValue : null;
      const seenMax = scaleHighWaterMaxByGroupId.get(groupId);
      const highWater = Number.isFinite(seenMax)
        ? Number.isFinite(maxValue) ? Math.max(seenMax, maxValue) : seenMax
        : maxValue;
      if (!Number.isFinite(highWater)) continue;
      scaleHighWaterMaxByGroupId.set(groupId, highWater);
      merged.set(seriesId, { ...range, maxValue: highWater });
    }
    return merged;
  }

  function getProjectionReplacementScaleRanges() {
    const ranges = projectionReplacement?.snapshot?.seriesScaleRanges;
    return ranges instanceof Map ? ranges : null;
  }

  function computeSeriesScaleRangesForReveal(
    seriesList,
    points,
    seriesValues,
    visibleEndSec
  ) {
    return computeSeriesScaleRangesForRevealRange(
      seriesList,
      points,
      seriesValues,
      visibleEndSec,
      freezeScaleMaxDuringRevealCur
    );
  }

  function triggerSeriesScaleMaxFlash({
    previousRanges,
    nextRanges,
    visibleMaxValues,
    nowMs = performance.now(),
  } = {}) {
    if (
      !(previousRanges instanceof Map) ||
      !(nextRanges instanceof Map) ||
      !(visibleMaxValues instanceof Map)
    ) {
      return false;
    }

    let triggered = false;
    for (const [seriesId, nextRange] of nextRanges.entries()) {
      const previousRange = previousRanges.get(seriesId);
      const previousMax = Number(previousRange?.maxValue);
      const nextMax = Number(nextRange?.maxValue);
      const visibleMax = Number(visibleMaxValues.get(seriesId));
      if (
        !Number.isFinite(previousMax) ||
        !Number.isFinite(nextMax) ||
        !Number.isFinite(visibleMax) ||
        nextMax <= previousMax + 1e-6 ||
        visibleMax < nextMax - 1e-6
      ) {
        continue;
      }
      seriesScaleMaxFlashBySeriesId.set(seriesId, {
        startedMs: nowMs,
        durationMs: SERIES_SCALE_MAX_FLASH_DURATION_MS,
      });
      triggered = true;
    }

    if (triggered) {
      lastPlotVersion = -1;
      lastPlotBoundsKey = "";
    }
    return triggered;
  }

  function getSeriesScaleMaxFlashStrength(seriesId, nowMs = performance.now()) {
    return computeSeriesScaleMaxFlashStrength(
      seriesScaleMaxFlashBySeriesId,
      seriesId,
      nowMs
    );
  }

  function getSeriesScaleMaxFlashRenderKey(nowMs = performance.now()) {
    return computeSeriesScaleMaxFlashRenderKey(
      seriesScaleMaxFlashBySeriesId,
      nowMs
    );
  }

  const root = new PIXI.Container();
  root.scale.set(displayScale);
  root.visible = false;
  layer.addChild(root);
  const solidHitArea = installSolidUiHitArea(root, () => {
    const bounds = root.getLocalBounds?.() ?? null;
    return {
      x: 0,
      y: 0,
      width: bounds?.width ?? 0,
      height: bounds?.height ?? 0,
    };
  });

  const WIN_W = Number.isFinite(windowWidth) ? Math.max(320, Math.floor(windowWidth)) : 1200;
  const WIN_H = Number.isFinite(windowHeight) ? Math.max(120, Math.floor(windowHeight)) : 176;
  const HEADER_H = Number.isFinite(headerHeight)
    ? Math.max(24, Math.min(WIN_H - 24, Math.floor(headerHeight)))
    : 38;

  const plotG = new PIXI.Graphics();
  const scrubG = new PIXI.Graphics();
  const legendContainer = new PIXI.Container();

  root.addChild(legendContainer, plotG, scrubG);

  const LEGEND_ICON_SIZE = TIMEGRAPH_CHROME.iconSize;

  const graphLayout = getTimegraphLayout();
  const plot = { ...graphLayout.plot };
  legendContainer.eventMode = "static";
  legendContainer.hitArea = new PIXI.Rectangle(
    graphLayout.key.x, graphLayout.key.y, graphLayout.key.width, graphLayout.key.height
  );

  const plotHit = new PIXI.Graphics();
  plotHit.alpha = 0;
  plotHit.eventMode = "static";
  plotHit.cursor = "pointer";
  root.addChild(plotHit);

  const headerUi = createWindowHeader({
    stage: app?.stage,
    parent: root,
    width: WIN_W,
    height: HEADER_H,
    radius: 14,
    background: TIMEGRAPH_THEME.panelHeaderBg,
    showPin: showPin === true,
    showClose: showClose !== false,
    closeOffsetX: 20,
    dragTarget: draggable !== false ? root : null,
    onClose: () => close(),
  });

  headerUi.bg.visible = false;
  const scroll = createTimegraphScroll({ root, width: WIN_W, height: WIN_H, headerHeight: HEADER_H,
    getActiveGroups: getActiveSeriesGroups, onToggleGroup: onToggleSeriesGroup, onKeyPage: setLegendPage });

  const focusRect = graphLayout.controls.focus;
  const seriesRect = graphLayout.controls.series;
  const hasTargetModeButton = typeof onToggleSystemTargetMode === "function";
  const zoomBtn = new PIXI.Container();
  const zoomBg = new PIXI.Graphics();
  const zoomText = new PIXI.Text("", {
    fontFamily: "Georgia",
    fontSize: 20,
    fill: 0xe0d4b4,
  });
  zoomBtn.addChild(zoomBg, zoomText);
  zoomBtn.eventMode = "static";
  zoomBtn.cursor = "pointer";
  root.addChild(zoomBtn);
  const targetBtn = new PIXI.Container();
  const targetBg = new PIXI.Graphics();
  const targetText = new PIXI.Text("", {
    fontFamily: "Arial",
    fontSize: 21,
    fill: 0xe0d4b4,
  });
  targetBtn.addChild(targetBg, targetText);
  targetBtn.eventMode = hasTargetModeButton ? "static" : "none";
  targetBtn.cursor = hasTargetModeButton ? "pointer" : "default";
  targetBtn.visible = hasTargetModeButton;
  root.addChild(targetBtn);

  const forecastPreviewStatusNote = commitForecastOnScrubRelease
    ? "Release to jump"
    : typeof forecastPreviewStatusNoteOverride === "string" &&
        forecastPreviewStatusNoteOverride.length > 0
      ? forecastPreviewStatusNoteOverride
      : "Preview only - click Commit to jump";
  const scrub = createScrubSession({ forecastPreviewStatusNote });
  let minSec = 0;
  let maxSec = 0;
  let zoomed = false;
  let lastPlotMs = 0;
  let lastPlotVersion = -1;
  let lastPlotBoundsKey = "";

  let lastRestoreMs = 0;
  let lastScrubSignature = "";
  let cachedActionSecs = [];
  let lastActionSecondsVersion = null;
  let lastActionRangeKey = "";
  let cachedMarkerActionSecs = [];
  let lastMarkerActionSecondsVersion = null;
  let lastMarkerRangeKey = "";
  let lastMarkerCap = 0;

  let legendSignature = "";
  let legendSelectionSignature = "";
  let legendPage = 0;
  let hoveredLegendSeriesId = null;
  const legendEntriesBySeriesId = new Map();
  const seriesScaleMaxFlashBySeriesId = new Map();
  let presentationSuspended = false;
  let plotSnapshotKey = "";
  let plotSnapshot = null;
  let animatedMinSec = null;
  let animatedMaxSec = null;
  let animatedBoundsLastTickMs = 0;
  let plotSnapshotTargetMaxSec = null;
  let stagedProjectionReplacement = null;
  let projectionReplacement = null;
  let bootFadeTransition = null;
  let hoveredEventMarkerKey = null;

  function invalidatePlotSnapshot() {
    plotSnapshotKey = "";
    plotSnapshot = null;
    plotSnapshotTargetMaxSec = null;
  }

  function clearProjectionReplacementTransition() {
    stagedProjectionReplacement = null;
    projectionReplacement = null;
    lastPlotVersion = -1;
    lastPlotBoundsKey = "";
  }

  function getActiveForecastPreviewSec() {
    const preview =
      typeof getPreviewStatus === "function" ? getPreviewStatus() : null;
    return preview?.active === true &&
      preview?.isForecastPreview === true &&
      Number.isFinite(preview?.previewSec)
      ? Math.max(0, Math.floor(preview.previewSec))
      : null;
  }

  function resetDataContext() {
    resetForecastRevealDataContext(reveal, getActiveForecastPreviewSec());
    invalidatePlotSnapshot();
    seriesScaleMaxFlashBySeriesId.clear();
    clearProjectionReplacementTransition();
    hoveredLegendSeriesId = null;
    lastPlotVersion = -1;
    lastPlotBoundsKey = "";
    hoveredEventMarkerKey = null;
    tooltipView?.hide?.();
  }

  function beginBootFadeTransition(nowMs = performance.now()) {
    bootFadeTransition =
      bootFadeDurationMsCur > 0
        ? {
            startedMs: nowMs,
            durationMs: bootFadeDurationMsCur,
            color: bootFadeColorCur,
          }
        : null;
  }

  function clearBootFadeTransition() {
    bootFadeTransition = null;
  }

  function getBootFadeRenderState(nowMs) {
    const transition = bootFadeTransition;
    if (!transition) return null;
    const durationMs = Math.max(0, Number(transition.durationMs ?? 0));
    if (durationMs <= 0) {
      bootFadeTransition = null;
      return null;
    }
    const elapsedMs = Math.max(
      0,
      nowMs - Math.max(0, Number(transition.startedMs ?? nowMs))
    );
    const progress = clamp01(elapsedMs / durationMs);
    const alpha = Math.max(0, 1 - progress);
    if (alpha <= 0.001) {
      bootFadeTransition = null;
      return null;
    }
    return {
      color: Number.isFinite(transition.color) ? transition.color : bootFadeColorCur,
      alpha,
      key: Math.floor(elapsedMs / GRAPH_BOOT_FADE_FRAME_MS),
    };
  }

  function getProjectionReplacementMaxFloorSec() {
    return Number.isFinite(projectionReplacement?.maxSecFloor)
      ? Math.max(0, Math.floor(projectionReplacement.maxSecFloor))
      : null;
  }

  function buildProjectionReplacementRenderState(nowMs, lineDrawEndSec) {
    const overlay = projectionReplacement;
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
      projectionReplacement = null;
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
    const flashProgress = flashDurationMs > 0 ? clamp01(elapsedMs / flashDurationMs) : 1;
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
          elapsedMs < flashDurationMs ? flashProgress * 0.35 : 0.55 + fadeProgress * 0.45
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

  function getProjectionReplacementRenderKey(nowMs) {
    const overlay = projectionReplacement;
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

  function stageProjectionReplacementTransition({
    truncationStartSec,
    maxSecFloor,
    transitionDurationMs = 0,
    flashDurationMs = 0,
    fadeStrength = 1,
  } = {}) {
    const snapshot = plotSnapshot ?? getPlotSnapshot();
    const points = Array.isArray(snapshot?.pointsForDraw) ? snapshot.pointsForDraw : [];
    if (!points.length) {
      stagedProjectionReplacement = null;
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
      Math.floor(maxSecFloor ?? maxSec ?? normalizedTruncationStartSec + 1)
    );
    stagedProjectionReplacement = {
      snapshot,
      truncationStartSec: normalizedTruncationStartSec,
      maxSecFloor: normalizedMaxSecFloor,
      transitionDurationMs: Math.max(0, Number(transitionDurationMs ?? 0)),
      flashDurationMs: Math.max(0, Number(flashDurationMs ?? 0)),
      fadeStrength: clamp01(fadeStrength),
    };
    return true;
  }

  function resolvePlotSnapshotTargetMaxSec(rawTargetMaxSec, snapshotMinSec) {
    const minimumTargetMaxSec = Math.max(
      snapshotMinSec + 1,
      Math.floor(rawTargetMaxSec ?? snapshotMinSec + 1)
    );
    if (plotSnapshotLeadSecCur <= 0) {
      return minimumTargetMaxSec;
    }
    const currentTargetMaxSec = Number.isFinite(plotSnapshotTargetMaxSec)
      ? Math.max(snapshotMinSec + 1, Math.floor(plotSnapshotTargetMaxSec))
      : null;
    const shouldResetTarget =
      currentTargetMaxSec == null ||
      minimumTargetMaxSec > currentTargetMaxSec ||
      minimumTargetMaxSec < currentTargetMaxSec - plotSnapshotLeadSecCur;
    if (shouldResetTarget) {
      plotSnapshotTargetMaxSec =
        minimumTargetMaxSec + plotSnapshotLeadSecCur;
    }
    return Math.max(minimumTargetMaxSec, Math.floor(plotSnapshotTargetMaxSec));
  }

  function getDisplayHistoryEndSec(actualHistoryEndSec) {
    return readDisplayHistoryEndSec(reveal, actualHistoryEndSec);
  }

  function getVisibleForecastCoverageEndSec(
    actualForecastCoverageEndSec,
    displayHistoryEndSec
  ) {
    return readVisibleForecastCoverageEndSec(
      reveal,
      actualForecastCoverageEndSec,
      displayHistoryEndSec
    );
  }

  function getForecastRevealFollowTargetEndSec(
    targetEndSec,
    historyEndSec,
    currentEndSec = historyEndSec
  ) {
    return readForecastRevealFollowTargetEndSec(
      reveal,
      targetEndSec,
      historyEndSec,
      currentEndSec
    );
  }

  function getRenderedHistoryEndSec(
    displayHistoryEndSec,
    actualForecastCoverageEndSec,
    extra = null
  ) {
    return readRenderedHistoryEndSec(
      reveal,
      displayHistoryEndSec,
      actualForecastCoverageEndSec,
      extra,
      {
        treatRevealedForecastAsHistory,
        renderedHistoryEndResolver,
      }
    );
  }

  function resetAnimatedTimeBounds(nextMinSec, nextMaxSec, nowMs = performance.now()) {
    animatedMinSec = Math.max(0, Math.floor(nextMinSec ?? 0));
    animatedMaxSec = Math.max(
      animatedMinSec + 1,
      Math.floor(nextMaxSec ?? animatedMinSec + 1)
    );
    animatedBoundsLastTickMs = nowMs;
    minSec = animatedMinSec;
    maxSec = animatedMaxSec;
  }

  function animateBoundToward(current, target, elapsedMs) {
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

  function setTimeBounds(nextMinSec, nextMaxSec, opts = {}) {
    const nextMin = Math.max(0, Math.floor(nextMinSec ?? 0));
    const projectionReplacementMaxFloorSec = getProjectionReplacementMaxFloorSec();
    const nextMax = Math.max(
      nextMin + 1,
      Math.floor(nextMaxSec ?? nextMin + 1),
      Number.isFinite(projectionReplacementMaxFloorSec)
        ? projectionReplacementMaxFloorSec
        : nextMin + 1
    );
    const forceImmediate = opts.immediate === true;
    const shouldAnimate =
      forceImmediate !== true &&
      root.visible === true &&
      scrub.isScrubbing !== true &&
      zoomed !== true;
    if (!shouldAnimate) {
      resetAnimatedTimeBounds(nextMin, nextMax, performance.now());
      return;
    }

    const nowMs = performance.now();
    if (!Number.isFinite(animatedMinSec) || !Number.isFinite(animatedMaxSec)) {
      resetAnimatedTimeBounds(nextMin, nextMax, nowMs);
      return;
    }

    const elapsedMs = Math.max(
      0,
      nowMs - (Number.isFinite(animatedBoundsLastTickMs) ? animatedBoundsLastTickMs : nowMs)
    );
    animatedBoundsLastTickMs = nowMs;
    animatedMinSec = animateBoundToward(animatedMinSec, nextMin, elapsedMs);
    animatedMaxSec = animateBoundToward(animatedMaxSec, nextMax, elapsedMs);

    if (nextMin > animatedMinSec) {
      animatedMinSec = nextMin;
    }

    minSec = Math.max(0, Math.floor(animatedMinSec));
    maxSec = Math.max(minSec + 1, Math.floor(animatedMaxSec));
  }

  function resetForecastPreviewState() {
    resetScrubForecastPreviewState(scrub, reveal);
  }

  function syncLatchedForecastPreviewStatus() {
    const previewStatus =
      typeof getPreviewStatus === "function" ? getPreviewStatus() : null;
    syncLatchedForecastPreview(
      scrub,
      reveal,
      previewStatus,
      clampScrubSecToRevealCap
    );
  }

  function suspendForecastRevealPlayheadFollow() {
    applySuspendForecastRevealPlayheadFollow(reveal);
  }

  function pauseForecastReveal() {
    applyPauseForecastReveal(reveal);
  }

  function syncForecastRevealPlayhead(visibleForecastCoverageEndSec) {
    const preview =
      typeof getPreviewStatus === "function" ? getPreviewStatus() : null;
    const followSec = resolveForecastRevealPlayheadFollowSec(reveal, {
      isScrubbing: scrub.isScrubbing,
      latchedForecastScrubSec: scrub.latchedForecastScrubSec,
      previewStatus: preview,
      visibleForecastCoverageEndSec,
      minSec,
      maxSec,
    });
    if (Number.isFinite(followSec)) {
      scrub.scrubSec = clampScrubSecToRevealCap(followSec);
    }
  }

  function syncForecastRevealPreview(
    visibleForecastCoverageEndSec,
    nowMs
  ) {
    const canAutoPreview =
      typeof canAutoPreviewForecastReveal !== "function" ||
      canAutoPreviewForecastReveal() === true;
    const targetSec = resolveForecastRevealPreviewTarget(
      reveal,
      visibleForecastCoverageEndSec,
      nowMs,
      {
        presentationSuspended,
        canAutoPreview,
        isScrubbing: scrub.isScrubbing,
        latchedForecastScrubSec: scrub.latchedForecastScrubSec,
        historyEndSec: getTimeline?.()?.historyEndSec ?? 0,
      }
    );
    if (!Number.isFinite(targetSec)) return;
    const restored = controller.getStateAt?.(targetSec);
    if (!restored) return;
    markForecastRevealPreview(reveal, targetSec, nowMs);
    setPreviewState?.(restored);
  }

  function getVisibleForecastScrubCapSec() {
    const tl = getTimeline?.();
    const data = controller.getData?.() ?? {};
    const historyEndSec = Math.max(0, Math.floor(tl?.historyEndSec ?? 0));
    const displayHistoryEndSec = getDisplayHistoryEndSec(historyEndSec);
    const actualForecastCoverageEndSec = Math.max(
      historyEndSec,
      Math.floor(data?.forecastCoverageEndSec ?? historyEndSec)
    );
    const visibleForecastCoverageEndSec = getVisibleForecastCoverageEndSec(
      actualForecastCoverageEndSec,
      displayHistoryEndSec
    );
    return Math.max(
      displayHistoryEndSec,
      visibleForecastCoverageEndSec
    );
  }

  function clampScrubSecToRevealCap(targetSec) {
    const tl = getTimeline?.();
    const historyEndSec = Math.max(0, Math.floor(tl?.historyEndSec ?? 0));
    return clampForecastScrubTargetSec(
      targetSec,
      historyEndSec,
      getVisibleForecastScrubCapSec(),
      { minSec, maxSec }
    );
  }

  function tryRestoreLatchedForecastPreview() {
    if (scrub.isScrubbing || !Number.isFinite(scrub.latchedForecastScrubSec)) return;
    const tl = getTimeline?.();
    const historyEnd = Math.max(0, Math.floor(tl?.historyEndSec ?? 0));
    if (scrub.latchedForecastScrubSec <= historyEnd) {
      clearLatchedForecastScrub(scrub);
      return;
    }
    if (scrub.latchedForecastScrubSec > getVisibleForecastScrubCapSec()) {
      return;
    }
    const restored = controller.getStateAt?.(scrub.latchedForecastScrubSec);
    if (!restored) return;
    setPreviewState?.(restored);
    scrub.scrubSec = clampScrubSecToRevealCap(scrub.latchedForecastScrubSec);
    scrub.statusNote = scrub.forecastPreviewStatusNote;
  }

  function resetForecastReveal(animatedEndSec, targetEndSec, historyEndSec, nowMs) {
    resetForecastRevealState(
      reveal,
      animatedEndSec,
      targetEndSec,
      historyEndSec,
      nowMs
    );
    invalidatePlotSnapshot();
  }

  function restartForecastRevealFrom(startSec, opts = {}) {
    const tl = getTimeline?.();
    const data = controller.getData?.() ?? {};
    const actualHistoryEndSec = Math.max(0, Math.floor(tl?.historyEndSec ?? 0));
    const actualForecastCoverageEndSec = Math.max(
      actualHistoryEndSec,
      Math.floor(data?.forecastCoverageEndSec ?? actualHistoryEndSec)
    );
    const nowMs = performance.now();
    if (opts?.activateProjectionReplacementTransition === true) {
      projectionReplacement = stagedProjectionReplacement
        ? {
            ...stagedProjectionReplacement,
            startedMs: nowMs,
          }
        : null;
      stagedProjectionReplacement = null;
    } else {
      stagedProjectionReplacement = null;
      if (opts?.clearProjectionReplacementTransition === true) {
        projectionReplacement = null;
      }
    }
    restartForecastRevealState(reveal, startSec, opts, {
      actualHistoryEndSec,
      actualForecastCoverageEndSec,
      nowMs,
      activeForecastPreviewSec: getActiveForecastPreviewSec(),
    });
    lastPlotVersion = -1;
    lastPlotBoundsKey = "";
    invalidatePlotSnapshot();
  }

  function clearForecastRevealRestart() {
    stagedProjectionReplacement = null;
    if (!clearForecastRevealStartOverride(reveal)) return;
    invalidatePlotSnapshot();
    lastPlotVersion = -1;
    lastPlotBoundsKey = "";
  }

  function getAnimatedForecastCoverageEndSec(nowMs, historyEndSec) {
    return readAnimatedForecastCoverageEndSec(
      reveal,
      nowMs,
      historyEndSec,
      presentationSuspended
    );
  }

  function syncForecastRevealTarget(actualCoverageEndSec, historyEndSec, nowMs) {
    return applySyncForecastRevealTarget(
      reveal,
      actualCoverageEndSec,
      historyEndSec,
      nowMs,
      invalidatePlotSnapshot
    );
  }

  function timeToX(t) {
    return mapTimeToX(t, minSec, maxSec, plot);
  }

  function updateEventMarkerTooltip(globalPoint) {
    if (!tooltipView || scrub.isScrubbing) return;
    if (interaction && interaction?.canShowHoverUI?.() === false) return;
    const local = globalPoint && typeof root.toLocal === "function"
      ? root.toLocal(globalPoint)
      : null;
    if (!local) return;
    const markers = getPlotSnapshot()?.eventMarkers ?? [];
    let nearest = null;
    let nearestDistance = Infinity;
    for (const marker of markers) {
      if (!marker?.tooltip) continue;
      const distance = Math.abs(timeToX(marker.tSec) - Number(local.x ?? 0));
      if (distance <= 9 && distance < nearestDistance) {
        nearest = marker;
        nearestDistance = distance;
      }
    }
    if (!nearest) {
      if (hoveredEventMarkerKey) tooltipView.hide?.();
      hoveredEventMarkerKey = null;
      return;
    }
    const key = `${nearest.tSec}:${nearest.tooltip.title}:${nearest.tooltip.lines.join("|")}`;
    if (key === hoveredEventMarkerKey) return;
    hoveredEventMarkerKey = key;
    const anchor = typeof root.toGlobal === "function"
      ? root.toGlobal(new PIXI.Point(timeToX(nearest.tSec), plot.y + 7))
      : { x: timeToX(nearest.tSec), y: plot.y + 7 };
    tooltipView.show({
      ...nearest.tooltip,
      scale: Math.max(
        Number.isFinite(GAMEPIECE_HOVER_SCALE) ? GAMEPIECE_HOVER_SCALE : 1,
        tooltipView?.getRelativeDisplayScale?.(root, 1) ??
          getDisplayObjectWorldScale(root, 1)
      ),
    }, {
      x: anchor.x,
      y: anchor.y,
      width: 2,
      height: 12,
      side: "right",
      alignY: "top",
      coordinateSpace: "screen",
    });
  }

  function updateScrubFromPointer(globalPoint) {
    const local =
      globalPoint && typeof root.toLocal === "function"
        ? root.toLocal(globalPoint)
        : { x: Number(globalPoint?.x ?? globalPoint) || 0, y: 0 };
    const t = pointerLocalXToSec(Number(local?.x) || 0, plot, minSec, maxSec);
    scrub.scrubSec = clampScrubSecToRevealCap(Math.round(applyActionSnap(t)));
  }

  function applyActionSnap(t) {
    return snapTimeToActions(
      t,
      getActionSecs(minSec, maxSec),
      ACTION_SNAP_THRESHOLD_SEC
    );
  }

  function getActionSecs(startSec, endSec) {
    const tl = getTimeline?.();
    const actionSecondsVersion = Math.floor(tl?._actionSecondsVersion ?? -1);
    const start = Math.max(0, Math.floor(startSec ?? 0));
    const end = Math.max(0, Math.floor(endSec ?? 0));
    const rangeKey = `${start}:${end}`;
    if (
      actionSecondsVersion !== lastActionSecondsVersion ||
      rangeKey !== lastActionRangeKey
    ) {
      lastActionSecondsVersion = actionSecondsVersion;
      lastActionRangeKey = rangeKey;
      cachedActionSecs = getActionSecondsInRange(tl, start, end, {
        copy: false,
      });
    }
    return cachedActionSecs;
  }

  function getMarkerActionSecs(startSec, endSec, markerCap) {
    const tl = getTimeline?.();
    const actionSecondsVersion = Math.floor(tl?._actionSecondsVersion ?? -1);
    const start = Math.max(0, Math.floor(startSec ?? 0));
    const end = Math.max(0, Math.floor(endSec ?? 0));
    const rangeKey = `${start}:${end}`;
    const cap = Math.max(64, Math.floor(markerCap ?? 64));
    if (
      actionSecondsVersion !== lastMarkerActionSecondsVersion ||
      rangeKey !== lastMarkerRangeKey ||
      cap !== lastMarkerCap
    ) {
      lastMarkerActionSecondsVersion = actionSecondsVersion;
      lastMarkerRangeKey = rangeKey;
      lastMarkerCap = cap;
      cachedMarkerActionSecs = getActionSecondsInRangeSampled(
        tl,
        start,
        end,
        cap * 2,
        { copy: false }
      );
    }
    return cachedMarkerActionSecs;
  }

  function getMarkerSeconds(actionSecs) {
    return sampleMarkerSeconds(
      actionSecs,
      plot.w,
      MAX_ACTION_MARKERS_DENSITY
    );
  }

  function buildLegendTooltipSpec(seriesDef) {
    const cursorState = getCursorState?.() ?? null;
    const baseTitle = getSeriesLegendTitle(seriesDef);
    if (typeof seriesDef?.getLegendTooltipSpec === "function") {
      const spec = seriesDef.getLegendTooltipSpec(cursorState);
      if (spec && typeof spec === "object") {
        return {
          title:
            typeof spec.title === "string" && spec.title.trim()
              ? spec.title
              : baseTitle,
          lines: Array.isArray(spec.lines)
            ? spec.lines.filter((line) => typeof line === "string" && line)
            : [],
          maxWidth: spec.maxWidth,
        };
      }
    }
    return { title: baseTitle, lines: [] };
  }

  function refreshLegendStyles() {
    paintKeyCabinetStyles(legendEntriesBySeriesId, hoveredLegendSeriesId);
  }

  function setLegendHoverSeries(seriesId) {
    const next =
      typeof seriesId === "string" && seriesId.length ? seriesId : null;
    if (next === hoveredLegendSeriesId) return;
    hoveredLegendSeriesId = next;
    refreshLegendStyles();
    if (!root.visible) return;
    drawPlot();
    drawScrub();
  }

  function clearLegendHoverSeries() {
    if (!hoveredLegendSeriesId) return;
    hoveredLegendSeriesId = null;
    refreshLegendStyles();
    if (!root.visible) return;
    drawPlot();
    drawScrub();
  }

  function getLegendDetailSpec(seriesDef, container) {
    const spec = {
      ...buildLegendTooltipSpec(seriesDef),
      scale: Math.max(
        Number.isFinite(GAMEPIECE_HOVER_SCALE) ? GAMEPIECE_HOVER_SCALE : 1,
        tooltipView?.getRelativeDisplayScale?.(container, 1) ??
          getDisplayObjectWorldScale(container, 1)
      ),
    };
    const range = getPlotSnapshot()?.seriesScaleRanges?.get(seriesDef.id);
    if (range) spec.lines = [...spec.lines, `Graph scale: ${range.minValue}–${range.maxValue}${seriesDef.scaleMode === "fixed" ? " (fixed)" : ""}`];
    return spec;
  }

  function updateLegendTooltip(globalPoint) {
    const local = globalPoint && typeof root.toLocal === "function"
      ? root.toLocal(globalPoint)
      : null;
    const entry = local
      ? Array.from(legendEntriesBySeriesId.values()).find((candidate) => {
          const x = Number(candidate?.container?.x ?? 0);
          const y = Number(candidate?.container?.y ?? 0);
          return local.x >= x && local.x <= x + LEGEND_ICON_SIZE &&
            local.y >= y && local.y <= y + LEGEND_ICON_SIZE;
        })
      : null;
    const seriesId = entry?.seriesId ?? null;
    if (seriesId === hoveredLegendSeriesId) return;
    if (!seriesId) {
      clearLegendHoverSeries();
      tooltipView?.hide?.();
      return;
    }
    setLegendHoverSeries(seriesId);
    if (!tooltipView || (interaction && interaction?.canShowHoverUI?.() === false)) return;
    tooltipView.show(getLegendDetailSpec(entry.seriesDef, entry.container), entry.container.getBounds());
  }

  function clearLegendEntries() {
    legendContainer.removeChildren().forEach(child => child.destroy({ children: true }));
    legendEntriesBySeriesId.clear();
    legendSignature = "";
    legendSelectionSignature = "";
    legendPage = 0;
    scroll.layoutKey(0, 0);
    clearLegendHoverSeries();
  }

  function drawLegend(seriesList) {
    const list = Array.isArray(seriesList) ? seriesList : [];
    const selectionSignature = makeLegendSignature(list);
    if (selectionSignature !== legendSelectionSignature) {
      legendSelectionSignature = selectionSignature;
      legendPage = 0;
    }
    const layout = scroll.layoutKey(list.length, legendPage);
    legendPage = layout.page;
    const visibleList = sliceKeyCabinetPage(list, layout);
    const nextSignature = selectionSignature + ":page:" + legendPage;
    if (nextSignature !== legendSignature) {
      legendContainer.removeChildren().forEach(child => child.destroy({ children: true }));
      legendEntriesBySeriesId.clear();
      legendSignature = nextSignature;
      if (
        hoveredLegendSeriesId &&
        !visibleList.some((s) => String(s?.id ?? "") === hoveredLegendSeriesId)
      ) {
        hoveredLegendSeriesId = null;
      }

      for (const s of visibleList) {
        const seriesId = String(s?.id ?? "");
        if (!seriesId) continue;
        const lineColor = getTimegraphInk(s);

        const entryContainer = new PIXI.Container();
        entryContainer.eventMode = "static";
        entryContainer.cursor = "pointer";
        entryContainer.hitArea = new PIXI.Rectangle(
          0,
          0,
          LEGEND_ICON_SIZE,
          LEGEND_ICON_SIZE
        );
        entryContainer.on("pointerdown", (event) => {
          event?.stopPropagation?.();
          setLegendHoverSeries(seriesId);
          tooltipView?.pin?.(getLegendDetailSpec(s, entryContainer), entryContainer.getBounds(), "timegraph-series:" + seriesId);
        });
        entryContainer.on("pointertap", (event) => {
          event?.stopPropagation?.();
        });
        const bg = new PIXI.Graphics();
        entryContainer.addChild(bg);
        legendContainer.addChild(entryContainer);

        legendEntriesBySeriesId.set(seriesId, {
          seriesId,
          seriesDef: s,
          container: entryContainer,
          bg,
          lineColor,
        });
      }
    }

    const entries = Array.from(legendEntriesBySeriesId.values());
    entries.forEach((entry, index) => entry.container.position.set(layout.points[index].x, layout.points[index].y));
    refreshLegendStyles();
  }

  legendContainer.on("pointermove", (event) => updateLegendTooltip(event.global));
  legendContainer.on("pointerleave", () => {
    clearLegendHoverSeries();
    tooltipView?.hide?.();
  });

  function setLegendPage(requestedPage) {
    const next = resolveKeyCabinetPage(getActiveSeries().length, requestedPage).page;
    if (next === legendPage) return;
    legendPage = next;
    hoveredLegendSeriesId = null;
    tooltipView?.hide?.({ force: true });
    drawPlot();
    drawScrub();
  }
  legendContainer.on("wheel", event => {
    event.stopPropagation();
    event.preventDefault?.();
    if (event.deltaY) setLegendPage(legendPage + Math.sign(event.deltaY));
  });

  zoomBtn.hitArea = new PIXI.Rectangle(-5, -5, focusRect.width + 10, focusRect.height + 10);
  targetBtn.hitArea = new PIXI.Rectangle(-5, -5, seriesRect.width + 10, seriesRect.height + 10);
  zoomBtn.on("pointerover", () => scroll.paintButtonState(zoomBg, "focus", zoomed, true));
  zoomBtn.on("pointerout", () => scroll.paintButtonState(zoomBg, "focus", zoomed));
  targetBtn.on("pointerover", () => scroll.paintButtonState(targetBg, "series", false, true));
  targetBtn.on("pointerout", () => scroll.paintButtonState(targetBg, "series", false));
  function updateHeaderButtons() {
    scroll.update();
    scroll.paintButtonState(zoomBg, "focus", zoomed);
    zoomText.text = zoomed ? "Full" : "Focus";
    zoomText.x = (focusRect.width - zoomText.width) / 2;
    zoomText.y = (focusRect.height - zoomText.height) / 2 - 1;
    zoomBtn.position.set(focusRect.x, focusRect.y);
    if (hasTargetModeButton) {
      scroll.paintButtonState(targetBg, "series", false);
      targetText.text = "☷";
      targetText.x = (seriesRect.width - targetText.width) / 2;
      targetText.y = (seriesRect.height - targetText.height) / 2 - 1;
      targetBtn.position.set(seriesRect.x, seriesRect.y);
    }
  }

  function drawWindow() {
    headerUi.setWidth(WIN_W);

    plotHit.clear();
    plotHit.beginFill(0xffffff);
    plotHit.drawRect(plot.x, plot.y, plot.w, plot.h);
    plotHit.endFill();

    updateHeaderButtons();
  }

  function updateTimeBounds() {
    const tl = getTimeline?.();
    const cs = getCursorState?.();
    const preview =
      typeof getPreviewStatus === "function" ? getPreviewStatus() : null;
    const d = controller.getData?.() ?? {};

    const horizonSec = Math.max(0, Math.floor(d.horizonSec ?? 1200));

    const historyEnd = tl?.historyEndSec ?? 0;
    const currentT = Math.floor(cs?.tSec ?? 0);
    const forecastPreviewSec =
      preview?.isForecastPreview && Number.isFinite(preview?.previewSec)
        ? Math.max(0, Math.floor(preview.previewSec))
        : null;
    const rollingWindow =
      Number.isFinite(historyWindowSec) && historyWindowSec > 0
        ? Math.floor(historyWindowSec)
        : null;
    const customWindowSpec =
      typeof windowSpecResolver === "function"
        ? windowSpecResolver({
            timeline: tl,
            cursorState: cs,
            data: d,
            zoomed,
            historyWindowSec: rollingWindow,
          })
        : null;

    if (
      customWindowSpec &&
      Number.isFinite(customWindowSpec.minSec) &&
      Number.isFinite(customWindowSpec.maxSec)
    ) {
      const nextMinSec = Math.max(0, Math.floor(customWindowSpec.minSec));
      const nextMaxSec = Math.max(nextMinSec + 1, Math.floor(customWindowSpec.maxSec));
      setTimeBounds(nextMinSec, nextMaxSec, { immediate: true });
      const allowPreviewScrub =
        customWindowSpec.forceScrubToCursor !== true &&
        Number.isFinite(forecastPreviewSec);
      const preferredScrub = allowPreviewScrub
        ? forecastPreviewSec
        : Number.isFinite(customWindowSpec.scrubSec)
          ? Math.floor(customWindowSpec.scrubSec)
          : resolveDefaultGraphScrubSec({
              currentSec: currentT,
              forecastPreviewSec,
              latchedForecastScrubSec: scrub.latchedForecastScrubSec,
            });
      if (!scrub.isScrubbing || customWindowSpec.forceScrubToCursor === true) {
        scrub.scrubSec = clampScrubSecToRevealCap(preferredScrub);
      } else {
        scrub.scrubSec = clampScrubSecToRevealCap(scrub.scrubSec);
      }
      return;
    }

    if (zoomed) {
      const halfSpan = Math.max(1, Math.floor(horizonSec / 4));
      const span = halfSpan * 2;
      let min = currentT - halfSpan;
      let max = currentT + halfSpan;

      if (min < 0) {
        max += -min;
        min = 0;
      }

      setTimeBounds(min, Math.max(min + span, max), { immediate: true });
    } else {
      const liveMax = Math.max(historyEnd, currentT);
      setTimeBounds(
        rollingWindow != null ? Math.max(0, liveMax - rollingWindow) : 0,
        liveMax + horizonSec,
        { immediate: true }
      );
    }

    if (!scrub.isScrubbing) {
      const defaultScrubSec = resolveDefaultGraphScrubSec({
        currentSec: currentT,
        forecastPreviewSec,
        latchedForecastScrubSec: scrub.latchedForecastScrubSec,
      });
      scrub.scrubSec = clampScrubSecToRevealCap(defaultScrubSec);
    }
  }

  function getPlotSnapshot() {
    const data = controller.getData?.() ?? {};
    const seriesList = getActiveSeries();
    const cs = getCursorState?.();
    const cursorSec = Math.floor(cs?.tSec ?? 0);
    const sampleCursorSec = zoomed ? cursorSec : null;
    const cacheVersion =
      Number.isFinite(data.cacheVersion) ? data.cacheVersion : -1;
    const tl = getTimeline?.();
    syncScaleHighWaterTimeline(tl);
    const historyEndSec = Math.max(0, Math.floor(tl?.historyEndSec ?? 0));
    const displayHistoryEndSec = getDisplayHistoryEndSec(historyEndSec);
    const actualForecastCoverageEndSec = Math.max(
      historyEndSec,
      Math.floor(data?.forecastCoverageEndSec ?? historyEndSec)
    );
    const renderedHistoryEndSec = getRenderedHistoryEndSec(
      displayHistoryEndSec,
      actualForecastCoverageEndSec,
      {
        timeline: tl,
        cursorState: cs,
        graphData: data,
      }
    );
    const snapshotBoundsQuantumSec = Math.max(
      1,
      plotSnapshotBoundsQuantumSecCur
    );
    const snapshotTargetMaxSecRaw = plotSnapshotCoverForecastCur
      ? Math.max(maxSec, actualForecastCoverageEndSec)
      : maxSec;
    const snapshotMinSec =
      Math.floor(Math.max(0, minSec) / snapshotBoundsQuantumSec) *
      snapshotBoundsQuantumSec;
    const snapshotTargetMaxSec = resolvePlotSnapshotTargetMaxSec(
      snapshotTargetMaxSecRaw,
      snapshotMinSec
    );
    const snapshotMaxSec =
      Math.ceil(
        Math.max(snapshotMinSec + 1, snapshotTargetMaxSec) /
          snapshotBoundsQuantumSec
      ) *
      snapshotBoundsQuantumSec;
    const snapshotKey = `${cacheVersion}|${snapshotMinSec}:${snapshotMaxSec}|${displayHistoryEndSec}|${zoomed ? 1 : 0}|${
      sampleCursorSec == null ? "stable" : sampleCursorSec
    }`;
    const editableBounds = getEditableHistoryBounds?.();
    const visibleForecastCoverageEndSec = getVisibleForecastCoverageEndSec(
      actualForecastCoverageEndSec,
      displayHistoryEndSec
    );

    function buildDynamicSnapshotParts(baseSnapshot) {
      const customHistoryZones =
        typeof historyZoneResolver === "function"
          ? historyZoneResolver({
              minSec,
              maxSec,
              historyEndSec: renderedHistoryEndSec,
              actualHistoryEndSec: historyEndSec,
              displayHistoryEndSec,
              actualForecastCoverageEndSec,
              visibleForecastCoverageEndSec,
              editableBounds,
              timeline: tl,
              cursorState: cs,
              graphData: data,
              zoomed,
            })
          : null;
      const historyZones = normalizeHistoryZoneSegments(
        Array.isArray(customHistoryZones) && customHistoryZones.length
          ? customHistoryZones
          : computeHistoryZoneSegments({
              minSec,
              maxSec,
              historyEndSec: renderedHistoryEndSec,
              baseMinEditableSec: Number.isFinite(editableBounds?.minEditableSec)
                ? Math.max(0, Math.floor(editableBounds.minEditableSec))
                : 0,
              extraEditableRanges: [],
            }),
        { minSec, maxSec, historyEndSec: renderedHistoryEndSec }
      );
      const itemUnavailableZones = normalizeItemUnavailableZones(
        customHistoryZones,
        { minSec, maxSec }
      );
      const rawEventMarkers =
        typeof eventMarkerResolver === "function"
          ? eventMarkerResolver({
              minSec,
              maxSec,
              historyEndSec: renderedHistoryEndSec,
              actualHistoryEndSec: historyEndSec,
              displayHistoryEndSec,
              actualForecastCoverageEndSec,
              visibleForecastCoverageEndSec,
              timeline: tl,
              cursorState: cs,
              graphData: data,
            })
          : null;
      return {
        ...baseSnapshot,
        renderedHistoryEndSec,
        historyZones,
        itemUnavailableZones,
        eventMarkers: normalizeEventMarkers(rawEventMarkers, { minSec, maxSec }),
      };
    }

    function refreshPlotSnapshotForecastState(
      baseSnapshot,
      { stablePrefixEndSec = null } = {}
    ) {
      const basePoints = Array.isArray(baseSnapshot?.pointsForDraw)
        ? baseSnapshot.pointsForDraw
        : [];
      if (!basePoints.length || !seriesList.length) {
        return {
          pointsForDraw: basePoints,
          seriesValues: new Map(),
          seriesScaleRanges: new Map(),
        };
      }

      const pointSecs = basePoints.map((point) =>
        Math.max(0, Math.floor(point?.tSec ?? 0))
      );
      let requestedPointSecs = pointSecs.filter((sec) => sec <= maxSec);
      if (PLOT_REFRESH_OVERSCAN_POINTS > 0) {
        const overscanSecs = pointSecs.filter((sec) => sec > maxSec);
        if (overscanSecs.length) {
          requestedPointSecs = requestedPointSecs.concat(
            overscanSecs.slice(0, PLOT_REFRESH_OVERSCAN_POINTS)
          );
        }
      }
      const valuesBySec =
        controller.getSeriesValuesForSeconds?.(requestedPointSecs, {
          focus: zoomed,
          allowSyncForecast: false,
        }) ?? new Map();
      const refreshedPoints = new Array(basePoints.length);
      const refreshedSeriesValues = new Map();
      for (const s of seriesList) {
        refreshedSeriesValues.set(s.id, new Array(basePoints.length));
      }
      const clampedStablePrefixEndSec = Number.isFinite(stablePrefixEndSec)
        ? Math.max(0, Math.floor(stablePrefixEndSec))
        : null;

      for (let i = 0; i < basePoints.length; i++) {
        const point = basePoints[i];
        const t = pointSecs[i];
        const preserveStablePoint =
          clampedStablePrefixEndSec != null && t <= clampedStablePrefixEndSec;
        if (preserveStablePoint) {
          refreshedPoints[i] = point;
          for (const seriesDef of seriesList) {
            const arr = refreshedSeriesValues.get(seriesDef.id);
            if (!arr) continue;
            const prevValues = baseSnapshot?.seriesValues?.get?.(seriesDef.id);
            arr[i] = Array.isArray(prevValues)
              ? prevValues[i] ?? null
              : null;
          }
          continue;
        }
        const resolvedValues = valuesBySec.get(t) ?? null;
        const pending = t > historyEndSec && resolvedValues == null;
        const refreshedPoint =
          point?.pending === pending && point?.values === resolvedValues
            ? point
            : {
                ...point,
                pending,
                values: resolvedValues,
              };
        refreshedPoints[i] = refreshedPoint;

        for (const seriesDef of seriesList) {
          let value = null;
          if (
            pending !== true &&
            !(t > historyEndSec && t > actualForecastCoverageEndSec)
          ) {
            const override = seriesValueOverrideResolver?.(
              t,
              seriesDef.id,
              refreshedPoint,
              sampleCursorSec
            );
            value = Number.isFinite(override)
              ? override
              : getSeriesValue(refreshedPoint, seriesDef.id);
          }
          const arr = refreshedSeriesValues.get(seriesDef.id);
          if (arr) arr[i] = value;
        }
      }

      let refreshedScaleRanges = computeSeriesScaleRangesForReveal(
        seriesList,
        refreshedPoints,
        refreshedSeriesValues,
        visibleForecastCoverageEndSec
      );
      const refreshedVisibleMaxValues = computeVisibleSeriesMaxValues(
        refreshedPoints,
        refreshedSeriesValues,
        seriesList,
        visibleForecastCoverageEndSec
      );
      if (freezeScaleMaxDuringRevealCur) {
        refreshedScaleRanges = applyStickyScaleRangeSources(
          refreshedScaleRanges,
          seriesList,
          [
            baseSnapshot?.seriesScaleRanges,
            getProjectionReplacementScaleRanges(),
          ]
        );
        triggerSeriesScaleMaxFlash({
          previousRanges: baseSnapshot?.seriesScaleRanges,
          nextRanges: refreshedScaleRanges,
          visibleMaxValues: refreshedVisibleMaxValues,
        });
      }
      refreshedScaleRanges = applyRunScaleHighWaterRanges(
        refreshedScaleRanges,
        seriesList,
        data?.subjectKey
      );

      return {
        pointsForDraw: refreshedPoints,
        seriesValues: refreshedSeriesValues,
        seriesScaleRanges: refreshedScaleRanges,
      };
    }

    if (plotSnapshot && plotSnapshotKey === snapshotKey) {
      const stablePrefixEndSec =
        freezeRevealedPlotPrefixCur &&
        Number.isFinite(plotSnapshot?.visibleForecastCoverageEndSec)
          ? Math.min(
              maxSec,
              Math.max(
                displayHistoryEndSec,
                Math.floor(plotSnapshot.visibleForecastCoverageEndSec)
              )
            )
          : null;
      const refreshedForecastState = refreshPlotSnapshotForecastState(
        plotSnapshot,
        { stablePrefixEndSec }
      );
      plotSnapshot = {
        ...plotSnapshot,
        data,
        tl,
        cs,
        cursorSec,
        historyEndSec,
        displayHistoryEndSec,
        actualForecastCoverageEndSec,
        visibleForecastCoverageEndSec,
        pointsForDraw: refreshedForecastState.pointsForDraw,
        seriesValues: refreshedForecastState.seriesValues,
        seriesScaleRanges: refreshedForecastState.seriesScaleRanges,
      };
      return buildDynamicSnapshotParts(plotSnapshot);
    }

    const sampleRes = controller.getSamplesForWindow?.({
      startSec: snapshotMinSec,
      endSec: snapshotMaxSec,
      focus: zoomed,
      cursorSec: sampleCursorSec,
    });
    const sampledPoints = Array.isArray(sampleRes?.points)
      ? sampleRes.points
      : [];

    let pointsForDraw = sampledPoints;
    const maxPlotPoints = Math.min(
      MAX_PLOT_POINTS,
      Math.max(200, Math.floor(plot.w) * 2)
    );
    if (sampledPoints.length > maxPlotPoints) {
      const step = Math.ceil(sampledPoints.length / maxPlotPoints);
      const decimated = [];
      for (let i = 0; i < sampledPoints.length; i += step) {
        decimated.push(sampledPoints[i]);
      }
      const last = sampledPoints[sampledPoints.length - 1];
      if (last && decimated[decimated.length - 1] !== last) {
        decimated.push(last);
      }
      pointsForDraw = decimated;
    }

    const minEditableSec = Number.isFinite(editableBounds?.minEditableSec)
      ? Math.max(0, Math.floor(editableBounds.minEditableSec))
      : 0;

    const seriesValues = new Map();
    for (const s of seriesList) {
      seriesValues.set(s.id, new Array(pointsForDraw.length));
    }

    for (let i = 0; i < pointsForDraw.length; i++) {
      const point = pointsForDraw[i];
      const t = Math.max(0, Math.floor(point?.tSec ?? 0));
      for (const seriesDef of seriesList) {
        let value = null;
        if (point?.pending !== true && !(t > historyEndSec && t > actualForecastCoverageEndSec)) {
          const override = seriesValueOverrideResolver?.(
            t,
            seriesDef.id,
            point,
            sampleCursorSec
          );
          value = Number.isFinite(override)
            ? override
            : getSeriesValue(point, seriesDef.id);
        }
        const arr = seriesValues.get(seriesDef.id);
        if (arr) arr[i] = value;
      }
    }
    const previousSnapshotCompatible =
      freezeRevealedPlotPrefixCur &&
      plotSnapshot &&
      Number(plotSnapshot?.data?.cacheVersion ?? -1) === cacheVersion &&
      Math.floor(plotSnapshot?.snapshotMinSec ?? -1) === snapshotMinSec &&
      Math.floor(plotSnapshot?.displayHistoryEndSec ?? -1) === displayHistoryEndSec &&
      Math.floor(plotSnapshot?.zoomed ? 1 : 0) === (zoomed ? 1 : 0) &&
      Math.floor(plotSnapshot?.sampleCursorSec ?? -1) ===
        Math.floor(sampleCursorSec ?? -1);
    const previousStablePrefixEndSec =
      previousSnapshotCompatible &&
      Number.isFinite(plotSnapshot?.visibleForecastCoverageEndSec)
        ? Math.min(
            maxSec,
            Math.max(
              displayHistoryEndSec,
              Math.floor(plotSnapshot.visibleForecastCoverageEndSec)
            )
          )
        : null;
    if (
      previousStablePrefixEndSec != null &&
      Array.isArray(plotSnapshot?.pointsForDraw) &&
      plotSnapshot.pointsForDraw.length
    ) {
      const mergedPoints = [];
      const mergedSeriesValues = new Map();
      for (const s of seriesList) {
        mergedSeriesValues.set(s.id, []);
      }
      const appendPoint = (point, seriesValueSource, index) => {
        mergedPoints.push(point);
        for (const s of seriesList) {
          const arr = mergedSeriesValues.get(s.id);
          const sourceArr = seriesValueSource?.get?.(s.id);
          arr.push(Array.isArray(sourceArr) ? sourceArr[index] ?? null : null);
        }
      };
      const previousPoints = Array.isArray(plotSnapshot?.pointsForDraw)
        ? plotSnapshot.pointsForDraw
        : [];
      for (let i = 0; i < previousPoints.length; i++) {
        const point = previousPoints[i];
        const t = Math.max(0, Math.floor(point?.tSec ?? 0));
        if (t > previousStablePrefixEndSec) break;
        appendPoint(point, plotSnapshot?.seriesValues, i);
      }
      for (let i = 0; i < pointsForDraw.length; i++) {
        const point = pointsForDraw[i];
        const t = Math.max(0, Math.floor(point?.tSec ?? 0));
        if (t <= previousStablePrefixEndSec) continue;
        appendPoint(point, seriesValues, i);
      }
      pointsForDraw = mergedPoints;
      for (const s of seriesList) {
        seriesValues.set(s.id, mergedSeriesValues.get(s.id) ?? []);
      }
    }
    let seriesScaleRanges = computeSeriesScaleRangesForReveal(
      seriesList,
      pointsForDraw,
      seriesValues,
      visibleForecastCoverageEndSec
    );
    const visibleMaxValues = computeVisibleSeriesMaxValues(
      pointsForDraw,
      seriesValues,
      seriesList,
      visibleForecastCoverageEndSec
    );
    if (freezeScaleMaxDuringRevealCur && previousSnapshotCompatible) {
      seriesScaleRanges = applyStickyScaleRangeSources(
        seriesScaleRanges,
        seriesList,
        [
          plotSnapshot?.seriesScaleRanges,
          getProjectionReplacementScaleRanges(),
        ]
      );
      triggerSeriesScaleMaxFlash({
        previousRanges: plotSnapshot?.seriesScaleRanges,
        nextRanges: seriesScaleRanges,
        visibleMaxValues,
      });
    } else if (freezeScaleMaxDuringRevealCur) {
      seriesScaleRanges = applyStickyScaleRangeSources(
        seriesScaleRanges,
        seriesList,
        [getProjectionReplacementScaleRanges()]
      );
    }
    seriesScaleRanges = applyRunScaleHighWaterRanges(
      seriesScaleRanges,
      seriesList,
      data?.subjectKey
    );

    const markerActionSecs = getMarkerActionSecs(
      minSec,
      maxSec,
      Math.floor(plot.w * MAX_ACTION_MARKERS_DENSITY)
    );
    const markerSecs = getMarkerSeconds(markerActionSecs);

    plotSnapshotKey = snapshotKey;
    plotSnapshot = {
      data,
      tl,
      cs,
      cursorSec,
      seriesList,
      pointsForDraw,
      seriesValues,
      seriesScaleRanges,
      historyEndSec,
      displayHistoryEndSec,
      actualForecastCoverageEndSec,
      visibleForecastCoverageEndSec,
      snapshotMinSec,
      snapshotMaxSec,
      sampleCursorSec,
      zoomed,
      markerSecs,
    };
    return buildDynamicSnapshotParts(plotSnapshot);
  }

  function drawPlot() {
    resolveMetric();
    const perfStart = perfEnabled() ? perfNowMs() : 0;
    const plotNowMs = performance.now();
    plotG.clear();
    const snapshot = getPlotSnapshot();
    const data = snapshot?.data ?? {};
    const seriesList = Array.isArray(snapshot?.seriesList)
      ? snapshot.seriesList
      : [];
    drawLegend(seriesList);
    const pointsForDraw = Array.isArray(snapshot?.pointsForDraw)
      ? snapshot.pointsForDraw
      : [];
    if (!pointsForDraw.length || !seriesList.length) return;

    const tl = snapshot?.tl ?? getTimeline?.();
    const cs = snapshot?.cs ?? getCursorState?.();
    const cursorSec = Math.floor(snapshot?.cursorSec ?? cs?.tSec ?? 0);
    const historyEndSec = Math.max(
      0,
      Math.floor(snapshot?.historyEndSec ?? tl?.historyEndSec ?? 0)
    );
    const displayHistoryEndSec = Math.max(
      0,
      Math.floor(snapshot?.displayHistoryEndSec ?? historyEndSec)
    );
    const renderedHistoryEndSec = Math.max(
      displayHistoryEndSec,
      Math.floor(snapshot?.renderedHistoryEndSec ?? displayHistoryEndSec)
    );
    const actualForecastCoverageEndSec = Math.max(
      historyEndSec,
      Math.floor(
        snapshot?.actualForecastCoverageEndSec ?? data?.forecastCoverageEndSec ?? historyEndSec
      )
    );
    const visibleForecastCoverageEndSec = Math.max(
      displayHistoryEndSec,
      Math.min(
        actualForecastCoverageEndSec,
        reveal.historyEndSec === displayHistoryEndSec
          ? Number(reveal.visibleEndSec ?? displayHistoryEndSec)
          : displayHistoryEndSec
      )
    );
    const lineDrawEndSec = Math.max(
      displayHistoryEndSec,
      Math.min(maxSec, visibleForecastCoverageEndSec)
    );
    const seriesValues = snapshot?.seriesValues ?? new Map();
    const seriesScaleRanges =
      snapshot?.seriesScaleRanges instanceof Map
        ? snapshot.seriesScaleRanges
        : new Map();

    const historyZones = Array.isArray(snapshot?.historyZones)
      ? snapshot.historyZones
      : [];
    const itemUnavailableZones = Array.isArray(snapshot?.itemUnavailableZones)
      ? snapshot.itemUnavailableZones
      : [];
    fillHistoryZones(plotG, {
      historyZones,
      itemUnavailableZones,
      renderedHistoryEndSec,
      lineDrawEndSec,
      minSec,
      maxSec,
      plot,
    });

    drawPlotGrid(plotG, minSec, maxSec, plot);

    const seriesInkArgs = {
      minSec,
      maxSec,
      plot,
      seriesScaleRanges,
      hoveredLegendSeriesId,
      getFlashStrength: (seriesId) =>
        getSeriesScaleMaxFlashStrength(seriesId, plotNowMs),
    };
    function drawSeriesLinesForRange(opts) {
      paintSeriesLinesForRange(plotG, { ...seriesInkArgs, ...opts });
    }

    const projectionReplacementState = buildProjectionReplacementRenderState(
      performance.now(),
      lineDrawEndSec
    );
    if (projectionReplacementState) {
      if (
        projectionReplacementState.unchangedEndSec >
        projectionReplacementState.unchangedStartSec
      ) {
        drawSeriesLinesForRange({
          sourceSeriesList: seriesList,
          sourcePoints: projectionReplacementState.snapshot?.pointsForDraw,
          sourceSeriesValues:
            projectionReplacementState.snapshot?.seriesValues ?? new Map(),
          drawStartSec: projectionReplacementState.unchangedStartSec,
          drawEndSec: projectionReplacementState.unchangedEndSec,
        });
      }
      drawZone(
        plotG,
        projectionReplacementState.drawStartSec,
        projectionReplacementState.drawEndSec,
        projectionReplacementState.zoneColor,
        projectionReplacementState.zoneAlpha,
        minSec,
        maxSec,
        plot
      );
      drawSeriesLinesForRange({
        sourceSeriesList: seriesList,
        sourcePoints: projectionReplacementState.snapshot?.pointsForDraw,
        sourceSeriesValues:
          projectionReplacementState.snapshot?.seriesValues ?? new Map(),
        drawStartSec: projectionReplacementState.drawStartSec,
        drawEndSec: projectionReplacementState.drawEndSec,
        colorResolver: (baseColor) =>
          blendColor(
            baseColor,
            projectionReplacementState.tintColor,
            projectionReplacementState.tintStrength
          ),
        alphaMultiplier: projectionReplacementState.lineAlpha,
      });
    }

    drawSeriesLinesForRange({
      sourceSeriesList: seriesList,
      sourcePoints: pointsForDraw,
      sourceSeriesValues: seriesValues,
      drawStartSec: minSec,
      drawEndSec: lineDrawEndSec,
      enableScaleMaxFlash: true,
    });

    drawForecastRevealMarker(plotG, lineDrawEndSec, maxSec, minSec, plot);

    const markerSecs = Array.isArray(snapshot?.markerSecs)
      ? snapshot.markerSecs
      : [];
    drawActionMarkers(plotG, markerSecs, minSec, maxSec, plot);

    const eventMarkers = Array.isArray(snapshot?.eventMarkers)
      ? snapshot.eventMarkers
      : [];
    drawEventMarkers(plotG, eventMarkers, minSec, maxSec, plot);

    drawBootFadeOverlay(plotG, getBootFadeRenderState(performance.now()), plot);

    if (perfEnabled()) {
      recordGraphRender({
        ms: perfNowMs() - perfStart,
        points: pointsForDraw.length,
        metric: data.metric?.id ?? metricDef?.id ?? metricDef?.label ?? null,
      });
    }
  }

  function drawScrub() {
    resolveMetric();
    const cs = getCursorState?.();
    const tl = getTimeline?.();
    const preview =
      typeof getPreviewStatus === "function" ? getPreviewStatus() : null;

    if (!cs) return;

    const curT = Math.floor(cs.tSec ?? 0);
    const historyEnd = tl?.historyEndSec ?? 0;
    const forecastPreviewSec =
      preview?.isForecastPreview && Number.isFinite(preview?.previewSec)
        ? Math.max(0, Math.floor(preview.previewSec))
        : null;
    const hasForecastPreview = Number.isFinite(forecastPreviewSec);
    const metricLabel = getMetricLabel();
    const signature =
      `${scrub.isScrubbing ? 1 : 0}|${scrub.scrubSec}|${curT}|${historyEnd}|` +
      `${minSec}:${maxSec}|${scrub.statusNote}|${metricLabel}|${hasForecastPreview ? forecastPreviewSec : -1}`;
    if (signature === lastScrubSignature) return;
    lastScrubSignature = signature;

    scrubG.clear();
    drawScrubMarkers(scrubG, {
      scrubSec: scrub.scrubSec,
      curT,
      isScrubbing: scrub.isScrubbing,
      hasForecastPreview,
      minSec,
      maxSec,
      plot,
    });

    scroll.setScope(metricLabel);
  }

  function applyPreviewThrottled(force) {
    const now = performance.now();
    if (!force && now - lastRestoreMs < RESTORE_THROTTLE_MS) {
      drawScrub();
      return;
    }
    lastRestoreMs = now;
    const tl = getTimeline?.();
    const historyEnd = Math.floor(tl?.historyEndSec ?? 0);
    const visibleForecastCapSec = getVisibleForecastScrubCapSec();

    if (scrub.scrubSec > historyEnd && scrub.scrubSec > visibleForecastCapSec) {
      scrub.statusNote = "Forecast revealing";
      clearPreviewState?.();
      drawScrub();
      return;
    }

    const restored = controller.getStateAt(scrub.scrubSec);
    if (restored) {
      if (
        scrub.statusNote === "Forecast loading" ||
        scrub.statusNote === "Forecast revealing"
      ) {
        scrub.statusNote = "";
      }
      if (scrub.scrubSec > historyEnd) {
        setLatchedForecastScrub(scrub, scrub.scrubSec);
      } else {
        clearLatchedForecastScrub(scrub);
      }
      setPreviewState?.(restored);
    } else {
      if (scrub.scrubSec > historyEnd) {
        scrub.statusNote = "Forecast loading";
        setLatchedForecastScrub(scrub, scrub.scrubSec);
        clearPreviewState?.();
      }
    }
    drawScrub();
  }

  function endScrub(commit) {
    if (!releaseScrubSession(scrub)) return;
    const tl = getTimeline?.();
    const historyEnd = Math.floor(tl?.historyEndSec ?? 0);
    const visibleForecastCapSec = getVisibleForecastScrubCapSec();
    const isForecast = scrub.scrubSec > historyEnd;

    if (commit && !isForecast) {
      clearLatchedForecastScrub(scrub);
      if (commitHistoryOnScrubRelease && typeof commitPolicyResolver === "function") {
        const decision = commitPolicyResolver({
          scrubSec: scrub.scrubSec,
          historyEndSec: historyEnd,
          editableBounds: getEditableHistoryBounds?.(),
        });
        const blocked =
          decision === false ||
          (decision && typeof decision === "object" && decision.allow === false);
        if (blocked) {
          scrub.statusNote =
            (decision && typeof decision === "object" && decision.reason) ||
            "Read-only";
          drawScrub();
          return;
        }
      }
      clearPreviewState?.();
      const stateData = controller?.getStateDataAt?.(scrub.scrubSec);
      const res = commitSecond?.(scrub.scrubSec, stateData);
      if (res && res.ok === false) {
        scrub.statusNote = `Jump failed: ${res.reason}`;
        drawScrub();
        return;
      }
      return;
    }

    if (isForecast) {
      if (scrub.scrubSec > visibleForecastCapSec) {
        scrub.statusNote = "Forecast revealing";
        clearPreviewState?.();
        drawScrub();
        return;
      }
      setLatchedForecastScrub(scrub, scrub.scrubSec);
      if (controller?.getStateDataAt?.(scrub.scrubSec) == null) {
        scrub.statusNote = "Forecast loading";
        clearPreviewState?.();
        drawScrub();
        return;
      }
      if (commit && commitForecastOnScrubRelease) {
        clearPreviewState?.();
        const stateData = controller?.getStateDataAt?.(scrub.scrubSec);
        const res = commitSecond?.(scrub.scrubSec, stateData);
        if (res && res.ok === false) {
          scrub.statusNote = `Jump failed: ${res.reason}`;
          drawScrub();
          return;
        }
        clearLatchedForecastScrub(scrub);
        scrub.statusNote = "";
        drawScrub();
        return;
      }
      scrub.statusNote = scrub.forecastPreviewStatusNote;
      applyPreviewThrottled(true);
      return;
    }

    clearLatchedForecastScrub(scrub);
    clearPreviewState?.();
    drawScrub();
  }

  plotHit.on("pointerdown", (e) => {
    beginScrubSession(scrub);
    suspendForecastRevealPlayheadFollow();
    updateScrubFromPointer(e.global);
    applyPreviewThrottled(true);
  });

  plotHit.on("pointermove", (e) => {
    if (!scrub.isScrubbing) {
      updateEventMarkerTooltip(e.global);
      return;
    }
    updateScrubFromPointer(e.global);
    applyPreviewThrottled(false);
  });

  plotHit.on("pointerup", () => endScrub(true));
  plotHit.on("pointerupoutside", () => endScrub(true));
  plotHit.on("pointerleave", () => {
    if (!scrub.isScrubbing && hoveredEventMarkerKey) {
      hoveredEventMarkerKey = null;
      tooltipView?.hide?.();
    }
  });

  zoomBtn.on("pointerdown", (e) => {
    e.stopPropagation();
  });
  zoomBtn.on("pointertap", (e) => {
    e.stopPropagation();
    zoomed = !zoomed;
    invalidatePlotSnapshot();
    scrub.statusNote = "";
    render();
  });

  targetBtn.on("pointerdown", (e) => {
    e.stopPropagation();
  });
  targetBtn.on("pointertap", (e) => {
    e.stopPropagation();
    if (!hasTargetModeButton) return;
    onToggleSystemTargetMode?.();
    scrub.statusNote = "";
    render();
  });

  function open() {
    if (root.visible) return;
    root.visible = true;
    const defaultX = 20;
    const defaultY = app.screen.height - WIN_H - 800;
    root.x = openPosition?.x ?? defaultX;
    root.y = openPosition?.y ?? defaultY;
    const nowMs = performance.now();
    reveal.paused = false;
    reveal.playheadFollowEnabled = true;
    reveal.previewSec = null;
    reveal.previewLastRefreshMs = 0;
    reveal.capEndSec = null;
    invalidatePlotSnapshot();
    seriesScaleMaxFlashBySeriesId.clear();
    clearProjectionReplacementTransition();
    beginBootFadeTransition(nowMs);
    resetForecastReveal(0, 0, 0, nowMs);
    if (bootRevealDelayMsCur > 0) {
      reveal.delayUntilMs = Math.max(
        reveal.delayUntilMs,
        nowMs + bootRevealDelayMsCur
      );
    }
    animatedMinSec = null;
    animatedMaxSec = null;
    animatedBoundsLastTickMs = 0;
    solidHitArea.refresh();
    controller?.setActive?.(true);
    controller.handleInvalidate?.("open");
    controller.ensureCache();
    render();
  }

  function close() {
    if (!root.visible) return;
    root.visible = false;
    resetForecastPreviewState();
    invalidatePlotSnapshot();
    seriesScaleMaxFlashBySeriesId.clear();
    clearProjectionReplacementTransition();
    reveal.capEndSec = null;
    clearBootFadeTransition();
    resetForecastReveal(0, 0, 0, performance.now());
    animatedMinSec = null;
    animatedMaxSec = null;
    animatedBoundsLastTickMs = 0;
    clearLegendEntries();
    tooltipView?.hide?.();
    clearPreviewState?.();
    controller?.setActive?.(false);
  }

  function isOpen() {
    return !!root.visible;
  }

  function getScreenRect() {
    if (!root.visible || typeof root.getBounds !== "function") return null;
    return root.getBounds();
  }

  function getPlotScreenRect() {
    if (
      !root.visible ||
      typeof root.toGlobal !== "function" ||
      typeof app?.view?.getBoundingClientRect !== "function"
    ) {
      return null;
    }
    const topLeft = root.toGlobal(new PIXI.Point(plot.x, plot.y));
    const bottomRight = root.toGlobal(
      new PIXI.Point(plot.x + plot.w, plot.y + plot.h)
    );
    const canvasRect = app.view.getBoundingClientRect();
    const scaleX = canvasRect.width / Math.max(1, Number(app.screen?.width ?? 1));
    const scaleY = canvasRect.height / Math.max(1, Number(app.screen?.height ?? 1));
    return {
      x: canvasRect.left + Number(topLeft?.x ?? 0) * scaleX,
      y: canvasRect.top + Number(topLeft?.y ?? 0) * scaleY,
      width:
        Math.max(0, Number(bottomRight?.x ?? 0) - Number(topLeft?.x ?? 0)) *
        scaleX,
      height:
        Math.max(0, Number(bottomRight?.y ?? 0) - Number(topLeft?.y ?? 0)) *
        scaleY,
    };
  }

  function getDebugState() {
    const tl = getTimeline?.();
    const data = controller.getData?.() ?? {};
    const snapshot = getPlotSnapshot();
    const pointsForDraw = Array.isArray(snapshot?.pointsForDraw)
      ? snapshot.pointsForDraw
      : [];
    const historyEndSec = Math.max(0, Math.floor(tl?.historyEndSec ?? 0));
    const displayHistoryEndSec = getDisplayHistoryEndSec(historyEndSec);
    const actualForecastCoverageEndSec = Math.max(
      historyEndSec,
      Math.floor(data?.forecastCoverageEndSec ?? historyEndSec)
    );
    const followTargetEndSec = getForecastRevealFollowTargetEndSec(
      actualForecastCoverageEndSec,
      displayHistoryEndSec
    );
    const visibleForecastCoverageEndSec = Math.max(
      displayHistoryEndSec,
      Math.min(
        actualForecastCoverageEndSec,
        reveal.historyEndSec === displayHistoryEndSec
          ? Math.floor(reveal.visibleEndSec ?? displayHistoryEndSec)
          : displayHistoryEndSec
      )
    );
    const renderedSeriesSamples = Array.isArray(snapshot?.seriesList)
      ? snapshot.seriesList.map((series) => {
          const values = snapshot?.seriesValues?.get?.(series?.id);
          let first = null;
          let last = null;
          if (Array.isArray(values)) {
            for (let index = 0; index < values.length; index += 1) {
              const value = values[index];
              if (!Number.isFinite(value)) continue;
              const sample = {
                tSec: Math.max(
                  0,
                  Math.floor(pointsForDraw[index]?.tSec ?? 0)
                ),
                value,
              };
              if (!first) first = sample;
              last = sample;
            }
          }
          return {
            seriesId: series?.id ?? null,
            first,
            last,
          };
        })
      : [];
    return {
      groupButtons: scroll.getButtons(),
      scopeLabel: scroll.getScopeLabel(),
      key: scroll.getKeyDebugState(),
      legendButtons: Array.from(legendEntriesBySeriesId, ([id, entry]) => {
        const point = entry.container.toGlobal(new PIXI.Point(LEGEND_ICON_SIZE / 2, LEGEND_ICON_SIZE / 2));
        return { id, x: point.x, y: point.y };
      }),
      activeGroups: getActiveSeriesGroups?.() ?? [],
      seriesMenuButton: targetBtn.toGlobal(new PIXI.Point(seriesRect.width / 2, seriesRect.height / 2)),
      focusButton: zoomBtn.toGlobal(new PIXI.Point(focusRect.width / 2, focusRect.height / 2)),
      minSec,
      maxSec,
      scrubSec: scrub.scrubSec,
      statusNote: scrub.statusNote,
      isScrubbing: scrub.isScrubbing,
      zoomed,
      historyEndSec,
      displayHistoryEndSec,
      actualForecastCoverageEndSec,
      visibleForecastCoverageEndSec,
      computedCoverageEndSec: actualForecastCoverageEndSec,
      revealedCoverageEndSec: visibleForecastCoverageEndSec,
      browseCapSec: visibleForecastCoverageEndSec,
      forecastRevealFollowTargetEndSec: Math.max(
        displayHistoryEndSec,
        Math.floor(followTargetEndSec ?? displayHistoryEndSec)
      ),
      forecastRevealVelocitySecPerSec: Math.max(
        0,
        Number(reveal.velocitySecPerSec ?? 0)
      ),
      forecastRevealHistoryEndSec: Math.max(
        0,
        Math.floor(reveal.historyEndSec ?? 0)
      ),
      forecastRevealTargetEndSec: Math.max(
        0,
        Math.floor(reveal.targetEndSec ?? 0)
      ),
      forecastRevealPlayheadFollowEnabled: reveal.playheadFollowEnabled,
      forecastRevealPaused: reveal.paused,
      forecastRevealPreviewSec: Number.isFinite(reveal.previewSec)
        ? Math.max(0, Math.floor(reveal.previewSec))
        : null,
      projectionReplacement: projectionReplacement
        ? {
            active: true,
            truncationStartSec: Math.max(
              0,
              Math.floor(projectionReplacement.truncationStartSec ?? 0)
            ),
            maxSecFloor: Number.isFinite(projectionReplacement.maxSecFloor)
              ? Math.max(0, Math.floor(projectionReplacement.maxSecFloor))
              : null,
            hasSnapshot: !!projectionReplacement.snapshot,
          }
        : null,
      historyZones: Array.isArray(snapshot?.historyZones)
        ? snapshot.historyZones.map((zone) => ({
            kind: zone.kind,
            startSec: Math.max(0, Math.floor(zone.startSec ?? 0)),
            endSec: Math.max(0, Math.floor(zone.endSec ?? 0)),
          }))
        : [],
      samplePointCount: pointsForDraw.length,
      samplePointSecs: {
        first: pointsForDraw
          .slice(0, 96)
          .map((point) => Math.max(0, Math.floor(point?.tSec ?? 0))),
        last: pointsForDraw
          .slice(Math.max(0, pointsForDraw.length - 32))
          .map((point) => Math.max(0, Math.floor(point?.tSec ?? 0))),
      },
      samplePointPending: {
        first: pointsForDraw
          .slice(0, 96)
          .map((point) => point?.pending === true),
      },
      renderedSeriesSamples,
      eventMarkers: Array.isArray(snapshot?.eventMarkers)
        ? snapshot.eventMarkers.map((marker) => ({
            tSec: marker.tSec,
            severity: marker.severity,
            color: marker.color,
            tooltipTitle: marker.tooltip?.title ?? null,
          }))
        : [],
      seriesScaleRanges:
        snapshot?.seriesScaleRanges instanceof Map
          ? Array.from(snapshot.seriesScaleRanges.entries()).map(([seriesId, range]) => ({
              seriesId,
              minValue: Number.isFinite(range?.minValue) ? range.minValue : null,
              maxValue: Number.isFinite(range?.maxValue) ? range.maxValue : null,
            }))
          : [],
      plotScreenRect: getPlotScreenRect(),
      windowScreenRect: getScreenRect(),
    };
  }

  function render() {
    if (!root.visible) return;
    resolveMetric();
    const now = performance.now();
    const data = controller.getData?.() ?? {};
    const tl = getTimeline?.();
    const historyEndSec = Math.max(0, Math.floor(tl?.historyEndSec ?? 0));
    const displayHistoryEndSec = getDisplayHistoryEndSec(historyEndSec);
    const actualForecastCoverageEndSec = Math.max(
      historyEndSec,
      Math.floor(data?.forecastCoverageEndSec ?? historyEndSec)
    );
    syncForecastRevealTarget(actualForecastCoverageEndSec, displayHistoryEndSec, now);
    const visibleForecastCoverageEndSec = getAnimatedForecastCoverageEndSec(
      now,
      displayHistoryEndSec
    );
    reveal.visibleEndSec = visibleForecastCoverageEndSec;
    updateTimeBounds();
    syncLatchedForecastPreviewStatus();
    tryRestoreLatchedForecastPreview();
    syncForecastRevealPlayhead(visibleForecastCoverageEndSec);
    syncForecastRevealPreview(visibleForecastCoverageEndSec, now);
    updateHeaderButtons();
    drawLegend(getActiveSeries());
    const projectionReplacementKey = getProjectionReplacementRenderKey(now);
    const seriesScaleMaxFlashKey = getSeriesScaleMaxFlashRenderKey(now);
    const bootFadeState = getBootFadeRenderState(now);
    const boundsKey = `${minSec}:${maxSec}:${displayHistoryEndSec}:${Math.floor(
      visibleForecastCoverageEndSec * 10
    )}:${projectionReplacementKey}:${seriesScaleMaxFlashKey}:${bootFadeState?.key ?? ""}`;
    const cacheVersion =
      Number.isFinite(data.cacheVersion) ? data.cacheVersion : -1;
    const versionChanged =
      cacheVersion !== lastPlotVersion || boundsKey !== lastPlotBoundsKey;
    const boundsChanged = boundsKey !== lastPlotBoundsKey;
    const revealAnimating =
      Math.max(
        displayHistoryEndSec,
        Math.floor(reveal.targetEndSec ?? displayHistoryEndSec)
      ) -
        visibleForecastCoverageEndSec >
      0.001 ||
      !!projectionReplacementKey ||
      !!seriesScaleMaxFlashKey ||
      !!bootFadeState;
    const shouldPlot =
      revealAnimating
        ? boundsChanged || now - lastPlotMs >= FORECAST_REVEAL_PLOT_THROTTLE_MS
        : scrub.isScrubbing || zoomed
          ? now - lastPlotMs >= PLOT_THROTTLE_MS
          : versionChanged && now - lastPlotMs >= PLOT_THROTTLE_MS;
    if (shouldPlot) {
      drawPlot();
      lastPlotMs = now;
      lastPlotVersion = revealAnimating ? -1 : cacheVersion;
      lastPlotBoundsKey = boundsKey;
    }
    drawScrub();
    solidHitArea.refresh();
  }

  drawWindow();

  function setWindowSpecResolver(nextResolver) {
    windowSpecResolver =
      typeof nextResolver === "function" ? nextResolver : null;
    invalidatePlotSnapshot();
    scrub.statusNote = "";
  }

  function setCommitPolicyResolver(nextResolver) {
    commitPolicyResolver =
      typeof nextResolver === "function" ? nextResolver : null;
    scrub.statusNote = "";
  }

  function setSeriesValueOverrideResolver(nextResolver) {
    seriesValueOverrideResolver =
      typeof nextResolver === "function" ? nextResolver : null;
    invalidatePlotSnapshot();
    scrub.statusNote = "";
  }

  function setHistoryZoneResolver(nextResolver) {
    historyZoneResolver =
      typeof nextResolver === "function" ? nextResolver : null;
    invalidatePlotSnapshot();
    scrub.statusNote = "";
  }

  function setEventMarkerResolver(nextResolver) {
    eventMarkerResolver =
      typeof nextResolver === "function" ? nextResolver : null;
    invalidatePlotSnapshot();
    lastPlotVersion = -1;
    lastPlotBoundsKey = "";
    scrub.statusNote = "";
  }

  function setForecastRevealConfig(next = {}) {
    applyForecastRevealConfig(reveal, next);
  }

  function destroy() {
    close();
    eventMarkerResolver = null;
    plotHit.removeAllListeners?.();
    zoomBtn.removeAllListeners?.();
    targetBtn.removeAllListeners?.();
    root.removeAllListeners?.();
    root.parent?.removeChild?.(root);
    root.destroy?.({ children: true });
  }

  return {
    open,
    close,
    destroy,
    isOpen,
    getScreenRect,
    getPlotScreenRect,
    getDebugState,
    getForecastScrubCapSec: () => getVisibleForecastScrubCapSec(),
    render,
    setWindowSpecResolver,
    setCommitPolicyResolver,
    setSeriesValueOverrideResolver,
    setHistoryZoneResolver,
    setEventMarkerResolver,
    setForecastRevealConfig,
    pauseForecastReveal,
    setPresentationSuspended: (suspended) => {
      presentationSuspended = suspended === true;
      reveal.lastTickMs = performance.now();
    },
    isFollowingForecastReveal: () =>
      readIsFollowingForecastReveal(reveal, presentationSuspended),
    suspendForecastRevealPlayheadFollow,
    resetForecastPreviewState,
    resetDataContext,
    stageProjectionReplacementTransition,
    clearProjectionReplacementTransition,
    restartForecastRevealFrom,
    clearForecastRevealRestart,
  };
}

export function createGoldGraphView(opts) {
  return createMetricGraphView({ ...opts, metric: GRAPH_METRICS.gold });
}
