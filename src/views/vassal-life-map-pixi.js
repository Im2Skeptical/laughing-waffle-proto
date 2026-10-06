import { addInteractionFeedback } from './interaction-feedback.js';
import { getVassalLifeMapNodeFamily } from "../defs/gamepieces/vassal-life-map-defs.js";
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
import { addCivilizationSurvivalStrip, getCivilizationSurvivalViewModel, getSurvivalEndDetailsClickPoint } from './civilization-survival-hud.js';
import { confirmDockButton } from './vassal-node-decision/chrome.js';

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

function getDisplay(vassal, nodeId, committed, readOnly, loadoutPending = false) {
  return {
    available: !readOnly && (vassal?.lifeMap?.availableNodeIds ?? []).includes(nodeId)
      && (vassal?.developmentChoiceQueue ?? []).length === 0
      && loadoutPending !== true,
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
  app, layer, confirmLayer, getPresentation, getCivilizationLossInfo, onOpenEndDetails, isVisible, onEnterNode, onOpenDecision, onReadOnlyAction, tooltipView,
  isRecapOpen,
} = {}) {
  const root = new PIXI.Container();
  root.zIndex = 10;
  root.eventMode = "static";
  root.hitArea = new PIXI.Rectangle(MAP_RECT.x, 16, MAP_RECT.width, MAP_RECT.y + MAP_RECT.height - 16);
  layer?.addChild(root);
  const confirmSurface = new PIXI.Container();
  confirmSurface.zIndex = 168;
  confirmSurface.visible = false;
  confirmLayer?.addChild(confirmSurface);
  let confirmPointerHeld = false;
  confirmSurface.on("pointerdown", () => { confirmPointerHeld = true; });
  for (const type of ["pointerup", "pointerupoutside", "pointercancel"]) {
    confirmSurface.on(type, () => { confirmPointerHeld = false; });
  }
  const nodeRoots = new Map();
  let signature = "";
  let buildCount = 0;
  let wasVisible = false;
  let confirmVisibleWhenShown = false;
  let inspectedNodeId = null;
  let candidateNodeId = null;
  let hoveredNodeId = null;
  let displayedVassalId = null;
  let lastClick = { nodeId: null, atMs: 0 };
  let openRoot = null;
  let layoutPoints = new Map();
  let pinnedNodeIds = [];
  let lastPointerType = "mouse";
  let recapSuppressedTooltip = false;
  let endDetailsTarget = null;
  let survivalRoot = null;
  let survivalSignature = '';
  const nodePoint=node=>layoutPoints.get(node.id)??fallbackNodePoint(node);

  function updateSurvivalChrome(state, civilizationLossInfo) {
    if (!survivalRoot || survivalRoot.destroyed) {
      survivalRoot = new PIXI.Container();
      root.addChild(survivalRoot);
      survivalSignature = '';
    }
    const next = JSON.stringify(getCivilizationSurvivalViewModel(state, civilizationLossInfo));
    if (next === survivalSignature) return;
    survivalSignature = next;
    clearChildren(survivalRoot);
    endDetailsTarget = addCivilizationSurvivalStrip(survivalRoot, {
      state, civilizationLossInfo,
      rect: { x: 590, y: 16, width: 1108, height: 54 },
      onOpenEndDetails,
    }).detailsTarget;
  }

  function dismissTooltipForRecap() {
    const recapOpen = isRecapOpen?.() === true;
    if (!recapOpen) {
      recapSuppressedTooltip = false;
      return false;
    }
    if (!recapSuppressedTooltip) {
      recapSuppressedTooltip = true;
      hoveredNodeId = null;
      inspectedNodeId = null;
      candidateNodeId = null;
      tooltipView?.hide?.({ force: true });
    }
    return true;
  }

  function showNodeTooltip(node, target, vassal) {
    if (dismissTooltipForRecap()) return;
    const family = getVassalLifeMapNodeFamily(node);
    if (!family || !target) return;
    const presentation = getPresentation?.() ?? {};
    const available = getDisplay(vassal, node.id, new Set(presentation.committedNodeIds ?? []),
      presentation.readOnly === true,
      presentation.state?.civilization?.vassalLineage?.pendingHeirloomLoadout === true).available;
    tooltipView?.show?.({
      title: `${family.glyph}  ${family.label}`,
      lines: [family.description],
      accentColor: family.color,
      maxWidth: 310,
      scale: 2,
      pin: !available,
      pinned: pinnedNodeIds.includes(node.id),
      activeChoice: getCandidate(presentation)?.id === node.id,
      sourceKind: "lifeMapNode",
      sourceId: node.id,
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
    if (!getCandidate() && (lastPointerType !== "touch" || inspectedNodeId == null)) tooltipView?.hide?.();
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
    lastPointerType = event?.pointerType === "touch" ? "touch" : "mouse";
    const local = root.toLocal(event.global);
    const presentation = getPresentation?.() ?? {};
    const node = getNodeAtPoint(local, presentation);
    if (!node) {
      inspectedNodeId = null;
      candidateNodeId = null;
      lastClick = { nodeId: null, atMs: 0 };
      tooltipView?.hide?.();
      render(true);
      return;
    }
    inspect(node, getDisplay(
      presentation.vassal,
      node.id,
      new Set(presentation.committedNodeIds ?? []),
      presentation.readOnly === true,
      presentation.state?.civilization?.vassalLineage?.pendingHeirloomLoadout === true
    ));
  });

  root.on("pointermove", (event) => {
    if (dismissTooltipForRecap()) return;
    if (event?.pointerType === "touch") return;
    lastPointerType = "mouse";
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
    if (dismissTooltipForRecap()) return;
    const presentation = getPresentation?.() ?? {};
    const vassal = presentation.vassal;
    const unveiling = !presentation.readOnly && !!vassal?.lifeMap?.pendingResolution;
    if (presentation.readOnly && !display.completed) onReadOnlyAction?.();
    const now = performance.now();
    const sameNode = lastClick.nodeId === node.id
      && now - lastClick.atMs <= DOUBLE_CLICK_WINDOW_MS;
    lastClick = { nodeId: node.id, atMs: now };
    hoveredNodeId = null;
    if (display.available && !unveiling) {
      inspectedNodeId = node.id;
      candidateNodeId = node.id;
      tooltipView?.hide?.({ force: true });
      if (sameNode) enterCandidate();
      render(true);
      return;
    }
    if (canOpenModal(display, unveiling)) {
      const nodePoint = nodeRoots.get(node.id)?.toGlobal?.(new PIXI.Point(0, 0));
      inspectedNodeId = node.id;
      candidateNodeId = null;
      tooltipView?.hide?.();
      onOpenDecision?.(node.id, nodePoint ? { x: nodePoint.x, y: nodePoint.y } : null);
      render(true);
      return;
    }
    if (sameNode) {
      togglePin(vassal, node.id);
      return;
    }
    inspectedNodeId = lastPointerType === "touch" ? node.id : null;
    candidateNodeId = null;
    render(true);
    showNodeTooltip(node, nodeRoots.get(node.id), vassal);
  }

  function getCandidate(presentation = getPresentation?.() ?? {}) {
    if (!root.visible || isRecapOpen?.() || presentation.vassal?.lifeMap?.pendingResolution) return null;
    const display = getDisplay(presentation.vassal, candidateNodeId,
      new Set(presentation.committedNodeIds ?? []), presentation.readOnly === true,
      presentation.state?.civilization?.vassalLineage?.pendingHeirloomLoadout === true);
    return display.available ? getVassalLifeMapNode(presentation.vassal, candidateNodeId) : null;
  }

  function enterCandidate() {
    const node = getCandidate();
    if (!node) return false;
    const point = nodeRoots.get(node.id)?.toGlobal(new PIXI.Point(0, 0));
    candidateNodeId = null;
    lastClick = { nodeId: null, atMs: 0 };
    tooltipView?.hide?.({ force: true });
    const result = onEnterNode?.(node.id);
    if (result?.ok === false) {
      candidateNodeId = node.id;
      render(true);
      return false;
    }
    onOpenDecision?.(node.id, point ? { x: point.x, y: point.y } : null);
    render(true);
    return true;
  }

  function handleKeyDown(event) {
    if (event?.repeat || event?.altKey || event?.ctrlKey || event?.metaKey || event?.shiftKey || !getCandidate()) return false;
    if (event.key === "Enter") {
      event.preventDefault();
      enterCandidate();
      return true;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      candidateNodeId = null;
      inspectedNodeId = null;
      lastClick = { nodeId: null, atMs: 0 };
      tooltipView?.hide?.({ force: true });
      render(true);
      return true;
    }
    return false;
  }

  let nodePointerHeld = false;
  function clearInteractionSelection() {
    if (hoveredNodeId || candidateNodeId || inspectedNodeId) tooltipView?.hide?.();
    hoveredNodeId = null;
    candidateNodeId = null;
    inspectedNodeId = null;
    lastClick = { nodeId: null, atMs: 0 };
  }
  function render(force = false, preparing = false) {
    if (nodePointerHeld || confirmPointerHeld || root.pendingInteractionCount > 0
      || confirmSurface.pendingInteractionCount > 0) return;
    dismissTooltipForRecap();
    const visible = isVisible?.() === true;
    root.visible = visible;
    if (!visible && !preparing) {
      // The tooltip is shared with the other screens. Clean up once on exit,
      // rather than hiding their hover details on every hidden Life Map frame.
      // A prepared scene has not been opened yet. Only clean up a screen the
      // player actually left, preserving its initial prepared selection.
      if (wasVisible) clearInteractionSelection();
      wasVisible = false;
      confirmSurface.visible = false;
      return;
    }
    wasVisible = visible;
    const presentation = getPresentation?.() ?? {};
    const state = presentation.state;
    const vassal = presentation.vassal;
    const readOnly = presentation.readOnly === true;
    const committed = new Set(presentation.committedNodeIds ?? []);
    const loadoutPending = state?.civilization?.vassalLineage?.pendingHeirloomLoadout === true;
    const nodes = getVassalLifeMapNodes(vassal);
    layoutPoints=layoutChronicleNodes(nodes,{x:MAP_RECT.x+92,y:MAP_RECT.y+158,
      width:MAP_RECT.width-184,height:MAP_RECT.height-218});
    if ((vassal?.vassalId ?? null) !== displayedVassalId) {
      displayedVassalId = vassal?.vassalId ?? null;
      inspectedNodeId = presentation.playheadNodeId ?? null;
      candidateNodeId = null;
      lastClick = { nodeId: null, atMs: 0 };
      pinnedNodeIds = [];
    }
    const unveiling = !readOnly && !!vassal?.lifeMap?.pendingResolution;
    root.cursor = unveiling ? "wait" : "default";
    const reachable = new Set(getVassalLifeMapReachableNodeIds(vassal));
    pinnedNodeIds = pinnedNodeIds.filter((id) => reachable.has(id));
    const planned = getVassalLifeMapPlannedRoute(vassal, pinnedNodeIds);
    const plannedEdges = new Set(planned?.edgeKeys ?? []);
    const effectiveNodeId = hoveredNodeId ?? inspectedNodeId ?? vassal?.lifeMap?.currentNodeId
      ?? presentation.playheadNodeId ?? null;
    const civilizationLossInfo = getCivilizationLossInfo?.();
    // Cache what this screen draws. Unrelated settlement state and a moving
    // forecast second must not discard an already prepared Life Map.
    const nextSignature = getArtRevision() + JSON.stringify({
      vassal, committedNodeIds: presentation.committedNodeIds, playheadNodeId: presentation.playheadNodeId,
      readOnly, projected: presentation.viewedSec > presentation.frontierSec, loadoutPending,
      effectiveNodeId, candidateNodeId, hoveredNodeId, pinnedNodeIds, unveiling,
    });
    if (!force && nextSignature === signature) {
      updateSurvivalChrome(state, civilizationLossInfo);
      confirmSurface.visible = visible && confirmVisibleWhenShown;
      return;
    }
    signature = nextSignature;
    buildCount++;
    clearChildren(root);
    clearChildren(confirmSurface);
    confirmSurface.visible = false;
    nodeRoots.clear();
    openRoot = null;
    updateSurvivalChrome(state, civilizationLossInfo);
    root.addChild(createText(vassal?.founderClassId ? `${vassal.archetype.toUpperCase()} CHRONICLE` : 'VASSAL CHRONICLE',{...TEXT_STYLES.title,fontSize:25,fill:PALETTE.accent},78,32));

    const bg = new PIXI.Graphics();
    roundedRect(bg, MAP_RECT.x, MAP_RECT.y, MAP_RECT.width, MAP_RECT.height, 10,
      PALETTE.panel, PALETTE.stroke, 2);
    root.addChild(bg);
    addGateBackdrop(root,MAP_RECT,.15);
    if (!vassal) {
      root.addChild(createText("No Vassal had been appointed at this point in the timeline.", {
        ...TEXT_STYLES.header, fontSize: 22, fill: PALETTE.textMuted,
      }, MAP_RECT.x + 70, MAP_RECT.y + 180));
      return;
    }

    if (readOnly || unveiling) {
      root.addChild(createText(readOnly
        ? presentation.viewedSec > presentation.frontierSec
          ? "PROJECTED FUTURE · RETURN TO PRESENT TO MAKE DECISIONS"
          : "FIXED HISTORY · CLICK A COMMITTED NODE FOR DETAILS"
        : "TIME IS UNVEILING THIS TURNING POINT", {
        ...TEXT_STYLES.body, fontSize: 18, fill: PALETTE.textMuted,
      }, MAP_RECT.x + 22, MAP_RECT.y + MAP_RECT.height - 36));
    }
    const committedPath = presentation.committedNodeIds ?? [];
    const completedEdges = new Set(committedPath.slice(1).map((id, index) => `${committedPath[index]}:${id}`));
    const pinResetNodeIds = new Set();
    if (pinnedNodeIds.length > 0) {
      for (const node of nodes) {
        const display = getDisplay(vassal, node.id, committed, readOnly, loadoutPending);
        if (pinnedNodeIds.includes(node.id) || canOpenModal(display, unveiling)) continue;
        const nextPins = nextVassalLifeMapPins(vassal, pinnedNodeIds, node.id);
        if (nextPins.length === 1 && nextPins[0] === node.id) pinResetNodeIds.add(node.id);
      }
    }
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
        // Only the incoming pathway signals that pinning this node replaces the plan.
        if (pinResetNodeIds.has(nextId)) {
          edges.lineStyle(6, 0x000000, 1)
            .moveTo(from.x,from.y).bezierCurveTo(mid,from.y,mid,to.y,to.x,to.y);
          continue;
        }
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
      const display = getDisplay(vassal, node.id, committed, readOnly, loadoutPending);
      const point = nodePoint(node);
      const family = getVassalLifeMapNodeFamily(node) ?? {};
      const nodeRoot = new PIXI.Container();
      nodeRoot.position.set(point.x, point.y);
      nodeRoot.eventMode = "static";
      const reachableNode = reachable.has(node.id);
      const inactive = !display.completed && !display.current && !display.available && !reachableNode;
      nodeRoot.cursor = unveiling ? "wait" : canOpenModal(display, unveiling) ? "pointer" : "help";
      nodeRoot.hitArea = new PIXI.Circle(0, 0, NODE_RADIUS + 9);
      nodeRoot.on("pointerdown", (event) => {
        event?.stopPropagation?.();
        lastPointerType = event?.pointerType === "touch" ? "touch" : "mouse";
        nodePointerHeld = true;
      });
      for (const type of ["pointerup", "pointerupoutside", "pointercancel"]) {
        nodeRoot.on(type, () => { nodePointerHeld = false; });
      }
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
      addInteractionFeedback(nodeRoot, { x: -40, y: -40, width: 80, height: 80 }, {
        enabled: !unveiling, onActivate: () => inspect(node, display),
      });
      root.addChild(nodeRoot);
      nodeRoots.set(node.id, nodeRoot);
    }

    const candidate = getCandidate(presentation);
    if (candidate) {
      confirmSurface.visible = true;
      openRoot = confirmDockButton(confirmSurface, app, {
        enabled: true, label: "Enter", onClick: enterCandidate,
      });
      if (visible && (hoveredNodeId == null || hoveredNodeId === candidate.id)) {
        showNodeTooltip(candidate, nodeRoots.get(candidate.id), vassal);
      }
    }
    confirmVisibleWhenShown = confirmSurface.visible;
    confirmSurface.visible = visible && confirmVisibleWhenShown;
  }

  return {
    init: () => render(true), update: () => render(), refresh: () => render(true),
    setVisible: (visible) => {
      root.visible = visible === true;
      if (!root.visible) confirmSurface.visible = false;
    },
    handleKeyDown,
    getCandidateNodeId: () => getCandidate()?.id ?? null,
    getNodeClickPoint(nodeId) {
      const target = nodeRoots.get(nodeId);
      const point = root.visible && target && !target.destroyed
        ? target.toGlobal(new PIXI.Point(0, 0)) : null;
      return point ? { x: point.x, y: point.y } : null;
    },
    getEnterNodeClickPoint: () => {
      if (!getCandidate() || !openRoot || !confirmSurface.visible) return null;
      const rect = openRoot.getBounds();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    },
    getEndDetailsClickPoint: () => getSurvivalEndDetailsClickPoint(endDetailsTarget, root.visible),
    async prepare(renderer) {
      if (!getPresentation?.()?.vassal) return;
      if (wasVisible && isVisible?.() !== true) clearInteractionSelection();
      render(false, true);
      confirmSurface.visible = false;
      renderer.prepare.add(root);
      renderer.prepare.add(confirmSurface);
      await renderer.prepare.upload();
    },
    getPreparationSnapshot: () => ({ visible: root.visible, nodeCount: nodeRoots.size, buildCount }),
    getPinnedNodeIds: () => [...pinnedNodeIds],
    getInspectedNodeId: () => inspectedNodeId,
  };
}
