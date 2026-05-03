import {
  perfEnabled,
  perfNowMs,
  recordSettlementForecastLag,
  recordSettlementLossSearch,
} from "../model/perf.js";
import {
  getSettlementCurrentVassal,
  getSettlementFirstSelectedVassal,
  getSettlementLatestSelectedVassalDeathSec,
  getSettlementYearDurationSec,
} from "../model/settlement-state.js";

function clampSec(value, fallback = 0) {
  if (!Number.isFinite(value)) return Math.max(0, Math.floor(fallback));
  return Math.max(0, Math.floor(value));
}

function clampPositiveInt(value, fallback = 1) {
  const safeFallback = Math.max(1, Math.floor(fallback));
  if (!Number.isFinite(value)) return safeFallback;
  return Math.max(1, Math.floor(value));
}

function quantizeSecUp(value, quantumSec) {
  const safeValue = clampSec(value, 0);
  const quantum = clampPositiveInt(quantumSec, 1);
  if (safeValue <= 0) return 0;
  return Math.ceil(safeValue / quantum) * quantum;
}

function quantizeSecDown(value, quantumSec) {
  const safeValue = clampSec(value, 0);
  const quantum = clampPositiveInt(quantumSec, 1);
  return Math.floor(safeValue / quantum) * quantum;
}

function isRunComplete(stateOrSummary) {
  return (
    stateOrSummary?.runComplete === true ||
    stateOrSummary?.runStatus?.complete === true
  );
}

function getLossInfoFromProbe(probe, fallbackSec = 0, fallbackYear = 1) {
  if (!probe || typeof probe !== "object") {
    return {
      lossSec: clampSec(fallbackSec, 0),
      lossYear: Math.max(1, Math.floor(fallbackYear ?? 1)),
    };
  }
  if (probe.runComplete === true) {
    return {
      lossSec: Number.isFinite(probe.runLossSec)
        ? clampSec(probe.runLossSec, fallbackSec)
        : clampSec(fallbackSec, 0),
      lossYear: Number.isFinite(probe.runLossYear)
        ? Math.max(1, Math.floor(probe.runLossYear))
        : Math.max(1, Math.floor(fallbackYear ?? 1)),
    };
  }
  return {
    lossSec: Number.isFinite(probe?.runStatus?.tSec)
      ? clampSec(probe.runStatus.tSec, fallbackSec)
      : clampSec(fallbackSec, 0),
    lossYear: Number.isFinite(probe?.runStatus?.year)
      ? Math.max(1, Math.floor(probe.runStatus.year))
      : Math.max(1, Math.floor(fallbackYear ?? 1)),
  };
}

function getLossYearAtSecond(state, tSec) {
  const yearDurationSec = clampPositiveInt(getSettlementYearDurationSec(state), 1);
  return 1 + Math.floor(clampSec(tSec, 0) / yearDurationSec);
}

