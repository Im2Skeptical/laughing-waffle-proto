// Region-scope resolution and map-score evaluators.

import { getDetailedStructureDef } from "../game-config.js";
import {
  getConnectedRegionIds,
  getRegionState,
  getWorldDefinition,
} from "../world-state.js";
import {
  getDetailedSettlement,
  getStructureCount,
  hasStructureCapability,
} from "./queries.js";

export function validateRegionScopeDefinition(scope, label, errors) {
  if (!scope || typeof scope !== "object") {
    errors.push(`${label}: missing region scope`);
    return;
  }
  if (scope.kind === "conditionalHostStructure") {
    if (typeof scope.structureId !== "string") errors.push(`${label}: invalid practice condition`);
    if (scope.requiredDefinitionPath != null
        && (!Array.isArray(scope.requiredDefinitionPath)
          || scope.requiredDefinitionPath.length === 0
          || scope.requiredDefinitionPath.some(
            (part) => typeof part !== "string" && !Number.isInteger(part)
          ))) {
      errors.push(`${label}: invalid required definition path`);
    }
    validateRegionScopeDefinition(scope.whenPresent, `${label}.whenPresent`, errors);
    validateRegionScopeDefinition(scope.otherwise, `${label}.otherwise`, errors);
    return;
  }
  if (!["adjacent", "connectedComponent", "commercialAdjacent"].includes(scope.kind)) {
    errors.push(`${label}: invalid region scope ${scope.kind}`);
  }
}

export function getWorldRegionOrder(state) {
  return new Map((getWorldDefinition(state)?.regions ?? []).map(
    (region, index) => [region.id, index]
  ));
}

function orderRegionIds(state, regionIds) {
  const order = getWorldRegionOrder(state);
  return [...new Set(regionIds)].sort((left, right) =>
    (order.get(left) ?? Number.MAX_SAFE_INTEGER)
      - (order.get(right) ?? Number.MAX_SAFE_INTEGER)
      || (String(left) < String(right) ? -1 : String(left) > String(right) ? 1 : 0)
  );
}

function regionHasDetailedPractice(state, regionId, practiceId) {
  return (getDetailedSettlement(state, regionId)?.practiceSlots ?? [])
    .some((slot) => slot?.practiceId === practiceId);
}

function regionMatchesFilters(state, host, regionId, filters) {
  if (!filters) return true;
  const region = getRegionState(state, regionId);
  if (!region) return false;
  if (filters.controller && region.controller !== filters.controller) return false;
  if (filters.colour === "host" && region.colour !== host.colour) return false;
  if (filters.colour === "differentFromHost" && region.colour === host.colour) return false;
  if (typeof filters.colour === "string"
      && filters.colour !== "host"
      && filters.colour !== "differentFromHost"
      && region.colour !== filters.colour) return false;
  if (filters.detailedSettlement === true && !getDetailedSettlement(state, regionId)) {
    return false;
  }
  if (filters.practiceId
      && !regionHasDetailedPractice(state, regionId, filters.practiceId)) {
    return false;
  }
  return true;
}

