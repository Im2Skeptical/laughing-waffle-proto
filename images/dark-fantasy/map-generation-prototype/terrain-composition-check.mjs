import assert from 'node:assert/strict';
import { composeTerrainLandscape, illustrationOverlap, CONTACT_PAIRS } from './terrain-composition.js';
import { gradeTerrainColour } from './composable-art.js';
import { generateMap } from './generator.js';

const art = {};
for (const family of ['plains', 'forest', 'islands', 'swamp', 'mountains'].map(b => `terrain-${b}`)
  .concat(['terrain-island-basalt', 'terrain-island-caldera']).concat(CONTACT_PAIRS.map((_, n) => `contact-${n}`))) {
  for (let n = 0; n < (family.startsWith('contact') ? 5 : 12); n++) {
    const width = 18 + n % 4 * 3, height = 14 + n % 3 * 2;
    const rows = Array.from({ length: height }, (_, y) => Array.from({ length: width }, (_, x) =>
      ((x - width / 2) / (width / 2)) ** 2 + ((y - height / 2) / (height / 2)) ** 2 < .9 ? 'x' : '.').join(''));
    art[`${family}-${n}`] = { rows };
    art[`${family}-${n}-mirror`] = { rows: rows.map(row => [...row].reverse().join('')) };
  }
}
// The loader marks source fragments that overlap their neighbours. Neither
// their original nor their mirrored variant may reach the composition.
art['terrain-forest-0'].cutRuns = { right: 44 };
art['terrain-forest-0-mirror'].cutRuns = { left: 44 };
// Bounding boxes overlap, but their painted parts do not: this was not checked
// by the former semantic-port solver.
const disconnected = { a: { rows: ['xx......', 'xx......'] }, b: { rows: ['......xx', '......xx'] } };
assert.equal(illustrationOverlap({ kind: 'a', left: 0, top: 0 }, { kind: 'b', left: 0, top: 0 }, disconnected), 0);
assert.equal(illustrationOverlap({ kind: 'a', left: 0, top: 0 }, { kind: 'a', left: 0, top: 0 }, disconnected), 1);

for (const seed of [1867, 1869, 1873]) {
  const outline = [{ x: 0, y: 0 }, { x: 240, y: 0 }, { x: 240, y: 150 }, { x: 0, y: 150 }];
  const map = { seed, regions: [{ id: 1, biome: 'forest', centre: { x: 120, y: 75 }, outline }],
    edges: [], features: [{ type: 'ridge', points: [{ x: 20, y: 70 }, { x: 100, y: 60 }, { x: 220, y: 95 }] }], geography: { coasts: [] } };
  const legal = p => p.left > 0 && p.top > 0 && p.left + art[p.kind].rows[0].length < 240 && p.top + art[p.kind].rows.length < 150;
  const args = { map, art, pixel: p => p, world: (x, y) => ({ x, y }), legal, detail: 1 };
  const a = composeTerrainLandscape(args), b = composeTerrainLandscape(args);
  assert.deepEqual(a, b, 'World seed must reproduce the composition');
  assert.ok(a.props.length > 20 && a.diagnostics.joined > 0, 'Fixture must exercise interior growth and actual joins');
  for (let i = 0; i < a.props.length; i++) {
    assert.ok(legal(a.props[i]), 'Every footprint must satisfy the supplied geographic mask');
    assert.equal(Object.keys(art[a.props[i].kind].cutRuns ?? {}).length, 0, 'Source fragments with clipped edges must never be placed');
    for (const p of a.props.slice(0, i)) {
      assert.ok(illustrationOverlap(a.props[i], p, art) <= .58, 'No painting may bury most of another painting');
      if (p.kind.replace(/-mirror$/, '') === a.props[i].kind.replace(/-mirror$/, ''))
        assert.ok(Math.hypot(p.left - a.props[i].left, p.top - a.props[i].top) >= 58, 'Mirroring must not bypass repetition spacing');
    }
  }
}
const leaves = gradeTerrainColour(70, 86, 38, 'forest'), stone = gradeTerrainColour(137, 130, 122, 'forest');
const islandMap = generateMap({ seed: 1872, clustering: .05, sizeVariation: .85, roughness: 1, featureSet: 0 });
assert.ok(islandMap.geography.coasts.some(coast => coast.edgeId === null), 'Fixture must include independent island contours');
const pixel = p => ({ x: p.x * 788, y: p.y * 258 });
const islandComposition = composeTerrainLandscape({ map: islandMap, art, pixel,
  world: (x, y) => ({ x: x / 788, y: y / 258 }), legal: () => false, detail: 1 });
const borderPaths = islandMap.edges.filter(edge => edge.regions.length === 2
  && islandMap.regions.find(r => r.id === edge.regions[0]).biome !== islandMap.regions.find(r => r.id === edge.regions[1]).biome).length;
