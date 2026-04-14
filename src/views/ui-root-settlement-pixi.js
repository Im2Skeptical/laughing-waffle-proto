const BOOT_SETUP_ID = "devPlaytesting01";

import { createSimRunner } from "../controllers/sim-runner.js";
import { createTimegraphForecastWorkerService } from "../controllers/timegraph-forecast-worker-service.js";
import {
  SEASON_DURATION_SEC,
  SETTLEMENT_VISIBLE_WINDOW_YEARS,
} from "../defs/gamesettings/gamerules-defs.js";
import { ActionKinds } from "../model/actions.js";
import { GRAPH_METRICS } from "../model/graph-metrics.js";
import {
  getSettlementCurrentVassal,
  getSettlementFirstSelectedVassal,
  getSettlementLatestSelectedVassalDeathSec,
  getSettlementSelectedVassalRealizedSegments,
  getSettlementVassalBoundarySeconds,
  getSettlementYearDurationSec,
} from "../model/settlement-state.js";
import { buildSettlementVassalSelectionPool } from "../model/settlement-vassal-exec.js";
import { computeHistoryZoneSegments } from "../model/timegraph/edit-policy.js";
import { createTimeGraphController } from "../model/timegraph-controller.js";
import {
  VIEWPORT_DESIGN_HEIGHT,
  VIEWPORT_DESIGN_WIDTH,
} from "./layout-pixi.js";
import { createSettlementPrototypeView } from "./settlement-prototype-view.js";
import { createRunCompleteView } from "./run-complete-pixi.js";
import { createSettlementVassalChooserView } from "./settlement-vassal-chooser-pixi.js";
import { createSettlementVassalControlsView } from "./settlement-vassal-controls-pixi.js";
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
  SETTLEMENT_GRAPH_LOSS_SEARCH_CAPACITY_SEC,
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
const modalLayer = new PIXI.Container();
const settlementGraphSeriesMenuLayer = new PIXI.Container();
const SETTLEMENT_GRAPH_WINDOW_SEC =
  Math.max(1, Math.floor(SEASON_DURATION_SEC)) *
  4 *
  Math.max(1, Math.floor(SETTLEMENT_VISIBLE_WINDOW_YEARS));
const MAX_SETTLEMENT_GRAPH_VISIBLE_SERIES = 5;
const SETTLEMENT_GRAPH_MENU_MARGIN = 12;
const SETTLEMENT_GRAPH_MENU_RECT = {
  x: 1410,
  y: 926,
  width: 240,
};
const SETTLEMENT_GRAPH_MENU_LAYOUT = Object.freeze({
  padding: 12,
  titleHeight: 18,
  metaHeight: 14,
  sectionGap: 12,
  sectionLabelHeight: 18,
  blockGap: 10,
  headerHeight: 22,
  rowHeight: 28,
  rowGap: 6,
  globalColumns: 3,
  globalCellWidth: 116,
  metricLabelWidth: 86,
  classColumnWidth: 98,
  classColumnGap: 8,
  maxClassColumnsPerBlock: 5,
});
app.stage.eventMode = "static";
app.stage.hitArea = app.screen;
app.stage.addChild(playfieldLayer, graphLayer, controlLayer, modalLayer, tooltipLayer);
controlLayer.addChild(settlementGraphSeriesMenuLayer);

let prototypeView = null;
let settlementGraphController = null;
let selectedPracticeClassId = "villager";
let settlementGraphView = null;
let settlementVassalChooserView = null;
let settlementVassalControlsView = null;
let runCompleteView = null;
let settlementGraphSeriesMenuOpen = false;
let settlementGraphSeriesMenuSignature = "";
let visibleSettlementGraphSeriesIds = [];
let settlementPendingVassalSelection = null;
let settlementVassalSelectionWasOpen = false;
let settlementVassalSelectionResumeSpeed = 0;
let settlementGraphHorizonOverrideSec = null;
let settlementProjectedLossCacheKey = "";
let settlementProjectedLossCacheValue = null;
let settlementMaxObservedLossYear = null;
let settlementPlaybackSpeedTarget = 0;
let settlementPlaybackSpeedCurrent = 0;
let settlementPlaybackViewSec = null;
let settlementPendingCommitJob = null;
let settlementGraphRevealMode = "";
const SETTLEMENT_AUTO_COMMIT_BUFFER_SEC = 16;
const SETTLEMENT_AUTO_COMMIT_CHUNK_SEC = 128;
const SETTLEMENT_AUTO_COMMIT_MIN_INTERVAL_MS = 900;
const SETTLEMENT_AUTO_COMMIT_FORCE_LAG_SEC = 448;
const SETTLEMENT_DYNAMIC_DISPLAY_BUFFER_YEARS = 4;
const SETTLEMENT_EXACT_LOSS_SEARCH_BUCKET_SEC = 16;
const SETTLEMENT_HORIZON_UPDATE_QUANTUM_SEC = 16;
const SETTLEMENT_GRAPH_REVEAL_DEFAULT = Object.freeze({
  targetDurationSec: 14,
  minRateSecPerSec: 84,
  maxRateSecPerSec: 84,
  startDelayMs: 400,
});
const SETTLEMENT_GRAPH_REVEAL_PENDING_COMMIT = Object.freeze({
  targetDurationSec: 13,
  minRateSecPerSec: 92,
  maxRateSecPerSec: 92,
  startDelayMs: 250,
});
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
  const allSeries = syncSettlementGraphSeriesSelection();
  return `Series ${visibleSettlementGraphSeriesIds.length}/${allSeries.length}`;
}

function getSettlementGraphMenuSeries() {
  const state = runner?.getCursorState?.() ?? runner?.getState?.() ?? null;
  if (typeof GRAPH_METRICS.settlement?.getSeries === "function") {
    return GRAPH_METRICS.settlement.getSeries(null, state);
  }
  return Array.isArray(GRAPH_METRICS.settlement?.series)
    ? GRAPH_METRICS.settlement.series
    : [];
}

function getSettlementGraphSeriesId(series) {
  return String(series?.id ?? "");
}

function getSettlementGraphDefaultSeriesIds(allSeries = getSettlementGraphMenuSeries()) {
  const list = Array.isArray(allSeries) ? allSeries : [];
  const preferred = [];
  const pushUnique = (seriesId) => {
    if (!seriesId || preferred.includes(seriesId)) return;
    preferred.push(seriesId);
  };

  for (const preferredSeriesId of [
    "totalPopulation",
    "food",
    "chaosPower",
    "faith:villager",
    "happiness:villager",
  ]) {
    const series = list.find(
      (entry) => getSettlementGraphSeriesId(entry) === preferredSeriesId
    );
    if (!series) continue;
    pushUnique(getSettlementGraphSeriesId(series));
    if (preferred.length >= MAX_SETTLEMENT_GRAPH_VISIBLE_SERIES) break;
  }
  for (const series of list) {
    pushUnique(getSettlementGraphSeriesId(series));
    if (preferred.length >= MAX_SETTLEMENT_GRAPH_VISIBLE_SERIES) break;
  }

  return preferred.slice(0, MAX_SETTLEMENT_GRAPH_VISIBLE_SERIES);
}

function syncSettlementGraphVisibleSeriesIds(allSeries = getSettlementGraphMenuSeries()) {
  const availableSeriesIds = new Set(
    allSeries.map((series) => String(series?.id ?? "")).filter(Boolean)
  );
  const nextVisibleSeriesIds = visibleSettlementGraphSeriesIds.filter((seriesId) =>
    availableSeriesIds.has(seriesId)
  );
  if (!nextVisibleSeriesIds.length) {
    nextVisibleSeriesIds.push(...getSettlementGraphDefaultSeriesIds(allSeries));
  }
  const changed =
    nextVisibleSeriesIds.length !== visibleSettlementGraphSeriesIds.length ||
    nextVisibleSeriesIds.some((seriesId, index) => seriesId !== visibleSettlementGraphSeriesIds[index]);
  visibleSettlementGraphSeriesIds = nextVisibleSeriesIds;
  return changed;
}

function getVisibleSettlementGraphSeriesFromList(allSeries) {
  const list = Array.isArray(allSeries) ? allSeries : [];
  return list.filter((series) =>
    visibleSettlementGraphSeriesIds.includes(getSettlementGraphSeriesId(series))
  );
}

function syncSettlementGraphSeriesSelection() {
  const allSeries = getSettlementGraphMenuSeries();
  const changed = syncSettlementGraphVisibleSeriesIds(allSeries);
  if (changed) {
    settlementGraphController?.setSeries?.(getVisibleSettlementGraphSeriesFromList(allSeries));
  }
  return allSeries;
}

function getVisibleSettlementGraphSeries() {
  const allSeries = syncSettlementGraphSeriesSelection();
  return getVisibleSettlementGraphSeriesFromList(allSeries);
}

function applySettlementGraphSeriesSelection() {
  const allSeries = getSettlementGraphMenuSeries();
  syncSettlementGraphVisibleSeriesIds(allSeries);
  settlementGraphController?.setSeries?.(getVisibleSettlementGraphSeriesFromList(allSeries));
}

function toggleSettlementGraphSeries(seriesId) {
  const safeSeriesId = typeof seriesId === "string" ? seriesId : "";
  if (!safeSeriesId) return false;
  const visible = visibleSettlementGraphSeriesIds.includes(safeSeriesId);
  if (visible) {
    if (visibleSettlementGraphSeriesIds.length <= 1) return false;
    visibleSettlementGraphSeriesIds = visibleSettlementGraphSeriesIds.filter(
      (id) => id !== safeSeriesId
    );
    return true;
  }
  if (visibleSettlementGraphSeriesIds.length >= MAX_SETTLEMENT_GRAPH_VISIBLE_SERIES) {
    return false;
  }
  visibleSettlementGraphSeriesIds = [...visibleSettlementGraphSeriesIds, safeSeriesId];
  return true;
}

