// Composition boundaries for installed Structure stock modifiers.
// Direct plan / apply / evaluate checks stay pre-timeline. The substitute
// stockConsumed event is snapshotted before flush and is not a replay.
// node scripts/stock-modifier-composition-test.mjs
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { createNewGameState } from "../src/model/new-game.js";
import { serializeGameState, deserializeGameState } from "../src/model/state.js";
import { getAdjacentRegionIds, getConnectedRegionIds, getRegionState } from "../src/model/world-state.js";
import { practiceSlot, fiveSlots, setFixturePopulation } from "../src/model/dev-lab/fixtures.js";
import { planStock, applyStockPlan, stockTraits } from "../src/model/detailed-settlements/stock.js";
import { evaluateDetailedPracticeSlot, tryCreateStructure, runPracticeActivation, flushPracticeEvents } from "../src/model/detailed-settlements/practices.js";
import { runConstructionCycles } from "../src/model/detailed-settlements/construction.js";
import { occupiedCells } from "../src/model/structure-layout.js";
import { advanceReplayStateToSecond, initializeReplayClock } from "../src/model/replay-second-runner.js";
import { getNextMoonPhaseBoundarySec } from "../src/model/moon-phases.js";
import { createTimelineFromInitialState, rebuildStateAtSecond } from "../src/model/timeline/index.js";
import { canonicalizeSnapshot } from "../src/model/canonicalize.js";
import { disableMonthlyDemographics } from "../src/model/tests/detailed-settlements/helpers.js";

const ARTIFACT = path.resolve("artifacts/stock-modifier-composition");
const REPRO = "node scripts/stock-modifier-composition-test.mjs";
const failures = [];
const covered = [];

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

function same(label, actual, expected) {
  try {
    assert.deepEqual(actual, expected);
    return true;
  } catch (error) {
    fail(label, { reason: error.message?.slice(0, 500) ?? "mismatch" });
    return false;
  }
}

function pair() {
  const state = createNewGameState(42);
  state.gameConfig.settings.values.primordialBasePressure = 0;
  disableMonthlyDemographics(state);
  const local = state.world.sites.find(site => site.regionId === state.civilization.capitalRegionId);
  const ally = state.world.sites.find(site => site.detailedState
    && site !== local
    && getRegionState(state, site.regionId)?.controller === "player"
    && getAdjacentRegionIds(state, local.regionId).includes(site.regionId)
    && getConnectedRegionIds(state, local.regionId).includes(site.regionId));
  for (const site of state.world.sites) {
    if (!site.detailedState) continue;
    setFixturePopulation(site.detailedState, 0);
    site.detailedState.practiceSlots = fiveSlots();
    site.detailedState.structureSlots = site.detailedState.structureSlots.map(() => null);
  }
  return { state, local, ally };
}

function place(pack, id, quality = 0) {
  const ok = tryCreateStructure(pack.state, pack.local.regionId, id);
  const slots = pack.local.detailedState.structureSlots.filter(slot => slot?.structureId === id);
  if (!ok || !slots.length) {
    fail("placement", { reason: `tryCreateStructure ${id} rejected`, ok });
    return false;
  }
  slots[slots.length - 1].qualityBonus = quality;
  return true;
}

function finish(pack, scholars) {
  setFixturePopulation(pack.local.detailedState, Math.max(scholars, 0), scholars);
  canonicalizeSnapshot(pack.state);
  return pack;
}

function stockOf(site, practiceId) {
  return site.detailedState.practiceSlots.find(slot => slot?.practiceId === practiceId)?.stock ?? null;
}

function providerAmount(plan, trait) {
  return (plan?.providers ?? []).filter(row => row.traits?.includes(trait)).reduce((sum, row) => sum + row.amount, 0);
}

