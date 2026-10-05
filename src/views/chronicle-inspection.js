import { pieceDimensions, fitPiece } from './piece-geometry.js';
import { addSettlementPiece } from "./settlement-piece-pixi.js";
import { addIllustration } from './chronicle-art.js';
import { paintRelicPanel, RELIC } from './chronicle-skin.js';
import { createText } from './settlement-view-primitives.js';
import { TEXT_STYLES } from './settlement-theme.js';
import { addCostPanel } from './resource-cost-pixi.js';
import { addPracticeReading, addPracticeGlossary } from './practice-reading-pixi.js';
import { attachInspectionKeywords } from './inspection-keywords-pixi.js';

function readingViewport(parent, content, rect) {
  const viewport=new PIXI.Container();viewport.position.set(rect.x,rect.y);parent.addChild(viewport);
  // Reparent the content so the mask and input remain in the same coordinates.
  viewport.addChild(content);
  const mask=new PIXI.Graphics().beginFill(0xffffff).drawRect(0,0,rect.width,rect.height).endFill();
  viewport.addChild(mask);content.mask=mask;
  const maxScroll=Math.max(0,content.readingHeight-rect.height);
  let scroll=0,drag=null;
  const move=value=>{scroll=Math.max(0,Math.min(maxScroll,value));content.y=-scroll;viewport.emit('readingScroll');};
  viewport.getScroll=()=>scroll;viewport.setScroll=move;
  viewport.eventMode='static';viewport.hitArea=new PIXI.Rectangle(0,0,rect.width,rect.height);
  viewport.on('wheel',event=>{event.stopPropagation();move(scroll+(event.deltaY??event.nativeEvent?.deltaY??0));});
  viewport.on('pointerdown',event=>{event.stopPropagation();drag={y:viewport.toLocal(event.global).y,scroll};});
  viewport.on('pointermove',event=>{if(drag)move(drag.scroll+drag.y-viewport.toLocal(event.global).y);});
  for(const type of ['pointerup','pointerupoutside','pointercancel'])viewport.on(type,()=>{drag=null;});
  if(maxScroll)parent.addChild(createText('Drag or scroll to read',{...TEXT_STYLES.body,fontSize:22,fill:RELIC.ash},rect.x,rect.y+rect.height+8));
  return viewport;
}

