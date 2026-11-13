import {addFloatingSettlementPrototype} from './floating-settlement-prototype.js';
import {addMonsterReadout} from './monster-readout.js';
import {sharedCrestDisclosure} from './settlement-readout-layout.js';
// Accepted floating default; explicit earlier variant URLs remain development
// references. Read-only view data; model summaries own all control calculations.
import {compactRegionName} from '../region-label.js';
import {createText,roundedRect} from '../settlement-view-primitives.js';
import {TEXT_STYLES} from '../settlement-theme.js';
import {addResourceIcon} from '../resource-cost-pixi.js';
import {getTerritorialPrestigeForPopulation} from '../../model/vassal-life-map.js';

export function regionalReadoutVariant() {
  const value=new URLSearchParams(globalThis.location?.search??'').get('regionalReadout');
  return ['floating','atlas','shield','tracks','bracket'].includes(value)?value:'floating';
}
export function createRegionalReadoutRegistry(){
  const readouts=new Set();
  let crestsExpanded=false;
  function getFloatingReadoutMeasurements(){return [...readouts].filter(root=>!root.destroyed&&root.measureFloating).map(root=>root.measureFloating());}
  function getMonsterReadoutMeasurements(){return [...readouts].filter(root=>!root.destroyed&&root.worldVisible&&root.measureMonster).map(root=>root.measureMonster());}
  function updateRegionalReadoutScale(zoom,selectedRegionId=null){
    const progressive=[...readouts].filter(root=>!root.destroyed&&root.progressiveReadout&&root.mapRegionId!==selectedRegionId);
    const requirements=progressive.map(root=>root.expandedFitZoom);
    const disclosure=sharedCrestDisclosure(zoom,requirements,crestsExpanded);
    disclosure.selectedRegionId=selectedRegionId;
    // Recheck the actual zoom too: a concave border can make fit non-monotonic.
    // Each root caches unchanged zooms, so paused/panned frames do no geometry work.
    if(disclosure.expanded&&progressive.some(root=>!root.expandedFitsAtZoom(zoom)))disclosure.expanded=false;
    crestsExpanded=requirements.length>0&&disclosure.expanded;
    for(const root of readouts){if(root.destroyed){readouts.delete(root);continue;}if(root.updateFloatingLayout){root.updateFloatingLayout(zoom,disclosure);if(root.progressiveReadout&&root.mapRegionId===selectedRegionId&&root.parent&&root.parent.children.at(-1)!==root)root.parent.addChild(root);continue;}root.scale.set((root.atlasMarker?1.18:1.35)/Math.max(.25,zoom));}
  }
  return {add:root=>readouts.add(root),getFloatingReadoutMeasurements,getMonsterReadoutMeasurements,updateRegionalReadoutScale};
}

const number=value=>String(Number(Number(value??0).toFixed(1)));
const text=(root,value,x,y,size=18,colour=0xe6dcc4)=>{
  const label=createText(value,{...TEXT_STYLES.body,fontSize:size,fill:colour},x,y);
  root.addChild(label);return label;
};
function shield(root,p,x,y) {
  const colour=p.contested?0xe48a75:p.status==='occupied'?0x97b3c2:0xa6b18e;
  const g=new PIXI.Graphics().lineStyle(1.5,colour).beginFill(0x222b28,.98)
    .drawPolygon([x-10,y-9,x+10,y-9,x+9,y+5,x,y+12,x-9,y+5]).endFill();
  root.addChild(g);text(root,p.status==='supported'?'•':p.contested?'!':'F',x-5,y-8,15,colour);
}
function VariantShield(root,p){shield(root,p,61,33);}
function VariantTracks(root,p){
  const ratio=p.required>0?Math.min(1,p.force/p.required):0;
  const g=new PIXI.Graphics().beginFill(0x38413c).drawRect(-62,42,108,4).endFill();
  if(ratio>0)g.beginFill(p.contested?0xd67e69:0x9bb6c5).drawRect(-62,42,108*ratio,4).endFill();
  root.addChild(g);text(root,'F',51,36,13,0x9bb6c5);
}
function VariantBracket(root,p){
  const disloyal=p.total-(p.parts.find(part=>part.id===p.holder)?.count??0);
  const coverage=p.required>0?Math.min(1,p.force/p.required):0;
  const w=124*(disloyal/Math.max(1,p.total))*coverage;
  const g=new PIXI.Graphics().lineStyle(2,0x9bb6c5).moveTo(62-w,40).lineTo(62-w,45).lineTo(62,45).lineTo(62,40);
  root.addChild(g);text(root,'F',51,45,12,0x9bb6c5);
}

