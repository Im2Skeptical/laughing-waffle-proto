import assert from 'node:assert/strict';
import {allocateBirthAllegiances,validateBirthAllegianceCredits} from '../src/model/detailed-settlements/birth-allegiance.js';
import {createNewGameState} from '../src/model/new-game.js';
import {serializeGameState,deserializeGameState} from '../src/model/state.js';
import {writePopulationBins,populationBins} from '../src/model/detailed-settlements/population-ledger.js';
import {controlSummary,occupationResistance,minimumHoldingAllegiance,resolveControl} from '../src/model/detailed-settlements/territory.js';
import {initializeReplayClock,advanceReplayStateToSecond} from '../src/model/replay-second-runner.js';
import {createTimelineFromInitialState,rebuildStateAtSecond} from '../src/model/timeline/index.js';

const group={classId:'villager',specialty:'warrior'},newLedger=()=>({birthAllegianceCredits:{}});
const counts=rows=>Object.fromEntries(rows.map(b=>[b.allegiance,b.count]));
const tally=(a,rows)=>{for(const b of rows)a[b.allegiance]=(a[b.allegiance]??0)+b.count;};
const fixed={'external-a':35,neutral:65};
let s=newLedger(),actual={};
for(let i=0;i<100;i++)tally(actual,allocateBirthAllegiances(s,fixed,1,group));
assert.deepEqual(actual,{neutral:65,'external-a':35},'single births retain the minority share');
const whole=newLedger();assert.deepEqual(counts(allocateBirthAllegiances(whole,fixed,100,group)),{'external-a':35,neutral:65});
assert.deepEqual(whole,s,'batch boundaries cannot reset fractional entitlement');
const partial=newLedger();allocateBirthAllegiances(partial,fixed,7,group);
const reordered=structuredClone(partial);reordered.birthAllegianceCredits['villager:warrior']=Object.fromEntries(Object.entries(reordered.birthAllegianceCredits['villager:warrior']).reverse());
assert.deepEqual(allocateBirthAllegiances(partial,fixed,93,group),allocateBirthAllegiances(reordered,fixed,93,group),'JSON key order cannot reset entitlement');

// Variable shares are credited at each birth. For k eligible factions the
// cumulative allocation is <1 ahead and <(k-1) behind entitlement (up to FP
// tolerance). This bound follows from zero-sum credits and choosing the maximum.
for(const changing of [false,true]){
 s=newLedger();actual={};const expected={player:0,'external-a':0,neutral:0};
 for(let i=0;i<40000;i++){
  const shares=changing?{player:1+i%97,'external-a':1+(i*37)%89,neutral:1+(i*19)%83}:{player:1,'external-a':34,neutral:65};
  const total=Object.values(shares).reduce((n,c)=>n+c,0);
  for(const id of Object.keys(expected))expected[id]+=shares[id]/total;
  tally(actual,allocateBirthAllegiances(s,shares,1,group));
  for(const id of Object.keys(expected))assert.ok(expected[id]-(actual[id]??0)<2+1e-7&&(actual[id]??0)-expected[id]<1+1e-7,'bounded lifetime discrepancy: '+id);
 }
 assert.deepEqual(validateBirthAllegianceCredits(s),[]);
}
s=newLedger();const mixed={ordinary:{},warrior:{},scholar:{}};
for(let i=0;i<100;i++)for(const specialty of Object.keys(mixed))tally(mixed[specialty],allocateBirthAllegiances(s,fixed,1,{...group,specialty}));
for(const a of Object.values(mixed))assert.deepEqual(a,{neutral:65,'external-a':35},'class order cannot monopolise an allegiance');
const idle=JSON.stringify(s);allocateBirthAllegiances(s,fixed,0,group);assert.equal(JSON.stringify(s),idle,'no-birth phases leave credit intact');
assert.deepEqual(counts(allocateBirthAllegiances(s,{neutral:100},20,group)),{neutral:20},'extinct allegiance never receives a ghost birth');
assert.deepEqual(counts(allocateBirthAllegiances(s,fixed,100,group)),{'external-a':35,neutral:65},'changed eligible set starts a fresh quota epoch');

