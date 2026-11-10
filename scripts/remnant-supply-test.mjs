import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { remnantSupplyPracticeDefs as remnants } from '../src/defs/gamepieces/remnant-supply-defs.js';
import { FULL_MAP_SEED_CARD_IDS, FULL_MAP_SUPPLY_DEPENDENCIES } from '../src/defs/gamepieces/full-map-defs.js';
import { createNewGameState } from '../src/model/new-game.js';
import { serializeGameState, deserializeGameState } from '../src/model/state.js';
import { getRegionState } from '../src/model/world-state.js';
import { validateGameConfig } from '../src/model/game-config.js';
import { getCurrentLifeMapVassal, getVassalCandidatePool, selectLifeMapVassal } from '../src/model/vassal-life-map.js';
import { getVassalShopCandidatePool, generateShopInventory } from '../src/model/vassal-life-map/shop.js';
import { getStockShopGenerationContext } from '../src/model/vassal-life-map/stock-shops.js';
import { createShopSpecialties } from '../src/model/vassal-life-map/shop-specialties.js';
import { runPracticeActivation, flushPracticeEvents, evaluateDetailedPracticeSlot } from '../src/model/detailed-settlements/practices.js';
import { emitPracticeEvent } from '../src/model/detailed-settlements/practice-events.js';
import { writePopulationBins } from '../src/model/detailed-settlements/population-ledger.js';
import { stockCapacity } from '../src/model/detailed-settlements/stock.js';
import { triggerMonsterSpawn } from '../src/model/detailed-settlements/external-world.js';
import { createTownMarket, transitionTown } from '../src/model/detailed-settlements/neutral-market.js';
import { getGamepieceFace } from '../src/model/gamepiece-presentation.js';
import { getIllustrationSpec } from '../src/views/chronicle-art.js';
import { initializeReplayClock, advanceReplayStateToSecond } from '../src/model/replay-second-runner.js';
import { createTimelineFromInitialState, rebuildStateAtSecond } from '../src/model/timeline/index.js';
import { generateDetailedVassalCandidates } from '../src/model/detailed-settlements/vassals.js';
import { diagnoseLifegraphCardPools } from '../src/model/dev-lab/lifegraph.js';
import { generateVassalLifeMap, createAuthoredVassalLifeMapGeneratorConfig } from '../src/model/vassal-life-map-generator.js';
import { createRng } from '../src/model/rng.js';

mkdirSync('artifacts', { recursive: true });
const ids = Object.keys(remnants), checks = [];
const seasons = ['spring', 'summer', 'autumn', 'winter'];
const provider = { Edible: 'fm_handQuern', Currency: 'barter', Timber: 'fm_woodlotRights', Construction: 'fm_rubblePicking',
  Water: 'rm_siltedChannels', Tool: 'rm_rustedArmoury', Metal: 'fm_scrapGathering', Fuel: 'fm_peatCutting' };
const slot = (practiceId, stock = 0) => ({ practiceId, instanceId: `fixture:${practiceId}`, tier: 'bronze', stock, charge: 0, work: 0 });
const snapshot = state => JSON.stringify(serializeGameState(state));
function same(actual, expected, label) {
  if (snapshot(actual) !== snapshot(expected)) {
    writeFileSync('artifacts/remnant-supply-mismatch.json', JSON.stringify({ actual: serializeGameState(actual), expected: serializeGameState(expected) }));
    assert.fail(`${label}; artifacts/remnant-supply-mismatch.json`);
  }
}
function fixture(id) {
  const state = createNewGameState(424242);
  state.gameConfig.settings.values.populationPerToken = 1000; // Compare authored base output without worker bonuses.
  state.world.connections = [];
  const site = state.world.sites.find(site => site.regionId === state.civilization.capitalRegionId), local = site.detailedState;
  local.structureSlots.fill(null); local.practiceSlots = [slot(id)];
  const def = state.gameConfig.gamepieces.practices[id];
  const ingredients = [...def.consume, ...def.require].map(cost => ({ cost, practiceId: provider[cost.traits[0]] }));
  for (const { cost, practiceId } of ingredients) {
    // Hold feeders between their own activations while testing this recipe's
    // exact seasonal debit; feeder replenishment has separate cadence coverage.
    if(state.gameConfig.gamepieces.practices[practiceId].mode==='scheduled'){
      state.gameConfig.gamepieces.practices[practiceId].activation={type:'birth'};
      state.gameConfig.gamepieces.practices[practiceId].source={icon:'birth',cadence:'birth'};
    }
    const source = slot(practiceId, cost.amount);
    assert(source.stock <= stockCapacity(state, local, source), `${id}: fixture ingredients fit ordinary capacity`);
    local.practiceSlots.push(source);
  }
  while (local.practiceSlots.length < 5) local.practiceSlots.push(null);
  return { state, site, local, def, ingredients };
}

