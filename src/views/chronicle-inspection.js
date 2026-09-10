import { addIllustration } from './chronicle-art.js';
import { paintRelicPanel, RELIC } from './chronicle-skin.js';
import { createText } from './settlement-view-primitives.js';
import { TEXT_STYLES } from './settlement-theme.js';
import { addCostPanel } from './resource-cost-pixi.js';

// A view-local reading surface; scrolling never changes a card or its draft.
export function addChronicleInspection(parent, rect, {title, artId, cost, metadata, detail, onClose}) {
  const root=new PIXI.Container();root.position.set(rect.x,rect.y);
  const frame=new PIXI.Graphics();
  paintRelicPanel(frame,0,0,rect.width,rect.height,RELIC.night,RELIC.brass,3);
  root.addChild(frame);
  root.eventMode='static';root.on('pointertap',event=>event.stopPropagation());
  addIllustration(root,artId,{x:18,y:18,width:156,height:142});
  root.addChild(createText(title,{...TEXT_STYLES.header,fontSize:36,wordWrap:true,wordWrapWidth:rect.width-280},196,20));
  addCostPanel(root, {x:196,y:112,width:rect.width-238,height:128}, {
    ...cost, interactive:false, fontSize:36, iconSize:46,
  });
  const close=new PIXI.Container();close.position.set(rect.width-66,14);
  const closeFrame=new PIXI.Graphics();paintRelicPanel(closeFrame,0,0,50,50,RELIC.stone,RELIC.brass,1);
  close.addChild(closeFrame,createText('×',{...TEXT_STYLES.header,fontSize:38},25,25,.5,.5));
  close.eventMode='static';close.cursor='pointer';close.hitArea=new PIXI.Rectangle(0,0,50,50);
  close.on('pointertap',event=>{event.stopPropagation();onClose();});root.addChild(close);
  const viewport=new PIXI.Container();viewport.position.set(22,266);root.addChild(viewport);
  const height=rect.height-306,width=rect.width-44;
  const copy=createText([metadata,detail].filter(Boolean).join('\n\n'),{
    ...TEXT_STYLES.body,fontSize:32,lineHeight:42,wordWrap:true,wordWrapWidth:width-16,
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
