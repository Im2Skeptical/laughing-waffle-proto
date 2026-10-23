import { addPrestigeBankFeedback } from "./prestige-feedback-pixi.js";
import { getRetinue } from "../model/detailed-settlements/external-world.js";
import { VASSAL_LIFE_TUNING } from "../defs/gamepieces/vassal-life-map-defs.js";
import {
  getVassalAge,
  getVassalHeirloomInventory,
  getVassalStatsPresentation,
} from "../model/vassal-life-map.js";
import { getRegionReference } from "../model/world-state.js";
import { clearChildren, createText, roundedRect } from "./settlement-view-primitives.js";
import { PALETTE, TEXT_STYLES } from "./settlement-theme.js";
import { createVassalPortraitView } from "./vassal-portrait-pixi.js";
import { addResourceAmount } from "./resource-cost-pixi.js";
import { getArtRevision } from "./chronicle-art.js";
import { addHeirloomSlot, addHeirloomArt } from './vassal-heirloom-pixi.js';
import { addInteractionFeedback } from './interaction-feedback.js';
import { getChronicleTexture } from './chronicle-art.js';
import { addResourceIcon } from './resource-cost-pixi.js';
import { addPaintedSocket } from './painted-frames.js';
import { FRAME_PREFIX, WINDOW_FRAME } from './painted-frame-spec.js';
import { FOUNDER_CLASSES } from './protovassal-class-data.js';
import { RELIC } from './chronicle-skin.js';

const TWEEN_MS = 700;

// Chronicle crest bar, design px on the 2424x1080 stage at scale 1. The bar
// sits just under the year strip (bottom y=70). On small canvases the whole
// crest scales up about PIVOT so its numbers stay >= ~11 CSS px; the level-up
// window starts below getCrestLayout(...).bottom so the two never overlap.
const CREST = Object.freeze({
  // Pivot chosen so the scaled crest keeps clear of the decision title plaque (x ≤ 408)
  // on the left and the Save & menu button (x ≥ 2010) on the right.
  pivot: Object.freeze({ x: 712, y: 74 }),
  bar: Object.freeze({ x: 620, y: 74, width: 1080, height: 65 }),
  medallion: Object.freeze({ cx: 560, cy: 111, ring: 154, portrait: 106 }),
  life: Object.freeze({ x: 646, y: 56, width: 180, height: 86, unit: 1.15 }),
  pendant: Object.freeze({ x: 836, y: 111, unit: 1.15, minWidth: 104, maxWidth: 200 }),
  stats: Object.freeze({ x: 1000, y: 68, width: 68, height: 63, gap: 6, unit: 1.1, studY: 7, bodyY: 41 }),
  heirlooms: Object.freeze({ x: 1306, cy: 100, size: 54, step: 62 }),
  tabs: Object.freeze({ right: 1690, y: 113, minWidth: 76, maxWidth: 190, height: 73, gap: 8, unit: .9 }),
  bottom: 188,
});
const BASE_VALUE_FONT = 24, MIN_CSS_VALUE = 11, MAX_SCALE = 1.3;
// Scale for a canvas at k CSS px per design px, and the crest's lowest y.
export function getCrestLayout(k = 1) {
  const scale = Math.max(1, Math.min(MAX_SCALE, MIN_CSS_VALUE / (BASE_VALUE_FONT * (k || 1))));
  return { scale, bottom: CREST.pivot.y + (CREST.bottom - CREST.pivot.y) * scale };
}
const HUD_PREFIX = 'chronicle-hud-frames-v1/';
const HUD_PIECES = Object.freeze(['lintel-cap-left', 'lintel-cap-right', 'lintel-mid', 'medallion', 'pendant',
  'stat-plaque', 'exp-groove-empty', 'exp-groove-full', 'tab']);
