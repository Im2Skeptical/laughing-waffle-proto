// src/model/tests/determinism.js
// Automated verification of determinism invariants.
// 1. Rebuild Consistency: Rebuild(B) == Rebuild(B)
// 2. Live vs Replay: LiveSim(Actions) == Rebuild(Actions)
// 3. Projection vs Replay: Forecast(B..B+N) == Rebuild(B+N)

import { serializeGameState, deserializeGameState } from "../state.js";
import {
  createTimelineFromInitialState,
  rebuildStateAtSecond,
  replaceActionsAtSecond,
} from "../timeline/index.js";
import { updateGame, createInitialState } from "../game-model.js";
import { buildMetricGraphWindowFromTimeline } from "../projection.js";
import { canonicalizeSnapshot } from "../canonicalize.js";
import { ActionKinds } from "../actions.js";
import {
  createTimeGraphController,
  getSharedProjectionCache,
} from "../timegraph-controller.js";
import {
  buildSettlementVassalSelectionPool,
  selectSettlementVassal,
} from "../settlement-vassal-exec.js";
import { getSettlementChaosIncomeSummary } from "../settlement-chaos.js";
import {
  createSettlementCardInstance,
  getHubCore,
  getSettlementFloodplainFoodTotal,
  getSettlementFloodplainTiles,
  getSettlementPopulationClassState,
  getSettlementStockpile,
  getSettlementTileFood,
  getSettlementTotalFood,
  getSettlementYearDurationSec,
  setSettlementTileFood,
} from "../settlement-state.js";

const DT_STEP = 1 / 60;
const TEST_SEED = 99999;
const HISTORY_TEST_SETUP_ID = "devGym01";

// -----------------------------------------------------------------------------
// Hashing / Comparison
// -----------------------------------------------------------------------------

function stableStringify(obj) {
  if (obj === null || typeof obj !== "object") {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return "[" + obj.map(stableStringify).join(",") + "]";
  }
  const keys = Object.keys(obj).sort();
  return (
    "{" +
    keys
      .map((k) => JSON.stringify(k) + ":" + stableStringify(obj[k]))
      .join(",") +
    "}"
  );
}

// Custom canonicalizer for hashing that PRESERVES authoritative counters
// (tSec, simStepIndex, turn, currentSeasonIndex) to detect logic drift,
// while resetting transient runtime flags.
function normalizeRuntimeForHash(state) {
  // Reset runtime flags that shouldn't affect authoritative history
  state.paused = false;
  state.seasonTimeRemaining = 0;

  // Note: We DO NOT reset simTime, tSec, simStepIndex, turn, or seasons.
  // These must match exactly between live and replay.
}

function computeStateHash(state) {
  // 1. Serialize (strips derived fields like inventory grid)
  const serial = serializeGameState(state);
  const clone = deserializeGameState(serial);

  // 2. Normalize transient runtime fields only
  normalizeRuntimeForHash(clone);

  // 3. Stable Stringify
  const str = stableStringify(clone);

  // 4. Simple DJB2 hash
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

function summarizeEnvEvents(state) {
  const anchors = Array.isArray(state?.board?.layers?.event?.anchors)
    ? state.board.layers.event.anchors
    : [];
  if (!anchors.length) return "";
  const entries = anchors.map((anchor) => {
    const defId = anchor?.defId ?? "unknown";
    const col = Number.isFinite(anchor?.col) ? Math.floor(anchor.col) : 0;
    const createdSec = Number.isFinite(anchor?.createdSec)
      ? Math.floor(anchor.createdSec)
      : 0;
    return `${defId}@${col}:${createdSec}`;
  });
  entries.sort();
  return entries.join("|");
}

function clearVassalLineageForHash(state) {
  const clone = deserializeGameState(serializeGameState(state));
  const hubCore = getHubCore(clone);
  if (hubCore?.systemState && typeof hubCore.systemState === "object") {
    delete hubCore.systemState.vassalLineage;
  }
  return clone;
}

function runSimulationSeconds(state, seconds) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  for (let tick = 0; tick < safeSeconds * 60; tick += 1) {
    updateGame(DT_STEP, state);
  }
}

