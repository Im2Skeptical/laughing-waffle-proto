import assert from 'node:assert/strict';
import { getRegionalMap, regionalMapId } from '../src/model/regional-map/definition.js';
import { routeSampleRoads, windRoad } from '../images/dark-fantasy/map-generation-prototype/roads.js';
import { planSettlementSites, layOutSettlements, siteReliefContains, siteContains, settlementGroundWeight, paintSettlementSites } from '../images/dark-fantasy/map-generation-prototype/settlement-sites.js';

const biomes = ['plains', 'forest', 'islands', 'swamp', 'mountains'];
for(const seed of [42,1867]){
  const {map,definition}=getRegionalMap(regionalMapId(seed));
  for(const region of definition.regions){
    const source=map.regions.find(r=>r.id===region.id);
    assert.equal(region.biome,source.biome==='monster'?source.terrainBiome:source.biome);
    assert.ok(!region.name.startsWith('Monster '),'Live region names describe the underlying terrain');
  }
}
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

const liveRoutes=routeSampleRoads(endpoints,{width,height,land,waterIndices,regionIds,materialAt:()=> 'plains',
  bounds:{minX:0,minY:0,maxX:width,maxY:height},exclusions:sites,scale:2,pairs:[{a:1,b:3,id:'R2:R4'}]});
assert.equal(liveRoutes.length,1,'Live roads must not invent a sample spanning tree');
assert.equal(liveRoutes[0].connectionId,'R2:R4');
assert.deepEqual(liveRoutes[0][0],endpoints[1]);
assert.deepEqual(liveRoutes[0].at(-1),endpoints[3]);
const repeatedBiome={...map,regions:map.regions.map(r=>({...r,biome:'plains'}))};
assert.equal(planSettlementSites({...args,map:repeatedBiome,perRegion:true}).length,5,'Live towns are planned per region, not one per biome');
const narrowWater=new Uint8Array(width*height).fill(128);
for(let y=45;y<=55;y++)for(let x=0;x<width;x++)narrowWater[y*width+x]=0;
const small=planSettlementSites({...args,waterIndices:narrowWater,perRegion:true});
assert.equal(small.length,5,'Small dry regions still receive compact towns');
assert.ok(small.every(s=>s.rx<23));
layOutSettlements(small,{detail:2,world:args.world,seed:map.seed,dry:(x,y)=>x>=0&&y>=45&&x<width&&y<=55});
assert.ok(small.every(s=>s.buildings.length>=5),'Compact layouts scale their buildings with the footprint');

// Retained from the paused site audit: a fully flooded region cannot receive a
// town, and narrow dry strips must select the largest fitting fallback footprint.
assert.deepEqual(planSettlementSites({...args,waterIndices:new Uint8Array(width*height).fill(128),perRegion:true}),[]);
assert.deepEqual(planSettlementSites({...args,land:new Uint8Array(width*height),perRegion:true}),[]);
assert.ok(small.every(site=>site.rx===23*.3&&site.ry===16*.3),'11-pixel strips use the .3 footprint');
const landBefore=land.slice(),regionsBefore=regionIds.slice();
for(const seed of [0,1,7,42,1867,4294967295]) {
  const seededArgs={...args,map:{...map,seed},perRegion:true};
  const planned=planSettlementSites(seededArgs);
  assert.equal(planned.length,5);
  assert.deepEqual(planSettlementSites(seededArgs),planned,`Repeatable sites for seed ${seed}`);
  const normal=structuredClone(planned),zoomed=structuredClone(planned);
  layOutSettlements(normal,{detail:1,dry,world:args.world,seed});
  layOutSettlements(zoomed,{detail:9,dry,world:args.world,seed});
  assert.deepEqual(zoomed,normal,`Camera detail cannot move towns for seed ${seed}`);
}
assert.deepEqual(land,landBefore,'Planning and layout preserve land');
assert.deepEqual(regionIds,regionsBefore,'Planning and layout preserve region identities');
console.log('Settlement boundaries: flooded/empty land, compact fallback, six seeds and camera-independent layouts.');

