// Direct simulation is the baseline. Rebuilds, JSON forks, and save slots are compared to it.
// Stdout is one aggregate line. Logs, checkpoints, and failures go under artifacts/replay-stress/.
// --horizon is a minimum end second: a started Life Map node may resolve later.
// Larger run: npm run test:replay-stress -- --seeds 64 --horizon 240
import fs from "node:fs";
import path from "node:path";
import { ActionKinds, applyAction } from "../src/model/actions.js";
import { setPaused } from "../src/model/game-model.js";
import { createNewGameState } from "../src/model/new-game.js";
import { advanceReplayStateToSecond, initializeReplayClock } from "../src/model/replay-second-runner.js";
import { deserializeGameState, serializeGameState, syncPhaseToPaused } from "../src/model/state.js";
import { appendActionAtCursor, createTimelineFromInitialState, rebuildStateAtSecond } from "../src/model/timeline/index.js";
import { getCurrentLifeMapVassal, getVassalCandidatePool, getVassalNodeDecisionPresentation } from "../src/model/vassal-life-map.js";
import { inspectSaveSlot, writeSaveToSlot } from "../src/controllers/sim-runner/save-slots.js";
import { createSaveTestStorage } from "./save-test-storage.mjs";

const ARTIFACT_DIR = path.resolve("artifacts/replay-stress");
const DEFAULT_SEEDS = 2;
const DEFAULT_HORIZON = 36;
const FIT_PHASE_COST = 220;
const totals = { comparisons: 0, json: 0, scrubs: 0, actions: 0, extended: 0, terminals: 0 };
const kinds = new Map();
const families = new Map();
const failures = [];
let comparatorOk = false;
let saveSlot = "skipped";
let runId = "run";

function parseArgs(argv) {
  let seedCount = null;
  let onlySeed = null;
  let horizon = null;
  for (let index = 2; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = Number(argv[++index]);
    if (!Number.isInteger(value) || value < 0) throw new Error(`Expected a non-negative integer after ${flag}`);
    if (flag === "--seeds") seedCount = value;
    else if (flag === "--seed") onlySeed = value;
    else if (flag === "--horizon") horizon = value;
    else throw new Error(`Unknown argument ${flag}`);
  }
  const horizonSec = horizon ?? DEFAULT_HORIZON;
  const seeds = onlySeed != null ? [onlySeed] : Array.from({ length: seedCount ?? DEFAULT_SEEDS }, (_, index) => index + 1);
  if (!seeds.length || horizonSec < 1) throw new Error("Need at least one seed and a horizon of at least 1");
  return { seeds, horizonSec, onlySeed };
}

function preview(value) {
  if (typeof value === "string") return JSON.stringify(value.slice(0, 48));
  const text = JSON.stringify(value);
  if (typeof text !== "string") return String(value);
  return text.length > 90 ? `${text.slice(0, 87)}...` : text;
}

function firstDifference(actual, expected, pathName = "$") {
  if (Object.is(actual, expected)) return null;
  const objects = actual != null && expected != null && typeof actual === "object" && typeof expected === "object";
  if (!objects) return { path: pathName, actual: preview(actual), expected: preview(expected) };
  if (Array.isArray(actual) || Array.isArray(expected)) {
    if (!Array.isArray(actual) || !Array.isArray(expected) || actual.length !== expected.length) {
      return { path: pathName, actual: preview(actual), expected: preview(expected) };
    }
    for (let index = 0; index < actual.length; index += 1) {
      const difference = firstDifference(actual[index], expected[index], `${pathName}[${index}]`);
      if (difference) return difference;
    }
    return null;
  }
  for (const key of [...new Set([...Object.keys(actual), ...Object.keys(expected)])].sort()) {
    const next = `${pathName}.${key}`;
    if (!Object.prototype.hasOwnProperty.call(actual, key)) return { path: next, actual: "missing", expected: preview(expected[key]) };
    if (!Object.prototype.hasOwnProperty.call(expected, key)) return { path: next, actual: preview(actual[key]), expected: "missing" };
    const difference = firstDifference(actual[key], expected[key], next);
    if (difference) return difference;
  }
  return null;
}

function repro(seed, horizonSec) {
  return `node scripts/replay-stress-test.mjs --seed ${seed} --horizon ${horizonSec}`;
}

