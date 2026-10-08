import { DETAILED_QUALITY_IDS } from '../../model/detailed-practice-tiers.js';
import { field, select } from './elements.js';

const title = value => value[0].toUpperCase() + value.slice(1);
const operators = {gte:'At least',gt:'Higher than',lte:'At most',lt:'Lower than'};
export const qualityFilterLabel = value => {
  if (!value.includes(':')) return title(value);
  const [op,tier] = value.split(':');
  return `${operators[op]} ${title(tier)}`;
};

export function qualityFilterFields(filters, onChange) {
  return [
    ['maturity','Maturity',[['','Any'],...DETAILED_QUALITY_IDS.map(tier=>[tier,title(tier)])]],
    ['maturityFrom','Maturity from',[['','No lower bound'],...['gte','gt'].map(op=>({group:operators[op],entries:DETAILED_QUALITY_IDS.map(tier=>[`${op}:${tier}`,`${operators[op]} ${title(tier)}`])}))]],
    ['maturityTo','Maturity to',[['','No upper bound'],...['lte','lt'].map(op=>({group:operators[op],entries:DETAILED_QUALITY_IDS.map(tier=>[`${op}:${tier}`,`${operators[op]} ${title(tier)}`])}))]],
  ].map(([key,label,options])=>{
    const control = select(label,options,filters[key]??'');
    control.addEventListener('change',()=>{
      // Exact and ranged choices are alternatives; changing either starts
      // that mode, while the other range bound is retained.
      if (key === 'maturity') { filters.maturityFrom=''; filters.maturityTo=''; }
      else filters.maturity='';
      filters[key]=control.value;
      onChange();
    });
    return field(label,control);
  });
}