// -----------------------------------------------------------------------------
// Scenarios
// -----------------------------------------------------------------------------

export function runDeterminismSuite() {
  console.group("🧪 Determinism Suite");
  const results = [];

  try {
    results.push(testRebuildConsistency());
    results.push(testLiveVsReplay());
    results.push(testProjectionVsReplay());
    results.push(testHistoryStableAfterFutureAction());
    results.push(testHistoryPreviewMatchesReplay());
    results.push(testVassalSelectionDoesNotAdvanceSharedRng());
    results.push(testVassalSelectionPreservesNonLineageTimeline());
    results.push(testFloodplainFieldFoodSeasonalRules());
    results.push(testFloodplainFieldFoodSummerDecay());
    results.push(testPopulationMealsConsumeFieldFood());
    results.push(testRiverRecessionFarmingMovesFieldFood());
    results.push(testRedGodChaosIncomeBaseGrowthAndFaithMitigation());
  } catch (e) {
    console.error("Suite crashed:", e);
    results.push({ name: "Suite Integrity", passed: false, error: e.message });
  }

  console.groupEnd();
  console.table(results);
  return results.every((r) => r.passed);
}

function testRebuildConsistency() {
  const name = "Rebuild Idempotency";
  try {
    // Use real initialization logic
    const s0 = createInitialState(TEST_SEED);
    const tl = createTimelineFromInitialState(s0);

    // Note: We test empty timeline rebuilding here.
    // Adding ActionKinds.START_NEXT_TURN to the timeline is invalid
    // because simulation (season start) is implicit at second boundaries.

    // Rebuild twice
    const res1 = rebuildStateAtSecond(tl, 0);
    const res2 = rebuildStateAtSecond(tl, 0);

    if (!res1.ok || !res2.ok) throw new Error("Rebuild failed");

    const h1 = computeStateHash(res1.state);
    const h2 = computeStateHash(res2.state);

    if (h1 !== h2) {
      return { name, passed: false, reason: `Hash mismatch: ${h1} vs ${h2}` };
    }

    return { name, passed: true, hash: h1 };
  } catch (e) {
    return { name, passed: false, reason: e.message };
  }
}

function testLiveVsReplay() {
  const name = "Live Sim vs Replay";
  try {
    // 1. Setup Live
    const liveState = createInitialState(TEST_SEED);
    const tl = createTimelineFromInitialState(liveState);

    // Ensure we start from a clean, canonical planning snapshot.
    // This matches what replay does (rebuildStateAtSecond calls canonicalize first).
    canonicalizeSnapshot(liveState, 0);

    const startSec = liveState.tSec ?? 0;
    const targetSec = startSec + 1;

    // 2. Start Season (Live)
    // Use the COMMAND directly, mirroring timeline.js internals.
    // Do not use applyAction (which is for planning phase actions).

    // 3. Run Live Loop (mirrors timeline.js::simulateOneSeason EXACTLY)
    const ticksPerSecond = 60; // 1 second == 60 ticks
    const ticksToRun = (targetSec - startSec) * ticksPerSecond;

    for (let i = 0; i < ticksToRun; i++) {
      updateGame(DT_STEP, liveState);
    }

    if ((liveState.tSec ?? 0) < targetSec) {
      throw new Error("Live sim failed to reach target second");
    }

    // 4. Canonicalize Live Result
    // RebuildStateAtSecond ends with a hard canonicalize call.
    // We must do the same to Live to ensure apples-to-apples comparison
    // (clearing transient floating point noise or flags).
    canonicalizeSnapshot(liveState, targetSec);

    const liveHash = computeStateHash(liveState);

    // 5. Rebuild from Timeline (Replay)

    const rebuildRes = rebuildStateAtSecond(tl, targetSec, {
      dtStep: DT_STEP,
    });
    if (!rebuildRes.ok) throw new Error("Rebuild failed: " + rebuildRes.reason);

    const replayHash = computeStateHash(rebuildRes.state);

    if (liveHash !== replayHash) {
      // Debug helper: log key counters
      console.warn("Mismatch Details:", {
        live: {
          tSec: liveState.tSec,
          turn: liveState.turn,
          simTime: liveState.simTime,
          gold: liveState.resources?.gold,
        },
        replay: {
          tSec: rebuildRes.state.tSec,
          turn: rebuildRes.state.turn,
          simTime: rebuildRes.state.simTime,
          gold: rebuildRes.state.resources?.gold,
        },
      });
      return {
        name,
        passed: false,
        reason: `Hash mismatch (Live: ${liveHash} vs Replay: ${replayHash})`,
      };
    }

    return { name, passed: true, hash: liveHash };
  } catch (e) {
    return { name, passed: false, reason: e.message };
  }
}

