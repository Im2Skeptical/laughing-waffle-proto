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

function buildSummary({ initial, availability, probeResults, postSelection }) {
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
    viewTextCount: postSelection?.view?.textCount ?? initial?.view?.textCount ?? null,
    vassalPanel: postSelection?.view?.sections?.vassal ?? initial?.view?.sections?.vassal ?? null,
    chaosPanel: postSelection?.view?.sections?.chaos ?? initial?.view?.sections?.chaos ?? null,
    classSummary: postSelection?.view?.sections?.classSummary ?? initial?.view?.sections?.classSummary ?? null,
    firstProbe: summarizeProbeResult(probeResults[0] ?? null),
    lastProbe: summarizeProbeResult(probeResults[probeResults.length - 1] ?? null),
  };
}

function assertSettlementViewSemantics(snapshot) {
  const vassal = snapshot?.view?.sections?.vassal ?? null;
  const missing = [];
  if (!vassal?.hasHeader) missing.push("Vassal");
  const hasActiveVassal = vassal?.hasAgenda || vassal?.hasStats || vassal?.hasEventLog;
  if (!hasActiveVassal && !vassal?.hasEmptyPrompt) {
    missing.push("empty vassal prompt or active vassal content");
  }
  if (!hasActiveVassal) {
    if (missing.length > 0) {
      throw new Error(`Settlement view semantic snapshot missing: ${missing.join(", ")}`);
    }
    return;
  }
  if (!vassal?.hasAgenda) missing.push("Agenda");
  if (!vassal?.hasStats) missing.push("Stats");
  if (!vassal?.hasEventLog) missing.push("Event Log");
  if (!vassal?.hasClassLine) missing.push("Class line");
  if (!vassal?.hasProfessionLine) missing.push("Profession line");
  if (!vassal?.hasTraitLine) missing.push("Trait line");
  if (!vassal?.hasDeathYearLine) missing.push("Death Year line");
  if (!vassal?.hasStatus) missing.push("vassal status");
  if (missing.length > 0) {
    throw new Error(`Settlement view semantic snapshot missing: ${missing.join(", ")}`);
  }
}

function assertWorldMapSemantics(snapshot) {
  const map = snapshot?.worldMap ?? null;
  const missing = [];
  if (map?.mode !== "map") missing.push("map mode");
  if (map?.visible !== true) missing.push("visible map");
  if (map?.regionCount !== 15) missing.push("15 regions");
  if (map?.selectedRegionId !== "river-crown") missing.push("River Crown selection");
  if (map?.selectedRegion?.colour !== "red") missing.push("River Crown colour");
  if (map?.selectedRegion?.controller !== "player") missing.push("River Crown controller");
  if (map?.selectedRegion?.capacity !== 2) missing.push("River Crown capacity");
  if (map?.controllerMarkers?.length !== 15) missing.push("15 controller markers");
  if (map?.controllerMarkers?.find((marker) => marker.regionId === "river-crown")?.controller !== "player") {
    missing.push("River Crown player marker");
  }
  if (map?.detailedSiteMarkerCount !== 0) missing.push("no detailed-site marker");
  if (map?.selectedRegion?.practiceOptions?.length !== 6) missing.push("six practice options");
  if (map?.scoreboard?.totalScore !== 0 || map?.scoreboard?.installedCount !== 0) {
    missing.push("empty practice scoreboard");
  }
  const initialExchange = map?.selectedRegion?.practiceOptions?.find(
    (option) => option.practiceId === "exchange"
  );
  if (initialExchange?.evaluation?.score !== 3 || initialExchange?.scoreTier !== "gold") {
    missing.push("different-colour Exchange score");
  }
  if (Object.prototype.hasOwnProperty.call(map ?? {}, "routePlanner")) missing.push("no route planner");
  if (map?.selectedRegion?.practiceOptions?.some((option) =>
    !option?.evaluation?.ok || !Array.isArray(option?.evaluation?.breakdown)
  )) missing.push("practice score breakdowns");
  if (missing.length > 0) {
    throw new Error(`World map semantic snapshot missing: ${missing.join(", ")}`);
  }
}

async function clickCanvasDesignPoint(page, point) {
  const canvas = page.locator("canvas");
  const box = await canvas.boundingBox();
  if (!box || !point) throw new Error("Canvas or design click point unavailable");
  const clickPoint = {
    x: box.x + (point.x / 2424) * box.width,
    y: box.y + (point.y / 1080) * box.height,
  };
  await page.mouse.click(clickPoint.x, clickPoint.y);
  await delay(180);
  return { box, point, clickPoint };
}

