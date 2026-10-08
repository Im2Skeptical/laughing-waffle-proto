import { getDetailedPracticeDef, getGameSetting } from '../game-config.js';
import { getDetailedSettlement } from './queries.js';
import { ageCohortTotal } from './cohorts.js';

export function assignDetailedSettlementWorkers(state, regionId) {
  const settlement = getDetailedSettlement(state,regionId);
  const assignments=(settlement?.practiceSlots??[]).map((slot,slotIndex)=>({slotIndex,practiceId:slot?.practiceId??null,tokens:[],effectiveWorkers:0}));
  // Definitions cannot change during one pass: resolve each slot's once.
  // The comparator returns exactly the previous values, so the stable sort
  // produces the same order.
  const defs=assignments.map(a=>getDetailedPracticeDef(state,a.practiceId));
  const capacities=defs.map(def=>def?.workerCapacity??0);
  const scholarRequired=defs.map(def=>Number(!!def?.scholarRequired));
  const capacity=a=>capacities[a.slotIndex];
  const scholarOrder=[...assignments].sort((a,b)=>scholarRequired[b.slotIndex]-scholarRequired[a.slotIndex]||a.slotIndex-b.slotIndex);
  for(const [classId,cohort] of Object.entries(settlement?.populationByClass??{})) {
    const scholar=cohort.specialists?.scholar;
    const scholars=Math.max(0,ageCohortTotal(scholar)-(scholar?.children??0));
    let remaining=scholars;
    const effectiveness=getGameSetting(state,classId==='villager'?'villagerEffectiveness':'strangerEffectiveness');
    for(const a of scholarOrder) {
      if(!remaining) break;
      if(!capacity(a)||a.tokens.length>=capacity(a)||a.tokens.some(t=>t.specialist==='scholar')) continue;
      a.tokens.push({classId,specialist:'scholar',effectiveness});a.effectiveWorkers+=effectiveness;remaining--;
    }
  }
  // Every Scholar claims a specialist socket before ordinary cohort tokens.
  for(const [classId,cohort] of Object.entries(settlement?.populationByClass??{})) {
    const scholars=Math.max(0,ageCohortTotal(cohort.specialists?.scholar)-(cohort.specialists?.scholar?.children??0));
    const effectiveness=getGameSetting(state,classId==='villager'?'villagerEffectiveness':'strangerEffectiveness');
    let workers=Math.floor(Math.max(0,ageCohortTotal(cohort)-cohort.children-scholars)/Math.max(1,getGameSetting(state,'populationPerToken')));
    for(const a of assignments) while(workers>0&&a.tokens.length<capacity(a)) {
      a.tokens.push({classId,specialist:null,effectiveness});a.effectiveWorkers+=effectiveness;workers--;
    }
  }
  return assignments;
}
export const isScholarStaffed = assignment => assignment?.tokens?.some(t=>t.specialist==='scholar')===true;
