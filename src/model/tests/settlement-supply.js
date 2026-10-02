import assert from 'node:assert/strict';
import { createNewGameState } from '../new-game.js';
import { serializeGameState, deserializeGameState } from '../state.js';
import { getDetailedSettlementSites } from '../detailed-settlements/queries.js';
import { getRegionState, getWorldDefinition, getWorldConnectionCandidates, addWorldConnection } from '../world-state.js';
import { practiceSlot, fiveSlots, setFixturePopulation } from '../dev-lab/fixtures.js';
import { planStock, applyStockPlan, consumeAvailableStock } from '../detailed-settlements/stock.js';
import { evaluateDetailedPracticeSlot, runPracticeActivation, flushPracticeEvents } from '../detailed-settlements/practices.js';
import { emitPracticeEvent } from '../detailed-settlements/practice-events.js';
import { getDetailedPracticeDef } from '../game-config.js';
import { getGamepieceFace } from '../gamepiece-presentation.js';
import { createTimelineFromInitialState, rebuildStateAtSecond } from '../timeline/index.js';
import { advanceReplayStateToSecond } from '../replay-second-runner.js';
import { buildProjectionChunkFromStateData } from '../projection-chunk.js';
import { canonicalizeSnapshot } from '../canonicalize.js';
import { buildEdgeTransferBatchAtBoundary, getLatestEdgeTransferBoundarySec } from '../edge-transfers.js';
import { getEdgeTransferPacketGlyphSpec } from '../../views/world-map/packets.js';

function fixture() {
  const state = createNewGameState(42);
  const [local, remote] = getDetailedSettlementSites(state, { playerOnly: true });
  for (const site of getDetailedSettlementSites(state)) {
    site.detailedState.practiceSlots = fiveSlots();
    site.detailedState.structureSlots.fill(null);
    setFixturePopulation(site.detailedState, 0);
  }
  return { state, local, remote };
}

// Same slot index on different boards must remain distinct providers.
const supply = fixture();
const { state, local, remote } = supply;
local.detailedState.practiceSlots = fiveSlots(practiceSlot('logging', 1));
remote.detailedState.practiceSlots = fiveSlots(practiceSlot('logging', 2), practiceSlot('surfaceMining', 1));
const stockBefore = serializeGameState(state);
const plan = planStock(state, local.detailedState, [{ traits: ['Fuel'], amount: 3 }]);
assert.equal(plan.ok, true);
assert.deepEqual(plan.providers.map(p => [p.regionId, p.slotIndex, p.amount]),
  [[local.regionId, 0, 1], [remote.regionId, 0, 2]], 'local board precedes remote stock');
assert.deepEqual(serializeGameState(state), stockBefore, 'provider planning is pure');
assert.equal(applyStockPlan(state, local.detailedState, plan), true);
assert.equal(local.detailedState.practiceSlots[0].stock, 0);
assert.equal(remote.detailedState.practiceSlots[0].stock, 0, 'the remote host pays its own debit');
const required = planStock(state, local.detailedState, [], [{ traits: ['Ore'], amount: 1 }]);
assert.equal(required.ok, true);
applyStockPlan(state, local.detailedState, required);
assert.equal(remote.detailedState.practiceSlots[1].stock, 1, 'Require never consumes remote Stock');
const failureBefore = serializeGameState(state);
const failed = planStock(state, local.detailedState, [{ traits: ['Ore'], amount: 1 }, { traits: ['Fuel'], amount: 1 }]);
assert.equal(failed.ok, false);
assert.equal(applyStockPlan(state, local.detailedState, failed), false);
assert.deepEqual(serializeGameState(state), failureBefore, 'failed multi-board recipe changes nothing');

// Each eligibility restriction is independently enforced for materials and Food.
const originalConnections = structuredClone(state.world.connections);
state.world.connections = [];
assert.equal(planStock(state, local.detailedState, [], [{ traits: ['Ore'], amount: 1 }]).ok, false, 'adjacency alone is insufficient');
assert.equal(consumeAvailableStock(state, local.detailedState, 'Ore', 1), 0);
state.world.connections = originalConnections;
getRegionState(state, remote.regionId).controller = 'external-a';
assert.equal(planStock(state, local.detailedState, [], [{ traits: ['Ore'], amount: 1 }]).ok, false, 'neutral Stock is excluded');
getRegionState(state, remote.regionId).controller = 'player';
getRegionState(state, local.regionId).controller = 'external-a';
assert.equal(planStock(state, local.detailedState, [], [{ traits: ['Ore'], amount: 1 }]).ok, false, 'neutrals cannot draw allied Stock');
getRegionState(state, local.regionId).controller = 'player';
const adjacent = getWorldConnectionCandidates(getWorldDefinition(state)).flatMap(edge =>
  edge.regionAId === local.regionId ? [edge.regionBId] : edge.regionBId === local.regionId ? [edge.regionAId] : []);
