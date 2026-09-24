import { deserializeGameState, serializeGameState, syncPhaseToPaused } from "../state.js";
import { canonicalizeSnapshot } from "../canonicalize.js";
import { attachRngHelpers } from "../rng.js";
import { advanceReplayStateOneSecond, initializeReplayClock } from "../replay-second-runner.js";

function freezeTree(value) {
  if (!value || typeof value !== "object" || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeTree(child);
  return Object.freeze(value);
}

// Private, bounded restore codec. Worker/save/timeline inputs pass through the
// full deserializer once before becoming trusted. Stored bodies never escape;
// callers own a fresh mutable body and share only a frozen canonical config.
export function createProjectionStateRestorer({ maxEntries = 64 } = {}) {
  const anchors = new Map();
  let configKey = null;
  let config = null;
  function restore(stateData, baseSec, targetSec = baseSec) {
    if (targetSec < baseSec) return null;
    let entry = anchors.get(stateData);
    if (!entry) {
      const validated = deserializeGameState(stateData);
      canonicalizeSnapshot(validated);
      const key = JSON.stringify(validated.gameConfig);
      if (key !== configKey) {
        configKey = key;
        config = freezeTree(validated.gameConfig);
      }
      // Keep the save serializer's stripping rules, without cloning the config.
      const body = serializeGameState({ ...validated, gameConfig: undefined });
      entry = { body, config };
    }
    anchors.delete(stateData);
    anchors.set(stateData, entry);
    while (anchors.size > Math.max(1, maxEntries)) anchors.delete(anchors.keys().next().value);
    const state = structuredClone(entry.body);
    state.gameConfig = entry.config;
    attachRngHelpers(state);
    state._boardDirty = false;
    state._seasonChanged = false;
    syncPhaseToPaused(state);
    if (targetSec > baseSec) {
      initializeReplayClock(state, baseSec);
      for (let sec = baseSec + 1; sec <= targetSec; sec++) {
        if (state.runStatus?.complete === true) return null;
        if (!advanceReplayStateOneSecond(state).ok) return null;
        canonicalizeSnapshot(state);
      }
    } else {
      canonicalizeSnapshot(state);
    }
    return state;
  }
  return {
    restore,
    clear() { anchors.clear(); configKey = null; config = null; },
    getSize: () => anchors.size,
  };
}
