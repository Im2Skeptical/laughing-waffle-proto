export function createPlotSnapshotCache() {
  return {
    key: "",
    snapshot: null,
    targetMaxSec: null,
  };
}

export function invalidatePlotSnapshot(cache) {
  cache.key = "";
  cache.snapshot = null;
  cache.targetMaxSec = null;
}

export function storePlotSnapshot(cache, snapshotKey, snapshot) {
  cache.key = snapshotKey;
  cache.snapshot = snapshot;
}

export function isPlotSnapshotCacheHit(cache, snapshotKey) {
  return !!cache.snapshot && cache.key === snapshotKey;
}

export function resolvePlotSnapshotTargetMaxSec(
  cache,
  rawTargetMaxSec,
  snapshotMinSec,
  leadSec
) {
  const minimumTargetMaxSec = Math.max(
    snapshotMinSec + 1,
    Math.floor(rawTargetMaxSec ?? snapshotMinSec + 1)
  );
  if (leadSec <= 0) {
    return minimumTargetMaxSec;
  }
  const currentTargetMaxSec = Number.isFinite(cache.targetMaxSec)
    ? Math.max(snapshotMinSec + 1, Math.floor(cache.targetMaxSec))
    : null;
  const shouldResetTarget =
    currentTargetMaxSec == null ||
    minimumTargetMaxSec > currentTargetMaxSec ||
    minimumTargetMaxSec < currentTargetMaxSec - leadSec;
  if (shouldResetTarget) {
    cache.targetMaxSec = minimumTargetMaxSec + leadSec;
  }
  return Math.max(minimumTargetMaxSec, Math.floor(cache.targetMaxSec));
}

export function quantizePlotSnapshotMinSec(minSec, quantumSec) {
  return Math.floor(Math.max(0, minSec) / quantumSec) * quantumSec;
}

export function quantizePlotSnapshotMaxSec(
  snapshotMinSec,
  snapshotTargetMaxSec,
  quantumSec
) {
  return (
    Math.ceil(
      Math.max(snapshotMinSec + 1, snapshotTargetMaxSec) / quantumSec
    ) * quantumSec
  );
}

export function buildPlotSnapshotKey({
  cacheVersion,
  snapshotMinSec,
  snapshotMaxSec,
  displayHistoryEndSec,
  zoomed,
  sampleCursorSec,
}) {
  return `${cacheVersion}|${snapshotMinSec}:${snapshotMaxSec}|${displayHistoryEndSec}|${
    zoomed ? 1 : 0
  }|${sampleCursorSec == null ? "stable" : sampleCursorSec}`;
}

export function isPreviousPlotSnapshotCompatible(
  snapshot,
  {
    freezeRevealedPlotPrefix,
    cacheVersion,
    snapshotMinSec,
    displayHistoryEndSec,
    zoomed,
    sampleCursorSec,
  } = {}
) {
  return (
    freezeRevealedPlotPrefix &&
    !!snapshot &&
    Number(snapshot?.data?.cacheVersion ?? -1) === cacheVersion &&
    Math.floor(snapshot?.snapshotMinSec ?? -1) === snapshotMinSec &&
    Math.floor(snapshot?.displayHistoryEndSec ?? -1) === displayHistoryEndSec &&
    Math.floor(snapshot?.zoomed ? 1 : 0) === (zoomed ? 1 : 0) &&
    Math.floor(snapshot?.sampleCursorSec ?? -1) ===
      Math.floor(sampleCursorSec ?? -1)
  );
}

export function resolvePlotSnapshotStablePrefixEndSec(
  snapshot,
  maxSec,
  displayHistoryEndSec
) {
  if (!Number.isFinite(snapshot?.visibleForecastCoverageEndSec)) {
    return null;
  }
  return Math.min(
    maxSec,
    Math.max(
      displayHistoryEndSec,
      Math.floor(snapshot.visibleForecastCoverageEndSec)
    )
  );
}
