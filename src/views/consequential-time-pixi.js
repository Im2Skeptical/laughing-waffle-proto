import { getChronicleTexture } from './chronicle-art.js';
import { createTimePassageDisksView } from './sunandmoon-disks-pixi.js';
import { createText, roundedRect } from './settlement-view-primitives.js';
import { PALETTE, TEXT_STYLES } from './settlement-theme.js';

export const TIME_REVEAL_DURATION_MS = 2200;

// Counters always advance toward the authoritative endpoint. Mechanical recoil
// belongs only to the wheels/cabinet, never to the displayed or simulation time.
export function sampleTimeReveal(elapsedMs) {
  const t = Math.max(0, elapsedMs);
  if (t < 180) return { progress: 0, recoil: -0.035 * Math.sin(t / 180 * Math.PI), locked: false };
  if (t < 1900) {
    const p = (t - 180) / 1720;
    return { progress: p * p * (3 - 2 * p), recoil: 0, locked: false };
  }
  const p = Math.min(1, (t - 1900) / 300);
  return { progress: 1, recoil: 0.045 * Math.sin(p * Math.PI * 3) * (1 - p) ** 2, locked: p === 1 };
}

export function getTimeRevealCounters(clock, second) {
  const total = Math.max(0, Math.floor(second));
  const years = Math.floor(total / clock.seasonCycleSec);
  const remainder = total - years * clock.seasonCycleSec;
  const moons = Math.floor(remainder / clock.moonCycleSec);
  const phases = Math.floor((remainder - moons * clock.moonCycleSec)
    / (clock.moonCycleSec / 6));
  return { years, moons, phases };
}

export function createConsequentialTimeView(parent, clock, { x, y, width, accent = PALETTE.accent }) {
  const root = new PIXI.Container();
  root.position.set(x, y);
  root.eventMode = 'none';
  parent.addChild(root);
  const mechanism = new PIXI.Container();
  root.addChild(mechanism);
  const frame = new PIXI.Graphics();
  frame.lineStyle(3, PALETTE.stroke, .8).drawCircle(width / 2, 176, 174);
  frame.lineStyle(1, accent, .5).drawCircle(width / 2, 176, 182);
  for (let i = 0; i < 48; i++) {
    const angle = i / 48 * Math.PI * 2;
    const inner = i % 4 === 0 ? 174 : 179;
    frame.moveTo(width / 2 + Math.cos(angle) * inner, 176 + Math.sin(angle) * inner)
      .lineTo(width / 2 + Math.cos(angle) * 185, 176 + Math.sin(angle) * 185);
  }
  mechanism.addChild(frame);
  const disks = createTimePassageDisksView(mechanism, clock, { x: width / 2, y: 176, radius: 166 });
  const counters = [];
  const gap = 18;
  const cellWidth = (width - gap * 2) / 3;
  for (const [index, [id, label, key]] of [['year', 'Year', 'years'], ['moon', 'Moon', 'moons'], ['phase', 'Phase', 'phases']].entries()) {
    const cell = new PIXI.Container();
    cell.position.set(index * (cellWidth + gap), 308);
    const plate = new PIXI.Graphics();
    roundedRect(plate, 0, 0, cellWidth, 120, 8, 0x111b1b, PALETTE.stroke, 2);
    plate.lineStyle(1, accent, .6).moveTo(12, 10).lineTo(cellWidth - 12, 10);
    for (const bx of [10, cellWidth - 10]) for (const by of [10, 110]) {
      plate.beginFill(PALETTE.stroke).drawCircle(bx, by, 3).endFill();
    }
    cell.addChild(plate);
    const icon = new PIXI.Sprite(getChronicleTexture(`piece-frames-v1/time-${id}.png`) ?? PIXI.Texture.EMPTY);
    icon.anchor.set(.5); icon.position.set(52, 50); icon.width = icon.height = 76;
    const name = createText(label, { ...TEXT_STYLES.title, fontSize: 30, fill: PALETTE.textMuted }, 52, 100, .5, .5);
    const value = createText('0', { ...TEXT_STYLES.header, fontSize: 82, fill: PALETTE.text },
      (cellWidth + 104) / 2, 60, .5, .5);
    cell.addChild(icon, name, value);
    root.addChild(cell);
    counters.push({ cell, value, key, last: null, tickAt: -Infinity });
  }
  let snapshot = null;
  return {
    update(elapsedMs) {
      const motion = sampleTimeReveal(elapsedMs);
      disks.update(motion.progress, motion.recoil);
      const time = disks.getSnapshot();
      const values = getTimeRevealCounters(clock, time.second);
      mechanism.y = motion.recoil * 35;
      for (const counter of counters) {
        const next = values[counter.key];
        if (counter.last !== next) {
          if (counter.last !== null) counter.tickAt = elapsedMs;
          counter.last = next;
          counter.value.text = String(next);
          counter.value.scale.set(Math.min(1, (cellWidth - 122) / Math.max(1, counter.value.width / counter.value.scale.x)));
        }
        const tick = Math.max(0, 1 - (elapsedMs - counter.tickAt) / 85);
        counter.value.y = 60 - tick * 4;
        counter.value.tint = motion.locked ? 0xffe3a1 : 0xffffff;
        counter.cell.y = 308 + motion.recoil * 12;
      }
      snapshot = { ...time, ...motion, counters: values, labels: ['Year', 'Moon', 'Phase'] };
    },
    getSnapshot: () => snapshot,
  };
}
