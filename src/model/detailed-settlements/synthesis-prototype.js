// THROWAWAY derived score. Uses the real worker assignment and atomic Stock
// planner; inspecting eligibility never pays, reserves, activates or rolls RNG.
import { getDetailedPracticeDef } from '../game-config.js';
import { getDetailedSettlement } from './queries.js';
import { assignDetailedSettlementWorkers, isScholarStaffed } from './workers.js';
import { planStock } from './stock.js';

export const SYNTHESIS_QUERY=Object.freeze({workerSpecialist:'scholar',requireSupplied:true});

// Reusable Practice-count query; Synthesis supplies its requirements as data.
export function practiceScoreContributors(state, regionId, query, excludePracticeId) {
  const settlement=getDetailedSettlement(state,regionId);
  if(!settlement)return [];
  return assignDetailedSettlementWorkers(state,regionId).flatMap(assignment=>{
    if(!assignment.practiceId||assignment.practiceId===excludePracticeId)return [];
    if(query.workerSpecialist&&!assignment.tokens.some(token=>token.specialist===query.workerSpecialist))return [];
    const slot=settlement.practiceSlots[assignment.slotIndex],def=getDetailedPracticeDef(state,assignment.practiceId);
    const supplied=!query.requireSupplied||planStock(state,settlement,def.consume??[],def.require??[],slot,isScholarStaffed(assignment)).ok;
    return supplied?[{practiceId:def.id,label:def.label,slotIndex:assignment.slotIndex}]:[];
  });
}

export function synthesisContributors(state, regionId, excludePracticeId) {
  return practiceScoreContributors(state,regionId,SYNTHESIS_QUERY,excludePracticeId);
}
