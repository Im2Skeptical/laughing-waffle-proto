import {
  chooseVassalDevelopmentStat,
  confirmVassalLifeNode,
  enterVassalLifeNode,
  purchaseVassalShopOffer,
  rerollVassalCandidates,
  rerollVassalShop,
  selectLifeMapVassal,
  selectVassalNodeOption,
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
  purchaseVassalShopOffer(state, payload.nodeId, payload.offerId);
export const cmdRerollVassalShop = (state, payload = {}) =>
  rerollVassalShop(state, payload.nodeId);
export const cmdConfirmVassalLifeNode = (state, payload = {}) =>
  confirmVassalLifeNode(state, payload.nodeId);
export const cmdChooseVassalDevelopmentStat = (state, payload = {}) =>
  chooseVassalDevelopmentStat(state, payload.statId);
