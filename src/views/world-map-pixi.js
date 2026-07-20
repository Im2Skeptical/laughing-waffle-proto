import {
  REGIONAL_PRACTICE_IDS,
  regionalPracticeDefs,
} from "../defs/gamepieces/regional-practice-defs.js";
import {
  evaluateRegionalPracticePlacement,
  validateRegionalPracticeInstallation,
  validateRegionalPracticeUninstallation,
} from "../model/regional-practices.js";
import {
  getConnectedRegionIds,
  getRegionDefinition,
  getRegionPolygon,
  getRegionState,
  getSitesInRegion,
  getWorldDefinition,
  getWorldVertex,
} from "../model/world-state.js";
import {
  clearChildren,
  createText,
  createWrappedText,
  roundedRect,
} from "./settlement-view-primitives.js";
import { PALETTE, TEXT_STYLES } from "./settlement-theme.js";

const MAP_RECT = Object.freeze({ x: 58, y: 104, width: 1640, height: 704 });
const DETAIL_RECT = Object.freeze({ x: 1734, y: 104, width: 626, height: 704 });
const REGION_COLOURS = Object.freeze({
  red: 0xb9574d,
  blue: 0x527da3,
  green: 0x638c62,
  black: 0x4d4d52,
});
const CONTROLLER_COLOURS = Object.freeze({
  player: 0xe8c96c,
  frontier: 0xd5d0c6,
  "external-a": 0xc17a57,
  "external-b": 0x8b72b1,
});
const CONTROLLER_MARKERS = Object.freeze({
  player: Object.freeze({ glyph: "P", label: "Player" }),
  frontier: Object.freeze({ glyph: "F", label: "Frontier" }),
  "external-a": Object.freeze({ glyph: "A", label: "External A" }),
  "external-b": Object.freeze({ glyph: "B", label: "External B" }),
});
const PRACTICE_BUTTON_WIDTH = 276;
const PRACTICE_BUTTON_HEIGHT = 96;
const PRACTICE_BUTTON_GAP_X = 14;
const PRACTICE_BUTTON_GAP_Y = 12;
const PRACTICE_BUTTON_START_Y = DETAIL_RECT.y + 267;
const INSTALLED_PRACTICE_START_Y = DETAIL_RECT.y + 166;
const INSTALLED_PRACTICE_HEIGHT = 44;
const INSTALLED_PRACTICE_GAP = 8;
const INSTALLED_PRACTICE_COLUMNS = 4;

function pointToScreen(point) {
  const x = Array.isArray(point) ? point[0] : point?.x;
  const y = Array.isArray(point) ? point[1] : point?.y;
  return {
    x: MAP_RECT.x + Number(x ?? 0) * MAP_RECT.width,
    y: MAP_RECT.y + Number(y ?? 0) * MAP_RECT.height,
  };
}

