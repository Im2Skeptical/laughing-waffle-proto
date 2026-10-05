import { detailedSettlementPracticeDefs } from '../../defs/gamepieces/detailed-settlement-defs.js';
import { MOON_PHASE_DEFS } from '../../defs/gamesettings/moon-phase-defs.js';

// Review documents are independent of GameState and of runner/save schemas.
export const CARD_REVIEW_SCHEMA = 1;
const clone = value => JSON.parse(JSON.stringify(value));
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const reviewKey = (kind, id) => `${kind}:${id}`;
export const readReviewValue = (def, path) => path.reduce((value, part) => value?.[part], def);
export const REVIEW_STOCK_TRAITS = Object.freeze([...new Set(Object.values(detailedSettlementPracticeDefs).flatMap(def=>def.stockTraits))].sort());
export const REVIEW_SEASONS = Object.freeze(['spring','summer','autumn','winter']);
export const REVIEW_PHASES = Object.freeze(MOON_PHASE_DEFS.map(phase=>phase.id));
export const REVIEW_SCHEDULE_TYPES = Object.freeze([...REVIEW_PHASES,'season','passive','crisis']);
const validSelection = (values, choices) => Array.isArray(values) && values.every(value=>choices.includes(value)) && new Set(values).size===values.length;

export function reviewScheduleTriggers(def) {
  return [def.activation?.type,...(def.activation?.also??[])].flatMap(type=>type==='season'?(def.activation.seasonKeys?.length?def.activation.seasonKeys:REVIEW_SEASONS):[type]);
}

// One transaction keeps trigger selection and seasonal yields in agreement.
export function reviewScheduleEdits(def, triggers) {
  if(def.mode!=='scheduled'||!validSelection(triggers,[...REVIEW_PHASES,...REVIEW_SEASONS,'passive','crisis'])||!triggers.length)throw new Error('Choose at least one schedule trigger.');
  const seasons=REVIEW_SEASONS.filter(season=>triggers.includes(season));
  const types=[...new Set(triggers.map(trigger=>REVIEW_SEASONS.includes(trigger)?'season':trigger))];
  const primary=types.includes(def.activation.type)?def.activation.type:types[0];
  const activation={...clone(def.activation),type:primary};
  delete activation.also;delete activation.seasonKeys;delete activation.stage;
  if(types.length>1)activation.also=types.filter(type=>type!==primary);
  if(seasons.length)activation.seasonKeys=seasons;
  if(types.includes('food'))activation.stage='preRouting';
  const edits=[{path:['activation'],value:activation}];
  (def.effects??[]).forEach((effect,index)=>{
    if(seasons.length&&typeof effect.amount==='number')edits.push({path:['effects',index,'seasonAmounts'],value:Object.fromEntries(seasons.map(season=>[season,effect.seasonAmounts?.[season]??effect.amount]))});
    else if(effect.seasonAmounts)edits.push({path:['effects',index,'seasonAmounts'],value:null});
  });
  return edits;
}

export function writeReviewValue(def, path, value) {
  let target=def;
  for(const part of path.slice(0,-1))target=target[part]??= {};
  if(value===null)delete target[path.at(-1)];
  else target[path.at(-1)]=clone(value);
}

export function reviewFields(def) {
  const fields = [];
  const visit = (value, path) => {
    if (['number', 'string', 'boolean'].includes(typeof value)) {
      // Identity/DSL dispatch strings are structural, not editable balance values.
      if(typeof value==='string' && !path.some(part=>['label','ui','tags','stockTraits','traits','traitsAny','tagsAny','triggerText','dischargeText','authoredEffect','authoredHook','minimumQuality','seasonKeys'].includes(part)))return;
      fields.push({path, value, label:path.join(' · ')});
    } else if (value && typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        if (['id','workbook','provisionalNotes','outputs','op'].includes(key)) continue;
        visit(child, [...path, Array.isArray(value) ? Number(key) : key]);
      }
    }
  };
  visit(def, []);
  return fields;
}

