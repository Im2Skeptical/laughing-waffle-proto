import {
  REGIONAL_PRACTICE_SCORE_RULES,
  regionalPracticeDefs,
} from "../defs/gamepieces/regional-practice-defs.js";
import {
  getConnectedRegionIds,
  getRegionDefinition,
  getRegionState,
} from "./world-state.js";

export const REGIONAL_PRACTICE_BASE_SCORE = 1;
export const REGIONAL_PRACTICE_SCORE_CAP = 4;

function bonusResult(amount, text, details = {}) {
  return {
    amount: Math.max(0, Math.floor(amount ?? 0)),
    text,
    ...details,
  };
}
function adjacentPlayerMatchingColour(state, host) {
  const matches = getConnectedRegionIds(state, host.id).filter((regionId) => {
    const adjacent = getRegionState(state, regionId);
    return adjacent?.controller === "player" && adjacent.colour === host.colour;
  });
  return bonusResult(
    matches.length,
    `${matches.length} adjacent player region${matches.length === 1 ? "" : "s"} match ${host.colour}`,
    { matchingRegionIds: matches }
  );
}

function otherLocalCopies(_state, host, practiceId, hypotheticalPracticeIds) {
  const count = hypotheticalPracticeIds.filter((id) => id === practiceId).length - 1;
  return bonusResult(count, `${count} other Store cop${count === 1 ? "y" : "ies"} in this region`);
}

function distinctLocalNonSelf(_state, _host, practiceId, hypotheticalPracticeIds) {
  const distinctIds = [...new Set(hypotheticalPracticeIds.filter((id) => id !== practiceId))];
  return bonusResult(
    distinctIds.length,
    `${distinctIds.length} distinct non-Study practice${distinctIds.length === 1 ? "" : "s"} in this region`,
    { distinctPracticeIds: distinctIds }
  );
}

function adjacentNonPlayer(state, host) {
  const matches = getConnectedRegionIds(state, host.id).filter(
    (regionId) => getRegionState(state, regionId)?.controller !== "player"
  );
  return bonusResult(
    matches.length,
    `${matches.length} adjacent non-player region${matches.length === 1 ? "" : "s"}`,
    { matchingRegionIds: matches }
  );
}

function connectedPlayerPracticeRegions(state, host, practiceId, hypotheticalPracticeIds) {
  const qualifies = (regionId) => {
    const region = getRegionState(state, regionId);
    if (region?.controller !== "player") return false;
    const practiceIds = regionId === host.id
      ? hypotheticalPracticeIds
      : region.installedPracticeIds;
    return practiceIds.includes(practiceId);
  };

  const visited = new Set();
  const queue = qualifies(host.id) ? [host.id] : [];
  while (queue.length) {
    const current = queue.shift();
    if (visited.has(current)) continue;
    visited.add(current);
    for (const next of getConnectedRegionIds(state, current)) {
      if (!visited.has(next) && qualifies(next)) queue.push(next);
    }
  }

  const componentRegionIds = [...visited];
  const otherCount = Math.max(0, componentRegionIds.length - 1);
  return bonusResult(
    otherCount,
    `${componentRegionIds.length} connected player Administer region${componentRegionIds.length === 1 ? "" : "s"}, including host`,
    { componentRegionIds }
  );
}

function hostConnectionCount(state, host) {
  const connectedRegionIds = getConnectedRegionIds(state, host.id);
  return bonusResult(
    connectedRegionIds.length,
    `${connectedRegionIds.length} host connection${connectedRegionIds.length === 1 ? "" : "s"}`,
    { connectedRegionIds }
  );
}

const SCORE_RULE_EVALUATORS = Object.freeze({
  [REGIONAL_PRACTICE_SCORE_RULES.ADJACENT_PLAYER_MATCHING_COLOUR]: adjacentPlayerMatchingColour,
  [REGIONAL_PRACTICE_SCORE_RULES.OTHER_LOCAL_COPIES]: otherLocalCopies,
  [REGIONAL_PRACTICE_SCORE_RULES.DISTINCT_LOCAL_NON_SELF]: distinctLocalNonSelf,
  [REGIONAL_PRACTICE_SCORE_RULES.ADJACENT_NON_PLAYER]: adjacentNonPlayer,
  [REGIONAL_PRACTICE_SCORE_RULES.CONNECTED_PLAYER_PRACTICE_REGIONS]: connectedPlayerPracticeRegions,
  [REGIONAL_PRACTICE_SCORE_RULES.HOST_CONNECTION_COUNT]: hostConnectionCount,
});

export function validateRegionalPracticeInstallation(state, { regionId, practiceId } = {}) {
  if (!regionalPracticeDefs[practiceId]) return { ok: false, reason: "invalidPracticeId" };
  const region = getRegionState(state, regionId);
  if (!region) return { ok: false, reason: "invalidRegionId" };
  if (region.controller !== "player") return { ok: false, reason: "notPlayerControlled" };
  if (region.installedPracticeIds.length >= region.capacity) {
    return { ok: false, reason: "capacityFull" };
  }
  return { ok: true };
}

export function validateRegionalPracticeUninstallation(state, { regionId, installedIndex } = {}) {
  const region = getRegionState(state, regionId);
  if (!region) return { ok: false, reason: "invalidRegionId" };
  if (region.controller !== "player") return { ok: false, reason: "notPlayerControlled" };
  if (
    !Number.isInteger(installedIndex)
    || installedIndex < 0
    || installedIndex >= region.installedPracticeIds.length
  ) {
    return { ok: false, reason: "invalidInstalledIndex" };
  }
  return {
    ok: true,
    practiceId: region.installedPracticeIds[installedIndex],
  };
}

export function evaluateRegionalPracticePlacement(state, { regionId, practiceId } = {}) {
  const def = regionalPracticeDefs[practiceId];
  if (!def) return { ok: false, reason: "invalidPracticeId" };
  const host = getRegionState(state, regionId);
  if (!host || !getRegionDefinition(state, regionId)) {
    return { ok: false, reason: "invalidRegionId" };
  }
  const evaluator = SCORE_RULE_EVALUATORS[def.scoreRule];
  if (!evaluator) return { ok: false, reason: "invalidScoreRule" };

  const hypotheticalPracticeIds = [...host.installedPracticeIds, practiceId];
  const bonus = evaluator(state, host, practiceId, hypotheticalPracticeIds);
  const uncappedScore = REGIONAL_PRACTICE_BASE_SCORE + bonus.amount;
  const score = Math.min(REGIONAL_PRACTICE_SCORE_CAP, uncappedScore);
  const capped = uncappedScore > score;
  const breakdown = [
    { kind: "base", amount: REGIONAL_PRACTICE_BASE_SCORE, text: "Base score: 1" },
    { kind: "bonus", amount: bonus.amount, text: `${bonus.text}: +${bonus.amount}` },
  ];
  if (capped) {
    breakdown.push({
      kind: "cap",
      amount: score - uncappedScore,
      text: `Capped at ${REGIONAL_PRACTICE_SCORE_CAP}`,
    });
  }

  return {
    ok: true,
    regionId,
    practiceId,
    score,
    uncappedScore,
    capped,
    breakdown,
    diagnostics: Object.fromEntries(
      Object.entries(bonus).filter(([key]) => !["amount", "text"].includes(key))
    ),
  };
}
