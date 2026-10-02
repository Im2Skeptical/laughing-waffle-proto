import { MOON_PHASE_INDEX_BY_ID } from "../defs/gamesettings/moon-phase-defs.js";
import {
  getMoonCycleDurationSec,
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
    Math.min(sec, Math.max(0, Math.floor(state?.civilization?.practiceEvents?.stockTransfers?.tSec ?? 0))),
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
  let transfers = [];
  if (preBoundaryState?.runStatus?.complete !== true && sec > 0) {
    const replayState = deserializeGameState(serializeGameState(preBoundaryState));
    replayState.paused = false;
    const advanceResult = advanceReplayStateOneSecond(replayState);
    if (advanceResult?.ok && Math.floor(replayState.tSec ?? 0) === sec) {
      // Practice transfers can precede Food by one second. Keep that still-visible
      // packet when the next boundary replaces the batch, using its own timestamp.
      const previousStockBatch = preBoundaryState.civilization.practiceEvents?.stockTransfers;
      const stockBatch = replayState.civilization.practiceEvents?.stockTransfers;
      transfers = [...(previousStockBatch?.tSec > sec - 2 && previousStockBatch.tSec < sec ? previousStockBatch.transfers : []),
        ...(stockBatch?.tSec === sec ? stockBatch.transfers : []),
        ...collectMigrationTransfers(replayState, sec)];
    }
  }
  return {
    batchId: `edge-transfers:${sec}`,
    boundarySec: sec,
    transfers,
  };
}
