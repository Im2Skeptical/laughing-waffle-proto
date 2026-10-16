import { getChronicleTexture } from './chronicle-art.js';
import { getStoneTexture, paintRelicPanel, RELIC } from './chronicle-skin.js';
import { FRAME_PREFIX, PANEL_FRAMES, SOCKET_FRAME, WINDOW_FRAME } from './painted-frame-spec.js';

// Painted dark-fantasy frames for the founder class picker. Each helper draws the
// painted art when its atlas textures are ready and the vector paintRelicPanel
// chrome otherwise (still loading, or a frame missing from the atlas), so a bad
// download never leaves the picker unframed. `tint` multiplies the neutral stone
// and brass; `fill` is the class-coloured stone behind the transparent aperture.
const WHITE = 0xffffff;
const texture = name => {
  const tex = getChronicleTexture(`${FRAME_PREFIX}${name}.png`);
  return tex?.baseTexture?.valid && tex.valid !== false ? tex : null;
};

function underlay(parent, x, y, w, h, fill, alpha = 1, radius = 6) {
  const g = new PIXI.Graphics();
  g.beginTextureFill({ texture: getStoneTexture(), color: fill, alpha }).drawRoundedRect(x, y, w, h, radius).endFill();
  g.eventMode = 'none'; parent.addChild(g);
  return g;
}

// All rectangular frames share fixed corners and tiled edges. No carved motif
// is stretched, even on the long class-attribute panel.
function rim(parent, w, h, unit, tint) {
  const textures = Object.fromEntries(Object.entries(WINDOW_FRAME.pieces).map(([key, name]) => [key, texture(name)]));
  if (Object.values(textures).some(entry => !entry)) return null;
  const sprites = [], corner = WINDOW_FRAME.corner * unit;
  const place = (sprite, x, y) => {
    sprite.position.set(x, y); sprite.scale.set(unit); sprite.tint = tint;
    sprite.eventMode = 'none'; parent.addChild(sprite); sprites.push(sprite);
  };
  const tile = (key, x, y, width, height) => place(new PIXI.TilingSprite(textures[key], width / unit, height / unit), x, y);
  tile('edgeTop', corner, 0, w - 2 * corner, textures.edgeTop.height * unit);
  tile('edgeBottom', corner, h - textures.edgeBottom.height * unit, w - 2 * corner, textures.edgeBottom.height * unit);
  tile('edgeLeft', 0, corner, textures.edgeLeft.width * unit, h - 2 * corner);
  tile('edgeRight', w - textures.edgeRight.width * unit, corner, textures.edgeRight.width * unit, h - 2 * corner);
  place(new PIXI.Sprite(textures.cornerTl), 0, 0);
  place(new PIXI.Sprite(textures.cornerTr), w - corner, 0);
  place(new PIXI.Sprite(textures.cornerBl), 0, h - corner);
  place(new PIXI.Sprite(textures.cornerBr), w - corner, h - corner);
  return value => sprites.forEach(sprite => { sprite.tint = value; });
}

export function addPaintedPanel(parent, kind, w, h, { tint = WHITE, fill = null, fillAlpha = 1, fallbackStroke = RELIC.brass, fallbackFill = RELIC.stone } = {}) {
  const spec = PANEL_FRAMES[kind];
  const node = new PIXI.Container(); node.eventMode = 'none'; parent.addChild(node);
  if (fill != null) underlay(node, spec.fillInset, spec.fillInset, w - 2 * spec.fillInset, h - 2 * spec.fillInset, fill, fillAlpha);
  const metalTint = kind === 'tabSelected' ? 0xffdc91 : kind === 'tabLocked' ? 0x777b79 : tint;
  const setTint = rim(node, w, h, spec.unit, metalTint);
  if (setTint) return { node, painted: true, setTint };
  const g = new PIXI.Graphics(); paintRelicPanel(g, 0, 0, w, h, fill ?? fallbackFill, fallbackStroke, 2, fillAlpha);
  node.addChild(g);
  return { node, painted: false, setTint() {} };
}

// The hero uses the same rectangular carving at a larger, readable scale.
export function addPaintedBanner(parent, w, h, options = {}) {
  return addPaintedPanel(parent, 'banner', w, h, { fill: RELIC.stone, ...options });
}

export function addPaintedSocket(parent, cx, cy, diameter, { tint = WHITE, fill = RELIC.shadow } = {}) {
  const tex = texture(SOCKET_FRAME.file);
  const node = new PIXI.Container(); node.eventMode = 'none'; node.position.set(cx, cy); parent.addChild(node);
  const g = new PIXI.Graphics();
  g.beginFill(fill, .92).drawCircle(0, 0, diameter / 2 - 4).endFill();
  node.addChild(g);
  if (!tex) { g.lineStyle(2, RELIC.brass, .8).drawCircle(0, 0, diameter / 2); return { node, painted: false, setTint() {} }; }
  const ring = new PIXI.Sprite(tex); ring.anchor.set(.5); ring.width = ring.height = diameter; ring.tint = tint;
  node.addChild(ring);
  return { node, painted: true, setTint: value => { ring.tint = value; } };
}

// The window: four corner caps and four tiled carved edge strips. Corner art keeps its size; only the tiled edges lengthen.
// backParent (optional) receives the stone fill so page content can sit between it and the rim.
export function addPaintedWindow(parent, w, h, { tint = WHITE, fill = RELIC.night, backParent = null } = {}) {
  const spec = WINDOW_FRAME;
  const node = new PIXI.Container(); node.eventMode = 'none'; parent.addChild(node);
  const back = new PIXI.Graphics(); (backParent ?? node).addChild(back);
  const setTint = rim(node, w, h, spec.unit, tint);
  if (!setTint) {
    paintRelicPanel(back, 0, 0, w, h, fill, RELIC.brass, 3);
    return { node, painted: false, setTint() {}, inset: 4 };
  }
  back.beginTextureFill({ texture: getStoneTexture(), color: fill }).drawRoundedRect(8, 8, w - 16, h - 16, 10).endFill();
  return { node, painted: true, inset: spec.inset, setTint };
}
