// Per-second resolution, pending/display reads, and Life Map validate.

import {
  VASSAL_LEVEL_UP_STAT_IDS,
  VASSAL_LIFE_TUNING,
  VASSAL_SIGNATURE_NODE_VARIANTS,
  VASSAL_STAT_IDS,
} from "../../../defs/gamepieces/vassal-life-map-defs.js";
import { getDetailedStructureDef } from "../../game-config.js";
import {
  validateVassalLifeMapGraph,
} from "../../vassal-life-map-generator.js";
import {
  clone,
  getCurrentLifeMapVassal,
  getVassalLifeMapNode,
} from "../selectors.js";
import {
  isShopNodeState,
  validatePurchaseInterventions,
} from "../shop.js";
import {
  isValidPortraitDescriptor,
  isValidSignatureDescriptor,
} from "./candidates.js";
import { completeNodeResolution } from "./node-confirm.js";

export function stepVassalLifeMapSecond(state, tSec) {
  const vassal = getCurrentLifeMapVassal(state);
  const pending = vassal?.lifeMap?.pendingResolution;
  if (!vassal || !pending || Math.floor(tSec ?? 0) < Math.floor(pending.resolveSec ?? 0)) {
    return { ok: true, resolved: false };
  }
  const nodeState = vassal.lifeMap.nodeStates[pending.nodeId];
  if (!nodeState) return { ok: false, reason: "missingPendingNode" };
  return { ...completeNodeResolution(state, vassal, nodeState), resolved: true };
}

export function getVassalPendingResolution(state) {
  const pending = getCurrentLifeMapVassal(state)?.lifeMap?.pendingResolution;
  return pending ? clone(pending) : null;
}

export function getVassalNodeDisplayState(state, nodeId) {
  const vassal = getCurrentLifeMapVassal(state);
  const node = getVassalLifeMapNode(vassal, nodeId);
  if (!node) return null;
  const nodeState = vassal?.lifeMap?.nodeStates?.[nodeId] ?? null;
  return {
    node,
    nodeState,
    available: !!vassal?.lifeMap?.availableNodeIds?.includes(nodeId)
      && (vassal.developmentChoiceQueue ?? []).length === 0,
    current: vassal?.lifeMap?.currentNodeId === nodeId,
    completed: !!vassal?.lifeMap?.completedNodeIds?.includes(nodeId),
  };
}

