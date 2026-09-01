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
const WIDE_HEADER_SCREENSHOT_PATH =
  "artifacts/settlement-browser-probe-wide-header.png";
const LIFE_MAP_SCREENSHOT_PATH =
  "artifacts/settlement-browser-probe-lifemap-1280x800.png";
const ACTIVE_NODE_SCREENSHOT_PATH =
  "artifacts/settlement-browser-probe-active-node-1280x800.png";
const VASSAL_CHOOSER_SCREENSHOT_PATH =
  "artifacts/settlement-browser-probe-vassal-chooser-1280x800.png";

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

async function doubleClickDesignPoint(page, point) {
  const box = await page.locator("canvas").boundingBox();
  if (!box || !point) throw new Error("Canvas point unavailable");
  const x = box.x + point.x / 2424 * box.width;
  const y = box.y + point.y / 1080 * box.height;
  await page.mouse.move(x, y);
  await page.mouse.dblclick(x, y, { delay: 80 });
  await delay(150);
}

mkdirSync("artifacts", { recursive: true });
const server = spawn(process.execPath,
  ["./node_modules/serve/bin/serve.js", "-l", String(PORT), "--no-clipboard", "dist"],
  { stdio: "ignore", windowsHide: true });
let browser;
try {
  await waitForHttp();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.addInitScript(() => {
    localStorage.setItem("civsurvivor.debugProfiles.boot.v2", "probe-authored-setup");
  });
  const workerUrls = [];
  page.on("worker", (worker) => workerUrls.push(worker.url()));
  await page.goto(URL);
  await page.waitForFunction(() => !!globalThis.__SETTLEMENT_DEBUG__?.getSnapshot);
  assert.equal(
    await page.getByTestId("fullscreen-toggle").count(),
    0,
    "desktop fullscreen control is absent"
  );

  const initial = await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot());
  assert.equal(initial.worldMap.mode, "map");
  assert.equal(initial.worldMap.regionCount, 15);
  assert.equal(initial.worldMap.detailedSiteMarkerCount, 5);
  assert.equal(initial.worldMap.selectedRegionId, "river-crown");
  assert.equal(initial.worldMap.regionSelectionActive, false);
  assert.equal(initial.worldMap.graphScope, "civilization");
  assert.ok(initial.worldMap.selectedRegion.structureCapacity >= 5);
  assert.ok(initial.worldMap.selectedRegion.structureCapacity <= 8);
  assert.equal(initial.worldMap.selectedRegion.usedStructureCapacity, 2);
  assert.equal(initial.worldMap.regionNameLabelsVisible, true);
  assert.deepEqual(initial.worldMap.regionReferences.map((entry) => entry.reference),
    Array.from({ length: 15 }, (_, index) => `R${String(index + 1).padStart(2, "0")}`));
  const detailedMapIndicators = initial.worldMap.regionMapIndicators.filter(
    (indicator) => indicator.hasDetailedSettlement
  );
  assert.equal(detailedMapIndicators.length, 5);
  assert.ok(detailedMapIndicators.every((indicator) =>
    typeof indicator.pressure?.starvation === "boolean"
      && typeof indicator.pressure?.overcrowding === "boolean"
  ), "detailed region indicators expose starvation and overcrowding state");
  assert.ok(
    initial.worldMap.regionMapIndicators.every(
      (indicator) => indicator.structureCapacity >= 5
        && indicator.structureCapacity <= 8
    ),
    "all regions expose their deterministic 5-8 structure capacity roll"
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
        indicator.activeWorkerCount >= 0 &&
        indicator.unusedWorkerCount >= 0 &&
        indicator.totalWorkerCount ===
          indicator.activeWorkerCount + indicator.unusedWorkerCount &&
        indicator.renderedPawnCount ===
          Math.min(5, indicator.totalWorkerCount) &&
        (indicator.unusedWorkerCount === 0 ||
          indicator.renderedUnusedPawnCount >= 1) &&
        indicator.badgeValue ===
          (indicator.totalWorkerCount > 5
            ? indicator.totalWorkerCount
            : null)
    ),
    "active and unused worker pawns match the unveiled worker pools"
  );
  assert.deepEqual(
    detailedMapIndicators.map((indicator) => ({
      regionId: indicator.regionId,
      used: indicator.usedStructureCapacity,
    })),
    [
      { regionId: "cedar-woods", used: 2 },
      { regionId: "west-levee", used: 2 },
      { regionId: "upper-floodplain", used: 2 },
      { regionId: "river-crown", used: 2 },
      { regionId: "lake-country", used: 2 },
    ],
    "filled and open building glyphs follow local structure slots"
  );
  assert.ok(detailedMapIndicators.every((indicator) =>
    indicator.structureCapacity >= 5 && indicator.structureCapacity <= 8));
  assert.equal(initial.worldMap.civilizationSummary.settlementCount, 5);
  assert.ok(initial.worldMap.civilizationSummary.population.total >= 0);
  assert.ok(initial.worldMap.civilizationSummary.population.adults >= 0);
  assert.ok(initial.worldMap.civilizationSummary.population.elders >= 0);
  assert.equal(initial.controller.scope, "civilization");
  assert.equal(initial.controller.subjectKey, "civilization");
  assert.equal(initial.controller.label, "Civilization • All player settlements");
  assert.deepEqual(initial.controller.seriesIds,
    ["totalPopulation", "food", "chaosPower", "chaosRawPressure", "chaosResistance"]);
  assert.deepEqual(
    initial.graph.renderedSeriesSamples.map(({ seriesId, first }) => ({
      seriesId,
      value: first?.value,
    })),
    [
      { seriesId: "totalPopulation", value: 115 },
      { seriesId: "food", value: 300 },
      { seriesId: "chaosPower", value: 0 },
      { seriesId: "chaosRawPressure", value: 0 },
      { seriesId: "chaosResistance", value: 0 },
    ],
    "civilization graph renders aggregate values"
  );
  assert.ok(initial.worldMap.survivalTracker.year >= 1);
  assert.ok(
    initial.worldMap.survivalTracker.calendarLabel.includes(
      `Civilization Year ${initial.worldMap.survivalTracker.year}`
    )
  );
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
      const snapshot = globalThis.__SETTLEMENT_DEBUG__?.getSnapshot?.();
      const graph = snapshot?.graph;
      return (
        graph?.forecastRevealPlayheadFollowEnabled === true &&
        graph.revealedCoverageEndSec > startSec + 1 &&
        Math.abs(graph.scrubSec - graph.revealedCoverageEndSec) <= 1 &&
        Number.isFinite(graph.forecastRevealPreviewSec) &&
        snapshot.viewedSec === graph.forecastRevealPreviewSec &&
        snapshot.viewedSec > snapshot.frontierSec
      );
    },
    revealFollowStart.revealedCoverageEndSec
  );
  assert.ok(
    workerUrls.some((url) => url.includes("timegraph-forecast-worker-")),
    "forecast unveiling runs through the bundled worker"
  );
  await page.waitForFunction(() => {
    const worldMap =
      globalThis.__SETTLEMENT_DEBUG__?.getSnapshot?.()?.worldMap;
    return (
      worldMap?.activeEdgeTransferPacketCount > 0 &&
      worldMap?.edgeTransferBatch?.transfers?.length > 0
    );
  });
  const transferAnimation = await page.evaluate(() => {
    const debug = globalThis.__SETTLEMENT_DEBUG__;
    const worldMap = debug.getSnapshot().worldMap;
    const packet = worldMap.activeEdgeTransferPackets[0];
    return {
      packet,
      source: debug.getWorldMapClickPoint(packet.sourceRegionId),
      destination: debug.getWorldMapClickPoint(packet.destinationRegionId),
    };
  });
  await page.waitForFunction(() => {
    const snapshot = globalThis.__SETTLEMENT_DEBUG__?.getSnapshot?.();
    return (
      snapshot?.frontierSec === 0 &&
      snapshot?.viewedSec >= 64 &&
      snapshot?.worldMap?.survivalTracker?.year > 1
    );
  });
  const revealPreview = await page.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__.getSnapshot()
  );
  assert.equal(
    revealPreview.runner.previewStatus.isForecastPreview,
    true,
    "forecast unveiling drives the existing read-only preview state"
  );
  assert.equal(
    revealPreview.viewedSec,
    revealPreview.graph.forecastRevealPreviewSec
  );
  assert.equal(
    revealPreview.frontierSec,
    0,
    "automatic reveal preview never commits timeline history"
  );
  assert.ok(
    revealPreview.worldMap.survivalTracker.year > 1,
    "the map calendar advances with the unveiling playhead"
  );
  assert.ok(Number.isFinite(
    revealPreview.worldMap.civilizationSummary.chaos.lastReckoning?.primordialPressure
  ), "projected Chaos reckoning exposes Primordial pressure");
  assert.ok(
    ["food", "population"].includes(transferAnimation.packet.resourceId),
    "map transfer animation renders food or migration packets"
  );
  assert.ok(transferAnimation.packet.amount > 0);
  if (transferAnimation.packet.resourceId === "population") {
    assert.ok(transferAnimation.packet.survivors >= 0);
    assert.ok(transferAnimation.packet.arrivalDeaths >= 0);
    assert.equal(
      transferAnimation.packet.survivors + transferAnimation.packet.arrivalDeaths,
      transferAnimation.packet.amount,
      "population packet metadata accounts for every traveler"
    );
  }
  assert.ok(
    transferAnimation.packet.progress >= 0 &&
      transferAnimation.packet.progress <= 1
  );
  const expectedAngle = Math.atan2(
    transferAnimation.destination.y - transferAnimation.source.y,
    transferAnimation.destination.x - transferAnimation.source.x
  );
  assert.ok(
    Math.abs(
      Math.atan2(
        Math.sin(transferAnimation.packet.angle - expectedAngle),
        Math.cos(transferAnimation.packet.angle - expectedAngle)
      )
    ) < 0.001,
    "food packet points from its source region toward its destination"
  );
  assert.ok(
    Math.abs(
      Math.atan2(
        Math.sin(transferAnimation.packet.travelAngle - expectedAngle),
        Math.cos(transferAnimation.packet.travelAngle - expectedAngle)
      )
    ) < 0.001,
    "forward playback moves the packet from source toward destination"
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
  assert.equal(selected.worldMap.regionSelectionActive, true);
  assert.equal(selected.worldMap.graphScope, "settlement");
  assert.equal(selected.controller.subjectKey, "cedar-woods",
    "selecting a detailed region shows its local timegraph");
  assert.ok(
    selected.worldMap.selectedRegion.detailedSettlement.elderOrder.resistance >= 0
  );
  if (selected.displayedLossInfo?.resolved !== true) {
    assert.equal(selected.worldMap.survivalTracker.projectedLossYear, null);
    assert.equal(selected.worldMap.survivalTracker.bestSurvivalYear, null);
    assert.ok(selected.worldMap.survivalTracker.forecastLabel.includes("Forecasting"));
  }

  await delay(400);
  await clickDesignPoint(page, cedarPoint);
  const deselected = await page.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__.getSnapshot()
  );
  assert.equal(deselected.worldMap.regionSelectionActive, false);
  assert.equal(deselected.controller.scope, "civilization",
    "clicking the selected region again restores the civilization timegraph");

  await pressDesignPoint(page, { x: 2047, y: 620 }, 180);
  const localPanelSelected = await page.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__.getSnapshot()
  );
  assert.equal(localPanelSelected.worldMap.regionSelectionActive, true);
  assert.equal(localPanelSelected.controller.subjectKey, "cedar-woods",
    "the selected-region panel switches back to the local timegraph");

  await pressDesignPoint(page, { x: 2047, y: 160 }, 180);
  const civilizationPanelSelected = await page.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__.getSnapshot()
  );
  assert.equal(civilizationPanelSelected.worldMap.regionSelectionActive, false);
  assert.equal(civilizationPanelSelected.controller.scope, "civilization",
    "the civilization panel switches to the global timegraph");

  await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.forceRender());
  await delay(100);
  await doubleClickDesignPoint(page, {
    x: cedarPoint.x + 100,
    y: cedarPoint.y,
  });
  const awayFromFlag = await page.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__.getSnapshot()
  );
  assert.equal(awayFromFlag.worldMap.mode, "map");
  assert.equal(awayFromFlag.controller.scope, "civilization",
    "double-clicking away from the player flag does not open a settlement");

  assert.equal(
    await page.evaluate(() =>
      globalThis.__SETTLEMENT_DEBUG__.selectWorldRegion("cedar-woods")),
    true
  );
  await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.forceRender());
  await delay(100);
  await clickDesignPoint(page, { x: 2047, y: 762 });
  const overview = await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot());
  assert.equal(overview.worldMap.mode, "settlement");
  assert.equal(overview.view.regionId, "cedar-woods",
    "the selected settlement opens from its region card");
  assert.equal(overview.view.activeTab, "overview");
  assert.ok(
    overview.view.calendar.year >= selected.worldMap.survivalTracker.year,
    "the settlement continues from the unveiled civilization year"
  );
  assert.ok(
    overview.view.calendar.label.includes(
      `Civilization Year ${overview.view.calendar.year}`
    )
  );
  assert.equal(overview.controller.scope, "settlement");
  assert.equal(overview.controller.subjectKey, "cedar-woods");
  assert.equal(overview.graph.forecastRevealPaused, true,
    "opening a settlement preserves the paused forecast unveil edge");
  assert.ok(overview.controller.label.includes("Local"));
  assert.deepEqual(overview.controller.seriesIds,
    ["totalPopulation", "food", "population:villager"]);
  assert.deepEqual(
    overview.graph.renderedSeriesSamples.map(({ seriesId, first }) => ({
      seriesId,
      value: first?.value,
    })),
    [
      { seriesId: "totalPopulation", value: 23 },
      { seriesId: "food", value: 60 },
      { seriesId: "population:villager", value: 23 },
    ],
    "local graph replaces aggregate lines with the selected settlement values"
  );
  assert.equal(overview.view.overview.practices.length, 5);
  assert.deepEqual(
    overview.view.overview.practices.slice(0, 3).map((practice) => practice.label),
    ["Forage", null, null]
  );
  for (const practice of overview.view.overview.practices.slice(0, 3).filter((practice) => practice.label)) {
    const scaled = practice.evaluation.effects.find((effect) => effect.scaledValue)?.scaledValue;
    assert.ok(scaled, `${practice.label} exposes its live card calculation`);
    assert.ok(Number.isFinite(scaled.baseValue));
    assert.ok(Number.isFinite(scaled.workerMultiplier));
    assert.ok(Number.isFinite(scaled.effectiveValue));
  }
  assert.ok(overview.view.elderOrder.resistance >= 0);
  await page.screenshot({ path: OVERVIEW_SCREENSHOT_PATH, fullPage: true });

  await pressDesignPoint(page, { x: 1715, y: 36 }, 180);
  const demographics = await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot());
  assert.equal(demographics.view.activeTab, "demographics");
  assert.equal(
    demographics.view.demographics.population.total,
    demographics.view.overview.population.total
  );

  const openResult = await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.openNextSelection());
  assert.equal(openResult.ok, true);
  assert.equal(await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.isVassalSelectionOpen()), true);
  await delay(180);
  let pendingSelection = await page.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__.getSnapshot().vassalSelectionPool
  );
  assert.equal(pendingSelection.candidates.length, 3);
  assert.equal(
    new Set(pendingSelection.candidates.map((candidate) => candidate.signatureNode.groupId)).size,
    3,
    "each candidate pool advertises three distinct signature groups"
  );
  assert.ok(
    pendingSelection.candidates.every((candidate) => (
      candidate.portrait
      && typeof candidate.portrait.skinTone === "string"
      && typeof candidate.portrait.hairStyle === "string"
      && candidate.signatureNode?.label
    )),
    "all expanded candidate cards have portrait and signature presentation data"
  );
  await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.forceRender());
  await page.screenshot({ path: VASSAL_CHOOSER_SCREENSHOT_PATH, fullPage: true });
  const chooserSnapshot = await page.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__.getSnapshot()
  );
  assert.equal(
    chooserSnapshot.runner.previewStatus.active,
    false,
    "blocking vassal selection suspends automatic forecast preview"
  );
  const rerollPoint = await page.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__.getVassalRerollClickPoint()
  );
  assert.ok(rerollPoint, "reroll button exposes a browser click point");
  const initialPoolHash = pendingSelection.expectedPoolHash;
  await clickDesignPoint(page, rerollPoint);
  await delay(100);
  pendingSelection = await page.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__.getSnapshot().vassalSelectionPool
  );
  assert.equal(pendingSelection.rerollIndex, 1, "reroll advances the candidate-pool index");
  assert.notEqual(pendingSelection.expectedPoolHash, initialPoolHash,
    "reroll replaces all displayed candidate options");
  const closePoint = await page.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__.getVassalCloseClickPoint()
  );
  assert.equal(closePoint, null, "the chooser has no dedicated close button");
  await clickDesignPoint(page, { x: 2200, y: 520 });
  assert.equal(
    await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.isVassalSelectionOpen()),
    false,
    "clicking outside returns to timeline inspection without selecting a Vassal"
  );
  const reopenResult = await page.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__.openNextSelection()
  );
  assert.equal(reopenResult.ok, true, "closed Vassal selection can be reopened");
  await delay(100);
  pendingSelection = await page.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__.getSnapshot().vassalSelectionPool
  );
  const chosenTargetRegionId = pendingSelection.candidates[0].locationRegionId;
  const candidatePoint = await page.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__.getVassalCandidateClickPoint(0)
  );
  assert.ok(candidatePoint, "candidate card exposes a browser click point");
  assert.ok(candidatePoint.y > 808,
    "candidate cards occupy the graph area below the World Map polygons");
  const candidateCanvas = await page.locator("canvas").boundingBox();
  await page.mouse.move(
    candidateCanvas.x + candidatePoint.x / 2424 * candidateCanvas.width,
    candidateCanvas.y + candidatePoint.y / 1080 * candidateCanvas.height
  );
  await delay(100);
  const hoveredCandidate = await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot());
  assert.equal(hoveredCandidate.worldMap.vassalHighlight?.targetRegionId, chosenTargetRegionId,
    "hovering a map drawer candidate highlights its target region");
  await clickDesignPoint(page, candidatePoint);
  assert.equal(
    await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.isVassalSelectionOpen()),
    true,
    "tapping a candidate locks its preview without immediately selecting it"
  );
  const tappedCandidate = await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot());
  assert.equal(tappedCandidate.worldMap.vassalHighlight?.targetRegionId, chosenTargetRegionId,
    "the locked touch preview preserves the candidate region highlight");
  assert.equal(tappedCandidate.lineage.selectedVassalIds.length, 0);
  const confirmVassalPoint = await page.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__.getVassalPrimaryClickPoint()
  );
  assert.ok(confirmVassalPoint, "the lower-left control exposes candidate confirmation");
  await clickDesignPoint(page, confirmVassalPoint);
  const selectResult = await page.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__.getLastVassalSelectionResult()
  );
  assert.equal(selectResult?.ok, true, "the lower-left control dispatches vassal selection");
  assert.equal(
    await page.evaluate(
      () => globalThis.__SETTLEMENT_DEBUG__.isVassalSelectionOpen()
    ),
    false,
    "confirmation closes the chooser after selection"
  );
  await delay(100);
  await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.forceRender());
  const afterVassal = await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getSnapshot());
  assert.equal(afterVassal.lineage.selectedVassalIds.length, 1);
  assert.equal(afterVassal.worldMap.mode, "vassalLife");
  assert.equal(
    afterVassal.controller.scope,
    chooserSnapshot.controller.scope,
    "choosing a Vassal preserves the current timegraph scope"
  );
  assert.equal(afterVassal.worldMap.selectedRegionId, chosenTargetRegionId,
    "vassal choice focuses its target region on the map");
  assert.equal(
    afterVassal.controller.subjectKey,
    chooserSnapshot.controller.scope === "settlement"
      ? chosenTargetRegionId
      : "civilization",
    "graph subject follows the focused target only in settlement scope"
  );
  assert.equal(afterVassal.forecastStatus.currentVassalResolutionSec, null,
    "selection alone does not schedule a hidden lifespan boundary");
  assert.equal(afterVassal.graph.projectionReplacement?.active, true,
    "selecting a Vassal keeps the prior timeline as a tinted comparison");
  assert.equal(afterVassal.graph.forecastRevealTargetEndSec, afterVassal.frontierSec,
    "selection does not unveil the new timeline beyond committed history");
  await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.forceRender());
  await page.screenshot({ path: LIFE_MAP_SCREENSHOT_PATH, fullPage: true });
  const firstLifeMapNodeId = afterVassal.lineage.currentVassal.availableNodeIds[0];
  const nodePoint = await page.evaluate(
    (nodeId) => globalThis.__SETTLEMENT_DEBUG__.getLifeMapNodeClickPoint(nodeId),
    firstLifeMapNodeId
  );
  assert.ok(nodePoint, "the visible generated Life Map exposes its first entry node");
  await clickDesignPoint(page, nodePoint);
  const inspectedOnly = await page.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lineage.currentVassal.currentNodeId
  );
  assert.equal(inspectedOnly, null, "a single click inspects a node without entering it");
  const enterNodePoint = await page.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__.getLifeMapEnterNodeClickPoint()
  );
  assert.ok(enterNodePoint, "the inspected available node has an explicit entry button");
  await clickDesignPoint(page, enterNodePoint);
  const optionPoint = await page.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__.getLifeMapOptionClickPoint(0)
  );
  assert.ok(optionPoint, "the active node reveals its choices only after entry");
  await clickDesignPoint(page, optionPoint);
  const stagedLifeMapDecision = await page.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__.getSnapshot().lifeMapDecision
  );
  assert.ok(stagedLifeMapDecision.selectedOptionId,
    `generated ${stagedLifeMapDecision.family} node stages its selected option`);
  await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.forceRender());
  await page.screenshot({ path: ACTIVE_NODE_SCREENSHOT_PATH, fullPage: true });
  const confirmPoint = await page.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__.getLifeMapConfirmClickPoint()
  );
  assert.ok(confirmPoint, "the active node has explicit confirmation");
  await clickDesignPoint(page, confirmPoint);
  const resolvingVassal = await page.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__.getSnapshot()
  );
  const resolutionSec = resolvingVassal.forecastStatus.currentVassalResolutionSec;
  let committedVassalHistory;
  if (Number.isFinite(resolutionSec) && resolutionSec > resolvingVassal.frontierSec) {
    assert.equal(resolvingVassal.pendingCommitJob.resolutionSec, resolutionSec,
      "forecast commitment targets the node resolution");
    assert.equal(resolvingVassal.graph.forecastRevealTargetEndSec, resolutionSec,
      "node confirmation unveils only through that node's resolution boundary");
    await page.waitForFunction(
      (targetSec) => globalThis.__SETTLEMENT_DEBUG__.getSnapshot().frontierSec >= targetSec,
      resolutionSec,
      { timeout: 6000 }
    );
    await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.forceRender());
    committedVassalHistory = await page.evaluate(
      () => globalThis.__SETTLEMENT_DEBUG__.getSnapshot()
    );
  } else {
    assert.ok(resolvingVassal.frontierSec > afterVassal.frontierSec,
      "short generated nodes may finish before the first post-confirmation probe sample");
    committedVassalHistory = resolvingVassal;
  }
  assert.ok(
    committedVassalHistory.frontierSec > afterVassal.frontierSec,
    "confirmed node time is committed through authoritative ticks"
  );
  assert.equal(committedVassalHistory.lineage.currentVassal.currentNodeId, null);
  assert.ok(committedVassalHistory.lineage.currentVassal.availableNodeIds.length >= 1,
    "outgoing nodes become available only after survival");
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
    assert.match(
      committedVassalHistory.view.survivalTracker.forecastLabel,
      /^(Projected survival:|Civilization lasted)/,
      "the survival strip remains explicit when the new baseline resolves loss coverage faster"
    );
  }

  const historicalBrowseSec = afterVassal.frontierSec;
  const historicalBrowse = await page.evaluate(
    (tSec) => globalThis.__SETTLEMENT_DEBUG__.browseSecond(tSec),
    historicalBrowseSec
  );
  assert.equal(historicalBrowse?.ok, true, "committed Vassal time can be browsed without rewriting it");
  await delay(100);
  await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.forceRender());
  const historicalLifeMap = await page.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__.getSnapshot()
  );
  assert.equal(historicalLifeMap.worldMap.mode, "vassalLife",
    "timeline browsing keeps the open Life Map visible");
  assert.equal(historicalLifeMap.lifeMap.readOnly, true,
    "a Life Map behind the committed frontier is inspect-only");
  assert.equal(historicalLifeMap.lifeMap.vassalId,
    committedVassalHistory.lineage.currentVassal.vassalId);
  assert.ok(historicalLifeMap.lifeMap.committedNodeIds.includes(firstLifeMapNodeId),
    "the full committed route remains visible behind the playhead");
  assert.equal(historicalLifeMap.lifeMap.playheadNodeId, firstLifeMapNodeId,
    "the temporal highlight follows the latest confirmed node");
  assert.equal(
    await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getLifeMapEnterNodeClickPoint()),
    null,
    "historical Life Maps expose no node-entry action"
  );
  assert.equal(
    await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__.getLifeMapConfirmClickPoint()),
    null,
    "historical Life Maps expose no confirmation action"
  );
  const lifePresentPoint = await page.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__.getTimeActionClickPoint()
  );
  assert.ok(lifePresentPoint, "the shared timeline controls expose Return to Present");
  await clickDesignPoint(page, lifePresentPoint);
  await delay(100);
  const presentLifeMap = await page.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__.getSnapshot()
  );
  assert.equal(presentLifeMap.viewedSec, presentLifeMap.frontierSec);
  assert.equal(presentLifeMap.worldMap.mode, "vassalLife",
    "Return to Present preserves the Life Map screen");
  assert.equal(presentLifeMap.lifeMap.readOnly, false,
    "the living Vassal becomes actionable again at the frontier");

  const mapTogglePoint = await page.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__.getVassalPrimaryClickPoint()
  );
  assert.ok(mapTogglePoint, "the lower-left Vassal control exposes the map toggle");
  await clickDesignPoint(page, mapTogglePoint);
  const returnedToMap = await page.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__.getSnapshot()
  );
  assert.equal(returnedToMap.worldMap.mode, "map");
  assert.equal(
    returnedToMap.worldMap.activeVassalLocationRegionId,
    returnedToMap.lineage.currentVassal.locationRegionId,
    "the World Map exposes the active Vassal location marker"
  );
  assert.equal(returnedToMap.controller.scope, "civilization");
  assert.equal(returnedToMap.controller.subjectKey, "civilization");
  assert.equal(returnedToMap.graph.projectionReplacement?.active, true,
    "the prior timeline remains available for comparison between resolved nodes");
  assert.deepEqual(
    returnedToMap.graph.renderedSeriesSamples.map(({ seriesId, first }) => ({
      seriesId,
      value: first?.value,
    })),
    [
      { seriesId: "totalPopulation", value: 115 },
      { seriesId: "food", value: 300 },
      { seriesId: "chaosPower", value: 0 },
      { seriesId: "chaosRawPressure", value: 0 },
      { seriesId: "chaosResistance", value: 0 },
    ],
    "returning to the map restores civilization graph values"
  );
  await page.evaluate(
    (tSec) => globalThis.__SETTLEMENT_DEBUG__.browseSecond(tSec),
    historicalBrowseSec
  );
  await delay(100);
  const mapPresentPoint = await page.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__.getTimeActionClickPoint()
  );
  assert.ok(mapPresentPoint, "Return to Present is also available on the World Map");
  await clickDesignPoint(page, mapPresentPoint);
  await delay(100);
  const worldMapPresent = await page.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__.getSnapshot()
  );
  assert.equal(worldMapPresent.viewedSec, worldMapPresent.frontierSec);
  assert.equal(worldMapPresent.worldMap.mode, "map",
    "Return to Present preserves the World Map screen");

  const widePage = await browser.newPage({
    viewport: { width: 1280, height: 600 },
  });
  await widePage.addInitScript(() => {
    localStorage.setItem("civsurvivor.debugProfiles.boot.v2", "probe-authored-setup");
  });
  await widePage.goto(URL);
  await widePage.waitForFunction(
    () => !!globalThis.__SETTLEMENT_DEBUG__?.getSnapshot
  );
  await clickDesignPoint(widePage, { x: 2047, y: 762 });
  await widePage.waitForFunction(
    () =>
      globalThis.__SETTLEMENT_DEBUG__.getSnapshot().worldMap.mode ===
      "settlement"
  );
  await widePage.evaluate(() => {
    const element = document.querySelector('[data-testid="debug-open"]');
    element.style.minWidth = "92px";
    element.style.minHeight = "48px";
    element.style.fontSize = "20px";
  });
  const wideHeaderLayout = await widePage.evaluate(() => {
    const snapshot = globalThis.__SETTLEMENT_DEBUG__.getSnapshot();
    const canvasRect = document.querySelector("canvas").getBoundingClientRect();
    const toScreenRect = (rect) => ({
      left: canvasRect.left + rect.x / 2424 * canvasRect.width,
      top: canvasRect.top + rect.y / 1080 * canvasRect.height,
      right:
        canvasRect.left +
        (rect.x + rect.width) / 2424 * canvasRect.width,
      bottom:
        canvasRect.top +
        (rect.y + rect.height) / 1080 * canvasRect.height,
    });
    const domRect = (testId) => {
      const rect = document.querySelector(
        `[data-testid="${testId}"]`
      ).getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      };
    };
    return {
      canvas: {
        left: canvasRect.left,
        top: canvasRect.top,
        right: canvasRect.right,
        bottom: canvasRect.bottom,
      },
      tabs: Object.fromEntries(
        ["overview", "demographics", "map"].map((key) => [
          key,
          toScreenRect(snapshot.view.headerControls[key]),
        ])
      ),
      utilities: {
        debug: domRect("debug-open"),
      },
    };
  });
  const overlaps = (a, b) =>
    a.left < b.right &&
    a.right > b.left &&
    a.top < b.bottom &&
    a.bottom > b.top;
  for (const [tabId, tabRect] of Object.entries(wideHeaderLayout.tabs)) {
    assert.equal(
      overlaps(tabRect, wideHeaderLayout.utilities.debug),
      false,
      `${tabId} remains clear of the debug control`
    );
    assert.ok(
      tabRect.left >= wideHeaderLayout.canvas.left &&
        tabRect.right <= wideHeaderLayout.canvas.right,
      `${tabId} stays fully inside the canvas`
    );
  }
  await widePage.screenshot({
    path: WIDE_HEADER_SCREENSHOT_PATH,
    fullPage: true,
  });
  await widePage.close();

  assert.ok(
    returnedToMap.graph.historyZones.some((zone) => zone.kind === "fixedHistory"),
    "vassal history brackets remain after returning to civilization scope"
  );

  const terminalPage = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });
  await terminalPage.addInitScript(() => {
    localStorage.setItem("civsurvivor.debugProfiles.boot.v2", "probe-authored-setup");
  });
  await terminalPage.goto(URL);
  await terminalPage.waitForFunction(() => {
    const snapshot = globalThis.__SETTLEMENT_DEBUG__?.getSnapshot?.();
    const graph = snapshot?.graph;
    return (
      graph?.forecastRevealPlayheadFollowEnabled === true &&
      graph.revealedCoverageEndSec > 320 &&
      graph.revealedCoverageEndSec < graph.forecastRevealTargetEndSec &&
      snapshot?.worldMap?.edgeTransferBatch?.boundarySec > 0 &&
      snapshot.worldMap.edgeTransferPlaybackDirection === "forward"
    );
  });
  const followingSnapshot = await terminalPage.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__.getSnapshot()
  );
  const rewindBoundarySec =
    followingSnapshot.worldMap.edgeTransferBatch.boundarySec;
  await terminalPage.waitForFunction(
    (boundarySec) => {
      const snapshot = globalThis.__SETTLEMENT_DEBUG__.getSnapshot();
      return (
        snapshot.graph.revealedCoverageEndSec > boundarySec + 48 &&
        snapshot.viewedSec > boundarySec + 48
      );
    },
    rewindBoundarySec
  );
  const timeLeverRect = await terminalPage.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__.getTimeLeverScreenRect()
  );
  assert.ok(timeLeverRect, "time lever exposes its rendered interaction bounds");
  await pressDesignPoint(terminalPage, {
    x: timeLeverRect.x + timeLeverRect.width * 0.37,
    y: timeLeverRect.y + Math.min(25, timeLeverRect.height * 0.4),
  }, 180);
  const timeControlBrowse = await terminalPage.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__.getSnapshot()
  );
  assert.equal(
    timeControlBrowse.graph.forecastRevealPlayheadFollowEnabled,
    false,
    "using the time lever takes ownership from forecast auto-follow"
  );
  assert.equal(timeControlBrowse.playbackTarget, 0);
  const manuallyViewedSec = timeControlBrowse.viewedSec;
  assert.equal(
    await terminalPage.evaluate(() =>
      globalThis.__SETTLEMENT_DEBUG__.selectWorldRegion("cedar-woods")),
    true
  );
  await terminalPage.evaluate(() =>
    globalThis.__SETTLEMENT_DEBUG__.forceRender());
  await delay(100);
  await clickDesignPoint(terminalPage, { x: 2047, y: 762 });
  const manualSettlementView = await terminalPage.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__.getSnapshot()
  );
  assert.equal(manualSettlementView.worldMap.mode, "settlement");
  assert.equal(
    manualSettlementView.graph.forecastRevealPlayheadFollowEnabled,
    false,
    "opening a settlement preserves manual time browsing"
  );
  await pressDesignPoint(terminalPage, { x: 1883, y: 36 }, 180);
  const manualMapView = await terminalPage.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__.getSnapshot()
  );
  assert.equal(manualMapView.worldMap.mode, "map");
  assert.equal(
    manualMapView.graph.forecastRevealPlayheadFollowEnabled,
    false,
    "returning to the map preserves manual time browsing"
  );
  await delay(350);
  const manualMapViewLater = await terminalPage.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__.getSnapshot()
  );
  assert.equal(
    manualMapViewLater.viewedSec,
    manuallyViewedSec,
    "view navigation does not pull a manual time selection back to the frontier"
  );
  const followingGraph = await terminalPage.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__.getSnapshot().graph
  );
  const latchRatio = Math.max(
    0,
    Math.min(
      1,
      (rewindBoundarySec + 24 - followingGraph.minSec) /
        Math.max(1, followingGraph.maxSec - followingGraph.minSec)
    )
  );
  const latchTarget = {
    x: followingGraph.plotScreenRect.x +
      followingGraph.plotScreenRect.width * latchRatio,
    y: followingGraph.plotScreenRect.y +
      followingGraph.plotScreenRect.height * 0.5,
  };
  await terminalPage.mouse.click(latchTarget.x, latchTarget.y);
  await terminalPage.waitForFunction(
    (boundarySec) => {
      const snapshot = globalThis.__SETTLEMENT_DEBUG__.getSnapshot();
      return (
        snapshot.graph.forecastRevealPlayheadFollowEnabled === false &&
        snapshot.graph.scrubSec > boundarySec &&
        snapshot.worldMap.edgeTransferPlaybackDirection === "backward"
      );
    },
    rewindBoundarySec
  );
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
      const snapshot = globalThis.__SETTLEMENT_DEBUG__?.getSnapshot?.();
      const tracker = snapshot?.worldMap?.survivalTracker;
      return (
        snapshot?.graph?.revealedCoverageEndSec > 320 &&
        typeof tracker?.forecastLabel === "string"
      );
    }
  );
  const survivalForecast = await terminalPage.evaluate(
    () =>
      globalThis.__SETTLEMENT_DEBUG__.getSnapshot().worldMap.survivalTracker
  );
  if (Number.isFinite(survivalForecast.projectedLossYear)) {
    assert.equal(
      survivalForecast.bestSurvivalYear,
      survivalForecast.projectedLossYear,
      "a resolved forecast records the same best civilization survival year"
    );
  } else {
    assert.ok(
      survivalForecast.forecastLabel.includes("Forecasting"),
      "an unresolved long-range loss remains explicitly marked as forecasting"
    );
  }
  await terminalPage.close();

  await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });
  writeFileSync(DETAIL_PATH, JSON.stringify({
    checks: [
      "15-region map and five detailed sites",
      "starvation and overcrowding region-pressure indicators",
      "site selection and structure capacity",
      "Overview and Demographics tabs",
      "fullscreen control and season/year heading",
      "Pixel-sized fullscreen settlement header controls do not overlap",
      "civilization/local graph scope and automatic focus",
      "civilization summary and persistent survival record",
      "survival forecast distinguishes resolved and still-computing loss years",
      "forecast unveil advances the playhead until manual scrub ownership",
      "time controls preserve manual browsing across map and settlement views",
      "timeline commits restore forecast auto-follow",
      "timeline rewind mode separates packet travel from historical facing",
      "map selection during active forecast unveiling",
      "aggregate Elder Order resistance",
      "deterministic vassal chooser, lifespan forecast, and graph replacement",
    ],
    initial: initial.worldMap,
    selected: selected.worldMap,
    overview: overview.view,
    demographics: demographics.view,
    lineage: afterVassal.lineage,
    survivalForecast,
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
