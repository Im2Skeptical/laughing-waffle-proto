export const VASSAL_LIFE_MAP_GRAPH_SCHEMA_VERSION = 1;
export const VASSAL_PHASES_PER_YEAR = 30;
const VASSAL_TIME_COST_MULTIPLIER = 3.6;
const increasedPhaseCost = (baseCost) => Math.round(baseCost * VASSAL_TIME_COST_MULTIPLIER);

export const VASSAL_NODE_FAMILIES = Object.freeze({
  patronage: Object.freeze({
    id: "patronage", label: "Patronage", glyph: "P", color: 0xb88449,
    description: "Opportunities to gain Prestige.",
  }),
  development: Object.freeze({
    id: "development", label: "Development", glyph: "D", color: 0x5e9bcf,
    description: "Study to improve this Vassal's abilities.",
  }),
  travel: Object.freeze({
    id: "travel", label: "Travel", glyph: "T", color: 0x62ad82,
    description: "Move this Vassal to another player settlement.",
  }),
  practiceReform: Object.freeze({
    id: "practiceReform", label: "Practice Reform", glyph: "PR", color: 0xa46fc4,
    description: "Add or replace a Practice at this Vassal's current settlement.",
  }),
  publicWorks: Object.freeze({
    id: "publicWorks", label: "Public Works", glyph: "PW", color: 0xd17e68,
    description: "Build a Structure at this Vassal's current settlement.",
  }),
  routes: Object.freeze({
    id: "routes", label: "Routes", glyph: "R", color: 0xd0ac55,
    description: "Add or remove a world connection at this Vassal's current settlement.",
  }),
  crisis: Object.freeze({
    id: "crisis", label: "Crisis", glyph: "!", color: 0xca5b5b,
    description: "Take a risky action with immediate consequences.",
  }),
  legacy: Object.freeze({
    id: "legacy", label: "Legacy", glyph: "L", color: 0x8a86d1,
    description: "Secure an advantage for future Vassal candidates.",
  }),
});

export const VASSAL_NORMAL_NODE_FAMILY_IDS = Object.freeze([
  "patronage", "development", "travel", "practiceReform",
  "publicWorks", "routes", "crisis",
]);

export const VASSAL_LIFE_TUNING = Object.freeze({
  candidateCount: 3,
  candidateAgeMin: 18,
  candidateAgeMax: 26,
  candidatePrestigeMin: 8,
  candidatePrestigeMax: 14,
  candidateStatMin: 0,
  candidateStatMax: 2,
  basePrestigeIncome: 3,
  baseDevelopmentIncome: 2,
  developmentThreshold: 10,
  discountPerStat: 0.08,
  maximumDiscount: 0.6,
  phasesPerTravelStep: increasedPhaseCost(VASSAL_PHASES_PER_YEAR),
  travelOptionCount: 3,
  emptyShopConfirmPhaseCost: VASSAL_PHASES_PER_YEAR * 2,
  shopRerollPrestigeCost: 6,
  shopRerollPhaseCost: increasedPhaseCost(VASSAL_PHASES_PER_YEAR * 2),
  routeAddPrestigeCost: 16,
  routeAddPhaseCost: increasedPhaseCost(VASSAL_PHASES_PER_YEAR * 3),
  routeRemovePrestigeCost: 10,
  routeRemovePhaseCost: increasedPhaseCost(VASSAL_PHASES_PER_YEAR * 2),
  legacyPrestigeCost: 20,
  legacyPhaseCost: increasedPhaseCost(VASSAL_PHASES_PER_YEAR * 4),
  legacyStartingPrestigeBonus: 3,
  legacyStartingPrestigeBonusCap: 12,
  crisisImmediateDeathChance: 0.35,
});

