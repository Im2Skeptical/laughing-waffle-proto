// Instance-safe hostile institution edges. Offers are authored, not rolled.
// Reachability: stageOffer sends adopt/upgrade with no toIndex; a full board
// learn uses the chooser (toIndex 0, replacePracticeId); discard is a drag to
// index 5. Control loss is changeController, the same town transition as
// resolveControl. Veterans' Testimony Charge is 1, under threshold 2.
// Scheduled cards keep Charge 0 so the save is legal. Shipping quotePrestige
// bills the whole short receipt as Creep and adds the explicit 10; the flat-10
// substitution example stays with full-map-contract-test.
// node scripts/shop-instance-contracts-test.mjs
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {ActionKinds as A, applyAction} from '../src/model/actions.js';
import {setPaused} from '../src/model/game-model.js';
import {createNewGameState} from '../src/model/new-game.js';
import {deserializeGameState, serializeGameState, syncPhaseToPaused} from '../src/model/state.js';
import {appendActionAtCursor, createTimelineFromInitialState, rebuildStateAtSecond} from '../src/model/timeline/index.js';
import {advanceReplayStateToSecond, initializeReplayClock} from '../src/model/replay-second-runner.js';
import {enterVassalLifeNode, getCurrentLifeMapVassal, getVassalCandidatePool, getVassalNodeDecisionPresentation, selectLifeMapVassal, selectVassalNodeOption} from '../src/model/vassal-life-map.js';
import {getRegionState} from '../src/model/world-state.js';
import {changeController} from '../src/model/detailed-settlements/territory.js';
import {fullMapPractices} from '../src/defs/gamepieces/full-map-defs.js';

