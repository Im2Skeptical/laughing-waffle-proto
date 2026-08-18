import assert from "node:assert/strict";
import { setupDefs } from "../../defs/gamesettings/scenarios-defs.js";
import { createInitialState } from "../init.js";
import {
  GAMEPIECES_DRAFT_KIND,
  GAME_SETTINGS_DRAFT_KIND,
  canonicalizeGameConfig,
  createAuthoredGameConfig,
  createAuthoredGamepiecesDraft,
  createAuthoredGameSettingsDraft,
  getGamepieceEditorGroups,
  parseDebugDraftJson,
  serializeDebugDraft,
  setAtPath,
  validateGameConfig,
  validateGamepiecesDraft,
  validateGameSettingsDraft,
} from "../game-config.js";
import {
  assignDetailedSettlementWorkers,
  buildDetailedVassalSelectionPool,
  getDetailedSettlement,
  getPopulationSummary,
  getStoredFoodCapacity,
  replaceDetailedVassalSelectionCandidate,
  stepDetailedSettlementsSecond,
} from "../detailed-settlements.js";
import { serializeGameState } from "../state.js";
import {
  appendActionAtCursor,
  createTimelineFromInitialState,
  rebuildStateAtSecond,
} from "../timeline/index.js";
import { createVassalDebugPresetController } from "../../controllers/vassal-debug-preset-controller.js";
import { createMapLabController } from "../../controllers/map-lab-controller.js";
import { createDebugConfigurationController } from "../../controllers/debug-configuration-controller.js";
import { createDebugProfileController } from "../../controllers/debug-profile-controller.js";

const clone = (value) => JSON.parse(JSON.stringify(value));

const authoredConfig = createAuthoredGameConfig();
assert.equal(authoredConfig.schemaVersion, 7);
assert.equal(authoredConfig.settings.schemaVersion, 7);
assert.equal(authoredConfig.gamepieces.schemaVersion, 7);
assert.equal(validateGameConfig(authoredConfig).ok, true);
assert.equal(validateGameSettingsDraft(createAuthoredGameSettingsDraft()).ok, true);
assert.equal(validateGamepiecesDraft(createAuthoredGamepiecesDraft()).ok, true);
assert.equal(
  parseDebugDraftJson(
    serializeDebugDraft(authoredConfig.settings, GAME_SETTINGS_DRAFT_KIND),
    GAME_SETTINGS_DRAFT_KIND
  ).ok,
  true
);
assert.equal(
  authoredConfig.gamepieces.practices.preserve.connectedAdministrationReach,
  false,
  "Preservation leaves Administration adjacent-only by default"
);
assert.equal(authoredConfig.gamepieces.practices.forage.workerCapacity, 1);
assert.equal(
  authoredConfig.gamepieces.practices.forage.effects[0].scaledValue.baseAmount,
  5
);
assert.equal(authoredConfig.settings.values.primordialBasePressure, 2);
assert.equal(authoredConfig.settings.values.primordialGrowthFactor, 1.03);
assert.equal(authoredConfig.settings.values.primordialGrowthCadenceYears, 12);
assert.deepEqual(
  getGamepieceEditorGroups(authoredConfig.gamepieces)
    .flatMap((group) => group.fields)
    .filter((field) => field.type === "boolean")
    .map((field) => field.path.join(".")),
  ["practices.preserve.connectedAdministrationReach"],
  "only explicitly declared boolean gamepiece fields appear in the editor"
);
const enabledReachGamepieces = setAtPath(
  authoredConfig.gamepieces,
  ["practices", "preserve", "connectedAdministrationReach"],
  true
);
assert.equal(validateGamepiecesDraft(enabledReachGamepieces).ok, true);
assert.equal(
  canonicalizeGameConfig({
    settings: authoredConfig.settings,
    gamepieces: enabledReachGamepieces,
  }).gamepieces.practices.preserve.connectedAdministrationReach,
  true,
  "boolean gamepiece controls survive canonicalization"
);
const invalidBooleanGamepieces = clone(enabledReachGamepieces);
invalidBooleanGamepieces.practices.preserve.connectedAdministrationReach = 0;
assert.equal(
  validateGamepiecesDraft(invalidBooleanGamepieces).ok,
  false,
  "boolean gamepiece controls reject numeric substitutes"
);
assert.equal(validateGamepiecesDraft({
  ...createAuthoredGamepiecesDraft(),
  schemaVersion: 1,
}).ok, false, "schema-v1 Gamepieces drafts are rejected after the clean cut");
assert.equal(validateGameSettingsDraft({
  ...createAuthoredGameSettingsDraft(),
  schemaVersion: 6,
}).ok, false, "schema-v6 Game Settings drafts are rejected after the Primordial cut");
assert.equal(
  parseDebugDraftJson(
    serializeDebugDraft(authoredConfig.gamepieces, GAMEPIECES_DRAFT_KIND),
    GAMEPIECES_DRAFT_KIND
  ).ok,
  true
);

