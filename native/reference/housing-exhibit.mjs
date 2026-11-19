import assert from "node:assert/strict";
import { writePopulationBins } from "../../src/model/detailed-settlements/population-ledger.js";

const receiverId = "R09";
const donorId = "R16";

export function prepareHousingExhibit(state) {
  const local = id => state.world.sites.find(site => site.regionId === id).detailedState;
  const receiver = local(receiverId);
  const donor = local(donorId);
  const construction = (structureId, origin, completedCycles) => ({
    structureId, placementId: `housing-exhibit:${structureId}:${origin}:${completedCycles}`,
    origin, width: 1, construction: { completedCycles },
  });
  receiver.structureSlots[3] = construction("mudHouses", 3, 1);
  receiver.structureSlots[4] = construction("stoneHouse", 4, 0);
  donor.structureSlots[3] = { ...construction("mudHouses", 3, 2), qualityBonus: 1 };

  const practice = (practiceId, stock = 0) => ({
    practiceId, stock, tier: "bronze", work: 0, charge: 0,
    instanceId: `institution:${state.civilization.nextPracticeInstanceId++}`,
  });
  donor.practiceSlots[0] = practice("logging", 4);
  donor.practiceSlots[2] = practice("housebuilding");
  donor.practiceSlots[3] = practice("toolmaking", 1);
  donor.unlockedPracticeSlots = 4;
  const adults = (classId, allegiance, count) => ({
    classId, allegiance, count, kind: "adults", specialty: "ordinary",
  });
  writePopulationBins(receiver, [adults("villager", "player", 55), adults("stranger", "neutral", 10)]);
  writePopulationBins(donor, [adults("villager", "player", 70)]);
  state.civilization.phaseModifiers.housingByRegion = { [receiverId]: 50, [donorId]: 99 };
  return state;
}

export function checkHousingExhibit(state) {
  const local = id => state.world.sites.find(site => site.regionId === id).detailedState;
  const turn = state.civilization.currentMoonTurn;
  const receiver = turn.regions[receiverId].housing;
  const donor = turn.regions[donorId].housing;
  assert.equal(local(receiverId).structureSlots[4].construction?.completedCycles, 0);
  assert.equal(local(donorId).structureSlots[3].construction, undefined);
  assert.deepEqual(state.civilization.phaseModifiers.housingByRegion, { [donorId]: 6 });
  assert.equal(donor.capacity, 73);
  assert.equal(donor.happinessCap, "positive");
  const intent = turn.migrationIntents.find(i => i.reason === "housing" && i.sourceId === receiverId);
  assert.equal(intent.sourceClassId, null);
  if (state.tSec === 3) {
    assert.equal(local(receiverId).structureSlots[3].construction?.completedCycles, 2);
    assert.equal(receiver.capacity, 30);
    assert.equal(receiver.happinessCap, "negative");
    assert.equal(intent.composition.stranger.adults, 10);
    assert.ok(intent.composition.villager.adults > 0);
  } else {
    assert.equal(local(receiverId).structureSlots[3].construction, undefined);
    assert.equal(receiver.capacity, 60);
    assert.equal(receiver.happinessCap, "neutral");
    assert.equal(intent.composition.stranger.adults, receiver.migrants);
    assert.equal(intent.composition.villager.adults, 0);
  }
}

export function checkHousingFaithExhibit(state) {
  const { food, faith } = state.civilization.currentMoonTurn.regions[receiverId];
  assert.equal(food.byClass.villager.targetHappiness, "neutral");
  assert.equal(faith.byClass.villager.happiness, "negative");
}