function partitionSettlementGraphMenuSeries(allSeries) {
  const globals = [];
  const classSeriesByMetricAndClass = new Map();
  const classIds = [];
  const metricRows = [];
  const seenClassIds = new Set();
  const seenMetricIds = new Set();

  for (const series of Array.isArray(allSeries) ? allSeries : []) {
    if (!series || typeof series !== "object") continue;
    if (series.pickerGroup === "classMetric") {
      const classId = String(series.pickerClassId ?? "");
      const metricId = String(series.pickerMetricId ?? "");
      if (!classId || !metricId) continue;
      if (!seenClassIds.has(classId)) {
        seenClassIds.add(classId);
        classIds.push(classId);
      }
      if (!seenMetricIds.has(metricId)) {
        seenMetricIds.add(metricId);
        metricRows.push({
          id: metricId,
          label: String(series.pickerMetricLabel ?? metricId),
          shortLabel: String(series.pickerMetricShortLabel ?? series.pickerMetricLabel ?? metricId),
        });
      }
      classSeriesByMetricAndClass.set(`${metricId}|${classId}`, series);
      continue;
    }
    globals.push(series);
  }

  return {
    globals,
    classIds,
    metricRows,
    classSeriesByMetricAndClass,
  };
}

function chunkSettlementGraphMenuClassIds(classIds, chunkSize) {
  const source = Array.isArray(classIds) ? classIds : [];
  const safeChunkSize = Math.max(1, Math.floor(chunkSize ?? 1));
  const chunks = [];
  for (let i = 0; i < source.length; i += safeChunkSize) {
    chunks.push(source.slice(i, i + safeChunkSize));
  }
  return chunks;
}

function buildSettlementGraphSeriesMenuLayout(allSeries) {
  const menuSeries = partitionSettlementGraphMenuSeries(allSeries);
  const classIdChunks = chunkSettlementGraphMenuClassIds(
    menuSeries.classIds,
    SETTLEMENT_GRAPH_MENU_LAYOUT.maxClassColumnsPerBlock
  );
  const maxChunkColumns = classIdChunks.reduce(
    (maxColumns, chunk) => Math.max(maxColumns, chunk.length),
    0
  );
  const globalColumns = Math.min(
    SETTLEMENT_GRAPH_MENU_LAYOUT.globalColumns,
    Math.max(1, menuSeries.globals.length)
  );
  const globalWidth =
    SETTLEMENT_GRAPH_MENU_LAYOUT.padding * 2 +
    globalColumns * SETTLEMENT_GRAPH_MENU_LAYOUT.globalCellWidth +
    Math.max(0, globalColumns - 1) * SETTLEMENT_GRAPH_MENU_LAYOUT.classColumnGap;
  const classGridWidth =
    SETTLEMENT_GRAPH_MENU_LAYOUT.padding * 2 +
    SETTLEMENT_GRAPH_MENU_LAYOUT.metricLabelWidth +
    maxChunkColumns * SETTLEMENT_GRAPH_MENU_LAYOUT.classColumnWidth +
    Math.max(0, maxChunkColumns - 1) * SETTLEMENT_GRAPH_MENU_LAYOUT.classColumnGap;
  const width = Math.max(
    SETTLEMENT_GRAPH_MENU_RECT.width,
    globalWidth,
    classGridWidth
  );

  let height =
    SETTLEMENT_GRAPH_MENU_LAYOUT.padding +
    SETTLEMENT_GRAPH_MENU_LAYOUT.titleHeight +
    SETTLEMENT_GRAPH_MENU_LAYOUT.metaHeight;
  if (menuSeries.globals.length) {
    const globalRows = Math.ceil(
      menuSeries.globals.length / SETTLEMENT_GRAPH_MENU_LAYOUT.globalColumns
    );
    height +=
      SETTLEMENT_GRAPH_MENU_LAYOUT.sectionGap +
      SETTLEMENT_GRAPH_MENU_LAYOUT.sectionLabelHeight +
      globalRows * SETTLEMENT_GRAPH_MENU_LAYOUT.rowHeight +
      Math.max(0, globalRows - 1) * SETTLEMENT_GRAPH_MENU_LAYOUT.rowGap;
  }
  if (classIdChunks.length && menuSeries.metricRows.length) {
    height +=
      SETTLEMENT_GRAPH_MENU_LAYOUT.sectionGap +
      SETTLEMENT_GRAPH_MENU_LAYOUT.sectionLabelHeight;
    classIdChunks.forEach((chunk, index) => {
      height +=
        SETTLEMENT_GRAPH_MENU_LAYOUT.headerHeight +
        menuSeries.metricRows.length * SETTLEMENT_GRAPH_MENU_LAYOUT.rowHeight +
        Math.max(0, menuSeries.metricRows.length - 1) * SETTLEMENT_GRAPH_MENU_LAYOUT.rowGap;
      if (index < classIdChunks.length - 1) {
        height += SETTLEMENT_GRAPH_MENU_LAYOUT.blockGap;
      }
    });
  }
  height += SETTLEMENT_GRAPH_MENU_LAYOUT.padding;

  const graphRect = settlementGraphView?.getScreenRect?.() ?? null;
  const preferredX =
    graphRect && Number.isFinite(graphRect.x) && Number.isFinite(graphRect.width)
      ? Math.floor(graphRect.x + graphRect.width - width - SETTLEMENT_GRAPH_MENU_MARGIN)
      : SETTLEMENT_GRAPH_MENU_RECT.x;
  const preferredY =
    graphRect && Number.isFinite(graphRect.y)
      ? Math.floor(graphRect.y - height - 8)
      : SETTLEMENT_GRAPH_MENU_RECT.y;
  return {
    x: Math.max(
      SETTLEMENT_GRAPH_MENU_MARGIN,
      Math.min(
        preferredX,
        VIEWPORT_DESIGN_WIDTH - width - SETTLEMENT_GRAPH_MENU_MARGIN
      )
    ),
    y: Math.max(
      SETTLEMENT_GRAPH_MENU_MARGIN,
      Math.min(
        preferredY,
        VIEWPORT_DESIGN_HEIGHT - height - SETTLEMENT_GRAPH_MENU_MARGIN
      )
    ),
    width,
    height,
    menuSeries,
    classIdChunks,
  };
}

function getSettlementGraphSeriesMenuRect(allSeries) {
  return buildSettlementGraphSeriesMenuLayout(allSeries);
}

