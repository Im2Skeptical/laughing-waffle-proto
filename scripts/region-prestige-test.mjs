import assert from 'node:assert/strict';
import {createNewGameState} from '../src/model/new-game.js';
import {getRegionPrestigePerNode,getVassalNodeResolutionGains,getVassalPrestigeIncome} from '../src/model/vassal-life-map/selectors.js';
import {getDetailedSettlementSites} from '../src/model/detailed-settlements.js';
import {getRegionState} from '../src/model/world-state.js';
import {writePopulationBins} from '../src/model/detailed-settlements/population-ledger.js';
import {selectLifeMapVassal,getCurrentLifeMapVassal,getVassalNodeDecisionPresentation,enterVassalLifeNode} from '../src/model/vassal-life-map.js';
import {completeNodeResolution} from '../src/model/vassal-life-map/lifecycle/node-confirm.js';
import {initializeReplayClock,advanceReplayStateToSecond} from '../src/model/replay-second-runner.js';
import {serializeGameState,deserializeGameState} from '../src/model/state.js';
const state=createNewGameState(0);
const sites=getDetailedSettlementSites(state,{playerOnly:true});
const site=sites[0];
const setPopulation=count=>writePopulationBins(site.detailedState,count?[{classId:'villager',allegiance:'player',specialty:'ordinary',kind:'adults',age:null,count}]:[]);
setPopulation(20);
for(const [unrest,expected] of [[0,1],[25,.75],[100,0]]){
 site.detailedState.control.unrest=unrest;
 const before=JSON.stringify(state);
 assert.equal(getRegionPrestigePerNode(state,site.regionId),expected);
 assert.equal(JSON.stringify(state),before,'selector does not mutate state');
}
site.detailedState.control.unrest=25;
for(const population of [0,1,20,50,100,200,1000]){
 setPopulation(population);
 assert.equal(getRegionPrestigePerNode(state,site.regionId),population/20*.75);
}
for(const holder of ['external-a','frontier']){
 getRegionState(state,site.regionId).controller=holder;
 assert.equal(getRegionPrestigePerNode(state,site.regionId),null);
}
getRegionState(state,site.regionId).controller='player';
setPopulation(0);assert.equal(getRegionPrestigePerNode(state,site.regionId),0);
setPopulation(100);
assert.equal(selectLifeMapVassal(state,0).ok,true);
const v=getCurrentLifeMapVassal(state);v.initialAge=0;
const regional=sites.reduce((n,s)=>n+getRegionPrestigePerNode(state,s.regionId),0);
assert.equal(getVassalNodeResolutionGains(state,v,'development').prestige,Math.round(getVassalPrestigeIncome(v)+regional));
// The same shared calculation feeds option preview and actual completion.
const node=v.lifeMap.graph.nodes.find(n=>n.family==='development');
assert.ok(node);
v.lifeMap.availableNodeIds=[node.id];
assert.equal(enterVassalLifeNode(state,node.id).ok,true);
const presentation=getVassalNodeDecisionPresentation(state);
assert.ok(presentation.vassalProjection.ifSurvives.prestigeIncome===getVassalNodeResolutionGains(state,v,'development').prestige,'node preview includes regional income');
const ns=v.lifeMap.nodeStates[node.id];ns.selectedOptionId=null;
const before=state.civilization.prestige,personal=v.prestige,gross=state.civilization.treasury.grossIncome;
const expected=getVassalNodeResolutionGains(state,v,ns.family).prestige;
completeNodeResolution(state,v,ns);
assert.equal(state.civilization.prestige-before,expected);
assert.equal(state.civilization.treasury.grossIncome-gross,expected);
assert.equal(v.prestige,personal,'regional gain uses the civ pool');
for(const kind of ['shopDelve','campaignEncounter']){
 const copy=deserializeGameState(serializeGameState(state));const cv=getCurrentLifeMapVassal(copy);
 cv.lifeMap.pendingResolution={kind};
 const cn={nodeId:node.id,family:kind==='shopDelve'?'practiceShop':'campaign',options:[],inventoryRoll:0};
 const balance=copy.civilization.prestige;
 completeNodeResolution(copy,cv,cn);
 assert.equal(copy.civilization.prestige,balance,`${kind} pays no node Prestige`);
}
const idle=createNewGameState(9),balance=idle.civilization.prestige;
initializeReplayClock(idle);advanceReplayStateToSecond(idle,32);
assert.equal(idle.civilization.prestige,balance,'simulation time alone earns no regional Prestige');
const loaded=deserializeGameState(serializeGameState(state));
assert.deepEqual(getVassalNodeResolutionGains(loaded,getCurrentLifeMapVassal(loaded),'development'),getVassalNodeResolutionGains(state,v,'development'));
console.log('Regional Prestige: population/unrest, node preview, shared payout, delve/encounter exclusion, no drip and JSON continuation OK.');
