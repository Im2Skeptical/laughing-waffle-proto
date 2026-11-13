// Card prices and permanent regional space unlocks are separate staged purchases.
// node scripts/shop-price-interactions-test.mjs
import assert from 'node:assert/strict';
import {ActionKinds as A, applyAction} from '../src/model/actions.js';
import {setPaused} from '../src/model/game-model.js';
import {resolveLifeMapShopPrice} from '../src/model/life-map-balance.js';
import {createNewGameState} from '../src/model/new-game.js';
import {deserializeGameState, serializeGameState, syncPhaseToPaused} from '../src/model/state.js';
import {appendActionAtCursor, createTimelineFromInitialState, rebuildStateAtSecond} from '../src/model/timeline/index.js';
import {confirmVassalLifeNode, enterVassalLifeNode, getCurrentLifeMapVassal, getVassalCandidatePool, getVassalNodeDecisionPresentation, selectLifeMapVassal, selectVassalNodeOption} from '../src/model/vassal-life-map.js';
import {purchaseVassalShopOffer, undoVassalShopPurchase, validatePurchaseInterventions} from '../src/model/vassal-life-map/shop.js';
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
  d.unlockedPracticeSlots = Math.max(3, filled.length);
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

// Ordinary openings are small across roads, terrain and seeds.
for (const seed of [1,42,123,1867,99117,424242,2026]) {
  const state=createNewGameState(seed);
  for(const site of state.world.sites.filter(site=>getRegionState(state,site.regionId).controller==='player')) {
    assert.equal(site.detailedState.practiceSlots.filter(Boolean).length,3,`seed ${seed}: three starting Practices`);
    assert.equal(site.detailedState.unlockedPracticeSlots,3);
  }
}
const unlocks = box => getVassalNodeDecisionPresentation(box.s,box.node.id).settlement.practiceSlotUnlocks;
const unlock = (box, capacity) => purchaseVassalShopOffer(box.s,box.node.id,`practice-slot:${capacity}`);

