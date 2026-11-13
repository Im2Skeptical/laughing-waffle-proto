import { addSettlementPiece, addConstructionStrip } from '../settlement-piece-pixi.js';
import { TABLEAU } from './constants.js';
import { addMultiplierFitting, addMultiplierCompletionBadge } from '../multiplier-fitting.js';
import { multiplierTooltip } from '../multiplier-breakdown.js';
import { createText } from '../settlement-view-primitives.js';
import { TEXT_STYLES } from '../settlement-theme.js';
import { addResourceAmount } from '../resource-cost-pixi.js';
import { button } from './cards.js';

// Board and discard share physical faces. Frames remain visible around occupied
// cards, so both empty targets and the selected replacement read as slots.
export function renderDecisionTableau(parent, settlement, {
  time = 0, readOnly = false, choosing = false, onChoose, onInspect, onHover,
  onOut, onDrag, onUpgrade, onUnlock, onUndoUnlock, preview = false, targetIndex = null, tooltipView, practiceDragProgress = 0,
} = {}) {
  const layer = new PIXI.Container();
  parent.addChild(layer);
  const roots = [], discardRoots = [];
  for (let index = 0; index < 5; index++) {
    const piece = settlement.practices[index];
    const unlock = settlement.practiceSlotUnlocks?.find(u=>u.index===index);
    const locked = index >= (settlement.unlockedPracticeSlots ?? 5);
    const x = TABLEAU.x + index * (TABLEAU.cardWidth + TABLEAU.gap);
    const highlighted = choosing && !locked || index === targetIndex;
    const slot = new PIXI.Graphics().lineStyle(highlighted ? 4 : 2,
      highlighted ? 0xb7e3d7 : 0x887452, .95)
      .beginFill(0x101815, .9).drawRoundedRect(x - 4, TABLEAU.practiceY - 14,
        TABLEAU.cardWidth + 8, TABLEAU.cardHeight + 22, 6).endFill();
    slot.eventMode = choosing && !locked ? 'static' : 'none';
    slot.cursor = choosing && !locked ? 'pointer' : 'default';
    slot.on('pointertap', event => {event.stopPropagation(); onChoose?.(index, piece);});
    layer.addChild(slot);
    const card = addSettlementPiece(layer, {x, y:TABLEAU.practiceY, width:TABLEAU.cardWidth, height:TABLEAU.cardHeight}, {
      face:piece?.presentation, empty:!piece, time,
      state:piece?.upgraded ? 'upgraded' : piece?.staged ? 'staged' : 'confirmed',
      onHover:piece ? () => onHover?.('practice:' + piece.practiceId) : null,
      onOut, onInspect:event => choosing && !locked ? onChoose?.(index, piece)
        : piece && onInspect?.('practice:' + piece.practiceId, piece.presentation, event),
    });
    if (!piece) {
      const {width, height} = card.pieceGeometry;
      if (!locked) card.addChild(new PIXI.Graphics().lineStyle(3, 0x887452, .65)
        .moveTo(width / 2 - 12, height / 2).lineTo(width / 2 + 12, height / 2)
        .moveTo(width / 2, height / 2 - 12).lineTo(width / 2, height / 2 + 12));
      if (unlock) {
        const label = createText(unlock.staged ? 'Space staged' : 'One-time unlock', {...TEXT_STYLES.body, fontSize:18, fill:0xc6b48e},
          width / 2, height - 146, .5, 0);
        label.eventMode = 'none';
        card.addChild(label);
        const enabled=!readOnly && !choosing && (unlock.staged ? unlock.canUndo : unlock.canStage);
        const control=button(card,{x:12,y:height-118,width:width-24,height:94},unlock.staged?'Undo unlock':'Unlock space',enabled,
          ()=>unlock.staged?onUndoUnlock?.(unlock.offerId):onUnlock?.(unlock.offerId),unlock.staged);
        control.children[1].y=24;
        const amount = addResourceAmount(control, 'prestige', `${unlock.prestigeCost}`, {fontSize:28, iconSize:32});
        amount.position.set((width-24-amount.width)/2,49);
        card.unlockControl=control;
        card.accessibleTitle = `Practice space ${index+1}: ${unlock.prestigeCost} Prestige, one-time unlock`;
      }
    }
    if (piece && !readOnly && !choosing) card.on('pointerdown', event => onDrag?.(event, card, piece));
    onUpgrade?.(card, piece);
    roots.push({card, piece});
  }
  // Lift and rotate about each occupied card's centre without moving its slot.
  // These poses belong to this rendered layer and never enter simulation state.
  const poses=roots.flatMap(({card,piece},index)=>piece?[{card,index,x:card.x,y:card.y,
    pivotX:card.pivot.x,pivotY:card.pivot.y,rotation:card.rotation,scaleX:card.scale.x,scaleY:card.scale.y}]:[]);
  layer.setPracticeDragProgress=progress=>{
    const amount=Math.max(0,Math.min(1,progress));
    for(const pose of poses) {
      const {card}=pose;
      const cx=card.pieceGeometry.width/2,cy=card.pieceGeometry.height/2;
      card.pivot.set(amount?cx:pose.pivotX,amount?cy:pose.pivotY);
      card.position.set(pose.x+(amount?(cx-pose.pivotX)*pose.scaleX:0),
        pose.y+(amount?(cy-pose.pivotY)*pose.scaleY:0));
      card.rotation=pose.rotation+(pose.index%2?1:-1)*Math.PI/60*amount;
      card.scale.set(pose.scaleX*(1+.025*amount),pose.scaleY*(1+.025*amount));
    }
  };
  layer.practiceDragRotations=()=>poses.map(({card})=>card.rotation);
  layer.practiceDragScales=()=>poses.map(({card,scaleX})=>card.scale.x/scaleX);
  layer.setPracticeDragProgress(practiceDragProgress);
  const pools=settlement.multiplierPreview;
  const poolFittings=[];
  if(pools) {
    for(const row of pools.rows) {
      const x=TABLEAU.x+row.index*(TABLEAU.cardWidth+TABLEAU.gap), w=TABLEAU.cardWidth/2;
      for(const [offset,kind] of ['output','capacity'].entries()) {
        const changed=row.before && row.before[kind].multiplier!==row[kind].multiplier;
        const fitting=addMultiplierFitting(layer,{x:x+offset*w,y:548,width:w,height:50},{kind,multiplier:row[kind].multiplier,
          tooltipView,spec:multiplierTooltip(row,kind,pools)});
        if(changed) {
          const glow=new PIXI.Graphics().lineStyle(3,0xb9e8ae).drawRoundedRect(-2,-2,w+4,52,5);
          glow.eventMode='none';fitting.addChild(glow);
          const delta=row[kind].multiplier-row.before[kind].multiplier;
          const tick=createText(`${delta>0?'↑':'↓'}${Math.abs(delta)}`,{...TEXT_STYLES.chip,fontSize:20,fill:0xc7eebc},w-3,-18,1,0);
          tick.eventMode='none';fitting.addChild(tick);
          if(pools.afterCompletion) {
            addMultiplierCompletionBadge(fitting,w/2,55);
            fitting.hitArea=new PIXI.Rectangle(0,0,w,71);
            fitting.completionPreview=true;
            fitting.accessibleTitle+=' after construction';
          }
        }
        poolFittings.push({kind,practiceId:row.practiceId,root:fitting});
      }
    }
  }
  layer.poolFittings=poolFittings;
  const discard = new PIXI.Graphics().lineStyle(2, 0xb56e5f, .8)
    .beginFill(0x241a18, .85).drawRoundedRect(TABLEAU.discardX - 6, TABLEAU.discardY - 18,
      TABLEAU.discardWidth + 12, 530, 9).endFill();
  // A stack silhouette marks the pile even before the first displacement.
  for (let offset = 12; offset >= 0; offset -= 6) discard.lineStyle(1, 0xb56e5f, .4)
    .drawRoundedRect(TABLEAU.discardX + 30 + offset, TABLEAU.discardY + 86 + offset, 120, 170, 5);
  layer.addChild(discard);
  const discarded = [...(settlement.discardedPractices ?? []), ...(settlement.demolishedStructures ?? [])];
  const fan = Math.min(38, 232 / Math.max(1, discarded.length - 1));
  discarded.forEach((piece, index) => {
    const isPractice = piece.presentation.kind === 'practice';
    const id = isPractice ? 'displaced:' + piece.practiceId : 'structure:' + piece.placementId;
    const card = addSettlementPiece(layer, {x:TABLEAU.discardX,
      y:TABLEAU.discardY + index * fan, width:TABLEAU.discardWidth,
      height:isPractice ? TABLEAU.discardHeight : 150}, {
      face:piece.presentation, time, onInspect:event => onInspect?.(id, piece.presentation, event),
      onHover:() => onHover?.(id), onOut,
    });
    card.addChild(new PIXI.Graphics().lineStyle(3, 0xcd806e, .95)
      .drawRoundedRect(0, 0, card.pieceGeometry.width, card.pieceGeometry.height, 5));
    card.hitArea = new PIXI.Rectangle(0, 0, card.pieceGeometry.width, card.pieceGeometry.height);
    card.discardPeekY = Math.min(18, fan / (2 * card.scale.y));
    if (!readOnly) card.on('pointerdown', event => onDrag?.(event, card, piece));
    discardRoots.push({card, piece});
  });
  addConstructionStrip(layer, {x:TABLEAU.x, y:TABLEAU.structureY, width:TABLEAU.width, height:178}, {
    slots:settlement.structures, capacity:settlement.structureCapacity, displayCapacity:8,
    time,
    onInspect:piece => onInspect?.('structure:' + piece.placementId, piece.presentation),
    onPiece:(card, piece) => {
      card.on('pointerover', event => {if(event.pointerType !== 'touch') onHover?.('structure:' + piece.placementId);});
      card.on('pointerout', () => onOut?.());
      if (!readOnly) card.on('pointerdown', event => onDrag?.(event, card, piece));
      onUpgrade?.(card, piece); roots.push({card, piece});
    },
  });
  if (preview) layer.eventMode = 'none';
  return {layer, roots, discardRoots};
}
