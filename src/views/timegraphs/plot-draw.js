import {
  TIME_STATE_COLORS,
  TIME_STATE_GRAPH_BG_ALPHA,
} from "../layout-pixi.js";
import { getTimegraphInk } from "../timegraph-scroll-pixi.js";
import { blendColor, clamp01 } from "../timegraphs-helpers.js";
import {
  FORECAST_PENDING_ZONE_ALPHA,
  FORECAST_PREVIEW_MARKER_COLOR,
  FORECAST_REVEAL_MARKER_ALPHA,
  ITEM_UNAVAILABLE_ZONE_ALPHA,
  SERIES_LINE_ALPHA_DEFAULT,
  SERIES_LINE_ALPHA_DIMMED,
  SERIES_LINE_ALPHA_HOVERED,
  SERIES_LINE_WIDTH_DEFAULT,
  SERIES_LINE_WIDTH_DIMMED,
  SERIES_LINE_WIDTH_HOVERED,
  SERIES_SCALE_MAX_FLASH_COLOR,
  SERIES_SCALE_MAX_FLASH_DURATION_MS,
  SERIES_SCALE_MAX_FLASH_FRAME_MS,
  SERIES_SCALE_MAX_FLASH_WIDTH_BONUS,
  TIMEGRAPH_THEME,
} from "./constants.js";
import { getGridStep, timeToX, yForValue } from "./plot-math.js";

export function getSeriesScaleMaxFlashStrength(
  flashBySeriesId,
  seriesId,
  nowMs = performance.now()
) {
  const flash = flashBySeriesId.get(seriesId);
  if (!flash) return 0;
  const durationMs = Math.max(
    1,
    Number(flash.durationMs ?? SERIES_SCALE_MAX_FLASH_DURATION_MS)
  );
  const elapsedMs = Math.max(
    0,
    nowMs - Math.max(0, Number(flash.startedMs ?? nowMs))
  );
  if (elapsedMs >= durationMs) {
    flashBySeriesId.delete(seriesId);
    return 0;
  }
  const progress = clamp01(elapsedMs / durationMs);
  const pulse = 0.5 + 0.5 * Math.cos(progress * Math.PI * 2);
  return Math.max(0, (1 - progress) * (0.65 + 0.35 * pulse));
}

export function getSeriesScaleMaxFlashRenderKey(
  flashBySeriesId,
  nowMs = performance.now()
) {
  const parts = [];
  for (const [seriesId, flash] of flashBySeriesId.entries()) {
    const durationMs = Math.max(
      1,
      Number(flash.durationMs ?? SERIES_SCALE_MAX_FLASH_DURATION_MS)
    );
    const elapsedMs = Math.max(
      0,
      nowMs - Math.max(0, Number(flash.startedMs ?? nowMs))
    );
    if (elapsedMs >= durationMs) {
      flashBySeriesId.delete(seriesId);
      continue;
    }
    parts.push(
      `${seriesId}:${Math.floor(elapsedMs / SERIES_SCALE_MAX_FLASH_FRAME_MS)}`
    );
  }
  return parts.join("|");
}

export function drawZone(
  graphics,
  startSec,
  endSec,
  color,
  alpha,
  minSec,
  maxSec,
  plot
) {
  const start = Math.max(minSec, Math.min(maxSec, startSec));
  const end = Math.max(minSec, Math.min(maxSec, endSec));
  if (!(end > start)) return;
  const x0 = timeToX(start, minSec, maxSec, plot);
  const x1 = timeToX(end, minSec, maxSec, plot);
  const left = Math.max(plot.x, Math.min(x0, x1));
  const right = Math.min(plot.x + plot.w, Math.max(x0, x1));
  if (!(right > left)) return;
  graphics.beginFill(color, alpha);
  graphics.drawRect(left, plot.y, right - left, plot.h);
  graphics.endFill();
}

