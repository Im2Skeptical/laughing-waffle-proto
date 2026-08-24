import {
  VASSAL_LIFE_MAP_NODES,
  VASSAL_NODE_FAMILIES,
} from "../defs/gamepieces/vassal-life-map-defs.js";
import {
  getAdjustedVassalPrestigeCost,
  getAdjustedVassalPhaseCost,
  getCurrentLifeMapVassal,
  getVassalAge,
  getVassalDevelopmentIncome,
  getVassalNodeDisplayState,
  getVassalPrestigeIncome,
} from "../model/vassal-life-map.js";
import { getRegionReference } from "../model/world-state.js";
import { clearChildren, createText, roundedRect } from "./settlement-view-primitives.js";
import {
  ELDER_BUST_ACCENT_TONES,
  ELDER_BUST_SKIN_TONES,
  PALETTE,
  TEXT_STYLES,
} from "./settlement-theme.js";

const MAP_RECT = Object.freeze({ x: 58, y: 88, width: 1640, height: 720 });
const PANEL_RECT = Object.freeze({ x: 1722, y: 88, width: 654, height: 720 });
const NODE_X_STEP = 142;
const NODE_RADIUS = 25;
const DOUBLE_CLICK_WINDOW_MS = 360;

function addButton(parent, rect, label, enabled, onClick, selected = false) {
  const root = new PIXI.Container();
  root.position.set(rect.x, rect.y);
  root.eventMode = enabled ? "static" : "none";
  root.cursor = enabled ? "pointer" : "default";
  root.hitArea = new PIXI.Rectangle(0, 0, rect.width, rect.height);
  root.on("pointerdown", (event) => {
    event?.stopPropagation?.();
    if (enabled) onClick?.();
  });
  const gfx = new PIXI.Graphics();
  roundedRect(
    gfx, 0, 0, rect.width, rect.height, 7,
    enabled ? (selected ? 0x47623e : 0x3f4f39) : 0x4b4945,
    enabled ? PALETTE.accent : PALETTE.stroke, selected ? 3 : 1
  );
  const text = createText(label, {
    ...TEXT_STYLES.body,
    fontSize: 16,
    fill: enabled ? PALETTE.text : PALETTE.textMuted,
    wordWrap: true,
    wordWrapWidth: rect.width - 18,
    lineHeight: 18,
  }, 9, 7);
  root.addChild(gfx, text);
  parent.addChild(root);
  return root;
}

function addActionCard(parent, rect, { title, cost, effect }, enabled, onClick, selected = false) {
  const root = new PIXI.Container();
  root.position.set(rect.x, rect.y);
  root.eventMode = enabled ? "static" : "none";
  root.cursor = enabled ? "pointer" : "default";
  root.hitArea = new PIXI.Rectangle(0, 0, rect.width, rect.height);
  root.on("pointerdown", (event) => {
    event?.stopPropagation?.();
    if (enabled) onClick?.();
  });
  const gfx = new PIXI.Graphics();
  roundedRect(
    gfx, 0, 0, rect.width, rect.height, 7,
    enabled ? (selected ? 0x47623e : 0x353b36) : 0x4b4945,
    enabled ? (selected ? PALETTE.green : PALETTE.stroke) : PALETTE.stroke,
    selected ? 3 : 1
  );
  root.addChild(
    gfx,
    createText(title, { ...TEXT_STYLES.cardTitle, fontSize: 16, wordWrap: true, wordWrapWidth: rect.width - 18, lineHeight: 18 }, 9, 8),
    createText(cost, { ...TEXT_STYLES.body, fontSize: 14, fill: PALETTE.accent, wordWrap: true, wordWrapWidth: rect.width - 18, lineHeight: 15 }, 9, 46),
    createText(effect, { ...TEXT_STYLES.body, fontSize: 14, fill: enabled ? PALETTE.textMuted : PALETTE.textMuted, wordWrap: true, wordWrapWidth: rect.width - 18, lineHeight: 15 }, 9, 99)
  );
  parent.addChild(root);
  return root;
}

