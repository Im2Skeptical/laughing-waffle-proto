import { VASSAL_NODE_FAMILIES } from "../defs/gamepieces/vassal-life-map-defs.js";
import {
  getVassalAge,
  getVassalLifeMapNode,
  getVassalLifeMapNodes,
  getVassalStatsPresentation,
} from "../model/vassal-life-map.js";
import { getRegionReference } from "../model/world-state.js";
import { clearChildren, createText, roundedRect } from "./settlement-view-primitives.js";
import { PALETTE, TEXT_STYLES } from "./settlement-theme.js";

const MAP_RECT = Object.freeze({ x: 58, y: 88, width: 2318, height: 720 });
const NODE_RADIUS = 26;
const DOUBLE_CLICK_WINDOW_MS = 360;

function nodePoint(node) {
  const top = MAP_RECT.y + 142;
  const bottom = MAP_RECT.y + MAP_RECT.height - 102;
  return {
    x: MAP_RECT.x + 92 + (MAP_RECT.width - 184) * (node.position?.x ?? 0),
    y: top + (bottom - top) * (node.position?.y ?? 0.5),
  };
}

function addButton(parent, rect, label, enabled, onClick) {
  const root = new PIXI.Container();
  root.position.set(rect.x, rect.y);
  root.eventMode = enabled ? "static" : "none";
  root.cursor = enabled ? "pointer" : "default";
  root.hitArea = new PIXI.Rectangle(0, 0, rect.width, rect.height);
  root.on("pointertap", (event) => { event?.stopPropagation?.(); if (enabled) onClick?.(); });
  const gfx = new PIXI.Graphics();
  roundedRect(gfx, 0, 0, rect.width, rect.height, 8,
    enabled ? 0x40533b : 0x464743, enabled ? PALETTE.accent : PALETTE.stroke, 2);
  root.addChild(gfx, createText(label, {
    ...TEXT_STYLES.title, fontSize: 15, fill: enabled ? PALETTE.text : PALETTE.textMuted,
  }, rect.width / 2, rect.height / 2, 0.5, 0.5));
  parent.addChild(root);
  return root;
}

function getDisplay(vassal, nodeId, committed, readOnly) {
  return {
    available: !readOnly && (vassal?.lifeMap?.availableNodeIds ?? []).includes(nodeId)
      && (vassal?.developmentChoiceQueue ?? []).length === 0,
    current: !readOnly && vassal?.lifeMap?.currentNodeId === nodeId,
    completed: committed.has(nodeId),
  };
}

