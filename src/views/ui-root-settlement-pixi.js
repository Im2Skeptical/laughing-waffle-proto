const BOOT_SETUP_ID = "devPlaytesting01";

import { createSimRunner } from "../controllers/sim-runner.js";
import { createTimegraphForecastWorkerService } from "../controllers/timegraph-forecast-worker-service.js";
import { SEASON_DURATION_SEC } from "../defs/gamesettings/gamerules-defs.js";
import { GRAPH_METRICS } from "../model/graph-metrics.js";
import { createTimeGraphController } from "../model/timegraph-controller.js";
import {
  VIEWPORT_DESIGN_HEIGHT,
  VIEWPORT_DESIGN_WIDTH,
} from "./layout-pixi.js";
import { createSettlementPrototypeView } from "./settlement-prototype-view.js";
import { createTimeControlsView } from "./time-controls-pixi.js";
import { createMetricGraphView } from "./timegraphs-pixi.js";
import { createTooltipView } from "./tooltip-pixi.js";
import {
  createSunAndMoonDisksView,
  SUN_AND_MOON_DISKS_LAYOUT,
} from "./sunandmoon-disks-pixi.js";
import { installGlobalTextStylePolicy } from "./ui-helpers/text-style-policy.js";
import {
  computeSettlementGraphWindowSpec,
  createSettlementProjectionCache,
  SETTLEMENT_GRAPH_FORECAST_STEP_SEC,
} from "./ui-root/settlement-timegraph-window.js";

if (typeof globalThis !== "undefined" && globalThis.__PERF_ENABLED__ == null) {
  globalThis.__PERF_ENABLED__ = false;
}

export const app = new PIXI.Application({
  width: VIEWPORT_DESIGN_WIDTH,
  height: VIEWPORT_DESIGN_HEIGHT,
  backgroundColor: 0x847b68,
  antialias: true,
});

installGlobalTextStylePolicy(PIXI, {
  fontFamily: "Georgia",
  titleVariant: "small-caps",
});

document.body.appendChild(app.view);
app.view.style.touchAction = "none";
app.view.style.userSelect = "none";
app.view.style.webkitUserSelect = "none";
app.view.style.display = "block";

function getViewportSizePx() {
  const vv = window.visualViewport;
  if (
    vv &&
    Number.isFinite(vv.width) &&
    Number.isFinite(vv.height) &&
    vv.width > 0 &&
    vv.height > 0
  ) {
    return {
      width: Math.max(1, Math.floor(vv.width)),
      height: Math.max(1, Math.floor(vv.height)),
    };
  }
  return {
    width: Math.max(
      1,
      Math.floor(
        window.innerWidth ||
          document.documentElement.clientWidth ||
          VIEWPORT_DESIGN_WIDTH
      )
    ),
    height: Math.max(
      1,
      Math.floor(
        window.innerHeight ||
          document.documentElement.clientHeight ||
          VIEWPORT_DESIGN_HEIGHT
      )
    ),
  };
}

function fitCanvasToViewport(view) {
  const vp = getViewportSizePx();
  const scale = Math.min(
    vp.width / VIEWPORT_DESIGN_WIDTH,
    vp.height / VIEWPORT_DESIGN_HEIGHT
  );
  const cssWidth = Math.max(1, Math.floor(VIEWPORT_DESIGN_WIDTH * scale));
  const cssHeight = Math.max(1, Math.floor(VIEWPORT_DESIGN_HEIGHT * scale));
  const left = Math.floor((vp.width - cssWidth) * 0.5);
  const top = Math.floor((vp.height - cssHeight) * 0.5);
  view.style.width = `${cssWidth}px`;
  view.style.height = `${cssHeight}px`;
  view.style.position = "fixed";
  view.style.left = `${left}px`;
  view.style.top = `${top}px`;
}

function stylePage() {
  document.body.style.backgroundColor = "#302a28";
  document.body.style.margin = "0";
  document.body.style.overflow = "hidden";
  document.body.style.height = "100%";
  document.documentElement.style.backgroundColor = "#302a28";
  document.documentElement.style.height = "100%";
}

fitCanvasToViewport(app.view);
stylePage();

