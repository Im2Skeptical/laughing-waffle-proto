export const composableLibrary = { biomePieces: 126, boundaryPieces: 50, cells: [], sheets: 13 };

// Source hues carry the material information: leaves, trunks, earth and rock.
// Small channel corrections preserve those differences and the painted light.
export function gradeTerrainColour(r, g, b, family) {
  if (family.startsWith('monster-')) {
    const value=r*.30+g*.59+b*.11;
    const foliage=g>r*.88 && g>b*1.20;
    const colour=foliage?[value*.67+17,value*.50+14,value*.46+13]:[r*.86+10,g*.78+9,b*.78+10];
    return colour.reduce((rgb,v,i)=>rgb|Math.min(255,Math.round(v))<<(16-i*8),0);
  }
  if(family==='hellscape') {
    return [r,g,b].reduce((rgb,v,i)=>rgb|Math.round(85+(v-85)*.86)<<(16-i*8),0);
  }
  if (family === 'plains') {
    // Match dry straw/ochre soil without washing every material toward grey.
    // Preserve cool olive vegetation separately from warm earth and pale rock.
    const value = r*.30 + g*.59 + b*.11;
    const foliage = g > b*1.35 && g > r*.90;
    const channels = foliage
      ? [value*.82+18, value*.80+20, value*.49+14]
      : [value*.88+32, value*.76+25, value*.49+19];
    return channels.reduce((rgb,v,i) => rgb | Math.max(0,Math.min(255,Math.round(v))) << (16-i*8),0);
  }
  if (family === 'forest') {
    // Compress luminance, retaining the painted leaf/wood hue differences.
    // Fine canopy relief survives without competing with the other biomes.
    const value=r*.30+g*.59+b*.11, canopy=86+(value-108)*.65;
    return [canopy+(r-value)*.7+2,canopy+(g-value)*.8+3,canopy+(b-value)*.6-7]
      .reduce((rgb,v,i)=>rgb|Math.max(0,Math.min(255,Math.round(v)))<<(16-i*8),0);
  }
  if (family === 'island-basalt') {
    // Compress values around weathered mid-grey without flattening leaf/stone hue.
    return [r,g,b].reduce((rgb,v,i) => rgb | Math.round(112 + (v-112)*.64 + [8,9,7][i]) << (16-i*8), 0);
  }
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
  for (const detail of [1, 2]) for (const frame of manifest.frames) for (const scale of (frame.family==='hellscape'?([1,5].includes(Number(frame.kind.split('-').at(-1)))?[1.3,1,.72,.5,.3]:[1,.72,.5,.3]):(frame.family.startsWith('island-') || frame.family.startsWith('monster-') || ['plains','forest'].includes(frame.family)) ? [1,.72,.5] : [1])) {
    const proportion = (frame.family === 'islands' ? .8 : 1) * scale;
    const kind = frame.kind + (scale===1.3?'-ridge':scale === .72 ? '-compact' : scale === .5 ? '-small' : scale===.3?'-micro':'');
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
        if (data[i + 3] < 65 || (frame.family !== 'forest' && data[i + 2] > data[i] + 8 && data[i + 1] > data[i] + 3)) { row += '.'; alpha.push(0); continue; }
        const r = data[i] >> 3, g = data[i + 1] >> 3, b = data[i + 2] >> 3;
        const code = String.fromCharCode(256 + (r << 10) + (g << 5) + b);
        const rgb = gradeTerrainColour(r * 8 + 4, g * 8 + 4, b * 8 + 4, frame.family);
        row += code; rgbColours[code] = rgb; colours[code] = `#${rgb.toString(16).padStart(6, '0')}`;
        alpha.push(data[i + 3] / 255);
      }
      rows.push(row); opacity.push(alpha);
    }
    const glyph = { rows, colours, rgbColours, opacity, cutRuns: frame.cutRuns, family: frame.family, illustrated: true, composable: true };
    banks[detail][kind] = glyph;
    banks[detail][`${kind}-mirror`] = { ...glyph, rows: rows.map(row => [...row].reverse().join('')), opacity: opacity.map(row => row.slice().reverse()) };


  }
}
