import {regionalReadoutVariant,addRegionalReadoutPrototype,updateRegionalReadoutScale,addAtlasFocus,ATLAS_ECONOMY_POINT,getFloatingReadoutMeasurements,getMonsterReadoutMeasurements} from './world-map/regional-readout-prototype.js';
import { getRegionTerrainStyle, getRegionNameColour } from './world-map/region-style.js';
import { addFerryCrossing, roadBorderCrossings, landRoadSections } from './world-map/road-crossings.js';
import { minimalGraphics } from './minimal-graphics.js';
import { createRegionLabel } from './region-label.js';
import { createTradeFlowHistory, getGhostPacketAgeSec, pruneGhostPackets, ghostsFromReplacedBatch, getGhostPacketAlpha, getPacketTrailSteps, getTradeCorridorWidth } from "./world-map/trade-corridors.js";
import { getMoonCycleDurationSec } from "../model/moon-phases.js";
import { addMonsterGround, addMonsterMarker, addTerritoryBorder, territoryBoundarySegments } from './world-map/territory-art.js';
import { createIllustratedTerrain } from './world-map/illustrated-terrain.js';
import { getMapRelationships, getMapRelationship, getRelationshipStyle, drawRelationshipLine, drawRelationshipPath } from './world-map/relationships.js';
import { createMapCamera } from './world-map/camera.js';
import { createMapPanelReveal } from './world-map/transitions.js';
import { createStockTransferIcons, getStockTransferIconLayout } from './world-map/stock-transfer-icons.js';
import { getSettlementStockTags, addSettlementStockTags } from './world-map/stock-tags.js';
import {createMapStockCoverage} from './world-map/stock-coverage.js';
import {getMapInfluencePresentation,addMapInfluenceMarker} from './world-map/influence-marker.js';
import { DEFAULT_REGION_STRUCTURE_CAPACITY_MAX } from '../defs/world/detailed-settlement-scenario.js';
import { sampleEventProgress } from './timeline-presentation.js';
import { createChronicleEffects, addTimelineLandmark } from './chronicle-effects-pixi.js';
import { addRegionTerrain, getArtRevision } from './chronicle-art.js';
import { addChaosPanelContent, addCollapsedChaosControl } from './chronicle-world-panels.js';
import { formatChaosValue } from '../model/chaos-values.js';
import { createRegionPanelCache } from './world-map/region-panel-cache.js';
import { createMapPolygonReader } from './world-map/geometry.js';
import { createRetainedMapScene } from './world-map/retained-scene.js';
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
  getMonsterThreat,
} from "../model/detailed-settlements.js";
import { getCurrentLifeMapVassal, getVassalAge } from "../model/vassal-life-map.js";
import {
  addCivilizationSurvivalStrip,
  getCivilizationSurvivalViewModel,
  getSurvivalEndDetailsClickPoint,
} from "./civilization-survival-hud.js";
import { clearChildren, createText, roundedRect } from "./settlement-view-primitives.js";
import { PALETTE, TEXT_STYLES } from "./settlement-theme.js";
import { addNeutralMarketGlyph } from './neutral-market-pixi.js';
import {
  CIVILIZATION_HEADER_RECT,
  CIVILIZATION_RECT,
  DETAIL_RECT,
  EDGE_TRANSFER_PACKET_MAX_ACTIVE,
  MAP_RECT,
  GROUP_FRAME_RECT,
  MAP_VIEWPORT_RECT,
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
  addCrownCapitalMarker,
  addRegionPrestigeBadge,
  addSettlementCurrencyIndicator,
  addSettlementStarvationIndicator,
} from "./world-map/glyphs.js";

export {
  getEdgeTransferPacketFacing,
  getEdgeTransferPacketGlyphSpec,
  getEdgeTransferPacketPose,
  getEdgeTransferPacketVisualSpec,
  resolveEdgeTransferPlaybackDirection,
};

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

