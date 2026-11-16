// Authored packet: a warrior with cunning 0 pays 3, plus floor(residents / 20)
// for each player holding. 19+21 pays 4. Aggregate floor(40 / 20)+3 would be 5.
// Development quotes are reads. Legacy completion pays the later world.
// Expiry uses the Unrest stepper at its captured second, not a skipped decade.
// node scripts/nov14-unrest-payout-test.mjs
import assert from 'node:assert/strict';
import {mkdirSync, writeFileSync} from 'node:fs';
import {ActionKinds as A, applyAction} from '../src/model/actions.js';
import {setPaused} from '../src/model/game-model.js';
import {createNewGameState} from '../src/model/new-game.js';
import {serializeGameState, syncPhaseToPaused} from '../src/model/state.js';
import {appendActionAtCursor, createTimelineFromInitialState, rebuildStateAtSecond} from '../src/model/timeline/index.js';
import {TICKS_PER_REPLAY_SECOND} from '../src/model/replay-second-runner.js';
import {populationBins, writePopulationBins} from '../src/model/detailed-settlements/population-ledger.js';
import {changeController, resolveControl, stepUnrest} from '../src/model/detailed-settlements/territory.js';
import {getRegionState} from '../src/model/world-state.js';
import {getCurrentLifeMapVassal, getVassalCandidatePool, getVassalNodeDecisionPresentation, getVassalNodeResolutionGains} from '../src/model/vassal-life-map.js';

const PACKET = {'19+19': 3, '19+21': 4, '20+20': 5, '39+1': 4};
const bin = (allegiance, count) => ({classId: 'villager', allegiance, specialty: 'ordinary', kind: 'adults', age: null, count});
const players = state => state.world.sites.filter(site => site.detailedState && getRegionState(state, site.regionId)?.controller === 'player');
const head = site => populationBins(site.detailedState).reduce((total, row) => total + row.count, 0);
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
function place(seed, homeCount, awayCount, allegiance = 'player') {
  const state = createNewGameState(seed);
  const pool = getVassalCandidatePool(state);
  const index = pool.candidates.findIndex(row => row.founderClassId === 'warrior' && (row.stats?.cunning ?? 0) === 0);
  assert.ok(index >= 0, `seed ${seed} warrior`);
  assert.equal(act(state, A.SETTLEMENT_SELECT_VASSAL, {candidateIndex: index, expectedPoolHash: pool.expectedPoolHash}).ok, true);
  const vassal = getCurrentLifeMapVassal(state);
  assert.equal(vassal.stats.cunning, 0);
  const sites = players(state);
  assert.equal(sites.length, 2, `seed ${seed} holdings`);
  const home = sites.find(site => site.regionId === vassal.locationRegionId);
  const away = sites.find(site => site !== home);
  writePopulationBins(home.detailedState, [bin('player', homeCount)]);
  writePopulationBins(away.detailedState, [bin(allegiance, awayCount)]);
  return {state, vassal, home, away};
}
function quote(boxed, expected, label) {
  const node = boxed.vassal.lifeMap.graph.nodes.find(entry => entry.family === 'development');
  boxed.vassal.lifeMap.availableNodeIds = [node.id];
  assert.equal(act(boxed.state, A.VASSAL_ENTER_LIFE_NODE, {nodeId: node.id}).ok, true, label);
  const before = serializeGameState(boxed.state);
  const shown = getVassalNodeDecisionPresentation(boxed.state, node.id).vassalProjection.ifSurvives.prestigeIncome;
  check(`quote:${label}`, shown, expected);
  check(`quote-pure:${label}`, serializeGameState(boxed.state), before);
}
function pay(boxed, expected, label) {
  const node = boxed.vassal.lifeMap.graph.nodes.find(entry => entry.family === 'legacy');
  boxed.vassal.lifeMap.availableNodeIds = [node.id];
  const at = boxed.state.tSec, own = boxed.vassal.prestige;
  const before = boxed.state.civilization.prestige, gross = boxed.state.civilization.treasury.grossIncome;
  const actions = [
    {kind: A.VASSAL_ENTER_LIFE_NODE, payload: {nodeId: node.id}},
    {kind: A.VASSAL_SELECT_LIFE_OPTION, payload: {nodeId: node.id, optionId: 'highest-stat'}},
    {kind: A.VASSAL_CONFIRM_LIFE_NODE, payload: {nodeId: node.id}},
  ];
  const timeline = createTimelineFromInitialState(boxed.state);
  for (const action of actions) {
    assert.equal(appendActionAtCursor(timeline, action, boxed.state).ok, true, label);
    const result = act(boxed.state, action.kind, action.payload);
    assert.equal(result.ok, true, `${label}:${result.reason ?? ''}`);
  }
  check(`pay:${label}`, [boxed.state.civilization.prestige - before, boxed.state.civilization.treasury.grossIncome - gross, boxed.vassal.prestige], [expected, expected, own]);
  check(`clock:${label}`, [boxed.state.paused, boxed.state.phase, boxed.state.tSec], [false, 'simulation', at]);
  const rebuilt = rebuildStateAtSecond(timeline, at);
  assert.equal(rebuilt.ok, true, rebuilt.reason ?? label);
  check(`replay:${label}`, serializeGameState(rebuilt.state), serializeGameState(boxed.state));
}
function lose(boxed) {
  resolveControl(boxed.state);
}
function expire(boxed) {
  lose(boxed);
  const episode = boxed.away.detailedState.control.unrest;
  boxed.state.tSec = episode.untilSec;
  boxed.state.simStepIndex = episode.untilSec * TICKS_PER_REPLAY_SECOND;
  stepUnrest(boxed.state);
}

