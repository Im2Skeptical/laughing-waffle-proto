import assert from "node:assert/strict";

import { ActionKinds, applyAction } from "../src/model/actions.js";
import { hubStructureDefs } from "../src/defs/gamepieces/hub-structure-defs.js";
import { settlementOrderDefs } from "../src/defs/gamepieces/settlement-order-defs.js";
import { settlementPracticeDefs } from "../src/defs/gamepieces/settlement-practice-defs.js";
import { SETTLEMENT_VASSAL_MAJOR_DEVELOPMENT_CHANCE } from "../src/defs/gamepieces/settlement-vassal-defs.js";
import {
  DEMOGRAPHIC_STEP_YEARS,
  PRACTICE_OPEN_TO_STRANGERS_ATTRACTION_PER_VACANCY_PER_YEAR,
  SEASON_DURATION_SEC,
} from "../src/defs/gamesettings/gamerules-defs.js";
import { DEFAULT_VARIANT_FLAGS } from "../src/defs/gamesettings/variant-flags-defs.js";
import { createInitialState, updateGame } from "../src/model/game-model.js";
import { getCurrentSeasonKey, deserializeGameState, serializeGameState } from "../src/model/state.js";
import { syncSettlementDerivedState } from "../src/model/settlement-exec.js";
import { stepSettlementOrders } from "../src/model/settlement-order-exec.js";
import { buildGeneratedAgendaByClass } from "../src/model/settlement-leadership.js";
import {
  getSettlementClassIds,
  getSettlementCurrentVassal,
  getSettlementFaithSummary,
  getSettlementOrderSlots,
  getSettlementPendingVassalSelection,
  getSettlementPopulationSummary,
  getSettlementPracticeSlotsByClass,
  getSettlementStockpile,
} from "../src/model/settlement-state.js";
import {
  appendActionAtCursor,
  createTimelineFromInitialState,
  rebuildStateAtSecond,
} from "../src/model/timeline/index.js";
import {
  findSettlementStructureByDefId,
  getSettlementStructureCapacityBonus,
} from "../src/model/settlement-upgrades.js";

function advanceToSecond(state, targetSec) {
  const safeTarget = Math.max(0, Math.floor(targetSec));
  while ((state?.tSec ?? 0) < safeTarget) {
    updateGame(1 / 60, state);
  }
}

function advanceToSecondMaintainingFood(state, targetSec, foodAmount) {
  const safeTarget = Math.max(0, Math.floor(targetSec));
  const safeFoodAmount = Math.max(0, Math.floor(foodAmount));
  while ((state?.tSec ?? 0) < safeTarget) {
    updateGame(1 / 60, state);
    if (state?.hub?.core?.systemState?.stockpiles) {
      state.hub.core.systemState.stockpiles.food = safeFoodAmount;
    }
  }
}

const SETTLEMENT_SEASON_SEC = Math.max(1, Math.floor(SEASON_DURATION_SEC));
const SETTLEMENT_YEAR_SEC = SETTLEMENT_SEASON_SEC * 4;
const BECOME_VILLAGERS_CADENCE_SEC = Math.max(
  1,
  Math.floor(settlementPracticeDefs?.becomeVillagers?.timing?.cadenceSec ?? SETTLEMENT_YEAR_SEC * 2)
);
const FLOOD_RITES_RELEASE_OFFSET_SEC = Math.max(
  0,
  Math.floor(
    settlementPracticeDefs?.floodRites?.effects?.find((effect) => effect?.op === "ReservePopulation")
      ?.releaseOffsetSec ?? 0
  )
);
const SERIALIZATION_REPLAY_SNAPSHOT_SEC = Math.max(
  1,
  SETTLEMENT_SEASON_SEC * 2 + Math.ceil(SETTLEMENT_SEASON_SEC / 4)
);

function afterSettlementSeasons(seasonCount) {
  return Math.max(0, Math.floor(seasonCount) * SETTLEMENT_SEASON_SEC + 1);
}

function afterSettlementYears(yearCount) {
  return afterSettlementSeasons(Math.floor(yearCount) * 4);
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
  orderSlots = null,
  structures = [
    null,
    { defId: "granary", tier: "diamond" },
    { defId: "mudHouses", tier: "diamond" },
    { defId: "riverTemple" },
    null,
    null,
  ],
} = {}) {
  const normalizedStructures = structures.map((entry) => {
    if (!entry || typeof entry !== "object") return entry;
    if (
      (entry.defId === "granary" || entry.defId === "mudHouses") &&
      typeof entry.tier !== "string"
    ) {
      return {
        ...entry,
        tier: "diamond",
      };
    }
    return entry;
  });
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
      cols: normalizedStructures.length,
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
          slots: Array.isArray(orderSlots) ? orderSlots : [null],
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
          slots: normalizedStructures,
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
    order: getSettlementOrderSlots(state).map((slot) => ({
      defId: slot?.card?.defId ?? null,
      memberCount: Math.floor(slot?.card?.props?.settlement?.memberCount ?? 0),
      lastProcessedYear: Number.isFinite(slot?.card?.props?.settlement?.lastProcessedYear)
        ? Math.floor(slot.card.props.settlement.lastProcessedYear)
        : null,
      nextRecruitmentYear: Number.isFinite(slot?.card?.props?.settlement?.nextRecruitmentYear)
        ? Math.floor(slot.card.props.settlement.nextRecruitmentYear)
        : null,
      resolvedBoardsByClass: slot?.card?.props?.settlement?.resolvedBoardsByClass ?? null,
      members: Array.isArray(slot?.card?.props?.settlement?.members)
        ? slot.card.props.settlement.members.map((member) => ({
            memberId: member?.memberId ?? null,
            ageYears: Math.floor(member?.ageYears ?? 0),
            modifierId: member?.modifierId ?? null,
            prestige: Math.floor(member?.prestige ?? 0),
          }))
        : [],
    })),
    aggregatePopulation: getSettlementPopulationSummary(state),
    bonuses: state?.hub?.core?.props?.practicePassiveBonusesByClass ?? null,
    byClass: Object.fromEntries(classIds.map((classId) => [classId, summarizeClass(state, classId)])),
  };
}

