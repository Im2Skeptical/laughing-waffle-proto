import { findStructurePlacement, projectStructureDraft } from "../structure-layout.js";
import { projectPracticeDraft } from "../practice-draft.js";
import { VASSAL_LIFE_TUNING } from "../../defs/gamepieces/vassal-life-map-defs.js";
import {
  VASSAL_INTERVENTION_PRACTICE_IDS,
  settlementStructureDefs,
} from "../../defs/gamepieces/detailed-settlement-defs.js";
import { getDetailedPracticeDef, getDetailedStructureDef, getGameSetting } from "../game-config.js";
import {
  getDetailedPracticeTierIndex,
  getNextDetailedPracticeTier,
} from "../detailed-practice-tiers.js";
import {
  getRegionReference,
  getWorldConnectionCandidates,
  getWorldConnectionKey,
  getWorldDefinition,
} from "../world-state.js";
import {
  clone,
  getAdjustedVassalPhaseCost,
  getAdjustedVassalPrestigeCost,
  getCurrentLifeMapVassal,
  getDetailedSite,
  shuffle,
} from "./selectors.js";

export const SHOP_FAMILIES = new Set(["practiceReform", "publicWorks", "routes"]);
const QUALITY_IDS = Object.freeze(["bronze", "silver", "gold", "diamond"]);

function qualityLabel(tier) { return `${tier[0].toUpperCase()}${tier.slice(1)}`; }
function getUnlockedQualityIndex(state) {
  const research = Math.max(0, Number(state?.civilization?.research?.total) || 0);
  if (research >= getGameSetting(state, "researchDiamondThreshold")) return 3;
  if (research >= getGameSetting(state, "researchGoldThreshold")) return 2;
  if (research >= getGameSetting(state, "researchSilverThreshold")) return 1;
  return 0;
}
function getUniversityFloor(state, regionId) {
  const tiers = (getDetailedSite(state, regionId)?.detailedState?.structureSlots ?? [])
    .filter((slot) => slot?.structureId === "university")
    .map((slot) => getDetailedPracticeTierIndex(slot.tier ?? "bronze"));
  const highest = tiers.length ? Math.max(...tiers) : -1;
  return highest >= 0 ? 2 : 0;
}
function rollOfferQuality(state, regionId, floor = 0) {
  const max = getUnlockedQualityIndex(state);
  const min = Math.min(max, Math.max(0, floor, getUniversityFloor(state, regionId)));
  return QUALITY_IDS[state.rngNextVassalInt(min, max)];
}
function isDefinitionUnlocked(state, def) {
  return getDetailedPracticeTierIndex(def?.minimumQuality ?? "bronze") <= getUnlockedQualityIndex(state);
}

export function validatePurchaseInterventions(state, vassal, purchases = []) {
  const settlement = getDetailedSite(state, vassal.locationRegionId)?.detailedState;
  const practices = projectPracticeDraft(settlement?.practiceSlots ?? [], purchases);
  if (!practices.ok) return practices;
  const structures = projectStructureDraft(settlement?.structureSlots ?? [], purchases.filter(p => p.intervention?.kind === 'structure').map(p => p.placement));
  if (!structures.ok) return structures;
  const connectionKeys = new Set((state?.world?.connections ?? []).map(edge => getWorldConnectionKey(edge.regionAId, edge.regionBId)));
  for (const purchase of purchases) {
    const action = purchase.intervention;
    if (action?.kind !== 'connection') continue;
    const key = getWorldConnectionKey(action.regionAId, action.regionBId);
    if ((action.mode === 'add') === connectionKeys.has(key)) return { ok: false, reason: 'connectionUnavailable' };
    if (action.mode === 'add') connectionKeys.add(key); else connectionKeys.delete(key);
  }
  return { ok: true, reservation: { practiceSlots: practices.slots, structureSlots: structures.slots, connectionKeys }, structures, practices };
}

