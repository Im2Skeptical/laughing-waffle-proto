import assert from 'node:assert/strict';
import { IDBFactory, IDBObjectStore } from 'fake-indexeddb';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createNewGameState } from '../src/model/new-game.js';
import { createTimelineFromInitialState } from '../src/model/timeline/index.js';
import { writeSaveToSlot, inspectSaveSlot, exportSave, readSaveSlot, listSaveSlotSummaries } from '../src/controllers/sim-runner/save-slots.js';
import { createSaveTestStorage } from './save-test-storage.mjs';
import { createSimRunner } from '../src/controllers/sim-runner.js';
import { createGameSessionController } from '../src/controllers/game-session-controller.js';
import { SAVE_DATABASE_NAME } from '../src/controllers/sim-runner/save-storage.js';

try {
  globalThis.indexedDB = new IDBFactory();
  const values = new Map([['other-site-data', 'x'.repeat(5 * 1024 * 1024)]]);
  globalThis.localStorage = {
    get length() { return values.size; },
    key: index => [...values.keys()][index] ?? null,
    getItem: key => values.get(key) ?? null,
    removeItem: key => values.delete(key),
    setItem() { throw new DOMException('Origin localStorage is full', 'QuotaExceededError'); },
  };
  const state = createNewGameState(735);
  // A valid envelope beyond localStorage's cap, with every checkpoint intact.
  state.storageTestPayload = 'x'.repeat(6 * 1024 * 1024);
  const timeline = createTimelineFromInitialState(state);
  const result = await writeSaveToSlot(1, { state, timeline, setupId: 'twoRegionStarter01' });
  assert.equal(result.ok, true, 'saving must succeed when localStorage is full');
  assert.equal((await inspectSaveSlot(1)).ok, true);
  assert.equal(values.has('civsurvivor.save.slot1'), false, 'new saves do not use localStorage');
  assert.ok(result.diagnostics.payloadCharacters > 5 * 1024 * 1024);
  const roundTrip = await readSaveSlot(1);
  assert.deepEqual(roundTrip.data.timeline, JSON.parse(exportSave({ state, timeline }).text).timeline);
  for (const slot of [2, 3]) assert.equal((await writeSaveToSlot(slot, { state, timeline })).ok, true);
  assert.equal((await listSaveSlotSummaries()).length, 3);
  assert.equal(values.get('other-site-data').length, 5 * 1024 * 1024, 'unrelated origin data is untouched');

  const originalPut = IDBObjectStore.prototype.put;
  try {
    IDBObjectStore.prototype.put = function (...args) {
      const request = originalPut.apply(this, args);
      if (this.name === 'saves') request.addEventListener('success', () => request.transaction.abort());
      return request;
    };
    const aborted = await writeSaveToSlot(1, { state: createNewGameState(321), timeline });
    assert.equal(aborted.ok, false, 'request success followed by transaction abort is not Saved');
    assert.equal(aborted.diagnostics.error.name, 'AbortError');
    assert.deepEqual((await readSaveSlot(1)).data, roundTrip.data, 'abort preserves the previous complete payload');
    assert.equal((await listSaveSlotSummaries()).find(slot => slot.slot === 1).meta.savedAt, result.meta.savedAt, 'summary rolls back atomically with payload');
  } finally { IDBObjectStore.prototype.put = originalPut; }

  // Transfer only compatible saves, delete only committed copies, never write
  // to localStorage, and never overwrite an already-existing IndexedDB save.
  const smallState = createNewGameState(735);
  const smallTimeline = createTimelineFromInitialState(smallState);
  const old = exportSave({ state: smallState, timeline: smallTimeline }).text;
  const newerState = createNewGameState(321);
  const newer = exportSave({ state: newerState, timeline: createTimelineFromInitialState(newerState) }).text;
  values.set('civsurvivor.save.slot1', old);
  values.set('civsurvivor.save.slot2', old);
  values.set('civsurvivor.save.slot3', '{broken');
  const database = createSaveTestStorage();
  try {
    await database.set(2, newer);
    database.fail(new DOMException('Transfer failed', 'QuotaExceededError'));
    await assert.rejects(listSaveSlotSummaries(), { name: 'QuotaExceededError' });
    assert.equal(values.get('civsurvivor.save.slot1'), old, 'failed transfer keeps source save');
    assert.equal(await database.get(1), null, 'failed transfer commits no partial save');
    database.fail(null);
    assert.equal((await listSaveSlotSummaries()).length, 2);
    assert.equal(await database.get(1), old);
    assert.equal(values.has('civsurvivor.save.slot1'), false, 'source removed only after commit');
    assert.equal(await database.get(2), newer, 'transfer cannot overwrite an IndexedDB save');
    assert.equal(values.get('civsurvivor.save.slot3'), '{broken', 'damaged source is left untouched');
    assert.equal(values.get('other-site-data').length, 5 * 1024 * 1024);

    // Simultaneous callers retain invocation order and snapshot before yielding.
    const first = writeSaveToSlot(1, { state: smallState, timeline: smallTimeline });
    const second = writeSaveToSlot(1, { state: newerState, timeline: createTimelineFromInitialState(newerState) });
    newerState.storageTestPayload = 'changed after calling save';
    assert.ok((await first).ok && (await second).ok);
    const latest = await readSaveSlot(1);
    assert.equal(latest.data.state.rng.baseSeed, 321);
    assert.equal(latest.data.state.storageTestPayload, undefined, 'snapshot is captured before async storage access');

    const runner = createSimRunner({});
    runner.init();
    const beforeLoad = JSON.stringify(runner.getState().rng);
    assert.equal((await runner.loadFromSlot(1, { isCurrent: () => false })).reason, 'cancelled');
    assert.equal(JSON.stringify(runner.getState().rng), beforeLoad, 'cancelled load cannot replace the live run');

    let announceSave;
    const session = createGameSessionController({ runner,
      onSaveStatusChange: () => { if (session.getSaveStatus().phase === 'saving') announceSave?.(); },
      opening: { prepare: async () => ({ ok: true, state: createNewGameState(735) }), reset() {} } });
    assert.equal((await session.newGame(3)).ok, true);
    const pending = session.save();
    assert.equal(session.getSaveStatus().phase, 'saving');
    assert.equal(session.getSaveStatus().canReplaceLiveGame, false);
    assert.equal(session.save(), pending, 'overlapping autosaves coalesce');
    assert.equal((await session.continueGame(1)).reason, 'unsavedLiveGame');
    assert.equal((await pending).ok, true);
    assert.equal(session.getSaveStatus().phase, 'saved');
    assert.equal(session.getSaveStatus().canReplaceLiveGame, true);
    const earlierWrite = session.save();
    runner.getState().storageTestPayload = 'progress captured by Save & menu';
    assert.equal(session.openMenu(), true);
    assert.equal(session.isInMenu(), true, 'menu pauses synchronously while persistence is pending');
    await earlierWrite;
    await session.save();
    assert.equal(JSON.parse(await database.get(3)).state.storageTestPayload, 'progress captured by Save & menu',
      'menu saves a fresh snapshot after the earlier autosave finishes');
    const abandonedWrite = session.save();
    assert.equal(session.enterDisposableState(createNewGameState(777)).ok, true);
    await abandonedWrite;
    assert.equal(session.getSaveStatus().phase, 'idle', 'completion from an old run cannot mark a disposable run Saved');
    assert.equal(session.getActiveSlot(), null);
    let entryCurrent = true;
    const saveStarted = new Promise(resolve => { announceSave = resolve; });
    const cancelledCreation = session.newGame(2, { isCurrent: () => entryCurrent });
    await saveStarted;
    assert.equal(session.getSaveStatus().phase, 'saving');
    entryCurrent = false;
    assert.equal((await cancelledCreation).reason, 'cancelled');
    assert.equal(session.isInMenu(), true, 'cancellation during the first async save leaves gameplay paused');
    assert.equal(session.canResume(), true, 'the created game remains available in memory');
  } finally { database.restore(); }

  globalThis.indexedDB = new IDBFactory();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true,
    get() { throw new DOMException('Local storage is blocked', 'SecurityError'); } });
  assert.equal((await writeSaveToSlot(1, { state: smallState, timeline: smallTimeline })).ok, true,
    'independent IndexedDB saving still works when localStorage is blocked');
  delete globalThis.localStorage;

  // Real blocked-open event (an older database connection holds an upgrade).
  const factory = new IDBFactory();
  const oldConnection = await new Promise((resolve, reject) => {
    const request = factory.open(SAVE_DATABASE_NAME, 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const originalOpen = factory.open.bind(factory);
  factory.open = (name, version) => originalOpen(name, version + 1);
  globalThis.indexedDB = factory;
  try {
    const blockedOpen = await writeSaveToSlot(1, { state: smallState, timeline: smallTimeline });
    assert.equal(blockedOpen.ok, false);
    assert.equal(blockedOpen.diagnostics.category, 'blocked');
    assert.equal(blockedOpen.diagnostics.error.name, 'StorageBlockedError');
  } finally { oldConnection.close(); }
  console.log('[save-indexeddb] OK');
} catch (error) {
  mkdirSync('artifacts', { recursive: true });
  const artifact = 'artifacts/save-indexeddb-test-failure.json';
  writeFileSync(artifact, JSON.stringify({ message: error.message, stack: error.stack, expected: error.expected, actual: error.actual }, null, 2));
  console.error(`[save-indexeddb] FAILED: ${error.message.split('\n')[0]}\nReproduce: node scripts/save-indexeddb-test.mjs\nDetails: ${artifact}`);
  process.exitCode = 1;
}
