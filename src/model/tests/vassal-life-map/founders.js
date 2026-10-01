import assert from 'node:assert/strict';
import { ActionKinds, applyAction } from '../../actions.js';
import { createNewGameState } from '../../new-game.js';
import { deserializeGameState, serializeGameState } from '../../state.js';
import { advanceReplayStateToSecond } from '../../replay-second-runner.js';
import { getDetailedSettlementSites } from '../../detailed-settlements.js';
import { specialistCount, trainSpecialists } from '../../detailed-settlements/stock.js';
import { emptySpecialists } from '../../detailed-settlements/cohorts.js';
import { createTimelineFromInitialState, appendActionAtCursor, rebuildStateAtSecond } from '../../timeline/index.js';
import { validateVassalLifeMapGraph } from '../../vassal-life-map-generator.js';
import { getVassalCandidatePool, getCurrentLifeMapVassal, selectLifeMapVassal,
  rerollVassalCandidates } from '../../vassal-life-map.js';
import { dispatch, forceEnter } from './helpers.js';

function endLife(state, die = false) {
  const vassal = getCurrentLifeMapVassal(state);
  vassal.developmentChoiceQueue = [];
  const node = forceEnter(state, vassal.lifeMap.graph.bossNodeId);
  node.options = [{id: 'end-life-fixture', phaseCost: 0, ...(die ? {immediateDeathChance: 1} : {})}];
  dispatch(state, ActionKinds.VASSAL_SELECT_LIFE_OPTION, {nodeId: node.nodeId, optionId: 'end-life-fixture'});
  dispatch(state, ActionKinds.VASSAL_CONFIRM_LIFE_NODE, {nodeId: node.nodeId});
}

