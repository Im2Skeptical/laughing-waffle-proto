import { MECHANICS } from '../defs/mechanics.js';
import { createRegionLabel } from './region-label.js';
import { addPracticeMultiplierPair } from './multiplier-fitting.js';
import { addIllustration, addRegionLandmark } from './chronicle-art.js';
import { addSettlementPiece, addConstructionStrip } from './settlement-piece-pixi.js';
import { createText, roundedRect } from './settlement-view-primitives.js';
import { TEXT_STYLES, PALETTE } from './settlement-theme.js';
import { addResourceIcon } from './resource-cost-pixi.js';
import { regionalConstructionRect, regionalPracticeSize, PIECE_SIZE } from './piece-geometry.js';
import { DEFAULT_REGION_STRUCTURE_CAPACITY_MAX } from '../defs/world/detailed-settlement-scenario.js';
import { addNeutralMarketBillboard } from './neutral-market-pixi.js';
import { addRegionAllegianceHeader } from './region-allegiance-header.js';

function regionalHolderLabel(region,vm){
  if(region.monster)return `MONSTER · Defense ${region.monster.defense}`;
  if(region.controller==='player')return 'YOUR REALM';
  if(region.controller==='external-a')return vm?.control?'CROWN REMNANT':'NEUTRAL SETTLEMENT';
  if(region.lostAtSec!=null)return 'RUINS';
  if(!vm?.control)return 'FRONTIER';
  return vm.control.total>0&&vm.control.support.neutral===vm.control.total?'NEUTRAL SETTLEMENT':'UNHELD';
}

// Whole-number HUD only; exact Creep still drives simulation and the bar fill.
const whole = value => String(Math.round(Number(value) || 0));
function creepReadout(chaos) {
  const progress=Number(chaos.expansionProgress)||0,threshold=Number(chaos.expansionThreshold)||100;
  const shown=progress<threshold?Math.min(Math.round(progress),threshold-1):Math.round(progress);
  return `${shown} / ${whole(threshold)}`;
}

export function addMonsterPressureBar(root, rect, chaos, caption = '') {
  const ratio = Math.max(0, Math.min(1, chaos.expansionProgress / Math.max(1, chaos.expansionThreshold)));
  const progress = new PIXI.Graphics();
  progress.label = 'monster-pressure-progress';
  progress.eventMode = 'none';
  progress.lineStyle(1,0x765348).beginFill(0x30191e).drawRoundedRect(rect.x,rect.y,rect.width,rect.height,3).endFill();
  progress.lineStyle(0).beginFill(0xb94145).drawRoundedRect(rect.x,rect.y,rect.width*ratio,rect.height,3).endFill();
  if(ratio>0) progress.beginFill(0xf49b85,.3).drawRect(rect.x+1,rect.y+1,Math.max(0,rect.width*ratio-2),2).endFill();
  root.addChild(progress);
  const value=createText(`${caption}${creepReadout(chaos)}`,{
    ...TEXT_STYLES.chip,fontSize:20,fill:0xffe8d2,stroke:0x210e14,strokeThickness:3,
  },rect.x+rect.width/2,rect.y+rect.height/2,.5,.5);
  value.label='monster-pressure-value';value.eventMode='none';root.addChild(value);
}

export function addCollapsedChaosControl(parent, rect, chaos, onPress) {
  const root=new PIXI.Container();root.label='collapsed-monster-pressure';
  const frame=new PIXI.Graphics();
  roundedRect(frame,rect.x,rect.y,rect.width,rect.height,5,PALETTE.panel,0x947750,2);
  root.addChild(frame,createText('>',{...TEXT_STYLES.title,fontSize:22,fill:PALETTE.accent},rect.x+rect.width-12,rect.y+rect.height/2,.5,.5));
  addResourceIcon(root,'monster',rect.x+24,rect.y+rect.height/2,28);
  addMonsterPressureBar(root,{x:rect.x+46,y:rect.y+8,width:rect.width-68,height:28},chaos);
  root.eventMode='static';root.cursor='pointer';root.hitArea=new PIXI.Rectangle(rect.x,rect.y,rect.width,rect.height);
  root.accessibleTitle=`${MECHANICS.creep.name} ${creepReadout(chaos)}. A full meter triggers a ${MECHANICS.monsterSpawn.name}. Expand Chaos.`;
  root.on('pointerdown',onPress);parent.addChild(root);return root;
}