function assertChaosViewSemantics(snapshot) {
  const chaos = snapshot?.view?.sections?.chaos ?? null;
  const missing = [];
  if (!chaos?.hasHeader) missing.push("Chaos");
  if (!chaos?.hasSharedPool) missing.push("Shared Pool");
  if (!chaos?.hasChaosPower) missing.push("Chaos Power");
  if (!chaos?.hasChaosIncome) missing.push("Chaos Income");
  if (!chaos?.hasRedGod) missing.push("RedGod");
  if (!chaos?.hasNextSpawn) missing.push("Next Spawn");
  if (!chaos?.hasMonsters) missing.push("Monsters");
  if (missing.length > 0) {
    throw new Error(`Chaos view semantic snapshot missing: ${missing.join(", ")}`);
  }
}

function assertClassSummaryViewSemantics(snapshot) {
  const classSummary = snapshot?.view?.sections?.classSummary ?? null;
  const missing = [];
  if (!classSummary?.hasAdults) missing.push("Adults");
  if (!classSummary?.hasYouth) missing.push("Youth");
  if (!classSummary?.hasFree) missing.push("Free");
  if (!classSummary?.hasFaith) missing.push("Faith");
  if (!classSummary?.hasMood) missing.push("Mood");
  if (missing.length > 0) {
    throw new Error(`Class summary view semantic snapshot missing: ${missing.join(", ")}`);
  }
}

