export const VASSAL_LIFE_MAP_GRAPH_SCHEMA_VERSION = 4;
export const VASSAL_PHASES_PER_YEAR = 30;
const VASSAL_TIME_COST_MULTIPLIER = 3.6;
const increasedPhaseCost = (baseCost) => Math.round(baseCost * VASSAL_TIME_COST_MULTIPLIER);

export const VASSAL_NODE_FAMILIES = Object.freeze({
  philosopherFounding: Object.freeze({ id: "philosopherFounding", label: "Philosopher Founding", glyph: "P", color: 0xa46fc4, description: "A Philosopher establishes the Scholars." }),
  warlordFounding: Object.freeze({ id: "warlordFounding", label: "Warlord Founding", glyph: "W", color: 0xca5b5b, description: "A Warlord establishes the Warriors through training." }),
  training: Object.freeze({ id: "training", label: "Training", glyph: "T", color: 0xa46fc4, description: "Grow an established specialist class." }),
  commission: Object.freeze({ id: "commission", label: "Commission", glyph: "C", color: 0xa46fc4, description: "Accept an objective for Prestige." }),
  discovery: Object.freeze({ id: "discovery", label: "Discovery", glyph: "D", color: 0xa46fc4, description: "Develop technological access through Ingenuity." }),
  campaign: Object.freeze({ id: "campaign", label: "Campaign", glyph: "C", color: 0xa46fc4, description: "Lead organized conflict." }),
  challenge: Object.freeze({ id: "challenge", label: "Challenge", glyph: "C", color: 0xa46fc4, description: "Take a personal martial risk." }),

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
    description: "Offer two class Practices and one neutral Practice at this Vassal's current settlement.",
  }),
  publicWorks: Object.freeze({
    id: "publicWorks", label: "Public Works", glyph: "PW", color: 0xd17e68,
    description: "Offer two class Structures and one neutral Structure at this Vassal's current settlement.",
  }),
  neutralMarket: Object.freeze({
    id: "neutralMarket", label: "Neutral Market", glyph: "NM", color: 0xc7974e,
    description: "Offer only neutral Practices and Structures.",
  }),
  classMarket: Object.freeze({
    id: "classMarket", label: "Class Market", glyph: "CM", color: 0x5e9bcf,
    description: "Offer only Practices and Structures from this Vassal's class.",
  }),
  foodShop: Object.freeze({
    id: "foodShop", tag: "Food", label: "Food Shop",
    glyph: "FO", color: 0xc7974e,
    description: "A mixed shop containing only Food-tagged gamepieces.",
  }),
  housingShop: Object.freeze({
    id: "housingShop", tag: "Housing", label: "Housing Shop",
    glyph: "HO", color: 0x62ad82,
    description: "A mixed shop containing only Housing-tagged gamepieces.",
  }),
  stockShop: Object.freeze({
    id: "stockShop", label: "Stock Supply", glyph: "ST", color: 0xb88449,
    description: "Choose Practices that produce one specific Stock output.",
  }),
  routes: Object.freeze({
    id: "routes", label: "Routes", glyph: "R", color: 0xd0ac55,
    description: "Add a world connection at this Vassal's current settlement.",
  }),
  settlement: Object.freeze({
    id: "settlement", label: "Settlement", glyph: "S", color: 0x77aa65,
    description: "Found a nearby settlement and move this Vassal there.",
  }),
  crisis: Object.freeze({
    id: "crisis", label: "Crisis", glyph: "!", color: 0xca5b5b,
    description: "Take a risky action with immediate consequences.",
  }),
  legacy: Object.freeze({
    id: "legacy", label: "Legacy", glyph: "L", color: 0x8a86d1,
    description: "Secure an advantage for future Vassal candidates.",
  }),
  signature: Object.freeze({
    id: "signature", label: "Signature", glyph: "★", color: 0xe3c46c,
    description: "A defining opportunity unique to this Vassal.",
  }),
  relic: Object.freeze({
    id: "relic", label: "Relic", glyph: "H", color: 0xc9a35a,
    description: "Discover a temporary Heirloom and choose to Equip or Carry it.",
  }),
});

