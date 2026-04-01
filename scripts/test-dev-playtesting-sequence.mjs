import assert from "node:assert/strict";

import { hubStructureDefs } from "../src/defs/gamepieces/hub-structure-defs.js";
import { settlementPracticeDefs } from "../src/defs/gamepieces/settlement-practice-defs.js";
import { PRACTICE_OPEN_TO_STRANGERS_ATTRACTION_PER_VACANCY_PER_YEAR } from "../src/defs/gamesettings/gamerules-defs.js";
import { DEFAULT_VARIANT_FLAGS } from "../src/defs/gamesettings/variant-flags-defs.js";
import { createInitialState, updateGame } from "../src/model/game-model.js";
import { getCurrentSeasonKey, deserializeGameState, serializeGameState } from "../src/model/state.js";
import {
  getSettlementClassIds,
  getSettlementFaithSummary,
  getSettlementPopulationSummary,
  getSettlementPracticeSlotsByClass,
  getSettlementStockpile,
} from "../src/model/settlement-state.js";
import {
  createTimelineFromInitialState,
  rebuildStateAtSecond,
} from "../src/model/timeline/index.js";

function advanceToSecond(state, targetSec) {
  const safeTarget = Math.max(0, Math.floor(targetSec));
  while ((state?.tSec ?? 0) < safeTarget) {
    updateGame(1 / 60, state);
  }
}

function assertClose(actual, expected, epsilon, message) {
  assert.ok(
    Math.abs(Number(actual) - Number(expected)) <= epsilon,
    `${message}: expected ${expected}, got ${actual}`
  );
}

function findLastGameEvent(state, type, classId = null) {
  const feed = Array.isArray(state?.gameEventFeed) ? state.gameEventFeed : [];
  for (let index = feed.length - 1; index >= 0; index -= 1) {
    if (feed[index]?.type !== type) continue;
    if (classId && feed[index]?.data?.classId !== classId) continue;
    return feed[index];
  }
  return null;
}

function buildSettlementSetup({
  stockpiles = {
    food: 40,
    redResource: 0,
    greenResource: 0,
    blueResource: 0,
    blackResource: 0,
  },
  villagerAdults = 8,
  villagerYouth = 0,
  strangerAdults = 0,
  strangerYouth = 0,
  villagerFaithTier = "gold",
  strangerFaithTier = "gold",
  villagerHappiness = {
    status: "neutral",
    fullFeedStreak: 0,
    missedFeedStreak: 0,
    partialFeedRatios: [],
  },
  strangerHappiness = {
    status: "neutral",
    fullFeedStreak: 0,
    missedFeedStreak: 0,
    partialFeedRatios: [],
  },
  villagerPracticeSlots = [
    { defId: "floodRites" },
    { defId: "riverRecessionFarming" },
    { defId: "rest" },
    { defId: "openToStrangers" },
    null,
  ],
  strangerPracticeSlots = [{ defId: "asTheRomans" }, { defId: "becomeVillagers" }, null, null, null],
  structures = [null, { defId: "granary" }, { defId: "mudHouses" }, { defId: "riverTemple" }, null, null],
} = {}) {
  return {
    rngSeed: 123,
    variantFlags: {
      ...DEFAULT_VARIANT_FLAGS,
      settlementPrototypeEnabled: true,
    },
    resources: { gold: 0, grain: 0, food: 0, population: 0 },
    locationNames: { hub: "Hub", region: "Region" },
    discovery: {
      envCols: new Array(5).fill(null).map(() => ({ exposed: true, revealed: true })),
      hubVisible: true,
      hubRenameUnlocked: true,
    },
    board: {
      cols: 5,
      envStructures: [],
      tiles: ["tile_hinterland", "tile_levee", "tile_floodplains", "tile_floodplains", "tile_river"],
    },
    hub: {
      cols: structures.length,
      classOrder: ["villager", "stranger"],
      core: {
        systemTiers: {
          faith: villagerFaithTier,
        },
        systemState: {
          stockpiles,
          populationClasses: {
            villager: {
              adults: villagerAdults,
              youth: villagerYouth,
              commitments: [],
              faith: {
                tier: villagerFaithTier,
              },
              happiness: villagerHappiness,
            },
            stranger: {
              adults: strangerAdults,
              youth: strangerYouth,
              commitments: [],
              faith: {
                tier: strangerFaithTier,
              },
              happiness: strangerHappiness,
            },
          },
        },
      },
      zones: {
        order: {
          slots: [{ defId: "elders" }],
        },
        practiceByClass: {
          villager: {
            slots: villagerPracticeSlots,
          },
          stranger: {
            slots: strangerPracticeSlots,
          },
        },
        structures: {
          slots: structures,
        },
      },
    },
  };
}

