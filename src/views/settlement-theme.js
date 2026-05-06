export const PALETTE = Object.freeze({
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
  practiceFloodFill: 0x53413f,
  practiceRiverFill: 0x54614d,
  practiceStrangerFill: 0x535048,
  practiceRomanFill: 0x4d4a52,
  passiveBorder: 0xa4be8d,
  passiveBorderMuted: 0x7c8d72,
  active: 0xd1ad44,
  inactive: 0x777168,
  mission: 0xd48f3f,
  missionSoft: 0x5c4630,
  missionFill: 0x564236,
  elderLozenge: 0x45403d,
  elderLozengeSoft: 0x595149,
  vassalCouncilFill: 0x4e4534,
  vassalCouncilStroke: 0xe3c46c,
  vassalCouncilBadgeFill: 0x3a342d,
  vassalDead: 0xd2735f,
  bustBackdrop: 0x686056,
  bustDark: 0x40362f,
  flyout: 0x3f3935,
  hitArea: 0xffffff,
  chaosPoolOuter: 0x3b3532,
  chaosPoolCore: 0x534b46,
  chaosCardFill: 0x443d39,
  chaosMeterTrack: 0x322d2a,
  chaosStatMeterTrack: 0x2f2a28,
  chaosSharedPanel: 0x4a433f,
  chaosGodPanel: 0x443a37,
  chaosSpawnAccent: 0x9f8550,
  faithPanel: 0x3f3935,
  faithMitigationInactive: 0x43534a,
  moodPanel: 0x3f3935,
  memoryBarBase: 0x4a4743,
  moodFullBase: 0x544e49,
  moodMissBase: 0x54413d,
  classAdultsFill: 0x4b4a3d,
  classYouthFill: 0x444f57,
  classFreeFill: 0x42513c,
  riverTileCard: 0x7b9a89,
  eventLogEmptyFill: 0x243145,
  eventLogRowFill: 0x2c3b55,
  eventLogRowStroke: 0x4fa2ff,
  debugOverrideFill: 0x2d4d57,
  debugOverrideStroke: 0x7bdff2,
});

export const TEXT_STYLES = Object.freeze({
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

export const ELDER_BUST_SKIN_TONES = Object.freeze([
  0xcab59c,
  0xb89d82,
  0xa7876f,
  0x8c6f5b,
]);

export const ELDER_BUST_ACCENT_TONES = Object.freeze([
  0x7d6b4d,
  0x6f7a88,
  0x725b76,
  0x5d7d66,
  0x916443,
]);

export const FAITH_TIER_ORDER = Object.freeze(["bronze", "silver", "gold", "diamond"]);

export const FAITH_TIER_COLORS = Object.freeze({
  bronze: 0xb98155,
  silver: 0xc6ccd6,
  gold: 0xe0bf54,
  diamond: 0x8dd5e8,
});

export const HAPPINESS_STATE_ORDER = Object.freeze(["negative", "neutral", "positive"]);

export const HAPPINESS_STATE_COLORS = Object.freeze({
  negative: 0xc86a5c,
  neutral: 0xb7a98a,
  positive: 0x8dbb6f,
});
