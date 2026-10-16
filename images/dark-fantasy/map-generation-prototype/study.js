// Throwaway Pixi study: approved base geography and current Atlas rendering.
// Same generated map in each mode; no live renderer or simulation is attached.
import { generateMap, sampleSurroundings, projectToPath, canPlacePeak, BIOMES, FEATURE_SETS, insidePolygon, decorationRandom } from './generator.js';
import { VIEWPORT_DESIGN_WIDTH as W, VIEWPORT_DESIGN_HEIGHT as H } from '../../../src/views/layout-pixi.js';
import { attachDevPreviewDisplay } from '../../../src/views/dev-preview-display.js';
import { createMapCamera } from '../../../src/views/world-map/camera.js';
import { bakePixelTerrain, pixelSpriteTextures, pixelSpriteFits, reliefSpriteTextures, destroyPixelTerrain, prepareIllustratedArt, ATLAS_COLOURS } from './pixel-terrain.js';
import { createWheelZoom } from './wheel-zoom.js';
import { prepareCloudArt } from './cloud-banks.js';
import { createMapTimeline } from './map-timeline.js';
import { createMapTimegraph } from './map-timegraph.js';
import { settlementGround } from './settlement-ground.js';
import { createZoomArt, prepareLandmarkLods, smoothRange, zoomArtStats } from './zoom-art.js';

const MAP_VERSION = '1.0.29';
const VARIANTS = { C: 'Approved base structure', F: 'Dark fantasy atlas' };
const FEATURE_NAMES = { river: 'River', ridge: 'Mountain range', chasm: 'Chasm', valley: 'Valley' };
const params = new URL(location.href).searchParams;
const numberParam = (name, fallback, min, max) => params.has(name) && Number.isFinite(Number(params.get(name)))
  ? Math.max(min, Math.min(max, Number(params.get(name)))) : fallback;
const state = { seed: Math.floor(numberParam('seed', 1867, 0, 2147483647)),
  clustering: numberParam('clustering', .5, 0, 1), sizeVariation: numberParam('size', .85, 0, 1),
  roughness: numberParam('roughness', 1, 0, 1), featureSet: Math.floor(numberParam('features', 0, 0, 3)),
  variant: VARIANTS[params.get('variant')] ? params.get('variant') : 'F',
  texel: [2, 4, 6].includes(Number(params.get('texel'))) ? Number(params.get('texel')) : 4, sites: params.get('sites') !== '0', fog: params.get('fog') !== '0',
  siteArt: ['live', 'sketch'].includes(params.get('siteArt')) ? params.get('siteArt') : 'atlas', actorScale: numberParam('actorScale', .75, .5, 1.5),
  islandStyle: params.get('islandStyle') === 'caldera' ? 'caldera' : 'basalt',
  siteLabels: params.get('siteLabels') !== '0',
  wisps: params.get('wisps') === '1', clouds: params.get('clouds') !== '0', shadows: params.get('shadows') !== '0',
  waterMotion:params.has('waterMotion')?params.get('waterMotion')!=='0':!matchMedia('(prefers-reduced-motion: reduce)').matches,
  smoothZoom: params.get('smoothZoom') === '1', detailMode: ['close', 'regional', 'overview'].includes(params.get('detailMode')) ? params.get('detailMode') : 'auto',
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
const viewRect = { x: 494, y: 146, width: 1896, height: 552 };
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
    requestAnimationFrame(() => { cameraPaintPending = false; updateZoomPresentation(); app.renderer.render(app.stage); });
  },
});
const wheelZoom = createWheelZoom(camera, () => { updateZoomPresentation(); app.renderer.render(app.stage); });
viewport.removeAllListeners('wheel');
viewport.on('wheel', event => {
  event.preventDefault(); suppressTap = true;
  wheelZoom.wheel(event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewRect.height : 1), viewport.toLocal(event.global));
});
viewport.on('pointerdown', () => wheelZoom.cancel());
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
  const region = map.regions.find(r => insidePolygon(p, r.outline));
  if (region) { state.selected = region.id; render(); }
});
const mapRect = { x: 652, y: 268, width: 1576, height: 516 };
let map = generateMap(state), targets = [], backgroundArt = null;
let pixelArtMap = null, currentPixelArt = null;
let gameArt = null, liveSites = [];
let landmarkArt = null, zoomNodes = [], landmarkNodes = [], terrainLayer = null, overviewInk = null;
const pixelArtCache = new Map();
const pixelReview = () => state.variant === 'F';
const timeline=createMapTimeline({playing:state.waterMotion});
let timegraph=null,environmentFrameId=null;
function updateEnvironment(force=false) {
  if(!pixelReview()||!currentPixelArt)return;
  const started=performance.now(),seconds=timeline.snapshot.displaySec;
  currentPixelArt.backdropWaterCycle?.update(app.renderer,seconds,force);
  currentPixelArt.waterCycle.update(app.renderer,seconds,force);
  Object.assign(currentPixelArt.stats.waterStudy,{phaseSeconds:seconds,paused:!timeline.snapshot.playing||document.hidden,
    frames:currentPixelArt.waterCycle.frames,updateMs:Math.round((performance.now()-started)*100)/100,renderer:'GPU palette resolve + colour pyramid'});
  currentPixelArt.atmosphere?.update(app.renderer,seconds,state,force);
}
function scheduleEnvironment() {
  if(environmentFrameId!==null)cancelAnimationFrame(environmentFrameId);
  environmentFrameId=null;timeline.reset();
  if(!timeline.snapshot.playing||document.hidden)return;
  const frame=now=>{environmentFrameId=null;
    if(!timeline.snapshot.playing||document.hidden)return;
    if(timeline.step(now)){
      state.waterMotion=timeline.snapshot.playing;
      updateEnvironment();timegraph?.update();app.renderer.render(app.stage);
      if(!timeline.snapshot.playing)sync();
    }
    if(timeline.snapshot.playing)environmentFrameId=requestAnimationFrame(frame);
  };
  environmentFrameId=requestAnimationFrame(frame);
}
function timelineChanged() {
  state.waterMotion=timeline.snapshot.playing;
  updateEnvironment();timegraph?.update();app.renderer.render(app.stage);scheduleEnvironment();
  // Pointer movement updates animated GPU targets and the playhead, never terrain or JSON diagnostics.
  if(!timeline.snapshot.scrubbing)sync();
}
document.addEventListener('visibilitychange',()=>{
  if(document.hidden)timegraph?.cancelScrub();
  if(currentPixelArt)currentPixelArt.stats.waterStudy.paused=!timeline.snapshot.playing||document.hidden;
  scheduleEnvironment();
});
app.view.addEventListener('webglcontextrestored',()=>{if(currentPixelArt)render();});
const point = p => ({ x: mapRect.x + (state.flipX ? 1 - p.x : p.x) * mapRect.width,
  y: mapRect.y + (state.flipY ? 1 - p.y : p.y) * mapRect.height });
const polygonPoints = points => points.flatMap(p => { const v = point(p); return [v.x, v.y]; });
const worldPoint = (x, y) => ({ x: state.flipX ? 1 - (x - mapRect.x) / mapRect.width : (x - mapRect.x) / mapRect.width,
  y: state.flipY ? 1 - (y - mapRect.y) / mapRect.height : (y - mapRect.y) / mapRect.height });