function buildReservation(state, vassal, nodeState) {
  return validatePurchaseInterventions(state, vassal, nodeState?.purchasedOffers ?? []).reservation;
}

export function prepareStructurePlacement(state, vassal, nodeState, offer, origin = null, purchases = nodeState.purchasedOffers) {
  const def = getDetailedStructureDef(state, offer.intervention.structureId);
  const width = def?.footprint ?? 1;
  const action = offer.intervention;
  if (action.mode === 'upgrade') {
    const target = getDetailedSite(state, vassal.locationRegionId)?.detailedState?.structureSlots.find(p => p?.placementId === action.targetPlacementId);
    if (!target || (origin != null && origin !== target.origin)) return { ok: false, reason: 'incompatibleUpgrade' };
    return { ok: true, placement: {
    mode: 'upgrade', targetPlacementId: action.targetPlacementId, structureId: action.structureId,
    previousTier: action.previousTier, tier: action.tier, width,
    } };
  }
  if (action.mode === 'remove') return { ok: false, reason: 'standaloneDemolitionUnavailable' };
  const validation = validatePurchaseInterventions(state, vassal, purchases);
  if (!validation.ok) return validation;
  const location = origin == null ? findStructurePlacement(validation.reservation.structureSlots, width, {
    allowDemolition: true, stagedIds: validation.structures.stagedIds,
  }) : { ok: true, origin };
  if (!location.ok) return location;
  return { ok: true, placement: { placementId: vassal.vassalId + ':' + offer.offerId,
    origin: location.origin, width, structureId: action.structureId, tier: action.tier ?? 'bronze' } };
}

function buildPracticeOffers(state, vassal, nodeState, roll) {
  const reservation = buildReservation(state, vassal, nodeState);
  const offers = [];
  for (const practiceId of shuffle(state, VASSAL_INTERVENTION_PRACTICE_IDS)) {
    if (offers.length >= 3) break;
    const def = getDetailedPracticeDef(state, practiceId);
    if (!def || !isDefinitionUnlocked(state, def)) continue;
    const installed = reservation.practiceSlots.find((slot) => slot?.practiceId === practiceId);
    if (installed?.tier === "diamond") continue;
    const tier = installed?.tier ?? "bronze";
    const offeredTier = rollOfferQuality(state, vassal.locationRegionId);
    const resultingTier = installed ? getNextDetailedPracticeTier(tier) : offeredTier;
    if (!resultingTier) continue;
    const intervention = {
      kind: "practice", targetRegionId: vassal.locationRegionId, practiceId,
      mode: installed ? "upgrade" : "learn", tier, resultingTier,
    };
    offers.push({
      offerId: `${nodeState.nodeId}:r${roll}:practice:${offers.length}`,
      label: installed
        ? `Upgrade ${def.label} ${tier[0].toUpperCase()}${tier.slice(1)} → ${resultingTier[0].toUpperCase()}${resultingTier.slice(1)}`
        : `Learn ${qualityLabel(resultingTier)} ${def.label}`,
      basePrestigeCost: Math.max(0, def.vassalPrestigeCost ?? 0),
      basePhaseCost: Math.max(0, def.vassalPhaseCost ?? 0),
      intervention,
    });
  }
  return offers;
}

function makeStructureOffer(state, vassal, nodeState, roll, structureId, index, category = 'structure') {
  const def = getDetailedStructureDef(state, structureId);
  const installed = getDetailedSite(state, vassal.locationRegionId)?.detailedState.structureSlots.find(p =>
    p?.structureId === structureId && p.width === (def.footprint ?? 1) && p.tier !== 'diamond');
  const offeredTier = rollOfferQuality(state, vassal.locationRegionId);
  const tier = installed ? getNextDetailedPracticeTier(installed.tier) : offeredTier;
  return {
    offerId: nodeState.nodeId + ':r' + roll + ':' + category + ':' + index,
    label: (installed ? 'Upgrade ' : 'Build ') + qualityLabel(tier) + ' ' + def.label,
    basePrestigeCost: Math.max(0, def.vassalPrestigeCost ?? 0),
    basePhaseCost: Math.max(0, def.vassalPhaseCost ?? 0),
    intervention: { kind: 'structure', mode: installed ? 'upgrade' : 'add',
      targetRegionId: vassal.locationRegionId, structureId, tier,
      ...(installed ? { targetPlacementId: installed.placementId, previousTier: installed.tier } : {}),
    },
  };
}

