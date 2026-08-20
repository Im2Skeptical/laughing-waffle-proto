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
  }, 9, 8);
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

function optionCostLabel(vassal, option) {
  const prestigeBase = Math.max(0, option?.prestigeCost ?? 0);
  const yearBase = Math.max(0, option?.yearCost ?? 0);
  const prestige = getAdjustedVassalPrestigeCost(vassal, prestigeBase);
  const years = getAdjustedVassalYearCost(vassal, yearBase);
  return `${prestigeBase > 0 ? `${prestigeBase}→${prestige} Prestige · ` : ""}${yearBase}→${years} years`;
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
  let confirmRoot = null;

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
    const nextSignature = JSON.stringify({ tSec: state?.tSec, vassal });
    if (!force && nextSignature === signature) return;
    signature = nextSignature;
    clearChildren(root);
    nodeRoots.clear();
    optionRoots = [];
    offerRoots = [];
    rerollRoot = null;
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
    root.addChild(createText("EARLY", TEXT_STYLES.body, MAP_RECT.x + 40, MAP_RECT.y + 60));
    root.addChild(createText("MID", TEXT_STYLES.body, MAP_RECT.x + 478, MAP_RECT.y + 60));
    root.addChild(createText("LATE", TEXT_STYLES.body, MAP_RECT.x + 900, MAP_RECT.y + 60));
    root.addChild(createText("DEEP / LEGACY", TEXT_STYLES.body, MAP_RECT.x + 1318, MAP_RECT.y + 60));

    const edges = new PIXI.Graphics();
    edges.lineStyle(3, PALETTE.stroke, 0.75);
    for (const node of VASSAL_LIFE_MAP_NODES) {
      const from = nodePoint(node);
      for (const nextId of node.outgoingNodeIds) {
        const nextNode = VASSAL_LIFE_MAP_NODES.find((entry) => entry.id === nextId);
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
      const nodeRoot = new PIXI.Container();
      nodeRoot.position.set(point.x, point.y);
      nodeRoot.eventMode = display.available ? "static" : "none";
      nodeRoot.cursor = display.available ? "pointer" : "default";
      nodeRoot.hitArea = new PIXI.Circle(0, 0, NODE_RADIUS + 8);
      nodeRoot.on("pointerdown", () => display.available && onEnterNode?.(node.id));
      const circle = new PIXI.Graphics();
      const fill = display.current ? 0x8c6339
        : display.completed ? 0x44613d
          : display.available ? 0x76652f : 0x494641;
      circle.lineStyle(display.current || display.available ? 4 : 2,
        display.current ? 0xf2c86f : display.available ? PALETTE.accent : PALETTE.stroke, 1);
      circle.beginFill(fill, 1).drawCircle(0, 0, NODE_RADIUS).endFill();
      const glyph = createText(VASSAL_NODE_FAMILIES[node.family]?.glyph ?? "?", {
        ...TEXT_STYLES.title, fontSize: node.family === "practiceReform" || node.family === "publicWorks" ? 12 : 16,
      }, 0, 0, 0.5, 0.5);
      nodeRoot.addChild(circle, glyph);
      root.addChild(nodeRoot);
      nodeRoots.set(node.id, nodeRoot);
    }
    Object.values(VASSAL_NODE_FAMILIES).forEach((family, index) => {
      root.addChild(createText(`${family.glyph}  ${family.label}`, {
        ...TEXT_STYLES.body, fontSize: 14, fill: PALETTE.textMuted,
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

    if (vassal.pendingDevelopmentChoices > 0) {
      root.addChild(createText("CHOOSE DEVELOPMENT", { ...TEXT_STYLES.header, fontSize: 16 }, px, PANEL_RECT.y + 252));
      ["cunning", "effectiveness", "intelligence"].forEach((statId, index) => {
        addButton(root, { x: px, y: PANEL_RECT.y + 286 + index * 52, width: PANEL_RECT.width - 44, height: 42 },
          `+1 ${statId}`, true, () => onChooseDevelopmentStat?.(statId));
      });
      return;
    }

    const nodeId = vassal.lifeMap.currentNodeId;
    const nodeState = nodeId ? vassal.lifeMap.nodeStates[nodeId] : null;
    if (!nodeState) {
      root.addChild(createText("Choose a highlighted node.", { ...TEXT_STYLES.title, fontSize: 17 }, px, PANEL_RECT.y + 266));
      return;
    }
    root.addChild(createText(VASSAL_NODE_FAMILIES[nodeState.family]?.label ?? nodeState.family,
      { ...TEXT_STYLES.header, fontSize: 18 }, px, PANEL_RECT.y + 250));
    root.addChild(createText(`Accumulated node time: ${nodeState.accumulatedYearCost} years`,
      { ...TEXT_STYLES.body, fill: PALETTE.textMuted }, px, PANEL_RECT.y + 280));
    if (nodeState.resolving) {
      const pending = vassal.lifeMap.pendingResolution;
      root.addChild(createText(
        `RESOLVING · advancing ${pending?.yearCost ?? 0} years`,
        { ...TEXT_STYLES.header, fill: PALETTE.accent, fontSize: 18 }, px, PANEL_RECT.y + 330
      ));
      return;
    }

    let y = PANEL_RECT.y + 316;
    if (nodeState.options.length) {
      optionRoots = nodeState.options.map((option, index) => {
        const enabled = getAdjustedVassalPrestigeCost(vassal, option.prestigeCost ?? 0) <= vassal.prestige;
        const button = addButton(root, { x: px, y: y + index * 70, width: PANEL_RECT.width - 44, height: 60 },
          `${option.label}\n${optionCostLabel(vassal, option)}`, enabled,
          () => onSelectOption?.(nodeId, option.id), nodeState.selectedOptionId === option.id);
        return button;
      });
      y += nodeState.options.length * 70 + 8;
    } else {
      offerRoots = nodeState.inventory.map((offer, index) => {
        const cost = getAdjustedVassalPrestigeCost(vassal, offer.basePrestigeCost);
        const years = getAdjustedVassalYearCost(vassal, offer.baseYearCost);
        return addButton(root, { x: px, y: y + index * 64, width: PANEL_RECT.width - 44, height: 54 },
          `${offer.label} · ${offer.basePrestigeCost}→${cost} Prestige · ${offer.baseYearCost}→${years} years`,
          cost <= vassal.prestige, () => onPurchaseOffer?.(nodeId, offer.offerId));
      });
      y += nodeState.inventory.length * 64 + 6;
      const rerollCost = getAdjustedVassalPrestigeCost(vassal, 6);
      rerollRoot = addButton(root, { x: px, y, width: PANEL_RECT.width - 44, height: 42 },
        nodeState.rerollUsed ? "REROLL USED" : `REROLL · 6→${rerollCost} Prestige · 2→${getAdjustedVassalYearCost(vassal, 2)} years`,
        !nodeState.rerollUsed && rerollCost <= vassal.prestige, () => onRerollShop?.(nodeId));
      y += 50;
    }
    const canConfirm = nodeState.options.length === 0 || !!nodeState.selectedOptionId;
    confirmRoot = addButton(root, { x: px, y: Math.min(PANEL_RECT.y + PANEL_RECT.height - 62, y), width: PANEL_RECT.width - 44, height: 48 },
      "CONFIRM & RESOLVE NODE", canConfirm, () => onConfirmNode?.(nodeId));
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
