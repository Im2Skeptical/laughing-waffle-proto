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
