import assert from 'node:assert/strict';
import { getSettlementVassalFocusWindows } from '../src/views/ui-root/settlement-timegraph-window.js';
const state = { tSec: 80, civilization: { vassalLineage: {
  selectedVassalIds: ['a', 'b', 'c'], vassalsById: {
    a: { vassalId: 'a', selectedSec: 0 }, b: { vassalId: 'b', selectedSec: 30 },
    c: { vassalId: 'c', selectedSec: 70 },
  },
} } };
const before = JSON.stringify(state);
assert.deepEqual(getSettlementVassalFocusWindows(state, 120), [
  { id: 'a', minSec: 0, maxSec: 30 }, { id: 'b', minSec: 30, maxSec: 70 },
  { id: 'c', minSec: 70, maxSec: 120 },
]);
assert.equal(JSON.stringify(state), before, 'view windows never mutate lineage');
assert.deepEqual(getSettlementVassalFocusWindows(null), []);
state.civilization.vassalLineage.selectedVassalIds = ['a'];
assert.equal(getSettlementVassalFocusWindows(state, 120).length, 1);
console.log('[timegraph-focus] OK: tenure boundaries, empty/single lineage, read-only state');

const { drawLifeMapNodeIcon } = await import('../src/views/life-map-node-icon.js');
function icon(node) {
  const calls = [];
  const graphics = new Proxy({}, { get: (_, method) => (...args) => {
    calls.push([method, ...args]); return graphics;
  } });
  drawLifeMapNodeIcon(graphics, node, { fill: 1, accent: 2, outline: 3 });
  return calls;
}
const base = icon({ family: 'shop' });
for (const family of ['practiceReform', 'publicWorks', 'neutralMarket', 'classMarket',
  'foodShop', 'housingShop', 'knowledgeShop', 'stockShop']) {
  const calls = icon({ family });
  assert.deepEqual(calls.slice(0, base.length), base, `${family} shares the shop base`);
  assert.ok(calls.some(call => call[0] === 'drawCircle' && call[1] === 20 && call[2] === 16),
    `${family} has a corner badge`);
}
assert.deepEqual(icon({ family: 'custom', contentMode: 'shop' }), base);
assert.ok(!icon({ family: 'development' }).some(call => call[0] === 'drawCircle'));
console.log('[shop-icons] OK: shared base, specialty corner badges, non-shop unchanged');
