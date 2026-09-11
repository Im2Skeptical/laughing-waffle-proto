import { sampleEventProgress } from './timeline-presentation.js';
import { createChronicleEffects, addTimelineLandmark } from './chronicle-effects-pixi.js';
import { addRegionTerrain, getArtRevision } from './chronicle-art.js';
import { addChaosPanelContent, addRegionPanelContent } from './chronicle-world-panels.js';
import {
  getConnectedRegionIds,
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
} from "./civilization-survival-hud.js";
import { clearChildren, createText, roundedRect } from "./settlement-view-primitives.js";
import { PALETTE, TEXT_STYLES } from "./settlement-theme.js";
import {
  CIVILIZATION_HEADER_RECT,
  CIVILIZATION_RECT,
  CONTROLLER_COLOURS,
  DETAIL_RECT,
  EDGE_TRANSFER_PACKET_MAX_ACTIVE,
  MAP_RECT,
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
  addStructureIndicator,
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

function addButton(parent, rect, label, onPress, disabled = false) {
  const root = new PIXI.Container();
  const gfx = new PIXI.Graphics();
  roundedRect(gfx, rect.x, rect.y, rect.width, rect.height, 7,
    disabled ? PALETTE.panelSoft : PALETTE.accent, PALETTE.stroke, 2);
  root.addChild(gfx, createText(label, {
    ...TEXT_STYLES.title,
    fill: disabled ? PALETTE.textMuted : 0x292622,
  }, rect.x + rect.width / 2, rect.y + rect.height / 2, 0.5, 0.5));
  root.eventMode = "static";
  // Map redraws can replace this button between input and the next paint.
  // Use map coordinates so the hit target needs no newly cached translation.
  root.hitArea = new PIXI.Rectangle(rect.x, rect.y, rect.width, rect.height);
  root.cursor = disabled ? "default" : "pointer";
  root.on("pointerdown", () => { if (!disabled) onPress?.(); });
  parent.addChild(root);
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
      practice?.tags?.includes("Currency"));
    return {
      regionId: regionDef.id,
      controller: region?.controller ?? null,
      showsPlayerMarker: region?.controller === "player",
      hasDetailedSettlement: viewModel != null,
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
  onShowCivilizationGraph,
  onShowSelectedRegionGraph,
  onOpenDetailedSite,
  getVassalHighlight,
  tooltipView = null,
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
  let edgeTransferPacketDescriptors = [];
  const visualTime=()=>getVisualTime?.()??getState?.()?.tSec??0;
  const effects=createChronicleEffects(edgeTransferLayer,visualTime);
  let landmarks=[];

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
      const index=routes.get(route)??0;routes.set(route,index+1);
      const from=screenPoint(source.display.labelPoint),to=screenPoint(destination.display.labelPoint);
      edgeTransferPacketDescriptors.push({...transfer,from,to,facingFrom:from,facingTo:to,
        laneOffset:[0,-9,9][index%3],startedSec:batch.boundarySec+index*.06,durationSec:1.8});
    }
    edgeTransferPacketDescriptors=edgeTransferPacketDescriptors.slice(0,EDGE_TRANSFER_PACKET_MAX_ACTIVE);
  }

  function drawEdgeTransferPackets(timeSec) {
    edgeTransferGraphics.clear();
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
    edgeTransferPacketDescriptors = [];
    edgeTransferGraphics.clear();
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
    const nextSignature = getArtRevision() + signature(
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
    landmarks=[];

    const bg = new PIXI.Graphics();
    bg.beginFill(PALETTE.background).drawRect(36, 78, 2352, 748).endFill();
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
    root.addChild(
      bg,
      civilizationHeader,
      createText(
        `${civilizationSummary.settlementCount} SETTLEMENTS  ·  ${civilizationSummary.population.total} SOULS\nFood ${Math.round(civilizationSummary.food.total)}   /   Research ${civilizationSummary.research ?? 0}`,
        { ...TEXT_STYLES.title, fontSize: 20, lineHeight: 23 },
        CIVILIZATION_HEADER_RECT.x + 20,
        CIVILIZATION_HEADER_RECT.y + 27,
        0,
        0.5
      )
    );
    addCivilizationSurvivalStrip(root, {
      state,
      civilizationLossInfo,
      rect: { x: 590, y: 16, width: 1108, height: 54 },
    });

    const mapPanel = new PIXI.Graphics();
    roundedRect(mapPanel, MAP_RECT.x, MAP_RECT.y, MAP_RECT.width, MAP_RECT.height, 7,
      0x152426, PALETTE.stroke, 3);
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
      const mapIndicator = regionMapIndicators.find(
        (indicator) => indicator.regionId === region.id
      );
      const highlighted = highlightedRegionIds.has(region.id);
      const shape = new PIXI.Graphics();
      shape.lineStyle(selected || highlighted ? 5 : 2,
        highlighted ? 0xf0d269 : selected ? PALETTE.accent : CONTROLLER_COLOURS[region.controller] ?? 0x777777, 1);
      shape.beginFill(REGION_COLOURS[region.colour] ?? 0x777777, selected || highlighted ? 0.2 : 0.04);
      shape.drawPolygon(points);
      shape.endFill();
      const hit = new PIXI.Container();
      hit.hitArea = new PIXI.Polygon(points);
      hit.eventMode = "static";
      hit.cursor = "pointer";
      addRegionTerrain(hit, points, region.colour, region.controller === "player" ? 1 : .74);
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
        if (emptyCurrency) lines.push("Gold reserve is empty");
        tooltipView?.show?.({
          title: `${getRegionReference(state, region.id) ?? region.id} alerts`,
          lines,
        }, hit.getBounds(), { dismissOnExit: true });
      });
      hit.on("pointerout", () => tooltipView?.hide?.());
      root.addChild(hit);
    }

    const edges = new PIXI.Graphics();
    for (const edge of state.world.connections) {
      const a = definition.regions.find((entry) => entry.id === edge.regionAId);
      const b = definition.regions.find((entry) => entry.id === edge.regionBId);
      const from = screenPoint(a.display.labelPoint);
      const to = screenPoint(b.display.labelPoint);
      edges.lineStyle(9, 0x141511, .8).moveTo(from.x, from.y).lineTo(to.x, to.y);
      edges.lineStyle(4, 0xb49562, .8).moveTo(from.x, from.y).lineTo(to.x, to.y);
    }
    edges.eventMode = "none";
    root.addChild(edges);

    for (const indicator of regionMapIndicators) {
      const regionDef = definition.regions.find(
        (entry) => entry.id === indicator.regionId
      );
      if (!regionDef) continue;
      const point = screenPoint(regionDef.display.labelPoint);
      if (indicator.hasDetailedSettlement) {
        landmarks.push(addTimelineLandmark(root,{x:point.x-100,y:point.y-102,width:104,height:118},
          {startSec:definition.regions.indexOf(regionDef)*.37}));
        landmarks.push(addTimelineLandmark(root,{x:point.x+58,y:point.y-21,width:42,height:35},
          {kind:'fire',startSec:definition.regions.indexOf(regionDef)*.23}));
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
      addSettlementPressureIndicator(root, point, indicator.pressure);
      addSettlementCurrencyIndicator(root, point, indicator);
    }
    for (const regionDef of definition.regions) {
      const point = getRegionReferenceCorner(definition, regionDef)
        ?? screenPoint(regionDef.display.labelPoint);
      root.addChild(createText(getRegionReference(state, regionDef.id) ?? "R??", {
        ...TEXT_STYLES.chip,
        fontSize: 21,
        fill: PALETTE.text, stroke: 0x111713, strokeThickness: 4,
      }, point.x, point.y, 0, 0));
    }

    const activeVassal = getCurrentLifeMapVassal(state);
    if (activeVassal?.locationRegionId) {
      const regionDef = definition.regions.find((entry) => entry.id === activeVassal.locationRegionId);
      if (regionDef) addActiveVassalMarker(root, screenPoint(regionDef.display.labelPoint), activeVassal, state);
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
          `Monsters: ${civilizationSummary.chaos.monsterCount}/${civilizationSummary.chaos.monsterLossThreshold}`,
        ],
      }, civilizationPanel.getBounds(), { dismissOnExit: true });
    });
    civilizationPanel.on("pointerout", () => tooltipView?.hide?.());
    root.addChild(civilizationPanel);
    addChaosPanelContent(root, CIVILIZATION_RECT, civilizationSummary);

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
    addRegionPanelContent(root, DETAIL_RECT, {
      region, reference: regionRef, name: viewModel?.name ?? selectedDef?.name ?? selectedRegionId,
      vm: viewModel, tooltipView,
    });
    addButton(root, {
      x: DETAIL_RECT.x + 24,
      y: DETAIL_RECT.y + DETAIL_RECT.height - 70,
      // Leave the lower-right corner to the enlarged timepiece.
      width: 312,
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
