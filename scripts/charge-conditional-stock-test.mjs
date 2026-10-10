import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { detailedSettlementPracticeDefs as practices } from '../src/defs/gamepieces/detailed-settlement-defs.js';
import { createLabFixture, practiceSlot, fiveSlots, setFixturePopulation } from '../src/model/dev-lab/fixtures.js';
import { getDetailedSettlementSites } from '../src/model/detailed-settlements/queries.js';
import { adjacentRegionIds } from '../src/model/detailed-settlements/external-world.js';
import { emitPracticeEvent } from '../src/model/detailed-settlements/practice-events.js';
import { flushPracticeEvents } from '../src/model/detailed-settlements/practices.js';
import { serializeGameState, deserializeGameState } from '../src/model/state.js';

// Pin documented quantities independently of the executable effects.
const STOCK = 2;
const SIDE = {
  alchemy: { research: 0, chaos: 8, preview: 0, warriorBank: 0 },
  anatomicalStudy: { research: 2, chaos: 0, preview: 0, warriorBank: 0 },
  plagueLedger: { research: 0, chaos: 0, preview: 1, warriorBank: 0 },
  heresiography: { research: 3, chaos: 0, preview: 0, warriorBank: 0 },
  charnelAlchemy: { research: 2, chaos: 15, preview: 0, warriorBank: 0 },
  watchkeeping: { research: 0, chaos: 0, preview: 1, warriorBank: 0 },
  sagaKeeping: { research: 0, chaos: 0, preview: 0, warriorBank: 2 },
  caravanGuarding: { research: 0, chaos: 0, preview: 0, warriorBank: 0 },
};
const GATE = {
  alchemy: 'scholar', anatomicalStudy: 'scholar', charnelAlchemy: 'scholar',
  sagaKeeping: 'warrior', caravanGuarding: 'support',
};

function board(id) {
  const state = createLabFixture('charge');
  for (const site of getDetailedSettlementSites(state)) site.detailedState.practiceSlots = fiveSlots();
  const site = getDetailedSettlementSites(state, { playerOnly: true })[0];
  const local = site.detailedState;
  local.practiceSlots = fiveSlots(practiceSlot(id));
  local.structureSlots.fill(null);
  setFixturePopulation(local, 0);
  const near = adjacentRegionIds(state, site.regionId);
  const far = state.world.sites.map((entry) => entry.regionId).find((regionId) => regionId !== site.regionId && !near.includes(regionId));
  if (!near.length || !far) throw new Error(`${id}: fixture has no real adjacent/far region`);
  return { state, local, region: site.regionId, slot: local.practiceSlots[0], near: near[0], far };
}

function fire(f, event) {
  emitPracticeEvent(f.state, { regionId: f.region, ...event });
  flushPracticeEvents(f.state);
}

function legalize(f, gate) {
  if (gate === 'scholar') setFixturePopulation(f.local, 1, 1, 0);
  else if (gate === 'warrior') setFixturePopulation(f.local, 1, 0, 1);
  else if (gate === 'support') setFixturePopulation(f.local, 5, 0, 5);
}

function insufficient(f, gate) {
  if (gate === 'scholar') setFixturePopulation(f.local, 1, 0, 1);
  else if (gate === 'warrior') setFixturePopulation(f.local, 1, 1, 0);
  else if (gate === 'support') setFixturePopulation(f.local, 4, 0, 4);
}

function snap(f) {
  return {
    research: f.state.civilization.research.total,
    chaos: f.state.civilization.chaos.chaosPower,
    preview: f.local.previewBonus ?? 0,
    warriorBank: f.state.civilization.candidateDevelopment?.warrior ?? 0,
  };
}

function proseStock(text) {
  const found = String(text ?? '').match(/Generate (\d+) Stock/);
  return found ? Number(found[1]) : null;
}

