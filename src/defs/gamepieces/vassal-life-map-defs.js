// Each depth lists its visible nodes in top-to-bottom order.  Outgoing indices
// refer to the following depth and are intentionally data rather than a graph
// generation rule: preserving index order makes the drawn edges non-crossing.
const DEPTH_LAYOUT = Object.freeze([
  Object.freeze([{ family: "patronage", mapY: 0.38, outgoing: [0, 1] }, { family: "development", mapY: 0.64, outgoing: [1, 2] }]),
  Object.freeze([{ family: "development", mapY: 0.20, outgoing: [0, 1] }, { family: "travel", mapY: 0.49, outgoing: [1] }, { family: "practiceReform", mapY: 0.77, outgoing: [1, 2] }]),
  Object.freeze([{ family: "patronage", mapY: 0.30, outgoing: [0] }, { family: "publicWorks", mapY: 0.56, outgoing: [0, 1] }, { family: "travel", mapY: 0.80, outgoing: [1] }]),
  Object.freeze([{ family: "patronage", mapY: 0.40, outgoing: [0, 1] }, { family: "practiceReform", mapY: 0.68, outgoing: [1, 2] }]),
  Object.freeze([{ family: "travel", mapY: 0.24, outgoing: [0, 1] }, { family: "development", mapY: 0.51, outgoing: [1, 2] }, { family: "publicWorks", mapY: 0.78, outgoing: [2, 3] }]),
  Object.freeze([{ family: "practiceReform", mapY: 0.14, outgoing: [0] }, { family: "routes", mapY: 0.38, outgoing: [0, 1] }, { family: "publicWorks", mapY: 0.62, outgoing: [1, 2] }, { family: "crisis", mapY: 0.86, outgoing: [2] }]),
  Object.freeze([{ family: "practiceReform", mapY: 0.25, outgoing: [0] }, { family: "publicWorks", mapY: 0.49, outgoing: [0, 1] }, { family: "travel", mapY: 0.73, outgoing: [1] }]),
  Object.freeze([{ family: "crisis", mapY: 0.37, outgoing: [0, 1] }, { family: "practiceReform", mapY: 0.65, outgoing: [1, 2] }]),
  Object.freeze([{ family: "routes", mapY: 0.22, outgoing: [0, 1] }, { family: "crisis", mapY: 0.50, outgoing: [1] }, { family: "development", mapY: 0.78, outgoing: [1, 2] }]),
  Object.freeze([{ family: "legacy", mapY: 0.28, outgoing: [0, 1] }, { family: "publicWorks", mapY: 0.54, outgoing: [1] }, { family: "routes", mapY: 0.80, outgoing: [1, 2] }]),
  Object.freeze([{ family: "legacy", mapY: 0.36, outgoing: [] }, { family: "practiceReform", mapY: 0.62, outgoing: [] }, { family: "crisis", mapY: 0.84, outgoing: [] }]),
]);

export const VASSAL_LIFE_MAP_ID = "reference-life-map-01";
export const VASSAL_LIFE_MAP_DEPTH_COUNT = DEPTH_LAYOUT.length;
export const VASSAL_LIFE_MAP_LANE_COUNT = 4;
export const VASSAL_PHASES_PER_YEAR = 30;

