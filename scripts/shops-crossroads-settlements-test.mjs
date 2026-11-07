import assert from 'node:assert/strict';
import { createNewGameState } from '../src/model/new-game.js';
import { ActionKinds as A, applyAction } from '../src/model/actions.js';
import { serializeGameState, deserializeGameState, syncPhaseToPaused } from '../src/model/state.js';
import { getAdjacentRegionIds, getRegionState, addWorldConnection } from '../src/model/world-state.js';
import { FULL_MAP_SEED_CARD_IDS, fullMapPractices, fullMapStructures, isFullMapOfferDefinition } from '../src/defs/gamepieces/full-map-defs.js';
import { VASSAL_NODE_FAMILIES, VASSAL_SIGNATURE_NODE_VARIANTS } from '../src/defs/gamepieces/vassal-life-map-defs.js';
import { getLifeMapOptionSpecs } from '../src/model/life-map-balance.js';
import { getVassalCandidatePool, selectLifeMapVassal, getCurrentLifeMapVassal, getVassalNodeDecisionPresentation, chooseVassalCommission } from '../src/model/vassal-life-map.js';
import { getVassalShopCandidatePool, generateShopInventory } from '../src/model/vassal-life-map/shop.js';
import { createShopSpecialties } from '../src/model/vassal-life-map/shop-specialties.js';
import { getStockShopGenerationContext } from '../src/model/vassal-life-map/stock-shops.js';
import { buildCrossroadsOptions } from '../src/model/vassal-life-map/world-choices.js';
import { runPracticeActivation } from '../src/model/detailed-settlements/practices.js';
import { initializeReplayClock, advanceReplayStateToSecond } from '../src/model/replay-second-runner.js';
import { createTimelineFromInitialState, appendActionAtCursor, rebuildStateAtSecond } from '../src/model/timeline/index.js';

function selected(role = 'warrior', seed = 424242) {
  const state = createNewGameState(seed), lineage = state.civilization.vassalLineage;
  state.gameConfig.settings.values.primordialBasePressure = 0;
  Object.assign(lineage, { establishedClassId: role, founderClassId: role });
  const candidate = { ...getVassalCandidatePool(state).candidates[0], classId: role, founderClassId: null, age: 18 };
  assert.equal(selectLifeMapVassal(state, 0, null, candidate).ok, true);
  const vassal = getCurrentLifeMapVassal(state);
  if (vassal.commissionOffers?.length) assert.equal(chooseVassalCommission(state, vassal.commissionOffers[0].offerId).ok, true);
  return { state, vassal };
}
const snapshot = state => JSON.stringify(serializeGameState(state));
const seedIds = new Set(FULL_MAP_SEED_CARD_IDS);
assert.equal(Object.values({ ...fullMapPractices, ...fullMapStructures }).filter(def => def.provenance === 'neutral').length, 30);
for (const id of ['fm_handQuern', 'fm_rubblePicking', 'fm_leakingGranary', 'fe_rationRoll', 'cp_ironCommunion']) assert(seedIds.has(id), id);

