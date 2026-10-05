import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { createInitialState } from "../../init.js";
import { createRng } from "../../rng.js";
import { ActionKinds } from "../../actions.js";
import { serializeGameState, deserializeGameState } from "../../state.js";
import { getDetailedPracticeDef } from "../../game-config.js";
import { createDetailedPracticeSlot } from "../../detailed-practice-tiers.js";
import { getRegionState } from "../../world-state.js";
import { getStockShopGenerationContext } from "../../vassal-life-map/stock-shops.js";
import { getPlayerDetailedSites } from "../../vassal-life-map/selectors.js";
import { getCurrentLifeMapVassal, getVassalCandidatePool, getVassalNodeDecisionPresentation } from "../../vassal-life-map.js";
import { createAuthoredVassalLifeMapGeneratorConfig, generateVassalLifeMap, validateVassalLifeMapGraph } from "../../vassal-life-map-generator.js";
import { getVassalLifeMapNodeFamily, isVassalStockOutputPractice } from "../../../defs/gamepieces/vassal-life-map-defs.js";
import { createTimelineFromInitialState, appendActionAtCursor, rebuildStateAtSecond } from "../../timeline/index.js";
import { initializeReplayClock, advanceReplayStateToSecond } from "../../replay-second-runner.js";
import { dispatch } from "./helpers.js";

function assertReplayMatches(actual, expected, message) {
  const snapshot = state => ({ tSec: state.tSec, rng: state.rng, world: state.world, civilization: state.civilization });
  const matches = JSON.stringify(snapshot(actual)) === JSON.stringify(snapshot(expected));
  if (!matches) {
    mkdirSync("artifacts", { recursive: true });
    writeFileSync("artifacts/stock-shop-replay-mismatch.json", JSON.stringify({ actual: snapshot(actual), expected: snapshot(expected) }, null, 2));
  }
  assert.equal(matches, true, `${message}; details: artifacts/stock-shop-replay-mismatch.json`);
}

function supplyGapState(seed = 1, classId = null) {
  const state = createInitialState("devPlaytesting01", seed);
  state.paused = true;
  state.phase = "planning";
  state.gameConfig.settings.values.primordialBasePressure = 0;
  state.civilization.vassalLineage.founderClassId = classId;
  state.civilization.vassalLineage.establishedClassId = classId;
  for (const site of getPlayerDetailedSites(state)) site.detailedState.practiceSlots.fill(null);
  const site = getPlayerDetailedSites(state)[0];
  site.detailedState.practiceSlots = ["forage", "logging", "housebuilding"].map(id => createDetailedPracticeSlot(id, "bronze"));
  site.detailedState.practiceSlots.push(null, null);
  state.civilization.vassalLineage.pendingCandidates.forEach(candidate => {
    candidate.classId = classId;
    candidate.founderClassId = null;
    candidate.archetype = classId === "scholar" ? "Scholar" : classId === "warrior" ? "Warrior" : "Unclassed";
  });
  return state;
}

const gap = supplyGapState();
const candidate = gap.civilization.vassalLineage.pendingCandidates[0];
const before = serializeGameState(gap);
assert.deepEqual(getStockShopGenerationContext(gap, candidate).unmetStockOutputs, ["Tool"]);
assert.deepEqual(serializeGameState(gap), before, "need analysis does not mutate state or RNG");
const other = getPlayerDetailedSites(gap)[1];
other.detailedState.practiceSlots[0] = createDetailedPracticeSlot("toolmaking", "bronze");
other.detailedState.practiceSlots[0].stock = 0;
assert.deepEqual(getStockShopGenerationContext(gap, candidate).unmetStockOutputs, [],
  "a producer in any player settlement satisfies the output, even with empty current Stock");
getRegionState(gap, other.regionId).controller = "neutral";
assert.deepEqual(getStockShopGenerationContext(gap, candidate).unmetStockOutputs, ["Tool"],
  "neutral producers cannot satisfy player supply needs");
getRegionState(gap, other.regionId).controller = "frontier";
assert.deepEqual(getStockShopGenerationContext(gap, candidate).unmetStockOutputs, ["Tool"],
  "lost settlements cannot satisfy player supply needs");

const alternatives = supplyGapState();
const consumer = alternatives.gameConfig.gamepieces.practices.housebuilding;
consumer.require = [{ traits: ["Tool", "Currency"], amount: 1 }];
getPlayerDetailedSites(alternatives)[1].detailedState.practiceSlots[0] = createDetailedPracticeSlot("barter", "bronze");
assert.deepEqual(getStockShopGenerationContext(alternatives, candidate).unmetStockOutputs, [],
  "one supplied alternative satisfies a recipe input");
for (const site of getPlayerDetailedSites(alternatives)) site.detailedState.practiceSlots.fill(null);
assert.deepEqual(getStockShopGenerationContext(alternatives, candidate).unmetStockOutputs, ["Edible"],
  "populated settlements need an Edible producer even without explicit recipe inputs");

