import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createNewGameState } from '../src/model/new-game.js';
import { serializeGameState, deserializeGameState } from '../src/model/state.js';
import { practiceSlot, fiveSlots, setFixturePopulation } from '../src/model/dev-lab/fixtures.js';
import { getDetailedSettlementSites } from '../src/model/detailed-settlements/queries.js';
import { assignDetailedSettlementWorkers, evaluateDetailedPracticeSlot, getPhaseModifiers, runPracticeActivation } from '../src/model/detailed-settlements/practices.js';
import { runConstructionCycles } from '../src/model/detailed-settlements/construction.js';
import { runFoodPhase } from '../src/model/detailed-settlements/phases/food.js';
import { runHousingPhase } from '../src/model/detailed-settlements/phases/housing.js';
import { getMoonPhaseAtSecond, getMoonPhaseDurationSec } from '../src/model/moon-phases.js';
import { advanceReplayStateToSecond } from '../src/model/replay-second-runner.js';
import { createTimelineFromInitialState, rebuildStateAtSecond } from '../src/model/timeline/index.js';

// Literal outputs are the printed card bases. Staffed generateStock then applies
// the engine worker multiplier; that composition is recorded, not rewritten.
const results = [];
const failures = [];

function board(slots, { population = 0, scholars = 0, season = 0, tSec = 0 } = {}) {
  const state = createNewGameState(42);
  state.world.connections = [];
  state.currentSeasonIndex = season;
  for (const site of getDetailedSettlementSites(state)) {
    site.detailedState.practiceSlots = fiveSlots();
    site.detailedState.structureSlots.fill(null);
    setFixturePopulation(site.detailedState, 0);
  }
  const site = getDetailedSettlementSites(state, { playerOnly: true })[0];
  const local = site.detailedState;
  local.practiceSlots = fiveSlots(...slots);
  setFixturePopulation(local, population, scholars);
  state.tSec = tSec;
  state.simStepIndex = tSec * 60;
  return { state, site, local, region: site.regionId };
}

function defOf(f, id) {
  return f.state.gameConfig.gamepieces.practices[id];
}

function stocks(f) {
  return f.local.practiceSlots.map(slot => slot?.stock ?? null);
}

function providers(f, slotIndex = 0) {
  const evaluation = evaluateDetailedPracticeSlot(f.state, f.region, slotIndex);
  return {
    supplied: evaluation.supplied,
    missing: evaluation.missing,
    providers: evaluation.providers.map(provider => ({
      kind: provider.kind,
      regionId: provider.regionId,
      slotIndex: provider.slotIndex,
      practiceId: provider.practiceId,
      amount: provider.amount,
      traits: provider.traits,
      marketStockId: provider.marketStockId ?? null,
    })),
  };
}

function assignment(f) {
  return assignDetailedSettlementWorkers(f.state, f.region).map(row => ({
    slotIndex: row.slotIndex,
    practiceId: row.practiceId,
    effectiveWorkers: row.effectiveWorkers,
    specialists: row.tokens.map(token => token.specialist),
  }));
}

function sameSerialized(actual, expected, message) {
  assert.ok(JSON.stringify(serializeGameState(actual)) === JSON.stringify(serializeGameState(expected)), message);
}

function proseHas(def, snippet) {
  assert.equal(def.ui.rule.includes(snippet), true, `${def.id} prose: ${def.ui.rule}`);
}

function runCase(id, fn) {
  const record = { id };
  try {
    Object.assign(record, fn(record));
    record.ok = true;
  } catch (error) {
    record.ok = false;
    record.error = error.message;
    failures.push(id);
  }
  results.push(record);
}

