import { getGamepieceFace } from "../gamepiece-presentation.js";
import { VASSAL_LIFE_TUNING, getVassalMortalityChance } from "../../defs/gamepieces/vassal-life-map-defs.js";
import { getDetailedPracticeDef, getDetailedStructureDef } from "../game-config.js";
import { getMoonPhaseDurationSec } from "../moon-phases.js";
import {
  getRegionPolygon,
  getRegionReference,
  getRegionState,
  getWorldConnectionCandidates,
  getWorldConnectionKey,
  getWorldDefinition,
} from "../world-state.js";
import {
  clone,
  formatVassalPhaseDuration,
  getAdjustedVassalPhaseCost,
  getAdjustedVassalPrestigeCost,
  getCurrentLifeMapVassal,
  getDetailedSite,
  getVassalAge,
  getVassalDevelopmentIncome,
  getVassalLifeMapNode,
  getVassalPrestigeIncome,
  getVassalStatsPresentation,
} from "./selectors.js";
import {
  isShopNodeState,
  prepareStructurePlacement,
  validatePurchaseInterventions,
} from "./shop.js";
import { getSettlementRequirements } from "./lifecycle.js";

function capitalize(value) {
  const text = String(value ?? "");
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : "";
}

export function getVassalGamepiecePresentation(state, kind, definitionId, tier = "bronze") {
  const def = kind === "practice"
    ? getDetailedPracticeDef(state, definitionId)
    : getDetailedStructureDef(state, definitionId);
  if (!def) return null;
  const face = getGamepieceFace(state, kind, definitionId, tier);
  return {
    ...face,
    kind,
    definitionId,
    label: def.label ?? definitionId,
    tier,
    qualityLabel: capitalize(tier),
    tags: [...(def.tags ?? [])],
    rule: def.ui?.rule ?? "",
    details: face.detailLines,
  };
}

function buildShortestRegionPath(state, startId, targetId) {
  if (startId === targetId) return [startId];
  const definition = getWorldDefinition(state);
  const order = new Map((definition?.regions ?? []).map((region, index) => [region.id, index]));
  const adjacency = new Map((definition?.regions ?? []).map((region) => [region.id, []]));
  for (const edge of state?.world?.connections ?? []) {
    adjacency.get(edge.regionAId)?.push(edge.regionBId);
    adjacency.get(edge.regionBId)?.push(edge.regionAId);
  }
  for (const neighbours of adjacency.values()) {
    neighbours.sort((left, right) => (order.get(left) ?? 0) - (order.get(right) ?? 0));
  }
  const queue = [startId];
  const previous = new Map([[startId, null]]);
  while (queue.length) {
    const current = queue.shift();
    for (const next of adjacency.get(current) ?? []) {
      if (previous.has(next)) continue;
      previous.set(next, current);
      if (next === targetId) {
        const path = [targetId];
        let cursor = current;
        while (cursor != null) {
          path.unshift(cursor);
          cursor = previous.get(cursor) ?? null;
        }
        return path;
      }
      queue.push(next);
    }
  }
  return [];
}

