import { createDetailedPracticeSlot } from './detailed-practice-tiers.js';

// Draft order is tableau order. Remove upgrade targets before calculating
// survivors so a capacity push cannot invalidate an otherwise valid upgrade.
export function projectPracticeDraft(confirmed, purchases, order = null) {
  const incoming = [], consumed = new Set(), removed = new Set();
  for (const purchase of purchases) {
    const action = purchase.intervention;
    if (action?.kind !== 'practice') continue;
    const existing = confirmed.find(p => p?.practiceId === action.practiceId);
    if (consumed.has(action.practiceId)) return { ok: false, reason: 'duplicatePractice' };
    if (action.mode === 'learn' ? !!existing : !existing || existing.tier !== action.tier) return { ok: false, reason: 'practiceUnavailable' };
    consumed.add(action.practiceId);
    if (action.mode === 'remove') removed.add(action.practiceId);
    if (action.mode !== 'remove') incoming.push({...createDetailedPracticeSlot(action.practiceId, action.resultingTier), stock: existing?.stock ?? 0, charge: existing?.charge ?? 0, work: existing?.work ?? 0});
  }
  if (incoming.length > confirmed.length) return { ok: false, reason: 'practicePrefixFull' };
  // Preserve authored empty slots and the existing unshift mechanics. An
  // upgrade removes its old slot; deliberate removal leaves that slot empty.
  const survivors = confirmed.flatMap(p => p && consumed.has(p.practiceId)
    ? removed.has(p.practiceId) ? [null] : [] : [p]);
  let pool = [...incoming, ...survivors];
  if (order) {
    const remaining = new Map(pool.filter(Boolean).map(slot => [slot.practiceId, slot]));
    const ordered = [];
    for (const id of order) {
      if (id === null) ordered.push(null);
      else if (remaining.has(id)) { ordered.push(remaining.get(id)); remaining.delete(id); }
    }
    // Newly staged cards precede the retained draft; undone cards lose their
    // reservation and confirmed cards become available again automatically.
    pool = [...remaining.values(), ...ordered];
  }
  while (pool.length < confirmed.length) pool.push(null);
  for (const purchase of purchases) {
    if (order) break;
    if (purchase.intervention?.kind !== 'practice' || !Number.isInteger(purchase.tableauIndex)) continue;
    if (purchase.tableauIndex < 0 || purchase.tableauIndex >= confirmed.length) return {ok:false,reason:'invalidPurchaseOrder'};
    const from = pool.findIndex(slot=>slot?.practiceId===purchase.intervention.practiceId);
    if (from < 0) continue;
    const [slot]=pool.splice(from,1);
    pool.splice(purchase.tableauIndex,0,slot);
  }
  return { ok: true, slots: pool.slice(0, confirmed.length), displaced: pool.slice(confirmed.length).filter(Boolean), pool };
}
