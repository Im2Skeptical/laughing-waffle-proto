// The cached border split must equal a fresh computation for every
// allegiance pattern, reuse results only for identical inputs, and be cheap on repeats.
import assert from 'node:assert/strict';
import { territoryBoundarySegments, computeTerritoryBoundarySegments } from '../src/views/world-map/territory-art.js';
import { getRegionalMap } from '../src/model/regional-map/definition.js';
import { getRegionPolygon } from '../src/model/world-state.js';

const { definition } = getRegionalMap('regional-v1:1867');
const zones = pattern => definition.regions.map((region, i) => ({ regionId: region.id,
  points: getRegionPolygon(definition, region).flatMap(v => [v.x * 2424, v.y * 1080]),
  monster: pattern(i) === 2, player: pattern(i) === 1 }));
const patterns = [() => 0, i => i % 3, i => (i * 7) % 3, i => i < 4 ? 1 : 0, i => i % 2 ? 2 : 1];
let fresh = 0, cached = 0;
for (const pattern of patterns) {
  const expected = computeTerritoryBoundarySegments(zones(pattern));
  let t = performance.now();
  for (let n = 0; n < 5; n++) computeTerritoryBoundarySegments(zones(pattern));
  fresh += performance.now() - t;
  const first = territoryBoundarySegments(zones(pattern));
  assert.deepEqual(first, expected, 'cached result equals a fresh split');
  t = performance.now();
  for (let n = 0; n < 5; n++) assert.equal(territoryBoundarySegments(zones(pattern)), first, 'identical inputs reuse the result');
  cached += performance.now() - t;
}
// A changed allegiance or moved vertex must not hit a stale entry.
const base = zones(i => i % 3), moved = zones(i => i % 3);
moved[0].points[0] += 1;
assert.notEqual(territoryBoundarySegments(moved), territoryBoundarySegments(base));
assert.deepEqual(territoryBoundarySegments(moved), computeTerritoryBoundarySegments(moved));
const flipped = zones(i => i % 3); flipped[1].monster = !flipped[1].monster; flipped[1].player = false;
assert.deepEqual(territoryBoundarySegments(flipped), computeTerritoryBoundarySegments(flipped));
console.log(`territory-boundary-cache: ${definition.regions.length} regions, ${patterns.length} patterns identical; fresh ${(fresh / 25).toFixed(2)} ms/call, cached ${(cached / 25).toFixed(2)} ms/call`);
