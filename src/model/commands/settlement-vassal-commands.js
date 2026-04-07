import {
  beginNextSettlementVassalSelection,
  selectSettlementVassalCandidate,
} from "../settlement-vassal-exec.js";

export function cmdBeginNextSettlementVassalSelection(state, payload = {}) {
  return beginNextSettlementVassalSelection(state, payload?.tSec);
}

export function cmdSelectSettlementVassalCandidate(state, payload = {}) {
  const vassalId =
    typeof payload?.vassalId === "string" && payload.vassalId.length > 0 ? payload.vassalId : null;
  if (!vassalId) return { ok: false, reason: "missingVassalId" };
  return selectSettlementVassalCandidate(state, vassalId, payload?.tSec);
}