// Class identity lives in the portrait ring: Warlord gets ruby studs and iron
// teeth on a jagged aperture, Philosopher sapphire studs and a smooth ivory bead.
const MEDALLION = Object.freeze({ warrior: 'medallion-warrior', scholar: 'medallion-scholar' });
// 5-slice cuts in stored px: [fixed | stretch | fixed centre | stretch | fixed].
const SLICES = Object.freeze({
  'stat-plaque': [12, 20, 42, 50], pendant: [28, 45, 45, 60], tab: [16, 28, 52, 64],
});
// Inner track of the EXP groove in stored pixels (the carved lip either side).
const GROOVE_INNER = Object.freeze({ x: 6 });
const reducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true;
function hudTexture(name) {
  const tex = getChronicleTexture(`${HUD_PREFIX}${name}.png`);
  return tex?.baseTexture?.valid && tex.valid !== false ? tex : null;
}
// The amber stud from the carved frame corner (shared with the level-up pips).
function studTexture() {
  const corner = getChronicleTexture(`${FRAME_PREFIX}${WINDOW_FRAME.pieces.cornerTl}.png`);
  if (!corner?.baseTexture?.valid || corner.valid === false) return null;
  const f = corner.frame;
  return new PIXI.Texture(corner.baseTexture, new PIXI.Rectangle(f.x + 6, f.y + 5, 10, 10));
}
// Draws a carved piece `width` design px wide: ends and centre ornament stay
// fixed, plain runs either side stretch (nearest), so studs and rings never warp.
function addSliced(parent, tex, x, y, width, unit, cuts, height = null, yCuts = null) {
  const node = new PIXI.Container(); node.position.set(x, y); parent.addChild(node);
  const W = tex.frame.width, H = tex.frame.height, [a, b, c, d] = cuts;
  const fixed = (a + (c - b) + (W - d)) * unit;
  const extra = Math.max(0, width - fixed - ((b - a) + (d - c)) * unit);
  const spans = [[0, a, 0], [a, b, .5], [b, c, 0], [c, d, .5], [d, W, 0]];
  const vSpans = height && yCuts
    ? [[0, yCuts[0], yCuts[0] * unit], [yCuts[0], yCuts[1], Math.max(1, height - (yCuts[0] + (H - yCuts[1])) * unit)], [yCuts[1], H, (H - yCuts[1]) * unit]]
    : [[0, H, H * unit]];
  let atY = 0, atX = 0;
  for (const [yFrom, yTo, dstH] of vSpans) {
    atX = 0;
    const srcH = Math.max(1, yTo - yFrom);
    for (const [from, to, share] of spans) {
      if (to <= from && !share) continue;
      const srcW = Math.max(1, to - from);
      const piece = new PIXI.Sprite(new PIXI.Texture(tex.baseTexture, new PIXI.Rectangle(tex.frame.x + from, tex.frame.y + yFrom, srcW, srcH)));
      const w = (to - from) * unit + extra * share;
      piece.position.set(atX, atY); piece.width = w; piece.height = dstH; node.addChild(piece); atX += w;
    }
    atY += dstH;
  }
  node.sliceWidth = atX;
  return node;
}
// Fit text to a holder: shrink to a minimum size, then ellipsize. Returns true
// when the text was cut (callers then put the full text in the tooltip).
function fitText(node, maxWidth, minSize) {
  while (node.width > maxWidth && node.style.fontSize > minSize) node.style.fontSize -= 1;
  if (node.width <= maxWidth) return false;
  const full = node.text;
  let n = full.length;
  while (n > 1 && node.width > maxWidth) { n -= 1; node.text = `${full.slice(0, n).trimEnd()}…`; }
  return true;
}

function signedDelta(value) {
  if (!Number.isFinite(value) || value === 0) return null;
  return `${value > 0 ? "+" : ""}${value}`;
}

function easeOut(t) {
  return 1 - (1 - t) * (1 - t);
}

function lerp(from, to, t) {
  return from + (to - from) * t;
}

