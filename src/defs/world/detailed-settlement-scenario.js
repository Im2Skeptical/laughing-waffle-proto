export const DETAILED_REGION_IDS = Object.freeze([
  "cedar-woods",
  "west-levee",
  "upper-floodplain",
  "river-crown",
  "lake-country",
]);

export const REGION_STRUCTURE_CAPACITIES = Object.freeze([
  3, 4, 4, 3, 3, 5, 3, 4, 4, 4, 4, 3, 4, 5, 3,
]);

export const DETAILED_REGION_COLOURS = Object.freeze({
  "cedar-woods": "green",
  "west-levee": "red",
  "upper-floodplain": "red",
  "river-crown": "red",
  "lake-country": "blue",
});

export const createInitialDetailedSettlementData = () => ({
  populationByClass: {
    villager: {
      children: 0,
      adults: 30,
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
  storedFood: 60,
  looseFood: 0,
  currency: 0,
  practiceSlots: [
    { practiceId: "cultivate", charge: 0, work: 0 },
    { practiceId: "administrate", charge: 0, work: 0 },
    { practiceId: "preserve", charge: 0, work: 0 },
    null,
    null,
    null,
  ],
  structureSlots: [
    { structureId: "granary" },
    { structureId: "mudHouses" },
    { structureId: "mudHouses" },
  ],
  elderOrder: {
    definitionId: "elderOrder",
    workerPolicyId: "populationDecileVillagersFirst",
  },
  lastMeal: null,
  lastMoonResult: null,
});