function summarizePracticeRuntime(slot) {
  const runtime = slot?.card?.props?.settlement ?? null;
  return {
    defId: slot?.card?.defId ?? null,
    practiceMode: runtime?.practiceMode ?? null,
    ownerClassId: runtime?.ownerClassId ?? null,
    previewAmount: Math.floor(runtime?.previewAmount ?? 0),
    available: runtime?.available === true,
    blockedReason: runtime?.blockedReason ?? null,
    mirroredPracticeTitle: runtime?.mirroredPracticeTitle ?? null,
    activeReservation: runtime?.activeReservation === true,
    activeAmount: Math.floor(runtime?.activeAmount ?? 0),
    activeStartSec: Number.isFinite(runtime?.activeStartSec)
      ? Math.floor(runtime.activeStartSec)
      : null,
    activeReleaseSec: Number.isFinite(runtime?.activeReleaseSec)
      ? Math.floor(runtime.activeReleaseSec)
      : null,
    activeRemainingSec: Math.floor(runtime?.activeRemainingSec ?? 0),
    activeProgressRemaining: Number(Number(runtime?.activeProgressRemaining ?? 0).toFixed(4)),
    lastRunSec: Number.isFinite(runtime?.lastRunSec) ? Math.floor(runtime.lastRunSec) : null,
    lastAmount: Math.floor(runtime?.lastAmount ?? 0),
  };
}

function summarizeClass(state, classId) {
  const classState = state?.hub?.core?.systemState?.populationClasses?.[classId] ?? {};
  return {
    population: getSettlementPopulationSummary(state, classId),
    faith: getSettlementFaithSummary(state, classId),
    happiness: state?.hub?.core?.systemState?.populationClasses?.[classId]?.happiness ?? null,
    yearly: {
      year: Math.floor(classState?.yearly?.year ?? 0),
      mealAttempts: Number(Number(classState?.yearly?.mealAttempts ?? 0).toFixed(4)),
      mealSuccesses: Number(Number(classState?.yearly?.mealSuccesses ?? 0).toFixed(4)),
      attractionProgress: Number(classState?.yearly?.attractionProgress ?? 0),
      lastMealAttempts: Number(Number(classState?.yearly?.lastMealAttempts ?? 0).toFixed(4)),
      lastMealSuccesses: Number(Number(classState?.yearly?.lastMealSuccesses ?? 0).toFixed(4)),
      lastOutcomeKind: classState?.yearly?.lastOutcomeKind ?? null,
      lastSeasonOutcomeKind: classState?.yearly?.lastSeasonOutcomeKind ?? null,
      lastSeasonFeedRatio: Number(Number(classState?.yearly?.lastSeasonFeedRatio ?? 0).toFixed(4)),
    },
    commitments: Array.isArray(classState?.commitments)
      ? classState.commitments.map((commitment) => ({
          sourceId: commitment?.sourceId ?? null,
          amount: Math.floor(commitment?.amount ?? 0),
          startSec: Number.isFinite(commitment?.startSec)
            ? Math.floor(commitment.startSec)
            : null,
          releaseSec: Number.isFinite(commitment?.releaseSec)
            ? Math.floor(commitment.releaseSec)
            : null,
        }))
      : [],
    practice: getSettlementPracticeSlotsByClass(state, classId).map(summarizePracticeRuntime),
  };
}