export function fillHistoryZones(
  graphics,
  {
    historyZones,
    itemUnavailableZones,
    renderedHistoryEndSec,
    lineDrawEndSec,
    minSec,
    maxSec,
    plot,
  }
) {
  const zoneAlpha = TIME_STATE_GRAPH_BG_ALPHA;
  for (const zone of historyZones) {
    if (zone.kind === "fixedHistory") {
      drawZone(
        graphics,
        zone.startSec,
        zone.endSec,
        TIME_STATE_COLORS.fixedHistory,
        zoneAlpha,
        minSec,
        maxSec,
        plot
      );
      continue;
    }
    if (zone.kind === "editableHistory") {
      drawZone(
        graphics,
        zone.startSec,
        zone.endSec,
        TIME_STATE_COLORS.editableHistory,
        zoneAlpha,
        minSec,
        maxSec,
        plot
      );
    }
  }
  drawZone(
    graphics,
    renderedHistoryEndSec,
    maxSec,
    TIME_STATE_COLORS.forecast,
    zoneAlpha,
    minSec,
    maxSec,
    plot
  );
  if (lineDrawEndSec < maxSec) {
    drawZone(
      graphics,
      lineDrawEndSec,
      maxSec,
      TIMEGRAPH_THEME.panelBorder,
      FORECAST_PENDING_ZONE_ALPHA,
      minSec,
      maxSec,
      plot
    );
  }
  for (const zone of itemUnavailableZones) {
    drawZone(
      graphics,
      zone.startSec,
      zone.endSec,
      TIME_STATE_COLORS.itemUnavailable,
      ITEM_UNAVAILABLE_ZONE_ALPHA,
      minSec,
      maxSec,
      plot
    );
  }
}

export function drawPlotGrid(graphics, minSec, maxSec, plot) {
  graphics.lineStyle(1, TIMEGRAPH_THEME.gridMajor, 0.5);
  graphics.drawRect(plot.x, plot.y, plot.w, plot.h);
  graphics.lineStyle(1, TIMEGRAPH_THEME.gridMinor, 0.2);
  const gridStep = getGridStep(maxSec - minSec, 12);
  const startGrid = Math.ceil(minSec / gridStep) * gridStep;
  for (let t = startGrid; t <= maxSec; t += gridStep) {
    const x = timeToX(t, minSec, maxSec, plot);
    if (x > plot.x && x < plot.x + plot.w) {
      graphics.moveTo(x, plot.y);
      graphics.lineTo(x, plot.y + plot.h);
    }
  }
}

