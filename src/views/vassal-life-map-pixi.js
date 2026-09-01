import { VASSAL_NODE_FAMILIES, VASSAL_SIGNATURE_NODE_VARIANTS } from "../defs/gamepieces/vassal-life-map-defs.js";
import {
  getVassalAge,
  getVassalLifeMapNode,
  getVassalLifeMapNodes,
  getVassalStatsPresentation,
} from "../model/vassal-life-map.js";
import { getRegionReference } from "../model/world-state.js";
import { clearChildren, createText, roundedRect } from "./settlement-view-primitives.js";
import { PALETTE, TEXT_STYLES } from "./settlement-theme.js";
import { createVassalPortraitView } from "./vassal-portrait-pixi.js";

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

  function showNodeTooltip(node, target) {
    const family = node?.signatureNode?.variantId
      ? VASSAL_SIGNATURE_NODE_VARIANTS[node.signatureNode.variantId]
      : VASSAL_NODE_FAMILIES[node?.family] ?? null;
    if (!family || !target) return;
    tooltipView?.show?.({
      title: `${family.glyph}  ${family.label}`,
      lines: [family.description],
      accentColor: family.color,
      maxWidth: 310,
    }, target.getBounds());
  }

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

  function getNodeAtPoint(local, presentation) {
    return getVassalLifeMapNodes(presentation?.vassal).find((candidate) => {
      const point = nodePoint(candidate);
      return Math.hypot(local.x - point.x, local.y - point.y) <= NODE_RADIUS + 10;
    }) ?? null;
  }

  function clearNodeHover() {
    if (hoveredNodeId == null) return;
    hoveredNodeId = null;
    tooltipView?.hide?.();
    render(true);
  }

  root.on("pointerdown", (event) => {
    const local = root.toLocal(event.global);
    const presentation = getPresentation?.() ?? {};
    const node = getNodeAtPoint(local, presentation);
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

  root.on("pointermove", (event) => {
    const presentation = getPresentation?.() ?? {};
    const node = getNodeAtPoint(root.toLocal(event.global), presentation);
    if (node?.id === hoveredNodeId) return;
    if (!node) {
      clearNodeHover();
      return;
    }
    hoveredNodeId = node.id;
    render(true);
    showNodeTooltip(node, nodeRoots.get(node.id));
  });
  // `pointerout` bubbles from every child. Nodes are redrawn as their hover
  // state changes, so use the non-bubbling leave event from the stable map
  // surface to avoid clearing and restoring the tooltip every frame.
  root.on("pointerleave", clearNodeHover);

  function inspect(node, display) {
    const now = performance.now();
    const doubleClick = display.available && lastClick.nodeId === node.id
      && now - lastClick.atMs <= DOUBLE_CLICK_WINDOW_MS;
    lastClick = { nodeId: node.id, atMs: now };
    inspectedNodeId = node.id;
    hoveredNodeId = null;
    tooltipView?.hide?.();
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
      const family = node.signatureNode?.variantId
        ? VASSAL_SIGNATURE_NODE_VARIANTS[node.signatureNode.variantId] ?? {}
        : VASSAL_NODE_FAMILIES[node.family] ?? {};
      const nodeRoot = new PIXI.Container();
      nodeRoot.position.set(point.x, point.y);
      nodeRoot.eventMode = "static";
      nodeRoot.cursor = "pointer";
      nodeRoot.hitArea = new PIXI.Circle(0, 0, NODE_RADIUS + 9);
      nodeRoot.on("pointerdown", (event) => { event?.stopPropagation?.(); inspect(node, display); });
      const selected = effectiveNodeId === node.id;
      const circle = new PIXI.Graphics();
      const alpha = display.current || display.available ? 1 : display.completed ? 0.7 : 0.38;
      circle.lineStyle(selected || display.current || display.available || display.completed ? 4 : 2,
        selected ? 0xf4e7bd : display.completed ? 0x87c96a : display.current || display.available ? PALETTE.accent : PALETTE.stroke, 1)
        .beginFill(family.color ?? 0x494641, alpha).drawCircle(0, 0, NODE_RADIUS).endFill();
      if (presentation.playheadNodeId === node.id) circle.lineStyle(5, 0xe3c46c, 1).drawCircle(0, 0, NODE_RADIUS + 7);
      if (node.signatureNode) {
        circle.lineStyle(3, 0xf1d77a, 1).drawCircle(0, 0, NODE_RADIUS + 10);
        circle.beginFill(0xf1d77a, 1).drawCircle(NODE_RADIUS + 7, -NODE_RADIUS - 4, 9).endFill();
      }
      nodeRoot.addChild(circle, createText(family.glyph ?? "?", {
        ...TEXT_STYLES.title, fontSize: node.signatureNode || ["practiceReform", "publicWorks"].includes(node.family) ? 12 : 16,
      }, 0, 0, 0.5, 0.5));
      root.addChild(nodeRoot);
      nodeRoots.set(node.id, nodeRoot);
    }

    const legendFamilies = [];
    const seenLegend = new Set();
    for (const node of nodes) {
      const family = node.signatureNode?.variantId
        ? VASSAL_SIGNATURE_NODE_VARIANTS[node.signatureNode.variantId]
        : VASSAL_NODE_FAMILIES[node.family];
      const key = node.signatureNode?.variantId ?? node.family;
      if (family && !seenLegend.has(key)) { seenLegend.add(key); legendFamilies.push(family); }
    }
    legendFamilies.forEach((family, index) => root.addChild(createText(
      `${family.glyph}  ${family.label}`, {
        ...TEXT_STYLES.body, fontSize: 13, fill: family.color ?? PALETTE.textMuted,
      }, MAP_RECT.x + 28 + index * 220, MAP_RECT.y + MAP_RECT.height - 34)));

    const location = getRegionReference(state, profile.locationRegionId) ?? profile.locationRegionId;
    const hudWidth = 1040;
    const hudX = MAP_RECT.x + MAP_RECT.width - hudWidth - 28;
    const hud = new PIXI.Graphics();
    roundedRect(hud, hudX, MAP_RECT.y + 18, hudWidth, 78, 10, 0x303833, PALETTE.accent, 1);
    const portrait = createVassalPortraitView(profile.portrait, { size: 84, borderColor: PALETTE.accent });
    portrait.position.set(hudX - 98, MAP_RECT.y + 15);
    root.addChild(portrait, hud,
      createText(`VASSAL · AGE ${getVassalAge(state, profile, presentation.profileSec)} · ${location}`, {
        ...TEXT_STYLES.chip, fontSize: 13, fill: PALETTE.textMuted,
        wordWrap: true, wordWrapWidth: 235,
      }, hudX + 16, MAP_RECT.y + 31),
      createText(`Prestige  ${profile.prestige}`, {
        ...TEXT_STYLES.header, fontSize: 21, fill: PALETTE.accent,
      }, hudX + 16, MAP_RECT.y + 55));
    getVassalStatsPresentation(profile).forEach((stat, index) => {
      const chip = new PIXI.Container();
      chip.position.set(hudX + 258 + index * 180, MAP_RECT.y + 31);
      chip.eventMode = "static";
      chip.cursor = "help";
      chip.hitArea = new PIXI.Rectangle(0, 0, 164, 50);
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
      roundedRect(chipBg, 0, 0, 164, 50, 7, 0x39413b,
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
