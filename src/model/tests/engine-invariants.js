// Rule-independent engine properties. Outcomes, costs, and content may change.
// These checks only require replay equality, JSON saves, seeded randomness,
// model isolation from UI, and that time keeps moving until a run completes.

import assert from "node:assert/strict";
import { ActionKinds, applyAction } from "../actions.js";
import { createNewGameState } from "../new-game.js";
import {
  advanceReplayStateOneSecond,
  advanceReplayStateToSecond,
} from "../replay-second-runner.js";
import { deserializeGameState, serializeGameState } from "../state.js";
import {
  appendActionAtCursor,
  createTimelineFromInitialState,
  rebuildStateAtSecond,
} from "../timeline/index.js";
import { getVassalCandidatePool } from "../vassal-life-map.js";
import {
  SAVE_SCHEMA_VERSION,
  inspectSaveSlot,
  writeSaveToSlot,
} from "../../controllers/sim-runner/save-slots.js";

const SEEDS = [1, 42];
const MAX_HORIZON_SEC = 36;
const RUNTIME_METHODS = new Set([
  "rngNextFloat",
  "rngNextInt",
  "rngNextVassalFloat",
  "rngNextVassalInt",
  "rngNextVassalDevelopmentFloat",
  "rngNextVassalDevelopmentInt",
  "rngNextVassalLifeMapFloat",
  "rngNextVassalLifeMapInt",
  "rngNextVassalPortraitFloat",
  "rngNextVassalPortraitInt",
]);
const UI_GLOBALS = ["document", "localStorage", "sessionStorage", "PIXI", "window"];

function calendarHorizonSec(state) {
  const seasonCount = Array.isArray(state?.seasons) && state.seasons.length > 0
    ? state.seasons.length
    : 1;
  const seasonDurationSec = Number.isFinite(state?.seasonDurationSec) && state.seasonDurationSec > 0
    ? state.seasonDurationSec
    : 1;
  return Math.max(1, Math.min(MAX_HORIZON_SEC, Math.ceil(seasonCount * seasonDurationSec) + 2));
}

function preview(value) {
  if (typeof value === "string") return JSON.stringify(value.slice(0, 40));
  const text = JSON.stringify(value);
  if (typeof text !== "string") return String(value);
  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

function firstDifference(actual, expected, path = "$") {
  if (Object.is(actual, expected)) return null;
  if (actual == null || expected == null || typeof actual !== "object" || typeof expected !== "object") {
    return `${path} ${preview(actual)} vs ${preview(expected)}`;
  }
  if (Array.isArray(actual) || Array.isArray(expected)) {
    if (!Array.isArray(actual) || !Array.isArray(expected)) return `${path} array mismatch`;
    if (actual.length !== expected.length) {
      return `${path} length ${actual.length} vs ${expected.length}`;
    }
    for (let index = 0; index < actual.length; index += 1) {
      const difference = firstDifference(actual[index], expected[index], `${path}[${index}]`);
      if (difference) return difference;
    }
    return null;
  }
  const keys = new Set([...Object.keys(actual), ...Object.keys(expected)]);
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(actual, key)) return `${path}.${key} missing on actual`;
    if (!Object.prototype.hasOwnProperty.call(expected, key)) return `${path}.${key} missing on expected`;
    const difference = firstDifference(actual[key], expected[key], `${path}.${key}`);
    if (difference) return difference;
  }
  return null;
}

function assertSnapshotEqual(actual, expected, label) {
  const difference = firstDifference(actual, expected);
  assert.equal(difference, null, `${label}: ${difference}`);
}

function assertJsonValue(value, path, stack) {
  if (value == null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    assert.equal(Number.isFinite(value), true, `${path} is not a finite number`);
    return;
  }
  if (typeof value !== "object") {
    assert.fail(`${path} is ${typeof value}`);
  }
  if (value instanceof Map || value instanceof Set || value instanceof Date) {
    assert.fail(`${path} is ${value.constructor.name}`);
  }
  if (stack.has(value)) assert.fail(`${path} cycles back to an ancestor`);
  stack.add(value);
  try {
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        assert.equal(
          Object.prototype.hasOwnProperty.call(value, index),
          true,
          `${path}[${index}] is an empty hole`,
        );
        assertJsonValue(value[index], `${path}[${index}]`, stack);
      }
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      if (RUNTIME_METHODS.has(key) && typeof child === "function") continue;
      assertJsonValue(child, `${path}.${key}`, stack);
    }
  } finally {
    stack.delete(value);
  }
}