function getRegionReferenceCorner(definition, regionDef, project = screenPoint, polygon = region => getRegionPolygon(definition,region)) {
  const points = polygon(regionDef);
  if (!points.length) return null;
  const corner = points.reduce((best, point) =>
    point.x + point.y < best.x + best.y ? point : best
  );
  const center = regionDef?.display?.labelPoint ?? corner;
  // Pull the label just inside the nearest top-left vertex, leaving the
  // settlement glyphs at the authored display point unobstructed.
  return project({
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
  const coverage=createMapStockCoverage(state);
  return definition.regions.map((regionDef) => {
    const region = getRegionState(state, regionDef.id);
    const viewModel = getDetailedSettlementViewModel(state, regionDef.id);
    const monsterThreat=getMonsterThreat(state,regionDef.id);
    const activeWorkerCount = getActiveWorkerCount(viewModel);
    const unusedWorkerCount = getUnusedWorkerCount(viewModel);
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
      monsterThreat:monsterThreat?{...monsterThreat,targetName:monsterThreat.targetRegionId?getRegionReference(state,monsterThreat.targetRegionId):null}:null,
      neutral: (state.world.sites ?? []).find(s=>s.regionId===regionDef.id)?.neutral ?? null,
      showsPlayerMarker:false,
      prestigePopulationPerPoint:viewModel?.prestigePopulationPerPoint,
      prestigePerNode:viewModel?.prestigePerNode??null,
      influence:getMapInfluencePresentation(viewModel?.control,{monster:!!region?.monster}),
      crownCapital:state.rulesetId&&region?.controller==='external-a'&&state.civilization.remnant?.capitalRegionId===regionDef.id&&!region?.monster,
      independent:!!(state.rulesetId&&region?.controller==='frontier'&&viewModel?.population?.total>0&&!viewModel?.control?.support?.player&&!viewModel?.control?.support?.['external-a']),
      hasDetailedSettlement: viewModel != null,
      stockTags: getSettlementStockTags(viewModel,{state,regionId:regionDef.id,coverage}),
      activeWorkerCount,unusedWorkerCount,totalWorkerCount:activeWorkerCount+unusedWorkerCount,
      renderedActivePawnCount:0,renderedUnusedPawnCount:0,renderedPawnCount:0,badgeValue:null,
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
    worldDefinitionId:state?.world?.definitionId,
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
  getStateRevision,
  getEdgeTransferBatch,
  isTradeScrubSkipping = null,
  getScrubTradeTransfers = null,
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
  const atlasMode=regionalReadoutVariant()==='atlas';
  const floatingMode=regionalReadoutVariant()==='floating';
  let prototypeEconomyExpanded=false,lastPrototypePanelMode=null;
  let floatingNameLabels=[];
  const floatingOverlay=new PIXI.Container();floatingOverlay.label='floating-readout-overlay';
  let floatingReferenceLayer=null;
  const root = new PIXI.Container();
  const detailRoot = new PIXI.Container();
  const panelReveal = createMapPanelReveal(detailRoot, DETAIL_RECT);
  const edgeTransferLayer = new PIXI.Container();
  const edgeTransferGraphics = new PIXI.Graphics();
  edgeTransferLayer.eventMode = "none";
  edgeTransferGraphics.eventMode = "none";
  const tradeCorridorGraphics = new PIXI.Graphics();
  tradeCorridorGraphics.eventMode = "none";
  edgeTransferLayer.addChild(tradeCorridorGraphics, edgeTransferGraphics);
  const tradeFlowHistory = createTradeFlowHistory();
  let ghostEdgeTransferPackets = [];
  let lastEdgeTransferDescriptorBoundarySec = null;
  const stockTransferIcons = createStockTransferIcons(edgeTransferLayer);
  const viewport = new PIXI.Container();
  const world = new PIXI.Container();
  const mapContent = new PIXI.Container();
  const retained=createRetainedMapScene();
  let retainedDefinition=null;
  const unavailableFilter = new PIXI.filters.ColorMatrixFilter();
  unavailableFilter.desaturate();
  unavailableFilter.brightness(.38, true);
  const clip = new PIXI.Graphics().beginFill(0xffffff)
    .drawRect(MAP_VIEWPORT_RECT.x, MAP_VIEWPORT_RECT.y, MAP_VIEWPORT_RECT.width, MAP_VIEWPORT_RECT.height).endFill();
  viewport.addChild(world);
  const illustratedWidth=MAP_RECT.height*1576/516;
  const illustratedRect={...MAP_RECT,x:MAP_RECT.x+(MAP_RECT.width-illustratedWidth)/2,width:illustratedWidth};
  const createTerrain=()=>createIllustratedTerrain(world,illustratedRect,{getView:()=>{
    const pose=camera.snapshot();
    return {minX:((MAP_VIEWPORT_RECT.x-pose.x)/pose.zoom-illustratedRect.x)/illustratedRect.width,
      minY:((MAP_VIEWPORT_RECT.y-pose.y)/pose.zoom-illustratedRect.y)/illustratedRect.height,
      maxX:((MAP_VIEWPORT_RECT.x+MAP_VIEWPORT_RECT.width-pose.x)/pose.zoom-illustratedRect.x)/illustratedRect.width,
      maxY:((MAP_VIEWPORT_RECT.y+MAP_VIEWPORT_RECT.height-pose.y)/pose.zoom-illustratedRect.y)/illustratedRect.height,zoom:pose.zoom};
  }});
  let illustrated=createTerrain();
  // Use the workbench's aspect ratio for both artwork and gameplay projection.
  const screenPoint=point=>{
    const rect=illustrated.supports(getState?.())?illustratedRect:MAP_RECT;
    return {x:rect.x+Number(point?.x??0)*rect.width,y:rect.y+Number(point?.y??0)*rect.height};
  };
  const sitePoint=region=>screenPoint((illustrated.supports(getState?.())?illustrated.sitePoint(region.id):null)??region.display.labelPoint);
  world.addChild(mapContent, edgeTransferLayer);
  viewport.mask = clip;
  layer.addChild(viewport, clip, root, detailRoot);
  const camera = createMapCamera(viewport, world, MAP_VIEWPORT_RECT, {
    getWorldBounds:()=>{
      const bounds=illustrated.worldBounds();if(!bounds)return null;
      return {x:illustratedRect.x+bounds.minX*illustratedRect.width,y:illustratedRect.y+bounds.minY*illustratedRect.height,
        width:(bounds.maxX-bounds.minX)*illustratedRect.width,height:(bounds.maxY-bounds.minY)*illustratedRect.height};
    },
    getViewRect:()=>getRegionSelectionActive?.()===true&&(!atlasMode||prototypeEconomyExpanded)?{...MAP_VIEWPORT_RECT,width:DETAIL_RECT.x-MAP_VIEWPORT_RECT.x}:MAP_VIEWPORT_RECT,
    onTap: handleMapTap,
    onGesture: () => {
      tooltipView?.hide?.();
      lastRegionTap = { regionId: null, atMs: -Infinity, nearFlag: false };
    },
  });
  let chaosExpanded = !atlasMode;
  let lastRevealedRegionId = null;
  let overviewCamera = camera.snapshot();
  let preparedWorldId=null;
  function fitOverview() {
    const state=getState?.(),definition=getWorldDefinition(state);
    if(!illustrated.supports(state)||!definition){camera.reset();return;}
    const points=definition.geometry.vertices.map(screenPoint),xs=points.map(p=>p.x),ys=points.map(p=>p.y);
    const left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...ys),bottom=Math.max(...ys);
    const zoom=Math.min(1,(MAP_VIEWPORT_RECT.width-180)/(right-left),(MAP_VIEWPORT_RECT.height-(atlasMode?80:130))/(bottom-top));
    camera.restore({zoom,x:MAP_VIEWPORT_RECT.x+MAP_VIEWPORT_RECT.width/2-(left+right)/2*zoom,
      y:MAP_VIEWPORT_RECT.y+MAP_VIEWPORT_RECT.height/2-(top+bottom)/2*zoom});camera.finish();overviewCamera=camera.snapshot();
  }
  let lastSignature = "";
  let lastInputs=null,presentationReads=0;
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
  const regionPanels = createRegionPanelCache({
    rect: DETAIL_RECT, addCloseButton: addButton,
    onClose: () => { tooltipView?.hide?.(); onShowCivilizationGraph?.(); },
  });

  function getRegionPanel(state, regionId, settlementScope, indicators = []) {
    const region = getRegionState(state, regionId);
    if (!region) return null;
    const vm = getDetailedSettlementViewModel(state, regionId);
    return regionPanels.get(regionId, {
      region, reference: getRegionReference(state, regionId) ?? regionId,
      name: vm?.name ?? getRegionDefinition(state, regionId)?.name ?? regionId,
      vm, tooltipView,
      defense: region.monster?.defense ?? indicators.find(entry => entry.regionId === regionId)?.neutral?.defense,
    }, { settlementScope, artRevision: getArtRevision() });
  }

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
    if(atlasMode&&regionId!==getSelectedRegionId?.())prototypeEconomyExpanded=false;
    const state = getState?.();
    const regionDef = getRegionDefinition(state, regionId);
    if (!regionDef) {
      lastRegionTap = { regionId: null, atMs: -Infinity, nearFlag: false };
      onShowCivilizationGraph?.();
      return;
    }
    const flagPoint = camera.project(sitePoint(regionDef));
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
    if(batch?.transfers?.length)tradeFlowHistory.record(batch.boundarySec,batch.transfers);
    if(isTradeScrubSkipping?.()===true){
      const journal=getScrubTradeTransfers?.();
      if(journal?.transfers?.length)tradeFlowHistory.record(journal.tSec,journal.transfers);
    }
    const key=getEdgeTransferBatchKey(batch);
    if(key===lastEdgeTransferBatchKey)return;
    lastEdgeTransferBatchKey=key;
    // Keep the outgoing packets as fading ghosts so slow scrub reads as flow.
    // Outgoing packets become ghosts only when moving forward; a rewind drops
    // them so nothing renders ahead of the viewed time.
    // Same-boundary replacements (timeline edits) and null batches drop them.
    ghostEdgeTransferPackets=ghostsFromReplacedBatch(edgeTransferPacketDescriptors,{previousBoundarySec:lastEdgeTransferDescriptorBoundarySec,
      nextBoundarySec:batch?.boundarySec,direction,viewedSec,max:EDGE_TRANSFER_PACKET_MAX_ACTIVE});
    lastEdgeTransferDescriptorBoundarySec=Number.isFinite(batch?.boundarySec)?batch.boundarySec:null;
    edgeTransferPacketDescriptors=[];
    const routes=new Map();
    for(const transfer of batch?.transfers??[]){
      const source=definition.regions.find(r=>r.id===transfer.sourceRegionId);
      const destination=definition.regions.find(r=>r.id===transfer.destinationRegionId);
      if(!source||!destination)continue;
      const route=transfer.sourceRegionId+'>'+transfer.destinationRegionId;
      const routeInfo=routes.get(route)??{count:0,spacing:9};
      const index=routeInfo.count++;
      const from=sitePoint(source),to=sitePoint(destination);
      const packet={...transfer,from,to,path:transferRoadPath(source,destination),facingFrom:from,facingTo:to,route,lane:[0,-1,1][index%3],
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

  function transferRoadPath(source,destination) {
    const edge=getState?.()?.world?.connections?.find(e=>[e.regionAId,e.regionBId].includes(source.id)&&[e.regionAId,e.regionBId].includes(destination.id));
    const points=edge&&illustrated.roadPoints(edge)?.map(screenPoint);
    if(!points?.length)return [sitePoint(source),sitePoint(destination)];
    const start=sitePoint(source);
    if(Math.hypot(points[0].x-start.x,points[0].y-start.y)>Math.hypot(points.at(-1).x-start.x,points.at(-1).y-start.y))points.reverse();
    return points;
  }
  const TRADE_GOLD = 0xd8b25a, TRADE_INK = 0x302d2a;
  function drawCorridorArrow(g, from, to, width, color, alpha, path) {
    const tip=getEdgeTransferPacketPose({path,progress:.88});
    from={x:tip.x-tip.directionX,y:tip.y-tip.directionY};to=tip;
    const dx=to.x-from.x, dy=to.y-from.y, len=Math.hypot(dx,dy);
    if(len<0.001)return;
    const ux=dx/len, uy=dy/len, px=-uy, py=ux, inset=0;
    const bx=to.x-ux*inset, by=to.y-uy*inset;
    const head=width*1.6+4;
    const sx=bx-ux*head, sy=by-uy*head;
    // Ink outline, then a stepped two-tone band for the pixel-art bevel.
    g.lineStyle(width*1.4+2,TRADE_INK,alpha*0.9);g.moveTo(path[0].x,path[0].y);for(const p of path.slice(1))g.lineTo(p.x,p.y);
    g.lineStyle(width,color,alpha);g.moveTo(path[0].x,path[0].y);for(const p of path.slice(1))g.lineTo(p.x,p.y);
    g.lineStyle(Math.max(1,Math.round(width/3)),0xf4e2a8,alpha*0.55);g.moveTo(path[0].x,path[0].y);for(const p of path.slice(1))g.lineTo(p.x,p.y);
    g.lineStyle(2,TRADE_INK,alpha*0.9);g.beginFill(color,alpha);
    g.drawPolygon([bx,by,sx+px*head*0.8,sy+py*head*0.8,sx-px*head*0.8,sy-py*head*0.8]);
    g.endFill();
  }
  function drawTradeCorridors(definition, timeSec, dragging) {
    tradeCorridorGraphics.clear();
    if(!definition)return;
    const state=getState?.();
    const windowSec=Math.max(48,getMoonCycleDurationSec(state)*24);
    const flows=tradeFlowHistory.netFlows(timeSec,windowSec);
    const zoom=Math.max(0.25,camera.snapshot().zoom||1);
    for(const flow of flows){
      const source=definition.regions.find(r=>r.id===flow.from), destination=definition.regions.find(r=>r.id===flow.to);
      if(!source||!destination)continue;
      const alpha=dragging?0.6+0.3*flow.intensity:0.3;
      // Keep corridor width constant on screen so it reads at overview zoom.
      drawCorridorArrow(tradeCorridorGraphics,sitePoint(source),sitePoint(destination),getTradeCorridorWidth(flow.intensity,dragging)/zoom,TRADE_GOLD,alpha,transferRoadPath(source,destination));
    }
  }
  function drawGhostPacket(packet, progress, alpha) {
    if(alpha<=0.01)return;
    const pose=getEdgeTransferPacketPose({path:packet.path,from:packet.from,to:packet.to,progress,laneOffset:packet.laneOffset});
    const color=packet.glyph?.color??TRADE_GOLD;
    edgeTransferGraphics.lineStyle(1.5,TRADE_INK,alpha);
    edgeTransferGraphics.beginFill(color,alpha);
    edgeTransferGraphics.drawCircle(pose.x,pose.y,6/Math.max(0.25,camera.snapshot().zoom||1));
    edgeTransferGraphics.endFill();
  }
  function drawEdgeTransferPackets(timeSec) {
    edgeTransferGraphics.clear();
    stockTransferIcons.beginFrame();
    if(regionalReadoutVariant()&&getRegionSelectionActive?.()!==true){tradeCorridorGraphics.clear();return;}
    const definition=getWorldDefinition(getState?.());
    const dragging=isTradeScrubSkipping?.()===true;
    drawTradeCorridors(definition,timeSec,dragging);
    if(dragging){activeEdgeTransferPackets=[];return;}
    const ghostFadeSec=Math.max(4,getMoonCycleDurationSec(getState?.())*2);
    ghostEdgeTransferPackets=pruneGhostPackets(ghostEdgeTransferPackets,timeSec);
    for(const packet of ghostEdgeTransferPackets){
      drawGhostPacket(packet,0.92,getGhostPacketAlpha(getGhostPacketAgeSec(packet,timeSec),ghostFadeSec+packet.durationSec));
    }
    const surviving = [];
    for (const packet of edgeTransferPacketDescriptors) {
      const rawProgress=sampleEventProgress(timeSec,packet.startedSec,packet.durationSec);
      if(rawProgress==null){
        const age=getGhostPacketAgeSec(packet,timeSec);
        if(age!=null)drawGhostPacket(packet,0.92,getGhostPacketAlpha(age,ghostFadeSec));
        continue;
      }
      surviving.push(packet);
      for(const dot of getPacketTrailSteps(rawProgress)){
        const p=getEdgeTransferPacketPose({path:packet.path,from:packet.from,to:packet.to,progress:dot.progress,laneOffset:packet.laneOffset});
        edgeTransferGraphics.lineStyle(0);
        edgeTransferGraphics.beginFill(packet.glyph?.color??TRADE_GOLD,dot.alpha*Math.min(1,rawProgress/0.12));
        edgeTransferGraphics.drawRect(Math.round(p.x)-3*dot.scale-1,Math.round(p.y)-3*dot.scale-1,6*dot.scale+2,6*dot.scale+2);
        edgeTransferGraphics.endFill();
      }
      const pose = getEdgeTransferPacketPose({
        path: packet.path,
        from: packet.from,
        to: packet.to,
        progress: rawProgress,
        laneOffset: packet.laneOffset,
      });
      const facing = pose;
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
    ghostEdgeTransferPackets = [];
    lastEdgeTransferDescriptorBoundarySec = null;
    tradeFlowHistory.clear();
    tradeCorridorGraphics.clear();
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
    const graphScope =
      getGraphScope?.() === "settlement" ? "settlement" : "civilization";
    const civilizationLossInfo = getCivilizationLossInfo?.() ?? null;
    const survivalTracker = getCivilizationSurvivalViewModel(
      state,
      civilizationLossInfo
    );
    const display = getDisplayOptions?.() ?? {};
    const vassalHighlight = getVassalHighlight?.() ?? null;
    const revision=getStateRevision?.();
    // Opt in only when the caller supplies a revision for same-second edits.
    // Editors without that contract retain exact input inspection each frame.
    const uiKey=JSON.stringify([selectedRegionId,regionSelectionActive,graphScope,display,survivalTracker,vassalHighlight,getArtRevision(),chaosExpanded,prototypeEconomyExpanded]);
    if(!force&&lastSignature&&revision!=null&&lastInputs?.state===state&&lastInputs.definition===definition
      &&lastInputs.second===state.tSec&&lastInputs.revision===revision&&lastInputs.uiKey===uiKey)return;
    lastInputs={state,definition,second:state.tSec,revision,uiKey};presentationReads++;
    const relationships = getMapRelationships(state, selectedRegionId, regionSelectionActive);
    const focusFrame=atlasMode&&!prototypeEconomyExpanded?{x:150,y:160,width:2100,height:560}:GROUP_FRAME_RECT;
    const frameGroup = () => camera.frame(definition.regions
      .filter(entry => relationships?.groupRegionIds.includes(entry.id))
      .flatMap(entry => polygon(entry).map(screenPoint)), focusFrame,
      sitePoint(getRegionDefinition(state, selectedRegionId)));
    const civilizationSummary = getDetailedCivilizationSummary(state);
    const regionMapIndicators = buildRegionMapIndicators(state, definition);
    const illustratedMap=illustrated.supports(state);
    illustrated.container.visible=illustratedMap&&display.terrain!==false;
    if(illustratedMap)illustrated.setState(state,display);
    // Optional choice presentation. Omitted in normal gameplay; affects no rules.
    const choiceRegionIds = display.choiceRegionIds == null ? null : new Set(display.choiceRegionIds);
    const presentRegion = (container, regionId) => {
      if (choiceRegionIds && !choiceRegionIds.has(regionId)) container.filters = [unavailableFilter];
      return container;
    };
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
    // Explicit refresh also covers editor changes to a definition in place.
    if(force||retainedDefinition!==definition){retained.clear();retainedDefinition=definition;}
    const polygon=createMapPolygonReader(definition);
    // Retain the last settlement's content until its dismissal completes.
    if (regionSelectionActive) detailRoot.removeChildren();
    const panelMode=atlasMode&&!prototypeEconomyExpanded?'glance':'economy';
    if (regionSelectionActive && (selectedRegionId !== lastRevealedRegionId||panelMode!==lastPrototypePanelMode)) {
      if (!lastRevealedRegionId && !panelReveal.isClosing()) overviewCamera = camera.snapshot();
      const selected = getRegionDefinition(state, selectedRegionId);
      if (selected) {
        const point = sitePoint(selected);
        if (!lastRevealedRegionId) panelReveal.open(camera.project(point));
        frameGroup();
        tooltipView?.hide?.();
      }
    }
    if (!regionSelectionActive && lastRevealedRegionId) {
      const dismissed = getRegionDefinition(state, lastRevealedRegionId);
      const point = dismissed ? sitePoint(dismissed) : { x: MAP_RECT.x, y: MAP_RECT.y };
      panelReveal.close({ x: point.x * overviewCamera.zoom + overviewCamera.x,
        y: point.y * overviewCamera.zoom + overviewCamera.y });
      camera.restore(overviewCamera);
      tooltipView?.hide?.();
    }
    lastRevealedRegionId = regionSelectionActive ? selectedRegionId : null;
    lastPrototypePanelMode=panelMode;
    if(!regionSelectionActive)prototypeEconomyExpanded=false;
    const chrome=display.chrome!==false;
    retained.update(root,'header',[getArtRevision(),civilizationSummary.settlementCount,civilizationSummary.population.total,civilizationSummary.research],root=>{
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
    }).node.visible=chrome;
    const survivalSection=retained.update(root,'survival',[getArtRevision(),survivalTracker],root=>addCivilizationSurvivalStrip(root, {
      state,
      civilizationLossInfo,
      rect: { x: 590, y: 16, width: 1108, height: 54 },
      onOpenEndDetails,
    }).detailsTarget);
    endDetailsTarget=survivalSection.value;survivalSection.node.visible=chrome;

    landmarks=retained.update(mapContent,'regions',{
      art:getArtRevision(),display,illustratedMap,selectedRegionId,regionSelectionActive,relationships,vassalHighlight,
      regions:state.world.regions.map(r=>[r.id,r.colour,r.controller,!!r.monster]),connections:state.world.connections,
      indicators:regionMapIndicators.map(i=>({...i,monster:i.monster?{defense:i.monster.defense}:null,neutral:!!i.neutral})),
    },mapContent=>{
    const layerLandmarks=[];
    if(floatingMode)clearChildren(floatingOverlay);
    if(!illustratedMap){
      const bg=new PIXI.Graphics();bg.beginFill(0x152426).drawRect(-3000,-2000,8500,5000).endFill();
      bg.eventMode='none';mapContent.addChild(bg);
    }

    const territoryBorders = [];
    const highlightedRegionIds = new Set([
      vassalHighlight?.targetRegionId,
      vassalHighlight?.intervention?.regionAId,
      vassalHighlight?.intervention?.regionBId,
    ].filter(Boolean));
    for (const regionDef of definition.regions) {
      const region = getRegionState(state, regionDef.id);
      const points = polygon(regionDef).flatMap((point) => {
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
      shape.beginFill(getRegionTerrainStyle(regionDef.biome, region.colour).fill, .04).drawPolygon(points).endFill();
      if (relationships && !relationship && !highlighted) {
        shape.beginFill(0x071216, .36).drawPolygon(points).endFill();
      }
      shape.eventMode = 'none';
      territoryBorders.push({points, regionId:region.id, player:region.controller==='player' && !region.monster,
        crown:!!state.rulesetId&&region.controller==='external-a'&&!region.monster,
        monster:!!region.monster, selected, highlighted, relationship, relationshipStyle:getRelationshipStyle(mapIndicator), controller:region.controller});
      const hit = new PIXI.Container();
      hit.hitArea = new PIXI.Polygon(points);
      hit.eventMode = "static";
      hit.cursor = !choiceRegionIds || choiceRegionIds.has(region.id) ? 'pointer' : 'default';
      if (!illustratedMap&&display.terrain !== false) addRegionTerrain(hit, points, region.colour, region.controller === "player" ? 1 : .74, regionDef.biome);
      hit.addChild(shape);
      if (!illustratedMap && region.monster && display.actors !== false) addMonsterGround(hit, points);
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
      mapContent.addChild(presentRegion(hit, region.id));
    }

    const roadPaths=[];
    for (const edge of state.world.connections) {
      const edges = new PIXI.Graphics();
      const a = definition.regions.find((entry) => entry.id === edge.regionAId);
      const b = definition.regions.find((entry) => entry.id === edge.regionBId);
      const from = sitePoint(a);
      const to = sitePoint(b);
      const route=illustratedMap?illustrated.roadPoints(edge)?.map(screenPoint):null;
      const ferries=illustratedMap?illustrated.roadFerries(edge).map(f=>({points:f.points.map(screenPoint)})):[];
      const landSections=route?landRoadSections(route,ferries):[];
      roadPaths.push(...landSections);
      if(display.connections!==false)for(const ferry of ferries) {
        const crossing=addFerryCrossing(mapContent,ferry.points);
        crossing.root.connectionId=[a.id,b.id].sort().join(':');
        crossing.root.islandCrossing=a.biome==='islands'||b.biome==='islands';
        crossing.sample(visualTime());
        if(choiceRegionIds&&(!choiceRegionIds.has(a.id)||!choiceRegionIds.has(b.id)))crossing.root.filters=[unavailableFilter];
        layerLandmarks.push(crossing);
      }
      if(!illustratedMap){
        edges.lineStyle(2.5, 0x141511, .8).moveTo(from.x, from.y).lineTo(to.x, to.y);
        edges.lineStyle(1, 0xb49562, .9).moveTo(from.x, from.y).lineTo(to.x, to.y);
      } else if(!route) {
        // No dry route across disconnected islands: show a sea connection,
        // never paint an invented land causeway over animated water.
        drawRelationshipLine(edges,from,to,{width:2,colour:0x9ab8b5,alpha:.65,dashLength:3,gapLength:8});
      }
      if (relationships) {
        const aKind = getMapRelationship(relationships, a.id);
        const bKind = getMapRelationship(relationships, b.id);
        if (aKind && bKind) {
          const aStyle = getRelationshipStyle(regionMapIndicators.find(entry => entry.regionId === a.id));
          const bStyle = getRelationshipStyle(regionMapIndicators.find(entry => entry.regionId === b.id));
          const style = aKind === 'selected' ? bStyle : bKind === 'selected' ? aStyle
            : aStyle.priority < bStyle.priority ? aStyle : bStyle;
          const roadStyle={...style,width:Math.max(.7,style.width*.2)};
          if(route)for(const section of landSections)drawRelationshipPath(edges,section,roadStyle);
          else drawRelationshipLine(edges, from, to, roadStyle);
        }
      }
      edges.eventMode = 'none';
      edges.visible = display.connections !== false;
      if (choiceRegionIds && (!choiceRegionIds.has(a.id) || !choiceRegionIds.has(b.id))) edges.filters = [unavailableFilter];
      mapContent.addChild(edges);
    }
    // Draw borders after every terrain polygon and road, with selection last.
    // Neighboring terrain must not erase the important side of a shared edge.
    const boundaries = territoryBoundarySegments(territoryBorders);
    const borderPriority = territory => territory.selected ? 5 : territory.relationship === 'connected' ? territory.relationshipStyle.priority : 0;
    const addBorder = territory => {
      const border = new PIXI.Container();
      mapContent.addChild(presentRegion(border, territory.regionId));
      addTerritoryBorder(border, territory.points, {...territory, boundarySegments:boundaries.get(territory.regionId)});
    };
    const orderedBorders=territoryBorders.sort((a,b)=>borderPriority(a)-borderPriority(b));
    for (const territory of orderedBorders.filter(t=>!t.selected&&!t.highlighted)) addBorder(territory);
    if(display.connections!==false){
      const gates=new PIXI.Graphics();gates.eventMode='none';gates.label='road-frontier-crossings';
      const segments=[...boundaries.values()].flat();
      for(const path of roadPaths)for(const p of roadBorderCrossings(path,segments)){
        gates.lineStyle(2,0x292c24,.85).moveTo(p.x-p.dx*7,p.y-p.dy*7).lineTo(p.x+p.dx*7,p.y+p.dy*7);
        gates.lineStyle(.8,0xb5a078,.95).moveTo(p.x-p.dx*8,p.y-p.dy*8).lineTo(p.x+p.dx*8,p.y+p.dy*8);
      }
      mapContent.addChild(gates);
    }
    for (const territory of orderedBorders.filter(t=>t.selected||t.highlighted)) addBorder(territory);

    for (const indicator of regionMapIndicators) {
      const regionDef = definition.regions.find(
        (entry) => entry.id === indicator.regionId
      );
      if (!regionDef) continue;
      const regionContent = new PIXI.Container();
      mapContent.addChild(presentRegion(regionContent, indicator.regionId));
      const point = sitePoint(regionDef);
      if (display.actors !== false && indicator.monster) addMonsterMarker(regionContent, point, {art:!illustratedMap});
      const readoutVariant=regionalReadoutVariant();
      if (display.actors !== false && indicator.crownCapital&&(readoutVariant!=='floating'||(new URLSearchParams(globalThis.location?.search??'').get('regionalForce')??'onbar')!=='onbar')) addCrownCapitalMarker(regionContent,point,tooltipView);
      const sampleMode=new URLSearchParams(globalThis.location?.search??'').get('regionalForceSample');
      const forceSample=floatingMode&&indicator.controller==='player'?(sampleMode==='both'?(indicator.regionId===state.civilization.capitalRegionId?'short':'held'):['short','held','fractional'].includes(sampleMode)?sampleMode:null):null;

      const footprint=illustrated.stats.sites?.find(site=>site.regionId===indicator.regionId)?.spriteBounds;
      const spriteBounds=footprint?{min:screenPoint({x:footprint.minX,y:footprint.minY}),max:screenPoint({x:footprint.maxX,y:footprint.maxY})}:null;
      const landmark=illustrated.stats.sites?.find(site=>site.regionId===indicator.regionId)?.urban?.monument?.worldBounds;
      const landmarkBounds=landmark?{min:screenPoint({x:landmark.minX,y:landmark.minY}),max:screenPoint({x:landmark.maxX,y:landmark.maxY})}:null;

      if(display.actors!==false&&readoutVariant){
        const readout=addRegionalReadoutPrototype(floatingMode?floatingOverlay:regionContent,point,indicator,{tooltipView,reference:getRegionReference(state,indicator.regionId),variant:readoutVariant,spriteBounds,landmarkBounds,regionPolygon:polygon(regionDef).map(screenPoint),forceSample});
        if(floatingMode&&readout)presentRegion(readout,indicator.regionId);
      }
      if(display.actors!==false&&!readoutVariant)addMapInfluenceMarker(regionContent,point,indicator.influence,{tooltipView,reference:getRegionReference(state,indicator.regionId)??indicator.regionId});
      if(display.actors!==false&&!readoutVariant)addRegionPrestigeBadge(regionContent,point,indicator.prestigePerNode,{tooltipView,populationPerPoint:indicator.prestigePopulationPerPoint});
      const adornments = new PIXI.Container();
      adornments.position.set(point.x,point.y);
      adornments.scale.set(.75);
      adornments.eventMode = 'none';
      regionContent.addChild(adornments);
      if (minimalGraphics && !illustratedMap && indicator.hasDetailedSettlement && !indicator.monster) {
        const marker = new PIXI.Graphics().lineStyle(2,0x131c20).beginFill(indicator.neutral?0x8ed7cf:0xe3c785).drawRect(point.x-9,point.y-16,18,18).endFill();
        marker.eventMode='none';regionContent.addChild(marker);
      }
      if (indicator.hasDetailedSettlement && !indicator.monster) {
        if(!readoutVariant||(regionSelectionActive&&indicator.regionId===selectedRegionId&&(!atlasMode||prototypeEconomyExpanded)))addSettlementStockTags(regionContent, point, indicator.stockTags, {
          tooltipView, reference: getRegionReference(state, indicator.regionId) ?? indicator.regionId,
        });
        if (display.scenery !== false && !illustratedMap) {
          if (indicator.neutral) addNeutralMarketGlyph(regionContent, point);
          else {
            layerLandmarks.push(addTimelineLandmark(regionContent,{x:point.x-29,y:point.y-76,width:58,height:66},
              {startSec:definition.regions.indexOf(regionDef)*.37}));
            layerLandmarks.push(addTimelineLandmark(regionContent,{x:point.x+29,y:point.y-17,width:20,height:17},
              {kind:'fire',startSec:definition.regions.indexOf(regionDef)*.23}));
          }
        }
      }
      if (display.alerts !== false) {
        addSettlementStarvationIndicator(adornments, {x:65,y:40}, indicator.pressure);
        if(!readoutVariant)addSettlementCurrencyIndicator(adornments, {x:65,y:35}, indicator);
      }
    }
    return layerLandmarks;
    }).value;

    // Titles retain their original corner, font, fit and normal map-zoom scale.
    // The floating readouts are raised after this layer so their numbers win
    // when they overlap a region title.
    // Name colours follow viewed control, including occupation and rewind.
    // Stock changes still retain their text textures.
    floatingReferenceLayer=retained.update(mapContent,'references',[getArtRevision(),display.choiceRegionIds,selectedRegionId,regionSelectionActive,
      definition.regions.map(r=>[r.id,getRegionNameColour(getRegionState(state,r.id))])],mapContent=>{
    floatingNameLabels=[];
    for (const regionDef of definition.regions) {
      if(!regionSelectionActive||regionDef.id!==selectedRegionId)continue;
      if(atlasMode&&!getRegionState(state,regionDef.id)?.monster)continue;
      const point = getRegionReferenceCorner(definition, regionDef, screenPoint, polygon)
        ?? sitePoint(regionDef);
      const label = createRegionLabel(getRegionReference(state, regionDef.id) ?? "Unknown region", {
        ...TEXT_STYLES.chip,
        fontSize: 21,
        fill: getRegionNameColour(getRegionState(state, regionDef.id)), stroke: 0x111713, strokeThickness: 4,
      }, point.x, point.y, 180, 52);
      label.label='region-name';label.mapRegionId=regionDef.id;
      if(floatingMode){label.floatingHome={x:label.x,y:label.y};floatingNameLabels.push(label);}
      mapContent.addChild(presentRegion(label, regionDef.id));
    }
    }).node;
    if(floatingMode)mapContent.addChild(floatingOverlay);

    const activeVassal = getCurrentLifeMapVassal(state);
    retained.update(mapContent,'vassal',[getArtRevision(),display.actors,activeVassal?.locationRegionId,activeVassal?getVassalAge(state,activeVassal):null],mapContent=>{
    if (display.actors !== false && activeVassal?.locationRegionId) {
      const regionDef = definition.regions.find((entry) => entry.id === activeVassal.locationRegionId);
      if (regionDef) addActiveVassalMarker(mapContent, {x:sitePoint(regionDef).x-55,y:sitePoint(regionDef).y+12}, activeVassal, state);
    }
    });

    retained.update(root,'chaos',[getArtRevision(),chaosExpanded,graphScope,civilizationSummary.chaos],root=>{
    if (chaosExpanded) {
      const civilizationPanel = new PIXI.Graphics();
      civilizationPanel.label='chaos-drawer-panel';
      roundedRect(
        civilizationPanel,
        CIVILIZATION_RECT.x,
        CIVILIZATION_RECT.y,
        CIVILIZATION_RECT.width,
        CIVILIZATION_RECT.height,
        7,
        PALETTE.panel,
        graphScope === "civilization" ? PALETTE.accent : PALETTE.stroke,
        graphScope === "civilization" ? 3 : 2
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
        tooltipView?.show?.({
          title: 'The Coming Dark',
          lines: [
            `Primordial pressure: ${formatChaosValue(reckoning?.primordialPressure ?? 0)}`,
            `Unrest: ${civilizationSummary.chaos.unrestRegionCount} towns; +${formatChaosValue(civilizationSummary.chaos.unrestChaosPerYear)} Chaos/year (${formatChaosValue(reckoning?.unrestPressure ?? 0)} this moon)`,
            `Premature deaths: ${reckoning?.prematureDeaths ?? 0} · External emigrants: ${reckoning?.externalEmigrants ?? 0}`,
            `Premature pressure: ${formatChaosValue(reckoning?.prematureDeathPressure ?? 0)} · Emigration pressure: ${formatChaosValue(reckoning?.externalEmigrationPressure ?? 0)}`,
            `Old-age pressure: ${formatChaosValue(reckoning?.oldAgeDeathPressure ?? 0)} · Internal migration pressure: ${formatChaosValue(reckoning?.internalMigrationPressure ?? 0)}`,
            `Chaos income: ${formatChaosValue(reckoning?.rawPressure ?? 0)} · Resistance: ${formatChaosValue(civilizationSummary.chaos.resistance)}`,
            `Incoming Chaos: ${formatChaosValue(reckoning?.incomingChaos ?? 0)} · Accumulated: ${formatChaosValue(civilizationSummary.chaos.chaosPower)}`,
            `Monster regions: ${civilizationSummary.chaos.monsterCount}`,
            `Creep: ${formatChaosValue(civilizationSummary.chaos.expansionProgress)} / ${civilizationSummary.chaos.expansionThreshold}`,
            "At 100 Creep by default, trigger a Monster Spawn. Excess Creep carries over.",
            `Repelled Monsters gain +${civilizationSummary.chaos.repelStrengthGain} Strength for their next attack.`,
            "Resistance contains passive Creep gain; dangerous actions bypass it.",
          ],
        }, civilizationPanel.getBounds(), { dismissOnExit: true });
      });
      civilizationPanel.on("pointerout", () => tooltipView?.hide?.());
      root.addChild(civilizationPanel);
      addChaosPanelContent(root, CIVILIZATION_RECT, civilizationSummary);
    }
    }).node.visible=chrome;
    retained.update(root,'controls',[getArtRevision(),chrome,chaosExpanded,chaosExpanded?null:[civilizationSummary.chaos.expansionProgress,civilizationSummary.chaos.expansionThreshold],regionSelectionActive,selectedRegionId,relationships,prototypeEconomyExpanded],root=>{
    if(chrome){
    const toggleChaos=()=>{
      chaosExpanded=!chaosExpanded;
      tooltipView?.hide?.();lastSignature='';
    };
    if(chaosExpanded) addButton(root,{x:CIVILIZATION_RECT.x+CIVILIZATION_RECT.width+4,y:CIVILIZATION_RECT.y,width:36,height:44},'<',toggleChaos);
    else addCollapsedChaosControl(root,{x:CIVILIZATION_RECT.x,y:CIVILIZATION_RECT.y,width:252,height:44},civilizationSummary.chaos,toggleChaos);
    }
    const controlsX = regionSelectionActive&&(!atlasMode||prototypeEconomyExpanded) ? DETAIL_RECT.x - 226 : MAP_VIEWPORT_RECT.x + MAP_VIEWPORT_RECT.width - 226;
    const cameraRight = regionSelectionActive&&(!atlasMode||prototypeEconomyExpanded) ? DETAIL_RECT.x : MAP_VIEWPORT_RECT.x + MAP_VIEWPORT_RECT.width;
    addButton(root, {x: controlsX, y: 756, width: 52, height: 52}, '-', () => camera.zoomBy(1 / 1.2, cameraRight));
    addButton(root, {x: controlsX + 58, y: 756, width: 52, height: 52}, '+', () => camera.zoomBy(1.2, cameraRight));
    addButton(root, {x: controlsX + 116, y: 756, width: 98, height: 52}, 'Reset', () => {
      if (relationships) frameGroup();
      else fitOverview();
    });
    });
    if (!regionSelectionActive) return;

    if(atlasMode&&!prototypeEconomyExpanded&&regionMapIndicators.find(entry=>entry.regionId===selectedRegionId)?.influence){
      addAtlasFocus(detailRoot,regionMapIndicators.find(entry=>entry.regionId===selectedRegionId),{
        reference:getRegionReference(state,selectedRegionId),tooltipView,addButton,
        onEconomy:()=>{tooltipView?.hide?.();prototypeEconomyExpanded=true;lastSignature='';render(true);},
        onClose:()=>{tooltipView?.hide?.();onShowCivilizationGraph?.();},
      });
      return;
    }
    const panel = getRegionPanel(state, selectedRegionId, graphScope === 'settlement', regionMapIndicators);

    if (panel) detailRoot.addChild(panel);
    if(atlasMode&&prototypeEconomyExpanded)addButton(detailRoot,{x:660,y:100,width:270,height:58},'Map summary',()=>{prototypeEconomyExpanded=false;lastSignature='';render(true);});
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
      if(regionalReadoutVariant())updateRegionalReadoutScale(camera.snapshot().zoom,getRegionSelectionActive?.()===true?getSelectedRegionId?.():null);
      updateEdgeTransferPackets();
      illustrated.update(visualTime(),camera.snapshot().zoom);
    },
    refresh: () => { lastSignature = ""; render(true); },
    resetArtwork() {
      illustrated.destroy();
      illustrated=createTerrain();
      world.setChildIndex(illustrated.container,0);
      lastSignature='';
    },
    // Bake a new world's terrain while its forecast is still running (New Game).
    prefetch: state => illustrated.prefetch(state),
    cancelPrefetch: () => illustrated.cancelPrefetch(),
    async prepareProgressive(renderer, wait, isCurrent) {
      if (!illustrated.prepareProgressive) return;
      const definitionId=getState?.()?.world?.definitionId;
      const reveal=await illustrated.prepareProgressive(getState?.(),renderer,wait,isCurrent);
      return ()=>{
        if(!isCurrent() || definitionId!==getState?.()?.world?.definitionId)return false;
        return reveal?.() ?? true;
      };
    },
    async prepare(renderer) {
      await illustrated.prepare(getState?.(),renderer);
      if(preparedWorldId!==getState?.()?.world?.definitionId){preparedWorldId=getState?.()?.world?.definitionId;fitOverview();lastRevealedRegionId=null;}
      // Prepare the panels opened by map flags, without selecting a region or
      // altering camera, graph scope, or the live settlement state.
      regionPanels.clear();
      render(true);
      const state = getState?.();
      const definition = getWorldDefinition(state);
      const indicators = definition ? buildRegionMapIndicators(state, definition) : [];
      // Warm the entry settlement first. Preparing every settlement before
      // resuming adds several seconds on slow CPUs for panels never opened.
      const regionId = getSelectedRegionId?.() ?? state?.civilization?.capitalRegionId;
      const panel = getRegionPanel(state, regionId, true, indicators);
      if (panel) renderer.prepare.add(panel);
      renderer.prepare.add(root);
      renderer.prepare.add(mapContent);
      await renderer.prepare.upload();
    },
    resetEdgeTransferPackets,
    // Timeline edit / reprojection: drop corridor trend and ghosts from the old timeline.
    clearTradeCorridorHistory: () => {
      tradeFlowHistory.clear();
      ghostEdgeTransferPackets = [];
      // Drop the old timeline's packets too, so the next batch cannot ghost them.
      edgeTransferPacketDescriptors = [];
      activeEdgeTransferPackets = [];
      lastEdgeTransferBatchKey = null;
      lastEdgeTransferDescriptorBoundarySec = null;
      tradeCorridorGraphics.clear();
      edgeTransferGraphics.clear();
      stockTransferIcons.clear();
    },
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
        monsterReadouts:getMonsterReadoutMeasurements(),
        lastMonsterSpawn:civilizationSummary.chaos.lastMonsterSpawn,
        floatingNamesAboveReadouts:floatingMode&&floatingReferenceLayer?.parent===mapContent&&floatingOverlay.parent===mapContent?mapContent.getChildIndex(floatingReferenceLayer)>mapContent.getChildIndex(floatingOverlay):null,
        floatingReadouts:floatingMode?getFloatingReadoutMeasurements().map(reading=>{const label=floatingNameLabels.find(item=>!item.destroyed&&item.mapRegionId===reading.regionId),b=label?.visible?label.getBounds():null;return {...reading,name:b?{x:b.x,y:b.y,width:b.width,height:b.height}:null,nameHome:label?.floatingHome??null,namePosition:label?{x:label.x,y:label.y}:null};}):null,
        regionalReadoutPrototype:atlasMode?{variant:'atlas',economyExpanded:prototypeEconomyExpanded,economyClickPoint:ATLAS_ECONOMY_POINT}:null,
        illustratedTerrain:{...illustrated.stats},
        retainedScene:retained.snapshot(),
        presentationReads,
        selectedRegionId: regionId,
        regionSelectionActive: getRegionSelectionActive?.() === true,
        relationships: getMapRelationships(state, regionId, root.visible && getRegionSelectionActive?.() === true),
        detailPanelVisible: root.visible && detailRoot.visible,
        regionPanelCache: regionPanels.snapshot(),
        chaosExpanded,
        camera: camera.snapshot(),
        focusAnimating: camera.isAnimating(),
        panelReveal: panelReveal.snapshot(),
        layout: { viewport: MAP_VIEWPORT_RECT, detail: DETAIL_RECT, chaos: CIVILIZATION_RECT, groupFrame: GROUP_FRAME_RECT },
        market: viewModel?.neutral ? {stocks:viewModel.marketStocks,currency:viewModel.marketCurrency} : null,
        structureSlots: viewModel && !viewModel.neutral ? { visible: DEFAULT_REGION_STRUCTURE_CAPACITY_MAX, available: viewModel.structureCapacity, blocked: DEFAULT_REGION_STRUCTURE_CAPACITY_MAX - viewModel.structureCapacity } : null,
        graphScope:
          getGraphScope?.() === "settlement"
            ? "settlement"
            : "civilization",
        lastPointerRegionId,
        regionCount: getWorldDefinition(state)?.regions.length ?? 0,
        civilizationSummary,
        civilizationHeader: {
          labels: ['SETTLEMENTS', 'SOULS', 'RESEARCH'],
          researchPoint: root.visible && researchTarget && !researchTarget.destroyed && researchTarget.worldVisible
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
            path: packet.path,
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
    getEndDetailsClickPoint: () => getSurvivalEndDetailsClickPoint(endDetailsTarget, root.visible && endDetailsTarget?.worldVisible!==false),
    getRegionClickPoint: (regionId) => {
      const region = getRegionDefinition(getState?.(), regionId);
      return region ? camera.project(sitePoint(region)) : null;
    },
    getPracticeClickPoint: () => null,
    getInstalledPracticeClickPoint: () => null,
    destroy: () => {
      retained.clear();
      floatingOverlay.destroy({children:true});
      illustrated.destroy();
      unavailableFilter.destroy();
      regionPanels.clear();
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
