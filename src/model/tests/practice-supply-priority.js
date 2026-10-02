import assert from 'node:assert/strict';
import { createNewGameState } from '../new-game.js';
import { serializeGameState, deserializeGameState } from '../state.js';
import { getDetailedSettlementSites } from '../detailed-settlements/queries.js';
import { practiceSlot, fiveSlots, setFixturePopulation } from '../dev-lab/fixtures.js';
import { planStock } from '../detailed-settlements/stock.js';
import { runPracticeActivation, flushPracticeEvents } from '../detailed-settlements/practices.js';
import { emitPracticeEvent } from '../detailed-settlements/practice-events.js';
import { createTimelineFromInitialState, rebuildStateAtSecond } from '../timeline/index.js';
import { advanceReplayStateToSecond } from '../replay-second-runner.js';
import { buildProjectionChunkFromStateData } from '../projection-chunk.js';
import { buildEdgeTransferBatchAtBoundary } from '../edge-transfers.js';
import { canonicalizeSnapshot } from '../canonicalize.js';

function fixture(ownerFirst = false, stock = 1) {
  const state = createNewGameState(42);
  const [first, second] = getDetailedSettlementSites(state, { playerOnly: true });
  for (const site of getDetailedSettlementSites(state)) {
    site.detailedState.practiceSlots = fiveSlots();
    site.detailedState.structureSlots.fill(null);
    setFixturePopulation(site.detailedState, 0);
  }
  const owner = ownerFirst ? first : second, borrower = ownerFirst ? second : first;
  owner.detailedState.practiceSlots = fiveSlots(practiceSlot('bowmaking'), practiceSlot('logging', stock), practiceSlot('toolmaking', 1));
  borrower.detailedState.practiceSlots = fiveSlots(practiceSlot('bowmaking'));
  return { state, owner, borrower };
}

for (const ownerFirst of [false, true]) for (const stock of [1, 2]) {
  const f = fixture(ownerFirst, stock);
  runPracticeActivation(f.state, 'birth');
  assert.equal(f.owner.detailedState.practiceSlots[0].stock, 3, 'owner uses its inputs before neighbours, in either site order');
  assert.equal(f.borrower.detailedState.practiceSlots[0].stock, stock === 2 ? 3 : 0, 'only leftover inputs may be borrowed');
  assert.equal(f.owner.detailedState.practiceSlots[1].stock, 0);
  assert.equal(f.owner.detailedState.practiceSlots[2].stock, 1, 'local and remote Require retain Stock');
  const transfers = f.state.civilization.practiceEvents.stockTransfers?.transfers ?? [];
  assert.deepEqual(transfers.map(t => [t.kind, t.sourceRegionId, t.destinationRegionId, t.amount]), stock === 2 ? [
    ['require', f.owner.regionId, f.borrower.regionId, 1],
    ['consume', f.owner.regionId, f.borrower.regionId, 1],
  ] : []);
  assert.equal(f.state.civilization.practiceEvents.trace.filter(e => e.kind === 'activated' && e.regionId === f.owner.regionId).length, 1,
    'successful local recipes never run again in the sharing pass');
  assert.equal(f.state.civilization.practiceEvents.pending.length, 0);
}

// A local-only plan must be pure, atomic, and genuinely exclude remote requirements.
const localPlan = fixture();
const beforePlan = serializeGameState(localPlan.state);
assert.equal(planStock(localPlan.state, localPlan.borrower.detailedState, [{ traits: ['Timber'] }], [{ traits: ['Tool'] }], null, false, true).ok, false);
assert.deepEqual(serializeGameState(localPlan.state), beforePlan);

// An incomplete local recipe reserves nothing. A neighbour may use those inputs
// after the owner's unsuccessful local attempt; all shared retries re-plan.
const incomplete = fixture();
incomplete.owner.detailedState.practiceSlots[2] = null;
incomplete.borrower.detailedState.practiceSlots[1] = practiceSlot('toolmaking', 1);
runPracticeActivation(incomplete.state, 'birth');
assert.equal(incomplete.borrower.detailedState.practiceSlots[0].stock, 3);
assert.equal(incomplete.owner.detailedState.practiceSlots[0].stock, 0);
assert.equal(incomplete.owner.detailedState.practiceSlots[1].stock, 0);
assert.equal(incomplete.state.civilization.practiceEvents.stockTransfers.transfers.filter(t => t.kind === 'consume').length, 1,
  'failed plans cannot double-spend or record transfers');

// Stock-based conditions use the same scope as inputs, and see actual leftovers.
const diversity = fixture();
diversity.borrower.detailedState.practiceSlots = fiveSlots(practiceSlot('barter'));
diversity.state.gameConfig.gamepieces.practices.bowmaking.effects = [{ op: 'research', amount: 1 }];
runPracticeActivation(diversity.state, 'birth');
assert.equal(diversity.borrower.detailedState.practiceSlots[0].stock, 0, 'borrowed diversity lost to owner consumption is not cached');

