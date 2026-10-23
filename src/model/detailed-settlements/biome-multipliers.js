import { BIOME_MULTIPLIER_RULES } from '../../defs/world/biome-multiplier-rules.js';
import { getWorldDefinition, getAdjacentRegionIds } from '../world-state.js';

// Immutable map geometry only, like world-state's adjacency cache. Ownership,
// roads, construction and live boards never enter this derived cache or saves.
const patchesByDefinition = new WeakMap();
export function contiguousBiomeRegions(state, regionId) {
  const definition=getWorldDefinition(state);
  if(!definition)return [];
  let patches=patchesByDefinition.get(definition);
  if(!patches) {
    patches=new Map();
    const regions=new Map(definition.regions.map(region=>[region.id,region]));
    for(const region of definition.regions) {
      if(patches.has(region.id))continue;
      const ids=[],queue=[region.id],seen=new Set(queue);
      for(let cursor=0;cursor<queue.length;cursor++) {
        const id=queue[cursor];ids.push(id);
        for(const neighbour of getAdjacentRegionIds(state,id)) {
          if(!seen.has(neighbour)&&regions.get(neighbour)?.biome===region.biome){seen.add(neighbour);queue.push(neighbour);}
        }
      }
      const patch=Object.freeze(ids);
      for(const id of ids)patches.set(id,patch);
    }
    patchesByDefinition.set(definition,patches);
  }
  return patches.get(regionId)??[];
}

export function biomeMultiplierModifiers(state, settlement) {
  const regionId=state?.world?.sites.find(site=>site.detailedState===settlement)?.regionId;
  const region=getWorldDefinition(state)?.regions.find(region=>region.id===regionId);
  if(!region)return [];
  return BIOME_MULTIPLIER_RULES.filter(rule=>rule.biome===region.biome).map(rule=>{
    const regionIds=contiguousBiomeRegions(state,regionId);
    return {kind:rule.kind,query:rule.query,amount:rule.amountPerRegion*regionIds.length,
      sourceId:`biome:${rule.biome}`,sourceLabel:`${regionIds.length} contiguous ${rule.biome}`,regionIds};
  });
}
