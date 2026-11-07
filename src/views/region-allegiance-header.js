import { createText } from './settlement-view-primitives.js';
import { TEXT_STYLES, PALETTE } from './settlement-theme.js';
import {regionAllegianceParts} from './region-allegiance.js';

const holderName=id=>id==='player'?'Free realm':id==='external-a'?'Crown':id==='frontier'?'Unheld':id;

function inspect(group,rect,spec,key,tooltipView){
  group.eventMode='static';group.cursor='help';group.hitArea=new PIXI.Rectangle(...rect);
  group.on('pointerover',e=>{if(e.pointerType!=='touch')tooltipView?.show?.(spec,group.getBounds(),{dismissOnExit:true});});
  group.on('pointerout',()=>tooltipView?.hide?.());
  group.on('pointerdown',e=>{e.stopPropagation();tooltipView?.pin?.(spec,group.getBounds(),key);});
}

export function addRegionAllegianceHeader(root,{x,y,vm,reference,tooltipView}){
  const c=vm.control,total=Math.max(1,c.total),parts=regionAllegianceParts(c);
  const allegiance=new PIXI.Container();allegiance.label='region-allegiance-header';allegiance.position.set(x+380,y+18);
  const bar=new PIXI.Graphics().beginFill(0x101915).drawRoundedRect(0,0,390,25,3).endFill();
  let offset=0;
  for(const part of parts){const w=390*part.count/total;if(w>0)bar.beginFill(part.colour,.85).drawRect(offset,0,w,25).endFill();offset+=w;}
  bar.lineStyle(1,0xa08d65).drawRoundedRect(0,0,390,25,3);allegiance.addChild(bar);
  const counts=createText(parts.map(p=>`${p.name} ${p.count}`).join('  ·  '),{...TEXT_STYLES.body,fontSize:20},0,32);
  counts.scale.set(Math.min(1,390/Math.max(1,counts.width)));allegiance.addChild(counts);
  inspect(allegiance,[0,-3,390,66],{title:'Population allegiance',lines:[
    ...parts.map(p=>`${p.name}: ${p.count} / ${c.total} (${Math.round(p.count/total*100)}%).`),
    'Each person has one allegiance. Allegiance is separate from the regional holder.',
    'A faction can claim control at 60% for two checks; an existing holder needs 45% support.',
    `Scholars ${vm.specialists.scholar} · Warriors ${vm.specialists.warrior}.`,
  ],maxWidth:420,scale:2},`allegiance:${reference}`,tooltipView);
  root.addChild(allegiance);

  const holdingRequirement=c.supported?0:c.required;
  const status=new PIXI.Container();status.label='region-control-header';status.position.set(x+810,y+16);
  const unheld=c.holder==='frontier',colour=unheld?PALETTE.textMuted:c.status==='contested'?0xe7947e:PALETTE.accent;
  status.addChild(createText(unheld?'UNHELD':c.status.toUpperCase(),{...TEXT_STYLES.header,fontSize:23,fill:colour},0,0));
  status.addChild(createText(`Force ${Number(c.force.toFixed(1))}/${holdingRequirement} · Unrest ${Math.round(c.unrest)}%`,{...TEXT_STYLES.body,fontSize:20},0,34));
  inspect(status,[0,-3,284,70],{title:'Control and military holding',lines:[
    unheld?'This region has no holder.':`${holderName(c.holder)} holds this region and its hosted Stock.`,
    `${c.loyal}/${c.total} residents support the holder (${Math.round(c.share*100)}%).`,
    `${c.armed} local armed loyal adult Warriors; Force ${Number(c.force.toFixed(1))} / ${holdingRequirement} required to hold; Defense ${Number(c.defense.toFixed(1))}.`,
    ...(c.supported?['Population support holds this region without a military occupation.']:[]),
    `${c.receivedForce} adjacent Force received; ${c.sentForce} sent to ${c.supportTarget??'no neighbour'}.`,
    `Garrison: ${c.upkeep} Edible ${c.supplied?'paid':'MISSING'}.`,
    `Unrest ${Math.round(c.unrest)} moves toward ${Math.round(c.targetUnrest)} at each Death control check.`,
    'Loss: unrest 75+ for two checks without population support or enough occupation Force.',
    `${vm.usedStructureCapacity} / ${vm.structureCapacity} construction cells.`,
  ],maxWidth:420,scale:2},`territory:${reference}`,tooltipView);
  root.addChild(status);
}
