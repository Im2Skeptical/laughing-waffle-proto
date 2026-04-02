import assert from "node:assert/strict";

import { ActionKinds } from "../src/model/actions.js";
import { buildProjectionChunkFromStateData } from "../src/model/projection-chunk.js";
import { serializeGameState } from "../src/model/state.js";
import { createProjectionCache } from "../src/model/timegraph/projection-cache.js";
import { createTimeGraphController } from "../src/model/timegraph/controller-core.js";
import {
  createTimelineFromInitialState,
  getStateDataAtSecond,
  rebuildStateAtSecond,
  replaceActionsAtSecond,
} from "../src/model/timeline/index.js";
import { createEmptyState } from "../src/model/state.js";
import {
  createTimegraphForecastWorkerService,
  TIMEGRAPH_FORECAST_PRIME_CHUNK_SIZE_SEC,
  TIMEGRAPH_FORECAST_CHUNK_SIZE_SEC,
  TIMEGRAPH_FORECAST_STREAM_SLICE_SEC,
  TIMEGRAPH_FORECAST_REQUEST_CADENCE_MS,
} from "../src/controllers/timegraph-forecast-worker-service.js";
import { GRAPH_METRICS } from "../src/model/graph-metrics.js";

function createBasicTimeline() {
  const state = createEmptyState(12345);
  const timeline = createTimelineFromInitialState(state);
  timeline.cursorSec = 0;
  timeline.historyEndSec = 0;
  return { state, timeline };
}

function createFakeWorker() {
  const listeners = new Map();
  const worker = {
    messages: [],
    terminated: false,
    addEventListener(type, handler) {
      listeners.set(type, handler);
    },
    removeEventListener(type, handler) {
      if (listeners.get(type) === handler) {
        listeners.delete(type);
      }
    },
    postMessage(message) {
      worker.messages.push(message);
    },
    emit(message) {
      const handler = listeners.get("message");
      if (typeof handler === "function") {
        handler({ data: message });
      } else if (typeof worker.onmessage === "function") {
        worker.onmessage({ data: message });
      }
    },
    terminate() {
      worker.terminated = true;
    },
  };
  return worker;
}

function hashState(state) {
  return JSON.stringify(serializeGameState(state));
}

function testProjectionChunkParityWithScheduledActions() {
  const { timeline } = createBasicTimeline();
  const action = {
    kind: ActionKinds.DEBUG_SET_CAP,
    payload: { enabled: true, cap: 42, points: 42 },
    apCost: 0,
  };
  assert.equal(
    replaceActionsAtSecond(timeline, 3, [action], { truncateFuture: false }).ok,
    true
  );

  const boundaryRes = getStateDataAtSecond(timeline, 0);
  assert.equal(boundaryRes.ok, true);

  const chunkRes = buildProjectionChunkFromStateData(
    boundaryRes.stateData,
    0,
    5,
    {
      stepSec: 1,
      actionsBySecond: [{ tSec: 3, actions: [action] }],
    }
  );
  assert.equal(chunkRes.ok, true, chunkRes.reason);

  const chunkStateData = chunkRes.stateDataBySecond.get(5) ?? chunkRes.lastStateData;
  const chunkStateHash = hashState(
    typeof chunkStateData === "string" ? JSON.parse(chunkStateData) : chunkStateData
  );
  const rebuilt = rebuildStateAtSecond(timeline, 5);
  assert.equal(rebuilt.ok, true, rebuilt.reason);
  const rebuiltHash = hashState(rebuilt.state);
  assert.equal(chunkStateHash, rebuiltHash);
}

