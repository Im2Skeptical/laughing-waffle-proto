import assert from "node:assert/strict";
import {
  buildDetailedVassalSelectionPool,
  getDetailedSettlement,
  getDetailedVassalInterventionEffectSec,
  selectDetailedVassalCandidate,
  stepDetailedSettlementsSecond,
} from "../../detailed-settlements.js";
import { serializeGameState } from "../../state.js";
import { deserializeGameState } from "../../state.js";
import {
  getRegionState,
  getWorldConnectionCandidates,
  getWorldDefinition,
} from "../../world-state.js";
import {
  getSettlementSelectedVassalRealizedSegments,
  getSettlementVassalBoundarySeconds,
} from "../../settlement-state.js";
import { getMoonPhaseAtSecond } from "../../moon-phases.js";
import { ActionKinds, applyAction } from "../../actions.js";
import {
  getCurrentLifeMapVassal,
  getVassalCandidatePool,
  getVassalLifeMapNodes,
  getVassalLifeMapOutgoingNodeIds,
  getVassalPrestigeIncome,
} from "../../vassal-life-map.js";
import { fresh } from "./helpers.js";

const lifeMapState = fresh(777);
lifeMapState.paused = true;
lifeMapState.gameConfig.settings.values.primordialBasePressure = 0;
lifeMapState.civilization.chaos.monsterLossThreshold = 1000000;
const lifePool = getVassalCandidatePool(lifeMapState);
assert.equal(lifePool.candidates.length, 3);
assert.ok(lifePool.candidates.every((candidate) =>
  Number.isFinite(candidate.age) && Number.isFinite(candidate.prestige)
    && ["cunning", "wisdom", "effectiveness", "intelligence"].every(
      (statId) => Number.isFinite(candidate.stats?.[statId])
    )
));
assert.equal(applyAction(lifeMapState, {
  kind: ActionKinds.SETTLEMENT_SELECT_VASSAL,
  payload: { candidateIndex: 0, expectedPoolHash: lifePool.expectedPoolHash },
}, { isReplay: true }).ok, true);
let lifeVassal = getCurrentLifeMapVassal(lifeMapState);
const lifeNodes = getVassalLifeMapNodes(lifeVassal);
assert.equal(lifeNodes.filter((node) => node.family === "legacy").length, 1);
assert.ok(lifeVassal.lifeMap.availableNodeIds.length >= 2, "generated map has an opening choice");
for (const node of lifeNodes) {
  assert.ok(getVassalLifeMapOutgoingNodeIds(lifeVassal, node.id).every((id) =>
    lifeNodes.find((entry) => entry.id === id)?.depth === node.depth + 1
  ), `${node.id} has only forward edges`);
}
const patronageNodeId = lifeNodes.find((node) => node.family === "patronage").id;
lifeVassal.lifeMap.availableNodeIds = [patronageNodeId];
assert.equal(applyAction(lifeMapState, {
  kind: ActionKinds.VASSAL_ENTER_LIFE_NODE, payload: { nodeId: patronageNodeId },
}, { isReplay: true }).ok, true);
const patronageNode = lifeVassal.lifeMap.nodeStates[patronageNodeId];
assert.equal(patronageNode.entered, true);
const prestigeBefore = lifeVassal.prestige;
const incomeBefore = getVassalPrestigeIncome(lifeVassal);
assert.equal(applyAction(lifeMapState, {
  kind: ActionKinds.VASSAL_SELECT_LIFE_OPTION,
  payload: { nodeId: patronageNodeId, optionId: "cultivateConnections" },
}, { isReplay: true }).ok, true);
assert.equal(applyAction(lifeMapState, {
  kind: ActionKinds.VASSAL_CONFIRM_LIFE_NODE, payload: { nodeId: patronageNodeId },
}, { isReplay: true }).ok, true);
assert.equal(lifeVassal.prestige, prestigeBefore + 5,
  "option effects apply before the delayed completion income");
assert.equal(lifeVassal.stats.cunning >= 1, true);
const resolveSec = lifeVassal.lifeMap.pendingResolution.resolveSec;
for (let sec = 1; sec <= resolveSec; sec += 1) {
  lifeMapState.tSec = sec;
  stepDetailedSettlementsSecond(lifeMapState, sec);
}
lifeVassal = getCurrentLifeMapVassal(lifeMapState);
assert.equal(lifeVassal.lifeMap.nodeStates[patronageNodeId].resolved, true);
assert.equal(lifeVassal.prestige, prestigeBefore + 5 + incomeBefore + 1,
  "Cultivate Cunning affects the one recurring Prestige grant");