const straight=Array.from({length:201},(_,x)=>({x,y:50}));
const bowed=windRoad(straight,{scale:1,clear:()=>true,wet:()=>false,inTown:()=>false});
assert.ok(Math.max(...bowed.map(p=>Math.abs(p.y-50)))>7,'Roads must retain broad winding character');
assert.deepEqual(bowed.slice(0,16),straight.slice(0,16),'Start approach must stay fixed');
assert.deepEqual(bowed.slice(-16),straight.slice(-16),'Terminal approach must stay fixed');
assert.ok(bowed.every((p,i)=>!i||p.x>bowed[i-1].x),'Open-land road must not double back');
const blocked=windRoad(straight,{scale:1,clear:()=>false,wet:()=>false,inTown:()=>false});
assert.deepEqual(blocked,straight,'Reject a whole unsafe bow, not scattered samples');
console.log('Road character: broad bends, protected approaches, no reversals, obstacle-safe whole-span fallback.');

const island=sites.find(s=>s.biome==='islands');
for(const building of island.buildings) assert.ok(siteReliefContains([island],building.x,building.y),'Island relief must protect every building');
assert.ok(siteReliefContains([island],island.court.x,island.court.y),'Court remains protected');
let fringe=0;
for(let y=Math.floor(island.y-island.ry);y<island.y+island.ry;y++) for(let x=Math.floor(island.x-island.rx);x<island.x+island.rx;x++)
  if(siteContains([island],x,y,.9)&&!siteReliefContains([island],x,y)) fringe++;
assert.ok(fringe>20,'Irregular island clearing must release unused fringe for relief');
console.log('Island clearing: building/court protection with usable irregular relief fringe.');

for(const site of sites) {
  for(const b of site.buildings) {
    assert.ok(siteReliefContains([site],b.x,b.y),'All biome buildings remain protected');
    assert.ok(settlementGroundWeight(site,b.x,b.y)>.9,'Worked ground follows each building plot');
  }
  const mid={x:(site.entrance.x+site.apron.x)/2,y:(site.entrance.y+site.apron.y)/2};
  assert.ok(siteReliefContains([site],mid.x,mid.y),'Approach corridor stays clear of scenery');
  assert.ok(settlementGroundWeight(site,mid.x,mid.y)>.5,'Worked ground connects the entrance apron');
  assert.equal(settlementGroundWeight(site,site.x+site.rx*4,site.y),0,'Clearing must not tint the surrounding biome');
}
const colours=new Uint32Array(width*height).fill(0x667744),originalColours=colours.slice();
paintSettlementSites(sites,{width,height,colours,waterIndices,regionIds,map,detail:2,
  surfaces:{ground:()=>0x667744},mixColour:(a,b,t)=>t>0?b:a,dot:()=>{}});
for(let i=0;i<waterIndices.length;i++) if(waterIndices[i]) assert.equal(colours[i],originalColours[i],'Worked ground must never paint over water');
console.log('Integrated clearings: plot-shaped ground, protected approaches, finite feathering and untouched water across all five biomes.');

const woodlandLayouts=new Set();
for(let seed=1860;seed<1880;seed++) {
  const copy=structuredClone(sites);
  layOutSettlements(copy,{detail:2,dry,world:args.world,seed});
  const f=copy.find(s=>s.biome==='forest');woodlandLayouts.add(f.surroundings.layout);
  assert.equal(f.surroundings.glades.length,2,'Woodland ground needs local glades');
  for(const b of f.buildings)assert.ok(siteReliefContains([f],b.x,b.y),'Every varied forest layout must protect roofs');
  const duplicate=structuredClone(sites);layOutSettlements(duplicate,{detail:2,dry,world:args.world,seed});
  assert.deepEqual(f,duplicate.find(s=>s.biome==='forest'),'Woodland forms remain deterministic');
}
assert.equal(woodlandLayouts.size,3,'Seeds should exercise all three woodland clearing forms');
console.log('Forest integration: three deterministic clearing forms, plot protection and shared glade ground pass.');
