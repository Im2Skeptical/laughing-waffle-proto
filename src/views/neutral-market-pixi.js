import { createText } from './settlement-view-primitives.js';
import { TEXT_STYLES } from './settlement-theme.js';
import { addResourceIcon } from './resource-cost-pixi.js';

export const NEUTRAL_COLOUR = 0x8ed7cf;

// Striped market awning and diamond pennant distinguish neutrals at map scale.
export function addNeutralMarketGlyph(parent, point, scale = 1) {
  const root = new PIXI.Container();
  root.position.set(point.x, point.y);
  root.scale.set(scale);
  const ink = new PIXI.Graphics();
  ink.lineStyle(2, 0x162c2b).beginFill(0x243f39).drawRect(-26, -43, 52, 35).endFill();
  ink.beginFill(0xc7ae7d).drawRect(-22, -7, 5, 10).drawRect(17, -7, 5, 10).endFill();
  for (let i = 0; i < 6; i++) {
    ink.beginFill(i % 2 ? 0xf0ddb3 : 0x4a9e97)
      .drawPolygon([-30+i*10,-45,-20+i*10,-45,-17+i*10,-26,-27+i*10,-26]).endFill();
  }
  ink.lineStyle(2, 0xbda978).moveTo(30, 2).lineTo(30, -66);
  ink.beginFill(NEUTRAL_COLOUR).drawPolygon([30,-66,42,-54,30,-42,18,-54]).endFill();
  root.addChild(ink);
  addResourceIcon(root, 'stock-currency', 0, -15, 21);
  root.eventMode = 'none';
  parent.addChild(root);
  return root;
}

export function addNeutralMarketBillboard(parent, rect, { name, reference, stocks, defense, tooltipView }) {
  const root = new PIXI.Container();
  root.position.set(rect.x, rect.y);
  const w = rect.width, h = rect.height;
  const ink = new PIXI.Graphics();
  ink.beginFill(0x40382b).drawRect(28,h-100,24,100).drawRect(w-52,h-100,24,100).endFill();
  ink.lineStyle(5, 0xa88758).beginFill(0x142b29).drawRoundedRect(0,0,w,h-35,9).endFill();
  ink.lineStyle(2, 0x4d8780).drawRoundedRect(13,13,w-26,h-61,6);
  ink.lineStyle(0).beginFill(0x397e77).drawPolygon([25,20,210,20,210,67,118,84,25,67]).endFill();
  root.addChild(ink);
  root.addChild(createText('NEUTRAL', {...TEXT_STYLES.header,fontSize:25,fill:0xf3e6c4},118,35,.5));
  const title = createText(`${reference ? reference+' · ' : ''}${name}`, {...TEXT_STYLES.header,fontSize:34,fill:NEUTRAL_COLOUR},242,28);
  title.scale.set(Math.min(1,(w-330)/Math.max(1,title.width)));
  root.addChild(title);
  const rowHeight = Math.min(120, (h-180)/Math.max(1,stocks.length));
  stocks.forEach((stock,index) => {
    const y = 111 + index*rowHeight;
    const row = new PIXI.Container();
    row.position.set(28,y);
    row.addChild(new PIXI.Graphics().beginFill(index%2 ? 0x213b36 : 0x1b332f)
      .drawRoundedRect(0,0,w-56,rowHeight-9,4).endFill());
    addResourceIcon(row, `stock-${stock.traits[0].toLowerCase()}`, 36, (rowHeight-9)/2, 42);
    row.addChild(createText(stock.label,{...TEXT_STYLES.header,fontSize:30,fill:0xf3e6c4},73,11));
    stock.traits.slice(1).forEach((trait,i) => addResourceIcon(row, `stock-${trait.toLowerCase()}`,87+i*33,58,28));
    addResourceIcon(row,'stock',w-410,36,34);
    row.addChild(createText(String(stock.stock),{...TEXT_STYLES.header,fontSize:31,fill:stock.stock ? 0xf3e6c4 : 0x78918b},w-380,17));
    addResourceIcon(row,'stock-currency',w-251,36,38);
    row.addChild(createText(`${stock.price} / unit`,{...TEXT_STYLES.body,fontSize:27,fill:NEUTRAL_COLOUR},w-224,20));
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
  addNeutralMarketGlyph(root,{x:w-48,y:h-64},.65);
  root.addChild(createText(`Defense ${defense}`,{...TEXT_STYLES.chip,fontSize:21,fill:0x95b4a9},30,h-80));
  root.marketBillboard = true;
  parent.addChild(root);
  return root;
}
