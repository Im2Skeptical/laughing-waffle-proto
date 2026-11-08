import { createRegionLabel } from './region-label.js';
import {drawSettlementDemographics} from './settlement-demographics-pixi.js';
import { addPracticeMultiplierPair } from './multiplier-fitting.js';
import { addSettlementPiece, addConstructionStrip, PIECE_SIZE } from './settlement-piece-pixi.js';
import { addIllustration, getArtRevision } from './chronicle-art.js';
import { addResourceIcon } from './resource-cost-pixi.js';
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

function panel(parent, rect, title) {
  const gfx = new PIXI.Graphics();
  roundedRect(gfx, rect.x, rect.y, rect.width, rect.height, 8, PALETTE.panelSoft, PALETTE.stroke, 2);
  parent.addChild(gfx, createText(title, TEXT_STYLES.title, rect.x + 18, rect.y + 15));
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
  tooltipView,
}) {
  const root = new PIXI.Container();
  layer.addChild(root);
  let activeTab = "overview";
  let lastSignature = "";
  let semanticSnapshot = null;
  let endDetailsTarget = null;
  let demographicVisual = null;

  function render(force = false, preparing = false) {
    if (!root.visible && !preparing) return;
    const state = getState?.();
    const regionId = getSelectedRegionId?.() ?? state?.civilization?.capitalRegionId;
    const vm = getDetailedSettlementViewModel(state, regionId);
    if (!vm) return;
    const civilizationLossInfo = getCivilizationLossInfo?.() ?? null;
    const survivalTracker = getCivilizationSurvivalViewModel(
      state,
      civilizationLossInfo
    );
    const signature = getArtRevision() + JSON.stringify({ tSec: state.tSec, regionId, activeTab, vm,
      lineage: state.civilization.vassalLineage, chaos: state.civilization.chaos,
      gameConfig: state.gameConfig, survivalTracker });
    if (!force && signature === lastSignature) return;
    lastSignature = signature;
    clearChildren(root);
    endDetailsTarget = null;
    demographicVisual = null;

    const bg = new PIXI.Graphics();
    bg.beginFill(PALETTE.background).drawRect(36, 78, 2352, 748).endFill();
    root.addChild(bg);
    const regionDef = getRegionDefinition(state, regionId);
    root.addChild(createRegionLabel(regionDef?.name ?? vm.name,
      { ...TEXT_STYLES.header, fontSize: 28 }, 48, 35, 670, 40, 0, 0.5));
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
      const foodRect = { x: BODY.x, y: BODY.y, width: 540, height: 260 };
      const practiceRect = { x: 606, y: BODY.y, width: 920, height: 430 };
      const orderRect = { x: 1544, y: BODY.y, width: 832, height: 430 };
      const structureRect = { x: 606, y: 534, width: 920, height: 260 };
      panel(root, foodRect, "Hosted Stock and population");
      panel(root, practiceRect, `${vm.practices.length} practice slots`);
      panel(root, orderRect, "Elder Order");
      panel(root, structureRect, "Regional structure space");
      if(vm.control){
        const c=vm.control,rect={x:1544,y:534,width:832,height:260};
        panel(root,rect,'Territory and allegiance');
        const holder=c.holder==='player'?'Free':c.holder==='external-a'?'Crown':'Unheld';
        const lines=[`${holder} / ${c.status} / ${Math.round(c.share*100)}% support`,
          `Free ${c.support.player??0} / Crown ${c.support['external-a']??0} / Unaffiliated ${c.support.neutral??0}`,
          `Unrest ${Math.round(c.unrest)} -> ${Math.round(c.targetUnrest)} / Treasury ${vm.civilizationPrestige} Prestige`,
          `Force ${Number(c.force.toFixed(1))}/${c.required} / ${c.availableWarriors} loyal Warriors / ${c.warriorForce} baseline`];
        lines.forEach((line,i)=>root.addChild(createText(line,{...TEXT_STYLES.body,fontSize:27},rect.x+18,rect.y+60+i*34)));
        if(c.holder==='player'&&vm.supportTargets.length){
          const targets=[null,...vm.supportTargets],current=targets.indexOf(c.supportTarget);
          addButton(root,{x:rect.x+18,y:744,width:796,height:42},`Garrison destination: ${c.supportTarget??'local'} >`,false,()=>onAssignGarrison?.(regionId,targets[(current+1)%targets.length]));
        }else root.addChild(createText('Claim 60% twice / retain 45% / loss at 75 unrest twice',{...TEXT_STYLES.body,fontSize:23},rect.x+18,744));
      }

      root.addChild(
        createText(`Edible Stock  ${vm.storedFood} / ${vm.storedFoodCapacity}`, TEXT_STYLES.body,
          foodRect.x + 54, foodRect.y + 64),
        createText(`Scholars ${vm.specialists.scholar} · Warriors ${vm.specialists.warrior}`, TEXT_STYLES.body, foodRect.x + 54, foodRect.y + 96),
        createText(`Currency Stock  ${vm.currency}`, TEXT_STYLES.body, foodRect.x + 54, foodRect.y + 128),
        createText(`Meal demand  ${vm.population.mealDemand}${vm.population.mealOverhead?` + ${vm.population.mealOverhead} upkeep`:""}`, TEXT_STYLES.body, foodRect.x + 18, foodRect.y + 154),
        createText(`Population  ${vm.population.total} / ${vm.population.housingCapacity} housing`,
          TEXT_STYLES.body, foodRect.x + 18, foodRect.y + 190),
        createText(`Last meal  ${vm.lastMeal ? `${vm.lastMeal.consumed}/${vm.lastMeal.demand}` : "none"}`,
          TEXT_STYLES.body, foodRect.x + 18, foodRect.y + 226)
      );
      addResourceIcon(root, 'food', foodRect.x + 31, foodRect.y + 74, 32);
      addResourceIcon(root, 'food', foodRect.x + 31, foodRect.y + 106, 32);
      addResourceIcon(root, 'money', foodRect.x + 31, foodRect.y + 138, 32);
      const practiceGap = PIECE_SIZE.gap;
      const practiceCardWidth = PIECE_SIZE.practiceWidth;
      vm.practices.forEach((entry, index) => {
        const slotX = practiceRect.x + 18 + index * (practiceCardWidth + practiceGap), slotY = practiceRect.y + 64;
        const hasPools = !!entry?.face?.outputMultiplierBreakdown;
        const slot = new PIXI.Graphics().lineStyle(1.5, 0x685c44, .85).beginFill(0x101815, .88)
          .drawRoundedRect(slotX - 5, slotY - 5, practiceCardWidth + 10, PIECE_SIZE.practiceHeight + (hasPools ? 46 + 18 : 10), 6).endFill();
        slot.eventMode = 'none'; root.addChild(slot);
        drawPracticeSlotCard(root, {
          x: slotX,
          y: slotY,
          width: practiceCardWidth,
          height: PIECE_SIZE.practiceHeight,
        }, entry, index, tooltipView);
        addPracticeMultiplierPair(root, { x: slotX, y: slotY + PIECE_SIZE.practiceHeight + 8, width: practiceCardWidth, height: 46 }, entry, index, tooltipView);
      });
      addIllustration(root,"settlement",{x:48,y:356,width:540,height:410},{alpha:.7});
      const order = vm.elderOrder;
      root.addChild(
        createText(`Worker policy: one token per ${getGameSetting(
          state,
          "populationPerToken"
        )} adults + elders, per class`,
          TEXT_STYLES.body, orderRect.x + 18, orderRect.y + 60),
        createText(`Elders: ${order.count} · Ages ${order.ages.join(", ") || "none"}`,
          TEXT_STYLES.body, orderRect.x + 18, orderRect.y + 102),
        createText(`Prestige: ${order.totalPrestige} total / ${order.count || 0}`,
          TEXT_STYLES.body, orderRect.x + 18, orderRect.y + 144),
        createText(`Resistance = ${order.averagePrestige} average + ${order.coordinationResistance} coordination`,
          TEXT_STYLES.body, orderRect.x + 18, orderRect.y + 186),
        createText(`Local resistance: ${order.resistance}`,
          { ...TEXT_STYLES.header, fill: PALETTE.accent }, orderRect.x + 18, orderRect.y + 232)
      );
      const vassal = getCurrentLifeMapVassal(state);
      if (vassal?.locationRegionId === regionId) {
        root.addChild(createText(
          `Vassal age ${getVassalAge(state, vassal)} · Prestige ${getDetailedVassalPrestige(state, vassal)} · currently here`,
          TEXT_STYLES.title, orderRect.x + 18, orderRect.y + 286));
        root.addChild(createText("Elder resistance does not affect Life Map interventions.",
          TEXT_STYLES.body, orderRect.x + 18, orderRect.y + 326));
      } else {
        root.addChild(createText("No current Vassal is located here.",
          { ...TEXT_STYLES.body, fill: PALETTE.textMuted }, orderRect.x + 18, orderRect.y + 286));
      }
      root.addChild(createText(
        `${vm.usedStructureCapacity} / ${vm.structureCapacity} construction cells`,
        { ...TEXT_STYLES.header, fontSize:22 }, structureRect.x + 18, structureRect.y + 54));
      addConstructionStrip(root,{x:structureRect.x+18,y:structureRect.y+104,width:884,height:148},{slots:vm.structures,capacity:vm.structureCapacity,tooltipView,inspectionSide:'right',time:state.tSec});
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
