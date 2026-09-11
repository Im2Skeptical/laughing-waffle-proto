import { addSettlementPiece, addConstructionStrip, animatePieceUpgrade, PIECE_SIZE } from "./settlement-piece-pixi.js";
import { addIllustration, addRegionTerrain, getArtRevision } from './chronicle-art.js';
import { addChronicleInspection } from './chronicle-inspection.js';
import { addCostPanel, addResourceAmount } from './resource-cost-pixi.js';
import { VASSAL_NODE_FAMILIES, VASSAL_SIGNATURE_NODE_VARIANTS } from "../defs/gamepieces/vassal-life-map-defs.js";
import { getVassalLifeMapNode } from "../model/vassal-life-map.js";
import {
  getAdjustedVassalPhaseCost,
  getAdjustedVassalPrestigeCost,
} from "../model/vassal-life-map.js";
import { clearChildren, createText, roundedRect } from "./settlement-view-primitives.js";
import { PALETTE, TEXT_STYLES } from "./settlement-theme.js";

const PANEL = Object.freeze({ x: 128, y: 62, width: 2180, height: 780 });
const QUALITY_COLORS = Object.freeze({
  bronze: 0xb07a4b, silver: 0xbfc7d5, gold: 0xe2bd55, diamond: 0x83dbea,
});

function button(parent, rect, label, enabled, onClick, selected = false) {
  const root = new PIXI.Container();
  root.position.set(rect.x, rect.y);
  root.eventMode = enabled ? "static" : "none";
  root.cursor = enabled ? "pointer" : "default";
  root.hitArea = new PIXI.Rectangle(0, 0, rect.width, rect.height);
  root.on("pointertap", (event) => {
    event?.stopPropagation?.();
    if (enabled) onClick?.();
  });
  const gfx = new PIXI.Graphics();
  roundedRect(gfx, 0, 0, rect.width, rect.height, 8,
    enabled ? (selected ? 0x536d48 : 0x3d4c3a) : 0x464743,
    enabled ? (selected ? PALETTE.green : PALETTE.accent) : PALETTE.stroke,
    selected ? 3 : 1);
  root.addChild(gfx, createText(label, {
    ...TEXT_STYLES.title, fontSize: 22, fill: enabled ? PALETTE.text : PALETTE.textMuted,
    wordWrap: true, wordWrapWidth: rect.width - 18, align: "center",
  }, rect.width / 2, rect.height / 2, 0.5, 0.5));
  parent.addChild(root);
  return root;
}

function optionEffect(option) {
  const parts = [];
  if (Number.isFinite(option?.prestigeDelta)) parts.push(`${option.prestigeDelta >= 0 ? "+" : ""}${option.prestigeDelta} Prestige`);
  if (option?.statId && Number.isFinite(option?.statDelta)) parts.push(`${option.statDelta >= 0 ? "+" : ""}${option.statDelta} ${option.statId}`);
  if (option?.lossStatId && Number.isFinite(option?.lossStatDelta)) parts.push(`${option.lossStatDelta} ${option.lossStatId}`);
  if (option?.settlementRegionId) parts.push("Move 10 Villager adults and found this settlement");
  if (option?.intervention?.kind === "connection") parts.push("Create this route");
  if (option?.locationRegionId) parts.push("Move to this settlement");
  if (option?.forcedRelocation) parts.push("Relocate to a safe settlement");
  if (Number.isFinite(option?.legacyStartingPrestigeBonus)) parts.push(`Future Vassals +${option.legacyStartingPrestigeBonus} starting Prestige`);
  if (Number.isFinite(option?.immediateDeathChance)) parts.push(`${Math.round(option.immediateDeathChance * 100)}% immediate death risk`);
  for (const effect of option?.effects ?? []) {
    if (effect.op === "AdjustSettlementChaosGodState" && effect.key === "monsterCount") {
      parts.push(`Kill up to ${Math.abs(Math.floor(effect.amount ?? 0))} monsters`);
    }
  }
  return parts.join(" · ") || "Apply this choice when the node is confirmed.";
}

function offerEffect(offer) {
  const presentation = offer?.presentation;
  if (presentation) return [presentation.rule, ...(presentation.details ?? [])].filter(Boolean).join("\n");
  const intervention = offer?.intervention;
  if (intervention?.kind === "connection") {
    return `${intervention.mode === "add" ? "Create" : "Remove"} this commercial route.`;
  }
  return "Apply this intervention when the node is confirmed.";
}

function renderMortalityEstimate(parent, estimate, rect, enabled) {
  if (!estimate) return;
  const totalPercent = Math.round(estimate.totalDeathChance * 1000) / 10;
  const naturalPercent = Math.round(estimate.naturalDeathChance * 1000) / 10;
  const immediatePercent = Math.round(estimate.immediateDeathChance * 1000) / 10;
  const riskColor = estimate.totalDeathChance >= 0.25 ? 0xd58c7c
    : estimate.totalDeathChance > 0 ? PALETTE.accent : PALETTE.green;
  const gfx = new PIXI.Graphics();
  roundedRect(gfx, rect.x, rect.y, rect.width, rect.height, 10,
    enabled ? 0x353a35 : 0x30332f, riskColor, 2);
  parent.addChild(gfx,
    createText("MORTALITY ESTIMATE", {
      ...TEXT_STYLES.chip, fontSize: 12, fill: riskColor,
    }, rect.x + 14, rect.y + 10),
    createText(`${totalPercent}% chance of death`, {
      ...TEXT_STYLES.header, fontSize: 19, fill: enabled ? riskColor : PALETTE.textMuted,
    }, rect.x + 14, rect.y + 29),
    createText(`Time ${estimate.timeLabel}  ·  Age ${estimate.currentAge} → ${estimate.projectedAge}`, {
      ...TEXT_STYLES.body, fontSize: 13, fill: PALETTE.textMuted,
      wordWrap: true, wordWrapWidth: rect.width - 28,
    }, rect.x + 14, rect.y + 54)
  );
  const factors = [];
  if (immediatePercent) factors.push(`Selection ${immediatePercent}% now`);
  if (naturalPercent) factors.push(`Age after time ${naturalPercent}%`);
  parent.addChild(createText(factors.length
    ? factors.join("  ·  ")
    : "No immediate or age-based risk at this resolution.", {
    ...TEXT_STYLES.body, fontSize: 12, fill: PALETTE.textMuted,
    wordWrap: true, wordWrapWidth: rect.width - 28,
  }, rect.x + 14, rect.y + 74));
}

