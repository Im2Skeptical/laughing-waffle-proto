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

const clone = (value) => JSON.parse(JSON.stringify(value));

const authoredConfig = createAuthoredGameConfig();
assert.equal(authoredConfig.schemaVersion, 4);
assert.equal(authoredConfig.settings.schemaVersion, 4);
assert.equal(authoredConfig.gamepieces.schemaVersion, 4);
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
  [1, 0, 0, 0, 0, 0]
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

console.log("[debug-game-config-v4] OK");
