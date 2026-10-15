import { pointerLocalXToSec } from '../../../src/views/timegraphs/scrub-session.js';
import { waterPaletteColour,waterCycleProfile,WATER_RAMPS,STUDY_YEAR_SECONDS } from './water-style.js';
import { sampleWaterDrift,waterDriftOffset } from './water-drift.js';

const format = seconds => `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(1).padStart(4, '0')}`;
const mix = (a, b, t) => {
  let rgb = 0;
  for (const shift of [16, 8, 0]) rgb |= Math.round(((a >> shift) & 255) * (1 - t) + ((b >> shift) & 255) * t) << shift;
  return rgb;
};

// Small study graph, not a second civilization graph/controller. Curves show the
// actual sampled water palette brightness, not invented gameplay metrics.
export function createMapTimegraph({ root, app, timeline, palette, seed=0, text, panel, button, targets, onChange }) {
  panel(root, 506, 710, 1872, 180, 0x192f33, 0x63786b);
  text(root, 'TIMEGRAPH', 526, 719, 23, 0xe5dfbd, { fontFamily: 'Arial, sans-serif', letterSpacing: 2 });
  const status = text(root, '', 740, 719, 23, 0xbad4c6, { fontFamily: 'Arial, sans-serif' });
  text(root, 'Swell', 1740, 724, 19, 0x729fa9, { fontFamily: 'Arial, sans-serif' });
  text(root, 'Foam', 1850, 724, 19, 0xd1d7ad, { fontFamily: 'Arial, sans-serif' });
  text(root, 'Water drift', 1960, 724, 19, 0x79c5ac, { fontFamily: 'Arial, sans-serif' });
  const legend=text(root, 'Samples', 2210, 724, 19, 0xa5bbb2, { fontFamily: 'Arial, sans-serif' });
  const plot = { x: 528, y: 757, w: 1820, h: 56 };
  const graph = new PIXI.Graphics(), marker = new PIXI.Graphics();
  graph.eventMode = 'none'; marker.eventMode = 'none'; root.addChild(graph, marker);
  const ticks = new PIXI.Container(); ticks.eventMode = 'none'; root.addChild(ticks);
  const hit = new PIXI.Container(); hit.eventMode = 'static'; hit.cursor = 'ew-resize';
  hit.hitArea = new PIXI.Rectangle(plot.x, plot.y - 4, plot.w, plot.h + 24); root.addChild(hit);
  targets.push({ label: 'Scrub map timegraph', x: plot.x, y: plot.y - 4, width: plot.w, height: plot.h + 24 });
  let pointer = null, key = '', draggingBounds = null;
  const seek = event => {
    const { minSec, maxSec } = draggingBounds || timeline.snapshot;
    timeline.seek(pointerLocalXToSec(event.global.x, plot, minSec, maxSec)); onChange();
  };
  hit.on('pointerdown', event => {
    if (pointer !== null) return;
    event.stopPropagation(); pointer = event.pointerId; draggingBounds = timeline.snapshot;
    timeline.beginScrub(); app.view.focus({ preventScroll: true });
    try { app.view.setPointerCapture(pointer); } catch { /* Synthetic probe has no native pointer. */ }
    seek(event);
  });
  hit.on('globalpointermove', event => { if (pointer === event.pointerId) seek(event); });
  const end = event => {
    if (pointer === null) return;
    if (event && event.pointerId !== pointer) return;
    try { app.view.releasePointerCapture(pointer); } catch { /* Already released outside canvas. */ }
    pointer = null; draggingBounds = null; timeline.endScrub(); onChange();
  };
  for (const event of ['pointerup', 'pointerupoutside', 'pointercancel']) hit.on(event, end);
  const play = button('Play or pause timeline', 528, 840, 150, 40, () => { timeline.play(!timeline.snapshot.playing); onChange(); }, { copy: 'Pause', size: 22 });
  const reverse = button('Reverse timeline playback', 690, 840, 150, 40, () => { timeline.setRate(-1); timeline.play(); onChange(); }, { copy: 'Reverse', size: 22 });
  const forward = button('Forward timeline playback', 852, 840, 150, 40, () => { timeline.setRate(1); timeline.play(); onChange(); }, { copy: 'Forward', size: 22 });
  const speed = button('Change timeline speed', 1014, 840, 126, 40, () => {
    const rates = [.25, 1, 4], rate = timeline.snapshot.rate;
    timeline.setRate(rates[(rates.indexOf(rate) + 1) % rates.length]); onChange();
  }, { copy: '1×', size: 22 });
  button('Return timeline to now', 1152, 840, 150, 40, () => { timeline.returnToNow(); onChange(); }, { copy: '↩ Now', size: 22 });
  const span=button('Toggle 50-year water study',1320,840,218,40,()=>{timeline.setLongSpan(!timeline.snapshot.longSpan);onChange();},{copy:'Span: 3 minutes',size:21});
  text(root, 'Drag to preview · Space: pause · ← →: step · N: now', 1558, 849, 20, 0x9eb3a9, { fontFamily: 'Arial, sans-serif' });
  function update() {
    const s = timeline.snapshot, { minSec, maxSec } = s;
    const x = sec => plot.x + (sec - minSec) / (maxSec - minSec) * plot.w;
    const graphKey = `${s.longSpan}:${minSec}:${maxSec}:${Math.floor(s.currentSec)}:${Math.floor(s.revealCapSec)}`;
    span.title.text=s.longSpan?'Span: 50 years':'Span: 3 minutes';
    legend.text=s.longSpan?'Strength / tint':'Samples';
    if (graphKey !== key) {
      key = graphKey; graph.clear();
      for (const child of ticks.removeChildren()) child.destroy();
      const frontierX = x(s.currentSec), capX = x(s.revealCapSec);
      graph.beginFill(0x29443e).drawRect(plot.x, plot.y, frontierX - plot.x, plot.h).endFill();
      graph.beginFill(0x263c48).drawRect(frontierX, plot.y, capX - frontierX, plot.h).endFill();
      graph.beginFill(0x14252b).drawRect(capX, plot.y, plot.x + plot.w - capX, plot.h).endFill();
      for (let sec = minSec; sec <= maxSec; sec += s.longSpan?STUDY_YEAR_SECONDS*10:30) {
        graph.lineStyle(1, 0x9bb6aa, .18).moveTo(x(sec), plot.y).lineTo(x(sec), plot.y + plot.h);
        const label = text(ticks, s.longSpan?`${sec/STUDY_YEAR_SECONDS}y`:`${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`, x(sec), plot.y + plot.h + 1, 17, 0xadc1b6, { fontFamily: 'Arial, sans-serif' }); label.anchor.x = .5;
      }
      if (palette) for (const [index, colour] of [[128, 0x729fa9], [160, 0xd1d7ad], [null,0x79c5ac]]) {
        graph.lineStyle(1.5, colour, .75);
        const steps = Math.min(1800,Math.ceil((s.revealCapSec - minSec) * 8));
        for (let n = 0; n <= steps; n++) {
          const sec = minSec + n / steps * (s.revealCapSec - minSec);
          const rgb = waterPaletteColour(index, palette, mix, sec);
          // Drift shows a representative blue/green tint sample, normalised to
          // the plot. It is not water depth or a global tint applied everywhere.
          const luminance = index===null?.5+sampleWaterDrift(waterDriftOffset(seed),0,sec)[1]/16:
            s.longSpan?waterCycleProfile(WATER_RAMPS.find(r=>r.start===index),sec).envelope:
            (.2126 * (rgb >> 16 & 255) + .7152 * (rgb >> 8 & 255) + .0722 * (rgb & 255)) / 255;
          const y = plot.y + plot.h - 4 - luminance * (plot.h - 8);
          if (n) graph.lineTo(x(sec), y); else graph.moveTo(x(sec), y);
        }
      }
      if(frontierX-plot.x>100) text(ticks, 'HISTORY', plot.x + 7, plot.y + 2, 16, 0xaac8b3, { fontFamily: 'Arial, sans-serif' });
      text(ticks, 'FORECAST', frontierX + 7, plot.y + 2, 16, 0x9dbac9, { fontFamily: 'Arial, sans-serif' });
      if(plot.x+plot.w-capX>125) text(ticks, 'UNREVEALED', capX + 7, plot.y + 2, 16, 0x6f8589, { fontFamily: 'Arial, sans-serif' });
    }
    marker.clear().lineStyle(2, 0xa7c79c, .85).moveTo(x(s.currentSec), plot.y).lineTo(x(s.currentSec), plot.y + plot.h);
    marker.lineStyle(3, 0xf2e3ad).moveTo(x(s.displaySec), plot.y - 5).lineTo(x(s.displaySec), plot.y + plot.h);
    marker.beginFill(0xf2e3ad).drawCircle(x(s.displaySec), plot.y - 4, 4).endFill();
    const stamp=sec=>s.longSpan?`${(sec/STUDY_YEAR_SECONDS).toFixed(1)}y`:format(sec);
    status.text = `${s.mode}  ${stamp(s.displaySec)}   ·   Now ${stamp(s.currentSec)}   ·   ${s.scrubbing ? 'Scrubbing' : s.playing ? 'Playing' : 'Paused'}`;
    play.title.text = s.playing ? 'Pause' : 'Play'; speed.title.text = `${s.rate}×`;
    reverse.node.alpha = s.rate < 0 ? 1 : .7; forward.node.alpha = s.rate > 0 ? 1 : .7;
  }
  update(); return { update, cancelScrub: end };
}
