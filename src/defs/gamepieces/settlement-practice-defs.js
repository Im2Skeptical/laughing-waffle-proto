import {
  MOON_CYCLE_SEC,
  PRACTICE_OPEN_TO_STRANGERS_ATTRACTION_PER_VACANCY_PER_YEAR,
  PRACTICE_REST_PASSIVE_CADENCE_MOONS,
  SEASON_DURATION_SEC,
} from "../gamesettings/gamerules-defs.js";
import { ensureTooltipCardUi } from "../tooltip-ui-utils.js";

export const settlementPracticeDefs = {
  floodRites: {
    id: "floodRites",
    kind: "settlementPractice",
    practiceMode: "active",
    name: "Flood Rites",
    ui: {
      title: "Flood Rites",
      lines: [
        "Autumn start",
        "Per free population consume 1 food",
        "Generate 1 redResource",
        "Improve mood by 1 step",
        "Reserve population for 15s",
      ],
      description: "River rites that turn stored food into ritual labor and redResource.",
    },
    timing: {
      onSeasonChange: true,
    },
    requires: {
      season: ["autumn"],
      freePopulationAtLeast: 1,
      stockpileAtLeast: {
        food: 1,
      },
      hasSettlementCapability: "practice.floodRites.enabled",
    },
    amount: {
      mode: "min",
      values: [
        { kind: "freePopulation" },
        { kind: "stockpile", key: "food" },
      ],
    },
    effects: [
      {
        op: "ReservePopulation",
        target: { ref: "hubCore" },
        amountVar: "practiceAmount",
        releaseOffsetSec: 15,
        sourceId: "floodRites",
        label: "Flood Rites",
      },
      {
        op: "AdjustSystemState",
        target: { ref: "hubCore" },
        system: "stockpiles",
        key: "food",
        amountVar: "practiceAmount",
        amountScale: -1,
      },
      {
        op: "AdjustSystemState",
        target: { ref: "hubCore" },
        system: "stockpiles",
        key: "redResource",
        amountVar: "practiceAmount",
        amountScale: 1,
      },
      {
        op: "ShiftPopulationClassHappiness",
        target: { ref: "hubCore" },
        amount: 1,
      },
    ],
  },
  riverRecessionFarming: {
    id: "riverRecessionFarming",
    kind: "settlementPractice",
    practiceMode: "active",
    name: "River Recession Farming",
    ui: {
      title: "River Recession Farming",
      lines: [
        "Consume 1 red + 1 green per free population",
        "Generate 20 food on completion",
        "Reserve population for 30s",
      ],
      description: "Seasonal labor that turns ritual and silt stores into food.",
    },
    timing: {
      cadenceSec: 1,
    },
    requires: {
      freePopulationAtLeast: 1,
      stockpileAtLeast: {
        redResource: 1,
        greenResource: 1,
      },
    },
    amount: {
      mode: "min",
      values: [
        { kind: "freePopulation" },
        { kind: "stockpile", key: "redResource" },
        { kind: "stockpile", key: "greenResource" },
      ],
    },
    effects: [
      {
        op: "ReservePopulation",
        target: { ref: "hubCore" },
        amountVar: "practiceAmount",
        releaseOffsetSec: 30,
        sourceId: "riverRecessionFarming",
        label: "River Recession Farming",
        onReleaseEffects: [
          {
            op: "AdjustSystemState",
            target: { ref: "hubCore" },
            system: "stockpiles",
            key: "food",
            amountVar: "practiceAmount",
            amountScale: 20,
          },
        ],
      },
      {
        op: "AdjustSystemState",
        target: { ref: "hubCore" },
        system: "stockpiles",
        key: "redResource",
        amountVar: "practiceAmount",
        amountScale: -1,
      },
      {
        op: "AdjustSystemState",
        target: { ref: "hubCore" },
        system: "stockpiles",
        key: "greenResource",
        amountVar: "practiceAmount",
        amountScale: -1,
      },
    ],
  },
  rest: {
    id: "rest",
    kind: "settlementPractice",
    practiceMode: "passive",
    name: "Rest",
    ui: {
      title: "Rest",
      lines: [
        `Every ${Math.max(1, Math.floor(PRACTICE_REST_PASSIVE_CADENCE_MOONS))} moons`,
        "Generate 1 redResource",
        "per 5 total population",
      ],
      description: "A low steady pulse of ritual momentum that continues regardless of which active practice is working.",
    },
    timing: {
      cadenceSec:
        MOON_CYCLE_SEC * Math.max(1, Math.floor(PRACTICE_REST_PASSIVE_CADENCE_MOONS)),
    },
    amount: {
      mode: "min",
      values: [{ kind: "totalPopulation", divideBy: 5 }],
    },
    effects: [
      {
        op: "AdjustSystemState",
        target: { ref: "hubCore" },
        system: "stockpiles",
        key: "redResource",
        amountVar: "practiceAmount",
      },
    ],
  },
  asTheRomans: {
    id: "asTheRomans",
    kind: "settlementPractice",
    practiceMode: "active",
    name: "As the Romans",
    ui: {
      title: "As the Romans",
      lines: [
        "Mirror villager active practice",
        "Use stranger population",
        "and shared stockpiles",
      ],
      description:
        "Adopt the current villager active custom, but execute it through the stranger demographic.",
    },
    mirrorPracticeFromClassId: "villager",
  },
  becomeVillagers: {
    id: "becomeVillagers",
    kind: "settlementPractice",
    practiceMode: "active",
    name: "Become Villagers",
    ui: {
      title: "Become Villagers",
      lines: [
        "Every 2 years",
        "Reserve 10% of strangers",
        "Convert them into villagers",
      ],
      description:
        "A slow assimilation practice that steadily turns settled strangers into villagers.",
    },
    timing: {
      cadenceSec: SEASON_DURATION_SEC * 4 * 2,
    },
    requires: {
      freePopulationAtLeast: 1,
    },
    amount: {
      mode: "min",
      values: [
        { kind: "freePopulation" },
        { kind: "totalPopulation", divideBy: 10, minimum: 1 },
      ],
    },
    effects: [
      {
        op: "ReservePopulation",
        target: { ref: "hubCore" },
        amountVar: "practiceAmount",
        releaseOffsetSec: SEASON_DURATION_SEC * 4 * 2,
        label: "Become Villagers",
        onReleaseEffects: [
          {
            op: "TransferPopulationClass",
            target: { ref: "hubCore" },
            amountVar: "practiceAmount",
            toPopulationClassId: "villager",
          },
        ],
      },
    ],
  },
  openToStrangers: {
    id: "openToStrangers",
    kind: "settlementPractice",
    practiceMode: "passive",
    name: "Open to Strangers",
    ui: {
      title: "Open to Strangers",
      lines: [
        "Passive",
        "Requires Diamond faith",
        `Attract ${PRACTICE_OPEN_TO_STRANGERS_ATTRACTION_PER_VACANCY_PER_YEAR} population`,
        "per empty housing slot each year",
      ],
      description: "A standing custom of welcome that slowly draws migrants into empty homes.",
    },
    requires: {
      faithTierAtLeast: "diamond",
    },
    passiveBonuses: {
      attractionPerVacancyPerYear:
        PRACTICE_OPEN_TO_STRANGERS_ATTRACTION_PER_VACANCY_PER_YEAR,
    },
    passiveTargetPopulationClassId: "stranger",
  },
};

ensureTooltipCardUi(settlementPracticeDefs);
