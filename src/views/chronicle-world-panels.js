import { addIllustration } from './chronicle-art.js';
import { addSettlementPiece, addConstructionStrip } from './settlement-piece-pixi.js';
import { createText } from './settlement-view-primitives.js';
import { TEXT_STYLES, PALETTE } from './settlement-theme.js';
import { addResourceIcon } from './resource-cost-pixi.js';
import { regionalConstructionRect } from './piece-geometry.js';

export function addChaosPanelContent(root, rect, summary) {
  addIllustration(root,'crisis',{x:rect.x+8,y:rect.y+8,width:136,height:rect.height-16},{alpha:.8});
  const x=rect.x+162,y=rect.y+12;
  const text=(s,dy,size=22,fill=PALETTE.text)=>root.addChild(createText(s,{...TEXT_STYLES.body,fontSize:size,fill},x,y+dy));
  text('THE COMING DARK',0,26,PALETTE.accent);
  text(`${summary.green.label} · Chaos ${summary.chaos.chaosPower}`,28,22);
  text(`Pressure ${summary.chaos.lastReckoning?.incomingChaos??0}   ·   Resistance ${summary.chaos.lastReckoning?.resistance??0}`,55,20);
  text(`Monsters  ${summary.chaos.monsterCount} / ${summary.chaos.monsterLossThreshold}`,82,20);
}

export function addRegionPanelContent(root, rect, {region, reference, name, vm, tooltipView}) {
  const x=rect.x+22,y=rect.y;
  root.addChild(createText(`${reference}  ·  ${name}`,{...TEXT_STYLES.header,fontSize:29},x,y+18));
  root.addChild(createText(`${region.colour.toUpperCase()} TERRITORY   /   ${region.controller==='player'?'YOUR REALM':'FRONTIER'}`,{
    ...TEXT_STYLES.body,fontSize:18,fill:PALETTE.textMuted},x,y+50));
  if(vm){
    const food=vm.storedFood+vm.looseFood, shortfall=food<vm.population.mealDemand;
    const housingFull=vm.population.total>0&&vm.population.total>=vm.population.housingCapacity;
    const storageFull=food>0&&vm.storedFood>=vm.storedFoodCapacity;
    const red=0xe7947e, amber=0xe2b365;
    const stats=[
      {icon:'housingCapacity',value:`${vm.population.total} / ${vm.population.housingCapacity}`,warning:housingFull,
        title:vm.pressure?.overcrowding?'Overcrowded':'Housing full',lines:[`${vm.pressure?.housingOverflow??0} people exceed current Housing capacity.`, 'Housing shortages affect Happiness at the Housing phase.']},
      {icon:'food',value:`${Math.round(food)} / ${Math.round(vm.storedFoodCapacity)}`,warning:vm.pressure?.starvation||shortfall||vm.looseFood>0||storageFull,severe:vm.pressure?.starvation,
        title:vm.pressure?.starvation?'Starving':shortfall?'Food supply warning':vm.looseFood>0?'Food overflow':'Food storage full',
        lines:[`${Math.round(vm.storedFood)} stored; ${Math.round(vm.looseFood)} loose Food.`, `Current meal demand: ${Math.round(vm.population.mealDemand)} Food.`,
          ...(vm.pressure?.starvation?[`Last meal left ${vm.pressure.unfedMealDemand} Food demand unfed; ${vm.pressure.starvationMigrants} starvation migrants.`]:[]),
          ...(shortfall?['Available Food is below current meal demand. Production and imports may cover the gap before the Food phase.']:[]),
          ...(vm.looseFood>0||storageFull?['Food beyond storage capacity remains loose and is exposed to loose-Food decay.']:[])]},
      {icon:'money',value:vm.currency},
    ];
    const cell=(rect.width-44)/3;
    stats.forEach((stat,i)=>{
      const group=new PIXI.Container();group.position.set(x+i*cell,y+76);
      const colour=stat.warning?(stat.severe?red:amber):PALETTE.text;
      group.addChild(new PIXI.Graphics().beginFill(stat.warning?0x392820:0x111d19,.8).lineStyle(1,stat.warning?colour:0x514d3a).drawRoundedRect(0,0,cell-7,34,4).endFill());
      addResourceIcon(group,stat.icon,18,17,28);
      const value=createText(String(stat.value),{...TEXT_STYLES.body,fontSize:24,fill:colour},36,3);
      value.scale.set(Math.min(1,(cell-70)/Math.max(1,value.width)));group.addChild(value);
      if(stat.warning){
        const glyph=new PIXI.Container();glyph.position.set(cell-24,17);
        glyph.addChild(new PIXI.Graphics().beginFill(colour).drawPolygon([0,-11,11,9,-11,9]).endFill(),createText('!',{...TEXT_STYLES.chip,fontSize:17,fill:0x201813},0,0,.5,.5));
        glyph.eventMode='static';glyph.hitArea=new PIXI.Rectangle(-16,-16,32,32);glyph.cursor='help';
        const spec={title:stat.title,lines:stat.lines,accentColor:colour,maxWidth:290,scale:2};
        glyph.on('pointerover',()=>tooltipView?.show(spec,glyph.getBounds(),{dismissOnExit:true}));
        glyph.on('pointerout',()=>tooltipView?.hide());
        glyph.on('pointerdown',event=>{event.stopPropagation();tooltipView?.pin(spec,glyph.getBounds(),`region-warning:${reference}:${stat.icon}`);});
        group.addChild(glyph);
      }
      root.addChild(group);
    });
  }
  if(!vm){
    root.addChild(createText('A wilderness waiting for a future.',{...TEXT_STYLES.body,fontSize:23,fill:PALETTE.textMuted,
      wordWrap:true,wordWrapWidth:rect.width-50},x,y+265));return;
  }
  root.addChild(createText('PRACTICES',{...TEXT_STYLES.chip,fontSize:18,fill:PALETTE.textMuted},x,y+118));
  const gap=9, pw=(rect.width-44-gap*4)/5;
  vm.practices.forEach((p,i)=>addSettlementPiece(root,{x:x+i*(pw+gap),y:y+152,width:pw,height:pw*7/5},{face:p.face,empty:!p.practiceId,tooltipView,compact:true}));
  root.addChild(createText(`STRUCTURES   ${vm.usedStructureCapacity} / ${vm.structureCapacity}`,{
    ...TEXT_STYLES.chip,fontSize:18,fill:PALETTE.textMuted},x,y+410));
  const constructionRect=regionalConstructionRect({x,y:y+444,width:rect.width-44,height:rect.height-456},vm.structureCapacity);
  addConstructionStrip(root,constructionRect,{slots:vm.structures,capacity:vm.structureCapacity,tooltipView,compact:true});
}
