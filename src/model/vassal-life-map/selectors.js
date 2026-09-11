import {
  VASSAL_LIFE_TUNING,
  VASSAL_STAT_IDS,
} from "../../defs/gamepieces/vassal-life-map-defs.js";
import { MOON_PHASE_COUNT } from "../../defs/gamesettings/moon-phase-defs.js";
import { getGameSetting } from "../game-config.js";
import { getMoonPhaseDurationSec } from "../moon-phases.js";
import { getRegionState } from "../world-state.js";

export const clone = (value) => JSON.parse(JSON.stringify(value));

function getYearDurationSec(state) {
  const seasons = Array.isArray(state?.seasons) && state.seasons.length > 0
    ? state.seasons.length : 4;
  const seasonDurationSec = Number.isFinite(state?.seasonDurationSec)
    ? Math.max(1, Math.floor(state.seasonDurationSec)) : 8;
  return seasons * seasonDurationSec;
}

export function shuffle(state, values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = state.rngNextVassalInt(0, index);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

export function getDetailedSite(state, regionId) {
  return (state?.world?.sites ?? []).find((site) =>
    site?.regionId === regionId && site?.simulationMode === "detailed" && site?.detailedState
  ) ?? null;
}

export function getPlayerDetailedSites(state) {
  return (state?.world?.sites ?? []).filter((site) =>
    site?.simulationMode === "detailed" && site?.detailedState
      && getRegionState(state, site.regionId)?.controller === "player"
  );
}

export function getVassalLineage(state) {
  return state?.civilization?.vassalLineage ?? null;
}

export function getCurrentLifeMapVassal(state) {
  const lineage = getVassalLineage(state);
  return lineage?.currentVassalId ? lineage?.vassalsById?.[lineage.currentVassalId] ?? null : null;
}

export function getVassalLifeMapGraph(vassal) {
  return vassal?.lifeMap?.graph ?? null;
}

export function getVassalLifeMapNodes(vassal) {
  return getVassalLifeMapGraph(vassal)?.nodes ?? [];
}

export function getVassalLifeMapNode(vassal, nodeId) {
  return getVassalLifeMapNodes(vassal).find((node) => node.id === nodeId) ?? null;
}

export function getVassalLifeMapOutgoingNodeIds(vassal, nodeId) {
  return (getVassalLifeMapGraph(vassal)?.edges ?? [])
    .filter((edge) => edge.fromNodeId === nodeId)
    .map((edge) => edge.toNodeId);
}

export function getSelectedLifeMapVassals(state) {
  const lineage = getVassalLineage(state);
  return (lineage?.selectedVassalIds ?? [])
    .map((id) => lineage?.vassalsById?.[id] ?? null)
    .filter(Boolean);
}

export function getLifeMapVassalAtSecond(state, tSec = null) {
  const safeTSec = Number.isFinite(tSec)
    ? Math.max(0, Math.floor(tSec))
    : Math.max(0, Math.floor(state?.tSec ?? 0));
  let selected = null;
  for (const vassal of getSelectedLifeMapVassals(state)) {
    const selectedSec = Number.isFinite(vassal?.selectedSec)
      ? Math.max(0, Math.floor(vassal.selectedSec))
      : null;
    if (selectedSec == null || selectedSec > safeTSec) continue;
    if (
      !selected ||
      selectedSec >= Math.max(0, Math.floor(selected.selectedSec ?? 0))
    ) {
      selected = vassal;
    }
  }
  return selected;
}

function getCommittedNodeSec(vassal, nodeId) {
  const nodeState = vassal?.lifeMap?.nodeStates?.[nodeId] ?? null;
  if (Number.isFinite(nodeState?.confirmedSec)) {
    return Math.max(0, Math.floor(nodeState.confirmedSec));
  }
  if (
    vassal?.lifeMap?.currentNodeId === nodeId &&
    ["died", "retired"].includes(vassal?.endedReason) &&
    Number.isFinite(vassal?.endSec)
  ) {
    return Math.max(0, Math.floor(vassal.endSec));
  }
  return null;
}

export function getCommittedVassalLifeMapNodeIds(vassal) {
  const completedIds = Array.isArray(vassal?.lifeMap?.completedNodeIds)
    ? vassal.lifeMap.completedNodeIds
    : [];
  const committedIds = [...completedIds];
  for (const nodeId of Object.keys(vassal?.lifeMap?.nodeStates ?? {})) {
    if (getCommittedNodeSec(vassal, nodeId) != null && !committedIds.includes(nodeId)) {
      committedIds.push(nodeId);
    }
  }
  return committedIds;
}

export function getVassalLifeMapPlayheadNodeId(vassal, tSec = null) {
  const safeTSec = Number.isFinite(tSec) ? Math.max(0, Math.floor(tSec)) : null;
  if (safeTSec == null) return null;
  let latest = null;
  let latestSec = -1;
  for (const nodeId of getCommittedVassalLifeMapNodeIds(vassal)) {
    const committedSec = getCommittedNodeSec(vassal, nodeId);
    if (committedSec == null || committedSec > safeTSec || committedSec < latestSec) continue;
    latest = nodeId;
    latestSec = committedSec;
  }
  return latest;
}

export function getVassalAge(state, vassal = null, tSec = null) {
  const current = vassal ?? getCurrentLifeMapVassal(state);
  if (!current) return 0;
  const atSec = Number.isFinite(tSec) ? Math.max(0, Math.floor(tSec))
    : Math.max(0, Math.floor(state?.tSec ?? 0));
  return Math.max(0, Math.floor(current.initialAge ?? 0))
    + Math.max(0, Math.floor((atSec - Math.floor(current.selectedSec ?? 0)) / getYearDurationSec(state)));
}

export function getVassalPrestigeIncome(vassal) {
  return VASSAL_LIFE_TUNING.basePrestigeIncome
    + Math.max(0, Math.floor(vassal?.stats?.cunning ?? 0));
}

export function getVassalDevelopmentIncome(vassal) {
  return VASSAL_LIFE_TUNING.baseDevelopmentIncome
    + Math.max(0, Math.floor(vassal?.stats?.wisdom ?? 0));
}

const VASSAL_STAT_LABELS = Object.freeze({
  cunning: "Cunning",
  wisdom: "Wisdom",
  effectiveness: "Effectiveness",
  intelligence: "Intelligence",
});

export function getVassalStatPresentation(vassal, statId, valueOverride = null) {
  const value = Number.isFinite(valueOverride)
    ? Math.max(0, Math.floor(valueOverride))
    : Math.max(0, Math.floor(vassal?.stats?.[statId] ?? 0));
  const cap = VASSAL_LIFE_TUNING.maximumDiscount;
  const discount = Math.min(cap, value * VASSAL_LIFE_TUNING.discountPerStat);
  const pointsToCap = Math.max(0, Math.ceil(
    (cap - discount) / VASSAL_LIFE_TUNING.discountPerStat
  ));
  if (statId === "cunning") {
    const power = VASSAL_LIFE_TUNING.basePrestigeIncome + value;
    return {
      statId, label: VASSAL_STAT_LABELS[statId], value,
      powerLabel: `+${power} Prestige per completed node`,
      formula: `${VASSAL_LIFE_TUNING.basePrestigeIncome} base + ${value} Cunning`,
      pointsToCap: null,
    };
  }
  if (statId === "wisdom") {
    const power = VASSAL_LIFE_TUNING.baseDevelopmentIncome + value;
    return {
      statId, label: VASSAL_STAT_LABELS[statId], value,
      powerLabel: `+${power} EXP per completed node`,
      formula: `${VASSAL_LIFE_TUNING.baseDevelopmentIncome} base + ${value} Wisdom`,
      pointsToCap: null,
    };
  }
  const percent = Math.round(discount * 100);
  const noun = statId === "effectiveness" ? "Phase" : "Prestige";
  return {
    statId, label: VASSAL_STAT_LABELS[statId] ?? statId, value,
    powerLabel: `${percent}% ${noun}-cost discount`,
    formula: `${Math.round(VASSAL_LIFE_TUNING.discountPerStat * 100)}% per point · ${Math.round(cap * 100)}% cap · costs round up`,
    pointsToCap,
    multiplier: Math.round((1 - discount) * 100) / 100,
  };
}

export function getVassalStatsPresentation(vassal) {
  return VASSAL_STAT_IDS.map((statId) => getVassalStatPresentation(vassal, statId));
}

function adjustedCost(base, stat, { allowZero = true } = {}) {
  const safeBase = Math.max(0, Number(base) || 0);
  if (safeBase <= 0) return 0;
  const discount = Math.min(
    VASSAL_LIFE_TUNING.maximumDiscount,
    Math.max(0, Math.floor(stat ?? 0)) * VASSAL_LIFE_TUNING.discountPerStat
  );
  const result = Math.ceil(safeBase * (1 - discount));
  return allowZero ? Math.max(0, result) : Math.max(1, result);
}

export function getAdjustedVassalPrestigeCost(vassal, baseCost) {
  return adjustedCost(baseCost, vassal?.stats?.intelligence, { allowZero: true });
}

export function getAdjustedVassalPhaseCost(vassal, baseCost) {
  return adjustedCost(baseCost, vassal?.stats?.effectiveness, { allowZero: false });
}

// Display units follow the run's two independent clocks. This never changes
// the phase prices authored in definitions or the seconds paid on confirmation.
export function getVassalPhaseDurationParts(phaseCost, state = null) {
  let remaining = Math.max(0, Math.floor(phaseCost ?? 0));
  const phasesPerYear = getGameSetting(state, "seasonDurationSec") * 4 / getMoonPhaseDurationSec(state);
  // A fractional phase cannot be spent. Use lunar units for calendars whose
  // solar year does not contain an integral number of phases.
  const years = Number.isInteger(phasesPerYear) ? Math.floor(remaining / phasesPerYear) : 0;
  remaining -= years * phasesPerYear;
  const moons = Math.floor(remaining / MOON_PHASE_COUNT);
  const phases = remaining % MOON_PHASE_COUNT;
  return { years, moons, phases };
}

export function formatVassalPhaseDuration(phaseCost, state = null) {
  const { years, moons, phases } = getVassalPhaseDurationParts(phaseCost, state);
  const parts = [];
  if (years) parts.push(`${years} ${years === 1 ? 'year' : 'years'}`);
  if (moons) parts.push(`${moons} ${moons === 1 ? 'moon' : 'moons'}`);
  if (phases || !parts.length) parts.push(`${phases} ${phases === 1 ? 'phase' : 'phases'}`);
  return parts.join(", ");
}

export function candidatePoolHash(candidates) {
  return JSON.stringify(candidates ?? []);
}

export function getVassalCandidatePool(state) {
  const lineage = getVassalLineage(state);
  const candidates = clone(lineage?.pendingCandidates ?? []).map((candidate, candidateIndex) => ({
    ...candidate, candidateIndex,
  }));
  return {
    poolId: `life-vassal-${Math.max(1, Math.floor(lineage?.nextVassalId ?? 1))}-reroll-${Math.max(0, Math.floor(lineage?.candidateRerollCount ?? 0))}`,
    createdSec: Math.max(0, Math.floor(state?.tSec ?? 0)),
    rerollIndex: Math.max(0, Math.floor(lineage?.candidateRerollCount ?? 0)),
    candidates,
    expectedPoolHash: candidatePoolHash(candidates.map(({ candidateIndex: _index, ...candidate }) => candidate)),
  };
}
