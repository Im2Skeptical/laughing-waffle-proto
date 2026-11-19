import { enterVassalLifeNode, selectLifeMapVassal } from "../../src/model/vassal-life-map.js";
import { getVassalMortalityChance } from "../../src/defs/gamepieces/vassal-life-map-defs.js";
import { attachRngHelpers } from "../../src/model/rng.js";
import { ensureCommissionOffers } from "../../src/model/vassal-life-map/commissions.js";

export const vassalResolutionKinds = ["ordinary", "death", "retirement", "mandate"];

export function prepareVassalExhibit(state, kind) {
  const selected = selectLifeMapVassal(state, 0);
  if (!selected.ok) throw new Error("Vassal exhibit: " + selected.reason);
  const { vassal } = selected;
  const lineage = state.civilization.vassalLineage;
  const graph = vassal.lifeMap.graph;
  const map = vassal.lifeMap;
  const family = kind === "retirement" ? "legacy" : "patronage";
  if (kind === "retirement") {
    vassal.classId = "scholar";
    vassal.founderClassId = null;
    lineage.founderClassId = lineage.establishedClassId = vassal.classId;
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
    kind: "nodeResolution", nodeId: graphNode.id, startSec: 0, resolveSec: 1, phaseCost: 1,
  };
  return state;
}

export function checkVassalExhibit(state, kind) {
  const lineage = state.civilization.vassalLineage;
  const actor = lineage.vassalsById[lineage.selectedVassalIds[0]];
  const node = Object.values(actor.lifeMap.nodeStates)[0];
  let passed = !actor.lifeMap.pendingResolution && !node.resolving;
  if (kind === "death") passed &&= actor.endedReason === "died" && lineage.pendingCandidates.length === 3;
  if (kind === "retirement") passed &&= actor.endedReason === "retired" && lineage.lastInheritanceReport.entries.length === 2;
  if (kind === "ordinary") passed &&= node.resolved && actor.developmentChoiceQueue.length === 1;
  if (kind === "mandate") passed &&= node.resolutionResult === "mandatePrevented";
  if (!passed) throw new Error("Vassal exhibit missed " + kind);
}
