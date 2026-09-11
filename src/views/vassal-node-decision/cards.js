// Buttons, option/offer copy, and choice/shop cards.

import { addIllustration } from "../chronicle-art.js";
import { addCostPanel } from "../resource-cost-pixi.js";
import { createText, roundedRect } from "../settlement-view-primitives.js";
import { PALETTE, TEXT_STYLES } from "../settlement-theme.js";
import {
  COST_FOOTER_HEIGHT,
  QUALITY_COLORS,
} from "./constants.js";

export function button(parent, rect, label, enabled, onClick, selected = false) {
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

export function optionEffect(option) {
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

export function offerEffect(offer) {
  const presentation = offer?.presentation;
  if (presentation) return [presentation.rule, ...(presentation.details ?? [])].filter(Boolean).join("\n");
  const intervention = offer?.intervention;
  if (intervention?.kind === "connection") {
    return `${intervention.mode === "add" ? "Create" : "Remove"} this commercial route.`;
  }
  return "Apply this intervention when the node is confirmed.";
}

export function actionCard(parent, rect, spec) {
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
export function outcomeCard(parent, rect, spec) {
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
