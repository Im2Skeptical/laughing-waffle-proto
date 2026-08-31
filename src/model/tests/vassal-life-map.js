import assert from "node:assert/strict";
import { ActionKinds, applyAction } from "../actions.js";
import { createInitialState } from "../init.js";
import { createRng } from "../rng.js";
import { deserializeGameState, serializeGameState } from "../state.js";
import {
  VASSAL_LEGACY_OPTIONS,
  VASSAL_NODE_FAMILIES,
  VASSAL_LIFE_TUNING,
  getVassalMortalityChance,
} from "../../defs/gamepieces/vassal-life-map-defs.js";
import {
  getCommittedVassalLifeMapNodeIds,
  getAdjustedVassalPrestigeCost,
  getAdjustedVassalPhaseCost,
  formatVassalPhaseDuration,
  getCurrentLifeMapVassal,
  getLifeMapVassalAtSecond,
  getVassalCandidatePool,
  getVassalDevelopmentIncome,
  getVassalLifeMapPlayheadNodeId,
  getVassalLifeMapNodes,
  getVassalLifeMapOutgoingNodeIds,
  getVassalNodeDisplayState,
  getVassalNodeDecisionPresentation,
  getVassalPrestigeIncome,
  validateVassalLifeMapState,
} from "../vassal-life-map.js";
import {
  createAuthoredVassalLifeMapGeneratorConfig,
  generateVassalLifeMap,
  validateVassalLifeMapGraph,
} from "../vassal-life-map-generator.js";
import { stepDetailedSettlementsSecond } from "../detailed-settlements.js";

function dispatch(state, kind, payload = {}) {
  const result = applyAction(state, { kind, payload }, { isReplay: true });
  assert.equal(result.ok, true, `${kind} failed: ${result.reason ?? "unknown"}`);
  return result;
}

function selectedState(seed = 1, candidateIndex = 0) {
  const state = createInitialState("devPlaytesting01", seed);
  state.paused = true;
  state.phase = "planning";
  state.gameConfig.settings.values.primordialBasePressure = 0;
  state.civilization.chaos.monsterLossThreshold = 1000000;
  const pool = getVassalCandidatePool(state);
  dispatch(state, ActionKinds.SETTLEMENT_SELECT_VASSAL, {
    candidateIndex, expectedPoolHash: pool.expectedPoolHash,
  });
  return state;
}

function forceEnter(state, nodeId) {
  const vassal = getCurrentLifeMapVassal(state);
  vassal.lifeMap.availableNodeIds = [nodeId];
  dispatch(state, ActionKinds.VASSAL_ENTER_LIFE_NODE, { nodeId });
  return vassal.lifeMap.nodeStates[nodeId];
}

function nodeIdForFamily(state, family, index = 0) {
  const nodes = getVassalLifeMapNodes(getCurrentLifeMapVassal(state))
    .filter((node) => node.family === family);
  assert.ok(nodes[index], `expected generated ${family} node ${index}`);
  return nodes[index].id;
}

function resolvePending(state) {
  const vassal = getCurrentLifeMapVassal(state);
  const resolveSec = vassal.lifeMap.pendingResolution.resolveSec;
  for (let tSec = Math.floor(state.tSec ?? 0) + 1; tSec <= resolveSec; tSec += 1) {
    state.tSec = tSec;
    stepDetailedSettlementsSecond(state, tSec);
  }
  return resolveSec;
}

function findSeed(predicate) {
  for (let seed = 0; seed < 10000; seed += 1) {
    const roll = createRng(seed).nextFloat();
    if (predicate(roll)) return seed;
  }
  throw new Error("No deterministic RNG seed matched the predicate");
}

const isolatedMapState = createInitialState("devPlaytesting01", 8877);
const isolatedPool = getVassalCandidatePool(isolatedMapState);
const isolatedSeedsBefore = { ...isolatedMapState.rng };
dispatch(isolatedMapState, ActionKinds.SETTLEMENT_SELECT_VASSAL, {
  candidateIndex: 0, expectedPoolHash: isolatedPool.expectedPoolHash,
});
assert.equal(isolatedMapState.rng.seed, isolatedSeedsBefore.seed);
assert.equal(isolatedMapState.rng.vassalSeed, isolatedSeedsBefore.vassalSeed);
assert.equal(isolatedMapState.rng.vassalDevelopmentSeed, isolatedSeedsBefore.vassalDevelopmentSeed);
assert.notEqual(isolatedMapState.rng.vassalLifeMapSeed, isolatedSeedsBefore.vassalLifeMapSeed,
  "selecting a Vassal advances only the topology RNG substream");
assert.deepEqual(
  deserializeGameState(serializeGameState(isolatedMapState)).civilization.vassalLineage,
  isolatedMapState.civilization.vassalLineage,
  "the generated graph survives JSON serialization"
);

