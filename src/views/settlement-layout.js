export const ORDER_PANEL_LAYOUT = Object.freeze({
  padding: 16,
  gap: 18,
  leftRatio: 0.56,
});

export const SETTLEMENT_PANEL_RECTS = Object.freeze({
  hub: Object.freeze({ x: 70, y: 120, width: 1080, height: 700 }),
  vassal: Object.freeze({ x: 1170, y: 120, width: 560, height: 620 }),
  chaos: Object.freeze({ x: 1760, y: 120, width: 540, height: 260 }),
  region: Object.freeze({ x: 1760, y: 400, width: 540, height: 230 }),
  classColumn: Object.freeze({ x: 100, y: 188, width: 220, height: 300 }),
  order: Object.freeze({ x: 344, y: 184, width: 776, height: 220 }),
  practice: Object.freeze({ x: 344, y: 434, width: 776, height: 176 }),
  structures: Object.freeze({ x: 90, y: 630, width: 1030, height: 124 }),
  resourceBand: Object.freeze({ x: 110, y: 836, width: 1560, height: 44 }),
});

export const SETTLEMENT_TOPBAR_LAYOUT = Object.freeze({
  height: 70,
  seasonY: 24,
  lossY: 50,
});

export const SETTLEMENT_SECTION_LABEL_LAYOUT = Object.freeze({
  hubY: 148,
  vassalY: 148,
  orderY: 172,
  practiceY: 416,
  structuresY: 610,
  regionYOffset: 30,
});

export const SETTLEMENT_RESOURCE_CHIP_LAYOUT = Object.freeze({
  yOffset: 2,
  gap: 12,
  widths: Object.freeze({
    food: 190,
    red: 140,
    blue: 140,
    black: 150,
  }),
});

export const SETTLEMENT_CLASS_COLUMN_LAYOUT = Object.freeze({
  gap: 12,
  minCardHeight: 92,
});

export const SETTLEMENT_SLOT_GRID_LAYOUT = Object.freeze({
  practiceColumns: 5,
  structureColumns: 6,
  regionColumns: 5,
});

export const SETTLEMENT_PRACTICE_CARD_LAYOUT = Object.freeze({
  width: 148,
  gap: 16,
  xInset: 14,
  yInset: 24,
  heightInset: 48,
});

export const SETTLEMENT_STRUCTURE_CARD_LAYOUT = Object.freeze({
  width: 154,
  gap: 18,
  xInset: 14,
  yInset: 18,
  heightInset: 36,
  wordWrapInset: 28,
});

export const SETTLEMENT_REGION_TILE_LAYOUT = Object.freeze({
  xInset: 20,
  yOffset: 70,
  width: 88,
  heightInset: 100,
  stepX: 100,
});

export const SETTLEMENT_VASSAL_PANEL_LAYOUT = Object.freeze({
  headerY: 32,
  emptyMessage: Object.freeze({
    xInset: 26,
    yOffset: 82,
  }),
  title: Object.freeze({
    xInset: 26,
    yOffset: 74,
    reservedStatusWidth: 124,
  }),
  status: Object.freeze({
    rightInset: 28,
    yOffset: 78,
    maxWidth: 104,
  }),
  agenda: Object.freeze({
    xInset: 20,
    yOffset: 112,
    widthInset: 40,
    height: 104,
    titleXInset: 14,
    titleYOffset: 10,
    cardXInset: 16,
    cardYOffset: 36,
    cardWidth: 84,
    cardHeight: 52,
    cardGap: 8,
    visibleCount: 3,
  }),
  stats: Object.freeze({
    xInset: 20,
    yOffset: 232,
    width: 276,
    height: 144,
    titleXInset: 14,
    titleYOffset: 10,
    bodyXInset: 14,
    bodyYOffset: 40,
    bodyWidthInset: 28,
  }),
  bust: Object.freeze({
    rightInset: 20,
    yOffset: 232,
    width: 164,
    height: 144,
  }),
  eventLog: Object.freeze({
    xInset: 20,
    yOffset: 394,
    widthInset: 40,
    heightInset: 416,
    titleXInset: 2,
    titleYOffset: -28,
    rowGap: 10,
    minRowHeight: 52,
    textXInset: 18,
    titleYOffsetInRow: 10,
    metaBottomInset: 20,
    textWidthInset: 36,
  }),
});

export const SETTLEMENT_CHAOS_PANEL_LAYOUT = Object.freeze({
  titleY: 18,
  shared: Object.freeze({
    xInset: 12,
    yOffset: 46,
    widthInset: 24,
    height: 92,
    sigilXOffset: 38,
    labelXOffset: 74,
    labelYOffset: 8,
    power: Object.freeze({ xOffset: 74, yOffset: 26, width: 168, height: 42 }),
    income: Object.freeze({ xOffset: 252, yOffset: 26, width: 240, height: 42 }),
  }),
  god: Object.freeze({
    xInset: 12,
    yOffset: 146,
    widthInset: 24,
    heightInset: 158,
    sigilXOffset: 40,
    textXOffset: 82,
    titleYOffset: 8,
    subtitleYOffset: 30,
    statXOffset: 186,
    nextSpawnYOffset: 14,
    monstersYOffset: 50,
    statWidth: 296,
    statHeight: 28,
  }),
});

export const SETTLEMENT_CLASS_SUMMARY_CARD_LAYOUT = Object.freeze({
  radius: 18,
  selectedStrokeWidth: 3,
  strokeWidth: 2,
  title: Object.freeze({
    x: 16,
    y: 12,
    maxWidth: 92,
  }),
  population: Object.freeze({
    rightInset: 16,
    y: 16,
    maxWidth: 116,
  }),
  stats: Object.freeze({
    xInset: 16,
    y: 34,
    gap: 8,
    count: 3,
  }),
  faith: Object.freeze({
    xInset: 16,
    y: 58,
    widthInset: 32,
    height: 36,
  }),
  mood: Object.freeze({
    xInset: 16,
    y: 98,
    widthInset: 32,
    minHeight: 36,
    heightInset: 108,
  }),
  statPill: Object.freeze({
    height: 20,
    labelXInset: 8,
    labelYOffset: 5,
    valueRightInset: 8,
  }),
});