function getVertexPath(definition, vertexIds) {
  return (vertexIds ?? []).map((id) => getWorldVertex(definition, id)).filter(Boolean);
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

function titleCase(value) {
  return String(value ?? "")
    .split(/[-\s]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

function installReasonText(reason) {
  switch (reason) {
    case "invalidPracticeId": return "Unknown practice";
    case "invalidRegionId": return "Unknown region";
    case "notPlayerControlled": return "Player-controlled regions only";
    case "capacityFull": return "No capacity available";
    default: return "Unavailable";
  }
}

function practiceButtonRect(practiceId) {
  const index = REGIONAL_PRACTICE_IDS.indexOf(practiceId);
  if (index < 0) return null;
  const column = index % 2;
  const row = Math.floor(index / 2);
  return {
    x: DETAIL_RECT.x + 24 + column * (PRACTICE_BUTTON_WIDTH + PRACTICE_BUTTON_GAP_X),
    y: PRACTICE_BUTTON_START_Y + row * (PRACTICE_BUTTON_HEIGHT + PRACTICE_BUTTON_GAP_Y),
    width: PRACTICE_BUTTON_WIDTH,
    height: PRACTICE_BUTTON_HEIGHT,
  };
}

function installedPracticeButtonRect(installedIndex) {
  const availableWidth = DETAIL_RECT.width - 48;
  const width = (
    availableWidth - INSTALLED_PRACTICE_GAP * (INSTALLED_PRACTICE_COLUMNS - 1)
  ) / INSTALLED_PRACTICE_COLUMNS;
  const column = installedIndex % INSTALLED_PRACTICE_COLUMNS;
  const row = Math.floor(installedIndex / INSTALLED_PRACTICE_COLUMNS);
  return {
    x: DETAIL_RECT.x + 24 + column * (width + INSTALLED_PRACTICE_GAP),
    y: INSTALLED_PRACTICE_START_Y + row * (INSTALLED_PRACTICE_HEIGHT + INSTALLED_PRACTICE_GAP),
    width,
    height: INSTALLED_PRACTICE_HEIGHT,
  };
}

function addControllerMarker(parent, point, controller, { selected = false, radius = 14 } = {}) {
  const markerDef = CONTROLLER_MARKERS[controller] ?? { glyph: "?", label: "Unknown" };
  const marker = new PIXI.Container();
  const gfx = new PIXI.Graphics();
  gfx.lineStyle(selected ? 5 : 3, selected ? PALETTE.accent : 0x383532, 1);
  gfx.beginFill(CONTROLLER_COLOURS[controller] ?? 0x777777, 1);
  gfx.drawCircle(0, 0, selected ? radius + 2 : radius);
  gfx.endFill();
  marker.addChild(
    gfx,
    createText(
      markerDef.glyph,
      { ...TEXT_STYLES.chip, fontSize: radius, fill: 0x302d2a },
      0,
      1,
      0.5,
      0.5
    )
  );
  marker.x = point.x;
  marker.y = point.y;
  marker.eventMode = "none";
  parent.addChild(marker);
  return marker;
}

function addControllerLegend(parent) {
  parent.addChild(createText("CONTROL", { ...TEXT_STYLES.muted, fontSize: 13 }, 520, 36, 0, 0.5));
  let x = 635;
  for (const controller of Object.keys(CONTROLLER_MARKERS)) {
    addControllerMarker(parent, { x, y: 36 }, controller, { radius: 10 });
    parent.addChild(createText(
      CONTROLLER_MARKERS[controller].label,
      { ...TEXT_STYLES.body, fontSize: 13, fill: PALETTE.textMuted },
      x + 18,
      36,
      0,
      0.5
    ));
    x += controller.startsWith("external") ? 235 : 205;
  }
}

function addButton(parent, rect, label, onPress, { selected = false, disabled = false } = {}) {
  const button = new PIXI.Container();
  const bg = new PIXI.Graphics();
  const fill = selected ? PALETTE.accent : PALETTE.panel;
  roundedRect(bg, 0, 0, rect.width, rect.height, 6, fill, selected ? 0x3f3935 : PALETTE.stroke, 2);
  button.addChild(
    bg,
    createText(
      label,
      { ...TEXT_STYLES.chip, fill: selected ? 0x2d2926 : PALETTE.text },
      rect.width / 2,
      rect.height / 2,
      0.5,
      0.5
    )
  );
  button.x = rect.x;
  button.y = rect.y;
  button.alpha = disabled ? 0.45 : 1;
  button.eventMode = "static";
  button.interactive = true;
  button.buttonMode = !disabled;
  button.cursor = disabled ? "default" : "pointer";
  button.on("pointertap", () => { if (!disabled) onPress?.(); });
  parent.addChild(button);
  return button;
}

function addPracticeButton(parent, rect, def, evaluation, validation, onPress) {
  const disabled = !validation.ok;
  const button = new PIXI.Container();
  const bg = new PIXI.Graphics();
  roundedRect(
    bg,
    0,
    0,
    rect.width,
    rect.height,
    6,
    disabled ? PALETTE.panelSoft : PALETTE.panel,
    disabled ? 0x696660 : PALETTE.stroke,
    2
  );
  button.addChild(bg);
  button.addChild(createText(def.name, { ...TEXT_STYLES.title, fontSize: 18 }, 12, 12));
  button.addChild(createText(
    evaluation.ok ? `${evaluation.score}/4` : "—",
    { ...TEXT_STYLES.header, fontSize: 21, fill: disabled ? PALETTE.textMuted : PALETTE.accent },
    rect.width - 12,
    10,
    1
  ));
  const detailText = evaluation.ok
    ? evaluation.breakdown.filter((entry) => entry.kind !== "base").map((entry) => entry.text).join(" · ")
    : "Unable to evaluate";
  button.addChild(createWrappedText(
    detailText,
    { ...TEXT_STYLES.body, fontSize: 13, fill: PALETTE.textMuted },
    12,
    39,
    rect.width - 24
  ));
  if (disabled) {
    button.addChild(createText(
      installReasonText(validation.reason),
      { ...TEXT_STYLES.chip, fontSize: 12, fill: 0xd8b9a8 },
      12,
      rect.height - 18
    ));
  }
  button.x = rect.x;
  button.y = rect.y;
  button.alpha = disabled ? 0.62 : 1;
  // Keep fixed map controls in the interaction tree across region selection.
  // Disabled controls retain a no-op hit target so Pixi does not cache their
  // previous event mode when the detail panel is rebuilt.
  button.eventMode = "static";
  button.interactive = true;
  button.buttonMode = !disabled;
  button.cursor = disabled ? "default" : "pointer";
  button.on("pointertap", () => { if (!disabled) onPress?.(); });
  parent.addChild(button);
}

function addInstalledPracticeButton(parent, rect, def, installedIndex, validation, onPress) {
  const disabled = !validation.ok;
  const button = new PIXI.Container();
  const bg = new PIXI.Graphics();
  roundedRect(
    bg,
    0,
    0,
    rect.width,
    rect.height,
    6,
    disabled ? PALETTE.panelSoft : PALETTE.chip,
    disabled ? 0x696660 : PALETTE.accent,
    2
  );
  button.addChild(
    bg,
    createText(
      String(installedIndex + 1),
      { ...TEXT_STYLES.muted, fontSize: 12 },
      10,
      rect.height / 2,
      0,
      0.5
    ),
    createText(
      def?.name ?? "Unknown",
      { ...TEXT_STYLES.chip, fontSize: 13 },
      rect.width / 2,
      rect.height / 2,
      0.5,
      0.5
    ),
    createText(
      "×",
      { ...TEXT_STYLES.title, fontSize: 19, fill: disabled ? PALETTE.textMuted : PALETTE.accent },
      rect.width - 10,
      rect.height / 2 - 1,
      1,
      0.5
    )
  );
  button.x = rect.x;
  button.y = rect.y;
  button.alpha = disabled ? 0.58 : 1;
  button.eventMode = "static";
  button.interactive = true;
  button.buttonMode = !disabled;
  button.cursor = disabled ? "default" : "pointer";
  button.on("pointertap", () => { if (!disabled) onPress?.(); });
  parent.addChild(button);
}

function worldMechanicsSignature(state) {
  return (state?.world?.regions ?? [])
    .map((region) => [
      region.id,
      region.colour,
      region.capacity,
      region.controller,
      region.installedPracticeIds.join(","),
    ].join(":"))
    .join("|");
}

function selectedRegionSnapshot(state, selectedRegionId) {
  const region = getRegionState(state, selectedRegionId);
  if (!region) return null;
  return {
    id: region.id,
    colour: region.colour,
    controller: region.controller,
    capacity: region.capacity,
    usedCapacity: region.installedPracticeIds.length,
    installedPracticeIds: [...region.installedPracticeIds],
    connectedRegionIds: getConnectedRegionIds(state, region.id),
    practiceOptions: REGIONAL_PRACTICE_IDS.map((practiceId) => ({
      practiceId,
      evaluation: evaluateRegionalPracticePlacement(state, { regionId: region.id, practiceId }),
      installation: validateRegionalPracticeInstallation(state, { regionId: region.id, practiceId }),
    })),
  };
}

export function createWorldMapView({
  layer,
  getState,
  getSelectedRegionId,
  setSelectedRegionId,
  onInstallPractice,
  onUninstallPractice,
  onOpenDetailedSite,
}) {
  const root = new PIXI.Container();
  root.zIndex = 1;
  layer.addChild(root);
  let lastKey = "";
  let lastPointerRegionId = null;
  let lastPracticeResult = null;

  function render(force = false) {
    if (!root.visible) return;
    const state = getState?.();
    const definition = getWorldDefinition(state);
    if (!definition) return;
    const selectedRegionId = getSelectedRegionId?.() ?? state?.civilization?.capitalRegionId ?? null;
    const key = [definition.id, selectedRegionId, worldMechanicsSignature(state), JSON.stringify(lastPracticeResult)].join("|");
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
    addControllerLegend(root);
    root.addChild(createText("MINIMAL REGIONAL GRAPH", { ...TEXT_STYLES.muted, fontSize: 15 }, 2290, 36, 1, 0.5));

    const context = definition.mapContext;
    const contextLayer = new PIXI.Graphics();
    roundedRect(contextLayer, MAP_RECT.x, MAP_RECT.y, MAP_RECT.width, MAP_RECT.height, 6, context.landColor, 0x3d514f, 3);
    const oceanPolygon = [
      ...getVertexPath(definition, context.coastlineVertexIds),
      ...context.oceanBoundaryPoints,
    ].flatMap((point) => {
      const screen = pointToScreen(point);
      return [screen.x, screen.y];
    });
    contextLayer.beginFill(context.oceanColor, 1);
    contextLayer.drawPolygon(oceanPolygon);
    contextLayer.endFill();
    root.addChild(contextLayer);

    for (const regionDef of definition.regions) {
      const region = getRegionState(state, regionDef.id);
      const polygon = getRegionPolygon(definition, regionDef);
      const screenPolygon = polygon.flatMap((point) => {
        const screen = pointToScreen(point);
        return [screen.x, screen.y];
      });
      const selected = regionDef.id === selectedRegionId;
      const shape = new PIXI.Graphics();
      shape.lineStyle(
        selected ? 5 : region?.controller === "player" ? 3 : 2,
        selected ? PALETTE.accent : CONTROLLER_COLOURS[region?.controller] ?? 0x676767,
        selected ? 1 : 0.9
      );
      shape.beginFill(REGION_COLOURS[region?.colour] ?? 0x777777, selected ? 0.94 : 0.82);
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
        lastPointerRegionId = regionDef.id;
        lastPracticeResult = null;
        setSelectedRegionId?.(regionDef.id);
        lastKey = "";
      });
      root.addChild(regionHit);
    }

    const connectionLayer = new PIXI.Graphics();
    for (const connection of definition.connections) {
      const a = definition.regions.find((entry) => entry.id === connection.regionAId)?.display?.labelPoint;
      const b = definition.regions.find((entry) => entry.id === connection.regionBId)?.display?.labelPoint;
      if (!a || !b) continue;
      const from = pointToScreen(a);
      const to = pointToScreen(b);
      connectionLayer.lineStyle(2, 0xf0eadc, 0.42);
      connectionLayer.moveTo(from.x, from.y);
      connectionLayer.lineTo(to.x, to.y);
    }
    connectionLayer.eventMode = "none";
    root.addChild(connectionLayer);

    const coastlineLayer = new PIXI.Graphics();
    const coastline = getVertexPath(definition, context.coastlineVertexIds);
    drawSolidPath(coastlineLayer, coastline, 0x344a4c, 6, 0.75);
    drawSolidPath(coastlineLayer, coastline, context.coastlineColor, 2.5, 0.82);
    coastlineLayer.eventMode = "none";
    root.addChild(coastlineLayer);

    for (const regionDef of definition.regions) {
      const region = getRegionState(state, regionDef.id);
      const labelPoint = pointToScreen(regionDef.display.labelPoint);
      const selected = regionDef.id === selectedRegionId;
      addControllerMarker(root, labelPoint, region?.controller, { selected });
      const label = createWrappedText(
        regionDef.name,
        {
          ...TEXT_STYLES.chip,
          fontSize: selected ? 15 : 13,
          fontWeight: selected ? "bold" : "normal",
          fill: 0xf4eee3,
          align: "center",
          stroke: 0x343632,
          strokeThickness: selected ? 4 : 3,
        },
        labelPoint.x,
        labelPoint.y - 28,
        150,
        0.5,
        0.5
      );
      label.eventMode = "none";
      root.addChild(label);
      const capacityLabel = createText(
        `${region?.installedPracticeIds.length ?? 0}/${region?.capacity ?? 0}`,
        { ...TEXT_STYLES.muted, fontSize: 12, fill: 0xf4eee3, stroke: 0x343632, strokeThickness: 3 },
        labelPoint.x,
        labelPoint.y + 28,
        0.5,
        0.5
      );
      capacityLabel.eventMode = "none";
      root.addChild(capacityLabel);
    }

    const detail = new PIXI.Graphics();
    roundedRect(detail, DETAIL_RECT.x, DETAIL_RECT.y, DETAIL_RECT.width, DETAIL_RECT.height, 6, PALETTE.panelSoft, PALETTE.stroke, 3);
    root.addChild(detail);

    const selectedDef = getRegionDefinition(state, selectedRegionId);
    const selectedRegion = getRegionState(state, selectedRegionId);
    if (!selectedDef || !selectedRegion) return;
    const connectedIds = getConnectedRegionIds(state, selectedRegionId);
    let y = DETAIL_RECT.y + 38;
    root.addChild(createText(selectedDef.name, TEXT_STYLES.header, DETAIL_RECT.x + 24, y));
    y += 42;
    root.addChild(createText(
      `${titleCase(selectedRegion.colour)} · ${titleCase(selectedRegion.controller)} · ${selectedRegion.installedPracticeIds.length}/${selectedRegion.capacity} capacity`,
      { ...TEXT_STYLES.title, fontSize: 18 },
      DETAIL_RECT.x + 24,
      y
    ));
    y += 31;
    root.addChild(createText(
      `${connectedIds.length} connection${connectedIds.length === 1 ? "" : "s"}`,
      { ...TEXT_STYLES.body, fontSize: 15, fill: PALETTE.textMuted },
      DETAIL_RECT.x + 24,
      y
    ));
    y += 31;
    root.addChild(createText("INSTALLED PRACTICES · TAP TO REMOVE", TEXT_STYLES.muted, DETAIL_RECT.x + 24, y));
    if (selectedRegion.installedPracticeIds.length === 0) {
      root.addChild(createText(
        "None",
        { ...TEXT_STYLES.body, fontSize: 15, fill: PALETTE.textMuted },
        DETAIL_RECT.x + 24,
        INSTALLED_PRACTICE_START_Y + INSTALLED_PRACTICE_HEIGHT / 2,
        0,
        0.5
      ));
    } else {
      selectedRegion.installedPracticeIds.forEach((practiceId, installedIndex) => {
        const rect = installedPracticeButtonRect(installedIndex);
        const validation = validateRegionalPracticeUninstallation(state, {
          regionId: selectedRegionId,
          installedIndex,
        });
        addInstalledPracticeButton(
          root,
          rect,
          regionalPracticeDefs[practiceId],
          installedIndex,
          validation,
          () => {
            const result = onUninstallPractice?.(selectedRegionId, installedIndex) ?? null;
            lastPracticeResult = result ? { ...result, operation: "uninstall" } : null;
            lastKey = "";
          }
        );
      });
    }
    root.addChild(createText("HYPOTHETICAL SCORE / INSTALL", TEXT_STYLES.muted, DETAIL_RECT.x + 24, DETAIL_RECT.y + 239));

    for (const practiceId of REGIONAL_PRACTICE_IDS) {
      const rect = practiceButtonRect(practiceId);
      const evaluation = evaluateRegionalPracticePlacement(state, { regionId: selectedRegionId, practiceId });
      const validation = validateRegionalPracticeInstallation(state, { regionId: selectedRegionId, practiceId });
      addPracticeButton(root, rect, regionalPracticeDefs[practiceId], evaluation, validation, () => {
        const result = onInstallPractice?.(selectedRegionId, practiceId) ?? null;
        lastPracticeResult = result ? { ...result, operation: "install" } : null;
        lastKey = "";
      });
    }

    if (lastPracticeResult) {
      const removing = lastPracticeResult.operation === "uninstall";
      const message = lastPracticeResult.ok
        ? lastPracticeResult.scheduled
          ? `${removing ? "Removal" : "Installation"} scheduled for the next second`
          : `Practice ${removing ? "removed" : "installed"}`
        : `Practice change failed: ${installReasonText(lastPracticeResult.reason)}`;
      root.addChild(createText(
        message,
        { ...TEXT_STYLES.chip, fontSize: 12 },
        DETAIL_RECT.x + DETAIL_RECT.width - 24,
        DETAIL_RECT.y + 239,
        1
      ));
    }

    const detailedSite = getSitesInRegion(state, selectedRegionId)
      .find((site) => site.simulationMode === "detailed");
    addButton(
      root,
      { x: DETAIL_RECT.x + 24, y: DETAIL_RECT.y + DETAIL_RECT.height - 68, width: DETAIL_RECT.width - 48, height: 44 },
      detailedSite ? "Open settlement" : "No detailed settlement",
      () => onOpenDetailedSite?.(detailedSite?.id),
      { selected: !!detailedSite, disabled: !detailedSite }
    );
  }

  return {
    init: () => render(true),
    update: () => render(false),
    refresh: () => { lastKey = ""; render(true); },
    setVisible: (visible) => { root.visible = visible === true; if (root.visible) render(true); },
    getSemanticSnapshot: () => {
      const state = getState?.();
      const selectedRegionId = getSelectedRegionId?.() ?? null;
      return {
        visible: root.visible === true,
        selectedRegionId,
        lastPointerRegionId,
        regionCount: getWorldDefinition(state)?.regions?.length ?? 0,
        selectedRegion: selectedRegionSnapshot(state, selectedRegionId),
        controllerMarkers: getWorldDefinition(state)?.regions?.map((regionDef) => ({
          regionId: regionDef.id,
          controller: getRegionState(state, regionDef.id)?.controller ?? null,
          point: pointToScreen(regionDef.display.labelPoint),
        })) ?? [],
        detailedSiteMarkerCount: 0,
        lastPracticeResult,
      };
    },
    getRegionClickPoint: (regionId) => {
      const region = getRegionDefinition(getState?.(), regionId);
      return region ? pointToScreen(region.display.labelPoint) : null;
    },
    getPracticeClickPoint: (practiceId) => {
      const rect = practiceButtonRect(practiceId);
      return rect ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } : null;
    },
    getInstalledPracticeClickPoint: (installedIndex) => {
      const rect = installedPracticeButtonRect(installedIndex);
      return rect ? { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 } : null;
    },
    destroy: () => { clearChildren(root); root.removeFromParent(); root.destroy({ children: true }); },
  };
}