export function addRegionalReadoutPrototype(parent,point,indicator,{tooltipView,reference,variant,spriteBounds,landmarkBounds,regionPolygon,forceSample,registry}){
  if(indicator.monster){const root=addMonsterReadout(parent,point,indicator,{tooltipView,reference});if(root)registry.add(root);return root;}
  if(variant==='floating'){const root=addFloatingSettlementPrototype(parent,point,indicator,{tooltipView,reference,spriteBounds,landmarkBounds,regionPolygon,forceSample});if(root)registry.add(root);return root;}
  if(variant==='atlas')return addAtlasMarker(parent,point,indicator,{tooltipView,reference,registry});
  const p=indicator.influence;if(!p||indicator.monster)return;
  const root=new PIXI.Container();root.label='regional-readout-prototype';registry.add(root);root.position.set(point.x,point.y+27);
  const held=indicator.controller==='player',crown=indicator.controller==='external-a';
  const ink=crown?0xb77c5b:held?0xc7ab6e:0x89998e;
  const g=new PIXI.Graphics().lineStyle(1,ink,.85).beginFill(0x14201a,.94).drawRoundedRect(-73,-5,146,85,5).endFill();
  root.addChild(g);
  // A single total worker count; residents remain a separate quantity.
  const worker=new PIXI.Graphics().beginFill(0xe6dcc4).drawCircle(-57,6,3).drawRoundedRect(-61,11,8,9,2).endFill();root.addChild(worker);
  text(root,String(indicator.totalWorkerCount),-46,-2,24);
  text(root,`${p.total} people`,4,4,15,0xaeb8a6);
  let x=-62;
  for(const part of p.parts){const w=124*part.count/p.total;g.lineStyle(0).beginFill(part.colour).drawRect(x,29,w,8).endFill();x+=w;}
  g.lineStyle(1,0x716f56).drawRect(-63,28,126,10);
  ({shield:VariantShield,tracks:VariantTracks,bracket:VariantBracket}[variant])(root,p);
  const value=held?indicator.prestigePerNode:getTerritorialPrestigeForPopulation(p.total);
  if(held||crown){
    addResourceIcon(root,'prestige',-55,62,21);
    text(root,`${held?'+':'◇ '}${number(value)}`,-39,50,22,held?0xe9d49b:0xbca58a);
    text(root,held?'/ node':'if held',16,57,14,0xaeb8a6);
  }else text(root,'Unheld',-29,53,17,0xaeb8a6);
  const status=p.status==='supported'?'Population support':p.status==='occupied'?'Military occupation':p.status==='unheld'?'Unheld':'Control in contention';
  const spec={title:`${reference} · ${status}`,lines:[
    `${indicator.totalWorkerCount} total workers: ${indicator.activeWorkerCount} assigned, ${indicator.unusedWorkerCount} unused.`,
    `${p.total} residents. Workers and residents are different counts.`,
    ...p.parts.map(part=>`${part.name}: ${part.count} (${Math.round(part.count/p.total*100)}%).`),
    p.status==='supported'?`Population support secures control; holding Force ${number(p.force)} is not needed to retain it.`:`Holder's Force: ${number(p.force)} / ${p.required===null?'needs local allegiance':number(p.required)} required for occupation.`,
    'Force is military holding, not additional population allegiance.',
    ...(held?[`${number(value)} Prestige per completed node into the shared civilization treasury.`,'Income is inactive during Unrest.']:crown?[`Potential ${number(value)} Prestige per completed node if player-held under settled control.`,`This is a settled-control estimate, not a capture quote or current income.`]:[]),
    'Tap the settlement artwork to inspect its economy.',
  ],maxWidth:410};
  root.eventMode='static';root.cursor='help';root.hitArea=new PIXI.Rectangle(-73,-5,146,85);
  root.on('pointerover',e=>{if(e.pointerType!=='touch')tooltipView?.show?.(spec,root.getBounds(),{dismissOnExit:true});});
  root.on('pointerout',()=>tooltipView?.hide?.());
  root.on('pointerdown',e=>{e.stopPropagation();tooltipView?.pin?.(spec,root.getBounds(),`regional-prototype:${reference}`);});
  parent.addChild(root);
}


