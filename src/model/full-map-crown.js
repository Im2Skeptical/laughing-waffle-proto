// Initial cohorts for the Crown's loyal capital and occupied outer settlements.
// All profiles retain the inherited economy's population budget.
import {writePopulationBins} from './detailed-settlements/population-ledger.js';

const CROWN_OPENINGS=Object.freeze({
 capital:{population:30,loyal:27,warriors:2,loyalChildren:6},
 province:{population:20,loyal:16,warriors:1,loyalChildren:4},
 forager:{population:12,loyal:5,warriors:5,loyalChildren:0},
 timber:{population:14,loyal:6,warriors:6,loyalChildren:0},
 quarry:{population:14,loyal:6,warriors:6,loyalChildren:0},
 grain:{population:24,loyal:10,warriors:10,loyalChildren:0},
 market:{population:24,loyal:10,warriors:10,loyalChildren:0},
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
