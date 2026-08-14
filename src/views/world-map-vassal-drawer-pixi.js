import { describeDetailedVassalIntervention } from "../model/detailed-settlements.js";
import { getRegionReference } from "../model/world-state.js";
import { clearChildren, createText, roundedRect } from "./settlement-view-primitives.js";
import { PALETTE, TEXT_STYLES } from "./settlement-theme.js";

const DRAWER_RECT = Object.freeze({ x: 58, y: 610, width: 1640, height: 198 });
const REROLL_RECT = Object.freeze({ x: 1422, y: 620, width: 256, height: 30 });
const CLOSE_RECT = Object.freeze({ x: 1360, y: 620, width: 52, height: 30 });

function candidateCard(parent, rect, state, candidate, { onSelect, onHover }) {
  const root = new PIXI.Container();
  root.position.set(rect.x, rect.y);
  root.eventMode = "static";
  root.cursor = "pointer";
  root.hitArea = new PIXI.Rectangle(0, 0, rect.width, rect.height);
  root.on("pointerdown", (event) => {
    event?.stopPropagation?.();
    onSelect?.(candidate.candidateIndex);
  });
  root.on("pointerover", () => onHover?.(candidate));
  root.on("pointerout", () => onHover?.(null));
  const gfx = new PIXI.Graphics();
  roundedRect(gfx, 0, 0, rect.width, rect.height, 10, 0x4d4740, PALETTE.accent, 2);
  root.addChild(gfx);
  const targetRef = getRegionReference(state, candidate.targetRegionId) ?? candidate.targetRegionId;
  const lifespan = `Age ${candidate.initialAge} → ${candidate.deathAge} · ${Math.max(1, candidate.deathAge - candidate.initialAge)} years`;
  root.addChild(
    createText(`VASSAL ${candidate.candidateIndex + 1} · Target: ${targetRef} Settlement`,
      { ...TEXT_STYLES.title, fontSize: 17 }, 16, 14),
    createText(lifespan, { ...TEXT_STYLES.body, fontSize: 13 }, 16, 42),
    createText(`Resistance ${candidate.resistanceSnapshot} · ${candidate.traitId} ${candidate.traitPrestigeModifier >= 0 ? "+" : ""}${candidate.traitPrestigeModifier}`,
      { ...TEXT_STYLES.body, fontSize: 13, fill: PALETTE.textMuted }, 16, 64)
  );
  (candidate.interventions ?? []).forEach((entry, index) => {
    root.addChild(createText(
      `${index + 1}. ${describeDetailedVassalIntervention(state, candidate.targetRegionId, entry)} · gate ${entry.requiredPrestige}`,
      { ...TEXT_STYLES.body, fontSize: 13, fill: index === 0 ? PALETTE.accent : PALETTE.text },
      16,
      94 + index * 25
    ));
  });
  parent.addChild(root);
  return root;
}