const generatorConfig = createAuthoredVassalLifeMapGeneratorConfig();
assert.deepEqual([
  generatorConfig.earlyDepthCount,
  generatorConfig.midDepthCount,
  generatorConfig.normalDepthCount - generatorConfig.earlyDepthCount - generatorConfig.midDepthCount,
], [4, 4, 3]);
assert.deepEqual(
  ["patronage", "development", "travel", "practiceReform", "publicWorks", "routes", "crisis"]
    .map((family) => generatorConfig.weights.early[family]),
  [5, 5, 5, 1, 1, 1, 0]
);
assert.deepEqual(generatorConfig.nonRepeatFamilyIds, ["crisis"]);
const generatedA = generateVassalLifeMap(generatorConfig, createRng(123), { generationSeed: 123 });
const generatedB = generateVassalLifeMap(generatorConfig, createRng(123), { generationSeed: 123 });
assert.equal(generatedA.ok, true);
assert.deepEqual(generatedA, generatedB, "Life Map generation is deterministic");
assert.notDeepEqual(
  generatedA.graph,
  generateVassalLifeMap(generatorConfig, createRng(124), { generationSeed: 124 }).graph,
  "different topology seeds produce different maps"
);
assert.equal(generatedA.routeTraces.length, 6);
assert.equal(new Set(generatedA.routeTraces.map((route) => route.join(","))).size, 6);
assert.notEqual(generatedA.routeTraces[0][0], generatedA.routeTraces[1][0]);
const generatedGraph = generatedA.graph;
assert.equal(validateVassalLifeMapGraph(generatedGraph).ok, true);
assert.equal(generatedGraph.nodes.filter((node) => node.family === "legacy").length, 1);
assert.equal(generatedGraph.nodes.find((node) => node.id === generatedGraph.bossNodeId).depth, 11);
assert.ok(generatedGraph.entryNodeIds.length >= 2);
assert.notEqual(
  generatedGraph.nodes.find((node) => node.id === generatedGraph.entryNodeIds[0]).family,
  generatedGraph.nodes.find((node) => node.id === generatedGraph.entryNodeIds[1]).family
);
const generatedNodeById = new Map(generatedGraph.nodes.map((node) => [node.id, node]));
for (const edge of generatedGraph.edges) {
  const from = generatedNodeById.get(edge.fromNodeId);
  const to = generatedNodeById.get(edge.toNodeId);
  assert.equal(to.depth, from.depth + 1);
  if (to.family !== "legacy") assert.ok(Math.abs(to.lane - from.lane) <= 1);
  assert.equal(from.family === "crisis" && to.family === "crisis", false);
}
for (let depth = 0; depth < 10; depth += 1) {
  const edges = generatedGraph.edges.filter((edge) => generatedNodeById.get(edge.fromNodeId).depth === depth);
  for (const edgeA of edges) for (const edgeB of edges) {
    const a0 = generatedNodeById.get(edgeA.fromNodeId).lane;
    const a1 = generatedNodeById.get(edgeA.toNodeId).lane;
    const b0 = generatedNodeById.get(edgeB.fromNodeId).lane;
    const b1 = generatedNodeById.get(edgeB.toNodeId).lane;
    assert.equal((a0 < b0 && a1 > b1) || (a0 > b0 && a1 < b1), false, "edges do not cross");
  }
}
const branchSignatures = new Map();
for (let depth = 11; depth >= 0; depth -= 1) {
  for (const node of generatedGraph.nodes.filter((entry) => entry.depth === depth)) {
    const childSignatures = generatedGraph.edges.filter((edge) => edge.fromNodeId === node.id)
      .map((edge) => branchSignatures.get(edge.toNodeId)).sort();
    assert.equal(new Set(childSignatures).size, childSignatures.length,
      "a node does not offer recursively equivalent choices");
    branchSignatures.set(node.id, `${node.family}[${childSignatures.join("|")}]`);
  }
}
const entrySignatures = generatedGraph.entryNodeIds.map((id) => branchSignatures.get(id));
assert.equal(new Set(entrySignatures).size, entrySignatures.length,
  "virtual-root choices are recursively distinct");

const historicalSelectionState = {
  tSec: 30,
  civilization: {
    vassalLineage: {
      selectedVassalIds: ["v1", "v2", "v3"],
      vassalsById: {
        v1: { vassalId: "v1", selectedSec: 10 },
        v2: { vassalId: "v2", selectedSec: 20 },
        v3: { vassalId: "v3", selectedSec: 20 },
      },
    },
  },
};
assert.equal(getLifeMapVassalAtSecond(historicalSelectionState, 9), null);
assert.equal(getLifeMapVassalAtSecond(historicalSelectionState, 19)?.vassalId, "v1");
assert.equal(getLifeMapVassalAtSecond(historicalSelectionState, 20)?.vassalId, "v3",
  "the newest Vassal wins when selections share a timeline second");