function installIsolationGuards() {
  const hits = [];
  const previousRandom = Math.random;
  const previousCrypto = globalThis.crypto;
  const previousGlobals = new Map(UI_GLOBALS.map((name) => [
    name,
    Object.getOwnPropertyDescriptor(globalThis, name),
  ]));
  Math.random = () => {
    hits.push("Math.random");
    throw new Error("Math.random");
  };
  Object.defineProperty(globalThis, "crypto", {
    configurable: true,
    writable: true,
    value: {
      getRandomValues() {
        hits.push("crypto.getRandomValues");
        throw new Error("crypto.getRandomValues");
      },
      randomUUID() {
        hits.push("crypto.randomUUID");
        throw new Error("crypto.randomUUID");
      },
    },
  });
  for (const name of UI_GLOBALS) {
    let stored = previousGlobals.get(name)?.value;
    Object.defineProperty(globalThis, name, {
      configurable: true,
      enumerable: false,
      get() {
        hits.push(name);
        return stored;
      },
      set(next) {
        stored = next;
      },
    });
  }
  return {
    hits,
    restore() {
      Math.random = previousRandom;
      if (previousCrypto === undefined) delete globalThis.crypto;
      else {
        Object.defineProperty(globalThis, "crypto", {
          configurable: true,
          writable: true,
          value: previousCrypto,
        });
      }
      for (const [name, descriptor] of previousGlobals) {
        if (descriptor) Object.defineProperty(globalThis, name, descriptor);
        else delete globalThis[name];
      }
    },
  };
}

function play(seed, horizonSec, { audit = false, sampleMidpoint = false } = {}) {
  const state = createNewGameState(seed);
  let sec = Math.max(0, Math.floor(state.tSec ?? 0));
  const startedAt = sec;
  const midpoint = startedAt + Math.floor((horizonSec - startedAt) / 2);
  let midpointData = null;
  while (sec < horizonSec) {
    let step;
    try {
      step = advanceReplayStateOneSecond(state);
    } catch (error) {
      assert.fail(`seed ${seed} crashed at tSec ${sec}: ${error?.message ?? error}`);
    }
    if (!step?.ok) {
      assert.equal(
        state.runStatus?.complete,
        true,
        `seed ${seed} stopped at tSec ${sec} without completing the run`,
      );
      assert.equal(state.paused, true, `seed ${seed} stopped at tSec ${sec} without a terminal pause`);
      break;
    }
    assert.equal(step.currentSec, sec + 1, `seed ${seed} did not advance by one second from ${sec}`);
    sec = step.currentSec;
    if (sampleMidpoint && sec === midpoint) midpointData = serializeGameState(state);
  }
  assert.ok(sec > startedAt || state.runStatus?.complete === true, `seed ${seed} made no progress`);
  if (audit) assertJsonValue(state, "state", new Set());
  return { state, sec, midpointData };
}

function snapshot(state) {
  return serializeGameState(state);
}

function assertRoundTrip(state, label) {
  const saved = snapshot(state);
  const wire = JSON.parse(JSON.stringify(saved));
  const restored = deserializeGameState(wire);
  assertSnapshotEqual(snapshot(restored), saved, label);
  return saved;
}

function assertReplay(seed, sec, expected) {
  const timeline = createTimelineFromInitialState(createNewGameState(seed));
  const rebuilt = rebuildStateAtSecond(timeline, sec);
  assert.equal(rebuilt.ok, true, `replay of seed ${seed} failed at tSec ${sec}: ${rebuilt.reason}`);
  assert.equal(Math.floor(rebuilt.state.tSec), sec, `replay of seed ${seed} landed on the wrong second`);
  assertSnapshotEqual(snapshot(rebuilt.state), expected, `replay seed ${seed}`);
  const again = rebuildStateAtSecond(timeline, sec);
  assert.equal(again.ok, true, `second replay of seed ${seed} failed`);
  assertSnapshotEqual(snapshot(again.state), expected, `repeated replay seed ${seed}`);
  return timeline;
}

function withWallClock(fn) {
  let ticks = 1_000_000;
  const previousDate = Date.now;
  const previousPerf = performance.now;
  Date.now = () => {
    ticks += 11;
    return ticks;
  };
  performance.now = () => {
    ticks += 3;
    return ticks;
  };
  try {
    return fn();
  } finally {
    Date.now = previousDate;
    performance.now = previousPerf;
  }
}

function selectFirstVassal(state) {
  const pool = getVassalCandidatePool(state);
  const candidates = Array.isArray(pool?.candidates) ? pool.candidates : [];
  if (!candidates.length || pool.expectedPoolHash == null) return null;
  return {
    kind: ActionKinds.SETTLEMENT_SELECT_VASSAL,
    payload: { candidateIndex: 0, expectedPoolHash: pool.expectedPoolHash },
  };
}