for (const seed of [0, 42]) {
  for (const [label, expected] of Object.entries(PACKET)) {
    const [homeCount, awayCount] = label.split('+').map(Number);
    quote(place(seed, homeCount, awayCount), expected, `${seed}:${label}`);
    pay(place(seed, homeCount, awayCount), expected, `${seed}:${label}`);
  }
}

const held = place(0, 19, 21, 'neutral');
lose(held);
const year = 4 * held.state.gameConfig.settings.values.seasonDurationSec;
check('unrest-holding', [getRegionState(held.state, held.away.regionId).controller, held.away.neutral ?? null, head(held.away), head(held.home), held.away.detailedState.control.unrest.untilSec], ['frontier', null, 21, 19, 10 * year]);
quote(place(0, 19, 21), 4, 'before-unrest');
quote(held, 3, 'unrest');
{
  const boxed = place(0, 19, 21, 'neutral');
  lose(boxed);
  pay(boxed, 3, 'unrest');
}
{
  check('ten-year', held.away.detailedState.control.unrest.untilSec - held.away.detailedState.control.unrest.startedSec, 10 * year);
  const expired = place(0, 19, 21, 'neutral');
  expire(expired);
  check('expired-holding', [expired.away.detailedState.control.unrest, getRegionState(expired.state, expired.away.regionId).controller, Boolean(expired.away.neutral), head(expired.away)], [null, 'frontier', true, 21]);
  quote(expired, 3, 'expired');
  const paying = place(0, 19, 21, 'neutral');
  expire(paying);
  pay(paying, 3, 'expired');
}
{
  quote(place(0, 19, 21), 4, 'before-growth');
  const grew = place(0, 39, 21);
  quote(grew, 5, 'grew');
  pay(place(0, 39, 21), 5, 'grew');
}
{
  const boxed = place(0, 19, 21);
  changeController(boxed.state, boxed.away.regionId, 'external-a', {military: true});
  check('captured', [getRegionState(boxed.state, boxed.away.regionId).controller, boxed.away.detailedState.control.unrest, head(boxed.away), boxed.away.detailedState.practiceSlots.filter(Boolean).length], ['external-a', null, 21, 3]);
  quote(boxed, 3, 'captured');
  const paying = place(0, 19, 21);
  changeController(paying.state, paying.away.regionId, 'external-a', {military: true});
  pay(paying, 3, 'captured');
}
{
  const boxed = place(0, 19, 21, 'neutral');
  lose(boxed);
  writePopulationBins(boxed.away.detailedState, [bin('neutral', 40)]);
  const ids = boxed.away.detailedState.practiceSlots.map(slot => slot?.practiceId ?? null);
  changeController(boxed.state, boxed.away.regionId, 'player');
  check('recaptured', [getRegionState(boxed.state, boxed.away.regionId).controller, boxed.away.detailedState.control.unrest, head(boxed.away), boxed.away.detailedState.practiceSlots.map(slot => slot?.practiceId ?? null)], ['player', null, 40, ids]);
  quote(boxed, 5, 'recaptured');
  const paying = place(0, 19, 21, 'neutral');
  lose(paying);
  writePopulationBins(paying.away.detailedState, [bin('neutral', 40)]);
  changeController(paying.state, paying.away.regionId, 'player');
  pay(paying, 5, 'recaptured');
}

