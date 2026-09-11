// Moon-turn bookkeeping for the six-phase stepper.

import { getMoonPhaseAtSecond } from "../../moon-phases.js";
import {
  clone,
  createMoonRegionResult,
} from "../helpers.js";
import { getDetailedSettlementSites } from "../queries.js";

export function createMoonTurn(state, phase) {
  return {
    moonIndex: phase.moonIndex,
    startedSec: state.tSec,
    phaseId: phase.id,
    phaseIndex: phase.phaseIndex,
    regions: Object.fromEntries(
      getDetailedSettlementSites(state).map((site) => [
        site.regionId,
        createMoonRegionResult(site.regionId),
      ])
    ),
    migrationIntents: [],
    movements: [],
    unresolved: [],
  };
}

export function beginMoonTurn(state, phase) {
  const civilization = state.civilization;
  const previous = civilization.currentMoonTurn;
  if (previous) {
    civilization.lastMoonTurn = clone(previous);
    for (const site of getDetailedSettlementSites(state)) {
      site.detailedState.lastMoonResult = clone(
        previous.regions?.[site.regionId] ?? createMoonRegionResult(site.regionId)
      );
    }
  }
  civilization.currentMoonTurn = createMoonTurn(state, phase);
  return civilization.currentMoonTurn;
}

export function ensureMoonTurn(state, phase = getMoonPhaseAtSecond(state)) {
  const current = state?.civilization?.currentMoonTurn;
  if (current?.moonIndex === phase.moonIndex) return current;
  return beginMoonTurn(state, phase);
}

export function setMoonTurnPhase(state, phase) {
  const turn = ensureMoonTurn(state, phase);
  turn.phaseId = phase.id;
  turn.phaseIndex = phase.phaseIndex;
  return turn;
}