assert.equal(getLifeMapVassalAtSecond(historicalSelectionState, 30)?.vassalId, "v3",
  "the latest Vassal remains selected through a gap after their life");
assert.equal(VASSAL_NODE_FAMILIES.development.label, "Development");

const formulaState = selectedState(100);
const formulaVassal = getCurrentLifeMapVassal(formulaState);
formulaVassal.stats = { cunning: 4, wisdom: 5, effectiveness: 20, intelligence: 20 };
assert.equal(getVassalPrestigeIncome(formulaVassal), 7);
assert.equal(getVassalDevelopmentIncome(formulaVassal), 7);
assert.equal(getAdjustedVassalPrestigeCost(formulaVassal, 20), 8, "Intelligence caps at 60%");
assert.equal(getAdjustedVassalPhaseCost(formulaVassal, 120), 48, "Phase costs round upward");
assert.equal(getAdjustedVassalPhaseCost(formulaVassal, 1), 1, "nonzero Phase costs keep a minimum of one");
assert.equal(formatVassalPhaseDuration(0), "0ph");
assert.equal(formatVassalPhaseDuration(32), "1yr, 2ph");
assert.equal(formatVassalPhaseDuration(80), "2yr, 3mo, 2ph");
assert.deepEqual(VASSAL_LEGACY_OPTIONS.map((option) => option.id), [
  "foundDynasty", "enduringOffice", "humbleRemembrance",
]);
assert.equal(VASSAL_LEGACY_OPTIONS[0].prestigeCost, VASSAL_LIFE_TUNING.legacyPrestigeCost * 2);
assert.equal(VASSAL_LEGACY_OPTIONS[0].legacyStartingPrestigeBonus,
  VASSAL_LIFE_TUNING.legacyStartingPrestigeBonus * 2);

const travelState = selectedState(101);
const travelVassal = getCurrentLifeMapVassal(travelState);
const originalLocation = travelVassal.locationRegionId;
const travelNode = forceEnter(travelState, nodeIdForFamily(travelState, "travel"));
assert.ok(travelNode.options.length > 0);
assert.equal(travelNode.options.length, VASSAL_LIFE_TUNING.travelOptionCount,
  "Travel reveals the configured three closest deterministic destinations");
assert.ok(travelNode.options.every((option) =>
  option.locationRegionId !== originalLocation
    && Number.isFinite(option.graphDistance)
    && option.phaseCost === Math.max(1, option.graphDistance) * VASSAL_LIFE_TUNING.phasesPerTravelStep
));
const destination = travelNode.options[0];
const travelPresentation = getVassalNodeDecisionPresentation(travelState, travelNode.nodeId, {
  previewOptionId: destination.id,
});
assert.equal(travelPresentation.contextKind, "regionalMap");
assert.equal(travelPresentation.regionalMap.currentRegionId, originalLocation);
assert.equal(travelPresentation.regionalMap.selectedDestinationId, destination.locationRegionId);
assert.equal(travelPresentation.regionalMap.selectedPath[0], originalLocation);
assert.equal(travelPresentation.regionalMap.selectedPath.at(-1), destination.locationRegionId);
assert.ok(travelPresentation.regionalMap.regions.some((region) => region.current));
assert.equal(travelPresentation.mortalityEstimate.timeLabel,
  formatVassalPhaseDuration(destination.phaseCost),
  "decision presentation exposes the selected option's human-readable elapsed time");
dispatch(travelState, ActionKinds.VASSAL_SELECT_LIFE_OPTION, {
  nodeId: travelNode.nodeId, optionId: destination.id,
});
assert.equal(travelVassal.locationRegionId, originalLocation, "Travel is staged until confirmation");
dispatch(travelState, ActionKinds.VASSAL_CONFIRM_LIFE_NODE, { nodeId: travelNode.nodeId });
assert.equal(travelVassal.locationRegionId, destination.locationRegionId);

const shopState = selectedState(102);
const shopVassal = getCurrentLifeMapVassal(shopState);
shopVassal.prestige = 500;
shopVassal.stats.intelligence = 0;
shopVassal.stats.effectiveness = 0;
const shopNode = forceEnter(shopState, nodeIdForFamily(shopState, "practiceReform"));
const entryInventory = serializeGameState(shopState).civilization.vassalLineage
  .vassalsById[shopVassal.vassalId].lifeMap.nodeStates[shopNode.nodeId].inventory;