function buildStructureOffers(state, vassal, nodeState, roll) {
  return shuffle(state, Object.keys(settlementStructureDefs))
    .filter(id => isDefinitionUnlocked(state, getDetailedStructureDef(state, id)))
    .slice(0, 3).map((id, index) => makeStructureOffer(state, vassal, nodeState, roll, id, index));
}

function buildTaggedOffers(state, vassal, nodeState, roll, requiredTag) {
  const reservation = buildReservation(state, vassal, nodeState);
  const candidates = [
    ...VASSAL_INTERVENTION_PRACTICE_IDS.flatMap((practiceId) => {
      const def = getDetailedPracticeDef(state, practiceId);
      return def && isDefinitionUnlocked(state, def) && (def.tags ?? []).includes(requiredTag)
        ? [{ kind: "practice", definitionId: practiceId }] : [];
    }),
    ...Object.keys(settlementStructureDefs).flatMap((structureId) => {
      const def = settlementStructureDefs[structureId];
      return isDefinitionUnlocked(state, def) && (def.tags ?? []).includes(requiredTag)
        ? [{ kind: "structure", definitionId: structureId }] : [];
    }),
  ];
  const offers = [];
  for (const candidate of shuffle(state, candidates)) {
    if (offers.length >= 3) break;
    if (candidate.kind === "practice") {
      const practiceId = candidate.definitionId;
      const def = getDetailedPracticeDef(state, practiceId);
      const installed = reservation.practiceSlots.find((slot) => slot?.practiceId === practiceId);
      if (installed?.tier === "diamond") continue;
      const tier = installed?.tier ?? "bronze";
      const offeredTier = rollOfferQuality(state, vassal.locationRegionId);
      const resultingTier = installed ? getNextDetailedPracticeTier(tier) : offeredTier;
      if (!resultingTier) continue;
      const intervention = {
        kind: "practice", targetRegionId: vassal.locationRegionId, practiceId,
        mode: installed ? "upgrade" : "learn", tier, resultingTier,
      };
        offers.push({
        offerId: `${nodeState.nodeId}:r${roll}:tag:${offers.length}`,
        label: installed ? `Upgrade ${def.label} ${qualityLabel(tier)} → ${qualityLabel(resultingTier)}`
          : `Learn ${qualityLabel(resultingTier)} ${def.label}`,
        basePrestigeCost: Math.max(0, def.vassalPrestigeCost ?? 0),
        basePhaseCost: Math.max(0, def.vassalPhaseCost ?? 0),
        intervention,
      });
    } else {
      offers.push(makeStructureOffer(state, vassal, nodeState, roll, candidate.definitionId, offers.length, 'tag'));
    }
  }
  return offers;
}

