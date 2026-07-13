import assert from "node:assert/strict";
import { worldMapDefs } from "../../defs/world/world-map-defs.js";
import { createInitialState } from "../init.js";
import { deserializeGameState, serializeGameState } from "../state.js";
import { createTimelineFromInitialState, rebuildStateAtSecond } from "../timeline/index.js";
import { calculateTransportLinkTravel, findFastestRoute } from "../world-routes.js";
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
  malformed.borders.push({ ...malformed.borders[0] });
  const invalid = validateWorldDefinition(malformed, { requireConnected: true });
  assert.equal(invalid.ok, false);
  assert.ok(invalid.errors.some((error) => error.startsWith("duplicate border")));

  const invalidGeometryDef = JSON.parse(JSON.stringify(definition));
  invalidGeometryDef.borders.find((entry) => entry.id === "river-lake").vertexIds = ["r3", "e3"];
  const invalidGeometry = validateWorldDefinition(invalidGeometryDef, { requireConnected: true });
  assert.equal(invalidGeometry.ok, false);
  assert.ok(invalidGeometry.errors.some((error) => error.includes("does not follow shared mesh edge")));

  const invalidRiver = JSON.parse(JSON.stringify(definition));
  invalidRiver.geographicFeatures.find((entry) => entry.id === "crown-river").segments[1].fromVertexId = "r2";
  const invalidRiverGeometry = validateWorldDefinition(invalidRiver);
  assert.equal(invalidRiverGeometry.ok, false);
  assert.ok(invalidRiverGeometry.errors.some((error) => error.includes("is discontinuous")));

  const missingBorder = JSON.parse(JSON.stringify(definition));
  missingBorder.borders = missingBorder.borders.filter((entry) => entry.id !== "cedar-west");
  const incompleteGeometry = validateWorldDefinition(missingBorder, { requireConnected: true });
  assert.equal(incompleteGeometry.ok, false);
  assert.ok(incompleteGeometry.errors.some((error) => error.includes("has no border")));
}

function testWorldRoutes() {
  const definition = worldMapDefs.riverBasin01;
  const downstream = findFastestRoute(definition, {
    originSiteId: "river-crown-settlement",
    destinationSiteId: "salt-coast-port",
  });
  const upstream = findFastestRoute(definition, {
    originSiteId: "salt-coast-port",
    destinationSiteId: "river-crown-settlement",
  });
  assert.equal(downstream.ok, true);
  assert.equal(upstream.ok, true);
  assert.ok(downstream.legs.every((leg) => leg.mode === "river"));
  assert.ok(downstream.totalDays < upstream.totalDays);
  const originNode = definition.transportNodes.find((node) => node.siteId === "river-crown-settlement");
  const destinationNode = definition.transportNodes.find((node) => node.siteId === "salt-coast-port");
  assert.deepEqual(downstream.legs[0].path[0], originNode.point);
  assert.deepEqual(downstream.legs.at(-1).path.at(-1), destinationNode.point);

  const island = findFastestRoute(definition, {
    originSiteId: "salt-coast-port",
    destinationSiteId: "outer-isles-outpost",
  });
  assert.equal(island.ok, true);
  assert.deepEqual(island.legs.map((leg) => leg.mode), ["sea"]);
  const noSea = findFastestRoute(definition, {
    originSiteId: "salt-coast-port",
    destinationSiteId: "outer-isles-outpost",
    enabledModes: ["land", "river"],
  });
  assert.deepEqual(noSea, { ok: false, reason: "noRoute" });

  assert.equal(definition.transportLinks.some((link) => link.id === "land-black-obsidian"), false);
  const passTravel = calculateTransportLinkTravel(
    definition,
    definition.transportLinks.find((link) => link.id === "land-iron-high")
  );
  assert.ok(passTravel.modifiers.some((modifier) => modifier.label === "pass" && modifier.days === 2));
  const forestTravel = calculateTransportLinkTravel(
    definition,
    definition.transportLinks.find((link) => link.id === "land-cedar-west")
  );
  assert.ok(forestTravel.modifiers.some((modifier) => modifier.kind === "forestBelt"));
  assert.deepEqual(
    findFastestRoute(definition, {
      originSiteId: "cedar-woods-camp",
      destinationSiteId: "obsidian-ridge-quarry",
    }),
    findFastestRoute(definition, {
      originSiteId: "cedar-woods-camp",
      destinationSiteId: "obsidian-ridge-quarry",
    })
  );
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
  testWorldRoutes();
  testNestedDetailedState();
  testReplayParity();
  return true;
}

runWorldStateSuite();
console.log("[world-state] OK");
