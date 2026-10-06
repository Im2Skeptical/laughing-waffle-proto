import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setupDefs } from "../../defs/gamesettings/scenarios-defs.js";
import { createSimRunner } from "../../controllers/sim-runner.js";
import { createInitialState, initGameState } from "../init.js";
import {
  GAMEPIECES_DRAFT_KIND,
  GAME_SETTINGS_DRAFT_KIND,
  canonicalizeGameConfig,
  canonicalizeGamepiecesDraft,
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
import { serializeGameState, deserializeGameState } from "../state.js";
import { createNewGameState } from "../new-game.js";
import {
  appendActionAtCursor,
  createTimelineFromInitialState,
  rebuildStateAtSecond,
} from "../timeline/index.js";
import { createVassalDebugPresetController } from "../../controllers/vassal-debug-preset-controller.js";
import { createMapLabController } from "../../controllers/map-lab-controller.js";
import { createDebugConfigurationController } from "../../controllers/debug-configuration-controller.js";
import { createDebugProfileController } from "../../controllers/debug-profile-controller.js";
import { createLifeMapLabController } from "../../controllers/life-map-lab-controller.js";
import { createNewGameSettingsController } from "../../controllers/new-game-settings-controller.js";
import { createCardReviewController } from "../../controllers/card-review-controller.js";
import { createStarterBootProfile } from "../starter-boot-profile.js";
import {
  parseDebugProfileExportJson, REGULAR_GAME_PROFILE_ID, DEBUG_PROFILE_DEFAULT_STORAGE_KEY,
  DEBUG_PROFILE_LIBRARY_STORAGE_KEY, createEmptyDebugProfileLibrary, saveDebugProfile, serializeDebugProfileLibrary,
} from "../debug-profile-library.js";

const clone = (value) => JSON.parse(JSON.stringify(value));

const authoredConfig = createAuthoredGameConfig();
assert.equal(authoredConfig.schemaVersion, 16);
assert.equal(authoredConfig.settings.schemaVersion, 16);
assert.equal(authoredConfig.gamepieces.schemaVersion, 16);
assert.equal(authoredConfig.lifeMapGenerator.laneCount, 6);
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
assert.equal(authoredConfig.gamepieces.practices.forage.stockCapacity,2);
assert.ok(authoredConfig.gamepieces.practices.barter.stockTraits.includes('Currency'));
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
    "migrationHardshipDeathRate",
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
    migrationHardshipDeathRate: 0.8,
    resistancePerAdditionalElder: 2,
  },
  "Cultivate_01 game-setting values are the authored baseline"
);
const retaggedGamepieces = setAtPath(
  authoredConfig.gamepieces,
  ["practices", "barter", "tags"],
  ["Commerce"]
);
assert.equal(validateGamepiecesDraft(retaggedGamepieces).ok, true);
assert.deepEqual(canonicalizeGamepiecesDraft(retaggedGamepieces).practices.barter.tags, ["Commerce"],
  "editable gamepiece tags survive canonicalization");
assert.ok(getGamepieceEditorGroups(authoredConfig.gamepieces)
  .flatMap((group) => group.fields)
  .some((field) => field.path.join(".") === "practices.barter.tags"),
"Gamepieces exposes tags to the debug editor");
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
const gamepieces = setAtPath(authoredConfig.gamepieces,['practices','forage','stockCapacity'],9);
const setup = clone(setupDefs.devPlaytesting01);
setup.gameConfig=canonicalizeGameConfig({settings,gamepieces});
const configured=createInitialState(setup,901);
assert.equal(getStoredFoodCapacity(configured,'cedar-woods'),12);
assert.deepEqual(assignDetailedSettlementWorkers(configured,'river-crown').map(a=>a.effectiveWorkers),[1,...Array(4).fill(0)]);
assert.equal(getPopulationSummary(configured,'cedar-woods').mealDemand,1,'Food is one hosted unit per thirty people');
assert.equal(serializeGameState(configured).gameConfig.gamepieces.practices.forage.stockCapacity,9);
const playtestingCapital = setupDefs.devPlaytesting01.civilization.capitalRegionId;
const defaultSetupState = createInitialState(undefined, 904);
assert.equal(defaultSetupState.civilization.capitalRegionId, playtestingCapital,
  "createInitialState defaults to devPlaytesting01");
