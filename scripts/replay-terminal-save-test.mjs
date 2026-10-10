// Direct live play versus authoritative rebuild, JSON fork, and save-slot reload.
// Death fixture: new-game seeds 1, 2, 8 with every opening candidate age set to 90
// before the timeline exists (bounded search 1..8; 3..7 survive). Founding
// train-estate then resolves at second 6. Terminal fixture: detailed-replay
// terminalProjectionBase monsters (defense 100, ageMoons 2) plus monsterPressure 4,
// the documented first-Death overrun (seeds 123, 124, 125, second 6, year 1).
// Afterwards only public actions and official ticks. Advance past terminal is not
// atomic and is not ok. Stdout is one aggregate line.
// Failures: artifacts/replay-terminal-save/
// node scripts/replay-terminal-save-test.mjs
import fs from "node:fs";
import path from "node:path";
import { ActionKinds, applyAction } from "../src/model/actions.js";
import { setPaused } from "../src/model/game-model.js";
import { createNewGameState } from "../src/model/new-game.js";
import { buildProjectionChunkFromStateData } from "../src/model/projection-chunk.js";
import { advanceReplayStateToSecond, initializeReplayClock } from "../src/model/replay-second-runner.js";
import { deserializeGameState, serializeGameState, syncPhaseToPaused } from "../src/model/state.js";
import { appendActionAtCursor, createTimelineFromInitialState, rebuildStateAtSecond } from "../src/model/timeline/index.js";
import { getCurrentLifeMapVassal, getVassalCandidatePool } from "../src/model/vassal-life-map.js";
import { inspectSaveSlot, writeSaveToSlot } from "../src/controllers/sim-runner/save-slots.js";
import { createSaveTestStorage } from "./save-test-storage.mjs";

const ARTIFACT_DIR = path.resolve("artifacts/replay-terminal-save");
const REPRO = "node scripts/replay-terminal-save-test.mjs";
const DEATH_SEEDS = [1, 2, 8];
const TERMINAL_SEEDS = [123, 124, 125];
const DEATH_SEC = 6;
const RNG_FIELDS = ["seed", "baseSeed", "vassalSeed", "vassalDevelopmentSeed", "vassalLifeMapSeed", "vassalPortraitSeed"];
const TERMINAL_STATUS = { complete: true, reason: "redGodMonsterOverrun", year: 1, tSec: DEATH_SEC };
let comparisons = 0;
let deathRuns = 0;
let terminalRuns = 0;
const failures = [];

