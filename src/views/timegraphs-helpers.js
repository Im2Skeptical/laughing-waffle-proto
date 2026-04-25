const HISTORY_ZONE_KIND_ORDER = {
  fixedHistory: 0,
  editableHistory: 1,
};

const EVENT_MARKER_SEVERITY_ORDER = {
  normal: 0,
  critical: 1,
};

export function resolveDefaultGraphScrubSec({
  currentSec,
  forecastPreviewSec,
  latchedForecastScrubSec,
} = {}) {
  if (Number.isFinite(latchedForecastScrubSec)) {
    return Math.max(0, Math.floor(latchedForecastScrubSec));
  }
  if (Number.isFinite(forecastPreviewSec)) {
    return Math.max(0, Math.floor(forecastPreviewSec));
  }
  return Math.max(0, Math.floor(currentSec ?? 0));
}

export function reconcileLatchedForecastPreview({
  previewStatus,
  statusNote,
  latchedForecastScrubSec,
} = {}) {
  const preview =
    previewStatus && typeof previewStatus === "object" ? previewStatus : null;
  const hasForecastPreview =
    preview?.active === true &&
    preview?.isForecastPreview === true &&
    Number.isFinite(preview?.previewSec);
  if (hasForecastPreview) {
    const previewSec = Math.max(0, Math.floor(preview.previewSec));
    return {
      latchedForecastScrubSec: previewSec,
      forecastPreviewSec: previewSec,
      statusNote,
    };
  }

  const waitingForForecastCoverage =
    statusNote === "Forecast loading" || statusNote === "Forecast revealing";
  if (waitingForForecastCoverage) {
    return {
      latchedForecastScrubSec: Number.isFinite(latchedForecastScrubSec)
        ? Math.max(0, Math.floor(latchedForecastScrubSec))
        : null,
      forecastPreviewSec: null,
      statusNote,
    };
  }

  return {
    latchedForecastScrubSec: null,
    forecastPreviewSec: null,
    statusNote:
      statusNote === "Preview only - click Commit to jump" ? "" : statusNote,
  };
}

export function clampForecastScrubTargetSec(
  targetSec,
  historyEndSec,
  revealCapSec,
  { minSec = 0, maxSec = Number.POSITIVE_INFINITY } = {}
) {
  const min = Math.max(0, Math.floor(minSec ?? 0));
  const max = Math.max(min, Math.floor(maxSec ?? min));
  const historyEnd = Math.max(0, Math.floor(historyEndSec ?? 0));
  const normalizedTarget = Math.max(
    min,
    Math.min(max, Math.floor(targetSec ?? min))
  );
  if (normalizedTarget <= historyEnd) return normalizedTarget;
  const revealCap = Math.max(
    historyEnd,
    Math.floor(revealCapSec ?? historyEnd)
  );
  return Math.max(min, Math.min(max, Math.min(normalizedTarget, revealCap)));
}

export function clamp01(v) {
  return Math.max(0, Math.min(1, Number(v ?? 0)));
}

export function lerpNumber(a, b, t) {
  const mix = clamp01(t);
  return Number(a ?? 0) + (Number(b ?? 0) - Number(a ?? 0)) * mix;
}

export function blendColor(baseColor, tintColor, strength = 0.18) {
  const mix = clamp01(strength);
  const inv = 1 - mix;
  const br = (baseColor >> 16) & 0xff;
  const bg = (baseColor >> 8) & 0xff;
  const bb = baseColor & 0xff;
  const tr = (tintColor >> 16) & 0xff;
  const tg = (tintColor >> 8) & 0xff;
  const tb = tintColor & 0xff;
  const nr = Math.round(br * inv + tr * mix);
  const ng = Math.round(bg * inv + tg * mix);
  const nb = Math.round(bb * inv + tb * mix);
  return (nr << 16) | (ng << 8) | nb;
}

