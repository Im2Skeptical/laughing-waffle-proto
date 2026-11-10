import {regionAllegianceParts,unrestReading} from '../region-allegiance.js';

export function getMapInfluencePresentation(control,{monster=false}={}){
  if(!control||(!control.total&&!control.unrest)||monster)return null;
  return {
    total:control.total,holder:control.holder,status:control.status,
    minimumLoyal:control.minimumLoyal,minimumShare:control.minimumShare,
    resistance:control.resistance,
    contested:control.holder!=='frontier'&&control.status==='contested',
    parts:regionAllegianceParts(control),force:control.force,required:control.supported?0:control.required,unrest:control.unrest,
    warriors:control.availableWarriors,warriorForce:control.warriorForce,bonusForce:control.bonusForce,receivedForce:control.receivedForce,
  };
}

export function addMapInfluenceMarker(parent,point,presentation,{tooltipView,reference}={}){
  if(!presentation)return null;
  const p=presentation,width=76,height=9;
  const root=new PIXI.Container();root.label='map-influence-marker';root.controlStatus=p.status;
  root.position.set(point.x,point.y+34);
  const ink=new PIXI.Graphics().beginFill(0x101915,.95).drawRoundedRect(-width/2-2,-height/2-2,width+4,height+4,2).endFill();
  let x=-width/2;
  for(const part of p.parts){const w=width*part.count/Math.max(1,p.total);if(w>0)ink.beginFill(part.colour).drawRect(x,-height/2,w,height).endFill();x+=w;}
  ink.lineStyle(p.contested?2:1,p.contested?0xf18a78:0x756d55).drawRoundedRect(-width/2-1,-height/2-1,width+2,height+2,2);
  root.addChild(ink);
  if(p.contested){
    const badge=new PIXI.Graphics();badge.label='contested-control-marker';
    badge.position.set(-width/2-12,0);
    badge.lineStyle(1.5,0xf4ad8c).beginFill(0x6e2e32).drawPolygon([0,-9,8,0,0,9,-8,0]).endFill();
    badge.lineStyle(2,0xffe7ca).moveTo(-3,-3).lineTo(3,3).moveTo(3,-3).lineTo(-3,3);root.addChild(badge);
  }
  const holder=p.holder==='player'?'Free realm':p.holder==='external-a'?'Crown':p.holder==='frontier'?'Unheld':p.holder;
  const spec={title:p.unrest?'Unrest':p.contested?'Control in contention':'Population allegiance',lines:[
    ...unrestReading(p.unrest),
    p.holder==='frontier'?'No faction holds this region.':`${holder} holds this region.`,
    ...p.parts.map(part=>`${part.name}: ${part.count} / ${p.total} (${Math.round(part.count/p.total*100)}%).`),
    ...(p.contested?['The holder lacks both population support and sufficient occupation Force.',`Holding Force ${Number(p.force.toFixed(1))} / ${p.required===null?'needs local allegiance':Number(p.required.toFixed(1))}.`]
      :p.status==='occupied'?['Military occupation holds the region without sufficient population support.']
      :p.status==='unheld'?['Unheld land is not a contested holding.']:['Population support secures control.']),
    `${p.warriors} local loyal Warriors provide ${p.warriorForce} baseline Force without equipment or extra meals.`,
    'Gold: Free allegiance. Copper: Crown allegiance. Grey: unaffiliated.',
  ],maxWidth:370,scale:2};
  root.eventMode='static';root.cursor='help';root.hitArea=new PIXI.Rectangle(-width/2-23,-12,width+48,24);
  root.on('pointerover',e=>{if(e.pointerType!=='touch')tooltipView?.show?.(spec,root.getBounds(),{dismissOnExit:true});});
  root.on('pointerout',()=>tooltipView?.hide?.());
  root.on('pointerdown',e=>{e.stopPropagation();tooltipView?.pin?.(spec,root.getBounds(),`map-influence:${reference}`);});
  parent.addChild(root);return root;
}
