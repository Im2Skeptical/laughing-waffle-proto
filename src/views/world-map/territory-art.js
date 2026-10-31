import { CONTROLLER_COLOURS } from './constants.js';
import { RELATION_STYLES, drawRelationshipLine } from './relationships.js';
import { addRegionLandmark, getRegionLandmarkTexture } from '../chronicle-art.js';

// Fixed map-space decoration. No simulation RNG or time-dependent geometry.
export function addMonsterGround(parent, points) {
  const ground = new PIXI.Container();
  ground.label = 'monster-ground';
  ground.eventMode = 'none';
  const mask = new PIXI.Graphics().beginFill(0xffffff).drawPolygon(points).endFill();
  mask.eventMode = 'none';
  const ink = new PIXI.Graphics().beginFill(0x110e16, .72).drawPolygon(points).endFill();
  const xs = points.filter((_, i) => i % 2 === 0), ys = points.filter((_, i) => i % 2 === 1);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  ground.addChild(ink);
  const texture = getRegionLandmarkTexture('monster-ground');
  if (texture?.baseTexture.valid) {
    const tile = new PIXI.TilingSprite(texture,maxX-minX,maxY-minY);
    tile.position.set(minX,minY);
    tile.tileScale.set(.75);
    tile.tilePosition.set(-minX,-minY);
    tile.eventMode = 'none';
    tile.label = 'monster-ground-painting';
    ground.addChild(tile);
  }
  parent.addChild(ground, mask);
  ground.mask = mask;
  return ground;
}

// Split at collinear vertices before cancelling shared allegiance edges, including
// authored maps where one region subdivides its neighbour's edge.
// Borders depend only on each territory's id, allegiance and points, which
// change on ownership or layout, not on every render. Results are read-only.
const boundaryCache = new Map();
export function territoryBoundarySegments(territories) {
  const key = territories.map(t => `${t.regionId}|${t.monster ? 'm' : t.player ? 'p' : ''}|${t.points.join(',')}`).join(';');
  let result = boundaryCache.get(key);
  if (result) { boundaryCache.delete(key); boundaryCache.set(key, result); return result; }
  result = computeTerritoryBoundarySegments(territories);
  boundaryCache.set(key, result);
  if (boundaryCache.size > 8) boundaryCache.delete(boundaryCache.keys().next().value);
  return result;
}

export function computeTerritoryBoundarySegments(territories) {
  const allegiance = t => t.monster ? 'monster' : t.player ? 'player' : null;
  const vertices = territories.flatMap(t => t.points.reduce((a, x, i) => {
    if (i % 2 === 0) a.push({x, y:t.points[i+1]});
    return a;
  }, []));
  const key = p => `${Math.round(p.x*1e6)},${Math.round(p.y*1e6)}`;
  const edges = new Map();
  const result = new Map(territories.map(t => [t.regionId, []]));
  for (const t of territories) {
    for (let i=0;i<t.points.length;i+=2) {
      const a={x:t.points[i],y:t.points[i+1]}, j=(i+2)%t.points.length;
      const b={x:t.points[j],y:t.points[j+1]}, dx=b.x-a.x, dy=b.y-a.y, length=dx*dx+dy*dy;
      if (!length) continue;
      const cuts = new Map([[key(a),a],[key(b),b]]);
      for (const v of vertices) {
        const dot=(v.x-a.x)*dx+(v.y-a.y)*dy;
        if(dot>0 && dot<length && Math.abs((v.x-a.x)*dy-(v.y-a.y)*dx)<1e-6) cuts.set(key(v),v);
      }
      const ordered=[...cuts.values()].sort((u,v)=>(u.x-v.x)*dx+(u.y-v.y)*dy);
      for(let n=1;n<ordered.length;n++) {
        const from=ordered[n-1],to=ordered[n];
        const edgeKey=[key(from),key(to)].sort().join('|');
        if(!edges.has(edgeKey)) edges.set(edgeKey,[]);
        edges.get(edgeKey).push({t,from,to});
      }
    }
  }
  for(const entries of edges.values()) for(const {t,from,to} of entries) {
    if(allegiance(t) && entries.some(e=>e.t!==t && allegiance(e.t)===allegiance(t))) continue;
    result.get(t.regionId).push({from,to});
  }
  return result;
}

export function addTerritoryBorder(parent, points, { player, monster, selected, highlighted, relationship, relationshipStyle = RELATION_STYLES.empty, controller, boundarySegments }) {
  const border = new PIXI.Graphics();
  border.label = selected ? 'selected-region-border' : player ? 'player-region-border' : 'region-border';
  border.eventMode = 'none';
  const colour = monster ? 0xc15165 : player ? 0xe4c271 : CONTROLLER_COLOURS[controller] ?? 0x8c9184;
  const segments = boundarySegments ?? points.reduce((a,x,i)=>{
    if(i%2===0) a.push({from:{x,y:points[i+1]},to:{x:points[(i+2)%points.length],y:points[(i+3)%points.length]}});
    return a;
  },[]);
  const trace = (width, tint, alpha=1, full=false) => {
    border.lineStyle(width,tint,alpha);
    if(full) border.drawPolygon(points);
    else for(const {from,to} of segments) border.moveTo(from.x,from.y).lineTo(to.x,to.y);
  };
  if (player || monster) {
    trace(9,0x0c171b,.85);
    trace(5,colour,.85);
    trace(1.5,monster ? 0xffa080 : 0xffe6a2);
    if (player) border.lineStyle(0).beginFill(0xe4c271,.055).drawPolygon(points).endFill();
  } else trace(1.5,colour,.65);
  if (relationship === 'connected') {
    border.label = `${relationship}-region-border`;
    border.relationshipKind = relationshipStyle.kind;
    trace(relationshipStyle.width + 6, 0x0c171b, .95);
    for (const {from,to} of segments) drawRelationshipLine(border, from, to, relationshipStyle);
    if (relationshipStyle.innerColour) trace(1.5, relationshipStyle.innerColour);
    border.lineStyle(0).beginFill(relationshipStyle.colour, relationshipStyle.fillAlpha).drawPolygon(points).endFill();
  }
  if (highlighted || selected) {
    const accent = selected ? 0x98e8f2 : 0xf5d077;
    trace(17,accent,.12,true);
    trace(10,0x102b35,.95,true);
    trace(6,accent,1,true);
    trace(2,selected ? 0xedffff : 0xfff2c0,1,true);
    border.lineStyle(0).beginFill(accent,selected ? .09 : .05).drawPolygon(points).endFill();
  }
  parent.addChild(border);
  return border;
}

export function addMonsterMarker(parent, point, {art = true} = {}) {
  const marker = new PIXI.Container();
  marker.label = 'monster-marker';
  marker.eventMode = 'none';
  marker.position.set(point.x,point.y);
  if(art) addRegionLandmark(marker,'monster-lair',{x:-53,y:-89,width:106,height:106});
  parent.addChild(marker);
  return marker;
}
