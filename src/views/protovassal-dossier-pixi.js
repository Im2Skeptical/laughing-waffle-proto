import { paintRelicPanel, getStoneTexture, RELIC } from './chronicle-skin.js';
import { createClassPortraitArt } from './vassal-class-art.js';
import { addInteractionFeedback } from './interaction-feedback.js';
import { addResourceIcon } from './resource-cost-pixi.js';
import { addIllustration } from './chronicle-art.js';
import { PANEL as MODAL_PANEL } from './vassal-node-decision/constants.js';
import { BASE_STATS, FOUNDER_CLASSES, STAT_ICONS, founderTooltipSpec } from './protovassal-class-data.js';

// The founder class picker: a carved-stone slab on the node-decision modal's
// footprint, so it sits between the top bar and dock instead of over them. The
// class is a hanging banner (hero), attribute chips, a feature panel and
// ability cards; a tab rail below picks the class. Details use the shared
// tooltip view (hover on mouse, tap to pin on touch), as Practices do.
const W = MODAL_PANEL.width, H = MODAL_PANEL.height;
const SLOT_COUNT = 4, FONT = 'Georgia';
const TAB = Object.freeze({ y: 566, width: 150, height: 128, gap: 14 });
// The right-hand column (attribute chips and ability cards) spans COLUMN.left..right,
// to the right of the banner. The four class slots centre on that column.
const COLUMN = Object.freeze({ left: 600, right: 2310 });
const TAB_ROW_X = (COLUMN.left + COLUMN.right) / 2 - (SLOT_COUNT * TAB.width + (SLOT_COUNT - 1) * TAB.gap) / 2;
const OPEN_MS = 220, CLOSE_MS = 140, PAGE_MS = 240;
const ease = t => 1 - (1 - Math.min(1, Math.max(0, t))) ** 3;
const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
const now = () => performance.now();

function text(parent, copy, x, y, size, options = {}) {
  const node = new PIXI.Text(copy, { fontFamily: FONT, fontSize: size, fill: RELIC.bone, ...options });
  node.position.set(x, y); parent.addChild(node); return node;
}
// Shrinks a label that would overrun its slot rather than wrapping it.
function fit(node, maxWidth) { if (node.width > maxWidth) node.scale.set(maxWidth / node.width); return node; }
function stoneRect(g, x, y, w, h, fill, stroke, sw = 2) { paintRelicPanel(g, x, y, w, h, fill, stroke, sw); return g; }
function control(parent, x, y, w, h) {
  const node = new PIXI.Container(); node.position.set(x, y);
  node.hitArea = new PIXI.Rectangle(0, 0, w, h); node.eventMode = 'static'; node.cursor = 'pointer';
  parent.addChild(node); return node;
}
function label(parent, copy, x, y, color = RELIC.ash) {
  return text(parent, copy, x, y, 24, { fill: color, fontWeight: 'bold', letterSpacing: 4 });
}