export function drawSeriesLinesForRange(
  graphics,
  {
    sourceSeriesList,
    sourcePoints,
    sourceSeriesValues,
    drawStartSec,
    drawEndSec,
    colorResolver = null,
    alphaMultiplier = 1,
    enableScaleMaxFlash = false,
    minSec,
    maxSec,
    plot,
    seriesScaleRanges,
    hoveredLegendSeriesId,
    getFlashStrength = null,
  } = {}
) {
  const list = Array.isArray(sourceSeriesList) ? sourceSeriesList : [];
  const points = Array.isArray(sourcePoints) ? sourcePoints : [];
  if (!list.length || !points.length) return;
  const clampedDrawStartSec = Math.max(
    minSec,
    Math.floor(drawStartSec ?? minSec)
  );
  const clampedDrawEndSec = Math.max(
    clampedDrawStartSec,
    Math.min(maxSec, Math.floor(drawEndSec ?? maxSec))
  );
  if (clampedDrawEndSec <= clampedDrawStartSec) return;

  const hasHoveredSeries =
    typeof hoveredLegendSeriesId === "string" &&
    hoveredLegendSeriesId.length > 0;

  for (const s of list) {
    const baseLineColor = getTimegraphInk(s);
    const isHovered = hasHoveredSeries && s.id === hoveredLegendSeriesId;
    const lineWidth = hasHoveredSeries
      ? isHovered
        ? SERIES_LINE_WIDTH_HOVERED
        : SERIES_LINE_WIDTH_DIMMED
      : SERIES_LINE_WIDTH_DEFAULT;
    const baseAlpha = hasHoveredSeries
      ? isHovered
        ? SERIES_LINE_ALPHA_HOVERED
        : SERIES_LINE_ALPHA_DIMMED
      : SERIES_LINE_ALPHA_DEFAULT;
    const resolvedLineColor =
      typeof colorResolver === "function"
        ? colorResolver(baseLineColor, s)
        : baseLineColor;
    const flashStrength =
      enableScaleMaxFlash === true && typeof getFlashStrength === "function"
        ? getFlashStrength(s.id)
        : 0;
    const lineColor =
      flashStrength > 0
        ? blendColor(
            resolvedLineColor,
            SERIES_SCALE_MAX_FLASH_COLOR,
            Math.min(0.82, flashStrength)
          )
        : resolvedLineColor;
    const flashLineWidth =
      flashStrength > 0
        ? lineWidth + SERIES_SCALE_MAX_FLASH_WIDTH_BONUS * flashStrength
        : lineWidth;
    const resolvedLineAlpha = Math.max(
      0,
      Math.min(
        1,
        baseAlpha * Math.max(0, Number(alphaMultiplier ?? 1)) +
          flashStrength * 0.18
      )
    );
    graphics.lineStyle(flashLineWidth, lineColor, resolvedLineAlpha);

    const values = sourceSeriesValues?.get?.(s.id) ?? [];
    let first = true;
    let prevFinitePoint = null;

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const t = Math.max(0, Math.floor(p?.tSec ?? 0));
      const value = values[i];
      if (!Number.isFinite(value)) {
        first = true;
        prevFinitePoint = null;
        continue;
      }

      if (t < clampedDrawStartSec) {
        prevFinitePoint = { t, value };
        continue;
      }

      if (first && prevFinitePoint && prevFinitePoint.t < clampedDrawStartSec) {
        const ratio =
          (clampedDrawStartSec - prevFinitePoint.t) /
          Math.max(1e-6, t - prevFinitePoint.t);
        const interpolatedValue =
          prevFinitePoint.value +
          (value - prevFinitePoint.value) * ratio;
        graphics.moveTo(
          timeToX(clampedDrawStartSec, minSec, maxSec, plot),
          yForValue(interpolatedValue, s.id, seriesScaleRanges, plot)
        );
        graphics.lineTo(
          timeToX(t, minSec, maxSec, plot),
          yForValue(value, s.id, seriesScaleRanges, plot)
        );
        first = false;
        prevFinitePoint = { t, value };
        if (t >= clampedDrawEndSec) break;
        continue;
      }

      if (t > clampedDrawEndSec) {
        if (
          prevFinitePoint &&
          Number.isFinite(prevFinitePoint.t) &&
          prevFinitePoint.t < clampedDrawEndSec
        ) {
          const ratio =
            (clampedDrawEndSec - prevFinitePoint.t) /
            Math.max(1e-6, t - prevFinitePoint.t);
          const interpolatedValue =
            prevFinitePoint.value +
            (value - prevFinitePoint.value) * ratio;
          const x = timeToX(clampedDrawEndSec, minSec, maxSec, plot);
          const y = yForValue(
            interpolatedValue,
            s.id,
            seriesScaleRanges,
            plot
          );
          if (first) {
            graphics.moveTo(x, y);
          } else {
            graphics.lineTo(x, y);
          }
        } else if (!first) {
          graphics.lineTo(
            timeToX(clampedDrawEndSec, minSec, maxSec, plot),
            yForValue(
              prevFinitePoint?.value ?? value,
              s.id,
              seriesScaleRanges,
              plot
            )
          );
        }
        first = true;
        break;
      }

      const x = timeToX(t, minSec, maxSec, plot);
      const y = yForValue(value, s.id, seriesScaleRanges, plot);
      if (first) {
        graphics.moveTo(x, y);
        first = false;
      } else {
        graphics.lineTo(x, y);
      }
      prevFinitePoint = { t, value };
    }

    if (
      !first &&
      prevFinitePoint &&
      Number.isFinite(prevFinitePoint.t) &&
      prevFinitePoint.t < clampedDrawEndSec
    ) {
      graphics.lineTo(
        timeToX(clampedDrawEndSec, minSec, maxSec, plot),
        yForValue(prevFinitePoint.value, s.id, seriesScaleRanges, plot)
      );
    }
  }
}

