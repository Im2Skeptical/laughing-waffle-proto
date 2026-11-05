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
export function addFloatingSettlementPrototype(parent,point,indicator,{reference,tooltipView,spriteBounds}){
  const p=indicator.influence;if(!p||indicator.monster)return;
  const player=indicator.controller==='player',crown=indicator.controller==='external-a';
  const gold=player?0xf1d18b:crown?0xc69872:0x9abbb0;
  const root=new PIXI.Container();root.label='floating-settlement-readout';root.mapRegionId=indicator.regionId;
  root.position.set(point.x,point.y);root.floatingPriority=player?0:crown?1:2;parent.addChild(root);

  const workers=new PIXI.Container();workers.label='floating-workers';root.addChild(workers);
  const workerInk=new PIXI.Graphics().lineStyle(1,gold,.9).beginFill(0x17231b,.8)
    .drawEllipse(0,0,29,19).endFill();
  workerInk.lineStyle(0).beginFill(0xf1dfb8).drawCircle(-15,-7,3.5).drawRoundedRect(-19,-1,8,11,2).endFill();workers.addChild(workerInk);
  const workerNumber=label(workers,String(indicator.totalWorkerCount),28);workerNumber.x=7;
  workers.hitArea=new PIXI.Rectangle(-34,-24,68,48);
  inspect(workers,{title:reference+' - Workers',lines:[`${indicator.totalWorkerCount} total workers.`,`${indicator.activeWorkerCount} assigned; ${indicator.unusedWorkerCount} unused.`,`${p.total} residents; workers are a separate count.`],maxWidth:320},tooltipView,'floating-workers:'+indicator.regionId);

  const prestige=new PIXI.Container();prestige.label='floating-prestige';root.addChild(prestige);
  const value=player?indicator.prestigePerNode:p.total/indicator.prestigePopulationPerPoint;
  const prestigeInk=new PIXI.Graphics().lineStyle(1,gold,player ? .85 : .5).beginFill(0x17231b,player ? .72 : .45)
    .drawPolygon([-39,0,-29,-17,28,-17,39,0,28,17,-29,17]).endFill();prestige.addChild(prestigeInk);
  addResourceIcon(prestige,'prestige',-21,0,25);
  const prestigeNumber=label(prestige,(player?'+':'')+amount(value),27,player?0xffe3a0:0xd8b28d);prestigeNumber.x=10;
  prestige.visible=player||crown;
  prestige.hitArea=new PIXI.Rectangle(-43,-24,86,48);
  inspect(prestige,{title:player?'Territorial Prestige':'Potential territorial Prestige',lines:player?
    [`${amount(value)} Prestige per completed node into the shared civilization treasury.`,`${Math.round(p.unrest)}% unrest reduces this region's contribution.`,'Regional contributions are combined before rounding the node payout.']:
    [`Potential ${amount(value)} Prestige per completed node if you held this region at zero unrest.`,'This is not current income or a post-capture guarantee.',`Provisional population divisor: ${indicator.prestigePopulationPerPoint}.`],maxWidth:360},tooltipView,'floating-prestige:'+indicator.regionId);

  const influence=new PIXI.Container();influence.label='floating-influence';root.addChild(influence);
  const bar=new PIXI.Graphics();influence.addChild(bar);
  const status=p.status==='supported'?'Population-supported':p.status==='occupied'?'Military occupation':p.contested?'Control contested':'Unheld';
  inspect(influence,{title:reference+' - '+status,lines:[
    ...p.parts.map(part=>`${part.name}: ${part.count} / ${p.total} (${Math.round(part.count/p.total*100)}%).`),
    `Supplied holding Force ${amount(p.force)}${p.required?' / '+p.required+' required':''}; unrest ${Math.round(p.unrest)}%.`,
    'The coloured bar is population allegiance. The shield is military holding.',
    'Force holds territory without converting its population.',
  ],maxWidth:370},tooltipView,'floating-influence:'+indicator.regionId);

  const bounds=spriteBounds??{min:{x:point.x-27,y:point.y-70},max:{x:point.x+27,y:point.y}};
  let lastZoom=null,lastFactor=null;root.floatingScaleFactor=1.08;
  root.updateFloatingLayout=zoom=>{
    if(lastZoom!==zoom)root.floatingScaleFactor=1.08;
    if(lastZoom===zoom&&lastFactor===root.floatingScaleFactor)return;lastZoom=zoom;lastFactor=root.floatingScaleFactor;root.floatingDirty=true;
    const scale=root.floatingScaleFactor/Math.max(.25,zoom);root.scale.set(scale);
    const left=(bounds.min.x-point.x)/scale,right=(bounds.max.x-point.x)/scale;
    const top=(bounds.min.y-point.y)/scale,bottom=(bounds.max.y-point.y)/scale;
    workers.position.set((left+right)/2-40,top-25);
    prestige.position.set((left+right)/2+40,top-25);
    const width=Math.max(112,Math.min(156,right-left+24)),height=9;
    influence.position.set((left+right)/2,bottom+16);
    bar.clear().lineStyle(1,0x131b15,1).beginFill(0x101b15,.85).drawRoundedRect(-width/2-3,-height/2-3,width+6,height+6,4).endFill();
    let x=-width/2;
    for(const part of p.parts){const w=width*part.count/p.total;bar.lineStyle(0).beginFill(part.colour).drawRect(x,-height/2,w,height).endFill();x+=w;}
    bar.lineStyle(1,gold,.9).drawRoundedRect(-width/2-1,-height/2-1,width+2,height+2,2);
    bar.lineStyle(0).beginFill(gold).drawCircle(-width/2-5,0,2).drawCircle(width/2+5,0,2).endFill();
    // Force belongs to this bar's end-cap, never to its allegiance fill.
    if(p.status==='occupied'||p.contested){
      const sx=width/2+18,colour=p.contested?0xe18b74:0xa7bdcb;
      bar.lineStyle(1.5,colour).beginFill(0x1d2926,.95).drawPolygon([sx-8,-10,sx+8,-10,sx+7,4,sx,11,sx-7,4]).endFill();
      if(p.contested)bar.lineStyle(2,colour).moveTo(sx,-5).lineTo(sx,2).moveTo(sx,5).lineTo(sx,6);
    }
    influence.hitArea=new PIXI.Rectangle(-width/2-12,-20,width+48,40);
    root.floatingLayout={sprite:{left,right,top,bottom},workers:{x:workers.x,y:workers.y},prestige:{x:prestige.x,y:prestige.y},bar:{x:(left+right)/2,y:bottom+16,width}};
  };
  root.measureFloating=()=>{
    const b=root.floatingLayout.sprite,a=root.toGlobal({x:b.left,y:b.top}),z=root.toGlobal({x:b.right,y:b.bottom});
    const rect=item=>{const b=item.getBounds();return {x:b.x,y:b.y,width:b.width,height:b.height};};
    return {regionId:indicator.regionId,sprite:{x:a.x,y:a.y,width:z.x-a.x,height:z.y-a.y},workers:rect(workers),prestige:prestige.visible?rect(prestige):null,bar:rect(influence),name:null};
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
      for(const ka of ['workers','prestige']){
        if(overlaps(a.m[ka],b.m.bar)||overlaps(a.m[ka],b.m.sprite))shrink.add(a.root);
        if(overlaps(b.m[ka],a.m.bar)||overlaps(b.m[ka],a.m.sprite))shrink.add(b.root);
      }
      if(['workers','prestige'].some(ka=>['workers','prestige'].some(kb=>overlaps(a.m[ka],b.m[kb])))){
        shrink.add(a.root);shrink.add(b.root);
      }
    }
    if(!shrink.size)break;
    for(const root of shrink){root.floatingScaleFactor=Math.max(.78,root.floatingScaleFactor*.92);root.updateFloatingLayout(zoom);}
  }
  roots.forEach(root=>{root.floatingDirty=false;});
}
