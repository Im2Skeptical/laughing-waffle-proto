// Housing overflow takes unreserved Strangers first, then Villagers for the
// remainder. Equal cohorts of 30 against capacity 30 must move 30 Strangers.
// That scenario saves at housing second 3, then advances the loaded copy, the
// live state, and rebuildStateAtSecond to second 9 and compares raw JSON.
// Other cases use stepDetailedSettlementsSecond and are not replay.
// Fixture pins: cedar-woods housing 30, overHousingNegativeRatio 1.2.
import assert from "node:assert/strict";
import { canonicalizeSnapshot } from "../src/model/canonicalize.js";
import {
  getDetailedSettlement,
  getHousingCapacity,
  stepDetailedSettlementsSecond,
} from "../src/model/detailed-settlements.js";
import { validSpecialistCohorts } from "../src/model/detailed-settlements/cohorts.js";
import { getMoonPhaseAtSecond } from "../src/model/moon-phases.js";
import { runHousingPhase } from "../src/model/detailed-settlements/phases/housing.js";
import {
  advanceReplayStateToSecond,
  initializeReplayClock,
} from "../src/model/replay-second-runner.js";
import { deserializeGameState, serializeGameState } from "../src/model/state.js";
import {
  createTimelineFromInitialState,
  rebuildStateAtSecond,
} from "../src/model/timeline/index.js";
import {
  clearDetailedPopulationAndFood,
  disableMonthlyDemographics,
  fresh,
} from "../src/model/tests/detailed-settlements/helpers.js";

const REGION = "cedar-woods";
const HOUSING_CAPACITY = 30;
const NEGATIVE_RATIO = 1.2;

function prepared() {
  const state = disableMonthlyDemographics(clearDetailedPopulationAndFood(fresh(880)));
  state.gameConfig.settings.values.primordialBasePressure = 0;
  state.gameConfig.gamepieces.practices.forage.effects[0].amount = 0;
  assert.equal(getHousingCapacity(state, REGION), HOUSING_CAPACITY);
  assert.equal(state.gameConfig.settings.values.overHousingNegativeRatio, NEGATIVE_RATIO);
  return { state, settlement: getDetailedSettlement(state, REGION) };
}

function stockMeals(settlement, people) {
  settlement.practiceSlots[0] = {
    practiceId: "forage",
    stock: Math.ceil(people / 30) + 2,
    tier: "bronze",
    charge: 0,
    work: 0,
  };
}

function setAdults(settlement, villagers, strangers) {
  settlement.populationByClass.villager.adults = villagers;
  settlement.populationByClass.stranger.adults = strangers;
  assert.equal(validSpecialistCohorts(settlement.populationByClass.villager), true);
  assert.equal(validSpecialistCohorts(settlement.populationByClass.stranger), true);
}

function jsonRoundTrip(state) {
  const encoded = serializeGameState(state);
  assert.deepEqual(serializeGameState(deserializeGameState(encoded)), encoded);
  return encoded;
}

function stepToHousing(state) {
  stepDetailedSettlementsSecond(state, 1);
  stepDetailedSettlementsSecond(state, 2);
  stepDetailedSettlementsSecond(state, 3);
  const phase = getMoonPhaseAtSecond(state, 3);
  assert.equal(phase.id, "housing");
  assert.equal(phase.boundary, true);
}

function housingReport(state) {
  return state.civilization.currentMoonTurn.regions[REGION].housing;
}

function housingIntents(state) {
  return state.civilization.currentMoonTurn.migrationIntents.filter((intent) =>
    intent.reason === "housing" && intent.sourceId === REGION);
}

const noOverflow = prepared();
{
  setAdults(noOverflow.settlement, 15, 15);
  stockMeals(noOverflow.settlement, HOUSING_CAPACITY);
  jsonRoundTrip(noOverflow.state);
  stepToHousing(noOverflow.state);
  const report = housingReport(noOverflow.state);
  assert.equal(report.capacity, HOUSING_CAPACITY);
  assert.equal(report.population, HOUSING_CAPACITY);
  assert.equal(report.overflow, 0);
  assert.equal(report.migrants, 0);
  assert.equal(report.happinessCap, "positive");
  assert.equal(housingIntents(noOverflow.state).length, 0);
  jsonRoundTrip(noOverflow.state);
}

