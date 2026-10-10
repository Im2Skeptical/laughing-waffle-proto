// Full-state shop draft replay at nonzero seconds.
// Practice: purchase -> reorder -> undo -> repurchase -> confirm.
// Structure: purchase -> move -> undo -> repurchase -> confirm.
// Stdout is one aggregate line. Failures land in artifacts/replay-draft-boundaries/.
// node scripts/replay-draft-boundaries-test.mjs
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { ActionKinds, applyAction } from "../src/model/actions.js";
import { setPaused } from "../src/model/game-model.js";
import { createInitialState } from "../src/model/init.js";
import { advanceReplayStateToSecond } from "../src/model/replay-second-runner.js";
import { deserializeGameState, serializeGameState, syncPhaseToPaused } from "../src/model/state.js";
import { normalizeStructureLayout } from "../src/model/structure-layout.js";
import { appendActionAtCursor, createTimelineFromInitialState, rebuildStateAtSecond } from "../src/model/timeline/index.js";
import { getCurrentLifeMapVassal, getVassalCandidatePool, getVassalNodeDecisionPresentation } from "../src/model/vassal-life-map.js";
import { settlementStructureDefs } from "../src/defs/gamepieces/detailed-settlement-defs.js";

const ARTIFACT_DIR = path.resolve("artifacts/replay-draft-boundaries");
const SEEDS = [101, 202, 303];
const failures = [];
let comparisons = 0;

