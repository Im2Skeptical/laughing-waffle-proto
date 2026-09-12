import { addIllustration, getChronicleTexture, getResourceTexture, getArtRevision } from './chronicle-art.js';
import { PIECE_SIZE, fitPiece, constructionGeometry } from './piece-geometry.js';
export { PIECE_SIZE } from './piece-geometry.js';
import { addResourceIcon } from './resource-cost-pixi.js';
import { createText } from './settlement-view-primitives.js';
import { TEXT_STYLES } from './settlement-theme.js';

const QUALITY = { bronze: 0xa47a50, silver: 0xbdc7c7, gold: 0xd9b45d, diamond: 0x92d7dc };

function sprite(parent, texture, x, y, width, height) {
  if (!texture?.baseTexture.valid) return null;
  const node = new PIXI.Sprite(texture);
  const scale=Math.min(width/texture.width,height/texture.height);
  node.scale.set(scale);
  node.position.set(x+(width-node.width)/2,y+(height-node.height)/2);
  node.eventMode = 'none'; parent.addChild(node); return node;
}

// The same physical face is used on offers, the tableau and settlement screens.
// All rules and numeric values arrive from model presentation data.
export function addSettlementPiece(parent, rect, {
  face, empty = false, state = 'confirmed', onInspect, onHover, onOut,
  tooltipView, detail, inspectionSide = 'left', inspectionKey, time = 0, reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, compact = false,
} = {}) {
  const geometry = fitPiece(rect, face?.kind, face?.footprint);
  const root = new PIXI.Container(); root.position.set(geometry.x, geometry.y); root.scale.set(geometry.scale);
  root.pieceGeometry = { kind: face?.kind ?? 'practice', footprint: face?.footprint ?? 1, ...geometry };
  const w = geometry.width, h = geometry.height, border = QUALITY[face?.tier] ?? 0x575348;
  const frame = new PIXI.Graphics();
  frame.beginFill(0x171e1c).lineStyle(empty?2:0, border).drawRoundedRect(0,0,w,h,5).endFill();
  root.addChild(frame);
  if (!empty && face) {
    addIllustration(root, face.definitionId, {x:5,y:5,width:w-10,height:h-10});
    const frameId = face.kind === 'structure' ? `structure-${face.footprint ?? 1}` : face.lane === 'charge' ? 'practice-charge' : 'practice-scheduled';
    sprite(root, getChronicleTexture(`piece-frames-v1/${frameId}.png`), 0, 0, w, h);
    // The illustrated material stays consistent; a small jewel communicates quality.
    root.addChild(new PIXI.Graphics().beginFill(border).lineStyle(1,0xf0dbae).drawPolygon([w-15,h-22,w-10,h-16,w-15,h-10,w-20,h-16]).endFill());
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
    const iconSize = 26;
    if (face.lane) {
      const charge = face.lane === 'charge', tint = charge ? 0x75b9bd : 0xd7aa5c;
      const cx = w/2, cy = h*(charge?.889:.856), radius = 20;
      const disc = charge ? null : sprite(root,getResourceTexture(face.source?.icon === 'season' ? 'solar-wheel' : 'moon-wheel'),cx-radius,cy-radius,radius*2,radius*2);
      if (disc) { disc.anchor.set(.5); disc.position.set(cx,cy); if (!charge && !reducedMotion) disc.rotation=Math.PI*2*(face.fill??0); }
      addResourceIcon(root,face.source?.icon === 'season' ? 'year' : face.source?.icon,cx,cy,20);
      if (face.source?.missing) root.addChild(new PIXI.Graphics().lineStyle(2,0xda8772).moveTo(cx-10,cy-10).lineTo(cx+10,cy+10));
      if (face.source?.spark) addResourceIcon(root,'activation',cx+15,cy+12,12);
      const fill = Math.max(0,Math.min(1,face.fill??0));
      const material = new PIXI.Graphics();
      if(charge) {
        material.beginFill(0x0a1718,.86).drawRoundedRect(28,h-13,w-56,6,3).endFill();
        material.beginFill(tint,.75).drawRoundedRect(28,h-13,(w-56)*fill,6,3).endFill();
        // Viewed timeline time only: pausing and reduced motion hold a legible fill.
        if(!reducedMotion && fill>0) material.beginFill(0xd7ffff,.4).drawRect(28+((time*.25)%1)*Math.max(0,(w-56)*fill-4),h-13,Math.min(4,(w-56)*fill),6).endFill();
      } else if(reducedMotion) material.lineStyle(2,tint,.8).arc(cx,cy,radius,-Math.PI/2,-Math.PI/2+Math.PI*2*Math.max(.02,fill));
      root.addChild(material);
    }
    const outputs = face.outputs ?? [];
    const badges=new PIXI.Container(); let cursor=0;
    outputs.forEach(output=>{
      const value=createText(String(output.value),{...TEXT_STYLES.chip,fontSize:18,fill:0xf4e5c7},cursor+32,14,0,.5);
      const badgeW=Math.max(62,38+value.width);
      badges.addChild(new PIXI.Graphics().beginFill(0x101a17).lineStyle(2,0x9b8258).drawRoundedRect(cursor,0,badgeW,28,4).endFill());
      addResourceIcon(badges,output.icon,cursor+16,14,iconSize);badges.addChild(value);cursor+=badgeW+4;
    });
    if(outputs.length){const scale=Math.min(1,(w-18)/(cursor-4));badges.scale.set(scale);badges.position.set((w-(cursor-4)*scale)/2,-10*scale);root.addChild(badges);}
    if(face.workerCapacity>0) {
      const socket=new PIXI.Graphics(), radius=Math.min(6,(h*.52)/(face.workerCapacity*3));
      for(let i=0;i<face.workerCapacity;i++)socket.lineStyle(2,border).beginFill(i<(face.workers??0)?0xe0be74:0x17201c).drawCircle(5,h*.43+(i-(face.workerCapacity-1)/2)*(radius*2+6),radius).endFill();
      root.addChild(socket);
    }
  }
  root.eventMode = 'static';root.cursor = onInspect ? 'pointer' : 'default';
  root.hitArea = new PIXI.Rectangle(0,0,w,h);
  const key=inspectionKey??`piece:${rect.x}:${rect.y}:${face?.definitionId}`;
  const spec={face,inspectionSide,inspectionKey:key,artRevision:getArtRevision(),title:face?.label??'Available space',lines:detail??[face?.rule,...(face?.detailLines??[])].filter(Boolean),accentColor:border,maxWidth:330,scale:3};
  root.on('pointerover',event=>{if(event.pointerType!=='touch'){onHover?.();if(tooltipView)tooltipView.show(spec,root.getBounds(),{dismissOnExit:true});}});
  root.on('pointerout',event=>{if(event.pointerType!=='touch')onOut?.();tooltipView?.hide?.();});
  root.on('pointerdown',event=>{if(!onInspect&&tooltipView){event.stopPropagation();tooltipView.pin(spec,root.getBounds(),inspectionKey??`piece:${rect.x}:${rect.y}:${face?.definitionId}`);}});
  root.on('pointertap',event=>{event.stopPropagation();if(!root.dragConsumed)onInspect?.();root.dragConsumed=false;});
  parent.addChild(root);tooltipView?.refreshPiece?.(spec,root.getBounds());return root;
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
  slots = [], capacity = slots.length, demolished = [], onPiece, onInspect, tooltipView, inspectionSide = 'left', time = 0, compact = false,
} = {}) {
  const geometry=constructionGeometry(rect,capacity);
  rect={...rect,width:geometry.width,height:geometry.height};
  const cell = geometry.cell, roots = [];
  const rail = new PIXI.Graphics().beginFill(0x111815,.8).lineStyle(1,0x60573f).drawRoundedRect(rect.x-4,rect.y-5,rect.width+8,rect.height+10,5).endFill();
  for(let i=0;i<capacity;i++)rail.lineStyle(1,0x60573f,.7).drawRect(rect.x+i*cell,rect.y,cell,rect.height);
  parent.addChild(rail);
  const add = (piece,state) => {
    const face = piece.face ?? piece.presentation;
    const card=addSettlementPiece(parent,{x:rect.x+piece.origin*cell,y:rect.y,width:piece.width*cell,height:rect.height},{face,state,tooltipView,inspectionSide,time,compact,onInspect:onInspect?()=>onInspect(piece):undefined});
    if(state!=='demolished'){roots.push(card);onPiece?.(card,piece);}
  };
  demolished.forEach(piece=>add(piece,'demolished'));
  slots.filter(Boolean).forEach(piece=>add(piece,piece.upgraded?'upgraded':piece.staged?'staged':'confirmed'));
  return roots;
}