const playfieldLayer = new PIXI.Container();
const graphLayer = new PIXI.Container();
const controlLayer = new PIXI.Container();
const tooltipLayer = new PIXI.Container();
const settlementGraphSeriesMenuLayer = new PIXI.Container();
const SETTLEMENT_GRAPH_WINDOW_YEARS = 40;
const SETTLEMENT_GRAPH_WINDOW_SEC =
  Math.max(1, Math.floor(SEASON_DURATION_SEC)) * 4 * SETTLEMENT_GRAPH_WINDOW_YEARS;
const MAX_SETTLEMENT_GRAPH_VISIBLE_SERIES = 5;
const SETTLEMENT_GRAPH_MENU_RECT = {
  x: 1410,
  y: 926,
  width: 240,
};
const SETTLEMENT_GRAPH_ALL_SERIES = Array.isArray(GRAPH_METRICS.settlement?.series)
  ? GRAPH_METRICS.settlement.series
  : [];
const DEFAULT_SETTLEMENT_GRAPH_VISIBLE_SERIES = SETTLEMENT_GRAPH_ALL_SERIES.slice(
  0,
  MAX_SETTLEMENT_GRAPH_VISIBLE_SERIES
).map((series) => String(series?.id ?? ""));
app.stage.eventMode = "static";
app.stage.hitArea = app.screen;
app.stage.addChild(playfieldLayer, graphLayer, controlLayer, tooltipLayer);
controlLayer.addChild(settlementGraphSeriesMenuLayer);

let prototypeView = null;
let settlementGraphController = null;
let selectedPracticeClassId = "villager";
let settlementGraphView = null;
let settlementGraphSeriesMenuOpen = false;
let settlementGraphSeriesMenuSignature = "";
let visibleSettlementGraphSeriesIds = [...DEFAULT_SETTLEMENT_GRAPH_VISIBLE_SERIES];
const forecastWorkerService = createTimegraphForecastWorkerService();
const settlementProjectionCache = createSettlementProjectionCache({
  horizonSec: SETTLEMENT_GRAPH_WINDOW_SEC,
  stepSec: SETTLEMENT_GRAPH_FORECAST_STEP_SEC,
});
const tooltipView = createTooltipView({
  layer: tooltipLayer,
  app,
});

function getSettlementGraphSeriesButtonLabel() {
  return `Series ${visibleSettlementGraphSeriesIds.length}/${SETTLEMENT_GRAPH_ALL_SERIES.length}`;
}

function getVisibleSettlementGraphSeries() {
  return SETTLEMENT_GRAPH_ALL_SERIES.filter((series) =>
    visibleSettlementGraphSeriesIds.includes(String(series?.id ?? ""))
  );
}

function applySettlementGraphSeriesSelection() {
  settlementGraphController?.setSeries?.(getVisibleSettlementGraphSeries());
}