function buildRegionalMapPresentation(state, vassal, nodeState, {
  previewOptionId = null,
  previewOfferId = null,
} = {}) {
  if (!vassal || !nodeState || !["travel", "routes", "settlement", "crisis", "legacy"].includes(nodeState.family)
      && nodeState.signatureNode?.removalKind !== "connection"
      && nodeState.signatureNode?.variantId !== "settlement") return null;
  const definition = getWorldDefinition(state);
  const currentRegionId = vassal.locationRegionId;
  const selectedOption = nodeState.options?.find((option) =>
    option.id === (previewOptionId ?? nodeState.selectedOptionId)) ?? null;
  const previewOffer = [
    ...(nodeState.inventory ?? []),
    ...(nodeState.purchasedOffers ?? []),
  ].find((offer) => offer.offerId === previewOfferId) ?? null;
  const geographicAdjacentIds = getWorldConnectionCandidates(definition).flatMap((edge) => {
    if (edge.regionAId === currentRegionId) return [edge.regionBId];
    if (edge.regionBId === currentRegionId) return [edge.regionAId];
    return [];
  });
  const offeredRegionIds = nodeState.family === "travel"
    ? (nodeState.options ?? []).map((option) => option.locationRegionId)
    : [
      ...(nodeState.options ?? []).flatMap((option) => [
        option.settlementRegionId, option.intervention?.regionAId, option.intervention?.regionBId,
      ]),
      ...[...(nodeState.inventory ?? []), ...(nodeState.purchasedOffers ?? [])]
        .flatMap((offer) => [offer.intervention?.regionAId, offer.intervention?.regionBId]),
    ].filter(Boolean);
  const selectedPath = nodeState.family === "travel" && selectedOption?.locationRegionId
    ? buildShortestRegionPath(state, currentRegionId, selectedOption.locationRegionId)
    : [];
  const includedIds = new Set([
    currentRegionId,
    ...geographicAdjacentIds,
    ...offeredRegionIds,
    ...selectedPath,
  ]);
  const regionOrder = new Map((definition?.regions ?? []).map((region, index) => [region.id, index]));
  const regions = (definition?.regions ?? []).filter((region) => includedIds.has(region.id)).map((region) => {
    const runtime = getRegionState(state, region.id);
    return {
      regionId: region.id,
      reference: getRegionReference(state, region.id),
      name: region.name,
      colour: runtime?.colour ?? "black",
      controller: runtime?.controller ?? "frontier",
      polygon: getRegionPolygon(definition, region).map(({ x, y }) => ({ x, y })),
      labelPoint: clone(region.display?.labelPoint ?? { x: 0, y: 0 }),
      current: region.id === currentRegionId,
      offered: offeredRegionIds.includes(region.id),
      selected: region.id === selectedOption?.locationRegionId,
      onSelectedPath: selectedPath.includes(region.id),
    };
  });
  const actualKeys = new Set((state?.world?.connections ?? []).map((edge) =>
    getWorldConnectionKey(edge.regionAId, edge.regionBId)));
  const stagedByKey = new Map((nodeState.purchasedOffers ?? [])
    .filter((purchase) => purchase.intervention?.kind === "connection")
    .map((purchase) => [
      getWorldConnectionKey(purchase.intervention.regionAId, purchase.intervention.regionBId),
      purchase.intervention.mode,
    ]));
  const previewIntervention = previewOffer?.intervention?.kind === "connection"
    ? previewOffer.intervention : null;
  const previewKey = previewIntervention
    ? getWorldConnectionKey(previewIntervention.regionAId, previewIntervention.regionBId) : null;
  const candidateEdges = new Map();
  for (const edge of state?.world?.connections ?? []) {
    candidateEdges.set(getWorldConnectionKey(edge.regionAId, edge.regionBId), edge);
  }
  for (const purchase of nodeState.purchasedOffers ?? []) {
    const intervention = purchase.intervention;
    if (intervention?.kind === "connection") {
      candidateEdges.set(getWorldConnectionKey(intervention.regionAId, intervention.regionBId), intervention);
    }
  }
  if (previewIntervention) candidateEdges.set(previewKey, previewIntervention);
  const connections = [...candidateEdges.entries()].filter(([, edge]) =>
    includedIds.has(edge.regionAId) && includedIds.has(edge.regionBId)).map(([key, edge]) => ({
      regionAId: edge.regionAId,
      regionBId: edge.regionBId,
      status: previewKey === key
        ? `preview-${previewIntervention.mode}`
        : stagedByKey.has(key)
          ? `staged-${stagedByKey.get(key)}`
          : actualKeys.has(key) ? "existing" : "absent",
      onSelectedPath: selectedPath.slice(1).some((regionId, index) =>
        getWorldConnectionKey(selectedPath[index], regionId) === key),
    }));
  return {
    kind: nodeState.family,
    currentRegionId,
    selectedDestinationId: selectedOption?.locationRegionId ?? null,
    selectedPath,
    distance: selectedPath.length > 0 ? selectedPath.length - 1 : null,
    regions: regions.sort((left, right) =>
      (regionOrder.get(left.regionId) ?? 0) - (regionOrder.get(right.regionId) ?? 0)),
    connections,
  };
}

function buildVassalOptionProjection(vassal, nodeState, optionId = null) {
  if (!vassal || !nodeState || !["patronage", "development"].includes(nodeState.family)) {
    return null;
  }
  const option = nodeState.options?.find((entry) =>
    entry.id === (optionId ?? nodeState.selectedOptionId)) ?? null;
  const immediate = clone(vassal);
  if (option) {
    const cost = getAdjustedVassalPrestigeCost(vassal, option.prestigeCost ?? 0);
    immediate.prestige = Math.max(0, immediate.prestige - cost + Math.floor(option.prestigeDelta ?? 0));
    if (option.statId && Number.isFinite(option.statDelta)) {
      immediate.stats[option.statId] = Math.max(
        0, Math.floor(immediate.stats[option.statId] ?? 0) + Math.floor(option.statDelta)
      );
    }
  }
  if (option?.lossStatId && Number.isFinite(option.lossStatDelta)) {
    immediate.stats[option.lossStatId] = Math.max(
      0, Math.floor(immediate.stats[option.lossStatId] ?? 0) + Math.floor(option.lossStatDelta)
    );
  }
  const completionPrestigeIncome = getVassalPrestigeIncome(immediate);
  const completionExpIncome = getVassalDevelopmentIncome(immediate);
  const completionExpTotal = Math.max(0, immediate.developmentProgress ?? 0) + completionExpIncome;
  return {
    optionId: option?.id ?? null,
    baseline: {
      prestige: vassal.prestige,
      developmentProgress: vassal.developmentProgress,
      stats: getVassalStatsPresentation(vassal),
    },
    immediate: {
      prestige: immediate.prestige,
      developmentProgress: immediate.developmentProgress,
      stats: getVassalStatsPresentation(immediate),
    },
    ifSurvives: {
      prestige: immediate.prestige + completionPrestigeIncome,
      developmentProgress: completionExpTotal % VASSAL_LIFE_TUNING.developmentThreshold,
      earnedLevelCount: Math.floor(completionExpTotal / VASSAL_LIFE_TUNING.developmentThreshold),
      prestigeIncome: completionPrestigeIncome,
      developmentIncome: completionExpIncome,
    },
  };
}

