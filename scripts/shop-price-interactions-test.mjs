// Practice Prestige schedule this file treats as authored, not as a guess:
// docs/civilization-milestone.md and docs/decisions-log.md: Bronze–Diamond
// Practice and Structure prices are 10/20/30/40. docs/full-map-redesign-implementation.md:
// staging reserves Prestige and Pressure; confirm pays; a shortfall substitutes
// the whole charge. The PR76 slot schedule already pinned by full-map-contract
// (two cards, then 10/20/40) is: a learn that fills the 4th slot adds 10 and the
// 5th adds 30. Upgrades, replacements, five-slot displacement, and structures do
// not take that step. Equality pays Prestige. One less substitutes that charge
// for equal Monster Pressure. Receipts reprice in purchase-sequence order.
// Shelf rows are live quotes. Staged rows show receipts, not a second quote.
// node scripts/shop-price-interactions-test.mjs
import assert from 'node:assert/strict';
import {ActionKinds as A, applyAction} from '../src/model/actions.js';
import {setPaused} from '../src/model/game-model.js';
import {resolveLifeMapShopPrice} from '../src/model/life-map-balance.js';
import {createNewGameState} from '../src/model/new-game.js';
import {deserializeGameState, serializeGameState, syncPhaseToPaused} from '../src/model/state.js';
import {appendActionAtCursor, createTimelineFromInitialState, rebuildStateAtSecond} from '../src/model/timeline/index.js';
import {enterVassalLifeNode, getCurrentLifeMapVassal, getVassalCandidatePool, getVassalNodeDecisionPresentation, selectLifeMapVassal, selectVassalNodeOption} from '../src/model/vassal-life-map.js';
import {purchaseVassalShopOffer, undoVassalShopPurchase} from '../src/model/vassal-life-map/shop.js';
import {getShopOfferPrice} from '../src/model/vassal-life-map/shop-specialties.js';
import {fullMapPractices} from '../src/defs/gamepieces/full-map-defs.js';
import {getAdjacentRegionIds, getRegionState} from '../src/model/world-state.js';