function renderSettlementGraphSeriesMenu() {
  const signature = JSON.stringify({
    open: settlementGraphSeriesMenuOpen,
    visible: visibleSettlementGraphSeriesIds,
  });
  if (signature === settlementGraphSeriesMenuSignature) return;
  settlementGraphSeriesMenuSignature = signature;
  settlementGraphSeriesMenuLayer.removeChildren();
  settlementGraphSeriesMenuLayer.visible = settlementGraphSeriesMenuOpen;
  if (!settlementGraphSeriesMenuOpen) return;

  const rowHeight = 30;
  const headerHeight = 34;
  const padding = 10;
  const width = SETTLEMENT_GRAPH_MENU_RECT.width;
  const height =
    headerHeight + padding + SETTLEMENT_GRAPH_ALL_SERIES.length * rowHeight + padding;

  const panel = new PIXI.Graphics();
  panel.lineStyle(2, 0x4f4b48, 0.95);
  panel.beginFill(0x413834, 0.96);
  panel.drawRoundedRect(
    SETTLEMENT_GRAPH_MENU_RECT.x,
    SETTLEMENT_GRAPH_MENU_RECT.y,
    width,
    height,
    14
  );
  panel.endFill();
  settlementGraphSeriesMenuLayer.addChild(panel);

  const title = new PIXI.Text(
    `Shown ${visibleSettlementGraphSeriesIds.length}/${MAX_SETTLEMENT_GRAPH_VISIBLE_SERIES}`,
    {
      fontFamily: "Georgia",
      fontSize: 14,
      fontWeight: "bold",
      fill: 0xf7f2e9,
    }
  );
  title.x = SETTLEMENT_GRAPH_MENU_RECT.x + 12;
  title.y = SETTLEMENT_GRAPH_MENU_RECT.y + 8;
  settlementGraphSeriesMenuLayer.addChild(title);

  for (let i = 0; i < SETTLEMENT_GRAPH_ALL_SERIES.length; i += 1) {
    const series = SETTLEMENT_GRAPH_ALL_SERIES[i];
    const seriesId = String(series?.id ?? "");
    if (!seriesId) continue;
    const visible = visibleSettlementGraphSeriesIds.includes(seriesId);
    const atCap =
      !visible &&
      visibleSettlementGraphSeriesIds.length >= MAX_SETTLEMENT_GRAPH_VISIBLE_SERIES;
    const rowY = SETTLEMENT_GRAPH_MENU_RECT.y + headerHeight + i * rowHeight;

    const row = new PIXI.Container();
    row.eventMode = "static";
    row.cursor = atCap ? "default" : "pointer";
    row.hitArea = new PIXI.Rectangle(
      SETTLEMENT_GRAPH_MENU_RECT.x + 8,
      rowY,
      width - 16,
      rowHeight
    );
    row.on("pointertap", (event) => {
      event?.stopPropagation?.();
      if (atCap) return;
      if (visible) {
        if (visibleSettlementGraphSeriesIds.length <= 1) return;
        visibleSettlementGraphSeriesIds = visibleSettlementGraphSeriesIds.filter(
          (id) => id !== seriesId
        );
      } else {
        visibleSettlementGraphSeriesIds = SETTLEMENT_GRAPH_ALL_SERIES.map((entry) =>
          String(entry?.id ?? "")
        ).filter(
          (id) => visibleSettlementGraphSeriesIds.includes(id) || id === seriesId
        );
      }
      applySettlementGraphSeriesSelection();
      settlementGraphView?.render?.();
      settlementGraphSeriesMenuSignature = "";
      renderSettlementGraphSeriesMenu();
    });

    const rowBg = new PIXI.Graphics();
    rowBg.lineStyle(1, visible ? 0xd7b450 : 0x5f574e, 0.9);
    rowBg.beginFill(visible ? 0x5d564d : 0x4b4743, atCap ? 0.45 : 0.82);
    rowBg.drawRoundedRect(
      SETTLEMENT_GRAPH_MENU_RECT.x + 8,
      rowY,
      width - 16,
      rowHeight - 4,
      10
    );
    rowBg.endFill();
    row.addChild(rowBg);

    const dot = new PIXI.Graphics();
    dot.beginFill(Number.isFinite(series?.color) ? series.color : 0xd7b450, atCap ? 0.45 : 1);
    dot.drawCircle(0, 0, 7);
    dot.endFill();
    dot.x = SETTLEMENT_GRAPH_MENU_RECT.x + 24;
    dot.y = rowY + 13;
    row.addChild(dot);

    const label = new PIXI.Text(String(series?.label ?? seriesId), {
      fontFamily: "Georgia",
      fontSize: 13,
      fontWeight: visible ? "bold" : "normal",
      fill: atCap ? 0xa59b8c : 0xf7f2e9,
    });
    label.x = SETTLEMENT_GRAPH_MENU_RECT.x + 38;
    label.y = rowY + 5;
    row.addChild(label);

    const stateText = new PIXI.Text(visible ? "On" : atCap ? "Full" : "Off", {
      fontFamily: "Georgia",
      fontSize: 12,
      fill: visible ? 0xd7b450 : atCap ? 0xa59b8c : 0xd7d0c3,
    });
    stateText.x = SETTLEMENT_GRAPH_MENU_RECT.x + width - 42;
    stateText.y = rowY + 6;
    row.addChild(stateText);

    settlementGraphSeriesMenuLayer.addChild(row);
  }
}

function toggleSettlementGraphSeriesMenu() {
  settlementGraphSeriesMenuOpen = !settlementGraphSeriesMenuOpen;
  settlementGraphSeriesMenuSignature = "";
  renderSettlementGraphSeriesMenu();
}

