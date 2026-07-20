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

function evaluateRegionalPractice(state, host, practiceId, installedPracticeIds) {
  const def = regionalPracticeDefs[practiceId];
  if (!def) return { ok: false, reason: "invalidPracticeId" };
  const evaluator = SCORE_RULE_EVALUATORS[def.scoreRule];
  if (!evaluator) return { ok: false, reason: "invalidScoreRule" };

  const bonus = evaluator(state, host, practiceId, installedPracticeIds);
  const score = REGIONAL_PRACTICE_BASE_SCORE + bonus.amount;
  const breakdown = [
    { kind: "base", amount: REGIONAL_PRACTICE_BASE_SCORE, text: "Base score: 1" },
    { kind: "bonus", amount: bonus.amount, text: `${bonus.text}: +${bonus.amount}` },
  ];

  return {
    ok: true,
    regionId: host.id,
    practiceId,
    score,
    breakdown,
    diagnostics: Object.fromEntries(
      Object.entries(bonus).filter(([key]) => !["amount", "text"].includes(key))
    ),
  };
}

export function evaluateRegionalPracticePlacement(state, { regionId, practiceId } = {}) {
  const host = getRegionState(state, regionId);
  if (!host || !getRegionDefinition(state, regionId)) {
    return { ok: false, reason: "invalidRegionId" };
  }
  return evaluateRegionalPractice(
    state,
    host,
    practiceId,
    [...host.installedPracticeIds, practiceId]
  );
}

export function evaluateInstalledRegionalPractice(state, { regionId, installedIndex } = {}) {
  const host = getRegionState(state, regionId);
  if (!host || !getRegionDefinition(state, regionId)) {
    return { ok: false, reason: "invalidRegionId" };
  }
  if (
    !Number.isInteger(installedIndex)
    || installedIndex < 0
    || installedIndex >= host.installedPracticeIds.length
  ) {
    return { ok: false, reason: "invalidInstalledIndex" };
  }
  const practiceId = host.installedPracticeIds[installedIndex];
  const evaluation = evaluateRegionalPractice(
    state,
    host,
    practiceId,
    host.installedPracticeIds
  );
  return evaluation.ok ? { ...evaluation, installedIndex } : evaluation;
}

export function getRegionalPracticeScoreboard(state) {
  const byPracticeId = Object.fromEntries(
    Object.keys(regionalPracticeDefs).map((practiceId) => [practiceId, {
      count: 0,
      totalScore: 0,
    }])
  );
  const entries = [];

  for (const region of state?.world?.regions ?? []) {
    for (let installedIndex = 0; installedIndex < region.installedPracticeIds.length; installedIndex += 1) {
      const evaluation = evaluateInstalledRegionalPractice(state, {
        regionId: region.id,
        installedIndex,
      });
      if (!evaluation.ok) {
        return {
          ok: false,
          reason: "invalidInstalledPractice",
          regionId: region.id,
          installedIndex,
          evaluation,
        };
      }
      entries.push(evaluation);
      byPracticeId[evaluation.practiceId].count += 1;
      byPracticeId[evaluation.practiceId].totalScore += evaluation.score;
    }
  }

  return {
    ok: true,
    installedCount: entries.length,
    totalScore: entries.reduce((total, entry) => total + entry.score, 0),
    byPracticeId,
    entries,
  };
}
