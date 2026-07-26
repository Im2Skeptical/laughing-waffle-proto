import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const PORT = 8080;
const URL = `http://127.0.0.1:${PORT}`;
const DETAIL_PATH = "artifacts/settlement-browser-probe.json";
const SCREENSHOT_PATH = "artifacts/settlement-browser-probe-latest.png";

async function waitForHttp() {
  for (let attempt = 0; attempt < 150; attempt += 1) {
    try {
      if ((await fetch(URL)).ok) return;
    } catch {}
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${URL}`);
}

async function clickDesignPoint(page, point) {
  const box = await page.locator("canvas").boundingBox();
  if (!box || !point) throw new Error("Canvas point unavailable");
  await page.mouse.click(
    box.x + point.x / 2424 * box.width,
    box.y + point.y / 1080 * box.height
  );
  await delay(150);
}

mkdirSync("artifacts", { recursive: true });
const server = spawn(process.execPath,
  ["./node_modules/serve/bin/serve.js", "dist", "-l", String(PORT), "--no-clipboard"],
  { stdio: "ignore", windowsHide: true });
let browser;
try {
  await waitForHttp();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(URL);
  await page.waitForFunction(() => !!globalThis.__SETTLEMENT_DEBUG__?.getSnapshot);

  const initial = await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot());
  assert.equal(initial.worldMap.mode, "map");
  assert.equal(initial.worldMap.regionCount, 15);
  assert.equal(initial.worldMap.detailedSiteMarkerCount, 5);
  assert.equal(initial.worldMap.selectedRegionId, "river-crown");
  assert.equal(initial.worldMap.selectedRegion.structureCapacity, 3);
  assert.equal(initial.worldMap.selectedRegion.usedStructureCapacity, 3);

  assert.equal(await page.evaluate(() =>
    globalThis.__SETTLEMENT_DEBUG__.selectWorldRegion("cedar-woods")), true);
  const selected = await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot());
  assert.equal(selected.worldMap.selectedRegionId, "cedar-woods", "debug map selection");
  assert.equal(selected.controller.subjectKey, "cedar-woods", "timegraph follows selected site");
  assert.equal(selected.worldMap.selectedRegion.detailedSettlement.elderOrder.resistance, 29);

  await clickDesignPoint(page, { x: 2047, y: 762 });
  const overview = await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot());
  assert.equal(overview.worldMap.mode, "settlement");
  assert.equal(overview.view.regionId, "cedar-woods", "opened selected settlement");
  assert.equal(overview.view.activeTab, "overview");
  assert.equal(overview.view.overview.practices.length, 5);
  assert.equal(overview.view.elderOrder.resistance, 29);

  await clickDesignPoint(page, { x: 2145, y: 36 });
  const demographics = await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot());
  assert.equal(demographics.view.activeTab, "demographics");
  assert.equal(demographics.view.demographics.population.total, 33);

  const openResult = await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.openNextSelection());
  assert.equal(openResult.ok, true);
  assert.equal(await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.isVassalSelectionOpen()), true);
  const selectResult = await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.selectCandidate(0));
  assert.equal(selectResult.ok, true);
  const afterVassal = await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot());
  assert.equal(afterVassal.lineage.selectedVassalIds.length, 1);

  await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });
  writeFileSync(DETAIL_PATH, JSON.stringify({
    checks: [
      "15-region map and five detailed sites",
      "site selection and structure capacity",
      "Overview and Demographics tabs",
      "aggregate Elder Order resistance",
      "deterministic vassal chooser and selection",
    ],
    initial: initial.worldMap,
    selected: selected.worldMap,
    overview: overview.view,
    demographics: demographics.view,
    lineage: afterVassal.lineage,
  }, null, 2));
  process.stdout.write(`[probe:settlement] OK\n[probe:settlement] details=${DETAIL_PATH}\n`);
} catch (error) {
  writeFileSync(DETAIL_PATH, JSON.stringify({ error: error.stack ?? error.message }, null, 2));
  process.stdout.write(`[probe:settlement] FAILED\n[probe:settlement] error=${error.message}\n`);
  process.exitCode = 1;
} finally {
  await browser?.close();
  server.kill();
}
