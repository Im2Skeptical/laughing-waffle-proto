import {
  getRegionDefinition,
  getSitesInRegion,
  getWorldDefinition,
  getWorldFacilityDef,
  getWorldTerrainDef,
} from "../model/world-state.js";
import { clearChildren, createText, createWrappedText, roundedRect } from "./settlement-view-primitives.js";
import { PALETTE, TEXT_STYLES } from "./settlement-theme.js";

const MAP_RECT = Object.freeze({ x: 58, y: 104, width: 1640, height: 704 });
const DETAIL_RECT = Object.freeze({ x: 1734, y: 104, width: 626, height: 704 });

function pointToScreen(point) {
  const x = Array.isArray(point) ? point[0] : point?.x;
  const y = Array.isArray(point) ? point[1] : point?.y;
  return {
    x: MAP_RECT.x + Number(x ?? 0) * MAP_RECT.width,
    y: MAP_RECT.y + Number(y ?? 0) * MAP_RECT.height,
  };
}

function drawDashedPath(gfx, points, color, width = 4) {
  for (let index = 0; index < points.length - 1; index += 1) {
    const a = pointToScreen(points[index]);
    const b = pointToScreen(points[index + 1]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.max(1, Math.hypot(dx, dy));
    const steps = Math.max(1, Math.floor(length / 18));
    for (let step = 0; step < steps; step += 2) {
      const from = step / steps;
      const to = Math.min(1, (step + 1) / steps);
      gfx.lineStyle(width, color, 0.9);
      gfx.moveTo(a.x + dx * from, a.y + dy * from);
      gfx.lineTo(a.x + dx * to, a.y + dy * to);
    }
  }
}

function drawRoute(gfx, connection) {
  const points = connection?.display?.path ?? [];
  if (points.length < 2) return;
  const routeModes = new Set(connection.routes?.map((route) => route.mode) ?? []);
  if (routeModes.has("sea")) {
    drawDashedPath(gfx, points, 0xd7eef4, 5);
    return;
  }
  if (routeModes.has("river")) {
    gfx.lineStyle(7, 0x4f91b5, 0.9);
  } else {
    return;
  }
  const first = pointToScreen(points[0]);
  gfx.moveTo(first.x, first.y);
  for (let index = 1; index < points.length; index += 1) {
    const point = pointToScreen(points[index]);
    gfx.lineTo(point.x, point.y);
  }
}

function addButton(parent, rect, label, onPress) {
  const button = new PIXI.Container();
  const bg = new PIXI.Graphics();
  roundedRect(bg, 0, 0, rect.width, rect.height, 6, PALETTE.accent, 0x3f3935, 2);
  button.addChild(bg, createText(label, { ...TEXT_STYLES.chip, fill: 0x2d2926 }, rect.width / 2, rect.height / 2, 0.5, 0.5));
  button.x = rect.x;
  button.y = rect.y;
  button.interactive = true;
  button.buttonMode = true;
  button.cursor = "pointer";
  button.on("pointertap", () => onPress?.());
  parent.addChild(button);
  return button;
}

function routeLabel(connection) {
  return (connection?.routes ?? [])
    .map((route) => `${route.mode} ${route.weight}`)
    .join(" + ");
}

export function createWorldMapView({
  layer,
  getState,
  getSelectedRegionId,
  setSelectedRegionId,
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
    const selectedRegionId = getSelectedRegionId?.() ?? state?.civilization?.capitalRegionId ?? null;
    const key = `${definition.id}|${selectedRegionId}|${state?.world?.sites?.length ?? 0}`;
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
    root.addChild(createText("REGIONAL VIEW", { ...TEXT_STYLES.muted, fontSize: 15 }, 2290, 36, 1, 0.5));

    const sea = new PIXI.Graphics();
    roundedRect(sea, MAP_RECT.x, MAP_RECT.y, MAP_RECT.width, MAP_RECT.height, 6, 0x4f7784, 0x3d514f, 3);
    root.addChild(sea);

    for (const region of definition.regions) {
      const terrain = getWorldTerrainDef(region.terrainId);
      const selected = region.id === selectedRegionId;
      const polygon = region.polygon.flatMap((point) => {
        const screen = pointToScreen(point);
        return [screen.x, screen.y];
      });
      const shape = new PIXI.Graphics();
      shape.lineStyle(selected ? 7 : 3, selected ? PALETTE.accent : 0x3d443d, selected ? 1 : 0.92);
      shape.beginFill(terrain?.color ?? 0x777777, selected ? 1 : 0.94);
      shape.drawPolygon(polygon);
      shape.endFill();
      const regionHit = new PIXI.Container();
      regionHit.hitArea = new PIXI.Polygon(polygon);
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
    }

    const routeLayer = new PIXI.Graphics();
    routeLayer.eventMode = "none";
    for (const edge of definition.connections) drawRoute(routeLayer, edge);
    root.addChild(routeLayer);

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
      if (sites.length) {
        const sitePoint = pointToScreen(region.display.sitePoint);
        const marker = new PIXI.Graphics();
        marker.lineStyle(3, 0x292724, 1);
        marker.beginFill(sites.some((site) => site.simulationMode === "detailed") ? PALETTE.accent : 0xe4e0d6, 1);
        marker.drawCircle(sitePoint.x, sitePoint.y + 22, 8);
        marker.endFill();
        marker.eventMode = "none";
        root.addChild(marker);
      }
    }

    const selectedRegion = getRegionDefinition(state, selectedRegionId);
    const detail = new PIXI.Graphics();
    roundedRect(detail, DETAIL_RECT.x, DETAIL_RECT.y, DETAIL_RECT.width, DETAIL_RECT.height, 6, PALETTE.panelSoft, PALETTE.stroke, 3);
    root.addChild(detail);
    if (!selectedRegion) return;

    const terrain = getWorldTerrainDef(selectedRegion.terrainId);
    const sites = getSitesInRegion(state, selectedRegion.id);
    const edges = definition.connections.filter((edge) => edge.regionAId === selectedRegion.id || edge.regionBId === selectedRegion.id);
    let y = DETAIL_RECT.y + 42;
    root.addChild(createText(selectedRegion.name, TEXT_STYLES.header, DETAIL_RECT.x + 28, y));
    y += 62;
    root.addChild(createText("TERRAIN", TEXT_STYLES.muted, DETAIL_RECT.x + 30, y));
    y += 26;
    root.addChild(createText(terrain?.name ?? selectedRegion.terrainId, TEXT_STYLES.title, DETAIL_RECT.x + 30, y));
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
    root.addChild(createText("CONNECTIONS", TEXT_STYLES.muted, DETAIL_RECT.x + 30, y));
    y += 26;
    for (const edge of edges.slice(0, 6)) {
      const otherId = edge.regionAId === selectedRegion.id ? edge.regionBId : edge.regionAId;
      const other = getRegionDefinition(state, otherId);
      root.addChild(createText(`${other?.name ?? otherId}  -  ${routeLabel(edge)}`, { ...TEXT_STYLES.body, fontSize: 15 }, DETAIL_RECT.x + 30, y));
      y += 25;
    }
    const detailedSite = sites.find((site) => site.simulationMode === "detailed");
    if (detailedSite) {
      addButton(root, { x: DETAIL_RECT.x + 30, y: DETAIL_RECT.y + DETAIL_RECT.height - 72, width: DETAIL_RECT.width - 60, height: 46 }, "Open settlement", () => onOpenDetailedSite?.(detailedSite.id));
    }
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
    }),
    getRegionClickPoint: (regionId) => {
      const region = getRegionDefinition(getState?.(), regionId);
      return region ? pointToScreen(region.display.labelPoint) : null;
    },
    destroy: () => { clearChildren(root); root.removeFromParent(); root.destroy({ children: true }); },
  };
}
