// Relief emerges from connected ground-material patches rather than carrying
// a detached miniature base. This changes colour pixels only, never geography.
const variants = {
  plains: [0, 2, 4, 9, 15], forest: [0, 1, 4, 6, 8], islands: [1, 6, 11, 13],
  swamp: [1, 6, 7, 10, 14], mountains: [0, 2, 6, 8, 12],
};

export function paintTerrainFoundations({ props, art, pixel, surfaces, materialAt, land, waterIndices,
  colours, width, height, detail, noise, seed, mixColour, islandStyle = 'basalt' }) {
  let painted = 0;
  const families = {};
  for (const prop of props.filter(p => p.composed)) {
    const glyph = art[prop.kind], centre = pixel(prop.point), w = glyph.rows[0].length, h = glyph.rows.length;
    const x0 = centre.x, y0 = centre.y - h * .34;
    const fine = ['plains','forest'].includes(glyph.family);
    const rx = w * .63 + (fine ? 2.5 : 5) * detail, ry = h * .35 + (fine ? 3 : 6) * detail;
    const left = Math.max(0, Math.floor(x0 - rx * 1.3)), right = Math.min(width - 1, Math.ceil(x0 + rx * 1.3));
    const top = Math.max(0, Math.floor(y0 - ry * 1.3)), bottom = Math.min(height - 1, Math.ceil(y0 + ry * 1.3));
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
      const i = y * width + x, biome = materialAt(x, y);
      if (!land[i] || waterIndices[i] || !variants[biome]) continue;
      const grain = noise(seed ^ 51937, x, y, 9 * detail);
      const distance = Math.hypot((x - x0) / rx, (y - y0) / ry);
      const extent = .72 + grain * .5;
      if (distance >= extent) continue;
      const weight = Math.min(.52, (extent - distance) * .64) * (.62 + grain * .38);
      const choices = variants[biome], variant = choices[Math.abs(prop.salt) % choices.length];
      const substrate = biome === 'islands' ? mixColour(islandStyle === 'caldera' ? 0x77684f : 0x65675d, 0x5b624c, grain) : surfaces.groundVariant(biome, variant, x, y);
      colours[i] = mixColour(colours[i], substrate, weight);
      painted++; families[biome] = (families[biome] ?? 0) + 1;
    }
  }
  return { paintedPixels: painted, biomes: Object.keys(families) };
}
