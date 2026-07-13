import {
  getFeaturePath,
  getRegionDefinition,
  getRegionPolygon,
  getSitesInRegion,
  getWorldDefinition,
  getWorldFacilityDef,
  getWorldTerrainDef,
  getWorldVertex,
} from "../model/world-state.js";
import { clearChildren, createText, createWrappedText, roundedRect } from "./settlement-view-primitives.js";
import { PALETTE, TEXT_STYLES } from "./settlement-theme.js";

const MAP_RECT = Object.freeze({ x: 58, y: 104, width: 1640, height: 704 });
const DETAIL_RECT = Object.freeze({ x: 1734, y: 104, width: 626, height: 704 });
const MODE_COLORS = Object.freeze({ land: 0xe4bf58, river: 0xa9d9ec, sea: 0xf0f2ea });

function pointToScreen(point) {
  const x = Array.isArray(point) ? point[0] : point?.x;
  const y = Array.isArray(point) ? point[1] : point?.y;
  return {
    x: MAP_RECT.x + Number(x ?? 0) * MAP_RECT.width,
    y: MAP_RECT.y + Number(y ?? 0) * MAP_RECT.height,
  };
}

function drawDashedPath(gfx, points, color, width = 4) {
  const screenPoints = points.map(pointToScreen);
  for (let index = 0; index < screenPoints.length - 1; index += 1) {
    const a = screenPoints[index];
    const b = screenPoints[index + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const steps = Math.max(1, Math.floor(length / 18));
    for (let step = 0; step < steps; step += 2) {
      const from = step / steps;
      const to = Math.min(1, (step + 1) / steps);
      gfx.lineStyle(width, color, 0.95);
      gfx.moveTo(a.x + dx * from, a.y + dy * from);
      gfx.lineTo(a.x + dx * to, a.y + dy * to);
    }
  }
}

function drawSolidPath(gfx, points, color, width, alpha = 1) {
  if (points.length < 2) return;
  const first = pointToScreen(points[0]);
  gfx.lineStyle(width, color, alpha);
  gfx.moveTo(first.x, first.y);
  for (let index = 1; index < points.length; index += 1) {
    const point = pointToScreen(points[index]);
    gfx.lineTo(point.x, point.y);
  }
}

function drawArrow(gfx, fromPoint, toPoint, color, size = 10) {
  const from = pointToScreen(fromPoint);
  const to = pointToScreen(toPoint);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.max(1, Math.hypot(dx, dy));
  const ux = dx / length;
  const uy = dy / length;
  const x = from.x + dx * 0.62;
  const y = from.y + dy * 0.62;
  gfx.beginFill(color, 0.95);
  gfx.drawPolygon([
    x + ux * size, y + uy * size,
    x - ux * size * 0.7 - uy * size * 0.65, y - uy * size * 0.7 + ux * size * 0.65,
    x - ux * size * 0.7 + uy * size * 0.65, y - uy * size * 0.7 - ux * size * 0.65,
  ]);
  gfx.endFill();
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const a = polygon[index];
    const b = polygon[previous];
    const intersects = ((a[1] > point.y) !== (b[1] > point.y))
      && point.x < ((b[0] - a[0]) * (point.y - a[1])) / ((b[1] - a[1]) || 1e-9) + a[0];
    if (intersects) inside = !inside;
  }
  return inside;
}

function drawForestCover(gfx, region, polygon) {
  const coverage = region?.landCover?.forest ?? 0;
  if (coverage < 0.08) return;
  const threshold = Math.round(coverage * 10);
  for (let x = 0.055; x < 0.94; x += 0.045) {
    for (let y = 0.09; y < 0.93; y += 0.055) {
      const hash = (Math.round(x * 1000) * 17 + Math.round(y * 1000) * 31 + region.id.length * 13) % 10;
      if (hash >= threshold || !pointInPolygon({ x, y }, polygon)) continue;
      const point = pointToScreen({ x, y });
      gfx.beginFill(0x244d35, 0.34);
      gfx.drawCircle(point.x, point.y, 4);
      gfx.endFill();
    }
  }
}

function getBorderPath(definition, segment) {
  const border = definition.borders.find((entry) => entry.id === segment.borderId);
  if (!border) return [];
  const fromIndex = border.vertexIds.indexOf(segment.fromVertexId);
  const toIndex = border.vertexIds.indexOf(segment.toVertexId);
  if (fromIndex < 0 || toIndex < 0) return [];
  const low = Math.min(fromIndex, toIndex);
  const high = Math.max(fromIndex, toIndex);
  const ids = border.vertexIds.slice(low, high + 1);
  if (fromIndex > toIndex) ids.reverse();
  return ids.map((id) => getWorldVertex(definition, id)).filter(Boolean);
}

