import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { IDBFactory } from 'fake-indexeddb';
import { createLoadingLifecycle } from '../src/controllers/loading-lifecycle.js';
import { createOpeningCheckpointStore, OPENING_CHECKPOINT_KEY } from '../src/controllers/opening-checkpoint-store.js';
import { createNewGameOpeningController } from '../src/controllers/new-game-opening-controller.js';
import { createTimegraphForecastWorkerService } from '../src/controllers/timegraph-forecast-worker-service.js';
import { createGameSessionController } from '../src/controllers/game-session-controller.js';
import { inspectSaveInWorker } from '../src/controllers/save-load-worker-service.js';
import { openSaveDatabase, runSaveTransaction } from '../src/controllers/sim-runner/save-storage.js';
import { createProjectionCache } from '../src/model/timegraph/projection-cache.js';
import { createNewGameState } from '../src/model/new-game.js';
import { serializeGameState } from '../src/model/state.js';
import { createEmptyTimelineFromBase, rebuildStateAtSecond } from '../src/model/timeline/index.js';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check) {
  for (let i = 0; i < 200; i++) { if (await check()) return; await delay(5); }
  throw new Error('checkpoint condition did not settle');
}
function activity() {
  const document = new EventTarget(), window = new EventTarget();
  document.hidden = false;
  let wall = 0;
  const lifecycle = createLoadingLifecycle({ document, window, now: () => wall });
  return { lifecycle, document, window,
    advance: ms => { wall += ms; },
    hide: () => { document.hidden = true; document.dispatchEvent(new Event('visibilitychange')); },
    show: () => { document.hidden = false; document.dispatchEvent(new Event('visibilitychange')); },
  };
}
globalThis.indexedDB = new IDBFactory();
const db = await openSaveDatabase();
await runSaveTransaction(db, ['saves', 'slots'], 'readwrite', tx => {
  tx.objectStore('saves').put({ slot: 1, text: 'existing-player-save' });
  tx.objectStore('slots').put({ slot: 1, meta: { sentinel: true } });
});
const checkpoints = createOpeningCheckpointStore({ build: 'build-a' });
const options = { checkpoints, checkpointIntervalMs: 0, getPreparationKey: () => 'regular',
  createState: () => createNewGameState(123), createCache: () => createProjectionCache(), searchLimitSec: 12 };
const boundaries = [];
let disposals = 0;
function worker() {
  const service = createTimegraphForecastWorkerService({ createWorker: () => { throw new Error('fixture local fallback'); },
    primeChunkSizeSec: 0, earlyStreamSliceSec: 1, streamSliceSec: 1 });
  return {
    requestCoverage(args) {
      boundaries.push(args.projectionCache.getForecastAsyncMeta().forecastAsyncEndSec);
      return service.requestCoverage(args);
    },
    dispose() { disposals++; service.dispose(); },
  };
}

// Suspend immediately, before the scheduled initialization has run.
const earlyActivity = activity();
const early = createNewGameOpeningController({ ...options, checkpoints: null,
  lifecycle: earlyActivity.lifecycle, createWorkerService: worker });
const earlyJob = early.prepare();
earlyActivity.hide();
await delay(10);
assert.equal(early.getSnapshot().coverageSec, 0);
earlyActivity.show();
assert.equal((await earlyJob).ok, true, 'initialization resumes if hidden before its first task');
early.cancel(); earlyActivity.lifecycle.dispose();

// A minute away preserves accepted coverage and the original world/RNG.
const a = activity();
const opening = createNewGameOpeningController({ ...options, lifecycle: a.lifecycle, createWorkerService: worker });
let suspended = false;
const pending = opening.prepare({ onProgress: p => {
  a.advance(50);
  if (!suspended && p.completed >= 3) { suspended = true; a.hide(); }
} });
await until(async () => (await checkpoints.read('regular'))?.forecast.endSec >= 3);
const held = opening.getSnapshot().coverageSec;
const disposedAt = disposals;
a.advance(60000);
await delay(40);
assert.equal(opening.getSnapshot().coverageSec, held, 'no background simulation ticks');
assert.equal(disposals, disposedAt, 'worker is released once on suspension');
const beforeResume = boundaries.length;
a.show();
assert.equal((await pending).ok, true, 'a minute hidden does not exhaust the 30-second active timeout');
assert.equal(boundaries[beforeResume], held, 'resumed worker starts at accepted coverage');
opening.cancel(); a.lifecycle.dispose();

// Reload into a completely new controller using the persisted partial forecast.
const b = activity();
const interrupted = createNewGameOpeningController({ ...options, lifecycle: b.lifecycle, createWorkerService: worker });
const interruptedJob = interrupted.prepare();
const ready = await interruptedJob;
assert(ready.ok);
await interrupted.clearCheckpoint();
interrupted.cancel(); b.lifecycle.dispose();

const c = activity();
const partial = createNewGameOpeningController({ ...options, lifecycle: c.lifecycle, createWorkerService: worker });
let stopped = false;
const partialJob = partial.prepare({ onProgress: p => { if (!stopped && p.completed >= 4) { stopped = true; c.hide(); } } });
await until(async () => (await checkpoints.read('regular'))?.forecast.endSec >= 4);
const record = await checkpoints.read('regular');
partial.cancel(); await partialJob; c.lifecycle.dispose();
const resumeBoundary = boundaries.length;
let freshWorlds = 0;
const recovered = createNewGameOpeningController({ ...options, createWorkerService: worker,
  createState: () => { freshWorlds++; return createNewGameState(999); } });
