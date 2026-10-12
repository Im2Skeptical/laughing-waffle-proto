// Throwaway Pixi landscape study: A topology, B geographic skeleton, C terrain.
// Same generated map in each mode; no live renderer or simulation is attached.
import { generateMap, BIOMES, FEATURE_SETS, insidePolygon, decorationRandom } from './generator.js';
import { VIEWPORT_DESIGN_WIDTH as W, VIEWPORT_DESIGN_HEIGHT as H } from '../../../src/views/layout-pixi.js';
import { attachDevPreviewDisplay } from '../../../src/views/dev-preview-display.js';
import { createMapCamera } from '../../../src/views/world-map/camera.js';

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
const root = new PIXI.Container(), viewport = new PIXI.Container(), worldLayer = new PIXI.Container();
const viewRect = { x: 494, y: 146, width: 1896, height: 692 };
const backdrop = new PIXI.Graphics().beginFill(0x82795e).drawRoundedRect(viewRect.x, viewRect.y, viewRect.width, viewRect.height, 10).endFill();
const viewportMask = new PIXI.Graphics().beginFill(0xffffff).drawRoundedRect(viewRect.x, viewRect.y, viewRect.width, viewRect.height, 10).endFill();
backdrop.eventMode = 'none'; viewportMask.eventMode = 'none'; worldLayer.eventMode = 'none';
viewport.addChild(backdrop, worldLayer, viewportMask); worldLayer.mask = viewportMask;
app.stage.addChild(viewport, root);
let suppressTap = false;
let cameraPaintPending = false;
const gesturePointers = new Set();
const camera = createMapCamera(viewport, worldLayer, viewRect, { reducedMotion: () => true,
  onGesture: () => {
    suppressTap = true;
    if (cameraPaintPending) return;
    cameraPaintPending = true;
    requestAnimationFrame(() => { cameraPaintPending = false; app.renderer.render(app.stage); });
  },
});
viewport.on('pointerdown', event => {
  if (!gesturePointers.size) suppressTap = false;
  gesturePointers.add(event.pointerId);
  if (gesturePointers.size > 1) suppressTap = true;
});
for (const type of ['pointerup', 'pointerupoutside', 'pointercancel']) viewport.on(type, event => gesturePointers.delete(event.pointerId));
viewport.on('pointertap', event => {
  if (suppressTap) return;
  const local = worldLayer.toLocal(event.global);
  const x = (local.x - mapRect.x) / mapRect.width, y = (local.y - mapRect.y) / mapRect.height;
  const p = { x: state.flipX ? 1 - x : x, y: state.flipY ? 1 - y : y };
  const region = map.regions.find(r => insidePolygon(p, state.variant === 'A' ? r.polygon : r.outline));
  if (region) { state.selected = region.id; render(); }
});
const mapRect = { x: 652, y: 268, width: 1576, height: 516 };
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
function fitMap() {
  const points = map.regions.flatMap(r => r.outline).map(point);
  const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
  const minY = Math.min(...points.map(p => p.y)), maxY = Math.max(...points.map(p => p.y));
  const zoom = Math.min(1.15, 1760 / (maxX - minX), 555 / (maxY - minY));
  camera.restore({ zoom, x: 1440 - (minX + maxX) / 2 * zoom, y: 544 - (minY + maxY) / 2 * zoom });
  app.renderer.render(app.stage);
}
function regenerate() { map = generateMap(state); state.selected = null; fitMap(); render(); }
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
      g.lineStyle(1.5, 0xc3e1dd, .3).moveTo(x - s, y).quadraticCurveTo(x, y - s * .3, x + s * 1.7, y);
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
function drawLandform(parent, type, points, skeleton) {
    if (type === 'river') {
      line(parent, points, 0x4d7768, skeleton ? 22 : 30, .22);
      line(parent, points, 0xd3c995, 13, .9); line(parent, points, 0x3e747f, 9); line(parent, points, 0xa8d2cc, 2.5, .85);
    } else if (type === 'chasm') {
      line(parent, points, 0xb69b76, 25, .65); line(parent, points, 0x514b47, 15); line(parent, points, 0x222c2e, 7);
    } else if (type === 'valley') {
      line(parent, points, 0x718762, 70, .18); line(parent, points, 0xc8bd88, 36, .3); line(parent, points, 0xc7cf9c, 4, .5);
    } else {
      line(parent, points, 0x645d4f, 45, .14);
      if (skeleton) line(parent, points, 0xc5b292, 8, .85);
      const g = new PIXI.Graphics(); parent.addChild(g);
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
}
function drawFeatures() {
  for (const feature of map.features) {
    const points = featurePath(feature), skeleton = state.variant === 'B';
    if (feature.type === 'ridge') {
      const layer = new PIXI.Container(), mask = new PIXI.Graphics();
      layer.eventMode = 'none'; mask.eventMode = 'none';
      for (const region of map.regions.filter(r => r.biome !== 'islands')) mask.beginFill(0xffffff).drawPolygon(polygonPoints(region.outline)).endFill();
      for (const cluster of map.islandClusters) {
        mask.beginFill(0xffffff).drawPolygon(polygonPoints(cluster.contours[0]));
        for (const contour of cluster.contours.slice(1)) {
          if (insidePolygon(contour[0], cluster.contours[0])) mask.beginHole().drawPolygon(polygonPoints(contour)).endHole();
        }
        mask.endFill();
        for (const contour of cluster.contours.slice(1).filter(c => !insidePolygon(c[0], cluster.contours[0]))) mask.beginFill(0xffffff).drawPolygon(polygonPoints(contour)).endFill();
      }
      worldLayer.addChild(layer, mask); layer.mask = mask; drawLandform(layer, feature.type, points, skeleton);
    } else drawLandform(worldLayer, feature.type, points, skeleton);
    if (skeleton) {
      const p = point(points[Math.floor(points.length * .55)]);
      const label = text(worldLayer, FEATURE_NAMES[feature.type], p.x, p.y - 35, 32, 0xf6ecd0, { stroke: 0x243439, strokeThickness: 7 }); label.anchor.set(.5);
    }
  }
}

function drawSurroundings() {
  const layer = new PIXI.Container(); layer.eventMode = 'none'; worldLayer.addChild(layer); layer.alpha = .85;
  const landMask = new PIXI.Graphics(); landMask.eventMode = 'none';
  const colours = { ocean: 0x315561, mountains: 0x777968, wasteland: 0x8c8062 };
  for (const patch of map.surroundings.patches) {
    const patchLayer = new PIXI.Container(), clip = new PIXI.Graphics().beginFill(0xffffff).drawPolygon(polygonPoints(patch.points)).endFill();
    clip.eventMode = 'none'; patchLayer.eventMode = 'none'; layer.addChild(patchLayer, clip); patchLayer.mask = clip;
    const ink = new PIXI.Graphics().beginFill(colours[patch.kind]).drawPolygon(polygonPoints(patch.points)).endFill(); patchLayer.addChild(ink);
    if (patch.kind !== 'ocean') landMask.beginFill(0xffffff).drawPolygon(polygonPoints(patch.points)).endFill();
    const edge = map.edges.find(e => e.id === patch.edgeId);
    if (patch.kind === 'wasteland') line(patchLayer, edge.points, BIOMES[map.regions.find(r => r.id === patch.regionId).biome].colour, 42, .2);
    const bounds = { minX: Math.max(-.75, Math.min(...patch.points.map(p => p.x))), maxX: Math.min(1.75, Math.max(...patch.points.map(p => p.x))),
      minY: Math.max(-.75, Math.min(...patch.points.map(p => p.y))), maxY: Math.min(1.75, Math.max(...patch.points.map(p => p.y))) };
    const g = new PIXI.Graphics(); patchLayer.addChild(g);
    for (let i = 0; i < 260; i++) {
      const index = map.edges.indexOf(edge) * 1000 + i * 3 + 91000;
      const p = { x: bounds.minX + decorationRandom(map.seed, index) * (bounds.maxX - bounds.minX),
        y: bounds.minY + decorationRandom(map.seed, index + 1) * (bounds.maxY - bounds.minY) };
      if (!insidePolygon(p, patch.points)) continue;
      const { x, y } = point(p), size = 9 + decorationRandom(map.seed, index + 2) * 13;
      if (patch.kind === 'mountains') drawMountain(g, x, y, size * 1.4, 0x495851);
      else if (patch.kind === 'ocean') g.lineStyle(1.5, 0xacc9c2, .17).moveTo(x - size, y).quadraticCurveTo(x, y - 3, x + size, y);
      else g.lineStyle(1.5, 0x665d4a, .45).moveTo(x - size, y).lineTo(x, y - 3).lineTo(x + size * .8, y + 2)
        .moveTo(x, y - 3).lineTo(x + size * .2, y + 9);
    }
  }
  const landContinuations = new PIXI.Container(); landContinuations.eventMode = 'none'; layer.addChild(landContinuations, landMask); landContinuations.mask = landMask;
  if (state.variant !== 'A') for (const continuation of map.surroundings.continuations) {
    drawLandform(continuation.type === 'river' ? layer : landContinuations, continuation.type, continuation.points, false);
  }
  text(root, 'BEYOND THE PLAYABLE REGIONS', 520, 165, 22, 0xc0c4aa, { fontFamily: 'Arial, sans-serif', letterSpacing: 2 });
}

function drawIslands() {
  if (state.variant === 'A') return;
  for (const cluster of map.islandClusters) {
    const g = new PIXI.Graphics(); g.eventMode = 'none'; worldLayer.addChild(g);
    for (const contour of cluster.contours) {
      const points = polygonPoints(contour);
      const lagoon = contour !== cluster.contours[0] && insidePolygon(contour[0], cluster.contours[0]);
      g.lineStyle(11, 0x456e74, .65).beginFill(lagoon ? BIOMES.islands.colour : 0x94a276).drawPolygon(points).endFill();
      g.lineStyle(5, 0xe1cf95, .95).drawPolygon(points);
      g.lineStyle(1.5, 0x717f56, .7).drawPolygon(points);
    }
    if (state.variant === 'C') for (const core of cluster.cores) {
      const p = point(core.centre);
      for (const tree of core.foliage) {
        const q = point(tree);
        drawTree(g, q.x, q.y, 7, 0x47614b);
      }
      g.lineStyle(1.5, 0x6d7e53, .4).moveTo(p.x - 12, p.y + 15).quadraticCurveTo(p.x, p.y + 10, p.x + 18, p.y + 15);
    }
  }
}

function drawMap() {
  const frame = new PIXI.Graphics().lineStyle(2, 0x718071).drawRoundedRect(492, 144, 1900, 754, 10); root.addChild(frame);
  drawSurroundings();
  for (const region of map.regions) {
    const shape = new PIXI.Graphics(); worldLayer.addChild(shape);
    const points = polygonPoints(state.variant === 'A' ? region.polygon : region.outline);
    shape.beginFill(state.variant === 'B' ? 0x929c84 : BIOMES[region.biome].colour, state.variant === 'B' ? .72 : 1).drawPolygon(points).endFill();
    if (state.variant === 'C') {
      const art = new PIXI.Container(), mask = new PIXI.Graphics().beginFill(0xffffff).drawPolygon(points).endFill();
      worldLayer.addChild(art, mask); art.mask = mask; drawBiome(region, art);
    }
    shape.eventMode = 'none'; shape.hitArea = new PIXI.Polygon(points);
    shape.mapRegionId = region.id;
    const c = point(region.centre); targets.push({ label: region.id, x: c.x - 12, y: c.y - 12, width: 24, height: 24, map: true });
  }
  drawIslands();
  for (const edge of map.edges) {
    const straight = edge.topologyPoints;
    const sameBiome = edge.regions.length === 2 && map.regions.find(r => r.id === edge.regions[0]).biome === map.regions.find(r => r.id === edge.regions[1]).biome;
    const boundary = edge.regions.length === 1;
    const outside = boundary ? map.surroundings.patches.find(p => p.edgeId === edge.id) : null;
    const seaBoundary = outside?.kind === 'ocean', islandWater = seaBoundary && map.regions.find(r => r.id === edge.regions[0]).biome === 'islands';
    line(worldLayer, state.variant === 'A' ? straight : edge.points, boundary ? islandWater ? 0x7fa5a4 : seaBoundary ? 0xdace9b : 0xb2ad88 : 0x31493f,
      boundary ? islandWater ? 1.5 : 4 : state.variant === 'A' ? 2.5 : 1.8, boundary ? islandWater ? .4 : .8 : sameBiome && state.variant === 'C' ? .24 : .55);
  }
  if (state.variant !== 'A') drawFeatures();
  const selected = map.regions.find(r => r.id === state.selected);
  if (selected) {
    const g = new PIXI.Graphics().lineStyle(6, 0xf9edb4).beginFill(0xfff3b1, .1)
      .drawPolygon(polygonPoints(state.variant === 'A' ? selected.polygon : selected.outline)).endFill(); worldLayer.addChild(g);
  }
  for (const region of map.regions) {
    const p = point(region.centre), labels = state.variant === 'A';
    const g = new PIXI.Graphics().lineStyle(2, 0xefd9a6, .8).beginFill(0x263d38, .9).drawCircle(p.x, p.y, labels ? 23 : 8).endFill(); worldLayer.addChild(g);
    if (labels || selected?.id === region.id) {
      const label = text(worldLayer, region.id.slice(1), p.x, p.y, 26, 0xffedbf, { fontFamily: 'Arial, sans-serif' }); label.anchor.set(.5);
      if (labels) { const biome = text(worldLayer, BIOMES[region.biome].name, p.x, p.y + 31, 26, 0xf8f0d8, { stroke: 0x34483c, strokeThickness: 4 }); biome.anchor.set(.5, 0); }
    }
  }
  const oceanSides = map.world.oceanSides.map(side => state.flipX && (side === 'east' || side === 'west') ? side === 'east' ? 'west' : 'east' : side)
    .map(side => state.flipY && (side === 'north' || side === 'south') ? side === 'north' ? 'south' : 'north' : side);
  text(root, `Ocean: ${oceanSides.join(' + ')} · drag / pinch / scroll to explore`, 520, 198, 25, 0xd9d6b6);
  button('Zoom out', 2052, 158, 90, 70, () => { camera.zoomBy(.8); app.renderer.render(app.stage); }, { copy: '−', size: 38 });
  button('Zoom in', 2156, 158, 90, 70, () => { camera.zoomBy(1.25); app.renderer.render(app.stage); }, { copy: '+', size: 38 });
  button('Fit map', 2260, 158, 110, 70, fitMap, { copy: 'Fit' });
  const caption = selected ? `${selected.id} · ${BIOMES[selected.biome].name} · ${(selected.area / map.totalArea * 100).toFixed(1)}% of playable area · Neighbours ${selected.neighbours.join(', ')}`
    : state.variant === 'A' ? '20 regions · straight-edge topology · tap a region to inspect'
      : state.variant === 'B' ? 'Continuous features follow shared edges across the map · decorative geography'
        : `${map.islandClusters.length} island landmass${map.islandClusters.length === 1 ? '' : 'es'} · ocean, barren hinterland and highland barriers · tap to inspect`;
  panel(root, 514, 848, 1856, 38, 0x21383b, 0x21383b); text(root, caption, 534, 853, 25, 0xe2ddbd);
}

function render() {
  for (const node of root.removeChildren()) node.destroy({ children: true }); targets = [];
  for (const node of worldLayer.removeChildren()) node.destroy({ children: true });
  text(root, 'THE SHAPING OF A WORLD', 38, 30, 48, 0xe8dfbf, { letterSpacing: 3 });
  text(root, 'MAP STUDY 01   /   20 regions · five biomes · no gameplay attached', 42, 94, 25, 0xacc1b2, { fontFamily: 'Arial, sans-serif', letterSpacing: 1.5 });
  drawControls(); drawMap();
  Object.entries(BIOMES).forEach(([id, biome], i) => {
    const x = 518 + i * 372, y = 928;
    const g = new PIXI.Graphics().beginFill(biome.colour).drawCircle(x + 12, y + 17, 12).endFill(); root.addChild(g);
    text(root, `${biome.name}  ${map.quota[id]}`, x + 37, y, 31);
    text(root, `${(map.biomeAreas[id] * 100).toFixed(1)}% of playable area`, x + 37, y + 43, 24, 0xaec1b4, { fontFamily: 'Arial, sans-serif' });
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
    biomeAreaPercent: Object.fromEntries(Object.entries(map.biomeAreas).map(([id, area]) => [id, +(area * 100).toFixed(1)])),
    features: map.features.map(f => ({ type: f.type, sharedEdges: f.edgeIds.length })),
    islandClusters: map.islandClusters.map(c => ({ regions: c.regionIds, landContours: c.contours.length })),
    surroundings: [...new Set(map.surroundings.patches.map(p => p.kind))],
    world: map.world,
    assumptions: 'Ocean occupies one world side or two adjacent sides. The partition is reshaped with region-scale bays and protrusions. Mountain ink is clipped to land. Other world edges remain hinterland even beside Islands. All graph neighbours remain intact; surrounding terrain has no gameplay rules. No live game or persistence.' }, null, 2);
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
  if (t.map) { const pose = camera.snapshot(); t = { ...t, x: t.x * pose.zoom + pose.x, y: t.y * pose.zoom + pose.y,
    width: t.width * pose.zoom, height: t.height * pose.zoom }; }
  const r = app.view.getBoundingClientRect();
  if (rotated()) return { ...t, x: r.right - (t.y + t.height) / H * r.width, y: r.top + t.x / W * r.height,
    width: t.height / H * r.width, height: t.width / W * r.height };
  const scale = Math.min(r.width / W, r.height / H);
  return { ...t, x: r.x + (r.width - W * scale) / 2 + t.x * scale, y: r.y + (r.height - H * scale) / 2 + t.y * scale,
    width: t.width * scale, height: t.height * scale };
}) }, get camera() { return camera.snapshot(); }, scene: { width: W, height: H, renderer: 'Pixi', regionCount: 20, viewRect },
  setState(patch) { Object.assign(state, patch); regenerate(); }, exportPng() { app.renderer.render(app.stage); return app.view.toDataURL('image/png'); } };
fitMap(); render(); document.body.dataset.ready = 'true';
