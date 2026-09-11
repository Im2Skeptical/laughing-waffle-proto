import {
  TIMEGRAPH_CHROME,
  layoutTimegraphKey,
  drawTimegraphGlyph,
  getTimegraphGlyphInk,
} from "../timegraph-scroll-pixi.js";
import { MUCHA_UI_COLORS } from "../ui-helpers/mucha-ui-palette.js";

export function makeLegendSignature(seriesList) {
  if (!Array.isArray(seriesList) || !seriesList.length) return "";
  return seriesList
    .map((s) => {
      const id = String(s?.id ?? "");
      const color = Number.isFinite(s?.color) ? s.color : "";
      const icon = String(s?.legendIcon ?? "");
      const label = String(s?.legendLabel ?? s?.label ?? "");
      return `${id}:${color}:${icon}:${label}`;
    })
    .join("|");
}

export function getSeriesLegendTitle(seriesDef) {
  const label = String(seriesDef?.legendLabel ?? "").trim();
  if (label) return label;
  const fallback = String(seriesDef?.label ?? seriesDef?.id ?? "").trim();
  return fallback || "Series";
}

export function resolveKeyCabinetPage(seriesCount, requestedPage) {
  return layoutTimegraphKey(seriesCount, requestedPage);
}

export function sliceKeyCabinetPage(seriesList, layout) {
  const list = Array.isArray(seriesList) ? seriesList : [];
  return list.slice(
    layout.startIndex,
    layout.startIndex + TIMEGRAPH_CHROME.keyCapacity
  );
}

export function paintKeyCabinetStyles(entriesBySeriesId, hoveredLegendSeriesId) {
  const hasHovered =
    typeof hoveredLegendSeriesId === "string" && hoveredLegendSeriesId.length > 0;
  for (const [seriesId, entry] of entriesBySeriesId.entries()) {
    const isHovered = hasHovered && seriesId === hoveredLegendSeriesId;
    const lineColor = Number.isFinite(entry?.lineColor)
      ? entry.lineColor
      : MUCHA_UI_COLORS.accents.gold;
    entry.bg.clear();
    if (isHovered) entry.bg.lineStyle(1, 0xefc575, .85)
      .beginFill(0xe7b65b, .13).drawRoundedRect(-6, -1, 40, 30, 3).endFill();
    drawTimegraphGlyph(entry.bg, seriesId, getTimegraphGlyphInk(lineColor));
    entry.container.alpha = hasHovered && !isHovered ? 0.65 : 1;
  }
}