export function addChaosPanelContent(root, rect, summary) {
  const portrait=addIllustration(root,'crisis',{x:rect.x+8,y:rect.y+8,width:72,height:rect.height-16},{alpha:.85});
  if(!portrait){
    const badge=new PIXI.Graphics();
    roundedRect(badge,rect.x+8,rect.y+8,72,rect.height-16,4,0x251b21,0x765348,1);
    badge.eventMode='none';root.addChild(badge);
    addResourceIcon(root,'monster',rect.x+44,rect.y+rect.height/2,52);
  }
  const x=rect.x+92,y=rect.y+8;
  root.addChild(createText('The Coming Dark',{...TEXT_STYLES.title,fontSize:22,__forceTitleSmallCaps:true,fill:PALETTE.accent},x,y),
    createText(`Chaos ${whole(summary.chaos.chaosPower)}   \u00b7   Resistance ${whole(summary.chaos.resistance)}`,{
      ...TEXT_STYLES.chip,fontSize:18,fill:PALETTE.textMuted,
    },x,y+29));
  addMonsterPressureBar(root,{x,y:rect.y+68,width:rect.width-104,height:28},summary.chaos,`${MECHANICS.creep.name} `);
}

export function addRegionPanelContent(root, rect, {region, reference, name, vm, defense, tooltipView}) {
  if (vm?.neutral) {
    addNeutralMarketBillboard(root, {x:rect.x+22,y:rect.y+18,width:rect.width-44,height:rect.height-30},
      {name:vm.name,reference,stocks:vm.marketStocks,defense,tooltipView});
    return;
  }
  const x=rect.x+22,y=rect.y;
  root.addChild(createRegionLabel(reference ?? name,{...TEXT_STYLES.header,fontSize:29},x,y+18,vm ? 350 : rect.width-100,34));
  root.addChild(createText(`${region.colour.toUpperCase()} TERRITORY / ${regionalHolderLabel(region,vm)}`,{
    ...TEXT_STYLES.body,fontSize:18,fill:PALETTE.textMuted},x,y+50));
  if (region.monster) {
    addRegionLandmark(root,'monster-lair',{x:x+rect.width*.19,y:y+95,width:rect.width*.58,height:rect.height-125});
    return;
  }
  if(vm){
    const food=vm.storedFood+vm.looseFood, shortfall=food<vm.population.mealDemand;
    const housingFull=vm.population.total>0&&vm.population.total>=vm.population.housingCapacity;
    const red=0xe7947e, amber=0xe2b365;
    const stats=[
      {icon:'population',value:vm.population.total,capIcon:'housingCapacity',capacity:vm.population.housingCapacity,label:'Population / Housing',warning:housingFull,
        title:vm.pressure?.overcrowding?'Overcrowded':'Housing full',lines:[`${vm.pressure?.housingOverflow??0} people exceed current Housing capacity.`, 'Housing shortages affect Happiness at the Housing phase.']},
      {icon:'food',value:`${Math.round(food)} / ${Math.round(vm.storedFoodCapacity)}`,label:'Hosted Edible Stock',warning:vm.pressure?.starvation||shortfall,severe:vm.pressure?.starvation,
        title:vm.pressure?.starvation?'Starving':'Food supply warning',
        lines:[`${Math.round(food)} hosted [Edible] Stock / ${Math.round(vm.storedFoodCapacity)} capacity.`,
          `Next Food phase needs ${vm.population.mealDemand} Stock (one per 30 people).`,
          'Practices activate before Food is consumed. Supplies are spent left to right.']},
    ];
    const cell=290;
    stats.forEach((stat,i)=>{
      const group=new PIXI.Container();group.position.set(x+(vm.control?rect.width-334:380),y+16+i*36);
      const colour=stat.warning?(stat.severe?red:amber):PALETTE.text;
      group.addChild(new PIXI.Graphics().beginFill(stat.warning?0x392820:0x111d19,.8).lineStyle(1,stat.warning?colour:0x514d3a).drawRoundedRect(0,0,cell-7,34,4).endFill());
      addResourceIcon(group,stat.icon,18,17,28);
      const amount=new PIXI.Container();amount.position.set(36,3);
      const value=createText(String(stat.value)+(stat.capIcon?' /':''),{...TEXT_STYLES.body,fontSize:24,fill:colour},0,0);
      amount.addChild(value);
      if(stat.capIcon){
        addResourceIcon(amount,stat.capIcon,value.width+18,14,24);
        amount.addChild(createText(String(stat.capacity),{...TEXT_STYLES.body,fontSize:24,fill:colour},value.width+36,0));
      }
      amount.scale.set(Math.min(1,(cell-70)/Math.max(1,amount.width)));group.addChild(amount);
      group.eventMode='static';group.hitArea=new PIXI.Rectangle(0,0,cell-7,34);
      const labelSpec={title:stat.label,lines:stat.icon==='population'
        ? [`${vm.population.total} people / ${vm.population.housingCapacity} Housing capacity.`]
        : stat.icon==='food'?[`${Math.round(food)} hosted [Edible] Stock / ${Math.round(vm.storedFoodCapacity)} capacity.`, `Food demand: ${vm.population.mealDemand} Stock.`]
        : [`${vm.currency} hosted [Currency] Stock available in this settlement.`],accentColor:colour,maxWidth:290,scale:2};
      group.on('pointerover',event=>{if(event.pointerType!=='touch')tooltipView?.show(labelSpec,group.getBounds(),{dismissOnExit:true});});
      group.on('pointerout',()=>tooltipView?.hide());
      group.on('pointerdown',event=>{event.stopPropagation();tooltipView?.pin(labelSpec,group.getBounds(),`region-resource:${reference}:${stat.icon}`);});
      if(stat.warning){
        const glyph=new PIXI.Container();glyph.position.set(cell-24,17);
        glyph.addChild(new PIXI.Graphics().beginFill(colour).drawPolygon([0,-11,11,9,-11,9]).endFill(),createText('!',{...TEXT_STYLES.chip,fontSize:17,fill:0x201813},0,0,.5,.5));
        glyph.eventMode='static';glyph.hitArea=new PIXI.Rectangle(-16,-16,32,32);glyph.cursor='help';
        const spec={title:stat.title,lines:stat.lines,accentColor:colour,maxWidth:290,scale:2};
        glyph.on('pointerover',event=>{event.stopPropagation();tooltipView?.show(spec,glyph.getBounds(),{dismissOnExit:true});});
        glyph.on('pointerout',event=>{event.stopPropagation();tooltipView?.hide();});
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
  if(vm.control)addRegionAllegianceHeader(root,{x,y,vm,reference,tooltipView});
  else {
  const specialistX=x+730;
  root.addChild(createText(`Scholars ${vm.specialists.scholar}\nWarriors ${vm.specialists.warrior}\nMartial Force ${vm.martialForce}`,{
    ...TEXT_STYLES.chip,fontSize:21,lineHeight:24,fill:PALETTE.textMuted},specialistX,y+20));
  const defenseLines=[`Defense ${defense ?? vm.martialForce}`,
    vm.lastDefense ? `Last defense: ${vm.lastDefense.result}` : '',
    `${vm.usedStructureCapacity} / ${vm.structureCapacity} construction cells`].filter(Boolean);
  root.addChild(createText(defenseLines.join('\n'),{...TEXT_STYLES.chip,fontSize:21,lineHeight:24,fill:PALETTE.textMuted},x+1000,y+20));
  }
  const divider=new PIXI.Graphics().lineStyle(1,PALETTE.stroke,.55).moveTo(x,y+98).lineTo(x+rect.width-44,y+98);
  divider.eventMode='none';root.addChild(divider);
  const gap=PIECE_SIZE.gap, practiceSize=regionalPracticeSize(rect.width), cardHeight=340, pairHeight=50;
  vm.practices.forEach((p,i)=>{
    const slotX=x+i*(practiceSize.width+gap), cardW=Math.min(practiceSize.width,cardHeight*PIECE_SIZE.practiceWidth/PIECE_SIZE.practiceHeight);
    const cardX=slotX+(practiceSize.width-cardW)/2, cardY=y+122;
    const hasPools=!!p.face?.outputMultiplierBreakdown;
    const slot=new PIXI.Graphics().lineStyle(1.5,0x685c44,.85).beginFill(0x101815,.88)
      .drawRoundedRect(cardX-5,cardY-5,cardW+10,cardHeight+(hasPools?pairHeight+18:10),6).endFill();
    slot.eventMode='none';root.addChild(slot);
    addSettlementPiece(root,{x:cardX,y:cardY,width:cardW,height:cardHeight},{face:p.face,empty:!p.practiceId,tooltipView,compact:true});
    addPracticeMultiplierPair(root,{x:cardX,y:cardY+cardHeight+8,width:cardW,height:pairHeight},p,i,tooltipView);
  });
  const constructionY=vm.control?534:554;
  const constructionRect=regionalConstructionRect({x,y:y+constructionY,width:rect.width-44,height:rect.height-constructionY-18},DEFAULT_REGION_STRUCTURE_CAPACITY_MAX);
  addConstructionStrip(root,constructionRect,{slots:vm.structures,capacity:vm.structureCapacity,displayCapacity:DEFAULT_REGION_STRUCTURE_CAPACITY_MAX,tooltipView,compact:true});
}