dispatch(shopState, ActionKinds.VASSAL_PURCHASE_SHOP_OFFER, {
  nodeId: shopNode.nodeId, offerId: shopNode.inventory[0].offerId,
});
dispatch(shopState, ActionKinds.VASSAL_PURCHASE_SHOP_OFFER, {
  nodeId: shopNode.nodeId, offerId: shopNode.inventory[0].offerId,
});
assert.equal(shopVassal.prestige, 500, "staged purchases ghost Prestige until confirmation");
const stagedPresentation = getVassalNodeDecisionPresentation(shopState, shopNode.nodeId);
assert.equal(stagedPresentation.projectedPrestige,
  500 - shopNode.purchasedOffers.reduce((sum, purchase) => sum + purchase.prestigeCost, 0));
assert.ok(stagedPresentation.purchases.every((purchase) => purchase.presentation?.rule),
  "gamepiece purchases expose their actual rule text before confirmation");
assert.ok(stagedPresentation.settlement.practices.some((slot) => slot?.staged),
  "the decision presentation ghosts staged Practices into authoritative slots");
assert.equal(stagedPresentation.mortalityEstimate.totalPhaseCost,
  shopNode.accumulatedPhaseCost,
  "shop mortality includes all staged elapsed time");
assert.equal(shopNode.inventory.length, 1, "purchases remove offers without replenishment");
assert.equal(applyAction(shopState, {
  kind: ActionKinds.VASSAL_REROLL_SHOP, payload: { nodeId: shopNode.nodeId },
}, { isReplay: true }).reason, "stagedPurchases", "reroll requires an empty draft");
for (const purchase of [...shopNode.purchasedOffers]) {
  dispatch(shopState, ActionKinds.VASSAL_UNDO_SHOP_PURCHASE, {
    nodeId: shopNode.nodeId, offerId: purchase.offerId,
  });
}
assert.equal(shopNode.inventory.length, 3, "undo restores offers to their original inventory");
dispatch(shopState, ActionKinds.VASSAL_REROLL_SHOP, { nodeId: shopNode.nodeId });
assert.equal(shopNode.inventory.length, 3, "the single reroll discards and refills to three");
for (const offerId of shopNode.inventory.map((offer) => offer.offerId)) {
  dispatch(shopState, ActionKinds.VASSAL_PURCHASE_SHOP_OFFER, {
    nodeId: shopNode.nodeId, offerId,
  });
}
assert.equal(shopNode.purchasedOffers.length, 3);
assert.notDeepEqual(shopNode.inventory, entryInventory, "rerolled inventory persists as new content");
dispatch(shopState, ActionKinds.VASSAL_REORDER_SHOP_PURCHASE, {
  nodeId: shopNode.nodeId,
  offerId: shopNode.purchasedOffers[2].offerId,
  toIndex: 0,
});
const purchasedOrder = shopNode.purchasedOffers.map((purchase) => purchase.offerId);
const stagedCost = shopNode.purchasedOffers.reduce((sum, purchase) => sum + purchase.prestigeCost, 0);
const rngBeforeShopConfirm = shopState.rng.vassalSeed;
dispatch(shopState, ActionKinds.VASSAL_CONFIRM_LIFE_NODE, { nodeId: shopNode.nodeId });
assert.equal(shopVassal.prestige, 500 - 6 - stagedCost,
  "confirm commits reroll and staged purchase Prestige exactly once");
assert.equal(shopNode.mortality, undefined, "shop confirmation does not roll before accumulated time");
resolvePending(shopState);
assert.deepEqual(
  shopVassal.lifeEvents.filter((event) => event.kind === "interventionApplied")
    .map((event) => event.offerId),
  purchasedOrder,
  "staged interventions apply in purchase order"
);
assert.notEqual(shopState.rng.vassalSeed, rngBeforeShopConfirm);
const prestigeAfterShopResolution = shopVassal.prestige;
stepDetailedSettlementsSecond(shopState, shopState.tSec);
assert.equal(shopVassal.prestige, prestigeAfterShopResolution,
  "a completed node cannot grant recurring income twice");
assert.equal(applyAction(shopState, {
  kind: ActionKinds.VASSAL_REROLL_SHOP, payload: { nodeId: shopNode.nodeId },
}, { isReplay: true }).ok, false, "reroll remains unavailable after resolution");

for (const [family, seed] of [["publicWorks", 103], ["routes", 104]]) {
  const state = selectedState(seed);
  const nodeId = nodeIdForFamily(state, family);
  const vassal = getCurrentLifeMapVassal(state);
  vassal.prestige = 500;
  const node = forceEnter(state, nodeId);
  assert.ok(node.inventory.length <= 3);
  assert.ok(node.inventory.every((offer) =>
    offer.intervention.kind === (node.family === "publicWorks" ? "structure" : "connection")
  ));
  if (node.family === "publicWorks") {
    assert.ok(node.inventory.every((offer) =>
      offer.intervention.targetRegionId === vassal.locationRegionId
    ));
  } else {
    assert.ok(node.inventory.every((offer) =>
      [offer.intervention.regionAId, offer.intervention.regionBId]
        .includes(vassal.locationRegionId)
    ));
    const routePreview = getVassalNodeDecisionPresentation(state, node.nodeId, {
      previewOfferId: node.inventory[0]?.offerId,
    });
    assert.equal(routePreview.contextKind, "regionalMap");
    assert.ok(routePreview.regionalMap.regions.some((region) => region.current));
    if (node.inventory[0]) {
      assert.ok(routePreview.regionalMap.connections.some((connection) =>
        connection.status.startsWith("preview-")));
    }
  }
}

