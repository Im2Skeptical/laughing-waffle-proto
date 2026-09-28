import { getChronicleTexture, getResourceTexture, getStockTraitTexture } from './chronicle-art.js';
import { getStoneTexture } from './chronicle-skin.js';
import { addResourceIcon } from './resource-cost-pixi.js';
import { createText } from './settlement-view-primitives.js';
import { TEXT_STYLES } from './settlement-theme.js';

const INK = 0xf5e2ad;

function numeral(parent, value, x, y, size = 22, maxWidth = Infinity) {
  const text = createText(String(value), { ...TEXT_STYLES.chip, fontSize:size, fill:INK, stroke:0x221b14, strokeThickness:3 }, x, y, .5, .5);
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

function seasonIcon(parent, season, x, y, size) {
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
  const traits=face.stockTraits ?? [], size=25, counterWidth=Math.max(39,String(face.stock).length*13+String(face.stockCapacity).length*8+10);
  const columns=Math.max(1,Math.floor((w-counterWidth-8)/size));
  const rows=Math.max(1,Math.ceil(traits.length/columns));
  const width=Math.min(w,Math.min(columns,traits.length)*size+counterWidth+8), height=rows*size+5;
  const x=w-width;
  plate(parent,x,0,width,height);
  traits.forEach((trait,i)=>{
    const tx=x+4+(i%columns)*size, ty=3+Math.floor(i/columns)*size;
    recess(parent,tx,ty,size-2);traitIcon(parent,trait,tx+1,ty+1,size-4);
  });
  const cx=w-counterWidth/2-2, cy=height/2;
  fittedSprite(parent,getResourceTexture('stock'),cx-counterWidth/2,0,counterWidth,height);
  // Different sizes preserve the current / capacity hierarchy of the mockup.
  const count=new PIXI.Container();
  const current=numeral(count,face.stock,0,0,25);
  const capacity=numeral(count,`/${face.stockCapacity}`,current.width/2+2,4,15);
  capacity.anchor.x=0;
  const bounds=count.getLocalBounds(), scale=Math.min(1,(counterWidth-3)/bounds.width);
  count.scale.set(scale);count.position.set(cx-(bounds.x+bounds.width/2)*scale,cy);
  parent.addChild(count);
  return {x,y:0,width,height};
}

function workerDock(parent, face, w, h) {
  if (!(face.workerCapacity > 0)) return null;
  const width=Math.max(34,String(face.workerMultiplier??1).length*6+13), x=w-width;
  const y=h-31, pitch=18, socketWidth=20;
  const slots=face.workerCapacity;
  const height=slots*pitch+5;
  plate(parent,w-socketWidth-5,y-height+3,socketWidth,height,true);
  const g=new PIXI.Graphics();
  for(let i=0;i<slots;i++) {
    const cy=y-7-i*pitch, occupied=i<(face.workers??0), cx=w-socketWidth/2-5;
    g.lineStyle(1,occupied?0xf6dda1:0x777b75).beginFill(occupied?0xcdb784:0x1a2020);
    g.drawCircle(cx,cy-4,3.1).drawRoundedRect(cx-4.5,cy-.5,9,8,2).endFill();
  }
  g.eventMode='none';parent.addChild(g);
  plate(parent,x,y,width,31,true);
  numeral(parent,`×${face.workerMultiplier??1}`,x+width/2,y+16,21,width-5);
  return {x,y:y-height+3,width,height:height+28};
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

export function addPieceFaceChrome(parent, face, w, h, {time=0,reducedMotion=false}={}) {
  const stock=stockTray(parent,face,w);
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
        else addResourceIcon(parent,row.icon,end-yieldWidth+13,cy,21);
      }
      numeral(parent,row.value,end-yieldWidth+(showIcons?yieldWidth*.72:yieldWidth/2),cy,24,yieldWidth-(showIcons?25:5));
    });
  }
  const inputs=inputTray(parent,face.inputs??[],Math.max(30,sourceX-sourceSize/2+3),h);
  if(face.lane) {
    const cy=h-19, radius=sourceSize/2, charge=face.lane==='charge';
    const fill=Math.max(0,Math.min(1,face.fill??0));
    const rim=fittedSprite(parent,getResourceTexture(face.source?.icon==='season'?'solar-wheel':'moon-wheel'),sourceX-radius,cy-radius,sourceSize,sourceSize);
    if(rim){rim.anchor.set(.5);rim.position.set(sourceX,cy);if(!charge&&!reducedMotion)rim.rotation=Math.PI*2*fill;}
    const dial=new PIXI.Graphics().lineStyle(1,0xa18950).beginFill(0x101c1b,.96).drawCircle(sourceX,cy,radius-5).endFill();
    if(fill>0)dial.lineStyle(2,charge?0x84d6d0:0xe9cc83).arc(sourceX,cy,radius-4,-Math.PI/2,-Math.PI/2+Math.PI*2*fill);
    dial.eventMode='none';parent.addChild(dial);
    const icon=face.source?.icon==='season'?'year':face.source?.icon==='passive'?'activation':face.source?.icon;
    addResourceIcon(parent,icon,sourceX,cy,23);
    if(face.source?.spark)addResourceIcon(parent,'activation',sourceX+10,cy+9,10);
    if(face.source?.missing)parent.addChild(new PIXI.Graphics().lineStyle(2,0xda8772).moveTo(sourceX-9,cy-9).lineTo(sourceX+9,cy+9));
    if(charge) {
      const chargeBar=new PIXI.Graphics().beginFill(0x101e20).drawRect(sourceX-11,h-5,22,3).endFill();
      chargeBar.beginFill(0x84d6d0).drawRect(sourceX-11,h-5,22*fill,3).endFill();parent.addChild(chargeBar);
    }
  }
  const age=face.activationAge==null?null:face.activationAge+Math.max(0,time-(face.viewedTime??time));
  const pulse=!reducedMotion&&age!=null?Math.max(0,1-age/1.25):0;
  if(pulse && yields)parent.addChild(new PIXI.Graphics().lineStyle(2,0xffe4a0,pulse).drawRoundedRect(yields.x+1,yields.y+1,yields.width-2,yields.height-2,3));
  return {stock,workers,inputs,yields};
}
