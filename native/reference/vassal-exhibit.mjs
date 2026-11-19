import { enterVassalLifeNode, selectLifeMapVassal } from "../../src/model/vassal-life-map.js";
import { getVassalMortalityChance } from "../../src/defs/gamepieces/vassal-life-map-defs.js";
import { attachRngHelpers } from "../../src/model/rng.js";
import { ensureCommissionOffers } from "../../src/model/vassal-life-map/commissions.js";
import { VASSAL_COMMISSION_DEFS } from "../../src/defs/vassal-class-rules.js";

export const vassalResolutionKinds = ["ordinary", "delve", "campaign", "death", "retirement", "mandate", "founding",
  "scholar-founding", "commission-stat", "commission-prestige", "commission-progress"];

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
    founding: "warlordFounding", "scholar-founding": "philosopherFounding",
    "commission-stat": "patronage", "commission-prestige": "patronage", "commission-progress": "patronage",
  }[kind];
  if (kind === "delve" || kind === "campaign" || kind === "retirement" || kind.startsWith("commission-")) {
    vassal.classId = kind === "campaign" ? "warrior" : "scholar";
    vassal.founderClassId = null;
    lineage.founderClassId = lineage.establishedClassId = vassal.classId;
  }
  if (kind === "founding" || kind === "scholar-founding") {
    vassal.founderClassId = lineage.founderClassId = kind === "founding" ? "warrior" : "scholar";
    vassal.archetype = kind === "founding" ? "Warlord" : "Philosopher";
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
  if (kind === "founding" || kind === "scholar-founding") nodeState.selectedOptionId = nodeState.options[0].id;
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
  if (kind.startsWith("commission-")) {
    const stat = kind === "commission-stat";
    const def = VASSAL_COMMISSION_DEFS.find(entry => entry.id === (stat ? "stat" : "prestige"));
    vassal.commissionOffers = [];
    vassal.commission = {
      ...def, acceptedSec: 0, progress: kind === "commission-prestige" ? 29 : 0,
      offerId: `${vassal.vassalId}:commission:1:${def.id}`,
    };
    if (stat) {
      Object.assign(vassal.commission, {
        statId: "cunning", statLabel: "Ingenuity", label: "Increase Ingenuity",
        description: "Permanently increase Ingenuity after accepting this Commission.",
        startingStat: vassal.stats.cunning,
      });
      ++vassal.stats.cunning;
    }
  }
  nodeState.resolving = true;
  nodeState.confirmedSec = 0;
  nodeState.accumulatedPhaseCost = 1;
  vassal.lifeMap.pendingResolution = {
    kind: kind === "delve" ? "shopDelve" : kind === "campaign" ? "campaignEncounter" : "nodeResolution",
    nodeId: graphNode.id, startSec: 0, resolveSec: kind === "delve" || kind === "commission-stat" ? 2 : 1, phaseCost: 1,
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
  if (kind === "scholar-founding") {
    const settlement = state.world.sites.find(site => site.regionId === actor.locationRegionId).detailedState;
    passed &&= actor.classId === "scholar" && actor.commissionOffers?.length === 3
      && settlement.structureSlots.some(slot => slot?.structureId === "lyceum");
  }
  if (kind === "commission-stat" || kind === "commission-prestige") {
    if (kind === "commission-stat" && state.tSec === 1) passed = !!actor.lifeMap.pendingResolution && node.resolving;
    passed &&= actor.commission === null && actor.completedCommissions === 1 && actor.commissionOffers?.length === 3
      && actor.lifeEvents.some(event => event.kind === "commissionCompleted");
  }
  if (kind === "commission-progress") passed &&= actor.commission?.progress > 0 && actor.commission.progress < 30;
  if (!passed) throw new Error("Vassal exhibit missed " + kind);
}
