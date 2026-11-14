import { openSaveDatabase, runSaveTransaction } from './sim-runner/save-storage.js';

export const OPENING_CHECKPOINT_KEY = 'opening-preparation-v1';

// One replaceable, atomic record, separate from all player slots. Structured
// clone preserves shared configs; no JSON expansion of every forecast anchor.
export function createOpeningCheckpointStore({ build, openDatabase = openSaveDatabase } = {}) {
  if (!build) return null; // Unstamped source pages cannot establish compatibility.
  return {
    async read(key) {
      const db = await openDatabase();
      return runSaveTransaction(db, ['settings'], 'readonly', (tx, done) => {
        const request = tx.objectStore('settings').get(OPENING_CHECKPOINT_KEY);
        request.onsuccess = () => {
          const record = request.result;
          done(record?.format === 1 && record.build === build && record.key === key ? record : null);
        };
      });
    },
    async write(key, checkpoint) {
      const db = await openDatabase();
      await runSaveTransaction(db, ['settings'], 'readwrite', tx => {
        tx.objectStore('settings').put({ ...checkpoint, format: 1, build, key }, OPENING_CHECKPOINT_KEY);
      });
    },
    async clear(key, owner) {
      const db = await openDatabase();
      await runSaveTransaction(db, ['settings'], 'readwrite', tx => {
        const store = tx.objectStore('settings');
        const request = store.get(OPENING_CHECKPOINT_KEY);
        request.onsuccess = () => {
          const record = request.result;
          if (record?.build === build && record.key === key && record.owner === owner) store.delete(OPENING_CHECKPOINT_KEY);
        };
      });
    },
  };
}
