import { stockTotal } from "../detailed-settlements/stock.js";
import { getDetailedSettlement } from '../detailed-settlements/queries.js';
import { findStructurePlacement, projectStructureDraft } from "../structure-layout.js";
import { projectPracticeDraft } from "../practice-draft.js";
import { VASSAL_LIFE_TUNING, VASSAL_NODE_FAMILIES, isVassalStockOutputPractice } from "../../defs/gamepieces/vassal-life-map-defs.js";
import {
  VASSAL_INTERVENTION_PRACTICE_IDS,
  settlementStructureDefs,
} from "../../defs/gamepieces/detailed-settlement-defs.js";
import { getDetailedPracticeDef, getDetailedStructureDef } from "../game-config.js";
import { getResearchUnlockIndex, getResearchSilverChance } from '../research-progression.js';
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
  getVassalEffectiveStats,
  getAdjustedVassalPhaseCost,
  getAdjustedVassalPrestigeCost,
  getCurrentLifeMapVassal,
  getDetailedSite,
  getVassalActionPhaseCost,
  getVassalActionPrestigeCost,
  markHeirloomTimeAction,
  shuffle,
} from "./selectors.js";
import { getShopOfferCount } from "./heirlooms.js";

export const CARD_SHOP_FAMILIES = new Set(["practiceReform", "publicWorks", "neutralMarket", "classMarket", "foodShop", "housingShop", "stockShop"]);
export const SHOP_FAMILIES = new Set([...CARD_SHOP_FAMILIES, "routes"]);
const QUALITY_IDS = Object.freeze(["bronze", "silver", "gold", "diamond"]);

function qualityLabel(tier) { return `${tier[0].toUpperCase()}${tier.slice(1)}`; }
function rollOfferQuality(state, regionId, floor = 0) {
  const max = getResearchUnlockIndex(state);
  const min = Math.min(max, Math.max(0, floor));
  if (min === 0 && max === 1) {
    return state.rngNextVassalFloat() < getResearchSilverChance(state) ? QUALITY_IDS[1] : QUALITY_IDS[0];
  }
  return QUALITY_IDS[state.rngNextVassalInt(min, max)];
}
function isDefinitionUnlocked(state, def, nodeState = null) {
  return def?.locked!==true && getDetailedPracticeTierIndex(def?.minimumQuality ?? "bronze") <= Math.min(3,getResearchUnlockIndex(state)+(nodeState?.discoveryAccess?1:0));
}

export function validatePurchaseInterventions(state, vassal, purchases = [], order = vassal?.lifeMap?.nodeStates?.[vassal.lifeMap.currentNodeId]?.practiceDraftOrder) {
  const settlement = getDetailedSite(state, vassal.locationRegionId)?.detailedState;
  const practices = projectPracticeDraft(settlement?.practiceSlots ?? [], purchases, order);
  if (!practices.ok) return practices;
  const structures = projectStructureDraft(settlement?.structureSlots ?? [], purchases.filter(p => p.intervention?.kind === 'structure').map(p => p.placement),
    vassal?.lifeMap?.nodeStates?.[vassal.lifeMap.currentNodeId]?.structureDraftEdits);
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
  if (action.mode === 'remove') return { ok: false, reason: 'standaloneDemolitionUnavailable' };
  const validation = validatePurchaseInterventions(state, vassal, purchases);
  if (!validation.ok) return validation;
  const location = origin == null ? findStructurePlacement(validation.reservation.structureSlots, width, {
    allowDemolition: true, stagedIds: validation.structures.stagedIds,
  }) : { ok: true, origin };
  if (!location.ok) return location;
  const commissionId = offer.sourceOfferId ? offer.offerId
    : (nodeState.nextCommissionId ?? 0) === 0 ? offer.offerId : `${offer.offerId}:c${nodeState.nextCommissionId}`;
  return { ok: true, placement: { placementId: vassal.vassalId + ':' + commissionId,
    origin: location.origin, width, structureId: action.structureId,
    construction: { completedCycles: 0 },
    ...(action.qualityBonus ? {qualityBonus:action.qualityBonus} : {}) } };
}