runCase('saltCuring', () => {
  const success = board([practiceSlot('saltCuring'), practiceSlot('dryFarming', 1), practiceSlot('saltGathering', 1)]);
  const def = defOf(success, 'saltCuring');
  proseHas(def, '+4');
  proseHas(def, 'Consume 1 [Edible] + 1 [Salt]');
  assert.deepEqual(def.consume, [{ traits: ['Edible'], amount: 1 }, { traits: ['Salt'], amount: 1 }]);
  assert.deepEqual(def.effects, [{ op: 'generateStock', amount: 4 }]);
  const linked = providers(success);
  assert.equal(linked.supplied, true);
  assert.deepEqual(linked.providers, [
    { kind: 'consume', regionId: success.region, slotIndex: 1, practiceId: 'dryFarming', amount: 1, traits: ['Edible'], marketStockId: null },
    { kind: 'consume', regionId: success.region, slotIndex: 2, practiceId: 'saltGathering', amount: 1, traits: ['Salt'], marketStockId: null },
  ]);
  assert.deepEqual(assignment(success)[0], { slotIndex: 0, practiceId: 'saltCuring', effectiveWorkers: 0, specialists: [] });
  runPracticeActivation(success.state, 'food', 'preRouting');
  assert.deepEqual(stocks(success), [4, 0, 0, null, null]);
  const shortage = board([practiceSlot('saltCuring'), practiceSlot('dryFarming', 1), practiceSlot('saltGathering', 0)]);
  const blocked = providers(shortage);
  assert.equal(blocked.supplied, false);
  assert.deepEqual(blocked.missing, { kind: 'consume', traits: ['Salt'], amount: 1 });
  assert.deepEqual(blocked.providers, []);
  const before = stocks(shortage);
  runPracticeActivation(shortage.state, 'food', 'preRouting');
  assert.deepEqual(stocks(shortage), before);
  const ignored = board([practiceSlot('saltCuring'), practiceSlot('dryFarming', 1), practiceSlot('saltGathering', 1)]);
  runPracticeActivation(ignored.state, 'food', 'postRouting');
  assert.deepEqual(stocks(ignored), [0, 1, 1, null, null]);
  return { output: 4, shortage: 'salt blocks; Edible stays' };
});

runCase('blacksmithing', () => {
  const success = board([practiceSlot('blacksmithing'), practiceSlot('smelting', 1), practiceSlot('charcoalBurning', 1)]);
  const def = defOf(success, 'blacksmithing');
  proseHas(def, '+3');
  proseHas(def, 'Consume 1 [Metal] + 1 [Fuel]');
  assert.equal(def.activation.type, 'birth');
  assert.deepEqual(providers(success).providers, [
    { kind: 'consume', regionId: success.region, slotIndex: 1, practiceId: 'smelting', amount: 1, traits: ['Metal'], marketStockId: null },
    { kind: 'consume', regionId: success.region, slotIndex: 2, practiceId: 'charcoalBurning', amount: 1, traits: ['Fuel'], marketStockId: null },
  ]);
  runPracticeActivation(success.state, 'birth');
  assert.deepEqual(stocks(success), [3, 0, 0, null, null]);
  assert.equal(success.local.practiceSlots[1].charge, 0);
  assert.equal(success.local.practiceSlots[2].charge, 0);
  const shortage = board([practiceSlot('blacksmithing'), practiceSlot('smelting', 1), practiceSlot('charcoalBurning', 0)]);
  assert.deepEqual(providers(shortage).missing, { kind: 'consume', traits: ['Fuel'], amount: 1 });
  runPracticeActivation(shortage.state, 'birth');
  assert.deepEqual(stocks(shortage), [0, 1, 0, null, null]);
  return { output: 3, shortage: 'missing Fuel leaves Metal' };
});