assert.equal(islandComposition.diagnostics.paths + islandComposition.diagnostics.coastalProfiles, borderPaths + islandMap.features.filter(f => f.type === 'ridge').length
  + islandMap.geography.coasts.length + islandMap.regions.filter(r => ['mountains','islands','plains','forest'].includes(r.biome)).length, 'Every island contour must receive a shore profile even without a graph edge ID');
const channels = c => [c >> 16, c >> 8 & 255, c & 255];
const [lr, lg, lb] = channels(leaves), [sr, sg, sb] = channels(stone);
assert.ok(lg > lr && lg > lb * 1.7, 'Leaf hue must survive grading');
assert.ok(Math.max(sr, sg, sb) - Math.min(sr, sg, sb) < 25, 'Stone must remain neutral inside a forest');
console.log('Terrain composition: real silhouette joins, legal footprints, nonrepeating neighbours, deterministic seeds and material colours pass.');

const islandFixture={seed:1873,regions:[{id:1,biome:'islands',centre:{x:120,y:75},outline:[{x:0,y:0},{x:240,y:0},{x:240,y:150},{x:0,y:150}]}],edges:[],features:[],geography:{coasts:[]}};
for (const islandStyle of ['basalt', 'caldera']) {
  const args={map:islandFixture,art,pixel:p=>p,world:(x,y)=>({x,y}),detail:1,islandStyle,
    legal:p=>p.left>0&&p.top>0&&p.left+art[p.kind].rows[0].length<240&&p.top+art[p.kind].rows.length<150};
  const result=composeTerrainLandscape(args);
  assert.deepEqual(result,composeTerrainLandscape(args),'Both treatments must remain deterministic');
  assert.equal(result.diagnostics.islandCraters,1,'One principal crater per connected group');
  assert.ok(result.props.some(p=>p.context==='island-belt'),'Flanks must form a structural belt');
  assert.ok(result.diagnostics.joined>0,'Volcanic belts must join actual silhouettes');
  assert.ok(result.props.every(p=>p.family===`terrain-island-${islandStyle}`),'No legacy dune or cliff scatter');
  assert.ok(result.props.filter(p=>p.context==='interior').every(p=>Number(p.kind.replace(/-mirror$/,'').split('-').at(-1))>=8),'Crater art must never enter interior scatter');
}
console.log('Island composition: two deterministic volcanic kits, one crater per group, connected flanks and separate undergrowth.');

// Narrow usable land must fall back to compact silhouettes rather than go bare.
for (const [kind,glyph] of Object.entries({...art})) if(kind.startsWith('terrain-island-')) {
  for(const [suffix,factor] of [['compact',.72],['small',.5]]) {
    const w=Math.max(1,Math.round(glyph.rows[0].length*factor)),h=Math.max(1,Math.round(glyph.rows.length*factor));
    const key=kind.replace(/-mirror$/,'')+'-'+suffix+(kind.endsWith('-mirror')?'-mirror':'');
    art[key]={rows:Array.from({length:h},(_,y)=>Array.from({length:w},(_,x)=>glyph.rows[Math.min(glyph.rows.length-1,Math.floor(y/factor))][Math.min(glyph.rows[0].length-1,Math.floor(x/factor))]).join(''))};
  }
}
const narrow=composeTerrainLandscape({map:islandFixture,art,pixel:p=>p,world:(x,y)=>({x,y}),detail:1,
  legal:p=>art[p.kind].rows[0].length<=14 && p.left>0 && p.top>0});
assert.ok(narrow.props.length>0 && narrow.diagnostics.islandCraters===1,'Restricted footprint must retain a smaller crater and relief');
assert.ok(narrow.props.every(p=>art[p.kind].rows[0].length<=14),'Fallback must still obey the full footprint constraint');
const dark=channels(gradeTerrainColour(25,28,23,'island-basalt'));
const light=channels(gradeTerrainColour(210,212,200,'island-basalt'));
assert.ok(light[0]-dark[0]<145 && dark[0]>45,'Basalt should have lifted shadows and compressed highlights');

for(const biome of ['plains','forest']) {
  const fixture={...islandFixture,regions:islandFixture.regions.map(r=>({...r,biome}))};
  const result=composeTerrainLandscape({map:fixture,art,pixel:p=>p,world:(x,y)=>({x,y}),detail:1,legal:p=>p.left>0&&p.top>0});
  assert.ok(result.props.some(p=>p.context==='landscape-spine'),'Plains/forest need connected structural masses');
  if(biome==='plains') assert.ok(result.props.filter(p=>p.context==='interior').every(p=>Number(p.kind.replace(/-mirror$/,'').split('-').at(-1))>=8),'Plains scatter must use small ground cover, not large ridges');
}
console.log('Plains/forest: connected structural masses and role-specific ground cover.');