const checks = [];
const install = (id) => ({practiceId:id, tier:'bronze', instanceId:`test:${id}`, charge:0, work:0, ...(fullMapPractices[id]?.category === 'influence' ? {allegiance:'player'} : {stock:0})});
const slots = (box) => box.d.practiceSlots.map((slot) => slot?.practiceId ?? null);
const pack = (row) => ({prestige:row.prestigeCost, pressure:row.monsterPressureCost, premium:row.expansionPremium ?? 0});
const same = (row) => ({api:row, view:row});
const paidShape = (row) => ({receipt:row, shown:row});
function check(name, actual, expected) {
  assert.deepEqual(actual, expected, `price:${name}`);
  checks.push(name);
}
function differ(expected, actual, path = '$') {
  if (Object.is(expected, actual)) return null;
  const object = (value) => value && typeof value === 'object';
  if (!object(expected) || !object(actual) || Array.isArray(expected) !== Array.isArray(actual)) {
    const leaf = (value) => JSON.stringify(value)?.slice(0, 80);
    return `${path} expected ${leaf(expected)} actual ${leaf(actual)}`;
  }
  const keys = Array.isArray(expected) ? expected.map((_, index) => index) : [...new Set([...Object.keys(expected), ...Object.keys(actual)])];
  if (Array.isArray(expected) && expected.length !== actual.length) return `${path} length ${expected.length} actual ${actual.length}`;
  for (const key of keys) {
    const left = expected[key], right = actual[key];
    if (!Array.isArray(expected) && (!Object.hasOwn(expected, key) || !Object.hasOwn(actual, key))) return `${path}.${key} missing`;
    const found = differ(left, right, Array.isArray(expected) ? `${path}[${key}]` : `${path}.${key}`);
    if (found) return found;
  }
  return null;
}
function sameState(name, actual, expected) {
  const difference = differ(expected, actual);
  assert.equal(difference, null, `price:${name} ${difference ?? ''}`);
  checks.push(name);
}
function quoted(box, card) {
  const view = getVassalNodeDecisionPresentation(box.s, box.node.id).offers.find((row) => row.offerId === card.offerId);
  return {api:pack(getShopOfferPrice(box.v, box.ns, card, box.s)), view:pack(view)};
}
function paid(box, id) {
  const row = box.ns.purchasedOffers.find((entry) => (entry.intervention.practiceId ?? entry.intervention.structureId) === id);
  const view = getVassalNodeDecisionPresentation(box.s, box.node.id).purchases.find((entry) => (entry.intervention.practiceId ?? entry.intervention.structureId) === id);
  return {receipt:pack(row), shown:pack(view)};
}
function untouched(box, name) {
  check(name, {prestige:box.s.civilization.prestige, pressure:box.s.civilization.chaos.monsterPressure, rng:box.s.rng, paused:box.s.paused, phase:box.s.phase, tSec:box.s.tSec, live:slots(box)}, box.stamp);
}
function offer(box, id, mode = 'learn', quality = 'bronze') {
  return resolveLifeMapShopPrice(box.s, {offerId:`${mode}:${id}:${quality}`, basePrestigeCost:1, basePhaseCost:1, baseCurrencyCost:0,
    intervention:{kind:'practice', mode, practiceId:id, tier:mode === 'upgrade' ? 'bronze' : quality, resultingTier:quality, targetRegionId:box.v.locationRegionId}});
}
function structureOffer(box) {
  return resolveLifeMapShopPrice(box.s, {offerId:'struct:mudHouses', basePrestigeCost:1, basePhaseCost:1, baseCurrencyCost:0,
    intervention:{kind:'structure', mode:'add', structureId:'mudHouses', tier:'bronze', targetRegionId:box.v.locationRegionId}});
}
function buy(box, card, replace = null) {
  const result = purchaseVassalShopOffer(box.s, box.node.id, card.offerId, null, null, replace);
  assert.equal(result.ok, true, card.offerId);
  return result;
}
function previewReplace(box, card, victim) {
  const before = serializeGameState(box.s);
  const view = getVassalNodeDecisionPresentation(box.s, box.node.id, {draftMove:{fromOffer:true, id:card.offerId, toIndex:0, replacePracticeId:victim}});
  sameState('replace-preview-pure', serializeGameState(box.s), before);
  return pack(view.purchases.find((row) => row.intervention.practiceId === card.intervention.practiceId));
}
function track(box) {
  setPaused(box.s, false); syncPhaseToPaused(box.s);
  const fixture = serializeGameState(box.s);
  const timeline = createTimelineFromInitialState(box.s);
  const actions = [];
  const act = (kind, payload) => {
    setPaused(box.s, true); syncPhaseToPaused(box.s);
    const result = applyAction(box.s, {kind, payload});
    setPaused(box.s, false); syncPhaseToPaused(box.s);
    assert.equal(result.ok, true, `${kind}:${result.reason ?? ''}`);
    const action = {kind, payload, tSec:box.s.tSec};
    assert.equal(appendActionAtCursor(timeline, action, box.s).ok, true, kind);
    actions.push(action);
    return result;
  };
  return {act, finish(name) {
    const live = serializeGameState(box.s);
    const continued = deserializeGameState(fixture);
    for (const action of actions) {
      setPaused(continued, true); syncPhaseToPaused(continued);
      const result = applyAction(continued, action);
      setPaused(continued, false); syncPhaseToPaused(continued);
      assert.equal(result.ok, true, name);
    }
    const rebuilt = rebuildStateAtSecond(timeline, box.s.tSec);
    assert.equal(rebuilt.ok, true, name);
    sameState(`${name}-continue`, serializeGameState(continued), live);
    sameState(`${name}-rebuild`, serializeGameState(rebuilt.state), live);
  }};
}

