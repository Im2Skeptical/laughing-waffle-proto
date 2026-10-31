import { getRegionState } from '../../world-state.js';
import { hasPopulationLedger, populationBins, writePopulationBins, allocatePopulation } from '../population-ledger.js';
import { splitSpecialistCohorts, combineSpecialistCohorts } from "../cohorts.js";
import { specialistCount, structureModifiers } from "../stock.js";
import { emitPracticeEvent } from '../practice-events.js';
import { flushPracticeEvents } from '../practices.js';
// Death moon phase: arrival meals, hardship, old-age mortality and population history.

import { POPULATION_CLASS_ORDER } from "../../../defs/gamepieces/detailed-settlement-defs.js";
import { getGameSetting } from "../../game-config.js";
import {
  clone,
  compositionTotal,
  compositionBins,
  compositionFromBins,
  emptyPopulationComposition,
  ensureMoonRegionResult,
  roundFood,
} from "../helpers.js";
import {
  getDetailedSettlement,
  getDetailedSettlementSites,
} from "../queries.js";
import { recordChaosLosses } from "./chaos.js";
import {
  addCompositionToStrangers,
  allocateArrivalMeals,
  compactMigrationMovement,
  removePopulationComposition,
} from "./migration.js";
import { setMoonTurnPhase } from "./moon-turn.js";
import {
  getElderMortalityRate,
  resetEmptyStrangerCohort,
  rollCount,
} from "./shared.js";

function rollCompositionDeaths(state, composition, probability) {
  return compositionFromBins(compositionBins(composition).map(bin=>({...bin,count:rollCount(state,bin.count,probability)})));
}

export function runDeathPhase(state, phase) {
  const turn = setMoonTurnPhase(state, phase);
  const internalMovements = turn.movements.filter((movement) => movement.external !== true);
  allocateArrivalMeals(state, internalMovements);
  for (const movement of internalMovements) {
    addCompositionToStrangers(
      getDetailedSettlement(state, movement.destinationRegionId),
      movement.survivorComposition
    );
  }
  const hardshipDeathsByRegion = Object.fromEntries(
    getDetailedSettlementSites(state).map((site) => [site.regionId, 0])
  );
  let prematureDeaths = 0;
  let oldAgeDeaths = 0;
  let prematureDeathMitigation=0;
  for (const unresolved of turn.unresolved) {
    const source=getDetailedSettlement(state, unresolved.sourceRegionId);
    let vulnerable=unresolved.composition;
    if(hasPopulationLedger(source)){
      // Allegiance/training may change between Migration and Death. Hardship
      // still applies to actual remaining residents, never stale identities.
      const classes=new Set(compositionBins(vulnerable).map(b=>b.classId));
      vulnerable=compositionFromBins(allocatePopulation(populationBins(source).filter(b=>classes.has(b.classId)),compositionTotal(vulnerable)));
    }
    let deaths = rollCompositionDeaths(
      state,
      vulnerable,
      getGameSetting(state, "migrationHardshipDeathRate")
    );
    const actual=removePopulationComposition(source,deaths);
    if(hasPopulationLedger(source))deaths=actual;
    hardshipDeathsByRegion[unresolved.sourceRegionId] += compositionTotal(deaths);
    prematureDeaths += compositionTotal(deaths);
  }
  for (const site of getDetailedSettlementSites(state)) {
    if (site.neutral) continue;
    const settlement = site.detailedState;
    const regionResult = ensureMoonRegionResult(turn, site.regionId);
    const byClass = {};
    for (const classId of POPULATION_CLASS_ORDER) {
      const classState = settlement.populationByClass[classId];
      let naturalDeaths = 0;
      if(hasPopulationLedger(settlement)) {
        const bins=populationBins(settlement);
        for(const b of bins)if(b.classId===classId&&b.kind==='elder'){const deaths=rollCount(state,b.count,getElderMortalityRate(b.age,state));naturalDeaths+=deaths;b.count-=deaths;}
        writePopulationBins(settlement,bins);
      }
      const parts = splitSpecialistCohorts(classState);
      if(!hasPopulationLedger(settlement)) for(const part of Object.values(parts)) part.eldersByAge = (part.eldersByAge ?? []).map((cohort) => {
        const mortality = getElderMortalityRate(cohort.age, state);
        const deaths = rollCount(state, cohort.count, mortality);
        naturalDeaths += deaths;
        return { ...cohort, count: cohort.count - deaths };
      }).filter((cohort) => cohort.count > 0);
      if(!hasPopulationLedger(settlement)) combineSpecialistCohorts(classState, parts);
      byClass[classId] = { naturalDeaths };
      settlement.history ??= { deaths: 0 };
      settlement.history.deaths += naturalDeaths;
      oldAgeDeaths += naturalDeaths;
    }
    const migration = {
      ...(regionResult.migration ?? {
        intents: [], outbound: [], inbound: [], sourceLosses: [],
      }),
      outbound: turn.movements
        .filter((movement) => movement.sourceRegionId === site.regionId)
        .map(compactMigrationMovement),
      inbound: turn.movements
        .filter((movement) => movement.destinationRegionId === site.regionId)
        .map(compactMigrationMovement),
    };
    regionResult.migration = migration;
    regionResult.death = {
      tSec: state.tSec,
      byClass,
      hardshipDeaths: hardshipDeathsByRegion[site.regionId],
      arrivalDeaths: migration.inbound.reduce((sum, move) => sum + move.arrivalDeaths, 0),
      storedFoodRot: 0,
      looseFoodRot: 0,
    };
    const premature=regionResult.death.hardshipDeaths+regionResult.death.arrivalDeaths;
    const natural=Object.values(byClass).reduce((n,c)=>n+c.naturalDeaths,0);
    const mitigation=Math.min(.75,structureModifiers(state,settlement).reduce((n,m)=>n+(m.kind==='lossResistance'?m.amount:0),0));
    prematureDeathMitigation+=premature*mitigation*getGameSetting(state,'prematureDeathChaosWeight');
    if (premature+natural>0) {
      settlement.history.lastDeathSec=state.tSec;
      settlement.history.lastDeathCount=premature+natural;
      settlement.history.deaths+=premature;
      emitPracticeEvent(state,{kind:'populationDied',regionId:site.regionId,amount:premature+natural,premature:premature>0});
    }
    if (settlement.lastMeal) settlement.lastMeal.migration = clone(migration);
    resetEmptyStrangerCohort(settlement);
  }
  prematureDeaths += internalMovements.reduce((sum, movement) => sum + movement.arrivalDeaths, 0);
  if(state.rulesetId){prematureDeaths=0;oldAgeDeaths=0;prematureDeathMitigation=0;
    for(const site of getDetailedSettlementSites(state,{playerOnly:true})){const d=turn.regions[site.regionId]?.death;if(d){prematureDeaths+=d.hardshipDeaths+d.arrivalDeaths;oldAgeDeaths+=Object.values(d.byClass).reduce((n,c)=>n+c.naturalDeaths,0);}}
  }
  recordChaosLosses(state, { prematureDeaths, oldAgeDeaths, prematureDeathMitigation });
  flushPracticeEvents(state);
}
