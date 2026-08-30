import assert from "node:assert/strict";
import { ActionKinds, applyAction } from "../actions.js";
import { createInitialState } from "../init.js";
import { createRng } from "../rng.js";
import { deserializeGameState, serializeGameState } from "../state.js";
import {
  VASSAL_LEGACY_OPTIONS,
  VASSAL_LIFE_MAP_ENTRY_NODE_IDS,
  VASSAL_LIFE_MAP_NODES,
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
  getVassalNodeDisplayState,
  getVassalNodeDecisionPresentation,
  getVassalPrestigeIncome,
  validateVassalLifeMapState,
} from "../vassal-life-map.js";
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

assert.equal(VASSAL_LIFE_MAP_NODES.length, 31);
assert.deepEqual(
  Array.from({ length: 11 }, (_, depth) => VASSAL_LIFE_MAP_NODES.filter((node) => node.depth === depth).length),
  [2, 3, 3, 2, 3, 4, 3, 2, 3, 3, 3]
);

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
assert.equal(VASSAL_LIFE_MAP_ENTRY_NODE_IDS.length, 2);
assert.equal(VASSAL_NODE_FAMILIES.development.label, "Development");
assert.deepEqual(
  Object.fromEntries([...new Set(VASSAL_LIFE_MAP_NODES.map((node) => node.family))]
    .map((family) => [family, VASSAL_LIFE_MAP_NODES.filter((node) => node.family === family).length])),
  {
    patronage: 3,
    development: 4,
    travel: 4,
    practiceReform: 6,
    publicWorks: 5,
    routes: 3,
    crisis: 4,
    legacy: 2,
  }
);
assert.equal(new Set(VASSAL_LIFE_MAP_NODES.map((node) => node.id)).size, 31);
assert.ok(VASSAL_LIFE_MAP_NODES.every((node) =>
  node.outgoingNodeIds.every((nextId) =>
    VASSAL_LIFE_MAP_NODES.find((entry) => entry.id === nextId)?.depth === node.depth + 1
 )
));
assert.ok(VASSAL_LIFE_MAP_NODES.filter((node) => node.depth < 10).every((node) =>
  node.outgoingNodeIds.length >= 1 && node.outgoingNodeIds.length <= 2
));
for (let depth = 0; depth < 10; depth += 1) {
  const nodes = VASSAL_LIFE_MAP_NODES.filter((node) => node.depth === depth);
  let previousMax = -1;
  for (const node of nodes) {
    const targets = node.outgoingNodeIds.map((id) => VASSAL_LIFE_MAP_NODES.find((entry) => entry.id === id).lane);
    assert.ok(Math.min(...targets) >= previousMax, `depth ${depth + 1} edges preserve vertical order`);
    previousMax = Math.max(...targets);
  }
}
for (let depth = 0; depth < 11; depth += 1) {
  const nodes = VASSAL_LIFE_MAP_NODES.filter((node) => node.depth === depth);
  assert.ok(nodes.every((node) => node.mapY > 0 && node.mapY < 1), `depth ${depth + 1} has bounded map positions`);
  assert.ok(nodes.every((node, index) => index === 0 || node.mapY > nodes[index - 1].mapY),
    `depth ${depth + 1} map positions preserve edge order`);
}

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
const travelNode = forceEnter(travelState, "life-02-2");
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
const shopNode = forceEnter(shopState, "life-02-3");
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

for (const nodeId of ["life-03-2", "life-06-2"]) {
  const state = selectedState(nodeId === "life-03-2" ? 103 : 104);
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
const patronagePresentationNode = forceEnter(patronagePresentationState, "life-01-1");
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
  const node = forceEnter(state, "life-02-3");
  dispatch(state, ActionKinds.VASSAL_PURCHASE_SHOP_OFFER, {
    nodeId: node.nodeId, offerId: node.inventory[0].offerId,
  });
}
const elderNodeA = getCurrentLifeMapVassal(elderIndependentA).lifeMap.nodeStates["life-02-3"];
const elderNodeB = getCurrentLifeMapVassal(elderIndependentB).lifeMap.nodeStates["life-02-3"];
assert.deepEqual(elderNodeA.inventory, elderNodeB.inventory);
assert.deepEqual(elderNodeA.purchasedOffers, elderNodeB.purchasedOffers);
for (const state of [elderIndependentA, elderIndependentB]) {
  dispatch(state, ActionKinds.VASSAL_CONFIRM_LIFE_NODE, { nodeId: "life-02-3" });
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
const zeroPurchaseNode = forceEnter(developmentState, "life-02-3");
const seedBeforeMortality = developmentState.rng.vassalSeed;
const developmentSeedBeforeLevel = developmentState.rng.vassalDevelopmentSeed;
dispatch(developmentState, ActionKinds.VASSAL_CONFIRM_LIFE_NODE, { nodeId: zeroPurchaseNode.nodeId });
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
const multiLevelNode = forceEnter(multiLevelState, "life-02-3");
dispatch(multiLevelState, ActionKinds.VASSAL_CONFIRM_LIFE_NODE, { nodeId: multiLevelNode.nodeId });
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
  const node = forceEnter(state, "life-02-3");
  dispatch(state, ActionKinds.VASSAL_CONFIRM_LIFE_NODE, { nodeId: node.nodeId });
  wisdomWasOffered = vassal.developmentChoiceQueue[0]?.offeredStatIds.includes("wisdom") === true;
}
assert.equal(wisdomWasOffered, true, "Wisdom participates in the three-of-four level pool");

const crisisState = selectedState(106);
const crisisVassal = getCurrentLifeMapVassal(crisisState);
crisisState.tSec = 5;
const crisisNode = forceEnter(crisisState, "life-06-4");
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
const naturalDeathNode = forceEnter(naturalDeathState, "life-02-3");
naturalDeathState.rng.vassalSeed = findSeed((roll) => roll < getVassalMortalityChance(80));
dispatch(naturalDeathState, ActionKinds.VASSAL_CONFIRM_LIFE_NODE, { nodeId: naturalDeathNode.nodeId });
assert.equal(getCurrentLifeMapVassal(naturalDeathState), null);
assert.equal(naturalDeathVassal.deathCause, "naturalMortality");
assert.equal(naturalDeathNode.mortality.age, 80);
assert.equal(naturalDeathVassal.developmentChoiceQueue.length, 0,
  "fatal completion never queues unusable level-up decisions");

const legacyState = selectedState(108);
const legacyVassal = getCurrentLifeMapVassal(legacyState);
legacyVassal.prestige = 100;
const legacyNode = forceEnter(legacyState, "life-11-1");
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
const freeLegacyNode = forceEnter(freeLegacyState, "life-11-1");
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
const practiceTierNode = forceEnter(practiceTierState, "life-02-3");
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
  const node = forceEnter(state, "life-02-3");
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
const diamondShopNode = forceEnter(diamondShopState, "life-02-3");
assert.equal(diamondShopNode.inventory.some((offer) => offer.intervention.practiceId === "forage"), false,
  "Diamond practices are excluded from future shop rolls");

console.log("[vassal-life-map] OK");
