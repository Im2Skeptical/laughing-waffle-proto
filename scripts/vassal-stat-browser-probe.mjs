import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';
import { BROWSER_PROBE_LAUNCH_OPTIONS } from './browser-probe-config.mjs';

const output = 'artifacts/vassal-stat';
await mkdir(output, { recursive: true });
const root = path.resolve('.');
const mime = { '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp' };
const server = createServer(async (request, response) => {
  try {
    const pathname = new URL(request.url, 'http://localhost').pathname;
    if (pathname === '/') {
      response.setHeader('Content-Type', 'text/html');
      response.end('<body style="margin:0;background:#171713"><script src="https://cdn.jsdelivr.net/npm/pixi.js@7.2.4/dist/pixi.min.js"></script>');
      return;
    }
    const file = path.resolve(root, `.${decodeURIComponent(pathname)}`);
    if (!file.startsWith(root + path.sep)) throw new Error('Outside checkout');
    response.setHeader('Content-Type', mime[path.extname(file)] ?? 'application/octet-stream');
    response.end(await readFile(file));
  } catch { response.statusCode = 404; response.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser, page;
const errors = [], results = [];
try {
  browser = await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
  for (const viewport of [{ width: 1280, height: 800 }, { width: 844, height: 390 }]) {
    page = await browser.newPage({ viewport, hasTouch: true, reducedMotion: 'reduce' });
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const result = await page.evaluate(async () => {
      const { checkVassalStatViews } = await import('/scripts/vassal-stat-view-checks.js');
      return checkVassalStatViews();
    });
    results.push({ viewport, ...result });
    await page.screenshot({ path: `${output}/${viewport.width}.png` });
    await page.close(); page = null;
  }
  assert.deepEqual(errors, []);
  await writeFile(`${output}/result.json`, JSON.stringify({ ok: true, results }, null, 2));
  console.log('[vassal-stat] PASS desktop/phone: both founders, both established classes, unclassed, cached class transitions, labels/icons/tooltips, state/RNG unchanged');
} catch (error) {
  await page?.screenshot({ path: `${output}/failure.png` }).catch(() => {});
  await writeFile(`${output}/result.json`, JSON.stringify({ error: error.stack, errors, results }, null, 2));
  console.error(`[vassal-stat] FAILED: ${error.message}; ${output}/result.json`);
  process.exitCode = 1;
} finally {
  await browser?.close(); server.close();
}