export function validateVassalLifeMapState(state) {
  const errors = [];
  const lineage = state?.civilization?.vassalLineage;
  const legacy = state?.civilization?.vassalLegacy;
  if (!lineage || typeof lineage !== "object" || Array.isArray(lineage)) {
    return { ok: false, errors: ["civilization.vassalLineage: expected an object"] };
  }
  if (!Number.isInteger(lineage.nextVassalId) || lineage.nextVassalId < 1) {
    errors.push("vassalLineage.nextVassalId: expected a positive integer");
  }
  if (!Array.isArray(lineage.selectedVassalIds)) {
    errors.push("vassalLineage.selectedVassalIds: expected an array");
  }
  if (!lineage.vassalsById || typeof lineage.vassalsById !== "object"
      || Array.isArray(lineage.vassalsById)) {
    errors.push("vassalLineage.vassalsById: expected an object");
  }
  if (!Array.isArray(lineage.pendingCandidates)) {
    errors.push("vassalLineage.pendingCandidates: expected an array");
  } else {
    const groups = new Set();
    for (const [index, candidate] of lineage.pendingCandidates.entries()) {
      const variant = VASSAL_SIGNATURE_NODE_VARIANTS[candidate?.signatureNode?.variantId];
      if (!isValidSignatureDescriptor(candidate?.signatureNode)) {
        errors.push(`vassalLineage.pendingCandidates[${index}].signatureNode: invalid`);
      } else if (groups.has(variant.groupId)) {
        errors.push("vassalLineage.pendingCandidates: duplicate signature group");
      } else groups.add(variant.groupId);
      if (!isValidPortraitDescriptor(candidate?.portrait)) {
        errors.push(`vassalLineage.pendingCandidates[${index}].portrait: invalid`);
      }
    }
  }
  if (lineage.currentVassalId != null
      && !lineage.vassalsById?.[lineage.currentVassalId]) {
    errors.push("vassalLineage.currentVassalId: expected an existing Vassal id");
  }
  for (const [vassalId, vassal] of Object.entries(lineage.vassalsById ?? {})) {
    if (vassal?.vassalId !== vassalId) errors.push(`${vassalId}: mismatched vassalId`);
    if (!Number.isFinite(vassal?.prestige) || !Number.isFinite(vassal?.initialAge)
        || !Number.isFinite(vassal?.selectedSec)) {
      errors.push(`${vassalId}: expected finite age origin and Prestige`);
    }
    if (!VASSAL_STAT_IDS.every((statId) => Number.isFinite(vassal?.stats?.[statId]))) {
      errors.push(`${vassalId}.stats: expected all four finite stats`);
    }
    if (!isValidSignatureDescriptor(vassal?.signatureNode)
        || !isValidPortraitDescriptor(vassal?.portrait)) {
      errors.push(`${vassalId}: invalid signature node or portrait`);
    }
    if (!Array.isArray(vassal?.developmentChoiceQueue)
        || !Number.isInteger(vassal?.nextDevelopmentChoiceId)
        || vassal.nextDevelopmentChoiceId < 1) {
      errors.push(`${vassalId}.developmentChoiceQueue: invalid queue state`);
    } else {
      for (const choice of vassal.developmentChoiceQueue) {
        const offered = choice?.offeredStatIds;
        if (typeof choice?.choiceId !== "string" || !Array.isArray(offered)
            || offered.length !== 3 || new Set(offered).size !== 3
            || offered.some((statId) => !VASSAL_LEVEL_UP_STAT_IDS.includes(statId))) {
          errors.push(`${vassalId}.developmentChoiceQueue: invalid choice`);
        }
      }
    }
    const graphValidation = validateVassalLifeMapGraph(vassal?.lifeMap?.graph);
    if (!graphValidation.ok
        || !Array.isArray(vassal?.lifeMap?.completedNodeIds)
        || !Array.isArray(vassal?.lifeMap?.availableNodeIds)
        || !vassal?.lifeMap?.nodeStates || Array.isArray(vassal.lifeMap.nodeStates)) {
      errors.push(`${vassalId}.lifeMap: invalid Life Map state`);
      for (const error of graphValidation.errors ?? []) {
        errors.push(`${vassalId}.lifeMap.graph.${error}`);
      }
    }
    const nodeIds = [
      ...(vassal?.lifeMap?.completedNodeIds ?? []),
      ...(vassal?.lifeMap?.availableNodeIds ?? []),
      ...Object.keys(vassal?.lifeMap?.nodeStates ?? {}),
    ];
    if (nodeIds.some((nodeId) => !getVassalLifeMapNode(vassal, nodeId))) {
      errors.push(`${vassalId}.lifeMap: unknown node id`);
    }
    for (const [nodeId, nodeState] of Object.entries(vassal?.lifeMap?.nodeStates ?? {})) {
      if (!isShopNodeState(nodeState)) continue;
      const purchases = nodeState.purchasedOffers;
      if (!Array.isArray(purchases) || !Array.isArray(nodeState.purchasedOfferIds)
          || JSON.stringify(purchases.map(p => p?.offerId)) !== JSON.stringify(nodeState.purchasedOfferIds)
          || new Set(purchases.map(p => p?.offerId)).size !== purchases.length) {
        errors.push(`${vassalId}.${nodeId}: invalid staged purchases`);
        continue;
      }
      const malformed = purchases.some(p => {
        if (!p?.intervention || !Number.isFinite(p.prestigeCost) || !Number.isFinite(p.phaseCost)) return true;
        if (p.intervention.kind !== 'structure') return false;
        const placement = p.placement, def = getDetailedStructureDef(state, p.intervention.structureId);
        return !placement || !def || placement.structureId !== def.id || placement.width !== def.footprint
          || (placement.mode === 'upgrade' ? typeof placement.targetPlacementId !== 'string'
            : typeof placement.placementId !== 'string' || !Number.isInteger(placement.origin));
      });
      if (malformed) errors.push(`${vassalId}.${nodeId}: invalid staged placement`);
      else if (lineage.currentVassalId === vassalId && vassal.lifeMap.currentNodeId === nodeId
          && !nodeState.resolving && !vassal.lifeMap.completedNodeIds.includes(nodeId)
          && !validatePurchaseInterventions(state, vassal, purchases).ok) {
        errors.push(`${vassalId}.${nodeId}: incompatible staged settlement`);
      }
    }
  }
  if (!legacy || !Number.isFinite(legacy.futureStartingPrestigeBonus)
      || legacy.futureStartingPrestigeBonus < 0
      || legacy.futureStartingPrestigeBonus > VASSAL_LIFE_TUNING.legacyStartingPrestigeBonusCap) {
    errors.push("civilization.vassalLegacy.futureStartingPrestigeBonus: invalid value");
  }
  return { ok: errors.length === 0, errors };
}
