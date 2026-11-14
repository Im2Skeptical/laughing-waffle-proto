import { createRegionLabel } from './region-label.js';
import {drawSettlementDemographics} from './settlement-demographics-pixi.js';
import { addPracticeMultiplierPair } from './multiplier-fitting.js';
import { addSettlementPiece, addConstructionStrip, PIECE_SIZE } from './settlement-piece-pixi.js';
import { getArtRevision } from './chronicle-art.js';
import { OVERVIEW_LAYOUT, overviewPanel, overviewButton, overviewInspect, drawRegionalStock, drawPopulationOverview } from './settlement-overview-pixi.js';
import { getRegionalStockOverview, getControlledSettlementIds, cycleControlledSettlement } from './settlement-overview-data.js';
import {
  getDetailedSettlementViewModel,
  getDetailedVassalPrestige,
} from "../model/detailed-settlements.js";
import { getCurrentLifeMapVassal, getVassalAge } from "../model/vassal-life-map.js";
import { getRegionDefinition } from "../model/world-state.js";
import { getGameSetting } from "../model/game-config.js";
import {
  addCivilizationSurvivalStrip,
  getCivilizationSurvivalViewModel,
  getSurvivalEndDetailsClickPoint,
} from "./civilization-survival-hud.js";
import { clearChildren, createText, roundedRect } from "./settlement-view-primitives.js";
import { PALETTE, TEXT_STYLES } from "./settlement-theme.js";
import { addNeutralMarketBillboard } from './neutral-market-pixi.js';

const BODY = Object.freeze({ x: 48, y: 78, width: 2328, height: 730 });
export const SETTLEMENT_HEADER_LAYOUT = Object.freeze({
  survival: Object.freeze({ x: 590, y: 9, width: 680, height: 54 }),
  overview: Object.freeze({ x: 1290, y: 14, width: 150, height: 44 }),
  demographics: Object.freeze({ x: 1450, y: 14, width: 220, height: 44 }),
  previous: Object.freeze({x:48,y:9,width:58,height:54}),
  next: Object.freeze({x:516,y:9,width:58,height:54}),
  utilityReserve: Object.freeze({ x: 1960, y: 0, width: 464, height: 70 }),
});

function addButton(parent, rect, label, selected, onPress) {
  const root = new PIXI.Container();
  const gfx = new PIXI.Graphics();
  roundedRect(gfx, 0, 0, rect.width, rect.height, 7,
    selected ? PALETTE.accent : PALETTE.panel, PALETTE.stroke, 2);
  root.addChild(gfx, createText(label, {
    ...TEXT_STYLES.title,
    fill: selected ? 0x2b2825 : PALETTE.text,
  }, rect.width / 2, rect.height / 2, 0.5, 0.5));
  root.position.set(rect.x, rect.y);
  root.hitArea = new PIXI.Rectangle(0, 0, rect.width, rect.height);
  root.eventMode = "static";
  root.cursor = "pointer";
  root.on("pointerdown", onPress);
  parent.addChild(root);
}

function formatPracticeNumber(value) {
  const safe = Number.isFinite(value) ? Number(value) : 0;
  return Number.isInteger(safe) ? String(safe) : String(Math.round(safe * 100) / 100);
}

function getPracticeTimingLabel(activation) {
  if (activation?.type === "season") {
    const season = activation.seasonKeys?.[0];
    return season ? `Each ${season.replace(/^./, (letter) => letter.toUpperCase())}` : "Each season";
  }
  if (activation?.type === "birth") return "Birth phase";
  if (activation?.type === "food") return "Food phase";
  if (activation?.type === "trigger") return `Activates at ${activation.chargeThreshold} charge`;
  return `${activation?.type ?? 'Scheduled'} phase`;
}

function getPracticeResultLabel(practiceId, value) {
  const formatted = formatPracticeNumber(value);
  if (practiceId === "cultivate") return `Effect  +${formatted} food`;
  if (practiceId === "administrate") return `Cap  ${formatted} food`;
  if (practiceId === "exchange") return `Effect  +${formatted} Currency`;
  return `Effect  ${formatted}`;
}

function drawPracticeSlotCard(parent, rect, entry, slotIndex, tooltipView) {
  const evaluation=entry?.evaluation;
  const scaled=evaluation?.effects?.find(effect=>effect.scaledValue)?.scaledValue;
  const imported=evaluation?.effects?.find(effect=>effect.importCalculation)?.importCalculation;
  const details=[evaluation?.rule, ...(entry?.face?.detailLines ?? []),
    evaluation?getPracticeTimingLabel(evaluation.activation):'An available practice slot.',
    entry?.practiceId?entry.tier+' · '+(entry.tags??[]).join(' / '):'',
    entry?.practiceId&&evaluation?entry.workers.tokens.length+'/'+evaluation.workerCapacity+' workers · '+entry.workers.effectiveWorkers+' effective':'',
    scaled?'Base '+formatPracticeNumber(scaled.baseAmount)+' × '+formatPracticeNumber(scaled.evaluatorScore)+' × workers '+formatPracticeNumber(scaled.workerMultiplier):'',
    scaled?getPracticeResultLabel(entry.practiceId,scaled.effectiveValue):'',
    imported?'Import '+imported.importedFood+' food · shortfall '+imported.missingFood:'',
  ].filter(Boolean).join('\n');
  addSettlementPiece(parent,rect,{face:entry?.face,empty:!entry?.practiceId,detail:[...details.split('\n'), ...(entry?.face?.detailLines ?? [])],tooltipView,inspectionSide:'right'});
}

