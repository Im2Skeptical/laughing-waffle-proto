import assert from "node:assert/strict";
import { ActionKinds, applyAction } from "../../actions.js";
import { createInitialState } from "../../init.js";
import { createRng } from "../../rng.js";
import { deserializeGameState, serializeGameState } from "../../state.js";
import {
  VASSAL_LEGACY_OPTIONS,
  VASSAL_MONSTER_HUNT_OPTIONS,
  VASSAL_LIFE_TUNING,
  getVassalMortalityChance,
} from "../../../defs/gamepieces/vassal-life-map-defs.js";
import {
  getCommittedVassalLifeMapNodeIds,
  getAdjustedVassalPrestigeCost,
  formatVassalPhaseDuration,
  getCurrentLifeMapVassal,
  getVassalCandidatePool,
  getVassalLifeMapPlayheadNodeId,
  getVassalLifeMapNodes,
  getVassalNodeDisplayState,
  getVassalNodeDecisionPresentation,
  getVassalPrestigeIncome,
  validateVassalLifeMapState,
} from "../../vassal-life-map.js";
import {
  createAuthoredVassalLifeMapGeneratorConfig,
  generateVassalLifeMap,
  validateVassalLifeMapGraph,
} from "../../vassal-life-map-generator.js";
import {
  dispatch,
  findSeed,
  forceEnter,
  nodeIdForFamily,
  nodeIdForSignature,
  resolvePending,
  selectedState,
  selectedStateForSignature,
} from "./helpers.js";

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
  nodeId: legacyNode.nodeId,
  optionId: legacyNode.options.find((option) => option.id === "enduringOffice")?.id
    ?? "humbleRemembrance",
});
dispatch(legacyState, ActionKinds.VASSAL_CONFIRM_LIFE_NODE, { nodeId: legacyNode.nodeId });
assert.equal(legacyState.civilization.vassalLegacy.futureStartingPrestigeBonus,
  legacyNode.options.find((option) => option.id === "enduringOffice")?.legacyStartingPrestigeBonus ?? 1,
  "Legacy applies before the delayed mortality boundary");
if (getCurrentLifeMapVassal(legacyState)) resolvePending(legacyState);
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

let settlementFixture = null;
for (let seed = 0; seed < 1000 && !settlementFixture; seed += 1) {
  const candidateState = createInitialState("devPlaytesting01", seed);
  const candidatePool = getVassalCandidatePool(candidateState);
  for (const candidate of candidatePool.candidates.filter((entry) =>
    entry.signatureNode?.variantId === "settlement")) {
    const state = createInitialState("devPlaytesting01", seed);
    const pool = getVassalCandidatePool(state);
    dispatch(state, ActionKinds.SETTLEMENT_SELECT_VASSAL, {
      candidateIndex: candidate.candidateIndex, expectedPoolHash: pool.expectedPoolHash,
    });
    const vassal = getCurrentLifeMapVassal(state);
    vassal.prestige = 100;
    const node = forceEnter(state, nodeIdForSignature(state, "settlement"));
    const requirements = getVassalNodeDecisionPresentation(state, node.nodeId).optionRequirements;
    const option = node.options.find((entry) => entry.settlementRegionId
      && requirements[entry.id].every((requirement) => requirement.met));
    if (option) { settlementFixture = { state, vassal, node, option }; break; }
  }
}
assert.ok(settlementFixture, "Settlement offers a connected frontier region when affordable");
const { state: settlementState, vassal: settlementVassal,
  node: settlementNode, option: settlementOption } = settlementFixture;
const sourceRegionId = settlementVassal.locationRegionId;
const sourceAdults = settlementState.world.sites.find((site) => site.regionId === sourceRegionId)
  .detailedState.populationByClass.villager.adults;
assert.ok(settlementNode.options.length <= 3);
dispatch(settlementState, ActionKinds.VASSAL_SELECT_LIFE_OPTION, {
  nodeId: settlementNode.nodeId, optionId: settlementOption.id,
});
dispatch(settlementState, ActionKinds.VASSAL_CONFIRM_LIFE_NODE, { nodeId: settlementNode.nodeId });
const settledRegionId = settlementOption.settlementRegionId;
const settled = settlementState.world.sites.find((site) => site.regionId === settledRegionId)?.detailedState;
assert.equal(settlementState.world.regions.find((region) => region.id === settledRegionId).controller, "player");
assert.equal(settlementVassal.locationRegionId, settledRegionId);
assert.equal(settlementState.world.sites.find((site) => site.regionId === sourceRegionId)
  .detailedState.populationByClass.villager.adults, sourceAdults - 10);
