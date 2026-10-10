import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { detailedSettlementPracticeDefs as practices } from '../src/defs/gamepieces/detailed-settlement-defs.js';
import { createLabFixture, practiceSlot, fiveSlots, setFixturePopulation } from '../src/model/dev-lab/fixtures.js';
import { getDetailedSettlementSites } from '../src/model/detailed-settlements/queries.js';
import { emitPracticeEvent } from '../src/model/detailed-settlements/practice-events.js';
import { flushPracticeEvents, evaluateDetailedPracticeSlot } from '../src/model/detailed-settlements/practices.js';
import { specialistCount } from '../src/model/detailed-settlements/stock.js';
import { serializeGameState, deserializeGameState } from '../src/model/state.js';
import { getConnectedRegionIds, addWorldConnection, getRegionState } from '../src/model/world-state.js';

// Amounts are the current card sentences plus docs/civcontent-2.6-implementation.md.
// Literal expectations remain independent of executable effect amounts.
// Teaching's row trains 1 Scholar; the card hook doubles that when a Scholar staffs it.
// These numbers are not read from effects.amount.
const EXPECTED = {
  teaching: { research: 2, scholars: 1 },
  teachingStaffed: { research: 2, scholars: 2 },
  examinationCoaching: { scholarBank: 1 },
  experimentation: { research: 3, shop: 1, chaos: 10 },
  formationTraining: { formation: 2 },
  veteranInstruction: { warriorBank: 1 },
  feastingTheHost: { warriors: 1, warriorBank: 1 },
  tournaments: { warriorBank: 1 },
  warCouncil: { coordination: 1 },
  greatHost: { greatHost: 2 },
};

const MATCH = {
  teaching: { kind: 'stockGenerated', practiceId: 'recordKeeping', traits: ['Record'], tags: ['Knowledge'] },
  examinationCoaching: { kind: 'stockGenerated', practiceId: 'recordKeeping', traits: ['Record'], scholarStaffed: true },
  experimentation: { kind: 'stockConsumed', practiceId: 'scholarship', traits: ['Record'], tags: ['Knowledge'] },
  formationTraining: { kind: 'stockConsumed', practiceId: 'weaponsmithing', traits: ['Arms'], pool: 'warrior' },
  veteranInstruction: { kind: 'dangerSurvived', classId: 'warrior', martial: true },
  feastingTheHost: { kind: 'stockGenerated', practiceId: 'raidingParties', traits: ['Loot'] },
  tournaments: { kind: 'challengeCompleted', classId: 'warrior' },
  warCouncil: { kind: 'supportContributed', actionKind: 'campaign' },
  greatHost: { kind: 'martialActionResolved', sourceRegionIds: ['local', 'neighbor'] },
};
const MISS = {
  teaching: { kind: 'stockGenerated', practiceId: 'logging', traits: ['Timber'], tags: ['Timber'] },
  examinationCoaching: { kind: 'stockGenerated', practiceId: 'recordKeeping', traits: ['Record'] },
  experimentation: { kind: 'stockConsumed', practiceId: 'logging', traits: ['Timber'], tags: ['Timber'] },
  formationTraining: { kind: 'stockConsumed', practiceId: 'scholarship', traits: ['Arms'], pool: 'scholar' },
  veteranInstruction: { kind: 'dangerSurvived', classId: 'scholar', martial: true },
  feastingTheHost: { kind: 'stockGenerated', practiceId: 'logging', traits: ['Timber'] },
  tournaments: { kind: 'challengeCompleted', classId: 'scholar' },
  warCouncil: { kind: 'supportContributed', actionKind: 'raid' },
  greatHost: { kind: 'martialActionResolved', sourceRegionIds: ['local'] },
};

const READY = {
  teaching: [1, 0, 0],
  examinationCoaching: [1, 1, 0],
  experimentation: [1, 1, 0],
  formationTraining: [0, 0, 0],
  veteranInstruction: [1, 0, 1],
  feastingTheHost: [2, 0, 1],
  tournaments: [1, 0, 1],
  warCouncil: [0, 0, 0],
  greatHost: [20, 0, 20],
};

function board(id, population = 0, scholars = 0, warriors = 0) {
  const state = createLabFixture('charge');
  for (const site of getDetailedSettlementSites(state)) {
    site.detailedState.practiceSlots = fiveSlots();
    site.detailedState.structureSlots.fill(null);
    setFixturePopulation(site.detailedState, 0);
  }
  const site = getDetailedSettlementSites(state, { playerOnly: true })[0];
  const local = site.detailedState;
  local.practiceSlots = fiveSlots(practiceSlot(id));
  setFixturePopulation(local, population, scholars, warriors);
  return { state, local, region: site.regionId, slot: local.practiceSlots[0] };
}

function playerNeighbor(state, regionId) {
  return getDetailedSettlementSites(state, { playerOnly: true }).find((site) => site.regionId !== regionId) ?? null;
}

