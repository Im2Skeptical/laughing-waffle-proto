import assert from 'node:assert/strict';
import { createSaveTestStorage } from './save-test-storage.mjs';
import { createNewGameState } from '../src/model/new-game.js';
import { createTimelineFromInitialState } from '../src/model/timeline/index.js';
import { writeSaveToSlot, exportSave, inspectSaveText, importSaveToSlot, SAVE_SCHEMA_VERSION } from '../src/controllers/sim-runner/save-slots.js';
import { createSimRunner } from '../src/controllers/sim-runner.js';
import { createGameSessionController } from '../src/controllers/game-session-controller.js';
import { serializeGameState } from '../src/model/state.js';
import { inspectSaveStorageUsage } from '../src/controllers/sim-runner/save-diagnostics.js';
import { ActionKinds } from '../src/model/actions.js';
import { getVassalCandidatePool } from '../src/model/vassal-life-map.js';
import { mkdirSync, writeFileSync } from 'node:fs';

const priorStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const priorIndexedDB = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
let database;
try {
const state = createNewGameState(735);
const timeline = createTimelineFromInitialState(state);
Object.defineProperty(globalThis, 'indexedDB', { configurable: true,
  get() { throw new DOMException('Storage access denied', 'SecurityError'); } });
const blocked = await writeSaveToSlot(1, { state, timeline, setupId: 'twoRegionStarter01' });
assert.equal(blocked.ok, false);
assert.equal(blocked.diagnostics?.category, 'blocked', 'capture the actual failure rather than a generic unavailable-storage warning');
assert.equal(blocked.diagnostics?.error?.name, 'SecurityError');
delete globalThis.indexedDB;
const unavailable = await writeSaveToSlot(1, { state, timeline });
assert.equal(unavailable.diagnostics.category, 'unavailable');

const values = new Map();
let failure = null;
const storage = {
  get length() { return values.size; },
  key(index) { return [...values.keys()][index] ?? null; },
  getItem(key) { return values.get(key) ?? null; },
  setItem(key, value) { if (failure) throw failure; values.set(key, value); },
};
globalThis.localStorage = storage;
database = createSaveTestStorage();
const saved = await writeSaveToSlot(1, { state, timeline, setupId: 'twoRegionStarter01' });
assert.equal(saved.ok, true);
const original = await database.get(1);
assert.equal(JSON.parse(original).meta.schemaVersion, SAVE_SCHEMA_VERSION);
assert.equal(saved.diagnostics.payloadCharacters, original.length);
assert.equal(saved.diagnostics.estimatedUtf16Bytes, original.length * 2);
assert.equal(saved.diagnostics.payloadUtf8Bytes, null, 'successful autosaves avoid additional byte encoding');
assert.ok(saved.diagnostics.durationMs >= 0);

for (const [name, category] of [['QuotaExceededError', 'quota'], ['SecurityError', 'blocked'], ['Error', 'unknown']]) {
  failure = new DOMException('Write refused', name); database.fail(failure);
  const result = await writeSaveToSlot(1, { state, timeline });
  assert.equal(result.reason, 'storageFailed');
  assert.equal(result.diagnostics.category, category);
  assert.equal(result.diagnostics.error.name, name);
  assert.equal(result.diagnostics.stage, 'write');
  assert.ok(result.diagnostics.payloadUtf8Bytes > 0);
  assert.equal(await database.get(1), original, 'failed write preserves previous save');
}
failure = null; database?.fail(null);
const cycle = {}; cycle.self = cycle;
timeline.actions.push(cycle);
const badTimeline = await writeSaveToSlot(1, { state, timeline });
assert.equal(badTimeline.reason, 'serializationFailed');
assert.equal(badTimeline.diagnostics.category, 'serialization');
assert.equal(badTimeline.diagnostics.error.name, 'TypeError');
timeline.actions.pop();
state.probe = cycle;
assert.equal((await writeSaveToSlot(1, { state, timeline })).diagnostics.category, 'serialization', 'state serialization is inside the error boundary');
delete state.probe;

values.set('unrelated-private-key', 'PRIVATE-VALUE-SENTINEL');
const usage = await inspectSaveStorageUsage();
assert.equal(usage.entryCount, 1);
assert.equal(usage.localStorage.entryCount, 1);
assert.equal(usage.saveSlots.length, 1);
assert.equal(usage.estimatedUtf16Bytes, original.length * 2);
assert.ok(!JSON.stringify(usage).includes('PRIVATE-VALUE-SENTINEL'));
assert.ok(!JSON.stringify(usage).includes('unrelated-private-key'));
assert.equal(exportSave({ state, timeline }).ok, true);

const valid = inspectSaveText(original);
assert.equal(valid.ok, true);
assert.deepEqual(serializeGameState(valid.state), serializeGameState(state));
for (const text of ['{broken', 'null', JSON.stringify({ ...JSON.parse(original), meta: { schemaVersion: 1 } }),
  JSON.stringify({ ...JSON.parse(original), timeline: { ...JSON.parse(original).timeline, cursorSec: 99 } })]) {
  assert.equal((await importSaveToSlot(2, text)).ok, false);
  assert.equal(await database.get(2), null, 'invalid import cannot write a destination slot');
}
assert.equal((await importSaveToSlot(2, original)).ok, true);
assert.equal(await database.get(2), original, 'import preserves complete save contents');

const messages = [];
const runner = createSimRunner({});
const opening = { prepare: async () => ({ ok: true, state: createNewGameState(735) }), cancel() {}, reset() {} };
const session = createGameSessionController({ runner, opening, onError: message => messages.push(message) });
assert.equal((await session.newGame(1)).ok, true);
const pool = getVassalCandidatePool(runner.getState());
assert.equal(runner.dispatchActionAtCurrentSecond(ActionKinds.SETTLEMENT_SELECT_VASSAL,
  { candidateIndex: 0, expectedPoolHash: pool.expectedPoolHash }).ok, true);
runner.setTimeScaleTarget(1, { immediate: true, unpause: true });
for (let frame = 0; frame < 960; frame++) runner.update(1 / 60);
runner.setPaused(true); runner.update(1 / 60);
assert.ok(runner.getState().tSec >= 15);
assert.ok(runner.getTimeline().checkpoints.length > 1);
const previous = await database.get(1);
const beforeFailure = serializeGameState(runner.getState());
const lastSuccess = session.getSaveStatus().lastSuccessfulSave;
failure = new DOMException('Exceeded quota', 'QuotaExceededError'); database.fail(failure);
assert.equal((await session.save()).ok, false);
assert.equal(session.getSaveStatus().phase, 'failed');
assert.deepEqual(session.getSaveStatus().lastSuccessfulSave, lastSuccess);
assert.equal(session.openMenu(), true);
await session.save();
assert.equal(session.isInMenu(), true);
assert.equal(session.canResume(), true);
assert.equal((await session.newGame(2)).reason, 'unsavedLiveGame');
assert.equal((await session.continueGame(2)).reason, 'unsavedLiveGame');
assert.deepEqual(serializeGameState(runner.getState()), beforeFailure);
assert.equal(await database.get(1), previous);
const exported = session.exportCurrentGame();
assert.equal(exported.ok, true, 'live export does not need writable browser storage');
assert.deepEqual(JSON.parse(exported.text).timeline.checkpoints, runner.getTimeline().checkpoints);
assert.deepEqual(JSON.parse(exported.text).timeline.actions, JSON.parse(JSON.stringify(runner.getTimeline().actions)));
assert.equal(inspectSaveText(exported.text).ok, true);
assert.equal(session.getSaveStatus().phase, 'failed', 'export must not falsely mark the browser save successful');
const report = await session.getSaveDiagnostics();
assert.equal(report.lastFailure.error.name, 'QuotaExceededError');
assert.equal(report.lastFailure.category, 'quota');
assert.equal(report.lastFailure.storage.saveSlots.length, 2);
assert.ok(!JSON.stringify(report).includes('PRIVATE-VALUE-SENTINEL'));
assert.ok(messages.some(message => message.includes('storage limit')));
assert.equal(session.resume().ok, true);
assert.deepEqual(serializeGameState(runner.getState()), beforeFailure);
failure = null; database?.fail(null);
assert.equal((await session.save()).ok, true);
assert.equal(session.getSaveStatus().canReplaceLiveGame, true);
assert.equal((await session.getSaveDiagnostics()).lastFailure.error.name, 'QuotaExceededError', 'successful retry retains the previous failure for diagnosis');
assert.equal(session.prepareImport('{broken').ok, false);
assert.equal((await session.importGame(3)).reason, 'noImport');
assert.equal(session.prepareImport(exported.text).ok, true);
failure = new DOMException('Exceeded quota', 'QuotaExceededError'); database.fail(failure);
assert.equal((await session.importGame(3)).ok, false);
assert.equal(await database.get(3), null);
assert.deepEqual(serializeGameState(runner.getState()), beforeFailure);
failure = null; database?.fail(null);
assert.equal((await session.importGame(3)).ok, true);
assert.equal(session.getActiveSlot(), 3);
assert.deepEqual(serializeGameState(runner.getState()).world, beforeFailure.world, 'import restores progressed world state');
assert.deepEqual(serializeGameState(runner.getState()).civilization, beforeFailure.civilization, 'import restores recorded Vassal actions');
assert.deepEqual(serializeGameState(runner.getState()).rng, beforeFailure.rng, 'import preserves the RNG streams');
assert.equal(session.prepareImport(exported.text).ok, true);
session.cancelImport();
assert.equal((await session.importGame(2)).reason, 'noImport');

// Creation failure still exposes the fresh live game for retry and export.
const fresh = createGameSessionController({ runner, opening });
const previousSlot2 = await database.get(2);
failure = new DOMException('Exceeded quota', 'QuotaExceededError'); database.fail(failure);
assert.equal((await fresh.newGame(2)).ok, false);
assert.equal(fresh.canResume(), true);
assert.equal(fresh.isInMenu(), true);
assert.equal(fresh.exportCurrentGame().ok, true);
assert.equal(await database.get(2), previousSlot2);
failure = null; database?.fail(null);
assert.equal((await fresh.save()).ok, true);
assert.equal(fresh.resume().ok, true);
delete globalThis.localStorage;
console.log('[save-recovery] OK');
} catch (error) {
  mkdirSync('artifacts', { recursive: true });
  const artifact = 'artifacts/save-recovery-test-failure.json';
  writeFileSync(artifact, JSON.stringify({ message: error.message, stack: error.stack, expected: error.expected, actual: error.actual }, null, 2));
  console.error(`[save-recovery] FAILED: ${error.message.split('\n')[0]}\nReproduce: npm run test:save-recovery\nDetails: ${artifact}`);
  process.exitCode = 1;
} finally {
  database?.restore();
  if (priorIndexedDB) Object.defineProperty(globalThis, 'indexedDB', priorIndexedDB);
  else delete globalThis.indexedDB;
  if (priorStorage) Object.defineProperty(globalThis, 'localStorage', priorStorage);
  else delete globalThis.localStorage;
}
