import assert from 'node:assert/strict';
import {minimumHoldingShare,minimumHoldingAllegiance,controlSummary} from '../src/model/detailed-settlements/territory.js';
import {createNewGameState} from '../src/model/new-game.js';
import {writePopulationBins} from '../src/model/detailed-settlements/population-ledger.js';

for(const total of [20,30,60,120,300]){
 const two=minimumHoldingShare(total,2),four=minimumHoldingShare(total,4);
 assert(two>four&&four>0,'more Force helps without erasing the threshold');
 assert(two-four<.13,'2–4 Force cannot erase the threshold or move it by thirteen percentage points');
 assert.equal(minimumHoldingShare(total,0),.70,'zero Force needs seventy percent allegiance');
 let previous=.70;
 for(let step=0;step<=200;step++){
  const force=step/10,share=minimumHoldingShare(total,force);
  assert(share<=previous+1e-12&&share>0&&share<=.70);previous=share;
  assert.equal(minimumHoldingAllegiance(total,force),Math.max(1,Math.ceil(total*share-1e-9)));
 }
}
assert(minimumHoldingShare(120,4)>minimumHoldingShare(20,4),'the same Force has less leverage over a larger population');
assert(minimumHoldingShare(100,4,{disloyal:80,units:160})>minimumHoldingShare(100,4,{disloyal:80,units:80}),'rival allegiance raises resistance');
const state=createNewGameState(123),site=state.world.sites.find(s=>state.world.regions.find(r=>r.id===s.regionId).controller==='player'),d=site.detailedState;
d.practiceSlots=Array(5).fill(null);d.structureSlots.fill(null);d.garrison={supplied:true};
for(const force of [0,1,2,2.5,4,10,20])for(let loyal=0;loyal<=100;loyal++){
 writePopulationBins(d,[{classId:'villager',allegiance:'player',specialty:'ordinary',kind:'adults',count:loyal},{classId:'villager',allegiance:'neutral',specialty:'ordinary',kind:'adults',count:100-loyal}]);
 d.politicalForce={test:{allegiance:'player',amount:force,untilSec:100}};
 const c=controlSummary(state,site.regionId);
 assert.equal(c.force,force);
 assert.equal(c.supported||c.occupied,loyal>=c.minimumLoyal,'actual retention and the shield use one rule');
 if(loyal===0)assert.equal(c.required,null,'no finite Force can replace every local ally');
 else assert.equal(c.occupied,force>0&&force+1e-9>=c.required);
}
console.log('[force-curve] gradual 2–4 Force, fractional inputs, population/mix scaling, inverse requirement and real retention agree');
