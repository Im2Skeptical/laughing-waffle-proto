// Throwaway Pixi landscape study: A topology, B geographic skeleton, C terrain.
// Same generated map in each mode; no live renderer or simulation is attached.
import { generateMap, BIOMES, FEATURE_SETS, insidePolygon, decorationRandom } from './generator.js';
import { VIEWPORT_DESIGN_WIDTH as W, VIEWPORT_DESIGN_HEIGHT as H } from '../../../src/views/layout-pixi.js';
import { attachDevPreviewDisplay } from '../../../src/views/dev-preview-display.js';

const VARIANTS = { A: 'Regions', B: 'Geography', C: 'Terrain' };
const FEATURE_NAMES = { river: 'River', ridge: 'Mountain range', chasm: 'Chasm', valley: 'Valley' };
const params = new URL(location.href).searchParams;
const numberParam = (name, fallback, min, max) => params.has(name) && Number.isFinite(Number(params.get(name)))
  ? Math.max(min, Math.min(max, Number(params.get(name)))) : fallback;
const state = { seed: Math.floor(numberParam('seed', 1847, 0, 2147483647)),
  clustering: numberParam('clustering', .45, 0, 1), sizeVariation: numberParam('size', .6, 0, 1),
  roughness: numberParam('roughness', .65, 0, 1), featureSet: Math.floor(numberParam('features', 0, 0, 3)),
  variant: VARIANTS[params.get('variant')] ? params.get('variant') : 'C',
  flipX: params.get('flipX') === '1', flipY: params.get('flipY') === '1', selected: null };
const host = document.getElementById('map-preview');
const app = new PIXI.Application({ width: W, height: H, backgroundColor: 0x13262c, antialias: true,
  resolution: Math.min(devicePixelRatio || 1, 2), autoDensity: true, preserveDrawingBuffer: true, autoStart: false });
host.prepend(app.view); app.view.setAttribute('aria-label', 'Interactive regional map study');
app.view.tabIndex = 0;
const rotated = () => host.classList.contains('dev-preview-expanded') && matchMedia('(orientation:portrait) and (pointer:coarse)').matches;
const mapPosition = app.renderer.events.mapPositionToPoint.bind(app.renderer.events);
app.renderer.events.mapPositionToPoint = (target, x, y) => {
  if (!rotated()) return mapPosition(target, x, y);
  const rect = app.view.getBoundingClientRect();
  target.x = (y - rect.top) / rect.height * W;
  target.y = (rect.right - x) / rect.width * H;
};
const root = new PIXI.Container(); app.stage.addChild(root);
const mapRect = { x: 535, y: 190, width: 1800, height: 650 };
let map = generateMap(state), targets = [];
const point = p => ({ x: mapRect.x + (state.flipX ? 1 - p.x : p.x) * mapRect.width,
  y: mapRect.y + (state.flipY ? 1 - p.y : p.y) * mapRect.height });
const polygonPoints = points => points.flatMap(p => { const v = point(p); return [v.x, v.y]; });

function text(parent, value, x, y, size = 30, colour = 0xe6e0c9, options = {}) {
  const node = new PIXI.Text(value, { fontFamily: 'Georgia, serif', fontSize: size, fill: colour, ...options });
  node.position.set(x, y); parent.addChild(node); return node;
}
function line(parent, points, colour, width, alpha = 1) {
  const g = new PIXI.Graphics().lineStyle(width, colour, alpha);
  points.forEach((p, i) => { const v = point(p); if (i) g.lineTo(v.x, v.y); else g.moveTo(v.x, v.y); });
  parent.addChild(g); return g;
}
function panel(parent, x, y, w, h, fill = 0x1d3033, border = 0x53645a) {
  const g = new PIXI.Graphics().lineStyle(2, border).beginFill(fill).drawRoundedRect(x, y, w, h, 10).endFill();
  parent.addChild(g); return g;
}
function button(label, x, y, width, height, action, { copy = label, active = false, size = 30 } = {}) {
  const node = new PIXI.Container(); node.position.set(x, y);
  panel(node, 0, 0, width, height, active ? 0x3d6256 : 0x263b3d, active ? 0xb8cfa6 : 0x69796a);
  const title = text(node, copy, width / 2, height / 2, size, active ? 0xf2edcf : 0xd3d9c2, { fontFamily: 'Arial, sans-serif' }); title.anchor.set(.5);
  if (title.width > width - 22) title.scale.set((width - 22) / title.width);
  node.eventMode = 'static'; node.cursor = 'pointer'; node.hitArea = new PIXI.Rectangle(0, 0, width, height);
  node.accessible = true; node.accessibleTitle = label; node.accessibleType = 'button';
  node.on('pointertap', event => { event.stopPropagation(); action(); }); root.addChild(node);
  targets.push({ label, x, y, width, height });
}
function regenerate() { map = generateMap(state); state.selected = null; render(); }
function adjust(name, step) { state[name] = Math.round(Math.max(0, Math.min(1, state[name] + step)) * 100) / 100; regenerate(); }
function cycle(direction) { const keys = Object.keys(VARIANTS); state.variant = keys[(keys.indexOf(state.variant) + direction + keys.length) % keys.length]; render(); }

