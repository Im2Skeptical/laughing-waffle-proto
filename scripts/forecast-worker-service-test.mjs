import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { Worker } from 'node:worker_threads';
import { advanceReplayStateOneSecond } from '../src/model/replay-second-runner.js';
import { canonicalizeSnapshot } from '../src/model/canonicalize.js';
import { deserializeGameState } from '../src/model/state.js';
import { createTimegraphForecastWorkerService } from '../src/controllers/timegraph-forecast-worker-service.js';
import { createProjectionCache } from '../src/model/timegraph/projection-cache.js';
import { createNewGameState } from '../src/model/new-game.js';
import { createEmptyTimelineFromBase } from '../src/model/timeline/index.js';
import { serializeGameState } from '../src/model/state.js';
import { buildProjectionChunkFromStateData } from '../src/model/projection-chunk.js';
import { createForecastChunkConfigReceiver, createForecastChunkConfigSender, encodeForecastChunk } from '../src/model/timegraph/forecast-wire.js';

function fixture() {
  const state = createNewGameState(99117);
  const base = serializeGameState(state);
  const timeline = createEmptyTimelineFromBase(state);
  const cache = createProjectionCache();
  let clockMs = 0, terminated = 0;
  const tasks = new Map(); let nextTask = 1;
  const listeners = new Map(), messages = [];
  const worker = {
    addEventListener: (kind, listener) => listeners.set(kind, listener),
    removeEventListener: kind => listeners.delete(kind),
    postMessage: message => messages.push(message),
    terminate: () => terminated++,
  };
  const service = createTimegraphForecastWorkerService({
    createWorker: () => worker, timeNowMs: () => clockMs, primeChunkSizeSec: 0,
    earlyChunkWindowSec: 0, streamSliceSec: 2, chunkSizeSec: 20,
    scheduleTask: callback => { const id = nextTask++; tasks.set(id, callback); return id; },
    cancelTask: id => tasks.delete(id),
  });
  const request = (desiredEndSec = 20) => service.requestCoverage({
    projectionCache: cache, timeline, timelineToken: cache.getTimelineToken(timeline),
    historyEndSec: 0, stepSec: 1, desiredEndSec, boundaryStateData: base,
  });
  return { base, cache, service, request, messages, listeners,
    at: ms => clockMs = ms, terminated: () => terminated,
    flushTasks: () => { const queued = [...tasks.values()]; tasks.clear(); queued.forEach(callback => callback()); } };
}

const slow = fixture();
slow.request();
slow.at(900);
assert.equal(slow.request().coverageEndSec, 1, 'slow startup must remain off the main thread after its initial seed');
slow.flushTasks();
assert.equal(slow.terminated(), 0, '900ms is inside the 5s startup grace, so a queued first-result watchdog must not fire');
assert.equal(slow.terminated(), 0, 'a healthy worker loading on a slow CPU must survive the 750ms progress timeout');
const job = slow.messages[0];
const result = buildProjectionChunkFromStateData(slow.cache.getStateData(1), 1, 2);
slow.at(1000);
slow.listeners.get('message')({ data: { ...job, kind: 'chunkResult', baseSec: 1, endSec: 2, done: false, result } });
assert.equal(slow.cache.getForecastAsyncMeta().forecastAsyncEndSec, 2);
slow.at(1600);
slow.request();
assert.equal(slow.terminated(), 0);
slow.at(1800);
slow.request();
assert.equal(slow.terminated(), 0, 'a delayed UI read must let queued worker messages run before declaring a stall');
const nextResult = buildProjectionChunkFromStateData(slow.cache.getStateData(2), 2, 3);
slow.listeners.get('message')({ data: { ...job, kind: 'chunkResult', baseSec: 2, endSec: 3, done: false, result: nextResult } });
slow.flushTasks();
assert.equal(slow.terminated(), 0, 'progress queued behind a busy UI must cancel the watchdog check');
slow.at(2600);
slow.request();
slow.flushTasks();
assert.equal(slow.terminated(), 1, 'a genuinely silent worker still has a bounded deadline');
assert.equal(slow.request().coverageEndSec, 3, 'the first timeout retries in the background without simulating on the input thread');
slow.at(12601);
slow.request();
slow.flushTasks();
assert.equal(slow.terminated(), 2, 'a silent retry cannot wait indefinitely');
assert.equal(slow.request().reason, 'localFallback');
assert.deepEqual(slow.cache.getStateData(5), buildProjectionChunkFromStateData(slow.base, 0, 5).lastStateData,
  'fallback continues from accepted worker progress with identical state and RNG');
slow.service.dispose();

const continued = fixture();
continued.request();
const fullChunk = buildProjectionChunkFromStateData(continued.cache.getStateData(1), 1, 20);
continued.at(1000);
continued.listeners.get('message')({ data: { ...continued.messages[0], kind: 'chunkResult',
  baseSec: 1, endSec: 20, done: true, result: structuredClone(encodeForecastChunk(fullChunk)) } });
