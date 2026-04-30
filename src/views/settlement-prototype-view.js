import { envTileDefs } from "../defs/gamepieces/env-tiles-defs.js";
import { hubStructureDefs } from "../defs/gamepieces/hub-structure-defs.js";
import { settlementPracticeDefs } from "../defs/gamepieces/settlement-practice-defs.js";
import {
  getSettlementChaosGodSummary,
  getSettlementChaosIncomeSummary,
} from "../model/settlement-chaos.js";
import { getCurrentSeasonKey } from "../model/state.js";
import {
  getSettlementClassIds,
  getSettlementFaithSummary,
  getSettlementHappinessSummary,
  getSettlementOrderSlots,
  getSettlementPopulationSummary,
  getSettlementPracticeSlotsByClass,
  getSettlementStockpile,
  getSettlementStructureSlots,
  getSettlementTotalFood,
} from "../model/settlement-state.js";
import {
  capitalizeLabel,
  formatPartialFeedMemory,
} from "./settlement-formatters.js";
import {
  buildPracticeLines,
  buildStructureLines,
  buildStructureTooltipSpec,
  buildTileLines,
} from "./settlement-tooltip-lines.js";
import {
  drawMiniPracticeCard,
} from "./settlement-agenda-view.js";
import { drawCard, drawPracticeCard } from "./settlement-card-view.js";
import { drawRedGodPanel } from "./settlement-chaos-panel-view.js";
import { drawClassSummaryCard } from "./settlement-class-summary-view.js";
import { drawOrderPanel } from "./settlement-order-panel-view.js";
import { drawVassalPanel } from "./settlement-vassal-panel-view.js";
import {
  buildRenderGateKey,
  buildSignature,
} from "./settlement-render-signature.js";
import { buildRenderSemanticSnapshot } from "./settlement-semantic-snapshot.js";
import {
  clearChildren,
  createText,
  createWrappedText,
  roundedRect,
} from "./settlement-view-primitives.js";
import {
  FAITH_TIER_COLORS,
  PALETTE,
  TEXT_STYLES,
} from "./settlement-theme.js";
import {
  SETTLEMENT_CLASS_COLUMN_LAYOUT,
  SETTLEMENT_PANEL_RECTS,
  SETTLEMENT_REGION_TILE_LAYOUT,
  SETTLEMENT_RESOURCE_CHIP_LAYOUT,
  SETTLEMENT_SECTION_LABEL_LAYOUT,
  SETTLEMENT_SLOT_GRID_LAYOUT,
  SETTLEMENT_STRUCTURE_CARD_LAYOUT,
  SETTLEMENT_TOPBAR_LAYOUT,
} from "./settlement-layout.js";

const AGENDA_FLYOUT_HIDE_DELAY_MS = 60;

function getSlotRect(rect, columns, rows, index, padding = 6) {
  const colCount = Math.max(1, Math.floor(columns));
  const rowCount = Math.max(1, Math.floor(rows));
  const safeIndex = Math.max(0, Math.floor(index));
  const col = safeIndex % colCount;
  const row = Math.floor(safeIndex / colCount);
  const cellWidth = rect.width / colCount;
  const cellHeight = rect.height / rowCount;
  const inset = Math.max(0, Math.floor(padding));
  return {
    x: Math.round(rect.x + col * cellWidth + inset),
    y: Math.round(rect.y + row * cellHeight + inset),
    width: Math.max(1, Math.floor(cellWidth - inset * 2)),
    height: Math.max(1, Math.floor(cellHeight - inset * 2)),
  };
}

function fitSquareInRect(rect) {
  const size = Math.max(1, Math.floor(Math.min(rect.width, rect.height)));
  return {
    x: Math.round(rect.x + (rect.width - size) * 0.5),
    y: Math.round(rect.y + (rect.height - size) * 0.5),
    width: size,
    height: size,
  };
}

function drawSlotGrid(gfx, rect, columns, rows, padding = 6) {
  const colCount = Math.max(1, Math.floor(columns));
  const rowCount = Math.max(1, Math.floor(rows));
  for (let row = 0; row < rowCount; row += 1) {
    for (let col = 0; col < colCount; col += 1) {
      const slotRect = getSlotRect(rect, colCount, rowCount, row * colCount + col, padding);
      roundedRect(
        gfx,
        slotRect.x,
        slotRect.y,
        slotRect.width,
        slotRect.height,
        18,
        PALETTE.slot,
        PALETTE.stroke,
        2
      );
    }
  }
}