assert.equal(lifeVassal.lifeMap.nodeStates[patronageNodeId].mortality.roll >= 0, true);
assert.ok(lifeVassal.lifeMap.availableNodeIds.length >= 1);

const shopState = fresh(778);
shopState.paused = true;
const shopPool = getVassalCandidatePool(shopState);
applyAction(shopState, { kind: ActionKinds.SETTLEMENT_SELECT_VASSAL,
  payload: { candidateIndex: 0, expectedPoolHash: shopPool.expectedPoolHash } }, { isReplay: true });
let shopVassal = getCurrentLifeMapVassal(shopState);
shopVassal.prestige = 100;
const practiceNodeId = getVassalLifeMapNodes(shopVassal)
  .find((node) => node.family === "practiceReform").id;
shopVassal.lifeMap.availableNodeIds = [practiceNodeId];
applyAction(shopState, { kind: ActionKinds.VASSAL_ENTER_LIFE_NODE,
  payload: { nodeId: practiceNodeId } }, { isReplay: true });
const shopNode = shopVassal.lifeMap.nodeStates[practiceNodeId];
assert.equal(shopNode.inventory.length, 3);
const initialOfferIds = shopNode.inventory.map((offer) => offer.offerId);
applyAction(shopState, { kind: ActionKinds.VASSAL_PURCHASE_SHOP_OFFER,
  payload: { nodeId: practiceNodeId, offerId: initialOfferIds[0] } }, { isReplay: true });
assert.equal(shopNode.inventory.length, 2, "purchase removes without refilling");
assert.equal(shopNode.purchasedOfferIds.length, 1);
assert.equal(shopNode.mortality, undefined, "purchase does not resolve mortality");
applyAction(shopState, { kind: ActionKinds.VASSAL_REROLL_SHOP,
  payload: { nodeId: practiceNodeId } }, { isReplay: true });
assert.equal(shopNode.rerollUsed, false, "reroll is blocked while a purchase is staged");
applyAction(shopState, { kind: ActionKinds.VASSAL_UNDO_SHOP_PURCHASE,
  payload: { nodeId: practiceNodeId, offerId: initialOfferIds[0] } }, { isReplay: true });
applyAction(shopState, { kind: ActionKinds.VASSAL_REROLL_SHOP,
  payload: { nodeId: practiceNodeId } }, { isReplay: true });
assert.equal(shopNode.rerollUsed, true);
assert.equal(shopNode.inventory.length, 3, "reroll refills remaining inventory to three");
assert.equal(applyAction(shopState, { kind: ActionKinds.VASSAL_REROLL_SHOP,
  payload: { nodeId: practiceNodeId } }, { isReplay: true }).reason, "rerollUsed");
assert.deepEqual(
  deserializeGameState(serializeGameState(shopState)).civilization.vassalLineage,
  shopState.civilization.vassalLineage,
  "shop inventory and ledger survive serialization"
);