runCase('housebuilding', () => {
  const open = (tool) => {
    const f = board([practiceSlot('housebuilding'), practiceSlot('logging', 2), practiceSlot('toolmaking', tool)], { tSec: 3 });
    return f;
  };
  const success = open(1);
  const def = defOf(success, 'housebuilding');
  proseHas(def, 'Consume 2 [Construction]');
  proseHas(def, 'Require 1 stocked [Tool]');
  proseHas(def, '+6 Housing');
  assert.equal(def.effects[0].amount, 6);
  assert.deepEqual(providers(success).providers, [
    { kind: 'require', regionId: success.region, slotIndex: 2, practiceId: 'toolmaking', amount: 1, traits: ['Tool'], marketStockId: null },
    { kind: 'consume', regionId: success.region, slotIndex: 1, practiceId: 'logging', amount: 2, traits: ['Construction'], marketStockId: null },
  ]);
  runHousingPhase(success.state, getMoonPhaseAtSecond(success.state));
  assert.equal(getPhaseModifiers(success.state).housingByRegion[success.region], 6);
  assert.deepEqual(stocks(success), [0, 0, 1, null, null]);
  runHousingPhase(success.state, getMoonPhaseAtSecond(success.state));
  assert.equal(getPhaseModifiers(success.state).housingByRegion[success.region], undefined);
  assert.deepEqual(stocks(success), [0, 0, 1, null, null], 'Tool require survives the phase reset; no second payment');
  const shortage = open(0);
  assert.deepEqual(providers(shortage).missing, { kind: 'require', traits: ['Tool'], amount: 1 });
  runHousingPhase(shortage.state, getMoonPhaseAtSecond(shortage.state));
  assert.equal(getPhaseModifiers(shortage.state).housingByRegion[shortage.region], undefined);
  assert.deepEqual(stocks(shortage), [0, 2, 0, null, null]);
  return { housing: 6, reusable: 'toolmaking', reset: 'next housing phase' };
});

runCase('rationing', () => {
  const food = (host) => board([practiceSlot('rationing'), host], { tSec: 2 });
  const record = food(practiceSlot('recordKeeping', 1));
  const def = defOf(record, 'rationing');
  proseHas(def, '[Record] or [Edible]');
  assert.deepEqual(def.require, [{ traits: ['Record', 'Edible'], amount: 1 }]);
  assert.equal(def.effects[0].op, 'reduceLocalFoodRequirement');
  assert.equal(def.effects[0].amount, 1);
  assert.deepEqual(providers(record).providers, [
    { kind: 'require', regionId: record.region, slotIndex: 1, practiceId: 'recordKeeping', amount: 1, traits: ['Record', 'Edible'], marketStockId: null },
  ]);
  const phase = getMoonPhaseAtSecond(record.state);
  runFoodPhase(record.state, phase);
  assert.equal(getPhaseModifiers(record.state).foodByRegion[record.region], 1);
  assert.equal(record.local.practiceSlots[1].stock, 1);
  runFoodPhase(record.state, phase);
  assert.equal(getPhaseModifiers(record.state).foodByRegion[record.region], 1, 'each Food phase resets, then grants 1 again');
  assert.equal(record.local.practiceSlots[1].stock, 1);
  const edible = food(practiceSlot('dryFarming', 1));
  assert.equal(providers(edible).providers[0].practiceId, 'dryFarming');
  runFoodPhase(edible.state, getMoonPhaseAtSecond(edible.state));
  assert.equal(getPhaseModifiers(edible.state).foodByRegion[edible.region], 1);
  assert.equal(edible.local.practiceSlots[1].stock, 1);
  const empty = food(practiceSlot('recordKeeping', 0));
  assert.equal(providers(empty).supplied, false);
  runFoodPhase(empty.state, getMoonPhaseAtSecond(empty.state));
  assert.equal(getPhaseModifiers(empty.state).foodByRegion[empty.region], undefined);
  assert.equal(empty.local.practiceSlots[1].stock, 0);
  return { amount: 1, traits: ['Record', 'Edible'], reset: 'food phase' };
});

runCase('dryFarming', () => {
  const amounts = { spring: 0, summer: 2, autumn: 6, winter: 0 };
  const seen = {};
  for (const [season, index] of [['spring', 0], ['summer', 1], ['autumn', 2], ['winter', 3]]) {
    const f = board([practiceSlot('dryFarming')], { season: index });
    const def = defOf(f, 'dryFarming');
    if (season === 'spring') {
      proseHas(def, 'Summer +2');
      proseHas(def, 'Autumn +6');
      assert.deepEqual(def.activation.seasonKeys, ['summer', 'autumn']);
      assert.deepEqual(def.effects[0].seasonAmounts, { summer: 2, autumn: 6 });
    }
    runPracticeActivation(f.state, 'season');
    seen[season] = f.local.practiceSlots[0].stock;
    assert.equal(seen[season], amounts[season], `dryFarming ${season}`);
  }
  return { amounts: seen };
});