export function validateReviewValue(def, path, value) {
  if(!Array.isArray(path)||!path.length||path.some(part=>['__proto__','prototype','constructor'].includes(part)))throw new Error('This field is not editable.');
  if(equal(path,['stockTraits'])&&Array.isArray(def.stockTraits)) {
    if(!validSelection(value,REVIEW_STOCK_TRAITS))throw new Error('Choose Stock traits from the icon tray.');
    return;
  }
  if(equal(path,['activation'])&&def.mode==='scheduled') {
    if(!value||typeof value!=='object'||Array.isArray(value)||!REVIEW_SCHEDULE_TYPES.includes(value.type)
      ||(value.also!==undefined&&(!validSelection(value.also,REVIEW_SCHEDULE_TYPES)||value.also.includes(value.type)))
      ||(value.seasonKeys!==undefined&&(!validSelection(value.seasonKeys,REVIEW_SEASONS)||!value.seasonKeys.length))
      ||(value.stage!==undefined&&!['preRouting','postRouting'].includes(value.stage))
      ||Object.keys(value).some(key=>!['type','also','seasonKeys','stage'].includes(key)&&!equal(value[key],def.activation[key])))throw new Error('Choose valid schedule triggers from the icon tray.');
    return;
  }
  if(path[0]==='effects'&&Number.isInteger(path[1])&&path[2]==='seasonAmounts'&&typeof def.effects?.[path[1]]?.amount==='number') {
    if(path.length===3&&(value===null||(value&&typeof value==='object'&&!Array.isArray(value)&&Object.entries(value).every(([key,amount])=>REVIEW_SEASONS.includes(key)&&Number.isFinite(amount)))))return;
    if(path.length===4&&REVIEW_SEASONS.includes(path[3])&&Number.isFinite(value))return;
    throw new Error('Use valid seasons and finite amounts.');
  }
  const field = reviewFields(def).find(field => equal(field.path, path));
  if (!field || typeof field.value !== typeof value) throw new Error('This field is no longer available in this build.');
  if(path[0]==='minimumQuality'&&!['bronze','silver','gold','diamond'].includes(value))throw new Error('Choose bronze, silver, gold or diamond.');
  if(path.includes('seasonKeys')&&!['spring','summer','autumn','winter'].includes(value))throw new Error('Choose spring, summer, autumn or winter.');
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Enter a finite number.');
    const key = path.at(-1);
    if (['footprint','workerCapacity','workerCapacityPerQuality','threshold'].includes(key)
      && (!Number.isInteger(value) || value < (key === 'footprint' || key === 'threshold' ? 1 : 0)
        || (key === 'footprint' && value > 3) || (key.startsWith('workerCapacity') && value > 12))) {
      throw new Error('Use whole numbers: footprint 1–3, worker sockets 0–12, Charge threshold at least 1.');
    }
    if (['stockCapacity','gain'].includes(key) && value < 0) throw new Error('Use zero or a positive number.');
  }
}

export function validateReviewTarget(baseline, live, path) {
  for(let depth=1;depth<path.length;depth++) {
    const before=readReviewValue(baseline,path.slice(0,depth)), after=readReviewValue(live,path.slice(0,depth));
    if(!before||!after||typeof before!=='object')continue;
    for(const identity of ['op','kind','classId','traits']) {
      if(before[identity]!==undefined&&!equal(before[identity],after[identity]))throw new Error('This field now belongs to a different effect or input. Reset edits to review the current definition.');
    }
  }
}

export function projectReview(entry, live) {
  const definition = clone(live ?? entry.baseline), conflicts = [];
  for (const edit of entry.edits) {
    try {
      validateReviewTarget(entry.baseline, live ?? entry.baseline, edit.path);
      validateReviewValue(definition, edit.path, edit.value);
      writeReviewValue(definition,edit.path,edit.value);
    } catch { conflicts.push(edit.path.join(' · ')); }
  }
  if(entry.edits.some(edit=>edit.path[0]==='activation')&&!conflicts.some(path=>path.startsWith('activation'))) {
    definition.source={...definition.source,icon:definition.activation.type,cadence:reviewScheduleTriggers(definition).join(' / ')};
  }
  return {definition, conflicts};
}

// Snapshot proposals into a separate registry; browser storage never enters replay.
export function applyCardReviews(gamepieces, entries) {
  const result=clone(gamepieces), applied=[], issues=[];
  for(const entry of entries.filter(entry=>entry.edits.length)) {
    const registry=entry.kind==='practice'?'practices':'structures',live=gamepieces[registry]?.[entry.id];
    if(!live){issues.push(`${entry.id}: absent from this build`);continue;}
    const projected=projectReview(entry,live);
    if(projected.conflicts.length){issues.push(`${live.label}: ${projected.conflicts.join(', ')}`);continue;}
    result[registry][entry.id]=projected.definition;applied.push(reviewKey(entry.kind,entry.id));
  }
  return {gamepieces:result,applied,issues};
}

export function parseReviewDocument(raw) {
  if (!raw) return {schemaVersion:CARD_REVIEW_SCHEMA, cards:{}};
  const doc = JSON.parse(raw);
  if (doc.schemaVersion !== CARD_REVIEW_SCHEMA || !doc.cards || Array.isArray(doc.cards)) throw new Error('Unsupported card review data. Restore your saved reviews before editing.');
  for (const [key, entry] of Object.entries(doc.cards)) {
    if (!['practice','structure'].includes(entry.kind) || key !== reviewKey(entry.kind, entry.id)
      || !entry.baseline || !Array.isArray(entry.edits) || typeof entry.notes !== 'string') throw new Error('Saved card review data is damaged.');
    for (const edit of entry.edits) validateReviewValue(entry.baseline, edit.path, edit.value);
  }
  return doc;
}

export function exportReviewDocument(doc, resolveLive) {
  return {schemaVersion:CARD_REVIEW_SCHEMA, type:'card-review', exportedAt:new Date().toISOString(),
    cards:Object.values(doc.cards).map(entry => {
      const live = resolveLive(entry.kind, entry.id) ?? null;
      const {definition, conflicts} = projectReview(entry, live);
      return {...clone(entry), live:clone(live), modified:definition, conflicts,
        changes:entry.edits.map(edit => ({path:edit.path, original:readReviewValue(entry.baseline, edit.path), live:readReviewValue(live, edit.path) ?? null, proposed:edit.value}))};
    })};
}
