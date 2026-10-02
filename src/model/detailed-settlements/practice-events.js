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