assert.ok(Object.isFrozen(continued.cache.getStateData(20).gameConfig.settings.values),
  'the real handler restores frozen config ownership after structured clone');
continued.request(40);
continued.at(1900);
assert.equal(continued.request(40).coverageEndSec, 20,
  'each new chunk needs startup grace to deserialize its boundary state on a slow CPU');
continued.flushTasks();
assert.equal(continued.terminated(), 0, '900ms into a new chunk is still startup grace, not a stall');
continued.service.dispose();

// Real worker wire: the shared config arrives once, later chunks refer to it,
// and every merged anchor references one frozen config value.
const shared = fixture();
shared.request(40);
const send = createForecastChunkConfigSender();
const firstShared = buildProjectionChunkFromStateData(shared.cache.getStateData(1), 1, 10);
const secondShared = buildProjectionChunkFromStateData(firstShared.lastStateData, 10, 20);
const firstWire = send(firstShared), secondWire = send(secondShared);
assert.ok(firstWire.sharedConfig.config && secondWire.sharedConfig.config === null);
shared.listeners.get('message')({ data: { ...shared.messages[0], kind: 'chunkResult',
  baseSec: 1, endSec: 10, done: false, result: structuredClone(firstWire) } });
shared.listeners.get('message')({ data: { ...shared.messages[0], kind: 'chunkResult',
  baseSec: 10, endSec: 20, done: true, result: structuredClone(secondWire) } });
assert.equal(shared.cache.getForecastAsyncMeta().forecastAsyncEndSec, 20);
assert.equal(shared.cache.getStateData(10).gameConfig, shared.cache.getStateData(20).gameConfig,
  'anchors from different chunks share one interned config');
assert.ok(Object.isFrozen(shared.cache.getStateData(20).gameConfig.settings.values));
assert.equal(JSON.stringify(shared.cache.getStateData(20)), JSON.stringify(secondShared.lastStateData),
  'reattached snapshots are byte-identical to the worker snapshots');
// A replacement worker numbers configs again; an id never received is rejected.
shared.service.handleTimelineInvalidation();
shared.request(40);
const orphanWire = send(buildProjectionChunkFromStateData(secondShared.lastStateData, 20, 22));
assert.equal(orphanWire.sharedConfig.config, null);
shared.listeners.get('message')({ data: { ...shared.messages.at(-1), kind: 'chunkResult',
  baseSec: 20, endSec: 22, done: true, result: structuredClone(orphanWire) } });
assert.equal(shared.cache.getStateData(22), null, 'chunks without a known config never merge');
shared.service.dispose();

// A completed job immediately continues while its caller is still polling,
// instead of idling the worker until the next poll; stale callers and edited
// timelines never receive automatic continuations.
const eager = fixture();
eager.request(60);
const eagerJob = eager.messages[0];
const eagerChunk = buildProjectionChunkFromStateData(eager.cache.getStateData(1), 1, 20);
eager.at(100);
eager.listeners.get('message')({ data: { ...eagerJob, kind: 'chunkResult', baseSec: 1, endSec: 20, done: true, result: eagerChunk } });
assert.equal(eager.messages.length, 2, 'next chunk dispatched on completion');
assert.equal(eager.messages[1].baseSec, 20);
assert.equal(eager.messages[1].endSec, 40);
assert.equal(JSON.stringify(eager.messages[1].boundaryStateData), JSON.stringify(eagerChunk.lastStateData),
  'continuation starts from the accepted tail anchor');
eager.at(1000);
const eagerSecond = buildProjectionChunkFromStateData(eagerChunk.lastStateData, 20, 40);
eager.listeners.get('message')({ data: { ...eager.messages[1], kind: 'chunkResult', baseSec: 20, endSec: 40, done: true, result: eagerSecond } });
assert.equal(eager.messages.length, 2, 'no automatic continuation once the caller stopped polling');
eager.request(60);
assert.equal(eager.messages.length, 3, 'the regular poll still dispatches');
eager.service.handleTimelineInvalidation();
eager.listeners.get('message')?.({ data: { ...eager.messages[2], kind: 'chunkResult', baseSec: 40, endSec: 60, done: true,
  result: buildProjectionChunkFromStateData(eagerSecond.lastStateData, 40, 60) } });
assert.equal(eager.messages.length, 3, 'edits never continue an obsolete job');
eager.service.dispose();

