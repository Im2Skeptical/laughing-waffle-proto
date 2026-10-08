// Projection snapshots share one deep-frozen config. Prove that this is a pure
// representation change: every anchor, slice tail and off-anchor restore is
// byte-identical to official replay serialized with the save serializer, and
// no restored state can alias or mutate stored anchors or their config.
import assert from "node:assert/strict";
import { createInitialState } from "../init.js";
import { serializeGameState, deserializeGameState } from "../state.js";
import { canonicalizeSnapshot } from "../canonicalize.js";
import { advanceReplayStateOneSecond, initializeReplayClock } from "../replay-second-runner.js";
import { buildProjectionSummaryFromState } from "../projection-summary.js";
import { createProjectionChunkSession, buildProjectionChunkFromStateData } from "../projection-chunk.js";
import { createForecastChunkConfigReceiver, createForecastChunkConfigSender } from "../timegraph/forecast-wire.js";
import { serialize as serializeWire } from "node:v8";
import { createProjectionStateRestorer } from "../timegraph/state-restorer.js";
import { createTimelineFromInitialState, rebuildStateAtSecond } from "../timeline/index.js";
import { createProjectionCache } from "../timegraph/projection-cache.js";

const HORIZON_SEC = Number(process.env.PROJECTION_IDENTITY_SECONDS ?? 2400);
const initial = createInitialState("devPlaytesting01", 99117);
initial.paused = false;
// Long-lived authored fixture (as in the browser performance probe).
initial.gameConfig.settings.values.primordialBasePressure = 0;
const base = serializeGameState(initial);

function deepFrozen(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return true;
  seen.add(value);
  if (!Object.isFrozen(value)) return false;
  return Object.values(value).every(child => deepFrozen(child, seen));
}

// Production path: worker-shaped session slices -> wire encoding (config sent
// once per worker) -> structured clone -> main-thread config restoration.
const sendChunk = createForecastChunkConfigSender();
const receiver = createForecastChunkConfigReceiver();
const messageBytes = [];
let mainConfig = null;
const session = createProjectionChunkSession(base, 0, HORIZON_SEC, { stepSec: 1, actionsBySecond: [] });
assert.equal(session.ok, true);
const anchors = new Map();
const summaries = new Map();
let sec = 0;
let configIdentity = null;
while (sec < HORIZON_SEC) {
  const slice = session.next(Math.min(HORIZON_SEC, sec + (sec < 1440 ? 20 : 30)));
  assert.equal(slice.ok, true);
  for (const [s, data] of slice.stateDataBySecond) {
    configIdentity ??= data.gameConfig;
    assert.equal(data.gameConfig, configIdentity, "every anchor shares one config value");
  }
  assert.equal(slice.lastStateData.gameConfig, configIdentity);
  const wire = sendChunk(slice);
  assert.equal(wire.sharedConfig.config != null, messageBytes.length === 0, "config travels only in the first message");
  messageBytes.push(serializeWire(wire).byteLength);
  const received = structuredClone(wire);
  assert.equal(receiver.restore(received), true);
  for (const [, data] of received.stateDataBySecond) {
    mainConfig ??= data.gameConfig;
    assert.equal(data.gameConfig, mainConfig, "main-thread anchors share one config across chunks");
  }
  assert.equal(received.lastStateData.gameConfig, mainConfig);
  for (const [s, data] of received.stateDataBySecond) anchors.set(s, data);
  anchors.set(slice.endSec, received.lastStateData);
  for (const [s, summary] of received.summaryBySecond) summaries.set(s, summary);
  sec = slice.endSec;
  if (slice.terminal) break;
}
assert.ok(deepFrozen(configIdentity), "the shared config is deep-frozen");
assert.ok(deepFrozen(mainConfig), "the received config is deep-frozen");
assert.ok(serializeWire(configIdentity).byteLength > 100000, "config is the bulk that later messages omit");
assert.ok(messageBytes.slice(1).every(bytes => bytes < 3 * 160000), "later messages carry bodies only");
// An id the receiver never saw is rejected rather than merged without config.
const orphan = structuredClone(sendChunk(createProjectionChunkSession(base, 0, 4).next(4)));
const freshReceiver = createForecastChunkConfigReceiver();
assert.equal(freshReceiver.restore(orphan), false, "unknown config ids are rejected");
// Mixed configs within one chunk fall back to per-message config copies.
const mixedFirst = buildProjectionChunkFromStateData(base, 0, 2);
const alternate = structuredClone(mixedFirst.lastStateData);
alternate.gameConfig.settings.values.primordialBasePressure = 7;
const mixedWire = createForecastChunkConfigSender()({ ok: true,
  stateDataBySecond: new Map([[1, mixedFirst.stateDataBySecond.get(1) ?? mixedFirst.lastStateData], [2, alternate]]),
  summaryBySecond: new Map(), lastStateData: alternate });