const COST_FOOTER_HEIGHT = 148;

function actionCard(parent, rect, spec) {
  const root = new PIXI.Container();
  root.position.set(rect.x, rect.y);
  root.eventMode = 'static'; root.cursor = 'pointer';
  root.hitArea = new PIXI.Rectangle(0, 0, rect.width, rect.height);
  root.on('pointertap', event => { event.stopPropagation(); spec.onInspect?.(); });
  // A touch press must keep its target until release; hover previews can redraw
  // the cards, so they belong only to a mouse/pen with hover.
  root.on('pointerover', event => { if (event.pointerType !== 'touch') spec.onHover?.(); });
  root.on('pointerout', event => { if (event.pointerType !== 'touch') spec.onOut?.(); });
  const artHeight = rect.height - COST_FOOTER_HEIGHT - 12;
  const g = new PIXI.Graphics();
  roundedRect(g, 0, 0, rect.width, rect.height, 8, PALETTE.card,
    spec.selected ? PALETTE.green : QUALITY_COLORS[spec.presentation?.tier] ?? PALETTE.stroke, 2);
  root.addChild(g);
  addIllustration(root, spec.artId, { x: 6, y: 6, width: rect.width - 12, height: artHeight }, { alpha: spec.enabled ? 1 : .8 });
  const plate = new PIXI.Graphics().beginFill(0x101918, .92).drawRect(7, 7, rect.width - 14, 83).endFill();
  root.addChild(plate, createText(spec.presentation?.label ?? spec.title, {
    ...TEXT_STYLES.cardTitle, fontSize: 36, wordWrap: true, wordWrapWidth: rect.width - 36, lineHeight: 36,
  }, 18, 15), createText('ⓘ  Inspect', {
    ...TEXT_STYLES.body, fontSize: 24, fill: PALETTE.text, stroke: 0x111714, strokeThickness: 4,
  }, 18, artHeight - 33));
  root.costPanel = addCostPanel(root, {
    x: 6, y: rect.height - COST_FOOTER_HEIGHT - 6, width: rect.width - 12, height: COST_FOOTER_HEIGHT,
  }, {
    ...spec.cost, selected: spec.selected, staged: spec.staged, disabled: !spec.enabled, unaffordable: spec.costUnmet,
    label: spec.actionLabel + ' ' + spec.title, onActivate: spec.onClick, onUnavailable: spec.onUnavailable,
  });
  parent.addChild(root);
  return root;
}

// Simple personal choices expose every tradeoff without an inspection overlay.
function outcomeCard(parent, rect, spec) {
  const root = new PIXI.Container();
  root.position.set(rect.x, rect.y);
  root.eventMode = spec.enabled || spec.onUnavailable ? 'static' : 'none';
  root.cursor = spec.enabled ? 'pointer' : 'default';
  root.hitArea = new PIXI.Rectangle(0, 0, rect.width, rect.height);
  root.on('pointertap', event => {
    event?.stopPropagation?.();
    if (spec.enabled) spec.onClick?.();
    else spec.onUnavailable?.();
  });
  const gfx = new PIXI.Graphics();
  roundedRect(gfx, 0, 0, rect.width, rect.height, 8, PALETTE.card,
    spec.selected ? PALETTE.green : PALETTE.stroke, spec.selected ? 3 : 1);
  root.addChild(gfx);
  const title = createText(spec.title, {
    ...TEXT_STYLES.cardTitle, fontSize: 30, lineHeight: 34,
    wordWrap: true, wordWrapWidth: rect.width - 40,
  }, 20, 20);
  root.addChild(title);
  let y = Math.max(110, title.y + title.height + 24);
  for (const effect of spec.effect.split(' · ')) {
    const label = effect.replace(/\b(cunning|wisdom|effectiveness|intelligence)\b/g,
      stat => stat[0].toUpperCase() + stat.slice(1));
    const text = createText(label, {
      ...TEXT_STYLES.title, fontSize: 28, lineHeight: 32,
      fill: effect.startsWith('-') ? PALETTE.red : PALETTE.green,
      wordWrap: true, wordWrapWidth: rect.width - 40,
    }, 20, y);
    root.addChild(text);
    y += text.height + 18;
  }
  root.costPanel = addCostPanel(root, {
    x: 6, y: rect.height - COST_FOOTER_HEIGHT - 6, width: rect.width - 12, height: COST_FOOTER_HEIGHT,
  }, {
    ...spec.cost, selected: spec.selected, disabled: !spec.enabled, unaffordable: spec.costUnmet,
    label: 'Choose ' + spec.title, onActivate: spec.onClick, onUnavailable: spec.onUnavailable,
  });
  parent.addChild(root);
  return root;
}

const REGION_COLORS = Object.freeze({
  red: 0xa85d52, blue: 0x587f9e, green: 0x668d63, yellow: 0xb19a57,
  purple: 0x80668f, orange: 0xb77d4f, black: 0x555750, white: 0xb7b5a8,
});

function drawDashedLine(gfx, from, to, length = 12, gap = 7) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (!distance) return;
  for (let cursor = 0; cursor < distance; cursor += length + gap) {
    const end = Math.min(distance, cursor + length);
    gfx.moveTo(from.x + dx * cursor / distance, from.y + dy * cursor / distance);
    gfx.lineTo(from.x + dx * end / distance, from.y + dy * end / distance);
  }
}

