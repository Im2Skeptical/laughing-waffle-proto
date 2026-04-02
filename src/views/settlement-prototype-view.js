import { envTileDefs } from "../defs/gamepieces/env-tiles-defs.js";
import { hubStructureDefs } from "../defs/gamepieces/hub-structure-defs.js";
import { settlementOrderDefs } from "../defs/gamepieces/settlement-order-defs.js";
import { settlementPracticeDefs } from "../defs/gamepieces/settlement-practice-defs.js";
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
  getSettlementTileGreenResource,
} from "../model/settlement-state.js";

const PALETTE = Object.freeze({
  background: 0x847b68,
  topbar: 0x413834,
  panel: 0x5d564d,
  panelSoft: 0x6d655b,
  slot: 0x7b7368,
  card: 0x4f4a4a,
  cardMuted: 0x4a4744,
  tileCard: 0x7e9874,
  tileCardDark: 0x504b49,
  stroke: 0x4f4b48,
  chip: 0x4b4743,
  text: 0xf7f2e9,
  textMuted: 0xd7d0c3,
  accent: 0xd7b450,
  red: 0xbe6352,
  green: 0x7fa568,
  blue: 0x5d7ea6,
  black: 0x2d2b2a,
  practiceDrainRed: 0xd2735f,
  practiceDrainGreen: 0x90b276,
  practiceDrainNeutral: 0xd7b450,
  passiveBorder: 0xa4be8d,
  passiveBorderMuted: 0x7c8d72,
  active: 0xd1ad44,
  inactive: 0x777168,
});

const TEXT_STYLES = Object.freeze({
  title: {
    fontFamily: "Georgia",
    fontSize: 24,
    fontWeight: "bold",
    fill: PALETTE.text,
  },
  header: {
    fontFamily: "Georgia",
    fontSize: 36,
    fontWeight: "bold",
    fill: PALETTE.text,
  },
  chip: {
    fontFamily: "Georgia",
    fontSize: 16,
    fontWeight: "bold",
    fill: PALETTE.text,
  },
  cardTitle: {
    fontFamily: "Georgia",
    fontSize: 19,
    fontWeight: "bold",
    fill: PALETTE.text,
  },
  body: {
    fontFamily: "Georgia",
    fontSize: 14,
    fill: PALETTE.text,
  },
  muted: {
    fontFamily: "Georgia",
    fontSize: 13,
    fill: PALETTE.textMuted,
  },
});

function roundedRect(
  gfx,
  x,
  y,
  width,
  height,
  radius,
  fill,
  stroke,
  strokeWidth = 3,
  fillAlpha = 1,
  strokeAlpha = 0.95
) {
  gfx.lineStyle(strokeWidth, stroke, strokeAlpha);
  gfx.beginFill(fill, fillAlpha);
  gfx.drawRoundedRect(x, y, width, height, radius);
  gfx.endFill();
}

function clearChildren(container) {
  const children = Array.isArray(container?.children) ? [...container.children] : [];
  for (const child of children) {
    container.removeChild(child);
    child.destroy?.({ children: true });
  }
}

function createText(label, style, x, y, anchorX = 0, anchorY = 0) {
  const text = new PIXI.Text(label, style);
  text.anchor.set(anchorX, anchorY);
  text.x = x;
  text.y = y;
  return text;
}