function drawMountainSegment(gfx, points) {
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = pointToScreen(points[index]);
    const b = pointToScreen(points[index + 1]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy);
    const count = Math.max(1, Math.floor(length / 32));
    const nx = length ? -dy / length : 0;
    const ny = length ? dx / length : 0;
    for (let step = 0; step < count; step += 1) {
      const t = (step + 0.5) / count;
      const x = a.x + dx * t;
      const y = a.y + dy * t;
      gfx.lineStyle(3, 0x4c4947, 0.95);
      gfx.moveTo(x - dx / length * 10, y - dy / length * 10);
      gfx.lineTo(x + nx * 10, y + ny * 10);
      gfx.lineTo(x + dx / length * 10, y + dy / length * 10);
    }
  }
}

function drawForestBeltSegment(gfx, points) {
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = pointToScreen(points[index]);
    const b = pointToScreen(points[index + 1]);
    const length = Math.hypot(b.x - a.x, b.y - a.y);
    const count = Math.max(1, Math.floor(length / 22));
    for (let step = 0; step < count; step += 1) {
      const t = (step + 0.5) / count;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      gfx.beginFill(0x28543a, 0.95);
      gfx.drawCircle(x, y, 6);
      gfx.endFill();
    }
  }
}

function addButton(parent, rect, label, onPress, { selected = false, disabled = false } = {}) {
  const button = new PIXI.Container();
  const bg = new PIXI.Graphics();
  const fill = selected ? PALETTE.accent : PALETTE.panel;
  roundedRect(bg, 0, 0, rect.width, rect.height, 6, fill, selected ? 0x3f3935 : PALETTE.stroke, 2);
  button.addChild(bg, createText(label, { ...TEXT_STYLES.chip, fill: selected ? 0x2d2926 : PALETTE.text }, rect.width / 2, rect.height / 2, 0.5, 0.5));
  button.x = rect.x;
  button.y = rect.y;
  button.alpha = disabled ? 0.45 : 1;
  button.eventMode = disabled ? "none" : "static";
  button.interactive = !disabled;
  button.buttonMode = !disabled;
  button.cursor = disabled ? "default" : "pointer";
  if (!disabled) button.on("pointertap", () => onPress?.());
  parent.addChild(button);
  return button;
}

