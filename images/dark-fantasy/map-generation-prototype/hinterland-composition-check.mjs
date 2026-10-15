import assert from 'node:assert/strict';
import { composeHinterland, hinterlandBorderEdges } from './hinterland-composition.js';
import { generateMap } from './generator.js';

const art={};
for(const family of ['mountains','ridge-border','forest','swamp','plains'])for(let n=0;n<12;n++)for(const suffix of ['', '-mirror'])
  art[`terrain-hinterland-${family}-${n}${suffix}`]={rows:Array.from({length:14+n%3},()=> 'x'.repeat(24+n%4*3))};
const pixel=p=>({x:p.x*394,y:p.y*129}),world=(x,y)=>({x:x/394,y:y/129});
for(const seed of [1865,1867,1873]) {
  const map=generateMap({seed,clustering:.05,sizeVariation:.85,roughness:1,featureSet:0});
  const edges=hinterlandBorderEdges(map);
  assert.ok(edges.length>0);
  assert.ok(edges.every(e=>e.regions.length===1&&!map.world.oceanSides.includes(e.worldSide)),'Barriers belong to outer landward edges only');
  const args={map,art,pixel,world,detail:1,legal:()=>true,sampleBackground:(_p,f)=>{f.set([0,.7,.1,.1]);}};
  const result=composeHinterland(args);
  assert.deepEqual(result,composeHinterland(args),'Hinterland must be fixed for a world seed');
  assert.equal(result.stats.borders.length,edges.length);
  assert.ok(result.stats.borders.filter(e=>e.placed>0).length>=edges.length*.75,'Mountain chains must cover landward edges, allowing short shared junctions');
  assert.ok(result.stats.kinds>=8,'Hinterland must draw from varied imported terrain');
  assert.ok(result.props.every(p=>p.kind.startsWith('terrain-hinterland-')&&p.composed&&p.background),'No legacy stamp may remain');
  assert.equal(composeHinterland({...args,legal:()=>false}).props.length,0,'Never force scenery onto unsafe terrain');
}
console.log('Hinterland: imported terrain variety, seeded mountain chains on landward outer borders, open ocean arcs and unsafe-footprint rejection pass.');
