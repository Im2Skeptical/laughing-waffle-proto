import { paintRelicPanel, getStoneTexture, RELIC } from './chronicle-skin.js';
import { createClassPortraitArt } from './vassal-class-art.js';
import { addInteractionFeedback } from './interaction-feedback.js';
import { addResourceIcon } from './resource-cost-pixi.js';
import { addIllustration } from './chronicle-art.js';
import { addPaintedBanner, addPaintedPanel, addPaintedSocket, addPaintedWindow } from './painted-frames.js';
import { PANEL as MODAL_PANEL } from './vassal-node-decision/constants.js';
import { BASE_STATS, FOUNDER_CLASSES, STAT_ICONS, founderTooltipSpec } from './protovassal-class-data.js';

// The founder class picker: a carved-stone slab on the node-decision modal's
// footprint, so it sits between the top bar and dock instead of over them. The
// class is a hanging banner (hero), attribute chips, a feature panel and
// ability cards; a tab rail below picks the class. Details use the shared
// tooltip view (hover on mouse, tap to pin on touch), as Practices do.
const W = MODAL_PANEL.width, H = MODAL_PANEL.height;
const SLOT_COUNT = 4, FONT = 'Georgia';
const TAB = Object.freeze({ y: 516, width: 150, height: 128, gap: 14 });
// Layout, in window pixels (the painted rim leaves about 34 px of margin). The banner
// holds the hero on the left; the right-hand column (attribute chips and ability
// cards) spans COLUMN.left..right and the four class slots centre on it.
const BANNER = Object.freeze({ x: 46, y: 46, width: 530, height: 598 });
const COLUMN = Object.freeze({ left: 616, right: 2296 });
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

  // Painted window: stone fill, pages and tabs, then the carved frame on top so its
  // corner caps overlap the content like a real mount. Falls back to the vector slab.
  const slabLayer = new PIXI.Container(); shell.addChild(slabLayer);
  const holder = new PIXI.Container(); shell.addChild(holder);
  const clip = new PIXI.Graphics().beginFill(0xffffff).drawRect(30, 30, W - 60, H - 60).endFill(); shell.addChild(clip); holder.mask = clip;
  const tabLayer = new PIXI.Container(); shell.addChild(tabLayer);
  const frameLayer = new PIXI.Container(); frameLayer.eventMode = 'none'; shell.addChild(frameLayer);
  let windowFrame = null, windowPainted = false;
  function drawWindow() {
    slabLayer.removeChildren().forEach(node => node.destroy({ children: true }));
    frameLayer.removeChildren().forEach(node => node.destroy({ children: true }));
    const tint = FOUNDER_CLASSES[selected.founderClassId].frameTint;
    windowFrame = addPaintedWindow(frameLayer, W, H, { tint, backParent: slabLayer });
    windowPainted = windowFrame.painted;
    
  }

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
    const { x: bx, y: top, width: bw, height: bh } = BANNER, mid = bx + bw / 2;
    // Class glow behind the banner, then the painted banner (class-coloured stone inside).
    const glow = new PIXI.Graphics(); view.addChild(glow);
    for (const [r, a] of [[250, .05], [190, .07], [140, .09]]) glow.beginFill(data.glow, a).drawCircle(mid, top + 240, r).endFill();
    view.glow = glow;
    const bannerHolder = new PIXI.Container(); bannerHolder.position.set(bx, top); view.addChild(bannerHolder);
    addPaintedBanner(bannerHolder, bw, bh, { tint: data.frameTint, fill: data.deep });
    // Hero and caption sit inside the carved rectangular banner rim.
    const heroSize = 300;
    const art = createClassPortraitArt(classId, { size: heroSize, founder: true });
    if (art) { art.position.set(mid - heroSize / 2, top + 62); view.addChild(art); }
    const name = text(view, data.name, mid, top + 372, 46, { fontWeight: 'bold', letterSpacing: 2 }); name.anchor.set(.5, 0); fit(name, 400);
    const unlocks = text(view, `UNLOCKS ${data.unlocks.toUpperCase()}`, mid, top + 426, 22, { fill: data.accent, fontWeight: 'bold', letterSpacing: 4 }); unlocks.anchor.set(.5, 0); fit(unlocks, 400);
    const flavour = text(view, data.flavour, mid, top + 454, 22, { fontStyle: 'italic', fill: 0xc2c3b4, wordWrap: true, wordWrapWidth: 400, align: 'center' }); flavour.anchor.set(.5, 0);

    // Attribute chips: the class attribute takes the replaced slot.
    const cx = COLUMN.left, cw = 380, ch = 114, cgap = 18, rowGap = 14, rowsTop = 76;
    label(view, 'ATTRIBUTES', cx, 40);
    BASE_STATS.forEach((base, index) => {
      const replaced = base.name === data.replaces, name = replaced ? data.stat : base.name;
      const value = candidate.stats?.[replaced ? data.statKey : base.statId];
      const x = cx + (index % 2) * (cw + cgap), y = rowsTop + Math.floor(index / 2) * (ch + rowGap);
      const chip = control(view, x, y, cw, ch), g = new PIXI.Graphics(); chip.addChild(g);
      if (replaced) g.beginFill(data.glow, .22).drawRoundedRect(-6, -6, cw + 12, ch + 12, 16).endFill();
      addPaintedPanel(chip, 'panel', cw, ch, replaced
        ? { tint: data.frameTint, fill: data.deep, fallbackFill: data.deep, fallbackStroke: data.accent }
        : { tint: 0xffffff, fill: RELIC.stone });
      addPaintedSocket(chip, 62, ch / 2, 92, { tint: replaced ? data.frameTint : 0xffffff });
      addResourceIcon(chip, STAT_ICONS[name], 62, ch / 2, 64);
      const tx = 124;
      const title = text(chip, name, tx, replaced ? 14 : ch / 2 - 22, 36, { fontWeight: 'bold', fill: replaced ? 0xfff0d6 : RELIC.bone }); fit(title, cw - tx - 80);
      if (replaced) {
        const old = text(chip, base.name, tx, 66, 24, { fill: 0x8d9084 });
        const strike = new PIXI.Graphics().lineStyle(2, 0x8d9084).moveTo(tx, 79).lineTo(tx + old.width, 79);
        chip.addChild(strike); text(chip, 'replaced', tx + old.width + 10, 66, 24, { fill: 0x8d9084, letterSpacing: 2 });
      }
      const num = text(chip, value == null ? '–' : String(value), cw - 24, ch / 2, 54, { fontWeight: 'bold', fill: replaced ? data.accent : RELIC.gold }); num.anchor.set(1, .5);
      addInteractionFeedback(chip, { x: 0, y: 0, width: cw, height: ch });
      addTip(chip, name, 'stat', classId, 'right'); controls[name] = chip;
    });
    // Feature panel for the class attribute
    const sectionBottom = 500, fy = rowsTop + 2 * ch + rowGap + 14, fh = sectionBottom - fy, fw = 2 * cw + cgap;
    const feature = control(view, cx, fy, fw, fh), fg = new PIXI.Graphics(); feature.addChild(fg);
    fg.beginFill(data.glow, .14).drawRoundedRect(-5, -5, fw + 10, fh + 10, 14).endFill();
    addPaintedPanel(feature, 'panel', fw, fh, { tint: data.frameTint, fill: data.deep, fallbackFill: data.deep, fallbackStroke: data.accent });
    text(feature, `CLASS ATTRIBUTE · ${data.stat.toUpperCase()}`, 30, 18, 24, { fill: data.accent, fontWeight: 'bold', letterSpacing: 4 });
    let ey = 58;
    for (const line of data.effects) {
      fg.beginFill(data.accent).drawPolygon([38, ey + 17, 48, ey + 7, 58, ey + 17, 48, ey + 27]).endFill();
      const t = text(feature, line, 76, ey, 30, { wordWrap: true, wordWrapWidth: fw - 150 }); ey += t.height + 12;
    }
    text(feature, '›', fw - 40, fh / 2 - 6, 52, { fill: data.accent, fontWeight: 'bold' }).anchor.set(.5);
    addInteractionFeedback(feature, { x: 0, y: 0, width: fw, height: fh });
    addTip(feature, data.stat, 'stat', classId, 'right'); controls.feature = feature;

    // Ability cards
    const aw = 420, agap = 18, ax = COLUMN.right - 2 * aw - agap, ay = rowsTop, ah = sectionBottom - ay, pad = 14, artH = 190;
    label(view, 'CLASS ABILITIES', ax, 40);
    data.abilities.forEach((ability, index) => {
      const x = ax + index * (aw + agap), card = control(view, x, ay, aw, ah), g = new PIXI.Graphics(); card.addChild(g);
      const art = addIllustration(card, ability.art, { x: pad, y: pad, width: aw - 2 * pad, height: artH });
      if (art) {
        const mask = new PIXI.Graphics().beginFill(0xffffff).drawRoundedRect(pad, pad, aw - 2 * pad, artH, 6).endFill(); card.addChild(mask); art.mask = mask;
      } else g.beginFill(RELIC.shadow, .8).drawRoundedRect(pad, pad, aw - 2 * pad, artH, 6).endFill();
      // Card stone sits behind the art; the painted rim goes on top of both.
      const under = new PIXI.Graphics(); under.beginTextureFill({ texture: getStoneTexture(), color: RELIC.stone }).drawRoundedRect(5, 5, aw - 10, ah - 10, 6).endFill();
      card.addChildAt(under, 0);
      const fade = new PIXI.Graphics(); for (let i = 0; i < 8; i++) fade.beginFill(RELIC.stone, .09 * (i + 1)).drawRect(pad, pad + artH - 8 * (8 - i), aw - 2 * pad, 8).endFill();
      if (art) card.addChild(fade);
      addPaintedPanel(card, 'panel', aw, ah, { tint: 0xffffff });
      const iy = pad + 34, badge = new PIXI.Graphics(); card.addChild(badge);
      badge.lineStyle(3, data.accent, .8).beginFill(RELIC.shadow, .85).drawCircle(aw - 52, iy, 24).endFill();
      text(card, 'i', aw - 52, iy, 30, { fontStyle: 'italic', fontWeight: 'bold', fill: data.accent }).anchor.set(.5);
      const barY = pad + artH + 16;
      g.lineStyle(0).beginFill(data.accent, .9).drawRect(26, barY, 56, 4).endFill();
      const title = text(card, ability.name, 26, barY + 14, 36, { fontWeight: 'bold', wordWrap: true, wordWrapWidth: aw - 52 });
      text(card, ability.summary, 26, barY + 14 + title.height + 8, 27, { fill: 0xc2c3b4, wordWrap: true, wordWrapWidth: aw - 52 });
      text(card, 'DETAILS  ›', 26, ah - 46, 24, { fill: data.accent, fontWeight: 'bold', letterSpacing: 3 });
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
      const kind = !candidate ? 'tabLocked' : isSelected ? 'tabSelected' : 'tab';
      if (isSelected) g.beginFill(data.glow, .3).drawRoundedRect(-5, -5, TAB.width + 10, TAB.height + 10, 14).endFill();
      // The carved frame draws over class-coloured stone; the selected tab uses warm bronze.
      addPaintedPanel(tab, kind, TAB.width, TAB.height, { tint: isSelected ? 0xffffff : candidate ? data.frameTint : 0xffffff, fill: isSelected ? data.deep : candidate ? RELIC.stone : 0x1d1e1b });
      if (candidate) {
        const emblem = createClassPortraitArt(candidate.founderClassId, { size: 56, founder: true, crest: false });
        if (emblem) { emblem.position.set((TAB.width - 56) / 2, 17); emblem.alpha = isSelected ? 1 : .72; tab.addChild(emblem); }
        const name = text(tab, data.name[0] + data.name.slice(1).toLowerCase(), TAB.width / 2, 76, 19, { fill: isSelected ? RELIC.bone : RELIC.ash, fontWeight: 'bold' });
        name.anchor.set(.5, 0); fit(name, TAB.width - 40);
        addInteractionFeedback(tab, { x: 0, y: 0, width: TAB.width, height: TAB.height }, { onActivate: () => choose(candidate) });
        tab.portraitStage = 'youth'; // founders are always painted as youth; the life-map probe reads this
        root.candidateRoots[candidate.candidateIndex] = tab; root.controls[`tab:${slot}`] = tab;
      } else {
        const ghost = createClassPortraitArt('mystery', { size: 52 });
        if (ghost) { ghost.position.set((TAB.width - 52) / 2, 17); ghost.alpha = .5; tab.addChild(ghost); }
        const lock = new PIXI.Graphics(); tab.addChild(lock); // padlock, above the painted frame
        lock.lineStyle(3, 0xb8b09a, .95).arc(TAB.width / 2, 43, 9, Math.PI, 0).lineStyle(0).beginFill(0xb8b09a).drawRoundedRect(TAB.width / 2 - 13, 43, 26, 21, 4).endFill();
        const name = text(tab, 'Locked', TAB.width / 2, 76, 19, { fill: 0x80847a, fontWeight: 'bold' }); name.anchor.set(.5, 0);
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
    selected = next; hideTip(); finishTransition(); windowFrame?.setTint(FOUNDER_CLASSES[selected.founderClassId].frameTint); buildTabs(); mountPage(selected, { fromDir: dir });
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

  drawWindow(); buildTabs(); mountPage(selected);
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
