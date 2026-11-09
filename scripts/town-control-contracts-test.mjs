// Town activation cycle. Authored host caps and storefront inventories are literals.
// Expectations are not computed by stockCapacity or transitionTown.
import assert from 'node:assert/strict';
import {createNewGameState} from '../src/model/new-game.js';
import {serializeGameState, deserializeGameState} from '../src/model/state.js';
import {getGameSetting} from '../src/model/game-config.js';
import {populationBins, writePopulationBins} from '../src/model/detailed-settlements/population-ledger.js';
import {changeController, resolveControl, controlSummary} from '../src/model/detailed-settlements/territory.js';
import {conquerSettlement} from '../src/model/detailed-settlements/external-world.js';
import {initializeReplayClock, advanceReplayStateToSecond} from '../src/model/replay-second-runner.js';
import {createTimelineFromInitialState, rebuildStateAtSecond} from '../src/model/timeline/index.js';

let checks = 0;
const eq = (actual, expected, name) => { checks += 1; assert.equal(actual, expected, name); };
const deep = (actual, expected, name) => { checks += 1; assert.deepEqual(actual, expected, name); };
const holder = (state, id) => state.world.regions.find(region => region.id === id).controller;
const binsOf = site => populationBins(site.detailedState)
  .map(bin => [bin.classId, bin.allegiance, bin.specialty, bin.kind, bin.age ?? '', bin.count].join('|'))
  .sort();
const hostsOf = site => Object.fromEntries(site.detailedState.practiceSlots.filter(Boolean).map(slot => [slot.practiceId, slot.stock]));
const idsOf = site => site.detailedState.practiceSlots.filter(Boolean).map(slot => slot.instanceId);
const goodsOf = site => Object.fromEntries((site.neutral ?? site.town.market).stocks.map(goods => [goods.id, goods.stock]));
const seedCohorts = pop => {
  const children = Math.floor(pop / 4);
  return [`villager|neutral|ordinary|adults||${pop - children}`, `villager|neutral|ordinary|children||${children}`].sort();
};
// Profile inventories are floor(capacity/2). Starter host caps: Scrub 1, Flocks 2,
// Fields/Quern 4, Woodlot 3, Rubble 2, and Hearth Barter 1. Other inherited hosts
// have no matching opening goods. See docs/starter-economy.md.
// First matching host fills; leftover storefront units are cleared so they are not duplicated.
const OPEN = {
  forager: {food: 6},
  grain: {food: 6, grain: 6},
  timber: {food: 6, timber: 5},
  quarry: {stone: 5, ore: 4},
  market: {food: 9, timber: 6, stone: 6, ore: 5},
};
const EXPECT = {
  forager: {rm_scrubForaging: 1, fm_hearthBarter: 0, rm_neglectedFlocks: 2, rm_withheldSpoils: 0},
  grain: {fm_fallowFields: 4, fm_handQuern: 4, rm_scrubForaging: 1, fm_hearthBarter: 0, rm_saltMonopoly: 0},
  timber: {fm_woodlotRights: 3, fm_hearthBarter: 0, rm_siltedChannels: 0, rm_rottingPulpVat: 0, rm_splinteredBowWorkshop: 0},
  quarry: {fm_rubblePicking: 2, fm_hearthBarter: 0, fm_scrapGathering: 0, fm_peatCutting: 0, rm_scrubForaging: 0},
  market: {rm_scrubForaging: 1, fm_fallowFields: 4, fm_hearthBarter: 0, rm_falsifiedLedgers: 0, rm_saltMonopoly: 0},
};
const POP = {forager: 18, grain: 30, timber: 24, quarry: 30, market: 60};
const zeroGoods = stocks => stocks.map(() => 0);