export function createSettlementForecastController({
  getTimeline,
  ensureControllerCache,
  getControllerData,
  getControllerStateAt,
  getControllerStateDataAt,
  getControllerSummaryAt,
  getFrontierSec,
  getFrontierState,
  getViewedState,
  getViewedSec,
  getRevealedCoverageEndSec,
  getEffectiveGraphHorizonSec,
  setHorizonSecOverride,
  commitCursorSecond,
  browseCursorSecond,
  clearPreviewState,
  setPlaybackViewSec,
  graphWindowSec = 0,
  lossSearchCapacitySec = 0,
  autoCommitBufferSec = 0,
  autoCommitChunkSec = 0,
  autoCommitMinIntervalMs = 0,
  autoCommitForceLagSec = 0,
  dynamicDisplayBufferYears = 0,
  dynamicDisplayQuantumSec = 1,
  exactLossSearchBucketSec = 1,
  horizonUpdateQuantumSec = 1,
  horizonLeadBufferSec = 0,
  unresolvedBrowseLeadSec = 0,
} = {}) {
  let horizonOverrideSec = null;
  let projectedLossCacheKey = "";
  let projectedLossCacheValue = null;
  let maxObservedLossYear = null;
  let pendingCommitJob = null;

  function invalidateLossCache() {
    projectedLossCacheKey = "";
    projectedLossCacheValue = null;
  }

  function getComputedCoverageEndSec() {
    const historyEndSec = clampSec(getFrontierSec?.(), 0);
    const controllerData = getControllerData?.() ?? null;
    return Math.max(
      historyEndSec,
      clampSec(controllerData?.forecastCoverageEndSec, historyEndSec)
    );
  }

  function getBrowseCapSec() {
    const historyEndSec = clampSec(getFrontierSec?.(), 0);
    return Math.max(
      historyEndSec,
      clampSec(getRevealedCoverageEndSec?.(), historyEndSec)
    );
  }

  function getPendingCommitTargetSec(historyEndSec = getFrontierSec?.()) {
    const historyEnd = clampSec(historyEndSec, 0);
    if (!pendingCommitJob) return null;
    const targetSec = Number.isFinite(pendingCommitJob?.targetSec)
      ? Math.max(historyEnd, Math.floor(pendingCommitJob.targetSec))
      : Number.isFinite(pendingCommitJob?.deathSec)
        ? Math.max(historyEnd, Math.floor(pendingCommitJob.deathSec))
        : null;
    if (targetSec == null || targetSec <= historyEnd) return null;
    return targetSec;
  }

  function clearPendingCommitJob() {
    pendingCommitJob = null;
  }

  function getPendingCommitJob() {
    return pendingCommitJob
      ? {
          ...pendingCommitJob,
          startSec: clampSec(pendingCommitJob.startSec, 0),
          deathSec: clampSec(pendingCommitJob.deathSec, 0),
          targetSec: clampSec(pendingCommitJob.targetSec, 0),
        }
      : null;
  }

  function schedulePendingCommit(frontierSec, currentVassal) {
    const safeFrontierSec = clampSec(frontierSec, 0);
    const deathSec = Number.isFinite(currentVassal?.deathSec)
      ? Math.max(safeFrontierSec, Math.floor(currentVassal.deathSec))
      : safeFrontierSec;
    if (deathSec <= safeFrontierSec) {
      clearPendingCommitJob();
      return null;
    }
    pendingCommitJob = {
      startSec: safeFrontierSec,
      deathSec,
      targetSec: deathSec,
      lastCommitMs: Number.NEGATIVE_INFINITY,
      sourceVassalId:
        typeof currentVassal?.vassalId === "string" && currentVassal.vassalId.length > 0
          ? currentVassal.vassalId
          : null,
    };
    return getPendingCommitJob();
  }

  function probeSummaryAt(tSec, counters) {
    if (counters) counters.probes += 1;
    const summary = getControllerSummaryAt?.(tSec) ?? null;
    if (summary != null) return summary;
    return getControllerStateAt?.(tSec) ?? null;
  }

  function findLossInfoWithinRange(startSec, endSec, frontierState = getFrontierState?.()) {
    const searchPerfStartMs = perfEnabled() ? perfNowMs() : 0;
    const counters = { probes: 0 };
    const state = frontierState ?? null;
    const finalize = (result) => {
      if (perfEnabled()) {
        recordSettlementLossSearch({
          ms: perfNowMs() - searchPerfStartMs,
          probes: counters.probes,
        });
      }
      return result;
    };

    if (!state) {
      return finalize({ lossSec: null, lossYear: null, resolved: false });
    }

    const lowStartSec = clampSec(startSec, 0);
    const highEndSec = Math.max(lowStartSec, clampSec(endSec, lowStartSec));
    if (highEndSec <= lowStartSec) {
      return finalize({ lossSec: null, lossYear: null, resolved: false });
    }

    const stateAtEnd = probeSummaryAt(highEndSec, counters);
    if (!isRunComplete(stateAtEnd)) {
      return finalize({ lossSec: null, lossYear: null, resolved: false });
    }

    let lowSec = lowStartSec;
    let highSec = highEndSec;
    while (lowSec + 1 < highSec) {
      const midSec = lowSec + Math.floor((highSec - lowSec) * 0.5);
      const stateAtMid = probeSummaryAt(midSec, counters);
      if (isRunComplete(stateAtMid)) {
        highSec = midSec;
      } else {
        lowSec = midSec;
      }
    }

    const lossState = probeSummaryAt(highSec, counters) ?? stateAtEnd;
    const lossInfo = getLossInfoFromProbe(
      lossState,
      highSec,
      getLossYearAtSecond(state, highSec)
    );
    return finalize({
      lossSec: Math.max(lowStartSec, lossInfo.lossSec),
      lossYear: lossInfo.lossYear,
      resolved: true,
    });
  }

  function getProjectedLossInfo({ deferDuringPendingCommit = true } = {}) {
    const searchPerfStartMs = perfEnabled() ? perfNowMs() : 0;
    const counters = { probes: 0 };
    const finalize = (result) => {
      if (perfEnabled()) {
        recordSettlementLossSearch({
          ms: perfNowMs() - searchPerfStartMs,
          probes: counters.probes,
        });
      }
      return result;
    };

    const timeline = getTimeline?.() ?? null;
    if (!timeline) {
      return finalize({ lossSec: null, lossYear: null, resolved: false });
    }

    ensureControllerCache?.();

    const historyEndSec = clampSec(getFrontierSec?.(), 0);
    const computedCoverageEndSec = getComputedCoverageEndSec();
    const revisionHistoryKey = [
      clampSec(timeline?.revision, 0),
      historyEndSec,
    ].join("|");
    const resolvedCacheKey = `${revisionHistoryKey}|resolved`;
    if (
      projectedLossCacheKey === resolvedCacheKey &&
      projectedLossCacheValue?.resolved === true
    ) {
      return finalize(projectedLossCacheValue);
    }

    const frontierState = getFrontierState?.() ?? null;
    if (!frontierState) {
      const fallback = { lossSec: null, lossYear: null, resolved: false };
      projectedLossCacheKey = `${revisionHistoryKey}|missingFrontier`;
      projectedLossCacheValue = fallback;
      return finalize(fallback);
    }

    if (isRunComplete(frontierState)) {
      const lossSec = Number.isFinite(frontierState?.runStatus?.tSec)
        ? clampSec(frontierState.runStatus.tSec, historyEndSec)
        : historyEndSec;
      const resolved = {
        lossSec,
        lossYear: Number.isFinite(frontierState?.runStatus?.year)
          ? Math.max(1, Math.floor(frontierState.runStatus.year))
          : getLossYearAtSecond(frontierState, lossSec),
        resolved: true,
      };
      projectedLossCacheKey = resolvedCacheKey;
      projectedLossCacheValue = resolved;
      return finalize(resolved);
    }

    const pendingCommitTargetSec =
      deferDuringPendingCommit === true
        ? getPendingCommitTargetSec(historyEndSec)
        : null;
    if (pendingCommitTargetSec != null) {
      const deferred = { lossSec: null, lossYear: null, resolved: false };
      projectedLossCacheKey = `${revisionHistoryKey}|pending|${pendingCommitTargetSec}`;
      projectedLossCacheValue = deferred;
      return finalize(deferred);
    }

    const yearDurationSec = clampPositiveInt(getSettlementYearDurationSec(frontierState), 1);
    const currentYear = Number.isFinite(frontierState?.year)
      ? Math.max(1, Math.floor(frontierState.year))
      : getLossYearAtSecond(frontierState, historyEndSec);
    const searchLimitSec = Math.min(
      computedCoverageEndSec,
      historyEndSec +
        Math.max(
          clampSec(lossSearchCapacitySec, 0),
          clampSec(getEffectiveGraphHorizonSec?.(), 0)
        )
    );
    const unresolvedCacheKey = `${revisionHistoryKey}|unresolved|${quantizeSecDown(
      searchLimitSec,
      exactLossSearchBucketSec
    )}`;
    if (
      projectedLossCacheKey === unresolvedCacheKey &&
      projectedLossCacheValue
    ) {
      return finalize(projectedLossCacheValue);
    }
    if (searchLimitSec <= historyEndSec) {
      const unresolved = { lossSec: null, lossYear: null, resolved: false };
      projectedLossCacheKey = unresolvedCacheKey;
      projectedLossCacheValue = unresolved;
      return finalize(unresolved);
    }

    let lowSec = historyEndSec;
    let highSec = null;
    for (
      let year = currentYear + 1;
      getLossYearAtSecond(frontierState, (year - 1) * yearDurationSec) <=
        getLossYearAtSecond(frontierState, searchLimitSec);
      year += 1
    ) {
      const boundarySec = Math.min(searchLimitSec, Math.max(0, (year - 1) * yearDurationSec));
      if (boundarySec <= lowSec) continue;
      const stateAtBoundary = probeSummaryAt(boundarySec, counters);
      if (isRunComplete(stateAtBoundary)) {
        highSec = boundarySec;
        break;
      }
      if (boundarySec >= searchLimitSec) break;
    }
    if (highSec == null) {
      const stateAtLimit = probeSummaryAt(searchLimitSec, counters);
      if (isRunComplete(stateAtLimit)) {
        highSec = searchLimitSec;
      }
    }

    if (highSec == null) {
      const unresolved = { lossSec: null, lossYear: null, resolved: false };
      projectedLossCacheKey = unresolvedCacheKey;
      projectedLossCacheValue = unresolved;
      return finalize(unresolved);
    }

    while (lowSec + 1 < highSec) {
      const midSec = lowSec + Math.floor((highSec - lowSec) * 0.5);
      const stateAtMid = probeSummaryAt(midSec, counters);
      if (isRunComplete(stateAtMid)) {
        highSec = midSec;
      } else {
        lowSec = midSec;
      }
    }

    const lossState = probeSummaryAt(highSec, counters);
    const lossInfo = getLossInfoFromProbe(
      lossState,
      highSec,
      getLossYearAtSecond(frontierState, highSec)
    );
    const resolved = {
      lossSec: Math.max(historyEndSec, lossInfo.lossSec),
      lossYear: lossInfo.lossYear,
      resolved: true,
    };
    projectedLossCacheKey = resolvedCacheKey;
    projectedLossCacheValue = resolved;
    return finalize(resolved);
  }

  function getDynamicDisplayLossSec(frontierState = getFrontierState?.()) {
    if (!frontierState) return null;
    const frontierSec = clampSec(getFrontierSec?.(), 0);
    const browseCapSec = clampSec(getBrowseCapSec(), frontierSec);
    const computedCoverageEndSec = clampSec(
      getComputedCoverageEndSec(),
      frontierSec
    );
    const bufferSec =
      clampPositiveInt(getSettlementYearDurationSec(frontierState), 1) *
      clampPositiveInt(dynamicDisplayBufferYears, 1);
    const bufferedDisplayLossSec = Math.max(
      frontierSec,
      browseCapSec,
      browseCapSec + bufferSec
    );
    const rawDisplayLossSec = Number.isFinite(computedCoverageEndSec)
      ? Math.max(
          frontierSec,
          browseCapSec,
          Math.min(bufferedDisplayLossSec, computedCoverageEndSec)
        )
      : bufferedDisplayLossSec;
    return Math.max(
      frontierSec,
      quantizeSecUp(rawDisplayLossSec, dynamicDisplayQuantumSec)
    );
  }

  function getDisplayedLossInfo() {
    const exactLossInfo = getProjectedLossInfo();
    const frontierState = getFrontierState?.() ?? null;
    if (!frontierState) {
      return exactLossInfo?.resolved === true
        ? exactLossInfo
        : { lossSec: null, lossYear: null, resolved: false, finalLossSec: null, finalLossYear: null };
    }
    const frontierSec = clampSec(getFrontierSec?.(), 0);
    const dynamicDisplayLossSec = getDynamicDisplayLossSec(frontierState);
    if (exactLossInfo?.resolved !== true) {
      if (!Number.isFinite(dynamicDisplayLossSec)) {
        return { lossSec: null, lossYear: null, resolved: false, finalLossSec: null, finalLossYear: null };
      }
      return {
        lossSec: Math.max(frontierSec, Math.floor(dynamicDisplayLossSec)),
        lossYear: getLossYearAtSecond(frontierState, dynamicDisplayLossSec),
        resolved: false,
        finalLossSec: null,
        finalLossYear: null,
      };
    }
    const uncappedResolvedLossSec = Math.max(
      frontierSec,
      clampSec(exactLossInfo?.lossSec, frontierSec)
    );
    const displayedLossSec = Number.isFinite(dynamicDisplayLossSec)
      ? Math.max(
          frontierSec,
          Math.min(
            uncappedResolvedLossSec,
            Math.floor(dynamicDisplayLossSec)
          )
        )
      : uncappedResolvedLossSec;
    return {
      lossSec: displayedLossSec,
      lossYear: getLossYearAtSecond(frontierState, displayedLossSec),
      resolved: true,
      finalLossSec: Number.isFinite(exactLossInfo?.lossSec)
        ? Math.floor(exactLossInfo.lossSec)
        : null,
      finalLossYear: Number.isFinite(exactLossInfo?.lossYear)
        ? Math.floor(exactLossInfo.lossYear)
        : null,
    };
  }

  function getLossInfoForDisplay() {
    const lossInfo = getDisplayedLossInfo();
    const candidateYears = [
      Number.isFinite(lossInfo?.lossYear) ? Math.floor(lossInfo.lossYear) : null,
      Number.isFinite(lossInfo?.finalLossYear) ? Math.floor(lossInfo.finalLossYear) : null,
    ].filter((value) => value != null);
    if (candidateYears.length > 0) {
      const bestKnownYear = candidateYears.reduce(
        (maxYear, value) => Math.max(maxYear, value),
        0
      );
      maxObservedLossYear =
        maxObservedLossYear == null
          ? bestKnownYear
          : Math.max(maxObservedLossYear, bestKnownYear);
    }
    return {
      ...lossInfo,
      maxLossYear:
        maxObservedLossYear == null
          ? null
          : Math.max(1, Math.floor(maxObservedLossYear)),
    };
  }

  function getCurrentVassalDeathState(frontierState = getFrontierState?.()) {
    const currentVassal = getSettlementCurrentVassal(frontierState);
    const deathSec = Number.isFinite(currentVassal?.deathSec)
      ? Math.max(0, Math.floor(currentVassal.deathSec))
      : null;
    const historyEndSec = clampSec(getFrontierSec?.(), 0);
    const computedCoverageEndSec = getComputedCoverageEndSec();
    const revealedCoverageEndSec = getBrowseCapSec();
    const currentVassalDeathComputed =
      deathSec != null &&
      Math.max(historyEndSec, computedCoverageEndSec) >= deathSec;
    const currentVassalDeathRevealed =
      deathSec != null &&
      Math.max(historyEndSec, revealedCoverageEndSec) >= deathSec;
    return {
      currentVassal,
      currentVassalDeathSec: deathSec,
      currentVassalDeathComputed,
      currentVassalDeathRevealed,
      currentVassalDeathResolved: currentVassalDeathRevealed,
    };
  }

  function getForecastStatus() {
    const historyEndSec = clampSec(getFrontierSec?.(), 0);
    const frontierState = getFrontierState?.() ?? null;
    const computedCoverageEndSec = getComputedCoverageEndSec();
    const revealedCoverageEndSec = getBrowseCapSec();
    const displayedLossInfo = getDisplayedLossInfo();
    const projectedLossInfo = getProjectedLossInfo();
    const pendingCommitTargetSec = getPendingCommitTargetSec(historyEndSec);
    const {
      currentVassal,
      currentVassalDeathSec,
      currentVassalDeathComputed,
      currentVassalDeathRevealed,
      currentVassalDeathResolved,
    } =
      getCurrentVassalDeathState(frontierState);
    const hasSelectedVassal = !!getSettlementFirstSelectedVassal(frontierState);
    const nextVassalEnabled =
      isRunComplete(frontierState) !== true &&
      (hasSelectedVassal !== true || !currentVassal || currentVassalDeathResolved === true);

    recordSettlementForecastLag({
      computedToRevealedLagSec: Math.max(0, computedCoverageEndSec - revealedCoverageEndSec),
      revealedToHistoryLagSec: Math.max(0, revealedCoverageEndSec - historyEndSec),
    });

    return {
      historyEndSec,
      computedCoverageEndSec,
      revealedCoverageEndSec,
      browseCapSec: revealedCoverageEndSec,
      displayedLossSec: Number.isFinite(displayedLossInfo?.lossSec)
        ? Math.max(historyEndSec, Math.floor(displayedLossInfo.lossSec))
        : null,
      displayedLossYear: Number.isFinite(displayedLossInfo?.lossYear)
        ? Math.max(1, Math.floor(displayedLossInfo.lossYear))
        : null,
      projectedLossSec: Number.isFinite(projectedLossInfo?.lossSec)
        ? Math.max(historyEndSec, Math.floor(projectedLossInfo.lossSec))
        : null,
      projectedLossYear: Number.isFinite(projectedLossInfo?.lossYear)
        ? Math.max(1, Math.floor(projectedLossInfo.lossYear))
        : null,
      projectedLossResolved: projectedLossInfo?.resolved === true,
      currentVassalDeathSec,
      currentVassalDeathComputed,
      currentVassalDeathRevealed,
      currentVassalDeathResolved,
      pendingCommitTargetSec,
      nextVassalEnabled,
    };
  }

  function getVisibleVassalTimeSec(state = null) {
    const currentState = state ?? getViewedState?.() ?? null;
    const committedSec = clampSec(currentState?.tSec, getFrontierSec?.());
    const currentVassal = getSettlementCurrentVassal(currentState);
    if (!currentVassal) return committedSec;
    const visibleSec = Math.max(committedSec, getBrowseCapSec());
    const deathSec = Number.isFinite(currentVassal?.deathSec)
      ? Math.max(0, Math.floor(currentVassal.deathSec))
      : null;
    if (deathSec == null) return visibleSec;
    return Math.min(visibleSec, deathSec);
  }

  function getRenderedHistoryEndSec({
    actualHistoryEndSec = null,
    displayHistoryEndSec = null,
    revealedCoverageEndSec = null,
  } = {}) {
    const safeActualHistoryEndSec = Number.isFinite(actualHistoryEndSec)
      ? Math.max(0, Math.floor(actualHistoryEndSec))
      : clampSec(getFrontierSec?.(), 0);
    const safeDisplayHistoryEndSec = Number.isFinite(displayHistoryEndSec)
      ? Math.max(0, Math.floor(displayHistoryEndSec))
      : safeActualHistoryEndSec;
    const safeRevealedCoverageEndSec = Number.isFinite(revealedCoverageEndSec)
      ? Math.max(safeDisplayHistoryEndSec, Math.floor(revealedCoverageEndSec))
      : safeDisplayHistoryEndSec;
    const frontierState = getFrontierState?.() ?? null;
    const currentVassal = getSettlementCurrentVassal(frontierState);
    if (!currentVassal) {
      return safeDisplayHistoryEndSec;
    }
    const deathSec = Number.isFinite(currentVassal?.deathSec)
      ? Math.max(0, Math.floor(currentVassal.deathSec))
      : null;
    if (deathSec == null) {
      return safeRevealedCoverageEndSec;
    }
    return Math.max(
      safeDisplayHistoryEndSec,
      Math.min(safeRevealedCoverageEndSec, deathSec)
    );
  }

  function syncHorizon() {
    const frontierState = getFrontierState?.() ?? null;
    const historyEndSec = clampSec(getFrontierSec?.(), 0);
    const latestDeathSec = getSettlementLatestSelectedVassalDeathSec(frontierState);
    const forecastStatus = getForecastStatus();
    const displayedLossInfo = getDisplayedLossInfo();
    const displayedLossSec = Number.isFinite(displayedLossInfo?.lossSec)
      ? Math.max(historyEndSec, Math.floor(displayedLossInfo.lossSec))
      : historyEndSec;
    let requiredHorizonSec = 0;

    if (forecastStatus.pendingCommitTargetSec != null) {
      requiredHorizonSec = Math.max(
        0,
        latestDeathSec - historyEndSec,
        forecastStatus.pendingCommitTargetSec - historyEndSec,
        forecastStatus.browseCapSec - historyEndSec
      );
    } else if (forecastStatus.projectedLossResolved === true) {
      requiredHorizonSec = Math.max(
        0,
        latestDeathSec - historyEndSec,
        clampSec(forecastStatus.projectedLossSec, historyEndSec) - historyEndSec
      );
    } else {
      const unresolvedBrowseLead = clampSec(unresolvedBrowseLeadSec, 0);
      requiredHorizonSec = Math.max(
        0,
        latestDeathSec - historyEndSec,
        displayedLossSec - historyEndSec,
        forecastStatus.browseCapSec - historyEndSec + unresolvedBrowseLead
      );
    }

    const currentAppliedHorizonSec =
      horizonOverrideSec != null
        ? Math.max(0, Math.floor(horizonOverrideSec))
        : clampSec(graphWindowSec, 0);
    const leadBufferSec = clampSec(horizonLeadBufferSec, 0);
    let bufferedRequiredHorizonSec = requiredHorizonSec;
    if (
      forecastStatus.pendingCommitTargetSec == null &&
      forecastStatus.projectedLossResolved !== true
    ) {
      if (requiredHorizonSec <= currentAppliedHorizonSec) {
        bufferedRequiredHorizonSec = currentAppliedHorizonSec;
      } else if (leadBufferSec > 0) {
        bufferedRequiredHorizonSec = requiredHorizonSec + leadBufferSec;
      }
    }

    const quantizedRequiredHorizonSec = quantizeSecUp(
      bufferedRequiredHorizonSec,
      horizonUpdateQuantumSec
    );
    horizonOverrideSec =
      quantizedRequiredHorizonSec > clampSec(graphWindowSec, 0)
        ? quantizedRequiredHorizonSec
        : null;
    setHorizonSecOverride?.(horizonOverrideSec);
    return horizonOverrideSec;
  }

  function getRevealMode() {
    return pendingCommitJob ? "pendingCommit" : "default";
  }

  function processPendingCommit({ clearForecastRevealRestart } = {}) {
    const job = pendingCommitJob;
    if (!job) return;

    const historyEndSec = clampSec(getFrontierSec?.(), 0);
    const frontierState = getFrontierState?.() ?? null;
    if (!frontierState || isRunComplete(frontierState)) {
      clearForecastRevealRestart?.();
      clearPendingCommitJob();
      return;
    }

    const currentVassal = getSettlementCurrentVassal(frontierState);
    if (!currentVassal) {
      clearForecastRevealRestart?.();
      clearPendingCommitJob();
      return;
    }

    if (
      job.sourceVassalId &&
      typeof currentVassal?.vassalId === "string" &&
      currentVassal.vassalId !== job.sourceVassalId
    ) {
      clearForecastRevealRestart?.();
      clearPendingCommitJob();
      return;
    }

    const pendingTargetSec = getPendingCommitTargetSec(historyEndSec);
    const finalTargetSec =
      pendingTargetSec != null
        ? pendingTargetSec
        : Math.max(historyEndSec, clampSec(job?.deathSec, historyEndSec));
    job.targetSec = finalTargetSec;

    if (historyEndSec >= finalTargetSec) {
      clearForecastRevealRestart?.();
      clearPendingCommitJob();
      return;
    }

    const browseCapSec = getBrowseCapSec();
    const bufferedRevealCommitCapSec = Math.max(
      historyEndSec,
      browseCapSec - clampSec(autoCommitBufferSec, 0)
    );
    const desiredCommitSec = Math.min(finalTargetSec, bufferedRevealCommitCapSec);
    if (desiredCommitSec <= historyEndSec) {
      return;
    }

    const nowMs = perfEnabled() ? perfNowMs() : Date.now();
    const lastCommitMs = Number.isFinite(job?.lastCommitMs)
      ? Number(job.lastCommitMs)
      : Number.NEGATIVE_INFINITY;
    const revealLagSec = Math.max(0, desiredCommitSec - historyEndSec);
    if (
      nowMs - lastCommitMs < Math.max(0, Number(autoCommitMinIntervalMs ?? 0)) &&
      revealLagSec < clampSec(autoCommitForceLagSec, 0)
    ) {
      return;
    }

    let commitTargetSec = Math.min(
      finalTargetSec,
      historyEndSec + clampPositiveInt(autoCommitChunkSec, 1),
      desiredCommitSec
    );
    if (commitTargetSec <= historyEndSec) {
      return;
    }

    const chunkLossInfo = findLossInfoWithinRange(
      historyEndSec,
      commitTargetSec,
      frontierState
    );
    if (chunkLossInfo?.resolved === true && Number.isFinite(chunkLossInfo?.lossSec)) {
      const resolvedLossSec = Math.max(historyEndSec, Math.floor(chunkLossInfo.lossSec));
      job.targetSec = Math.min(finalTargetSec, resolvedLossSec);
      commitTargetSec = Math.min(commitTargetSec, resolvedLossSec);
    }
    if (commitTargetSec <= historyEndSec) {
      return;
    }

    const viewedSec = clampSec(getViewedSec?.(), historyEndSec);
    const commitStateData =
      getControllerStateDataAt?.(commitTargetSec) ?? null;
    const commitRes = commitCursorSecond?.(commitTargetSec, commitStateData);
    if (commitRes?.ok !== true) {
      return;
    }
    job.lastCommitMs = nowMs;
    const clampedViewedSec = Math.max(0, Math.min(viewedSec, clampSec(getFrontierSec?.(), 0)));
    setPlaybackViewSec?.(clampedViewedSec);
    clearPreviewState?.();
    browseCursorSecond?.(clampedViewedSec);
    invalidateLossCache();

    const committedState = getFrontierState?.() ?? null;
    if (
      isRunComplete(committedState) ||
      (getSettlementCurrentVassal(committedState)?.isDead === true &&
        clampSec(getFrontierSec?.(), 0) >= finalTargetSec)
    ) {
      clearForecastRevealRestart?.();
      clearPendingCommitJob();
    }
  }

  return {
    invalidateLossCache,
    clearPendingCommitJob,
    getPendingCommitJob,
    schedulePendingCommit,
    getPendingCommitTargetSec,
    findLossInfoWithinRange,
    getProjectedLossInfo,
    getDisplayedLossInfo,
    getLossInfoForDisplay,
    getForecastStatus,
    getVisibleVassalTimeSec,
    getRenderedHistoryEndSec,
    getRevealMode,
    syncHorizon,
    processPendingCommit,
  };
}