function baseState() {
  const s = createNewGameState(424242);
  for (const site of s.world.sites) { delete site.neutral; delete site.town; site.simulationMode = 'detailed'; getRegionState(s, site.regionId).detailedSettlementEnabled = true; }
  const lineage = s.civilization.vassalLineage;
  lineage.establishedClassId = 'warrior'; lineage.founderClassId = 'warrior';
  const candidate = {...getVassalCandidatePool(s).candidates[0], classId:'warrior', founderClassId:null, archetype:'Warrior', age:18};
  assert.equal(selectLifeMapVassal(s, 0, null, candidate).ok, true, 'select');
  const vassal = getCurrentLifeMapVassal(s);
  vassal.stats.cunning = 0; vassal.heirlooms.equipped.fill(null); vassal.heirlooms.carry.fill(null);
  const node = vassal.lifeMap.graph.nodes.find((entry) => entry.family === 'practiceReform');
  vassal.lifeMap.availableNodeIds = [node.id];
  assert.equal(enterVassalLifeNode(s, node.id).ok, true, 'enter');
  const choice = vassal.lifeMap.nodeStates[node.id].shopSelection.choices.find((entry) => entry.enabled && entry.id !== 'random');
  assert.equal(selectVassalNodeOption(s, node.id, choice.id).ok, true, 'specialty');
  return serializeGameState(s);
}
const saved = baseState();
function session(filled, treasury) {
  const s = deserializeGameState(saved);
  const v = getCurrentLifeMapVassal(s);
  const node = v.lifeMap.graph.nodes.find((entry) => entry.id === v.lifeMap.currentNodeId);
  const ns = v.lifeMap.nodeStates[node.id];
  const d = s.world.sites.find((site) => site.regionId === v.locationRegionId).detailedState;
  d.practiceSlots = [0, 1, 2, 3, 4].map((index) => filled[index] ? install(filled[index]) : null);
  s.civilization.prestige = treasury;
  ns.purchasedOffers = []; ns.purchasedOfferIds = []; ns.removalReceipts = []; ns.accumulatedPhaseCost = 0;
  delete ns.practiceDraftOrder;
  const box = {s, v, node, ns, d};
  box.stamp = {prestige:treasury, pressure:s.civilization.chaos.monsterPressure, rng:structuredClone(s.rng), paused:s.paused, phase:s.phase, tSec:s.tSec, live:slots(box)};
  return box;
}

const prices = deserializeGameState(saved).gameConfig.lifeMapGenerator.design.shopPricing.prices;
check('authored-quality-prices', ['bronze', 'silver', 'gold', 'diamond'].map((quality) => [prices.practice[quality].prestige, prices.structure[quality].prestige]), [[10, 10], [20, 20], [30, 30], [40, 40]]);
check('opening-clock', [deserializeGameState(saved).paused, deserializeGameState(saved).phase, deserializeGameState(saved).tSec, deserializeGameState(saved).civilization.chaos.monsterPressure], [false, 'simulation', 0, 0]);

for (const [treasury, expected, name] of [[20, {prestige:20, pressure:0, premium:10}, 'fourth-exact'], [19, {prestige:0, pressure:20, premium:10}, 'fourth-short']]) {
  const box = session(['forage', 'dryFarming', 'logging'], treasury);
  const card = offer(box, 'barter');
  box.ns.inventory = [card];
  const before = serializeGameState(box.s);
  check(`${name}-quote`, quoted(box, card), same(expected));
  if (treasury === 20) sameState('pure-read', serializeGameState(box.s), before);
  buy(box, card);
  check(`${name}-receipt`, paid(box, 'barter'), paidShape(expected));
  untouched(box, `${name}-reserved`);
}

