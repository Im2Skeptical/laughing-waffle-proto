import { createText } from './settlement-view-primitives.js';
import { TEXT_STYLES } from './settlement-theme.js';
import { addMultiplierCompletionBadge } from './multiplier-fitting.js';
import { paintRelicPanel, RELIC } from './chronicle-skin.js';
import { addResourceIcon } from './resource-cost-pixi.js';

export function poolContributions(pool) {
  const groups=[];
  for (const [index,source] of pool.sources.entries()) {
    const query=source.query??{}, keys=Object.keys(query);
    const selector=keys.length===1 && ['traitsAny','tagsAny','modesAny'].includes(keys[0]) ? keys[0] : null;
    const broad=selector && query[selector].length>0;
    const key=broad?`${selector}:${[...query[selector]].sort().join('|')}`:`source:${source.instanceId??source.id}:${index}`;
    const old=groups.find(group=>group.key===key);
    if(old){old.amount+=source.amount;old.sources.push(source);old.count++;}
    else groups.push({key,label:broad?query[selector].join(' / '):source.label,amount:source.amount,sources:[source],count:1});
  }
  return groups;
}

export { multiplierTooltip } from './multiplier-fitting.js';

const signed=amount=>`${amount>=0?'+':''}${Number(amount.toFixed(2))}`;
function label(parent,value,x,y,size=27,fill=0xe4dac5) {
  const node=createText(value,{...TEXT_STYLES.body,fontSize:size,fill},x,y);
  node.eventMode='none';parent.addChild(node);return node;
}

// Scroll only the contribution rows, keeping the identity and total visible.
function contributionRows(parent,entries,{width,top,maxRows=5,onSources=()=>{},onLeave=()=>{}}) {
  const rowHeight=48,rowWidth=width-28,height=Math.min(maxRows,entries.length)*rowHeight;
  const viewport=new PIXI.Container();viewport.position.set(14,top);viewport.eventMode='static';
  viewport.hitArea=new PIXI.Rectangle(0,0,rowWidth,height);parent.addChild(viewport);
  const content=new PIXI.Container();viewport.addChild(content);
  const mask=new PIXI.Graphics().beginFill(0xffffff).drawRect(0,0,rowWidth,height).endFill();
  mask.eventMode='none';viewport.addChild(mask);content.mask=mask;
  const controls=[];
  for(const [index,entry] of entries.entries()) {
    const row=new PIXI.Container();row.position.set(0,index*rowHeight);content.addChild(row);
    const color=entry.amount<0?0xd79984:RELIC.gold;
    const hover=new PIXI.Graphics().beginFill(RELIC.bone,.08).drawRoundedRect(0,0,rowWidth-6,44,3).endFill();
    hover.eventMode='none';hover.visible=false;row.addChild(hover);
    const amountPlate=new PIXI.Graphics();paintRelicPanel(amountPlate,0,4,64,34,RELIC.raised,RELIC.brass,1);amountPlate.eventMode='none';row.addChild(amountPlate);
    const amount=label(row,signed(entry.amount),32,7,27,color);amount.anchor.x=.5;amount.scale.set(Math.min(1,54/amount.width));
    const summary=entry.count>1?entry.label
      :entry.label===entry.sources[0].label?entry.label:`${entry.label} : ${entry.sources[0].label}`;
    const pending=entry.sources.some(source=>source.pending),countWidth=entry.count>1?54:0;
    const text=label(row,summary,76,9,25);text.scale.set(Math.min(1,(rowWidth-88-countWidth-(pending?28:0))/text.width));
    if(entry.count>1) {
      const chip=new PIXI.Graphics();paintRelicPanel(chip,rowWidth-56,7,48,30,0x283330,0x637667,1);chip.eventMode='none';row.addChild(chip);
      label(row,`${entry.count} \u203a`,rowWidth-49,9,23,0xc8d5bf);
    }
    if(pending)addMultiplierCompletionBadge(row,rowWidth-countWidth-18,23,22);
    const rule=new PIXI.Graphics().lineStyle(1,RELIC.brass,.22).moveTo(76,43).lineTo(rowWidth-8,43);
    const strongest=Math.max(1,...entries.map(entry=>Math.abs(entry.amount)));
    rule.lineStyle(2,color,.5).moveTo(76,43).lineTo(76+(rowWidth-84)*Math.abs(entry.amount)/strongest,43);rule.eventMode='none';row.addChild(rule);
    row.eventMode='static';row.cursor=entry.count>1?'pointer':'default';row.hitArea=new PIXI.Rectangle(0,0,rowWidth-6,44);
    row.accessibleTitle=`${signed(entry.amount)} ${summary}${entry.count>1?`, ${entry.count} sources`:''}`;
    row.on('pointerenter',()=>{hover.visible=entry.count>1;});row.on('pointerleave',()=>{hover.visible=false;});
    row.on('pointerover',event=>{if(event.pointerType!=='touch')onSources(entry.count>1?entry:null,row);});
    row.on('pointerout',()=>onLeave());
    row.on('pointertap',event=>{event.stopPropagation();onSources(entry.count>1?entry:null,row);});
    controls.push({entry,control:row});
  }
  const maxOffset=Math.max(0,entries.length*rowHeight-height),track=new PIXI.Graphics();
  track.eventMode='none';viewport.addChild(track);
  let offset=0;
  function scroll(value){offset=Math.max(0,Math.min(maxOffset,value));content.y=-offset;track.clear();
    if(maxOffset){track.beginFill(0x7b725c,.3).drawRect(rowWidth-4,0,3,height).endFill();
      const thumb=height*height/(entries.length*rowHeight);
      track.beginFill(0xd3c398).drawRect(rowWidth-4,(height-thumb)*offset/maxOffset,3,thumb).endFill();}}
  viewport.on('wheel',event=>{event.stopPropagation();event.preventDefault?.();onSources(null);scroll(offset+event.deltaY);});
  let touch=null;
  viewport.on('pointerdown',event=>{if(event.pointerType==='touch')touch={y:event.global.y,offset};});
  viewport.on('globalpointermove',event=>{if(touch)scroll(touch.offset+touch.y-event.global.y);});
  for(const type of ['pointerup','pointerupoutside','pointercancel'])viewport.on(type,()=>{touch=null;});
  scroll(0);
  return {height,controls,viewport,getScroll:()=>offset,setScroll:scroll};
}

