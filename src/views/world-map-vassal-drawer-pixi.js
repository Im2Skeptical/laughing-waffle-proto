import { createProtovassalDossier } from './protovassal-dossier-pixi.js';
import { getVassalClassArtRevision } from './vassal-class-art.js';
import { VASSAL_SIGNATURE_NODE_VARIANTS } from "../defs/gamepieces/vassal-life-map-defs.js";
import { getRegionReference } from "../model/world-state.js";
import { getVassalStatsPresentation } from '../model/vassal-life-map.js';
import { clearChildren, createText, roundedRect } from "./settlement-view-primitives.js";
import { PALETTE, TEXT_STYLES } from "./settlement-theme.js";
import { createVassalPortraitView } from "./vassal-portrait-pixi.js";
import { getArtRevision } from './chronicle-art.js';
import { buildDetailedVassalSelectionPool } from '../model/detailed-settlements.js';

const VIEWPORT = Object.freeze({ width: 2424, height: 1080 });
const DRAWER_RECT = Object.freeze({ x: 432, y: 636, width: 1560, height: 438 });
const REROLL_RECT = Object.freeze({ x: 1714, y: 648, width: 256, height: 40 });

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
    size: 132, classId: candidate.classId, borderColor: selected ? PALETTE.green : PALETTE.accent, stage: 'youth',
  });
  portrait.position.set(18, 15);
  root.addChild(portrait);
  const locationRef = getRegionReference(state, candidate.locationRegionId) ?? candidate.locationRegionId;
  const stats = getVassalStatsPresentation(candidate);
  const signature = VASSAL_SIGNATURE_NODE_VARIANTS[candidate.signatureNode?.variantId]
    ?? candidate.signatureNode ?? {};
  root.addChild(
    createText(`VASSAL ${candidate.candidateIndex + 1}`, {
      ...TEXT_STYLES.title, fontSize: 25, fill: selected ? PALETTE.green : PALETTE.text,
    }, 168, 18),
    createText(`${candidate.archetype ?? "Unclassed"} · ${locationRef}  ·  Age ${candidate.age}  ·  Prestige ${candidate.prestige}`, {
      ...TEXT_STYLES.body, fontSize: 19, fill: PALETTE.textMuted,
    }, 168, 59),
    createText(stats.map(stat => `${stat.label.slice(0, 3).toUpperCase()} ${stat.value}`).join('   '), {
      ...TEXT_STYLES.chip, fontSize: 18, fill: PALETTE.text,
      wordWrap:true,wordWrapWidth:rect.width-188,
    }, 168, 96),
    createText(`${signature.glyph ?? "★"}  ${signature.label ?? "Signature Node"}`, {
      ...TEXT_STYLES.header, fontSize: 24, fill: signature.color ?? PALETTE.accent,
    }, 18, 178),
    createText(signature.description ?? "A defining opportunity unique to this Vassal.", {
      ...TEXT_STYLES.body, fontSize: 21, fill: PALETTE.textMuted,
      wordWrap: true, wordWrapWidth: rect.width - 36, lineHeight: 25,
    }, 18, 219),
    createText(selected ? "SELECTED · DOUBLE-TAP TO CONFIRM" : "TAP TO PREVIEW", {
      ...TEXT_STYLES.chip, fontSize: 17, fill: selected ? PALETTE.green : PALETTE.accent,
    }, 18, rect.height - 22)
  );
  parent.addChild(root);
  return root;
}

