import assert from 'node:assert/strict';
import { planSettlementSites, layOutSettlements } from '../images/dark-fantasy/map-generation-prototype/settlement-sites.js';

const biomes = ['plains', 'forest', 'islands', 'swamp', 'mountains'];
const width = 500, height = 100;
const land = new Uint8Array(width * height).fill(1);
const waterIndices = new Uint8Array(width * height);
const regionIds = new Uint8Array(width * height);
for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
  regionIds[y * width + x] = Math.floor(x / 100);
  if (y < 18 || y > 82) waterIndices[y * width + x] = 128;
}
const map = { seed: 1867, regions: biomes.map((biome, i) => ({
  id: `R${i + 1}`, biome, centre: { x: i * 100 + 50, y: 50 },
  outline: [{ x: i * 100, y: 0 }, { x: i * 100 + 99, y: 0 }, { x: i * 100 + 99, y: 99 }, { x: i * 100, y: 99 }],
})) };
const args = { map, pixel: p => p, world: (x, y) => ({ x, y }), width, height, land, waterIndices, regionIds, detail: 2 };
const before = waterIndices.slice();
const sites = planSettlementSites(args);
assert.deepEqual(sites, planSettlementSites(args), 'Site planning must be deterministic');
assert.equal(sites.length, 5);
const dry = (x, y, id) => x >= 0 && y >= 0 && x < width && y < height
  && !waterIndices[Math.floor(y) * width + Math.floor(x)]
  && map.regions[regionIds[Math.floor(y) * width + Math.floor(x)]].id === id;
const roads = sites.map(s => [{ x: s.x - 18, y: s.y }, { x: s.x, y: s.y }, { x: s.x + 18, y: s.y }]);
layOutSettlements(sites, roads, { detail: 2, dry, world: args.world, seed: map.seed });
for (const site of sites) {
  assert.ok(site.buildings.length >= 8);
  for (const b of site.buildings) for (const dx of [-1, 1]) for (const dy of [-1, 1])
    assert.ok(dry(b.x + dx * b.w / 2, b.y + dy * b.h / 2, site.regionId), 'Building crosses water or region boundary');
  assert.ok(site.streets.some(path => path.some(p => roads.flat().some(r => r.x === p.x && r.y === p.y))), 'No road connection');
}
assert.deepEqual(waterIndices, before, 'Site planning must preserve water');
console.log('Settlement sites: five biomes, deterministic dry footprints, road connections, water preserved.');