function requirePreserves() {
  const pack = pair();
  if (!pack.ally || !place(pack, "quartermasterHall")) return;
  pack.local.detailedState.practiceSlots = fiveSlots(
    practiceSlot("bowmaking"),
    practiceSlot("logging", 1),
    practiceSlot("barter", 2),
  );
  finish(pack, 0);
  const view = evaluateDetailedPracticeSlot(pack.state, pack.local.regionId, 0);
  const applied = applyStockPlan(pack.state, pack.local.detailedState, { ok: view.supplied, providers: view.providers });
  const ok = view.supplied === true
    && view.providers.some(row => row.kind === "require" && row.practiceId === "barter" && row.amount === 1 && row.traits.includes("Tool"))
    && view.providers.some(row => row.kind === "consume" && row.practiceId === "logging" && row.amount === 1)
    && applied === true
    && stockOf(pack.local, "barter") === 2
    && stockOf(pack.local, "logging") === 0;
  if (ok) covered.push("require-preserves-provider");
  else fail("require-preserves-provider", { supplied: view?.supplied, providers: view?.providers, coins: stockOf(pack.local, "barter"), timber: stockOf(pack.local, "logging") });
  const wrong = pair();
  if (!place(wrong, "quartermasterHall")) return;
  wrong.local.detailedState.practiceSlots = fiveSlots(practiceSlot("bowmaking"), practiceSlot("charcoalBurning", 2));
  finish(wrong, 0);
  const beforeWrong = snap(wrong.state);
  const missed = evaluateDetailedPracticeSlot(wrong.state, wrong.local.regionId, 0);
  const untouched = missed?.supplied === false
    && applyStockPlan(wrong.state, wrong.local.detailedState, { ok: false, providers: missed.providers }) === false
    && same("wrong-trait-unchanged", snap(wrong.state), beforeWrong)
    && stockOf(wrong.local, "charcoalBurning") === 2;
  if (untouched) covered.push("wrong-trait-no-substitute");
  else fail("wrong-trait-no-substitute", { supplied: missed?.supplied, missing: missed?.missing });
}

function missingTag() {
  // Barter hosts Currency, not Bone. It is rejected with or without the Knowledge tag guard.
  const pack = pair();
  if (!place(pack, "charnelLibrary")) return;
  pack.local.detailedState.practiceSlots = fiveSlots(practiceSlot("taxAssessment"), practiceSlot("barter", 3));
  finish(pack, 2);
  const view = evaluateDetailedPracticeSlot(pack.state, pack.local.regionId, 0);
  const before = snap(pack.state);
  const held = view?.supplied === false
    && applyStockPlan(pack.state, pack.local.detailedState, { ok: view.supplied, providers: [] }) === false
    && same("currency-not-bone-unchanged", snap(pack.state), before)
    && stockOf(pack.local, "barter") === 3;
  if (held) covered.push("currency-not-from-trait");
  else fail("currency-not-from-trait", { supplied: view?.supplied, providers: view?.providers, missing: view?.missing });

  // The default pool cannot isolate the Charnel donor-tag guard: its only
  // Bone host already supplies Record directly. See the documented audit limit.
}

function consumeRequireSameHost() {
  // Require is read at activation start. A later Consume of the same Tool must not see a second debit.
  const pack = pair();
  pack.local.detailedState.practiceSlots = fiveSlots(practiceSlot("toolmaking", 1));
  finish(pack, 0);
  const settlement = pack.local.detailedState;
  const plan = planStock(pack.state, settlement, [{ traits: ["Tool"], amount: 1 }], [{ traits: ["Tool"], amount: 1 }]);
  const requireRow = plan.providers?.find(row => row.kind === "require" && row.practiceId === "toolmaking");
  const consumeRow = plan.providers?.find(row => row.kind === "consume" && row.practiceId === "toolmaking");
  const applied = applyStockPlan(pack.state, settlement, plan);
  const once = plan.ok === true && requireRow?.amount === 1 && consumeRow?.amount === 1
    && applied === true && stockOf(pack.local, "toolmaking") === 0
    && plan.providers.length === 2;
  if (once) covered.push("consume-require-one-debit");
  else fail("consume-require-one-debit", { ok: plan.ok, providers: plan.providers, missing: plan.missing, tools: stockOf(pack.local, "toolmaking") });

  const over = pair();
  over.local.detailedState.practiceSlots = fiveSlots(practiceSlot("toolmaking", 1));
  finish(over, 0);
  const overBefore = snap(over.state);
  const overPlan = planStock(over.state, over.local.detailedState, [{ traits: ["Tool"], amount: 2 }], [{ traits: ["Tool"], amount: 1 }]);
  const atomic = overPlan.ok === false && overPlan.providers.length === 0
    && applyStockPlan(over.state, over.local.detailedState, overPlan) === false
    && same("consume-require-over-unchanged", snap(over.state), overBefore)
    && stockOf(over.local, "toolmaking") === 1;
  if (atomic) covered.push("consume-require-two-atomic");
  else fail("consume-require-two-atomic", { ok: overPlan.ok, missing: overPlan.missing, providers: overPlan.providers, tools: stockOf(over.local, "toolmaking") });
}

