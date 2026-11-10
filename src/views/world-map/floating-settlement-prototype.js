// Throwaway visual proposal: three graphical readings around the real sprite.
// Region selection remains the game's existing direct economy disclosure.
import {unrestReading} from '../region-allegiance.js';
import {createText} from '../settlement-view-primitives.js';
import {TEXT_STYLES} from '../settlement-theme.js';
import {addResourceIcon} from '../resource-cost-pixi.js';
import {minimumHoldingAllegiance,minimumHoldingShare,minimumHoldingForce,CONTROL_DEFAULTS} from '../../model/detailed-settlements/territory.js';
import {REGIONAL_READOUT_SCREEN_SCALE} from './constants.js';

const amount=n=>String(Number(Number(n??0).toFixed(1)));
function label(root,value,size,colour=0xf0e1bf){
  const item=createText(value,{...TEXT_STYLES.body,fontSize:size,fill:colour,stroke:0x101814,strokeThickness:3},0,0);
  item.anchor.set(.5);root.addChild(item);return item;
}
function inspect(target,spec,tooltipView,key){
  target.eventMode='static';target.cursor='help';
  target.on('pointerover',e=>{if(e.pointerType!=='touch')tooltipView?.show?.(spec,target.getBounds(),{dismissOnExit:true});});
  target.on('pointerout',()=>tooltipView?.hide?.());
  target.on('pointerdown',e=>{e.stopPropagation();tooltipView?.pin?.(spec,target.getBounds(),key);});
}
export function addFloatingSettlementPrototype(parent,point,indicator,{reference,tooltipView,spriteBounds,forceSample=null}){
  const original=indicator.influence;if(!original||indicator.monster)return;
  const player=indicator.controller==='player',crown=indicator.controller==='external-a';
  // Explicit display-only examples for comparing Force encodings. No state is
  // written; ordinary prototype URLs continue to show actual model values.
  const p=forceSample?{...original,total:200,parts:[
    {...original.parts[0],count:70},{...original.parts[1],count:90},{...original.parts[2],count:40}],
    unrest:null}:original;
  if(forceSample) {
    const nonloyal=p.parts.filter(part=>part.id!==p.holder),disloyal=nonloyal.reduce((n,part)=>n+part.count,0);
    const units=nonloyal.reduce((n,part)=>n+part.count*(part.id==='neutral'?1:2),0);
    const loyal=p.total-disloyal;
    p.required=minimumHoldingForce(p.total,loyal,{disloyal,units});
    p.force=forceSample==='held'?p.required*1.25:forceSample==='fractional'?Math.max(0,p.required-.2):p.required/2;
    p.minimumLoyal=minimumHoldingAllegiance(p.total,p.force,{disloyal,units});
    p.minimumShare=minimumHoldingShare(p.total,p.force,{disloyal,units});
    p.status=loyal/p.total>=CONTROL_DEFAULTS.retain?'supported':loyal>=p.minimumLoyal?'occupied':'contested';
    p.contested=p.status==='contested';
  }
  const params=new URLSearchParams(globalThis.location?.search??'');
  // The holder's support always fills from the left; the shield marks the
  // remaining support needed at the current population and military strength.
  const held=p.holder==='player'||p.holder==='external-a';
  const parts=held?[...p.parts.filter(part=>part.id===p.holder),...p.parts.filter(part=>part.id!==p.holder)]:p.parts;
  const minimumLoyal=held?p.minimumLoyal:null;
  const thresholdShare=held?p.minimumShare:null;
  const zeroForceShare=held?minimumHoldingShare(p.total,0):null;
  const forceReductionShare=held?zeroForceShare-thresholdShare:null;
  const countKind=params.get('regionalCount')==='population'?'population':'workers';
  const count=countKind==='workers'?(forceSample?13:indicator.totalWorkerCount):p.total;
  const gold=player?0xf1d18b:crown?0xc69872:0x9abbb0;
  const ownershipFill=player?0x493b22:crown?0x462a26:0x202c29;
  const ownershipEdge=player?0xf1d18b:crown?0xd18d67:0x84958c;
  const prestigeFill=player?0xd9bc75:0x202725;
  const prestigeInk=player?0x282113:0x9da69f;
  const root=new PIXI.Container();root.label='floating-settlement-readout';root.mapRegionId=indicator.regionId;
  root.position.set(point.x,point.y);parent.addChild(root);

  const value=player?(forceSample?p.total/indicator.prestigePopulationPerPoint:indicator.prestigePerNode):p.total/indicator.prestigePopulationPerPoint;
  const shownPrestige=String(Math.round(value));
  const badge=new PIXI.Container();badge.label='floating-summary-badge';root.addChild(badge);
  const frame=new PIXI.Graphics();badge.addChild(frame);
  const counter=new PIXI.Container();counter.label='floating-count';badge.addChild(counter);
  const countNumber=label(counter,String(count),27);
  const prestige=new PIXI.Container();prestige.label='floating-prestige';badge.addChild(prestige);
  const prestigeLabel=(player?'+':'')+shownPrestige;
  const prestigeNumber=label(prestige,prestigeLabel,27,prestigeInk);
  if(player)prestigeNumber.style.strokeThickness=0;
  const radius=30,leftWidth=radius*2;
  const rightWidth=78;
  const badgeWidth=leftWidth+rightWidth,left=-badgeWidth/2,divider=left+leftWidth,circleX=left+radius;
  // One connected silhouette: circular worker medallion, rectangular income
  // pill. Draw the pill first so the circle's rim forms their curved join.
  if(rightWidth){
    frame.lineStyle(player?2.5:1.5,player?0xf7dfa1:0x65736c,player?1:.65).beginFill(prestigeFill,.98).drawRoundedRect(circleX,-19,radius+rightWidth,38,6).endFill();
    if(player)frame.lineStyle(1,0xffefbc,.6).moveTo(divider+7,-15).lineTo(-left-7,-15);
  }
  frame.lineStyle(held?3.5:2,ownershipEdge,1).beginFill(ownershipFill,.98).drawCircle(circleX,0,radius).endFill();
  frame.lineStyle(1,ownershipEdge,.4).drawCircle(circleX,0,radius-5);
  if(countKind==='population')addResourceIcon(counter,'population',circleX-radius+12,0,22);
  else{const x=circleX-radius+12,glyph=new PIXI.Graphics().beginFill(0xf1dfb8).drawCircle(x,-7,3.5).drawRoundedRect(x-4,-1,8,11,2).endFill();counter.addChild(glyph);}
  countNumber.x=circleX+8;
  counter.hitArea=new PIXI.Circle(circleX,0,radius+3);
  const demo=forceSample?['Display-only political example for visual comparison.']:[];
  inspect(counter,{title:reference+(countKind==='population'?' - Population':' - Workers'),lines:[...demo,
    `${p.total} total residents.`,`${forceSample?13:indicator.totalWorkerCount} total workers.`,
    ...(forceSample?[]:[`${indicator.activeWorkerCount} assigned; ${indicator.unusedWorkerCount} unused.`])],maxWidth:340},tooltipView,'floating-count:'+indicator.regionId);
  const prestigeIcon=addResourceIcon(prestige,'prestige',divider+17,0,25);
  if(player)prestigeIcon.tint=prestigeInk;
  else{prestigeIcon.tint=0x89968e;prestigeIcon.alpha=.6;}
  prestigeNumber.x=divider+48;
  prestige.visible=rightWidth>0;
  prestige.hitArea=new PIXI.Rectangle(divider,-24,rightWidth+2,48);
  inspect(prestige,{title:player?'Territorial Prestige':'Potential territorial Prestige',lines:[...demo,...(player?
    [`${amount(value)} Prestige per completed node into the shared civilization treasury.`,'Held regions contribute their population-based Prestige.']:
    [`Potential ${amount(value)} Prestige per completed node if you held this region.`,'Inactive: this settlement adds nothing to your shared Prestige treasury.','This is not a post-capture guarantee.']),
    'Map amounts are rounded to whole numbers. Regional contributions are combined before rounding the node payout.'],maxWidth:370},tooltipView,'floating-prestige:'+indicator.regionId);

  const influence=new PIXI.Container();influence.label='floating-influence';root.addChild(influence);
  const bar=new PIXI.Graphics();influence.addChild(bar);
  const forceNumber=label(influence,p.unrest?`Unrest ${Math.ceil(p.unrest.remainingYears)}y`:held?String(Math.floor(Math.max(0,p.force))):'-',p.unrest?19:27,p.unrest?0xf3b292:0xffedcf);forceNumber.label='holding-force-number';
  const status=p.unrest?'Unrest':p.status==='supported'?'Population-supported':p.status==='occupied'?'Military occupation':p.contested?'Control contested':'Unheld';
  const holder=player?'Free realm':crown?'Crown':'Unheld';
  inspect(influence,{title:holder+' - '+status,lines:p.unrest?[...demo,reference,...unrestReading(p.unrest),p.parts.map(part=>`${part.name} ${part.count}`).join(' / ')]:[...demo,reference,
    p.parts.map(part=>`${part.name} ${part.count}`).join(' / '),
    `Holding Force ${amount(p.force)}${p.required===null?' / needs local allegiance':p.required?' / '+amount(p.required)+' required':''}.`,
    ...(!forceSample?[`${p.warriors} loyal adult/Elder Warriors: ${amount(p.warriorForce)} baseline Force.`,...(p.bonusForce||p.receivedForce?[`${amount(p.bonusForce)} Force from cards; ${amount(p.receivedForce)} from neighbouring garrisons.`]:[])]:[]),
    p.status==='occupied'?`${Math.round(p.parts.find(part=>part.id===p.holder)?.count/p.total*100)}% allegiance is below ${CONTROL_DEFAULTS.retain*100}%; this army keeps control.`:p.status==='supported'?'Population support currently secures control.':'Insufficient support and Force threaten control.',
    'Warriors give 1 Force each, including while working. No equipment or extra garrison meals.',
    'Force lowers required allegiance with diminishing returns. Larger populations and rival allegiance reduce its leverage. At least one local ally is always needed.',
    ...(!forceSample&&p.resistance?[`${p.resistance.unaffiliated} unaffiliated / ${p.resistance.rivalCivilians} rival civilians / ${p.resistance.rivalWarriors} rival soldiers.`]:[]),
    `Peaceful claims need ${CONTROL_DEFAULTS.claim*100}% allegiance for two checks.`,
    ...(held?[`${holder} allegiance fills from the left.`,
      `${(params.get('regionalForce')??'onbar')==='onbar'?'Sword':'Without Force'}: ${amount(zeroForceShare*100)}% allegiance needed with no Force.`,
      `Current threshold: ${amount(thresholdShare*100)}% allegiance (${minimumLoyal} / ${p.total} residents).`,
      `Force removes ${amount(forceReductionShare*100)} percentage points from the allegiance requirement.`,
      'More Force moves the shield left. Falling below it at a control check removes control and starts Unrest.']:
      ['No faction currently holds this town. The dash means no holding army, not that all resident Warriors have died.']),
    'The shield number rounds Force down; its position uses the exact control rule.',
  ],maxWidth:470,scale:2},tooltipView,'floating-influence:'+indicator.regionId);

  const bounds=spriteBounds??{min:{x:point.x-27,y:point.y-70},max:{x:point.x+27,y:point.y}};
  let lastZoom=null,lastStyle=null;
  root.updateFloatingLayout=zoom=>{
    const forceStyle=new URLSearchParams(globalThis.location?.search??'').get('regionalForce')??'onbar';
    if(lastZoom===zoom&&lastStyle===forceStyle)return;lastZoom=zoom;lastStyle=forceStyle;
    const scale=REGIONAL_READOUT_SCREEN_SCALE/zoom;root.scale.set(scale);
    const left=(bounds.min.x-point.x)/scale,right=(bounds.max.x-point.x)/scale;
    const top=(bounds.min.y-point.y)/scale,bottom=(bounds.max.y-point.y)/scale;
    badge.position.set((left+right)/2,bottom+radius+6);
    const width=132,height=9;
    // Reserve the sword's downward point and Unrest caption above the sprite.
    const barOffset=forceStyle==='onbar'?42:30;
    influence.position.set((left+right)/2,top-barOffset);
    bar.clear().lineStyle(1,0x131b15,1).beginFill(0x101b15,.85).drawRoundedRect(-width/2-3,-height/2-3,width+6,height+6,4).endFill();
    let x=-width/2;
    for(const part of parts){const w=width*part.count/Math.max(1,p.total);bar.lineStyle(0).beginFill(part.colour).drawRect(x,-height/2,w,height).endFill();x+=w;}
    bar.lineStyle(1,p.unrest?0xe7947e:gold,.9).drawRoundedRect(-width/2-1,-height/2-1,width+2,height+2,2);
    bar.lineStyle(0).beginFill(gold).drawCircle(-width/2-5,0,2).drawCircle(width/2+5,0,2).endFill();
    const zeroForceX=held&&forceStyle==='onbar'?-width/2+width*zeroForceShare:null;
    const shieldX=drawForceTreatment(bar,width,p,forceStyle,thresholdShare);
    // The blade points down, above the shield's paint but below the separate
    // Force-number text child. Zero-Force overlap keeps both markers visible.
    if(zeroForceX!==null)drawZeroForceSword(bar,zeroForceX);
    // Match the shield fill behind the digits so the blade cannot show through
    // the open centre of a zero when the markers coincide.
    if(zeroForceX!==null&&Math.abs(zeroForceX-shieldX)<forceNumber.width/2+3){
      const numberWidth=Math.min(36,forceNumber.width);
      bar.lineStyle(0).beginFill(crown?0x392323:0x18282d,.98).drawRoundedRect(shieldX-numberWidth/2,-10,numberWidth,20,2).endFill();
    }
    forceNumber.visible=forceStyle==='onbar';forceNumber.position.set(shieldX??0,p.unrest?23:0);
    influence.hitArea=new PIXI.Rectangle(-width/2-26,-28,width+52,66);
    root.floatingLayout={sprite:{left,right,top,bottom},badge:{x:badge.x,y:badge.y},bar:{x:(left+right)/2,y:top-barOffset,width,shieldX:shieldX??0,zeroForceX}};
  };
  root.measureFloating=()=>{
    const track=root.floatingLayout.bar,anchor=root.toGlobal({x:track.x+track.shieldX,y:track.y}),trackA=root.toGlobal({x:track.x-track.width/2,y:track.y-4.5}),trackB=root.toGlobal({x:track.x+track.width/2,y:track.y+4.5});
    const zeroForceSwordAnchor=track.zeroForceX===null?null:root.toGlobal({x:track.x+track.zeroForceX,y:track.y});
    const b=root.floatingLayout.sprite,a=root.toGlobal({x:b.left,y:b.top}),z=root.toGlobal({x:b.right,y:b.bottom});
    const rect=item=>{const b=item.getBounds();return {x:b.x,y:b.y,width:b.width,height:b.height};};
    return {regionId:indicator.regionId,holder:p.holder,status:p.status,warriors:p.warriors,warriorForce:p.warriorForce,bonusForce:p.bonusForce,minimumLoyal,thresholdShare,zeroForceShare,forceReductionShare,zeroForceSwordAnchor:zeroForceSwordAnchor?{x:zeroForceSwordAnchor.x,y:zeroForceSwordAnchor.y}:null,barParts:parts.map(part=>({id:part.id,count:part.count})),sprite:{x:a.x,y:a.y,width:z.x-a.x,height:z.y-a.y},countBounds:rect(counter),badge:rect(badge),prestige:prestige.visible?rect(prestige):null,prestigeActive:player,prestigeLabel,bar:rect(influence),name:null,countKind,count,shownPrestige,exactPrestige:value,unrest:p.unrest,unrestLabel:p.unrest?forceNumber.text:null,force:p.force,shownForce:held?Number(forceNumber.text):null,required:p.required,forceSample,forceStyle:lastStyle,screenScale:root.scale.x*lastZoom,shieldAnchor:{x:anchor.x,y:anchor.y},meterTrack:{x:trackA.x,y:trackA.y,width:trackB.x-trackA.x,height:trackB.y-trackA.y}};
  };
  root.updateFloatingLayout(1);
  return root;
}