function shouldInvalidateSettlementTimelineForecast(reason) {
  if (typeof reason !== "string" || reason.length <= 0) return true;
  if (reason === "init" || reason === "saveLoad") return true;
  if (reason === "actionDispatched" || reason === "actionDispatchedCurrentSec") {
    return true;
  }
  if (reason === "plannerClear") return true;
  if (reason.startsWith("plannerCommit:")) return true;
  return false;
}

const runner = createSimRunner({
  setupId: BOOT_SETUP_ID,
  onInvalidate: (reason) => {
    if (shouldInvalidateSettlementTimelineForecast(reason)) {
      forecastWorkerService.handleTimelineInvalidation?.(reason);
      settlementGraphController?.handleInvalidate?.(reason);
    }
    prototypeView?.refresh?.();
  },
  onRebuildViews: () => {
    prototypeView?.refresh?.();
  },
});

settlementGraphController = createTimeGraphController({
  getTimeline: () => runner.getTimeline?.(),
  getCursorState: () => runner.getCursorState?.(),
  metric: GRAPH_METRICS.settlement,
  projectionCache: settlementProjectionCache,
  forecastWorkerService,
  forecastStepSec: SETTLEMENT_GRAPH_FORECAST_STEP_SEC,
  horizonSec: SETTLEMENT_GRAPH_WINDOW_SEC,
});
settlementGraphController.setSubject?.({ classId: selectedPracticeClassId }, selectedPracticeClassId);
applySettlementGraphSeriesSelection();

prototypeView = createSettlementPrototypeView({
  app,
  layer: playfieldLayer,
  getState: () => runner.getState?.(),
  getSelectedPracticeClassId: () => selectedPracticeClassId,
  tooltipView,
  setSelectedPracticeClassId: (classId) => {
    selectedPracticeClassId = typeof classId === "string" && classId.length > 0 ? classId : "villager";
    settlementGraphController.setSubject?.(
      { classId: selectedPracticeClassId },
      selectedPracticeClassId
    );
  },
});

const DISK_LAYOUT = {
  ...SUN_AND_MOON_DISKS_LAYOUT,
  moon: {
    ...SUN_AND_MOON_DISKS_LAYOUT.moon,
    x: 2105,
    y: 895,
    scale: 0.42,
  },
  season: {
    ...SUN_AND_MOON_DISKS_LAYOUT.season,
    x: 2105,
    y: 895,
    scale: 0.58,
  },
};

const timeControlsView = createTimeControlsView({
  app,
  layer: controlLayer,
  getGameState: () => runner.getState?.(),
  togglePause,
  isPausePending: () => runner.isPausePending?.() ?? false,
  getCommitPreviewState: () => {
    const preview = runner.getPreviewStatus?.();
    return {
      visible: !!preview?.isForecastPreview,
      enabled: !!preview?.isForecastPreview,
    };
  },
  onCommitPreview: () => runner.commitPreviewToLive?.(),
  getReturnToPresentState: () => {
    const preview = runner.getPreviewStatus?.();
    if (!preview?.active || preview?.isForecastPreview) {
      return { visible: false, enabled: false, targetSec: null };
    }
    const targetSec = Math.max(
      0,
      Math.floor(preview?.liveSec ?? runner.getTimeline?.()?.historyEndSec ?? 0)
    );
    return {
      visible: Number.isFinite(preview?.previewSec) && preview.previewSec !== targetSec,
      enabled: true,
      targetSec,
    };
  },
  onReturnToPresent: (targetSec) => runner.commitCursorSecond?.(targetSec),
  getTimeScale: () => runner.getTimeScale?.(),
  setTimeScaleTarget: (speed, opts) => runner.setTimeScaleTarget?.(speed, opts),
  layout: {
    enabled: true,
    zIndex: 4,
    gap: 14,
    screenPadding: 16,
    verticalGapFromDiskPx: -38,
    diskTextureRadiusPx: 220,
    buttonAlignOffsetY: 0,
  },
  sunMoonLayout: DISK_LAYOUT,
});

