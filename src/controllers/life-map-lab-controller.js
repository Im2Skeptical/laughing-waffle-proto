import {
  LIFE_MAP_LAB_DRAFT_KIND,
  LIFE_MAP_LAB_PRESETS_STORAGE_KEY,
  LIFE_MAP_LAB_STORAGE_KEY,
  canonicalizeLifeMapLabDraft,
  createAuthoredLifeMapLabDraft,
  parseLifeMapLabDraftJson,
  serializeLifeMapLabDraft,
  validateLifeMapLabDraft,
} from "../model/life-map-lab-draft.js";
import {
  createEmptyDebugDraftLibrary,
  deleteDebugDraftPreset,
  findDebugDraftPresetByName,
  parseDebugDraftLibraryJson,
  saveDebugDraftPreset,
  serializeDebugDraftLibrary,
} from "../model/debug-draft-library.js";
import { createRng } from "../model/rng.js";
import { generateVassalLifeMap } from "../model/vassal-life-map-generator.js";

const clone = (value) => JSON.parse(JSON.stringify(value));

function safeStorage() {
  try { return globalThis?.localStorage ?? null; } catch (_) { return null; }
}

function setAtPath(value, path, nextValue) {
  const next = clone(value);
  let cursor = next;
  for (let index = 0; index < path.length - 1; index += 1) cursor = cursor[path[index]];
  cursor[path.at(-1)] = nextValue;
  return next;
}

export function createLifeMapLabController() {
  let draft = createAuthoredLifeMapLabDraft();
  let library = createEmptyDebugDraftLibrary(LIFE_MAP_LAB_DRAFT_KIND);
  let selectedPresetId = "authored";
  let status = { message: "", tone: "info" };
  const listeners = new Set();
  const storage = safeStorage();
  const libraryOptions = {
    kind: LIFE_MAP_LAB_DRAFT_KIND,
    validateDraft: validateLifeMapLabDraft,
    canonicalizeDraft: canonicalizeLifeMapLabDraft,
  };

  function notify() { for (const listener of listeners) listener(getSnapshot()); }
  function persistDraft() {
    try { storage?.setItem(LIFE_MAP_LAB_STORAGE_KEY, serializeLifeMapLabDraft(draft)); return !!storage; }
    catch (_) { return false; }
  }
  function persistLibrary() {
    try {
      storage?.setItem(LIFE_MAP_LAB_PRESETS_STORAGE_KEY, serializeDebugDraftLibrary(library, libraryOptions));
      return !!storage;
    } catch (_) { return false; }
  }
  function preview() {
    return generateVassalLifeMap(draft.generatorConfig, createRng(draft.previewSeed), {
      graphId: `preview-life-map-${draft.previewSeed}`,
      generationSeed: draft.previewSeed,
    });
  }
  function selectedBaseline() {
    if (selectedPresetId === "authored") return createAuthoredLifeMapLabDraft();
    return library.presets.find((entry) => entry.id === selectedPresetId)?.draft ?? null;
  }
  function getSnapshot() {
    const generated = preview();
    const baseline = selectedBaseline();
    return {
      draft,
      preview: generated.ok ? generated.graph : null,
      routeTraces: generated.ok ? generated.routeTraces : [],
      diagnostics: generated.ok ? [] : generated.errors ?? [generated.reason],
      selectedPresetId,
      selectedPresetDirty: !baseline || serializeLifeMapLabDraft(baseline) !== serializeLifeMapLabDraft(draft),
      presetOptions: library.presets.map(({ id, name }) => ({ id, name })),
      status,
    };
  }
  function replaceDraft(value, message, presetId = null) {
    const validation = validateLifeMapLabDraft(value);
    if (!validation.ok) {
      status = { message: validation.errors[0], tone: "error" };
      notify();
      return { ok: false, reason: "invalidDraft", errors: validation.errors };
    }
    draft = canonicalizeLifeMapLabDraft(value);
    selectedPresetId = presetId;
    status = { message, tone: "ok" };
    persistDraft();
    notify();
    return { ok: true, draft };
  }
  try {
    const storedDraft = storage?.getItem(LIFE_MAP_LAB_STORAGE_KEY);
    if (storedDraft) {
      const parsed = parseLifeMapLabDraftJson(storedDraft);
      if (parsed.ok) { draft = parsed.draft; selectedPresetId = null; }
    }
    const storedLibrary = storage?.getItem(LIFE_MAP_LAB_PRESETS_STORAGE_KEY);
    if (storedLibrary) {
      const parsed = parseDebugDraftLibraryJson(storedLibrary, libraryOptions);
      if (parsed.ok) library = parsed.library;
    }
  } catch (_) {
    status = { message: "Stored Life Map Lab data could not be read.", tone: "warning" };
  }

  return {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot,
    getGeneratorConfig: () => clone(draft.generatorConfig),
    replaceDraftFromProfile(value) { return replaceDraft(value, "Loaded combined debug profile."); },
    updateValue(path, value) {
      return replaceDraft(setAtPath(draft, path, value), "Life Map generator updated.");
    },
    setPreviewSeed(value) {
      return replaceDraft({ ...draft, previewSeed: Math.floor(value) }, "Preview seed updated.");
    },
    nextPreviewSeed() {
      const next = draft.previewSeed >= 2147483647 ? -2147483648 : draft.previewSeed + 1;
      return replaceDraft({ ...draft, previewSeed: next }, "Generated next deterministic preview.");
    },
    regenerate() { status = { message: `Regenerated seed ${draft.previewSeed}.`, tone: "ok" }; notify(); },
    reset() { return replaceDraft(createAuthoredLifeMapLabDraft(), "Loaded authored generator.", "authored"); },
    loadPreset(presetId) {
      if (presetId === "authored") return this.reset();
      const preset = library.presets.find((entry) => entry.id === presetId);
      return preset
        ? replaceDraft(preset.draft, `Loaded “${preset.name}”.`, preset.id)
        : { ok: false, reason: "invalidPresetId" };
    },
    savePreset(name) {
      const existing = findDebugDraftPresetByName(library, name);
      const result = saveDebugDraftPreset(library, {
        name, draft, presetId: existing?.id ?? null,
      }, libraryOptions);
      if (!result.ok) { status = { message: "Preset could not be saved.", tone: "error" }; notify(); return result; }
      library = result.library;
      selectedPresetId = result.preset.id;
      const stored = persistLibrary();
      status = { message: stored ? `Saved “${result.preset.name}”.` : "Preset could not be stored.", tone: stored ? "ok" : "warning" };
      notify();
      return { ...result, stored };
    },
    deletePreset(presetId) {
      const result = deleteDebugDraftPreset(library, presetId);
      if (!result.ok) return result;
      library = result.library;
      if (selectedPresetId === presetId) selectedPresetId = null;
      persistLibrary();
      status = { message: `Deleted “${result.preset.name}”.`, tone: "ok" };
      notify();
      return result;
    },
    exportJson: () => serializeLifeMapLabDraft(draft),
    importJson(text) {
      const parsed = parseLifeMapLabDraftJson(text);
      return parsed.ok
        ? replaceDraft(parsed.draft, "Imported Life Map Lab JSON.")
        : (status = { message: `Import failed: ${parsed.errors[0]}`, tone: "error" }, notify(), parsed);
    },
  };
}
