import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { createNewGameState } from '../src/model/new-game.js';
import { serializeGameState, deserializeGameState } from '../src/model/state.js';
import { createTimelineFromInitialState } from '../src/model/timeline/index.js';
import { exportSave, inspectSaveText } from '../src/controllers/sim-runner/save-slots.js';
import { inspectSaveInWorker } from '../src/controllers/save-load-worker-service.js';

// Execute the real module worker with only its browser message transport adapted.
const workerUrl = new URL('../src/controllers/save-load-worker.js', import.meta.url).href;
function createWorker() {
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
  thread.on('message', data => data === 'ready' ? resolveReady() : adapter.onmessage?.({ data }));
  thread.on('error', error => adapter.onerror?.(error));
  return adapter;
}

const state = createNewGameState(735);
const timeline = createTimelineFromInitialState(state);
// Force the authoritative replay path rather than just deserializing second zero.
timeline.cursorSec = 8;
timeline.historyEndSec = 8;
const text = exportSave({ state, timeline, setupId: 'twoRegionStarter01' }).text;
const expected = inspectSaveText(text);
assert.equal(expected.ok, true);
const actual = await inspectSaveInWorker(text, { createWorker });
assert.equal(actual.ok, true);
assert.deepEqual(actual.meta, expected.meta);
assert.deepEqual(actual.nextTimeline, expected.nextTimeline);
assert.deepEqual(serializeGameState(deserializeGameState(actual.state)), serializeGameState(expected.state),
  'worker load must preserve the entire replayed state and every RNG stream');
for (const invalid of ['{broken', JSON.stringify({ meta: { schemaVersion: 0 } }),
  JSON.stringify({ ...JSON.parse(text), timeline: { ...timeline, cursorSec: 99 } })]) {
  assert.equal((await inspectSaveInWorker(invalid, { createWorker })).reason, inspectSaveText(invalid).reason);
}
assert.equal(await inspectSaveInWorker(text, { createWorker: () => null }), null, 'unsupported workers use the ordinary inspector');
assert.equal(await inspectSaveInWorker(text, { createWorker: () => { throw new Error('blocked'); } }), null);
let current = true;
let terminated = false;
const pending = inspectSaveInWorker(text, { isCurrent: () => current,
  createWorker: () => ({ postMessage() {}, terminate() { terminated = true; } }) });
current = false;
assert.equal((await pending).reason, 'cancelled');
assert.equal(terminated, true, 'Back terminates pending replay');
console.log('[save-load-worker] OK: exact replay, invalid saves, unavailable workers, cancellation');