// Run the real worker script in a worker thread: MessageChannel-yielded
// slices, config sent once, every received snapshot identical to replay.
{
  const workerUrl = new URL('../src/controllers/timegraph-forecast-worker.js', import.meta.url).href;
  const thread = new Worker(`const { parentPort, workerData } = require('node:worker_threads');
    const queued = []; let loaded = false;
    globalThis.postMessage = message => parentPort.postMessage(message);
    parentPort.on('message', data => loaded ? globalThis.onmessage({ data }) : queued.push(data));
    import(workerData.url).then(() => { loaded = true; for (const data of queued) globalThis.onmessage({ data }); });`,
  { eval: true, workerData: { url: workerUrl } });
  const state = createNewGameState(99117);
  state.paused = false;
  const base = serializeGameState(state);
  const replies = await new Promise((resolve, reject) => {
    const received = [];
    thread.on('error', reject);
    thread.on('message', message => { received.push(message); if (message.done) resolve(received); });
    thread.postMessage({ kind: 'buildChunk', requestId: 1, requestKey: 'k', timelineToken: 't', historyEndSec: 0,
      baseSec: 0, endSec: 120, stepSec: 1, streamSliceSec: 30, boundaryStateData: base, scheduledActionsBySecond: [] });
  });
  await thread.terminate();
  assert.equal(replies.length, 4, 'four yielded 30 s slices');
  assert.ok(replies[0].result.sharedConfig.config && replies.slice(1).every(reply => reply.result.sharedConfig.config === null));
  const receiver = createForecastChunkConfigReceiver();
  const snapshots = new Map();
  for (const reply of replies) {
    assert.equal(receiver.restore(reply.result), true);
    for (const [sec, data] of reply.result.stateDataBySecond) snapshots.set(sec, data);
    snapshots.set(reply.endSec, reply.result.lastStateData);
  }
  const official = deserializeGameState(base);
  canonicalizeSnapshot(official);
  for (let sec = 1; sec <= 120; sec++) {
    advanceReplayStateOneSecond(official);
    canonicalizeSnapshot(official);
    if (snapshots.has(sec)) assert.equal(JSON.stringify(snapshots.get(sec)), JSON.stringify(serializeGameState(official)), `worker snapshot ${sec}`);
  }
}

const silent = fixture();
silent.request();
silent.at(5001);
silent.request();
silent.flushTasks();
assert.equal(silent.request().coverageEndSec, 1, 'slow initial validation gets one background retry');
silent.at(15002);
silent.request();
silent.flushTasks();
assert.equal(silent.request().reason, 'localFallback', 'startup grace is bounded for a genuinely silent worker');
assert.equal(silent.terminated(), 2);
silent.service.dispose();

const failed = fixture();
failed.request();
failed.listeners.get('error')();
assert.equal(failed.request().reason, 'localFallback', 'explicit worker errors still fall back immediately');
failed.service.dispose();

const edited = fixture();
edited.request();
edited.at(5001);
edited.request();
const obsoleteMessage = edited.listeners.get('message');
edited.service.handleTimelineInvalidation();
edited.at(6000);
edited.request();
edited.flushTasks();
const replacement = edited.messages.at(-1);
obsoleteMessage({ data: { ...edited.messages[0], kind: 'chunkResult', baseSec: 1, endSec: 2, done: true, result } });
assert.equal(edited.cache.getForecastAsyncMeta().forecastAsyncEndSec, 1, 'obsolete worker results cannot merge after an edit');
edited.at(6900);
edited.request();
assert.equal(edited.terminated(), 1, 'an obsolete watchdog cannot terminate the restarted worker');
assert.equal(edited.messages.at(-1), replacement, 'waiting must not dispatch duplicate work');
edited.service.dispose();

// Run the actual message handler with production perf defaults. Counting a
// large worker reply must not serialize it unless profiling was requested.
const production = spawnSync(process.execPath, ['--input-type=module', '-e', `
  import assert from 'node:assert/strict';
  import { createTimegraphForecastWorkerService } from './src/controllers/timegraph-forecast-worker-service.js';
  import { createProjectionCache } from './src/model/timegraph/projection-cache.js';
  import { createNewGameState } from './src/model/new-game.js';
  import { createEmptyTimelineFromBase } from './src/model/timeline/index.js';
  import { serializeGameState } from './src/model/state.js';
  import { buildProjectionChunkFromStateData } from './src/model/projection-chunk.js';
  ${fixture.toString()}
  const run=fixture(); run.request();
  const request=run.messages[0];
  const result=buildProjectionChunkFromStateData(run.cache.getStateData(1),1,2);
  let serializations=0;
  const message={...request,kind:'chunkResult',baseSec:1,endSec:2,done:false,result,
    toJSON(){serializations++;return {kind:this.kind};}};
  run.listeners.get('message')({data:message});
  assert.equal(serializations,0,'normal play must not JSON-serialize forecast replies for telemetry');
  assert.equal(run.cache.getForecastAsyncMeta().forecastAsyncEndSec,2,'coverage must still merge');
  globalThis.__PERF_ENABLED__=true;
  run.listeners.get('message')({data:message});
  assert.equal(serializations,1,'explicit profiling retains message-size diagnostics');
  run.service.dispose();
`], { env: { ...process.env, NODE_ENV: 'production' }, encoding: 'utf8' });
assert.equal(production.status, 0, production.stderr || production.stdout);
console.log('[forecast-worker-service] slow startup, bounded silence, progress stalls, errors and stale results OK');