function testProjectionCacheChunkMergePersistsKnowledge() {
  const { timeline } = createBasicTimeline();
  const cache = createProjectionCache();
  cache.ensureSignature(timeline);
  const token = cache.getTimelineToken(timeline);
  const baseRes = getStateDataAtSecond(timeline, 0);
  assert.equal(baseRes.ok, true);

  const learnedStateData =
    typeof baseRes.stateData === "string"
      ? JSON.parse(baseRes.stateData)
      : JSON.parse(JSON.stringify(baseRes.stateData));
  learnedStateData.persistentKnowledge = {
    droppedItemKindsByPoolId: {
      "forageDrops::tile_floodplains": ["stone"],
    },
  };

  const mergeRes = cache.mergeForecastChunk(timeline, {
    timelineToken: token,
    historyEndSec: 0,
    baseSec: 0,
    endSec: 1,
    stepSec: 1,
    stateDataBySecond: [[1, baseRes.stateData]],
    lastStateData: learnedStateData,
  });
  assert.equal(mergeRes.ok, true, mergeRes.reason);
  assert.deepEqual(
    timeline.persistentKnowledge?.droppedItemKindsByPoolId?.[
      "forageDrops::tile_floodplains"
    ],
    ["stone"]
  );
}

function testProjectionCacheRejectsStaleChunkResults() {
  const { timeline } = createBasicTimeline();
  const cache = createProjectionCache();
  cache.ensureSignature(timeline);
  const staleToken = cache.getTimelineToken(timeline);
  const replaceRes = replaceActionsAtSecond(
    timeline,
    1,
    [
      {
        kind: ActionKinds.DEBUG_SET_CAP,
        payload: { enabled: true, cap: 10, points: 10 },
        apCost: 0,
      },
    ],
    { truncateFuture: false }
  );
  assert.equal(replaceRes.ok, true);

  const mergeRes = cache.mergeForecastChunk(timeline, {
    timelineToken: staleToken,
    historyEndSec: 0,
    baseSec: 0,
    endSec: 1,
    stepSec: 1,
    stateDataBySecond: [],
    lastStateData: null,
  });
  assert.equal(mergeRes.ok, false);
  assert.equal(mergeRes.reason, "staleTimelineToken");
}

function testProjectionCacheTokenStableAcrossFrontierAdvance() {
  const { timeline } = createBasicTimeline();
  const cache = createProjectionCache();
  cache.ensureSignature(timeline);
  const tokenBefore = cache.getTimelineToken(timeline);

  timeline.cursorSec = 5;
  timeline.historyEndSec = 5;
  timeline.revision = Math.floor(timeline.revision ?? 0) + 1;

  cache.ensureSignature(timeline);
  const tokenAfter = cache.getTimelineToken(timeline);
  assert.equal(tokenAfter, tokenBefore);
}

function testControllerPartialForecastDoesNotSyncBuildUnloadedSeconds() {
  const { state, timeline } = createBasicTimeline();
  const projectionCache = createProjectionCache();
  const controller = createTimeGraphController({
    getTimeline: () => timeline,
    getCursorState: () => state,
    metric: GRAPH_METRICS.gold,
    projectionCache,
  });

  controller.setActive(true);
  const ensureRes = controller.ensureCache();
  assert.equal(ensureRes.ok, true, ensureRes.reason);

  const sampleRes = controller.getSamplesForWindow({
    startSec: 0,
    endSec: 8,
    focus: false,
    cursorSec: 0,
  });
  assert.equal(sampleRes.ok, true, sampleRes.reason);
  const futurePoint = sampleRes.points.find((point) => point.tSec === 5);
  assert.equal(futurePoint?.pending, true);
  assert.ok(
    controller.getStateDataAt(5),
    "controller should synchronously resolve a browsed future second on demand"
  );
  assert.ok(
    projectionCache.getStateData(5),
    "on-demand future browse should populate projection cache for that second"
  );

  const historyState = controller.getStateAt(0);
  assert.ok(historyState, "history state should still resolve synchronously");
}

