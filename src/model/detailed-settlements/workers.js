import { getDetailedPracticeDef, getGameSetting } from '../game-config.js';
import { getDetailedSettlement } from './queries.js';
import { ageCohortTotal } from './cohorts.js';

export function assignDetailedSettlementWorkers(state, regionId) {
  const settlement = getDetailedSettlement(state,regionId);
  const assignments=(settlement?.practiceSlots??[]).map((slot,slotIndex)=>({slotIndex,practiceId:slot?.practiceId??null,tokens:[],effectiveWorkers:0}));
  const capacity=a=>getDetailedPracticeDef(state,a.practiceId)?.workerCapacity??0;
  const scholarOrder=[...assignments].sort((a,b)=>Number(!!getDetailedPracticeDef(state,b.practiceId)?.scholarRequired)-Number(!!getDetailedPracticeDef(state,a.practiceId)?.scholarRequired)||a.slotIndex-b.slotIndex);
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