export function drawForecastRevealMarker(
  graphics,
  lineDrawEndSec,
  maxSec,
  minSec,
  plot
) {
  if (!(lineDrawEndSec < maxSec)) return;
  const markerX = timeToX(lineDrawEndSec, minSec, maxSec, plot);
  graphics.lineStyle(
    2,
    TIMEGRAPH_THEME.forecastMarker,
    FORECAST_REVEAL_MARKER_ALPHA
  );
  graphics.moveTo(markerX, plot.y + 1);
  graphics.lineTo(markerX, plot.y + plot.h - 1);
  graphics.beginFill(TIMEGRAPH_THEME.forecastMarker, 0.98);
  graphics.drawCircle(markerX, plot.y + 7, 4);
  graphics.endFill();
  graphics.beginFill(TIMEGRAPH_THEME.forecastMarker, 0.42);
  graphics.drawRect(markerX, plot.y, 2, plot.h);
  graphics.endFill();
}

export function drawActionMarkers(
  graphics,
  markerSecs,
  minSec,
  maxSec,
  plot
) {
  const secs = Array.isArray(markerSecs) ? markerSecs : [];
  if (!secs.length) return;
  graphics.beginFill(TIMEGRAPH_THEME.actionMarker);
  graphics.lineStyle(0);
  for (const t of secs) {
    if (t >= minSec && t <= maxSec) {
      const x = timeToX(t, minSec, maxSec, plot);
      graphics.drawCircle(x, plot.y + plot.h - 3, 3);
    }
  }
  graphics.endFill();
}

export function drawEventMarkers(graphics, eventMarkers, minSec, maxSec, plot) {
  const markers = Array.isArray(eventMarkers) ? eventMarkers : [];
  for (const marker of markers) {
    const x = timeToX(marker.tSec, minSec, maxSec, plot);
    const color = Number.isFinite(marker?.color)
      ? marker.color
      : marker.severity === "critical"
        ? TIMEGRAPH_THEME.eventMarkerCritical
        : TIMEGRAPH_THEME.eventMarkerNormal;
    const lineAlpha = Number.isFinite(marker?.alpha)
      ? marker.alpha
      : marker.severity === "critical"
        ? 0.72
        : 0.9;
    const markerRadius = Number.isFinite(marker?.radius)
      ? marker.radius
      : marker.severity === "critical"
        ? 4
        : 2.5;
    const markerLineWidth = Number.isFinite(marker?.lineWidth)
      ? marker.lineWidth
      : 1;
    if (marker.severity === "critical") {
      graphics.lineStyle(markerLineWidth, color, lineAlpha);
      graphics.moveTo(x, plot.y + 1);
      graphics.lineTo(x, plot.y + plot.h - 1);
      graphics.beginFill(color, Math.max(0.3, lineAlpha));
      graphics.drawCircle(x, plot.y + 7, markerRadius);
      graphics.endFill();
      continue;
    }
    graphics.beginFill(color, lineAlpha);
    graphics.drawCircle(x, plot.y + 8, markerRadius);
    graphics.endFill();
  }
}

export function drawBootFadeOverlay(graphics, bootFadeState, plot) {
  if (!bootFadeState) return;
  graphics.beginFill(bootFadeState.color, bootFadeState.alpha);
  graphics.drawRect(plot.x, plot.y, plot.w, plot.h);
  graphics.endFill();
}

export function drawScrubMarkers(
  graphics,
  {
    scrubSec,
    curT,
    isScrubbing,
    hasForecastPreview,
    minSec,
    maxSec,
    plot,
  }
) {
  const x = timeToX(scrubSec, minSec, maxSec, plot);
  const color = isScrubbing
    ? TIMEGRAPH_THEME.textPrimary
    : hasForecastPreview
      ? FORECAST_PREVIEW_MARKER_COLOR
      : TIMEGRAPH_THEME.scrubMarker;
  graphics.lineStyle(1, color, 0.8);
  graphics.moveTo(x, plot.y);
  graphics.lineTo(x, plot.y + plot.h);

  if (isScrubbing && Math.abs(scrubSec - curT) > 0) {
    const cx = timeToX(curT, minSec, maxSec, plot);
    if (cx >= plot.x && cx <= plot.x + plot.w) {
      graphics.lineStyle(1, TIMEGRAPH_THEME.scrubLiveMarker, 0.5);
      graphics.moveTo(cx, plot.y);
      graphics.lineTo(cx, plot.y + plot.h);
    }
  }
}
