/**
 * Public parser shape matrix for Map Lab, Life Map Lab, Vassal Lab presets,
 * and combined debug profile export/library. Supervisor runs this file.
 * Failures: artifacts/debug-parser-shape-properties-failures.json
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { createAuthoredMapLabDraft, parseMapLabDraftJson, serializeMapLabDraft, validateMapLabDraft } from "../src/model/map-lab-draft.js";
import { createAuthoredLifeMapLabDraft, parseLifeMapLabDraftJson, serializeLifeMapLabDraft, validateLifeMapLabDraft } from "../src/model/life-map-lab-draft.js";
import { canonicalizeVassalDebugDraft, VASSAL_DEBUG_DRAFT_KIND, validateVassalDebugDraft } from "../src/model/vassal-debug-draft.js";
import { createEmptyDebugDraftLibrary, parseDebugDraftLibraryJson, saveDebugDraftPreset, serializeDebugDraftLibrary, validateDebugDraftLibrary } from "../src/model/debug-draft-library.js";
import { createDebugProfileExport, createEmptyDebugProfileLibrary, parseDebugProfileExportJson, parseDebugProfileLibraryJson, saveDebugProfile, serializeDebugProfileExport, serializeDebugProfileLibrary, validateDebugProfileExport, validateDebugProfileLibrary } from "../src/model/debug-profile-library.js";
import { createStarterBootProfile } from "../src/model/starter-boot-profile.js";

const DELETE = Symbol("delete");
const SHAPES = [null, "unknown-id", [], -3, 1.25];
// Same option object as createVassalDebugPresetController: kind plus both callbacks.
const vassalOpts = {
  kind: VASSAL_DEBUG_DRAFT_KIND,
  validateDraft: validateVassalDebugDraft,
  canonicalizeDraft: canonicalizeVassalDebugDraft,
};
const failures = [];
const counts = { acceptedIdentical: 0, acceptedNormalized: 0, rejected: 0 };
const byApi = {};

const apis = {
  mapLab: {
    parse: parseMapLabDraftJson,
    payload: (result) => result.draft,
    validate: validateMapLabDraft,
    serialize: serializeMapLabDraft,
  },
  lifeMapLab: {
    parse: parseLifeMapLabDraftJson,
    payload: (result) => result.draft,
    validate: validateLifeMapLabDraft,
    serialize: serializeLifeMapLabDraft,
  },
  vassalLibrary: {
    parse: (text) => parseDebugDraftLibraryJson(text, vassalOpts),
    payload: (result) => result.library,
    validate: (value) => validateDebugDraftLibrary(value, vassalOpts),
    serialize: (value) => serializeDebugDraftLibrary(value, vassalOpts),
  },
  profileExport: {
    parse: parseDebugProfileExportJson,
    payload: (result) => result.value,
    validate: validateDebugProfileExport,
    serialize: (value) => serializeDebugProfileExport(value.name, value.profile),
  },
  profileLibrary: {
    parse: parseDebugProfileLibraryJson,
    payload: (result) => result.library,
    validate: validateDebugProfileLibrary,
    serialize: serializeDebugProfileLibrary,
  },
};

function note(detail) {
  failures.push(detail);
}

function bump(api, bucket) {
  byApi[api] ??= { acceptedIdentical: 0, acceptedNormalized: 0, rejected: 0 };
  byApi[api][bucket] += 1;
  counts[bucket] += 1;
}

function cloneSet(root, path, value) {
  const next = structuredClone(root);
  let cursor = next;
  for (let index = 0; index < path.length - 1; index += 1) {
    cursor = cursor?.[path[index]];
    if (cursor == null || typeof cursor !== "object") return null;
  }
  const leaf = path[path.length - 1];
  if (value === DELETE) delete cursor[leaf];
  else cursor[leaf] = structuredClone(value);
  return next;
}

function jsonOnly(value) {
  let text;
  try {
    text = JSON.stringify(value);
    if (typeof text !== "string") return false;
    return JSON.stringify(JSON.parse(text)) === text;
  } catch {
    return false;
  }
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function runCase(apiName, document, path, value, expectation, fieldHint) {
  const api = apis[apiName];
  const shown = value === DELETE ? "(deleted)" : value;
  const label = path.length ? path.join(".") : "(root)";
  const mutated = path.length ? cloneSet(document, path, value) : value;
  if (mutated == null) {
    note({ api: apiName, path: label, expectation, reason: "parent missing before mutation" });
    return;
  }
  let text;
  try {
    text = JSON.stringify(mutated);
  } catch (error) {
    note({ api: apiName, path: label, expectation, reason: `input not JSON: ${error.message}` });
    return;
  }
  let parsed;
  try {
    parsed = api.parse(text);
  } catch (error) {
    note({ api: apiName, path: label, value: shown, expectation, reason: `parser threw: ${error.message}` });
    return;
  }
  const errors = parsed?.errors ?? [];
  const useful = parsed?.ok === false && Array.isArray(errors) && errors.length > 0
    && errors.every((entry) => typeof entry === "string" && entry.length > 0);
  if (parsed?.ok !== true) {
    if (!useful || (fieldHint && !errors.some((entry) => entry.includes(fieldHint)))) {
      note({ api: apiName, path: label, value: shown, expectation, errors, reason: "rejected without a useful field error" });
      return;
    }
    if (expectation === "accept" || expectation === "normalize") {
      note({ api: apiName, path: label, value: shown, expectation, errors, reason: "required acceptance was rejected" });
      return;
    }
    bump(apiName, "rejected");
    return;
  }
  if (expectation === "reject") {
    note({ api: apiName, path: label, value: shown, expectation, reason: "required rejection was accepted" });
    return;
  }
  const payload = api.payload(parsed);
  let validation;
  try {
    validation = api.validate(payload);
  } catch (error) {
    note({ api: apiName, path: label, value: shown, reason: `validator threw: ${error.message}` });
    return;
  }
  if (!validation?.ok) {
    note({ api: apiName, path: label, value: shown, errors: validation?.errors, reason: "accepted payload failed its public validator" });
    return;
  }
  if (!jsonOnly(payload)) {
    note({ api: apiName, path: label, value: shown, reason: "accepted payload is not plain JSON" });
    return;
  }
  // Serialize may normalize (trimmed export names, canonical drafts). The raw
  // accepted payload need not equal that text; the next cycle must.
  let stable;
  try {
    const firstCycle = api.parse(api.serialize(payload));
    const firstCanonical = firstCycle?.ok ? api.payload(firstCycle) : null;
    const secondCycle = firstCanonical ? api.parse(api.serialize(firstCanonical)) : null;
    if (!firstCycle?.ok || !secondCycle?.ok || !sameJson(api.payload(secondCycle), firstCanonical) || !api.validate(firstCanonical)?.ok || !jsonOnly(firstCanonical)) {
      note({ api: apiName, path: label, value: shown, errors: firstCycle?.errors ?? secondCycle?.errors, reason: "accepted payload was not idempotent across serialize/parse" });
      return;
    }
    stable = firstCanonical;
  } catch (error) {
    note({ api: apiName, path: label, value: shown, reason: `reserialize threw: ${error.message}` });
    return;
  }
  const normalized = !sameJson(payload, mutated) || !sameJson(stable, payload);
  if (expectation === "normalize" && !normalized) {
    note({ api: apiName, path: label, value: shown, reason: "expected canonical normalization did not change the document" });
    return;
  }
  if (expectation === "accept" && normalized) {
    note({ api: apiName, path: label, value: shown, reason: "positive control was normalized" });
    return;
  }
  bump(apiName, normalized ? "acceptedNormalized" : "acceptedIdentical");
}

function must(condition, reason) {
  if (!condition) note({ api: "setup", reason });
}

const starter = createStarterBootProfile();
const mapDoc = starter.mapLab;
const lifeDoc = starter.lifeMapLab;
let detailedIndex = mapDoc.regions.findIndex((region) => region.detailedSettlementEnabled && region.detailedState?.populationByClass);
must(detailedIndex >= 0, "starter map has no detailed settlement to mutate");
must(mapDoc.schemaVersion === 8 && lifeDoc.schemaVersion === 2, "controller drafts are not current schema v8/v2");
must(lifeDoc.generatorConfig?.schemaVersion === 5 && lifeDoc.generatorConfig?.weights?.early, "life generator is not current schema v5");
must(starter.gameSettings?.schemaVersion === 17 && starter.launch?.startMode === "randomRoad", "profile settings/launch are not the current contract");

const vassalDraft = {
  schemaVersion: 5,
  locationRegionId: mapDoc.regions[0].id,
  age: 22,
  prestige: 11,
  cunning: 1,
  wisdom: 1,
  effectiveness: 1,
  intelligence: 1,
  candidateSlot: 1,
};
let vassalLibrary = createEmptyDebugDraftLibrary(VASSAL_DEBUG_DRAFT_KIND);
for (const name of ["North watch", "South watch"]) {
  const saved = saveDebugDraftPreset(vassalLibrary, { name, draft: vassalDraft }, vassalOpts);
  must(saved.ok === true, `vassal preset save failed: ${saved.reason ?? saved.errors?.[0]}`);
  vassalLibrary = saved.ok ? saved.library : vassalLibrary;
}
must(vassalLibrary.schemaVersion === 1 && vassalLibrary.kind === VASSAL_DEBUG_DRAFT_KIND && vassalLibrary.presets?.length === 2, "vassal library baseline is incomplete");

const exportDoc = createDebugProfileExport("River workshop", starter);
let profileLibrary = createEmptyDebugProfileLibrary();
for (const name of ["River workshop", "Delta workshop"]) {
  const saved = saveDebugProfile(profileLibrary, name, starter);
  must(saved.ok === true, `profile save failed: ${saved.reason ?? saved.errors?.[0]}`);
  profileLibrary = saved.ok ? saved.library : profileLibrary;
}
must(exportDoc.schemaVersion === 3 && exportDoc.kind === "civsurvivor.debugProfile", "profile export header drifted");
must(profileLibrary.schemaVersion === 3 && profileLibrary.profiles?.length === 2, "profile library baseline is incomplete");

const baselines = { mapLab: mapDoc, lifeMapLab: lifeDoc, vassalLibrary, profileExport: exportDoc, profileLibrary };
for (const [apiName, document] of Object.entries(baselines)) {
  let parsed;
  try {
    parsed = apis[apiName].parse(apis[apiName].serialize(document));
  } catch (error) {
    must(false, `${apiName} roundtrip threw: ${error.message}`);
    continue;
  }
  must(parsed.ok === true, `${apiName} authored/controller roundtrip was rejected: ${parsed.errors?.[0] ?? ""}`);
  if (!parsed.ok) continue;
  const payload = apis[apiName].payload(parsed);
  const again = apis[apiName].parse(apis[apiName].serialize(payload));
  must(again.ok === true && sameJson(apis[apiName].payload(again), payload), `${apiName} roundtrip was not idempotent`);
  must(payload.schemaVersion === document.schemaVersion, `${apiName} roundtrip dropped schemaVersion`);
  baselines[apiName] = payload;
}
const authoredMap = createAuthoredMapLabDraft();
const authoredLife = createAuthoredLifeMapLabDraft();
must(parseMapLabDraftJson(serializeMapLabDraft(authoredMap)).ok === true, "authored map roundtrip failed");
must(sameJson(parseMapLabDraftJson(serializeMapLabDraft(authoredMap)).draft, authoredMap), "authored map roundtrip changed fields");
must(parseLifeMapLabDraftJson(serializeLifeMapLabDraft(authoredLife)).ok === true, "authored life roundtrip failed");
must(sameJson(parseLifeMapLabDraftJson(serializeLifeMapLabDraft(authoredLife)).draft, authoredLife), "authored life roundtrip changed fields");

detailedIndex = baselines.mapLab.regions.findIndex((region) => region.detailedSettlementEnabled && region.detailedState?.populationByClass);
must(detailedIndex >= 0, "canonical map dropped the detailed settlement");
const otherColour = baselines.mapLab.regions[0].colour === "black" ? "green" : "black";
const probes = [
  ["mapLab", ["worldDefinitionId"]],
  ["mapLab", ["regions", 0, "colour"]],
  ["mapLab", ["regions", 0, "controller"]],
  ["mapLab", ["regions", 0, "structureCapacity"]],
  ["mapLab", ["regions", 0, "randomizeStructureCapacity"]],
  ["mapLab", ["regions", 0, "detailedSettlementEnabled"]],
  ["mapLab", ["connections", 0, "regionAId"]],
  ["lifeMapLab", ["previewSeed"]],
  ["lifeMapLab", ["generatorConfig", "laneCount"]],
  ["lifeMapLab", ["generatorConfig", "layoutSmoothing"]],
  ["lifeMapLab", ["generatorConfig", "minimumNodeGap"]],
  ["lifeMapLab", ["generatorConfig", "nonRepeatFamilyIds"]],
  ["lifeMapLab", ["generatorConfig", "weights", "early"]],
  ["vassalLibrary", ["presets", 0, "draft", "schemaVersion"]],
  ["vassalLibrary", ["presets", 0, "draft", "locationRegionId"]],
  ["vassalLibrary", ["presets", 0, "draft", "age"]],
  ["vassalLibrary", ["presets", 0, "draft", "candidateSlot"]],
  ["vassalLibrary", ["presets", 0, "draft", "intelligence"]],
  ["profileExport", ["kind"]],
  ["profileExport", ["schemaVersion"]],
  ["profileExport", ["name"]],
  ["profileExport", ["profile", "activePage"]],
  ["profileExport", ["profile", "launch", "startMode"]],
  ["profileExport", ["profile", "launch", "neutralSettlements"]],
  ["profileLibrary", ["schemaVersion"]],
  ["profileLibrary", ["nextId"]],
  ["profileLibrary", ["profiles", 0, "id"]],
  ["profileLibrary", ["profiles", 0, "name"]],
];

const cases = [];
for (const [apiName, path] of probes) {
  for (const value of SHAPES) cases.push([apiName, baselines[apiName], path, value, "probe", null]);
}
const rejects = [
  ["mapLab", ["schemaVersion"], 7, "schemaVersion"],
  ["mapLab", ["schemaVersion"], 9, "schemaVersion"],
  ["mapLab", ["schemaVersion"], true, "schemaVersion"],
  ["lifeMapLab", ["schemaVersion"], 1, "schemaVersion"],
  ["lifeMapLab", ["schemaVersion"], 3, "schemaVersion"],
  ["lifeMapLab", ["schemaVersion"], false, "schemaVersion"],
  ["lifeMapLab", ["generatorConfig", "schemaVersion"], 4, "schemaVersion"],
  ["lifeMapLab", ["generatorConfig", "schemaVersion"], 6, "schemaVersion"],
  ["lifeMapLab", ["generatorConfig", "schemaVersion"], "5", "schemaVersion"],
  ["vassalLibrary", ["schemaVersion"], 0, "schemaVersion"],
  ["vassalLibrary", ["schemaVersion"], 2, "schemaVersion"],
  ["vassalLibrary", ["presets", 0, "draft", "schemaVersion"], 4, "schemaVersion"],
  ["vassalLibrary", ["presets", 0, "draft", "schemaVersion"], 6, "schemaVersion"],
  ["vassalLibrary", ["presets", 0, "draft", "schemaVersion"], "5", "schemaVersion"],
  ["profileExport", ["schemaVersion"], 2, "schemaVersion"],
  ["profileExport", ["schemaVersion"], 4, "schemaVersion"],
  ["profileExport", ["schemaVersion"], true, "schemaVersion"],
  ["profileExport", ["profile", "gameSettings", "schemaVersion"], 16, "schemaVersion"],
  ["profileExport", ["profile", "gameSettings", "schemaVersion"], 18, "schemaVersion"],
  ["profileExport", ["profile", "gameSettings", "schemaVersion"], null, "schemaVersion"],
  ["profileLibrary", ["schemaVersion"], 2, "schemaVersion"],
  ["profileLibrary", ["schemaVersion"], 4, "schemaVersion"],
  ["vassalLibrary", ["presets", 1, "id"], "local-1", "id"],
  ["profileLibrary", ["profiles", 1, "id"], profileLibrary.profiles[0].id, "id"],
  ["vassalLibrary", ["nextId"], 1, "nextId"],
  ["profileLibrary", ["nextId"], 1, "nextId"],
  ["mapLab", ["regions", detailedIndex, "detailedState", "practiceSlots"], DELETE, "practiceSlots"],
  ["profileExport", ["profile", "launch"], DELETE, "launch"],
  ["profileExport", ["profile", "mapLab"], DELETE, "mapLab"],
  ["profileExport", ["profile", "gameSettings", "values"], DELETE, "values"],
  ["vassalLibrary", ["presets", 0, "draft"], DELETE, "draft"],
  ["profileLibrary", ["profiles", 0, "profile"], DELETE, "profile"],
];
for (const [apiName, path, value, hint] of rejects) cases.push([apiName, baselines[apiName], path, value, "reject", hint]);

cases.push(
  ["mapLab", baselines.mapLab, ["regions", 0, "colour"], otherColour, "accept", null],
  ["mapLab", baselines.mapLab, ["regions", 0, "controller"], "player", "accept", null],
  ["lifeMapLab", baselines.lifeMapLab, ["previewSeed"], 2, "accept", null],
  ["lifeMapLab", baselines.lifeMapLab, ["generatorConfig", "layoutSmoothing"], 0.25, "accept", null],
  ["lifeMapLab", baselines.lifeMapLab, ["generatorConfig", "weights"], DELETE, "normalize", null],
  ["lifeMapLab", baselines.lifeMapLab, ["generatorConfig", "laneCount"], null, "normalize", null],
  ["vassalLibrary", baselines.vassalLibrary, ["presets", 0, "draft", "candidateSlot"], 2, "accept", null],
  ["vassalLibrary", baselines.vassalLibrary, ["presets", 0, "draft", "age"], 22.5, "accept", null],
  ["profileExport", baselines.profileExport, ["profile", "activePage"], "lifeMapLab", "accept", null],
  ["profileExport", baselines.profileExport, ["name"], "  River workshop  ", "normalize", null],
  ["profileLibrary", baselines.profileLibrary, ["profiles", 1, "name"], "Marsh workshop", "accept", null],
  ["mapLab", baselines.mapLab, ["regions", detailedIndex, "detailedState", "populationByClass"], DELETE, "probe", null],
  ["lifeMapLab", baselines.lifeMapLab, ["generatorConfig", "weights", "early"], DELETE, "probe", null],
  ["profileExport", baselines.profileExport, ["profile", "lifeMapLab", "generatorConfig"], DELETE, "probe", null],
);

must(cases.length >= 100 && cases.length <= 200, `case count ${cases.length} outside 100-200`);

if (failures.length === 0) {
  for (const entry of cases) runCase(...entry);
  for (const [apiName, document] of Object.entries(baselines)) {
    const parsed = apis[apiName].parse(JSON.stringify(document));
    if (!parsed.ok || !sameJson(apis[apiName].payload(parsed), document)) {
      note({ api: apiName, reason: "baseline document changed after mutations" });
    }
  }
  for (const name of Object.keys(apis)) {
    const row = byApi[name];
    if (!row?.acceptedIdentical && !row?.acceptedNormalized) note({ api: name, reason: "no accepted document; parser path was not reached" });
    if (!row?.rejected) note({ api: name, reason: "no rejected document" });
  }
}

if (failures.length > 0) {
  const artifact = "artifacts/debug-parser-shape-properties-failures.json";
  mkdirSync("artifacts", { recursive: true });
  writeFileSync(artifact, JSON.stringify({ failures: failures.slice(0, 40), counts, byApi, caseCount: cases.length }, null, 2));
  console.log(`debug-parser-shape-properties: FAIL ${failures.length}`);
  for (const failure of failures.slice(0, 12)) {
    console.log(`${failure.api} ${failure.path ?? "-"} ${failure.reason} ${failure.errors?.[0] ?? ""}`);
  }
  console.log(artifact);
  process.exit(1);
}

console.log(`debug-parser-shape-properties: ok cases=${cases.length} acceptedIdentical=${counts.acceptedIdentical} acceptedNormalized=${counts.acceptedNormalized} rejected=${counts.rejected} apis=${Object.keys(apis).join(",")}`);