function text(parent, value, x, y, size = 30, colour = 0xe6e0c9, options = {}) {
  const node = new PIXI.Text(value, { fontFamily: 'Georgia, serif', fontSize: size, fill: colour, ...options });
  node.resolution = 2;
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
  return { node, title };
}
function fitMap() {
  wheelZoom.cancel();
  const points = map.regions.flatMap(r => r.outline).map(point);
  const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
  const minY = Math.min(...points.map(p => p.y)), maxY = Math.max(...points.map(p => p.y));
  const zoom = Math.min(1.15, 1760 / (maxX - minX), 425 / (maxY - minY));
  camera.restore({ zoom, x: 1440 - (minX + maxX) / 2 * zoom, y: 475 - (minY + maxY) / 2 * zoom });
  app.renderer.render(app.stage);
}
function regenerate() { map = generateMap(state); state.selected = null; fitMap(); render(); }
function adjust(name, step) { state[name] = Math.round(Math.max(0, Math.min(1, state[name] + step)) * 1000) / 1000; regenerate(); }
function cycle(direction) { const keys = Object.keys(VARIANTS); state.variant = keys[(keys.indexOf(state.variant) + direction + keys.length) % keys.length]; render(); }

function drawControls() {
  panel(root, 30, 144, 440, 858);
  text(root, 'GENERATOR', 58, 168, 25, 0xcbb987, { fontFamily: 'Arial, sans-serif', letterSpacing: 4 });
  text(root, `Seed ${state.seed}`, 58, 218, 37);
  button('Previous seed', 58, 274, 174, 82, () => { state.seed = Math.max(0, state.seed - 1); regenerate(); }, { copy: '← Seed' });
  button('Next seed', 248, 274, 192, 82, () => { state.seed++; regenerate(); }, { copy: 'New seed →' });
  for (const [name, label, y] of [['clustering', 'Clustering', 392], ['sizeVariation', 'Size variation', 494], ['roughness', 'Border variation', 596]]) {
    text(root, `${label}  ${Math.round(state[name] * 1000) / 10}%`, 58, y, 29);
    const g = new PIXI.Graphics().beginFill(0x17282c).drawRoundedRect(58, y + 45, 208, 12, 6)
      .beginFill(0xafb487).drawRoundedRect(58, y + 45, 208 * state[name], 12, 6).endFill(); root.addChild(g);
    button(`Less ${label.toLowerCase()}`, 288, y - 8, 68, 80, () => adjust(name, name === 'clustering' ? -.025 : -.15), { copy: '−', size: 42 });
    button(`More ${label.toLowerCase()}`, 372, y - 8, 68, 80, () => adjust(name, name === 'clustering' ? .025 : .15), { copy: '+', size: 42 });
  }
  const types = FEATURE_SETS[state.featureSet];
  button('Change geographic features', 58, 704, 382, 88, () => { state.featureSet = (state.featureSet + 1) % FEATURE_SETS.length; regenerate(); },
    { copy: types.length === 4 ? 'All four landforms →' : types.map(t => t === 'ridge' ? 'Range' : FEATURE_NAMES[t]).join(' + ') + ' →', size: 28 });
  button('Mirror horizontally', 58, 814, 182, 80, () => { state.flipX = !state.flipX; render(); }, { copy: 'Flip ↔', active: state.flipX });
  button('Mirror vertically', 256, 814, 184, 80, () => { state.flipY = !state.flipY; render(); }, { copy: 'Flip ↕', active: state.flipY });
  button('Save map PNG', 58, 914, 382, 64, exportPng, { copy: 'Save map PNG', size: 27 });
  if (state.variant === 'F') button('Switch island terrain', 58, 1008, 382, 52, () => { state.islandStyle = state.islandStyle === 'basalt' ? 'caldera' : 'basalt'; render(); }, { copy: state.islandStyle === 'basalt' ? 'Islands: Basalt' : 'Islands: Caldera', size: 24 });
}

function drawTree(g, x, y, s, colour) {
  g.lineStyle(1.8, 0x2b493a, .8).moveTo(x, y + s).lineTo(x, y - s * .3);
  g.lineStyle(1, colour, .8).beginFill(colour, .78).drawPolygon([x, y - s * 1.7, x - s, y, x + s, y])
    .drawPolygon([x, y - s, x - s * 1.2, y + s * .55, x + s * 1.2, y + s * .55]).endFill();
}
function drawMountain(g, x, y, s, colour) {
  if (!canPlacePeak(map.geography, worldPoint(x, y), s * 1.2 / mapRect.height)) return;
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
  return feature.points;
}
function drawLandform(parent, type, points) {
    if (type === 'river') {
      line(parent, points, 0x4d7768, 30, .22);
      const g = new PIXI.Graphics(); parent.addChild(g); let travelled = 0;
      for (let i = 1; i < points.length; i++) {
        const a = point(points[i - 1]), b = point(points[i]); travelled += Math.hypot(b.x - a.x, b.y - a.y);
        const width = 3 + 6 * Math.min(1, travelled / 100);
        g.lineStyle(width + 4, 0xd3c995, .9).moveTo(a.x, a.y).lineTo(b.x, b.y);
        g.lineStyle(width, 0x3e747f).moveTo(a.x, a.y).lineTo(b.x, b.y);
        g.lineStyle(Math.max(1, width * .27), 0xa8d2cc, .85).moveTo(a.x, a.y).lineTo(b.x, b.y);
      }
    } else if (type === 'chasm') {
      line(parent, points, 0xb69b76, 25, .65); line(parent, points, 0x514b47, 15); line(parent, points, 0x222c2e, 7);
    } else if (type === 'valley') {
      line(parent, points, 0x718762, 70, .18); line(parent, points, 0xc8bd88, 36, .3); line(parent, points, 0xc7cf9c, 4, .5);
    } else {
      let band = [];
      const finishBand = () => {
        if (band.length > 1) {
          line(parent, band, 0x645d4f, 45, .14);
        }
        band = [];
      };
      for (const p of points) {
        if (canPlacePeak(map.geography, p, .04)) band.push(p); else finishBand();
      }
      finishBand();
      const g = new PIXI.Graphics(); parent.addChild(g);
      let remaining = 0;
      for (let i = 1; i < points.length; i++) {
        const a = point(points[i - 1]), b = point(points[i]), length = Math.hypot(b.x - a.x, b.y - a.y);
        for (; remaining < length; remaining += 27) {
          const t = remaining / length, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
          const p = worldPoint(x, y), size = 20 + Math.sin(i * .4) * 5;
          const valley = map.geography.corridors.find(c => c.type === 'mountain-valley' && projectToPath(p, c.points).distance < c.width + size / mapRect.height);
          if (valley) {
            const q = projectToPath(p, valley.points), offset = valley.width + size * 1.2 / mapRect.height + .02;
            for (const sign of [-1, 1]) {
              const flank = point({ x: q.point.x - q.tangent.y / 2.15 * offset * sign, y: q.point.y + q.tangent.x * offset * sign });
              drawMountain(g, flank.x, flank.y, size * .85, 0x595a53);
            }
          } else drawMountain(g, x, y, size, 0x595a53);
        }
        remaining -= length;
      }
    }
}
function landLayer() {
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
      worldLayer.addChild(layer, mask); layer.mask = mask; return layer;
}
function drawFeatures() {
  const priority = { valley: 0, chasm: 1, ridge: 2, river: 3 };
  for (const feature of [...map.features].sort((a, b) => priority[a.type] - priority[b.type])) {
    const points = featurePath(feature);
    if (points.length < 2) continue;
    const parent = landLayer();
    drawLandform(parent, feature.type, points);
    if (feature.type === 'river' && feature.mouth) drawMouth(parent, feature);
  }
}

function drawMouth(parent, feature) {
  const mouth = feature.mouth, end = feature.points.at(-1), t = mouth.tangent;
  const width = mouth.treatment === 'estuary' ? .024 : .009;
  const backwards = { x: end.x - t.x / 2.15 * .08, y: end.y - t.y * .08 };
  const points = [
    { x: backwards.x - t.y / 2.15 * .005, y: backwards.y + t.x * .005 },
    { x: end.x - t.y / 2.15 * width, y: end.y + t.x * width },
    { x: end.x + t.y / 2.15 * width, y: end.y - t.x * width },
    { x: backwards.x + t.y / 2.15 * .005, y: backwards.y - t.x * .005 },
  ];
  const g = new PIXI.Graphics().lineStyle(2, 0xc6c393, .65).beginFill(0x65919a, .95).drawPolygon(polygonPoints(points)).endFill();
  parent.addChild(g);
}

