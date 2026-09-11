import { addIllustration } from './chronicle-art.js';
import { addSettlementPiece, addConstructionStrip } from './settlement-piece-pixi.js';
import { createText } from './settlement-view-primitives.js';
import { TEXT_STYLES, PALETTE } from './settlement-theme.js';
import { addResourceIcon } from './resource-cost-pixi.js';

export function addChaosPanelContent(root, rect, summary) {
  addIllustration(root,'crisis',{x:rect.x+8,y:rect.y+8,width:136,height:rect.height-16},{alpha:.8});
  const x=rect.x+162,y=rect.y+12;
  const text=(s,dy,size=22,fill=PALETTE.text)=>root.addChild(createText(s,{...TEXT_STYLES.body,fontSize:size,fill},x,y+dy));
  text('THE COMING DARK',0,26,PALETTE.accent);
  text(`${summary.green.label} · Chaos ${summary.chaos.chaosPower}`,33,22);
  text(`Pressure ${summary.chaos.lastReckoning?.incomingChaos??0}   ·   Resistance ${summary.chaos.lastReckoning?.resistance??0}`,63,20);
  text(`Monsters  ${summary.chaos.monsterCount} / ${summary.chaos.monsterLossThreshold}`,92,20);
}

export function addRegionPanelContent(root, rect, {region, reference, name, vm, tooltipView}) {
  const x=rect.x+22,y=rect.y;
  root.addChild(createText(`${reference}  ·  ${name}`,{...TEXT_STYLES.header,fontSize:29},x,y+18));
  root.addChild(createText(`${region.colour.toUpperCase()} TERRITORY   /   ${region.controller==='player'?'YOUR REALM':'FRONTIER'}`,{
    ...TEXT_STYLES.body,fontSize:18,fill:PALETTE.textMuted},x,y+58));
  addIllustration(root,'settlement',{x,y:y+94,width:176,height:132},{alpha:vm?1:.55});
  const stats=vm?[
    [`${vm.population.total} / ${vm.population.housingCapacity}`, 'People / housing'],
    [`${Math.round(vm.storedFood+vm.looseFood)}`, 'Food reserves'],
    [`${vm.currency}`, 'Gold'],
  ]:[['Unsettled','']];
  stats.forEach(([value,label],i)=>root.addChild(
    createText(value,{...TEXT_STYLES.title,fontSize:26,fill:PALETTE.accent},x+204,y+87+i*47),
    createText(label,{...TEXT_STYLES.body,fontSize:18,fill:PALETTE.textMuted},x+350,y+94+i*47)));
  if (vm) {
    addResourceIcon(root, 'food', x + 330, y + 149, 34);
    addResourceIcon(root, 'money', x + 330, y + 196, 34);
  }
  if(!vm){
    root.addChild(createText('A wilderness waiting for a future.',{...TEXT_STYLES.body,fontSize:23,fill:PALETTE.textMuted,
      wordWrap:true,wordWrapWidth:rect.width-50},x,y+265));return;
  }
  const alert=vm.pressure?.starvation?'STARVATION':vm.pressure?.overcrowding?'OVERCROWDED':'PRACTICES';
  root.addChild(createText(alert,{...TEXT_STYLES.chip,fontSize:18,fill:alert==='PRACTICES'?PALETTE.textMuted:PALETTE.red},x,y+238));
  const gap=9, pw=(rect.width-44-gap*4)/5;
  vm.practices.forEach((p,i)=>addSettlementPiece(root,{x:x+i*(pw+gap),y:y+268,width:pw,height:99},{face:p.face,empty:!p.practiceId,tooltipView,compact:true}));
  root.addChild(createText(`STRUCTURES   ${vm.usedStructureCapacity} / ${vm.structureCapacity}`,{
    ...TEXT_STYLES.chip,fontSize:18,fill:PALETTE.textMuted},x,y+375));
  addConstructionStrip(root,{x,y:y+400,width:rect.width-44,height:64},{slots:vm.structures,capacity:vm.structureCapacity,tooltipView,compact:true});
}
