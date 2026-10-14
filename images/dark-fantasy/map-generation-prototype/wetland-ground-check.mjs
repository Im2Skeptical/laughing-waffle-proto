import assert from 'node:assert/strict';
import { paintWetlandPools } from './wetland-ground.js';
const width = 120, height = 90, size = width * height;
const map = { seed: 1875, regions: [{ biome: 'swamp', centre: { x: 25, y: 45 } }, { biome: 'forest', centre: { x: 95, y: 45 } }] };
const regionIds = new Int16Array(size);
for (let y = 0; y < height; y++) for (let x = 60; x < width; x++) regionIds[y * width + x] = 1;
const land = new Uint8Array(size).fill(1), dryDistance = new Uint16Array(size).fill(40);
const make = () => ({ colours: new Uint32Array(size).fill(0x778675), waterIndices: new Uint8Array(size), waterBase: new Uint32Array(size), waterStrength: new Uint8Array(size) });
const noise = (seed, x, y) => .56 + .17 * Math.sin(x / 8) * Math.cos(y / 9);
const mixColour = (a, b, t) => [16, 8, 0].reduce((c, s) => c | Math.round((a >> s & 255) * (1 - t) + (b >> s & 255) * t) << s, 0);
const a = make(), b = make(), args = { map, pixel: p => p, width, height, detail: 1, regionIds, land, dryDistance, noise, mixColour };
const depths = [];
const surfaces = { bank: (biome, x, y, depth) => { depths.push(depth); return 0x74596b; } };
const result = paintWetlandPools({ ...args, ...a, surfaces }); paintWetlandPools({ ...args, ...b, surfaces });
assert.ok(result.illustratedBanks > 0 && depths.some(d => d < .46) && depths.some(d => d > .53), 'Imported bank profiles must wrap both dry and submerged sides of pool contours');
assert.ok(result.pools > 0 && result.margins > 0, 'Wetlands need open pools and textured margins');
assert.deepEqual(a, b, 'Wetland detail must be deterministic');
assert.equal(a.waterIndices[45 * width + 25], 0, 'Site approach must remain dry');
for (let i = 0; i < size; i++) {
  assert.equal(land[i], 1, 'Visual pools must not change gameplay land');
  if (regionIds[i] === 1) { assert.equal(a.colours[i], 0x778675); assert.equal(a.waterIndices[i], 0); }
  if (a.waterIndices[i]) {
    assert.ok(a.waterIndices[i] >= 48 && a.waterIndices[i] <= 55);
    assert.ok(a.waterBase[i] && a.waterStrength[i] <= 18, 'Pool depth wash must dominate quiet cyclic ripples');
  }
}
console.log('Wetlands: deterministic pools and banks, quiet cycle modulation, protected sites, forest and gameplay land pass.');
