import { getChronicleTexture, getResourceTexture, getStockTraitTexture } from './chronicle-art.js';
import { getStoneTexture } from './chronicle-skin.js';
import { addResourceIcon } from './resource-cost-pixi.js';
import { createText } from './settlement-view-primitives.js';
import { TEXT_STYLES } from './settlement-theme.js';

const INK = 0xf5e2ad;

function numeral(parent, value, x, y, size = 22, maxWidth = Infinity) {
  const text = createText(String(value), { ...TEXT_STYLES.chip, fontSize:size, fill:INK, stroke:0x221b14, strokeThickness:3, trim:true }, x, y, .5, .5);
  text.scale.set(Math.min(1, maxWidth / Math.max(1, text.width)));
  text.eventMode = 'none'; parent.addChild(text); return text;
}

function fittedSprite(parent, texture, x, y, width, height) {
  if (!texture?.baseTexture.valid) return null;
  const node = new PIXI.Sprite(texture);
  node.scale.set(Math.min(width / texture.width, height / texture.height));
  node.position.set(x + (width-node.width)/2, y + (height-node.height)/2);
  node.eventMode = 'none'; parent.addChild(node); return node;
}

// Nine-slicing preserves the painted carving while reducing the visible rim
// to about three pixels. It never reserves a broad decorative strip over art.
export function addPieceRim(parent, w, h) {
  const texture = getChronicleTexture('piece-frames-v1/structure-1.png');
  if (!texture?.baseTexture.valid) return;
  const frame = new PIXI.NineSlicePlane(texture, texture.width*.3, texture.height*.22, texture.width*.3, texture.height*.22);
  const scale = 12 / (texture.width*.3);
  frame.width = w/scale; frame.height = h/scale; frame.scale.set(scale);
  frame.eventMode = 'none'; parent.addChild(frame);
}

function plate(parent, x, y, width, height, silver = false) {
  const g = new PIXI.Graphics();
  g.beginFill(0x090b0c,.8).drawRoundedRect(x,y+1,width,height,5).endFill();
  g.lineStyle(1, silver ? 0x7d827f : 0x8f7447);
  g.beginTextureFill({texture:getStoneTexture(),color:silver ? 0x45494a : 0x292c29});
  g.drawRoundedRect(x+.5,y+.5,width-1,height-1,4).endFill();
  g.lineStyle(1, silver ? 0xc5c9c1 : 0xc2a774,.65).moveTo(x+5,y+2).lineTo(x+width-5,y+2);
  g.lineStyle(1,0x080b0a,.9).moveTo(x+2,y+height-3).lineTo(x+width-3,y+height-3).lineTo(x+width-3,y+5);
  // Small peened rivets and an inset edge, readable even at thumbnail scale.
  g.lineStyle(.5,0x100f0c).beginFill(silver ? 0xa0a59e : 0xb29764);
  for (const px of [x+3,x+width-4]) g.drawCircle(px,y+height/2,1);
  g.endFill(); g.eventMode='none'; parent.addChild(g);
  return {x,y,width,height};
}

function recess(parent, x, y, size, height = size) {
  const g = new PIXI.Graphics().lineStyle(.7,0x686457).beginFill(0x111614,.95);
  g.drawPolygon([x+3,y+1,x+size-3,y,x+size,y+4,x+size-1,y+height-2,x+size-5,y+height,x+1,y+height-3,x,y+5]).endFill();
  g.eventMode='none'; parent.addChild(g);
}

function traitIcon(parent, trait, x, y, size) {
  return fittedSprite(parent,getStockTraitTexture(trait),x,y,size,size) ?? addResourceIcon(parent,'stock',x+size/2,y+size/2,size);
}