function summarizeState(state) {
  const classIds = getSettlementClassIds(state);
  return {
    tSec: Math.floor(state?.tSec ?? 0),
    year: Math.floor(state?.year ?? 1),
    season: getCurrentSeasonKey(state),
    classOrder: classIds,
    stockpiles: {
      food: getSettlementStockpile(state, "food"),
      redResource: getSettlementStockpile(state, "redResource"),
      greenResource: getSettlementStockpile(state, "greenResource"),
      blueResource: getSettlementStockpile(state, "blueResource"),
      blackResource: getSettlementStockpile(state, "blackResource"),
    },
    aggregatePopulation: getSettlementPopulationSummary(state),
    bonuses: state?.hub?.core?.props?.practicePassiveBonusesByClass ?? null,
    byClass: Object.fromEntries(classIds.map((classId) => [classId, summarizeClass(state, classId)])),
  };
}

function runInitAssertions() {
  const state = createInitialState("devPlaytesting01", 123);
  const summary = summarizeState(state);

  assert.equal(state.pawns.length, 0, "prototype scenario should not seed pawns");
  assert.deepEqual(
    Object.keys(state.ownerInventories ?? {}),
    [],
    "prototype scenario should not seed inventories"
  );
  assert.deepEqual(summary.classOrder, ["villager", "stranger"], "expected deterministic class order");
  assert.equal(summary.byClass.villager.population.total, 8, "expected villager starting population");
  assert.equal(summary.byClass.villager.population.adults, 8, "expected villager starting adults");
  assert.equal(summary.byClass.villager.population.youth, 0, "expected villager starting youth");
  assert.equal(summary.byClass.villager.population.free, 6, "expected villager free population after temple staffing");
  assert.equal(summary.byClass.stranger.population.total, 0, "expected stranger pool to start empty");
  assert.deepEqual(
    summary.byClass.villager.practice.map((entry) => entry.defId),
    ["floodRites", "riverRecessionFarming", "rest", "openToStrangers", null],
    "expected villager practice board"
  );
  assert.deepEqual(
    summary.byClass.stranger.practice.map((entry) => entry.defId),
    ["asTheRomans", "becomeVillagers", null, null, null],
    "expected stranger practice board"
  );
}

function runMealPriorityAssertions() {
  const state = createInitialState(
    buildSettlementSetup({
      stockpiles: {
        food: 6,
        redResource: 0,
        greenResource: 0,
        blueResource: 0,
        blackResource: 0,
      },
      strangerAdults: 4,
      villagerPracticeSlots: [null, null, null, null, null],
      strangerPracticeSlots: [null, null, null, null, null],
      structures: [null, { defId: "granary" }, { defId: "mudHouses" }, null, null, null],
    }),
    123
  );

  advanceToSecond(state, 33);

  assert.equal(getSettlementStockpile(state, "food"), 0, "season meals should consume the available food");
  assert.deepEqual(
    state.hub.core.systemState.populationClasses.villager.yearly,
    {
      year: 1,
      mealAttempts: 8,
      mealSuccesses: 6,
      attractionProgress: 0,
      lastMealAttempts: 0,
      lastMealSuccesses: 0,
      lastOutcomeKind: null,
      lastSeasonOutcomeKind: "partial",
      lastSeasonFeedRatio: 0.75,
    },
    "villagers should eat first in class order"
  );
  assert.deepEqual(
    state.hub.core.systemState.populationClasses.stranger.yearly,
    {
      year: 1,
      mealAttempts: 4,
      mealSuccesses: 0,
      attractionProgress: 0,
      lastMealAttempts: 0,
      lastMealSuccesses: 0,
      lastOutcomeKind: null,
      lastSeasonOutcomeKind: "missed",
      lastSeasonFeedRatio: 0,
    },
    "strangers should only eat from the food remaining after villagers"
  );
}

