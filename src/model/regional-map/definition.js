import { generateMap, decorationRandom } from './generator.js';

const cache=new Map();
export const regionalMapId=seed=>`regional-v1:${Number(seed)>>>0}`;
export function regionalMapSeed(id) {
  const match=/^regional-v1:(\d+)$/.exec(id ?? '');
  return match && Number(match[1])<=4294967295 ? Number(match[1]) : null;
}
export function getRegionalMap(id) {
  const seed=regionalMapSeed(id);if(seed===null)return null;
  if(!cache.has(id)) {
    const map=generateMap({seed,clustering:.5,sizeVariation:.85,roughness:1,featureSet:0});
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
  const regions=map.regions.map((r,i)=>({
    id:r.id,name:`${r.biome[0].toUpperCase()+r.biome.slice(1)} ${i+1}`,biome:r.biome,
    polygonVertexIds:r.outline.map(p=>{const id=key(p);vertices.set(id,{id,x:p.x,y:p.y});return id;}),
    display:{labelPoint:{...r.centre},sitePoint:{...r.centre}},
    initialState:{colour:({plains:'red',forest:'green',islands:'blue',swamp:'black',mountains:'black',monster:'red'})[r.biome],
      structureCapacity:5,randomizeStructureCapacity:true,controller:starters.has(r.id)?'player':'frontier',detailedSettlementEnabled:starters.has(r.id)},
  }));
  return {id,name:`Regional world · ${map.seed}`,geometry:{vertices:[...vertices.values()]},regions,connections,sites:[],
    mapContext:{coastlineVertexIds:regions[0].polygonVertexIds,oceanBoundaryPoints:[]}};
}