function connectNeighbor(f) {
  const neighbor = playerNeighbor(f.state, f.region);
  assert.ok(neighbor, 'greatHost needs a second player settlement');
  if (!getConnectedRegionIds(f.state, f.region).includes(neighbor.regionId)) {
    const linked = addWorldConnection(f.state, f.region, neighbor.regionId);
    assert.equal(linked.ok, true, `greatHost connection ${linked.reason ?? ''}`);
  }
  assert.equal(getRegionState(f.state, neighbor.regionId).controller, 'player');
  setFixturePopulation(neighbor.detailedState, 1, 0, 1);
  f.neighbor = neighbor.regionId;
  return f;
}

function resolveEvent(f, event) {
  const copy = { ...event };
  if (copy.sourceRegionIds) {
    copy.sourceRegionIds = copy.sourceRegionIds.map((id) => (id === 'local' ? f.region : id === 'neighbor' ? f.neighbor : id));
  }
  if (copy.regionId === 'neighbor') copy.regionId = f.neighbor;
  return copy;
}

function fire(f, event) {
  emitPracticeEvent(f.state, { regionId: f.region, ...resolveEvent(f, event) });
  flushPracticeEvents(f.state);
}

function readBanks(f) {
  const development = f.state.civilization.candidateDevelopment ?? {};
  const support = f.local.supportBank ?? {};
  return {
    research: f.state.civilization.research.total,
    chaos: f.state.civilization.chaos.chaosPower,
    scholarBank: development.scholar ?? 0,
    warriorBank: development.warrior ?? 0,
    shop: f.local.shopQualityBonus ?? 0,
    formation: support.formation ?? 0,
    coordination: support.coordination ?? 0,
    greatHost: support.greatHost ?? 0,
    scholars: specialistCount(f.local, 'scholar'),
    warriors: specialistCount(f.local, 'warrior'),
    charge: f.slot.charge ?? 0,
    stock: f.slot.stock ?? 0,
  };
}

function assertDelta(before, after, expected, label) {
  const fields = ['research', 'chaos', 'scholarBank', 'warriorBank', 'shop', 'formation', 'coordination', 'greatHost', 'scholars', 'warriors'];
  for (const field of fields) {
    const delta = (expected[field] ?? 0);
    assert.equal(after[field] - before[field], delta, `${label} ${field}`);
  }
  assert.equal(after.stock, before.stock, `${label} stock`);
}

function assertDischarge(f, before, expected, label) {
  const after = readBanks(f);
  assertDelta(before, after, expected, label);
  assert.equal(after.charge, 0, `${label} charge reset`);
  const discharged = f.state.civilization.practiceEvents.trace.filter((event) => event.kind === 'discharged' && event.targetPracticeId === f.slot.practiceId);
  assert.equal(discharged.length, 1, `${label} one discharge`);
  assert.deepEqual(discharged[0].providers, [], `${label} no stock providers`);
}

const results = [];
const failures = [];

function run(id, fn) {
  const record = { id };
  try {
    fn(record);
    record.ok = true;
  } catch (error) {
    record.ok = false;
    record.error = error.stack ?? error.message;
    failures.push(id);
  }
  results.push(record);
}

for (const id of Object.keys(MATCH)) {
  run(id, () => {
    const def = practices[id];
    assert.equal(def.charge.gain, 1, `${id} base gain`);
    assert.deepEqual(def.consume, [], `${id} consume`);
    assert.deepEqual(def.require, [], `${id} require`);
    const [population, scholars, warriors] = READY[id];
    const open = (extra) => {
      const f = board(id, population, scholars, warriors);
      if (id === 'greatHost') connectNeighbor(f);
      if (extra) extra(f);
      return f;
    };
    const near = open();
    near.slot.charge = def.charge.threshold - 1;
    const nearBefore = readBanks(near);
    fire(near, MISS[id]);
    assert.equal(near.slot.charge, def.charge.threshold - 1, `${id} near-full ignores unrelated event`);
    assertDelta(nearBefore, readBanks(near), {}, `${id} unrelated`);
    fire(near, MATCH[id]);
    assertDischarge(near, nearBefore, EXPECTED[id], `${id} near-full`);
    const full = open();
    full.slot.charge = def.charge.threshold;
    const fullBefore = readBanks(full);
    fire(full, MATCH[id]);
    assertDischarge(full, fullBefore, EXPECTED[id], `${id} full`);
    if (id === 'teaching') {
      const staffed = board(id, 3, 1, 0);
      staffed.slot.charge = def.charge.threshold;
      const staffedBefore = readBanks(staffed);
      fire(staffed, MATCH[id]);
      assertDischarge(staffed, staffedBefore, EXPECTED.teachingStaffed, 'teaching scholar-staffed');
      const self = board(id, 1, 0, 0);
      fire(self, { ...MATCH[id], practiceId: 'teaching' });
      assert.equal(self.slot.charge, 0, 'teaching ignores its own Record output');
    }
    if (id === 'warCouncil') {
      const remote = open();
      const neighbor = playerNeighbor(remote.state, remote.region);
      assert.ok(neighbor, 'warCouncil needs a second player settlement');
      remote.neighbor = neighbor.regionId;
      remote.slot.charge = def.charge.threshold - 1;
      const remoteBefore = readBanks(remote);
      fire(remote, { ...MISS[id], regionId: 'neighbor' });
      assert.equal(remote.slot.charge, def.charge.threshold - 1, 'warCouncil ignores an unrelated neighbor event');
      assert.ok(getConnectedRegionIds(remote.state, remote.region).includes(neighbor.regionId), 'warCouncil neighbor is connected');
      fire(remote, { ...MATCH[id], regionId: 'neighbor' });
      assertDischarge(remote, remoteBefore, EXPECTED.warCouncil, 'warCouncil connected campaign');
    }
  });
}