// Iteration 1: world first. Small heraldic markers, only our holdings carry
// routine numbers. Full figures live in one deliberate regional focus panel.
function addAtlasMarker(parent,point,indicator,{tooltipView,reference,registry}){
  const p=indicator.influence;if(!p||indicator.monster)return;
  const held=indicator.controller==='player',crown=indicator.controller==='external-a';
  const ink=held?0xf0d18a:crown?0xbe906e:0x9bbdb2;
  const root=new PIXI.Container();root.atlasMarker=true;root.label='atlas-settlement-marker';
  root.mapRegionId=indicator.regionId;root.position.set(point.x,point.y+20);registry.add(root);
  const g=new PIXI.Graphics();root.addChild(g);
  // Population changes the heraldic seal's size, never the allegiance share.
  const radius=held?20:Math.min(16,10+Math.sqrt(p.total)*.45);
  g.lineStyle(held?2:1.5,ink,held?1:.8).beginFill(0x17251e,.92)
    .drawCircle(0,0,radius).endFill();
  if(held){
    g.lineStyle(1,ink,.35).drawCircle(0,0,radius+5);
    g.lineStyle(0).beginFill(0xffe8b3).drawCircle(-9,-7,3).drawRoundedRect(-12,-2,6,10,2).endFill();
    const n=text(root,String(indicator.totalWorkerCount),6,-14,27,0xffebae);n.anchor.x=.5;
  }else{
    // A simple keep silhouette keeps these recognisable as places, not stats.
    g.lineStyle(0).beginFill(ink,.9).drawRect(-6,-1,12,9).drawRect(-7,-6,4,8).drawRect(3,-6,4,8).drawRect(-2,-9,4,12).endFill();
    g.beginFill(0x17251e).drawRect(-1,3,3,5).endFill();
  }
  const label=text(root,compactRegionName(reference),0,held?29:23,held?23:21,held?0xffe8b3:0xd0c4ac);label.anchor.x=.5;
  label.style.stroke=0x101b16;label.style.strokeThickness=4;
  const maxWidth=held?195:174;if(label.width>maxWidth)label.scale.set(maxWidth/label.width);
  if(held){
    g.lineStyle(0).beginFill(0x111d17,.75).drawRoundedRect(-54,55,108,27,10).endFill();
    addResourceIcon(root,'prestige',-28,68,20);
    const income=text(root,'+'+number(indicator.prestigePerNode),-10,54,24,0xe9d49b);
    income.accessibleTitle='Prestige per completed node';
  }
  // A thin political seam replaces the broad framed bar. Exceptions get a
  // shield; ordinary population-supported towns don't repeat a status icon.
  const y=held?51:45,width=held?112:82;let x=-width/2;
  for(const part of p.parts){const w=width*part.count/p.total;g.lineStyle(0).beginFill(part.colour,held?1:.65).drawRect(x,y,w,3).endFill();x+=w;}
  if(p.contested||p.status==='occupied')shield(root,p,width/2+13,y+1);
  const spec={title:reference,lines:[`${p.total} residents ? ${indicator.totalWorkerCount} total workers.`,
    p.holder==='player'?'Your realm':p.holder==='external-a'?'Crown holding':'Independent settlement',
    p.status==='supported'?'Population support secures control.':p.status==='occupied'?'Held by supplied military Force.':p.contested?'Control is in contention.':'Unheld territory.',
    'Larger foreign settlement seals indicate more residents.',
    'Select this settlement to inspect allegiance, Force and Prestige.'],maxWidth:340};
  root.eventMode='static';root.cursor='pointer';root.hitArea=new PIXI.Rectangle(-100,-25,200,held?110:85);
  root.on('pointerover',e=>{if(e.pointerType!=='touch')tooltipView?.show?.(spec,root.getBounds(),{dismissOnExit:true});});
  root.on('pointerout',()=>tooltipView?.hide?.());
  parent.addChild(root);return root;
}