function drawControls() {
  panel(root, 30, 144, 440, 858);
  text(root, 'GENERATOR', 58, 168, 25, 0xcbb987, { fontFamily: 'Arial, sans-serif', letterSpacing: 4 });
  text(root, `Seed ${state.seed}`, 58, 218, 37);
  button('Previous seed', 58, 274, 174, 82, () => { state.seed = Math.max(0, state.seed - 1); regenerate(); }, { copy: '← Seed' });
  button('Next seed', 248, 274, 192, 82, () => { state.seed++; regenerate(); }, { copy: 'New seed →' });
  for (const [name, label, y] of [['clustering', 'Clustering', 392], ['sizeVariation', 'Size variation', 494], ['roughness', 'Border variation', 596]]) {
    text(root, `${label}  ${Math.round(state[name] * 100)}%`, 58, y, 29);
    const g = new PIXI.Graphics().beginFill(0x17282c).drawRoundedRect(58, y + 45, 208, 12, 6)
      .beginFill(0xafb487).drawRoundedRect(58, y + 45, 208 * state[name], 12, 6).endFill(); root.addChild(g);
    button(`Less ${label.toLowerCase()}`, 288, y - 8, 68, 80, () => adjust(name, -.15), { copy: '−', size: 42 });
    button(`More ${label.toLowerCase()}`, 372, y - 8, 68, 80, () => adjust(name, .15), { copy: '+', size: 42 });
  }
  const types = FEATURE_SETS[state.featureSet];
  button('Change geographic features', 58, 704, 382, 88, () => { state.featureSet = (state.featureSet + 1) % FEATURE_SETS.length; regenerate(); },
    { copy: types.length === 4 ? 'All four landforms →' : types.map(t => t === 'ridge' ? 'Range' : FEATURE_NAMES[t]).join(' + ') + ' →', size: 28 });
  button('Mirror horizontally', 58, 814, 182, 80, () => { state.flipX = !state.flipX; render(); }, { copy: 'Flip ↔', active: state.flipX });
  button('Mirror vertically', 256, 814, 184, 80, () => { state.flipY = !state.flipY; render(); }, { copy: 'Flip ↕', active: state.flipY });
  button('Save map PNG', 58, 914, 382, 64, exportPng, { copy: 'Save map PNG', size: 27 });
}

