import {
  evaluateRegionalPracticePlacement,
  validateRegionalPracticeInstallation,
  validateRegionalPracticeUninstallation,
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
    operation: "install",
    regionId,
    practiceId,
    index,
    evaluation,
  };
}

export function cmdUninstallRegionalPractice(state, { regionId, installedIndex } = {}) {
  const validation = validateRegionalPracticeUninstallation(state, { regionId, installedIndex });
  if (!validation.ok) return validation;

  const region = getRegionState(state, regionId);
  const [practiceId] = region.installedPracticeIds.splice(installedIndex, 1);
  return {
    ok: true,
    operation: "uninstall",
    regionId,
    practiceId,
    installedIndex,
  };
}
