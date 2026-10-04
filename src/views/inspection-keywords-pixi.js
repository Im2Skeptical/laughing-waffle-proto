import { getInspectionTerms } from './inspection-terms.js';
import { paintRelicPanel, RELIC } from './chronicle-skin.js';
import { createText } from './settlement-view-primitives.js';
import { TEXT_STYLES } from './settlement-theme.js';

// Measured Pixi text links preserve the existing rules layout. Only deliberate
// inspection opts in; titles and italic flavour remain ordinary text.
function linkText(text,terms,aliases,open,register,exclude) {
  if(text.style.fontStyle==='italic')return;
  const names=[...Object.keys(terms),...Object.keys(aliases)].sort((a,b)=>b.length-a.length);
  const canonical=Object.fromEntries(names.map(name=>[name.toLowerCase(),aliases[name]??name]));
  const matcher=new RegExp(`\\b(${names.map(name=>name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')})\\b`,'gi');
  const ranges=text.inspectionKeyword
    ? [{start:0,end:text.text.length,term:text.inspectionKeyword}]
    : [...text.text.matchAll(matcher)].map(match=>({start:match.index,end:match.index+match[0].length,term:canonical[match[0].toLowerCase()]}));
  const matches=ranges.filter(match=>match.term!==exclude);
  if(!matches.length)return;
  const metrics=PIXI.TextMetrics.measureText(text.text,text.style),style=text.style.clone();style.wordWrap=false;
  const root=new PIXI.Container();root.position.copyFrom(text.position);root.scale.copyFrom(text.scale);
  root.x-=text.anchor.x*text.width;root.y-=text.anchor.y*text.height;
  let offset=0;
  for(const [row,line] of metrics.lines.entries()) {
    const start=text.text.indexOf(line,offset);
    if(start<0)continue;
    offset=start+line.length;let end=0;
    const segment=(from,to,term)=>{
      const value=line.slice(from,to);if(!value)return;
      const x=PIXI.TextMetrics.measureText(line.slice(0,from),style).width;
      const copy=createText(value,style.clone(),x,row*metrics.lineHeight);copy.eventMode='none';
      if(!term){root.addChild(copy);return;}
      const node=new PIXI.Container();node.position.copyFrom(copy.position);copy.position.set(0,0);copy.style.fill=RELIC.gold;node.addChild(copy);
      const width=PIXI.TextMetrics.measureText(line.slice(0,to),style).width-x;
      node.addChild(new PIXI.Graphics().lineStyle(2,RELIC.gold,.9).moveTo(0,copy.height-1).lineTo(width,copy.height-1));
      node.hitArea=new PIXI.Rectangle(-4,-3,width+8,Math.min(metrics.lineHeight,copy.height+6));
      node.eventMode='static';node.cursor='pointer';node.accessible=true;node.accessibleType='button';node.accessibleTitle=`Explain ${term}`;
      node.accessiblePointerEvents='none';
      node.keywordTerm=term;
      let press=null,moved=false;
      node.on('pointerdown',event=>{press=event.global.clone();moved=false;});
      node.on('globalpointermove',event=>{if(press&&Math.hypot(event.global.x-press.x,event.global.y-press.y)>18)moved=true;});
      node.on('pointertap',event=>{event.stopPropagation();if(!moved)open(term,node);press=null;});
      for(const type of ['pointerupoutside','pointercancel'])node.on(type,()=>{press=null;moved=false;});
      root.addChild(node);register(node);
    };
    for(const match of matches.filter(match=>match.start<offset&&match.end>start)) {
      const from=Math.max(0,match.start-start),to=Math.min(line.length,match.end-start);
      segment(end,from);segment(from,to,match.term);end=to;
    }
    segment(end,line.length);
  }
  // Retain the source node as the layout/copy record for redraw and inspection.
  text.renderable=false;text.eventMode='none';text.parent.addChild(root);
}

