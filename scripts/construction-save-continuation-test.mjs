// Structure construction across official ticks, JSON fork, and save-slot reload.
// Legal fixture matches scripts' structure-construction path: publicWorks shop
// commissions (purchase, rejected overlap, confirm) placed before any tick.
// Afterwards only those public actions and official ticks. Direct cycle calls
// are not used. Housing, Edible capacity, and Stock deltas are pinned literals.
// mudHouses and granary complete. stoneHouse stays blocked: no Tool, no partial spend.
// Three vassal content seeds. World layout stays the lab publicWorks fixture.
// Stdout is one aggregate line. Failures: artifacts/construction-save-continuation/
// node scripts/construction-save-continuation-test.mjs
import fs from "node:fs";
import path from "node:path";
import { ActionKinds, applyAction } from "../src/model/actions.js";
import { fiveSlots, practiceSlot, setFixturePopulation } from "../src/model/dev-lab/fixtures.js";
import { createLabNodeSandbox } from "../src/model/dev-lab/node-sandbox.js";
import { settlementStructureDefs } from "../src/defs/gamepieces/detailed-settlement-defs.js";
import { getDetailedPracticeDef, getGameSetting } from "../src/model/game-config.js";
import { setPaused } from "../src/model/game-model.js";
import { getHousingCapacity, getDetailedSettlementSites } from "../src/model/detailed-settlements.js";
import { stockCapacity, structureModifiers } from "../src/model/detailed-settlements/stock.js";
import { assignDetailedSettlementWorkers } from "../src/model/detailed-settlements/workers.js";
import { disableMonthlyDemographics } from "../src/model/tests/detailed-settlements/helpers.js";
import { advanceReplayStateToSecond } from "../src/model/replay-second-runner.js";
import { deserializeGameState, getCurrentSeasonKey, serializeGameState, syncPhaseToPaused } from "../src/model/state.js";
import { appendActionAtCursor, createTimelineFromInitialState, rebuildStateAtSecond } from "../src/model/timeline/index.js";
import { getCurrentLifeMapVassal } from "../src/model/vassal-life-map.js";
import { inspectSaveSlot, writeSaveToSlot } from "../src/controllers/sim-runner/save-slots.js";
import { createSaveTestStorage } from "./save-test-storage.mjs";

const ARTIFACT_DIR = path.resolve("artifacts/construction-save-continuation");
const REPRO = "node scripts/construction-save-continuation-test.mjs";
const SEEDS = [7, 11, 19];
const BEFORE_SEC = 9;
const COMPLETE_SEC = 15;
const PLACED_SEC = 2;
const FIRST_PAY_SEC = 3;
const RNG_STREAMS = ["seed", "baseSeed", "vassalSeed", "vassalDevelopmentSeed", "vassalLifeMapSeed", "vassalPortraitSeed"];
// Current card rules, held as literals so a wrong def cannot supply its own oracle.
const MUD_HOUSING = 30;
const GRANARY_EDIBLE_BONUS = 5;
const FORAGE_CAP = 2;
const FORAGE_FOOD = 1;
const LOGGING_CAP = 6;
const LOGGING_SUMMER = 2;
const MUD_CONSTRUCTION = 1;
const GRANARY_CONSTRUCTION = 1;
const STONE_CONSTRUCTION = 2;
const STONE_TOOL = 1;
const PAID_CONSTRUCTION = MUD_CONSTRUCTION + GRANARY_CONSTRUCTION;
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
    + `repro=${REPRO} artifact=artifacts/construction-save-continuation/${file}`,
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
  expect(result?.ok === true, state.rng.baseSeed, kind, { reason: result?.reason ?? "actionFailed", actual: result?.reason });
  const recorded = appendActionAtCursor(timeline, { kind, payload, tSec: Math.floor(state.tSec ?? 0) }, state);
  expect(recorded?.ok === true, state.rng.baseSeed, `${kind}-record`, { reason: recorded?.reason ?? "appendFailed" });
  return result;
}

