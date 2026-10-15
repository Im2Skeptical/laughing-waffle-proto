// Disposable material study. These fields decorate the canonical world once.
// Cycle indices describe coherent bands; geometry and random samples never depend on zoom.
import { WATER_BODY } from './water-style.js';
export const SHORE_TREATMENTS = {
  plains: { bank: 0x78664a, sediment: 0xc5b78c, road: [0xa28d65, 0xc3b18a], beach: 14, exposure: .9 },
  forest: { bank: 0x424936, sediment: 0x92956a, road: [0x6b6446, 0xa49b70], beach: 5, exposure: .6 },
  islands: { bank: 0x565b4c, sediment: 0xb3ac8f, road: [0xa7a27a, 0xd0c6a0], beach: 6, exposure: .8 },
  swamp: { bank: 0x55475b, sediment: 0x96869a, road: [0x6e6958, 0xaaa18b], beach: 24, exposure: .18 },
  mountains: { bank: 0x615047, sediment: 0xa3927f, road: [0x8b7161, 0xbfa991], beach: 4, exposure: 1 },
  monster: {bank:0x493e3b,sediment:0x8b7765,road:[0x766051,0xa28b70],beach:5,exposure:.8},
};
const biomes = [null, 'plains', 'forest', 'islands', 'swamp', 'mountains', 'monster'];
const fract = x => x - Math.floor(x);
const clamp = x => Math.max(0, Math.min(1, x));

export function paintOcean({ map, width, height, texel, bounds, land, waterIndices, colours,
  regionIds, seaDistance, dryDistance, shoreTypes, waterBodies, waterBank, groundBank, noise, mixColour, waterBase, waterStrength, surfaces }) {
  // Dedicated cyclic ramps: offshore swell, lace foam and sheltered tidal water.
  // Ramp phase is encoded spatially; this is still frame zero, not animation.
  for (let n = 0; n < 32; n++) {
    const t = n / 32, crest = Math.pow(Math.max(0, Math.cos(t * Math.PI * 2)), 5);
    waterBank[128 + n] = mixColour(0x355560, 0x829d9b, crest * .65 + .06);
    waterBank[208 + n] = mixColour(0x405f68, 0x7a9693, crest * .65 + .06);
    waterBank[160 + n] = mixColour(0x527c80, 0xc1cdb9, Math.pow(Math.max(0, Math.sin(t * Math.PI)), .8));
  }
  for (let n = 0; n < 16; n++) {
    waterBank[192 + n] = mixColour(0x455d58, 0x8b9f86, n / 15);
    const crest=Math.pow(Math.max(0,Math.cos(n/16*Math.PI*2)),4);
    waterBank[112+n]=mixColour(0x3c535f,0x8a9a96,crest*.6);
    waterBank[240+n]=mixColour(0x4e6867,0x939f8c,crest*.65);
  }
  const stats = { exposedSurf: 0, shelteredWater: 0, swell: 0, beaches: 0, ecotones: 0, riverMargins: 0, oceanPixels:0,lakePixels:0,lakeRipples:0,lakeMargins:0 };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    const wx = (bounds.minX * 1576 + x * texel) / 2, wy = (bounds.minY * 516 + y * texel) / 2;
    const material = biomes[shoreTypes[i]], treatment = SHORE_TREATMENTS[material];
    const broad = noise(map.seed ^ 9071, wx, wy, 92), lace = noise(map.seed ^ 8317, wx, wy, 8);
    const grain = fract(Math.sin(wx * 12.9898 + wy * 78.233 + map.seed) * 43758.5453);
    if (!land[i]) {
      const distance = seaDistance[i] / 3 * texel / 2;
      if(waterBodies[i]===WATER_BODY.lake) {
        const shallow=Math.exp(-distance/11),silt=noise(map.seed^17233,wx,wy,23);
        const ripple=fract((wy+Math.sin(wx/41)*2)/12+noise(map.seed^6197,wx,wy,37)*.35);
        const packet=noise(map.seed^8729,wx*.45,wy*1.6,13);
        const glint=distance<3.5&&lace>.58;
        const index=glint?240+Math.floor(ripple*16):112+Math.floor(ripple*16);
        let base=mixColour(0x354957,0x62736b,clamp(shallow*.72+broad*.14));
        if(distance<12)base=mixColour(base,0x747963,shallow*silt*.2);
        const strength=(glint?.22:packet>.55?.25: .025)*( .7+lace*.3);
        waterIndices[i]=index;waterBase[i]=base;waterStrength[i]=Math.round(strength*255);
        colours[i]=mixColour(base,waterBank[index],strength);
        stats.lakePixels++;if(packet>.55)stats.lakeRipples++;if(glint)stats.lakeMargins++;
        continue;
      }
      stats.oceanPixels++;
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
        const packet = lace > .46;
        index = fine > .64 ? 208 + Math.floor(chop * 32) : packet ? 128 + Math.floor(swell * 32) : 64 + Math.floor(clamp(.12 + broad * .34 + shoal * .43 + grain * .035) * 31);
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
      if (material === 'swamp') waterBase[i] = mixColour(waterBase[i], 0x74657b, Math.exp(-distance / 11) * .7);
      const strength = index >= 160 && index < 192 ? .18 + lace * .44
        : index >= 208 ? clamp((fine - .5) * 2) * .7
        : index >= 128 && index < 160 ? clamp((lace - .35) * 2.8) * (.18 + broad * .45)
          : index >= 192 ? .28 : .25;
      waterStrength[i] = Math.round(strength * 255);
      colours[i] = mixColour(waterBase[i], waterBank[index], strength);
    } else {
      const region = map.regions[regionIds[i]], bank = SHORE_TREATMENTS[region?.biome];
      if (!bank) continue;
      const d = dryDistance[i] / 3 * texel / 2;
      if(waterBodies[i]===WATER_BODY.lake) {
        if(d<5+lace*3){
          const wet=d<1.8,colour=wet?0x4e5d52:mixColour(bank.bank,0x7b8064,.48);
          colours[i]=mixColour(colours[i],colour,(wet?.66:.3)*clamp(1-d/9));
          if(d>1&&d<5&&lace>.65&&grain>.72)colours[i]=mixColour(colours[i],0x5d6a48,.3);
          stats.lakeMargins++;
        }
        continue;
      }
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
