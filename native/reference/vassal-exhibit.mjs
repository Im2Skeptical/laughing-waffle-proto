import { enterVassalLifeNode, selectLifeMapVassal } from "../../src/model/vassal-life-map.js";
import { getVassalMortalityChance } from "../../src/defs/gamepieces/vassal-life-map-defs.js";
import { attachRngHelpers } from "../../src/model/rng.js";
import { ensureCommissionOffers } from "../../src/model/vassal-life-map/commissions.js";

export const vassalResolutionKinds = ["ordinary", "delve", "campaign", "death", "retirement", "mandate", "founding"];

export function prepareVassalExhibit(state, kind) {
  const selected = selectLifeMapVassal(state, kind === "campaign" ? 1 : 0);
  if (!selected.ok) throw new Error("Vassal exhibit: " + selected.reason);
  const { vassal } = selected;
  const lineage = state.civilization.vassalLineage;
  const graph = vassal.lifeMap.graph;
  const map = vassal.lifeMap;
  const family = {
    ordinary: "patronage", delve: "practiceReform", campaign: "campaign",
    death: "patronage", retirement: "legacy", mandate: "patronage",
    founding: "warlordFounding",
  }[kind];
  if (kind === "delve" || kind === "campaign" || kind === "retirement") {
    vassal.classId = kind === "campaign" ? "warrior" : "scholar";
    vassal.founderClassId = null;
    lineage.founderClassId = lineage.establishedClassId = vassal.classId;
  }
  if (kind === "founding") {
    vassal.founderClassId = lineage.founderClassId = "warrior";
    vassal.archetype = "Warlord";
  }
  const graphNode = kind === "retirement" ? graph.nodes.find(node => node.id === graph.bossNodeId)
    : graph.nodes.find(node => node.family === family) ?? graph.nodes.find(node => node.id === graph.entryNodeIds[0]);
  // A prepared visit uses the normal entry builder with the selected family.
  // Restore the authored graph family immediately for the save validator.
  const formerFamily = graphNode.family;
  const formerSignature = graphNode.signatureNode;
  graphNode.family = family;
  delete graphNode.signatureNode;
  map.availableNodeIds = [graphNode.id];
  const entered = enterVassalLifeNode(state, graphNode.id);
  graphNode.family = formerFamily;
  if (formerSignature) graphNode.signatureNode = formerSignature;
  if (!entered.ok) throw new Error("Vassal exhibit entry: " + entered.reason);
  const { nodeState } = entered;
  if (kind === "delve") {
    nodeState.shopSelection.selectedTag = "random";
    vassal.discoveryAccess = true;
    state.world.sites.find(site => site.regionId === vassal.locationRegionId).detailedState.shopQualityBonus = 1;
  }
  if (kind === "campaign") {
    nodeState.campaign.duelDone = true;
    nodeState.selectedOptionId = nodeState.options.find(option => option.mode === "duel").id;
  }
  if (kind === "founding") nodeState.selectedOptionId = nodeState.options[0].id;
  if (kind === "ordinary") vassal.developmentProgress = 9;
  if (kind === "death" || kind === "mandate") {
    vassal.initialAge = 80;
    const probe = { rng: { ...state.rng } };
    attachRngHelpers(probe);
    while (probe.rngNextVassalFloat() >= getVassalMortalityChance(80)) {
      state.rngNextVassalFloat();
    }
  }
  if (kind === "mandate") {
    vassal.heirlooms.equipped[0] = {
      instanceId: "heirloom-1", definitionId: "mandateOfHeaven", inheritanceState: "sanctified",
      protectionSpent: false,
    };
  }
  if (kind === "retirement") {
    const item = (instanceId, definitionId, inheritanceState) =>
      ({ instanceId, definitionId, inheritanceState, protectionSpent: false });
    vassal.heirlooms.equipped[0] = item("heirloom-1", "signetRing", "fragile");
    vassal.heirlooms.carry[1] = item("heirloom-2", "abacus", "unmarked");
    state.civilization.heirloomVault[3] = item("heirloom-3", "foxMask", "sanctified");
    lineage.nextHeirloomInstanceId = 4;
    state.civilization.candidateDevelopment.scholar = 4;
    ensureCommissionOffers(state, vassal);
  }
  nodeState.resolving = true;
  nodeState.confirmedSec = 0;
  nodeState.accumulatedPhaseCost = 1;
  vassal.lifeMap.pendingResolution = {
    kind: kind === "delve" ? "shopDelve" : kind === "campaign" ? "campaignEncounter" : "nodeResolution",
    nodeId: graphNode.id, startSec: 0, resolveSec: kind === "delve" ? 2 : 1, phaseCost: 1,
  };
  return state;
}

export function checkVassalExhibit(state, kind) {
  const lineage = state.civilization.vassalLineage;
  const actor = lineage.vassalsById[lineage.selectedVassalIds[0]];
  const node = Object.values(actor.lifeMap.nodeStates)[0];
  let passed = !actor.lifeMap.pendingResolution && !node.resolving;
  if (kind === "delve") passed &&= !node.resolved && node.inventoryRoll === 1 && node.inventory.length > 0;
  if (kind === "campaign") passed &&= !node.resolved && node.options.some(option => option.mode === "attack");
  if (kind === "death") passed &&= actor.endedReason === "died" && lineage.pendingCandidates.length === 3;
  if (kind === "retirement") passed &&= actor.endedReason === "retired" && lineage.lastInheritanceReport.entries.length === 2;
  if (kind === "ordinary") passed &&= node.resolved && actor.developmentChoiceQueue.length === 1;
  if (kind === "mandate") passed &&= node.resolutionResult === "mandatePrevented";
  if (kind === "founding") passed &&= actor.classId === "warrior" && actor.lifeEvents.some(event => event.kind === "classFounded");
  if (!passed) throw new Error("Vassal exhibit missed " + kind);
}