const guards = installIsolationGuards();
try {
  const horizonSec = calendarHorizonSec(createNewGameState(SEEDS[0]));
  const runs = SEEDS.map((seed, index) => ({
    seed,
    ...play(seed, horizonSec, { audit: index === 0, sampleMidpoint: index === 0 }),
  }));
  for (const [index, run] of runs.entries()) {
    const saved = assertRoundTrip(run.state, `save round-trip seed ${run.seed}`);
    const timeline = assertReplay(run.seed, run.sec, saved);
    if (index !== 0 || !run.midpointData) continue;
    const middleSec = Math.max(0, Math.floor(run.midpointData.tSec ?? 0));
    const middle = rebuildStateAtSecond(timeline, middleSec);
    assert.equal(middle.ok, true, `midpoint replay failed for seed ${run.seed}: ${middle.reason}`);
    assertSnapshotEqual(snapshot(middle.state), run.midpointData, `midpoint replay seed ${run.seed}`);
    const restored = deserializeGameState(JSON.parse(JSON.stringify(run.midpointData)));
    const continued = advanceReplayStateToSecond(restored, run.sec);
    assert.equal(continued.ok, true, `continuing a saved seed ${run.seed} failed: ${continued.reason}`);
    assertSnapshotEqual(snapshot(restored), saved, `saved seed ${run.seed} continued differently`);
    const afterScrub = rebuildStateAtSecond(timeline, run.sec);
    assert.equal(afterScrub.ok, true);
    assertSnapshotEqual(snapshot(afterScrub.state), saved, `scrubbing seed ${run.seed} changed the later second`);
  }

  const repeated = withWallClock(() => play(SEEDS[0], horizonSec));
  assert.equal(repeated.sec, runs[0].sec, "a shifted wall clock changed how far the run progressed");
  assertSnapshotEqual(snapshot(repeated.state), snapshot(runs[0].state), "a shifted wall clock changed the run");

  const actionSec = Math.max(1, Math.floor(horizonSec / 5));
  const actionRun = play(SEEDS[0], actionSec);
  const action = selectFirstVassal(actionRun.state);
  if (action && actionRun.sec === actionSec) {
    actionRun.state.paused = true;
    const applied = applyAction(actionRun.state, action);
    actionRun.state.paused = false;
    if (applied?.ok) {
      const actionHorizon = Math.min(horizonSec, actionSec + 4);
      const finished = advanceReplayStateToSecond(actionRun.state, actionHorizon);
      assert.equal(finished.ok, true, `run did not keep moving after an action: ${finished.reason}`);
      const timeline = createTimelineFromInitialState(createNewGameState(SEEDS[0]));
      const recorded = appendActionAtCursor(timeline, { ...action, tSec: actionSec }, { tSec: actionSec });
      assert.equal(recorded.ok, true, recorded.reason);
      const rebuilt = rebuildStateAtSecond(timeline, actionRun.state.tSec);
      assert.equal(rebuilt.ok, true, rebuilt.reason);
      assertSnapshotEqual(snapshot(rebuilt.state), snapshot(actionRun.state), "action replay");
    }
  }

  const finished = deserializeGameState(snapshot(runs[0].state));
  const finishedSec = Math.floor(finished.tSec ?? 0);
  finished.runStatus = {
    complete: true,
    reason: "invariant-stop",
    tSec: finishedSec,
    year: finished.year,
  };
  finished.paused = true;
  const stopped = advanceReplayStateOneSecond(finished);
  assert.equal(stopped.ok, false, "a completed run kept advancing");
  assert.equal(Math.floor(finished.tSec ?? 0), finishedSec, "a completed run moved time without advancing");
  assertRoundTrip(finished, "completed run round-trip");

  assert.deepEqual(guards.hits, [], `simulation touched ${guards.hits.join(", ")}`);
} finally {
  guards.restore();
}

const storage = new Map();
const previousStorage = globalThis.localStorage;
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: (key) => storage.delete(key),
};
try {
  const seed = SEEDS[0];
  const horizonSec = calendarHorizonSec(createNewGameState(seed));
  const played = play(seed, Math.min(horizonSec, 12));
  const timeline = createTimelineFromInitialState(createNewGameState(seed));
  timeline.cursorSec = played.sec;
  timeline.historyEndSec = played.sec;
  timeline.maxReachedHistoryEndSec = played.sec;
  const written = writeSaveToSlot(1, { state: played.state, timeline, setupId: "invariant" });
  assert.equal(written.ok, true, written.reason ?? "save failed");
  const loaded = inspectSaveSlot(1);
  assert.equal(loaded.ok, true, loaded.reason ?? "load failed");
  assertSnapshotEqual(snapshot(loaded.state), snapshot(played.state), "save slot reload");
  const wire = JSON.parse(storage.get("civsurvivor.save.slot1"));
  assert.equal(wire.meta.schemaVersion, SAVE_SCHEMA_VERSION);
  assert.equal(wire.meta.tSec, played.sec);
  assertSnapshotEqual(wire.state, snapshot(played.state), "save slot state blob");
} finally {
  if (previousStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = previousStorage;
}

console.log("[engine-invariants] OK");
