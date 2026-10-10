// Paid neutral supply across the food boundary: local free stock first, literal
// coin spend, depletion plus replenishment, excluded providers, and atomic
// mixed inputs, plus one successful paid Edible+Timber recipe. Fixtures are authored before any timeline. Afterwards only
// official ticks. JSON fork, rebuild, and save-slot reload must match the
// full serialized state, including every RNG field.
// node scripts/neutral-market-continuation-test.mjs
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createNewGameState } from "../src/model/new-game.js";
import { serializeGameState, deserializeGameState } from "../src/model/state.js";
import { getAdjacentRegionIds, getConnectedRegionIds, getRegionState } from "../src/model/world-state.js";
import { practiceSlot, fiveSlots, setFixturePopulation } from "../src/model/dev-lab/fixtures.js";
import { planStock, applyStockPlan } from "../src/model/detailed-settlements/stock.js";
import { validateNeutralMarket } from "../src/model/detailed-settlements/neutral-market.js";
import { getPopulationSummary } from "../src/model/detailed-settlements/queries.js";
import { getNextMoonPhaseBoundarySec } from "../src/model/moon-phases.js";
import { advanceReplayStateToSecond, initializeReplayClock } from "../src/model/replay-second-runner.js";
import { createTimelineFromInitialState, rebuildStateAtSecond } from "../src/model/timeline/index.js";
import { canonicalizeSnapshot } from "../src/model/canonicalize.js";
import { disableMonthlyDemographics } from "../src/model/tests/detailed-settlements/helpers.js";
import { inspectSaveSlot, writeSaveToSlot } from "../src/controllers/sim-runner/save-slots.js";
import { createSaveTestStorage } from "./save-test-storage.mjs";

const ARTIFACT = path.resolve("artifacts/neutral-market-continuation");
const REPRO = "node scripts/neutral-market-continuation-test.mjs";
const SEED = 42;
const POPULATION = 61;
const MEAL_DEMAND = 3;
const COINS = 5;
const failures = [];
const covered = [];

const PRICED = [
  { id: "food", label: "Provisions", traits: ["Edible"], stock: 4, capacity: 10, price: 2, replenishment: 3 },
  { id: "timber", label: "Timber", traits: ["Timber", "Fuel", "Construction"], stock: 6, capacity: 10, price: 1, replenishment: 2 },
];