function preview(value) {
  const text = typeof value === "string" ? JSON.stringify(value.slice(0, 48)) : JSON.stringify(value);
  return typeof text === "string" && text.length > 90 ? `${text.slice(0, 87)}...` : String(text ?? value);
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

function writeJson(name, value) {
  const file = path.join(ARTIFACT_DIR, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function record(seed, label, extra = {}) {
  const failure = { seed, label, repro: REPRO, ...extra };
  failures.push(failure);
  const file = `failures/seed-${seed}-${String(label).replace(/[^a-z0-9-]+/gi, "-")}.json`;
  writeJson(file, failure);
  console.error(
    `FAIL seed=${seed} label=${label} field=${extra.difference?.path ?? extra.reason ?? ""} `
    + `expected=${extra.difference?.expected ?? extra.expected ?? ""} actual=${extra.difference?.actual ?? extra.actual ?? ""} `
    + `repro=${REPRO} artifact=artifacts/replay-terminal-save/${file}`,
  );
}

function fail(seed, label, extra = {}) {
  record(seed, label, extra);
  const error = new Error(label);
  error.recorded = true;
  throw error;
}

function expect(ok, seed, label, extra = {}) {
  if (!ok) fail(seed, label, extra);
}

function match(seed, actual, expected, label) {
  comparisons += 1;
  const difference = firstDifference(actual, expected);
  if (difference) fail(seed, label, { difference });
}

function rngView(data) {
  return Object.fromEntries(RNG_FIELDS.map((field) => [field, data?.rng?.[field]]));
}

function applyLive(state, kind, payload) {
  setPaused(state, true);
  syncPhaseToPaused(state);
  const result = applyAction(state, { kind, payload });
  setPaused(state, false);
  syncPhaseToPaused(state);
  return result;
}

function commit(state, timeline, kind, payload) {
  const result = applyLive(state, kind, payload);
  expect(result?.ok === true, state.rng.baseSeed, kind, { reason: result?.reason ?? "actionFailed" });
  const recorded = appendActionAtCursor(timeline, { kind, payload, tSec: Math.floor(state.tSec ?? 0) }, state);
  expect(recorded?.ok === true, state.rng.baseSeed, `${kind}-record`, { reason: recorded?.reason ?? "appendFailed" });
  return result;
}

function tick(seed, state, sec) {
  const result = advanceReplayStateToSecond(state, sec);
  expect(result?.ok === true, seed, `tick-${sec}`, { reason: result?.reason ?? "advanceFailed", actual: state.tSec });
  expect(Math.floor(state.tSec) === sec, seed, `tick-${sec}-landed`, { expected: sec, actual: state.tSec });
  return result;
}

function sameFullState(seed, timeline, tSec, data, label) {
  const rebuilt = rebuildStateAtSecond(timeline, tSec);
  const again = rebuildStateAtSecond(timeline, tSec);
  expect(rebuilt?.ok === true && again?.ok === true, seed, `${label}-rebuild`, {
    reason: rebuilt?.reason ?? again?.reason ?? "rebuildFailed",
  });
  const rebuiltData = serializeGameState(rebuilt.state);
  match(seed, rebuiltData, data, label);
  match(seed, serializeGameState(again.state), data, `${label}-repeat`);
  match(seed, rngView(rebuiltData), rngView(data), `${label}-rng`);
  expect(Object.keys(data.rng).sort().join() === [...RNG_FIELDS].sort().join(), seed, `${label}-rng-fields`, {
    expected: [...RNG_FIELDS].sort().join(), actual: Object.keys(data.rng).sort().join(),
  });
}

function jsonFork(seed, data, sec) {
  const copy = deserializeGameState(JSON.parse(JSON.stringify(data)));
  match(seed, serializeGameState(copy), data, `json-roundtrip-${sec}`);
  return { copy, result: advanceReplayStateToSecond(copy, sec) };
}

async function saveSlot(seed, timeline, tSec, data, label) {
  const saveTimeline = {
    baseStateData: timeline.baseStateData,
    persistentKnowledge: timeline.persistentKnowledge,
    actions: timeline.actions.filter((action) => Math.floor(action.tSec) <= tSec),
    checkpoints: [],
    cursorSec: tSec,
    historyEndSec: tSec,
    maxReachedHistoryEndSec: tSec,
    revision: Math.floor(timeline.revision ?? 0),
  };
  const written = await writeSaveToSlot(1, {
    state: deserializeGameState(JSON.parse(JSON.stringify(data))),
    timeline: saveTimeline,
    setupId: "replay-terminal-save",
  });
  expect(written?.ok === true, seed, `${label}-write`, { reason: written?.reason ?? "saveFailed" });
  const loaded = await inspectSaveSlot(1);
  expect(loaded?.ok === true && loaded.nextTimeline, seed, `${label}-load`, { reason: loaded?.reason ?? "loadFailed" });
  match(seed, serializeGameState(loaded.state), data, `${label}-slot`);
  match(seed, rngView(serializeGameState(loaded.state)), rngView(data), `${label}-slot-rng`);
  return loaded.nextTimeline;
}

function openDeath(seed) {
  const state = createNewGameState(seed);
  for (const candidate of state.civilization.vassalLineage.pendingCandidates) candidate.age = 90;
  initializeReplayClock(state, 0);
  return { state, timeline: createTimelineFromInitialState(state) };
}

function assertDeath(seed, state, nodeId, vassal) {
  const node = vassal.lifeMap.nodeStates[nodeId];
  const pool = getVassalCandidatePool(state);
  expect(getCurrentLifeMapVassal(state) == null, seed, "death-current", { reason: "currentVassalStillSet" });
  expect(vassal.isDead === true && vassal.endedReason === "died" && vassal.deathCause === "naturalMortality", seed, "death-reason", {
    expected: "died/naturalMortality", actual: `${vassal.endedReason}/${vassal.deathCause}`,
  });
  expect(vassal.deathSec === DEATH_SEC && vassal.endSec === DEATH_SEC, seed, "death-sec", {
    expected: DEATH_SEC, actual: vassal.deathSec,
  });
  expect(vassal.lifeMap.pendingResolution == null && vassal.developmentChoiceQueue.length === 0, seed, "death-no-queue", {
    reason: "pendingOrLevelChoiceRemained",
  });
  expect(node.resolved === true && node.resolutionResult === "naturalDeath" && node.mandatePreventedDeath !== true, seed, "death-result", {
    expected: "naturalDeath", actual: node.resolutionResult,
  });
  expect(node.mortality?.age === 90 && node.mortality.chance === 0.35 && node.mortality.roll < 0.35, seed, "death-mortality", {
    expected: "age 90 chance 0.35 roll < 0.35",
    actual: JSON.stringify(node.mortality),
  });
  expect(pool.candidates.length === 3 && pool.rerollIndex === 0 && pool.createdSec === DEATH_SEC
    && pool.poolId === "life-vassal-2-reroll-0", seed, "successor-pool", {
    expected: "3 candidates life-vassal-2-reroll-0 at 6",
    actual: `${pool.candidates.length} ${pool.poolId} created ${pool.createdSec}`,
  });
  return pool.expectedPoolHash;
}

async function playDeath(seed) {
  const { state, timeline } = openDeath(seed);
  const pool = getVassalCandidatePool(state);
  commit(state, timeline, ActionKinds.SETTLEMENT_SELECT_VASSAL, {
    candidateIndex: 0, expectedPoolHash: pool.expectedPoolHash,
  });
  const vassal = getCurrentLifeMapVassal(state);
  const nodeId = vassal?.lifeMap?.graph?.foundingNodeId ?? null;
  expect(Boolean(nodeId), seed, "founding-node", { reason: "noFoundingNode" });
  commit(state, timeline, ActionKinds.VASSAL_ENTER_LIFE_NODE, { nodeId });
  commit(state, timeline, ActionKinds.VASSAL_SELECT_LIFE_OPTION, { nodeId, optionId: "train-estate" });
  commit(state, timeline, ActionKinds.VASSAL_CONFIRM_LIFE_NODE, { nodeId });
  const pending = vassal.lifeMap.pendingResolution;
  expect(pending?.resolveSec === DEATH_SEC && pending.phaseCost === 6, seed, "pending-boundary", {
    expected: "resolve 6 phase 6", actual: JSON.stringify(pending),
  });
  tick(seed, state, DEATH_SEC - 1);
  expect(getCurrentLifeMapVassal(state) === vassal && vassal.endedReason == null
    && vassal.lifeMap.pendingResolution?.resolveSec === DEATH_SEC
    && vassal.lifeMap.nodeStates[nodeId].mortality == null, seed, "before-death", {
    reason: "resolution boundary already consumed",
  });
  const before = serializeGameState(state);
  sameFullState(seed, timeline, DEATH_SEC - 1, before, "death-before");
  tick(seed, state, DEATH_SEC);
  const successorHash = assertDeath(seed, state, nodeId, vassal);
  const at = serializeGameState(state);
  sameFullState(seed, timeline, DEATH_SEC, at, "death-at");
  tick(seed, state, DEATH_SEC + 1);
  expect(getCurrentLifeMapVassal(state) == null && getVassalCandidatePool(state).expectedPoolHash === successorHash, seed, "after-death-pool", {
    reason: "successor pool changed after the death second",
  });
  const after = serializeGameState(state);
  sameFullState(seed, timeline, DEATH_SEC + 1, after, "death-after");
  const fork = jsonFork(seed, before, DEATH_SEC + 1);
  expect(fork.result?.ok === true, seed, "death-json-advance", { reason: fork.result?.reason ?? "advanceFailed" });
  match(seed, serializeGameState(fork.copy), after, "death-json-continue");
  const savedBefore = await saveSlot(seed, timeline, DEATH_SEC - 1, before, "death-save-before");
  const continuedBefore = rebuildStateAtSecond(savedBefore, DEATH_SEC + 1);
  expect(continuedBefore?.ok === true, seed, "death-save-before-continue", { reason: continuedBefore?.reason ?? "rebuildFailed" });
  match(seed, serializeGameState(continuedBefore.state), after, "death-save-before-continue");
  const savedAt = await saveSlot(seed, timeline, DEATH_SEC, at, "death-save-at");
  const continuedAt = rebuildStateAtSecond(savedAt, DEATH_SEC + 1);
  expect(continuedAt?.ok === true, seed, "death-save-at-continue", { reason: continuedAt?.reason ?? "rebuildFailed" });
  match(seed, serializeGameState(continuedAt.state), after, "death-save-at-continue");
  deathRuns += 1;
}

function openTerminal(seed) {
  const state = createNewGameState(seed);
  state.civilization.chaos.monsterPressure = 4;
  for (const region of state.world.regions) {
    if (region.controller !== "player") region.monster = { defense: 100, ageMoons: 2 };
  }
  initializeReplayClock(state, 0);
  return { state, timeline: createTimelineFromInitialState(state) };
}

function assertTerminal(seed, state) {
  const players = state.world.regions.filter((region) => region.controller === "player").length;
  expect(players === 0 && state.paused === true, seed, "terminal-world", {
    expected: "0 player regions, paused", actual: `players=${players} paused=${state.paused}`,
  });
  match(seed, state.runStatus, TERMINAL_STATUS, "terminal-status");
}

async function playTerminal(seed) {
  const { state, timeline } = openTerminal(seed);
  const projection = buildProjectionChunkFromStateData(timeline.baseStateData, 0, 3000);
  expect(projection?.ok === true && projection.terminal === true && projection.endSec === DEATH_SEC, seed, "terminal-projection", {
    expected: "terminal endSec 6", actual: `ok=${projection?.ok} terminal=${projection?.terminal} end=${projection?.endSec}`,
  });
  tick(seed, state, DEATH_SEC - 1);
  expect(state.runStatus?.complete !== true, seed, "before-terminal", { actual: JSON.stringify(state.runStatus ?? null) });
  const before = serializeGameState(state);
  sameFullState(seed, timeline, DEATH_SEC - 1, before, "terminal-before");
  const past = advanceReplayStateToSecond(state, 12);
  expect(past?.ok === false && past.reason === "advanceFailed" && past.currentSec === DEATH_SEC && past.targetSec === 12, seed, "terminal-advance", {
    expected: "ok false advanceFailed current 6 target 12",
    actual: JSON.stringify(past),
  });
  expect(Math.floor(state.tSec) === DEATH_SEC, seed, "terminal-not-atomic", {
    expected: DEATH_SEC, actual: state.tSec,
  });
  assertTerminal(seed, state);
  const at = serializeGameState(state);
  sameFullState(seed, timeline, DEATH_SEC, at, "terminal-at");
  const beyond = rebuildStateAtSecond(timeline, DEATH_SEC + 1);
  expect(beyond?.ok === false && beyond.reason === "advanceFailed" && beyond.detail?.currentSec === DEATH_SEC, seed, "terminal-rebuild-clamp", {
    expected: "advanceFailed currentSec 6",
    actual: JSON.stringify({
      ok: beyond?.ok ?? null, reason: beyond?.reason ?? null, detail: beyond?.detail ?? null,
      tSec: beyond?.state?.tSec ?? null, paused: beyond?.state?.paused ?? null,
      runStatus: beyond?.state?.runStatus ?? null,
    }),
  });
  const fork = jsonFork(seed, before, 12);
  expect(fork.result?.ok === false && fork.result.reason === "advanceFailed" && fork.result.currentSec === DEATH_SEC, seed, "terminal-json-advance", {
    actual: JSON.stringify(fork.result),
  });
  match(seed, serializeGameState(fork.copy), at, "terminal-json-continue");
  const savedBefore = await saveSlot(seed, timeline, DEATH_SEC - 1, before, "terminal-save-before");
  const continuedBefore = rebuildStateAtSecond(savedBefore, DEATH_SEC);
  expect(continuedBefore?.ok === true, seed, "terminal-save-before-continue", { reason: continuedBefore?.reason ?? "rebuildFailed" });
  match(seed, serializeGameState(continuedBefore.state), at, "terminal-save-before-continue");
  const savedAt = await saveSlot(seed, timeline, DEATH_SEC, at, "terminal-save-at");
  const savedPast = rebuildStateAtSecond(savedAt, DEATH_SEC + 1);
  expect(savedPast?.ok === false && savedPast.reason === "advanceFailed", seed, "terminal-save-at-clamp", {
    actual: savedPast?.reason ?? "missing",
  });
  const actionCopy = deserializeGameState(JSON.parse(JSON.stringify(at)));
  const rejected = applyAction(actionCopy, {
    kind: ActionKinds.SETTLEMENT_SELECT_VASSAL,
    payload: { candidateIndex: 0, expectedPoolHash: getVassalCandidatePool(actionCopy).expectedPoolHash },
  });
  expect(rejected?.ok === false && rejected.reason === "noPlayerSettlement", seed, "terminal-action", {
    expected: "noPlayerSettlement", actual: rejected?.reason ?? "missing",
  });
  const entered = applyAction(actionCopy, { kind: ActionKinds.VASSAL_ENTER_LIFE_NODE, payload: { nodeId: "absent" } });
  expect(entered?.ok === false && entered.reason === "noCurrentVassal", seed, "terminal-enter", {
    expected: "noCurrentVassal", actual: entered?.reason ?? "missing",
  });
  match(seed, serializeGameState(actionCopy), at, "terminal-action-unchanged");
  const held = deserializeGameState(JSON.parse(JSON.stringify(at)));
  const heldAdvance = advanceReplayStateToSecond(held, 12);
  expect(heldAdvance?.ok === false && heldAdvance.reason === "advanceFailed" && heldAdvance.currentSec === DEATH_SEC, seed, "terminal-held-advance", {
    actual: JSON.stringify(heldAdvance),
  });
  match(seed, serializeGameState(held), at, "terminal-held-unchanged");
  terminalRuns += 1;
}

const storage = createSaveTestStorage();
try {
  for (const seed of DEATH_SEEDS) {
    try { await playDeath(seed); }
    catch (error) {
      if (!error?.recorded) record(seed, "threw", { reason: error?.message ?? String(error), stack: error?.stack });
    }
  }
  for (const seed of TERMINAL_SEEDS) {
    try { await playTerminal(seed); }
    catch (error) {
      if (!error?.recorded) record(seed, "threw", { reason: error?.message ?? String(error), stack: error?.stack });
    }
  }
} finally {
  storage.restore();
}
if (deathRuns !== DEATH_SEEDS.length || terminalRuns !== TERMINAL_SEEDS.length) {
  record(0, "coverage", { expected: "3 death and 3 terminal", actual: `death=${deathRuns} terminal=${terminalRuns}` });
}
if (failures.length) {
  console.error(`[replay-terminal-save] FAILED ${failures.length} repro=${REPRO}`);
  process.exitCode = 1;
} else {
  console.log(`[replay-terminal-save] OK death=${deathRuns} terminal=${terminalRuns} comparisons=${comparisons}`);
}