function drawZeroForceSword(g,x){
  const edge=0x111b17,steel=0xc1c8bc,hilt=0xc9b27d;
  g.lineStyle(1.2,edge).beginFill(steel,.95).drawPolygon([x,34,x+2,28,x+2,-6,x,-9,x-2,-6,x-2,28]).endFill();
  g.lineStyle(1,0xf0ead9,.8).moveTo(x,28).lineTo(x,-4);
  g.lineStyle(3.5,edge).moveTo(x-6,-8).lineTo(x+6,-8);
  g.lineStyle(1.5,hilt).moveTo(x-6,-8).lineTo(x+6,-8);
  g.lineStyle(4,edge).moveTo(x,-10).lineTo(x,-21);
  g.lineStyle(2,hilt).moveTo(x,-10).lineTo(x,-21);
  g.lineStyle(1,edge).beginFill(hilt).drawCircle(x,-23,2).endFill();
}


function pathProgress(g,points,fraction,colour,width=3){
  const lengths=points.slice(1).map((p,i)=>Math.hypot(p[0]-points[i][0],p[1]-points[i][1]));
  let remaining=lengths.reduce((n,length)=>n+length,0)*Math.max(0,Math.min(1,fraction));
  g.lineStyle(width,colour,1).moveTo(...points[0]);
  for(let i=0;i<lengths.length&&remaining>0;i++){
    const t=Math.min(1,remaining/Math.max(.001,lengths[i]));
    g.lineTo(points[i][0]+(points[i+1][0]-points[i][0])*t,points[i][1]+(points[i+1][1]-points[i][1])*t);remaining-=lengths[i];
  }
}
function roundedTrack(width,height){
  const r=5,points=[[0,-height/2]];
  for(const [x,y,start] of [[width/2-r,-height/2+r,-90],[width/2-r,height/2-r,0],[-width/2+r,height/2-r,90],[-width/2+r,-height/2+r,180]]){
    for(let i=0;i<=5;i++){const a=(start+i*18)*Math.PI/180;points.push([x+Math.cos(a)*r,y+Math.sin(a)*r]);}
  }
  points.push(points[0]);return points;
}
function drawForceTreatment(g,width,p,style,thresholdShare){
  if(p.unrest)return null;
  const coverage=p.required>0?Math.min(1,p.force/p.required):0,blue=0x9bbdce,track=0x435962;
  if(style==='onbar'){
    const x=-width/2+width*(thresholdShare??.5);
    const crown=p.holder==='external-a',metal=crown?0xdbab7d:blue;
    const edge=p.contested?0xe1a08a:p.status==='occupied'?metal:crown?0xbb8967:0x9fa99e;
    g.lineStyle(2,0x111b17).beginFill(crown?0x392323:0x18282d,.98).drawPolygon([x-22,-25,x+22,-25,x+21,9,x,25,x-21,9]).endFill();
    g.lineStyle(1.5,edge).drawPolygon([x-20,-23,x+20,-23,x+19,8,x,22,x-19,8]);
    if(coverage)g.lineStyle(3,metal,.9).moveTo(x-16,8).lineTo(x,20).lineTo(x+16,8);
    return x;
  }else if(style==='surround'){
    const points=roundedTrack(width+16,27);
    pathProgress(g,points,1,track,2);if(coverage)pathProgress(g,points,coverage,blue,3);
  }else if(style==='rail'){
    g.lineStyle(1,0x78929d,.85).moveTo(-width/2-4,5).lineTo(-width/2-4,16).lineTo(width/2+4,16).lineTo(width/2+4,5);
    g.lineStyle(0).beginFill(0x1c2d32,.95).drawRoundedRect(-width/2,10,width,4,2).endFill();
    if(coverage)g.beginFill(blue).drawRoundedRect(-width/2,10,width*coverage,4,2).endFill();
    g.lineStyle(1,0x92aebc,.8).moveTo(0,16).lineTo(0,20);
  }else{
    const x=width/2+19;
    g.lineStyle(1.5,p.contested?0xe1a08a:0x78929d).beginFill(0x172830,.95).drawPolygon([x-9,-12,x+9,-12,x+9,2,x,13,x-9,2]).endFill();
    if(coverage){
      const y=13-25*coverage;
      g.lineStyle(0).beginFill(blue,.95);
      if(y>=2){const half=9*(13-y)/11;g.drawPolygon([x-half,y,x+half,y,x,13]);}
      else g.drawPolygon([x-9,y,x+9,y,x+9,2,x,13,x-9,2]);
      g.endFill();
    }
  }
}
