// Combined territorial Prestige. Audit and test only: no runtime rule changes.
// Independent oracle: every cohort in a player holding adds population/20
// times (1-unrest/100). Add 3 plus Cunning (Scholars add none) and round once.
import assert from 'node:assert/strict';
import {createNewGameState} from '../src/model/new-game.js';
import {populationBins, writePopulationBins} from '../src/model/detailed-settlements/population-ledger.js';
import {changeController} from '../src/model/detailed-settlements/territory.js';
import {getRegionState} from '../src/model/world-state.js';
import {ActionKinds, applyAction} from '../src/model/actions.js';
import {getCurrentLifeMapVassal, getVassalCandidatePool, getVassalNodeDecisionPresentation} from '../src/model/vassal-life-map.js';
import {getRegionPrestigePerNode, getVassalNodeResolutionGains} from '../src/model/vassal-life-map/selectors.js';
import {serializeGameState} from '../src/model/state.js';
import {appendActionAtCursor, createTimelineFromInitialState, rebuildStateAtSecond} from '../src/model/timeline/index.js';
import {advanceReplayStateToSecond, initializeReplayClock} from '../src/model/replay-second-runner.js';

const bin = (allegiance, count) => ({classId:'villager', allegiance, specialty:'ordinary', kind:'adults', age:null, count});
const playerSites = state => state.world.sites.filter(site => site.simulationMode==='detailed' && site.detailedState && getRegionState(state, site.regionId)?.controller==='player');
const headcount = site => populationBins(site.detailedState).reduce((total, cohort) => total+cohort.count, 0);
const personal = vassal => 3+((vassal.classId??vassal.founderClassId)==='scholar' ? 0 : Math.max(0, Math.floor(vassal.stats?.cunning??0)));
const regional = state => playerSites(state).reduce((total, site) => total+headcount(site)/20*(1-(site.detailedState.control?.unrest??0)/100), 0);
const packet = (state, vassal) => Math.round(personal(vassal)+regional(state));
const held = (state, controller) => state.world.sites.find(site => site.detailedState && getRegionState(state, site.regionId)?.controller===controller);
const act = (state, kind, payload) => applyAction(state, {kind, payload}, {isReplay:true});

function boot(populations, unrest = [0, 0]) {
  const state = createNewGameState(0);
  playerSites(state).forEach((site, index) => {
    writePopulationBins(site.detailedState, populations[index]??[]);
    site.detailedState.control.unrest = unrest[index]??0;
  });
  const pool = getVassalCandidatePool(state);
  assert.equal(act(state, ActionKinds.SETTLEMENT_SELECT_VASSAL, {candidateIndex:1, expectedPoolHash:pool.expectedPoolHash}).ok, true);
  const vassal = getCurrentLifeMapVassal(state);
  assert.equal(vassal.founderClassId, 'warrior');
  assert.equal(vassal.stats.cunning, 0);
  assert.equal(state.civilization.prestige, 20);
  assert.equal(state.civilization.treasury.grossIncome, 0);
  return {state, vassal};
}

function applyAll(state, actions) {
  const timeline = createTimelineFromInitialState(state);
  for (const action of actions) {
    assert.equal(appendActionAtCursor(timeline, action, state).ok, true, action.kind);
    const result = act(state, action.kind, action.payload);
    assert.equal(result.ok, true, result.reason??action.kind);
  }
  return timeline;
}

function settle(state, timeline, sec) {
  if (sec>0) {
    initializeReplayClock(state);
    assert.equal(advanceReplayStateToSecond(state, sec).ok, true);
  }
  const replay = rebuildStateAtSecond(timeline, sec);
  assert.equal(replay.ok, true, replay.reason);
  assert.deepEqual(serializeGameState(replay.state), serializeGameState(state));
}

