import {
  getConnectedRegionIds,
  getRegionDefinition,
  getRegionPolygon,
  getRegionState,
  getWorldDefinition,
} from "../model/world-state.js";
import {
  getDetailedCivilizationSummary,
  getDetailedSettlementViewModel,
} from "../model/detailed-settlements.js";
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
  height: 356,
});
const DETAIL_RECT = Object.freeze({
  x: 1734,
  y: 476,
  width: 626,
  height: 332,
});
const REGION_COLOURS = Object.freeze({
  red: 0xb9574d, blue: 0x527da3, green: 0x638c62, black: 0x4d4d52,
});
const CONTROLLER_COLOURS = Object.freeze({
  player: 0xe8c96c, frontier: 0xd5d0c6, "external-a": 0xc17a57, "external-b": 0x8b72b1,
});
const MAX_RENDERED_WORKER_PAWNS = 5;

function screenPoint(point) {
  return {
    x: MAP_RECT.x + Number(point?.x ?? 0) * MAP_RECT.width,
    y: MAP_RECT.y + Number(point?.y ?? 0) * MAP_RECT.height,
  };
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
  root.on("pointertap", () => { if (!disabled) onPress?.(); });
  parent.addChild(root);
}

function getActiveWorkerCount(viewModel) {
  return (viewModel?.practices ?? []).reduce(
    (total, practice) =>
      total + (Array.isArray(practice?.workers?.tokens)
        ? practice.workers.tokens.length
        : 0),
    0
  );
}

export function getWorkerIndicatorPresentation(workerCount) {
  const activeWorkerCount = Number.isFinite(workerCount)
    ? Math.max(0, Math.floor(workerCount))
    : 0;
  return {
    activeWorkerCount,
    renderedPawnCount: Math.min(
      activeWorkerCount,
      MAX_RENDERED_WORKER_PAWNS
    ),
    badgeValue:
      activeWorkerCount > MAX_RENDERED_WORKER_PAWNS
        ? activeWorkerCount
        : null,
  };
}

