import assert from 'node:assert/strict';
import { createNewGameOpeningController } from '../src/controllers/new-game-opening-controller.js';
import { createGameSessionController } from '../src/controllers/game-session-controller.js';
import { createTimegraphForecastWorkerService } from '../src/controllers/timegraph-forecast-worker-service.js';
import { createProjectionCache } from '../src/model/timegraph/projection-cache.js';
import { createNewGameState } from '../src/model/new-game.js';
import { createEmptyTimelineFromBase, rebuildStateAtSecond } from '../src/model/timeline/index.js';
import { serializeGameState } from '../src/model/state.js';

const state = createNewGameState(123);
state.civilization.chaos.monsterCount = 100;
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
assert.equal(opening.prepare(), first, 'concurrent requests share one prepared world');
const prepared = await first;
assert.equal(prepared.ok, true, 'local worker fallback prepares a terminal forecast');
assert.equal(constructions, 1);
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
console.log('[new-game-opening] OK');
