import { CONTACT_PAIRS } from './terrain-composition.js';

const biomes = ['plains', 'forest', 'islands', 'swamp', 'mountains'];
export const composableLibrary = { biomePieces: 60, boundaryPieces: 50, cells: [], sheets: 7 };

// Source hues carry the material information: leaves, trunks, earth and rock.
// Small channel corrections preserve those differences and the painted light.
export function gradeTerrainColour(r, g, b, family) {
  const foliage = g > b * 1.22 && r < g * 1.22;
  const stone = Math.max(r, g, b) - Math.min(r, g, b) < 35;
  let gains = [1.06, 1.055, 1.08];
  if (family === 'forest' && foliage) gains = [1.01, 1.075, 1.035];
  if (family === 'swamp') gains = foliage ? [.98, 1.025, 1.06] : [1.025, 1.045, 1.10];
  if (family === 'mountains' && stone) gains = [1.085, 1.035, 1.025];
  return [r, g, b].reduce((rgb, value, i) => rgb | Math.min(255, Math.round(value * gains[i] + 3)) << (16 - i * 8), 0);
}

export async function loadComposableArt(banks) {
  const sheets = [...biomes.map(name => ({ name, columns: 4, rows: 3 })),
    { name: 'contacts-1', columns: 5, rows: 5 }, { name: 'contacts-2', columns: 5, rows: 5 }];
  const frames = [];
  for (const sheet of sheets) {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error(`Terrain sheet failed to load: ${sheet.name}`));
      image.src = new URL(`./assets/composable-${sheet.name}-v1.png`, import.meta.url).href;
    });
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
    const data = ctx.getImageData(0, 0, image.width, image.height).data;
    const cw = image.width / sheet.columns, ch = image.height / sheet.rows;
    for (let n = 0; n < sheet.columns * sheet.rows; n++) {
      const col = n % sheet.columns, row = Math.floor(n / sheet.columns);
      let left = Math.ceil((col + 1) * cw), right = 0, top = Math.ceil((row + 1) * ch), bottom = 0, opaque = 0;
      for (let y = Math.ceil(row * ch + ch * .025); y < (row + 1) * ch - ch * .025; y++) {
        for (let x = Math.ceil(col * cw + cw * .025); x < (col + 1) * cw - cw * .025; x++) {
          if (data[(y * image.width + x) * 4 + 3] < 120) continue;
          left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y); opaque++;
        }
      }
      if (opaque < 80) throw new Error(`Empty generated terrain cell: ${sheet.name}/${n}`);
      const contact = sheet.name.startsWith('contacts');
      const pair = contact ? (sheet.name === 'contacts-1' ? 0 : 5) + row : null;
      const kind = contact ? `contact-${pair}-${col}` : `terrain-${sheet.name}-${n}`;
      const scale = [1.2, 1, .85, 1.1, 1.05, .8, .75, 1.15, .9, 1, .8, .85][n];
      const width = contact ? 25 : Math.round((sheet.name === 'mountains' ? 36 : sheet.name === 'forest' ? 26 : 25) * scale);
      frames.push({ image, kind, family: sheet.name, rect: [left, top, right - left + 1, bottom - top + 1], width });
      composableLibrary.cells.push({ kind, sheet: sheet.name, pair: contact ? CONTACT_PAIRS[pair] : null, sourcePixels: opaque });
    }
  }
  for (const detail of [1, 2]) for (const frame of frames) {
    const canvas = document.createElement('canvas'); canvas.width = frame.width * detail;
    canvas.height = Math.min(59 * detail, Math.max(1, Math.round(canvas.width * frame.rect[3] / frame.rect[2])));
    const ctx = canvas.getContext('2d'); ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(frame.image, ...frame.rect, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const rows = [], colours = {}, opacity = [], rgbColours = {};
    for (let y = 0; y < canvas.height; y++) {
      let row = ''; const alpha = [];
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        if (data[i + 3] < 65 || (data[i + 2] > data[i] + 8 && data[i + 1] > data[i] + 3)) { row += '.'; alpha.push(0); continue; }
        const r = data[i] >> 3, g = data[i + 1] >> 3, b = data[i + 2] >> 3;
        const code = String.fromCharCode(256 + (r << 10) + (g << 5) + b);
        const rgb = gradeTerrainColour(r * 8 + 4, g * 8 + 4, b * 8 + 4, frame.family);
        row += code; rgbColours[code] = rgb; colours[code] = `#${rgb.toString(16).padStart(6, '0')}`;
        alpha.push(data[i + 3] / 255);
      }
      rows.push(row); opacity.push(alpha);
    }
    const glyph = { rows, colours, rgbColours, opacity, family: frame.family, illustrated: true, composable: true };
    banks[detail][frame.kind] = glyph;
    banks[detail][`${frame.kind}-mirror`] = { ...glyph, rows: rows.map(row => [...row].reverse().join('')), opacity: opacity.map(row => row.slice().reverse()) };
  }
}
