import { VASSAL_NODE_FAMILIES, VASSAL_SIGNATURE_NODE_VARIANTS } from "../defs/gamepieces/vassal-life-map-defs.js";
import {
  getVassalLifeMapNode,
  getVassalLifeMapNodes,
  getVassalLifeMapPlannedRoute,
  getVassalLifeMapReachableNodeIds,
  nextVassalLifeMapPins,
} from "../model/vassal-life-map.js";
import { clearChildren, createText, roundedRect } from "./settlement-view-primitives.js";
import { PALETTE, TEXT_STYLES } from "./settlement-theme.js";
import { addGateBackdrop, getArtRevision } from './chronicle-art.js';
import { drawLifeMapNodeIcon } from './life-map-node-icon.js';
import { layoutChronicleNodes } from './timeline-presentation.js';
import { addCivilizationSurvivalStrip } from './civilization-survival-hud.js';

const MAP_RECT = Object.freeze({ x: 58, y: 88, width: 2318, height: 720 });
const NODE_RADIUS = 32;
const DOUBLE_CLICK_WINDOW_MS = 360;

function fallbackNodePoint(node) {
  const top = MAP_RECT.y + 158;
  const bottom = MAP_RECT.y + MAP_RECT.height - 60;
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

function drawPinMarker(graphics, filled) {
  graphics.lineStyle(2, 0x111714, 1).beginFill(filled ? PALETTE.accent : 0xf4e7bd)
    .drawPolygon([0, -52, 8, -40, 3, -40, 3, -28, -3, -28, -3, -40, -8, -40])
    .endFill();
}

export function createVassalLifeMapView({
  layer, getPresentation, getCivilizationLossInfo, isVisible, onEnterNode, onOpenDecision, onReadOnlyAction, tooltipView,
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
  let layoutPoints = new Map();
  let pinnedNodeIds = [];
  const nodePoint=node=>layoutPoints.get(node.id)??fallbackNodePoint(node);

  function showNodeTooltip(node, target, vassal) {
    const family = node?.signatureNode?.variantId
      ? VASSAL_SIGNATURE_NODE_VARIANTS[node.signatureNode.variantId]
      : VASSAL_NODE_FAMILIES[node?.family] ?? null;
    if (!family || !target) return;
    tooltipView?.show?.({
      title: `${family.glyph}  ${family.label}`,
      lines: [family.description],
      accentColor: family.color,
      maxWidth: 310,
      scale: 2,
      pin: true,
      pinned: pinnedNodeIds.includes(node.id),
      onPin: () => togglePin(vassal, node.id),
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
    if (inspectedNodeId == null) tooltipView?.hide?.();
    render(true);
  }

  function togglePin(vassal, nodeId) {
    pinnedNodeIds = nextVassalLifeMapPins(vassal, pinnedNodeIds, nodeId);
    inspectedNodeId = nodeId;
    render(true);
    const target = nodeRoots.get(nodeId);
    const node = getVassalLifeMapNode(vassal, nodeId);
    if (node && target) showNodeTooltip(node, target, vassal);
  }

  function canOpenModal(display, unveiling) {
    return !unveiling && (display.available || display.current || display.completed);
  }

  root.on("pointerdown", (event) => {
    const local = root.toLocal(event.global);
    const presentation = getPresentation?.() ?? {};
    const node = getNodeAtPoint(local, presentation);
    if (!node) {
      inspectedNodeId = null;
      tooltipView?.hide?.();
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
    showNodeTooltip(node, nodeRoots.get(node.id), presentation.vassal);
  });
  // `pointerout` bubbles from every child. Nodes are redrawn as their hover
  // state changes, so use the non-bubbling leave event from the stable map
  // surface to avoid clearing and restoring the tooltip every frame.
  root.on("pointerleave", clearNodeHover);

  function inspect(node, display) {
    const presentation = getPresentation?.() ?? {};
    const vassal = presentation.vassal;
    const unveiling = !presentation.readOnly && !!vassal?.lifeMap?.pendingResolution;
    if (presentation.readOnly && !display.completed) onReadOnlyAction?.();
    const now = performance.now();
    const sameNode = lastClick.nodeId === node.id
      && now - lastClick.atMs <= DOUBLE_CLICK_WINDOW_MS;
    lastClick = { nodeId: node.id, atMs: now };
    inspectedNodeId = node.id;
    hoveredNodeId = null;
    if (canOpenModal(display, unveiling)) {
      tooltipView?.hide?.();
      if (sameNode && display.available) onEnterNode?.(node.id);
      onOpenDecision?.(node.id);
      render(true);
      return;
    }
    if (sameNode) togglePin(vassal, node.id);
    else {
      render(true);
      showNodeTooltip(node, nodeRoots.get(node.id), vassal);
    }
  }

  function render(force = false) {
    const visible = isVisible?.() === true;
    root.visible = visible;
    if (!visible) {
      // The tooltip is shared with the other screens. Clean up once on exit,
      // rather than hiding their hover details on every hidden Life Map frame.
      if (root.children.length > 0) {
        clearChildren(root);
        tooltipView?.hide?.();
      }
      hoveredNodeId = null;
      signature = "";
      return;
    }
    const presentation = getPresentation?.() ?? {};
    const state = presentation.state;
    const vassal = presentation.vassal;
    const readOnly = presentation.readOnly === true;
    const committed = new Set(presentation.committedNodeIds ?? []);
    const nodes = getVassalLifeMapNodes(vassal);
    layoutPoints=layoutChronicleNodes(nodes,{x:MAP_RECT.x+92,y:MAP_RECT.y+158,
      width:MAP_RECT.width-184,height:MAP_RECT.height-218});
    if ((vassal?.vassalId ?? null) !== displayedVassalId) {
      displayedVassalId = vassal?.vassalId ?? null;
      inspectedNodeId = presentation.playheadNodeId ?? vassal?.lifeMap?.availableNodeIds?.[0] ?? null;
      pinnedNodeIds = [];
    }
    const unveiling = !readOnly && !!vassal?.lifeMap?.pendingResolution;
    root.cursor = unveiling ? "wait" : "default";
    const reachable = new Set(getVassalLifeMapReachableNodeIds(vassal));
    const planned = getVassalLifeMapPlannedRoute(vassal, pinnedNodeIds);
    const plannedEdges = new Set(planned?.edgeKeys ?? []);
    const effectiveNodeId = hoveredNodeId ?? inspectedNodeId ?? vassal?.lifeMap?.currentNodeId
      ?? presentation.playheadNodeId ?? null;
    const nextSignature = getArtRevision() + JSON.stringify({
      presentation, effectiveNodeId, hoveredNodeId, pinnedNodeIds, unveiling,
    });
    if (!force && nextSignature === signature) return;
    signature = nextSignature;
    clearChildren(root);
    nodeRoots.clear();
    openRoot = null;
    addCivilizationSurvivalStrip(root,{state,civilizationLossInfo:getCivilizationLossInfo?.(),rect:{x:590,y:16,width:1108,height:54}});
    root.addChild(createText('VASSAL CHRONICLE',{...TEXT_STYLES.title,fontSize:25,fill:PALETTE.accent},78,32));

    const bg = new PIXI.Graphics();
    roundedRect(bg, MAP_RECT.x, MAP_RECT.y, MAP_RECT.width, MAP_RECT.height, 10,
      PALETTE.panel, PALETTE.stroke, 2);
    root.addChild(bg);
    addGateBackdrop(root,MAP_RECT,.15);
    root.addChild(createText("THE THREAD OF A LIFE", {
      ...TEXT_STYLES.header, fontSize: 30, fill: PALETTE.accent,
    }, MAP_RECT.x + 22, MAP_RECT.y + 22));
    if (!vassal) {
      root.addChild(createText("No Vassal had been appointed at this point in the timeline.", {
        ...TEXT_STYLES.header, fontSize: 22, fill: PALETTE.textMuted,
      }, MAP_RECT.x + 70, MAP_RECT.y + 180));
      return;
    }

    root.addChild(createText(readOnly
      ? presentation.viewedSec > presentation.frontierSec
        ? "PROJECTED FUTURE · RETURN TO PRESENT TO MAKE DECISIONS"
        : "FIXED HISTORY · CLICK A COMMITTED NODE FOR DETAILS"
      : unveiling
        ? "TIME IS UNVEILING THIS TURNING POINT"
        : "Choose a turning point. Rewrite what follows.", {
      ...TEXT_STYLES.body, fontSize: 21, fill: PALETTE.textMuted,
    }, MAP_RECT.x + 22, MAP_RECT.y + 68));
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
        const plannedEdge = plannedEdges.has(`${node.id}:${nextId}`);
        const mid=(from.x+to.x)/2;
        edges.lineStyle(complete || plannedEdge ? 9 : 6, 0x090e0d, .9)
          .moveTo(from.x,from.y).bezierCurveTo(mid,from.y,mid,to.y,to.x,to.y);
        if (plannedEdge && !complete) {
          edges.lineStyle(4, PALETTE.accent, 0.85)
            .moveTo(from.x,from.y).bezierCurveTo(mid,from.y,mid,to.y,to.x,to.y);
        } else {
          edges.lineStyle(complete ? 4 : 2, complete ? PALETTE.accent : 0x7f8b79, complete ? 1 : .48)
            .moveTo(from.x,from.y).bezierCurveTo(mid,from.y,mid,to.y,to.x,to.y);
        }
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
      const reachableNode = reachable.has(node.id);
      const inactive = !display.completed && !display.current && !display.available && !reachableNode;
      nodeRoot.cursor = unveiling ? "wait" : canOpenModal(display, unveiling) ? "pointer" : "help";
      nodeRoot.hitArea = new PIXI.Circle(0, 0, NODE_RADIUS + 9);
      nodeRoot.on("pointerdown", (event) => { event?.stopPropagation?.(); inspect(node, display); });
      const selected = effectiveNodeId === node.id;
      const icon = new PIXI.Graphics();
      const active = display.current || display.available;
      drawLifeMapNodeIcon(icon, node, {
        fill: selected || active ? 0xf4e7bd : display.completed ? 0xb6baa0 : inactive ? 0x3d423c : 0x929a89,
        accent: inactive ? 0x6a7368 : family.color ?? PALETTE.accent,
        outline: 0x111714,
      });
      if (inactive) icon.alpha = 0.42;
      const marker = new PIXI.Graphics();
      if (!inactive && (selected || active || presentation.playheadNodeId === node.id)) {
        marker.lineStyle(3, selected ? PALETTE.text : PALETTE.accent, 1);
        for (const side of [-1, 1]) marker.moveTo(side*29,-39)
          .lineTo(side*39,-39).lineTo(side*39,-24)
          .moveTo(side*39,24).lineTo(side*39,39).lineTo(side*29,39);
      }
      if (display.completed) marker.lineStyle(4, 0xb5cd93, 1)
        .moveTo(-9,37).lineTo(-2,44).lineTo(12,32);
      nodeRoot.addChild(icon, marker);
      if (pinnedNodeIds.includes(node.id)) {
        const pin = new PIXI.Graphics();
        drawPinMarker(pin, true);
        nodeRoot.addChild(pin);
      }
      root.addChild(nodeRoot);
      nodeRoots.set(node.id, nodeRoot);
    }
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
    getPinnedNodeIds: () => [...pinnedNodeIds],
  };
}
