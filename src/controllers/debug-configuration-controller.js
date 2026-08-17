import { setupDefs } from "../defs/gamesettings/scenarios-defs.js";
import { createInitialState } from "../model/init.js";
import {
  GAMEPIECES_DRAFT_KIND,
  GAME_SETTINGS_DRAFT_KIND,
  canonicalizeGameConfig,
  canonicalizeGamepiecesDraft,
  canonicalizeGameSettingsDraft,
  createAuthoredGamepiecesDraft,
  createAuthoredGameSettingsDraft,
  getAtPath,
  parseDebugDraftJson,
  serializeDebugDraft,
  setAtPath,
  validateGamepiecesDraft,
  validateGameSettingsDraft,
} from "../model/game-config.js";
import {
  createEmptyDebugDraftLibrary,
  deleteDebugDraftPreset,
  findDebugDraftPresetByName,
  parseDebugDraftLibraryJson,
  saveDebugDraftPreset,
  serializeDebugDraftLibrary,
} from "../model/debug-draft-library.js";
import { canonicalizeMapLabDraft } from "../model/map-lab-draft.js";

const clone = (value) => JSON.parse(JSON.stringify(value));

const CONFIG_BY_KIND = Object.freeze({
  [GAME_SETTINGS_DRAFT_KIND]: Object.freeze({
    createAuthored: createAuthoredGameSettingsDraft,
    canonicalize: canonicalizeGameSettingsDraft,
    validate: validateGameSettingsDraft,
    draftStorageKey: "civsurvivor.debugGameSettingsDraft.v7",
    libraryStorageKey: "civsurvivor.debugGameSettingsPresets.v7",
    label: "game settings",
  }),
  [GAMEPIECES_DRAFT_KIND]: Object.freeze({
    createAuthored: createAuthoredGamepiecesDraft,
    canonicalize: canonicalizeGamepiecesDraft,
    validate: validateGamepiecesDraft,
    draftStorageKey: "civsurvivor.debugGamepiecesDraft.v7",
    libraryStorageKey: "civsurvivor.debugGamepiecePresets.v7",
    label: "gamepieces",
  }),
});

function safeStorage() {
  try {
    return globalThis?.localStorage ?? null;
  } catch (_) {
    return null;
  }
}

