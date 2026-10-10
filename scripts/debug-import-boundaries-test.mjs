import assert from "node:assert/strict";
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { createMapLabController } from "../src/controllers/map-lab-controller.js";
import { createLifeMapLabController } from "../src/controllers/life-map-lab-controller.js";
import { createDebugConfigurationController } from "../src/controllers/debug-configuration-controller.js";
import { createDebugProfileController } from "../src/controllers/debug-profile-controller.js";
import { GAME_CONFIG_SCHEMA_VERSION, GAME_SETTINGS_DRAFT_KIND } from "../src/model/game-config.js";
import {
  DEBUG_PROFILE_EXPORT_SCHEMA_VERSION, DEBUG_PROFILE_LIBRARY_SCHEMA_VERSION,
  DEBUG_PROFILE_LIBRARY_STORAGE_KEY, REGULAR_GAME_PROFILE_ID,
  createEmptyDebugProfileLibrary, saveDebugProfile,
  parseDebugProfileLibraryJson, serializeDebugProfileLibrary,
} from "../src/model/debug-profile-library.js";
import {
  LIFE_MAP_LAB_DRAFT_SCHEMA_VERSION, LIFE_MAP_LAB_STORAGE_KEY,
} from "../src/model/life-map-lab-draft.js";
import { MAP_LAB_DRAFT_SCHEMA_VERSION } from "../src/model/map-lab-draft.js";
import { VASSAL_LIFE_MAP_GENERATOR_SCHEMA_VERSION } from "../src/model/vassal-life-map-generator.js";
import { serializeGameState } from "../src/model/state.js";

const COMMAND = "node scripts/debug-import-boundaries-test.mjs";
const ARTIFACT = "artifacts/debug-import-boundaries-report.json";
const WORKSPACE_KEY = "civsurvivor.debugProfiles.workspace.v3";
try { unlinkSync(ARTIFACT); } catch { /* no previous report */ }
const clone = (value) => JSON.parse(JSON.stringify(value));
const passed = [];
const failures = [];

function storageSession(run) {
  const saved = new Map();
  const writes = [];
  const previous = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  globalThis.localStorage = {
    getItem: (key) => (saved.has(key) ? saved.get(key) : null),
    setItem: (key, value) => { writes.push(key); saved.set(key, value); },
    removeItem: (key) => { writes.push(`remove:${key}`); saved.delete(key); },
  };
  try { return run({ saved, writes }); }
  finally {
    if (previous) Object.defineProperty(globalThis, "localStorage", previous);
    else delete globalThis.localStorage;
  }
}

function boot() {
  const map = createMapLabController();
  const life = createLifeMapLabController();
  const config = createDebugConfigurationController({ mapLabController: map, lifeMapLabController: life });
  const profile = createDebugProfileController({
    mapLabController: map, debugConfigurationController: config, lifeMapLabController: life,
  });
  return { map, life, config, profile };
}

function snap(ctx) {
  return JSON.stringify({
    profile: ctx.profile.getCurrentProfile(),
    options: ctx.profile.getSnapshot().profileOptions,
    readOnly: ctx.profile.getSnapshot().readOnly,
    map: ctx.map.getSnapshot().draft,
    life: ctx.life.getSnapshot().draft,
    settings: ctx.config.getSnapshot(GAME_SETTINGS_DRAFT_KIND).draft,
  });
}

function dump(saved) {
  return JSON.stringify([...saved.keys()].sort().map((key) => [key, saved.get(key)]));
}

function largestProfileId(library) {
  return Math.max(...library.profiles.map((entry) => Number(String(entry.id).replace(/^\D+/, ""))));
}

function assertKeptBytes(saved, before, field) {
  for (const key of new Set([...before.keys(), ...saved.keys()])) {
    if (key === WORKSPACE_KEY) continue;
    assert.equal(saved.get(key) ?? null, before.get(key) ?? null, `${field} changed ${key}`);
  }
}

function assertWorkspaceProfile(saved, beforeText, field) {
  const afterText = saved.get(WORKSPACE_KEY) ?? null;
  if (beforeText == null) {
    if (afterText == null) return;
    assert.deepEqual(JSON.parse(afterText), {
      selectedProfileId: REGULAR_GAME_PROFILE_ID, profile: null,
    }, `${field} initialized workspace with imported data`);
    return;
  }
  const before = JSON.parse(beforeText);
  const after = JSON.parse(afterText);
  assert.equal(after.selectedProfileId, before.selectedProfileId, `${field} changed selectedProfileId`);
  assert.deepEqual(after.profile, before.profile, `${field} changed workspace.profile`);
}

function check(field, fn) {
  try { fn(); passed.push(field); }
  catch (error) { failures.push({ field, command: COMMAND, message: error.message }); }
}

