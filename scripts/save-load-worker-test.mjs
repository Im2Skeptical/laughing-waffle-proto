import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { createNewGameState } from '../src/model/new-game.js';
import { serializeGameState, deserializeGameState } from '../src/model/state.js';
import { createTimelineFromInitialState } from '../src/model/timeline/index.js';
import { exportSave, inspectSaveText } from '../src/controllers/sim-runner/save-slots.js';
import { inspectSaveInWorker } from '../src/controllers/save-load-worker-service.js';
import { rebuildStateAtSecond } from '../src/model/timeline/index.js';
import { buildProjectionSummaryFromState } from '../src/model/projection-summary.js';
import { isDeepStrictEqual } from 'node:util';
import { ActionKinds } from '../src/model/actions.js';
import { prepareSaveHistorySummaries } from '../src/controllers/save-history-preparation.js';

// Execute the real module worker with only its browser message transport adapted.
const workerUrl = new URL('../src/controllers/save-load-worker.js', import.meta.url).href;
const progressEvents = [];
function createWorker({ onProgress = () => {} } = {}) {
  const thread = new Worker(`
    const { parentPort } = require('node:worker_threads');
    globalThis.postMessage = data => parentPort.postMessage(data);
    import(${JSON.stringify(workerUrl)}).then(() => {
      parentPort.on('message', data => globalThis.onmessage({ data }));
      parentPort.postMessage('ready');
    });
  `, { eval: true });
  const adapter = { postMessage: text => ready.then(() => thread.postMessage(text)),
    terminate: () => thread.terminate() };
  let resolveReady;
  const ready = new Promise(resolve => { resolveReady = resolve; });
  thread.on('message', data => {
    if (data === 'ready') { resolveReady(); return; }
    if (data?.kind === 'historyProgress') { progressEvents.push(data.coverageSec); onProgress(data.coverageSec); }
    adapter.onmessage?.({ data });
  });
  thread.on('error', error => adapter.onerror?.(error));
  return adapter;
}

const state = createNewGameState(735);
const timeline = createTimelineFromInitialState(state);
timeline.actions = [0, 2].map(tSec => ({ tSec,
  kind: ActionKinds.SETTLEMENT_REROLL_VASSALS, payload: {} }));
timeline.actions.push({ tSec: 3, kind: ActionKinds.SETTLEMENT_SELECT_VASSAL,
  payload: { candidateIndex: 1 } });
// Force the authoritative replay path rather than just deserializing second zero.
timeline.cursorSec = 260;
timeline.historyEndSec = 260;
const text = exportSave({ state, timeline, setupId: 'twoRegionStarter01' }).text;
const expected = inspectSaveText(text);
assert.equal(expected.ok, true);
const loadingProgress = [];
const actual = await inspectSaveInWorker(text, { createWorker, onProgress: progress => loadingProgress.push(progress) });
assert.equal(actual.ok, true);
assert.deepEqual(actual.meta, expected.meta);
assert.ok(isDeepStrictEqual(actual.nextTimeline, expected.nextTimeline),
  'history preparation must not mutate the authoritative loaded timeline');
assert.equal(actual.historySummaryBySecond.length, 261, 'prepare every historical second before drawing');
assert.deepEqual(progressEvents, [128, 256, 260], 'history progress spans multiple yielding slices');
assert.deepEqual([...new Set(loadingProgress.map(progress => progress.stage))], ['replay', 'history']);
assert.equal(loadingProgress.at(-1).completed, 260);
assert.equal(loadingProgress.at(-1).total, 260, 'loading UI gets the real historical target');
for (const [sec, summary] of actual.historySummaryBySecond) {
  const replay = rebuildStateAtSecond(expected.nextTimeline, sec);
  assert.ok(isDeepStrictEqual(summary, buildProjectionSummaryFromState(replay.state)),
    `loaded history summary ${sec} must match authoritative replay`);
}
assert.ok(!isDeepStrictEqual(actual.historySummaryBySecond,
  await prepareSaveHistorySummaries({ ...timeline, actions: timeline.actions.filter(action => action.tSec === 0) })),
  'the regression fixture must expose omitted historical actions');
assert.ok(isDeepStrictEqual(serializeGameState(deserializeGameState(actual.state)), serializeGameState(expected.state)),
  'worker load must preserve the entire replayed state and every RNG stream');
for (const invalid of ['{broken', JSON.stringify({ meta: { schemaVersion: 0 } }),
  JSON.stringify({ ...JSON.parse(text), timeline: { ...timeline, cursorSec: timeline.historyEndSec + 99 } })]) {
  assert.equal((await inspectSaveInWorker(invalid, { createWorker })).reason, inspectSaveText(invalid).reason);
}
assert.equal(await inspectSaveInWorker(text, { createWorker: () => null }), null, 'unsupported workers use the ordinary inspector');
assert.equal(await inspectSaveInWorker(text, { createWorker: () => { throw new Error('blocked'); } }), null);
let historyCurrent = true;
const cancelledHistory = await inspectSaveInWorker(text, {
  isCurrent: () => historyCurrent,
  createWorker: () => createWorker({ onProgress: () => { historyCurrent = false; } }),
});
assert.equal(cancelledHistory.reason, 'cancelled', 'cancelling a real history slice cannot publish a loaded game');
let current = true;
let terminated = false;
const pending = inspectSaveInWorker(text, { isCurrent: () => current,
  createWorker: () => ({ postMessage() {}, terminate() { terminated = true; } }) });
current = false;
assert.equal((await pending).reason, 'cancelled');
assert.equal(terminated, true, 'Back terminates pending replay');
// Finish reads isCurrent when the final message arrives. Flip the flag inside
// postMessage, then deliver success on the handler installed before postMessage.
// A second success must not publish or terminate again. No timer is involved.
let finishGateOpen = true;
let finishGateTerminates = 0;
const finishGatePayload = { ok: true };
const finishGateLate = { ok: true, late: true };
const finishGate = await inspectSaveInWorker(text, {
  isCurrent: () => finishGateOpen,
  createWorker: () => {
    const adapter = {
      postMessage() {
        finishGateOpen = false;
        adapter.onmessage({ data: finishGatePayload });
        adapter.onmessage({ data: finishGateLate });
      },
      terminate() { finishGateTerminates += 1; },
    };
    return adapter;
  },
});
assert.equal(finishGate.ok, false, 'finish-time cancellation must not publish a loaded game');
assert.equal(finishGate.reason, 'cancelled');
assert.equal(finishGateTerminates, 1, 'a late success after settle terminates the worker once');
assert.equal(finishGate.late, undefined, 'a late success must not replace the settled cancellation');
console.log('[save-load-worker] OK: exact replay, invalid saves, unavailable workers, cancellation');
