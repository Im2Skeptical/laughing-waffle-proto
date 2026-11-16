// Permanent 4th/5th Practice spaces cost 10 and 30, reserved until confirm.
// 9 cannot stage the 4th. 39 can stage the 4th and not the 5th. 40 stages both.
// The 4th stays while the 5th or a card in its new space is staged.
// Unrest is not a storefront: confirm applies the spaces and keeps the
// institutions, but the node packet excludes that holding. 39 residents in
// Unrest plus a 40-resident player holding pays 3 + floor(40 / 20) = 5.
// Expiry and recapture keep the unlocked capacity and the same institutions.
// node scripts/nov14-staged-unrest-test.mjs
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync} from 'node:fs';
import {ActionKinds as A, applyAction} from '../src/model/actions.js';
import {setPaused} from '../src/model/game-model.js';
import {createNewGameState} from '../src/model/new-game.js';
import {deserializeGameState, serializeGameState, syncPhaseToPaused} from '../src/model/state.js';
import {TICKS_PER_REPLAY_SECOND} from '../src/model/replay-second-runner.js';
import {appendActionAtCursor, createTimelineFromInitialState, rebuildStateAtSecond} from '../src/model/timeline/index.js';
import {populationBins, writePopulationBins} from '../src/model/detailed-settlements/population-ledger.js';
import {changeController, controlSummary, resolveControl, stepUnrest} from '../src/model/detailed-settlements/territory.js';
import {getRegionState} from '../src/model/world-state.js';
import {getCurrentLifeMapVassal, getVassalCandidatePool} from '../src/model/vassal-life-map.js';