function rejectBoth(field, needle, invoke, { lifeStatus = false } = {}) {
  for (const destination of ["empty", "occupied"]) {
    check(`${field}/${destination}`, () => storageSession(({ saved, writes }) => {
      const ctx = boot();
      if (destination === "occupied") {
        assert.equal(ctx.profile.copyProfile().ok, true);
        assert.equal(ctx.life.updateValue(["generatorConfig", "laneCount"], 5).ok, true);
        assert.equal(ctx.profile.saveProfile("Occupied keeper").ok, true);
      }
      const before = snap(ctx);
      const stored = dump(saved);
      const workspaceBefore = saved.get(WORKSPACE_KEY) ?? null;
      const mark = writes.length;
      const result = invoke(ctx);
      assert.equal(result.ok, false, field);
      const detail = `${result.errors?.[0] ?? ""} ${result.reason ?? ""}`;
      assert.match(detail, needle, `${field} => ${detail}`);
      assert.equal(snap(ctx), before, `${field} replaced in-memory ${destination} state`);
      assertKeptBytes(saved, new Map(JSON.parse(stored)), field);
      if (!lifeStatus) {
        assert.equal(writes.length, mark, `${field} wrote storage during invalid parse`);
        assert.equal(saved.get(WORKSPACE_KEY) ?? null, workspaceBefore, `${field} wrote workspace`);
      } else assertWorkspaceProfile(saved, workspaceBefore, field);
    }));
  }
}

const exported = storageSession(() => {
  const ctx = boot();
  assert.equal(ctx.profile.copyProfile().ok, true);
  assert.equal(ctx.life.updateValue(["generatorConfig", "laneCount"], 4).ok, true);
  assert.equal(ctx.config.updateValue(GAME_SETTINGS_DRAFT_KIND, ["values", "populationPerToken"], 12).ok, true);
  const regionId = ctx.map.getSnapshot().draft.regions[0].id;
  assert.equal(ctx.map.updateRegion(regionId, { colour: "black" }).ok, true);
  assert.equal(ctx.profile.saveProfile("Source").ok, true);
  const text = ctx.profile.exportProfile("Portable").text;
  const lifeText = ctx.life.exportJson();
  const mapText = ctx.map.exportJson();
  assert.equal(ctx.life.updateValue(["generatorConfig", "laneCount"], 5).ok, true);
  assert.equal(ctx.profile.saveProfile("Sibling").ok, true);
  const sibling = JSON.parse(ctx.profile.exportProfile("Sibling").text).profile;
  const live = ctx.profile.createRun(11);
  const liveJson = JSON.stringify(serializeGameState(live));
  assert.equal(ctx.profile.importProfile(text).ok, true);
  assert.equal(JSON.stringify(serializeGameState(live)), liveJson, "live game changed after profile import");
  const library = JSON.parse(globalThis.localStorage.getItem(DEBUG_PROFILE_LIBRARY_STORAGE_KEY));
  assert.deepEqual(library.profiles.find((entry) => entry.name === "Sibling").profile, sibling);
  const recipe = JSON.parse(text).profile;
  const expected = {
    schemaVersion: GAME_CONFIG_SCHEMA_VERSION,
    settings: recipe.gameSettings,
    gamepieces: recipe.gamepieces,
    lifeMapGenerator: recipe.lifeMapLab.generatorConfig,
  };
  assert.deepEqual(ctx.profile.createRun(11).gameConfig, expected);
  return { text, lifeText, mapText, recipe, expected };
});

check("roundtrip/empty-profile", () => storageSession(() => {
  const ctx = boot();
  assert.equal(ctx.profile.importProfile(exported.text).ok, true);
  assert.deepEqual(ctx.profile.createRun(11).gameConfig, exported.expected);
  assert.equal(ctx.life.importJson(exported.lifeText).ok, true);
  assert.equal(ctx.life.exportJson(), exported.lifeText);
  assert.equal(ctx.map.importJson(exported.mapText).ok, true);
  assert.equal(ctx.map.exportJson(), exported.mapText);
}));

check("roundtrip/occupied-life-and-map", () => storageSession(() => {
  const ctx = boot();
  assert.equal(ctx.life.updateValue(["generatorConfig", "laneCount"], 5).ok, true);
  assert.equal(ctx.map.updateRegion(ctx.map.getSnapshot().draft.regions[0].id, { colour: "red" }).ok, true);
  assert.equal(ctx.life.importJson(exported.lifeText).ok, true);
  assert.equal(ctx.life.getSnapshot().draft.generatorConfig.laneCount, 4);
  assert.equal(ctx.map.importJson(exported.mapText).ok, true);
  assert.equal(ctx.map.getSnapshot().draft.regions[0].colour, "black");
}));

