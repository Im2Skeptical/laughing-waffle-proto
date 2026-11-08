import assert from 'node:assert/strict';
import {fresh} from '../src/model/tests/detailed-settlements/helpers.js';
import {getPopulationDemographics} from '../src/model/detailed-settlements/demographics.js';
import {writePopulationBins} from '../src/model/detailed-settlements/population-ledger.js';

const state=fresh(123),s=state.world.sites.find(s=>s.detailedState).detailedState;
const bins=[];
function people(allegiance,specialty,children,adults,elders=0,age=50,classId='villager'){
 for(const [kind,count] of [['children',children],['adults',adults],['elder',elders]])if(count)bins.push({classId,allegiance,specialty,kind,count,age:kind==='elder'?age:null});
}
people('player','ordinary',7,11,2);
people('external-a','warrior',4,5,3,60);
people('neutral','scholar',2,6);
people('external-a','ordinary',0,3,0,50,'stranger');
people('neutral','warrior',0,2,0,50,'stranger');
writePopulationBins(s,bins);
s.lastMoonResult={birth:{byClass:{villager:{births:3,matured:2,newElders:1},stranger:{births:1,matured:0,newElders:0}}},death:{byClass:{villager:{naturalDeaths:2},stranger:{naturalDeaths:1}},hardshipDeaths:4,arrivalDeaths:1},migration:{inbound:[{amount:8,survivors:6}],outbound:[{amount:5}]}};
const before=JSON.stringify(state),d=getPopulationDemographics(state,s);
assert.equal(JSON.stringify(state),before,'census must leave state and RNG unchanged');
assert.deepEqual(d.population,{children:13,adults:27,elders:5,total:45});
assert.deepEqual(Object.values(d.byAllegiance).map(g=>g.total),[20,15,10]);
assert.deepEqual(Object.values(d.specialties).map(g=>g.total),[23,14,8]);
for(const group of Object.values(d.byAllegiance))assert.equal(Object.values(group.specialties).reduce((n,c)=>n+c.total,0),group.total);
for(const [role,c] of Object.entries(d.specialties))assert.equal(Object.values(d.byAllegiance).reduce((n,g)=>n+g.specialties[role].total,0),c.total);
assert.equal(d.byAllegiance['external-a'].specialties.warrior.adults+d.byAllegiance['external-a'].specialties.warrior.elders,8,'children stay separate from eligible Warriors');
assert.deepEqual(d.elderAges,[{age:50,count:2},{age:60,count:3}]);
assert.deepEqual(d.lastMoon,{available:true,births:4,matured:2,newElders:1,deaths:8,arrivals:6,departures:5});
const legacy=structuredClone(s);for(const c of Object.values(legacy.populationByClass))delete c.joint;
const old=getPopulationDemographics(state,legacy);
assert.equal(old.knownAllegiance,false);assert.deepEqual(old.population,d.population);
assert.deepEqual(old.specialties,d.specialties);assert.equal(old.byAllegiance.unrecorded.total,45);assert.equal(old.byAllegiance.neutral,undefined);
writePopulationBins(s,[]);delete s.lastMoonResult;
const empty=getPopulationDemographics(state,s);
assert.equal(empty.population.total,0);assert.equal(empty.lastMoon.available,false);
assert.ok(JSON.stringify(empty));
console.log('Demographics census: joint row/column/age totals, history, legacy, empty and read-only state checks passed.');
