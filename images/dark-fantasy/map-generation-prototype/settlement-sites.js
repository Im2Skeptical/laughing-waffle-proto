import { decorationRandom } from './generator.js';

// Canonical texture-space site planning. Camera and zoom never enter this model.
export function planSettlementSites({ map, pixel, world, width, height, land, waterIndices, regionIds, detail }) {
  detail *= .5;
  const sites = [];
  const dry = (x, y, id) => x >= 0 && y >= 0 && x < width && y < height
    && land[Math.floor(y) * width + Math.floor(x)] && !waterIndices[Math.floor(y) * width + Math.floor(x)]
    && map.regions[regionIds[Math.floor(y) * width + Math.floor(x)]]?.id === id;
  for (const [bi, biome] of ['plains', 'forest', 'islands', 'swamp', 'mountains'].entries()) {
    let best = null;
    for (const region of map.regions.filter(r => r.biome === biome)) {
      const outline = region.outline.map(pixel), centre = pixel(region.centre);
      for (let y = Math.ceil(Math.min(...outline.map(p => p.y))); y <= Math.max(...outline.map(p => p.y)); y += 5 * detail)
        for (let x = Math.ceil(Math.min(...outline.map(p => p.x))); x <= Math.max(...outline.map(p => p.x)); x += 5 * detail) {
          if (!dry(x, y, region.id)) continue;
          const rx = 23 * detail, ry = 16 * detail;
          let fits = true;
          for (let dy = -ry; dy <= ry && fits; dy += 2 * detail) for (let dx = -rx; dx <= rx; dx += 2 * detail)
            if ((dx / rx) ** 2 + (dy / ry) ** 2 < 1 && !dry(x + dx, y + dy, region.id)) { fits = false; break; }
          if (!fits) continue;
          // Prefer a dry coastal shoulder with room for an inland landform beside it.
          let reliefRoom = 0;
          if (biome === 'islands') for (let n=0;n<8;n++) {
            const a=n*Math.PI/4, px=x+Math.cos(a)*40*detail, py=y+Math.sin(a)*32*detail;
            let room=0;
            for (const dx of [-12,0,12]) for (const dy of [-10,0,10]) if(dry(px+dx*detail,py+dy*detail,region.id)) room++;
            reliefRoom=Math.max(reliefRoom,room/9);
          }
          const score = Math.hypot(x - centre.x, (y - centre.y) * 1.3) * (biome === 'islands' ? .25 : 1)
            - reliefRoom*32*detail + decorationRandom(map.seed, x * 9173 ^ y * 673) * 4;
          if (!best || score < best.score) best = { x, y, rx, ry, score, biome, regionId: region.id, point: world(x, y), kind: bi === 0 || bi === 3 ? 'player' : 'neutral', buildings: [], streets: [] };
        }
    }
    if (best) sites.push(best);
  }
  return sites;
}

export function siteContains(sites, x, y, margin = 1) {
  return sites.some(s => ((x - s.x) / (s.rx * margin)) ** 2 + ((y - s.y) / (s.ry * margin)) ** 2 < 1);
}

const segmentDistance = (x,y,a,b) => {
  const dx=b.x-a.x,dy=b.y-a.y,den=dx*dx+dy*dy;
  const t=den?Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/den)):0;
  return Math.hypot(x-a.x-t*dx,y-a.y-t*dy);
};

// Continuous worked-ground field follows plots, court and lanes, not a disc.
export function settlementGroundWeight(site,x,y) {
  const u=site.rx/23;
  let weight=site.court?Math.max(0,1-Math.hypot((x-site.court.x)/(12*u),(y-site.court.y)/(9*u))):0;
  for(const b of site.buildings) weight=Math.max(weight,Math.max(0,1-Math.hypot((x-b.x)/(b.w*.8+4*u),(y-b.y)/(b.h+4*u))));
  for(const path of site.streets) for(let n=1;n<path.length;n++)
    weight=Math.max(weight,Math.max(0,1-segmentDistance(x,y,path[n-1],path[n])/(5*u))*.7);
  if(site.apron) weight=Math.max(weight,Math.max(0,1-segmentDistance(x,y,site.entrance,site.apron)/(5*u))*.65);
  return weight;
}

// Woodland, grassland and island scenery may meet an irregular town fringe,
// while buildings, court and approach remain protected. Wetland and mountain
// reservations retain their current shape.
export function siteReliefContains(sites, x, y) {
  return sites.some(s => {
    if (!s.buildings.length) return siteContains([s],x,y,.9);
    const unit=s.rx/23;
    if(s.apron && segmentDistance(x,y,s.entrance,s.apron)<3*unit) return true;
    if(s.buildings.some(b=>x>b.x-b.w*.6-unit && x<b.x+b.w*.6+unit
      && y>b.y-b.h-unit*2 && y<b.y+b.h*.55+unit)) return true;
    if(s.court && Math.hypot((x-s.court.x)/(7*unit),(y-s.court.y)/(5*unit))<1) return true;
    return s.streets.some(path=>path.slice(1).some((b,i)=>{
      const a=path[i],dx=b.x-a.x,dy=b.y-a.y,den=dx*dx+dy*dy;
      const t=den?Math.max(0,Math.min(1,((x-a.x)*dx+(y-a.y)*dy)/den)):0;
      return Math.hypot(x-a.x-t*dx,y-a.y-t*dy)<2*unit;
    }));
  });
}

