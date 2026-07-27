import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const PORT = 8080;
const URL = `http://127.0.0.1:${PORT}`;
const DETAIL_PATH = "artifacts/settlement-browser-probe.json";
const SCREENSHOT_PATH = "artifacts/settlement-browser-probe-latest.png";
const OVERVIEW_SCREENSHOT_PATH =
  "artifacts/settlement-browser-probe-overview.png";

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
  const fullscreenButton = page.getByTestId("fullscreen-toggle");
  assert.equal(await fullscreenButton.count(), 1, "fullscreen control is present");
  assert.equal(await fullscreenButton.innerText(), "Full");

  const initial = await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot());
  assert.equal(initial.worldMap.mode, "map");
  assert.equal(initial.worldMap.regionCount, 15);
  assert.equal(initial.worldMap.detailedSiteMarkerCount, 5);
  assert.equal(initial.worldMap.selectedRegionId, "river-crown");
  assert.equal(initial.worldMap.selectedRegion.structureCapacity, 3);
  assert.equal(initial.worldMap.selectedRegion.usedStructureCapacity, 3);
  assert.equal(initial.worldMap.civilizationSummary.settlementCount, 5);
  assert.equal(initial.worldMap.civilizationSummary.population.total, 165);
  assert.equal(initial.worldMap.civilizationSummary.population.adults, 150);
  assert.equal(initial.worldMap.civilizationSummary.population.elders, 15);
  assert.equal(initial.controller.scope, "civilization");
  assert.equal(initial.controller.subjectKey, "civilization");
  assert.equal(initial.controller.label, "Civilization • All player settlements");
  assert.deepEqual(initial.controller.seriesIds,
    ["totalPopulation", "food", "chaosPower"]);
  assert.equal(initial.worldMap.survivalTracker.year, 1);
  assert.ok(initial.worldMap.survivalTracker.calendarLabel.includes("Civilization Year 1"));

  assert.equal(await page.evaluate(() =>
    globalThis.__SETTLEMENT_DEBUG__.selectWorldRegion("cedar-woods")), true);
  const selected = await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot());
  assert.equal(selected.worldMap.selectedRegionId, "cedar-woods", "debug map selection");
  assert.equal(selected.controller.subjectKey, "civilization",
    "map browsing leaves the timegraph civilization-wide");
  assert.equal(selected.worldMap.selectedRegion.detailedSettlement.elderOrder.resistance, 29);

  await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.forceRender());
  await delay(100);
  await clickDesignPoint(page, { x: 2047, y: 762 });
  const overview = await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot());
  assert.equal(overview.worldMap.mode, "settlement");
  assert.equal(overview.view.regionId, "cedar-woods", "opened selected settlement");
  assert.equal(overview.view.activeTab, "overview");
  assert.equal(overview.view.calendar.seasonKey, "spring");
  assert.equal(overview.view.calendar.year, 1);
  assert.ok(overview.view.calendar.label.includes("Civilization Year 1"));
  assert.equal(overview.controller.scope, "settlement");
  assert.equal(overview.controller.subjectKey, "cedar-woods");
  assert.ok(overview.controller.label.includes("Local"));
  assert.deepEqual(overview.controller.seriesIds,
    ["totalPopulation", "food", "population:villager"]);
  assert.equal(overview.view.overview.practices.length, 5);
  assert.equal(overview.view.elderOrder.resistance, 29);
  await page.screenshot({ path: OVERVIEW_SCREENSHOT_PATH, fullPage: true });

  await clickDesignPoint(page, { x: 2145, y: 36 });
  const demographics = await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot());
  assert.equal(demographics.view.activeTab, "demographics");
  assert.equal(demographics.view.demographics.population.total, 33);

  const openResult = await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.openNextSelection());
  assert.equal(openResult.ok, true);
  assert.equal(await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.isVassalSelectionOpen()), true);
  const pendingSelection = await page.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__.getSnapshot().vassalSelectionPool
  );
  const chosenTargetRegionId = pendingSelection.candidates[0].targetRegionId;
  const selectResult = await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.selectCandidate(0));
  assert.equal(selectResult.ok, true);
  await delay(100);
  await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.forceRender());
  const afterVassal = await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot());
  assert.equal(afterVassal.lineage.selectedVassalIds.length, 1);
  assert.equal(afterVassal.view.regionId, chosenTargetRegionId,
    "vassal choice focuses its target settlement");
  assert.equal(afterVassal.controller.subjectKey, chosenTargetRegionId,
    "local graph follows the focused vassal target");
  assert.ok(
    afterVassal.forecastStatus.currentVassalDeathSec > afterVassal.frontierSec,
    "selected vassal exposes a future death boundary"
  );
  assert.equal(
    afterVassal.pendingCommitJob.deathSec,
    afterVassal.forecastStatus.currentVassalDeathSec,
    "forecast commitment targets the lifespan boundary"
  );
  assert.equal(afterVassal.graph.projectionReplacement.active, true);
  assert.equal(afterVassal.graph.projectionReplacement.hasSnapshot, true);
  await delay(3200);
  await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.forceRender());
  const committedVassalHistory = await page.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__.getSnapshot()
  );
  assert.ok(
    committedVassalHistory.frontierSec > afterVassal.frontierSec,
    "revealed vassal history is committed progressively"
  );
  assert.ok(
    committedVassalHistory.graph.historyZones.some(
      (zone) => zone.kind === "fixedHistory" && zone.endSec > zone.startSec
    ),
    "committed vassal history is visibly classified as fixed"
  );
  assert.ok(
    Number.isFinite(committedVassalHistory.view.survivalTracker.bestSurvivalYear),
    "best civilization survival year is visible"
  );

  await clickDesignPoint(page, { x: 2313, y: 36 });
  const returnedToMap = await page.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__.getSnapshot()
  );
  assert.equal(returnedToMap.worldMap.mode, "map");
  assert.equal(returnedToMap.controller.scope, "civilization");
  assert.equal(returnedToMap.controller.subjectKey, "civilization");
  assert.equal(returnedToMap.graph.projectionReplacement?.active ?? false, false,
    "scope changes never reuse a local comparison snapshot");
  assert.ok(
    returnedToMap.graph.historyZones.some((zone) => zone.kind === "fixedHistory"),
    "vassal history brackets remain after returning to civilization scope"
  );

  await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });
  writeFileSync(DETAIL_PATH, JSON.stringify({
    checks: [
      "15-region map and five detailed sites",
      "site selection and structure capacity",
      "Overview and Demographics tabs",
      "fullscreen control and season/year heading",
      "civilization/local graph scope and automatic focus",
      "civilization summary and persistent survival record",
      "aggregate Elder Order resistance",
      "deterministic vassal chooser, lifespan forecast, and graph replacement",
    ],
    initial: initial.worldMap,
    selected: selected.worldMap,
    overview: overview.view,
    demographics: demographics.view,
    lineage: afterVassal.lineage,
    returnedToMap: {
      worldMap: returnedToMap.worldMap,
      controller: returnedToMap.controller,
      graph: returnedToMap.graph,
    },
    timelineRepair: {
      forecastStatus: afterVassal.forecastStatus,
      pendingCommitJob: afterVassal.pendingCommitJob,
      projectionReplacement: afterVassal.graph.projectionReplacement,
      committedHistory: {
        frontierSec: committedVassalHistory.frontierSec,
        historyZones: committedVassalHistory.graph.historyZones,
      },
    },
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