function buildRemovalOffers(state, vassal, nodeState, roll, removalKind) {
  const settlement = getDetailedSite(state, vassal.locationRegionId)?.detailedState;
  let targets = [];
  if (removalKind === "practice") {
    targets = (settlement?.practiceSlots ?? []).flatMap((slot) => slot ? [{
      label: `Remove ${getDetailedPracticeDef(state, slot.practiceId)?.label ?? slot.practiceId}`,
      intervention: { kind: "practice", mode: "remove", targetRegionId: vassal.locationRegionId,
        practiceId: slot.practiceId, tier: slot.tier ?? "bronze" },
    }] : []);
  } else {
    targets = (state?.world?.connections ?? []).flatMap((edge) => {
      if (edge.regionAId !== vassal.locationRegionId && edge.regionBId !== vassal.locationRegionId) return [];
      const left = getRegionReference(state, edge.regionAId) ?? edge.regionAId;
      const right = getRegionReference(state, edge.regionBId) ?? edge.regionBId;
      return [{
        label: `Remove ${left} ↔ ${right}`,
        intervention: { kind: "connection", mode: "remove", regionAId: edge.regionAId, regionBId: edge.regionBId },
      }];
    });
  }
  return shuffle(state, targets).slice(0, 3).map((target, index) => ({
    offerId: `${nodeState.nodeId}:r${roll}:remove:${index}`,
    ...target,
    basePrestigeCost: VASSAL_LIFE_TUNING.signatureRemovalPrestigeCost,
    basePhaseCost: VASSAL_LIFE_TUNING.routeRemovePhaseCost,
  }));
}

function buildRouteOffers(state, vassal, nodeState, roll) {
  const reservation = buildReservation(state, vassal, nodeState);
  const currentId = vassal.locationRegionId;
  const candidates = getWorldConnectionCandidates(getWorldDefinition(state)).flatMap((edge) => {
    if (edge.regionAId !== currentId && edge.regionBId !== currentId) return [];
    const key = getWorldConnectionKey(edge.regionAId, edge.regionBId);
    const exists = reservation.connectionKeys.has(key);
    if (!exists) {
      return [{ mode: "add", edge }];
    }
    return [];
  });
  return shuffle(state, candidates).slice(0, 3).map((candidate, index) => {
    const { edge, mode } = candidate;
    const left = getRegionReference(state, edge.regionAId) ?? edge.regionAId;
    const right = getRegionReference(state, edge.regionBId) ?? edge.regionBId;
    return {
      offerId: `${nodeState.nodeId}:r${roll}:route:${index}`,
      label: `${mode === "add" ? "Connect" : "Remove"} ${left} ↔ ${right}`,
      basePrestigeCost: mode === "add"
        ? VASSAL_LIFE_TUNING.routeAddPrestigeCost : VASSAL_LIFE_TUNING.routeRemovePrestigeCost,
      basePhaseCost: mode === "add"
        ? VASSAL_LIFE_TUNING.routeAddPhaseCost : VASSAL_LIFE_TUNING.routeRemovePhaseCost,
      intervention: { kind: "connection", mode, regionAId: edge.regionAId, regionBId: edge.regionBId },
    };
  });
}

export function generateShopInventory(state, vassal, nodeState) {
  const roll = Math.max(0, Math.floor(nodeState.inventoryRoll ?? 0));
  const offers = nodeState.signatureNode?.groupId === "tagShop"
    ? buildTaggedOffers(state, vassal, nodeState, roll, nodeState.signatureNode.tag)
    : nodeState.signatureNode?.groupId === "removal"
      ? buildRemovalOffers(state, vassal, nodeState, roll, nodeState.signatureNode.removalKind)
      : nodeState.family === "practiceReform"
    ? buildPracticeOffers(state, vassal, nodeState, roll)
    : nodeState.family === "publicWorks"
      ? buildStructureOffers(state, vassal, nodeState, roll)
      : buildRouteOffers(state, vassal, nodeState, roll);
  return offers.map((offer, inventoryIndex) => ({ ...offer, inventoryIndex }));
}

export function isShopNodeState(nodeState) {
  return nodeState?.contentMode === "shop" || SHOP_FAMILIES.has(nodeState?.family);
}