function testControllerSyncForecastExtendsVisibleCoverage() {
  const { state, timeline } = createBasicTimeline();
  const projectionCache = createProjectionCache();
  const controller = createTimeGraphController({
    getTimeline: () => timeline,
    getCursorState: () => state,
    metric: GRAPH_METRICS.gold,
    projectionCache,
    forecastStepSec: 1,
    horizonSec: 1280,
  });

  controller.setActive(true);
  const ensureRes = controller.ensureCache();
  assert.equal(ensureRes.ok, true, ensureRes.reason);

  const initialData = controller.getData();
  assert.equal(initialData.forecastCoverageEndSec, 0);

  const futureSec = 774;
  const futureState = controller.getStateAt(futureSec);
  assert.ok(futureState, "future forecast state should resolve synchronously");

  const dataAfterBrowse = controller.getData();
  assert.ok(
    dataAfterBrowse.forecastCoverageEndSec >= futureSec,
    `visible forecast coverage should reach ${futureSec}, got ${dataAfterBrowse.forecastCoverageEndSec}`
  );

  const sampleRes = controller.getSamplesForWindow({
    startSec: 0,
    endSec: 800,
    focus: false,
    cursorSec: futureSec,
  });
  assert.equal(sampleRes.ok, true, sampleRes.reason);
  const futurePoint = sampleRes.points.find((point) => point.tSec === futureSec);
  assert.ok(futurePoint, `expected sampled point at ${futureSec}`);
  assert.equal(
    futurePoint.pending,
    false,
    "sync-built future forecast should no longer remain visually pending"
  );
}

function testControllerRetainsForecastValuesAcrossCoverageUpdates() {
  const { state, timeline } = createBasicTimeline();
  const projectionCache = createProjectionCache();
  const controller = createTimeGraphController({
    getTimeline: () => timeline,
    getCursorState: () => state,
    metric: GRAPH_METRICS.gold,
    projectionCache,
    forecastStepSec: 1,
    horizonSec: 1280,
  });

  controller.setActive(true);
  const ensureRes = controller.ensureCache();
  assert.equal(ensureRes.ok, true, ensureRes.reason);

  const firstForecastSec = 5;
  const secondForecastSec = 20;

  assert.ok(
    controller.getStateAt(firstForecastSec),
    "initial forecast browse should resolve synchronously"
  );
  controller.getData();

  let valuesBySec =
    controller.getSeriesValuesForSeconds([firstForecastSec], {
      focus: false,
      allowSyncForecast: false,
    }) ?? new Map();
  assert.ok(
    valuesBySec.has(firstForecastSec),
    "controller should retain forecast values after first reveal"
  );

  assert.ok(
    controller.getStateAt(secondForecastSec),
    "later forecast browse should resolve synchronously"
  );
  controller.getData();

  const originalGetStateData = projectionCache.getStateData.bind(projectionCache);
  projectionCache.getStateData = (sec) =>
    sec < secondForecastSec ? null : originalGetStateData(sec);

  valuesBySec =
    controller.getSeriesValuesForSeconds([firstForecastSec, secondForecastSec], {
      focus: false,
      allowSyncForecast: false,
    }) ?? new Map();

  projectionCache.getStateData = originalGetStateData;

  assert.ok(
    valuesBySec.has(firstForecastSec),
    "later coverage updates should not drop already revealed forecast values"
  );
  assert.ok(
    valuesBySec.has(secondForecastSec),
    "controller should still expose the newly revealed forecast value"
  );
}

function testControllerRetainsForecastPreviewStateAcrossCoverageUpdates() {
  const { state, timeline } = createBasicTimeline();
  const projectionCache = createProjectionCache();
  const controller = createTimeGraphController({
    getTimeline: () => timeline,
    getCursorState: () => state,
    metric: GRAPH_METRICS.gold,
    projectionCache,
    forecastStepSec: 1,
    horizonSec: 1280,
  });

  controller.setActive(true);
  const ensureRes = controller.ensureCache();
  assert.equal(ensureRes.ok, true, ensureRes.reason);

  const firstForecastSec = 6;
  const secondForecastSec = 24;

  const firstState = controller.getStateAt(firstForecastSec);
  assert.ok(firstState, "initial forecast preview state should resolve");

  const secondState = controller.getStateAt(secondForecastSec);
  assert.ok(secondState, "later forecast preview state should resolve");

  const originalGetStateData = projectionCache.getStateData.bind(projectionCache);
  projectionCache.getStateData = (sec) =>
    sec < secondForecastSec ? null : originalGetStateData(sec);

  const restoredFirstState = controller.getStateAt(firstForecastSec);

  projectionCache.getStateData = originalGetStateData;

  assert.ok(
    restoredFirstState,
    "controller should retain preview state for earlier revealed forecast seconds"
  );
  assert.equal(
    hashState(restoredFirstState),
    hashState(firstState),
    "restored forecast preview state should match the originally revealed state"
  );
}