export function createWorldMapVassalDrawerView({
  layer,
  getState,
  getSelectionPool,
  isOpen,
  onSelectCandidate,
  onHoverCandidate,
  onReroll,
  onClose,
} = {}) {
  const root = new PIXI.Container();
  root.zIndex = 12;
  layer?.addChild(root);
  let signature = "";
  let candidateRoots = [];
  let rerollRoot = null;
  let closeRoot = null;

  function render(force = false) {
    const open = isOpen?.() === true;
    root.visible = open;
    if (!open) {
      signature = "";
      candidateRoots = [];
      rerollRoot = null;
      closeRoot = null;
      clearChildren(root);
      return;
    }
    const state = getState?.();
    const pool = getSelectionPool?.();
    const next = JSON.stringify({ tSec: state?.tSec, pool });
    if (!force && next === signature) return;
    signature = next;
    clearChildren(root);
    const frame = new PIXI.Graphics();
    roundedRect(frame, DRAWER_RECT.x, DRAWER_RECT.y, DRAWER_RECT.width, DRAWER_RECT.height,
      10, PALETTE.panel, PALETTE.accent, 3);
    root.addChild(frame, createText("CHOOSE A VASSAL · hover to inspect the target", {
      ...TEXT_STYLES.header,
      fontSize: 16,
    }, DRAWER_RECT.x + 16, DRAWER_RECT.y + 12));
    rerollRoot = new PIXI.Container();
    rerollRoot.position.set(REROLL_RECT.x, REROLL_RECT.y);
    rerollRoot.eventMode = "static";
    rerollRoot.cursor = "pointer";
    rerollRoot.hitArea = new PIXI.Rectangle(0, 0, REROLL_RECT.width, REROLL_RECT.height);
    rerollRoot.on("pointerdown", (event) => {
      event?.stopPropagation?.();
      onReroll?.();
    });
    const rerollBackground = new PIXI.Graphics();
    roundedRect(rerollBackground, 0, 0, REROLL_RECT.width, REROLL_RECT.height,
      8, 0x314c2b, PALETTE.accent, 2);
    rerollRoot.addChild(
      rerollBackground,
      createText("REROLL VASSALS", { ...TEXT_STYLES.body, fontSize: 13, fill: PALETTE.text }, 64, 7)
    );
    root.addChild(rerollRoot);
    closeRoot = new PIXI.Container();
    closeRoot.position.set(CLOSE_RECT.x, CLOSE_RECT.y);
    closeRoot.eventMode = "static";
    closeRoot.cursor = "pointer";
    closeRoot.hitArea = new PIXI.Rectangle(0, 0, CLOSE_RECT.width, CLOSE_RECT.height);
    closeRoot.on("pointerdown", (event) => {
      event?.stopPropagation?.();
      onClose?.();
    });
    const closeBackground = new PIXI.Graphics();
    roundedRect(closeBackground, 0, 0, CLOSE_RECT.width, CLOSE_RECT.height,
      8, 0x4d4740, PALETTE.textMuted, 1);
    closeRoot.addChild(
      closeBackground,
      createText("×", { ...TEXT_STYLES.title, fontSize: 21, fill: PALETTE.text }, 18, 1)
    );
    root.addChild(closeRoot);
    const candidates = pool?.candidates ?? [];
    const gap = 14;
    const cardY = DRAWER_RECT.y + 42;
    const cardWidth = Math.floor((DRAWER_RECT.width - 32 - gap * 2) / 3);
    candidateRoots = candidates.slice(0, 3).map((candidate, index) => candidateCard(root, {
      x: DRAWER_RECT.x + 16 + index * (cardWidth + gap),
      y: cardY,
      width: cardWidth,
      height: DRAWER_RECT.height - 58,
    }, state, candidate, {
      onSelect: onSelectCandidate,
      onHover: onHoverCandidate,
    }));
  }

  return {
    init: () => render(true),
    update: () => render(),
    refresh: () => render(true),
    setVisible: (visible) => { root.visible = visible === true; },
    getCandidateClickPoint: (candidateIndex = 0) => {
      const card = candidateRoots[Math.max(0, Math.floor(candidateIndex))];
      if (!card?.visible || typeof card.toGlobal !== "function") return null;
      const point = card.toGlobal(new PIXI.Point(card.hitArea.width / 2, card.hitArea.height / 2));
      return { x: Number(point?.x ?? 0), y: Number(point?.y ?? 0) };
    },
    getRerollClickPoint: () => {
      if (!rerollRoot?.visible || typeof rerollRoot.toGlobal !== "function") return null;
      const point = rerollRoot.toGlobal(new PIXI.Point(REROLL_RECT.width / 2, REROLL_RECT.height / 2));
      return { x: Number(point?.x ?? 0), y: Number(point?.y ?? 0) };
    },
    getCloseClickPoint: () => {
      if (!closeRoot?.visible || typeof closeRoot.toGlobal !== "function") return null;
      const point = closeRoot.toGlobal(new PIXI.Point(CLOSE_RECT.width / 2, CLOSE_RECT.height / 2));
      return { x: Number(point?.x ?? 0), y: Number(point?.y ?? 0) };
    },
  };
}
