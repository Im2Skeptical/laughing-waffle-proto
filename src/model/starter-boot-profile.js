import {
  createAuthoredGamepiecesDraft,
  createAuthoredGameSettingsDraft,
} from "./game-config.js";
import { createAuthoredLifeMapLabDraft } from "./life-map-lab-draft.js";
import { createAuthoredMapLabDraft } from "./map-lab-draft.js";

const clone = (value) => JSON.parse(JSON.stringify(value));

const STARTER_REGIONS = Object.freeze([
  ["cedar-woods", "green", "frontier", false],
  ["iron-hills", "green", "frontier", false],
  ["west-levee", "red", "frontier", false],
  ["southern-savanna", "blue", "frontier", false],
  ["high-pass", "black", "frontier", false],
  ["upper-floodplain", "red", "frontier", false],
  ["river-crown", "red", "frontier", false],
  ["reed-delta", "red", "frontier", false],
  ["copper-basin", "black", "frontier", false],
  ["east-steppe", "green", "frontier", false],
  ["lake-country", "blue", "player", true],
  ["black-marsh", "red", "player", true],
  ["salt-coast", "black", "frontier", false],
  ["obsidian-ridge", "green", "frontier", false],
  ["outer-isles", "blue", "frontier", false],
]);

const STARTER_CONNECTIONS = Object.freeze([
  ["cedar-woods", "west-levee"],
  ["iron-hills", "high-pass"],
  ["west-levee", "southern-savanna"],
  ["southern-savanna", "reed-delta"],
  ["upper-floodplain", "river-crown"],
  ["copper-basin", "east-steppe"],
  ["east-steppe", "obsidian-ridge"],
  ["lake-country", "black-marsh"],
  ["black-marsh", "salt-coast"],
]);

function createStarterDetailedState(template) {
  const state = clone(template);
  state.populationByClass.villager.children = 5;
  state.populationByClass.villager.adults = 15;
  state.practiceSlots = [
    { practiceId: "forage", tier: "bronze", charge: 0, work: 0 },
    null,
    null,
    null,
    null,
  ];
  return state;
}

// This is intentionally expressed as the authored setup plus the supplied
// Starter_02 deltas, so unchanged registry defaults continue to be sourced
// from their single authoritative definitions.
export function createStarterBootProfile() {
  const mapLab = createAuthoredMapLabDraft();
  const regionById = new Map(mapLab.regions.map((region) => [region.id, region]));
  const detailedTemplate = regionById.get("lake-country").detailedState;
  mapLab.regions = STARTER_REGIONS.map(([id, colour, controller, detailed]) => ({
    id,
    colour,
    controller,
    structureCapacity: 5,
    randomizeStructureCapacity: true,
    detailedSettlementEnabled: detailed,
    detailedState: detailed ? createStarterDetailedState(detailedTemplate) : null,
  }));
  mapLab.connections = STARTER_CONNECTIONS.map(([regionAId, regionBId]) => ({
    regionAId,
    regionBId,
  }));

  const gameSettings = createAuthoredGameSettingsDraft();
  Object.assign(gameSettings.values, {
    prematureDeathChaosWeight: 0,
    externalEmigrationChaosWeight: 0,
    primordialBasePressure: 1,
    primordialGrowthFactor: 1.2,
  });

  const gamepieces = createAuthoredGamepiecesDraft();
  gamepieces.practices.forage.effects[0].scaledValue.baseAmount = 8;

  const lifeMapLab = createAuthoredLifeMapLabDraft();
  lifeMapLab.generatorConfig.weights.early.practiceReform = 3;
  lifeMapLab.generatorConfig.weights.early.publicWorks = 3;

  return {
    mapLab,
    gameSettings,
    gamepieces,
    lifeMapLab,
    vassalLab: null,
    activePage: "mapLab",
  };
}

export const STARTER_BOOT_PROFILE_NAME = "Starter_02";