assert.equal(settled.populationByClass.villager.adults, 10);
assert.equal(settled.storedFood, 60);
assert.deepEqual(settled.practiceSlots.slice(0, 2).map((slot) => slot?.practiceId ?? null), ["forage", null]);
assert.deepEqual(settled.structureSlots.slice(0, 2).map((slot) => slot?.structureId ?? null), ["granary", "mudHouses"]);
assert.equal(validateVassalLifeMapState(serializeGameState(settlementState)).ok, true,
  "settlement choices remain serializable after confirmation");

const developmentOptionsState = selectedState(1);
const developmentNode = forceEnter(developmentOptionsState, nodeIdForFamily(developmentOptionsState, "development"));
assert.equal(developmentNode.options.length, 3);
assert.equal(new Set(developmentNode.options.map((option) => option.statId)).size, 3,
  "Development options award distinct stats");
const hardLesson = developmentNode.options.find((option) => option.id === "hardLesson");
assert.notEqual(hardLesson.statId, hardLesson.lossStatId);
assert.equal(hardLesson.statDelta, 2);
assert.equal(hardLesson.lossStatDelta, -1);
assert.equal(developmentNode.options.find((option) => option.id === "deepStudy").phaseCost,
  hardLesson.phaseCost * 3, "Deep Study costs three times normal Development time");

const pooledCrisisState = selectedState(1);
const pooledCrisis = forceEnter(pooledCrisisState, nodeIdForFamily(pooledCrisisState, "crisis"));
assert.equal(pooledCrisis.options.length, 3);
assert.equal(new Set(pooledCrisis.options.map((option) => option.id)).size, 3,
  "Crisis rolls a unique three-choice pool");

const pooledLegacyState = selectedState(1);
const pooledLegacy = forceEnter(pooledLegacyState, nodeIdForFamily(pooledLegacyState, "legacy"));
assert.equal(pooledLegacy.options.length, 3);
assert.ok(pooledLegacy.options.some((option) => option.id === "humbleRemembrance"),
  "Legacy always keeps its free terminal choice");

const serialized = serializeGameState(legacyState);
assert.equal(validateVassalLifeMapState(serialized).ok, true);
assert.deepEqual(serializeGameState(deserializeGameState(serialized)), serialized);
const invalid = structuredClone(serialized);
invalid.civilization.vassalLineage.currentVassalId = "missing-vassal";
assert.throws(() => deserializeGameState(invalid), /Invalid serialized Vassal Life Map/);

const plusPlacementState = selectedStateForSignature("legacyPlus");
const plusPlacementVassal = getCurrentLifeMapVassal(plusPlacementState);
const plusNodeDef = getVassalLifeMapNodes(plusPlacementVassal)
  .find((node) => node.signatureNode?.variantId === "legacyPlus");
assert.equal(plusNodeDef.id, plusPlacementVassal.lifeMap.graph.bossNodeId);
assert.equal(plusNodeDef.family, "legacy");

plusPlacementVassal.prestige = 500;
const plusNode = forceEnter(plusPlacementState, plusNodeDef.id);
for (const option of plusNode.options) {
  const standard = VASSAL_LEGACY_OPTIONS.find((entry) => entry.id === option.id);
  assert.equal(option.prestigeCost, standard.prestigeCost);
  assert.equal(option.phaseCost, standard.phaseCost);
  assert.equal(option.legacyStartingPrestigeBonus, standard.legacyStartingPrestigeBonus * 2);
}

const monsterState = selectedStateForSignature("monsterHunt");
const monsterVassal = getCurrentLifeMapVassal(monsterState);
monsterVassal.prestige = 100;
const redGod = monsterState.civilization.chaos;
redGod.monsterCount = 7;
const monsterNode = forceEnter(monsterState, nodeIdForSignature(monsterState, "monsterHunt"));
assert.deepEqual(monsterNode.options.map((option) => option.immediateDeathChance ?? 0),
  VASSAL_MONSTER_HUNT_OPTIONS.map((option) => option.immediateDeathChance ?? 0));
