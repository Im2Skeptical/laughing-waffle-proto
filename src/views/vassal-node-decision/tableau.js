import { addSettlementPiece, addConstructionStrip } from '../settlement-piece-pixi.js';
import { TABLEAU } from './constants.js';

// Board and discard share physical faces. Frames remain visible around occupied
// cards, so both empty targets and the selected replacement read as slots.
export function renderDecisionTableau(parent, settlement, {
  time = 0, readOnly = false, choosing = false, onChoose, onInspect, onHover,
  onOut, onDrag, onUpgrade, preview = false, targetIndex = null,
} = {}) {
  const layer = new PIXI.Container();
  parent.addChild(layer);
  const roots = [], discardRoots = [];
  for (let index = 0; index < 5; index++) {
    const piece = settlement.practices[index];
    const x = TABLEAU.x + index * (TABLEAU.cardWidth + TABLEAU.gap);
    const slot = new PIXI.Graphics().lineStyle(choosing || index === targetIndex ? 4 : 2,
      choosing || index === targetIndex ? 0xb7e3d7 : 0x887452, .95)
      .beginFill(0x101815, .9).drawRoundedRect(x - 4, TABLEAU.practiceY - 14,
        TABLEAU.cardWidth + 8, TABLEAU.cardHeight + 22, 6).endFill();
    slot.eventMode = choosing ? 'static' : 'none';
    slot.cursor = choosing ? 'pointer' : 'default';
    slot.on('pointertap', event => {event.stopPropagation(); onChoose?.(index, piece);});
    layer.addChild(slot);
    const card = addSettlementPiece(layer, {x, y:TABLEAU.practiceY, width:TABLEAU.cardWidth, height:TABLEAU.cardHeight}, {
      face:piece?.presentation, empty:!piece, time,
      state:piece?.upgraded ? 'upgraded' : piece?.staged ? 'staged' : 'confirmed',
      onHover:piece ? () => onHover?.('practice:' + piece.practiceId) : null,
      onOut, onInspect:event => choosing ? onChoose?.(index, piece)
        : piece && onInspect?.('practice:' + piece.practiceId, piece.presentation, event),
    });
    if (!piece) {
      const {width, height} = card.pieceGeometry;
      card.addChild(new PIXI.Graphics().lineStyle(3, 0x887452, .65)
        .moveTo(width / 2 - 12, height / 2).lineTo(width / 2 + 12, height / 2)
        .moveTo(width / 2, height / 2 - 12).lineTo(width / 2, height / 2 + 12));
    }
    if (piece && !readOnly && !choosing) card.on('pointerdown', event => onDrag?.(event, card, piece));
    onUpgrade?.(card, piece);
    roots.push({card, piece});
  }
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
