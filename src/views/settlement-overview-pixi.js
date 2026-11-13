import {createText, roundedRect} from './settlement-view-primitives.js';
import {TEXT_STYLES, PALETTE} from './settlement-theme.js';
import {addResourceIcon} from './resource-cost-pixi.js';
import {regionAllegianceParts, unrestReading} from './region-allegiance.js';
import {addInteractionFeedback} from './interaction-feedback.js';

const LOCAL = 0xd9b96e, LINKED = 0x80b7b4;
const amount = value => String(Number(Number(value ?? 0).toFixed(2)));
const percent = value => `${Number((value * 100).toFixed(1))}%`;
export const OVERVIEW_LAYOUT = Object.freeze({
  stock: {x:48,y:78,width:540,height:716},
  practices: {x:606,y:78,width:1120,height:434},
  structures: {x:606,y:530,width:1120,height:264},
  population: {x:1744,y:78,width:632,height:716},
});

function text(parent, value, x, y, size=28, colour=PALETTE.text, bold=false, anchor=0) {
  const item = createText(String(value), {...TEXT_STYLES.body,fontSize:size,fill:colour,fontWeight:bold?'bold':'normal'},x,y,anchor);
  parent.addChild(item);return item;
}
function fit(item, width) { item.scale.set(Math.min(1,width/Math.max(1,item.width)));return item; }
export function overviewPanel(parent, rect, title) {
  const g = new PIXI.Graphics();
  roundedRect(g,rect.x,rect.y,rect.width,rect.height,8,PALETTE.panelSoft,PALETTE.stroke,2);
  parent.addChild(g,createText(title,{...TEXT_STYLES.title,fontSize:30},rect.x+20,rect.y+17));
}
function line(parent, x,y,width) {
  parent.addChild(new PIXI.Graphics().lineStyle(1,PALETTE.stroke,.6).moveTo(x,y).lineTo(x+width,y));
}
export function overviewInspect(parent,rect,spec,tooltipView,key,targets) {
  const hit=new PIXI.Container();hit.position.set(rect.x,rect.y);
  hit.hitArea=new PIXI.Rectangle(0,0,rect.width,rect.height);hit.eventMode='static';hit.cursor='help';
  const reading={...spec,maxWidth:410,scale:2.5};
  hit.on('pointerover',e=>{if(e.pointerType!=='touch')tooltipView?.show?.(reading,hit.getBounds(),{dismissOnExit:true});});
  hit.on('pointerout',()=>tooltipView?.hide?.());
  hit.on('pointerdown',e=>{e.stopPropagation();tooltipView?.pin?.(reading,hit.getBounds(),key);});
  parent.addChild(hit);
  if(targets)targets[key]={x:rect.x+rect.width/2,y:rect.y+rect.height/2};
}
export function overviewButton(parent,rect,label,onActivate,{enabled=true}={}) {
  const root=new PIXI.Container();root.position.set(rect.x,rect.y);
  const g=new PIXI.Graphics();roundedRect(g,0,0,rect.width,rect.height,6,PALETTE.panel,PALETTE.stroke,2);
  root.addChild(g);
  if(label==='‹'||label==='›') {
    const cx=rect.width/2,cy=rect.height/2,dir=label==='‹'?-1:1;
    g.lineStyle(3,enabled?PALETTE.text:PALETTE.textMuted).moveTo(cx-dir*5,cy-9).lineTo(cx+dir*5,cy).lineTo(cx-dir*5,cy+9);
  } else fit(text(root,label,rect.width/2,7,28,enabled?PALETTE.text:PALETTE.textMuted,true,.5),rect.width-16);
  root.eventMode='static';root.hitArea=new PIXI.Rectangle(0,0,rect.width,rect.height);root.alpha=enabled?1:.45;
  addInteractionFeedback(root,{x:0,y:0,width:rect.width,height:rect.height},{enabled,onActivate});
  parent.addChild(root);return root;
}
function bar(parent,x,y,width,ratio,colour,height=12) {
  const g=new PIXI.Graphics().beginFill(PALETTE.slot).drawRoundedRect(x,y,width,height,3).endFill();
  if(ratio>0)g.beginFill(colour).drawRoundedRect(x,y,width*Math.min(1,ratio),height,3).endFill();
  parent.addChild(g);
}

