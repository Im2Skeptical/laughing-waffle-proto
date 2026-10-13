// Original pixel engravings for the disposable dark-fantasy atlas treatment.
// Fixed silhouettes and hatching; no borrowed map artwork or simulation RNG.
import { decorationRandom } from './generator.js';

const STONE = { a: '#40382e', b: '#78694f', c: '#a59271', d: '#c3b492', e: '#d6c9a8', f: '#8c7d60' };
const WOOD = { a: '#39392c', b: '#55563e', c: '#787652', d: '#9a9167', e: '#64563d', f: '#9b8c68' };
function engraving(width, height, colours) {
  const grid = Array.from({ length: height }, () => new Array(width).fill('.'));
  const put = (x, y, code) => { x = Math.floor(x); y = Math.floor(y); if (grid[y]?.[x] !== undefined) grid[y][x] = code; };
  const line = (a, b, code, broken = false) => {
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1]))));
    for (let i = 0; i <= steps; i++) if (!broken || i % 5 !== 3) put(a[0] + (b[0] - a[0]) * i / steps, a[1] + (b[1] - a[1]) * i / steps, code);
  };
  const polygon = (points, code, outline = null) => {
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      let inside = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const a = points[i], b = points[j];
        if ((a[1] > y + .5) !== (b[1] > y + .5) && x + .5 < (b[0] - a[0]) * (y + .5 - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
      }
      if (inside) put(x, y, code);
    }
    if (outline) points.forEach((p, i) => line(p, points[(i + 1) % points.length], outline));
  };
  const ellipse = (cx, cy, rx, ry, code, outline = null) => {
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (d <= 1) put(x, y, outline && d > .62 ? outline : code);
    }
  };
  return { put, line, polygon, ellipse, grid, finish: () => ({ colours, rows: grid.map(row => row.join('')) }) };
}

