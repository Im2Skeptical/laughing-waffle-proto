import {createText} from '../settlement-view-primitives.js';
import {TEXT_STYLES} from '../settlement-theme.js';
import {addResourceIcon} from '../resource-cost-pixi.js';
import {REGIONAL_READOUT_SCREEN_SCALE} from './constants.js';

export function addMonsterReadout(parent,point,indicator,{reference,tooltipView}){
  const threat=indicator.monsterThreat;if(!threat)return null;
  const root=new PIXI.Container();root.label='monster-strength-readout';root.mapRegionId=indicator.regionId;
  root.position.set(point.x,point.y);parent.addChild(root);
  const badge=new PIXI.Container();root.addChild(badge);
  const frame=new PIXI.Graphics().lineStyle(2,0xd09b80,.95).beginFill(0x301c25,.97).drawRoundedRect(-55,-22,110,44,20).endFill();
  frame.lineStyle(1,0xe0b58b,.25).drawRoundedRect(-51,-18,102,36,16);badge.addChild(frame);
  addResourceIcon(badge,'monster',-30,0,30);
  const value=createText(String(threat.strength),{...TEXT_STYLES.title,fontSize:29,fill:0xffe2b8},14,0,.5,.5);
  value.label='monster-strength-value';badge.addChild(value);
  const lines=[`Strength ${threat.strength}: attack and defense rating.`,
    `Repelled: gain +${threat.repelStrengthGain} Strength for the next attack.`,
    'Matching or higher Defense holds the region.'];
  if(threat.targetRegionId){
    lines.push(`Attack target: ${threat.targetName??threat.targetRegionId}.`);
    if(threat.targetDefense!==null)lines.push(`Target Defense ${Number(threat.targetDefense.toFixed(2))}: ${threat.willBeRepelled?'would hold this attack':'would be overrun'}.`);
  }else lines.push('No adjacent region remains to spread into.');
  const inspection=()=>({title:reference+' · Monster Strength',lines,maxWidth:380,
    scale:globalThis.innerWidth<=900?3.2:2});
  badge.eventMode='static';badge.cursor='help';badge.hitArea=new PIXI.Rectangle(-63,-29,126,58);
  badge.on('pointerover',e=>{if(e.pointerType!=='touch')tooltipView?.show?.(inspection(),badge.getBounds(),{dismissOnExit:true});});
  badge.on('pointerout',()=>tooltipView?.hide?.());
  badge.on('pointerdown',e=>{e.stopPropagation();tooltipView?.pin?.(inspection(),badge.getBounds(),'monster-strength:'+indicator.regionId);});
  let lastZoom=1;
  root.updateFloatingLayout=zoom=>{
    lastZoom=Math.max(.25,Number(zoom)||1);const scale=REGIONAL_READOUT_SCREEN_SCALE/lastZoom;
    root.scale.set(scale);badge.position.set(0,18/scale+28);
  };
  root.measureMonster=()=>{const b=badge.getBounds();return {regionId:indicator.regionId,strength:threat.strength,
    targetRegionId:threat.targetRegionId,targetDefense:threat.targetDefense,willBeRepelled:threat.willBeRepelled,
    screenScale:root.scale.x*lastZoom,bounds:{x:b.x,y:b.y,width:b.width,height:b.height}};};
  root.updateFloatingLayout(1);return root;
}