export const ATLAS_FOCUS_RECT=Object.freeze({x:48,y:478,width:850,height:322});
export const ATLAS_ECONOMY_POINT=Object.freeze({x:735,y:753});
export function addAtlasFocus(root,indicator,{reference,onEconomy,onClose,addButton,tooltipView}){
  const p=indicator?.influence;if(!p)return;
  const {x,y,width,height}=ATLAS_FOCUS_RECT,held=indicator.controller==='player';
  const colour=held?0xe8cb89:0xc49472;
  const g=new PIXI.Graphics();roundedRect(g,x,y,width,height,8,0x14211c,0x756443,2,.97);
  g.lineStyle(3,colour,.8).moveTo(x+23,y+1).lineTo(x+width-23,y+1);root.addChild(g);
  g.eventMode='static';g.hitArea=new PIXI.Rectangle(x,y,width,height);
  text(root,reference,x+26,y+18,31,0xffe7b4);
  text(root,held?'YOUR REALM':indicator.controller==='external-a'?'CROWN HOLDING':'INDEPENDENT',x+27,y+58,17,colour);
  addButton(root,{x:x+width-64,y:y+12,width:48,height:48},'X',onClose);
  const value=held?indicator.prestigePerNode:getTerritorialPrestigeForPopulation(p.total);
  text(root,String(indicator.totalWorkerCount),x+28,y+86,48);
  text(root,'WORKERS',x+30,y+139,18,0xaeb8a6);
  text(root,String(p.total),x+242,y+86,48);
  text(root,'RESIDENTS',x+244,y+139,18,0xaeb8a6);
  addResourceIcon(root,'prestige',x+498,y+115,31);
  text(root,'+'+number(value),x+522,y+86,48,held?0xf1d99e:0xc4ae90);
  text(root,held?'PER COMPLETED NODE':'POTENTIAL / NODE',x+481,y+139,17,0xaeb8a6);
  const widthBar=width-56;let bx=x+28;
  for(const part of p.parts){const w=widthBar*part.count/Math.max(1,p.total);g.lineStyle(0).beginFill(part.colour).drawRect(bx,y+180,w,10).endFill();bx+=w;}
  text(root,p.parts.map(part=>`${part.name} ${part.count}`).join('  ?  '),x+28,y+200,20,0xcac9b8);
  const status=p.status==='supported'?'Population-supported':p.status==='occupied'?'Military occupation':p.contested?'Control contested':'Unheld';
  text(root,status,x+28,y+244,22,p.contested?0xea957f:0xd5d3bc);
  text(root,`Force ${number(p.force)}${p.required===null?' / –':p.required?' / '+number(p.required):''}  ?  ${p.unrest?`Unrest ${Math.ceil(p.unrest.remainingYears)}y`:p.status}`,x+28,y+279,18,0xaeb8a6);
  addButton(root,{x:x+width-294,y:y+235,width:270,height:80},'Economy',onEconomy);
  if(!held){
    const tip={title:'Potential territorial Prestige',lines:['Potential Prestige if you held this region.','Not current income, a capture quote, or a Crown treasury.','One Prestige per full '+indicator.prestigePopulationPerPoint+' residents, rounded down separately for this region.'],maxWidth:350};
    const hit=new PIXI.Graphics().beginFill(0xffffff,.001).drawRect(x+470,y+85,330,79).endFill();hit.eventMode='static';hit.cursor='help';hit.hitArea=new PIXI.Rectangle(x+470,y+85,330,79);
    hit.on('pointerdown',e=>{e.stopPropagation();tooltipView?.pin?.(tip,hit.getBounds(),'atlas-potential');});root.addChild(hit);
  }
}
