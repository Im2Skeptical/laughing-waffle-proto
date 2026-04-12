import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const PORT = 8080;
const URL = `http://127.0.0.1:${PORT}`;
const SERVE_SCRIPT = "./node_modules/serve/bin/serve.js";

function log(label, value) {
  process.stdout.write(`${label}: ${JSON.stringify(value, null, 2)}\n`);
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
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    }
  );
  child.stdout.on("data", (chunk) => {
    process.stdout.write(String(chunk));
  });
  child.stderr.on("data", (chunk) => {
    process.stderr.write(String(chunk));
  });
  return child;
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

const server = startServer();
let browser = null;

try {
  mkdirSync("artifacts", { recursive: true });
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
  log("initial", initial);

  const availability = await page.evaluate(() => {
    const secs = [1, 2, 4, 8, 16, 32, 48, 52, 60, 64, 68, 69, 70];
    return secs.map((sec) => ({
      sec,
      hasStateData: globalThis.__SETTLEMENT_DEBUG__?.hasStateDataAt?.(sec) ?? false,
      hasState: globalThis.__SETTLEMENT_DEBUG__?.hasStateAt?.(sec) ?? false,
    }));
  });
  log("availability", availability);

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
  log("probeResults", probeResults);

  await page.screenshot({
    path: "artifacts/settlement-browser-probe.png",
    fullPage: true,
  });
} finally {
  await browser?.close();
  server.kill();
}
