import { addMonsterGround, addMonsterMarker, addTerritoryBorder } from './world-map/territory-art.js';
import { getMapRelationships, getMapRelationship, getRelationshipStyle, drawRelationshipLine } from './world-map/relationships.js';
import { createMapCamera } from './world-map/camera.js';
import { createMapPanelReveal } from './world-map/transitions.js';
import { createStockTransferIcons, getStockTransferIconLayout } from './world-map/stock-transfer-icons.js';
import { getSettlementStockTags, getSettlementStockTagLayout, addSettlementStockTags } from './world-map/stock-tags.js';
import { DEFAULT_REGION_STRUCTURE_CAPACITY_MAX } from '../defs/world/detailed-settlement-scenario.js';
import { sampleEventProgress } from './timeline-presentation.js';
import { createChronicleEffects, addTimelineLandmark } from './chronicle-effects-pixi.js';
import { addRegionTerrain, getArtRevision } from './chronicle-art.js';
import { addChaosPanelContent, addRegionPanelContent } from './chronicle-world-panels.js';
import {
  getRegionDefinition,
  getRegionReference,
  getRegionPolygon,
  getRegionState,
  getWorldDefinition,
} from "../model/world-state.js";
import {
  getDetailedCivilizationSummary,
  getDetailedSettlementViewModel,
  getDetailedVassalPrestige,
} from "../model/detailed-settlements.js";
import { getCurrentLifeMapVassal } from "../model/vassal-life-map.js";
import {
  addCivilizationSurvivalStrip,
  getCivilizationSurvivalViewModel,
  getSurvivalEndDetailsClickPoint,
} from "./civilization-survival-hud.js";
import { clearChildren, createText, roundedRect } from "./settlement-view-primitives.js";
import { PALETTE, TEXT_STYLES } from "./settlement-theme.js";
import {
  CIVILIZATION_HEADER_RECT,
  CIVILIZATION_RECT,
  DETAIL_RECT,
  EDGE_TRANSFER_PACKET_MAX_ACTIVE,
  MAP_RECT,
  GROUP_FRAME_RECT,
  MAP_VIEWPORT_RECT,
  REGION_COLOURS,
  REGION_DOUBLE_TAP_WINDOW_MS,
  REGION_FLAG_DOUBLE_TAP_RADIUS,
} from "./world-map/constants.js";
import {
  getEdgeTransferPacketFacing,
  getEdgeTransferPacketGlyphSpec,
  getEdgeTransferPacketPose,
  getEdgeTransferPacketVisualSpec,
  resolveEdgeTransferPlaybackDirection,
} from "./world-map/packets.js";
import {
  addActiveVassalMarker,
  addPlayerOwnershipMarker,
  addSettlementCurrencyIndicator,
  addSettlementPressureIndicator,
  addWorkerIndicator,
  getWorkerIndicatorPresentation,
} from "./world-map/glyphs.js";

export {
  getEdgeTransferPacketFacing,
  getEdgeTransferPacketGlyphSpec,
  getEdgeTransferPacketPose,
  getEdgeTransferPacketVisualSpec,
  resolveEdgeTransferPlaybackDirection,
};

export { getWorkerIndicatorPresentation };

function screenPoint(point) {
  return {
    x: MAP_RECT.x + Number(point?.x ?? 0) * MAP_RECT.width,
    y: MAP_RECT.y + Number(point?.y ?? 0) * MAP_RECT.height,
  };
}

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value ?? 0)));
}

