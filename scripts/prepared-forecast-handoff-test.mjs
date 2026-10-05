import assert from 'node:assert/strict';
import { mergePreparedForecast } from '../src/controllers/prepared-forecast-handoff.js';
import { createProjectionCache } from '../src/model/timegraph/projection-cache.js';
import { createNewGameState } from '../src/model/new-game.js';
import { serializeGameState } from '../src/model/state.js';
import { createEmptyTimelineFromBase } from '../src/model/timeline/index.js';
import { buildProjectionChunkFromStateData } from '../src/model/projection-chunk.js';

const initial = createNewGameState(123);
const before = JSON.stringify(serializeGameState(initial));
const timeline = createEmptyTimelineFromBase(initial);
const forecast = buildProjectionChunkFromStateData(timeline.baseStateData, 0, 96);
assert.equal(forecast.ok, true);
const whole = createProjectionCache(), sliced = createProjectionCache();
assert.equal(whole.mergeForecastChunk(timeline, { ...forecast, historyEndSec: 0,
  timelineToken: whole.getTimelineToken(timeline) }).ok, true);
let yields = 0;
assert.equal((await mergePreparedForecast({ cache: sliced, timeline, forecast, sliceSec: 7,
  yieldTask: async () => { yields++; } })).ok, true);
assert.ok(yields > 1, 'the actual forecast handoff yields between bounded slices');
assert.deepEqual(sliced.exportForecastChunk(), whole.exportForecastChunk(),
  'all seconds, terminal state, anchors and RNG match the synchronous handoff');
assert.equal(JSON.stringify(serializeGameState(initial)), before);
assert.equal(timeline.historyEndSec, 0);
const cancelled = createProjectionCache();
let current = true;
assert.equal((await mergePreparedForecast({ cache: cancelled, timeline, forecast, sliceSec: 7,
  isCurrent: () => current, yieldTask: async () => { current = false; } })).reason, 'cancelled');
assert.equal(cancelled.getSummary(8), null, 'cancelled preparation cannot import later slices');
console.log('[prepared-forecast-handoff] exact summaries/anchors, yielding and cancellation OK');