function testProjectionVsReplay() {
  const name = "Projection vs Replay";
  try {
    const s0 = createInitialState(TEST_SEED + 1);
    const tl = createTimelineFromInitialState(s0);

    const baseSec = 0;
    const targetSec = 1; // Project 1 season forward

    // 1. Generate Projection
    // This simulates PURELY from 0 -> 1 using the projection logic.
    const winRes = buildMetricGraphWindowFromTimeline(tl, baseSec, {
      horizon: 5,
      dtStep: DT_STEP,
    });

    if (!winRes.ok) throw new Error("Projection failed: " + winRes.reason);

    // Extract the state data for second 1
    const projectedData = winRes.stateDataByBoundary.get(targetSec);
    if (!projectedData)
      throw new Error(
        "Projection yielded no data for second " + targetSec
      );

    const projectedState = deserializeGameState(projectedData);
    const projHash = computeStateHash(projectedState);

    // 2. Generate Replay
    const rebuildRes = rebuildStateAtSecond(tl, targetSec, {
      dtStep: DT_STEP,
    });
    if (!rebuildRes.ok) throw new Error("Rebuild failed: " + rebuildRes.reason);

    const replayHash = computeStateHash(rebuildRes.state);

    if (projHash !== replayHash) {
      return {
        name,
        passed: false,
        reason: `Hash mismatch (Proj: ${projHash} vs Replay: ${replayHash})`,
      };
    }

    return { name, passed: true, hash: projHash };
  } catch (e) {
    return { name, passed: false, reason: e.message };
  }
}

function testHistoryStableAfterFutureAction() {
  const name = "History Stable After Future Action";
  try {
    const historyEndSec = 300;
    const sampleSec = 120;
    const actionSec = 240;

    const s0 = createInitialState(HISTORY_TEST_SETUP_ID, TEST_SEED);
    const tl = createTimelineFromInitialState(s0);
    tl.historyEndSec = historyEndSec;
    tl.cursorSec = historyEndSec;

    const before = rebuildStateAtSecond(tl, sampleSec);
    if (!before.ok) throw new Error("Rebuild failed: " + before.reason);

    const beforeHash = computeStateHash(before.state);
    const beforeEvents = summarizeEnvEvents(before.state);

    const action = {
      kind: ActionKinds.DEBUG_SET_CAP,
      payload: { cap: 42, points: 42, enabled: true },
      apCost: 0,
    };
    const replaceRes = replaceActionsAtSecond(tl, actionSec, [action], {
      truncateFuture: true,
    });
    if (!replaceRes.ok) {
      throw new Error("replaceActionsAtSecond failed: " + replaceRes.reason);
    }

    tl.historyEndSec = actionSec;
    tl.cursorSec = actionSec;

    const after = rebuildStateAtSecond(tl, sampleSec);
    if (!after.ok) throw new Error("Rebuild failed: " + after.reason);

    const afterHash = computeStateHash(after.state);
    const afterEvents = summarizeEnvEvents(after.state);

    if (beforeHash !== afterHash) {
      return {
        name,
        passed: false,
        reason: `Hash mismatch at t=${sampleSec} (before ${beforeHash} vs after ${afterHash})`,
        beforeEvents,
        afterEvents,
      };
    }

    return { name, passed: true, hash: beforeHash };
  } catch (e) {
    return { name, passed: false, reason: e.message };
  }
}

