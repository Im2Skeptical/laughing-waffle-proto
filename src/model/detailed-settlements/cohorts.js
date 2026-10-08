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
const PLAIN_CLONE_UNSUPPORTED = Symbol('plainCloneUnsupported');
// structuredClone semantics for plain objects/arrays/primitives: keeps
// undefined, -0, NaN, holes, key order, and shared/cyclic references (via
// seen). Anything else throws the sentinel and gets the real structuredClone.
function plainStructuredCopy(value, seen) {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'function' || typeof value === 'symbol') throw PLAIN_CLONE_UNSUPPORTED;
    return value;
  }
  const prior = seen.get(value);
  if (prior) return prior;
  const proto = Object.getPrototypeOf(value);
  const out = Array.isArray(value) && proto === Array.prototype ? new Array(value.length)
    : proto === Object.prototype || proto === null ? {} : null;
  if (!out) throw PLAIN_CLONE_UNSUPPORTED;
  seen.set(value, out);
  for (const key of Object.keys(value)) {
    const child = plainStructuredCopy(value[key], seen);
    if (key === '__proto__') Object.defineProperty(out, key, { value: child, enumerable: true, writable: true, configurable: true });
    else out[key] = child;
  }
  return out;
}
function cloneCohortData(value) {
  try { return plainStructuredCopy(value, new Map()); }
  catch (error) { if (error !== PLAIN_CLONE_UNSUPPORTED) throw error; return structuredClone(value); }
}
export function splitSpecialistCohorts(cohort) {
  const ordinary = { children:cohort?.children??0, adults:cohort?.adults??0, eldersByAge:cloneCohortData(cohort?.eldersByAge??[]) };
  const parts = { ordinary };
  for(const id of SPECIALIST_IDS) {
    parts[id]=cloneCohortData(cohort?.specialists?.[id]??emptyAgeCohort());
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
