import assert from "node:assert/strict";
import { createInitialState } from "../init.js";
import { deserializeGameState, serializeGameState } from "../state.js";
import {
  getDetailedSettlementSites,
  getDetailedSettlementViewModel,
} from "../detailed-settlements.js";
import { createTimelineFromInitialState, rebuildStateAtSecond } from "../timeline/index.js";
import { validateWorldDefinition, validateWorldState } from "../world-state.js";
import { worldMapDefs } from "../../defs/world/world-map-defs.js";
import { REGION_STRUCTURE_CAPACITIES } from "../../defs/world/detailed-settlement-scenario.js";

const state = createInitialState("devPlaytesting01", 24680);
assert.equal(validateWorldDefinition(worldMapDefs.riverBasin01).ok, true);
assert.equal(validateWorldState(state).ok, true);
assert.equal(state.gameStateSchemaVersion, 4);
assert.deepEqual(state.world.regions.map((region) => region.structureCapacity),
  REGION_STRUCTURE_CAPACITIES);
assert.deepEqual(getDetailedSettlementSites(state).map((site) => site.regionId), [
  "cedar-woods", "west-levee", "upper-floodplain", "river-crown", "lake-country",
]);
assert.equal(state.civilization.capitalRegionId, "river-crown");
for (const site of getDetailedSettlementSites(state)) {
  const view = getDetailedSettlementViewModel(state, site.regionId);
  assert.equal(view.elderOrder.resistance, 29);
  assert.equal(view.usedStructureCapacity, 3);
  assert.equal(view.storedFood, 60);
}

const roundTrip = deserializeGameState(serializeGameState(state));
assert.deepEqual(serializeGameState(roundTrip), serializeGameState(state));
const serializedText = JSON.stringify(serializeGameState(state));
for (const removedKey of ["elderCouncil", "agendaByClass", "installedPracticeIds", "activeEnvEventRuns"]) {
  assert.equal(serializedText.includes(removedKey), false, `legacy state absent: ${removedKey}`);
}
const old = serializeGameState(state);
old.gameStateSchemaVersion = 3;
assert.throws(() => deserializeGameState(old), /expected v4/);

const timeline = createTimelineFromInitialState(state);
const first = rebuildStateAtSecond(timeline, 96);
const second = rebuildStateAtSecond(timeline, 96);
assert.equal(first.ok, true);
assert.equal(second.ok, true);
assert.deepEqual(serializeGameState(first.state), serializeGameState(second.state));

console.log("[world-state-v4] OK");