function testHistoryPreviewMatchesReplay() {
  const name = "History Preview Matches Replay";
  try {
    const historyEndSec = 300;
    const sampleSec = 120;
    const actionSec = 240;

    const s0 = createInitialState(HISTORY_TEST_SETUP_ID, TEST_SEED + 1);
    const tl = createTimelineFromInitialState(s0);
    tl.historyEndSec = historyEndSec;
    tl.cursorSec = historyEndSec;

    const cursorRes = rebuildStateAtSecond(tl, historyEndSec);
    if (!cursorRes.ok) throw new Error("Rebuild failed: " + cursorRes.reason);
    let cursorState = cursorRes.state;

    const projection = getSharedProjectionCache();
    projection.clear?.();

    const controller = createTimeGraphController({
      getTimeline: () => tl,
      getCursorState: () => cursorState,
    });
    controller.setActive(true);
    const cacheRes = controller.ensureCache();
    if (cacheRes && cacheRes.ok === false) {
      throw new Error("Cache build failed: " + cacheRes.reason);
    }

    const previewBefore = controller.getStateAt(sampleSec);
    if (!previewBefore) throw new Error("Preview state missing (before edit)");
    const previewBeforeHash = computeStateHash(previewBefore);

    const replayBefore = rebuildStateAtSecond(tl, sampleSec);
    if (!replayBefore.ok) throw new Error("Rebuild failed: " + replayBefore.reason);
    const replayBeforeHash = computeStateHash(replayBefore.state);

    if (previewBeforeHash !== replayBeforeHash) {
      return {
        name,
        passed: false,
        reason: `Preview mismatch before edit at t=${sampleSec} (${previewBeforeHash} vs ${replayBeforeHash})`,
      };
    }

    const action = {
      kind: ActionKinds.DEBUG_SET_CAP,
      payload: { cap: 37, points: 37, enabled: true },
      apCost: 0,
    };
    const replaceRes = replaceActionsAtSecond(tl, actionSec, [action], {
      truncateFuture: true,
    });
    if (!replaceRes.ok) {
      throw new Error("replaceActionsAtSecond failed: " + replaceRes.reason);
    }

    tl.historyEndSec = actionSec;
    tl.cursorSec = actionSec;

    const nextCursorRes = rebuildStateAtSecond(tl, actionSec);
    if (!nextCursorRes.ok) {
      throw new Error("Rebuild failed: " + nextCursorRes.reason);
    }
    cursorState = nextCursorRes.state;

    controller.handleInvalidate?.("actionDispatched");

    const previewAfter = controller.getStateAt(sampleSec);
    if (!previewAfter) throw new Error("Preview state missing (after edit)");
    const previewAfterHash = computeStateHash(previewAfter);

    const replayAfter = rebuildStateAtSecond(tl, sampleSec);
    if (!replayAfter.ok) throw new Error("Rebuild failed: " + replayAfter.reason);
    const replayAfterHash = computeStateHash(replayAfter.state);

    if (replayAfterHash !== replayBeforeHash) {
      return {
        name,
        passed: false,
        reason: `Replay history changed after edit at t=${sampleSec} (${replayBeforeHash} vs ${replayAfterHash})`,
      };
    }

    if (previewAfterHash !== replayAfterHash) {
      return {
        name,
        passed: false,
        reason: `Preview mismatch after edit at t=${sampleSec} (${previewAfterHash} vs ${replayAfterHash})`,
      };
    }

    return { name, passed: true, hash: replayAfterHash };
  } catch (e) {
    return { name, passed: false, reason: e.message };
  }
}

