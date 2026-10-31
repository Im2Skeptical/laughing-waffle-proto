// Shop multiplier previews: two structures, a new Practice, unfinished work,
// displacement, quality, Scholar staffing, reorder and undo. Seed 0's Neutral
// Market is the fixture. Pause policy: the sandbox is unpaused, phase
// "simulation", tSec 0. These calls must not pause, tick, confirm, or touch RNG.
import assert from 'node:assert/strict';
import {createLabNodeSandbox} from '../src/model/dev-lab/node-sandbox.js';
import {fiveSlots, practiceSlot, setFixturePopulation} from '../src/model/dev-lab/fixtures.js';
import {getCurrentLifeMapVassal, getVassalNodeDecisionPresentation, purchaseVassalShopOffer,
  undoVassalShopPurchase, reorderVassalShopPurchase} from '../src/model/vassal-life-map.js';
import {resolveLifeMapShopPrice} from '../src/model/life-map-balance.js';
import {serializeGameState} from '../src/model/state.js';

const sandbox = createLabNodeSandbox({type:'neutralMarket', seed:0, cunning:100, prestige:500, classId:'scholar'});
const state = sandbox.state, nodeId = sandbox.nodeId;
const vassal = getCurrentLifeMapVassal(state);
const board = state.world.sites.find((site) => site.regionId === vassal.locationRegionId).detailedState;
const node = vassal.lifeMap.nodeStates[nodeId];
setFixturePopulation(board, 30, 3);
board.practiceSlots = fiveSlots(practiceSlot('forage'), practiceSlot('logging'), practiceSlot('dryFarming'), practiceSlot('quarrying'), practiceSlot('surfaceMining'));
board.structureSlots.fill(null);
assert.ok(board.structureSlots.length >= 7);
const last = board.structureSlots.length - 1;
board.structureSlots[0] = {structureId:'academy', origin:0, width:3, placementId:'live:academy', qualityBonus:1};
board.structureSlots[last] = {structureId:'granary', origin:last, width:1, placementId:'live:unfinished-granary', qualityBonus:2, construction:{completedCycles:0}};
// Eight new Bronze keyword Practices enlarged the shop pool, so seed 0's rolled
// Neutral Market mix no longer includes Storehouse/Granary/Pastoralism. Pin the
// inventory those checks were written against (Diamond quality via qualityBonus 3).
const regionId = vassal.locationRegionId;
node.inventory = [
  resolveLifeMapShopPrice(state, {
    offerId: `${nodeId}:r0:structure:0`,
    label: 'Build Diamond Storehouse',
    basePrestigeCost: 40, basePhaseCost: 160, baseCurrencyCost: 0,
    intervention: {kind:'structure', mode:'add', targetRegionId:regionId, structureId:'storehouse', tier:'bronze', qualityBonus:3},
  }),
  resolveLifeMapShopPrice(state, {
    offerId: `${nodeId}:r0:structure:1`,
    label: 'Build Diamond Granary',
    basePrestigeCost: 40, basePhaseCost: 160, baseCurrencyCost: 0,
    intervention: {kind:'structure', mode:'add', targetRegionId:regionId, structureId:'granary', tier:'bronze', qualityBonus:3},
  }),
  resolveLifeMapShopPrice(state, {
    offerId: `${nodeId}:r0:practice:2`,
    label: 'Learn Diamond Pastoralism',
    basePrestigeCost: 40, basePhaseCost: 160,
    intervention: {kind:'practice', targetRegionId:regionId, practiceId:'pastoralism', mode:'learn', tier:'bronze', resultingTier:'diamond'},
  }),
].map((offer, inventoryIndex) => ({...offer, inventoryIndex}));
const storehouse = node.inventory.find((offer) => offer.intervention.structureId === 'storehouse');
const granary = node.inventory.find((offer) => offer.intervention.structureId === 'granary');
const pastoralism = node.inventory.find((offer) => offer.intervention.practiceId === 'pastoralism');
assert.equal(storehouse.intervention.qualityBonus, 3);
assert.equal(granary.intervention.qualityBonus, 3);
const rng = JSON.stringify(state.rng);
const live = () => JSON.stringify(board.structureSlots);
const frozen = live();
function present(preview) { return getVassalNodeDecisionPresentation(state, nodeId, preview); }
function row(presentation, practiceId) {
  return presentation.settlement.multiplierPreview.rows.find((entry) => entry.practiceId === practiceId);
}
function amounts(presentation, practiceId, structureId) {
  return row(presentation, practiceId).capacity.sources.filter((source) => source.id === structureId)
    .map((source) => ({amount:source.amount, pending:source.pending}));
}
function untouched(label) {
  assert.equal(JSON.stringify(state.rng), rng, label);
  assert.equal(state.paused, false, label);
  assert.equal(state.phase, 'simulation', label);
  assert.equal(state.tSec, 0, label);
  assert.equal(live(), frozen, label);
  assert.deepEqual(board.structureSlots[last].construction, {completedCycles:0}, label);
}
const order = ['forage', 'logging', 'dryFarming', 'quarrying', 'surfaceMining'];
let checks = 0;
function eq(actual, expected, label) { assert.deepEqual(actual, expected, label); checks += 1; }