const config = createAuthoredVassalLifeMapGeneratorConfig();
for (let seed = 0; seed < 100; seed += 1) {
  for (const unmetStockOutputs of [[], ["Tool"]]) {
    const result = generateVassalLifeMap(config, createRng(seed), { generationSeed: seed, stockOutputs: ["Stone", "Ore"], unmetStockOutputs });
    assert.equal(result.ok, true);
    assert.equal(validateVassalLifeMapGraph(result.graph).ok, true);
    const shops = result.graph.nodes.filter(node => node.family === "stockShop");
    assert.equal(shops.length, unmetStockOutputs.length ? 3 : 2);
    assert.deepEqual(shops.map(node => node.stockOutput).sort(), unmetStockOutputs.length
      ? ["Ore", "Stone", "Tool"] : ["Ore", "Stone"]);
    assert.deepEqual(result, generateVassalLifeMap(config, createRng(seed), { generationSeed: seed, stockOutputs: ["Stone", "Ore"], unmetStockOutputs }));
  }
  const covered = generateVassalLifeMap(config, createRng(seed), { stockOutputs: ["Stone", "Tool"], unmetStockOutputs: ["Tool"] });
  assert.equal(covered.graph.nodes.filter(node => node.family === "stockShop").length, 2,
    "a random node already satisfying the guarantee does not need an extra node");
}
const small = { ...config, laneCount: 2, routeCount: 2, normalDepthCount: 3, earlyDepthCount: 1, midDepthCount: 1 };
const smallGraph = generateVassalLifeMap(small, createRng(42), { stockOutputs: ["Stone", "Ore"], unmetStockOutputs: ["Tool"] }).graph;
assert.ok(smallGraph.nodes.some(node => node.stockOutput === "Tool"), "the guarantee has priority on small custom maps");
const malformed = structuredClone(smallGraph);
delete malformed.nodes.find(node => node.family === "stockShop").stockOutput;
assert.equal(validateVassalLifeMapGraph(malformed).ok, false, "Stock Supply nodes must serialize a named output");

for (const classId of [null, "scholar", "warrior"]) {
  for (const research of [0, 100000]) {
    const state = supplyGapState(102, classId);
    state.civilization.research.total = research;
    const timeline = createTimelineFromInitialState(state);
    const act = (kind, payload) => {
      assert.equal(appendActionAtCursor(timeline, { kind, payload, tSec: state.tSec }, state).ok, true);
      dispatch(state, kind, payload);
    };
    const pool = getVassalCandidatePool(state);
    act(ActionKinds.SETTLEMENT_SELECT_VASSAL, { candidateIndex: 0, expectedPoolHash: pool.expectedPoolHash });
    const vassal = getCurrentLifeMapVassal(state);
    const shops = vassal.lifeMap.graph.nodes.filter(node => node.family === "stockShop");
    assert.ok(shops.length >= 2 && shops.length <= 3);
    const target = shops.find(node => node.stockOutput === "Tool");
    assert.ok(target, "selected Vassals retain the unmet-output guarantee after class customization");
    assert.equal(getVassalLifeMapNodeFamily(target).label, "Tool Stock Supply");
    const generatedReplay = rebuildStateAtSecond(timeline, 0);
    assert.equal(generatedReplay.ok, true);
    assertReplayMatches(generatedReplay.state, state, "state-driven generation matches replay");
    // Use a fixture checkpoint to exercise this shop without walking an entire life.
    vassal.lifeMap.availableNodeIds = [target.id];
    const shopTimeline = createTimelineFromInitialState(state);
    const shopAct = (kind, payload) => {
      assert.equal(appendActionAtCursor(shopTimeline, { kind, payload, tSec: state.tSec }, state).ok, true);
      dispatch(state, kind, payload);
    };
    shopAct(ActionKinds.VASSAL_ENTER_LIFE_NODE, { nodeId: target.id });
    const nodeState = vassal.lifeMap.nodeStates[target.id];
    const checkOffers = () => {
      assert.equal(nodeState.stockOutput, "Tool");
      assert.ok(nodeState.inventory.length > 0 && nodeState.inventory.length <= 3);
      assert.ok(nodeState.inventory.every(offer => offer.intervention.kind === "practice"
        && isVassalStockOutputPractice(getDetailedPracticeDef(state, offer.intervention.practiceId), "Tool")));
      assert.equal(getVassalNodeDecisionPresentation(state, target.id).contextKind, "settlement");
    };
    checkOffers();
    const restored = deserializeGameState(serializeGameState(state));
    shopAct(ActionKinds.VASSAL_REROLL_SHOP, { nodeId: target.id });
    dispatch(restored, ActionKinds.VASSAL_REROLL_SHOP, { nodeId: target.id });
    checkOffers();
    assertReplayMatches(restored, state, "saved output and rerolls remain deterministic");
    vassal.prestige = 500;
    // Capture the increased test allowance in a checkpoint, then verify purchase replay.
    const checkoutTimeline = createTimelineFromInitialState(state);
    const checkout = (kind, payload) => {
      assert.equal(appendActionAtCursor(checkoutTimeline, { kind, payload, tSec: state.tSec }, state).ok, true);
      dispatch(state, kind, payload);
    };
    checkout(ActionKinds.VASSAL_PURCHASE_SHOP_OFFER, { nodeId: target.id, offerId: nodeState.inventory[0].offerId });
    checkout(ActionKinds.VASSAL_CONFIRM_LIFE_NODE, { nodeId: target.id });
    initializeReplayClock(state, state.tSec);
    assert.equal(advanceReplayStateToSecond(state, vassal.lifeMap.pendingResolution.resolveSec).ok, true);
    const checkoutReplay = rebuildStateAtSecond(checkoutTimeline, state.tSec);
    assert.equal(checkoutReplay.ok, true);
    assertReplayMatches(checkoutReplay.state, state, "supplier checkout matches authoritative replay");
  }
}

const oldGraphState = supplyGapState();
dispatch(oldGraphState, ActionKinds.SETTLEMENT_SELECT_VASSAL, { candidateIndex: 0 });
const oldGraph = serializeGameState(oldGraphState);
oldGraph.civilization.vassalLineage.vassalsById[oldGraph.civilization.vassalLineage.currentVassalId].lifeMap.graph.schemaVersion = 3;
assert.throws(() => deserializeGameState(oldGraph), /schemaVersion/, "obsolete Life Map graphs are rejected");
