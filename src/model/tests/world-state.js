import assert from "node:assert/strict";
import { worldMapDefs } from "../../defs/world/world-map-defs.js";
import { createInitialState } from "../init.js";
import { deserializeGameState, serializeGameState } from "../state.js";
import { createTimelineFromInitialState, rebuildStateAtSecond } from "../timeline/index.js";
import {
  getDetailedSiteState,
  getSitesInRegion,
  validateWorldDefinition,
} from "../world-state.js";

function testWorldDefinition() {
  const definition = worldMapDefs.riverBasin01;
  const result = validateWorldDefinition(definition, { requireConnected: true });
  assert.equal(result.ok, true, result.errors.join("; "));
  assert.equal(definition.regions.length, 15);
  assert.equal(new Set(definition.regions.map((region) => region.id)).size, 15);

  const malformed = JSON.parse(JSON.stringify(definition));
  malformed.connections.push({ ...malformed.connections[0] });
  const invalid = validateWorldDefinition(malformed, { requireConnected: true });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.some((error) => error.startsWith("duplicate connection")));
}

function testNestedDetailedState() {
  const state = createInitialState("devPlaytesting01", 24680);
  assert.equal(Object.prototype.hasOwnProperty.call(state, "board"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(state, "hub"), false);
  assert.equal(state.civilization.capitalRegionId, "river-crown");
  assert.equal(state.civilization.capitalSiteId, "river-crown-settlement");
  assert.equal(getSitesInRegion(state, "iron-hills")[0]?.simulationMode, "summary");

  const local = getDetailedSiteState(state, state.civilization.capitalSiteId);
  assert.equal(local.hub.cols, 6);
  assert.equal(local.board.cols, 5);
  assert.ok(Array.isArray(local.hub.occ));

  const serialized = serializeGameState(state);
  const serializedLocal = getDetailedSiteState(serialized, state.civilization.capitalSiteId);
  assert.equal(serializedLocal.hub.occ, undefined);
  assert.equal(serializedLocal.board.occ, undefined);

  const restored = deserializeGameState(serialized);
  const restoredLocal = getDetailedSiteState(restored, state.civilization.capitalSiteId);
  assert.ok(Array.isArray(restoredLocal.hub.occ));
  assert.ok(Array.isArray(restoredLocal.board.occ.tile));
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
  testNestedDetailedState();
  testReplayParity();
  return true;
}

runWorldStateSuite();
console.log("[world-state] OK");
