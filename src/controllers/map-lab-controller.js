import { setupDefs } from "../defs/gamesettings/scenarios-defs.js";
import { createInitialState } from "../model/init.js";
import {
  MAP_LAB_STORAGE_KEY,
  addMapLabPractice,
  canonicalizeMapLabDraft,
  createAuthoredMapLabDraft,
  evaluateMapLabPractice,
  getMapLabDiagnostics,
  moveMapLabPractice,
  parseMapLabDraftJson,
  removeMapLabPractice,
  serializeMapLabDraft,
  toggleMapLabConnection,
  updateMapLabRegion,
  validateMapLabDraft,
} from "../model/map-lab-draft.js";

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

  function replaceDraft(nextDraft, message = "Draft updated.") {
    draft = canonicalizeMapLabDraft(nextDraft);
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
      if (parsed.ok) draft = parsed.draft;
      else setStatus(`Stored draft ignored: ${parsed.errors[0]}`, "warning");
    } catch (_) {
      setStatus("Stored draft could not be read; using authored default.", "warning");
    }
  }

  function getSnapshot() {
    return {
      draft,
      selectedRegionId,
      selectedPracticeId,
      connectionStartRegionId,
      status,
      evaluations: evaluateMapLabPractice(draft, selectedPracticeId),
      diagnostics: getMapLabDiagnostics(draft),
    };
  }

  loadStoredDraft();

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
        setStatus(result.reason === "selfConnection"
          ? "A region cannot connect to itself; choose a different region."
          : result.reason, "error");
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
      return replaceDraft(createAuthoredMapLabDraft(definitionId), "Reset to authored default.");
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
      return replaceDraft(result.draft, "Draft imported.");
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

