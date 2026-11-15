// A1-01 control (WP2): a main-thread stall that starts BEFORE input dispatch
// must show up as input delay in both the harness arrival clock
// (handlerNow - event.timeStamp from the first-registered window capture mark)
// and in the browser's own Event Timing (processingStart - startTime).
// Cheap interaction: a press/release on the static menu title (no app work).
// Each trial is a fresh browser context so the first-input entry is always
// reported regardless of duration (Event Timing 'event' entries need >=16 ms).
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { startServer, launchPage, closeSession } from './browser.mjs';
import { quantile } from './statistics.mjs';
import { REPO_ROOT, ARTIFACT_ROOT_REL, CONTRACT_ID, HARNESS_ID, collectBuildAssets } from './identities.mjs';

const STALL_MS = 250;
const PASS_STALLED_MS = 150;
const PASS_UNSTALLED_MS = 50;

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

async function trial({ server, stalled, index, screenshotPath = null }) {
  const session = await launchPage({ url: server.url, setSeed: false });
  const { page, cdp } = session;
  try {
    const title = page.getByRole('heading', { name: 'Civilization Survivor' }).first();
    await title.waitFor({ state: 'visible', timeout: 60000 });
    // Let startup settle so the unstalled twin is not queued behind boot work.
    await page.waitForTimeout(1500);
    const box = await title.boundingBox();
    const x = Math.round(box.x + box.width / 2), y = Math.round(box.y + box.height / 2);
    await page.evaluate(() => { globalThis.__hcInputMarks = []; });
    const stallInfo = await page.evaluate((ms) => {
      const info = { scheduledAt: performance.now(), stallStart: null, stallEnd: null };
      globalThis.__hcStall = info;
      if (ms > 0) {
        setTimeout(() => {
          info.stallStart = performance.now();
          const until = info.stallStart + ms;
          while (performance.now() < until) { /* pre-dispatch main-thread stall */ }
          info.stallEnd = performance.now();
        }, 0);
      }
      return info;
    }, stalled ? STALL_MS : 0);
    // Raw CDP input, no Playwright actionability waits. Not awaited in sequence
    // with the stall: the browser process timestamps it while the renderer is busy.
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    await page.waitForTimeout(300);
    if (screenshotPath) await page.screenshot({ path: screenshotPath }).catch(() => {});
    const data = await page.evaluate(() => ({
      marks: globalThis.__hcInputMarks,
      eventTiming: globalThis.__hcEventTiming,
      stall: globalThis.__hcStall,
    }));
    const down = data.marks.find((m) => m.type === 'pointerdown') ?? data.marks[0] ?? null;
    const harnessDelayMs = down ? down.handlerNow - down.timeStamp : null;
    const etCandidates = data.eventTiming.filter((e) => /pointerdown|mousedown/.test(e.name));
    const et = etCandidates.find((e) => e.name.startsWith('first-input')) ?? etCandidates[0] ?? null;
    const eventTimingDelayMs = et ? et.processingStart - et.startTime : null;
    const arrivedDuringStall = stalled && down && data.stall.stallStart != null
      ? down.timeStamp >= data.stall.stallStart - 1 && down.timeStamp <= data.stall.stallEnd
      : null;
    return {
      job: 'a1-01-input-delay', step: stalled ? 'stalled' : 'unstalled',
      launchId: `a1-01-${stalled ? 's' : 'u'}-${index}`, observationId: `a1-01-${stalled ? 's' : 'u'}-${index}`,
      stalled, stallMs: stalled ? STALL_MS : 0, harnessDelayMs, eventTimingDelayMs, arrivedDuringStall,
      mark: down, eventTimingEntry: et, eventTimingAll: data.eventTiming, stall: data.stall, point: { x, y },
      browserVersion: session.browserVersion, graphicsApplied: session.applied,
      buildId: collectBuildAssets().buildAssetSha256 ?? 'missing-dist', harnessId: HARNESS_ID, measurementContractId: CONTRACT_ID,
      comparisonEligible: false, errors: session.errors.slice(0, 4), screenshotPath,
    };
  } finally {
    await closeSession(session);
  }
}

export async function runInputDelayControl({ outDir, reps = 3, screenshotDir = outDir } = {}) {
  const server = await startServer();
  const rows = [];
  try {
    for (let i = 0; i < reps; i++) {
      // Alternate order so drift cannot favour one arm.
      for (const stalled of i % 2 === 0 ? [true, false] : [false, true]) {
        rows.push(await trial({
          server, stalled, index: i,
          screenshotPath: i === 0 && screenshotDir ? path.join(screenshotDir, `a1-01-${stalled ? 'stalled' : 'unstalled'}-0.png`) : null,
        }));
      }
    }
  } finally {
    await server.close();
  }
  const pick = (arm, key) => rows.filter((r) => r.stalled === arm).map((r) => r[key]);
  const allFinite = (xs) => xs.length > 0 && xs.every(Number.isFinite);
  const s = { harness: pick(true, 'harnessDelayMs'), et: pick(true, 'eventTimingDelayMs') };
  const u = { harness: pick(false, 'harnessDelayMs'), et: pick(false, 'eventTimingDelayMs') };
  const passed = allFinite(s.harness) && allFinite(s.et) && allFinite(u.harness) && allFinite(u.et)
    && s.harness.every((v) => v >= PASS_STALLED_MS) && s.et.every((v) => v >= PASS_STALLED_MS)
    && u.harness.every((v) => v < PASS_UNSTALLED_MS) && u.et.every((v) => v < PASS_UNSTALLED_MS);
  const summary = {
    id: 'a1-01-pre-dispatch-input-stall', passed, reps, stallMs: STALL_MS,
    thresholds: { stalledMinMs: PASS_STALLED_MS, unstalledMaxMs: PASS_UNSTALLED_MS, rule: 'every rep, both clocks' },
    stalled: { harnessDelayMs: s.harness, eventTimingDelayMs: s.et,
      harnessP50: allFinite(s.harness) ? quantile(s.harness, 0.5) : null, eventTimingP50: allFinite(s.et) ? quantile(s.et, 0.5) : null,
      arrivedDuringStall: rows.filter((r) => r.stalled).map((r) => r.arrivedDuringStall) },
    unstalled: { harnessDelayMs: u.harness, eventTimingDelayMs: u.et,
      harnessP50: allFinite(u.harness) ? quantile(u.harness, 0.5) : null, eventTimingP50: allFinite(u.et) ? quantile(u.et, 0.5) : null },
    at: new Date().toISOString(),
  };
  mkdirSync(outDir, { recursive: true });
  writeFileSync(path.join(outDir, 'raw-a1-01.json'), JSON.stringify(rows, null, 2));
  writeFileSync(path.join(outDir, 'a1-01-summary.json'), JSON.stringify(summary, null, 2));
  return summary;
}

if (process.argv[1]?.endsWith('input-delay.mjs')) {
  const id = arg('id', `a1-01-${Date.now()}`);
  const outDir = path.join(REPO_ROOT, ARTIFACT_ROOT_REL, id);
  const summary = await runInputDelayControl({ outDir, reps: Number(arg('reps', '3')) });
  console.log(JSON.stringify({ id, passed: summary.passed, stalled: summary.stalled, unstalled: summary.unstalled, artifact: outDir }));
  process.exit(summary.passed ? 0 : 1);
}
