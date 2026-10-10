// Full-state development-choice and heirloom-loadout replay at nonzero seconds.
// Fixture (queued choices, vault, pending loadout) is authored before timeline capture.
// Afterwards only public actions and ticks. Stdout is one aggregate line.
// Failures: artifacts/replay-lineage-boundaries/
// node scripts/replay-lineage-boundaries-test.mjs
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { ActionKinds, applyAction } from "../src/model/actions.js";
import { setPaused } from "../src/model/game-model.js";
import { advanceReplayStateToSecond } from "../src/model/replay-second-runner.js";
import { deserializeGameState, serializeGameState, syncPhaseToPaused } from "../src/model/state.js";
import { appendActionAtCursor, createTimelineFromInitialState, rebuildStateAtSecond } from "../src/model/timeline/index.js";
import { getCurrentLifeMapVassal, getVassalNodeDisplayState } from "../src/model/vassal-life-map.js";
import { selectedState } from "../src/model/tests/vassal-life-map/helpers.js";

const ARTIFACT_DIR = path.resolve("artifacts/replay-lineage-boundaries");
const SEEDS = [101, 202, 303];
const DEV = ActionKinds.VASSAL_CHOOSE_DEVELOPMENT_STAT;
const LOADOUT = ActionKinds.VASSAL_CONFIRM_HEIRLOOM_LOADOUT;
const failures = [];
let comparisons = 0;
let devRuns = 0;
let loadoutRuns = 0;

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

function fail(seed, label, extra) {
  const repro = "node scripts/replay-lineage-boundaries-test.mjs";
  const failure = { seed, label, repro, ...extra };
  failures.push(failure);
  const file = `failures/seed-${seed}-${String(label).replace(/[^a-z0-9-]+/gi, "-")}.json`;
  writeJson(file, failure);
  console.error(
    `FAIL seed=${seed} label=${label} field=${extra.difference?.path ?? extra.reason ?? ""} `
    + `expected=${extra.difference?.expected ?? ""} actual=${extra.difference?.actual ?? ""} `
    + `repro=${repro} artifact=artifacts/replay-lineage-boundaries/${file}`,
  );
}

function match(seed, actual, expected, label) {
  comparisons += 1;
  const difference = firstDifference(actual, expected);
  if (!difference) return true;
  fail(seed, label, { difference });
  return false;
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
  const result = advanceReplayStateToSecond(session.state, sec);
  assert.equal(result.ok, true, `tick ${sec}: ${result.reason}`);
  assert.equal(Math.floor(session.state.tSec), sec);
  session.script.push({ type: "tick", to: sec });
}

function commit(session, kind, payload) {
  const beforeRng = structuredClone(session.state.rng);
  const result = applyLive(session.state, kind, payload);
  assert.equal(result.ok, true, `${kind}: ${result.reason}`);
  assert.deepEqual(session.state.rng, beforeRng, `${kind} must not reroll choices or inventory`);
  const tSec = Math.floor(session.state.tSec);
  assert.ok(tSec > 0, `${kind} landed at tSec 0`);
  const recorded = appendActionAtCursor(session.timeline, { kind, payload, tSec }, session.state);
  assert.equal(recorded.ok, true, recorded.reason);
  session.script.push({ type: "action", kind, payload, tSec });
  return result;
}

function rejectAtomic(session, kind, payload, reason) {
  const before = serializeGameState(session.state);
  const result = applyLive(session.state, kind, payload);
  assert.equal(result.ok, false, `${kind} invalid action was accepted`);
  assert.equal(result.reason, reason, result.reason);
  match(session.seed, serializeGameState(session.state), before, `rejected-${reason}`);
}

function snap(session, label) {
  const tSec = Math.floor(session.state.tSec);
  const expected = serializeGameState(session.state);
  const rebuilt = rebuildStateAtSecond(session.timeline, tSec);
  const again = rebuildStateAtSecond(session.timeline, tSec);
  assert.equal(rebuilt.ok, true, rebuilt.reason);
  assert.equal(again.ok, true, again.reason);
  const liveOk = match(session.seed, serializeGameState(rebuilt.state), expected, label);
  const repeatOk = match(session.seed, serializeGameState(again.state), expected, `${label}-repeat`);
  const roundTrip = deserializeGameState(JSON.parse(JSON.stringify(expected)));
  const jsonOk = match(session.seed, serializeGameState(roundTrip), expected, `${label}-json`);
  session.snapshots.set(label, { tSec, data: expected, scriptIndex: session.script.length });
  return liveOk && repeatOk && jsonOk;
}

function continueFrom(session, fromLabel, toLabel) {
  const from = session.snapshots.get(fromLabel);
  const to = session.snapshots.get(toLabel);
  const copy = deserializeGameState(JSON.parse(JSON.stringify(from.data)));
  for (const record of session.script.slice(from.scriptIndex, to.scriptIndex)) {
    const result = record.type === "tick"
      ? advanceReplayStateToSecond(copy, record.to)
      : applyLive(copy, record.kind, record.payload);
    assert.equal(result.ok, true, `${record.type} continue: ${result.reason ?? ""}`);
  }
  match(session.seed, serializeGameState(copy), to.data, `json-${fromLabel}-to-${toLabel}`);
}

function heirloom(lineage, definitionId, inheritanceState) {
  return {
    instanceId: `heirloom-${lineage.nextHeirloomInstanceId++}`,
    definitionId, inheritanceState, protectionSpent: false,
  };
}

