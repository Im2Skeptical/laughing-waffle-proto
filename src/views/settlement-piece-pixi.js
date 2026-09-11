import { addIllustration } from './chronicle-art.js';
import { addResourceIcon } from './resource-cost-pixi.js';
import { createText } from './settlement-view-primitives.js';
import { TEXT_STYLES } from './settlement-theme.js';

const QUALITY = { bronze: 0xa47a50, silver: 0xbdc7c7, gold: 0xd9b45d, diamond: 0x92d7dc };
export const PIECE_SIZE = Object.freeze({ practiceWidth: 164, practiceHeight: 238, cellWidth: 108, structureHeight: 90, gap: 8 });

// The same physical face is used on offers, the tableau and settlement screens.
// All rules and numeric values arrive from model presentation data.
export function addSettlementPiece(parent, rect, {
  face, empty = false, state = 'confirmed', onInspect, onHover, onOut,
  tooltipView, detail, time = 0, reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, compact = false,
} = {}) {
  const root = new PIXI.Container(); root.position.set(rect.x, rect.y);
  const w = rect.width, h = rect.height, border = QUALITY[face?.tier] ?? 0x575348;
  const frame = new PIXI.Graphics();
  frame.beginFill(0x171e1c).lineStyle(2, border).drawRoundedRect(0,0,w,h,5).endFill();
  root.addChild(frame);
  if (!empty && face) {
    addIllustration(root, face.definitionId, {x:4,y:4,width:w-8,height:h-8});
    if (state === 'demolished' || state === 'displaced' || state === 'withdrawn') {
      root.alpha = state === 'withdrawn' ? .3 : .42;
      const scar = new PIXI.Graphics().lineStyle(3,0x1b1713,.9);
      if (state === 'demolished') scar.moveTo(w*.42,0).lineTo(w*.56,h*.32).lineTo(w*.39,h*.52).lineTo(w*.64,h);
      else scar.moveTo(w*.25,h*.65).lineTo(w*.6,h*.65).lineTo(w*.48,h*.5).moveTo(w*.6,h*.65).lineTo(w*.48,h*.8);
      root.addChild(scar);
    }
    if (state === 'staged' || state === 'upgraded') {
      root.alpha = .82;
      const blueprint = new PIXI.Graphics().beginFill(0x659ca4,.15).drawRect(3,3,w-6,h-6).endFill();
      blueprint.lineStyle(state === 'upgraded' ? 4 : 2,0xb7e3d7,.9);
      for(let x=0;x<w;x+=18) blueprint.moveTo(x,0).lineTo(Math.min(x+10,w),0).moveTo(x,h).lineTo(Math.min(x+10,w),h);
      if (state === 'upgraded') blueprint.moveTo(w-28,h-18).lineTo(w-18,h-30).lineTo(w-8,h-18);
      root.addChild(blueprint);
    }
    const iconSize = Math.min(compact?22:32,h*.24);
    if (face.lane) {
      const charge = face.lane === 'charge', tint = charge ? 0x75b9bd : 0xd7aa5c;
      const lane = new PIXI.Graphics().beginFill(0x111917,.93).lineStyle(1,tint).drawRoundedRect(6,6,iconSize+12,iconSize+12,5).endFill();
      root.addChild(lane);
      addResourceIcon(root,face.source?.icon === 'season' ? 'year' : face.source?.icon,12+iconSize/2,12+iconSize/2,iconSize);
      if (face.source?.missing) root.addChild(new PIXI.Graphics().lineStyle(3,0xda8772).moveTo(10,10).lineTo(iconSize+14,iconSize+14));
      if (face.source?.spark) addResourceIcon(root,'activation',iconSize+15,iconSize+12,iconSize*.6);
      const fill = Math.max(0,Math.min(1,face.fill??0));
      const material = new PIXI.Graphics();
      if(charge) {
        material.beginFill(0x0a1718,.86).drawRect(5,h-10,w-10,5).endFill();
        material.beginFill(tint,.75).drawRect(5,h-10,(w-10)*fill,5).endFill();
        // Viewed timeline time only: pausing and reduced motion hold a legible fill.
        if(!reducedMotion && fill>0) material.beginFill(0xd7ffff,.4).drawRect(5+((time*.25)%1)*(w-10)*fill,h-10,Math.min(8,(w-10)*fill),5).endFill();
      } else material.lineStyle(2,tint,.8).arc(12+iconSize/2,12+iconSize/2,iconSize/2+5,-Math.PI/2,-Math.PI/2+Math.PI*2*Math.max(.02,fill));
      root.addChild(material);
    }
    const outputs = face.outputs ?? [];
    outputs.forEach((output,index)=>{
      const badgeW=Math.min(w-12,Math.max(54,iconSize*2.5)), y=(face.lane?iconSize+26:8)+index*(iconSize+5);
      const badge=new PIXI.Graphics().beginFill(0x101a17,.9).lineStyle(1,border,.65).drawRoundedRect(w-badgeW-6,y,badgeW,iconSize+2,3).endFill();
      root.addChild(badge);addResourceIcon(root,output.icon,w-badgeW+iconSize/2-2,y+iconSize/2+1,iconSize);
      root.addChild(createText(String(output.value),{...TEXT_STYLES.chip,fontSize:iconSize*.64,fill:0xf4e5c7},w-10,y+iconSize/2+1,1,.5));
    });
    if(face.workerCapacity>0) {
      const socket=new PIXI.Graphics(), radius=Math.min(7,(w-16)/(face.workerCapacity*3));
      for(let i=0;i<face.workerCapacity;i++)socket.lineStyle(1,border).beginFill(i<(face.workers??0)?0xe0be74:0x17201c).drawCircle(w/2+(i-(face.workerCapacity-1)/2)*(radius*2+5),h-23,radius).endFill();
      root.addChild(socket);
    }
  }
  root.eventMode = 'static';root.cursor = onInspect ? 'pointer' : 'default';
  root.hitArea = new PIXI.Rectangle(0,0,w,h);
  const spec={title:face?.label??'Available construction space',lines:detail??[face?.rule,...(face?.detailLines??[])].filter(Boolean),accentColor:border,maxWidth:330,scale:3};
  root.on('pointerover',event=>{if(event.pointerType!=='touch'){onHover?.();if(tooltipView)tooltipView.show(spec,root.getBounds(),{dismissOnExit:true});}});
  root.on('pointerout',event=>{if(event.pointerType!=='touch')onOut?.();tooltipView?.hide?.();});
  root.on('pointerdown',event=>{if(!onInspect&&tooltipView){event.stopPropagation();tooltipView.pin(spec,root.getBounds(),`piece:${rect.x}:${rect.y}:${face?.definitionId}`);}});
  root.on('pointertap',event=>{event.stopPropagation();if(!root.dragConsumed)onInspect?.();root.dragConsumed=false;});
  parent.addChild(root);return root;
}

