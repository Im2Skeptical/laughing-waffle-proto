// Real opening, timeline input and chooser paint latency. Full timings stay in artifacts/.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';

const port = 18189;
const url = `http://localhost:${port}`;
const label = process.env.PROBE_LABEL ?? 'current';
const artifact = `artifacts/vassal-chooser-input-${label}.json`;
const cpuRate = Number(process.env.PROBE_CPU_RATE ?? 4);
mkdirSync('artifacts', { recursive: true });
const server = spawn(process.execPath, ['node_modules/serve/bin/serve.js', '-l', String(port), '--no-clipboard', 'dist'],
  { stdio: 'ignore', windowsHide: true });
let browser, page, cdp, stage = 'boot';
const samples = [], errors = [];
try {
  for (let i = 0; i < 100; i++) {
    try { if ((await fetch(url)).ok) break; } catch {}
    await delay(100);
  }
  browser = await chromium.launch({ headless: true,
    args: ['--enable-gpu', ...(process.platform === 'win32' ? ['--use-angle=d3d11'] : [])] });
  page = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true });
  page.setDefaultTimeout(60000);
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    crypto.getRandomValues = array => { array.fill(123); return array; };
    Element.prototype.requestFullscreen = async () => {};
    screen.orientation.lock = async () => {};
  });
  await page.goto(url);
  await page.getByTestId('game-new').click();
  await page.getByTestId('game-slot-1').click();
  await page.getByTestId('game-menu').waitFor({ state: 'hidden' });
  await page.waitForFunction(() => __SETTLEMENT_DEBUG__.getSnapshot().opening.phase === 'completed');
  const point = method => page.evaluate(method => __SETTLEMENT_DEBUG__[method]('browse'), method);
  const clickPoint = async p => {
    assert.ok(p, 'the requested control has a visible hit target');
    const box = await page.locator('canvas').boundingBox();
    await page.mouse.click(box.x + p.x / 2424 * box.width, box.y + p.y / 1080 * box.height);
  };
  await clickPoint(await point('getRunCompleteClickPoint'));
  cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpuRate });
  if (process.env.PROBE_PROFILE === '1') { await cdp.send('Profiler.enable'); await cdp.send('Profiler.start'); }
  await page.evaluate(() => {
    document.querySelector('canvas').addEventListener('pointerdown', event => {
      if (!globalThis.__chooserInput || __chooserInput.startedAt != null) return;
      if (Math.abs(event.clientX - __chooserInput.targetX) > 2) return;
      const input = __chooserInput;
      input.startedAt = performance.now();
      function frame() {
        if (__SETTLEMENT_DEBUG__.getVassalCandidateClickPoint(0)) input.paintedAt = performance.now();
        else requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }, { capture: true });
  });
  for (const fraction of [null, ...(process.env.PROBE_SCRUBS ?? '0.45').split(',').map(Number)]) {
    stage = fraction == null ? 'open before scrubbing' : `open after timeline click ${fraction}`;
    const { p, rect } = await page.evaluate(() => {
      const s = __SETTLEMENT_DEBUG__.getSnapshot();
      const p = __SETTLEMENT_DEBUG__.getNavigationClickPoint('vassal');
      // Scrubbing can add a Settlement destination and split the wide button.
      // Tap its left portion, which stays inside the chooser in both layouts.
      p.x = Math.min(p.x, s.navigation.rect.x + s.navigation.rect.width / 4);
      return { p, rect: s.graph.plotScreenRect };
    });
    const box = await page.locator('canvas').boundingBox();
    const targetX = box.x + p.x / 2424 * box.width, targetY = box.y + p.y / 1080 * box.height;
    await page.evaluate(targetX => { globalThis.__chooserInput = { targetX }; }, targetX);
    const requestedAtEpochMs = Date.now();
    // Queue the next tap before the scrub's main-thread work can finish. Keep
    // protocol messages in native event order, with no driver/paint waits.
    const inputs = [];
    function enqueueClick(x, y) {
      for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) inputs.push(cdp.send('Input.dispatchMouseEvent',
        { type, x, y, button: type === 'mouseMoved' ? 'none' : 'left', clickCount: 1,
          timestamp: requestedAtEpochMs / 1000 }));
    }
    if (fraction != null) enqueueClick(rect.x + rect.width * fraction, rect.y + rect.height / 2);
    enqueueClick(targetX, targetY);
    await Promise.all(inputs);
    await page.waitForFunction(() => globalThis.__chooserInput?.paintedAt != null);
    const sample = await page.evaluate(() => ({ ...__chooserInput, timeOrigin: performance.timeOrigin,
      viewedSec: __SETTLEMENT_DEBUG__.getSnapshot().viewedSec }));
    samples.push({ fraction, requestedAtEpochMs, ...sample,
      handlerToPaintMs: Math.round(sample.paintedAt - sample.startedAt),
      responseMs: Math.round(sample.paintedAt + sample.timeOrigin - requestedAtEpochMs) });
    writeFileSync(artifact, JSON.stringify({ cpuRate, samples, errors }, null, 2));
    await page.evaluate(() => __SETTLEMENT_DEBUG__.closeVassalSelection());
    await page.waitForFunction(() => !__SETTLEMENT_DEBUG__.isVassalSelectionOpen()
      && !__SETTLEMENT_DEBUG__.getVassalCandidateClickPoint(0));
  }
  assert.deepEqual(errors, []);
  for (const sample of samples) assert.ok(sample.responseMs <= 350,
    `chooser ${sample.fraction == null ? 'before scrub' : 'immediately after scrub'}: expected <=350 ms, actual ${sample.responseMs} ms`);
  console.log(`[vassal-chooser-input] OK (${cpuRate}x CPU): input-to-frame ${samples.map(s => s.responseMs).join(', ')} ms; ${artifact}`);
} catch (error) {
  const failure = await page?.evaluate(() => {
    const a = globalThis.__SETTLEMENT_DEBUG__;
    if (!a) return null;
    const s = a.getSnapshot();
    return { input: globalThis.__chooserInput, viewedSec: s.viewedSec,
      open: a.isVassalSelectionOpen(), navigation: s.navigation,
      scrubSec: s.graph.scrubSec, scrubbing: s.graph.isScrubbing };
  }).catch(() => null);
  writeFileSync(artifact, JSON.stringify({ stage, cpuRate, samples, errors, failure, error: error.stack }, null, 2));
  console.error(`[vassal-chooser-input] FAILED (${stage}): ${error.message}\nReproduce: node scripts/vassal-chooser-input-performance-probe.mjs\nDetails: ${artifact}`);
  process.exitCode = 1;
} finally {
  if (process.env.PROBE_PROFILE === '1' && cdp) {
    const { profile } = await cdp.send('Profiler.stop').catch(() => ({}));
    if (profile) writeFileSync(`artifacts/vassal-chooser-input-${label}.cpuprofile`, JSON.stringify(profile));
  }
  await browser?.close(); server.kill();
}