{
  const box = session(['forage', 'dryFarming'], 70);
  const cards = ['logging', 'barter', 'quarrying'].map((id) => offer(box, id));
  box.ns.inventory = [...cards];
  const flow = track(box);
  const expect = [{prestige:10, pressure:0, premium:0}, {prestige:20, pressure:0, premium:10}, {prestige:40, pressure:0, premium:30}];
  cards.forEach((card, index) => {
    check(`sequence-${index}-quote`, quoted(box, card), same(expect[index]));
    flow.act(A.VASSAL_PURCHASE_SHOP_OFFER, {nodeId:box.node.id, offerId:card.offerId});
    if (index === 0) {
      const staged = box.ns.purchasedOffers.find((entry) => entry.intervention.practiceId === 'logging');
      check('staged-not-requoted', {receipt:pack(staged), requote:pack(getShopOfferPrice(box.v, box.ns, staged, box.s))}, {receipt:expect[0], requote:{prestige:20, pressure:0, premium:10}});
    }
  });
  ['logging', 'barter', 'quarrying'].forEach((id, index) => check(`sequence-${index}-receipt`, paid(box, id), paidShape(expect[index])));
  flow.act(A.VASSAL_UNDO_SHOP_PURCHASE, {nodeId:box.node.id, offerId:cards[1].offerId});
  check('undo-middle', ['logging', 'quarrying'].map((id) => paid(box, id).receipt), [expect[0], {prestige:20, pressure:0, premium:10}]);
  const again = box.ns.inventory.find((entry) => entry.intervention.practiceId === 'barter');
  check('rebuy-quote', quoted(box, again), same(expect[2]));
  flow.act(A.VASSAL_PURCHASE_SHOP_OFFER, {nodeId:box.node.id, offerId:again.offerId});
  check('rebuy-receipt', ['logging', 'quarrying', 'barter'].map((id) => paid(box, id).receipt), [expect[0], {prestige:20, pressure:0, premium:10}, expect[2]]);
  const view = getVassalNodeDecisionPresentation(box.s, box.node.id);
  check('exact-totals', {projected:view.projectedPrestige, staged:view.stagedPrestigeCost, pressure:view.stagedMonsterPressureCost, bank:box.s.civilization.prestige}, {projected:0, staged:70, pressure:0, bank:70});
  untouched(box, 'exact-reserved');
  flow.act(A.VASSAL_CONFIRM_LIFE_NODE, {nodeId:box.node.id});
  check('exact-confirm', {bank:box.s.civilization.prestige, pressure:box.s.civilization.chaos.monsterPressure, pause:[box.s.paused, box.s.phase, box.s.tSec], installed:slots(box).filter(Boolean).sort()}, {bank:0, pressure:0, pause:[false, 'simulation', 0], installed:['barter', 'dryFarming', 'forage', 'logging', 'quarrying']});
  flow.finish('exact');
}

{
  const box = session(['forage', 'dryFarming', 'logging'], 100);
  const upgrade = offer(box, 'logging', 'upgrade', 'silver');
  const learn = offer(box, 'barter');
  box.ns.inventory = [upgrade, learn];
  check('upgrade-quote', quoted(box, upgrade), same({prestige:20, pressure:0, premium:0}));
  buy(box, upgrade);
  check('upgrade-receipt', paid(box, 'logging'), paidShape({prestige:20, pressure:0, premium:0}));
  check('learn-after-upgrade-quote', quoted(box, learn), same({prestige:20, pressure:0, premium:10}));
  buy(box, learn);
  check('learn-after-upgrade-receipt', paid(box, 'barter'), paidShape({prestige:20, pressure:0, premium:10}));
  untouched(box, 'upgrade-reserved');
}

{
  const box = session(['forage', 'dryFarming', 'logging', 'barter'], 50);
  const learn = offer(box, 'quarrying');
  const extra = offer(box, 'fieldStudy');
  box.ns.inventory = [learn, extra];
  check('replace-preview', previewReplace(box, learn, 'forage'), {prestige:10, pressure:0, premium:0});
  check('shelf-at-fourth-open-slot', quoted(box, learn), same({prestige:40, pressure:0, premium:30}));
  buy(box, learn, 'forage');
  check('replace-receipt', paid(box, 'quarrying'), paidShape({prestige:10, pressure:0, premium:0}));
  check('learn-after-replace-quote', quoted(box, extra), same({prestige:40, pressure:0, premium:30}));
  buy(box, extra);
  check('learn-after-replace-receipt', paid(box, 'fieldStudy'), paidShape({prestige:40, pressure:0, premium:30}));
  untouched(box, 'replace-first-reserved');
}
{
  const box = session(['forage', 'dryFarming', 'logging', 'barter'], 50);
  const learn = offer(box, 'quarrying');
  const extra = offer(box, 'fieldStudy');
  box.ns.inventory = [learn, extra];
  buy(box, learn);
  buy(box, extra, 'logging');
  check('learn-then-replace', [paid(box, 'quarrying').receipt, paid(box, 'fieldStudy').receipt], [{prestige:40, pressure:0, premium:30}, {prestige:10, pressure:0, premium:0}]);
  untouched(box, 'learn-first-reserved');
}

