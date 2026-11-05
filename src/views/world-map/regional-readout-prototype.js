// Throwaway experiment: three Force treatments inside the real regional map.
// Read-only view data. No control, conversion, or Prestige rules are changed.
import {createText} from '../settlement-view-primitives.js';
import {TEXT_STYLES} from '../settlement-theme.js';
import {addResourceIcon} from '../resource-cost-pixi.js';

export function regionalReadoutVariant() {
  const value=new URLSearchParams(globalThis.location?.search??'').get('regionalReadout');
  return ['shield','tracks','bracket'].includes(value)?value:null;
}
const readouts=new Set();
export function updateRegionalReadoutScale(zoom){
  for(const root of readouts){if(root.destroyed){readouts.delete(root);continue;}root.scale.set(1.35/Math.max(.25,zoom));}
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

export function addRegionalReadoutPrototype(parent,point,indicator,{tooltipView,reference,variant}){
  const p=indicator.influence;if(!p||indicator.monster)return;
  const root=new PIXI.Container();root.label='regional-readout-prototype';readouts.add(root);root.position.set(point.x,point.y+27);
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
  const value=held?indicator.prestigePerNode:p.total/indicator.prestigePopulationPerPoint;
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
    p.status==='supported'?`Population support secures control; supplied holding Force ${number(p.force)} is not needed to retain it.`:`Holder's supplied Force: ${number(p.force)} / ${p.required} required for occupation.`,
    'Force is military holding, not additional population allegiance.',
    ...(held?[`${number(value)} Prestige per completed node into the shared civilization treasury.`,`${Math.round(p.unrest)}% unrest reduces this region's income.`]:crown?[`Potential ${number(value)} Prestige per completed node if player-held at zero unrest.`,`This is a settled-control estimate, not a capture quote or current income.`]:[]),
    'Tap the settlement artwork to inspect its economy.',
  ],maxWidth:410};
  root.eventMode='static';root.cursor='help';root.hitArea=new PIXI.Rectangle(-73,-5,146,85);
  root.on('pointerover',e=>{if(e.pointerType!=='touch')tooltipView?.show?.(spec,root.getBounds(),{dismissOnExit:true});});
  root.on('pointerout',()=>tooltipView?.hide?.());
  root.on('pointerdown',e=>{e.stopPropagation();tooltipView?.pin?.(spec,root.getBounds(),`regional-prototype:${reference}`);});
  parent.addChild(root);
}