export function createDebugConfigurationController({
  runner,
  mapLabController,
  setupId = "devPlaytesting01",
  onApplied,
} = {}) {
  const authoredSetup = setupDefs[setupId];
  const listeners = new Set();
  const states = Object.fromEntries(
    Object.entries(CONFIG_BY_KIND).map(([kind, config]) => [
      kind,
      {
        draft: config.createAuthored(),
        library: createEmptyDebugDraftLibrary(kind),
        selectedPresetId: null,
        status: { message: "", tone: "info" },
      },
    ])
  );

  function notify(kind) {
    for (const listener of listeners) listener(kind, getSnapshot(kind));
  }

  function setStatus(kind, message, tone = "info") {
    states[kind].status = { message, tone };
  }

  function selectedBaseline(kind) {
    const state = states[kind];
    if (state.selectedPresetId === "authored") return CONFIG_BY_KIND[kind].createAuthored();
    return state.library.presets.find((entry) => entry.id === state.selectedPresetId)?.draft ?? null;
  }

  function isDirty(kind) {
    const baseline = selectedBaseline(kind);
    if (!baseline) return true;
    return serializeDebugDraft(baseline, kind) !== serializeDebugDraft(states[kind].draft, kind);
  }

  function getSnapshot(kind) {
    const state = states[kind];
    return {
      kind,
      draft: state.draft,
      selectedPresetId: state.selectedPresetId,
      selectedPresetDirty: isDirty(kind),
      presetOptions: state.library.presets.map((entry) => ({ id: entry.id, name: entry.name })),
      status: state.status,
    };
  }

  function persistDraft(kind) {
    const storage = safeStorage();
    if (!storage) return false;
    try {
      storage.setItem(
        CONFIG_BY_KIND[kind].draftStorageKey,
        serializeDebugDraft(states[kind].draft, kind)
      );
      return true;
    } catch (_) {
      return false;
    }
  }

  function libraryOptions(kind) {
    const config = CONFIG_BY_KIND[kind];
    return {
      kind,
      validateDraft: config.validate,
      canonicalizeDraft: config.canonicalize,
    };
  }

  function persistLibrary(kind) {
    const storage = safeStorage();
    if (!storage) return false;
    try {
      storage.setItem(
        CONFIG_BY_KIND[kind].libraryStorageKey,
        serializeDebugDraftLibrary(states[kind].library, libraryOptions(kind))
      );
      return true;
    } catch (_) {
      return false;
    }
  }

  function replaceDraft(kind, draft, message, selectedPresetId = null) {
    states[kind].draft = CONFIG_BY_KIND[kind].canonicalize(draft);
    states[kind].selectedPresetId = selectedPresetId;
    setStatus(kind, message, "ok");
    persistDraft(kind);
    notify(kind);
    return { ok: true, draft: states[kind].draft };
  }

  function loadStored() {
    const storage = safeStorage();
    if (!storage) return;
    for (const [kind, config] of Object.entries(CONFIG_BY_KIND)) {
      try {
        const draftText = storage.getItem(config.draftStorageKey);
        if (draftText) {
          const parsed = parseDebugDraftJson(draftText, kind);
          if (parsed.ok) states[kind].draft = parsed.draft;
          else setStatus(kind, `Stored draft ignored: ${parsed.errors[0]}`, "warning");
        }
        const libraryText = storage.getItem(config.libraryStorageKey);
        if (libraryText) {
          const parsed = parseDebugDraftLibraryJson(libraryText, libraryOptions(kind));
          if (parsed.ok) states[kind].library = parsed.library;
          else setStatus(kind, `Stored presets ignored: ${parsed.errors[0]}`, "warning");
        }
      } catch (_) {
        setStatus(kind, "Browser storage could not be read.", "warning");
      }
    }
  }

  loadStored();

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot,
    replaceDraftsFromProfile({ gameSettings, gamepieces } = {}) {
      const drafts = {
        [GAME_SETTINGS_DRAFT_KIND]: gameSettings,
        [GAMEPIECES_DRAFT_KIND]: gamepieces,
      };
      for (const [kind, draft] of Object.entries(drafts)) {
        const validation = CONFIG_BY_KIND[kind].validate(draft);
        if (!validation.ok) {
          return { ok: false, reason: "invalidDraft", kind, errors: validation.errors };
        }
      }
      for (const [kind, draft] of Object.entries(drafts)) {
        replaceDraft(kind, draft, "Loaded combined debug profile.");
      }
      return { ok: true };
    },
    getGameConfig() {
      return canonicalizeGameConfig({
        settings: states[GAME_SETTINGS_DRAFT_KIND].draft,
        gamepieces: states[GAMEPIECES_DRAFT_KIND].draft,
      });
    },
    updateValue(kind, path, value) {
      if (!CONFIG_BY_KIND[kind] || !Array.isArray(path)) {
        return { ok: false, reason: "invalidEdit" };
      }
      const next = setAtPath(states[kind].draft, path, value);
      const validation = CONFIG_BY_KIND[kind].validate(next);
      if (!validation.ok) {
        setStatus(kind, validation.errors[0], "error");
        notify(kind);
        return { ok: false, reason: "invalidDraft", errors: validation.errors };
      }
      states[kind].draft = CONFIG_BY_KIND[kind].canonicalize(next);
      persistDraft(kind);
      setStatus(kind, `${CONFIG_BY_KIND[kind].label} updated.`, "ok");
      notify(kind);
      return { ok: true, value: getAtPath(states[kind].draft, path) };
    },
    reset(kind) {
      return replaceDraft(kind, CONFIG_BY_KIND[kind].createAuthored(), "Loaded authored values.", "authored");
    },
    loadPreset(kind, presetId) {
      if (presetId === "authored") return this.reset(kind);
      const preset = states[kind].library.presets.find((entry) => entry.id === presetId);
      if (!preset) return { ok: false, reason: "invalidPresetId" };
      return replaceDraft(kind, preset.draft, `Loaded "${preset.name}".`, preset.id);
    },
    savePreset(kind, name, { overwritePresetId = null } = {}) {
      const sameName = findDebugDraftPresetByName(states[kind].library, name);
      let presetId = overwritePresetId;
      if (!presetId && sameName?.id === states[kind].selectedPresetId) presetId = sameName.id;
      const result = saveDebugDraftPreset(
        states[kind].library,
        { name, draft: states[kind].draft, presetId },
        libraryOptions(kind)
      );
      if (!result.ok) return {
        ...result,
        requiresOverwrite: result.reason === "duplicateName",
      };
      states[kind].library = result.library;
      states[kind].selectedPresetId = result.preset.id;
      const stored = persistLibrary(kind);
      setStatus(kind, stored ? `Saved "${result.preset.name}".` : "Preset could not be stored.", stored ? "ok" : "warning");
      notify(kind);
      return { ...result, stored };
    },
    deletePreset(kind, presetId) {
      const result = deleteDebugDraftPreset(states[kind].library, presetId);
      if (!result.ok) return result;
      states[kind].library = result.library;
      if (states[kind].selectedPresetId === presetId) states[kind].selectedPresetId = null;
      const stored = persistLibrary(kind);
      setStatus(kind, `Deleted "${result.preset.name}".`, stored ? "ok" : "warning");
      notify(kind);
      return { ...result, stored };
    },
    exportJson(kind) {
      return serializeDebugDraft(states[kind].draft, kind);
    },
    importJson(kind, text) {
      const parsed = parseDebugDraftJson(text, kind);
      if (!parsed.ok) {
        setStatus(kind, `Import failed: ${parsed.errors.join(" | ")}`, "error");
        notify(kind);
        return parsed;
      }
      return replaceDraft(kind, parsed.draft, "Imported JSON.");
    },
    applyToFreshRun() {
      try {
        const scenario = clone(authoredSetup);
        const mapDraft = mapLabController?.getSnapshot?.()?.draft;
        if (mapDraft) scenario.worldDraft = canonicalizeMapLabDraft(mapDraft);
        scenario.gameConfig = this.getGameConfig();
        const freshState = createInitialState(scenario, scenario.rngSeed);
        const result = runner?.resetToState?.(freshState, "debugConfiguration")
          ?? { ok: false, reason: "runnerUnavailable" };
        if (result.ok) {
          for (const kind of Object.keys(CONFIG_BY_KIND)) {
            setStatus(kind, "Fresh configured test run started at t=0.", "ok");
            notify(kind);
          }
          onApplied?.(freshState);
        }
        return result;
      } catch (error) {
        return { ok: false, reason: "invalidConfiguration", error };
      }
    },
  };
}