const replaced = { marker: true };
initGameState(replaced);
assert.equal(replaced.marker, undefined);
assert.equal(replaced.civilization.capitalRegionId, playtestingCapital,
  "initGameState defaults to devPlaytesting01");
const defaultRunner = createSimRunner({});
assert.equal(defaultRunner.init().ok, true);
assert.equal(defaultRunner.getState().civilization.capitalRegionId, playtestingCapital,
  "createSimRunner defaults to devPlaytesting01");
const fallbackRunner = createSimRunner({ setupId: "" });
assert.equal(fallbackRunner.init().ok, true);
assert.equal(fallbackRunner.getState().civilization.capitalRegionId, playtestingCapital,
  "an empty setup id falls back to devPlaytesting01");
const settlementRoot = readFileSync(new URL("../../views/ui-root-settlement-pixi.js", import.meta.url), "utf8");
assert.match(settlementRoot, /let selectedWorldRegionId = null;/);
assert.match(settlementRoot, /selectedWorldRegionId = typeof capitalRegionId === "string" && capitalRegionId\.length > 0/);

const cheatState = createInitialState("devPlaytesting01", 903);
const seedBefore = structuredClone(cheatState.rng);
const selectionPool = buildDetailedVassalSelectionPool(cheatState);
const cheatSpec = {
  schemaVersion: 5,
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
replayBase.gameConfig.settings.values.primordialBasePressure=0;
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
  const lifeMapController = createLifeMapLabController();
  const configController = createDebugConfigurationController({
    runner,
    mapLabController: mapController,
    lifeMapLabController: lifeMapController,
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
  const options = { mapLabController: mapController, debugConfigurationController: configController, lifeMapLabController: lifeMapController };
  const profileController = createDebugProfileController(options);
  assert.equal(profileController.loadDefaultProfile().ok, true);
  assert.equal(profileController.getSnapshot().readOnly, true);
  assert.equal(profileController.getSnapshot().profileOptions[0].id, REGULAR_GAME_PROFILE_ID);
  assert.equal(profileController.saveProfile("Regular game").reason, "readOnlyProfile");
  assert.equal(profileController.deleteProfile(REGULAR_GAME_PROFILE_ID).reason, "readOnlyProfile");
  assert.equal(profileController.setLaunch({ startMode: "authoredMap", neutralSettlements: false }).reason, "readOnlyProfile");
  for (const seed of [0, 42, 903, -99]) {
    const baseline = serializeGameState(profileController.createRun(seed));
    assert.deepEqual(baseline, serializeGameState(createNewGameState(seed)), "Regular game uses exactly the player New Game factory");
    assert.equal(baseline.world.regions.filter(region => region.controller === 'player').length, 2);
    assert.equal(baseline.world.sites.filter(site => site.neutral).length, 4);
  }
  const baselineRecipe = profileController.getCurrentProfile();
  assert.equal(profileController.copyProfile().ok, true);
  assert.equal(profileController.getSnapshot().readOnly, false);
  assert.deepEqual(serializeGameState(profileController.createRun(42)), serializeGameState(createNewGameState(42)), "an unedited copy is exactly the live recipe");
  assert.equal(profileController.saveProfile("Regular game").reason, "readOnlyProfile", "the built-in name cannot be overwritten by a copy");
  assert.equal(profileController.saveProfile("").reason, "emptyName");
  configController.updateValue(GAME_SETTINGS_DRAFT_KIND, ["values", "populationPerToken"], 12);
  lifeMapController.updateValue(["generatorConfig", "laneCount"], 5);
  profileController.setActivePage("lifeMapLab");
  assert.equal(profileController.getSnapshot().dirty, true);
  const profileSaved = profileController.saveProfile("Five lanes");
  assert.equal(profileSaved.ok, true);
  assert.equal(profileController.getSnapshot().dirty, false);
  assert.equal(profileController.setDefaultProfile(profileSaved.entry.id).ok, true);
  assert.equal(profileController.setDefaultProfile("missing").reason, "invalidProfileId");
  const editedState = profileController.createRun(42);
  assert.equal(editedState.gameConfig.settings.values.populationPerToken, 12);
  assert.equal(editedState.gameConfig.lifeMapGenerator.laneCount, 5);
  assert.equal(editedState.world.sites.filter(site => site.neutral).length, 4);
  assert.deepEqual(serializeGameState(deserializeGameState(serializeGameState(editedState))), serializeGameState(editedState));
  const timeline = createTimelineFromInitialState(editedState);
  const rebuilt = rebuildStateAtSecond(timeline, 64);
  assert.equal(rebuilt.ok, true);
  assert.deepEqual(serializeGameState(rebuilt.state), serializeGameState(rebuildStateAtSecond(timeline, 64).state));
  const captured = serializeGameState(editedState);
  configController.updateValue(GAME_SETTINGS_DRAFT_KIND, ["values", "populationPerToken"], 99);
  assert.deepEqual(serializeGameState(editedState), captured, "subsequent draft edits leave launched runs intact");
  const reopenedMap = createMapLabController(), reopenedLifeMap = createLifeMapLabController();
  const reopenedConfig = createDebugConfigurationController({ lifeMapLabController: reopenedLifeMap });
  const reopenedWorkspace = createDebugProfileController({ mapLabController: reopenedMap, lifeMapLabController: reopenedLifeMap, debugConfigurationController: reopenedConfig });
  assert.equal(reopenedWorkspace.openWorkspace().ok, true);
  assert.equal(reopenedWorkspace.getSnapshot().readOnly, false);
  assert.equal(reopenedConfig.getSnapshot(GAME_SETTINGS_DRAFT_KIND).draft.values.populationPerToken, 99, "unsaved edits survive a workshop reload");
  reopenedWorkspace.destroy();
  const restoredProfile = createDebugProfileController(options);
  assert.equal(restoredProfile.loadDefaultProfile().ok, true);
  assert.equal(restoredProfile.getSnapshot().activePage, "lifeMapLab");
  assert.equal(configController.getSnapshot(GAME_SETTINGS_DRAFT_KIND).draft.values.populationPerToken, 12);
  const second = restoredProfile.saveProfile("Separate profile");
  assert.notEqual(second.entry.id, profileSaved.entry.id);
  assert.equal(restoredProfile.saveProfile("FIVE LANES").entry.id, profileSaved.entry.id, "profile names define overwrite identity");
  const exported = restoredProfile.exportProfile("Portable baseline");
  assert.equal(parseDebugProfileExportJson(exported.text).ok, true);
  assert.equal(restoredProfile.loadProfile(REGULAR_GAME_PROFILE_ID).ok, true);
  assert.deepEqual(restoredProfile.getCurrentProfile(), baselineRecipe, "the live baseline remains pristine after editing and saving copies");
  assert.equal(restoredProfile.importProfile(exported.text).ok, true);
  assert.equal(restoredProfile.getSnapshot().readOnly, false);
  assert.equal(lifeMapController.getSnapshot().draft.generatorConfig.laneCount, 5);
  const beforeInvalid = restoredProfile.getCurrentProfile();
  assert.equal(restoredProfile.importProfile("{}").ok, false);
  assert.deepEqual(restoredProfile.getCurrentProfile(), beforeInvalid, "invalid imports do not replace drafts");
  const bad = JSON.parse(exported.text); bad.profile.launch.startMode = "unknown";
  assert.equal(restoredProfile.importProfile(JSON.stringify(bad)).ok, false);
  restoredProfile.setLaunch({ startMode: "authoredMap", neutralSettlements: false });
  mapController.updateRegion("cedar-woods", { structureCapacity: 7, randomizeStructureCapacity: false });
  const exact = restoredProfile.createRun(42);
  assert.equal(exact.world.regions[0].structureCapacity, 7);
  assert.equal(exact.world.sites.filter(site => site.neutral).length, 0);
  assert.deepEqual(exact.world.regions.filter(region => region.controller === 'player').map(region => region.id), ['lake-country', 'black-marsh']);
  assert.equal(restoredProfile.deleteProfile(profileSaved.entry.id).ok, true);
  assert.equal(restoredProfile.getSnapshot().defaultProfileId, REGULAR_GAME_PROFILE_ID);
  storage.set(DEBUG_PROFILE_DEFAULT_STORAGE_KEY, 'missing');
  assert.equal(createDebugProfileController(options).loadDefaultProfile().entry.id, REGULAR_GAME_PROFILE_ID);
  assert.throws(() => restoredProfile.createRun(NaN), /Seed/);
} finally {
  if (previousStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = previousStorage;
}

{
  const saved = new Map();
  const storage = { getItem: key => saved.get(key) ?? null, setItem: (key, value) => saved.set(key, value) };
  const reviews = createCardReviewController({ storage });
  const settings = createNewGameSettingsController({ storage, cardReviews: reviews });
  const baseline = serializeGameState(createNewGameState(42));
  assert.deepEqual(serializeGameState(settings.createNewGame(42)), baseline);
  const profile = createStarterBootProfile();
  profile.gameSettings.values.populationPerToken = 12;
  profile.lifeMapLab.generatorConfig.laneCount = 5;
  profile.launch.neutralSettlements = false;
  profile.mapLab.regions[0].colour = 'black';
  profile.gamepieces.practices.forage.stockCapacity = 6;
  const entry = saveDebugProfile(createEmptyDebugProfileLibrary(), 'Custom game', profile);
  storage.setItem(DEBUG_PROFILE_LIBRARY_STORAGE_KEY, serializeDebugProfileLibrary(entry.library));
  settings.selectProfile(entry.entry.id);
  const normalKey = settings.getLaunchKey();
  settings.setEnabled(true);
  assert.notEqual(settings.getLaunchKey(), normalKey, 'enabling dev settings invalidates the prepared opening');
  const custom = settings.createNewGame(42), captured = serializeGameState(custom);
  assert.equal(custom.gameConfig.settings.values.populationPerToken, 12);
  assert.equal(custom.gameConfig.lifeMapGenerator.laneCount, 5);
  assert.equal(custom.gameConfig.gamepieces.practices.forage.stockCapacity, 6);
  assert.equal(custom.world.regions[0].colour, 'black');
  assert.equal(custom.world.sites.filter(site => site.neutral).length, 0);
  const initialKey = settings.getLaunchKey();
  entry.library.profiles[0].profile.gameSettings.values.populationPerToken = 14;
  storage.setItem(DEBUG_PROFILE_LIBRARY_STORAGE_KEY, serializeDebugProfileLibrary(entry.library));
  assert.notEqual(settings.getLaunchKey(), initialKey, 'saved profile edits invalidate the prepared opening');
  assert.equal(settings.createNewGame(42).gameConfig.settings.values.populationPerToken, 14);
  assert.deepEqual(serializeGameState(custom), captured, 'profile edits leave existing games unchanged');
  const reopened = createNewGameSettingsController({ storage, cardReviews: reviews });
  assert.equal(reopened.getSnapshot().enabled, true);
  assert.equal(reopened.getSnapshot().profileId, entry.entry.id);
  reviews.flag('practice', 'forage', profile.gamepieces.practices.forage);
  reviews.edit('practice', 'forage', ['stockCapacity'], 9);
  reviews.setUseInNewGames(true);
  assert.equal(reopened.createNewGame(42).gameConfig.gamepieces.practices.forage.stockCapacity, 9, 'enabled reviews apply over the selected profile');
  reviews.setUseInNewGames(false);
  assert.equal(reopened.createNewGame(42).gameConfig.gamepieces.practices.forage.stockCapacity, 6, 'unchecked reviews preserve cards already saved in the profile');
  const timeline = createTimelineFromInitialState(custom);
  const replayed = rebuildStateAtSecond(timeline, 1);
  assert.equal(replayed.ok, true);
  assert.equal(replayed.state.gameConfig.settings.values.populationPerToken, 12, 'replay uses the captured recipe after its saved profile changes');
  assert.equal(replayed.state.gameConfig.gamepieces.practices.forage.stockCapacity, 6, 'replay ignores later card reviews');
  storage.setItem(DEBUG_PROFILE_LIBRARY_STORAGE_KEY, serializeDebugProfileLibrary(createEmptyDebugProfileLibrary()));
  assert.match(reopened.getSnapshot().error, /unavailable/);
  assert.doesNotThrow(() => reopened.getLaunchKey(), 'a missing selection must not crash the menu prewarm');
  assert.throws(() => reopened.createNewGame(42), /unavailable/, 'missing profiles must never silently start a regular game');
  reopened.setEnabled(false);
  assert.deepEqual(serializeGameState(reopened.createNewGame(42)), baseline);
}

console.log("[debug-game-config-v12] OK");
