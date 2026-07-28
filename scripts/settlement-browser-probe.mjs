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

async function pressDesignPoint(page, point, holdMs = 120) {
  const box = await page.locator("canvas").boundingBox();
  if (!box || !point) throw new Error("Canvas point unavailable");
  const x = box.x + point.x / 2424 * box.width;
  const y = box.y + point.y / 1080 * box.height;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await delay(holdMs);
  await page.mouse.up();
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
  assert.equal(initial.worldMap.regionNameLabelsVisible, false);
  const detailedMapIndicators = initial.worldMap.regionMapIndicators.filter(
    (indicator) => indicator.hasDetailedSettlement
  );
  assert.equal(detailedMapIndicators.length, 5);
  assert.deepEqual(
    initial.worldMap.regionMapIndicators.map(
      (indicator) => indicator.structureCapacity
    ),
    [3, 4, 4, 3, 3, 5, 3, 4, 4, 4, 4, 3, 4, 5, 3],
    "all regions expose their authored structure capacity"
  );
  assert.ok(
    initial.worldMap.regionMapIndicators
      .filter((indicator) => !indicator.hasDetailedSettlement)
      .every(
        (indicator) =>
          indicator.usedStructureCapacity === 0 &&
          indicator.structureSlots.length === indicator.structureCapacity &&
          indicator.structureSlots.every((slot) => slot == null)
      ),
    "non-detailed regions render their capacity as open building slots"
  );
  assert.equal(
    initial.worldMap.regionMapIndicators.filter(
      (indicator) => indicator.showsPlayerMarker
    ).length,
    5,
    "player-owned regions have ownership nodes"
  );
  assert.ok(
    detailedMapIndicators.every(
      (indicator) =>
        indicator.activeWorkerCount === 3 &&
        indicator.renderedPawnCount === 3 &&
        indicator.badgeValue == null
    ),
    "starting sites render three assigned worker pawns"
  );
  assert.deepEqual(
    detailedMapIndicators.map((indicator) => ({
      regionId: indicator.regionId,
      used: indicator.usedStructureCapacity,
      capacity: indicator.structureCapacity,
    })),
    [
      { regionId: "cedar-woods", used: 3, capacity: 3 },
      { regionId: "west-levee", used: 3, capacity: 4 },
      { regionId: "upper-floodplain", used: 3, capacity: 5 },
      { regionId: "river-crown", used: 3, capacity: 3 },
      { regionId: "lake-country", used: 3, capacity: 4 },
    ],
    "filled and open building glyphs follow local structure slots"
  );
  assert.equal(initial.worldMap.civilizationSummary.settlementCount, 5);
  assert.equal(initial.worldMap.civilizationSummary.population.total, 165);
  assert.equal(initial.worldMap.civilizationSummary.population.adults, 150);
  assert.equal(initial.worldMap.civilizationSummary.population.elders, 15);
  assert.equal(initial.controller.scope, "civilization");
  assert.equal(initial.controller.subjectKey, "civilization");
  assert.equal(initial.controller.label, "Civilization • All player settlements");
  assert.deepEqual(initial.controller.seriesIds,
    ["totalPopulation", "food", "chaosPower"]);
  assert.deepEqual(
    initial.graph.renderedSeriesSamples.map(({ seriesId, first }) => ({
      seriesId,
      value: first?.value,
    })),
    [
      { seriesId: "totalPopulation", value: 165 },
      { seriesId: "food", value: 300 },
      { seriesId: "chaosPower", value: 0 },
    ],
    "civilization graph renders aggregate values"
  );
  assert.equal(initial.worldMap.survivalTracker.year, 1);
  assert.ok(initial.worldMap.survivalTracker.calendarLabel.includes("Civilization Year 1"));
  assert.equal(initial.worldMap.survivalTracker.projectedLossYear, null);
  assert.equal(initial.worldMap.survivalTracker.bestSurvivalYear, null);
  assert.ok(initial.worldMap.survivalTracker.forecastLabel.includes("Forecasting"));

  await page.waitForFunction(() => {
    const graph = globalThis.__SETTLEMENT_DEBUG__?.getSnapshot?.()?.graph;
    return (
      Number.isFinite(graph?.revealedCoverageEndSec) &&
      graph.revealedCoverageEndSec > 0 &&
      graph.revealedCoverageEndSec < graph.forecastRevealTargetEndSec
    );
  });
  const revealFollowStart = await page.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__.getSnapshot().graph
  );
  assert.equal(revealFollowStart.forecastRevealPlayheadFollowEnabled, true);
  assert.ok(
    Math.abs(
      revealFollowStart.scrubSec -
      revealFollowStart.revealedCoverageEndSec
    ) <= 1,
    "playhead begins on the visible reveal edge"
  );
  await page.waitForFunction(
    (startSec) => {
      const graph = globalThis.__SETTLEMENT_DEBUG__?.getSnapshot?.()?.graph;
      return (
        graph?.forecastRevealPlayheadFollowEnabled === true &&
        graph.revealedCoverageEndSec > startSec + 1 &&
        Math.abs(graph.scrubSec - graph.revealedCoverageEndSec) <= 1
      );
    },
    revealFollowStart.revealedCoverageEndSec
  );
  const cedarPoint = await page.evaluate(() =>
    globalThis.__SETTLEMENT_DEBUG__.getWorldMapClickPoint("cedar-woods"));
  await pressDesignPoint(page, cedarPoint);
  const selected = await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot());
  assert.equal(
    selected.worldMap.selectedRegionId,
    "cedar-woods",
    "a human-duration press selects a region while the graph is unveiling"
  );
  assert.equal(selected.worldMap.lastPointerRegionId, "cedar-woods");
  assert.equal(selected.controller.subjectKey, "civilization",
    "map browsing leaves the timegraph civilization-wide");
  assert.equal(selected.worldMap.selectedRegion.detailedSettlement.elderOrder.resistance, 29);
  if (selected.displayedLossInfo?.resolved !== true) {
    assert.equal(selected.worldMap.survivalTracker.projectedLossYear, null);
    assert.equal(selected.worldMap.survivalTracker.bestSurvivalYear, null);
    assert.ok(selected.worldMap.survivalTracker.forecastLabel.includes("Forecasting"));
  }

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
  assert.deepEqual(
    overview.graph.renderedSeriesSamples.map(({ seriesId, first }) => ({
      seriesId,
      value: first?.value,
    })),
    [
      { seriesId: "totalPopulation", value: 33 },
      { seriesId: "food", value: 60 },
      { seriesId: "population:villager", value: 33 },
    ],
    "local graph replaces aggregate lines with the selected settlement values"
  );
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
  if (committedVassalHistory.forecastStatus.projectedLossResolved === true) {
    assert.ok(
      Number.isFinite(
        committedVassalHistory.view.survivalTracker.bestSurvivalYear
      ),
      "a resolved projected loss updates the best civilization survival year"
    );
  } else {
    assert.ok(
      committedVassalHistory.view.survivalTracker.forecastLabel.includes(
        "Forecasting"
      ),
      "unresolved loss coverage remains explicitly marked as forecasting"
    );
  }

  await clickDesignPoint(page, { x: 2313, y: 36 });
  const returnedToMap = await page.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__.getSnapshot()
  );
  assert.equal(returnedToMap.worldMap.mode, "map");
  assert.equal(returnedToMap.controller.scope, "civilization");
  assert.equal(returnedToMap.controller.subjectKey, "civilization");
  assert.equal(returnedToMap.graph.projectionReplacement?.active ?? false, false,
    "scope changes never reuse a local comparison snapshot");
  assert.deepEqual(
    returnedToMap.graph.renderedSeriesSamples.map(({ seriesId, first }) => ({
      seriesId,
      value: first?.value,
    })),
    [
      { seriesId: "totalPopulation", value: 165 },
      { seriesId: "food", value: 300 },
      { seriesId: "chaosPower", value: 0 },
    ],
    "returning to the map restores civilization graph values"
  );
  assert.ok(
    returnedToMap.graph.historyZones.some((zone) => zone.kind === "fixedHistory"),
    "vassal history brackets remain after returning to civilization scope"
  );

  const terminalPage = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });
  await terminalPage.goto(URL);
  await terminalPage.waitForFunction(() => {
    const graph = globalThis.__SETTLEMENT_DEBUG__?.getSnapshot?.()?.graph;
    return (
      graph?.forecastRevealPlayheadFollowEnabled === true &&
      graph.revealedCoverageEndSec > 320 &&
      graph.revealedCoverageEndSec < graph.forecastRevealTargetEndSec
    );
  });
  const followingGraph = await terminalPage.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__.getSnapshot().graph
  );
  const manualTarget = {
    x: followingGraph.plotScreenRect.x +
      followingGraph.plotScreenRect.width * 0.2,
    y: followingGraph.plotScreenRect.y +
      followingGraph.plotScreenRect.height * 0.5,
  };
  await terminalPage.mouse.click(manualTarget.x, manualTarget.y);
  await delay(100);
  const manualGraph = await terminalPage.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__.getSnapshot().graph
  );
  assert.equal(
    manualGraph.forecastRevealPlayheadFollowEnabled,
    false,
    "manual scrubbing takes ownership of the playhead"
  );
  const manualScrubSec = manualGraph.scrubSec;
  await delay(350);
  await terminalPage.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__.forceRender()
  );
  const manualGraphLater = await terminalPage.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__.getSnapshot().graph
  );
  assert.equal(manualGraphLater.scrubSec, manualScrubSec);
  assert.ok(
    manualGraphLater.revealedCoverageEndSec >= manualGraph.revealedCoverageEndSec,
    "forecast reveal continues without stealing back a manually placed playhead"
  );
  await terminalPage.reload();
  await terminalPage.waitForFunction(
    () => {
      const tracker =
        globalThis.__SETTLEMENT_DEBUG__?.getSnapshot?.()?.worldMap
          ?.survivalTracker;
      return (
        Number.isFinite(tracker?.projectedLossYear) &&
        Number.isFinite(tracker?.bestSurvivalYear)
      );
    },
    null,
    { timeout: 45000 }
  );
  const terminalSurvival = await terminalPage.evaluate(
    () =>
      globalThis.__SETTLEMENT_DEBUG__.getSnapshot().worldMap.survivalTracker
  );
  assert.equal(terminalSurvival.projectedLossYear, 73);
  assert.equal(
    terminalSurvival.bestSurvivalYear,
    73,
    "the completed forecast records a numeric best civilization survival year"
  );
  await terminalPage.close();

  await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });
  writeFileSync(DETAIL_PATH, JSON.stringify({
    checks: [
      "15-region map and five detailed sites",
      "site selection and structure capacity",
      "Overview and Demographics tabs",
      "fullscreen control and season/year heading",
      "civilization/local graph scope and automatic focus",
      "civilization summary and persistent survival record",
      "completed forecast resolves projected and best survival years",
      "forecast unveil advances the playhead until manual scrub ownership",
      "map selection during active forecast unveiling",
      "aggregate Elder Order resistance",
      "deterministic vassal chooser, lifespan forecast, and graph replacement",
    ],
    initial: initial.worldMap,
    selected: selected.worldMap,
    overview: overview.view,
    demographics: demographics.view,
    lineage: afterVassal.lineage,
    terminalSurvival,
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
