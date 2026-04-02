import { ensureTooltipCardUi } from "../tooltip-ui-utils.js";

export const settlementOrderDefs = {
  elderCouncil: {
    id: "elderCouncil",
    kind: "settlementOrder",
    name: "Elder Council",
    recruitmentCadenceYears: 5,
    recruitmentAdultsPerElder: 100,
    initialCouncilTemplate: [
      {
        ageYears: 61,
        modifierId: "hardworker",
        agendaByClass: {
          villager: ["floodRites", "riverRecessionFarming", "rest", "openToStrangers"],
          stranger: ["asTheRomans", "becomeVillagers"],
        },
      },
      {
        ageYears: 58,
        modifierId: "goodTeacher",
        agendaByClass: {
          villager: ["floodRites", "riverRecessionFarming", "rest", "openToStrangers"],
          stranger: ["asTheRomans", "becomeVillagers"],
        },
      },
      {
        ageYears: 54,
        modifierId: "fairTrader",
        agendaByClass: {
          villager: ["floodRites", "riverRecessionFarming", "rest", "openToStrangers"],
          stranger: ["asTheRomans", "becomeVillagers"],
        },
      },
      {
        ageYears: 49,
        modifierId: "pious",
        agendaByClass: {
          villager: ["floodRites", "riverRecessionFarming", "rest", "openToStrangers"],
          stranger: ["asTheRomans", "becomeVillagers"],
        },
      },
    ],
    prestigeModifiers: {
      hardworker: {
        id: "hardworker",
        label: "Hardworker",
        prestigeDelta: 4,
      },
      goodTeacher: {
        id: "goodTeacher",
        label: "Good Teacher",
        prestigeDelta: 3,
      },
      fairTrader: {
        id: "fairTrader",
        label: "Fair Trader",
        prestigeDelta: 2,
      },
      pious: {
        id: "pious",
        label: "Pious",
        prestigeDelta: 1,
      },
      slothful: {
        id: "slothful",
        label: "Slothful",
        prestigeDelta: -4,
      },
      philanderer: {
        id: "philanderer",
        label: "Philanderer",
        prestigeDelta: -3,
      },
      quarrelsome: {
        id: "quarrelsome",
        label: "Quarrelsome",
        prestigeDelta: -2,
      },
    },
    mortalityByAge: [
      { minAgeYears: 0, maxAgeYears: 49, yearlyChance: 0.01 },
      { minAgeYears: 50, maxAgeYears: 54, yearlyChance: 0.03 },
      { minAgeYears: 55, maxAgeYears: 59, yearlyChance: 0.08 },
      { minAgeYears: 60, maxAgeYears: 64, yearlyChance: 0.18 },
      { minAgeYears: 65, maxAgeYears: 69, yearlyChance: 0.35 },
      { minAgeYears: 70, maxAgeYears: 74, yearlyChance: 0.6 },
      { minAgeYears: 75, yearlyChance: 0.85 },
    ],
    agendaMutation: {
      reorderChance: 0.2,
      developmentChance: 0.05,
    },
    ui: {
      title: "Elder Council",
      lines: [
        "Automated elder agendas",
        "populate all class practice boards",
        "and re-order them by prestige vote",
      ],
      description:
        "The ruling council of elders maintains practice boards through prestige-weighted agendas.",
    },
  },
};

ensureTooltipCardUi(settlementOrderDefs);
