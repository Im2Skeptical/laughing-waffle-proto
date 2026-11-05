// Throwaway visual proposal: three graphical readings around the real sprite.
// Region selection remains the game's existing direct economy disclosure.
import {createText} from '../settlement-view-primitives.js';
import {TEXT_STYLES} from '../settlement-theme.js';
import {addResourceIcon} from '../resource-cost-pixi.js';

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
    force:forceSample==='short'?4:8,required:6,status:forceSample==='short'?'contested':'occupied',
    contested:forceSample==='short',unrest:forceSample==='short'?75:50}:original;
  const params=new URLSearchParams(globalThis.location?.search??'');
  const countKind=params.get('regionalCount')==='workers'?'workers':'population';
  const count=countKind==='workers'?(forceSample?13:indicator.totalWorkerCount):p.total;
  const gold=player?0xf1d18b:crown?0xc69872:0x9abbb0;
  const root=new PIXI.Container();root.label='floating-settlement-readout';root.mapRegionId=indicator.regionId;
  root.position.set(point.x,point.y);parent.addChild(root);

  const value=player?(forceSample?p.total/indicator.prestigePopulationPerPoint*(1-p.unrest/100):indicator.prestigePerNode):p.total/indicator.prestigePopulationPerPoint;
  const shownPrestige=String(Math.round(value));
  const badge=new PIXI.Container();badge.label='floating-summary-badge';root.addChild(badge);
  const frame=new PIXI.Graphics();badge.addChild(frame);
  const counter=new PIXI.Container();counter.label='floating-count';badge.addChild(counter);
  const countNumber=label(counter,String(count),27);
  const prestige=new PIXI.Container();prestige.label='floating-prestige';badge.addChild(prestige);
  const prestigeNumber=label(prestige,(player?'+':'')+shownPrestige,27,player?0xffe3a0:0xd8b28d);
  const leftWidth=Math.max(66,countNumber.width+39),rightWidth=player||crown?Math.max(62,prestigeNumber.width+39):0;
  const badgeWidth=leftWidth+rightWidth,left=-badgeWidth/2,divider=left+leftWidth;
  frame.lineStyle(1.5,gold,.9).beginFill(0x17231b,.9)
    .drawPolygon([left,-12,left+6,-19,-left-6,-19,-left,-12,-left,12,-left-6,19,left+6,19,left,12]).endFill();
  frame.lineStyle(1,gold,.25).moveTo(left+7,-15).lineTo(-left-7,-15);
  if(rightWidth)frame.lineStyle(1,gold,.65).moveTo(divider,-13).lineTo(divider,13);
  if(countKind==='population')addResourceIcon(counter,'population',left+17,0,25);
  else{const glyph=new PIXI.Graphics().beginFill(0xf1dfb8).drawCircle(left+17,-7,3.5).drawRoundedRect(left+13,-1,8,11,2).endFill();counter.addChild(glyph);}
  countNumber.x=left+33+countNumber.width/2;
  counter.hitArea=new PIXI.Rectangle(left-2,-24,leftWidth+2,48);
  const demo=forceSample?['Display-only political example for visual comparison.']:[];
  inspect(counter,{title:reference+(countKind==='population'?' - Population':' - Workers'),lines:[...demo,
    `${p.total} total residents.`,`${forceSample?13:indicator.totalWorkerCount} total workers.`,
    ...(forceSample?[]:[`${indicator.activeWorkerCount} assigned; ${indicator.unusedWorkerCount} unused.`])],maxWidth:340},tooltipView,'floating-count:'+indicator.regionId);
  if(rightWidth){addResourceIcon(prestige,'prestige',divider+17,0,25);prestigeNumber.x=divider+33+prestigeNumber.width/2;}
  prestige.visible=rightWidth>0;
  prestige.hitArea=new PIXI.Rectangle(divider,-24,rightWidth+2,48);
  inspect(prestige,{title:player?'Territorial Prestige':'Potential territorial Prestige',lines:[...demo,...(player?
    [`${amount(value)} Prestige per completed node into the shared civilization treasury.`,`${Math.round(p.unrest)}% unrest reduces this region's contribution.`]:
    [`Potential ${amount(value)} Prestige per completed node if you held this region at zero unrest.`,'This is not current income or a post-capture guarantee.']),
    'Map amounts are rounded to whole numbers. Regional contributions are combined before rounding the node payout.'],maxWidth:370},tooltipView,'floating-prestige:'+indicator.regionId);

  const influence=new PIXI.Container();influence.label='floating-influence';root.addChild(influence);
  const bar=new PIXI.Graphics();influence.addChild(bar);
  const status=p.status==='supported'?'Population-supported':p.status==='occupied'?'Military occupation':p.contested?'Control contested':'Unheld';
  inspect(influence,{title:reference+' - '+status,lines:[...demo,
    ...p.parts.map(part=>`${part.name}: ${part.count} / ${p.total} (${Math.round(part.count/p.total*100)}%).`),
    `Supplied holding Force ${amount(p.force)}${p.required?' / '+p.required+' required':''}; unrest ${Math.round(p.unrest)}%.`,
    'The coloured bar is population allegiance; steel blue shows holding Force.',
    'A full Force meter meets the occupation requirement. Inspect the amount for surplus.',
    'Force holds territory without converting its population.',
  ],maxWidth:370},tooltipView,'floating-influence:'+indicator.regionId);

  const bounds=spriteBounds??{min:{x:point.x-27,y:point.y-70},max:{x:point.x+27,y:point.y}};
  let lastZoom=null,lastFactor=null,lastStyle=null;root.floatingScaleFactor=1.08;
  root.updateFloatingLayout=zoom=>{
    const forceStyle=new URLSearchParams(globalThis.location?.search??'').get('regionalForce')??'shield';
    if(lastZoom!==zoom)root.floatingScaleFactor=1.08;
    if(lastZoom===zoom&&lastFactor===root.floatingScaleFactor&&lastStyle===forceStyle)return;lastZoom=zoom;lastFactor=root.floatingScaleFactor;lastStyle=forceStyle;root.floatingDirty=true;
    const scale=root.floatingScaleFactor/Math.max(.25,zoom);root.scale.set(scale);
    const left=(bounds.min.x-point.x)/scale,right=(bounds.max.x-point.x)/scale;
    const top=(bounds.min.y-point.y)/scale,bottom=(bounds.max.y-point.y)/scale;
    badge.position.set((left+right)/2,top-25);
    const width=Math.max(112,Math.min(156,right-left+24)),height=9;
    influence.position.set((left+right)/2,bottom+16);
    bar.clear().lineStyle(1,0x131b15,1).beginFill(0x101b15,.85).drawRoundedRect(-width/2-3,-height/2-3,width+6,height+6,4).endFill();
    let x=-width/2;
    for(const part of p.parts){const w=width*part.count/p.total;bar.lineStyle(0).beginFill(part.colour).drawRect(x,-height/2,w,height).endFill();x+=w;}
    bar.lineStyle(1,gold,.9).drawRoundedRect(-width/2-1,-height/2-1,width+2,height+2,2);
    bar.lineStyle(0).beginFill(gold).drawCircle(-width/2-5,0,2).drawCircle(width/2+5,0,2).endFill();
    drawForceTreatment(bar,width,p,forceStyle);
    influence.hitArea=new PIXI.Rectangle(-width/2-12,-22,width+48,48);
    root.floatingLayout={sprite:{left,right,top,bottom},badge:{x:badge.x,y:badge.y},bar:{x:(left+right)/2,y:bottom+16,width}};
  };
  root.measureFloating=()=>{
    const b=root.floatingLayout.sprite,a=root.toGlobal({x:b.left,y:b.top}),z=root.toGlobal({x:b.right,y:b.bottom});
    const rect=item=>{const b=item.getBounds();return {x:b.x,y:b.y,width:b.width,height:b.height};};
    return {regionId:indicator.regionId,sprite:{x:a.x,y:a.y,width:z.x-a.x,height:z.y-a.y},count:rect(counter),badge:rect(badge),prestige:prestige.visible?rect(prestige):null,bar:rect(influence),name:null,countKind,count,shownPrestige,exactPrestige:value,force:p.force,required:p.required,forceSample,forceStyle:lastStyle};
  };
  root.updateFloatingLayout(1);
  return root;
}


