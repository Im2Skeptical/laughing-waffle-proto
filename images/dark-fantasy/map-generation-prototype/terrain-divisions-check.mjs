import assert from 'node:assert/strict';
import { paintRegionDivisions } from './terrain-divisions.js';
import { bridgeSpans, paintBridge } from './road-crossings.js';

const samples = Array.from({ length: 60 }, (_, n) => ({ x: n + 5, y: 30 }));
const waterAt = p => p.x >= 24 && p.x <= 33 ? 16 : 0;
const spans = bridgeSpans(samples, waterAt, 2);
assert.equal(spans.length, 1, 'A wet run must produce one complete bridge');
assert.ok(spans[0].a.x < 24 - 7 && spans[0].b.x > 33 + 7, 'Deck must reach both dry-bank approaches');
const painted = new Map();
paintBridge(spans[0], 2, (x, y, radius, colour) => painted.set(`${x},${y}`, colour));
for (let x = 24; x <= 33; x++) assert.ok(painted.has(`${x},30`), 'Bridge deck must cover every river centre pixel');
assert.ok(painted.has(`${spans[0].a.x},24`), 'Abutment must extend beyond the deck on dry land');
assert.deepEqual(spans, bridgeSpans(samples, waterAt, 2));

const width = 80, height = 60, size = width * height;
const regions = [{ id: 'a', biome: 'plains' }, { id: 'b', biome: 'plains' }];
const map = { seed: 1875, regions, edges: [{ id: 1, regions: ['a', 'b'], points: [{ x: 40, y: 5 }, { x: 40, y: 55 }] }] };
const land = new Uint8Array(size).fill(1), regionIds = new Int16Array(size);
for (let y = 0; y < height; y++) for (let x = 40; x < width; x++) regionIds[y * width + x] = 1;
const waterIndices = new Uint8Array(size), colours = new Uint32Array(size).fill(0xb7a17b);
for (let x = 0; x < width; x++) { waterIndices[30 * width + x] = 16; colours[30 * width + x] = 0x41747c; }
const originalWater = waterIndices.slice(), originalRegions = regionIds.slice();
const mixColour = (a, b, t) => [16, 8, 0].reduce((c, s) => c | Math.round((a >> s & 255) * (1 - t) + (b >> s & 255) * t) << s, 0);
const args = { map, pixel: p => p, width, height, detail: 2, land, regionIds, waterIndices, colours,
  groundBank: { plains: [0x9f8c69, 0xac9670, 0xb7a17b, 0xc5b18d] }, noise: () => .5, mixColour };
const result = paintRegionDivisions(args);
assert.equal(result.stats.sameBiomeEdges, 1, 'Same-biome edges must get a geographic division');
for (let y = 5; y <= 55; y++) if (y !== 30) {
  assert.notEqual(colours[y * width + 40], 0xb7a17b, 'Entire dry border must be illustrated');
  assert.equal(result.clearance.data[y * width + 40], 255, 'Relief must leave a continuous readable core');
}
assert.equal(colours[30 * width + 40], 0x41747c, 'Existing rivers must survive border treatment');
assert.equal(colours[20 * width + 10], 0xb7a17b, 'Interior ground must stay unchanged');
assert.deepEqual(waterIndices, originalWater); assert.deepEqual(regionIds, originalRegions);
console.log('Terrain divisions: same-biome continuity, protected rivers and ownership; bridges: continuous decks and dry-bank abutments pass.');
