import { addIllustration, getArtRevision } from './chronicle-art.js';
import { addPieceRim, addPieceFaceChrome } from './piece-face-chrome.js';
import { PIECE_SIZE, fitPiece, constructionGeometry } from './piece-geometry.js';
export { PIECE_SIZE } from './piece-geometry.js';

const QUALITY = { bronze: 0xa47a50, silver: 0xbdc7c7, gold: 0xd9b45d, diamond: 0x92d7dc };

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
    addIllustration(root, face.definitionId, {x:3,y:3,width:w-6,height:h-6});
    if (face.construction) {
      const scaffold = new PIXI.Graphics().beginFill(0x344239,.35).drawRect(3,3,w-6,h-6).endFill();
      // Timber braces and lashings leave the eventual building visible behind it.
      for (const x of [w*.18,w*.7]) {
        scaffold.lineStyle(5,0x302519,.95).moveTo(x,18).lineTo(x,h-38);
        scaffold.lineStyle(2,0xa08455,.85).moveTo(x-1,18).lineTo(x-1,h-38);
        for (const y of [h*.35,h*.62]) {
          scaffold.lineStyle(4,0x392b1a).moveTo(12,y).lineTo(w-12,y);
          scaffold.lineStyle(1,0xc5a571).moveTo(x-5,y-3).lineTo(x+5,y+3).moveTo(x-5,y+2).lineTo(x+5,y+7);
        }
      }
      scaffold.lineStyle(3,0x776044,.8).moveTo(w*.18,h*.62).lineTo(w*.7,20);
      scaffold.eventMode='none';root.addChild(scaffold);
    }
    addPieceRim(root, w, h);
    root.faceSections = addPieceFaceChrome(root, face, w, h, {time, reducedMotion});
    // A small inset jewel identifies quality without widening the picture rim.
    const jewelY = root.faceSections.stock?.x < 12 ? root.faceSections.stock.y + root.faceSections.stock.height + 6 : 10;
    root.addChild(new PIXI.Graphics().beginFill(border).lineStyle(.7,0xf0dbae).drawPolygon([8,jewelY-3,11,jewelY,8,jewelY+3,5,jewelY]).endFill());
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
  }
  root.eventMode = 'static';root.cursor = onInspect || tooltipView ? 'pointer' : 'default';
  const top = Math.min(0, root.faceSections?.stock?.y ?? 0);
  root.hitArea = new PIXI.Rectangle(0,top,w,h-top);
  root.accessibleTitle = face?.label ?? 'Available space';
  const key=inspectionKey??`piece:${rect.x}:${rect.y}:${face?.definitionId}`;
  const spec={face,inspectionSide,inspectionKey:key,artRevision:getArtRevision(),title:face?.label??'Available space',lines:detail??[face?.rule,...(face?.detailLines??[])].filter(Boolean),accentColor:border,maxWidth:330,scale:3};
  root.on('pointerover',event=>{if(event.pointerType!=='touch'){onHover?.();if(tooltipView)tooltipView.show(spec,root.getBounds(),{dismissOnExit:true});}});
  root.on('pointerout',event=>{if(event.pointerType!=='touch')onOut?.();tooltipView?.hide?.();});
  root.on('pointerdown',event=>{if(!onInspect&&tooltipView&&(event.pointerType!=='touch'||!face?.reading)){event.stopPropagation();tooltipView.pin(spec,root.getBounds(),key);}});
  root.on('pointertap',event=>{
    event.stopPropagation();
    if(!root.dragConsumed) {
      if(onInspect)onInspect(event);
      else if(tooltipView&&face?.reading&&event.pointerType==='touch')tooltipView.pin(spec,root.getBounds(),key,{quick:true});
    }
    root.dragConsumed=false;
  });
  parent.addChild(root);tooltipView?.refreshPiece?.(spec,root.getBounds());return root;
}

// A short quality crossfade is a local input response; it never changes game
// time and never runs when browsing a recorded/future settlement.
export function animatePieceUpgrade(card, previousFace) {
  if (!previousFace || globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const previous = addSettlementPiece(card, { x: 0, y: 0, width: card.pieceGeometry.width, height: card.pieceGeometry.height }, { face: previousFace });
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
  slots = [], capacity = slots.length, displayCapacity = capacity, demolished = [], onPiece, onInspect, tooltipView, inspectionSide = 'left', time = 0, compact = false,
} = {}) {
  const geometry=constructionGeometry(rect,Math.max(capacity, displayCapacity));
  rect={...rect,width:geometry.width,height:geometry.height};
  const cell = geometry.cell, roots = [];
  const rail = new PIXI.Graphics().beginFill(0x111815,.8).lineStyle(1,0x60573f).drawRoundedRect(rect.x-4,rect.y-5,rect.width+8,rect.height+10,5).endFill();
  for(let i=0;i<Math.max(capacity, displayCapacity);i++) {
    const x=rect.x+i*cell;
    rail.lineStyle(1,0x60573f,.7).drawRect(x,rect.y,cell,rect.height);
    if(i>=capacity) {
      rail.beginFill(0x090d0c,.9).drawRect(x+2,rect.y+2,cell-4,rect.height-4).endFill();
      rail.lineStyle(2,0x60573f,.45);
      for(let offset=12;offset<rect.height+cell;offset+=22) {
        const startX=Math.max(6,offset-rect.height+6), endX=Math.min(cell-6,offset-6);
        if(endX>startX) rail.moveTo(x+startX,rect.y+offset-startX).lineTo(x+endX,rect.y+offset-endX);
      }
      // A barred cell is unavailable land, not an empty placement target.
      const lock=new PIXI.Graphics().lineStyle(3,0x8c8060,.8);
      lock.drawRoundedRect(x+cell/2-9,rect.y+rect.height/2-18,18,22,8)
        .beginFill(0x514b3b).drawRoundedRect(x+cell/2-14,rect.y+rect.height/2-4,28,22,3).endFill();
      lock.eventMode='static';
      lock.hitArea=new PIXI.Rectangle(x,rect.y,cell,rect.height);
      const spec={title:'Unavailable construction space',lines:[`This region supports ${capacity} of ${displayCapacity} possible construction cells.`]};
      lock.on('pointerover',()=>tooltipView?.show?.(spec,lock.getBounds(),{dismissOnExit:true}));
      lock.on('pointerout',()=>tooltipView?.hide?.());
      lock.on('pointerdown',event=>{event.stopPropagation();tooltipView?.pin?.(spec,lock.getBounds(),`blocked-cell:${i}`);});
      roots.push(lock);
    }
  }
  parent.addChild(rail);
  // Keep blocked-cell affordances above the rail, but outside piece callbacks.
  for(const lock of roots) parent.addChild(lock);
  roots.length=0;
  const add = (piece,state) => {
    const face = piece.face ?? piece.presentation;
    const card=addSettlementPiece(parent,{x:rect.x+piece.origin*cell,y:rect.y,width:piece.width*cell,height:rect.height},{face,state,tooltipView,inspectionSide,time,compact,onInspect:onInspect?()=>onInspect(piece):undefined});
    if(state!=='demolished'){roots.push(card);onPiece?.(card,piece);}
  };
  demolished.forEach(piece=>add(piece,'demolished'));
  slots.filter(Boolean).forEach(piece=>add(piece,piece.upgraded?'upgraded':piece.staged?'staged':'confirmed'));
  return roots;
}
