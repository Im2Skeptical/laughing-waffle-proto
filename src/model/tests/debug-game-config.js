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
import {
  parseDebugProfileExportJson,
} from "../debug-profile-library.js";

const clone = (value) => JSON.parse(JSON.stringify(value));

const authoredConfig = createAuthoredGameConfig();
assert.equal(authoredConfig.schemaVersion, 8);
assert.equal(authoredConfig.settings.schemaVersion, 8);
assert.equal(authoredConfig.gamepieces.schemaVersion, 8);
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
assert.equal(authoredConfig.settings.values.primordialBasePressure, 100);
assert.equal(authoredConfig.settings.values.primordialGrowthFactor, 1.03);
assert.equal(authoredConfig.settings.values.primordialGrowthCadenceYears, 12);
assert.deepEqual(
  Object.fromEntries([
    "birthRateSilver", "birthRateGold", "birthRateDiamond", "childToAdultRate",
    "fullFeedStreakForIncrease", "partialFeedMemoryLength",
    "prematureDeathChaosWeight", "externalEmigrationChaosWeight",
    "bronzeChaosResistancePopulation", "silverChaosResistancePopulation",
    "goldChaosResistancePopulation", "diamondChaosResistancePopulation",
    "chaosPerMonster", "monsterLossThreshold", "migrationHardshipDeathRate",
    "resistancePerAdditionalElder",
  ].map((id) => [id, authoredConfig.settings.values[id]])),
  {
    birthRateSilver: 0,
    birthRateGold: 0.02,
    birthRateDiamond: 0.04,
    childToAdultRate: 0.01,
    fullFeedStreakForIncrease: 12,
    partialFeedMemoryLength: 12,
    prematureDeathChaosWeight: 5,
    externalEmigrationChaosWeight: 1,
    bronzeChaosResistancePopulation: 10,
    silverChaosResistancePopulation: 5,
    goldChaosResistancePopulation: 2,
    diamondChaosResistancePopulation: 1,
    chaosPerMonster: 10,
    monsterLossThreshold: 100,
    migrationHardshipDeathRate: 0.8,
    resistancePerAdditionalElder: 2,
  },
  "Cultivate_01 game-setting values are the authored baseline"
);
assert.equal(authoredConfig.gamepieces.structures.granary.capacityPerCountSquared, 180);
assert.equal(authoredConfig.gamepieces.structures.mudHouses.capacityPerCountSquared, 35);
assert.equal(authoredConfig.gamepieces.practices.cultivate.effects[0].scaledValue.baseAmount, 120);
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
  40,
  "meal demand uses the state-scoped class consumption rates"
);

const cultivateSetup = clone(setupDefs.devPlaytesting01);
cultivateSetup.gameConfig = canonicalizeGameConfig({
  settings: authoredConfig.settings,
  gamepieces,
});
const cultivate = createInitialState(cultivateSetup, 902);
cultivate.world.sites.find((site) => site.regionId === "cedar-woods").detailedState.practiceSlots[0] = {
  practiceId: "cultivate", charge: 0, work: 0,
};
cultivate.currentSeasonIndex = 1;
cultivate._seasonChanged = true;
stepDetailedSettlementsSecond(cultivate, 8);
assert.equal(
  getDetailedSettlement(cultivate, "cedar-woods").storedFood,
  82,
  "Cultivate uses the state-scoped effect before the same Food phase meal"
);
assert.equal(getDetailedSettlement(cultivate, "cedar-woods").looseFood, 0);
assert.equal(
  serializeGameState(configured).gameConfig.gamepieces.structures.granary
    .capacityPerCountSquared,
  125
);