const strangerFirst = prepared();
{
  const strangers = HOUSING_CAPACITY;
  const villagers = 1;
  const people = strangers + villagers;
  setAdults(strangerFirst.settlement, villagers, strangers);
  stockMeals(strangerFirst.settlement, people);
  canonicalizeSnapshot(strangerFirst.state);
  const before = jsonRoundTrip(strangerFirst.state);
  initializeReplayClock(strangerFirst.state, 0);
  const timeline = createTimelineFromInitialState(strangerFirst.state);
  const advanced = advanceReplayStateToSecond(strangerFirst.state, 3);
  assert.equal(advanced.ok, true);
  assert.equal(advanced.currentSec, 3);
  const report = housingReport(strangerFirst.state);
  assert.equal(report.overflow, 1);
  assert.equal(report.migrants, 1);
  assert.equal(report.happinessCap, "neutral");
  assert.ok(people <= HOUSING_CAPACITY * NEGATIVE_RATIO);
  const intents = housingIntents(strangerFirst.state);
  assert.equal(intents.length, 1);
  assert.equal(intents[0].composition.stranger.adults, 1);
  assert.equal(intents[0].composition.villager.adults, 0);
  const rebuilt = rebuildStateAtSecond(timeline, 3);
  assert.equal(rebuilt.ok, true);
  assert.deepEqual(serializeGameState(rebuilt.state), serializeGameState(strangerFirst.state));
  assert.notDeepEqual(serializeGameState(strangerFirst.state), before);
  const reserved = deserializeGameState(serializeGameState(strangerFirst.state));
  runHousingPhase(reserved, getMoonPhaseAtSecond(reserved, reserved.tSec));
  const again = housingIntents(reserved);
  assert.equal(again.length, 1, "already reserved overflow is not reserved twice");
  assert.equal(again[0].requested, 1);
}

const shared = prepared();
{
  setAdults(shared.settlement, HOUSING_CAPACITY, HOUSING_CAPACITY);
  stockMeals(shared.settlement, HOUSING_CAPACITY * 2);
  canonicalizeSnapshot(shared.state);
  initializeReplayClock(shared.state, 0);
  const timeline = createTimelineFromInitialState(shared.state);
  const atHousing = advanceReplayStateToSecond(shared.state, 3);
  assert.equal(atHousing.ok, true);
  assert.equal(atHousing.currentSec, 3);
  const report = housingReport(shared.state);
  assert.equal(report.capacity, HOUSING_CAPACITY);
  assert.equal(report.overflow, HOUSING_CAPACITY);
  assert.equal(report.migrants, HOUSING_CAPACITY);
  assert.ok(HOUSING_CAPACITY * 2 > HOUSING_CAPACITY * NEGATIVE_RATIO);
  assert.equal(report.happinessCap, "negative");
  const intent = housingIntents(shared.state)[0];
  assert.equal(intent.composition.stranger.adults, HOUSING_CAPACITY);
  assert.equal(intent.composition.villager.adults, 0);
  const loaded = deserializeGameState(serializeGameState(shared.state));
  const continued = advanceReplayStateToSecond(shared.state, 9);
  const continuedLoaded = advanceReplayStateToSecond(loaded, 9);
  assert.equal(continued.ok, true);
  assert.equal(continuedLoaded.ok, true);
  const rebuilt = rebuildStateAtSecond(timeline, 9);
  assert.equal(rebuilt.ok, true);
  const liveJson = serializeGameState(shared.state);
  assert.deepEqual(serializeGameState(loaded), liveJson);
  assert.deepEqual(serializeGameState(rebuilt.state), liveJson);
}

const villagersAlso = prepared();
{
  setAdults(villagersAlso.settlement, 50, 10);
  stockMeals(villagersAlso.settlement, 60);
  stepToHousing(villagersAlso.state);
  const intent = housingIntents(villagersAlso.state)[0];
  assert.equal(intent.requested, 30);
  assert.equal(intent.composition.stranger.adults, 10, 'all available Strangers leave first');
  assert.equal(intent.composition.villager.adults, 20, 'Villagers cover the remaining overflow');
}

const atRatio = prepared();
{
  const people = HOUSING_CAPACITY * NEGATIVE_RATIO;
  assert.equal(people, 36);
  setAdults(atRatio.settlement, people - HOUSING_CAPACITY, HOUSING_CAPACITY);
  stockMeals(atRatio.settlement, people);
  stepToHousing(atRatio.state);
  const report = housingReport(atRatio.state);
  assert.equal(report.population, 36);
  assert.equal(report.happinessCap, "neutral");
  assert.equal(report.overflow, 6);
}

const boundary = prepared();
{
  const people = Math.floor(HOUSING_CAPACITY * NEGATIVE_RATIO) + 1;
  assert.equal(people, 37);
  assert.ok(people > HOUSING_CAPACITY * NEGATIVE_RATIO);
  assert.ok(HOUSING_CAPACITY * NEGATIVE_RATIO === 36);
  setAdults(boundary.settlement, people - HOUSING_CAPACITY, HOUSING_CAPACITY);
  stockMeals(boundary.settlement, people);
  stepToHousing(boundary.state);
  const report = housingReport(boundary.state);
  assert.equal(report.happinessCap, "negative");
  assert.equal(report.overflow, people - HOUSING_CAPACITY);
  assert.equal(report.migrants, people - HOUSING_CAPACITY);
}

console.log("[housing-phase-boundaries] OK");
