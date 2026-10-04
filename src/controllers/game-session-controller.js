import { createNewGameState } from "../model/new-game.js";
import { importSaveToSlot, inspectSaveText } from './sim-runner/save-slots.js';
import { inspectSaveStorageUsage, saveFailureExplanation, saveFailureMessage } from './sim-runner/save-diagnostics.js';

export function createGameSessionController({ runner, opening, onEnter, onError, onSaved, onSaveStatusChange }) {
  let activeSlot = null;
  let inMenu = true;
  let hasLiveGame = false;
  let phase = 'idle';
  let lastSuccessfulSave = null;
  let lastAttempt = null;
  let lastFailure = null;
  let preparedImport = null;
  const notify = () => onSaveStatusChange?.();
  function record(result, slot, operation = 'save') {
    const diagnostics = result.diagnostics ?? { slot, operation, attemptedAt: new Date().toISOString(),
      category: 'unknown', error: result.error ? { name: result.error.name, message: result.error.message } : null };
    if (operation === 'save') {
      lastAttempt = { ...diagnostics, ok: result.ok, reason: result.reason ?? null };
      phase = result.ok ? 'saved' : 'failed';
      if (result.ok) lastSuccessfulSave = { slot, savedAt: result.meta?.savedAt ?? diagnostics.attemptedAt,
        tSec: result.meta?.tSec ?? runner.getState?.()?.tSec ?? null };
    }
    if (!result.ok) lastFailure = { ...diagnostics, ok: false, reason: result.reason,
      storage: inspectSaveStorageUsage() };
    notify();
    if (result.ok && operation === 'save') onSaved?.();
    return result;
  }
  function canReplaceLiveGame() { return !hasLiveGame || phase !== 'failed'; }
  function rejectUnsavedReplacement() {
    onError?.('Your current game has unsaved progress. Retry saving before replacing it, or export it and keep this page open.');
    return { ok: false, reason: 'unsavedLiveGame' };
  }
  function save() {
    if (activeSlot === null) return { ok: true };
    phase = 'saving'; notify();
    const result = record(runner.saveToSlot(activeSlot), activeSlot);
    if (!result.ok) onError?.(saveFailureMessage(lastAttempt.category));
    return result;
  }
  function enter(slot, prepared = null) {
    hasLiveGame = true;
    activeSlot = slot;
    inMenu = false;
    notify();
    onEnter?.(prepared);
    return { ok: true };
  }
  function continueGame(slot) {
    if (!canReplaceLiveGame()) return rejectUnsavedReplacement();
    opening?.reset();
    const result = runner.loadFromSlot(slot);
    if (!result.ok) { onError?.('This save could not be loaded.'); return result; }
    phase = 'saved'; lastAttempt = null;
    lastSuccessfulSave = { slot, savedAt: result.meta?.savedAt ?? null, tSec: result.meta?.tSec ?? null };
    onSaved?.();
    return enter(slot);
  }
  return {
    isInMenu: () => inMenu,
    canResume: () => hasLiveGame,
    getActiveSlot: () => activeSlot,
    getSaveStatus: () => ({ phase, activeSlot, lastSuccessfulSave, lastAttempt, canReplaceLiveGame: canReplaceLiveGame() }),
    getSaveDiagnostics: () => ({ reportVersion: 1, generatedAt: new Date().toISOString(),
      status: { phase, activeSlot, lastSuccessfulSave }, lastAttempt, lastFailure, storage: inspectSaveStorageUsage() }),
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
    importGame(slot) {
      if (!canReplaceLiveGame()) return rejectUnsavedReplacement();
      if (preparedImport === null) return { ok: false, reason: 'noImport' };
      const result = record(importSaveToSlot(slot, preparedImport), slot, 'import');
      if (!result.ok) {
        onError?.(`Import failed. ${saveFailureExplanation(result.diagnostics?.category)} Your file and existing saves are unchanged. Choose the slot again to retry.`);
        return result;
      }
      preparedImport = null;
      return continueGame(slot);
    },
    slots: () => [1, 2, 3].map((slot) => {
      const result = runner.inspectSaveSlot(slot);
      return { slot, available: result.ok, empty: result.reason === "emptySlot", meta: result.meta };
    }),
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
      enter(slot, prepared);
      const saved = save();
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
      save();
      inMenu = true;
      return true;
    },
    resume() { opening?.cancel(); hasLiveGame = true; inMenu = false; return { ok: true }; },
    save,
  };
}