function writeJson(name, value) {
  const file = path.join(ARTIFACT, name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function fail(label, extra) {
  const row = { label, repro: REPRO, ...extra };
  failures.push(row);
  writeJson(`failures/${label}.json`, row);
  console.error(`FAIL ${label} ${extra.reason ?? ""} repro=${REPRO}`);
}

function snap(state) {
  return serializeGameState(state);
}

function rngOf(data) {
  return data?.rng ?? null;
}

function same(label, actual, expected) {
  try {
    assert.deepEqual(actual, expected);
    return true;
  } catch (error) {
    fail(label, { reason: error.message?.slice(0, 500) ?? "mismatch" });
    return false;
  }
}

function authored({ coins = COINS, logging = 1, link = "adjacent" } = {}) {
  const state = createNewGameState(SEED);
  state.gameConfig.settings.values.primordialBasePressure = 0;
  disableMonthlyDemographics(state);
  const local = state.world.sites.find(site => site.regionId === state.civilization.capitalRegionId);
  const neutral = state.world.sites.find(site => site.neutral && getAdjacentRegionIds(state, local.regionId).includes(site.regionId));
  const distant = state.world.sites.find(site => site.neutral && site !== neutral);
  for (const site of state.world.sites) {
    setFixturePopulation(site.detailedState, 0);
    site.detailedState.practiceSlots = fiveSlots();
  }
  setFixturePopulation(local.detailedState, POPULATION);
  const partner = link === "distant" ? distant : neutral;
  state.world.connections = link === "none" ? [] : [{ regionAId: local.regionId, regionBId: partner.regionId }];
  neutral.neutral.currencyStock = 0;
  neutral.neutral.stocks = PRICED.map(row => ({ ...row, traits: [...row.traits] }));
  distant.neutral.currencyStock = 0;
  distant.neutral.stocks = PRICED.map(row => ({ ...row, traits: [...row.traits] }));
  const slots = [practiceSlot("bowmaking"), practiceSlot("toolmaking", 1), practiceSlot("barter", coins)];
  if (logging > 0) slots.splice(2, 0, practiceSlot("logging", logging));
  local.detailedState.practiceSlots = fiveSlots(...slots);
  // Normalize only the authored fixture, before timeline capture or ticks.
  // Comparisons retain every field of the raw serialized runtime states.
  canonicalizeSnapshot(state);
  return { state, local, neutral, distant };
}

function quantities(pack) {
  const { state, local, neutral } = pack;
  const slots = local.detailedState.practiceSlots;
  return {
    tSec: state.tSec,
    coins: slots.find(slot => slot?.practiceId === "barter")?.stock ?? null,
    arms: slots.find(slot => slot?.practiceId === "bowmaking")?.stock ?? null,
    tools: slots.find(slot => slot?.practiceId === "toolmaking")?.stock ?? null,
    localTimber: slots.find(slot => slot?.practiceId === "logging")?.stock ?? null,
    edible: neutral.neutral.stocks.find(row => row.id === "food").stock,
    timber: neutral.neutral.stocks.find(row => row.id === "timber").stock,
    currency: neutral.neutral.currencyStock,
    consumed: local.detailedState.lastMeal?.consumed ?? null,
    rng: rngOf(snap(state)),
  };
}

function legal(pack) {
  const { state, local, neutral } = pack;
  const player = getRegionState(state, local.regionId).controller === "player";
  const adjacent = getAdjacentRegionIds(state, local.regionId).includes(neutral.regionId);
  const linked = getConnectedRegionIds(state, local.regionId).includes(neutral.regionId);
  const errors = validateNeutralMarket(neutral);
  const demand = getPopulationSummary(state, local.regionId).mealDemand;
  if (!player || !adjacent || !linked || errors.length || demand !== MEAL_DEMAND || neutral.neutral.currencyStock !== 0) {
    fail("authored-legal", { player, adjacent, linked, errors, demand, currency: neutral.neutral.currencyStock });
    return false;
  }
  covered.push("authored-legal");
  return true;
}

function seamAtomic() {
  const poor = authored({ coins: 2, logging: 0 });
  const beforePoor = snap(poor.state);
  const mixedCost = [{ traits: ["Edible"], amount: 1 }, { traits: ["Timber"], amount: 1 }];
  const poorPlan = planStock(poor.state, poor.local.detailedState, mixedCost);
  const poorApplied = applyStockPlan(poor.state, poor.local.detailedState, poorPlan);
  const missing = authored({ coins: COINS, logging: 0 });
  const beforeMissing = snap(missing.state);
  const armsCost = [{ traits: ["Edible"], amount: 1 }, { traits: ["Arms"], amount: 1 }];
  const armsPlan = planStock(missing.state, missing.local.detailedState, armsCost);
  const armsApplied = applyStockPlan(missing.state, missing.local.detailedState, armsPlan);
  const ok = poorPlan.ok === false && poorApplied === false && same("atomic-poor-unchanged", snap(poor.state), beforePoor)
    && armsPlan.ok === false && armsApplied === false && same("atomic-mixed-unchanged", snap(missing.state), beforeMissing)
    && quantities(poor).edible === 4 && quantities(poor).timber === 6 && quantities(poor).coins === 2
    && quantities(missing).edible === 4 && quantities(missing).currency === 0;
  if (ok) covered.push("atomic-insufficient-mixed");
  else fail("atomic-insufficient-mixed", { poorOk: poorPlan.ok, armsOk: armsPlan.ok, poorApplied, armsApplied });
}

function seamPaidRecipe({ coins = 5, endCoins = 2, id = "paid-recipe-receipt" } = {}) {
  const pack = authored({ coins, logging: 0 });
  const plan = planStock(pack.state, pack.local.detailedState, [
    { traits: ["Edible"], amount: 1 },
    { traits: ["Timber"], amount: 1 },
  ]);
  const applied = applyStockPlan(pack.state, pack.local.detailedState, plan);
  const qty = quantities(pack);
  const providers = (plan.providers ?? []).map(provider => ({
    kind: provider.kind,
    practiceId: provider.practiceId ?? null,
    marketStockId: provider.marketStockId ?? null,
    slotIndex: provider.slotIndex,
    amount: provider.amount,
    unitPrice: provider.unitPrice ?? null,
    traits: provider.traits,
    regionId: provider.regionId,
    paymentFor: provider.paymentFor ?? null,
  }));
  const price = (plan.providers ?? []).filter(provider => provider.paymentFor).reduce((sum, provider) => sum + provider.amount, 0);
  const receipt = [
    { kind: "consume", practiceId: "barter", marketStockId: null, slotIndex: 2, amount: 2, unitPrice: null, traits: ["Currency"], regionId: pack.local.regionId, paymentFor: pack.neutral.regionId },
    { kind: "consume", practiceId: null, marketStockId: "food", slotIndex: 0, amount: 1, unitPrice: 2, traits: ["Edible"], regionId: pack.neutral.regionId, paymentFor: null },
    { kind: "consume", practiceId: "barter", marketStockId: null, slotIndex: 2, amount: 1, unitPrice: null, traits: ["Currency"], regionId: pack.local.regionId, paymentFor: pack.neutral.regionId },
    { kind: "consume", practiceId: null, marketStockId: "timber", slotIndex: 1, amount: 1, unitPrice: 1, traits: ["Timber"], regionId: pack.neutral.regionId, paymentFor: null },
  ];
  const ok = plan.ok === true && applied === true && price === 3
    && qty.coins === endCoins && qty.currency === 3 && qty.edible === 3 && qty.timber === 5
    && qty.tools === 1 && qty.arms === 0
    && same(`${id}-providers`, providers, receipt);
  if (ok) covered.push(id);
  else fail(id, { ok: plan.ok, applied, price, coins: qty.coins, currency: qty.currency, edible: qty.edible, timber: qty.timber, tools: qty.tools, arms: qty.arms });
}

function seamDistant() {
  const pack = authored({ link: "distant", logging: 0 });
  const before = snap(pack.state);
  const plan = planStock(pack.state, pack.local.detailedState, [{ traits: ["Edible"], amount: 1 }]);
  const applied = applyStockPlan(pack.state, pack.local.detailedState, plan);
  const ok = plan.ok === false && applied === false && same("distant-unchanged", snap(pack.state), before);
  if (ok) covered.push("excluded-nonadjacent");
  else fail("excluded-nonadjacent", { ok: plan.ok, applied });
}

function tick(pack, sec) {
  const moved = advanceReplayStateToSecond(pack.state, sec);
  if (!moved?.ok) fail("tick", { reason: moved?.reason ?? "advanceFailed", sec });
  return moved?.ok === true;
}

async function playConnected() {
  const pack = authored({ coins: COINS, logging: 1, link: "adjacent" });
  if (!legal(pack)) return;
  const birthSec = getNextMoonPhaseBoundarySec(pack.state, 0, 0);
  const foodSec = getNextMoonPhaseBoundarySec(pack.state, 0, 1);
  initializeReplayClock(pack.state, 0);
  const timeline = createTimelineFromInitialState(pack.state);
  if (!tick(pack, birthSec)) return;
  const atBirth = quantities(pack);
  const birthData = snap(pack.state);
  // Two workers scale Bowmaking's 3 Arms by (1 + 2 * 1) to 9; the slot keeps its capacity of 5.
  const birthOk = atBirth.arms === 5 && atBirth.localTimber === 0 && atBirth.tools === 1
    && atBirth.coins === COINS && atBirth.timber === 6 && atBirth.edible === 4 && atBirth.currency === 0;
  if (birthOk) covered.push("local-free-before-paid");
  else fail("local-free-before-paid", { atBirth });
  const fork = deserializeGameState(JSON.parse(JSON.stringify(birthData)));
  if (!same("json-birth-rng", rngOf(snap(fork)), rngOf(birthData))) return;
  if (!tick({ state: fork, local: pack.local, neutral: pack.neutral }, foodSec)) return;
  // Fork advanced its own deserialized sites; rebind views from that state.
  const forkLocal = fork.world.sites.find(site => site.regionId === pack.local.regionId);
  const forkNeutral = fork.world.sites.find(site => site.regionId === pack.neutral.regionId);
  if (!tick(pack, foodSec)) return;
  const atFood = quantities(pack);
  const foodOk = atFood.coins === 1 && atFood.arms === 5 && atFood.edible === 5 && atFood.timber === 8
    && atFood.currency === 4 && atFood.consumed === 2;
  if (foodOk) covered.push("food-depletion-restock");
  else fail("food-depletion-restock", { atFood, birthSec, foodSec });
  const forkPack = { state: fork, local: forkLocal, neutral: forkNeutral };
  const continued = same("json-continue", snap(fork), snap(pack.state))
    && same("json-continue-rng", quantities(forkPack).rng, atFood.rng);
  if (continued) covered.push("json-replay-rng");
  const replay = rebuildStateAtSecond(timeline, foodSec);
  const replayOk = replay?.ok === true
    && same("rebuild", snap(replay.state), snap(pack.state))
    && same("rebuild-rng", rngOf(snap(replay.state)), atFood.rng);
  if (replayOk) covered.push("rebuild");
  else if (replay?.ok !== true) fail("rebuild", { reason: replay?.reason ?? "rebuildFailed" });
  const saveTimeline = {
    baseStateData: timeline.baseStateData,
    persistentKnowledge: timeline.persistentKnowledge,
    actions: timeline.actions.filter(action => Math.floor(action.tSec) <= birthSec),
    checkpoints: [],
    cursorSec: birthSec,
    historyEndSec: birthSec,
    maxReachedHistoryEndSec: birthSec,
    revision: Math.floor(timeline.revision ?? 0),
  };
  const written = await writeSaveToSlot(1, {
    state: deserializeGameState(JSON.parse(JSON.stringify(birthData))),
    timeline: saveTimeline,
    setupId: "neutral-market-continuation",
  });
  if (!written?.ok) {
    fail("save-slot", { reason: written?.reason ?? "writeFailed" });
    return;
  }
  const loaded = await inspectSaveSlot(1);
  if (!loaded?.ok || !loaded.nextTimeline) {
    fail("save-slot", { reason: loaded?.reason ?? "loadFailed" });
    return;
  }
  if (!same("save-slot-birth", snap(loaded.state), birthData)) return;
  const continuedSave = rebuildStateAtSecond(loaded.nextTimeline, foodSec);
  if (!continuedSave?.ok || !same("save-slot-food", snap(continuedSave.state), snap(pack.state))) {
    fail("save-slot-food", { reason: continuedSave?.reason ?? "mismatch" });
    return;
  }
  covered.push("save-slot-continue");
  writeJson("connected.json", { birthSec, foodSec, atBirth, atFood, rngKeys: Object.keys(atFood.rng ?? {}) });
}

function playExcluded() {
  const pack = authored({ coins: COINS, logging: 0, link: "none" });
  const birthSec = getNextMoonPhaseBoundarySec(pack.state, 0, 0);
  const foodSec = getNextMoonPhaseBoundarySec(pack.state, 0, 1);
  initializeReplayClock(pack.state, 0);
  createTimelineFromInitialState(pack.state);
  if (!tick(pack, birthSec) || !tick(pack, foodSec)) return;
  const atFood = quantities(pack);
  const ok = atFood.arms === 0 && atFood.coins === COINS && atFood.currency === 0
    && atFood.edible === 7 && atFood.timber === 8 && atFood.consumed === 0;
  if (ok) covered.push("excluded-unconnected");
  else fail("excluded-unconnected", { atFood });
  writeJson("excluded.json", { birthSec, foodSec, atFood });
}

const storage = createSaveTestStorage();
try {
  seamAtomic();
  seamPaidRecipe();
  seamPaidRecipe({ coins: 3, endCoins: 0, id: "paid-recipe-exact-budget" });
  seamDistant();
  await playConnected();
  playExcluded();
} catch (error) {
  fail("threw", { reason: error?.message ?? String(error), stack: error?.stack });
} finally {
  storage.restore();
}

const expected = [
  "authored-legal",
  "atomic-insufficient-mixed",
  "paid-recipe-receipt",
  "paid-recipe-exact-budget",
  "excluded-nonadjacent",
  "local-free-before-paid",
  "food-depletion-restock",
  "json-replay-rng",
  "rebuild",
  "save-slot-continue",
  "excluded-unconnected",
];
const missed = expected.filter(name => !covered.includes(name));
writeJson("summary.json", {
  repro: REPRO,
  covered,
  missed,
  failures: failures.map(row => row.label),
  limits: [
    "Save reload uses the public writeSaveToSlot/inspectSaveSlot path on fake-indexeddb test storage, not a browser profile.",
    "Ticks stop at the first food boundary. Later housing, faith, migration, and death are outside this slice.",
    "Meal demand is ceil(61/30)=3. Coins buy 2 Edible at the authored price of 2, so one meal stays unmet.",
    "Atomic, paid-recipe, and nonadjacent checks are pre-timeline planStock seams. Only the paid recipe applies Stock. None of them are replayed.",
    "Production market templates and prices are not edited. The fixture replaces one site inventory before the timeline.",
    "Projection parity stays in src/model/tests/neutral-markets.js.",
  ],
});
if (failures.length || missed.length) {
  console.error(`[neutral-market-continuation] FAILED covered=${covered.length}/${expected.length} failures=${failures.length}`);
  process.exitCode = 1;
} else {
  console.log(`[neutral-market-continuation] OK scenarios=${covered.length} seed=${SEED} foodBoundary=replay+json+save`);
}
