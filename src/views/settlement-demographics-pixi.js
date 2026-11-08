// Read-only, in-game census. Details use the existing touch/hover inspection.
import {createText,roundedRect} from './settlement-view-primitives.js';
import {TEXT_STYLES,PALETTE} from './settlement-theme.js';
import {addResourceIcon} from './resource-cost-pixi.js';
import {getGameSetting} from '../model/game-config.js';

const FACTIONS={
 player:{name:'Free realm',colour:0xe4c271,icon:'freeAllegiance'},
 'external-a':{name:'Crown',colour:0xc17a57,icon:'crown'},
 neutral:{name:'Unaffiliated',colour:0x8e9c91,icon:'population'},
 unrecorded:{name:'Unrecorded',colour:0x8e9c91,icon:'population'},
};
const ROLES=[{id:'ordinary',name:'Ordinary',icon:'population'},{id:'warrior',name:'Warriors',icon:'stock-arms'},{id:'scholar',name:'Scholars',icon:'knowledge'}];
const AGE_COLOURS=[0x86aeb4,0xd9bb78,0xa3a38e];
const number=n=>String(Math.max(0,Math.round(n??0)));
const percent=n=>Math.round(n*100)+'%';
const chance=n=>Number((n*100).toFixed(2))+'%';
const amount=n=>String(Number(Number(n??0).toFixed(2)));
function text(parent,value,x,y,size=32,fill=PALETTE.text,bold=false){
 const t=createText(String(value),{...TEXT_STYLES.body,fontSize:size,fill,fontWeight:bold?'bold':'normal'},x,y);parent.addChild(t);return t;
}
function title(parent,value,x,y){const t=createText(value,{...TEXT_STYLES.title,fontSize:36},x,y);parent.addChild(t);}
function inspect(parent,rect,spec,tooltipView,key,targets){
 spec={...spec,maxWidth:330,scale:3.5};
 const hit=new PIXI.Container();hit.position.set(rect.x,rect.y);hit.hitArea=new PIXI.Rectangle(0,0,rect.width,rect.height);hit.eventMode='static';hit.cursor='help';
 hit.on('pointerover',e=>{if(e.pointerType!=='touch')tooltipView?.show?.(spec,hit.getBounds(),{dismissOnExit:true});});
 hit.on('pointerout',()=>tooltipView?.hide?.());
 hit.on('pointerdown',e=>{e.stopPropagation();tooltipView?.pin?.(spec,hit.getBounds(),key);});
 parent.addChild(hit);targets[key]={x:rect.x+rect.width/2,y:rect.y+rect.height/2};
}
function meter(parent,x,y,width,value,colour){
 const g=new PIXI.Graphics();g.beginFill(0x121b19,.9).drawRoundedRect(x,y,width,16,5).endFill();
 const fill=Math.max(0,Math.min(1,value));if(fill)g.beginFill(colour).drawRoundedRect(x,y,width*fill,16,5).endFill();parent.addChild(g);
}
function person(parent,x,y,kind,colour){
 const g=new PIXI.Graphics().beginFill(colour);
 const child=kind==='children',head=child?7:9,body=child?20:29;
 g.drawCircle(x,y-(child?13:22),head).drawRoundedRect(x-10,y-7,20,body,7).endFill();
 g.lineStyle(5,colour).moveTo(x-5,y+body-9).lineTo(x-7,y+body+5).moveTo(x+5,y+body-9).lineTo(x+7,y+body+5);
 if(kind==='elders')g.lineStyle(3,colour).moveTo(x+20,y-8).lineTo(x+23,y+body+7);
 parent.addChild(g);
}
export function drawSettlementDemographics(parent,{state,vm,tooltipView}){
 const d=vm.demographics,targets={},left={x:48,y:78,width:800,height:724},right={x:866,y:78,width:1510,height:724};
 for(const r of [left,right]){const g=new PIXI.Graphics();roundedRect(g,r.x,r.y,r.width,r.height,8,PALETTE.panelSoft,PALETTE.stroke,2);parent.addChild(g);}
 title(parent,'Population',76,97);
 const hint=text(parent,'Tap for details',820,103,32,PALETTE.textMuted);hint.anchor.x=1;
 addResourceIcon(parent,'population',119,205,76);text(parent,number(d.population.total),177,155,78,PALETTE.text,true);text(parent,'Residents',181,242,32,PALETTE.textMuted);
 const residents=d.residency.map(c=>number(c.total)+' '+(c.id==='villager'?'villagers':'strangers')).join('  ·  ');
 text(parent,residents,76,287,32);
 const rates=d.residency.filter(c=>c.total>0).flatMap(c=>[
  (c.id==='villager'?'Villagers':'Strangers')+': '+c.faith+' Faith; '+c.happiness+' mood.',
  'Per Birth phase: '+chance(c.birthChance)+' birth chance, '+chance(c.maturityChance)+' child maturity, '+chance(c.elderChance)+' adult aging.',
  'Expected per phase: '+c.expectedBirths.toFixed(1)+' births and '+c.expectedMatured.toFixed(1)+' children coming of age.',
  'Meals: '+c.fullFeedStreak+'/'+getGameSetting(state,'fullFeedStreakForIncrease')+' full; '+c.missedFeedStreak+'/'+getGameSetting(state,'missedFeedStreakForStarvation')+' missed.',
 ]);
 inspect(parent,{x:76,y:155,width:744,height:163},{title:'Residents and growth',lines:vm.neutral?['This unheld town has a static population until a faction takes control.',residents]:[residents,...rates]},tooltipView,'census:population',targets);
 inspect(parent,{x:560,y:87,width:260,height:65},{title:'Residents and growth',lines:vm.neutral?['This unheld town has a static population until a faction takes control.',residents]:[residents,...rates]},tooltipView,'census:details',targets);
 let offset=76;const ageBar=new PIXI.Graphics().beginFill(0x121b19,.9).drawRoundedRect(76,444,744,16,5).endFill();
 for(const [i,[id,label]] of [['children','Children'],['adults','Adults'],['elders','Elders']].entries()){
  const x=76+i*248,count=d.population[id];person(parent,x+26,369,id,AGE_COLOURS[i]);text(parent,number(count),x+66,332,49,PALETTE.text,true);text(parent,label,x+66,391,32,AGE_COLOURS[i]);
  const w=d.population.total?744*count/d.population.total:0;if(w)ageBar.beginFill(AGE_COLOURS[i]).drawRect(offset,444,w,16).endFill();offset+=w;
  const detail=id==='elders'?[
   'Mortality chances apply per Death phase.',
   ...[[0,49,'elderMortalityThrough49'],[50,54,'elderMortality50To54'],[55,59,'elderMortality55To59'],[60,64,'elderMortality60To64'],[65,69,'elderMortality65To69'],[70,74,'elderMortality70To74'],[75,Infinity,'elderMortality75Plus']].map(([lo,hi,key])=>{
    const count=d.elderAges.filter(e=>e.age>=lo&&e.age<=hi).reduce((n,e)=>n+e.count,0);
    return count?number(count)+' aged '+(hi===Infinity?'75+':lo===0?'under 50':lo+'–'+hi)+' · '+chance(getGameSetting(state,key))+' mortality.':null;
   }).filter(Boolean),
  ]:id==='children'?['Children need meals and housing. They provide no Warrior Force until mature.','Newborns inherit their source cohort’s specialty. Allegiance follows local shares with fractional entitlement carried across births.']:['Adults provide labour. Loyal adult Warriors also provide baseline Force while working.'];
  inspect(parent,{x,y:326,width:236,height:112},{title:number(count)+' '+label.toLowerCase(),lines:detail.length?detail:['None in this age group.']},tooltipView,'census:'+id,targets);
 }
 parent.addChild(ageBar);
 const capacity=vm.population.housingCapacity,total=d.population.total,gap=Math.max(0,total-capacity),housingRatio=total?capacity/total:1;
 addResourceIcon(parent,'housingCapacity',101,514,42);text(parent,'Housing',135,490,34,PALETTE.text,true);
 const housingValue=text(parent,number(total)+' / '+number(capacity),820,489,40,PALETTE.text,true);housingValue.anchor.x=1;
 text(parent,gap?number(gap)+' more capacity needed':'Capacity available',76,545,32,gap?PALETTE.red:PALETTE.green);
 meter(parent,76,592,744,housingRatio,gap?PALETTE.red:PALETTE.green);
 inspect(parent,{x:76,y:487,width:744,height:124},{title:'Housing capacity',lines:[number(total)+' residents; space for '+number(capacity)+'.',gap?number(gap)+' above housing capacity.':'Housing covers the current population.','Housing pressure affects happiness and migration.']},tooltipView,'census:housing',targets);
 const meal=vm.lastMeal,ratio=meal?.ratio??0;
 addResourceIcon(parent,'stock-edible',101,664,42);text(parent,'Meals',135,640,34,PALETTE.text,true);
 const mealValue=text(parent,meal?amount(meal.consumed)+' / '+amount(meal.demand):'—',820,639,40,PALETTE.text,true);mealValue.anchor.x=1;
 const mealLabel=meal?(meal.demand===0?'No meals needed':percent(ratio)+' supplied · last meal'):(vm.neutral?'No active meal demand':'First meal not resolved');
 text(parent,mealLabel,76,695,32,meal?(ratio>=1?PALETTE.green:PALETTE.red):PALETTE.textMuted);
 meter(parent,76,742,744,ratio,ratio>=1?PALETTE.green:PALETTE.red);
 inspect(parent,{x:76,y:637,width:744,height:124},{title:'Last resolved meal',lines:meal?[
  amount(meal.consumed)+' Edible Stock supplied of '+amount(meal.demand)+' required.',
  ...Object.entries(meal.byClass??{}).map(([id,c])=>(id==='villager'?'Villagers':'Strangers')+': '+number(c.consumed)+' of '+number(c.demand)+' people fed.'),
  'Meals use local hosted food first, then valid allied or priced neutral supply. One Edible Stock feeds 30 people.',
 ]:[vm.neutral?'The storefront population is static until control activates this town.':'No meal has resolved at this viewed time.']},tooltipView,'census:meals',targets);
 title(parent,'Allegiance & class',894,97);
 const holder=vm.control?.holder,holderName=FACTIONS[holder]?.name??'Unheld town';
 const control=text(parent,holderName+(holder==='player'||holder==='external-a'?'  ·  '+number(vm.control.force)+' Force':''),2348,106,30,FACTIONS[holder]?.colour??PALETTE.textMuted);control.anchor.x=1;
 const cols=[1230,1600,1970];
 for(const [i,role] of ROLES.entries()){
  const c=d.specialties[role.id];addResourceIcon(parent,role.icon,cols[i]+26,183,45);
  text(parent,role.name,cols[i]+61,159,32,PALETTE.text,true);text(parent,number(c.total),cols[i]+61,203,45,PALETTE.text,true);
  const detail=role.id==='warrior'?['Warrior class is independent of allegiance.',number(c.adults+c.elders)+' adults/Elders; '+number(c.children)+' children.','Only adult/Elder Warriors loyal to the holder provide its baseline Force. Working does not remove that benefit.']:role.id==='scholar'?['Scholar class is independent of allegiance.','Scholars can staff specialist sockets in Practices.']:['Residents without a specialist class.','Villager/Stranger residency and faction allegiance are separate identities.'];
  inspect(parent,{x:cols[i],y:153,width:350,height:100},{title:number(c.total)+' '+role.name,lines:detail},tooltipView,'census:role:'+role.id,targets);
 }
 for(const [row,[id,faction]] of Object.entries(d.byAllegiance).entries()){
  const f=FACTIONS[id]??FACTIONS.unrecorded,y=278+row*120;
  addResourceIcon(parent,f.icon,922,y+37,43);text(parent,f.name,958,y+5,32,f.colour,true);
  text(parent,number(faction.total),958,y+50,44,PALETTE.text,true);text(parent,total?percent(faction.total/total):'—',1110,y+63,29,PALETTE.textMuted);
  inspect(parent,{x:894,y,width:300,height:108},{title:f.name+' allegiance',lines:[number(faction.total)+' residents: '+number(faction.children)+' children, '+number(faction.adults)+' adults, '+number(faction.elders)+' Elders.','Allegiance is who people support. It is separate from their class and the current holder.']},tooltipView,'census:faction:'+id,targets);
  for(const [i,role] of ROLES.entries()){
   const c=faction.specialties[role.id],g=new PIXI.Graphics();g.beginFill(PALETTE.slot,c.total ? .7 : .3).drawRoundedRect(cols[i],y,350,108,7).endFill();parent.addChild(g);
   text(parent,c.total?number(c.total):'—',cols[i]+20,y+9,49,c.total?PALETTE.text:PALETTE.textMuted,true);
   meter(parent,cols[i]+20,y+80,310,d.specialties[role.id].total?c.total/d.specialties[role.id].total:0,f.colour);
   inspect(parent,{x:cols[i],y,width:350,height:108},{title:f.name+' · '+role.name,lines:[
    number(c.total)+' residents: '+number(c.children)+' children, '+number(c.adults)+' adults, '+number(c.elders)+' Elders.',
    'The bar shows this faction’s share of the '+role.name.toLowerCase()+' column.',
    ...(role.id==='warrior'?[id===holder?number(c.adults+c.elders)+' loyal adults/Elders can contribute baseline Force.':'These Warriors do not supply the current holder’s baseline Force.']:[]),
   ]},tooltipView,'census:cell:'+id+':'+role.id,targets);
  }
 }
 const divider=new PIXI.Graphics().lineStyle(1,PALETTE.stroke,.7).moveTo(894,651).lineTo(2348,651);parent.addChild(divider);
 text(parent,'Last moon',894,674,32,PALETTE.text,true);
 if(d.lastMoon.available){
  const events=[['Births',d.lastMoon.births,PALETTE.green],['Matured',d.lastMoon.matured,PALETTE.text],['Deaths',d.lastMoon.deaths,PALETTE.red],['In / out',d.lastMoon.arrivals+' / '+d.lastMoon.departures,PALETTE.text]];
  for(const [i,[name,value,colour]] of events.entries()){text(parent,value,1230+i*280,670,45,colour,true);text(parent,name,1230+i*280,732,32,PALETTE.textMuted);}
 }else text(parent,'No complete moon yet',1230,698,32,PALETTE.textMuted);
 return {layout:{left,right},inspectionTargets:targets,population:d.population,allegiances:d.byAllegiance,specialties:d.specialties,
   housing:{capacity,demand:total,gap},meals:meal?{consumed:meal.consumed,demand:meal.demand,ratio:meal.ratio}:null,lastMoon:d.lastMoon};
}

