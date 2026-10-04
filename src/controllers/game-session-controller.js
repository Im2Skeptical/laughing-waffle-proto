import { createNewGameState } from "../model/new-game.js";
import { importSaveToSlot, inspectSaveText, listSaveSlotSummaries, SAVE_SCHEMA_VERSION } from './sim-runner/save-slots.js';
import { inspectSaveStorageUsage, saveFailureExplanation, saveFailureMessage } from './sim-runner/save-diagnostics.js';

export function createGameSessionController({ runner, opening, onEnter, prepareEntry, onError, onSaved, onSaveStatusChange,
  getPresentationDiagnostics = () => [], getForecastDiagnostics = () => null }) {
  let activeSlot = null;
  let inMenu = true;
  let hasLiveGame = false;
  let phase = 'idle';
  let lastSuccessfulSave = null;
  let lastAttempt = null;
  let lastFailure = null;
  const recentSaveAttempts = [];
  let preparedImport = null;
  let pendingSave = null;
  let replacing = false;
  let runVersion = 0;
  let slotStatus = { phase: 'loading', error: null };
  let slotSummaries = [1, 2, 3].map(slot => ({ slot, available: false, empty: false, meta: null }));
  const notify = () => onSaveStatusChange?.();
  async function refreshSlots() {
    slotStatus = { phase: 'loading', error: null }; notify();
    try {
      const entries = await listSaveSlotSummaries();
      slotSummaries = [1, 2, 3].map(slot => {
        const entry = entries.find(candidate => candidate.slot === slot);
        return { slot, available: entry?.meta?.schemaVersion === SAVE_SCHEMA_VERSION,
          empty: !entry, meta: entry?.meta ?? null };
      });
      slotStatus = { phase: 'ready', error: null };
      return { ok: true };
    } catch (error) {
      slotStatus = { phase: 'failed', error: { name: error.name, message: String(error.message).slice(0, 500) } };
      return { ok: false, reason: 'storageFailed', error };
    } finally { notify(); }
  }
  async function record(result, slot, operation = 'save') {
    const diagnostics = result.diagnostics ?? { slot, operation, attemptedAt: new Date().toISOString(),
      category: 'unknown', error: result.error ? { name: result.error.name, message: result.error.message } : null };
    if (operation === 'save') {
      lastAttempt = { ...diagnostics, ok: result.ok, reason: result.reason ?? null };
      recentSaveAttempts.push(lastAttempt);
      if (recentSaveAttempts.length > 5) recentSaveAttempts.shift();
      phase = result.ok ? 'saved' : 'failed';
      if (result.ok) lastSuccessfulSave = { slot, savedAt: result.meta?.savedAt ?? diagnostics.attemptedAt,
        tSec: result.meta?.tSec ?? runner.getState?.()?.tSec ?? null };
    }
    if (!result.ok) lastFailure = { ...diagnostics, ok: false, reason: result.reason,
      storage: await inspectSaveStorageUsage() };
    else await refreshSlots();
    notify();
    if (result.ok && operation === 'save') onSaved?.();
    return result;
  }
  function canReplaceLiveGame() { return !replacing && !pendingSave && (!hasLiveGame || !['failed', 'saving'].includes(phase)); }
  function rejectUnsavedReplacement() {
    onError?.('Your current game has unsaved progress. Retry saving before replacing it, or export it and keep this page open.');
    return { ok: false, reason: 'unsavedLiveGame' };
  }
  function save() {
    if (activeSlot === null) return Promise.resolve({ ok: true });
    if (pendingSave) return pendingSave;
    phase = 'saving'; notify();
    const slot = activeSlot;
    const version = runVersion;
    pendingSave = (async () => {
      const stored = await runner.saveToSlot(slot);
      if (version !== runVersion) return stored;
      const result = await record(stored, slot);
      if (!result.ok) onError?.(saveFailureMessage(lastAttempt.category));
      return result;
    })().finally(() => { pendingSave = null; notify(); });
    return pendingSave;
  }
  function enter(slot, prepared = null, { deferResume = false } = {}) {
    runVersion++;
    hasLiveGame = true;
    activeSlot = slot;
    inMenu = deferResume;
    notify();
    onEnter?.(prepared);
    return { ok: true };
  }
  async function prepareAndEnter(slot, prepared, isCurrent) {
    // Initialise this run behind the menu; its ticker remains suspended until
    // presentation assets and the retained settlement scene are ready.
    enter(slot, prepared, { deferResume: true });
    const version = runVersion;
    await prepareEntry?.();
    if (!isCurrent() || version !== runVersion) return { ok: false, reason: 'cancelled' };
    inMenu = false;
    notify();
    return { ok: true };
  }
  async function continueGame(slot, { isCurrent = () => true } = {}) {
    if (!canReplaceLiveGame()) return rejectUnsavedReplacement();
    replacing = true; notify();
    const version = runVersion;
    let result;
    try { result = await runner.loadFromSlot(slot, { isCurrent: () => isCurrent() && version === runVersion }); }
    finally { replacing = false; notify(); }
    if (!result.ok) { if (result.reason !== 'cancelled') onError?.('This save could not be loaded.'); return result; }
    opening?.reset();
    phase = 'saved'; lastAttempt = null;
    lastSuccessfulSave = { slot, savedAt: result.meta?.savedAt ?? null, tSec: result.meta?.tSec ?? null };
    onSaved?.();
    return prepareEntry ? prepareAndEnter(slot, null, isCurrent) : enter(slot);
  }
  return {
    isInMenu: () => inMenu,
    canResume: () => hasLiveGame,
    getActiveSlot: () => activeSlot,
    getSaveStatus: () => ({ phase, activeSlot, lastSuccessfulSave, lastAttempt, canReplaceLiveGame: canReplaceLiveGame() }),
    getSaveDiagnostics: async () => ({ reportVersion: 2, generatedAt: new Date().toISOString(),
      status: { phase, activeSlot, lastSuccessfulSave }, lastAttempt, lastFailure, slots: slotStatus,
      recentSaveAttempts: recentSaveAttempts.map(attempt => ({ ...attempt })),
      nodeResolutions: getPresentationDiagnostics(),
      forecastWorker: getForecastDiagnostics(),
      storage: await inspectSaveStorageUsage() }),
    refreshSlots,
    getSlotStatus: () => slotStatus,
    exportCurrentGame() {
      if (!hasLiveGame) return { ok: false, reason: 'noLiveGame' };
      const result = runner.exportCurrentSave();
      if (!result.ok) onError?.('Could not export your game. The game could not prepare a save file. Keep this page open and download a diagnostic report.');
      return result;
    },
    prepareImport(text) {
      preparedImport = null;
      const result = inspectSaveText(text);
      if (!result.ok) {
        onError?.(result.reason === 'versionMismatch' ? 'This save file belongs to an incompatible game version.' : 'This save file is invalid or damaged. Your current game and saves are unchanged.');
        return result;
      }
      preparedImport = text;
      return { ok: true, meta: result.meta };
    },
    cancelImport() { preparedImport = null; },
    async importGame(slot, { isCurrent = () => true } = {}) {
      if (!canReplaceLiveGame()) return rejectUnsavedReplacement();
      if (preparedImport === null) return { ok: false, reason: 'noImport' };
      replacing = true; notify();
      let result;
      try { result = await record(await importSaveToSlot(slot, preparedImport), slot, 'import'); }
      finally { replacing = false; notify(); }
      if (!result.ok) {
        onError?.(`Import failed. ${saveFailureExplanation(result.diagnostics?.category)} Your file and existing saves are unchanged. Choose the slot again to retry.`);
        return result;
      }
      preparedImport = null;
      if (!isCurrent()) return { ok: false, reason: 'cancelled' };
      return continueGame(slot, { isCurrent });
    },
    slots: () => slotSummaries,
    prepareNewGame: () => opening?.prepare(),
    cancelPreparation: () => opening?.cancel(),
    getPreparationStatus: () => opening?.getSnapshot(),
    enterDisposableState(state) {
      opening?.reset();
      const result = runner.resetToState(state, 'developmentLab');
      if (!result.ok) return result;
      phase = 'idle'; lastSuccessfulSave = null; lastAttempt = null;
      onSaved?.();
      return enter(null);
    },
    async newGame(slot, { isCurrent = () => true } = {}) {
      if (!canReplaceLiveGame()) return rejectUnsavedReplacement();
      const prepared = opening ? await opening.prepare() : null;
      if (!isCurrent()) return { ok: false, reason: "cancelled" };
      if (prepared && !prepared.ok) {
        onError?.("Could not prepare your chronicle. Retry or return to the menu.");
        return prepared;
      }
      if (!canReplaceLiveGame()) return rejectUnsavedReplacement();
      // Entropy only chooses the seed; every world roll uses serialized state.rng.
      const initialState = prepared?.state ?? createNewGameState(globalThis.crypto.getRandomValues(new Uint32Array(1))[0]);
      activeSlot = null;
      hasLiveGame = false;
      const result = runner.resetToState(initialState, "twoRegionStarter01");
      if (!result.ok) return result;
      phase = 'idle'; lastSuccessfulSave = null; lastAttempt = null;
      const entry = prepareEntry ? await prepareAndEnter(slot, prepared, isCurrent) : enter(slot, prepared);
      if (!entry.ok) return entry;
      const saved = await save();
      if (!isCurrent()) {
        inMenu = true; notify();
        return { ok: false, reason: 'cancelled' };
      }
      if (!saved.ok) {
        inMenu = true; notify();
        return saved;
      }
      return { ok: true };
    },
    continueGame,
    openMenu() {
      // Recovery must remain reachable after a failed save. Continue resumes
      // the live run; replacement controls stay blocked until a save succeeds.
      inMenu = true;
      const previous = pendingSave;
      // Freeze presentation immediately; after an in-flight autosave, capture
      // the now-paused run again so Save & menu includes the latest progress.
      if (previous) void previous.then(() => save());
      else void save();
      return true;
    },
    resume() { opening?.cancel(); hasLiveGame = true; inMenu = false; return { ok: true }; },
    save,
  };
}
