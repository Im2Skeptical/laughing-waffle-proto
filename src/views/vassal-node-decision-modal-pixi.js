import { VASSAL_NODE_FAMILIES } from "../defs/gamepieces/vassal-life-map-defs.js";
import { getVassalLifeMapNode } from "../model/vassal-life-map.js";
import {
  formatVassalPhaseDuration,
  getAdjustedVassalPhaseCost,
  getAdjustedVassalPrestigeCost,
} from "../model/vassal-life-map.js";
import { clearChildren, createText, roundedRect } from "./settlement-view-primitives.js";
import { PALETTE, TEXT_STYLES } from "./settlement-theme.js";

const PANEL = Object.freeze({ x: 128, y: 62, width: 2180, height: 780 });
const SHOP_FAMILIES = new Set(["practiceReform", "publicWorks", "routes"]);
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
    ...TEXT_STYLES.title, fontSize: 16, fill: enabled ? PALETTE.text : PALETTE.textMuted,
    wordWrap: true, wordWrapWidth: rect.width - 18, align: "center",
  }, rect.width / 2, rect.height / 2, 0.5, 0.5));
  parent.addChild(root);
  return root;
}

function tagRow(parent, tags, x, y, maxWidth = 300) {
  let cursorX = x;
  for (const tag of tags ?? []) {
    const width = Math.min(92, 18 + String(tag).length * 9);
    if (cursorX + width > x + maxWidth) break;
    const gfx = new PIXI.Graphics();
    roundedRect(gfx, cursorX, y, width, 22, 10, 0x37443d, 0x778d7e, 1);
    parent.addChild(gfx, createText(tag, {
      ...TEXT_STYLES.chip, fontSize: 11, fill: 0xcbd8cf,
    }, cursorX + width / 2, y + 11, 0.5, 0.5));
    cursorX += width + 6;
  }
}