function runHappinessAssertions() {
  const positiveState = createInitialState(
    buildSettlementSetup({
      stockpiles: {
        food: 32,
        redResource: 0,
        greenResource: 0,
        blueResource: 0,
        blackResource: 0,
      },
      villagerPracticeSlots: [null, null, null, null, null],
      strangerPracticeSlots: [null, null, null, null, null],
      structures: [null, { defId: "granary" }, { defId: "mudHouses" }, null, null, null],
    }),
    123
  );
  advanceToSecond(positiveState, 97);
  assert.deepEqual(
    summarizeClass(positiveState, "villager").happiness,
    {
      status: "positive",
      fullFeedStreak: 0,
      missedFeedStreak: 0,
      partialFeedRatios: [],
    },
    "three consecutive fully-fed seasons should improve class happiness"
  );

  const risingPartialState = createInitialState(
    buildSettlementSetup({
      stockpiles: {
        food: 4,
        redResource: 0,
        greenResource: 0,
        blueResource: 0,
        blackResource: 0,
      },
      villagerAdults: 10,
      villagerPracticeSlots: [null, null, null, null, null],
      strangerPracticeSlots: [null, null, null, null, null],
      structures: [null, { defId: "granary" }, { defId: "mudHouses" }, null, null, null],
    }),
    123
  );
  advanceToSecond(risingPartialState, 33);
  risingPartialState.hub.core.systemState.stockpiles.food = 6;
  advanceToSecond(risingPartialState, 65);
  risingPartialState.hub.core.systemState.stockpiles.food = 8;
  advanceToSecond(risingPartialState, 97);
  assert.deepEqual(
    summarizeClass(risingPartialState, "villager").happiness,
    {
      status: "positive",
      fullFeedStreak: 0,
      missedFeedStreak: 0,
      partialFeedRatios: [],
    },
    "three rising partial feed ratios should improve happiness"
  );

  const flatPartialState = createInitialState(
    buildSettlementSetup({
      stockpiles: {
        food: 6,
        redResource: 0,
        greenResource: 0,
        blueResource: 0,
        blackResource: 0,
      },
      villagerAdults: 10,
      villagerPracticeSlots: [null, null, null, null, null],
      strangerPracticeSlots: [null, null, null, null, null],
      structures: [null, { defId: "granary" }, { defId: "mudHouses" }, null, null, null],
    }),
    123
  );
  advanceToSecond(flatPartialState, 33);
  flatPartialState.hub.core.systemState.stockpiles.food = 6;
  advanceToSecond(flatPartialState, 65);
  assert.deepEqual(
    summarizeClass(flatPartialState, "villager").happiness,
    {
      status: "negative",
      fullFeedStreak: 0,
      missedFeedStreak: 0,
      partialFeedRatios: [0.6],
    },
    "flat-or-lower partial feed ratios should worsen happiness immediately"
  );

  advanceToSecond(positiveState, 129);
  advanceToSecond(flatPartialState, 129);

  assert.equal(
    summarizeClass(positiveState, "villager").faith.tier,
    "diamond",
    "happy classes should gain faith at the spring yearly rollover"
  );
  assert.equal(
    summarizeClass(flatPartialState, "villager").faith.tier,
    "silver",
    "unhappy classes should lose faith at the spring yearly rollover"
  );
  assert.equal(
    summarizeClass(flatPartialState, "villager").population.total,
    12,
    "yearly population change should now follow the class faith tier instead of feeding outcome"
  );
  assert.equal(
    summarizeClass(flatPartialState, "villager").population.adults,
    10,
    "faith-based youth growth should not change adult workforce directly"
  );
  assert.equal(
    summarizeClass(flatPartialState, "villager").population.youth,
    2,
    "gold faith should add 20 percent of the class into youth even on a negative year"
  );
  assert.equal(
    summarizeClass(positiveState, "villager").population.adults,
    8,
    "good years should not directly increase adults"
  );
  assert.equal(
    summarizeClass(positiveState, "villager").population.youth,
    1,
    "good years should add youth instead"
  );

  const missedState = createInitialState(
    buildSettlementSetup({
      stockpiles: {
        food: 0,
        redResource: 0,
        greenResource: 0,
        blueResource: 0,
        blackResource: 0,
      },
      villagerPracticeSlots: [null, null, null, null, null],
      strangerPracticeSlots: [null, null, null, null, null],
      structures: [null, { defId: "granary" }, { defId: "mudHouses" }, null, null, null],
    }),
    123
  );
  advanceToSecond(missedState, 97);
  assert.deepEqual(
    summarizeClass(missedState, "villager").happiness,
    {
      status: "negative",
      fullFeedStreak: 0,
      missedFeedStreak: 0,
      partialFeedRatios: [],
    },
    "three consecutive missed seasons should trigger starvation and reduce happiness"
  );
  assert.equal(
    summarizeClass(missedState, "villager").faith.tier,
    "silver",
    "the starvation event should reduce faith by one tier immediately"
  );
  assert.equal(
    summarizeClass(missedState, "villager").population.total,
    7,
    "the starvation event should remove 20 percent of class population immediately"
  );
  const starvationEvent = findLastGameEvent(missedState, "populationStarvationEvent", "villager");
  assert.equal(
    starvationEvent?.data?.starvationLoss?.totalRemoved,
    1,
    "the starvation event should report the seasonal population loss"
  );

  const bronzeCollapseState = createInitialState(
    buildSettlementSetup({
      stockpiles: {
        food: 15,
        redResource: 0,
        greenResource: 0,
        blueResource: 0,
        blackResource: 0,
      },
      villagerAdults: 10,
      villagerFaithTier: "bronze",
      villagerHappiness: {
        status: "negative",
        fullFeedStreak: 0,
        missedFeedStreak: 0,
        partialFeedRatios: [],
      },
      villagerPracticeSlots: [null, null, null, null, null],
      strangerPracticeSlots: [null, null, null, null, null],
      structures: [null, { defId: "granary" }, { defId: "mudHouses" }, null, null, null],
    }),
    123
  );
  advanceToSecond(bronzeCollapseState, 129);
  assert.equal(
    summarizeClass(bronzeCollapseState, "villager").faith.tier,
    "bronze",
    "bronze faith should remain at its floor"
  );
  assert.equal(
    summarizeClass(bronzeCollapseState, "villager").population.total,
    5,
    "negative happiness at bronze faith should now cause a half-loss after the bronze yearly decline"
  );
  const collapseEvent = findLastGameEvent(
    bronzeCollapseState,
    "populationYearlyUpdate",
    "villager"
  );
  assert.equal(
    collapseEvent?.data?.faith?.outcome,
    "faithCollapsed",
    "bronze-floor negative happiness should report a faith collapse outcome"
  );
  assert.equal(
    collapseEvent?.data?.faithPopulationLoss,
    4,
    "bronze-floor faith collapse should report the half-loss applied after the bronze yearly decline"
  );

  const floodRitesMoodState = createInitialState(
    buildSettlementSetup({
      stockpiles: {
        food: 40,
        redResource: 0,
        greenResource: 0,
        blueResource: 0,
        blackResource: 0,
      },
      villagerHappiness: {
        status: "neutral",
        fullFeedStreak: 0,
        missedFeedStreak: 0,
        partialFeedRatios: [],
      },
      villagerPracticeSlots: [{ defId: "floodRites" }, null, null, null, null],
      strangerPracticeSlots: [null, null, null, null, null],
      structures: [null, { defId: "granary" }, { defId: "mudHouses" }, { defId: "riverTemple" }, null, null],
    }),
    123
  );
  advanceToSecond(floodRitesMoodState, 65);
  assert.deepEqual(
    summarizeClass(floodRitesMoodState, "villager").happiness,
    {
      status: "positive",
      fullFeedStreak: 0,
      missedFeedStreak: 0,
      partialFeedRatios: [],
    },
    "flood rites should raise the acting class mood by one step when it resolves"
  );

  const weightedDemandState = createInitialState(
    buildSettlementSetup({
      stockpiles: {
        food: 9,
        redResource: 0,
        greenResource: 0,
        blueResource: 0,
        blackResource: 0,
      },
      villagerAdults: 8,
      villagerYouth: 2,
      villagerPracticeSlots: [null, null, null, null, null],
      strangerPracticeSlots: [null, null, null, null, null],
      structures: [null, { defId: "granary" }, { defId: "mudHouses" }, null, null, null],
    }),
    123
  );
  advanceToSecond(weightedDemandState, 33);
  assert.deepEqual(
    summarizeClass(weightedDemandState, "villager").yearly,
    {
      year: 1,
      mealAttempts: 9,
      mealSuccesses: 9,
      attractionProgress: 0,
      lastMealAttempts: 0,
      lastMealSuccesses: 0,
      lastOutcomeKind: null,
      lastSeasonOutcomeKind: "full",
      lastSeasonFeedRatio: 1,
    },
    "season meals should use adults plus youth at half cost"
  );

  const springFloodplainState = createInitialState(
    buildSettlementSetup({
      villagerPracticeSlots: [null, null, null, null, null],
      strangerPracticeSlots: [null, null, null, null, null],
      structures: [null, { defId: "granary" }, { defId: "mudHouses" }, null, null, null],
    }),
    123
  );
  advanceToSecond(springFloodplainState, 129);
  assert.equal(
    springFloodplainState.hub.core.systemState.stockpiles.greenResource,
    10,
    "floodplains should deposit green resource in spring after the autumn flood reset"
  );

  const demographicStepState = createInitialState(
    buildSettlementSetup({
      stockpiles: {
        food: 1000,
        redResource: 0,
        greenResource: 0,
        blueResource: 0,
        blackResource: 0,
      },
      villagerAdults: 8,
      villagerYouth: 10,
      villagerPracticeSlots: [null, null, null, null, null],
      strangerPracticeSlots: [null, null, null, null, null],
      structures: [null, { defId: "granary" }, { defId: "mudHouses" }, null, null, null],
    }),
    123
  );
  advanceToSecond(demographicStepState, 641);
  const demographicEvent = findLastGameEvent(
    demographicStepState,
    "populationYearlyUpdate",
    "villager"
  );
  assert.equal(
    summarizeClass(demographicStepState, "villager").population.adults,
    46,
    "every five years some youth should convert into adults"
  );
  assert.equal(
    summarizeClass(demographicStepState, "villager").population.youth,
    38,
    "every five years some youth should decay while the remainder stays youth"
  );
  assert.deepEqual(
    demographicEvent?.data?.demographicStep,
    {
      youthBefore: 95,
      toAdults: 38,
      decayed: 19,
      youthAfter: 38,
      adultsAfter: 46,
    },
    "the five-year demographic step should report youth conversion and decay in the yearly event"
  );
}