for (const id of ids) {
  assert(FULL_MAP_SEED_CARD_IDS.includes(id));
  const face = getGamepieceFace({}, 'practice', id);
  assert.equal(face.label, remnants[id].label, `${id}: catalogue face`);
  assert.equal(getIllustrationSpec(id).file, `settlement-pieces-v4/${id}.webp`);
  const { state, site, local, def, ingredients } = fixture(id);
  assert.equal(validateGameConfig(state.gameConfig).ok, true);
  if (def.mode === 'charge') continue;
  const activeSeason = def.activation.seasonKeys[0];
  state.currentSeasonIndex = seasons.indexOf(activeSeason);
  runPracticeActivation(state, 'season');
  assert.equal(local.practiceSlots[0].stock, 1, `${id}: actual scheduled output`);
  ingredients.forEach(({ cost }, index) => assert.equal(local.practiceSlots[index + 1].stock,
    index < def.consume.length ? 0 : cost.amount, `${id}: Consume debits and Require retains`));
  const blocked = fixture(id);
  blocked.state.currentSeasonIndex = seasons.indexOf(activeSeason);
  blocked.local.practiceSlots[1].stock = 0;
  const stockBefore = blocked.local.practiceSlots.map(slot => slot?.stock);
  runPracticeActivation(blocked.state, 'season');
  assert.deepEqual(blocked.local.practiceSlots.map(slot => slot?.stock), stockBefore, `${id}: missing input is atomic`);
  const evaluation = evaluateDetailedPracticeSlot(blocked.state, blocked.site.regionId, 0);
  assert.equal(evaluation.blocked, true, `${id}: blocked state is inspectable`);
  assert.equal(getGamepieceFace(blocked.state, 'practice', id, 'bronze', { evaluation }).blocked, true);
  const offSeason = fixture(id);
  offSeason.state.currentSeasonIndex = (seasons.indexOf(activeSeason) + 1) % 4;
  runPracticeActivation(offSeason.state, 'season');
  assert.equal(offSeason.local.practiceSlots[0].stock, 0, `${id}: no off-season production`);
  checks.push(id);
}

// Use the real Monster defense emitter. Six held assaults earn one base Stock;
// a full host retains Charge until space is available, without invented victories.
{
  const { state, site, local } = fixture('rm_withheldSpoils');
  local.practiceSlots[1] = slot('weaponsmithing', 6);
  local.garrison = { supplied: true };
  // This card contract needs thirteen held attacks, including +1 after each repel.
  writePopulationBins(local, [{ classId: 'villager', allegiance: 'player', specialty: 'warrior', kind: 'adults', age: null, count: 20 }]);
  for (const region of state.world.regions) delete region.monster;
  getRegionState(state, site.regionId).monster = { defense: 1 };
  const defend = () => { assert.equal(triggerMonsterSpawn(state).outcome, 'intercepted'); flushPracticeEvents(state); };
  for (let i = 0; i < 5; i++) defend();
  assert.equal(local.practiceSlots[0].stock, 0); assert.equal(local.practiceSlots[0].charge, 5);
  defend(); assert.equal(local.practiceSlots[0].stock, 1); assert.equal(local.practiceSlots[0].charge, 0);
  assert.equal(local.lastDefense.result, 'held');
  emitPracticeEvent(state, { kind: 'defenseSucceeded', regionId: state.world.regions.find(region => region.id !== site.regionId).id });
  flushPracticeEvents(state); assert.equal(local.practiceSlots[0].charge, 0, 'remote defense pays nothing');
  local.practiceSlots[0].stock = 2;
  for (let i = 0; i < 6; i++) defend();
  assert.equal(local.practiceSlots[0].charge, 6); assert.equal(local.practiceSlots[0].stock, 2);
  assert.equal(evaluateDetailedPracticeSlot(state, site.regionId, 0).blocked, true);
  local.practiceSlots[0].stock = 1; defend();
  assert.equal(local.practiceSlots[0].stock, 2);
  checks.push('real defenses and capacity-blocked Charge');
}

