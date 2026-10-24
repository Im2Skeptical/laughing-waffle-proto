// Disposable, deterministic opening recipe; never alters the regular game.
import { createNewGameState } from './new-game.js';
import { createDetailedPracticeSlot } from './detailed-practice-tiers.js';
import { getDetailedSettlementSites } from './detailed-settlements/queries.js';
import { adjacentRegionIds } from './detailed-settlements/external-world.js';
import { canonicalKeywordPrototype } from './keywords-classes-prototype.js';
import { trainSpecialists, stockCapacity } from './detailed-settlements/stock.js';

export function createKeywordPrototypeState(mode='disciplines', classId='scholar', {inherited=true,synthesisSupply='ready',cards='classic'}={}) {
  const state=createNewGameState(1867);
  state.gameConfig.keywordPrototype=canonicalKeywordPrototype({mode,classId,taught:mode==='teachings'&&inherited?['economicRegions']:[]});
  const sites=getDetailedSettlementSites(state,{playerOnly:true});
  for(const site of sites) {
    // Five real slots; food, economic engine, trophy reader, hunters, supplies.
    site.detailedState.practiceSlots=['forage','barter','observation','monsterHunting','weaponsmithing'].map(id=>createDetailedPracticeSlot(id,'silver'));
    site.detailedState.practiceSlots[0].stock=8;
    site.detailedState.practiceSlots[4].stock=8;
    if(mode==='disciplines'&&classId==='scholar') {
      site.detailedState.practiceSlots=['irrigating','copyingTexts','scholarship','papermaking','logging'].map(id=>createDetailedPracticeSlot(id,'silver'));
      site.detailedState.practiceSlots[0].stock=synthesisSupply==='blocked'?0:8;
      site.detailedState.practiceSlots[1].stock=4;
      site.detailedState.practiceSlots[4].stock=6;
      if(cards!=='bronze')trainSpecialists(site.detailedState,'scholar',4);
    }
  }
  // An immediately huntable real Monster; Death consumes real Arms and Food.
  const target=sites.flatMap(site=>adjacentRegionIds(state,site.regionId)).map(id=>state.world.regions.find(r=>r.id===id)).find(r=>r.controller==='frontier');
  for(const region of state.world.regions)delete region.monster;
  if(target)target.monster={defense:0};
  state.civilization.chaos.monsterCount=target?1:0;
  if(cards==='bronze'&&mode==='disciplines'&&['scholar','warrior'].includes(classId)) {
    const install=(site,ids,stocks)=>{
      site.detailedState.practiceSlots=ids.map((id,i)=>({...createDetailedPracticeSlot(id,'bronze'),stock:stocks[i]??0}));
    };
    if(classId==='scholar') {
      install(sites[0],['floodAlmanacs','marginalia','measuredRations','patternCarving','irrigating'],[4,0,0,0,8]);
      install(sites[1],['dryFarming','logging','forage','recordKeeping','scholarship'],[8,8,8,4,0]);
      if(synthesisSupply==='blocked') {
        sites[0].detailedState.practiceSlots[4].stock=0;
        sites[1].detailedState.practiceSlots[0].stock=0;
        sites[1].detailedState.practiceSlots[1].stock=0;
      }
      trainSpecialists(sites[0].detailedState,'scholar',4);
      trainSpecialists(sites[1].detailedState,'scholar',1);
    } else {
      install(sites[0],['beastRendering','scarredShields','trailProvisioning','trophyRubbings','logging'],[0,0,0,0,8]);
      // Silver hunter is a temporary automatic kill source for this viewing fixture.
      // Bronze Campaign can also earn the same real monsterDestroyed event.
      install(sites[1],['forage','fletching','huntingParties','monsterHunting','recordKeeping'],[8,6,4,0,0]);
      sites[1].detailedState.practiceSlots[3].tier='silver';
      trainSpecialists(sites[0].detailedState,'warrior',4);
    }
    // Seed legal hosted Stock; demonstration supplies obey ordinary capacities.
    for(const site of sites)for(const slot of site.detailedState.practiceSlots)
      slot.stock=Math.min(slot.stock,stockCapacity(state,site.detailedState,slot));
  }
  return state;
}