const first = present();
const hoverGranary = present({previewOfferId:granary.offerId});
const hoverStorehouse = present({previewOfferId:storehouse.offerId});
const hoverAgain = present({previewOfferId:granary.offerId});
untouched('repeated previews');
eq(JSON.stringify(row(hoverGranary, 'forage')), JSON.stringify(row(hoverAgain, 'forage')), 'granary hover is stable');
// Gold Academy +1 quality is +4. Three Scholars staff slots 0–2. Forage has no
// Knowledge tag, so only staffing matches. Quarrying is unstaffed and unmatched.
// Surface Mining's own Knowledge tag matches without a Scholar. The unfinished
// Granary (quality +2, worth +3) stays pending and contributes nothing.
eq(row(first, 'forage').capacity.multiplier, 5);
eq(amounts(first, 'forage', 'academy'), [{amount:4, pending:false}]);
eq(amounts(first, 'forage', 'granary'), []);
eq(row(first, 'quarrying').capacity.multiplier, 1);
eq(amounts(first, 'quarrying', 'academy'), []);
eq(row(first, 'surfaceMining').capacity.multiplier, 5);
eq(row(first, 'dryFarming').output.multiplier, 2, 'authored fixture has one plains region');
eq(row(first, 'logging').output.multiplier, 1);
// Bronze quality 3 adds +3 to an authored +1. Hover completes only that offer.
eq(row(hoverGranary, 'forage').capacity.multiplier, 9);
eq(row(hoverGranary, 'forage').before?.capacity?.multiplier, 5);
eq(amounts(hoverGranary, 'forage', 'granary'), [{amount:4, pending:true}]);
eq(row(hoverGranary, 'logging').capacity.multiplier, 5);
eq(row(hoverStorehouse, 'logging').capacity.multiplier, 9);
eq(amounts(hoverStorehouse, 'logging', 'storehouse'), [{amount:4, pending:true}]);
eq(row(hoverStorehouse, 'forage').capacity.multiplier, 5);
eq(row(hoverStorehouse, 'dryFarming').output.multiplier, 2);
const offered = hoverGranary.offers.find((offer) => offer.offerId === granary.offerId);
eq(offered.multiplierPreview.rows.find((entry) => entry.practiceId === 'forage').capacity.multiplier, 9);

setFixturePopulation(board, 30, 2);
const gated = present();
eq(row(gated, 'forage').capacity.multiplier, 1, 'Academy gate is 3 Scholars');
eq(row(gated, 'surfaceMining').capacity.multiplier, 1);
eq(amounts(gated, 'surfaceMining', 'academy'), []);
setFixturePopulation(board, 30, 3);
untouched('population fixture restored');
eq(row(present(), 'forage').capacity.multiplier, 5);

const moved = reorderVassalShopPurchase(state, nodeId, 'practice:quarrying', 0);
assert.equal(moved.ok, true, moved.reason);
eq(row(present(), 'quarrying').capacity.multiplier, 5, 'slot 0 is Scholar-staffed');
const back = reorderVassalShopPurchase(state, nodeId, 'practice:quarrying', 3);
assert.equal(back.ok, true, back.reason);
eq(row(present(), 'quarrying').capacity.multiplier, 1);
eq(present().settlement.practices.map((slot) => slot?.practiceId ?? null), order);
untouched('reorder does not touch the live board or RNG');

