import { DETAILED_PRACTICE_SLOT_COUNT } from "../gamepieces/detailed-settlement-defs.js";
export const DETAILED_REGION_IDS = Object.freeze([
  "cedar-woods",
  "west-levee",
  "upper-floodplain",
  "river-crown",
  "lake-country",
]);

export const DEFAULT_REGION_STRUCTURE_CAPACITY_MIN = 5;
export const DEFAULT_REGION_STRUCTURE_CAPACITY_MAX = 8;

export const DETAILED_REGION_COLOURS = Object.freeze({
  "cedar-woods": "green",
  "west-levee": "red",
  "upper-floodplain": "red",
  "river-crown": "red",
  "lake-country": "blue",
});

export const createInitialDetailedSettlementData = (regionId = null) => ({
  populationByClass: {
    villager: {
      specialists: { scholar: {children:0,adults:0,eldersByAge:[]}, warrior: {children:0,adults:0,eldersByAge:[]} },
      children: 0,
      adults: 20,
      eldersByAge: [
        { age: 50, count: 1 },
        { age: 53, count: 1 },
        { age: 56, count: 1 },
      ],
      faith: { tier: "gold", trend: null, streak: 0 },
      happiness: {
        status: "neutral",
        fullFeedStreak: 0,
        missedFeedStreak: 0,
        partialFeedRatios: [],
      },
    },
    stranger: {
      specialists: { scholar: {children:0,adults:0,eldersByAge:[]}, warrior: {children:0,adults:0,eldersByAge:[]} },
      children: 0,
      adults: 0,
      eldersByAge: [],
      faith: { tier: "gold", trend: null, streak: 0 },
      happiness: {
        status: "neutral",
        fullFeedStreak: 0,
        missedFeedStreak: 0,
        partialFeedRatios: [],
      },
    },
  },
  practiceSlots: Array.from({ length: DETAILED_PRACTICE_SLOT_COUNT }, (_, i) => i === 0 ? { practiceId: "forage", tier: "bronze", stock: 2, charge: 0, work: 0 } : null),
  structureSlots: [
    { structureId: "granary" },
    { structureId: "mudHouses" },
  ],
  elderOrder: {
    definitionId: "elderOrder",
    workerPolicyId: "populationDecileVillagersFirst",
  },
  lastMeal: null,
  lastMoonResult: null,
});
