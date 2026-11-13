import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, writeFile, copyFile, mkdtemp, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { createArtworkSnapshot } from './artwork-manifest.mjs';
import { BROWSER_PROBE_LAUNCH_OPTIONS } from './browser-probe-config.mjs';

const base = process.argv[2] ?? 'http://localhost:5189/';
const artifact = 'artifacts/artwork-cache/browser.json';
await mkdir(path.dirname(artifact), { recursive: true });
const browser = await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
const result = { base, transfers: [], game: {}, errors: [] };
const fixture = await mkdtemp(path.join(tmpdir(), 'civilization-artwork-browser-'));
let server;
let builtServer;
let otherOriginServer;
let game;
let cacheContext;
let gameContext;
try {
  // Measure actual HTTP payloads in an isolated origin, using the real runtime
  // files and same snapshot generator. No routing interception/cache disabling.
  const manifest = await (await fetch(new URL('artwork-manifest.json', base))).json();
  for (const file of ['images/asset-manifest.json', ...Object.keys(manifest.files)]) {
    const full = path.join(fixture, file);
    await mkdir(path.dirname(full), { recursive: true });
    await copyFile(file, full);
  }
  const output = path.join(fixture, 'output');
  let current = await createArtworkSnapshot(fixture, output);
  let policy = 'public, max-age=31536000, immutable';
  server = createServer(async (req, res) => {
    try {
      const route = new URL(req.url, 'http://localhost').pathname.slice(1);
      if (!route) { res.setHeader('Cache-Control', 'no-store'); res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Artwork cache probe</title>'); return; }
      if (!/^artwork\/[a-f0-9]{64}\/[\w.-]+$/.test(route)) { res.writeHead(404).end(); return; }
      const full = path.join(output, route), details = await stat(full);
      res.setHeader('Cache-Control', policy); res.setHeader('ETag', `"${route}"`);
      if (req.headers['if-none-match'] === `"${route}"`) { res.writeHead(304).end(); return; }
      res.writeHead(200, { 'Content-Length': details.size }); createReadStream(full).pipe(res);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}/`;
  // A normal persistent profile exercises the disk HTTP cache. Incognito's
  // memory-only cache refuses the existing >10 MB atlas pages altogether.
  const context = cacheContext = await chromium.launchPersistentContext(path.join(fixture, 'profile'), BROWSER_PROBE_LAUNCH_OPTIONS);
  const page = await context.newPage();
  async function measure(label, files = current.files, address = origin) {
    await page.goto(address);
    const timings = await page.evaluate(async entries => {
      await Promise.all(entries.map(async ([source, value]) => {
        const r = await fetch(value.url); if (!r.ok) throw Error(`${r.status}: ${source}`); await r.arrayBuffer();
      }));
      return performance.getEntriesByType('resource').filter(r => r.name.includes('/artwork/'))
        .map(r => ({ file: r.name.split('/').at(-1), transfer: r.transferSize, decoded: r.decodedBodySize, encoded: r.encodedBodySize }));
    }, Object.entries(files));
    const images = timings.filter(r => /\.(png|webp)$/.test(r.file));
    const summary = { label, requests: timings.length, imageRequests: images.length,
      transferredBytes: timings.reduce((n, r) => n + r.transfer, 0),
      imageTransferredBytes: images.reduce((n, r) => n + r.transfer, 0),
      cachedImages: images.filter(r => r.transfer === 0).length, timings };
    result.transfers.push(summary);
    console.log(`[artwork-browser] ${label}: ${summary.imageRequests} images, ${summary.imageTransferredBytes} transferred bytes, ${summary.cachedImages} cached`);
    return summary;
  }
  const original = current;
  const cold = await measure('LAN cold');
  assert(cold.imageTransferredBytes > 1_000_000);
  assert.equal((await measure('LAN warm reload')).imageTransferredBytes, 0);
  await writeFile(path.join(fixture, 'gameplay-only.js'), 'code change');
  current = await createArtworkSnapshot(fixture, output);
  assert.deepEqual(current, original);
  assert.equal((await measure('gameplay-only reload')).imageTransferredBytes, 0);
  const cardFile = 'images/sprite-sheets/settlement-pieces-0.png';
  await writeFile(path.join(fixture, cardFile), Buffer.concat([await readFile(cardFile), Buffer.from('cache-probe')]));
  current = await createArtworkSnapshot(fixture, output);
  const card = await measure('one card atlas page changed');
  assert.equal(card.imageRequests - card.cachedImages, 1);
  const regionFile = 'images/dark-fantasy/map-generation-prototype/assets/runtime/crown-buildings-v1.webp';
  await writeFile(path.join(fixture, regionFile), Buffer.concat([await readFile(regionFile), Buffer.from('cache-probe')]));
  current = await createArtworkSnapshot(fixture, output);
  const regional = await measure('one regional file changed');
  assert.equal(regional.imageRequests - regional.cachedImages, 1);
  otherOriginServer = createServer(server.listeners('request')[0]);
  await new Promise(resolve => otherOriginServer.listen(0, '127.0.0.1', resolve));
  const isolated = await measure('different preview port (cold)', current.files, `http://127.0.0.1:${otherOriginServer.address().port}/`);
  assert.equal(isolated.cachedImages, 0, 'Changing preview ports changes the cache origin');
  policy = 'public, max-age=600';
  // Separate origin/context models Pages; a LAN cache must not make it warm.
  await context.close();
  console.log('[artwork-browser] Persistent cache profile closed');
  const pagesContext = await browser.newContext();
  const pagesPage = await pagesContext.newPage();
  await pagesPage.goto(origin);
  console.log('[artwork-browser] Pages-policy probe opened');
  const cdp = await pagesContext.newCDPSession(pagesPage);
  await cdp.send('Network.enable');
  let notModified = 0, bytes = 0;
  cdp.on('Network.responseReceivedExtraInfo', r => { if (r.statusCode === 304) notModified++; });
  cdp.on('Network.loadingFinished', r => { bytes += r.encodedDataLength; });
  const url = current.files[regionFile].url;
  await pagesPage.evaluate(async url => { await (await fetch(url)).arrayBuffer(); }, url);
  console.log('[artwork-browser] Pages-policy cold fetch complete');
  bytes = 0;
  await pagesPage.evaluate(async url => { await (await fetch(url, { cache: 'no-cache' })).arrayBuffer(); }, url);
  assert.equal(notModified, 1, 'Pages-style expired resources revalidate without image payloads');
  result.pagesRevalidation = { status: 304, transferredBytes: bytes, imagePayloadBytes: 0, policy };
  await pagesContext.close();
  await writeFile(artifact, JSON.stringify(result, null, 2));
  console.log('[artwork-browser] Pages-style conditional validation passed; starting real game');

  let gameBase = base;
  if (process.argv.includes('--pages')) {
    const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
      '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
    builtServer = createServer(async (req, res) => {
      try {
        const route = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/civ\//, '');
        if (route.includes('..') || route.startsWith('/')) { res.writeHead(404).end(); return; }
        const full = path.join('dist', route || 'index.html'), details = await stat(full);
        res.writeHead(200, { 'Content-Type': mime[path.extname(full)] ?? 'application/octet-stream',
          'Content-Length': details.size, 'Cache-Control': 'max-age=600' });
        createReadStream(full).pipe(res);
      } catch { res.writeHead(404).end(); }
    });
    await new Promise(resolve => builtServer.listen(0, '127.0.0.1', resolve));
    gameBase = `http://127.0.0.1:${builtServer.address().port}/civ/`;
    result.game.channel = 'Pages artifact at nested base path';
  }

  // Exercise the real game, GPU upload and retained deferred/reveal behavior.
  gameContext = await chromium.launchPersistentContext(path.join(fixture, 'game-profile'), {
    ...BROWSER_PROBE_LAUNCH_OPTIONS, viewport: { width: 1280, height: 800 },
  });
  game = await gameContext.newPage();
  await game.addInitScript(() => performance.setResourceTimingBufferSize(2000));
  game.setDefaultTimeout(180_000);
  game.on('pageerror', e => result.errors.push(e.message));
  await game.goto(new URL('?dev=1&perf=1&art=0&seed=123', gameBase).href);
  await game.waitForFunction(() => globalThis.__SETTLEMENT_DEBUG__?.getSnapshot()?.worldMap?.regionCount === 20);
  await game.getByTestId('game-menu').waitFor({ state: 'hidden' });
  console.log('[artwork-browser] Minimal game entered');
  result.game.minimalFiles = await game.evaluate(() => performance.getEntriesByType('resource').filter(r => r.name.includes('/artwork/')).map(r => r.name.split('/').at(-1)));
  assert(result.game.minimalFiles.length > 0, 'Shared icon downloads must be observed');
  assert(result.game.minimalFiles.every(file => file.startsWith('resource-language')), 'Minimal mode only fetches shared icons');
  // Direct documented mode URLs avoid racing initial entry's save with a
  // second menu launch. Each mode gets its own completed entry lifecycle.
  await game.goto(new URL('?dev=1&perf=1&art=1&seed=123&launch=new', gameBase).href);
  await game.locator('[data-artwork-ready="true"]').waitFor();
  console.log('[artwork-browser] Progressive artwork ready');
  result.game.progressiveReady = true;
  await game.locator('[data-artwork-ready="true"]').click();
  result.game.revealed = await game.locator('[data-artwork-ready="true"]').count() === 0;
  assert(result.game.revealed);
  await game.getByTestId('game-menu-open').click();
  await game.getByTestId('game-developer-tools').evaluate(element => { element.open = true; });
  await game.getByTestId('game-save-diagnostics').waitFor({ state: 'attached' });
  const originalManifest = await game.evaluate(() => JSON.parse(document.getElementById('game-artwork-manifest').textContent));
  // Interception begins after transfer measurements: Playwright routing disables
  // HTTP cache, so it must never contaminate the cache evidence above.
  let changedCategory = 'regions';
  await game.route('**/artwork-manifest.json', route => route.fulfill({ json: { ...originalManifest,
    categories: { ...originalManifest.categories, [changedCategory]: 'new-art-revision' } } }));
  await game.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await game.waitForFunction(() => document.querySelector('#game-build-badge').textContent.includes('Artwork updated: Regions'));
  changedCategory = 'cards';
  await game.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await game.waitForFunction(() => document.querySelector('#game-build-badge').textContent.includes('Artwork updated: Cards'));
  result.game.notice = await game.locator('#game-build-badge').textContent();
  assert(result.game.notice.includes('Artwork updated: Cards'));
  assert(!result.game.notice.includes('Regions'));
  await game.screenshot({ path: 'artifacts/artwork-cache/update-notice.png' });
  // A failed transaction must leave the current page and its run available.
  await game.evaluate(() => {
    globalThis.__artworkProbeTransaction = IDBDatabase.prototype.transaction;
    IDBDatabase.prototype.transaction = function(stores, mode, ...args) {
      if (mode === 'readwrite') throw new DOMException('Probe save failure', 'QuotaExceededError');
      return __artworkProbeTransaction.call(this, stores, mode, ...args);
    };
  });
  await game.getByTestId('artwork-reload').click();
  await game.getByTestId('artwork-reload').filter({ hasText: 'Reload paused' }).waitFor();
  result.game.failedSaveBlockedReload = true;
  await game.evaluate(() => { IDBDatabase.prototype.transaction = __artworkProbeTransaction; });
  await game.screenshot({ path: 'artifacts/artwork-cache/save-failure.png' });
  await Promise.all([
    game.waitForEvent('domcontentloaded'),
    game.getByTestId('artwork-reload').click(),
  ]);
  await game.waitForFunction(() => globalThis.__SETTLEMENT_DEBUG__?.getSnapshot()?.worldMap?.regionCount === 20);
  result.game.saveSurvivedReload = true;
  await game.getByTestId('game-menu').waitFor({ state: 'hidden' });
  result.game.loadedRegions = await game.evaluate(() => __SETTLEMENT_DEBUG__.getSnapshot().worldMap.regionCount);
  assert.equal(result.game.loadedRegions, 20);
  await game.unroute('**/artwork-manifest.json');
  // Omit dev=1 to use ordinary illustrated entry (without deferred reveal).
  await game.goto(new URL('?perf=1&art=0&seed=123&launch=new', gameBase).href);
  await game.waitForFunction(() => globalThis.__SETTLEMENT_DEBUG__?.getSnapshot()?.worldMap?.regionCount === 20);
  await game.getByTestId('game-menu').waitFor({ state: 'hidden' });
  await game.waitForFunction(() => {
    const manifest = JSON.parse(document.getElementById('game-artwork-manifest').textContent);
    return [0, 1, 2].every(index => Object.values(PIXI.Assets.cache.get(manifest.files[`images/sprite-sheets/settlement-pieces-${index}.json`].url)?.textures ?? {})
      .some(t => t.baseTexture.valid && Object.keys(t.baseTexture._glTextures ?? {}).length > 0));
  });
  result.game.ordinaryIllustratedUpload = await game.evaluate(() => {
    const manifest = JSON.parse(document.getElementById('game-artwork-manifest').textContent);
    return [0, 1, 2].every(index => {
      const sheet = PIXI.Assets.cache.get(manifest.files[`images/sprite-sheets/settlement-pieces-${index}.json`].url);
      return Object.values(sheet?.textures ?? {}).some(t => t.baseTexture.valid && Object.keys(t.baseTexture._glTextures ?? {}).length > 0);
    });
  });
  assert(result.game.ordinaryIllustratedUpload, 'Ordinary illustrated entry uploads coherent multipacks');
  result.game.ordinaryIllustratedTransfers = await game.evaluate(() => performance.getEntriesByType('resource')
    .filter(r => r.name.includes('/artwork/') && /\.(png|webp)$/.test(r.name))
    .map(r => ({file:r.name.split('/').at(-1),transferredBytes:r.transferSize})));
  assert.deepEqual(result.errors, []);
  await gameContext.close();
  console.log('[artwork-browser] PASS: selective transfers, revalidation, minimal mode, progressive reveal, notice and saved-game reload');
} catch (error) {
  result.failure = { message: error.message, stack: error.stack };
  if (game) result.game.failureState = await game.evaluate(() => ({
    menuHidden: document.querySelector('#game-menu')?.hidden,
    devOpen: document.querySelector('[data-testid="game-developer-tools"]')?.open,
    checkbox: (() => { const e=document.querySelector('[data-testid="game-progressive-artwork"]'); return e ? {rect:e.getBoundingClientRect().toJSON(),display:getComputedStyle(e).display} : null; })(),
    menu: document.querySelector('#game-menu')?.textContent.slice(-1600),
    snapshot: globalThis.__SETTLEMENT_DEBUG__ ? { opening: __SETTLEMENT_DEBUG__.getSnapshot().opening } : null,
  })).catch(() => null);
  await game?.screenshot({ path: 'artifacts/artwork-cache/failure.png' }).catch(() => {});
  console.error(`[artwork-browser] FAILED: ${error.message.split('\n')[0]}; ${artifact}`);
  process.exitCode = 1;
} finally {
  await writeFile(artifact, JSON.stringify(result, null, 2));
  await gameContext?.close();
  await cacheContext?.close();
  await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
  if (otherOriginServer) await new Promise(resolve => otherOriginServer.close(resolve));
  if (builtServer) await new Promise(resolve => builtServer.close(resolve));
  assert.equal(path.dirname(fixture), path.resolve(tmpdir()));
  assert.ok(path.basename(fixture).startsWith('civilization-artwork-browser-'));
  await rm(fixture, { recursive: true, force: true, maxRetries: 5 });
}
