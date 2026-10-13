import { serializeGameState, deserializeGameState } from '../../../src/model/state.js';
import { advanceReplayStateOneSecond } from '../../../src/model/replay-second-runner.js';
import { undoVassalShopPurchase, reorderVassalShopPurchase, moveVassalShopStructure, rerollVassalShop } from '../../../src/model/vassal-life-map.js';
import { createOpeningExperiment, validateOpeningExperiment } from './experiment.js';
import { createOpeningSession, cloneOpeningSession, openingSummary, openingVassal, enterOpeningEncounter,
  getOpeningDecision, selectOpeningOption, stageOpeningOffer, commitOpeningEncounter, finishOpeningEncounter, chooseOpeningDevelopment, finishOpeningNote, resolveOpeningOptionOutcome } from './model.js';

export const OPENING_STORAGE_KEY = 'civsurvivor.prototype.warriorOpening.v1';
export function createOpeningController(storage = null) {
  let draft = createOpeningExperiment(), saved = null, message = '', busy = false, progress = 0;
  try {
    const raw = storage?.getItem(OPENING_STORAGE_KEY);
    if (raw) { draft = validateOpeningExperiment(JSON.parse(raw)); saved = structuredClone(draft); message = 'Loaded your saved experiment.'; }
  } catch { message = 'Saved draft could not be read. The built-in experiment is open.'; }
  let session = createOpeningSession(draft), checkpoints = [], listeners = new Set();
  let draftIssue = '', draftUndo = [], draftRedo = [];
  function checkDraft() {
    try { validateOpeningExperiment(draft); draftIssue = ''; }
    catch (error) { draftIssue = error.message; }
  }
  function editDraft(doc) {
    idle(); if (JSON.stringify(doc) === JSON.stringify(draft)) return;
    draftUndo.push(structuredClone(draft)); if (draftUndo.length > 80) draftUndo.shift();
    draftRedo = []; draft = structuredClone(doc); checkDraft();
    message = draftIssue ? 'Graph edits kept. Fix the highlighted issue before playing or saving.' : 'Draft updated. Restart to play these changes.';
    notify();
  }
  const notify = () => listeners.forEach(listener => listener());
  function idle() { if (busy) throw new Error('Wait for the current outcome to resolve.'); }
  function transact(operation) {
    idle(); const next = cloneOpeningSession(session); operation(next);
    deserializeGameState(serializeGameState(next.state)); session = next; notify();
  }
  const controller = {
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    getSnapshot() { return { draft: structuredClone(draft), experiment: session.experiment, summary: openingSummary(session),
      session, decision: getOpeningDecision(session), busy, progress, message, canRewind: checkpoints.length > 0,
      saved: !!saved, draftIssue, canUndoDraft: draftUndo.length > 0, canRedoDraft: draftRedo.length > 0,
      draftChanged: JSON.stringify(draft) !== JSON.stringify(session.experiment),
      development: openingVassal(session).developmentChoiceQueue[0] ?? null }; },
    getDecision(preview) { return getOpeningDecision(session, preview); },
    replaceDraft(doc) { idle(); editDraft(validateOpeningExperiment(doc)); },
    editDraft,
    undoDraft() { idle(); if (!draftUndo.length) return; draftRedo.push(structuredClone(draft)); draft = draftUndo.pop(); checkDraft(); message = 'Undid the draft edit.'; notify(); },
    redoDraft() { idle(); if (!draftRedo.length) return; draftUndo.push(structuredClone(draft)); draft = draftRedo.pop(); checkDraft(); message = 'Redid the draft edit.'; notify(); },
    save() { idle(); if (!storage) throw new Error('Browser storage is unavailable. Export the experiment instead.');
      validateOpeningExperiment(draft); storage.setItem(OPENING_STORAGE_KEY, JSON.stringify(draft)); saved = structuredClone(draft); message = 'Experiment saved in this browser.'; notify(); },
    load() { idle(); if (!saved) throw new Error('Save an experiment first.'); editDraft(saved); },
    resetDraft() { editDraft(createOpeningExperiment()); },
    restart() { idle(); const next = createOpeningSession(draft); session = next; checkpoints = []; message = 'Fresh opening, same seed. Choose an entry.'; notify(); },
    previewEncounter(id) {
      idle(); const next = createOpeningSession(draft);
      if (!draft.nodes.some(n => n.id === id)) throw new Error('Select a node to preview.');
      next.availableIds = [id]; const before = cloneOpeningSession(next); enterOpeningEncounter(next, id);
      session = next; checkpoints = [before]; message = 'Previewing this node in a fresh disposable opening.'; notify();
    },
    nextSeed() { idle(); validateOpeningExperiment(draft); editDraft({ ...draft, seed: (draft.seed + 1) >>> 0 }); controller.restart(); },
    enter(id) { idle(); const checkpoint = cloneOpeningSession(session), next = cloneOpeningSession(session);
      enterOpeningEncounter(next, id); deserializeGameState(serializeGameState(next.state));
      checkpoints.push(checkpoint); session = next; message = 'Choose an action or stage purchases.'; notify(); },
    rewind() { idle(); if (!checkpoints.length) return;
      session = cloneOpeningSession(checkpoints.pop()); message = 'Returned to the previous decision, including its RNG state.'; notify(); },
    select(id) { transact(next => selectOpeningOption(next, id)); },
    stage(id, origin, toIndex, replacePracticeId) { transact(next => stageOpeningOffer(next, id, origin, toIndex, replacePracticeId)); },
    undo(id) { transact(next => { const result = undoVassalShopPurchase(next.state, next.runtimeNodeId, id); if (!result.ok) throw new Error(result.reason); }); },
    reorder(id, toIndex) { transact(next => { const result = reorderVassalShopPurchase(next.state, next.runtimeNodeId, id, toIndex); if (!result.ok) throw new Error(result.reason); }); },
    move(id, origin) { transact(next => { const result = moveVassalShopStructure(next.state, next.runtimeNodeId, id, origin); if (!result.ok) throw new Error(result.reason); }); },
    reroll() { transact(next => {
      const spec = next.experiment.nodes.find(n => n.id === next.activeId);
      if (spec.cards) throw new Error('Edit curated offers in the draft, then Restart.');
      const result = rerollVassalShop(next.state, next.runtimeNodeId); if (!result.ok) throw new Error(result.reason);
    }); },
    develop(statId) { transact(next => chooseOpeningDevelopment(next, statId)); },
    async commit(optionId, destination, pass) {
      idle(); const next = cloneOpeningSession(session), before = openingSummary(next);
      if (next.experiment.nodes.find(n => n.id === next.activeId)?.kind === 'customNote') {
        finishOpeningNote(next); session = next; message = 'Note read. Continue to the next node.'; notify(); return;
      }
      const outcome = resolveOpeningOptionOutcome(next, optionId);
      if (outcome?.needsAcquisition) {
        session = next; message = `${next.randomOutcome.label}. Choose where to put the relic, then Confirm.`; notify(); return;
      }
      commitOpeningEncounter(next, outcome?.optionId ?? optionId, destination, pass);
      busy = true; progress = 0; message = 'Resolving the world through simulation ticks…'; notify();
      try {
        const vassal = openingVassal(next), target = vassal.lifeMap.pendingResolution?.resolveSec ?? next.state.tSec;
        const start = next.state.tSec; next.state.paused = false;
        while (next.state.tSec < target && !next.state.runStatus?.complete) {
          for (let step = 0; step < 8 && next.state.tSec < target && !next.state.runStatus?.complete; step++) {
            const result = advanceReplayStateOneSecond(next.state);
            if (!result.ok && !next.state.runStatus?.complete) throw new Error(result.reason);
          }
          progress = Math.round(100 * (next.state.tSec - start) / Math.max(1, target - start)); notify();
          await new Promise(resolve => setTimeout(resolve, 0));
        }
        finishOpeningEncounter(next, before);
        deserializeGameState(serializeGameState(next.state)); session = next;
        message = 'Outcome resolved. Compare the result, continue or rewind.';
      } finally { busy = false; progress = 0; notify(); }
    },
    exportDraft() { return JSON.stringify(draft, null, 2); },
  };
  return controller;
}
