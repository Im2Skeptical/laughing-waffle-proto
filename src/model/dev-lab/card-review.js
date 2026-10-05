// Review documents are independent of GameState and of runner/save schemas.
export const CARD_REVIEW_SCHEMA = 1;
const clone = value => JSON.parse(JSON.stringify(value));
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const reviewKey = (kind, id) => `${kind}:${id}`;
export const readReviewValue = (def, path) => path.reduce((value, part) => value?.[part], def);

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
      let target = definition;
      for (const part of edit.path.slice(0, -1)) target = target[part];
      target[edit.path.at(-1)] = clone(edit.value);
    } catch { conflicts.push(edit.path.join(' · ')); }
  }
  return {definition, conflicts};
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
