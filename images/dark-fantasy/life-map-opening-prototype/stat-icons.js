import { addResourceIcon } from '../../../src/views/resource-cost-pixi.js';
import { getArtRevision } from '../../../src/views/chronicle-art.js';

// The game's resource icons as small DOM images for the workbench panels.
// One shared renderer; images repaint when late atlas pages arrive.
let renderer = null;
const cache = new Map(), painted = new Set();
function draw(id) {
  renderer ??= new PIXI.Renderer({ width: 48, height: 48, resolution: 2, backgroundAlpha: 0, antialias: true, preserveDrawingBuffer: true });
  const root = new PIXI.Container(); addResourceIcon(root, id, 24, 24, 40);
  renderer.render(root); const url = renderer.view.toDataURL(); root.destroy({ children: true }); return url;
}
function url(id) {
  const revision = getArtRevision(), cached = cache.get(id);
  if (cached?.revision === revision) return cached.url;
  const next = { revision, url: draw(id) }; cache.set(id, next); return next.url;
}
export function statIcon(id) {
  const img = document.createElement('img'); img.alt = ''; img.width = img.height = 24; img.className = 'stat-icon';
  img.dataset.icon = id; img.src = url(id); painted.add(img); return img;
}
let shown = getArtRevision();
setInterval(() => {
  if (getArtRevision() === shown) return; shown = getArtRevision();
  for (const img of painted) { if (!img.isConnected) painted.delete(img); else img.src = url(img.dataset.icon); }
}, 500);