function payLegacy(state) {
  const vassal = getCurrentLifeMapVassal(state);
  const node = vassal.lifeMap.graph.nodes.find(entry => entry.family==='legacy');
  assert.equal(vassal.lifeMap.graph.edges.filter(edge => edge.fromNodeId===node.id).length, 0);
  const own = vassal.prestige, before = state.civilization.prestige, gross = state.civilization.treasury.grossIncome;
  const expected = packet(state, vassal);
  vassal.lifeMap.availableNodeIds = [node.id];
  settle(state, applyAll(state, [
    {kind:ActionKinds.VASSAL_ENTER_LIFE_NODE, payload:{nodeId:node.id}},
    {kind:ActionKinds.VASSAL_SELECT_LIFE_OPTION, payload:{nodeId:node.id, optionId:'highest-stat'}},
    {kind:ActionKinds.VASSAL_CONFIRM_LIFE_NODE, payload:{nodeId:node.id}},
  ]), 0);
  assert.equal(state.civilization.prestige-before, expected, 'civ pool receives the rounded combined packet');
  assert.equal(state.civilization.treasury.grossIncome-gross, expected, 'gross income records that packet once');
  assert.equal(vassal.prestige, own, 'the packet stays out of personal Prestige');
  assert.equal(vassal.endedReason, 'retired');
  assert.equal(state.paused, false);
  assert.equal(state.phase, 'simulation');
  assert.equal(state.tSec, 0);
  return expected;
}

// Both holdings contribute fractions that round together, not per site.
{
  const {state, vassal} = boot([[bin('player', 4), bin('external-a', 5)], [bin('neutral', 3), bin('external-a', 6)]]);
  const saved = serializeGameState(state), rng = JSON.stringify(state.rng);
  assert.equal(getRegionPrestigePerNode(state, playerSites(state)[0].regionId), 9/20, 'mixed-site includes every cohort');
  assert.equal(getRegionPrestigePerNode(state, playerSites(state)[1].regionId), 9/20);
  assert.ok(headcount(held(state, 'external-a'))>0);
  assert.equal(getRegionPrestigePerNode(state, held(state, 'external-a').regionId), null, 'Crown site is excluded');
  assert.ok(headcount(held(state, 'frontier'))>0);
  assert.equal(getRegionPrestigePerNode(state, held(state, 'frontier').regionId), null);
  for (const family of ['legacy', 'warlordFounding', 'practiceReform', 'development']) {
    assert.equal(getVassalNodeResolutionGains(state, vassal, family).prestige, Math.round(3+9/20+9/20), family);
  }
  assert.deepEqual(serializeGameState(state), saved);
  assert.equal(JSON.stringify(state.rng), rng);
  assert.equal(state.paused, false);
  assert.equal(state.phase, 'simulation');
  assert.equal(state.tSec, 0);
  assert.equal(payLegacy(state), 4);
  const pool = getVassalCandidatePool(state);
  const index = pool.candidates.findIndex(candidate => candidate.stats?.cunning===1);
  assert.ok(index>=0);
  const timeline = applyAll(state, [{kind:ActionKinds.SETTLEMENT_SELECT_VASSAL, payload:{candidateIndex:index, expectedPoolHash:pool.expectedPoolHash}}]);
  settle(state, timeline, 0);
  const successor = getCurrentLifeMapVassal(state);
  assert.notEqual(successor.founderClassId, 'scholar');
  assert.equal(successor.stats.cunning, 1);
  assert.equal(payLegacy(state), Math.round(3+1+9/20+9/20));
}

// One hostile-heavy holding rounds up; an empty player holding adds nothing.
{
  const {state} = boot([[bin('player', 1), bin('external-a', 9)], []]);
  assert.equal(getRegionPrestigePerNode(state, playerSites(state)[1].regionId), 0);
  assert.equal(payLegacy(state), Math.round(3+10/20));
}

// Unrest 75 still pays a quarter. It is the loss threshold, not a Prestige cliff.
{
  const {state} = boot([[bin('player', 20)], [bin('external-a', 20)]], [75, 75]);
  assert.equal(payLegacy(state), Math.round(3+0.25+0.25));
}

// A captured Crown town joins the next completion. Other Crown towns stay out.
{
  const {state, vassal} = boot([[], []]);
  const town = held(state, 'external-a');
  writePopulationBins(town.detailedState, [bin('external-a', 10)]);
  town.detailedState.control.unrest = 0;
  assert.equal(packet(state, vassal), 3);
  changeController(state, town.regionId, 'player');
  assert.equal(payLegacy(state), Math.round(3+10/20));
}

