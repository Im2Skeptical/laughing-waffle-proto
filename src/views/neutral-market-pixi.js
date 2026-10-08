import { createText } from './settlement-view-primitives.js';
import { TEXT_STYLES } from './settlement-theme.js';
import { addResourceIcon } from './resource-cost-pixi.js';
import { addRegionLandmark, getRegionLandmarkTexture } from './chronicle-art.js';

export const NEUTRAL_COLOUR = 0x8ed7cf;

// Painted teal awnings and pennants distinguish neutrals at map scale.
export function addNeutralMarketGlyph(parent, point, scale = 1) {
  const root = new PIXI.Container();
  root.position.set(point.x, point.y);
  root.scale.set(scale);
  addRegionLandmark(root,'neutral-market-town',{x:-47,y:-79,width:94,height:94});
  root.eventMode = 'none';
  parent.addChild(root);
  return root;
}

export function addNeutralMarketBillboard(parent, rect, { name, reference, stocks, defense, tooltipView }) {
  const root = new PIXI.Container();
  root.position.set(rect.x, rect.y);
  const w = rect.width, h = rect.height;
  const texture = getRegionLandmarkTexture('neutral-market-board');
  if (texture?.baseTexture.valid) {
    const frame = new PIXI.NineSlicePlane(texture,texture.width*.09,texture.height*.16,texture.width*.09,texture.height*.25);
    frame.width=w; frame.height=h;
    frame.label='neutral-market-board';
    frame.eventMode='none';
    root.addChild(frame);
  }
  const insetX=72, insetY=70, innerWidth=w-insetX*2, innerHeight=h-160;
  root.addChild(new PIXI.Graphics().beginFill(0x397e77,.88)
    .drawPolygon([insetX,insetY,insetX+185,insetY,insetX+185,insetY+43,insetX+92,insetY+58,insetX,insetY+43]).endFill());
  root.addChild(createText('NEUTRAL', {...TEXT_STYLES.header,fontSize:25,fill:0xf3e6c4},insetX+92,insetY+11,.5));
  const title = createText(`${reference ? reference+' · ' : ''}${name}`, {...TEXT_STYLES.header,fontSize:34,fill:NEUTRAL_COLOUR},insetX+215,insetY+6);
  title.scale.set(Math.min(1,(innerWidth-230)/Math.max(1,title.width)));
  root.addChild(title);
  const rowHeight = Math.min(120, (innerHeight-115)/Math.max(1,stocks.length));
  stocks.forEach((stock,index) => {
    const y = insetY+77 + index*rowHeight;
    const row = new PIXI.Container();
    row.position.set(insetX,y);
    row.addChild(new PIXI.Graphics().beginFill(index%2 ? 0x213b36 : 0x1b332f,.82)
      .drawRoundedRect(0,0,innerWidth,rowHeight-9,4).endFill());
    addResourceIcon(row, `stock-${stock.traits[0].toLowerCase()}`, 36, (rowHeight-9)/2, 42);
    row.addChild(createText(stock.label,{...TEXT_STYLES.header,fontSize:30,fill:0xf3e6c4},73,11));
    stock.traits.slice(1).forEach((trait,i) => addResourceIcon(row, `stock-${trait.toLowerCase()}`,87+i*33,58,28));
    addResourceIcon(row,'stock',innerWidth-354,36,34);
    row.addChild(createText(String(stock.stock),{...TEXT_STYLES.header,fontSize:31,fill:stock.stock ? 0xf3e6c4 : 0x78918b},innerWidth-324,17));
    addResourceIcon(row,'stock-currency',innerWidth-195,36,38);
    row.addChild(createText(`${stock.price} / unit`,{...TEXT_STYLES.body,fontSize:27,fill:NEUTRAL_COLOUR},innerWidth-168,20));
    const spec = { title: stock.label, lines: [stock.traits.join(' · '),
      `${stock.stock} Stock available. ${stock.price} Currency per Stock.`,
      'Adjacent, road-connected towns buy for consumption after local and allied supplies.',
      `Replenishes ${stock.replenishment} each Food phase, up to ${stock.capacity}.`], maxWidth: 330 };
    row.eventMode = 'static';
    row.on('pointerover',()=>tooltipView?.show(spec,row.getBounds(),{dismissOnExit:true}));
    row.on('pointerout',()=>tooltipView?.hide());
    row.on('pointerdown',event=>{event.stopPropagation();tooltipView?.pin(spec,row.getBounds(),`market:${reference}:${stock.id}`);});
    root.addChild(row);
  });
  root.addChild(createText(`Defense ${defense}`,{...TEXT_STYLES.chip,fontSize:21,fill:0x95b4a9},insetX,insetY+innerHeight-27));
  root.marketBillboard = true;
  parent.addChild(root);
  return root;
}
