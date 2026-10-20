// Quality, staffing, and two structure capacity modifiers, plus Charge clamps.
// Contracts already in stock.js / practices.js, charge-content.js, and
// docs/civilization-milestone.md: tier index 0..3 adds capacity; structure
// Stock Power starts at 1 and Structures add their quality rank; pooled Power multiplies
// base plus tier capacity, then floors once; workers scale private Charge gain only.
// A practice takes one Scholar socket, then ordinary tokens from
// floor((adults - scholars) / populationPerToken). Academy gate is 3 Scholars.
// Knowledge-tagged and Scholar-staffed Practices receive the same Academy contribution.
// Sheep Husbandry's hook text mentions extra staffed capacity, but no practice
// def has scholarCapacityBonus. That mismatch is not pinned here.
// Training Yard and Black Archive add chargeGain, not chargeThresholdReduction.
// These fixtures do not claim that no future card can reduce a threshold.
// node scripts/quality-modifier-interactions-test.mjs
import { getInspectionTerms } from '../src/views/inspection-terms.js';
import fs from "node:fs";
import path from "node:path";
import { settlementStructureDefs } from "../src/defs/gamepieces/detailed-settlement-defs.js";
import { fiveSlots, practiceSlot, setFixturePopulation, createLabFixture } from "../src/model/dev-lab/fixtures.js";
import { getDetailedSettlementSites, getDetailedSettlementViewModel } from "../src/model/detailed-settlements.js";
import { evaluateDetailedPracticeSlot, flushPracticeEvents } from "../src/model/detailed-settlements/practices.js";
import { emitPracticeEvent } from "../src/model/detailed-settlements/practice-events.js";
import { stockCapacity, stockCapacityBreakdown, structureQualityMultiplier, structureModifierAmount } from "../src/model/detailed-settlements/stock.js";
import { assignDetailedSettlementWorkers, isScholarStaffed } from "../src/model/detailed-settlements/workers.js";
import { applyBuild } from "../src/model/structure-layout.js";
import { deserializeGameState, serializeGameState } from "../src/model/state.js";
import { createTimelineFromInitialState, rebuildStateAtSecond } from "../src/model/timeline/index.js";

const ARTIFACT_DIR = path.resolve("artifacts/quality-modifier-interactions");
const REPRO = "node scripts/quality-modifier-interactions-test.mjs";
const TIERS = ["bronze", "silver", "gold", "diamond"];
const failures = [];

function preview(value) {
  if (value === undefined) return "undefined";
  let text;
  try { text = JSON.stringify(value); } catch (error) { text = String(error); }
  if (text == null) return "undefined";
  return text.length > 160 ? `${text.slice(0, 157)}...` : text;
}

