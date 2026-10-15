import assert from 'node:assert/strict';
import { routeSampleRoads, windRoad } from '../images/dark-fantasy/map-generation-prototype/roads.js';
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
layOutSettlements(sites, { detail: 2, dry, world: args.world, seed: map.seed });
for (const site of sites) {
  assert.ok(site.buildings.length >= 8);
  for (const b of site.buildings) for (const dx of [-1, 1]) for (const dy of [-1, 1])
    assert.ok(dry(b.x + dx * b.w / 2, b.y + dy * b.h / 2, site.regionId), 'Building crosses water or region boundary');
  assert.ok(site.streets.some(path => path[0] === site.entrance), 'Local lane must meet entrance');
}
assert.deepEqual(waterIndices, before, 'Site planning must preserve water');
console.log('Settlement sites: five biomes, deterministic dry footprints, road connections, water preserved.');

const endpoints=sites.map(s=>s.entrance);
const routed=routeSampleRoads(endpoints,{width,height,land,waterIndices,regionIds,materialAt:()=> 'plains',bounds:{minX:0,minY:0,maxX:width,maxY:height},exclusions:sites,scale:2});
assert.equal(routed.length,4);
for(const path of routed) {
 for(const p of [path[0],path.at(-1)]) assert.ok(endpoints.some(e=>e.x===p.x&&e.y===p.y),'Route must end exactly at an entrance');
 for(const p of path) for(const s of sites) assert.ok(Math.hypot(p.x-s.x,p.y-s.y)>5,'Through-road crosses civic centre');
}
console.log('Settlement roads: exact entrances; no through-roads across town centres.');

const straight=Array.from({length:201},(_,x)=>({x,y:50}));
const bowed=windRoad(straight,{scale:1,clear:()=>true,wet:()=>false,inTown:()=>false});
assert.ok(Math.max(...bowed.map(p=>Math.abs(p.y-50)))>7,'Roads must retain broad winding character');
assert.deepEqual(bowed.slice(0,16),straight.slice(0,16),'Start approach must stay fixed');
assert.deepEqual(bowed.slice(-16),straight.slice(-16),'Terminal approach must stay fixed');
assert.ok(bowed.every((p,i)=>!i||p.x>bowed[i-1].x),'Open-land road must not double back');
const blocked=windRoad(straight,{scale:1,clear:()=>false,wet:()=>false,inTown:()=>false});
assert.deepEqual(blocked,straight,'Reject a whole unsafe bow, not scattered samples');
console.log('Road character: broad bends, protected approaches, no reversals, obstacle-safe whole-span fallback.');