export const VASSAL_PATRONAGE_OPTIONS = Object.freeze([
  Object.freeze({ id: "immediateFavor", label: "Immediate Favor", prestigeDelta: 8, phaseCost: increasedPhaseCost(VASSAL_PHASES_PER_YEAR) }),
  Object.freeze({ id: "longAppointment", label: "Long Appointment", prestigeDelta: 20, phaseCost: increasedPhaseCost(VASSAL_PHASES_PER_YEAR * 4) }),
  Object.freeze({ id: "cultivateConnections", label: "Cultivate Connections", prestigeDelta: 5, statId: "cunning", statDelta: 1, phaseCost: increasedPhaseCost(VASSAL_PHASES_PER_YEAR * 3) }),
]);

export const VASSAL_DEVELOPMENT_OPTIONS = Object.freeze([
  Object.freeze({ id: "studyStatecraft", label: "Study Statecraft", statId: "intelligence", statDelta: 1, phaseCost: increasedPhaseCost(VASSAL_PHASES_PER_YEAR * 2) }),
  Object.freeze({ id: "practiceLeadership", label: "Practice Leadership", statId: "effectiveness", statDelta: 1, phaseCost: increasedPhaseCost(VASSAL_PHASES_PER_YEAR * 2) }),
  Object.freeze({ id: "studyIntrigue", label: "Study Intrigue", statId: "cunning", statDelta: 1, phaseCost: increasedPhaseCost(VASSAL_PHASES_PER_YEAR * 2) }),
  Object.freeze({ id: "broadEducation", label: "Broad Education", statId: "wisdom", statDelta: 1, phaseCost: increasedPhaseCost(VASSAL_PHASES_PER_YEAR * 4) }),
]);

export const VASSAL_CRISIS_OPTIONS = Object.freeze([
  Object.freeze({ id: "negotiate", label: "Negotiate", prestigeCost: 8, phaseCost: increasedPhaseCost(VASSAL_PHASES_PER_YEAR * 3) }),
  Object.freeze({ id: "rallyLoyalists", label: "Rally Loyalists", prestigeDelta: 25, phaseCost: increasedPhaseCost(VASSAL_PHASES_PER_YEAR * 2), immediateDeathChance: VASSAL_LIFE_TUNING.crisisImmediateDeathChance }),
  Object.freeze({ id: "flee", label: "Flee", prestigeDelta: -6, phaseCost: increasedPhaseCost(VASSAL_PHASES_PER_YEAR), forcedRelocation: true }),
]);

export const VASSAL_LEGACY_OPTIONS = Object.freeze([
  Object.freeze({
    id: "foundDynasty",
    label: "Found a Dynasty",
    prestigeCost: VASSAL_LIFE_TUNING.legacyPrestigeCost * 2,
    phaseCost: VASSAL_LIFE_TUNING.legacyPhaseCost,
    legacyStartingPrestigeBonus: VASSAL_LIFE_TUNING.legacyStartingPrestigeBonus * 2,
  }),
  Object.freeze({
    id: "enduringOffice",
    label: "Enduring Office",
    prestigeCost: VASSAL_LIFE_TUNING.legacyPrestigeCost,
    phaseCost: VASSAL_LIFE_TUNING.legacyPhaseCost,
    legacyStartingPrestigeBonus: VASSAL_LIFE_TUNING.legacyStartingPrestigeBonus,
  }),
  Object.freeze({
    id: "humbleRemembrance",
    label: "Humble Remembrance",
    prestigeCost: 0,
    phaseCost: 0,
    legacyStartingPrestigeBonus: 1,
  }),
]);

export const VASSAL_STAT_IDS = Object.freeze([
  "cunning", "wisdom", "effectiveness", "intelligence",
]);

export const VASSAL_LEVEL_UP_STAT_IDS = VASSAL_STAT_IDS;

export function getVassalMortalityChance(age) {
  const safeAge = Math.max(0, Math.floor(age ?? 0));
  if (safeAge < 40) return 0;
  if (safeAge < 50) return 0.005;
  if (safeAge < 60) return 0.02;
  if (safeAge < 70) return 0.06;
  if (safeAge < 80) return 0.15;
  return 0.35;
}
