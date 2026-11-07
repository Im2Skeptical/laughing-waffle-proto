// Ordinary full-map Synthesis. Oracle: local stock, then a shared-edge live road held by the influence allegiance or the settlement holder. Queries must not spend.
import assert from 'node:assert/strict';
import { createNewGameState } from '../src/model/new-game.js';
import { serializeGameState, deserializeGameState } from '../src/model/state.js';
import { getDetailedPracticeDef } from '../src/model/game-config.js';
import { getVassalCandidatePool, selectLifeMapVassal } from '../src/model/vassal-life-map.js';
import { applyClassAction } from '../src/model/vassal-life-map/class-actions.js';
import { synthesisContributors } from '../src/model/detailed-settlements/synthesis.js';
import { stockOutputBreakdown } from '../src/model/detailed-settlements/stock.js';
import { assignDetailedSettlementWorkers } from '../src/model/detailed-settlements/workers.js';
import { writePopulationBins } from '../src/model/detailed-settlements/population-ledger.js';
import { changeController } from '../src/model/detailed-settlements/territory.js';
import { keywordAccess, keywordOutputAmount, keywordOutputSources } from '../src/model/practice-keywords.js';
import { getAdjacentRegionIds, getConnectedRegionIds, getRegionState, addWorldConnection } from '../src/model/world-state.js';
const HOME = 'R11', ALLY = 'R10', EDGE = 'R19', FAR = 'R01', MARKET = 'R12', CROWN = 'R18';
const cases = [];
let seq = 0;
const clone = state => deserializeGameState(serializeGameState(state));
const piece = (id, { stock = 0, allegiance = null, charge = 0 } = {}) => ({
  practiceId: id, tier: 'bronze', instanceId: `supply:${++seq}:${id}`, charge, work: 0,
  ...(allegiance ? { allegiance } : { stock }),
});
const adult = (count, allegiance, specialty) => ({ classId: 'villager', allegiance, specialty, kind: 'adults', age: null, count });
const scholars = (...extra) => [adult(5, 'player', 'scholar'), adult(40, 'player', 'ordinary'), ...extra];
const sorted = ids => [...ids].sort();
function check(name, fn) {
  cases.push(name); console.log('CASE ' + name);
  try { fn(); console.log('PASS ' + name); }
  catch (error) { console.log('FAIL ' + name); error.message = name + ' :: ' + error.message; throw error; }
}
function watch(state, fn) {
  const before = serializeGameState(state), live = [state.paused, state.phase, state.tSec, structuredClone(state.rng)];
  const value = fn();
  assert.deepEqual(serializeGameState(state), before);
  assert.deepEqual([state.paused, state.phase, state.tSec, state.rng], live);
  return value;
}
const read = (state, region = HOME, exclude = 'floodAlmanacs') => watch(state, () => synthesisContributors(state, region, exclude).map(row => row.practiceId));
const bonus = (state, region, scale, id) => watch(state, () => keywordOutputAmount(state, region, scale, id));
const same = (state, ids, region = HOME, exclude = 'floodAlmanacs') => assert.deepEqual(sorted(read(state, region, exclude)), sorted(ids));
const site = (state, regionId) => state.world.sites.find(entry => entry.regionId === regionId);
function silence(state) {
  for (const entry of state.world.sites) {
    for (const slot of entry.detailedState?.practiceSlots ?? []) if (slot && 'stock' in slot) slot.stock = 0;
    for (const stock of entry.neutral?.stocks ?? []) stock.stock = 0;
  }
}
function board(state, regionId, slots, people = scholars()) {
  const entry = site(state, regionId);
  entry.simulationMode = 'detailed';
  entry.detailedState.practiceSlots = [...slots, null, null, null, null].slice(0, 5);
  entry.detailedState.structureSlots.fill(null);
  writePopulationBins(entry.detailedState, people);
  return entry;
}
const open = () => { const state = clone(base); silence(state); return state; };
const base = createNewGameState(1867);
const founder = getVassalCandidatePool(base).candidates.find(candidate => candidate.founderClassId === 'scholar');
assert.equal(selectLifeMapVassal(base, 1, null, founder).ok, true);
const lineage = base.civilization.vassalLineage, vassal = lineage.vassalsById[lineage.currentVassalId];
applyClassAction(base, vassal, { kind: 'train', classId: 'scholar', establishClass: true, count: 2 });
base.season = 'winter'; base.currentSeason = 'winter';
assert.deepEqual([vassal.classId, base.rulesetId, base.gameConfig.keywordPrototype], ['scholar', 'full-map-redesign-v1', undefined]);
check('authored adjacent road and edge-only neighbours', () => {
  const adjacent = getAdjacentRegionIds(base, HOME), connected = getConnectedRegionIds(base, HOME);
  assert.deepEqual([adjacent.includes(ALLY), connected.includes(ALLY), adjacent.includes(EDGE), connected.includes(EDGE), adjacent.includes(FAR), !!(adjacent.includes(MARKET) && connected.includes(MARKET) && site(base, MARKET).neutral)], [true, true, true, false, false, true]);
  assert.equal(getRegionState(base, HOME).controller, 'player');
  assert.equal(getRegionState(base, CROWN).controller, 'external-a');
});
check('self exclusion while the winter host is supplied', () => {
  const state = open();
  board(state, HOME, [piece('floodAlmanacs'), piece('irrigating', { stock: 1 }), piece('marginalia'), piece('scholarship'), piece('cropRotation')]);
  assert.equal(read(state).includes('floodAlmanacs'), false);
  assert.equal(read(state, HOME, null).includes('floodAlmanacs'), true);
});
check('unmet consume', () => {
  const state = open();
  board(state, HOME, [piece('floodAlmanacs'), piece('irrigating', { stock: 1 }), piece('scholarship'), piece('marginalia'), null]);
  assert.equal(read(state).includes('scholarship'), false);
});
check('unmet require', () => {
  const state = open();
  board(state, HOME, [piece('floodAlmanacs'), piece('irrigating', { stock: 1 }), piece('cropRotation'), piece('marginalia'), null]);
  assert.equal(read(state).includes('cropRotation'), false);
});
check('charge and trigger readiness are irrelevant', () => {
  const state = open();
  const host = board(state, HOME, [piece('floodAlmanacs'), piece('irrigating', { stock: 1 }), piece('marginalia', { charge: 0 }), piece('copyingTexts', { charge: 0 }), piece('recordKeeping')]);
  assert.equal(getDetailedPracticeDef(state, 'marginalia').mode + host.detailedState.practiceSlots[2].charge, 'charge0');
  same(state, ['copyingTexts', 'irrigating', 'marginalia', 'recordKeeping']);
});
check('two recipes share one record without reserving it', () => {
  const state = open();
  board(state, HOME, [piece('floodAlmanacs'), piece('recordKeeping', { stock: 1 }), piece('scholarship'), piece('cropRotation'), piece('fm_publicDisputation', { allegiance: 'player' })]);
  same(state, ['cropRotation', 'fm_publicDisputation', 'recordKeeping', 'scholarship']);
  same(state, ['cropRotation', 'fm_publicDisputation', 'recordKeeping', 'scholarship']);
});
check('local stock ignores influence allegiance', () => {
  const state = open();
  board(state, HOME, [piece('recordKeeping', { stock: 1 }), piece('fm_publicDisputation', { allegiance: 'external-a' }), piece('scholarship'), null, null], scholars(adult(1, 'external-a', 'scholar')));
  same(state, ['fm_publicDisputation', 'recordKeeping', 'scholarship'], HOME, null);
});
check('adjacent road faction provider', () => {
  const state = open();
  board(state, HOME, [piece('floodAlmanacs'), piece('scholarship'), piece('cropRotation'), null, null]);
  board(state, ALLY, [piece('recordKeeping', { stock: 1 })]);
  same(state, ['cropRotation', 'scholarship']);
});
check('shared edge without road', () => {
  const state = open();
  board(state, HOME, [piece('floodAlmanacs'), piece('scholarship'), null, null, null]);
  changeController(state, EDGE, 'player');
  board(state, EDGE, [piece('recordKeeping', { stock: 1 })]);
  assert.equal(getAdjacentRegionIds(state, HOME).includes(EDGE) && !getConnectedRegionIds(state, HOME).includes(EDGE), true);
  same(state, []);
});
check('road without shared edge', () => {
  const state = open();
  board(state, HOME, [piece('floodAlmanacs'), piece('scholarship'), null, null, null]);
  changeController(state, FAR, 'player');
  board(state, FAR, [piece('recordKeeping', { stock: 1 })]);
  assert.equal(addWorldConnection(state, HOME, FAR).ok, false);
  state.world.connections.push({ regionAId: HOME, regionBId: FAR });
  assert.equal(getConnectedRegionIds(state, HOME).includes(FAR) && !getAdjacentRegionIds(state, HOME).includes(FAR), true);
  same(state, []);
});
check('influence instance beneficiary', () => {
  const state = open();
  board(state, HOME, [piece('floodAlmanacs'), piece('scholarship'), piece('fm_publicDisputation', { allegiance: 'external-a' }), null, null], scholars(adult(1, 'external-a', 'scholar')));
  board(state, ALLY, [piece('recordKeeping', { stock: 1 })]);
  assert.equal(addWorldConnection(state, HOME, EDGE).ok, true);
  board(state, EDGE, [piece('recordKeeping', { stock: 1 })]);
  same(state, ['fm_publicDisputation', 'scholarship']);
  site(state, ALLY).detailedState.practiceSlots[0].stock = 0;
  same(state, ['fm_publicDisputation']);
  site(state, EDGE).detailedState.practiceSlots[0].stock = 0;
  site(state, ALLY).detailedState.practiceSlots[0].stock = 1;
  same(state, ['scholarship']);
});
check('ownership changes before each pure query', () => {
  const state = open();
  board(state, HOME, [piece('floodAlmanacs'), piece('scholarship'), piece('fm_publicDisputation', { allegiance: 'external-a' }), null, null], scholars(adult(1, 'external-a', 'scholar')));
  board(state, ALLY, [piece('recordKeeping', { stock: 1 })]);
  same(state, ['scholarship']);
  changeController(state, ALLY, 'external-a');
  same(state, ['fm_publicDisputation']);
  changeController(state, ALLY, 'player');
  same(state, ['scholarship']);
});
check('neutral market cannot satisfy require', () => {
  const state = open();
  board(state, HOME, [piece('floodAlmanacs'), piece('fm_hearthBarter'), piece('marginalia'), null, null]);
  site(state, MARKET).neutral.stocks.find(stock => stock.traits.includes('Edible')).stock = 4;
  assert.equal(read(state).includes('fm_hearthBarter'), false);
});
check('priced consume uses the neutral market and spends nothing', () => {
  const state = open();
  board(state, HOME, [piece('floodAlmanacs'), piece('fm_hearthBarter', { stock: 2 }), piece('fm_spoiledStores', { charge: 0 }), null, null]);
  site(state, MARKET).neutral.stocks.find(stock => stock.traits.includes('Edible')).stock = 4;
  assert.equal(getDetailedPracticeDef(state, 'fm_spoiledStores').activation.type, 'death');
  same(state, ['fm_spoiledStores']);
});
check('unpaid consume stays unmet', () => {
  const state = open();
  board(state, HOME, [piece('floodAlmanacs'), piece('fm_hearthBarter'), piece('fm_spoiledStores'), null, null]);
  site(state, MARKET).neutral.stocks.find(stock => stock.traits.includes('Edible')).stock = 4;
  same(state, []);
});
check('unheld settlement keeps local storefront supply and drops the road', () => {
  const state = open();
  const host = board(state, HOME, [piece('floodAlmanacs'), piece('recordKeeping', { stock: 1 }), piece('scholarship'), piece('fm_hearthBarter'), piece('fm_spoiledStores')]);
  board(state, ALLY, [piece('recordKeeping', { stock: 1 })]);
  assert.equal(read(state).includes('scholarship'), true);
  assert.equal(host.town.market.stocks.some(stock => stock.traits.includes('Edible') && stock.stock > 0), true);
  changeController(state, HOME, 'frontier');
  assert.equal(host.detailedState.practiceSlots[1].stock, 1);
  assert.equal(read(state).includes('scholarship'), false);
  same(state, ['fm_hearthBarter', 'fm_spoiledStores', 'recordKeeping']);
});
check('scholar staffing ignores ordinary tokens', () => {
  const state = open();
  board(state, HOME, [piece('marginalia'), piece('copyingTexts'), null, null, null], [adult(1, 'player', 'scholar'), adult(40, 'player', 'ordinary')]);
  const assigned = assignDetailedSettlementWorkers(state, HOME);
  assert.equal(assigned[1].tokens.some(token => token.specialist === 'scholar'), false);
  assert.ok(assigned[1].tokens.length > 0);
  same(state, ['marginalia'], HOME, null);
});
check('active class only on player holdings', () => {
  const state = open();
  board(state, CROWN, [piece('floodAlmanacs'), piece('irrigating', { stock: 1 }), null, null, null]);
  const scale = getDetailedPracticeDef(state, 'floodAlmanacs').keywordOutputScale;
  assert.equal(watch(state, () => keywordAccess(state, 'synthesis', CROWN).active), false);
  assert.equal(read(state, CROWN).includes('irrigating'), true);
  assert.equal(bonus(state, CROWN, scale, 'floodAlmanacs'), 0);
  changeController(state, CROWN, 'player');
  assert.equal(bonus(state, CROWN, scale, 'floodAlmanacs'), 1);
});
check('captured per and cap ledger', () => {
  const state = open();
  const host = board(state, HOME, [piece('floodAlmanacs'), piece('irrigating', { stock: 1 }), piece('marginalia', { charge: 0 }), piece('copyingTexts', { charge: 0 }), piece('recordKeeping')]);
  const definition = state.gameConfig.gamepieces.practices.floodAlmanacs;
  const slot = host.detailedState.practiceSlots[0];
  definition.keywordOutputScale = { keyword: 'synthesis', per: 2, amount: 3, cap: 1 };
  assert.equal(bonus(state, HOME, definition.keywordOutputScale, definition.id), 3);
  assert.deepEqual(watch(state, () => keywordOutputSources(state, HOME, definition).map(source => source.label)), ['Irrigating, Marginalia']);
  assert.equal(watch(state, () => stockOutputBreakdown(state, host.detailedState, slot).multiplier), 4);
  definition.keywordOutputScale = { keyword: 'synthesis', per: 2, amount: 3, cap: 2 };
  assert.equal(bonus(state, HOME, definition.keywordOutputScale, definition.id), 6);
  assert.deepEqual(watch(state, () => keywordOutputSources(state, HOME, definition).map(source => source.label)), ['Irrigating, Marginalia', 'Copying Texts, Record Keeping']);
  assert.equal(watch(state, () => stockOutputBreakdown(state, host.detailedState, slot).multiplier), 7);
});
check('json continuation repeats the pure score', () => {
  const state = open();
  board(state, HOME, [piece('floodAlmanacs'), piece('irrigating', { stock: 1 }), piece('marginalia', { charge: 0 }), piece('scholarship'), null]);
  const saved = serializeGameState(state), loaded = deserializeGameState(saved);
  assert.deepEqual(read(loaded), read(state));
  assert.deepEqual(serializeGameState(loaded), saved);
});
console.log('[synthesis-supply] OK cases ' + cases.length);
