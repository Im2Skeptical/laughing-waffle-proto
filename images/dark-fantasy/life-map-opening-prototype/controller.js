import { serializeGameState, deserializeGameState } from '../../../src/model/state.js';
import { advanceReplayStateOneSecond } from '../../../src/model/replay-second-runner.js';
import { undoVassalShopPurchase } from '../../../src/model/vassal-life-map.js';
import { createOpeningExperiment, validateOpeningExperiment } from './experiment.js';
import { createOpeningSession, cloneOpeningSession, openingSummary, openingVassal, enterOpeningEncounter,
  getOpeningDecision, stageOpeningOffer, commitOpeningEncounter, finishOpeningEncounter, chooseOpeningDevelopment } from './model.js';

export const OPENING_STORAGE_KEY = 'civsurvivor.prototype.warriorOpening.v1';
export function createOpeningController(storage = null) {
  let draft = createOpeningExperiment(), saved = null, message = '', busy = false, progress = 0;
  try {
    const raw = storage?.getItem(OPENING_STORAGE_KEY);
    if (raw) { draft = validateOpeningExperiment(JSON.parse(raw)); saved = structuredClone(draft); message = 'Loaded your saved experiment.'; }
  } catch { message = 'Saved draft could not be read. The built-in experiment is open.'; }
  let session = createOpeningSession(draft), checkpoints = [], listeners = new Set();
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
      saved: !!saved, draftChanged: JSON.stringify(draft) !== JSON.stringify(session.experiment),
      development: openingVassal(session).developmentChoiceQueue[0] ?? null }; },
    replaceDraft(doc) { idle(); draft = validateOpeningExperiment(doc); message = 'Draft updated. Restart to play these changes.'; notify(); },
    save() { idle(); if (!storage) throw new Error('Browser storage is unavailable. Export the experiment instead.');
      storage.setItem(OPENING_STORAGE_KEY, JSON.stringify(draft)); saved = structuredClone(draft); message = 'Experiment saved in this browser.'; notify(); },
    load() { idle(); if (!saved) throw new Error('Save an experiment first.'); draft = structuredClone(saved); message = 'Saved draft loaded. Restart to play it.'; notify(); },
    resetDraft() { idle(); draft = createOpeningExperiment(); message = 'Built-in draft restored. Restart to play it.'; notify(); },
    restart() { idle(); const next = createOpeningSession(draft); session = next; checkpoints = []; message = 'Fresh opening, same seed. Choose an entry.'; notify(); },
    nextSeed() { idle(); draft.seed = (draft.seed + 1) >>> 0; controller.restart(); },
    enter(id) { idle(); const checkpoint = cloneOpeningSession(session), next = cloneOpeningSession(session);
      enterOpeningEncounter(next, id); deserializeGameState(serializeGameState(next.state));
      checkpoints.push(checkpoint); session = next; message = 'Choose an action or stage purchases.'; notify(); },
    rewind() { idle(); if (!checkpoints.length) return;
      session = cloneOpeningSession(checkpoints.pop()); message = 'Returned to the previous decision, including its RNG state.'; notify(); },
    stage(id) { transact(next => stageOpeningOffer(next, id)); },
    undo(id) { transact(next => { const result = undoVassalShopPurchase(next.state, next.runtimeNodeId, id); if (!result.ok) throw new Error(result.reason); }); },
    develop(statId) { transact(next => chooseOpeningDevelopment(next, statId)); },
    async commit(optionId, destination, pass) {
      idle(); const next = cloneOpeningSession(session), before = openingSummary(next);
      commitOpeningEncounter(next, optionId, destination, pass);
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