export function createAtlasArt() {
  const art = {};
  // Different summit profiles: double crag, tilted needle, broad massif, broken
  // ridge and blunt escarpment. Variation changes form, not only scale or tint.
  const profiles = [
    [[0, 1], [.1, .69], [.21, .7], [.42, .04], [.53, .43], [.68, .23], [.82, .62], [1, 1]],
    [[0, 1], [.24, .66], [.48, .12], [.58, .4], [.68, .09], [.72, .42], [.88, .65], [1, 1]],
    [[0, 1], [.12, .6], [.28, .28], [.47, .24], [.53, .12], [.68, .22], [.75, .51], [.9, .68], [1, 1]],
    [[0, 1], [.17, .71], [.38, .15], [.46, .54], [.6, .37], [.77, .1], [.8, .65], [1, 1]],
    [[0, 1], [.08, .54], [.24, .49], [.3, .24], [.6, .2], [.63, .32], [.83, .38], [.91, .82], [1, 1]],
    [[0, 1], [.14, .79], [.35, .44], [.51, .02], [.56, .35], [.73, .48], [.86, .82], [1, 1]],
  ];
  for (let v = 0; v < 12; v++) {
    const width = 16 + v % 4 * 3, height = 16 + (v * 7 % 13), g = engraving(width, height, STONE);
    const outline = profiles[v % profiles.length].map(([x, y]) => [1 + x * (width - 3), 1 + y * (height - 4)]);
    g.polygon(outline, 'c', 'a');
    const summit = outline.reduce((best, p) => p[1] < best[1] ? p : best), foot = [summit[0] + (width - summit[0]) * .15, height - 3];
    for (let y = Math.ceil(summit[1]); y < height - 2; y++) {
      const t = (y - summit[1]) / (foot[1] - summit[1]), ridgeX = summit[0] + (foot[0] - summit[0]) * t;
      for (let x = Math.ceil(ridgeX); x < width; x++) if (g.grid[y][x] === 'c') g.put(x, y, 'b');
    }
    g.line(summit, [summit[0] - 2, summit[1] + 5], 'e');
    g.line([summit[0] - 2, summit[1] + 5], [summit[0] - 5, summit[1] + 8], 'd');
    g.line(summit, [summit[0] + 1, summit[1] + 4], 'a');
    g.line([summit[0] + 1, summit[1] + 4], foot, 'a', true);
    for (let i = 0; i < 7; i++) {
      const t = (i + 1) / 9, x = summit[0] + (foot[0] - summit[0]) * t, y = summit[1] + (foot[1] - summit[1]) * t;
      for (let n = 0; n < 4 + (v + i) % 4; n++) {
        const px = Math.floor(x + n), py = Math.floor(y + n * .7);
        if (g.grid[py]?.[px] === 'b' && n % 2 === 0) g.put(px, py, (i + n) % 3 ? 'a' : 'c');
      }
    }
    outline.forEach((p, i) => { if (i < outline.length - 1) g.line(p, outline[i + 1], 'a', v % 3 === 0); });
    g.line([2, height - 2], [width - 3, height - 2], 'f', true);
    art[`crag${v}`] = g.finish();
  }
  for (let v = 0; v < 5; v++) {
    const width = 16 + v * 2, height = 9 + v % 3, g = engraving(width, height, STONE);
    const points = [[1, height - 3], [4, 4], [width * .45, 1 + v % 2], [width * .7, 3], [width - 2, height - 3]];
    g.polygon(points, 'd'); g.line(points[0], points[1], 'a'); g.line(points[1], points[2], 'a'); g.line(points[2], points[3], 'a'); g.line(points[3], points[4], 'a');
    for (let x = 4; x < width - 2; x += 3) g.line([x, 5 + v % 2], [x + 2, height - 3], 'b');
    g.line([2, height - 2], [width - 3, height - 2], 'f', true); art[`hill${v}`] = g.finish();
  }
  for (let v = 0; v < 8; v++) {
    const width = 16 + v % 4 * 3, height = 12 + v % 3 * 2, g = engraving(width, height, WOOD);
    const trees = Array.from({ length: 4 + v % 4 }, (_, i) => ({
      x: 3 + decorationRandom(753951, v * 40 + i * 3) * (width - 7),
      y: 3 + decorationRandom(753951, v * 40 + i * 3 + 1) * (height - 8),
      size: 2 + decorationRandom(753951, v * 40 + i * 3 + 2) * 2,
    })).sort((a, b) => a.y - b.y);
    for (const [i, tree] of trees.entries()) {
      g.line([tree.x, tree.y + tree.size], [tree.x, tree.y + tree.size + 3], 'e');
      if ((v + i) % 3 === 0) {
        g.polygon([[tree.x, tree.y - tree.size], [tree.x - tree.size, tree.y + tree.size], [tree.x + tree.size, tree.y + tree.size]], 'b', 'a');
        g.line([tree.x, tree.y - tree.size + 1], [tree.x - 1, tree.y + 1], 'd');
      } else {
        g.ellipse(tree.x, tree.y, tree.size, tree.size * .8, 'c', 'a');
        g.put(tree.x - 1, tree.y - 1, 'd'); g.put(tree.x + 1, tree.y + 1, 'b');
      }
    }
    g.line([3, height - 2], [width - 4, height - 2], 'f', true); art[`copse${v}`] = g.finish();
  }
  for (let v = 0; v < 3; v++) {
    const width = 11 + v * 2, height = 16 + v * 2, g = engraving(width, height, WOOD), cx = Math.floor(width / 2);
    g.line([cx, height - 3], [cx - 1, 3], 'a'); g.line([cx + 1, height - 4], [cx, 7], 'e');
    for (let i = 0; i < 3; i++) {
      const y = 5 + i * 3, sign = (i + v) % 2 ? 1 : -1;
      g.line([cx, y + 4], [cx + sign * (4 + v % 2), y], 'a');
      g.line([cx + sign * 3, y + 1], [cx + sign * 3, y - 2], 'a');
    }
    g.line([cx - 3, height - 2], [cx + 3, height - 2], 'f', true); art[`deadwood${v}`] = g.finish();
  }
  for (let v = 0; v < 3; v++) {
    const width = 16 + v * 3, height = 19 - v * 2, g = engraving(width, height, STONE);
    const tower = (x, y, w, h) => {
      g.polygon([[x, y], [x + w, y], [x + w, y + h], [x, y + h]], 'd', 'a');
      g.line([x + w - 2, y + 1], [x + w - 2, y + h - 1], 'b');
      for (let px = x; px <= x + w; px += 3) { g.put(px, y - 1, 'a'); g.put(px + 1, y - 1, 'a'); }
      g.line([x + 2, y + 4], [x + 2, y + 6], 'a');
    };
    tower(2, 3, 5, height - 6); tower(width - 8, 7 - v, 5, height - 10 + v);
    g.polygon([[6, height - 9], [width - 6, height - 8], [width - 6, height - 3], [6, height - 3]], 'c', 'a');
    g.line([Math.floor(width / 2), height - 6], [Math.floor(width / 2), height - 3], 'a');
    g.line([1, height - 2], [width - 2, height - 2], 'f', true); art[`ruin${v}`] = g.finish();
  }
  art.rushes = { colours: { a: '#625d43', b: '#a49b76', c: '#727d66' }, rows: [
    '.b...b.', '.a..ba.', '.ab.aa.', '..a.a..', '..aaa..', '...a...', '.ccccc.', 'ccccccc'] };
  return art;
}
