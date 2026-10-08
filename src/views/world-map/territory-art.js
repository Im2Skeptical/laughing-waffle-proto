import { CONTROLLER_COLOURS } from './constants.js';
import { RELATION_STYLES, drawRelationshipLine } from './relationships.js';
import { CIV_CONTENT_TUNING } from '../../model/detailed-settlements.js';
import { createText } from '../settlement-view-primitives.js';
import { TEXT_STYLES } from '../settlement-theme.js';
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

export function addTerritoryBorder(parent, points, { player, monster, selected, highlighted, relationship, relationshipStyle = RELATION_STYLES.empty, controller }) {
  const border = new PIXI.Graphics();
  border.label = selected ? 'selected-region-border' : player ? 'player-region-border' : 'region-border';
  border.eventMode = 'none';
  const colour = monster ? 0xc15165 : player ? 0xe4c271 : CONTROLLER_COLOURS[controller] ?? 0x8c9184;
  const trace = (width, tint, alpha=1) => border.lineStyle(width,tint,alpha).drawPolygon(points);
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
    for (let i = 0; i < points.length; i += 2) {
      const next = (i + 2) % points.length;
      drawRelationshipLine(border, {x:points[i],y:points[i+1]}, {x:points[next],y:points[next+1]}, relationshipStyle);
    }
    if (relationshipStyle.innerColour) trace(1.5, relationshipStyle.innerColour);
    border.lineStyle(0).beginFill(relationshipStyle.colour, relationshipStyle.fillAlpha).drawPolygon(points).endFill();
  }
  if (highlighted || selected) {
    const accent = selected ? 0x98e8f2 : 0xf5d077;
    trace(17,accent,.12);
    trace(10,0x102b35,.95);
    trace(6,accent);
    trace(2,selected ? 0xedffff : 0xfff2c0);
    border.lineStyle(0).beginFill(accent,selected ? .09 : .05).drawPolygon(points).endFill();
  }
  parent.addChild(border);
  return border;
}

export function addMonsterMarker(parent, point, monster) {
  const marker = new PIXI.Container();
  marker.label = 'monster-marker';
  marker.eventMode = 'none';
  marker.position.set(point.x,point.y);
  addRegionLandmark(marker,'monster-lair',{x:-53,y:-89,width:106,height:106});
  parent.addChild(marker);
  const interval = CIV_CONTENT_TUNING.monsterExpansionPulses;
  const remaining = Math.max(0,interval - monster.ageMoons);
  const countdown = new PIXI.Container();
  countdown.label = 'monster-spread-countdown';
  countdown.eventMode = 'none';
  countdown.position.set(point.x, point.y + 18);
  countdown.addChild(new PIXI.Graphics().lineStyle(1,0x99515d,.9)
    .beginFill(0x130f18,.94).drawRoundedRect(-44,0,88,32,5).endFill());
  const progress=new PIXI.Graphics();
  for(let pulse=0;pulse<interval;pulse++) progress.lineStyle(1,0xcda49d).beginFill(pulse<monster.ageMoons?0xff886e:0x30202b).drawCircle(-12+pulse*12,7,3).endFill();
  countdown.addChild(progress);
  const label = createText(`${remaining} / ${interval}`, {...TEXT_STYLES.chip,fontSize:16,fill:remaining<=1?0xff886e:0xffddbc}, 0,13,.5);
  label.label = 'monster-spread-moons';
  countdown.addChild(label);
  parent.addChild(countdown);
  return marker;
}
