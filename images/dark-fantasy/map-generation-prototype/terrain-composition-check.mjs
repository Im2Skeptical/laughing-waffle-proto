import assert from 'node:assert/strict';
import { composeTerrainLandscape, illustrationOverlap, CONTACT_PAIRS, monsterPerimeterPaths, boneRidgeFits } from './terrain-composition.js';
import { gradeTerrainColour } from './composable-art.js';
import { generateMap } from './generator.js';

const art = {};
for (const family of ['plains', 'forest', 'islands', 'swamp', 'mountains'].map(b => `terrain-${b}`)
  .concat(['terrain-island-basalt', 'terrain-island-caldera','terrain-hellscape','terrain-bone-border'])
  .concat(['plains','forest','islands','swamp','mountains'].map(b=>`terrain-monster-${b}`))
  .concat(CONTACT_PAIRS.map((_, n) => `contact-${n}`))) {
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
      assert.ok(illustrationOverlap(a.props[i], p, art) <= (a.props[i].canopyCore ? .82 : .58), 'Only closed-canopy cores may use deeper overlap');
      if (p.kind.replace(/-mirror$/, '') === a.props[i].kind.replace(/-mirror$/, ''))
        assert.ok(Math.hypot(p.left - a.props[i].left, p.top - a.props[i].top) >= (p.family === 'terrain-forest' ? 18 : 58), 'Mirroring must not bypass repetition spacing');
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
const pairedVergePaths=islandMap.edges.filter(edge=>edge.regions.length===2).map(edge=>edge.regions.map(id=>islandMap.regions.find(r=>r.id===id).biome))
  .filter(pair=>pair[0]!==pair[1] && !pair.includes('monster') && pair.some(b=>['plains','forest'].includes(b))).length;
assert.equal(islandComposition.diagnostics.paths + islandComposition.diagnostics.coastalProfiles, borderPaths + pairedVergePaths + islandMap.features.filter(f => f.type === 'ridge').length
  + islandMap.geography.coasts.length + islandMap.regions.filter(r => ['mountains','islands','plains','forest','monster'].includes(r.biome)).length
  + monsterPerimeterPaths(islandMap).length, 'Every island contour must receive a shore profile and every monster cell a full bone perimeter');
const channels = c => [c >> 16, c >> 8 & 255, c & 255];
const [pr,pg,pb]=channels(gradeTerrainColour(150,145,136,'plains'));
assert.ok(pr>pg+15 && pg>pb+25,'Plains earth must retain warm ochre rather than a neutral grey cast');
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
  if(biome==='forest') {
    assert.ok(result.diagnostics.forestCores>0,'Forest must include dense canopy cores');
    assert.ok(result.props.filter(p=>p.canopyCore).every(p=>[0,1,2,3].includes(Number(p.kind.replace(/-mirror$/,'').split('-').at(-1)))),'Dense cores must use closed canopy art');
  }
}
console.log('Plains/forest: connected structural masses and role-specific ground cover.');

for(const biome of ['plains','forest']) {
  for(let n=0;n<12;n++) for(const suffix of ['compact','small']) {
    const glyph=art[`terrain-${biome}-${n}`];
    art[`terrain-${biome}-${n}-${suffix}`]=glyph;
    art[`terrain-${biome}-${n}-${suffix}-mirror`]=glyph;
  }
  const fixture={...islandFixture,regions:islandFixture.regions.map(r=>({...r,biome}))};
  const site={regionId:1,biome,x:120,y:75,rx:23,ry:16,entrance:{x:143,y:75},surroundings:{approachAngle:0}};
  const args={map:fixture,art,pixel:p=>p,world:(x,y)=>({x,y}),detail:1,settlementPlans:[site],
    legal:p=>p.left>0&&p.top>0&&p.left+art[p.kind].rows[0].length<240&&p.top+art[p.kind].rows.length<150};
  const result=composeTerrainLandscape(args),edges=result.props.filter(p=>p.context==='settlement-edge');
  assert.ok(edges.length>=3,'Settlement must receive deliberately composed edge assets');
  assert.ok(edges.every(p=>p.siteRegion===1&&p.family===`terrain-${biome}`),'Town edge art must use its own biome');
  assert.ok(result.props.slice(0,edges.length).every(p=>p.context==='settlement-edge'),'Settlement edges must reserve placement before general scatter');
}
console.log('Settlement surroundings: deliberate biome-specific edge art receives placement priority.');

