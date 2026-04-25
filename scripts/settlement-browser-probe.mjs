import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const PORT = 8080;
const URL = `http://127.0.0.1:${PORT}`;
const SERVE_SCRIPT = "./node_modules/serve/bin/serve.js";
const ARTIFACT_DIR = "artifacts";
const DETAIL_PATH = `${ARTIFACT_DIR}/settlement-browser-probe.json`;
const SCREENSHOT_PATH = `${ARTIFACT_DIR}/settlement-browser-probe-latest.png`;
const VERBOSE = process.argv.includes("--verbose");

function logLine(message) {
  process.stdout.write(`${message}\n`);
}

function logJson(label, value) {
  if (!VERBOSE) return;
  process.stdout.write(`${label}: ${JSON.stringify(value, null, 2)}\n`);
}

function summarizeProbeResult(result) {
  const graph = result?.graph ?? null;
  return {
    ratio: result?.ratio ?? null,
    viewedSec: result?.viewedSec ?? null,
    previewCapSec: result?.previewCapSec ?? null,
    scrubSec: graph?.scrubSec ?? null,
    visibleForecastCoverageEndSec: graph?.visibleForecastCoverageEndSec ?? null,
    previewStatus: result?.previewStatus ?? null,
  };
}

function buildSummary({ initial, availability, probeResults }) {
  const missingAvailability = availability.filter(
    (entry) => !entry.hasStateData && !entry.hasState
  );
  const nullProbeCount = probeResults.filter((entry) => entry.viewedSec == null).length;
  return {
    status: "completed",
    frontierSec: initial?.frontierSec ?? null,
    viewedSec: initial?.viewedSec ?? null,
    browseCapSec: initial?.browseCapSec ?? null,
    previewCapSec: initial?.previewCapSec ?? null,
    availabilityChecked: availability.length,
    missingAvailabilityCount: missingAvailability.length,
    probeCount: probeResults.length,
    nullProbeCount,
    firstProbe: summarizeProbeResult(probeResults[0] ?? null),
    lastProbe: summarizeProbeResult(probeResults[probeResults.length - 1] ?? null),
  };
}

async function waitForHttp(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch (_) {
      // Server not ready yet.
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

function startServer() {
  const child = spawn(
    process.execPath,
    [SERVE_SCRIPT, "-l", String(PORT), "."],
    {
      stdio: ["ignore", "ignore", "ignore"],
      windowsHide: true,
    }
  );
  return child;
}

function writeDetails(payload) {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  writeFileSync(DETAIL_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function clickGraphRatio(page, ratioX, ratioY = 0.5) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const point = await page.evaluate(
        ({ ratioX: rx, ratioY: ry }) =>
          globalThis.__SETTLEMENT_DEBUG__?.getGraphClickPoint?.(rx, ry) ?? null,
        { ratioX, ratioY }
      );
      if (!point) {
        throw new Error(`No graph click point for ratio ${ratioX}`);
      }
      await page.mouse.click(point.x, point.y);
      await delay(120);
      return await page.evaluate(
        () => globalThis.__SETTLEMENT_DEBUG__?.getSnapshot?.() ?? null
      );
    } catch (error) {
      const message = String(error?.message ?? error ?? "");
      if (
        attempt >= 1 ||
        !message.includes("Execution context was destroyed")
      ) {
        throw error;
      }
      await page.waitForFunction(
        () => globalThis.__SETTLEMENT_DEBUG__?.getSnapshot,
        null,
        { timeout: 30000 }
      );
      await delay(120);
    }
  }
  return null;
}

async function main() {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  const server = startServer();
  let browser = null;
  try {
  await waitForHttp(URL);
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 1536, height: 768 },
    deviceScaleFactor: 1,
  });
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => globalThis.__SETTLEMENT_DEBUG__?.getSnapshot);
  await delay(1500);
  await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__?.forceRender?.());
  await delay(250);

  const initial = await page.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__?.getSnapshot?.() ?? null
  );
  logJson("initial", initial);

  const availability = await page.evaluate(() => {
    const secs = [1, 2, 4, 8, 16, 32, 48, 52, 60, 64, 68, 69, 70];
    return secs.map((sec) => ({
      sec,
      hasStateData: globalThis.__SETTLEMENT_DEBUG__?.hasStateDataAt?.(sec) ?? false,
      hasState: globalThis.__SETTLEMENT_DEBUG__?.hasStateAt?.(sec) ?? false,
    }));
  });
  logJson("availability", availability);

  const probeRatios = [0, 0.0025, 0.005, 0.01, 0.015, 0.02, 0.03, 0.04, 0.05];
  const probeResults = [];
  for (const ratio of probeRatios) {
    const snapshot = await clickGraphRatio(page, ratio, 0.5);
    probeResults.push({
      ratio,
      viewedSec: snapshot?.viewedSec ?? null,
      previewCapSec: snapshot?.previewCapSec ?? null,
      graph: snapshot?.graph
        ? {
            scrubSec: snapshot.graph.scrubSec,
            minSec: snapshot.graph.minSec,
            maxSec: snapshot.graph.maxSec,
            statusNote: snapshot.graph.statusNote,
            visibleForecastCoverageEndSec:
              snapshot.graph.visibleForecastCoverageEndSec,
          }
        : null,
      previewStatus: snapshot?.runner?.previewStatus ?? null,
    });
  }
  logJson("probeResults", probeResults);

  await page.screenshot({
    path: SCREENSHOT_PATH,
    fullPage: true,
  });

  const summary = buildSummary({ initial, availability, probeResults });
  writeDetails({ summary, initial, availability, probeResults });
  logLine("[probe:settlement] OK");
  logLine(
    `[probe:settlement] frontier=${summary.frontierSec} viewed=${summary.viewedSec} browseCap=${summary.browseCapSec} previewCap=${summary.previewCapSec}`
  );
  logLine(
    `[probe:settlement] availability=${summary.availabilityChecked} missing=${summary.missingAvailabilityCount} probes=${summary.probeCount} null=${summary.nullProbeCount}`
  );
  logLine(`[probe:settlement] details=${DETAIL_PATH}`);
  logLine(`[probe:settlement] screenshot=${SCREENSHOT_PATH}`);
  } finally {
    await browser?.close();
    server.kill();
  }
}

main().catch((error) => {
  const message = String(error?.message ?? error ?? "Unknown failure");
  writeDetails({
    summary: {
      status: "failed",
      error: message,
      reproduction: "npm run probe:settlement",
    },
    error: {
      message,
      stack: error?.stack ?? null,
    },
  });
  logLine("[probe:settlement] FAILED");
  logLine(`[probe:settlement] error=${message}`);
  logLine("[probe:settlement] expected=browser probe completes and captures settlement debug snapshot");
  logLine("[probe:settlement] actual=probe failed before completion");
  logLine("[probe:settlement] reproduce=npm run probe:settlement");
  logLine(`[probe:settlement] details=${DETAIL_PATH}`);
  process.exit(1);
});
