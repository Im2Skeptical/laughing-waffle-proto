import { addInteractionFeedback } from "./interaction-feedback.js";
import { getVassalAge, getVassalStatPresentation } from "../model/vassal-life-map.js";
import { clearChildren } from "./settlement-view-primitives.js";
import { getArtRevision, getChronicleTexture } from './chronicle-art.js';
import { RELIC, getStoneTexture } from './chronicle-skin.js';
import { addPaintedPanel, addPaintedSocket, addPaintedWindow } from './painted-frames.js';
import { FRAME_PREFIX, WINDOW_FRAME } from './painted-frame-spec.js';
import { PANEL as GRAPH_AREA } from './vassal-node-decision/constants.js';
import { FOUNDER_CLASSES, STAT_ICONS } from './protovassal-class-data.js';
import { addResourceIcon } from './resource-cost-pixi.js';

// Presentation after one more point. Raising the stored stat (rather than passing
// a value override) keeps derived effects such as Wisdom's EXP income correct.
function raised(vassal, statId) {
  const next = { ...vassal, stats: { ...vassal.stats, [statId]: Math.max(0, Math.floor(vassal?.stats?.[statId] ?? 0)) + 1 } };
  return getVassalStatPresentation(next, statId);
}

// "Rite of Ascension": the Lifegraph level-up. A class-tinted carved window sits
// over the graph area (top bar and dock stay visible). Three carved stat tablets
// show only the change; the current effect and formula live in the shared
// tooltip (hover on mouse, tap to pin on touch), as Practices and the class
// picker do. The queue and its blocking rules are owned by the model.
const FONT = 'Georgia';
const WIN = Object.freeze({ width: 1560, height: 684 });
const TABLET = Object.freeze({ y: 102, width: 440, height: 390, gap: 40 });
const PLAQUE = Object.freeze({ width: 560, slotY: 510, slotHeight: 136 });
const BANNER = Object.freeze({ width: 600, height: 84, y: 12 });
const STAT_COLORS = Object.freeze({
  cunning: 0xd69a62, wisdom: 0x7fb2de, effectiveness: 0x8fbf79, intelligence: 0xb994d8,
});
const BRONZE = 0xffdc91, IRON = 0x6f736f;
const OPEN_MS = 200, CLOSE_MS = 140, LIFT_MS = 120, LIFT_PX = 12;
const MIN_CSS_TEXT = 12, MIN_CSS_BUTTON = 46;
const ease = t => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;
const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
const now = () => performance.now();

function text(parent, copy, x, y, size, options = {}, ax = 0, ay = 0) {
  const node = new PIXI.Text(copy, { fontFamily: FONT, fontSize: Math.round(size), fill: RELIC.bone, ...options });
  node.anchor.set(ax, ay); node.position.set(x, y); parent.addChild(node); return node;
}

// Level pips are the amber stud cut from the carved corner (no new art); filled
// pips glow amber, spent/empty ones are iron. Vector gems while the atlas loads.
const STUD = Object.freeze({ x: 6, y: 5, size: 10 });
function studTexture() {
  const corner = getChronicleTexture(`${FRAME_PREFIX}${WINDOW_FRAME.pieces.cornerTl}.png`);
  if (!corner?.baseTexture?.valid || corner.valid === false) return null;
  const f = corner.frame;
  return new PIXI.Texture(corner.baseTexture, new PIXI.Rectangle(f.x + STUD.x, f.y + STUD.y, STUD.size, STUD.size));
}
function addPip(parent, x, y, size, lit, stud) {
  if (stud) {
    const s = new PIXI.Sprite(stud); s.anchor.set(.5); s.position.set(x, y); s.width = s.height = size;
    s.tint = lit ? 0xffffff : 0x55554f; s.alpha = lit ? 1 : .75; parent.addChild(s); return s;
  }
  const g = new PIXI.Graphics(); g.position.set(x, y);
  g.lineStyle(2, RELIC.brass, 1).beginFill(lit ? 0xc46a1c : 0x2b2b28).drawCircle(0, 0, size / 2 - 1).endFill();
  if (lit) g.lineStyle(0).beginFill(0xffd08a, .9).drawCircle(-size * .14, -size * .14, size * .14).endFill();
  parent.addChild(g); return g;
}

