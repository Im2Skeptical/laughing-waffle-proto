const FAMILY_LAYOUT = Object.freeze([
  ["patronage", "development", "travel", "patronage"],
  ["development", "patronage", "travel", "practiceReform"],
  ["patronage", "development", "publicWorks", "travel"],
  ["patronage", "development", "practiceReform", "routes"],
  ["travel", "development", "publicWorks", "patronage"],
  ["practiceReform", "routes", "publicWorks", "crisis"],
  ["practiceReform", "publicWorks", "routes", "travel"],
  ["crisis", "practiceReform", "publicWorks", "development"],
  ["routes", "crisis", "practiceReform", "patronage"],
  ["legacy", "publicWorks", "routes", "crisis"],
  ["legacy", "practiceReform", "publicWorks", "crisis"],
]);

export const VASSAL_LIFE_MAP_ID = "reference-life-map-01";
export const VASSAL_LIFE_MAP_DEPTH_COUNT = FAMILY_LAYOUT.length;
export const VASSAL_LIFE_MAP_LANE_COUNT = 4;

export const VASSAL_NODE_FAMILIES = Object.freeze({
  patronage: Object.freeze({ id: "patronage", label: "Patronage", glyph: "P" }),
  development: Object.freeze({ id: "development", label: "Development", glyph: "D" }),
  travel: Object.freeze({ id: "travel", label: "Travel", glyph: "T" }),
  practiceReform: Object.freeze({ id: "practiceReform", label: "Practice Reform", glyph: "PR" }),
  publicWorks: Object.freeze({ id: "publicWorks", label: "Public Works", glyph: "PW" }),
  routes: Object.freeze({ id: "routes", label: "Routes", glyph: "R" }),
  crisis: Object.freeze({ id: "crisis", label: "Crisis", glyph: "!" }),
  legacy: Object.freeze({ id: "legacy", label: "Legacy", glyph: "L" }),
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

function outgoingLanes(depth, lane) {
  if (depth % 2 === 0) {
    if (lane === 3) return [2, 3];
    return [lane, lane + 1];
  }
  if (lane === 0) return [0, 1];
  return [lane - 1, lane];
}

export const VASSAL_LIFE_MAP_NODES = Object.freeze(FAMILY_LAYOUT.flatMap(
  (families, depth) => families.map((family, lane) => Object.freeze({
    id: nodeId(depth, lane),
    family,
    band: getBand(depth),
    depth,
    lane,
    outgoingNodeIds: depth === FAMILY_LAYOUT.length - 1
      ? Object.freeze([])
      : Object.freeze(outgoingLanes(depth, lane).map((nextLane) => nodeId(depth + 1, nextLane))),
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
  shopRerollPrestigeCost: 6,
  shopRerollYearCost: 2,
  routeAddPrestigeCost: 16,
  routeAddYearCost: 3,
  routeRemovePrestigeCost: 10,
  routeRemoveYearCost: 2,
  legacyPrestigeCost: 20,
  legacyYearCost: 4,
  legacyStartingPrestigeBonus: 3,
  legacyStartingPrestigeBonusCap: 12,
  crisisImmediateDeathChance: 0.35,
});

export const VASSAL_PATRONAGE_OPTIONS = Object.freeze([
  Object.freeze({ id: "immediateFavor", label: "Immediate Favor", prestigeDelta: 8, yearCost: 1 }),
  Object.freeze({ id: "longAppointment", label: "Long Appointment", prestigeDelta: 20, yearCost: 4 }),
  Object.freeze({ id: "cultivateConnections", label: "Cultivate Connections", prestigeDelta: 5, statId: "cunning", statDelta: 1, yearCost: 3 }),
]);

export const VASSAL_DEVELOPMENT_OPTIONS = Object.freeze([
  Object.freeze({ id: "studyStatecraft", label: "Study Statecraft", statId: "intelligence", statDelta: 1, yearCost: 2 }),
  Object.freeze({ id: "practiceLeadership", label: "Practice Leadership", statId: "effectiveness", statDelta: 1, yearCost: 2 }),
  Object.freeze({ id: "studyIntrigue", label: "Study Intrigue", statId: "cunning", statDelta: 1, yearCost: 2 }),
  Object.freeze({ id: "broadEducation", label: "Broad Education", statId: "wisdom", statDelta: 1, yearCost: 4 }),
]);

export const VASSAL_CRISIS_OPTIONS = Object.freeze([
  Object.freeze({ id: "negotiate", label: "Negotiate", prestigeCost: 8, yearCost: 3 }),
  Object.freeze({ id: "rallyLoyalists", label: "Rally Loyalists", prestigeDelta: 25, yearCost: 2, immediateDeathChance: VASSAL_LIFE_TUNING.crisisImmediateDeathChance }),
  Object.freeze({ id: "flee", label: "Flee", prestigeDelta: -6, yearCost: 1, forcedRelocation: true }),
]);

export const VASSAL_LEGACY_OPTIONS = Object.freeze([
  Object.freeze({
    id: "enduringOffice",
    label: "Enduring Office",
    prestigeCost: VASSAL_LIFE_TUNING.legacyPrestigeCost,
    yearCost: VASSAL_LIFE_TUNING.legacyYearCost,
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
