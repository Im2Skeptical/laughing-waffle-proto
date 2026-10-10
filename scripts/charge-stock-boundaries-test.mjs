import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { detailedSettlementPracticeDefs as practices } from '../src/defs/gamepieces/detailed-settlement-defs.js';
import { createLabFixture, practiceSlot, fiveSlots, setFixturePopulation } from '../src/model/dev-lab/fixtures.js';
import { getDetailedSettlementSites } from '../src/model/detailed-settlements/queries.js';
import { emitPracticeEvent } from '../src/model/detailed-settlements/practice-events.js';
import { flushPracticeEvents } from '../src/model/detailed-settlements/practices.js';
import { generateStock } from '../src/model/detailed-settlements/stock.js';
import { serializeGameState, deserializeGameState } from '../src/model/state.js';

// Literal expectations follow current card rules and the executable content table,
// independently of effects.amount. The workbook is the historical import record.
const source = JSON.parse(readFileSync(new URL('../docs/civcontent-2.6-source.json', import.meta.url), 'utf8'));
const named = (text) => {
  const sentence = String(text ?? '').match(/Generate (\d+) Stock/);
  const column = String(text ?? '').match(/(?:On Discharge: \+|^\+)(\d+)/);
  return sentence ? Number(sentence[1]) : column ? Number(column[1]) : null;
};

// Matching events name a real producer. That producer is not installed.
const CASES = [
  ['charcoalBurning', 'logging', { kind: 'stockGenerated', practiceId: 'surfaceMining', traits: ['Ore'] }, 3],
  ['smelting', 'surfaceMining', { kind: 'stockGenerated', practiceId: 'logging', traits: ['Timber'] }, 2],
  ['toolmaking', 'smelting', { kind: 'stockGenerated', practiceId: 'surfaceMining', traits: ['Ore'] }, 2],
  ['carpentry', 'logging', { kind: 'stockGenerated', practiceId: 'surfaceMining', traits: ['Ore'] }, 2],
  ['milling', 'dryFarming', { kind: 'stockGenerated', practiceId: 'logging', traits: ['Timber'] }, 3],
  ['copyingTexts', 'recordKeeping', { kind: 'stockGenerated', practiceId: 'logging', traits: ['Timber'] }, 3],
  ['borderSkirmishing', null, { kind: 'stockGenerated', practiceId: 'logging', traits: ['Timber'] }, 1],
];

function board(id) {
  const state = createLabFixture('charge');
  for (const site of getDetailedSettlementSites(state)) site.detailedState.practiceSlots = fiveSlots();
  const site = getDetailedSettlementSites(state, { playerOnly: true })[0];
  const local = site.detailedState;
  local.practiceSlots = fiveSlots(practiceSlot(id));
  local.structureSlots.fill(null);
  setFixturePopulation(local, 0);
  return { state, local, region: site.regionId, slot: local.practiceSlots[0] };
}

function fire(f, event) {
  emitPracticeEvent(f.state, { regionId: f.region, ...event });
  flushPracticeEvents(f.state);
}

function producerEvent(id) {
  if (!id) return { kind: 'defenseSucceeded' };
  const def = practices[id];
  return { kind: 'stockGenerated', practiceId: id, traits: [...def.stockTraits], tags: [...def.tags] };
}

function withProducerTags(event) {
  return { ...event, tags: [...practices[event.practiceId].tags] };
}

