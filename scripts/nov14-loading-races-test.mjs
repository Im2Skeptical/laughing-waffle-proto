// New Game cancellation / checkpoint-ownership races not covered by
// scripts/loading-checkpoint-test.mjs or scripts/loading-recovery-browser-probe.mjs.
// Repro: node scripts/nov14-loading-races-test.mjs
// Limits: this checkout only; fake-indexeddb; no browser, server, npm verify,
// forecast/reveal edits, or phone/replay claim. searchLimitSec is 2.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { IDBFactory } from 'fake-indexeddb';
import { createGameSessionController } from '../src/controllers/game-session-controller.js';
import { createLoadingLifecycle } from '../src/controllers/loading-lifecycle.js';
import { createNewGameOpeningController } from '../src/controllers/new-game-opening-controller.js';
import { createOpeningCheckpointStore } from '../src/controllers/opening-checkpoint-store.js';
import { createTimegraphForecastWorkerService } from '../src/controllers/timegraph-forecast-worker-service.js';
import { openSaveDatabase, runSaveTransaction } from '../src/controllers/sim-runner/save-storage.js';
import { createNewGameState } from '../src/model/new-game.js';
import { createProjectionCache } from '../src/model/timegraph/projection-cache.js';
import { serializeGameState } from '../src/model/state.js';

const ARTIFACT = 'artifacts/grok-nov14-spend/loading-races';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, label) {
  for (let i = 0; i < 2000; i++) { if (await check()) return; await delay(5); }
  throw new Error(`timed out: ${label}`);
}
function activity() {
  const document = new EventTarget(), window = new EventTarget();
  document.hidden = false;
  let wall = 0;
  const lifecycle = createLoadingLifecycle({ document, window, now: () => wall });
  const fire = (target, type) => target.dispatchEvent(new Event(type));
  return { lifecycle, document, window, advance: ms => { wall += ms; },
    hide() { document.hidden = true; fire(document, 'visibilitychange'); },
    show() { document.hidden = false; fire(document, 'visibilitychange'); },
    freeze() { fire(document, 'freeze'); }, resume() { fire(document, 'resume'); },
    pagehide() { fire(window, 'pagehide'); }, pageshow() { fire(window, 'pageshow'); } };
}
function useDatabase() { globalThis.indexedDB = new IDBFactory(); }
function worker() {
  const service = createTimegraphForecastWorkerService({
    createWorker: () => { throw new Error('fixture local fallback'); },
    primeChunkSizeSec: 0, earlyStreamSliceSec: 1, streamSliceSec: 1,
  });
  return { requestCoverage: args => service.requestCoverage(args), dispose: () => service.dispose() };
}
function openingOptions(extra) {
  return { searchLimitSec: 2, checkpointIntervalMs: 0, createCache: () => createProjectionCache(),
    createWorkerService: worker, ...extra };
}

const report = {contracts: []};
function record(name, error, evidence) {
  const productFault = error?.name === 'AssertionError';
  report.contracts.push({ name, ok: !error, ...(error ? { error: error.name, message: error.message, productFault } : {}), evidence });
  if (error && !productFault) throw error;
}
async function check(name, fn) {
  let evidence;
  try { evidence = await fn(); record(name, null, evidence ?? null); }
  catch (error) { record(name, error, evidence ?? null); }
}

