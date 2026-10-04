// Tests exercise native-shaped IndexedDB requests/transactions, not a save mock.
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { openSaveDatabase, runSaveTransaction, SAVE_PAYLOAD_STORE, putSaveRecord } from '../src/controllers/sim-runner/save-storage.js';

export function createSaveTestStorage() {
  const priorFactory = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  globalThis.indexedDB = new IDBFactory();
  const originalPut = IDBObjectStore.prototype.put;
  let failure = null;
  IDBObjectStore.prototype.put = function (...args) {
    if (failure && this.name === SAVE_PAYLOAD_STORE) throw failure;
    return originalPut.apply(this, args);
  };
  return {
    fail(error) { failure = error; },
    async get(slot) {
      const db = await openSaveDatabase();
      return runSaveTransaction(db, [SAVE_PAYLOAD_STORE], 'readonly', (tx, setResult) => {
        const request = tx.objectStore(SAVE_PAYLOAD_STORE).get(slot);
        request.onsuccess = () => setResult(request.result?.text ?? null);
      });
    },
    async set(slot, text) {
      const db = await openSaveDatabase();
      let meta = null;
      try { meta = JSON.parse(text).meta ?? null; } catch {}
      return runSaveTransaction(db, ['saves', 'slots'], 'readwrite', tx => putSaveRecord(tx, slot, text, meta));
    },
    restore() {
      IDBObjectStore.prototype.put = originalPut;
      if (priorFactory) Object.defineProperty(globalThis, 'indexedDB', priorFactory);
      else delete globalThis.indexedDB;
    },
  };
}
