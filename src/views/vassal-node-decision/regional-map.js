// Regional-preview panel for travel/route node decisions.

import { addRegionTerrain } from "../chronicle-art.js";
import { createText } from "../settlement-view-primitives.js";
import { PALETTE, TEXT_STYLES } from "../settlement-theme.js";

const REGION_COLORS = Object.freeze({
  red: 0xa85d52, blue: 0x587f9e, green: 0x668d63, yellow: 0xb19a57,
  purple: 0x80668f, orange: 0xb77d4f, black: 0x555750, white: 0xb7b5a8,
});

function drawDashedLine(gfx, from, to, length = 12, gap = 7) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (!distance) return;
  for (let cursor = 0; cursor < distance; cursor += length + gap) {
    const end = Math.min(distance, cursor + length);
    gfx.moveTo(from.x + dx * cursor / distance, from.y + dy * cursor / distance);
    gfx.lineTo(from.x + dx * end / distance, from.y + dy * end / distance);
  }
}

export function renderRegionalMap(parent, map, rect) {
  parent.addChild(createText("REGIONAL PREVIEW", {
    ...TEXT_STYLES.header, fontSize: 22,
  }, rect.x, rect.y));
  if (!map?.regions?.length) {
    parent.addChild(createText("No regional preview is available.", {
      ...TEXT_STYLES.body, fontSize: 17, fill: PALETTE.textMuted,
    }, rect.x, rect.y + 42));
    return;
  }
  const points = map.regions.flatMap((region) => region.polygon ?? []);
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const mapRect = { x: rect.x, y: rect.y + 42, width: rect.width, height: rect.height - 112 };
  const scale = Math.min(
    (mapRect.width - 40) / Math.max(1, maxX - minX),
    (mapRect.height - 40) / Math.max(1, maxY - minY)
  );
  const offsetX = mapRect.x + (mapRect.width - (maxX - minX) * scale) / 2 - minX * scale;
  const offsetY = mapRect.y + (mapRect.height - (maxY - minY) * scale) / 2 - minY * scale;
  const project = (point) => ({ x: offsetX + point.x * scale, y: offsetY + point.y * scale });
  const byId = new Map(map.regions.map((region) => [region.regionId, region]));
  const gfx = new PIXI.Graphics();
  for (const region of map.regions) {
    const polygon = (region.polygon ?? []).flatMap((point) => {
      const projected = project(point);
      return [projected.x, projected.y];
    });
    if (polygon.length < 6) continue;
    addRegionTerrain(parent,polygon,region.colour,region.controller==='player'?.9:.6);
    gfx.lineStyle(region.current ? 4 : region.selected ? 3 : 1,
      region.current ? PALETTE.accent : region.selected ? PALETTE.green : PALETTE.stroke, 1);
    gfx.beginFill(REGION_COLORS[region.colour] ?? REGION_COLORS.black,
      region.controller === "player" ? 0.08 : 0.12);
    gfx.drawPolygon(polygon).endFill();
  }
  for (const connection of map.connections ?? []) {
    const left = byId.get(connection.regionAId);
    const right = byId.get(connection.regionBId);
    if (!left || !right) continue;
    const from = project(left.labelPoint);
    const to = project(right.labelPoint);
    const preview = connection.status.startsWith("preview-");
    const removal = connection.status.endsWith("remove");
    const staged = connection.status.startsWith("staged-");
    const color = connection.onSelectedPath ? PALETTE.accent
      : removal ? 0xd17c70 : (preview || staged) ? PALETTE.green : 0xc3c2b2;
    gfx.lineStyle(connection.onSelectedPath ? 6 : preview ? 5 : staged ? 4 : 2, color,
      removal ? 0.72 : 0.92);
    if (preview || staged) drawDashedLine(gfx, from, to);
    else gfx.moveTo(from.x, from.y).lineTo(to.x, to.y);
  }
  parent.addChild(gfx);
  for (const region of map.regions) {
    const point = project(region.labelPoint);
    parent.addChild(createText(region.reference ?? region.name ?? region.regionId, {
      ...TEXT_STYLES.chip, fontSize: region.current ? 15 : 12,
      fill: region.current ? PALETTE.accent : PALETTE.text,
      stroke: 0x242824, strokeThickness: 4,
    }, point.x, point.y, 0.5, 0.5));
  }
  const route = map.selectedPath?.length > 1
    ? `${map.selectedPath.map((id) => byId.get(id)?.reference ?? id).join(" → ")} · ${map.distance} edges`
    : "Hover or select an offer to preview its effect.";
  parent.addChild(createText(route, {
    ...TEXT_STYLES.body, fontSize: 15, fill: PALETTE.textMuted,
    wordWrap: true, wordWrapWidth: rect.width,
  }, rect.x, rect.y + rect.height - 56));
}
