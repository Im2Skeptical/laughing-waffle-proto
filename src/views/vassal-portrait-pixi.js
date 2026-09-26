import { drawDeterministicBust } from "./settlement-elder-bust-view.js";
import { getChronicleTexture } from './chronicle-art.js';
import { paintRelicPanel, RELIC } from './chronicle-skin.js';

export function getVassalPortraitStage(age) {
  const years = Number.isFinite(age) ? Math.max(0, Math.floor(age)) : null;
  if (years == null) return "middle";
  if (years <= 35) return "youth";
  if (years >= 55) return "elder";
  return "middle";
}

export function createVassalPortraitView(portrait, {
  size = 96,
  borderColor,
  shape = "square",
  age = null,
} = {}) {
  const root = new PIXI.Container();
  // A stable art assignment from the already serialized portrait descriptor.
  const key=JSON.stringify(portrait??{});
  let index=0; for(let i=0;i<key.length;i++) index=(index*31+key.charCodeAt(i))>>>0;
  const portraitId=`legacy-0${index%8+1}`;
  const stage=getVassalPortraitStage(age);
  const texture=getChronicleTexture(`vassal-portraits-v1/${portraitId}${stage === "middle" ? "" : `-${stage}`}.png`);
  const ink = borderColor ?? RELIC.brass;
  if (shape === "circle") {
    const radius = size / 2;
    if (texture) {
      const sprite = new PIXI.Sprite(texture);
      sprite.width = sprite.height = size;
      const mask = new PIXI.Graphics();
      mask.beginFill(0xffffff).drawCircle(radius, radius, radius - 3).endFill();
      sprite.mask = mask;
      root.addChild(sprite, mask);
    } else {
      drawDeterministicBust(root, { x: 0, y: 0, width: size, height: size }, portrait, {
        outlineColor: ink,
      });
    }
    const ring = new PIXI.Graphics();
    ring.lineStyle(3.5, ink, 1).drawCircle(radius, radius, radius - 2);
    ring.lineStyle(1.5, 0x111714, 0.55).drawCircle(radius, radius, radius - 5);
    root.addChild(ring);
    root.hitArea = new PIXI.Circle(radius, radius, radius);
    return root;
  }
  if(texture) {
    const frame=new PIXI.Graphics();
    paintRelicPanel(frame,0,0,size,size,RELIC.night,ink,3);
    const sprite=new PIXI.Sprite(texture);sprite.position.set(5,5);sprite.width=sprite.height=size-10;
    root.addChild(frame,sprite);
  } else drawDeterministicBust(root, { x: 0, y: 0, width: size, height: size }, portrait, {
    outlineColor: ink,
  });
  root.hitArea = new PIXI.Rectangle(0, 0, size, size);
  return root;
}
