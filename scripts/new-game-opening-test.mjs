import assert from 'node:assert/strict';
import { createNewGameOpeningController } from '../src/controllers/new-game-opening-controller.js';
import { createGameSessionController } from '../src/controllers/game-session-controller.js';
import { createTimegraphForecastWorkerService } from '../src/controllers/timegraph-forecast-worker-service.js';
import { createProjectionCache } from '../src/model/timegraph/projection-cache.js';
import { createNewGameState } from '../src/model/new-game.js';
import { createEmptyTimelineFromBase, rebuildStateAtSecond } from '../src/model/timeline/index.js';
import { serializeGameState } from '../src/model/state.js';
import { createLoadingDiagnostics } from '../src/controllers/loading-diagnostics.js';

let clock = 0;
const loading = createLoadingDiagnostics({ now: () => clock });
const loadingJob = loading.begin('continue');
loadingJob.report({ stage: 'read', label: 'Read save' });
clock = 100;
loadingJob.report({ stage: 'history', label: 'History', completed: 0, total: 260 });
clock = 300;
loadingJob.report({ stage: 'history', label: 'History', completed: 128, total: 260 });
clock = 400;
assert.deepEqual(loading.snapshot().stages.map(stage => stage.elapsedMs), [100, 300]);
assert.equal(loading.snapshot().stages[1].sinceProgressMs, 100);
loadingJob.finish({ ok: false, reason: 'loadTimeout' });
clock = 900;
assert.equal(loading.snapshot().elapsedMs, 400, 'failed timings freeze at failure');
assert.equal(loading.snapshot().reason, 'loadTimeout');
const retryJob = loading.begin('newGame');
loadingJob.report({ stage: 'stale', label: 'Abandoned job' });
loadingJob.finish({ ok: true });
assert.equal(loading.snapshot().stages.length, 0, 'stale progress cannot overwrite a retry');
retryJob.finish({ ok: false, reason: 'cancelled' });
assert.equal(loading.snapshot().phase, 'cancelled');

const state = createNewGameState(123);
for(const region of state.world.regions) if(region.controller!=="player") region.monster={defense:100,ageMoons:2};
state.civilization.chaos.monsterPressure=10;
const before = JSON.stringify(serializeGameState(state));
let constructions = 0;
const opening = createNewGameOpeningController({
  createState: () => { constructions++; return state; },
  createCache: () => createProjectionCache(), searchLimitSec: 20,
  createWorkerService: () => createTimegraphForecastWorkerService({
    createWorker: () => { throw new Error('workers unavailable'); }, primeChunkSizeSec: 0,
  }),
});
const first = opening.prepare();
const openingProgress = [];
opening.prepare({ onProgress: progress => openingProgress.push(progress) });
assert.equal(opening.prepare(), first, 'concurrent requests share one prepared world');
const prepared = await first;
assert.equal(prepared.ok, true, 'local worker fallback prepares a terminal forecast');
assert.equal(constructions, 1);
assert.ok(openingProgress.some(progress => progress.stage === 'world'));
assert.equal(openingProgress.at(-1).completed, prepared.lossSec);
assert.equal(openingProgress.at(-1).total, prepared.lossSec);
let preparationKey='live',keyedConstructions=0;
const keyed=createNewGameOpeningController({
  getPreparationKey:()=>preparationKey,createState:()=>{keyedConstructions++;return state;},
  createCache:()=>createProjectionCache(),searchLimitSec:20,
  createWorkerService:()=>createTimegraphForecastWorkerService({createWorker:()=>{throw new Error('workers unavailable');},primeChunkSizeSec:0}),
});
const cached=keyed.prepare();assert.equal((await cached).ok,true);
assert.equal(keyed.prepare(),cached,'unchanged definitions reuse the prepared opening');
preparationKey='edited';const changed=keyed.prepare();assert.notEqual(changed,cached);
assert.equal((await changed).ok,true);assert.equal(keyedConstructions,2,'changed definitions prepare a new initial world and forecast');
keyed.cancel();
assert.equal(JSON.stringify(serializeGameState(state)), before, 'preloading does not mutate initial state or RNG');
const timeline = createEmptyTimelineFromBase(state);
const target = createProjectionCache();
assert.equal(target.mergeForecastChunk(timeline, { ...prepared.forecast,
  historyEndSec: 0, timelineToken: target.getTimelineToken(timeline) }).ok, true);
const replay = rebuildStateAtSecond(timeline, prepared.lossSec).state;
assert.deepEqual(target.getStateData(prepared.lossSec).rng, serializeGameState(replay).rng);
assert.deepEqual(target.getStateData(prepared.lossSec).runStatus, replay.runStatus);
assert.equal(timeline.historyEndSec, 0);

opening.begin(prepared.lossSec);
assert.equal(opening.advance(4.99).complete, false);
assert.equal(opening.isRevealing(), true);
const held = opening.getSnapshot().elapsedSec;
opening.cancel();
assert.equal(opening.getSnapshot().elapsedSec, held, 'cancelling preparation preserves the active introduction');
assert.equal(opening.advance(0.01).second, prepared.lossSec);
assert.equal(opening.getSnapshot().phase, 'completed');
assert.equal(opening.advance(1), null);
opening.reset();
const abandoned = opening.prepare();
opening.cancel();
assert.equal((await abandoned).reason, 'cancelled');
assert.equal(constructions, 1, 'cancelled scheduled work never constructs a world');