runCase('logging', () => {
  const winter = board([practiceSlot('logging')], { season: 3 });
  proseHas(defOf(winter, 'logging'), 'Autumn +3');
  proseHas(defOf(winter, 'logging'), 'Spring +2');
  assert.deepEqual(defOf(winter, 'logging').activation.seasonKeys, ['spring', 'summer', 'autumn']);
  runPracticeActivation(winter.state, 'season');
  assert.equal(winter.local.practiceSlots[0].stock, 0);
  const autumn = board([practiceSlot('logging')], { season: 2 });
  runPracticeActivation(autumn.state, 'season');
  assert.equal(autumn.local.practiceSlots[0].stock, 3);
  const pending = board([practiceSlot('logging')], { season: 1 });
  const recipe = pending.state.gameConfig.gamepieces.structures.mudHouses.construction;
  assert.equal(recipe.cycles, 3);
  assert.equal(recipe.activation.type, 'housing');
  assert.deepEqual(recipe.consume, [{ traits: ['Construction'], amount: 1 }]);
  pending.local.structureSlots[0] = {
    structureId: 'mudHouses', origin: 0, width: 1, placementId: 'scheduled-mud-house',
    construction: { completedCycles: 2 },
  };
  runPracticeActivation(pending.state, 'season');
  assert.equal(pending.local.practiceSlots[0].stock, 2);
  assert.equal(pending.local.structureSlots[0].construction.completedCycles, 2);
  const restored = deserializeGameState(serializeGameState(pending.state));
  sameSerialized(pending.state, restored, 'pending construction cycle round-trips');
  runConstructionCycles(pending.state, 'housing');
  runConstructionCycles(restored, 'housing');
  sameSerialized(pending.state, restored, 'both continuations pay the same cycle');
  const paid = getDetailedSettlementSites(restored, { playerOnly: true })[0].detailedState;
  assert.equal(paid.practiceSlots[0].stock, 1);
  assert.equal(paid.structureSlots[0].construction, undefined);
  assert.equal(paid.structureSlots[0].structureId, 'mudHouses');
  return { winter: 0, autumn: 3, summerPaysCycle: true, stockAfterCompletion: 1 };
});

runCase('selectiveBreeding', () => {
  const open = (scholars, season) => board(
    [practiceSlot('selectiveBreeding'), practiceSlot('pastoralism', 1)],
    { population: scholars, scholars, season },
  );
  const blocked = open(0, 0);
  const def = defOf(blocked, 'selectiveBreeding');
  proseHas(def, '+2');
  proseHas(def, 'Consume 1 [Animal]');
  proseHas(def, 'Require Scholar worker');
  assert.equal(def.scholarRequired, true);
  assert.equal(def.effects[0].amount, 2);
  assert.equal(def.workerBonus, 1);
  assert.deepEqual(def.activation.seasonKeys, ['autumn']);
  runPracticeActivation(blocked.state, 'birth');
  assert.deepEqual(stocks(blocked), [0, 1, null, null, null]);
  const staffed = open(1, 0);
  assert.deepEqual(assignment(staffed)[0], { slotIndex: 0, practiceId: 'selectiveBreeding', effectiveWorkers: 1, specialists: ['scholar'] });
  assert.deepEqual(providers(staffed).providers, [
    { kind: 'consume', regionId: staffed.region, slotIndex: 1, practiceId: 'pastoralism', amount: 1, traits: ['Animal'], marketStockId: null },
  ]);
  runPracticeActivation(staffed.state, 'birth');
  assert.deepEqual(stocks(staffed), [4, 0, null, null, null], 'base 2 times one Scholar worker');
  const spring = open(1, 0);
  runPracticeActivation(spring.state, 'season');
  assert.deepEqual(stocks(spring), [0, 1, null, null, null]);
  const autumn = open(1, 2);
  runPracticeActivation(autumn.state, 'season');
  assert.deepEqual(stocks(autumn), [4, 0, null, null, null]);
  return { unstaffed: 0, staffedBirth: 4, spring: 0, autumn: 4, proseBase: 2 };
});