function drawTree(g, x, y, s, colour) {
  g.lineStyle(1.8, 0x2b493a, .8).moveTo(x, y + s).lineTo(x, y - s * .3);
  g.lineStyle(1, colour, .8).beginFill(colour, .78).drawPolygon([x, y - s * 1.7, x - s, y, x + s, y])
    .drawPolygon([x, y - s, x - s * 1.2, y + s * .55, x + s * 1.2, y + s * .55]).endFill();
}
function drawMountain(g, x, y, s, colour) {
  g.lineStyle(1.8, colour, .8).beginFill(0x877e70, .55).drawPolygon([x - s, y + s * .55, x, y - s, x + s, y + s * .55]).endFill();
  g.lineStyle(1, 0xe0d7b9, .65).moveTo(x - s * .3, y - s * .4).lineTo(x, y - s).lineTo(x + s * .35, y - s * .35);
  g.lineStyle(1.6, colour, .65).moveTo(x, y - s * .8).lineTo(x + s * .18, y + s * .2);
}
function drawBiome(region, parent) {
  const colour = BIOMES[region.biome], g = new PIXI.Graphics(), regionIndex = map.regions.indexOf(region);
  parent.addChild(g);
  const minX = Math.min(...region.outline.map(p => p.x)), maxX = Math.max(...region.outline.map(p => p.x));
  const minY = Math.min(...region.outline.map(p => p.y)), maxY = Math.max(...region.outline.map(p => p.y));
  const samples = Math.ceil(region.area * 2300);
  for (let i = 0; i < samples; i++) {
    const n = regionIndex * 20000 + i * 9;
    const p = { x: minX + decorationRandom(map.seed, n) * (maxX - minX), y: minY + decorationRandom(map.seed, n + 1) * (maxY - minY) };
    if (!insidePolygon(p, region.outline)) continue;
    const { x, y } = point(p), s = 4 + decorationRandom(map.seed, n + 2) * 8;
    if (region.biome === 'forest') drawTree(g, x, y, s, colour.ink);
    else if (region.biome === 'mountains') drawMountain(g, x, y, s * 1.6, colour.ink);
    else if (region.biome === 'islands') {
      g.lineStyle(3, 0xd5cb97, .85).beginFill(0x87986d).drawEllipse(x, y, s * 2.8, s * 1.2).endFill();
      g.lineStyle(1, 0xc3e1dd, .4).moveTo(x - s * 3, y + s * 2).lineTo(x + s * 2.2, y + s * 2);
    } else if (region.biome === 'swamp') {
      g.lineStyle(1, 0x829887, .5).beginFill(0x3e6562, .5).drawEllipse(x, y, s * 2.3, s * .7).endFill();
      g.lineStyle(1.8, colour.ink, .9).moveTo(x + s, y).lineTo(x + s * .8, y - s).moveTo(x + s * 1.4, y).lineTo(x + s * 1.6, y - s * .8);
    } else {
      g.lineStyle(1.5, colour.ink, .35).moveTo(x - s, y).quadraticCurveTo(x, y - s * .35, x + s, y);
      g.moveTo(x - s * .5, y + s * .5).lineTo(x + s * .6, y + s * .5);
    }
  }
}

function featurePath(feature) {
  return feature.edgeIds.flatMap((id, index) => {
    const edge = map.edges.find(e => e.id === id);
    const points = edge.a === feature.vertexIds[index] ? edge.points : [...edge.points].reverse();
    return index ? points.slice(1) : points;
  });
}
function drawFeatures() {
  for (const feature of map.features) {
    const points = featurePath(feature), skeleton = state.variant === 'B';
    if (feature.type === 'river') {
      line(root, points, 0x4d7768, skeleton ? 22 : 30, .22);
      line(root, points, 0xd3c995, 13, .9); line(root, points, 0x3e747f, 9); line(root, points, 0xa8d2cc, 2.5, .85);
    } else if (feature.type === 'chasm') {
      line(root, points, 0xb69b76, 25, .65); line(root, points, 0x514b47, 15); line(root, points, 0x222c2e, 7);
    } else if (feature.type === 'valley') {
      line(root, points, 0x718762, 70, .18); line(root, points, 0xc8bd88, 36, .3); line(root, points, 0xc7cf9c, 4, .5);
    } else {
      line(root, points, 0x645d4f, 45, .14);
      if (skeleton) line(root, points, 0xc5b292, 8, .85);
      const g = new PIXI.Graphics(); root.addChild(g);
      let remaining = 0;
      for (let i = 1; i < points.length; i++) {
        const a = point(points[i - 1]), b = point(points[i]), length = Math.hypot(b.x - a.x, b.y - a.y);
        for (; remaining < length; remaining += 27) {
          const t = remaining / length;
          drawMountain(g, a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t, 20 + Math.sin(i * .4) * 5, 0x595a53);
        }
        remaining -= length;
      }
    }
    if (skeleton) {
      const p = point(points[Math.floor(points.length * .55)]);
      const label = text(root, FEATURE_NAMES[feature.type], p.x, p.y - 35, 32, 0xf6ecd0, { stroke: 0x243439, strokeThickness: 7 }); label.anchor.set(.5);
    }
  }
}

