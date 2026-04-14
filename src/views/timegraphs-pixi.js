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

const HISTORY_ZONE_KIND_ORDER = {
  fixedHistory: 0,
  editableHistory: 1,
};

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

const EVENT_MARKER_SEVERITY_ORDER = {
  normal: 0,
  critical: 1,
};
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

export function resolveDefaultGraphScrubSec({
  currentSec,
  forecastPreviewSec,
  latchedForecastScrubSec,
} = {}) {
  if (Number.isFinite(latchedForecastScrubSec)) {
    return Math.max(0, Math.floor(latchedForecastScrubSec));
  }
  if (Number.isFinite(forecastPreviewSec)) {
    return Math.max(0, Math.floor(forecastPreviewSec));
  }
  return Math.max(0, Math.floor(currentSec ?? 0));
}

export function reconcileLatchedForecastPreview({
  previewStatus,
  statusNote,
  latchedForecastScrubSec,
} = {}) {
  const preview =
    previewStatus && typeof previewStatus === "object" ? previewStatus : null;
  const hasForecastPreview =
    preview?.active === true &&
    preview?.isForecastPreview === true &&
    Number.isFinite(preview?.previewSec);
  if (hasForecastPreview) {
    const previewSec = Math.max(0, Math.floor(preview.previewSec));
    return {
      latchedForecastScrubSec: previewSec,
      forecastPreviewSec: previewSec,
      statusNote,
    };
  }

  const waitingForForecastCoverage =
    statusNote === "Forecast loading" || statusNote === "Forecast revealing";
  if (waitingForForecastCoverage) {
    return {
      latchedForecastScrubSec: Number.isFinite(latchedForecastScrubSec)
        ? Math.max(0, Math.floor(latchedForecastScrubSec))
        : null,
      forecastPreviewSec: null,
      statusNote,
    };
  }

  return {
    latchedForecastScrubSec: null,
    forecastPreviewSec: null,
    statusNote:
      statusNote === "Preview only - click Commit to jump" ? "" : statusNote,
  };
}

export function clampForecastScrubTargetSec(
  targetSec,
  historyEndSec,
  revealCapSec,
  { minSec = 0, maxSec = Number.POSITIVE_INFINITY } = {}
) {
  const min = Math.max(0, Math.floor(minSec ?? 0));
  const max = Math.max(min, Math.floor(maxSec ?? min));
  const historyEnd = Math.max(0, Math.floor(historyEndSec ?? 0));
  const normalizedTarget = Math.max(
    min,
    Math.min(max, Math.floor(targetSec ?? min))
  );
  if (normalizedTarget <= historyEnd) return normalizedTarget;
  const revealCap = Math.max(
    historyEnd,
    Math.floor(revealCapSec ?? historyEnd)
  );
  return Math.max(min, Math.min(max, Math.min(normalizedTarget, revealCap)));
}

function normalizeHistoryZoneSegments(rawSegments, { minSec, maxSec, historyEndSec }) {
  const min = Math.max(0, Math.floor(minSec ?? 0));
  const max = Math.max(min, Math.floor(maxSec ?? min));
  const historyEnd = Math.max(0, Math.floor(historyEndSec ?? 0));
  const realizedEnd = Math.min(max, historyEnd);
  if (realizedEnd <= min) return [];

  const list = Array.isArray(rawSegments) ? rawSegments : [];
  const clipped = [];
  for (const entry of list) {
    const kind = String(entry?.kind ?? "");
    if (kind !== "fixedHistory" && kind !== "editableHistory") continue;
    const startSec = Math.max(min, Math.floor(entry?.startSec ?? min));
    const endSec = Math.min(realizedEnd, Math.floor(entry?.endSec ?? startSec));
    if (endSec <= startSec) continue;
    clipped.push({ kind, startSec, endSec });
  }
  if (!clipped.length) return [];

  clipped.sort(
    (a, b) =>
      a.startSec - b.startSec ||
      a.endSec - b.endSec ||
      (HISTORY_ZONE_KIND_ORDER[a.kind] ?? 99) -
        (HISTORY_ZONE_KIND_ORDER[b.kind] ?? 99)
  );

  const out = [];
  for (const entry of clipped) {
    const prev = out[out.length - 1];
    if (!prev) {
      out.push({ ...entry });
      continue;
    }
    if (entry.startSec < prev.endSec) {
      if (entry.kind === prev.kind) {
        prev.endSec = Math.max(prev.endSec, entry.endSec);
      } else {
        const clippedStart = prev.endSec;
        if (entry.endSec > clippedStart) {
          out.push({
            kind: entry.kind,
            startSec: clippedStart,
            endSec: entry.endSec,
          });
        }
      }
      continue;
    }
    if (entry.startSec === prev.endSec && entry.kind === prev.kind) {
      prev.endSec = Math.max(prev.endSec, entry.endSec);
      continue;
    }
    out.push({ ...entry });
  }

  return out;
}