const T = 'fm_veteransTestimony', D = 'fm_debtService', O = 'fm_oathSupper';
const IDS = ['forage', 'dryFarming', 'logging', D, T];
const piece = (id, allegiance, extra = {}) => ({
  practiceId: id, tier: 'bronze', instanceId: `inst:${id}`, charge: extra.charge ?? 0, work: extra.work ?? 0,
  ...(fullMapPractices[id]?.category === 'influence' ? {allegiance} : {stock: extra.stock ?? 0}),
});
function open(prestige, keepTown = false) {
  const s = createNewGameState(424242);
  const lineage = s.civilization.vassalLineage;
  lineage.establishedClassId = 'warrior'; lineage.founderClassId = 'warrior';
  const candidate = {...getVassalCandidatePool(s).candidates[0], classId: 'warrior', founderClassId: null, archetype: 'Warrior', age: 18};
  assert.equal(selectLifeMapVassal(s, 0, null, candidate).ok, true);
  const v = getCurrentLifeMapVassal(s);
  v.stats.intelligence = 0; v.stats.cunning = 0; v.heirlooms.equipped.fill(null); v.heirlooms.carry.fill(null);
  const node = v.lifeMap.graph.nodes.find(n => n.family === 'practiceReform');
  v.lifeMap.availableNodeIds = [node.id];
  assert.equal(enterVassalLifeNode(s, node.id).ok, true);
  const ns = v.lifeMap.nodeStates[node.id];
  if (ns.shopSelection) assert.equal(selectVassalNodeOption(s, node.id, 'random').ok, true);
  const site = s.world.sites.find(x => x.regionId === v.locationRegionId);
  for (const other of s.world.sites) {
    if (other !== site || !keepTown) { delete other.neutral; delete other.town; }
    other.simulationMode = 'detailed';
    getRegionState(s, other.regionId).detailedSettlementEnabled = true;
  }
  const debt = piece(D, 'external-a', {work: 4});
  const testimony = piece(T, 'external-a', {charge: 1, work: 6});
  site.detailedState.practiceSlots = [piece('forage', 'player', {stock: 2, work: 5}), piece('dryFarming', 'player', {stock: 1}), piece('logging', 'player'), debt, testimony];
  const offer = (offerId, intervention) => ({offerId, basePrestigeCost: 10, basePhaseCost: 1, baseCurrencyCost: 0, inventoryIndex: ns.inventory.length, intervention});
  ns.inventory = [
    offer('learn-oath', {kind: 'practice', mode: 'learn', practiceId: O, resultingTier: 'bronze', targetRegionId: v.locationRegionId}),
    offer('adopt-testimony', {kind: 'practice', mode: 'adopt', practiceId: T, tier: 'bronze', resultingTier: 'bronze', instanceId: testimony.instanceId, targetRegionId: v.locationRegionId}),
    offer('upgrade-testimony', {kind: 'practice', mode: 'upgrade', practiceId: T, tier: 'bronze', resultingTier: 'silver', targetRegionId: v.locationRegionId}),
  ];
  s.civilization.prestige = prestige; s.civilization.chaos.monsterPressure = 0;
  initializeReplayClock(s); syncPhaseToPaused(s);
  return {s, v, node, ns, d: site.detailedState, site, testimony};
}
const act = (s, kind, payload) => {
  setPaused(s, true); syncPhaseToPaused(s);
  const result = applyAction(s, {kind, payload});
  setPaused(s, false); syncPhaseToPaused(s);
  return result;
};
const ids = slots => slots.map(slot => slot?.practiceId ?? null);
const face = slot => slot && ({id: slot.practiceId, inst: slot.instanceId, charge: slot.charge, work: slot.work, allegiance: slot.allegiance ?? null, tier: slot.tier});
const buy = (box, offerId, extra = {}) => act(box.s, A.VASSAL_PURCHASE_SHOP_OFFER, {nodeId: box.node.id, offerId, ...extra});
const undo = (box, offerId) => act(box.s, A.VASSAL_UNDO_SHOP_PURCHASE, {nodeId: box.node.id, offerId});
const live = box => JSON.stringify(box.d.practiceSlots);
const quote = box => ({
  buys: box.ns.purchasedOffers.map(p => ({id: p.offerId, prestige: p.prestigeCost, pressure: p.monsterPressureCost, victims: (p.removalReceipts ?? []).map(r => r.instanceId)})),
  loose: (box.ns.removalReceipts ?? []).map(r => ({inst: r.instanceId, prestige: r.prestigeCost, pressure: r.monsterPressureCost})),
});
const found = (box, id) => face(box.d.practiceSlots.find(slot => slot?.practiceId === id) ?? null);

const passed = [], failures = [];
function check(name, fn) {
  try { fn(); passed.push(name); }
  catch (error) {
    if (error?.name !== 'AssertionError') throw error;
    failures.push({name, expected: error.expected, actual: error.actual, message: error.message});
  }
}