const results = [];
const failures = [];
for (const [id, producerId, miss, expectedStock] of CASES) {
  const def = practices[id];
  const row = source.entries.find((entry) => entry.id === id);
  const prose = named(def.charge.dischargeText);
  const workbook = named(row.fields['Discharge Effect']);
  const column = named(row.fields['Generates Stock']);
  const record = {
    id,
    dischargeText: def.charge.dischargeText,
    uiRule: def.ui.rule,
    workbookDischarge: row.fields['Discharge Effect'],
    generatesStock: row.fields['Generates Stock'],
    prose, workbook, column,
    effectAmount: def.effects.find((effect) => effect.op === 'generateStock').amount,
    capacity: def.stockCapacity,
    anotherPractice: Boolean(def.charge.trigger.anotherPractice),
  };
  try {
    assert.equal(prose, expectedStock, `${id} card text vs current rule`);
    assert.equal(named(def.ui.rule), expectedStock, `${id} rule text vs current rule`);
    // Border Skirmishing has always executed +1 in the documented effect table.
    // Its old workbook +2 remains historical; current card text now matches +1.
    assert.equal(workbook, id === 'borderSkirmishing' ? 2 : expectedStock, `${id} workbook record`);
    assert.equal(column, id === 'borderSkirmishing' ? 2 : expectedStock, `${id} workbook Stock column`);
    const f = board(id);
    const capacityBefore = def.stockCapacity;
    fire(f, withProducerTags(miss));
    assert.equal(f.slot.charge, 0, `${id} unrelated event`);
    assert.equal(f.slot.stock, 0, `${id} unrelated event adds no stock`);
    if (def.charge.gain < def.charge.threshold) {
      fire(f, producerEvent(producerId));
      assert.equal(f.slot.charge, def.charge.gain, `${id} population 0 uses base Charge gain`);
      assert.equal(f.slot.stock, 0, `${id} partial meter does not discharge`);
    }
    f.slot.charge = def.charge.threshold - 1;
    fire(f, withProducerTags(miss));
    assert.equal(f.slot.charge, def.charge.threshold - 1, `${id} near-full ignores unrelated event`);
    fire(f, producerEvent(producerId));
    record.runtimeStock = f.slot.stock;
    assert.equal(f.slot.stock, expectedStock, `${id} discharge stock follows current rule`);
    assert.equal(f.slot.charge, 0, `${id} discharge resets Charge`);
    assert.equal(def.stockCapacity, capacityBefore, `${id} capacity definition unchanged`);
    assert.deepEqual(def.consume, []);
    assert.deepEqual(def.require, []);
    if (def.charge.trigger.anotherPractice) {
      const self = board(id);
      const added = generateStock(self.state, self.local, self.slot, 1);
      flushPracticeEvents(self.state);
      assert.equal(added, 1, `${id} own output is accepted`);
      assert.equal(self.slot.charge, 0, `${id} anotherPractice excludes own production`);
      assert.equal(self.slot.stock, 1, `${id} own output is not a Discharge`);
    }
    const pending = board(id);
    pending.slot.charge = def.charge.threshold - 1;
    emitPracticeEvent(pending.state, { regionId: pending.region, ...producerEvent(producerId) });
    const restored = deserializeGameState(serializeGameState(pending.state));
    assert.ok(JSON.stringify(serializeGameState(pending.state)) === JSON.stringify(serializeGameState(restored)), `${id} pending-event JSON round trip`);
    flushPracticeEvents(pending.state);
    flushPracticeEvents(restored);
    assert.ok(JSON.stringify(serializeGameState(pending.state)) === JSON.stringify(serializeGameState(restored)), `${id} deserialize continues the same discharge`);
    const restoredSlot = getDetailedSettlementSites(restored, { playerOnly: true })[0].detailedState.practiceSlots[0];
    assert.equal(restoredSlot.stock, expectedStock, `${id} restored discharge stock`);
    assert.equal(restoredSlot.charge, 0, `${id} restored Charge reset`);
    record.ok = true;
  } catch (error) {
    record.ok = false;
    record.error = error.message;
    record.runtimeStock = record.runtimeStock ?? null;
    failures.push(id);
  }
  results.push(record);
}

const note = [
  'Border Skirmishing executes +1 Stock, as docs/civcontent-2.6-implementation.md records.',
  'Current dischargeText and ui.rule match +1; the historical workbook +2 is preserved.',
  'These tests inject events at the real resolver seam; they do not test event emission by gameplay.',
].join(' ');

mkdirSync(new URL('../artifacts/', import.meta.url), { recursive: true });
writeFileSync(new URL('../artifacts/charge-stock-boundaries.json', import.meta.url), JSON.stringify({ results, note }, null, 2));
if (failures.length) {
  console.error(`[charge-stock-boundaries] failed ${failures.join(',')}`);
  for (const row of results.filter((row) => !row.ok)) console.error(`${row.id}: prose ${row.prose}, effect ${row.effectAmount}; ${row.error}`);
  process.exit(1);
}
console.log(`[charge-stock-boundaries] ${results.map((row) => row.id).join(',')} match authored discharge prose`);