for (const [candidateIndex, classId, archetype, count] of [[0, 'scholar', 'Philosopher', 2], [1, 'warrior', 'Warlord', 10]]) {
  const state = createNewGameState(701 + candidateIndex);
  state.paused = true;
  state.gameConfig.settings.values.primordialBasePressure = 0;
  const lineage = state.civilization.vassalLineage;
  assert.ok(lineage.pendingCandidates.every(c => c.classId === null && c.founderClassId));
  assert.deepEqual(new Set(lineage.pendingCandidates.map(c => c.archetype)), new Set(['Philosopher', 'Warlord']));
  for (let roll = 0; roll < 3; roll++) {
    assert.equal(rerollVassalCandidates(state).ok, true);
    assert.ok(lineage.pendingCandidates.every(c => c.classId === null && c.founderClassId));
  }
  const pool = getVassalCandidatePool(state);
  assert.equal(selectLifeMapVassal(state, candidateIndex, pool.expectedPoolHash).ok, true);
  const founder = getCurrentLifeMapVassal(state);
  const graph = founder.lifeMap.graph;
  assert.equal(founder.archetype, archetype);
  assert.equal(founder.classId, null);
  assert.equal(founder.founderClassId, classId);
  assert.equal(lineage.founderClassId, classId);
  assert.equal(lineage.establishedClassId, null);
  assert.deepEqual(founder.lifeMap.availableNodeIds, [graph.foundingNodeId]);
  assert.deepEqual(graph.entryNodeIds, [graph.foundingNodeId]);
  assert.deepEqual(validateVassalLifeMapGraph(graph), {ok: true, errors: []});
  const bypassNode = graph.nodes.find(n => n.depth === 0);
  assert.equal(applyAction(state, {kind: ActionKinds.VASSAL_ENTER_LIFE_NODE, payload: {nodeId: bypassNode.id}}, {isReplay: true}).reason, 'nodeUnavailable');
  const home = getDetailedSettlementSites(state, {playerOnly: true}).find(s => s.regionId === founder.locationRegionId);
  // Warlord founding works without neutral targets, conquest, supply or martial strength.
  state.world.sites = state.world.sites.filter(s => !s.neutral);
  for (const site of getDetailedSettlementSites(state, {playerOnly: true})) site.detailedState.practiceSlots.fill(null);
  const timeline = createTimelineFromInitialState(state);
  const act = (kind, payload) => {
    assert.equal(appendActionAtCursor(timeline, {kind, payload, tSec: 0}, state).ok, true);
    return dispatch(state, kind, payload);
  };
  act(ActionKinds.VASSAL_ENTER_LIFE_NODE, {nodeId: graph.foundingNodeId});
  const node = founder.lifeMap.nodeStates[graph.foundingNodeId];
  assert.equal(node.options.length, 1);
  assert.match(node.options[0].label, new RegExp(archetype));
  assert.equal(node.options[0].classAction.kind, 'train');
  assert.equal(node.options[0].classAction.establishClass, true);
  act(ActionKinds.VASSAL_SELECT_LIFE_OPTION, {nodeId: node.nodeId, optionId: node.options[0].id});
  act(ActionKinds.VASSAL_CONFIRM_LIFE_NODE, {nodeId: node.nodeId});
  const resolveSec = founder.lifeMap.pendingResolution.resolveSec;
  assert.equal(resolveSec, 6);
  assert.equal(specialistCount(home.detailedState, classId), 0, 'confirmation does not establish the class early');
  state.paused = false;
  assert.equal(advanceReplayStateToSecond(state, resolveSec - 1).ok, true);
  assert.equal(lineage.establishedClassId, null);
  const reloaded = deserializeGameState(serializeGameState(state));
  assert.equal(advanceReplayStateToSecond(state, resolveSec).ok, true);
  assert.equal(advanceReplayStateToSecond(reloaded, resolveSec).ok, true);
  assert.ok(JSON.stringify(serializeGameState(reloaded)) === JSON.stringify(serializeGameState(state)), 'pending founding survives save/reload');
  const replay = rebuildStateAtSecond(timeline, resolveSec);
  assert.equal(replay.ok, true);
  assert.ok(JSON.stringify(serializeGameState(replay.state)) === JSON.stringify(serializeGameState(state)), 'founding matches authoritative replay');
  assert.equal(lineage.establishedClassId, classId);
  assert.equal(founder.classId, classId);
  assert.equal(founder.archetype, archetype, 'the founder retains their historical identity');
  assert.equal(specialistCount(home.detailedState, classId), count);
  assert.equal(home.detailedState.structureSlots.some(s => s?.structureId === 'lyceum'), classId === 'scholar');
  assert.equal(state.civilization.history.victories, 0);
  assert.equal(founder.lifeMap.nodeStates[node.nodeId].resolved, true);
  assert.ok(founder.lifeMap.availableNodeIds.every(id => graph.nodes.find(n => n.id === id).depth === 0));
  assert.ok(founder.lifeEvents.some(e => e.kind === 'classFounded' && e.text.startsWith(archetype)));

  // Local population and institutions never introduce the unchosen class or another founder.
  const otherClass = classId === 'scholar' ? 'warrior' : 'scholar';
  for (const site of getDetailedSettlementSites(state, {playerOnly: true})) {
    for (const cohort of Object.values(site.detailedState.populationByClass)) cohort.specialists = emptySpecialists();
    trainSpecialists(site.detailedState, otherClass, 10);
  }
  endLife(state);
  for (let roll = 0; roll < 5; roll++) {
    const next = getVassalCandidatePool(state);
    assert.deepEqual(new Set(next.candidates.map(c => c.classId)), new Set([null, classId]));
    assert.ok(next.candidates.every(c => c.founderClassId === null && !['Philosopher', 'Warlord'].includes(c.archetype)));
    assert.equal(rerollVassalCandidates(state).ok, true);
  }
  const successor = getVassalCandidatePool(state);
  assert.equal(selectLifeMapVassal(state, 1, successor.expectedPoolHash).ok, true);
  const unclassed = getCurrentLifeMapVassal(state);
  assert.equal(unclassed.classId, null);
  assert.equal(unclassed.lifeMap.graph.foundingNodeId, undefined);
  assert.ok(!unclassed.lifeMap.graph.nodes.some(n => ['training', 'commission', 'discovery', 'campaign', 'challenge'].includes(n.family)));
  endLife(state);
  assert.equal(selectLifeMapVassal(state, 0, getVassalCandidatePool(state).expectedPoolHash).ok, true);
  const classed = getCurrentLifeMapVassal(state);
  assert.equal(classed.archetype, classId === 'scholar' ? 'Scholar' : 'Warrior');
  assert.equal(classed.lifeMap.graph.foundingNodeId, undefined);
  assert.ok(classed.lifeMap.graph.nodes.some(n => n.family === 'training'));
}

const failedFounding = createNewGameState(999);
assert.equal(selectLifeMapVassal(failedFounding, 1).ok, true);
endLife(failedFounding, true);
assert.ok(getVassalCandidatePool(failedFounding).candidates.every(c => c.classId === null && c.founderClassId === null),
  'an unfinished founding does not establish a class or offer replacement founders');

console.log('[vassal-founders] founder gate, completion, no-conquest founding, successors and save/reload OK');