console.log("[detailed-settlements] life-map OK");
if (false) {
const vassalState = fresh(777);
const pool = buildDetailedVassalSelectionPool(vassalState);
assert.equal(pool.candidates.length, 3);
assert.deepEqual(pool.candidates[0].interventions.map((entry) => entry.requiredPrestige), [23, 33, 43]);
assert.ok(pool.candidates.every((candidate) => candidate.interventions.length === 3),
  "each candidate rolls three valid interventions independently");
assert.ok(pool.candidates.flatMap((candidate) => candidate.interventions).every((entry) =>
  ["practice", "structure", "connection", "expandSettlement", "globalStructure"]
    .includes(entry.kind)
), "candidate interventions use the supported coarse vocabulary");
const sampledInterventions = [];
for (let seed = 790; seed < 830; seed += 1) {
  const sampledState = fresh(seed);
  const sampledPool = buildDetailedVassalSelectionPool(sampledState);
  for (const candidate of sampledPool.candidates) {
    const expansionIds = candidate.interventions
      .filter((entry) => entry.kind === "expandSettlement")
      .map((entry) => entry.regionId);
    assert.equal(new Set(expansionIds).size, expansionIds.length,
      "repeated expansion agenda entries reserve distinct frontiers");
    sampledInterventions.push(...candidate.interventions.map((entry) => ({
      state: sampledState,
      targetRegionId: candidate.targetRegionId,
      entry,
    })));
  }
}
assert.ok(sampledInterventions.some(({ entry }) => entry.kind === "expandSettlement"));
assert.ok(sampledInterventions.some(({ entry }) => entry.kind === "globalStructure"));
for (const { state: sampledState, targetRegionId, entry } of sampledInterventions) {
  assert.notEqual(entry.kind, "removeConnection",
    "normal Vassal candidate generation never removes connections");
  if (entry.kind === "connection") {
    assert.equal(entry.mode, "add");
    for (const regionId of [entry.regionAId, entry.regionBId]) {
      const region = getRegionState(sampledState, regionId);
      assert.equal(region.controller, "player");
      assert.equal(region.detailedSettlementEnabled, true);
    }
  }
  if (entry.kind === "practice" || entry.kind === "structure") {
    assert.equal(entry.targetRegionId, targetRegionId,
      "normal Vassal local interventions remain targeted at the Vassal home");
  }
  if (entry.kind === "expandSettlement") {
    assert.equal(entry.sourceRegionId, targetRegionId,
      "normal Vassal expansion keeps the Vassal home as its source");
    const region = getRegionState(sampledState, entry.regionId);
    assert.equal(region.controller, "frontier");
    assert.equal(region.detailedSettlementEnabled, false);
    assert.ok(sampledState.world.connections.some((connection) =>
      [connection.regionAId, connection.regionBId].includes(targetRegionId)
      && [connection.regionAId, connection.regionBId].includes(entry.regionId)));
  }
  if (entry.kind === "globalStructure") {
    assert.ok(["granary", "mudHouses"].includes(entry.structureId));
  }
}
const constrainedVassalState = fresh(780);
for (const site of constrainedVassalState.world.sites) {
  site.detailedState.structureSlots = site.detailedState.structureSlots.map((_,origin) => ({ structureId: "granary", tier: "bronze", width: 1, origin, placementId: "fixture:"+origin }));
}
constrainedVassalState.world.connections = getWorldConnectionCandidates(
  getWorldDefinition(constrainedVassalState)
);
const constrainedPool = buildDetailedVassalSelectionPool(constrainedVassalState);
assert.equal(constrainedPool.candidates.length, 3,
  "candidate rolls retry another intervention type when structures are unavailable");
assert.ok(constrainedPool.candidates.flatMap((candidate) => candidate.interventions).every(
  (entry) => entry.kind !== "structure"
), "the fallback skips unavailable structure interventions");
assert.equal(selectDetailedVassalCandidate(vassalState, 0, pool.expectedPoolHash).ok, true);
const vassal = vassalState.civilization.vassalLineage.currentVassal;
assert.equal(vassal.selectedSec, 0);
assert.equal(
  vassal.deathYear,
  vassal.selectedYear + vassal.deathAge - vassal.initialAge,
  "death year is known when the vassal is selected"
);
assert.ok(vassal.deathSec >= (vassal.deathYear - 1) * 32 + 1);
assert.equal(getMoonPhaseAtSecond(vassalState, vassal.deathSec).id, "faith",
  "vassal death is scheduled for the first Faith phase after the annual boundary");
assert.equal(
  vassalState.civilization.vassalLineage.selectedVassals[0].deathSec,
  vassal.deathSec,
  "lineage snapshot retains the planned lifespan boundary"
);
const realizedThroughSec = Math.min(vassal.deathSec - 1, 96);
assert.deepEqual(
  getSettlementSelectedVassalRealizedSegments(vassalState, realizedThroughSec),
  [{
    vassalId: vassal.vassalId,
    startSec: 0,
    endSec: realizedThroughSec,
    complete: false,
  }],
  "committed history within the active lifespan is fixed"
);
assert.deepEqual(
  getSettlementVassalBoundarySeconds(vassalState, realizedThroughSec),
  [realizedThroughSec],
  "the active lifespan bracket follows committed history"
);
const bracketState = fresh(779);
const firstBracketVassal = {
  vassalId: "vassal-1",
  selectedSec: 0,
  deathSec: 100,
  isDead: true,
};
const secondBracketVassal = {
  vassalId: "vassal-2",
  selectedSec: 100,
  deathSec: 300,
  isDead: false,
};
bracketState.civilization.vassalLineage.currentVassal = secondBracketVassal;
bracketState.civilization.vassalLineage.selectedVassals = [
  firstBracketVassal,
  secondBracketVassal,
];
assert.deepEqual(
  getSettlementSelectedVassalRealizedSegments(bracketState, 250),
  [
    { vassalId: "vassal-1", startSec: 0, endSec: 100, complete: true },
    { vassalId: "vassal-2", startSec: 100, endSec: 250, complete: false },
  ],
  "successive vassal lifespans preserve committed-history brackets"
);
assert.deepEqual(
  getSettlementVassalBoundarySeconds(bracketState, 250),
  [100, 250],
  "completed and active lifespan boundaries remain distinct"
);
vassal.initialAge = vassal.interventions[0].requiredPrestige - vassal.traitPrestigeModifier;
vassal.deathAge = vassal.initialAge;
vassalState._seasonChanged = true;
vassalState.currentSeasonIndex = 0;
vassalState.year += 1;
stepDetailedSettlementsSecond(vassalState, 34);
const finished = vassalState.civilization.vassalLineage.selectedVassals.at(-1);
assert.equal(finished.interventions[0].status, "applied",
  "passing intervention applies before same-boundary death");
assert.equal(finished.interventions[1].status, "expired");

const interventionState = fresh(778);
const interventionPool = buildDetailedVassalSelectionPool(interventionState);
selectDetailedVassalCandidate(interventionState, 0, interventionPool.expectedPoolHash);
const interventionVassal = interventionState.civilization.vassalLineage.currentVassal;
interventionVassal.targetRegionId = "upper-floodplain";
interventionState.world.connections = interventionState.world.connections.filter((entry) =>
  ![entry.regionAId, entry.regionBId].includes("west-levee")
  || ![entry.regionAId, entry.regionBId].includes("upper-floodplain"));
interventionVassal.initialAge = 50;
interventionVassal.deathAge = 99;
interventionVassal.interventions = [
  { kind: "practice", targetRegionId: "river-crown", practiceId: "exchange", slotIndex: 3, requiredPrestige: 0, status: "pending", appliedYear: null, appliedSec: null },
  { kind: "structure", targetRegionId: "river-crown", structureId: "granary", slotIndex: 3, requiredPrestige: 0, status: "pending", appliedYear: null, appliedSec: null },
  { kind: "connection", mode: "add", regionAId: "upper-floodplain", regionBId: "west-levee", requiredPrestige: 0, status: "pending", appliedYear: null, appliedSec: null },
];
assert.equal(
  getDetailedVassalInterventionEffectSec(
    interventionState,
    interventionVassal,
    interventionVassal.interventions[0]
  ),
  34,
  "a pending intervention forecasts the first eligible Faith boundary"
);
interventionState._seasonChanged = true;
interventionState.currentSeasonIndex = 0;
interventionState.year += 1;
stepDetailedSettlementsSecond(interventionState, 34);
assert.equal(getDetailedSettlement(interventionState, "river-crown").practiceSlots[3].practiceId, "exchange");
assert.equal(getDetailedSettlement(interventionState, "river-crown").structureSlots[3].structureId, "granary");
assert.ok(interventionState.world.connections.some((entry) =>
  [entry.regionAId, entry.regionBId].includes("upper-floodplain")
  && [entry.regionAId, entry.regionBId].includes("west-levee")
), "Vassal connection intervention updates the shared world graph");
assert.ok(interventionVassal.interventions.every((entry) => entry.status === "applied" && Number.isFinite(entry.appliedSec)));
assert.equal(
  getDetailedVassalInterventionEffectSec(
    interventionState,
    interventionVassal,
    interventionVassal.interventions[0]
  ),
  interventionVassal.interventions[0].appliedSec,
  "an applied intervention keeps its authoritative timeline second"
);

const expansionState = fresh(8892);
const expansionPool = buildDetailedVassalSelectionPool(expansionState);
selectDetailedVassalCandidate(expansionState, 0, expansionPool.expectedPoolHash);
const expansionVassal = expansionState.civilization.vassalLineage.currentVassal;
expansionVassal.targetRegionId = "west-levee";
expansionVassal.initialAge = 50;
expansionVassal.deathAge = 99;
expansionVassal.interventions = [
  { kind: "expandSettlement", sourceRegionId: "west-levee", regionId: "iron-hills", requiredPrestige: 0, status: "pending" },
];
expansionState.year += 1;
stepDetailedSettlementsSecond(expansionState, 34);
const expandedRegion = getRegionState(expansionState, "iron-hills");
const expandedSite = getDetailedSettlement(expansionState, "iron-hills");
assert.equal(expandedRegion.controller, "player");
assert.equal(expandedRegion.detailedSettlementEnabled, true);
assert.equal(expandedSite.populationByClass.villager.adults, 10);
assert.equal(expandedSite.populationByClass.villager.faith.tier, "gold");
assert.equal(expandedSite.looseFood, 20);
assert.equal(expandedSite.storedFood, 0);
assert.equal(expandedSite.currency, 0);
assert.equal(expandedSite.populationByClass.villager.happiness.status, "neutral");
assert.equal(expandedSite.populationByClass.stranger.adults, 0);
assert.equal(expandedSite.practiceSlots.length, 5);
assert.equal(expandedSite.practiceSlots[0].practiceId, "forage");
assert.ok(expandedSite.practiceSlots.slice(1).every((slot) => slot == null));
assert.equal(expandedSite.structureSlots[0].structureId, "mudHouses");
assert.ok(expandedSite.structureSlots.slice(1).every((slot) => slot == null));
assert.deepEqual(
  expansionState.world.sites.map((site) => site.regionId),
  ["cedar-woods", "iron-hills", "west-levee", "upper-floodplain", "river-crown", "lake-country"],
  "expanded sites retain authored world order"
);

const globalState = fresh(8894);
const globalPool = buildDetailedVassalSelectionPool(globalState);
selectDetailedVassalCandidate(globalState, 0, globalPool.expectedPoolHash);
const globalVassal = globalState.civilization.vassalLineage.currentVassal;
globalVassal.initialAge = 50;
globalVassal.deathAge = 99;
const fullSite = getDetailedSettlement(globalState, "cedar-woods");
fullSite.structureSlots = fullSite.structureSlots.map((_,origin) => ({ structureId: "granary", tier: "bronze", width: 1, origin, placementId: "fixture:"+origin }));
globalVassal.interventions = [
  { kind: "globalStructure", structureId: "mudHouses", requiredPrestige: 0, status: "pending" },
];
globalState.year += 1;
stepDetailedSettlementsSecond(globalState, 34);
const globalIntervention = globalVassal.interventions[0];
assert.deepEqual(globalIntervention.appliedRegionIds,
  ["west-levee", "upper-floodplain", "river-crown", "lake-country"]);
assert.deepEqual(globalIntervention.skippedRegionIds, ["cedar-woods"]);
for (const regionId of globalIntervention.appliedRegionIds) {
  assert.ok(getDetailedSettlement(globalState, regionId).structureSlots.some(
    (slot) => slot?.structureId === "mudHouses"));
}

const failedExpansionState = fresh(8893);
const failedExpansionPool = buildDetailedVassalSelectionPool(failedExpansionState);
selectDetailedVassalCandidate(failedExpansionState, 0, failedExpansionPool.expectedPoolHash);
const failedExpansionVassal = failedExpansionState.civilization.vassalLineage.currentVassal;
failedExpansionVassal.targetRegionId = "west-levee";
failedExpansionVassal.initialAge = 50;
failedExpansionVassal.deathAge = 99;
failedExpansionVassal.interventions = [
  { kind: "expandSettlement", sourceRegionId: "west-levee", regionId: "iron-hills", requiredPrestige: 0, status: "pending" },
];
failedExpansionState.world.connections = failedExpansionState.world.connections.filter((entry) =>
  !([entry.regionAId, entry.regionBId].includes("iron-hills")
    && [entry.regionAId, entry.regionBId].includes("west-levee")));
failedExpansionState.year += 1;
stepDetailedSettlementsSecond(failedExpansionState, 34);
assert.equal(failedExpansionVassal.interventions[0].status, "failed");
assert.equal(getRegionState(failedExpansionState, "iron-hills").controller, "frontier");
}