export function createSettlementPrototypeView({
  layer,
  getState,
  getSelectedRegionId,
  getCivilizationLossInfo,
  onOpenEndDetails,
  onAssignGarrison,
  onSelectSettlement,
  tooltipView,
}) {
  const root = new PIXI.Container();
  layer.addChild(root);
  let activeTab = "overview";
  let lastSignature = "";
  let semanticSnapshot = null;
  let endDetailsTarget = null;
  let demographicVisual = null;
  let stockPage = 0;
  let stockPageRegionId = null;
  let overviewVisual = null;

  function render(force = false, preparing = false) {
    if (!root.visible && !preparing) return;
    const state = getState?.();
    const regionId = getSelectedRegionId?.() ?? state?.civilization?.capitalRegionId;
    const vm = getDetailedSettlementViewModel(state, regionId);
    if (!vm) return;
    const regionalStock = getRegionalStockOverview(state, regionId);
    const controlledIds = getControlledSettlementIds(state);
    if (stockPageRegionId !== regionId) { stockPage = 0; stockPageRegionId = regionId; }
    const civilizationLossInfo = getCivilizationLossInfo?.() ?? null;
    const survivalTracker = getCivilizationSurvivalViewModel(
      state,
      civilizationLossInfo
    );
    const signature = getArtRevision() + JSON.stringify({ tSec: state.tSec, regionId, activeTab, stockPage, controlledIds, regionalStock, vm,
      lineage: state.civilization.vassalLineage, chaos: state.civilization.chaos,
      gameConfig: state.gameConfig, survivalTracker });
    if (!force && signature === lastSignature) return;
    lastSignature = signature;
    clearChildren(root);
    endDetailsTarget = null;
    demographicVisual = null;
    overviewVisual = null;

    const bg = new PIXI.Graphics();
    bg.beginFill(PALETTE.background).drawRect(36, 78, 2352, 748).endFill();
    root.addChild(bg);
    const regionDef = getRegionDefinition(state, regionId);
    root.addChild(createRegionLabel(regionDef?.name ?? vm.name,
      { ...TEXT_STYLES.header, fontSize: 28 }, 116, 35, 390, 48, 0, 0.5));
    const canCycle = controlledIds.length > 1 || controlledIds.length === 1 && controlledIds[0] !== regionId;
    for (const [key, direction, label] of [['previous', -1, '‹'], ['next', 1, '›']]) {
      const button = overviewButton(root, SETTLEMENT_HEADER_LAYOUT[key], label, () => {
        const next = cycleControlledSettlement(getState?.(), getSelectedRegionId?.(), direction);
        if (next) { tooltipView?.hide?.({force:true}); onSelectSettlement?.(next); }
      }, {enabled: canCycle});
      button.accessibleTitle = `${key === 'previous' ? 'Previous' : 'Next'} controlled settlement`;
    }
    endDetailsTarget = addCivilizationSurvivalStrip(root, {
      state,
      civilizationLossInfo,
      rect: SETTLEMENT_HEADER_LAYOUT.survival,
      onOpenEndDetails,
    }).detailsTarget;
    addButton(root, SETTLEMENT_HEADER_LAYOUT.overview, "Overview",
      activeTab === "overview", () => { activeTab = "overview"; lastSignature = ""; });
    addButton(root, SETTLEMENT_HEADER_LAYOUT.demographics, "Demographics",
      activeTab === "demographics", () => { activeTab = "demographics"; lastSignature = ""; });

    if (vm.neutral && activeTab === "overview") {
      addNeutralMarketBillboard(root,{x:BODY.x+320,y:BODY.y+10,width:1680,height:BODY.height-20},
        {name:vm.name,stocks:vm.marketStocks,defense:state.world.sites.find(site=>site.regionId===regionId)?.neutral?.defense,tooltipView});
    } else if (activeTab === "overview") {
      const practiceRect = OVERVIEW_LAYOUT.practices, structureRect = OVERVIEW_LAYOUT.structures;
      overviewPanel(root, practiceRect, 'Practices');
      overviewPanel(root, structureRect, 'Structures');
      const stock = drawRegionalStock(root, {stock:regionalStock, tooltipView, page:stockPage,
        onPage: page => { tooltipView?.hide?.({force:true}); stockPage = page; lastSignature = ''; }});
      stockPage = stock.page;
      const population = drawPopulationOverview(root, {state, vm, tooltipView, onAssignGarrison});
      overviewVisual = {layout:OVERVIEW_LAYOUT, stock, population};
      const practiceGap = 14;
      const practiceCardWidth = 204;
      const practiceCardHeight = practiceCardWidth * PIECE_SIZE.practiceHeight / PIECE_SIZE.practiceWidth;
      vm.practices.forEach((entry, index) => {
        const slotX = practiceRect.x + 22 + index * (practiceCardWidth + practiceGap), slotY = practiceRect.y + 64;
        const hasPools = !!entry?.face?.outputMultiplierBreakdown;
        const slot = new PIXI.Graphics().lineStyle(1.5, 0x685c44, .85).beginFill(0x101815, .88)
          .drawRoundedRect(slotX - 5, slotY - 5, practiceCardWidth + 10, practiceCardHeight + (hasPools ? 46 + 18 : 10), 6).endFill();
        slot.eventMode = 'none'; root.addChild(slot);
        drawPracticeSlotCard(root, {
          x: slotX,
          y: slotY,
          width: practiceCardWidth,
          height: practiceCardHeight,
        }, entry, index, tooltipView);
        addPracticeMultiplierPair(root, { x: slotX, y: slotY + practiceCardHeight + 8, width: practiceCardWidth, height: 46 }, entry, index, tooltipView);
      });
      root.addChild(createText(
        `${vm.usedStructureCapacity} / ${vm.structureCapacity} construction cells`,
        { ...TEXT_STYLES.body, fontSize:28 }, structureRect.x + 320, structureRect.y + 18));
      addConstructionStrip(root,{x:structureRect.x+22,y:structureRect.y+66,width:1076,height:156},{slots:vm.structures,capacity:vm.structureCapacity,tooltipView,inspectionSide:'right',time:state.tSec});
      const order=vm.elderOrder, vassal=getCurrentLifeMapVassal(state);
      root.addChild(createText(`Elders ${order.count}  ·  Resistance ${order.resistance}${vassal?.locationRegionId===regionId?'  ·  Vassal here':''}`,
        {...TEXT_STYLES.body,fontSize:25,fill:PALETTE.textMuted},structureRect.x+22,structureRect.y+228));
      overviewInspect(root,{x:structureRect.x+16,y:structureRect.y+222,width:1088,height:40},{title:'Elder Order & labour',lines:[
        `One worker token per ${getGameSetting(state,'populationPerToken')} adults + Elders, per class.`,
        `${order.count} Elders · Ages ${order.ages.join(', ') || 'none'}.`,
        `Prestige ${order.totalPrestige} · Resistance ${order.resistance} (${order.averagePrestige} average + ${order.coordinationResistance} coordination).`,
        ...(vassal?.locationRegionId===regionId?[`Vassal age ${getVassalAge(state,vassal)} · Prestige ${getDetailedVassalPrestige(state,vassal)}.`]:['No current Vassal is located here.']),
        'Elder resistance does not affect Life Map interventions.',
      ]},tooltipView,'overview:elders');
    } else {
      demographicVisual = drawSettlementDemographics(root,{state,vm,tooltipView});
    }

    semanticSnapshot = {
      visible: root.visible === true,
      activeTab,
      regionId,
      calendar: {
        seasonKey: survivalTracker.seasonKey,
        year: survivalTracker.year,
        label: survivalTracker.calendarLabel,
      },
      survivalTracker,
      headerControls: SETTLEMENT_HEADER_LAYOUT,
      overview: vm,
      overviewVisual,
      settlementNavigation: {controlledIds, enabled:canCycle, previous:SETTLEMENT_HEADER_LAYOUT.previous, next:SETTLEMENT_HEADER_LAYOUT.next},
      demographics: {
        visual: demographicVisual,
        census: vm.demographics,
        population: vm.population,
        lastMeal: vm.lastMeal,
        currentMoonResult: vm.currentMoonResult,
        lastMoonResult: vm.lastMoonResult,
      },
      elderOrder: vm.elderOrder,
    };
  }

  return {
    init: () => render(true),
    refresh: () => { lastSignature = ""; render(true); },
    update: () => render(),
    // Build the retained scene without displaying it or changing navigation.
    async prepare(renderer) {
      render(false, true);
      await renderer.prepare.upload(root);
    },
    setVisible: (visible) => { root.visible = visible === true; if (root.visible) render(); },
    getScreenRect: () => root.visible ? root.getBounds?.() ?? null : null,
    getEndDetailsClickPoint: () => getSurvivalEndDetailsClickPoint(endDetailsTarget, root.visible),
    getSemanticSnapshot: () => semanticSnapshot && { ...semanticSnapshot, visible: root.visible === true },
    destroy: () => {
      clearChildren(root);
      root.removeFromParent();
      root.destroy({ children: true });
    },
  };
}