function bureauLiteral() {
  const pack = pair();
  if (!place(pack, "bureauOfStandards")) return;
  pack.local.detailedState.practiceSlots = fiveSlots(practiceSlot("toolmaking", 2));
  finish(pack, 2);
  const slot = pack.local.detailedState.practiceSlots[0];
  const before = snap(pack.state);
  const plan = planStock(pack.state, pack.local.detailedState, [], [{ traits: ["Work"], amount: 1 }]);
  const applied = applyStockPlan(pack.state, pack.local.detailedState, plan);
  const fuel = pair();
  if (!place(fuel, "bureauOfStandards")) return;
  fuel.local.detailedState.practiceSlots = fiveSlots(practiceSlot("charcoalBurning", 2));
  finish(fuel, 2);
  const fuelBefore = snap(fuel.state);
  const fuelPlan = planStock(fuel.state, fuel.local.detailedState, [], [{ traits: ["Work"], amount: 1 }]);
  const ok = plan.ok === true && plan.providers[0]?.kind === "require" && plan.providers[0]?.amount === 1
    && plan.providers[0]?.traits?.[0] === "Work"
    && stockTraits(pack.state, slot).includes("Tool")
    && applied === true && stockOf(pack.local, "toolmaking") === 2
    && same("bureau-require-unchanged", snap(pack.state), before)
    && fuelPlan.ok === false
    && applyStockPlan(fuel.state, fuel.local.detailedState, fuelPlan) === false
    && same("bureau-fuel-unchanged", snap(fuel.state), fuelBefore);
  if (ok) covered.push("bureau-work-require");
  else fail("bureau-work-require", { plan, fuelOk: fuelPlan.ok, tools: stockOf(pack.local, "toolmaking") });
}

function flexibleScopes() {
  const pack = pair();
  if (!place(pack, "laboratory", 3)) return;
  pack.local.detailedState.practiceSlots = fiveSlots(practiceSlot("civilEngineering"), practiceSlot("toolmaking", 2));
  finish(pack, 2);
  const view = evaluateDetailedPracticeSlot(pack.state, pack.local.regionId, 0);
  const flex = view?.providers?.find(row => row.substitution);
  const applied = applyStockPlan(pack.state, pack.local.detailedState, { ok: view.supplied, providers: view.providers });
  const positive = view?.supplied === true && flex?.kind === "consume" && flex.amount === 1
    && flex.traits.includes("Tool") && flex.substitution?.[0] === "Record"
    && applied === true && stockOf(pack.local, "toolmaking") === 1;
  if (positive) covered.push("flexible-one-consume");
  else fail("flexible-one-consume", { supplied: view?.supplied, providers: view?.providers, tools: stockOf(pack.local, "toolmaking") });

  const two = pair();
  if (!place(two, "laboratory", 3)) return;
  // Armour Smithing consumes 1 Metal and 1 Fuel, and requires 1 Tool.
  // Tool 2 covers the Require without a debit and could pay both missing
  // Consumes if flexible were reusable. One substitutable input leaves Fuel short.
  two.local.detailedState.practiceSlots = fiveSlots(practiceSlot("armourSmithing"), practiceSlot("toolmaking", 2));
  finish(two, 2);
  const before = snap(two.state);
  const blocked = evaluateDetailedPracticeSlot(two.state, two.local.regionId, 0);
  const atomic = blocked?.supplied === false
    && blocked.providers?.length === 0
    && blocked.missing?.kind === "consume"
    && blocked.missing?.traits?.[0] === "Fuel"
    && blocked.missing?.amount === 1
    && applyStockPlan(two.state, two.local.detailedState, { ok: false, providers: blocked.providers }) === false
    && same("flexible-two-unchanged", snap(two.state), before)
    && stockOf(two.local, "toolmaking") === 2;
  if (atomic) covered.push("flexible-two-input-atomic");
  else fail("flexible-two-input-atomic", { supplied: blocked?.supplied, missing: blocked?.missing, providers: blocked?.providers, tools: stockOf(two.local, "toolmaking") });
}