assert.equal(mixedWire.sharedConfig, undefined);
const mixedReceived = structuredClone(mixedWire);
assert.equal(createForecastChunkConfigReceiver().restore(mixedReceived), true);
assert.notEqual(mixedReceived.stateDataBySecond[0][1].gameConfig.settings.values.primordialBasePressure,
  mixedReceived.lastStateData.gameConfig.settings.values.primordialBasePressure);
assert.throws(() => { configIdentity.settings.values.primordialBasePressure = 1; }, TypeError);

// Official replay with the save serializer at every compared second.
const official = deserializeGameState(base);
canonicalizeSnapshot(official);
initializeReplayClock(official, 0);
const offAnchorTargets = new Set();
for (let t = 23; t <= sec; t += 37) if (!anchors.has(t)) offAnchorTargets.add(t);
const officialText = new Map();
let compared = 0;
for (let t = 1; t <= sec; t++) {
  assert.equal(advanceReplayStateOneSecond(official).ok, true);
  canonicalizeSnapshot(official);
  if (t % 97 === 0) {
    assert.deepEqual(summaries.get(t), buildProjectionSummaryFromState(official), `summary at ${t}`);
  }
  if (anchors.has(t) || offAnchorTargets.has(t)) officialText.set(t, JSON.stringify(serializeGameState(official)));
  if (anchors.has(t)) {
    assert.equal(JSON.stringify(anchors.get(t)), officialText.get(t), `anchor ${t} is byte-identical to the save serializer`);
    compared++;
  }
}
assert.ok(compared >= sec / 16, "every 16-second anchor was compared");
assert.equal(summaries.size, sec + 1, "every second keeps its summary");

// Off-anchor restores (the scrub path) from the nearest earlier anchor.
const restorer = createProjectionStateRestorer();
const anchorSecs = [...anchors.keys()].sort((a, b) => a - b);
for (const target of offAnchorTargets) {
  const from = anchorSecs.filter(s => s <= target).at(-1);
  const restored = restorer.restore(anchors.get(from), from, target);
  // Restores append gameConfig after the body (pre-existing restorer key
  // order), so compare complete structure and values rather than key order.
  assert.deepStrictEqual(serializeGameState(restored), JSON.parse(officialText.get(target)), `off-anchor ${target} from ${from}`);
}
// And the authoritative timeline replay agrees at two off-anchor seconds.
const timeline = createTimelineFromInitialState(deserializeGameState(base));
for (const target of [...offAnchorTargets].slice(0, 2)) {
  const rebuilt = rebuildStateAtSecond(timeline, target);
  assert.equal(rebuilt.ok, true);
  assert.equal(JSON.stringify(serializeGameState(rebuilt.state)), officialText.get(target), `timeline replay ${target}`);
}

// A single synchronous chunk (main-thread prime/fallback path) is identical too.
const direct = buildProjectionChunkFromStateData(base, 0, 64);
for (const [s, data] of direct.stateDataBySecond) {
  if (officialText.has(s)) assert.equal(JSON.stringify(data), officialText.get(s));
}

