// The timing facade must only compose passive readers. In particular, do not
// substitute the full debug/presentation APIs or runner state accessors here.
export function createSettlementTimingSnapshot({
  getLocalState, getRunner, getMap, getGraph, getLifeMap, getDecision, getProcessing, getRecap,
  getOpeningSnapshot, getArtwork,
}) {
  return (options = {}) => {
    const local = getLocalState();
    const runner = getRunner();
    const preview = runner?.getPreviewStatus();
    const timeline = runner?.getTimeline();
    const map = getMap();
    const graph = getGraph(options);
    const lifeMap = getLifeMap();
    const decision = getDecision();
    const processing = getProcessing();
    const recap = getRecap();
    const opening = getOpeningSnapshot?.();
    return {
      version: 2,
      mode: local.mode, selectedRegionId: local.selectedRegionId,
      regionSelectionActive: local.regionSelectionActive,
      runner: {
        frontierSec: preview?.historyEndSec ?? null, cursorSec: preview?.liveSec ?? null,
        viewedSec: preview == null ? null : preview.active ? preview.previewSec : preview.liveSec,
        previewActive: preview?.active ?? null, forecastPreview: preview?.isForecastPreview ?? null,
        revision: timeline?.revision ?? null, actionCount: timeline?.actions?.length ?? null,
        checkpointCount: timeline?.checkpoints?.length ?? null,
      },
      opening: {
        phase: opening?.phase ?? null, preparation: opening?.preparation ?? null,
        coverageSec: opening?.coverageSec ?? null, elapsedSec: opening?.elapsedSec ?? null,
        lossSec: opening?.lossSec ?? null,
      },
      map, graph,
      ...(options.includeArtwork === true ? { artwork: getArtwork?.() ?? null } : {}),
      life: {
        visible: lifeMap?.visible ?? null,
        selectedCandidateNodeId: lifeMap?.selectedCandidateNodeId ?? null,
        displayedVassalId: lifeMap?.displayedVassalId ?? null,
        entryConfirmationOpen: lifeMap?.entryConfirmationOpen ?? null,
        entryOpen: lifeMap?.entryOpen ?? null, entryVisible: lifeMap?.entryVisible ?? null,
        entryPhase: lifeMap?.entryPhase ?? null,
        decisionOpen: decision?.open ?? null, decisionNodeId: decision?.nodeId ?? null,
        decisionPhase: decision?.phase ?? null,
        pendingInteractionCount: decision?.pendingInteractionCount ?? null,
        family: decision?.family ?? null, selectedOptionId: decision?.selectedOptionId ?? null,
        resolving: decision?.resolving ?? null,
        shopTag: decision?.shopTag ?? null, offerIds: decision?.offerIds ?? null,
        purchaseOrder: decision?.purchaseOrder ?? null, boardPracticeIds: decision?.boardPracticeIds ?? null,
        observedDecisionNodeId: decision?.observedDecisionNodeId ?? null,
        boardRegionId: decision?.boardRegionId ?? null,
        decisionArtReady: decision?.artReady ?? null, decisionArtPrepared: decision?.artPrepared ?? null,
        entryPoint: lifeMap?.entryPoint ?? null,
        processingPhase: processing?.phase ?? null, sourceRevision: processing?.sourceRevision ?? null,
        ready: processing?.ready ?? null, processing,
        recapOpen: recap?.open ?? null, continueState: recap?.continueState ?? null,
        recapClock: recap?.clock ?? null, recapClockStartedAt: recap?.clockStartedAt ?? null,
      },
    };
  };
}