function preview(value) {
  const text = typeof value === "string" ? JSON.stringify(value.slice(0, 48)) : JSON.stringify(value);
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

function writeJson(name, value) {
  const file = path.join(ARTIFACT_DIR, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function fail(seed, label, extra) {
  const repro = `node scripts/replay-draft-boundaries-test.mjs`;
  const failure = { seed, label, repro, ...extra };
  failures.push(failure);
  const file = `failures/seed-${seed}-${String(label).replace(/[^a-z0-9-]+/gi, "-")}.json`;
  writeJson(file, failure);
  console.error(
    `FAIL seed=${seed} label=${label} field=${extra.difference?.path ?? extra.reason ?? ""} `
    + `expected=${extra.difference?.expected ?? ""} actual=${extra.difference?.actual ?? ""} `
    + `repro=${repro} artifact=artifacts/replay-draft-boundaries/${file}`,
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
  const beforeBoard = structuredClone(siteSlots(session));
  const result = applyLive(session.state, kind, payload);
  assert.equal(result.ok, true, `${kind}: ${result.reason}`);
  if (kind !== ActionKinds.VASSAL_CONFIRM_LIFE_NODE) {
    assert.deepEqual(siteSlots(session), beforeBoard, `${kind} mutated the live board`);
  }
  const tSec = Math.floor(session.state.tSec);
  assert.ok(tSec > 0, `${kind} landed at tSec 0`);
  const recorded = appendActionAtCursor(session.timeline, { kind, payload, tSec }, session.state);
  assert.equal(recorded.ok, true, recorded.reason);
  session.script.push({ type: "action", kind, payload, tSec });
  return result;
}

function snap(session, label) {
  const tSec = Math.floor(session.state.tSec);
  const expected = serializeGameState(session.state);
  const rebuilt = rebuildStateAtSecond(session.timeline, tSec);
  const again = rebuildStateAtSecond(session.timeline, tSec);
  assert.equal(rebuilt.ok, true, rebuilt.reason);
  assert.equal(again.ok, true, again.reason);
  const liveOk = match(session.seed, serializeGameState(rebuilt.state), expected, `${session.shop}-${label}`);
  const repeatOk = match(session.seed, serializeGameState(again.state), expected, `${session.shop}-${label}-repeat`);
  session.snapshots.set(label, { tSec, data: expected, scriptIndex: session.script.length });
  return liveOk && repeatOk;
}

function continueFrom(session, fromLabel, toLabel) {
  const from = session.snapshots.get(fromLabel);
  const to = session.snapshots.get(toLabel);
  const copy = deserializeGameState(JSON.parse(JSON.stringify(from.data)));
  if (!match(session.seed, serializeGameState(copy), from.data, `${session.shop}-json-${fromLabel}`)) return;
  for (const record of session.script.slice(from.scriptIndex, to.scriptIndex)) {
    const result = record.type === "tick"
      ? advanceReplayStateToSecond(copy, record.to)
      : applyLive(copy, record.kind, record.payload);
    assert.equal(result.ok, true, `${record.type} continue: ${result.reason}`);
  }
  match(session.seed, serializeGameState(copy), to.data, `${session.shop}-json-${fromLabel}-to-${toLabel}`);
}

function rejectAtomic(session, kind, payload) {
  const before = serializeGameState(session.state);
  const result = applyLive(session.state, kind, payload);
  assert.equal(result.ok, false, "invalid shop action was accepted");
  match(session.seed, serializeGameState(session.state), before, `${session.shop}-rejected-atomic`);
  return result.reason;
}

function siteSlots(session) {
  const vassal = getCurrentLifeMapVassal(session.state);
  const site = session.state.world.sites.find((entry) => entry.regionId === vassal.locationRegionId).detailedState;
  return session.shop === "practice" ? site.practiceSlots : site.structureSlots;
}

function keyOf(shop, slots) {
  if (shop === "practice") return slots.map((slot) => slot?.practiceId ?? null);
  return slots.map((slot) => (slot ? [slot.origin, slot.structureId] : null));
}

function boardKey(session) {
  return keyOf(session.shop, siteSlots(session));
}

function stagedKey(session) {
  const view = getVassalNodeDecisionPresentation(session.state, session.nodeId).settlement;
  return keyOf(session.shop, session.shop === "practice" ? view.practices : view.structures);
}

function openSession(seed, shop) {
  const state = createInitialState("devPlaytesting01", seed);
  state.gameConfig.settings.values.primordialBasePressure = 0;
  setPaused(state, true);
  syncPhaseToPaused(state);
  const pool = getVassalCandidatePool(state);
  const selected = applyAction(state, {
    kind: ActionKinds.SETTLEMENT_SELECT_VASSAL,
    payload: { candidateIndex: 0, expectedPoolHash: pool.expectedPoolHash },
  }, { isReplay: true });
  assert.equal(selected.ok, true, selected.reason);
  const vassal = getCurrentLifeMapVassal(state);
  vassal.prestige = 1000;
  const family = shop === "practice" ? "practiceReform" : "publicWorks";
  const nodeId = vassal.lifeMap.graph.nodes.find((node) => node.family === family).id;
  vassal.lifeMap.availableNodeIds = [nodeId];
  const entered = applyAction(state, { kind: ActionKinds.VASSAL_ENTER_LIFE_NODE, payload: { nodeId } }, { isReplay: true });
  assert.equal(entered.ok, true, entered.reason);
  const site = state.world.sites.find((entry) => entry.regionId === vassal.locationRegionId).detailedState;
  if (shop === "practice") {
    site.practiceSlots = ["forage", "pastoralism", "logging", "surfaceMining", "barter"].map((practiceId) => (
      { practiceId, tier: "bronze", stock: 2, charge: 0, work: 0 }
    ));
    vassal.lifeMap.nodeStates[nodeId].inventory = ["dryFarming", "quarrying"].map((practiceId, index) => ({
      offerId: `ux:${index}`, inventoryIndex: index, label: practiceId, basePrestigeCost: 10, basePhaseCost: 1,
      intervention: { kind: "practice", mode: "learn", practiceId, resultingTier: "bronze", targetRegionId: vassal.locationRegionId },
    }));
  } else {
    state.world.regions.find((region) => region.id === vassal.locationRegionId).structureCapacity = 8;
    site.structureSlots = normalizeStructureLayout(
      [{ structureId: "granary" }, { structureId: "mudHouses" }, null, null, { structureId: "longhouse", width: 2 }],
      8, (id) => settlementStructureDefs[id],
    );
    vassal.lifeMap.nodeStates[nodeId].inventory = [["workshop", 1], ["greatDwelling", 3], ["granary", 1]].map(([structureId], index) => ({
      offerId: `fixture:${index}`, inventoryIndex: index, label: structureId, basePrestigeCost: 10, basePhaseCost: 1,
      intervention: { kind: "structure", mode: "add", targetRegionId: vassal.locationRegionId, structureId, tier: "bronze" },
    }));
  }
  setPaused(state, false);
  syncPhaseToPaused(state);
  return {
    seed, shop, nodeId, state, script: [], snapshots: new Map(),
    timeline: createTimelineFromInitialState(state),
  };
}

function runShop(seed, shop) {
  const session = openSession(seed, shop);
  const start = 2 + (seed % 3);
  tickTo(session, start);
  const confirmed = structuredClone(siteSlots(session));
  const confirmedKey = boardKey(session);
  const nodeId = session.nodeId;
  if (shop === "practice") {
    commit(session, ActionKinds.VASSAL_PURCHASE_SHOP_OFFER, { nodeId, offerId: "ux:0", toIndex: 0, replacePracticeId: "logging" });
    assert.equal(rejectAtomic(session, ActionKinds.VASSAL_REORDER_SHOP_PURCHASE, { nodeId, offerId: "practice:dryFarming", toIndex: 99 }), "invalidPurchaseOrder");
  } else {
    commit(session, ActionKinds.VASSAL_PURCHASE_SHOP_OFFER, { nodeId, offerId: "fixture:0" });
    assert.equal(rejectAtomic(session, ActionKinds.VASSAL_PURCHASE_SHOP_OFFER, { nodeId, offerId: "fixture:2", origin: 99 }), "outsideConstructionStrip");
  }
  assert.deepEqual(siteSlots(session), confirmed, `${shop} draft mutated the confirmed board`);
  assert.notDeepEqual(stagedKey(session), confirmedKey, `${shop} purchase did not change the staged tableau`);
  const purchasedTableau = stagedKey(session);
  snap(session, "staged-purchase");

  tickTo(session, start + 1);
  if (shop === "practice") {
    commit(session, ActionKinds.VASSAL_REORDER_SHOP_PURCHASE, { nodeId, offerId: "practice:dryFarming", toIndex: 1 });
  } else {
    const view = getVassalNodeDecisionPresentation(session.state, nodeId);
    const purchase = view.purchases[0];
    const origin = purchase.validOrigins.find((candidate) => candidate !== purchase.placement.origin);
    assert.ok(origin != null, "structure purchase has no alternate legal origin");
    commit(session, ActionKinds.VASSAL_MOVE_SHOP_STRUCTURE, { nodeId, offerId: purchase.offerId, origin });
  }
  assert.deepEqual(boardKey(session), confirmedKey, `${shop} reorder mutated the confirmed board`);
  const reordered = stagedKey(session);
  assert.notDeepEqual(reordered, purchasedTableau, `${shop} move did not change the staged tableau`);
  assert.notDeepEqual(reordered, confirmedKey, `${shop} reorder left the staged tableau unchanged`);
  snap(session, "staged-reorder");

  tickTo(session, start + 2);
  const purchasedId = getCurrentLifeMapVassal(session.state).lifeMap.nodeStates[nodeId].purchasedOffers[0].offerId;
  commit(session, ActionKinds.VASSAL_UNDO_SHOP_PURCHASE, { nodeId, offerId: purchasedId });
  assert.equal(getCurrentLifeMapVassal(session.state).lifeMap.nodeStates[nodeId].purchasedOffers.length, 0);
  assert.deepEqual(boardKey(session), confirmedKey, `${shop} undo mutated the confirmed board`);
  if (shop === "practice") {
    commit(session, ActionKinds.VASSAL_PURCHASE_SHOP_OFFER, { nodeId, offerId: "ux:0", toIndex: 2 });
  } else {
    const offer = getVassalNodeDecisionPresentation(session.state, nodeId).offers.find((entry) => entry.offerId === "fixture:0");
    assert.ok(offer?.validOrigins?.length, "repurchase has no legal structure origin");
    commit(session, ActionKinds.VASSAL_PURCHASE_SHOP_OFFER, { nodeId, offerId: "fixture:0", origin: offer.validOrigins[0] });
  }
  assert.deepEqual(boardKey(session), confirmedKey, `${shop} repurchase mutated the confirmed board`);
  const staged = stagedKey(session);
  assert.notDeepEqual(staged, confirmedKey, `${shop} repurchase did not stage content`);
  snap(session, "staged-repurchase");

  tickTo(session, start + 3);
  commit(session, ActionKinds.VASSAL_CONFIRM_LIFE_NODE, { nodeId });
  assert.deepEqual(boardKey(session), staged, `${shop} confirm diverged from the staged tableau`);
  snap(session, "confirmed");
  continueFrom(session, "staged-purchase", "confirmed");
  continueFrom(session, "staged-repurchase", "confirmed");
}

const probe = { rng: { vassalSeed: 1, seed: 1 } };
const corrupted = { rng: { vassalSeed: 2, seed: 1 } };
const probeDifference = firstDifference(corrupted, probe);
writeJson("comparator-probe.json", { detected: probeDifference?.path ?? null });
assert.ok(probeDifference?.path?.includes("vassalSeed"), "comparator missed an RNG field");

for (const seed of SEEDS) {
  runShop(seed, "practice");
  runShop(seed, "structure");
}

if (failures.length) {
  console.error(`[replay-draft-boundaries] ${failures.length} failure(s), ${comparisons} comparisons`);
  process.exit(1);
}
console.log(`[replay-draft-boundaries] ${SEEDS.length} seeds, practice+structure, ${comparisons} full-state comparisons OK`);