const sunMoonDisksView = createSunAndMoonDisksView({
  app,
  layer: controlLayer,
  getState: () => runner.getState?.(),
  getTimeline: () => runner.getTimeline?.(),
  getEditableHistoryBounds: () => runner.getEditableHistoryBounds?.(),
  getForecastPreviewCapSec: () =>
    settlementGraphView?.getForecastScrubCapSec?.() ??
    runner.getTimeline?.()?.historyEndSec ??
    0,
  browseCursorSecond: (tSec) => runner.browseCursorSecond?.(tSec),
  commitCursorSecond: (tSec) => runner.commitCursorSecond?.(tSec),
  previewCursorSecond: (tSec) => {
    const previewCapSec =
      settlementGraphView?.getForecastScrubCapSec?.() ??
      runner.getTimeline?.()?.historyEndSec ??
      0;
    const clampedTSec = Math.max(
      0,
      Math.min(Math.floor(tSec ?? 0), Math.floor(previewCapSec))
    );
    const previewState = settlementGraphController?.getStateAt?.(clampedTSec);
    if (!previewState) {
      runner.clearPreviewState?.();
      return { ok: false, reason: "previewUnavailable" };
    }
    runner.setPreviewState?.(previewState);
    return { ok: true, tSec: clampedTSec };
  },
  clearPreviewState: () => runner.clearPreviewState?.(),
  commitPreviewToLive: () => runner.commitPreviewToLive?.(),
  requestPauseBeforeDrag: requestPauseBeforeDrag,
  layout: DISK_LAYOUT,
});

settlementGraphView = createMetricGraphView({
  app,
  layer: graphLayer,
  controller: settlementGraphController,
  tooltipView,
  metric: GRAPH_METRICS.settlement,
  getTimeline: () => runner.getTimeline?.(),
  getCursorState: () => runner.getCursorState?.(),
  getPreviewStatus: () => runner.getPreviewStatus?.(),
  getEditableHistoryBounds: () => runner.getEditableHistoryBounds?.(),
  setPreviewState: (state) => runner.setPreviewState?.(state),
  clearPreviewState: () => runner.clearPreviewState?.(),
  commitSecond: (tSec, stateData) => runner.commitCursorSecond?.(tSec, stateData),
  getWindowSpec: ({ timeline, cursorState, zoomed }) => {
    const preview = runner.getPreviewStatus?.();
    return computeSettlementGraphWindowSpec({
      historyEndSec: timeline?.historyEndSec,
      cursorSec: cursorState?.tSec,
      forecastPreviewSec: preview?.isForecastPreview ? preview.previewSec : null,
      horizonSec: SETTLEMENT_GRAPH_WINDOW_SEC,
      zoomed,
    });
  },
  openPosition: { x: 110, y: 884 },
  windowWidth: 1560,
  windowHeight: 190,
  headerHeight: 34,
  getSystemTargetModeLabel: () => getSettlementGraphSeriesButtonLabel(),
  onToggleSystemTargetMode: () => toggleSettlementGraphSeriesMenu(),
  showClose: false,
  showPin: false,
  draggable: false,
});

function requestPauseBeforeDrag() {
  runner.setTimeScaleTarget?.(0, { requestPause: true });
  runner.setPaused?.(true);
}

function togglePause() {
  const paused = runner.getCursorState?.()?.paused === true;
  if (paused) {
    runner.setTimeScaleTarget?.(1, { unpause: true });
    runner.setPaused?.(false);
    return;
  }
  requestPauseBeforeDrag();
}

function isTypingTarget(target) {
  if (!target || typeof target !== "object") return false;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.isContentEditable === true
  );
}

function handleGlobalKeyDown(ev) {
  if (!ev || ev.repeat || isTypingTarget(ev.target)) return;
  if (ev.code === "Space" || ev.key === " ") {
    ev.preventDefault();
    togglePause();
  }
}

function resizeCanvas() {
  fitCanvasToViewport(app.view);
  stylePage();
  prototypeView?.refresh?.();
  settlementGraphView.render?.();
  renderSettlementGraphSeriesMenu();
  sunMoonDisksView.applyLayout?.();
}

runner.init();
prototypeView.init();
settlementGraphView.open();
renderSettlementGraphSeriesMenu();
timeControlsView.init();
sunMoonDisksView.init();

window.addEventListener("resize", resizeCanvas);
window.addEventListener("keydown", handleGlobalKeyDown);

app.ticker.add((delta) => {
  const frameDt = delta / 60;
  runner.update(frameDt);
  settlementGraphController.update?.();
  prototypeView.update(frameDt);
  settlementGraphView.render();
  renderSettlementGraphSeriesMenu();
  timeControlsView.update(frameDt);
  sunMoonDisksView.update(frameDt);
});