export function seasonIcon(parent, season, x, y, size) {
  if (season === 'summer') return addResourceIcon(parent,'year',x,y,size);
  if (season === 'winter') {
    const snow = new PIXI.Graphics().lineStyle(1.5,0xc2d9da);
    for(let i=0;i<6;i++) {
      const a=i*Math.PI/3, c=Math.cos(a), s=Math.sin(a), r=size*.4;
      snow.moveTo(x,y).lineTo(x+c*r,y+s*r);
      for(const sign of [-1,1])snow.moveTo(x+c*r*.6,y+s*r*.6).lineTo(x+c*r*.4-s*r*.22*sign,y+s*r*.4+c*r*.22*sign);
    }
    snow.eventMode='none';parent.addChild(snow);return snow;
  }
  const leaf=traitIcon(parent,'Plant',x-size/2,y-size/2,size);
  if(season==='autumn')leaf.tint=0xe0a05a;
  else leaf.tint=0xbde897;
  return leaf;
}

function stockTray(parent, face, w) {
  if (!(face.stockCapacity > 0)) return null;
  // Three tags plus the counter exactly span a practice card. Raise the extra
  // height above the rim instead of taking more room from the illustration.
  const traits=face.stockTraits ?? [], counterWidth=60, columns=3, y=-12;
  const rows=Math.max(1,Math.ceil(traits.length/columns));
  const size=Math.min((Math.min(w,170)-counterWidth-8)/columns,180/rows);
  const width=Math.min(w,Math.min(columns,traits.length)*size+counterWidth+8), height=rows*size+5;
  const x=w-width;
  plate(parent,x,y,width,height);
  traits.forEach((trait,i)=>{
    const tx=x+4+(i%columns)*size, ty=y+3+Math.floor(i/columns)*size;
    recess(parent,tx,ty,size-2);traitIcon(parent,trait,tx+1,ty+1,size-4);
  });
  const cx=w-counterWidth/2-2, cy=y+height/2;
  fittedSprite(parent,getResourceTexture('stock'),cx-counterWidth/2,y,counterWidth,height);
  // Different sizes preserve the current / capacity hierarchy of the mockup.
  const count=new PIXI.Container();
  const current=numeral(count,face.stock,0,0,36);
  const capacity=numeral(count,`/${face.stockCapacity}`,current.width/2+2,6,20);
  capacity.anchor.x=0;
  const bounds=count.getLocalBounds(), scale=Math.min(1,(counterWidth-3)/bounds.width);
  count.scale.set(scale);count.position.set(cx-(bounds.x+bounds.width/2)*scale,cy);
  parent.addChild(count);
  return {x,y,width,height};
}

function workerDock(parent, face, w, h, left = false) {
  if (!(face.workerCapacity > 0)) return null;
  const width=Math.max(34,String(face.workerMultiplier??1).length*6+13), x=left?0:w-width;
  const y=h-31, pitch=18, socketWidth=20;
  const slots=face.workerCapacity;
  const height=slots*pitch+5;
  const socketX=left?5:w-socketWidth-5;
  plate(parent,socketX,y-height+3,socketWidth,height,true);
  const g=new PIXI.Graphics();
  for(let i=0;i<slots;i++) {
    const cy=y-7-i*pitch, occupied=i<(face.workers??0), cx=socketX+socketWidth/2;
    g.lineStyle(1,occupied?0xf6dda1:0x777b75).beginFill(occupied?0xcdb784:0x1a2020);
    g.drawCircle(cx,cy-4,3.1).drawRoundedRect(cx-4.5,cy-.5,9,8,2).endFill();
  }
  g.eventMode='none';parent.addChild(g);
  plate(parent,x,y,width,31,true);
  numeral(parent,`×${face.workerMultiplier??1}`,x+width/2,y+16,21,width-5);
  return {x,y:y-height+3,width,height:height+28};
}

