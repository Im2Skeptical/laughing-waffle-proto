// src/views/gold-graph-pixi.js
// Render-only view for metric graphs.
// STAGE 3: tSec aware.

import { GRAPH_METRICS } from "../model/graph-metrics.js";
import { perfEnabled, perfNowMs, recordGraphRender } from "../model/perf.js";
import {
  getActionSecondsInRange,
  getActionSecondsInRangeSampled,
} from "../model/timeline/index.js";
import { computeHistoryZoneSegments } from "../model/timegraph/edit-policy.js";
import {
  GAMEPIECE_HOVER_SCALE,
  TIME_STATE_COLORS,
  TIME_STATE_GRAPH_BG_ALPHA,
} from "./layout-pixi.js";
import { MUCHA_UI_COLORS } from "./ui-helpers/mucha-ui-palette.js";
import { createWindowHeader } from "./ui-helpers/window-header.js";
import { applyTextResolution } from "./ui-helpers/text-resolution.js";
import { installSolidUiHitArea } from "./ui-helpers/solid-ui-hit-area.js";
import { getDisplayObjectWorldScale } from "./ui-helpers/display-object-scale.js";
import {
  blendColor,
  clamp01,
  clampForecastScrubTargetSec,
  computeGraphSeriesScaleRanges,
  getSeriesValue,
  lerpNumber,
  normalizeEventMarkers,
  normalizeHistoryZoneSegments,
  normalizeItemUnavailableZones,
  reconcileLatchedForecastPreview,
  resolveDefaultGraphScrubSec,
} from "./timegraphs-helpers.js";
export {
  clampForecastScrubTargetSec,
  computeGraphSeriesScaleRanges,
  reconcileLatchedForecastPreview,
  resolveDefaultGraphScrubSec,
} from "./timegraphs-helpers.js";

const TIMEGRAPH_THEME = Object.freeze({
  panelHeaderBg: MUCHA_UI_COLORS.surfaces.header,
  panelBodyBg: MUCHA_UI_COLORS.surfaces.panelDeep,
  panelBorder: MUCHA_UI_COLORS.surfaces.borderSoft,
  textPrimary: MUCHA_UI_COLORS.ink.primary,
  textMuted: MUCHA_UI_COLORS.ink.secondary,
  buttonBg: MUCHA_UI_COLORS.surfaces.borderSoft,
  buttonBgActive: MUCHA_UI_COLORS.surfaces.borderSoft,
  legendStroke: MUCHA_UI_COLORS.surfaces.borderSoft,
  legendStrokeHover: MUCHA_UI_COLORS.ink.primary,
  gridMajor: 0x6d6248,
  gridMinor: 0x5a523f,
  actionMarker: MUCHA_UI_COLORS.accents.sage,
  eventMarkerNormal: MUCHA_UI_COLORS.intent.softPop,
  eventMarkerCritical: MUCHA_UI_COLORS.intent.dangerPop,
  forecastMarker: MUCHA_UI_COLORS.accents.sage,
  scrubMarker: MUCHA_UI_COLORS.ink.secondary,
  scrubLiveMarker: MUCHA_UI_COLORS.accents.gold,
});