const patronagePresentationState = selectedState(1041);
const patronagePresentationVassal = getCurrentLifeMapVassal(patronagePresentationState);
const patronagePresentationNode = forceEnter(patronagePresentationState,
  nodeIdForFamily(patronagePresentationState, "patronage"));
const patronageOption = patronagePresentationNode.options.find((option) => option.statId)
  ?? patronagePresentationNode.options[0];
const patronagePresentation = getVassalNodeDecisionPresentation(
  patronagePresentationState, patronagePresentationNode.nodeId,
  { previewOptionId: patronageOption.id }
);
assert.equal(patronagePresentation.contextKind, "vassal");
assert.equal(patronagePresentation.vassalProjection.optionId, patronageOption.id);
assert.equal(patronagePresentation.vassalProjection.ifSurvives.prestigeIncome,
  getVassalPrestigeIncome({
    ...patronagePresentationVassal,
    stats: Object.fromEntries(patronagePresentation.vassalProjection.immediate.stats
      .map((stat) => [stat.statId, stat.value])),
  }));

const elderIndependentA = selectedState(109);
const elderIndependentB = selectedState(109);
for (const site of elderIndependentB.world.sites) {
  site.detailedState.populationByClass.villager.eldersByAge = [
    { age: 55, count: 30 }, { age: 80, count: 30 },
  ];
  site.detailedState.populationByClass.stranger.eldersByAge = [{ age: 90, count: 30 }];
}
for (const state of [elderIndependentA, elderIndependentB]) {
  const vassal = getCurrentLifeMapVassal(state);
  vassal.prestige = 500;
  const node = forceEnter(state, nodeIdForFamily(state, "practiceReform"));
  dispatch(state, ActionKinds.VASSAL_PURCHASE_SHOP_OFFER, {
    nodeId: node.nodeId, offerId: node.inventory[0].offerId,
  });
}
const elderPracticeId = nodeIdForFamily(elderIndependentA, "practiceReform");
const elderNodeA = getCurrentLifeMapVassal(elderIndependentA).lifeMap.nodeStates[elderPracticeId];
const elderNodeB = getCurrentLifeMapVassal(elderIndependentB).lifeMap.nodeStates[elderPracticeId];
assert.deepEqual(elderNodeA.inventory, elderNodeB.inventory);
assert.deepEqual(elderNodeA.purchasedOffers, elderNodeB.purchasedOffers);
for (const state of [elderIndependentA, elderIndependentB]) {
  dispatch(state, ActionKinds.VASSAL_CONFIRM_LIFE_NODE, { nodeId: elderPracticeId });
  resolvePending(state);
}
assert.deepEqual(elderNodeA.mortality, elderNodeB.mortality,
  "Elder simulation RNG cannot change a Vassal mortality result");
assert.deepEqual(
  getCurrentLifeMapVassal(elderIndependentA)?.lifeMap.availableNodeIds,
  getCurrentLifeMapVassal(elderIndependentB)?.lifeMap.availableNodeIds,
  "differing Elder states do not affect Vassal resolution"
);

const developmentState = selectedState(105);
const developmentVassal = getCurrentLifeMapVassal(developmentState);
developmentVassal.stats.wisdom = 8;
const zeroPurchaseNode = forceEnter(developmentState,
  nodeIdForFamily(developmentState, "practiceReform"));
assert.equal(
  getVassalNodeDecisionPresentation(developmentState, zeroPurchaseNode.nodeId).mortalityEstimate.totalPhaseCost,
  VASSAL_LIFE_TUNING.emptyShopConfirmPhaseCost,
  "empty-shop presentation includes the confirmation time"
);
const seedBeforeMortality = developmentState.rng.vassalSeed;
const developmentSeedBeforeLevel = developmentState.rng.vassalDevelopmentSeed;
dispatch(developmentState, ActionKinds.VASSAL_CONFIRM_LIFE_NODE, { nodeId: zeroPurchaseNode.nodeId });
assert.equal(developmentVassal.lifeMap.pendingResolution.phaseCost,
  VASSAL_LIFE_TUNING.emptyShopConfirmPhaseCost,
  "empty shops charge their two-year confirmation time");
