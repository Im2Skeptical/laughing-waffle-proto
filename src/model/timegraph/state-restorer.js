import { createProjectionAnchorReader, serializeGameState, syncPhaseToPaused } from "../state.js";
import { canonicalizeSnapshot } from "../canonicalize.js";
import { attachRngHelpers } from "../rng.js";
import { advanceReplayStateOneSecond, initializeReplayClock } from "../replay-second-runner.js";

// Private, bounded restore codec. Every new anchor validates its mutable body;
// identical configs share one fully validated, frozen canonical value. Stored
// bodies never escape; every caller owns a fresh mutable body.
export function createProjectionStateRestorer({ maxEntries = 64 } = {}) {
  const anchors = new Map();
  const reader = createProjectionAnchorReader();
  function restore(stateData, baseSec, targetSec = baseSec) {
    if (targetSec < baseSec) return null;
    let entry = anchors.get(stateData);
    if (!entry) {
      const validated = reader.read(stateData);
      canonicalizeSnapshot(validated);
      // Keep the save serializer's stripping rules, without cloning the config.
      const body = serializeGameState({ ...validated, gameConfig: undefined });
      entry = { body, config: validated.gameConfig };
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
    clear() { anchors.clear(); reader.clear(); },
    getSize: () => anchors.size,
  };
}
