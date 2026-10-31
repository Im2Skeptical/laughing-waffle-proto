import { hasPopulationLedger, populationBins, writePopulationBins, allocatePopulation, allegianceSummary } from '../population-ledger.js';
import { splitSpecialistCohorts, combineSpecialistCohorts } from "../cohorts.js";
// Birth moon phase: aging, births, and child/adult/elder transitions.

import { POPULATION_CLASS_ORDER } from "../../../defs/gamepieces/detailed-settlement-defs.js";
import { getGameSetting } from "../../game-config.js";
import { clone } from "../helpers.js";
import { runPracticeActivation } from "../practices.js";
import { getDetailedSettlementSites } from "../queries.js";
import { beginMoonTurn } from "./moon-turn.js";
import { resolveProbability, rollCount } from "./shared.js";

export function runBirthPhase(state, phase) {
  const turn = beginMoonTurn(state, phase);
  // Resistance effects last one moon, including the following Death phase.
  state.civilization.phaseModifiers.faithResistance = 0;
  runPracticeActivation(state, "birth");
  const lastAgedYear = Math.max(1, Math.floor(
    state.civilization.lastPopulationAgingYear ?? 1
  ));
  const ageAdvance = Math.max(0, Math.floor(state.year ?? 1) - lastAgedYear);
  for (const site of getDetailedSettlementSites(state)) {
    if (site.neutral) continue;
    const settlement = site.detailedState;
    const preBirth=allegianceSummary(settlement);
    const result = { tSec: state.tSec, year: state.year, byClass: {} };
    for (const classId of POPULATION_CLASS_ORDER) {
      const classState = settlement.populationByClass[classId];
      const parts = splitSpecialistCohorts(classState);
      const totals = {births:0,matured:0,newElders:0,ageAdvance};
      for(const [specialty,snapshot] of Object.entries(parts)) {
      if (ageAdvance > 0) {
        snapshot.eldersByAge = snapshot.eldersByAge.map((cohort) => ({
          ...cohort,
          age: cohort.age + ageAdvance,
        }));
      }
      const faithLabel = String(classState.faith.tier ?? "gold")
        .replace(/^./, (letter) => letter.toUpperCase());
      const birthRate = resolveProbability(getGameSetting(state, `birthRate${faithLabel}`));
      const childToAdultRate = getGameSetting(state, "childToAdultRate");
      const adultToElderRate = getGameSetting(state, "adultToElderRate");
      const births = rollCount(state, snapshot.adults, birthRate);
      const matured = rollCount(state, snapshot.children, childToAdultRate);
      const newElders = rollCount(state, snapshot.adults, adultToElderRate);
      const nextElders = snapshot.eldersByAge.map((cohort) => ({ ...cohort }));
      if (newElders > 0) {
        const newElderAge = getGameSetting(state, "newElderAge");
        const existing = nextElders.find((cohort) => cohort.age === newElderAge);
        if (existing) existing.count += newElders;
        else nextElders.push({ age: newElderAge, count: newElders });
      }
      if(hasPopulationLedger(settlement)) {
        const all=populationBins(settlement), own=all.filter(b=>b.classId===classId&&b.specialty===specialty);
        const other=all.filter(b=>b.classId!==classId||b.specialty!==specialty);
        for(const b of own)if(b.kind==='elder')b.age+=ageAdvance;
        const mature=allocatePopulation(own.filter(b=>b.kind==='children'),matured);
        const elderly=allocatePopulation(own.filter(b=>b.kind==='adults'),newElders);
        for(const moved of [...mature,...elderly]) {const b=own.find(b=>b.allegiance===moved.allegiance&&b.kind===moved.kind&&b.age===moved.age);b.count-=moved.count;}
        // Allocate births from the pre-birth all-age distribution, preserving
        // the existing number of births in each residency/specialty group.
        const newborns=allocatePopulation(Object.entries(preBirth).map(([allegiance,count])=>({allegiance,count,classId,specialty,kind:'children',age:null})),births);
        writePopulationBins(settlement,[...other,...own,...newborns,
          ...mature.map(b=>({...b,kind:'adults',age:null})),
          ...elderly.map(b=>({...b,kind:'elder',age:getGameSetting(state,'newElderAge')}))]);
      }
      snapshot.children = snapshot.children - matured + births;
      snapshot.adults = snapshot.adults + matured - newElders;
      snapshot.eldersByAge = nextElders.sort((a, b) => a.age - b.age);
      totals.births += births; totals.matured += matured; totals.newElders += newElders;
      result.byClass[classId] = {
        births,
        matured,
        newElders,
        ageAdvance,
        birthRate,
        childToAdultRate,
        adultToElderRate,
      };
      }
      if(!hasPopulationLedger(settlement)) combineSpecialistCohorts(classState, parts);
      Object.assign(result.byClass[classId], totals);
    }
    turn.regions[site.regionId].birth = result;
  }
  state.civilization.lastPopulationAgingYear = Math.max(
    lastAgedYear,
    Math.floor(state.year ?? 1)
  );
}