// Dense neighbouring towns keep the same coherent arrangement. Reduce only
// their overlay scale slightly at overview zoom instead of scattering readings.
export function resolveFloatingReadouts(roots,zoom){
  if(!roots.some(root=>root.floatingDirty))return;
  const overlaps=(a,b)=>a&&b&&a.x<b.x+b.width+4&&a.x+a.width+4>b.x&&a.y<b.y+b.height+4&&a.y+a.height+4>b.y;
  for(let pass=0;pass<4;pass++){
    const shrink=new Set(),measurements=roots.map(root=>({root,m:root.measureFloating()}));
    for(let i=0;i<measurements.length;i++)for(const b of measurements.slice(i+1)){
      const a=measurements[i];
      for(const ka of ['badge']){
        if(overlaps(a.m[ka],b.m.bar)||overlaps(a.m[ka],b.m.sprite))shrink.add(a.root);
        if(overlaps(b.m[ka],a.m.bar)||overlaps(b.m[ka],a.m.sprite))shrink.add(b.root);
      }
      if(['badge'].some(ka=>['badge'].some(kb=>overlaps(a.m[ka],b.m[kb])))){
        shrink.add(a.root);shrink.add(b.root);
      }
    }
    if(!shrink.size)break;
    for(const root of shrink){root.floatingScaleFactor=Math.max(.78,root.floatingScaleFactor*.92);root.updateFloatingLayout(zoom);}
  }
  roots.forEach(root=>{root.floatingDirty=false;});
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
function drawForceTreatment(g,width,p,style){
  const coverage=p.required>0?Math.min(1,p.force/p.required):0,blue=0x9bbdce,track=0x435962;
  if(style==='surround'){
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
