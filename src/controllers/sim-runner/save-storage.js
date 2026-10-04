// Native IndexedDB owns save payloads and small slot summaries in one transaction.
// Local storage is read only for the one-time transfer of current-format saves.
export const SAVE_DATABASE_NAME = 'civilization-saves';
export const SAVE_DATABASE_VERSION = 1;
export const SAVE_PAYLOAD_STORE = 'saves';
export const SAVE_META_STORE = 'slots';
const TRANSFER_KEY = 'localStorageTransferComplete';
let cachedFactory = null;
let databasePromise = null;
let initializationPromise = null;
let transfer = null;

function storageError(message, name = 'StorageUnavailableError') {
  return new DOMException(message, name);
}

export function openSaveDatabase() {
  let factory;
  try { factory = globalThis.indexedDB; }
  catch (error) { return Promise.reject(error); }
  if (!factory) return Promise.reject(storageError('IndexedDB is unavailable.'));
  if (cachedFactory !== factory) {
    cachedFactory = factory; databasePromise = null; initializationPromise = null; transfer = null;
  }
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      let settled = false;
      const fail = error => { if (!settled) { settled = true; clearTimeout(timeout); reject(error); } };
      const timeout = setTimeout(() => fail(storageError('Opening browser storage timed out.')), 10000);
      let request;
      try { request = factory.open(SAVE_DATABASE_NAME, SAVE_DATABASE_VERSION); }
      catch (error) { fail(error); return; }
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore(SAVE_PAYLOAD_STORE, { keyPath: 'slot' });
        db.createObjectStore(SAVE_META_STORE, { keyPath: 'slot' });
        db.createObjectStore('settings');
      };
      request.onerror = () => fail(request.error);
      request.onblocked = () => fail(storageError('Another tab is blocking the save database. Close the other game tabs and retry.', 'StorageBlockedError'));
      request.onsuccess = () => {
        const db = request.result;
        if (settled) { db.close(); return; }
        settled = true; clearTimeout(timeout);
        db.onversionchange = () => { db.close(); databasePromise = null; initializationPromise = null; };
        db.onclose = () => { databasePromise = null; initializationPromise = null; };
        resolve(db);
      };
    }).catch(error => { databasePromise = null; throw error; });
  }
  return databasePromise;
}

// Request success is provisional: only transaction completion means committed.
export function runSaveTransaction(db, stores, mode, enqueue) {
  return new Promise((resolve, reject) => {
    let tx;
    let result;
    let failure = null;
    try {
      tx = db.transaction(stores, mode, { durability: mode === 'readwrite' ? 'strict' : 'default' });
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(failure ?? tx.error ?? storageError('Save transaction was aborted.', 'AbortError'));
      tx.onerror = event => { failure ??= event.target.error ?? tx.error; };
      enqueue(tx, value => { result = value; }, error => { failure = error; tx.abort(); });
    } catch (error) {
      failure = error;
      if (tx) { try { tx.abort(); } catch { reject(error); } }
      else reject(error);
    }
  });
}

export function putSaveRecord(tx, slot, text, meta) {
  tx.objectStore(SAVE_PAYLOAD_STORE).put({ slot, text });
  tx.objectStore(SAVE_META_STORE).put({ slot, meta, characters: text.length });
}

export async function initializeSaveStorage(inspectText) {
  const db = await openSaveDatabase();
  if (!initializationPromise) {
    initializationPromise = transferLocalSaves(db, inspectText).catch(error => {
      initializationPromise = null;
      transfer = { ...transfer, phase: 'failed', error: { name: error.name, message: String(error.message).slice(0, 500) } };
      throw error;
    });
  }
  await initializationPromise;
  return db;
}

async function transferLocalSaves(db, inspectText) {
  const done = await runSaveTransaction(db, ['settings'], 'readonly', (tx, setResult) => {
    const request = tx.objectStore('settings').get(TRANSFER_KEY);
    request.onsuccess = () => setResult(request.result === true);
  });
  transfer = { phase: done ? 'complete' : 'checking', movedSlots: [], rejectedSlots: [], error: null };
  if (done) return;
  let local;
  const candidates = [];
  try {
    local = globalThis.localStorage;
    if (!local) { transfer.phase = 'unavailable'; return; }
    for (let slot = 1; slot <= 3; slot++) {
      const text = local.getItem(`civsurvivor.save.slot${slot}`);
      if (text === null) continue;
      const inspected = inspectText(text);
      if (inspected.ok) candidates.push({ slot, text, meta: inspected.meta });
      else transfer.rejectedSlots.push({ slot, reason: inspected.reason });
    }
  } catch (error) {
    transfer.phase = 'unavailable';
    transfer.error = { name: error.name, message: String(error.message).slice(0, 500) };
    return; // Blocked localStorage must not prevent independent IndexedDB saves.
  }
  const moved = [];
  await runSaveTransaction(db, [SAVE_PAYLOAD_STORE, SAVE_META_STORE, 'settings'], 'readwrite', (tx, _setResult, fail) => {
    for (const candidate of candidates) {
      const request = tx.objectStore(SAVE_PAYLOAD_STORE).get(candidate.slot);
      request.onsuccess = () => {
        if (request.result) return; // Never replace a newer IndexedDB save.
        try {
          putSaveRecord(tx, candidate.slot, candidate.text, candidate.meta);
          moved.push(candidate);
        } catch (error) { fail(error); }
      };
    }
    tx.objectStore('settings').put(true, TRANSFER_KEY);
  });
  transfer.phase = 'complete';
  transfer.movedSlots = moved.map(({ slot }) => slot);
  // Remove only the exact payload that was copied, and only after commit.
  for (const candidate of moved) {
    try {
      const key = `civsurvivor.save.slot${candidate.slot}`;
      if (local.getItem(key) === candidate.text) local.removeItem(key);
    } catch (error) { transfer.error = { name: error.name, message: String(error.message).slice(0, 500) }; }
  }
}

export function getSaveStorageTransferStatus() { return transfer; }
