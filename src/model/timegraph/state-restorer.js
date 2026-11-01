import { createProjectionAnchorReader, serializeGameState, syncPhaseToPaused } from "../state.js";
import { canonicalizeSnapshot } from "../canonicalize.js";
import { attachRngHelpers } from "../rng.js";
import { advanceReplayStateOneSecond, initializeReplayClock } from "../replay-second-runner.js";

// Private, bounded restore codec. Every new anchor validates its mutable body;
// identical configs share one fully validated, frozen canonical value. Stored
// bodies never escape; every caller owns a fresh mutable body.
// A small, flat LRU also keeps the last `maxReplayEntries` off-anchor replays
// (keyed by anchor identity + seconds) so back-and-forth scrubbing skips
// repeated replay. Every hit or store becomes most recently used; eviction
// always drops the globally least recently used replay. Hits
// clone the exact replayed object, so results match an uncached restore.
export function createProjectionStateRestorer({ maxEntries = 64, maxReplayEntries = 4 } = {}) {
  const anchors = new Map();
  const replays = new Map();
  const anchorIds = new WeakMap();
  let nextAnchorId = 0;
  function replayKeyFor(stateData, baseSec, targetSec) {
    let id = anchorIds.get(stateData);
    if (id === undefined) anchorIds.set(stateData, (id = nextAnchorId++));
    return `${id}:${baseSec}:${targetSec}`;
  }
  const reader = createProjectionAnchorReader();
  function cloneReplayed(state) {
    const plain = {};
    for (const [key, value] of Object.entries(state)) {
      if (key !== "gameConfig" && typeof value !== "function") plain[key] = value;
    }
    return structuredClone(plain);
  }
  function fromReplay(hit) {
    const body = structuredClone(hit.body);
    // Rebuild in the replayed key order; RNG helpers are re-bound in place.
    const state = {};
    for (const key of hit.keys) state[key] = key === "gameConfig" ? hit.config : body[key];
    attachRngHelpers(state);
    return state;
  }
  function restore(stateData, baseSec, targetSec = baseSec) {
    if (targetSec < baseSec) return null;
    const replayKey = targetSec > baseSec ? replayKeyFor(stateData, baseSec, targetSec) : null;
    const hit = replayKey ? replays.get(replayKey) : undefined;
    if (hit) {
      replays.delete(replayKey);
      replays.set(replayKey, hit);
      return fromReplay(hit);
    }
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
      if (maxReplayEntries > 0) {
        replays.delete(replayKey);
        replays.set(replayKey, { body: cloneReplayed(state), keys: Object.keys(state), config: state.gameConfig });
        while (replays.size > maxReplayEntries) replays.delete(replays.keys().next().value);
      }
    } else {
      canonicalizeSnapshot(state);
    }
    return state;
  }
  return {
    restore,
    clear() { anchors.clear(); replays.clear(); reader.clear(); },
    getSize: () => anchors.size,
    getReplayCacheSize: () => replays.size,
    hasCachedReplay: (stateData, baseSec, targetSec) =>
      anchorIds.has(stateData) && replays.has(replayKeyFor(stateData, baseSec, targetSec)),
  };
}
