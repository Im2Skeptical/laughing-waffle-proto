import { getVassalAge } from "../../model/vassal-life-map.js";
import { createText, roundedRect } from "../settlement-view-primitives.js";
import { PALETTE, TEXT_STYLES } from "../settlement-theme.js";
import {
  CURRENCY_COLOURS,
  MAX_RENDERED_WORKER_PAWNS,
  PRESSURE_COLOURS,
} from "./constants.js";

export function getWorkerIndicatorPresentation(
  activeCount,
  unusedCount = 0
) {
  const activeWorkerCount = Number.isFinite(activeCount)
    ? Math.max(0, Math.floor(activeCount))
    : 0;
  const unusedWorkerCount = Number.isFinite(unusedCount)
    ? Math.max(0, Math.floor(unusedCount))
    : 0;
  const totalWorkerCount = activeWorkerCount + unusedWorkerCount;
  let renderedActivePawnCount = Math.min(
    activeWorkerCount,
    MAX_RENDERED_WORKER_PAWNS
  );
  let renderedUnusedPawnCount = Math.min(
    unusedWorkerCount,
    MAX_RENDERED_WORKER_PAWNS - renderedActivePawnCount
  );
  if (
    unusedWorkerCount > 0 &&
    renderedUnusedPawnCount === 0 &&
    renderedActivePawnCount > 0
  ) {
    renderedActivePawnCount -= 1;
    renderedUnusedPawnCount = 1;
  }
  const renderedPawnCount =
    renderedActivePawnCount + renderedUnusedPawnCount;
  return {
    activeWorkerCount,
    unusedWorkerCount,
    totalWorkerCount,
    renderedActivePawnCount,
    renderedUnusedPawnCount,
    renderedPawnCount,
    badgeValue:
      totalWorkerCount > MAX_RENDERED_WORKER_PAWNS
        ? totalWorkerCount
        : null,
  };
}

function addPawnGlyph(
  parent,
  x,
  y,
  { color = PALETTE.text, alpha = 1, scale = 1 } = {}
) {
  const pawn = new PIXI.Graphics();
  pawn.lineStyle(2 * scale, 0x302d2a, Math.min(1, alpha + 0.1));
  pawn.beginFill(color, alpha);
  pawn.drawCircle(x, y - 6 * scale, 4 * scale);
  pawn.drawPolygon([
    x - 5 * scale, y + 8 * scale,
    x + 5 * scale, y + 8 * scale,
    x + 3 * scale, y - 1 * scale,
    x - 3 * scale, y - 1 * scale,
  ]);
  pawn.endFill();
  pawn.eventMode = "none";
  parent.addChild(pawn);
}

export function addWorkerIndicator(parent, point, activeWorkerCount, unusedWorkerCount) {
  const presentation = getWorkerIndicatorPresentation(
    activeWorkerCount,
    unusedWorkerCount
  );
  const renderedCount = presentation.renderedPawnCount;
  const displayCount = Math.max(1, renderedCount);
  const gap = 19;
  const pillWidth = displayCount * gap + 15;
  const pill = new PIXI.Graphics();
  roundedRect(
    pill,
    point.x - pillWidth / 2,
    point.y - 46,
    pillWidth,
    28,
    14,
    PALETTE.black,
    0x302d2a,
    2,
    0.62,
    0.75
  );
  pill.eventMode = "none";
  parent.addChild(pill);

  const startX = point.x - ((displayCount - 1) * gap) / 2;
  if (renderedCount === 0) {
    addPawnGlyph(parent, startX, point.y - 32, {
      color: PALETTE.textMuted,
      alpha: 0.28,
    });
  } else {
    for (
      let index = 0;
      index < presentation.renderedActivePawnCount;
      index += 1
    ) {
      addPawnGlyph(parent, startX + index * gap, point.y - 32, {
        color: PALETTE.accent,
      });
    }
    for (
      let index = 0;
      index < presentation.renderedUnusedPawnCount;
      index += 1
    ) {
      addPawnGlyph(
        parent,
        startX + (presentation.renderedActivePawnCount + index) * gap,
        point.y - 32,
        { color: PALETTE.text }
      );
    }
  }

  if (presentation.badgeValue != null) {
    const badgeX = startX + (renderedCount - 1) * gap + 7;
    const badgeY = point.y - 43;
    const badge = new PIXI.Graphics();
    badge.lineStyle(2, 0x302d2a, 1);
    badge.beginFill(PALETTE.accent, 1);
    badge.drawCircle(badgeX, badgeY, 10);
    badge.endFill();
    badge.eventMode = "none";
    parent.addChild(
      badge,
      createText(
        String(presentation.badgeValue),
        { ...TEXT_STYLES.chip, fontSize: 11, fill: 0x302d2a },
        badgeX,
        badgeY + 1,
        0.5,
        0.5
      )
    );
  }
}