function titleCase(value) {
  return String(value ?? "").replace(/(^|\s)([a-z])/g, (_match, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
}

function siteName(state, siteId) {
  return state?.world?.sites?.find((site) => site?.id === siteId)?.name ?? "Not selected";
}

function borderSummary(definition, border) {
  const features = definition.geographicFeatures
    .filter((feature) => feature.segments.some((segment) => segment.borderId === border.id))
    .map((feature) => feature.name);
  const details = [...features, titleCase(border.crossingKind)].filter(Boolean);
  return details.join(" / ");
}

export function createWorldMapView({
  layer,
  getState,
  getSelectedRegionId,
  setSelectedRegionId,
  getRoutePlannerState,
  setMapInteractionMode,
  selectRouteSite,
  toggleRouteMode,
  clearRoute,
  swapRoute,
  onOpenDetailedSite,
}) {
  const root = new PIXI.Container();
  root.zIndex = 1;
  layer.addChild(root);
  let lastKey = "";
  let lastPointerRegionId = null;

  function render(force = false) {
    if (!root.visible) return;
    const state = getState?.();
    const definition = getWorldDefinition(state);
    if (!definition) return;
    const routeState = getRoutePlannerState?.() ?? {};
    const selectedRegionId = getSelectedRegionId?.() ?? state?.civilization?.capitalRegionId ?? null;
    const routeLegKey = routeState.result?.ok ? routeState.result.legs.map((leg) => leg.linkId).join(",") : routeState.result?.reason ?? "";
    const key = [definition.id, selectedRegionId, routeState.mode, routeState.originSiteId, routeState.destinationSiteId, JSON.stringify(routeState.enabledModes), routeLegKey].join("|");
    if (!force && key === lastKey) return;
    lastKey = key;
    clearChildren(root);

    const background = new PIXI.Graphics();
    background.beginFill(0x6f756b, 1);
    background.drawRect(0, 0, 2424, 860);
    background.endFill();
    root.addChild(background);

    const topbar = new PIXI.Graphics();
    topbar.beginFill(PALETTE.topbar, 1);
    topbar.drawRect(0, 0, 2424, 72);
    topbar.endFill();
    root.addChild(topbar);
    root.addChild(createText(definition.name, TEXT_STYLES.header, 74, 35, 0, 0.5));
    addButton(root, { x: 1734, y: 14, width: 152, height: 44 }, "Browse", () => setMapInteractionMode?.("browse"), { selected: routeState.mode !== "route" });
    addButton(root, { x: 1898, y: 14, width: 178, height: 44 }, "Plan route", () => setMapInteractionMode?.("route"), { selected: routeState.mode === "route" });
    root.addChild(createText("REGIONAL VIEW", { ...TEXT_STYLES.muted, fontSize: 15 }, 2290, 36, 1, 0.5));

    const sea = new PIXI.Graphics();
    roundedRect(sea, MAP_RECT.x, MAP_RECT.y, MAP_RECT.width, MAP_RECT.height, 6, 0x4f7784, 0x3d514f, 3);
    root.addChild(sea);

    const forestLayer = new PIXI.Graphics();
    for (const region of definition.regions) {
      const polygon = getRegionPolygon(definition, region);
      const terrain = getWorldTerrainDef(region.terrainId);
      const selected = region.id === selectedRegionId;
      const screenPolygon = polygon.flatMap((point) => {
        const screen = pointToScreen(point);
        return [screen.x, screen.y];
      });
      const shape = new PIXI.Graphics();
      shape.lineStyle(selected ? 7 : 3, selected ? PALETTE.accent : 0x3d443d, selected ? 1 : 0.92);
      shape.beginFill(terrain?.color ?? 0x777777, selected ? 1 : 0.94);
      shape.drawPolygon(screenPolygon);
      shape.endFill();
      const regionHit = new PIXI.Container();
      regionHit.hitArea = new PIXI.Polygon(screenPolygon);
      regionHit.eventMode = "static";
      regionHit.interactive = true;
      regionHit.buttonMode = true;
      regionHit.cursor = "pointer";
      regionHit.addChild(shape);
      regionHit.on("pointertap", () => {
        lastPointerRegionId = region.id;
        setSelectedRegionId?.(region.id);
        lastKey = "";
      });
      root.addChild(regionHit);
      drawForestCover(forestLayer, region, polygon);
    }
    forestLayer.eventMode = "none";
    root.addChild(forestLayer);

    const featureLayer = new PIXI.Graphics();
    for (const feature of definition.geographicFeatures) {
      if (feature.type === "river") {
        const path = getFeaturePath(definition, feature.id);
        drawSolidPath(featureLayer, path, 0x244b5f, 13, 0.95);
        drawSolidPath(featureLayer, path, 0x67b7d5, 7, 1);
        for (const segment of feature.segments) {
          const points = getBorderPath(definition, segment);
          if (points.length >= 2) drawArrow(featureLayer, points[0], points.at(-1), 0xd5f1f7, 8);
        }
      } else if (feature.type === "mountainRange") {
        for (const segment of feature.segments) drawMountainSegment(featureLayer, getBorderPath(definition, segment));
      } else if (feature.type === "forestBelt") {
        for (const segment of feature.segments) drawForestBeltSegment(featureLayer, getBorderPath(definition, segment));
      }
    }
    featureLayer.eventMode = "none";
    root.addChild(featureLayer);

    if (routeState.result?.ok && routeState.result.legs.length) {
      const routeLayer = new PIXI.Graphics();
      for (const leg of routeState.result.legs) {
        const color = MODE_COLORS[leg.mode] ?? PALETTE.accent;
        if (leg.mode === "sea") drawDashedPath(routeLayer, leg.path, color, 7);
        else {
          drawSolidPath(routeLayer, leg.path, 0x2d2926, 11, 0.85);
          drawSolidPath(routeLayer, leg.path, color, 6, 1);
        }
        if (leg.path.length >= 2) drawArrow(routeLayer, leg.path[0], leg.path.at(-1), color, 11);
      }
      routeLayer.eventMode = "none";
      root.addChild(routeLayer);
    }

    for (const region of definition.regions) {
      const labelPoint = pointToScreen(region.display.labelPoint);
      const label = createWrappedText(
        region.name,
        { ...TEXT_STYLES.chip, fontSize: 15, align: "center", stroke: 0x2d302c, strokeThickness: 4 },
        labelPoint.x,
        labelPoint.y,
        148,
        0.5,
        0.5
      );
      label.eventMode = "none";
      root.addChild(label);
      const sites = getSitesInRegion(state, region.id);
      if (!sites.length) continue;
      const sitePoint = pointToScreen(region.display.sitePoint);
      const site = sites[0];
      const isOrigin = routeState.originSiteId === site.id;
      const isDestination = routeState.destinationSiteId === site.id;
      const marker = new PIXI.Graphics();
      marker.lineStyle(isOrigin || isDestination ? 5 : 3, isOrigin ? 0x93c878 : isDestination ? PALETTE.accent : 0x292724, 1);
      marker.beginFill(site.simulationMode === "detailed" ? PALETTE.accent : 0xe4e0d6, 1);
      marker.drawCircle(sitePoint.x, sitePoint.y + 22, isOrigin || isDestination ? 11 : 8);
      marker.endFill();
      marker.hitArea = new PIXI.Circle(sitePoint.x, sitePoint.y + 22, 24);
      marker.eventMode = "static";
      marker.interactive = true;
      marker.buttonMode = true;
      marker.cursor = "pointer";
      marker.on("pointertap", () => {
        setSelectedRegionId?.(region.id);
        if (routeState.mode === "route") selectRouteSite?.(site.id);
        lastKey = "";
      });
      root.addChild(marker);
    }

    const detail = new PIXI.Graphics();
    roundedRect(detail, DETAIL_RECT.x, DETAIL_RECT.y, DETAIL_RECT.width, DETAIL_RECT.height, 6, PALETTE.panelSoft, PALETTE.stroke, 3);
    root.addChild(detail);

    if (routeState.mode === "route") {
      let y = DETAIL_RECT.y + 38;
      root.addChild(createText("Route Planner", TEXT_STYLES.header, DETAIL_RECT.x + 28, y));
      y += 57;
      root.addChild(createText("ORIGIN", TEXT_STYLES.muted, DETAIL_RECT.x + 30, y));
      y += 25;
      root.addChild(createText(siteName(state, routeState.originSiteId), { ...TEXT_STYLES.title, fontSize: 20 }, DETAIL_RECT.x + 30, y));
      y += 43;
      root.addChild(createText("DESTINATION", TEXT_STYLES.muted, DETAIL_RECT.x + 30, y));
      y += 25;
      root.addChild(createText(siteName(state, routeState.destinationSiteId), { ...TEXT_STYLES.title, fontSize: 20 }, DETAIL_RECT.x + 30, y));
      y += 48;
      const modeWidth = 172;
      for (const [index, mode] of ["land","river","sea"].entries()) {
        addButton(root, { x: DETAIL_RECT.x + 30 + index * (modeWidth + 10), y, width: modeWidth, height: 40 }, titleCase(mode), () => toggleRouteMode?.(mode), { selected: routeState.enabledModes?.[mode] !== false });
      }
      y += 66;
      if (routeState.result?.ok && routeState.destinationSiteId) {
        root.addChild(createText(`${routeState.result.totalDays} travel days`, { ...TEXT_STYLES.header, fontSize: 28 }, DETAIL_RECT.x + 30, y));
        root.addChild(createText(`${routeState.result.totalDistanceKm} km`, { ...TEXT_STYLES.muted, fontSize: 17 }, DETAIL_RECT.x + DETAIL_RECT.width - 30, y + 4, 1));
        y += 48;
        root.addChild(createText("LEGS", TEXT_STYLES.muted, DETAIL_RECT.x + 30, y));
        y += 25;
        for (const leg of routeState.result.legs.slice(0, 7)) {
          const destinationNode = definition.transportNodes.find((node) => node.id === leg.toNodeId);
          const destinationRegion = definition.regions.find((region) => region.id === destinationNode?.regionId);
          const detailText = leg.direction ? `, ${leg.direction}` : "";
          root.addChild(createText(`${titleCase(leg.mode)} to ${destinationRegion?.name ?? "?"} - ${leg.days}d${detailText}`, { ...TEXT_STYLES.body, fontSize: 15 }, DETAIL_RECT.x + 30, y));
          y += 24;
        }
      } else if (routeState.destinationSiteId) {
        root.addChild(createText("No route with enabled modes", { ...TEXT_STYLES.title, fontSize: 20 }, DETAIL_RECT.x + 30, y));
      }
      addButton(root, { x: DETAIL_RECT.x + 30, y: DETAIL_RECT.y + DETAIL_RECT.height - 62, width: 250, height: 40 }, "Clear", () => clearRoute?.(), { disabled: !routeState.originSiteId });
      addButton(root, { x: DETAIL_RECT.x + 294, y: DETAIL_RECT.y + DETAIL_RECT.height - 62, width: 302, height: 40 }, "Swap", () => swapRoute?.(), { disabled: !routeState.originSiteId || !routeState.destinationSiteId });
      return;
    }

    const selectedRegion = getRegionDefinition(state, selectedRegionId);
    if (!selectedRegion) return;
    const terrain = getWorldTerrainDef(selectedRegion.terrainId);
    const sites = getSitesInRegion(state, selectedRegion.id);
    const borders = definition.borders.filter((entry) => entry.regionAId === selectedRegion.id || entry.regionBId === selectedRegion.id);
    let y = DETAIL_RECT.y + 42;
    root.addChild(createText(selectedRegion.name, TEXT_STYLES.header, DETAIL_RECT.x + 28, y));
    y += 62;
    root.addChild(createText("TERRAIN", TEXT_STYLES.muted, DETAIL_RECT.x + 30, y));
    y += 26;
    root.addChild(createText(`${terrain?.name ?? selectedRegion.terrainId}  /  ${Math.round((selectedRegion.landCover?.forest ?? 0) * 100)}% forest`, { ...TEXT_STYLES.title, fontSize: 20 }, DETAIL_RECT.x + 30, y));
    y += 54;
    root.addChild(createText("DEPOSITS", TEXT_STYLES.muted, DETAIL_RECT.x + 30, y));
    y += 27;
    root.addChild(createWrappedText(selectedRegion.deposits.join("  /  ") || "None recorded", { ...TEXT_STYLES.body, fontSize: 18 }, DETAIL_RECT.x + 30, y, DETAIL_RECT.width - 60));
    y += 62;
    root.addChild(createText("SITES", TEXT_STYLES.muted, DETAIL_RECT.x + 30, y));
    y += 27;
    if (!sites.length) {
      root.addChild(createText("No established site", { ...TEXT_STYLES.body, fontSize: 18 }, DETAIL_RECT.x + 30, y));
      y += 50;
    }
    for (const site of sites) {
      root.addChild(createText(site.name, { ...TEXT_STYLES.title, fontSize: 20 }, DETAIL_RECT.x + 30, y));
      y += 28;
      const facilities = site.facilityDefIds.map((id) => getWorldFacilityDef(id)?.name ?? id);
      root.addChild(createWrappedText(facilities.join("  /  ") || "Detailed settlement", TEXT_STYLES.body, DETAIL_RECT.x + 30, y, DETAIL_RECT.width - 60));
      y += 42;
    }
    y += 8;
    root.addChild(createText("BORDERS", TEXT_STYLES.muted, DETAIL_RECT.x + 30, y));
    y += 26;
    for (const entry of borders.slice(0, 7)) {
      const otherId = entry.regionAId === selectedRegion.id ? entry.regionBId : entry.regionAId;
      const other = getRegionDefinition(state, otherId);
      root.addChild(createText(`${other?.name ?? otherId} - ${borderSummary(definition, entry)}`, { ...TEXT_STYLES.body, fontSize: 15 }, DETAIL_RECT.x + 30, y));
      y += 25;
    }
    const detailedSite = sites.find((site) => site.simulationMode === "detailed");
    if (detailedSite) addButton(root, { x: DETAIL_RECT.x + 30, y: DETAIL_RECT.y + DETAIL_RECT.height - 72, width: DETAIL_RECT.width - 60, height: 46 }, "Open settlement", () => onOpenDetailedSite?.(detailedSite.id), { selected: true });
  }

  return {
    init: () => render(true),
    update: () => render(false),
    refresh: () => { lastKey = ""; render(true); },
    setVisible: (visible) => { root.visible = visible === true; if (root.visible) render(true); },
    getSemanticSnapshot: () => ({
      visible: root.visible === true,
      selectedRegionId: getSelectedRegionId?.() ?? null,
      lastPointerRegionId,
      regionCount: getWorldDefinition(getState?.())?.regions?.length ?? 0,
      routePlanner: getRoutePlannerState?.() ?? null,
    }),
    getRegionClickPoint: (regionId) => {
      const region = getRegionDefinition(getState?.(), regionId);
      return region ? pointToScreen(region.display.labelPoint) : null;
    },
    destroy: () => { clearChildren(root); root.removeFromParent(); root.destroy({ children: true }); },
  };
}
