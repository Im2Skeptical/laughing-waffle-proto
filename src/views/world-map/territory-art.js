import { CONTROLLER_COLOURS } from './constants.js';
import { RELATION_COLOURS, drawRelationshipLine } from './relationships.js';
import { CIV_CONTENT_TUNING } from '../../model/detailed-settlements.js';
import { createText } from '../settlement-view-primitives.js';
import { TEXT_STYLES } from '../settlement-theme.js';

// Fixed map-space decoration. No simulation RNG or time-dependent geometry.
export function addMonsterGround(parent, points) {
  const ground = new PIXI.Container();
  ground.label = 'monster-ground';
  ground.eventMode = 'none';
  const mask = new PIXI.Graphics().beginFill(0xffffff).drawPolygon(points).endFill();
  mask.eventMode = 'none';
  const ink = new PIXI.Graphics().beginFill(0x110e16, .72).drawPolygon(points).endFill();
  ink.beginFill(0x651b2c, .18).drawPolygon(points).endFill();
  const xs = points.filter((_, i) => i % 2 === 0), ys = points.filter((_, i) => i % 2 === 1);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  for (let row = 0, y = minY + 18; y < maxY + 40; y += 62, row++) {
    for (let col = 0, x = minX - 20; x < maxX + 30; x += 70, col++) {
      const shift = (row * 19 + col * 31) % 27;
      const px = x + (row % 2) * 25, py = y + shift;
      const fissure = [px-18,py-24, px-6,py-9, px-11,py+1, px+7,py+14, px+12,py+29];
      for (const [width, colour, alpha] of [[9,0x100c13,.85],[3,0x933649,.65],[1,0xe77658,.7]]) {
        ink.lineStyle(width,colour,alpha).moveTo(fissure[0],fissure[1]);
        for (let i=2;i<fissure.length;i+=2) ink.lineTo(fissure[i],fissure[i+1]);
      }
      ink.lineStyle(2,0x933649,.65).moveTo(px-11,py+1).lineTo(px-25,py+7).lineTo(px-30,py+19);
      ink.lineStyle(0).beginFill(0x0a0d12,.65).drawEllipse(px+26,py-13,15,7).endFill();
    }
  }
  ground.addChild(ink);
  parent.addChild(ground, mask);
  ground.mask = mask;
  return ground;
}

export function addTerritoryBorder(parent, points, { player, monster, selected, highlighted, relationship, controller }) {
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
  if (RELATION_COLOURS[relationship]) {
    border.label = `${relationship}-region-border`;
    const accent = RELATION_COLOURS[relationship];
    trace(11, 0x0c171b, .95);
    if (relationship === 'adjacent') {
      trace(7, accent);
      trace(2, 0x0c171b);
    } else {
      for (let i = 0; i < points.length; i += 2) {
        const next = (i + 2) % points.length;
        drawRelationshipLine(border, {x:points[i],y:points[i+1]}, {x:points[next],y:points[next+1]}, relationship, 5);
      }
    }
    border.lineStyle(0).beginFill(accent, .12).drawPolygon(points).endFill();
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
  const marker = new PIXI.Graphics();
  marker.label = 'monster-marker';
  marker.eventMode = 'none';
  marker.position.set(point.x,point.y-13);
  marker.beginFill(0x080a10,.85).drawEllipse(0,18,34,12).endFill();
  // Broken stone teeth around a horned skull, readable even at overview scale.
  marker.lineStyle(2,0x773448).beginFill(0x241e2b)
    .drawPolygon([-29,18,-25,-5,-17,10,-10,-28,0,-9,15,-31,20,5,28,-3,32,18]).endFill();
  marker.lineStyle(2,0x251321).beginFill(0xc59485)
    .drawPolygon([-16,-7,-29,-24,-25,-2,-15,8,-11,22,11,22,15,8,25,-2,29,-24,16,-7,10,-15,-10,-15]).endFill();
  marker.lineStyle(0).beginFill(0x271322)
    .drawPolygon([-12,-4,-2,0,-5,7,-13,4])
    .drawPolygon([12,-4,2,0,5,7,13,4])
    .drawPolygon([0,6,-4,13,4,13]).endFill();
  marker.beginFill(0xff735a).drawCircle(-8,2,2).drawCircle(8,2,2).endFill();
  marker.lineStyle(2,0x542538).moveTo(-6,16).lineTo(-6,22).moveTo(0,16).lineTo(0,22).moveTo(6,16).lineTo(6,22);
  parent.addChild(marker);
  const interval = CIV_CONTENT_TUNING.monsterExpansionMoons;
  const remaining = interval - (monster.ageMoons % interval);
  const countdown = new PIXI.Container();
  countdown.label = 'monster-spread-countdown';
  countdown.eventMode = 'none';
  countdown.position.set(point.x, point.y + 18);
  countdown.addChild(new PIXI.Graphics().lineStyle(1,0x99515d,.9)
    .beginFill(0x130f18,.94).drawRoundedRect(-91,0,182,45,5).endFill());
  countdown.addChild(createText('SPREAD IN', {...TEXT_STYLES.chip,fontSize:12,fill:0xcda49d}, 0,3,.5));
  const label = createText(`${remaining} / ${interval} moons`, {...TEXT_STYLES.chip,fontSize:19,fill:remaining<=10?0xff886e:0xffddbc}, 0,19,.5);
  label.label = 'monster-spread-moons';
  countdown.addChild(label);
  parent.addChild(countdown);
  return marker;
}