function testControllerRebuildsForecastPreviewFromRetainedGraphAnchors() {
  const { state, timeline } = createBasicTimeline();
  const projectionCache = createProjectionCache();
  const controller = createTimeGraphController({
    getTimeline: () => timeline,
    getCursorState: () => state,
    metric: GRAPH_METRICS.gold,
    projectionCache,
    forecastStepSec: 1,
    horizonSec: 1280,
  });

  controller.setActive(true);
  const ensureRes = controller.ensureCache();
  assert.equal(ensureRes.ok, true, ensureRes.reason);

  const forecastEndSec = 960;
  assert.ok(
    controller.getStateAt(forecastEndSec),
    "priming a later forecast second should build the visible projection window"
  );

  const sampleRes = controller.getSamplesForWindow({
    startSec: 0,
    endSec: forecastEndSec,
    focus: false,
    cursorSec: forecastEndSec,
  });
  assert.equal(sampleRes.ok, true, sampleRes.reason);

  const forecastSamples = sampleRes.seconds.filter((sec) => sec > timeline.historyEndSec);
  let targetSec = null;
  for (let i = 0; i < forecastSamples.length - 1; i++) {
    const startSec = forecastSamples[i];
    const endSec = forecastSamples[i + 1];
    if (endSec - startSec > 2) {
      targetSec = startSec + Math.floor((endSec - startSec) / 2);
      break;
    }
  }
  assert.ok(
    Number.isFinite(targetSec),
    "expected a forecast sampling gap so preview can rebuild from a retained anchor"
  );

  const graphCache = controller.getData().cache;
  assert.equal(
    graphCache?.stateDataByBoundary?.has?.(targetSec) ?? false,
    false,
    "target preview second should not already be pinned before fallback rebuild"
  );

  projectionCache.clear();

  const restoredState = controller.getStateAt(targetSec);
  assert.ok(
    restoredState,
    "controller should rebuild forecast preview state from retained graph anchors"
  );

  const rebuilt = rebuildStateAtSecond(timeline, targetSec);
  assert.equal(rebuilt.ok, true, rebuilt.reason);
  assert.equal(
    hashState(restoredState),
    hashState(rebuilt.state),
    "anchor-rebuilt forecast preview should match deterministic replay at the same second"
  );
}

function testControllerRebuildsForecastValuesFromRetainedGraphAnchors() {
  const { state, timeline } = createBasicTimeline();
  const projectionCache = createProjectionCache();
  const controller = createTimeGraphController({
    getTimeline: () => timeline,
    getCursorState: () => state,
    metric: GRAPH_METRICS.gold,
    projectionCache,
    forecastStepSec: 1,
    horizonSec: 1280,
  });

  controller.setActive(true);
  const ensureRes = controller.ensureCache();
  assert.equal(ensureRes.ok, true, ensureRes.reason);

  const forecastEndSec = 960;
  assert.ok(
    controller.getStateAt(forecastEndSec),
    "priming a later forecast second should build the visible projection window"
  );

  const sampleRes = controller.getSamplesForWindow({
    startSec: 0,
    endSec: forecastEndSec,
    focus: false,
    cursorSec: forecastEndSec,
  });
  assert.equal(sampleRes.ok, true, sampleRes.reason);

  const forecastSamples = sampleRes.seconds.filter((sec) => sec > timeline.historyEndSec);
  let targetSec = null;
  for (let i = 0; i < forecastSamples.length - 1; i++) {
    const startSec = forecastSamples[i];
    const endSec = forecastSamples[i + 1];
    if (endSec - startSec > 2) {
      targetSec = startSec + Math.floor((endSec - startSec) / 2);
      break;
    }
  }
  assert.ok(
    Number.isFinite(targetSec),
    "expected a forecast sampling gap so graph values can rebuild from a retained anchor"
  );

  const graphCache = controller.getData().cache;
  assert.equal(
    graphCache?.stateDataByBoundary?.has?.(targetSec) ?? false,
    false,
    "target graph sample second should not already be pinned before fallback rebuild"
  );

  const originalGetStateData = projectionCache.getStateData.bind(projectionCache);
  projectionCache.getStateData = (sec) =>
    sec === targetSec ? null : originalGetStateData(sec);

  const valuesBySec =
    controller.getSeriesValuesForSeconds([targetSec], {
      focus: false,
      allowSyncForecast: false,
    }) ?? new Map();

  projectionCache.getStateData = originalGetStateData;

  assert.ok(
    valuesBySec.has(targetSec),
    "controller should rebuild forecast graph values from retained graph anchors"
  );
}