function runMirroringAssertions() {
  const state = createInitialState(
    buildSettlementSetup({
      strangerAdults: 4,
    }),
    123
  );

  advanceToSecond(state, 65);

  const villagerClass = summarizeClass(state, "villager");
  const strangerClass = summarizeClass(state, "stranger");

  assert.deepEqual(
    villagerClass.commitments,
    [{ sourceId: "floodRites", amount: 6, startSec: 65, releaseSec: 80 }],
    "villager flood rites should reserve villager population"
  );
  assert.deepEqual(
    strangerClass.commitments,
    [{ sourceId: "asTheRomans", amount: 3, startSec: 65, releaseSec: 80 }],
    "as the romans should reserve stranger population under its own source id"
  );
  assert.equal(
    strangerClass.practice[0].mirroredPracticeTitle,
    settlementPracticeDefs.floodRites.name,
    "as the romans should report which villager practice it is mirroring"
  );
  assert.equal(getSettlementStockpile(state, "redResource"), 9, "mirrored stranger flood rites should contribute to the shared red stockpile");
  assert.equal(
    strangerClass.practice[0].activeReservation,
    true,
    "mirrored stranger practice should expose the same authoritative reservation progress treatment"
  );
}

function runOpenToStrangersAssertions() {
  const requiredFaithTier =
    settlementPracticeDefs?.openToStrangers?.requires?.faithTierAtLeast ?? "gold";
  const state = createInitialState(
    buildSettlementSetup({
      villagerFaithTier: requiredFaithTier,
      strangerFaithTier: requiredFaithTier,
    }),
    123
  );
  const populationCapacity = Math.floor(
    hubStructureDefs?.mudHouses?.settlementPrototype?.populationCapacityBonus ?? 0
  );

  advanceToSecond(state, 129);

  const villager = summarizeClass(state, "villager");
  const stranger = summarizeClass(state, "stranger");
  const expectedVillagersAfterGrowth = 12;
  const expectedVillagerAdults = 8;
  const expectedVillagerYouth = 4;
  const expectedStrangerAttraction = Math.floor(
    (populationCapacity - expectedVillagersAfterGrowth) *
      PRACTICE_OPEN_TO_STRANGERS_ATTRACTION_PER_VACANCY_PER_YEAR
  );
  const expectedFoodAfterSpringMeal = 0;

  assert.equal(villager.population.total, expectedVillagersAfterGrowth, "villagers should still receive their own yearly growth result");
  assert.equal(villager.population.adults, expectedVillagerAdults, "villager adults should remain stable after a favorable year");
  assert.equal(villager.population.youth, expectedVillagerYouth, "villager favorable growth should now land in youth");
  assert.equal(
    stranger.population.total,
    expectedStrangerAttraction,
    "open to strangers should add population to the stranger class rather than the villager class"
  );
  assert.equal(
    getSettlementStockpile(state, "food"),
    expectedFoodAfterSpringMeal,
    "after the spring deposit timing shift, the new spring meal and practice startup should leave the food stockpile empty in this fixture"
  );
  assert.deepEqual(
    state.hub.core.props.practicePassiveBonusesByClass,
    {
      villager: {},
      stranger: {
        attractionPerVacancyPerYear:
          PRACTICE_OPEN_TO_STRANGERS_ATTRACTION_PER_VACANCY_PER_YEAR,
      },
    },
    "passive practice bonuses should target the stranger demographic when specified"
  );
  const strangerYearlyEvent = findLastGameEvent(state, "populationYearlyUpdate", "stranger");
  assert.equal(
    strangerYearlyEvent?.data?.populationOutcome,
    "populationAttracted",
    "the stranger yearly report should record a vacancy-attraction outcome"
  );
  assert.equal(
    strangerYearlyEvent?.data?.attractedPopulation,
    expectedStrangerAttraction,
    "the yearly event should report the stranger attraction amount"
  );
}

