import { setupDefs } from "../defs/gamesettings/scenarios-defs.js";
import { milestone2MapConfigDefs } from "../defs/world/milestone2-map-configs.js";
import { createInitialState } from "../model/init.js";
import {
  MAP_LAB_STORAGE_KEY,
  addMapLabPractice,
  canonicalizeMapLabDraft,
  createAuthoredMapLabDraft,
  createMapLabDraftFromGameState,
  evaluateMapLabPractice,
  getMapLabConnectionCandidates,
  getMapLabDiagnostics,
  moveMapLabPractice,
  parseMapLabDraftJson,
  removeMapLabPractice,
  serializeMapLabDraft,
  toggleMapLabConnection,
  updateMapLabRegion,
  validateMapLabDraft,
} from "../model/map-lab-draft.js";
import {
  MAP_LAB_SCENARIO_LIBRARY_STORAGE_KEY,
  createEmptyMapLabScenarioLibrary,
  deleteMapLabScenario,
  findMapLabScenarioByName,
  parseMapLabScenarioLibraryJson,
  saveMapLabScenario,
  serializeMapLabScenarioLibrary,
} from "../model/map-lab-scenarios.js";

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function safeStorage() {
  try {
    return globalThis?.localStorage ?? null;
  } catch (_) {
    return null;
  }
}

