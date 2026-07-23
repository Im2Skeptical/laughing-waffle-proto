import assert from "node:assert/strict";
import { worldMapDefs } from "../../defs/world/world-map-defs.js";
import { canonicalizeSnapshot } from "../canonicalize.js";
import { createInitialState } from "../init.js";
import { deserializeGameState, serializeGameState } from "../state.js";
import { createTimelineFromInitialState, rebuildStateAtSecond } from "../timeline/index.js";
import {
  getConnectedRegionIds,
  getDetailedSiteState,
  getRegionState,
  getWorldConnectionCandidates,
  isWorldConnectionCandidate,
  validateWorldDefinition,
  validateWorldState,
} from "../world-state.js";

function testWorldDefinition() {
  const definition = worldMapDefs.riverBasin01;
  const result = validateWorldDefinition(definition);
  assert.equal(result.ok, true, result.errors.join("; "));
  assert.equal(definition.regions.length, 15);
  assert.deepEqual(
    definition.regions.map((region) => region.name),
    Array.from({ length: 15 }, (_, index) => `Region${String(index + 1).padStart(2, "0")}`)
  );
  assert.equal(definition.sites[0].name, "Settlement07");
  assert.equal(definition.connections.length, 17);
  assert.equal(getWorldConnectionCandidates(definition).length, 25);
  assert.equal(new Set(definition.regions.map((region) => region.id)).size, 15);
  assert.deepEqual(getConnectedRegionIds(
    { world: { definitionId: definition.id, connections: definition.connections } },
    "outer-isles"
  ), []);
  assert.equal(isWorldConnectionCandidate(definition, "salt-coast", "outer-isles"), false);
  assert.equal(isWorldConnectionCandidate(definition, "river-crown", "lake-country"), true);

  for (const forbidden of [
    "travelRules",
    "transportNodes",
    "transportLinks",
    "geographicFeatures",
    "borders",
  ]) {
    assert.equal(Object.prototype.hasOwnProperty.call(definition, forbidden), false);
  }
  assert.equal(definition.regions.some((region) =>
    "terrainId" in region || "deposits" in region || "landCover" in region
  ), false);

  const duplicateConnection = JSON.parse(JSON.stringify(definition));
  duplicateConnection.connections.push({
    regionAId: duplicateConnection.connections[0].regionBId,
    regionBId: duplicateConnection.connections[0].regionAId,
  });
  const duplicateResult = validateWorldDefinition(duplicateConnection);
  assert.equal(duplicateResult.ok, false);
  assert.ok(duplicateResult.errors.some((error) => error.startsWith("duplicate connection")));

  const nonAdjacentConnection = JSON.parse(JSON.stringify(definition));
  nonAdjacentConnection.connections.push({
    regionAId: "west-levee",
    regionBId: "lake-country",
  });
  const nonAdjacentResult = validateWorldDefinition(nonAdjacentConnection);
  assert.equal(nonAdjacentResult.ok, false);
  assert.ok(nonAdjacentResult.errors.includes("non-adjacent connection west-levee-lake-country"));

  const invalidController = JSON.parse(JSON.stringify(definition));
  invalidController.regions[0].initialState.controller = "empire";
  assert.equal(validateWorldDefinition(invalidController).ok, false);

  const invalidCapacity = JSON.parse(JSON.stringify(definition));
  invalidCapacity.regions[0].initialState.capacity = -1;
  assert.equal(validateWorldDefinition(invalidCapacity).ok, false);

  const invalidPractice = JSON.parse(JSON.stringify(definition));
  invalidPractice.regions[0].initialState.installedPracticeIds = ["unknown"];
  assert.equal(validateWorldDefinition(invalidPractice).ok, false);

  const disconnectedResult = validateWorldDefinition(definition, { requireConnected: true });
  assert.equal(disconnectedResult.ok, false);
  assert.ok(disconnectedResult.errors.includes("region graph is disconnected"));
}

function testWorldStateAndSerialization() {
  const state = createInitialState("devPlaytesting01", 24680);
  assert.equal(Object.prototype.hasOwnProperty.call(state, "board"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(state, "hub"), false);
  assert.equal(state.world.regions.length, 15);
  assert.equal(state.world.connections.length, 17);
  assert.equal(state.world.sites.length, 1);
  assert.equal(state.civilization.capitalRegionId, "river-crown");
  assert.equal(state.civilization.capitalSiteId, "river-crown-settlement");
  assert.equal(validateWorldState(state).ok, true);

  const local = getDetailedSiteState(state, state.civilization.capitalSiteId);
  assert.deepEqual(local.locationNames, { hub: "Settlement07", region: "Region07" });
  assert.equal(local.hub.cols, 6);
  assert.equal(local.board.cols, 5);
  assert.ok(Array.isArray(local.hub.occ));

  const riverCrown = getRegionState(state, "river-crown");
  riverCrown.installedPracticeIds.push("store", "store");
  const serialized = serializeGameState(state);
  const serializedLocal = getDetailedSiteState(serialized, state.civilization.capitalSiteId);
  assert.equal(serializedLocal.hub.occ, undefined);
  assert.equal(serializedLocal.board.occ, undefined);

  const restored = deserializeGameState(serialized);
  const restoredLocal = getDetailedSiteState(restored, state.civilization.capitalSiteId);
  assert.ok(Array.isArray(restoredLocal.hub.occ));
  assert.ok(Array.isArray(restoredLocal.board.occ.tile));
  assert.deepEqual(getRegionState(restored, "river-crown").installedPracticeIds, ["store", "store"]);
  assert.deepEqual(getConnectedRegionIds(restored, "outer-isles"), []);

  restored.world.regions.reverse();
  restored.world.connections.reverse();
  canonicalizeSnapshot(restored);
  assert.deepEqual(
    restored.world.regions.map((region) => region.id),
    worldMapDefs.riverBasin01.regions.map((region) => region.id)
  );
  assert.deepEqual(restored.world.connections[0], {
    regionAId: "cedar-woods",
    regionBId: "west-levee",
  });

  const invalidSerialized = serializeGameState(state);
  getRegionState(invalidSerialized, "river-crown").controller = "invalid";
  assert.throws(() => deserializeGameState(invalidSerialized), /Invalid serialized world state/);

  const invalidConnection = serializeGameState(state);
  invalidConnection.world.connections.push({ regionAId: "river-crown", regionBId: "river-crown" });
  assert.throws(() => deserializeGameState(invalidConnection), /world-state connection/);

  const nonAdjacentConnection = serializeGameState(state);
  nonAdjacentConnection.world.connections.push({ regionAId: "west-levee", regionBId: "lake-country" });
  assert.throws(() => deserializeGameState(nonAdjacentConnection), /non-adjacent world-state connection/);
}

function testReplayParity() {
  const state = createInitialState("devPlaytesting01", 13579);
  const timeline = createTimelineFromInitialState(state);
  const first = rebuildStateAtSecond(timeline, 16);
  const second = rebuildStateAtSecond(timeline, 16);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.deepEqual(serializeGameState(first.state), serializeGameState(second.state));
}

export function runWorldStateSuite() {
  testWorldDefinition();
  testWorldStateAndSerialization();
  testReplayParity();
  return true;
}

runWorldStateSuite();
console.log("[world-state] OK");