export function normalizeHistoryZoneSegments(rawSegments, { minSec, maxSec, historyEndSec }) {
  const min = Math.max(0, Math.floor(minSec ?? 0));
  const max = Math.max(min, Math.floor(maxSec ?? min));
  const historyEnd = Math.max(0, Math.floor(historyEndSec ?? 0));
  const realizedEnd = Math.min(max, historyEnd);
  if (realizedEnd <= min) return [];

  const list = Array.isArray(rawSegments) ? rawSegments : [];
  const clipped = [];
  for (const entry of list) {
    const kind = String(entry?.kind ?? "");
    if (kind !== "fixedHistory" && kind !== "editableHistory") continue;
    const startSec = Math.max(min, Math.floor(entry?.startSec ?? min));
    const endSec = Math.min(realizedEnd, Math.floor(entry?.endSec ?? startSec));
    if (endSec <= startSec) continue;
    clipped.push({ kind, startSec, endSec });
  }
  if (!clipped.length) return [];

  clipped.sort(
    (a, b) =>
      a.startSec - b.startSec ||
      a.endSec - b.endSec ||
      (HISTORY_ZONE_KIND_ORDER[a.kind] ?? 99) -
        (HISTORY_ZONE_KIND_ORDER[b.kind] ?? 99)
  );

  const out = [];
  for (const entry of clipped) {
    const prev = out[out.length - 1];
    if (!prev) {
      out.push({ ...entry });
      continue;
    }
    if (entry.startSec < prev.endSec) {
      if (entry.kind === prev.kind) {
        prev.endSec = Math.max(prev.endSec, entry.endSec);
      } else {
        const clippedStart = prev.endSec;
        if (entry.endSec > clippedStart) {
          out.push({
            kind: entry.kind,
            startSec: clippedStart,
            endSec: entry.endSec,
          });
        }
      }
      continue;
    }
    if (entry.startSec === prev.endSec && entry.kind === prev.kind) {
      prev.endSec = Math.max(prev.endSec, entry.endSec);
      continue;
    }
    out.push({ ...entry });
  }

  return out;
}

export function normalizeItemUnavailableZones(rawSegments, { minSec, maxSec }) {
  const min = Math.max(0, Math.floor(minSec ?? 0));
  const max = Math.max(min, Math.floor(maxSec ?? min));
  const list = Array.isArray(rawSegments) ? rawSegments : [];
  const zones = [];

  for (const entry of list) {
    const kind = String(entry?.kind ?? "");
    if (kind !== "itemUnavailable") continue;
    const startSec = Math.max(min, Math.floor(entry?.startSec ?? min));
    const endSec = Math.min(max, Math.floor(entry?.endSec ?? startSec));
    if (endSec <= startSec) continue;
    zones.push({ startSec, endSec });
  }
  if (!zones.length) return [];

  zones.sort((a, b) => a.startSec - b.startSec || a.endSec - b.endSec);
  const out = [];
  for (const zone of zones) {
    const prev = out[out.length - 1];
    if (!prev) {
      out.push({ ...zone });
      continue;
    }
    if (zone.startSec <= prev.endSec) {
      prev.endSec = Math.max(prev.endSec, zone.endSec);
      continue;
    }
    out.push({ ...zone });
  }
  return out;
}

export function getSeriesValue(point, seriesId) {
  if (point?.values && point.values[seriesId] != null) {
    const v = point.values[seriesId];
    return Number.isFinite(v) ? v : 0;
  }
  if (seriesId === "gold") {
    const v = point?.gold ?? 0;
    return Number.isFinite(v) ? v : 0;
  }
  if (seriesId === "grain") {
    const v = point?.grain ?? 0;
    return Number.isFinite(v) ? v : 0;
  }
  return 0;
}

function resolveSeriesScaleMode(seriesDef) {
  return seriesDef?.scaleMode === "fixed" ? "fixed" : "dynamic";
}

function resolveSeriesScaleGroupId(seriesDef) {
  const explicitGroupId = String(seriesDef?.scaleGroupId ?? "").trim();
  if (explicitGroupId) return explicitGroupId;
  const seriesId = String(seriesDef?.id ?? "").trim();
  return seriesId || "__default__";
}

