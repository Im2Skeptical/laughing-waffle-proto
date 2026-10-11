import assert from "node:assert/strict";
import { createConfiguredNewGameState, createNewGameState } from "../src/model/new-game.js";
import { createStarterBootProfile } from "../src/model/starter-boot-profile.js";
import { deserializeGameState, serializeGameState } from "../src/model/state.js";
import { getWorldDefinition } from "../src/model/world-state.js";
import { initializeReplayClock, advanceReplayStateOneSecond } from "../src/model/replay-second-runner.js";

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

// Every authored starting road must give an untouched New Game 150–250 years.
// Use the official tick/replay path, including population, faith and spatial losses.
const openingRoads = new Set();
const extinctionYears = [];
for (const seed of [1, 2, 4, 6, 7, 8, 12, 18, 30]) {
  const opening = initializeReplayClock(createNewGameState(seed));
  openingRoads.add(opening.world.regions.filter(region => region.controller === 'player').map(region => region.id).join('/'));
  while (!opening.runStatus?.complete && opening.year <= 250) {
    assert.equal(advanceReplayStateOneSecond(opening).ok, true, `opening ${seed} advances`);
  }
  assert.equal(opening.runStatus?.reason, 'redGodMonsterOverrun', `opening ${seed} ends through Monster expansion`);
  assert.ok(opening.year >= 150 && opening.year <= 250,
    `opening ${seed} extinction year ${opening.year} must be within 150–250`);
  extinctionYears.push(opening.year);
}
assert.equal(openingRoads.size, 9, 'balance coverage includes all nine starting roads');
console.log(`[opening-balance] nine roads: extinction years ${Math.min(...extinctionYears)}–${Math.max(...extinctionYears)}`);

console.log("[bootstrap-captured-contracts] OK");
