import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createTimegraphForecastWorkerService } from '../src/controllers/timegraph-forecast-worker-service.js';
import { createProjectionCache } from '../src/model/timegraph/projection-cache.js';
import { createNewGameState } from '../src/model/new-game.js';
import { createEmptyTimelineFromBase } from '../src/model/timeline/index.js';
import { serializeGameState } from '../src/model/state.js';
import { buildProjectionChunkFromStateData } from '../src/model/projection-chunk.js';
import { encodeForecastChunk } from '../src/model/timegraph/forecast-wire.js';

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
assert.equal(continued.terminated(), 0);
continued.service.dispose();

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