let settings = setAtPath(
  authoredConfig.settings,
  ["values", "populationPerToken"],
  20
);
settings = setAtPath(settings, ["values", "childMealConsumption"], 1);
settings = setAtPath(settings, ["values", "adultMealConsumption"], 2);
settings = setAtPath(settings, ["values", "elderMealConsumption"], 0);
let gamepieces = setAtPath(
  authoredConfig.gamepieces,
  ["structures", "granary", "capacityPerCountSquared"],
  125
);
gamepieces = setAtPath(
  gamepieces,
  ["practices", "cultivate", "effects", 0, "scaledValue", "baseAmount"],
  15
);
const setup = clone(setupDefs.devPlaytesting01);
setup.gameConfig = canonicalizeGameConfig({ settings, gamepieces });
const configured = createInitialState(setup, 901);
assert.equal(getStoredFoodCapacity(configured, "cedar-woods"), 125);
assert.deepEqual(
  assignDetailedSettlementWorkers(configured, "river-crown")
    .map((entry) => entry.effectiveWorkers),
  [1, 0, 0, 0, 0]
);
assert.equal(
  getPopulationSummary(configured, "cedar-woods").mealDemand,
  60,
  "meal demand uses the state-scoped class consumption rates"
);

const cultivateSetup = clone(setupDefs.devPlaytesting01);
cultivateSetup.gameConfig = canonicalizeGameConfig({
  settings: authoredConfig.settings,
  gamepieces,
});
const cultivate = createInitialState(cultivateSetup, 902);
cultivate.currentSeasonIndex = 1;
cultivate._seasonChanged = true;
stepDetailedSettlementsSecond(cultivate, 8);
assert.equal(
  getDetailedSettlement(cultivate, "cedar-woods").storedFood,
  87,
  "Cultivate uses the state-scoped effect before the same Food phase meal"
);
assert.equal(getDetailedSettlement(cultivate, "cedar-woods").looseFood, 0);
assert.equal(
  serializeGameState(configured).gameConfig.gamepieces.structures.granary
    .capacityPerCountSquared,
  125
);

const cheatState = createInitialState("devPlaytesting01", 903);
const seedBefore = cheatState.rng.seed;
const selectionPool = buildDetailedVassalSelectionPool(cheatState);
const cheatSpec = {
  targetRegionId: "river-crown",
  initialAge: 20,
  deathAge: 60,
  traitId: "pious",
  traitPrestigeModifier: 9,
  professionId: "scribe",
  interventionPracticeIds: [
    "buildGranary",
    "buildMudHouses",
    "vassalDummyPractice01",
  ],
  resistanceSnapshot: 29,
  requiredPrestige: [30, 40, 50],
};
const replacementResult = replaceDetailedVassalSelectionCandidate(
  cheatState,
  selectionPool,
  0,
  cheatSpec
);
assert.equal(replacementResult.ok, true);
assert.equal(cheatState.rng.seed, seedBefore, "debug candidate replacement consumes no RNG");
assert.deepEqual(
  replacementResult.pool.candidates[0].interventions
    .map((entry) => entry.requiredPrestige),
  [30, 40, 50]
);
assert.deepEqual(
  replacementResult.pool.candidates[0].interventions.map((entry) => entry.slotIndex),
  [3, 4, 4],
  "repeated debug practices reserve successive practice slots"
);

