import { createDetailedPracticeSlot } from './detailed-practice-tiers.js';

// Draft order is tableau order. Remove upgrade targets before calculating
// survivors so a capacity push cannot invalidate an otherwise valid upgrade.
export function projectPracticeDraft(confirmed, purchases) {
  const incoming = [], consumed = new Set(), removed = new Set();
  for (const purchase of purchases) {
    const action = purchase.intervention;
    if (action?.kind !== 'practice') continue;
    const existing = confirmed.find(p => p?.practiceId === action.practiceId);
    if (consumed.has(action.practiceId)) return { ok: false, reason: 'duplicatePractice' };
    if (action.mode === 'learn' ? !!existing : !existing || existing.tier !== action.tier) return { ok: false, reason: 'practiceUnavailable' };
    consumed.add(action.practiceId);
    if (action.mode === 'remove') removed.add(action.practiceId);
    if (action.mode !== 'remove') incoming.push(createDetailedPracticeSlot(action.practiceId, action.resultingTier));
  }
  if (incoming.length > confirmed.length) return { ok: false, reason: 'practicePrefixFull' };
  // Preserve authored empty slots and the existing unshift mechanics. An
  // upgrade removes its old slot; deliberate removal leaves that slot empty.
  const survivors = confirmed.flatMap(p => p && consumed.has(p.practiceId)
    ? removed.has(p.practiceId) ? [null] : [] : [p]);
  const slots = [...incoming, ...survivors].slice(0, confirmed.length);
  while (slots.length < confirmed.length) slots.push(null);
  return { ok: true, slots, displaced: survivors.slice(confirmed.length - incoming.length).filter(Boolean) };
}
