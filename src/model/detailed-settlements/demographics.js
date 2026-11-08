// Read-only census projections. Never write to cohorts, the clock or RNG.
import {hasPopulationLedger,populationBins} from './population-ledger.js';
import {splitSpecialistCohorts} from './cohorts.js';
import {getGameSetting} from '../game-config.js';

const SPECIALTIES=['ordinary','warrior','scholar'];
const ages=()=>({children:0,adults:0,elders:0,total:0});
const group=()=>({...ages(),specialties:Object.fromEntries(SPECIALTIES.map(id=>[id,ages()]))});
function legacyBins(settlement) {
  return Object.entries(settlement.populationByClass).flatMap(([classId,c])=>Object.entries(splitSpecialistCohorts(c)).flatMap(([specialty,p])=>[
    {classId,specialty,allegiance:'unrecorded',kind:'children',count:p.children},
    {classId,specialty,allegiance:'unrecorded',kind:'adults',count:p.adults},
    ...p.eldersByAge.map(e=>({classId,specialty,allegiance:'unrecorded',kind:'elder',age:e.age,count:e.count})),
  ]));
}
const sum = (entries,key) => Object.values(entries??{}).reduce((n,e)=>n+(e?.[key]??0),0);
export function getPopulationDemographics(state,settlement) {
  const knownAllegiance=hasPopulationLedger(settlement),bins=knownAllegiance?populationBins(settlement):legacyBins(settlement);
  const byAllegiance=Object.fromEntries((knownAllegiance?['player','external-a','neutral']:['unrecorded']).map(id=>[id,group()]));
  const specialties=Object.fromEntries(SPECIALTIES.map(id=>[id,ages()])),population=ages(),elderAges=new Map();
  for(const b of bins){
    if(!b.count)continue;
    const kind=b.kind==='elder'?'elders':b.kind;
    byAllegiance[b.allegiance]??=group();
    const faction=byAllegiance[b.allegiance],specialty=specialties[b.specialty];
    for(const target of [population,faction,faction.specialties[b.specialty],specialty]){target[kind]+=b.count;target.total+=b.count;}
    if(b.kind==='elder')elderAges.set(b.age,(elderAges.get(b.age)??0)+b.count);
  }
  const residency=Object.entries(settlement.populationByClass).map(([id,c])=>{
    const tier=String(c.faith?.tier??'gold'),faith=tier[0].toUpperCase()+tier.slice(1),count=(c.children??0)+(c.adults??0)+(c.eldersByAge??[]).reduce((n,e)=>n+e.count,0);
    return {id,total:count,faith:tier,happiness:c.happiness?.status??'neutral',
      fullFeedStreak:c.happiness?.fullFeedStreak??0,missedFeedStreak:c.happiness?.missedFeedStreak??0,
      birthChance:getGameSetting(state,'birthRate'+faith),maturityChance:getGameSetting(state,'childToAdultRate'),elderChance:getGameSetting(state,'adultToElderRate'),
      expectedBirths:(c.adults??0)*getGameSetting(state,'birthRate'+faith),expectedMatured:(c.children??0)*getGameSetting(state,'childToAdultRate'),
    };
  });
  const last=settlement.lastMoonResult,death=last?.death;
  const historyAvailable=!!(last?.birth&&death);
  return {knownAllegiance,population,byAllegiance,specialties,residency,
    elderAges:[...elderAges].sort((a,b)=>a[0]-b[0]).map(([age,count])=>({age,count})),
    lastMoon:{available:historyAvailable,births:sum(last?.birth?.byClass,'births'),matured:sum(last?.birth?.byClass,'matured'),
      newElders:sum(last?.birth?.byClass,'newElders'),deaths:sum(death?.byClass,'naturalDeaths')+(death?.hardshipDeaths??0)+(death?.arrivalDeaths??0),
      arrivals:(last?.migration?.inbound??[]).reduce((n,m)=>n+(m.survivors??m.amount??0),0),
      departures:(last?.migration?.outbound??[]).reduce((n,m)=>n+(m.amount??0),0)},
  };
}

