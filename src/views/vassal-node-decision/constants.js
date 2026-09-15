// Layout and colour constants for the Vassal node-decision modal.

export const PANEL = Object.freeze({ x: 128, y: 128, width: 2180, height: 714 });
export const TITLE_PLAQUE = Object.freeze({
  x: PANEL.x + 4, overlapY: 48, width: 360, height: 86,
});
export const CONFIRM_DOCK = Object.freeze({
  width: 300, height: 156, right: 36, bottom: 22,
});
export const MORTALITY_PLATE = Object.freeze({
  width: 360, height: 108, gap: 16,
});
export const CONTENT = Object.freeze({
  labelY: 50, cardY: 80, settlementMetaY: 148,
  practiceY: 168, structureLabelY: 396, structureY: 418,
});
export const QUALITY_COLORS = Object.freeze({
  bronze: 0xb07a4b, silver: 0xbfc7d5, gold: 0xe2bd55, diamond: 0x83dbea,
});
export const COST_FOOTER_HEIGHT = 148;
export const OPTION_COLUMN = Object.freeze({
  width: 338, height: 280, gap: 22, costGap: 8,
});