function makeStructureOffer(state, vassal, nodeState, roll, structureId, index, category = 'structure') {
  const def = getDetailedStructureDef(state, structureId);
  const tier = def.minimumQuality ?? 'bronze';
  const qualityBonus = vassal.classId==='scholar' && tier!=='diamond' && state.rngNextVassalFloat()<Math.min(.75,(getVassalEffectiveStats(vassal).cunning??0)*.05) ? 1 : 0;
  return {
    offerId: nodeState.nodeId + ':r' + roll + ':' + category + ':' + index,
    label: 'Build ' + qualityLabel(qualityBonus ? getNextDetailedPracticeTier(tier) : tier) + ' ' + def.label,
    basePrestigeCost: Math.max(0, def.vassalPrestigeCost ?? 0),
    basePhaseCost: Math.max(0, def.vassalPhaseCost ?? 0),
    baseCurrencyCost: Math.max(0, def.localCurrencyCost ?? 0),
    intervention: { kind: 'structure', mode: 'add',
      targetRegionId: vassal.locationRegionId, structureId, tier, ...(qualityBonus ? {qualityBonus} : {}) },
  };
}

// Partition eligible cards before quality rolls so every inventory and reroll
// keeps its advertised pool mix without consuming randomness for rejected cards.
function selectShopCandidates(state, vassal, nodeState, candidates) {
  const count = getShopOfferCount(vassal, nodeState.family);
  const shuffled = shuffle(state, candidates);
  const common = shuffled.filter(candidate => candidate.pool === "common");
  const specific = vassal.classId
    ? shuffled.filter(candidate => candidate.pool === vassal.classId) : [];
  if (nodeState.family === "neutralMarket") return common.slice(0, count);
  if (nodeState.family === "classMarket") return specific.slice(0, count);
  if (!vassal.classId) return common.slice(0, count);
  const selected = [...specific.slice(0, count - 1), ...common.slice(0, 1)];
  // Thin tagged/unlocked pools can fall back to the other eligible pool.
  const remaining = shuffled.filter(candidate => !selected.includes(candidate));
  return [...selected, ...remaining.slice(0, count - selected.length)];
}