function normalizeItemUnavailableZones(rawSegments, { minSec, maxSec }) {
  const min = Math.max(0, Math.floor(minSec ?? 0));
  const max = Math.max(min, Math.floor(maxSec ?? min));
  const list = Array.isArray(rawSegments) ? rawSegments : [];
  const zones = [];

  for (const entry of list) {
    const kind = String(entry?.kind ?? "");
    if (kind !== "itemUnavailable") continue;
    const startSec = Math.max(min, Math.floor(entry?.startSec ?? min));
    const endSec = Math.min(max, Math.floor(entry?.endSec ?? startSec));
    if (endSec <= startSec) continue;
    zones.push({ startSec, endSec });
  }
  if (!zones.length) return [];

  zones.sort((a, b) => a.startSec - b.startSec || a.endSec - b.endSec);
  const out = [];
  for (const zone of zones) {
    const prev = out[out.length - 1];
    if (!prev) {
      out.push({ ...zone });
      continue;
    }
    if (zone.startSec <= prev.endSec) {
      prev.endSec = Math.max(prev.endSec, zone.endSec);
      continue;
    }
    out.push({ ...zone });
  }
  return out;
}

function getSeriesValue(point, seriesId) {
  if (point?.values && point.values[seriesId] != null) {
    const v = point.values[seriesId];
    return Number.isFinite(v) ? v : 0;
  }
  if (seriesId === "gold") {
    const v = point?.gold ?? 0;
    return Number.isFinite(v) ? v : 0;
  }
  if (seriesId === "grain") {
    const v = point?.grain ?? 0;
    return Number.isFinite(v) ? v : 0;
  }
  return 0;
}

function resolveSeriesScaleMode(seriesDef) {
  return seriesDef?.scaleMode === "fixed" ? "fixed" : "dynamic";
}

function resolveSeriesScaleGroupId(seriesDef) {
  const explicitGroupId = String(seriesDef?.scaleGroupId ?? "").trim();
  if (explicitGroupId) return explicitGroupId;
  const seriesId = String(seriesDef?.id ?? "").trim();
  return seriesId || "__default__";
}

