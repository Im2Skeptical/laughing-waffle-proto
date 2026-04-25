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