function summarizePendingVassalSelection(state) {
  const pendingSelection = getSettlementPendingVassalSelection(state);
  return {
    poolId: pendingSelection?.poolId ?? null,
    createdSec: Math.floor(pendingSelection?.createdSec ?? 0),
    candidates: (Array.isArray(pendingSelection?.candidates) ? pendingSelection.candidates : []).map(
      (candidate) => ({
        vassalId: candidate?.vassalId ?? null,
        sourceClassId: candidate?.sourceClassId ?? null,
        initialAgeYears: Math.floor(candidate?.initialAgeYears ?? 0),
        deathAgeYears: Math.floor(candidate?.deathAgeYears ?? 0),
        deathSec: Math.floor(candidate?.deathSec ?? 0),
        professionAgeYears: Math.floor(candidate?.professionAgeYears ?? 0),
        traitAgeYears: Math.floor(candidate?.traitAgeYears ?? 0),
        agendaByClass: candidate?.agendaByClass ?? {},
        eventKinds: (Array.isArray(candidate?.lifeEvents) ? candidate.lifeEvents : []).map(
          (event) => `${event?.kind ?? "event"}:${Math.floor(event?.ageYears ?? 0)}`
        ),
      })
    ),
  };
}

function summarizeCouncilMembers(state) {
  const councilCard = getSettlementOrderSlots(state)[0]?.card ?? null;
  return Array.isArray(councilCard?.systemState?.elderCouncil?.members)
    ? councilCard.systemState.elderCouncil.members.map((member) => ({
        memberId: member?.memberId ?? null,
        sourceVassalId: member?.sourceVassalId ?? null,
        sourceClassId: member?.sourceClassId ?? null,
        joinedYear: Math.floor(member?.joinedYear ?? 0),
        ageYears: Math.floor(member?.ageYears ?? 0),
        modifierId: member?.modifierId ?? null,
      }))
    : [];
}