export function attachInspectionKeywords(root,{face,rect,rules,glossary,rulesViewport,glossaryViewport,readingViewport,initialState}) {
  const {terms,aliases}=getInspectionTerms(face,glossary.entries);
  const baseTargets=[],referenceTargets=[];
  let path=[],anchor=null,origin=null,panel=null,overlay=null,referenceViewport=null,pending=false,focusNext=!!initialState?.keyboardFocus;
  const descendants=(parent,visit)=>{for(const child of [...parent.children]){if(child instanceof PIXI.Text)visit(child);else if(child.children?.length)descendants(child,visit);}};
  const clipped=(node,viewport)=>{
    const bounds=node.getBounds();
    let clip=null;
    if(viewport) {
      const area=viewport.hitArea,top=viewport.toGlobal(new PIXI.Point(area.x,area.y)),bottom=viewport.toGlobal(new PIXI.Point(area.right,area.bottom));
      clip={x:top.x,y:top.y,right:bottom.x,bottom:bottom.y};
    }
    const x=Math.max(bounds.x,clip?.x??bounds.x),y=Math.max(bounds.y,clip?.y??bounds.y);
    const right=Math.min(bounds.right,clip?.right??bounds.right),bottom=Math.min(bounds.bottom,clip?.bottom??bounds.bottom);
    return right-x>4&&bottom-y>4?{x,y,width:right-x,height:bottom-y}:null;
  };
  const updateAccessible=()=>{
    for(const target of [...baseTargets,...referenceTargets])target.node.accessible=!!clipped(target.node,target.viewport)&&(!path.length||target.group==='reference');
  };
  const focus=(target)=>{
    if(!focusNext)return;focusNext=false;
    // Pixi creates accessible buttons after painting. A queued layout can run
    // before that paint, so wait for this control's native button to exist.
    let attempts=0;
    const move=()=>{
      if(root.destroyed||target?.destroyed)return;
      const button=[...document.querySelectorAll('button')].find(button=>button.displayObject===target);
      // These native buttons serve the keyboard; pointer input stays on the
      // canvas, including taps through their full-canvas parent.
      if(button?.parentElement)button.parentElement.style.pointerEvents='none';
      button?.focus({preventScroll:true});
      if(document.activeElement!==button&&++attempts<12)requestAnimationFrame(move);
    };
    requestAnimationFrame(move);
  };
  const queue=()=>{if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;if(!root.destroyed)draw();});};
  const close=()=>{path=[];queue();};
  const back=()=>{path.pop();queue();};
  const open=(term,node)=>{
    if(!terms[term])return;
    focusNext=document.activeElement?.tagName==='BUTTON';
    if(!path.length) {
      const bounds=node.getBounds(),local=root.toLocal(new PIXI.Point(bounds.x,bounds.y));
      anchor={x:local.x,y:local.y,width:bounds.width/node.worldTransform.a,height:bounds.height/node.worldTransform.d};origin=node;
    }
    if(path.at(-1)!==term)path.push(term);
    queue();
  };
  const control=(parent,label,x,y,width,run)=>{
    const node=new PIXI.Container();node.position.set(x,y);
    const frame=new PIXI.Graphics();paintRelicPanel(frame,0,0,width,84,RELIC.stone,RELIC.brass,2);node.addChild(frame);
    const copy=createText(label,{...TEXT_STYLES.body,fontSize:34,fill:RELIC.bone},width/2,42,.5,.5);copy.eventMode='none';node.addChild(copy);
    node.eventMode='static';node.cursor='pointer';node.hitArea=new PIXI.Rectangle(0,0,width,84);node.accessible=true;node.accessibleType='button';node.accessibleTitle=label;
    node.accessiblePointerEvents='none';
    node.on('pointertap',event=>{event.stopPropagation();focusNext=document.activeElement?.tagName==='BUTTON';run();});
    parent.addChild(node);referenceTargets.push({node,group:'reference',action:label});return node;
  };
  function draw() {
    // Blur before destroying a focused Pixi accessibility target.
    if(panel&&document.activeElement?.tagName==='BUTTON'&&referenceTargets.some(target=>target.node.accessibleTitle===document.activeElement.title))document.activeElement.blur();
    overlay?.destroy({children:true});overlay=panel=referenceViewport=null;referenceTargets.length=0;
    if(!path.length){updateAccessible();focus(origin);return;}
    overlay=new PIXI.Container();root.addChild(overlay);
    const outside=new PIXI.Graphics().beginFill(0x000000,.001).drawRect(0,0,rect.width,rect.height).endFill();
    outside.eventMode='static';outside.on('pointertap',event=>{event.stopPropagation();close();});overlay.addChild(outside);
    const width=Math.min(850,rect.width-48),height=Math.min(700,rect.height-48),box=anchor??{x:rect.width/2,y:rect.height/2,height:0};
    const x=Math.max(24,Math.min(box.x,rect.width-width-24)),below=box.y+box.height+20;
    const y=Math.max(24,Math.min(below+height<=rect.height-24?below:box.y-height-20,rect.height-height-24));
    panel=new PIXI.Container();panel.position.set(x,y);overlay.addChild(panel);
    const frame=new PIXI.Graphics();paintRelicPanel(frame,0,0,width,height,0x1b211d,RELIC.gold,3);panel.addChild(frame);
    panel.eventMode='static';panel.hitArea=new PIXI.Rectangle(0,0,width,height);panel.on('pointertap',event=>event.stopPropagation());
    const backControl=control(panel,'‹ Back',22,18,160,back);
    control(panel,'×',width-106,18,84,close).accessibleTitle='Close reference';
    const content=new PIXI.Container(),term=path.at(-1);
    const heading=createText(term,{...TEXT_STYLES.header,fontSize:48,fill:RELIC.bone,wordWrap:true,wordWrapWidth:width-48},0,0);
    const body=createText(terms[term],{...TEXT_STYLES.body,fontSize:38,lineHeight:51,fill:RELIC.bone,wordWrap:true,wordWrapWidth:width-48},0,heading.height+20);
    content.addChild(heading,body);content.readingHeight=body.y+body.height+24;
    referenceViewport=readingViewport(panel,content,{x:24,y:126,width:width-48,height:height-166});
    linkText(body,terms,aliases,open,node=>referenceTargets.push({node,group:'reference',viewport:referenceViewport,action:`term:${node.keywordTerm}`}),term);
    referenceViewport.on('readingScroll',updateAccessible);
    updateAccessible();focus(backControl);
  }
  for(const [content,viewport,group] of [[rules,rulesViewport,'rules'],[glossary,glossaryViewport,'symbols']]) {
    descendants(content,text=>{
      if(!text.inspectionLinkable&&!text.inspectionKeyword)return;
      linkText(text,terms,aliases,open,node=>baseTargets.push({node,group,viewport,action:`term:${node.keywordTerm}`}));
    });
    viewport.on('readingScroll',updateAccessible);
  }
  root.getReferenceState=()=>({path:[...path],anchor:anchor?{...anchor}:null,
    originTerm:origin?.keywordTerm??null,originGroup:baseTargets.find(target=>target.node===origin)?.group??null,
    keyboardFocus:[...baseTargets,...referenceTargets].some(target=>target.node.accessibleTitle===document.activeElement?.title)});
  root.releaseKeywordFocus=()=>{
    if([...baseTargets,...referenceTargets].some(target=>target.node.accessibleTitle===document.activeElement?.title))document.activeElement.blur();
  };
  root.dismissReference=()=>{if(!path.length)return false;close();return true;};
  root.setReferenceState=state=>{
    path=(state?.path??[]).filter(term=>terms[term]);anchor=state?.anchor??null;
    origin=baseTargets.find(target=>target.node.keywordTerm===state?.originTerm&&target.group===state?.originGroup)?.node??null;
    draw();
  };
  root.handleReferenceKey=event=>{
    if(event.key!=='Escape'||!path.length)return false;
    event.preventDefault();event.stopImmediatePropagation();focusNext=document.activeElement?.tagName==='BUTTON';back();return true;
  };
  root.getKeywordDebugState=()=>({term:path.at(-1)??null,depth:path.length,panels:panel?1:0,
    targets:[...baseTargets,...referenceTargets].flatMap(target=>{
      if(path.length&&target.group!=='reference')return [];
      const bounds=clipped(target.node,target.viewport);return bounds?[{group:target.group,action:target.action,...bounds}]:[];
    }),flavour:rules.children.find(node=>node instanceof PIXI.Text&&node.style.fontStyle==='italic')?.text,
    flavourLinked:rules.children.some(node=>node instanceof PIXI.Text&&node.style.fontStyle==='italic'&&!node.renderable)});
  root.setReferenceState(initialState);
}
