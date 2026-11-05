import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { BROWSER_PROBE_LAUNCH_OPTIONS } from './browser-probe-config.mjs';

const url = new URL(process.argv[2] ?? 'http://localhost:5184/');
url.search = '?dev=1&perf=1&art=0&launch=new';
const output = 'artifacts/timegraph-hold';
mkdirSync(output, { recursive: true });
const browser = await chromium.launch(BROWSER_PROBE_LAUNCH_OPTIONS);
const checks = [], errors = [];
let page;
try {
  page = await browser.newPage({ viewport: { width: 1280, height: 800 }, hasTouch: true });
  page.on('pageerror', error => errors.push(error.message));
  // Display permissions are outside this input regression; keep viewport sizing stable.
  await page.addInitScript(() => {
    Element.prototype.requestFullscreen = async () => {};
    screen.orientation.lock = async () => {};
  });
  await page.goto(url.href);
  await page.waitForFunction(() => {
    const s = globalThis.__SETTLEMENT_DEBUG__?.getSnapshot();
    return s?.opening?.phase === 'completed';
  }, null, { timeout: 120000 });
  const snap = () => page.evaluate(() => {
    const s = __SETTLEMENT_DEBUG__.getSnapshot();
    return { viewedSec: s.viewedSec, frontierSec: s.frontierSec,
      target: s.playbackTarget, current: s.playbackCurrent,
      timeline: s.runner.timeline, graph: s.graph };
  });
  const css = async point => {
    const box = await page.locator('canvas').boundingBox();
    return { x: box.x + point.x * box.width / 2424, y: box.y + point.y * box.height / 1080 };
  };
  const graphPoint = ratio => page.evaluate(r => __SETTLEMENT_DEBUG__.getGraphClickPoint(r), ratio);
  for (const viewport of [{ width: 1280, height: 800 }, { width: 844, height: 390 }]) {
    await page.setViewportSize(viewport);
    await delay(150);
    for (const direction of [1, -1]) {
      // Start from the middle so either playback direction has room to move.
      let p = await graphPoint(.5);
      await page.mouse.click(p.x, p.y);
      const timeline = (await snap()).timeline;
      const lever = await page.evaluate(() => __SETTLEMENT_DEBUG__.getTimeLeverScreenRect());
      p = await css({ x: lever.x + lever.width / 2,
        y: lever.y + lever.height * (direction > 0 ? .35 : .65) });
      await page.mouse.click(p.x, p.y);
      const playing = await snap();
      assert.equal(Math.sign(playing.target), direction, 'real lever starts the requested playback direction');
      const drag = direction < 0;
      p = await graphPoint(drag ? .65 : .3);
      await page.mouse.move(p.x, p.y);
      await page.mouse.down();
      let held = await snap();
      assert.equal(held.target, 0, 'graph press immediately puts lever target on Hold');
      assert.equal(held.current, 0, 'graph press immediately clears current playback speed');
      if (drag) {
        p = await graphPoint(.4);
        await page.mouse.move(p.x, p.y, { steps: 5 });
      }
      await page.mouse.up();
      held = await snap();
      assert.ok(held.viewedSec > 0, 'graph selects a nonzero time');
      assert.ok(Math.abs(held.viewedSec - playing.viewedSec) > 1, 'graph moves the viewed time');
      await delay(350);
      const after = await snap();
      assert.equal(after.target, 0, 'playback stays on Hold after release');
      assert.equal(after.viewedSec, held.viewedSec, 'selected time remains fixed after release');
      assert.deepEqual(after.timeline, timeline, 'forecast inspection leaves authoritative history unchanged');
      checks.push({ viewport: viewport.width, direction, gesture: drag ? 'drag' : 'click', second: after.viewedSec });
    }
    // Exercise the same press path with genuine touch input.
    let p = await graphPoint(.5);
    await page.touchscreen.tap(p.x, p.y);
    const lever = await page.evaluate(() => __SETTLEMENT_DEBUG__.getTimeLeverScreenRect());
    p = await css({ x: lever.x + lever.width / 2, y: lever.y + lever.height * .35 });
    await page.touchscreen.tap(p.x, p.y);
    assert.ok((await snap()).target > 0, 'touch lever starts playback');
    p = await graphPoint(.25);
    await page.touchscreen.tap(p.x, p.y);
    const held = await snap();
    await delay(350);
    const after = await snap();
    assert.equal(after.target, 0, 'touch graph tap selects Hold');
    assert.equal(after.viewedSec, held.viewedSec, 'touch-selected time remains fixed');
    checks.push({ viewport: viewport.width, gesture: 'touch', second: after.viewedSec });
  }
  assert.deepEqual(errors, [], 'no browser runtime errors');
  writeFileSync(`${output}/result.json`, JSON.stringify({ ok: true, checks }, null, 2));
  console.log('[timegraph-hold] desktop/mobile click, drag and touch stop forward/reverse playback and preserve history');
} catch (error) {
  const diagnostic = await page?.evaluate(() => {
    const d = globalThis.__SETTLEMENT_DEBUG__, s = d?.getSnapshot();
    return { opening: s?.opening, target: s?.playbackTarget,
      viewedSec: s?.viewedSec, navigation: s?.navigation?.time,
      lever: d?.getTimeLeverScreenRect(), graph: s?.graph?.plotScreenRect,
      canvas: document.querySelector('canvas')?.getBoundingClientRect().toJSON() };
  }).catch(() => null);
  writeFileSync(`${output}/result.json`, JSON.stringify({ ok: false, error: error.stack, errors, checks, diagnostic }, null, 2));
  console.error(`[timegraph-hold] ${error.message}; details=${output}/result.json`);
  process.exitCode = 1;
} finally {
  await browser.close();
}