export function createProtovassalDossier({ candidates: poolCandidates, selectedIndex, onPreview, onConfirm, onClose, tooltipView = null }) {
  // Founders in tab order; remaining tabs are locked silhouettes.
  const candidates = [...poolCandidates].sort((a, b) => (a.founderClassId === 'warrior' ? 0 : 1) - (b.founderClassId === 'warrior' ? 0 : 1));
  const root = new PIXI.Container(); root.eventMode = 'static';
  root.hitArea = new PIXI.Rectangle(0, 0, 2424, 1080);
  root.controls = {}; root.candidateRoots = [];
  const backdrop = new PIXI.Graphics().beginFill(0x171713, 1).drawRect(0, 0, 2424, 1080).endFill();
  backdrop.eventMode = 'static'; backdrop.on('pointerdown', event => { event.stopPropagation(); tooltipView?.hide({ force: true }); onClose?.(); });
  const shell = new PIXI.Container();
  shell.pivot.set(W / 2, H / 2); shell.position.set(MODAL_PANEL.x + W / 2, MODAL_PANEL.y + H / 2);
  shell.eventMode = 'static'; shell.hitArea = new PIXI.Rectangle(0, 0, W, H);
  shell.on('pointerdown', event => event.stopPropagation());
  root.addChild(backdrop, shell);

  const slab = new PIXI.Graphics(); stoneRect(slab, 0, 0, W, H, RELIC.night, RELIC.brass, 3); shell.addChild(slab);
  const holder = new PIXI.Container(); shell.addChild(holder);
  const clip = new PIXI.Graphics().beginFill(0xffffff).drawRect(4, 4, W - 8, H - 8).endFill(); shell.addChild(clip); holder.mask = clip;
  const tabLayer = new PIXI.Container(); shell.addChild(tabLayer);

  let selected = candidates.find(c => c.candidateIndex === selectedIndex) ?? candidates[0];
  let page = null, leaving = null, transition = null, tabs = [];
  let pose = { phase: 'open', startedAt: 0 }, gone = false, begun = false, tipId = null;

  // ---- tooltips (shared view) ----
  function anchorFor(node, side) {
    const b = node.getBounds();
    return { x: b.x, y: b.y, width: b.width, height: b.height, side, alignY: 'top', coordinateSpace: 'screen' };
  }
  function addTip(node, id, kind, classId, side) {
    const spec = founderTooltipSpec(kind, id, classId);
    node.on('pointerover', event => { if (event.pointerType !== 'touch') tooltipView?.show(spec, anchorFor(node, side)); });
    node.on('pointerout', () => tooltipView?.hide());
    node.on('pointerdown', event => {
      event.stopPropagation(); tipId = tipId === id ? null : id;
      tooltipView?.pin(spec, anchorFor(node, side), `founder:${id}`);
    });
  }
  const hideTip = () => { tipId = null; tooltipView?.hide({ force: true }); };
  const pinnedTip = () => tooltipView?.getDebugState?.().pinned === true && tipId;

  // ---- page: banner hero, attribute chips, feature, ability cards, Begin ----
  function buildPage(candidate) {
    const classId = candidate.founderClassId, data = FOUNDER_CLASSES[classId];
    const view = new PIXI.Container(), controls = {};
    const bx = 30, bw = 530, top = 18, bottom = 696, mid = bx + bw / 2;
    // Class glow and trim
    const glow = new PIXI.Graphics(); view.addChild(glow);
    for (const [r, a] of [[330, .05], [250, .07], [180, .09]]) glow.beginFill(data.glow, a).drawCircle(mid, 300, r).endFill();
    view.glow = glow;
    const banner = new PIXI.Graphics();
    const tail = 36, poly = [bx, top, bx + bw, top, bx + bw, bottom, mid, bottom - tail, bx, bottom];
    banner.lineStyle(4, RELIC.gold, .95).beginTextureFill({ texture: getStoneTexture(), color: data.deep, alpha: .96 }).drawPolygon(poly).endFill();
    banner.lineStyle(2, data.accent, .6).drawPolygon([bx + 14, top + 14, bx + bw - 14, top + 14, bx + bw - 14, bottom - 18, mid, bottom - tail - 12, bx + 14, bottom - 18]);
    banner.lineStyle(1, RELIC.bone, .14).moveTo(bx + 22, top + 24).lineTo(bx + bw - 22, top + 24);
    banner.lineStyle(2, RELIC.shadow, .9).beginFill(RELIC.gold).drawRoundedRect(bx - 18, top - 12, bw + 36, 16, 8).endFill();
    for (const x of [bx - 18, bx + bw + 18]) banner.lineStyle(2, RELIC.shadow, .9).beginFill(RELIC.gold).drawCircle(x, top - 4, 12).endFill();
    view.addChild(banner);
    const art = createClassPortraitArt(classId, { size: 430, founder: true });
    if (art) { art.position.set(bx + (bw - 430) / 2, 82); view.addChild(art); }
    const name = text(view, data.name, mid, 520, 52, { fontWeight: 'bold', letterSpacing: 2 }); name.anchor.set(.5, 0); fit(name, bw - 70);
    const unlocks = text(view, `UNLOCKS ${data.unlocks.toUpperCase()}`, mid, 580, 24, { fill: data.accent, fontWeight: 'bold', letterSpacing: 4 }); unlocks.anchor.set(.5, 0);
    const flavour = text(view, data.flavour, mid, 614, 24, { fontStyle: 'italic', fill: 0xc2c3b4, wordWrap: true, wordWrapWidth: bw - 80, align: 'center' }); flavour.anchor.set(.5, 0);

    // Attribute chips: the class attribute takes the replaced slot.
    const cx = COLUMN.left, cw = 385, ch = 128, cgap = 20;
    label(view, 'ATTRIBUTES', cx, 26);
    BASE_STATS.forEach((base, index) => {
      const replaced = base.name === data.replaces, name = replaced ? data.stat : base.name;
      const value = candidate.stats?.[replaced ? data.statKey : base.statId];
      const x = cx + (index % 2) * (cw + cgap), y = 66 + Math.floor(index / 2) * (ch + 16);
      const chip = control(view, x, y, cw, ch), g = new PIXI.Graphics(); chip.addChild(g);
      if (replaced) {
        g.beginFill(data.glow, .22).drawRoundedRect(-6, -6, cw + 12, ch + 12, 16).endFill();
        stoneRect(g, 0, 0, cw, ch, data.deep, data.accent, 3);
      } else stoneRect(g, 0, 0, cw, ch, RELIC.stone, RELIC.brass, 2);
      g.lineStyle(2, replaced ? data.accent : RELIC.brass, .8).beginFill(RELIC.shadow, .9).drawCircle(68, ch / 2, 46).endFill();
      addResourceIcon(chip, STAT_ICONS[name], 68, ch / 2, 74);
      const title = text(chip, name, 132, replaced ? 20 : ch / 2 - 22, 36, { fontWeight: 'bold', fill: replaced ? 0xfff0d6 : RELIC.bone }); fit(title, cw - 132 - 90);
      if (replaced) {
        const old = text(chip, base.name, 132, 78, 24, { fill: 0x8d9084 });
        const strike = new PIXI.Graphics().lineStyle(2, 0x8d9084).moveTo(132, 91).lineTo(132 + old.width, 91);
        chip.addChild(strike); text(chip, 'replaced', 132 + old.width + 10, 78, 24, { fill: 0x8d9084, letterSpacing: 2 });
      }
      const num = text(chip, value == null ? '–' : String(value), cw - 26, ch / 2, 56, { fontWeight: 'bold', fill: replaced ? data.accent : RELIC.gold }); num.anchor.set(1, .5);
      addInteractionFeedback(chip, { x: 0, y: 0, width: cw, height: ch });
      addTip(chip, name, 'stat', classId, 'right'); controls[name] = chip;
    });
    // Feature panel for the class attribute
    const fy = 66 + 2 * ch + 16 + 24, fh = 548 - fy, fw = 2 * cw + cgap;
    const feature = control(view, cx, fy, fw, fh), fg = new PIXI.Graphics(); feature.addChild(fg);
    fg.beginFill(data.glow, .14).drawRoundedRect(-5, -5, fw + 10, fh + 10, 14).endFill();
    stoneRect(fg, 0, 0, fw, fh, data.deep, data.accent, 3);
    text(feature, `CLASS ATTRIBUTE · ${data.stat.toUpperCase()}`, 30, 20, 24, { fill: data.accent, fontWeight: 'bold', letterSpacing: 4 });
    let ey = 62;
    for (const line of data.effects) {
      fg.beginFill(data.accent).drawPolygon([38, ey + 17, 48, ey + 7, 58, ey + 17, 48, ey + 27]).endFill();
      const t = text(feature, line, 76, ey, 31, { wordWrap: true, wordWrapWidth: fw - 150 }); ey += t.height + 16;
    }
    text(feature, '›', fw - 40, fh / 2 - 6, 52, { fill: data.accent, fontWeight: 'bold' }).anchor.set(.5);
    addInteractionFeedback(feature, { x: 0, y: 0, width: fw, height: fh });
    addTip(feature, data.stat, 'stat', classId, 'right'); controls.feature = feature;

    // Ability cards
    const aw = 430, agap = 20, ax = COLUMN.right - 2 * aw - agap, ay = 66, ah = 548 - ay;
    label(view, 'CLASS ABILITIES', ax, 26);
    data.abilities.forEach((ability, index) => {
      const x = ax + index * (aw + agap), card = control(view, x, ay, aw, ah), g = new PIXI.Graphics(); card.addChild(g);
      stoneRect(g, 0, 0, aw, ah, RELIC.stone, RELIC.brass, 2);
      const art = addIllustration(card, ability.art, { x: 10, y: 10, width: aw - 20, height: 218 });
      if (art) {
        const mask = new PIXI.Graphics().beginFill(0xffffff).drawRoundedRect(10, 10, aw - 20, 218, 10).endFill(); card.addChild(mask); art.mask = mask;
        const fade = new PIXI.Graphics(); for (let i = 0; i < 8; i++) fade.beginFill(RELIC.stone, .09 * (i + 1)).drawRect(10, 228 - 8 * (8 - i), aw - 20, 8).endFill();
        card.addChild(fade);
      } else g.beginFill(RELIC.shadow, .8).drawRoundedRect(10, 10, aw - 20, 218, 10).endFill();
      g.lineStyle(3, data.accent, .8).beginFill(RELIC.shadow, .85).drawCircle(aw - 48, 50, 26).endFill();
      text(card, 'i', aw - 48, 50, 32, { fontStyle: 'italic', fontWeight: 'bold', fill: data.accent }).anchor.set(.5);
      g.lineStyle(0).beginFill(data.accent, .9).drawRect(24, 246, 56, 4).endFill();
      const title = text(card, ability.name, 24, 262, 38, { fontWeight: 'bold', wordWrap: true, wordWrapWidth: aw - 48 });
      text(card, ability.summary, 24, 262 + title.height + 12, 28, { fill: 0xc2c3b4, wordWrap: true, wordWrapWidth: aw - 48 });
      text(card, 'DETAILS  ›', 24, ah - 50, 24, { fill: data.accent, fontWeight: 'bold', letterSpacing: 3 });
      addInteractionFeedback(card, { x: 0, y: 0, width: aw, height: ah });
      addTip(card, ability.id, 'ability', classId, 'left'); controls[ability.id] = card;
    });

    view.controls = controls; view.candidateIndex = candidate.candidateIndex;
    return view;
  }

  // ---- tab rail: emblem per class, locked silhouettes for the rest ----
  function buildTabs() {
    tabLayer.removeChildren().forEach(node => node.destroy({ children: true }));
    tabs = [];
    for (let slot = 0; slot < SLOT_COUNT; slot++) {
      const candidate = candidates[slot], data = candidate && FOUNDER_CLASSES[candidate.founderClassId];
      const isSelected = candidate === selected;
      const tab = control(tabLayer, TAB_ROW_X + slot * (TAB.width + TAB.gap), TAB.y, TAB.width, TAB.height), g = new PIXI.Graphics(); tab.addChild(g);
      if (isSelected) g.beginFill(data.glow, .3).drawRoundedRect(-5, -5, TAB.width + 10, TAB.height + 10, 14).endFill();
      stoneRect(g, 0, 0, TAB.width, TAB.height, isSelected ? data.deep : RELIC.stone, isSelected ? data.accent : RELIC.brass, isSelected ? 3 : 2);
      if (candidate) {
        const emblem = createClassPortraitArt(candidate.founderClassId, { size: 84, founder: true, crest: false });
        if (emblem) { emblem.position.set((TAB.width - 84) / 2, 8); emblem.alpha = isSelected ? 1 : .72; tab.addChild(emblem); }
        const name = text(tab, data.name[0] + data.name.slice(1).toLowerCase(), TAB.width / 2, 100, 22, { fill: isSelected ? RELIC.bone : RELIC.ash, fontWeight: 'bold' });
        name.anchor.set(.5, 0); fit(name, TAB.width - 16);
        if (isSelected) g.lineStyle(0).beginFill(data.accent).drawRect(18, TAB.height - 8, TAB.width - 36, 4).endFill();
        addInteractionFeedback(tab, { x: 0, y: 0, width: TAB.width, height: TAB.height }, { onActivate: () => choose(candidate) });
        tab.portraitStage = 'youth'; // founders are always painted as youth; the life-map probe reads this
        root.candidateRoots[candidate.candidateIndex] = tab; root.controls[`tab:${slot}`] = tab;
      } else {
        const ghost = createClassPortraitArt('mystery', { size: 70 });
        if (ghost) { ghost.position.set((TAB.width - 70) / 2, 10); ghost.alpha = .5; tab.addChild(ghost); }
        // padlock
        g.lineStyle(3, 0xb8b09a, .95).arc(TAB.width / 2, 50, 11, Math.PI, 0).lineStyle(0).beginFill(0xb8b09a).drawRoundedRect(TAB.width / 2 - 16, 50, 32, 26, 5).endFill();
        const name = text(tab, 'Locked', TAB.width / 2, 100, 22, { fill: 0x80847a, fontWeight: 'bold' }); name.anchor.set(.5, 0);
        addInteractionFeedback(tab, { x: 0, y: 0, width: TAB.width, height: TAB.height });
        addTip(tab, `locked:${slot}`, 'locked', null, 'right'); root.controls[`tab:${slot}`] = tab;
      }
      tabs.push(tab);
    }
  }

  function confirmSelected() {
    if (begun || gone) return; begun = true; hideTip(); onConfirm?.(selected.candidateIndex);
  }
  function mountPage(candidate, { fromDir = 0 } = {}) {
    const next = buildPage(candidate);
    holder.addChild(next);
    if (page && fromDir && !reducedMotion()) {
      leaving = page; leaving.eventMode = 'none';
      transition = { startedAt: now(), dir: fromDir, from: leaving, to: next };
      next.alpha = 0; next.x = fromDir * 70;
    } else if (page) { page.destroy({ children: true }); }
    page = next; root.controls = { ...tabsControls(), ...next.controls };
  }
  const tabsControls = () => Object.fromEntries(Object.entries(root.controls).filter(([key]) => key.startsWith('tab:')));

  function choose(candidate) {
    if (!candidate || candidate === selected) return;
    select(candidate.candidateIndex); onPreview?.(candidate.candidateIndex);
  }
  function select(index) {
    const next = candidates.find(c => c.candidateIndex === index) ?? candidates[0];
    if (!next || next === selected) return;
    const dir = Math.sign(candidates.indexOf(next) - candidates.indexOf(selected)) || 1;
    selected = next; hideTip(); finishTransition(); buildTabs(); mountPage(selected, { fromDir: dir });
  }
  function navigate(delta) {
    const at = candidates.indexOf(selected);
    choose(candidates[(at + delta + candidates.length) % candidates.length]);
  }
  function finishTransition() {
    if (!transition) return;
    transition.from.destroy({ children: true }); transition.to.alpha = 1; transition.to.x = 0; leaving = null; transition = null;
  }

  // ---- swipe between classes ----
  let swipe = null;
  shell.on('pointerdowncapture', event => { swipe = { x: event.global.x, y: event.global.y }; });
  const endSwipe = event => {
    if (!swipe) return; const dx = event.global.x - swipe.x, dy = event.global.y - swipe.y; swipe = null;
    if (Math.abs(dx) > 140 && Math.abs(dy) < Math.abs(dx) * .6) navigate(dx < 0 ? 1 : -1);
  };
  shell.on('pointerup', endSwipe); shell.on('pointerupoutside', endSwipe);

  // ---- open / close / frame update ----
  function applyPose(t, opening) {
    const e = ease(t), show = opening ? e : 1 - e;
    backdrop.alpha = .74 * show; shell.alpha = Math.min(1, show * 1.6);
    shell.scale.set(.94 + .06 * show); shell.y = MODAL_PANEL.y + H / 2 + (1 - show) * 26;
  }
  function open() {
    gone = false; begun = false; root.visible = true; root.eventMode = 'static';
    hideTip();
    if (reducedMotion()) { pose = { phase: 'open', startedAt: 0 }; applyPose(1, true); return; }
    pose = { phase: 'opening', startedAt: now() }; applyPose(0, true);
  }
  function close() {
    if (pose.phase === 'closing' || gone) return;
    hideTip(); root.eventMode = 'none';
    if (reducedMotion()) { gone = true; return; }
    pose = { phase: 'closing', startedAt: now() };
  }
  function update(time = now()) {
    if (pose.phase === 'opening') { const t = (time - pose.startedAt) / OPEN_MS; applyPose(t, true); if (t >= 1) pose.phase = 'open'; }
    else if (pose.phase === 'closing') { const t = (time - pose.startedAt) / CLOSE_MS; applyPose(t, false); if (t >= 1) gone = true; }
    if (transition) {
      const t = (time - transition.startedAt) / PAGE_MS, e = ease(t);
      transition.from.alpha = 1 - e; transition.from.x = -transition.dir * 70 * e;
      transition.to.alpha = e; transition.to.x = transition.dir * 70 * (1 - e);
      if (t >= 1) finishTransition();
    }
    if (page?.glow) page.glow.alpha = reducedMotion() ? 1 : .85 + .15 * Math.sin(time / 1300);
  }

  function handleKeyDown(event) {
    if (gone || pose.phase === 'closing') return false;
    if (event.key === 'ArrowRight') { navigate(1); return true; }
    if (event.key === 'ArrowLeft') { navigate(-1); return true; }
    if (event.key === 'Enter' || event.key === 'NumpadEnter') { confirmSelected(); return true; }
    if (event.key === 'Escape') { if (pinnedTip()) { hideTip(); return true; } onClose?.(); return true; }
    return false;
  }

  buildTabs(); mountPage(selected);
  // Starts fully shown; the drawer calls open() when the picker becomes visible.
  applyPose(1, true);
  Object.assign(root, {
    select, open, close, update, handleKeyDown, navigate,
    isGone: () => gone, isClosing: () => pose.phase === 'closing',
    destroyTooltip: hideTip,
    getSnapshot: () => ({ classId: selected.founderClassId, name: FOUNDER_CLASSES[selected.founderClassId].name,
      replacedStat: FOUNDER_CLASSES[selected.founderClassId].replaces, classStat: FOUNDER_CLASSES[selected.founderClassId].stat,
      tooltip: pinnedTip() || null, availableFounders: candidates.length, totalSlots: SLOT_COUNT,
      lockedSlots: SLOT_COUNT - candidates.length, phase: pose.phase, transitioning: !!transition,
      stats: selected.stats ?? null }),
  });
  return root;
}