function suite() {
for (const [stage, cancel, toIndex] of [
  [['learn-oath', 'adopt-testimony', 'upgrade-debt'], ['learn-oath', 'adopt-testimony', 'upgrade-debt'], undefined],
  [['adopt-testimony', 'learn-oath', 'upgrade-debt'], ['learn-oath', 'adopt-testimony', 'upgrade-debt'], 2],
  [['upgrade-debt', 'adopt-testimony', 'learn-oath'], ['adopt-testimony', 'upgrade-debt', 'learn-oath'], 4],
  [['adopt-testimony', 'upgrade-debt', 'learn-oath'], ['upgrade-debt', 'adopt-testimony', 'learn-oath'], undefined],
]) check(`three purchases cancel ${stage.join('/')} at ${toIndex ?? 'click'}`, () => {
  const box = open(120);
  box.ns.inventory.push({offerId: 'upgrade-debt', basePrestigeCost: 10, basePhaseCost: 1, baseCurrencyCost: 0, inventoryIndex: 3,
    intervention: {kind: 'practice', mode: 'upgrade', practiceId: D, tier: 'bronze', resultingTier: 'silver', targetRegionId: box.v.locationRegionId}});
  // Capture the authored extra offer before recording any action.
  const history = createTimelineFromInitialState(box.s);
  for (const [kind, offers] of [[A.VASSAL_PURCHASE_SHOP_OFFER, stage], [A.VASSAL_UNDO_SHOP_PURCHASE, cancel]]) {
    for (const offerId of offers) {
      const payload = {nodeId: box.node.id, offerId,
        ...(kind === A.VASSAL_PURCHASE_SHOP_OFFER && offerId === 'learn-oath' && toIndex != null ? {toIndex} : {})};
      assert.equal(act(box.s, kind, payload).ok, true);
      assert.equal(appendActionAtCursor(history, {kind, payload}, box.s).ok, true);
    }
  }
  assert.deepEqual(box.ns.practiceDraftOrder, IDS);
  assert.deepEqual(box.ns.purchasedOffers, []);
  assert.equal(box.s.civilization.prestige, 120);
  const rebuilt = rebuildStateAtSecond(history, 0);
  assert.equal(rebuilt.ok, true);
  assert.deepEqual(serializeGameState(rebuilt.state), serializeGameState(box.s));
  assert.deepEqual(serializeGameState(deserializeGameState(serializeGameState(box.s))), serializeGameState(box.s));
  assert.equal(act(box.s, A.VASSAL_CONFIRM_LIFE_NODE, {nodeId: box.node.id}).ok, true);
  assert.deepEqual(ids(box.d.practiceSlots), IDS);
});
for (const mode of ['adopt', 'upgrade']) {
  for (const toIndex of [undefined, 0, 1, 2, 3, 4]) check(`${mode} undo retains later learn slot ${toIndex ?? 'click'}`, () => {
    const box = open(80), twin = open(80), timeline = createTimelineFromInitialState(box.s);
    const perform = (kind, payload) => {
      payload = {nodeId: box.node.id, ...payload};
      assert.equal(act(box.s, kind, payload).ok, true);
      assert.equal(appendActionAtCursor(timeline, {kind, payload}, box.s).ok, true);
    };
    const placement = toIndex == null ? {} : {toIndex};
    assert.equal(buy(twin, 'learn-oath', placement).ok, true);
    perform(A.VASSAL_PURCHASE_SHOP_OFFER, {offerId: `${mode}-testimony`});
    perform(A.VASSAL_PURCHASE_SHOP_OFFER, {offerId: 'learn-oath', ...placement});
    perform(A.VASSAL_UNDO_SHOP_PURCHASE, {offerId: `${mode}-testimony`});
    assert.deepEqual(box.ns.practiceDraftOrder, twin.ns.practiceDraftOrder);
    assert.deepEqual(box.ns.purchasedOffers[0].displacedInstanceIds, twin.ns.purchasedOffers[0].displacedInstanceIds);
    assert.deepEqual(box.ns.purchasedOffers[0].removalReceipts, twin.ns.purchasedOffers[0].removalReceipts);
    perform(A.VASSAL_CONFIRM_LIFE_NODE, {});
    assert.equal(act(twin.s, A.VASSAL_CONFIRM_LIFE_NODE, {nodeId: twin.node.id}).ok, true);
    assert.deepEqual(box.d.practiceSlots, twin.d.practiceSlots);
    assert.equal(box.s.civilization.prestige, twin.s.civilization.prestige);
    assert.equal(box.s.civilization.chaos.monsterPressure, twin.s.civilization.chaos.monsterPressure);
    const rebuilt = rebuildStateAtSecond(timeline, 0);
    assert.equal(rebuilt.ok, true);
    assert.deepEqual(serializeGameState(rebuilt.state), serializeGameState(box.s));
  });
  for (const finish of ['keep-learn', 'undo-learn-first', 'undo-move-first']) check(`${mode} of a displaced last-slot victim, ${finish}`, () => {
    const box = open(120), timeline = createTimelineFromInitialState(box.s);
    const perform = (kind, offerId) => {
      const payload = {nodeId: box.node.id, ...(offerId ? {offerId} : {}),
        ...(kind === A.VASSAL_PURCHASE_SHOP_OFFER && offerId === 'learn-oath' ? {toIndex: 0, replacePracticeId: T} : {})};
      assert.equal(act(box.s, kind, payload).ok, true);
      assert.equal(appendActionAtCursor(timeline, {kind, payload}, box.s).ok, true);
      assert.deepEqual(serializeGameState(deserializeGameState(serializeGameState(box.s))), serializeGameState(box.s));
    };
    perform(A.VASSAL_PURCHASE_SHOP_OFFER, 'learn-oath');
    const learned = [O, ...IDS.filter(id => id !== T), T];
    perform(A.VASSAL_PURCHASE_SHOP_OFFER, `${mode}-testimony`);
    if (finish === 'undo-learn-first') perform(A.VASSAL_UNDO_SHOP_PURCHASE, 'learn-oath');
    perform(A.VASSAL_UNDO_SHOP_PURCHASE, `${mode}-testimony`);
    assert.deepEqual(box.ns.practiceDraftOrder, finish === 'undo-learn-first' ? IDS : learned);
    if (finish === 'undo-move-first') perform(A.VASSAL_UNDO_SHOP_PURCHASE, 'learn-oath');
    perform(A.VASSAL_CONFIRM_LIFE_NODE);
    assert.deepEqual(ids(box.d.practiceSlots), finish === 'keep-learn' ? learned.slice(0, 5) : IDS);
    assert.equal(found(box, T) == null, finish === 'keep-learn');
    assert.equal(found(box, D).inst, `inst:${D}`);
    assert.equal(box.s.civilization.prestige, finish === 'keep-learn' ? 105 : 120);
    assert.equal(box.s.civilization.chaos.monsterPressure, finish === 'keep-learn' ? 10 : 0);
    const rebuilt = rebuildStateAtSecond(timeline, 0);
    assert.equal(rebuilt.ok, true);
    assert.deepEqual(serializeGameState(rebuilt.state), serializeGameState(box.s));
  });
  for (const toIndex of [0, 1, 2, 3, 4]) check(`${mode} undo preserves prior reorder at ${toIndex}`, () => {
    const box = open(80), expected = IDS.filter(id => id !== T);
    expected.splice(toIndex, 0, T);
    const timeline = createTimelineFromInitialState(box.s);
    const perform = (kind, extra) => {
      const payload = {nodeId: box.node.id, ...extra};
      assert.equal(act(box.s, kind, payload).ok, true);
      assert.equal(appendActionAtCursor(timeline, {kind, payload}, box.s).ok, true);
      assert.deepEqual(serializeGameState(deserializeGameState(serializeGameState(box.s))), serializeGameState(box.s));
    };
    perform(A.VASSAL_REORDER_SHOP_PURCHASE, {offerId: `practice:${T}`, toIndex});
    perform(A.VASSAL_PURCHASE_SHOP_OFFER, {offerId: `${mode}-testimony`});
    perform(A.VASSAL_UNDO_SHOP_PURCHASE, {offerId: `${mode}-testimony`});
    assert.deepEqual(box.ns.practiceDraftOrder, expected);
    assert.equal('practiceDraftBeforeMove' in box.ns.inventory.find(p => p.offerId === `${mode}-testimony`), false);
    perform(A.VASSAL_CONFIRM_LIFE_NODE, {});
    assert.deepEqual(ids(box.d.practiceSlots), expected);
    assert.deepEqual(found(box, T), {id: T, inst: 'inst:' + T, charge: 1, work: 6, allegiance: 'external-a', tier: 'bronze'});
    assert.equal(box.s.civilization.prestige, 80);
    const rebuilt = rebuildStateAtSecond(timeline, 0);
    assert.equal(rebuilt.ok, true);
    assert.deepEqual(serializeGameState(rebuilt.state), serializeGameState(box.s));
  });
  for (const learnFirst of [false, true]) for (const undoFirst of [false, true]) {
    check(`${mode} plus replacement stage ${learnFirst}, undo ${undoFirst}`, () => {
      const box = open(80), timeline = createTimelineFromInitialState(box.s);
      const offers = learnFirst ? ['learn-oath', `${mode}-testimony`] : [`${mode}-testimony`, 'learn-oath'];
      const perform = (kind, offerId) => {
        const payload = {nodeId: box.node.id, offerId,
          ...(kind === A.VASSAL_PURCHASE_SHOP_OFFER && offerId === 'learn-oath' ? {toIndex: 0, replacePracticeId: D} : {})};
        assert.equal(act(box.s, kind, payload).ok, true);
        assert.equal(appendActionAtCursor(timeline, {kind, payload}, box.s).ok, true);
        assert.deepEqual(serializeGameState(deserializeGameState(serializeGameState(box.s))), serializeGameState(box.s));
      };
      for (const offerId of offers) perform(A.VASSAL_PURCHASE_SHOP_OFFER, offerId);
      for (const offerId of undoFirst ? offers : offers.slice().reverse()) perform(A.VASSAL_UNDO_SHOP_PURCHASE, offerId);
      assert.deepEqual(box.ns.practiceDraftOrder, IDS);
      assert.equal(box.ns.purchasedOffers.length, 0);
      assert.equal(act(box.s, A.VASSAL_CONFIRM_LIFE_NODE, {nodeId: box.node.id}).ok, true);
      assert.equal(appendActionAtCursor(timeline, {kind: A.VASSAL_CONFIRM_LIFE_NODE, payload: {nodeId: box.node.id}}, box.s).ok, true);
      assert.deepEqual(ids(box.d.practiceSlots), IDS);
      assert.equal(box.s.civilization.prestige, 80);
      assert.equal(box.s.civilization.chaos.monsterPressure, 0);
      const rebuilt = rebuildStateAtSecond(timeline, 0);
      assert.equal(rebuilt.ok, true);
      assert.deepEqual(serializeGameState(rebuilt.state), serializeGameState(box.s));
    });
  }
}
check('staging leaves the live board, treasury, Creep and RNG untouched', () => {
  const box = open(80), before = live(box), rng = JSON.stringify(box.s.rng);
  assert.equal(buy(box, 'adopt-testimony').ok, true);
  assert.equal(undo(box, 'adopt-testimony').ok, true);
  assert.equal(buy(box, 'upgrade-testimony').ok, true);
  assert.equal(act(box.s, A.VASSAL_REORDER_SHOP_PURCHASE, {nodeId: box.node.id, offerId: `practice:${T}`, toIndex: 1}).ok, true);
  assert.equal(live(box), before);
  assert.equal(box.s.civilization.prestige, 80);
  assert.equal(box.s.civilization.chaos.monsterPressure, 0);
  assert.equal(JSON.stringify(box.s.rng), rng);
  assert.deepEqual([box.s.paused, box.s.phase, box.s.tSec], [false, 'simulation', 0]);
});

check('confirmed adopt, upgrade and reorder keep instance, Charge, work and allegiance', () => {
  const adopted = open(80);
  assert.equal(buy(adopted, 'adopt-testimony').ok, true);
  assert.equal(live(adopted), live(open(80)));
  assert.equal(act(adopted.s, A.VASSAL_CONFIRM_LIFE_NODE, {nodeId: adopted.node.id}).ok, true);
  assert.deepEqual(ids(adopted.d.practiceSlots), [T, 'forage', 'dryFarming', 'logging', D]);
  assert.deepEqual(found(adopted, T), {id: T, inst: 'inst:' + T, charge: 1, work: 6, allegiance: 'player', tier: 'bronze'});
  assert.equal(adopted.s.civilization.prestige, 70);
  assert.equal(adopted.s.civilization.chaos.monsterPressure, 0);
  const upgraded = open(80);
  assert.equal(buy(upgraded, 'upgrade-testimony').ok, true);
  assert.equal(act(upgraded.s, A.VASSAL_CONFIRM_LIFE_NODE, {nodeId: upgraded.node.id}).ok, true);
  assert.deepEqual(found(upgraded, T), {id: T, inst: 'inst:' + T, charge: 1, work: 6, allegiance: 'external-a', tier: 'silver'});
  assert.equal(upgraded.s.civilization.prestige, 70);
  assert.equal(upgraded.s.civilization.chaos.monsterPressure, 0);
  const moved = open(80);
  assert.equal(act(moved.s, A.VASSAL_REORDER_SHOP_PURCHASE, {nodeId: moved.node.id, offerId: `practice:${T}`, toIndex: 1}).ok, true);
  assert.deepEqual(moved.ns.removalReceipts, []);
  assert.equal(act(moved.s, A.VASSAL_CONFIRM_LIFE_NODE, {nodeId: moved.node.id}).ok, true);
  assert.deepEqual(ids(moved.d.practiceSlots), ['forage', T, 'dryFarming', 'logging', D]);
  assert.deepEqual(found(moved, T), {id: T, inst: 'inst:' + T, charge: 1, work: 6, allegiance: 'external-a', tier: 'bronze'});
  assert.equal(moved.s.civilization.prestige, 80);
});

check('each removed hostile institution is charged once', () => {
  const replaced = open(80);
  assert.equal(buy(replaced, 'learn-oath', {toIndex: 0, replacePracticeId: D}).ok, true);
  assert.deepEqual(quote(replaced), {buys: [{id: 'learn-oath', prestige: 15, pressure: 10, victims: ['inst:' + D]}], loose: []});
  assert.equal(act(replaced.s, A.VASSAL_CONFIRM_LIFE_NODE, {nodeId: replaced.node.id}).ok, true);
  assert.equal(replaced.s.civilization.prestige, 65);
  assert.equal(replaced.s.civilization.chaos.monsterPressure, 10);
  assert.equal(found(replaced, D), null);
  assert.equal(found(replaced, O).inst, `${replaced.v.vassalId}:learn-oath`);
  assert.deepEqual(found(replaced, T), {id: T, inst: 'inst:' + T, charge: 1, work: 6, allegiance: 'external-a', tier: 'bronze'});
  const discarded = open(80);
  assert.equal(act(discarded.s, A.VASSAL_REORDER_SHOP_PURCHASE, {nodeId: discarded.node.id, offerId: `practice:${D}`, toIndex: 5}).ok, true);
  assert.equal(buy(discarded, 'upgrade-testimony').ok, true);
  assert.deepEqual(quote(discarded), {
    buys: [{id: 'upgrade-testimony', prestige: 10, pressure: 0, victims: []}],
    loose: [{inst: 'inst:' + D, prestige: 5, pressure: 10}],
  });
  assert.equal(live(discarded), live(open(80)));
  assert.equal(act(discarded.s, A.VASSAL_CONFIRM_LIFE_NODE, {nodeId: discarded.node.id}).ok, true);
  assert.deepEqual(found(discarded, T), {id: T, inst: 'inst:' + T, charge: 1, work: 6, allegiance: 'external-a', tier: 'silver'});
  assert.equal(found(discarded, D), null);
  assert.equal(discarded.s.civilization.prestige, 65);
  assert.equal(discarded.s.civilization.chaos.monsterPressure, 10);
});

check('adoption and a later replacement undo in either order without a second tax', () => {
  const undoAdopt = open(80), undoReplace = open(80);
  for (const box of [undoAdopt, undoReplace]) {
    assert.equal(buy(box, 'adopt-testimony').ok, true);
    assert.equal(buy(box, 'learn-oath', {toIndex: 0, replacePracticeId: T}).ok, true);
    assert.deepEqual(quote(box).buys.map(row => [row.id, row.prestige, row.pressure, row.victims.length]), [['learn-oath', 15, 10, 1], ['adopt-testimony', 10, 0, 0]]);
  }
  assert.equal(undo(undoAdopt, 'adopt-testimony').ok, true);
  assert.deepEqual(quote(undoAdopt).buys, [{id: 'learn-oath', prestige: 15, pressure: 10, victims: ['inst:' + T]}]);
  assert.deepEqual(quote(undoAdopt).loose, []);
  assert.equal(undo(undoReplace, 'learn-oath').ok, true);
  assert.deepEqual(quote(undoReplace).buys, [{id: 'adopt-testimony', prestige: 10, pressure: 0, victims: []}]);
  assert.equal(live(undoAdopt), live(open(80)));
  assert.equal(live(undoReplace), live(open(80)));
  assert.equal(undoAdopt.s.civilization.prestige, 80);
  assert.equal(undoReplace.s.civilization.chaos.monsterPressure, 0);
});

check('undone adoption clears the draft order', () => {
  const box = open(80);
  assert.equal(box.ns.practiceDraftOrder ?? null, null);
  assert.equal(buy(box, 'adopt-testimony').ok, true);
  assert.equal(undo(box, 'adopt-testimony').ok, true);
  assert.equal(box.ns.purchasedOffers.length, 0);
  assert.deepEqual(box.ns.practiceDraftOrder ?? IDS, IDS, 'cancel restores preview order');
  assert.equal(act(box.s, A.VASSAL_CONFIRM_LIFE_NODE, {nodeId:box.node.id}).ok, true);
  assert.deepEqual(ids(box.d.practiceSlots), IDS, 'empty confirm preserves original order');
  assert.deepEqual(found(box,T), {id:T,inst:'inst:'+T,charge:1,work:6,allegiance:'external-a',tier:'bronze'});
});

check('undone upgrade clears the draft order', () => {
  const box = open(80);
  assert.equal(buy(box, 'upgrade-testimony').ok, true);
  assert.equal(undo(box, 'upgrade-testimony').ok, true);
  assert.equal(box.ns.purchasedOffers.length, 0);
  assert.deepEqual(box.ns.practiceDraftOrder ?? IDS, IDS, 'cancel restores preview order');
  assert.equal(act(box.s, A.VASSAL_CONFIRM_LIFE_NODE, {nodeId:box.node.id}).ok, true);
  assert.deepEqual(ids(box.d.practiceSlots), IDS, 'empty confirm preserves original order');
  assert.deepEqual(found(box,T), {id:T,inst:'inst:'+T,charge:1,work:6,allegiance:'external-a',tier:'bronze'});
});

check('exact shared-treasury boundaries for a 15 replacement beside a 5/10 discard', () => {
  const expected = {
    4: {buy: [0, 25], loose: [0, 15], treasury: 4, pressure: 40},
    5: {buy: [0, 25], loose: [5, 10], treasury: 0, pressure: 35},
    14: {buy: [0, 25], loose: [5, 10], treasury: 9, pressure: 35},
    15: {buy: [15, 10], loose: [0, 15], treasury: 0, pressure: 25},
    19: {buy: [15, 10], loose: [0, 15], treasury: 4, pressure: 25},
    20: {buy: [15, 10], loose: [5, 10], treasury: 0, pressure: 20},
  };
  for (const [reserve, row] of Object.entries(expected)) {
    const box = open(Number(reserve));
    assert.equal(act(box.s, A.VASSAL_REORDER_SHOP_PURCHASE, {nodeId: box.node.id, offerId: `practice:${T}`, toIndex: 5}).ok, true);
    assert.equal(buy(box, 'learn-oath', {toIndex: 0, replacePracticeId: D}).ok, true);
    assert.equal(live(box), live(open(Number(reserve))));
    const staged = quote(box);
    assert.deepEqual([staged.buys[0].prestige, staged.buys[0].pressure, staged.buys[0].victims], [...row.buy, ['inst:' + D]]);
    assert.deepEqual(staged.loose, [{inst: 'inst:' + T, prestige: row.loose[0], pressure: row.loose[1]}]);
    assert.equal(act(box.s, A.VASSAL_CONFIRM_LIFE_NODE, {nodeId: box.node.id}).ok, true);
    assert.equal(box.s.civilization.prestige, row.treasury, `reserve ${reserve}`);
    assert.equal(box.s.civilization.chaos.monsterPressure, row.pressure, `reserve ${reserve}`);
  }
});

check('control loss before confirm is atomic and the same instance survives regain', () => {
  const box = open(80, true);
  assert.equal(buy(box, 'adopt-testimony').ok, true);
  assert.equal(buy(box, 'learn-oath', {toIndex: 0, replacePracticeId: D}).ok, true);
  const before = serializeGameState(box.s);
  assert.deepEqual(serializeGameState(deserializeGameState(before)), before);
  changeController(box.s, box.site.regionId, 'frontier');
  const board = live(box), rng = JSON.stringify(box.s.rng);
  const lost = act(box.s, A.VASSAL_CONFIRM_LIFE_NODE, {nodeId: box.node.id});
  assert.deepEqual([lost.ok, lost.reason], [false, 'neutralStorefront']);
  assert.equal(live(box), board);
  assert.equal(JSON.stringify(box.s.rng), rng);
  assert.equal(box.s.civilization.prestige, 80);
  assert.equal(box.s.civilization.chaos.monsterPressure, 0);
  assert.equal(box.ns.resolving ?? false, false);
  changeController(box.s, box.site.regionId, 'player');
  assert.equal(act(box.s, A.VASSAL_CONFIRM_LIFE_NODE, {nodeId: box.node.id}).ok, true);
  assert.deepEqual(found(box, T), {id: T, inst: 'inst:' + T, charge: 1, work: 6, allegiance: 'player', tier: 'bronze'});
  assert.equal(found(box, D), null);
  assert.equal(box.s.civilization.prestige, 55);
  assert.equal(box.s.civilization.chaos.monsterPressure, 10);
});

check('read purity and full serialize/rebuild parity through one official second', () => {
  const box = open(80);
  const read = () => JSON.stringify({rng: box.s.rng, paused: box.s.paused, phase: box.s.phase, tSec: box.s.tSec, body: serializeGameState(box.s)});
  const first = read();
  getVassalNodeDecisionPresentation(box.s, box.node.id);
  assert.equal(read(), first);
  const timeline = createTimelineFromInitialState(box.s);
  const payload = {nodeId: box.node.id, offerId: 'adopt-testimony'};
  assert.equal(buy(box, 'adopt-testimony').ok, true);
  assert.equal(appendActionAtCursor(timeline, {kind: A.VASSAL_PURCHASE_SHOP_OFFER, payload}, box.s).ok, true);
  assert.equal(act(box.s, A.VASSAL_CONFIRM_LIFE_NODE, {nodeId: box.node.id}).ok, true);
  assert.equal(appendActionAtCursor(timeline, {kind: A.VASSAL_CONFIRM_LIFE_NODE, payload: {nodeId: box.node.id}}, box.s).ok, true);
  const atZero = rebuildStateAtSecond(timeline, 0);
  assert.equal(atZero.ok, true);
  assert.deepEqual(serializeGameState(atZero.state), serializeGameState(box.s));
  assert.equal(advanceReplayStateToSecond(box.s, 1).ok, true);
  const atOne = rebuildStateAtSecond(timeline, 1);
  assert.equal(atOne.ok, true);
  assert.deepEqual(serializeGameState(atOne.state), serializeGameState(box.s));
  assert.deepEqual([box.s.paused, box.s.phase, box.s.tSec], [false, 'simulation', 1]);
  assert.deepEqual(found(box, T), {id: T, inst: 'inst:' + T, charge: 1, work: 6, allegiance: 'player', tier: 'bronze'});
});
}

function report() {
  return {checks: passed.length + failures.length, passed: passed.length, failures};
}
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  suite();
  console.log(`[shop-instances] ${passed.length} passed, ${failures.length} assertion failure(s)`);
  for (const row of failures) console.log(`FAIL ${row.name}: ${row.message}`);
  process.exitCode = failures.length ? 1 : 0;
}
export {A, IDS, T, D, O, open, act, buy, undo, ids, found};
