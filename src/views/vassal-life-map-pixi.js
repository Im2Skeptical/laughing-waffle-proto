import {
  VASSAL_LIFE_MAP_NODES,
  VASSAL_NODE_FAMILIES,
} from "../defs/gamepieces/vassal-life-map-defs.js";
import {
  getAdjustedVassalPrestigeCost,
  getAdjustedVassalYearCost,
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
const NODE_Y_STEP = 142;
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
    fontSize: 15,
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
  return {
    x: MAP_RECT.x + 76 + node.depth * NODE_X_STEP,
    y: MAP_RECT.y + 126 + node.lane * NODE_Y_STEP,
  };
}

function formatAdjustedCost(vassal, { prestigeCost = 0, yearCost = 0 } = {}) {
  const prestigeBase = Math.max(0, prestigeCost);
  const yearBase = Math.max(0, yearCost);
  const prestige = getAdjustedVassalPrestigeCost(vassal, prestigeBase);
  const years = getAdjustedVassalYearCost(vassal, yearBase);
  const costs = [];
  if (prestigeBase > 0) {
    costs.push(prestige === prestigeBase
      ? `${prestige} Prestige`
      : `${prestige} Prestige (base ${prestigeBase})`);
  }
  if (yearBase > 0) {
    costs.push(years === yearBase
      ? `${years} ${years === 1 ? "Year" : "Years"}`
      : `${years} ${years === 1 ? "Year" : "Years"} (base ${yearBase})`);
  }
  return costs.length ? `Cost: ${costs.join(" · ")}` : "Cost: No time or Prestige";
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
  onReturnWorld,
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
    const effectiveInspectedNodeId = inspectedNodeId ?? activeNodeId ?? vassal?.lifeMap?.availableNodeIds?.[0] ?? null;
    const nextSignature = JSON.stringify({ tSec: state?.tSec, vassal, effectiveInspectedNodeId });
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
    root.addChild(createText("Click any node to inspect it. Double-click an available node to enter it.", {
      ...TEXT_STYLES.body, fontSize: 15, fill: PALETTE.textMuted,
    }, MAP_RECT.x + 250, MAP_RECT.y + 26));
    root.addChild(createText("EARLY", TEXT_STYLES.body, MAP_RECT.x + 40, MAP_RECT.y + 60));
    root.addChild(createText("MID", TEXT_STYLES.body, MAP_RECT.x + 478, MAP_RECT.y + 60));
    root.addChild(createText("LATE", TEXT_STYLES.body, MAP_RECT.x + 900, MAP_RECT.y + 60));
    root.addChild(createText("DEEP / LEGACY", TEXT_STYLES.body, MAP_RECT.x + 1318, MAP_RECT.y + 60));

    const edges = new PIXI.Graphics();
    edges.lineStyle(3, PALETTE.stroke, 0.75);
    for (const node of VASSAL_LIFE_MAP_NODES) {
      const from = nodePoint(node);
      for (const nextId of node.outgoingNodeIds) {
        const nextNode = getNode(nextId);
        if (!nextNode) continue;
        const to = nodePoint(nextNode);
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
      const selected = effectiveInspectedNodeId === node.id;
      const circle = new PIXI.Graphics();
      const fillAlpha = display.current || display.available ? 1 : display.completed ? 0.68 : 0.38;
      circle.lineStyle(
        selected || display.current || display.available ? 4 : 2,
        selected ? 0xf4e7bd : display.current || display.available ? PALETTE.accent : PALETTE.stroke,
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
    root.addChild(
      createText(`Age ${getVassalAge(state, vassal)} · ${location}`, { ...TEXT_STYLES.header, fontSize: 20 }, px, PANEL_RECT.y + 22),
      createText(`Prestige ${vassal.prestige}`, { ...TEXT_STYLES.title, fontSize: 18, fill: PALETTE.accent }, px, PANEL_RECT.y + 56),
      createText(`Cunning ${stats.cunning} · Wisdom ${stats.wisdom}`, { ...TEXT_STYLES.body, fontSize: 16 }, px, PANEL_RECT.y + 90),
      createText(`Effectiveness ${stats.effectiveness} · Intelligence ${stats.intelligence}`, { ...TEXT_STYLES.body, fontSize: 16 }, px, PANEL_RECT.y + 118),
      createText(`Prestige per node completion: ${getVassalPrestigeIncome(vassal)}`, { ...TEXT_STYLES.body, fontSize: 16 }, px, PANEL_RECT.y + 154),
      createText(`Development per node completion: ${getVassalDevelopmentIncome(vassal)}`, { ...TEXT_STYLES.body, fontSize: 16 }, px, PANEL_RECT.y + 180),
      createText(`Development ${vassal.developmentProgress}/10${vassal.pendingDevelopmentChoices ? ` · ${vassal.pendingDevelopmentChoices} choice` : ""}`,
        { ...TEXT_STYLES.body, fontSize: 16 }, px, PANEL_RECT.y + 206)
    );
    addButton(root, { x: PANEL_RECT.x + PANEL_RECT.width - 150, y: PANEL_RECT.y + 18, width: 126, height: 34 },
      "WORLD MAP", true, onReturnWorld);

    const inspectedNode = getNode(effectiveInspectedNodeId);
    const inspectedDisplay = inspectedNode ? getVassalNodeDisplayState(state, inspectedNode.id) : null;
    const inspectedFamily = inspectedNode ? VASSAL_NODE_FAMILIES[inspectedNode.family] : null;
    if (!inspectedNode || !inspectedFamily) return;

    root.addChild(
      createText(inspectedFamily.label, { ...TEXT_STYLES.header, fontSize: 19, fill: inspectedFamily.color }, px, PANEL_RECT.y + 250),
      createText(inspectedFamily.description, {
        ...TEXT_STYLES.body, fontSize: 16, fill: PALETTE.textMuted, wordWrap: true,
        wordWrapWidth: PANEL_RECT.width - 44, lineHeight: 19,
      }, px, PANEL_RECT.y + 278)
    );

    if (vassal.pendingDevelopmentChoices > 0) {
      root.addChild(createText("Spend your development choice before entering the next node.", {
        ...TEXT_STYLES.body, fontSize: 16, fill: PALETTE.accent, wordWrap: true, wordWrapWidth: PANEL_RECT.width - 44,
      }, px, PANEL_RECT.y + 332));
      ["cunning", "effectiveness", "intelligence"].forEach((statId, index) => {
        addButton(root, { x: px, y: PANEL_RECT.y + 380 + index * 54, width: PANEL_RECT.width - 44, height: 44 },
          `Gain: +1 ${statId[0].toUpperCase()}${statId.slice(1)}`, true, () => onChooseDevelopmentStat?.(statId));
      });
      return;
    }

    const nodeState = activeNodeId ? vassal.lifeMap.nodeStates[activeNodeId] : null;
    if (!nodeState) {
      if (inspectedDisplay?.available) {
        root.addChild(createText("This node is ready to enter. Its choices will be revealed once entered.", {
          ...TEXT_STYLES.body, fontSize: 16, fill: PALETTE.textMuted, wordWrap: true, wordWrapWidth: PANEL_RECT.width - 44,
        }, px, PANEL_RECT.y + 340));
        enterNodeRoot = addButton(root, { x: px, y: PANEL_RECT.y + 404, width: PANEL_RECT.width - 44, height: 50 },
          `ENTER ${inspectedFamily.label.toUpperCase()} NODE`, true, () => onEnterNode?.(inspectedNode.id));
      } else {
        root.addChild(createText(inspectedDisplay?.completed
          ? "Completed. Follow its outgoing paths through the map."
          : "Locked. Complete a connected available node to unlock this path.", {
          ...TEXT_STYLES.body, fontSize: 16, fill: PALETTE.textMuted, wordWrap: true, wordWrapWidth: PANEL_RECT.width - 44,
        }, px, PANEL_RECT.y + 340));
      }
      return;
    }

    if (inspectedNode.id !== activeNodeId) {
      root.addChild(createText("Another node is active. Inspect it again to make its choices and resolve it.", {
        ...TEXT_STYLES.body, fontSize: 16, fill: PALETTE.textMuted, wordWrap: true, wordWrapWidth: PANEL_RECT.width - 44,
      }, px, PANEL_RECT.y + 340));
      return;
    }

    root.addChild(createText(`Time committed on confirmation: ${nodeState.accumulatedYearCost} ${nodeState.accumulatedYearCost === 1 ? "year" : "years"}`,
      { ...TEXT_STYLES.body, fill: PALETTE.textMuted }, px, PANEL_RECT.y + 332));
    if (nodeState.resolving) {
      const pending = vassal.lifeMap.pendingResolution;
      root.addChild(createText(
        `RESOLVING · advancing ${pending?.yearCost ?? 0} years`,
        { ...TEXT_STYLES.header, fill: PALETTE.accent, fontSize: 18 }, px, PANEL_RECT.y + 382
      ));
      return;
    }

    let y = PANEL_RECT.y + 364;
    const isShop = ["practiceReform", "publicWorks", "routes"].includes(nodeState.family);
    if (!isShop && nodeState.options.length) {
      optionRoots = nodeState.options.map((option, index) => {
        const enabled = getAdjustedVassalPrestigeCost(vassal, option.prestigeCost ?? 0) <= vassal.prestige;
        return addButton(root, { x: px, y: y + index * 82, width: PANEL_RECT.width - 44, height: 74 },
          `${option.label}\n${formatAdjustedCost(vassal, option)}\n${formatOptionEffect(option)}`, enabled,
          () => onSelectOption?.(activeNodeId, option.id), nodeState.selectedOptionId === option.id);
      });
      y += nodeState.options.length * 82 + 6;
    } else if (isShop) {
      offerRoots = nodeState.inventory.map((offer, index) => {
        const cost = getAdjustedVassalPrestigeCost(vassal, offer.basePrestigeCost);
        return addButton(root, { x: px, y: y + index * 76, width: PANEL_RECT.width - 44, height: 68 },
          `${offer.label}\n${formatAdjustedCost(vassal, { prestigeCost: offer.basePrestigeCost, yearCost: offer.baseYearCost })}\nEffect: Applied when this node resolves`,
          cost <= vassal.prestige, () => onPurchaseOffer?.(activeNodeId, offer.offerId));
      });
      y += nodeState.inventory.length * 76 + 6;
      const rerollCost = getAdjustedVassalPrestigeCost(vassal, 6);
      rerollRoot = addButton(root, { x: px, y, width: PANEL_RECT.width - 44, height: 52 },
        nodeState.rerollUsed
          ? "REROLL USED"
          : `Reroll remaining offers\n${formatAdjustedCost(vassal, { prestigeCost: 6, yearCost: 2 })}`,
        !nodeState.rerollUsed && rerollCost <= vassal.prestige, () => onRerollShop?.(activeNodeId));
      y += 58;
    } else {
      root.addChild(createText("No choices are currently available for this node.", {
        ...TEXT_STYLES.body, fontSize: 16, fill: PALETTE.textMuted,
      }, px, y));
      y += 52;
    }
    const canConfirm = isShop || !!nodeState.selectedOptionId;
    confirmRoot = addButton(root, { x: px, y: Math.min(PANEL_RECT.y + PANEL_RECT.height - 62, y), width: PANEL_RECT.width - 44, height: 48 },
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
