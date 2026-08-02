import {
  planDetailedAdministrationMovesAtBoundary,
} from "./detailed-settlements.js";
import { MOON_PHASE_INDEX_BY_ID } from "../defs/gamesettings/moon-phase-defs.js";
import {
  getMoonCycleDurationSec,
  getMoonPhaseAtSecond,
  getMoonPhaseDurationSec,
} from "./moon-phases.js";
import { advanceReplayStateOneSecond } from "./replay-second-runner.js";
import { deserializeGameState, serializeGameState } from "./state.js";

export function getLatestEdgeTransferBoundarySec(tSec, state = null) {
  const sec = Math.max(0, Math.floor(tSec ?? 0));
  const phaseDurationSec = getMoonPhaseDurationSec(state);
  const cycleSec = getMoonCycleDurationSec(state);
  const latestFor = (phaseIndex) => {
    const first = 1 + phaseIndex * phaseDurationSec;
    if (sec < first) return 0;
    return first + Math.floor((sec - first) / cycleSec) * cycleSec;
  };
  return Math.max(
    latestFor(MOON_PHASE_INDEX_BY_ID.food),
    latestFor(MOON_PHASE_INDEX_BY_ID.migration)
  );
}

function collectMigrationTransfers(postBoundaryState, boundarySec) {
  const byTransferId = new Map();
  for (const site of postBoundaryState?.world?.sites ?? []) {
    const settlement = site?.detailedState;
    if (!settlement) continue;
    const summaries = [];
    if (settlement.lastMeal?.tSec === boundarySec) {
      summaries.push(settlement.lastMeal.migration);
    }
    const currentMigration = postBoundaryState?.civilization?.currentMoonTurn
      ?.regions?.[site.regionId]?.migration;
    if (currentMigration?.tSec === boundarySec) {
      summaries.push(currentMigration);
    }
    for (const summary of summaries) {
      for (const movement of summary?.outbound ?? []) {
        if (!movement?.transferId || byTransferId.has(movement.transferId)) continue;
        byTransferId.set(movement.transferId, {
          transferId: movement.transferId,
          boundarySec,
          systemId: "migration",
          resourceId: "population",
          reason: movement.reason,
          sourceRegionId: movement.sourceRegionId,
          destinationRegionId: movement.destinationRegionId,
          amount: movement.amount,
          survivors: movement.survivors,
          arrivalDeaths: movement.arrivalDeaths,
        });
      }
    }
  }
  return [...byTransferId.values()];
}

export function buildEdgeTransferBatchAtBoundary(
  preBoundaryState,
  boundarySec
) {
  const sec = Math.max(0, Math.floor(boundarySec ?? 0));
  const phase = getMoonPhaseAtSecond(preBoundaryState, sec);
  const administrationTransfers =
    preBoundaryState?.runStatus?.complete !== true &&
    sec > 0 &&
    phase.boundary && phase.id === "food"
      ? planDetailedAdministrationMovesAtBoundary(
          preBoundaryState,
          sec
        ).map(
          (move, index) => ({
            transferId: `administrate:${sec}:${index}`,
            boundarySec: sec,
            systemId: "administrate",
            resourceId: "food",
            sourceRegionId: move.sourceId,
            destinationRegionId: move.destinationId,
            amount: move.amount,
          })
        )
      : [];
  let migrationTransfers = [];
  if (preBoundaryState?.runStatus?.complete !== true && sec > 0) {
    const replayState = deserializeGameState(serializeGameState(preBoundaryState));
    replayState.paused = false;
    const advanceResult = advanceReplayStateOneSecond(replayState);
    if (advanceResult?.ok && Math.floor(replayState.tSec ?? 0) === sec) {
      migrationTransfers = collectMigrationTransfers(replayState, sec);
    }
  }
  const transfers = [...administrationTransfers, ...migrationTransfers];
  return {
    batchId: `edge-transfers:${sec}`,
    boundarySec: sec,
    transfers,
  };
}