board.structureSlots[3] = {structureId:'granary', origin:3, width:1, placementId:'live:granary', qualityBonus:0};
const withGranary = live();
eq(row(present(), 'forage').capacity.multiplier, 6);
eq(amounts(present(), 'forage', 'granary'), [{amount:1, pending:false}]);
const displaced = purchaseVassalShopOffer(state, nodeId, storehouse.offerId, 3);
assert.equal(displaced.ok, true, displaced.reason);
const during = present();
eq(during.settlement.demolishedStructures.map((slot) => slot.placementId), ['live:granary']);
eq(row(during, 'forage').capacity.multiplier, 5, 'displaced Granary drops out of the preview');
eq(row(during, 'logging').capacity.multiplier, 9);
eq(amounts(during, 'logging', 'storehouse'), [{amount:4, pending:true}]);
eq(amounts(during, 'forage', 'granary'), []);
assert.equal(live(), withGranary, 'staging does not demolish the live strip');
const commission = node.nextCommissionId;
undoVassalShopPurchase(state, nodeId, displaced.offerId);
const restored = present();
eq(restored.settlement.demolishedStructures, []);
eq(row(restored, 'forage').capacity.multiplier, 6);
eq(row(restored, 'logging').capacity.multiplier, 5);
eq(node.accumulatedPhaseCost, 0);
eq(vassal.prestige, 500);
eq(node.nextCommissionId, commission, 'undo keeps the issued structure commission id');
assert.equal(live(), withGranary);
board.structureSlots[3] = null;
assert.equal(live(), frozen);

const bought = [granary, storehouse].map((offer) => purchaseVassalShopOffer(state, nodeId, offer.offerId));
assert.ok(bought.every((result) => result.ok), bought.map((result) => result.reason).join(','));
const learned = purchaseVassalShopOffer(state, nodeId, pastoralism.offerId, null, 0);
assert.equal(learned.ok, true, learned.reason);
const reserved = present();
const ids = reserved.settlement.practices.map((slot) => slot?.practiceId ?? null);
eq(ids, ['pastoralism', 'forage', 'logging', 'dryFarming', 'quarrying']);
eq(reserved.settlement.discardedPractices.map((slot) => slot?.practiceId), ['surfaceMining']);
eq(row(reserved, 'pastoralism').before?.capacity?.multiplier, 5);
eq(row(reserved, 'pastoralism').capacity.multiplier, 9);
eq(amounts(reserved, 'pastoralism', 'granary'), [{amount:4, pending:true}]);
eq(amounts(reserved, 'pastoralism', 'academy'), [{amount:4, pending:false}]);
eq(row(reserved, 'forage').capacity.multiplier, 9);
eq(row(reserved, 'forage').before?.capacity?.multiplier, 5);
eq(amounts(reserved, 'forage', 'granary'), [{amount:4, pending:true}]);
eq(row(reserved, 'logging').capacity.multiplier, 9);
eq(amounts(reserved, 'logging', 'storehouse'), [{amount:4, pending:true}]);
eq(amounts(reserved, 'logging', 'granary'), []);
eq(row(reserved, 'dryFarming').capacity.multiplier, 5);
eq(row(reserved, 'dryFarming').before?.capacity?.multiplier, 5);
eq(amounts(reserved, 'dryFarming', 'academy'), [], 'the new Practice pushes Dry Farming off a Scholar socket');
eq(amounts(reserved, 'dryFarming', 'granary'), [{amount:4, pending:true}]);
eq(row(reserved, 'dryFarming').output.multiplier, 2);
eq(row(reserved, 'logging').output.multiplier, 1);
eq(row(reserved, 'quarrying').capacity.multiplier, 5);
eq(row(reserved, 'quarrying').before?.capacity?.multiplier, 1);
eq(amounts(reserved, 'quarrying', 'storehouse'), [{amount:4, pending:true}]);
assert.equal(live(), frozen, 'two reservations leave the live strip alone');
assert.equal(board.practiceSlots.map((slot) => slot.practiceId).join(','), order.join(','));
const issued = node.nextCommissionId;
for (const purchase of [...node.purchasedOffers]) undoVassalShopPurchase(state, nodeId, purchase.offerId);
const cleared = present();
eq(cleared.settlement.practices.map((slot) => slot?.practiceId ?? null), order);
eq(row(cleared, 'forage').capacity.multiplier, 5);
eq(row(cleared, 'logging').capacity.multiplier, 5);
eq(amounts(cleared, 'forage', 'granary'), []);
eq(node.accumulatedPhaseCost, 0);
eq(vassal.prestige, 500);
eq(node.nextCommissionId, issued);
untouched('undo restores the live strip without rolling RNG');
assert.equal(JSON.stringify(serializeGameState(state)).includes('"completedCycles":1'), false);
console.log(`[shop-preview] OK: ${checks} checks, seed 0 neutral market, two structures, new Practice, staffing, quality, displacement, undo`);
