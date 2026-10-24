// Disposable, deterministic opening recipe; never alters the regular game.
import { createNewGameState } from './new-game.js';
import { createDetailedPracticeSlot } from './detailed-practice-tiers.js';
import { getDetailedSettlementSites } from './detailed-settlements/queries.js';
import { adjacentRegionIds } from './detailed-settlements/external-world.js';
import { canonicalKeywordPrototype } from './keywords-classes-prototype.js';

export function createKeywordPrototypeState(mode='lenses', classId='scholar', {inherited=true}={}) {
  const state=createNewGameState(1867);
  state.gameConfig.keywordPrototype=canonicalKeywordPrototype({mode,classId,taught:mode==='teachings'&&inherited?['economicRegions']:[]});
  const sites=getDetailedSettlementSites(state,{playerOnly:true});
  for(const site of sites) {
    // Five real slots; food, economic engine, trophy reader, hunters, supplies.
    site.detailedState.practiceSlots=['forage','barter','observation','monsterHunting','weaponsmithing'].map(id=>createDetailedPracticeSlot(id,'silver'));
    site.detailedState.practiceSlots[0].stock=8;
    site.detailedState.practiceSlots[4].stock=8;
  }
  // An immediately huntable real Monster; Death consumes real Arms and Food.
  const target=sites.flatMap(site=>adjacentRegionIds(state,site.regionId)).map(id=>state.world.regions.find(r=>r.id===id)).find(r=>r.controller==='frontier');
  for(const region of state.world.regions)delete region.monster;
  if(target)target.monster={defense:0};
  state.civilization.chaos.monsterCount=target?1:0;
  return state;
}