export function createVassalLifeHudView({
  layer, getPresentation, getDeltas, getCountUp, isVisible, tooltipView, onOpenHeirlooms, getLevelUp, app = null,
} = {}) {
  const cssScale = () => {
    const rect = app?.view?.getBoundingClientRect?.();
    return rect?.width > 0 ? rect.width / (app.screen?.width || 2424) : 1;
  };
  const root = new PIXI.Container();
  root.zIndex = 188;
  root.eventMode = "static";
  layer?.addChild(root);
  let signature = "";
  let buildCount = 0;
  let wasVisible = false;
  let pinnedStatId = null;
  let tween = null;
  let bagControl = null;
  let activeSlots = [];
  let litPlaque = null;

  function hideStatTooltip() {
    pinnedStatId = null;
    tooltipView?.hide?.();
  }

  function showStatTooltip(stat, target) {
    tooltipView?.show?.({
      title: `${stat.label} ${stat.value}`,
      scale: 2,
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

  function displayedValues(vassal, presentation, countUp) {
    const liveAge = getVassalAge(presentation.state, vassal, presentation.profileSec);
    const livePrestige = vassal.prestige ?? 0;
    const liveExp = Math.max(0, Math.floor(vassal.developmentProgress ?? 0));
    if (!countUp || tween == null) {
      return { age: liveAge, prestige: livePrestige, exp: liveExp, flashing: false };
    }
    const t = easeOut(Math.min(1, (performance.now() - tween.startedAt) / TWEEN_MS));
    return {
      age: Math.round(lerp(countUp.ageBefore ?? liveAge, countUp.ageAfter ?? liveAge, t)),
      prestige: Math.round(lerp(countUp.prestigeBefore ?? livePrestige, countUp.prestigeAfter ?? livePrestige, t)),
      exp: Math.round(lerp(countUp.expBefore ?? liveExp, countUp.expAfter ?? liveExp, t)),
      flashing: t < 1,
    };
  }

  function render(force = false, preparing = false) {
    const visible = isVisible?.() === true;
    root.visible = visible;
    root.eventMode = visible ? "static" : "none";
    if (!visible && !preparing) {
      if (wasVisible) hideStatTooltip();
      wasVisible = false;
      tween = null;
      return;
    }
    wasVisible = visible;
    const presentation = getPresentation?.() ?? {};
    const vassal = presentation.profileVassal ?? presentation.vassal;
    const deltas = getDeltas?.() ?? null;
    const countUp = getCountUp?.() ?? null;
    if (countUp?.vassalId && countUp.vassalId !== tween?.vassalId) {
      tween = { vassalId: countUp.vassalId, startedAt: performance.now() };
    }
    if (!countUp) tween = null;
    const shown = vassal ? displayedValues(vassal, presentation, countUp) : null;
    const inventory = vassal ? getVassalHeirloomInventory(vassal) : { equipped: [], carry: [] };
    const nextSignature = getArtRevision() + JSON.stringify({
      vassalId: vassal?.vassalId ?? null,
      classId: vassal?.classId ?? null,
      founderClassId: vassal?.founderClassId ?? null,
      retinue: getRetinue(presentation.state, vassal),
      prestige: vassal?.prestige ?? null,
      commission: vassal?.commission ?? null,
      stats: vassal?.stats ?? null,
      exp: vassal?.developmentProgress ?? null,
      location: vassal?.locationRegionId ?? null,
      heirlooms: inventory,
      profileSec: presentation.profileSec ?? null,
      pinnedStatId,
      levelUp: getLevelUp?.() ?? null,
      k: Math.round(cssScale() * 1000),
      deltas,
      countUpId: countUp?.vassalId ?? null,
      shown,
    });
    if (!force && nextSignature === signature) return;
    signature = nextSignature;
    buildCount++;
    bagControl = null;
    activeSlots = [];
    clearChildren(root);
    if (!vassal || !shown) return;

    const levelUp = getLevelUp?.() ?? null;
    const classId = vassal.classId ?? vassal.founderClassId;
    const { scale } = getCrestLayout(cssScale());
    const tex = name => hudTexture(name);
    const painted = HUD_PIECES.every(name => tex(name));
    litPlaque = null;
    const crest = new PIXI.Container();
    crest.pivot.set(CREST.pivot.x, CREST.pivot.y); crest.position.set(CREST.pivot.x, CREST.pivot.y);
    crest.scale.set(scale); root.addChild(crest);
    const valueStyle = (size, fill = PALETTE.text) => ({ ...TEXT_STYLES.header, fontSize: size, fill, stroke: 0x0b0c0b, strokeThickness: 4 });
    const tipOn = (node, spec) => {
      node.eventMode = 'static';
      node.on('pointerover', e => { if (e.pointerType !== 'touch' && !pinnedStatId) tooltipView?.show?.(spec(), node.getBounds()); });
      node.on('pointerout', () => { if (!pinnedStatId) tooltipView?.hide?.(); });
      node.on('pointertap', e => { if (e.pointerType === 'touch') tooltipView?.show?.(spec(), node.getBounds()); });
    };

    // ---- lintel bar: neutral stone (class identity lives in the medallion) ----
    if (painted) {
      const mid = new PIXI.TilingSprite(tex('lintel-mid'), CREST.bar.width - 2 * 60, tex('lintel-mid').height);
      mid.position.set(CREST.bar.x + 60, CREST.bar.y); crest.addChild(mid);
      const left = new PIXI.Sprite(tex('lintel-cap-left')); left.position.set(CREST.bar.x, CREST.bar.y);
      const right = new PIXI.Sprite(tex('lintel-cap-right')); right.anchor.set(1, 0);
      right.position.set(CREST.bar.x + CREST.bar.width, CREST.bar.y);
      crest.addChild(left, right);
    } else {
      const bar = new PIXI.Graphics();
      roundedRect(bar, CREST.bar.x, CREST.bar.y + 2, CREST.bar.width, CREST.bar.height - 4, 10, 0x2b332e, PALETTE.accent, 1.5);
      crest.addChild(bar);
    }

    // ---- portrait medallion breaking the bar's left end, custom-illustrated per class ----
    const m = CREST.medallion;
    const ringTex = tex(MEDALLION[classId] ?? 'medallion') ?? tex('medallion');
    const hasPaintedRing = painted && !!ringTex;
    const portrait = createVassalPortraitView(vassal.portrait, {
      size: m.portrait, classId, founder: !!vassal.founderClassId,
      borderColor: PALETTE.accent, shape: "circle", bare: hasPaintedRing, age: shown.age,
    });
    portrait.position.set(m.cx - m.portrait / 2, m.cy - m.portrait / 2);
    crest.addChild(portrait);
    if (hasPaintedRing) {
      const ring = new PIXI.Sprite(ringTex);
      ring.anchor.set(0.5);
      ring.position.set(m.cx, m.cy);
      crest.addChild(ring);
    } else {
      const ring = new PIXI.Graphics(); ring.lineStyle(5, FOUNDER_CLASSES[classId]?.accent ?? PALETTE.accent, 1).drawCircle(m.cx, m.cy, m.portrait / 2 + 2);
      crest.addChild(ring);
    }

    // ---- life plaque: Age and Level over the EXP groove, one carved unit ----
    const lf = CREST.life, threshold = VASSAL_LIFE_TUNING.developmentThreshold;
    const level = Math.max(0, Math.floor((vassal.nextDevelopmentChoiceId ?? 1) - 1));
    const pending = (vassal.developmentChoiceQueue ?? []).length;
    const life = new PIXI.Container(); life.position.set(lf.x, lf.y); crest.addChild(life);
    const lifeH = lf.height;
    if (painted) addSliced(life, tex('stat-plaque'), 0, 0, lf.width, lf.unit, SLICES['stat-plaque'], lifeH, [24, 46]);
    else { const g = new PIXI.Graphics(); roundedRect(g, 0, 16, lf.width, lifeH - 16, 8, 0x39413b, PALETTE.accent, 1.5); life.addChild(g); }
    const lifeGlow = new PIXI.Graphics(); lifeGlow.position.set(lf.width / 2, 8);
    for (let r = 0; r < 3; r++) lifeGlow.beginFill(0xffb347, .2 + r * .14).drawCircle(0, 0, 14 - r * 4).endFill();
    lifeGlow.blendMode = PIXI.BLEND_MODES.ADD; lifeGlow.visible = pending > 0; life.addChild(lifeGlow);
    const ageText = createText(`AGE ${shown.age}`, valueStyle(20), 15, 38, 0, .5);
    const levelText = createText(`LV ${level}`, valueStyle(20, 0xf1d79a), lf.width - 15, 38, 1, .5);
    life.addChild(ageText, levelText);
    fitText(ageText, lf.width * .58 - 18, 15); fitText(levelText, lf.width * .42 - 18, 15);
    const ratio = Math.max(0, Math.min(1, shown.exp / threshold));
    const gw = lf.width - 28, gx = 14, gy = 52, gh = 20;
    if (painted) {
      const empty = addSliced(life, tex('exp-groove-empty'), gx, gy, gw, gh / 23, [8, 60, 62, 114]);
      const full = addSliced(life, tex('exp-groove-full'), gx, gy, gw, gh / 23, [8, 60, 62, 114]);
      const inner = GROOVE_INNER.x * gh / 23;
      const clip = new PIXI.Graphics().beginFill(0xffffff).drawRect(gx, gy, inner + (gw - 2 * inner) * ratio, gh).endFill();
      full.mask = clip; life.addChild(clip); void empty;
    } else {
      const g = new PIXI.Graphics(); roundedRect(g, gx, gy, gw, gh, 6, 0x1c1916, PALETTE.stroke, 1);
      g.beginFill(0xd98a2b).drawRect(gx + 4, gy + 6, (gw - 8) * ratio, gh - 12).endFill(); life.addChild(g);
    }
    const stud = studTexture();
    for (let q = 1; q <= 3; q++) {
      const lit = ratio >= q / 4, sx = gx + 7 + (gw - 14) * q / 4, sy = gy + gh / 2;
      if (stud) { const st = new PIXI.Sprite(stud); st.anchor.set(.5); st.position.set(sx, sy); st.width = st.height = 11; st.tint = lit ? 0xffffff : 0x5f5c55; life.addChild(st); }
      else { const g = new PIXI.Graphics(); g.lineStyle(1, RELIC.brass).beginFill(lit ? 0xc46a1c : 0x2b2b28).drawCircle(sx, sy, 4.5).endFill(); life.addChild(g); }
    }
    const expDelta = signedDelta(deltas?.development);
    if (expDelta) life.addChild(createText(expDelta, { ...TEXT_STYLES.chip, fontSize: 16, fill: PALETTE.green, stroke: 0x0b0c0b, strokeThickness: 3 }, lf.width - 6, gy - 2, 1, 1));
    life.hitArea = new PIXI.Rectangle(0, 0, lf.width, lifeH);
    tipOn(life, () => ({ title: `Age ${shown.age} · Level ${level}`, scale: 2, lines: [
      `EXP ${shown.exp} / ${threshold}${expDelta ? ` (${expDelta})` : ''}`,
      pending ? `${pending} level${pending === 1 ? '' : 's'} to choose.` : 'Completed nodes add EXP; each full groove is a level and an attribute point.',
    ] }));

    // ---- Prestige pendant hanging under the bar; widens for big numbers ----
    const pd = CREST.pendant;
    const prestigeValue = Math.max(0, shown.prestige + (deltas?.prestige ?? 0));
    const prestigeLabel = prestigeValue.toLocaleString('en-US');
    const probe = new PIXI.Text(prestigeLabel, { ...TEXT_STYLES.body, fontSize: 26 });
    const pendantW = Math.max(pd.minWidth, Math.min(pd.maxWidth, probe.width + 30 + 44)); probe.destroy();
    const pendant = new PIXI.Container(); pendant.position.set(pd.x, pd.y); crest.addChild(pendant);
    if (painted) addSliced(pendant, tex('pendant'), 0, 0, pendantW, pd.unit, SLICES.pendant);
    else { const g = new PIXI.Graphics(); roundedRect(g, 0, 20, pendantW, 54, 9, 0x423d2c, PALETTE.accent, 3); pendant.addChild(g); }
    addPrestigeBankFeedback(pendant, { x: 2, y: 18, width: pendantW - 4, height: 54 });
    const amount = addResourceAmount(pendant, "prestige", prestigeLabel, {
      x: 12, y: 33, fontSize: 26, iconSize: 28, fill: shown.flashing ? PALETTE.green : PALETTE.accent,
    });
    const amountText = amount.children[0];
    const prestigeCut = fitText(amountText, pendantW - 12 - 34 - 12, 18);
    const prestigeDelta = signedDelta(deltas?.prestige);
    if (prestigeDelta) pendant.addChild(createText(prestigeDelta, { ...TEXT_STYLES.chip, fontSize: 16, fill: deltas.prestige > 0 ? PALETTE.green : PALETTE.red, stroke: 0x101314, strokeThickness: 3 }, pendantW - 4, 28, 1, 1));
    pendant.hitArea = new PIXI.Rectangle(0, 0, pendantW, 75);
    tipOn(pendant, () => ({ title: `Prestige ${shown.prestige.toLocaleString('en-US')}`, scale: 2, lines: [
      prestigeDelta ? `Selected choice: ${prestigeDelta}` : 'Spent on Lifegraph choices; earned by completed nodes.',
      ...(prestigeCut ? [`Shown: ${prestigeLabel}`] : []),
    ] }));

    // ---- four stat plaques: icon and value; the label lives in the tooltip ----
    const sp = CREST.stats;
    getVassalStatsPresentation(vassal).forEach((stat, index) => {
      const chip = new PIXI.Container();
      chip.position.set(sp.x + index * (sp.width + sp.gap), sp.y);
      chip.eventMode = "static";
      chip.cursor = "help";
      chip.hitArea = new PIXI.Rectangle(0, 0, sp.width, sp.height);
      const pinned = pinnedStatId === stat.statId;
      const chosen = levelUp?.open && levelUp.selectedStatId === stat.statId;
      let plate = null;
      if (painted) {
        plate = new PIXI.Sprite(tex('stat-plaque')); plate.scale.set(sp.unit);
        plate.tint = pinned ? 0xffdc91 : 0xffffff; chip.addChild(plate);
      } else {
        const g = new PIXI.Graphics();
        roundedRect(g, 0, 10, sp.width, sp.height - 10, 6, 0x39413b, pinned || chosen ? PALETTE.accent : PALETTE.stroke, pinned ? 2 : 1);
        chip.addChild(g);
      }
      const glow = new PIXI.Graphics(); glow.position.set(sp.width / 2, sp.studY);
      for (let r = 0; r < 3; r++) glow.beginFill(0xffb347, .18 + r * .14).drawCircle(0, 0, 13 - r * 4).endFill();
      glow.blendMode = PIXI.BLEND_MODES.ADD; glow.visible = pinned || chosen; chip.addChild(glow);
      if (chosen) litPlaque = { chip, glow, plate };
      chip.statPresentation = stat;
      addResourceIcon(chip, stat.iconId, 19, sp.bodyY, 26);
      const delta = signedDelta(deltas?.stats?.[stat.statId]);
      const value = createText(String(stat.value + (delta ? Number(deltas.stats[stat.statId]) : 0)),
        { ...TEXT_STYLES.header, fontSize: BASE_VALUE_FONT, fill: delta ? PALETTE.green : PALETTE.text }, 49, sp.bodyY, .5, .5);
      chip.addChild(value); fitText(value, 30, 16);
      chip.on("pointerdown", (event) => event?.stopPropagation?.());
      chip.on("pointerover", () => { if (plate && !pinned) plate.tint = 0xfff4dc; if (!pinnedStatId) showStatTooltip(stat, chip); });
      chip.on("pointerout", () => { if (plate && !pinned) plate.tint = 0xffffff; if (!pinnedStatId) tooltipView?.hide?.(); });
      chip.on("pointertap", (event) => {
        event?.stopPropagation?.();
        if (pinnedStatId === stat.statId) hideStatTooltip();
        else { pinnedStatId = stat.statId; showStatTooltip(stat, chip); }
      });
      crest.addChild(chip);
    });

    // ---- heirloom sockets and bag; locked while the level-up is open ----
    const locked = levelUp?.open === true;
    const hs = CREST.heirlooms;
    const socketed = (index, build) => {
      const cx = hs.x + index * hs.step + hs.size / 2, cy = hs.cy;
      const holder = new PIXI.Container(); crest.addChild(holder);
      const socket = addPaintedSocket(holder, cx, cy, hs.size + 8, {});
      const control = build({ x: cx - hs.size / 2, y: cy - hs.size / 2, width: hs.size, height: hs.size });
      if (socket.painted && control.children[0]) control.children[0].alpha = 0;
      holder.addChild(control);
      if (locked) { holder.alpha = .45; control.eventMode = 'none'; }
      return control;
    };
    activeSlots = [0, 1, 2].map(index => socketed(index, rect => addHeirloomSlot(new PIXI.Container(), rect,
      inventory.equipped[index], { tooltipView, emptyLabel: '', onActivate: () => { hideStatTooltip(); onOpenHeirlooms?.('equipped'); } })));
    bagControl = socketed(3, rect => {
      const bag = new PIXI.Container(); bag.position.set(rect.x, rect.y);
      bag.eventMode = 'static'; bag.hitArea = new PIXI.Rectangle(0, 0, rect.width, rect.height);
      const bagFrame = new PIXI.Graphics(); roundedRect(bagFrame, 0, 0, rect.width, rect.height, 6, 0x292f2b, PALETTE.accent, 1.5);
      bag.addChild(bagFrame); addHeirloomArt(bag, 'bag', { x: 6, y: 6, width: rect.width - 12, height: rect.height - 12 });
      const carried = inventory.carry.filter(Boolean).length;
      if (carried) bag.addChild(createText(String(carried), { ...TEXT_STYLES.header, fontSize: 18, fill: PALETTE.accent, stroke: 0x101314, strokeThickness: 3 }, rect.width - 2, rect.height - 22, 1));
      bag.on('pointerover', event => { if (event.pointerType !== 'touch') tooltipView?.show?.({ title: 'Heirloom bag', scale: 2, lines: [`${carried}/3 carried · ${(presentation.state?.civilization?.heirloomVault ?? []).filter(Boolean).length}/6 in the lineage vault`, 'Open to inspect active, carried and stored heirlooms.'] }, bag.getBounds()); });
      bag.on('pointerout', () => tooltipView?.hide?.());
      addInteractionFeedback(bag, { x: 0, y: 0, width: rect.width, height: rect.height }, { onActivate: () => { hideStatTooltip(); onOpenHeirlooms?.('carry'); } });
      return bag;
    });

    // ---- hanging tabs: commission (or Retinue) and location; widen, shrink, then ellipsize ----
    const location = String(getRegionReference(presentation.state, vassal.locationRegionId) ?? vassal.locationRegionId ?? "");
    const tabs = [];
    if (vassal.classId === 'warrior') {
      const retinue = getRetinue(presentation.state, vassal);
      tabs.push({ value: `Retinue +${retinue.value}`, tip: { title: 'Personal Retinue', scale: 2, lines: [`+${retinue.value} Martial Force`, `Next at ${retinue.nextPrestige} Prestige`] } });
    } else if (vassal.commission) {
      const c = vassal.commission;
      const progress = c.amount ? ` ${c.progress}/${c.amount}` : '';
      tabs.push({ value: `${c.label}${progress}`, tip: { title: 'Commission', scale: 2, lines: [`${c.label}${progress}`, `+${c.prestige} Prestige on completion`] } });
    }
    tabs.push({ value: location, tip: { title: 'Location', scale: 2, lines: [location, 'The Vassal\'s current region.'] } });
    const tb = CREST.tabs;
    let right = tb.right;
    for (const entry of [...tabs].reverse()) {
      const text = createText(entry.value, { ...TEXT_STYLES.header, fontSize: 20, fill: PALETTE.text, stroke: 0x1a0b0b, strokeThickness: 3 }, 0, 0, .5, 0);
      const width = Math.max(tb.minWidth, Math.min(tb.maxWidth, text.width + 34));
      const x = right - width; right = x - tb.gap;
      const tab = new PIXI.Container(); tab.position.set(x, tb.y); crest.addChild(tab);
      if (painted) addSliced(tab, tex('tab'), 0, 0, width, tb.unit, SLICES.tab);
      else { const g = new PIXI.Graphics(); roundedRect(g, 8, 14, width - 16, tb.height - 20, 4, 0x4a1e1e, PALETTE.accent, 1.5); tab.addChild(g); }
      text.position.set(width / 2, 22); tab.addChild(text);
      const cut = fitText(text, width - 30, 15);
      tab.hitArea = new PIXI.Rectangle(0, 0, width, tb.height);
      tipOn(tab, () => ({ ...entry.tip, lines: cut ? entry.tip.lines : entry.tip.lines.slice(1) }));
    }
  }

  // The level-up's chosen stat pulses its plaque stud without rebuilding the HUD.
  function pulse() {
    if (!litPlaque) return;
    const t = performance.now() / 1000;
    const k = reducedMotion() ? 1 : .6 + .4 * Math.sin(t * 5);
    litPlaque.glow.alpha = k; litPlaque.glow.scale.set(.9 + .25 * k);
    if (litPlaque.plate) litPlaque.plate.tint = 0xffe6b0;
  }

  return {
    init: () => render(true),
    update: () => { render(); pulse(); },
    refresh: () => render(true),
    async prepare(renderer) {
      render(false, true);
      await renderer.prepare.upload(root);
    },
    getPreparationSnapshot: () => ({ visible: root.visible, childCount: root.children.length, buildCount }),
    getSemanticSnapshot: () => {
      const p=getPresentation?.()??{},v=p.profileVassal??p.vassal;
      return {visible:root.visible===true,prestigeDelta:getDeltas?.()?.prestige??0,
        stats:root.children.flatMap(child => child.children ?? []).filter(child => child.statPresentation).map(child => child.statPresentation),
        retinue:getRetinue(p.state,v),bagRect:bagControl?.getBounds?.(),
        activeSlotRects:activeSlots.map(slot=>slot.getBounds()),
        equipped:(v?.heirlooms?.equipped??[]).map(item=>item?.definitionId??null)};
    },
  };
}