function drawSubPanel(container, rect, fill = PALETTE.cardMuted, outline = PALETTE.stroke) {
  const gfx = new PIXI.Graphics();
  roundedRect(gfx, rect.x, rect.y, rect.width, rect.height, 18, fill, outline, 2);
  container.addChild(gfx);
  return gfx;
}

function drawChip(container, x, y, width, label, value, color = PALETTE.chip) {
  const gfx = new PIXI.Graphics();
  roundedRect(gfx, x, y, width, 40, 16, color, PALETTE.stroke, 2);
  container.addChild(gfx);
  container.addChild(createText(label, TEXT_STYLES.muted, x + 12, y + 7));
  container.addChild(createText(String(value), TEXT_STYLES.chip, x + width - 14, y + 20, 1, 0.5));
}

function getTileCardFill(tile) {
  if (tile?.defId === "tile_floodplains") return PALETTE.cardMuted;
  return tile?.defId === "tile_river" ? PALETTE.riverTileCard : PALETTE.tileCard;
}

function getStructureTierColor(structure) {
  const tier = structure?.props?.settlement?.upgradeTier;
  return typeof tier === "string" ? FAITH_TIER_COLORS[tier] ?? null : null;
}

export function createSettlementPrototypeView({
  app,
  layer,
  getState,
  getCivilizationLossInfo,
  getSelectedPracticeClassId,
  setSelectedPracticeClassId,
  tooltipView,
  getVisibleVassalTimeSec,
} = {}) {
  const root = new PIXI.Container();
  const contentLayer = new PIXI.Container();
  const overlayLayer = new PIXI.Container();
  root.addChild(contentLayer, overlayLayer);
  layer?.addChild(root);
  let lastSignature = "";
  let lastRenderGateKey = "";
  let agendaFlyoutSpec = null;
  let agendaFlyoutHideTimeoutId = null;

  function clearAgendaFlyoutHideTimer() {
    if (agendaFlyoutHideTimeoutId == null) return;
    clearTimeout(agendaFlyoutHideTimeoutId);
    agendaFlyoutHideTimeoutId = null;
  }

  function hideAgendaFlyoutNow() {
    clearAgendaFlyoutHideTimer();
    agendaFlyoutSpec = null;
    clearChildren(overlayLayer);
  }

  function scheduleAgendaFlyoutHide() {
    clearAgendaFlyoutHideTimer();
    agendaFlyoutHideTimeoutId = setTimeout(() => {
      agendaFlyoutSpec = null;
      clearChildren(overlayLayer);
      agendaFlyoutHideTimeoutId = null;
    }, AGENDA_FLYOUT_HIDE_DELAY_MS);
  }

  function renderAgendaFlyout(state) {
    clearChildren(overlayLayer);
    if (!agendaFlyoutSpec || !state) return;
    const classIds = getSettlementClassIds(state);
    const member = agendaFlyoutSpec.member;
    const anchorBounds =
      agendaFlyoutSpec.anchorDisplayObject?.getBounds?.() ?? agendaFlyoutSpec.anchorRect ?? null;
    if (!anchorBounds) return;
    const width = 360;
    const sectionGap = 8;
    const headerHeight = 30;
    const rowHeight = 56;
    const height =
      16 +
      headerHeight +
      classIds.length * rowHeight +
      Math.max(0, classIds.length - 1) * sectionGap +
      14;
    const screenWidth = Math.floor(app?.screen?.width ?? 2424);
    const screenHeight = Math.floor(app?.screen?.height ?? 1080);
    let x = anchorBounds.x + anchorBounds.width + 14;
    if (x + width > screenWidth - 16) {
      x = anchorBounds.x - width - 14;
    }
    x = Math.max(16, Math.min(x, screenWidth - width - 16));
    let y = anchorBounds.y - 8;
    y = Math.max(16, Math.min(y, screenHeight - height - 16));

    const flyout = new PIXI.Container();
    flyout.x = x;
    flyout.y = y;
    flyout.eventMode = "static";
    flyout.cursor = "default";
    flyout.hitArea = new PIXI.Rectangle(0, 0, width, height);
    flyout.on("pointerenter", () => {
      clearAgendaFlyoutHideTimer();
    });
    flyout.on("pointerleave", () => {
      scheduleAgendaFlyoutHide();
    });

    const bg = new PIXI.Graphics();
    roundedRect(bg, 0, 0, width, height, 18, PALETTE.flyout, PALETTE.accent, 2);
    flyout.addChild(bg);
    flyout.addChild(createText("Full Agenda", TEXT_STYLES.cardTitle, 14, 12));

    let cursorY = 16 + headerHeight;
    for (const classId of classIds) {
      drawSubPanel(
        flyout,
        { x: 12, y: cursorY, width: width - 24, height: rowHeight },
        PALETTE.elderLozengeSoft,
        PALETTE.stroke
      );
      flyout.addChild(
        createText(
          capitalizeLabel(classId),
          {
            ...TEXT_STYLES.body,
            fontWeight: "bold",
            fontSize: 12,
          },
          22,
          cursorY + 8
        )
      );
      const agenda = Array.isArray(member?.agendaByClass?.[classId]) ? member.agendaByClass[classId] : [];
      if (agenda.length <= 0) {
        drawMiniPracticeCard(
          flyout,
          { x: 96, y: cursorY + 7, width: 84, height: rowHeight - 14 },
          null,
          { emptyLabel: "No agenda", fontSize: 9, lineHeight: 11 }
        );
      } else {
        const cardWidth = 74;
        const gap = 6;
        for (let index = 0; index < agenda.length; index += 1) {
          drawMiniPracticeCard(
            flyout,
            {
              x: 96 + index * (cardWidth + gap),
              y: cursorY + 7,
              width: cardWidth,
              height: rowHeight - 14,
            },
            agenda[index],
            { fontSize: 8, lineHeight: 10 }
          );
        }
      }
      cursorY += rowHeight + sectionGap;
    }

    overlayLayer.addChild(flyout);
  }

  function showAgendaFlyout(spec) {
    clearAgendaFlyoutHideTimer();
    agendaFlyoutSpec = spec && typeof spec === "object" ? spec : null;
    const state = typeof getState === "function" ? getState() : null;
    renderAgendaFlyout(state);
  }

  function render() {
    const state = typeof getState === "function" ? getState() : null;
    if (!state) return;
    const classIds = getSettlementClassIds(state);
    const selectedClassId =
      (typeof getSelectedPracticeClassId === "function" && getSelectedPracticeClassId()) ||
      classIds[0] ||
      "villager";
    const visibleVassalThroughSec =
      typeof getVisibleVassalTimeSec === "function"
        ? getVisibleVassalTimeSec(state)
        : state?.tSec;
    const civilizationLossInfo =
      typeof getCivilizationLossInfo === "function" ? getCivilizationLossInfo() : null;
    const renderGateKey = buildRenderGateKey(
      state,
      selectedClassId,
      visibleVassalThroughSec,
      civilizationLossInfo
    );
    if (renderGateKey === lastRenderGateKey) {
      renderAgendaFlyout(state);
      return;
    }
    lastRenderGateKey = renderGateKey;
    const redGodSummary = getSettlementChaosGodSummary(state, "redGod");
    const redGodIncomeSummary = getSettlementChaosIncomeSummary(state, "redGod");
    const signature = buildSignature(
      state,
      selectedClassId,
      visibleVassalThroughSec,
      civilizationLossInfo
    );
    if (signature === lastSignature) {
      renderAgendaFlyout(state);
      return;
    }
    lastSignature = signature;

    hideAgendaFlyoutNow();
    clearChildren(contentLayer);

    const screenWidth = Math.floor(app?.screen?.width ?? 2424);
    const screenHeight = Math.floor(app?.screen?.height ?? 1080);

    const background = new PIXI.Graphics();
    background.beginFill(PALETTE.background, 1);
    background.drawRect(0, 0, screenWidth, screenHeight);
    background.endFill();
    contentLayer.addChild(background);

    const topbar = new PIXI.Graphics();
    roundedRect(topbar, 0, 0, screenWidth, SETTLEMENT_TOPBAR_LAYOUT.height, 0, PALETTE.topbar, PALETTE.topbar, 0);
    contentLayer.addChild(topbar);

    const seasonText = `${getCurrentSeasonKey(state).toUpperCase()}  |  Year ${Math.floor(
      state?.year ?? 1
    )}`;
    const civilizationLostLabel = Number.isFinite(civilizationLossInfo?.lossYear)
      ? `Civilization Lost - Year ${Math.floor(civilizationLossInfo.lossYear)}${
          Number.isFinite(civilizationLossInfo?.maxLossYear)
            ? ` (max ${Math.floor(civilizationLossInfo.maxLossYear)})`
            : ""
        }`
      : "Civilization Lost - Unknown";
    contentLayer.addChild(createText(seasonText, TEXT_STYLES.header, screenWidth * 0.5, SETTLEMENT_TOPBAR_LAYOUT.seasonY, 0.5, 0.5));
    contentLayer.addChild(
      createText(
        civilizationLostLabel,
        {
          ...TEXT_STYLES.body,
          fontSize: 18,
          fontWeight: "bold",
          fill: PALETTE.accent,
        },
        screenWidth * 0.5,
        SETTLEMENT_TOPBAR_LAYOUT.lossY,
        0.5,
        0.5
      )
    );

    const {
      hub: hubPanelRect,
      vassal: vassalPanelRect,
      chaos: chaosPanelRect,
      region: regionPanelRect,
      classColumn: classColumnRect,
      order: orderRect,
      practice: practiceRect,
      structures: structuresRect,
      resourceBand: resourceBandRect,
    } = SETTLEMENT_PANEL_RECTS;

    const panelGfx = new PIXI.Graphics();
    roundedRect(
      panelGfx,
      hubPanelRect.x,
      hubPanelRect.y,
      hubPanelRect.width,
      hubPanelRect.height,
      26,
      PALETTE.panelSoft,
      PALETTE.stroke,
      4
    );
    roundedRect(
      panelGfx,
      chaosPanelRect.x,
      chaosPanelRect.y,
      chaosPanelRect.width,
      chaosPanelRect.height,
      26,
      PALETTE.panelSoft,
      PALETTE.stroke,
      4
    );
    roundedRect(
      panelGfx,
      regionPanelRect.x,
      regionPanelRect.y,
      regionPanelRect.width,
      regionPanelRect.height,
      26,
      PALETTE.panelSoft,
      PALETTE.stroke,
      4
    );
    roundedRect(
      panelGfx,
      vassalPanelRect.x,
      vassalPanelRect.y,
      vassalPanelRect.width,
      vassalPanelRect.height,
      26,
      PALETTE.panelSoft,
      PALETTE.stroke,
      4
    );
    roundedRect(
      panelGfx,
      resourceBandRect.x,
      resourceBandRect.y,
      resourceBandRect.width,
      resourceBandRect.height,
      18,
      PALETTE.panelSoft,
      PALETTE.stroke,
      2
    );
    roundedRect(
      panelGfx,
      orderRect.x,
      orderRect.y,
      orderRect.width,
      orderRect.height,
      22,
      PALETTE.panel,
      PALETTE.stroke,
      3
    );
    roundedRect(
      panelGfx,
      practiceRect.x,
      practiceRect.y,
      practiceRect.width,
      practiceRect.height,
      22,
      PALETTE.panel,
      PALETTE.stroke,
      3
    );
    roundedRect(
      panelGfx,
      structuresRect.x,
      structuresRect.y,
      structuresRect.width,
      structuresRect.height,
      22,
      PALETTE.panel,
      PALETTE.stroke,
      3
    );
    contentLayer.addChild(panelGfx);

    contentLayer.addChild(
      createText(
        state?.locationNames?.hub ?? "Hub",
        TEXT_STYLES.header,
        hubPanelRect.x + hubPanelRect.width * 0.5,
        SETTLEMENT_SECTION_LABEL_LAYOUT.hubY,
        0.5,
        0.5
      )
    );
    contentLayer.addChild(
      createText(
        state?.locationNames?.region ?? "Region",
        TEXT_STYLES.header,
        regionPanelRect.x + regionPanelRect.width * 0.5,
        regionPanelRect.y + SETTLEMENT_SECTION_LABEL_LAYOUT.regionYOffset,
        0.5,
        0.5
      )
    );
    contentLayer.addChild(
      createText("Vassal", TEXT_STYLES.header, vassalPanelRect.x + vassalPanelRect.width * 0.5, SETTLEMENT_SECTION_LABEL_LAYOUT.vassalY, 0.5, 0.5)
    );
    contentLayer.addChild(
      createText("Order", TEXT_STYLES.title, orderRect.x + orderRect.width * 0.5, SETTLEMENT_SECTION_LABEL_LAYOUT.orderY, 0.5, 0.5)
    );
    contentLayer.addChild(
      createText(
        `Practice - ${capitalizeLabel(selectedClassId)}`,
        TEXT_STYLES.title,
        practiceRect.x + practiceRect.width * 0.5,
        SETTLEMENT_SECTION_LABEL_LAYOUT.practiceY,
        0.5,
        0.5
      )
    );
    contentLayer.addChild(
      createText(
        "Structures",
        TEXT_STYLES.title,
        structuresRect.x + structuresRect.width * 0.5,
        SETTLEMENT_SECTION_LABEL_LAYOUT.structuresY,
        0.5,
        0.5
      )
    );

    const chipsLayer = new PIXI.Container();
    contentLayer.addChild(chipsLayer);
    const chipSpecs = [
      {
        label: "Food",
        value: `${getSettlementTotalFood(state)} total`,
        width: SETTLEMENT_RESOURCE_CHIP_LAYOUT.widths.food,
        color: PALETTE.chip,
      },
      {
        label: "Red",
        value: getSettlementStockpile(state, "redResource"),
        width: SETTLEMENT_RESOURCE_CHIP_LAYOUT.widths.red,
        color: PALETTE.red,
      },
      {
        label: "Blue",
        value: getSettlementStockpile(state, "blueResource"),
        width: SETTLEMENT_RESOURCE_CHIP_LAYOUT.widths.blue,
        color: PALETTE.blue,
      },
      {
        label: "Black",
        value: getSettlementStockpile(state, "blackResource"),
        width: SETTLEMENT_RESOURCE_CHIP_LAYOUT.widths.black,
        color: PALETTE.black,
      },
    ];
    const chipGap = SETTLEMENT_RESOURCE_CHIP_LAYOUT.gap;
    const chipRowWidth =
      chipSpecs.reduce((sum, spec) => sum + spec.width, 0) + chipGap * (chipSpecs.length - 1);
    let chipX = resourceBandRect.x + Math.floor((resourceBandRect.width - chipRowWidth) * 0.5);
    for (const spec of chipSpecs) {
      drawChip(chipsLayer, chipX, resourceBandRect.y + SETTLEMENT_RESOURCE_CHIP_LAYOUT.yOffset, spec.width, spec.label, spec.value, spec.color);
      chipX += spec.width + chipGap;
    }

    const classLayer = new PIXI.Container();
    contentLayer.addChild(classLayer);
    // createClassTab selection moved onto the class summary cards themselves.
    // Legacy layout marker for UI contract tests:
    // { y: classTabsRect.y }
    const classGap = SETTLEMENT_CLASS_COLUMN_LAYOUT.gap;
    const classCardHeight = Math.max(
      SETTLEMENT_CLASS_COLUMN_LAYOUT.minCardHeight,
      Math.floor(
        (classColumnRect.height - classGap * Math.max(0, classIds.length - 1)) /
          Math.max(1, classIds.length)
      )
    );
    for (let i = 0; i < classIds.length; i += 1) {
      const classId = classIds[i];
      classLayer.addChild(
        drawClassSummaryCard(
          {
            x: classColumnRect.x,
            y: classColumnRect.y + i * (classCardHeight + classGap),
            width: classColumnRect.width,
            height: classCardHeight,
          },
          classId,
          getSettlementPopulationSummary(state, classId),
          getSettlementFaithSummary(state, classId),
          getSettlementHappinessSummary(state, classId),
          classId === selectedClassId,
          () => {
            if (classId === selectedClassId) return;
            setSelectedPracticeClassId?.(classId);
            lastSignature = "";
            lastRenderGateKey = "";
            render();
          }
        )
      );
    }

    drawSlotGrid(contentLayer.addChild(new PIXI.Graphics()), practiceRect, SETTLEMENT_SLOT_GRID_LAYOUT.practiceColumns, 1);
    drawSlotGrid(contentLayer.addChild(new PIXI.Graphics()), structuresRect, SETTLEMENT_SLOT_GRID_LAYOUT.structureColumns, 1);
    const regionTileGridRect = {
      x: regionPanelRect.x + SETTLEMENT_REGION_TILE_LAYOUT.xInset,
      y: regionPanelRect.y + SETTLEMENT_REGION_TILE_LAYOUT.yOffset,
      width: regionPanelRect.width - SETTLEMENT_REGION_TILE_LAYOUT.xInset * 2,
      height: regionPanelRect.height - SETTLEMENT_REGION_TILE_LAYOUT.heightInset,
    };
    drawSlotGrid(
      contentLayer.addChild(new PIXI.Graphics()),
      regionTileGridRect,
      SETTLEMENT_SLOT_GRID_LAYOUT.regionColumns,
      1,
      SETTLEMENT_REGION_TILE_LAYOUT.slotPadding
    );
    drawVassalPanel(
      contentLayer,
      vassalPanelRect,
      state,
      selectedClassId,
      tooltipView,
      visibleVassalThroughSec
    );

    const orderSlots = getSettlementOrderSlots(state);
    const orderCard = orderSlots[0]?.card ?? null;
    if (orderCard) {
      drawOrderPanel(
        contentLayer,
        orderRect,
        state,
        selectedClassId,
        orderCard,
        tooltipView,
        showAgendaFlyout,
        scheduleAgendaFlyoutHide
      );
    }

    const practiceSlots = getSettlementPracticeSlotsByClass(state, selectedClassId);
    for (let i = 0; i < practiceSlots.length; i += 1) {
      const card = practiceSlots[i]?.card ?? null;
      if (!card) continue;
      const def = settlementPracticeDefs[card.defId];
      const isPassivePractice = def?.practiceMode === "passive";
      const practiceSlotRect = getSlotRect(
        practiceRect,
        SETTLEMENT_SLOT_GRID_LAYOUT.practiceColumns,
        1,
        i
      );
      const practiceCardRect = isPassivePractice ? fitSquareInRect(practiceSlotRect) : practiceSlotRect;
      drawPracticeCard(
        contentLayer,
        practiceCardRect,
        card,
        def?.name ?? card.defId,
        buildPracticeLines(card),
        card?.props?.settlement?.available ? PALETTE.card : PALETTE.cardMuted,
        isPassivePractice
          ? card?.props?.settlement?.available
            ? PALETTE.passiveBorder
            : PALETTE.passiveBorderMuted
          : card?.props?.settlement?.available
            ? PALETTE.active
            : PALETTE.stroke,
        {
          showBody: false,
          tooltipView,
        }
      );
    }

    const structureSlots = getSettlementStructureSlots(state);
    for (let i = 0; i < structureSlots.length; i += 1) {
      const structure = structureSlots[i]?.structure ?? null;
      if (!structure) continue;
      const def = hubStructureDefs[structure.defId];
      const tierColor = getStructureTierColor(structure);
      const structureCardRect = getSlotRect(
        structuresRect,
        SETTLEMENT_SLOT_GRID_LAYOUT.structureColumns,
        1,
        i
      );
      drawCard(
        contentLayer,
        structureCardRect,
        def?.name ?? structure.defId,
        buildStructureLines(structure),
        structure?.props?.settlement?.active ? PALETTE.card : PALETTE.cardMuted,
        tierColor ?? (structure?.props?.settlement?.active ? PALETTE.active : PALETTE.stroke),
        {
          fontSize: 11,
          lineHeight: 15,
          wordWrapWidth: structureCardRect.width - SETTLEMENT_STRUCTURE_CARD_LAYOUT.wordWrapInset,
        },
        {
          showBody: false,
          tooltipView,
          tooltipSpec: buildStructureTooltipSpec(structure),
          edgeColor: tierColor,
          edgeStrokeWidth: 5,
        }
      );
    }

    const tileAnchors = Array.isArray(state?.board?.layers?.tile?.anchors)
      ? state.board.layers.tile.anchors
      : [];
    drawRedGodPanel(contentLayer, chaosPanelRect, redGodSummary, redGodIncomeSummary, tooltipView);
    for (let i = 0; i < tileAnchors.length; i += 1) {
      const tile = tileAnchors[i];
      const def = envTileDefs[tile?.defId];
      const tileRect = getSlotRect(
        regionTileGridRect,
        SETTLEMENT_SLOT_GRID_LAYOUT.regionColumns,
        1,
        i,
        SETTLEMENT_REGION_TILE_LAYOUT.slotPadding
      );
      drawCard(
        contentLayer,
        tileRect,
        def?.name ?? tile?.defId ?? "Tile",
        buildTileLines(tile),
        getTileCardFill(tile),
        tile?.defId === "tile_floodplains" ? PALETTE.active : PALETTE.stroke,
        null,
        {
          showBody: false,
          tooltipView,
        }
      );
    }
  }

  return {
    init: () => render(),
    refresh: () => {
      lastSignature = "";
      lastRenderGateKey = "";
      render();
    },
    update: () => render(),
    getScreenRect: () =>
      !root.visible || typeof root.getBounds !== "function" ? null : root.getBounds(),
    getSemanticSnapshot: () => buildRenderSemanticSnapshot(contentLayer, overlayLayer),
    destroy: () => {
      tooltipView?.hide?.();
      hideAgendaFlyoutNow();
      clearChildren(contentLayer);
      clearChildren(overlayLayer);
      root.removeFromParent();
      root.destroy({ children: true });
    },
  };
}