function renderSettlementGraphSeriesMenu() {
  const allSeries = syncSettlementGraphSeriesSelection();
  const menuLayout = buildSettlementGraphSeriesMenuLayout(allSeries);
  const menuRect = getSettlementGraphSeriesMenuRect(allSeries);
  const signature = JSON.stringify({
    open: settlementGraphSeriesMenuOpen,
    menuRect,
    series: allSeries.map((series) => String(series?.id ?? "")),
    visible: visibleSettlementGraphSeriesIds,
  });
  if (signature === settlementGraphSeriesMenuSignature) return;
  settlementGraphSeriesMenuSignature = signature;
  settlementGraphSeriesMenuLayer.removeChildren();
  settlementGraphSeriesMenuLayer.visible = settlementGraphSeriesMenuOpen;
  if (!settlementGraphSeriesMenuOpen) return;

  const panel = new PIXI.Graphics();
  panel.lineStyle(2, 0x4f4b48, 0.95);
  panel.beginFill(0x413834, 0.96);
  panel.drawRoundedRect(
    menuRect.x,
    menuRect.y,
    menuRect.width,
    menuRect.height,
    14
  );
  panel.endFill();
  settlementGraphSeriesMenuLayer.addChild(panel);

  let cursorY = menuRect.y + SETTLEMENT_GRAPH_MENU_LAYOUT.padding;

  const title = new PIXI.Text(
    `Series ${visibleSettlementGraphSeriesIds.length}/${MAX_SETTLEMENT_GRAPH_VISIBLE_SERIES}`,
    {
      fontFamily: "Georgia",
      fontSize: 14,
      fontWeight: "bold",
      fill: 0xf7f2e9,
    }
  );
  title.x = menuRect.x + SETTLEMENT_GRAPH_MENU_LAYOUT.padding;
  title.y = cursorY;
  settlementGraphSeriesMenuLayer.addChild(title);
  cursorY += SETTLEMENT_GRAPH_MENU_LAYOUT.titleHeight;

  const subtitle = new PIXI.Text(
    "Toggle any mix of globals and class metrics",
    {
      fontFamily: "Georgia",
      fontSize: 11,
      fill: 0xd7d0c3,
    }
  );
  subtitle.x = menuRect.x + SETTLEMENT_GRAPH_MENU_LAYOUT.padding;
  subtitle.y = cursorY;
  settlementGraphSeriesMenuLayer.addChild(subtitle);
  cursorY += SETTLEMENT_GRAPH_MENU_LAYOUT.metaHeight;

  const renderSectionLabel = (text, y) => {
    const label = new PIXI.Text(text, {
      fontFamily: "Georgia",
      fontSize: 12,
      fontWeight: "bold",
      fill: 0xd7b450,
    });
    label.x = menuRect.x + SETTLEMENT_GRAPH_MENU_LAYOUT.padding;
    label.y = y;
    settlementGraphSeriesMenuLayer.addChild(label);
  };

  const renderToggleCell = ({
    series,
    x,
    y,
    width,
    height,
    showLabel = true,
    compact = false,
  }) => {
    if (!series) return;
    const seriesId = getSettlementGraphSeriesId(series);
    if (!seriesId) return;
    const visible = visibleSettlementGraphSeriesIds.includes(seriesId);
    const atCap =
      !visible &&
      visibleSettlementGraphSeriesIds.length >= MAX_SETTLEMENT_GRAPH_VISIBLE_SERIES;
    const cell = new PIXI.Container();
    cell.eventMode = "static";
    cell.cursor = atCap ? "default" : "pointer";
    cell.hitArea = new PIXI.Rectangle(x, y, width, height);
    cell.on("pointertap", (event) => {
      event?.stopPropagation?.();
      if (!toggleSettlementGraphSeries(seriesId)) return;
      applySettlementGraphSeriesSelection();
      settlementGraphView?.render?.();
      settlementGraphSeriesMenuSignature = "";
      renderSettlementGraphSeriesMenu();
    });

    const bg = new PIXI.Graphics();
    bg.lineStyle(1, visible ? 0xd7b450 : 0x5f574e, 0.9);
    bg.beginFill(visible ? 0x5d564d : 0x4b4743, atCap ? 0.45 : 0.84);
    bg.drawRoundedRect(x, y, width, height, compact ? 8 : 10);
    bg.endFill();
    cell.addChild(bg);

    const dot = new PIXI.Graphics();
    dot.beginFill(Number.isFinite(series?.color) ? series.color : 0xd7b450, atCap ? 0.45 : 1);
    dot.drawCircle(0, 0, compact ? 5 : 6);
    dot.endFill();
    dot.x = x + 12;
    dot.y = y + Math.floor(height / 2);
    cell.addChild(dot);

    if (showLabel) {
      const label = new PIXI.Text(String(series?.label ?? seriesId), {
        fontFamily: "Georgia",
        fontSize: 12,
        fontWeight: visible ? "bold" : "normal",
        fill: atCap ? 0xa59b8c : 0xf7f2e9,
      });
      label.x = x + 24;
      label.y = y + 5;
      cell.addChild(label);
    }

    const stateText = new PIXI.Text(visible ? "On" : atCap ? "Full" : "Off", {
      fontFamily: "Georgia",
      fontSize: compact ? 10 : 11,
      fill: visible ? 0xd7b450 : atCap ? 0xa59b8c : 0xd7d0c3,
    });
    stateText.x = compact ? x + width - 22 : x + width - 28;
    stateText.y = y + (compact ? 7 : 6);
    cell.addChild(stateText);

    settlementGraphSeriesMenuLayer.addChild(cell);
  };

  if (menuLayout.menuSeries.globals.length) {
    cursorY += SETTLEMENT_GRAPH_MENU_LAYOUT.sectionGap;
    renderSectionLabel("Global", cursorY);
    cursorY += SETTLEMENT_GRAPH_MENU_LAYOUT.sectionLabelHeight;

    const globalColumns = SETTLEMENT_GRAPH_MENU_LAYOUT.globalColumns;
    const globalGap = SETTLEMENT_GRAPH_MENU_LAYOUT.classColumnGap;
    for (let i = 0; i < menuLayout.menuSeries.globals.length; i += 1) {
      const row = Math.floor(i / globalColumns);
      const col = i % globalColumns;
      renderToggleCell({
        series: menuLayout.menuSeries.globals[i],
        x:
          menuRect.x +
          SETTLEMENT_GRAPH_MENU_LAYOUT.padding +
          col * (SETTLEMENT_GRAPH_MENU_LAYOUT.globalCellWidth + globalGap),
        y:
          cursorY +
          row * (SETTLEMENT_GRAPH_MENU_LAYOUT.rowHeight + SETTLEMENT_GRAPH_MENU_LAYOUT.rowGap),
        width: SETTLEMENT_GRAPH_MENU_LAYOUT.globalCellWidth,
        height: SETTLEMENT_GRAPH_MENU_LAYOUT.rowHeight,
      });
    }
    cursorY +=
      Math.ceil(menuLayout.menuSeries.globals.length / globalColumns) *
        SETTLEMENT_GRAPH_MENU_LAYOUT.rowHeight +
      Math.max(
        0,
        Math.ceil(menuLayout.menuSeries.globals.length / globalColumns) - 1
      ) * SETTLEMENT_GRAPH_MENU_LAYOUT.rowGap;
  }

  if (menuLayout.classIdChunks.length && menuLayout.menuSeries.metricRows.length) {
    cursorY += SETTLEMENT_GRAPH_MENU_LAYOUT.sectionGap;
    renderSectionLabel("By Class", cursorY);
    cursorY += SETTLEMENT_GRAPH_MENU_LAYOUT.sectionLabelHeight;

    menuLayout.classIdChunks.forEach((classIdChunk, chunkIndex) => {
      const blockHeight =
        SETTLEMENT_GRAPH_MENU_LAYOUT.headerHeight +
        menuLayout.menuSeries.metricRows.length * SETTLEMENT_GRAPH_MENU_LAYOUT.rowHeight +
        Math.max(0, menuLayout.menuSeries.metricRows.length - 1) *
          SETTLEMENT_GRAPH_MENU_LAYOUT.rowGap;
      const blockWidth =
        SETTLEMENT_GRAPH_MENU_LAYOUT.metricLabelWidth +
        classIdChunk.length * SETTLEMENT_GRAPH_MENU_LAYOUT.classColumnWidth +
        Math.max(0, classIdChunk.length - 1) * SETTLEMENT_GRAPH_MENU_LAYOUT.classColumnGap;

      const blockBg = new PIXI.Graphics();
      blockBg.lineStyle(1, 0x5f574e, 0.85);
      blockBg.beginFill(0x4b4743, 0.58);
      blockBg.drawRoundedRect(
        menuRect.x + SETTLEMENT_GRAPH_MENU_LAYOUT.padding - 4,
        cursorY - 2,
        blockWidth + 8,
        blockHeight + 4,
        10
      );
      blockBg.endFill();
      settlementGraphSeriesMenuLayer.addChild(blockBg);

      const headerY = cursorY;
      classIdChunk.forEach((classId, index) => {
        const header = new PIXI.Text(String(classId), {
          fontFamily: "Georgia",
          fontSize: 12,
          fontWeight: "bold",
          fill: 0xf7f2e9,
        });
        header.x =
          menuRect.x +
          SETTLEMENT_GRAPH_MENU_LAYOUT.padding +
          SETTLEMENT_GRAPH_MENU_LAYOUT.metricLabelWidth +
          index *
            (SETTLEMENT_GRAPH_MENU_LAYOUT.classColumnWidth +
              SETTLEMENT_GRAPH_MENU_LAYOUT.classColumnGap);
        header.y = headerY + 2;
        settlementGraphSeriesMenuLayer.addChild(header);
      });

      let rowY = cursorY + SETTLEMENT_GRAPH_MENU_LAYOUT.headerHeight;
      for (const metricRow of menuLayout.menuSeries.metricRows) {
        const metricLabel = new PIXI.Text(metricRow.shortLabel, {
          fontFamily: "Georgia",
          fontSize: 12,
          fontWeight: "bold",
          fill: 0xd7d0c3,
        });
        metricLabel.x = menuRect.x + SETTLEMENT_GRAPH_MENU_LAYOUT.padding;
        metricLabel.y = rowY + 6;
        settlementGraphSeriesMenuLayer.addChild(metricLabel);

        classIdChunk.forEach((classId, index) => {
          const series =
            menuLayout.menuSeries.classSeriesByMetricAndClass.get(
              `${metricRow.id}|${classId}`
            ) ?? null;
          renderToggleCell({
            series,
            x:
              menuRect.x +
              SETTLEMENT_GRAPH_MENU_LAYOUT.padding +
              SETTLEMENT_GRAPH_MENU_LAYOUT.metricLabelWidth +
              index *
                (SETTLEMENT_GRAPH_MENU_LAYOUT.classColumnWidth +
                  SETTLEMENT_GRAPH_MENU_LAYOUT.classColumnGap),
            y: rowY,
            width: SETTLEMENT_GRAPH_MENU_LAYOUT.classColumnWidth,
            height: SETTLEMENT_GRAPH_MENU_LAYOUT.rowHeight,
            showLabel: false,
            compact: true,
          });
        });
        rowY +=
          SETTLEMENT_GRAPH_MENU_LAYOUT.rowHeight +
          SETTLEMENT_GRAPH_MENU_LAYOUT.rowGap;
      }

      cursorY += blockHeight;
      if (chunkIndex < menuLayout.classIdChunks.length - 1) {
        cursorY += SETTLEMENT_GRAPH_MENU_LAYOUT.blockGap;
      }
    });
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

function invalidateSettlementProjectedLossCache() {
  settlementProjectedLossCacheKey = "";
  settlementProjectedLossCacheValue = null;
}

function quantizeSettlementSecUp(value, quantumSec) {
  const safeValue = Math.max(0, Math.floor(value ?? 0));
  const quantum = Math.max(1, Math.floor(quantumSec ?? 1));
  if (safeValue <= 0) return 0;
  return Math.ceil(safeValue / quantum) * quantum;
}

function quantizeSettlementSecDown(value, quantumSec) {
  const safeValue = Math.max(0, Math.floor(value ?? 0));
  const quantum = Math.max(1, Math.floor(quantumSec ?? 1));
  return Math.floor(safeValue / quantum) * quantum;
}

function clearSettlementPendingCommitJob() {
  settlementPendingCommitJob = null;
}

function getSettlementAvailableForecastCoverageEndSec() {
  const historyEndSec = getSettlementFrontierSec();
  const graphData = settlementGraphController?.getData?.() ?? null;
  return Math.max(
    historyEndSec,
    Math.floor(graphData?.forecastCoverageEndSec ?? historyEndSec)
  );
}

function scheduleSettlementPendingCommit(frontierSec, currentVassal) {
  const safeFrontierSec = Math.max(0, Math.floor(frontierSec ?? 0));
  const deathSec = Number.isFinite(currentVassal?.deathSec)
    ? Math.max(safeFrontierSec, Math.floor(currentVassal.deathSec))
    : safeFrontierSec;
  if (deathSec <= safeFrontierSec) {
    clearSettlementPendingCommitJob();
    return;
  }
  settlementPendingCommitJob = {
    startSec: safeFrontierSec,
    deathSec,
    targetSec: deathSec,
    lastCommitMs: Number.NEGATIVE_INFINITY,
    sourceVassalId:
      typeof currentVassal?.vassalId === "string" && currentVassal.vassalId.length > 0
        ? currentVassal.vassalId
        : null,
  };
}

function clampSettlementPlaybackSpeed(speed) {
  if (!Number.isFinite(speed)) return 0;
  return Math.max(-4, Math.min(4, Number(speed)));
}

function getSettlementPreviewCapSec() {
  return Math.max(
    getSettlementFrontierSec(),
    Math.floor(settlementGraphView?.getForecastScrubCapSec?.() ?? getSettlementFrontierSec())
  );
}

function getSettlementViewedSec() {
  return Math.max(0, Math.floor(getSettlementViewedState()?.tSec ?? getSettlementFrontierSec()));
}

function ensureSettlementRunnerPaused() {
  runner.setTimeScaleTarget?.(0, { requestPause: true });
  if (runner.getCursorState?.()?.paused !== true && !(runner.getPreviewStatus?.()?.active)) {
    const currentSec = Math.max(0, Math.floor(runner.getCursorState?.()?.tSec ?? getSettlementFrontierSec()));
    runner.browseCursorSecond?.(currentSec);
  }
}

function setSettlementPlaybackTarget(speed) {
  const next = clampSettlementPlaybackSpeed(speed);
  settlementPlaybackSpeedTarget = next;
  settlementPlaybackSpeedCurrent = next;
  if (next !== 0 && !Number.isFinite(settlementPlaybackViewSec)) {
    settlementPlaybackViewSec = getSettlementViewedSec();
  }
  if (next === 0) {
    settlementPlaybackViewSec = getSettlementViewedSec();
    ensureSettlementRunnerPaused();
  }
  return { ok: true, target: next };
}

function getSettlementPlaybackState() {
  return {
    current: settlementPlaybackSpeedCurrent,
    target: settlementPlaybackSpeedTarget,
    max: 4,
  };
}

function getSettlementAuthoritativeState() {
  return runner?.getCursorState?.() ?? runner?.getState?.() ?? null;
}

function getSettlementViewedState() {
  return runner?.getState?.() ?? runner?.getCursorState?.() ?? null;
}

function getSettlementFrontierSec() {
  return Math.max(0, Math.floor(runner?.getTimeline?.()?.historyEndSec ?? 0));
}

function getSettlementFrontierState() {
  const frontierSec = getSettlementFrontierSec();
  const cursorSec = Math.max(0, Math.floor(runner?.getCursorState?.()?.tSec ?? 0));
  if (cursorSec === frontierSec) {
    return getSettlementAuthoritativeState();
  }
  return settlementGraphController?.getStateAt?.(frontierSec) ?? getSettlementAuthoritativeState();
}

function setSettlementViewedSecond(tSec) {
  const frontierSec = getSettlementFrontierSec();
  const previewCapSec = getSettlementPreviewCapSec();
  const boundedTargetSec = Math.max(0, Math.min(Number(tSec ?? 0), previewCapSec));
  settlementPlaybackViewSec = boundedTargetSec;
  const safeTargetSec = Math.floor(boundedTargetSec);
  if (safeTargetSec <= frontierSec) {
    runner.clearPreviewState?.();
    return runner.browseCursorSecond?.(safeTargetSec);
  }
  const previewState = settlementGraphController?.getStateAt?.(safeTargetSec) ?? null;
  if (!previewState) {
    return { ok: false, reason: "previewUnavailable" };
  }
  const cursorSec = Math.max(0, Math.floor(runner.getCursorState?.()?.tSec ?? frontierSec));
  if (cursorSec !== frontierSec) {
    runner.browseCursorSecond?.(frontierSec);
  }
  runner.setPreviewState?.(previewState);
  return { ok: true, tSec: safeTargetSec, preview: true };
}

function returnSettlementViewToPresent(targetSec = null) {
  setSettlementPlaybackTarget(0);
  runner.clearPreviewState?.();
  settlementGraphView?.resetForecastPreviewState?.();
  const frontierSec = getSettlementFrontierSec();
  const safeTargetSec = Number.isFinite(targetSec)
    ? Math.max(0, Math.min(Math.floor(targetSec), frontierSec))
    : frontierSec;
  settlementPlaybackViewSec = safeTargetSec;
  return runner.browseCursorSecond?.(safeTargetSec);
}

function getEffectiveSettlementGraphHorizonSec() {
  return settlementGraphHorizonOverrideSec ?? SETTLEMENT_GRAPH_WINDOW_SEC;
}

function setSettlementGraphHorizonOverride(nextHorizonSec) {
  const normalized = Number.isFinite(nextHorizonSec)
    ? Math.max(1, Math.floor(nextHorizonSec))
    : null;
  if (normalized === settlementGraphHorizonOverrideSec) return;
  settlementGraphHorizonOverrideSec = normalized;
  invalidateSettlementProjectedLossCache();
  settlementGraphController?.setHorizonSecOverride?.(normalized);
}

function isSettlementStateRunComplete(state) {
  return state?.runStatus?.complete === true;
}

function getSettlementLossYearAtSecond(state, tSec) {
  const yearDurationSec = Math.max(1, getSettlementYearDurationSec(state));
  return 1 + Math.floor(Math.max(0, Math.floor(tSec ?? 0)) / yearDurationSec);
}

function getActiveSettlementPendingCommitTargetSec(historyEndSec = getSettlementFrontierSec()) {
  const job = settlementPendingCommitJob;
  if (!job) return null;
  const historyEnd = Math.max(0, Math.floor(historyEndSec ?? 0));
  const targetSec = Number.isFinite(job?.targetSec)
    ? Math.max(historyEnd, Math.floor(job.targetSec))
    : Number.isFinite(job?.deathSec)
      ? Math.max(historyEnd, Math.floor(job.deathSec))
      : null;
  if (targetSec == null || targetSec <= historyEnd) return null;
  return targetSec;
}

function findSettlementLossInfoWithinRange(
  startSec,
  endSec,
  frontierState = getSettlementFrontierState()
) {
  const state = frontierState ?? null;
  if (!state) {
    return { lossSec: null, lossYear: null, resolved: false };
  }
  const lowStartSec = Math.max(0, Math.floor(startSec ?? 0));
  const highEndSec = Math.max(lowStartSec, Math.floor(endSec ?? lowStartSec));
  if (highEndSec <= lowStartSec) {
    return { lossSec: null, lossYear: null, resolved: false };
  }

  const stateAtEnd = settlementGraphController?.getStateAt?.(highEndSec) ?? null;
  if (!isSettlementStateRunComplete(stateAtEnd)) {
    return { lossSec: null, lossYear: null, resolved: false };
  }

  let lowSec = lowStartSec;
  let highSec = highEndSec;
  while (lowSec + 1 < highSec) {
    const midSec = lowSec + Math.floor((highSec - lowSec) * 0.5);
    const stateAtMid = settlementGraphController?.getStateAt?.(midSec) ?? null;
    if (isSettlementStateRunComplete(stateAtMid)) {
      highSec = midSec;
    } else {
      lowSec = midSec;
    }
  }

  const lossState = settlementGraphController?.getStateAt?.(highSec) ?? stateAtEnd;
  const exactLossSec = Number.isFinite(lossState?.runStatus?.tSec)
    ? Math.max(lowStartSec, Math.floor(lossState.runStatus.tSec))
    : highSec;
  return {
    lossSec: exactLossSec,
    lossYear: Number.isFinite(lossState?.runStatus?.year)
      ? Math.max(1, Math.floor(lossState.runStatus.year))
      : getSettlementLossYearAtSecond(state, exactLossSec),
    resolved: true,
  };
}

function getProjectedSettlementLossInfo({ deferDuringPendingCommit = true } = {}) {
  const timeline = runner?.getTimeline?.();
  if (!timeline) {
    return { lossSec: null, lossYear: null, resolved: false };
  }
  settlementGraphController?.ensureCache?.();
  const historyEndSec = getSettlementFrontierSec();
  const availableCoverageEndSec = getSettlementAvailableForecastCoverageEndSec();
  const revisionHistoryKey = [
    Math.floor(timeline?.revision ?? 0),
    historyEndSec,
  ].join("|");
  const resolvedCacheKey = `${revisionHistoryKey}|resolved`;
  if (
    settlementProjectedLossCacheKey === resolvedCacheKey &&
    settlementProjectedLossCacheValue?.resolved === true
  ) {
    return settlementProjectedLossCacheValue;
  }

  const frontierState = getSettlementFrontierState();
  if (!frontierState) {
    const fallback = { lossSec: null, lossYear: null, resolved: false };
    settlementProjectedLossCacheKey = `${revisionHistoryKey}|missingFrontier`;
    settlementProjectedLossCacheValue = fallback;
    return fallback;
  }

  if (isSettlementStateRunComplete(frontierState)) {
    const lossSec = Number.isFinite(frontierState?.runStatus?.tSec)
      ? Math.max(0, Math.floor(frontierState.runStatus.tSec))
      : historyEndSec;
    const lossYear = Number.isFinite(frontierState?.runStatus?.year)
      ? Math.max(1, Math.floor(frontierState.runStatus.year))
      : getSettlementLossYearAtSecond(frontierState, lossSec);
    const resolved = {
      lossSec,
      lossYear,
      resolved: true,
    };
    settlementProjectedLossCacheKey = resolvedCacheKey;
    settlementProjectedLossCacheValue = resolved;
    return resolved;
  }

  const pendingCommitTargetSec =
    deferDuringPendingCommit === true
      ? getActiveSettlementPendingCommitTargetSec(historyEndSec)
      : null;
  if (pendingCommitTargetSec != null) {
    const deferred = { lossSec: null, lossYear: null, resolved: false };
    settlementProjectedLossCacheKey = `${revisionHistoryKey}|pending|${pendingCommitTargetSec}`;
    settlementProjectedLossCacheValue = deferred;
    return deferred;
  }

  const yearDurationSec = Math.max(1, getSettlementYearDurationSec(frontierState));
  const currentYear = Number.isFinite(frontierState?.year)
    ? Math.max(1, Math.floor(frontierState.year))
    : getSettlementLossYearAtSecond(frontierState, historyEndSec);
  const searchLimitSec = Math.min(
    availableCoverageEndSec,
    historyEndSec + Math.max(
      SETTLEMENT_GRAPH_LOSS_SEARCH_CAPACITY_SEC,
      getEffectiveSettlementGraphHorizonSec()
    )
  );
  const unresolvedCacheKey = `${revisionHistoryKey}|unresolved|${quantizeSettlementSecDown(
    searchLimitSec,
    SETTLEMENT_EXACT_LOSS_SEARCH_BUCKET_SEC
  )}`;
  if (
    settlementProjectedLossCacheKey === unresolvedCacheKey &&
    settlementProjectedLossCacheValue
  ) {
    return settlementProjectedLossCacheValue;
  }
  if (searchLimitSec <= historyEndSec) {
    const unresolved = { lossSec: null, lossYear: null, resolved: false };
    settlementProjectedLossCacheKey = unresolvedCacheKey;
    settlementProjectedLossCacheValue = unresolved;
    return unresolved;
  }

  let lowSec = historyEndSec;
  let highSec = null;
  for (
    let year = currentYear + 1;
    getSettlementLossYearAtSecond(frontierState, (year - 1) * yearDurationSec) <=
      getSettlementLossYearAtSecond(frontierState, searchLimitSec);
    year += 1
  ) {
    const boundarySec = Math.min(searchLimitSec, Math.max(0, (year - 1) * yearDurationSec));
    if (boundarySec <= lowSec) continue;
    const stateAtBoundary = settlementGraphController?.getStateAt?.(boundarySec) ?? null;
    if (isSettlementStateRunComplete(stateAtBoundary)) {
      highSec = boundarySec;
      break;
    }
    if (boundarySec >= searchLimitSec) break;
  }
  if (highSec == null) {
    const stateAtLimit = settlementGraphController?.getStateAt?.(searchLimitSec) ?? null;
    if (isSettlementStateRunComplete(stateAtLimit)) {
      highSec = searchLimitSec;
    }
  }

  if (highSec == null) {
    const unresolved = { lossSec: null, lossYear: null, resolved: false };
    settlementProjectedLossCacheKey = unresolvedCacheKey;
    settlementProjectedLossCacheValue = unresolved;
    return unresolved;
  }

  while (lowSec + 1 < highSec) {
    const midSec = lowSec + Math.floor((highSec - lowSec) * 0.5);
    const stateAtMid = settlementGraphController?.getStateAt?.(midSec) ?? null;
    if (isSettlementStateRunComplete(stateAtMid)) {
      highSec = midSec;
    } else {
      lowSec = midSec;
    }
  }

  const lossState = settlementGraphController?.getStateAt?.(highSec) ?? null;
  const exactLossSec = Number.isFinite(lossState?.runStatus?.tSec)
    ? Math.max(historyEndSec, Math.floor(lossState.runStatus.tSec))
    : highSec;
  const resolved = {
    lossSec: exactLossSec,
    lossYear: Number.isFinite(lossState?.runStatus?.year)
      ? Math.max(1, Math.floor(lossState.runStatus.year))
      : getSettlementLossYearAtSecond(frontierState, exactLossSec),
    resolved: true,
  };
  settlementProjectedLossCacheKey = resolvedCacheKey;
  settlementProjectedLossCacheValue = resolved;
  return resolved;
}

function getSettlementDynamicDisplayLossSec(state = getSettlementFrontierState()) {
  if (!state) return null;
  const frontierSec = getSettlementFrontierSec();
  const yearDurationSec = Math.max(1, getSettlementYearDurationSec(state));
  const revealedForecastSec = Math.max(
    frontierSec,
    Math.floor(settlementGraphView?.getForecastScrubCapSec?.() ?? frontierSec)
  );
  const bufferSec =
    Math.max(1, yearDurationSec) * Math.max(1, Math.floor(SETTLEMENT_DYNAMIC_DISPLAY_BUFFER_YEARS));
  return Math.max(frontierSec, revealedForecastSec + bufferSec);
}

function getDisplayedSettlementLossInfo() {
  const exactLossInfo = getProjectedSettlementLossInfo();
  const frontierState = getSettlementFrontierState();
  if (!frontierState) {
    return exactLossInfo?.resolved === true
      ? exactLossInfo
      : { lossSec: null, lossYear: null, resolved: false };
  }
  const frontierSec = getSettlementFrontierSec();
  const dynamicDisplayLossSec = getSettlementDynamicDisplayLossSec(frontierState);
  if (exactLossInfo?.resolved !== true) {
    if (!Number.isFinite(dynamicDisplayLossSec)) {
      return { lossSec: null, lossYear: null, resolved: false };
    }
    return {
      lossSec: Math.max(frontierSec, Math.floor(dynamicDisplayLossSec)),
      lossYear: getSettlementLossYearAtSecond(frontierState, dynamicDisplayLossSec),
      resolved: false,
      finalLossSec: null,
      finalLossYear: null,
    };
  }
  const uncappedResolvedLossSec = Math.max(
    frontierSec,
    Math.floor(exactLossInfo?.lossSec ?? frontierSec)
  );
  const displayedLossSec = Number.isFinite(dynamicDisplayLossSec)
    ? Math.max(
        frontierSec,
        Math.min(
          uncappedResolvedLossSec,
          Math.floor(dynamicDisplayLossSec)
        )
      )
    : uncappedResolvedLossSec;
  return {
    lossSec: displayedLossSec,
    lossYear: getSettlementLossYearAtSecond(frontierState, displayedLossSec),
    resolved: true,
    finalLossSec: Number.isFinite(exactLossInfo?.lossSec)
      ? Math.floor(exactLossInfo.lossSec)
      : null,
    finalLossYear: Number.isFinite(exactLossInfo?.lossYear)
      ? Math.floor(exactLossInfo.lossYear)
      : null,
  };
}

function shouldResumeAfterBlockingVassalSelection(state = getSettlementAuthoritativeState()) {
  return clampSettlementPlaybackSpeed(settlementPlaybackSpeedTarget) !== 0;
}

function getSettlementVisibleVassalTimeSec(state = null) {
  const currentState = state ?? runner?.getState?.() ?? null;
  const committedSec = Math.max(0, Math.floor(currentState?.tSec ?? 0));
  const currentVassal = getSettlementCurrentVassal(currentState);
  if (!currentVassal) return committedSec;
  const revealedSec = settlementGraphView?.getForecastScrubCapSec?.() ?? committedSec;
  const visibleSec = Math.max(committedSec, Math.floor(revealedSec ?? committedSec));
  const deathSec = Number.isFinite(currentVassal?.deathSec)
    ? Math.max(0, Math.floor(currentVassal.deathSec))
    : null;
  if (deathSec == null) return visibleSec;
  return Math.min(visibleSec, deathSec);
}

function getSettlementRenderedHistoryEndSec({
  actualHistoryEndSec = null,
  displayHistoryEndSec = null,
  visibleForecastCoverageEndSec = null,
} = {}) {
  const safeActualHistoryEndSec = Number.isFinite(actualHistoryEndSec)
    ? Math.max(0, Math.floor(actualHistoryEndSec))
    : getSettlementFrontierSec();
  const safeDisplayHistoryEndSec = Number.isFinite(displayHistoryEndSec)
    ? Math.max(0, Math.floor(displayHistoryEndSec))
    : safeActualHistoryEndSec;
  const safeVisibleForecastCoverageEndSec = Number.isFinite(visibleForecastCoverageEndSec)
    ? Math.max(safeDisplayHistoryEndSec, Math.floor(visibleForecastCoverageEndSec))
    : safeDisplayHistoryEndSec;
  const frontierState = getSettlementFrontierState();
  const currentVassal = getSettlementCurrentVassal(frontierState);
  if (!currentVassal) {
    return safeDisplayHistoryEndSec;
  }
  const deathSec = Number.isFinite(currentVassal?.deathSec)
    ? Math.max(0, Math.floor(currentVassal.deathSec))
    : null;
  if (deathSec == null) {
    return safeVisibleForecastCoverageEndSec;
  }
  return Math.max(
    safeDisplayHistoryEndSec,
    Math.min(safeVisibleForecastCoverageEndSec, deathSec)
  );
}

function syncSettlementGraphRevealConfig() {
  const nextMode = settlementPendingCommitJob ? "pendingCommit" : "default";
  if (nextMode === settlementGraphRevealMode) return;
  settlementGraphRevealMode = nextMode;
  settlementGraphView?.setForecastRevealConfig?.(
    nextMode === "pendingCommit"
      ? SETTLEMENT_GRAPH_REVEAL_PENDING_COMMIT
      : SETTLEMENT_GRAPH_REVEAL_DEFAULT
  );
}

function syncSettlementGraphHorizon() {
  const frontierState = getSettlementFrontierState();
  const historyEndSec = getSettlementFrontierSec();
  const latestDeathSec = getSettlementLatestSelectedVassalDeathSec(frontierState);
  const pendingCommitTargetSec = getActiveSettlementPendingCommitTargetSec(historyEndSec);
  const visibleForecastCoverageEndSec = Math.max(
    historyEndSec,
    Math.floor(settlementGraphView?.getForecastScrubCapSec?.() ?? historyEndSec)
  );
  if (pendingCommitTargetSec != null) {
    const requiredHorizonSec = Math.max(
      0,
      latestDeathSec - historyEndSec,
      pendingCommitTargetSec - historyEndSec,
      visibleForecastCoverageEndSec - historyEndSec
    );
    const quantizedRequiredHorizonSec = quantizeSettlementSecUp(
      requiredHorizonSec,
      SETTLEMENT_HORIZON_UPDATE_QUANTUM_SEC
    );
    setSettlementGraphHorizonOverride(
      quantizedRequiredHorizonSec > SETTLEMENT_GRAPH_WINDOW_SEC
        ? quantizedRequiredHorizonSec
        : null
    );
    return;
  }
  const projectedLossInfo = getProjectedSettlementLossInfo();
  const displayedLossInfo = getDisplayedSettlementLossInfo();
  const dynamicRequestBufferSec =
    Math.max(1, getSettlementYearDurationSec(frontierState)) *
    Math.max(1, Math.floor(SETTLEMENT_DYNAMIC_DISPLAY_BUFFER_YEARS));
  const projectedLossSec = Number.isFinite(projectedLossInfo?.lossSec)
    ? Math.max(0, Math.floor(projectedLossInfo.lossSec))
    : 0;
  const displayedLossSec = Number.isFinite(displayedLossInfo?.lossSec)
    ? Math.max(0, Math.floor(displayedLossInfo.lossSec))
    : 0;
  const requiredHorizonSec =
    projectedLossInfo?.resolved === true
      ? Math.max(
          0,
          latestDeathSec - historyEndSec,
          projectedLossSec - historyEndSec
        )
      : Math.max(
          0,
          latestDeathSec - historyEndSec,
          projectedLossSec - historyEndSec,
          displayedLossSec - historyEndSec + dynamicRequestBufferSec,
          visibleForecastCoverageEndSec - historyEndSec + SETTLEMENT_GRAPH_WINDOW_SEC
        );
  const quantizedRequiredHorizonSec = quantizeSettlementSecUp(
    requiredHorizonSec,
    SETTLEMENT_HORIZON_UPDATE_QUANTUM_SEC
  );
  setSettlementGraphHorizonOverride(
    quantizedRequiredHorizonSec > SETTLEMENT_GRAPH_WINDOW_SEC
      ? quantizedRequiredHorizonSec
      : null
  );
}

function processSettlementPendingCommit() {
  const job = settlementPendingCommitJob;
  if (!job) return;

  const historyEndSec = getSettlementFrontierSec();
  const frontierState = getSettlementFrontierState();
  if (!frontierState) {
    settlementGraphView?.clearForecastRevealRestart?.();
    clearSettlementPendingCommitJob();
    return;
  }

  if (isSettlementStateRunComplete(frontierState)) {
    settlementGraphView?.clearForecastRevealRestart?.();
    clearSettlementPendingCommitJob();
    return;
  }

  const currentVassal = getSettlementCurrentVassal(frontierState);
  if (!currentVassal) {
    settlementGraphView?.clearForecastRevealRestart?.();
    clearSettlementPendingCommitJob();
    return;
  }

  if (
    job.sourceVassalId &&
    typeof currentVassal?.vassalId === "string" &&
    currentVassal.vassalId !== job.sourceVassalId
  ) {
    settlementGraphView?.clearForecastRevealRestart?.();
    clearSettlementPendingCommitJob();
    return;
  }

  const pendingTargetSec = getActiveSettlementPendingCommitTargetSec(historyEndSec);
  const finalTargetSec =
    pendingTargetSec != null
      ? pendingTargetSec
      : Math.max(historyEndSec, Math.floor(job?.deathSec ?? historyEndSec));
  job.targetSec = finalTargetSec;

  if (historyEndSec >= finalTargetSec) {
    settlementGraphView?.clearForecastRevealRestart?.();
    clearSettlementPendingCommitJob();
    return;
  }

  const visibleForecastCoverageEndSec = Math.max(
    historyEndSec,
    Math.floor(settlementGraphView?.getForecastScrubCapSec?.() ?? historyEndSec)
  );
  const bufferedRevealCommitCapSec = Math.max(
    historyEndSec,
    visibleForecastCoverageEndSec - SETTLEMENT_AUTO_COMMIT_BUFFER_SEC
  );
  const desiredCommitSec = Math.min(finalTargetSec, bufferedRevealCommitCapSec);
  if (desiredCommitSec <= historyEndSec) {
    return;
  }

  const nowMs =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  const lastCommitMs = Number.isFinite(job?.lastCommitMs)
    ? Number(job.lastCommitMs)
    : Number.NEGATIVE_INFINITY;
  const revealLagSec = Math.max(0, desiredCommitSec - historyEndSec);
  if (
    nowMs - lastCommitMs < SETTLEMENT_AUTO_COMMIT_MIN_INTERVAL_MS &&
    revealLagSec < SETTLEMENT_AUTO_COMMIT_FORCE_LAG_SEC
  ) {
    return;
  }

  let commitTargetSec = Math.min(
    finalTargetSec,
    historyEndSec + SETTLEMENT_AUTO_COMMIT_CHUNK_SEC,
    desiredCommitSec
  );
  if (commitTargetSec <= historyEndSec) {
    return;
  }

  const chunkLossInfo = findSettlementLossInfoWithinRange(
    historyEndSec,
    commitTargetSec,
    frontierState
  );
  if (chunkLossInfo?.resolved === true && Number.isFinite(chunkLossInfo?.lossSec)) {
    const resolvedLossSec = Math.max(historyEndSec, Math.floor(chunkLossInfo.lossSec));
    job.targetSec = Math.min(finalTargetSec, resolvedLossSec);
    commitTargetSec = Math.min(commitTargetSec, resolvedLossSec);
  }
  if (commitTargetSec <= historyEndSec) {
    return;
  }

  const viewedSec = getSettlementViewedSec();
  const commitRes = runner.commitCursorSecond?.(commitTargetSec);
  if (commitRes?.ok !== true) {
    return;
  }
  job.lastCommitMs = nowMs;
  const clampedViewedSec = Math.max(0, Math.min(viewedSec, getSettlementFrontierSec()));
  settlementPlaybackViewSec = clampedViewedSec;
  runner.clearPreviewState?.();
  runner.browseCursorSecond?.(clampedViewedSec);
  invalidateSettlementProjectedLossCache();

  const committedState = getSettlementFrontierState();
  if (
    isSettlementStateRunComplete(committedState) ||
    (getSettlementCurrentVassal(committedState)?.isDead === true &&
      getSettlementFrontierSec() >= finalTargetSec)
  ) {
    settlementGraphView?.clearForecastRevealRestart?.();
    clearSettlementPendingCommitJob();
  }
}

function syncSettlementVassalSelectionPauseState() {
  const selectionOpen = !!settlementPendingVassalSelection;
  if (selectionOpen && !settlementVassalSelectionWasOpen) {
    if (!Number.isFinite(settlementVassalSelectionResumeSpeed)) {
      settlementVassalSelectionResumeSpeed = 0;
    }
    if (settlementVassalSelectionResumeSpeed === 0) {
      settlementVassalSelectionResumeSpeed = shouldResumeAfterBlockingVassalSelection() ? settlementPlaybackSpeedTarget : 0;
    }
    requestPauseBeforeDrag();
  }
  if (!selectionOpen && settlementVassalSelectionWasOpen) {
    const resumeSpeed = Number.isFinite(settlementVassalSelectionResumeSpeed)
      ? settlementVassalSelectionResumeSpeed
      : 0;
    settlementVassalSelectionResumeSpeed = 0;
    if (resumeSpeed !== 0) {
      setSettlementPlaybackTarget(resumeSpeed);
    }
  }
  settlementVassalSelectionWasOpen = selectionOpen;
  return selectionOpen;
}

function openNextSettlementVassalSelection() {
  const frontierState = getSettlementFrontierState();
  const frontierSec = getSettlementFrontierSec();
  const currentVassal = getSettlementCurrentVassal(frontierState);
  if (isSettlementStateRunComplete(frontierState)) {
    return { ok: false, reason: "runComplete" };
  }
  if (currentVassal && currentVassal.isDead !== true) {
    return { ok: false, reason: "currentVassalAlive" };
  }
  settlementVassalSelectionResumeSpeed = shouldResumeAfterBlockingVassalSelection()
    ? settlementPlaybackSpeedTarget
    : 0;
  requestPauseBeforeDrag();
  setSettlementViewedSecond(frontierSec);
  settlementGraphView?.resetForecastPreviewState?.();
  settlementPendingVassalSelection = buildSettlementVassalSelectionPool(frontierState, frontierSec);
  const result = settlementPendingVassalSelection
    ? { ok: true, poolId: settlementPendingVassalSelection.poolId }
    : { ok: false, reason: "poolFailed" };
  if (!result?.ok) settlementVassalSelectionResumeSpeed = 0;
  syncSettlementVassalSelectionPauseState();
  return result;
}

function selectSettlementVassal(candidateIndex) {
  const frontierSec = getSettlementFrontierSec();
  const selectionPool = settlementPendingVassalSelection;
  setSettlementViewedSecond(frontierSec);
  settlementGraphView?.resetForecastPreviewState?.();
  const result = runner.dispatchActionAtCurrentSecond?.(
    ActionKinds.SETTLEMENT_SELECT_VASSAL,
    {
      candidateIndex,
      expectedPoolHash: selectionPool?.expectedPoolHash ?? null,
      tSec: frontierSec,
    }
  );
  if (result?.ok) {
    settlementPendingVassalSelection = null;
    invalidateSettlementProjectedLossCache();
    const frontierState = getSettlementFrontierState();
    const currentVassal = getSettlementCurrentVassal(frontierState);
    scheduleSettlementPendingCommit(frontierSec, currentVassal);
    syncSettlementGraphHorizon();
    settlementGraphView?.restartForecastRevealFrom?.(frontierSec);
    returnSettlementViewToPresent(frontierSec);
    settlementVassalSelectionResumeSpeed = 0;
    syncSettlementVassalSelectionPauseState();
  } else if (result?.reason === "selectionPoolMismatch") {
    settlementPendingVassalSelection = buildSettlementVassalSelectionPool(getSettlementFrontierState(), frontierSec);
  }
  return result;
}

function getSettlementJumpToDeathState() {
  const frontierState = getSettlementFrontierState();
  if (isSettlementStateRunComplete(frontierState)) {
    const endSec = Number.isFinite(frontierState?.runStatus?.tSec)
      ? Math.max(0, Math.floor(frontierState.runStatus.tSec))
      : getSettlementFrontierSec();
    const currentSec = getSettlementViewedSec();
    return {
      enabled: endSec > 0 && endSec !== currentSec,
      label: "Jump to End",
    };
  }
  const state = getSettlementViewedState();
  const currentVassal = getSettlementCurrentVassal(state);
  const deathSec = Math.max(0, Math.floor(currentVassal?.deathSec ?? 0));
  const currentSec = Math.max(0, Math.floor(state?.tSec ?? 0));
  const historyEndSec = getSettlementFrontierSec();
  return {
    enabled:
      !!currentVassal &&
      deathSec > 0 &&
      deathSec <= historyEndSec &&
      deathSec !== currentSec,
    label: "Jump to Death",
  };
}

function jumpCurrentVassalToDeath() {
  const frontierState = getSettlementFrontierState();
  if (isSettlementStateRunComplete(frontierState)) {
    const endSec = Number.isFinite(frontierState?.runStatus?.tSec)
      ? Math.max(0, Math.floor(frontierState.runStatus.tSec))
      : getSettlementFrontierSec();
    return setSettlementViewedSecond(endSec);
  }
  const state = getSettlementViewedState();
  const currentVassal = getSettlementCurrentVassal(state);
  const deathSec = Math.max(0, Math.floor(currentVassal?.deathSec ?? 0));
  if (!currentVassal || deathSec <= 0) return { ok: false, reason: "noCurrentVassalDeath" };
  return setSettlementViewedSecond(deathSec);
}

function getSettlementPrimaryVassalState() {
  const frontierState = getSettlementFrontierState();
  const hasPendingSelection = !!settlementPendingVassalSelection;
  const hasSelectedVassal = !!getSettlementFirstSelectedVassal(frontierState);
  const currentVassal = getSettlementCurrentVassal(frontierState);
  const runComplete = isSettlementStateRunComplete(frontierState);
  const runCompleteEntry = getLatestRunCompleteEntry(frontierState);
  const validInsertionPoint =
    !hasSelectedVassal || !currentVassal || currentVassal.isDead === true;
  if (runComplete) {
    return {
      enabled: !!runCompleteEntry,
      label: "Gameover",
    };
  }
  return {
    enabled: hasPendingSelection !== true && runComplete !== true && validInsertionPoint,
    label: hasSelectedVassal ? "Next Vassal" : "Intervene",
  };
}

function getSettlementLossInfoForDisplay() {
  const lossInfo = getDisplayedSettlementLossInfo();
  const candidateYears = [
    Number.isFinite(lossInfo?.lossYear) ? Math.floor(lossInfo.lossYear) : null,
    Number.isFinite(lossInfo?.finalLossYear) ? Math.floor(lossInfo.finalLossYear) : null,
  ].filter((value) => value != null);
  if (candidateYears.length > 0) {
    const bestKnownYear = candidateYears.reduce(
      (maxYear, value) => Math.max(maxYear, value),
      0
    );
    settlementMaxObservedLossYear =
      settlementMaxObservedLossYear == null
        ? bestKnownYear
        : Math.max(settlementMaxObservedLossYear, bestKnownYear);
  }
  return {
    ...lossInfo,
    maxLossYear:
      settlementMaxObservedLossYear == null
        ? null
        : Math.max(1, Math.floor(settlementMaxObservedLossYear)),
  };
}

function getLatestRunCompleteEntry(state = runner?.getState?.() ?? null) {
  const feed = Array.isArray(state?.gameEventFeed) ? state.gameEventFeed : [];
  for (let index = feed.length - 1; index >= 0; index -= 1) {
    const entry = feed[index];
    if (entry?.type === "runComplete") return entry;
  }
  if (state?.runStatus?.complete === true) {
    const runYear = Number.isFinite(state?.runStatus?.year)
      ? Math.max(1, Math.floor(state.runStatus.year))
      : Number.isFinite(state?.year)
        ? Math.max(1, Math.floor(state.year))
        : 1;
    const runSec = Number.isFinite(state?.runStatus?.tSec)
      ? Math.max(0, Math.floor(state.runStatus.tSec))
      : Math.max(0, Math.floor(state?.tSec ?? 0));
    const runReason =
      typeof state?.runStatus?.reason === "string" && state.runStatus.reason.length > 0
        ? state.runStatus.reason
        : "unknown";
    return {
      id: null,
      type: "runComplete",
      tSec: runSec,
      text: `Civilization lasted until Year ${runYear}.`,
      data: {
        runComplete: true,
        year: runYear,
        reason: runReason,
      },
    };
  }
  return null;
}

function openSettlementRunCompleteOverlay() {
  const latestEntry = getLatestRunCompleteEntry(getSettlementFrontierState());
  if (!latestEntry) return { ok: false, reason: "noRunCompleteEntry" };
  return runCompleteView?.openForEntry?.(latestEntry, { source: "settlement" }) ?? {
    ok: false,
    reason: "overlayUnavailable",
  };
}

function syncSettlementRunCompletePresentation() {
  const viewedState = getSettlementViewedState();
  runCompleteView?.setBackdropVisible?.(isSettlementStateRunComplete(viewedState));
}

const runner = createSimRunner({
  setupId: BOOT_SETUP_ID,
  onInvalidate: (reason) => {
    if (shouldInvalidateSettlementTimelineForecast(reason)) {
      forecastWorkerService.handleTimelineInvalidation?.(reason);
      settlementGraphController?.handleInvalidate?.(reason);
    }
    invalidateSettlementProjectedLossCache();
    syncSettlementGraphHorizon();
    prototypeView?.refresh?.();
  },
  onRebuildViews: () => {
    invalidateSettlementProjectedLossCache();
    syncSettlementGraphHorizon();
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
visibleSettlementGraphSeriesIds = getSettlementGraphDefaultSeriesIds();
applySettlementGraphSeriesSelection();

prototypeView = createSettlementPrototypeView({
  app,
  layer: playfieldLayer,
  getState: () => runner.getState?.(),
  getCivilizationLossInfo: () => getSettlementLossInfoForDisplay(),
  getSelectedPracticeClassId: () => selectedPracticeClassId,
  getVisibleVassalTimeSec: (state) => getSettlementVisibleVassalTimeSec(state),
  tooltipView,
  setSelectedPracticeClassId: (classId) => {
    selectedPracticeClassId = typeof classId === "string" && classId.length > 0 ? classId : "villager";
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
  getGameState: () => ({
    ...(getSettlementViewedState() ?? {}),
    paused: settlementPlaybackSpeedTarget === 0,
  }),
  togglePause,
  isPausePending: () => false,
  getCommitPreviewState: () => ({ visible: false, enabled: false }),
  onCommitPreview: () => ({ ok: false, reason: "settlementPreviewOnly" }),
  getReturnToPresentState: () => ({ visible: false, enabled: false, targetSec: null }),
  onReturnToPresent: () => ({ ok: false, reason: "settlementNoReturnButton" }),
  getTimeScale: () => getSettlementPlaybackState(),
  setTimeScaleTarget: (speed) => setSettlementPlaybackTarget(speed),
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
  getState: () => getSettlementViewedState(),
  getTimeline: () => runner.getTimeline?.(),
  getEditableHistoryBounds: () => runner.getEditableHistoryBounds?.(),
  getForecastPreviewCapSec: () => getSettlementPreviewCapSec(),
  browseCursorSecond: (tSec) => setSettlementViewedSecond(tSec),
  commitCursorSecond: (tSec) => setSettlementViewedSecond(tSec),
  previewCursorSecond: (tSec) => setSettlementViewedSecond(tSec),
  clearPreviewState: () => runner.clearPreviewState?.(),
  commitPreviewToLive: () => ({ ok: true, previewOnly: true }),
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
  commitSecond: (tSec) => setSettlementViewedSecond(tSec),
  getWindowSpec: ({ timeline, cursorState, zoomed }) => {
    const preview = runner.getPreviewStatus?.();
    const frontierState = getSettlementFrontierState();
    const firstSelectedVassal = getSettlementFirstSelectedVassal(frontierState);
    const currentVassal = getSettlementCurrentVassal(frontierState);
    const displayedLossInfo = getDisplayedSettlementLossInfo();
    return computeSettlementGraphWindowSpec({
      historyEndSec: timeline?.historyEndSec,
      cursorSec: cursorState?.tSec,
      forecastPreviewSec: preview?.isForecastPreview ? preview.previewSec : null,
      horizonSec: SETTLEMENT_GRAPH_WINDOW_SEC,
      zoomed,
      lineageStartSec: firstSelectedVassal?.birthSec ?? null,
      currentVassalStartSec: currentVassal?.birthSec ?? null,
      projectedLossSec: displayedLossInfo?.lossSec ?? null,
    });
  },
  openPosition: { x: 110, y: 884 },
  windowWidth: 1560,
  windowHeight: 190,
  headerHeight: 34,
  getRenderedHistoryEndSec: (spec) =>
    getSettlementRenderedHistoryEndSec({
      actualHistoryEndSec: spec?.actualHistoryEndSec,
      displayHistoryEndSec: spec?.displayHistoryEndSec,
      visibleForecastCoverageEndSec: spec?.visibleForecastCoverageEndSec,
    }),
  forecastRevealTargetDurationSec: SETTLEMENT_GRAPH_REVEAL_DEFAULT.targetDurationSec,
  forecastRevealMinRateSecPerSec: SETTLEMENT_GRAPH_REVEAL_DEFAULT.minRateSecPerSec,
  forecastRevealMaxRateSecPerSec: SETTLEMENT_GRAPH_REVEAL_DEFAULT.maxRateSecPerSec,
  forecastRevealStartDelayMs: SETTLEMENT_GRAPH_REVEAL_DEFAULT.startDelayMs,
  getSystemTargetModeLabel: () => getSettlementGraphSeriesButtonLabel(),
  onToggleSystemTargetMode: () => toggleSettlementGraphSeriesMenu(),
  showClose: false,
  showPin: false,
  draggable: false,
});
settlementGraphView.setHistoryZoneResolver?.((zoneSpec) => {
  const timeline = runner.getTimeline?.();
  const frontierState = getSettlementFrontierState();
  const baseBounds = runner.getEditableHistoryBounds?.();
  const baseSegments = computeHistoryZoneSegments({
    minSec: zoneSpec?.minSec,
    maxSec: zoneSpec?.maxSec,
    historyEndSec: zoneSpec?.historyEndSec,
    baseMinEditableSec: baseBounds?.minEditableSec,
  });
  const realizedSegments = getSettlementSelectedVassalRealizedSegments(
    frontierState,
    Math.floor(timeline?.historyEndSec ?? 0)
  );
  if (!realizedSegments.length) {
    return baseSegments;
  }
  return [
    ...baseSegments,
    ...realizedSegments.map((segment) => ({
      kind: "fixedHistory",
      startSec: segment.startSec,
      endSec: segment.endSec,
    })),
  ];
});
settlementGraphView.setCommitPolicyResolver?.(({ scrubSec, historyEndSec }) => {
  const frontierState = getSettlementFrontierState();
  const realizedSegments = getSettlementSelectedVassalRealizedSegments(
    frontierState,
    historyEndSec
  );
  for (const segment of realizedSegments) {
    const insideFixedSegment =
      scrubSec >= segment.startSec &&
      (scrubSec < segment.endSec ||
        (isSettlementStateRunComplete(frontierState) && scrubSec === segment.endSec));
    if (insideFixedSegment) {
      return { allow: false, reason: "Vassal history is fixed" };
    }
  }
  return { allow: true };
});
settlementGraphView.setEventMarkerResolver?.(({ historyEndSec }) => {
  const frontierState = getSettlementFrontierState();
  const runComplete = isSettlementStateRunComplete(frontierState);
  const boundarySeconds = getSettlementVassalBoundarySeconds(frontierState, historyEndSec);
  return boundarySeconds
    .filter((sec, index, arr) => arr.indexOf(sec) === index)
    .map((tSec) => ({
      tSec,
      severity: "critical",
      color: 0xe3c46c,
      lineWidth: tSec === historyEndSec && !runComplete ? 4 : 3,
      radius: tSec === historyEndSec && !runComplete ? 6 : 5,
      alpha: tSec === historyEndSec && !runComplete ? 0.92 : 0.78,
    }));
});

settlementVassalControlsView = createSettlementVassalControlsView({
  app,
  layer: controlLayer,
  getJumpState: () => getSettlementJumpToDeathState(),
  onJump: () => jumpCurrentVassalToDeath(),
  getPrimaryState: () => getSettlementPrimaryVassalState(),
  onPrimary: () => {
    if (isSettlementStateRunComplete(getSettlementFrontierState())) {
      return openSettlementRunCompleteOverlay();
    }
    return openNextSettlementVassalSelection();
  },
});

settlementVassalChooserView = createSettlementVassalChooserView({
  app,
  layer: modalLayer,
  getSelectionPool: () => settlementPendingVassalSelection,
  isOpen: () => !!settlementPendingVassalSelection,
  onSelectCandidate: (candidateIndex) => selectSettlementVassal(candidateIndex),
  tooltipView,
});
runCompleteView = createRunCompleteView({
  app,
  layer: modalLayer,
});

function requestPauseBeforeDrag() {
  setSettlementPlaybackTarget(0);
  ensureSettlementRunnerPaused();
}

function togglePause() {
  if (settlementPlaybackSpeedTarget !== 0) return requestPauseBeforeDrag();
  return setSettlementPlaybackTarget(1);
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
  settlementVassalChooserView?.refresh?.();
  runCompleteView?.resize?.();
}

function publishSettlementDebugApi() {
  if (typeof globalThis === "undefined") return;
  globalThis.__SETTLEMENT_DEBUG__ = {
    getSnapshot: () => ({
      frontierSec: getSettlementFrontierSec(),
      viewedSec: getSettlementViewedSec(),
      previewCapSec: getSettlementPreviewCapSec(),
      playbackTarget: settlementPlaybackSpeedTarget,
      playbackCurrent: settlementPlaybackSpeedCurrent,
      projectedLossInfo: getProjectedSettlementLossInfo(),
      displayedLossInfo: getSettlementLossInfoForDisplay(),
      graph: settlementGraphView?.getDebugState?.() ?? null,
      controller: (() => {
        const data = settlementGraphController?.getData?.() ?? null;
        return data
          ? {
              horizonSec: Math.max(0, Math.floor(data.horizonSec ?? 0)),
              forecastStepSec: Math.max(
                0,
                Math.floor(data.forecastStepSec ?? 0)
              ),
              forecastCoverageEndSec: Math.max(
                0,
                Math.floor(data.forecastCoverageEndSec ?? 0)
              ),
              forecastRequestedEndSec: Math.max(
                0,
                Math.floor(data.forecastRequestedEndSec ?? 0)
              ),
              forecastPending: data.forecastPending === true,
              graphBoundarySecs:
                data.cache?.stateDataByBoundary instanceof Map
                  ? {
                      count: data.cache.stateDataByBoundary.size,
                      first: Array.from(data.cache.stateDataByBoundary.keys())
                        .sort((a, b) => a - b)
                        .slice(0, 32),
                      last: Array.from(data.cache.stateDataByBoundary.keys())
                        .sort((a, b) => a - b)
                        .slice(-32),
                    }
                  : null,
            }
          : null;
      })(),
      projection: settlementProjectionCache?.getForecastMeta?.() ?? null,
      projectionKeys: settlementProjectionCache?.getDebugSecondKeys?.(32) ?? null,
      pendingCommitJob: settlementPendingCommitJob
        ? {
            startSec: Math.max(0, Math.floor(settlementPendingCommitJob.startSec ?? 0)),
            deathSec: Math.max(0, Math.floor(settlementPendingCommitJob.deathSec ?? 0)),
            targetSec: Math.max(0, Math.floor(settlementPendingCommitJob.targetSec ?? 0)),
            sourceVassalId: settlementPendingCommitJob.sourceVassalId ?? null,
          }
        : null,
      runner: {
        timeline: (() => {
          const timeline = runner?.getTimeline?.() ?? null;
          return timeline
            ? {
                cursorSec: Math.max(0, Math.floor(timeline.cursorSec ?? 0)),
                historyEndSec: Math.max(
                  0,
                  Math.floor(timeline.historyEndSec ?? 0)
                ),
                maxReachedHistoryEndSec: Math.max(
                  0,
                  Math.floor(timeline.maxReachedHistoryEndSec ?? 0)
                ),
                revision: Math.max(0, Math.floor(timeline.revision ?? 0)),
              }
            : null;
        })(),
        previewStatus: runner?.getPreviewStatus?.() ?? null,
        cursorStateSec: Math.max(
          0,
          Math.floor(runner?.getCursorState?.()?.tSec ?? 0)
        ),
        stateSec: Math.max(0, Math.floor(runner?.getState?.()?.tSec ?? 0)),
      },
      lineage: (() => {
        const state = getSettlementFrontierState();
        const lineage = state?.hub?.core?.systemState?.vassalLineage ?? null;
        return lineage
          ? {
              currentVassalId: lineage.currentVassalId ?? null,
              selectedVassalIds: Array.isArray(lineage.selectedVassalIds)
                ? [...lineage.selectedVassalIds]
                : [],
              vassalIds: lineage.vassalsById
                ? Object.keys(lineage.vassalsById)
                : [],
            }
          : null;
      })(),
    }),
    getGraphClickPoint: (ratioX = 0, ratioY = 0.5) => {
      const plotRect = settlementGraphView?.getPlotScreenRect?.();
      if (!plotRect) return null;
      const rx = Math.max(0, Math.min(1, Number(ratioX ?? 0)));
      const ry = Math.max(0, Math.min(1, Number(ratioY ?? 0.5)));
      return {
        x: plotRect.x + plotRect.width * rx,
        y: plotRect.y + plotRect.height * ry,
      };
    },
    forceRender: () => {
      settlementGraphView?.render?.();
      prototypeView?.refresh?.();
      return true;
    },
    hasStateDataAt: (tSec) =>
      settlementGraphController?.getStateDataAt?.(Math.floor(tSec ?? 0)) != null,
    hasStateAt: (tSec) =>
      settlementGraphController?.getStateAt?.(Math.floor(tSec ?? 0)) != null,
    openNextSelection: () => openNextSettlementVassalSelection(),
    selectCandidate: (candidateIndex) =>
      selectSettlementVassal(Math.max(0, Math.floor(candidateIndex ?? 0))),
  };
}

runner.init();
requestPauseBeforeDrag();
syncSettlementGraphHorizon();
syncSettlementGraphRevealConfig();
syncSettlementVassalSelectionPauseState();
prototypeView.init();
settlementGraphView.open();
renderSettlementGraphSeriesMenu();
timeControlsView.init();
sunMoonDisksView.init();
settlementVassalControlsView.init();
settlementVassalChooserView.init();
runCompleteView.init();
syncSettlementRunCompletePresentation();
publishSettlementDebugApi();

window.addEventListener("resize", resizeCanvas);
window.addEventListener("keydown", handleGlobalKeyDown);

app.ticker.add((delta) => {
  const frameDt = delta / 60;
  runner.update(frameDt);
  const playbackSpeed = settlementPlaybackSpeedTarget;
  if (playbackSpeed !== 0) {
    const baseViewedSec = Number.isFinite(settlementPlaybackViewSec)
      ? settlementPlaybackViewSec
      : getSettlementViewedSec();
    const clampedViewedSec = Math.max(
      0,
      Math.min(baseViewedSec + playbackSpeed * frameDt, getSettlementPreviewCapSec())
    );
    const moveResult = setSettlementViewedSecond(clampedViewedSec);
    if (!moveResult?.ok || Math.abs(clampedViewedSec - baseViewedSec) < 0.0001) {
      setSettlementPlaybackTarget(0);
    }
  }
  settlementGraphController.update?.();
  processSettlementPendingCommit();
  syncSettlementGraphRevealConfig();
  syncSettlementGraphHorizon();
  syncSettlementVassalSelectionPauseState();
  syncSettlementGraphSeriesSelection();
  prototypeView.update(frameDt);
  settlementGraphView.render();
  renderSettlementGraphSeriesMenu();
  timeControlsView.update(frameDt);
  sunMoonDisksView.update(frameDt);
  settlementVassalControlsView.update(frameDt);
  settlementVassalChooserView.update(frameDt);
  syncSettlementRunCompletePresentation();
  runCompleteView.update(frameDt);
});