const failing = createNewGameOpeningController({ createState: () => { throw new Error('fixture failure'); } });
assert.equal((await failing.prepare()).ok, false);
assert.equal(failing.getSnapshot().preparation, 'error');
failing.cancel();
assert.equal((await failing.prepare()).reason, 'fixture failure');
failing.cancel();

let resolve;
let writes = 0;
const session = createGameSessionController({
  runner: { resetToState: () => { writes++; return {ok:true}; }, saveToSlot: () => { writes++; return {ok:true}; } },
  opening: { prepare: () => new Promise(done => { resolve = done; }) },
});
const entry = session.newGame(1, { isCurrent: () => false });
resolve(prepared);
assert.equal((await entry).reason, 'cancelled');
assert.equal(writes, 0, 'abandoned entry does not reset a live run or overwrite storage');
assert.equal(session.isInMenu(), true);

// Keep the landing menu up until the real first settlement scene is uploaded.
for (const entryKind of ['newGame', 'continueGame']) {
  let releasePresentation;
  let preparationStarted = false;
  let saves = 0;
  const events = [];
  let announcePresentation;
  let presentationStarted = new Promise(resolve => { announcePresentation = resolve; });
  const readySession = createGameSessionController({
    runner: {
      resetToState: () => ({ ok: true }),
      saveToSlot: async () => { saves++; return { ok: true }; },
      loadFromSlot: async () => ({ ok: true }),
    },
    opening: { prepare: async () => prepared, reset() {} },
    onEnter: () => events.push('setup'),
    prepareEntry: (openingResult, { isCurrent }) => {
      assert.equal(openingResult, entryKind === 'newGame' ? prepared : null,
        'presentation receives this entry’s prepared forecast');
      assert.equal(isCurrent(), true, 'presentation can guard asynchronous handoff against cancellation');
      preparationStarted = true;
      announcePresentation();
      events.push('upload');
      return new Promise(resolve => { releasePresentation = resolve; });
    },
  });
  const pendingEntry = readySession[entryKind](1);
  await presentationStarted;
  assert.equal(preparationStarted, true, `${entryKind} prepares its settlement before entry`);
  assert.deepEqual(events, ['setup', 'upload'], 'prepare the actual run after presentation setup');
  assert.equal(readySession.isInMenu(), true, `${entryKind} keeps gameplay suspended during uploads`);
  assert.equal(readySession.canResume(), false, 'an unprepared scene cannot bypass loading through menu Resume');
  assert.equal(saves, 0, 'preparing presentation does not write a save');
  assert.equal(readySession.getLoadingStatus().stages.at(-1).stage, 'scene');
  releasePresentation();
  assert.equal((await pendingEntry).ok, true);
  assert.equal(readySession.isInMenu(), false);
  assert.equal(readySession.canResume(), true);
  assert.equal(readySession.getLoadingStatus().phase, 'ready');
  assert.deepEqual((await readySession.getSaveDiagnostics()).loading, readySession.getLoadingStatus(),
    'diagnostic exports retain the completed loading stages and timings');
  const completedSaves = saves;
  let current = true;
  presentationStarted = new Promise(resolve => { announcePresentation = resolve; });
  const cancelledEntry = readySession[entryKind](2, { isCurrent: () => current });
  await presentationStarted;
  current = false;
  releasePresentation();
  assert.equal((await cancelledEntry).reason, 'cancelled');
  assert.equal(readySession.isInMenu(), true, 'leaving during uploads cannot reopen gameplay');
  assert.equal(saves, completedSaves, 'cancelled presentation preparation does not overwrite a save');
  assert.equal(readySession.getLoadingStatus().phase, 'cancelled');
}
for (const entryKind of ['newGame', 'continueGame']) {
  let artworkFails = true;
  const failedSession = createGameSessionController({
    runner: { resetToState: () => ({ ok: true }), loadFromSlot: async () => ({ ok: true }),
      saveToSlot: async () => ({ ok: true }) },
    opening: { prepare: async () => prepared, reset() {} },
    prepareEntry: async (_, { onProgress }) => {
      onProgress({ stage: 'artwork', label: 'Loading chronicle artwork' });
      if (artworkFails) throw new Error('Artwork could not be loaded: resource-language.json');
    },
  });
  await assert.rejects(failedSession[entryKind](1), /Artwork could not be loaded/);
  assert.equal(failedSession.canResume(), false, 'failed artwork cannot be resumed behind the loading screen');
  assert.equal(failedSession.isInMenu(), true);
  assert.equal(failedSession.getLoadingStatus().phase, 'failed');
  artworkFails = false;
  assert.equal((await failedSession[entryKind](1)).ok, true, 'entry can recover on manual retry');
}
console.log('[new-game-opening] OK');
