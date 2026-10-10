// Completed second-6 overrun stays frozen for projection-chunk, timeline
// state-data query, and projection state-restorer. Fixture matches
// scripts/replay-terminal-save-test.mjs (seeds 123 and 124, monsterPressure 4,
// neutral defense 100 / ageMoons 2). Edits happen before the timeline and
// before ticks. The complete flag comes from advanceReplayStateToSecond.
// Projection reports a terminal tail (ok, endSec 6). Query past the anchor
// returns advanceFailed. Restorer continuation returns null. Those contracts
// stay distinct. Failures: artifacts/terminal-snapshot-consumers/
// node scripts/terminal-snapshot-consumers-test.mjs
import fs from "node:fs";
import path from "node:path";
import { createNewGameState } from "../src/model/new-game.js";
import { buildProjectionChunkFromStateData, createProjectionChunkSession } from "../src/model/projection-chunk.js";
import { advanceReplayStateToSecond, initializeReplayClock } from "../src/model/replay-second-runner.js";
import { deserializeGameState, serializeGameState } from "../src/model/state.js";
import { createProjectionStateRestorer } from "../src/model/timegraph/state-restorer.js";
import {
  createTimelineFromInitialState,
  getStateDataAtSecond,
  rebuildStateAtSecond,
  seedCheckpointStateDataAtSecond,
} from "../src/model/timeline/index.js";

const ARTIFACT_DIR = path.resolve("artifacts/terminal-snapshot-consumers");
const REPRO = "node scripts/terminal-snapshot-consumers-test.mjs";
const SEEDS = [123, 124];
const TERMINAL_SEC = 6;
const STATUS = { complete: true, reason: "redGodMonsterOverrun", year: 1, tSec: TERMINAL_SEC };
const RNG_FIELDS = ["seed", "baseSeed", "vassalSeed", "vassalDevelopmentSeed", "vassalLifeMapSeed", "vassalPortraitSeed"];
let comparisons = 0;
let runs = 0;
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

