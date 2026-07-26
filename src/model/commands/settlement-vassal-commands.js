import { selectDetailedVassalCandidate } from "../detailed-settlements.js";

export function cmdSelectSettlementVassal(state, payload = {}) {
  const candidateIndex = Number.isFinite(payload?.candidateIndex)
    ? Math.floor(payload.candidateIndex)
    : null;
  if (candidateIndex == null) return { ok: false, reason: "missingCandidateIndex" };
  const expectedPoolHash =
    typeof payload?.expectedPoolHash === "string" && payload.expectedPoolHash.length > 0
      ? payload.expectedPoolHash
      : null;
  return selectDetailedVassalCandidate(state, candidateIndex, expectedPoolHash);
}

export function cmdDebugSelectCheatVassal(state, payload = {}) {
  return { ok: false, reason: "cheatVassalsRemoved" };
}
