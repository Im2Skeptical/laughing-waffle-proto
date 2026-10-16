// Shared playable composition for the atlas study and the live game's viewed state.
// Geography/water are supplied by the retained bake, never regenerated here.
import { canPlacePeak } from '../../../src/model/regional-map/generator.js';
import { routeSampleRoads } from './roads.js';
import { composeHinterland, paintHinterlandMass } from './hinterland-composition.js';
import { composeTerrainLandscape, boneRidgeFits } from './terrain-composition.js';
import { SHORE_TREATMENTS } from './terrain-interactions.js';
import { paintTerrainFoundations } from './terrain-foundations.js';
import { paintRegionDivisions } from './terrain-divisions.js';
import { bridgeSpans, paintBridge } from './road-crossings.js';
import { planSettlementSites, siteReliefContains, layOutSettlements, paintSettlementSites } from './settlement-sites.js';

const footprints=new WeakMap();
function paintedPixels(art){
  if(!footprints.has(art)){
    const pixels=[];
    art.rows.forEach((row,y)=>{for(let x=0;x<row.length;x++)if(row[x]!=='.')pixels.push(x,y);});
    footprints.set(art,Int16Array.from(pixels));
  }
  return footprints.get(art);
}

export function composePlayableTerrain({map, texel, detail, ART, width, height, bounds, pixel, world,
  land, waterIndices, regionIds, colours, waterBase, surfaces, materialAt, groundBank,
  noise, mixColour, sampleBackground, islandStyle, sites, settlementScale, interactions,
  anchors = null, connections = null, routedRoads = null, roadsOnly = false, background = null, isolatedMonsterBorders = false, peakMask = new Uint8Array(width*height)}) {
  const timings={},started=performance.now();
  const siteDetail = detail * settlementScale / .75;
  const settlementPlans = Array.isArray(sites)
    ? sites.map(s => anchors.find(a => a.regionId === s.regionId)).filter(Boolean).map(a => {
      const spec = sites.find(s => s.regionId === a.regionId);
      return {...structuredClone(a), kind:spec.kind};
    })
    : sites ? planSettlementSites({ map, pixel, world, width, height, land, waterIndices, regionIds, detail: siteDetail }) : [];
  const props = [];
  // Rasterise town reservations once instead of testing every building/street
  // for every painted pixel of every candidate landscape illustration.
  const siteMask=new Uint8Array(width*height);
  const fitsLand = prop => {
    const art=ART[prop.kind],p=pixel(prop.point),pixels=paintedPixels(art);
    const left=Math.round(p.x-art.rows[0].length/2),top=Math.round(p.y-art.rows.length);
    if(prop.context==='bone-boundary'&&!boneRidgeFits(art,left,top,(x,y)=>{
      if(x<0||y<0||x>=width||y>=height)return null;
      const i=y*width+x;return {dry:!!land[i]&&!waterIndices[i],biome:map.regions[regionIds[i]]?.biome};
    }))return false;
    let outside=0;
    const reserved=prop.family.startsWith('terrain-monster-')||prop.context==='bone-boundary';
    for(let n=0;n<pixels.length;n+=2){
      const x=pixels[n],y=pixels[n+1],px=left+x,py=top+y,i=py*width+px;
      if(px<0||py<0||px>=width||py>=height||siteMask[i])return false;
      if(reserved&&px>=roadClearance.x&&py>=roadClearance.y&&px<roadClearance.x+roadClearance.width&&py<roadClearance.y+roadClearance.height
        &&roadClearance.data[(py-roadClearance.y)*roadClearance.width+px-roadClearance.x])return false;
      if(prop.context==='bone-boundary')continue;
      if(!land[i]||waterIndices[i])return false;
      if(prop.allowedBiomes&&!prop.allowedBiomes.includes(map.regions[regionIds[i]]?.biome))outside++;
      if(prop.plainsOnly&&materialAt(px,py)!=='plains')return false;
      if((prop.kind.includes('crag')||prop.peak)&&x%4===0&&y%4===0){
        if(!peakMask[i])peakMask[i]=canPlacePeak(map.geography,world(px,py),1.5*texel/516)?1:2;
        if(peakMask[i]===2)return false;
      }
    }
    return prop.context==='bone-boundary'||!pixels.length||outside/(pixels.length/2)<.025;
  };
  const towns = settlementPlans.map((s, i) => ({ kind: `ruin${i % 3}`, point: s.point, regionId: s.regionId }));
  props.push(...towns);
  const extent = map.regions.flatMap(r => r.outline).map(pixel);
  const bx = Math.floor(Math.min(...extent.map(p => p.x))) - 2, by = Math.floor(Math.min(...extent.map(p => p.y))) - 2;
  const borderCanvas = document.createElement('canvas');
  borderCanvas.width = Math.ceil(Math.max(...extent.map(p => p.x))) - bx + 2;
  borderCanvas.height = Math.ceil(Math.max(...extent.map(p => p.y))) - by + 2;
  const roadClearance = { x: bx, y: by, width: borderCanvas.width, height: borderCanvas.height,
    data: new Uint8Array(borderCanvas.width * borderCanvas.height) };
  if (!anchors) layOutSettlements(settlementPlans, { detail: siteDetail, world, seed: map.seed, dry: (x, y, id) => {
    const i = Math.floor(y) * width + Math.floor(x);
    return x >= 0 && y >= 0 && x < width && y < height && land[i] && !waterIndices[i] && map.regions[regionIds[i]]?.id === id;
  } });
  for(const site of settlementPlans){
    const rx=site.rx*2.5,ry=site.ry*2.5;
    for(let y=Math.max(0,Math.floor(site.y-ry));y<Math.min(height,site.y+ry);y++)
      for(let x=Math.max(0,Math.floor(site.x-rx));x<Math.min(width,site.x+rx);x++)
        if(siteReliefContains([site],x,y))siteMask[y*width+x]=1;
  }
  // The workbench connects its sample towns. Live maps supply exact gameplay edges.
  const roadSites = anchors ?? settlementPlans.filter(s => s.biome !== 'islands');
  const pairs = connections?.map(e => ({a:roadSites.findIndex(s=>s.regionId===e.regionAId),
    b:roadSites.findIndex(s=>s.regionId===e.regionBId),id:[e.regionAId,e.regionBId].sort().join(':')}))
    .filter(p=>p.a>=0&&p.b>=0);
  const roads = routedRoads ?? routeSampleRoads(roadSites.map(s => s.entrance), { width, height, regionIds, land, waterIndices, materialAt, scale: detail, exclusions: anchors ?? settlementPlans,
    pairs, bounds: { minX: bx, minY: by, maxX: bx + borderCanvas.width, maxY: by + borderCanvas.height } });
  surfaces.registerPaths('road', roads);
  timings.routes=performance.now()-started;
  const roadCanvas = document.createElement('canvas'); roadCanvas.width = borderCanvas.width; roadCanvas.height = borderCanvas.height;
  const roadCtx = roadCanvas.getContext('2d');
  let bridges = 0;
  const roadDot = (x, y, radius, colour, clear = false) => {
    for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
      if (dx * dx + dy * dy > radius * radius + .3) continue;
      const px = x + dx, py = y + dy, i = py * width + px;
      if (px < bx || py < by || px >= bx + roadCanvas.width || py >= by + roadCanvas.height || !land[i] || regionIds[i] < 0) continue;
      if (clear) roadClearance.data[(py - by) * roadCanvas.width + px - bx] = 1;
      else { roadCtx.fillStyle = colour; roadCtx.fillRect(px - bx, py - by, 1, 1); }
    }
  };
  for (const path of roads) {
    // Densify the search lattice to keep diagonal roads continuous.
    const samples = [];
    for (let n = 1; n < path.length; n++) {
      const a = path[n - 1], b = path[n], steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y));
      for (let j = 0; j < steps; j++) samples.push({ x: Math.round(a.x + (b.x - a.x) * j / steps), y: Math.round(a.y + (b.y - a.y) * j / steps) });
    }
    samples.push(path.at(-1));
    for (const p of samples) roadDot(p.x, p.y, 3 * detail, '', true);
    roadCtx.globalAlpha = .3;
    for (const p of samples) roadDot(p.x, p.y, Math.ceil(1.5 * detail), '#655339');
    roadCtx.globalAlpha = .85;
    for (const p of samples) roadDot(p.x, p.y, detail, '#695338');
    roadCtx.globalAlpha = 1;
    for (const [n, p] of samples.entries()) {
      const biome = map.regions[regionIds[p.y * width + p.x]]?.biome;
      let colour = (SHORE_TREATMENTS[materialAt(p.x, p.y)]?.road ?? [0xb5a078, 0xc9b68c])[n % 11 < 3 ? 0 : 1];
      if (biome) {
        const a = samples[Math.max(0, n - 2)], b = samples[Math.min(samples.length - 1, n + 2)];
        const mask = Math.abs(b.x - a.x) > Math.abs(b.y - a.y) ? 10 : 5;
        colour = mixColour(colour, surfaces.path('road', biome, p.x, p.y, n * texel / 2, 0, mask), .42);
      }
      roadDot(p.x, p.y, Math.max(0, detail - 1), '#' + colour.toString(16));
    }
    // Fine broken wheel marks and irregular verge stones give the route a
    // drawn surface. Bridges get their own continuous deck and cross-planks.
    for (let n = 3; n < samples.length - 3; n += 5) {
      const p = samples[n], a = samples[n - 3], b = samples[n + 3];
      const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      roadCtx.globalAlpha = .35;
      roadDot(Math.round(p.x - (b.y - a.y) / length * detail), Math.round(p.y + (b.x - a.x) / length * detail), 0, '#594d3b');
    }
    roadCtx.globalAlpha = 1;
    let inMountains = false;
    for (let n = 0; n < samples.length; n++) {
      const p = samples[n], water = waterIndices[p.y * width + p.x], river = water >= 16 && water <= 23;
      const mountain = !river && materialAt(p.x, p.y) === 'mountains';
      if (mountain && !inMountains) interactions.mountainPass++;
      inMountains = mountain;
      if (!river && materialAt(p.x, p.y) === 'swamp' && n % (2 * detail) === 0) {
        const a = samples[Math.max(0, n - 2)], b = samples[Math.min(samples.length - 1, n + 2)];
        const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
        for (let d = -detail; d <= detail; d++) roadDot(Math.round(p.x - (b.y - a.y) / length * d), Math.round(p.y + (b.x - a.x) / length * d), 0, '#928978');
      }
    }
    const spans = bridgeSpans(samples, p => waterIndices[p.y * width + p.x], detail);
    bridges += spans.length;
    for (const [n, span] of spans.entries()) paintBridge(span, detail, roadDot, {
      art: ART[`terrain-bridge-${(n + bridges + map.seed) % 8}`], context: roadCtx, origin: { x: bx, y: by } });
  }
  // Compose playable terrain and imported hinterland instead of legacy scatter.
  if(roadsOnly){
    const roadTexture=PIXI.Texture.from(roadCanvas);
    return {roadTexture,roadClearance,roads,borderBounds:{minX:bounds.minX+bx*texel/1576,minY:bounds.minY+by*texel/516}};
  }
  // Coasts
  // use terrain profiles rather than isolated legacy cliff/rock stamps.
  const compositionStart=performance.now();
  const composition = composeTerrainLandscape({ map, art: ART, pixel, world, detail, islandStyle, settlementPlans, monsterZones: !!sites, isolatedMonsterBorders,
    // Road corridors stencil individual pixels in reliefSpriteTextures; they
    // create passes instead of rejecting an entire connecting landscape piece.
    legal: fitsLand });
  timings.composition=performance.now()-compositionStart;
  const hinterland=background ?? composeHinterland({map,art:ART,pixel,world,detail,sampleBackground,
    legal:prop=>{
      const glyph=ART[prop.kind];let painted=0,outside=0,dry=0;
      for(let y=0;y<glyph.rows.length;y+=2)for(let x=0;x<glyph.rows[y].length;x+=2){
        if(glyph.rows[y][x]==='.')continue;
        const px=prop.left+x,py=prop.top+y;
        if(px<0||py<0||px>=width||py>=height)return false;
        const i=py*width+px;painted++;
        if(land[i]&&!waterIndices[i])dry++;
        if(regionIds[i]<0)outside++;
        if(siteReliefContains(settlementPlans,px,py))return false;
      }
      return painted>0&&dry/painted>.96&&outside/painted>(prop.barrier?.72:.98);
    }});
  props.splice(0,props.length,...towns,...hinterland.props,...composition.props);
  if (!background) hinterland.stats.mass=paintHinterlandMass({props:hinterland.props,art:ART,width,height,colours,land,waterIndices,regionIds,detail,seed:map.seed,noise,mixColour});
  const foundations = paintTerrainFoundations({ props, art: ART, pixel, surfaces, materialAt, land, waterIndices,
    colours, width, height, detail, noise, seed: map.seed, mixColour, islandStyle });
  const divisions = paintRegionDivisions({ map, pixel, width, height, detail, land, regionIds,
    waterIndices, waterBase, colours, groundBank, noise, mixColour });
  paintSettlementSites(settlementPlans, { width, height, colours, waterIndices, regionIds, map, surfaces, mixColour, detail: siteDetail, dot: roadDot });
  interactions.bridge = bridges;
  interactions.rockyShore = props.filter(p => p.kind.startsWith('cliff')).length;
  interactions.softShore = map.geography.coasts.filter(c => !c.rocky).length;
  const roadTexture = PIXI.Texture.from(roadCanvas); roadTexture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
  roadTexture.baseTexture.mipmap = PIXI.MIPMAP_MODES.OFF;
  const borderCtx = borderCanvas.getContext('2d');
  for (const edge of map.edges) {
    // Shared borders are illustrated landforms in the base bake. No dry outline.
    if (edge.regions.length === 2) continue;
    borderCtx.fillStyle = '#534a37';
    borderCtx.globalAlpha = .64;
    const points = edge.points.map(pixel);
    for (let j = 1; j < points.length; j++) {
      const a = points[j - 1], b = points[j], steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
      for (let s = 0; s <= steps; s++) {
        const x = Math.floor(a.x + (b.x - a.x) * s / steps), y = Math.floor(a.y + (b.y - a.y) * s / steps);
        // Gameplay divisions remain visible across water-rich Island regions.
        const wet = waterIndices[y * width + x] > 0;
        borderCtx.globalAlpha = wet ? .4 : .7;
        if ((!wet && edge.regions.length === 1) || (x + y) % 5 < 3) borderCtx.fillRect(x - bx, y - by, 1, 1);

      }
    }
  }
  const borderTexture = PIXI.Texture.from(borderCanvas); borderTexture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
  borderTexture.baseTexture.mipmap = PIXI.MIPMAP_MODES.OFF;
  const borderBounds = { minX: bounds.minX + bx * texel / 1576, minY: bounds.minY + by * texel / 516 };
  timings.total=performance.now()-started;
  return {timings,settlementPlans,props,composition,hinterland,foundations,divisions,roads,bridges,roadTexture,roadClearance,borderTexture,borderBounds};
}
