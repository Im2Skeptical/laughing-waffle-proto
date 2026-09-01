import { VASSAL_SIGNATURE_NODE_VARIANTS } from "../defs/gamepieces/vassal-life-map-defs.js";
import { getRegionReference } from "../model/world-state.js";
import { clearChildren, createText, roundedRect } from "./settlement-view-primitives.js";
import { PALETTE, TEXT_STYLES } from "./settlement-theme.js";
import { createVassalPortraitView } from "./vassal-portrait-pixi.js";

const VIEWPORT = Object.freeze({ width: 2424, height: 1080 });
const DRAWER_RECT = Object.freeze({ x: 432, y: 808, width: 1560, height: 266 });
const REROLL_RECT = Object.freeze({ x: 1714, y: 818, width: 256, height: 34 });

function candidateCard(parent, rect, state, candidate, selected, { onPreview, onHover }) {
  const root = new PIXI.Container();
  root.position.set(rect.x, rect.y);
  root.eventMode = "static";
  root.cursor = "pointer";
  root.hitArea = new PIXI.Rectangle(0, 0, rect.width, rect.height);
  root.on("pointerdown", (event) => { event?.stopPropagation?.(); onPreview?.(candidate.candidateIndex); });
  root.on("pointerover", () => onHover?.(candidate));
  root.on("pointerout", () => onHover?.(null));
  const gfx = new PIXI.Graphics();
  roundedRect(gfx, 0, 0, rect.width, rect.height, 12,
    selected ? 0x3e513a : 0x3b3b36, selected ? PALETTE.green : PALETTE.accent,
    selected ? 4 : 2);
  root.addChild(gfx);

  const portrait = createVassalPortraitView(candidate.portrait, {
    size: 104, borderColor: selected ? PALETTE.green : PALETTE.accent,
  });
  portrait.position.set(18, -50);
  root.addChild(portrait);
  const locationRef = getRegionReference(state, candidate.locationRegionId) ?? candidate.locationRegionId;
  const stats = candidate.stats ?? {};
  const signature = VASSAL_SIGNATURE_NODE_VARIANTS[candidate.signatureNode?.variantId]
    ?? candidate.signatureNode ?? {};
  root.addChild(
    createText(`VASSAL ${candidate.candidateIndex + 1}`, {
      ...TEXT_STYLES.title, fontSize: 18, fill: selected ? PALETTE.green : PALETTE.text,
    }, 138, 13),
    createText(`${locationRef}  ·  Age ${candidate.age}  ·  Prestige ${candidate.prestige}`, {
      ...TEXT_STYLES.body, fontSize: 14, fill: PALETTE.textMuted,
    }, 138, 42),
    createText(`CUN ${stats.cunning ?? 0}   WIS ${stats.wisdom ?? 0}   EFF ${stats.effectiveness ?? 0}   INT ${stats.intelligence ?? 0}`, {
      ...TEXT_STYLES.chip, fontSize: 13, fill: PALETTE.text,
    }, 138, 70),
    createText(`${signature.glyph ?? "★"}  ${signature.label ?? "Signature Node"}`, {
      ...TEXT_STYLES.header, fontSize: 18, fill: signature.color ?? PALETTE.accent,
    }, 18, 108),
    createText(signature.description ?? "A defining opportunity unique to this Vassal.", {
      ...TEXT_STYLES.body, fontSize: 13, fill: PALETTE.textMuted,
      wordWrap: true, wordWrapWidth: rect.width - 36, lineHeight: 16,
    }, 18, 137),
    createText(selected ? "SELECTED · CONFIRM WITH THE LOWER-LEFT CONTROL" : "TAP TO PREVIEW", {
      ...TEXT_STYLES.chip, fontSize: 11, fill: selected ? PALETTE.green : PALETTE.accent,
    }, 18, rect.height - 22)
  );
  parent.addChild(root);
  return root;
}