function assertActivated(state, town, type, faction) {
  const slots = town.detailedState.practiceSlots.filter(Boolean);
  eq(holder(state, town.regionId), faction, `${type}-holder`);
  eq(town.town.activated, true, `${type}-activated-once`);
  eq(town.neutral, undefined, `${type}-storefront-closed`);
  deep(hostsOf(town), EXPECT[type], `${type}-hosts`);
  deep(town.town.market.stocks.map(goods => goods.stock), zeroGoods(town.town.market.stocks), `${type}-no-duplicate`);
  eq(slots.length, town.town.market.practices.length, `${type}-recipe-count`);
  eq(slots.some(slot => Object.hasOwn(slot, 'allegiance')), false, `${type}-resource-has-no-allegiance`);
  eq(town.detailedState.practiceSlots.length, 5, `${type}-board-width`);
  eq(town.detailedState.structureSlots.filter(Boolean).map(slot => slot.structureId).join(','), 'fm_crowdedTenement', `${type}-house`);
}

function directCapture(seed, type) {
  const state = createNewGameState(seed);
  const town = state.world.sites.find(site => site.neutral && site.town.type === type);
  const before = binsOf(town);
  const nextId = state.civilization.nextPracticeInstanceId;
  deep(before, seedCohorts(POP[type]), `${type}-opening-cohorts`);
  deep(goodsOf(town), OPEN[type], `${type}-opening-inventory`);
  eq(town.town.activated, false, `${type}-starts-inactive`);
  changeController(state, town.regionId, 'player');
  assertActivated(state, town, type, 'player');
  deep(binsOf(town), before, `${type}-cohorts-kept`);
  eq(state.civilization.nextPracticeInstanceId, nextId + town.town.market.practices.length, `${type}-instance-ids`);
  const again = idsOf(town);
  changeController(state, town.regionId, 'external-a');
  deep(idsOf(town), again, `${type}-second-faction-does-not-reinstall`);
  deep(hostsOf(town), EXPECT[type], `${type}-second-faction-does-not-repour`);
}

// Capacity corners that seed 7 does not use for the long cycle.
directCapture(42, 'forager');
directCapture(1, 'market');

// Peaceful claim: 74/100 does not activate. 75/100 external-a does, on the second check only.
{
  const state = createNewGameState(7);
  const grain = state.world.sites.find(site => site.neutral && site.town.type === 'grain');
  const timber = state.world.sites.find(site => site.neutral && site.town.type === 'timber');
  deep(goodsOf(grain), OPEN.grain, 'grain-opening-inventory');
  deep(binsOf(grain), seedCohorts(POP.grain), 'grain-opening-cohorts');
  const below = [
    {classId: 'villager', allegiance: 'player', specialty: 'scholar', kind: 'adults', age: null, count: 74},
    {classId: 'villager', allegiance: 'neutral', specialty: 'ordinary', kind: 'children', age: null, count: 26},
  ];
  writePopulationBins(grain.detailedState, below);
  const belowSig = binsOf(grain);
  const inventory = goodsOf(grain);
  resolveControl(state); resolveControl(state);
  eq(holder(state, grain.regionId), 'frontier', 'below-claim-stays');
  eq(grain.town.activated, false, 'below-claim-inactive');
  deep(goodsOf(grain), inventory, 'below-claim-inventory');
  deep(binsOf(grain), belowSig, 'below-claim-cohorts');
  eq(timber.town.activated, false, 'other-town-stays-inactive');
  const claimed = [
    {classId: 'villager', allegiance: 'external-a', specialty: 'warrior', kind: 'elder', age: 61, count: 55},
    {classId: 'villager', allegiance: 'external-a', specialty: 'ordinary', kind: 'children', age: null, count: 20},
    {classId: 'villager', allegiance: 'player', specialty: 'scholar', kind: 'adults', age: null, count: 10},
    {classId: 'stranger', allegiance: 'neutral', specialty: 'ordinary', kind: 'adults', age: null, count: 15},
  ];
  writePopulationBins(grain.detailedState, claimed);
  const claimedSig = binsOf(grain);
  const nextId = state.civilization.nextPracticeInstanceId;
  resolveControl(state);
  eq(holder(state, grain.regionId), 'frontier', 'claim-waits');
  eq(grain.town.activated, false, 'claim-waits-inactive');
  eq(grain.detailedState.control.claimant, 'external-a', 'claimant-is-external-a');
  resolveControl(state);
  assertActivated(state, grain, 'grain', 'external-a');
  deep(binsOf(grain), claimedSig, 'claim-conserves-cohorts');
  eq(state.civilization.nextPracticeInstanceId, nextId + 5, 'claim-instance-ids');
  eq(grain.detailedState.control.unrest, 40, 'peaceful-unrest');
  const installed = idsOf(grain);
  resolveControl(state);
  deep(idsOf(grain), installed, 'claim-exact-once');
  deep(hostsOf(grain), EXPECT.grain, 'claim-hosts-stay');
  deep(goodsOf(timber), OPEN.timber, 'witness-inventory-untouched');
}