function viewNowMs() {
  return typeof performance !== "undefined" &&
    typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function addButton(parent, rect, label, onPress, disabled = false, textStyle = {}) {
  const root = new PIXI.Container();
  const gfx = new PIXI.Graphics();
  roundedRect(gfx, rect.x, rect.y, rect.width, rect.height, 7,
    PALETTE.panelSoft, PALETTE.stroke, 2);
  root.addChild(gfx, createText(label, {
    ...TEXT_STYLES.title,
    fill: disabled ? PALETTE.textMuted : PALETTE.accent,
    ...textStyle,
  }, rect.x + rect.width / 2, rect.y + rect.height / 2, 0.5, 0.5));
  root.eventMode = "static";
  // Map redraws can replace this button between input and the next paint.
  // Use map coordinates so the hit target needs no newly cached translation.
  root.hitArea = new PIXI.Rectangle(rect.x, rect.y, rect.width, rect.height);
  root.cursor = disabled ? "default" : "pointer";
  root.on("pointerdown", () => { if (!disabled) onPress?.(); });
  parent.addChild(root);
  return root;
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
      ? (viewModel.structures ?? []).map((slot) => slot ? { structureId: slot.structureId, origin: slot.origin, width: slot.width, placementId: slot.placementId } : null)
      : Array.from({ length: structureCapacity }, () => null);
    const hasCurrencyPractice = (viewModel?.practices ?? []).some((practice) =>
      practice?.face?.stockTraits?.includes("Currency"));
    return {
      regionId: regionDef.id,
      controller: region?.controller ?? null,
      monster: region?.monster ?? null,
      neutral: (state.world.sites ?? []).find(s=>s.regionId===regionDef.id)?.neutral ?? null,
      showsPlayerMarker: region?.controller === "player" && !region?.monster,
      hasDetailedSettlement: viewModel != null,
      stockTags: getSettlementStockTags(viewModel),
      ...workerPresentation,
      usedStructureCapacity: viewModel?.usedStructureCapacity ?? 0,
      structureCapacity,
      structureSlots,
      pressure: viewModel?.pressure ?? null,
      currency: hasCurrencyPractice ? viewModel?.currency ?? null : null,
      currencySpent: Math.max(
        0,
        hasCurrencyPractice ? Number(viewModel?.currencySpentThisMoon ?? 0) : 0,
        hasCurrencyPractice ? Number(viewModel?.currencySpentLastMoon ?? 0) : 0
      ),
    };
  });
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
    connections: state?.world?.connections,
    civilizationSummary,
    survivalTracker,
    regionMapIndicators,
    vassalHighlight,
    vassal: getCurrentLifeMapVassal(state),
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
  getVisualTime,
  getSelectedRegionId,
  getRegionSelectionActive,
  getGraphScope,
  setSelectedRegionId,
  getCivilizationLossInfo,
  onOpenEndDetails,
  onOpenResearch,
  onShowCivilizationGraph,
  onOpenDetailedSite,
  getVassalHighlight,
  getDisplayOptions,
  tooltipView = null,
}) {
  const root = new PIXI.Container();
  const detailRoot = new PIXI.Container();
  const panelReveal = createMapPanelReveal(detailRoot, DETAIL_RECT);
  const edgeTransferLayer = new PIXI.Container();
  const edgeTransferGraphics = new PIXI.Graphics();
  edgeTransferLayer.eventMode = "none";
  edgeTransferGraphics.eventMode = "none";
  edgeTransferLayer.addChild(edgeTransferGraphics);
  const stockTransferIcons = createStockTransferIcons(edgeTransferLayer);
  const viewport = new PIXI.Container();
  const world = new PIXI.Container();
  const mapContent = new PIXI.Container();
  const clip = new PIXI.Graphics().beginFill(0xffffff)
    .drawRect(MAP_VIEWPORT_RECT.x, MAP_VIEWPORT_RECT.y, MAP_VIEWPORT_RECT.width, MAP_VIEWPORT_RECT.height).endFill();
  viewport.addChild(world);
  world.addChild(mapContent, edgeTransferLayer);
  viewport.mask = clip;
  layer.addChild(viewport, clip, root, detailRoot);
  const camera = createMapCamera(viewport, world, MAP_VIEWPORT_RECT, {
    onTap: handleMapTap,
    onGesture: () => {
      tooltipView?.hide?.();
      lastRegionTap = { regionId: null, atMs: -Infinity, nearFlag: false };
    },
  });
  let chaosExpanded = true;
  let lastRevealedRegionId = null;
  let overviewCamera = camera.snapshot();
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
  let edgeTransferPacketDescriptors = [];
  const visualTime=()=>getVisualTime?.()??getState?.()?.tSec??0;
  const effects=createChronicleEffects(edgeTransferLayer,visualTime);
  let landmarks=[];
  let endDetailsTarget = null;
  let researchTarget = null;

  function isRecentFlagTap(point) {
    return lastRegionTap.nearFlag && lastRegionTap.point
      && viewNowMs() - lastRegionTap.atMs <= REGION_DOUBLE_TAP_WINDOW_MS
      && Math.hypot(point.x - lastRegionTap.point.x, point.y - lastRegionTap.point.y) <= REGION_FLAG_DOUBLE_TAP_RADIUS;
  }

  function handleMapTap(event) {
    const tappedAtMs = viewNowMs();
    const point = viewport.toLocal(event.global);
    // Framing a newly disclosed region can move the terrain between taps.
    // A flag double-tap is anchored to the original screen position.
    const isDoubleTap = isRecentFlagTap(point);
    let target = event.target;
    while (target && !target.mapRegionId && target !== viewport) target = target.parent;
    const regionId = isDoubleTap ? lastRegionTap.regionId : target?.mapRegionId;
    const state = getState?.();
    const regionDef = getRegionDefinition(state, regionId);
    if (!regionDef) {
      lastRegionTap = { regionId: null, atMs: -Infinity, nearFlag: false };
      onShowCivilizationGraph?.();
      return;
    }
    const flagPoint = camera.project(screenPoint(regionDef.display.labelPoint));
    const nearFlag = Math.hypot(point.x - flagPoint.x, point.y - flagPoint.y) <= REGION_FLAG_DOUBLE_TAP_RADIUS;
    lastPointerRegionId = regionId;
    const vm = getDetailedSettlementViewModel(state, regionId);
    if (isDoubleTap && vm) {
      lastRegionTap = { regionId: null, atMs: -Infinity, nearFlag: false };
      onOpenDetailedSite?.(vm.siteId, regionId);
    } else {
      lastRegionTap = { regionId, atMs: tappedAtMs, nearFlag, point: { x: point.x, y: point.y } };
      setSelectedRegionId?.(regionId);
    }
    lastSignature = '';
  }

  // Group framing can move the flag away from the original tap into empty map
  // space or beneath chrome. Recognize the second press before another gesture
  // starts or its release dismisses the selection.
  const captureFlagDoubleTap = event => {
    if (!isRecentFlagTap(viewport.toLocal(event.global))) return;
    event.stopPropagation();
    handleMapTap(event);
  };
  root.on('pointerdowncapture', captureFlagDoubleTap);
  detailRoot.on('pointerdowncapture', captureFlagDoubleTap);
  viewport.on('pointerdowncapture', captureFlagDoubleTap);

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
          transfer?.kind ?? null,
          transfer?.traits ?? [],
          transfer?.sourceRegionId ?? null,
          transfer?.destinationRegionId ?? null,
          Number(transfer?.amount ?? 0),
          Number(transfer?.survivors ?? transfer?.amount ?? 0),
          Number(transfer?.arrivalDeaths ?? 0),
        ]
      ),
    });
  }

  function syncEdgeTransferPackets(definition) {
    const viewedSec=visualTime();
    const direction=resolveEdgeTransferPlaybackDirection(lastEdgeTransferViewedSec,viewedSec);
    if(direction!==0)edgeTransferPlaybackDirection=direction;
    lastEdgeTransferViewedSec=viewedSec;
    const batch=getEdgeTransferBatch?.()??null;
    lastEdgeTransferBatch=batch;
    const key=getEdgeTransferBatchKey(batch);
    if(key===lastEdgeTransferBatchKey)return;
    lastEdgeTransferBatchKey=key;
    edgeTransferPacketDescriptors=[];
    const routes=new Map();
    for(const transfer of batch?.transfers??[]){
      const source=definition.regions.find(r=>r.id===transfer.sourceRegionId);
      const destination=definition.regions.find(r=>r.id===transfer.destinationRegionId);
      if(!source||!destination)continue;
      const route=transfer.sourceRegionId+'>'+transfer.destinationRegionId;
      const routeInfo=routes.get(route)??{count:0,spacing:9};
      const index=routeInfo.count++;
      const from=screenPoint(source.display.labelPoint),to=screenPoint(destination.display.labelPoint);
      const packet={...transfer,from,to,facingFrom:from,facingTo:to,route,lane:[0,-1,1][index%3],
        glyph:getEdgeTransferPacketGlyphSpec(transfer.resourceId,transfer.traits),
        laneOffset:[0,-9,9][index%3],startedSec:(transfer.boundarySec??batch.boundarySec)+index*.06,durationSec:1.8};
      if(packet.glyph.icons){
        const facing=getEdgeTransferPacketFacing(from,to),layout=getStockTransferIconLayout(packet);
        // Upright icon rows need more room across vertical routes than horizontal
        // ones. Use the widest projected row on the route for every Stock lane.
        routeInfo.spacing=Math.max(routeInfo.spacing,Math.abs(facing.directionY)*layout.width+Math.abs(facing.directionX)*layout.height+8);
      }
      routes.set(route,routeInfo);
      edgeTransferPacketDescriptors.push(packet);
    }
    edgeTransferPacketDescriptors=edgeTransferPacketDescriptors.slice(0,EDGE_TRANSFER_PACKET_MAX_ACTIVE);
    for(const packet of edgeTransferPacketDescriptors)if(packet.glyph.icons)packet.laneOffset=packet.lane*routes.get(packet.route).spacing;
    stockTransferIcons.sync(edgeTransferPacketDescriptors);
  }

  function drawEdgeTransferPackets(timeSec) {
    edgeTransferGraphics.clear();
    stockTransferIcons.beginFrame();
    const surviving = [];
    for (const packet of edgeTransferPacketDescriptors) {
      const rawProgress=sampleEventProgress(timeSec,packet.startedSec,packet.durationSec);
      if(rawProgress==null)continue;
      surviving.push(packet);
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
      const glyph = packet.glyph;
      if (glyph.icons) {
        stockTransferIcons.draw(packet, pose, alpha);
        continue;
      }
      const color = glyph.color ?? PALETTE.text;
      const size =
        16 + Math.min(5, Math.max(0, Number(packet.amount ?? 0)) / 5);
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
        edgeTransferGraphics.beginFill(color, packet.kind === 'require' ? alpha * 0.25 : alpha);
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
    edgeTransferPacketDescriptors = [];
    edgeTransferGraphics.clear();
    stockTransferIcons.clear();
  }

  function updateEdgeTransferPackets() {
    if (!root.visible) return;
    const definition = getWorldDefinition(getState?.());
    if (!definition) return;
    syncEdgeTransferPackets(definition);
    drawEdgeTransferPackets(visualTime());
    effects.update();
    for(const landmark of landmarks)landmark?.sample(visualTime());
  }

  function render(force = false) {
    if (!root.visible || camera.isActive()) return;
    const state = getState?.();
    const definition = getWorldDefinition(state);
    if (!definition) return;
    const selectedRegionId = getSelectedRegionId?.() ?? state.civilization.capitalRegionId;
    const regionSelectionActive = getRegionSelectionActive?.() === true;
    const relationships = getMapRelationships(state, selectedRegionId, regionSelectionActive);
    const frameGroup = () => camera.frame(definition.regions
      .filter(entry => relationships?.groupRegionIds.includes(entry.id))
      .flatMap(entry => getRegionPolygon(definition, entry).map(screenPoint)), GROUP_FRAME_RECT);
    const graphScope =
      getGraphScope?.() === "settlement" ? "settlement" : "civilization";
    const civilizationSummary = getDetailedCivilizationSummary(state);
    const civilizationLossInfo = getCivilizationLossInfo?.() ?? null;
    const survivalTracker = getCivilizationSurvivalViewModel(
      state,
      civilizationLossInfo
    );
    const regionMapIndicators = buildRegionMapIndicators(state, definition);
    const display = getDisplayOptions?.() ?? {};
    const vassalHighlight = getVassalHighlight?.() ?? null;
    const nextSignature = JSON.stringify(display) + getArtRevision() + signature(
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
    // Retain the last settlement's content until its dismissal completes.
    if (regionSelectionActive) clearChildren(detailRoot);
    clearChildren(mapContent);
    if (regionSelectionActive && selectedRegionId !== lastRevealedRegionId) {
      if (!lastRevealedRegionId && !panelReveal.isClosing()) overviewCamera = camera.snapshot();
      const selected = getRegionDefinition(state, selectedRegionId);
      if (selected) {
        const point = screenPoint(selected.display.labelPoint);
        if (!lastRevealedRegionId) panelReveal.open(camera.project(point));
        frameGroup();
        tooltipView?.hide?.();
      }
    }
    if (!regionSelectionActive && lastRevealedRegionId) {
      const dismissed = getRegionDefinition(state, lastRevealedRegionId);
      const point = dismissed ? screenPoint(dismissed.display.labelPoint) : { x: MAP_RECT.x, y: MAP_RECT.y };
      panelReveal.close({ x: point.x * overviewCamera.zoom + overviewCamera.x,
        y: point.y * overviewCamera.zoom + overviewCamera.y });
      camera.restore(overviewCamera);
      tooltipView?.hide?.();
    }
    lastRevealedRegionId = regionSelectionActive ? selectedRegionId : null;
    landmarks=[];
    endDetailsTarget = null;

    const bg = new PIXI.Graphics();
    bg.beginFill(0x152426).drawRect(-3000, -2000, 8500, 5000).endFill();
    bg.eventMode = "none";
    mapContent.addChild(bg);
    const civilizationHeader = new PIXI.Graphics();
    roundedRect(
      civilizationHeader,
      CIVILIZATION_HEADER_RECT.x,
      CIVILIZATION_HEADER_RECT.y,
      CIVILIZATION_HEADER_RECT.width,
      CIVILIZATION_HEADER_RECT.height,
      8,
      PALETTE.panel,
      PALETTE.stroke,
      2
    );
    root.addChild(civilizationHeader);
    for (const [value, label, offset] of [
      [civilizationSummary.settlementCount, 'SETTLEMENTS', 94],
      [civilizationSummary.population.total, 'SOULS', 258],
    ]) {
      root.addChild(
        createText(String(value), { ...TEXT_STYLES.title, fontSize: 22 },
          CIVILIZATION_HEADER_RECT.x + offset, CIVILIZATION_HEADER_RECT.y + 5, 0.5),
        createText(label, { ...TEXT_STYLES.title, fontSize: 16 },
          CIVILIZATION_HEADER_RECT.x + offset, CIVILIZATION_HEADER_RECT.y + 32, 0.5)
      );
    }
    researchTarget = addButton(root,
      { x: CIVILIZATION_HEADER_RECT.x + 336, y: CIVILIZATION_HEADER_RECT.y + 4, width: 176, height: 46 },
      `${civilizationSummary.research ?? 0}\nRESEARCH ↗`, onOpenResearch, false,
      { fontSize: 20, lineHeight: 22, align: 'center' });
    endDetailsTarget = addCivilizationSurvivalStrip(root, {
      state,
      civilizationLossInfo,
      rect: { x: 590, y: 16, width: 1108, height: 54 },
      onOpenEndDetails,
    }).detailsTarget;

    const territoryBorders = [];
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
      const mapIndicator = regionMapIndicators.find(
        (indicator) => indicator.regionId === region.id
      );
      const highlighted = highlightedRegionIds.has(region.id);
      const relationship = getMapRelationship(relationships, region.id);
      const shape = new PIXI.Graphics();
      shape.beginFill(REGION_COLOURS[region.colour] ?? 0x777777, .04).drawPolygon(points).endFill();
      if (relationships && !relationship && !highlighted) {
        shape.beginFill(0x071216, .36).drawPolygon(points).endFill();
      }
      shape.eventMode = 'none';
      territoryBorders.push({points, player:region.controller==='player' && !region.monster,
        monster:!!region.monster, selected, highlighted, relationship, relationshipStyle:getRelationshipStyle(mapIndicator), controller:region.controller});
      const hit = new PIXI.Container();
      hit.hitArea = new PIXI.Polygon(points);
      hit.eventMode = "static";
      hit.cursor = "pointer";
      if (display.terrain !== false) addRegionTerrain(hit, points, region.colour, region.controller === "player" ? 1 : .74);
      hit.addChild(shape);
      if (region.monster && display.actors !== false) addMonsterGround(hit, points);
      hit.mapRegionId = region.id;
      hit.on("pointerover", () => {
        const pressure = mapIndicator?.pressure;
        const spending = Number(mapIndicator?.currencySpent ?? 0) > 0;
        const emptyCurrency = mapIndicator?.currency === 0;
        if (!pressure?.starvation && !pressure?.overcrowding && !spending && !emptyCurrency) return;
        const lines = [];
        if (pressure.starvation) {
          lines.push(
            `Starvation: ${pressure.starvationMigrants} people entered migration after the latest meal`,
            `Unfed meal demand: ${pressure.unfedMealDemand}`
          );
        }
        if (pressure.overcrowding) {
          lines.push(`Overcrowding: ${pressure.housingOverflow} people over housing capacity`);
        }
        if (spending) lines.push(`Gold spent this or last moon: ${mapIndicator.currencySpent}`);
        if (emptyCurrency) lines.push("Hosted Currency Stock is empty");
        tooltipView?.show?.({
          title: `${getRegionReference(state, region.id) ?? region.id} alerts`,
          lines,
        }, hit.getBounds(), { dismissOnExit: true });
      });
      hit.on("pointerout", () => tooltipView?.hide?.());
      mapContent.addChild(hit);
    }

    const edges = new PIXI.Graphics();
    for (const edge of state.world.connections) {
      const a = definition.regions.find((entry) => entry.id === edge.regionAId);
      const b = definition.regions.find((entry) => entry.id === edge.regionBId);
      const from = screenPoint(a.display.labelPoint);
      const to = screenPoint(b.display.labelPoint);
      edges.lineStyle(9, 0x141511, .8).moveTo(from.x, from.y).lineTo(to.x, to.y);
      edges.lineStyle(4, 0xb49562, .8).moveTo(from.x, from.y).lineTo(to.x, to.y);
      if (relationships) {
        const aKind = getMapRelationship(relationships, a.id);
        const bKind = getMapRelationship(relationships, b.id);
        if (aKind && bKind) {
          const aStyle = getRelationshipStyle(regionMapIndicators.find(entry => entry.regionId === a.id));
          const bStyle = getRelationshipStyle(regionMapIndicators.find(entry => entry.regionId === b.id));
          const style = aKind === 'selected' ? bStyle : bKind === 'selected' ? aStyle
            : aStyle.priority < bStyle.priority ? aStyle : bStyle;
          drawRelationshipLine(edges, from, to, style);
        }
      }
    }
    edges.eventMode = "none";
    edges.visible = display.connections !== false;
    mapContent.addChild(edges);
    // Draw borders after every terrain polygon and road, with selection last.
    // Neighboring terrain must not erase the important side of a shared edge.
    const borderPriority = territory => territory.selected ? 5 : territory.relationship === 'connected' ? territory.relationshipStyle.priority : 0;
    for (const territory of territoryBorders.sort((a,b)=>borderPriority(a)-borderPriority(b))) {
      addTerritoryBorder(mapContent, territory.points, territory);
    }

    for (const indicator of regionMapIndicators) {
      const regionDef = definition.regions.find(
        (entry) => entry.id === indicator.regionId
      );
      if (!regionDef) continue;
      const point = screenPoint(regionDef.display.labelPoint);
      const stockTagTop = getSettlementStockTagLayout(indicator.stockTags, point)[0]?.y;
      if (display.actors !== false && (indicator.monster || indicator.neutral)) mapContent.addChild(createText(
        indicator.monster ? `Defense ${indicator.monster.defense}` : `NEUTRAL · Defense ${indicator.neutral.defense}`,
        {...TEXT_STYLES.chip,fontSize:17,fill:indicator.monster?0xf0917b:0xf1d095,stroke:0x111713,strokeThickness:4},point.x,indicator.monster?point.y-72:stockTagTop!=null?stockTagTop-26:point.y-88,.5));
      if (display.actors !== false && indicator.monster) addMonsterMarker(mapContent, point, indicator.monster);
      const adornments = new PIXI.Container();
      adornments.position.set(point.x,point.y);
      adornments.scale.set(.75);
      adornments.eventMode = 'none';
      mapContent.addChild(adornments);
      if (indicator.hasDetailedSettlement && !indicator.monster) {
        addSettlementStockTags(mapContent, point, indicator.stockTags, {
          tooltipView, reference: getRegionReference(state, indicator.regionId) ?? indicator.regionId,
        });
        if (display.scenery !== false) {
          landmarks.push(addTimelineLandmark(mapContent,{x:point.x-29,y:point.y-76,width:58,height:66},
            {startSec:definition.regions.indexOf(regionDef)*.37}));
          landmarks.push(addTimelineLandmark(mapContent,{x:point.x+29,y:point.y-17,width:20,height:17},
            {kind:'fire',startSec:definition.regions.indexOf(regionDef)*.23}));
        }
        if (display.workers !== false) addWorkerIndicator(
          adornments,
          {x:0,y:65},
          indicator.activeWorkerCount,
          indicator.unusedWorkerCount
        );
      }
      if (indicator.showsPlayerMarker) {
        addPlayerOwnershipMarker(adornments, {x:0,y:0}, {
          selected:
            regionSelectionActive &&
            indicator.regionId === selectedRegionId,
        });
      }
      if (display.alerts !== false) {
        addSettlementPressureIndicator(adornments, {x:65,y:40}, indicator.pressure);
        addSettlementCurrencyIndicator(adornments, {x:65,y:35}, indicator);
      }
    }
    for (const regionDef of definition.regions) {
      const point = getRegionReferenceCorner(definition, regionDef)
        ?? screenPoint(regionDef.display.labelPoint);
      mapContent.addChild(createText(getRegionReference(state, regionDef.id) ?? "R??", {
        ...TEXT_STYLES.chip,
        fontSize: 21,
        fill: PALETTE.text, stroke: 0x111713, strokeThickness: 4,
      }, point.x, point.y, 0, 0));
    }

    const activeVassal = getCurrentLifeMapVassal(state);
    if (display.actors !== false && activeVassal?.locationRegionId) {
      const regionDef = definition.regions.find((entry) => entry.id === activeVassal.locationRegionId);
      if (regionDef) addActiveVassalMarker(mapContent, {x:screenPoint(regionDef.display.labelPoint).x-55,y:screenPoint(regionDef.display.labelPoint).y+12}, activeVassal, state);
    }

    if (chaosExpanded) {
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
      civilizationPanel.on("pointerover", () => {
        const reckoning = civilizationSummary.chaos.lastReckoning;
        const green = civilizationSummary.green;
        tooltipView?.show?.({
          title: `${green.label} · Chaos reckoning`,
          lines: [
            `Stored-food decay reduction: ${green.storedFoodDecayReduction}%`,
            `Elder old-age mortality reduction: ${green.elderMortalityReduction}%`,
            `Migration success: ${green.migrationSuccess}%`,
            `Primordial pressure: ${reckoning?.primordialPressure ?? 0}`,
            `Premature deaths: ${reckoning?.prematureDeaths ?? 0} · External emigrants: ${reckoning?.externalEmigrants ?? 0}`,
            `Premature pressure: ${reckoning?.prematureDeathPressure ?? 0} · Emigration pressure: ${reckoning?.externalEmigrationPressure ?? 0}`,
            `Old-age pressure: ${reckoning?.oldAgeDeathPressure ?? 0} · Internal migration pressure: ${reckoning?.internalMigrationPressure ?? 0}`,
            `Raw pressure: ${reckoning?.rawPressure ?? 0} · Resistance: ${reckoning?.resistance ?? 0}`,
            `Incoming Chaos: ${reckoning?.incomingChaos ?? 0} · Accumulated: ${civilizationSummary.chaos.chaosPower}`,
            `Monster regions: ${civilizationSummary.chaos.monsterCount}`,
          ],
        }, civilizationPanel.getBounds(), { dismissOnExit: true });
      });
      civilizationPanel.on("pointerout", () => tooltipView?.hide?.());
      root.addChild(civilizationPanel);
      addChaosPanelContent(root, CIVILIZATION_RECT, civilizationSummary);
    }
    addButton(root, { x: chaosExpanded ? CIVILIZATION_RECT.x + CIVILIZATION_RECT.width : 16, y: 92, width: chaosExpanded ? 44 : 180, height: 52 },
      chaosExpanded ? '<' : `Chaos ${civilizationSummary.chaos.chaosPower} >`, () => {
        chaosExpanded = !chaosExpanded;
        tooltipView?.hide?.();
        lastSignature = '';
      });
    const controlsX = regionSelectionActive ? DETAIL_RECT.x - 226 : MAP_VIEWPORT_RECT.x + MAP_VIEWPORT_RECT.width - 226;
    const cameraRight = regionSelectionActive ? DETAIL_RECT.x : MAP_VIEWPORT_RECT.x + MAP_VIEWPORT_RECT.width;
    addButton(root, {x: controlsX, y: 756, width: 52, height: 52}, '-', () => camera.zoomBy(1 / 1.2, cameraRight));
    addButton(root, {x: controlsX + 58, y: 756, width: 52, height: 52}, '+', () => camera.zoomBy(1.2, cameraRight));
    addButton(root, {x: controlsX + 116, y: 756, width: 98, height: 52}, 'Reset', () => {
      if (relationships) frameGroup();
      else camera.reset();
    });
    if (!regionSelectionActive) return;

    const selectedDef = getRegionDefinition(state, selectedRegionId);
    const region = getRegionState(state, selectedRegionId);
    const viewModel = getDetailedSettlementViewModel(state, selectedRegionId);
    if (!region) return;
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
    detailRoot.addChild(detailPanel);
    const regionRef = getRegionReference(state, selectedRegionId) ?? selectedRegionId;
    addRegionPanelContent(detailRoot, DETAIL_RECT, {
      region, reference: regionRef, name: viewModel?.name ?? selectedDef?.name ?? selectedRegionId,
      vm: viewModel, tooltipView, defense: region.monster?.defense ?? regionMapIndicators.find(entry => entry.regionId === selectedRegionId)?.neutral?.defense,
    });
    addButton(detailRoot, {x: DETAIL_RECT.x + DETAIL_RECT.width - 62, y: DETAIL_RECT.y + 14, width: 48, height: 48}, 'X', () => {
      tooltipView?.hide?.();
      onShowCivilizationGraph?.();
    });
  }

  return {
    init: () => {
      render(true);
      updateEdgeTransferPackets();
    },
    update: () => {
      if (!root.visible) return;
      camera.update();
      panelReveal.update();
      render();
      updateEdgeTransferPackets();
    },
    refresh: () => { lastSignature = ""; render(true); },
    resetEdgeTransferPackets,
    setVisible: (visible) => {
      if (panelReveal.isClosing()) camera.finish();
      camera.cancel();
      panelReveal.finish();
      root.visible = visible === true;
      detailRoot.visible = root.visible && getRegionSelectionActive?.() === true;
      viewport.visible = root.visible;
      clip.visible = root.visible;
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
        stockTransferIcons.beginFrame();
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
        relationships: getMapRelationships(state, regionId, root.visible && getRegionSelectionActive?.() === true),
        detailPanelVisible: root.visible && detailRoot.visible,
        chaosExpanded,
        camera: camera.snapshot(),
        focusAnimating: camera.isAnimating(),
        panelReveal: panelReveal.snapshot(),
        layout: { viewport: MAP_VIEWPORT_RECT, detail: DETAIL_RECT, chaos: CIVILIZATION_RECT, groupFrame: GROUP_FRAME_RECT },
        structureSlots: viewModel ? { visible: DEFAULT_REGION_STRUCTURE_CAPACITY_MAX, available: viewModel.structureCapacity, blocked: DEFAULT_REGION_STRUCTURE_CAPACITY_MAX - viewModel.structureCapacity } : null,
        graphScope:
          getGraphScope?.() === "settlement"
            ? "settlement"
            : "civilization",
        lastPointerRegionId,
        regionCount: getWorldDefinition(state)?.regions.length ?? 0,
        civilizationSummary,
        civilizationHeader: {
          labels: ['SETTLEMENTS', 'SOULS', 'RESEARCH'],
          researchPoint: root.visible && researchTarget && !researchTarget.destroyed
            ? researchTarget.toGlobal(new PIXI.Point(
                researchTarget.hitArea.x + researchTarget.hitArea.width / 2,
                researchTarget.hitArea.y + researchTarget.hitArea.height / 2))
            : null,
        },
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
        activeVassalLocationRegionId: getCurrentLifeMapVassal(state)?.locationRegionId ?? null,
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
            (visualTime() - packet.startedSec) / packet.durationSec;
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
            ...stockTransferIcons.snapshot(packet.transferId),
            kind: packet.kind ?? null,
            sourceRegionId: packet.sourceRegionId,
            destinationRegionId: packet.destinationRegionId,
            amount: packet.amount,
            reason: packet.reason ?? null,
            survivors: packet.survivors ?? packet.amount,
            arrivalDeaths: packet.arrivalDeaths ?? 0,
            reversed: edgeTransferPlaybackDirection < 0,
            playbackDirection: edgeTransferPlaybackDirection < 0 ? "backward" : "forward",
            progress: clamp01(rawProgress),
            x: pose.x,
            y: pose.y,
            angle: facing.angle,
            facingAngle: facing.angle,
            travelAngle: pose.angle + (edgeTransferPlaybackDirection < 0 ? Math.PI : 0),
          };
        }),
      };
    },
    getEndDetailsClickPoint: () => getSurvivalEndDetailsClickPoint(endDetailsTarget, root.visible),
    getRegionClickPoint: (regionId) => {
      const region = getRegionDefinition(getState?.(), regionId);
      return region ? camera.project(screenPoint(region.display.labelPoint)) : null;
    },
    getPracticeClickPoint: () => null,
    getInstalledPracticeClickPoint: () => null,
    destroy: () => {
      stockTransferIcons.clear();
      clearChildren(root);
      root.removeFromParent();
      root.destroy({ children: true });
      detailRoot.removeFromParent();
      detailRoot.destroy({ children: true });
      viewport.removeFromParent();
      viewport.destroy({ children: true });
      clip.removeFromParent();
      clip.destroy();
    },
  };
}