function addFooterButton(parent, rect, label, enabled, onClick, selected = false) {
  const root = new PIXI.Container();
  root.position.set(rect.x, rect.y);
  root.eventMode = enabled ? "static" : "none";
  root.cursor = enabled ? "pointer" : "default";
  root.hitArea = new PIXI.Rectangle(0, 0, rect.width, rect.height);
  root.on("pointerdown", (event) => {
    event?.stopPropagation?.();
    if (enabled) onClick?.();
  });
  const gfx = new PIXI.Graphics();
  roundedRect(gfx, 0, 0, rect.width, rect.height, 7,
    enabled ? (selected ? 0x47623e : 0x3f4f39) : 0x4b4945,
    enabled ? PALETTE.accent : PALETTE.stroke, selected ? 3 : 1);
  const text = createText(label, {
    ...TEXT_STYLES.chip,
    fontSize: 13,
    fill: enabled ? PALETTE.text : PALETTE.textMuted,
    wordWrap: true,
    wordWrapWidth: rect.width - 16,
    lineHeight: 14,
  }, 8, 9);
  root.addChild(gfx, text);
  parent.addChild(root);
  return root;
}

function nodePoint(node) {
  const countAtDepth = VASSAL_LIFE_MAP_NODES.filter((entry) => entry.depth === node.depth).length;
  const top = MAP_RECT.y + 142;
  const bottom = MAP_RECT.y + MAP_RECT.height - 102;
  const fallbackY = countAtDepth <= 1 ? 0.5 : node.lane / (countAtDepth - 1);
  return {
    x: MAP_RECT.x + 76 + node.depth * NODE_X_STEP,
    y: top + (bottom - top) * (Number.isFinite(node.mapY) ? node.mapY : fallbackY),
  };
}

