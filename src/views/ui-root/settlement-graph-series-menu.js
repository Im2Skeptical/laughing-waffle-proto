import { VIEWPORT_DESIGN_HEIGHT, VIEWPORT_DESIGN_WIDTH } from "../layout-pixi.js";
import { PALETTE, TEXT_STYLES } from "../settlement-theme.js";

const DEFAULT_MAX_VISIBLE_SERIES = 5;
const MENU_MARGIN = 12;
const MENU_RECT = Object.freeze({
  x: 1410,
  y: 926,
  width: 240,
});
const MENU_LAYOUT = Object.freeze({
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
const DEFAULT_SERIES_IDS = Object.freeze([
  "totalPopulation",
  "food",
  "chaosPower",
  "faith:villager",
  "happiness:villager",
]);

function getSeriesId(series) {
  return String(series?.id ?? "");
}

function getDefaultSeriesIds(allSeries, maxVisibleSeries) {
  const list = Array.isArray(allSeries) ? allSeries : [];
  const preferred = [];
  const pushUnique = (seriesId) => {
    if (!seriesId || preferred.includes(seriesId)) return;
    preferred.push(seriesId);
  };

  for (const preferredSeriesId of DEFAULT_SERIES_IDS) {
    const series = list.find((entry) => getSeriesId(entry) === preferredSeriesId);
    if (!series) continue;
    pushUnique(getSeriesId(series));
    if (preferred.length >= maxVisibleSeries) break;
  }
  for (const series of list) {
    pushUnique(getSeriesId(series));
    if (preferred.length >= maxVisibleSeries) break;
  }

  return preferred.slice(0, maxVisibleSeries);
}

function getVisibleSeriesFromList(allSeries, visibleSeriesIds) {
  const list = Array.isArray(allSeries) ? allSeries : [];
  return list.filter((series) => visibleSeriesIds.includes(getSeriesId(series)));
}

function partitionMenuSeries(allSeries) {
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

function chunkClassIds(classIds, chunkSize) {
  const source = Array.isArray(classIds) ? classIds : [];
  const safeChunkSize = Math.max(1, Math.floor(chunkSize ?? 1));
  const chunks = [];
  for (let i = 0; i < source.length; i += safeChunkSize) {
    chunks.push(source.slice(i, i + safeChunkSize));
  }
  return chunks;
}

export function createSettlementGraphSeriesMenu({
  PIXI,
  layer,
  getAllSeries,
  getGraphScreenRect,
  applySeriesSelection,
  renderGraph,
  maxVisibleSeries = DEFAULT_MAX_VISIBLE_SERIES,
  viewportWidth = VIEWPORT_DESIGN_WIDTH,
  viewportHeight = VIEWPORT_DESIGN_HEIGHT,
} = {}) {
  const container = new PIXI.Container();
  layer?.addChild(container);

  let open = false;
  let signature = "";
  let visibleSeriesIds = [];

  function getAllMenuSeries() {
    const series = getAllSeries?.();
    return Array.isArray(series) ? series : [];
  }

  function syncVisibleSeriesIds(allSeries = getAllMenuSeries()) {
    const availableSeriesIds = new Set(
      allSeries.map((series) => getSeriesId(series)).filter(Boolean)
    );
    const nextVisibleSeriesIds = visibleSeriesIds.filter((seriesId) =>
      availableSeriesIds.has(seriesId)
    );
    if (!nextVisibleSeriesIds.length) {
      nextVisibleSeriesIds.push(...getDefaultSeriesIds(allSeries, maxVisibleSeries));
    }
    const changed =
      nextVisibleSeriesIds.length !== visibleSeriesIds.length ||
      nextVisibleSeriesIds.some((seriesId, index) => seriesId !== visibleSeriesIds[index]);
    visibleSeriesIds = nextVisibleSeriesIds;
    return changed;
  }

  function applySelection() {
    const allSeries = getAllMenuSeries();
    syncVisibleSeriesIds(allSeries);
    applySeriesSelection?.(getVisibleSeriesFromList(allSeries, visibleSeriesIds), {
      allSeries,
      visibleSeriesIds: [...visibleSeriesIds],
    });
    return allSeries;
  }

  function syncSelection() {
    const allSeries = getAllMenuSeries();
    const changed = syncVisibleSeriesIds(allSeries);
    if (changed) {
      applySeriesSelection?.(getVisibleSeriesFromList(allSeries, visibleSeriesIds), {
        allSeries,
        visibleSeriesIds: [...visibleSeriesIds],
      });
    }
    return allSeries;
  }

  function toggleSeries(seriesId) {
    const safeSeriesId = typeof seriesId === "string" ? seriesId : "";
    if (!safeSeriesId) return false;
    const visible = visibleSeriesIds.includes(safeSeriesId);
    if (visible) {
      if (visibleSeriesIds.length <= 1) return false;
      visibleSeriesIds = visibleSeriesIds.filter((id) => id !== safeSeriesId);
      return true;
    }
    if (visibleSeriesIds.length >= maxVisibleSeries) return false;
    visibleSeriesIds = [...visibleSeriesIds, safeSeriesId];
    return true;
  }

  function buildLayout(allSeries) {
    const menuSeries = partitionMenuSeries(allSeries);
    const classIdChunks = chunkClassIds(
      menuSeries.classIds,
      MENU_LAYOUT.maxClassColumnsPerBlock
    );
    const maxChunkColumns = classIdChunks.reduce(
      (maxColumns, chunk) => Math.max(maxColumns, chunk.length),
      0
    );
    const globalColumns = Math.min(
      MENU_LAYOUT.globalColumns,
      Math.max(1, menuSeries.globals.length)
    );
    const globalWidth =
      MENU_LAYOUT.padding * 2 +
      globalColumns * MENU_LAYOUT.globalCellWidth +
      Math.max(0, globalColumns - 1) * MENU_LAYOUT.classColumnGap;
    const classGridWidth =
      MENU_LAYOUT.padding * 2 +
      MENU_LAYOUT.metricLabelWidth +
      maxChunkColumns * MENU_LAYOUT.classColumnWidth +
      Math.max(0, maxChunkColumns - 1) * MENU_LAYOUT.classColumnGap;
    const width = Math.max(MENU_RECT.width, globalWidth, classGridWidth);

    let height =
      MENU_LAYOUT.padding +
      MENU_LAYOUT.titleHeight +
      MENU_LAYOUT.metaHeight;
    if (menuSeries.globals.length) {
      const globalRows = Math.ceil(menuSeries.globals.length / MENU_LAYOUT.globalColumns);
      height +=
        MENU_LAYOUT.sectionGap +
        MENU_LAYOUT.sectionLabelHeight +
        globalRows * MENU_LAYOUT.rowHeight +
        Math.max(0, globalRows - 1) * MENU_LAYOUT.rowGap;
    }
    if (classIdChunks.length && menuSeries.metricRows.length) {
      height += MENU_LAYOUT.sectionGap + MENU_LAYOUT.sectionLabelHeight;
      classIdChunks.forEach((chunk, index) => {
        height +=
          MENU_LAYOUT.headerHeight +
          menuSeries.metricRows.length * MENU_LAYOUT.rowHeight +
          Math.max(0, menuSeries.metricRows.length - 1) * MENU_LAYOUT.rowGap;
        if (index < classIdChunks.length - 1) height += MENU_LAYOUT.blockGap;
      });
    }
    height += MENU_LAYOUT.padding;

    const graphRect = getGraphScreenRect?.() ?? null;
    const preferredX =
      graphRect && Number.isFinite(graphRect.x) && Number.isFinite(graphRect.width)
        ? Math.floor(graphRect.x + graphRect.width - width - MENU_MARGIN)
        : MENU_RECT.x;
    const preferredY =
      graphRect && Number.isFinite(graphRect.y)
        ? Math.floor(graphRect.y - height - 8)
        : MENU_RECT.y;
    return {
      x: Math.max(MENU_MARGIN, Math.min(preferredX, viewportWidth - width - MENU_MARGIN)),
      y: Math.max(MENU_MARGIN, Math.min(preferredY, viewportHeight - height - MENU_MARGIN)),
      width,
      height,
      menuSeries,
      classIdChunks,
    };
  }

  function render() {
    const allSeries = syncSelection();
    const menuLayout = buildLayout(allSeries);
    const menuRect = menuLayout;
    const nextSignature = JSON.stringify({
      open,
      menuRect,
      series: allSeries.map((series) => getSeriesId(series)),
      visible: visibleSeriesIds,
    });
    if (nextSignature === signature) return;
    signature = nextSignature;
    container.removeChildren();
    container.visible = open;
    if (!open) return;

    const panel = new PIXI.Graphics();
    panel.lineStyle(2, PALETTE.stroke, 0.95);
    panel.beginFill(PALETTE.topbar, 0.96);
    panel.drawRoundedRect(menuRect.x, menuRect.y, menuRect.width, menuRect.height, 14);
    panel.endFill();
    container.addChild(panel);

    let cursorY = menuRect.y + MENU_LAYOUT.padding;
    const title = new PIXI.Text(`Series ${visibleSeriesIds.length}/${maxVisibleSeries}`, {
      ...TEXT_STYLES.body,
      fontWeight: "bold",
    });
    title.x = menuRect.x + MENU_LAYOUT.padding;
    title.y = cursorY;
    container.addChild(title);
    cursorY += MENU_LAYOUT.titleHeight;

    const subtitle = new PIXI.Text("Toggle any mix of globals and class metrics", {
      ...TEXT_STYLES.muted,
      fontSize: 11,
    });
    subtitle.x = menuRect.x + MENU_LAYOUT.padding;
    subtitle.y = cursorY;
    container.addChild(subtitle);
    cursorY += MENU_LAYOUT.metaHeight;

    const renderSectionLabel = (text, y) => {
      const label = new PIXI.Text(text, {
        ...TEXT_STYLES.muted,
        fontWeight: "bold",
        fill: PALETTE.accent,
      });
      label.x = menuRect.x + MENU_LAYOUT.padding;
      label.y = y;
      container.addChild(label);
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
      const seriesId = getSeriesId(series);
      if (!seriesId) return;
      const visible = visibleSeriesIds.includes(seriesId);
      const atCap = !visible && visibleSeriesIds.length >= maxVisibleSeries;
      const cell = new PIXI.Container();
      cell.eventMode = "static";
      cell.cursor = atCap ? "default" : "pointer";
      cell.hitArea = new PIXI.Rectangle(x, y, width, height);
      cell.on("pointertap", (event) => {
        event?.stopPropagation?.();
        if (!toggleSeries(seriesId)) return;
        applySelection();
        renderGraph?.();
        signature = "";
        render();
      });

      const bg = new PIXI.Graphics();
      bg.lineStyle(1, visible ? PALETTE.accent : PALETTE.panelSoft, 0.9);
      bg.beginFill(visible ? PALETTE.panel : PALETTE.chip, atCap ? 0.45 : 0.84);
      bg.drawRoundedRect(x, y, width, height, compact ? 8 : 10);
      bg.endFill();
      cell.addChild(bg);

      const dot = new PIXI.Graphics();
      dot.beginFill(Number.isFinite(series?.color) ? series.color : PALETTE.accent, atCap ? 0.45 : 1);
      dot.drawCircle(0, 0, compact ? 5 : 6);
      dot.endFill();
      dot.x = x + 12;
      dot.y = y + Math.floor(height / 2);
      cell.addChild(dot);

      if (showLabel) {
        const label = new PIXI.Text(String(series?.label ?? seriesId), {
          ...TEXT_STYLES.muted,
          fontSize: 12,
          fontWeight: visible ? "bold" : "normal",
          fill: atCap ? PALETTE.inactive : PALETTE.text,
        });
        label.x = x + 24;
        label.y = y + 5;
        cell.addChild(label);
      }

      const stateText = new PIXI.Text(visible ? "On" : atCap ? "Full" : "Off", {
        ...TEXT_STYLES.muted,
        fontSize: compact ? 10 : 11,
        fill: visible ? PALETTE.accent : atCap ? PALETTE.inactive : PALETTE.textMuted,
      });
      stateText.x = compact ? x + width - 22 : x + width - 28;
      stateText.y = y + (compact ? 7 : 6);
      cell.addChild(stateText);

      container.addChild(cell);
    };

    if (menuLayout.menuSeries.globals.length) {
      cursorY += MENU_LAYOUT.sectionGap;
      renderSectionLabel("Global", cursorY);
      cursorY += MENU_LAYOUT.sectionLabelHeight;

      const globalColumns = MENU_LAYOUT.globalColumns;
      const globalGap = MENU_LAYOUT.classColumnGap;
      for (let i = 0; i < menuLayout.menuSeries.globals.length; i += 1) {
        const row = Math.floor(i / globalColumns);
        const col = i % globalColumns;
        renderToggleCell({
          series: menuLayout.menuSeries.globals[i],
          x: menuRect.x + MENU_LAYOUT.padding + col * (MENU_LAYOUT.globalCellWidth + globalGap),
          y: cursorY + row * (MENU_LAYOUT.rowHeight + MENU_LAYOUT.rowGap),
          width: MENU_LAYOUT.globalCellWidth,
          height: MENU_LAYOUT.rowHeight,
        });
      }
      const globalRows = Math.ceil(menuLayout.menuSeries.globals.length / globalColumns);
      cursorY +=
        globalRows * MENU_LAYOUT.rowHeight +
        Math.max(0, globalRows - 1) * MENU_LAYOUT.rowGap;
    }

    if (menuLayout.classIdChunks.length && menuLayout.menuSeries.metricRows.length) {
      cursorY += MENU_LAYOUT.sectionGap;
      renderSectionLabel("By Class", cursorY);
      cursorY += MENU_LAYOUT.sectionLabelHeight;

      menuLayout.classIdChunks.forEach((classIdChunk, chunkIndex) => {
        const blockHeight =
          MENU_LAYOUT.headerHeight +
          menuLayout.menuSeries.metricRows.length * MENU_LAYOUT.rowHeight +
          Math.max(0, menuLayout.menuSeries.metricRows.length - 1) * MENU_LAYOUT.rowGap;
        const blockWidth =
          MENU_LAYOUT.metricLabelWidth +
          classIdChunk.length * MENU_LAYOUT.classColumnWidth +
          Math.max(0, classIdChunk.length - 1) * MENU_LAYOUT.classColumnGap;

        const blockBg = new PIXI.Graphics();
        blockBg.lineStyle(1, PALETTE.panelSoft, 0.85);
        blockBg.beginFill(PALETTE.chip, 0.58);
        blockBg.drawRoundedRect(
          menuRect.x + MENU_LAYOUT.padding - 4,
          cursorY - 2,
          blockWidth + 8,
          blockHeight + 4,
          10
        );
        blockBg.endFill();
        container.addChild(blockBg);

        classIdChunk.forEach((classId, index) => {
          const header = new PIXI.Text(String(classId), {
            ...TEXT_STYLES.muted,
            fontSize: 12,
            fontWeight: "bold",
            fill: PALETTE.text,
          });
          header.x =
            menuRect.x +
            MENU_LAYOUT.padding +
            MENU_LAYOUT.metricLabelWidth +
            index * (MENU_LAYOUT.classColumnWidth + MENU_LAYOUT.classColumnGap);
          header.y = cursorY + 2;
          container.addChild(header);
        });

        let rowY = cursorY + MENU_LAYOUT.headerHeight;
        for (const metricRow of menuLayout.menuSeries.metricRows) {
          const metricLabel = new PIXI.Text(metricRow.shortLabel, {
            ...TEXT_STYLES.muted,
            fontSize: 12,
            fontWeight: "bold",
          });
          metricLabel.x = menuRect.x + MENU_LAYOUT.padding;
          metricLabel.y = rowY + 6;
          container.addChild(metricLabel);

          classIdChunk.forEach((classId, index) => {
            const series =
              menuLayout.menuSeries.classSeriesByMetricAndClass.get(
                `${metricRow.id}|${classId}`
              ) ?? null;
            renderToggleCell({
              series,
              x:
                menuRect.x +
                MENU_LAYOUT.padding +
                MENU_LAYOUT.metricLabelWidth +
                index * (MENU_LAYOUT.classColumnWidth + MENU_LAYOUT.classColumnGap),
              y: rowY,
              width: MENU_LAYOUT.classColumnWidth,
              height: MENU_LAYOUT.rowHeight,
              showLabel: false,
              compact: true,
            });
          });
          rowY += MENU_LAYOUT.rowHeight + MENU_LAYOUT.rowGap;
        }

        cursorY += blockHeight;
        if (chunkIndex < menuLayout.classIdChunks.length - 1) cursorY += MENU_LAYOUT.blockGap;
      });
    }
  }

  function toggle() {
    open = !open;
    signature = "";
    render();
  }

  return {
    applySelection,
    getButtonLabel: () => {
      const allSeries = syncSelection();
      return `Series ${visibleSeriesIds.length}/${allSeries.length}`;
    },
    render,
    syncSelection,
    toggle,
  };
}