// Authored decision-boundary fixtures: read the same Vassal's income, enter
// Legacy, then the world changes before confirm. Rebuild covers the confirm
// from that changed decision state; it does not simulate the direct transitions.
function changeDuringDecision(boxed, beforeQuote, expected, label, transition) {
  const untouched = serializeGameState(boxed.state);
  check('pending-income:' + label, getVassalNodeResolutionGains(boxed.state, boxed.vassal, 'legacy').prestige, beforeQuote);
  check('pending-read-pure:' + label, serializeGameState(boxed.state), untouched);
  const node = boxed.vassal.lifeMap.graph.nodes.find(entry => entry.family === 'legacy');
  boxed.vassal.lifeMap.availableNodeIds = [node.id];
  assert.equal(act(boxed.state, A.VASSAL_ENTER_LIFE_NODE, {nodeId: node.id}).ok, true);
  assert.equal(act(boxed.state, A.VASSAL_SELECT_LIFE_OPTION, {nodeId: node.id, optionId: 'highest-stat'}).ok, true);
  transition(boxed);
  const before = boxed.state.civilization.prestige, gross = boxed.state.civilization.treasury.grossIncome;
  const timeline = createTimelineFromInitialState(boxed.state);
  const action = {kind: A.VASSAL_CONFIRM_LIFE_NODE, payload: {nodeId: node.id}};
  assert.equal(act(boxed.state, action.kind, action.payload).ok, true);
  assert.equal(appendActionAtCursor(timeline, action, boxed.state).ok, true);
  check('changed-payment:' + label, [boxed.state.civilization.prestige - before, boxed.state.civilization.treasury.grossIncome - gross], [expected, expected]);
  const rebuilt = rebuildStateAtSecond(timeline, boxed.state.tSec);
  assert.equal(rebuilt.ok, true);
  check('changed-confirm-replay:' + label, serializeGameState(rebuilt.state), serializeGameState(boxed.state));
}
changeDuringDecision(place(0, 19, 21, 'neutral'), 4, 3, 'enter-unrest', lose);
changeDuringDecision(place(0, 19, 21), 4, 5, 'grow', box => writePopulationBins(box.home.detailedState, [bin('player', 39)]));
changeDuringDecision(place(0, 19, 21), 4, 3, 'capture', box => changeController(box.state, box.away.regionId, 'external-a', {military: true}));
const pendingExpiry = place(0, 19, 21, 'neutral');
lose(pendingExpiry);
changeDuringDecision(pendingExpiry, 3, 3, 'expire-unrest', box => {
  box.state.tSec = box.away.detailedState.control.unrest.untilSec;
  box.state.simStepIndex = box.state.tSec * TICKS_PER_REPLAY_SECOND;
  stepUnrest(box.state);
});
const pendingRecapture = place(0, 19, 21, 'neutral');
lose(pendingRecapture);
changeDuringDecision(pendingRecapture, 3, 5, 'recapture', box => {
  writePopulationBins(box.away.detailedState, [bin('neutral', 40)]);
  changeController(box.state, box.away.regionId, 'player');
});

mkdirSync('artifacts/grok-nov14-spend/recent-interactions', {recursive: true});
writeFileSync('artifacts/grok-nov14-spend/recent-interactions/payout-matrix.json', JSON.stringify({
  personal: 3, divisor: 20, seeds: [0, 42], held: PACKET,
  aggregateWouldPay: {'19+19': 4, '19+21': 5, '20+20': 5, '39+1': 5},
  quoted4Then: {unrest: 3, expired: 3, grew: 5, captured: 3, recaptured: 5},
  checks: checks.length,
}, null, 2));
console.log(`[nov14-unrest-payout] checks=${checks.length}`);
