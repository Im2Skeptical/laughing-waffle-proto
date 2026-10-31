// Undo of a replacement learn must restore the public preview.
// Pause policy: each draft action pauses (phase planning), applies, then resumes.
// Net paused/phase/tSec stay false / simulation / 0. No ticks. Rebuild uses the
// replay pause exemption at that second. Empty-shop confirm is 109 phases and is
// not a refunded purchase. Staging reserves Prestige; it does not spend it.
// node scripts/shop-undo-replay-test.mjs
import {mkdirSync, writeFileSync} from 'node:fs';
import {ActionKinds as A, applyAction} from '../src/model/actions.js';
import {setPaused} from '../src/model/game-model.js';
import {fiveSlots, practiceSlot, setFixturePopulation} from '../src/model/dev-lab/fixtures.js';
import {createLabNodeSandbox} from '../src/model/dev-lab/node-sandbox.js';
import {deserializeGameState, serializeGameState, syncPhaseToPaused} from '../src/model/state.js';
import {appendActionAtCursor, createTimelineFromInitialState, rebuildStateAtSecond} from '../src/model/timeline/index.js';
import {getCurrentLifeMapVassal, getVassalNodeDecisionPresentation} from '../src/model/vassal-life-map.js';
import {resolveLifeMapShopPrice} from '../src/model/life-map-balance.js';

const DIR = 'artifacts/grok-oct24-spend/shop-undo';
const LIVE = ['logging', 'forage', 'dryFarming', 'quarrying', 'surfaceMining'];
const STRIP = ['academy', null, null, null, null, null, null, null];
const STORED = ['academy', null, null, 'storehouse', null, null, null, null];
// [id, workers, scholarKnowledge, output, capacity]. R12 is plains: Dry Farming
// output is 2 (one authored plains region). Academy quality 1 adds +4 capacity for a Scholar or Knowledge tag.
// Storehouse quality 3 adds +4 capacity for Construction.
const BOARD = [['logging', 1, true, 1, 5], ['forage', 1, true, 1, 5], ['dryFarming', 2, true, 2, 5], ['quarrying', 1, false, 1, 1], ['surfaceMining', 0, true, 1, 5]];
const MOVED = [['forage', 1, true, 1, 5], ['dryFarming', 2, true, 2, 5], ['quarrying', 1, true, 1, 5], ['surfaceMining', 1, true, 1, 5], ['logging', 0, false, 1, 1]];
const HELD = [['logging', 1, true, 1, 9], ['forage', 1, true, 1, 5], ['dryFarming', 2, true, 2, 5], ['quarrying', 1, false, 1, 5], ['surfaceMining', 0, true, 1, 5]];
const results = [];