const bin = (allegiance, count) => ({classId: 'villager', allegiance, specialty: 'ordinary', kind: 'adults', age: null, count});
const head = site => populationBins(site.detailedState).reduce((total, row) => total + row.count, 0);
const ids = site => site.detailedState.practiceSlots.map(slot => slot?.practiceId ?? null);
const checks = [];
function check(name, actual, expected) {
  assert.deepEqual(actual, expected, name);
  checks.push(name);
}
function act(state, kind, payload) {
  setPaused(state, true); syncPhaseToPaused(state);
  const result = applyAction(state, {kind, payload});
  setPaused(state, false); syncPhaseToPaused(state);
  return result;
}
function open(prestige) {
  const state = createNewGameState(0);
  const pool = getVassalCandidatePool(state);
  const index = pool.candidates.findIndex(row => row.founderClassId === 'warrior' && (row.stats?.cunning ?? 0) === 0);
  assert.equal(act(state, A.SETTLEMENT_SELECT_VASSAL, {candidateIndex: index, expectedPoolHash: pool.expectedPoolHash}).ok, true);
  const vassal = getCurrentLifeMapVassal(state);
  assert.equal(vassal.stats.cunning, 0);
  const node = vassal.lifeMap.graph.nodes.find(entry => entry.family === 'practiceReform');
  vassal.lifeMap.availableNodeIds = [node.id];
  assert.equal(act(state, A.VASSAL_ENTER_LIFE_NODE, {nodeId: node.id}).ok, true);
  const choice = vassal.lifeMap.nodeStates[node.id].shopSelection.choices.find(entry => entry.enabled && entry.id !== 'random');
  assert.equal(act(state, A.VASSAL_SELECT_LIFE_OPTION, {nodeId: node.id, optionId: choice.id}).ok, true);
  const sites = state.world.sites.filter(site => site.detailedState && getRegionState(state, site.regionId)?.controller === 'player');
  const home = sites.find(site => site.regionId === vassal.locationRegionId);
  const away = sites.find(site => site !== home);
  state.civilization.prestige = prestige;
  state.civilization.treasury.grossIncome = 0;
  return {state, vassal, node, home, away, own: vassal.prestige};
}
const buy = (box, offerId, extra = {}) => act(box.state, A.VASSAL_PURCHASE_SHOP_OFFER, {nodeId: box.node.id, offerId, ...extra});
const undo = (box, offerId) => act(box.state, A.VASSAL_UNDO_SHOP_PURCHASE, {nodeId: box.node.id, offerId});
function boundary(prestige, fifth) {
  const box = open(prestige);
  const before = serializeGameState(box.state);
  const fourth = buy(box, 'practice-slot:4');
  const next = fourth.ok ? buy(box, 'practice-slot:5') : {ok: false, reason: 'not-staged'};
  check(`boundary:${prestige}`, [fourth.ok, fourth.reason ?? null, next.ok, next.reason ?? null, box.home.detailedState.unlockedPracticeSlots, box.state.civilization.prestige], [prestige >= 10, prestige >= 10 ? null : 'practiceUnlockUnavailable', fifth, fifth ? null : (prestige >= 10 ? 'practiceUnlockUnavailable' : 'not-staged'), 3, prestige]);
  if (!fourth.ok) check(`pure:${prestige}`, serializeGameState(box.state), before);
  return box;
}
{
  boundary(9, false);
  const ten = open(10);
  assert.equal(buy(ten, 'practice-slot:4').ok, true);
  assert.equal(undo(ten, 'practice-slot:4').ok, true);
  const mid = open(39);
  assert.equal(buy(mid, 'practice-slot:4').ok, true);
  const refused = buy(mid, 'practice-slot:5');
  check('thirty-nine', [refused.ok, refused.reason, mid.home.detailedState.unlockedPracticeSlots, mid.state.civilization.prestige], [false, 'practiceUnlockUnavailable', 3, 39]);
  const both = open(40);
  assert.equal(buy(both, 'practice-slot:4').ok, true);
  assert.equal(buy(both, 'practice-slot:5').ok, true);
  const blocked = undo(both, 'practice-slot:4');
  check('undo-blocked', [blocked.ok, blocked.reason, both.state.civilization.prestige], [false, 'practiceUnlockInUse', 40]);
  assert.equal(undo(both, 'practice-slot:5').ok, true);
  assert.equal(undo(both, 'practice-slot:4').ok, true);
  check('undo-restored', [both.vassal.lifeMap.nodeStates[both.node.id].purchasedOffers.length, both.home.detailedState.unlockedPracticeSlots], [0, 3]);
}
{
  const box = open(40);
  const kept = ids(box.home);
  assert.equal(buy(box, 'practice-slot:4').ok, true);
  assert.equal(buy(box, 'practice-slot:5').ok, true);
  const card = box.vassal.lifeMap.nodeStates[box.node.id].inventory.find(offer => offer.intervention?.mode === 'learn');
  assert.equal(buy(box, card.offerId, {toIndex: 4}).ok, true);
  writePopulationBins(box.home.detailedState, [bin('neutral', 39)]);
  writePopulationBins(box.away.detailedState, [bin('player', 40)]);
  resolveControl(box.state);
  check('staged-during-unrest', [controlSummary(box.state, box.home.regionId).status, box.home.neutral ?? null, box.home.detailedState.unlockedPracticeSlots, ids(box.home), head(box.home), getRegionState(box.state, box.away.regionId).controller, box.state.civilization.prestige], ['unrest', null, 3, kept, 39, 'player', 40]);
  const occupied = undo(box, 'practice-slot:5');
  check('occupied-unlock', [occupied.ok, occupied.reason], [false, 'practiceUnlockInUse']);
  assert.equal(undo(box, card.offerId).ok, true);
  assert.equal(undo(box, 'practice-slot:5').ok, true);
  assert.equal(undo(box, 'practice-slot:4').ok, true);
  check('unrest-undo', [box.home.detailedState.unlockedPracticeSlots, ids(box.home), box.state.civilization.prestige], [3, kept, 40]);
}
{
  const box = open(40);
  const kept = ids(box.home);
  const institutions = JSON.parse(JSON.stringify(box.home.detailedState.practiceSlots));
  writePopulationBins(box.home.detailedState, [bin('neutral', 39)]);
  writePopulationBins(box.away.detailedState, [bin('player', 40)]);
  resolveControl(box.state);
  assert.equal(buy(box, 'practice-slot:4').ok, true);
  assert.equal(buy(box, 'practice-slot:5').ok, true);
  box.state.civilization.prestige = 39;
  const reserved = serializeGameState(box.state);
  const early = act(box.state, A.VASSAL_CONFIRM_LIFE_NODE, {nodeId: box.node.id});
  check('confirm-boundary', [early.ok, early.reason, box.home.detailedState.unlockedPracticeSlots, box.state.civilization.prestige, box.state.civilization.treasury.grossIncome], [false, 'insufficientPrestige', 3, 39, 0]);
  check('confirm-pure', serializeGameState(box.state), reserved);
  assert.equal(undo(box, 'practice-slot:5').ok, true);
  assert.equal(undo(box, 'practice-slot:4').ok, true);
  box.state.civilization.prestige = 40;
  const actions = [
    {kind: A.VASSAL_PURCHASE_SHOP_OFFER, payload: {nodeId: box.node.id, offerId: 'practice-slot:4'}},
    {kind: A.VASSAL_PURCHASE_SHOP_OFFER, payload: {nodeId: box.node.id, offerId: 'practice-slot:5'}},
    {kind: A.VASSAL_CONFIRM_LIFE_NODE, payload: {nodeId: box.node.id}},
  ];
  const timeline = createTimelineFromInitialState(box.state);
  for (const action of actions) {
    assert.equal(appendActionAtCursor(timeline, action, box.state).ok, true, action.kind);
    const result = act(box.state, action.kind, action.payload);
    assert.equal(result.ok, true, result.reason ?? action.kind);
  }
  check('confirmed', [box.home.detailedState.unlockedPracticeSlots, ids(box.home), box.state.civilization.prestige, box.state.civilization.treasury.grossIncome, box.vassal.prestige, box.state.civilization.chaos.monsterPressure, box.vassal.lifeMap.pendingResolution ?? null], [5, kept, 5, 5, box.own, 0, null]);
  check('clock', [box.state.paused, box.state.phase, box.state.tSec], [false, 'simulation', 0]);
  const rebuilt = rebuildStateAtSecond(timeline, 0);
  assert.equal(rebuilt.ok, true, rebuilt.reason);
  check('replay', serializeGameState(rebuilt.state), serializeGameState(box.state));
  check('save', serializeGameState(deserializeGameState(serializeGameState(box.state))), serializeGameState(box.state));
  const episode = box.home.detailedState.control.unrest;
  const year = 4 * box.state.gameConfig.settings.values.seasonDurationSec;
  check('ten-year', episode.untilSec - episode.startedSec, 10 * year);
  // Unit expiry fixture: place both clock axes at the captured boundary.
  box.state.tSec = episode.untilSec;
  box.state.simStepIndex = episode.untilSec * TICKS_PER_REPLAY_SECOND;
  stepUnrest(box.state);
  check('expired', [box.home.detailedState.control.unrest, getRegionState(box.state, box.home.regionId).controller, Boolean(box.home.neutral), box.home.detailedState.unlockedPracticeSlots, ids(box.home), head(box.home)], [null, 'frontier', true, 5, kept, 39]);
  check('expired-institutions', box.home.detailedState.practiceSlots, institutions);
  check('expired-save', serializeGameState(deserializeGameState(serializeGameState(box.state))), serializeGameState(box.state));
  changeController(box.state, box.home.regionId, 'player');
  check('recaptured-institutions', box.home.detailedState.practiceSlots, institutions);
  check('recaptured', [getRegionState(box.state, box.home.regionId).controller, box.home.detailedState.control.unrest, box.home.neutral ?? null, box.home.detailedState.unlockedPracticeSlots, ids(box.home)], ['player', null, null, 5, kept]);
}

mkdirSync('artifacts/grok-nov14-spend/recent-interactions', {recursive: true});
writeFileSync('artifacts/grok-nov14-spend/recent-interactions/staged-matrix.json', JSON.stringify({
  costs: {4: 10, 5: 30}, boundaries: {9: 'refuse-4', 10: 'stage-4', 39: 'stage-4-refuse-5', 40: 'stage-both'},
  unrestConfirm: {spent: 40, packet: 5, unlocked: 5, holdingResidents: 39, otherResidents: 40},
  checks: checks.length,
}, null, 2));
console.log(`[nov14-staged-unrest] checks=${checks.length}`);
