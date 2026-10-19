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
import { getVassalLifeMapNodeType } from '../../../defs/gamepieces/vassal-life-map-defs.js';

export function dispatch(state, kind, payload = {}) {
  const result = applyAction(state, { kind, payload }, { isReplay: true });
  assert.equal(result.ok, true, `${kind} failed: ${result.reason ?? "unknown"}`);
  return result;
}

export function selectedState(seed = 1, candidateIndex = 0) {
  const state = createInitialState("devPlaytesting01", seed);
  // These mechanics fixtures exercise legacy authored option arithmetic.
  // Current pooled defaults and shared shop costs have dedicated workbench tests.
  state.gameConfig.lifeMapGenerator.design.enabled=false;
  Object.assign(state.gameConfig.lifeMapGenerator,{laneCount:6,normalDepthCount:11,earlyDepthCount:4});
  state.paused = true;
  state.phase = "planning";
  state.gameConfig.settings.values.primordialBasePressure = 0;
  state.civilization.vassalLineage.pendingCandidates.forEach(candidate=>{
    candidate.classId=null; candidate.founderClassId=null; candidate.archetype='Unclassed';
  });
  const pool = getVassalCandidatePool(state);
  dispatch(state, ActionKinds.SETTLEMENT_SELECT_VASSAL, {
    candidateIndex, expectedPoolHash: pool.expectedPoolHash,
  });
  return state;
}

export function selectedStateForSignature(variantId) {
  for (let seed = 0; seed < 1000; seed += 1) {
    const state = createInitialState("devPlaytesting01", seed);
    state.gameConfig.lifeMapGenerator.design.enabled=false;
    Object.assign(state.gameConfig.lifeMapGenerator,{laneCount:6,normalDepthCount:11,earlyDepthCount:4});
    state.civilization.vassalLineage.pendingCandidates.forEach(candidate=>{
      candidate.classId=null; candidate.founderClassId=null; candidate.archetype='Unclassed';
    });
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
  const selection=vassal.lifeMap.nodeStates[nodeId].shopSelection;
  if (selection && !selection.selectedTag) dispatch(state,ActionKinds.VASSAL_SELECT_LIFE_OPTION,
    {nodeId,optionId:selection.kind==='practice'?'random':selection.choices.find(choice=>choice.enabled).id});
  return vassal.lifeMap.nodeStates[nodeId];
}

export function nodeIdForFamily(state, family, index = 0) {
  if(family==='legacy'){const node=getVassalLifeMapNodes(getCurrentLifeMapVassal(state)).find(n=>n.family==='legacy');delete node.signatureNode;return node.id;}
  const nodes = getVassalLifeMapNodes(getCurrentLifeMapVassal(state))
    .filter((node) => getVassalLifeMapNodeType(node) === family);
  if (!nodes[index]) {
    const graph=getCurrentLifeMapVassal(state).lifeMap.graph;
    const fixtureNode=graph.nodes.find(n=>n.id!==graph.foundingNodeId&&!n.signatureNode && !["legacy","signature"].includes(n.family));
    fixtureNode.family=family==='specialRelic'?'relic':family;
    if(fixtureNode.family==='relic')fixtureNode.specialRelic=family==='specialRelic';else delete fixtureNode.specialRelic;
    nodes[index]=fixtureNode;
  }
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