export function createWorldMapVassalDrawerView({
  layer, getState, getSelectionPool, getSelectedCandidateIndex, isOpen,
  onPreviewCandidate, onConfirmCandidate, onHoverCandidate, onReroll, onClose, tooltipView = null,
} = {}) {
  const root = new PIXI.Container();
  root.zIndex = 12;
  layer?.addChild(root);
  let signature = "";
  let buildCount = 0;
  let candidateRoots = [];
  let rerollRoot = null;
  let founderDossier = null, founderSignature = "", wasOpen = false, fading = false;
  let lastTapIndex=null,lastTapTime=0;
  function tapCandidate(index){
    const now=performance.now();
    const confirm=getSelectedCandidateIndex?.()===index&&lastTapIndex===index&&now-lastTapTime<=450;
    lastTapIndex=index;lastTapTime=now;
    if(confirm){lastTapIndex=null;onConfirmCandidate?.(index);}
    else onPreviewCandidate?.(index);
  }

  // The founder picker persists between redraws so its open, close and page
  // transitions play; it only rebuilds when the pool or artwork changes.
  // The dock's Confirm button is the way to begin, so the class on show must
  // already be the selected candidate; preview it (outside this render) if not.
  let autoPreviewQueued = false;
  function ensureFounderSelected(pool, selectedIndex) {
    if (selectedIndex != null || autoPreviewQueued || !pool.candidates.length) return;
    autoPreviewQueued = true;
    queueMicrotask(() => {
      autoPreviewQueued = false;
      if (isOpen?.() === true && getSelectedCandidateIndex?.() == null) onPreviewCandidate?.(pool.candidates[0].candidateIndex);
    });
  }

  function renderFounder(pool, selectedIndex, open, force) {
    if (open) ensureFounderSelected(pool, selectedIndex);
    const sig = `${getArtRevision()}:${getVassalClassArtRevision()}:${JSON.stringify(pool.candidates.map(c => [c.candidateIndex, c.founderClassId, c.stats]))}`;
    const justOpened = open && !wasOpen;
    if (!founderDossier || force || sig !== founderSignature) {
      founderDossier?.destroyTooltip?.();
      clearChildren(root);
      const blocker = new PIXI.Graphics();
      blocker.beginFill(0x000000, 0.001).drawRect(0, 0, VIEWPORT.width, VIEWPORT.height).endFill();
      blocker.eventMode = "static";
      root.addChild(blocker);
      founderDossier = createProtovassalDossier({candidates:pool.candidates,selectedIndex,onPreview:onPreviewCandidate,onConfirm:onConfirmCandidate,onClose,tooltipView});
      founderSignature = sig;
      root.addChild(founderDossier);candidateRoots=founderDossier.candidateRoots;rerollRoot=null;
      buildCount++;
      if (open) founderDossier.open();
    } else {
      if (justOpened) founderDossier.open();
      founderDossier.select(selectedIndex);
    }
  }

  function render(force = false, preparing = false) {
    const open = isOpen?.() === true;
    if (!open && !preparing && founderDossier) {
      // A picker that was showing plays its close transition before hiding.
      if (wasOpen) { founderDossier.close(); fading = true; }
      if (fading) { founderDossier.update(); fading = !founderDossier.isGone(); }
      root.visible = fading; wasOpen = false; lastTapIndex = null;
      return;
    }
    root.visible = open;
    if (!open && !preparing) {
      lastTapIndex=null; wasOpen = false;
      return;
    }
    const state = getState?.();
    const pool = getSelectionPool?.() ?? (preparing ? buildDetailedVassalSelectionPool(state) : null);
    const selectedIndex = getSelectedCandidateIndex?.() ?? null;
    if (pool?.candidates?.[0]?.founderClassId) {
      renderFounder(pool, selectedIndex, open, force);
      fading = false; wasOpen = open;
      if (open) founderDossier.update();
      return;
    }
    const next = getArtRevision() + getVassalClassArtRevision() + JSON.stringify({ tSec: state?.tSec, pool, selectedIndex });
    if (!force && next === signature) return;
    signature = next;
    buildCount++;
    clearChildren(root);
    founderDossier=null;

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
      ...TEXT_STYLES.header, fontSize: 27,
    }, DRAWER_RECT.x + 24, DRAWER_RECT.y + 17));

    rerollRoot = new PIXI.Container();
    rerollRoot.position.set(REROLL_RECT.x, REROLL_RECT.y);
    rerollRoot.eventMode = "static";
    rerollRoot.cursor = "pointer";
    rerollRoot.hitArea = new PIXI.Rectangle(0, 0, REROLL_RECT.width, REROLL_RECT.height);
    rerollRoot.on("pointerdown", (event) => { event?.stopPropagation?.(); lastTapIndex=null; onReroll?.(); });
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
      onPreview: tapCandidate, onHover: onHoverCandidate,
    }));
  }

  return {
    init: () => render(true), update: () => render(), refresh: () => render(),
    async prepare(renderer) {
      render(false, true);
      await renderer.prepare.upload(root);
    },
    getPreparationSnapshot: () => ({ visible: root.visible, candidateCount: candidateRoots.length, buildCount,
      portraitStages: candidateRoots.map(card => card.portraitStage ?? card.children.find(child => child.portraitStage)?.portraitStage) }),
    setVisible: (visible) => { root.visible = visible === true; },
    handleKeyDown: event => root.visible && !!founderDossier && isOpen?.() === true && founderDossier.handleKeyDown(event),
    getFounderSnapshot: () => root.visible ? founderDossier?.getSnapshot() ?? null : null,
    getFounderControlClickPoint: id => {
      const control=founderDossier?.controls[id];
      if(!root.visible || !control || control.destroyed)return null;
      const hit=control.hitArea, pts=hit.points;
      const area=Array.isArray(pts)&&pts.length>=2?(()=>{const xs=pts.filter((_,i)=>i%2===0),ys=pts.filter((_,i)=>i%2===1);
        return {x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)};})():{x:hit.x??0,y:hit.y??0,width:hit.width,height:hit.height};
      const point=control.toGlobal(new PIXI.Point(area.x+area.width/2,area.y+area.height/2));
      return {x:point.x,y:point.y};
    },
    getCandidateClickPoint: (candidateIndex = 0) => {
      const card = candidateRoots[Math.max(0, Math.floor(candidateIndex))];
      if (!root.visible || !card?.visible || typeof card.toGlobal !== "function") return null;
      const point = card.toGlobal(new PIXI.Point(card.hitArea.width / 2, card.hitArea.height / 2));
      return { x: Number(point?.x ?? 0), y: Number(point?.y ?? 0) };
    },
    getRerollClickPoint: () => {
      if (!root.visible || !rerollRoot?.visible || typeof rerollRoot.toGlobal !== "function") return null;
      const point = rerollRoot.toGlobal(new PIXI.Point(REROLL_RECT.width / 2, REROLL_RECT.height / 2));
      return { x: Number(point?.x ?? 0), y: Number(point?.y ?? 0) };
    },
    getCloseClickPoint: () => null,
  };
}