function wildcardScopes() {
  const pack = pair();
  if (!pack.ally || !place(pack, "procurementOffice", 3)) return;
  pack.local.detailedState.practiceSlots = fiveSlots(practiceSlot("scholarship"));
  pack.ally.detailedState.practiceSlots = fiveSlots(practiceSlot("barter", 3));
  finish(pack, 2);
  const view = evaluateDetailedPracticeSlot(pack.state, pack.local.regionId, 0);
  const row = view?.providers?.[0];
  runPracticeActivation(pack.state, "birth");
  const trace = pack.local.detailedState.practiceActivationTrace ?? [];
  const consumed = trace.find(event => event.kind === "stockConsumed");
  const transfer = pack.state.civilization.practiceEvents?.stockTransfers?.transfers?.[0];
  const positive = view?.supplied === true && row?.amount === 1 && row?.kind === "consume"
    && row.regionId === pack.ally.regionId
    && row.traits.includes("Currency") && row.substitution?.[0] === "Record"
    && stockOf(pack.ally, "barter") === 2
    && consumed?.traits?.includes("Currency") && consumed.traits.includes("Record") === false
    && transfer?.traits?.[0] === "Record" && transfer.amount === 1;
  if (positive) covered.push("wildcard-remote-traits");
  else fail("wildcard-remote-traits", {
    supplied: view?.supplied, providers: view?.providers, coins: stockOf(pack.ally, "barter"),
    eventTraits: consumed?.traits ?? null, transferTraits: transfer?.traits ?? null,
  });

  const two = pair();
  if (!place(two, "procurementOffice", 3)) return;
  two.local.detailedState.practiceSlots = fiveSlots(practiceSlot("glassmaking"), practiceSlot("barter", 5));
  finish(two, 2);
  const before = snap(two.state);
  const blocked = evaluateDetailedPracticeSlot(two.state, two.local.regionId, 0);
  const atomic = blocked?.supplied === false
    && applyStockPlan(two.state, two.local.detailedState, { ok: blocked.supplied, providers: blocked.providers ?? [] }) === false
    && same("wildcard-two-unchanged", snap(two.state), before)
    && stockOf(two.local, "barter") === 5;
  if (atomic) covered.push("wildcard-two-input-atomic");
  else fail("wildcard-two-input-atomic", { supplied: blocked?.supplied, missing: blocked?.missing, coins: stockOf(two.local, "barter") });
}

function recordReduction() {
  const least = pair();
  if (!place(least, "schoolhouse", 3)) return;
  least.local.detailedState.practiceSlots = fiveSlots(practiceSlot("scholarship"), practiceSlot("recordKeeping", 1));
  finish(least, 1);
  const view = evaluateDetailedPracticeSlot(least.state, least.local.regionId, 0);
  const applied = applyStockPlan(least.state, least.local.detailedState, { ok: view.supplied, providers: view.providers });
  const minimum = view?.supplied === true && providerAmount(view, "Record") === 1
    && applied === true && stockOf(least.local, "recordKeeping") === 0;
  if (minimum) covered.push("record-minimum-one");
  else fail("record-minimum-one", { supplied: view?.supplied, providers: view?.providers, records: stockOf(least.local, "recordKeeping") });

  function scaled(quality) {
    const pack = pair();
    if (!place(pack, "schoolhouse", quality) || !place(pack, "schoolhouse", quality)) return null;
    pack.local.detailedState.practiceSlots = fiveSlots(practiceSlot("scholarship"), practiceSlot("recordKeeping", 4));
    finish(pack, 1);
    const slot = pack.local.detailedState.practiceSlots[0];
    return planStock(pack.state, pack.local.detailedState, [{ traits: ["Record"], amount: 4 }], [], slot, true);
  }
  const plain = scaled(0);
  const half = scaled(1);
  const raised = scaled(3);
  // Two quality-1 houses reduce 4 by 2.5. ceil(1.5) is 2; floor would be 1.
  // Quality 3 reduces 4 by 3.5, and the minimum of 1 hides floor versus ceil.
  const ceilOk = plain?.ok === true && providerAmount(plain, "Record") === 2
    && half?.ok === true && providerAmount(half, "Record") === 2
    && raised?.ok === true && providerAmount(raised, "Record") === 1;
  if (ceilOk) covered.push("record-fractional-ceil");
  else fail("record-fractional-ceil", {
    plain: providerAmount(plain, "Record"),
    quality1: providerAmount(half, "Record"),
    quality3: providerAmount(raised, "Record"),
  });
}

