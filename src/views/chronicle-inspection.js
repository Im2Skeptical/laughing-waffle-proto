import { addSettlementPiece } from "./settlement-piece-pixi.js";
import { addIllustration } from './chronicle-art.js';
import { paintRelicPanel, RELIC } from './chronicle-skin.js';
import { createText } from './settlement-view-primitives.js';
import { TEXT_STYLES } from './settlement-theme.js';
import { addCostPanel } from './resource-cost-pixi.js';

// A view-local reading surface; scrolling never changes a card or its draft.
export function addChronicleInspection(parent, rect, {title, artId, face, cost, metadata, detail, onClose, onActivate}) {
  const root=new PIXI.Container();root.position.set(rect.x,rect.y);
  const frame=new PIXI.Graphics();
  paintRelicPanel(frame,0,0,rect.width,rect.height,RELIC.night,RELIC.brass,3);
  root.addChild(frame);
  root.eventMode='static';root.on('pointertap',event=>event.stopPropagation());
  const artWidth = face?.kind === 'structure' ? 180 * (face.footprint ?? 1) : 234;
  const artHeight = face?.kind === 'structure' ? 150 : 340;
  const columnWidth = Math.max(234, artWidth);
  const artRect = { x: 22 + (columnWidth - artWidth) / 2, y: 78, width: artWidth, height: artHeight };
  if(face)addSettlementPiece(root,artRect,{face});
  else addIllustration(root,artId,artRect);
  root.addChild(createText(title,{...TEXT_STYLES.header,fontSize:30,wordWrap:true,wordWrapWidth:rect.width-120},22,20));
  if(cost)root.costPanel=addCostPanel(root,{x:22,y:artHeight+100,width:columnWidth,height:130},{
    ...cost, interactive:!!onActivate, onActivate, fontSize:30, iconSize:38,
  });
  const close=new PIXI.Container();close.position.set(rect.width-66,14);
  const closeFrame=new PIXI.Graphics();paintRelicPanel(closeFrame,0,0,50,50,RELIC.stone,RELIC.brass,1);
  close.addChild(closeFrame,createText('×',{...TEXT_STYLES.header,fontSize:38},25,25,.5,.5));
  close.eventMode='static';close.cursor='pointer';close.hitArea=new PIXI.Rectangle(0,0,50,50);
  close.on('pointertap',event=>{event.stopPropagation();onClose();});root.addChild(close);
  root.closeControl = close;
  const viewport=new PIXI.Container();viewport.position.set(columnWidth+50,92);root.addChild(viewport);
  const height=rect.height-140,width=rect.width-columnWidth-78;
  const copy=createText([metadata,detail].filter(Boolean).join('\n\n'),{
    ...TEXT_STYLES.body,fontSize:24,lineHeight:32,wordWrap:true,wordWrapWidth:width-16,
  },0,0);
  viewport.addChild(copy);
  const mask=new PIXI.Graphics().beginFill(0xffffff).drawRect(0,0,width,height).endFill();
  viewport.addChild(mask);copy.mask=mask;
  const maxScroll=Math.max(0,copy.height-height);
  let scroll=0,drag=null;
  const move=value=>{scroll=Math.max(0,Math.min(maxScroll,value));copy.y=-scroll;};
  viewport.eventMode='static';viewport.hitArea=new PIXI.Rectangle(0,0,width,height);
  viewport.on('wheel',event=>{event.stopPropagation();move(scroll+(event.deltaY??event.nativeEvent?.deltaY??0));});
  viewport.on('pointerdown',event=>{event.stopPropagation();drag={y:viewport.toLocal(event.global).y,scroll};});
  viewport.on('pointermove',event=>{if(drag)move(drag.scroll+drag.y-viewport.toLocal(event.global).y);});
  for(const type of ['pointerup','pointerupoutside','pointercancel'])viewport.on(type,()=>{drag=null;});
  if(maxScroll)root.addChild(createText('Drag or scroll to read',{...TEXT_STYLES.body,fontSize:20,fill:RELIC.ash},22,rect.height-27));
  parent.addChild(root);return root;
}