const ITEM_UNAVAILABLE_ZONE_ALPHA = Math.min(
  1,
  TIME_STATE_GRAPH_BG_ALPHA * 3.5
);
const FORECAST_PENDING_ZONE_ALPHA = Math.min(
  1,
  TIME_STATE_GRAPH_BG_ALPHA * 4.5
);
const FORECAST_REVEAL_MIN_RATE_SEC_PER_SEC = 480;
const FORECAST_REVEAL_TARGET_DURATION_SEC = 0.6;
const FORECAST_REVEAL_PLOT_THROTTLE_MS = 16;
const FORECAST_REVEAL_MARKER_ALPHA = 0.92;
const TIME_BOUNDS_ANIMATION_TARGET_DURATION_SEC = 0.22;
const TIME_BOUNDS_ANIMATION_MIN_RATE_SEC_PER_SEC = 480;
const TIME_BOUNDS_ANIMATION_MAX_RATE_SEC_PER_SEC = 9600;
const PLOT_SNAPSHOT_BOUNDS_QUANTUM_SEC = 32;
const PLOT_REFRESH_OVERSCAN_POINTS = 1;
const PROJECTION_REPLACEMENT_FLASH_ALPHA = 0.22;
const PROJECTION_REPLACEMENT_DIM_ALPHA = 0.07;
const PROJECTION_REPLACEMENT_FLASH_LINE_ALPHA = 0.88;
const PROJECTION_REPLACEMENT_DIM_LINE_ALPHA = 0.24;
const PROJECTION_REPLACEMENT_ANIMATION_FRAME_MS = 32;
const GRAPH_BOOT_FADE_FRAME_MS = 32;
const SERIES_SCALE_MAX_FLASH_DURATION_MS = 520;
const SERIES_SCALE_MAX_FLASH_FRAME_MS = 32;
const SERIES_SCALE_MAX_FLASH_COLOR = 0xffffff;
const SERIES_SCALE_MAX_FLASH_WIDTH_BONUS = 2.5;

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
  getSystemTargetModeLabel = null,
  onToggleSystemTargetMode = null,
  windowWidth = 1200,
  windowHeight = 176,
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
  let forecastRevealTargetDurationSecCur = forecastRevealTargetDurationSec;
  let forecastRevealMinRateSecPerSecCur = forecastRevealMinRateSecPerSec;
  let forecastRevealMaxRateSecPerSecCur = forecastRevealMaxRateSecPerSec;
  let forecastRevealStartDelayMsCur = forecastRevealStartDelayMs;
  let forecastRevealFollowGapSecCur = forecastRevealFollowGapSec;
  let forecastRevealFollowResponseSecCur = forecastRevealFollowResponseSec;
  let forecastRevealAccelerationSecPerSec2Cur =
    forecastRevealAccelerationSecPerSec2;
  let forecastRevealDecelerationSecPerSec2Cur =
    forecastRevealDecelerationSecPerSec2;
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
    if (Array.isArray(data?.series) && data.series.length) {
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

  function mergeStickySeriesScaleRanges(
    previousRanges,
    nextRanges,
    seriesList = []
  ) {
    if (!(previousRanges instanceof Map) || !(nextRanges instanceof Map)) {
      return nextRanges instanceof Map ? nextRanges : new Map();
    }
    const merged = new Map(nextRanges);
    for (const seriesDef of Array.isArray(seriesList) ? seriesList : []) {
      const seriesId = String(seriesDef?.id ?? "");
      if (!seriesId) continue;
      const previousRange = previousRanges.get(seriesId);
      const nextRange = merged.get(seriesId);
      if (!previousRange || !nextRange) continue;
      merged.set(seriesId, {
        ...nextRange,
        minValue: Number.isFinite(previousRange.minValue)
          ? previousRange.minValue
          : nextRange.minValue,
        maxValue:
          Number.isFinite(previousRange.maxValue) &&
          Number.isFinite(nextRange.maxValue)
            ? Math.max(previousRange.maxValue, nextRange.maxValue)
            : Number.isFinite(previousRange.maxValue)
              ? previousRange.maxValue
              : nextRange.maxValue,
      });
    }
    return merged;
  }

  function applyStickyScaleRangeSources(nextRanges, seriesList = [], sources = []) {
    let merged = nextRanges instanceof Map ? nextRanges : new Map();
    for (const source of Array.isArray(sources) ? sources : []) {
      if (!(source instanceof Map)) continue;
      merged = mergeStickySeriesScaleRanges(source, merged, seriesList);
    }
    return merged;
  }

  function getProjectionReplacementScaleRanges() {
    const ranges = projectionReplacement?.snapshot?.seriesScaleRanges;
    return ranges instanceof Map ? ranges : null;
  }

  function buildSeriesValuesForVisibleScaleRange(
    points,
    seriesValues,
    seriesList,
    visibleEndSec
  ) {
    const list = Array.isArray(seriesList) ? seriesList : [];
    const pointList = Array.isArray(points) ? points : [];
    const sourceValues =
      seriesValues instanceof Map ? seriesValues : new Map();
    const scaleEnd = Number.isFinite(visibleEndSec)
      ? Math.max(0, Number(visibleEndSec))
      : Number.POSITIVE_INFINITY;
    const out = new Map();

    for (const seriesDef of list) {
      const seriesId = String(seriesDef?.id ?? "");
      if (!seriesId) continue;
      const values = sourceValues.get(seriesId);
      const scaleValues = [];
      let previousT = null;
      let previousValue = null;

      for (let i = 0; i < pointList.length; i++) {
        const point = pointList[i];
        const t = Math.max(0, Math.floor(point?.tSec ?? 0));
        const value = Array.isArray(values) ? values[i] : null;

        if (!Number.isFinite(value)) {
          if (t <= scaleEnd) {
            previousT = null;
            previousValue = null;
          }
          continue;
        }

        if (t <= scaleEnd) {
          scaleValues.push(value);
          previousT = t;
          previousValue = value;
          continue;
        }

        if (
          Number.isFinite(previousT) &&
          Number.isFinite(previousValue) &&
          scaleEnd > previousT
        ) {
          const ratio = (scaleEnd - previousT) / Math.max(1e-6, t - previousT);
          scaleValues.push(previousValue + (value - previousValue) * ratio);
        }
        break;
      }

      out.set(seriesId, scaleValues);
    }

    return out;
  }

  function computeSeriesScaleRangesForReveal(
    seriesList,
    points,
    seriesValues,
    visibleEndSec
  ) {
    const scaleValues = freezeScaleMaxDuringRevealCur
      ? buildSeriesValuesForVisibleScaleRange(
          points,
          seriesValues,
          seriesList,
          visibleEndSec
        )
      : seriesValues;
    return computeGraphSeriesScaleRanges(seriesList, scaleValues, {
      defaultMin: 0,
      defaultMax: 100,
    });
  }

  function computeVisibleSeriesMaxValues(
    points,
    seriesValues,
    seriesList,
    visibleEndSec
  ) {
    const list = Array.isArray(seriesList) ? seriesList : [];
    const pointList = Array.isArray(points) ? points : [];
    const sourceValues =
      seriesValues instanceof Map ? seriesValues : new Map();
    const scaleEnd = Number.isFinite(visibleEndSec)
      ? Math.max(0, Number(visibleEndSec))
      : Number.POSITIVE_INFINITY;
    const out = new Map();

    for (const seriesDef of list) {
      const seriesId = String(seriesDef?.id ?? "");
      if (!seriesId) continue;
      const values = sourceValues.get(seriesId);
      let maxValue = -Infinity;
      let previousT = null;
      let previousValue = null;

      for (let i = 0; i < pointList.length; i++) {
        const point = pointList[i];
        const t = Math.max(0, Math.floor(point?.tSec ?? 0));
        const value = Array.isArray(values) ? values[i] : null;

        if (!Number.isFinite(value)) {
          if (t <= scaleEnd) {
            previousT = null;
            previousValue = null;
          }
          continue;
        }

        if (t <= scaleEnd) {
          maxValue = Math.max(maxValue, value);
          previousT = t;
          previousValue = value;
          continue;
        }

        if (
          Number.isFinite(previousT) &&
          Number.isFinite(previousValue) &&
          scaleEnd > previousT
        ) {
          const ratio = (scaleEnd - previousT) / Math.max(1e-6, t - previousT);
          const edgeValue = previousValue + (value - previousValue) * ratio;
          maxValue = Math.max(maxValue, edgeValue);
        }
        break;
      }

      out.set(seriesId, maxValue);
    }

    return out;
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
    const flash = seriesScaleMaxFlashBySeriesId.get(seriesId);
    if (!flash) return 0;
    const durationMs = Math.max(
      1,
      Number(flash.durationMs ?? SERIES_SCALE_MAX_FLASH_DURATION_MS)
    );
    const elapsedMs = Math.max(
      0,
      nowMs - Math.max(0, Number(flash.startedMs ?? nowMs))
    );
    if (elapsedMs >= durationMs) {
      seriesScaleMaxFlashBySeriesId.delete(seriesId);
      return 0;
    }
    const progress = clamp01(elapsedMs / durationMs);
    const pulse = 0.5 + 0.5 * Math.cos(progress * Math.PI * 2);
    return Math.max(0, (1 - progress) * (0.65 + 0.35 * pulse));
  }

  function getSeriesScaleMaxFlashRenderKey(nowMs = performance.now()) {
    const parts = [];
    for (const [seriesId, flash] of seriesScaleMaxFlashBySeriesId.entries()) {
      const durationMs = Math.max(
        1,
        Number(flash.durationMs ?? SERIES_SCALE_MAX_FLASH_DURATION_MS)
      );
      const elapsedMs = Math.max(
        0,
        nowMs - Math.max(0, Number(flash.startedMs ?? nowMs))
      );
      if (elapsedMs >= durationMs) {
        seriesScaleMaxFlashBySeriesId.delete(seriesId);
        continue;
      }
      parts.push(`${seriesId}:${Math.floor(elapsedMs / SERIES_SCALE_MAX_FLASH_FRAME_MS)}`);
    }
    return parts.join("|");
  }

  const root = new PIXI.Container();
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

  const body = new PIXI.Graphics();
  const plotG = new PIXI.Graphics();
  const scrubG = new PIXI.Graphics();
  const legendContainer = new PIXI.Container();
  const text = new PIXI.Text("", {
    fontFamily: "Arial",
    fontSize: 14,
    fill: TIMEGRAPH_THEME.textPrimary,
  });

  root.addChild(body, legendContainer, plotG, scrubG);

  const LEGEND_GUTTER_W = 46;
  const LEGEND_GUTTER_GAP = 4;
  const LEGEND_ICON_SIZE = 22;
  const LEGEND_ICON_GAP = 6;
  const LEGEND_ICON_TEXT_SIZE = 11;

  const plot = {
    x: 16 + LEGEND_GUTTER_W + LEGEND_GUTTER_GAP,
    y: HEADER_H + 12,
    w: WIN_W - (16 + LEGEND_GUTTER_W + LEGEND_GUTTER_GAP) - 16,
    h: WIN_H - HEADER_H - 26,
  };

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

  const ZOOM_BTN_W = 70;
  const ZOOM_BTN_H = 22;
  const TARGET_BTN_W = 110;
  const HEADER_LEFT_X = 16;
  const HEADER_CONTENT_GAP = 14;
  const hasTargetModeButton = typeof onToggleSystemTargetMode === "function";
  const HEADER_TEXT_X =
    HEADER_LEFT_X +
    ZOOM_BTN_W +
    HEADER_CONTENT_GAP +
    (hasTargetModeButton ? TARGET_BTN_W + HEADER_CONTENT_GAP : 0);
  const zoomBtn = new PIXI.Container();
  const zoomBg = new PIXI.Graphics();
  const zoomText = new PIXI.Text("", {
    fontFamily: "Arial",
    fontSize: 12,
    fill: TIMEGRAPH_THEME.textPrimary,
  });
  zoomBtn.addChild(zoomBg, zoomText);
  zoomBtn.eventMode = "static";
  zoomBtn.cursor = "pointer";
  root.addChild(zoomBtn);
  const targetBtn = new PIXI.Container();
  const targetBg = new PIXI.Graphics();
  const targetText = new PIXI.Text("", {
    fontFamily: "Arial",
    fontSize: 11,
    fill: TIMEGRAPH_THEME.textPrimary,
  });
  targetBtn.addChild(targetBg, targetText);
  targetBtn.eventMode = hasTargetModeButton ? "static" : "none";
  targetBtn.cursor = hasTargetModeButton ? "pointer" : "default";
  targetBtn.visible = hasTargetModeButton;
  root.addChild(targetBtn);
  root.addChild(text);

  let isScrubbing = false;
  let scrubSec = 0;
  let minSec = 0;
  let maxSec = 0;
  let zoomed = false;
  let lastPlotMs = 0;
  let lastPlotVersion = -1;
  let lastPlotBoundsKey = "";
  const PLOT_THROTTLE_MS = 80;
  const MAX_PLOT_POINTS = 150000;

  let lastRestoreMs = 0;
  const RESTORE_THROTTLE_MS = 33;
  let statusNote = "";
  const forecastPreviewStatusNote = commitForecastOnScrubRelease
    ? "Release to jump"
    : typeof forecastPreviewStatusNoteOverride === "string" &&
        forecastPreviewStatusNoteOverride.length > 0
      ? forecastPreviewStatusNoteOverride
      : "Preview only - click Commit to jump";
  let lastScrubSignature = "";
  let cachedActionSecs = [];
  let lastActionSecondsVersion = null;
  let lastActionRangeKey = "";
  let cachedMarkerActionSecs = [];
  let lastMarkerActionSecondsVersion = null;
  let lastMarkerRangeKey = "";
  let lastMarkerCap = 0;
  const ACTION_SNAP_THRESHOLD_SEC = 0.75;
  const MAX_ACTION_MARKERS_DENSITY = 2;
  const FORECAST_PREVIEW_MARKER_COLOR = TIMEGRAPH_THEME.forecastMarker;
  const SERIES_LINE_WIDTH_DEFAULT = 2;
  const SERIES_LINE_WIDTH_HOVERED = 3;
  const SERIES_LINE_WIDTH_DIMMED = 1.5;
  const SERIES_LINE_ALPHA_DEFAULT = 1;
  const SERIES_LINE_ALPHA_HOVERED = 1;
  const SERIES_LINE_ALPHA_DIMMED = 0.22;

  let legendSignature = "";
  let hoveredLegendSeriesId = null;
  const legendEntriesBySeriesId = new Map();
  const seriesScaleMaxFlashBySeriesId = new Map();
  let forecastRevealAnimatedEndSec = 0;
  let forecastRevealTargetEndSec = 0;
  let forecastRevealLastTickMs = 0;
  let forecastRevealHistoryEndSec = 0;
  let forecastRevealVisibleEndSec = 0;
  let forecastRevealDelayUntilMs = 0;
  let forecastRevealStartSecOverride = null;
  let forecastRevealVelocitySecPerSec = 0;
  let plotSnapshotKey = "";
  let plotSnapshot = null;
  let latchedForecastScrubSec = null;
  let animatedMinSec = null;
  let animatedMaxSec = null;
  let animatedBoundsLastTickMs = 0;
  let plotSnapshotTargetMaxSec = null;
  let stagedProjectionReplacement = null;
  let projectionReplacement = null;
  let bootFadeTransition = null;

  function clampInt(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v | 0));
  }

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
    const actual = Math.max(0, Math.floor(actualHistoryEndSec ?? 0));
    if (!Number.isFinite(forecastRevealStartSecOverride)) {
      return actual;
    }
    const override = Math.max(0, Math.floor(forecastRevealStartSecOverride));
    if (override !== actual) {
      forecastRevealStartSecOverride = null;
      return actual;
    }
    return override;
  }

  function getVisibleForecastCoverageEndSec(
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
      forecastRevealHistoryEndSec === displayHistoryEnd
        ? Math.max(
            displayHistoryEnd,
            Math.floor(forecastRevealVisibleEndSec ?? displayHistoryEnd)
          )
        : displayHistoryEnd;
    return Math.max(
      displayHistoryEnd,
      Math.min(actualForecastEnd, visibleForecastEnd)
    );
  }

  function getForecastRevealFollowTargetEndSec(
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
    const configuredGapSec = Math.max(
      0,
      Number(forecastRevealFollowGapSecCur ?? 0)
    );
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

  function getRenderedHistoryEndSec(
    displayHistoryEndSec,
    actualForecastCoverageEndSec,
    extra = null
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

  function setLatchedForecastScrub(sec) {
    latchedForecastScrubSec = Number.isFinite(sec)
      ? Math.max(0, Math.floor(sec))
      : null;
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
      isScrubbing !== true &&
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

  function clearLatchedForecastScrub() {
    latchedForecastScrubSec = null;
  }

  function resetForecastPreviewState() {
    isScrubbing = false;
    clearLatchedForecastScrub();
    if (
      statusNote === "Forecast loading" ||
      statusNote === "Forecast revealing" ||
      statusNote === forecastPreviewStatusNote ||
      statusNote === "Preview only - click Commit to jump"
    ) {
      statusNote = "";
    }
  }

  function syncLatchedForecastPreviewStatus() {
    const synced = reconcileLatchedForecastPreview({
      previewStatus:
        typeof getPreviewStatus === "function" ? getPreviewStatus() : null,
      statusNote,
      latchedForecastScrubSec,
    });
    latchedForecastScrubSec = synced.latchedForecastScrubSec;
    statusNote = synced.statusNote;
    if (!isScrubbing && Number.isFinite(synced.forecastPreviewSec)) {
      scrubSec = clampScrubSecToRevealCap(synced.forecastPreviewSec);
    }
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

  function getForecastRevealDesiredVelocitySecPerSec(
    targetEndSec,
    currentEndSec,
    historyEndSec
  ) {
    const historyEnd = Math.max(0, Math.floor(historyEndSec ?? 0));
    const currentEnd = Math.max(historyEnd, Number(currentEndSec ?? historyEnd));
    const targetEnd = Math.max(historyEnd, Math.floor(targetEndSec ?? historyEnd));
    const minRevealRateSecPerSec = Math.max(
      1,
      Number(
        forecastRevealMinRateSecPerSecCur ??
          FORECAST_REVEAL_MIN_RATE_SEC_PER_SEC
      )
    );
    const maxRevealRateSecPerSec = Math.max(
      minRevealRateSecPerSec,
      Number(
        forecastRevealMaxRateSecPerSecCur ?? Number.POSITIVE_INFINITY
      )
    );
    const remainingForecastSpanSec = Math.max(1, targetEnd - historyEnd);
    const targetRevealRateSecPerSec =
      remainingForecastSpanSec /
      Math.max(
        0.05,
        Number(
          forecastRevealTargetDurationSecCur ??
            FORECAST_REVEAL_TARGET_DURATION_SEC
        )
      );
    const followTargetEndSec = getForecastRevealFollowTargetEndSec(
      targetEnd,
      historyEnd,
      currentEnd
    );
    const followDistanceSec = Math.max(0, followTargetEndSec - currentEnd);
    const followResponseSec = Math.max(
      0.05,
      Number(forecastRevealFollowResponseSecCur ?? 0.9)
    );
    const adaptiveRevealRateSecPerSec =
      followDistanceSec / followResponseSec;
    let desiredVelocitySecPerSec =
      forecastRevealFollowGapSecCur > 0
        ? adaptiveRevealRateSecPerSec
        : Math.max(
            minRevealRateSecPerSec,
            Math.min(maxRevealRateSecPerSec, targetRevealRateSecPerSec)
          );
    if (forecastRevealFollowGapSecCur > 0) {
      const farFromFollowTarget =
        followDistanceSec >
        Math.max(6, Number(forecastRevealFollowGapSecCur ?? 0) * 0.25);
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

  function getForecastRevealEffectiveStartDelayMs(
    targetEndSec,
    animatedEndSec,
    historyEndSec
  ) {
    const configuredDelayMs = Math.max(
      0,
      Number(forecastRevealStartDelayMsCur ?? 0)
    );
    if (configuredDelayMs <= 0) return 0;
    const { followDistanceSec } = getForecastRevealDesiredVelocitySecPerSec(
      targetEndSec,
      animatedEndSec,
      historyEndSec
    );
    if (followDistanceSec >= Math.max(6, Number(forecastRevealFollowGapSecCur ?? 0) * 0.33)) {
      return 0;
    }
    return configuredDelayMs;
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
    if (isScrubbing || !Number.isFinite(latchedForecastScrubSec)) return;
    const tl = getTimeline?.();
    const historyEnd = Math.max(0, Math.floor(tl?.historyEndSec ?? 0));
    if (latchedForecastScrubSec <= historyEnd) {
      clearLatchedForecastScrub();
      return;
    }
    if (latchedForecastScrubSec > getVisibleForecastScrubCapSec()) {
      return;
    }
    const restored = controller.getStateAt?.(latchedForecastScrubSec);
    if (!restored) return;
    setPreviewState?.(restored);
    scrubSec = clampScrubSecToRevealCap(latchedForecastScrubSec);
    statusNote = forecastPreviewStatusNote;
  }

  function resetForecastReveal(animatedEndSec, targetEndSec, historyEndSec, nowMs) {
    const historyEnd = Math.max(0, Math.floor(historyEndSec ?? 0));
    const animatedEnd = Math.max(
      historyEnd,
      Math.floor(animatedEndSec ?? historyEnd)
    );
    const targetEnd = Math.max(
      animatedEnd,
      Math.floor(targetEndSec ?? animatedEnd)
    );
    forecastRevealAnimatedEndSec = animatedEnd;
    forecastRevealTargetEndSec = targetEnd;
    forecastRevealLastTickMs = nowMs;
    forecastRevealHistoryEndSec = historyEnd;
    forecastRevealVisibleEndSec = animatedEnd;
    const initialVelocity = getForecastRevealDesiredVelocitySecPerSec(
      targetEnd,
      animatedEnd,
      historyEnd
    ).desiredVelocitySecPerSec;
    forecastRevealVelocitySecPerSec =
      initialVelocity > 0
        ? Math.max(0, Math.min(initialVelocity, Number(initialVelocity)))
        : 0;
    forecastRevealDelayUntilMs =
      nowMs +
      getForecastRevealEffectiveStartDelayMs(
        targetEnd,
        animatedEnd,
        historyEnd
      );
    invalidatePlotSnapshot();
  }

  function restartForecastRevealFrom(startSec, opts = {}) {
    const tl = getTimeline?.();
    const data = controller.getData?.() ?? {};
    const actualHistoryEndSec = Math.max(0, Math.floor(tl?.historyEndSec ?? 0));
    const displayHistoryEndSec = getDisplayHistoryEndSec(actualHistoryEndSec);
    const actualForecastCoverageEndSec = Math.max(
      actualHistoryEndSec,
      Math.floor(data?.forecastCoverageEndSec ?? actualHistoryEndSec)
    );
    const maxRestartSec =
      opts?.allowForecastStart === true
        ? Math.max(actualForecastCoverageEndSec, Math.floor(startSec ?? actualHistoryEndSec))
        : actualHistoryEndSec;
    const normalizedStartSec = Math.max(
      0,
      Math.min(Math.floor(startSec ?? actualHistoryEndSec), maxRestartSec)
    );
    forecastRevealStartSecOverride =
      normalizedStartSec <= actualForecastCoverageEndSec ? normalizedStartSec : null;
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
    resetForecastReveal(
      Math.max(displayHistoryEndSec, normalizedStartSec),
      actualForecastCoverageEndSec,
      displayHistoryEndSec,
      nowMs
    );
    const extraStartDelayMs = Math.max(
      0,
      Number(opts?.extraStartDelayMs ?? 0)
    );
    if (extraStartDelayMs > 0) {
      forecastRevealDelayUntilMs = Math.max(
        forecastRevealDelayUntilMs,
        nowMs + extraStartDelayMs
      );
    }
    lastPlotVersion = -1;
    lastPlotBoundsKey = "";
    invalidatePlotSnapshot();
  }

  function clearForecastRevealRestart() {
    stagedProjectionReplacement = null;
    if (!Number.isFinite(forecastRevealStartSecOverride)) return;
    forecastRevealStartSecOverride = null;
    invalidatePlotSnapshot();
    lastPlotVersion = -1;
    lastPlotBoundsKey = "";
  }

  function getAnimatedForecastCoverageEndSec(nowMs, historyEndSec) {
    const historyEnd = Math.max(0, Math.floor(historyEndSec ?? 0));
    forecastRevealHistoryEndSec = historyEnd;
    const targetEnd = Math.max(
      historyEnd,
      Math.floor(forecastRevealTargetEndSec ?? historyEnd)
    );
    const currentEnd = Math.max(
      historyEnd,
      Number(forecastRevealAnimatedEndSec ?? historyEnd)
    );
    if (targetEnd <= currentEnd) {
      forecastRevealAnimatedEndSec = targetEnd;
      forecastRevealLastTickMs = nowMs;
      forecastRevealVisibleEndSec = targetEnd;
      forecastRevealVelocitySecPerSec = 0;
      if (nowMs >= forecastRevealDelayUntilMs) {
        forecastRevealDelayUntilMs = 0;
      }
      return targetEnd;
    }
    const effectiveStartMs = Math.max(
      forecastRevealLastTickMs,
      forecastRevealDelayUntilMs
    );
    const elapsedMs = Math.max(0, nowMs - effectiveStartMs);
    forecastRevealLastTickMs = nowMs;
    if (elapsedMs <= 0) return currentEnd;
    forecastRevealDelayUntilMs = 0;
    const elapsedSec = elapsedMs / 1000;
    const {
      desiredVelocitySecPerSec: targetVelocitySecPerSec,
      followTargetEndSec,
      maxRevealRateSecPerSec,
    } = getForecastRevealDesiredVelocitySecPerSec(
      targetEnd,
      currentEnd,
      historyEnd
    );
    const accelLimitSecPerSec = Math.max(
      1,
      Number(forecastRevealAccelerationSecPerSec2Cur ?? 220)
    );
    const decelLimitSecPerSec = Math.max(
      1,
      Number(forecastRevealDecelerationSecPerSec2Cur ?? 320)
    );
    const velocityDeltaSecPerSec =
      targetVelocitySecPerSec - forecastRevealVelocitySecPerSec;
    const maxVelocityStepSecPerSec =
      velocityDeltaSecPerSec >= 0
        ? accelLimitSecPerSec * elapsedSec
        : decelLimitSecPerSec * elapsedSec;
    const clampedVelocityDeltaSecPerSec = Math.max(
      -maxVelocityStepSecPerSec,
      Math.min(maxVelocityStepSecPerSec, velocityDeltaSecPerSec)
    );
    forecastRevealVelocitySecPerSec = Math.max(
      0,
      Math.min(
        maxRevealRateSecPerSec,
        forecastRevealVelocitySecPerSec + clampedVelocityDeltaSecPerSec
      )
    );
    const revealDeltaSec = elapsedSec * forecastRevealVelocitySecPerSec;
    const maxVisibleEndSec =
      forecastRevealFollowGapSecCur > 0 ? followTargetEndSec : targetEnd;
    const animatedEnd = Math.min(maxVisibleEndSec, currentEnd + revealDeltaSec);
    forecastRevealAnimatedEndSec = Math.max(historyEnd, animatedEnd);
    forecastRevealVisibleEndSec = forecastRevealAnimatedEndSec;
    return forecastRevealAnimatedEndSec;
  }

  function syncForecastRevealTarget(actualCoverageEndSec, historyEndSec, nowMs) {
    const historyEnd = Math.max(0, Math.floor(historyEndSec ?? 0));
    const previousHistoryEnd = Math.max(
      0,
      Math.floor(forecastRevealHistoryEndSec ?? 0)
    );
    const actualEnd = Math.max(
      historyEnd,
      Math.floor(actualCoverageEndSec ?? historyEnd)
    );
    const targetEnd = Math.max(
      historyEnd,
      Math.floor(forecastRevealTargetEndSec ?? historyEnd)
    );
    const hasRevealState =
      Number.isFinite(forecastRevealTargetEndSec) &&
      Number.isFinite(forecastRevealAnimatedEndSec);

    if (
      !hasRevealState ||
      historyEnd < previousHistoryEnd ||
      actualEnd < targetEnd ||
      actualEnd < forecastRevealAnimatedEndSec
    ) {
      resetForecastReveal(historyEnd, actualEnd, historyEnd, nowMs);
      return forecastRevealAnimatedEndSec;
    }

    if (historyEnd !== previousHistoryEnd) {
      const clampedAnimatedEnd = Math.max(
        historyEnd,
        Number(forecastRevealAnimatedEndSec ?? historyEnd)
      );
      forecastRevealAnimatedEndSec = clampedAnimatedEnd;
      forecastRevealVisibleEndSec = clampedAnimatedEnd;
      forecastRevealTargetEndSec = Math.max(actualEnd, clampedAnimatedEnd);
      forecastRevealHistoryEndSec = historyEnd;
    }

    if (actualEnd > targetEnd) {
      forecastRevealTargetEndSec = actualEnd;
      forecastRevealHistoryEndSec = historyEnd;
      return forecastRevealAnimatedEndSec;
    }

    return forecastRevealAnimatedEndSec;
  }

  function getGridStep(rangeSec, targetLines = 12) {
    const range = Math.max(1, Math.floor(rangeSec));
    const rough = range / Math.max(1, targetLines);
    const pow10 = Math.pow(10, Math.floor(Math.log10(rough)));
    const candidates = [1, 2, 5, 10];
    let step = candidates[candidates.length - 1] * pow10;
    for (const c of candidates) {
      const s = c * pow10;
      if (s >= rough) {
        step = s;
        break;
      }
    }
    return Math.max(1, Math.round(step));
  }

  function timeToX(t) {
    const ratio = (t - minSec) / Math.max(1, maxSec - minSec);
    return plot.x + ratio * plot.w;
  }

  function updateScrubFromPointer(globalPoint) {
    const local =
      globalPoint && typeof root.toLocal === "function"
        ? root.toLocal(globalPoint)
        : { x: Number(globalPoint?.x ?? globalPoint) || 0, y: 0 };
    const localX = Number(local?.x) || 0;
    const ratio = (localX - plot.x) / Math.max(1, plot.w);
    const t = minSec + ratio * (maxSec - minSec);
    scrubSec = clampScrubSecToRevealCap(Math.round(applyActionSnap(t)));
  }

  function applyActionSnap(t) {
    const list = getActionSecs(minSec, maxSec);
    if (!list.length) return t;

    let lo = 0;
    let hi = list.length - 1;
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      const val = list[mid];
      if (val < t) lo = mid + 1;
      else if (val > t) hi = mid - 1;
      else return val;
    }

    const candidates = [];
    if (lo >= 0 && lo < list.length) candidates.push(list[lo]);
    if (hi >= 0 && hi < list.length) candidates.push(list[hi]);

    let best = t;
    let bestDist = Infinity;
    for (const c of candidates) {
      const dist = Math.abs(c - t);
      if (dist < bestDist) {
        bestDist = dist;
        best = c;
      }
    }

    return bestDist <= ACTION_SNAP_THRESHOLD_SEC ? best : t;
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
    const list = Array.isArray(actionSecs) ? actionSecs : [];
    if (!list.length) return [];
    const maxMarkers = Math.max(
      64,
      Math.floor(plot.w * MAX_ACTION_MARKERS_DENSITY)
    );
    if (list.length <= maxMarkers) return list;

    const stride = Math.max(1, Math.ceil(list.length / maxMarkers));
    const sampled = [];
    for (let i = 0; i < list.length; i += stride) {
      sampled.push(list[i]);
    }
    const last = list[list.length - 1];
    if (sampled[sampled.length - 1] !== last) {
      sampled.push(last);
    }
    return sampled;
  }

  function makeLegendSignature(seriesList) {
    if (!Array.isArray(seriesList) || !seriesList.length) return "";
    return seriesList
      .map((s) => {
        const id = String(s?.id ?? "");
        const color = Number.isFinite(s?.color) ? s.color : "";
        const icon = String(s?.legendIcon ?? "");
        const label = String(s?.legendLabel ?? s?.label ?? "");
        return `${id}:${color}:${icon}:${label}`;
      })
      .join("|");
  }

  function toLegendIconText(rawText) {
    const text = String(rawText ?? "").trim();
    if (!text) return "?";
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length >= 2) {
      return (words[0][0] + words[1][0]).toUpperCase().slice(0, 2);
    }
    return text.slice(0, 2).toUpperCase();
  }

  function getSeriesLegendTitle(seriesDef) {
    const label = String(seriesDef?.legendLabel ?? "").trim();
    if (label) return label;
    const fallback = String(seriesDef?.label ?? seriesDef?.id ?? "").trim();
    return fallback || "Series";
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
    const hasHovered =
      typeof hoveredLegendSeriesId === "string" && hoveredLegendSeriesId.length > 0;
    for (const [seriesId, entry] of legendEntriesBySeriesId.entries()) {
      const isHovered = hasHovered && seriesId === hoveredLegendSeriesId;
      const lineColor = Number.isFinite(entry?.lineColor)
        ? entry.lineColor
        : MUCHA_UI_COLORS.accents.gold;
      const baseAlpha = hasHovered && !isHovered ? 0.35 : 0.95;
      entry.bg.clear();
      entry.bg
        .lineStyle(
          isHovered ? 2 : 1,
          isHovered ? TIMEGRAPH_THEME.legendStrokeHover : TIMEGRAPH_THEME.legendStroke,
          isHovered ? 0.95 : 0.85
        )
        .beginFill(lineColor, baseAlpha)
        .drawCircle(LEGEND_ICON_SIZE / 2, LEGEND_ICON_SIZE / 2, LEGEND_ICON_SIZE / 2)
        .endFill();
      entry.container.alpha = hasHovered && !isHovered ? 0.65 : 1;
    }
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

  function clearLegendEntries() {
    legendContainer.removeChildren();
    legendEntriesBySeriesId.clear();
    legendSignature = "";
    clearLegendHoverSeries();
  }

  function drawLegend(seriesList) {
    const list = Array.isArray(seriesList) ? seriesList : [];
    const nextSignature = makeLegendSignature(list);
    if (nextSignature !== legendSignature) {
      legendContainer.removeChildren();
      legendEntriesBySeriesId.clear();
      legendSignature = nextSignature;
      if (
        hoveredLegendSeriesId &&
        !list.some((s) => String(s?.id ?? "") === hoveredLegendSeriesId)
      ) {
        hoveredLegendSeriesId = null;
      }

      for (const s of list) {
        const seriesId = String(s?.id ?? "");
        if (!seriesId) continue;
        const lineColor = Number.isFinite(s?.color)
          ? s.color
          : MUCHA_UI_COLORS.accents.gold;
        const iconTextValue = toLegendIconText(
          String(s?.legendIcon ?? s?.legendLabel ?? s?.label ?? seriesId)
        );

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
        });
        entryContainer.on("pointertap", (event) => {
          event?.stopPropagation?.();
        });
        entryContainer.on("pointerover", () => {
          setLegendHoverSeries(seriesId);
          if (!tooltipView) return;
          if (interaction && interaction?.canShowHoverUI?.() === false) return;
          const spec = {
            ...buildLegendTooltipSpec(s),
            scale: Math.max(
              Number.isFinite(GAMEPIECE_HOVER_SCALE) ? GAMEPIECE_HOVER_SCALE : 1,
              tooltipView?.getRelativeDisplayScale?.(entryContainer, 1) ??
                getDisplayObjectWorldScale(entryContainer, 1)
            ),
          };
          tooltipView.show(spec, entryContainer.getBounds());
        });
        entryContainer.on("pointerout", () => {
          setLegendHoverSeries(null);
          tooltipView?.hide?.();
        });

        const bg = new PIXI.Graphics();
        const iconText = new PIXI.Text(iconTextValue, {
          fill: TIMEGRAPH_THEME.textPrimary,
          fontSize: LEGEND_ICON_TEXT_SIZE,
          fontWeight: "bold",
        });
        applyTextResolution(iconText, 1.5);
        iconText.anchor.set(0.5);
        iconText.x = LEGEND_ICON_SIZE / 2;
        iconText.y = LEGEND_ICON_SIZE / 2;
        entryContainer.addChild(bg, iconText);
        legendContainer.addChild(entryContainer);

        legendEntriesBySeriesId.set(seriesId, {
          container: entryContainer,
          bg,
          lineColor,
        });
      }
    }

    const entries = Array.from(legendEntriesBySeriesId.values());
    const totalHeight = entries.length
      ? entries.length * LEGEND_ICON_SIZE + (entries.length - 1) * LEGEND_ICON_GAP
      : 0;
    const startY = plot.y + Math.max(0, Math.floor((plot.h - totalHeight) / 2));
    let y = startY;
    const x = 16 + Math.floor((LEGEND_GUTTER_W - LEGEND_ICON_SIZE) / 2);
    for (const entry of entries) {
      entry.container.x = x;
      entry.container.y = y;
      y += LEGEND_ICON_SIZE + LEGEND_ICON_GAP;
    }
    refreshLegendStyles();
  }

  function updateHeaderButtons() {
    const zoomX = HEADER_LEFT_X;
    const y = Math.floor((HEADER_H - ZOOM_BTN_H) / 2);

    zoomBg.clear();
    zoomBg.lineStyle(1, TIMEGRAPH_THEME.panelBorder, 0.92);
    zoomBg.beginFill(
      zoomed ? TIMEGRAPH_THEME.buttonBgActive : TIMEGRAPH_THEME.buttonBg
    );
    zoomBg.drawRoundedRect(0, 0, ZOOM_BTN_W, ZOOM_BTN_H, 6);
    zoomBg.endFill();

    zoomText.text = zoomed ? "Full" : "Focus";
    zoomText.x = (ZOOM_BTN_W - zoomText.width) / 2;
    zoomText.y = (ZOOM_BTN_H - zoomText.height) / 2;

    zoomBtn.x = zoomX;
    zoomBtn.y = y;

    if (hasTargetModeButton) {
      const targetX = zoomX + ZOOM_BTN_W + HEADER_CONTENT_GAP;
      targetBg.clear();
      targetBg.lineStyle(1, TIMEGRAPH_THEME.panelBorder, 0.92);
      targetBg.beginFill(TIMEGRAPH_THEME.buttonBg, 1);
      targetBg.drawRoundedRect(0, 0, TARGET_BTN_W, ZOOM_BTN_H, 6);
      targetBg.endFill();
      const labelRaw =
        typeof getSystemTargetModeLabel === "function"
          ? getSystemTargetModeLabel()
          : "Target";
      targetText.text = String(labelRaw || "Target");
      targetText.x = Math.floor((TARGET_BTN_W - targetText.width) / 2);
      targetText.y = Math.floor((ZOOM_BTN_H - targetText.height) / 2);
      targetBtn.x = targetX;
      targetBtn.y = y;
    }
    text.x = HEADER_TEXT_X;
    text.y = 10;
  }

  function drawWindow() {
    headerUi.setWidth(WIN_W);

    body.clear();
    body.lineStyle(1, TIMEGRAPH_THEME.panelBorder, 0.72);
    body.beginFill(TIMEGRAPH_THEME.panelBodyBg, 0.92);
    body.drawRoundedRect(0, HEADER_H, WIN_W, WIN_H - HEADER_H, 14);
    body.endFill();

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
              latchedForecastScrubSec,
            });
      if (!isScrubbing || customWindowSpec.forceScrubToCursor === true) {
        scrubSec = clampScrubSecToRevealCap(preferredScrub);
      } else {
        scrubSec = clampScrubSecToRevealCap(scrubSec);
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

    if (!isScrubbing) {
      const defaultScrubSec = resolveDefaultGraphScrubSec({
        currentSec: currentT,
        forecastPreviewSec,
        latchedForecastScrubSec,
      });
      scrubSec = clampScrubSecToRevealCap(defaultScrubSec);
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
        forecastRevealHistoryEndSec === displayHistoryEndSec
          ? Number(forecastRevealVisibleEndSec ?? displayHistoryEndSec)
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

    function yForValue(v, seriesId) {
      const scaleRange = seriesScaleRanges.get(seriesId) ?? null;
      const minValue = Number.isFinite(scaleRange?.minValue)
        ? scaleRange.minValue
        : 0;
      const maxValue = Number.isFinite(scaleRange?.maxValue)
        ? scaleRange.maxValue
        : 100;
      const tRaw = (v - minValue) / Math.max(1e-6, maxValue - minValue);
      const t = Math.max(0, Math.min(1, tRaw));
      // Keep min/max-aligned series inside the plot rect so long zero plateaus
      // do not disappear into the panel border during forecast reveal.
      const drawableHeight = Math.max(1, plot.h - 2);
      return plot.y + 1 + (1 - t) * drawableHeight;
    }

    function drawZone(startSec, endSec, color, alpha = TIME_STATE_GRAPH_BG_ALPHA) {
      const start = Math.max(minSec, Math.min(maxSec, startSec));
      const end = Math.max(minSec, Math.min(maxSec, endSec));
      if (!(end > start)) return;
      const x0 = timeToX(start);
      const x1 = timeToX(end);
      const left = Math.max(plot.x, Math.min(x0, x1));
      const right = Math.min(plot.x + plot.w, Math.max(x0, x1));
      if (!(right > left)) return;
      plotG.beginFill(color, alpha);
      plotG.drawRect(left, plot.y, right - left, plot.h);
      plotG.endFill();
    }

    function drawSeriesLinesForRange({
      sourceSeriesList,
      sourcePoints,
      sourceSeriesValues,
      drawStartSec = minSec,
      drawEndSec = maxSec,
      colorResolver = null,
      alphaMultiplier = 1,
      enableScaleMaxFlash = false,
    } = {}) {
      const list = Array.isArray(sourceSeriesList) ? sourceSeriesList : [];
      const points = Array.isArray(sourcePoints) ? sourcePoints : [];
      if (!list.length || !points.length) return;
      const clampedDrawStartSec = Math.max(
        minSec,
        Math.floor(drawStartSec ?? minSec)
      );
      const clampedDrawEndSec = Math.max(
        clampedDrawStartSec,
        Math.min(maxSec, Math.floor(drawEndSec ?? maxSec))
      );
      if (clampedDrawEndSec <= clampedDrawStartSec) return;

      const hasHoveredSeries =
        typeof hoveredLegendSeriesId === "string" &&
        hoveredLegendSeriesId.length > 0;

      for (const s of list) {
        const baseLineColor = Number.isFinite(s?.color)
          ? s.color
          : MUCHA_UI_COLORS.accents.gold;
        const isHovered = hasHoveredSeries && s.id === hoveredLegendSeriesId;
        const lineWidth = hasHoveredSeries
          ? isHovered
            ? SERIES_LINE_WIDTH_HOVERED
            : SERIES_LINE_WIDTH_DIMMED
          : SERIES_LINE_WIDTH_DEFAULT;
        const baseAlpha = hasHoveredSeries
          ? isHovered
            ? SERIES_LINE_ALPHA_HOVERED
            : SERIES_LINE_ALPHA_DIMMED
          : SERIES_LINE_ALPHA_DEFAULT;
        const resolvedLineColor =
          typeof colorResolver === "function"
            ? colorResolver(baseLineColor, s)
            : baseLineColor;
        const flashStrength =
          enableScaleMaxFlash === true
            ? getSeriesScaleMaxFlashStrength(s.id, plotNowMs)
            : 0;
        const lineColor =
          flashStrength > 0
            ? blendColor(
                resolvedLineColor,
                SERIES_SCALE_MAX_FLASH_COLOR,
                Math.min(0.82, flashStrength)
              )
            : resolvedLineColor;
        const flashLineWidth =
          flashStrength > 0
            ? lineWidth + SERIES_SCALE_MAX_FLASH_WIDTH_BONUS * flashStrength
            : lineWidth;
        const resolvedLineAlpha = Math.max(
          0,
          Math.min(
            1,
            baseAlpha * Math.max(0, Number(alphaMultiplier ?? 1)) +
              flashStrength * 0.18
          )
        );
        plotG.lineStyle(flashLineWidth, lineColor, resolvedLineAlpha);

        const values = sourceSeriesValues?.get?.(s.id) ?? [];
        let first = true;
        let prevFinitePoint = null;

        for (let i = 0; i < points.length; i++) {
          const p = points[i];
          const t = Math.max(0, Math.floor(p?.tSec ?? 0));
          const value = values[i];
          if (!Number.isFinite(value)) {
            first = true;
            prevFinitePoint = null;
            continue;
          }

          if (t < clampedDrawStartSec) {
            prevFinitePoint = { t, value };
            continue;
          }

          if (first && prevFinitePoint && prevFinitePoint.t < clampedDrawStartSec) {
            const ratio =
              (clampedDrawStartSec - prevFinitePoint.t) /
              Math.max(1e-6, t - prevFinitePoint.t);
            const interpolatedValue =
              prevFinitePoint.value +
              (value - prevFinitePoint.value) * ratio;
            plotG.moveTo(
              timeToX(clampedDrawStartSec),
              yForValue(interpolatedValue, s.id)
            );
            plotG.lineTo(timeToX(t), yForValue(value, s.id));
            first = false;
            prevFinitePoint = { t, value };
            if (t >= clampedDrawEndSec) break;
            continue;
          }

          if (t > clampedDrawEndSec) {
            if (
              prevFinitePoint &&
              Number.isFinite(prevFinitePoint.t) &&
              prevFinitePoint.t < clampedDrawEndSec
            ) {
              const ratio =
                (clampedDrawEndSec - prevFinitePoint.t) /
                Math.max(1e-6, t - prevFinitePoint.t);
              const interpolatedValue =
                prevFinitePoint.value +
                (value - prevFinitePoint.value) * ratio;
              const x = timeToX(clampedDrawEndSec);
              const y = yForValue(interpolatedValue, s.id);
              if (first) {
                plotG.moveTo(x, y);
              } else {
                plotG.lineTo(x, y);
              }
            } else if (!first) {
              plotG.lineTo(
                timeToX(clampedDrawEndSec),
                yForValue(prevFinitePoint?.value ?? value, s.id)
              );
            }
            first = true;
            break;
          }

          const x = timeToX(t);
          const y = yForValue(value, s.id);
          if (first) {
            plotG.moveTo(x, y);
            first = false;
          } else {
            plotG.lineTo(x, y);
          }
          prevFinitePoint = { t, value };
        }

        if (
          !first &&
          prevFinitePoint &&
          Number.isFinite(prevFinitePoint.t) &&
          prevFinitePoint.t < clampedDrawEndSec
        ) {
          plotG.lineTo(
            timeToX(clampedDrawEndSec),
            yForValue(prevFinitePoint.value, s.id)
          );
        }
      }
    }
    const historyZones = Array.isArray(snapshot?.historyZones)
      ? snapshot.historyZones
      : [];
    const itemUnavailableZones = Array.isArray(snapshot?.itemUnavailableZones)
      ? snapshot.itemUnavailableZones
      : [];
    for (const zone of historyZones) {
      if (zone.kind === "fixedHistory") {
        drawZone(zone.startSec, zone.endSec, TIME_STATE_COLORS.fixedHistory);
        continue;
      }
      if (zone.kind === "editableHistory") {
        drawZone(zone.startSec, zone.endSec, TIME_STATE_COLORS.editableHistory);
      }
    }
    drawZone(renderedHistoryEndSec, maxSec, TIME_STATE_COLORS.forecast);
    if (lineDrawEndSec < maxSec) {
      drawZone(
        lineDrawEndSec,
        maxSec,
        TIMEGRAPH_THEME.panelBorder,
        FORECAST_PENDING_ZONE_ALPHA
      );
    }
    for (const zone of itemUnavailableZones) {
      drawZone(
        zone.startSec,
        zone.endSec,
        TIME_STATE_COLORS.itemUnavailable,
        ITEM_UNAVAILABLE_ZONE_ALPHA
      );
    }

    // Grid
    plotG.lineStyle(1, TIMEGRAPH_THEME.gridMajor, 0.5);
    plotG.drawRect(plot.x, plot.y, plot.w, plot.h);
    plotG.lineStyle(1, TIMEGRAPH_THEME.gridMinor, 0.2);
    const gridStep = getGridStep(maxSec - minSec, 12);
    const startGrid =
      Math.ceil(minSec / gridStep) * gridStep;
    for (let t = startGrid; t <= maxSec; t += gridStep) {
      const x = timeToX(t);
      if (x > plot.x && x < plot.x + plot.w) {
        plotG.moveTo(x, plot.y);
        plotG.lineTo(x, plot.y + plot.h);
      }
    }

    const projectionReplacementState = buildProjectionReplacementRenderState(
      performance.now(),
      lineDrawEndSec
    );
    if (projectionReplacementState) {
      drawZone(
        projectionReplacementState.drawStartSec,
        projectionReplacementState.drawEndSec,
        projectionReplacementState.zoneColor,
        projectionReplacementState.zoneAlpha
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

    if (lineDrawEndSec < maxSec) {
      const markerX = timeToX(lineDrawEndSec);
      plotG.lineStyle(
        2,
        TIMEGRAPH_THEME.forecastMarker,
        FORECAST_REVEAL_MARKER_ALPHA
      );
      plotG.moveTo(markerX, plot.y + 1);
      plotG.lineTo(markerX, plot.y + plot.h - 1);
      plotG.beginFill(TIMEGRAPH_THEME.forecastMarker, 0.98);
      plotG.drawCircle(markerX, plot.y + 7, 4);
      plotG.endFill();
      plotG.beginFill(TIMEGRAPH_THEME.forecastMarker, 0.42);
      plotG.drawRect(markerX, plot.y, 2, plot.h);
      plotG.endFill();
    }

    // Markers (actions)
    const markerSecs = Array.isArray(snapshot?.markerSecs)
      ? snapshot.markerSecs
      : [];
    if (markerSecs.length) {
      plotG.beginFill(TIMEGRAPH_THEME.actionMarker);
      plotG.lineStyle(0);
      for (const t of markerSecs) {
        if (t >= minSec && t <= maxSec) {
          const x = timeToX(t);
          plotG.drawCircle(x, plot.y + plot.h - 3, 3);
        }
      }
      plotG.endFill();
    }

    const eventMarkers = Array.isArray(snapshot?.eventMarkers)
      ? snapshot.eventMarkers
      : [];
    for (const marker of eventMarkers) {
      const x = timeToX(marker.tSec);
      const color = Number.isFinite(marker?.color)
        ? marker.color
        : marker.severity === "critical"
          ? TIMEGRAPH_THEME.eventMarkerCritical
          : TIMEGRAPH_THEME.eventMarkerNormal;
      const lineAlpha = Number.isFinite(marker?.alpha)
        ? marker.alpha
        : marker.severity === "critical"
          ? 0.72
          : 0.9;
      const markerRadius = Number.isFinite(marker?.radius)
        ? marker.radius
        : marker.severity === "critical"
          ? 4
          : 2.5;
      const markerLineWidth = Number.isFinite(marker?.lineWidth)
        ? marker.lineWidth
        : 1;
      if (marker.severity === "critical") {
        plotG.lineStyle(markerLineWidth, color, lineAlpha);
        plotG.moveTo(x, plot.y + 1);
        plotG.lineTo(x, plot.y + plot.h - 1);
        plotG.beginFill(color, Math.max(0.3, lineAlpha));
        plotG.drawCircle(x, plot.y + 7, markerRadius);
        plotG.endFill();
        continue;
      }
      plotG.beginFill(color, lineAlpha);
      plotG.drawCircle(x, plot.y + 8, markerRadius);
      plotG.endFill();
    }

    const bootFadeState = getBootFadeRenderState(performance.now());
    if (bootFadeState) {
      plotG.beginFill(bootFadeState.color, bootFadeState.alpha);
      plotG.drawRect(plot.x, plot.y, plot.w, plot.h);
      plotG.endFill();
    }

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
      `${isScrubbing ? 1 : 0}|${scrubSec}|${curT}|${historyEnd}|` +
      `${minSec}:${maxSec}|${statusNote}|${metricLabel}|${hasForecastPreview ? forecastPreviewSec : -1}`;
    if (signature === lastScrubSignature) return;
    lastScrubSignature = signature;

    scrubG.clear();

    const x = timeToX(scrubSec);

    const color = isScrubbing
      ? TIMEGRAPH_THEME.textPrimary
      : hasForecastPreview
        ? FORECAST_PREVIEW_MARKER_COLOR
        : TIMEGRAPH_THEME.scrubMarker;
    scrubG.lineStyle(1, color, 0.8);
    scrubG.moveTo(x, plot.y);
    scrubG.lineTo(x, plot.y + plot.h);

    if (isScrubbing && Math.abs(scrubSec - curT) > 0) {
      const cx = timeToX(curT);
      if (cx >= plot.x && cx <= plot.x + plot.w) {
        scrubG.lineStyle(1, TIMEGRAPH_THEME.scrubLiveMarker, 0.5);
        scrubG.moveTo(cx, plot.y);
        scrubG.lineTo(cx, plot.y + plot.h);
      }
    }

    const zone = scrubSec <= historyEnd ? "History" : "Forecast";
    const note = statusNote ? ` • ${statusNote}` : "";

    text.text = `${metricLabel} • Time: ${scrubSec}s (${zone}) • Live: ${curT}s${note}`;
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

    if (scrubSec > historyEnd && scrubSec > visibleForecastCapSec) {
      statusNote = "Forecast revealing";
      clearPreviewState?.();
      drawScrub();
      return;
    }

    const restored = controller.getStateAt(scrubSec);
    if (restored) {
      if (
        statusNote === "Forecast loading" ||
        statusNote === "Forecast revealing"
      ) {
        statusNote = "";
      }
      if (scrubSec > historyEnd) {
        setLatchedForecastScrub(scrubSec);
      } else {
        clearLatchedForecastScrub();
      }
      setPreviewState?.(restored);
    } else {
      if (scrubSec > historyEnd) {
        statusNote = "Forecast loading";
        setLatchedForecastScrub(scrubSec);
        clearPreviewState?.();
      }
    }
    drawScrub();
  }

  function endScrub(commit) {
    if (!isScrubbing) return;
    isScrubbing = false;
    const tl = getTimeline?.();
    const historyEnd = Math.floor(tl?.historyEndSec ?? 0);
    const visibleForecastCapSec = getVisibleForecastScrubCapSec();
    const isForecast = scrubSec > historyEnd;

    if (commit && !isForecast) {
      clearLatchedForecastScrub();
      if (commitHistoryOnScrubRelease && typeof commitPolicyResolver === "function") {
        const decision = commitPolicyResolver({
          scrubSec,
          historyEndSec: historyEnd,
          editableBounds: getEditableHistoryBounds?.(),
        });
        const blocked =
          decision === false ||
          (decision && typeof decision === "object" && decision.allow === false);
        if (blocked) {
          statusNote =
            (decision && typeof decision === "object" && decision.reason) ||
            "Read-only";
          drawScrub();
          return;
        }
      }
      clearPreviewState?.();
      const stateData = controller?.getStateDataAt?.(scrubSec);
      const res = commitSecond?.(scrubSec, stateData);
      if (res && res.ok === false) {
        statusNote = `Jump failed: ${res.reason}`;
        drawScrub();
        return;
      }
      return;
    }

    if (isForecast) {
      if (scrubSec > visibleForecastCapSec) {
        statusNote = "Forecast revealing";
        clearPreviewState?.();
        drawScrub();
        return;
      }
      setLatchedForecastScrub(scrubSec);
      if (controller?.getStateDataAt?.(scrubSec) == null) {
        statusNote = "Forecast loading";
        clearPreviewState?.();
        drawScrub();
        return;
      }
      if (commit && commitForecastOnScrubRelease) {
        clearPreviewState?.();
        const stateData = controller?.getStateDataAt?.(scrubSec);
        const res = commitSecond?.(scrubSec, stateData);
        if (res && res.ok === false) {
          statusNote = `Jump failed: ${res.reason}`;
          drawScrub();
          return;
        }
        clearLatchedForecastScrub();
        statusNote = "";
        drawScrub();
        return;
      }
      statusNote = forecastPreviewStatusNote;
      applyPreviewThrottled(true);
      return;
    }

    clearLatchedForecastScrub();
    clearPreviewState?.();
    drawScrub();
  }

  plotHit.on("pointerdown", (e) => {
    statusNote = "";
    isScrubbing = true;
    updateScrubFromPointer(e.global);
    applyPreviewThrottled(true);
  });

  plotHit.on("pointermove", (e) => {
    if (!isScrubbing) return;
    updateScrubFromPointer(e.global);
    applyPreviewThrottled(false);
  });

  plotHit.on("pointerup", () => endScrub(true));
  plotHit.on("pointerupoutside", () => endScrub(true));

  zoomBtn.on("pointerdown", (e) => {
    e.stopPropagation();
  });
  zoomBtn.on("pointertap", (e) => {
    e.stopPropagation();
    zoomed = !zoomed;
    invalidatePlotSnapshot();
    statusNote = "";
    render();
  });

  targetBtn.on("pointerdown", (e) => {
    e.stopPropagation();
  });
  targetBtn.on("pointertap", (e) => {
    e.stopPropagation();
    if (!hasTargetModeButton) return;
    onToggleSystemTargetMode?.();
    statusNote = "";
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
    invalidatePlotSnapshot();
    seriesScaleMaxFlashBySeriesId.clear();
    clearProjectionReplacementTransition();
    beginBootFadeTransition(nowMs);
    resetForecastReveal(0, 0, 0, nowMs);
    if (bootRevealDelayMsCur > 0) {
      forecastRevealDelayUntilMs = Math.max(
        forecastRevealDelayUntilMs,
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
        forecastRevealHistoryEndSec === displayHistoryEndSec
          ? Math.floor(forecastRevealVisibleEndSec ?? displayHistoryEndSec)
          : displayHistoryEndSec
      )
    );
    return {
      minSec,
      maxSec,
      scrubSec,
      statusNote,
      isScrubbing,
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
        Number(forecastRevealVelocitySecPerSec ?? 0)
      ),
      forecastRevealHistoryEndSec: Math.max(
        0,
        Math.floor(forecastRevealHistoryEndSec ?? 0)
      ),
      forecastRevealTargetEndSec: Math.max(
        0,
        Math.floor(forecastRevealTargetEndSec ?? 0)
      ),
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
      eventMarkers: Array.isArray(snapshot?.eventMarkers)
        ? snapshot.eventMarkers.map((marker) => ({
            tSec: marker.tSec,
            severity: marker.severity,
            color: marker.color,
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
    forecastRevealVisibleEndSec = visibleForecastCoverageEndSec;
    updateTimeBounds();
    syncLatchedForecastPreviewStatus();
    tryRestoreLatchedForecastPreview();
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
        Math.floor(forecastRevealTargetEndSec ?? displayHistoryEndSec)
      ) -
        visibleForecastCoverageEndSec >
      0.001 ||
      !!projectionReplacementKey ||
      !!seriesScaleMaxFlashKey ||
      !!bootFadeState;
    const shouldPlot =
      revealAnimating
        ? boundsChanged || now - lastPlotMs >= FORECAST_REVEAL_PLOT_THROTTLE_MS
        : isScrubbing || zoomed
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
    statusNote = "";
  }

  function setCommitPolicyResolver(nextResolver) {
    commitPolicyResolver =
      typeof nextResolver === "function" ? nextResolver : null;
    statusNote = "";
  }

  function setSeriesValueOverrideResolver(nextResolver) {
    seriesValueOverrideResolver =
      typeof nextResolver === "function" ? nextResolver : null;
    invalidatePlotSnapshot();
    statusNote = "";
  }

  function setHistoryZoneResolver(nextResolver) {
    historyZoneResolver =
      typeof nextResolver === "function" ? nextResolver : null;
    invalidatePlotSnapshot();
    statusNote = "";
  }

  function setEventMarkerResolver(nextResolver) {
    eventMarkerResolver =
      typeof nextResolver === "function" ? nextResolver : null;
    invalidatePlotSnapshot();
    lastPlotVersion = -1;
    lastPlotBoundsKey = "";
    statusNote = "";
  }

  function setForecastRevealConfig({
    targetDurationSec,
    minRateSecPerSec,
    maxRateSecPerSec,
    startDelayMs,
    followGapSec,
    followResponseSec,
    accelerationSecPerSec2,
    decelerationSecPerSec2,
  } = {}) {
    forecastRevealTargetDurationSecCur = Number.isFinite(targetDurationSec)
      ? Math.max(0.05, Number(targetDurationSec))
      : forecastRevealTargetDurationSec;
    forecastRevealMinRateSecPerSecCur = Number.isFinite(minRateSecPerSec)
      ? Math.max(1, Number(minRateSecPerSec))
      : forecastRevealMinRateSecPerSec;
    forecastRevealMaxRateSecPerSecCur = Number.isFinite(maxRateSecPerSec)
      ? Math.max(
          forecastRevealMinRateSecPerSecCur,
          Number(maxRateSecPerSec)
        )
      : forecastRevealMaxRateSecPerSec;
    forecastRevealStartDelayMsCur = Number.isFinite(startDelayMs)
      ? Math.max(0, Number(startDelayMs))
      : forecastRevealStartDelayMs;
    forecastRevealFollowGapSecCur = Number.isFinite(followGapSec)
      ? Math.max(0, Number(followGapSec))
      : forecastRevealFollowGapSec;
    forecastRevealFollowResponseSecCur = Number.isFinite(followResponseSec)
      ? Math.max(0.05, Number(followResponseSec))
      : forecastRevealFollowResponseSec;
    forecastRevealAccelerationSecPerSec2Cur = Number.isFinite(
      accelerationSecPerSec2
    )
      ? Math.max(1, Number(accelerationSecPerSec2))
      : forecastRevealAccelerationSecPerSec2;
    forecastRevealDecelerationSecPerSec2Cur = Number.isFinite(
      decelerationSecPerSec2
    )
      ? Math.max(1, Number(decelerationSecPerSec2))
      : forecastRevealDecelerationSecPerSec2;
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
    resetForecastPreviewState,
    stageProjectionReplacementTransition,
    clearProjectionReplacementTransition,
    restartForecastRevealFrom,
    clearForecastRevealRestart,
  };
}

export function createGoldGraphView(opts) {
  return createMetricGraphView({ ...opts, metric: GRAPH_METRICS.gold });
}