// Queued independent roots all get local reactions before a remote-dependent
// reaction. Charge cards retain their current no-Stock-payment grammar.
const simultaneous = fixture();
simultaneous.borrower.detailedState.practiceSlots = fiveSlots(practiceSlot('smelting'));
simultaneous.owner.detailedState.practiceSlots = fiveSlots(practiceSlot('charcoalBurning'), practiceSlot('logging', 1));
for (const id of ['smelting', 'charcoalBurning']) {
  const def = simultaneous.state.gameConfig.gamepieces.practices[id];
  def.charge.threshold = 1;
  def.charge.trigger = { any: [{ kind: 'phaseResolved' }] };
}
simultaneous.state.gameConfig.gamepieces.practices.smelting.condition = 'diverseStock';
emitPracticeEvent(simultaneous.state, { kind: 'phaseResolved', regionId: simultaneous.borrower.regionId });
emitPracticeEvent(simultaneous.state, { kind: 'phaseResolved', regionId: simultaneous.owner.regionId });
flushPracticeEvents(simultaneous.state);
assert.deepEqual(simultaneous.state.civilization.practiceEvents.trace.filter(e => e.kind === 'discharged').map(e => e.targetPracticeId),
  ['charcoalBurning', 'smelting'], 'a later queued local producer resolves before the earlier remote-dependent reaction');
assert.equal(simultaneous.owner.detailedState.practiceSlots[1].stock, 1, 'conditions retain donor Stock');

// Children emitted during a shared recipe get a local pass before the next
// shared recipe: Bowmaking wakes Smelting, then supplies Weaponsmithing.
const children = fixture();
children.owner.detailedState.practiceSlots = fiveSlots(practiceSlot('logging', 2), practiceSlot('toolmaking', 1), practiceSlot('smelting'));
children.borrower.detailedState.practiceSlots = fiveSlots(practiceSlot('bowmaking'), practiceSlot('weaponsmithing'));
const smelting = children.state.gameConfig.gamepieces.practices.smelting;
smelting.charge.threshold = 1;
smelting.charge.trigger = { any: [{ kind: 'stockGenerated', traitsAny: ['Arms'], scope: 'civilization' }] };
runPracticeActivation(children.state, 'birth');
assert.deepEqual(children.state.civilization.practiceEvents.trace.filter(e => ['activated', 'discharged'].includes(e.kind)
  && ['bowmaking', 'smelting', 'weaponsmithing'].includes(e.targetPracticeId)).slice(0, 3).map(e => e.targetPracticeId),
  ['bowmaking', 'smelting', 'weaponsmithing']);
assert.equal(children.borrower.detailedState.practiceSlots[1].stock, 3);

// Two simultaneous roots may each Discharge once; refilling within a root
// never allows a repeat, and retrying does not replay Charge gains.
const roots = fixture();
roots.owner.detailedState.practiceSlots = fiveSlots();
roots.borrower.detailedState.practiceSlots = fiveSlots(practiceSlot('smelting'));
const loop = roots.state.gameConfig.gamepieces.practices.smelting;
loop.charge.threshold = 1;
loop.charge.trigger = { any: [{ kind: 'stockGenerated', traitsAny: ['Metal'] }] };
for (let i = 0; i < 2; i++) emitPracticeEvent(roots.state, { kind: 'stockGenerated', regionId: roots.borrower.regionId, traits: ['Metal'] });
flushPracticeEvents(roots.state);
const discharges = roots.state.civilization.practiceEvents.trace.filter(e => e.kind === 'discharged');
assert.equal(discharges.length, 2);
assert.equal(new Set(discharges.map(e => e.rootId)).size, 2);
assert.equal(roots.borrower.detailedState.practiceSlots[0].stock, 4);
assert.equal(roots.borrower.detailedState.practiceSlots[0].charge, 1);
assert.equal(roots.state.civilization.practiceEvents.activeRoot, undefined);

// Actual scheduled boundary, save/reload, timeline, projection and map packets
// all resolve through the same new ordering, without mutating the packet input.
const replay = fixture(false, 2);
const initial = serializeGameState(replay.state);
const packets = buildEdgeTransferBatchAtBoundary(replay.state, 1);
assert.deepEqual(serializeGameState(replay.state), initial);
assert.deepEqual(packets.transfers.filter(t => t.reason === 'practice').map(t => [t.kind, t.sourceRegionId, t.destinationRegionId]),
  [['require', replay.owner.regionId, replay.borrower.regionId], ['consume', replay.owner.regionId, replay.borrower.regionId]]);
advanceReplayStateToSecond(replay.state, 1);
const expected = canonicalizeSnapshot(serializeGameState(replay.state));
const restored = deserializeGameState(initial);
advanceReplayStateToSecond(restored, 1);
assert.deepEqual(canonicalizeSnapshot(serializeGameState(restored)), expected);
const timeline = createTimelineFromInitialState(deserializeGameState(initial));
assert.deepEqual(canonicalizeSnapshot(serializeGameState(rebuildStateAtSecond(timeline, 1).state)), expected);
const projection = buildProjectionChunkFromStateData(initial, 0, 1);
assert.equal(projection.ok, true);
assert.deepEqual(canonicalizeSnapshot(projection.lastStateData), expected);
console.log('[practice-supply-priority] local inputs, leftovers, atomic failures, simultaneous roots, chains and replay/map parity OK');