function stableIdHash(value) {
  let hash = 2166136261;
  for (const character of String(value ?? "vassal")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function addVassalPortrait(parent, vassal, x, y) {
  const hash = stableIdHash(vassal?.vassalId);
  const skin = ELDER_BUST_SKIN_TONES[hash % ELDER_BUST_SKIN_TONES.length];
  const accent = ELDER_BUST_ACCENT_TONES[(hash >>> 7) % ELDER_BUST_ACCENT_TONES.length];
  const portrait = new PIXI.Container();
  portrait.position.set(x, y);
  const gfx = new PIXI.Graphics();
  gfx.lineStyle(2, PALETTE.accent, 0.9);
  gfx.beginFill(PALETTE.bustBackdrop).drawCircle(0, 0, 34).endFill();
  gfx.beginFill(accent).drawRoundedRect(-25, 10, 50, 31, 15).endFill();
  gfx.beginFill(PALETTE.bustDark).drawCircle(0, -7, 17).endFill();
  gfx.beginFill(skin).drawCircle(0, -4, 14).endFill();
  gfx.beginFill(PALETTE.bustDark).drawRoundedRect(-15, -21, 30, 13, 7).endFill();
  gfx.beginFill(PALETTE.bustDark).drawCircle(-5, -4, 1.6).drawCircle(5, -4, 1.6).endFill();
  portrait.addChild(gfx);
  parent.addChild(portrait);
}

function addStatChip(parent, tooltipView, spec) {
  const root = new PIXI.Container();
  root.position.set(spec.x, spec.y);
  root.eventMode = "static";
  root.cursor = "help";
  root.hitArea = new PIXI.Rectangle(0, 0, spec.width, spec.height);
  root.on("pointerover", () => tooltipView?.show?.({
    title: spec.label,
    lines: spec.tooltipLines,
  }, root.getBounds()));
  root.on("pointerout", () => tooltipView?.hide?.());
  const gfx = new PIXI.Graphics();
  roundedRect(gfx, 0, 0, spec.width, spec.height, 6, 0x3a403b, spec.color, 1.5);
  gfx.beginFill(spec.color, 0.95).drawCircle(17, 17, 10).endFill();
  root.addChild(
    gfx,
    createText(spec.abbrev, { ...TEXT_STYLES.chip, fontSize: 9, fill: PALETTE.black }, 17, 17, 0.5, 0.5),
    createText(spec.label.toUpperCase(), { ...TEXT_STYLES.chip, fontSize: 11, fill: PALETTE.textMuted }, 33, 7),
    createText(String(spec.value ?? 0), { ...TEXT_STYLES.title, fontSize: 23, fill: spec.color }, 33, 20),
    createText(spec.summary, { ...TEXT_STYLES.body, fontSize: 11, fill: PALETTE.textMuted }, 68, 29)
  );
  parent.addChild(root);
}

function formatAdjustedCost(vassal, { prestigeCost = 0, phaseCost = 0 } = {}) {
  const prestigeBase = Math.max(0, prestigeCost);
  const phaseBase = Math.max(0, phaseCost);
  const prestige = getAdjustedVassalPrestigeCost(vassal, prestigeBase);
  const phases = getAdjustedVassalPhaseCost(vassal, phaseBase);
  const costs = [];
  if (prestigeBase > 0) {
    costs.push(prestige === prestigeBase
      ? `${prestige} Prestige`
      : `${prestige} Prestige (base ${prestigeBase})`);
  }
  if (phaseBase > 0) {
    costs.push(phases === phaseBase
      ? `${phases} ${phases === 1 ? "Phase" : "Phases"}`
      : `${phases} ${phases === 1 ? "Phase" : "Phases"} (base ${phaseBase})`);
  }
  return costs.length ? `Cost: ${costs.join(" · ")}` : "Cost: No Prestige or Phases";
}

function formatOptionEffect(option) {
  const effects = [];
  let hasNegativeEffect = false;
  if (Number.isFinite(option?.prestigeDelta) && option.prestigeDelta !== 0) {
    hasNegativeEffect ||= option.prestigeDelta < 0;
    effects.push(`${option.prestigeDelta > 0 ? "+" : ""}${option.prestigeDelta} Prestige`);
  }
  if (option?.statId && Number.isFinite(option?.statDelta) && option.statDelta !== 0) {
    hasNegativeEffect ||= option.statDelta < 0;
    effects.push(`${option.statDelta > 0 ? "+" : ""}${option.statDelta} ${option.statId[0].toUpperCase()}${option.statId.slice(1)}`);
  }
  if (option?.locationRegionId) effects.push("Move to the target settlement");
  if (option?.forcedRelocation) effects.push("Relocate to a safe player settlement");
  if (Number.isFinite(option?.legacyStartingPrestigeBonus)) {
    effects.push(`Future candidates: +${option.legacyStartingPrestigeBonus} starting Prestige`);
  }
  if (Number.isFinite(option?.immediateDeathChance)) {
    effects.push(`${Math.round(option.immediateDeathChance * 100)}% immediate death risk`);
  }
  return effects.length
    ? `${hasNegativeEffect ? "Effect" : "Gain"}: ${effects.join(" · ")}`
    : "Effect: Apply this choice on resolution";
}

function getNode(nodeId) {
  return VASSAL_LIFE_MAP_NODES.find((entry) => entry.id === nodeId) ?? null;
}

export function createVassalLifeMapView({
  layer,
  getState,
  isVisible,
  onEnterNode,
  onSelectOption,
  onPurchaseOffer,
  onRerollShop,
  onConfirmNode,
  onChooseDevelopmentStat,
  tooltipView,
} = {}) {
  const root = new PIXI.Container();
  root.zIndex = 10;
  layer?.addChild(root);
  let signature = "";
  const nodeRoots = new Map();
  let optionRoots = [];
  let offerRoots = [];
  let rerollRoot = null;
  let enterNodeRoot = null;
  let confirmRoot = null;
  let inspectedNodeId = null;
  let hoveredNodeId = null;
  let lastNodeClick = { nodeId: null, atMs: 0 };

  function inspectNode(nodeId, display) {
    const nowMs = performance.now();
    const doubleClicked = display.available &&
      lastNodeClick.nodeId === nodeId &&
      nowMs - lastNodeClick.atMs <= DOUBLE_CLICK_WINDOW_MS;
    lastNodeClick = { nodeId, atMs: nowMs };
    inspectedNodeId = nodeId;
    if (doubleClicked) {
      onEnterNode?.(nodeId);
      return;
    }
    render(true);
  }

  function render(force = false) {
    const visible = isVisible?.() === true;
    root.visible = visible;
    if (!visible) {
      tooltipView?.hide?.();
      signature = "";
      clearChildren(root);
      return;
    }
    const state = getState?.();
    const vassal = getCurrentLifeMapVassal(state);
    const activeNodeId = vassal?.lifeMap?.currentNodeId ?? null;
    const effectiveInspectedNodeId = hoveredNodeId ?? inspectedNodeId ?? activeNodeId ?? vassal?.lifeMap?.availableNodeIds?.[0] ?? null;
    const nextSignature = JSON.stringify({ tSec: state?.tSec, vassal, effectiveInspectedNodeId, hoveredNodeId });
    if (!force && nextSignature === signature) return;
    signature = nextSignature;
    clearChildren(root);
    nodeRoots.clear();
    optionRoots = [];
    offerRoots = [];
    rerollRoot = null;
    enterNodeRoot = null;
    confirmRoot = null;
    if (!vassal) return;

    const bg = new PIXI.Graphics();
    roundedRect(bg, MAP_RECT.x, MAP_RECT.y, MAP_RECT.width, MAP_RECT.height, 10,
      PALETTE.panel, PALETTE.stroke, 2);
    roundedRect(bg, PANEL_RECT.x, PANEL_RECT.y, PANEL_RECT.width, PANEL_RECT.height, 10,
      PALETTE.panel, PALETTE.accent, 2);
    root.addChild(bg);
    root.addChild(createText("VASSAL LIFE MAP", { ...TEXT_STYLES.header, fontSize: 22 },
      MAP_RECT.x + 22, MAP_RECT.y + 22));
    root.addChild(createText("Hover to inspect. Click to pin. Double-click an available node to enter it.", {
      ...TEXT_STYLES.body, fontSize: 15, fill: PALETTE.textMuted,
    }, MAP_RECT.x + 250, MAP_RECT.y + 26));
    root.addChild(createText("EARLY", TEXT_STYLES.body, MAP_RECT.x + 40, MAP_RECT.y + 60));
    root.addChild(createText("MID", TEXT_STYLES.body, MAP_RECT.x + 478, MAP_RECT.y + 60));
    root.addChild(createText("LATE", TEXT_STYLES.body, MAP_RECT.x + 900, MAP_RECT.y + 60));
    root.addChild(createText("DEEP / LEGACY", TEXT_STYLES.body, MAP_RECT.x + 1318, MAP_RECT.y + 60));

    const completedNodeIds = vassal.lifeMap.completedNodeIds ?? [];
    const completedEdges = new Set(completedNodeIds.slice(1).map(
      (nodeId, index) => `${completedNodeIds[index]}:${nodeId}`
    ));
    const edges = new PIXI.Graphics();
    for (const node of VASSAL_LIFE_MAP_NODES) {
      const from = nodePoint(node);
      for (const nextId of node.outgoingNodeIds) {
        const nextNode = getNode(nextId);
        if (!nextNode) continue;
        const to = nodePoint(nextNode);
        const completed = completedEdges.has(`${node.id}:${nextId}`);
        edges.lineStyle(completed ? 5 : 3, completed ? 0x87c96a : PALETTE.stroke, completed ? 1 : 0.75);
        edges.moveTo(from.x, from.y);
        edges.lineTo(to.x, to.y);
      }
    }
    root.addChild(edges);

    for (const node of VASSAL_LIFE_MAP_NODES) {
      const display = getVassalNodeDisplayState(state, node.id);
      const point = nodePoint(node);
      const family = VASSAL_NODE_FAMILIES[node.family] ?? {};
      const nodeRoot = new PIXI.Container();
      nodeRoot.position.set(point.x, point.y);
      nodeRoot.eventMode = "static";
      nodeRoot.cursor = "pointer";
      nodeRoot.hitArea = new PIXI.Circle(0, 0, NODE_RADIUS + 8);
      nodeRoot.on("pointerdown", (event) => {
        event?.stopPropagation?.();
        inspectNode(node.id, display);
      });
      nodeRoot.on("pointerover", () => {
        if (hoveredNodeId === node.id) return;
        hoveredNodeId = node.id;
        render(true);
      });
      nodeRoot.on("pointerout", () => {
        if (hoveredNodeId !== node.id) return;
        hoveredNodeId = null;
        render(true);
      });
      const selected = effectiveInspectedNodeId === node.id;
      const circle = new PIXI.Graphics();
      const fillAlpha = display.current || display.available ? 1 : display.completed ? 0.68 : 0.38;
      circle.lineStyle(
        selected || display.current || display.available || display.completed ? 4 : 2,
        selected ? 0xf4e7bd : display.completed ? 0x87c96a : display.current || display.available ? PALETTE.accent : PALETTE.stroke,
        1
      );
      circle.beginFill(family.color ?? 0x494641, fillAlpha).drawCircle(0, 0, NODE_RADIUS).endFill();
      const glyph = createText(family.glyph ?? "?", {
        ...TEXT_STYLES.title,
        fontSize: node.family === "practiceReform" || node.family === "publicWorks" ? 12 : 16,
      }, 0, 0, 0.5, 0.5);
      nodeRoot.addChild(circle, glyph);
      root.addChild(nodeRoot);
      nodeRoots.set(node.id, nodeRoot);
    }
    Object.values(VASSAL_NODE_FAMILIES).forEach((family, index) => {
      root.addChild(createText(`${family.glyph}  ${family.label}`, {
        ...TEXT_STYLES.body, fontSize: 14, fill: family.color ?? PALETTE.textMuted,
      }, MAP_RECT.x + 36 + index * 196, MAP_RECT.y + MAP_RECT.height - 38));
    });

    const location = getRegionReference(state, vassal.locationRegionId) ?? vassal.locationRegionId;
    const stats = vassal.stats ?? {};
    const px = PANEL_RECT.x + 22;
    const cards = new PIXI.Graphics();
    roundedRect(cards, px, PANEL_RECT.y + 18, PANEL_RECT.width - 44, 94, 8, 0x343a34, PALETTE.stroke, 1);
    roundedRect(cards, px, PANEL_RECT.y + 124, PANEL_RECT.width - 44, 116, 8, 0x303633, PALETTE.stroke, 1);
    roundedRect(cards, px, PANEL_RECT.y + 250, PANEL_RECT.width - 44, 94, 8, 0x343a34, PALETTE.stroke, 1);
    roundedRect(cards, px, PANEL_RECT.y + 354, PANEL_RECT.width - 44, PANEL_RECT.height - 376, 8, 0x2c312e, PALETTE.accent, 1);
    root.addChild(cards);
    addVassalPortrait(root, vassal, PANEL_RECT.x + PANEL_RECT.width - 76, PANEL_RECT.y + 64);
    root.addChild(
      createText("VASSAL", { ...TEXT_STYLES.chip, fontSize: 14, fill: PALETTE.textMuted }, px + 14, PANEL_RECT.y + 30),
      createText(`Age ${getVassalAge(state, vassal)}`, { ...TEXT_STYLES.header, fontSize: 22 }, px + 14, PANEL_RECT.y + 50),
      createText(location, { ...TEXT_STYLES.body, fontSize: 15, fill: PALETTE.textMuted, wordWrap: true, wordWrapWidth: PANEL_RECT.width - 190 }, px + 14, PANEL_RECT.y + 76),
      createText(`Prestige  ${vassal.prestige}`, { ...TEXT_STYLES.title, fontSize: 19, fill: PALETTE.accent }, px + 14, PANEL_RECT.y + 88),
      createText("ATTRIBUTES · HOVER FOR DETAILS", { ...TEXT_STYLES.chip, fontSize: 13, fill: PALETTE.textMuted }, px + 14, PANEL_RECT.y + 136),
      createText("NODE ECONOMY", { ...TEXT_STYLES.chip, fontSize: 14, fill: PALETTE.textMuted }, px + 14, PANEL_RECT.y + 260),
      createText(`Prestige income: +${getVassalPrestigeIncome(vassal)} per completion`, { ...TEXT_STYLES.body, fontSize: 16 }, px + 14, PANEL_RECT.y + 282),
      createText(`EXP income: +${getVassalDevelopmentIncome(vassal)} per completion`, { ...TEXT_STYLES.body, fontSize: 16 }, px + 14, PANEL_RECT.y + 304),
      createText(`EXP ${vassal.developmentProgress}/10${vassal.pendingDevelopmentChoices ? ` · ${vassal.pendingDevelopmentChoices} choice` : ""}`,
        { ...TEXT_STYLES.body, fontSize: 16 }, px + 14, PANEL_RECT.y + 324)
    );
    const statWidth = (PANEL_RECT.width - 86) / 2;
    [
      { abbrev: "CUN", label: "Cunning", value: stats.cunning, summary: "+ Prestige", color: 0xc58b5b,
        tooltipLines: ["Adds +1 Prestige income for each completed node."] },
      { abbrev: "WIS", label: "Wisdom", value: stats.wisdom, summary: "+ EXP", color: 0x6ca6d7,
        tooltipLines: ["Adds +1 EXP income for each completed node."] },
      { abbrev: "EFF", label: "Effectiveness", value: stats.effectiveness, summary: "-8% Phases", color: 0x7faf6d,
        tooltipLines: ["Reduces Phase costs by 8% per point, up to 60%.", "Costs round up and never fall below 1 Phase."] },
      { abbrev: "INT", label: "Intelligence", value: stats.intelligence, summary: "-8% Prestige", color: 0xaf87cf,
        tooltipLines: ["Reduces Prestige costs by 8% per point, up to 60%."] },
    ].forEach((stat, index) => {
      addStatChip(root, tooltipView, {
        ...stat,
        x: px + 14 + (index % 2) * (statWidth + 10),
        y: PANEL_RECT.y + 154 + Math.floor(index / 2) * 42,
        width: statWidth,
        height: 42,
      });
    });

    const inspectedNode = getNode(effectiveInspectedNodeId);
    const inspectedDisplay = inspectedNode ? getVassalNodeDisplayState(state, inspectedNode.id) : null;
    const inspectedFamily = inspectedNode ? VASSAL_NODE_FAMILIES[inspectedNode.family] : null;
    if (!inspectedNode || !inspectedFamily) return;

    root.addChild(
      createText(inspectedFamily.label, { ...TEXT_STYLES.header, fontSize: 21, fill: inspectedFamily.color }, px + 14, PANEL_RECT.y + 370),
      createText(inspectedFamily.description, {
        ...TEXT_STYLES.body, fontSize: 17, fill: PALETTE.textMuted, wordWrap: true,
        wordWrapWidth: PANEL_RECT.width - 72, lineHeight: 19,
      }, px + 14, PANEL_RECT.y + 398)
    );

    if (vassal.pendingDevelopmentChoices > 0) {
      root.addChild(createText("Spend your EXP choice before entering the next node.", {
        ...TEXT_STYLES.body, fontSize: 15, fill: PALETTE.accent, wordWrap: true, wordWrapWidth: PANEL_RECT.width - 72,
      }, px + 14, PANEL_RECT.y + 434));
      ["cunning", "effectiveness", "intelligence"].forEach((statId, index) => {
        addButton(root, { x: px + 14, y: PANEL_RECT.y + 474 + index * 50, width: PANEL_RECT.width - 72, height: 42 },
          `Gain: +1 ${statId[0].toUpperCase()}${statId.slice(1)}`, true, () => onChooseDevelopmentStat?.(statId));
      });
      return;
    }

    const nodeState = activeNodeId ? vassal.lifeMap.nodeStates[activeNodeId] : null;
    if (!nodeState) {
      if (inspectedDisplay?.available) {
        root.addChild(createText("This node is ready to enter. Its choices will be revealed once entered.", {
          ...TEXT_STYLES.body, fontSize: 15, fill: PALETTE.textMuted, wordWrap: true, wordWrapWidth: PANEL_RECT.width - 72,
        }, px + 14, PANEL_RECT.y + 440));
        enterNodeRoot = addButton(root, { x: px + 14, y: PANEL_RECT.y + 494, width: PANEL_RECT.width - 72, height: 46 },
          `ENTER ${inspectedFamily.label.toUpperCase()} NODE`, true, () => onEnterNode?.(inspectedNode.id));
      } else {
        root.addChild(createText(inspectedDisplay?.completed
          ? "Completed. Follow its outgoing paths through the map."
          : "Locked. Complete a connected available node to unlock this path.", {
          ...TEXT_STYLES.body, fontSize: 15, fill: PALETTE.textMuted, wordWrap: true, wordWrapWidth: PANEL_RECT.width - 72,
        }, px + 14, PANEL_RECT.y + 440));
      }
      return;
    }

    if (inspectedNode.id !== activeNodeId) {
      root.addChild(createText("Another node is active. Inspect it again to make its choices and resolve it.", {
        ...TEXT_STYLES.body, fontSize: 15, fill: PALETTE.textMuted, wordWrap: true, wordWrapWidth: PANEL_RECT.width - 72,
      }, px + 14, PANEL_RECT.y + 440));
      return;
    }

    root.addChild(createText(`Committed on confirmation: ${nodeState.accumulatedPhaseCost} ${nodeState.accumulatedPhaseCost === 1 ? "Phase" : "Phases"}`,
      { ...TEXT_STYLES.body, fontSize: 14, fill: PALETTE.textMuted }, px + 14, PANEL_RECT.y + 434));
    if (nodeState.resolving) {
      const pending = vassal.lifeMap.pendingResolution;
      root.addChild(createText(
        `RESOLVING · advancing ${pending?.phaseCost ?? 0} Phases`,
        { ...TEXT_STYLES.header, fill: PALETTE.accent, fontSize: 18 }, px + 14, PANEL_RECT.y + 470
      ));
      return;
    }

    const actionX = px + 14;
    const actionWidth = PANEL_RECT.width - 72;
    const actionGap = 10;
    const cardWidth = (actionWidth - actionGap * 2) / 3;
    const cardY = PANEL_RECT.y + 462;
    const cardHeight = 164;
    const footerY = cardY + cardHeight + 12;
    const isShop = ["practiceReform", "publicWorks", "routes"].includes(nodeState.family);
    if (!isShop && nodeState.options.length) {
      optionRoots = nodeState.options.map((option, index) => {
        const enabled = getAdjustedVassalPrestigeCost(vassal, option.prestigeCost ?? 0) <= vassal.prestige;
        return addActionCard(root, {
          x: actionX + index * (cardWidth + actionGap), y: cardY, width: cardWidth, height: cardHeight,
        }, {
          title: option.label,
          cost: formatAdjustedCost(vassal, option),
          effect: formatOptionEffect(option),
        }, enabled, () => onSelectOption?.(activeNodeId, option.id), nodeState.selectedOptionId === option.id);
      });
    } else if (isShop) {
      offerRoots = nodeState.inventory.map((offer, index) => {
        const cost = getAdjustedVassalPrestigeCost(vassal, offer.basePrestigeCost);
        return addActionCard(root, {
          x: actionX + index * (cardWidth + actionGap), y: cardY, width: cardWidth, height: cardHeight,
        }, {
          title: offer.label,
          cost: formatAdjustedCost(vassal, { prestigeCost: offer.basePrestigeCost, phaseCost: offer.basePhaseCost }),
          effect: "Effect: Applied when this node resolves.",
        }, cost <= vassal.prestige, () => onPurchaseOffer?.(activeNodeId, offer.offerId));
      });
      const rerollCost = getAdjustedVassalPrestigeCost(vassal, 6);
      rerollRoot = addFooterButton(root, { x: actionX, y: footerY, width: (actionWidth - actionGap) / 2, height: 50 },
        nodeState.rerollUsed
          ? "REROLL USED"
          : `REROLL OFFERS\n${formatAdjustedCost(vassal, { prestigeCost: 6, phaseCost: 60 })}`,
        !nodeState.rerollUsed && rerollCost <= vassal.prestige, () => onRerollShop?.(activeNodeId));
    } else {
      root.addChild(createText("No choices are currently available for this node.", {
        ...TEXT_STYLES.body, fontSize: 16, fill: PALETTE.textMuted,
      }, actionX, cardY));
    }
    const canConfirm = isShop || !!nodeState.selectedOptionId;
    confirmRoot = addFooterButton(root, {
      x: isShop ? actionX + (actionWidth + actionGap) / 2 : actionX,
      y: footerY,
      width: isShop ? (actionWidth - actionGap) / 2 : actionWidth,
      height: 50,
    }, "CONFIRM & RESOLVE", canConfirm, () => onConfirmNode?.(activeNodeId));
  }

  return {
    init: () => render(true),
    update: () => render(),
    refresh: () => render(true),
    setVisible: (visible) => { root.visible = visible === true; },
    getNodeClickPoint(nodeId) {
      const target = nodeRoots.get(nodeId);
      const point = target?.toGlobal?.(new PIXI.Point(0, 0));
      return point ? { x: point.x, y: point.y } : null;
    },
    getEnterNodeClickPoint: () => enterNodeRoot?.toGlobal
      ? enterNodeRoot.toGlobal(new PIXI.Point(enterNodeRoot.hitArea.width / 2, enterNodeRoot.hitArea.height / 2)) : null,
    getOptionClickPoint(index = 0) {
      const target = optionRoots[index];
      const point = target?.toGlobal?.(new PIXI.Point(target.hitArea.width / 2, target.hitArea.height / 2));
      return point ? { x: point.x, y: point.y } : null;
    },
    getOfferClickPoint(index = 0) {
      const target = offerRoots[index];
      const point = target?.toGlobal?.(new PIXI.Point(target.hitArea.width / 2, target.hitArea.height / 2));
      return point ? { x: point.x, y: point.y } : null;
    },
    getRerollClickPoint: () => rerollRoot?.toGlobal
      ? rerollRoot.toGlobal(new PIXI.Point(rerollRoot.hitArea.width / 2, rerollRoot.hitArea.height / 2)) : null,
    getConfirmClickPoint: () => confirmRoot?.toGlobal
      ? confirmRoot.toGlobal(new PIXI.Point(confirmRoot.hitArea.width / 2, confirmRoot.hitArea.height / 2)) : null,
  };
}
