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
    } catch (_) {
      // Browser storage is optional for this development-only convenience.
    }
  }

  return {
    getSnapshot() {
      return { presetOptions: library.presets.map(({ id, name }) => ({ id, name })) };
    },
    loadPreset(presetId) {
      const preset = library.presets.find((entry) => entry.id === presetId);
      return preset ? { ok: true, preset } : { ok: false, reason: "invalidPresetId" };
    },
    savePreset(name, draft, { overwritePresetId = null } = {}) {
      const duplicate = findDebugDraftPresetByName(library, name);
      const result = saveDebugDraftPreset(
        library,
        { name, draft, presetId: overwritePresetId },
        libraryOptions
      );
      if (!result.ok) return {
        ...result,
        requiresOverwrite: result.reason === "duplicateName",
        existingPresetId: duplicate?.id ?? result.existingPresetId,
      };
      library = result.library;
      return { ...result, stored: persist() };
    },
    deletePreset(presetId) {
      const result = deleteDebugDraftPreset(library, presetId);
      if (!result.ok) return result;
      library = result.library;
      return { ...result, stored: persist() };
    },
  };
}
