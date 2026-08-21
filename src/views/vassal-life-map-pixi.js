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
import { PALETTE, TEXT_STYLES } from "./settlement-theme.js";

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

function nodePoint(node) {
  const countAtDepth = VASSAL_LIFE_MAP_NODES.filter((entry) => entry.depth === node.depth).length;
  const top = MAP_RECT.y + 142;
  const bottom = MAP_RECT.y + MAP_RECT.height - 102;
  return {
    x: MAP_RECT.x + 76 + node.depth * NODE_X_STEP,
    y: countAtDepth <= 1 ? (top + bottom) * 0.5 : top + (bottom - top) * node.lane / (countAtDepth - 1),
  };
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
    roundedRect(cards, px, PANEL_RECT.y + 18, PANEL_RECT.width - 44, 72, 8, 0x343a34, PALETTE.stroke, 1);
    roundedRect(cards, px, PANEL_RECT.y + 100, PANEL_RECT.width - 44, 102, 8, 0x303633, PALETTE.stroke, 1);
    roundedRect(cards, px, PANEL_RECT.y + 212, PANEL_RECT.width - 44, 104, 8, 0x343a34, PALETTE.stroke, 1);
    roundedRect(cards, px, PANEL_RECT.y + 326, PANEL_RECT.width - 44, PANEL_RECT.height - 348, 8, 0x2c312e, PALETTE.accent, 1);
    root.addChild(cards);
    root.addChild(
      createText("VASSAL", { ...TEXT_STYLES.chip, fontSize: 14, fill: PALETTE.textMuted }, px + 14, PANEL_RECT.y + 30),
      createText(`Age ${getVassalAge(state, vassal)} · ${location}`, { ...TEXT_STYLES.header, fontSize: 20 }, px + 14, PANEL_RECT.y + 50),
      createText(`Prestige ${vassal.prestige}`, { ...TEXT_STYLES.title, fontSize: 19, fill: PALETTE.accent }, px + 14, PANEL_RECT.y + 72),
      createText("ATTRIBUTES", { ...TEXT_STYLES.chip, fontSize: 14, fill: PALETTE.textMuted }, px + 14, PANEL_RECT.y + 112),
      createText(`Cunning  ${stats.cunning}     Wisdom  ${stats.wisdom}`, { ...TEXT_STYLES.body, fontSize: 18 }, px + 14, PANEL_RECT.y + 138),
      createText(`Effectiveness  ${stats.effectiveness}     Intelligence  ${stats.intelligence}`, { ...TEXT_STYLES.body, fontSize: 18 }, px + 14, PANEL_RECT.y + 166),
      createText("NODE ECONOMY", { ...TEXT_STYLES.chip, fontSize: 14, fill: PALETTE.textMuted }, px + 14, PANEL_RECT.y + 224),
      createText(`Prestige income: +${getVassalPrestigeIncome(vassal)} per completion`, { ...TEXT_STYLES.body, fontSize: 17 }, px + 14, PANEL_RECT.y + 248),
      createText(`Development income: +${getVassalDevelopmentIncome(vassal)} per completion`, { ...TEXT_STYLES.body, fontSize: 17 }, px + 14, PANEL_RECT.y + 272),
      createText(`Development ${vassal.developmentProgress}/10${vassal.pendingDevelopmentChoices ? ` · ${vassal.pendingDevelopmentChoices} choice` : ""}`,
        { ...TEXT_STYLES.body, fontSize: 17 }, px + 14, PANEL_RECT.y + 294)
    );

    const inspectedNode = getNode(effectiveInspectedNodeId);
    const inspectedDisplay = inspectedNode ? getVassalNodeDisplayState(state, inspectedNode.id) : null;
    const inspectedFamily = inspectedNode ? VASSAL_NODE_FAMILIES[inspectedNode.family] : null;
    if (!inspectedNode || !inspectedFamily) return;

    root.addChild(
      createText(inspectedFamily.label, { ...TEXT_STYLES.header, fontSize: 21, fill: inspectedFamily.color }, px + 14, PANEL_RECT.y + 342),
      createText(inspectedFamily.description, {
        ...TEXT_STYLES.body, fontSize: 17, fill: PALETTE.textMuted, wordWrap: true,
        wordWrapWidth: PANEL_RECT.width - 72, lineHeight: 19,
      }, px + 14, PANEL_RECT.y + 370)
    );

    if (vassal.pendingDevelopmentChoices > 0) {
      root.addChild(createText("Spend your development choice before entering the next node.", {
        ...TEXT_STYLES.body, fontSize: 15, fill: PALETTE.accent, wordWrap: true, wordWrapWidth: PANEL_RECT.width - 72,
      }, px + 14, PANEL_RECT.y + 414));
      ["cunning", "effectiveness", "intelligence"].forEach((statId, index) => {
        addButton(root, { x: px + 14, y: PANEL_RECT.y + 454 + index * 50, width: PANEL_RECT.width - 72, height: 42 },
          `Gain: +1 ${statId[0].toUpperCase()}${statId.slice(1)}`, true, () => onChooseDevelopmentStat?.(statId));
      });
      return;
    }

    const nodeState = activeNodeId ? vassal.lifeMap.nodeStates[activeNodeId] : null;
    if (!nodeState) {
      if (inspectedDisplay?.available) {
        root.addChild(createText("This node is ready to enter. Its choices will be revealed once entered.", {
          ...TEXT_STYLES.body, fontSize: 15, fill: PALETTE.textMuted, wordWrap: true, wordWrapWidth: PANEL_RECT.width - 72,
        }, px + 14, PANEL_RECT.y + 420));
        enterNodeRoot = addButton(root, { x: px + 14, y: PANEL_RECT.y + 474, width: PANEL_RECT.width - 72, height: 46 },
          `ENTER ${inspectedFamily.label.toUpperCase()} NODE`, true, () => onEnterNode?.(inspectedNode.id));
      } else {
        root.addChild(createText(inspectedDisplay?.completed
          ? "Completed. Follow its outgoing paths through the map."
          : "Locked. Complete a connected available node to unlock this path.", {
          ...TEXT_STYLES.body, fontSize: 15, fill: PALETTE.textMuted, wordWrap: true, wordWrapWidth: PANEL_RECT.width - 72,
        }, px + 14, PANEL_RECT.y + 420));
      }
      return;
    }

    if (inspectedNode.id !== activeNodeId) {
      root.addChild(createText("Another node is active. Inspect it again to make its choices and resolve it.", {
        ...TEXT_STYLES.body, fontSize: 15, fill: PALETTE.textMuted, wordWrap: true, wordWrapWidth: PANEL_RECT.width - 72,
      }, px + 14, PANEL_RECT.y + 420));
      return;
    }

    root.addChild(createText(`Committed on confirmation: ${nodeState.accumulatedPhaseCost} ${nodeState.accumulatedPhaseCost === 1 ? "Phase" : "Phases"}`,
      { ...TEXT_STYLES.body, fontSize: 14, fill: PALETTE.textMuted }, px + 14, PANEL_RECT.y + 414));
    if (nodeState.resolving) {
      const pending = vassal.lifeMap.pendingResolution;
      root.addChild(createText(
        `RESOLVING · advancing ${pending?.phaseCost ?? 0} Phases`,
        { ...TEXT_STYLES.header, fill: PALETTE.accent, fontSize: 18 }, px + 14, PANEL_RECT.y + 450
      ));
      return;
    }

    let y = PANEL_RECT.y + 440;
    const isShop = ["practiceReform", "publicWorks", "routes"].includes(nodeState.family);
    if (!isShop && nodeState.options.length) {
      optionRoots = nodeState.options.map((option, index) => {
        const enabled = getAdjustedVassalPrestigeCost(vassal, option.prestigeCost ?? 0) <= vassal.prestige;
        return addButton(root, { x: px + 14, y: y + index * 66, width: PANEL_RECT.width - 72, height: 62 },
          `${option.label}\n${formatAdjustedCost(vassal, option)}\n${formatOptionEffect(option)}`, enabled,
          () => onSelectOption?.(activeNodeId, option.id), nodeState.selectedOptionId === option.id);
      });
      y += nodeState.options.length * 66 + 4;
    } else if (isShop) {
      offerRoots = nodeState.inventory.map((offer, index) => {
        const cost = getAdjustedVassalPrestigeCost(vassal, offer.basePrestigeCost);
        return addButton(root, { x: px + 14, y: y + index * 58, width: PANEL_RECT.width - 72, height: 56 },
          `${offer.label}\n${formatAdjustedCost(vassal, { prestigeCost: offer.basePrestigeCost, phaseCost: offer.basePhaseCost })}\nEffect: Applied when this node resolves`,
          cost <= vassal.prestige, () => onPurchaseOffer?.(activeNodeId, offer.offerId));
      });
      y += nodeState.inventory.length * 58 + 4;
      const rerollCost = getAdjustedVassalPrestigeCost(vassal, 6);
      rerollRoot = addButton(root, { x: px + 14, y, width: PANEL_RECT.width - 72, height: 46 },
        nodeState.rerollUsed
          ? "REROLL USED"
          : `Reroll remaining offers\n${formatAdjustedCost(vassal, { prestigeCost: 6, phaseCost: 60 })}`,
        !nodeState.rerollUsed && rerollCost <= vassal.prestige, () => onRerollShop?.(activeNodeId));
      y += 50;
    } else {
      root.addChild(createText("No choices are currently available for this node.", {
        ...TEXT_STYLES.body, fontSize: 16, fill: PALETTE.textMuted,
      }, px + 14, y));
      y += 52;
    }
    const canConfirm = isShop || !!nodeState.selectedOptionId;
    confirmRoot = addButton(root, { x: px + 14, y: Math.min(PANEL_RECT.y + PANEL_RECT.height - 56, y), width: PANEL_RECT.width - 72, height: 42 },
      "CONFIRM & RESOLVE NODE", canConfirm, () => onConfirmNode?.(activeNodeId));
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