export function purchaseVassalShopOffer(state, nodeId, offerId, origin = null, toIndex = null) {
  const vassal = getCurrentLifeMapVassal(state);
  const nodeState = vassal?.lifeMap?.nodeStates?.[nodeId];
  if (!vassal || vassal.lifeMap.currentNodeId !== nodeId || !isShopNodeState(nodeState)
      || nodeState.resolving) return { ok: false, reason: "shopUnavailable" };
  const index = nodeState.inventory.findIndex((offer) => offer.offerId === offerId);
  if (index < 0) return { ok: false, reason: "offerUnavailable" };
  const offer = nodeState.inventory[index];
  const prestigeCost = getAdjustedVassalPrestigeCost(vassal, offer.basePrestigeCost);
  const phaseCost = getAdjustedVassalPhaseCost(vassal, offer.basePhaseCost);
  const stagedPrestigeCost = (nodeState.purchasedOffers ?? [])
    .reduce((sum, purchase) => sum + Math.max(0, purchase.prestigeCost ?? 0), 0);
  if (prestigeCost > vassal.prestige - stagedPrestigeCost) {
    return { ok: false, reason: "insufficientPrestige" };
  }
  const prepared = offer.intervention?.kind === 'structure'
    ? prepareStructurePlacement(state, vassal, nodeState, offer, origin) : { ok: true };
  if (!prepared.ok) return prepared;
  const purchase = {
    ...clone(offer), ...(prepared.placement ? { placement: prepared.placement } : {}), prestigeCost, phaseCost, purchasedSec: state.tSec,
    sourceInventoryRoll: Math.max(0, Math.floor(nodeState.inventoryRoll ?? 0)),
    sourceInventoryIndex: Math.max(0, Math.floor(offer.inventoryIndex ?? index)),
  };
  const next = [...nodeState.purchasedOffers];
  const practicePositions = next.flatMap((p, i) => p.intervention.kind === 'practice' ? [i] : []);
  const insertionIndex = purchase.intervention.kind === 'practice' && Number.isInteger(toIndex)
    ? practicePositions[Math.max(0, toIndex)] ?? next.length : 0;
  next.splice(insertionIndex, 0, purchase);
  const validation = validatePurchaseInterventions(state, vassal, next);
  if (!validation.ok) return validation;
  nodeState.inventory.splice(index, 1);
  nodeState.purchasedOffers = next;
  nodeState.purchasedOfferIds = next.map(p => p.offerId);
  nodeState.accumulatedPhaseCost += phaseCost;
  return { ok: true, offerId, prestigeCost, phaseCost };
}

export function undoVassalShopPurchase(state, nodeId, offerId) {
  const vassal = getCurrentLifeMapVassal(state);
  const nodeState = vassal?.lifeMap?.nodeStates?.[nodeId];
  if (!vassal || vassal.lifeMap.currentNodeId !== nodeId || !isShopNodeState(nodeState)
      || nodeState.resolving) return { ok: false, reason: "shopUnavailable" };
  const index = nodeState.purchasedOffers.findIndex((purchase) => purchase.offerId === offerId);
  if (index < 0) return { ok: false, reason: "purchaseUnavailable" };
  const [purchase] = nodeState.purchasedOffers.splice(index, 1);
  nodeState.purchasedOfferIds = nodeState.purchasedOffers.map((entry) => entry.offerId);
  const restored = clone(purchase);
  delete restored.placement;
  delete restored.prestigeCost;
  delete restored.phaseCost;
  delete restored.purchasedSec;
  delete restored.sourceInventoryRoll;
  const originalIndex = Math.max(0, Math.floor(restored.sourceInventoryIndex ?? nodeState.inventory.length));
  delete restored.sourceInventoryIndex;
  restored.inventoryIndex = originalIndex;
  nodeState.inventory.push(restored);
  nodeState.inventory.sort((left, right) =>
    Math.floor(left.inventoryIndex ?? 0) - Math.floor(right.inventoryIndex ?? 0));
  nodeState.accumulatedPhaseCost = Math.max(
    0, nodeState.accumulatedPhaseCost - Math.max(0, purchase.phaseCost ?? 0)
  );
  return { ok: true, offerId, prestigeCost: purchase.prestigeCost, phaseCost: purchase.phaseCost };
}

