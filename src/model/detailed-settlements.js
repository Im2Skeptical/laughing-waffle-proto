// Compatibility barrel for the detailed-settlement split.
// Import from this path; do not add new detailed behavior to settlement-exec.js.

export { roundFood } from "./detailed-settlements/helpers.js";
export {
  DETAILED_REGION_IDS,
  createDetailedSettlementState,
  getDetailedSettlement,
  getDetailedSettlementSite,
  getDetailedSettlementSites,
  getElderOrderSummary,
  getGreenAscendancySummary,
  getHousingCapacity,
  getPopulationSummary,
  getSettlementPressureSummary,
  getStoredFoodCapacity,
  getStructureCount,
  getStructureQualityUnits,
} from "./detailed-settlements/queries.js";
export {
  evaluateDetailedMapScore,
  resolveDetailedRegionScope,
} from "./detailed-settlements/scopes.js";
export {
  assignDetailedSettlementWorkers,
  evaluateDetailedPracticeSlot,
  getLocalDistinctPieceTags,
  getLocalTaggedPieceCount,
  planDetailedAdministrationMoves,
  planDetailedAdministrationMovesAtBoundary,
  validateDetailedPracticeDefinitions,
} from "./detailed-settlements/practices.js";
export {
  getElderMortalityRate,
  getPrimordialChaosPressure,
  initializeDetailedSettlementCivilization,
  resolveProbability,
  stepDetailedSettlementsSecond,
} from "./detailed-settlements/phases.js";
export {
  buildDetailedDebugVassalCandidate,
  buildDetailedVassalSelectionPool,
  describeDetailedVassalIntervention,
  generateDetailedVassalCandidates,
  getDetailedVassalCandidateSchedule,
  getDetailedVassalDebugOptions,
  getDetailedVassalInterventionEffectSec,
  getDetailedVassalPrestige,
  replaceDetailedVassalSelectionCandidate,
  selectDetailedVassalCandidate,
} from "./detailed-settlements/vassals.js";
export {
  getDetailedCivilizationSummary,
  getDetailedSettlementViewModel,
} from "./detailed-settlements/view-model.js";
