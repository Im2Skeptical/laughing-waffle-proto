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
  getDetailedCivilizationSummary,
  getDetailedSettlementViewModel,
} from "../model/detailed-settlements.js";
import {
  addCivilizationSurvivalStrip,
  getCivilizationSurvivalViewModel,
} from "./civilization-survival-hud.js";
import { clearChildren, createText, createWrappedText, roundedRect } from "./settlement-view-primitives.js";
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

function signature(
  state,
  selectedRegionId,
  civilizationSummary,
  survivalTracker
) {
  return JSON.stringify({
    selectedRegionId,
    regions: state?.world?.regions,
    civilizationSummary,
    survivalTracker,
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
    const nextSignature = signature(
      state,
      selectedRegionId,
      civilizationSummary,
      survivalTracker
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
      hit.on("pointertap", () => {
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

    for (const regionDef of definition.regions) {
      const region = getRegionState(state, regionDef.id);
      const point = screenPoint(regionDef.display.labelPoint);
      const site = getSitesInRegion(state, region.id)[0] ?? null;
      const viewModel = site ? getDetailedSettlementViewModel(state, region.id) : null;
      const nameLabel = createWrappedText(regionDef.name, {
        ...TEXT_STYLES.chip, fontSize: 13, align: "center", stroke: 0x333333, strokeThickness: 3,
      }, point.x, point.y - 16, 150, 0.5, 0.5);
      nameLabel.eventMode = "none";
      root.addChild(nameLabel);
      const summary = viewModel
        ? `${viewModel.usedStructureCapacity}/${viewModel.structureCapacity} structures`
        : `${region.structureCapacity} spaces`;
      const capacityLabel = createText(summary, {
        ...TEXT_STYLES.muted, fontSize: 11, fill: 0xffffff, stroke: 0x333333, strokeThickness: 3,
      }, point.x, point.y + 16, 0.5, 0.5);
      capacityLabel.eventMode = "none";
      root.addChild(capacityLabel);
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
