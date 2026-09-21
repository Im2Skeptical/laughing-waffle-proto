export const HEIRLOOM_EQUIPPED_SLOTS = 3;
export const HEIRLOOM_CARRY_SLOTS = 3;
export const HEIRLOOM_VAULT_SLOTS = 6;

export const VASSAL_HEIRLOOM_QUALITIES = Object.freeze([
  "bronze", "silver", "gold", "diamond",
]);

export const VASSAL_HEIRLOOM_INHERITANCE_STATES = Object.freeze([
  "sanctified", "unmarked", "fragile",
]);

export const VASSAL_HEIRLOOM_TUNING = Object.freeze({
  offerCount: 3,
  rarityWeights: Object.freeze({
    bronze: 55,
    silver: 28,
    gold: 13,
    diamond: 4,
  }),
  fragileBreakChance: 0.5,
  signetRingPatronagePrestige: 8,
  travellersBootsTravelCostMultiplier: 0.7,
  tutorsNotebookDevelopment: 3,
  minorSealFirstPurchaseDiscount: 0.35,
  foxMaskCunning: 1,
  abacusIntelligence: 1,
  courtiersBroochPatronageMultiplier: 2,
  pilgrimsStaffTravelDevelopment: 6,
  extraShopOffers: 1,
  hourglassFirstActionMultiplier: 0.5,
  royalWarrantFirstPurchaseDiscount: 0.8,
  scholarsCodexWisdomMultiplier: 3,
  crownOfAgesTimeMultiplier: 0.5,
});

function heirloom(id, label, quality, description, effects) {
  return Object.freeze({
    id, label, quality, description,
    effects: Object.freeze({ ...effects }),
  });
}

export const VASSAL_HEIRLOOM_DEFS = Object.freeze({
  signetRing: heirloom(
    "signetRing", "Signet Ring", "bronze",
    "Completing a Patronage node grants additional Prestige.",
    { patronageNodePrestige: VASSAL_HEIRLOOM_TUNING.signetRingPatronagePrestige },
  ),
  travellersBoots: heirloom(
    "travellersBoots", "Traveller's Boots", "bronze",
    "Travel costs fewer years.",
    { travelCostMultiplier: VASSAL_HEIRLOOM_TUNING.travellersBootsTravelCostMultiplier },
  ),
  tutorsNotebook: heirloom(
    "tutorsNotebook", "Tutor's Notebook", "bronze",
    "Gain additional development progress when a node resolves.",
    { nodeDevelopment: VASSAL_HEIRLOOM_TUNING.tutorsNotebookDevelopment },
  ),
  minorSeal: heirloom(
    "minorSeal", "Minor Seal", "bronze",
    "The first intervention purchase in each intervention shop costs less Prestige.",
    { firstInterventionDiscount: VASSAL_HEIRLOOM_TUNING.minorSealFirstPurchaseDiscount },
  ),
  foxMask: heirloom(
    "foxMask", "Fox Mask", "bronze",
    "+1 Cunning while equipped.",
    { bonusCunning: VASSAL_HEIRLOOM_TUNING.foxMaskCunning },
  ),
  abacus: heirloom(
    "abacus", "Abacus", "bronze",
    "+1 Intelligence while equipped.",
    { bonusIntelligence: VASSAL_HEIRLOOM_TUNING.abacusIntelligence },
  ),
  courtiersBrooch: heirloom(
    "courtiersBrooch", "Courtier's Brooch", "silver",
    "Prestige gained directly from Patronage options is substantially increased.",
    { patronageOptionMultiplier: VASSAL_HEIRLOOM_TUNING.courtiersBroochPatronageMultiplier },
  ),
  pilgrimsStaff: heirloom(
    "pilgrimsStaff", "Pilgrim's Staff", "silver",
    "Completing a Travel node grants additional development progress.",
    { travelNodeDevelopment: VASSAL_HEIRLOOM_TUNING.pilgrimsStaffTravelDevelopment },
  ),
  merchantsLens: heirloom(
    "merchantsLens", "Merchant's Lens", "silver",
    "Practice Reform and Public Works shops show one additional offer.",
    { extraShopOffers: VASSAL_HEIRLOOM_TUNING.extraShopOffers },
  ),
  hourglass: heirloom(
    "hourglass", "Hourglass", "silver",
    "The first time-costing action performed in each node costs fewer years.",
    { hourglassFirstActionMultiplier: VASSAL_HEIRLOOM_TUNING.hourglassFirstActionMultiplier },
  ),
  royalWarrant: heirloom(
    "royalWarrant", "Royal Warrant", "gold",
    "The first intervention purchase in each intervention shop receives a very large Prestige discount.",
    { firstInterventionDiscount: VASSAL_HEIRLOOM_TUNING.royalWarrantFirstPurchaseDiscount },
  ),
  scholarsCodex: heirloom(
    "scholarsCodex", "Scholar's Codex", "gold",
    "Wisdom contributes substantially more development progress on node resolution.",
    { wisdomDevelopmentMultiplier: VASSAL_HEIRLOOM_TUNING.scholarsCodexWisdomMultiplier },
  ),
  crownOfAges: heirloom(
    "crownOfAges", "Crown of Ages", "diamond",
    "All Vassal action time costs are substantially reduced.",
    { allTimeCostMultiplier: VASSAL_HEIRLOOM_TUNING.crownOfAgesTimeMultiplier },
  ),
  mandateOfHeaven: heirloom(
    "mandateOfHeaven", "Mandate of Heaven", "diamond",
    "Once per Vassal life, an otherwise fatal natural-mortality or Crisis outcome is prevented.",
    { mandateOfHeaven: true },
  ),
});

export const VASSAL_HEIRLOOM_DEFINITION_IDS = Object.freeze(Object.keys(VASSAL_HEIRLOOM_DEFS));

export function getHeirloomDefinition(definitionId) {
  return VASSAL_HEIRLOOM_DEFS[definitionId] ?? null;
}

export function getHeirloomQualityLabel(quality) {
  const text = String(quality ?? "");
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : "";
}

export function getHeirloomInheritanceLabel(state) {
  if (state === "sanctified") return "Sanctified";
  if (state === "fragile") return "Fragile";
  return "Unmarked";
}
