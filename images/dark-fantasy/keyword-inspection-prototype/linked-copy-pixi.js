// Prototype-only decoration of the real inspector's Text nodes. Pixi measures
// the original lines; links retain their glyph positions, including wrapped
// phrases. Both halves of a phrase split across lines open the same definition.
import { RELIC } from '../../../src/views/chronicle-skin.js';
import { terms, aliases } from './terms.js';

export function keywordCopy({register,open}) {
  const names=[...Object.keys(terms),...Object.keys(aliases)].sort((a,b)=>b.length-a.length);
  const canonical=Object.fromEntries(names.map(name=>[name.toLowerCase(),aliases[name]??name]));
  const matcher=new RegExp(`\\b(${names.map(name=>name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')})\\b`,'gi');
  function decorate(text,group,viewport,exclude,panelIndex) {
    const ranges=[...text.text.matchAll(matcher)].map(match=>({start:match.index,end:match.index+match[0].length,term:canonical[match[0].toLowerCase()]})).filter(match=>match.term!==exclude);
    if(!ranges.length)return;
    const metrics=PIXI.TextMetrics.measureText(text.text,text.style),style=text.style.clone();style.wordWrap=false;
    const root=new PIXI.Container();root.position.copyFrom(text.position);root.scale.copyFrom(text.scale);
    root.position.x-=text.anchor.x*text.width;root.position.y-=text.anchor.y*text.height;
    let offset=0;
    metrics.lines.forEach((line,row)=>{
      const start=text.text.indexOf(line,offset);offset=start+line.length;
      const spans=ranges.filter(match=>match.start<offset&&match.end>start);let end=0;
      function segment(value,from,to,term) {
        if(!value)return;
        const x=PIXI.TextMetrics.measureText(line.slice(0,from),style).width;
        const copy=new PIXI.Text(value,style.clone());copy.position.set(x,row*metrics.lineHeight);copy.eventMode='none';
        if(!term) {root.addChild(copy);return;}
        const control=new PIXI.Container();control.position.copyFrom(copy.position);copy.position.set(0,0);copy.style.fill=RELIC.gold;copy.eventMode='none';
        control.addChild(copy);
        const width=PIXI.TextMetrics.measureText(line.slice(0,to),style).width-x;
        control.addChild(new PIXI.Graphics().lineStyle(2,RELIC.gold,.9).moveTo(0,copy.height-1).lineTo(width,copy.height-1));
        control.hitArea=new PIXI.Rectangle(-3,-3,width+6,Math.min(metrics.lineHeight,copy.height+6));
        control.eventMode='static';control.cursor='pointer';control.keywordTerm=term;
        control.accessible=true;control.accessibleType='button';control.accessibleTitle=`Explain ${term}`;
        let press=null,moved=false;
        control.on('pointerdown',event=>{press=event.global?.clone();moved=false;});
        control.on('globalpointermove',event=>{if(press&&event.global&&Math.hypot(event.global.x-press.x,event.global.y-press.y)>18)moved=true;});
        control.on('pointertap',event=>{event.stopPropagation();if(!moved)open(term,control,panelIndex);press=null;});
        for(const type of ['pointerupoutside','pointercancel'])control.on(type,()=>{press=null;moved=false;});
        root.addChild(control);register(control,{group,action:`term:${term}`,viewport,panelIndex});
      }
      for(const span of spans) {
        const from=Math.max(0,span.start-start),to=Math.min(line.length,span.end-start);
        segment(line.slice(end,from),end,from);segment(line.slice(from,to),from,to,span.term);end=to;
      }
      segment(line.slice(end),end,line.length);
    });
    const parent=text.parent,index=parent.getChildIndex(text);parent.removeChild(text);parent.addChildAt(root,index);text.destroy();
  }
  function decorateTree(parent,group,viewport,exclude,panelIndex) {
    for(const child of [...parent.children]) {
      if(child.prototypeControl)continue;
      if(child instanceof PIXI.Text)decorate(child,group,viewport,exclude,panelIndex);
      else if(child.children?.length)decorateTree(child,group,viewport,exclude,panelIndex);
    }
  }
  return decorateTree;
}