runCase('cropRotation', () => {
  const open = (season) => board([practiceSlot('cropRotation'), practiceSlot('papermaking', 1)], { season });
  const summer = open(1);
  const def = defOf(summer, 'cropRotation');
  proseHas(def, 'Require 1 stocked [Record]');
  proseHas(def, 'Summer +2');
  proseHas(def, 'Autumn +3');
  assert.deepEqual(def.require, [{ traits: ['Record'], amount: 1 }]);
  assert.deepEqual(def.consume, []);
  assert.deepEqual(providers(summer).providers, [
    { kind: 'require', regionId: summer.region, slotIndex: 1, practiceId: 'papermaking', amount: 1, traits: ['Record'], marketStockId: null },
  ]);
  runPracticeActivation(summer.state, 'season');
  runPracticeActivation(summer.state, 'season');
  assert.deepEqual(stocks(summer), [4, 1, null, null, null], 'Record require is reusable across activations');
  const winter = open(3);
  runPracticeActivation(winter.state, 'season');
  assert.deepEqual(stocks(winter), [0, 1, null, null, null]);
  const autumn = open(2);
  runPracticeActivation(autumn.state, 'season');
  assert.deepEqual(stocks(autumn), [3, 1, null, null, null]);
  return { repeatedSummer: 4, recordStock: 1, winter: 0, autumn: 3 };
});

runCase('goatHerding', () => {
  const seeded = board([practiceSlot('goatHerding')]);
  const def = defOf(seeded, 'goatHerding');
  proseHas(def, 'Every 2 moons');
  proseHas(def, '+1');
  assert.equal(def.cadenceMoons, 2);
  assert.equal(def.stockCapacity, 3);
  assert.equal(def.activation.stage, 'preRouting');
  const phaseSec = getMoonPhaseDurationSec(seeded.state);
  const cycle = phaseSec * 6;
  const foodSec = moon => 1 + phaseSec + moon * cycle;
  assert.equal(getMoonPhaseAtSecond(seeded.state, foodSec(0)).id, 'food');
  assert.equal(getMoonPhaseAtSecond(seeded.state, foodSec(0)).boundary, true);
  const initial = serializeGameState(seeded.state);
  const timeline = createTimelineFromInitialState(deserializeGameState(initial));
  const live = deserializeGameState(initial);
  const marks = [
    [foodSec(0), 1],
    [foodSec(1), 1],
    [foodSec(2), 2],
    [foodSec(4), 3],
    [foodSec(6), 3],
  ];
  const region = seeded.region;
  const stockAt = state => getDetailedSettlementSites(state).find(site => site.regionId === region).detailedState.practiceSlots[0].stock;
  for (const [second, expected] of marks) {
    const advanced = advanceReplayStateToSecond(live, second);
    assert.equal(advanced.ok, true, advanced.reason);
    assert.equal(stockAt(live), expected, `goat stock at ${second}`);
    if (second === foodSec(2) || second === foodSec(6)) {
      const rebuilt = rebuildStateAtSecond(timeline, second);
      assert.equal(rebuilt.ok, true, rebuilt.reason);
      sameSerialized(live, rebuilt.state, `goat replay includes rng at ${second}`);
      assert.ok(serializeGameState(live).rng.vassalSeed != null);
    }
  }
  return { marks, capacity: 3 };
});

