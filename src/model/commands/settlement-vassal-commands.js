import {
  selectCheatSettlementVassal,
  selectSettlementVassal,
} from "../settlement-vassal-exec.js";

export function cmdSelectSettlementVassal(state, payload = {}) {
  const candidateIndex = Number.isFinite(payload?.candidateIndex)
    ? Math.floor(payload.candidateIndex)
    : null;
  if (candidateIndex == null) return { ok: false, reason: "missingCandidateIndex" };
  const expectedPoolHash =
    typeof payload?.expectedPoolHash === "string" && payload.expectedPoolHash.length > 0
      ? payload.expectedPoolHash
      : null;
  return selectSettlementVassal(state, candidateIndex, expectedPoolHash, payload?.tSec);
}

export function cmdDebugSelectCheatVassal(state, payload = {}) {
  return selectCheatSettlementVassal(state, payload?.spec, payload?.tSec);
}
