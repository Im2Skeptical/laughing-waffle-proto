// Disposable material study. These fields decorate the canonical world once.
// Cycle indices describe coherent bands; geometry and random samples never depend on zoom.
export const SHORE_TREATMENTS = {
  plains: { bank: 0x78664a, sediment: 0xc5b78c, road: [0xa28d65, 0xc3b18a], beach: 14, exposure: .9 },
  forest: { bank: 0x424936, sediment: 0x92956a, road: [0x6b6446, 0xa49b70], beach: 5, exposure: .6 },
  islands: { bank: 0x8a8e69, sediment: 0xd3cbae, road: [0xa7a27a, 0xd0c6a0], beach: 18, exposure: .8 },
  swamp: { bank: 0x414b40, sediment: 0x78846d, road: [0x6e6958, 0xaaa18b], beach: 24, exposure: .18 },
  mountains: { bank: 0x615047, sediment: 0xa3927f, road: [0x8b7161, 0xbfa991], beach: 4, exposure: 1 },
};
const biomes = [null, 'plains', 'forest', 'islands', 'swamp', 'mountains'];
const fract = x => x - Math.floor(x);
const clamp = x => Math.max(0, Math.min(1, x));

export function paintOcean({ map, width, height, texel, bounds, land, waterIndices, colours,
  regionIds, seaDistance, dryDistance, shoreTypes, waterBank, groundBank, noise, mixColour, waterBase, waterStrength, surfaces }) {
  // Dedicated cyclic ramps: offshore swell, lace foam and sheltered tidal water.
  // Ramp phase is encoded spatially; this is still frame zero, not animation.
  for (let n = 0; n < 32; n++) {
    const t = n / 32, crest = Math.pow(Math.max(0, Math.cos(t * Math.PI * 2)), 5);
    waterBank[128 + n] = mixColour(0x294d59, 0x769e9e, crest * .8 + .08);
    waterBank[208 + n] = mixColour(0x365a65, 0x729799, crest * .8 + .08);
    waterBank[160 + n] = mixColour(0x487c83, 0xd2ddc8, Math.pow(Math.max(0, Math.sin(t * Math.PI)), .6));
  }
  for (let n = 0; n < 16; n++) waterBank[192 + n] = mixColour(0x455d58, 0x8b9f86, n / 15);
  const stats = { exposedSurf: 0, shelteredWater: 0, swell: 0, beaches: 0, ecotones: 0, riverMargins: 0 };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    const wx = (bounds.minX * 1576 + x * texel) / 2, wy = (bounds.minY * 516 + y * texel) / 2;
    const material = biomes[shoreTypes[i]], treatment = SHORE_TREATMENTS[material];
    const broad = noise(map.seed ^ 9071, wx, wy, 92), lace = noise(map.seed ^ 8317, wx, wy, 8);
    const grain = fract(Math.sin(wx * 12.9898 + wy * 78.233 + map.seed) * 43758.5453);
    if (!land[i]) {
      const distance = seaDistance[i] / 3 * texel / 2;
      // Long swells bend and fracture, with smaller oblique ripples superposed.
      const bend = Math.sin(wx / 39 + broad * 5) * 4 + Math.sin(wx / 117) * 7 + noise(map.seed ^ 713, wx, wy, 27) * 12;
      const swell = fract((wy + wx * .14 + bend + broad * 9) / 17 + noise(map.seed ^ 179, wx, wy * .4, 31) * 1.6);
      const fine = noise(map.seed ^ 977, wx * .6, wy * 2.3, 8);
      const chop = fract((wy * 1.8 - wx * .24 + Math.sin(wx / 11) * 1.5) / 8);
      const shoal = Math.exp(-distance / (material === 'swamp' ? 24 : 16));
      const exposure = treatment?.exposure ?? .75;
      const phase = fract(distance / (7 + broad * 5) + lace * .16 + Math.sin(wx / 32) * .1);
      // Discontinuous white caps sit on a darker wave face. Near shore their
      // phase follows depth, turning around bays instead of drawing parallel stripes.
      const breaking = distance > 1 && distance < 18 && exposure > .4 && broad > .44 && lace > .44;
      let index;
      if (material === 'swamp' && distance < 28) {
        index = 208 + Math.floor(chop * 32);
        stats.shelteredWater++;
      } else if (breaking && phase < .22 + lace * .1 && grain > .12) {
        index = 160 + Math.floor(clamp(phase / .32) * 31); stats.exposedSurf++;
      } else if (distance < 2.2 && lace > .35 && grain > .25) index = 160 + 12 + Math.floor(grain * 8);
      else if (distance < 25 && (chop < .2 || lace > .68)) index = 96 + Math.floor(clamp(shoal * .55 + broad * .3 + chop * .1) * 15);
      else {
        // Quiet gaps preserve the broad depth wash between ripple packets.
        const packet = lace > .34;
        index = fine > .54 ? 208 + Math.floor(chop * 32) : packet ? 128 + Math.floor(swell * 32) : 64 + Math.floor(clamp(.12 + broad * .34 + shoal * .43 + grain * .035) * 31);
        if (packet) stats.swell++;
      }
      waterIndices[i] = index;
      const depth = clamp(.11 + broad * .25 + shoal * .36 + grain * .025);
      waterBase[i] = waterBank[64 + Math.floor(depth * 31)];
      if (material && distance < 22) {
        const horizontal = Math.abs((seaDistance[i + 1] ?? 0) - (seaDistance[i - 1] ?? 0))
          < Math.abs((seaDistance[i + width] ?? 0) - (seaDistance[i - width] ?? 0));
        const substrate = surfaces.bank(material, x, y, .52 + Math.min(.45, distance / 38), horizontal);
        waterBase[i] = mixColour(waterBase[i], substrate, Math.exp(-distance / 9) * .52);
      }
      if (material === 'swamp') waterBase[i] = mixColour(waterBase[i], 0x6e8270, Math.exp(-distance / 11) * .7);
      const strength = index >= 160 && index < 192 ? .2 + lace * .65
        : index >= 208 ? clamp((fine - .5) * 2) * .7
        : index >= 128 && index < 160 ? clamp((lace - .35) * 2.8) * (.18 + broad * .45)
          : index >= 192 ? .28 : .25;
      waterStrength[i] = Math.round(strength * 255);
      colours[i] = mixColour(waterBase[i], waterBank[index], strength);
    } else {
      const region = map.regions[regionIds[i]], bank = SHORE_TREATMENTS[region?.biome];
      if (!bank) continue;
      const d = dryDistance[i] / 3 * texel / 2;
      const fringe = bank.beach * (.55 + broad * .7);
      if (d < fringe) {
        const wet = d < 2.5 + lace * 2;
        colours[i] = mixColour(colours[i], wet ? bank.bank : bank.sediment, wet ? .8 : clamp(1 - d / fringe) * .7);
        const horizontal = Math.abs((dryDistance[i + 1] ?? 0) - (dryDistance[i - 1] ?? 0))
          < Math.abs((dryDistance[i + width] ?? 0) - (dryDistance[i - width] ?? 0));
        const substrate = surfaces.bank(region.biome, x, y, .44 * (1 - clamp(d / fringe)), horizontal);
        colours[i] = mixColour(colours[i], substrate, .76 * (1 - d / fringe));
        if (grain < .1 && d > 3) colours[i] = mixColour(colours[i], bank.bank, .35);
        if (region.biome === 'swamp' && d > 2 && d < 15 && lace > .54 && chopMark(wx, wy) < .18) colours[i] = 0x52665d;
        stats.beaches++;
      }
    }
  }
  return stats;
}
const chopMark = (x, y) => fract((y + Math.sin(x / 8) * 3) / 6);