function writeJson(name, value) {
  const file = path.join(ARTIFACT_DIR, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function bump(map, key) { map.set(key, (map.get(key) ?? 0) + 1); }

function recordFailure(failure) {
  failures.push(failure);
  const file = `failures/${runId}/seed-${failure.seed}-${String(failure.label).replace(/[^a-z0-9-]+/gi, "-")}.json`;
  writeJson(file, failure);
  console.error(
    `FAIL seed=${failure.seed} field=${failure.difference?.path ?? failure.reason} `
    + `expected=${failure.difference?.expected ?? ""} actual=${failure.difference?.actual ?? ""} `
    + `repro=${failure.repro} artifact=artifacts/replay-stress/${file}`,
  );
}

function fail(session, label, extra = {}) {
  if (session.failed) return;
  session.failed = true;
  recordFailure({ seed: session.seed, label, repro: repro(session.seed, session.horizonSec), ...extra });
}

function match(session, actual, expected, label) {
  totals.comparisons += 1;
  const difference = firstDifference(actual, expected);
  if (!difference) return true;
  fail(session, label, { difference });
  return false;
}

function proveComparator(sample) {
  const corrupt = JSON.parse(JSON.stringify(sample));
  corrupt.rng.vassalSeed = Math.floor(corrupt.rng.vassalSeed) + 1;
  const difference = firstDifference(corrupt, sample);
  comparatorOk = Boolean(difference?.path?.includes("vassalSeed"));
  writeJson("comparator-probe.json", {
    detected: comparatorOk, path: difference?.path ?? null,
    expected: difference?.expected ?? null, actual: difference?.actual ?? null,
  });
  if (!comparatorOk) recordFailure({ seed: 0, label: "comparator", reason: "corruption-not-detected", difference, repro: "node scripts/replay-stress-test.mjs" });
}

function applyLive(state, kind, payload) {
  setPaused(state, true);
  syncPhaseToPaused(state);
  const result = applyAction(state, { kind, payload });
  setPaused(state, false);
  syncPhaseToPaused(state);
  return result;
}

function tickTo(session, sec) {
  if (session.failed || session.terminal) return Math.floor(session.state.tSec ?? 0);
  const result = advanceReplayStateToSecond(session.state, sec);
  const reached = Math.floor(session.state.tSec ?? 0);
  session.script.push({ type: "tick", to: reached });
  if (!result.ok) {
    if (session.state.runStatus?.complete === true) {
      session.terminal = { tSec: reached, reason: session.state.runStatus.reason ?? "complete" };
      totals.terminals += 1;
    } else fail(session, `advance-${sec}`, { reason: result.reason ?? "advanceFailed" });
  }
  return reached;
}

function commit(session, kind, payload) {
  if (session.failed) return { ok: false, reason: "priorFailure" };
  const result = applyLive(session.state, kind, payload);
  const tSec = Math.floor(session.state.tSec ?? 0);
  if (!result?.ok) return result;
  const recorded = appendActionAtCursor(session.timeline, { kind, payload, tSec }, session.state);
  if (!recorded.ok) return recorded;
  session.script.push({ type: "action", kind, payload, tSec });
  totals.actions += 1;
  bump(kinds, kind);
  return result;
}

function rngView(data) {
  const rng = data?.rng ?? {};
  return {
    seed: rng.seed, baseSeed: rng.baseSeed, vassalSeed: rng.vassalSeed,
    vassalDevelopmentSeed: rng.vassalDevelopmentSeed, vassalLifeMapSeed: rng.vassalLifeMapSeed,
    vassalPortraitSeed: rng.vassalPortraitSeed,
  };
}

function snap(session, label) {
  if (session.failed) return null;
  const tSec = Math.floor(session.state.tSec ?? 0);
  const expected = serializeGameState(session.state);
  const rebuilt = rebuildStateAtSecond(session.timeline, tSec);
  const again = rebuildStateAtSecond(session.timeline, tSec);
  const entry = { label, tSec, scriptIndex: session.script.length, rng: rngView(expected) };
  session.checkpoints.push(entry);
  if (!rebuilt?.ok || !again?.ok) {
    fail(session, label, { reason: rebuilt?.reason ?? again?.reason ?? "rebuildFailed" });
    return null;
  }
  const ok = match(session, serializeGameState(rebuilt.state), expected, label)
    && match(session, serializeGameState(again.state), expected, `${label}-repeat`);
  if (!ok) return null;
  session.snapshots.set(label, { tSec, data: expected, scriptIndex: session.script.length });
  if (!comparatorOk) proveComparator(expected);
  return expected;
}

function replayScript(data, script) {
  const copy = deserializeGameState(JSON.parse(JSON.stringify(data)));
  const difference = firstDifference(serializeGameState(copy), data);
  if (difference) return { ok: false, reason: "jsonRoundTrip", difference, copy };
  for (const record of script) {
    if (record.type === "tick") {
      const result = advanceReplayStateToSecond(copy, record.to);
      if (!result?.ok) return { ok: false, reason: result?.reason ?? "forkAdvance", copy };
    } else {
      const result = applyLive(copy, record.kind, record.payload);
      if (!result?.ok) return { ok: false, reason: result?.reason ?? "forkAction", copy };
    }
  }
  return { ok: true, copy };
}

function jsonContinue(session, fromLabel, toLabel) {
  const from = session.snapshots.get(fromLabel);
  const to = session.snapshots.get(toLabel);
  if (session.failed || !from || !to) return;
  const fork = replayScript(from.data, session.script.slice(from.scriptIndex, to.scriptIndex));
  totals.json += 1;
  if (!fork.ok) {
    fail(session, `json-${fromLabel}`, { reason: fork.reason, difference: fork.difference });
    return;
  }
  match(session, serializeGameState(fork.copy), to.data, `json-${fromLabel}-to-${toLabel}`);
}

function scrub(session, earlyLabel, lateLabel) {
  const early = session.snapshots.get(earlyLabel);
  const late = session.snapshots.get(lateLabel);
  if (session.failed || !early || !late) return;
  const back = rebuildStateAtSecond(session.timeline, early.tSec);
  const forward = rebuildStateAtSecond(session.timeline, late.tSec);
  totals.scrubs += 1;
  if (!back?.ok || !forward?.ok) {
    fail(session, "scrub", {
      reason: `back=${back?.ok ? "ok" : (back?.reason ?? "rebuildFailed")};forward=${forward?.ok ? "ok" : (forward?.reason ?? "rebuildFailed")}`,
    });
    return;
  }
  match(session, serializeGameState(back.state), early.data, `scrub-back-${early.tSec}`);
  match(session, serializeGameState(forward.state), late.data, `scrub-forward-${late.tSec}`);
}

function assertNewGame(session) {
  const state = session.state;
  const players = state.world.regions.filter((region) => region.controller === "player").map((region) => region.id).sort();
  const pair = players.join("|");
  const problems = [];
  if (players.length !== 2) problems.push(`players=${players.length}`);
  if (state.world.sites.length !== 6) problems.push(`sites=${state.world.sites.length}`);
  if (state.world.sites.filter((site) => site.neutral).length !== 4) problems.push("neutrals");
  if (state.world.regions.filter((region) => region.monster).length !== 1) problems.push("monster");
  if (!state.world.connections.some((edge) => [edge.regionAId, edge.regionBId].sort().join("|") === pair)) problems.push("road");
  if (!getVassalCandidatePool(state).candidates.length) problems.push("candidates");
  if (problems.length) fail(session, "new-game", { reason: problems.join(",") });
  return players;
}

function foundVassal(session) {
  const actionSec = 2 + (Math.abs(session.seed) % 5);
  tickTo(session, actionSec - 1);
  snap(session, "before-actions");
  tickTo(session, actionSec);
  const rerolled = commit(session, ActionKinds.SETTLEMENT_REROLL_VASSALS, {});
  if (!rerolled?.ok || getVassalCandidatePool(session.state).rerollIndex !== 1) {
    fail(session, "reroll", { reason: rerolled?.reason ?? "rerollIndex" });
    return null;
  }
  const pool = getVassalCandidatePool(session.state);
  const selected = commit(session, ActionKinds.SETTLEMENT_SELECT_VASSAL, {
    candidateIndex: Math.abs(session.seed) % pool.candidates.length,
    expectedPoolHash: pool.expectedPoolHash,
  });
  const vassal = getCurrentLifeMapVassal(session.state);
  const nodeId = vassal?.lifeMap?.graph?.foundingNodeId ?? null;
  if (!selected?.ok || !nodeId) {
    fail(session, "select-vassal", { reason: selected?.reason ?? "noFoundingNode" });
    return null;
  }
  const entered = commit(session, ActionKinds.VASSAL_ENTER_LIFE_NODE, { nodeId });
  const option = commit(session, ActionKinds.VASSAL_SELECT_LIFE_OPTION, { nodeId, optionId: "train-estate" });
  const confirmed = commit(session, ActionKinds.VASSAL_CONFIRM_LIFE_NODE, { nodeId });
  const family = vassal.lifeMap.graph.nodes.find((node) => node.id === nodeId)?.family ?? "founding";
  bump(families, family);
  const sameSecond = session.script.filter((record) => record.type === "action" && record.tSec === actionSec).length;
  if (!entered?.ok || !option?.ok || !confirmed?.ok || sameSecond < 2 || actionSec <= 0) {
    fail(session, "founding-actions", {
      reason: entered?.reason ?? option?.reason ?? confirmed?.reason ?? "actionBatch",
      detail: { family, nodeId, sameSecond, actionSec },
    });
    return null;
  }
  snap(session, "at-actions");
  const pending = getCurrentLifeMapVassal(session.state)?.lifeMap?.pendingResolution;
  if (!pending) {
    fail(session, "founding-pending", { reason: "missingPendingResolution" });
    return null;
  }
  if (pending.resolveSec - 1 > actionSec) tickTo(session, pending.resolveSec - 1);
  snap(session, "before-founding-resolution");
  tickTo(session, pending.resolveSec);
  snap(session, "at-founding-resolution");
  const resolved = getCurrentLifeMapVassal(session.state);
  const nodeState = resolved?.lifeMap?.nodeStates?.[nodeId];
  if (!nodeState?.resolved || resolved.lifeMap.pendingResolution) {
    fail(session, "founding-resolved", { reason: session.terminal?.reason ?? "unresolved", detail: { nodeId, family } });
    return null;
  }
  return { actionSec, nodeId, family };
}

function pickOption(seed, options) {
  const ranked = options.slice().sort((left, right) =>
    (left.phaseCost ?? 0) - (right.phaseCost ?? 0) || String(left.id).localeCompare(String(right.id)));
  const fitting = ranked.filter((option) => (option.phaseCost ?? 0) <= FIT_PHASE_COST);
  const pool = fitting.length ? fitting : ranked.slice(0, 1);
  return pool[Math.abs(seed) % pool.length];
}

function laterDecision(session) {
  const vassal = getCurrentLifeMapVassal(session.state);
  const available = vassal?.lifeMap?.availableNodeIds ?? [];
  if (!available.length) {
    fail(session, "later-node", { reason: session.terminal?.reason ?? "noAvailableNode" });
    return null;
  }
  const nodeId = available[Math.abs(session.seed) % available.length];
  const family = vassal.lifeMap.graph.nodes.find((node) => node.id === nodeId)?.family ?? "unknown";
  const entered = commit(session, ActionKinds.VASSAL_ENTER_LIFE_NODE, { nodeId });
  if (!entered?.ok) {
    fail(session, "later-enter", { reason: entered?.reason ?? "enterFailed", detail: { nodeId, family } });
    return null;
  }
  const rngBefore = JSON.stringify(session.state.rng);
  const presentation = getVassalNodeDecisionPresentation(session.state, nodeId);
  if (JSON.stringify(session.state.rng) !== rngBefore) {
    fail(session, "presentation-rng", { reason: "decisionPresentationConsumedRng", detail: { nodeId, family } });
    return null;
  }
  const options = (presentation?.nodeState?.options ?? []).filter((option) => {
    const requirements = presentation.optionRequirements?.[option.id] ?? [];
    return requirements.every((entry) => entry.met) && (option.prestigeCost ?? 0) <= (presentation.currentPrestige ?? 0);
  });
  let decision = family;
  if (options.length) {
    const picked = pickOption(session.seed, options);
    decision = picked.id;
    const selected = commit(session, ActionKinds.VASSAL_SELECT_LIFE_OPTION, { nodeId, optionId: picked.id });
    const payload = family === "relic" ? { nodeId, acquire: { destination: "decline" } } : { nodeId };
    const confirmed = commit(session, ActionKinds.VASSAL_CONFIRM_LIFE_NODE, payload);
    if (!selected?.ok || !confirmed?.ok) {
      fail(session, "later-choice", { reason: selected?.reason ?? confirmed?.reason ?? "choiceFailed", detail: { nodeId, family, decision } });
      return null;
    }
  } else {
    const offers = (presentation?.offers ?? []).filter((offer) =>
      offer.intervention?.kind === "structure" ? offer.validOrigins?.length > 0 : offer.canStage === true);
    if (offers.length) {
      const picked = pickOption(session.seed, offers.map((offer) => ({ ...offer, id: offer.offerId })));
      decision = picked.offerId;
      const payload = { nodeId, offerId: picked.offerId };
      if (picked.intervention?.kind === "structure") {
        payload.origin = picked.validOrigins[Math.abs(session.seed) % picked.validOrigins.length];
      }
      const bought = commit(session, ActionKinds.VASSAL_PURCHASE_SHOP_OFFER, payload);
      if (!bought?.ok) {
        fail(session, "later-purchase", { reason: bought?.reason ?? "purchaseFailed", detail: { nodeId, family, decision } });
        return null;
      }
    } else decision = "empty-shop-confirm";
    const confirmed = commit(session, ActionKinds.VASSAL_CONFIRM_LIFE_NODE, { nodeId });
    if (!confirmed?.ok) {
      fail(session, "later-confirm", { reason: confirmed?.reason ?? "confirmFailed", detail: { nodeId, family, decision, options: options.map((option) => option.id) } });
      return null;
    }
  }
  bump(families, family);
  snap(session, "at-later-decision");
  const pending = getCurrentLifeMapVassal(session.state)?.lifeMap?.pendingResolution;
  if (pending?.resolveSec > Math.floor(session.state.tSec ?? 0)) {
    tickTo(session, pending.resolveSec - 1);
    snap(session, "before-later-resolution");
    tickTo(session, pending.resolveSec);
  }
  snap(session, "at-later-resolution");
  const after = getCurrentLifeMapVassal(session.state);
  const resolved = after?.lifeMap?.nodeStates?.[nodeId]?.resolved === true || after?.lifeMap?.completedNodeIds?.includes(nodeId);
  if (!resolved) {
    fail(session, "later-resolved", { reason: session.terminal?.reason ?? "unresolved", detail: { nodeId, family, decision } });
    return null;
  }
  return { nodeId, family, decision };
}

function openSession(seed, horizonSec) {
  const state = createNewGameState(seed);
  initializeReplayClock(state, 0);
  return {
    seed, horizonSec, state, failed: false, terminal: null,
    timeline: createTimelineFromInitialState(state),
    script: [], checkpoints: [], snapshots: new Map(),
  };
}

async function saveAndContinue(session) {
  const saved = session.snapshots.get("at-actions");
  const finalSnap = session.snapshots.get("horizon") ?? session.snapshots.get("at-later-resolution");
  if (!saved || !finalSnap || session.failed) {
    saveSlot = "failed";
    return;
  }
  const saveTimeline = {
    baseStateData: session.timeline.baseStateData,
    persistentKnowledge: session.timeline.persistentKnowledge,
    actions: session.timeline.actions.filter((action) => Math.floor(action.tSec) <= saved.tSec),
    checkpoints: [],
    cursorSec: saved.tSec,
    historyEndSec: saved.tSec,
    maxReachedHistoryEndSec: saved.tSec,
    revision: Math.floor(session.timeline.revision ?? 0),
  };
  const stateAtSave = deserializeGameState(JSON.parse(JSON.stringify(saved.data)));
  const written = await writeSaveToSlot(1, { state: stateAtSave, timeline: saveTimeline, setupId: "replay-stress" });
  if (!written?.ok) {
    saveSlot = "failed";
    fail(session, "save-slot", { reason: written?.reason ?? "saveFailed" });
    return;
  }
  const loaded = await inspectSaveSlot(1);
  if (!loaded?.ok || !loaded.nextTimeline) {
    saveSlot = "failed";
    fail(session, "save-slot-load", { reason: loaded?.reason ?? "loadFailed" });
    return;
  }
  const atCursor = rebuildStateAtSecond(loaded.nextTimeline, saved.tSec);
  if (!atCursor?.ok) {
    saveSlot = "failed";
    fail(session, "save-slot-cursor", { reason: atCursor?.reason ?? "rebuildFailed" });
    return;
  }
  if (!match(session, serializeGameState(atCursor.state), saved.data, "save-slot-cursor")) {
    saveSlot = "failed";
    return;
  }
  for (const action of session.timeline.actions) {
    if (Math.floor(action.tSec) <= saved.tSec) continue;
    const appended = appendActionAtCursor(loaded.nextTimeline, action, { tSec: action.tSec });
    if (!appended?.ok) {
      saveSlot = "failed";
      fail(session, "save-slot-continue", { reason: appended?.reason ?? "appendFailed" });
      return;
    }
  }
  const continued = rebuildStateAtSecond(loaded.nextTimeline, finalSnap.tSec);
  if (!continued?.ok || !match(session, serializeGameState(continued.state), finalSnap.data, "save-slot-continue")) {
    saveSlot = "failed";
    if (!continued?.ok) fail(session, "save-slot-continue", { reason: continued?.reason ?? "rebuildFailed" });
    return;
  }
  saveSlot = "ok";
}

async function playSeed(seed, horizonSec, captureSave) {
  const session = openSession(seed, horizonSec);
  try {
    assertNewGame(session);
    snap(session, "start");
    const founding = foundVassal(session);
    if (founding && !session.failed) laterDecision(session);
    if (!session.failed && !session.terminal) tickTo(session, Math.max(horizonSec, Math.floor(session.state.tSec ?? 0)));
    snap(session, "horizon");
    if (Math.floor(session.state.tSec ?? 0) > horizonSec) totals.extended += 1;
    jsonContinue(session, "at-actions", "at-founding-resolution");
    jsonContinue(session, "at-founding-resolution", "horizon");
    scrub(session, "before-actions", "horizon");
    if (captureSave) await saveAndContinue(session);
  } catch (error) {
    fail(session, "threw", { reason: error?.message ?? String(error) });
  }
  writeJson(`logs/${runId}/seed-${seed}.json`, {
    seed, horizonSec, reached: Math.floor(session.state.tSec ?? 0),
    terminal: session.terminal, failed: session.failed,
    actions: session.script.filter((record) => record.type === "action"),
    checkpoints: session.checkpoints,
  });
  return session;
}

function mapText(map) {
  return [...map.entries()].map(([key, count]) => `${key}:${count}`).join(",") || "none";
}

const started = performance.now();
const { seeds, horizonSec, onlySeed } = parseArgs(process.argv);
runId = onlySeed != null ? `seed-${onlySeed}-horizon-${horizonSec}` : `seeds-${seeds.length}-horizon-${horizonSec}`;
const storage = createSaveTestStorage();
try {
  for (const [index, seed] of seeds.entries()) {
    await playSeed(seed, horizonSec, index === 0);
  }
} finally {
  storage.restore();
}
const elapsedMs = Math.round(performance.now() - started);
const status = failures.length === 0 && comparatorOk && saveSlot === "ok" ? "pass" : "fail";
const summary = {
  status, seeds, horizonSec, elapsedMs, comparatorOk, saveSlot,
  comparisons: totals.comparisons, json: totals.json, scrubs: totals.scrubs,
  actions: totals.actions, extended: totals.extended, terminals: totals.terminals,
  kinds: Object.fromEntries(kinds), families: Object.fromEntries(families),
  failures,
};
writeJson(`summary-${onlySeed != null ? `seed-${onlySeed}` : `seeds-${seeds.length}`}-horizon-${horizonSec}.json`, summary);
console.log(
  `replay-stress ${status} seeds=${seeds.length} horizon=${horizonSec} comparisons=${totals.comparisons} `
  + `json=${totals.json} scrubs=${totals.scrubs} actions=${totals.actions} kinds=${mapText(kinds)} `
  + `families=${mapText(families)} extended=${totals.extended} terminals=${totals.terminals} `
  + `saveSlot=${saveSlot} comparator=${comparatorOk} failures=${failures.length} ms=${elapsedMs}`,
);
if (status !== "pass") process.exitCode = 1;