export const VASSAL_NODE_FAMILIES = Object.freeze({
  patronage: Object.freeze({
    id: "patronage", label: "Patronage", glyph: "P", color: 0xb88449,
    description: "Opportunities to gain Prestige.",
  }),
  development: Object.freeze({
    id: "development", label: "EXP", glyph: "XP", color: 0x5e9bcf,
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

function getBand(depth) {
  if (depth <= 2) return "early";
  if (depth <= 5) return "mid";
  if (depth <= 8) return "late";
  return "deep";
}

function nodeId(depth, lane) {
  return `life-${String(depth + 1).padStart(2, "0")}-${lane + 1}`;
}

export const VASSAL_LIFE_MAP_NODES = Object.freeze(DEPTH_LAYOUT.flatMap(
  (nodes, depth) => nodes.map((node, lane) => Object.freeze({
    id: nodeId(depth, lane),
    family: node.family,
    band: getBand(depth),
    depth,
    lane,
    mapY: node.mapY,
    outgoingNodeIds: depth === DEPTH_LAYOUT.length - 1
      ? Object.freeze([])
      : Object.freeze(node.outgoing.map((nextLane) => nodeId(depth + 1, nextLane))),
  }))
));

export const VASSAL_LIFE_MAP_NODE_BY_ID = Object.freeze(Object.fromEntries(
  VASSAL_LIFE_MAP_NODES.map((node) => [node.id, node])
));

export const VASSAL_LIFE_MAP_ENTRY_NODE_IDS = Object.freeze(
  VASSAL_LIFE_MAP_NODES.filter((node) => node.depth === 0).map((node) => node.id)
);

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
  phasesPerTravelStep: VASSAL_PHASES_PER_YEAR,
  shopRerollPrestigeCost: 6,
  shopRerollPhaseCost: VASSAL_PHASES_PER_YEAR * 2,
  routeAddPrestigeCost: 16,
  routeAddPhaseCost: VASSAL_PHASES_PER_YEAR * 3,
  routeRemovePrestigeCost: 10,
  routeRemovePhaseCost: VASSAL_PHASES_PER_YEAR * 2,
  legacyPrestigeCost: 20,
  legacyPhaseCost: VASSAL_PHASES_PER_YEAR * 4,
  legacyStartingPrestigeBonus: 3,
  legacyStartingPrestigeBonusCap: 12,
  crisisImmediateDeathChance: 0.35,
});

export const VASSAL_PATRONAGE_OPTIONS = Object.freeze([
  Object.freeze({ id: "immediateFavor", label: "Immediate Favor", prestigeDelta: 8, phaseCost: VASSAL_PHASES_PER_YEAR }),
  Object.freeze({ id: "longAppointment", label: "Long Appointment", prestigeDelta: 20, phaseCost: VASSAL_PHASES_PER_YEAR * 4 }),
  Object.freeze({ id: "cultivateConnections", label: "Cultivate Connections", prestigeDelta: 5, statId: "cunning", statDelta: 1, phaseCost: VASSAL_PHASES_PER_YEAR * 3 }),
]);

export const VASSAL_DEVELOPMENT_OPTIONS = Object.freeze([
  Object.freeze({ id: "studyStatecraft", label: "Study Statecraft", statId: "intelligence", statDelta: 1, phaseCost: VASSAL_PHASES_PER_YEAR * 2 }),
  Object.freeze({ id: "practiceLeadership", label: "Practice Leadership", statId: "effectiveness", statDelta: 1, phaseCost: VASSAL_PHASES_PER_YEAR * 2 }),
  Object.freeze({ id: "studyIntrigue", label: "Study Intrigue", statId: "cunning", statDelta: 1, phaseCost: VASSAL_PHASES_PER_YEAR * 2 }),
  Object.freeze({ id: "broadEducation", label: "Broad Education", statId: "wisdom", statDelta: 1, phaseCost: VASSAL_PHASES_PER_YEAR * 4 }),
]);

export const VASSAL_CRISIS_OPTIONS = Object.freeze([
  Object.freeze({ id: "negotiate", label: "Negotiate", prestigeCost: 8, phaseCost: VASSAL_PHASES_PER_YEAR * 3 }),
  Object.freeze({ id: "rallyLoyalists", label: "Rally Loyalists", prestigeDelta: 25, phaseCost: VASSAL_PHASES_PER_YEAR * 2, immediateDeathChance: VASSAL_LIFE_TUNING.crisisImmediateDeathChance }),
  Object.freeze({ id: "flee", label: "Flee", prestigeDelta: -6, phaseCost: VASSAL_PHASES_PER_YEAR, forcedRelocation: true }),
]);

export const VASSAL_LEGACY_OPTIONS = Object.freeze([
  Object.freeze({
    id: "enduringOffice",
    label: "Enduring Office",
    prestigeCost: VASSAL_LIFE_TUNING.legacyPrestigeCost,
    phaseCost: VASSAL_LIFE_TUNING.legacyPhaseCost,
    legacyStartingPrestigeBonus: VASSAL_LIFE_TUNING.legacyStartingPrestigeBonus,
  }),
]);

export const VASSAL_STAT_IDS = Object.freeze([
  "cunning", "wisdom", "effectiveness", "intelligence",
]);

export const VASSAL_RECURRING_DEVELOPMENT_STAT_IDS = Object.freeze([
  "cunning", "effectiveness", "intelligence",
]);

export function getVassalMortalityChance(age) {
  const safeAge = Math.max(0, Math.floor(age ?? 0));
  if (safeAge < 40) return 0;
  if (safeAge < 50) return 0.005;
  if (safeAge < 60) return 0.02;
  if (safeAge < 70) return 0.06;
  if (safeAge < 80) return 0.15;
  return 0.35;
}
