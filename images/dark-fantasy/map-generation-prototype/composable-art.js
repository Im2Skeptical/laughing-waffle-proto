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
  const manifest = await (await fetch(new URL('./assets/runtime/relief-v1.json', import.meta.url))).json();
  const image = new Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve; image.onerror = () => reject(new Error('Imported relief atlas failed to load'));
    image.src = new URL('./assets/runtime/relief-v1.webp', import.meta.url).href;
  });
  composableLibrary.cells = manifest.frames.map(frame => ({ kind: frame.kind, sheet: frame.family, pair: frame.pair, cutRuns: frame.cutRuns }));
  for (const detail of [1, 2]) for (const frame of manifest.frames) {
    const canvas = document.createElement('canvas'); canvas.width = Math.round(frame.rect[2] * detail / 2);
    canvas.height = Math.round(frame.rect[3] * detail / 2);
    const ctx = canvas.getContext('2d'); ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, ...frame.rect, 0, 0, canvas.width, canvas.height);
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
    const glyph = { rows, colours, rgbColours, opacity, cutRuns: frame.cutRuns, family: frame.family, illustrated: true, composable: true };
    banks[detail][frame.kind] = glyph;
    banks[detail][`${frame.kind}-mirror`] = { ...glyph, rows: rows.map(row => [...row].reverse().join('')), opacity: opacity.map(row => row.slice().reverse()) };
    if (frame.family === 'islands') {
      // Coastal relief is small geology, not a ring of miniature mountain ranges.
      const w = Math.max(1, Math.round(canvas.width * .52)), h = Math.max(1, Math.round(canvas.height * .35));
      const smallRows = [], smallAlpha = [];
      for (let y = 0; y < h; y++) {
        const sy = Math.min(canvas.height - 1, Math.floor((y + .5) * canvas.height / h));
        let row = ''; const alpha = [];
        for (let x = 0; x < w; x++) {
          const sx = Math.min(canvas.width - 1, Math.floor((x + .5) * canvas.width / w));
          row += rows[sy][sx]; alpha.push(opacity[sy][sx]);
        }
        smallRows.push(row); smallAlpha.push(alpha);
      }
      const small = { ...glyph, rows: smallRows, opacity: smallAlpha };
      banks[detail][`${frame.kind}-small`] = small;
      banks[detail][`${frame.kind}-small-mirror`] = { ...small, rows: smallRows.map(row => [...row].reverse().join('')), opacity: smallAlpha.map(row => row.slice().reverse()) };
    }

  }
}