resolvePending(developmentState);
assert.equal(zeroPurchaseNode.mortality.roll >= 0, true, "zero-purchase shop still resolves once");
assert.equal(developmentState.rng.vassalSeed, seedBeforeMortality + 0x6d2b79f5,
  "one completed node consumes exactly one natural-mortality roll");
assert.equal(developmentVassal.developmentChoiceQueue.length, 1);
assert.equal(developmentVassal.developmentChoiceQueue[0].offeredStatIds.length, 3);
assert.equal(new Set(developmentVassal.developmentChoiceQueue[0].offeredStatIds).size, 3);
assert.notEqual(developmentState.rng.vassalDevelopmentSeed, developmentSeedBeforeLevel,
  "level pools consume only their isolated RNG stream");
assert.ok(developmentVassal.lifeMap.availableNodeIds.every((nodeId) =>
  getVassalNodeDisplayState(developmentState, nodeId).available === false
));
const levelChoice = developmentVassal.developmentChoiceQueue[0];
const chosenLevelStat = levelChoice.offeredStatIds[0];
const excludedLevelStat = ["cunning", "wisdom", "effectiveness", "intelligence"]
  .find((statId) => !levelChoice.offeredStatIds.includes(statId));
assert.equal(applyAction(developmentState, {
  kind: ActionKinds.VASSAL_CHOOSE_DEVELOPMENT_STAT,
  payload: { choiceId: "stale-choice", statId: chosenLevelStat },
}, { isReplay: true }).reason, "staleDevelopmentChoice");
assert.equal(applyAction(developmentState, {
  kind: ActionKinds.VASSAL_CHOOSE_DEVELOPMENT_STAT,
  payload: { choiceId: levelChoice.choiceId, statId: excludedLevelStat },
}, { isReplay: true }).reason, "invalidStat");
dispatch(developmentState, ActionKinds.VASSAL_CHOOSE_DEVELOPMENT_STAT, {
  choiceId: levelChoice.choiceId, statId: chosenLevelStat,
});
assert.equal(developmentVassal.developmentChoiceQueue.length, 0);
assert.ok(developmentVassal.lifeMap.availableNodeIds.every((nodeId) =>
  getVassalNodeDisplayState(developmentState, nodeId).available === true
));
assert.equal(applyAction(developmentState, {
  kind: ActionKinds.VASSAL_CHOOSE_DEVELOPMENT_STAT,
  payload: { choiceId: levelChoice.choiceId, statId: excludedLevelStat },
}, { isReplay: true }).reason, "noDevelopmentChoice");

const multiLevelState = selectedState(1051);
const multiLevelVassal = getCurrentLifeMapVassal(multiLevelState);
multiLevelVassal.stats.wisdom = 20;
multiLevelVassal.developmentProgress = 9;
const multiLevelNode = forceEnter(multiLevelState,
  nodeIdForFamily(multiLevelState, "practiceReform"));
dispatch(multiLevelState, ActionKinds.VASSAL_CONFIRM_LIFE_NODE, { nodeId: multiLevelNode.nodeId });
resolvePending(multiLevelState);
assert.equal(multiLevelVassal.developmentChoiceQueue.length, 3,
  "each earned level persists as its own independently rolled choice");
assert.equal(new Set(multiLevelVassal.developmentChoiceQueue.map((choice) => choice.choiceId)).size, 3);
const serializedChoices = serializeGameState(multiLevelState);
assert.deepEqual(deserializeGameState(serializedChoices).civilization.vassalLineage
  .vassalsById[multiLevelVassal.vassalId].developmentChoiceQueue,
multiLevelVassal.developmentChoiceQueue, "level-up pools survive save/replay serialization");

let wisdomWasOffered = false;
for (let seed = 1052; seed < 1072 && !wisdomWasOffered; seed += 1) {
  const state = selectedState(seed);
  const vassal = getCurrentLifeMapVassal(state);
  vassal.stats.wisdom = 8;
  const node = forceEnter(state, nodeIdForFamily(state, "practiceReform"));
  dispatch(state, ActionKinds.VASSAL_CONFIRM_LIFE_NODE, { nodeId: node.nodeId });
  resolvePending(state);
  wisdomWasOffered = vassal.developmentChoiceQueue[0]?.offeredStatIds.includes("wisdom") === true;
}
assert.equal(wisdomWasOffered, true, "Wisdom participates in the three-of-four level pool");

