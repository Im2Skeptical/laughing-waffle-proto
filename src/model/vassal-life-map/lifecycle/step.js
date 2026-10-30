// Per-second resolution, pending/display reads, and Life Map validate.

import {
  VASSAL_LEVEL_UP_STAT_IDS,
  VASSAL_LIFE_TUNING,
  VASSAL_SIGNATURE_NODE_VARIANTS,
  VASSAL_STAT_IDS,
} from "../../../defs/gamepieces/vassal-life-map-defs.js";
import { getDetailedPracticeDef, getDetailedStructureDef } from "../../game-config.js";
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
import { stepVassalCommission, validateVassalCommissions } from '../commissions.js';
import { completeNodeResolution } from "./node-confirm.js";
import { hasPendingHeirloomLoadout, validateHeirloomState } from "../heirlooms.js";

export function stepVassalLifeMapSecond(state, tSec) {
  const vassal = getCurrentLifeMapVassal(state);
  stepVassalCommission(state, vassal);
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
      && (vassal.developmentChoiceQueue ?? []).length === 0
      && !vassal.commissionOffers?.length
      && !hasPendingHeirloomLoadout(state),
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
  if (!Number.isInteger(lineage.tenuresRemaining) || lineage.tenuresRemaining < 0 || lineage.tenuresRemaining > 10) {
    errors.push("vassalLineage.tenuresRemaining: expected an integer from 0 to 10");
  }
  if (!Number.isInteger(lineage.nextVassalId) || lineage.nextVassalId < 1) {
    errors.push("vassalLineage.nextVassalId: expected a positive integer");
  }
  for (const key of ['founderClassId', 'establishedClassId']) {
    if (![null, 'scholar', 'warrior'].includes(lineage[key])) errors.push(`vassalLineage.${key}: invalid class`);
  }
  if (lineage.establishedClassId && lineage.establishedClassId !== lineage.founderClassId) {
    errors.push('vassalLineage.establishedClassId: must match the founder');
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
      if (candidate?.signatureNode==null && state.gameConfig.lifeMapGenerator.design.enabled) {
        // Pooled experiments may disable every signature compatible with a class.
      } else if (!isValidSignatureDescriptor(candidate?.signatureNode)) {
        errors.push(`vassalLineage.pendingCandidates[${index}].signatureNode: invalid`);
      } else if (groups.has(variant.groupId) && !state.gameConfig.lifeMapGenerator.design.enabled) {
        errors.push("vassalLineage.pendingCandidates: duplicate signature group");
      } else groups.add(variant.groupId);
      if (!isValidPortraitDescriptor(candidate?.portrait)) {
        errors.push(`vassalLineage.pendingCandidates[${index}].portrait: invalid`);
      }
      if (![null, 'scholar', 'warrior'].includes(candidate?.classId)
          || ![null, 'scholar', 'warrior'].includes(candidate?.founderClassId)
          || (candidate.classId && candidate.classId !== lineage.establishedClassId)
          || (candidate.founderClassId && (lineage.selectedVassalIds?.length || candidate.classId))) {
        errors.push(`vassalLineage.pendingCandidates[${index}]: invalid class or founder`);
      }
    }
  }
  if (lineage.currentVassalId != null
      && !lineage.vassalsById?.[lineage.currentVassalId]) {
    errors.push("vassalLineage.currentVassalId: expected an existing Vassal id");
  }
  for (const [vassalId, vassal] of Object.entries(lineage.vassalsById ?? {})) {
    errors.push(...validateVassalCommissions(vassal).map(error => `${vassalId}: ${error}`));
    if (vassal?.vassalId !== vassalId) errors.push(`${vassalId}: mismatched vassalId`);
    if (!Number.isFinite(vassal?.prestige) || !Number.isFinite(vassal?.initialAge)
        || !Number.isFinite(vassal?.selectedSec)) {
      errors.push(`${vassalId}: expected finite age origin and Prestige`);
    }
    if (!VASSAL_STAT_IDS.every((statId) => Number.isFinite(vassal?.stats?.[statId]))) {
      errors.push(`${vassalId}.stats: expected all four finite stats`);
    }
    if (!(vassal?.signatureNode==null && state.gameConfig.lifeMapGenerator.design.enabled) && !isValidSignatureDescriptor(vassal?.signatureNode)
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
    const pending = vassal?.lifeMap?.pendingResolution;
    if (pending && (!['nodeResolution','shopDelve','campaignEncounter'].includes(pending.kind)
        || !Number.isFinite(pending.startSec) || !Number.isFinite(pending.resolveSec)
        || pending.resolveSec < pending.startSec || !Number.isInteger(pending.phaseCost)
        || pending.phaseCost < 0 || vassal.lifeMap.currentNodeId !== pending.nodeId
        || !vassal.lifeMap.nodeStates?.[pending.nodeId]?.resolving
        || (pending.kind === 'shopDelve' && (vassal.classId !== 'scholar'
          || !isShopNodeState(vassal.lifeMap.nodeStates?.[pending.nodeId])))
        || (pending.kind === 'campaignEncounter' && (vassal.classId !== 'warrior'
          || !vassal.lifeMap.nodeStates?.[pending.nodeId]?.campaign)))) {
      errors.push(`${vassalId}.lifeMap.pendingResolution: invalid timed action`);
    }
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
      if (nodeState.campaign && (nodeState.family!=='campaign' || vassal.classId!=='warrior'
          || !['attack','duel','quest'].includes(nodeState.campaign.mode)
          || typeof nodeState.campaign.failed!=='boolean' || typeof nodeState.campaign.duelDone!=='boolean'
          || !Array.isArray(nodeState.campaign.questRegionIds)
          || nodeState.campaign.questRegionIds.some(id=>!state.world.regions.some(region=>region.id===id)))) {
        errors.push(`${vassalId}.${nodeId}: invalid Campaign visit`);
      }
      const specialty=nodeState.shopSelection;
      if (specialty && (!['practice','structure'].includes(specialty.kind) || !Array.isArray(specialty.choices)
          || specialty.choices.some(choice=>typeof choice.id!=='string'||typeof choice.enabled!=='boolean')
          || (specialty.selectedTag!=null&&!specialty.choices.some(choice=>choice.id===specialty.selectedTag&&choice.enabled)))) {
        errors.push(`${vassalId}.${nodeId}: invalid shop specialty`);
      }
      if (!isShopNodeState(nodeState)) continue;
      const purchases = nodeState.purchasedOffers;
      if(!Number.isInteger(nodeState.nextCommissionId)||nodeState.nextCommissionId<0) errors.push(`${vassalId}.${nodeId}: invalid commission counter`);
      if (!Array.isArray(purchases) || !Array.isArray(nodeState.purchasedOfferIds)
          || JSON.stringify(purchases.map(p => p?.offerId)) !== JSON.stringify(nodeState.purchasedOfferIds)
          || new Set(purchases.map(p => p?.offerId)).size !== purchases.length) {
        errors.push(`${vassalId}.${nodeId}: invalid staged purchases`);
        continue;
      }
      const malformed = purchases.some(p => {
        if (!p?.intervention || !Number.isFinite(p.prestigeCost) || !Number.isFinite(p.phaseCost)
            || (p.monsterPressureCost!=null&&(!Number.isInteger(p.monsterPressureCost)||p.monsterPressureCost<0))
            || !Number.isFinite(p.currencyCost)) return true;
        if (p.replacedPracticeId != null && (p.intervention.kind !== 'practice' || p.intervention.mode !== 'learn'
            || typeof p.replacedPracticeId !== 'string' || p.replacedPracticeId === p.intervention.practiceId
            || !getDetailedPracticeDef(state, p.replacedPracticeId)
            || !Array.isArray(p.practiceDraftBeforeReplacement)
            || !p.practiceDraftBeforeReplacement.includes(p.replacedPracticeId)
            || p.practiceDraftBeforeReplacement.some(id => id != null && (typeof id !== 'string' || !getDetailedPracticeDef(state, id))))) return true;
        if (p.intervention.kind !== 'structure') return false;
        const placement = p.placement, def = getDetailedStructureDef(state, p.intervention.structureId);
        return !placement || !def || placement.structureId !== def.id || placement.width !== def.footprint
          || typeof placement.placementId !== 'string' || !Number.isInteger(placement.origin)
          || !Number.isInteger(placement.construction?.completedCycles) || placement.construction.completedCycles!==0;
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
      || legacy.futureStartingPrestigeBonus < 0 || !legacy.futureStartingStatBonuses
      || VASSAL_STAT_IDS.some(id=>!Number.isInteger(legacy.futureStartingStatBonuses[id])||legacy.futureStartingStatBonuses[id]<0)) {
    errors.push("civilization.vassalLegacy.futureStartingPrestigeBonus: invalid value");
  }
  errors.push(...validateHeirloomState(state).errors);
  return { ok: errors.length === 0, errors };
}
