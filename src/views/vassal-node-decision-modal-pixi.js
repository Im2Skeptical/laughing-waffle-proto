import { getVassalShopRerollCost } from '../model/vassal-life-map/shop.js';
import { getTapFeedbackSnapshot } from './interaction-feedback.js';
import { deserializeGameState } from '../model/state.js';
import { addSettlementPiece, addConstructionStrip, animatePieceUpgrade, PIECE_SIZE } from "./settlement-piece-pixi.js";
import { constructionGeometry } from './piece-geometry.js';
import { getArtRevision } from './chronicle-art.js';
import { addChronicleInspection } from './chronicle-inspection.js';
import { addPracticeReading } from './practice-reading-pixi.js';
import { addResourceAmount } from './resource-cost-pixi.js';
import { getVassalLifeMapNodeFamily } from "../defs/gamepieces/vassal-life-map-defs.js";
import { getVassalLifeMapNode } from "../model/vassal-life-map.js";
import {
  getVassalActionPhaseCost,
  getAdjustedVassalPrestigeCost,
} from "../model/vassal-life-map.js";
import { clearChildren, createText, roundedRect } from "./settlement-view-primitives.js";
import { PALETTE, TEXT_STYLES } from "./settlement-theme.js";
import {
  CONTENT,
  COST_FOOTER_HEIGHT,
  MORTALITY_PLATE,
  OPTION_COLUMN,
  PANEL,
} from "./vassal-node-decision/constants.js";
import {
  actionCard,
  pieceOfferCard,
  button,
  offerEffect,
  optionEffect,
  relicRiskLabel,
  outcomeCard,
} from "./vassal-node-decision/cards.js";
import {
  confirmDockButton,
  confirmDockRect,
  renderTitlePlaque,
} from "./vassal-node-decision/chrome.js";
import { renderMortalityEstimate } from "./vassal-node-decision/mortality.js";
import { renderRegionalMap } from "./vassal-node-decision/regional-map.js";
import { renderVassalProjection } from "./vassal-node-decision/vassal-projection.js";