const crisisState = selectedState(106);
const crisisVassal = getCurrentLifeMapVassal(crisisState);
crisisState.tSec = 5;
const crisisNode = forceEnter(crisisState, nodeIdForFamily(crisisState, "crisis"));
dispatch(crisisState, ActionKinds.VASSAL_SELECT_LIFE_OPTION, {
  nodeId: crisisNode.nodeId, optionId: "rallyLoyalists",
});
crisisState.rng.vassalSeed = findSeed((roll) => roll < VASSAL_LIFE_TUNING.crisisImmediateDeathChance);
dispatch(crisisState, ActionKinds.VASSAL_CONFIRM_LIFE_NODE, { nodeId: crisisNode.nodeId });
assert.equal(getCurrentLifeMapVassal(crisisState), null);
assert.equal(crisisVassal.deathCause, "crisis");
assert.equal(crisisNode.mortality, undefined, "Crisis death precedes natural mortality");
assert.deepEqual(getCommittedVassalLifeMapNodeIds(crisisVassal), [crisisNode.nodeId],
  "an immediately fatal confirmed choice remains part of the committed route");
assert.equal(getVassalLifeMapPlayheadNodeId(crisisVassal, crisisVassal.endSec - 1), null);
assert.equal(getVassalLifeMapPlayheadNodeId(crisisVassal, crisisVassal.endSec), crisisNode.nodeId,
  "the historical highlight advances when the fatal choice is confirmed");
assert.equal(getVassalCandidatePool(crisisState).candidates.length, 3);

const naturalDeathState = selectedState(107);
const naturalDeathVassal = getCurrentLifeMapVassal(naturalDeathState);
naturalDeathVassal.initialAge = 80;
naturalDeathVassal.stats.wisdom = 20;
naturalDeathVassal.developmentProgress = 9;
const naturalDeathNode = forceEnter(naturalDeathState,
  nodeIdForFamily(naturalDeathState, "practiceReform"));
naturalDeathState.rng.vassalSeed = findSeed((roll) => roll < getVassalMortalityChance(80));
dispatch(naturalDeathState, ActionKinds.VASSAL_CONFIRM_LIFE_NODE, { nodeId: naturalDeathNode.nodeId });
resolvePending(naturalDeathState);
assert.equal(getCurrentLifeMapVassal(naturalDeathState), null);
assert.equal(naturalDeathVassal.deathCause, "naturalMortality");
assert.equal(naturalDeathNode.mortality.age, 81,
  "empty-shop confirmation time advances age before mortality");
assert.equal(naturalDeathVassal.developmentChoiceQueue.length, 0,
  "fatal completion never queues unusable level-up decisions");

const legacyState = selectedState(108);
const legacyVassal = getCurrentLifeMapVassal(legacyState);
legacyVassal.prestige = 100;
const legacyNode = forceEnter(legacyState, nodeIdForFamily(legacyState, "legacy"));
dispatch(legacyState, ActionKinds.VASSAL_SELECT_LIFE_OPTION, {
  nodeId: legacyNode.nodeId, optionId: "enduringOffice",
});
dispatch(legacyState, ActionKinds.VASSAL_CONFIRM_LIFE_NODE, { nodeId: legacyNode.nodeId });
assert.equal(legacyState.civilization.vassalLegacy.futureStartingPrestigeBonus, 3,
  "Legacy applies before the delayed mortality boundary");
resolvePending(legacyState);
assert.equal(getCurrentLifeMapVassal(legacyState), null);
assert.equal(legacyVassal.endedReason, "retired");
assert.equal(legacyVassal.developmentChoiceQueue.length, 0,
  "terminal retirement never queues unusable level-up decisions");
assert.ok(getVassalCandidatePool(legacyState).candidates.every((candidate) => candidate.prestige >= 11));

const freeLegacyState = selectedState(1081);
const freeLegacyVassal = getCurrentLifeMapVassal(freeLegacyState);
freeLegacyVassal.prestige = 0;
const freeLegacyNode = forceEnter(freeLegacyState, nodeIdForFamily(freeLegacyState, "legacy"));
const freeLegacyOption = freeLegacyNode.options.find((option) => option.id === "humbleRemembrance");
assert.equal(freeLegacyNode.options.length, 3);
assert.equal(freeLegacyOption.prestigeCost, 0);
assert.equal(freeLegacyOption.phaseCost, 0);
dispatch(freeLegacyState, ActionKinds.VASSAL_SELECT_LIFE_OPTION, {
  nodeId: freeLegacyNode.nodeId, optionId: freeLegacyOption.id,
});
dispatch(freeLegacyState, ActionKinds.VASSAL_CONFIRM_LIFE_NODE, { nodeId: freeLegacyNode.nodeId });
assert.equal(freeLegacyState.civilization.vassalLegacy.futureStartingPrestigeBonus, 1,
  "the free Legacy choice grants its weaker future-Vassal benefit");
assert.equal(getCurrentLifeMapVassal(freeLegacyState), null,
  "a zero-Prestige Vassal can always complete a terminal Legacy node");

const serialized = serializeGameState(legacyState);
assert.equal(validateVassalLifeMapState(serialized).ok, true);
assert.deepEqual(serializeGameState(deserializeGameState(serialized)), serialized);
const invalid = structuredClone(serialized);
invalid.civilization.vassalLineage.currentVassalId = "missing-vassal";
assert.throws(() => deserializeGameState(invalid), /Invalid serialized Vassal Life Map/);