function partialAtomic() {
  // Requires are planned before Consumes, so a missing Tool never reserves Timber.
  const early = pair();
  early.local.detailedState.practiceSlots = fiveSlots(practiceSlot("bowmaking"), practiceSlot("logging", 1));
  finish(early, 0);
  const earlyBefore = snap(early.state);
  const earlyPlan = planStock(early.state, early.local.detailedState, [{ traits: ["Timber"], amount: 1 }], [{ traits: ["Tool"], amount: 1 }], early.local.detailedState.practiceSlots[0], false);
  const earlyOk = earlyPlan.ok === false && earlyPlan.missing?.kind === "require" && earlyPlan.providers.length === 0
    && applyStockPlan(early.state, early.local.detailedState, earlyPlan) === false
    && same("require-before-consume-unchanged", snap(early.state), earlyBefore);
  if (earlyOk) covered.push("require-miss-before-consume");
  else fail("require-miss-before-consume", { missing: earlyPlan.missing, providers: earlyPlan.providers });

  // Timber can be reserved, then missing Ore rejects the whole plan.
  const pack = pair();
  pack.local.detailedState.practiceSlots = fiveSlots(practiceSlot("logging", 1), practiceSlot("toolmaking", 1));
  finish(pack, 0);
  const before = snap(pack.state);
  const plan = planStock(pack.state, pack.local.detailedState,
    [{ traits: ["Timber"], amount: 1 }, { traits: ["Ore"], amount: 1 }],
    [{ traits: ["Tool"], amount: 1 }]);
  const applied = applyStockPlan(pack.state, pack.local.detailedState, plan);
  const ok = plan.ok === false && plan.missing?.kind === "consume" && plan.missing?.traits?.[0] === "Ore"
    && plan.providers.length === 0 && applied === false
    && same("partial-consume-unchanged", snap(pack.state), before)
    && stockOf(pack.local, "logging") === 1 && stockOf(pack.local, "toolmaking") === 1;
  if (ok) covered.push("two-consume-atomic");
  else fail("two-consume-atomic", { ok: plan.ok, missing: plan.missing, providers: plan.providers });
}

function tick(state, sec) {
  const moved = advanceReplayStateToSecond(state, sec);
  if (!moved?.ok) fail("tick", { reason: moved?.reason ?? "advanceFailed", sec });
  return moved?.ok === true;
}

function placeConstruction(pack) {
  const slots = pack.local.detailedState.structureSlots;
  const origin = occupiedCells(slots).findIndex(cell => cell == null);
  if (origin < 0) return false;
  slots[origin] = {
    structureId: "mudHouses", origin, width: 1, placementId: `fixture:mud:${origin}`,
    construction: { completedCycles: 0 },
  };
  return true;
}