function testVassalSelectionDoesNotAdvanceSharedRng() {
  const name = "Vassal Selection Leaves Shared RNG Stable";
  try {
    const state = createInitialState("devPlaytesting01", TEST_SEED + 2);
    const pool = buildSettlementVassalSelectionPool(state, 0);
    if (!pool?.candidates?.length) {
      throw new Error("Vassal selection pool missing");
    }

    const beforeSeed = Math.floor(state?.rng?.seed ?? 0);
    const selectionRes = selectSettlementVassal(state, 0, pool.expectedPoolHash, 0);
    if (!selectionRes?.ok) {
      throw new Error("Selection failed: " + (selectionRes?.reason ?? "unknown"));
    }
    const afterSeed = Math.floor(state?.rng?.seed ?? 0);

    if (beforeSeed !== afterSeed) {
      return {
        name,
        passed: false,
        reason: `Shared RNG advanced (${beforeSeed} -> ${afterSeed})`,
      };
    }

    return { name, passed: true, seed: beforeSeed };
  } catch (e) {
    return { name, passed: false, reason: e.message };
  }
}

function testVassalSelectionPreservesNonLineageTimeline() {
  const name = "Vassal Selection Preserves Non-Lineage Timeline";
  try {
    const baseline = createInitialState("devPlaytesting01", TEST_SEED + 3);
    const selected = deserializeGameState(serializeGameState(baseline));
    const pool = buildSettlementVassalSelectionPool(selected, 0);
    if (!pool?.candidates?.length) {
      throw new Error("Vassal selection pool missing");
    }

    const selectionRes = selectSettlementVassal(selected, 0, pool.expectedPoolHash, 0);
    if (!selectionRes?.ok) {
      throw new Error("Selection failed: " + (selectionRes?.reason ?? "unknown"));
    }

    runSimulationSeconds(baseline, 120);
    runSimulationSeconds(selected, 120);

    const baselineHash = computeStateHash(clearVassalLineageForHash(baseline));
    const selectedHash = computeStateHash(clearVassalLineageForHash(selected));

    if (baselineHash !== selectedHash) {
      return {
        name,
        passed: false,
        reason: `Non-lineage state diverged (${baselineHash} vs ${selectedHash})`,
      };
    }

    return { name, passed: true, hash: baselineHash };
  } catch (e) {
    return { name, passed: false, reason: e.message };
  }
}

function setSettlementClassPopulation(state, classId, adults, youth = 0) {
  const classState = getSettlementPopulationClassState(state, classId);
  if (!classState) return;
  classState.adults = Math.max(0, Math.floor(adults));
  classState.youth = Math.max(0, Math.floor(youth));
  classState.commitments = [];
}

function getVillagerCommitmentAmount(state, sourceId) {
  const classState = getSettlementPopulationClassState(state, "villager");
  const commitments = Array.isArray(classState?.commitments) ? classState.commitments : [];
  return commitments.reduce((sum, commitment) => {
    if (commitment?.sourceId !== sourceId) return sum;
    return sum + Math.max(0, Math.floor(commitment?.amount ?? 0));
  }, 0);
}

