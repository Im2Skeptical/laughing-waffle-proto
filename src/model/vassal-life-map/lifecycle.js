// Compatibility barrel for the Vassal Life Map lifecycle split.
// Import from src/model/vassal-life-map.js; presentation may import
// getSettlementRequirements from this path.

export {
  initializeVassalLifeMapCivilization,
  rerollVassalCandidates,
  selectLifeMapVassal,
} from "./lifecycle/candidates.js";

export {
  enterVassalLifeNode,
  selectVassalNodeOption,
  confirmVassalLifeNode,
  chooseVassalDevelopmentStat,
  getSettlementRequirements,
} from "./lifecycle/node-confirm.js";

export {
  stepVassalLifeMapSecond,
  getVassalPendingResolution,
  getVassalNodeDisplayState,
  validateVassalLifeMapState,
} from "./lifecycle/step.js";
