// Invalidation reasons that mean the civilization timeline itself changed
// (edit, commit, reprojection, load). Browsing reasons such as "scrubBrowse"
// only move the viewed second and return false.
export function shouldInvalidateSettlementTimelineForecast(reason) {
  if (typeof reason !== "string" || reason.length <= 0) return true;
  if (reason === "init" || reason === "saveLoad") return true;
  if (reason === "actionDispatched" || reason === "actionDispatchedCurrentSec") {
    return true;
  }
  if (reason === "actionScheduled") return true;
  if (reason === "scrubCommit") return true;
  if (reason === "plannerClear") return true;
  if (reason.startsWith("plannerCommit:")) return true;
  return false;
}