function drawInteractions() {
  const layer = landLayer(), g = new PIXI.Graphics(); layer.addChild(g);
  for (const interaction of map.geography.interactions) {
    if (interaction.type === 'mountain-valley') {
      line(layer, interaction.points, 0xb1b18a, 62, .24);
      line(layer, interaction.points, 0x81956f, 38, .2);
    } else if (interaction.type === 'water-gap') {
      line(layer, interaction.points, 0xaaa68b, 42, .3);
      // Short rock hachures flank the opening rather than peak symbols in it.
      for (let i = 0; i < interaction.points.length; i += 6) {
        const p = interaction.points[i], q = projectToPath(p, interaction.points);
        for (const sign of [-1, 1]) {
          const a = point({ x: p.x - q.tangent.y / 2.15 * .04 * sign, y: p.y + q.tangent.x * .04 * sign });
          const b = point({ x: p.x - q.tangent.y / 2.15 * .056 * sign, y: p.y + q.tangent.x * .056 * sign });
          g.lineStyle(2, 0x5d665b, .65).moveTo(a.x, a.y).lineTo(b.x, b.y);
        }
      }
    } else if (interaction.type === 'rocky-coast') {
      line(layer, interaction.points, 0x5a6256, 7, .65);
      for (let i = 1; i < interaction.points.length; i += 5) {
        const p = interaction.points[i], q = projectToPath(p, interaction.points), centre = point(p);
        if (map.geography.corridors.some(c => projectToPath(p, c.points).distance < c.width)) continue;
        const a = point({ x: p.x - q.tangent.y / 2.15 * .02, y: p.y + q.tangent.x * .02 });
        const b = point({ x: p.x + q.tangent.y / 2.15 * .02, y: p.y - q.tangent.x * .02 });
        g.lineStyle(1.7, 0x5a6256, .65).moveTo(a.x, a.y).lineTo(centre.x, centre.y).lineTo(b.x, b.y);
      }
    }
  }
}

function drawSurroundings() {
  if (backgroundArt?.map !== map) {
    backgroundArt?.textures.forEach(texture => texture.destroy(true));
    backgroundArt = bakeBackground();
  }
  const layer = new PIXI.Container(); layer.eventMode = 'none'; worldLayer.addChild(layer);
  const sprite = (texture, bounds) => {
    const node = new PIXI.Sprite(texture), p = point({ x: bounds.minX, y: bounds.minY });
    node.position.set(p.x, p.y); node.width = (bounds.maxX - bounds.minX) * mapRect.width; node.height = (bounds.maxY - bounds.minY) * mapRect.height;
    if (state.flipX) node.scale.x *= -1; if (state.flipY) node.scale.y *= -1;
    node.eventMode = 'none'; layer.addChild(node); return node;
  };
  sprite(backgroundArt.textures[0], map.surroundings.bounds);
  sprite(backgroundArt.textures[1], backgroundArt.detailBounds);
  const landMask = sprite(backgroundArt.textures[2], backgroundArt.detailBounds);
  const landArt = new PIXI.Container(), seaArt = new PIXI.Graphics(), g = new PIXI.Graphics();
  landArt.eventMode = 'none'; layer.addChild(seaArt, landArt); landArt.mask = landMask; landArt.addChild(g);
  const b = backgroundArt.detailBounds;
  for (let i = 0; i < 4200; i++) {
    const index = 91000 + i * 4;
    const p = { x: b.minX + decorationRandom(map.seed, index) * (b.maxX - b.minX), y: b.minY + decorationRandom(map.seed, index + 1) * (b.maxY - b.minY) };
    const field = backgroundArt.sample(p), { x, y } = point(p), size = 6 + decorationRandom(map.seed, index + 2) * 13;
    if (field[0] > .6) {
      seaArt.lineStyle(1.5, 0xacc9c2, .16).moveTo(x - size, y).quadraticCurveTo(x, y - 3, x + size, y);
    } else if (field[1] > .55) drawMountain(g, x, y, size * (1.1 + field[1] * .5), 0x4f5c53);
    else if (field[2] > .25) {
      g.lineStyle(1, 0x8c9c80, .24).beginFill(0x375a56, .25).drawEllipse(x, y, size * 1.6, size * .45).endFill();
      g.lineStyle(1.2, 0x40564b, .6).moveTo(x + size * .4, y).lineTo(x + size * .3, y - size * .7);
    } else if (field[3] > .35) {
      g.lineStyle(1.5, 0x405744, .4).moveTo(x - size, y).lineTo(x - size * .5, y - 4).lineTo(x, y)
        .moveTo(x + 5, y + 3).lineTo(x + 8, y - 3);
    } else g.lineStyle(1.3, 0x665d49, .35).moveTo(x - size, y).lineTo(x, y - 3).lineTo(x + size * .8, y + 2);
  }
  for (const continuation of map.surroundings.continuations) {
    const creek = new PIXI.Graphics(); landArt.addChild(creek);
    continuation.points.forEach((p, i, points) => {
      if (!i) return;
      const a = point(points[i - 1]), c = point(p), t = i / (points.length - 1);
      creek.lineStyle(9 * (1 - t * .85), 0x789e99, (1 - t) ** .8).moveTo(a.x, a.y).lineTo(c.x, c.y);
    });
  }
  text(root, 'BEYOND THE PLAYABLE REGIONS', 520, 165, 22, 0xc0c4aa, { fontFamily: 'Arial, sans-serif', letterSpacing: 2 });
}

function bakeBackground() {
  const bounds = map.surroundings.bounds, count = 321, data = new Float32Array(count * count * 4);
  for (let y = 0; y < count; y++) for (let x = 0; x < count; x++) {
    const field = sampleSurroundings(map.surroundings, { x: bounds.minX + x / (count - 1) * (bounds.maxX - bounds.minX),
      y: bounds.minY + y / (count - 1) * (bounds.maxY - bounds.minY) });
    data.set([field.ocean, field.highlands, field.marsh, field.scrub], (y * count + x) * 4);
  }
  const sample = (p, out = new Float32Array(4)) => {
    const x = Math.max(0, Math.min(count - 1.001, (p.x - bounds.minX) / (bounds.maxX - bounds.minX) * (count - 1)));
    const y = Math.max(0, Math.min(count - 1.001, (p.y - bounds.minY) / (bounds.maxY - bounds.minY) * (count - 1)));
    const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, a = (iy * count + ix) * 4, b = a + count * 4;
    for (let i = 0; i < 4; i++) out[i] = (data[a + i] * (1 - fx) + data[a + 4 + i] * fx) * (1 - fy)
      + (data[b + i] * (1 - fx) + data[b + 4 + i] * fx) * fy;
    return out;
  };
  const palette = [[128, 115, 85], [117, 121, 106], [77, 104, 93], [99, 119, 90]], sea = [43, 78, 89];
  const detailBounds = { minX: -1.5, maxX: 2.5, minY: -1.5, maxY: 2.5 };
  const paint = (area, size, mask = false) => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d'), pixels = ctx.createImageData(size, size);
    const p = { x: 0, y: 0 }, f = new Float32Array(4);
    const dx = (area.maxX - area.minX) / (size - 1), dy = (area.maxY - area.minY) / (size - 1);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      p.x = area.minX + x * dx; p.y = area.minY + y * dy; sample(p, f);
      const t = Math.max(0, Math.min(1, (f[0] - .47) / .06)), ocean = t * t * (3 - 2 * t), offset = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) pixels.data[offset + c] = mask ? 255
        : (palette[0][c] * (1 - f[1] - f[2] - f[3]) + palette[1][c] * f[1] + palette[2][c] * f[2] + palette[3][c] * f[3]) * (1 - ocean) + sea[c] * ocean;
      pixels.data[offset + 3] = mask ? (1 - ocean) * 255 : 255;
    }
    ctx.putImageData(pixels, 0, 0); return PIXI.Texture.from(canvas);
  };
  return { map, sample, detailBounds, textures: [paint(bounds, 512), paint(detailBounds, 1024), paint(detailBounds, 1024, true)] };
}