// The development quote follows a holding lost after the node is open.
{
  const {state, vassal} = boot([[bin('external-a', 16)], [bin('external-a', 16)]]);
  const node = vassal.lifeMap.graph.nodes.find(entry => entry.family==='development');
  vassal.lifeMap.availableNodeIds = [node.id];
  assert.equal(act(state, ActionKinds.VASSAL_ENTER_LIFE_NODE, {nodeId:node.id}).ok, true);
  const saved = serializeGameState(state), rng = JSON.stringify(state.rng);
  const quote = () => getVassalNodeDecisionPresentation(state).vassalProjection.ifSurvives.prestigeIncome;
  assert.equal(quote(), Math.round(3+16/20+16/20));
  assert.deepEqual(serializeGameState(state), saved);
  assert.equal(JSON.stringify(state.rng), rng);
  assert.equal(state.paused, false);
  assert.equal(state.phase, 'simulation');
  assert.equal(state.tSec, 0);
  const away = playerSites(state).find(site => site.regionId!==vassal.locationRegionId);
  changeController(state, away.regionId, 'frontier');
  assert.equal(getRegionPrestigePerNode(state, away.regionId), null);
  assert.equal(quote(), Math.round(3+16/20));
}

// Losing one mixed holding between entry and completion changes the payout.
{
  const {state, vassal} = boot([[bin('player', 4), bin('external-a', 5)], [bin('neutral', 3), bin('external-a', 6)]]);
  const node = vassal.lifeMap.graph.nodes.find(entry => entry.family==='legacy');
  vassal.lifeMap.availableNodeIds = [node.id];
  assert.equal(act(state, ActionKinds.VASSAL_ENTER_LIFE_NODE, {nodeId:node.id}).ok, true);
  assert.equal(packet(state, vassal), 4);
  const away = playerSites(state).find(site => site.regionId!==vassal.locationRegionId);
  changeController(state, away.regionId, 'frontier');
  const before = state.civilization.prestige, gross = state.civilization.treasury.grossIncome, own = vassal.prestige;
  settle(state, applyAll(state, [
    {kind:ActionKinds.VASSAL_SELECT_LIFE_OPTION, payload:{nodeId:node.id, optionId:'highest-stat'}},
    {kind:ActionKinds.VASSAL_CONFIRM_LIFE_NODE, payload:{nodeId:node.id}},
  ]), 0);
  assert.equal(state.civilization.prestige-before, Math.round(3+9/20), 'payout uses the holding that remains');
  assert.equal(state.civilization.treasury.grossIncome-gross, Math.round(3+9/20));
  assert.equal(vassal.prestige, own);
}

// Founding pays the holdings present on the resolution second, not the quote.
{
  const {state, vassal} = boot([[bin('external-a', 16)], [bin('external-a', 16)]]);
  const node = vassal.lifeMap.graph.nodes.find(entry => entry.family==='warlordFounding');
  vassal.lifeMap.availableNodeIds = [node.id];
  const timeline = applyAll(state, [
    {kind:ActionKinds.VASSAL_ENTER_LIFE_NODE, payload:{nodeId:node.id}},
    {kind:ActionKinds.VASSAL_SELECT_LIFE_OPTION, payload:{nodeId:node.id, optionId:'train-estate'}},
    {kind:ActionKinds.VASSAL_CONFIRM_LIFE_NODE, payload:{nodeId:node.id}},
  ]);
  const decision = Math.round(3+16/20+16/20);
  assert.equal(getVassalNodeResolutionGains(state, vassal, 'warlordFounding').prestige, decision);
  assert.equal(vassal.lifeMap.pendingResolution.resolveSec, 6);
  assert.equal(state.civilization.prestige, 20);
  assert.equal(state.civilization.treasury.grossIncome, 0);
  settle(state, timeline, 6);
  const paid = packet(state, getCurrentLifeMapVassal(state));
  assert.equal(state.civilization.prestige-20, paid, 'founder payout follows completion-time population and unrest');
  assert.equal(state.civilization.treasury.grossIncome, paid);
  assert.notEqual(paid, decision);
  assert.equal(getCurrentLifeMapVassal(state).endedReason, null);
  assert.equal(state.tSec, 6);
  assert.equal(state.paused, false);
  assert.equal(state.phase, 'simulation');
}

console.log('Territory Prestige contracts: mixed round-once, successor Cunning, empty cohort, unrest 75, Crown capture, live quote, loss payout, founder resolution replay.');
