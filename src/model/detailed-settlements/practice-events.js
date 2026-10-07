// JSON event journal. Emitters never resolve reactions or call back into views.
export function practiceEventJournal(state) {
  return state.civilization.practiceEvents ??= { nextId: 1, pending: [], trace: [] };
}

export function emitPracticeEvent(state, event) {
  const journal = practiceEventJournal(state);
  const id = journal.nextId++;
  const entry = { ...event, id, rootId: journal.activeRoot ?? id,
    parentId: journal.activeEvent ?? null, tSec: state.tSec };
  journal.pending.push(entry);
  return entry;
}

// Fixed action costs: workers and output modifiers never multiply Chaos.
export function getActionChaosCost(action) {
  return (action?.effects ?? []).reduce((sum, effect) =>
    sum + (effect.op === 'addChaos' ? Math.max(0, effect.amount ?? 0) : 0), 0);
}

export function addActionChaos(state, amount, context = {}) {
  const cost = Math.max(0, amount);
  if (!cost) return;
  state.civilization.chaos.chaosPower = Math.round((state.civilization.chaos.chaosPower + cost) * 100) / 100;
  emitPracticeEvent(state, { ...context, kind: 'chaosIncreased', amount: cost });
}

export function tracePracticeEvent(state, entry) {
  const journal = practiceEventJournal(state);
  const record = { tSec: state.tSec, ...entry };
  journal.trace = [...journal.trace, record].slice(-100);
  const settlement = state.world.sites.find(s => s.regionId === entry.regionId)?.detailedState;
  if (settlement) settlement.practiceActivationTrace = [...(settlement.practiceActivationTrace ?? []), record].slice(-100);
}

export function withPracticeRoot(state, event, action) {
  const journal = practiceEventJournal(state);
  const root = emitPracticeEvent(state, event);
  const previousRoot = journal.activeRoot, previousEvent = journal.activeEvent;
  journal.activeRoot = root.rootId; journal.activeEvent = root.id;
  try { return action(root); }
  finally {
    if (previousRoot == null) delete journal.activeRoot; else journal.activeRoot = previousRoot;
    if (previousEvent == null) delete journal.activeEvent; else journal.activeEvent = previousEvent;
  }
}