function renderRegionalMap(parent, map, rect) {
  parent.addChild(createText("REGIONAL PREVIEW", {
    ...TEXT_STYLES.header, fontSize: 22,
  }, rect.x, rect.y));
  if (!map?.regions?.length) {
    parent.addChild(createText("No regional preview is available.", {
      ...TEXT_STYLES.body, fontSize: 17, fill: PALETTE.textMuted,
    }, rect.x, rect.y + 42));
    return;
  }
  const points = map.regions.flatMap((region) => region.polygon ?? []);
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const mapRect = { x: rect.x, y: rect.y + 42, width: rect.width, height: rect.height - 112 };
  const scale = Math.min(
    (mapRect.width - 40) / Math.max(1, maxX - minX),
    (mapRect.height - 40) / Math.max(1, maxY - minY)
  );
  const offsetX = mapRect.x + (mapRect.width - (maxX - minX) * scale) / 2 - minX * scale;
  const offsetY = mapRect.y + (mapRect.height - (maxY - minY) * scale) / 2 - minY * scale;
  const project = (point) => ({ x: offsetX + point.x * scale, y: offsetY + point.y * scale });
  const byId = new Map(map.regions.map((region) => [region.regionId, region]));
  const gfx = new PIXI.Graphics();
  for (const region of map.regions) {
    const polygon = (region.polygon ?? []).flatMap((point) => {
      const projected = project(point);
      return [projected.x, projected.y];
    });
    if (polygon.length < 6) continue;
    addRegionTerrain(parent,polygon,region.colour,region.controller==='player'?.9:.6);
    gfx.lineStyle(region.current ? 4 : region.selected ? 3 : 1,
      region.current ? PALETTE.accent : region.selected ? PALETTE.green : PALETTE.stroke, 1);
    gfx.beginFill(REGION_COLORS[region.colour] ?? REGION_COLORS.black,
      region.controller === "player" ? 0.08 : 0.12);
    gfx.drawPolygon(polygon).endFill();
  }
  for (const connection of map.connections ?? []) {
    const left = byId.get(connection.regionAId);
    const right = byId.get(connection.regionBId);
    if (!left || !right) continue;
    const from = project(left.labelPoint);
    const to = project(right.labelPoint);
    const preview = connection.status.startsWith("preview-");
    const removal = connection.status.endsWith("remove");
    const staged = connection.status.startsWith("staged-");
    const color = connection.onSelectedPath ? PALETTE.accent
      : removal ? 0xd17c70 : (preview || staged) ? PALETTE.green : 0xc3c2b2;
    gfx.lineStyle(connection.onSelectedPath ? 6 : preview ? 5 : staged ? 4 : 2, color,
      removal ? 0.72 : 0.92);
    if (preview || staged) drawDashedLine(gfx, from, to);
    else gfx.moveTo(from.x, from.y).lineTo(to.x, to.y);
  }
  parent.addChild(gfx);
  for (const region of map.regions) {
    const point = project(region.labelPoint);
    parent.addChild(createText(region.reference ?? region.name ?? region.regionId, {
      ...TEXT_STYLES.chip, fontSize: region.current ? 15 : 12,
      fill: region.current ? PALETTE.accent : PALETTE.text,
      stroke: 0x242824, strokeThickness: 4,
    }, point.x, point.y, 0.5, 0.5));
  }
  const route = map.selectedPath?.length > 1
    ? `${map.selectedPath.map((id) => byId.get(id)?.reference ?? id).join(" → ")} · ${map.distance} edges`
    : "Hover or select an offer to preview its effect.";
  parent.addChild(createText(route, {
    ...TEXT_STYLES.body, fontSize: 15, fill: PALETTE.textMuted,
    wordWrap: true, wordWrapWidth: rect.width,
  }, rect.x, rect.y + rect.height - 56));
}

function renderVassalProjection(parent, projection, rect) {
  parent.addChild(createText("VASSAL IMPACT", {
    ...TEXT_STYLES.header, fontSize: 22,
  }, rect.x, rect.y));
  if (!projection) return;
  parent.addChild(createText("CURRENT", {
    ...TEXT_STYLES.chip, fontSize: 13, fill: PALETTE.textMuted,
  }, rect.x, rect.y + 42));
  parent.addChild(createText("AFTER CHOICE", {
    ...TEXT_STYLES.chip, fontSize: 13, fill: PALETTE.accent,
  }, rect.x + 430, rect.y + 42));
  projection.baseline.stats.forEach((before, index) => {
    const after = projection.immediate.stats[index];
    const changed = before.value !== after.value;
    const y = rect.y + 76 + index * 82;
    parent.addChild(
      createText(`${before.label}  ${before.value}`, {
        ...TEXT_STYLES.title, fontSize: 18,
      }, rect.x, y),
      createText(before.powerLabel, {
        ...TEXT_STYLES.body, fontSize: 13, fill: PALETTE.textMuted,
        wordWrap: true, wordWrapWidth: 390,
      }, rect.x, y + 27),
      createText(`${after.label}  ${before.value}${changed ? ` → ${after.value}` : ""}`, {
        ...TEXT_STYLES.title, fontSize: 18, fill: changed ? PALETTE.accent : PALETTE.text,
      }, rect.x + 430, y),
      createText(after.powerLabel, {
        ...TEXT_STYLES.body, fontSize: 13, fill: changed ? PALETTE.accent : PALETTE.textMuted,
        wordWrap: true, wordWrapWidth: 390,
      }, rect.x + 430, y + 27)
    );
  });
  const resourceY = rect.y + 420;
  parent.addChild(
    createText(`Prestige  ${projection.baseline.prestige} → ${projection.immediate.prestige}`, {
      ...TEXT_STYLES.title, fontSize: 18,
      fill: projection.baseline.prestige !== projection.immediate.prestige ? PALETTE.accent : PALETTE.text,
    }, rect.x, resourceY),
    createText(`EXP  ${projection.baseline.developmentProgress} / 10`, {
      ...TEXT_STYLES.title, fontSize: 18,
    }, rect.x, resourceY + 34),
    createText("IF THIS VASSAL SURVIVES COMPLETION", {
      ...TEXT_STYLES.chip, fontSize: 13, fill: PALETTE.green,
    }, rect.x, resourceY + 86),
    createText(`+${projection.ifSurvives.prestigeIncome} Prestige  ·  +${projection.ifSurvives.developmentIncome} EXP  ·  ends at ${projection.ifSurvives.developmentProgress}/10${projection.ifSurvives.earnedLevelCount ? `  ·  ${projection.ifSurvives.earnedLevelCount} level up` : ""}`, {
      ...TEXT_STYLES.body, fontSize: 16, fill: PALETTE.text,
      wordWrap: true, wordWrapWidth: rect.width,
    }, rect.x, resourceY + 116)
  );
}

