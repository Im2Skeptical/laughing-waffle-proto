// Impact: test-only. No schema, RNG stream, serializer, tick rule, or view change.
// tSec moves only through advanceReplayStateToSecond / advanceReplayStateOneSecond.
// Oracles: pre-step journal, one official tick's post-step journal, Bowmaking/Food
// card rows, and the immediately previous second. Raw compares; no canonicalize.

import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createNewGameState } from '../src/model/new-game.js';
import { deserializeGameState, serializeGameState } from '../src/model/state.js';
import { getDetailedSettlementSites } from '../src/model/detailed-settlements/queries.js';
import { practiceSlot, fiveSlots, setFixturePopulation } from '../src/model/dev-lab/fixtures.js';
import { advanceReplayStateOneSecond, advanceReplayStateToSecond } from '../src/model/replay-second-runner.js';
import { buildEdgeTransferBatchAtBoundary } from '../src/model/edge-transfers.js';

const ARTIFACT = 'artifacts/grok-oct24/packet-isolation.json';
const BOW = [
  ['require', ['Tool'], 1, 'stock', 'practice'],
  ['consume', ['Timber'], 1, 'stock', 'practice'],
];
const FOOD = [['consume', ['Edible'], 2, 'food', 'food']];
const results = [];

function json(value) { return JSON.parse(JSON.stringify(value)); }
function cloneState(state) { return deserializeGameState(serializeGameState(state)); }
function tick(state) {
  const result = advanceReplayStateOneSecond(state);
  if (!result?.ok) throw new Error(`official tick failed at tSec ${state?.tSec}`);
  return state;
}
function differ(path, a, b) {
  if (Object.is(a, b)) return null;
  const objectA = a !== null && typeof a === 'object';
  const objectB = b !== null && typeof b === 'object';
  if (!objectA || !objectB || Array.isArray(a) !== Array.isArray(b)) return `${path} ${JSON.stringify(a)} !== ${JSON.stringify(b)}`;
  if (Array.isArray(a) && a.length !== b.length) return `${path} length ${a.length} !== ${b.length}`;
  const keys = Array.isArray(a) ? [...a.keys()] : Object.keys({ ...a, ...b });
  for (const key of keys) {
    const found = differ(`${path}${Array.isArray(a) ? `[${key}]` : `.${key}`}`, a[key], b[key]);
    if (found) return found;
  }
  return null;
}
function same(actual, expected, label) {
  const diff = differ('$', actual, expected);
  if (diff) throw new Error(`${label}: ${diff.slice(0, 280)}`);
}
function check(name, fn) {
  try { fn(); results.push({ name, ok: true }); }
  catch (error) { results.push({ name, ok: false, message: String(error?.message ?? error).replace(/\s+/g, ' ').slice(0, 700) }); }
}
function poke(packet) {
  packet.amount = 8;
  if (Array.isArray(packet.traits)) { packet.traits[0] = 'IsolationProbe'; packet.traits.push('NestedProbe'); }
  else packet.reason = 'isolation-probe';
}
function located(packet) {
  return [packet.kind, packet.traits, packet.amount, packet.resourceId, packet.reason, packet.sourceRegionId, packet.destinationRegionId, packet.boundarySec];
}
// These fixtures query seconds 2/3, before Migration. Migration packet fields
// and conservation have their own independent edge-transfer contract test.
function oracle(pre, boundary) {
  const sec = Math.max(0, Math.floor(boundary));
  const empty = { batchId: `edge-transfers:${sec}`, boundarySec: sec, transfers: [] };
  if (pre?.runStatus?.complete === true || sec <= 0) return empty;
  const replay = cloneState(pre);
  replay.paused = false;
  const advance = advanceReplayStateOneSecond(replay);
  if (!advance?.ok || Math.floor(replay.tSec ?? 0) !== sec) return empty;
  const previous = pre.civilization?.practiceEvents?.stockTransfers ?? null;
  const current = replay.civilization?.practiceEvents?.stockTransfers ?? null;
  const kept = previous?.tSec === sec - 1 ? json(previous.transfers) : [];
  const born = current?.tSec === sec ? json(current.transfers) : [];
  return { ...empty, transfers: [...kept, ...born] };
}
function prepare(spec) {
  const state = createNewGameState(spec.seed);
  if (spec.phase) state.gameConfig.settings.values.phaseDurationSec = spec.phase;
  for (const site of getDetailedSettlementSites(state)) {
    site.detailedState.practiceSlots = fiveSlots();
    site.detailedState.structureSlots?.fill(null);
    setFixturePopulation(site.detailedState, 0);
  }
  const sites = getDetailedSettlementSites(state, { playerOnly: true });
  const source = sites[spec.sourceFirst ? 0 : 1];
  const dest = sites[spec.sourceFirst ? 1 : 0];
  if (!source?.regionId || !dest?.regionId) throw new Error(`${spec.id} needs two player settlements`);
  dest.detailedState.practiceSlots = fiveSlots(spec.bow === false ? null : practiceSlot('bowmaking'));
  const slots = [];
  if (spec.bow !== false) slots.push(practiceSlot('logging', 1), practiceSlot('toolmaking', 1));
  if (spec.food) slots.push(practiceSlot('dryFarming', 2));
  source.detailedState.practiceSlots = fiveSlots(...slots);
  advanceReplayStateToSecond(state, 1);
  if (spec.people) setFixturePopulation(dest.detailedState, spec.people);
  return { state, sourceId: source.regionId, destId: dest.regionId };
}
function finish() {
  const failed = results.filter((row) => !row.ok);
  const summary = { checks: results.length, failed: failed.length, first: failed[0]?.name ?? null, failures: failed, checkout: process.cwd() };
  mkdirSync('artifacts/grok-oct24', { recursive: true });
  writeFileSync(ARTIFACT, JSON.stringify(summary, null, 2));
  const head = `[edge-transfer-isolation] checks=${summary.checks} failed=${summary.failed} checkout=${summary.checkout} artifact=${ARTIFACT}`;
  console.log(failed.length ? `${head}\nfailure=${summary.first}\nrepro: node scripts/edge-transfer-isolation-test.mjs` : head);
  if (failed.length) process.exitCode = 1;
}