function qualityLabel(parent, presentation, x, y) {
  if (!presentation?.tier) return;
  const color = QUALITY_COLORS[presentation.tier] ?? PALETTE.accent;
  parent.addChild(createText(presentation.qualityLabel?.toUpperCase?.() ?? presentation.tier.toUpperCase(), {
    ...TEXT_STYLES.chip, fontSize: 13, fill: color,
  }, x, y));
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

function formatCost(prestigeCost, phaseCost) {
  return `${prestigeCost} Prestige · ${formatVassalPhaseDuration(phaseCost)}`;
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

function actionCard(parent, rect, spec) {
  const root = new PIXI.Container();
  root.position.set(rect.x, rect.y);
  root.eventMode = spec.enabled ? "static" : "none";
  root.cursor = spec.enabled ? "pointer" : "default";
  root.hitArea = new PIXI.Rectangle(0, 0, rect.width, rect.height);
  root.on("pointertap", (event) => {
    event?.stopPropagation?.();
    if (spec.enabled) spec.onClick?.();
  });
  root.on("pointerover", () => spec.onHover?.());
  root.on("pointerout", () => spec.onOut?.());
  const gfx = new PIXI.Graphics();
  roundedRect(gfx, 0, 0, rect.width, rect.height, 12,
    spec.selected ? 0x42583d : 0x303733,
    spec.selected ? PALETTE.green : spec.presentation?.tier
      ? QUALITY_COLORS[spec.presentation.tier] : PALETTE.stroke,
    spec.selected ? 4 : 2);
  root.addChild(gfx);
  qualityLabel(root, spec.presentation, 18, 14);
  root.addChild(
    createText(spec.title, {
      ...TEXT_STYLES.header, fontSize: 21, wordWrap: true,
      wordWrapWidth: rect.width - 36, lineHeight: 23,
    }, 18, spec.presentation ? 38 : 18),
    createText(spec.cost, {
      ...TEXT_STYLES.title, fontSize: 15, fill: PALETTE.accent,
      wordWrap: true, wordWrapWidth: rect.width - 36,
    }, 18, 94),
    createText(spec.effect, {
      ...TEXT_STYLES.body, fontSize: 16, fill: spec.enabled ? PALETTE.text : PALETTE.textMuted,
      wordWrap: true, wordWrapWidth: rect.width - 36, lineHeight: 19,
    }, 18, 132)
  );
  tagRow(root, spec.presentation?.tags, 18, rect.height - 34, rect.width - 36);
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
    gfx.lineStyle(region.current ? 4 : region.selected ? 3 : 1,
      region.current ? PALETTE.accent : region.selected ? PALETTE.green : PALETTE.stroke, 1);
    gfx.beginFill(REGION_COLORS[region.colour] ?? REGION_COLORS.black,
      region.controller === "player" ? 0.88 : 0.52);
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

function pieceSlot(parent, piece, rect, emptyLabel) {
  const gfx = new PIXI.Graphics();
  if (piece?.staged) {
    gfx.lineStyle(3, PALETTE.accent, 0.95);
    gfx.beginFill(0x5d5539, 0.64).drawRoundedRect(rect.x, rect.y, rect.width, rect.height, 8).endFill();
  } else {
    roundedRect(gfx, rect.x, rect.y, rect.width, rect.height, 8,
      piece ? 0x333a35 : 0x292d2a, piece ? PALETTE.stroke : 0x55544d, 1);
  }
  parent.addChild(gfx);
  if (!piece) {
    parent.addChild(createText(emptyLabel, {
      ...TEXT_STYLES.body, fontSize: 13, fill: 0x777970,
    }, rect.x + rect.width / 2, rect.y + rect.height / 2, 0.5, 0.5));
    return;
  }
  const p = piece.presentation;
  parent.addChild(
    createText(piece.staged ? "GHOST PREVIEW" : p?.qualityLabel?.toUpperCase?.() ?? "BRONZE", {
      ...TEXT_STYLES.chip, fontSize: 10,
      fill: piece.staged ? PALETTE.accent : QUALITY_COLORS[p?.tier] ?? PALETTE.textMuted,
    }, rect.x + 10, rect.y + 8),
    createText(p?.label ?? "Piece", {
      ...TEXT_STYLES.title, fontSize: 15, wordWrap: true, wordWrapWidth: rect.width - 18,
    }, rect.x + 9, rect.y + 25),
    createText((p?.tags ?? []).join(" · "), {
      ...TEXT_STYLES.body, fontSize: 11, fill: PALETTE.textMuted,
      wordWrap: true, wordWrapWidth: rect.width - 18,
    }, rect.x + 9, rect.y + rect.height - 20)
  );
}

export function createVassalNodeDecisionModalView({
  app, layer, getPresentation, getDecisionPresentation, onEnterNode, onSelectOption,
  onPurchaseOffer, onUndoPurchase, onReorderPurchase, onRerollShop, onConfirmNode,
  onWorldMap,
} = {}) {
  const root = new PIXI.Container();
  root.visible = false;
  root.zIndex = 170;
  root.eventMode = "static";
  layer?.addChild(root);
  let openNodeId = null;
  let signature = "";
  let dragged = null;
  let dragTargetIndex = null;
  let enterRoot = null;
  let optionRoots = [];
  let offerRoots = [];
  let confirmRoot = null;
  let undoRoots = [];
  let hoveredOptionId = null;
  let hoveredOfferId = null;
  let previewOptionId = null;
  let previewOfferId = null;
  let hoverRenderTimer = null;

  function scheduleHoverRender() {
    if (hoverRenderTimer != null) clearTimeout(hoverRenderTimer);
    hoverRenderTimer = setTimeout(() => {
      hoverRenderTimer = null;
      previewOptionId = hoveredOptionId;
      previewOfferId = hoveredOfferId;
      render(true);
    }, 120);
  }

  function close() {
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
    openNodeId = nodeId ?? getPresentation?.()?.vassal?.lifeMap?.currentNodeId ?? null;
    root.visible = true;
    hoveredOptionId = null;
    hoveredOfferId = null;
    previewOptionId = null;
    previewOfferId = null;
    render(true);
  }

  function finishDrag(event) {
    if (!dragged) return;
    event?.stopPropagation?.();
    if (Number.isFinite(dragTargetIndex) && dragTargetIndex !== dragged.fromIndex) {
      onReorderPurchase?.(openNodeId, dragged.offerId, dragTargetIndex);
    }
    dragged = null;
    dragTargetIndex = null;
    render(true);
  }

  root.on("pointermove", (event) => {
    if (!dragged) return;
    const local = root.toLocal(event.global);
    const trayX = PANEL.x + 54;
    const cardWidth = 318;
    const gap = 14;
    dragTargetIndex = Math.max(0, Math.min(
      dragged.count - 1,
      Math.floor((local.x - trayX + (cardWidth + gap) / 2) / (cardWidth + gap))
    ));
    render(true);
  });
  root.on("pointerup", finishDrag);
  root.on("pointerupoutside", finishDrag);

  function render(force = false) {
    if (!root.visible) return;
    const presentation = getPresentation?.() ?? {};
    const vassal = presentation.vassal;
    const readOnly = presentation.readOnly === true;
    const currentNodeId = vassal?.lifeMap?.currentNodeId ?? null;
    const decision = getDecisionPresentation?.(openNodeId, {
      previewOptionId,
      previewOfferId,
    }) ?? null;
    const node = decision?.node ?? getVassalLifeMapNode(vassal, openNodeId);
    const nodeState = decision?.nodeState ?? vassal?.lifeMap?.nodeStates?.[openNodeId] ?? null;
    const family = node ? VASSAL_NODE_FAMILIES[node.family] : null;
    const nextSignature = JSON.stringify({ presentation, decision, openNodeId, dragTargetIndex,
      previewOptionId, previewOfferId });
    if (!force && nextSignature === signature) return;
    signature = nextSignature;
    clearChildren(root);
    enterRoot = null;
    optionRoots = [];
    offerRoots = [];
    confirmRoot = null;
    undoRoots = [];

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
      createText(projected === vassal.prestige
        ? `Prestige  ${vassal.prestige}`
        : `Prestige  ${vassal.prestige}  →  ${projected}`,
      { ...TEXT_STYLES.header, fontSize: 26, fill: projected < vassal.prestige ? PALETTE.accent : PALETTE.text },
      PANEL.x + 1130, PANEL.y + 52)
    );
    button(root, { x: PANEL.x + PANEL.width - 146, y: PANEL.y + 24, width: 106, height: 44 }, "CLOSE", true, close);

    const hasContext = decision?.contextKind && decision.contextKind !== "none";
    if (hasContext) {
      const divider = new PIXI.Graphics();
      divider.lineStyle(2, PALETTE.stroke, 0.9).moveTo(PANEL.x + 1160, PANEL.y + 112)
        .lineTo(PANEL.x + 1160, PANEL.y + PANEL.height - 92);
      root.addChild(divider);
    }

    if (!nodeState) {
      root.addChild(createText(readOnly
        ? "This node was not part of the committed path."
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
    } else if (nodeState.resolving) {
      root.addChild(createText("DECISION COMMITTED · RESOLUTION IN PROGRESS", {
        ...TEXT_STYLES.header, fontSize: 25, fill: PALETTE.accent,
      }, PANEL.x + 54, PANEL.y + 170));
    } else {
      const isShop = SHOP_FAMILIES.has(nodeState.family);
      const cardWidth = hasContext ? 338 : 520;
      const cardGap = 22;
      const cardY = PANEL.y + 136;
      const itemCount = isShop ? (decision?.offers ?? []).length : (nodeState.options ?? []).length;
      const actionWidth = hasContext ? 1060 : PANEL.width - 108;
      const cardsWidth = Math.max(0, itemCount * cardWidth + Math.max(0, itemCount - 1) * cardGap);
      const cardStartX = PANEL.x + 54 + Math.max(0, (actionWidth - cardsWidth) / 2);
      if (isShop) {
        root.addChild(createText("AVAILABLE OFFERS", {
          ...TEXT_STYLES.chip, fontSize: 14, fill: PALETTE.textMuted,
        }, PANEL.x + 54, PANEL.y + 112));
        offerRoots = (decision?.offers ?? []).map((offer, index) => {
          const enabled = !readOnly && offer.prestigeCost <= projected;
          return actionCard(root, {
            x: cardStartX + index * (cardWidth + cardGap), y: cardY,
            width: cardWidth, height: 292,
          }, {
            title: offer.label,
            presentation: offer.presentation,
            cost: formatCost(offer.prestigeCost, offer.phaseCost),
            effect: offerEffect(offer), enabled,
            onClick: () => onPurchaseOffer?.(node.id, offer.offerId),
            onHover: () => {
              if (hoveredOfferId === offer.offerId) return;
              hoveredOfferId = offer.offerId;
              scheduleHoverRender();
            },
            onOut: () => {
              if (hoveredOfferId !== offer.offerId) return;
              hoveredOfferId = null;
              scheduleHoverRender();
            },
          });
        });
        root.addChild(createText("STAGED PURCHASE ORDER · DRAG TO REORDER", {
          ...TEXT_STYLES.chip, fontSize: 14, fill: PALETTE.textMuted,
        }, PANEL.x + 54, PANEL.y + 450));
        const purchases = decision?.purchases ?? [];
        if (!purchases.length) {
          root.addChild(createText("No purchases staged. You may confirm a shop without buying.", {
            ...TEXT_STYLES.body, fontSize: 17, fill: PALETTE.textMuted,
          }, PANEL.x + 54, PANEL.y + 490));
        }
        purchases.forEach((purchase, index) => {
          const x = PANEL.x + 54 + index * 332;
          const y = PANEL.y + 480;
          const card = new PIXI.Container();
          card.position.set(x, y);
          card.eventMode = readOnly ? "none" : "static";
          card.cursor = readOnly ? "default" : "grab";
          card.hitArea = new PIXI.Rectangle(0, 0, 318, 104);
          card.on("pointerdown", (event) => {
            event?.stopPropagation?.();
            dragged = { offerId: purchase.offerId, fromIndex: index, count: purchases.length };
            dragTargetIndex = index;
          });
          const gfx = new PIXI.Graphics();
          const target = dragged && dragTargetIndex === index;
          roundedRect(gfx, 0, 0, 318, 104, 9, target ? 0x4d5137 : 0x343a35,
            target ? PALETTE.accent : PALETTE.stroke, target ? 3 : 1);
          card.addChild(gfx,
            createText(`≡  ${index + 1}`, { ...TEXT_STYLES.header, fontSize: 20, fill: PALETTE.accent }, 12, 10),
            createText(purchase.label, {
              ...TEXT_STYLES.title, fontSize: 15, wordWrap: true, wordWrapWidth: 220,
            }, 58, 12),
            createText(formatCost(purchase.prestigeCost, purchase.phaseCost), {
              ...TEXT_STYLES.body, fontSize: 13, fill: PALETTE.textMuted,
            }, 58, 72));
          root.addChild(card);
          undoRoots[index] = button(root, { x: x + 258, y: y + 61, width: 48, height: 32 }, "UNDO", !readOnly,
            () => onUndoPurchase?.(node.id, purchase.offerId));
        });
      } else {
        root.addChild(createText("CHOOSE ONE", {
          ...TEXT_STYLES.chip, fontSize: 14, fill: PALETTE.textMuted,
        }, PANEL.x + 54, PANEL.y + 112));
        optionRoots = (nodeState.options ?? []).map((option, index) => {
          const prestigeCost = getAdjustedVassalPrestigeCost(vassal, option.prestigeCost ?? 0);
          const phaseCost = getAdjustedVassalPhaseCost(vassal, option.phaseCost ?? 0);
          return actionCard(root, {
            x: cardStartX + index * (cardWidth + cardGap), y: cardY,
            width: cardWidth, height: 292,
          }, {
            title: option.label,
            cost: formatCost(prestigeCost, phaseCost),
            effect: optionEffect(option), enabled: !readOnly && prestigeCost <= vassal.prestige,
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
      root.addChild(createText("PRACTICES", { ...TEXT_STYLES.chip, fontSize: 13, fill: PALETTE.textMuted }, sx, PANEL.y + 184));
      (settlement.practices ?? []).forEach((piece, index) => pieceSlot(root, piece, {
        x: sx + (index % 3) * 286, y: PANEL.y + 210 + Math.floor(index / 3) * 100,
        width: 270, height: 86,
      }, `Empty Practice ${index + 1}`));
      if (settlement.displacedPractices?.length) {
        root.addChild(createText(`DISPLACED ON CONFIRM: ${settlement.displacedPractices.map((piece) => piece.label).join(", ")}`, {
          ...TEXT_STYLES.chip, fontSize: 11, fill: 0xd58c7c,
          wordWrap: true, wordWrapWidth: 820,
        }, sx, PANEL.y + 398));
      }
      root.addChild(createText(`STRUCTURES · ${settlement.structures.filter(Boolean).length}/${settlement.structureCapacity}`, {
        ...TEXT_STYLES.chip, fontSize: 13, fill: PALETTE.textMuted,
      }, sx, PANEL.y + 418));
      (settlement.structures ?? []).forEach((piece, index) => pieceSlot(root, piece, {
        x: sx + (index % 3) * 286, y: PANEL.y + 444 + Math.floor(index / 3) * 82,
        width: 270, height: 70,
      }, `Empty Structure ${index + 1}`));
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
    const isShop = SHOP_FAMILIES.has(nodeState?.family);
    const canConfirm = !readOnly && isCurrent && !nodeState?.resolving
      && (isShop || !!nodeState?.selectedOptionId);
    if (isShop && nodeState && !nodeState.resolving) {
      const rerollEnabled = !readOnly && !nodeState.rerollUsed
        && (nodeState.purchasedOffers ?? []).length === 0
        && getAdjustedVassalPrestigeCost(vassal, 6) <= vassal.prestige;
      button(root, { x: PANEL.x + 54, y: PANEL.y + PANEL.height - 72, width: 290, height: 50 },
        nodeState.rerollUsed ? "REROLL USED" : "REROLL · 6 PRESTIGE", rerollEnabled,
        () => onRerollShop?.(node.id));
    }
    button(root, { x: PANEL.x + PANEL.width - 652, y: PANEL.y + PANEL.height - 72, width: 250, height: 50 },
      "VIEW WORLD MAP", !readOnly, () => { close(); onWorldMap?.(vassal.locationRegionId); });
    if (nodeState) {
      renderMortalityEstimate(root, decision?.mortalityEstimate, {
        x: PANEL.x + PANEL.width - 380, y: PANEL.y + PANEL.height - 178, width: 340, height: 94,
      }, canConfirm);
    }
    confirmRoot = button(root, { x: PANEL.x + PANEL.width - 380, y: PANEL.y + PANEL.height - 72, width: 340, height: 50 },
      readOnly ? "READ-ONLY HISTORY" : "CONFIRM & RESOLVE", canConfirm, () => {
        const result = onConfirmNode?.(node.id);
        if (result?.ok !== false) close();
      });
  }

  return {
    init: () => {}, update: () => render(), refresh: () => render(true), resize: () => render(true),
    open, close, isOpen: () => root.visible, getOpenNodeId: () => openNodeId,
    getEnterNodeClickPoint: () => root.visible && enterRoot?.toGlobal
      ? enterRoot.toGlobal(new PIXI.Point(enterRoot.hitArea.width / 2, enterRoot.hitArea.height / 2)) : null,
    getOptionClickPoint(index = 0) {
      if (!root.visible) return null;
      const target = optionRoots[index];
      const point = target?.toGlobal?.(new PIXI.Point(target.hitArea.width / 2, target.hitArea.height / 2));
      return point ? { x: point.x, y: point.y } : null;
    },
    getOfferClickPoint(index = 0) {
      if (!root.visible) return null;
      const target = offerRoots[index];
      const point = target?.toGlobal?.(new PIXI.Point(target.hitArea.width / 2, target.hitArea.height / 2));
      return point ? { x: point.x, y: point.y } : null;
    },
    getConfirmClickPoint: () => root.visible && confirmRoot?.toGlobal
      ? confirmRoot.toGlobal(new PIXI.Point(confirmRoot.hitArea.width / 2, confirmRoot.hitArea.height / 2)) : null,
    getUndoClickPoint(index = 0) {
      if (!root.visible) return null;
      const target = undoRoots[index];
      const point = target?.toGlobal?.(new PIXI.Point(target.hitArea.width / 2, target.hitArea.height / 2));
      return point ? { x: point.x, y: point.y } : null;
    },
    getSemanticSnapshot: () => {
      const decision = getDecisionPresentation?.(openNodeId, {
        previewOptionId, previewOfferId,
      });
      return {
        open: root.visible, nodeId: openNodeId,
        family: decision?.node?.family ?? null,
        selectedOptionId: decision?.nodeState?.selectedOptionId ?? null,
        resolving: decision?.nodeState?.resolving === true,
        currentPrestige: decision?.currentPrestige ?? null,
        projectedPrestige: decision?.projectedPrestige ?? null,
        mortalityEstimate: decision?.mortalityEstimate ?? null,
        offers: (decision?.offers ?? []).map((offer) => ({ label: offer.label, rule: offer.presentation?.rule ?? offerEffect(offer) })),
        purchaseOrder: (decision?.purchases ?? []).map((purchase) => purchase.offerId),
        practices: decision?.settlement?.practices ?? [],
        structures: decision?.settlement?.structures ?? [],
        contextKind: decision?.contextKind ?? null,
        regionalMap: decision?.regionalMap ?? null,
        vassalProjection: decision?.vassalProjection ?? null,
      };
    },
  };
}