function assertActiveVassalViewSemantics(snapshot) {
  assertSettlementViewSemantics(snapshot);
  const vassal = snapshot?.view?.sections?.vassal ?? null;
  const missing = [];
  if (!vassal?.hasAgenda) missing.push("Agenda");
  if (!vassal?.hasStats) missing.push("Stats");
  if (!vassal?.hasEventLog) missing.push("Event Log");
  if (!vassal?.hasClassLine) missing.push("Class line");
  if (!vassal?.hasProfessionLine) missing.push("Profession line");
  if (!vassal?.hasTraitLine) missing.push("Trait line");
  if (!vassal?.hasDeathYearLine) missing.push("Death Year line");
  if (!vassal?.hasStatus) missing.push("vassal status");
  if (missing.length > 0) {
    throw new Error(`Active vassal view semantic snapshot missing: ${missing.join(", ")}`);
  }
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
  assertWorldMapSemantics(initial);
  assertSettlementViewSemantics(initial);
  assertChaosViewSemantics(initial);
  assertClassSummaryViewSemantics(initial);
  logJson("initial", initial);

  const ironPoint = await page.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__?.getWorldMapClickPoint?.("iron-hills") ?? null
  );
  const ironClick = await clickCanvasDesignPoint(page, ironPoint);
  const ironSelection = await page.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__?.getSnapshot?.()?.worldMap ?? null
  );
  if (ironSelection?.selectedRegionId !== "iron-hills") {
    throw new Error(`World map selection failed: expected iron-hills, got ${ironSelection?.selectedRegionId ?? "null"}; pointer=${ironSelection?.lastPointerRegionId ?? "none"}; click=${JSON.stringify(ironClick)}`);
  }
  if (ironSelection?.selectedRegion?.controller !== "external-a") {
    throw new Error("World map did not expose the selected external controller");
  }
  const ironStore = ironSelection?.selectedRegion?.practiceOptions?.find(
    (option) => option.practiceId === "store"
  );
  if (ironStore?.installation?.reason !== "notPlayerControlled") {
    throw new Error(`External region installation should be disabled; got ${ironStore?.installation?.reason ?? "none"}`);
  }

  const capitalPoint = await page.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__?.getWorldMapClickPoint?.("river-crown") ?? null
  );
  await clickCanvasDesignPoint(page, capitalPoint);
  await page.waitForFunction(
    () => globalThis.__SETTLEMENT_DEBUG__?.getSnapshot?.()?.worldMap?.selectedRegionId === "river-crown",
    null,
    { timeout: 30000 }
  );
  await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__?.forceRender?.());
  await delay(120);
  const storePoint = await page.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__?.getWorldPracticeClickPoint?.("store") ?? null
  );
  const firstStoreClick = await clickCanvasDesignPoint(page, storePoint);
  await delay(250);
  const firstStoreInstall = await page.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__?.getSnapshot?.()?.worldMap ?? null
  );
  if (firstStoreInstall?.selectedRegion?.installedPracticeIds?.[0] !== "store") {
    throw new Error(
      `First Store installation failed: selected=${firstStoreInstall?.selectedRegionId ?? "none"}; point=${JSON.stringify(storePoint)}; click=${JSON.stringify(firstStoreClick)}; result=${JSON.stringify(firstStoreInstall?.lastPracticeResult ?? null)}`
    );
  }
  if (
    firstStoreInstall?.scoreboard?.totalScore !== 1
    || firstStoreInstall?.selectedRegion?.installedPractices?.[0]?.scoreTier !== "bronze"
  ) {
    throw new Error(`First Store scoreboard/tier mismatch: ${JSON.stringify(firstStoreInstall?.scoreboard ?? null)}`);
  }
  await clickCanvasDesignPoint(page, storePoint);
  await delay(250);
  const secondStoreInstall = await page.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__?.getSnapshot?.()?.worldMap ?? null
  );
  const installedStores = secondStoreInstall?.selectedRegion?.installedPracticeIds ?? [];
  const storeOption = secondStoreInstall?.selectedRegion?.practiceOptions?.find(
    (option) => option.practiceId === "store"
  );
  if (installedStores.length !== 2
      || installedStores[0] !== "store"
      || installedStores[1] !== "store"
      || storeOption?.evaluation?.score !== 3
      || secondStoreInstall?.scoreboard?.totalScore !== 4
      || secondStoreInstall?.selectedRegion?.installedPractices?.some(
        (entry) => entry?.evaluation?.score !== 2 || entry?.scoreTier !== "silver"
      )) {
    throw new Error(
      `Duplicate Store installation failed: practices=${JSON.stringify(installedStores)}; score=${storeOption?.evaluation?.score ?? "none"}; result=${JSON.stringify(secondStoreInstall?.lastPracticeResult ?? null)}`
    );
  }
  const installedPracticePoint = await page.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__?.getWorldInstalledPracticeClickPoint?.(0) ?? null
  );
  await clickCanvasDesignPoint(page, installedPracticePoint);
  await delay(250);
  const afterStoreRemoval = await page.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__?.getSnapshot?.()?.worldMap ?? null
  );
  if (
    afterStoreRemoval?.selectedRegion?.installedPracticeIds?.length !== 1
    || afterStoreRemoval.selectedRegion.installedPracticeIds[0] !== "store"
    || afterStoreRemoval?.scoreboard?.totalScore !== 1
    || afterStoreRemoval?.lastPracticeResult?.operation !== "uninstall"
  ) {
    throw new Error(
      `Installed practice removal failed: practices=${JSON.stringify(afterStoreRemoval?.selectedRegion?.installedPracticeIds ?? null)}; result=${JSON.stringify(afterStoreRemoval?.lastPracticeResult ?? null)}`
    );
  }
  await clickCanvasDesignPoint(page, { x: 2047, y: 759 });
  const settlementMode = await page.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__?.getSnapshot?.()?.worldMap?.mode ?? null
  );
  if (settlementMode !== "settlement") {
    throw new Error(`Capital navigation failed: expected settlement mode, got ${settlementMode ?? "null"}`);
  }
  await clickCanvasDesignPoint(page, { x: 136, y: 35 });
  const returnedMap = await page.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__?.getSnapshot?.()?.worldMap ?? null
  );
  if (returnedMap?.mode !== "map" || returnedMap?.selectedRegionId !== "river-crown") {
    throw new Error("Return-to-map navigation did not preserve the selected capital region");
  }

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

  const selectionAttempt = await page.evaluate(() => {
    const open = globalThis.__SETTLEMENT_DEBUG__?.openNextSelection?.() ?? null;
    const select = open?.ok
      ? globalThis.__SETTLEMENT_DEBUG__?.selectCandidate?.(0) ?? null
      : null;
    globalThis.__SETTLEMENT_DEBUG__?.forceRender?.();
    return { open, select };
  });
  await delay(250);
  await page.evaluate(() => globalThis.__SETTLEMENT_DEBUG__?.forceRender?.());
  const postSelection = await page.evaluate(
    () => globalThis.__SETTLEMENT_DEBUG__?.getSnapshot?.() ?? null
  );
  if (selectionAttempt?.select?.ok) {
    assertActiveVassalViewSemantics(postSelection);
  } else {
    assertSettlementViewSemantics(postSelection);
  }
  assertChaosViewSemantics(postSelection);
  assertClassSummaryViewSemantics(postSelection);
  logJson("selectionAttempt", selectionAttempt);
  logJson("postSelection", postSelection);

  await page.screenshot({
    path: SCREENSHOT_PATH,
    fullPage: true,
  });

  const summary = buildSummary({ initial, availability, probeResults, postSelection });
  writeDetails({ summary, initial, availability, probeResults, selectionAttempt, postSelection });
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