// Inherited cards exist in generated Crown towns and dormant neutral recipes.
// Capture activates those exact recipes, without creating a new settlement.
{
  const seen = new Set();
  for (const seed of [1, 2, 3, 4, 6, 7, 12, 18, 42, 1867, 424242]) {
    const state = createNewGameState(seed), before = createNewGameState(seed);
    same(state, before, 'seeded world');
    for (const site of state.world.sites) {
      for (const id of (site.neutral ?? site.town?.market)?.practices ?? []) if (ids.includes(id)) seen.add(id);
      assert(site.detailedState.practiceSlots.length === 5);
    }
  }
  assert.deepEqual([...seen].sort(), ids.sort());
  const state = createNewGameState(424242), site = state.world.sites.find(site => site.neutral), count = state.world.sites.length;
  site.neutral = createTownMarket('timber'); site.town.type = 'timber';
  assert(site.detailedState.practiceSlots.every(slot => !slot));
  transitionTown(state, site, 'player'); getRegionState(state, site.regionId).controller = 'player';
  assert.deepEqual(site.detailedState.practiceSlots.filter(Boolean).map(slot => slot.practiceId), createTownMarket('timber').practices);
  assert.equal(state.world.sites.length, count);
  checks.push('seed diversity and first-control activation');
}

// Admission retains the class on every former override card, at all qualities.
for (const classId of [null, 'scholar', 'warrior']) {
  const state = createNewGameState(424242), lineage = state.civilization.vassalLineage;
  Object.assign(lineage, { establishedClassId: classId, founderClassId: classId });
  assert(selectLifeMapVassal(state, 0, null, { ...getVassalCandidatePool(state).candidates[0], classId, founderClassId: null }).ok);
  const vassal = getCurrentLifeMapVassal(state);
  for (const research of [0, 10000]) {
    state.civilization.research.total = research;
    const node = { nodeId: 'class-pool', family: 'practiceReform', purchasedOffers: [] };
    const pool = getVassalShopCandidatePool(state, vassal, node);
    for (const id of FULL_MAP_SUPPLY_DEPENDENCIES) {
      const def = state.gameConfig.gamepieces.practices[id] ?? state.gameConfig.gamepieces.structures[id];
      if (def.pool !== 'common' && def.pool !== classId) assert(!pool.some(card => card.definitionId === id), `${classId}: no ${def.pool} ${id}`);
      if (research && ['common', classId].includes(def.pool)) assert(pool.some(card => card.definitionId === id), `${id}: retains proper admission`);
    }
    const inventory = generateShopInventory(state, vassal, node);
    assert(inventory.every(offer => !ids.includes(offer.intervention.practiceId)));
    const context = getStockShopGenerationContext(state, vassal);
    if (classId !== 'scholar') assert(!context.stockOutputs.includes('Water'), 'map Water is not drafted by other classes');
    else assert(context.stockOutputs.includes('Water'), 'Scholars can draft Bronze Irrigating');
    const specialties = createShopSpecialties(state, vassal, node);
    assert(specialties.choices.some(choice => choice.enabled));
    const diagnostic = diagnoseLifegraphCardPools(state);
    if (classId !== 'scholar') assert(!diagnostic.some(row => row.id === 'stock:Water'), 'Lab does not advertise inherited-only Water as a draft option');
  }
}
checks.push('all former overrides retain class restrictions');
// Seed 23 previously reserved Water at depth 4 before Scholar Founding at 5.
// Move/disable Founding as the Lab allows, and keep every early output draftable.
for (const role of ['scholar', 'warrior']) for (const pooled of [true, false]) for (const depth of [0, 5, 12, null]) for (const seed of [1, 2, 23, 42, 1867]) {
  const state = createNewGameState(seed);
  state.gameConfig.lifeMapGenerator.design.enabled = pooled;
  Object.assign(state.gameConfig.lifeMapGenerator.design.bookends.founding, { enabled: depth !== null, depth: depth ?? 5 });
  // A depth-12 Founding cannot satisfy the unrelated default Campaign promise
  // at depths 4-8. Isolate Stock Supply while retaining default guarantees in
  // the ordinary depth-0/depth-5 cases.
  if (depth === 12) state.gameConfig.lifeMapGenerator.design.guarantees = state.gameConfig.lifeMapGenerator.design.guarantees.filter(rule => rule.id !== 'campaign');
  const candidate = { ...getVassalCandidatePool(state).candidates[0], classId: null, founderClassId: role };
  assert(selectLifeMapVassal(state, 0, null, candidate).ok);
  const vassal = getCurrentLifeMapVassal(state), context = getStockShopGenerationContext(state, candidate);
  const founding = vassal.lifeMap.graph.nodes.find(node => node.bookend === 'founding');
  assert.equal(!!founding, pooled ? depth !== null : true, 'Stock Supply preserves the pooled configuration or the fixed opening Founding in independent generation');
  for (const node of vassal.lifeMap.graph.nodes.filter(node => node.family === 'stockShop')) {
    if (!founding || node.depth < founding.depth) assert(context.unclassedStockOutputs.includes(node.stockOutput), `seed ${seed}, ${pooled?'pooled':'independent'}, Founding ${depth}: no class-only ${node.stockOutput} before Founding`);
  }
}
checks.push('early, late and disabled Founding keep Stock Supply playable');
{
  const state = createNewGameState(424242);
  const legacy = generateDetailedVassalCandidates(state);
  assert(legacy.every(candidate => candidate.interventions.every(entry => !FULL_MAP_SEED_CARD_IDS.includes(entry.practiceId ?? entry.structureId))), 'legacy random agendas cannot acquire map-only cards');
  const config = createAuthoredVassalLifeMapGeneratorConfig();
  for (const seed of [1, 2, 42, 1867]) {
    const result = generateVassalLifeMap(config, createRng(seed));
    assert(result.ok);
    assert(result.graph.nodes.every(node => node.family !== 'stockShop' || node.stockOutput !== 'Water'), 'bare generator has no inherited-only Water fallback');
  }
  checks.push('Lab, bare generator and legacy draft boundaries');
}

// New inherited boards traverse the same phase runner in live, loaded and
// authoritative replay states. No generator-specific simulation path exists.
{
  const state = initializeReplayClock(createNewGameState(424242));
  state.gameConfig.settings.values.primordialBasePressure = 0;
  const timeline = createTimelineFromInitialState(state);
  advanceReplayStateToSecond(state, 96);
  const loaded = deserializeGameState(serializeGameState(state)); initializeReplayClock(loaded, loaded.tSec);
  advanceReplayStateToSecond(state, 256); advanceReplayStateToSecond(loaded, 256);
  same(loaded, state, 'JSON continuation');
  same(rebuildStateAtSecond(timeline, 256).state, state, 'authoritative replay');
  checks.push('JSON continuation and authoritative replay');
}
console.log(`[remnant-supply] ${checks.length} groups passed: real recipes, blocked inputs, defense rewards, map seeding, class pools and replay`);