// A short quality crossfade is a local input response; it never changes game
// time and never runs when browsing a recorded/future settlement.
export function animatePieceUpgrade(card, previousFace) {
  if (!previousFace || globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const previous = addSettlementPiece(card, { x: 0, y: 0, width: card.hitArea.width, height: card.hitArea.height }, { face: previousFace });
  previous.eventMode = 'none';
  let elapsed = 0;
  const tick = () => {
    if (card.destroyed || previous.destroyed) { PIXI.Ticker.shared.remove(tick); return; }
    elapsed += PIXI.Ticker.shared.deltaMS;
    previous.alpha = Math.max(0, 1 - elapsed / 550);
    if (elapsed >= 550) { PIXI.Ticker.shared.remove(tick); previous.destroy({children:true}); }
  };
  PIXI.Ticker.shared.add(tick);
}

export function addConstructionStrip(parent, rect, {
  slots = [], capacity = slots.length, demolished = [], onPiece, onInspect, tooltipView, time = 0, compact = false,
} = {}) {
  const cell = rect.width / Math.max(1,capacity), roots = [];
  const rail = new PIXI.Graphics().beginFill(0x111815,.8).lineStyle(1,0x60573f).drawRoundedRect(rect.x-4,rect.y-5,rect.width+8,rect.height+10,5).endFill();
  for(let i=0;i<capacity;i++)rail.lineStyle(1,0x60573f,.7).drawRect(rect.x+i*cell+2,rect.y+2,cell-4,rect.height-4);
  parent.addChild(rail);
  const add = (piece,state) => {
    const face = piece.face ?? piece.presentation;
    const card=addSettlementPiece(parent,{x:rect.x+piece.origin*cell+2,y:rect.y,width:piece.width*cell-4,height:rect.height},{face,state,tooltipView,time,compact,onInspect:onInspect?()=>onInspect(piece):undefined});
    if(state!=='demolished'){roots.push(card);onPiece?.(card,piece);}
  };
  demolished.forEach(piece=>add(piece,'demolished'));
  slots.filter(Boolean).forEach(piece=>add(piece,piece.upgraded?'upgraded':piece.staged?'staged':'confirmed'));
  return roots;
}