export function createVassalNodeDecisionModalView({
  app, layer, getState, getPresentation, getDecisionPresentation, onEnterNode, onSelectOption,
  onPurchaseOffer, onUndoPurchase, onReorderPurchase, onMoveStructure, onRerollShop, onConfirmNode,
  onWorldMap, onReadOnlyAction,
} = {}) {
  const root = new PIXI.Container();
  root.visible = false;
  root.zIndex = 170;
  root.eventMode = "static";
  layer?.addChild(root);
  let openNodeId = null;
  let signature = "";
  let dragged = null;
  let dragGhost = null;
  let tableauRoots = [];
  let inspectionRoot = null;
  let lastDecision = null;
  const tableau = { x: PANEL.x+1200, practiceY: PANEL.y+210, structureY: PANEL.y+474, width: 928 };
  let dragTargetIndex = null;
  let enterRoot = null;
  let optionRoots = [];
  let offerRoots = [];
  let shopCardRoots = [];
  let confirmRoot = null;
  let undoRoots = [];
  let hoveredOptionId = null;
  let hoveredOfferId = null;
  let previewOptionId = null;
  let previewOfferId = null;
  let pinnedInspectionId = null;
  let hoverRenderTimer = null;

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

  function close() {
    pointerHeld = false;
    root.visible = false;
    signature = "";
    dragged = null;
    dragTargetIndex = null;
    hoveredOptionId = null;
    hoveredOfferId = null;
    previewOptionId = null;
    previewOfferId = null;
    if (hoverRenderTimer != null) clearTimeout(hoverRenderTimer);
    hoverRenderTimer = null;
  }

  function open(nodeId = null) {
    pinnedInspectionId = null;
    openNodeId = nodeId ?? getPresentation?.()?.vassal?.lifeMap?.currentNodeId ?? null;
    root.visible = true;
    hoveredOptionId = null;
    hoveredOfferId = null;
    previewOptionId = null;
    previewOfferId = null;
    render(true);
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
      const origin=Math.floor((local.x-tableau.x)/(tableau.width/(lastDecision?.settlement?.structureCapacity??8)));
      if(drag.fromOffer)onPurchaseOffer?.(openNodeId,offerId,origin);
      else onMoveStructure?.(openNodeId,offerId,origin);
    } else if(kind==='practice' && local.y>=tableau.practiceY-25 && local.y<tableau.practiceY+PIECE_SIZE.practiceHeight+25) {
      const count=(lastDecision?.settlement?.practices??[]).filter(p=>p?.staged).length;
      const toIndex=Math.max(0,Math.min(drag.fromOffer?count:count-1,Math.floor((local.x-tableau.x)/(PIECE_SIZE.practiceWidth+PIECE_SIZE.gap))));
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
      const face=dragged.piece.presentation;
      dragGhost=addSettlementPiece(root,{x:local.x-48,y:local.y-64,width:face?.kind==='structure'?108*(face.footprint??1):PIECE_SIZE.practiceWidth,height:face?.kind==='structure'?PIECE_SIZE.structureHeight:PIECE_SIZE.practiceHeight},{face,state:'staged'});
      dragGhost.eventMode='none';dragGhost.alpha=.65;
    }
    if(dragGhost)dragGhost.position.set(local.x-48,local.y-64);
    if (dragged.active && dragged.piece.presentation?.kind === 'structure') {
      placementGuide?.destroy(); placementGuide = new PIXI.Graphics();
      const offer = [...(lastDecision?.offers ?? []), ...(lastDecision?.purchases ?? [])].find(p => p.offerId === dragged.piece.offerId);
      const origins = offer?.validOrigins ?? [], width = dragged.piece.presentation.footprint ?? 1;
      const origin = Math.floor((local.x - tableau.x) / PIECE_SIZE.cellWidth);
      for (const cell of origins) placementGuide.beginFill(0xaedbc9,.8).drawCircle(tableau.x + cell * PIECE_SIZE.cellWidth + 8, tableau.structureY - 9, 4).endFill();
      if (local.x >= tableau.x && origin >= 0 && origin < (lastDecision?.settlement?.structureCapacity ?? 0)) {
        placementGuide.lineStyle(4,origins.includes(origin)?0xaedbc9:0xd97d68).drawRect(tableau.x + origin * PIECE_SIZE.cellWidth,tableau.structureY,width * PIECE_SIZE.cellWidth,PIECE_SIZE.structureHeight);
      }
      placementGuide.eventMode = 'none'; root.addChild(placementGuide);
    }
  });
  root.on('pointerup',finishDrag);
  root.on('pointerupoutside',finishDrag);
  root.on('pointercancel',()=>{dragged=null;dragGhost?.destroy({children:true});dragGhost=null;placementGuide?.destroy();placementGuide=null;render(true);});

  function render(force = false) {
    if (!root.visible || dragged || pointerHeld) return;
    const presentation = getPresentation?.() ?? {};
    const state = getState?.() ?? null;
    const vassal = presentation.vassal;
    const readOnly = presentation.readOnly === true;
    const projection = presentation.viewedSec > presentation.frontierSec;
    const currentNodeId = vassal?.lifeMap?.currentNodeId ?? null;
    const decision = getDecisionPresentation?.(openNodeId, {
      previewOptionId,
      previewOfferId,
    }) ?? null;
    lastDecision = decision;
    tableau.width = (decision?.settlement?.structureCapacity ?? 8) * PIECE_SIZE.cellWidth;
    const node = decision?.node ?? getVassalLifeMapNode(vassal, openNodeId);
    const nodeState = decision?.nodeState ?? vassal?.lifeMap?.nodeStates?.[openNodeId] ?? null;
    const family = node?.signatureNode?.variantId
      ? VASSAL_SIGNATURE_NODE_VARIANTS[node.signatureNode.variantId]
      : node ? VASSAL_NODE_FAMILIES[node.family] : null;
    const nextSignature = getArtRevision() + JSON.stringify({ presentation, decision, openNodeId, dragTargetIndex,
      previewOptionId, previewOfferId, pinnedInspectionId });
    if (!force && nextSignature === signature) return;
    signature = nextSignature;
    clearChildren(root);
    enterRoot = null;
    optionRoots = [];
    offerRoots = [];
    shopCardRoots = [];
    confirmRoot = null;
    undoRoots = [];
    tableauRoots = [];
    inspectionRoot = null;

    const blocker = new PIXI.Graphics();
    blocker.beginFill(0x171713, 0.68).drawRect(0, 0, app.screen.width, app.screen.height).endFill();
    blocker.eventMode = "static";
    blocker.cursor = "pointer";
    blocker.on("pointertap", (event) => { event?.stopPropagation?.(); close(); });
    const bg = new PIXI.Graphics();
    roundedRect(bg, PANEL.x, PANEL.y, PANEL.width, PANEL.height, 18,
      0x292f2b, family?.color ?? PALETTE.accent, 3);
    bg.eventMode = "static";
    bg.on("pointertap", (event) => event?.stopPropagation?.());
    root.addChild(blocker, bg);

    if (!vassal || !node || !family) {
      root.addChild(createText("No Lifegraph decision is available.", {
        ...TEXT_STYLES.header, fontSize: 28,
      }, PANEL.x + 50, PANEL.y + 70));
      button(root, { x: PANEL.x + PANEL.width - 140, y: PANEL.y + 24, width: 100, height: 44 }, "CLOSE", true, close);
      return;
    }

    const projected = decision?.projectedPrestige ?? vassal.prestige;
    root.addChild(
      createText(`${family.glyph}  ${family.label}`, {
        ...TEXT_STYLES.header, fontSize: 30, fill: family.color,
      }, PANEL.x + 44, PANEL.y + 26),
      createText(family.description, {
        ...TEXT_STYLES.body, fontSize: 17, fill: PALETTE.textMuted,
        wordWrap: true, wordWrapWidth: 780,
      }, PANEL.x + 44, PANEL.y + 66),
      createText(`VASSAL · ${decision?.previewRegionLabel ?? vassal.locationRegionId}`, {
        ...TEXT_STYLES.chip, fontSize: 14, fill: PALETTE.textMuted,
      }, PANEL.x + 1130, PANEL.y + 28),
    );
    addResourceAmount(root, 'prestige', projected === vassal.prestige ? vassal.prestige : vassal.prestige + ' → ' + projected, {
      x: PANEL.x + 1130, y: PANEL.y + 47, fontSize: 32, iconSize: 42, fill: PALETTE.accent,
    });
    button(root, { x: PANEL.x + PANEL.width - 146, y: PANEL.y + 24, width: 106, height: 44 }, "CLOSE", true, close);

    const hasContext = decision?.contextKind && decision.contextKind !== "none";
    const simpleOutcomes = node.family === 'patronage' || node.family === 'development';
    if (hasContext) {
      const divider = new PIXI.Graphics();
      divider.lineStyle(2, PALETTE.stroke, 0.9).moveTo(PANEL.x + 1160, PANEL.y + 112)
        .lineTo(PANEL.x + 1160, PANEL.y + PANEL.height - 92);
      root.addChild(divider);
    }

    if (!nodeState) {
      root.addChild(createText(readOnly
        ? projection ? "Return to Present to enter this node. This future is a projection."
          : "This node was not part of the committed path. Return to Present to make decisions."
        : "Enter this node to reveal its choices and begin the decision.", {
        ...TEXT_STYLES.header, fontSize: 23, fill: PALETTE.textMuted,
        wordWrap: true, wordWrapWidth: 900,
      }, PANEL.x + 54, PANEL.y + 190));
      const available = !readOnly && (vassal.lifeMap.availableNodeIds ?? []).includes(node.id)
        && (vassal.developmentChoiceQueue ?? []).length === 0;
      enterRoot = button(root, { x: PANEL.x + 54, y: PANEL.y + 270, width: 430, height: 64 },
        `ENTER ${family.label.toUpperCase()}`, available, () => {
          onEnterNode?.(node.id);
          openNodeId = node.id;
          render(true);
        });
      explainReadOnly(enterRoot, readOnly);
    } else if (nodeState.resolving) {
      root.addChild(createText("DECISION COMMITTED · RESOLUTION IN PROGRESS", {
        ...TEXT_STYLES.header, fontSize: 25, fill: PALETTE.accent,
      }, PANEL.x + 54, PANEL.y + 170));
    } else {
      const isShop = nodeState.contentMode === "shop";
      const cardWidth = hasContext ? 338 : 520;
      const cardGap = 22;
      const cardY = PANEL.y + 136;
      // Keep staged offers in their original places so their prices and full
      // inspections remain available throughout the draft. The model still
      // removes purchases from the available inventory until they are undone.
      const shopCards = [...(decision?.offers ?? []), ...(decision?.purchases ?? [])]
        .sort((a, b) => (a.sourceInventoryIndex ?? a.inventoryIndex ?? 0)
          - (b.sourceInventoryIndex ?? b.inventoryIndex ?? 0));
      const itemCount = isShop ? shopCards.length : (nodeState.options ?? []).length;
      const actionWidth = hasContext ? 1060 : PANEL.width - 108;
      const cardsWidth = Math.max(0, itemCount * cardWidth + Math.max(0, itemCount - 1) * cardGap);
      const cardStartX = PANEL.x + 54 + Math.max(0, (actionWidth - cardsWidth) / 2);
      if (isShop) {
        root.addChild(createText("SHOP OFFERS", {
          ...TEXT_STYLES.chip, fontSize: 14, fill: PALETTE.textMuted,
        }, PANEL.x + 54, PANEL.y + 112));
        const objectWidths=shopCards.map(offer=>offer.presentation?.kind==='structure'?PIECE_SIZE.cellWidth*(offer.presentation.footprint??1):offer.presentation?PIECE_SIZE.practiceWidth:cardWidth);
        const widths=objectWidths.map(width=>Math.max(164,width));
        let cursor=PANEL.x+54+Math.max(0,(1060-widths.reduce((sum,w)=>sum+w,0)-(widths.length-1)*22)/2);
        shopCardRoots = shopCards.map((offer,index)=>{
          const enabled=!readOnly&&!offer.purchased&&offer.prestigeCost<=projected&&offer.canStage!==false;
          const inspect=()=>{pinnedInspectionId=pinnedInspectionId===offer.offerId?null:offer.offerId;render(true);};
          let card;
          if(offer.presentation) {
            card=new PIXI.Container();card.position.set(cursor,cardY);root.addChild(card);
            card.hitArea=new PIXI.Rectangle(0,0,widths[index],PIECE_SIZE.practiceHeight+12+COST_FOOTER_HEIGHT);
            const h=offer.presentation.kind==='structure'?PIECE_SIZE.structureHeight:PIECE_SIZE.practiceHeight;
            const face=addSettlementPiece(card,{x:(widths[index]-objectWidths[index])/2,y:PIECE_SIZE.practiceHeight-h,width:objectWidths[index],height:h},{
              face:offer.presentation,state:offer.purchased?'withdrawn':'confirmed',onInspect:inspect,
              onHover:()=>{hoveredOfferId=offer.offerId;scheduleHoverRender();},
              onOut:()=>{if(hoveredOfferId===offer.offerId){hoveredOfferId=null;scheduleHoverRender();}},
            });
            face.on('pointerdown',event=>beginDrag(event,face,offer,true));
            card.faceRoot=face;
            card.costPanel=addCostPanel(card,{x:0,y:PIECE_SIZE.practiceHeight+12,width:widths[index],height:COST_FOOTER_HEIGHT},{
              prestigeCost:offer.prestigeCost,phaseCost:offer.phaseCost,state,staged:offer.purchased,disabled:!enabled,
              unaffordable:offer.prestigeCost>projected&&!offer.purchased,label:'Stage '+offer.label,
              onActivate:()=>onPurchaseOffer?.(node.id,offer.offerId),onUnavailable:readOnly?onReadOnlyAction:null,fontSize:30,iconSize:38,
            });
          } else {
            card=actionCard(root,{x:cursor,y:cardY,width:widths[index],height:398},{
              title:offer.label,artId:node.family,presentation:offer.presentation,
              actionLabel:offer.purchased?'STAGED':'STAGE',staged:offer.purchased,onInspect:inspect,
              cost:{prestigeCost:offer.prestigeCost,phaseCost:offer.phaseCost,state},enabled,
              onClick:()=>onPurchaseOffer?.(node.id,offer.offerId),onUnavailable:readOnly?onReadOnlyAction:null,
            });
          }
          if(offer.purchased)undoRoots.push(button(root,{x:cursor,y:cardY+414,width:widths[index],height:44},'UNDO',!readOnly,()=>onUndoPurchase?.(node.id,offer.offerId)));
          cursor+=widths[index]+22;
          return card;
        });
        offerRoots=shopCardRoots.filter((_,index)=>!shopCards[index].purchased);

      } else {
        root.addChild(createText("CHOOSE ONE", {
          ...TEXT_STYLES.chip, fontSize: 14, fill: PALETTE.textMuted,
        }, PANEL.x + 54, PANEL.y + 112));
        optionRoots = (nodeState.options ?? []).map((option, index) => {
          const prestigeCost = getAdjustedVassalPrestigeCost(vassal, option.prestigeCost ?? 0);
          const phaseCost = getAdjustedVassalPhaseCost(vassal, option.phaseCost ?? 0);
          const requirements = decision?.optionRequirements?.[option.id] ?? [];
          return (simpleOutcomes ? outcomeCard : actionCard)(root, {
            x: cardStartX + index * (cardWidth + cardGap), y: cardY,
            width: cardWidth, height: simpleOutcomes ? 450 : 380,
          }, {
            artId:node.family,
            expanded:pinnedInspectionId===option.id||previewOptionId===option.id,actionLabel:'CHOOSE',
            onInspect:()=>{pinnedInspectionId=pinnedInspectionId===option.id?null:option.id;render(true);},
            title: requirements.some((entry) => !entry.met) ? `${option.label} · Unavailable` : option.label,
            cost: { prestigeCost, phaseCost, state },
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
      }, sx, PANEL.y + 116));
      root.addChild(createText(
        `Food ${Math.round(settlement.looseFood ?? 0)} loose / ${Math.round(settlement.storedFood ?? 0)} stored    Currency ${Math.round(settlement.currency ?? 0)}`,
        { ...TEXT_STYLES.body, fontSize: 15, fill: PALETTE.textMuted }, sx, PANEL.y + 150));
      root.addChild(createText('PRACTICES   ◷ Scheduled trigger     ✦ Charge',{...TEXT_STYLES.chip,fontSize:17,fill:PALETTE.textMuted},sx,PANEL.y+180));
      (settlement.practices??[]).forEach((piece,index)=>{
        const card=addSettlementPiece(root,{x:tableau.x+index*(PIECE_SIZE.practiceWidth+PIECE_SIZE.gap),y:tableau.practiceY,width:PIECE_SIZE.practiceWidth,height:PIECE_SIZE.practiceHeight},{
          face:piece?.presentation,empty:!piece,state:piece?.upgraded?'upgraded':piece?.staged?'staged':'confirmed',time:state?.tSec??0,
          onInspect:piece?()=>{pinnedInspectionId=piece.offerId??'practice:'+piece.practiceId;render(true);}:undefined,
        });
        if(piece?.staged)card.on('pointerdown',event=>beginDrag(event,card,piece));
        animateUpgrade(card, piece, readOnly);
        tableauRoots.push({card,piece});
      });
      (settlement.displacedPractices??[]).forEach((face,index)=>{
        const card=addSettlementPiece(root,{x:tableau.x+858+index*12,y:tableau.practiceY+116,width:60,height:96},{face,state:'displaced',onInspect:()=>{pinnedInspectionId='displaced:'+face.definitionId;render(true);}});
        card.rotation=.12;
      });
      root.addChild(createText('CONSTRUCTION',{...TEXT_STYLES.chip,fontSize:16,fill:PALETTE.textMuted},sx,PANEL.y+450));
      addConstructionStrip(root,{x:tableau.x,y:tableau.structureY,width:tableau.width,height:PIECE_SIZE.structureHeight},{
        slots:settlement.structures,capacity:settlement.structureCapacity,demolished:settlement.demolishedStructures,time:state?.tSec??0,
        onInspect:piece=>{pinnedInspectionId=piece.offerId??'structure:'+piece.placementId;render(true);},
        onPiece:(card,piece)=>{tableauRoots.push({card,piece});animateUpgrade(card,piece,readOnly);if(piece.staged)card.on('pointerdown',event=>beginDrag(event,card,piece));},
      });
    } else if (decision?.contextKind === "regionalMap") {
      renderRegionalMap(root, decision.regionalMap, {
        x: sx, y: PANEL.y + 116, width: 830, height: 560,
      });
    } else if (decision?.contextKind === "vassal") {
      renderVassalProjection(root, decision.vassalProjection, {
        x: sx, y: PANEL.y + 116, width: 830, height: 560,
      });
    }

    const isCurrent = currentNodeId === node.id;
    const isShop = nodeState?.contentMode === "shop";
    const canConfirm = !readOnly && isCurrent && !nodeState?.resolving
      && (isShop || !!nodeState?.selectedOptionId);
    if (isShop && nodeState && !nodeState.resolving) {
      const rerollEnabled = !readOnly && !nodeState.rerollUsed
        && (nodeState.purchasedOffers ?? []).length === 0
        && getAdjustedVassalPrestigeCost(vassal, 6) <= vassal.prestige;
      const rerollCost = getAdjustedVassalPrestigeCost(vassal, 6);
      const reroll = button(root, { x: PANEL.x + 54, y: PANEL.y + PANEL.height - 72, width: 290, height: 50 },
        nodeState.rerollUsed ? "REROLL USED" : "REROLL", rerollEnabled,
        () => onRerollShop?.(node.id));
      if (!nodeState.rerollUsed) addResourceAmount(reroll, 'prestige', rerollCost, { x: 191, y: 7, fontSize: 27, iconSize: 36 });
      explainReadOnly(reroll, readOnly);
    }
    button(root, { x: PANEL.x + PANEL.width - 652, y: PANEL.y + PANEL.height - 72, width: 250, height: 50 },
      "REGIONAL MAP", true, () => { close(); onWorldMap?.(vassal.locationRegionId); });
    if (nodeState) {
      renderMortalityEstimate(root, decision?.mortalityEstimate, {
        x: sx, y: PANEL.y + PANEL.height - 178, width: 510, height: 102,
      }, canConfirm);
    }
    confirmRoot = button(root, { x: PANEL.x + PANEL.width - 380, y: PANEL.y + PANEL.height - 72, width: 340, height: 50 },
      readOnly ? projection ? "READ-ONLY PROJECTION" : "READ-ONLY HISTORY" : "CONFIRM & RESOLVE", canConfirm, () => {
        const result = onConfirmNode?.(node.id);
        if (result?.ok !== false) close();
      });
    explainReadOnly(confirmRoot, readOnly);
    const inspectedOffer=[...(decision?.offers??[]),...(decision?.purchases??[])].find(offer=>offer.offerId===(pinnedInspectionId??previewOfferId));
    const inspectedOption=(nodeState?.options??[]).find(option=>option.id===pinnedInspectionId);
    const inspectedTableau=[...(settlement?.practices??[]),...(settlement?.structures??[]),...(settlement?.demolishedStructures??[])].find(piece=>piece&&(
      'practice:'+piece.practiceId===pinnedInspectionId||'structure:'+piece.placementId===pinnedInspectionId));
    const displaced=(settlement?.displacedPractices??[]).find(face=>'displaced:'+face.definitionId===pinnedInspectionId);
    if(inspectedOffer||inspectedTableau||displaced||(inspectedOption&&!simpleOutcomes)) {
      const piece=inspectedOffer??inspectedOption??inspectedTableau;
      const face=piece?.presentation??displaced;
      const requirements=decision?.optionRequirements?.[piece?.id]??[];
      inspectionRoot=addChronicleInspection(root,{x:PANEL.x+36,y:PANEL.y+110,width:1092,height:580},{
        title:face?.label??piece?.label,face,artId:face?.definitionId??node.family,
        cost:inspectedOffer?{prestigeCost:piece.prestigeCost,phaseCost:piece.phaseCost,state,staged:piece.purchased,disabled:piece.purchased||readOnly||!piece.canStage}:inspectedOption?{
          prestigeCost:getAdjustedVassalPrestigeCost(vassal,piece.prestigeCost??0),phaseCost:getAdjustedVassalPhaseCost(vassal,piece.phaseCost??0),state,
        }:null,
        onActivate:!readOnly && inspectedOffer && !piece.purchased && piece.canStage
          ? ()=>{onPurchaseOffer?.(node.id,piece.offerId);pinnedInspectionId=null;previewOfferId=null;render(true);}
          : !readOnly && inspectedOption && requirements.every(entry=>entry.met)
            ? ()=>{onSelectOption?.(node.id,piece.id);pinnedInspectionId=null;render(true);} : undefined,
        metadata:[face?.qualityLabel,...(face?.tags??[])].filter(Boolean).join(' · '),
        detail:[face?[face.rule,...(face.details??face.detailLines??[])].join('\n'):optionEffect(piece),
          inspectedOffer && !piece.purchased ? piece.stageBlockedReason : null,
          displaced?'This practice leaves because the incoming prefix fills all five slots.':null,
          ...requirements.map(entry=>(entry.met?'✓ ':'✗ ')+entry.label)].filter(Boolean).join('\n'),
        onClose:()=>{pinnedInspectionId=null;previewOfferId=null;hoveredOfferId=null;render(true);},
      });
      if(!pinnedInspectionId){inspectionRoot.eventMode="none";inspectionRoot.interactiveChildren=false;}
    }

  }

  return {
    init: () => {}, update: () => render(), refresh: () => render(true), resize: () => render(true),
    open, close, isOpen: () => root.visible, getOpenNodeId: () => openNodeId,
    getEnterNodeClickPoint: () => root.visible && enterRoot?.toGlobal
      ? enterRoot.toGlobal(new PIXI.Point(enterRoot.hitArea.width / 2, enterRoot.hitArea.height / 2)) : null,
    getOptionClickPoint(index = 0) {
      if (!root.visible) return null;
      const target = optionRoots[index];
      const point = target?.toGlobal?.(new PIXI.Point(target.hitArea.width / 2, target.hitArea.height - COST_FOOTER_HEIGHT / 2 - 6));
      return point ? { x: point.x, y: point.y } : null;
    },
    getOfferClickPoint(index = 0) {
      if (!root.visible) return null;
      const target = offerRoots[index];
      const point = target?.toGlobal?.(new PIXI.Point(target.hitArea.width / 2, target.hitArea.height - COST_FOOTER_HEIGHT / 2 - 6));
      return point ? { x: point.x, y: point.y } : null;
    },
    getConfirmClickPoint: () => root.visible && confirmRoot?.toGlobal
      ? confirmRoot.toGlobal(new PIXI.Point(confirmRoot.hitArea.width / 2, confirmRoot.hitArea.height / 2)) : null,
    getUndoClickPoint(index = 0) {
      if (!root.visible) return null;
      const target = undoRoots[index];
      const point = target?.toGlobal?.(new PIXI.Point(target.hitArea.width / 2, target.hitArea.height - 24));
      return point ? { x: point.x, y: point.y } : null;
    },
    getTableauClickPoint(index=0) { const card=tableauRoots[index]?.card; return card?card.toGlobal(new PIXI.Point(card.hitArea.width/2,card.hitArea.height/2)):null; },
    getOfferFacePoint(index=0) { const card=shopCardRoots[index]?.faceRoot; return card?card.toGlobal(new PIXI.Point(card.hitArea.width/2,card.hitArea.height/2)):null; },
    getInspectionClosePoint() { const c=inspectionRoot?.closeControl;return c?c.toGlobal(new PIXI.Point(25,25)):null; },
    getInspectionCostPoint() { const c=inspectionRoot?.costPanel;return c?c.toGlobal(new PIXI.Point(c.hitArea.width/2,c.hitArea.height/2)):null; },
    getConstructionPoint(origin=0) { return {x:tableau.x+(origin+.5)*tableau.width/(lastDecision?.settlement?.structureCapacity??8),y:tableau.structureY+64}; },
    getSemanticSnapshot: () => {
      const decision = getDecisionPresentation?.(openNodeId, {
        previewOptionId, previewOfferId,
      });
      return {
        open: root.visible, nodeId: openNodeId,
        inspectedCardId: pinnedInspectionId,
        inspectionRect: inspectionRoot?.getBounds?.()??null,
        tableauRect: {x:tableau.x,y:tableau.practiceY,width:tableau.width,height:tableau.structureY+128-tableau.practiceY},
        family: decision?.node?.family ?? null,
        selectedOptionId: decision?.nodeState?.selectedOptionId ?? null,
        resolving: decision?.nodeState?.resolving === true,
        currentPrestige: decision?.currentPrestige ?? null,
        projectedPrestige: decision?.projectedPrestige ?? null,
        mortalityEstimate: decision?.mortalityEstimate ?? null,
        offers: (decision?.offers ?? []).map((offer) => ({ offerId: offer.offerId, label: offer.label, kind: offer.intervention?.kind, mode: offer.intervention?.mode, footprint: offer.presentation?.footprint, validOrigins: offer.validOrigins, canStage: offer.canStage, rule: offer.presentation?.rule ?? offerEffect(offer) })),
        purchaseOrder: (decision?.purchases ?? []).map((purchase) => purchase.offerId),
        costPanels: [...shopCardRoots, ...optionRoots].map(card => ({ ...card.costPanel.costSummary,
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
  };
}