export const VASSAL_FOUNDING_OPTIONS = Object.freeze({
  philosopherFounding: Object.freeze({
    id: "train-estate", label: "Philosopher: establish Scholars",
    description: "Train up to two existing adults as Scholars and found a Lyceum if two construction cells are free.",
    phaseCost: 6, prestigeCost: 0,
    classAction: Object.freeze({ kind: "train", classId: "scholar", count: 2, structureId: "lyceum", establishClass: true, onCompletion: true }),
  }),
  warlordFounding: Object.freeze({
    id: "train-estate", label: "Warlord: establish Warriors",
    description: "Train up to ten existing adults as Warriors.",
    phaseCost: 6, prestigeCost: 0,
    classAction: Object.freeze({ kind: "train", classId: "warrior", count: 10, establishClass: true, onCompletion: true }),
  }),
});

export const VASSAL_NORMAL_NODE_FAMILY_IDS = Object.freeze([
  "patronage", "development", "travel", "practiceReform",
  "publicWorks", "routes", "crisis", "relic", "training", "commission", "discovery", "campaign", "challenge",
  "neutralMarket", "classMarket",
  "foodShop", "housingShop",
]);

export const VASSAL_SIGNATURE_NODE_GROUP_IDS = Object.freeze([
  "settlement", "legacyPlus", "monsterHunt", "removal", "tagShop",
]);

export const VASSAL_SIGNATURE_NODE_VARIANTS = Object.freeze({
  settlement: Object.freeze({
    id: "settlement", groupId: "settlement", label: "Found Settlement",
    glyph: "FS", color: 0x77aa65,
    description: "Found a nearby settlement and move this Vassal there.",
  }),
  legacyPlus: Object.freeze({
    id: "legacyPlus", groupId: "legacyPlus", label: "Legacy+",
    glyph: "L+", color: 0xa29ee8,
    description: "Legacy choices are twice as powerful for their usual cost.",
  }),
  monsterHunt: Object.freeze({
    id: "monsterHunt", groupId: "monsterHunt", label: "Kill Monsters",
    glyph: "KM", color: 0xcf6b5d,
    description: "Trade Prestige or immediate danger to reduce the redGod host.",
  }),
  removePractice: Object.freeze({
    id: "removePractice", groupId: "removal", removalKind: "practice",
    label: "Remove Practice", glyph: "−P", color: 0xa46fc4,
    description: "Pay to remove Practices from the Vassal's current settlement.",
  }),
  removeRoute: Object.freeze({
    id: "removeRoute", groupId: "removal", removalKind: "connection",
    label: "Remove Routes", glyph: "−R", color: 0xd0ac55,
    description: "Pay to remove routes incident to the Vassal's current settlement.",
  }),
  foodShop: Object.freeze({
    ...VASSAL_NODE_FAMILIES.foodShop, groupId: "tagShop",
  }),
  knowledgeShop: Object.freeze({
    id: "knowledgeShop", groupId: "tagShop", tag: "Knowledge", label: "Knowledge Shop",
    glyph: "KN", color: 0x5e9bcf,
    description: "A mixed shop containing only Knowledge-tagged gamepieces.",
  }),
  housingShop: Object.freeze({
    ...VASSAL_NODE_FAMILIES.housingShop, groupId: "tagShop",
  }),
});

export const VASSAL_SIGNATURE_VARIANT_IDS_BY_GROUP = Object.freeze({
  settlement: Object.freeze(["settlement"]),
  legacyPlus: Object.freeze(["legacyPlus"]),
  monsterHunt: Object.freeze(["monsterHunt"]),
  removal: Object.freeze(["removePractice", "removeRoute"]),
  tagShop: Object.freeze(["foodShop", "knowledgeShop", "housingShop"]),
});