function drawIslands() {
  for (const cluster of map.islandClusters) {
    const g = new PIXI.Graphics(); g.eventMode = 'none'; worldLayer.addChild(g);
    for (const contour of cluster.contours) {
      const points = polygonPoints(contour);
      const lagoon = contour !== cluster.contours[0] && insidePolygon(contour[0], cluster.contours[0]);
      g.lineStyle(11, 0x456e74, .65).beginFill(lagoon ? BIOMES.islands.colour : 0x94a276).drawPolygon(points).endFill();
      g.lineStyle(5, 0xe1cf95, .95).drawPolygon(points);
      g.lineStyle(1.5, 0x717f56, .7).drawPolygon(points);
    }
    for (const core of cluster.cores) {
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
  if (pixelReview()) drawPixelMap();
  else {
  drawSurroundings();
  for (const region of map.regions) {
    const shape = new PIXI.Graphics(); worldLayer.addChild(shape);
    const points = polygonPoints(region.outline);
    shape.beginFill(BIOMES[region.biome].colour).drawPolygon(points).endFill();
    {
      const art = new PIXI.Container(), mask = new PIXI.Graphics().beginFill(0xffffff).drawPolygon(points).endFill();
      worldLayer.addChild(art, mask); art.mask = mask; drawBiome(region, art);
    }
    shape.eventMode = 'none'; shape.hitArea = new PIXI.Polygon(points);
    shape.mapRegionId = region.id;
    const c = point(region.centre); targets.push({ label: region.id, x: c.x - 12, y: c.y - 12, width: 24, height: 24, map: true });
  }
  drawIslands();
  drawInteractions();
  for (const edge of map.edges) {
    const sameBiome = edge.regions.length === 2 && map.regions.find(r => r.id === edge.regions[0]).biome === map.regions.find(r => r.id === edge.regions[1]).biome;
    const boundary = edge.regions.length === 1;
    const outside = boundary ? map.surroundings.patches.find(p => p.edgeId === edge.id) : null;
    const seaBoundary = outside?.kind === 'ocean', islandWater = seaBoundary && map.regions.find(r => r.id === edge.regions[0]).biome === 'islands';
    line(worldLayer, edge.points, boundary ? islandWater ? 0x7fa5a4 : seaBoundary ? 0xdace9b : 0xb2ad88 : 0x31493f,
      boundary ? islandWater ? 1.5 : 4 : 1.8, boundary ? islandWater ? .4 : .8 : sameBiome ? .24 : .55);
  }
  drawFeatures();
  const selected = map.regions.find(r => r.id === state.selected);
  if (selected) {
    const g = new PIXI.Graphics().lineStyle(6, 0xf9edb4).beginFill(0xfff3b1, .1)
      .drawPolygon(polygonPoints(selected.outline)).endFill(); worldLayer.addChild(g);
  }
  for (const region of map.regions) {
    const p = point(region.centre);
    const g = new PIXI.Graphics().lineStyle(2, 0xefd9a6, .8).beginFill(0x263d38, .9).drawCircle(p.x, p.y, 8).endFill(); worldLayer.addChild(g);
    if (selected?.id === region.id) {
      const label = text(worldLayer, region.id.slice(1), p.x, p.y, 26, 0xffedbf, { fontFamily: 'Arial, sans-serif' }); label.anchor.set(.5);
    }
  }
  }
  const selected = map.regions.find(r => r.id === state.selected);
  const oceanSides = map.world.oceanSides.map(side => state.flipX && (side === 'east' || side === 'west') ? side === 'east' ? 'west' : 'east' : side)
    .map(side => state.flipY && (side === 'north' || side === 'south') ? side === 'north' ? 'south' : 'north' : side);
  text(root, `Ocean: ${oceanSides.join(' + ')} · ${pixelReview() ? 'water follows timegraph · drag / pinch to explore' : 'drag / pinch / scroll to explore'}`, 520, 198, 25, 0xd9d6b6);
  if (pixelReview()) {
    button('Change pixel density', 1648, 158, 164, 70, () => { state.texel = { 2: 4, 4: 6, 6: 2 }[state.texel]; render(); }, { copy: state.texel === 2 ? 'Pixels: Detail' : state.texel === 4 ? 'Pixels: Fine' : 'Pixels: Coarse', size: 23 });
    button('Cycle map sites', 1826, 158, 212, 70, () => {
      if (!state.sites) { state.sites = true; state.siteArt = 'atlas'; }
      else if (state.siteArt === 'atlas') state.siteArt = 'live';
      else if (state.siteArt === 'live') state.siteArt = 'sketch';
      else state.sites = false;
      render();
    }, { copy: !state.sites ? 'Sites: Off' : state.siteArt === 'atlas' ? 'Sites: Map art' : state.siteArt === 'live' ? 'Sites: Old game' : 'Sites: Sketch', size: 23 });
  }
  button('Zoom out', 2052, 158, 90, 70, () => { camera.zoomBy(.8); app.renderer.render(app.stage); }, { copy: '−', size: 38 });
  button('Zoom in', 2156, 158, 90, 70, () => { camera.zoomBy(1.25); app.renderer.render(app.stage); }, { copy: '+', size: 38 });
  button('Fit map', 2260, 158, 110, 70, fitMap, { copy: 'Fit' });
  if(selected) {
    const caption = `${selected.id} · ${BIOMES[selected.biome].name} · ${(selected.area / map.totalArea * 100).toFixed(1)}% of playable area · Neighbours ${selected.neighbours.join(', ')}`;
    panel(root, 514, 658, 1856, 32, 0x21383b, 0x21383b); text(root, caption, 534, 661, 22, 0xe2ddbd);
  }
}

function drawPixelMap() {
  if (backgroundArt?.map !== map) {
    backgroundArt?.textures.forEach(texture => texture.destroy(true)); backgroundArt = bakeBackground();
  }
  if (pixelArtMap !== map) {
    for (const art of pixelArtCache.values()) { destroyPixelTerrain(art); }
    pixelArtCache.clear(); pixelArtMap = map;
  }
  const terrainAt = texel => {
    const key = `${texel}:${state.sites}:${state.actorScale}:${state.islandStyle}`;
    if (!pixelArtCache.has(key)) pixelArtCache.set(key, bakePixelTerrain(map, { texel, sites: state.sites, settlementScale: state.actorScale, islandStyle: state.islandStyle, sampleBackground: backgroundArt.sample }));
    if (pixelArtCache.size > 4) {
      const oldest = pixelArtCache.keys().next().value, art = pixelArtCache.get(oldest);
      destroyPixelTerrain(art); pixelArtCache.delete(oldest);
    }
    return pixelArtCache.get(key);
  };
  // One canonical world: density changes only sample its colour pyramid.
  currentPixelArt = terrainAt(2);
  liveSites = state.sites && state.siteArt !== 'sketch' ? sampleLiveSites() : [];
  terrainLayer = new PIXI.Container(); terrainLayer.eventMode = 'none'; worldLayer.addChild(terrainLayer);
  drawTerrainLayer(currentPixelArt, terrainLayer);
  overviewInk = new PIXI.Graphics(); overviewInk.eventMode = 'none'; worldLayer.addChild(overviewInk);
  if (liveSites.length) {
    if (state.siteArt === 'atlas') drawAtlasSites(); else drawLiveSites();
  }
  currentPixelArt.stats.liveSites = liveSites.map(({ kind, regionId }) => ({ kind, regionId }));
  const selected = map.regions.find(r => r.id === state.selected);
  for (const region of map.regions) {
    const c = point(region.centre); targets.push({ label: region.id, x: c.x - 12, y: c.y - 12, width: 24, height: 24, map: true });
  }
  if (selected) {
    const g = new PIXI.Graphics().lineStyle(4, 0xf5df98, .9).drawPolygon(polygonPoints(selected.outline)); worldLayer.addChild(g);
    const p = point(selected.centre), label = text(worldLayer, selected.id, p.x, p.y - 34, 25, 0xffedc2, { stroke: 0x203c35, strokeThickness: 5 }); label.anchor.set(.5);
  }
  text(root, 'ILLUSTRATED TERRAIN STUDY · DARK FANTASY ATLAS', 520, 165, 22, 0xc0c4aa, { fontFamily: 'Arial, sans-serif', letterSpacing: 2 });
}

function zoomArt(texture,levels=null) {
  const node = createZoomArt(texture,levels); zoomNodes.push(node); return node;
}

function drawTerrainLayer(art, parent) {
  const density = art.stats.texel;
  const put = (texture, bounds, texel = density,levels=null,name=null) => {
    const node = zoomArt(texture,levels), p = point({ x: bounds.minX, y: bounds.minY });
    node.position.set(p.x, p.y); node.scale.set(state.flipX ? -texel : texel, state.flipY ? -texel : texel);
    node.name=name;parent.addChild(node);
  };
  updateEnvironment(true);
  if (art.backdropTexture) put(art.backdropWaterCycle.levels[0], art.backdropBounds, 8,art.backdropWaterCycle.levels);
  put(art.waterCycle.levels[0], art.bounds,density,art.waterCycle.levels);
  put(art.roadTexture, art.borderBounds);
  const textures = pixelSpriteTextures(density), reliefTextures = reliefSpriteTextures(art, state.flipX, state.flipY);
  const origin = point({ x: art.bounds.minX, y: art.bounds.minY });
  // Reposition reflected props while keeping their silhouettes and light upright.
  const props = art.props.filter(prop => pixelSpriteFits(art, prop, state.flipX, state.flipY))
    .sort((a, b) => point(a.point).y - point(b.point).y);
  art.stats.displayedProps = props.length;
  art.stats.monsterVisibility={planned:art.props.filter(p=>p.monster).length,displayed:props.filter(p=>p.monster).length,
    landscape:props.filter(p=>p.family==='terrain-hellscape').length,
    regions:art.stats.terrainComposition.monsterZones.map(z=>({regionId:z.regionId,
      planned:z.pieces.length,displayed:props.filter(p=>p.monster&&p.regionId===z.regionId).length}))};
  const drawProp = prop => {
    const node = zoomArt(reliefTextures.get(prop) ?? textures[prop.kind]), p = point(prop.point);
    node.scale.set(density);
    node.position.set(origin.x + Math.round((p.x - node.width / 2 - origin.x) / density) * density,
      origin.y + Math.round((p.y - node.height - origin.y) / density) * density);
    // Terrain compositions keep their geographic centre when reflected. A
    // bottom anchor would shift every upright painting by its full height.
    if (state.flipY && prop.composed) node.position.y += node.height * 2 * (prop.anchorHeight ?? .5);
    node.alpha = prop.background ? .9 : 1; parent.addChild(node);
  };
  const landscape = props.filter(prop => !prop.kind.startsWith('ruin') && !(state.siteArt === 'live' && !prop.monster && liveSites.filter(s => s.kind === 'monster').some(site => {
    const a = point(prop.point), b = point(site.point);
    return Math.abs(a.x - b.x) < 66 * state.actorScale && a.y > b.y - (site.kind === 'monster' ? 104 : 68) * state.actorScale && a.y < b.y + 14 * state.actorScale;
  })));
  const buildings = state.siteArt === 'atlas' ? liveSites.flatMap(s => (s.plan?.buildings ?? []).map(building => ({ building, point: building.point }))) : [];
  // Buildings and terrain share the same depth order. Foreground vegetation
  // can overlap roof edges; settlement art is not an always-on-top plate.
  [...landscape, ...buildings].sort((a, b) => point(a.point).y - point(b.point).y).forEach(prop => {
    if (!prop.building) { drawProp(prop); return; }
    const b = prop.building, texture = landmarkArt.biomes[b.biome][b.role], p = point(b.point);
    const node = zoomArt(texture), worldWidth = b.w * density;
    node.scale.set(worldWidth / texture.width);
    node.position.set(p.x - worldWidth / 2, p.y - node.height + b.h * density * .25);
    // Match the terrain's native texel size, including at close zoom.
    node.terrainBuilding = true; parent.addChild(node);
  });
  // Geographic borders belong to the terrain, so clouds can obscure them.
  // Interactive selection outlines and labels remain in the world overlay.
  put(art.borderTexture, art.borderBounds,density,null,'region-borders');
  art.stats.fogEnabled = state.fog;
  if(art.atmosphere) {
    const node=new PIXI.Sprite(art.atmosphere.texture),p=point({x:art.bounds.minX,y:art.bounds.minY});
    node.name='atmosphere';node.eventMode='none';node.position.set(p.x,p.y);
    node.scale.set((state.flipX?-1:1)*art.stats.width*density/node.texture.width,
      (state.flipY?-1:1)*art.stats.height*density/node.texture.height);
    parent.addChild(node);
  }

  if (!liveSites.length) props.filter(prop => prop.kind.startsWith('ruin')).forEach(drawProp);
}

// Illustrative fixtures only. Road endpoints remain the baked sample towns.
function sampleLiveSites() {
  const towns = currentPixelArt.settlementPlans;
  const result = towns.map(plan => ({ kind: plan.kind, point: plan.point, regionId: plan.regionId, plan }));
  if(state.siteArt==='atlas') return result.concat(currentPixelArt.stats.terrainComposition.monsterZones.map(zone=>({
    kind:'monster',point:zone.point,regionId:zone.regionId,zone
  })));
  const candidates = map.regions.filter(region => region.biome === 'monster'
    && !towns.some(town => town.regionId === region.id));
  for (const region of candidates.filter(r => r.biome === 'swamp' || r.biome === 'mountains').concat(candidates)) {
    if (result.filter(site => site.kind === 'monster').length >= 2) break;
    if (result.some(site => site.regionId === region.id)) continue;
    const p = region.centre, scale = state.actorScale;
    // Choose fixtures in the original map orientation so flips preserve identity.
    const fits = [-1, 0, 1].every(x => [-1, 0, 1].every(y => insidePolygon({
      x: p.x + x * 54 * scale / mapRect.width,
      y: p.y + (y === -1 ? -89 : y === 0 ? -36 : 18) * scale / mapRect.height,
    }, region.outline)));
    const roads = currentPixelArt.roadClearance;
    const cx = (p.x - currentPixelArt.bounds.minX) * mapRect.width / currentPixelArt.stats.texel;
    const cy = (p.y - currentPixelArt.bounds.minY) * mapRect.height / currentPixelArt.stats.texel;
    if (currentPixelArt.waterIndices[Math.floor(cy) * currentPixelArt.stats.width + Math.floor(cx)]) continue;
    let coversRoad = false;
    for (let y = Math.floor(cy - 89 * scale / currentPixelArt.stats.texel); y <= cy + 18 * scale / currentPixelArt.stats.texel && !coversRoad; y++) {
      for (let x = Math.floor(cx - 54 * scale / currentPixelArt.stats.texel); x <= cx + 54 * scale / currentPixelArt.stats.texel; x++) {
        if (x >= roads.x && y >= roads.y && x < roads.x + roads.width && y < roads.y + roads.height
          && roads.data[(y - roads.y) * roads.width + x - roads.x]) { coversRoad = true; break; }
      }
    }
    if (!fits || coversRoad || result.some(site => Math.hypot((site.point.x - p.x) * mapRect.width, (site.point.y - p.y) * mapRect.height) < 155 * scale)) continue;
    result.push({ kind: 'monster', point: p, regionId: region.id });
  }
  return result;
}

function drawLiveSites() {
  if (!gameArt) { prepareLiveGameArt().then(render); return; }
  for (const site of [...liveSites].sort((a, b) => point(a.point).y - point(b.point).y)) {
    const p = point(site.point), scale = state.actorScale;
    const group = new PIXI.Container(); group.position.set(p.x, p.y); group.scale.set(scale);
    group.eventMode = 'none'; group.label = `live-${site.kind}-${site.regionId}`;
    const shadow = new PIXI.Graphics().beginFill(0x171b18, .35).drawEllipse(0, -5, site.kind === 'player' ? 29 : 45, 12).endFill();
    group.addChild(shadow);
    if (site.kind === 'monster') {
      const ground = new PIXI.Sprite(gameArt.ground); ground.anchor.set(.5); ground.position.set(0, -10); ground.width = 112; ground.height = 62; ground.alpha = .65;
      const mask = new PIXI.Graphics().beginFill(0xffffff).drawEllipse(0, -10, 56, 31).endFill();
      group.addChild(ground, mask); ground.mask = mask;
    }
    const sprite = new PIXI.Sprite(gameArt[site.kind]); sprite.anchor.set(.5, 0);
    const rect = site.kind === 'player' ? { width: 58, height: 66, top: -76 }
      : site.kind === 'neutral' ? { width: 94, height: 94, top: -79 } : { width: 106, height: 106, top: -89 };
    const fit = Math.min(rect.width / sprite.texture.width, rect.height / sprite.texture.height);
    sprite.scale.set(fit); sprite.position.set(0, rect.top + (rect.height - sprite.height) / 2); group.addChild(sprite);
    const colour = site.kind === 'player' ? 0xe4c271 : site.kind === 'neutral' ? 0x8ed7cf : 0xff886e;
    const label = text(group, site.kind === 'player' ? 'SETTLEMENT' : site.kind === 'neutral' ? 'MARKET' : 'MONSTER', 0, 26, 17, colour,
      { fontFamily: 'Arial, sans-serif', stroke: 0x131b1b, strokeThickness: 4 }); label.anchor.set(.5, 0); label.visible = state.siteLabels;
    worldLayer.addChild(group);
  }
}

function drawAtlasSites() {
  for (const site of [...liveSites].sort((a, b) => point(a.point).y - point(b.point).y)) {
    const p = point(site.point), group = new PIXI.Container(), width = 116 * state.actorScale;
    group.position.set(p.x, p.y); group.eventMode = 'none'; group.label = `atlas-${site.kind}-${site.regionId}`;
    const colour = site.kind === 'player' ? 0xe4c271 : site.kind === 'neutral' ? 0x8ed7cf : 0xe08b76;
    const biome = map.regions.find(r => r.id === site.regionId)?.biome ?? 'plains';
    if(site.zone) {
      const ground=new PIXI.Container();group.addChild(ground);
      const label=text(group,'MONSTER REGION',0,20,18,colour,{fontFamily:'Arial, sans-serif',stroke:0x131b1b,strokeThickness:4});
      label.anchor.set(.5,0);label.visible=state.siteLabels;
      landmarkNodes.push({site,meshes:[],label,ground,width:70*state.actorScale,biome,outskirts:0,biomeArt:true});
      worldLayer.addChild(group);continue;
    }
    if (site.plan) {
      const ground = new PIXI.Container();
      const label = text(group, site.kind === 'player' ? 'SETTLEMENT' : 'MARKET', 0, site.plan.ry * 2 + 10, 18, colour,
        { fontFamily: 'Arial, sans-serif', stroke: 0x131b1b, strokeThickness: 4 }); label.anchor.set(.5, 0); label.visible = state.siteLabels;
      group.addChild(ground);
      landmarkNodes.push({ site, meshes: [], label, ground, width, biome, outskirts: 0, buildings: site.plan.buildings.length, biomeArt: true });
      worldLayer.addChild(group); continue;
    }
    const dry = (x, y) => {
      const q = { x: site.point.x + (state.flipX ? -x : x) / mapRect.width, y: site.point.y + (state.flipY ? -y : y) / mapRect.height };
      const px = Math.floor((q.x - currentPixelArt.bounds.minX) * mapRect.width / 2), py = Math.floor((q.y - currentPixelArt.bounds.minY) * mapRect.height / 2);
      if (px < 0 || py < 0 || px >= currentPixelArt.stats.width || py >= currentPixelArt.stats.height) return false;
      return !currentPixelArt.waterIndices[py * currentPixelArt.stats.width + px] && insidePolygon(q, map.regions.find(r => r.id === site.regionId).outline);
    };
    const roads = currentPixelArt.roadPaths.flat().map(q => { const a = point(q); return [a.x - p.x, a.y - p.y]; });

    const ground = settlementGround(site, biome, map.seed, state.actorScale, dry, roads, false); group.addChild(ground);
    const outskirts = 0;
    const textures = landmarkArt[site.kind];
    // All versions share one lower-centre ground anchor and world footprint.
    const meshes = textures.map((texture, index) => {
      const node = zoomArt(texture), fit = Math.min(width / texture.width, 98 * state.actorScale / texture.height);
      node.scale.set(fit);
      if (index === 1) {
        const source = textures[0], scale = Math.min(width / source.width, 98 * state.actorScale / source.height);
        node.scale.set(source.width * scale / texture.width, source.height * scale / texture.height);
      }
      node.position.set(-node.width / 2, 8 - node.height); group.addChild(node); return node;
    });
    const label = text(group, site.kind === 'player' ? 'SETTLEMENT' : site.kind === 'neutral' ? 'MARKET' : 'MONSTER', 0, 22, 18, colour,
      { fontFamily: 'Arial, sans-serif', stroke: 0x131b1b, strokeThickness: 4 }); label.anchor.set(.5, 0); label.visible = state.siteLabels;
    landmarkNodes.push({ site, meshes, label, ground, width, textures, biome, outskirts, biomeArt: false }); worldLayer.addChild(group);
  }
}

function updateZoomPresentation() {
  if (!pixelReview() || !currentPixelArt) return;
  const rect = app.view.getBoundingClientRect();
  const cssScale = Math.min(rect.width / W, rect.height / H);
  const screenScale = Math.max(.001, cssScale * camera.snapshot().zoom);
  const physicalScale = camera.snapshot().zoom * app.renderer.resolution;
  const near = smoothRange(.40, .68, screenScale);
  const terrainLodFloor = Math.log2(state.texel / 2) * (1 - near);
  const tiers = { close: 0, regional: 0, overview: 0 };
  for (const item of landmarkNodes) {
    const projected = item.width * screenScale;
    let close = smoothRange(54, 68, projected), overview = 1 - smoothRange(14, 22, projected);
    if (state.detailMode !== 'auto') { close = state.detailMode === 'close' ? 1 : 0; overview = state.detailMode === 'overview' ? 1 : 0; }
    const weights = [close, (1 - close) * (1 - overview), overview];
    item.meshes.forEach((node, i) => {
      node.alpha = item.biomeArt ? (i === 0 ? 1 : 0) : weights[i]; node.visible = node.alpha > .001;
      if (i === 2 && !item.biomeArt) {
        const screenWidth = Math.max(18, Math.min(24, projected * .65));
        const width = screenWidth / screenScale;
        node.scale.set(width / item.textures[2].width);
        node.position.set(-width / 2, 8 - node.height);
      }
    });
    const dominant = weights.indexOf(Math.max(...weights)); tiers[['close', 'regional', 'overview'][dominant]]++;
    item.ground.alpha = item.biomeArt ? 1 : 1 - overview; item.label.alpha = smoothRange(30, 42, projected); item.label.visible = state.siteLabels;
    item.label.scale.set(Math.max(8 / (18 * screenScale), Math.min(1, 14 / (18 * screenScale))));
  }
  const pose = camera.snapshot(); let visibleMeshes = 0;
  for (const node of zoomNodes) {
    let x = node.x, y = node.y;
    for (let parent = node.parent; parent && parent !== worldLayer; parent = parent.parent) { x += parent.x; y += parent.y; }
    const x2 = x + node.sourceWidth * node.scale.x, y2 = y + node.sourceHeight * node.scale.y;
    node.renderable = Math.max(x, x2) * pose.zoom + pose.x >= viewRect.x && Math.min(x, x2) * pose.zoom + pose.x <= viewRect.x + viewRect.width
      && Math.max(y, y2) * pose.zoom + pose.y >= viewRect.y && Math.min(y, y2) * pose.zoom + pose.y <= viewRect.y + viewRect.height;
    if (node.renderable && node.visible) visibleMeshes++;
    node.sampleZoom(physicalScale, state.smoothZoom, node.parent === terrainLayer ? terrainLodFloor : 0);
  }
  // Important connections retain a small readable stroke at overview scale.
  overviewInk?.clear();
  if (overviewInk) {
    overviewInk.alpha = state.detailMode === 'overview' ? .8 : 1 - smoothRange(.24, .43, screenScale);
    const trace = (points, width, colour, alpha) => {
      overviewInk.lineStyle(width / screenScale, colour, alpha);
      points.forEach((p, i) => { const q = point(p); if (i) overviewInk.lineTo(q.x, q.y); else overviewInk.moveTo(q.x, q.y); });
    };
    for (const edge of map.edges.filter(e => e.regions.length === 2)) trace(edge.points, .6, 0x332f28, .38);
    for (const river of map.features.filter(f => f.type === 'river')) trace(river.points, .85, 0x91b6b3, .8);
    for (const path of currentPixelArt.roadPaths) { trace(path, 1.8, 0x3e342a, .7); trace(path, .9, 0xd7be8c, .9); }
  }
  Object.assign(currentPixelArt.stats, { landmarkLod: tiers, zoomFiltering: state.smoothZoom ? 'Prefiltered colour levels + sharp pixel enlargement' : 'Nearest pixel enlargement',
    settlementArt: landmarkNodes.filter(n => n.biomeArt && n.site.plan).map(n => ({ biome: n.biome, kind: n.site.kind, regionId: n.site.regionId, point: n.site.point, buildings: n.buildings, streets: n.site.plan.streets.length, width: n.width })),
    detailMode: state.detailMode, closeTerrainWeight: +near.toFixed(3), screenZoom: +screenScale.toFixed(3), zoomMeshes: zoomNodes.length, visibleMeshes, ...zoomArtStats() });
}

function render() {
  wheelZoom.cancel();
  timegraph?.cancelScrub();timegraph=null;
  for (const node of root.removeChildren()) node.destroy({ children: true }); targets = [];
  for (const node of worldLayer.removeChildren()) node.destroy({ children: true });
  zoomNodes = []; landmarkNodes = []; terrainLayer = null; overviewInk = null;
  text(root, 'THE SHAPING OF A WORLD', 38, 30, 48, 0xe8dfbf, { letterSpacing: 3 });
  text(root, `MAP v${MAP_VERSION}   /   20 regions · six biomes · no gameplay attached`, 42, 94, 25, 0xacc1b2, { fontFamily: 'Arial, sans-serif', letterSpacing: 1.5 });
  if (pixelReview()) button('Cycle live asset scale', 1065, 40, 350, 52, () => {
    state.actorScale = state.actorScale < 1 ? 1 : state.actorScale < 1.25 ? 1.25 : .75; render();
  }, { copy: `Landmarks: ${Math.round(state.actorScale * 100)}%`, size: 24 });
  button('Show approved base structure', 1450, 40, 306, 52, () => { state.variant = 'C'; render(); }, { copy: 'Base structure', active: !pixelReview(), size: 24 });
  button('Show atlas rendering', 1776, 40, 270, 52, () => { state.variant = 'F'; render(); }, { copy: 'Atlas rendering', active: pixelReview(), size: 24 });
  drawControls(); drawMap();
  timegraph=createMapTimegraph({root,app,timeline,palette:currentPixelArt?.waterPalette,seed:map.seed,text,panel,button,targets,onChange:timelineChanged});
  button('Toggle location labels', 1400, 158, 230, 70, () => { state.siteLabels = !state.siteLabels; render(); }, { copy: state.siteLabels ? 'Labels: On' : 'Labels: Off', active: state.siteLabels, size: 24 });
  Object.entries(BIOMES).forEach(([id, biome], i) => {
    const x = 518 + i * 310, y = 928;
    const g = new PIXI.Graphics().beginFill(pixelReview() ? ATLAS_COLOURS[id] : biome.colour).drawCircle(x + 12, y + 17, 12).endFill(); root.addChild(g);
    text(root, `${biome.name}  ${map.quota[id]}`, x + 37, y, 29);
    text(root, `${(map.biomeAreas[id] * 100).toFixed(1)}% of playable area`, x + 37, y + 43, 21, 0xaec1b4, { fontFamily: 'Arial, sans-serif' });
  });
  panel(root, 1004, 1003, 784, 62, 0x182e32, 0x778675);
  button('Previous map view', 1012, 1008, 100, 52, () => cycle(-1), { copy: '←', size: 35 });
  if (pixelReview()) {
    button('Toggle smooth pixel filtering', 1128, 1008, 256, 52, () => { state.smoothZoom = !state.smoothZoom; render(); }, { copy: state.smoothZoom ? 'Pixels: Smooth zoom' : 'Pixels: Nearest', active: state.smoothZoom, size: 23 });
    button('Cycle map detail level', 1400, 1008, 272, 52, () => {
      const modes = ['auto', 'close', 'regional', 'overview']; state.detailMode = modes[(modes.indexOf(state.detailMode) + 1) % modes.length]; render();
    }, { copy: `Detail: ${state.detailMode}`, size: 23 });
  } else { const label = text(root, VARIANTS[state.variant], 1470, 1035, 29); label.anchor.set(.5); }
  button('Next map view', 1688, 1008, 92, 52, () => cycle(1), { copy: '→', size: 35 });
  text(root, `${map.matchingBorders}/${map.sharedBorders} borders share a biome · ${map.clusteringStudy.groups} groups`, 520, 1022, 24, 0xa9bdaf, { fontFamily: 'Arial, sans-serif' });
  if (state.variant === 'F') {
    for(const [i,[key,label]] of [['fog','Fog'],['clouds','Clouds'],['wisps','Wisps'],['shadows','Shadows']].entries())
      button(`Toggle ${label.toLowerCase()}`,1798+i*146,1008,138,52,()=>{state[key]=!state[key];render();},
        {copy:`${label}: ${state[key]?'On':'Off'}`,active:state[key],size:21});
  }
  else text(root, 'DISPOSABLE PROTOTYPE', 2010, 1023, 24, 0xa9bdaf, { fontFamily: 'Arial, sans-serif' });
  updateZoomPresentation(); app.renderer.render(app.stage);
  scheduleEnvironment();
  sync();
}

function sync() {
  const url = new URL(location.href);
  for (const [key, value] of Object.entries({ seed: state.seed, clustering: state.clustering, size: state.sizeVariation,
    islandStyle: state.islandStyle, roughness: state.roughness, features: state.featureSet, variant: state.variant, texel: state.texel, sites: state.sites ? 1 : 0, siteArt: state.siteArt, siteLabels: state.siteLabels ? 1 : 0, actorScale: state.actorScale, smoothZoom: state.smoothZoom ? 1 : 0, waterMotion:state.waterMotion?1:0, detailMode: state.detailMode, fog: state.fog ? 1 : 0, clouds: state.clouds ? 1 : 0, wisps: state.wisps ? 1 : 0, shadows: state.shadows ? 1 : 0, flipX: state.flipX ? 1 : 0, flipY: state.flipY ? 1 : 0 })) url.searchParams.set(key, value);
  history.replaceState(null, '', url);
  document.title = `Map v${MAP_VERSION} · Pixi workbench`;
  document.getElementById('status').textContent = `Map v${MAP_VERSION} · Seed ${state.seed} · ${VARIANTS[state.variant]} · 20 regions · quota counts ${Object.values(map.quota).join(' / ')} · ${map.features.map(f => FEATURE_NAMES[f.type]).join(' + ')}`;
  document.getElementById('state').textContent = JSON.stringify({ controls: state, quota: map.quota,
    biomeAreaPercent: Object.fromEntries(Object.entries(map.biomeAreas).map(([id, area]) => [id, +(area * 100).toFixed(1)])),
    features: map.features.map(f => ({ type: f.type, sharedEdges: f.edgeIds.length })),
    geographicInteractions: map.geography.interactions.reduce((counts, i) => ({ ...counts, [i.type]: (counts[i.type] ?? 0) + 1 }), {}),
    islandClusters: map.islandClusters.map(c => ({ regions: c.regionIds, landContours: c.contours.length })),
    surroundings: ['ocean', 'badlands', 'scrub', 'marsh', 'highlands'],
    world: map.world,
    pixelRendering: pixelReview() ? currentPixelArt.stats : null,
    assumptions: 'Ocean occupies one world side or two adjacent sides, assigned as continuous outer-boundary arcs. Headlands can face ocean on one side and hinterland on the other. Twenty connected cells form an irregular footprint without global stretching or enclosed gaps. Border variation adds bounded fine detail. Uninhabitable terrain blends continuously. Geographic interactions produce water gaps, mountain valleys, narrow headwaters, estuaries and rocky coasts. River corridors clear both range and biome peaks; coastal courses sit inland. Landform ink is clipped to actual land. These are decorative interpretations, not a hydrology simulation. No live game or persistence.' }, null, 2);
}
function exportPng() {
  const a = document.createElement('a'); a.download = `map-study-${state.seed}-${state.variant}.png`; a.href = pngData(); a.click();
}
function pngData() {
  // Export the full design frame, independent of the phone's display resolution.
  app.renderer.resolution = 1; app.renderer.resize(W, H); updateZoomPresentation(); app.renderer.render(app.stage);
  const png = app.view.toDataURL('image/png'); fitCanvas(); return png;
}
function fitCanvas() {
  const scale = Math.min(host.clientWidth / W, host.clientHeight / H);
  // Draw at the displayed physical size rather than letting CSS blur a large
  // backing canvas. Scene geometry and pointer coordinates stay in design units.
  const resolution = scale * Math.min(devicePixelRatio || 1, 2);
  if (Math.abs(app.renderer.resolution - resolution) > .0001) {
    app.renderer.resolution = resolution; app.renderer.resize(W, H);
  }
  // Size the canvas box itself, so Pixi pointer coordinates match letterboxing.
  app.view.style.setProperty('width', `${W * scale}px`, 'important');
  app.view.style.setProperty('height', `${H * scale}px`, 'important');
  updateZoomPresentation(); app.renderer.render(app.stage);
}
attachDevPreviewDisplay(host, { onChange: fitCanvas });
new ResizeObserver(fitCanvas).observe(host);
window.addEventListener('resize', fitCanvas);
fitCanvas();
document.addEventListener('keydown', event => {
  if (event.target.closest('input, textarea, select, [contenteditable]')) return;
  if(!['ArrowLeft','ArrowRight','Home','End',' ','n','N'].includes(event.key))return;
  event.preventDefault();
  const s=timeline.snapshot;
  if(event.key===' ')timeline.play(!s.playing);
  else if(event.key==='n'||event.key==='N')timeline.returnToNow();
  else if(event.key==='Home')timeline.seek(s.minSec);
  else if(event.key==='End')timeline.seek(s.revealCapSec);
  else timeline.seek(s.displaySec+(event.key==='ArrowLeft'?-1:1)*(event.shiftKey?10:1));
  timelineChanged();
});
window.mapWorkbench = { version: MAP_VERSION, get state() { return { ...state }; }, get map() { return map; }, get targets() { return targets.map(t => {
  if (t.map) { const pose = camera.snapshot(); t = { ...t, x: t.x * pose.zoom + pose.x, y: t.y * pose.zoom + pose.y,
    width: t.width * pose.zoom, height: t.height * pose.zoom }; }
  const r = app.view.getBoundingClientRect();
  if (rotated()) return { ...t, x: r.right - (t.y + t.height) / H * r.width, y: r.top + t.x / W * r.height,
    width: t.height / H * r.width, height: t.width / W * r.height };
  const scale = Math.min(r.width / W, r.height / H);
  return { ...t, x: r.x + (r.width - W * scale) / 2 + t.x * scale, y: r.y + (r.height - H * scale) / 2 + t.y * scale,
    width: t.width * scale, height: t.height * scale };
}) }, get camera() { return camera.snapshot(); }, scene: { width: W, height: H, renderer: 'Pixi', regionCount: 20, viewRect },
  get pixelRendering() { return pixelReview() ? currentPixelArt.stats : null; },
  get timeline(){return timeline.snapshot;},
  seekTime(seconds){timeline.seek(seconds);timelineChanged();},
  setPlayback({playing,rate,now=false,spanYears}={}){
    if(spanYears!==undefined)timeline.setSpanYears(spanYears);
    if(now)timeline.returnToNow();if(rate!==undefined)timeline.setRate(rate);
    if(playing!==undefined)timeline.play(playing);timelineChanged();
  },
  // Read-only inspection of the actual baked planes for palette-phase review.
  // Callers must not mutate these buffers or advance simulation time.
  get atmosphere() { return currentPixelArt?.atmosphere ?? null; },
  get waterFields() { return pixelReview() ? { width:currentPixelArt.stats.width,height:currentPixelArt.stats.height,
    bounds:currentPixelArt.bounds,texel:currentPixelArt.stats.texel,indices:currentPixelArt.waterIndices,
    base:currentPixelArt.waterBase,strength:currentPixelArt.waterStrength,overlays:currentPixelArt.waterOverlays,bodies:currentPixelArt.waterBodies,palette:currentPixelArt.waterPalette } : null; },
  setCamera(pose) { wheelZoom.cancel(); camera.restore(pose); updateZoomPresentation(); app.renderer.render(app.stage); },
  setState(patch) { Object.assign(state, patch); if('waterMotion' in patch)timeline.play(state.waterMotion); if (!VARIANTS[state.variant]) state.variant = 'F'; if (Object.keys(patch).some(k => ['seed', 'clustering', 'sizeVariation', 'roughness', 'featureSet'].includes(k))) regenerate(); else render(); }, exportPng: pngData };
let liveArtLoading = null;
function prepareLiveGameArt() {
  liveArtLoading ??= Promise.all([PIXI.Assets.load('images/sprite-sheets/chronicle-illustrations.json'),
    PIXI.Assets.load('images/sprite-sheets/region-landmarks.json')]).then(([chronicle, landmarks]) => {
    gameArt = { player: chronicle.textures['hamlet-0.png'], neutral: landmarks.textures['neutral-market-town.png'],
      monster: landmarks.textures['monster-lair.png'], ground: landmarks.textures['monster-ground.png'] };
    for (const texture of Object.values(gameArt)) {
      texture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
      texture.baseTexture.mipmap = PIXI.MIPMAP_MODES.OFF;
    }
  });
  return liveArtLoading;
}
Promise.all([prepareIllustratedArt(), state.siteArt === 'live' ? prepareLiveGameArt() : Promise.resolve(),
  prepareLandmarkLods(), prepareCloudArt()]).then(([, , lods]) => {
  landmarkArt = lods;
  fitMap(); render(); document.body.dataset.ready = 'true';
}).catch(error => {
  document.body.dataset.ready = 'error'; console.error('Illustrated terrain failed to load', error);
});