function firstDifference(actual, expected, pathName = "$") {
  if (Object.is(actual, expected)) return null;
  const objects = actual != null && expected != null && typeof actual === "object" && typeof expected === "object";
  if (!objects || Array.isArray(actual) !== Array.isArray(expected)) return { path: pathName, actual: preview(actual), expected: preview(expected) };
  if (Array.isArray(actual)) {
    if (actual.length !== expected.length) return { path: pathName, actual: preview(actual), expected: preview(expected) };
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

function expect(actual, expected, name) {
  const difference = firstDifference(actual, expected);
  if (!difference) return;
  failures.push({ name, ...difference, repro: REPRO });
}

function bake(state) {
  return deserializeGameState(JSON.parse(JSON.stringify(serializeGameState(state))));
}

function open() {
  const state = createLabFixture("stock", 42);
  const site = getDetailedSettlementSites(state, { playerOnly: true })[0];
  const local = site.detailedState;
  local.structureSlots = local.structureSlots.map(() => null);
  local.practiceSlots = fiveSlots();
  return { state, site, local, regionId: site.regionId };
}

function place(local, structureId, origin, qualityBonus) {
  const width = settlementStructureDefs[structureId].footprint;
  const built = applyBuild(local.structureSlots, {
    structureId, width, origin, placementId: `quality:${structureId}:${origin}`,
  });
  if (!built.ok) throw new Error(`${structureId} @${origin}: ${built.reason}`);
  built.slots[origin].qualityBonus = qualityBonus;
  local.structureSlots = built.slots;
}

function prepared(spec) {
  const fixture = open();
  fixture.local.practiceSlots = fiveSlots(...spec.slots.map(slot => practiceSlot(slot.id, 0, slot.tier ?? "bronze")));
  setFixturePopulation(fixture.local, spec.population, spec.scholars ?? 0, spec.warriors ?? 0);
  for (const structure of spec.structures ?? []) place(fixture.local, structure.id, structure.origin, structure.qualityBonus);
  const state = bake(fixture.state);
  const site = getDetailedSettlementSites(state, { playerOnly: true })[0];
  return { state, local: site.detailedState, regionId: site.regionId };
}

function measure(spec, slotIndex) {
  const fixture = prepared(spec);
  const assigned = assignDetailedSettlementWorkers(fixture.state, fixture.regionId)[slotIndex];
  const evaluation = evaluateDetailedPracticeSlot(fixture.state, fixture.regionId, slotIndex);
  return {
    fixture, assigned, evaluation,
    capacity: stockCapacity(fixture.state, fixture.local, fixture.local.practiceSlots[slotIndex], isScholarStaffed(assigned)),
  };
}

function pinCapacity(name, spec, slotIndex, expected) {
  const row = measure(spec, slotIndex);
  expect(row.capacity, expected, `${name}:direct`);
  expect(row.evaluation.stockCapacity, expected, `${name}:evaluation`);
}

function sockets(assigned) {
  return {
    scholars: assigned.tokens.filter(token => token.specialist === "scholar").length,
    tokens: assigned.tokens.length,
    effective: assigned.effectiveWorkers,
  };
}

try {
for (const def of Object.values(settlementStructureDefs)) {
  const rank = TIERS.indexOf(def.minimumQuality) + 1;
  for (const mod of def.modifiers ?? []) {
    if (mod.kind !== 'capacity') continue;
    expect(mod.amount, rank, `${def.id}:authored-power-matches-quality`);
    for (const qualityBonus of [0,1,2,3]) expect(structureModifierAmount(def,mod,{qualityBonus}), Math.min(4,rank+qualityBonus), `${def.id}:quality-power-${qualityBonus}`);
  }
}
for (const qualityBonus of [0,1,2,3]) {
  const granary = prepared({population:0,slots:[{id:'forage'}],structures:[{id:'granary',origin:0,qualityBonus}]});
  expect(stockCapacity(granary.state,granary.local,granary.local.practiceSlots[0]),2*(2+qualityBonus),`granary-solo-quality-${qualityBonus}`);
}
const twoGranaries = prepared({population:0,slots:[{id:'forage'}],structures:[{id:'granary',origin:0,qualityBonus:0},{id:'granary',origin:1,qualityBonus:0}]});
expect(stockCapacity(twoGranaries.state,twoGranaries.local,twoGranaries.local.practiceSlots[0]),6,'two-bronze-granaries-times-three');

// Authored-value checks: base 1 + Bronze 1 + Silver 2 = x4.
const pool = prepared({population:0, slots:[{id:'carpentry'}], structures:[
  {id:'storehouse',origin:0,qualityBonus:0},{id:'workshop',origin:1,qualityBonus:0},
]});
const beforePool = serializeGameState(pool.state);
const detail = stockCapacityBreakdown(pool.state,pool.local,pool.local.practiceSlots[0]);
expect([detail.base,detail.power,detail.total],[5,4,20],'power-adds-to-base-one');
expect(detail.sources.map(source=>[source.label,source.amount]),[['Storehouse',1],['Workshop',2]],'named-power-sources');
const powerFace = getDetailedSettlementViewModel(pool.state,pool.regionId).practices[0].face;
expect([powerFace.stockCapacity,powerFace.stockCapacityBreakdown.power],[20,4],'live-face-matches-model');
const powerTerms = getInspectionTerms(powerFace).terms;
expect(powerTerms['Stock Power'].includes('1 + Storehouse 1 + Workshop 2 = \u00d74'),true,'tooltip-names-summed-sources');
expect(powerTerms['Stock capacity'].startsWith('(5) \u00d7 4 Stock Power = 20'),true,'tooltip-base-times-total');
expect(serializeGameState(pool.state),beforePool,'capacity-and-reading-do-not-mutate-state-or-rng');
pool.local.structureSlots[0].construction={completedCycles:0};
expect(stockCapacity(pool.state,pool.local,pool.local.practiceSlots[0]),15,'unfinished-source-excluded');
pool.local.structureSlots=pool.local.structureSlots.map(()=>null);
expect(stockCapacity(pool.state,pool.local,pool.local.practiceSlots[0]),5,'empty-pool-is-times-one');
const gatedPower = prepared({population:0, slots:[{id:'anatomicalStudy'}],structures:[{id:'archive',origin:0,qualityBonus:0}]});
expect(stockCapacity(gatedPower.state,gatedPower.local,gatedPower.local.practiceSlots[0]),5,'specialist-gate-excludes-power');
const duplicatePower = prepared({population:4,scholars:4,slots:[{id:'toolmaking'}],structures:[{id:'academy',origin:0,qualityBonus:0},{id:'academy',origin:3,qualityBonus:0}]});
expect(stockCapacity(duplicatePower.state,duplicatePower.local,duplicatePower.local.practiceSlots[0],true),28,'every-academy-contributes-to-one-pool');
const multipliedBase = prepared({population:1,scholars:1,slots:[{id:'carpentry',tier:'silver'}],structures:[{id:'storehouse',origin:0,qualityBonus:0}]});
multipliedBase.state.gameConfig.gamepieces.practices.carpentry.scholarCapacityBonus=2;
expect(stockCapacity(multipliedBase.state,multipliedBase.local,multipliedBase.local.practiceSlots[0],true),16,'quality-and-scholar-are-inside-multiplied-base');

expect([0, 1, 2, 3].map(bonus => structureQualityMultiplier({ qualityBonus: bonus })), [1, 1.25, 1.5, 1.75], "quality-multiplier");

for (const [index, tier] of TIERS.entries()) {
  const structures = [{ id: "workshop", origin: 0, qualityBonus: 1 }, { id: "storehouse", origin: 1, qualityBonus: 1 }];
  pinCapacity(`carpentry-${tier}`, { population: 0, slots: [{ id: "carpentry", tier }], structures }, 0, (5 + index) * 6);
  pinCapacity(`carpentry-bare-${tier}`, { population: 0, slots: [{ id: "carpentry", tier }] }, 0, 5 + index);
  pinCapacity(`forage-ignores-construction-${tier}`, { population: 0, slots: [{ id: "forage", tier }], structures }, 0, 2 + index);
  pinCapacity(`anatomical-record-${tier}`, {
    population: 2, scholars: 2,
    slots: [{ id: "anatomicalStudy", tier }],
    structures: [{ id: "blackArchive", origin: 0, qualityBonus: 1 }, { id: "library", origin: 2, qualityBonus: 1 }],
  }, 0, (5 + index) * 8);
}

pinCapacity("logging-construction-not-tool", {
  population: 0,
  slots: [{ id: "logging", tier: "silver" }],
  structures: [
    { id: "workshop", origin: 0, qualityBonus: 1 },
    { id: "storehouse", origin: 1, qualityBonus: 1 },
    { id: "technicalWorkshop", origin: 2, qualityBonus: 3 },
  ],
}, 0, 42);

pinCapacity("toolmaking-tool-not-construction", {
  population: 0,
  slots: [{ id: "toolmaking", tier: "gold" }],
  structures: [
    { id: "technicalWorkshop", origin: 0, qualityBonus: 1 },
    { id: "foundry", origin: 1, qualityBonus: 3 },
    { id: "storehouse", origin: 3, qualityBonus: 3 },
  ],
}, 0, 48);

// A Gold Academy upgraded once is Diamond: base 1 + 4 = x5.
// Bronze Toolmaking base 4 reaches 20, whether naturally Knowledge-tagged or staffed.
// Two required cards cannot soak four Scholars: each practice takes one socket.
const academy = [{ id: "academy", origin: 0, qualityBonus: 1 }];
const academyStaffed = measure({
  population: 4, scholars: 4,
  slots: [{ id: "toolmaking", tier: "bronze" }],
  structures: academy,
}, 0);
expect(sockets(academyStaffed.assigned), { scholars: 1, tokens: 1, effective: 1 }, "academy-staffed-assignment");
expect(academyStaffed.capacity, 20, "academy-staffed:direct");
expect(academyStaffed.evaluation.stockCapacity, 20, "academy-staffed:evaluation");

const academyScaleOnly = measure({
  population: 4, scholars: 4,
  slots: [
    { id: "anatomicalStudy" }, { id: "alchemy" }, { id: "experimentation" }, { id: "charnelAlchemy" },
    { id: "toolmaking", tier: "bronze" },
  ],
  structures: academy,
}, 4);
expect(sockets(academyScaleOnly.assigned), { scholars: 0, tokens: 0, effective: 0 }, "academy-scale-only-assignment");
expect(sockets(assignDetailedSettlementWorkers(academyScaleOnly.fixture.state, academyScaleOnly.fixture.regionId)[0]), { scholars: 1, tokens: 1, effective: 1 }, "academy-sink-took-scholar");
expect(academyScaleOnly.capacity, 20, "academy-scale-only:direct");
expect(academyScaleOnly.evaluation.stockCapacity, 20, "academy-scale-only:evaluation");

function chargeProbe(spec) {
  const fixture = prepared(spec);
  return { ...fixture, evaluation: evaluateDetailedPracticeSlot(fixture.state, fixture.regionId, spec.focus ?? 0) };
}

const smelting = chargeProbe({
  population: 10,
  focus: 0,
  slots: [{ id: "smelting", tier: "silver" }],
  structures: [{ id: "trainingYard", origin: 0, qualityBonus: 1 }, { id: "workshop", origin: 1, qualityBonus: 3 }],
});
expect(smelting.evaluation.chargeThreshold, 2, "smelting-threshold-unreduced");
expect(smelting.evaluation.chargeGain, 2, "smelting-gain-ignores-warrior-yard");
expect(smelting.evaluation.effects[0].scaledValue.effectiveValue, 2, "smelting-output-unscaled");
expect(smelting.evaluation.effects[0].scaledValue.workerMultiplier, 1, "smelting-worker-multiplier-idle");
emitPracticeEvent(smelting.state, {
  kind: "stockGenerated", regionId: smelting.regionId, practiceId: "surfaceMining", traits: ["Ore"], tags: [], amount: 1,
});
flushPracticeEvents(smelting.state);
expect(smelting.local.practiceSlots[0].charge, 0, "smelting-discharged");
expect(smelting.local.practiceSlots[0].stock, 2, "smelting-discharge-stock-not-doubled");

// Black Archive gate 2. chargeGain 1×1.25 joins authored gain 1 → base 2.25.
// The Scholar socket is one token. pop 2 leaves no ordinary token: floor(2.25×2)=4.
// pop 12 adds floor((12-2)/10)=1 ordinary token: floor(2.25×3)=6. Threshold stays 2.
const archive = [{ id: "blackArchive", origin: 0, qualityBonus: 1 }, { id: "library", origin: 2, qualityBonus: 1 }];
const scholarOnly = chargeProbe({
  population: 2, scholars: 2, focus: 0,
  slots: [{ id: "anatomicalStudy", tier: "silver" }],
  structures: archive,
});
expect(sockets(assignDetailedSettlementWorkers(scholarOnly.state, scholarOnly.regionId)[0]), { scholars: 1, tokens: 1, effective: 1 }, "archive-scholar-only-assignment");
expect(scholarOnly.evaluation.chargeGain, 4, "archive-scholar-only-gain");
expect(scholarOnly.evaluation.chargeThreshold, 2, "archive-scholar-only-threshold");

const anatomical = chargeProbe({
  population: 12, scholars: 2, focus: 0,
  slots: [{ id: "anatomicalStudy", tier: "silver" }],
  structures: archive,
});
expect(sockets(assignDetailedSettlementWorkers(anatomical.state, anatomical.regionId)[0]), { scholars: 1, tokens: 2, effective: 2 }, "archive-plus-worker-assignment");
expect(anatomical.evaluation.chargeThreshold, 2, "anatomical-threshold-stays-authored");
expect(anatomical.evaluation.chargeGain, 6, "anatomical-worker-and-archive-gain");
expect(anatomical.evaluation.effects.map(effect => effect.scaledValue.effectiveValue), [2, 2], "anatomical-discharge-not-worker-scaled");
expect(anatomical.evaluation.stockCapacity, 48, "anatomical-silver-record-capacity");

const before = serializeGameState(anatomical.state);
const timeline = createTimelineFromInitialState(anatomical.state);
const rebuilt = rebuildStateAtSecond(timeline, anatomical.state.tSec);
expect(rebuilt.ok, true, "timeline-rebuild-ok");
expect(serializeGameState(rebuilt.state), before, "timeline-matches-authored-fixture");

emitPracticeEvent(anatomical.state, {
  kind: "stockGenerated", regionId: anatomical.regionId, practiceId: "herbalism",
  traits: ["Bone"], tags: ["Knowledge"], amount: 1,
});
const pending = serializeGameState(anatomical.state);
const continued = deserializeGameState(JSON.parse(JSON.stringify(pending)));
flushPracticeEvents(anatomical.state);
flushPracticeEvents(continued);
const after = serializeGameState(anatomical.state);
expect(serializeGameState(continued), after, "pending-continuation-full-state");
expect(serializeGameState(deserializeGameState(JSON.parse(JSON.stringify(after)))), after, "post-flush-json-roundtrip");
expect(anatomical.local.practiceSlots[0].charge, 0, "anatomical-meter-reset");
expect(anatomical.local.practiceSlots[0].stock, 2, "anatomical-discharge-stock");
expect(anatomical.state.civilization.research.total, beforeResearch(before) + 2, "anatomical-research");
expect(anatomical.state.rng, before.rng, "rng-unchanged");
} catch (error) {
  failures.push({ name: "unexpected", path: "$", actual: preview(error?.stack ?? String(error)), expected: "no throw", repro: REPRO });
}

function beforeResearch(serialized) {
  return serialized.civilization.research.total;
}

if (failures.length) {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const file = path.join(ARTIFACT_DIR, "failures.json");
  fs.writeFileSync(file, JSON.stringify({ repro: REPRO, failures }, null, 2));
  for (const failure of failures) {
    console.error(`${failure.name} ${failure.path} actual=${failure.actual} expected=${failure.expected}`);
  }
  console.error(`${failures.length} failed; ${file}`);
  process.exit(1);
}
console.log("[quality-modifier-interactions] tier, scholar, quality-ranked Stock Power, charge clamps, json continuation ok");