function record(seed, label, extra = {}) {
  const failure = { seed, label, repro: REPRO, ...extra };
  failures.push(failure);
  const file = `failures/seed-${seed}-${String(label).replace(/[^a-z0-9-]+/gi, "-")}.json`;
  fs.mkdirSync(path.join(ARTIFACT_DIR, "failures"), { recursive: true });
  fs.writeFileSync(path.join(ARTIFACT_DIR, file), JSON.stringify(failure, null, 2));
  console.error(
    `FAIL seed=${seed} label=${label} field=${extra.difference?.path ?? extra.reason ?? ""} `
    + `expected=${extra.difference?.expected ?? extra.expected ?? ""} actual=${extra.difference?.actual ?? extra.actual ?? ""} `
    + `repro=${REPRO} artifact=artifacts/terminal-snapshot-consumers/${file}`,
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

function parseFrozen(text) {
  return JSON.parse(text);
}

function sameTerminal(seed, data, label) {
  match(seed, data?.runStatus, STATUS, `${label}-status`);
  expect(Math.floor(data?.tSec) === TERMINAL_SEC && data?.paused === true, seed, `${label}-frozen-sec`, {
    expected: `tSec ${TERMINAL_SEC} paused`, actual: `tSec ${data?.tSec} paused=${data?.paused}`,
  });
  expect(Object.keys(data?.rng ?? {}).sort().join() === [...RNG_FIELDS].sort().join(), seed, `${label}-rng-fields`, {
    expected: [...RNG_FIELDS].sort().join(), actual: Object.keys(data?.rng ?? {}).sort().join(),
  });
  const players = (data.world?.regions ?? []).filter((region) => region.controller === "player").length;
  expect(players === 0, seed, `${label}-players`, { expected: 0, actual: players });
}

function matchFrozen(seed, data, frozen, label) {
  match(seed, data, frozen, label);
  match(seed, rngView(data), rngView(frozen), `${label}-rng`);
  sameTerminal(seed, data, label);
}

function authorTerminal(seed) {
  const state = createNewGameState(seed);
  state.civilization.chaos.monsterPressure = 4;
  for (const region of state.world.regions) {
    if (region.controller !== "player") region.monster = { defense: 100, ageMoons: 2 };
  }
  initializeReplayClock(state, 0);
  const timeline = createTimelineFromInitialState(state);
  const beforeTick = advanceReplayStateToSecond(state, TERMINAL_SEC - 1);
  expect(beforeTick?.ok === true && state.runStatus?.complete !== true, seed, "before-terminal", {
    actual: JSON.stringify({ ok: beforeTick?.ok ?? null, tSec: state.tSec, runStatus: state.runStatus ?? null }),
  });
  const beforeText = JSON.stringify(serializeGameState(state));
  const landed = advanceReplayStateToSecond(state, 12);
  expect(landed?.ok === false && landed.reason === "advanceFailed" && landed.currentSec === TERMINAL_SEC && landed.targetSec === 12, seed, "official-tick", {
    expected: "advanceFailed current 6 target 12", actual: JSON.stringify(landed),
  });
  expect(Math.floor(state.tSec) === TERMINAL_SEC, seed, "landed-sec", { expected: TERMINAL_SEC, actual: state.tSec });
  const frozen = serializeGameState(state);
  match(seed, frozen.runStatus, STATUS, "authored-status");
  return { timeline, beforeText, frozenText: JSON.stringify(frozen), frozen };
}

function projectionConsumers(seed, beforeText, frozenText, frozen) {
  const completedInput = parseFrozen(frozenText);
  const fromCompleted = buildProjectionChunkFromStateData(completedInput, TERMINAL_SEC, 3000);
  expect(fromCompleted?.ok === true && fromCompleted.terminal === true && fromCompleted.endSec === TERMINAL_SEC, seed, "completed-base-projection", {
    expected: "ok terminal endSec 6",
    actual: `ok=${fromCompleted?.ok} terminal=${fromCompleted?.terminal} end=${fromCompleted?.endSec} reason=${fromCompleted?.reason ?? ""}`,
  });
  const startSummary = fromCompleted.summaryBySecond.get(TERMINAL_SEC);
  expect(startSummary?.runComplete === true && startSummary.runLossSec === TERMINAL_SEC && startSummary.runLossYear === 1 && startSummary.tSec === TERMINAL_SEC, seed, "completed-base-summary", {
    actual: JSON.stringify(startSummary ? { tSec: startSummary.tSec, runComplete: startSummary.runComplete, runLossSec: startSummary.runLossSec, runLossYear: startSummary.runLossYear } : null),
  });
  expect(fromCompleted.stateDataBySecond.size === 0, seed, "completed-base-no-later-anchor", { actual: fromCompleted.stateDataBySecond.size });
  match(seed, completedInput, frozen, "completed-base-input");

  const sessionInput = parseFrozen(frozenText);
  const session = createProjectionChunkSession(sessionInput, TERMINAL_SEC, 30);
  expect(session?.ok === true && typeof session.next === "function", seed, "session-open", { reason: session?.reason ?? "no session" });
  const firstSlice = session.next(30);
  const secondSlice = session.next(30);
  expect(firstSlice?.ok === true && firstSlice.terminal === true && firstSlice.endSec === TERMINAL_SEC, seed, "session-first", {
    actual: `ok=${firstSlice?.ok} terminal=${firstSlice?.terminal} end=${firstSlice?.endSec}`,
  });
  expect(secondSlice?.ok === true && secondSlice.terminal === true && secondSlice.endSec === TERMINAL_SEC, seed, "session-warm", {
    actual: `ok=${secondSlice?.ok} terminal=${secondSlice?.terminal} end=${secondSlice?.endSec}`,
  });
  match(seed, sessionInput, frozen, "session-input");

  const continuationInput = parseFrozen(beforeText);
  const continued = buildProjectionChunkFromStateData(continuationInput, TERMINAL_SEC - 1, 40);
  expect(continued?.ok === true && continued.terminal === true && continued.endSec === TERMINAL_SEC, seed, "projection-continuation", {
    expected: "terminal endSec 6 from sec 5",
    actual: `ok=${continued?.ok} terminal=${continued?.terminal} end=${continued?.endSec} reason=${continued?.reason ?? ""}`,
  });
  const anchor = continued.stateDataBySecond.get(TERMINAL_SEC);
  expect(anchor != null, seed, "projection-anchor", { reason: "missing terminal anchor" });
  matchFrozen(seed, anchor, frozen, "projection-anchor");
  expect(JSON.stringify(continuationInput) === beforeText, seed, "projection-continuation-input", { reason: "sec5 input changed" });
}

function timelineConsumers(seed, timeline, frozen) {
  const cold = getStateDataAtSecond(timeline, TERMINAL_SEC);
  expect(cold?.ok === true && cold.source === "rebuild", seed, "query-cold", {
    actual: `ok=${cold?.ok} source=${cold?.source ?? ""} reason=${cold?.reason ?? ""}`,
  });
  matchFrozen(seed, cold.stateData, frozen, "query-exact");
  const warm = getStateDataAtSecond(timeline, TERMINAL_SEC);
  expect(warm?.ok === true && warm.source === "memo", seed, "query-warm", { actual: warm?.source ?? warm?.reason ?? "missing" });
  matchFrozen(seed, warm.stateData, frozen, "query-warm");
  const rebuilt = rebuildStateAtSecond(timeline, TERMINAL_SEC);
  expect(rebuilt?.ok === true && rebuilt.memoHit === true, seed, "rebuild-warm", { actual: `ok=${rebuilt?.ok} memo=${rebuilt?.memoHit}` });
  matchFrozen(seed, serializeGameState(rebuilt.state), frozen, "rebuild-warm");

  const beyond = getStateDataAtSecond(timeline, TERMINAL_SEC + 6);
  expect(beyond?.ok === false && beyond.reason === "advanceFailed" && beyond.detail?.currentSec === TERMINAL_SEC, seed, "query-beyond", {
    expected: "advanceFailed currentSec 6",
    actual: JSON.stringify({ ok: beyond?.ok ?? null, reason: beyond?.reason ?? null, detail: beyond?.detail ?? null }),
  });
  const still = getStateDataAtSecond(timeline, TERMINAL_SEC);
  matchFrozen(seed, still.stateData, frozen, "query-after-beyond");

  const seeded = seedCheckpointStateDataAtSecond(timeline, TERMINAL_SEC, parseFrozen(JSON.stringify(frozen)), { prune: false });
  expect(seeded?.ok === true, seed, "seed-anchor", { reason: seeded?.reason ?? "seedFailed" });
  const exact = getStateDataAtSecond(timeline, TERMINAL_SEC);
  expect(exact?.ok === true && exact.source === "checkpoint", seed, "query-anchor", { actual: exact?.source ?? exact?.reason ?? "missing" });
  matchFrozen(seed, exact.stateData, frozen, "query-anchor");
  const anchorBeyond = rebuildStateAtSecond(timeline, TERMINAL_SEC + 1);
  expect(anchorBeyond?.ok === false && anchorBeyond.reason === "advanceFailed" && anchorBeyond.detail?.currentSec === TERMINAL_SEC, seed, "anchor-continuation", {
    expected: "advanceFailed currentSec 6",
    actual: JSON.stringify({ ok: anchorBeyond?.ok ?? null, reason: anchorBeyond?.reason ?? null, current: anchorBeyond?.detail?.currentSec ?? null }),
  });
  const anchorAgain = getStateDataAtSecond(timeline, TERMINAL_SEC);
  expect(anchorAgain.source === "checkpoint", seed, "anchor-still", { actual: anchorAgain.source });
  matchFrozen(seed, anchorAgain.stateData, frozen, "anchor-still");
  expect(Math.floor(timeline.baseStateData?.tSec ?? -1) === 0 && timeline.baseStateData?.runStatus?.complete !== true, seed, "base-stays-opening", {
    actual: `tSec=${timeline.baseStateData?.tSec} complete=${timeline.baseStateData?.runStatus?.complete ?? false}`,
  });
}

function restorerAndClock(seed, frozenText, frozen) {
  const input = parseFrozen(frozenText);
  const inputText = JSON.stringify(input);
  const restorer = createProjectionStateRestorer();
  expect(restorer.getSize() === 0, seed, "restorer-cold-size", { actual: restorer.getSize() });
  const first = restorer.restore(input, TERMINAL_SEC, TERMINAL_SEC);
  const second = restorer.restore(input, TERMINAL_SEC, TERMINAL_SEC);
  expect(first != null && second != null && first !== second, seed, "restorer-outputs", { reason: "missing or shared mutable body" });
  expect(restorer.getSize() === 1, seed, "restorer-warm-size", { actual: restorer.getSize() });
  expect(first.gameConfig === second.gameConfig && Object.isFrozen(first.gameConfig), seed, "shared-config", {
    reason: "exact restores did not share one frozen config",
  });
  matchFrozen(seed, serializeGameState(first), frozen, "restorer-exact");
  matchFrozen(seed, serializeGameState(second), frozen, "restorer-warm");
  first.rng.seed = "consumer-local";
  first.tSec = 99;
  matchFrozen(seed, serializeGameState(second), frozen, "restorer-isolated");
  expect(JSON.stringify(input) === inputText, seed, "restorer-input", { reason: "anchor input changed" });
  const past = restorer.restore(input, TERMINAL_SEC, 12);
  expect(past == null, seed, "restorer-beyond", { actual: past == null ? "null" : `tSec ${past.tSec}` });
  expect(JSON.stringify(input) === inputText, seed, "restorer-beyond-input", { reason: "beyond restore wrote the input" });

  const clock = deserializeGameState(parseFrozen(frozenText));
  initializeReplayClock(clock, TERMINAL_SEC);
  expect(clock.paused === true && Math.floor(clock.tSec) === TERMINAL_SEC && clock.runStatus?.complete === true, seed, "clock-keeps-pause", {
    actual: `paused=${clock.paused} tSec=${clock.tSec} complete=${clock.runStatus?.complete}`,
  });
  matchFrozen(seed, serializeGameState(clock), frozen, "clock-exact");
  const held = advanceReplayStateToSecond(clock, 12);
  expect(held?.ok === false && held.reason === "advanceFailed" && held.currentSec === TERMINAL_SEC, seed, "clock-held", {
    actual: JSON.stringify(held),
  });
  matchFrozen(seed, serializeGameState(clock), frozen, "clock-held");

  const clone = deserializeGameState(parseFrozen(frozenText));
  matchFrozen(seed, serializeGameState(clone), frozen, "json-clone");
  clone.paused = false;
  match(seed, parseFrozen(frozenText), frozen, "json-clone-source");
}

try {
  for (const seed of SEEDS) {
    try {
      const authored = authorTerminal(seed);
      projectionConsumers(seed, authored.beforeText, authored.frozenText, authored.frozen);
      timelineConsumers(seed, authored.timeline, authored.frozen);
      restorerAndClock(seed, authored.frozenText, authored.frozen);
      runs += 1;
    } catch (error) {
      if (!error?.recorded) record(seed, "threw", { reason: error?.message ?? String(error) });
    }
  }
} finally {
  console.log(`terminal-snapshot-consumers runs=${runs}/${SEEDS.length} comparisons=${comparisons} failures=${failures.length}`);
  if (failures.length > 0) process.exitCode = 1;
}
