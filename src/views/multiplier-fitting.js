// Shared symbol-only fitting for installed and prospective Practices.
import { createText } from './settlement-view-primitives.js';
import { TEXT_STYLES } from './settlement-theme.js';
import { getStoneTexture } from './chronicle-skin.js';
import { addResourceIcon } from './resource-cost-pixi.js';
import { addInteractionFeedback } from './interaction-feedback.js';

// Attached future-effect marker, using the game's existing time symbol.
export function addMultiplierCompletionBadge(parent,x,y,size=32) {
  const badge=new PIXI.Container();badge.position.set(x,y);badge.eventMode='none';
  const r=size/2;
  badge.addChild(new PIXI.Graphics().lineStyle(2,0xb5d3b8).beginFill(0x17211f,.98).drawCircle(0,0,r).endFill());
  addResourceIcon(badge,'hourglass',0,0,size*.75);
  parent.addChild(badge);return badge;
}

export function addMultiplierFitting(parent,box,{kind,multiplier,label=null,tooltipView,spec}) {
  const plate = new PIXI.Container();plate.position.set(box.x,box.y);
  const output=kind==='output', boosted=multiplier!==1, w=box.width,h=box.height;
  const metal=output?0xc7a262:0xa5b5b2, ink=boosted?(output?0xffdd8d:0xe3efeb):0x92988b;
  const g=new PIXI.Graphics();
  g.beginFill(0x070b09,.9).drawRoundedRect(0,3,w,h,5).endFill();
  g.lineStyle(2,boosted?metal:0x62675c).beginTextureFill({texture:getStoneTexture(),color:output?0x423824:0x303d3a});
  g.drawPolygon([7,0,w-7,0,w,7,w,h-7,w-7,h,7,h,0,h-7,0,7]).endFill();
  g.lineStyle(1.5,metal,.8).moveTo(9,3).lineTo(w-9,3);
  g.lineStyle(2,0x101811).moveTo(3,h-9).lineTo(9,h-3).lineTo(w-9,h-3).lineTo(w-3,h-9);
  g.lineStyle(1,0x151a13).beginFill(metal);
  for(const px of [6,w-6])g.drawCircle(px,h/2,1.6);
  g.endFill();g.eventMode='none';plate.addChild(g);
  addResourceIcon(plate,'stock',23,output?29:23,22).alpha=boosted?1:.65;
  const mark=new PIXI.Graphics().lineStyle(2.5,ink);
  if(output)mark.moveTo(23,17).lineTo(23,7).moveTo(17,13).lineTo(23,7).lineTo(29,13);
  else mark.moveTo(11,14).lineTo(11,38).lineTo(35,38).lineTo(35,14);
  mark.eventMode='none';plate.addChild(mark);
  const number=createText(label??`×${multiplier}`,{...TEXT_STYLES.chip,fontSize:32,fill:ink,stroke:0x11170f,strokeThickness:2,trim:true},38+(w-44)/2,h/2,.5,.5);
  number.scale.set(Math.min(1,(w-46)/Math.max(1,number.width)));
  number.eventMode='none';plate.addChild(number);
  plate.eventMode='static';plate.cursor='pointer';plate.hitArea=new PIXI.Rectangle(0,0,w,h);
  plate.accessibleTitle=spec?.title??`${output?'Output':'Capacity'} Multiplier ${multiplier}`;
  addInteractionFeedback(plate,{x:0,y:0,width:w,height:h},{onActivate:()=>{if(spec)tooltipView?.pin?.(spec,()=>plate.getBounds(),spec.poolKey??`output-fitting:${spec.title}:${kind}`);}});
  if(spec){
    plate.on('pointerover',event=>{if(event.pointerType!=='touch')tooltipView?.show?.(spec,plate.getBounds(),{dismissOnExit:true});});
    plate.on('pointerout',()=>tooltipView?.hide?.());
  }
  parent.addChild(plate);
  if(spec)tooltipView?.refreshMultiplier?.(spec,()=>plate.getBounds());
  return plate;
}

// Fits the same pair to regional, detailed and shop Practice slots.
export function addPracticeMultiplierPair(parent,box,entry,index,tooltipView) {
  const face=entry?.face;
  if(!face?.outputMultiplierBreakdown)return [];
  const row={index,practiceId:entry.practiceId??face.definitionId,name:face.label,baseOutput:face.baseStockProduction,
    output:face.outputMultiplierBreakdown,capacity:face.stockCapacityBreakdown};
  return ['output','capacity'].map((kind,i)=>{
    const scale=box.height/48,width=(box.width-8)/2;
    const plate=addMultiplierFitting(parent,{x:box.x+i*(width+8),y:box.y,width:width/scale,height:48},
      {kind,multiplier:row[kind].multiplier,tooltipView,spec:multiplierTooltip(row,kind)});
    plate.scale.set(scale);return plate;
  });
}

export function multiplierTooltip(row,kind,{afterCompletion=false}={}) {
  const pool=row[kind],before=row.before?.[kind]?.multiplier;
  const pending=afterCompletion&&(pool.sources.some(source=>source.pending)||before!==undefined&&before!==pool.multiplier);
  return {title:`${row.name} \u00b7 ${kind==='output'?'Output':'Capacity'} Multiplier \u00d7${row[kind].multiplier}`,
    poolKey:`pool:${row.practiceId??row.index??row.name}:${kind}`,
    poolBreakdown:{name:row.name,kind,pool,before,baseOutput:row.baseOutput,afterCompletion:pending},scale:1};
}
