import {
  getConnectedRegionIds,
  getRegionDefinition,
  getRegionReference,
  getRegionPolygon,
  getRegionState,
  getWorldDefinition,
} from "../model/world-state.js";
import {
  describeDetailedVassalIntervention,
  getDetailedCivilizationSummary,
  getDetailedSettlementViewModel,
  getDetailedVassalPrestige,
} from "../model/detailed-settlements.js";
import { SETTLEMENT_RESOURCE_COLOURS } from "../model/graph-metrics.js";
import {
  addCivilizationSurvivalStrip,
  getCivilizationSurvivalViewModel,
} from "./civilization-survival-hud.js";
import { clearChildren, createText, roundedRect } from "./settlement-view-primitives.js";
import { PALETTE, TEXT_STYLES } from "./settlement-theme.js";

const MAP_RECT = Object.freeze({ x: 58, y: 104, width: 1640, height: 704 });
const CIVILIZATION_RECT = Object.freeze({
  x: 1734,
  y: 104,
  width: 626,
  height: 126,
});
const DETAIL_RECT = Object.freeze({
  x: 1734,
  y: 246,
  width: 626,
  height: 562,
});
const REGION_COLOURS = Object.freeze({
  red: 0xb9574d, blue: 0x527da3, green: 0x638c62, black: 0x4d4d52,
});
const CONTROLLER_COLOURS = Object.freeze({
  player: 0xe8c96c, frontier: 0xd5d0c6, "external-a": 0xc17a57, "external-b": 0x8b72b1,
});
const MAX_RENDERED_WORKER_PAWNS = 5;
const EDGE_TRANSFER_PACKET_DURATION_MS = 900;
const EDGE_TRANSFER_PACKET_STAGGER_MS = 85;
const EDGE_TRANSFER_PACKET_MAX_ACTIVE = 36;
const REGION_DOUBLE_TAP_WINDOW_MS = 350;
const REGION_FLAG_DOUBLE_TAP_RADIUS = 48;
const EDGE_TRANSFER_RESOURCE_COLOURS = Object.freeze({
  food: SETTLEMENT_RESOURCE_COLOURS.food,
  population: SETTLEMENT_RESOURCE_COLOURS.totalPopulation,
});

export function getEdgeTransferPacketGlyphSpec(resourceId) {
  if (resourceId === "population") {
    return {
      color: EDGE_TRANSFER_RESOURCE_COLOURS.population,
      circles: [
        { forward: -0.1, side: 0, radius: 0.34 },
        { forward: -0.52, side: -0.34, radius: 0.3 },
        { forward: -0.52, side: 0.34, radius: 0.3 },
      ],
      triangleScale: 0.48,
    };
  }
  return {
    color: EDGE_TRANSFER_RESOURCE_COLOURS.food,
    circles: [
      { forward: -0.08, side: 0, radius: 0.32 },
      { forward: -0.48, side: -0.3, radius: 0.28 },
      { forward: -0.48, side: 0.3, radius: 0.28 },
    ],
    triangleScale: 0.44,
  };
}

function screenPoint(point) {
  return {
    x: MAP_RECT.x + Number(point?.x ?? 0) * MAP_RECT.width,
    y: MAP_RECT.y + Number(point?.y ?? 0) * MAP_RECT.height,
  };
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value ?? 0)));
}

export function resolveEdgeTransferPlaybackDirection(
  previousViewedSec,
  viewedSec
) {
  if (
    !Number.isFinite(previousViewedSec) ||
    !Number.isFinite(viewedSec)
  ) {
    return 1;
  }
  if (Math.floor(previousViewedSec) === Math.floor(viewedSec)) return 0;
  return Math.floor(viewedSec) < Math.floor(previousViewedSec) ? -1 : 1;
}

export function getEdgeTransferPacketPose({
  from,
  to,
  progress,
  laneOffset = 0,
} = {}) {
  const start = {
    x: Number(from?.x ?? 0),
    y: Number(from?.y ?? 0),
  };
  const end = {
    x: Number(to?.x ?? start.x),
    y: Number(to?.y ?? start.y),
  };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.max(0.0001, Math.hypot(dx, dy));
  const directionX = dx / length;
  const directionY = dy / length;
  const easedProgress = (() => {
    const t = clamp01(progress);
    return t * t * (3 - 2 * t);
  })();
  const offset = Number(laneOffset ?? 0);
  return {
    x:
      start.x +
      dx * easedProgress -
      directionY * offset,
    y:
      start.y +
      dy * easedProgress +
      directionX * offset,
    directionX,
    directionY,
    angle: Math.atan2(directionY, directionX),
    progress: easedProgress,
  };
}

export function getEdgeTransferPacketFacing(from, to) {
  const dx = Number(to?.x ?? from?.x ?? 0) - Number(from?.x ?? 0);
  const dy = Number(to?.y ?? from?.y ?? 0) - Number(from?.y ?? 0);
  const length = Math.max(0.0001, Math.hypot(dx, dy));
  const directionX = dx / length;
  const directionY = dy / length;
  return {
    directionX,
    directionY,
    angle: Math.atan2(directionY, directionX),
  };
}

