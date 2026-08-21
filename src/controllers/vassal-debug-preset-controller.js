import {
  createEmptyDebugDraftLibrary,
  deleteDebugDraftPreset,
  findDebugDraftPresetByName,
  parseDebugDraftLibraryJson,
  saveDebugDraftPreset,
  serializeDebugDraftLibrary,
} from "../model/debug-draft-library.js";
import {
  canonicalizeVassalDebugDraft,
  VASSAL_DEBUG_DRAFT_KIND,
  VASSAL_DEBUG_PRESETS_STORAGE_KEY,
  validateVassalDebugDraft,
} from "../model/vassal-debug-draft.js";

function safeStorage() {
  try {
    return globalThis?.localStorage ?? null;
  } catch (_) {
    return null;
  }
}

const libraryOptions = Object.freeze({
  kind: VASSAL_DEBUG_DRAFT_KIND,
  validateDraft: validateVassalDebugDraft,
  canonicalizeDraft: canonicalizeVassalDebugDraft,
});

export function createVassalDebugPresetController() {
  let library = createEmptyDebugDraftLibrary(VASSAL_DEBUG_DRAFT_KIND);
  let currentDraft = null;
  let selectedPresetId = null;
  const currentDraftStorageKey = "civsurvivor.debugVassalDraft.v5";

  function persist() {
    const storage = safeStorage();
    if (!storage) return false;
    try {
      storage.setItem(
        VASSAL_DEBUG_PRESETS_STORAGE_KEY,
        serializeDebugDraftLibrary(library, libraryOptions)
      );
      return true;
    } catch (_) {
      return false;
    }
  }

  const storage = safeStorage();
  if (storage) {
    try {
      const text = storage.getItem(VASSAL_DEBUG_PRESETS_STORAGE_KEY);
      if (text) {
        const parsed = parseDebugDraftLibraryJson(text, libraryOptions);
        if (parsed.ok) library = parsed.library;
      }
      const currentText = storage.getItem(currentDraftStorageKey);
      if (currentText) {
        const parsed = JSON.parse(currentText);
        if (validateVassalDebugDraft(parsed).ok) currentDraft = canonicalizeVassalDebugDraft(parsed);
      }
    } catch (_) {
      // Browser storage is optional for this development-only convenience.
    }
  }

  function setCurrentDraft(draft, { presetId = null } = {}) {
    const validation = validateVassalDebugDraft(draft);
    if (!validation.ok) return { ok: false, reason: "invalidDraft", errors: validation.errors };
    currentDraft = canonicalizeVassalDebugDraft(draft);
    selectedPresetId = presetId;
    try {
      safeStorage()?.setItem(currentDraftStorageKey, JSON.stringify(currentDraft));
    } catch (_) {}
    return { ok: true, draft: currentDraft };
  }

  return {
    getSnapshot() {
      return {
        currentDraft,
        selectedPresetId,
        presetOptions: library.presets.map(({ id, name }) => ({ id, name })),
      };
    },
    setCurrentDraft,
    loadPreset(presetId) {
      const preset = library.presets.find((entry) => entry.id === presetId);
      if (!preset) return { ok: false, reason: "invalidPresetId" };
      setCurrentDraft(preset.draft, { presetId: preset.id });
      return { ok: true, preset };
    },
    savePreset(name, draft) {
      const duplicate = findDebugDraftPresetByName(library, name);
      // Names define save identity. Do not let the currently selected preset
      // turn a uniquely named Vassal draft into an overwrite.
      const presetId = duplicate?.id ?? null;
      const result = saveDebugDraftPreset(
        library,
        { name, draft, presetId },
        libraryOptions
      );
      if (!result.ok) return result;
      library = result.library;
      setCurrentDraft(result.preset.draft, { presetId: result.preset.id });
      return { ...result, stored: persist() };
    },
    deletePreset(presetId) {
      const result = deleteDebugDraftPreset(library, presetId);
      if (!result.ok) return result;
      library = result.library;
      if (selectedPresetId === presetId) selectedPresetId = null;
      return { ...result, stored: persist() };
    },
  };
}