check("library/valid-construct", () => storageSession(({ saved }) => {
  let library = createEmptyDebugProfileLibrary();
  library = saveDebugProfile(library, "Alpha", exported.recipe).library;
  library = saveDebugProfile(library, "Beta", exported.recipe).library;
  saved.set(DEBUG_PROFILE_LIBRARY_STORAGE_KEY, serializeDebugProfileLibrary(library));
  const ctx = boot();
  assert.deepEqual(ctx.profile.getSnapshot().profileOptions.map((entry) => entry.name), ["Regular game", "Alpha", "Beta"]);
}));

function baseProfile() { return clone(JSON.parse(exported.text)); }
function baseLibrary() {
  let library = createEmptyDebugProfileLibrary();
  library = saveDebugProfile(library, "Alpha", exported.recipe).library;
  library = saveDebugProfile(library, "Beta", exported.recipe).library;
  return library;
}

const profileCases = [
  ["profile.json", /json:/, () => "{"],
  ["profile.kind", /kind:/, () => ((v) => (v.kind = "other", v))(baseProfile())],
  ["profile.schemaVersion", new RegExp(`schemaVersion: expected ${DEBUG_PROFILE_EXPORT_SCHEMA_VERSION}`), () => ((v) => (v.schemaVersion = DEBUG_PROFILE_EXPORT_SCHEMA_VERSION - 1, v))(baseProfile())],
  ["profile.name", /name: invalid/, () => ((v) => (v.name = "   ", v))(baseProfile())],
  ["profile.activePage", /activePage/, () => ((v) => (v.profile.activePage = "museum", v))(baseProfile())],
  ["profile.launch.startMode", /startMode/, () => ((v) => (v.profile.launch.startMode = "unknown", v))(baseProfile())],
  ["profile.launch.neutralSettlements", /neutralSettlements/, () => ((v) => (v.profile.launch.neutralSettlements = "false", v))(baseProfile())],
  ["profile.mapLab.schemaVersion", /mapLab.schemaVersion/, () => ((v) => (v.profile.mapLab.schemaVersion = MAP_LAB_DRAFT_SCHEMA_VERSION - 1, v))(baseProfile())],
  ["profile.mapLab.duplicateRegion", /invalid or duplicate/, () => ((v) => (v.profile.mapLab.regions[1].id = v.profile.mapLab.regions[0].id, v))(baseProfile())],
  ["profile.lifeMapLab.schemaVersion", /lifeMapLab.schemaVersion/, () => ((v) => (v.profile.lifeMapLab.schemaVersion = LIFE_MAP_LAB_DRAFT_SCHEMA_VERSION - 1, v))(baseProfile())],
  ["profile.lifeMapLab.laneCount", /laneCount/, () => ((v) => (v.profile.lifeMapLab.generatorConfig.laneCount = 99, v))(baseProfile())],
  ["profile.gameSettings.schemaVersion", /gameSettings.schemaVersion/, () => ((v) => (v.profile.gameSettings.schemaVersion = GAME_CONFIG_SCHEMA_VERSION - 1, v))(baseProfile())],
  ["profile.gameSettings.populationPerToken", /populationPerToken/, () => ((v) => (v.profile.gameSettings.values.populationPerToken = 1001, v))(baseProfile())],
  ["profile.gamepieces.locked", /locked: expected a boolean/, () => ((v) => (v.profile.gamepieces.practices.forage.locked = "yes", v))(baseProfile())],
];

for (const [field, needle, make] of profileCases) {
  rejectBoth(field, needle, (ctx) => {
    const value = make();
    return ctx.profile.importProfile(typeof value === "string" ? value : JSON.stringify(value));
  });
}

const libraryCases = [
  ["library.schemaVersion", new RegExp(`schemaVersion: expected ${DEBUG_PROFILE_LIBRARY_SCHEMA_VERSION}`), (library) => { library.schemaVersion = DEBUG_PROFILE_LIBRARY_SCHEMA_VERSION - 1; }],
  ["library.nextId", /nextId/, (library) => { library.nextId = 0; }],
  ["library.nextId.equalLargest", /nextId/, (library) => { library.nextId = largestProfileId(library); }],
  ["library.nextId.belowLargest", /nextId/, (library) => { library.nextId = largestProfileId(library) - 1; }],
  ["library.profiles", /profiles: expected an array/, (library) => { library.profiles = {}; }],
  ["library.duplicateId", /invalid or duplicate/, (library) => { library.profiles[1].id = library.profiles[0].id; }],
  ["library.duplicateName", /name: invalid or duplicate/, (library) => { library.profiles[1].name = "alpha"; }],
  ["library.nestedMap", /colour: invalid/, (library) => { library.profiles[0].profile.mapLab.regions[0].colour = "plaid"; }],
];

for (const [field, needle, mutate] of libraryCases) {
  rejectBoth(field, needle, () => {
    const library = baseLibrary();
    mutate(library);
    return parseDebugProfileLibraryJson(JSON.stringify(library));
  });
}