function events(id, f) {
  const glass = { kind: 'stockConsumed', practiceId: 'glassmaking', traits: ['Glass'], tags: ['Knowledge'] };
  const timber = { kind: 'stockConsumed', practiceId: 'glassmaking', traits: ['Timber'], tags: ['Knowledge'] };
  const bone = { kind: 'stockGenerated', practiceId: 'ossuaryKeeping', traits: ['Bone'], tags: ['Ancestral'] };
  const table = {
    alchemy: {
      miss: timber,
      hit: glass,
      own: { kind: 'stockConsumed', practiceId: id, traits: ['Medicine'], tags: ['Knowledge'] },
    },
    anatomicalStudy: {
      miss: { kind: 'stockGenerated', practiceId: 'logging', traits: ['Timber'], tags: ['Material'] },
      hit: { kind: 'populationDied' },
      own: { kind: 'stockGenerated', practiceId: id, traits: ['Bone'], tags: ['Ancestral'] },
    },
    plagueLedger: { miss: { kind: 'populationDied' }, hit: { kind: 'populationDied', premature: true } },
    heresiography: {
      miss: { kind: 'monsterPressure', regionId: f.far },
      hit: { kind: 'chaosIncreased', regionId: f.far, amount: 1 },
      also: { kind: 'monsterPressure', regionId: f.near },
    },
    charnelAlchemy: {
      miss: { kind: 'stockGenerated', practiceId: 'logging', traits: ['Timber'], tags: ['Material'] },
      hit: bone,
      own: { kind: 'stockGenerated', practiceId: id, traits: ['Medicine'], tags: ['Knowledge'] },
    },
    watchkeeping: {
      miss: { kind: 'monsterPressure', regionId: f.far },
      hit: { kind: 'monsterPressure', regionId: f.near },
      also: { kind: 'monsterPressure' },
    },
    sagaKeeping: {
      miss: { kind: 'dangerSurvived', classId: 'scholar' },
      hit: { kind: 'campaignWon', classId: 'warrior' },
      also: { kind: 'dangerSurvived', classId: 'warrior', regionId: f.far },
    },
    caravanGuarding: {
      miss: { kind: 'externalTrade', regionId: f.far },
      hit: { kind: 'externalTrade' },
    },
  };
  return table[id];
}

function expectEqual(errors, actual, expected, field) {
  if (actual !== expected) errors.push(`${field}: expected ${JSON.stringify(expected)}, actual ${JSON.stringify(actual)}`);
}

function expectSides(errors, before, after, expected, field) {
  for (const key of Object.keys(expected)) {
    expectEqual(errors, Math.round((after[key] - before[key]) * 100) / 100, expected[key], `${field}.${key}`);
  }
}