// Every shop family, tagged signature, quality and inventory refresh uses the
// same exclusion. Authored identity survives edited class/quality fields.
for (const role of [null, 'scholar', 'warrior']) {
  const { state, vassal } = selected(role);
  for (const research of [0, 10000]) {
    state.civilization.research.total = research;
    for (const family of ['practiceReform', 'publicWorks', 'neutralMarket', 'classMarket', 'foodShop', 'housingShop', 'stockShop', 'signature']) {
      const node = { nodeId: 'pool-check', family, purchasedOffers: [], inventoryRoll: 0,
        ...(family === 'stockShop' ? { stockOutput: 'Edible' } : {}),
        ...(family === 'signature' ? { signatureNode: { groupId: 'tagShop', tag: 'Knowledge' } } : {}) };
      if (family === 'practiceReform' || family === 'publicWorks') {
        const specialty = createShopSpecialties(state, vassal, node);
        assert.ok(specialty.choices.some(choice => choice.enabled));
      }
      const before = snapshot(state);
      const pool = getVassalShopCandidatePool(state, vassal, node);
      assert(pool.every(card => !seedIds.has(card.definitionId)), `${role}/${family}`);
      assert(snapshot(state) === before, 'reading eligibility does not advance RNG');
      for (let roll = 0; roll < 3; roll++) {
        node.inventoryRoll = roll;
        const inventory = generateShopInventory(state, vassal, node);
        assert(inventory.every(offer => !seedIds.has(offer.intervention.practiceId ?? offer.intervention.structureId)), `${role}/${family}/refresh ${roll}`);
      }
    }
  }
  for (const id of FULL_MAP_SEED_CARD_IDS) {
    const def = state.gameConfig.gamepieces.practices[id] ?? state.gameConfig.gamepieces.structures[id];
    Object.assign(def, { pool: role ?? 'common', minimumQuality: 'bronze', locked: false });
    assert.equal(isFullMapOfferDefinition(def), false, `${id} stays excluded after edits`);
  }
  assert(getVassalShopCandidatePool(state, vassal, { purchasedOffers: [] }).every(card => !seedIds.has(card.definitionId)));
  const context = getStockShopGenerationContext(state, vassal);
  assert(context.stockOutputs.length > 0);
}

// No hidden fallback may resurrect inherited cards when the upgrade pool is
// exhausted. Stock Supply and specialty pickers must agree with actual shops.
{
  const { state, vassal } = selected('scholar');
  state.civilization.research.total = 0;
  assert(getStockShopGenerationContext(state, vassal).stockOutputs.includes('Tool'), 'Scholars retain Bronze Pattern Carving');
  const warrior = selected('warrior');
  assert(!getStockShopGenerationContext(warrior.state, warrior.vassal).stockOutputs.includes('Tool'), 'Warriors cannot reserve an inherited Bronze smithy');
  assert(warrior.vassal.lifeMap.graph.nodes.every(node => node.family !== 'stockShop' || node.stockOutput !== 'Tool'), 'pooled generation has no unusable Bronze Tool shop');
  for (const def of [...Object.values(state.gameConfig.gamepieces.practices), ...Object.values(state.gameConfig.gamepieces.structures)]) {
    def.locked = !seedIds.has(def.id);
    if (seedIds.has(def.id)) Object.assign(def, { pool: 'common', minimumQuality: 'bronze' });
  }
  const local = state.world.sites.find(site => site.regionId === vassal.locationRegionId).detailedState;
  local.practiceSlots[4] = { practiceId: 'fe_rationRoll', tier: 'bronze', instanceId: 'hostile-seed', allegiance: 'external-a', charge: 0, work: 0 };
  const node = { nodeId: 'empty-pool', family: 'practiceReform', purchasedOffers: [] };
  assert.deepEqual(getVassalShopCandidatePool(state, vassal, node), []);
  assert.deepEqual(generateShopInventory(state, vassal, node), [], 'no inherited offer, including adoption');
  assert(createShopSpecialties(state, vassal, node).choices.every(choice => !choice.enabled));
  assert.deepEqual(getStockShopGenerationContext(state, vassal).stockOutputs, []);
}

// Exclusion preserves the authored map and installed inherited-card execution.
{
  const state = createNewGameState(424242);
  const site = state.world.sites.find(site => site.regionId === state.civilization.capitalRegionId);
  const quern = site.detailedState.practiceSlots.find(slot => slot?.practiceId === 'fm_handQuern');
  assert(quern); quern.stock = 0;
  runPracticeActivation(state, 'food', 'preRouting');
  assert(quern.stock > 0, 'installed Hand Quern still produces Stock');
}