export function computeGraphSeriesScaleRanges(
  seriesList,
  seriesValues,
  { defaultMin = 0, defaultMax = 100 } = {}
) {
  const list = Array.isArray(seriesList) ? seriesList : [];
  const valuesBySeriesId = seriesValues instanceof Map ? seriesValues : new Map();
  const groupRanges = new Map();
  const seriesRanges = new Map();

  for (const seriesDef of list) {
    const seriesId = String(seriesDef?.id ?? "");
    if (!seriesId) continue;
    const groupId = resolveSeriesScaleGroupId(seriesDef);
    let groupRange = groupRanges.get(groupId);
    if (!groupRange) {
      groupRange = {
        groupId,
        scaleMode: resolveSeriesScaleMode(seriesDef),
        minValue: Number.isFinite(seriesDef?.scaleMin)
          ? Number(seriesDef.scaleMin)
          : Number(defaultMin),
        maxValue: Number.isFinite(seriesDef?.scaleMax)
          ? Number(seriesDef.scaleMax)
          : null,
        observedMaxValue: -Infinity,
      };
      groupRanges.set(groupId, groupRange);
    } else {
      if (groupRange.scaleMode !== "fixed" && resolveSeriesScaleMode(seriesDef) === "fixed") {
        groupRange.scaleMode = "fixed";
      }
      if (Number.isFinite(seriesDef?.scaleMin)) {
        groupRange.minValue = Number(seriesDef.scaleMin);
      }
      if (Number.isFinite(seriesDef?.scaleMax)) {
        groupRange.maxValue = Number(seriesDef.scaleMax);
      }
    }

    const values = valuesBySeriesId.get(seriesId);
    for (const value of Array.isArray(values) ? values : []) {
      if (!Number.isFinite(value)) continue;
      if (value > groupRange.observedMaxValue) {
        groupRange.observedMaxValue = value;
      }
    }
  }

  for (const seriesDef of list) {
    const seriesId = String(seriesDef?.id ?? "");
    if (!seriesId) continue;
    const groupRange = groupRanges.get(resolveSeriesScaleGroupId(seriesDef));
    if (!groupRange) continue;
    const minValue = Number.isFinite(groupRange.minValue)
      ? Number(groupRange.minValue)
      : Number(defaultMin);
    let maxValue = Number.isFinite(groupRange.maxValue)
      ? Number(groupRange.maxValue)
      : groupRange.observedMaxValue;
    if (!Number.isFinite(maxValue)) {
      maxValue = Number(defaultMax);
    }
    if (maxValue <= minValue) {
      maxValue = minValue + 1;
    }
    seriesRanges.set(seriesId, {
      groupId: groupRange.groupId,
      scaleMode: groupRange.scaleMode,
      minValue,
      maxValue,
    });
  }

  return seriesRanges;
}

export function normalizeEventMarkers(rawMarkers, { minSec, maxSec }) {
  const min = Math.max(0, Math.floor(minSec ?? 0));
  const max = Math.max(min, Math.floor(maxSec ?? min));
  const markers = Array.isArray(rawMarkers) ? rawMarkers : [];
  const out = [];
  const seen = new Set();

  for (const marker of markers) {
    const sec = Number.isFinite(marker?.tSec) ? Math.floor(marker.tSec) : null;
    if (sec == null || sec < min || sec > max) continue;
    const severity = marker?.severity === "critical" ? "critical" : "normal";
    const color = Number.isFinite(marker?.color) ? Math.floor(marker.color) : null;
    const lineWidth = Number.isFinite(marker?.lineWidth)
      ? Math.max(1, Number(marker.lineWidth))
      : null;
    const radius = Number.isFinite(marker?.radius)
      ? Math.max(1, Number(marker.radius))
      : null;
    const alpha = Number.isFinite(marker?.alpha)
      ? Math.max(0, Math.min(1, Number(marker.alpha)))
      : null;
    const dedupeKey = `${sec}:${severity}:${color ?? "default"}:${lineWidth ?? "default"}:${radius ?? "default"}:${alpha ?? "default"}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push({ tSec: sec, severity, color, lineWidth, radius, alpha });
  }

  out.sort(
    (a, b) =>
      a.tSec - b.tSec ||
      (EVENT_MARKER_SEVERITY_ORDER[a.severity] ?? 99) -
        (EVENT_MARKER_SEVERITY_ORDER[b.severity] ?? 99)
  );
  return out;
}