const result = await recovered.prepare();
assert(result.ok);
assert.equal(freshWorlds, 0, 'reload must not roll a new world');
assert.equal(boundaries[resumeBoundary], record.forecast.endSec, 'reload continues from disk coverage');
assert(isDeepStrictEqual(serializeGameState(result.state), record.stateData), 'initial world and RNG survive reload');
assert(isDeepStrictEqual(result.forecast.summaryBySecond, ready.forecast.summaryBySecond), 'every-second summaries match uninterrupted work');
const replay = rebuildStateAtSecond(createEmptyTimelineFromBase(result.state), 12).state;
assert(isDeepStrictEqual(result.forecast.lastStateData, serializeGameState(replay)), 'recovered tail exactly matches authoritative replay');

// Scene installation releases runtime preparation, but the checkpoint must
// survive artwork/save failure and disappear only after a successful save.
let saveOk = false;
const session = createGameSessionController({ opening: recovered,
  runner: { resetToState: () => ({ ok: true }), saveToSlot: async () => saveOk ? { ok: true }
    : { ok: false, reason: 'storageFailed', diagnostics: { category: 'quota' } } },
  onEnter: () => recovered.reset(), prepareEntry: async () => {},
});
assert.equal((await session.newGame(2)).ok, false);
assert(await checkpoints.read('regular'), 'failed first save retains recovery after scene installation');
saveOk = true;
assert.equal((await session.save()).ok, true);
assert.equal(await checkpoints.read('regular'), null, 'successful entry/save clears the checkpoint');
const untouched = await runSaveTransaction(db, ['saves'], 'readonly', (tx, done) => {
  const request = tx.objectStore('saves').get(1); request.onsuccess = () => done(request.result.text);
});
assert.equal(untouched, 'existing-player-save', 'checkpoint writes never touch player slots');

// Atomic replacement, build/settings invalidation, malformed data and denied storage.
await checkpoints.write('regular', record);
await assert.rejects(runSaveTransaction(db, ['settings'], 'readwrite', tx => {
  tx.objectStore('settings').put({ ...record, forecast: { ...record.forecast, endSec: 999 } }, OPENING_CHECKPOINT_KEY);
  tx.abort();
}), /abort/i);
assert.equal((await checkpoints.read('regular')).forecast.endSec, record.forecast.endSec, 'aborted writes retain the last committed checkpoint');
assert.equal(await createOpeningCheckpointStore({ build: 'build-b' }).read('regular'), null);
assert.equal(await checkpoints.read('edited-profile'), null);
await checkpoints.clear('regular', 'another-owner');
assert(await checkpoints.read('regular'), 'old cleanup cannot delete another preparation');
await runSaveTransaction(db, ['settings'], 'readwrite', tx => {
  tx.objectStore('settings').put({ ...record, format: 1, build: 'build-a', key: 'regular', forecast: { endSec: 4 } }, OPENING_CHECKPOINT_KEY);
});
let replacements = 0;
const corrupt = createNewGameOpeningController({ ...options, createWorkerService: worker,
  createState: () => { replacements++; return createNewGameState(123); } });
assert((await corrupt.prepare()).ok);
assert.equal(replacements, 1, 'damaged derivative is discarded and rebuilt');
corrupt.cancel({ discard: true });
await until(async () => await checkpoints.read('regular') === null);
const denied = createNewGameOpeningController({ ...options, createWorkerService: worker,
  checkpoints: { read: async () => { throw new Error('denied'); }, write: async () => { throw new Error('quota'); } } });
assert((await denied.prepare()).ok, 'unavailable checkpoint storage cannot block gameplay'); denied.cancel();
const quota = createNewGameOpeningController({ ...options, createWorkerService: worker,
  checkpoints: { read: async () => null, write: async () => { throw new Error('quota'); } } });
assert((await quota.prepare()).ok, 'checkpoint write failure cannot fail loading'); quota.cancel();

// Actual silence in the foreground remains an error.
const silentActivity = activity();
let polls = 0;
const silent = createNewGameOpeningController({ ...options, checkpoints: null, lifecycle: silentActivity.lifecycle,
  createWorkerService: () => ({ requestCoverage: () => { polls++; silentActivity.advance(31000); return { ok: true, coverageEndSec: 0, pending: true }; }, dispose() {} }) });
assert.equal((await silent.prepare()).reason, 'forecastIncomplete');
assert.equal(polls, 1); silent.cancel(); silentActivity.lifecycle.dispose();

const loadActivity = activity();
const saveWorker = { postMessage() {}, terminate() {} };
const savedLoad = inspectSaveInWorker('fixture', { lifecycle: loadActivity.lifecycle,
  progressTimeoutMs: 20, createWorker: () => saveWorker });
loadActivity.hide(); loadActivity.advance(60000);
await delay(40);
loadActivity.show();
saveWorker.onmessage({ data: { ok: true } });
assert.equal((await savedLoad).ok, true, 'save-loading deadlines also exclude background suspension');
loadActivity.lifecycle.dispose();
const silentLoad = inspectSaveInWorker('fixture', { progressTimeoutMs: 10,
  createWorker: () => ({ postMessage() {}, terminate() {} }) });
assert.equal((await silentLoad).reason, 'loadTimeout', 'save-loading foreground silence remains bounded');
db.close();
console.log('[loading-checkpoint] PASS suspend/resume, reload/replay equality, atomic isolated storage, stale/corrupt/quota recovery, active timeout');