const BLOCKED = [
  ['examinationCoaching', [0, 0, 0], [1, 1, 0], 'State / population requirements not satisfied'],
  ['experimentation', [0, 0, 0], [1, 1, 0], 'Requires a Scholar worker'],
  ['veteranInstruction', [0, 0, 0], [1, 0, 1], 'State / population requirements not satisfied'],
  ['feastingTheHost', [0, 0, 0], [2, 0, 1], 'State / population requirements not satisfied'],
  ['tournaments', [0, 0, 0], [1, 0, 1], 'State / population requirements not satisfied'],
];
for (const [id, unmet, met, reason] of BLOCKED) {
  run(`${id}:blocked`, () => {
    const f = board(id, ...unmet);
    f.slot.charge = practices[id].charge.threshold;
    const before = readBanks(f);
    fire(f, MATCH[id]);
    assert.equal(f.slot.charge, practices[id].charge.threshold, `${id} blocked full meter retains Charge`);
    assertDelta(before, readBanks(f), {}, `${id} blocked`);
    const evaluation = evaluateDetailedPracticeSlot(f.state, f.region, 0);
    assert.equal(evaluation.blocked, true, `${id} blocked flag`);
    assert.equal(evaluation.blockedReason, reason, `${id} blockedReason`);
    setFixturePopulation(f.local, ...met);
    const repaired = readBanks(f);
    fire(f, MATCH[id]);
    assertDischarge(f, repaired, EXPECTED[id], `${id} condition repaired`);
  });
}

run('greatHost:blocked', () => {
  const short = board('greatHost', 19, 0, 19);
  connectNeighbor(short);
  short.slot.charge = 3;
  const shortBefore = readBanks(short);
  fire(short, MATCH.greatHost);
  assert.equal(short.slot.charge, 3, 'greatHost full meter with 19 Warriors retains Charge');
  assertDelta(shortBefore, readBanks(short), {}, 'greatHost below 20');
  const f = board('greatHost', 20, 0, 20);
  f.slot.charge = 3;
  const before = readBanks(f);
  fire(f, { kind: 'martialActionResolved', sourceRegionIds: [f.region, 'other-region'] });
  assert.equal(f.slot.charge, 3, 'greatHost full meter without a connected Warrior settlement retains Charge');
  assertDelta(before, readBanks(f), {}, 'greatHost blocked network');
  assert.equal(evaluateDetailedPracticeSlot(f.state, f.region, 0).blockedReason, 'State / population requirements not satisfied');
  connectNeighbor(f);
  const armed = readBanks(f);
  fire(f, MATCH.greatHost);
  assertDischarge(f, armed, EXPECTED.greatHost, 'greatHost network repaired');
});

function pending(id, prepare) {
  run(`${id}:pending`, () => {
    const f = board(id, ...READY[id]);
    if (prepare) prepare(f);
    f.slot.charge = practices[id].charge.threshold - 1;
    emitPracticeEvent(f.state, { regionId: f.region, ...resolveEvent(f, MATCH[id]) });
    const restored = deserializeGameState(serializeGameState(f.state));
    assert.ok(JSON.stringify(serializeGameState(f.state)) === JSON.stringify(serializeGameState(restored)), `${id} pending serialized equality`);
    flushPracticeEvents(f.state);
    flushPracticeEvents(restored);
    assert.ok(JSON.stringify(serializeGameState(f.state)) === JSON.stringify(serializeGameState(restored)), `${id} continuation serialized equality`);
    const slot = getDetailedSettlementSites(restored, { playerOnly: true })[0].detailedState.practiceSlots[0];
    assert.equal(slot.charge, 0, `${id} restored charge reset`);
  });
}
pending('teaching');
pending('formationTraining');
pending('greatHost', connectNeighbor);

mkdirSync(new URL('../artifacts/', import.meta.url), { recursive: true });
writeFileSync(new URL('../artifacts/charge-bank-boundaries.json', import.meta.url), JSON.stringify({
  command: 'node scripts/charge-bank-boundaries-test.mjs',
  expected: EXPECTED,
  results,
}, null, 2));
if (failures.length) {
  console.error(`[charge-bank-boundaries] failed ${failures.join(',')}`);
  for (const row of results.filter((row) => !row.ok)) console.error(`${row.id}: ${row.error.split('\n')[0]} artifact=artifacts/charge-bank-boundaries.json`);
  process.exit(1);
}
console.log(`[charge-bank-boundaries] ${results.map((row) => row.id).join(',')} `);