for (const [treasury,expected] of [[10,{prestige:10,pressure:0,premium:0}],[9,{prestige:0,pressure:10,premium:0}]]) {
  const box=session(['forage','dryFarming','logging'],treasury),card=offer(box,'barter');box.ns.inventory=[card];
  check('normal-card-price',quoted(box,card),same(expected));
  buy(box,card,'forage');check('normal-replacement-receipt',paid(box,'barter'),paidShape(expected));
  untouched(box,'replacement-only-reserved');
}
{
  const box=session(['forage','dryFarming','logging'],100),card=offer(box,'barter');box.ns.inventory=[card];
  const before=serializeGameState(box.s);
  check('space-prices',unlocks(box).map(u=>[u.capacity,u.prestigeCost,u.canStage]),[[4,10,true],[5,30,false]]);
  sameState('unlock-read-pure',serializeGameState(box.s),before);
  check('fifth-before-fourth',unlock(box,5).ok,false);
  const flow=track(box);
  flow.act(A.VASSAL_PURCHASE_SHOP_OFFER,{nodeId:box.node.id,offerId:'practice-slot:4'});
  check('staged-space-does-not-change-live',box.d.unlockedPracticeSlots,3);
  check('duplicate-unlock',unlock(box,4).ok,false);
  check('item-price-after-unlock',quoted(box,card),same({prestige:10,pressure:0,premium:0}));
  const lockedDrop=purchaseVassalShopOffer(box.s,box.node.id,card.offerId,null,4);
  check('locked-space-drop',lockedDrop,{ok:false,reason:'invalidPurchaseOrder'});
  flow.act(A.VASSAL_PURCHASE_SHOP_OFFER,{nodeId:box.node.id,offerId:card.offerId,toIndex:3});
  check('cannot-undo-occupied-unlock',undoVassalShopPurchase(box.s,box.node.id,'practice-slot:4').ok,false);
  untouched(box,'unlock-card-still-staged');
  check('separate-totals',getVassalNodeDecisionPresentation(box.s,box.node.id).stagedPrestigeCost,20);
  flow.act(A.VASSAL_UNDO_SHOP_PURCHASE,{nodeId:box.node.id,offerId:card.offerId});
  flow.act(A.VASSAL_UNDO_SHOP_PURCHASE,{nodeId:box.node.id,offerId:'practice-slot:4'});
  check('unlock-does-not-become-shelf-card',box.ns.inventory.length,1);
  flow.act(A.VASSAL_PURCHASE_SHOP_OFFER,{nodeId:box.node.id,offerId:'practice-slot:4'});
  flow.act(A.VASSAL_PURCHASE_SHOP_OFFER,{nodeId:box.node.id,offerId:card.offerId,toIndex:3});
  flow.act(A.VASSAL_CONFIRM_LIFE_NODE,{nodeId:box.node.id});
  check('confirm-paid-once',[box.s.civilization.prestige,box.d.unlockedPracticeSlots,slots(box).includes('barter')],[80,4,true]);
  flow.finish('unlock-confirm');
  const loaded=deserializeGameState(serializeGameState(box.s));
  check('save-retains-space',loaded.world.sites.find(site=>site.regionId===box.v.locationRegionId).detailedState.unlockedPracticeSlots,4);
}
{
  const box=session(['forage','dryFarming','logging'],40),flow=track(box);
  flow.act(A.VASSAL_PURCHASE_SHOP_OFFER,{nodeId:box.node.id,offerId:'practice-slot:4'});
  flow.act(A.VASSAL_PURCHASE_SHOP_OFFER,{nodeId:box.node.id,offerId:'practice-slot:5'});
  check('dependent-unlock-undo-blocked',undoVassalShopPurchase(box.s,box.node.id,'practice-slot:4').ok,false);
  flow.act(A.VASSAL_CONFIRM_LIFE_NODE,{nodeId:box.node.id});
  check('empty-space-purchase',[box.d.unlockedPracticeSlots,box.s.civilization.prestige,slots(box).filter(Boolean).length],[5,5,3]);
  flow.finish('empty-unlocks');
}
{
  const box=session(['forage','dryFarming','logging'],9);
  check('unlock-needs-prestige',unlock(box,4).ok,false);
  untouched(box,'failed-unlock-pure');
}
{
  const box=session(['forage','dryFarming','logging'],20),card=offer(box,'barter');box.ns.inventory=[card];
  buy(box,card,'forage');check('fourth-unlock',unlock(box,4).ok,true);
  check('space-reserves-own-price',paid(box,'barter'),paidShape({prestige:10,pressure:0,premium:0}));
  check('reserved-total',getVassalNodeDecisionPresentation(box.s,box.node.id).stagedPrestigeCost,20);
}
// Paid capacity survives deliberate removal and later refilling.
{
  const box=session(['forage','dryFarming','logging','barter'],100);
  const remove=offer(box,'barter','remove');box.ns.inventory=[remove];
  buy(box,remove);
  assert.equal(confirmVassalLifeNode(box.s,box.node.id).ok,true);
  check('remove-preserves-unlock',[box.d.unlockedPracticeSlots,slots(box).includes('barter')],[4,false]);
  // The projection accepts a new card in that already paid fourth space.
  const card=offer(box,'quarrying');
  const projected=validatePurchaseInterventions(box.s,box.v,[{...card,tableauIndex:3}]);
  check('refill-paid-space',[projected.ok,projected.reservation.unlockedPracticeSlots,projected.reservation.practiceSlots[3].practiceId],[true,4,'quarrying']);
}
{
  const box=session(['forage','dryFarming','logging','barter','quarrying'],100),card=offer(box,'fieldStudy');box.ns.inventory=[card];
  check('full-board-price',quoted(box,card),same({prestige:10,pressure:0,premium:0}));
  buy(box,card,'forage');check('full-board-replacement',paid(box,'fieldStudy'),paidShape({prestige:10,pressure:0,premium:0}));
}
console.log(`[shop-prices] checks=${checks.length}; separate permanent unlocks, card prices, undo, save and replay OK`);
