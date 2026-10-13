// Original pixel engravings for the disposable dark-fantasy atlas treatment.
// Fixed silhouettes and hatching; no borrowed map artwork or simulation RNG.
import { decorationRandom } from './generator.js';

const STONE = { a: '#51422f', b: '#867359', c: '#af9d7a', d: '#c9b894', e: '#ddd0ae', f: '#ac9872' };
const HILL = { a: '#756747', b: '#92835a', c: '#b1a071', d: '#bfae7b', f: '#9c8c62' };
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
  // Each massif contains overlapping back and front peaks. Open, irregular feet
  // blend into the ground; ridge strokes and short hatches describe rock faces.
  for (let v = 0; v < 18; v++) {
    const compact = v >= 12, width = compact ? 28 : 42 + v % 4 * 3, height = compact ? 22 : 28 + v % 5, g = engraving(width, height, STONE);
    const peak = (cx, foot, span, tall, salt) => {
      const lean = (salt % 3 - 1) * 2, top = [cx + lean, foot - tall];
      const left = [[cx - span, foot], [cx - span * .66, foot - tall * .3], [cx - span * .35, foot - tall * .57], top];
      const right = [[cx + span * .26, foot - tall * .56], [cx + span * .63, foot - tall * .25], [cx + span, foot]];
      const ridge = [top, [cx + 1, foot - tall * .68], [cx - 1, foot - tall * .42], [cx + span * .28, foot - 2]];
      g.polygon([...left, ...right, [cx + span * .45, foot - 1], [cx, foot], [cx - span * .4, foot - 1]], 'd');
      g.polygon([...ridge, [cx + span, foot], ...right.slice(0, 2).reverse()], 'b');
      left.slice(1).forEach((p, i) => g.line(left[i], p, 'a', i === 0));
      const slope = [top, ...right]; slope.slice(1).forEach((p, i) => g.line(slope[i], p, 'a', i === 2));
      ridge.slice(1).forEach((p, i) => g.line(ridge[i], p, i === 2 ? 'b' : 'a', true));
      g.line([top[0] - 1, top[1] + 2], [cx - 3, foot - tall * .55], 'e', true);
      for (let y = Math.ceil(foot - tall * .7); y < foot - 2; y += 3) {
        for (let x = Math.ceil(cx); x < cx + span; x++) if (g.grid[y]?.[x] === 'b' && (x + y + salt) % 4 === 0) {
          g.put(x, y, 'a'); if (g.grid[y + 1]?.[x + 1] === 'b') g.put(x + 1, y + 1, 'c');
        }
      }
      for (let x = cx - span; x <= cx + span; x += 3) g.put(x, foot + (x % 2), 'f');
    };
    if (compact) {
      peak(8, height - 6, 6, 10 + v % 3, v);
      peak(19, height - 5, 7, 12 + v % 3, v + 1);
      peak(14, height - 2, 9, 15 + v % 3, v + 2);
    } else {
      peak(11 + v % 3, height - 7, 10, 13 + v % 4, v);
      peak(width - 14, height - 8, 11, 17 + v % 5, v + 1);
      peak(width * (v % 2 ? .52 : .43), height - 3, 12 + v % 2, 18 + v % 7, v + 2);
      if (v % 3 !== 0) peak(width - 12, height - 2, 10, 12 + v % 4, v + 3);
    }
    art[compact ? `crag-small${v - 12}` : `crag${v}`] = g.finish();
  }
  for (let v = 0; v < 5; v++) {
    const width = 16 + v * 2, height = 7 + v % 2, g = engraving(width, height, HILL);
    const points = Array.from({ length: width - 2 }, (_, i) => [i + 1, height - 3 - Math.sin(i / (width - 3) * Math.PI) * (3 + v % 2)]);
    g.polygon([...points, [width - 2, height - 2], [1, height - 2]], 'd');
    points.slice(1).forEach((p, i) => g.line(points[i], p, 'a'));
    for (let x = 4; x < width - 2; x += 4) g.put(x, height - 3, 'b');
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
  // Dead forms retain their silhouettes in a separate ash/charcoal palette.
  for (const [kind, glyph] of Object.entries(art)) if (/^(crag|hill|deadwood|rushes)/.test(kind)) {
    art[`ash-${kind}`] = { rows: glyph.rows, colours: { a: '#111519', b: '#292e33', c: '#41474b', d: '#596066', e: '#737a7d', f: '#353b40' } };
  }
  return art;
}