export function createMapLabController({ runner, setupId = "devPlaytesting01", onApplied } = {}) {
  const authoredSetup = setupDefs[setupId];
  const definitionId = authoredSetup?.worldDefinitionId ?? "riverBasin01";
  let draft = createAuthoredMapLabDraft(definitionId);
  let selectedRegionId = draft.regions[0]?.id ?? null;
  let selectedPracticeId = "cultivate";
  let selectedPresetId = "milestone2Blank01";
  let selectedLocalScenarioId = null;
  let scenarioLibrary = createEmptyMapLabScenarioLibrary();
  let connectionStartRegionId = null;
  let status = { message: "", tone: "info" };
  const listeners = new Set();

  function notify() {
    for (const listener of listeners) listener(getSnapshot());
  }

  function setStatus(message, tone = "info") {
    status = { message, tone };
  }

  function persist() {
    const storage = safeStorage();
    if (!storage) return;
    try {
      storage.setItem(MAP_LAB_STORAGE_KEY, serializeMapLabDraft(draft));
    } catch (_) {
      setStatus("Draft changed, but browser storage is unavailable.", "warning");
    }
  }

  function persistScenarioLibrary() {
    const storage = safeStorage();
    if (!storage) return false;
    try {
      storage.setItem(
        MAP_LAB_SCENARIO_LIBRARY_STORAGE_KEY,
        serializeMapLabScenarioLibrary(scenarioLibrary)
      );
      return true;
    } catch (_) {
      setStatus("Saved scenarios could not be written to browser storage.", "warning");
      return false;
    }
  }

  function replaceDraft(nextDraft, message = "Draft updated.", selection = {}) {
    draft = canonicalizeMapLabDraft(nextDraft);
    selectedPresetId = Object.hasOwn(selection, "presetId")
      ? selection.presetId
      : selectedPresetId;
    selectedLocalScenarioId = Object.hasOwn(selection, "localScenarioId")
      ? selection.localScenarioId
      : selectedLocalScenarioId;
    if (!draft.regions.some((entry) => entry.id === selectedRegionId)) {
      selectedRegionId = draft.regions[0]?.id ?? null;
    }
    connectionStartRegionId = null;
    setStatus(message, "ok");
    persist();
    notify();
    return { ok: true, draft };
  }

  function applyEdit(result, successMessage) {
    if (!result?.ok) {
      setStatus(result?.reason ?? "Edit failed.", "error");
      notify();
      return result;
    }
    return replaceDraft(result.draft, successMessage);
  }

  function loadStoredDraft() {
    const storage = safeStorage();
    if (!storage) return;
    try {
      const text = storage.getItem(MAP_LAB_STORAGE_KEY);
      if (!text) return;
      const parsed = parseMapLabDraftJson(text);
      if (parsed.ok) {
        draft = parsed.draft;
        selectedPresetId = null;
        selectedLocalScenarioId = null;
      }
      else setStatus(`Stored draft ignored: ${parsed.errors[0]}`, "warning");
    } catch (_) {
      setStatus("Stored draft could not be read; using authored default.", "warning");
    }
  }

  function loadStoredScenarioLibrary() {
    const storage = safeStorage();
    if (!storage) return;
    try {
      const text = storage.getItem(MAP_LAB_SCENARIO_LIBRARY_STORAGE_KEY);
      if (!text) return;
      const parsed = parseMapLabScenarioLibraryJson(text);
      if (parsed.ok) scenarioLibrary = parsed.library;
      else setStatus(`Stored scenarios ignored: ${parsed.errors[0]}`, "warning");
    } catch (_) {
      setStatus("Stored scenarios could not be read; using an empty local library.", "warning");
    }
  }

  function selectedScenarioDraft() {
    if (selectedLocalScenarioId) {
      return scenarioLibrary.scenarios.find((entry) => entry.id === selectedLocalScenarioId)?.draft ?? null;
    }
    if (selectedPresetId) return milestone2MapConfigDefs[selectedPresetId]?.draft ?? null;
    return null;
  }

  function isSelectedScenarioDirty() {
    const baseline = selectedScenarioDraft();
    return baseline
      ? serializeMapLabDraft(baseline) !== serializeMapLabDraft(draft)
      : true;
  }

  function getSnapshot() {
    return {
      draft,
      selectedRegionId,
      selectedPracticeId,
      selectedPresetId,
      selectedLocalScenarioId,
      selectedScenarioDirty: isSelectedScenarioDirty(),
      connectionStartRegionId,
      status,
      presetOptions: Object.values(milestone2MapConfigDefs).map((entry) => ({
        id: entry.id,
        name: entry.name,
      })),
      localScenarioOptions: scenarioLibrary.scenarios.map((entry) => ({
        id: entry.id,
        name: entry.name,
      })),
      connectionCandidates: getMapLabConnectionCandidates(draft),
      evaluations: evaluateMapLabPractice(draft, selectedPracticeId),
      diagnostics: getMapLabDiagnostics(draft),
    };
  }

  loadStoredDraft();
  loadStoredScenarioLibrary();

  return {
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot,
    selectRegion(regionId) {
      if (!draft.regions.some((entry) => entry.id === regionId)) return;
      selectedRegionId = regionId;
      notify();
    },
    selectPractice(practiceId) {
      selectedPracticeId = practiceId;
      notify();
    },
    updateRegion(regionId, patch) {
      return applyEdit(updateMapLabRegion(draft, regionId, patch), "Region updated.");
    },
    addPractice(regionId, practiceId) {
      return applyEdit(addMapLabPractice(draft, regionId, practiceId), "Practice added.");
    },
    removePractice(regionId, index) {
      return applyEdit(removeMapLabPractice(draft, regionId, index), "Practice removed.");
    },
    movePractice(regionId, fromIndex, toIndex) {
      return applyEdit(moveMapLabPractice(draft, regionId, fromIndex, toIndex), "Practice reordered.");
    },
    beginOrToggleConnection(regionId) {
      if (!connectionStartRegionId) {
        connectionStartRegionId = regionId;
        setStatus("Choose a second region to toggle the connection.");
        notify();
        return { ok: true, pending: true };
      }
      const first = connectionStartRegionId;
      const result = toggleMapLabConnection(draft, first, regionId);
      if (!result.ok) {
        const message = result.reason === "selfConnection"
          ? "A region cannot connect to itself; choose a different region."
          : result.reason === "notPolygonAdjacent"
            ? "Those regions cannot connect because they do not share a polygon edge."
            : result.reason;
        setStatus(message, "error");
        notify();
        return result;
      }
      connectionStartRegionId = null;
      return replaceDraft(result.draft, result.connected ? "Connection added." : "Connection removed.");
    },
    cancelConnection() {
      connectionStartRegionId = null;
      setStatus("Connection selection cancelled.");
      notify();
    },
    reset() {
      return replaceDraft(
        createAuthoredMapLabDraft(definitionId),
        "Reset to authored default.",
        { presetId: "milestone2Blank01", localScenarioId: null }
      );
    },
    loadPreset(presetId) {
      const preset = milestone2MapConfigDefs[presetId];
      if (!preset) {
        setStatus(`Unknown Map Lab scenario: ${presetId}`, "error");
        notify();
        return { ok: false, reason: "invalidPresetId" };
      }
      return replaceDraft(preset.draft, `Loaded ${preset.name}.`, {
        presetId: preset.id,
        localScenarioId: null,
      });
    },
    loadCurrentGame() {
      const state = runner?.getState?.() ?? runner?.getCursorState?.() ?? null;
      const result = createMapLabDraftFromGameState(state);
      if (!result.ok) {
        setStatus(`Could not copy the current game: ${result.errors[0] ?? "state unavailable"}`, "error");
        notify();
        return result;
      }
      const tSec = Math.max(0, Math.floor(state?.tSec ?? 0));
      return replaceDraft(
        result.draft,
        `Copied the viewed game state at t=${tSec}. The running game was not changed.`,
        { presetId: null, localScenarioId: null }
      );
    },
    loadLocalScenario(scenarioId) {
      const scenario = scenarioLibrary.scenarios.find((entry) => entry.id === scenarioId);
      if (!scenario) {
        setStatus("That saved browser scenario no longer exists.", "error");
        notify();
        return { ok: false, reason: "invalidScenarioId" };
      }
      return replaceDraft(scenario.draft, `Loaded saved scenario “${scenario.name}”.`, {
        presetId: null,
        localScenarioId: scenario.id,
      });
    },
    saveLocalScenario(name, { overwriteScenarioId = null } = {}) {
      const sameName = findMapLabScenarioByName(scenarioLibrary, name);
      const selectedScenario = scenarioLibrary.scenarios
        .find((entry) => entry.id === selectedLocalScenarioId);
      let scenarioId = overwriteScenarioId;
      if (!scenarioId && selectedScenario
          && sameName?.id === selectedScenario.id) {
        scenarioId = selectedScenario.id;
      }
      const result = saveMapLabScenario(scenarioLibrary, { name, draft, scenarioId });
      if (!result.ok) {
        if (result.reason === "duplicateName") return { ...result, requiresOverwrite: true };
        const message = result.reason === "emptyName"
          ? "Enter a name for the scenario."
          : result.reason === "nameTooLong"
            ? "Scenario names must be 80 characters or fewer."
            : "The scenario could not be saved.";
        setStatus(message, "error");
        notify();
        return result;
      }
      scenarioLibrary = result.library;
      selectedPresetId = null;
      selectedLocalScenarioId = result.scenario.id;
      const stored = persistScenarioLibrary();
      setStatus(
        stored
          ? `Saved browser scenario “${result.scenario.name}”.`
          : "Scenario changed, but browser storage is unavailable.",
        stored ? "ok" : "warning"
      );
      notify();
      return { ...result, stored };
    },
    deleteLocalScenario(scenarioId) {
      const result = deleteMapLabScenario(scenarioLibrary, scenarioId);
      if (!result.ok) {
        setStatus("That saved browser scenario no longer exists.", "error");
        notify();
        return result;
      }
      scenarioLibrary = result.library;
      if (selectedLocalScenarioId === scenarioId) {
        selectedLocalScenarioId = null;
        selectedPresetId = null;
      }
      const stored = persistScenarioLibrary();
      setStatus(
        stored
          ? `Deleted saved scenario “${result.scenario.name}”. The current draft remains open.`
          : "Scenario was removed in this session, but browser storage is unavailable.",
        stored ? "ok" : "warning"
      );
      notify();
      return { ...result, stored };
    },
    exportJson() {
      return serializeMapLabDraft(draft);
    },
    importJson(text) {
      const result = parseMapLabDraftJson(text);
      if (!result.ok) {
        setStatus(`Import failed: ${result.errors.join(" | ")}`, "error");
        notify();
        return result;
      }
      return replaceDraft(result.draft, "Draft imported.", {
        presetId: null,
        localScenarioId: null,
      });
    },
    applyToFreshRun() {
      const validation = validateMapLabDraft(draft);
      if (!validation.ok) return { ok: false, reason: "invalidDraft", errors: validation.errors };
      try {
        const scenario = clone(authoredSetup);
        scenario.worldDraft = canonicalizeMapLabDraft(draft);
        const freshState = createInitialState(scenario, scenario.rngSeed);
        const result = runner?.resetToState?.(freshState, "mapLabDraft")
          ?? { ok: false, reason: "runnerUnavailable" };
        if (result.ok) {
          setStatus("Fresh test run started at t=0.", "ok");
          onApplied?.(freshState);
        } else {
          setStatus(`Could not start test run: ${result.reason}`, "error");
        }
        notify();
        return result;
      } catch (error) {
        const result = { ok: false, reason: "invalidDraft", error };
        setStatus(`Could not start test run: ${error.message}`, "error");
        notify();
        return result;
      }
    },
  };
}