export function drawRegionalStock(parent,{stock,tooltipView,page=0,onPage}) {
  const rect=OVERVIEW_LAYOUT.stock,{x,y,width}=rect,targets={};
  overviewPanel(parent,rect,'Regional Stock');
  text(parent,'Local',x+40,y+65,25,LOCAL);
  text(parent,'Connected allies',x+164,y+65,25,LINKED);
  const dots=new PIXI.Graphics().beginFill(LOCAL).drawCircle(x+25,y+80,5).endFill().beginFill(LINKED).drawCircle(x+149,y+80,5).endFill();parent.addChild(dots);
  text(parent,amount(stock.total),x+width-22,y+53,45,PALETTE.text,true,1);
  text(parent,'total units',x+width-22,y+103,22,PALETTE.textMuted,false,1);
  text(parent,'Stock traits',x+20,y+148,25,PALETTE.textMuted);
  for(const [label,offset] of [['Local',300],['Linked',394],['Total',518]])text(parent,label,x+offset,y+148,25,PALETTE.textMuted,false,1);
  line(parent,x+20,y+184,width-40);
  const pageCount=Math.max(1,Math.ceil(stock.rows.length/6)),activePage=Math.min(page,pageCount-1);
  stock.rows.slice(activePage*6,activePage*6+6).forEach((row,i)=>{
    const rowY=y+196+i*59;
    const primary=row.traits.find(trait=>!['Edible','Construction'].includes(trait))??row.traits[0];
    addResourceIcon(parent,`stock-${primary.toLowerCase()}`,x+37,rowY+19,36);
    fit(text(parent,primary,x+66,rowY-2,26),160);
    const otherTraits=row.traits.filter(trait=>trait!==primary);
    if(otherTraits.length)fit(text(parent,otherTraits.join(' · '),x+66,rowY+25,21,PALETTE.textMuted),160);
    text(parent,amount(row.local),x+300,rowY,30,LOCAL,true,1);
    text(parent,amount(row.linked),x+394,rowY,30,LINKED,true,1);
    fit(text(parent,amount(row.total),x+518,rowY-2,34,PALETTE.text,true,1),104);
    const g=new PIXI.Graphics().beginFill(PALETTE.slot).drawRect(x+20,rowY+45,width-40,5).endFill();
    if(row.total){
      const localWidth=(width-40)*row.local/row.total;
      if(localWidth)g.beginFill(LOCAL).drawRect(x+20,rowY+45,localWidth,5).endFill();
      if(row.linked)g.beginFill(LINKED).drawRect(x+20+localWidth,rowY+45,width-40-localWidth,5).endFill();
    }
    parent.addChild(g);
    overviewInspect(parent,{x:x+14,y:rowY-3,width:width-28,height:56},{title:row.traits.join(' · '),lines:[
      `${amount(row.total)} Stock: ${amount(row.local)} local + ${amount(row.linked)} from connected allies.`,
      'Each unit has all the listed traits. This row counts it once.',
      ...row.sources.map(s=>`${s.regionName} · ${s.practice}: ${amount(s.amount)}${s.local?' (local)':''}.`),
      'Current inventory, not a reserved supply or production rate. Allied towns use their own meals first.',
    ]},tooltipView,'overview:stock:'+row.key,targets);
  });
  if(!stock.rows.length)text(parent,'No hosted Stock',x+20,y+210,30,PALETTE.textMuted);
  const footerY=y+558;
  if(pageCount>1){
    overviewButton(parent,{x:x+20,y:footerY,width:58,height:48},'‹',()=>onPage((activePage-1+pageCount)%pageCount));
    text(parent,`${activePage+1} / ${pageCount}`,x+100,footerY+9,26,PALETTE.textMuted);
    overviewButton(parent,{x:x+194,y:footerY,width:58,height:48},'›',()=>onPage((activePage+1)%pageCount));
  }else text(parent,`${stock.linkedRegionIds.length} connected ${stock.linkedRegionIds.length===1?'ally':'allies'}`,x+20,footerY+8,27,LINKED);
  line(parent,x+20,y+619,width-40);
  addResourceIcon(parent,'trade',x+36,y+650,32);
  text(parent,'Market offers',x+64,y+632,27,PALETTE.text,true);
  const marketTotal=stock.markets.reduce((sum,s)=>sum+s.amount,0);
  text(parent,stock.markets.length?`${amount(marketTotal)} units · priced separately`:'No connected markets',x+64,y+666,25,PALETTE.textMuted);
  overviewInspect(parent,{x:x+14,y:y+625,width:width-28,height:80},{title:'Connected market offers',lines:stock.markets.length?[
    'These offers are excluded from shared Stock totals. Purchases need local Currency.',
    ...stock.markets.map(s=>`${s.regionName}: ${amount(s.amount)} ${s.traits.join(' / ')} · ${amount(s.price)} Currency each.`),
    'Listed inventory is not necessarily affordable; meals and recipes buy only through the normal resolver.',
  ]:['No adjacent market has a live direct economic connection.']},tooltipView,'overview:markets',targets);
  return {...stock,page:activePage,pageCount,inspectionTargets:targets};
}