function runBecomeVillagersAssertions() {
  const state = createInitialState(
    buildSettlementSetup({
      stockpiles: {
        food: 80,
        redResource: 0,
        greenResource: 0,
        blueResource: 0,
        blackResource: 0,
      },
      villagerAdults: 0,
      strangerAdults: 20,
      villagerPracticeSlots: [null, null, null, null, null],
      strangerPracticeSlots: [null, { defId: "becomeVillagers" }, null, null, null],
      structures: [{ defId: "granary" }, { defId: "mudHouses" }, null, null, null, null],
    }),
    123
  );

  advanceToSecond(state, 256);

  const activeRuntime = summarizeClass(state, "stranger").practice[1];
  assert.deepEqual(
    summarizeClass(state, "stranger").commitments,
    [{ sourceId: "becomeVillagers", amount: 2, startSec: 256, releaseSec: 512 }],
    "become villagers should reserve 10 percent of strangers for a 2-year conversion timer"
  );
  assert.equal(activeRuntime.activeReservation, true, "become villagers should expose an active drain runtime");
  assert.equal(activeRuntime.activeAmount, 2, "become villagers should report its reserved stranger amount");
  assert.equal(activeRuntime.activeRemainingSec, 256, "become villagers should start with a full 2-year timer");
  assertClose(
    activeRuntime.activeProgressRemaining,
    1,
    0.0001,
    "become villagers should start with a full drain mask"
  );

  advanceToSecond(state, 300);
  const midRuntime = summarizeClass(state, "stranger").practice[1];
  assert.equal(midRuntime.activeRemainingSec, 212, "become villagers should count down from authoritative time");
  assertClose(
    midRuntime.activeProgressRemaining,
    212 / 256,
    0.0001,
    "become villagers drain progress should rebuild from startSec and releaseSec"
  );

  advanceToSecond(state, 512);
  assert.equal(
    summarizeClass(state, "villager").population.total,
    2,
    "become villagers should transfer its reserved amount into the villager class on completion"
  );
  assert.equal(
    summarizeClass(state, "villager").population.adults,
    2,
    "become villagers should transfer adults by default"
  );
  assert.equal(
    summarizeClass(state, "stranger").practice[1].activeReservation,
    true,
    "become villagers should be able to start a new reservation immediately after completion if the stranger class still qualifies"
  );
}

