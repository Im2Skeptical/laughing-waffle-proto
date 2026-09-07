import { drawDeterministicBust } from "./settlement-elder-bust-view.js";
import { atlasCell } from './chronicle-art.js';
import { paintRelicPanel, RELIC } from './chronicle-skin.js';

export function createVassalPortraitView(portrait, {
  size = 96,
  borderColor,
} = {}) {
  const root = new PIXI.Container();
  // A stable art assignment from the already serialized portrait descriptor.
  const key=JSON.stringify(portrait??{});
  let index=0; for(let i=0;i<key.length;i++) index=(index*31+key.charCodeAt(i))>>>0;
  const texture=atlasCell('vassal-portraits.png',index%8,4,2);
  if(texture) {
    const frame=new PIXI.Graphics();
    paintRelicPanel(frame,0,0,size,size,RELIC.night,borderColor??RELIC.brass,3);
    const sprite=new PIXI.Sprite(texture);sprite.position.set(5,5);sprite.width=sprite.height=size-10;
    root.addChild(frame,sprite);
  } else drawDeterministicBust(root, { x: 0, y: 0, width: size, height: size }, portrait, {
    outlineColor: borderColor,
  });
  root.hitArea = new PIXI.Rectangle(0, 0, size, size);
  return root;
}
