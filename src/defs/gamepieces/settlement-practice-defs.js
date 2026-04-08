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
    orderEligibleClassIds: ["villager"],
    orderDevelopmentTier: "base",
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
        releaseOffsetSec: 3,
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
    orderEligibleClassIds: ["villager"],
    orderDevelopmentTier: "base",
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
        releaseOffsetSec: 6,
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
    orderEligibleClassIds: ["villager"],
    orderDevelopmentTier: "base",
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
    orderEligibleClassIds: ["stranger"],
    orderDevelopmentTier: "base",
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
    orderEligibleClassIds: ["stranger"],
    orderDevelopmentTier: "base",
    name: "Become Villagers",
    ui: {
      title: "Become Villagers",
      lines: [
        "Every 2 years",
        "Convert 10% of current strangers",
        "No reservation required",
      ],
      description:
        "A slow assimilation practice that converts a slice of the current stranger population on each cycle.",
    },
    timing: {
      cadenceSec: SEASON_DURATION_SEC * 4 * 2,
    },
    amount: {
      mode: "max",
      values: [{ kind: "totalPopulation", divideBy: 10, minimum: 1 }],
    },
    effects: [
      {
        op: "TransferPopulationClass",
        target: { ref: "hubCore" },
        amountVar: "practiceAmount",
        toPopulationClassId: "villager",
      },
    ],
  },
  openToStrangers: {
    id: "openToStrangers",
    kind: "settlementPractice",
    practiceMode: "passive",
    orderEligibleClassIds: ["villager"],
    orderDevelopmentTier: "base",
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
  raiseAsVillagers: {
    id: "raiseAsVillagers",
    kind: "settlementPractice",
    practiceMode: "passive",
    orderEligibleClassIds: ["stranger"],
    orderDevelopmentTier: "minor",
    name: "Raise as Villagers",
    ui: {
      title: "Raise as Villagers",
      lines: [
        "Passive",
        "Stranger children",
        "become villager children",
      ],
      description:
        "Children raised under village custom join the villager class before adulthood.",
    },
    timing: {
      cadenceSec: 1,
    },
    amount: {
      mode: "max",
      values: [{ kind: "youthPopulation" }],
    },
    effects: [
      {
        op: "TransferPopulationClass",
        target: { ref: "hubCore" },
        amountVar: "practiceAmount",
        fromPopulationClassId: "stranger",
        toPopulationClassId: "villager",
        populationPool: "youth",
      },
    ],
  },
  emergencyFoodReserve: {
    id: "emergencyFoodReserve",
    kind: "settlementPractice",
    practiceMode: "passive",
    orderEligibleClassIds: ["villager"],
    orderDevelopmentTier: "minor",
    name: "Emergency Food Reserve",
    ui: {
      title: "Emergency Food Reserve",
      lines: [
        "Passive",
        "If food is short,",
        "keep back 10%",
      ],
      description:
        "Maintain a protected emergency reserve instead of spending the last stores in a bad season.",
    },
    passiveBonuses: {
      emergencyFoodReserveRatio: 0.1,
    },
  },
  upgradeFoodStorage: {
    id: "upgradeFoodStorage",
    kind: "settlementPractice",
    practiceMode: "active",
    orderEligibleClassIds: ["villager"],
    orderDevelopmentTier: "major",
    name: "Upgrade Food Storage",
    upgradeTargetStructureDefId: "granary",
    ui: {
      title: "Upgrade Food Storage",
      lines: [
        "Consume 5 red + 1 blue",
        "per committed citizen",
        "Commit citizens for 1 year",
        "Progress counts on release",
      ],
      description: "Long-term labor that upgrades the granary tier over repeated yearly commitments.",
    },
    requires: {
      freePopulationAtLeast: 1,
      stockpileAtLeast: {
        redResource: 5,
        blueResource: 1,
      },
      settlementStructureDefId: "granary",
      settlementStructureTierBelow: "diamond",
    },
    amount: {
      mode: "min",
      values: [
        { kind: "freePopulation" },
        {
          kind: "settlementStructureUpgradeCitizensRemaining",
          structureDefId: "granary",
        },
      ],
    },
    effects: [
      {
        op: "AdjustSystemState",
        target: { ref: "hubCore" },
        system: "stockpiles",
        key: "redResource",
        amountVar: "practiceAmount",
        amountScale: -5,
      },
      {
        op: "AdjustSystemState",
        target: { ref: "hubCore" },
        system: "stockpiles",
        key: "blueResource",
        amountVar: "practiceAmount",
        amountScale: -1,
      },
      {
        op: "ReservePopulation",
        target: { ref: "hubCore" },
        amountVar: "practiceAmount",
        releaseOffsetSec: SEASON_DURATION_SEC * 4,
        sourceId: "upgradeFoodStorage",
        label: "Upgrade Food Storage",
        onReleaseEffects: [
          {
            op: "AdvanceSettlementStructureUpgrade",
            target: { ref: "hubCore" },
            structureDefId: "granary",
            amountVar: "practiceAmount",
          },
        ],
      },
    ],
  },
  upgradeHousing: {
    id: "upgradeHousing",
    kind: "settlementPractice",
    practiceMode: "active",
    orderEligibleClassIds: ["villager"],
    orderDevelopmentTier: "major",
    name: "Upgrade Housing",
    upgradeTargetStructureDefId: "mudHouses",
    ui: {
      title: "Upgrade Housing",
      lines: [
        "Consume 5 red + 1 blue",
        "per committed citizen",
        "Commit citizens for 1 year",
        "Progress counts on release",
      ],
      description: "Long-term labor that upgrades mud-house capacity over repeated yearly commitments.",
    },
    requires: {
      freePopulationAtLeast: 1,
      stockpileAtLeast: {
        redResource: 5,
        blueResource: 1,
      },
      settlementStructureDefId: "mudHouses",
      settlementStructureTierBelow: "diamond",
    },
    amount: {
      mode: "min",
      values: [
        { kind: "freePopulation" },
        {
          kind: "settlementStructureUpgradeCitizensRemaining",
          structureDefId: "mudHouses",
        },
      ],
    },
    effects: [
      {
        op: "AdjustSystemState",
        target: { ref: "hubCore" },
        system: "stockpiles",
        key: "redResource",
        amountVar: "practiceAmount",
        amountScale: -5,
      },
      {
        op: "AdjustSystemState",
        target: { ref: "hubCore" },
        system: "stockpiles",
        key: "blueResource",
        amountVar: "practiceAmount",
        amountScale: -1,
      },
      {
        op: "ReservePopulation",
        target: { ref: "hubCore" },
        amountVar: "practiceAmount",
        releaseOffsetSec: SEASON_DURATION_SEC * 1,
        sourceId: "upgradeHousing",
        label: "Upgrade Housing",
        onReleaseEffects: [
          {
            op: "AdvanceSettlementStructureUpgrade",
            target: { ref: "hubCore" },
            structureDefId: "mudHouses",
            amountVar: "practiceAmount",
          },
        ],
      },
    ],
  },
};

ensureTooltipCardUi(settlementPracticeDefs);
