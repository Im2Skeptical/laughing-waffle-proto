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
const SETTLEMENT_GRAPH_WINDOW_YEARS = 40;
const SETTLEMENT_GRAPH_WINDOW_SEC =
  Math.max(1, Math.floor(SEASON_DURATION_SEC)) * 4 * SETTLEMENT_GRAPH_WINDOW_YEARS;
app.stage.eventMode = "static";
app.stage.hitArea = app.screen;
app.stage.addChild(playfieldLayer, graphLayer, controlLayer, tooltipLayer);

let prototypeView = null;
let settlementGraphController = null;
let selectedPracticeClassId = "villager";
const forecastWorkerService = createTimegraphForecastWorkerService();
const tooltipView = createTooltipView({
  layer: tooltipLayer,
  app,
});

const runner = createSimRunner({
  setupId: BOOT_SETUP_ID,
  onInvalidate: (reason) => {
    forecastWorkerService.handleTimelineInvalidation?.(reason);
    settlementGraphController?.handleInvalidate?.(reason);
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
  forecastWorkerService,
  forecastStepSec: 1,
  horizonSec: SETTLEMENT_GRAPH_WINDOW_SEC,
});
settlementGraphController.setSubject?.({ classId: selectedPracticeClassId }, selectedPracticeClassId);

prototypeView = createSettlementPrototypeView({
  app,
  layer: playfieldLayer,
  getState: () => runner.getState?.(),
  getSelectedPracticeClassId: () => selectedPracticeClassId,
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
  browseCursorSecond: (tSec) => runner.browseCursorSecond?.(tSec),
  commitCursorSecond: (tSec) => runner.commitCursorSecond?.(tSec),
  previewCursorSecond: (tSec) => {
    const previewState = settlementGraphController?.getStateAt?.(tSec);
    if (!previewState) {
      runner.clearPreviewState?.();
      return { ok: false, reason: "previewUnavailable" };
    }
    runner.setPreviewState?.(previewState);
    return { ok: true, tSec };
  },
  clearPreviewState: () => runner.clearPreviewState?.(),
  commitPreviewToLive: () => runner.commitPreviewToLive?.(),
  requestPauseBeforeDrag: requestPauseBeforeDrag,
  layout: DISK_LAYOUT,
});

const settlementGraphView = createMetricGraphView({
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
  openPosition: { x: 110, y: 840 },
  windowWidth: 1560,
  windowHeight: 190,
  headerHeight: 34,
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
  sunMoonDisksView.applyLayout?.();
}

runner.init();
prototypeView.init();
settlementGraphView.open();
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
  timeControlsView.update(frameDt);
  sunMoonDisksView.update(frameDt);
});