function tick(seed, state, sec) {
  const result = advanceReplayStateToSecond(state, sec);
  expect(result?.ok === true, seed, `tick-${sec}`, { reason: result?.reason ?? "advanceFailed", actual: state.tSec });
  expect(Math.floor(state.tSec) === sec, seed, `tick-${sec}-landed`, { expected: sec, actual: state.tSec });
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
  match(seed, rebuiltData.rng, data.rng, `${label}-rng`);
  for (const field of RNG_STREAMS) {
    expect(Object.prototype.hasOwnProperty.call(data.rng, field), seed, `${label}-rng-${field}`, { reason: "missingRngStream" });
  }
}

function offer(structureId, regionId, index) {
  const def = settlementStructureDefs[structureId];
  return {
    offerId: structureId, inventoryIndex: index, label: def.label,
    basePrestigeCost: def.vassalPrestigeCost, basePhaseCost: def.vassalPhaseCost, baseCurrencyCost: 0,
    intervention: { kind: "structure", mode: "add", structureId, targetRegionId: regionId, tier: def.minimumQuality },
  };
}

function siteOf(state) {
  const regionId = getCurrentLifeMapVassal(state).locationRegionId;
  return state.world.sites.find((site) => site.regionId === regionId).detailedState;
}

function progressOf(settlement) {
  const progress = {};
  for (const slot of settlement.structureSlots) {
    if (!slot) continue;
    progress[slot.structureId] = {
      origin: slot.origin,
      width: slot.width,
      cycles: Object.prototype.hasOwnProperty.call(slot, "construction") ? slot.construction.completedCycles : null,
    };
  }
  return progress;
}

function hosted(settlement, practiceId) {
  return settlement.practiceSlots.find((slot) => slot?.practiceId === practiceId)?.stock ?? null;
}

function loggingAfter(tSec) {
  let stock = LOGGING_CAP;
  let pays = 0;
  for (const [sec, kind] of [[FIRST_PAY_SEC, "pay"], [8, "summer"], [BEFORE_SEC, "pay"], [COMPLETE_SEC, "pay"]]) {
    if (sec > tSec) break;
    if (kind === "pay") {
      // mud 1 + granary 1. stoneHouse's 2 Construction is not spent.
      if (pays < 3) stock -= PAID_CONSTRUCTION;
      pays += 1;
    } else stock = Math.min(LOGGING_CAP, stock + LOGGING_SUMMER);
  }
  return stock;
}

function forageAfter(tSec) {
  let stock = 0;
  for (const sec of [2, 8, 14]) {
    if (sec > tSec) break;
    stock = Math.min(FORAGE_CAP, stock + FORAGE_FOOD);
  }
  return stock;
}

function phases(paid, done) {
  return {
    stoneHouse: { origin: 0, width: 1, cycles: 0 },
    mudHouses: { origin: 1, width: 1, cycles: done ? null : paid },
    granary: { origin: 2, width: 1, cycles: done ? null : paid },
  };
}

function assertBoard(seed, state, tSec, spec) {
  const local = siteOf(state);
  const forage = local.practiceSlots.find((slot) => slot?.practiceId === "forage");
  match(seed, progressOf(local), spec.progress, `progress-${tSec}`);
  match(seed, { logging: hosted(local, "logging"), tool: hosted(local, "toolmaking"), forage: hosted(local, "forage") }, spec.stock, `stock-${tSec}`);
  const capacityMods = structureModifiers(state, local).filter((mod) => mod.kind === "capacity");
  match(seed, {
    housing: getHousingCapacity(state, getCurrentLifeMapVassal(state).locationRegionId),
    edibleCapacity: stockCapacity(state, local, forage),
    granaryBonus: capacityMods.reduce((sum, mod) => sum + mod.amount, 0),
    workers: assignDetailedSettlementWorkers(state, getCurrentLifeMapVassal(state).locationRegionId).map((row) => row.effectiveWorkers),
  }, spec.effects, `effects-${tSec}`);
  for (const site of getDetailedSettlementSites(state, { playerOnly: true })) {
    if (site.detailedState === local) continue;
    expect(site.detailedState.structureSlots.every((slot) => slot == null), seed, `remote-structure-${tSec}`, { reason: "remoteSiteConstructed" });
    expect(site.detailedState.practiceSlots.every((slot) => slot == null), seed, `remote-stock-${tSec}`, { reason: "remotePracticeStock" });
  }
}

