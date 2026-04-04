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
app.stage.addChild(playfieldLayer, graphLayer, controlLayer, tooltipLayer);
controlLayer.addChild(settlementGraphSeriesMenuLayer);

let prototypeView = null;
let settlementGraphController = null;
let selectedPracticeClassId = "villager";
let settlementGraphView = null;
let settlementGraphSeriesMenuOpen = false;
let settlementGraphSeriesMenuSignature = "";
let visibleSettlementGraphSeriesIds = [];
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

  for (const series of list) {
    if (series?.pickerGroup === "global") {
      pushUnique(getSettlementGraphSeriesId(series));
    }
  }
  for (const series of list) {
    if (series?.pickerGroup === "classMetric" && series?.pickerMetricId === "population") {
      pushUnique(getSettlementGraphSeriesId(series));
    }
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
visibleSettlementGraphSeriesIds = getSettlementGraphDefaultSeriesIds();
applySettlementGraphSeriesSelection();

prototypeView = createSettlementPrototypeView({
  app,
  layer: playfieldLayer,
  getState: () => runner.getState?.(),
  getSelectedPracticeClassId: () => selectedPracticeClassId,
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
  syncSettlementGraphSeriesSelection();
  prototypeView.update(frameDt);
  settlementGraphView.render();
  renderSettlementGraphSeriesMenu();
  timeControlsView.update(frameDt);
  sunMoonDisksView.update(frameDt);
});