const distantRegion = state.world.regions.find(region => region.id !== local.regionId && !adjacent.includes(region.id));
const distant = structuredClone(remote);
distant.id = `supply-test:${distantRegion.id}`;
distant.regionId = distantRegion.id;
distant.detailedState.practiceSlots = fiveSlots(practiceSlot('surfaceMining', 4));
state.world.sites.push(distant);
distantRegion.controller = 'player';
state.world.connections = [{ regionAId: local.regionId, regionBId: distant.regionId }];
assert.equal(planStock(state, local.detailedState, [], [{ traits: ['Ore'], amount: 1 }]).ok, false, 'connection alone is insufficient');
assert.equal(consumeAvailableStock(state, local.detailedState, 'Ore', 1), 0);

// Multiple donors use authored region order, independently of connection/site order.
const ordered = fixture();
const candidates = getWorldConnectionCandidates(getWorldDefinition(ordered.state)).flatMap(edge =>
  edge.regionAId === ordered.local.regionId ? [edge.regionBId] : edge.regionBId === ordered.local.regionId ? [edge.regionAId] : []);
const otherId = candidates.find(id => id !== ordered.remote.regionId);
const other = structuredClone(ordered.remote);
other.id = `supply-test:${otherId}`; other.regionId = otherId;
other.detailedState.practiceSlots = fiveSlots(practiceSlot('logging', 1));
ordered.remote.detailedState.practiceSlots = fiveSlots(practiceSlot('logging', 1));
ordered.state.world.sites = ordered.state.world.sites.filter(site => site.regionId !== otherId);
ordered.state.world.sites.unshift(other);
getRegionState(ordered.state, otherId).controller = 'player';
addWorldConnection(ordered.state, ordered.local.regionId, otherId);
ordered.state.world.connections.reverse();
const orderedPlan = planStock(ordered.state, ordered.local.detailedState, [{ traits: ['Timber'], amount: 2 }]);
assert.deepEqual(orderedPlan.providers.map(p => p.regionId), getWorldDefinition(ordered.state).regions
  .filter(region => [otherId, ordered.remote.regionId].includes(region.id)).map(region => region.id));

// Warm geometry caches must not retain a mutable board or stock from another state.
const live = fixture();
live.remote.detailedState.practiceSlots = fiveSlots(practiceSlot('logging', 2));
assert.equal(planStock(live.state, live.local.detailedState, [{ traits: ['Timber'], amount: 2 }]).ok, true);
const isolated = deserializeGameState(serializeGameState(live.state));
const isolatedLocal = isolated.world.sites.find(site => site.regionId === live.local.regionId);
for (const site of isolated.world.sites) if (site.detailedState) site.detailedState.practiceSlots = fiveSlots();
assert.equal(planStock(isolated, isolatedLocal.detailedState, [{ traits: ['Timber'], amount: 2 }]).ok, false);
assert.equal(planStock(live.state, live.local.detailedState, [{ traits: ['Timber'], amount: 2 }]).ok, true,
  'restored state boards cannot contaminate the live state');
isolated.world.sites.find(site => site.regionId === live.remote.regionId).detailedState.practiceSlots = fiveSlots(practiceSlot('logging', 2));
assert.equal(planStock(isolated, isolatedLocal.detailedState, [{ traits: ['Timber'], amount: 2 }]).ok, true,
  'provider queries see board replacements immediately');

// Scheduled Practice consumes a remote input and preserves its remote requirement.
const scheduled = fixture();
scheduled.local.detailedState.practiceSlots = fiveSlots(practiceSlot('bowmaking'));
scheduled.remote.detailedState.practiceSlots = fiveSlots(practiceSlot('logging', 1), practiceSlot('toolmaking', 1));
runPracticeActivation(scheduled.state, 'birth');
assert.ok(scheduled.local.detailedState.practiceSlots[0].stock > 0);
assert.deepEqual(scheduled.remote.detailedState.practiceSlots.slice(0, 2).map(slot => slot.stock), [0, 1]);
assert.deepEqual(scheduled.state.civilization.practiceEvents.stockTransfers.transfers.map(t => t.kind), ['require', 'consume']);
const consumedEvent = scheduled.state.civilization.practiceEvents.trace.find(event => event.kind === 'stockConsumed');
assert.ok(consumedEvent.traits.includes('Timber'), 'consumption events read traits from the real remote host');