function testFloodplainFieldFoodSeasonalRules() {
  const name = "Floodplain Field Food Seasonal Rules";
  try {
    const winterState = createInitialState("devPlaytesting01", TEST_SEED + 4);
    setSettlementClassPopulation(winterState, "villager", 0, 0);
    for (const tile of getSettlementFloodplainTiles(winterState)) {
      setSettlementTileFood(tile, 50);
    }
    runSimulationSeconds(winterState, 17);
    if (getSettlementFloodplainFoodTotal(winterState) <= 0) {
      throw new Error("Autumn should no longer clear floodplain field food");
    }
    runSimulationSeconds(winterState, 8);
    if (getSettlementFloodplainFoodTotal(winterState) !== 0) {
      throw new Error("Winter flood did not clear floodplain field food");
    }

    const springState = createInitialState("devPlaytesting01", TEST_SEED + 5);
    setSettlementClassPopulation(springState, "villager", 0, 0);
    const springTiles = getSettlementFloodplainTiles(springState);
    if (springTiles.length < 2) throw new Error("Expected at least two floodplain tiles");
    springState.currentSeasonIndex = 3;
    springState.currentSeasonDeck = null;
    springState.seasonClockSec = 0;
    springState.seasonTimeRemaining = springState.seasonDurationSec;
    getHubCore(springState).props.floodWindowArmed = true;
    setSettlementTileFood(springTiles[0], 98);
    setSettlementTileFood(springTiles[1], 100);

    runSimulationSeconds(springState, 9);
    const first = getSettlementTileFood(springTiles[0]);
    const second = getSettlementTileFood(springTiles[1]);
    if (first !== 100 || second !== 100) {
      throw new Error(`Spring deposit did not cap per tile at 100 (${first}, ${second})`);
    }

    return { name, passed: true };
  } catch (e) {
    return { name, passed: false, reason: e.message };
  }
}

function testFloodplainFieldFoodSummerDecay() {
  const name = "Floodplain Field Food Summer Decay";
  try {
    const state = createInitialState("devPlaytesting01", TEST_SEED + 6);
    setSettlementClassPopulation(state, "villager", 0, 0);
    const stockpiles = getHubCore(state)?.systemState?.stockpiles;
    stockpiles.food = 33;
    const tiles = getSettlementFloodplainTiles(state);
    if (tiles.length < 2) throw new Error("Expected at least two floodplain tiles");
    setSettlementTileFood(tiles[0], 11);
    setSettlementTileFood(tiles[1], 1);

    runSimulationSeconds(state, 12);

    const first = getSettlementTileFood(tiles[0]);
    const second = getSettlementTileFood(tiles[1]);
    const granaryFood = getSettlementStockpile(state, "food");
    if (first !== 8 || second !== 0) {
      throw new Error(`Summer decay mismatch (${first}, ${second})`);
    }
    if (granaryFood !== 33) {
      throw new Error(`Summer decay changed granary food (${granaryFood})`);
    }

    return { name, passed: true };
  } catch (e) {
    return { name, passed: false, reason: e.message };
  }
}

function testPopulationMealsConsumeFieldFood() {
  const name = "Population Meals Consume Field Food";
  try {
    const state = createInitialState("devPlaytesting01", TEST_SEED + 8);
    setSettlementClassPopulation(state, "villager", 5, 0);
    const stockpiles = getHubCore(state)?.systemState?.stockpiles;
    stockpiles.food = 0;
    for (const tile of getSettlementFloodplainTiles(state)) {
      setSettlementTileFood(tile, 0);
    }
    setSettlementTileFood(getSettlementFloodplainTiles(state)[0], 10);

    runSimulationSeconds(state, 4);

    if (getSettlementStockpile(state, "food") !== 0) {
      throw new Error("Population meals should consume field food after empty hub food");
    }
    if (getSettlementFloodplainFoodTotal(state) !== 5) {
      throw new Error(`Expected 5 field food after meals, got ${getSettlementFloodplainFoodTotal(state)}`);
    }
    if (getSettlementTotalFood(state) !== 5) {
      throw new Error(`Expected total food 5 after meals, got ${getSettlementTotalFood(state)}`);
    }

    return { name, passed: true };
  } catch (e) {
    return { name, passed: false, reason: e.message };
  }
}

