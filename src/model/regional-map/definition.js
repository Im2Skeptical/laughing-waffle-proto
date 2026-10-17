import { generateMap, decorationRandom } from './generator.js';

const cache=new Map();
// The `v<N>` in `regional-v<N>:<seed>` is the generator revision. A saved id must
// keep producing the same polygons, so a change to generator.js that alters the
// geometry for any seed needs a NEW revision (and keeps the old generator for old
// saves), never an edit in place. scripts/regional-map-golden-test.mjs pins
// revision 1 and fails when its output moves.
const GENERATORS={
  1:seed=>generateMap({seed,clustering:.5,sizeVariation:.85,roughness:1,featureSet:0}),
};
export const CURRENT_GENERATOR_REVISION=1;
export const regionalMapId=(seed,revision=CURRENT_GENERATOR_REVISION)=>`regional-v${revision}:${Number(seed)>>>0}`;
function parseRegionalMapId(id) {
  const match=/^regional-v([1-9]\d*):(\d+)$/.exec(id ?? '');
  const revision=match?Number(match[1]):null;
  return match&&Object.hasOwn(GENERATORS,revision)&&Number(match[2])<=4294967295?{revision,seed:Number(match[2])}:null;
}
export function regionalMapSeed(id) {
  return parseRegionalMapId(id)?.seed??null;
}
export function getRegionalMap(id) {
  const parsed=parseRegionalMapId(id);if(!parsed)return null;
  if(!cache.has(id)) {
    const map=GENERATORS[parsed.revision](parsed.seed);
    cache.set(id,{map,definition:createDefinition(id,map)});
    if(cache.size>12)cache.delete(cache.keys().next().value);
  }
  return cache.get(id);
}
function createDefinition(id,map) {
  const vertices=new Map(),key=p=>`${Math.round(p.x*1e9)},${Math.round(p.y*1e9)}`;
  // The first region in definition order becomes the capital. It needs a
  // second neighbour for the guaranteed adjacent neutral market.
  const connections=map.edges.filter(e=>e.regions.length===2&&map.regions.find(r=>r.id===[...e.regions].sort()[0]).neighbours.length>1)
    .map((e,i)=>({e,rank:decorationRandom(map.seed,i+741)})).sort((a,b)=>a.rank-b.rank)
    .slice(0,9).map(({e})=>({regionAId:e.regions[0],regionBId:e.regions[1]}));
  const starters=new Set(Object.values(connections[0]));
  const regions=map.regions.map((r,i)=>{
    // The study's occupied examples retain natural terrain underneath. Live
    // occupation belongs to region.monster, not permanent biome metadata.
    const biome=r.biome==='monster'?r.terrainBiome:r.biome;
    return {
    id:r.id,name:`${biome[0].toUpperCase()+biome.slice(1)} ${i+1}`,biome,
    polygonVertexIds:r.outline.map(p=>{const id=key(p);vertices.set(id,{id,x:p.x,y:p.y});return id;}),
    display:{labelPoint:{...r.centre},sitePoint:{...r.centre}},
    initialState:{colour:({plains:'red',forest:'green',islands:'blue',swamp:'black',mountains:'black',monster:'red'})[r.biome],
      structureCapacity:5,randomizeStructureCapacity:true,controller:starters.has(r.id)?'player':'frontier',detailedSettlementEnabled:starters.has(r.id)},
  };});
  return {id,name:`Regional world · ${map.seed}`,geometry:{vertices:[...vertices.values()]},regions,connections,sites:[],
    mapContext:{coastlineVertexIds:regions[0].polygonVertexIds,oceanBoundaryPoints:[]}};
}