function continuation() {
  // applyStockPlan debits and records transfers. stockConsumed is emitted by the
  // construction payer and stays pending until flushPracticeEvents. This payment
  // is a direct pre-timeline seam, not a replayed event.
  const pack = pair();
  if (!place(pack, "procurementOffice") || !placeConstruction(pack)) return;
  pack.local.detailedState.practiceSlots = fiveSlots(practiceSlot("barter", 1));
  finish(pack, 2);
  runConstructionCycles(pack.state, "housing");
  const pending = (pack.state.civilization.practiceEvents?.pending ?? []).filter(event => event.kind === "stockConsumed");
  const paid = pending[0];
  const mud = pack.local.detailedState.structureSlots.find(slot => slot?.structureId === "mudHouses");
  const receipt = mud?.construction?.completedCycles;
  const ready = paid?.traits?.includes("Currency") === true && paid.traits.includes("Construction") === false
    && stockOf(pack.local, "barter") === 0 && receipt === 1 && pending.length === 1;
  if (ready) covered.push("substitute-pending-event");
  else fail("substitute-pending-event", { traits: paid?.traits ?? null, coins: stockOf(pack.local, "barter"), receipt, pending: pending.length });
  writeJson("substitute-pending-event.json", { pending, coins: stockOf(pack.local, "barter"), receipt, rng: snap(pack.state).rng });
  const fork = deserializeGameState(JSON.parse(JSON.stringify(snap(pack.state))));
  flushPracticeEvents(pack.state);
  flushPracticeEvents(fork);
  const traced = (pack.state.civilization.practiceEvents?.trace ?? []).find(event => event.kind === "stockConsumed");
  const flushed = same("flush-continue", snap(fork), snap(pack.state))
    && same("flush-continue-rng", snap(fork).rng, snap(pack.state).rng)
    && traced?.traits?.includes("Currency") === true
    && stockOf(pack.local, "barter") === 0;
  if (flushed) covered.push("flush-pending-rng");
  else fail("flush-pending-rng", { traits: traced?.traits ?? null, coins: stockOf(pack.local, "barter") });

  const replayPack = pair();
  if (!place(replayPack, "procurementOffice") || !placeConstruction(replayPack)) return;
  // Local Food preserves Currency through the meal. The two stocked Traits
  // also enable Barter at Birth: its staffed/contact yield fills capacity 4.
  replayPack.local.detailedState.practiceSlots = fiveSlots(practiceSlot("barter", 1), practiceSlot("forage", 1));
  finish(replayPack, 2);
  initializeReplayClock(replayPack.state, 0);
  const replayTimeline = createTimelineFromInitialState(replayPack.state);
  const next = getNextMoonPhaseBoundarySec(replayPack.state, 0, 2);
  if (!tick(replayPack.state, next - 1)) return;
  if (stockOf(replayPack.local, "barter") !== 4) {
    fail("currency-before-housing", { expected: 4, actual: stockOf(replayPack.local, "barter") });
    return;
  }
  if (!tick(replayPack.state, next)) return;
  // Housing pays one Currency in place of one missing Construction Stock.
  const paidCycle = stockOf(replayPack.local, "barter") === 3
    && replayPack.local.detailedState.structureSlots.find(slot => slot?.structureId === "mudHouses")?.construction?.completedCycles === 1;
  if (!paidCycle) fail("tick-pays-substituted-construction", {
    coins: stockOf(replayPack.local, "barter"), next,
    mud: replayPack.local.detailedState.structureSlots.find(slot => slot?.structureId === "mudHouses"),
    population: replayPack.local.detailedState.populationByClass,
    transfers: replayPack.state.civilization.practiceEvents?.stockTransfers,
    trace: replayPack.state.civilization.practiceEvents?.trace,
  });
  const replay = rebuildStateAtSecond(replayTimeline, next);
  const replayOk = replay?.ok === true
    && same("rebuild", snap(replay.state), snap(replayPack.state))
    && same("rebuild-rng", snap(replay.state).rng, snap(replayPack.state).rng);
  if (replayOk && paidCycle) covered.push("substituted-construction-replay");
  else if (replay?.ok !== true) fail("rebuild", { reason: replay?.reason ?? "rebuildFailed", next });
}

const steps = [requirePreserves, missingTag, consumeRequireSameHost, bureauLiteral, flexibleScopes, wildcardScopes, recordReduction, partialAtomic, continuation];
for (const step of steps) {
  try {
    step();
  } catch (error) {
    fail(step.name || "unexpected", { reason: error?.stack?.split("\n").slice(0, 4).join(" | ") ?? "throw" });
  }
}

if (failures.length) {
  console.error(`stock-modifier-composition ${failures.length} failing; covered ${covered.join(",")}`);
  process.exit(1);
}
console.log(`stock-modifier-composition ok ${covered.join(",")}`);