function testRiverRecessionFarmingMovesFieldFood() {
  const name = "River Recession Farming Moves Field Food";
  try {
    const state = createInitialState("devPlaytesting01", TEST_SEED + 7);
    setSettlementClassPopulation(state, "villager", 4, 0);
    const core = getHubCore(state);
    const stockpiles = core?.systemState?.stockpiles;
    stockpiles.food = 0;
    stockpiles.redResource = 3;
    stockpiles.greenResource = 99;
    for (const tile of getSettlementFloodplainTiles(state)) {
      setSettlementTileFood(tile, 0);
    }
    setSettlementTileFood(getSettlementFloodplainTiles(state)[0], 25);
    state.hub.zones.practiceByClass.villager.slots[0].card =
      createSettlementCardInstance(
        "riverRecessionFarming",
        "settlementPractice",
        state
      );

    runSimulationSeconds(state, 1);

    if (getSettlementStockpile(state, "redResource") !== 1) {
      throw new Error(`Expected redResource 1 after starting packets, got ${getSettlementStockpile(state, "redResource")}`);
    }
    if (getSettlementFloodplainFoodTotal(state) !== 5) {
      throw new Error(`Expected field food 5 after starting packets, got ${getSettlementFloodplainFoodTotal(state)}`);
    }
    if (getVillagerCommitmentAmount(state, "riverRecessionFarming") !== 2) {
      throw new Error("Expected two reserved farming packets");
    }
    if (getSettlementStockpile(state, "food") !== 0) {
      throw new Error("Farming added granary food before reservation release");
    }

    runSimulationSeconds(state, 6);

    if (getVillagerCommitmentAmount(state, "riverRecessionFarming") !== 0) {
      throw new Error("Farming reservation did not release");
    }
    if (getSettlementStockpile(state, "food") !== 24) {
      throw new Error(`Expected 24 granary food after release, got ${getSettlementStockpile(state, "food")}`);
    }
    if (getSettlementStockpile(state, "greenResource") !== 99) {
      throw new Error("River Recession Farming should not consume inert greenResource");
    }

    return { name, passed: true };
  } catch (e) {
    return { name, passed: false, reason: e.message };
  }
}

function testRedGodChaosIncomeBaseGrowthAndFaithMitigation() {
  const name = "Red God Chaos Income Base Growth And Faith Mitigation";
  try {
    const state = createInitialState("devPlaytesting01", TEST_SEED + 9);
    setSettlementClassPopulation(state, "villager", 0, 0);
    setSettlementClassPopulation(state, "stranger", 0, 0);

    let summary = getSettlementChaosIncomeSummary(state, "redGod");
    if (summary.baseIncome !== 10 || summary.totalIncome !== 10) {
      throw new Error(`Expected initial chaos income 10, got base ${summary.baseIncome}, total ${summary.totalIncome}`);
    }

    state.tSec = getSettlementYearDurationSec(state) * 12;
    summary = getSettlementChaosIncomeSummary(state, "redGod");
    if (summary.growthSteps !== 1 || summary.baseIncome !== 11 || summary.totalIncome !== 11) {
      throw new Error(`Expected one growth step to base 11, got steps ${summary.growthSteps}, base ${summary.baseIncome}, total ${summary.totalIncome}`);
    }

    setSettlementClassPopulation(state, "villager", 5, 0);
    getSettlementPopulationClassState(state, "villager").faith.tier = "gold";
    summary = getSettlementChaosIncomeSummary(state, "redGod");
    if (summary.totalMitigation !== 5 || summary.totalIncome !== 6) {
      throw new Error(`Expected gold mitigation 5 and income 6, got mitigation ${summary.totalMitigation}, income ${summary.totalIncome}`);
    }

    setSettlementClassPopulation(state, "stranger", 3, 0);
    getSettlementPopulationClassState(state, "stranger").faith.tier = "diamond";
    summary = getSettlementChaosIncomeSummary(state, "redGod");
    if (summary.totalMitigation !== 11 || summary.totalIncome !== 0) {
      throw new Error(`Expected diamond mitigation to clamp income at 0, got mitigation ${summary.totalMitigation}, income ${summary.totalIncome}`);
    }

    return { name, passed: true };
  } catch (e) {
    return { name, passed: false, reason: e.message };
  }
}
