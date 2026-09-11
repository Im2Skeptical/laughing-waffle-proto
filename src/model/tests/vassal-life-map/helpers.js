import assert from "node:assert/strict";
import { ActionKinds, applyAction } from "../../actions.js";
import { createInitialState } from "../../init.js";
import { createRng } from "../../rng.js";
import {
  getCurrentLifeMapVassal,
  getVassalCandidatePool,
  getVassalLifeMapNodes,
} from "../../vassal-life-map.js";
import { stepDetailedSettlementsSecond } from "../../detailed-settlements.js";

export function dispatch(state, kind, payload = {}) {
  const result = applyAction(state, { kind, payload }, { isReplay: true });
  assert.equal(result.ok, true, `${kind} failed: ${result.reason ?? "unknown"}`);
  return result;
}

export function selectedState(seed = 1, candidateIndex = 0) {
  const state = createInitialState("devPlaytesting01", seed);
  state.paused = true;
  state.phase = "planning";
  state.gameConfig.settings.values.primordialBasePressure = 0;
  state.civilization.chaos.monsterLossThreshold = 1000000;
  const pool = getVassalCandidatePool(state);
  dispatch(state, ActionKinds.SETTLEMENT_SELECT_VASSAL, {
    candidateIndex, expectedPoolHash: pool.expectedPoolHash,
  });
  return state;
}

export function selectedStateForSignature(variantId) {
  for (let seed = 0; seed < 1000; seed += 1) {
    const state = createInitialState("devPlaytesting01", seed);
    const pool = getVassalCandidatePool(state);
    const candidateIndex = pool.candidates.findIndex((candidate) =>
      candidate.signatureNode?.variantId === variantId);
    if (candidateIndex < 0) continue;
    dispatch(state, ActionKinds.SETTLEMENT_SELECT_VASSAL, {
      candidateIndex, expectedPoolHash: pool.expectedPoolHash,
    });
    return state;
  }
  throw new Error(`No candidate rolled signature ${variantId}`);
}

export function nodeIdForSignature(state, variantId) {
  const node = getVassalLifeMapNodes(getCurrentLifeMapVassal(state)).find((entry) =>
    entry.signatureNode?.variantId === variantId);
  assert.ok(node, `expected generated signature node ${variantId}`);
  return node.id;
}

export function forceEnter(state, nodeId) {
  const vassal = getCurrentLifeMapVassal(state);
  vassal.lifeMap.availableNodeIds = [nodeId];
  dispatch(state, ActionKinds.VASSAL_ENTER_LIFE_NODE, { nodeId });
  return vassal.lifeMap.nodeStates[nodeId];
}

export function nodeIdForFamily(state, family, index = 0) {
  const nodes = getVassalLifeMapNodes(getCurrentLifeMapVassal(state))
    .filter((node) => node.family === family);
  assert.ok(nodes[index], `expected generated ${family} node ${index}`);
  return nodes[index].id;
}

export function resolvePending(state) {
  const vassal = getCurrentLifeMapVassal(state);
  const resolveSec = vassal.lifeMap.pendingResolution.resolveSec;
  for (let tSec = Math.floor(state.tSec ?? 0) + 1; tSec <= resolveSec; tSec += 1) {
    state.tSec = tSec;
    stepDetailedSettlementsSecond(state, tSec);
  }
  return resolveSec;
}

export function findSeed(predicate) {
  for (let seed = 0; seed < 10000; seed += 1) {
    const roll = createRng(seed).nextFloat();
    if (predicate(roll)) return seed;
  }
  throw new Error("No deterministic RNG seed matched the predicate");
}
