import {
  selectDetailedVassalCandidate,
} from "../detailed-settlements.js";

export function cmdSelectSettlementVassal(state, payload = {}) {
  const candidateIndex = Number.isFinite(payload?.candidateIndex)
    ? Math.floor(payload.candidateIndex)
    : null;
  if (candidateIndex == null) return { ok: false, reason: "missingCandidateIndex" };
  const expectedPoolHash =
    typeof payload?.expectedPoolHash === "string" && payload.expectedPoolHash.length > 0
      ? payload.expectedPoolHash
      : null;
  const rerollIndex = Number.isFinite(payload?.rerollIndex)
    ? Math.max(0, Math.min(999, Math.floor(payload.rerollIndex)))
    : 0;
  return selectDetailedVassalCandidate(
    state,
    candidateIndex,
    expectedPoolHash,
    rerollIndex,
    payload?.candidateOverride ?? null
  );
}