const structureResult = replaceDetailedVassalSelectionCandidate(
  cheatState,
  selectionPool,
  1,
  {
    ...cheatSpec,
    targetRegionId: "upper-floodplain",
    interventions: [
      { kind: "structure", structureId: "granary" },
      { kind: "structure", structureId: "mudHouses" },
      { kind: "practice", practiceId: "exchange" },
    ],
  }
);
assert.equal(structureResult.ok, true);
assert.deepEqual(
  structureResult.pool.candidates[1].interventions.slice(0, 2).map((entry) => entry.slotIndex),
  [3, 4],
  "repeated debug structures reserve successive empty structure slots"
);

cheatState.world.connections = cheatState.world.connections.filter((entry) => {
  const ids = [entry.regionAId, entry.regionBId];
  return !(ids.includes("upper-floodplain")
    && (ids.includes("west-levee") || ids.includes("river-crown")));
});
const connectionResult = replaceDetailedVassalSelectionCandidate(
  cheatState,
  selectionPool,
  2,
  {
    ...cheatSpec,
    targetRegionId: "upper-floodplain",
    interventions: [
      { kind: "connection", mode: "add" },
      { kind: "connection", mode: "add" },
      { kind: "practice", practiceId: "exchange" },
    ],
  }
);
assert.equal(connectionResult.ok, true);
assert.notEqual(
  `${connectionResult.pool.candidates[2].interventions[0].regionAId}|${connectionResult.pool.candidates[2].interventions[0].regionBId}`,
  `${connectionResult.pool.candidates[2].interventions[1].regionAId}|${connectionResult.pool.candidates[2].interventions[1].regionBId}`,
  "repeated debug connections reserve different eligible edges"
);

const replayBase = createInitialState("devPlaytesting01", 903);
const timeline = createTimelineFromInitialState(replayBase);
appendActionAtCursor(timeline, {
  kind: "settlementSelectVassal",
  tSec: 0,
  payload: {
    candidateIndex: 0,
    expectedPoolHash: replacementResult.pool.expectedPoolHash,
    rerollIndex: replacementResult.pool.rerollIndex,
    candidateOverride: replacementResult.pool.candidates[0],
  },
}, replayBase);
const rebuiltA = rebuildStateAtSecond(timeline, 64);
const rebuiltB = rebuildStateAtSecond(timeline, 64);
assert.equal(rebuiltA.ok, true);
assert.deepEqual(serializeGameState(rebuiltA.state), serializeGameState(rebuiltB.state));
assert.equal(
  rebuiltA.state.civilization.vassalLineage.selectedVassals[0].debugInjected,
  true
);

