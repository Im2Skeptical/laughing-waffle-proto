// Persistence diagnostics are runtime controller data, never part of GameState.
import { openSaveDatabase, runSaveTransaction, SAVE_META_STORE, getSaveStorageTransferStatus } from './save-storage.js';
export function accessSaveStorage() {
  try { return { storage: globalThis.localStorage ?? null, error: null }; }
  catch (error) { return { storage: null, error }; }
}

export function describeSaveError(error) {
  if (!error) return null;
  return { name: String(error.name ?? 'Error'), message: String(error.message ?? '').slice(0, 500),
    code: Number.isFinite(error.code) ? error.code : null };
}

export function saveFailureCategory(stage, error) {
  if (stage === 'serialize') return 'serialization';
  if (error?.name === 'SecurityError') return 'blocked';
  if (error?.name === 'StorageBlockedError') return 'blocked';
  if (error?.name === 'StorageUnavailableError') return 'unavailable';
  if (['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED'].includes(error?.name)
    || error?.code === 22 || error?.code === 1014) return 'quota';
  if (stage === 'access' && !error) return 'unavailable';
  return 'unknown';
}

function inspectLocalStorageUsage() {
  const { storage, error } = accessSaveStorage();
  const summary = { measuredAt: new Date().toISOString(), available: !!storage, characters: null,
    estimatedUtf16Bytes: null, entryCount: null, saveSlots: [], error: describeSaveError(error) };
  if (!storage) return summary;
  try {
    let characters = 0;
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (key === null) continue;
      const raw = storage.getItem(key) ?? '';
      characters += key.length + raw.length;
      const match = /^civsurvivor\.save\.slot([123])$/u.exec(key);
      if (match) summary.saveSlots.push({ slot: Number(match[1]), characters: raw.length,
        estimatedUtf16Bytes: raw.length * 2 });
    }
    summary.entryCount = storage.length;
    summary.characters = characters;
    summary.estimatedUtf16Bytes = characters * 2;
  } catch (failure) { summary.error = describeSaveError(failure); }
  return summary;
}

export async function inspectSaveStorageUsage() {
  const summary = { measuredAt: new Date().toISOString(), backend: 'indexedDB', available: false,
    characters: null, estimatedUtf16Bytes: null, entryCount: null, saveSlots: [], error: null,
    browserEstimate: null, localStorage: inspectLocalStorageUsage(), transfer: getSaveStorageTransferStatus() };
  try {
    const db = await openSaveDatabase();
    const slots = await runSaveTransaction(db, [SAVE_META_STORE], 'readonly', (tx, setResult) => {
      const request = tx.objectStore(SAVE_META_STORE).getAll();
      request.onsuccess = () => setResult(request.result);
    });
    summary.available = true;
    summary.saveSlots = slots.map(({ slot, characters }) => ({ slot, characters, estimatedUtf16Bytes: characters * 2 }));
    summary.entryCount = slots.length;
    summary.characters = slots.reduce((total, slot) => total + slot.characters, 0);
    summary.estimatedUtf16Bytes = summary.characters * 2;
  } catch (error) { summary.error = describeSaveError(error); }
  try {
    const estimate = await globalThis.navigator?.storage?.estimate?.();
    if (estimate) summary.browserEstimate = { usageBytes: estimate.usage ?? null, quotaBytes: estimate.quota ?? null };
  } catch (error) { summary.estimateError = describeSaveError(error); }
  return summary;
}

export function saveFailureExplanation(category) {
  return {
    quota: 'This site’s browser storage limit was reached.',
    blocked: 'Your browser blocked access to this site’s storage.',
    unavailable: 'Browser storage is unavailable.',
    serialization: 'The game could not prepare a save file.',
    unknown: 'The browser could not store your game.',
  }[category] ?? 'The browser could not store your game.';
}

export function saveFailureMessage(category) {
  return `Save failed. ${saveFailureExplanation(category)} Progress since your last save is unsaved. Keep this page open. Retry or export your current game.`;
}