// Plan one entrance and a compact neighbourhood before inter-town routing.
export function layOutSettlements(sites, { detail, dry, world, seed }) {
  detail *= .5;
  for (const site of sites) {
    site.buildings = []; site.streets = [];
    const random = n => decorationRandom(seed, Number(site.regionId.slice(1)) * 3571 + n * 83);
    const neighbours = sites.filter(s => s !== site && s.biome !== 'islands')
      .sort((a, b) => Math.hypot(a.x - site.x, a.y - site.y) - Math.hypot(b.x - site.x, b.y - site.y));
    const other = neighbours[0];
    const angle = other ? Math.atan2((other.y - site.y) / site.ry, (other.x - site.x) / site.rx) : 1.2;
    site.entrance = { x: Math.round(site.x + Math.cos(angle) * site.rx * .88), y: Math.round(site.y + Math.sin(angle) * site.ry * .88) };
    // A short protected apron leaves a real gap in the surrounding vegetation.
    site.apron={x:site.entrance.x+Math.cos(angle)*12*detail,y:site.entrance.y+Math.sin(angle)*12*detail};
    while(!dry(site.apron.x,site.apron.y,site.regionId) && Math.hypot(site.apron.x-site.entrance.x,site.apron.y-site.entrance.y)>detail) {
      site.apron.x=(site.apron.x+site.entrance.x)/2; site.apron.y=(site.apron.y+site.entrance.y)/2;
    }
    site.surroundings = { approachAngle:angle, ground:site.biome==='forest'?'leaf-litter clearing':site.biome==='plains'?'worn grass and field margins':site.biome==='swamp'?'raised peat and reed edge':site.biome==='mountains'?'stone terrace and scree':'volcanic soil and scrub', placed:0 };
    const at = (u, v) => ({ x: site.x + u * detail, y: site.y + v * detail });
    const safe = p => dry(p.x, p.y, site.regionId);
    const street = points => {
      const valid = points.every(safe) && points.slice(1).every((b, i) => {
        const a = points[i], steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y));
        for (let n = 0; n <= steps; n++) {
          const t = steps ? n / steps : 0;
          if (!safe({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })) return false;
        }
        return true;
      });
      if (valid) site.streets.push(points);
    };
    // An offset civic court and a crescent lane replace the rectangular street grid.
    site.court = at(9, 3);
    street([site.entrance, { x: (site.entrance.x + site.court.x) / 2 + detail,
      y: (site.entrance.y + site.court.y) / 2 }, site.court]);
    street([at(-17, 3), at(-8, 3), at(1, 4), site.court]);
    const plots = [
      [0,-5,'civic',17], [-9,-6,'pair',7], [9,-5,'pair',7],
      [-16,-3,'house',5.8], [16,-2,'workshop',7],
      [-13,4,'pair',7], [-5,9,'house',6], [3,10,'pair',7], [11,7,'house',6],
      [-7,-11,'house',5.6], [1,-12,'house',5.6], [9,-10,'house',5.6],
      [-19,2,'house',5.2], [18,5,'house',5.2], [-12,10,'house',5.2],
      [-6,0,'house',5.8], [3,1,'pair',6.8], [-3,6,'house',5.2],
    ];
    // Materials and silhouette differ: a narrow terrace, a loose woodland crescent,
    // or compact raised wetland court. The same plan survives every zoom level.
    const stretch = site.biome === 'mountains' ? .78 : site.biome === 'forest' ? .9 : 1;
    for (const [n, [u,v,kind,size]] of plots.entries()) {
      const p = at(u + (random(n) - .5) * 1.6, v * stretch + (random(n + 40) - .5));
      const role = kind === 'civic' ? (site.kind === 'player' ? 'hall' : 'market') : kind;
      const w = size * detail, h = w * .6;
      const entranceDistance = Math.hypot(p.x - site.entrance.x, p.y - site.entrance.y);
      if (entranceDistance < 5 * detail) continue;
      if (![-1,0,1].every(dx => [-1,0,1].every(dy => safe({ x:p.x + dx*w/2,y:p.y + dy*h/2 })))) continue;
      site.buildings.push({ ...p,w,h,role,point:world(p.x,p.y),biome:site.biome });
    }
    if ([-1,0,1].every(dx => [-1,0,1].every(dy => safe({x:site.entrance.x+dx*3.5*detail,y:site.entrance.y+dy*1.5*detail}))))
      site.buildings.push({ ...site.entrance,w:7*detail,h:3*detail,role:'gate',point:world(site.entrance.x,site.entrance.y),biome:site.biome });
    site.enclosure = Array.from({ length: 21 }, (_, n) => {
      const a = angle + .24 + n / 20 * (Math.PI * 2 - .48);
      const irregular = 1 + (random(n + 90) - .5) * .09;
      return { x:site.x + Math.cos(a)*site.rx*.84*irregular, y:site.y + Math.sin(a)*site.ry*.86*irregular };
    });
  }
}

