import assert from 'node:assert/strict';
import { createNewGameState } from '../src/model/new-game.js';
import { serializeGameState, deserializeGameState } from '../src/model/state.js';
import { getPlayerDetailedSites } from '../src/model/vassal-life-map/selectors.js';
import { getStockShopGenerationContext } from '../src/model/vassal-life-map/stock-shops.js';

// getStockShopGenerationContext does not return the installed list. It returns
// stockOutputs (unlocked generation candidates) and unmetStockOutputs (traits
// still missing after installed supply and in-progress construction). Those
// two lists are what Stock Supply generation reads. Locking a card removes it
// from the candidate list only. An installed locked Practice still covers the
// traits it produces, so those traits are not an unmet food gap.
const state = createNewGameState(678);
const sites = getPlayerDetailedSites(state);
assert.ok(sites.length >= 1, 'a captured new game has a player settlement');
for (const site of sites) {
  assert.equal(site.detailedState.practiceSlots[0].practiceId, 'forage', 'starter settlement has Foraging installed');
  assert.ok(site.detailedState.populationByClass.villager.adults > 0, 'starter settlement has people to feed');
}
const practices = state.gameConfig.gamepieces.practices;
assert.equal(practices.forage.stockTraits.includes('Edible'), true);
assert.equal(practices.forage.locked, undefined, 'authored Foraging is unlocked');
assert.equal(practices.dryFarming.pool, 'common');
assert.equal(practices.dryFarming.minimumQuality, 'bronze');
assert.deepEqual(practices.dryFarming.stockTraits, ['Edible', 'Grain']);
for (const def of Object.values(practices)) {
  if (def.id !== 'dryFarming') def.locked = true;
}
assert.equal(practices.forage.locked, true, 'the installed Foraging card is locked on this run');
assert.equal(practices.dryFarming.locked, undefined, 'Dry Farming stays an unlocked candidate');

const candidate = { classId: null, founderClassId: null };
const context = getStockShopGenerationContext(state, candidate);
assert.deepEqual(context.stockOutputs, ['Edible', 'Grain'], 'locked candidates are excluded; the unlocked Dry Farming outputs remain');
assert.deepEqual(context.unmetStockOutputs, [], 'locked installed Foraging still covers Edible, so food is not unmet');

const loaded = deserializeGameState(serializeGameState(state));
assert.equal(loaded.gameConfig.gamepieces.practices.forage.locked, true, 'save/load keeps the run lock');
assert.equal(loaded.gameConfig.gamepieces.practices.dryFarming.locked, undefined, 'save/load keeps the unlocked candidate');
assert.equal(getPlayerDetailedSites(loaded)[0].detailedState.practiceSlots[0].practiceId, 'forage', 'save/load keeps the installed Practice');
assert.deepEqual(getStockShopGenerationContext(loaded, candidate), {
  stockOutputs: ['Edible', 'Grain'],
  unmetStockOutputs: [],
}, 'save/load keeps the same Stock Supply context');

console.log('[locked-stock-context] OK: locked installed Foraging still covers Edible; locked candidates stay out of stockOutputs');