// Geographic adjacency permits foreign and unroaded neighbours, but never a
// distant destination even when a continuous road network reaches it.
for (const seed of [1, 2, 1867, 424242]) {
  const { state, vassal } = selected('warrior', seed), origin = vassal.locationRegionId;
  const adjacent = getAdjacentRegionIds(state, origin);
  const distant = state.world.sites.find(site => site.regionId !== origin && !adjacent.includes(site.regionId) && site.simulationMode === 'detailed').regionId;
  const existing = [...state.world.connections];
  for (const region of state.world.regions) for (const id of getAdjacentRegionIds(state, region.id)) addWorldConnection(state, region.id, id);
  const before = snapshot(state), moves = buildCrossroadsOptions(state, vassal).filter(option => option.locationRegionId);
  assert(moves.length > 0);
  assert(moves.every(option => adjacent.includes(option.locationRegionId)));
  assert(!moves.some(option => option.locationRegionId === distant));
  assert(snapshot(state) === before, 'travel previews do not consume RNG');
  state.world.connections = [];
  const unroaded = buildCrossroadsOptions(state, vassal).filter(option => option.locationRegionId);
  assert.deepEqual(unroaded.map(option => option.locationRegionId), moves.map(option => option.locationRegionId));
  assert(unroaded.every(option => option.expedition && option.phaseCost > 0));
  assert(unroaded.some(option => getRegionState(state, option.locationRegionId).controller !== 'player'));
  state.world.connections = existing;
}

// Official actions, JSON continuation, and authoritative replay agree on a
// neighbour move; the obsolete founding IDs cannot mutate world/population/RNG.
for (const family of ['crossroads', 'legacy']) {
  const { state, vassal } = selected();
  const node = vassal.lifeMap.graph.nodes.find(node => node.family === family);
  assert(node); vassal.lifeMap.availableNodeIds = [node.id];
  initializeReplayClock(state, 0);
  state.paused = false; syncPhaseToPaused(state);
  const timeline = createTimelineFromInitialState(state);
  const act = (kind, payload) => {
    state.paused = true; syncPhaseToPaused(state);
    const result = applyAction(state, { kind, payload }); assert.equal(result.ok, true, result.reason);
    state.paused = false; syncPhaseToPaused(state);
    assert.equal(appendActionAtCursor(timeline, { kind, payload, tSec: state.tSec }, state).ok, true);
  };
  act(A.VASSAL_ENTER_LIFE_NODE, { nodeId: node.id });
  const decision = getVassalNodeDecisionPresentation(state, node.id), before = snapshot(state);
  for (const id of ['found-settlement', 'legacy-target:R02', 'small-settlement:R02']) {
    assert.equal(applyAction(state, { kind: A.VASSAL_SELECT_LIFE_OPTION, payload: { nodeId: node.id, optionId: id } }, { isReplay: true }).ok, false);
    assert(snapshot(state) === before);
  }
  const option = family === 'legacy' ? decision.options.find(option => option.id === 'highest-stat') : decision.options.find(option => option.locationRegionId);
  if (family === 'legacy') assert.deepEqual(decision.options.map(option => option.id), ['highest-stat', 'accumulated-prestige']);
  act(A.VASSAL_SELECT_LIFE_OPTION, { nodeId: node.id, optionId: option.id });
  act(A.VASSAL_CONFIRM_LIFE_NODE, { nodeId: node.id });
  const loaded = deserializeGameState(serializeGameState(state));
  const end = vassal.lifeMap.pendingResolution?.resolveSec ?? state.tSec;
  advanceReplayStateToSecond(state, end); initializeReplayClock(loaded, loaded.tSec); advanceReplayStateToSecond(loaded, end);
  assert(snapshot(loaded) === snapshot(state), `${family} JSON continuation`);
  assert(snapshot(rebuildStateAtSecond(timeline, end).state) === snapshot(state), `${family} authoritative replay`);
}
assert.equal(VASSAL_NODE_FAMILIES.settlement, undefined);
assert.equal(VASSAL_SIGNATURE_NODE_VARIANTS.settlement, undefined);
assert.deepEqual(getLifeMapOptionSpecs('signature:settlement'), []);
assert.deepEqual(getLifeMapOptionSpecs('legacy').map(option => option.id), ['highest-stat', 'accumulated-prestige']);
console.log('[shops-crossroads-settlements] inherited pools excluded, installed cards preserved, adjacent travel, no founding, JSON continuation and replay OK');
