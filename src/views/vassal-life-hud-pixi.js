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
import { FOUNDER_CLASSES, STAT_ICONS } from './protovassal-class-data.js';
import { RELIC } from './chronicle-skin.js';

const YEAR_STRIP = Object.freeze({ x: 590, y: 16, width: 1108, height: 54 });
export const LIFE_HUD = Object.freeze({
  x: YEAR_STRIP.x,
  y: YEAR_STRIP.y + YEAR_STRIP.height - 6,
  barHeight: 70,
  portraitSize: 84,
  width: YEAR_STRIP.width,
  chipWidth: 86,
  chipHeight: 54,
});

const TWEEN_MS = 700;

// Chronicle crest bar, design px on the 2424x1080 stage. Everything ends above
// y=200 so the level-up window (from y=204) never overlaps it.
const CREST = Object.freeze({
  bar: Object.freeze({ x: 600, y: 72, width: 1098, height: 65 }),
  medallion: Object.freeze({ cx: 552, cy: 128, ring: 141, portrait: 76 }),
  pendant: Object.freeze({ x: 700, y: 124, unit: 1.15 }),
  age: Object.freeze({ x: 712, y: 74 }),
  stats: Object.freeze({ x: 860, y: 66, width: 68, height: 63, gap: 6, unit: 1.1, studY: 7, bodyY: 41 }),
  heirlooms: Object.freeze({ x: 1170, cy: 104, size: 54, step: 64 }),
  tabs: Object.freeze({ right: 1606, y: 126, width: 76, height: 77, gap: 8, unit: .95 }),
});
export const LIFE_HUD_BOTTOM = 200;
const HUD_PREFIX = 'chronicle-hud-frames-v1/';
const HUD_PIECES = Object.freeze(['lintel-cap-left', 'lintel-cap-right', 'lintel-mid', 'medallion', 'pendant',
  'stat-plaque', 'exp-groove-empty', 'exp-groove-full', 'tab']);
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
  layer, getPresentation, getDeltas, getCountUp, isVisible, tooltipView, onOpenHeirlooms, getLevelUp,
} = {}) {
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
    const classTint = FOUNDER_CLASSES[vassal.classId ?? vassal.founderClassId]?.frameTint ?? 0xffffff;
    const tex = name => hudTexture(name);
    const painted = HUD_PIECES.every(name => tex(name));
    litPlaque = null;

    // ---- lintel bar: fixed carved caps and a tiled acanthus middle ----
    if (painted) {
      const mid = new PIXI.TilingSprite(tex('lintel-mid'), CREST.bar.width - 2 * 60, tex('lintel-mid').height);
      mid.position.set(CREST.bar.x + 60, CREST.bar.y); mid.tint = classTint; root.addChild(mid);
      const left = new PIXI.Sprite(tex('lintel-cap-left')); left.position.set(CREST.bar.x, CREST.bar.y);
      const right = new PIXI.Sprite(tex('lintel-cap-right')); right.anchor.set(1, 0);
      right.position.set(CREST.bar.x + CREST.bar.width, CREST.bar.y);
      for (const cap of [left, right]) { cap.tint = classTint; root.addChild(cap); }
    } else {
      const bar = new PIXI.Graphics();
      roundedRect(bar, CREST.bar.x, CREST.bar.y + 2, CREST.bar.width, CREST.bar.height - 4, 10, 0x2b332e, PALETTE.accent, 1.5);
      root.addChild(bar);
    }

    // ---- portrait medallion breaking the bar's left end ----
    const m = CREST.medallion;
    const portrait = createVassalPortraitView(vassal.portrait, {
      size: m.portrait, classId: vassal.classId ?? vassal.founderClassId, founder: !!vassal.founderClassId,
      borderColor: PALETTE.accent, shape: "circle", age: shown.age,
    });
    portrait.position.set(m.cx - m.portrait / 2, m.cy - m.portrait / 2);
    root.addChild(portrait);
    if (painted) {
      const ring = new PIXI.Sprite(tex('medallion')); ring.position.set(m.cx - m.ring / 2, m.cy - m.ring / 2);
      ring.tint = classTint; root.addChild(ring);
    } else {
      const ring = new PIXI.Graphics(); ring.lineStyle(6, PALETTE.accent, 1).drawCircle(m.cx, m.cy, m.portrait / 2 + 3);
      root.addChild(ring);
    }

    // ---- Prestige pendant hanging under the bar ----
    const pd = CREST.pendant;
    if (painted) {
      const plate = new PIXI.Sprite(tex('pendant')); plate.position.set(pd.x, pd.y); plate.scale.set(pd.unit);
      root.addChild(plate);
    } else {
      const plate = new PIXI.Graphics(); roundedRect(plate, pd.x, pd.y + 20, 112, 60, 9, 0x423d2c, PALETTE.accent, 3);
      root.addChild(plate);
    }
    addResourceAmount(root, "prestige", Math.max(0, shown.prestige + (deltas?.prestige ?? 0)), {
      x: pd.x + 12, y: pd.y + 33, fontSize: 26, iconSize: 28,
      fill: shown.flashing ? PALETTE.green : PALETTE.accent,
    });
    const prestigeDelta = signedDelta(deltas?.prestige);
    if (prestigeDelta) {
      root.addChild(createText(prestigeDelta, {
        ...TEXT_STYLES.chip, fontSize: 14, fill: deltas.prestige > 0 ? PALETTE.green : PALETTE.red,
        stroke: 0x101314, strokeThickness: 3,
      }, pd.x + 108, pd.y + 30, 1));
    }

    // ---- age and the EXP groove (amber fill, studs at each quarter) ----
    const ag = CREST.age;
    root.addChild(createText(`AGE ${shown.age}`, {
      ...TEXT_STYLES.chip, fontSize: 24, fill: PALETTE.text, stroke: 0x0b0c0b, strokeThickness: 4,
    }, ag.x, ag.y));
    const threshold = VASSAL_LIFE_TUNING.developmentThreshold;
    const ratio = Math.max(0, Math.min(1, shown.exp / threshold));
    const gx = ag.x, gy = ag.y + 34;
    if (painted) {
      const empty = new PIXI.Sprite(tex('exp-groove-empty')); empty.position.set(gx, gy);
      const full = new PIXI.Sprite(tex('exp-groove-full')); full.position.set(gx, gy);
      const clip = new PIXI.Graphics().beginFill(0xffffff)
        .drawRect(gx, gy, GROOVE_INNER.x + (full.width - 2 * GROOVE_INNER.x) * ratio, full.height).endFill();
      full.mask = clip; root.addChild(empty, full, clip);
    } else {
      const g = new PIXI.Graphics();
      roundedRect(g, gx, gy, 122, 20, 6, 0x1c1916, PALETTE.stroke, 1);
      g.beginFill(0xd98a2b).drawRect(gx + 4, gy + 5, 114 * ratio, 10).endFill(); root.addChild(g);
    }
    const stud = studTexture();
    for (let q = 1; q <= 3; q++) {
      const lit = ratio >= q / 4, sx = gx + GROOVE_INNER.x + (122 - 2 * GROOVE_INNER.x) * q / 4, sy = gy + 11;
      if (stud) {
        const s = new PIXI.Sprite(stud); s.anchor.set(.5); s.position.set(sx, sy); s.width = s.height = 12;
        s.tint = lit ? 0xffffff : 0x5f5c55; root.addChild(s);
      } else {
        const g = new PIXI.Graphics(); g.lineStyle(1, RELIC.brass).beginFill(lit ? 0xc46a1c : 0x2b2b28).drawCircle(sx, sy, 5).endFill();
        root.addChild(g);
      }
    }
    const expHit = new PIXI.Container(); expHit.position.set(gx, ag.y); expHit.eventMode = 'static';
    expHit.hitArea = new PIXI.Rectangle(0, 0, 130, 60);
    const expTip = () => ({ title: `EXP ${shown.exp} / ${threshold}`, scale: 2,
      lines: ['Completed nodes add EXP. At the threshold the Vassal levels up and picks an attribute.'] });
    expHit.on('pointerover', e => { if (e.pointerType !== 'touch' && !pinnedStatId) tooltipView?.show?.(expTip(), expHit.getBounds()); });
    expHit.on('pointerout', () => { if (!pinnedStatId) tooltipView?.hide?.(); });
    root.addChild(expHit);
    const expDelta = signedDelta(deltas?.development);
    if (expDelta) {
      root.addChild(createText(expDelta, {
        ...TEXT_STYLES.chip, fontSize: 14, fill: PALETTE.green, stroke: 0x0b0c0b, strokeThickness: 3,
      }, ag.x + 128, ag.y + 4, 1, 0));
    }

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
      // The top stud lights when pinned, or pulses for the level-up's chosen stat.
      const glow = new PIXI.Graphics(); glow.position.set(sp.width / 2, sp.studY);
      for (let r = 0; r < 3; r++) glow.beginFill(0xffb347, .18 + r * .14).drawCircle(0, 0, 13 - r * 4).endFill();
      glow.blendMode = PIXI.BLEND_MODES.ADD; glow.visible = pinned || chosen; chip.addChild(glow);
      if (chosen) litPlaque = { chip, glow, plate };
      addResourceIcon(chip, STAT_ICONS[stat.label] ?? 'prestige', 20, sp.bodyY, 26);
      const delta = signedDelta(deltas?.stats?.[stat.statId]);
      chip.addChild(createText(String(stat.value + (delta ? Number(deltas.stats[stat.statId]) : 0)), {
        ...TEXT_STYLES.header, fontSize: 24, fill: delta ? PALETTE.green : PALETTE.text,
      }, 50, sp.bodyY, .5, .5));
      const hovered = () => { if (plate && !pinned) plate.tint = 0xfff4dc; };
      const unhovered = () => { if (plate && !pinned) plate.tint = 0xffffff; };
      chip.on("pointerdown", (event) => event?.stopPropagation?.());
      chip.on("pointerover", () => { hovered(); if (!pinnedStatId) showStatTooltip(stat, chip); });
      chip.on("pointerout", () => { unhovered(); if (!pinnedStatId) tooltipView?.hide?.(); });
      chip.on("pointertap", (event) => {
        event?.stopPropagation?.();
        if (pinnedStatId === stat.statId) hideStatTooltip();
        else { pinnedStatId = stat.statId; showStatTooltip(stat, chip); }
      });
      root.addChild(chip);
    });

    // ---- heirloom sockets and bag; locked while the level-up is open ----
    const locked = levelUp?.open === true;
    const hs = CREST.heirlooms;
    const socketed = (index, build) => {
      const cx = hs.x + index * hs.step + hs.size / 2, cy = hs.cy;
      const holder = new PIXI.Container(); root.addChild(holder);
      const socket = addPaintedSocket(holder, cx, cy, hs.size + 8, { tint: classTint });
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

    // ---- hanging tabs: commission (or Retinue) and location ----
    const location = String(getRegionReference(presentation.state, vassal.locationRegionId) ?? vassal.locationRegionId ?? "");
    const tabs = [];
    if (vassal.classId === 'warrior') {
      const retinue = getRetinue(presentation.state, vassal);
      tabs.push({ label: 'RETINUE', value: `+${retinue.value}`, tip: { title: 'Personal Retinue', scale: 2, lines: [`+${retinue.value} Martial Force`, `Next at ${retinue.nextPrestige} Prestige`] } });
    } else if (vassal.commission) {
      const c = vassal.commission;
      tabs.push({ label: 'TASK', value: c.amount ? `${c.progress}/${c.amount}` : `+${c.prestige}`, tip: { title: 'Commission', scale: 2, lines: [`${c.label}${c.amount ? ` (${c.progress}/${c.amount})` : ''}`, `+${c.prestige} Prestige on completion`] } });
    }
    tabs.push({ label: 'AT', value: location, tip: { title: `Location ${location}`, scale: 2, lines: ['The Vassal\'s current region.'] } });
    const tb = CREST.tabs;
    tabs.forEach((entry, index) => {
      const x = tb.right - (tabs.length - index) * (tb.width + tb.gap);
      const tab = new PIXI.Container(); tab.position.set(x, tb.y); tab.eventMode = 'static';
      tab.hitArea = new PIXI.Rectangle(0, 0, tb.width, tb.height);
      if (painted) { const sprite = new PIXI.Sprite(tex('tab')); sprite.scale.set(tb.unit); tab.addChild(sprite); }
      else { const g = new PIXI.Graphics(); roundedRect(g, 10, 14, tb.width - 20, tb.height - 20, 4, 0x4a1e1e, PALETTE.accent, 1.5); tab.addChild(g); }
      tab.addChild(
        createText(entry.label, { ...TEXT_STYLES.chip, fontSize: 12, fill: 0xd9b98a }, tb.width / 2, 26, .5, 0),
        createText(entry.value, { ...TEXT_STYLES.header, fontSize: 20, fill: PALETTE.text, stroke: 0x1a0b0b, strokeThickness: 3 }, tb.width / 2, 42, .5, 0));
      const v = tab.children.at(-1); if (v.width > tb.width - 22) v.scale.set((tb.width - 22) / v.width);
      tab.on('pointerover', e => { if (e.pointerType !== 'touch' && !pinnedStatId) tooltipView?.show?.(entry.tip, tab.getBounds()); });
      tab.on('pointerout', () => { if (!pinnedStatId) tooltipView?.hide?.(); });
      tab.on('pointertap', e => { if (e.pointerType === 'touch') tooltipView?.show?.(entry.tip, tab.getBounds()); });
      root.addChild(tab);
    });
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
        retinue:getRetinue(p.state,v),bagRect:bagControl?.getBounds?.(),
        activeSlotRects:activeSlots.map(slot=>slot.getBounds()),
        equipped:(v?.heirlooms?.equipped??[]).map(item=>item?.definitionId??null)};
    },
  };
}