const para = (title, body) => ({ type: 'paragraph', title, text: body });
// Tooltip spec for one offered stat: what it does now, what it becomes, and why.
export function levelUpTooltipSpec(vassal, statId) {
  const before = getVassalStatPresentation(vassal, statId);
  const after = raised(vassal, statId);
  return {
    sourceKind: 'vassalLevelUp', sourceId: statId, maxWidth: 300, scale: 2.6, pin: true,
    title: before.label, subtitle: `Attribute · ${before.value} → ${after.value}`,
    accentColor: STAT_COLORS[statId] ?? RELIC.gold,
    sections: [
      para('NOW', before.powerLabel),
      para('AFTER', after.powerLabel),
      para('HOW', after.formula),
      ...(after.pointsToCap === 0 ? [para('CAP', 'This attribute is at its cap.')] : []),
    ],
  };
}

export function createVassalLevelUpModalView({
  app, layer, getPresentation, isLifegraphVisible, isRecapOpen, onChoose, tooltipView = null,
} = {}) {
  const root = new PIXI.Container();
  root.visible = false;
  root.zIndex = 180;
  root.eventMode = "static";
  layer?.addChild(root);
  let signature = "";
  let tablets = [];
  let selectedStatId = null;
  let choiceKey = null;
  let confirmRoot = null;
  let shell = null;
  let pointerHeld = false;
  let open = false, pose = null, ghost = null, tipStatId = null;
  root.on("pointerdown", () => { pointerHeld = true; });
  for (const type of ["pointerup", "pointerupoutside", "pointercancel"]) root.on(type, () => { pointerHeld = false; });

  // Canvas CSS pixels per design pixel, so text never drops below a readable size.
  function cssScale() {
    const rect = app?.view?.getBoundingClientRect?.();
    const w = app?.screen?.width || 2424;
    return rect?.width > 0 ? rect.width / w : 1;
  }
  const hideTip = () => { tipStatId = null; tooltipView?.hide?.({ force: true }); };
  const anchorFor = (node, side = 'right') => {
    const b = node.getBounds();
    return { x: b.x, y: b.y, width: b.width, height: b.height, side, alignY: 'top', coordinateSpace: 'screen' };
  };

  function addTablet(parent, vassal, statId, x, y, sizes, stud, side) {
    const before = getVassalStatPresentation(vassal, statId);
    const after = raised(vassal, statId);
    const color = STAT_COLORS[statId] ?? RELIC.gold;
    const { width: w, height: h } = TABLET;
    const node = new PIXI.Container(); node.position.set(x + w / 2, y + h / 2); node.pivot.set(w / 2, h / 2);
    node.eventMode = "static"; node.cursor = "pointer"; node.hitArea = new PIXI.Rectangle(0, 0, w, h);
    const frame = addPaintedPanel(node, 'panel', w, h, { tint: 0xffffff, fill: RELIC.stone, fallbackStroke: color });
    const glow = new PIXI.Graphics(); glow.position.set(w / 2, 74); glow.eventMode = 'none';
    for (let r = 0; r < 4; r++) glow.beginFill(color, .12 + r * .05).drawCircle(0, 0, 70 - r * 8).endFill();
    glow.visible = false; node.addChild(glow);
    const socket = addPaintedSocket(node, w / 2, 74, 112, {});
    addResourceIcon(node, STAT_ICONS[before.label] ?? 'prestige', w / 2, 74, 66);
    text(node, before.label.toUpperCase(), w / 2, 142, sizes.name, { fill: color, fontWeight: 'bold', letterSpacing: 3 }, .5, 0);
    const numY = 142 + sizes.name * 1.25 + sizes.number * .55;
    const oldN = text(node, `${before.value}`, 0, numY, sizes.number, { fill: RELIC.ash }, .5, .5);
    const arrow = text(node, '→', 0, numY, sizes.number * .6, { fill: RELIC.brass }, .5, .5);
    const newN = text(node, `${after.value}`, 0, numY, sizes.number, { fill: color, fontWeight: 'bold',
      dropShadow: true, dropShadowColor: 0x000000, dropShadowDistance: 3, dropShadowAlpha: .7 }, .5, .5);
    const spread = sizes.number * .9;
    oldN.x = w / 2 - spread; arrow.x = w / 2; newN.x = w / 2 + spread;
    text(node, after.powerLabel, w / 2, numY + sizes.number * .6 + 8, sizes.effect, {
      fill: RELIC.bone, align: 'center', wordWrap: true, wordWrapWidth: w - 56, lineHeight: sizes.effect * 1.15,
    }, .5, 0);
    node.statId = statId; node.frame = frame; node.glow = glow; node.socket = socket; node.baseY = node.y;
    node.lift = 0; node.liftFrom = 0; node.liftTo = 0; node.liftAt = 0; node.hovered = false;
    const spec = levelUpTooltipSpec(vassal, statId);
    node.on('pointerover', event => {
      node.hovered = true; paintTablet(node);
      if (event.pointerType !== 'touch' && tipStatId === null) tooltipView?.show?.(spec, anchorFor(node, side));
    });
    node.on('pointerout', () => { node.hovered = false; paintTablet(node); if (tipStatId === null) tooltipView?.hide?.(); });
    node.on('pointertap', event => {
      if (event.pointerType !== 'touch') return;
      // Touch: the tap that selects also pins the details; tapping again unpins.
      tipStatId = tipStatId === statId ? null : statId;
      tooltipView?.pin?.(spec, anchorFor(node, side), `levelUp:${statId}`);
    });
    addInteractionFeedback(node, { x: 0, y: 0, width: w, height: h }, { onActivate: () => select(statId) });
    parent.addChild(node);
    return node;
  }

  function paintTablet(node) {
    const chosen = node.statId === selectedStatId, other = !!selectedStatId && !chosen;
    node.frame.setTint(chosen ? BRONZE : other ? IRON : node.hovered ? 0xfff4dc : 0xffffff);
    node.socket.setTint(chosen ? BRONZE : 0xffffff);
    node.glow.visible = chosen;
    node.alpha = other && !node.hovered ? .62 : 1;
    const target = chosen ? -LIFT_PX : 0;
    if (node.liftTo !== target) { node.liftFrom = node.lift; node.liftTo = target; node.liftAt = now(); }
  }

  function select(statId) {
    selectedStatId = statId;
    tablets.forEach(paintTablet);
    confirmRoot?.setLabel?.(statId);
  }

  function addPlaque(parent, x, y, w, h, sizes, choiceLabelFor, onPress) {
    const node = new PIXI.Container(); node.position.set(x, y);
    node.hitArea = new PIXI.Rectangle(0, 0, w, h);
    const frameHolder = new PIXI.Container(); node.addChild(frameHolder);
    const label = node.labelNode = text(node, '', w / 2, h / 2, sizes.button, { fill: RELIC.bone, fontWeight: 'bold', letterSpacing: 2 }, .5, .5);
    let enabled = false;
    addInteractionFeedback(node, { x: 0, y: 0, width: w, height: h }, { enabled: false, onActivate: () => { if (enabled) onPress(); } });
    node.setLabel = statId => {
      enabled = !!statId;
      frameHolder.removeChildren().forEach(c => c.destroy({ children: true }));
      addPaintedPanel(frameHolder, enabled ? 'tabSelected' : 'tabLocked', w, h,
        { fill: enabled ? 0x3a3020 : 0x1d1e1b, fallbackStroke: enabled ? RELIC.gold : RELIC.brass });
      label.text = enabled ? `Ascend in ${choiceLabelFor(statId)}` : 'Choose an attribute';
      label.style.fill = enabled ? 0xffe3a6 : RELIC.ash;
      label.scale.set(1); if (label.width > w - 48) label.scale.set((w - 48) / label.width);
      node.eventMode = enabled ? 'static' : 'none'; node.cursor = enabled ? 'pointer' : 'default';
      node.setInteractionEnabled?.(enabled);
    };
    parent.addChild(node);
    return node;
  }

  function render(force = false, prepared = null) {
    if (pointerHeld) return;
    const presentation = prepared ?? getPresentation?.() ?? {};
    const vassal = presentation.vassal;
    const queue = vassal?.developmentChoiceQueue ?? [];
    const visible = !prepared && isLifegraphVisible?.() === true
      && presentation.readOnly !== true && queue.length > 0
      && isRecapOpen?.() !== true;
    if (visible && !open) { pose = { phase: 'open', at: now() }; ghost = null; }
    if (!visible && open) { hideTip(); pose = { phase: 'close', at: now() }; }
    open = visible;
    root.visible = visible || pose?.phase === 'close';
    root.eventMode = visible ? "static" : "none";
    if (!queue.length) return;
    const choice = queue[0];
    const nextChoiceKey = `${vassal.vassalId}:${choice.choiceId}`;
    if (choiceKey !== nextChoiceKey) { selectedStatId = null; choiceKey = nextChoiceKey; if (choiceKey && visible) pose = { phase: 'open', at: now() }; }
    if (selectedStatId && !choice.offeredStatIds.includes(selectedStatId)) selectedStatId = null;
    const k = cssScale();
    const nextSignature = getArtRevision() + JSON.stringify({
      vassalId: vassal.vassalId, stats: vassal.stats, queue, k: Math.round(k * 1000),
      w: app.screen.width, h: app.screen.height,
    });
    if (!force && nextSignature === signature) return;
    signature = nextSignature;
    clearChildren(root);
    tablets = [];
    const min = css => css / k;
    const sizes = {
      name: Math.max(28, min(MIN_CSS_TEXT)), number: Math.max(76, min(26)),
      effect: Math.max(26, min(MIN_CSS_TEXT)), banner: Math.max(30, min(MIN_CSS_TEXT + 1)),
      button: Math.max(32, min(MIN_CSS_TEXT + 2)),
    };
    const classData = FOUNDER_CLASSES[vassal.classId] ?? null;
    const tint = classData?.frameTint ?? 0xffffff;

    const blocker = new PIXI.Graphics();
    blocker.beginFill(0x0b0c0b, 0.62).drawRect(0, 0, app.screen.width, app.screen.height).endFill();
    blocker.eventMode = "static";
    blocker.on("pointerdown", (event) => { event?.stopPropagation?.(); if (tipStatId) hideTip(); });
    root.addChild(blocker);

    shell = new PIXI.Container();
    shell.pivot.set(WIN.width / 2, WIN.height / 2);
    // Bottom-aligned in the graph area so the top bar's age and Prestige chips stay clear.
    shell.position.set(GRAPH_AREA.x + GRAPH_AREA.width / 2, GRAPH_AREA.y + GRAPH_AREA.height - WIN.height / 2 - 4);
    shell.eventMode = 'static'; shell.hitArea = new PIXI.Rectangle(0, 0, WIN.width, WIN.height);
    shell.on('pointerdown', event => event.stopPropagation());
    root.addChild(shell);
    const back = new PIXI.Container(), content = new PIXI.Container(), rim = new PIXI.Container();
    rim.eventMode = 'none'; shell.addChild(back, content, rim);
    addPaintedWindow(rim, WIN.width, WIN.height, { tint, fill: classData?.deep ?? RELIC.night, backParent: back });

    // Banner tab inset into the top rim: age and remaining levels as pips.
    const banner = new PIXI.Container(); banner.position.set((WIN.width - BANNER.width) / 2, BANNER.y); rim.addChild(banner);
    const bannerBack = new PIXI.Graphics();
    bannerBack.beginTextureFill({ texture: getStoneTexture(), color: classData?.deep ?? RELIC.stone }).drawRect(5, 5, BANNER.width - 10, BANNER.height - 10).endFill();
    banner.addChild(bannerBack);
    addPaintedPanel(banner, 'panel', BANNER.width, BANNER.height, { tint, fallbackStroke: RELIC.gold });
    let age = null;
    try { if (presentation.state) age = getVassalAge(presentation.state, vassal, presentation.profileSec); } catch { age = null; }
    const title = text(banner, age != null ? `ASCENSION · AGE ${age}` : 'ASCENSION', 34, BANNER.height / 2, sizes.banner,
      { fill: 0xf1d79a, fontWeight: 'bold', letterSpacing: 3, dropShadow: true, dropShadowDistance: 2, dropShadowAlpha: .8 }, 0, .5);
    const stud = studTexture();
    const pipSize = Math.max(26, min(9)), pipCount = Math.min(queue.length, 5);
    const pipsW = pipCount * pipSize + (pipCount - 1) * 8;
    const pipsX = BANNER.width - 34 - pipsW;
    if (title.x + title.width > pipsX - 16) title.scale.set((pipsX - 16 - title.x) / title.width);
    for (let i = 0; i < pipCount; i++) addPip(banner, pipsX + pipSize / 2 + i * (pipSize + 8), BANNER.height / 2, pipSize, true, stud);
    if (queue.length > pipCount) text(banner, `+${queue.length - pipCount}`, pipsX - 6, BANNER.height / 2, sizes.banner * .8, { fill: RELIC.gold }, 1, .5);

    const totalW = choice.offeredStatIds.length * TABLET.width + (choice.offeredStatIds.length - 1) * TABLET.gap;
    const startX = (WIN.width - totalW) / 2;
    tablets = choice.offeredStatIds.map((statId, index) => addTablet(content, vassal, statId,
      startX + index * (TABLET.width + TABLET.gap), TABLET.y, sizes, stud,
      index === choice.offeredStatIds.length - 1 ? 'left' : 'right'));
    tablets.forEach(node => { node.lift = node.liftTo = node.statId === selectedStatId ? -LIFT_PX : 0; });
    const plaqueH = Math.min(PLAQUE.slotHeight, Math.max(88, min(MIN_CSS_BUTTON)));
    const labelOf = statId => getVassalStatPresentation(vassal, statId).label;
    confirmRoot = addPlaque(content, (WIN.width - PLAQUE.width) / 2, PLAQUE.slotY + (PLAQUE.slotHeight - plaqueH) / 2,
      PLAQUE.width, plaqueH, sizes, labelOf, () => {
        if (!selectedStatId) return;
        ghost = { statId: selectedStatId };
        onChoose?.(choice.choiceId, selectedStatId);
      });
    confirmRoot.setLabel(selectedStatId);
    tablets.forEach(paintTablet);
    animate();
  }

  function animate() {
    const t = now(), still = reducedMotion();
    if (shell) {
      if (pose?.phase === 'open') {
        const p = still ? 1 : ease((t - pose.at) / OPEN_MS);
        shell.alpha = p; shell.scale.set(.94 + .06 * p); root.alpha = 1;
        if (p >= 1) pose = null;
      } else if (pose?.phase === 'close') {
        const p = still ? 1 : ease((t - pose.at) / CLOSE_MS);
        root.alpha = 1 - p; shell.scale.set(1 + .03 * p);
        if (p >= 1) { pose = null; root.visible = false; root.alpha = 1; }
      }
    }
    for (const node of tablets) {
      const p = still ? 1 : ease((t - node.liftAt) / LIFT_MS);
      node.lift = node.liftFrom + (node.liftTo - node.liftFrom) * p;
      node.y = node.baseY + node.lift;
      node.scale.set(1 + (node.lift / -LIFT_PX) * .025);
    }
  }

  return {
    prepare(presentation) {
      render(false, presentation);
      return app.renderer?.prepare?.upload(root);
    },
    init: () => render(true),
    update: () => { render(); if (root.visible) animate(); },
    refresh: () => render(),
    resize: () => render(true),
    isOpen: () => open,
    getChoiceClickPoint(index = 0) {
      if (!open) return null;
      const target = tablets[index];
      const point = target?.toGlobal?.(new PIXI.Point(
        target.hitArea.width / 2, target.hitArea.height / 2
      ));
      return point ? { x: point.x, y: point.y } : null;
    },
    getConfirmClickPoint: () => open && confirmRoot?.toGlobal
      ? confirmRoot.toGlobal(new PIXI.Point(
        confirmRoot.hitArea.width / 2, confirmRoot.hitArea.height / 2
      )) : null,
    getSemanticSnapshot: () => ({
      open,
      queue: getPresentation?.()?.vassal?.developmentChoiceQueue ?? [],
      selectedStatId,
      choiceStates: tablets.map(card => card.interactionState),
      confirmState: confirmRoot?.interactionState ?? null,
      confirmLabel: confirmRoot?.labelNode?.text ?? null,
      tooltipPinned: tipStatId,
      confirmCssHeight: confirmRoot ? confirmRoot.hitArea.height * cssScale() : null,
    }),
    getHudDeltas() {
      if (!open || !selectedStatId) return null;
      return { prestige: 0, stats: { [selectedStatId]: 1 } };
    },
  };
}