let harnessError = null;
try {
await check('repeated hide/freeze/pagehide/resume/pageshow keeps one suspension', async () => {
  const a = activity();
  let polls = 0, disposals = 0, worlds = 0;
  const opening = createNewGameOpeningController(openingOptions({
    checkpoints: null, lifecycle: a.lifecycle,
    createState: () => { worlds++; return createNewGameState(3); },
    createWorkerService: () => ({ requestCoverage() { polls++; return { ok: true, coverageEndSec: 0, pending: true }; }, dispose() { disposals++; } }),
  }));
  const job = opening.prepare();
  await until(() => polls >= 1, 'first foreground poll');
  const seen = polls;
  a.hide(); a.pagehide(); a.freeze();
  const frozen = a.lifecycle.now();
  a.advance(60000);
  assert.equal(a.lifecycle.now(), frozen, 'background time entered the foreground clock');
  assert.equal(a.lifecycle.isSuspended(), true);
  await delay(45);
  assert.equal(polls, seen, 'hidden freeze/pagehide kept simulating');
  assert.equal(disposals, 1, 'repeated hide events disposed the worker more than once');
  a.resume(); a.pageshow();
  await delay(40);
  assert.equal(a.lifecycle.isSuspended(), true, 'resume/pageshow while hidden started foreground time');
  assert.equal(polls, seen, 'pageshow while hidden resumed the worker');
  a.show(); a.pageshow();
  await until(() => polls > seen, 'resume poll');
  a.hide(); a.freeze(); a.pagehide(); a.resume(); a.pageshow();
  const again = polls;
  a.advance(60000);
  await delay(40);
  assert.equal(polls, again, 'second hidden sequence resumed work');
  assert.equal(disposals, 2, 'second suspension did not dispose exactly once');
  a.show();
  opening.cancel();
  assert.equal((await job).reason, 'cancelled', 'suspended cancel left the prepare promise pending or successful');
  assert.equal(worlds, 1, 'cancel rerolled the world');
  a.lifecycle.dispose();
  return { polls, disposals, foregroundNow: a.lifecycle.now() };
});

await check('cancel resolves that generation only', async () => {
  let worlds = 0;
  const opening = createNewGameOpeningController(openingOptions({
    checkpoints: null, createState: () => { worlds++; return createNewGameState(5); },
  }));
  const first = opening.prepare();
  opening.cancel({ discard: true });
  const second = opening.prepare();
  opening.cancel({ discard: true });
  await delay(30);
  assert.notEqual(first, second, 'replacement prepare reused the cancelled promise');
  assert.equal((await first).reason, 'cancelled');
  assert.equal((await second).reason, 'cancelled');
  assert.equal(worlds, 0, 'a cleared timer still constructed a world');
  return { worlds };
});

await check('queued write cannot outrun a newer preparation', async () => {
  useDatabase();
  const real = createOpeningCheckpointStore({ build: 'build-a' });
  let seen = 0; let release; const firstWrite = {};
  const checkpoints = {
    read: key => real.read(key), clear: (key, owner) => real.clear(key, owner),
    write(key, checkpoint) {
      seen++;
      if (seen > 1) return real.write(key, checkpoint);
      firstWrite.owner = checkpoint.owner; firstWrite.key = key;
      return new Promise(resolve => { release = resolve; }).then(() => real.write(key, checkpoint));
    },
  };
  let key = 'first'; let worlds = 0;
  const opening = createNewGameOpeningController(openingOptions({
    checkpoints, getPreparationKey: () => key,
    createState: () => createNewGameState(worlds++ === 0 ? 11 : 22),
  }));
  const first = opening.prepare();
  await until(() => seen >= 1, 'first checkpoint write');
  key = 'second';
  opening.cancel({ discard: true });
  const secondPromise = opening.prepare();
  release();
  assert.equal((await first).reason, 'cancelled');
  const second = await secondPromise;
  const disk = await real.read('second');
  const stale = await real.read('first');
  opening.cancel({ discard: true });
  assert.equal(second.ok, true, 'newer preparation did not finish after the queued write');
  assert.equal(worlds, 2, 'newer key recovered the discarded world');
  assert.equal(stale, null, 'old key remained stored');
  assert.notEqual(disk?.owner, firstWrite.owner, 'old write overwrote the newer owner');
  assert.ok(disk?.owner, 'newer preparation left no checkpoint');
  return { worlds, firstOwner: firstWrite.owner, secondOwner: disk.owner };
});

for (const sameKey of [false, true]) await check(sameKey ? 'initial save must not clear the next opening (same key)' : 'initial save must not clear the next opening', async () => {
  useDatabase();
  const db = await openSaveDatabase();
  await runSaveTransaction(db, ['saves', 'slots'], 'readwrite', tx => {
    tx.objectStore('saves').put({ slot: 1, text: 'slot-sentinel' });
    tx.objectStore('slots').put({ slot: 1, meta: { sentinel: true } });
  });
  const checkpoints = createOpeningCheckpointStore({ build: 'build-a' });
  let key = 'regular'; let worlds = 0;
  const opening = createNewGameOpeningController(openingOptions({
    checkpoints, getPreparationKey: () => key,
    createState: () => createNewGameState(worlds++ === 0 ? 100 : 200),
  }));
  let held = null;
  let session;
  session = createGameSessionController({
    opening, prepareEntry: async prepared => { opening.begin(prepared.lossSec ?? prepared.forecast?.endSec ?? 0); },
    runner: { resetToState: () => ({ ok: true }), saveToSlot: async () => {
      // Same calls as the menu storage listener while the first slot write is still open:
      // cancelPreparation() then prepareNewGame(), after launch settings change the key.
      key = sameKey ? key : 'edited-profile';
      session.cancelPreparation();
      const prepared = await session.prepareNewGame();
      if (!prepared?.ok) throw new Error(`next opening failed: ${prepared?.reason}`);
      const disk = await checkpoints.read(key);
      held = { owner: disk?.owner ?? null, stateData: disk?.stateData ?? null, ok: prepared.ok };
      if (!held.owner) throw new Error('next opening committed no checkpoint before the slot write finished');
      return { ok: true, meta: { savedAt: '2026-11-14T11:20:00.000Z', tSec: 0 } };
    } },
  });
  const saved = await session.newGame(2);
  if (!held) throw new Error(`first save was not reached (${saved?.reason})`);
  const disk = await checkpoints.read(key);
  const slot = await runSaveTransaction(db, ['saves'], 'readonly', (tx, done) => {
    const request = tx.objectStore('saves').get(1); request.onsuccess = () => done(request.result?.text ?? null);
  });
  let reloadRolls = 0;
  const reload = createNewGameOpeningController(openingOptions({
    checkpoints, getPreparationKey: () => key,
    createState: () => { reloadRolls++; return createNewGameState(424242); },
  }));
  let reloadResult;
  try { reloadResult = await reload.prepare(); }
  finally { reload.cancel({ discard: true }); opening.cancel({ discard: true }); db.close(); }
  const evidence = { savedOk: saved.ok, heldOwner: held.owner, diskOwner: disk?.owner ?? null, reloadRolls,
    reloadOk: reloadResult?.ok ?? false, slot,
    sameWorld: Boolean(disk && isDeepStrictEqual(disk.stateData, held.stateData)),
    heldTSec: held.stateData?.tSec ?? null, worldsBeforeReload: worlds };
  report.recovery = evidence;
  assert.equal(slot, 'slot-sentinel', 'opening cleanup wrote a player slot');
  assert.ok(disk?.owner === held.owner, `initial save cleared a newer opening checkpoint (disk ${disk?.owner ?? 'null'}, reload rolls ${reloadRolls})`);
  assert.equal(evidence.sameWorld, true, 'newer checkpoint state changed across the initial save');
  assert.equal(reloadRolls, 0, 'accepted recovery rerolled the world');
  return evidence;
});

} catch (error) { harnessError = { name: error.name, message: error.message, stack: String(error.stack).split('\n').slice(0, 8) }; }
report.harnessError = harnessError;
mkdirSync(ARTIFACT, { recursive: true });
writeFileSync(`${ARTIFACT}/summary.json`, JSON.stringify(report, null, 2));
const failed = report.contracts.filter(item => !item.ok);
const passed = report.contracts.length - failed.length;
console.log(`[nov14-loading-races] ${failed.length || harnessError ? 'FAIL' : 'PASS'} ${passed} passed, ${failed.length} failed`);
for (const item of failed) console.log(`FAIL ${item.name}: ${item.message}`);
if (harnessError) console.log(`HARNESS ${harnessError.name}: ${harnessError.message}`);
console.log('repro: node scripts/nov14-loading-races-test.mjs');
process.exitCode = failed.length || harnessError ? 1 : 0;