export function eventIcon(parent, icon, x, y, size) {
  if(!['chaos','monster','defense','support','danger','campaign','challenge','development'].includes(icon))return addResourceIcon(parent,icon,x,y,size);
  const g=new PIXI.Graphics();g.position.set(x-size/2,y-size/2);g.scale.set(size/32);
  g.lineStyle(1.5,0xe3cc94).beginFill(0x293b39);
  if(icon==='chaos') {
    g.drawPolygon([16,1,20,9,28,5,24,14,31,19,22,21,22,30,15,25,7,31,8,22,1,17,10,13,7,4]).endFill();
    g.beginFill(0xad7759).drawCircle(16,17,5).endFill();
  } else if(icon==='monster') {
    g.drawPolygon([6,4,12,9,20,9,27,3,25,18,20,27,12,27,6,18]).endFill();
    g.lineStyle(2,0xdb9274).moveTo(10,15).lineTo(14,17).moveTo(22,15).lineTo(18,17);
    g.lineStyle(1,0xe3cc94).moveTo(12,23).lineTo(16,20).lineTo(20,23);
  } else if(icon==='danger') {
    g.drawPolygon([16,3,30,28,2,28]).endFill();
    numeral(g,'!',16,19,19);
  } else if(icon==='development') {
    g.drawPolygon([16,2,20,12,30,16,20,20,16,30,12,20,2,16,12,12]).endFill();
  } else {
    g.drawPolygon([5,5,16,2,27,5,25,21,16,30,7,21]).endFill();
    if(icon==='support')g.moveTo(10,15).lineTo(22,15).moveTo(16,9).lineTo(16,22);
    else if(icon==='defense')g.moveTo(16,6).lineTo(16,26);
    else {g.moveTo(9,9).lineTo(23,23).moveTo(23,9).lineTo(9,23);if(icon==='campaign')g.drawCircle(16,16,4);}
  }
  g.eventMode='none';parent.addChild(g);return g;
}

