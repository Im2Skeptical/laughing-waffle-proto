import {
  evaluateRegionalPracticePlacement,
  validateRegionalPracticeInstallation,
} from "../regional-practices.js";
import { getRegionState } from "../world-state.js";

export function cmdInstallRegionalPractice(state, { regionId, practiceId } = {}) {
  const validation = validateRegionalPracticeInstallation(state, { regionId, practiceId });
  if (!validation.ok) return validation;
  const evaluation = evaluateRegionalPracticePlacement(state, { regionId, practiceId });
  if (!evaluation.ok) return evaluation;

  const region = getRegionState(state, regionId);
  const index = region.installedPracticeIds.length;
  region.installedPracticeIds.push(practiceId);
  return {
    ok: true,
    regionId,
    practiceId,
    index,
    evaluation,
  };
}