export function createVassalLifeMapView({
  layer, getPresentation, isVisible, onEnterNode, onOpenDecision, tooltipView,
} = {}) {
  const root = new PIXI.Container();
  root.zIndex = 10;
  root.eventMode = "static";
  root.hitArea = new PIXI.Rectangle(MAP_RECT.x, MAP_RECT.y, MAP_RECT.width, MAP_RECT.height);
  layer?.addChild(root);
  const nodeRoots = new Map();
  let signature = "";
  let inspectedNodeId = null;
  let hoveredNodeId = null;
  let displayedVassalId = null;
  let lastClick = { nodeId: null, atMs: 0 };
  let openRoot = null;
  let pinnedStatId = null;

  function hideStatTooltip() {
    pinnedStatId = null;
    tooltipView?.hide?.();
  }

  function showStatTooltip(stat, target) {
    tooltipView?.show?.({
      title: `${stat.label} ${stat.value}`,
      lines: [
        stat.powerLabel,
        stat.formula,
        Number.isFinite(stat.pointsToCap)
          ? stat.pointsToCap > 0
            ? `${stat.pointsToCap} ${stat.pointsToCap === 1 ? "point" : "points"} to the discount cap.`
            : "Discount cap reached."
          : "This income has no cap.",
      ],
    }, target.getBounds());
  }

  root.on("pointerdown", (event) => {
    const local = root.toLocal(event.global);
    const presentation = getPresentation?.() ?? {};
    const node = getVassalLifeMapNodes(presentation.vassal).find((candidate) => {
      const point = nodePoint(candidate);
      return Math.hypot(local.x - point.x, local.y - point.y) <= NODE_RADIUS + 10;
    });
    if (!node) {
      hideStatTooltip();
      return;
    }
    inspect(node, getDisplay(
      presentation.vassal,
      node.id,
      new Set(presentation.committedNodeIds ?? []),
      presentation.readOnly === true
    ));
  });

  function inspect(node, display) {
    const now = performance.now();
    const doubleClick = display.available && lastClick.nodeId === node.id
      && now - lastClick.atMs <= DOUBLE_CLICK_WINDOW_MS;
    lastClick = { nodeId: node.id, atMs: now };
    inspectedNodeId = node.id;
    if (doubleClick) onEnterNode?.(node.id);
    onOpenDecision?.(node.id);
    render(true);
  }

  function render(force = false) {
    const visible = isVisible?.() === true;
    root.visible = visible;
    if (!visible) { signature = ""; clearChildren(root); hideStatTooltip(); return; }
    const presentation = getPresentation?.() ?? {};
    const state = presentation.state;
    const vassal = presentation.vassal;
    const profile = presentation.profileVassal ?? vassal;
    const readOnly = presentation.readOnly === true;
    const committed = new Set(presentation.committedNodeIds ?? []);
    const nodes = getVassalLifeMapNodes(vassal);
    if ((vassal?.vassalId ?? null) !== displayedVassalId) {
      displayedVassalId = vassal?.vassalId ?? null;
      inspectedNodeId = presentation.playheadNodeId ?? vassal?.lifeMap?.availableNodeIds?.[0] ?? null;
    }
    const effectiveNodeId = hoveredNodeId ?? inspectedNodeId ?? vassal?.lifeMap?.currentNodeId
      ?? presentation.playheadNodeId ?? null;
    const nextSignature = JSON.stringify({ presentation, effectiveNodeId, hoveredNodeId });
    if (!force && nextSignature === signature) return;
    signature = nextSignature;
    clearChildren(root);
    nodeRoots.clear();
    openRoot = null;

    const bg = new PIXI.Graphics();
    roundedRect(bg, MAP_RECT.x, MAP_RECT.y, MAP_RECT.width, MAP_RECT.height, 10,
      PALETTE.panel, PALETTE.stroke, 2);
    root.addChild(bg, createText("VASSAL LIFE MAP", {
      ...TEXT_STYLES.header, fontSize: 22,
    }, MAP_RECT.x + 22, MAP_RECT.y + 22));
    if (!vassal) {
      root.addChild(createText("No Vassal had been appointed at this point in the timeline.", {
        ...TEXT_STYLES.header, fontSize: 22, fill: PALETTE.textMuted,
      }, MAP_RECT.x + 70, MAP_RECT.y + 180));
      return;
    }

    root.addChild(createText(readOnly
      ? "LOCKED HISTORY · CLICK A COMMITTED NODE FOR DETAILS"
      : "Click a node to open its decision. Double-click an available node to enter immediately.", {
      ...TEXT_STYLES.body, fontSize: 15, fill: PALETTE.textMuted,
    }, MAP_RECT.x + 250, MAP_RECT.y + 26));
    const config = vassal.lifeMap.graph.generatorConfig;
    const bandLabels = [
      ["EARLY", 0],
      ["MID", config.earlyDepthCount / config.normalDepthCount],
      ["LATE", (config.earlyDepthCount + config.midDepthCount) / config.normalDepthCount],
      ["LEGACY", 1],
    ];
    bandLabels.forEach(([label, ratio]) => root.addChild(createText(
      label, TEXT_STYLES.body,
      MAP_RECT.x + 52 + ratio * (MAP_RECT.width - 150), MAP_RECT.y + 62
    )));

    const committedPath = presentation.committedNodeIds ?? [];
    const completedEdges = new Set(committedPath.slice(1).map((id, index) => `${committedPath[index]}:${id}`));
    const edges = new PIXI.Graphics();
    for (const node of nodes) {
      const from = nodePoint(node);
      const outgoing = vassal.lifeMap.graph.edges
        .filter((edge) => edge.fromNodeId === node.id)
        .map((edge) => edge.toNodeId);
      for (const nextId of outgoing) {
        const next = getVassalLifeMapNode(vassal, nextId);
        if (!next) continue;
        const to = nodePoint(next);
        const complete = completedEdges.has(`${node.id}:${nextId}`);
        edges.lineStyle(complete ? 5 : 3, complete ? 0x87c96a : PALETTE.stroke, complete ? 1 : 0.72)
          .moveTo(from.x, from.y).lineTo(to.x, to.y);
      }
    }
    root.addChild(edges);

    for (const node of nodes) {
      const display = getDisplay(vassal, node.id, committed, readOnly);
      const point = nodePoint(node);
      const family = VASSAL_NODE_FAMILIES[node.family] ?? {};
      const nodeRoot = new PIXI.Container();
      nodeRoot.position.set(point.x, point.y);
      nodeRoot.eventMode = "static";
      nodeRoot.cursor = "pointer";
      nodeRoot.hitArea = new PIXI.Circle(0, 0, NODE_RADIUS + 9);
      nodeRoot.on("pointerdown", (event) => { event?.stopPropagation?.(); inspect(node, display); });
      nodeRoot.on("pointerover", () => { hoveredNodeId = node.id; render(true); });
      nodeRoot.on("pointerout", () => { hoveredNodeId = null; render(true); });
      const selected = effectiveNodeId === node.id;
      const circle = new PIXI.Graphics();
      const alpha = display.current || display.available ? 1 : display.completed ? 0.7 : 0.38;
      circle.lineStyle(selected || display.current || display.available || display.completed ? 4 : 2,
        selected ? 0xf4e7bd : display.completed ? 0x87c96a : display.current || display.available ? PALETTE.accent : PALETTE.stroke, 1)
        .beginFill(family.color ?? 0x494641, alpha).drawCircle(0, 0, NODE_RADIUS).endFill();
      if (presentation.playheadNodeId === node.id) circle.lineStyle(5, 0xe3c46c, 1).drawCircle(0, 0, NODE_RADIUS + 7);
      nodeRoot.addChild(circle, createText(family.glyph ?? "?", {
        ...TEXT_STYLES.title, fontSize: ["practiceReform", "publicWorks"].includes(node.family) ? 12 : 16,
      }, 0, 0, 0.5, 0.5));
      root.addChild(nodeRoot);
      nodeRoots.set(node.id, nodeRoot);
    }

    Object.values(VASSAL_NODE_FAMILIES).forEach((family, index) => root.addChild(createText(
      `${family.glyph}  ${family.label}`, {
        ...TEXT_STYLES.body, fontSize: 13, fill: family.color ?? PALETTE.textMuted,
      }, MAP_RECT.x + 28 + index * 220, MAP_RECT.y + MAP_RECT.height - 34)));

    const location = getRegionReference(state, profile.locationRegionId) ?? profile.locationRegionId;
    const hudWidth = 1040;
    const hudX = MAP_RECT.x + MAP_RECT.width - hudWidth - 28;
    const hud = new PIXI.Graphics();
    roundedRect(hud, hudX, MAP_RECT.y + 18, hudWidth, 78, 10, 0x303833, PALETTE.accent, 1);
    root.addChild(hud,
      createText(`VASSAL · AGE ${getVassalAge(state, profile, presentation.profileSec)} · ${location}`, {
        ...TEXT_STYLES.chip, fontSize: 13, fill: PALETTE.textMuted,
        wordWrap: true, wordWrapWidth: 235,
      }, hudX + 16, MAP_RECT.y + 31),
      createText(`Prestige  ${profile.prestige}`, {
        ...TEXT_STYLES.header, fontSize: 21, fill: PALETTE.accent,
      }, hudX + 16, MAP_RECT.y + 55));
    getVassalStatsPresentation(profile).forEach((stat, index) => {
      const chip = new PIXI.Container();
      chip.position.set(hudX + 258 + index * 142, MAP_RECT.y + 31);
      chip.eventMode = "static";
      chip.cursor = "help";
      chip.hitArea = new PIXI.Rectangle(0, 0, 132, 50);
      chip.on("pointerdown", (event) => event?.stopPropagation?.());
      chip.on("pointerover", () => {
        if (!pinnedStatId) showStatTooltip(stat, chip);
      });
      chip.on("pointerout", () => {
        if (!pinnedStatId) tooltipView?.hide?.();
      });
      chip.on("pointertap", (event) => {
        event?.stopPropagation?.();
        if (pinnedStatId === stat.statId) hideStatTooltip();
        else {
          pinnedStatId = stat.statId;
          showStatTooltip(stat, chip);
        }
      });
      const chipBg = new PIXI.Graphics();
      roundedRect(chipBg, 0, 0, 132, 50, 7, 0x39413b,
        pinnedStatId === stat.statId ? PALETTE.accent : PALETTE.stroke,
        pinnedStatId === stat.statId ? 2 : 1);
      chip.addChild(chipBg,
        createText(stat.label.toUpperCase(), {
          ...TEXT_STYLES.chip, fontSize: 10, fill: PALETTE.textMuted,
        }, 9, 7),
        createText(String(stat.value), {
          ...TEXT_STYLES.header, fontSize: 24, fill: PALETTE.text,
        }, 9, 20));
      root.addChild(chip);
    });
    const openNodeId = vassal.lifeMap.currentNodeId ?? effectiveNodeId;
    openRoot = addButton(root, { x: hudX + 836, y: MAP_RECT.y + 34, width: 184, height: 46 },
      vassal.lifeMap.currentNodeId ? "RESUME DECISION" : "OPEN DETAILS", !!openNodeId,
      () => onOpenDecision?.(openNodeId));
  }

  return {
    init: () => render(true), update: () => render(), refresh: () => render(true),
    setVisible: (visible) => { root.visible = visible === true; },
    getNodeClickPoint(nodeId) {
      const point = nodeRoots.get(nodeId)?.toGlobal?.(new PIXI.Point(0, 0));
      return point ? { x: point.x, y: point.y } : null;
    },
    getOpenDecisionClickPoint: () => openRoot?.toGlobal
      ? openRoot.toGlobal(new PIXI.Point(openRoot.hitArea.width / 2, openRoot.hitArea.height / 2)) : null,
  };
}
