import assert from "node:assert/strict";
import { createConfiguredNewGameState, createNewGameState } from "../src/model/new-game.js";
import { createStarterBootProfile } from "../src/model/starter-boot-profile.js";
import { deserializeGameState, serializeGameState } from "../src/model/state.js";
import { getWorldDefinition } from "../src/model/world-state.js";

const SEEDS = [11, 735, 7919];

function firstPlayerDetailedSite(state) {
  const playerIds = new Set(
    state.world.regions.filter((region) => region.controller === "player").map((region) => region.id)
  );
  const order = getWorldDefinition(state).regions.map((region) => region.id);
  const site = order
    .map((id) => state.world.sites.find((entry) => entry.regionId === id))
    .find((entry) => entry?.simulationMode === "detailed"
      && entry.detailedState
      && !entry.neutral
      && playerIds.has(entry.regionId));
  assert.ok(site, "a player detailed site exists");
  return site;
}

for (const seed of SEEDS) {
  const state = createNewGameState(seed);
  const capital = firstPlayerDetailedSite(state);
  assert.equal(
    state.civilization.capitalRegionId,
    capital.regionId,
    "capital is the first player detailed site in authored region order"
  );
  assert.equal(state.civilization.capitalSiteId, capital.id);
  const values = state.gameConfig.settings.values;
  assert.equal(values.prematureDeathChaosWeight, 0);
  assert.equal(values.externalEmigrationChaosWeight, 0);
  assert.equal(values.primordialBasePressure, 1);
  assert.equal(values.primordialGrowthFactor, 1.2);
  const neutrals = state.world.sites.filter((site) => site.neutral);
  assert.equal(neutrals.length, 4);
  for (const site of neutrals) {
    assert.ok(site.detailedState.practiceSlots.every((slot) => slot == null), `${site.id} practices stay empty`);
    assert.ok(site.detailedState.structureSlots.every((slot) => slot == null), `${site.id} structures stay empty`);
  }
  const saved = serializeGameState(state);
  const loaded = deserializeGameState(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(serializeGameState(loaded), saved);
}

const editedProfile = createStarterBootProfile();
editedProfile.gameSettings.values.prematureDeathChaosWeight = 7;
editedProfile.gameSettings.values.externalEmigrationChaosWeight = 8;
editedProfile.gameSettings.values.primordialBasePressure = 9;
editedProfile.gameSettings.values.primordialGrowthFactor = 1.5;
const edited = createConfiguredNewGameState(11, editedProfile);
assert.equal(edited.gameConfig.settings.values.prematureDeathChaosWeight, 7);
assert.equal(edited.gameConfig.settings.values.externalEmigrationChaosWeight, 8);
assert.equal(edited.gameConfig.settings.values.primordialBasePressure, 9);
assert.equal(edited.gameConfig.settings.values.primordialGrowthFactor, 1.5);

console.log("[bootstrap-captured-contracts] OK");