const cheatState = createInitialState("devPlaytesting01", 903);
const seedBefore = structuredClone(cheatState.rng);
const selectionPool = buildDetailedVassalSelectionPool(cheatState);
const cheatSpec = {
  schemaVersion: 4,
  locationRegionId: "river-crown",
  age: 20,
  prestige: 42,
  cunning: 3,
  wisdom: 2,
  effectiveness: 4,
  intelligence: 5,
  candidateSlot: 1,
};
const replacementResult = replaceDetailedVassalSelectionCandidate(
  cheatState,
  selectionPool,
  0,
  cheatSpec
);
assert.equal(replacementResult.ok, true);
assert.deepEqual(cheatState.rng, seedBefore, "debug candidate replacement consumes no RNG");
assert.equal(replacementResult.pool.candidates[0].prestige, 42);
assert.deepEqual(replacementResult.pool.candidates[0].stats, {
  cunning: 3, wisdom: 2, effectiveness: 4, intelligence: 5,
});

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
  rebuiltA.state.civilization.vassalLineage.vassalsById["vassal-1"].debugInjected,
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
  });
  assert.equal(saved.ok, true);
  const separatelyNamedVassal = presetController.savePreset("A second Vassal", {
    ...saved.preset.draft,
    candidateSlot: 2,
  });
  assert.equal(separatelyNamedVassal.ok, true);
  assert.notEqual(separatelyNamedVassal.preset.id, saved.preset.id,
    "a unique Vassal preset name creates a new slot despite the active selection");
  const overwrittenVassal = presetController.savePreset("two practices", {
    ...saved.preset.draft,
    candidateSlot: 3,
  });
  assert.equal(overwrittenVassal.ok, true);
  assert.equal(overwrittenVassal.preset.id, saved.preset.id,
    "a matching Vassal preset name overwrites case-insensitively");
  assert.equal(presetController.getSnapshot().presetOptions.length, 2);
  const restored = createVassalDebugPresetController().loadPreset(saved.preset.id);
  assert.equal(restored.preset.draft.candidateSlot, 3);

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
  const settingsPreset = configController.savePreset(GAME_SETTINGS_DRAFT_KIND, "Test settings");
  const secondSettingsPreset = configController.savePreset(
    GAME_SETTINGS_DRAFT_KIND,
    "Alternative settings"
  );
  assert.notEqual(secondSettingsPreset.preset.id, settingsPreset.preset.id,
    "a unique Game Settings name creates a new slot despite the active selection");
  const overwrittenSettingsPreset = configController.savePreset(
    GAME_SETTINGS_DRAFT_KIND,
    "TEST SETTINGS"
  );
  assert.equal(overwrittenSettingsPreset.preset.id, settingsPreset.preset.id);
  const gamepiecesPreset = configController.savePreset(GAMEPIECES_DRAFT_KIND, "Test gamepieces");
  const secondGamepiecesPreset = configController.savePreset(
    GAMEPIECES_DRAFT_KIND,
    "Alternative gamepieces"
  );
  assert.notEqual(secondGamepiecesPreset.preset.id, gamepiecesPreset.preset.id);
  assert.equal(
    configController.savePreset(GAMEPIECES_DRAFT_KIND, "test GAMEPIECES").preset.id,
    gamepiecesPreset.preset.id
  );
  const mapScenario = mapController.saveLocalScenario("Test map");
  const secondMapScenario = mapController.saveLocalScenario("Alternative map");
  assert.notEqual(secondMapScenario.scenario.id, mapScenario.scenario.id,
    "a unique Map Lab scenario name creates a new slot despite the active selection");
  assert.equal(mapController.saveLocalScenario("TEST MAP").scenario.id, mapScenario.scenario.id);
  const profileVassalController = createVassalDebugPresetController();
  profileVassalController.setCurrentDraft({
    ...cheatSpec,
    candidateSlot: 1,
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
  assert.equal(profileVassalController.getSnapshot().currentDraft.prestige, 42);
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
  const overwritten = restoredProfileController.saveProfile("FULL BOOT PROFILE");
  assert.equal(overwritten.ok, true);
  assert.equal(overwritten.entry.id, profileSaved.entry.id);
  const thirdProfile = restoredProfileController.saveProfile("Third profile");
  assert.notEqual(thirdProfile.entry.id, profileSaved.entry.id,
    "a unique combined profile name creates a new slot despite the active selection");
  assert.equal(restoredProfileController.deleteProfile(profileSaved.entry.id).ok, true);
  assert.equal(restoredProfileController.getSnapshot().profileOptions.length, 2);
  assert.equal(restoredProfileController.deleteProfile(secondProfile.entry.id).ok, true);
  assert.equal(restoredProfileController.getSnapshot().profileOptions.length, 1);
  assert.equal(restoredProfileController.deleteProfile(thirdProfile.entry.id).ok, true);
  assert.equal(restoredProfileController.getSnapshot().profileOptions.length, 0);

  const exportedProfile = restoredProfileController.exportProfile("Portable baseline");
  assert.equal(exportedProfile.ok, true);
  const parsedExport = parseDebugProfileExportJson(exportedProfile.text);
  assert.equal(parsedExport.ok, true);
  assert.equal(parsedExport.value.name, "Portable baseline");
  mapController.updateRegion("cedar-woods", { structureCapacity: 8 });
  configController.updateValue(GAME_SETTINGS_DRAFT_KIND, ["values", "populationPerToken"], 99);
  const importedProfile = restoredProfileController.importProfile(exportedProfile.text);
  assert.equal(importedProfile.ok, true);
  assert.equal(importedProfile.entry.name, "Portable baseline");
  assert.equal(mapController.getSnapshot().draft.regions[0].structureCapacity, 7);
  assert.equal(
    configController.getSnapshot(GAME_SETTINGS_DRAFT_KIND).draft.values.populationPerToken,
    12,
    "combined profile imports atomically restore every debug draft"
  );
  const beforeInvalidImport = mapController.getSnapshot().draft.regions[0].structureCapacity;
  assert.equal(restoredProfileController.importProfile("{}").ok, false);
  assert.equal(mapController.getSnapshot().draft.regions[0].structureCapacity, beforeInvalidImport,
    "invalid combined profile exports do not partially replace current drafts");

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

console.log("[debug-game-config-v8] OK");
