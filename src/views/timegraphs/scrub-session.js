import {
  clampForecastScrubTargetSec,
  reconcileLatchedForecastPreview,
} from "../timegraphs-helpers.js";

export function createScrubSession({
  forecastPreviewStatusNote = "Preview only - click Commit to jump",
} = {}) {
  return {
    isScrubbing: false,
    scrubSec: 0,
    latchedForecastScrubSec: null,
    statusNote: "",
    forecastPreviewStatusNote,
  };
}

export function setLatchedForecastScrub(session, sec) {
  session.latchedForecastScrubSec = Number.isFinite(sec)
    ? Math.max(0, Math.floor(sec))
    : null;
}

export function clearLatchedForecastScrub(session) {
  session.latchedForecastScrubSec = null;
}

export function beginScrubSession(session) {
  session.statusNote = "";
  session.isScrubbing = true;
}

export function releaseScrubSession(session) {
  if (!session.isScrubbing) return false;
  session.isScrubbing = false;
  return true;
}

export function pointerLocalXToSec(localX, plot, minSec, maxSec) {
  const ratio = (Number(localX) - plot.x) / Math.max(1, plot.w);
  return minSec + ratio * (maxSec - minSec);
}

export function clampScrubSecToRevealCap(
  targetSec,
  historyEndSec,
  revealCapSec,
  { minSec = 0, maxSec = Number.POSITIVE_INFINITY } = {}
) {
  return clampForecastScrubTargetSec(targetSec, historyEndSec, revealCapSec, {
    minSec,
    maxSec,
  });
}

export function resetForecastPreviewState(session, reveal) {
  session.isScrubbing = false;
  reveal.previewSec = null;
  reveal.previewLastRefreshMs = 0;
  clearLatchedForecastScrub(session);
  if (
    session.statusNote === "Forecast loading" ||
    session.statusNote === "Forecast revealing" ||
    session.statusNote === session.forecastPreviewStatusNote ||
    session.statusNote === "Preview only - click Commit to jump"
  ) {
    session.statusNote = "";
  }
}

export function syncLatchedForecastPreview(
  session,
  reveal,
  previewStatus,
  clampScrubSec
) {
  const isAutomaticRevealPreview =
    reveal.playheadFollowEnabled === true &&
    previewStatus?.active === true &&
    previewStatus?.isForecastPreview === true &&
    Number.isFinite(previewStatus?.previewSec) &&
    Number.isFinite(reveal.previewSec) &&
    Math.floor(previewStatus.previewSec) === Math.floor(reveal.previewSec);
  if (isAutomaticRevealPreview) {
    clearLatchedForecastScrub(session);
    return;
  }
  const synced = reconcileLatchedForecastPreview({
    previewStatus,
    statusNote: session.statusNote,
    latchedForecastScrubSec: session.latchedForecastScrubSec,
  });
  session.latchedForecastScrubSec = synced.latchedForecastScrubSec;
  session.statusNote = synced.statusNote;
  if (!session.isScrubbing && Number.isFinite(synced.forecastPreviewSec)) {
    session.scrubSec = clampScrubSec(synced.forecastPreviewSec);
  }
}

export function resolveLatchedForecastPreviewRestore(
  session,
  historyEndSec,
  revealCapSec
) {
  if (session.isScrubbing || !Number.isFinite(session.latchedForecastScrubSec)) {
    return "skip";
  }
  const historyEnd = Math.max(0, Math.floor(historyEndSec ?? 0));
  if (session.latchedForecastScrubSec <= historyEnd) {
    return "clear";
  }
  if (session.latchedForecastScrubSec > revealCapSec) {
    return "wait";
  }
  return "restore";
}