runCase('forecasting', () => {
  const open = (scholars, recordStock) => board(
    [practiceSlot('forecasting'), practiceSlot('recordKeeping', recordStock)],
    { population: scholars, scholars },
  );
  const blocked = open(0, 2);
  const def = defOf(blocked, 'forecasting');
  proseHas(def, 'Consume 1 [Record]');
  proseHas(def, 'Require 1 stocked [Record] from a Knowledge-tagged Practice');
  proseHas(def, 'Scholar worker');
  proseHas(def, 'gain 6 Chaos');
  assert.equal(def.effects.find(effect => effect.op === 'addFaithChaosResistance').amount, 3);
  assert.equal(def.effects.find(effect => effect.op === 'addChaos').amount, 6);
  const chaos = blocked.state.civilization.chaos.chaosPower;
  runPracticeActivation(blocked.state, 'birth');
  assert.equal(blocked.local.practiceSlots[1].stock, 2);
  assert.equal(blocked.state.civilization.chaos.chaosPower, chaos);
  assert.equal(getPhaseModifiers(blocked.state).faithResistance, 0);
  const staffed = open(1, 2);
  assert.equal(assignment(staffed)[0].specialists[0], 'scholar');
  assert.deepEqual(providers(staffed).providers, [
    { kind: 'require', regionId: staffed.region, slotIndex: 1, practiceId: 'recordKeeping', amount: 1, traits: ['Record'], marketStockId: null },
    { kind: 'consume', regionId: staffed.region, slotIndex: 1, practiceId: 'recordKeeping', amount: 1, traits: ['Record'], marketStockId: null },
  ]);
  runPracticeActivation(staffed.state, 'birth');
  runPracticeActivation(staffed.state, 'birth');
  assert.equal(staffed.local.practiceSlots[1].stock, 0);
  assert.equal(getPhaseModifiers(staffed.state).faithResistance, 6);
  const chaosDelta = staffed.state.civilization.chaos.chaosPower - chaos;
  assert.equal(chaosDelta, 12, 'two Birth activations add 6 Chaos each');
  const third = providers(staffed);
  assert.equal(third.supplied, false);
  assert.deepEqual(third.missing, { kind: 'require', traits: ['Record'], amount: 1 });
  runPracticeActivation(staffed.state, 'birth');
  assert.equal(staffed.local.practiceSlots[1].stock, 0);
  assert.equal(getPhaseModifiers(staffed.state).faithResistance, 6);
  assert.equal(staffed.state.civilization.chaos.chaosPower - chaos, 12);
  return { repeats: 2, faith: 6, chaosAdded: 12, thirdBlocked: true };
});

const limitations = [
  'Season indexes, population, hosted Stock, and the half-built Mud House are authored before any tick or timeline capture.',
  'Salt Curing, Blacksmithing, Dry Farming, Logging output, Crop Rotation, Selective Breeding, and Forecasting use runPracticeActivation. Housebuilding uses runHousingPhase. Rationing uses runFoodPhase.',
  'Goat Herding is the official-tick case: advanceReplayStateToSecond against rebuildStateAtSecond, full serialized state including rng.',
  'The pending Mud House cycle is continued through runConstructionCycles on a saved snapshot. Definitions are not rewritten.',
  'Selective Breeding prose prints +2. One Scholar at effectiveness 1 doubles generateStock to 4. The test expects 4.',
  'Forecasting prose asks for a Knowledge-tagged Record host. This slice uses Record Keeping, which is Knowledge-tagged, so the tag clause is not isolated. Resolver links are practice slot identities; market stock ids are not used.',
];

mkdirSync(new URL('../artifacts/', import.meta.url), { recursive: true });
writeFileSync(new URL('../artifacts/scheduled-recipe-boundaries.json', import.meta.url), JSON.stringify({
  results, limitations,
}, null, 2));
if (failures.length) {
  console.error(`[scheduled-recipe-boundaries] failed ${failures.join(',')}`);
  for (const row of results.filter(row => !row.ok)) console.error(`${row.id}: ${row.error.split('\n')[0]} artifact=artifacts/scheduled-recipe-boundaries.json`);
  process.exit(1);
}
console.log(`[scheduled-recipe-boundaries] ${results.length} recipes OK; artifact=artifacts/scheduled-recipe-boundaries.json`);