export function addMultiplierBreakdown(parent,spec,{pinned=false,onSources,onLeave}={}) {
  const {name,pool,kind,before,afterCompletion}=spec.poolBreakdown;
  const groups=poolContributions(pool),width=540,accent=kind==='output'?0xe6bc70:0xb3cfdd;
  const header=new PIXI.Graphics();paintRelicPanel(header,7,7,width-14,63,kind==='output'?0x302619:0x25302e,RELIC.brass,1);header.eventMode='none';parent.addChild(header);
  addResourceIcon(parent,'stock',29,37,25);
  const mark=new PIXI.Graphics().lineStyle(2,accent);
  if(kind==='output')mark.moveTo(29,29).lineTo(29,15).moveTo(23,21).lineTo(29,15).lineTo(35,21);
  else mark.moveTo(16,24).lineTo(16,51).lineTo(42,51).lineTo(42,24);
  mark.eventMode='none';parent.addChild(mark);
  const heading=label(parent,name,56,13,28,RELIC.bone);heading.scale.set(Math.min(1,(width-265)/heading.width));
  const base=label(parent,'Base \u00d71',56,44,20,RELIC.ash);
  const number=label(parent,`\u00d7${pool.multiplier}`,width-(pinned?56:20),15,43,accent);number.anchor.x=1;number.scale.set(Math.min(1,112/number.width));
  if(before!==undefined&&before!==pool.multiplier) {
    const previous=label(parent,`\u00d7${before} \u2192`,number.x-number.width-10,33,21,RELIC.ash);previous.anchor.x=1;
  }
  if(afterCompletion)addMultiplierCompletionBadge(parent,56+base.width+16,55,21);
  const rows=contributionRows(parent,groups,{width,top:80,onSources,onLeave});
  return {width,height:92+rows.height,rows};
}

export function addMultiplierSources(parent,entry) {
  const width=440;
  const title=label(parent,entry.label,16,12,27,RELIC.gold);title.scale.set(Math.min(1,(width-90)/title.width));
  const count=label(parent,String(entry.count),width-22,14,24,RELIC.ash);count.anchor.x=1;
  const rows=contributionRows(parent,entry.sources.map((source,index)=>({key:`${source.instanceId??source.id}:${index}`,label:source.label,amount:source.amount,count:1,sources:[source]})),{width,top:54});
  return {width,height:rows.height+66,rows};
}
