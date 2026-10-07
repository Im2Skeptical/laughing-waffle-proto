// Layout and colour constants for the Vassal node-decision modal.

export const PANEL = Object.freeze({ x: 44, y: 134, width: 2336, height: 708 });
export const TITLE_PLAQUE = Object.freeze({
  x: PANEL.x + 4, overlapY: 48, width: 360, height: 86,
});
export const CONFIRM_DOCK = Object.freeze({
  width: 308, height: 170, right: 28, bottom: 20,
});
export const MORTALITY_PLATE = Object.freeze({
  width: 640, height: 140, gap: 20,
});
export const CONTENT = Object.freeze({
  labelY: 54, cardY: 74, settlementMetaY: 102,
  practiceLabelY: 142, practiceY: 90, structureLabelY: 444, structureY: 488,
});
export const TABLEAU = Object.freeze({x:986, practiceY:224, structureY:622, width:1156, cardWidth:220, cardHeight:308, gap:14, discardX:2160, discardY:244, discardWidth:200, discardHeight:280});
export const QUALITY_COLORS = Object.freeze({
  bronze: 0xb07a4b, silver: 0xbfc7d5, gold: 0xe2bd55, diamond: 0x83dbea,
});
export const COST_FOOTER_HEIGHT = 112;
export const OPTION_COLUMN = Object.freeze({
  width: 282, choiceWidth: 338, height: 400, relicHeight: 450, gap: 16, costGap: 8,
});