function summarizeCurrentVassal(state) {
  const currentVassal = getSettlementCurrentVassal(state);
  if (!currentVassal) return null;
  return {
    vassalId: currentVassal.vassalId,
    sourceClassId: currentVassal.sourceClassId,
    currentClassId: currentVassal.currentClassId,
    birthSec: Math.floor(currentVassal.birthSec ?? 0),
    birthYear: Math.floor(currentVassal.birthYear ?? 0),
    selectedSec: Math.floor(currentVassal.selectedSec ?? 0),
    deathSec: Math.floor(currentVassal.deathSec ?? 0),
    deathYear: Math.floor(currentVassal.deathYear ?? 0),
    professionId: currentVassal.professionId ?? null,
    traitId: currentVassal.traitId ?? null,
    councilMemberId: currentVassal.councilMemberId ?? null,
    joinedCouncilSec: Number.isFinite(currentVassal?.joinedCouncilSec)
      ? Math.floor(currentVassal.joinedCouncilSec)
      : null,
    removedFromCouncilSec: Number.isFinite(currentVassal?.removedFromCouncilSec)
      ? Math.floor(currentVassal.removedFromCouncilSec)
      : null,
    isDead: currentVassal.isDead === true,
    isElder: currentVassal.isElder === true,
    lifeEvents: (Array.isArray(currentVassal?.lifeEvents) ? currentVassal.lifeEvents : []).map((event) => ({
      kind: event?.kind ?? null,
      tSec: Math.floor(event?.tSec ?? 0),
      ageYears: Math.floor(event?.ageYears ?? 0),
      classId: event?.classId ?? null,
      professionId: event?.professionId ?? null,
      traitId: event?.traitId ?? null,
      causeOfDeath: event?.causeOfDeath ?? null,
      text: event?.text ?? "",
    })),
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
  assert.equal(summary.byClass.villager.population.total, 34, "expected villager starting population");
  assert.equal(summary.byClass.villager.population.adults, 24, "expected villager starting adults");
  assert.equal(summary.byClass.villager.population.youth, 10, "expected villager starting youth");
  assert.equal(summary.byClass.villager.population.free, 22, "expected villager free population after temple staffing");
  assert.equal(summary.byClass.stranger.population.total, 0, "expected stranger pool to start empty");
  assert.equal(
    state.hub.zones.order.slots[0]?.card?.defId,
    "elderCouncil",
    "expected elder council order card"
  );
  assert.equal(
    state.hub.zones.order.slots[0]?.card?.props?.settlement?.memberCount,
    4,
    "expected seeded four-member elder council"
  );
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
      structures: [
        null,
        { defId: "granary", tier: "diamond" },
        { defId: "mudHouses", tier: "diamond" },
        null,
        null,
        null,
      ],
    }),
    123
  );

  advanceToSecond(state, afterSettlementSeasons(1));

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
  advanceToSecond(positiveState, afterSettlementSeasons(3));
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
        food: 5,
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
  advanceToSecond(risingPartialState, afterSettlementSeasons(1));
  risingPartialState.hub.core.systemState.stockpiles.food = 6;
  advanceToSecond(risingPartialState, afterSettlementSeasons(2));
  risingPartialState.hub.core.systemState.stockpiles.food = 7;
  advanceToSecond(risingPartialState, afterSettlementSeasons(3));
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

  const belowPartialThresholdState = createInitialState(
    buildSettlementSetup({
      stockpiles: {
        food: 4.75,
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
  advanceToSecond(belowPartialThresholdState, afterSettlementSeasons(1));
  assert.equal(
    summarizeClass(belowPartialThresholdState, "villager").yearly.lastSeasonOutcomeKind,
    "missed",
    "feeding under 50 percent of the class population should still count as a missed season"
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
  advanceToSecond(flatPartialState, afterSettlementSeasons(1));
  flatPartialState.hub.core.systemState.stockpiles.food = 6;
  advanceToSecond(flatPartialState, afterSettlementSeasons(2));
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

  advanceToSecond(positiveState, afterSettlementYears(1));
  advanceToSecond(flatPartialState, afterSettlementYears(1));

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
  advanceToSecond(missedState, afterSettlementSeasons(3));
  assert.deepEqual(
    summarizeClass(missedState, "villager").happiness,
    {
      status: "negative",
      fullFeedStreak: 0,
      missedFeedStreak: 3,
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

  const starvationCarryState = createInitialState(
    buildSettlementSetup({
      stockpiles: {
        food: 0,
        redResource: 0,
        greenResource: 0,
        blueResource: 0,
        blackResource: 0,
      },
      villagerAdults: 8,
      villagerHappiness: {
        status: "neutral",
        fullFeedStreak: 0,
        missedFeedStreak: 2,
        partialFeedRatios: [],
      },
      villagerPracticeSlots: [null, null, null, null, null],
      strangerPracticeSlots: [null, null, null, null, null],
      structures: [null, { defId: "granary" }, { defId: "mudHouses" }, null, null, null],
    }),
    123
  );
  advanceToSecond(starvationCarryState, afterSettlementSeasons(1));
  assert.deepEqual(
    summarizeClass(starvationCarryState, "villager").happiness,
    {
      status: "negative",
      fullFeedStreak: 0,
      missedFeedStreak: 3,
      partialFeedRatios: [],
    },
    "starvation should not clear the missed-feed streak on trigger"
  );
  starvationCarryState.hub.core.systemState.stockpiles.food = 0;
  advanceToSecond(starvationCarryState, afterSettlementSeasons(2));
  assert.deepEqual(
    summarizeClass(starvationCarryState, "villager").happiness,
    {
      status: "negative",
      fullFeedStreak: 0,
      missedFeedStreak: 3,
      partialFeedRatios: [],
    },
    "continued misses after starvation should keep the streak latched until a qualifying feed"
  );
  const villagerStarvationEvents = starvationCarryState.gameEventFeed.filter(
    (entry) =>
      entry?.type === "populationStarvationEvent" && entry?.data?.classId === "villager"
  );
  assert.equal(
    villagerStarvationEvents.length,
    2,
    "further missed seasons should keep triggering starvation while the streak stays latched"
  );

  const starvationResetState = createInitialState(
    buildSettlementSetup({
      stockpiles: {
        food: 4,
        redResource: 0,
        greenResource: 0,
        blueResource: 0,
        blackResource: 0,
      },
      villagerAdults: 8,
      villagerHappiness: {
        status: "negative",
        fullFeedStreak: 0,
        missedFeedStreak: 3,
        partialFeedRatios: [],
      },
      villagerPracticeSlots: [null, null, null, null, null],
      strangerPracticeSlots: [null, null, null, null, null],
      structures: [null, { defId: "granary" }, { defId: "mudHouses" }, null, null, null],
    }),
    123
  );
  advanceToSecond(starvationResetState, afterSettlementSeasons(1));
  assert.deepEqual(
    summarizeClass(starvationResetState, "villager").happiness,
    {
      status: "negative",
      fullFeedStreak: 0,
      missedFeedStreak: 0,
      partialFeedRatios: [0.5],
    },
    "a qualifying partial feed should clear the latched starvation streak"
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
  advanceToSecond(bronzeCollapseState, afterSettlementYears(1));
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
      structures: [
        null,
        { defId: "granary", tier: "diamond" },
        { defId: "mudHouses", tier: "diamond" },
        { defId: "riverTemple" },
        null,
        null,
      ],
    }),
    123
  );
  advanceToSecond(floodRitesMoodState, afterSettlementSeasons(2));
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

  const roundedYouthDemandState = createInitialState(
    buildSettlementSetup({
      stockpiles: {
        food: 9,
        redResource: 0,
        greenResource: 0,
        blueResource: 0,
        blackResource: 0,
      },
      villagerAdults: 8,
      villagerYouth: 1,
      villagerPracticeSlots: [null, null, null, null, null],
      strangerPracticeSlots: [null, null, null, null, null],
      structures: [null, { defId: "granary" }, { defId: "mudHouses" }, null, null, null],
    }),
    123
  );
  advanceToSecond(roundedYouthDemandState, afterSettlementSeasons(1));
  assert.deepEqual(
    summarizeClass(roundedYouthDemandState, "villager").yearly,
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
    "season meals should round odd youth up to one full food per pair"
  );

  const springFloodplainState = createInitialState(
    buildSettlementSetup({
      villagerPracticeSlots: [null, null, null, null, null],
      strangerPracticeSlots: [null, null, null, null, null],
      structures: [null, { defId: "granary" }, { defId: "mudHouses" }, null, null, null],
    }),
    123
  );
  advanceToSecond(springFloodplainState, afterSettlementYears(1));
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
  advanceToSecondMaintainingFood(
    demographicStepState,
    afterSettlementYears(DEMOGRAPHIC_STEP_YEARS),
    200
  );
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

function runHousingPressureAssertions() {
  const neutralCapState = createInitialState(
    buildSettlementSetup({
      stockpiles: {
        food: 400,
        redResource: 0,
        greenResource: 0,
        blueResource: 0,
        blackResource: 0,
      },
      villagerAdults: 101,
      villagerFaithTier: "silver",
      villagerHappiness: {
        status: "positive",
        fullFeedStreak: 0,
        missedFeedStreak: 0,
        partialFeedRatios: [],
      },
      villagerPracticeSlots: [null, null, null, null, null],
      strangerPracticeSlots: [null, null, null, null, null],
      structures: [
        null,
        { defId: "granary", tier: "diamond" },
        { defId: "mudHouses", tier: "bronze" },
        null,
        null,
        null,
      ],
    }),
    123
  );
  assert.equal(
    summarizeClass(neutralCapState, "villager").population.total,
    101,
    "housing overflow should no longer trim population back to the capacity"
  );
  assert.deepEqual(
    summarizeClass(neutralCapState, "villager").happiness,
    {
      status: "neutral",
      fullFeedStreak: 0,
      missedFeedStreak: 0,
      partialFeedRatios: [],
    },
    "population above the housing cap should clamp happiness to neutral"
  );
  advanceToSecond(neutralCapState, afterSettlementYears(1));
  assert.equal(
    summarizeClass(neutralCapState, "villager").faith.tier,
    "silver",
    "overcrowding at up to 120 percent should prevent positive happiness from raising faith"
  );

  const negativeCapState = createInitialState(
    buildSettlementSetup({
      stockpiles: {
        food: 500,
        redResource: 0,
        greenResource: 0,
        blueResource: 0,
        blackResource: 0,
      },
      villagerAdults: 121,
      villagerFaithTier: "gold",
      villagerHappiness: {
        status: "positive",
        fullFeedStreak: 0,
        missedFeedStreak: 0,
        partialFeedRatios: [],
      },
      villagerPracticeSlots: [null, null, null, null, null],
      strangerPracticeSlots: [null, null, null, null, null],
      structures: [
        null,
        { defId: "granary", tier: "diamond" },
        { defId: "mudHouses", tier: "bronze" },
        null,
        null,
        null,
      ],
    }),
    123
  );
  assert.equal(
    summarizeClass(negativeCapState, "villager").population.total,
    121,
    "housing overflow beyond 120 percent should still preserve the excess population"
  );
  assert.deepEqual(
    summarizeClass(negativeCapState, "villager").happiness,
    {
      status: "negative",
      fullFeedStreak: 0,
      missedFeedStreak: 0,
      partialFeedRatios: [],
    },
    "population above 120 percent of housing should clamp happiness to negative"
  );
  advanceToSecond(negativeCapState, afterSettlementYears(1));
  assert.equal(
    summarizeClass(negativeCapState, "villager").faith.tier,
    "silver",
    "severe overcrowding should drive the yearly faith downgrade through the negative happiness cap"
  );
}

function runMirroringAssertions() {
  const state = createInitialState(
    buildSettlementSetup({
      strangerAdults: 4,
    }),
    123
  );

  advanceToSecond(state, afterSettlementSeasons(2));

  const villagerClass = summarizeClass(state, "villager");
  const strangerClass = summarizeClass(state, "stranger");
  const expectedFloodRitesStartSec = afterSettlementSeasons(2);
  const expectedFloodRitesReleaseSec =
    expectedFloodRitesStartSec + FLOOD_RITES_RELEASE_OFFSET_SEC;

  assert.deepEqual(
    villagerClass.commitments,
    [
      {
        sourceId: "floodRites",
        amount: 6,
        startSec: expectedFloodRitesStartSec,
        releaseSec: expectedFloodRitesReleaseSec,
      },
    ],
    "villager flood rites should reserve villager population"
  );
  assert.deepEqual(
    strangerClass.commitments,
    [
      {
        sourceId: "asTheRomans",
        amount: 3,
        startSec: expectedFloodRitesStartSec,
        releaseSec: expectedFloodRitesReleaseSec,
      },
    ],
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

function runElderCouncilAssertions() {
  const state = createInitialState("devPlaytesting01", 123);
  const orderDef = settlementOrderDefs.elderCouncil;
  const expectedCadenceYears = Math.max(
    1,
    Math.floor(orderDef?.recruitmentCadenceYears ?? 5)
  );
  const expectedAdultsPerElder = Math.max(
    1,
    Math.floor(orderDef?.recruitmentAdultsPerElder ?? 100)
  );
  const councilCard = state.hub.zones.order.slots[0]?.card ?? null;
  assert.equal(councilCard?.defId, "elderCouncil", "expected elder council def id");
  assert.equal(
    councilCard?.props?.settlement?.memberCount,
    4,
    "expected seeded elder council member count"
  );
  assert.deepEqual(
    councilCard?.props?.settlement?.resolvedBoardsByClass,
    {
      villager: ["floodRites", "riverRecessionFarming", "rest", "openToStrangers"],
      stranger: ["asTheRomans", "becomeVillagers"],
    },
    "seeded elder agendas should reproduce the prototype practice boards"
  );
  assert.equal(
    councilCard?.props?.settlement?.recruitmentCadenceYears,
    expectedCadenceYears,
    "elder council runtime should surface the recruitment cadence"
  );
  assert.equal(
    councilCard?.props?.settlement?.recruitmentAdultsPerElder,
    expectedAdultsPerElder,
    "elder council runtime should surface the adults-per-elder recruitment rate"
  );
  assert.equal(
    councilCard?.props?.settlement?.recruitmentAdultPopulation,
    Math.max(0, Math.floor(getSettlementPopulationSummary(state)?.adults ?? 0)),
    "elder council runtime should surface the current adult population used for recruitment"
  );

  const recruitmentState = createInitialState(
    buildSettlementSetup({
      orderSlots: [{ defId: "elderCouncil" }],
      villagerPracticeSlots: [null, null, null, null, null],
      strangerPracticeSlots: [null, null, null, null, null],
    }),
    123
  );
  recruitmentState.year = 5;
  recruitmentState._seasonChanged = true;
  recruitmentState.hub.core.systemState.populationClasses.villager.adults = 300;
  recruitmentState.hub.core.systemState.populationClasses.villager.youth = 0;
  const recruitmentCouncil = recruitmentState.hub.zones.order.slots[0].card.systemState.elderCouncil;
  recruitmentCouncil.lastProcessedYear = 4;
  recruitmentCouncil.members = recruitmentCouncil.members.map((member, index) => ({
    ...member,
    ageYears: 30 + index,
  }));
  syncSettlementDerivedState(recruitmentState, recruitmentState.tSec);
  stepSettlementOrders(recruitmentState, recruitmentState.tSec);
  const expectedGuaranteedRecruits = Math.floor(300 / expectedAdultsPerElder);
  assert.equal(
    recruitmentState.hub.zones.order.slots[0].card.props.settlement.memberCount,
    4 + expectedGuaranteedRecruits,
    "five-year cadence should append recruits without a seat cap"
  );
  assert.equal(
    recruitmentState.hub.zones.order.slots[0].card.props.settlement.projectedRecruitsGuaranteed,
    expectedGuaranteedRecruits,
    "elder council runtime should expose the guaranteed recruit count at the current adult population"
  );
  assert.equal(
    recruitmentState.hub.zones.order.slots[0].card.props.settlement.projectedRecruitsRemainderChance,
    0,
    "elder council runtime should expose the remainder recruit chance"
  );

  const mutationDef = settlementOrderDefs.elderCouncil;
  const originalAgendaMutation = JSON.parse(
    JSON.stringify(mutationDef?.agendaMutation ?? {})
  );
  try {
    for (const developmentChance of [1.0, 100]) {
      mutationDef.agendaMutation = {
        ...mutationDef.agendaMutation,
        reorderChance: 0,
        developmentChance,
      };
      const mutationState = createInitialState(
        buildSettlementSetup({
          orderSlots: [{ defId: "elderCouncil" }],
          villagerPracticeSlots: [null, null, null, null, null],
          strangerPracticeSlots: [null, null, null, null, null],
        }),
        123
      );
      mutationState.year = 5;
      mutationState._seasonChanged = true;
      mutationState.hub.core.systemState.populationClasses.villager.adults = 300;
      mutationState.hub.core.systemState.populationClasses.villager.youth = 0;

      const mutationCard = mutationState.hub.zones.order.slots[0]?.card ?? null;
      const mutationCouncil = mutationCard?.systemState?.elderCouncil ?? null;
      assert.ok(mutationCouncil, "expected elder council state for recruitment mutation test");
      mutationCouncil.lastProcessedYear = 4;
      mutationCouncil.members = mutationCouncil.members.map((member, index) => ({
        ...member,
        ageYears: 30 + index,
      }));

      syncSettlementDerivedState(mutationState, mutationState.tSec);
      stepSettlementOrders(mutationState, mutationState.tSec);

      const recruitedMembers = mutationCard.systemState.elderCouncil.members.filter(
        (member) => member?.joinedYear === 5
      );
      assert.equal(
        recruitedMembers.length,
        expectedGuaranteedRecruits,
        "expected the current guaranteed recruit count in the mutation test"
      );
      assert.equal(
        recruitedMembers.every((member) =>
          (member?.agendaByClass?.villager ?? []).some(
            (defId) => settlementPracticeDefs?.[defId]?.orderDevelopmentTier === "minor"
          )
        ),
        true,
        `developmentChance=${developmentChance} should add a minor villager practice to each recruited elder agenda`
      );
    }

    const extinctionState = createInitialState(
      buildSettlementSetup({
        orderSlots: [{ defId: "elderCouncil" }],
      }),
      123
    );
    const extinctionCard = extinctionState.hub.zones.order.slots[0]?.card ?? null;
    const extinctionCouncil = extinctionCard?.systemState?.elderCouncil ?? null;
    assert.ok(extinctionCouncil, "expected elder council state for extinction regression");
    extinctionCouncil.members = [];
    extinctionCouncil.lastProcessedYear = 7;
    extinctionCouncil.nextMemberId = 5;
    extinctionState.year = 8;
    extinctionState._seasonChanged = true;
    syncSettlementDerivedState(extinctionState, extinctionState.tSec);
    stepSettlementOrders(extinctionState, extinctionState.tSec);
    assert.equal(
      extinctionCard.systemState.elderCouncil.members.length,
      0,
      "an extinct council should stay empty until real recruitment, not silently reseed from the initial template"
    );
    assert.deepEqual(
      extinctionCard.props.settlement.resolvedBoardsByClass,
      {
        villager: ["floodRites", "riverRecessionFarming", "rest", "openToStrangers"],
        stranger: ["asTheRomans", "becomeVillagers"],
      },
      "when the council is empty, the current practice boards should remain unchanged until new elders are recruited"
    );
  } finally {
    mutationDef.agendaMutation = originalAgendaMutation;
  }
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
    getSettlementStructureCapacityBonus(findSettlementStructureByDefId(state, "mudHouses"))
  );

  advanceToSecond(state, afterSettlementYears(1));

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
      structures: [
        { defId: "granary", tier: "diamond" },
        { defId: "mudHouses", tier: "diamond" },
        null,
        null,
        null,
        null,
      ],
    }),
    123
  );

  advanceToSecond(state, BECOME_VILLAGERS_CADENCE_SEC - 1);
  const beforeFirstTriggerVillagers = summarizeClass(state, "villager").population.total;
  const beforeFirstTriggerStrangers = summarizeClass(state, "stranger").population.total;
  const expectedFirstConversion = Math.max(1, Math.floor(beforeFirstTriggerStrangers / 10));

  advanceToSecond(state, BECOME_VILLAGERS_CADENCE_SEC);
  const firstTriggerRuntime = summarizeClass(state, "stranger").practice[1];
  assert.deepEqual(
    summarizeClass(state, "stranger").commitments,
    [],
    "become villagers should not reserve stranger population"
  );
  assert.equal(
    summarizeClass(state, "villager").population.total,
    beforeFirstTriggerVillagers + expectedFirstConversion,
    "become villagers should convert population immediately when its 2-year trigger fires"
  );
  assert.equal(
    summarizeClass(state, "stranger").population.total,
    beforeFirstTriggerStrangers - expectedFirstConversion,
    "become villagers should remove the converted amount from the stranger class immediately"
  );
  assert.equal(
    firstTriggerRuntime.activeReservation,
    false,
    "become villagers should not expose reservation runtime after triggering"
  );
  assert.equal(
    firstTriggerRuntime.lastRunSec,
    BECOME_VILLAGERS_CADENCE_SEC,
    "become villagers should record when the trigger last fired"
  );
  assert.equal(
    firstTriggerRuntime.lastAmount,
    expectedFirstConversion,
    "become villagers should record the converted amount from the trigger"
  );
  assert.equal(
    firstTriggerRuntime.activeRemainingSec,
    BECOME_VILLAGERS_CADENCE_SEC,
    "become villagers should reset its cadence countdown after triggering"
  );
  assertClose(
    firstTriggerRuntime.activeProgressRemaining,
    1,
    0.0001,
    "become villagers should show a full cadence drain immediately after triggering"
  );
  assert.equal(
    firstTriggerRuntime.previewAmount,
    Math.floor((beforeFirstTriggerStrangers - expectedFirstConversion) / 10),
    "become villagers should recalculate its next conversion amount from the remaining stranger population"
  );

  const becomeVillagersMidCadenceElapsedSec = Math.max(
    1,
    Math.floor((BECOME_VILLAGERS_CADENCE_SEC * 44) / 256)
  );
  advanceToSecond(state, BECOME_VILLAGERS_CADENCE_SEC + becomeVillagersMidCadenceElapsedSec);
  const midRuntime = summarizeClass(state, "stranger").practice[1];
  assert.equal(
    midRuntime.activeReservation,
    false,
    "become villagers should remain non-reserving between triggers"
  );
  assert.equal(
    midRuntime.lastRunSec,
    BECOME_VILLAGERS_CADENCE_SEC,
    "become villagers should preserve its last trigger timestamp between firings"
  );
  const expectedMidCadenceRemainingSec =
    BECOME_VILLAGERS_CADENCE_SEC - becomeVillagersMidCadenceElapsedSec;
  assert.equal(
    midRuntime.activeRemainingSec,
    expectedMidCadenceRemainingSec,
    "become villagers should count down to its next cadence even without a reservation"
  );
  assertClose(
    midRuntime.activeProgressRemaining,
    expectedMidCadenceRemainingSec / BECOME_VILLAGERS_CADENCE_SEC,
    0.0001,
    "become villagers should expose cadence progress for the drain fill effect"
  );
  assert.equal(
    midRuntime.previewAmount,
    Math.floor(summarizeClass(state, "stranger").population.total / 10),
    "become villagers should keep previewing conversion from the current stranger population between triggers"
  );
  assert.equal(
    midRuntime.lastAmount,
    expectedFirstConversion,
    "become villagers should keep the last completed conversion amount until the next trigger"
  );
}

function runRaiseAsVillagersAssertions() {
  const state = createInitialState(
    buildSettlementSetup({
      villagerAdults: 2,
      villagerYouth: 1,
      strangerAdults: 0,
      strangerYouth: 3,
      villagerPracticeSlots: [null, null, null, null, null],
      strangerPracticeSlots: [{ defId: "raiseAsVillagers" }, null, null, null, null],
    }),
    123
  );

  advanceToSecond(state, 1);
  assert.equal(
    summarizeClass(state, "villager").population.youth,
    4,
    "raise as villagers should move stranger youth into villager youth"
  );
  assert.equal(
    summarizeClass(state, "stranger").population.youth,
    0,
    "raise as villagers should remove youth from the stranger class"
  );
}

function runEmergencyFoodReserveAssertions() {
  const state = createInitialState(
    buildSettlementSetup({
      stockpiles: {
        food: 8,
        redResource: 0,
        greenResource: 0,
        blueResource: 0,
        blackResource: 0,
      },
      villagerAdults: 10,
      villagerPracticeSlots: [{ defId: "emergencyFoodReserve" }, null, null, null, null],
      strangerPracticeSlots: [null, null, null, null, null],
      structures: [null, { defId: "granary" }, { defId: "mudHouses" }, null, null, null],
    }),
    123
  );

  advanceToSecond(state, afterSettlementSeasons(1));
  assertClose(
    getSettlementStockpile(state, "food"),
    0.8,
    0.0001,
    "emergency food reserve should preserve 10 percent when the population cannot be fully fed"
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
  advanceToSecond(live, SERIALIZATION_REPLAY_SNAPSHOT_SEC);

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
  const rebuilt = rebuildStateAtSecond(timeline, SERIALIZATION_REPLAY_SNAPSHOT_SEC);
  assert.equal(rebuilt?.ok, true, `rebuildStateAtSecond failed: ${JSON.stringify(rebuilt)}`);
  assert.deepEqual(
    summarizeState(rebuilt.state),
    summarizeState(live),
    "replay rebuild should match live class demographic simulation"
  );

  const councilLive = createInitialState("devPlaytesting01", 123);
  advanceToSecond(councilLive, SERIALIZATION_REPLAY_SNAPSHOT_SEC);
  const councilSerialized = serializeGameState(councilLive);
  const councilRestored = deserializeGameState(councilSerialized);
  assert.deepEqual(
    summarizeState(councilRestored),
    summarizeState(councilLive),
    "serialize/deserialize should preserve elder council state and resolved boards"
  );

  const councilTimeline = createTimelineFromInitialState(createInitialState("devPlaytesting01", 123));
  const councilRebuilt = rebuildStateAtSecond(
    councilTimeline,
    SERIALIZATION_REPLAY_SNAPSHOT_SEC
  );
  assert.equal(
    councilRebuilt?.ok,
    true,
    `rebuildStateAtSecond failed: ${JSON.stringify(councilRebuilt)}`
  );
  assert.deepEqual(
    summarizeState(councilRebuilt.state),
    summarizeState(councilLive),
    "replay rebuild should preserve elder council state and resolved boards"
  );
}

function runVassalLineageAssertions() {
  const initialA = createInitialState("devPlaytesting01", 123);
  const initialB = createInitialState("devPlaytesting01", 123);

  assert.deepEqual(
    summarizePendingVassalSelection(initialA),
    summarizePendingVassalSelection(initialB),
    "seeded vassal candidate pools should be deterministic for a given seed"
  );

  const poolSummary = summarizePendingVassalSelection(initialA);
  assert.equal(poolSummary.candidates.length, 3, "the initial vassal chooser should offer exactly three candidates");
  for (const candidate of poolSummary.candidates) {
    assert.ok(
      candidate.initialAgeYears >= 6 && candidate.initialAgeYears <= 12,
      "vassal candidates should start between ages 6 and 12"
    );
    assert.ok(
      candidate.professionAgeYears >= 14 && candidate.professionAgeYears <= 18,
      "vassal profession events should be scheduled between ages 14 and 18"
    );
    assert.ok(
      candidate.traitAgeYears >= 26 && candidate.traitAgeYears <= 30,
      "vassal trait events should be scheduled between ages 26 and 30"
    );
    if (candidate.sourceClassId === "stranger") {
      assert.ok(
        candidate.eventKinds.includes("classChanged:18"),
        "stranger vassals should pre-schedule their villager transition at age 18"
      );
    }
    for (const classId of ["villager", "stranger"]) {
      const agenda = Array.isArray(candidate?.agendaByClass?.[classId])
        ? candidate.agendaByClass[classId]
        : [];
      const eligiblePracticeIds = Object.values(settlementPracticeDefs)
        .filter((def) => Array.isArray(def?.orderEligibleClassIds) && def.orderEligibleClassIds.includes(classId))
        .map((def) => def.id);
      const expectedMinLength = Math.min(
        classId === "villager" ? 5 : 5,
        eligiblePracticeIds.length
      );
      assert.equal(
        agenda.length,
        expectedMinLength,
        `vassal agendas should be filled out for the ${classId} class`
      );
      const minorDevelopmentIds = Object.values(settlementPracticeDefs)
        .filter(
          (def) =>
            def?.orderDevelopmentTier === "minor" &&
            Array.isArray(def?.orderEligibleClassIds) &&
            def.orderEligibleClassIds.includes(classId)
        )
        .map((def) => def.id);
      if (minorDevelopmentIds.length > 0) {
        assert.ok(
          agenda.some((defId) => minorDevelopmentIds.includes(defId)),
          `vassal agendas should always include a minor development for ${classId}`
        );
      }
    }
  }

  const live = createInitialState("devPlaytesting01", 123);
  live.paused = true;
  const pendingSelection = getSettlementPendingVassalSelection(live);
  const candidate =
    (Array.isArray(pendingSelection?.candidates) ? pendingSelection.candidates : [])
      .filter((entry) =>
        (Array.isArray(entry?.lifeEvents) ? entry.lifeEvents : []).some((event) => event?.kind === "becameElder")
      )
      .sort((a, b) => Math.floor(a?.deathSec ?? 0) - Math.floor(b?.deathSec ?? 0))[0] ?? null;

  assert.ok(candidate, "expected at least one seeded candidate to survive to elder age for the lineage test");

  const selectAction = {
    kind: ActionKinds.SETTLEMENT_SELECT_VASSAL_CANDIDATE,
    payload: {
      vassalId: candidate.vassalId,
      tSec: live.tSec,
    },
  };
  const selectResult = applyAction(live, selectAction);
  assert.equal(selectResult?.ok, true, `vassal selection should succeed: ${JSON.stringify(selectResult)}`);
  assert.equal(
    getSettlementPendingVassalSelection(live),
    null,
    "selecting a vassal should close the pending chooser pool"
  );

  const selectedVassal = summarizeCurrentVassal(live);
  const elderEvent = selectedVassal?.lifeEvents.find((event) => event.kind === "becameElder") ?? null;
  const deathEvent = selectedVassal?.lifeEvents.find((event) => event.kind === "died") ?? null;
  assert.ok(elderEvent, "selected vassal should include an elder milestone event");
  assert.ok(deathEvent, "selected vassal should include a death event");
  assert.equal(elderEvent.ageYears, 45, "vassals should become elders at age 45");
  assert.equal(deathEvent?.causeOfDeath, "oldAge", "scheduled vassal death events should record the cause of death");
  assert.equal(deathEvent?.text, "Died of old age", "scheduled vassal death events should name the death cause in the log text");

  live.paused = false;
  advanceToSecond(live, elderEvent.tSec);
  const elderState = summarizeCurrentVassal(live);
  const elderCouncilMembers = summarizeCouncilMembers(live);
  const elderCouncilMember = elderCouncilMembers.find(
    (member) => member.sourceVassalId === elderState?.vassalId
  );

  assert.equal(elderState?.isElder, true, "selected vassals should become elders when their milestone resolves");
  assert.ok(elderCouncilMember, "elder vassals should be mirrored into the authoritative elder council");
  assert.equal(
    elderCouncilMember?.modifierId,
    elderState?.traitId,
    "vassal-backed elder council members should reuse the vassal trait as their modifier"
  );

  const timelineBase = createInitialState("devPlaytesting01", 123);
  timelineBase.paused = true;
  const timeline = createTimelineFromInitialState(timelineBase);
  const appendResult = appendActionAtCursor(timeline, selectAction, timelineBase);
  assert.equal(appendResult?.ok, true, `failed to record vassal selection action: ${JSON.stringify(appendResult)}`);

  const elderRebuilt = rebuildStateAtSecond(timeline, elderEvent.tSec);
  assert.equal(
    elderRebuilt?.ok,
    true,
    `rebuildStateAtSecond failed for vassal elder milestone: ${JSON.stringify(elderRebuilt)}`
  );
  assert.deepEqual(
    summarizeCurrentVassal(elderRebuilt.state),
    summarizeCurrentVassal(live),
    "replay rebuild should reproduce the same vassal state at elder age"
  );
  assert.deepEqual(
    summarizeCouncilMembers(elderRebuilt.state),
    summarizeCouncilMembers(live),
    "replay rebuild should reproduce the same council state for vassal elders"
  );

  advanceToSecond(live, deathEvent.tSec + 1);
  const deadState = summarizeCurrentVassal(live);
  assert.equal(deadState?.isDead, true, "selected vassals should die on their scheduled death second");
  assert.equal(
    summarizeCouncilMembers(live).some((member) => member.sourceVassalId === deadState?.vassalId),
    false,
    "dead vassals should be removed from the authoritative elder council"
  );
  if (deadState?.sourceClassId === "stranger" && deadState?.deathYear >= deadState?.birthYear) {
    assert.equal(
      deadState.currentClassId,
      "villager",
      "stranger vassals should remain villagers after their age-18 class transition"
    );
  }

  const restored = deserializeGameState(serializeGameState(live));
  assert.deepEqual(
    summarizeCurrentVassal(restored),
    summarizeCurrentVassal(live),
    "serialize/deserialize should preserve current vassal lineage state"
  );
  assert.deepEqual(
    summarizeCouncilMembers(restored),
    summarizeCouncilMembers(live),
    "serialize/deserialize should preserve vassal-backed council membership state"
  );

  const deathRebuilt = rebuildStateAtSecond(timeline, deathEvent.tSec + 1);
  assert.equal(
    deathRebuilt?.ok,
    true,
    `rebuildStateAtSecond failed for vassal death: ${JSON.stringify(deathRebuilt)}`
  );
  assert.deepEqual(
    summarizeCurrentVassal(deathRebuilt.state),
    summarizeCurrentVassal(live),
    "replay rebuild should reproduce the same vassal state after death"
  );
  assert.deepEqual(
    summarizeCouncilMembers(deathRebuilt.state),
    summarizeCouncilMembers(live),
    "replay rebuild should reproduce council removal for dead vassals"
  );
}

function runVassalMajorDevelopmentAgendaAssertions() {
  assert.equal(
    settlementPracticeDefs.upgradeFoodStorage?.orderDevelopmentTier,
    "major",
    "upgrade food storage should be a major development"
  );
  assert.equal(
    settlementPracticeDefs.upgradeHousing?.orderDevelopmentTier,
    "major",
    "upgrade housing should be a major development"
  );

  const baseState = createInitialState("devPlaytesting01", 123);
  const classIds = getSettlementClassIds(baseState);
  const boardByClass = {};
  for (const classId of classIds) {
    boardByClass[classId] = getSettlementPracticeSlotsByClass(baseState, classId)
      .map((slot) => slot?.card?.defId ?? null)
      .filter((defId) => typeof defId === "string" && defId.length > 0);
  }
  const getSlotCount = (classId) => getSettlementPracticeSlotsByClass(baseState, classId).length;
  const orderDef = {
    ...settlementOrderDefs.elderCouncil,
    agendaMutation: {
      ...settlementOrderDefs.elderCouncil?.agendaMutation,
      reorderChance: 0,
      developmentChance: 0,
    },
  };
  const majorVillagerIds = ["upgradeFoodStorage", "upgradeHousing"];

  const forcedMajorState = {
    rngNextFloatCalls: 0,
    rngNextIntCalls: 0,
    rngNextFloat() {
      this.rngNextFloatCalls += 1;
      return 0;
    },
    rngNextInt(min) {
      this.rngNextIntCalls += 1;
      return Math.floor(min ?? 0);
    },
  };
  const forcedMajorAgenda = buildGeneratedAgendaByClass(
    forcedMajorState,
    orderDef,
    ["villager"],
    boardByClass,
    getSlotCount,
    {
      fillToLimit: true,
      requireMinorDevelopment: true,
      majorDevelopmentChance: 1,
    }
  ).villager;
  assert.ok(
    majorVillagerIds.includes(forcedMajorAgenda[0]),
    "forced vassal agenda generation should put a major villager development first"
  );
  assert.ok(
    forcedMajorAgenda.some((defId) => majorVillagerIds.includes(defId)),
    "forced vassal agenda generation should be able to include a major villager development"
  );
  assert.ok(
    forcedMajorAgenda.some(
      (defId) => settlementPracticeDefs?.[defId]?.orderDevelopmentTier === "minor"
    ),
    "forcing a major development should still preserve a minor development on the vassal agenda"
  );

  const blockedMajorState = {
    rngNextFloatCalls: 0,
    rngNextFloat() {
      this.rngNextFloatCalls += 1;
      return 0.99;
    },
    rngNextInt(min) {
      return Math.floor(min ?? 0);
    },
  };
  const blockedMajorAgenda = buildGeneratedAgendaByClass(
    blockedMajorState,
    orderDef,
    ["villager"],
    boardByClass,
    getSlotCount,
    {
      fillToLimit: true,
      requireMinorDevelopment: true,
      majorDevelopmentChance: SETTLEMENT_VASSAL_MAJOR_DEVELOPMENT_CHANCE,
    }
  ).villager;
  assert.equal(
    blockedMajorAgenda.some((defId) => majorVillagerIds.includes(defId)),
    false,
    "vassal agenda generation should exclude major villager developments when the configured roll misses"
  );

  const guaranteedCandidateState = createInitialState("devPlaytesting01", 123);
  const guaranteedBoardByClass = {};
  for (const classId of getSettlementClassIds(guaranteedCandidateState)) {
    guaranteedBoardByClass[classId] = getSettlementPracticeSlotsByClass(
      guaranteedCandidateState,
      classId
    )
      .map((slot) => slot?.card?.defId ?? null)
      .filter((defId) => typeof defId === "string" && defId.length > 0);
  }
  const guaranteedAgendas = new Array(3).fill(null).map(() =>
    buildGeneratedAgendaByClass(
      guaranteedCandidateState,
      orderDef,
      ["villager"],
      guaranteedBoardByClass,
      getSlotCount,
      {
        fillToLimit: true,
        requireMinorDevelopment: true,
        majorDevelopmentChance: 1,
      }
    ).villager
  );
  assert.equal(
    guaranteedAgendas.every((agenda) => majorVillagerIds.includes(agenda[0])),
    true,
    "setting the per-vassal major development chance to 1 should put a major first on every generated vassal agenda"
  );
}

function run() {
  console.log("start runInitAssertions");
  runInitAssertions();
  console.log("start runMealPriorityAssertions");
  runMealPriorityAssertions();
  console.log("start runHappinessAssertions");
  runHappinessAssertions();
  console.log("start runHousingPressureAssertions");
  runHousingPressureAssertions();
  console.log("start runMirroringAssertions");
  runMirroringAssertions();
  console.log("start runElderCouncilAssertions");
  runElderCouncilAssertions();
  console.log("start runOpenToStrangersAssertions");
  runOpenToStrangersAssertions();
  console.log("start runBecomeVillagersAssertions");
  runBecomeVillagersAssertions();
  console.log("start runRaiseAsVillagersAssertions");
  runRaiseAsVillagersAssertions();
  console.log("start runEmergencyFoodReserveAssertions");
  runEmergencyFoodReserveAssertions();
  console.log("start runSerializationReplayAssertions");
  runSerializationReplayAssertions();
  console.log("start runVassalLineageAssertions");
  runVassalLineageAssertions();
  console.log("start runVassalMajorDevelopmentAgendaAssertions");
  runVassalMajorDevelopmentAgendaAssertions();
  console.log("[test] devPlaytesting01 settlement demographics passed");
}

run();