dispatch(monsterState, ActionKinds.VASSAL_SELECT_LIFE_OPTION, {
  nodeId: monsterNode.nodeId, optionId: "fundedHunt",
});
const fundedHuntCost = getAdjustedVassalPrestigeCost(monsterVassal, 10);
dispatch(monsterState, ActionKinds.VASSAL_CONFIRM_LIFE_NODE, { nodeId: monsterNode.nodeId });
assert.equal(redGod.monsterCount, 0, "monster removal clamps at zero");
assert.equal(monsterVassal.prestige, 100 - fundedHuntCost + getVassalPrestigeIncome(monsterVassal),
  "the safe hunt pays its full adjusted cost on a shortfall");

for (const [optionId, expectedGain] of [["dangerousHunt", 0], ["recklessHunt", 30]]) {
  const riskState = selectedStateForSignature("monsterHunt");
  const riskVassal = getCurrentLifeMapVassal(riskState);
  riskVassal.prestige = 100;
  riskState.civilization.chaos.monsterCount = 3;
  const riskNode = forceEnter(riskState, nodeIdForSignature(riskState, "monsterHunt"));
  dispatch(riskState, ActionKinds.VASSAL_SELECT_LIFE_OPTION, {
    nodeId: riskNode.nodeId, optionId,
  });
  dispatch(riskState, ActionKinds.VASSAL_CONFIRM_LIFE_NODE, { nodeId: riskNode.nodeId });
  assert.equal(riskState.civilization.chaos.monsterCount, 0,
    `${optionId} clamps monster shortfalls at zero`);
  assert.ok(riskVassal.prestige >= 100 + expectedGain,
    `${optionId} applies its full Prestige result even if immediate death is rolled`);
}

const removalFallbackState = selectedStateForSignature("removePractice");
const removalFallbackVassal = getCurrentLifeMapVassal(removalFallbackState);
removalFallbackVassal.prestige = 100;
removalFallbackState.world.sites.find((site) =>
  site.regionId === removalFallbackVassal.locationRegionId).detailedState.practiceSlots.fill(null);
const removalFallbackNode = forceEnter(removalFallbackState,
  nodeIdForSignature(removalFallbackState, "removePractice"));
assert.equal(removalFallbackNode.contentMode, "choice");
assert.equal(removalFallbackNode.options[0].prestigeDelta, 10);
dispatch(removalFallbackState, ActionKinds.VASSAL_SELECT_LIFE_OPTION, {
  nodeId: removalFallbackNode.nodeId, optionId: "removalFallback",
});
dispatch(removalFallbackState, ActionKinds.VASSAL_CONFIRM_LIFE_NODE, {
  nodeId: removalFallbackNode.nodeId,
});
assert.ok(removalFallbackVassal.prestige >= 110,
  "empty removal nodes grant their zero-time Prestige fallback");

const blockedSettlementState = selectedStateForSignature("settlement");
const blockedVassal = getCurrentLifeMapVassal(blockedSettlementState);
blockedVassal.prestige = 0;
blockedSettlementState.world.sites.find((site) => site.regionId === blockedVassal.locationRegionId)
  .detailedState.populationByClass.villager.adults = 0;
const blockedNode = forceEnter(blockedSettlementState, nodeIdForSignature(blockedSettlementState, "settlement"));
const blockedChoice = blockedNode.options.find((option) => option.settlementRegionId || option.id === "settlement-unavailable");
assert.ok(blockedChoice, "unavailable settlement remains visible");
const blockedRequirements = getVassalNodeDecisionPresentation(blockedSettlementState, blockedNode.nodeId)
  .optionRequirements[blockedChoice.id];
assert.equal(blockedRequirements[0].met, false);
assert.equal(blockedRequirements[1].met, false);
assert.equal(applyAction(blockedSettlementState, { kind: ActionKinds.VASSAL_SELECT_LIFE_OPTION,
  payload: { nodeId: blockedNode.nodeId, optionId: blockedChoice.id } }, { isReplay: true }).ok, false);
assert.ok(blockedNode.options.some((option) => option.id === "settlement-favor"), "fallback allows progress");