function chargeDock(parent, face, w, h, pulse) {
  const workers=workerDock(parent,face,w,h,true), start=workers?.width??0;
  const rows=face.production?.length?face.production:face.outputs??[];
  const showIcons=rows.length>1||rows.some(row=>row.icon!=='stock');
  const yieldWidth=rows.length?Math.max(showIcons?45:34,...rows.map(row=>String(row.value).length*12+(showIcons?23:10))):0;
  const end=w-yieldWidth, y=h-31, height=28;
  let yields=null;
  if(rows.length) {
    yields=plate(parent,end,h-rows.length*27-4,yieldWidth,rows.length*27+4);
    rows.forEach((row,i)=>{
      const cy=yields.y+2+27*(i+.5);
      if(showIcons)eventIcon(parent,row.icon,end+12,cy,20);
      recess(parent,end+(showIcons?24:5),cy-11,yieldWidth-(showIcons?28:10),22);
      numeral(parent,row.value,end+(showIcons?yieldWidth*.75:yieldWidth/2),cy,25,yieldWidth-(showIcons?25:6));
    });
  }
  // One chamber per Charge point, with a shared rail and jeweled dividers.
  // Large custom thresholds group points to keep the gauge legible.
  const x=start, width=end-start, threshold=Math.max(1,face.chargeThreshold??1);
  const segments=Math.min(12,threshold), inset=6, pitch=(width-inset*2)/segments;
  plate(parent,x,y,width,height);
  const g=new PIXI.Graphics(), fill=Math.max(0,Math.min(1,face.fill??0));
  for(let i=0;i<segments;i++) {
    const sx=x+inset+i*pitch, sw=pitch-2, sy=y+5, sh=height-10;
    g.lineStyle(1,0x0a1113).beginTextureFill({texture:getStoneTexture(),color:0x1b2527}).drawRect(sx,sy,sw,sh).endFill();
    const lit=Math.max(0,Math.min(1,fill*segments-i));
    if(lit>0) {
      g.lineStyle(0).beginTextureFill({texture:getStoneTexture(),color:face.blocked?0xa55539:0x137e79}).drawRect(sx,sy,sw*lit,sh).endFill();
      g.beginFill(face.blocked?0xe29d66:0x67e4c7,.3).drawRect(sx+1,sy+2,Math.max(0,sw*lit-2),sh-4).endFill();
      g.lineStyle(.7,face.blocked?0xf6c292:0xb6f2d4,.75).moveTo(sx+1,sy+1).lineTo(sx+sw*lit-1,sy+1);
      // Fixed fissures give the inset enamel a carved, luminous surface.
      if(sw*lit>9)g.lineStyle(.6,0x143e3b,.7).moveTo(sx+sw*.3,sy+3).lineTo(sx+sw*.45,sy+8).lineTo(sx+sw*.25,sy+sh-2);
    }
  }
  for(const ry of [y+2,y+height-3]) {
    g.lineStyle(3,0x38291b).moveTo(x+2,ry+1).lineTo(end-2,ry+1);
    g.lineStyle(1.5,0xb08b4c).moveTo(x+2,ry).lineTo(end-2,ry);
    g.lineStyle(.5,0xf0d595).moveTo(x+3,ry-1).lineTo(end-3,ry-1);
  }
  for(let i=0;i<=segments;i++) {
    const px=x+inset-1+i*pitch;
    g.lineStyle(2.5,0x35291d).moveTo(px,y+3).lineTo(px,y+height-3);
    g.lineStyle(.9,0xb9995a).moveTo(px-.5,y+3).lineTo(px-.5,y+height-3);
    const cy=y+height/2;
    g.lineStyle(.7,0x342315).beginFill(0xc9a764).drawPolygon([px,cy-3,px+2.5,cy,px,cy+3,px-2.5,cy]).endFill();
    g.lineStyle(0).beginFill(0xffe5a5).drawCircle(px-.5,cy-.7,.7).endFill();
  }
  g.eventMode='none';parent.addChild(g);
  if(pulse>0)parent.addChild(new PIXI.Graphics().lineStyle(1.5,0xbbf4de,pulse).drawRoundedRect(x+1,y+1,width-2,height-2,3));
  if(threshold>12)numeral(parent,`${face.charge}/${threshold}`,x+width/2,y+height/2,15,width-12);
  // Triggers sit immediately above the reservoir. They wrap upward, never
  // occupy the worker sockets or the output plate, and have no cost numerals.
  const symbols=face.chargeTriggers??[], cell=27, columns=Math.max(1,Math.floor(width/cell));
  let triggers=null;
  if(symbols.length) {
    const tw=Math.min(columns,symbols.length)*cell+2, th=Math.ceil(symbols.length/columns)*cell+3;
    triggers=plate(parent,x,y-th-2,tw,th);
    symbols.forEach((symbol,i)=>{
      const tx=x+2+(i%columns)*cell, ty=triggers.y+2+Math.floor(i/columns)*cell;
      if(symbol.trait)traitIcon(parent,symbol.trait,tx,ty,24);
      else eventIcon(parent,symbol.icon,tx+12,ty+12,24);
      if(['stockGenerated','stockConsumed'].includes(symbol.event)) {
        const down=symbol.event==='stockConsumed', cx=tx+21, cy=ty+20;
        const arrow=new PIXI.Graphics().lineStyle(2.5,0x101716).moveTo(cx,cy-4).lineTo(cx,cy+3);
        arrow.lineStyle(1,down?0xe6b98c:0xa0e2cb).moveTo(cx,cy-4).lineTo(cx,cy+3);
        arrow.moveTo(cx-3,down?cy:cy-1).lineTo(cx,down?cy+3:cy-4).lineTo(cx+3,down?cy:cy-1);
        arrow.eventMode='none';parent.addChild(arrow);
      }
    });
  }
  return {workers,yields,triggers,charge:{x,y,width,height,segments,threshold,fill},inputs:null};
}