function buildRegionMapIndicators(state, definition) {
  return definition.regions.map((regionDef) => {
    const region = getRegionState(state, regionDef.id);
    const viewModel = getDetailedSettlementViewModel(state, regionDef.id);
    const activeWorkerCount = getActiveWorkerCount(viewModel);
    const workerPresentation =
      getWorkerIndicatorPresentation(activeWorkerCount);
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

function addWorkerIndicator(parent, point, workerCount) {
  const presentation = getWorkerIndicatorPresentation(workerCount);
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
    for (let index = 0; index < renderedCount; index += 1) {
      addPawnGlyph(parent, startX + index * gap, point.y - 32, {
        color: PALETTE.text,
      });
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
  addPawnGlyph(parent, 382, 81, { color: PALETTE.text, scale: 0.8 });
  parent.addChild(
    createText(
      "active workers",
      { ...TEXT_STYLES.muted, fontSize: 13 },
      397,
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
}

function signature(
  state,
  selectedRegionId,
  civilizationSummary,
  survivalTracker,
  regionMapIndicators
) {
  return JSON.stringify({
    selectedRegionId,
    regions: state?.world?.regions,
    civilizationSummary,
    survivalTracker,
    regionMapIndicators,
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
  getSelectedRegionId,
  setSelectedRegionId,
  getCivilizationLossInfo,
  onOpenDetailedSite,
}) {
  const root = new PIXI.Container();
  layer.addChild(root);
  let lastSignature = "";
  let lastPointerRegionId = null;

  function render(force = false) {
    if (!root.visible) return;
    const state = getState?.();
    const definition = getWorldDefinition(state);
    if (!definition) return;
    const selectedRegionId = getSelectedRegionId?.() ?? state.civilization.capitalRegionId;
    const civilizationSummary = getDetailedCivilizationSummary(state);
    const civilizationLossInfo = getCivilizationLossInfo?.() ?? null;
    const survivalTracker = getCivilizationSurvivalViewModel(
      state,
      civilizationLossInfo
    );
    const regionMapIndicators = buildRegionMapIndicators(state, definition);
    const nextSignature = signature(
      state,
      selectedRegionId,
      civilizationSummary,
      survivalTracker,
      regionMapIndicators
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

    for (const regionDef of definition.regions) {
      const region = getRegionState(state, regionDef.id);
      const points = getRegionPolygon(definition, regionDef).flatMap((point) => {
        const p = screenPoint(point);
        return [p.x, p.y];
      });
      const selected = region.id === selectedRegionId;
      const shape = new PIXI.Graphics();
      shape.lineStyle(selected ? 5 : 2,
        selected ? PALETTE.accent : CONTROLLER_COLOURS[region.controller] ?? 0x777777, 1);
      shape.beginFill(REGION_COLOURS[region.colour] ?? 0x777777, 0.86);
      shape.drawPolygon(points);
      shape.endFill();
      const hit = new PIXI.Container();
      hit.hitArea = new PIXI.Polygon(points);
      hit.eventMode = "static";
      hit.cursor = "pointer";
      hit.addChild(shape);
      hit.on("pointerdown", () => {
        lastPointerRegionId = region.id;
        setSelectedRegionId?.(region.id);
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

    for (const indicator of regionMapIndicators) {
      const regionDef = definition.regions.find(
        (entry) => entry.id === indicator.regionId
      );
      if (!regionDef) continue;
      const point = screenPoint(regionDef.display.labelPoint);
      if (indicator.hasDetailedSettlement) {
        addWorkerIndicator(root, point, indicator.activeWorkerCount);
      }
      addStructureIndicator(root, point, indicator.structureSlots, {
        centered: !indicator.hasDetailedSettlement,
      });
      if (indicator.showsPlayerMarker) {
        addPlayerOwnershipMarker(root, point, {
          selected: indicator.regionId === selectedRegionId,
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
      PALETTE.stroke,
      3
    );
    root.addChild(
      civilizationPanel,
      createText(
        "CIVILIZATION",
        { ...TEXT_STYLES.header, fontSize: 26 },
        CIVILIZATION_RECT.x + 24,
        CIVILIZATION_RECT.y + 24
      ),
      createText(
        `${civilizationSummary.settlementCount} player settlements · ${civilizationSummary.population.total} people`,
        { ...TEXT_STYLES.title, fontSize: 18 },
        CIVILIZATION_RECT.x + 24,
        CIVILIZATION_RECT.y + 66
      ),
      createText(
        `Cohorts  ${civilizationSummary.population.children} children · ${civilizationSummary.population.adults} adults · ${civilizationSummary.population.elders} elders`,
        TEXT_STYLES.body,
        CIVILIZATION_RECT.x + 24,
        CIVILIZATION_RECT.y + 102
      ),
      createText(
        `Villagers  ${civilizationSummary.population.byClass.villager.children} C · ${civilizationSummary.population.byClass.villager.adults} A · ${civilizationSummary.population.byClass.villager.elders} E`,
        TEXT_STYLES.body,
        CIVILIZATION_RECT.x + 24,
        CIVILIZATION_RECT.y + 136
      ),
      createText(
        `Strangers  ${civilizationSummary.population.byClass.stranger.children} C · ${civilizationSummary.population.byClass.stranger.adults} A · ${civilizationSummary.population.byClass.stranger.elders} E`,
        TEXT_STYLES.body,
        CIVILIZATION_RECT.x + 24,
        CIVILIZATION_RECT.y + 168
      ),
      createText(
        `Food  ${civilizationSummary.food.stored}/${civilizationSummary.food.storedCapacity} stored · ${civilizationSummary.food.loose} loose`,
        TEXT_STYLES.body,
        CIVILIZATION_RECT.x + 24,
        CIVILIZATION_RECT.y + 208
      ),
      createText(
        `Meals  ${civilizationSummary.population.mealDemand} · Housing ${civilizationSummary.population.total}/${civilizationSummary.population.housingCapacity}`,
        TEXT_STYLES.body,
        CIVILIZATION_RECT.x + 24,
        CIVILIZATION_RECT.y + 240
      ),
      createText(
        `${civilizationSummary.overHousingSiteCount} over-housed sites`,
        {
          ...TEXT_STYLES.body,
          fill:
            civilizationSummary.overHousingSiteCount > 0
              ? PALETTE.red
              : PALETTE.textMuted,
        },
        CIVILIZATION_RECT.x + 24,
        CIVILIZATION_RECT.y + 272
      ),
      createText(
        `Chaos ${civilizationSummary.chaos.chaosPower} · Monsters ${civilizationSummary.chaos.monsterCount}/${civilizationSummary.chaos.monsterLossThreshold}`,
        { ...TEXT_STYLES.title, fontSize: 18, fill: PALETTE.accent },
        CIVILIZATION_RECT.x + 24,
        CIVILIZATION_RECT.y + 310
      )
    );

    const detailPanel = new PIXI.Graphics();
    roundedRect(
      detailPanel,
      DETAIL_RECT.x,
      DETAIL_RECT.y,
      DETAIL_RECT.width,
      DETAIL_RECT.height,
      7,
      PALETTE.panelSoft,
      PALETTE.stroke,
      3
    );
    root.addChild(detailPanel);
    const selectedDef = getRegionDefinition(state, selectedRegionId);
    const region = getRegionState(state, selectedRegionId);
    const viewModel = getDetailedSettlementViewModel(state, selectedRegionId);
    root.addChild(createText(selectedDef?.name ?? selectedRegionId,
      { ...TEXT_STYLES.header, fontSize: 26 },
      DETAIL_RECT.x + 24, DETAIL_RECT.y + 30));
    root.addChild(createText(
      `${region.colour} · ${region.controller} · ${getConnectedRegionIds(state, region.id).length} edges`,
      { ...TEXT_STYLES.body, fill: PALETTE.textMuted }, DETAIL_RECT.x + 24, DETAIL_RECT.y + 68));
    root.addChild(createText(
      `Structure space: ${viewModel?.usedStructureCapacity ?? 0} used / ${region.structureCapacity} available`,
      { ...TEXT_STYLES.title, fontSize: 17 }, DETAIL_RECT.x + 24, DETAIL_RECT.y + 104));
    if (viewModel) {
      root.addChild(createText(
        `Food ${viewModel.storedFood}/${viewModel.storedFoodCapacity} stored · ${viewModel.looseFood} loose`,
        TEXT_STYLES.body, DETAIL_RECT.x + 24, DETAIL_RECT.y + 142));
      root.addChild(createText(
        `Population ${viewModel.population.total} · Meal demand ${viewModel.population.mealDemand}`,
        TEXT_STYLES.body, DETAIL_RECT.x + 24, DETAIL_RECT.y + 174));
      root.addChild(createText(
        `Elder Order ${viewModel.elderOrder.count} elders · Resistance ${viewModel.elderOrder.resistance}`,
        TEXT_STYLES.body, DETAIL_RECT.x + 24, DETAIL_RECT.y + 206));
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
    init: () => render(true),
    update: () => render(),
    refresh: () => { lastSignature = ""; render(true); },
    setVisible: (visible) => { root.visible = visible === true; if (root.visible) render(true); },
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
        lastPointerRegionId,
        regionCount: getWorldDefinition(state)?.regions.length ?? 0,
        civilizationSummary,
        survivalTracker,
        selectedRegion: region ? {
          ...region,
          usedStructureCapacity: viewModel?.usedStructureCapacity ?? 0,
          detailedSettlement: viewModel,
        } : null,
        detailedSiteMarkerCount: getDetailedSettlementViewModel
          ? state?.world?.sites?.length ?? 0 : 0,
        regionNameLabelsVisible: false,
        regionMapIndicators,
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
    },
  };
}