export function createVassalNodeDecisionModalView({
  app, layer, getState, getPresentation, getDecisionPresentation, onEnterNode, onSelectOption,
  onPurchaseOffer, onUndoPurchase, onReorderPurchase, onMoveStructure, onRerollShop, onConfirmNode,
  onWorldMap, onReadOnlyAction, getProtectedBackdropRects, onReview,
} = {}) {
  const backdrop = new PIXI.Graphics();
  backdrop.beginFill(0x171713, 0.68).drawRect(0, 0, app.screen.width, app.screen.height).endFill();
  backdrop.eventMode = "static";
  backdrop.visible = false;
  const transitionGraphic = new PIXI.Graphics();
  transitionGraphic.eventMode = "none";
  transitionGraphic.visible = false;
  const root = new PIXI.Container();
  root.visible = false;
  root.zIndex = 170;
  root.eventMode = "none";
  layer?.addChild(backdrop, transitionGraphic, root);
  const panelCenter = { x: PANEL.x + PANEL.width / 2, y: PANEL.y + PANEL.height / 2 };
  const MOTION_MS = 130;
  const START_SIZE = 72;
  const reducedMotion = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)");
  let logicalOpen = false;
  let visibility = 0;
  let motion = null;
  let motionOrigin = { ...panelCenter };
  let motionColor = PALETTE.accent;
  let motionRect = null;
  let backdropPressedPointerId = null;
  let openNodeId = null;
  let signature = "";
  const preparedLayouts = new Map();
  let layoutBuilds = 0, preparedLayoutHits = 0;
  let inspectionLayerIndex = null;

  // The HUD and shared navigation are later siblings in this unsorted layer.
  // Full inspect owns the foreground until it closes, including its backdrop.
  function setInspectionAboveChrome(expanded) {
    const parent=root.parent;
    if(!parent)return;
    if(expanded) {
      inspectionLayerIndex??=parent.getChildIndex(root);
      parent.setChildIndex(root,parent.children.length-1);
    } else if(inspectionLayerIndex!==null) {
      parent.setChildIndex(root,Math.min(inspectionLayerIndex,parent.children.length-1));
      inspectionLayerIndex=null;
    }
  }

  function takeLayout() {
    const content = new PIXI.Container();
    for (const child of root.removeChildren()) content.addChild(child);
    return {content, signature, enterRoot, optionRoots, offerRoots, shopCardRoots,
      confirmRoot, undoRoots, tableauRoots, inspectionRoot, lastDecision, tableauWidth:tableau.width,
      inspectionAboveChrome:inspectionLayerIndex!==null};
  }
  function restoreLayout(layout) {
    for (const child of layout.content.removeChildren()) root.addChild(child);
    layout.content.destroy();
    ({signature, enterRoot, optionRoots, offerRoots, shopCardRoots, confirmRoot,
      undoRoots, tableauRoots, inspectionRoot, lastDecision} = layout);
    tableau.width = layout.tableauWidth;
    setInspectionAboveChrome(layout.inspectionAboveChrome);
  }
  function clearPreparedLayouts() {
    for (const layout of preparedLayouts.values()) layout.content.destroy({children:true});
    preparedLayouts.clear();
  }
  let dragged = null;
  let dragGhost = null;
  let tableauRoots = [];
  let inspectionRoot = null;
  let lastDecision = null;
  const tableau = { x: PANEL.x+1200, practiceY: PANEL.y+CONTENT.practiceY, structureY: PANEL.y+CONTENT.structureY, width: 928 };
  let dragTargetIndex = null;
  let enterRoot = null;
  let optionRoots = [];
  let offerRoots = [];
  let shopCardRoots = [];
  let confirmRoot = null;
  let undoRoots = [];
  let hoveredOptionId = null;
  let hoveredOfferId = null;
  let hoveredTableauId = null;
  let previewTableauId = null;
  let previewOptionId = null;
  let previewOfferId = null;
  let pinnedInspectionId = null;
  let quickInspectionId = null;
  let acquirePicker = null;
  const construction = () => constructionGeometry({x:tableau.x,y:tableau.structureY,width:tableau.width,height:PIECE_SIZE.structureHeight},lastDecision?.settlement?.structureCapacity??8);
  let hoverRenderTimer = null;

  function inspectPiece(id, face, event) {
    if(event?.pointerType==='touch'&&face?.reading) {
      quickInspectionId=quickInspectionId===id?null:id;
      pinnedInspectionId=null;
    } else {
      pinnedInspectionId=pinnedInspectionId===id?null:id;
      quickInspectionId=null;
    }
    render(true);
  }

  function closeInspection() {
    quickInspectionId=pinnedInspectionId=null;
    previewOfferId=hoveredOfferId=previewTableauId=hoveredTableauId=null;
    render(true);
  }

  function explainReadOnly(control, readOnly) {
    if (readOnly) {
      control.eventMode = "static";
      control.on("pointertap", () => onReadOnlyAction?.());
    }
    return control;
  }

  function scheduleHoverRender() {
    if (hoverRenderTimer != null) clearTimeout(hoverRenderTimer);
    hoverRenderTimer = setTimeout(() => {
      hoverRenderTimer = null;
      previewOptionId = hoveredOptionId;
      previewOfferId = hoveredOfferId;
      previewTableauId = hoveredTableauId;
      render(true);
    }, 120);
  }

  // Keep a pressed cost/button alive through hover or art-loading redraws.
  // Otherwise the replacement node cannot receive the matching pointer tap.
  let pointerHeld = false;
  root.on('pointerdown', () => { pointerHeld = true; });
  for (const type of ['pointerup', 'pointerupoutside', 'pointercancel']) {
    root.on(type, () => { pointerHeld = false; });
  }

  function applyMotionPose() {
    const centerX = motionOrigin.x + (panelCenter.x - motionOrigin.x) * visibility;
    const centerY = motionOrigin.y + (panelCenter.y - motionOrigin.y) * visibility;
    const width = START_SIZE + (PANEL.width - START_SIZE) * visibility;
    const height = START_SIZE + (PANEL.height - START_SIZE) * visibility;
    motionRect = { x: centerX - width / 2, y: centerY - height / 2, width, height };
    root.alpha = Math.max(0, Math.min(1, (visibility - 0.72) / 0.28));
    backdrop.alpha = visibility;
    transitionGraphic.clear();
    transitionGraphic.lineStyle(3, motionColor, 0.85)
      .beginFill(0x292f2b, 0.9)
      .drawRoundedRect(motionRect.x, motionRect.y, width, height, 18)
      .endFill();
    transitionGraphic.alpha = 1 - root.alpha * 0.7;
  }

  function finishMotion() {
    motion = null;
    transitionGraphic.visible = false;
    root.eventMode = logicalOpen ? "static" : "none";
    if (!logicalOpen) {
      root.visible = false;
      backdrop.visible = false;
    }
  }

  function advanceMotion(now = performance.now()) {
    if (!motion) return;
    const t = Math.min(1, (now - motion.startedAtMs) / MOTION_MS);
    const eased = 1 - (1 - t) ** 3;
    visibility = motion.from + (motion.to - motion.from) * eased;
    applyMotionPose();
    if (t >= 1) finishMotion();
  }

  function moveToVisibility(target, immediate = false) {
    advanceMotion();
    if (immediate || reducedMotion?.matches || Math.abs(visibility - target) < 0.001) {
      visibility = target;
      applyMotionPose();
      finishMotion();
      return;
    }
    motion = { from: visibility, to: target, startedAtMs: performance.now() };
    root.eventMode = "none";
    transitionGraphic.visible = true;
    applyMotionPose();
  }

  function close({ immediate = false } = {}) {
    if (!logicalOpen && !immediate) return;
    logicalOpen = false;
    setInspectionAboveChrome(false);
    quickInspectionId=null;
    backdropPressedPointerId = null;
    pointerHeld = false;
    dragged = null;
    dragTargetIndex = null;
    hoveredOptionId = null;
    hoveredOfferId = null;
    hoveredTableauId = null;previewTableauId = null;
    previewOptionId = null;
    previewOfferId = null;
    acquirePicker = null;
    if (hoverRenderTimer != null) clearTimeout(hoverRenderTimer);
    hoverRenderTimer = null;
    moveToVisibility(0, immediate);
  }

  function isProtectedBackdropPoint(point) {
    const rects = [confirmDockRect(app), ...(getProtectedBackdropRects?.() ?? [])];
    return rects.some((rect) => rect && point.x >= rect.x - 40
      && point.x <= rect.x + rect.width + 40
      && point.y >= rect.y - 40 && point.y <= rect.y + rect.height + 40);
  }

  backdrop.on("pointermove", (event) => {
    backdrop.cursor = isProtectedBackdropPoint(event.global) ? "default" : "pointer";
  });
  backdrop.on("pointerdown", (event) => {
    event?.stopPropagation?.();
    backdropPressedPointerId = motion ? null : event.pointerId ?? "pointer";
  });
  for (const type of ["pointerupoutside", "pointercancel"]) {
    backdrop.on(type, () => { backdropPressedPointerId = null; });
  }
  backdrop.on("pointertap", (event) => {
    event?.stopPropagation?.();
    if (backdropPressedPointerId !== (event.pointerId ?? "pointer")) return;
    backdropPressedPointerId = null;
    if (logicalOpen && !isProtectedBackdropPoint(event.global)) close();
  });

  function open(nodeId = null, nodePoint = null) {
    advanceMotion();
    backdropPressedPointerId = null;
    motionOrigin = nodePoint && Number.isFinite(nodePoint.x) && Number.isFinite(nodePoint.y)
      ? { x: nodePoint.x, y: nodePoint.y } : { ...panelCenter };
    logicalOpen = true;
    pinnedInspectionId = null;
    quickInspectionId = null;
    openNodeId = nodeId ?? getPresentation?.()?.vassal?.lifeMap?.currentNodeId ?? null;
    root.visible = true;
    backdrop.visible = true;
    hoveredOptionId = null;
    hoveredOfferId = null;
    hoveredTableauId = null;previewTableauId = null;
    previewOptionId = null;
    previewOfferId = null;
    render(true);
    moveToVisibility(1);
  }

  const animatedUpgrades = new Set();
  let placementGuide = null;
  function animateUpgrade(card, piece, readOnly) {
    if (!readOnly && piece?.upgraded && !animatedUpgrades.has(piece.offerId)) {
      animatedUpgrades.add(piece.offerId);
      animatePieceUpgrade(card, piece.previousPresentation);
    }
  }

  function beginDrag(event, card, piece, fromOffer = false) {
    event.stopPropagation();
    const presentation = getPresentation?.();
    if(presentation?.readOnly) { onReadOnlyAction?.(); return; }
    if(!fromOffer && !piece.staged) return;
    if(fromOffer && piece.purchased) return;
    dragged = { card, piece, fromOffer, start: root.toLocal(event.global), active:false, point:root.toLocal(event.global) };
    if(hoverRenderTimer!=null)clearTimeout(hoverRenderTimer);
  }

  function finishDrag(event) {
    if (!dragged) return;
    const drag = dragged; dragged = null;
    placementGuide?.destroy(); placementGuide = null;
    dragGhost?.destroy({children:true}); dragGhost=null;
    if(!drag.active) return;
    event?.stopPropagation?.(); drag.card.dragConsumed=true;
    const local=event?.global?root.toLocal(event.global):drag.point;
    const kind=drag.piece.intervention?.kind??drag.piece.presentation?.kind;
    const offerId=drag.piece.offerId;
    if(local.x<PANEL.x+1160) {
      if(!drag.fromOffer)onUndoPurchase?.(openNodeId,offerId);
    } else if(kind==='structure' && local.y>=tableau.structureY-35 && local.y<tableau.structureY+PIECE_SIZE.structureHeight+35) {
      const origin=Math.floor((local.x-tableau.x)/(construction().cell));
      if(drag.fromOffer)onPurchaseOffer?.(openNodeId,offerId,origin);
      else onMoveStructure?.(openNodeId,offerId,origin);
    } else if(kind==='practice' && local.y>=tableau.practiceY-25 && local.y<tableau.practiceY+PIECE_SIZE.practiceHeight+25) {
      const toIndex=Math.max(0,Math.min((lastDecision?.settlement?.practices?.length??5)-1,Math.floor((local.x-tableau.x)/(PIECE_SIZE.practiceWidth+PIECE_SIZE.gap))));
      if(drag.fromOffer)onPurchaseOffer?.(openNodeId,offerId,null,toIndex);
      else onReorderPurchase?.(openNodeId,offerId,toIndex);
    }
    render(true);
  }
  root.on('globalpointermove',event=>{
    if(!dragged)return;
    const local=root.toLocal(event.global);dragged.point=local;
    if(!dragged.active&&Math.hypot(local.x-dragged.start.x,local.y-dragged.start.y)>10) {
      dragged.active=true;dragged.card.dragConsumed=true;
      pinnedInspectionId=null;quickInspectionId=null;previewOfferId=null;hoveredOfferId=null;previewTableauId=null;hoveredTableauId=null;
      inspectionRoot?.destroy({children:true});inspectionRoot=null;
      const face=dragged.piece.presentation;
      dragGhost=addSettlementPiece(root,{x:local.x-48,y:local.y-64,width:face?.kind==='structure'?PIECE_SIZE.cellWidth*(face.footprint??1):PIECE_SIZE.practiceWidth,height:face?.kind==='structure'?PIECE_SIZE.structureHeight:PIECE_SIZE.practiceHeight},{face,state:'staged'});
      dragGhost.eventMode='none';dragGhost.alpha=.65;
    }
    if(dragGhost)dragGhost.position.set(local.x-48,local.y-64);
    if (dragged.active && dragged.piece.presentation?.kind === 'structure') {
      placementGuide?.destroy(); placementGuide = new PIXI.Graphics();
      const offer = [...(lastDecision?.offers ?? []), ...(lastDecision?.purchases ?? [])].find(p => p.offerId === dragged.piece.offerId);
      const origins = offer?.validOrigins ?? [], width = dragged.piece.presentation.footprint ?? 1;
      const origin = Math.floor((local.x - tableau.x) / construction().cell);
      for (const cell of origins) placementGuide.beginFill(0xaedbc9,.8).drawCircle(tableau.x + cell * construction().cell + 8, tableau.structureY - 9, 4).endFill();
      if (local.x >= tableau.x && origin >= 0 && origin < (lastDecision?.settlement?.structureCapacity ?? 0)) {
        placementGuide.lineStyle(4,origins.includes(origin)?0xaedbc9:0xd97d68).drawRect(tableau.x + origin * construction().cell,tableau.structureY,width * construction().cell,construction().height);
      }
      placementGuide.eventMode = 'none'; root.addChild(placementGuide);
    }
  });
  root.on('pointerup',finishDrag);
  root.on('pointerupoutside',finishDrag);
  root.on('pointercancel',()=>{dragged=null;dragGhost?.destroy({children:true});dragGhost=null;placementGuide?.destroy();placementGuide=null;render(true);});

  function render(force = false, prepared = null) {
    if ((!logicalOpen && !prepared) || dragged || pointerHeld || root.pendingInteractionCount > 0) return;
    const presentation = prepared ?? getPresentation?.() ?? {};
    const state = prepared?.state ?? getState?.() ?? null;
    const vassal = presentation.vassal;
    const readOnly = presentation.readOnly === true;
    const projection = presentation.viewedSec > presentation.frontierSec;
    const currentNodeId = vassal?.lifeMap?.currentNodeId ?? null;
    const decision = prepared?.decision ?? getDecisionPresentation?.(openNodeId, {
      previewOptionId,
      previewOfferId,
    }) ?? null;
    lastDecision = decision;
    tableau.width = Math.min(928,(decision?.settlement?.structureCapacity ?? 8)*PIECE_SIZE.cellWidth);
    const node = decision?.node ?? getVassalLifeMapNode(vassal, openNodeId);
    const nodeState = decision?.nodeState ?? vassal?.lifeMap?.nodeStates?.[openNodeId] ?? null;
    const family = getVassalLifeMapNodeFamily(node);
    motionColor = family?.color ?? PALETTE.accent;
    const nextSignature = getArtRevision() + JSON.stringify({ presentation: {
      vassalId:vassal?.vassalId, readOnly, viewedSec:presentation.viewedSec,
      frontierSec:presentation.frontierSec, profileSec:presentation.profileSec,
    }, decision, openNodeId, dragTargetIndex, width:app.screen.width,height:app.screen.height,
      previewOptionId, previewOfferId, previewTableauId, pinnedInspectionId, quickInspectionId });
    // Refresh callbacks can run several times for one entry. A matching layout
    // is already authoritative, including its selected/disabled controls.
    if (!prepared && nextSignature === signature) return;
    const cached = !prepared && preparedLayouts.get(nextSignature);
    if (cached) {
      inspectionRoot?.releaseKeywordFocus?.();
      clearChildren(root);
      preparedLayouts.delete(nextSignature);
      restoreLayout(cached);
      preparedLayoutHits++;
      return;
    }
    signature = nextSignature;
    layoutBuilds++;
    const retainedReference=inspectionRoot?.getReferenceState?.();
    const retainedReferenceId=inspectionRoot?.inspectedPieceId;
    inspectionRoot?.releaseKeywordFocus?.();
    setInspectionAboveChrome(false);
    clearChildren(root);
    enterRoot = null;
    optionRoots = [];
    offerRoots = [];
    shopCardRoots = [];
    confirmRoot = null;
    undoRoots = [];
    tableauRoots = [];
    inspectionRoot = null;

    const bg = new PIXI.Graphics();
    roundedRect(bg, PANEL.x, PANEL.y, PANEL.width, PANEL.height, 18,
      0x292f2b, family?.color ?? PALETTE.accent, 3);
    bg.eventMode = "static";
    bg.on("pointertap", (event) => event?.stopPropagation?.());
    root.addChild(bg);

    if (!vassal || !node || !family) {
      root.addChild(createText("No Lifegraph decision is available.", {
        ...TEXT_STYLES.header, fontSize: 28,
      }, PANEL.x + 50, PANEL.y + 88));
      return;
    }

    const projected = decision?.projectedPrestige ?? vassal.prestige;

    const hasContext = decision?.contextKind && decision.contextKind !== "none";
    const simpleOutcomes = node.family === 'patronage' || node.family === 'development'
      || node.family === 'relic';
    if (hasContext) {
      const divider = new PIXI.Graphics();
      divider.lineStyle(2, PALETTE.stroke, 0.9).moveTo(PANEL.x + 1160, PANEL.y + CONTENT.labelY)
        .lineTo(PANEL.x + 1160, PANEL.y + PANEL.height - 28);
      root.addChild(divider);
    }

    if (!nodeState) {
      root.addChild(createText(readOnly
        ? projection ? "Return to Present to enter this node. This future is a projection."
          : "This node was not part of the committed path. Return to Present to make decisions."
        : "Enter this node to reveal its choices and begin the decision.", {
        ...TEXT_STYLES.header, fontSize: 23, fill: PALETTE.textMuted,
        wordWrap: true, wordWrapWidth: 900,
      }, PANEL.x + 54, PANEL.y + 96));
      const available = !readOnly && (vassal.lifeMap.availableNodeIds ?? []).includes(node.id)
        && (vassal.developmentChoiceQueue ?? []).length === 0;
      enterRoot = button(root, { x: PANEL.x + 54, y: PANEL.y + 176, width: 430, height: 64 },
        `ENTER ${family.label.toUpperCase()}`, available, () => {
          onEnterNode?.(node.id);
          openNodeId = node.id;
          render(true);
        });
      explainReadOnly(enterRoot, readOnly);
    } else if (nodeState.resolving) {
      root.addChild(createText("DECISION COMMITTED · RESOLUTION IN PROGRESS", {
        ...TEXT_STYLES.header, fontSize: 25, fill: PALETTE.accent,
      }, PANEL.x + 54, PANEL.y + CONTENT.cardY));
    } else {
      const isShop = nodeState.contentMode === "shop";
      const cardGap = OPTION_COLUMN.gap;
      const cardY = PANEL.y + CONTENT.cardY;
      const cardCount = isShop
        ? [...(decision?.offers ?? []), ...(decision?.purchases ?? [])].length
        : (nodeState.options ?? []).length;
      const cardWidth = cardCount > 3
        ? Math.min(OPTION_COLUMN.width, Math.floor((1080 - (cardCount - 1) * cardGap) / cardCount))
        : OPTION_COLUMN.width;
      const cardHeight = node.family === 'relic' ? OPTION_COLUMN.relicHeight : OPTION_COLUMN.height;
      // Keep staged offers in their original places so their prices and full
      // inspections remain available throughout the draft. The model still
      // removes purchases from the available inventory until they are undone.
      const shopCards = [...(decision?.offers ?? []), ...(decision?.purchases ?? [])]
        .sort((a, b) => (a.sourceInventoryIndex ?? a.inventoryIndex ?? 0)
          - (b.sourceInventoryIndex ?? b.inventoryIndex ?? 0));
      const cardStartX = PANEL.x + 54;
      if (isShop) {
        root.addChild(createText("SHOP OFFERS", {
          ...TEXT_STYLES.chip, fontSize: 14, fill: PALETTE.textMuted,
        }, PANEL.x + 54, PANEL.y + CONTENT.labelY));
        shopCardRoots = shopCards.map((offer,index)=>{
          const enabled=!readOnly&&!offer.purchased&&offer.prestigeCost<=projected&&offer.canStage!==false;
          const inspect=event=>inspectPiece(offer.offerId,offer.presentation,event);
          const x=cardStartX+index*(cardWidth+cardGap);
          const card=(offer.presentation?pieceOfferCard:actionCard)(root,{x,y:cardY,width:cardWidth,height:cardHeight},{
            title:offer.label,artId:node.family,presentation:offer.presentation,
            actionLabel:offer.purchased?'STAGED':'STAGE',staged:offer.purchased,onInspect:inspect,
            cost:{prestigeCost:offer.prestigeCost,currencyCost:offer.currencyCost,phaseCost:offer.phaseCost,state},enabled,
            costUnmet:!offer.purchased && String(offer.stageBlockedReason ?? '').startsWith('Insufficient'),
            onClick:()=>onPurchaseOffer?.(node.id,offer.offerId),onUnavailable:readOnly?onReadOnlyAction:null,
            onHover:()=>{hoveredOfferId=offer.offerId;scheduleHoverRender();},
            onOut:()=>{if(hoveredOfferId===offer.offerId){hoveredOfferId=null;scheduleHoverRender();}},
          });
          card.faceRoot?.on('pointerdown',event=>beginDrag(event,card.faceRoot,offer,true));
          if(offer.purchased)undoRoots.push(button(root,{x,y:cardY+cardHeight+OPTION_COLUMN.costGap+COST_FOOTER_HEIGHT+8,width:cardWidth,height:44},'UNDO',!readOnly,()=>onUndoPurchase?.(node.id,offer.offerId)));
          return card;
        });
        offerRoots=shopCardRoots.filter((_,index)=>!shopCards[index].purchased);

      } else {
        root.addChild(createText("CHOOSE ONE", {
          ...TEXT_STYLES.chip, fontSize: 14, fill: PALETTE.textMuted,
        }, PANEL.x + 54, PANEL.y + CONTENT.labelY));
        optionRoots = (nodeState.options ?? []).map((option, index) => {
          const prestigeCost = getAdjustedVassalPrestigeCost(vassal, option.prestigeCost ?? 0);
          const phaseCost = getVassalActionPhaseCost(vassal, option.phaseCost ?? 0, {
            nodeState, isTravel: nodeState.family === 'travel',
          });
          const requirements = decision?.optionRequirements?.[option.id] ?? [];
          return (simpleOutcomes ? outcomeCard : actionCard)(root, {
            x: cardStartX + index * (cardWidth + cardGap), y: cardY,
            width: cardWidth, height: cardHeight,
          }, {
            artId:node.family, quality: option.quality, fitEffects: nodeState.family === 'relic',
            expanded:pinnedInspectionId===option.id||previewOptionId===option.id,actionLabel:'CHOOSE',
            onInspect:event=>inspectPiece(option.id,option.presentation,event),
            title: requirements.some((entry) => !entry.met) ? `${option.label} · Unavailable` : option.label,
            cost: { prestigeCost, phaseCost, state,
              riskLabel: nodeState.family === 'relic' ? relicRiskLabel(option) : null },
            costUnmet: prestigeCost > vassal.prestige,
            effect: requirements.length
              ? requirements.map((entry) => `${entry.met ? "✓" : "✗"} ${entry.label}`).join("\n")
              : optionEffect(option),
            enabled: !readOnly && prestigeCost <= vassal.prestige && requirements.every((entry) => entry.met),
            onUnavailable: readOnly ? onReadOnlyAction : null,
            selected: nodeState.selectedOptionId === option.id,
            onClick: () => onSelectOption?.(node.id, option.id),
            onHover: () => {
              if (hoveredOptionId === option.id) return;
              hoveredOptionId = option.id;
              scheduleHoverRender();
            },
            onOut: () => {
              if (hoveredOptionId !== option.id) return;
              hoveredOptionId = null;
              scheduleHoverRender();
            },
          });
        });
      }
    }

    const sx = PANEL.x + 1200;
    const settlement = decision?.settlement;
    if (decision?.contextKind === "settlement" && settlement) {
      root.addChild(createText(`SETTLEMENT · ${decision?.previewRegionLabel ?? vassal.locationRegionId}`, {
        ...TEXT_STYLES.header, fontSize: 22,
      }, sx, PANEL.y + CONTENT.labelY));
      root.addChild(createText(
        `Hosted Edible ${Math.round(settlement.storedFood ?? 0)}    Hosted Currency ${Math.round(settlement.currency ?? 0)}`,
        { ...TEXT_STYLES.body, fontSize: 20, fill: PALETTE.textMuted }, sx, PANEL.y + CONTENT.settlementMetaY));
      root.addChild(createText('PRACTICES   Stock / Supply',{...TEXT_STYLES.chip,fontSize:20,fill:PALETTE.textMuted},sx,PANEL.y+CONTENT.practiceLabelY));
      (settlement.practices??[]).forEach((piece,index)=>{
        const card=addSettlementPiece(root,{x:tableau.x+index*(PIECE_SIZE.practiceWidth+PIECE_SIZE.gap),y:tableau.practiceY,width:PIECE_SIZE.practiceWidth,height:PIECE_SIZE.practiceHeight},{
          face:piece?.presentation,empty:!piece,state:piece?.upgraded?'upgraded':piece?.staged?'staged':'confirmed',time:state?.tSec??0,
          onHover:piece?()=>{hoveredTableauId='practice:'+piece.practiceId;scheduleHoverRender();}:undefined,
          onOut:()=>{hoveredTableauId=null;scheduleHoverRender();},
          onInspect:piece?event=>inspectPiece('practice:'+piece.practiceId,piece.presentation,event):undefined,
        });
        if(piece?.staged)card.on('pointerdown',event=>beginDrag(event,card,piece));
        animateUpgrade(card, piece, readOnly);
        tableauRoots.push({card,piece});
      });
      (settlement.displacedPractices??[]).forEach((face,index)=>{
        const card=addSettlementPiece(root,{x:tableau.x+858+index*12,y:tableau.practiceY+116,width:60,height:96},{face,state:'displaced',onInspect:event=>inspectPiece('displaced:'+face.definitionId,face,event)});
        card.rotation=.12;
      });
      root.addChild(createText('CONSTRUCTION',{...TEXT_STYLES.chip,fontSize:20,fill:PALETTE.textMuted},sx,PANEL.y+CONTENT.structureLabelY));
      addConstructionStrip(root,{x:tableau.x,y:tableau.structureY,width:tableau.width,height:PIECE_SIZE.structureHeight},{
        slots:settlement.structures,capacity:settlement.structureCapacity,demolished:settlement.demolishedStructures,time:state?.tSec??0,
        onInspect:piece=>{pinnedInspectionId='structure:'+piece.placementId;render(true);},
        onPiece:(card,piece)=>{card.on('pointerover',event=>{if(event.pointerType!=='touch'){hoveredTableauId='structure:'+piece.placementId;scheduleHoverRender();}});card.on('pointerout',()=>{hoveredTableauId=null;scheduleHoverRender();});tableauRoots.push({card,piece});animateUpgrade(card,piece,readOnly);if(piece.staged)card.on('pointerdown',event=>beginDrag(event,card,piece));},
      });
    } else if (decision?.contextKind === "regionalMap") {
      renderRegionalMap(root, decision.regionalMap, {
        x: sx, y: PANEL.y + 114, width: 830, height: 468,
      });
    } else if (decision?.contextKind === "vassal") {
      renderVassalProjection(root, decision.vassalProjection, {
        x: sx, y: PANEL.y + 114, width: 830, height: 468,
      });
    } else if (decision?.contextKind === "heirloom") {
      root.addChild(createText("CURRENT LOADOUT", {
        ...TEXT_STYLES.header, fontSize: 22,
      }, sx, PANEL.y + CONTENT.labelY));
      const heirlooms = decision.heirlooms ?? { equipped: [null, null, null], carry: [null, null, null] };
      const pickingEquip = acquirePicker?.destination === "equip" && acquirePicker.step !== "discard";
      const pickingCarry = acquirePicker?.destination === "carry"
        || acquirePicker?.step === "discard";
      heirlooms.equipped.forEach((item, index) => {
        const picking = pickingEquip;
        const label = `EQ ${index + 1}  ${item ? `${item.label} · ${item.qualityLabel} · ${item.inheritanceLabel}` : "Empty"}`;
        if (picking) {
          button(root, { x: sx, y: PANEL.y + 114 + index * 56, width: 800, height: 48 },
            label, true, () => {
              const carryFull = (heirlooms.carry ?? []).every(Boolean);
              if (carryFull) {
                acquirePicker = { destination: "equip", replaceEquippedIndex: index, step: "discard" };
                render(true);
                return;
              }
              const result = onConfirmNode?.(node.id, {
                destination: "equip", replaceEquippedIndex: index,
              });
              if (result?.ok !== false) close();
            });
        } else {
          root.addChild(createText(label, {
            ...TEXT_STYLES.body, fontSize: 20, fill: item ? PALETTE.text : PALETTE.textMuted,
          }, sx, PANEL.y + 120 + index * 36));
        }
      });
      heirlooms.carry.forEach((item, index) => {
        const picking = pickingCarry;
        const label = `CARRY ${index + 1}  ${item ? `${item.label} · ${item.qualityLabel}` : "Empty"}`;
        if (picking) {
          button(root, { x: sx, y: PANEL.y + 300 + index * 56, width: 800, height: 48 },
            label, true, () => {
              const acquire = acquirePicker.destination === "carry"
                ? { destination: "carry", replaceCarryIndex: index }
                : {
                  destination: "equip",
                  replaceEquippedIndex: acquirePicker.replaceEquippedIndex,
                  discard: { location: "carry", index },
                };
              const result = onConfirmNode?.(node.id, acquire);
              if (result?.ok !== false) close();
            });
        } else {
          root.addChild(createText(label, {
            ...TEXT_STYLES.body, fontSize: 20, fill: item ? PALETTE.text : PALETTE.textMuted,
          }, sx, PANEL.y + 260 + index * 36));
        }
      });
      if (acquirePicker) {
        root.addChild(createText(acquirePicker.step === "discard"
          ? "Carry is full. Choose a Carry relic to discard."
          : acquirePicker.destination === "carry"
            ? "Carry is full. Choose a Carry relic to replace."
            : "Equipped is full. Choose which relic moves to Carry.", {
          ...TEXT_STYLES.header, fontSize: 20, fill: PALETTE.accent,
          wordWrap: true, wordWrapWidth: 800,
        }, sx, PANEL.y + 480));
      }
    }

    const isCurrent = currentNodeId === node.id;
    const isShop = nodeState?.contentMode === "shop";
    const canConfirm = !readOnly && isCurrent && !nodeState?.resolving
      && (isShop || !!nodeState?.selectedOptionId);
    if (isShop && nodeState && !nodeState.resolving) {
      const rerollEnabled = !readOnly && !nodeState.rerollUsed
        && (nodeState.purchasedOffers ?? []).length === 0
        && getVassalShopRerollCost(vassal) <= vassal.prestige;
      const rerollCost = getVassalShopRerollCost(vassal);
      const reroll = button(root, { x: PANEL.x + 54, y: PANEL.y + PANEL.height - 72, width: 290, height: 50 },
        nodeState.rerollUsed ? "REROLL USED" : vassal.classId === "scholar" ? "RECONSIDER" : "REROLL", rerollEnabled,
        () => onRerollShop?.(node.id));
      if (!nodeState.rerollUsed) addResourceAmount(reroll, 'prestige', rerollCost, { x: 191, y: 7, fontSize: 27, iconSize: 36 });
      explainReadOnly(reroll, readOnly);
    }
    renderTitlePlaque(root, family);
    const confirmRect = confirmDockRect(app);
    if (nodeState) {
      renderMortalityEstimate(root, decision?.mortalityEstimate, {
        x: confirmRect.x - MORTALITY_PLATE.gap - MORTALITY_PLATE.width,
        y: confirmRect.y + (confirmRect.height - MORTALITY_PLATE.height) / 2,
        width: MORTALITY_PLATE.width, height: MORTALITY_PLATE.height,
      }, canConfirm);
    }
    if (!readOnly && node.family === "relic" && nodeState && !nodeState.resolving) {
      const selected = nodeState.options?.find((option) => option.id === nodeState.selectedOptionId);
      const heirlooms = decision?.heirlooms ?? { equipped: [], carry: [] };
      const canAcquire = canConfirm && !!selected && !selected.emptyRelic;
      const confirmRelic = (acquire) => {
        const result = onConfirmNode?.(node.id, acquire);
        if (result?.ok !== false) close();
      };
      button(root, {
        x: confirmRect.x, y: confirmRect.y - 8, width: confirmRect.width, height: 48,
      }, selected?.emptyRelic ? "CONTINUE" : "EQUIP", canAcquire || !!selected?.emptyRelic, () => {
        if (selected?.emptyRelic) {
          confirmRelic({ destination: "decline" });
          return;
        }
        if ((heirlooms.equipped ?? []).some((item) => !item)) {
          confirmRelic({ destination: "equip" });
          return;
        }
        acquirePicker = { destination: "equip" };
        render(true);
      });
      button(root, {
        x: confirmRect.x, y: confirmRect.y + 48, width: confirmRect.width, height: 48,
      }, "CARRY", canAcquire, () => {
        if ((heirlooms.carry ?? []).some((item) => !item)) {
          confirmRelic({ destination: "carry" });
          return;
        }
        acquirePicker = { destination: "carry" };
        render(true);
      });
      confirmRoot = button(root, {
        x: confirmRect.x, y: confirmRect.y + 104, width: confirmRect.width, height: 48,
      }, "DECLINE", canConfirm, () => confirmRelic({ destination: "decline" }));
    } else if (!readOnly) {
      confirmRoot = confirmDockButton(root, app, {
        enabled: canConfirm,
        label: "Confirm",
        showCheck: true,
        onClick: () => {
          const result = onConfirmNode?.(node.id);
          if (result?.ok !== false) close();
        },
      });
    }
    const retainedInspectionId=pinnedInspectionId??quickInspectionId;
    const inspectedOffer=[...(decision?.offers??[]),...(decision?.purchases??[])].find(offer=>offer.offerId===(retainedInspectionId??previewOfferId));
    const inspectedOption=(nodeState?.options??[]).find(option=>option.id===retainedInspectionId);
    const inspectedTableau=[...(settlement?.practices??[]),...(settlement?.structures??[]),...(settlement?.demolishedStructures??[])].find(piece=>piece&&(
      'practice:'+piece.practiceId===(retainedInspectionId??previewTableauId)||'structure:'+piece.placementId===(retainedInspectionId??previewTableauId)));
    const displaced=(settlement?.displacedPractices??[]).find(face=>'displaced:'+face.definitionId===retainedInspectionId);
    if(inspectedOffer||inspectedTableau||displaced||(inspectedOption&&!simpleOutcomes)) {
      const piece=inspectedOffer??inspectedOption??inspectedTableau;
      const face=piece?.presentation??displaced;
      const requirements=decision?.optionRequirements?.[piece?.id]??[];
      if(face?.reading&&!pinnedInspectionId) {
        if(quickInspectionId) {
          const outside=new PIXI.Graphics().beginFill(0x000000,0).drawRect(0,0,2424,1080).endFill();
          // A fully transparent Graphics fill is excluded from Pixi hit testing.
          outside.hitArea=new PIXI.Rectangle(0,0,2424,1080);
          outside.eventMode='static';outside.on('pointerdown',event=>{pointerHeld=true;event.stopPropagation();});
          outside.on('pointertap',event=>{event.stopPropagation();closeInspection();});root.addChild(outside);
        }
        inspectionRoot=addPracticeReading(root,quickInspectionId?900:850,face,{fontSize:quickInspectionId?44:34,
          onInspect:quickInspectionId?()=>{pinnedInspectionId=quickInspectionId;quickInspectionId=null;render(true);}:undefined});
        inspectionRoot.position.set(inspectedTableau?PANEL.x+36:PANEL.x+1170,
          Math.max(40,Math.min(PANEL.y+108,1040-inspectionRoot.readingHeight)));
        inspectionRoot.eventMode=quickInspectionId?'static':'none';inspectionRoot.interactiveChildren=!!quickInspectionId;
        if(quickInspectionId) {
          inspectionRoot.hitArea=new PIXI.Rectangle(0,0,900,inspectionRoot.readingHeight);
          inspectionRoot.on('pointerdowncapture',()=>{pointerHeld=true;});
          inspectionRoot.on('pointerdown',event=>event.stopPropagation());
          inspectionRoot.on('pointertap',event=>event.stopPropagation());
        }
      } else {
        const practiceInspect=!!face?.reading;
        if(practiceInspect) {
          setInspectionAboveChrome(true);
          const dim=new PIXI.Graphics().beginFill(0x050908,.82).drawRect(0,0,2424,1080).endFill();
          dim.eventMode='static';dim.on('pointertap',event=>{event.stopPropagation();if(!inspectionRoot?.dismissReference?.())closeInspection();});root.addChild(dim);
        }
      inspectionRoot=addChronicleInspection(root,practiceInspect?{x:112,y:90,width:2200,height:880}:{x:inspectedTableau||displaced?PANEL.x+36:PANEL.x+1170,y:PANEL.y+108,width:inspectedTableau||displaced?1092:970,height:572},{
        title:face?.label??piece?.label,face,artId:face?.definitionId??node.family,
        onReview,
        cost:inspectedOffer?{prestigeCost:piece.prestigeCost,currencyCost:piece.currencyCost,phaseCost:piece.phaseCost,state,staged:piece.purchased,disabled:piece.purchased||readOnly||!piece.canStage}:inspectedOption?{
          prestigeCost:getAdjustedVassalPrestigeCost(vassal,piece.prestigeCost??0),
          phaseCost:getVassalActionPhaseCost(vassal,piece.phaseCost??0,{nodeState,isTravel:nodeState.family==='travel'}),state,
          riskLabel:nodeState.family==='relic'?relicRiskLabel(piece):null,
        }:null,
        onActivate:!readOnly && inspectedOffer && !piece.purchased && piece.canStage
          ? ()=>{pinnedInspectionId=null;previewOfferId=null;const result=onPurchaseOffer?.(node.id,piece.offerId);if(result?.ok!==true)render(true);}
          : !readOnly && inspectedOption && requirements.every(entry=>entry.met)
            ? ()=>{pinnedInspectionId=null;const result=onSelectOption?.(node.id,piece.id);if(result?.ok!==true)render(true);} : undefined,
        metadata:[face?.qualityLabel,...(face?.tags??[])].filter(Boolean).join(' · '),
        detail:[face?[face.rule,...(face.details??face.detailLines??[])].join('\n'):optionEffect(piece),
          inspectedOffer && !piece.purchased ? piece.stageBlockedReason : null,
          displaced?'This practice leaves because the incoming prefix fills all five slots.':null,
          ...requirements.map(entry=>(entry.met?'✓ ':'✗ ')+entry.label)].filter(Boolean).join('\n'),
        onClose:closeInspection,
        referenceState:retainedReferenceId===retainedInspectionId?retainedReference:null,
      });
      inspectionRoot.inspectedPieceId=retainedInspectionId;
      if(!pinnedInspectionId){inspectionRoot.eventMode="none";inspectionRoot.interactiveChildren=false;}
      }
    }

  }

  return {
    async prepareChoices(nodes, baseState) {
      clearPreparedLayouts();
      for (const [nodeId, item] of Object.entries(nodes ?? {})) {
        // Yield between nodes; text/graphics and GPU upload happen while the
        // processing state is visible, rather than on the next player's tap.
        await new Promise(resolve => setTimeout(resolve, 0));
        while (pointerHeld || dragged) await new Promise(resolve => setTimeout(resolve, 16));
        const savedNodeId = openNodeId;
        const savedPreview = {previewOptionId, previewOfferId, previewTableauId, pinnedInspectionId, quickInspectionId, dragTargetIndex, acquirePicker};
        const activeLayout = takeLayout();
        openNodeId = nodeId;
        previewOptionId = previewOfferId = previewTableauId = pinnedInspectionId = quickInspectionId = dragTargetIndex = acquirePicker = null;
        const states = item.entryPresentation ? [
          {state:baseState, decision:item.entryPresentation},
          {state:deserializeGameState(item.stateData), decision:item.presentation},
        ] : [{state:deserializeGameState(item.stateData), decision:item.presentation}];
        if (item.reroll) states.push({state:deserializeGameState(item.reroll.stateData),decision:item.reroll.presentation});
        const created = [];
        try {
          for (const {state,decision} of states) {
            const vassal = state.civilization?.vassalLineage?.vassalsById?.[state.civilization?.vassalLineage?.currentVassalId];
            render(true, {state,decision,vassal,readOnly:false,viewedSec:state.tSec,frontierSec:state.tSec,profileSec:state.tSec});
            const layout = takeLayout();
            preparedLayouts.set(layout.signature, layout);
            created.push(layout.content);
          }
        } finally {
          clearChildren(root);
          openNodeId = savedNodeId;
          ({previewOptionId, previewOfferId, previewTableauId, pinnedInspectionId, quickInspectionId, dragTargetIndex, acquirePicker} = savedPreview);
          restoreLayout(activeLayout);
        }
        for (const content of created) app.renderer?.prepare?.add(content);
      }
      await app.renderer?.prepare?.upload();
    },
    init: () => {}, update: () => { advanceMotion(); render(); },
    refresh: () => render(true), resize: () => render(true),
    open, close, isOpen: () => logicalOpen, getOpenNodeId: () => openNodeId,
    getEnterNodeClickPoint: () => logicalOpen && enterRoot?.toGlobal
      ? enterRoot.toGlobal(new PIXI.Point(enterRoot.hitArea.width / 2, enterRoot.hitArea.height / 2)) : null,
    getOptionClickPoint(index = 0) {
      if (!logicalOpen) return null;
      const target = optionRoots[index];
      const point = target?.toGlobal?.(new PIXI.Point(target.hitArea.width / 2, target.hitArea.height - COST_FOOTER_HEIGHT / 2 - 6));
      return point ? { x: point.x, y: point.y } : null;
    },
    getOfferClickPoint(index = 0) {
      if (!logicalOpen) return null;
      const target = offerRoots[index];
      const point = target?.toGlobal?.(new PIXI.Point(target.hitArea.width / 2, target.hitArea.height - COST_FOOTER_HEIGHT / 2 - 6));
      return point ? { x: point.x, y: point.y } : null;
    },
    getConfirmClickPoint: () => {
      if (!logicalOpen || !confirmRoot) return null;
      const rect = confirmRoot.getBounds();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    },
    getUndoClickPoint(index = 0) {
      if (!logicalOpen) return null;
      const target = undoRoots[index];
      const point = target?.toGlobal?.(new PIXI.Point(target.hitArea.width / 2, target.hitArea.height - 24));
      return point ? { x: point.x, y: point.y } : null;
    },
    getTableauClickPoint(index=0) { const card=tableauRoots[index]?.card; return card?card.toGlobal(new PIXI.Point(card.hitArea.width/2,card.hitArea.height/2)):null; },
    getOfferFacePoint(index=0) { const card=shopCardRoots[index]?.faceRoot; return card?card.toGlobal(new PIXI.Point(card.hitArea.width/2,card.hitArea.height/2)):null; },
    handleInspectionKey(event) { return inspectionRoot?.handleReferenceKey?.(event)??false; },
    getInspectionClosePoint() { const c=inspectionRoot?.closeControl;return c?c.toGlobal(new PIXI.Point(25,25)):null; },
    getInspectionCostPoint() { const c=inspectionRoot?.costPanel;return c?c.toGlobal(new PIXI.Point(c.hitArea.width/2,c.hitArea.height/2)):null; },
    getConstructionPoint(origin=0) { return {x:tableau.x+(origin+.5)*construction().cell,y:tableau.structureY+64}; },
    getSemanticSnapshot: () => {
      const decision = getDecisionPresentation?.(openNodeId, {
        previewOptionId, previewOfferId,
      });
      return {
        open: logicalOpen, nodeId: openNodeId,
        layoutBuilds, preparedLayoutHits, preparedLayoutCount:preparedLayouts.size,
        tapFeedback: getTapFeedbackSnapshot(),
        interactionPending: root.pendingInteractionCount > 0,
        animation: {
          phase: motion ? logicalOpen ? "opening" : "closing" : logicalOpen ? "open" : "closed",
          origin: motionOrigin,
          rect: motionRect,
        },
        inspectedCardId: pinnedInspectionId,
        inspectionKeywords: inspectionRoot?.getKeywordDebugState?.()??null,
        inspectionDevPoint: inspectionRoot?.devControl?.toGlobal?.(new PIXI.Point(60,27))??null,
        inspectionAboveChrome: inspectionLayerIndex!==null,
        quickCardId: quickInspectionId,
        inspectionTitlePoint: inspectionRoot?.titleControl?.toGlobal?.(new PIXI.Point(450,inspectionRoot.titleControl.hitArea.height/2))??null,
        inspectionRect: inspectionRoot?.getBounds?.()??null,
        tableauRect: {x:tableau.x,y:tableau.practiceY,width:tableau.width,height:tableau.structureY+construction().height-tableau.practiceY},
        family: decision?.node?.family ?? null,
        selectedOptionId: decision?.nodeState?.selectedOptionId ?? null,
        resolving: decision?.nodeState?.resolving === true,
        currentPrestige: decision?.currentPrestige ?? null,
        projectedPrestige: decision?.projectedPrestige ?? null,
        mortalityEstimate: decision?.mortalityEstimate ?? null,
        offers: (decision?.offers ?? []).map((offer) => ({ offerId: offer.offerId, label: offer.label, kind: offer.intervention?.kind, mode: offer.intervention?.mode, footprint: offer.presentation?.footprint, validOrigins: offer.validOrigins, canStage: offer.canStage, rule: offer.presentation?.rule ?? offerEffect(offer) })),
        purchaseOrder: (decision?.purchases ?? []).map((purchase) => purchase.offerId),
        costPanels: [...shopCardRoots, ...optionRoots].map(card => ({ ...card.costPanel.costSummary, interactionState: card.costPanel.interactionState,
          cardInteractionState: card.interactionState, cardRect: card.getBounds(),
          rect: card.costPanel.getBounds(),
        })),
        practices: decision?.settlement?.practices ?? [],
        structures: decision?.settlement?.structures ?? [],
        demolishedStructures: decision?.settlement?.demolishedStructures ?? [],
        contextKind: decision?.contextKind ?? null,
        regionalMap: decision?.regionalMap ?? null,
        vassalProjection: decision?.vassalProjection ?? null,
      };
    },
    getHudDeltas() {
      if (!logicalOpen) return null;
      const decision = getDecisionPresentation?.(openNodeId, {
        previewOptionId, previewOfferId,
      });
      if (!decision) return null;
      const projection = decision.vassalProjection;
      const stats = {};
      if (projection?.baseline?.stats && projection?.immediate?.stats) {
        projection.baseline.stats.forEach((before, index) => {
          const after = projection.immediate.stats[index];
          const delta = (after?.value ?? 0) - (before?.value ?? 0);
          if (delta) stats[before.statId] = delta;
        });
      }
      const prestige = Number.isFinite(decision.projectedPrestige)
        && Number.isFinite(decision.currentPrestige)
        ? decision.projectedPrestige - decision.currentPrestige
        : 0;
      if (!prestige && !Object.keys(stats).length) return null;
      return { prestige, stats };
    },
  };
}