for(const pair of CONTACT_PAIRS.filter(pair=>pair.some(b=>['plains','forest'].includes(b)))) {
  const regions=pair.map((biome,i)=>({id:i,biome,centre:{x:60+i*120,y:75},
    outline:[{x:i*120,y:0},{x:(i+1)*120,y:0},{x:(i+1)*120,y:150},{x:i*120,y:150}]}));
  const fixture={seed:1862,regions,features:[],geography:{coasts:[]},
    edges:[{id:1,regions:[0,1],points:[{x:120,y:10},{x:120,y:140}]}]};
  const result=composeTerrainLandscape({map:fixture,art,pixel:p=>p,world:(x,y)=>({x,y}),detail:1,legal:()=>true});
  assert.ok(!result.props.some(p=>p.family.startsWith('contact-')),'Updated biomes must never load old mixed boundary paintings');
  for(const biome of pair.filter(b=>b!=='mountains')) {
    const family=biome==='islands'?'terrain-island-basalt':`terrain-${biome}`;
    assert.ok(result.props.some(p=>p.context==='boundary' && p.family===family && p.allowedBiomes.length===1),`${pair}: each verge uses current art restricted to its own biome`);
  }
}
console.log('Boundary integration: all seven plains/forest pairings use current biome verges, retaining mountain divides.');

for(const biome of ['plains','forest','islands','swamp','mountains']) {
  const fixture={...islandFixture,regions:islandFixture.regions.map(r=>({...r,biome:'monster',terrainBiome:biome}))};
  const args={map:fixture,art,pixel:p=>p,world:(x,y)=>({x,y}),detail:1,monsterZones:true,
    legal:p=>p.left>0&&p.top>0&&p.left+art[p.kind].rows[0].length<240&&p.top+art[p.kind].rows.length<150};
  const result=composeTerrainLandscape(args), monsters=result.props.filter(p=>p.monster);
  assert.deepEqual(result,composeTerrainLandscape(args),'Monster territories must be stable for a world seed');
  assert.ok(monsters.length>=4 && result.diagnostics.monsterZones.length===1,`${biome}: multiple dens and pits must form a territory`);
  assert.ok(monsters.every(p=>p.family===`terrain-monster-${biome}`&&p.allowedBiomes[0]==='monster'&&args.legal(p)),'Monster silhouettes must fit dedicated monster territory');
  const landscape=result.props.filter(p=>['terrain-hellscape','terrain-bone-border'].includes(p.family));
  assert.ok(landscape.length>0,'Monster regions need terrain masses beyond scattered den symbols');
  assert.ok(landscape.every(p=>p.allowedBiomes.length===1&&p.allowedBiomes[0]==='monster'),'Hellscape must remain inside monster territory');
  assert.ok(result.diagnostics.monsterBorders[0]?.placed>=6,'Bone spikes must follow the outer perimeter even when there are no shared graph edges');
  assert.ok(result.props.filter(p=>p.context==='bone-boundary').every(p=>p.family==='terrain-bone-border'),'Border formations must use bone spine assets');
  assert.ok(new Set(result.props.filter(p=>p.context==='bone-boundary').map(p=>p.kind.replace(/-mirror$/,'').replace(/-(ridge|compact|small|micro)$/,''))).size>=5,'Monster rims must mix multiple distinct source silhouettes');
  const ordinary={...fixture,regions:fixture.regions.map(r=>({...r,biome}))};
  assert.equal(composeTerrainLandscape({...args,map:ordinary}).props.filter(p=>p.monster).length,0,'Ordinary biomes must never receive monster dens or pits');
  for(const m of monsters) for(const other of result.props.filter(p=>p!==m))
    assert.ok(illustrationOverlap(m,other,art)<=.12,'Scenery must not bury dens or pits');
  assert.equal(composeTerrainLandscape({...args,monsterZones:false}).props.filter(p=>p.monster).length,0,'Turning sites off must remove monster content');
  assert.equal(composeTerrainLandscape({...args,legal:()=>false}).props.filter(p=>p.monster).length,0,'Unsafe footprints must be omitted whole');
  const blockedPit=composeTerrainLandscape({...args,legal:p=>args.legal(p)&&!(p.family.startsWith('terrain-monster-')&&/-2(-mirror)?$/.test(p.kind))});
  assert.ok(blockedPit.props.some(p=>p.monster&&p.monsterRole>=3),'An unplaceable large pit must not starve later small pieces');
}
console.log('Monster territories: biome-specific scattered dens/pits, deterministic placement, protected silhouettes and sites-off pass.');

