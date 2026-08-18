import assert from "node:assert/strict";
import {
  MAP_LAB_DRAFT_SCHEMA_VERSION,
  MAP_LAB_STORAGE_KEY,
  createAuthoredMapLabDraft,
  parseMapLabDraftJson,
  serializeMapLabDraft,
  setMapLabStructureSlot,
  updateMapLabDetailedState,
  updateMapLabRegion,
  validateMapLabDraft,
} from "../map-lab-draft.js";
import { createInitialState } from "../init.js";
import { setupDefs } from "../../defs/gamesettings/scenarios-defs.js";

const authored = createAuthoredMapLabDraft();
assert.equal(MAP_LAB_DRAFT_SCHEMA_VERSION, 4);
assert.match(MAP_LAB_STORAGE_KEY, /\.v4$/);
assert.equal(validateMapLabDraft(authored).ok, true);
assert.deepEqual(parseMapLabDraftJson(serializeMapLabDraft(authored)).draft, authored);
assert.deepEqual(authored.regions.map((region) => region.structureCapacity),
  new Array(15).fill(5));
assert.ok(authored.regions.every((region) => region.randomizeStructureCapacity));
assert.deepEqual(authored.regions.filter((region) => region.detailedSettlementEnabled)
  .map((region) => region.id), [
    "cedar-woods", "west-levee", "upper-floodplain", "river-crown", "lake-country",
  ]);

const region01 = authored.regions[0];
assert.equal(updateMapLabRegion(authored, region01.id, { structureCapacity: 1 }).reason,
  "structureCapacityBelowOccupied");
const expanded = updateMapLabRegion(authored, region01.id, { structureCapacity: 4 });
assert.equal(expanded.ok, true);
assert.equal(expanded.draft.regions[0].detailedState.structureSlots.length, 4);
assert.equal(expanded.draft.regions[0].randomizeStructureCapacity, false);

const withoutGranary = setMapLabStructureSlot(authored, region01.id, 0, null);
assert.equal(withoutGranary.ok, false, "stored food above the resulting zero capacity is rejected");
const tooMuchFood = updateMapLabDetailedState(authored, region01.id, { storedFood: 181 });
assert.equal(tooMuchFood.ok, false);
assert.match(tooMuchFood.errors[0], /storedFood/);

const overHousing = updateMapLabDetailedState(authored, region01.id, {
  populationByClass: {
    ...region01.detailedState.populationByClass,
    villager: { ...region01.detailedState.populationByClass.villager, adults: 100 },
  },
});
assert.equal(overHousing.ok, true);
assert.ok(overHousing.warnings.some((warning) => warning.includes("exceeds housing")));

const v1 = JSON.stringify({
  schemaVersion: 1,
  worldDefinitionId: "riverBasin01",
  regions: [],
  connections: [],
});
assert.equal(parseMapLabDraftJson(v1).ok, false);
assert.ok(parseMapLabDraftJson(v1).errors.some((error) => error.includes("expected 4")));

const applied = createInitialState({
  ...setupDefs.devPlaytesting01,
  worldDraft: expanded.draft,
}, 12345);
assert.equal(Object.hasOwn(applied.world.regions[0], "detailedState"), false);
assert.equal(applied.world.sites[0].detailedState.structureSlots.length, 4);
assert.equal(applied.world.regions[0].structureCapacity, 4,
  "fixed Map Lab capacity bypasses the default run roll");

console.log("[map-lab-v4] OK");