function capitalizeTier(value) {
  const text = typeof value === "string" ? value : "";
  if (!text.length) return "None";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function capitalizeLabel(value) {
  const text = typeof value === "string" ? value : "";
  if (!text.length) return "None";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function formatPartialFeedMemory(partialFeedRatios) {
  const ratios = Array.isArray(partialFeedRatios) ? partialFeedRatios : [];
  if (!ratios.length) return "None";
  return ratios
    .map((value) => `${Math.round((Number.isFinite(value) ? Number(value) : 0) * 100)}%`)
    .join(" -> ");
}

function formatPracticeBlockedReason(reason) {
  const text = typeof reason === "string" ? reason : "";
  if (!text.length) return "";
  if (text.startsWith("faithTier:")) {
    return `faith ${capitalizeTier(text.slice("faithTier:".length))}+`;
  }
  return text
    .replace(/^stockpileHigh:/, "")
    .replace(/^stockpile:/, "")
    .replace(/^capability:/, "")
    .replace(/^priority$/, "higher priority practice")
    .replace(/^mirrorSource$/, "villager practice")
    .replace(/^seasonMismatch$/, "season")
    .replace(/^freePopulation$/, "free population");
}

function buildSignature(state, selectedClassId) {
  const summary = getSettlementPopulationSummary(state);
  const classIds = getSettlementClassIds(state);
  const practiceCardsByClass = {};
  for (const classId of classIds) {
    practiceCardsByClass[classId] = getSettlementPracticeSlotsByClass(state, classId).map(
      (slot) => ({
        defId: slot?.card?.defId ?? null,
        runtime: slot?.card?.props?.settlement ?? null,
      })
    );
  }
  const structures = getSettlementStructureSlots(state).map((slot) => ({
    defId: slot?.structure?.defId ?? null,
    runtime: slot?.structure?.props?.settlement ?? null,
  }));
  const orderCards = getSettlementOrderSlots(state).map((slot) => slot?.card?.defId ?? null);
  const tiles = Array.isArray(state?.board?.layers?.tile?.anchors)
    ? state.board.layers.tile.anchors.map((tile) => ({
        defId: tile?.defId ?? null,
        greenResourceStored: getSettlementTileGreenResource(tile),
      }))
    : [];
  return JSON.stringify({
    tSec: Math.floor(state?.tSec ?? 0),
    season: getCurrentSeasonKey(state),
    year: Math.floor(state?.year ?? 1),
    previewing: state !== null,
    selectedClassId,
    classIds,
    summary,
    stockpiles: {
      food: getSettlementStockpile(state, "food"),
      red: getSettlementStockpile(state, "redResource"),
      green: getSettlementStockpile(state, "greenResource"),
      blue: getSettlementStockpile(state, "blueResource"),
      black: getSettlementStockpile(state, "blackResource"),
    },
    classSummaries: classIds.map((classId) => ({
      classId,
      population: getSettlementPopulationSummary(state, classId),
      faith: getSettlementFaithSummary(state, classId),
      happiness: getSettlementHappinessSummary(state, classId),
    })),
    orderCards,
    practiceCardsByClass,
    structures,
    tiles,
  });
}

function buildPracticeLines(card) {
  const def = settlementPracticeDefs[card?.defId];
  const practiceMode = def?.practiceMode === "passive" ? "passive" : "active";
  const runtime =
    card?.props?.settlement && typeof card.props.settlement === "object"
      ? card.props.settlement
      : {};
  const lines = Array.isArray(def?.ui?.lines) ? [...def.ui.lines] : [];
  if (runtime.mirroredPracticeTitle) {
    lines.push(`Mirroring: ${runtime.mirroredPracticeTitle}`);
  }
  if (practiceMode === "passive") {
    if (runtime.lastAmount > 0 && Number.isFinite(runtime.lastRunSec)) {
      lines.push(`Last pulse: ${Math.floor(runtime.lastAmount)} at ${Math.floor(runtime.lastRunSec)}s`);
    }
    if (runtime.blockedReason) {
      lines.push(`Dormant: ${formatPracticeBlockedReason(runtime.blockedReason)}`);
    }
    return lines;
  }
  if (runtime.activeReservation) {
    lines.push(
      `Active: ${Math.floor(runtime.activeAmount ?? runtime.pendingPopulation ?? 0)} pop, ${Math.max(0, Math.floor(runtime.activeRemainingSec ?? 0))}s left`
    );
  }
  if (
    runtime.activeReservation !== true &&
    runtime.activeProgressKind === "cadence" &&
    Number.isFinite(runtime.activeRemainingSec)
  ) {
    lines.push(`Next trigger: ${Math.max(0, Math.floor(runtime.activeRemainingSec ?? 0))}s`);
  }
  if (!runtime.activeReservation && runtime.lastAmount > 0 && Number.isFinite(runtime.lastRunSec)) {
    lines.push(`Last run: ${Math.floor(runtime.lastAmount)} at ${Math.floor(runtime.lastRunSec)}s`);
  }
  if (!runtime.activeReservation && runtime.available) {
    lines.push(`Ready: ${Math.floor(runtime.previewAmount ?? 0)} population available`);
  } else if (!runtime.activeReservation && runtime.blockedReason) {
    lines.push(`Waiting: ${formatPracticeBlockedReason(runtime.blockedReason)}`);
  }
  return lines;
}

function buildStructureLines(structure) {
  const def = hubStructureDefs[structure?.defId];
  const runtime =
    structure?.props?.settlement && typeof structure.props.settlement === "object"
      ? structure.props.settlement
      : {};
  const lines = Array.isArray(def?.ui?.lines) ? [...def.ui.lines] : [];
  if (runtime.staffingRequired > 0) {
    lines.push(
      runtime.active
        ? `Staffed: ${Math.floor(runtime.reservedPopulation ?? 0)} population`
        : `Needs ${Math.floor(runtime.staffingRequired)} population`
    );
  } else {
    lines.push("Passive structure");
  }
  return lines;
}

function buildOrderLines(card) {
  const def = settlementOrderDefs[card?.defId];
  return Array.isArray(def?.ui?.lines) ? [...def.ui.lines] : [];
}

function buildTileLines(tile) {
  const def = envTileDefs[tile?.defId];
  if (tile?.defId === "tile_floodplains") {
    return [
      "Every autumn flood,",
      "every spring deposit",
      "5 greenResource.",
      `Stored Green: ${getSettlementTileGreenResource(tile)}`,
    ];
  }
  const description = def?.ui?.description;
  if (typeof description === "string" && description.length > 0) {
    return [description];
  }
  return [];
}

function drawSlotGrid(gfx, rect, columns, rows) {
  const colCount = Math.max(1, Math.floor(columns));
  const rowCount = Math.max(1, Math.floor(rows));
  const cellWidth = rect.width / colCount;
  const cellHeight = rect.height / rowCount;
  for (let row = 0; row < rowCount; row += 1) {
    for (let col = 0; col < colCount; col += 1) {
      roundedRect(
        gfx,
        rect.x + col * cellWidth + 6,
        rect.y + row * cellHeight + 6,
        cellWidth - 12,
        cellHeight - 12,
        18,
        PALETTE.slot,
        PALETTE.stroke,
        2
      );
    }
  }
}

function drawCard(container, rect, title, lines, fill, outline = PALETTE.stroke) {
  const gfx = new PIXI.Graphics();
  roundedRect(gfx, rect.x, rect.y, rect.width, rect.height, 22, fill, outline, 3);
  container.addChild(gfx);

  const titleText = createText(title, TEXT_STYLES.cardTitle, rect.x + 16, rect.y + 14);
  container.addChild(titleText);

  const body = createText(
    lines.join("\n"),
    {
      ...TEXT_STYLES.body,
      fontSize: 13,
      wordWrap: true,
      wordWrapWidth: rect.width - 32,
      lineHeight: 18,
    },
    rect.x + 16,
    rect.y + 44
  );
  container.addChild(body);
}

function getPracticeDrainColor(card) {
  switch (card?.defId) {
    case "floodRites":
      return PALETTE.practiceDrainRed;
    case "riverRecessionFarming":
      return PALETTE.practiceDrainGreen;
    default:
      return PALETTE.practiceDrainNeutral;
  }
}

function drawPracticeCard(container, rect, card, title, lines, fill, outline = PALETTE.stroke) {
  const def = settlementPracticeDefs[card?.defId];
  const practiceMode = def?.practiceMode === "passive" ? "passive" : "active";
  const runtime =
    card?.props?.settlement && typeof card.props.settlement === "object"
      ? card.props.settlement
      : {};
  const gfx = new PIXI.Graphics();
  roundedRect(
    gfx,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    practiceMode === "passive" ? 16 : 22,
    fill,
    outline,
    practiceMode === "passive" ? 4 : 3
  );
  container.addChild(gfx);

  if (
    (runtime.activeReservation === true || runtime.activeProgressKind === "cadence") &&
    Number.isFinite(runtime.activeProgressRemaining)
  ) {
    const innerX = rect.x + 4;
    const innerY = rect.y + 4;
    const innerWidth = Math.max(0, rect.width - 8);
    const innerHeight = Math.max(0, rect.height - 8);
    const fillHeight = innerHeight * Math.max(0, Math.min(1, runtime.activeProgressRemaining));

    const drainFill = new PIXI.Graphics();
    roundedRect(
      drainFill,
      innerX,
      innerY,
      innerWidth,
      innerHeight,
      practiceMode === "passive" ? 12 : 18,
      getPracticeDrainColor(card),
      outline,
      0,
      0.42,
      0
    );
    container.addChild(drainFill);

    const drainMask = new PIXI.Graphics();
    if (fillHeight > 0.0001) {
      const drainY = innerY + innerHeight - fillHeight;
      drainMask.beginFill(0xffffff, 1);
      drainMask.drawRect(innerX, drainY, innerWidth, fillHeight + 1);
      drainMask.endFill();
    }
    container.addChild(drainMask);
    drainFill.mask = drainMask;
  }

  const titleText = createText(title, TEXT_STYLES.cardTitle, rect.x + 16, rect.y + 14);
  container.addChild(titleText);

  const body = createText(
    lines.join("\n"),
    {
      ...TEXT_STYLES.body,
      fontSize: 13,
      wordWrap: true,
      wordWrapWidth: rect.width - 32,
      lineHeight: 18,
    },
    rect.x + 16,
    rect.y + 44
  );
  container.addChild(body);
}

function drawChip(container, x, y, width, label, value, color = PALETTE.chip) {
  const gfx = new PIXI.Graphics();
  roundedRect(gfx, x, y, width, 40, 16, color, PALETTE.stroke, 2);
  container.addChild(gfx);
  container.addChild(createText(label, TEXT_STYLES.muted, x + 12, y + 7));
  container.addChild(createText(String(value), TEXT_STYLES.chip, x + width - 14, y + 20, 1, 0.5));
}

function drawClassSummaryCard(container, rect, classId, population, faith, happiness, selected) {
  const gfx = new PIXI.Graphics();
  roundedRect(
    gfx,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    18,
    selected ? PALETTE.panel : PALETTE.cardMuted,
    selected ? PALETTE.active : PALETTE.stroke,
    selected ? 3 : 2
  );
  container.addChild(gfx);
  container.addChild(
    createText(capitalizeLabel(classId), TEXT_STYLES.cardTitle, rect.x + 16, rect.y + 12)
  );
  const lines = [
    `Adults ${Math.floor(population?.adults ?? 0)}  Youth ${Math.floor(population?.youth ?? 0)}`,
    `Total ${Math.floor(population?.total ?? 0)}  Free ${Math.floor(population?.free ?? 0)}`,
    `Reserved ${Math.floor(population?.reserved ?? 0)}`,
    `Faith ${capitalizeTier(faith?.tier)}  Mood ${capitalizeLabel(happiness?.status)}`,
    `${Math.floor(happiness?.fullFeedStreak ?? 0)}/${Math.floor(happiness?.fullFeedThreshold ?? 0)} full  ${Math.floor(happiness?.missedFeedStreak ?? 0)}/${Math.floor(happiness?.missedFeedThreshold ?? 0)} missed`,
    `Partial ${formatPartialFeedMemory(happiness?.partialFeedRatios)}`,
  ];
  container.addChild(
    createText(
      lines.join("\n"),
      {
        ...TEXT_STYLES.body,
        fontSize: 12,
        lineHeight: 16,
      },
      rect.x + 16,
      rect.y + 42
    )
  );
}

function createClassTab(label, rect, selected, onTap) {
  const root = new PIXI.Container();
  const gfx = new PIXI.Graphics();
  roundedRect(
    gfx,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    18,
    selected ? PALETTE.card : PALETTE.panelSoft,
    selected ? PALETTE.active : PALETTE.stroke,
    selected ? 3 : 2
  );
  root.addChild(gfx);
  root.addChild(createText(label, TEXT_STYLES.chip, rect.x + rect.width * 0.5, rect.y + rect.height * 0.5, 0.5, 0.5));
  root.eventMode = "static";
  root.cursor = "pointer";
  root.on("pointertap", () => onTap?.());
  return root;
}

function getTileCardFill(tile) {
  if (tile?.defId === "tile_floodplains") return PALETTE.cardMuted;
  return tile?.defId === "tile_river" ? 0x7b9a89 : PALETTE.tileCard;
}

export function createSettlementPrototypeView({
  app,
  layer,
  getState,
  getSelectedPracticeClassId,
  setSelectedPracticeClassId,
} = {}) {
  const root = new PIXI.Container();
  layer?.addChild(root);
  let lastSignature = "";

  function render() {
    const state = typeof getState === "function" ? getState() : null;
    if (!state) return;
    const classIds = getSettlementClassIds(state);
    const selectedClassId =
      (typeof getSelectedPracticeClassId === "function" && getSelectedPracticeClassId()) ||
      classIds[0] ||
      "villager";
    const signature = buildSignature(state, selectedClassId);
    if (signature === lastSignature) return;
    lastSignature = signature;

    clearChildren(root);

    const screenWidth = Math.floor(app?.screen?.width ?? 2424);
    const screenHeight = Math.floor(app?.screen?.height ?? 1080);

    const background = new PIXI.Graphics();
    background.beginFill(PALETTE.background, 1);
    background.drawRect(0, 0, screenWidth, screenHeight);
    background.endFill();
    root.addChild(background);

    const topbar = new PIXI.Graphics();
    roundedRect(topbar, 0, 0, screenWidth, 70, 0, PALETTE.topbar, PALETTE.topbar, 0);
    root.addChild(topbar);

    const seasonText = `${getCurrentSeasonKey(state).toUpperCase()}  •  Year ${Math.floor(
      state?.year ?? 1
    )}`;
    root.addChild(createText(seasonText, TEXT_STYLES.header, screenWidth * 0.5, 35, 0.5, 0.5));

    const hubPanelRect = { x: 120, y: 120, width: 1180, height: 700 };
    const regionPanelRect = { x: 1430, y: 180, width: 830, height: 590 };
    const orderRect = { x: 140, y: 260, width: 240, height: 300 };
    const classStripRect = { x: 430, y: 208, width: 850, height: 126 };
    const classTabsRect = { x: 430, y: 344, width: 850, height: 34 };
    const practiceRect = { x: 430, y: 388, width: 850, height: 224 };
    const structuresRect = { x: 140, y: 630, width: 1140, height: 170 };

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
    root.addChild(panelGfx);

    root.addChild(createText(state?.locationNames?.hub ?? "Hub", TEXT_STYLES.header, 700, 175, 0.5, 0.5));
    root.addChild(
      createText(state?.locationNames?.region ?? "Region", TEXT_STYLES.header, 1845, 210, 0.5, 0.5)
    );
    root.addChild(createText("Order", TEXT_STYLES.title, 260, 235, 0.5, 0.5));
    root.addChild(
      createText(`Practice - ${capitalizeLabel(selectedClassId)}`, TEXT_STYLES.title, 855, 365, 0.5, 0.5)
    );
    root.addChild(createText("Structures", TEXT_STYLES.title, 710, 605, 0.5, 0.5));

    const foodCapacity = Math.floor(state?.hub?.core?.props?.foodCapacity ?? 0);
    const chipsLayer = new PIXI.Container();
    root.addChild(chipsLayer);
    drawChip(
      chipsLayer,
      430,
      148,
      180,
      "Food",
      `${getSettlementStockpile(state, "food")}/${foodCapacity}`,
      PALETTE.chip
    );
    drawChip(chipsLayer, 620, 148, 140, "Red", getSettlementStockpile(state, "redResource"), PALETTE.red);
    drawChip(chipsLayer, 770, 148, 150, "Green", getSettlementStockpile(state, "greenResource"), PALETTE.green);
    drawChip(chipsLayer, 930, 148, 140, "Blue", getSettlementStockpile(state, "blueResource"), PALETTE.blue);
    drawChip(chipsLayer, 1080, 148, 150, "Black", getSettlementStockpile(state, "blackResource"), PALETTE.black);

    const classLayer = new PIXI.Container();
    root.addChild(classLayer);
    const classCardWidth = Math.max(150, Math.floor((classStripRect.width - (classIds.length - 1) * 12) / Math.max(1, classIds.length)));
    for (let i = 0; i < classIds.length; i += 1) {
      const classId = classIds[i];
      drawClassSummaryCard(
        classLayer,
        {
          x: classStripRect.x + i * (classCardWidth + 12),
          y: classStripRect.y,
          width: classCardWidth,
          height: classStripRect.height,
        },
        classId,
        getSettlementPopulationSummary(state, classId),
        getSettlementFaithSummary(state, classId),
        getSettlementHappinessSummary(state, classId),
        classId === selectedClassId
      );
    }

    const tabsLayer = new PIXI.Container();
    root.addChild(tabsLayer);
    const tabWidth = 150;
    for (let i = 0; i < classIds.length; i += 1) {
      const classId = classIds[i];
      tabsLayer.addChild(
        createClassTab(
          capitalizeLabel(classId),
          {
            x: classTabsRect.x + i * (tabWidth + 10),
            y: classTabsRect.y,
            width: tabWidth,
            height: classTabsRect.height,
          },
          classId === selectedClassId,
          () => {
            setSelectedPracticeClassId?.(classId);
            lastSignature = "";
            render();
          }
        )
      );
    }

    drawSlotGrid(root.addChild(new PIXI.Graphics()), practiceRect, 5, 1);
    drawSlotGrid(root.addChild(new PIXI.Graphics()), structuresRect, 6, 1);
    drawSlotGrid(root.addChild(new PIXI.Graphics()), { x: regionPanelRect.x + 20, y: regionPanelRect.y + 70, width: 790, height: 470 }, 5, 1);

    const orderSlots = getSettlementOrderSlots(state);
    if (orderSlots[0]?.card) {
      const card = orderSlots[0].card;
      const def = settlementOrderDefs[card.defId];
      drawCard(
        root,
        { x: orderRect.x + 16, y: orderRect.y + 22, width: orderRect.width - 32, height: orderRect.height - 44 },
        def?.name ?? card.defId,
        buildOrderLines(card),
        PALETTE.cardMuted
      );
    }

    const practiceSlots = getSettlementPracticeSlotsByClass(state, selectedClassId);
    const practiceCardWidth = 154;
    for (let i = 0; i < practiceSlots.length; i += 1) {
      const card = practiceSlots[i]?.card ?? null;
      if (!card) continue;
      const def = settlementPracticeDefs[card.defId];
      const isPassivePractice = def?.practiceMode === "passive";
      const cardHeight = isPassivePractice ? practiceCardWidth : practiceRect.height - 48;
      const cardY =
        practiceRect.y + 24 + Math.max(0, Math.floor((practiceRect.height - 48 - cardHeight) * 0.5));
      drawPracticeCard(
        root,
        {
          x: practiceRect.x + 14 + i * 168,
          y: cardY,
          width: practiceCardWidth,
          height: cardHeight,
        },
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
            : PALETTE.stroke
      );
    }

    const structureSlots = getSettlementStructureSlots(state);
    const structureCardWidth = 168;
    for (let i = 0; i < structureSlots.length; i += 1) {
      const structure = structureSlots[i]?.structure ?? null;
      if (!structure) continue;
      const def = hubStructureDefs[structure.defId];
      drawCard(
        root,
        {
          x: structuresRect.x + 14 + i * 188,
          y: structuresRect.y + 18,
          width: structureCardWidth,
          height: structuresRect.height - 36,
        },
        def?.name ?? structure.defId,
        buildStructureLines(structure),
        structure?.props?.settlement?.active ? PALETTE.card : PALETTE.cardMuted,
        structure?.props?.settlement?.active ? PALETTE.active : PALETTE.stroke
      );
    }

    const tileAnchors = Array.isArray(state?.board?.layers?.tile?.anchors)
      ? state.board.layers.tile.anchors
      : [];
    for (let i = 0; i < tileAnchors.length; i += 1) {
      const tile = tileAnchors[i];
      const def = envTileDefs[tile?.defId];
      drawCard(
        root,
        {
          x: regionPanelRect.x + 20 + i * 158,
          y: regionPanelRect.y + 90,
          width: 146,
          height: 450,
        },
        def?.name ?? tile?.defId ?? "Tile",
        buildTileLines(tile),
        getTileCardFill(tile),
        tile?.defId === "tile_floodplains" ? PALETTE.active : PALETTE.stroke
      );
    }
  }

  return {
    init: () => render(),
    refresh: () => {
      lastSignature = "";
      render();
    },
    update: () => render(),
    getScreenRect: () =>
      !root.visible || typeof root.getBounds !== "function" ? null : root.getBounds(),
    destroy: () => {
      clearChildren(root);
      root.removeFromParent();
      root.destroy({ children: true });
    },
  };
}