// Full local Charge output cannot use a remote input's matching slot index as free capacity.
const charged = fixture();
charged.local.detailedState.practiceSlots = fiveSlots(practiceSlot('smelting', getDetailedPracticeDef(charged.state, 'smelting').stockCapacity));
charged.remote.detailedState.practiceSlots = fiveSlots(practiceSlot('surfaceMining', 1), practiceSlot('logging', 1));
assert.equal(evaluateDetailedPracticeSlot(charged.state, charged.local.regionId, 0).supplied, false);
charged.local.detailedState.practiceSlots[0].stock = 0;
charged.local.detailedState.practiceSlots[0].charge = 2;
emitPracticeEvent(charged.state, { kind: 'phaseResolved', regionId: charged.local.regionId, phase: 'birth' });
flushPracticeEvents(charged.state);
assert.ok(charged.local.detailedState.practiceSlots[0].stock > 0, 'automatic Discharge uses remote materials');
assert.deepEqual(charged.remote.detailedState.practiceSlots.slice(0, 2).map(slot => slot.stock), [0, 0]);

// Special technical requirements use the same multi-board provider scope.
const technical = fixture();
setFixturePopulation(technical.local.detailedState, 1, 1);
technical.local.detailedState.practiceSlots = fiveSlots(practiceSlot('experimentation'));
technical.remote.detailedState.practiceSlots = fiveSlots(practiceSlot('smelting', 1), practiceSlot('toolmaking', 1));
const evaluation = evaluateDetailedPracticeSlot(technical.state, technical.local.regionId, 0);
assert.equal(evaluation.supplied, true);
assert.deepEqual(evaluation.providers.map(p => p.regionId), [technical.remote.regionId, technical.remote.regionId]);
const face = getGamepieceFace(technical.state, 'practice', 'experimentation', 'bronze', { evaluation });
assert.ok(face.detailLines.some(line => line.includes('from R') && line.includes('slot 1')), 'inspection names the provider settlement');

// Actual Food boundary, partial feeding, pure map reconstruction, and authoritative replay.
const meals = fixture();
advanceReplayStateToSecond(meals.state, 1);
setFixturePopulation(meals.local.detailedState, 61);
meals.remote.detailedState.practiceSlots = fiveSlots(practiceSlot('dryFarming', 2));
const preMeal = serializeGameState(meals.state);
const batch = buildEdgeTransferBatchAtBoundary(meals.state, 2);
assert.deepEqual(serializeGameState(meals.state), preMeal, 'map batch reconstruction cannot mutate live state');
assert.ok(batch.transfers.some(t => t.resourceId === 'food' && t.sourceRegionId === meals.remote.regionId
  && t.destinationRegionId === meals.local.regionId && t.amount === 2));
advanceReplayStateToSecond(meals.state, 2);
assert.equal(meals.local.detailedState.lastMeal.consumed, 2);
assert.equal(meals.local.detailedState.lastMeal.byClass.villager.consumed, 60);
assert.equal(meals.remote.detailedState.practiceSlots[0].stock, 0);
assert.equal(getLatestEdgeTransferBoundarySec(2, meals.state), 2);
const timeline = createTimelineFromInitialState(deserializeGameState(preMeal));
const replay = rebuildStateAtSecond(timeline, 2);
assert.equal(replay.ok, true);
assert.deepEqual(canonicalizeSnapshot(serializeGameState(replay.state)), canonicalizeSnapshot(serializeGameState(meals.state)));
const reload = deserializeGameState(preMeal);
advanceReplayStateToSecond(reload, 2);
assert.deepEqual(serializeGameState(reload), serializeGameState(meals.state));
const projection = buildProjectionChunkFromStateData(preMeal, 1, 2);
assert.equal(projection.ok, true);
assert.deepEqual(canonicalizeSnapshot(projection.lastStateData), canonicalizeSnapshot(serializeGameState(meals.state)));
assert.equal(getEdgeTransferPacketGlyphSpec('stock').crates.length, 1);
assert.notEqual(getEdgeTransferPacketGlyphSpec('stock').color, getEdgeTransferPacketGlyphSpec('food').color);

// A following Food boundary must not erase a still-travelling Practice packet.
const consecutive = fixture();
consecutive.local.detailedState.practiceSlots = fiveSlots(practiceSlot('bowmaking'));
consecutive.remote.detailedState.practiceSlots = fiveSlots(practiceSlot('logging', 1), practiceSlot('toolmaking', 1));
advanceReplayStateToSecond(consecutive.state, 1);
assert.equal(getLatestEdgeTransferBoundarySec(1, consecutive.state), 1, 'Practice transfers appear outside Food / Migration');
const consecutiveBatch = buildEdgeTransferBatchAtBoundary(consecutive.state, 2);
assert.deepEqual(consecutiveBatch.transfers.map(t => t.boundarySec), [1, 1], 'previous-second Practice packets retain their true start time');
console.log('[settlement-supply] adjacency + connection, allied providers, atomic inputs, Charge, meals and replay/map parity OK');