const specs = [
  { id: 'seed42-remote-bow', seed: 42, sourceFirst: false },
  { id: 'seed7-source-first', seed: 7, sourceFirst: true },
  { id: 'seed42-bow-food', seed: 42, food: true, people: 61 },
  { id: 'seed42-phase3', seed: 42, food: true, people: 61, phase: 3 },
  { id: 'seed99-meal', seed: 99, food: true, people: 61, bow: false },
];

for (const spec of specs) {
  const fixture = prepare(spec);
  const saved = serializeGameState(fixture.state);
  const boundary = 2;
  const expected = oracle(fixture.state, boundary);
  const place = (rows, sec) => rows.map((row) => [...row, fixture.sourceId, fixture.destId, sec]);
  check(`${spec.id}:journal-oracle`, () => {
    same(buildEdgeTransferBatchAtBoundary(fixture.state, boundary), expected, 'batch');
    same(serializeGameState(fixture.state), saved, 'source during read');
  });
  check(`${spec.id}:literals`, () => {
    const batch = buildEdgeTransferBatchAtBoundary(cloneState(saved), boundary);
    if (spec.bow !== false) same(batch.transfers.filter((p) => p.reason === 'practice').map(located), place(BOW, 1), 'bow');
    const foodRows = batch.transfers.filter((p) => p.reason === 'food').map(located);
    same(foodRows, spec.food && !spec.phase ? place(FOOD, 2) : [], 'food');
  });
  check(`${spec.id}:edit-replay-and-orders`, () => {
    const sample = cloneState(saved);
    const seen = buildEdgeTransferBatchAtBoundary(sample, boundary);
    const again = buildEdgeTransferBatchAtBoundary(sample, boundary);
    const other = buildEdgeTransferBatchAtBoundary(sample, boundary + 1);
    const againSnap = json(again);
    const otherSnap = json(other);
    for (const packet of seen.transfers) poke(packet);
    const edited = json(seen.transfers);
    const diffs = [];
    const note = (actual, expected, label) => { const diff = differ('$', actual, expected); if (diff) diffs.push(`${label}: ${diff.slice(0, 140)}`); };
    note(serializeGameState(sample), saved, 'source after caller edit');
    note(json(again), againSnap, 'repeated call');
    note(json(other), otherSnap, 'other boundary');
    const reverse = cloneState(saved);
    const high = buildEdgeTransferBatchAtBoundary(reverse, boundary + 1);
    const low = buildEdgeTransferBatchAtBoundary(reverse, boundary);
    const highSnap = json(high);
    for (const packet of low.transfers) poke(packet);
    note(json(high), highSnap, 'reverse query order');
    note(serializeGameState(reverse), saved, 'reverse-order source');
    const clean = cloneState(saved);
    tick(sample);
    tick(clean);
    note(serializeGameState(sample), serializeGameState(clean), 'official replay');
    note(json(seen.transfers), edited, 'next tick cleared captured batch');
    if (diffs.length) throw new Error(diffs.join(' || '));
  });
  check(`${spec.id}:replacement-keeps-prior`, () => {
    const sample = cloneState(saved);
    const before = sample.civilization.practiceEvents?.stockTransfers ?? null;
    const batch = buildEdgeTransferBatchAtBoundary(sample, boundary);
    const prior = json(batch.transfers.filter((p) => p.systemId === 'stock' && p.boundarySec === before?.tSec));
    tick(sample);
    const after = sample.civilization.practiceEvents?.stockTransfers ?? null;
    same(json(batch.transfers.filter((p) => p.systemId === 'stock' && p.boundarySec === before?.tSec)), prior, 'captured prior');
    if (spec.food && !spec.phase) {
      assert.equal(after?.tSec, 2, 'food tick replaced the practice journal');
      assert.notEqual(after, before, 'food tick did not replace the journal object');
    }
  });
  check(`${spec.id}:ages-out`, () => {
    const later = tick(cloneState(saved));
    const aged = buildEdgeTransferBatchAtBoundary(later, boundary + 1);
    same(aged, oracle(later, boundary + 1), 'aged batch');
    assert.equal(aged.transfers.some((p) => p.boundarySec === 1 && p.reason === 'practice'), false, 'tSec 1 practice packet stayed visible');
    if (spec.food && !spec.phase) assert.equal(aged.transfers.some((p) => p.reason === 'food' && p.boundarySec === 2), true, 'food packet aged out one second early');
  });
}

finish();
