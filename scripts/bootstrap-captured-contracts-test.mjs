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
  assert.equal(values.primordialBasePressure, 0.1);
  assert.equal(values.primordialGrowthFactor, 1.1);
  assert.equal(values.monsterProgressPerChaosRatio, 0.8);
  assert.equal(state.world.sites.length,20);
  assert.equal(state.rulesetId,'full-map-redesign-v1');
  assert.ok(state.world.sites.every(site=>!site.neutral&&site.detailedState.practiceSlots.length===5));
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

// The full-map experiment preserves Starter_02 coefficients, not the old
// six-site extinction-year calibration. Exercise every formerly pinned seed
// through 40 years of real full-map phases and compare resistance monotonically.
const openingRoads = new Set();
for(const seed of [1,2,4,6,7,8,12,18,30]) {
  const a=initializeReplayClock(createNewGameState(seed));
  const b=initializeReplayClock(createNewGameState(seed));
  b.gameConfig.settings.values.populationChaosResistanceMultiplier=3;
  openingRoads.add(a.world.regions.filter(r=>r.controller==='player').map(r=>r.id).join('/'));
  for(let sec=1;sec<=1280;sec++){
    if(!a.runStatus?.complete)assert(advanceReplayStateOneSecond(a).ok);
    if(!b.runStatus?.complete)assert(advanceReplayStateOneSecond(b).ok);
  }
  assert.equal(a.world.sites.length,20);
  assert.equal(b.world.sites.length,20);
  assert.ok(b.civilization.chaos.expansionEvents<=a.civilization.chaos.expansionEvents);
  assert.deepEqual(serializeGameState(deserializeGameState(serializeGameState(a))),serializeGameState(a));
}
assert.equal(openingRoads.size,9);
console.log('[bootstrap-captured-contracts] nine full-map starts, 40-year resistance and round-trip checks OK');