export function computeGraphSeriesScaleRanges(
  seriesList,
  seriesValues,
  { defaultMin = 0, defaultMax = 100 } = {}
) {
  const list = Array.isArray(seriesList) ? seriesList : [];
  const valuesBySeriesId = seriesValues instanceof Map ? seriesValues : new Map();
  const groupRanges = new Map();
  const seriesRanges = new Map();

  for (const seriesDef of list) {
    const seriesId = String(seriesDef?.id ?? "");
    if (!seriesId) continue;
    const groupId = resolveSeriesScaleGroupId(seriesDef);
    let groupRange = groupRanges.get(groupId);
    if (!groupRange) {
      groupRange = {
        groupId,
        scaleMode: resolveSeriesScaleMode(seriesDef),
        minValue: Number.isFinite(seriesDef?.scaleMin)
          ? Number(seriesDef.scaleMin)
          : Number(defaultMin),
        maxValue: Number.isFinite(seriesDef?.scaleMax)
          ? Number(seriesDef.scaleMax)
          : null,
        observedMaxValue: -Infinity,
      };
      groupRanges.set(groupId, groupRange);
    } else {
      if (groupRange.scaleMode !== "fixed" && resolveSeriesScaleMode(seriesDef) === "fixed") {
        groupRange.scaleMode = "fixed";
      }
      if (Number.isFinite(seriesDef?.scaleMin)) {
        groupRange.minValue = Number(seriesDef.scaleMin);
      }
      if (Number.isFinite(seriesDef?.scaleMax)) {
        groupRange.maxValue = Number(seriesDef.scaleMax);
      }
    }

    const values = valuesBySeriesId.get(seriesId);
    for (const value of Array.isArray(values) ? values : []) {
      if (!Number.isFinite(value)) continue;
      if (value > groupRange.observedMaxValue) {
        groupRange.observedMaxValue = value;
      }
    }
  }

  for (const seriesDef of list) {
    const seriesId = String(seriesDef?.id ?? "");
    if (!seriesId) continue;
    const groupRange = groupRanges.get(resolveSeriesScaleGroupId(seriesDef));
    if (!groupRange) continue;
    const minValue = Number.isFinite(groupRange.minValue)
      ? Number(groupRange.minValue)
      : Number(defaultMin);
    let maxValue = Number.isFinite(groupRange.maxValue)
      ? Number(groupRange.maxValue)
      : groupRange.observedMaxValue;
    if (!Number.isFinite(maxValue)) {
      maxValue = Number(defaultMax);
    }
    if (maxValue <= minValue) {
      maxValue = minValue + 1;
    }
    seriesRanges.set(seriesId, {
      groupId: groupRange.groupId,
      scaleMode: groupRange.scaleMode,
      minValue,
      maxValue,
    });
  }

  return seriesRanges;
}

