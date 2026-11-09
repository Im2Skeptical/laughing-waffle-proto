// Initial cohorts for the Crown's loyal capital and occupied outer settlements.
// Core towns have developed food chains; outer profiles retain village budgets.
import {writePopulationBins} from './detailed-settlements/population-ledger.js';

const CROWN_OPENINGS=Object.freeze({
 capital:{population:120,loyal:108,warriors:12,loyalChildren:27},
 province:{population:60,loyal:48,warriors:5,loyalChildren:12},
 forager:{population:13,loyal:6,warriors:6,loyalChildren:0},
 timber:{population:15,loyal:7,warriors:7,loyalChildren:0},
 quarry:{population:15,loyal:7,warriors:7,loyalChildren:0},
 grain:{population:25,loyal:12,warriors:12,loyalChildren:0},
 market:{population:25,loyal:12,warriors:12,loyalChildren:0},
});

export function seedCrownOpeningPopulation(settlement,role){
 const opening=CROWN_OPENINGS[role];
 if(!opening)throw new Error(`Unknown Crown opening role: ${role}`);
 const {population,loyal,warriors,loyalChildren}=opening,children=Math.floor(population/4);
 writePopulationBins(settlement,[
  {classId:'villager',allegiance:'external-a',specialty:'ordinary',kind:'children',age:null,count:loyalChildren},
  {classId:'villager',allegiance:'neutral',specialty:'ordinary',kind:'children',age:null,count:children-loyalChildren},
  {classId:'villager',allegiance:'external-a',specialty:'warrior',kind:'adults',age:null,count:warriors},
  {classId:'villager',allegiance:'external-a',specialty:'ordinary',kind:'adults',age:null,count:loyal-loyalChildren-warriors},
  {classId:'villager',allegiance:'neutral',specialty:'ordinary',kind:'adults',age:null,count:population-loyal-children+loyalChildren},
 ]);
 return {population,loyal};
}