function addStructureGlyph(parent, x, y, structureId) {
  const occupied = typeof structureId === "string";
  const building = new PIXI.Graphics();
  const color = occupied ? PALETTE.accent : PALETTE.textMuted;
  const alpha = occupied ? 1 : 0.3;
  building.lineStyle(2, color, occupied ? 1 : 0.65);

  if (occupied && structureId.toLowerCase().includes("granary")) {
    building.beginFill(color, alpha);
    building.drawRoundedRect(x - 6, y - 8, 12, 16, 4);
    building.endFill();
    building.moveTo(x - 7, y - 8);
    building.lineTo(x, y - 13);
    building.lineTo(x + 7, y - 8);
  } else {
    if (occupied) building.beginFill(color, alpha);
    building.drawRect(x - 7, y - 5, 14, 13);
    if (occupied) building.endFill();
    building.moveTo(x - 9, y - 5);
    building.lineTo(x, y - 13);
    building.lineTo(x + 9, y - 5);
  }

  building.lineStyle(2, color, alpha);
  building.moveTo(x - 9, y + 10);
  building.lineTo(x + 9, y + 10);
  building.eventMode = "none";
  parent.addChild(building);
}

export function addStructureIndicator(
  parent,
  point,
  structureSlots,
  { centered = false } = {}
) {
  const slots = Array.isArray(structureSlots) ? structureSlots : [];
  if (slots.length === 0) return;
  const filled=slots.filter(Boolean);
  if(!filled.length)return;
  const gap = 27;
  const pillWidth = slots.length * gap + 16;
  const verticalOffset = centered ? -34 : 0;
  const pill = new PIXI.Graphics();
  roundedRect(
    pill,
    point.x - pillWidth / 2,
    point.y + 18 + verticalOffset,
    pillWidth,
    32,
    8,
    PALETTE.black,
    0x302d2a,
    2,
    0.62,
    0.75
  );
  pill.eventMode = "none";
  parent.addChild(pill);
  const startX = point.x - ((slots.length - 1) * gap) / 2;
  slots.forEach((placement, index) => {
    if (!placement) return;
    const span = new PIXI.Graphics().lineStyle(1,0xa89164,.9).beginFill(0x30413b,.8)
      .drawRoundedRect(startX + index * gap - 12,point.y + 22 + verticalOffset,placement.width * gap - 3,27,3).endFill();
    span.eventMode = 'none'; parent.addChild(span);
    addStructureGlyph(
      parent,
      startX + (index + (placement.width - 1) / 2) * gap,
      point.y + 36 + verticalOffset,
      placement.structureId
    );
  });
}

export function addPlayerOwnershipMarker(parent, point, { selected = false } = {}) {
  const marker = new PIXI.Graphics();
  const radius = selected ? 17 : 14;
  marker.lineStyle(selected ? 5 : 3, selected ? PALETTE.text : 0x302d2a, 1);
  marker.beginFill(PALETTE.accent, 1);
  marker.drawCircle(point.x, point.y, radius);
  marker.endFill();
  marker.lineStyle(3, 0x302d2a, 1);
  marker.moveTo(point.x - 3, point.y + 7);
  marker.lineTo(point.x - 3, point.y - 8);
  marker.beginFill(0x302d2a, 1);
  marker.drawPolygon([
    point.x - 2, point.y - 8,
    point.x + 8, point.y - 4,
    point.x - 2, point.y,
  ]);
  marker.endFill();
  marker.eventMode = "none";
  parent.addChild(marker);
}