export function paintSettlementSites(sites, { width, height, colours, waterIndices, regionIds, map, surfaces, mixColour, detail, dot }) {
  detail *= .5;
  for (const site of sites) {
    const dry = (x, y) => x >= 0 && y >= 0 && x < width && y < height && !waterIndices[y * width + x]
      && map.regions[regionIds[y * width + x]]?.id === site.regionId;
    // Blend the original biome material into worked ground, with irregular,
    // feathered margins. No imported ground plates or blanket biome tint.
    for (let y = Math.floor(site.y - site.ry * 1.8); y <= site.y + site.ry * 1.8; y++)
      for (let x = Math.floor(site.x - site.rx * 1.8); x <= site.x + site.rx * 1.8; x++) {
        if (!dry(x, y)) continue;
        const ground = settlementGroundWeight(site,x,y);
        if(ground<=0) continue;
        const noise = decorationRandom(map.seed, x * 9173 ^ y * 673);
        const court = Math.hypot((x - site.court.x) / (6 * detail), (y - site.court.y) / (4 * detail));
        const strength = Math.min(1,ground*(.9+noise*.2))*.68;
        const quietGround = {plains:0x8c7955,forest:0x66654c,islands:0x7b7c68,swamp:0x62575f,mountains:0x78665c}[site.biome];
        colours[y * width + x] = mixColour(colours[y * width + x],quietGround,strength);
        if (court < 1 + (noise - .5) * .25) {
          const paving = site.biome === 'swamp' ? 0x9b8a9b : site.biome === 'mountains' ? 0xb5a596 : 0xc0b18a;
          colours[y * width + x] = mixColour(colours[y * width + x], paving, .45);
        }
        const i = y * width + x;
        colours[i] = mixColour(colours[i], surfaces.ground(site.biome, x, y), strength * .18);
      }
    const ink = site.biome === 'swamp' ? ['#423a3d', '#877767'] : site.biome === 'mountains' ? ['#66544f', '#aa9180'] : ['#6b5c43', '#ad9a75'];
    for (const path of site.streets) for (let n = 1; n < path.length; n++) {
      const a = path[n - 1], b = path[n], length = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y));
      for (let k = 0; k <= length; k++) {
        const t = length ? k / length : 0, x = Math.round(a.x + (b.x - a.x) * t), y = Math.round(a.y + (b.y - a.y) * t);
        if (!dry(x, y)) continue;
        dot(x, y, 0, k % 5 === 0 ? ink[0] : ink[1]);

      }
    }
    // Broken stone banks / hedges / timber edge bind the town into a readable
    // footprint, with a real opening at the approach. Paint into terrain pixels.
    for (let n = 1; n < site.enclosure.length; n++) {
      const a = site.enclosure[n-1], b = site.enclosure[n];
      const length = Math.ceil(Math.hypot(b.x-a.x,b.y-a.y));
      for (let k=0;k<=length;k++) {
        const t=length?k/length:0, x=Math.round(a.x+(b.x-a.x)*t), y=Math.round(a.y+(b.y-a.y)*t);
        if (!dry(x,y)) continue;
        if (site.biome === 'plains' || site.biome === 'forest') { if (n % 4 !== 0 || k % 3 === 0) continue; }
        else if (n > 3 && n < 9 && k % 3 === 0) continue;
        const edge = site.biome === 'mountains' ? 0x776158 : site.biome === 'swamp' ? 0x554850 : 0x6c694d;
        colours[y*width+x]=mixColour(colours[y*width+x],edge,.7);
        if (dry(x,y+1)) colours[(y+1)*width+x]=mixColour(colours[(y+1)*width+x],0x38332b,.35);
      }
    }
    for (const b of site.buildings) {
      for (let y = Math.floor(b.y - b.h / 3); y <= b.y + b.h / 2; y++) for (let x = Math.floor(b.x - b.w / 2); x <= b.x + b.w / 2; x++) {
        if (!dry(x, y)) continue;
        const i = y * width + x, base = {plains:0x8c7955,forest:0x66654c,islands:0x7b7c68,swamp:0x62575f,mountains:0x78665c}[site.biome];
        colours[i] = mixColour(colours[i], base, .3);
        if (y >= b.y) colours[i] = mixColour(colours[i], 0x322d29, .38);
        if (site.biome === 'mountains' && y === Math.floor(b.y + b.h / 2)) dot(x, y, 0, '#76605a');
      }
    }
  }
}
