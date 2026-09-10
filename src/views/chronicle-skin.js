// Shared carved-stone chrome. Integer-coordinate hatching is a fixed material,
// not procedural randomness, and cannot affect game state or replay.
export const RELIC = Object.freeze({
  night:0x101314, stone:0x242928, raised:0x333833, shadow:0x090c0d,
  brass:0x8b7049, gold:0xc3a469, bone:0xe0d4b4, ash:0xa2a493,
  red:0x98483f, teal:0x6caba3,
});
let stoneTexture;
export function getStoneTexture() {
  if (stoneTexture) return stoneTexture;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 64;
  const ctx = canvas.getContext('2d');
  const palette = ['#ffffff','#f3f4ef','#e4e7df','#dce2d8'];
  for (let y=0; y<64; y++) for (let x=0; x<64; x++) {
    const vein = Math.sin(x * .25 + Math.sin(y * .12) * 4) + Math.cos(y * .31 + x * .03);
    const bayer = [0,2,3,1][(x % 2) + (y % 2) * 2];
    ctx.fillStyle = palette[Math.max(0, Math.min(3, Math.floor((vein+2) * .6 + bayer * .18)))];
    ctx.fillRect(x,y,1,1);
  }
  stoneTexture = PIXI.Texture.from(canvas);
  stoneTexture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;
  return stoneTexture;
}

export function paintRelicPanel(g, x, y, w, h, fill = RELIC.stone, stroke = RELIC.brass, sw = 2, alpha = 1) {
  const c = Math.min(8, h/8, w/8);
  const polygon=[x+c,y,x+w-c,y,x+w,y+c,x+w,y+h-c,x+w-c,y+h,x+c,y+h,x,y+h-c,x,y+c];
  g.lineStyle(sw, stroke, alpha);
  // Texture is cached across every panel and all screens.
  g.beginTextureFill({texture:getStoneTexture(),color:fill,alpha});
  g.drawPolygon(polygon).endFill();
  if (w > 32 && h > 26) {
    g.lineStyle(1, RELIC.bone, .18 * alpha).moveTo(x+c,y+3).lineTo(x+w-c,y+3);
    g.lineStyle(2, RELIC.shadow, .8 * alpha).moveTo(x+4,y+h-3).lineTo(x+w-4,y+h-3).lineTo(x+w-3,y+5);
    if (w > 220 && h > 100) {
      for (const px of [x+8,x+w-8]) for (const py of [y+8,y+h-8]) {
        g.lineStyle(1,RELIC.shadow,alpha).beginFill(stroke,alpha).drawRect(px-2,py-2,4,4).endFill();
      }
    }
  }
  g.lineStyle(0);
}

export function drawHourglass(g, x, y, size, color = RELIC.gold) {
  const s=size/2;
  g.lineStyle(2,color,1).moveTo(x-s,y-s).lineTo(x+s,y-s)
    .moveTo(x-s,y+s).lineTo(x+s,y+s)
    .moveTo(x-s*.65,y-s).lineTo(x+s*.65,y+s)
    .moveTo(x+s*.65,y-s).lineTo(x-s*.65,y+s);
  g.beginFill(color).drawPolygon([x,y,x-s*.43,y+s*.68,x+s*.43,y+s*.68]).endFill();
}

export function createChronicleFrame(layer) {
  const root = new PIXI.Container(); root.eventMode='none';
  const g = new PIXI.Graphics();
  paintRelicPanel(g,0,0,2424,1080,RELIC.night,RELIC.brass,3);
  paintRelicPanel(g,12,12,2400,62,RELIC.stone,RELIC.brass,1);
  paintRelicPanel(g,12,838,2400,230,RELIC.stone,RELIC.brass,2);
  for(const x of [18,2406]) {
    g.lineStyle(2,RELIC.brass,.9).moveTo(x,78).lineTo(x,830);
    for(let y=100;y<815;y+=34) {
      g.lineStyle(1,RELIC.brass,.55).drawPolygon([x,y-8,x+5,y,x,y+8,x-5,y]);
    }
  }
  for(const x of [28,2396]) for(const y of [30,1050]) drawHourglass(g,x,y,16);
  root.addChild(g); layer.addChild(root);
  return root;
}