function drawMap() {
  panel(root, 492, 144, 1900, 754, 0x24444c, 0x718071);
  const water = new PIXI.Graphics(); root.addChild(water);
  for (let y = 190; y < 860; y += 42) for (let x = 545; x < 2330; x += 88) {
    water.lineStyle(1.5, 0x9fc2b9, .09).moveTo(x, y).quadraticCurveTo(x + 20, y - 5, x + 44, y);
  }
  for (const region of map.regions) {
    const shape = new PIXI.Graphics(); root.addChild(shape);
    const points = polygonPoints(state.variant === 'A' ? region.polygon : region.outline);
    shape.beginFill(state.variant === 'B' ? 0x929c84 : BIOMES[region.biome].colour, state.variant === 'B' ? .72 : 1).drawPolygon(points).endFill();
    if (state.variant === 'C') {
      const art = new PIXI.Container(), mask = new PIXI.Graphics().beginFill(0xffffff).drawPolygon(points).endFill();
      root.addChild(art, mask); art.mask = mask; drawBiome(region, art);
    }
    shape.eventMode = 'static'; shape.cursor = 'pointer'; shape.hitArea = new PIXI.Polygon(points);
    shape.on('pointertap', () => { state.selected = region.id; render(); });
    const c = point(region.centre); targets.push({ label: region.id, x: c.x - 12, y: c.y - 12, width: 24, height: 24 });
  }
  for (const edge of map.edges) {
    const straight = [edge.points[0], edge.points.at(-1)];
    const sameBiome = edge.regions.length === 2 && map.regions.find(r => r.id === edge.regions[0]).biome === map.regions.find(r => r.id === edge.regions[1]).biome;
    const boundary = edge.regions.length === 1;
    line(root, state.variant === 'A' ? straight : edge.points, boundary ? 0xdace9b : 0x31493f,
      boundary ? 5 : state.variant === 'A' ? 2.5 : 1.8, boundary ? .9 : sameBiome && state.variant === 'C' ? .24 : .55);
  }
  if (state.variant !== 'A') drawFeatures();
  const selected = map.regions.find(r => r.id === state.selected);
  if (selected) {
    const g = new PIXI.Graphics().lineStyle(6, 0xf9edb4).beginFill(0xfff3b1, .1)
      .drawPolygon(polygonPoints(state.variant === 'A' ? selected.polygon : selected.outline)).endFill(); root.addChild(g);
  }
  for (const region of map.regions) {
    const p = point(region.centre), labels = state.variant === 'A';
    const g = new PIXI.Graphics().lineStyle(2, 0xefd9a6, .8).beginFill(0x263d38, .9).drawCircle(p.x, p.y, labels ? 23 : 8).endFill(); root.addChild(g);
    if (labels || selected?.id === region.id) {
      const label = text(root, region.id.slice(1), p.x, p.y, 26, 0xffedbf, { fontFamily: 'Arial, sans-serif' }); label.anchor.set(.5);
      if (labels) { const biome = text(root, BIOMES[region.biome].name, p.x, p.y + 31, 26, 0xf8f0d8, { stroke: 0x34483c, strokeThickness: 4 }); biome.anchor.set(.5, 0); }
    }
  }
  text(root, 'N', 2318, 182, 30, 0xd9d6b6); const compass = new PIXI.Graphics().lineStyle(2, 0xd9d6b6, .7).moveTo(2330, 227).lineTo(2330, 270)
    .moveTo(2318, 247).lineTo(2342, 247); root.addChild(compass);
  const caption = selected ? `${selected.id} · ${BIOMES[selected.biome].name} · ${(selected.area / map.totalArea * 100).toFixed(1)}% of land · Neighbours ${selected.neighbours.join(', ')}`
    : state.variant === 'A' ? '20 regions · straight-edge topology · tap a region to inspect'
      : state.variant === 'B' ? 'Continuous features follow shared edges across the map · decorative geography'
        : 'Biome textures, shared organic borders and continuous landforms · tap to inspect';
  panel(root, 514, 848, 1856, 38, 0x21383b, 0x21383b); text(root, caption, 534, 853, 25, 0xe2ddbd);
}