export function resolveDetailedRegionScope(state, regionId, scope) {
  const host = getRegionState(state, regionId);
  if (!host) return [];
  if (scope?.kind === "conditionalHostStructure") {
    const practiceDef = getDetailedStructureDef(state, scope.structureId);
    const requiredValue = (scope.requiredDefinitionPath ?? []).reduce(
      (current, key) => current?.[key],
      practiceDef
    );
    const conditionEnabled = scope.requiredDefinitionPath == null
      || requiredValue === true;
    const selectedScope = getStructureCount(state, regionId, scope.structureId) > 0
      && conditionEnabled
      ? scope.whenPresent
      : scope.otherwise;
    return resolveDetailedRegionScope(state, regionId, selectedScope);
  }

  let candidateIds = [];
  if (scope?.kind === "adjacent") {
    candidateIds = getConnectedRegionIds(state, regionId);
  } else if (scope?.kind === "commercialAdjacent") {
    // Commercial reach is deliberately separate from ordinary adjacency. All
    // graph neighbours qualify, while a Caravan-only player settlement chain
    // adds its participating detailed settlements.
    candidateIds = getConnectedRegionIds(state, regionId);
    const isCaravanNode = (candidateId) =>
      getRegionState(state, candidateId)?.controller === "player"
      && Boolean(getDetailedSettlement(state, candidateId))
      && hasStructureCapability(state, candidateId, "commercialRelay");
    if (isCaravanNode(regionId)) {
      const visited = new Set();
      const queue = [regionId];
      while (queue.length > 0) {
        const current = queue.shift();
        if (visited.has(current)) continue;
        visited.add(current);
        for (const next of orderRegionIds(state, getConnectedRegionIds(state, current))) {
          if (!visited.has(next) && isCaravanNode(next)) queue.push(next);
        }
      }
      candidateIds.push(...visited);
    }
  } else if (scope?.kind === "connectedComponent") {
    if (!regionMatchesFilters(state, host, regionId, scope.traversalFilters)) return [];
    const visited = new Set();
    const queue = [regionId];
    while (queue.length > 0) {
      const current = queue.shift();
      if (visited.has(current)) continue;
      visited.add(current);
      for (const next of orderRegionIds(state, getConnectedRegionIds(state, current))) {
        if (!visited.has(next)
            && regionMatchesFilters(state, host, next, scope.traversalFilters)) {
          queue.push(next);
        }
      }
    }
    candidateIds = [...visited];
  } else {
    return [];
  }

  if (scope.includeHost === true) candidateIds.push(regionId);
  else candidateIds = candidateIds.filter((id) => id !== regionId);
  return orderRegionIds(state, candidateIds).filter(
    (id) => regionMatchesFilters(state, host, id, scope.regionFilters)
  );
}

export function evaluateDetailedMapScore(state, regionId, evaluator) {
  const host = getRegionState(state, regionId);
  if (!host) return { ok: false, reason: "unknownRegion", score: 0 };
  if (evaluator?.kind === "constant") {
    const score = Math.max(0, Number(evaluator.score) || 0);
    return {
      ok: true,
      score,
      breakdown: [{ kind: "constant", amount: score, text: evaluator.label ?? "constant" }],
      diagnostics: { matchingRegionIds: [] },
    };
  }
  if (evaluator?.kind === "countAlliedConnectedRegions") {
    const ids = resolveDetailedRegionScope(state, regionId, { kind: "connectedComponent", includeHost: true, traversalFilters: { controller: "player" }, regionFilters: { controller: "player" } });
    return { ok: true, score: ids.length, breakdown: [{ kind: "regionCount", amount: ids.length, text: evaluator.label ?? "allied regions" }], diagnostics: { matchingRegionIds: ids } };
  }
  if (evaluator?.kind === "countDistinctRegionalColours") {
    const ids = resolveDetailedRegionScope(state, regionId, { kind: "connectedComponent", includeHost: true, traversalFilters: { controller: "player" }, regionFilters: { controller: "player" } });
    const colours = [...new Set(ids.map((id) => getRegionState(state, id)?.colour).filter(Boolean))];
    return { ok: true, score: colours.length, breakdown: [{ kind: "colourCount", amount: colours.length, text: evaluator.label ?? "regional colours" }], diagnostics: { matchingRegionIds: ids, colours } };
  }
  if (evaluator?.kind !== "countRegions") {
    return { ok: false, reason: "unknownEvaluator", score: 0 };
  }
  const scopeRegionIds = resolveDetailedRegionScope(state, regionId, evaluator.scope);
  const candidateIds = evaluator.includeHost === true
    ? orderRegionIds(state, [regionId, ...scopeRegionIds])
    : scopeRegionIds;
  const matchingRegionIds = candidateIds.filter(
    (id) => regionMatchesFilters(state, host, id, evaluator.regionFilters)
  );
  const score = matchingRegionIds.length;
  return {
    ok: true,
    score,
    breakdown: [{
      kind: "regionCount",
      amount: score,
      text: `${score} ${evaluator.label ?? "qualifying regions"}`,
    }],
    diagnostics: { scopeRegionIds, matchingRegionIds },
  };
}
