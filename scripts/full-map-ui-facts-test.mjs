// Current inspection copy versus the stock planner and the death control check.
// Fails while a visible sentence contradicts a supported full-map result.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createNewGameState } from '../src/model/new-game.js';
import { getDetailedPracticeDef } from '../src/model/game-config.js';
import { getAdjacentRegionIds, getConnectedRegionIds, getRegionReference, getRegionState } from '../src/model/world-state.js';
import { planStock, applyStockPlan } from '../src/model/detailed-settlements/stock.js';
import { getDetailedSettlementViewModel } from '../src/model/detailed-settlements/view-model.js';
import { controlSummary, payGarrisonUpkeep, resolveControl } from '../src/model/detailed-settlements/territory.js';

const failures = [];
const expect = (name, ok, actual, expected) => {
  if (!ok) failures.push(`${name}\n  expected: ${expected}\n  actual: ${actual}`);
};
const state = createNewGameState(7);
const players = state.world.regions.filter(region => region.controller === 'player').map(region => region.id);
const trade = state.world.sites.find(site => site.neutral && players.some(id =>
  getAdjacentRegionIds(state, id).includes(site.regionId) && getConnectedRegionIds(state, id).includes(site.regionId)));
const buyerId = players.find(id => getAdjacentRegionIds(state, id).includes(trade.regionId));
const buyer = state.world.sites.find(site => site.regionId === buyerId);
const edible = trade.neutral.stocks.find(stock => stock.traits.includes('Edible'));
const piece = (game, id, extra = {}) => {
  const def = getDetailedPracticeDef(game, id);
  return { practiceId: id, tier: 'bronze', instanceId: `institution:${game.civilization.nextPracticeInstanceId++}`, charge: 0, work: 0,
    ...(def.category === 'influence' ? { allegiance: 'player' } : { stock: 0 }), ...extra };
};
const barter = piece(state, 'barter');
buyer.detailedState.practiceSlots = [piece(state, 'brewing'), piece(state, 'pottery', { stock: 1 }), { ...barter, stock: 4 }, null, null];
for (const site of state.world.sites) {
  if (getRegionState(state, site.regionId)?.controller !== 'player') continue;
  for (const slot of site.detailedState.practiceSlots) {
    if (slot && getDetailedPracticeDef(state, slot.practiceId)?.stockTraits?.includes('Edible')) slot.stock = 0;
  }
}

const plan = planStock(state, buyer.detailedState, getDetailedPracticeDef(state, 'brewing').consume);
const face = getDetailedSettlementViewModel(state, buyerId).practices[0].face;
const place = getRegionReference(state, trade.regionId);
const buy = `Buy 1 ${edible.label} from ${place} at ${edible.price} Currency each.`;
const pay = `Pay 1 Currency to ${place}.`;
const denial = face.detailLines.find(line => line.includes('No shared neutral market'));
const currency = buyer.detailedState.practiceSlots[2].stock;
const seller = trade.neutral.stocks.find(stock => stock.traits.includes('Edible'));
const sellerStock = seller.stock;
const sellerCurrency = trade.neutral.currencyStock;
expect('brewing buys the adjacent neutral', plan.ok && plan.providers.some(provider => provider.marketStockId && provider.regionId === trade.regionId && provider.unitPrice === edible.price), plan.ok, true);
expect('inspection quotes that bill', face.detailLines.includes(buy) && face.detailLines.includes(pay), face.detailLines.filter(line => line.startsWith('Buy ') || line.startsWith('Pay ')).join(' | '), `${buy} | ${pay}`);
expect('inspection explains paid neutral Consume and Require exclusion', !denial && face.detailLines.some(line=>/Consume/.test(line)&&/neutral market/.test(line)&&/Currency/.test(line)&&/Require cannot/.test(line)), denial ?? face.detailLines.join(' | '), 'paid neutral Consume; Require cannot');
assert.equal(applyStockPlan(state, buyer.detailedState, plan), true);
expect('quoted Currency is the amount paid', currency - buyer.detailedState.practiceSlots[2].stock === edible.price && sellerStock - seller.stock === 1 && trade.neutral.currencyStock - sellerCurrency === edible.price, currency - buyer.detailedState.practiceSlots[2].stock, edible.price);

const loss = createNewGameState(7);
const lossSite = loss.world.sites.find(site => site.regionId === buyerId);
const { writePopulationBins } = await import('../src/model/detailed-settlements/population-ledger.js');
writePopulationBins(lossSite.detailedState, [
  { classId: 'villager', allegiance: 'player', specialty: 'warrior', kind: 'adults', age: null, count: 4 },
  { classId: 'villager', allegiance: 'neutral', specialty: 'ordinary', kind: 'adults', age: null, count: 60 },
]);
const arms = lossSite.detailedState.practiceSlots.find(slot => getDetailedPracticeDef(loss, slot?.practiceId)?.stockTraits?.includes('Arms'));
if (arms) arms.stock = 4;
else lossSite.detailedState.practiceSlots[4] = piece(loss, 'bowmaking', { stock: 4 });
let edibleHost = lossSite.detailedState.practiceSlots.find(slot => slot && getDetailedPracticeDef(loss, slot.practiceId)?.stockTraits?.includes('Edible'));
if (!edibleHost) {
  lossSite.detailedState.practiceSlots[3] = piece(loss, 'forage', { stock: 2 });
  edibleHost = lossSite.detailedState.practiceSlots[3];
}
edibleHost.stock = 2;
lossSite.detailedState.garrison.supplied = false;
const edibleBefore = edibleHost.stock;
payGarrisonUpkeep(loss);
const before = controlSummary(loss, buyerId);
resolveControl(loss);
const enteredUnrest = controlSummary(loss,buyerId).status === 'unrest';
resolveControl(loss);
const lostWhilePaid = before.supplied === true && edibleBefore - edibleHost.stock === before.upkeep
  && before.supported === false && before.occupied === false && enteredUnrest && getRegionState(loss, buyerId).controller === 'frontier';
expect('food-paid unsupported holding is enters Unrest at the failed holding check', lostWhilePaid, getRegionState(loss, buyerId).controller, 'frontier');
const header = fs.readFileSync(new URL('../src/views/region-allegiance-header.js', import.meta.url), 'utf8');
expect('header explains threshold-triggered Unrest', header.includes('Falling below the holding threshold') && header.includes('starts Unrest'), 'current rule copy', 'threshold starts Unrest');

if (failures.length) throw new assert.AssertionError({ message: `${failures.length} current-ui fact mismatch${failures.length === 1 ? '' : 'es'}\n\n${failures.join('\n\n')}`, expected: 0, actual: failures.length });
console.log('full-map ui facts: checked quotes and the paid-garrison loss');
