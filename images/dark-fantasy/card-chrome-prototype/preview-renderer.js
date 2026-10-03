import { addSettlementPiece } from '../../../src/views/settlement-piece-pixi.js';
import { preloadChronicleArt } from '../../../src/views/chronicle-art.js';
import { assembleCard } from './renderer.js';

export const loadSourceCardAssets = () => preloadChronicleArt({ includeSettlementPieces: true });

// Both treatments receive the very same presentation face and picture rectangle.
// Prototype ornaments may extend beyond it, just as they do in the workbench.
export function addPreviewCard(parent, face, rect, graphics = 'prototype') {
  if (graphics === 'source') return addSettlementPiece(parent, rect, { face, time: 0, reducedMotion: true });
  const card = assembleCard(face);
  const scale = Math.min(rect.width / 300, rect.height / 420);
  card.scale.set(scale);
  card.position.set(rect.x + (rect.width - 300 * scale) / 2, rect.y + (rect.height - 420 * scale) / 2);
  parent.addChild(card); return card;
}