export function reorderVassalShopPurchase(state, nodeId, offerId, toIndex) {
  const vassal = getCurrentLifeMapVassal(state);
  const nodeState = vassal?.lifeMap?.nodeStates?.[nodeId];
  if (!vassal || vassal.lifeMap.currentNodeId !== nodeId || !isShopNodeState(nodeState)
      || nodeState.resolving) return { ok: false, reason: "shopUnavailable" };
  const ordered = nodeState.purchasedOffers.filter(p => p.intervention.kind === 'practice');
  const fromIndex = ordered.findIndex((purchase) => purchase.offerId === offerId);
  const targetIndex = Number.isFinite(toIndex) ? Math.floor(toIndex) : -1;
  if (fromIndex < 0 || targetIndex < 0 || targetIndex >= ordered.length) {
    return { ok: false, reason: "invalidPurchaseOrder" };
  }
  if (fromIndex !== targetIndex) {
    const [purchase] = ordered.splice(fromIndex, 1);
    ordered.splice(targetIndex, 0, purchase);
    let cursor = 0;
    nodeState.purchasedOffers = nodeState.purchasedOffers.map(p => p.intervention.kind === 'practice' ? ordered[cursor++] : p);
    nodeState.purchasedOfferIds = nodeState.purchasedOffers.map((entry) => entry.offerId);
  }
  return { ok: true, offerId, fromIndex, toIndex: targetIndex };
}

export function moveVassalShopStructure(state, nodeId, offerId, origin) {
  const vassal = getCurrentLifeMapVassal(state);
  const nodeState = vassal?.lifeMap?.nodeStates?.[nodeId];
  if (!vassal || vassal.lifeMap.currentNodeId !== nodeId || !isShopNodeState(nodeState) || nodeState.resolving) return { ok: false, reason: 'shopUnavailable' };
  const purchase = nodeState.purchasedOffers.find(p => p.offerId === offerId);
  if (!purchase?.placement || purchase.placement.mode === 'upgrade') return { ok: false, reason: 'placementLocked' };
  const next = nodeState.purchasedOffers.map(p => p === purchase ? { ...p, placement: { ...p.placement, origin } } : p);
  const validation = validatePurchaseInterventions(state, vassal, next);
  if (!validation.ok) return validation;
  nodeState.purchasedOffers = next;
  return { ok: true };
}

export function rerollVassalShop(state, nodeId) {
  const vassal = getCurrentLifeMapVassal(state);
  const nodeState = vassal?.lifeMap?.nodeStates?.[nodeId];
  if (!vassal || vassal.lifeMap.currentNodeId !== nodeId || !isShopNodeState(nodeState)
      || nodeState.resolving) return { ok: false, reason: "shopUnavailable" };
  if (nodeState.rerollUsed) return { ok: false, reason: "rerollUsed" };
  if ((nodeState.purchasedOffers ?? []).length > 0) {
    return { ok: false, reason: "stagedPurchases" };
  }
  const prestigeCost = getAdjustedVassalPrestigeCost(
    vassal, VASSAL_LIFE_TUNING.shopRerollPrestigeCost
  );
  const phaseCost = getAdjustedVassalPhaseCost(vassal, VASSAL_LIFE_TUNING.shopRerollPhaseCost);
  if (prestigeCost > vassal.prestige) return { ok: false, reason: "insufficientPrestige" };
  vassal.prestige -= prestigeCost;
  nodeState.accumulatedPhaseCost += phaseCost;
  nodeState.rerollUsed = true;
  nodeState.inventoryRoll += 1;
  nodeState.inventory = generateShopInventory(state, vassal, nodeState);
  return { ok: true, prestigeCost, phaseCost, inventory: clone(nodeState.inventory) };
}
