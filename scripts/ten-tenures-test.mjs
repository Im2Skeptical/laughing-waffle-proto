import { exportSave, inspectSaveText } from "../src/controllers/sim-runner/save-slots.js";
import { completeNodeResolution } from "../src/model/vassal-life-map/lifecycle/node-confirm.js";
import assert from "node:assert/strict";
import { createNewGameState } from "../src/model/new-game.js";
import { ActionKinds, applyAction } from "../src/model/actions.js";
import { getCurrentLifeMapVassal, getVassalCandidatePool, stepVassalLifeMapSecond } from "../src/model/vassal-life-map.js";
import { initializeReplayClock, advanceReplayStateToSecond } from "../src/model/replay-second-runner.js";
import { serializeGameState, deserializeGameState, syncPhaseToPaused } from "../src/model/state.js";
import { createTimelineFromInitialState, appendActionAtCursor, rebuildStateAtSecond } from "../src/model/timeline/index.js";
import { cmdTickSimulation, cmdSetPaused } from "../src/model/commands/simulation-commands.js";
import { getRunCompleteInfo } from "../src/views/run-complete-presentation.js";

for (const remaining of [10, 1]) {
  const state = createNewGameState(0);
  assert.equal(state.civilization.vassalLineage.tenuresRemaining, 10);
  state.civilization.vassalLineage.tenuresRemaining = remaining;
  state.gameConfig.lifeMapGenerator.design.bookends.founding.depth = 0;
  for (const c of state.civilization.vassalLineage.pendingCandidates) c.age = 90;
  initializeReplayClock(state, 0);
  const timeline = createTimelineFromInitialState(state);
  function commit(kind, payload) {
    cmdSetPaused(state, true); syncPhaseToPaused(state);
    const result = applyAction(state, {kind, payload});
    assert.equal(result.ok, true, result.reason);
    cmdSetPaused(state, false); syncPhaseToPaused(state);
    assert.equal(appendActionAtCursor(timeline, {kind, payload, tSec: 0}, state).ok, true);
  }
  commit(ActionKinds.SETTLEMENT_SELECT_VASSAL, {candidateIndex: 0, expectedPoolHash: getVassalCandidatePool(state).expectedPoolHash});
  const vassal = getCurrentLifeMapVassal(state);
  const nodeId = vassal.lifeMap.graph.foundingNodeId;
  commit(ActionKinds.VASSAL_ENTER_LIFE_NODE, {nodeId});
  commit(ActionKinds.VASSAL_SELECT_LIFE_OPTION, {nodeId, optionId: "train-estate"});
  commit(ActionKinds.VASSAL_CONFIRM_LIFE_NODE, {nodeId});
  assert.equal(advanceReplayStateToSecond(state, 6).ok, true);
  assert.equal(vassal.endedReason, "died");
  assert.equal(state.civilization.vassalLineage.tenuresRemaining, remaining - 1);
  assert.deepEqual(serializeGameState(rebuildStateAtSecond(timeline, 6).state), serializeGameState(state));
  const loaded = deserializeGameState(JSON.parse(JSON.stringify(serializeGameState(state))));
  assert.deepEqual(serializeGameState(loaded), serializeGameState(state));
  const savedTimeline = {...timeline, cursorSec:6, historyEndSec:6, maxReachedHistoryEndSec:6, checkpoints:[]};
  const exported = exportSave({state, timeline:savedTimeline, setupId:"ten-tenures"});
  assert.equal(exported.ok,true);
  const imported = inspectSaveText(exported.text);
  assert.equal(imported.ok,true,imported.reason);
  assert.deepEqual(serializeGameState(imported.state),serializeGameState(state));
  stepVassalLifeMapSecond(state, 6);
  assert.equal(state.civilization.vassalLineage.tenuresRemaining, remaining - 1);
  if (remaining === 1) {
    assert.equal(state.runStatus.reason, "tenuresExhausted");
    assert.equal(state.paused, true);
    assert.deepEqual(state.civilization.vassalLineage.pendingCandidates, []);
    assert.equal(cmdSetPaused(state, false).ok, false);
    assert.equal(cmdTickSimulation(state, 1/60).ok, false);
    assert.equal(applyAction(state, {kind: ActionKinds.SETTLEMENT_SELECT_VASSAL, payload:{candidateIndex:0}}).ok, false);
    assert.equal(getRunCompleteInfo(state).cause, "Ten tenures completed");
    assert.equal(state.tSec, 6);
  } else assert.equal(state.runStatus?.complete === true, false);
}
console.log("Ten tenures: death, terminal freeze, succession lock, JSON save and authoritative replay passed");

// An authored terminal node retires through the same spend path.
for (const remaining of [10, 1]) {
  const state = createNewGameState(0);
  state.civilization.vassalLineage.tenuresRemaining = remaining;
  state.paused = true; syncPhaseToPaused(state);
  assert.equal(applyAction(state, {kind:ActionKinds.SETTLEMENT_SELECT_VASSAL,payload:{candidateIndex:0}}).ok,true);
  const vassal = getCurrentLifeMapVassal(state);
  vassal.initialAge = 0;
  const node = vassal.lifeMap.graph.nodes.find(n => !vassal.lifeMap.graph.edges.some(e => e.fromNodeId === n.id));
  const nodeState = {nodeId:node.id, family:node.family, options:[], selectedOptionId:null};
  assert.equal(completeNodeResolution(state,vassal,nodeState).retired,true);
  assert.equal(vassal.endedReason,"retired");
  assert.equal(state.civilization.vassalLineage.tenuresRemaining,remaining-1);
  assert.equal(state.runStatus?.complete === true,remaining===1);
}
console.log("Ten tenures: retirement spend and final retirement passed");