function runSerializationReplayAssertions() {
  const legacySetup = buildSettlementSetup();
  const legacyState = createInitialState(
    {
      ...legacySetup,
      hub: {
        ...legacySetup.hub,
        core: {
          systemState: {
            stockpiles: {
              food: 40,
              redResource: 0,
              greenResource: 0,
              blueResource: 0,
              blackResource: 0,
            },
            populationClasses: {
              villager: {
                total: 8,
              },
              stranger: {
                total: 0,
              },
            },
          },
        },
      },
    },
    123
  );
  assert.equal(
    summarizeClass(legacyState, "villager").population.adults,
    8,
    "legacy class totals should normalize into adult population"
  );
  assert.equal(
    summarizeClass(legacyState, "villager").population.youth,
    0,
    "legacy class totals should default youth to zero"
  );

  const live = createInitialState(
    buildSettlementSetup({
      strangerAdults: 4,
    }),
    123
  );
  advanceToSecond(live, 72);

  const serialized = serializeGameState(live);
  const restored = deserializeGameState(serialized);
  assert.deepEqual(
    summarizeState(restored),
    summarizeState(live),
    "serialize/deserialize should preserve class populations, commitments, and class practice runtimes"
  );

  const timeline = createTimelineFromInitialState(
    createInitialState(
      buildSettlementSetup({
        strangerAdults: 4,
      }),
      123
    )
  );
  const rebuilt = rebuildStateAtSecond(timeline, 72);
  assert.equal(rebuilt?.ok, true, `rebuildStateAtSecond failed: ${JSON.stringify(rebuilt)}`);
  assert.deepEqual(
    summarizeState(rebuilt.state),
    summarizeState(live),
    "replay rebuild should match live class demographic simulation"
  );
}

function run() {
  runInitAssertions();
  runMealPriorityAssertions();
  runHappinessAssertions();
  runMirroringAssertions();
  runOpenToStrangersAssertions();
  runBecomeVillagersAssertions();
  runSerializationReplayAssertions();
  console.log("[test] devPlaytesting01 settlement demographics passed");
}

run();