const state=initializeReplayClock(createNewGameState(123)),site=state.world.sites.find(x=>state.world.regions.find(r=>r.id===x.regionId).controller==='player'),d=site.detailedState;
d.practiceSlots=Array(5).fill(null);d.structureSlots.fill(null);d.garrison={supplied:false};
const bin=(count,allegiance,specialty='ordinary',kind='adults')=>({classId:'villager',allegiance,specialty,kind,age:kind==='elder'?60:null,count});
for(const [bins,required,held] of [
 [[bin(25,'player','warrior'),bin(75,'neutral')],18,true],
 [[bin(25,'player','warrior'),bin(75,'external-a')],36,false],
 [[bin(25,'player','warrior'),bin(65,'neutral'),bin(10,'external-a','warrior')],39.6,false],
 [[bin(25,'player','warrior'),bin(65,'neutral','warrior'),bin(10,'external-a','warrior','children')],20.4,true],
 [[bin(25,'player','warrior'),bin(65,'neutral'),bin(10,'external-a','warrior','elder')],39.6,false],
]){
 writePopulationBins(d,bins);const before=JSON.stringify(state),c=controlSummary(state,site.regionId);
 assert(Math.abs(c.required-required)<1e-10);assert.equal(c.occupied,held);assert.equal(c.supported,false);
 assert.equal(JSON.stringify(state),before,'resistance and shield queries leave state and RNG untouched');
 assert.equal(c.loyal>=c.minimumLoyal,held,'shield agrees at live mix');
}
writePopulationBins(d,[bin(25,'player','warrior'),bin(75,'neutral')]);
for(let i=0;i<8;i++)resolveControl(state);
assert.equal(state.world.regions.find(r=>r.id===site.regionId).controller,'player','minority holds over repeated control checks');
const res=occupationResistance(d,'player');assert.equal(res.unaffiliated+res.rivalCivilians+res.rivalWarriors,75,'no person counted twice');
assert.equal(minimumHoldingAllegiance(100,9,{disloyal:90,units:90}),37);
assert.equal(minimumHoldingAllegiance(100,8.99,{disloyal:90,units:90}),37,'fractional Force has no whole-person cliff here');

allocateBirthAllegiances(d,fixed,7,group);
const encoded=serializeGameState(state),loaded=deserializeGameState(encoded);
const loadedD=loaded.world.sites.find(x=>x.regionId===site.regionId).detailedState;
assert.deepEqual(loadedD.birthAllegianceCredits,d.birthAllegianceCredits);
assert.deepEqual(allocateBirthAllegiances(d,fixed,93,group),allocateBirthAllegiances(loadedD,fixed,93,group),'mid-quota save continues identically');
const corrupt=structuredClone(encoded);corrupt.world.sites.find(x=>x.regionId===site.regionId).detailedState.birthAllegianceCredits['villager:warrior'].neutral=99;
assert.throws(()=>deserializeGameState(corrupt),/birth allegiance/);
const obsolete=structuredClone(encoded);obsolete.gameStateSchemaVersion=44;assert.throws(()=>deserializeGameState(obsolete),/expected v49/);

const live=initializeReplayClock(createNewGameState(42)),timeline=createTimelineFromInitialState(live);
advanceReplayStateToSecond(live,43);
assert.ok(live.world.sites.some(s=>Object.keys(s.detailedState.birthAllegianceCredits).length),'real Birth phase writes credits');
const restored=initializeReplayClock(deserializeGameState(serializeGameState(live)),43);
advanceReplayStateToSecond(live,180);advanceReplayStateToSecond(restored,180);
assert.deepEqual(serializeGameState(live),serializeGameState(restored));
const replay=rebuildStateAtSecond(timeline,180);assert.ok(replay.ok);assert.deepEqual(serializeGameState(live),serializeGameState(replay.state));
assert.ok(populationBins(d).length);
console.log('Proportional births/Force: 80,000 bounded prefixes, batch/class independence, extinct factions, minority control, shield boundaries, save validation and authoritative replay passed.');