check("library/invalid-storage-ignored", () => storageSession(({ saved, writes }) => {
  const good = serializeDebugProfileLibrary(baseLibrary());
  saved.set(DEBUG_PROFILE_LIBRARY_STORAGE_KEY, good);
  const occupied = boot();
  const occupiedOptions = occupied.profile.getSnapshot().profileOptions.map((entry) => entry.name);
  const bad = JSON.stringify({ schemaVersion: DEBUG_PROFILE_LIBRARY_SCHEMA_VERSION - 1, nextId: 1, profiles: [] });
  const mark = writes.length;
  const parsed = parseDebugProfileLibraryJson(bad);
  assert.equal(parsed.ok, false);
  assert.match(parsed.errors[0], /schemaVersion/);
  assert.equal(writes.length, mark);
  saved.set(DEBUG_PROFILE_LIBRARY_STORAGE_KEY, bad);
  const reloaded = boot();
  assert.deepEqual(reloaded.profile.getSnapshot().profileOptions.map((entry) => entry.name), ["Regular game"]);
  assert.deepEqual(occupied.profile.getSnapshot().profileOptions.map((entry) => entry.name), occupiedOptions);
  assert.equal(saved.get(DEBUG_PROFILE_LIBRARY_STORAGE_KEY), bad);
}));

function lifeDraft() { return JSON.parse(exported.lifeText); }
const lifeCases = [
  ["life.json", /json:/, () => "{"],
  ["life.laneCount", /laneCount/, () => ((v) => (v.generatorConfig.laneCount = 99, v))(lifeDraft())],
  ["life.routeCount", /routeCount/, () => ((v) => (v.generatorConfig.routeCount = 13, v))(lifeDraft())],
  ["life.depthBands", /depth bands/, () => ((v) => (v.generatorConfig.earlyDepthCount = 10, v))(lifeDraft())],
  ["life.weights", /at least one family must be positive/, () => ((v) => {
    for (const band of Object.values(v.generatorConfig.weights)) {
      for (const key of Object.keys(band)) band[key] = 0;
    }
    return v;
  })(lifeDraft())],
];

function schemaVariant(assign) {
  return () => {
    const draft = lifeDraft();
    assign(draft);
    return draft;
  };
}
const lifeSchemaCases = [
  ["life.schema.obsolete", (draft) => { draft.schemaVersion = LIFE_MAP_LAB_DRAFT_SCHEMA_VERSION - 1; }],
  ["life.schema.missing", (draft) => { delete draft.schemaVersion; }],
  ["life.schema.string", (draft) => { draft.schemaVersion = String(LIFE_MAP_LAB_DRAFT_SCHEMA_VERSION); }],
  ["life.schema.future", (draft) => { draft.schemaVersion = LIFE_MAP_LAB_DRAFT_SCHEMA_VERSION + 1; }],
  ["life.generatorSchema.obsolete", (draft) => { draft.generatorConfig.schemaVersion = VASSAL_LIFE_MAP_GENERATOR_SCHEMA_VERSION - 1; }],
  ["life.generatorSchema.missing", (draft) => { delete draft.generatorConfig.schemaVersion; }],
  ["life.generatorSchema.string", (draft) => { draft.generatorConfig.schemaVersion = String(VASSAL_LIFE_MAP_GENERATOR_SCHEMA_VERSION); }],
  ["life.generatorSchema.future", (draft) => { draft.generatorConfig.schemaVersion = VASSAL_LIFE_MAP_GENERATOR_SCHEMA_VERSION + 1; }],
];
for (const [field, assign] of lifeSchemaCases) lifeCases.push([field, /schemaVersion/, schemaVariant(assign)]);

for (const [field, needle, make] of lifeCases) {
  rejectBoth(field, needle, (ctx) => {
    const value = make();
    return ctx.life.importJson(typeof value === "string" ? value : JSON.stringify(value));
  }, { lifeStatus: true });
}

check("library.nextId.higherSparse", () => {
  const library = baseLibrary();
  const nextId = largestProfileId(library) + 4;
  library.nextId = nextId;
  const parsed = parseDebugProfileLibraryJson(JSON.stringify(library));
  assert.equal(parsed.ok, true, parsed.errors?.join("; "));
  assert.equal(parsed.library.nextId, nextId);
});

mkdirSync("artifacts", { recursive: true });
writeFileSync(ARTIFACT, JSON.stringify({ command: COMMAND, passed, failures }, null, 2));
console.log(`${COMMAND} passed=${passed.length} failed=${failures.length} artifact=${ARTIFACT}`);
if (failures.length) {
  console.log(failures.map((entry) => entry.field).join("\n"));
  process.exitCode = 1;
}
