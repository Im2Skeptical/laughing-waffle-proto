import {
  chooseVassalDevelopmentStat,
  confirmHeirloomLoadout,
  confirmVassalLifeNode,
  enterVassalLifeNode,
  resolveVaultOverflow,
  purchaseVassalShopOffer,
  moveVassalShopStructure,
  reorderVassalShopPurchase,
  rerollVassalCandidates,
  rerollVassalShop,
  selectLifeMapVassal,
  selectVassalNodeOption,
  undoVassalShopPurchase,
} from "../vassal-life-map.js";

export function cmdSelectSettlementVassal(state, payload = {}) {
  const candidateIndex = Number.isFinite(payload?.candidateIndex)
    ? Math.floor(payload.candidateIndex) : null;
  if (candidateIndex == null) return { ok: false, reason: "missingCandidateIndex" };
  return selectLifeMapVassal(
    state,
    candidateIndex,
    typeof payload.expectedPoolHash === "string" ? payload.expectedPoolHash : null,
    payload.candidateOverride ?? null
  );
}

export const cmdRerollSettlementVassals = (state) => rerollVassalCandidates(state);
export const cmdEnterVassalLifeNode = (state, payload = {}) =>
  enterVassalLifeNode(state, payload.nodeId);
export const cmdSelectVassalLifeOption = (state, payload = {}) =>
  selectVassalNodeOption(state, payload.nodeId, payload.optionId);
export const cmdPurchaseVassalShopOffer = (state, payload = {}) =>
  purchaseVassalShopOffer(state, payload.nodeId, payload.offerId, payload.origin, payload.toIndex);
export const cmdUndoVassalShopPurchase = (state, payload = {}) =>
  undoVassalShopPurchase(state, payload.nodeId, payload.offerId);
export const cmdReorderVassalShopPurchase = (state, payload = {}) =>
  reorderVassalShopPurchase(state, payload.nodeId, payload.offerId, payload.toIndex);
export const cmdRerollVassalShop = (state, payload = {}) =>
  rerollVassalShop(state, payload.nodeId);
export const cmdConfirmVassalLifeNode = (state, payload = {}) =>
  confirmVassalLifeNode(state, payload.nodeId, payload.acquire ?? null);
export const cmdConfirmHeirloomLoadout = (state, payload = {}) =>
  confirmHeirloomLoadout(state, payload.equippedInstanceIds ?? []);
export const cmdResolveVaultOverflow = (state, payload = {}) =>
  resolveVaultOverflow(state, payload.keepInstanceIds ?? []);
export const cmdChooseVassalDevelopmentStat = (state, payload = {}) =>
  chooseVassalDevelopmentStat(state, payload.choiceId, payload.statId);

export const cmdMoveVassalShopStructure = (state, payload = {}) =>
  moveVassalShopStructure(state, payload.nodeId, payload.offerId, payload.origin);