function addPracticeInspection(parent, rect, {face,cost,onActivate,onClose,onReview,detail,referenceState,keywordReferences}) {
  const root=new PIXI.Container();root.position.set(rect.x,rect.y);
  root.eventMode='static';root.on('pointertap',event=>event.stopPropagation());
  const frame=new PIXI.Graphics();paintRelicPanel(frame,0,0,rect.width,rect.height,RELIC.night,RELIC.brass,2);root.addChild(frame);
  const pad=28,gap=30,cardWidth=rect.width*.21;
  const glossaryWidth=rect.width*.29,rulesX=pad+cardWidth+gap;
  const glossaryX=rect.width-pad-glossaryWidth,rulesWidth=glossaryX-gap-rulesX;
  root.addChild(createText(`${face.tier.toUpperCase()} · ${face.kind.toUpperCase()}`,{...TEXT_STYLES.chip,fontSize:26,fill:RELIC.gold},pad,24));
  const close=new PIXI.Container();close.position.set(rect.width-72,14);
  const closeFrame=new PIXI.Graphics();paintRelicPanel(closeFrame,0,0,54,54,RELIC.stone,RELIC.brass,1);
  close.addChild(closeFrame,createText('×',{...TEXT_STYLES.header,fontSize:40},27,27,.5,.5));
  close.eventMode='static';close.cursor='pointer';close.hitArea=new PIXI.Rectangle(-39,-39,132,132);
  close.on('pointertap',event=>{event.stopPropagation();onClose?.();});root.addChild(close);root.closeControl=close;
  if(onReview) {
    const dev=new PIXI.Container();dev.position.set(rect.width-216,14);
    const frame=new PIXI.Graphics();paintRelicPanel(frame,0,0,120,54,RELIC.stone,RELIC.brass,1);
    dev.addChild(frame,createText('Dev',{...TEXT_STYLES.header,fontSize:30},60,27,.5,.5));
    dev.eventMode='static';dev.cursor='pointer';dev.hitArea=new PIXI.Rectangle(-6,-39,132,132);
    dev.accessible=true;dev.accessibleTitle=`Review ${face.label}`;
    dev.on('pointertap',event=>{event.stopPropagation();onReview(face);});root.addChild(dev);root.devControl=dev;
  }
  const top=88,bottom=rect.height-56;
  const fitted=fitPiece({x:pad,y:top+20,width:cardWidth,height:bottom-top-(cost?160:10)},face.kind,face.footprint);
  addSettlementPiece(root,{x:fitted.x,y:fitted.y,width:fitted.width*fitted.scale,height:fitted.height*fitted.scale},{face});
  if(cost)root.costPanel=addCostPanel(root,{x:pad,y:bottom-146,width:cardWidth,height:140},{...cost,interactive:!!onActivate,onActivate,fontSize:30,iconSize:38});
  const size=Math.max(26,Math.min(40,rulesWidth/20));
  const rules=addPracticeReading(root,rulesWidth,face,{fontSize:size});
  // Transaction-specific blockers remain inspect-only, outside the shared rules.
  if(cost?.disabled && detail) {
    const note=createText(cost.staged?'Already staged.':detail.split('\n').filter(line=>/Insufficient|Cannot|Requires|Blocked/i.test(line)).join('\n'),{...TEXT_STYLES.body,fontSize:26,fill:RELIC.gold,wordWrap:true,wordWrapWidth:rulesWidth-48},24,rules.readingHeight+18);
    rules.addChild(note);rules.readingHeight+=note.height+36;
  }
  const rulesViewport=readingViewport(root,rules,{x:rulesX,y:top,width:rulesWidth,height:bottom-top});
  const glossary=addPracticeGlossary(root,glossaryWidth,face,size);
  const glossaryViewport=readingViewport(root,glossary,{x:glossaryX,y:top,width:glossaryWidth,height:bottom-top});
  root.getScroll=()=>rulesViewport.getScroll();root.setScroll=value=>rulesViewport.setScroll(value);
  root.getGlossaryScroll=()=>glossaryViewport.getScroll();root.setGlossaryScroll=value=>glossaryViewport.setScroll(value);
  root.glossary=glossary;root.rules=rules;root.glossaryViewport=glossaryViewport;
  parent.addChild(root);
  if(keywordReferences)attachInspectionKeywords(root,{face,rect,rules,glossary,rulesViewport,glossaryViewport,readingViewport,initialState:referenceState});
  return root;
}

// A view-local reading surface; scrolling never changes a card or its draft.
export function addChronicleInspection(parent, rect, {title, artId, face, cost, metadata, detail, onClose, onActivate, onReview, referenceState, keywordReferences=true}) {
  if(face?.reading)return addPracticeInspection(parent,rect,{face,cost,onActivate,onClose,onReview,detail,referenceState,keywordReferences});
  const root=new PIXI.Container();root.position.set(rect.x,rect.y);
  const frame=new PIXI.Graphics();
  paintRelicPanel(frame,0,0,rect.width,rect.height,RELIC.night,RELIC.brass,3);
  root.addChild(frame);
  root.eventMode='static';root.on('pointertap',event=>event.stopPropagation());
  const dimensions=pieceDimensions(face?.kind,face?.footprint);
  const fitted=fitPiece({x:22,y:82,width:Math.min(330,rect.width*.36),height:cost?300:350},face?.kind,face?.footprint);
  const artWidth=dimensions.width*fitted.scale, artHeight=dimensions.height*fitted.scale;
  const columnWidth=Math.max(234,artWidth);
  const artRect={x:22+(columnWidth-artWidth)/2,y:82,width:artWidth,height:artHeight};
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
  close.on('pointertap',event=>{event.stopPropagation();onClose?.();});root.addChild(close);
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
  root.getScroll=()=>scroll;
  root.setScroll=move;
  viewport.eventMode='static';viewport.hitArea=new PIXI.Rectangle(0,0,width,height);
  viewport.on('wheel',event=>{event.stopPropagation();move(scroll+(event.deltaY??event.nativeEvent?.deltaY??0));});
  viewport.on('pointerdown',event=>{event.stopPropagation();drag={y:viewport.toLocal(event.global).y,scroll};});
  viewport.on('pointermove',event=>{if(drag)move(drag.scroll+drag.y-viewport.toLocal(event.global).y);});
  for(const type of ['pointerup','pointerupoutside','pointercancel'])viewport.on(type,()=>{drag=null;});
  if(maxScroll)root.addChild(createText('Drag or scroll to read',{...TEXT_STYLES.body,fontSize:20,fill:RELIC.ash},22,rect.height-27));
  parent.addChild(root);return root;
}
