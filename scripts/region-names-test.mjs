import assert from 'node:assert/strict';
import { getRegionReference } from '../src/model/world-state.js';
import { compactRegionName } from '../src/views/region-label.js';
import { generateRegionNames } from '../src/model/regional-map/names.js';
import { getRegionalMap, regionalMapId } from '../src/model/regional-map/definition.js';
import { createNewGameState } from '../src/model/new-game.js';
import { serializeGameState, deserializeGameState } from '../src/model/state.js';
import { createTimelineFromInitialState, rebuildStateAtSecond } from '../src/model/timeline/index.js';
for (const seed of [0, 1, 42, 1867, 4294967295]) {
  const current = getRegionalMap(regionalMapId(seed));
  const old = getRegionalMap(regionalMapId(seed, 1));
  assert.deepEqual(current.map, old.map, 'naming leaves geography unchanged');
  assert.deepEqual(current.definition.connections, old.definition.connections);
  const names = current.definition.regions.map(r => r.name);
  assert.equal(new Set(names).size, names.length);
  assert.deepEqual(names, generateRegionNames(seed, current.map.regions));
  const state = createNewGameState(seed);
  for (const region of current.definition.regions) {
    assert.equal(getRegionReference(state,region.id), region.name);
    assert.ok(!/^R[0-9]+$/.test(getRegionReference(state,region.id)));
  }
  const saved = serializeGameState(state);
  assert.deepEqual(serializeGameState(deserializeGameState(saved)), saved);
  const replay = rebuildStateAtSecond(createTimelineFromInitialState(state), 0);
  assert.equal(replay.ok, true);
  assert.deepEqual(replay.state.world.sites.map(s => s.name), state.world.sites.map(s => s.name));
  assert.equal(new Set(state.world.sites.map(s => getRegionReference(state,s.regionId))).size, state.world.sites.length);
}
// Connected terrain shares a base even across compass sectors. Disconnected
// terrain must remain distinguishable, and labels must not depend on input order.
const regions = [
  { id: 'a', biome: 'forest', centre: { x: .5, y: .1 }, neighbours: ['b'] },
  { id: 'b', biome: 'forest', centre: { x: .51, y: .2 }, neighbours: ['a', 'c'] },
  { id: 'c', biome: 'monster', terrainBiome: 'forest', centre: { x: .9, y: .5 }, neighbours: ['b', 'd'] },
  { id: 'd', biome: 'swamp', centre: { x: .5, y: .9 }, neighbours: ['c'] },
  { id: 'e', biome: 'forest', centre: { x: .1, y: .5 }, neighbours: [] },
  { id: 'f', biome: 'plains', centre: { x: .5, y: .5 }, neighbours: [] },
];
const names = generateRegionNames(42, regions);
assert.equal(new Set(names.slice(0,3).map(name=>name.replace(/ [A-Z]+$/,''))).size,3,'a three-region patch uses three directions');
assert.ok(names.slice(0,3).every(name=>name.includes('Forest')));
assert.equal(names[3],'Southern Swamp');
assert.match(names[4],/^Western Forest/);
assert.equal(names[5],'Central Plains');
const patches = [
  {id:'west',biome:'swamp',centre:{x:.48,y:.1},neighbours:[]},
  {id:'east',biome:'swamp',centre:{x:.52,y:.1},neighbours:[]},
];
assert.deepEqual(generateRegionNames(42,patches), ['Northern Swamp A','Northern Swamp B']);
assert.deepEqual(generateRegionNames(42, [...regions].reverse()).reverse(), names);
assert.deepEqual(generateRegionNames(42, regions, { settlement: true }), names.map(n => `${n} Market`));
assert.deepEqual(names, generateRegionNames(43, regions), 'fixed geometry needs no cosmetic seed draws');
const crowded = Array.from({length: 20}, (_, i) => ({id: `r${i}`, biome: 'forest', centre: {x: .5, y: .1 + i / 1000}, neighbours: i ? [`r${i - 1}`, `r${i + 1}`] : ['r1']}));
const crowdedNames = generateRegionNames(42, crowded);
assert.equal(new Set(crowdedNames).size, 20, 'same-sector regions are unique');
assert.equal(new Set(crowdedNames.map(n=>n.replace(/ [A-Z]+$/,''))).size,9,'large patch uses every available direction before letters');
// Reproduce a compact western mountain mass and a southern plains strip.
const mountainPoints=[[.08,.18],[.16,.16],[.25,.17],[.34,.2],[.1,.39],[.26,.4]];
const plainPoints=[[.42,.58],[.65,.53],[.78,.68],[.9,.79]];
const patch=(points,biome)=>points.map(([x,y],index)=>({id:`${biome}-${index}`,biome,centre:{x,y},neighbours:points.map((_,i)=>`${biome}-${i}`).filter(id=>id!==`${biome}-${index}`)}));
for (const [points,biome] of [[mountainPoints,'mountains'],[plainPoints,'plains']]) {
  const local=patch(points,biome), labels=generateRegionNames(42,local);
  assert.equal(new Set(labels).size,points.length);
  assert.ok(labels.every(name=>!/[A-Z]$/.test(name)),`${biome}: distinct directions avoid letter suffixes`);
  assert.ok(labels.some(name=>/Eastern|Northeastern|Southeastern/.test(name)),`${biome}: local east is available despite the world position`);
  assert.ok(labels.some(name=>/Western|Northwestern|Southwestern/.test(name)));
}
const ring=patch(Array.from({length:9},(_,i)=>[.2+.1*Math.cos(i*Math.PI*2/9),.5+.1*Math.sin(i*Math.PI*2/9)]),'forest');
assert.ok(generateRegionNames(42,ring).every(name=>!name.startsWith('Central')),'edge-only ring does not invent a central region');
for (let seed=0;seed<64;seed++) {
  const map=getRegionalMap(regionalMapId(seed)).map, labels=generateRegionNames(seed,map.regions);
  assert.equal(new Set(labels).size,map.regions.length,`seed ${seed}: all names unique`);
  assert.ok(labels.every(name=>/^(Northern|Northeastern|Eastern|Southeastern|Southern|Southwestern|Western|Northwestern|Central) (Plains|Forest|Mountains|Swamp|Islands)( [A-Z]+)?$/.test(name)),`seed ${seed}: valid literal labels`);
  const byId=new Map(map.regions.map((region,index)=>[region.id,{region,label:labels[index]}])),seen=new Set();
  const biome=region=>region.biome==='monster'?region.terrainBiome:region.biome;
  for (const root of map.regions) {
    if (seen.has(root.id)) continue;
    const component=[root];seen.add(root.id);
    for (const region of component) for (const id of region.neighbours) {
      const next=byId.get(id)?.region;
      if (next&&!seen.has(id)&&biome(next)===biome(root)) {seen.add(id);component.push(next);}
    }
    const directions=new Set(component.map(region=>byId.get(region.id).label.split(' ')[0]));
    assert.ok(directions.size>=Math.min(component.length,8),`seed ${seed}, ${root.id}: use compass directions before suffixes`);
  }
  assert.deepEqual(generateRegionNames(seed,[...map.regions].reverse()).reverse(),labels,`seed ${seed}: order independent`);
}
console.log('[region-names] local direction diversity, global bias, Central eligibility, suffix fallback, 64 seeds, unchanged geometry and save/replay passed');

for (const [full, short] of [['North','N'],['South','S'],['East','E'],['West','W'],['Northeast','NE'],['Northwest','NW'],['Southeast','SE'],['Southwest','SW'],['Central','C']]) {
  assert.equal(compactRegionName(`${full} Briarwood Glade`), `${short} Briarwood Glade`);
}
assert.equal(compactRegionName('Northwatch Wood'), 'Northwatch Wood');
for (const [full,short] of [['Northern','N'],['Northeastern','NE'],['Northwestern','NW'],['Southern','S'],['Southeastern','SE'],['Southwestern','SW'],['Eastern','E'],['Western','W']]) {
  assert.equal(compactRegionName(`${full} Swamp - West`),`${short} Swamp - West`);
}