export function getVassalNodeDecisionPresentation(state, nodeId = null, preview = {}) {
  const vassal = getCurrentLifeMapVassal(state);
  const activeNodeId = nodeId ?? vassal?.lifeMap?.currentNodeId ?? null;
  const node = getVassalLifeMapNode(vassal, activeNodeId);
  const nodeState = vassal?.lifeMap?.nodeStates?.[activeNodeId] ?? null;
  if (!vassal || !node) return null;
  const stagedPrestigeCost = (nodeState?.purchasedOffers ?? [])
    .reduce((sum, purchase) => sum + Math.max(0, purchase.prestigeCost ?? 0), 0);
  const selectedOption = nodeState?.options?.find(
    (option) => option.id === (preview.previewOptionId ?? nodeState.selectedOptionId)
  ) ?? null;
  const optionPrestigeCost = selectedOption
    ? getAdjustedVassalPrestigeCost(vassal, selectedOption.prestigeCost ?? 0) : 0;
  const selectedOptionPhaseCost = selectedOption
    ? getAdjustedVassalPhaseCost(vassal, selectedOption.phaseCost ?? 0) : 0;
  const accumulatedPhaseCost = Math.max(0, Math.floor(nodeState?.accumulatedPhaseCost ?? 0));
  const emptyShopConfirmPhaseCost = isShopNodeState(nodeState)
    && (nodeState?.purchasedOffers ?? []).length === 0
    ? VASSAL_LIFE_TUNING.emptyShopConfirmPhaseCost : 0;
  const totalPhaseCost = accumulatedPhaseCost + emptyShopConfirmPhaseCost + (isShopNodeState(nodeState)
    ? 0 : selectedOptionPhaseCost);
  const currentAge = getVassalAge(state, vassal);
  const projectedAge = getVassalAge(
    state, vassal, Math.floor(state.tSec ?? 0) + totalPhaseCost * getMoonPhaseDurationSec(state)
  );
  const immediateDeathChance = Math.max(0, Math.min(1,
    Number(selectedOption?.immediateDeathChance) || 0
  ));
  const naturalDeathChance = getVassalMortalityChance(projectedAge);
  const previewRegionId = selectedOption?.locationRegionId ?? vassal.locationRegionId;
  const previewSite = getDetailedSite(state, previewRegionId);
  const beforePractices = (previewSite?.detailedState?.practiceSlots ?? []).map((slot) => slot ? clone(slot) : null);
  const beforeStructures = (previewSite?.detailedState?.structureSlots ?? []).map((slot) => slot ? clone(slot) : null);
  const projected = previewRegionId === vassal.locationRegionId
    ? validatePurchaseInterventions(state, vassal, nodeState?.purchasedOffers ?? []) : null;
  const afterPractices = projected?.reservation?.practiceSlots ?? beforePractices;
  const afterStructures = projected?.reservation?.structureSlots ?? beforeStructures;
  const decorate = (kind, slots) => slots.map(slot => {
    if (!slot) return null;
    const idKey = kind === 'practice' ? 'practiceId' : 'structureId';
    const purchase = (nodeState?.purchasedOffers ?? []).find(p => p.intervention.kind === kind
      && (kind === 'practice' ? p.intervention.practiceId === slot.practiceId
        : (p.placement?.targetPlacementId ?? p.placement?.placementId) === slot.placementId));
    return { ...slot, staged: !!purchase, offerId: purchase?.offerId ?? null,
      upgraded: purchase?.intervention?.mode === 'upgrade',
      previousPresentation: purchase?.intervention?.mode === 'upgrade'
        ? getVassalGamepiecePresentation(state, kind, slot[idKey], kind === 'practice' ? purchase.intervention.tier : purchase.intervention.previousTier) : null,
      presentation: getVassalGamepiecePresentation(state, kind, slot[idKey], slot.tier ?? 'bronze'),
    };
  });
  const decorateOffer = (offer, purchased = false) => {
    const intervention = offer.intervention;
    const kind = intervention?.kind;
    const definitionId = kind === "practice" ? intervention.practiceId
      : kind === "structure" ? intervention.structureId : null;
    const prestigeCost = purchased ? offer.prestigeCost : getAdjustedVassalPrestigeCost(vassal, offer.basePrestigeCost ?? 0);
    const remaining = (nodeState?.purchasedOffers ?? []).filter(p => p.offerId !== offer.offerId);
    const checkPlacement = origin => {
      const prepared = kind === 'structure' ? prepareStructurePlacement(state, vassal, nodeState, offer, origin, remaining) : { ok: true };
      if (!prepared.ok) return prepared;
      return validatePurchaseInterventions(state, vassal, [{ ...offer, ...(prepared.placement ? { placement: prepared.placement } : {}) }, ...remaining]);
    };
    const legality = checkPlacement(null);
    const affordable = purchased || prestigeCost <= vassal.prestige - stagedPrestigeCost;
    return {
      ...clone(offer),
      purchased,
      canStage: affordable && legality.ok,
      stageBlockedReason: !affordable ? 'Insufficient Prestige' : legality.ok ? null : 'No compatible space in the staged settlement',
      validOrigins: kind === 'structure' ? Array.from({ length: beforeStructures.length }, (_, i) => i).filter(origin => checkPlacement(origin).ok) : [],
      presentation: definitionId
        ? getVassalGamepiecePresentation(state, kind, definitionId, intervention.resultingTier ?? intervention.tier ?? "bronze")
        : null,
      prestigeCost,
      phaseCost: purchased ? offer.phaseCost
        : getAdjustedVassalPhaseCost(vassal, offer.basePhaseCost ?? 0),
    };
  };
  const displacedPractices = beforePractices.filter((slot) => slot
    && !afterPractices.some((after) => after?.practiceId === slot.practiceId));
  return {
    node, nodeState,
    optionRequirements: Object.fromEntries((nodeState?.options ?? []).map((option) =>
      [option.id, getSettlementRequirements(state, vassal, option)])),
    currentPrestige: vassal.prestige,
    projectedPrestige: Math.max(0, vassal.prestige - stagedPrestigeCost - optionPrestigeCost),
    stagedPrestigeCost,
    mortalityEstimate: {
      totalPhaseCost,
      timeLabel: formatVassalPhaseDuration(totalPhaseCost, state),
      currentAge,
      projectedAge,
      immediateDeathChance,
      naturalDeathChance,
      totalDeathChance: immediateDeathChance + (1 - immediateDeathChance) * naturalDeathChance,
    },
    previewRegionId,
    previewRegionLabel: getRegionReference(state, previewRegionId) ?? previewSite?.name ?? previewRegionId,
    settlement: previewSite ? {
      storedFood: previewSite.detailedState.storedFood,
      looseFood: previewSite.detailedState.looseFood,
      currency: previewSite.detailedState.currency ?? 0,
      practices: decorate("practice", afterPractices, beforePractices),
      displacedPractices: displacedPractices.map((slot) =>
        getVassalGamepiecePresentation(state, "practice", slot.practiceId, slot.tier ?? "bronze")),
      structures: decorate("structure", afterStructures, beforeStructures),
      structureCapacity: afterStructures.length,
      demolishedStructures: (projected?.structures?.demolished ?? []).map(slot => ({ ...slot,
        presentation: getVassalGamepiecePresentation(state, 'structure', slot.structureId, slot.tier) })),
      upgradedStructures: projected?.structures?.upgrades ?? [],
    } : null,
    offers: (nodeState?.inventory ?? []).map((offer) => decorateOffer(offer)),
    purchases: (nodeState?.purchasedOffers ?? []).map((offer) => decorateOffer(offer, true)),
    contextKind: nodeState?.signatureNode?.groupId === "tagShop"
      || ["practice", "structure"].includes(nodeState?.signatureNode?.removalKind)
      ? "settlement"
      : nodeState?.signatureNode?.removalKind === "connection"
        || nodeState?.signatureNode?.variantId === "settlement"
        ? "regionalMap"
        : ["practiceReform", "publicWorks"].includes(nodeState?.family)
      ? "settlement"
      : ["travel", "routes"].includes(nodeState?.family)
        ? "regionalMap"
        : ["patronage", "development"].includes(nodeState?.family)
          ? "vassal" : "none",
    regionalMap: buildRegionalMapPresentation(state, vassal, nodeState, preview),
    vassalProjection: buildVassalOptionProjection(
      vassal, nodeState, preview.previewOptionId ?? null
    ),
  };
}