export function drawPopulationOverview(parent,{state,vm,tooltipView,onAssignGarrison}) {
  const rect=OVERVIEW_LAYOUT.population,{x,y,width}=rect,targets={},d=vm.demographics,c=vm.control;
  overviewPanel(parent,rect,'People & allegiance');
  addResourceIcon(parent,'population',x+46,y+101,52);
  text(parent,amount(vm.population.total),x+84,y+65,62,PALETTE.text,true);
  text(parent,'residents',x+86,y+132,26,PALETTE.textMuted);
  addResourceIcon(parent,'prestige',x+344,y+100,40);
  text(parent,vm.prestigePerNode===null?'—':`+${amount(vm.prestigePerNode)}`,x+377,y+73,43,LOCAL,true);
  text(parent,'Prestige / node',x+326,y+132,25,PALETTE.textMuted);
  overviewInspect(parent,{x:x+318,y:y+62,width:width-336,height:108},{title:'Territorial Prestige',lines:[
    vm.prestigePerNode===null?'This settlement contributes no Prestige to your realm.':`${amount(vm.prestigePerNode)} Prestige per completed node from this settlement.`,
    `Shared treasury: ${amount(vm.civilizationPrestige)} Prestige.`,
    `One Prestige per full ${vm.prestigePopulationPerPoint} residents, rounded down per region. Income is inactive during Unrest.`,
  ]},tooltipView,'overview:prestige',targets);
  const workers=vm.workerPool;
  text(parent,`${workers.availableWorkerCount} ${workers.availableWorkerCount===1?'worker':'workers'}`,x+22,y+188,32,PALETTE.text,true);
  text(parent,`${workers.activeWorkerCount} assigned · ${workers.unusedWorkerCount} free`,x+width-22,y+193,26,PALETTE.textMuted,false,1);
  line(parent,x+20,y+236,width-40);
  const parts=c?regionAllegianceParts(c):Object.entries(d.byAllegiance).map(([id,p])=>({id,name:id==='player'?'Free':id==='external-a'?'Crown':id==='unrecorded'?'Unrecorded':'Unaffiliated',count:p.total,colour:id==='player'?LOCAL:id==='external-a'?0xc17a57:0x8e9c91}));
  const held=c&&['player','external-a'].includes(c.holder);
  const ordered=held?[...parts.filter(p=>p.id===c.holder),...parts.filter(p=>p.id!==c.holder)]:parts;
  text(parent,c?.unrest?'Unrest':c?.status==='supported'?'Population-supported':c?.status==='occupied'?'Military occupation':c?.status==='contested'?'Control contested':'Allegiance',x+22,y+258,29,c?.unrest||c?.status==='contested'?PALETTE.red:PALETTE.text,true);
  if(held)text(parent,percent(c.share),x+width-22,y+254,34,LOCAL,true,1);
  const g=new PIXI.Graphics().beginFill(PALETTE.slot).drawRect(x+22,y+310,width-44,24).endFill();let cursor=x+22;
  for(const part of ordered){const w=vm.population.total?(width-44)*part.count/vm.population.total:0;if(w)g.beginFill(part.colour).drawRect(cursor,y+310,w,24).endFill();cursor+=w;}
  if(held&&vm.population.total){const tx=x+22+(width-44)*c.minimumShare;g.lineStyle(3,0xfff0c9).moveTo(tx,y+301).lineTo(tx,y+342);g.lineStyle(0).beginFill(0xfff0c9).drawPolygon([tx-7,y+298,tx+7,y+298,tx,y+306]).endFill();}
  parent.addChild(g);
  parts.forEach((p,i)=>{const px=x+22+i*196;text(parent,p.name,px,y+355,25,p.colour);text(parent,amount(p.count),px,y+386,34,p.colour,true);});
  overviewInspect(parent,{x:x+14,y:y+250,width:width-28,height:177},{title:'Population allegiance',lines:[
    ...parts.map(p=>`${p.name}: ${p.count} residents.`),
    ...(c?.unrest?unrestReading(c.unrest):held?[
      `${percent(c.share)} allegiance to the holder; ${percent(c.minimumShare)} needed at current Force.`,
      `The white marker is the holding threshold (${c.minimumLoyal} loyal residents).`,
      'Falling below it at a control check starts Unrest. Force does not add population allegiance.',
    ]:['This town has no holding faction.']),
  ]},tooltipView,'overview:allegiance',targets);
  const housing=vm.population.housingCapacity,total=vm.population.total;
  addResourceIcon(parent,'housingCapacity',x+39,y+461,32);
  text(parent,'Housing',x+64,y+443,27);
  text(parent,`${total} / ${housing}`,x+width-22,y+439,32,total>housing?PALETTE.red:PALETTE.text,true,1);
  bar(parent,x+22,y+485,width-44,housing?total/housing:total?1:0,total>housing?PALETTE.red:PALETTE.green);
  overviewInspect(parent,{x:x+14,y:y+433,width:width-28,height:69},{title:'Population & housing',lines:[
    `${total} residents; housing for ${housing}.`,
    `${d.population.children} children · ${d.population.adults} adults · ${d.population.elders} Elders.`,
    `${vm.specialists.scholar} Scholars · ${vm.specialists.warrior} Warriors (class is independent of allegiance).`,
  ]},tooltipView,'overview:housing',targets);
  addResourceIcon(parent,'stock-arms',x+39,y+535,32);
  text(parent,'Holding Force',x+64,y+517,27);
  text(parent,c?`${amount(c.force)} / ${c.required===null?'—':amount(c.required)}`:amount(vm.martialSupport),x+width-22,y+513,32,PALETTE.text,true,1);
  overviewInspect(parent,{x:x+14,y:y+506,width:width-28,height:58},{title:'Holding Force / required',lines:c?[
    `${amount(c.force)} Force; ${c.required===null?'local allegiance needed':amount(c.required)+' required to retain control'}.`,
    `${c.availableWarriors} loyal adult/Elder Warriors · ${amount(c.warriorForce)} baseline Force.`,
    'Warriors provide baseline Force while working. Population resistance and current allegiance set the required Force.',
  ]:['No faction control in this scenario.']},tooltipView,'overview:force',targets);
  line(parent,x+20,y+572,width-40);
  const meal=vm.lastMeal;
  addResourceIcon(parent,'stock-edible',x+39,y+609,32);
  text(parent,meal?`Last meal ${amount(meal.consumed)} / ${amount(meal.demand)}`:'First meal pending',x+64,y+590,29,meal&&meal.ratio<1?PALETTE.red:PALETTE.text,true);
  text(parent,`Demand ${amount(vm.population.mealDemand)}${vm.population.mealOverhead?` + ${amount(vm.population.mealOverhead)} upkeep`:''} Edible`,x+64,y+629,25,PALETTE.textMuted);
  if(c?.holder==='player'&&vm.supportTargets.length){
    const choices=[null,...vm.supportTargets],index=choices.indexOf(c.supportTarget);
    const name=c.supportTarget?state.world.regions.find(r=>r.id===c.supportTarget)?.name??c.supportTarget:'local';
    overviewButton(parent,{x:x+20,y:y+665,width:width-40,height:42},`Garrison: ${name} ›`,()=>onAssignGarrison?.(vm.regionId,choices[(index+1)%choices.length]));
  }else{
    fit(text(parent,`${vm.specialists.scholar} Scholars · ${vm.specialists.warrior} Warriors · ${d.population.elders} Elders`,x+22,y+675,26,PALETTE.textMuted),width-44);
  }
  return {population:vm.population.total,workers,parts,control:c,prestigePerNode:vm.prestigePerNode,inspectionTargets:targets};
}
