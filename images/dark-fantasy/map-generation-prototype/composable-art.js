export const composableLibrary = { biomePieces: 84, boundaryPieces: 50, cells: [], sheets: 11 };

// Source hues carry the material information: leaves, trunks, earth and rock.
// Small channel corrections preserve those differences and the painted light.
export function gradeTerrainColour(r, g, b, family) {
  const foliage = g > b * 1.22 && r < g * 1.22;
  const stone = Math.max(r, g, b) - Math.min(r, g, b) < 35;
  let gains = [1.06, 1.055, 1.08];
  if (family === 'forest' && foliage) gains = [1.01, 1.075, 1.035];
  if (family === 'swamp') {
    const peat = b > g * .70 && r < g * 1.35;
    gains = peat ? [1.10, .95, 1.20] : foliage ? [1.04, .99, 1.08] : [1.04, 1.02, 1.04];
  }
  if (family === 'islands' && r > 145 && g > 125 && b < g * .95) gains = [.87, .90, .88];
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
    const proportion = frame.family === 'islands' ? .8 : 1;
    const canvas = document.createElement('canvas'); canvas.width = Math.round(frame.rect[2] * detail / 2 * proportion);
    canvas.height = Math.round(frame.rect[3] * detail / 2 * proportion);
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


  }
}
