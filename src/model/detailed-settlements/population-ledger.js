// Joint residency × allegiance × specialty × age ledger. Summary fields are
// derived caches for existing demographic/inspection readers, never identities.
export const UNAFFILIATED = 'neutral';
const compare = (a,b) => a < b ? -1 : a > b ? 1 : 0;
const key = b => [b.allegiance, b.classId, b.specialty, b.kind, b.age ?? ''].join('|');
export function allocatePopulation(bins, requested) {
  const available = bins.reduce((n,b)=>n+b.count,0);
  const target = Math.min(available, Math.max(0, Math.floor(requested)));
  if (!available || !target) return [];
  const result = bins.map(b=>{const exact=target*b.count/available;return {...b,count:Math.floor(exact),remainder:exact%1};});
  let left=target-result.reduce((n,b)=>n+b.count,0);
  for(const b of [...result].sort((a,b)=>b.remainder-a.remainder||compare(key(a),key(b)))) {
    if (!left) break; b.count++;left--;
  }
  return result.filter(b=>b.count).map(({remainder,...b})=>b);
}
export function populationBins(settlement) {
  return Object.entries(settlement?.populationByClass??{}).flatMap(([classId,c])=>(c.joint??[]).map(b=>({...b,classId})));
}
export const hasPopulationLedger = settlement => Object.values(settlement?.populationByClass??{}).some(c=>Array.isArray(c?.joint));
export function writePopulationBins(settlement,bins) {
  const merged=new Map();
  for(const b of bins) if(b.count>0) {const k=key(b);const prior=merged.get(k);if(prior)prior.count+=b.count;else merged.set(k,{classId:b.classId,allegiance:b.allegiance,specialty:b.specialty,kind:b.kind,age:b.age??null,count:b.count});}
  for(const [classId,c] of Object.entries(settlement.populationByClass)) {
    c.joint=[...merged.values()].filter(b=>b.classId===classId).sort((a,b)=>compare(key(a),key(b))).map(({classId,order,...b})=>b);
    c.children=0;c.adults=0;c.eldersByAge=[];
    c.specialists=Object.fromEntries(['scholar','warrior'].map(id=>[id,{children:0,adults:0,eldersByAge:[]}]));
    const add=(target,b)=>{if(b.kind==='elder'){const e=target.eldersByAge.find(e=>e.age===b.age);if(e)e.count+=b.count;else target.eldersByAge.push({age:b.age,count:b.count});}else target[b.kind]+=b.count;};
    for(const b of c.joint){add(c,b);if(b.specialty!=='ordinary') {c.specialists[b.specialty]??={children:0,adults:0,eldersByAge:[]};add(c.specialists[b.specialty],b);}}
    c.eldersByAge.sort((a,b)=>a.age-b.age);
  }
}
export function matchesPopulation(b,filter={},beneficiary=null) {
  return (!filter.kind||b.kind===filter.kind)&&(!filter.classId||b.classId===filter.classId)
    &&(!filter.specialty||b.specialty===filter.specialty)
    &&(!filter.allegiance||b.allegiance===(filter.allegiance==='beneficiary'?beneficiary:filter.allegiance))
    &&(!filter.opposing||b.allegiance!==beneficiary);
}
export function selectPeople(settlement,amount,filter={},beneficiary=null) {
  return allocatePopulation(populationBins(settlement).filter(b=>matchesPopulation(b,filter,beneficiary)),amount);
}
export function removePeople(settlement,selected) {
  if(!selected.length)return [];
  const bins=populationBins(settlement),actual=[];
  for(const b of selected){const source=bins.find(s=>key(s)===key(b));const count=Math.min(source?.count??0,b.count);if(count){source.count-=count;actual.push({...b,count});}}
  writePopulationBins(settlement,bins);return actual;
}
export function transformPeople(settlement,selected,changes) {
  const actual=removePeople(settlement,selected);
  writePopulationBins(settlement,[...populationBins(settlement),...actual.map(b=>({...b,...changes}))]);
  return actual.reduce((n,b)=>n+b.count,0);
}
export function allegianceSummary(settlement) {
  const counts={};for(const b of populationBins(settlement))counts[b.allegiance]=(counts[b.allegiance]??0)+b.count;
  return counts;
}

export function validatePopulationLedger(settlement) {
  if(!hasPopulationLedger(settlement))return ['missing joint population ledger'];
  const bins=populationBins(settlement),seen=new Set();
  for(const b of bins){
    if(!['player','external-a','neutral'].includes(b.allegiance)||!['ordinary','scholar','warrior'].includes(b.specialty)||!['children','adults','elder'].includes(b.kind)||!Number.isInteger(b.count)||b.count<=0||b.kind==='elder'&&(!Number.isInteger(b.age)||b.age<0)||seen.has(key(b)))return ['invalid joint population cohort'];
    seen.add(key(b));
  }
  const derived={populationByClass:JSON.parse(JSON.stringify(settlement.populationByClass))};
  writePopulationBins(derived,bins);
  for(const [id,c] of Object.entries(settlement.populationByClass)){
    const d=derived.populationByClass[id];
    if(c.children!==d.children||c.adults!==d.adults||JSON.stringify(c.eldersByAge)!==JSON.stringify(d.eldersByAge)||JSON.stringify(c.specialists)!==JSON.stringify(d.specialists))return ['joint population summary mismatch'];
  }
  return [];
}