function open(seed) {
  const { state, nodeId } = createLabNodeSandbox({ type: "publicWorks", classId: "unclassed", prestige: 100, seed });
  disableMonthlyDemographics(state);
  for (const site of getDetailedSettlementSites(state)) {
    site.detailedState.structureSlots = site.detailedState.structureSlots.map(() => null);
    site.detailedState.practiceSlots = fiveSlots();
    setFixturePopulation(site.detailedState, 0);
  }
  const logging = getDetailedPracticeDef(state, "logging");
  const forage = getDetailedPracticeDef(state, "forage");
  const local = siteOf(state);
  const regionId = getCurrentLifeMapVassal(state).locationRegionId;
  expect(logging.stockCapacity === LOGGING_CAP && forage.stockCapacity === FORAGE_CAP, seed, "baseline-caps", {
    expected: `logging ${LOGGING_CAP} forage ${FORAGE_CAP}`,
    actual: `logging ${logging.stockCapacity} forage ${forage.stockCapacity}`,
  });
  local.practiceSlots = fiveSlots(practiceSlot("forage", 0), practiceSlot("logging", LOGGING_CAP), practiceSlot("toolmaking", 0));
  const node = getCurrentLifeMapVassal(state).lifeMap.nodeStates[nodeId];
  node.inventory = [offer("stoneHouse", regionId, 0), offer("mudHouses", regionId, 1), offer("granary", regionId, 2)];
  expect(state.tSec === 0 && (state.seasonClockSec ?? 0) === 0, seed, "clock", { actual: `${state.tSec}/${state.seasonClockSec}` });
  expect(getGameSetting(state, "phaseDurationSec") === 1 && getGameSetting(state, "seasonDurationSec") === 8, seed, "durations", {
    actual: `${getGameSetting(state, "phaseDurationSec")}/${getGameSetting(state, "seasonDurationSec")}`,
  });
  expect(getCurrentSeasonKey(state) === "spring", seed, "season", { actual: getCurrentSeasonKey(state) });
  const granaryMod = settlementStructureDefs.granary.modifiers.find((mod) => mod.kind === "capacity");
  const stoneCost = settlementStructureDefs.stoneHouse.construction.consume;
  expect(settlementStructureDefs.mudHouses.housing === MUD_HOUSING, seed, "mud-housing-rule", {
    expected: MUD_HOUSING, actual: settlementStructureDefs.mudHouses.housing,
  });
  expect(granaryMod?.amount === GRANARY_EDIBLE_BONUS && granaryMod.query?.traitsAny?.includes("Edible") === true, seed, "granary-rule", {
    expected: `Edible +${GRANARY_EDIBLE_BONUS}`, actual: JSON.stringify(granaryMod ?? null),
  });
  expect(stoneCost.length === 2
    && stoneCost[0].amount === STONE_CONSTRUCTION && stoneCost[0].traits.includes("Construction")
    && stoneCost[1].amount === STONE_TOOL && stoneCost[1].traits.includes("Tool"), seed, "stone-cost", {
    expected: `${STONE_CONSTRUCTION} Construction + ${STONE_TOOL} Tool`, actual: JSON.stringify(stoneCost),
  });
  expect(settlementStructureDefs.mudHouses.construction.consume[0].amount === MUD_CONSTRUCTION
    && settlementStructureDefs.granary.construction.consume[0].amount === GRANARY_CONSTRUCTION, seed, "paid-cost", {
    expected: `mud ${MUD_CONSTRUCTION} granary ${GRANARY_CONSTRUCTION}`,
    actual: `${settlementStructureDefs.mudHouses.construction.consume[0].amount}/${settlementStructureDefs.granary.construction.consume[0].amount}`,
  });
  expect(settlementStructureDefs.mudHouses.construction.cycles === 3 && settlementStructureDefs.granary.construction.cycles === 3, seed, "cycles", {
    expected: "3 and 3", actual: `${settlementStructureDefs.mudHouses.construction.cycles}/${settlementStructureDefs.granary.construction.cycles}`,
  });
  expect(logging.effects[0].seasonAmounts.summer === LOGGING_SUMMER && forage.effects[0].amount === FORAGE_FOOD, seed, "output", {
    expected: `summer ${LOGGING_SUMMER} forage ${FORAGE_FOOD}`,
    actual: `${logging.effects[0].seasonAmounts.summer}/${forage.effects[0].amount}`,
  });
  return { state, nodeId, timeline: createTimelineFromInitialState(state) };
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
    setupId: "construction-save-continuation",
  });
  expect(written?.ok === true, seed, `${label}-write`, { reason: written?.reason ?? "saveFailed" });
  const loaded = await inspectSaveSlot(1);
  expect(loaded?.ok === true && loaded.nextTimeline, seed, `${label}-load`, { reason: loaded?.reason ?? "loadFailed" });
  match(seed, serializeGameState(loaded.state), data, `${label}-slot`);
  match(seed, serializeGameState(loaded.state).rng, data.rng, `${label}-slot-rng`);
  return loaded.nextTimeline;
}