export function addActiveVassalMarker(parent, point, vassal, state) {
  const marker = new PIXI.Graphics();
  marker.lineStyle(4, 0x2b2721, 1);
  marker.beginFill(0x87c96a, 1);
  marker.drawCircle(point.x, point.y - 50, 18);
  marker.endFill();
  marker.lineStyle(3, 0xf4e7bd, 1);
  marker.drawCircle(point.x, point.y - 50, 11);
  marker.moveTo(point.x, point.y - 66);
  marker.lineTo(point.x, point.y - 35);
  marker.moveTo(point.x - 10, point.y - 50);
  marker.lineTo(point.x + 10, point.y - 50);
  marker.eventMode = "none";
  parent.addChild(
    marker,
    createText("VASSAL", {
      ...TEXT_STYLES.chip,
      fontSize: 11,
      fill: 0xf4e7bd,
    }, point.x, point.y - 79, 0.5, 0.5),
    createText(`Age ${getVassalAge(state, vassal)}`, {
      ...TEXT_STYLES.body,
      fontSize: 10,
      fill: PALETTE.text,
    }, point.x, point.y - 22, 0.5, 0.5)
  );
}

export function addSettlementPressureIndicator(parent, point, pressure) {
  const active = [
    pressure?.starvation === true ? "starvation" : null,
    pressure?.overcrowding === true ? "overcrowding" : null,
  ].filter(Boolean);
  if (active.length === 0) return;
  const gap = 30;
  const startX = point.x - ((active.length - 1) * gap) / 2;
  const y = point.y - 70;
  active.forEach((kind, index) => {
    const x = startX + index * gap;
    const glyph = new PIXI.Graphics();
    glyph.lineStyle(2, 0x302d2a, 1);
    if (kind === "starvation") {
      glyph.beginFill(PRESSURE_COLOURS.starvation, 1);
      glyph.drawPolygon([x, y - 13, x - 13, y + 11, x + 13, y + 11]);
      glyph.endFill();
      glyph.eventMode = "none";
      parent.addChild(
        glyph,
        createText("!", {
          ...TEXT_STYLES.title,
          fontSize: 16,
          fill: PALETTE.text,
        }, x, y + 3, 0.5, 0.5)
      );
      return;
    }
    glyph.beginFill(PRESSURE_COLOURS.overcrowding, 1);
    glyph.drawPolygon([
      x - 13, y - 2,
      x, y - 13,
      x + 13, y - 2,
      x + 10, y - 2,
      x + 10, y + 11,
      x - 10, y + 11,
      x - 10, y - 2,
    ]);
    glyph.endFill();
    glyph.beginFill(0x302d2a, 1);
    for (const offset of [-5, 0, 5]) glyph.drawCircle(x + offset, y + 3, 2.2);
    glyph.endFill();
    glyph.eventMode = "none";
    parent.addChild(glyph);
  });
}

export function addSettlementCurrencyIndicator(parent, point, { currency, currencySpent } = {}) {
  if (!Number.isFinite(currency)) return;
  const spending = Number(currencySpent ?? 0) > 0;
  const empty = currency <= 0;
  if (!spending && !empty) return;
  const kinds = [spending ? "spending" : null, empty ? "empty" : null].filter(Boolean);
  const gap = 30;
  const startX = point.x - ((kinds.length - 1) * gap) / 2;
  const y = point.y - 102;
  kinds.forEach((kind, index) => {
    const x = startX + index * gap;
    const glyph = new PIXI.Graphics();
    glyph.lineStyle(2, 0x302d2a, 1);
    glyph.beginFill(CURRENCY_COLOURS[kind], 1);
    glyph.drawCircle(x, y, 12);
    glyph.endFill();
    glyph.lineStyle(2.5, 0x302d2a, 1);
    if (kind === "spending") {
      glyph.moveTo(x, y - 7);
      glyph.lineTo(x, y + 6);
      glyph.moveTo(x - 5, y + 1);
      glyph.lineTo(x, y + 6);
      glyph.lineTo(x + 5, y + 1);
    } else {
      glyph.moveTo(x - 7, y - 7);
      glyph.lineTo(x + 7, y + 7);
    }
    glyph.eventMode = "none";
    parent.addChild(glyph);
  });
}
