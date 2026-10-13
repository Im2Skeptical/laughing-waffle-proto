import assert from 'node:assert/strict';
import { collapseTerrainChain } from './terrain-collapse.js';

const start = { kind: 'start', in: 0, out: 1, weight: 1 };
const middle = { kind: 'ridge', in: 1, out: 1, weight: 4 };
const cap = { kind: 'cap', in: 1, out: 0, weight: 1 };
const gap = { kind: null, in: 0, out: 0, weight: .2 };
const bank = [start, middle, cap, gap];
for (let seed = 0; seed < 80; seed++) {
  const domains = Array.from({ length: 24 }, (_, n) => n === 0 ? [start] : n === 23 ? [cap]
    : n === 11 ? [cap, gap] : n === 12 ? [gap, start] : bank);
  const a = collapseTerrainChain(domains, seed);
  assert.ok(a.tiles, 'Constrained corridor must solve');
  assert.deepEqual(a, collapseTerrainChain(domains, seed), 'World seed must reproduce exactly');
  for (let n = 1; n < a.tiles.length; n++) assert.equal(a.tiles[n - 1].out, a.tiles[n].in, 'Terrain ports must join');
  assert.equal(a.tiles[0].in, 0); assert.equal(a.tiles.at(-1).out, 0);
  assert.ok([cap, gap].includes(a.tiles[11]), 'Physical mask restriction must survive propagation');
}
assert.equal(collapseTerrainChain([[start], [gap]], 1).contradiction, true, 'Contradictory masks must be reported');
assert.equal(collapseTerrainChain([[]], 1).contradiction, true, 'Empty legal domain must be reported');
console.log('Terrain collapse: 80 deterministic corridors, compatible ports and masked gaps; contradictions reported.');