function normalizeEventMarkers(rawMarkers, { minSec, maxSec }) {
  const min = Math.max(0, Math.floor(minSec ?? 0));
  const max = Math.max(min, Math.floor(maxSec ?? min));
  const markers = Array.isArray(rawMarkers) ? rawMarkers : [];
  const out = [];
  const seen = new Set();

  for (const marker of markers) {
    const sec = Number.isFinite(marker?.tSec) ? Math.floor(marker.tSec) : null;
    if (sec == null || sec < min || sec > max) continue;
    const severity = marker?.severity === "critical" ? "critical" : "normal";
    const color = Number.isFinite(marker?.color) ? Math.floor(marker.color) : null;
    const lineWidth = Number.isFinite(marker?.lineWidth)
      ? Math.max(1, Number(marker.lineWidth))
      : null;
    const radius = Number.isFinite(marker?.radius)
      ? Math.max(1, Number(marker.radius))
      : null;
    const alpha = Number.isFinite(marker?.alpha)
      ? Math.max(0, Math.min(1, Number(marker.alpha)))
      : null;
    const dedupeKey = `${sec}:${severity}:${color ?? "default"}:${lineWidth ?? "default"}:${radius ?? "default"}:${alpha ?? "default"}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push({ tSec: sec, severity, color, lineWidth, radius, alpha });
  }

  out.sort(
    (a, b) =>
      a.tSec - b.tSec ||
      (EVENT_MARKER_SEVERITY_ORDER[a.severity] ?? 99) -
        (EVENT_MARKER_SEVERITY_ORDER[b.severity] ?? 99)
  );
  return out;
}

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

  function clampInt(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v | 0));
  }

  function invalidatePlotSnapshot() {
    plotSnapshotKey = "";
    plotSnapshot = null;
  }

  function getDisplayHistoryEndSec(actualHistoryEndSec) {
    const actual = Math.max(0, Math.floor(actualHistoryEndSec ?? 0));
    if (!Number.isFinite(forecastRevealStartSecOverride)) {
      return actual;
    }
    const override = Math.max(0, Math.floor(forecastRevealStartSecOverride));
    if (override > actual) {
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

  function getForecastRevealFollowTargetEndSec(targetEndSec, historyEndSec) {
    const historyEnd = Math.max(0, Math.floor(historyEndSec ?? 0));
    const targetEnd = Math.max(historyEnd, Math.floor(targetEndSec ?? historyEnd));
    const configuredGapSec = Math.max(
      0,
      Number(forecastRevealFollowGapSecCur ?? 0)
    );
    if (configuredGapSec <= 0) return targetEnd;
    const availableSpanSec = Math.max(0, targetEnd - historyEnd);
    if (availableSpanSec <= 1) return historyEnd;
    const effectiveGapSec = Math.min(
      configuredGapSec,
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
    const nextMax = Math.max(nextMin + 1, Math.floor(nextMaxSec ?? nextMin + 1));
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
      historyEnd
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
    statusNote = "Preview only - click Commit to jump";
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

  function restartForecastRevealFrom(startSec) {
    const tl = getTimeline?.();
    const data = controller.getData?.() ?? {};
    const actualHistoryEndSec = Math.max(0, Math.floor(tl?.historyEndSec ?? 0));
    const normalizedStartSec = Math.max(
      0,
      Math.min(Math.floor(startSec ?? actualHistoryEndSec), actualHistoryEndSec)
    );
    forecastRevealStartSecOverride =
      normalizedStartSec <= actualHistoryEndSec ? normalizedStartSec : null;
    const displayHistoryEndSec = getDisplayHistoryEndSec(actualHistoryEndSec);
    const actualForecastCoverageEndSec = Math.max(
      actualHistoryEndSec,
      Math.floor(data?.forecastCoverageEndSec ?? actualHistoryEndSec)
    );
    resetForecastReveal(
      displayHistoryEndSec,
      actualForecastCoverageEndSec,
      displayHistoryEndSec,
      performance.now()
    );
    lastPlotVersion = -1;
    lastPlotBoundsKey = "";
    invalidatePlotSnapshot();
  }

  function clearForecastRevealRestart() {
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
      forecastRevealLastTickMs = nowMs;
      forecastRevealVelocitySecPerSec = 0;
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
      Math.floor(PLOT_SNAPSHOT_BOUNDS_QUANTUM_SEC)
    );
    const snapshotMinSec =
      Math.floor(Math.max(0, minSec) / snapshotBoundsQuantumSec) *
      snapshotBoundsQuantumSec;
    const snapshotMaxSec =
      Math.ceil(Math.max(snapshotMinSec + 1, maxSec) / snapshotBoundsQuantumSec) *
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

    function refreshPlotSnapshotForecastState(baseSnapshot) {
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

      for (let i = 0; i < basePoints.length; i++) {
        const point = basePoints[i];
        const t = pointSecs[i];
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

      return {
        pointsForDraw: refreshedPoints,
        seriesValues: refreshedSeriesValues,
        seriesScaleRanges: computeGraphSeriesScaleRanges(
          seriesList,
          refreshedSeriesValues,
          {
            defaultMin: 0,
            defaultMax: 100,
          }
        ),
      };
    }

    if (plotSnapshot && plotSnapshotKey === snapshotKey) {
      const refreshedForecastState = refreshPlotSnapshotForecastState(plotSnapshot);
      plotSnapshot = {
        ...plotSnapshot,
        data,
        tl,
        cs,
        cursorSec,
        historyEndSec,
        displayHistoryEndSec,
        actualForecastCoverageEndSec,
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
    const seriesScaleRanges = computeGraphSeriesScaleRanges(seriesList, seriesValues, {
      defaultMin: 0,
      defaultMax: 100,
    });

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
      markerSecs,
    };
    return buildDynamicSnapshotParts(plotSnapshot);
  }

  function drawPlot() {
    resolveMetric();
    const perfStart = perfEnabled() ? perfNowMs() : 0;
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

    // Data Line
    const hasHoveredSeries =
      typeof hoveredLegendSeriesId === "string" &&
      hoveredLegendSeriesId.length > 0;
    for (const s of seriesList) {
      const lineColor = Number.isFinite(s.color)
        ? s.color
        : MUCHA_UI_COLORS.accents.gold;
      const isHovered = hasHoveredSeries && s.id === hoveredLegendSeriesId;
      const lineWidth = hasHoveredSeries
        ? isHovered
          ? SERIES_LINE_WIDTH_HOVERED
          : SERIES_LINE_WIDTH_DIMMED
        : SERIES_LINE_WIDTH_DEFAULT;
      const lineAlpha = hasHoveredSeries
        ? isHovered
          ? SERIES_LINE_ALPHA_HOVERED
          : SERIES_LINE_ALPHA_DIMMED
        : SERIES_LINE_ALPHA_DEFAULT;
      plotG.lineStyle(lineWidth, lineColor, lineAlpha);
      let first = true;
      const values = seriesValues.get(s.id) ?? [];
      let prevDrawnPoint = null;
      let drewToLineEnd = false;

      for (let i = 0; i < pointsForDraw.length; i++) {
        const p = pointsForDraw[i];
        const t = p.tSec ?? 0;
        const value = values[i];
        if (t > displayHistoryEndSec && t > lineDrawEndSec) {
          if (
            prevDrawnPoint &&
            Number.isFinite(prevDrawnPoint.t) &&
            Number.isFinite(prevDrawnPoint.value) &&
            Number.isFinite(value) &&
            t > prevDrawnPoint.t &&
            lineDrawEndSec > prevDrawnPoint.t
          ) {
            const ratio =
              (lineDrawEndSec - prevDrawnPoint.t) /
              Math.max(1e-6, t - prevDrawnPoint.t);
            const interpolatedValue =
              prevDrawnPoint.value +
              (value - prevDrawnPoint.value) * ratio;
            const interpolatedX = timeToX(lineDrawEndSec);
            const interpolatedY = yForValue(interpolatedValue, s.id);
            if (first) {
              plotG.moveTo(interpolatedX, interpolatedY);
              first = false;
            } else {
              plotG.lineTo(interpolatedX, interpolatedY);
            }
            drewToLineEnd = true;
          }
          first = true;
          break;
        }
        if (!Number.isFinite(value)) {
          first = true;
          prevDrawnPoint = null;
          continue;
        }
        const x = timeToX(t);
        const y = yForValue(value, s.id);

        if (first) {
          plotG.moveTo(x, y);
          first = false;
        } else {
          plotG.lineTo(x, y);
        }
        prevDrawnPoint = { t, value };
      }

      if (
        drewToLineEnd !== true &&
        prevDrawnPoint &&
        Number.isFinite(prevDrawnPoint.t) &&
        Number.isFinite(prevDrawnPoint.value) &&
        lineDrawEndSec > prevDrawnPoint.t
      ) {
        plotG.lineTo(
          timeToX(lineDrawEndSec),
          yForValue(prevDrawnPoint.value, s.id)
        );
      }
    }

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
      if (typeof commitPolicyResolver === "function") {
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
      statusNote = "Preview only - click Commit to jump";
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
    invalidatePlotSnapshot();
    resetForecastReveal(0, 0, 0, performance.now());
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
    const boundsKey = `${minSec}:${maxSec}:${displayHistoryEndSec}:${Math.floor(visibleForecastCoverageEndSec * 10)}`;
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
      0.001;
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
    restartForecastRevealFrom,
    clearForecastRevealRestart,
  };
}

export function createGoldGraphView(opts) {
  return createMetricGraphView({ ...opts, metric: GRAPH_METRICS.gold });
}