function openSession(seed) {
  const state = selectedState(seed);
  const vassal = getCurrentLifeMapVassal(state);
  const lineage = state.civilization.vassalLineage;
  const firstId = `${vassal.vassalId}:level:1`;
  const secondId = `${vassal.vassalId}:level:2`;
  vassal.developmentChoiceQueue = [
    { choiceId: firstId, offeredStatIds: ["cunning", "wisdom", "effectiveness"] },
    { choiceId: secondId, offeredStatIds: ["wisdom", "effectiveness", "intelligence"] },
  ];
  vassal.nextDevelopmentChoiceId = 3;
  const ring = heirloom(lineage, "signetRing", "sanctified");
  const boots = heirloom(lineage, "travellersBoots", "fragile");
  const abacus = heirloom(lineage, "abacus", "sanctified");
  state.civilization.heirloomVault[0] = ring;
  state.civilization.heirloomVault[1] = boots;
  state.civilization.heirloomVault[2] = abacus;
  lineage.pendingHeirloomLoadout = true;
  const nodeId = vassal.lifeMap.availableNodeIds[0];
  setPaused(state, false);
  syncPhaseToPaused(state);
  const fixture = serializeGameState(state);
  const restored = deserializeGameState(JSON.parse(JSON.stringify(fixture)));
  assert.equal(match(seed, serializeGameState(restored), fixture, "fixture-json"), true);
  return {
    seed, state: restored, script: [], snapshots: new Map(),
    timeline: createTimelineFromInitialState(restored),
    firstId, secondId, nodeId,
    ringId: ring.instanceId, bootsId: boots.instanceId, abacusId: abacus.instanceId,
    wisdomBefore: vassal.stats.wisdom, effectivenessBefore: vassal.stats.effectiveness,
  };
}

function runSeed(seed) {
  const session = openSession(seed);
  const start = 2 + (seed % 3);
  tickTo(session, start);
  assert.equal(getVassalNodeDisplayState(session.state, session.nodeId).available, false);
  rejectAtomic(session, DEV, { choiceId: "stale-choice", statId: "wisdom" }, "staleDevelopmentChoice");
  commit(session, DEV, { choiceId: session.firstId, statId: "wisdom" });
  const vassal = getCurrentLifeMapVassal(session.state);
  assert.equal(vassal.stats.wisdom, session.wisdomBefore + 1);
  assert.equal(vassal.developmentChoiceQueue.length, 1);
  assert.equal(vassal.developmentChoiceQueue[0].choiceId, session.secondId);
  assert.equal(session.state.civilization.vassalLineage.pendingHeirloomLoadout, true);
  snap(session, "dev-first");
  devRuns += 1;

  tickTo(session, start + 1);
  rejectAtomic(session, DEV, { choiceId: session.firstId, statId: "effectiveness" }, "staleDevelopmentChoice");
  rejectAtomic(session, DEV, { choiceId: session.secondId, statId: "cunning" }, "invalidStat");
  commit(session, DEV, { choiceId: session.secondId, statId: "effectiveness" });
  assert.equal(getCurrentLifeMapVassal(session.state).stats.effectiveness, session.effectivenessBefore + 1);
  assert.equal(getCurrentLifeMapVassal(session.state).developmentChoiceQueue.length, 0);
  assert.equal(getVassalNodeDisplayState(session.state, session.nodeId).available, false);
  rejectAtomic(session, DEV, { choiceId: session.secondId, statId: "wisdom" }, "noDevelopmentChoice");
  snap(session, "dev-second");

  tickTo(session, start + 2);
  rejectAtomic(session, LOADOUT, { equippedInstanceIds: ["missing-heirloom"] }, "invalidLoadout");
  commit(session, LOADOUT, { equippedInstanceIds: [session.ringId, session.bootsId] });
  const loaded = getCurrentLifeMapVassal(session.state);
  const lineage = session.state.civilization.vassalLineage;
  assert.equal(loaded.heirlooms.equipped[0].definitionId, "signetRing");
  assert.equal(loaded.heirlooms.equipped[0].instanceId, session.ringId);
  assert.equal(loaded.heirlooms.equipped[0].inheritanceState, "unmarked");
  assert.equal(loaded.heirlooms.equipped[1].definitionId, "travellersBoots");
  assert.equal(loaded.heirlooms.equipped[1].instanceId, session.bootsId);
  assert.equal(loaded.heirlooms.equipped[1].inheritanceState, "fragile");
  assert.equal(loaded.heirlooms.equipped[2], null);
  assert.equal(loaded.heirlooms.carry.every((slot) => slot == null), true);
  assert.equal(session.state.civilization.heirloomVault[0].instanceId, session.abacusId);
  assert.equal(session.state.civilization.heirloomVault[0].inheritanceState, "sanctified");
  assert.equal(lineage.pendingHeirloomLoadout, false);
  assert.equal(getVassalNodeDisplayState(session.state, session.nodeId).available, true);
  snap(session, "loadout");
  loadoutRuns += 1;
  continueFrom(session, "dev-first", "loadout");
}

for (const seed of SEEDS) {
  try {
    runSeed(seed);
  } catch (error) {
    fail(seed, "threw", { reason: error?.message ?? String(error), stack: error?.stack ?? "" });
  }
}

const ok = failures.length === 0 && devRuns === SEEDS.length && loadoutRuns === SEEDS.length;
console.log(
  `lineage-boundaries ${ok ? "ok" : "FAIL"} seeds=${SEEDS.length} dev=${devRuns} loadout=${loadoutRuns} comparisons=${comparisons} failures=${failures.length}`,
);
if (!ok) process.exit(1);