function inputTray(parent, inputs, right, h) {
  if(!inputs.length)return null;
  // Keep alternative traits in one socket: A / B is not two separate costs.
  const groups=inputs.map(input=>({...input,width:Math.max(25,input.traits.length*21+4)}));
  const maxWidth=Math.max(28,right-3), rows=[[]];let used=0;
  for(const group of groups) {
    if(used && used+group.width>maxWidth){rows.push([]);used=0;}
    rows.at(-1).push(group);used+=group.width;
  }
  const width=Math.min(maxWidth,Math.max(...rows.map(row=>row.reduce((sum,g)=>sum+g.width,0))))+2;
  const height=rows.length*29+3, x=Math.max(0,right-width), y=h-height;
  plate(parent,x,y,width,height);
  rows.forEach((row,r)=>{
    const natural=row.reduce((sum,g)=>sum+g.width,0), scale=Math.min(1,(width-2)/natural);
    const groupRoot=new PIXI.Container();groupRoot.position.set(x+1,y+2+r*29);groupRoot.scale.set(scale);let cursor=0;
    row.forEach(input=>{
      recess(groupRoot,cursor+1,0,input.width-2,26);
      input.traits.forEach((trait,i)=>{
        traitIcon(groupRoot,trait,cursor+3+i*21,1,22);
        if(i)numeral(groupRoot,'/',cursor+2+i*21,12,10);
      });
      const marker=input.kind==='consume'?'−':'◇';
      numeral(groupRoot,`${marker}${input.amount}`,cursor+input.width-7,19,11,input.width-3);
      cursor+=input.width;
    });
    parent.addChild(groupRoot);
  });
  return {x,y,width,height};
}

function structureCapacityTray(parent, face, w, h) {
  if(!face.structureBonuses?.length)return null;
  const tray=new PIXI.Container(), contents=new PIXI.Container(), height=34, inset=4, iconSize=26;
  let width=inset;
  for(const bonus of face.structureBonuses) {
    const symbols=bonus.kind==='stock'&&bonus.traits.length?bonus.traits.map(trait=>({trait})):[{icon:bonus.kind}];
    const symbolsWidth=symbols.length*iconSize;
    const value=createText(`+${Math.round(bonus.amount*100)/100}${bonus.unit??''}`,{...TEXT_STYLES.header,fontSize:23,fill:INK,stroke:0x221b14,strokeThickness:3,trim:true},width+symbolsWidth+5,height/2,0,.5);
    const cellWidth=symbolsWidth+9+Math.ceil(value.width);
    recess(contents,width,inset,cellWidth,height-inset*2);
    if(bonus.kind==='stock') {
      const crate=new PIXI.Graphics().lineStyle(1.25,0xffffff,.95).beginFill(0x0b100d);
      crate.drawPolygon([2,7,19,2,30,8,30,27,13,32,2,25]).endFill();
      const scale=Math.min((value.width+4)/32,(height-4)/32);
      crate.scale.set(scale);crate.position.set(value.x+(value.width-32*scale)/2,(height-32*scale)/2);
      crate.eventMode='none';contents.addChild(crate);
    }
    contents.addChild(value);
    symbols.forEach((symbol,i)=>{
      const x=width+i*iconSize+2;
      if(symbol.trait)traitIcon(contents,symbol.trait,x,(height-iconSize+3)/2,iconSize-3);
      else addResourceIcon(contents,symbol.icon,x+(iconSize-3)/2,height/2,iconSize-3);
    });
    width+=cellWidth+inset;
  }
  plate(tray,0,0,width,height);tray.addChild(contents);
  const scale=Math.min(1,(w-8)/width);
  tray.scale.set(scale);tray.position.set(w-width*scale-3,h-height*scale-2);
  if(face.reading?.active===false)tray.alpha=.55;
  tray.eventMode='none';parent.addChild(tray);
  return {x:tray.x,y:tray.y,width:width*scale,height:height*scale};
}