// Military capture, one legal birth second, loss, neutral refill, reacquisition.
{
  const state = initializeReplayClock(createNewGameState(7));
  eq(getGameSetting(state, 'phaseDurationSec'), 1, 'phase-duration');
  const quarry = state.world.sites.find(site => site.neutral && site.town.type === 'quarry');
  const timber = state.world.sites.find(site => site.neutral && site.town.type === 'timber');
  const grain = state.world.sites.find(site => site.neutral && site.town.type === 'grain');
  const fingerprint = serializeGameState(state);
  controlSummary(state, quarry.regionId);
  deep(serializeGameState(state), fingerprint, 'pure-read');
  eq(fingerprint.paused, false, 'paused');
  eq(fingerprint.phase, 'simulation', 'phase');
  eq(fingerprint.tSec, 0, 'tSec');
  eq(typeof fingerprint.rng, 'object', 'rng');
  deep(binsOf(quarry), seedCohorts(POP.quarry), 'quarry-opening-cohorts');
  deep(goodsOf(quarry), OPEN.quarry, 'quarry-opening-inventory');
  const nextId = state.civilization.nextPracticeInstanceId;
  eq(conquerSettlement(state, quarry.regionId, 0).ok, true, 'military-capture');
  assertActivated(state, quarry, 'quarry', 'player');
  deep(binsOf(quarry), seedCohorts(POP.quarry), 'military-cohorts-kept');
  eq(quarry.detailedState.control.unrest >= 50, true, 'military-unrest');
  eq(state.civilization.nextPracticeInstanceId, nextId + 5, 'military-instance-ids');
  const capturedIds = idsOf(quarry);
  conquerSettlement(state, quarry.regionId, 0);
  deep(idsOf(quarry), capturedIds, 'military-exact-once');
  const developedTimeline = createTimelineFromInitialState(state);
  eq(advanceReplayStateToSecond(state, 1).ok, true, 'develop-tick');
  const developedReplay = rebuildStateAtSecond(developedTimeline, 1);
  eq(developedReplay.ok, true, 'develop-replay');
  deep(serializeGameState(developedReplay.state), serializeGameState(state), 'develop-replay-state');
  const developedHosts = hostsOf(quarry);
  const developedBins = binsOf(quarry);
  const developedIds = idsOf(quarry);
  eq(developedHosts.fm_rubblePicking, 2, 'developed-rubble');
  eq(developedHosts.fm_hearthBarter <= 1 && developedHosts.fm_hearthBarter >= 0, true, 'developed-barter-cap');
  eq(developedBins.every(row => row.startsWith('villager|neutral|ordinary|')), true, 'develop-keeps-allegiance-and-specialty');
  deep(binsOf(timber), seedCohorts(POP.timber), 'timber-static-at-develop');
  deep(goodsOf(timber), OPEN.timber, 'timber-stock-before-food');
  resolveControl(state);
  eq(holder(state, quarry.regionId), 'player', 'military-retains-one-check');
  eq(quarry.detailedState.control.unrest, 65, 'military-first-unrest');
  eq(quarry.detailedState.control.lossChecks, 0, 'military-first-loss-count');
  resolveControl(state);
  eq(holder(state, quarry.regionId), 'player', 'military-retains-first-unsupported-check');
  eq(quarry.detailedState.control.unrest, 80, 'military-second-unrest');
  eq(quarry.detailedState.control.lossChecks, 1, 'military-second-loss-count');
  resolveControl(state);
  eq(holder(state, quarry.regionId), 'frontier', 'military-retention-fails');
  eq(quarry.neutral != null, true, 'loss-reopens-storefront');
  deep(goodsOf(quarry), {stone: 0, ore: 0}, 'loss-reopens-emptied-market');
  deep(hostsOf(quarry), developedHosts, 'loss-freezes-hosts');
  deep(binsOf(quarry), developedBins, 'loss-freezes-cohorts');
  deep(idsOf(quarry), developedIds, 'loss-keeps-instances');
  const house = quarry.detailedState.structureSlots[0];
  const refillTimeline = createTimelineFromInitialState(state);
  eq(advanceReplayStateToSecond(state, 8).ok, true, 'refill-tick');
  const refillReplay = rebuildStateAtSecond(refillTimeline, 8);
  eq(refillReplay.ok, true, 'refill-replay');
  const live = serializeGameState(state);
  deep(serializeGameState(refillReplay.state), live, 'refill-replay-state');
  eq(live.tSec, 8, 'refill-tSec');
  eq(live.paused, false, 'refill-paused');
  eq(live.phase, 'simulation', 'refill-phase');
  eq(JSON.stringify(live.rng), JSON.stringify(serializeGameState(refillReplay.state).rng), 'refill-rng');
  // Food boundaries from t=1 to t=8 are t=2 and t=8. Stone, ore and timber have no buyer in this
  // window. Edible shelves can be bought by neighbours after replenishment, so they are capped only.
  deep(goodsOf(quarry), {stone: 4, ore: 4}, 'quarry-refill');
  eq(goodsOf(timber).timber, 9, 'timber-refill');
  for (const site of [quarry, timber, grain]) {
    for (const goods of site.neutral.stocks) eq(goods.stock >= 0 && goods.stock <= goods.capacity, true, `${site.town.type}-${goods.id}-cap`);
  }
  deep(hostsOf(quarry), developedHosts, 'refill-does-not-touch-hosts');
  deep(binsOf(quarry), developedBins, 'refill-static-cohorts');
  deep(binsOf(timber), seedCohorts(POP.timber), 'timber-static-cohorts');
  deep(binsOf(grain), seedCohorts(POP.grain), 'grain-static-cohorts');
  eq(timber.town.activated, false, 'witness-never-activated');
  const copy = deserializeGameState(serializeGameState(state));
  changeController(state, quarry.regionId, 'player');
  changeController(copy, quarry.regionId, 'player');
  deep(serializeGameState(copy), serializeGameState(state), 'reacquire-replay');
  eq(quarry.neutral, undefined, 'reacquire-closes-storefront');
  deep(goodsOf(quarry), {stone: 4, ore: 4}, 'reacquire-keeps-refill');
  deep(hostsOf(quarry), developedHosts, 'reacquire-does-not-repour');
  deep(binsOf(quarry), developedBins, 'reacquire-conserves-cohorts');
  deep(idsOf(quarry), developedIds, 'reacquire-exact-once');
  eq(state.civilization.nextPracticeInstanceId, nextId + 5, 'reacquire-no-new-instances');
  deep(quarry.detailedState.structureSlots[0], house, 'reacquire-keeps-house');
}

console.log(`[town-control] ${checks} checks: capacity transfer, claim gates, military retention, refill, reacquisition OK`);