export const VASSAL_LIFE_TUNING = Object.freeze({
  randomStockShopCount: 2,
  candidateCount: 3,
  candidateAgeMin: 12,
  candidateAgeMax: 22,
  candidatePrestigeMin: 18,
  candidatePrestigeMax: 24,
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
  signatureRemovalPrestigeCost: 10,
  settlementPrestigeCost: 40,
  legacyPrestigeCost: 20,
  legacyPhaseCost: increasedPhaseCost(VASSAL_PHASES_PER_YEAR * 4),
  legacyStartingPrestigeBonus: 3,
  legacyStartingPrestigeBonusCap: 12,
  crisisImmediateDeathChance: 0.35,
  // Final phase price: five 32-phase years. Applied raw, not through increasedPhaseCost.
  relicChoicePhaseCost: 32 * 5,
});

export function isVassalStockOutputPractice(def, output) {
  return (def?.stockCapacity ?? 0) > 0 && (def.stockTraits ?? []).includes(output)
    && (def.effects ?? []).some(effect => effect.op === "generateStock"
      && (effect.amount > 0 || Object.values(effect.seasonAmounts ?? {}).some(amount => amount > 0)));
}

export function getVassalStockOutputIds(practiceDefs) {
  return [...new Set(Object.values(practiceDefs).flatMap(def =>
    (def.stockTraits ?? []).filter(output => isVassalStockOutputPractice(def, output))))].sort();
}

export function getVassalLifeMapNodeFamily(node) {
  if (node?.signatureNode?.variantId) return VASSAL_SIGNATURE_NODE_VARIANTS[node.signatureNode.variantId] ?? null;
  const family = VASSAL_NODE_FAMILIES[node?.family];
  return node?.family === "stockShop" ? {
    ...family, label: `${node.stockOutput} Stock Supply`,
    description: `Choose Practices that produce ${node.stockOutput} Stock.`,
  } : family ?? null;
}

export const VASSAL_MONSTER_HUNT_OPTIONS = Object.freeze([
  Object.freeze({
    id: "dangerousHunt", label: "Risk Immediate Death: Kill 15 Monsters",
    phaseCost: 0, immediateDeathChance: 0.35,
    effects: Object.freeze([{ op: "AdjustSettlementChaosGodState", godId: "redGod", key: "monsterCount", amount: -15, min: 0 }]),
  }),
  Object.freeze({
    id: "fundedHunt", label: "Pay Prestige: Kill 10 Monsters",
    prestigeCost: 10, phaseCost: 0,
    effects: Object.freeze([{ op: "AdjustSettlementChaosGodState", godId: "redGod", key: "monsterCount", amount: -10, min: 0 }]),
  }),
  Object.freeze({
    id: "recklessHunt", label: "Higher Risk: Kill 5 Monsters, Gain 30 Prestige",
    prestigeDelta: 30, phaseCost: 0, immediateDeathChance: 0.6,
    effects: Object.freeze([{ op: "AdjustSettlementChaosGodState", godId: "redGod", key: "monsterCount", amount: -5, min: 0 }]),
  }),
]);

export const VASSAL_PATRONAGE_OPTIONS = Object.freeze([
  Object.freeze({ id: "immediateFavor", label: "Immediate Favor", prestigeDelta: 8, phaseCost: increasedPhaseCost(VASSAL_PHASES_PER_YEAR) }),
  Object.freeze({ id: "longAppointment", label: "Long Appointment", prestigeDelta: 20, phaseCost: increasedPhaseCost(VASSAL_PHASES_PER_YEAR * 4) }),
  Object.freeze({ id: "cultivateConnections", label: "Cultivate Connections", prestigeDelta: 5, statId: "cunning", statDelta: 1, phaseCost: increasedPhaseCost(VASSAL_PHASES_PER_YEAR * 3) }),
]);

export const VASSAL_DEVELOPMENT_OPTIONS = Object.freeze([
  Object.freeze({ id: "deepStudy", label: "Deep Study", statDelta: 2, phaseCost: increasedPhaseCost(VASSAL_PHASES_PER_YEAR * 6) }),
  Object.freeze({ id: "hardLesson", label: "Hard Lesson", statDelta: 2, phaseCost: increasedPhaseCost(VASSAL_PHASES_PER_YEAR * 2), lossStatDelta: -1 }),
  Object.freeze({ id: "steadyPractice", label: "Steady Practice", statDelta: 1, phaseCost: increasedPhaseCost(VASSAL_PHASES_PER_YEAR * 2) }),
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
