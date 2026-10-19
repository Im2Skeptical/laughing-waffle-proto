import { VASSAL_HEIRLOOM_DEFS, VASSAL_HEIRLOOM_DEFINITION_IDS, VASSAL_HEIRLOOM_QUALITIES } from '../../defs/gamepieces/vassal-heirloom-defs.js';

export const RELIC_POOL_IDS=Object.freeze(['relic','specialRelic']);

export function validateRelicPools(pools){
  const errors=[];
  const check=(path,rule)=>{
    if(!rule||typeof rule.enabled!=='boolean'||!Number.isFinite(rule.weight)||rule.weight<=0||rule.weight>100000)
      errors.push(`${path}: expected an enabled switch and a weight above 0, up to 100000`);
  };
  for(const quality of VASSAL_HEIRLOOM_QUALITIES)check(`design.relicPools.relic.qualities.${quality}`,pools?.relic?.qualities?.[quality]);
  for(const id of VASSAL_HEIRLOOM_DEFINITION_IDS)check(`design.relicPools.specialRelic.entries.${id}`,pools?.specialRelic?.entries?.[id]);
  for(const id of Object.keys(pools??{}))if(!RELIC_POOL_IDS.includes(id))errors.push(`design.relicPools.${id}: unknown pool`);
  for(const quality of Object.keys(pools?.relic?.qualities??{}))if(!VASSAL_HEIRLOOM_QUALITIES.includes(quality))errors.push(`design.relicPools.relic.qualities.${quality}: unknown quality`);
  for(const id of Object.keys(pools?.specialRelic?.entries??{}))if(!VASSAL_HEIRLOOM_DEFS[id])errors.push(`design.relicPools.specialRelic.entries.${id}: unknown Relic`);
  return errors;
}

// Starting probabilities for one draw. Recompute after each offer so owned and
// already offered Relics never appear twice; disabled content never fills gaps.
export function getRelicPoolAppearance(design,poolId,excludedIds=[]){
  const excluded=new Set(excludedIds),pool=design.relicPools[poolId];
  const rows=VASSAL_HEIRLOOM_DEFINITION_IDS.map(id=>{
    const def=VASSAL_HEIRLOOM_DEFS[id],rule=poolId==='relic'?pool.qualities[def.quality]:pool.entries[id];
    return {...def,enabled:rule.enabled,weight:rule.weight,owned:excluded.has(id),available:rule.enabled&&!excluded.has(id),chance:0};
  });
  const eligible=rows.filter(row=>row.available);
  if(poolId==='relic'){
    const qualities=VASSAL_HEIRLOOM_QUALITIES.filter(quality=>eligible.some(row=>row.quality===quality));
    const total=qualities.reduce((sum,quality)=>sum+pool.qualities[quality].weight,0);
    for(const row of eligible)row.chance=pool.qualities[row.quality].weight/total/eligible.filter(other=>other.quality===row.quality).length;
  }else{
    const total=eligible.reduce((sum,row)=>sum+row.weight,0);
    for(const row of eligible)row.chance=row.weight/total;
  }
  return rows;
}