async function play(seed) {
  const { state, nodeId, timeline } = open(seed);
  const buy = (offerId, origin) => commit(state, timeline, ActionKinds.VASSAL_PURCHASE_SHOP_OFFER, { nodeId, offerId, origin });
  buy("stoneHouse", 0);
  buy("mudHouses", 1);
  const beforeReject = serializeGameState(state);
  const rejected = applyLive(state, ActionKinds.VASSAL_PURCHASE_SHOP_OFFER, { nodeId, offerId: "stoneHouse", origin: 0 });
  expect(rejected?.ok === false && rejected.reason === "stagedStructureOverlap", seed, "reject-overlap", {
    expected: "stagedStructureOverlap", actual: rejected?.reason ?? "missing",
  });
  match(seed, serializeGameState(state), beforeReject, "reject-atomic");
  buy("granary", 2);
  commit(state, timeline, ActionKinds.VASSAL_CONFIRM_LIFE_NODE, { nodeId });
  const idle = { logging: LOGGING_CAP, tool: 0, forage: 0 };
  match(seed, { logging: hosted(siteOf(state), "logging"), tool: hosted(siteOf(state), "toolmaking"), forage: hosted(siteOf(state), "forage") }, idle, "stock-placed");
  const effects = (done) => ({
    housing: done ? MUD_HOUSING : 0,
    edibleCapacity: done ? FORAGE_CAP + GRANARY_EDIBLE_BONUS : FORAGE_CAP,
    granaryBonus: done ? GRANARY_EDIBLE_BONUS : 0,
    workers: [0, 0, 0, 0, 0],
  });
  const stockAt = (tSec) => ({ logging: loggingAfter(tSec), tool: 0, forage: forageAfter(tSec) });
  tick(seed, state, PLACED_SEC);
  assertBoard(seed, state, PLACED_SEC, {
    progress: phases(0, false), stock: stockAt(PLACED_SEC), effects: effects(false),
  });
  const placed = serializeGameState(state);
  sameFullState(seed, timeline, PLACED_SEC, placed, "placed");
  tick(seed, state, FIRST_PAY_SEC);
  assertBoard(seed, state, FIRST_PAY_SEC, {
    progress: phases(1, false), stock: stockAt(FIRST_PAY_SEC), effects: effects(false),
  });
  const paidLogging = LOGGING_CAP - PAID_CONSTRUCTION;
  const stoneWouldTake = LOGGING_CAP - PAID_CONSTRUCTION - STONE_CONSTRUCTION;
  expect(hosted(siteOf(state), "logging") === paidLogging && hosted(siteOf(state), "toolmaking") === 0, seed, "stone-no-partial", {
    expected: `logging ${paidLogging} tool 0`,
    actual: `logging ${hosted(siteOf(state), "logging")} tool ${hosted(siteOf(state), "toolmaking")} (stone would leave logging ${stoneWouldTake} tool ${-STONE_TOOL})`,
  });
  tick(seed, state, BEFORE_SEC);
  assertBoard(seed, state, BEFORE_SEC, {
    progress: phases(2, false), stock: stockAt(BEFORE_SEC), effects: effects(false),
  });
  const before = serializeGameState(state);
  sameFullState(seed, timeline, BEFORE_SEC, before, "before-complete");
  tick(seed, state, COMPLETE_SEC);
  assertBoard(seed, state, COMPLETE_SEC, {
    progress: phases(3, true), stock: stockAt(COMPLETE_SEC), effects: effects(true),
  });
  const finished = progressOf(siteOf(state));
  expect(finished.stoneHouse.cycles === 0 && finished.mudHouses.cycles === null && finished.granary.cycles === null, seed, "stone-blocked", {
    expected: "stoneHouse cycles 0; mudHouses and granary complete",
    actual: JSON.stringify(finished),
  });
  expect(hosted(siteOf(state), "toolmaking") === 0, seed, "stone-tool-untouched", { expected: 0, actual: hosted(siteOf(state), "toolmaking") });
  const at = serializeGameState(state);
  sameFullState(seed, timeline, COMPLETE_SEC, at, "at-complete");
  const fork = deserializeGameState(JSON.parse(JSON.stringify(before)));
  const continued = advanceReplayStateToSecond(fork, COMPLETE_SEC);
  expect(continued?.ok === true, seed, "json-continue", { reason: continued?.reason ?? "advanceFailed" });
  match(seed, serializeGameState(fork), at, "json-continue");
  match(seed, serializeGameState(fork).rng, at.rng, "json-continue-rng");
  const savedBefore = await saveSlot(seed, timeline, BEFORE_SEC, before, "save-before");
  const continuedBefore = rebuildStateAtSecond(savedBefore, COMPLETE_SEC);
  expect(continuedBefore?.ok === true, seed, "save-before-continue", { reason: continuedBefore?.reason ?? "rebuildFailed" });
  match(seed, serializeGameState(continuedBefore.state), at, "save-before-continue");
  match(seed, serializeGameState(continuedBefore.state).rng, at.rng, "save-before-continue-rng");
  await saveSlot(seed, timeline, COMPLETE_SEC, at, "save-at");
  runs += 1;
}

const storage = createSaveTestStorage();
try {
  for (const seed of SEEDS) {
    try { await play(seed); }
    catch (error) {
      if (!error?.recorded) record(seed, "threw", { reason: error?.message ?? String(error), stack: error?.stack });
    }
  }
} finally {
  storage.restore();
}
if (runs !== SEEDS.length) record(0, "coverage", { expected: String(SEEDS.length), actual: String(runs) });
if (failures.length) {
  console.error(`[construction-save-continuation] FAILED ${failures.length} repro=${REPRO}`);
  process.exitCode = 1;
} else {
  console.log(`[construction-save-continuation] OK runs=${runs} comparisons=${comparisons}; completed=mudHouses+granary; blocked=stoneHouse (0 cycles, no Construction or Tool spent)`);
}