// The restore reader recognises the shared frozen config by identity instead
// of stringifying ~230 KB per anchor; a different frozen config is still
// compared by content and fully validated.
{
  const originalStringify = JSON.stringify;
  let configStringifies = 0;
  JSON.stringify = function countingStringify(value, ...rest) {
    if (value === mainConfig) configStringifies++;
    return originalStringify.call(this, value, ...rest);
  };
  try {
    const reader = createProjectionStateRestorer();
    for (const s of anchorSecs.slice(0, 24)) reader.restore(anchors.get(s), s);
  } finally {
    JSON.stringify = originalStringify;
  }
  assert.ok(configStringifies <= 1, `shared config compared by identity (stringified ${configStringifies}x)`);
  const changed = structuredClone(anchors.get(anchorSecs[0]));
  changed.gameConfig.settings.values.primordialBasePressure = 3;
  Object.freeze(changed.gameConfig);
  const reader = createProjectionStateRestorer();
  reader.restore(anchors.get(anchorSecs[0]), anchorSecs[0]);
  assert.equal(reader.restore(changed, anchorSecs[0]).gameConfig.settings.values.primordialBasePressure, 3,
    "a different frozen config is never mistaken for the shared one");
}

// Mutation isolation: restored previews own independent mutable bodies, and
// neither stored anchors nor their shared config can be changed through them.
const probeSec = anchorSecs[Math.floor(anchorSecs.length / 2)];
const stored = anchors.get(probeSec);
const storedText = JSON.stringify(stored);
const neighbourSec = anchorSecs[Math.floor(anchorSecs.length / 2) + 1];
const neighbourText = JSON.stringify(anchors.get(neighbourSec));
const first = restorer.restore(stored, probeSec);
const second = restorer.restore(stored, probeSec);
assert.notEqual(first, second);
assert.notEqual(first.world, stored.world, "restores never return anchor body pointers");
first.world.sites[0].detailedState.practiceSlots.fill(null);
first.world.regions[0].controller = "neutral";
first.rng.seed = 1;
first.persistentKnowledge = { maxObservedCivilizationSurvivalYear: 999 };
assert.throws(() => { first.gameConfig.settings.values.primordialBasePressure = 5; }, TypeError,
  "shared config cannot be written through a restored preview");
assert.throws(() => { first.gameConfig.gamepieces.practices.forage.workerCapacity = 0; }, TypeError);
assert.equal(JSON.stringify(stored), storedText, "stored anchor is unchanged after preview mutation");
assert.equal(JSON.stringify(anchors.get(neighbourSec)), neighbourText, "neighbouring anchors are unchanged");
assert.deepStrictEqual(serializeGameState(second), JSON.parse(storedText),
  "a second restore of the same anchor is unaffected");
assert.deepStrictEqual(serializeGameState(restorer.restore(stored, probeSec)), JSON.parse(storedText));
// Continuing simulation from a restored preview never touches its anchor.
restorer.restore(stored, probeSec, probeSec + 15);
assert.equal(JSON.stringify(stored), storedText);
// Ordinary save/replay deserialization still yields an independent mutable config.
const ordinary = deserializeGameState(stored);
assert.equal(Object.isFrozen(ordinary.gameConfig), false);
ordinary.gameConfig.settings.values.primordialBasePressure = 9;
assert.equal(stored.gameConfig.settings.values.primordialBasePressure, 0);
// Save serialization still embeds a full, independent config copy.
const saved = serializeGameState(ordinary);
assert.notEqual(saved.gameConfig, ordinary.gameConfig);
assert.equal(Object.isFrozen(saved.gameConfig), false);
// Byte accounting counts each shared frozen config once per generation, not
// per anchor, so a full 16-second stride fits where config copies would not.
const sharedConfig = Object.freeze({ padding: "c".repeat(64 * 1024) });
const sharedBudget = createProjectionCache({ maxBytes: 1024 * 1024 });
const copiedBudget = createProjectionCache({ maxBytes: 1024 * 1024 });
for (let t = 16; t <= 1024; t += 16) {
  const body = { tSec: t, padding: "b".repeat(8 * 1024) };
  sharedBudget.setStateData(t, { ...body, gameConfig: sharedConfig });
  copiedBudget.setStateData(t, { ...body, gameConfig: { padding: sharedConfig.padding } });
}
assert.equal(sharedBudget.getSize(), 64, "shared-config anchors keep the full 16 s stride within budget");
assert.ok(copiedBudget.getSize() < 20, "unshared config copies are still counted per anchor");
console.log(`[projection-shared-config] ${compared} anchors byte-identical, ${offAnchorTargets.size} off-anchor restores (value-identical) over ${sec}s; isolation OK`);
