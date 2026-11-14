import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';

// Real menu/input code with a held entry transaction: no simulation or artwork
// timing is needed to reproduce cancellation when a phone hides the page.
const bundle = await build({ entryPoints: ['src/views/game-menu-dom.js'], bundle: true,
  format: 'esm', write: false });
const recoveryBundle = await build({ stdin: { resolveDir: process.cwd(), contents: `
  export { createNewGameOpeningController } from './src/controllers/new-game-opening-controller.js';
  export { createTimegraphForecastWorkerService } from './src/controllers/timegraph-forecast-worker-service.js';
  export { createLoadingLifecycle } from './src/controllers/loading-lifecycle.js';
  export { createOpeningCheckpointStore } from './src/controllers/opening-checkpoint-store.js';
  export { createProjectionCache } from './src/model/timegraph/projection-cache.js';
  export { createNewGameState } from './src/model/new-game.js';
  ` }, bundle: true, format: 'esm', write: false });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true });
  await page.route('http://loading.test/**', route => route.fulfill({
    contentType: route.request().url().endsWith('.js') ? 'text/javascript' : 'text/html',
    body: route.request().url().endsWith('menu.js') ? bundle.outputFiles[0].text
      : route.request().url().endsWith('recovery.js') ? recoveryBundle.outputFiles[0].text
      : '<div data-testid="utility-controls"></div>',
  }));
  await page.goto('http://loading.test/?dev=1');
  await page.evaluate(async () => {
    globalThis.__hidden = false;
    Object.defineProperty(document, 'hidden', { get: () => __hidden });
    Object.defineProperty(document, 'visibilityState', { get: () => __hidden ? 'hidden' : 'visible' });
    document.documentElement.requestFullscreen = async () => {};
    screen.orientation.lock = async () => {};
    const { createGameMenuDom } = await import('/menu.js');
    let inMenu = true;
    globalThis.__entries = 0;
    createGameMenuDom({ session: {
      getSaveStatus: () => ({ phase: 'idle', canReplaceLiveGame: true }),
      getSlotStatus: () => ({ phase: 'ready' }), slots: () => [1, 2, 3].map(slot => ({ slot, empty: true })),
      canResume: () => false, isInMenu: () => inMenu,
      refreshSlots: async () => {}, cancelImport() {}, cancelPreparation() {},
      newGame: async (_slot, { isCurrent }) => {
        __entries++;
        globalThis.__entryCurrent = isCurrent;
        await new Promise(resolve => { globalThis.__finishEntry = resolve; });
        const result = { ok: isCurrent(), reason: isCurrent() ? undefined : 'cancelled' };
        if (result.ok) inMenu = false;
        return result;
      },
      openMenu: () => { inMenu = true; return true; }, save: async () => ({ ok: true }),
    } });
  });
  await page.getByTestId('game-new').click();
  await page.getByTestId('game-slot-1').click();
  await page.waitForFunction(() => !!globalThis.__entryCurrent);
  await page.evaluate(() => { __hidden = true; document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('blur')); });
  assert.equal(await page.evaluate(() => __entryCurrent()), true,
    'locking the phone must keep the existing load current');
  await page.evaluate(() => __finishEntry());
  assert.equal(await page.getByTestId('game-loading-retry').count(), 0, 'a hidden page must not fail entry');
  await page.evaluate(() => { __hidden = false; document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('pageshow')); });
  await page.getByTestId('game-menu').waitFor({ state: 'hidden' });
  assert.equal(await page.evaluate(() => __entries), 1, 'returning continues the original entry');

  async function startOpening({ recovering = false } = {}) {
    await page.evaluate(async recovering => {
      const api = await import('/recovery.js');
      globalThis.__hidden = false;
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => __hidden });
      const lifecycle = api.createLoadingLifecycle();
      const checkpoints = api.createOpeningCheckpointStore({ build: 'browser-fixture' });
      const write = checkpoints.write;
      globalThis.__writes = [];
      checkpoints.write = async (key, record) => { await write(key, record); __writes.push(record.forecast.endSec); };
      globalThis.__readCheckpoint = () => checkpoints.read('browser-regular');
      globalThis.__firstBoundary = null;
      globalThis.__result = null;
      const opening = api.createNewGameOpeningController({ lifecycle, checkpoints,
        checkpointIntervalMs: 0, getPreparationKey: () => 'browser-regular', searchLimitSec: 12,
        createCache: () => api.createProjectionCache(),
        createState: () => { if (recovering) throw new Error('reload rolled a new world'); return api.createNewGameState(123); },
        createWorkerService: () => {
          const worker = api.createTimegraphForecastWorkerService({ primeChunkSizeSec: 0, earlyStreamSliceSec: 1,
            createWorker: () => { throw new Error('fixture local fallback'); } });
          return { dispose: () => worker.dispose(), requestCoverage(args) {
            __firstBoundary ??= args.projectionCache.getForecastAsyncMeta().forecastAsyncEndSec;
            return worker.requestCoverage(args);
          } };
        },
      });
      globalThis.__clearCheckpoint = () => opening.clearCheckpoint();
      let held = false;
      void opening.prepare({ onProgress: progress => {
        if (!recovering && !held && progress.completed >= 3) {
          held = true; __hidden = true; document.dispatchEvent(new Event('visibilitychange'));
        }
      } }).then(result => { globalThis.__result = { ok: result.ok, reason: result.reason, second: result.forecast?.endSec }; });
    }, recovering);
  }
  // A real page reload destroys JS memory; only native IndexedDB survives.
  await page.reload();
  await startOpening();
  await page.waitForFunction(() => __writes.at(-1) >= 3);
  const coverage = await page.evaluate(async () => (await __readCheckpoint()).forecast.endSec);
  assert(coverage >= 3, `saved coverage ${coverage}; writes ${await page.evaluate(() => __writes)}`);
  await page.reload();
  await startOpening({ recovering: true });
  await page.waitForFunction(() => globalThis.__result);
  assert.deepEqual(await page.evaluate(() => __result), { ok: true, reason: undefined, second: 12 });
  assert.equal(await page.evaluate(() => __firstBoundary), coverage, 'native IndexedDB resumes after a real reload');
  await page.evaluate(() => __clearCheckpoint());
  assert.equal(await page.evaluate(() => __readCheckpoint()), null);
  console.log('[loading-recovery-browser] PASS phone visibility/blur, hidden completion, native IndexedDB reload recovery and cleanup');
} finally { await browser.close(); }