export function createWorldMapVassalDrawerView({
  layer, getState, getSelectionPool, getSelectedCandidateIndex, isOpen,
  onPreviewCandidate, onHoverCandidate, onReroll, onClose,
} = {}) {
  const root = new PIXI.Container();
  root.zIndex = 12;
  layer?.addChild(root);
  let signature = "";
  let candidateRoots = [];
  let rerollRoot = null;

  function render(force = false) {
    const open = isOpen?.() === true;
    root.visible = open;
    if (!open) {
      signature = ""; candidateRoots = []; rerollRoot = null; clearChildren(root); return;
    }
    const state = getState?.();
    const pool = getSelectionPool?.();
    const selectedIndex = getSelectedCandidateIndex?.() ?? null;
    const next = JSON.stringify({ tSec: state?.tSec, pool, selectedIndex });
    if (!force && next === signature) return;
    signature = next;
    clearChildren(root);

    const blocker = new PIXI.Graphics();
    blocker.beginFill(0x000000, 0.001).drawRect(0, 0, VIEWPORT.width, VIEWPORT.height).endFill();
    blocker.eventMode = "static";
    blocker.on("pointerdown", (event) => { event?.stopPropagation?.(); onClose?.(); });
    root.addChild(blocker);

    const frame = new PIXI.Graphics();
    roundedRect(frame, DRAWER_RECT.x, DRAWER_RECT.y, DRAWER_RECT.width, DRAWER_RECT.height,
      12, PALETTE.panel, PALETTE.accent, 3);
    frame.eventMode = "static";
    frame.on("pointerdown", (event) => event?.stopPropagation?.());
    root.addChild(frame, createText("CHOOSE A VASSAL", {
      ...TEXT_STYLES.header, fontSize: 16,
    }, DRAWER_RECT.x + 158, DRAWER_RECT.y + 12));

    rerollRoot = new PIXI.Container();
    rerollRoot.position.set(REROLL_RECT.x, REROLL_RECT.y);
    rerollRoot.eventMode = "static";
    rerollRoot.cursor = "pointer";
    rerollRoot.hitArea = new PIXI.Rectangle(0, 0, REROLL_RECT.width, REROLL_RECT.height);
    rerollRoot.on("pointerdown", (event) => { event?.stopPropagation?.(); onReroll?.(); });
    const rerollBackground = new PIXI.Graphics();
    roundedRect(rerollBackground, 0, 0, REROLL_RECT.width, REROLL_RECT.height,
      8, 0x314c2b, PALETTE.accent, 2);
    rerollRoot.addChild(rerollBackground, createText("REROLL VASSALS", {
      ...TEXT_STYLES.body, fontSize: 13, fill: PALETTE.text,
    }, REROLL_RECT.width / 2, REROLL_RECT.height / 2, 0.5, 0.5));
    root.addChild(rerollRoot);

    const candidates = pool?.candidates ?? [];
    const gap = 14;
    const cardY = DRAWER_RECT.y + 72;
    const cardWidth = Math.floor((DRAWER_RECT.width - 32 - gap * 2) / 3);
    candidateRoots = candidates.slice(0, 3).map((candidate, index) => candidateCard(root, {
      x: DRAWER_RECT.x + 16 + index * (cardWidth + gap), y: cardY,
      width: cardWidth, height: DRAWER_RECT.height - 82,
    }, state, candidate, selectedIndex === candidate.candidateIndex, {
      onPreview: onPreviewCandidate, onHover: onHoverCandidate,
    }));
  }

  return {
    init: () => render(true), update: () => render(), refresh: () => render(true),
    setVisible: (visible) => { root.visible = visible === true; },
    getCandidateClickPoint: (candidateIndex = 0) => {
      const card = candidateRoots[Math.max(0, Math.floor(candidateIndex))];
      if (!card?.visible || typeof card.toGlobal !== "function") return null;
      const point = card.toGlobal(new PIXI.Point(card.hitArea.width / 2, card.hitArea.height / 2 - 28));
      return { x: Number(point?.x ?? 0), y: Number(point?.y ?? 0) };
    },
    getRerollClickPoint: () => {
      if (!rerollRoot?.visible || typeof rerollRoot.toGlobal !== "function") return null;
      const point = rerollRoot.toGlobal(new PIXI.Point(REROLL_RECT.width / 2, REROLL_RECT.height / 2));
      return { x: Number(point?.x ?? 0), y: Number(point?.y ?? 0) };
    },
    getCloseClickPoint: () => null,
  };
}