function testWorkerServiceDedupesEquivalentRequests() {
  const { timeline } = createBasicTimeline();
  const projectionCache = createProjectionCache();
  projectionCache.ensureSignature(timeline);
  const fakeWorker = createFakeWorker();
  const service = createTimegraphForecastWorkerService({
    createWorker: () => fakeWorker,
    timeNowMs: () => 1000,
  });

  const boundaryRes = getStateDataAtSecond(timeline, 0);
  assert.equal(boundaryRes.ok, true);
  const request = {
    projectionCache,
    timeline,
    timelineToken: projectionCache.getTimelineToken(timeline),
    historyEndSec: 0,
    stepSec: 1,
    desiredEndSec: TIMEGRAPH_FORECAST_CHUNK_SIZE_SEC + 250,
    boundaryStateData: boundaryRes.stateData,
    scheduledActionsBySecond: [],
  };

  const first = service.requestCoverage(request);
  const second = service.requestCoverage(request);
  assert.equal(first.ok, true, first.reason);
  assert.equal(second.ok, true, second.reason);
  assert.equal(fakeWorker.messages.length, 1);

  service.dispose();
  assert.equal(fakeWorker.terminated, true);
}

function testWorkerServiceAdvancesCoverageOnPartialChunkResults() {
  const { timeline } = createBasicTimeline();
  const projectionCache = createProjectionCache();
  projectionCache.ensureSignature(timeline);
  const fakeWorker = createFakeWorker();
  const service = createTimegraphForecastWorkerService({
    createWorker: () => fakeWorker,
    timeNowMs: () => 1000,
  });

  const boundaryRes = getStateDataAtSecond(timeline, 0);
  assert.equal(boundaryRes.ok, true);

  const desiredEndSec = TIMEGRAPH_FORECAST_CHUNK_SIZE_SEC + 180;
  const request = {
    projectionCache,
    timeline,
    timelineToken: projectionCache.getTimelineToken(timeline),
    historyEndSec: 0,
    stepSec: 1,
    desiredEndSec,
    boundaryStateData: boundaryRes.stateData,
    scheduledActionsBySecond: [],
  };

  const first = service.requestCoverage(request);
  assert.equal(first.ok, true, first.reason);
  assert.equal(fakeWorker.messages.length, 1);

  const message = fakeWorker.messages[0];
  const partialEndSec = Math.min(
    desiredEndSec,
    TIMEGRAPH_FORECAST_PRIME_CHUNK_SIZE_SEC + TIMEGRAPH_FORECAST_STREAM_SLICE_SEC
  );
  const partialRes = buildProjectionChunkFromStateData(
    projectionCache.getStateData(TIMEGRAPH_FORECAST_PRIME_CHUNK_SIZE_SEC),
    TIMEGRAPH_FORECAST_PRIME_CHUNK_SIZE_SEC,
    partialEndSec,
    {
      stepSec: 1,
      actionsBySecond: [],
    }
  );
  assert.equal(partialRes.ok, true, partialRes.reason);

  fakeWorker.emit({
    kind: "chunkResult",
    requestId: message.requestId,
    requestKey: message.requestKey,
    timelineToken: message.timelineToken,
    historyEndSec: message.historyEndSec,
    baseSec: partialRes.baseSec,
    endSec: partialRes.endSec,
    stepSec: partialRes.stepSec,
    done: false,
    result: {
      ...partialRes,
      stateDataBySecond: Array.from(partialRes.stateDataBySecond.entries()),
    },
  });

  const afterPartial = service.requestCoverage(request);
  assert.equal(afterPartial.ok, true, afterPartial.reason);
  assert.equal(
    afterPartial.coverageEndSec >= partialEndSec,
    true,
    "worker service should expose partial coverage before the full chunk completes"
  );

  service.dispose();
}

