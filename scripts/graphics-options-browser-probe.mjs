import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { BROWSER_PROBE_LAUNCH_OPTIONS } from './browser-probe-config.mjs';

const url = 'http://127.0.0.1:18139', output = 'artifacts/graphics-options';
await mkdir(output, { recursive: true });
const server = createServer(async (req, res) => {
  try {
    const route = new URL(req.url, url).pathname;
    if (route === '/') {
      res.setHeader('Content-Type', 'text/html');
      res.end('<link rel="stylesheet" href="/styles.css"><body style="margin:0;background:#14262a;font-family:system-ui"><script src="https://cdn.jsdelivr.net/npm/pixi.js@7.2.4/dist/pixi.min.js"></script></body>'); return;
    }
    const file = path.resolve('.' + decodeURIComponent(route));
    if (!file.startsWith(process.cwd() + path.sep)) throw Error('Outside workspace');
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png' })[path.extname(file)] ?? 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.statusCode = 404; res.end(); }
});
await new Promise(resolve => server.listen(18139, '127.0.0.1', resolve));
const browser = await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS), errors = [];
try {
  const page = await browser.newPage({ viewport: { width: 844, height: 390 } });
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(url); await page.waitForFunction(() => !!globalThis.PIXI);
  await page.evaluate(async () => {
    const { createNewGameState } = await import('/src/model/new-game.js');
    const { getRegionalMap } = await import('/src/model/regional-map/definition.js');
    const { createIllustratedTerrain } = await import('/src/views/world-map/illustrated-terrain.js');
    const options = await import('/src/views/graphics-options.js');
    const { createSettlementDebugMenuDom } = await import('/src/views/settlement-debug-menu-dom.js');
    const state = createNewGameState(1867), before = JSON.stringify(state);
    const app = new PIXI.Application({ width: 844, height: 390, backgroundColor: 0x14262a });
    app.stop(); document.body.append(app.view);
    const points = getRegionalMap(state.world.definitionId).map.regions.flatMap(region => region.outline);
    const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
    const minY = Math.min(...points.map(p => p.y)), maxY = Math.max(...points.map(p => p.y));
    const width = Math.min(800 / (maxX - minX), 350 / (maxY - minY) * 1576 / 516), height = width * 516 / 1576;
    const rect = { x: 20 - minX * width, y: 20 - minY * height, width, height };
    const camera = { minX: -rect.x / width, minY: -rect.y / height, maxX: (844 - rect.x) / width, maxY: (390 - rect.y) / height, zoom: 1 };
    const view = createIllustratedTerrain(app.stage, rect, { getView: () => camera });
    await view.prepare(state, app.renderer);
    const workshop = createSettlementDebugMenuDom({ getState: () => state }); workshop.init();
    const paint = (seconds, force = false) => { view.update(seconds, 1, force); app.render(); };
    paint(500, true);
    const first = app.renderer.extract.pixels();
    let passes = 0;
    const original = app.renderer.render;
    app.renderer.render = function (node, opts) { if (opts?.renderTexture) passes++; return original.apply(this, arguments); };
    globalThis.fixture = { app, view, state, before, options, camera, first, paint, reset: () => { passes = 0; }, passes: () => passes };
  });
  await page.keyboard.press('Control+Shift+D');
  await page.getByTestId('debug-graphics-tab').click();
  const controls = page.getByTestId('graphics-options');
  const bounds = await controls.boundingBox();
  assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 844, 'Controls fit phone landscape');
  for (const key of ['fog', 'clouds', 'shadows', 'wisps', 'water']) {
    await controls.getByTestId(`graphics-${key}`).uncheck();
    assert.equal(await page.evaluate(key => { fixture.paint(500); return fixture.view.stats.graphics[key]; }, key), false,
      `${key} updates immediately at a held second`);
    await controls.getByTestId(`graphics-${key}`).check();
    await page.evaluate(() => fixture.paint(500));
  }
  await page.screenshot({ path: `${output}/phone-controls.png` });
  const sharedPass = await page.evaluate(() => {
    fixture.reset(); fixture.paint(500, true); const both = fixture.passes();
    fixture.options.setGraphicsOptions({ clouds: false }); fixture.reset(); fixture.paint(500); const shadows = fixture.passes();
    fixture.options.setGraphicsOptions({ shadows: false }); fixture.reset(); fixture.paint(500); const neither = fixture.passes();
    fixture.options.setGraphicsOptions(fixture.options.DEFAULT_GRAPHICS_OPTIONS); fixture.paint(500);
    return { both, shadows, neither };
  });
  assert.equal(sharedPass.shadows, sharedPass.both, 'Shadows retain the painted-cloud pass with clouds off');
  assert.equal(sharedPass.neither, sharedPass.both - 1, 'Disabling clouds and shadows skips their shared pass');
  await controls.getByTestId('graphics-all-off').click();
  await page.evaluate(() => { fixture.paint(500); fixture.reset(); });
  for (const seconds of [1000, 2000, 500]) {
    await page.waitForTimeout(40); await page.evaluate(seconds => fixture.paint(seconds), seconds);
  }
  const disabled = await page.evaluate(() => ({ passes: fixture.passes(), stats: fixture.view.stats }));
  assert.equal(disabled.passes, 0, 'All off skips every animation render pass while scrubbing');
  assert.equal(disabled.stats.animationPasses, 0);
  assert.equal(disabled.stats.waterSeconds, 0);
  const panned = await page.evaluate(() => {
    fixture.camera.minX += .3; fixture.camera.maxX += .3; fixture.paint(500);
    return { passes: fixture.passes(), waterSeconds: fixture.view.stats.waterSeconds };
  });
  assert.ok(panned.passes > 0, 'Still water refreshes its window on a large camera move');
  assert.equal(panned.waterSeconds, 0);
  await page.evaluate(() => { fixture.camera.minX -= .3; fixture.camera.maxX -= .3; fixture.paint(500); });
  await controls.getByTestId('graphics-reset').click();
  const restored = await page.evaluate(() => {
    fixture.paint(500);
    const pixels = fixture.app.renderer.extract.pixels();
    return { exact: pixels.every((value, i) => value === fixture.first[i]), untouched: JSON.stringify(fixture.state) === fixture.before };
  });
  assert.equal(restored.exact, true, 'Restoring defaults reproduces the same date exactly after rewind and pan');
  assert.equal(restored.untouched, true, 'Graphics experiments never mutate the simulation state');
  await controls.getByTestId('graphics-clouds').uncheck();
  await page.reload();
  const persisted = await page.evaluate(async () => (await import('/src/views/graphics-options.js')).getGraphicsOptions());
  assert.equal(persisted.clouds, false); assert.equal(persisted.water, true);
  assert.deepEqual(errors, []);
  await writeFile(`${output}/result.json`, JSON.stringify({ disabled: { passes: disabled.passes, stats: disabled.stats.graphics }, sharedPass, panned, restored, persisted, errors }, null, 2));
  console.log(`[graphics-options-browser] OK: phone controls, paused toggles, zero disabled animation passes, still-water pan, exact restore, persistence. ${output}/result.json`);
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
