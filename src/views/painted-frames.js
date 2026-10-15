import { getChronicleTexture } from './chronicle-art.js';
import { getStoneTexture, paintRelicPanel, RELIC } from './chronicle-skin.js';
import { FRAME_PREFIX, NINE_SLICE_FRAMES, SOCKET_FRAME, WINDOW_FRAME } from './painted-frame-spec.js';

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

// A frame whose rim is stretched by NineSlicePlane. Returns { node, painted, setTint }.
export function addPaintedPanel(parent, kind, w, h, { tint = WHITE, fill = null, fillAlpha = 1, fallbackStroke = RELIC.brass, fallbackFill = RELIC.stone } = {}) {
  const spec = NINE_SLICE_FRAMES[kind];
  const tex = spec && texture(spec.file);
  const node = new PIXI.Container(); node.eventMode = 'none'; parent.addChild(node);
  if (!tex) {
    const g = new PIXI.Graphics(); paintRelicPanel(g, 0, 0, w, h, fill ?? fallbackFill, fallbackStroke, 2, fillAlpha);
    node.addChild(g);
    return { node, painted: false, setTint() {} };
  }
  if (fill != null) underlay(node, spec.fillInset, spec.fillInset, w - 2 * spec.fillInset, h - 2 * spec.fillInset, fill, fillAlpha);
  const [l, t, r, b] = spec.insets;
  const plane = new PIXI.NineSlicePlane(tex, l, t, r, b);
  // Corners keep their art size (spec.unit) while the rim stretches; width/height are in stored px.
  plane.width = w / spec.unit; plane.height = h / spec.unit; plane.scale.set(spec.unit);
  plane.tint = tint; plane.eventMode = 'none'; node.addChild(plane);
  return { node, painted: true, setTint: value => { plane.tint = value; } };
}

// The banner is the same nine-slice, but its aperture is a swallow-tail, so the
// class-coloured underlay follows the silhouette instead of filling a rectangle.
export function addPaintedBanner(parent, w, h, { tint = WHITE, fill = RELIC.stone } = {}) {
  const spec = NINE_SLICE_FRAMES.banner;
  const tex = texture(spec.file);
  const node = new PIXI.Container(); node.eventMode = 'none'; parent.addChild(node);
  const tail = 36, i = 10;
  // The painted tail's outer notch apex sits ~86 px above the bottom, so keep the underlay inside it.
  const shape = [i, i, w - i, i, w - i, h - 108, w / 2, h - 92, i, h - 108];
  const g = new PIXI.Graphics();
  if (!tex) {
    g.lineStyle(4, RELIC.gold, .95);
    g.beginTextureFill({ texture: getStoneTexture(), color: fill, alpha: .96 }).drawPolygon([0, 0, w, 0, w, h, w / 2, h - tail, 0, h]).endFill();
    g.lineStyle(2, RELIC.shadow, .9).beginFill(RELIC.gold).drawRoundedRect(-18, -12, w + 36, 16, 8).endFill();
    node.addChild(g);
    return { node, painted: false, setTint() {} };
  }
  g.beginTextureFill({ texture: getStoneTexture(), color: fill, alpha: .97 }).drawPolygon(shape).endFill();
  node.addChild(g);
  const [l, t, r, b] = spec.insets;
  const plane = new PIXI.NineSlicePlane(tex, l, t, r, b);
  plane.width = w / spec.unit; plane.height = h / spec.unit; plane.scale.set(spec.unit);
  plane.tint = tint; node.addChild(plane);
  return { node, painted: true, setTint: value => { plane.tint = value; } };
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

// The window: four corner caps, four tiled edge strips and a gem on the top and
// bottom centres. Corner art keeps its size; only the tiled edges lengthen.
// backParent (optional) receives the stone fill so page content can sit between it and the rim.
export function addPaintedWindow(parent, w, h, { tint = WHITE, fill = RELIC.night, backParent = null } = {}) {
  const spec = WINDOW_FRAME, src = spec.source, pieces = spec.pieces;
  const tex = Object.fromEntries(Object.entries(pieces).map(([key, name]) => [key, texture(name)]));
  const node = new PIXI.Container(); node.eventMode = 'none'; parent.addChild(node);
  const back = new PIXI.Graphics(); (backParent ?? node).addChild(back);
  if (Object.values(tex).some(entry => !entry)) {
    paintRelicPanel(back, 0, 0, w, h, fill, RELIC.brass, 3);
    return { node, painted: false, setTint() {}, inset: 4 };
  }
  const s = spec.scale, u = spec.unit, tinted = [];
  back.beginTextureFill({ texture: getStoneTexture(), color: fill, alpha: 1 }).drawRoundedRect(8, 8, w - 16, h - 16, 10).endFill();
  const cw = src.corner[0] * s, ch = src.corner[1] * s;
  const place = (sprite, x, y) => { sprite.position.set(x, y); sprite.scale.set(u); sprite.tint = tint; node.addChild(sprite); tinted.push(sprite); return sprite; };
  const tile = (key, x, y, width, height) => {
    const sprite = new PIXI.TilingSprite(tex[key], width / u, height / u);
    return place(sprite, x, y);
  };
  const overlap = 6;
  // Strips first so the corners' feathered inner edges dissolve onto them.
  const sh = src.height;
  tile('edgeTop', cw - overlap, src.top[0] * s, w - 2 * (cw - overlap), tex.edgeTop.height * u);
  tile('edgeBottom', cw - overlap, h - (sh - src.bottom[0]) * s, w - 2 * (cw - overlap), tex.edgeBottom.height * u);
  tile('edgeLeft', src.left[0] * s, ch - overlap, tex.edgeLeft.width * u, h - 2 * (ch - overlap));
  tile('edgeRight', w - (src.width - src.right[0]) * s, ch - overlap, tex.edgeRight.width * u, h - 2 * (ch - overlap));
  const gemTop = new PIXI.Sprite(tex.gemTop), gemBottom = new PIXI.Sprite(tex.gemBottom);
  place(gemTop, w / 2 - tex.gemTop.width * u / 2, src.top[0] * s);
  place(gemBottom, w / 2 - tex.gemBottom.width * u / 2, h - (sh - src.bottom[0]) * s);
  place(new PIXI.Sprite(tex.cornerTl), 0, 0);
  place(new PIXI.Sprite(tex.cornerTr), w - tex.cornerTr.width * u, 0);
  place(new PIXI.Sprite(tex.cornerBl), 0, h - tex.cornerBl.height * u);
  place(new PIXI.Sprite(tex.cornerBr), w - tex.cornerBr.width * u, h - tex.cornerBr.height * u);
  return { node, painted: true, inset: spec.inset, setTint: value => tinted.forEach(sprite => { sprite.tint = value; }) };
}
