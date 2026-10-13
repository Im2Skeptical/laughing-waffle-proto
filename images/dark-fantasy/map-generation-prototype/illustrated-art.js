// Curated frames from the generated engraving sheet. Converted once into the
// same categorical glyph format as the procedural artwork, on the world lattice.
export async function loadIllustratedArt(banks) {
  const image = new Image();
  image.src = new URL('./assets/terrain-engraving-v1.png', import.meta.url).href;
  await image.decode();
  const frames = {
    massif: [8, 18, 585, 346], peaks: [593, 125, 355, 252],
    hills: [955, 220, 325, 164], rocks: [1283, 195, 248, 190],
    wood: [8, 368, 615, 344], copse: [631, 422, 326, 286],
    trees: [963, 432, 287, 272], tree: [1260, 420, 270, 285],
    marsh: [8, 715, 587, 302], reeds: [597, 767, 344, 231],
    scrub: [951, 814, 310, 177], cliff: [1270, 779, 262, 217],
  };
  const build = (frame, width, ash = false) => {
    const [sx, sy, sw, sh] = frames[frame], canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = Math.round(width * sh / sw);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const rows = [], colours = {}, tones = {};
    for (let y = 0; y < canvas.height; y++) {
      let row = '';
      for (let x = 0; x < canvas.width; x++) {
        const i = (y * canvas.width + x) * 4;
        if (pixels[i + 3] < 120) { row += '.'; continue; }
        const r = pixels[i] >> 4, g = pixels[i + 1] >> 4, b = pixels[i + 2] >> 4;
        const code = String.fromCharCode(256 + (r << 8) + (g << 4) + b);
        const tone = Math.max(0, Math.min(1, ((r * .25 + g * .6 + b * .15) * 16 / 255 - .06) / .7));
        let rgb = ((r * 16 + 8) << 16) | ((g * 16 + 8) << 8) | (b * 16 + 8);
        if (ash) { const v = Math.round(18 + tone * 78); rgb = (v << 16) | ((v + 5) << 8) | (v + 9); }
        colours[code] = `#${rgb.toString(16).padStart(6, '0')}`; tones[code] = tone; row += code;
      }
      rows.push(row);
    }
    return { rows, colours, tones, illustrated: true };
  };
  for (const detail of [1, 2]) {
    const art = banks[detail];
    for (let n = 0; n < 12; n++) art[`crag${n}`] = build(n % 3 ? 'peaks' : 'massif', (n % 3 ? 43 + n % 4 * 3 : 56) * detail);
    for (let n = 0; n < 6; n++) art[`crag-small${n}`] = build(n % 2 ? 'peaks' : 'rocks', (24 + n % 3 * 3) * detail);
    for (let n = 0; n < 5; n++) art[`hill${n}`] = build(n % 2 ? 'hills' : 'scrub', (20 + n * 3) * detail);
    const woods = [['wood', 55], ['wood', 46], ['copse', 35], ['copse', 28], ['trees', 23], ['tree', 16], ['trees', 19], ['tree', 20]];
    woods.forEach(([frame, width], n) => { art[`copse${n}`] = build(frame, width * detail); });
    for (let n = 0; n < 3; n++) art[`deadwood${n}`] = build(n === 0 ? 'marsh' : 'reeds', (n === 0 ? 43 : 24 + n * 4) * detail);
    art.cliff0 = build('cliff', 30 * detail); art.cliff1 = build('rocks', 20 * detail);
    for (const [kind, glyph] of Object.entries(art)) if (/^(crag|hill|deadwood|cliff)/.test(kind)) {
      const colours = {};
      for (const [code, tone] of Object.entries(glyph.tones)) {
        const v = Math.round(18 + tone * 78), rgb = (v << 16) | ((v + 5) << 8) | (v + 9);
        colours[code] = `#${rgb.toString(16).padStart(6, '0')}`;
      }
      art[`ash-${kind}`] = { ...glyph, colours };
    }
  }
}
