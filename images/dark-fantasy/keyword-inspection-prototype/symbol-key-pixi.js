// Prototype: translate the selected card's visible symbols into short names.
// Full explanations remain behind the existing recursive keyword links.
import { getResourceTexture, getStockTraitTexture } from '../../../src/views/chronicle-art.js';
import { addResourceIcon } from '../../../src/views/resource-cost-pixi.js';
import { paintRelicPanel, RELIC } from '../../../src/views/chronicle-skin.js';
import { TEXT_STYLES } from '../../../src/views/settlement-theme.js';

export function addSymbolKey(face,width) {
  const root=new PIXI.Container(),frame=new PIXI.Graphics();root.addChild(frame);
  const rows=[],seen=new Set();
  const add=(name,symbol,key=name)=>{if(!seen.has(key)){seen.add(key);rows.push({name,...symbol});}};
  if(face.stockCapacity>0) {
    add('Stock',{icon:'stock'});
    add('Stock capacity',{glyph:`${face.stock}/${face.stockCapacity}`});
    for(const trait of face.stockTraits??[])add(trait,{trait});
  }
  if(face.workerCapacity>0) {
    add('Worker',{drawing:'worker'});
    add('Worker multiplier',{glyph:`×${face.workerMultiplier}`});
  }
  if(face.reading.type==='Charge') {
    add('Charge',{drawing:'meter'});
    for(const trigger of face.chargeTriggers??[]) {
      if(trigger.trait)add(trigger.trait,{trait:trigger.trait});
      else add(({death:'Death',knowledge:'Knowledge',stock:'Stock'})[trigger.icon]??trigger.icon,{icon:trigger.icon});
      if(trigger.event==='stockGenerated')add('Produce',{glyph:'↑'});
      if(trigger.event==='stockConsumed')add('Consume',{glyph:'↓'});
    }
  } else add(face.source?.icon==='passive'?'Activation':'Cycle',{wheel:face.source?.icon==='season'?'solar-wheel':'moon-wheel',icon:face.source?.icon==='season'?'year':face.source?.icon==='passive'?'activation':face.source?.icon});
  for(const input of face.inputs??[]) {
    for(const trait of input.traits)add(trait,{trait});
    add(input.kind==='consume'?'Consume':'Require',{glyph:input.kind==='consume'?'−':'◇'});
  }
  for(const effect of face.production??[]) {
    if(effect.season)add(effect.season[0].toUpperCase()+effect.season.slice(1),{season:effect.season});
    else add(({stock:'Stock',research:'Research',population:'Specialist training',prestige:'Prestige',activation:'Quality',support:'Support',hourglass:'Preview',housingCapacity:'Housing',faith:'Chaos resistance',food:'Meal saving'})[effect.icon]??effect.icon,{icon:effect.icon});
  }
  add('Quality',{drawing:'jewel'});
  const copy=(value,x,y,size=36)=>{
    const node=new PIXI.Text(value,{...TEXT_STYLES.body,fontSize:size,lineHeight:size*1.25,fill:RELIC.bone});node.position.set(x,y);root.addChild(node);return node;
  };
  const sprite=(texture,x,y,size=48)=>{
    const node=new PIXI.Sprite(texture);node.scale.set(Math.min(size/texture.width,size/texture.height));node.anchor.set(.5);node.position.set(x,y);node.eventMode='none';root.addChild(node);return node;
  };
  copy('SYMBOLS',24,24,26).style.fill=RELIC.gold;
  let y=80;
  for(const row of rows) {
    const x=59,cy=y+30;
    if(row.trait)sprite(getStockTraitTexture(row.trait),x,cy);
    else if(row.season) {
      if(row.season==='summer')addResourceIcon(root,'year',x,cy,48);
      else {const leaf=sprite(getStockTraitTexture('Plant'),x,cy);leaf.tint=row.season==='autumn'?0xe0a05a:0xbde897;}
    } else if(row.glyph) {
      const glyph=copy(row.glyph,x,cy,row.glyph.length>3?26:36);glyph.anchor.set(.5);
    } else if(row.drawing) {
      const g=new PIXI.Graphics();root.addChild(g);
      if(row.drawing==='worker')g.lineStyle(2,0x777b75).beginFill(0x1a2020).drawCircle(x,cy-11,8).drawRoundedRect(x-12,cy-2,24,22,5).endFill();
      if(row.drawing==='jewel')g.lineStyle(2,0xf0dbae).beginFill(({bronze:0xa47a50,silver:0xbdc7c7,gold:0xd9b45d,diamond:0x92d7dc})[face.tier]).drawPolygon([x,cy-13,x+13,cy,x,cy+13,x-13,cy]).endFill();
      if(row.drawing==='meter') {
        g.lineStyle(2,RELIC.brass).beginFill(0x152321).drawRect(x-30,cy-12,60,24).endFill();
        const steps=Math.max(1,Math.min(12,face.chargeThreshold));
        for(let step=1;step<steps;step++){const dx=-30+60*step/steps;g.moveTo(x+dx,cy-12).lineTo(x+dx,cy+12);}
      }
      g.eventMode='none';
    } else {
      if(row.wheel)sprite(getResourceTexture(row.wheel),x,cy,58);
      addResourceIcon(root,row.icon,x,cy,row.wheel?34:48);
    }
    copy(`— ${row.name}`,106,y+7);y+=68;
  }
  paintRelicPanel(frame,0,0,width,y+16,0x1e211c,RELIC.brass,1);
  root.entries=rows;root.readingHeight=y+16;return root;
}