const practiceTierState = selectedState(1600);
const practiceTierVassal = getCurrentLifeMapVassal(practiceTierState);
practiceTierVassal.prestige = 500;
const practiceTierSettlement = practiceTierState.world.sites.find(
  (site) => site.regionId === practiceTierVassal.locationRegionId
).detailedState;
practiceTierSettlement.practiceSlots = [
  { practiceId: "forage", tier: "bronze", charge: 0, work: 0 },
  { practiceId: "cultivate", tier: "bronze", charge: 0, work: 0 },
  { practiceId: "administrate", tier: "bronze", charge: 0, work: 0 },
  { practiceId: "preserve", tier: "bronze", charge: 0, work: 0 },
  { practiceId: "exchange", tier: "bronze", charge: 0, work: 0 },
];
const practiceTierNode = forceEnter(practiceTierState,
  nodeIdForFamily(practiceTierState, "practiceReform"));
assert.equal(new Set(practiceTierNode.inventory.map((offer) => offer.intervention.practiceId)).size,
  practiceTierNode.inventory.length, "practice shop offers have unique identities");
assert.ok(practiceTierNode.inventory.every((offer) =>
  offer.intervention.mode === "learn" || offer.intervention.tier === "bronze"),
"installed practices roll at their matching tier");
const learnOffer = practiceTierNode.inventory.find((offer) => offer.intervention.mode === "learn");
assert.ok(learnOffer, "a shop with uninstalled practices offers a Learn purchase");
dispatch(practiceTierState, ActionKinds.VASSAL_PURCHASE_SHOP_OFFER, {
  nodeId: practiceTierNode.nodeId, offerId: learnOffer.offerId,
});
dispatch(practiceTierState, ActionKinds.VASSAL_CONFIRM_LIFE_NODE, { nodeId: practiceTierNode.nodeId });
resolvePending(practiceTierState);
assert.equal(practiceTierSettlement.practiceSlots[0].practiceId, learnOffer.intervention.practiceId,
  "learning inserts the practice into the leftmost slot");
assert.equal(practiceTierSettlement.practiceSlots[0].tier, "bronze");
assert.equal(practiceTierSettlement.practiceSlots.length, 5);
assert.equal(practiceTierSettlement.practiceSlots.some((slot) => slot?.practiceId === "exchange"), false,
  "a full board discards its rightmost practice when learning");

let upgradeShop = null;
for (let seed = 1601; seed < 1700 && !upgradeShop; seed += 1) {
  const state = selectedState(seed);
  const vassal = getCurrentLifeMapVassal(state);
  vassal.prestige = 500;
  const settlement = state.world.sites.find((site) => site.regionId === vassal.locationRegionId).detailedState;
  settlement.practiceSlots = [{ practiceId: "forage", tier: "gold", charge: 0, work: 0 }, null, null, null, null];
  const node = forceEnter(state, nodeIdForFamily(state, "practiceReform"));
  const offer = node.inventory.find((entry) => entry.intervention.practiceId === "forage");
  if (offer) upgradeShop = { state, settlement, node, offer };
}
assert.ok(upgradeShop, "a deterministic practice roll can produce the installed practice");
assert.equal(upgradeShop.offer.intervention.tier, "gold");
assert.equal(upgradeShop.offer.intervention.resultingTier, "diamond");
dispatch(upgradeShop.state, ActionKinds.VASSAL_PURCHASE_SHOP_OFFER, {
  nodeId: upgradeShop.node.nodeId, offerId: upgradeShop.offer.offerId,
});
dispatch(upgradeShop.state, ActionKinds.VASSAL_CONFIRM_LIFE_NODE, { nodeId: upgradeShop.node.nodeId });
resolvePending(upgradeShop.state);
assert.deepEqual(upgradeShop.settlement.practiceSlots[0],
  { practiceId: "forage", tier: "diamond", charge: 0, work: 0 },
  "matching-tier purchases upgrade and move the practice leftmost");

const diamondShopState = selectedState(1701);
const diamondVassal = getCurrentLifeMapVassal(diamondShopState);
diamondShopState.world.sites.find((site) => site.regionId === diamondVassal.locationRegionId)
  .detailedState.practiceSlots[0] = { practiceId: "forage", tier: "diamond", charge: 0, work: 0 };
const diamondShopNode = forceEnter(diamondShopState,
  nodeIdForFamily(diamondShopState, "practiceReform"));
assert.equal(diamondShopNode.inventory.some((offer) => offer.intervention.practiceId === "forage"), false,
  "Diamond practices are excluded from future shop rolls");

console.log("[vassal-life-map] OK");
