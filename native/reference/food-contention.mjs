import { strict as assert } from "node:assert";
import { populationBins, writePopulationBins } from "../../src/model/detailed-settlements/population-ledger.js";
import { deserializeGameState, serializeGameState } from "../../src/model/state.js";

export function createFoodContention(start) {
  const snapshot = serializeGameState(start);
  const site = id => snapshot.world.sites.find(entry => entry.regionId === id).detailedState;
  const board = (id, ...slots) => {
    const local = site(id);
    local.practiceSlots = Array.from({ length: 5 }, (_, index) => {
      if (!slots[index]) return null;
      const [practiceId, stock] = slots[index];
      const instanceId = local.practiceSlots[index]?.instanceId ?? `food-probe:${id}:${index}`;
      return { practiceId, stock, instanceId, tier: "gold", work: 0, charge: 0 };
    });
  };
  const provisions = amount => ["fm_fallowFields", amount];
  Object.assign(snapshot.gameConfig.settings.values, {
    birthRateGold: 0,
    birthRateDiamond: 0,
    partialFeedMemoryLength: 2,
  });
  board("R01", provisions(2), ["rationing", 0]);
  board("R03", provisions(5));
  board("R04", provisions(0));
  board("R05", provisions(1));
  board("R06", provisions(0));
  board("R09", ["saltGathering", 3]);
  board("R10", provisions(2));
  board("R11", provisions(2));
  board("R16", provisions(1));
  board("R18", provisions(0));

  // Crown borrowers compete for the one surplus Edible in the R03–R04–R05
  // network. R09 instead has to purchase food from the R02 market.
  const r04 = site("R04");
  writePopulationBins(r04, populationBins(r04).map(bin =>
    bin.kind === "children" ? { ...bin, classId: "stranger" } : bin));
  r04.populationByClass.villager.happiness.partialFeedRatios = [0.5];
  site("R03").populationByClass.villager.happiness.fullFeedStreak = 11;
  site("R06").populationByClass.villager.happiness.missedFeedStreak = 2;
  site("R18").populationByClass.villager.happiness.missedFeedStreak = 1;
  // Calendar Keeping normally writes this at Birth. The probe isolates the
  // subsequent seasonal generation from the Birth stage under development.
  site("R16").seasonalFoodBoost = { year: 1, practiceId: "fm_fallowFields", amount: 2, seasons: [] };
  snapshot.civilization.phaseModifiers.foodByRegion = { R05: 8 };

  for (const [id, origin] of [["R01", 2], ["R05", 3], ["R09", 3]]) {
    const local = site(id);
    local.structureSlots[origin] = {
      structureId: "fe_marshalsCitadel", placementId: `food-probe:${id}:citadel`, origin, width: 3,
    };
  }
  site("R09").garrison = { supplied: false, paid: 0, required: 0, tSec: 0, supportTargetRegionId: null };
  return deserializeGameState(snapshot);
}

export function checkFoodContention(state) {
  const site = id => state.world.sites.find(entry => entry.regionId === id);
  const results = state.civilization.currentMoonTurn.regions;
  assert.deepEqual(state.civilization.phaseModifiers.foodByRegion, { R01: 1 });
  assert.equal(results.R03.food.consumed, 4);
  assert.equal(results.R03.food.byClass.villager.targetHappiness, "positive");
  assert.equal(site("R03").detailedState.populationByClass.villager.happiness.fullFeedStreak, 0);
  assert.equal(results.R05.food.consumed, 1);
  assert.equal(results.R04.food.consumed, 1);
  assert.equal(results.R04.food.byClass.villager.ratio, 0.6667);
  assert.equal(results.R04.food.byClass.villager.targetHappiness, "positive");
  assert.equal(results.R04.food.byClass.stranger.consumed, 0);
  assert.equal(results.R06.food.byClass.villager.migrants, 19);
  assert.equal(site("R06").detailedState.populationByClass.villager.happiness.missedFeedStreak, 3);
  assert.equal(results.R18.food.byClass.villager.migrants, 0);
  assert.equal(site("R18").detailedState.populationByClass.villager.happiness.missedFeedStreak, 2);
  assert.equal(results.R09.currencySpent, 3);
  assert.equal(site("R02").neutral.stocks[0].stock, 6);
  assert.equal(site("R01").detailedState.garrison.paid, 2);
  assert.equal(site("R09").detailedState.garrison.paid, 2);
  assert.equal(site("R09").detailedState.garrison.supportTargetRegionId, null);
  assert.equal(site("R05").detailedState.garrison.supplied, false);
  assert.equal(site("R05").detailedState.garrison.required, 2);
  const transfers = state.civilization.practiceEvents.stockTransfers.transfers;
  assert.ok(transfers.some(transfer => transfer.reason === "food" &&
    transfer.sourceRegionId === "R03" && transfer.destinationRegionId === "R04"));
  assert.ok(transfers.some(transfer => transfer.reason === "food" &&
    transfer.sourceRegionId === "R02" && transfer.destinationRegionId === "R09"));
}

export function checkSeasonalFoodBoost(state) {
  const { detailedState } = state.world.sites.find(entry => entry.regionId === "R16");
  assert.deepEqual(detailedState.seasonalFoodBoost.seasons, ["autumn"]);
  assert.ok(state.civilization.practiceEvents.trace.some(event => event.tSec === 17 &&
    event.kind === "stockGenerated" && event.regionId === "R16" &&
    event.practiceId === "fm_fallowFields" && event.amount >= 3));
}