function diff(expected, actual, path = '$') {
  if (Object.is(expected, actual)) return null;
  const object = (value) => value && typeof value === 'object';
  if (!object(expected) || !object(actual) || Array.isArray(expected) !== Array.isArray(actual)) return {path, expected, actual};
  if (Array.isArray(expected)) {
    if (expected.length !== actual.length) return {path, expected, actual};
    for (let index = 0; index < expected.length; index += 1) {
      const found = diff(expected[index], actual[index], `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  for (const key of [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort()) {
    const next = `${path}.${key}`;
    if (!Object.hasOwn(expected, key) || !Object.hasOwn(actual, key)) return {path: next, expected: expected[key], actual: actual[key]};
    const found = diff(expected[key], actual[key], next);
    if (found) return found;
  }
  return null;
}
function check(name, kind, actual, expected) {
  const difference = diff(expected, actual);
  results.push({name, kind, pass: !difference, ...(difference ? {difference} : {})});
}
function pinInventory(state, vassal, node, type) {
  // New Bronze keyword Practices shifted seed-0 shop rolls; pin the inventory
  // this suite was authored against (main before the keyword pool growth).
  const regionId = vassal.locationRegionId;
  const roll = node.nodeId + ':r0';
  const raw = type === 'classMarket' ? [
    {offerId:`${roll}:practice:0`, label:'Learn Diamond Ossuary Keeping', basePrestigeCost:40, basePhaseCost:160,
      intervention:{kind:'practice', targetRegionId:regionId, practiceId:'ossuaryKeeping', mode:'learn', tier:'bronze', resultingTier:'diamond'}},
    {offerId:`${roll}:practice:1`, label:'Learn Diamond Brewing', basePrestigeCost:40, basePhaseCost:160,
      intervention:{kind:'practice', targetRegionId:regionId, practiceId:'brewing', mode:'learn', tier:'bronze', resultingTier:'diamond'}},
    {offerId:`${roll}:practice:2`, label:'Learn Diamond Surveying', basePrestigeCost:40, basePhaseCost:160,
      intervention:{kind:'practice', targetRegionId:regionId, practiceId:'surveying', mode:'learn', tier:'bronze', resultingTier:'diamond'}},
  ] : [
    {offerId:`${roll}:structure:0`, label:'Build Diamond Storehouse', basePrestigeCost:40, basePhaseCost:160, baseCurrencyCost:0,
      intervention:{kind:'structure', mode:'add', targetRegionId:regionId, structureId:'storehouse', tier:'bronze', qualityBonus:3}},
    {offerId:`${roll}:structure:1`, label:'Build Diamond Granary', basePrestigeCost:40, basePhaseCost:160, baseCurrencyCost:0,
      intervention:{kind:'structure', mode:'add', targetRegionId:regionId, structureId:'granary', tier:'bronze', qualityBonus:3}},
    {offerId:`${roll}:practice:2`, label:'Learn Diamond Pastoralism', basePrestigeCost:40, basePhaseCost:160,
      intervention:{kind:'practice', targetRegionId:regionId, practiceId:'pastoralism', mode:'learn', tier:'bronze', resultingTier:'diamond'}},
  ];
  node.inventory = raw.map((offer, inventoryIndex) => ({...resolveLifeMapShopPrice(state, offer), inventoryIndex}));
}
function open(type = 'neutralMarket') {
  const sandbox = createLabNodeSandbox({type, seed: 0, cunning: 100, prestige: 500, classId: 'scholar'});
  const state = sandbox.state;
  const vassal = getCurrentLifeMapVassal(state);
  const local = state.world.sites.find((site) => site.regionId === vassal.locationRegionId).detailedState;
  setFixturePopulation(local, 30, 3);
  local.practiceSlots = fiveSlots(...LIVE.map((id) => practiceSlot(id)));
  local.structureSlots.fill(null);
  local.structureSlots[0] = {structureId: 'academy', origin: 0, width: 3, placementId: 'live:academy', qualityBonus: 1};
  pinInventory(state, vassal, vassal.lifeMap.nodeStates[sandbox.nodeId], type);
  const fixture = serializeGameState(state);
  return {state, nodeId: sandbox.nodeId, vassal, local, fixture, timeline: createTimelineFromInitialState(state), actions: []};
}
function act(session, kind, payload) {
  setPaused(session.state, true);
  syncPhaseToPaused(session.state);
  const result = applyAction(session.state, {kind, payload});
  setPaused(session.state, false);
  syncPhaseToPaused(session.state);
  if (!result.ok) throw new Error(`${kind} ${result.reason}`);
  const action = {kind, payload, tSec: session.state.tSec};
  if (!appendActionAtCursor(session.timeline, action, session.state).ok) throw new Error(`timeline ${kind}`);
  session.actions.push(action);
  return result;
}
function offer(session, read) {
  const found = session.vassal.lifeMap.nodeStates[session.nodeId].inventory.find((entry) => read(entry.intervention));
  if (!found) throw new Error('missing offer');
  return found;
}
function shot(session) {
  const view = getVassalNodeDecisionPresentation(session.state, session.nodeId);
  const node = session.vassal.lifeMap.nodeStates[session.nodeId];
  const rows = view.settlement.multiplierPreview.rows;
  return {
    pause: [session.state.paused, session.state.phase, session.state.tSec],
    live: session.local.practiceSlots.map((slot) => slot?.practiceId ?? null),
    board: view.settlement.practices.map((slot, index) => {
      const row = rows.find((entry) => entry.index === index);
      return [slot?.practiceId ?? null, slot?.presentation?.workers ?? null, slot?.presentation?.tags?.includes('Knowledge') === true, row?.output?.multiplier ?? null, row?.capacity?.multiplier ?? null];
    }),
    structures: view.settlement.structures.map((slot) => slot?.structureId ?? null),
    purchases: node.purchasedOffers.map((entry) => entry.intervention.structureId ?? entry.intervention.practiceId),
    phase: node.accumulatedPhaseCost, stagedPrestige: view.stagedPrestigeCost, totalPhase: view.mortalityEstimate.totalPhaseCost,
    prestige: session.vassal.prestige, projected: view.projectedPrestige, currency: view.stagedCurrencyCost,
  };
}
function expect(board, extra = {}) {
  return {pause: [false, 'simulation', 0], live: LIVE, board, structures: STRIP, purchases: [], phase: 0, stagedPrestige: 0, totalPhase: 109, prestige: 500, projected: 500, currency: 0, ...extra};
}
function replay(session, name) {
  const continued = deserializeGameState(session.fixture);
  for (const action of session.actions) {
    setPaused(continued, true);
    syncPhaseToPaused(continued);
    const result = applyAction(continued, action);
    setPaused(continued, false);
    syncPhaseToPaused(continued);
    if (!result.ok) throw new Error(`continue ${action.kind} ${result.reason}`);
  }
  const rebuilt = rebuildStateAtSecond(session.timeline, session.state.tSec);
  if (!rebuilt.ok) throw new Error(rebuilt.reason);
  const live = serializeGameState(session.state);
  check(`${name}-json`, 'replay', serializeGameState(continued), live);
  check(`${name}-rebuild`, 'replay', serializeGameState(rebuilt.state), live);
}
function replace(session, practiceId, toIndex) {
  const card = offer(session, (action) => action.practiceId === 'pastoralism');
  const bought = act(session, A.VASSAL_PURCHASE_SHOP_OFFER, {nodeId: session.nodeId, offerId: card.offerId, toIndex, replacePracticeId: practiceId});
  if (bought.prestigeCost !== 28 || bought.phaseCost !== 109 || bought.currencyCost !== 0) throw new Error(`pastoralism quote changed: ${bought.prestigeCost}/${bought.phaseCost}/${bought.currencyCost}`);
  return bought;
}

const pristine = open();
check('pristine', 'baseline', shot(pristine), expect(BOARD));
check('pristine-json', 'replay', serializeGameState(deserializeGameState(pristine.fixture)), pristine.fixture);
const pristineReplay = rebuildStateAtSecond(pristine.timeline, pristine.state.tSec);
check('pristine-rebuild', 'replay', pristineReplay.ok ? serializeGameState(pristineReplay.state) : pristineReplay, pristine.fixture);

// The actual full-board chooser inserts at 0, independently of the victim slot.
for (const id of LIVE.slice(1)) {
  const session = open();
  const originalOffer = structuredClone(offer(session, action => action.practiceId === 'pastoralism'));
  const bought = replace(session, id, 0);
  act(session, A.VASSAL_UNDO_SHOP_PURCHASE, {nodeId:session.nodeId,offerId:bought.offerId});
  check(`chooser-${id}`, 'contract', shot(session), expect(BOARD));
  check(`restored-offer-${id}`, 'contract', offer(session, action => action.practiceId === 'pastoralism'), originalOffer);
  replay(session, `chooser-${id}`);
}

const victimPairs = LIVE.flatMap(first => LIVE.filter(second => second !== first).map(second => [first,second]));
for (const victims of victimPairs) for (const dependent of [false,true]) for (const undoOrder of [[0,1],[1,0]]) {
  const session = open('classMarket');
  const purchases = ['ossuaryKeeping','brewing'].map((practiceId,index) => {
    const card = offer(session, action => action.practiceId === practiceId);
    return act(session,A.VASSAL_PURCHASE_SHOP_OFFER,{nodeId:session.nodeId,offerId:card.offerId,toIndex:0,
      replacePracticeId:index === 1 && dependent ? 'ossuaryKeeping' : victims[index]});
  });
  for (const index of undoOrder) act(session,A.VASSAL_UNDO_SHOP_PURCHASE,{nodeId:session.nodeId,offerId:purchases[index].offerId});
  const name = `two-chooser-${victims.join('-')}-${dependent}-${undoOrder.join('-')}`;
  check(name, 'contract', shot(session), expect(BOARD));
  replay(session, name);
}

for (const [slot, practiceId, kind] of [[0, 'logging', 'regression'], [2, 'dryFarming', 'regression'], [4, 'surfaceMining', 'contract']]) {
  const session = open();
  const bought = replace(session, practiceId, slot);
  const staged = shot(session);
  if (staged.board[slot][0] !== 'pastoralism' || staged.live.join() !== LIVE.join() || staged.phase !== 109 || staged.stagedPrestige !== 28 || staged.prestige !== 500) {
    throw new Error(`slot ${slot} did not stage`);
  }
  const undone = act(session, A.VASSAL_UNDO_SHOP_PURCHASE, {nodeId: session.nodeId, offerId: bought.offerId});
  if (undone.prestigeCost !== 28 || undone.phaseCost !== 109 || undone.currencyCost !== 0) throw new Error('refund quote changed');
  check(`undo-slot-${slot}`, kind, shot(session), expect(BOARD));
  replay(session, `undo-slot-${slot}`);
}

const held = open();
const store = offer(held, (action) => action.structureId === 'storehouse');
const stored = act(held, A.VASSAL_PURCHASE_SHOP_OFFER, {nodeId: held.nodeId, offerId: store.offerId, origin: 3});
if (stored.prestigeCost !== 28 || stored.phaseCost !== 109) throw new Error('storehouse quote changed');
const learned = replace(held, 'logging', 0);
const both = shot(held);
check('both-staged-costs', 'contract', {purchases: both.purchases, phase: both.phase, stagedPrestige: both.stagedPrestige, projected: both.projected, prestige: both.prestige, live: both.live, pause: both.pause}, {purchases: ['storehouse', 'pastoralism'], phase: 218, stagedPrestige: 56, projected: 444, prestige: 500, live: LIVE, pause: [false, 'simulation', 0]});
act(held, A.VASSAL_UNDO_SHOP_PURCHASE, {nodeId: held.nodeId, offerId: learned.offerId});
check('undo-keeps-storehouse', 'regression', shot(held), expect(HELD, {structures: STORED, purchases: ['storehouse'], phase: 109, stagedPrestige: 28, totalPhase: 109, projected: 472}));
replay(held, 'undo-keeps-storehouse');

const moved = open();
act(moved, A.VASSAL_REORDER_SHOP_PURCHASE, {nodeId: moved.nodeId, offerId: 'practice:logging', toIndex: 4});
check('deliberate-reorder', 'contract', shot(moved), expect(MOVED));
const rotated = replace(moved, 'forage', 0);
act(moved, A.VASSAL_UNDO_SHOP_PURCHASE, {nodeId: moved.nodeId, offerId: rotated.offerId});
check('undo-keeps-reorder', 'regression', shot(moved), expect(MOVED));
replay(moved, 'undo-keeps-reorder');

const known = results.filter((entry) => entry.kind === 'regression' && !entry.pass);
const unexpected = results.filter((entry) => entry.kind !== 'regression' && !entry.pass);
const summary = {
  command: 'node scripts/shop-undo-replay-test.mjs',
  fixture: {shop: 'neutralMarket', seed: 0, cunning: 100, prestige: 500, classId: 'scholar', adults: 30, scholars: 3, slots: LIVE, academy: {origin: 0, width: 3, qualityBonus: 1}, pause: 'unpaused simulation at tSec 0; actions bracket pause then resume; no ticks'},
  counts: {checks: results.length, baseline: results.filter((entry) => entry.kind === 'baseline' && entry.pass).length, contractPass: results.filter((entry) => entry.kind === 'contract' && entry.pass).length, replayPass: results.filter((entry) => entry.kind === 'replay' && entry.pass).length, regressionFailures: known.length, newBugs: unexpected.length},
  regressionFailures: known, newBugs: unexpected,
  reproduction: 'Buy Pastoralism with toIndex and replacePracticeId, then undo that offerId. Slot 0 replaces logging, slot 2 dryFarming, slot 4 surfaceMining. The kept cases first buy Storehouse at origin 3, or reorder practice:logging to 4.',
  mutants: 'not part of this contract runner; parent separately verifies fault mutations',
  limits: ['Does not compare after-undo serializeGameState with a never-staged twin.', 'No mutation campaign.'],
};
mkdirSync(DIR, {recursive: true});
writeFileSync(`${DIR}/summary.json`, JSON.stringify(summary, null, 2));
for (const entry of [...known, ...unexpected]) console.log(`FAIL ${entry.kind} ${entry.name} ${entry.difference.path} expected=${JSON.stringify(entry.difference.expected)} actual=${JSON.stringify(entry.difference.actual)}`);
console.log(`[shop-undo] checks=${results.length} regressionFailures=${known.length} newBugs=${unexpected.length} replayPass=${summary.counts.replayPass}`);
if (unexpected.length || known.length) process.exitCode = 1;