function render() {
  for (const node of root.removeChildren()) node.destroy({ children: true }); targets = [];
  text(root, 'THE SHAPING OF A WORLD', 38, 30, 48, 0xe8dfbf, { letterSpacing: 3 });
  text(root, 'MAP STUDY 01   /   20 regions · five biomes · no gameplay attached', 42, 94, 25, 0xacc1b2, { fontFamily: 'Arial, sans-serif', letterSpacing: 1.5 });
  drawControls(); drawMap();
  Object.entries(BIOMES).forEach(([id, biome], i) => {
    const x = 518 + i * 372, y = 928;
    const g = new PIXI.Graphics().beginFill(biome.colour).drawCircle(x + 12, y + 17, 12).endFill(); root.addChild(g);
    text(root, `${biome.name}  ${map.quota[id]}`, x + 37, y, 31);
    text(root, `${(map.biomeAreas[id] * 100).toFixed(1)}% of land`, x + 37, y + 43, 24, 0xaec1b4, { fontFamily: 'Arial, sans-serif' });
  });
  panel(root, 1004, 1003, 930, 62, 0x182e32, 0x778675);
  button('Previous map view', 1012, 1008, 100, 52, () => cycle(-1), { copy: '←', size: 35 });
  const label = text(root, `${state.variant}  /  ${VARIANTS[state.variant]}`, 1470, 1035, 29); label.anchor.set(.5);
  button('Next map view', 1826, 1008, 100, 52, () => cycle(1), { copy: '→', size: 35 });
  text(root, `${map.matchingBorders}/${map.sharedBorders} borders share a biome`, 520, 1022, 24, 0xa9bdaf, { fontFamily: 'Arial, sans-serif' });
  text(root, 'DISPOSABLE PROTOTYPE', 2010, 1023, 24, 0xa9bdaf, { fontFamily: 'Arial, sans-serif' });
  app.renderer.render(app.stage);
  sync();
}

function sync() {
  const url = new URL(location.href);
  for (const [key, value] of Object.entries({ seed: state.seed, clustering: state.clustering, size: state.sizeVariation,
    roughness: state.roughness, features: state.featureSet, variant: state.variant, flipX: state.flipX ? 1 : 0, flipY: state.flipY ? 1 : 0 })) url.searchParams.set(key, value);
  history.replaceState(null, '', url);
  document.getElementById('status').textContent = `Seed ${state.seed} · ${VARIANTS[state.variant]} · 20 regions · quota counts ${Object.values(map.quota).join(' / ')} · ${map.features.map(f => FEATURE_NAMES[f.type]).join(' + ')}`;
  document.getElementById('state').textContent = JSON.stringify({ controls: state, quota: map.quota,
    biomeLandPercent: Object.fromEntries(Object.entries(map.biomeAreas).map(([id, area]) => [id, +(area * 100).toFixed(1)])),
    features: map.features.map(f => ({ type: f.type, sharedEdges: f.edgeIds.length })),
    assumptions: 'Islands are water-rich regions with decorative islets; all graph neighbours remain intact. Landforms are edge routes, not a hydrology simulation. No live game or persistence.' }, null, 2);
}
function exportPng() {
  app.renderer.render(app.stage);
  const a = document.createElement('a'); a.download = `map-study-${state.seed}-${state.variant}.png`; a.href = app.view.toDataURL('image/png'); a.click();
}
function fitCanvas() {
  const scale = Math.min(host.clientWidth / W, host.clientHeight / H);
  // Size the canvas box itself, so Pixi pointer coordinates match letterboxing.
  app.view.style.setProperty('width', `${W * scale}px`, 'important');
  app.view.style.setProperty('height', `${H * scale}px`, 'important');
}
attachDevPreviewDisplay(host, { onChange: fitCanvas });
new ResizeObserver(fitCanvas).observe(host);
window.addEventListener('resize', fitCanvas);
fitCanvas();
document.addEventListener('keydown', event => {
  if (event.target.closest('input, textarea, select, [contenteditable]')) return;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); cycle(event.key === 'ArrowLeft' ? -1 : 1); }
});
window.mapWorkbench = { get state() { return { ...state }; }, get map() { return map; }, get targets() { return targets.map(t => {
  const r = app.view.getBoundingClientRect();
  if (rotated()) return { ...t, x: r.right - (t.y + t.height) / H * r.width, y: r.top + t.x / W * r.height,
    width: t.height / H * r.width, height: t.width / W * r.height };
  const scale = Math.min(r.width / W, r.height / H);
  return { ...t, x: r.x + (r.width - W * scale) / 2 + t.x * scale, y: r.y + (r.height - H * scale) / 2 + t.y * scale,
    width: t.width * scale, height: t.height * scale };
}) }, scene: { width: W, height: H, renderer: 'Pixi', regionCount: 20 },
  setState(patch) { Object.assign(state, patch); regenerate(); }, exportPng() { app.renderer.render(app.stage); return app.view.toDataURL('image/png'); } };
render(); document.body.dataset.ready = 'true';
