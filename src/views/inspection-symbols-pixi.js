import { getResourceTexture, getStockTraitTexture } from './chronicle-art.js';
import { eventIcon, seasonIcon } from './piece-face-chrome.js';
import { paintRelicPanel, RELIC } from './chronicle-skin.js';
import { createText } from './settlement-view-primitives.js';
import { TEXT_STYLES } from './settlement-theme.js';

// Only symbols present on the selected face, with Stock tags leading the key.
export function getPracticeSymbols(face) {
  const rows=[],seen=new Set();
  const add=(name,symbol)=>{if(!seen.has(name)){seen.add(name);rows.push({name,...symbol});}};
  if(face.kind==='structure') {
    for(const bonus of face.structureBonuses??[]) {
      for(const trait of bonus.traits??[])add(trait,{trait});
      add(bonus.kind==='stock'?'Stock capacity bonus':bonus.label,bonus.kind==='stock'?{drawing:'capacity'}:{icon:bonus.kind});
    }
    // Footprint is the width of the illustrated Structure itself.
    add('Construction footprint',{glyph:String(face.footprint)});
  } else {
    if(face.stockCapacity>0) {
      add('Stock',{icon:'stock'});add('Stock capacity',{glyph:`${face.stock}/${face.stockCapacity}`});
      for(const trait of face.stockTraits??[])add(trait,{trait});
    }
    if(face.workerCapacity>0) {
      add('Worker',{drawing:'worker'});add('Worker multiplier',{glyph:`×${face.workerMultiplier}`});
    }
    if(face.reading.type==='Charge') {
      add('Charge',{drawing:'meter'});
      for(const trigger of face.chargeTriggers??[]) {
        if(trigger.trait)add(trigger.trait,{trait:trigger.trait});
        else add(({death:'Death',knowledge:'Knowledge',stock:'Stock',chaos:'Chaos',monster:'Monster',defense:'Defense',support:'Support',danger:'Danger',campaign:'Campaign',challenge:'Challenge',development:'Development',trade:'Trade'})[trigger.icon]??trigger.icon,{icon:trigger.icon});
        if(trigger.event==='stockGenerated')add('Produce',{glyph:'↑'});
        if(trigger.event==='stockConsumed')add('Consume',{glyph:'↓'});
      }
    } else if(face.source?.icon==='passive')add('Activation',{icon:'activation'});
    else add('Cycle',{wheel:face.source?.icon==='season'?'solar-wheel':'moon-wheel',icon:face.source?.icon==='season'?'year':face.source?.icon});
    for(const input of face.inputs??[]) {
      for(const trait of input.traits)add(trait,{trait});
      add(input.kind==='consume'?'Consume':'Require',{glyph:input.kind==='consume'?'−':'◇'});
    }
    for(const effect of face.production??[]) {
      if(effect.season)add(effect.season[0].toUpperCase()+effect.season.slice(1),{season:effect.season});
      else add(({stock:'Stock',research:'Research',population:'Specialist training',prestige:'Prestige',activation:'Quality',support:'Support',hourglass:'Preview',housingCapacity:'Housing',faith:'Chaos resistance',food:'Meal saving'})[effect.icon]??effect.icon,{icon:effect.icon});
    }
  }
  add('Quality',{drawing:'jewel'});
  return rows.sort((a,b)=>Number(!!b.trait)-Number(!!a.trait));
}

export function addPracticeGlossary(parent,width,face,fontSize=36) {
  const root=new PIXI.Container(),frame=new PIXI.Graphics();root.addChild(frame);
  const copy=(value,x,y,size=fontSize)=>{
    const node=createText(value,{...TEXT_STYLES.body,fontSize:size,lineHeight:size*1.25,fill:RELIC.gold,wordWrap:true,wordWrapWidth:width-x-24},x,y);root.addChild(node);return node;
  };
  const sprite=(texture,x,y,size)=>{
    if(!texture?.baseTexture.valid)return;
    const node=new PIXI.Sprite(texture);node.scale.set(Math.min(size/texture.width,size/texture.height));node.anchor.set(.5);node.position.set(x,y);node.eventMode='none';root.addChild(node);
  };
  copy('SYMBOLS',24,24,fontSize*.72);
  let y=fontSize+48;
  root.entries=getPracticeSymbols(face);
  for(const row of root.entries) {
    const x=60,cy=y+fontSize*.7,size=fontSize*1.3;
    if(row.trait)sprite(getStockTraitTexture(row.trait),x,cy,size);
    else if(row.season)seasonIcon(root,row.season,x,cy,size);
    else if(row.glyph) {
      const glyph=copy(row.glyph,x,cy,row.glyph.length>3?fontSize*.72:fontSize);glyph.anchor.set(.5);glyph.style.wordWrap=false;
    } else if(row.drawing) {
      const g=new PIXI.Graphics();root.addChild(g);
      if(row.drawing==='worker')g.lineStyle(2,0x777b75).beginFill(0x1a2020).drawCircle(x,cy-11,8).drawRoundedRect(x-12,cy-2,24,22,5).endFill();
      if(row.drawing==='jewel')g.lineStyle(2,0xf0dbae).beginFill(({bronze:0xa47a50,silver:0xbdc7c7,gold:0xd9b45d,diamond:0x92d7dc})[face.tier]).drawPolygon([x,cy-13,x+13,cy,x,cy+13,x-13,cy]).endFill();
      if(row.drawing==='meter') {
        g.lineStyle(2,RELIC.brass).beginFill(0x152321).drawRect(x-30,cy-12,60,24).endFill();
        const steps=Math.max(1,Math.min(12,face.chargeThreshold??1));
        for(let step=1;step<steps;step++){const dx=x-30+60*step/steps;g.moveTo(dx,cy-12).lineTo(dx,cy+12);}
      }
      if(row.drawing==='capacity')g.lineStyle(2,0xffffff).beginFill(0x0b100d).drawPolygon([x-20,cy-12,x+4,cy-20,x+20,cy-10,x+20,cy+14,x-4,cy+22,x-20,cy+12]).endFill();
      g.eventMode='none';
    } else {
      if(row.wheel)sprite(getResourceTexture(row.wheel),x,cy,size*1.2);
      eventIcon(root,row.icon,x,cy,row.wheel?size*.7:size);
    }
    copy('—',103,y+5);
    const label=copy(row.name,143,y+5);label.inspectionKeyword=row.name;
    y+=Math.max(fontSize*1.8,label.height+22);
  }
  paintRelicPanel(frame,0,0,width,y+16,0x1e211c,RELIC.brass,1);
  root.readingHeight=y+16;parent.addChild(root);return root;
}
