// Isolated completed-board projections; no actions, RNG or simulation ticks.
import { getDetailedPracticeDef } from '../game-config.js';
import { stockOutputBreakdown, stockCapacityBreakdown } from '../detailed-settlements/stock.js';
import { assignDetailedSettlementWorkers, isScholarStaffed } from '../detailed-settlements/workers.js';

export function multiplierBoardPreview(state, regionId, before, after, completeIds = []) {
  completeIds=completeIds.filter(Boolean);
  const site = state.world.sites.find(site => site.regionId === regionId);
  if (!site?.detailedState) return null;
  const read = (slots,predict=false) => {
    const settlement = {...site.detailedState,...slots};
    const projected = {...state,world:{...state.world,sites:state.world.sites.map(s => s === site ? {...s,detailedState:settlement} : s)}};
    const workers = assignDetailedSettlementWorkers(projected,regionId);
    return settlement.practiceSlots.flatMap((slot,index) => {
      const def = getDetailedPracticeDef(projected,slot?.practiceId);
      if (!def?.effects.some(effect => effect.op === 'generateStock')) return [];
      const staffed = isScholarStaffed(workers[index]);
      const mark=pool=>({...pool,sources:pool.sources.map(source=>({...source,pending:predict&&!!source.instanceId&&completeIds.includes(source.instanceId)}))});
      return [{index,practiceId:slot.practiceId,name:def.label,output:mark(stockOutputBreakdown(projected,settlement,slot,staffed)),capacity:mark(stockCapacityBreakdown(projected,settlement,slot,staffed))}];
    });
  };
  const current = read(before);
  const completed = {...after,structureSlots:after.structureSlots.map(slot => {
    if (!slot || !completeIds.includes(slot.placementId)) return slot;
    const {construction,...finished} = slot; return finished;
  })};
  return {afterCompletion:completeIds.length>0,rows:read(completed,true).map(row => ({...row,before:current.find(old => old.practiceId === row.practiceId) ?? null}))};
}

export function multiplierShopPreview(state, regionId, before, reservation, action, placementId, stagedIds = []) {
  if (!reservation || !['practice','structure'].includes(action?.kind)) return null;
  const result = multiplierBoardPreview(state,regionId,before,reservation,[...stagedIds,...(action.kind==='structure'?[placementId]:[])]);
  if (!result) return null;
  return {...result,kind:action.kind,rows:result.rows.filter(row => action.kind === 'practice' ? row.practiceId === action.practiceId
    : row.before && (row.before.output.multiplier !== row.output.multiplier || row.before.capacity.multiplier !== row.capacity.multiplier))};
}
