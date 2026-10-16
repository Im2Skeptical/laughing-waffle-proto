import { getChronicleTexture, getArtRevision } from './chronicle-art.js';

// Named TexturePacker sprites only; the production renderer has no sheet coordinates.
export const getVassalClassArtRevision = getArtRevision;
const classTexture = id => getChronicleTexture(`vassal-class-v1/${id}.png`);

// `crest` defaults to the founder crest; tabs and chips pass crest:false for the bare frame.
export function createClassPortraitArt(classId, {size, founder = false, texture = null, crest = founder} = {}) {
  const border = classTexture(classId);
  if (!border) return null;
  const root = new PIXI.Container();
  const h = size * border.height / border.width;
  const painting = founder ? classTexture(`${classId}-founder`) : texture;
  if (painting) {
    const sprite = new PIXI.Sprite(painting);
    sprite.position.set(size*.13,h*.14);sprite.width=size*.74;sprite.height=h*.74;
    const mask = new PIXI.Graphics().beginFill(0xffffff);
    if (classId === 'warrior') mask.drawCircle(size*.5,h*.505,size*.357);
    else mask.moveTo(size*.212,h*.835).lineTo(size*.212,h*.425)
      .quadraticCurveTo(size*.212,h*.195,size*.5,h*.195)
      .quadraticCurveTo(size*.788,h*.195,size*.788,h*.425).lineTo(size*.788,h*.835).closePath();
    mask.endFill();root.addChild(sprite,mask);sprite.mask=mask;
  }
  const frame = new PIXI.Sprite(border);frame.width=size;frame.height=h;root.addChild(frame);
  if (crest) {
    const sun = new PIXI.Sprite(classTexture('crest'));sun.position.set(size*.34,-size*.105);sun.width=size*.32;sun.height=size*.32;root.addChild(sun);
  }
  root.hitArea = new PIXI.Rectangle(0,0,size,h);
  return root;
}
