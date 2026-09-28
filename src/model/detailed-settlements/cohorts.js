// Specialists are subsets of status/age cohorts, never additional population.
export const SPECIALIST_IDS = Object.freeze(['scholar', 'warrior']);
export const emptyAgeCohort = () => ({ children: 0, adults: 0, eldersByAge: [] });
export const emptySpecialists = () => Object.fromEntries(SPECIALIST_IDS.map(id => [id, emptyAgeCohort()]));
export const ageCohortTotal = c => (c?.children ?? 0) + (c?.adults ?? 0) + (c?.eldersByAge ?? []).reduce((n,e)=>n+e.count,0);
export function addAgeCohort(target, source, sign = 1) {
  target.children += sign * (source?.children ?? 0);
  target.adults += sign * (source?.adults ?? 0);
  const ages = new Map((target.eldersByAge ?? []).map(e=>[e.age,e.count]));
  for(const e of source?.eldersByAge ?? []) ages.set(e.age,(ages.get(e.age)??0)+sign*e.count);
  target.eldersByAge = [...ages].filter(([,count])=>count>0).sort((a,b)=>a[0]-b[0]).map(([age,count])=>({age,count}));
}
export function splitSpecialistCohorts(cohort) {
  const ordinary = { children:cohort?.children??0, adults:cohort?.adults??0, eldersByAge:structuredClone(cohort?.eldersByAge??[]) };
  const parts = { ordinary };
  for(const id of SPECIALIST_IDS) {
    parts[id]=structuredClone(cohort?.specialists?.[id]??emptyAgeCohort());
    addAgeCohort(ordinary,parts[id],-1);
  }
  return parts;
}
export function combineSpecialistCohorts(target, parts) {
  const combined=emptyAgeCohort();
  for(const part of Object.values(parts)) addAgeCohort(combined,part);
  Object.assign(target,combined,{specialists:Object.fromEntries(SPECIALIST_IDS.map(id=>[id,parts[id]??emptyAgeCohort()]))});
}
export function validSpecialistCohorts(cohort) {
  const parts=splitSpecialistCohorts(cohort);
  return Object.values(parts).every(c=>Number.isInteger(c.children)&&c.children>=0&&Number.isInteger(c.adults)&&c.adults>=0)
    && SPECIALIST_IDS.every(id=>(cohort.specialists?.[id]?.eldersByAge??[]).every(e=>e.count>=0&&e.count<=(cohort.eldersByAge.find(a=>a.age===e.age)?.count??0)))
    && (cohort.eldersByAge??[]).every(e=>SPECIALIST_IDS.reduce((n,id)=>n+(cohort.specialists?.[id]?.eldersByAge.find(a=>a.age===e.age)?.count??0),0)<=e.count);
}