{
  const box = session(['forage', 'dryFarming', 'logging', 'barter'], 45);
  const structure = structureOffer(box);
  const learn = offer(box, 'quarrying');
  box.ns.inventory = [structure, learn];
  const flow = track(box);
  check('structure-quote', quoted(box, structure), same({prestige:10, pressure:0, premium:0}));
  flow.act(A.VASSAL_PURCHASE_SHOP_OFFER, {nodeId:box.node.id, offerId:structure.offerId});
  check('fifth-after-structure-quote', quoted(box, learn), same({prestige:0, pressure:40, premium:30}));
  flow.act(A.VASSAL_PURCHASE_SHOP_OFFER, {nodeId:box.node.id, offerId:learn.offerId});
  check('fifth-after-structure-receipt', [paid(box, 'mudHouses').receipt, paid(box, 'quarrying').receipt], [{prestige:10, pressure:0, premium:0}, {prestige:0, pressure:40, premium:30}]);
  untouched(box, 'structure-reserved');
  flow.act(A.VASSAL_CONFIRM_LIFE_NODE, {nodeId:box.node.id});
  check('structure-confirm', {bank:box.s.civilization.prestige, pressure:box.s.civilization.chaos.monsterPressure, pause:[box.s.paused, box.s.phase, box.s.tSec], built:box.d.structureSlots.some((slot) => slot?.structureId === 'mudHouses'), installed:slots(box).includes('quarrying')}, {bank:35, pressure:40, pause:[false, 'simulation', 0], built:true, installed:true});
  flow.finish('structure');
}

{
  const box = session(['forage', 'dryFarming'], 200);
  box.s.gameConfig.lifeMapGenerator.design.shopPricing.prices.practice.bronze.prestige = 12;
  const cards = ['logging', 'barter', 'quarrying'].map((id) => offer(box, id));
  box.ns.inventory = [...cards];
  const expect = [{prestige:12, pressure:0, premium:0}, {prestige:22, pressure:0, premium:10}, {prestige:42, pressure:0, premium:30}];
  cards.forEach((card, index) => { check(`configured-${index}-quote`, quoted(box, card), same(expect[index])); buy(box, card); check(`configured-${index}-receipt`, paid(box, card.intervention.practiceId), paidShape(expect[index])); });
  untouched(box, 'configured-reserved');
}

{
  const box = session(['forage', 'dryFarming'], 100);
  const neighbor = box.s.world.sites.find((site) => site.regionId === getAdjacentRegionIds(box.s, box.v.locationRegionId)[0]);
  neighbor.detailedState.practiceSlots = ['forage', 'dryFarming', 'logging', 'barter', null].map((id) => id ? install(id) : null);
  getRegionState(box.s, box.v.locationRegionId).structureCapacity = 8;
  const card = offer(box, 'logging');
  box.ns.inventory = [card];
  const before = serializeGameState(box.s);
  check('neighbor-capacity-quote', {slots:box.d.practiceSlots.length, structureCapacity:getRegionState(box.s, box.v.locationRegionId).structureCapacity, neighbor:neighbor.detailedState.practiceSlots.filter(Boolean).length, quote:quoted(box, card)}, {slots:5, structureCapacity:8, neighbor:4, quote:same({prestige:10, pressure:0, premium:0})});
  sameState('neighbor-pure', serializeGameState(box.s), before);
}

{
  const box = session(['forage', 'dryFarming', 'logging', 'barter', 'quarrying'], 100);
  const card = offer(box, 'fieldStudy');
  box.ns.inventory = [card];
  check('full-board-quote', quoted(box, card), same({prestige:10, pressure:0, premium:0}));
  buy(box, card);
  check('full-board-receipt', paid(box, 'fieldStudy'), paidShape({prestige:10, pressure:0, premium:0}));
  undoVassalShopPurchase(box.s, box.node.id, card.offerId);
  const replaced = box.ns.inventory.find((entry) => entry.intervention.practiceId === 'fieldStudy');
  buy(box, replaced, 'forage');
  check('full-board-replacement', paid(box, 'fieldStudy'), paidShape({prestige:10, pressure:0, premium:0}));
  untouched(box, 'full-board-reserved');
}

console.log(`[shop-prices] checks=${checks.length}; quality, premiums, treasury boundaries, undo/rebuy and replay OK`);