function runCard(id) {
  const def = practices[id];
  const errors = [];
  const record = {
    id, dischargeText: def.charge.dischargeText, uiRule: def.ui.rule,
    proseStock: proseStock(def.charge.dischargeText),
    ruleStock: proseStock(def.ui.rule),
    effectStock: def.effects.find((effect) => effect.op === 'generateStock')?.amount ?? null,
    effects: def.effects, gate: GATE[id] ?? null, errors,
  };
  expectEqual(errors, record.proseStock, STOCK, 'dischargeText Generate Stock');
  expectEqual(errors, record.ruleStock, STOCK, 'ui.rule Generate Stock');
  expectEqual(errors, def.consume.length, 0, 'consume.length');
  expectEqual(errors, def.require.length, 0, 'require.length');
  const spec = events(id, board(id));
  if (spec.own) {
    const own = board(id);
    const excluded = def.charge.trigger.anotherPractice === true;
    fire(own, spec.own);
    expectEqual(errors, own.slot.charge, excluded ? 0 : def.charge.gain, excluded ? 'anotherPractice own event charge' : 'permitted own-source charge');
    expectEqual(errors, own.slot.stock, 0, 'own-source stock');
  }
  const f = board(id);
  fire(f, spec.miss);
  expectEqual(errors, f.slot.charge, 0, 'unrelated charge');
  expectEqual(errors, f.slot.stock, 0, 'unrelated stock');
  if (spec.also && id === 'sagaKeeping') {
    fire(f, spec.also);
    expectEqual(errors, f.slot.charge, 0, 'far warrior event charge');
  }
  fire(f, spec.hit);
  expectEqual(errors, f.slot.charge, def.charge.gain, 'matching base charge gain');
  expectEqual(errors, f.slot.stock, 0, 'partial meter stock');
  f.slot.charge = def.charge.threshold - 1;
  fire(f, spec.miss);
  expectEqual(errors, f.slot.charge, def.charge.threshold - 1, 'near-full unrelated charge');
  const before = snap(f);
  const dischargeEvent = spec.also && id !== 'sagaKeeping' ? spec.also : spec.hit;
  fire(f, dischargeEvent);
  if (GATE[id]) {
    expectEqual(errors, f.slot.charge, def.charge.threshold, 'blocked gate retains full meter');
    expectEqual(errors, f.slot.stock, 0, 'blocked gate stock');
    expectSides(errors, before, snap(f), { research: 0, chaos: 0, preview: 0, warriorBank: 0 }, 'blocked gate');
    insufficient(f, GATE[id]);
    const still = snap(f);
    fire(f, spec.hit);
    expectEqual(errors, f.slot.charge, def.charge.threshold, 'wrong population retains full meter');
    expectEqual(errors, f.slot.stock, 0, 'wrong population stock');
    expectSides(errors, still, snap(f), { research: 0, chaos: 0, preview: 0, warriorBank: 0 }, 'wrong population');
    legalize(f, GATE[id]);
    const open = snap(f);
    fire(f, spec.hit);
    expectEqual(errors, f.slot.stock, STOCK, 'legal discharge stock');
    expectEqual(errors, f.slot.charge, 0, 'legal discharge resets charge');
    expectSides(errors, open, snap(f), SIDE[id], 'legal discharge');
    record.runtime = { stock: f.slot.stock, ...snap(f), deltaFrom: open };
  } else {
    expectEqual(errors, f.slot.stock, STOCK, 'discharge stock');
    expectEqual(errors, f.slot.charge, 0, 'discharge resets charge');
    expectSides(errors, before, snap(f), SIDE[id], 'discharge');
    record.runtime = { stock: f.slot.stock, ...snap(f), deltaFrom: before };
  }
  const pending = board(id);
  if (GATE[id]) legalize(pending, GATE[id]);
  pending.slot.charge = def.charge.threshold - 1;
  emitPracticeEvent(pending.state, { regionId: pending.region, ...spec.hit });
  const restored = deserializeGameState(serializeGameState(pending.state));
  const samePending = JSON.stringify(serializeGameState(pending.state)) === JSON.stringify(serializeGameState(restored));
  if (!samePending) errors.push('pending-event JSON round trip: serialized states differ');
  flushPracticeEvents(pending.state);
  flushPracticeEvents(restored);
  const sameAfter = JSON.stringify(serializeGameState(pending.state)) === JSON.stringify(serializeGameState(restored));
  if (!sameAfter) errors.push('deserialize continuation: serialized states differ');
  const restoredSlot = getDetailedSettlementSites(restored, { playerOnly: true })[0].detailedState.practiceSlots[0];
  expectEqual(errors, restoredSlot.stock, STOCK, 'restored discharge stock');
  expectEqual(errors, restoredSlot.charge, 0, 'restored charge reset');
  record.ok = errors.length === 0;
  return record;
}

const results = Object.keys(SIDE).map(runCard);
const failures = results.filter((row) => !row.ok);
const note = [
  'Events are injected at emitPracticeEvent. Gameplay emitters are not covered.',
  'Stock, Research, Chaos, preview, and candidate bank amounts are independent literal expectations.',
  'Own-source exclusion applies only when charge.trigger.anotherPractice is true. Anatomical Study permits its own Bone event.',
  'Scholar cards reject a Warrior and accept one Scholar. Saga Keeping rejects a Scholar and accepts one Warrior. Caravan Guarding rejects four Warriors and accepts five.',
].join(' ');
mkdirSync(new URL('../artifacts/', import.meta.url), { recursive: true });
writeFileSync(new URL('../artifacts/charge-conditional-stock.json', import.meta.url), JSON.stringify({ results, note }, null, 2));
if (failures.length) {
  console.error(`[charge-conditional-stock] failed ${failures.map((row) => row.id).join(',')}`);
  for (const row of failures) console.error(`${row.id}: ${row.errors.join(' | ')}`);
  process.exit(1);
}
console.log(`[charge-conditional-stock] ${results.map((row) => row.id).join(',')} match prose and effect table`);
assert.equal(results.length, 8);