function buildCardOffers(state, vassal, nodeState, roll, { kind = null, requiredTag = null, stockOutput = null } = {}) {
  const reservation = buildReservation(state, vassal, nodeState);
  const candidates = [];
  const addCandidate = (cardKind, definitionId, def) => {
    if (!def || !["common", vassal.classId].includes(def.pool)
        || !isDefinitionUnlocked(state, def, nodeState)
        || (requiredTag && !(def.tags ?? []).includes(requiredTag))
        || (stockOutput && !isVassalStockOutputPractice(def, stockOutput))) return;
    if (cardKind === "practice" && reservation.practiceSlots.some(slot =>
      slot?.practiceId === definitionId && slot.tier === "diamond")) return;
    candidates.push({ kind: cardKind, definitionId, pool: def.pool });
  };
  if (kind !== "structure") {
    for (const id of VASSAL_INTERVENTION_PRACTICE_IDS) {
      addCandidate("practice", id, getDetailedPracticeDef(state, id));
    }
  }
  if (kind !== "practice") {
    for (const id of Object.keys(settlementStructureDefs)) {
      addCandidate("structure", id, getDetailedStructureDef(state, id));
    }
  }
  return selectShopCandidates(state, vassal, nodeState, candidates).map((candidate, index) => {
    const category = requiredTag ? "tag" : candidate.kind;
    if (candidate.kind === "structure") {
      return makeStructureOffer(state, vassal, nodeState, roll, candidate.definitionId, index, category);
    }
    const practiceId = candidate.definitionId;
    const def = getDetailedPracticeDef(state, practiceId);
    const installed = reservation.practiceSlots.find(slot => slot?.practiceId === practiceId);
    const tier = installed?.tier ?? "bronze";
    const naturalTier = rollOfferQuality(state, vassal.locationRegionId);
    const offeredTier = vassal.classId === "scholar" && state.rngNextVassalFloat()
      < Math.min(.75, (getVassalEffectiveStats(vassal).cunning ?? 0) * .05)
      ? (getNextDetailedPracticeTier(naturalTier) ?? naturalTier) : naturalTier;
    const resultingTier = installed ? getNextDetailedPracticeTier(tier) : offeredTier;
    return {
      offerId: `${nodeState.nodeId}:r${roll}:${category}:${index}`,
      label: installed ? `Upgrade ${def.label} ${qualityLabel(tier)} → ${qualityLabel(resultingTier)}`
        : `Learn ${qualityLabel(resultingTier)} ${def.label}`,
      basePrestigeCost: Math.max(0, def.vassalPrestigeCost ?? 0),
      basePhaseCost: Math.max(0, def.vassalPhaseCost ?? 0),
      intervention: {
        kind: "practice", targetRegionId: vassal.locationRegionId, practiceId,
        mode: installed ? "upgrade" : "learn", tier, resultingTier,
      },
    };
  });
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
  return shuffle(state, targets).slice(0, getShopOfferCount(vassal, nodeState.family)).map((target, index) => ({
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
  return shuffle(state, candidates).slice(0, getShopOfferCount(vassal, nodeState.family)).map((candidate, index) => {
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
  if (vassal.discoveryAccess && (CARD_SHOP_FAMILIES.has(nodeState.family)
      || nodeState.signatureNode?.groupId === "tagShop")) {
    nodeState.discoveryAccess=true;
    delete vassal.discoveryAccess;
  }
  const roll = Math.max(0, Math.floor(nodeState.inventoryRoll ?? 0));
  const requiredTag = nodeState.signatureNode?.groupId === "tagShop"
    ? nodeState.signatureNode.tag : VASSAL_NODE_FAMILIES[nodeState.family]?.tag;
  const offers = nodeState.family === "stockShop"
    ? buildCardOffers(state, vassal, nodeState, roll, { kind: "practice", stockOutput: nodeState.stockOutput })
    : requiredTag
    ? buildCardOffers(state, vassal, nodeState, roll, { requiredTag })
    : nodeState.signatureNode?.groupId === "removal"
      ? buildRemovalOffers(state, vassal, nodeState, roll, nodeState.signatureNode.removalKind)
      : nodeState.family === "practiceReform"
    ? buildCardOffers(state, vassal, nodeState, roll, { kind: "practice" })
    : nodeState.family === "publicWorks"
      ? buildCardOffers(state, vassal, nodeState, roll, { kind: "structure" })
      : ["neutralMarket", "classMarket"].includes(nodeState.family)
        ? buildCardOffers(state, vassal, nodeState, roll)
        : buildRouteOffers(state, vassal, nodeState, roll);
  const local=getDetailedSettlement(state,vassal.locationRegionId);
  const bonus=vassal.classId==='scholar' && offers.some(o=>['practice','structure'].includes(o.intervention?.kind)) ? local?.shopQualityBonus??0 : 0;
  if (bonus) {
    for (const offer of offers) {
      const change=offer.intervention;
      if (change?.kind==='practice' && change.mode==='learn') {
        for (let i=0;i<bonus;i++) change.resultingTier=getNextDetailedPracticeTier(change.resultingTier)??change.resultingTier;
        offer.label=`Learn ${qualityLabel(change.resultingTier)} ${getDetailedPracticeDef(state,change.practiceId).label}`;
      }
      if (change?.kind==='structure') change.qualityBonus=Math.min(3,(change.qualityBonus??0)+bonus);
    }
    local.shopQualityBonus=0;
  }
  return offers.map((offer, inventoryIndex) => ({ ...offer, inventoryIndex }));
}

export function isShopNodeState(nodeState) {
  return nodeState?.contentMode === "shop" || SHOP_FAMILIES.has(nodeState?.family);
}

export function purchaseVassalShopOffer(state, nodeId, offerId, origin = null, toIndex = null, replacePracticeId = null) {
  const vassal = getCurrentLifeMapVassal(state);
  const nodeState = vassal?.lifeMap?.nodeStates?.[nodeId];
  if (!vassal || vassal.lifeMap.currentNodeId !== nodeId || !isShopNodeState(nodeState)
      || nodeState.resolving) return { ok: false, reason: "shopUnavailable" };
  const index = nodeState.inventory.findIndex((offer) => offer.offerId === offerId);
  if (index < 0) return { ok: false, reason: "offerUnavailable" };
  const offer = nodeState.inventory[index];
  if (offer.intervention?.kind === 'practice' && toIndex != null && (!Number.isInteger(toIndex)
      || toIndex < 0 || toIndex >= (getDetailedSite(state, vassal.locationRegionId)?.detailedState?.practiceSlots.length ?? 0))) {
    return {ok:false,reason:'invalidPurchaseOrder'};
  }
  const prestigeCost = getVassalActionPrestigeCost(vassal, offer.basePrestigeCost, {
    isFirstShopPurchase: (nodeState.purchasedOffers ?? []).length === 0,
  });
  const phaseCost = getVassalActionPhaseCost(vassal, offer.basePhaseCost, { nodeState });
  const currencyCost = Math.max(0, Number(offer.baseCurrencyCost) || 0);
  const stagedPrestigeCost = (nodeState.purchasedOffers ?? [])
    .reduce((sum, purchase) => sum + Math.max(0, purchase.prestigeCost ?? 0), 0);
  const stagedCurrencyCost = (nodeState.purchasedOffers ?? [])
    .reduce((sum, purchase) => sum + Math.max(0, purchase.currencyCost ?? 0), 0);
  if (prestigeCost > vassal.prestige - stagedPrestigeCost) {
    return { ok: false, reason: "insufficientPrestige" };
  }
  const settlementCurrency = Math.max(0,
    stockTotal(state, getDetailedSite(state, vassal.locationRegionId)?.detailedState, "Currency"));
  if (currencyCost > settlementCurrency - stagedCurrencyCost) {
    return { ok: false, reason: "insufficientCurrency" };
  }
  const prepared = offer.intervention?.kind === 'structure'
    ? prepareStructurePlacement(state, vassal, nodeState, offer, origin) : { ok: true };
  if (!prepared.ok) return prepared;
  const purchase = {
    ...clone(offer), ...(prepared.placement ? { placement: prepared.placement } : {}), prestigeCost, phaseCost, currencyCost, purchasedSec: state.tSec,
    sourceInventoryRoll: Math.max(0, Math.floor(nodeState.inventoryRoll ?? 0)),
    sourceInventoryIndex: Math.max(0, Math.floor(offer.inventoryIndex ?? index)),
  };
  const repeatable = offer.intervention?.kind === 'structure';
  if (repeatable) {
    purchase.sourceOfferId = offer.offerId;
    purchase.offerId = (nodeState.nextCommissionId ?? 0) === 0 ? offer.offerId : `${offer.offerId}:c${nodeState.nextCommissionId}`;
  }
  if (offer.intervention?.kind==='practice' && offer.intervention.mode!=='remove') {
    const def=getDetailedPracticeDef(state,offer.intervention.practiceId);
    const existing=buildReservation(state,vassal,nodeState)?.practiceSlots??[];
    if (Number.isInteger(toIndex)) purchase.tableauIndex=toIndex;
    else if (offer.intervention.mode==='learn' && (def.consume.length||def.require.length)) purchase.tableauIndex=Math.min(existing.length-1,existing.filter(Boolean).length);
  }
  const next = [...nodeState.purchasedOffers];
  const practicePositions = next.flatMap((p, i) => p.intervention.kind === 'practice' ? [i] : []);
  const insertionIndex = purchase.intervention.kind === 'practice' && Number.isInteger(toIndex)
    ? practicePositions[Math.max(0, toIndex)] ?? next.length : 0;
  next.splice(insertionIndex, 0, purchase);
  let order = nodeState.practiceDraftOrder;
  if (purchase.intervention?.kind === 'practice' && purchase.intervention.mode !== 'remove') {
    const current = validatePurchaseInterventions(state, vassal, nodeState.purchasedOffers);
    const pool = current.practices.pool.map(slot => slot?.practiceId ?? null);
    const id = purchase.intervention.practiceId;
    const existing = pool.indexOf(id);
    if (existing >= 0) pool.splice(existing, 1);
    if (replacePracticeId && replacePracticeId !== id) {
      const victim = pool.indexOf(replacePracticeId);
      if (victim < 0 || victim >= current.practices.slots.length) return {ok:false,reason:'invalidReplacement'};
      pool.push(...pool.splice(victim, 1));
    } else if (existing < 0) {
      const empty = pool.slice(0, current.practices.slots.length).indexOf(null);
      if (empty >= 0) pool.splice(empty, 1);
    }
    pool.splice(Number.isInteger(purchase.tableauIndex) ? purchase.tableauIndex : 0, 0, id);
    order = pool;
  }
  const validation = validatePurchaseInterventions(state, vassal, next, order);
  if (!validation.ok) return validation;
  if (repeatable) nodeState.nextCommissionId = (nodeState.nextCommissionId ?? 0) + 1;
  else nodeState.inventory.splice(index, 1);
  nodeState.purchasedOffers = next;
  if (order) nodeState.practiceDraftOrder = order;
  nodeState.purchasedOfferIds = next.map(p => p.offerId);
  nodeState.accumulatedPhaseCost += phaseCost;
  if (phaseCost > 0) purchase.hourglassApplied = nodeState.heirloomTimeActionUsed !== true;
  markHeirloomTimeAction(nodeState, phaseCost);
  return { ok: true, offerId: purchase.offerId, prestigeCost, phaseCost, currencyCost };
}

export function undoVassalShopPurchase(state, nodeId, offerId) {
  const vassal = getCurrentLifeMapVassal(state);
  const nodeState = vassal?.lifeMap?.nodeStates?.[nodeId];
  if (!vassal || vassal.lifeMap.currentNodeId !== nodeId || !isShopNodeState(nodeState)
      || nodeState.resolving) return { ok: false, reason: "shopUnavailable" };
  const index = nodeState.purchasedOffers.findIndex((purchase) => purchase.offerId === offerId);
  if (index < 0) return { ok: false, reason: "purchaseUnavailable" };
  const [purchase] = nodeState.purchasedOffers.splice(index, 1);
  if (purchase.placement && nodeState.structureDraftEdits) {
    nodeState.structureDraftEdits = nodeState.structureDraftEdits.filter(edit => edit.placementId !== purchase.placement.placementId);
  }
  nodeState.purchasedOfferIds = nodeState.purchasedOffers.map((entry) => entry.offerId);
  const restored = clone(purchase);
  delete restored.placement;
  delete restored.tableauIndex;
  delete restored.prestigeCost;
  delete restored.phaseCost;
  delete restored.currencyCost;
  delete restored.purchasedSec;
  delete restored.sourceInventoryRoll;
  const originalIndex = Math.max(0, Math.floor(restored.sourceInventoryIndex ?? nodeState.inventory.length));
  delete restored.sourceInventoryIndex;
  restored.inventoryIndex = originalIndex;
  if (!purchase.sourceOfferId) nodeState.inventory.push(restored);
  nodeState.inventory.sort((left, right) =>
    Math.floor(left.inventoryIndex ?? 0) - Math.floor(right.inventoryIndex ?? 0));
  nodeState.accumulatedPhaseCost = Math.max(
    0, nodeState.accumulatedPhaseCost - Math.max(0, purchase.phaseCost ?? 0)
  );
  if (purchase.hourglassApplied === true) nodeState.heirloomTimeActionUsed = false;
  return { ok: true, offerId, prestigeCost: purchase.prestigeCost, phaseCost: purchase.phaseCost,
    currencyCost: purchase.currencyCost };
}

export function reorderVassalShopPurchase(state, nodeId, offerId, toIndex) {
  const vassal = getCurrentLifeMapVassal(state);
  const nodeState = vassal?.lifeMap?.nodeStates?.[nodeId];
  if (!vassal || vassal.lifeMap.currentNodeId !== nodeId || !isShopNodeState(nodeState)
      || nodeState.resolving) return { ok: false, reason: "shopUnavailable" };
  if (String(offerId).startsWith('practice:')) {
    const projection = validatePurchaseInterventions(state, vassal, nodeState.purchasedOffers);
    const id = offerId.slice('practice:'.length), capacity = projection.practices.slots.length;
    const pool = projection.practices.pool.map(slot => slot?.practiceId ?? null);
    const fromIndex = pool.indexOf(id);
    if (fromIndex < 0 || !Number.isInteger(toIndex) || toIndex < 0 || toIndex > capacity) return {ok:false,reason:'invalidPurchaseOrder'};
    pool.splice(fromIndex, 1);
    if (toIndex === capacity) {
      if (fromIndex < capacity) pool.splice(capacity - 1, 0, null);
      pool.splice(capacity, 0, id);
    } else {
      const empty = pool.slice(0, capacity).indexOf(null);
      if (fromIndex >= capacity && empty >= 0) pool.splice(empty, 1);
      pool.splice(toIndex, 0, id);
    }
    nodeState.practiceDraftOrder = pool;
    return {ok:true,fromIndex,toIndex};
  }
  const ordered = nodeState.purchasedOffers.filter(p => p.intervention.kind === 'practice');
  const fromIndex = ordered.findIndex((purchase) => purchase.offerId === offerId);
  const targetIndex = Number.isFinite(toIndex) ? Math.floor(toIndex) : -1;
  const capacity=getDetailedSite(state,vassal.locationRegionId)?.detailedState?.practiceSlots.length??0;
  if (fromIndex < 0 || targetIndex < 0 || targetIndex >= capacity) {
    return { ok: false, reason: "invalidPurchaseOrder" };
  }
  ordered[fromIndex].tableauIndex=targetIndex;
  const projection = validatePurchaseInterventions(state, vassal, nodeState.purchasedOffers);
  const pool = projection.practices.pool.map(slot => slot?.practiceId ?? null);
  const at = pool.indexOf(ordered[fromIndex].intervention.practiceId);
  pool.splice(targetIndex, 0, ...pool.splice(at, 1));
  nodeState.practiceDraftOrder = pool;
  if (fromIndex !== targetIndex && targetIndex < ordered.length) {
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
  if (String(offerId).startsWith('structure:')) {
    const placementId = offerId.slice('structure:'.length);
    const projection = validatePurchaseInterventions(state, vassal, nodeState.purchasedOffers);
    if (!projection.ok || ![...projection.structures.slots, ...projection.structures.demolished].some(p => p?.placementId === placementId)) return {ok:false,reason:'placementUnavailable'};
    const edits = [...(nodeState.structureDraftEdits ?? []), {placementId, origin}];
    const local = getDetailedSite(state, vassal.locationRegionId)?.detailedState;
    const check = projectStructureDraft(local.structureSlots,
      nodeState.purchasedOffers.filter(p => p.intervention.kind === 'structure').map(p => p.placement), edits);
    if (!check.ok) return check;
    nodeState.structureDraftEdits = edits;
    return {ok:true};
  }
  const purchase = nodeState.purchasedOffers.find(p => p.offerId === offerId);
  if (!purchase?.placement) return { ok: false, reason: 'placementLocked' };
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
  const prestigeCost = getVassalShopRerollCost(vassal);
  const phaseCost = getVassalActionPhaseCost(
    vassal, VASSAL_LIFE_TUNING.shopRerollPhaseCost, { nodeState }
  );
  if (prestigeCost > vassal.prestige) return { ok: false, reason: "insufficientPrestige" };
  vassal.prestige -= prestigeCost;
  nodeState.accumulatedPhaseCost += phaseCost;
  markHeirloomTimeAction(nodeState, phaseCost);
  nodeState.rerollUsed = true;
  nodeState.inventoryRoll += 1;
  nodeState.inventory = generateShopInventory(state, vassal, nodeState);
  return { ok: true, prestigeCost, phaseCost, inventory: clone(nodeState.inventory) };
}

export function getVassalShopRerollCost(vassal) {
  return vassal?.classId === 'scholar' ? 0
    : getAdjustedVassalPrestigeCost(vassal, VASSAL_LIFE_TUNING.shopRerollPrestigeCost);
}
