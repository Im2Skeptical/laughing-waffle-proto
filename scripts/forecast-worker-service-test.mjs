import assert from 'node:assert/strict';
import { createTimegraphForecastWorkerService } from '../src/controllers/timegraph-forecast-worker-service.js';
import { createProjectionCache } from '../src/model/timegraph/projection-cache.js';
import { createNewGameState } from '../src/model/new-game.js';
import { createEmptyTimelineFromBase } from '../src/model/timeline/index.js';
import { serializeGameState } from '../src/model/state.js';
import { buildProjectionChunkFromStateData } from '../src/model/projection-chunk.js';

function fixture() {
  const state = createNewGameState(99117);
  const base = serializeGameState(state);
  const timeline = createEmptyTimelineFromBase(state);
  const cache = createProjectionCache();
  let clockMs = 0, terminated = 0;
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
  });
  const request = (desiredEndSec = 20) => service.requestCoverage({
    projectionCache: cache, timeline, timelineToken: cache.getTimelineToken(timeline),
    historyEndSec: 0, stepSec: 1, desiredEndSec, boundaryStateData: base,
  });
  return { base, cache, service, request, messages, listeners,
    at: ms => clockMs = ms, terminated: () => terminated };
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
assert.equal(slow.request().reason, 'localFallback', 'after first progress the normal stall timeout applies');
assert.equal(slow.terminated(), 1);
assert.deepEqual(slow.cache.getStateData(4), buildProjectionChunkFromStateData(slow.base, 0, 4).lastStateData,
  'fallback continues from accepted worker progress with identical state and RNG');
slow.service.dispose();

const continued = fixture();
continued.request();
const fullChunk = buildProjectionChunkFromStateData(continued.cache.getStateData(1), 1, 20);
continued.at(1000);
continued.listeners.get('message')({ data: { ...continued.messages[0], kind: 'chunkResult',
  baseSec: 1, endSec: 20, done: true, result: fullChunk } });
continued.request(40);
continued.at(1900);
assert.equal(continued.request(40).coverageEndSec, 20,
  'each new chunk needs startup grace to deserialize its boundary state on a slow CPU');
assert.equal(continued.terminated(), 0);
continued.service.dispose();

const silent = fixture();
silent.request();
silent.at(5001);
assert.equal(silent.request().reason, 'localFallback', 'startup grace is bounded for a genuinely silent worker');
assert.equal(silent.terminated(), 1);
silent.service.dispose();

const failed = fixture();
failed.request();
failed.listeners.get('error')();
assert.equal(failed.request().reason, 'localFallback', 'explicit worker errors still fall back immediately');
failed.service.dispose();

const edited = fixture();
edited.request();
const obsoleteMessage = edited.listeners.get('message');
edited.service.handleTimelineInvalidation();
edited.at(1000);
edited.request();
const replacement = edited.messages.at(-1);
obsoleteMessage({ data: { ...edited.messages[0], kind: 'chunkResult', baseSec: 1, endSec: 2, done: true, result } });
assert.equal(edited.cache.getForecastAsyncMeta().forecastAsyncEndSec, 1, 'obsolete worker results cannot merge after an edit');
edited.at(1900);
edited.request();
assert.equal(edited.terminated(), 1, 'a restarted worker receives fresh startup grace');
assert.equal(edited.messages.at(-1), replacement, 'waiting must not dispatch duplicate work');
edited.service.dispose();
console.log('[forecast-worker-service] slow startup, bounded silence, progress stalls, errors and stale results OK');