export function addPieceFaceChrome(parent, face, w, h, {time=0,reducedMotion=false}={}) {
  if(face.kind==='structure')return {capacity:structureCapacityTray(parent,face,w,h)};
  const stock=stockTray(parent,face,w);
  const age=face.activationAge==null?null:face.activationAge+Math.max(0,time-(face.viewedTime??time));
  const pulse=!reducedMotion&&age!=null?Math.max(0,1-age/1.25):0;
  if(face.lane==='charge')return {stock,...chargeDock(parent,face,w,h,pulse)};
  const workers=workerDock(parent,face,w,h);
  const rows=face.production?.length ? face.production : face.outputs ?? [];
  const end=workers?.x ?? w;
  const showIcons=rows.length>1 || !!rows[0]?.season || !face.lane || (rows[0]?.icon && rows[0].icon !== 'stock');
  const widest=Math.max(0,...rows.map(row=>String(row.value).length));
  const yieldWidth=rows.length ? Math.max(showIcons?44:29,widest*12+(showIcons?24:8)) : 0;
  const rowHeight=27, yieldHeight=rows.length*rowHeight+4;
  const sourceSize=face.lane?36:0;
  const sourceX=end-yieldWidth-sourceSize/2;
  let yields=null;
  if(rows.length) {
    yields=plate(parent,end-yieldWidth,h-yieldHeight,yieldWidth,yieldHeight);
    rows.forEach((row,i)=>{
      const cy=h-yieldHeight+2+rowHeight*(i+.5);
      if(showIcons) {
        if(row.season)seasonIcon(parent,row.season,end-yieldWidth+13,cy,21);
        else eventIcon(parent,row.icon,end-yieldWidth+13,cy,21);
      }
      numeral(parent,row.value,end-yieldWidth+(showIcons?yieldWidth*.72:yieldWidth/2),cy,24,yieldWidth-(showIcons?25:5));
    });
  }
  const inputs=inputTray(parent,face.inputs??[],Math.max(30,sourceX-sourceSize/2+3),h);
  let schedule=null;
  if(face.lane) {
    const cy=h-19, radius=sourceSize/2;
    const fill=Math.max(0,Math.min(1,face.fill??0));
    const rim=fittedSprite(parent,getResourceTexture(face.source?.icon==='season'?'solar-wheel':'moon-wheel'),sourceX-radius,cy-radius,sourceSize,sourceSize);
    if(rim){rim.anchor.set(.5);rim.position.set(sourceX,cy);if(!reducedMotion)rim.rotation=Math.PI*2*fill;}
    const dial=new PIXI.Graphics().lineStyle(1,0xa18950).beginFill(0x101c1b,.96).drawCircle(sourceX,cy,radius-5).endFill();
    if(fill>0)dial.lineStyle(2,0xe9cc83).arc(sourceX,cy,radius-4,-Math.PI/2,-Math.PI/2+Math.PI*2*fill);
    dial.eventMode='none';parent.addChild(dial);
    const icon=face.source?.icon==='season'?'year':face.source?.icon==='passive'?'activation':face.source?.icon==='crisis'?'danger':face.source?.icon;
    if(face.nextTrigger?.season)seasonIcon(parent,face.nextTrigger.season,sourceX,cy,23);
    else eventIcon(parent,icon,sourceX,cy,23);
    if(face.source?.spark)addResourceIcon(parent,'activation',sourceX+10,cy+9,10);
    if(face.source?.missing)parent.addChild(new PIXI.Graphics().lineStyle(2,0xda8772).moveTo(sourceX-9,cy-9).lineTo(sourceX+9,cy+9));
    schedule={x:sourceX-radius,y:cy-radius,width:sourceSize,height:sourceSize};
    const additional=face.reviewSchedule?.filter(trigger=>!['spring','summer','autumn','winter',face.source?.icon].includes(trigger))??[];
    if(additional.length) {
      const cell=25,columns=Math.max(1,Math.floor(Math.max(sourceSize,sourceX+radius)/cell));
      const height=Math.ceil(additional.length/columns)*cell, width=Math.min(columns,additional.length)*cell;
      const x=sourceX+radius-width,y=cy-radius-height-2;
      plate(parent,x,y,width,height);
      additional.forEach((trigger,i)=>eventIcon(parent,trigger==='passive'?'activation':trigger==='crisis'?'danger':trigger,x+cell*(i%columns+.5),y+cell*(Math.floor(i/columns)+.5),21));
      schedule={x:Math.min(x,schedule.x),y,width:Math.max(width,sourceSize),height:height+sourceSize+2};
    }
  }
  if(pulse && yields)parent.addChild(new PIXI.Graphics().lineStyle(2,0xffe4a0,pulse).drawRoundedRect(yields.x+1,yields.y+1,yields.width-2,yields.height-2,3));
  return {stock,workers,inputs,yields,schedule};
}
