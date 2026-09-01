import { drawDeterministicBust } from "./settlement-elder-bust-view.js";

export function createVassalPortraitView(portrait, {
  size = 96,
  borderColor,
} = {}) {
  const root = new PIXI.Container();
  drawDeterministicBust(root, { x: 0, y: 0, width: size, height: size }, portrait, {
    outlineColor: borderColor,
  });
  root.hitArea = new PIXI.Rectangle(0, 0, size, size);
  return root;
}