function testWorkerServiceDefaultThroughputMatchesFasterReveal() {
  assert.equal(
    TIMEGRAPH_FORECAST_PRIME_CHUNK_SIZE_SEC,
    120,
    "worker service should keep the synchronous prime chunk modest to avoid main-thread stalls"
  );
  assert.equal(
    TIMEGRAPH_FORECAST_CHUNK_SIZE_SEC,
    480,
    "worker service should request larger async forecast chunks to reduce per-request overhead"
  );
  assert.equal(
    TIMEGRAPH_FORECAST_STREAM_SLICE_SEC,
    30,
    "worker service should stream forecast chunk progress in smaller slices for smooth unveil pacing"
  );
  assert.equal(
    TIMEGRAPH_FORECAST_REQUEST_CADENCE_MS,
    50,
    "worker service should dispatch forecast chunks promptly once the worker is ready"
  );
  assert.ok(
    TIMEGRAPH_FORECAST_CHUNK_SIZE_SEC / (TIMEGRAPH_FORECAST_REQUEST_CADENCE_MS / 1000) >= 480,
    "worker default forecast throughput should keep pace with the faster reveal rate"
  );
}

const tests = [
  [
    "projection chunk parity with scheduled actions",
    testProjectionChunkParityWithScheduledActions,
  ],
  [
    "projection cache merge persists knowledge",
    testProjectionCacheChunkMergePersistsKnowledge,
  ],
  [
    "projection cache rejects stale chunk results",
    testProjectionCacheRejectsStaleChunkResults,
  ],
  [
    "projection cache token stable across frontier advance",
    testProjectionCacheTokenStableAcrossFrontierAdvance,
  ],
  [
    "controller partial forecast does not sync build unloaded future",
    testControllerPartialForecastDoesNotSyncBuildUnloadedSeconds,
  ],
  [
    "controller sync forecast extends visible coverage",
    testControllerSyncForecastExtendsVisibleCoverage,
  ],
  [
    "controller retains forecast values across coverage updates",
    testControllerRetainsForecastValuesAcrossCoverageUpdates,
  ],
  [
    "controller retains forecast preview state across coverage updates",
    testControllerRetainsForecastPreviewStateAcrossCoverageUpdates,
  ],
  [
    "controller rebuilds forecast preview from retained graph anchors",
    testControllerRebuildsForecastPreviewFromRetainedGraphAnchors,
  ],
  [
    "controller rebuilds forecast values from retained graph anchors",
    testControllerRebuildsForecastValuesFromRetainedGraphAnchors,
  ],
  [
    "worker service dedupes equivalent requests",
    testWorkerServiceDedupesEquivalentRequests,
  ],
  [
    "worker service advances coverage on partial chunk results",
    testWorkerServiceAdvancesCoverageOnPartialChunkResults,
  ],
  [
    "worker service default throughput matches faster reveal",
    testWorkerServiceDefaultThroughputMatchesFasterReveal,
  ],
];

let failures = 0;
for (const [name, testFn] of tests) {
  try {
    testFn();
    console.log(`[pass] ${name}`);
  } catch (error) {
    failures += 1;
    console.error(`[fail] ${name}`);
    console.error(error);
  }
}

if (failures > 0) {
  process.exit(1);
}