export function getEdgeTransferPacketVisualSpec({
  sourcePoint,
  destinationPoint,
  reversed = false,
  laneOffset = 0,
} = {}) {
  const isReversed = reversed === true;
  const authoredLaneOffset = Number(laneOffset ?? 0);
  return {
    from: isReversed ? destinationPoint : sourcePoint,
    to: isReversed ? sourcePoint : destinationPoint,
    facingFrom: sourcePoint,
    facingTo: destinationPoint,
    laneOffset: isReversed ? -authoredLaneOffset : authoredLaneOffset,
  };
}

function viewNowMs() {
  return typeof performance !== "undefined" &&
    typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function addButton(parent, rect, label, onPress, disabled = false) {
  const root = new PIXI.Container();
  const gfx = new PIXI.Graphics();
  roundedRect(gfx, 0, 0, rect.width, rect.height, 7,
    disabled ? PALETTE.panelSoft : PALETTE.accent, PALETTE.stroke, 2);
  root.addChild(gfx, createText(label, {
    ...TEXT_STYLES.title,
    fill: disabled ? PALETTE.textMuted : 0x292622,
  }, rect.width / 2, rect.height / 2, 0.5, 0.5));
  root.position.set(rect.x, rect.y);
  root.eventMode = "static";
  root.cursor = disabled ? "default" : "pointer";
  root.on("pointerdown", () => { if (!disabled) onPress?.(); });
  parent.addChild(root);
}

function getPracticeCardState(entry) {
  if (!entry?.practiceId) return "Open slot";
  const activation = entry?.evaluation?.activation?.type;
  const timing = activation === "passive"
    ? "Passive"
    : activation === "season"
      ? "Seasonal"
      : activation === "birth"
        ? "Birth"
        : activation === "food"
          ? "Food"
          : "Practice";
  const assigned = Array.isArray(entry?.workers?.tokens)
    ? entry.workers.tokens.length
    : 0;
  const capacity = Math.max(0, Math.floor(entry?.evaluation?.workerCapacity ?? 0));
  return `${timing} · ${assigned}/${capacity} workers`;
}

function drawCompactPracticeSlot(parent, rect, entry, slotIndex) {
  const filled = Boolean(entry?.practiceId);
  const passive = entry?.evaluation?.activation?.type === "passive";
  const card = new PIXI.Graphics();
  card.eventMode = "none";
  roundedRect(
    card,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    8,
    filled ? PALETTE.card : PALETTE.slot,
    passive ? PALETTE.passiveBorder : PALETTE.stroke,
    filled ? 2 : 1
  );
  parent.addChild(
    card,
    createText(
      `${slotIndex + 1}. ${filled ? entry.label : "Empty"}`,
      {
        ...TEXT_STYLES.title,
        fontSize: 12,
        wordWrap: true,
        wordWrapWidth: rect.width - 16,
        fill: filled ? PALETTE.text : PALETTE.textMuted,
      },
      rect.x + 8,
      rect.y + 7
    ),
    createText(
      getPracticeCardState(entry),
      {
        ...TEXT_STYLES.body,
        fontSize: 10,
        fill: filled ? PALETTE.textMuted : PALETTE.textMuted,
      },
      rect.x + 8,
      rect.y + 33
    )
  );
}

function structureSlotLabel(slot) {
  if (!slot?.structureId) return "Open";
  return String(slot.structureId)
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function drawCompactStructureSlot(parent, rect, slot, slotIndex) {
  const filled = Boolean(slot?.structureId);
  const card = new PIXI.Graphics();
  card.eventMode = "none";
  roundedRect(
    card,
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    7,
    filled ? PALETTE.cardMuted : PALETTE.slot,
    filled ? PALETTE.stroke : PALETTE.textMuted,
    1
  );
  parent.addChild(
    card,
    createText(
      `${slotIndex + 1} · ${structureSlotLabel(slot)}`,
      {
        ...TEXT_STYLES.body,
        fontSize: 11,
        wordWrap: true,
        wordWrapWidth: rect.width - 12,
        fill: filled ? PALETTE.text : PALETTE.textMuted,
      },
      rect.x + 6,
      rect.y + 13
    )
  );
}

function getRegionReferenceCorner(definition, regionDef) {
  const points = getRegionPolygon(definition, regionDef);
  if (!points.length) return null;
  const corner = points.reduce((best, point) =>
    point.x + point.y < best.x + best.y ? point : best
  );
  const center = regionDef?.display?.labelPoint ?? corner;
  // Pull the label just inside the nearest top-left vertex, leaving the
  // settlement glyphs at the authored display point unobstructed.
  return screenPoint({
    x: corner.x * 0.88 + center.x * 0.12,
    y: corner.y * 0.88 + center.y * 0.12,
  });
}

function getActiveWorkerCount(viewModel) {
  if (Number.isFinite(viewModel?.workerPool?.activeWorkerCount)) {
    return Math.max(0, Math.floor(viewModel.workerPool.activeWorkerCount));
  }
  return (viewModel?.practices ?? []).reduce(
    (total, practice) =>
      total + (Array.isArray(practice?.workers?.tokens)
        ? practice.workers.tokens.length
        : 0),
    0
  );
}

function getUnusedWorkerCount(viewModel) {
  return Number.isFinite(viewModel?.workerPool?.unusedWorkerCount)
    ? Math.max(0, Math.floor(viewModel.workerPool.unusedWorkerCount))
    : 0;
}

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

function buildRegionMapIndicators(state, definition) {
  return definition.regions.map((regionDef) => {
    const region = getRegionState(state, regionDef.id);
    const viewModel = getDetailedSettlementViewModel(state, regionDef.id);
    const activeWorkerCount = getActiveWorkerCount(viewModel);
    const unusedWorkerCount = getUnusedWorkerCount(viewModel);
    const workerPresentation =
      getWorkerIndicatorPresentation(activeWorkerCount, unusedWorkerCount);
    const structureCapacity = Math.max(
      0,
      Math.floor(region?.structureCapacity ?? 0)
    );
    const structureSlots = viewModel
      ? (viewModel.structures ?? []).map((slot) => slot?.structureId ?? null)
      : Array.from({ length: structureCapacity }, () => null);
    return {
      regionId: regionDef.id,
      controller: region?.controller ?? null,
      showsPlayerMarker: region?.controller === "player",
      hasDetailedSettlement: viewModel != null,
      ...workerPresentation,
      usedStructureCapacity: viewModel?.usedStructureCapacity ?? 0,
      structureCapacity,
      structureSlots,
    };
  });
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

function addWorkerIndicator(parent, point, activeWorkerCount, unusedWorkerCount) {
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

function addStructureIndicator(
  parent,
  point,
  structureSlots,
  { centered = false } = {}
) {
  const slots = Array.isArray(structureSlots) ? structureSlots : [];
  if (slots.length === 0) return;
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
  slots.forEach((structureId, index) => {
    addStructureGlyph(
      parent,
      startX + index * gap,
      point.y + 36 + verticalOffset,
      structureId
    );
  });
}

function addPlayerOwnershipMarker(parent, point, { selected = false } = {}) {
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

function addMapIndicatorLegend(parent) {
  addPawnGlyph(parent, 282, 81, { color: PALETTE.accent, scale: 0.8 });
  parent.addChild(
    createText(
      "active workers",
      { ...TEXT_STYLES.muted, fontSize: 13 },
      297,
      81,
      0,
      0.5
    )
  );
  addPawnGlyph(parent, 412, 81, { color: PALETTE.text, scale: 0.8 });
  parent.addChild(
    createText(
      "unused workers",
      { ...TEXT_STYLES.muted, fontSize: 13 },
      427,
      81,
      0,
      0.5
    )
  );
  addStructureGlyph(parent, 548, 82, "mudHouses");
  addStructureGlyph(parent, 572, 82, null);
  parent.addChild(
    createText(
      "occupied / open structure slots",
      { ...TEXT_STYLES.muted, fontSize: 13 },
      590,
      81,
      0,
      0.5
    )
  );
  const transfer = new PIXI.Graphics();
  const transferColor = EDGE_TRANSFER_RESOURCE_COLOURS.food;
  transfer.lineStyle(4, transferColor, 0.55);
  transfer.moveTo(886, 81);
  transfer.lineTo(914, 81);
  transfer.lineStyle(2, 0x302d2a, 1);
  transfer.beginFill(transferColor, 1);
  transfer.drawPolygon([
    922, 81,
    908, 72,
    908, 90,
  ]);
  transfer.endFill();
  transfer.eventMode = "none";
  parent.addChild(
    transfer,
    createText(
      "food transfer",
      { ...TEXT_STYLES.muted, fontSize: 13 },
      934,
      81,
      0,
      0.5
    )
  );
}

function signature(
  state,
  selectedRegionId,
  regionSelectionActive,
  graphScope,
  civilizationSummary,
  survivalTracker,
  regionMapIndicators,
  vassalHighlight
) {
  return JSON.stringify({
    selectedRegionId,
    regionSelectionActive,
    graphScope,
    regions: state?.world?.regions,
    civilizationSummary,
    survivalTracker,
    regionMapIndicators,
    vassalHighlight,
    vassal: state?.civilization?.vassalLineage?.currentVassal ?? null,
    sites: state?.world?.sites?.map((site) => ({
      regionId: site.regionId,
      food: [site.detailedState?.storedFood, site.detailedState?.looseFood],
      structures: site.detailedState?.structureSlots,
    })),
  });
}

export function createWorldMapView({
  layer,
  getState,
  getEdgeTransferBatch,
  getSelectedRegionId,
  getRegionSelectionActive,
  getGraphScope,
  setSelectedRegionId,
  getCivilizationLossInfo,
  onShowCivilizationGraph,
  onShowSelectedRegionGraph,
  onOpenDetailedSite,
  getVassalHighlight,
}) {
  const root = new PIXI.Container();
  const edgeTransferLayer = new PIXI.Container();
  const edgeTransferGraphics = new PIXI.Graphics();
  edgeTransferLayer.eventMode = "none";
  edgeTransferGraphics.eventMode = "none";
  edgeTransferLayer.addChild(edgeTransferGraphics);
  layer.addChild(root, edgeTransferLayer);
  let lastSignature = "";
  let lastPointerRegionId = null;
  let lastRegionTap = {
    regionId: null,
    atMs: -Infinity,
    nearFlag: false,
  };
  let lastEdgeTransferBatchKey = null;
  let lastEdgeTransferBatch = null;
  let lastEdgeTransferViewedSec = null;
  let edgeTransferPlaybackDirection = 1;
  let activeEdgeTransferPackets = [];

  function getEdgeTransferBatchKey(batch) {
    if (!batch || !Number.isFinite(batch?.boundarySec)) return null;
    return JSON.stringify({
      batchId: batch.batchId ?? null,
      boundarySec: Math.max(0, Math.floor(batch.boundarySec)),
      transfers: (Array.isArray(batch.transfers) ? batch.transfers : []).map(
        (transfer) => [
          transfer?.transferId ?? null,
          transfer?.systemId ?? null,
          transfer?.resourceId ?? null,
          transfer?.sourceRegionId ?? null,
          transfer?.destinationRegionId ?? null,
          Number(transfer?.amount ?? 0),
          Number(transfer?.survivors ?? transfer?.amount ?? 0),
          Number(transfer?.arrivalDeaths ?? 0),
        ]
      ),
    });
  }

  function syncEdgeTransferPackets(nowMs, definition) {
    const viewedSec = Math.max(0, Math.floor(getState?.()?.tSec ?? 0));
    const nextPlaybackDirection = resolveEdgeTransferPlaybackDirection(
      lastEdgeTransferViewedSec,
      viewedSec
    );
    if (nextPlaybackDirection !== 0) {
      const playbackDirectionChanged =
        nextPlaybackDirection !== edgeTransferPlaybackDirection;
      edgeTransferPlaybackDirection = nextPlaybackDirection;
      if (playbackDirectionChanged) {
        lastEdgeTransferBatchKey = null;
        activeEdgeTransferPackets = [];
      }
    }
    lastEdgeTransferViewedSec = viewedSec;
    const batch = getEdgeTransferBatch?.() ?? null;
    const batchKey = getEdgeTransferBatchKey(batch);
    lastEdgeTransferBatch = batch;
    if (batchKey == null) {
      lastEdgeTransferBatchKey = null;
      return;
    }
    if (batchKey === lastEdgeTransferBatchKey) return;
    lastEdgeTransferBatchKey = batchKey;
    const transfers = Array.isArray(batch?.transfers) ? batch.transfers : [];
    const routeCounts = new Map();
    for (const transfer of transfers) {
      const source = definition.regions.find(
        (entry) => entry.id === transfer?.sourceRegionId
      );
      const destination = definition.regions.find(
        (entry) => entry.id === transfer?.destinationRegionId
      );
      if (!source || !destination) continue;
      const routeKey =
        `${transfer.sourceRegionId}->${transfer.destinationRegionId}`;
      const routeIndex = routeCounts.get(routeKey) ?? 0;
      routeCounts.set(routeKey, routeIndex + 1);
      const reversed = edgeTransferPlaybackDirection < 0;
      const sourcePoint = screenPoint(source.display.labelPoint);
      const destinationPoint = screenPoint(destination.display.labelPoint);
      const authoredLaneOffset = [0, -9, 9][routeIndex % 3];
      const visualSpec = getEdgeTransferPacketVisualSpec({
        sourcePoint,
        destinationPoint,
        reversed,
        laneOffset: authoredLaneOffset,
      });
      activeEdgeTransferPackets.push({
        ...transfer,
        ...visualSpec,
        reversed,
        playbackDirection: reversed ? "backward" : "forward",
        startedMs:
          nowMs +
          routeIndex * EDGE_TRANSFER_PACKET_STAGGER_MS,
        durationMs: EDGE_TRANSFER_PACKET_DURATION_MS,
      });
    }
    if (activeEdgeTransferPackets.length > EDGE_TRANSFER_PACKET_MAX_ACTIVE) {
      activeEdgeTransferPackets = activeEdgeTransferPackets.slice(
        -EDGE_TRANSFER_PACKET_MAX_ACTIVE
      );
    }
  }

  function drawEdgeTransferPackets(nowMs) {
    edgeTransferGraphics.clear();
    const surviving = [];
    for (const packet of activeEdgeTransferPackets) {
      const rawProgress =
        (nowMs - packet.startedMs) /
        Math.max(1, Number(packet.durationMs ?? 1));
      if (rawProgress >= 1) continue;
      surviving.push(packet);
      if (rawProgress < 0) continue;
      const pose = getEdgeTransferPacketPose({
        from: packet.from,
        to: packet.to,
        progress: rawProgress,
        laneOffset: packet.laneOffset,
      });
      const facing = getEdgeTransferPacketFacing(
        packet.facingFrom,
        packet.facingTo
      );
      const fadeIn = Math.min(1, rawProgress / 0.12);
      const fadeOut = Math.min(1, (1 - rawProgress) / 0.2);
      const alpha = Math.max(0, Math.min(fadeIn, fadeOut));
      const glyph = getEdgeTransferPacketGlyphSpec(packet.resourceId);
      const color = glyph.color ?? PALETTE.text;
      const size =
        9 + Math.min(5, Math.max(0, Number(packet.amount ?? 0)) / 5);
      const tailX = pose.x - facing.directionX * (size + 9);
      const tailY = pose.y - facing.directionY * (size + 9);
      const perpendicularX = -facing.directionY;
      const perpendicularY = facing.directionX;
      edgeTransferGraphics.lineStyle(4, color, alpha * 0.34);
      edgeTransferGraphics.moveTo(tailX, tailY);
      edgeTransferGraphics.lineTo(pose.x, pose.y);
      edgeTransferGraphics.lineStyle(2, 0x302d2a, alpha);
      edgeTransferGraphics.beginFill(color, alpha);
      const triangleSize = size * glyph.triangleScale;
      edgeTransferGraphics.drawPolygon([
        pose.x + facing.directionX * size,
        pose.y + facing.directionY * size,
        pose.x -
          facing.directionX * triangleSize * 0.2 +
          perpendicularX * triangleSize * 0.62,
        pose.y -
          facing.directionY * triangleSize * 0.2 +
          perpendicularY * triangleSize * 0.62,
        pose.x -
          facing.directionX * triangleSize * 0.2 -
          perpendicularX * triangleSize * 0.62,
        pose.y -
          facing.directionY * triangleSize * 0.2 -
          perpendicularY * triangleSize * 0.62,
      ]);
      edgeTransferGraphics.endFill();
      for (const circle of glyph.circles) {
        edgeTransferGraphics.lineStyle(1.5, 0x302d2a, alpha);
        edgeTransferGraphics.beginFill(color, alpha);
        edgeTransferGraphics.drawCircle(
          pose.x
            + facing.directionX * size * circle.forward
            + perpendicularX * size * circle.side,
          pose.y
            + facing.directionY * size * circle.forward
            + perpendicularY * size * circle.side,
          Math.max(2, size * circle.radius)
        );
        edgeTransferGraphics.endFill();
      }
    }
    activeEdgeTransferPackets = surviving;
  }

  function resetEdgeTransferPackets() {
    lastEdgeTransferBatchKey = null;
    lastEdgeTransferBatch = null;
    lastEdgeTransferViewedSec = null;
    edgeTransferPlaybackDirection = 1;
    activeEdgeTransferPackets = [];
    edgeTransferGraphics.clear();
  }

  function updateEdgeTransferPackets() {
    if (!root.visible) return;
    const definition = getWorldDefinition(getState?.());
    if (!definition) return;
    const nowMs = viewNowMs();
    syncEdgeTransferPackets(nowMs, definition);
    drawEdgeTransferPackets(nowMs);
  }

  function render(force = false) {
    if (!root.visible) return;
    const state = getState?.();
    const definition = getWorldDefinition(state);
    if (!definition) return;
    const selectedRegionId = getSelectedRegionId?.() ?? state.civilization.capitalRegionId;
    const regionSelectionActive = getRegionSelectionActive?.() === true;
    const graphScope =
      getGraphScope?.() === "settlement" ? "settlement" : "civilization";
    const civilizationSummary = getDetailedCivilizationSummary(state);
    const civilizationLossInfo = getCivilizationLossInfo?.() ?? null;
    const survivalTracker = getCivilizationSurvivalViewModel(
      state,
      civilizationLossInfo
    );
    const regionMapIndicators = buildRegionMapIndicators(state, definition);
    const vassalHighlight = getVassalHighlight?.() ?? null;
    const nextSignature = signature(
      state,
      selectedRegionId,
      regionSelectionActive,
      graphScope,
      civilizationSummary,
      survivalTracker,
      regionMapIndicators,
      vassalHighlight
    );
    if (!force && nextSignature === lastSignature) return;
    lastSignature = nextSignature;
    clearChildren(root);

    const bg = new PIXI.Graphics();
    bg.beginFill(0x6f756b).drawRect(0, 0, 2424, 860).endFill();
    root.addChild(
      bg,
      createText(
        "MAP-DRIVEN SETTLEMENTS",
        { ...TEXT_STYLES.header, fontSize: 30 },
        70,
        38,
        0,
        0.5
      )
    );
    addCivilizationSurvivalStrip(root, {
      state,
      civilizationLossInfo,
      rect: { x: 660, y: 9, width: 1030, height: 54 },
    });
    addMapIndicatorLegend(root);

    const mapPanel = new PIXI.Graphics();
    roundedRect(mapPanel, MAP_RECT.x, MAP_RECT.y, MAP_RECT.width, MAP_RECT.height, 7,
      definition.mapContext.landColor, 0x3d514f, 3);
    root.addChild(mapPanel);

    const highlightedRegionIds = new Set([
      vassalHighlight?.targetRegionId,
      vassalHighlight?.intervention?.regionAId,
      vassalHighlight?.intervention?.regionBId,
    ].filter(Boolean));
    for (const regionDef of definition.regions) {
      const region = getRegionState(state, regionDef.id);
      const points = getRegionPolygon(definition, regionDef).flatMap((point) => {
        const p = screenPoint(point);
        return [p.x, p.y];
      });
      const selected =
        regionSelectionActive && region.id === selectedRegionId;
      const highlighted = highlightedRegionIds.has(region.id);
      const shape = new PIXI.Graphics();
      shape.lineStyle(selected || highlighted ? 5 : 2,
        highlighted ? 0xf0d269 : selected ? PALETTE.accent : CONTROLLER_COLOURS[region.controller] ?? 0x777777, 1);
      shape.beginFill(REGION_COLOURS[region.colour] ?? 0x777777, 0.86);
      shape.drawPolygon(points);
      shape.endFill();
      const hit = new PIXI.Container();
      hit.hitArea = new PIXI.Polygon(points);
      hit.eventMode = "static";
      hit.cursor = "pointer";
      hit.addChild(shape);
      hit.on("pointerdown", (event) => {
        const tappedAtMs = viewNowMs();
        const flagPoint = screenPoint(regionDef.display.labelPoint);
        const pointerX = Number(event?.global?.x);
        const pointerY = Number(event?.global?.y);
        const nearFlag =
          Number.isFinite(pointerX) &&
          Number.isFinite(pointerY) &&
          Math.hypot(pointerX - flagPoint.x, pointerY - flagPoint.y) <=
            REGION_FLAG_DOUBLE_TAP_RADIUS;
        const isDoubleTap =
          lastRegionTap.regionId === region.id &&
          lastRegionTap.nearFlag &&
          nearFlag &&
          tappedAtMs - lastRegionTap.atMs <= REGION_DOUBLE_TAP_WINDOW_MS;
        lastPointerRegionId = region.id;
        const viewModel = getDetailedSettlementViewModel(state, region.id);
        if (isDoubleTap && viewModel) {
          lastRegionTap = {
            regionId: null,
            atMs: -Infinity,
            nearFlag: false,
          };
          onOpenDetailedSite?.(viewModel.siteId, region.id);
        } else {
          lastRegionTap = {
            regionId: region.id,
            atMs: tappedAtMs,
            nearFlag,
          };
          setSelectedRegionId?.(region.id);
        }
        lastSignature = "";
      });
      root.addChild(hit);
    }

    const edges = new PIXI.Graphics();
    for (const edge of state.world.connections) {
      const a = definition.regions.find((entry) => entry.id === edge.regionAId);
      const b = definition.regions.find((entry) => entry.id === edge.regionBId);
      const from = screenPoint(a.display.labelPoint);
      const to = screenPoint(b.display.labelPoint);
      edges.lineStyle(2, 0xf0eadc, 0.45).moveTo(from.x, from.y).lineTo(to.x, to.y);
    }
    edges.eventMode = "none";
    root.addChild(edges);

    for (const regionDef of definition.regions) {
      const point = getRegionReferenceCorner(definition, regionDef)
        ?? screenPoint(regionDef.display.labelPoint);
      root.addChild(createText(getRegionReference(state, regionDef.id) ?? "R??", {
        ...TEXT_STYLES.chip,
        fontSize: 12,
        fill: PALETTE.textMuted,
      }, point.x, point.y, 0, 0));
    }

    for (const indicator of regionMapIndicators) {
      const regionDef = definition.regions.find(
        (entry) => entry.id === indicator.regionId
      );
      if (!regionDef) continue;
      const point = screenPoint(regionDef.display.labelPoint);
      if (indicator.hasDetailedSettlement) {
        addWorkerIndicator(
          root,
          point,
          indicator.activeWorkerCount,
          indicator.unusedWorkerCount
        );
      }
      addStructureIndicator(root, point, indicator.structureSlots, {
        centered: !indicator.hasDetailedSettlement,
      });
      if (indicator.showsPlayerMarker) {
        addPlayerOwnershipMarker(root, point, {
          selected:
            regionSelectionActive &&
            indicator.regionId === selectedRegionId,
        });
      }
    }

    const civilizationPanel = new PIXI.Graphics();
    roundedRect(
      civilizationPanel,
      CIVILIZATION_RECT.x,
      CIVILIZATION_RECT.y,
      CIVILIZATION_RECT.width,
      CIVILIZATION_RECT.height,
      7,
      PALETTE.panel,
      graphScope === "civilization" ? PALETTE.accent : PALETTE.stroke,
      graphScope === "civilization" ? 5 : 3
    );
    civilizationPanel.eventMode = "static";
    civilizationPanel.cursor = "pointer";
    civilizationPanel.hitArea = new PIXI.Rectangle(
      CIVILIZATION_RECT.x,
      CIVILIZATION_RECT.y,
      CIVILIZATION_RECT.width,
      CIVILIZATION_RECT.height
    );
    civilizationPanel.on("pointerdown", () => {
      lastRegionTap = {
        regionId: null,
        atMs: -Infinity,
        nearFlag: false,
      };
      onShowCivilizationGraph?.();
      lastSignature = "";
    });
    root.addChild(
      civilizationPanel,
      createText(
        "CIVILIZATION",
        { ...TEXT_STYLES.header, fontSize: 26 },
        CIVILIZATION_RECT.x + 24,
        CIVILIZATION_RECT.y + 24
      ),
      createText(
        `${civilizationSummary.settlementCount} settlements · ${civilizationSummary.population.total} people · Food ${civilizationSummary.food.total}`,
        { ...TEXT_STYLES.title, fontSize: 18 },
        CIVILIZATION_RECT.x + 24,
        CIVILIZATION_RECT.y + 66
      ),
      createText(
        `Chaos ${civilizationSummary.chaos.chaosPower} · Monsters ${civilizationSummary.chaos.monsterCount}/${civilizationSummary.chaos.monsterLossThreshold}`,
        { ...TEXT_STYLES.body, fontSize: 15, fill: PALETTE.accent },
        CIVILIZATION_RECT.x + 24,
        CIVILIZATION_RECT.y + 96
      )
    );

    const selectedDef = getRegionDefinition(state, selectedRegionId);
    const region = getRegionState(state, selectedRegionId);
    const viewModel = getDetailedSettlementViewModel(state, selectedRegionId);
    const detailPanel = new PIXI.Graphics();
    roundedRect(
      detailPanel,
      DETAIL_RECT.x,
      DETAIL_RECT.y,
      DETAIL_RECT.width,
      DETAIL_RECT.height,
      7,
      PALETTE.panelSoft,
      graphScope === "settlement" ? PALETTE.accent : PALETTE.stroke,
      graphScope === "settlement" ? 5 : 3
    );
    detailPanel.eventMode = "static";
    detailPanel.cursor = viewModel ? "pointer" : "default";
    detailPanel.hitArea = new PIXI.Rectangle(
      DETAIL_RECT.x,
      DETAIL_RECT.y,
      DETAIL_RECT.width,
      DETAIL_RECT.height
    );
    detailPanel.on("pointerdown", () => {
      if (!viewModel) return;
      lastRegionTap = {
        regionId: null,
        atMs: -Infinity,
        nearFlag: false,
      };
      onShowSelectedRegionGraph?.(selectedRegionId);
      lastSignature = "";
    });
    root.addChild(detailPanel);
    const regionRef = getRegionReference(state, selectedRegionId) ?? selectedRegionId;
    root.addChild(createText(`${regionRef} · ${viewModel?.name ?? selectedDef?.name ?? selectedRegionId}`,
      { ...TEXT_STYLES.header, fontSize: 26 },
      DETAIL_RECT.x + 24, DETAIL_RECT.y + 30));
    root.addChild(createText(
      `${region.colour} · ${region.controller} · Connections: ${getConnectedRegionIds(state, region.id).map((id) => getRegionReference(state, id) ?? id).join(", ") || "none"}`,
      { ...TEXT_STYLES.body, fill: PALETTE.textMuted }, DETAIL_RECT.x + 24, DETAIL_RECT.y + 68));
    root.addChild(createText(
      `Population ${viewModel?.population.total ?? 0}/${viewModel?.population.housingCapacity ?? 0} housing · Resistance ${viewModel?.elderOrder.resistance ?? 0}`,
      { ...TEXT_STYLES.title, fontSize: 17 }, DETAIL_RECT.x + 24, DETAIL_RECT.y + 104));
    if (viewModel) {
      root.addChild(createText(
        `Food ${viewModel.storedFood}/${viewModel.storedFoodCapacity} stored · ${viewModel.looseFood} loose · Currency ${viewModel.currency}`,
        TEXT_STYLES.body, DETAIL_RECT.x + 24, DETAIL_RECT.y + 140));
      root.addChild(createText(
        "Practices (ordered)", { ...TEXT_STYLES.title, fontSize: 16 }, DETAIL_RECT.x + 24, DETAIL_RECT.y + 164));
      const practiceGap = 8;
      const practiceWidth = Math.floor((DETAIL_RECT.width - 48 - practiceGap * 2) / 3);
      viewModel.practices.forEach((practice, index) => {
        drawCompactPracticeSlot(root, {
          x: DETAIL_RECT.x + 24 + (index % 3) * (practiceWidth + practiceGap),
          y: DETAIL_RECT.y + 188 + Math.floor(index / 3) * 58,
          width: practiceWidth,
          height: 52,
        }, practice, index);
      });
      root.addChild(createText(
        `Structures ${viewModel.usedStructureCapacity}/${viewModel.structureCapacity}`,
        { ...TEXT_STYLES.title, fontSize: 15 }, DETAIL_RECT.x + 24, DETAIL_RECT.y + 314));
      const structureGap = 7;
      const structureCount = Math.max(1, viewModel.structures.length);
      const structureWidth = Math.floor(
        (DETAIL_RECT.width - 48 - structureGap * (structureCount - 1)) / structureCount
      );
      viewModel.structures.forEach((slot, index) => {
        drawCompactStructureSlot(root, {
          x: DETAIL_RECT.x + 24 + index * (structureWidth + structureGap),
          y: DETAIL_RECT.y + 336,
          width: structureWidth,
          height: 44,
        }, slot, index);
      });
      const activeVassal = state.civilization?.vassalLineage?.currentVassal;
      if (activeVassal) {
        const targetRef = getRegionReference(state, activeVassal.targetRegionId) ?? activeVassal.targetRegionId;
        root.addChild(createText(
          `ACTIVE VASSAL · Target ${targetRef} · Prestige ${getDetailedVassalPrestige(state, activeVassal)} · dies Year ${activeVassal.deathYear}`,
          { ...TEXT_STYLES.title, fontSize: 14, fill: PALETTE.accent }, DETAIL_RECT.x + 24, DETAIL_RECT.y + 396));
        activeVassal.interventions.forEach((entry, index) => root.addChild(createText(
          `${index + 1}. ${describeDetailedVassalIntervention(state, activeVassal.targetRegionId, entry)} · ${entry.status}`,
          { ...TEXT_STYLES.body, fontSize: 12, fill: entry.status === "applied" ? PALETTE.accent : PALETTE.text },
          DETAIL_RECT.x + 30, DETAIL_RECT.y + 424 + index * 20
        )));
      } else {
        root.addChild(createText("No active Vassal.", { ...TEXT_STYLES.body, fill: PALETTE.textMuted },
          DETAIL_RECT.x + 24, DETAIL_RECT.y + 396));
      }
    } else {
      root.addChild(createText("No detailed settlement at this region.",
        { ...TEXT_STYLES.body, fill: PALETTE.textMuted }, DETAIL_RECT.x + 24, DETAIL_RECT.y + 142));
    }
    addButton(root, {
      x: DETAIL_RECT.x + 24,
      y: DETAIL_RECT.y + DETAIL_RECT.height - 70,
      width: DETAIL_RECT.width - 48,
      height: 46,
    }, viewModel ? "Open settlement" : "No detailed settlement",
    () => onOpenDetailedSite?.(viewModel.siteId, selectedRegionId), !viewModel);
  }

  return {
    init: () => {
      render(true);
      updateEdgeTransferPackets();
    },
    update: () => {
      render();
      updateEdgeTransferPackets();
    },
    refresh: () => { lastSignature = ""; render(true); },
    resetEdgeTransferPackets,
    setVisible: (visible) => {
      root.visible = visible === true;
      edgeTransferLayer.visible = root.visible;
      if (root.visible) {
        lastEdgeTransferBatchKey = null;
        lastEdgeTransferViewedSec = null;
        edgeTransferPlaybackDirection = 1;
        render(true);
        updateEdgeTransferPackets();
      } else {
        activeEdgeTransferPackets = [];
        edgeTransferGraphics.clear();
      }
    },
    getSemanticSnapshot: () => {
      const state = getState?.();
      const regionId = getSelectedRegionId?.();
      const region = getRegionState(state, regionId);
      const viewModel = getDetailedSettlementViewModel(state, regionId);
      const civilizationSummary = getDetailedCivilizationSummary(state);
      const survivalTracker = getCivilizationSurvivalViewModel(
        state,
        getCivilizationLossInfo?.() ?? null
      );
      const definition = getWorldDefinition(state);
      const regionMapIndicators = definition
        ? buildRegionMapIndicators(state, definition)
        : [];
      return {
        visible: root.visible === true,
        selectedRegionId: regionId,
        regionSelectionActive: getRegionSelectionActive?.() === true,
        graphScope:
          getGraphScope?.() === "settlement"
            ? "settlement"
            : "civilization",
        lastPointerRegionId,
        regionCount: getWorldDefinition(state)?.regions.length ?? 0,
        civilizationSummary,
        survivalTracker,
        selectedRegion: region ? {
          ...region,
          reference: getRegionReference(state, regionId),
          usedStructureCapacity: viewModel?.usedStructureCapacity ?? 0,
          detailedSettlement: viewModel,
        } : null,
        detailedSiteMarkerCount: getDetailedSettlementViewModel
          ? state?.world?.sites?.length ?? 0 : 0,
        regionNameLabelsVisible: true,
        regionReferences: (definition?.regions ?? []).map((entry) => ({
          regionId: entry.id,
          reference: getRegionReference(state, entry.id),
        })),
        vassalHighlight: getVassalHighlight?.() ?? null,
        regionMapIndicators,
        edgeTransferBatch: lastEdgeTransferBatch
          ? {
              batchId: lastEdgeTransferBatch.batchId ?? null,
              boundarySec: Math.max(
                0,
                Math.floor(lastEdgeTransferBatch.boundarySec ?? 0)
              ),
              transfers: (
                Array.isArray(lastEdgeTransferBatch.transfers)
                  ? lastEdgeTransferBatch.transfers
                  : []
              ).map((transfer) => ({ ...transfer })),
            }
          : null,
        edgeTransferPlaybackDirection:
          edgeTransferPlaybackDirection < 0 ? "backward" : "forward",
        activeEdgeTransferPacketCount: activeEdgeTransferPackets.length,
        activeEdgeTransferPackets: activeEdgeTransferPackets.map((packet) => {
          const rawProgress =
            (viewNowMs() - packet.startedMs) /
            Math.max(1, Number(packet.durationMs ?? 1));
          const pose = getEdgeTransferPacketPose({
            from: packet.from,
            to: packet.to,
            progress: rawProgress,
            laneOffset: packet.laneOffset,
          });
          const facing = getEdgeTransferPacketFacing(
            packet.facingFrom,
            packet.facingTo
          );
          return {
            transferId: packet.transferId,
            resourceId: packet.resourceId,
            sourceRegionId: packet.sourceRegionId,
            destinationRegionId: packet.destinationRegionId,
            amount: packet.amount,
            reason: packet.reason ?? null,
            survivors: packet.survivors ?? packet.amount,
            arrivalDeaths: packet.arrivalDeaths ?? 0,
            reversed: packet.reversed === true,
            playbackDirection: packet.playbackDirection,
            progress: clamp01(rawProgress),
            x: pose.x,
            y: pose.y,
            angle: facing.angle,
            facingAngle: facing.angle,
            travelAngle: pose.angle,
          };
        }),
      };
    },
    getRegionClickPoint: (regionId) => {
      const region = getRegionDefinition(getState?.(), regionId);
      return region ? screenPoint(region.display.labelPoint) : null;
    },
    getPracticeClickPoint: () => null,
    getInstalledPracticeClickPoint: () => null,
    destroy: () => {
      clearChildren(root);
      root.removeFromParent();
      root.destroy({ children: true });
      edgeTransferLayer.removeFromParent();
      edgeTransferLayer.destroy({ children: true });
    },
  };
}
