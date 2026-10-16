// Disposable material study. These fields decorate the canonical world once.
// Cycle indices describe coherent bands; geometry and random samples never depend on zoom.
import { WATER_BODY } from './water-style.js';
import { prepareInlandPalette, sampleInlandWater } from './inland-water.js';
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
const fade = (a,b,x) => {const t=clamp((x-a)/(b-a));return t*t*(3-2*t);};

export function paintOcean({ map, width, height, texel, bounds, land, waterIndices, colours,
  regionIds, seaDistance, dryDistance, shoreTypes, waterBodies, waterBank, groundBank, noise, mixColour, waterBase, waterStrength, waterOverlays, surfaces }) {
  // Asymmetric wave faces and short pale crests, followed by a longer dispersing
  // wake. Full phase paths exist under the masks, not just at the visible crest.
  const ramp=(stops,t)=>{for(let k=1;k<stops.length;k++)if(t<=stops[k][0])
    return mixColour(stops[k-1][1],stops[k][1],(t-stops[k-1][0])/(stops[k][0]-stops[k-1][0]));return stops.at(-1)[1];};
  for (let n = 0; n < 32; n++) {
    const t = n / 32;
    waterBank[128+n]=ramp([[0,0x294751],[.28,0x355e67],[.55,0x598b8c],[.65,0x86aaa3],[.73,0x416e79],[1,0x294751]],t);
    waterBank[208+n]=ramp([[0,0x34555e],[.38,0x416d77],[.55,0x729995],[.65,0x416d77],[1,0x34555e]],t);
    waterBank[160+n]=ramp([[0,0x38666c],[.30,0x528d8b],[.44,0x83b7ac],[.50,0xe0e4cd],[.60,0xb6d0bd],[.78,0x72a69e],[1,0x38666c]],t);
  }
  for (let n = 0; n < 16; n++) {
    waterBank[192+n]=ramp([[0,0x355c65],[.42,0x416f79],[.55,0xc0d2c4],[.66,0x83aaa5],[1,0x355c65]],n/16);
  }
  prepareInlandPalette(waterBank, mixColour);
  const stats = { exposedSurf: 0, offshoreCaps:0, surfPhases:Array(32).fill(0), shelteredWater: 0, swell: 0, beaches: 0, ecotones: 0, riverMargins: 0, oceanPixels:0,lakePixels:0,lakeRipples:0,lakeMargins:0,lakeVegetation:0,lakeReeds:0 };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x;
    const wx = (bounds.minX * 1576 + x * texel) / 2, wy = (bounds.minY * 516 + y * texel) / 2;
    const material = biomes[shoreTypes[i]], treatment = SHORE_TREATMENTS[material];
    const broad = noise(map.seed ^ 9071, wx, wy, 92), lace = noise(map.seed ^ 8317, wx, wy, 8);
    const grain = fract(Math.sin(wx * 12.9898 + wy * 78.233 + map.seed) * 43758.5453);
    if (!land[i]) {
      const distance = seaDistance[i] / 3 * texel / 2;
      if(waterBodies[i]===WATER_BODY.lake) {
        const sample=sampleInlandWater({kind:'lake',seed:map.seed,x:wx,y:wy,distance,noise,mix:mixColour});
        let base=sample.base;
        if(material&&distance<10) {
          const horizontal=Math.abs((seaDistance[i+1]??0)-(seaDistance[i-1]??0))<Math.abs((seaDistance[i+width]??0)-(seaDistance[i-width]??0));
          base=mixColour(base,surfaces.bank(material,x,y,.56+Math.min(.4,distance/24),horizontal),Math.exp(-distance/4)*.32);
        }
        waterIndices[i]=sample.index;waterBase[i]=base;waterStrength[i]=sample.strength;
        colours[i]=mixColour(base,waterBank[sample.index],sample.strength/255);
        stats.lakePixels++;if(sample.ripple)stats.lakeRipples++;if(sample.glint)stats.lakeMargins++;
        if(sample.vegetation)stats.lakeVegetation++;if(sample.reeds)stats.lakeReeds++;
        continue;
      }
      stats.oceanPixels++;
      // Aerial scale: broad submerged shelves with darker channels, then long
      // coherent wave fronts. Fine noise breaks the foam, never the wave face.
      const shelf=noise(map.seed^179,wx,wy,135),channel=noise(map.seed^713,wx*.6,wy*1.2,46);
      const shelfWidth=24+shelf*shelf*150;
      const shoal=Math.exp(-distance/shelfWidth);
      const bend=Math.sin(wx/83)*6+(noise(map.seed^619,wx,wy*.45,68)-.5)*21;
      const travel=(wy+wx*.22+bend)/17;
      const swell=fract(travel);
      const fine=noise(map.seed^977,wx*.55,wy*1.8,10);
      const chop=fract((wy-wx*.32+Math.sin(wx/27)*3)/9);
      const exposure = treatment?.exposure ?? .75;
      // Blend refracting coastal waves with incoming swell. Variable shelf
      // width and oblique travel prevent repeated concentric coastline strokes.
      const phase=fract(distance/21+travel*.32+(channel-.5)*.65+(lace-.5)*.19);
      const packet=noise(map.seed^4217,wx*.75,wy*1.25,37);
      const pores=noise(map.seed^3191,wx,wy,2.7);
      const streak=noise(map.seed^4231,wx*.45,wy*2.1,12);
      const surfReach=16+shelf*35;
      const surfEnvelope=fade(0,12,surfReach-distance)*fade(0,4,distance);
      const shelter=material==='swamp'?1-fade(12,40,distance):0;
      // Keep one continuous swell field. Other wave families overlap it instead
      // of replacing its phase/direction at a noise threshold.
      const index=128+Math.floor(swell*32);
      const strength=(.07+clamp((packet-.32)*2)*(.12+streak*.38))*(1-shelter*.7);
      const rippleStrength=(.14+clamp((fine-.64)*3)*.3)*fade(.48,.80,fine)*(1-shelter)+shelter*.12;
      const coastal=distance<surfReach;
      // Both foam families reach zero at their shared boundary. Changing the
      // categorical index there cannot cut a visible wave in half.
      const foamIndex=coastal?160+Math.floor(phase*32):192+Math.floor(fract(swell+(pores-.5)*.06)*16);
      const foamStrength=coastal
        ?surfEnvelope*fade(.22,.50,packet)*fade(.18,.6,exposure)*(.42+lace*.30)*(.35+fade(.25,.73,pores)*.65)
        :fade(0,16,distance-surfReach)*fade(.50,.82,packet)*fade(.40,.72,fine)*(.35+fine*.3)*(.45+pores*.55);
      const offset=i*4;
      waterOverlays[offset]=208+Math.floor(chop*32);
      waterOverlays[offset+1]=Math.round(rippleStrength*255);
      waterOverlays[offset+2]=foamIndex;
      waterOverlays[offset+3]=Math.round(foamStrength*255);
      stats.swell++;
      if(shelter>0)stats.shelteredWater++;
      if(waterOverlays[offset+3]) {
        if(coastal){stats.exposedSurf++;stats.surfPhases[foamIndex-160]++;}
        else stats.offshoreCaps++;
      }
      waterIndices[i] = index;
      let base=mixColour(0x293f50,0x365b68,clamp(broad*.7+shelf*.22));
      base=mixColour(base,0x508b83,clamp(shoal*(.55+channel*.65)));
      // Sand and reef mottling is static beneath the moving surface, in large
      // connected shapes. Avoid uniformly bright rings and all-over stippling.
      const sand=clamp((channel-.47)*3)*Math.pow(shoal,1.8);
      base=mixColour(base,0x9eaf90,sand*.55);
      base=mixColour(base,0x314f59,clamp((.42-channel)*4)*shoal*.45);
      base=mixColour(base,grain>.5?0x729b96:0x294a58,.035+pores*.025);
      waterBase[i]=base;
      if (material && distance < 22) {
        const horizontal = Math.abs((seaDistance[i + 1] ?? 0) - (seaDistance[i - 1] ?? 0))
          < Math.abs((seaDistance[i + width] ?? 0) - (seaDistance[i - width] ?? 0));
        const substrate = surfaces.bank(material, x, y, .52 + Math.min(.45, distance / 38), horizontal);
        waterBase[i] = mixColour(waterBase[i], substrate, Math.exp(-distance / 9) * .52);
      }
      if (material === 'swamp') waterBase[i] = mixColour(waterBase[i], 0x74657b, Math.exp(-distance / 11) * .7);
      waterStrength[i] = Math.round(strength * 255);
      colours[i] = mixColour(waterBase[i], waterBank[index], strength);
      colours[i] = mixColour(colours[i],waterBank[waterOverlays[offset]],waterOverlays[offset+1]/255);
      colours[i] = mixColour(colours[i],waterBank[foamIndex],waterOverlays[offset+3]/255);
    } else {
      const region = map.regions[regionIds[i]], bank = SHORE_TREATMENTS[region?.biome];
      if (!bank) continue;
      const d = dryDistance[i] / 3 * texel / 2;
      if(waterBodies[i]===WATER_BODY.lake) {
        const reach=6+lace*6;
        if(d<reach){
          const wet=d<1.5+lace,colour=wet?0x4c6055:mixColour(bank.bank,0x7b8064,.48);
          colours[i]=mixColour(colours[i],colour,(wet?.60:.38)*clamp(1-d/reach));
          if(d>1&&d<6&&lace>.59&&grain>.66)colours[i]=mixColour(colours[i],grain>.87?0x949777:0x536446,.42);
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