const storage = new Map();
const previousStorage = globalThis.localStorage;
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: (key) => storage.delete(key),
};
try {
  const presetController = createVassalDebugPresetController();
  const saved = presetController.savePreset("Two practices", {
    ...cheatSpec,
    candidateSlot: 1,
    interventions: [
      { kind: "practice", practiceId: "exchange" },
      { kind: "practice", practiceId: "import" },
      { kind: "connection", mode: "add" },
    ],
  });
  assert.equal(saved.ok, true);
  const restored = createVassalDebugPresetController().loadPreset(saved.preset.id);
  assert.deepEqual(restored.preset.draft.interventions, saved.preset.draft.interventions);

  let resetState = null;
  const runner = {
    resetToState(state) {
      resetState = state;
      return { ok: true };
    },
  };
  const mapController = createMapLabController({ runner });
  const configController = createDebugConfigurationController({
    runner,
    mapLabController: mapController,
  });
  const profileVassalController = createVassalDebugPresetController();
  profileVassalController.setCurrentDraft({
    ...cheatSpec,
    candidateSlot: 1,
    interventions: [
      { kind: "expandSettlement" },
      { kind: "globalStructure", structureId: "mudHouses" },
      { kind: "practice", practiceId: "forage" },
    ],
  });
  configController.updateValue(GAME_SETTINGS_DRAFT_KIND, ["values", "populationPerToken"], 12);
  mapController.updateRegion("cedar-woods", { structureCapacity: 7 });
  const profileController = createDebugProfileController({
    mapLabController: mapController,
    debugConfigurationController: configController,
    vassalDebugPresetController: profileVassalController,
  });
  profileController.setActivePage("vassalLab");
  const profileSaved = profileController.saveProfile("Full boot profile");
  assert.equal(profileSaved.ok, true);
  assert.equal(profileController.setBootProfile(profileSaved.entry.id).ok, true);
  configController.updateValue(GAME_SETTINGS_DRAFT_KIND, ["values", "populationPerToken"], 99);
  mapController.updateRegion("cedar-woods", { structureCapacity: 8 });

  const restoredProfileController = createDebugProfileController({
    mapLabController: mapController,
    debugConfigurationController: configController,
    vassalDebugPresetController: profileVassalController,
  });
  const bootLoaded = restoredProfileController.loadBootProfile();
  assert.equal(bootLoaded.applied, true);
  assert.equal(restoredProfileController.getSnapshot().activePage, "vassalLab");
  assert.equal(mapController.getSnapshot().draft.regions[0].structureCapacity, 7);
  assert.equal(
    configController.getSnapshot(GAME_SETTINGS_DRAFT_KIND).draft.values.populationPerToken,
    12,
    "boot profile replaces the independently persisted panel draft"
  );
  assert.equal(profileVassalController.getSnapshot().currentDraft.interventions[0].kind,
    "expandSettlement");
  assert.equal(configController.applyToFreshRun().ok, true);
  assert.equal(resetState.gameConfig.settings.values.populationPerToken, 12);
  assert.equal(resetState.world.regions[0].structureCapacity, 7);
  mapController.updateRegion("cedar-woods", { structureCapacity: 8 });
  assert.equal(restoredProfileController.loadProfile(profileSaved.entry.id).ok, true);
  assert.equal(mapController.getSnapshot().draft.regions[0].structureCapacity, 7,
    "loading a combined profile restores every stored panel draft together");
  assert.equal(restoredProfileController.selectProfile(null).ok, true);
  assert.equal(restoredProfileController.getSnapshot().selectedProfileId, null,
    "clearing the profile selection enters new-profile mode");
  const secondProfile = restoredProfileController.saveProfile("Separate profile");
  assert.equal(secondProfile.ok, true);
  assert.notEqual(secondProfile.entry.id, profileSaved.entry.id,
    "a cleared selection creates a distinct combined profile instead of overwriting");
  assert.equal(restoredProfileController.getSnapshot().profileOptions.length, 2);
  assert.equal(restoredProfileController.selectProfile(profileSaved.entry.id).ok, true);
  const overwritten = restoredProfileController.saveProfile("Full boot profile", {
    overwriteProfileId: profileSaved.entry.id,
  });
  assert.equal(overwritten.ok, true);
  assert.equal(overwritten.entry.id, profileSaved.entry.id);
  assert.equal(restoredProfileController.deleteProfile(profileSaved.entry.id).ok, true);
  assert.equal(restoredProfileController.getSnapshot().profileOptions.length, 1);
  assert.equal(restoredProfileController.deleteProfile(secondProfile.entry.id).ok, true);
  assert.equal(restoredProfileController.getSnapshot().profileOptions.length, 0);

  storage.set("civsurvivor.debugProfiles.boot.v1", "profile-999");
  mapController.updateRegion("cedar-woods", { structureCapacity: 8 });
  const invalidBootController = createDebugProfileController({
    mapLabController: mapController,
    debugConfigurationController: configController,
    vassalDebugPresetController: profileVassalController,
  });
  assert.equal(invalidBootController.loadBootProfile().reason, "missingBootProfile");
  assert.equal(mapController.getSnapshot().draft.regions[0].structureCapacity, 8,
    "an invalid boot profile does not partially replace current drafts");
  assert.equal(invalidBootController.getSnapshot().status.tone, "warning");
} finally {
  if (previousStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = previousStorage;
}

console.log("[debug-game-config-v7] OK");