export function paintEcotones({ map, width, height, texel, regionIds, land, waterIndices, colours, groundBank, noise, mixColour, surfaceTreatments, surfaces }) {
  // Feather adjacent materials in world-space ribbons, keeping the territory
  // edge available as its own readable overlay. This never changes ownership.
  const reach = Math.round(18 / texel);
  const original = colours.slice();
  for (let y = reach; y < height - reach; y++) for (let x = reach; x < width - reach; x++) {
    const i = y * width + x, region = map.regions[regionIds[i]];
    if (!region || !land[i] || waterIndices[i]) continue;
    let other = null, distance = reach;
    for (let d = 2; d <= reach; d += 2) {
      for (const j of [i - d, i + d, i - width * d, i + width * d]) {
        const neighbour = map.regions[regionIds[j]];
        if (land[j] && neighbour && neighbour.biome !== region.biome) { other = neighbour; distance = d; break; }
      }
      if (other) break;
    }
    const n = noise(map.seed ^ 5371, x, y, 7), bank = groundBank[region.biome];
    if (other) {
      const pair = [region.biome, other.biome];
      const wet = pair.includes('swamp'), rock = pair.includes('mountains');
      const amount = (1 - distance / (reach + 2)) * (.25 + n * .4);
      colours[i] = mixColour(original[i], surfaces.contact(region.biome, other.biome, x, y, amount), .65);
      if (rock && n > .62 && (x + y * 7) % 13 < 2) colours[i] = bank[0];
      if (wet && n > .64 && chopMark(x, y) < .24) colours[i] = mixColour(bank[0], 0x5d7368, .5);
      surfaceTreatments.ecotones++;
    }
    const river = [i - 4, i + 4, i - width * 4, i + width * 4].some(j => waterIndices[j] >= 16 && waterIndices[j] <= 23);
    if (river) {
      const t = SHORE_TREATMENTS[region.biome];
      if (n > .35) colours[i] = mixColour(colours[i], t.sediment, .35);
      if (region.biome === 'mountains' && (x * 3 + y) % 7 < 2) colours[i] = bank[0];
      if (region.biome === 'forest' && n > .6) colours[i] = 0x586047;
      surfaceTreatments.riverMargins++;
    }
  }
}