for(let seed=1860;seed<1880;seed++) {
  const map=generateMap({seed,clustering:.05,sizeVariation:.85,roughness:1,featureSet:0});
  assert.equal(map.regions.length,20);
  assert.equal(map.quota.monster,2);
  assert.equal(map.regions.filter(r=>r.biome==='monster').length,2);
  assert.equal(Object.values(map.quota).reduce((a,b)=>a+b,0),20);
  assert.ok(Object.values(map.quota).every(n=>n>0),'All six biomes must remain represented');
  for(const [biome,n] of Object.entries(map.quota)) assert.equal(map.regions.filter(r=>r.biome===biome).length,n);
  assert.ok(Math.abs(Object.values(map.biomeAreas).reduce((a,b)=>a+b,0)-1)<1e-9,'Monster area must be counted exactly once');
}
console.log('Monster biome: two whole regions, six represented biomes, 20 cells, exact quotas and area accounting.');

for(const n of Array.from({length:12},(_,n)=>n))for(const mirror of ['', '-mirror']) {
  const glyph=art[`terrain-bone-border-${n}${mirror}`],factor=.3;
  const w=Math.round(glyph.rows[0].length*factor),h=Math.round(glyph.rows.length*factor);
  art[`terrain-bone-border-${n}-micro${mirror}`]={rows:Array.from({length:h},(_,y)=>Array.from({length:w},(_,x)=>
    glyph.rows[Math.floor(y/factor)][Math.floor(x/factor)]).join(''))};
}
const tightMonster={...islandFixture,regions:islandFixture.regions.map(r=>({...r,biome:'monster',terrainBiome:'mountains'}))};
const tightBorders=composeTerrainLandscape({map:tightMonster,art,pixel:p=>p,world:(x,y)=>({x,y}),detail:1,
  legal:p=>art[p.kind].rows[0].length<=9 && p.left>0 && p.top>0});
assert.ok(tightBorders.props.some(p=>p.context==='bone-boundary'&&p.kind.includes('-micro')),'Narrow monster borders must retain micro spikes when larger formations cannot fit');
console.log('Monster perimeters: whole bone formations, outer-edge coverage and micro-size fallback pass.');

const combined={regions:[{id:'a',biome:'monster'},{id:'b',biome:'monster'},{id:'c',biome:'forest'}],edges:[
  {id:'internal',regions:['a','b'],points:[{x:10,y:0},{x:10,y:20}]},
  {id:'exposed',regions:['b','c'],points:[{x:20,y:0},{x:20,y:20}]},
  {id:'coast',regions:['a'],points:[{x:0,y:0},{x:0,y:20}]}]};
assert.deepEqual(monsterPerimeterPaths(combined).map(p=>p.edgeId),['exposed','coast'],'Connected monster cells must share only their exposed outer ridge');
const bone={rows:Array(10).fill('xxxxxxxxxx')};
assert.ok(boneRidgeFits(bone,0,0,(x,y)=>({dry:true,biome:x<5?'monster':'forest'})),'Raised bones may cross a dry region boundary');
assert.ok(boneRidgeFits(bone,0,0,(x,y)=>({dry:y>=7,biome:'monster'})),'Grounded bones may project their tips over water');
assert.ok(!boneRidgeFits(bone,0,0,()=>({dry:false,biome:'monster'})),'Bone ridges cannot float without a grounded foot');
assert.ok(!boneRidgeFits(bone,0,0,()=>({dry:true,biome:'forest'})),'Bone ridges must remain attached to monster territory');
console.log('Combined monster silhouette: internal seams open, grounded projecting ridges and shoreline overhang pass.');
